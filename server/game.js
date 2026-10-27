'use strict';

const crypto = require('crypto');
const { DECKS } = require('./decks');

const LIMITS = { name: 18, answer: 90, password: 32, players: 10 };
const MIN_PLAYERS = 3;
const TARGETS = [5, 7, 10];
const TIMES = [45, 60, 90];
const COLORS = ['#FFB4A2', '#A7C7E7', '#E9D8A6', '#C9B6F2', '#9ED9C8', '#F7C6DD', '#BFD7A5', '#F2C38F', '#B8C0FF', '#F5F0E6'];
const LETTERS = 'АБВГДЕЖЗИК'.split('');
// персонаж игрока — набор маленьких чисел (см. public/avatar.js, там же картинки)
const AVATAR_SPEC = { skin: 8, face: 4, eyes: 8, brows: 6, mouth: 10, hair: 16, hairColor: 10, beard: 6, acc: 10, hat: 12, extra: 6, top: 6, topColor: 8, bg: 8 };

function cleanAvatar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [k, n] of Object.entries(AVATAR_SPEC)) {
    const v = Number(raw[k]);
    out[k] = Number.isInteger(v) && v >= 0 && v < n ? v : 0;
  }
  return out;
}

const TIMING = {
  autoDrawMs: 30000, // судья не тянет вопрос — тянем за него
  resultMs: 9000, // пауза на экране итога раунда
  judgeOfflineMs: 45000, // судья пропал во время выбора
  writeGraceMs: 1200 // небольшая пауза после последнего ответа
};

class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function cleanText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Room {
  constructor({ code, password = '', now = () => Date.now(), rng = Math.random, decks = DECKS, timing = TIMING } = {}) {
    this.code = code;
    this.password = cleanText(password, LIMITS.password);
    this.now = now;
    this.rng = rng;
    this.decks = decks;
    this.timing = timing;
    this.players = new Map();
    this.order = [];
    this.hostId = null;
    this.settings = { deck: 'adult', target: 10, time: 60 };
    this.phase = 'lobby';
    this.round = 0;
    this.judgeId = null;
    this.question = null;
    this.deckPool = { clean: [], adult: [] };
    this.answers = new Map();
    this.cards = [];
    this.redrawUsed = false;
    this.deadline = null;
    this.phaseStarted = this.now();
    this.judgeOfflineSince = null;
    this.result = null;
    this.final = null;
    this.notice = null;
    this.version = 0;
    this.lastActive = this.now();
    this.colorCursor = 0;
    this.listeners = new Set();
    this.events = [];
  }

  // ---------- служебное ----------

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  touch(event) {
    this.version++;
    this.lastActive = this.now();
    if (event) this.events.push(event);
    for (const fn of this.listeners) fn(this);
    this.events = [];
  }

  connected() {
    return this.order.map((id) => this.players.get(id)).filter((p) => p && p.connected);
  }

  checkPassword(password) {
    if (!this.password) return true;
    const a = Buffer.from(cleanText(password, LIMITS.password));
    const b = Buffer.from(this.password);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // ---------- игроки ----------

  addPlayer(rawName, avatar = null) {
    const name = cleanText(rawName, LIMITS.name);
    if (!name) throw new GameError('NAME', 'Введите имя');
    if (this.players.size >= LIMITS.players) throw new GameError('FULL', 'В комнате уже 10 игроков');
    const taken = [...this.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken) throw new GameError('NAME_TAKEN', 'Это имя уже занято в комнате');
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    let color = COLORS.find((c) => !usedColors.has(c)) || COLORS[this.colorCursor++ % COLORS.length];
    const player = {
      id: crypto.randomBytes(6).toString('hex'),
      token: crypto.randomBytes(18).toString('base64url'),
      name,
      color,
      score: 0,
      connected: true,
      joinedRound: this.round,
      avatar: cleanAvatar(avatar),
      voice: 'off'
    };
    this.players.set(player.id, player);
    this.order.push(player.id);
    if (!this.hostId) this.hostId = player.id;
    this.touch({ type: 'joined', id: player.id, name });
    return player;
  }

  byToken(token) {
    for (const p of this.players.values()) if (token && p.token === token) return p;
    return null;
  }

  setConnected(id, connected) {
    const p = this.players.get(id);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    if (!connected) p.voice = 'off';
    if (id === this.judgeId && this.phase === 'judge') {
      this.judgeOfflineSince = connected ? null : this.now();
    }
    if (!connected && id === this.hostId) this.passHost();
    if (connected && !this.connectedHost()) this.hostId = id;
    this.touch({ type: connected ? 'back' : 'away', id });
    if (!connected && this.phase === 'write') this.checkAllAnswered();
  }

  connectedHost() {
    const h = this.players.get(this.hostId);
    return h && h.connected ? h : null;
  }

  passHost() {
    const next = this.connected().find((p) => p.id !== this.hostId);
    if (next) this.hostId = next.id;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    const seat = this.order.indexOf(id);
    this.players.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.answers.delete(id);
    if (this.hostId === id) {
      this.hostId = null;
      const next = this.connected()[0] || this.players.values().next().value;
      if (next) this.hostId = next.id;
    }
    if (this.judgeId === id && ['draw', 'write', 'judge'].includes(this.phase)) {
      // судья ушёл посреди раунда — судит тот, кто сидел следом, раунд переигрываем
      this.judgeId = null;
      for (let s = 0; s < this.order.length; s++) {
        const pid = this.order[(seat + s) % this.order.length];
        if (this.players.get(pid)?.connected) {
          this.judgeId = pid;
          break;
        }
      }
      this.notice = `${p.name} вышел(ла) — раунд переигрываем`;
      this.startRound(true);
      return;
    }
    this.touch({ type: 'left', name: p.name });
    if (this.phase === 'write') this.checkAllAnswered();
  }

  // ---------- персонаж и голос ----------

  setAvatar(id, raw) {
    const p = this.players.get(id);
    if (!p) throw new GameError('GONE', 'Вы не в комнате');
    const a = cleanAvatar(raw);
    if (!a) throw new GameError('BAD', 'Не получилось сохранить персонажа');
    p.avatar = a;
    this.touch({ type: 'avatar', id });
  }

  voiceJoin(id, muted) {
    const p = this.players.get(id);
    if (!p) throw new GameError('GONE', 'Вы не в комнате');
    p.voice = muted ? 'muted' : 'on';
    this.touch({ type: 'voice', id, on: true });
    return this.order.filter((pid) => pid !== id && this.players.get(pid)?.voice !== 'off' && this.players.get(pid)?.connected);
  }

  voiceLeave(id) {
    const p = this.players.get(id);
    if (!p || p.voice === 'off') return;
    p.voice = 'off';
    this.touch({ type: 'voice', id, on: false });
  }

  voiceMute(id, muted) {
    const p = this.players.get(id);
    if (!p || p.voice === 'off') return;
    const next = muted ? 'muted' : 'on';
    if (p.voice === next) return;
    p.voice = next;
    this.touch();
  }

  inVoice(id) {
    const p = this.players.get(id);
    return !!p && p.connected && p.voice !== 'off';
  }

  // ---------- настройки и старт ----------

  requireHost(id) {
    if (id !== this.hostId) throw new GameError('NOT_HOST', 'Это может сделать только хозяин комнаты');
  }

  setSettings(id, patch = {}) {
    this.requireHost(id);
    if (!['lobby', 'final'].includes(this.phase)) throw new GameError('PHASE', 'Настройки меняются только между партиями');
    const next = { ...this.settings };
    if (patch.deck !== undefined) {
      if (!this.decks[patch.deck]) throw new GameError('BAD', 'Нет такой колоды');
      next.deck = patch.deck;
    }
    if (patch.target !== undefined) {
      if (!TARGETS.includes(Number(patch.target))) throw new GameError('BAD', 'Неверное число очков');
      next.target = Number(patch.target);
    }
    if (patch.time !== undefined) {
      if (!TIMES.includes(Number(patch.time))) throw new GameError('BAD', 'Неверное время');
      next.time = Number(patch.time);
    }
    this.settings = next;
    this.touch({ type: 'settings' });
  }

  start(id) {
    this.requireHost(id);
    if (!['lobby', 'final'].includes(this.phase)) throw new GameError('PHASE', 'Партия уже идёт');
    if (this.connected().length < MIN_PLAYERS) throw new GameError('FEW', `Нужно минимум ${MIN_PLAYERS} игрока`);
    for (const p of this.players.values()) p.score = 0;
    this.round = 0;
    this.result = null;
    this.final = null;
    this.notice = null;
    this.judgeId = null;
    this.highlight = null;
    this.startRound();
  }

  // ---------- раунды ----------

  nextJudge() {
    const live = this.order.filter((pid) => this.players.get(pid)?.connected);
    if (!live.length) return null;
    if (!this.judgeId) return live[Math.floor(this.rng() * live.length)];
    const idx = this.order.indexOf(this.judgeId);
    if (idx === -1) return live[0];
    for (let step = 1; step <= this.order.length; step++) {
      const pid = this.order[(idx + step) % this.order.length];
      if (this.players.get(pid)?.connected) return pid;
    }
    return live[0];
  }

  startRound(replay = false) {
    if (this.connected().length < MIN_PLAYERS) {
      this.phase = 'lobby';
      this.deadline = null;
      this.question = null;
      this.answers.clear();
      this.cards = [];
      this.notice = `Осталось меньше ${MIN_PLAYERS} игроков — партия на паузе`;
      this.touch({ type: 'paused' });
      return;
    }
    if (!replay) this.round++;
    if (!replay || !this.judgeId || !this.players.get(this.judgeId)?.connected) this.judgeId = this.nextJudge();
    this.phase = 'draw';
    this.question = null;
    this.answers.clear();
    this.cards = [];
    this.result = null;
    this.redrawUsed = false;
    this.judgeOfflineSince = null;
    this.phaseStarted = this.now();
    this.deadline = this.now() + this.timing.autoDrawMs;
    if (!replay) this.notice = null;
    this.touch({ type: 'round', round: this.round });
  }

  pullQuestion() {
    const deckId = this.settings.deck;
    const all = this.decks[deckId].questions;
    if (!this.deckPool[deckId] || !this.deckPool[deckId].length) {
      this.deckPool[deckId] = shuffle(all.map((_, i) => i), this.rng);
    }
    const idx = this.deckPool[deckId].pop();
    return { no: idx + 1, text: all[idx], deck: deckId };
  }

  draw(id, auto = false) {
    if (this.phase !== 'draw') throw new GameError('PHASE', 'Сейчас не время тянуть вопрос');
    if (!auto && id !== this.judgeId) throw new GameError('NOT_JUDGE', 'Вопрос тянет судья раунда');
    this.question = this.pullQuestion();
    this.phase = 'write';
    this.phaseStarted = this.now();
    this.deadline = this.now() + this.settings.time * 1000;
    this.notice = null;
    this.touch({ type: 'drawn', auto });
  }

  redraw(id) {
    if (this.phase !== 'write') throw new GameError('PHASE', 'Сейчас нельзя сменить вопрос');
    if (id !== this.judgeId) throw new GameError('NOT_JUDGE', 'Сменить вопрос может только судья');
    if (this.redrawUsed) throw new GameError('USED', 'Вопрос уже меняли в этом раунде');
    if (this.answers.size) throw new GameError('LATE', 'Кто-то уже ответил — менять поздно');
    this.redrawUsed = true;
    this.question = this.pullQuestion();
    this.deadline = this.now() + this.settings.time * 1000;
    this.touch({ type: 'redrawn' });
  }

  writers() {
    return this.connected().filter((p) => p.id !== this.judgeId);
  }

  submit(id, rawText) {
    if (this.phase !== 'write') throw new GameError('PHASE', 'Время ответов вышло');
    if (id === this.judgeId) throw new GameError('JUDGE', 'Судья в этом раунде не отвечает');
    if (!this.players.has(id)) throw new GameError('GONE', 'Вы не в комнате');
    const text = cleanText(rawText, LIMITS.answer);
    if (!text) throw new GameError('EMPTY', 'Напишите ответ');
    this.answers.set(id, { text, at: this.now() });
    this.touch({ type: 'answered', id });
    this.checkAllAnswered();
  }

  retract(id) {
    if (this.phase !== 'write') throw new GameError('PHASE', 'Время ответов вышло');
    if (!this.answers.has(id)) return;
    this.answers.delete(id);
    this.touch({ type: 'retracted', id });
  }

  checkAllAnswered() {
    if (this.phase !== 'write') return;
    const writers = this.writers();
    if (writers.length && writers.every((p) => this.answers.has(p.id))) {
      // все ответили — даём карточке долететь до стола
      this.deadline = Math.min(this.deadline, this.now() + this.timing.writeGraceMs);
      this.touch();
    }
  }

  openJudging() {
    const entries = [...this.answers.entries()].filter(([pid]) => this.players.has(pid));
    if (!entries.length) {
      this.phase = 'result';
      this.cards = [];
      this.result = { winnerId: null, empty: true };
      this.deadline = this.now() + this.timing.resultMs;
      this.touch({ type: 'empty' });
      return;
    }
    this.cards = shuffle(entries, this.rng).map(([pid, a], i) => ({
      letter: LETTERS[i],
      text: a.text,
      authorId: pid,
      flipped: false
    }));
    this.phase = 'judge';
    this.phaseStarted = this.now();
    this.deadline = null;
    const judge = this.players.get(this.judgeId);
    this.judgeOfflineSince = judge && judge.connected ? null : this.now();
    this.touch({ type: 'judging' });
  }

  flip(id, index) {
    if (this.phase !== 'judge') throw new GameError('PHASE', 'Сейчас нечего переворачивать');
    if (id !== this.judgeId) throw new GameError('NOT_JUDGE', 'Карты переворачивает судья');
    const card = this.cards[Number(index)];
    if (!card) throw new GameError('BAD', 'Нет такой карты');
    if (card.flipped) return;
    card.flipped = true;
    this.touch({ type: 'flip', index: Number(index) });
  }

  pick(id, index) {
    if (this.phase !== 'judge') throw new GameError('PHASE', 'Сейчас нельзя выбирать');
    if (id !== this.judgeId) throw new GameError('NOT_JUDGE', 'Выбирает судья раунда');
    const card = this.cards[Number(index)];
    if (!card) throw new GameError('BAD', 'Нет такой карты');
    if (!this.cards.every((c) => c.flipped)) throw new GameError('UNREAD', 'Сначала переверните все карты');
    this.award(Number(index));
  }

  award(index) {
    const card = this.cards[index];
    const winner = this.players.get(card.authorId);
    if (winner) winner.score++;
    this.cards.forEach((c) => (c.flipped = true));
    this.result = {
      winnerId: card.authorId,
      winnerName: winner ? winner.name : 'Игрок ушёл',
      index,
      question: this.question,
      text: card.text
    };
    this.highlight = { question: this.question, text: card.text, author: this.result.winnerName, round: this.round };
    this.phase = 'result';
    this.deadline = this.now() + this.timing.resultMs;
    this.touch({ type: 'picked', winnerId: card.authorId });
  }

  next(id) {
    if (this.phase !== 'result') throw new GameError('PHASE', 'Раунд ещё не закончен');
    if (id !== this.judgeId && id !== this.hostId) throw new GameError('NOT_JUDGE', 'Дальше ведёт судья или хозяин');
    this.advance();
  }

  advance() {
    const champion = [...this.players.values()].find((p) => p.score >= this.settings.target);
    if (champion) {
      this.phase = 'final';
      this.deadline = null;
      this.final = { winnerId: champion.id, winnerName: champion.name, rounds: this.round, highlight: this.highlight };
      this.touch({ type: 'final', winnerId: champion.id });
      return;
    }
    this.startRound();
  }

  kick(id, targetId) {
    this.requireHost(id);
    if (targetId === id) throw new GameError('BAD', 'Себя исключить нельзя');
    if (!this.players.has(targetId)) throw new GameError('BAD', 'Игрок уже ушёл');
    this.removePlayer(targetId);
  }

  toLobby(id) {
    this.requireHost(id);
    this.phase = 'lobby';
    this.deadline = null;
    this.question = null;
    this.cards = [];
    this.answers.clear();
    this.result = null;
    this.final = null;
    this.notice = null;
    for (const p of this.players.values()) p.score = 0;
    this.round = 0;
    this.touch({ type: 'lobby' });
  }

  // ---------- таймеры ----------

  tick() {
    const now = this.now();
    if (this.phase === 'draw' && this.deadline && now >= this.deadline) {
      this.draw(this.judgeId, true);
      return;
    }
    if (this.phase === 'write' && this.deadline && now >= this.deadline) {
      this.openJudging();
      return;
    }
    if (this.phase === 'judge' && this.judgeOfflineSince && now - this.judgeOfflineSince >= this.timing.judgeOfflineMs) {
      this.phase = 'result';
      this.result = { winnerId: null, judgeLost: true };
      this.cards.forEach((c) => (c.flipped = true));
      this.deadline = now + this.timing.resultMs;
      this.notice = 'Судья пропал — раунд без очков';
      this.touch({ type: 'judge-lost' });
      return;
    }
    if (this.phase === 'result' && this.deadline && now >= this.deadline) {
      this.advance();
    }
  }

  // ---------- то, что видит конкретный игрок ----------

  statusOf(p) {
    if (!p.connected) return 'away';
    if (this.phase === 'lobby' || this.phase === 'final') return 'idle';
    if (p.id === this.judgeId) return 'judge';
    if (this.phase === 'write') return this.answers.has(p.id) ? 'ready' : 'writing';
    if (this.phase === 'draw') return 'waiting';
    return 'ready';
  }

  view(forId) {
    const me = this.players.get(forId);
    const revealAuthors = this.phase === 'result' || this.phase === 'final';
    const writers = this.phase === 'write' ? this.writers() : [];
    return {
      t: 'state',
      v: this.version,
      serverNow: this.now(),
      me: forId,
      room: {
        code: this.code,
        hasPassword: !!this.password,
        hostId: this.hostId,
        settings: this.settings,
        phase: this.phase,
        round: this.round,
        judgeId: this.judgeId,
        notice: this.notice,
        minPlayers: MIN_PLAYERS,
        maxPlayers: LIMITS.players,
        decks: Object.values(this.decks).map((d) => ({ id: d.id, title: d.title })),
        targets: TARGETS,
        times: TIMES
      },
      players: this.order
        .map((pid) => this.players.get(pid))
        .filter(Boolean)
        .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected, status: this.statusOf(p), avatar: p.avatar, voice: p.voice })),
      question: this.phase === 'draw' || this.phase === 'lobby' ? null : this.question,
      deadline: this.deadline,
      myAnswer: me && this.answers.has(me.id) ? this.answers.get(me.id).text : null,
      answered: this.phase === 'write' ? writers.filter((p) => this.answers.has(p.id)).length : this.answers.size,
      expected: this.phase === 'write' ? writers.length : this.answers.size,
      redrawAvailable: this.phase === 'write' && !this.redrawUsed && this.answers.size === 0,
      cards: ['judge', 'result'].includes(this.phase)
        ? this.cards.map((c, i) => ({
            index: i,
            letter: c.letter,
            flipped: c.flipped,
            text: c.flipped ? c.text : null,
            mine: !!me && c.authorId === me.id && (revealAuthors || c.flipped),
            authorId: revealAuthors ? c.authorId : null,
            authorName: revealAuthors ? this.players.get(c.authorId)?.name || 'ушёл' : null
          }))
        : [],
      result: this.result,
      final: this.final,
      events: this.events.slice()
    };
  }
}

function makeCode(existing, rng = Math.random) {
  for (let i = 0; i < 2000; i++) {
    const code = String(1000 + Math.floor(rng() * 9000));
    if (!existing.has(code)) return code;
  }
  throw new GameError('BUSY', 'Сервер переполнен, попробуйте позже');
}

module.exports = { Room, GameError, makeCode, cleanText, cleanAvatar, AVATAR_SPEC, LIMITS, MIN_PLAYERS, TARGETS, TIMES, TIMING };
