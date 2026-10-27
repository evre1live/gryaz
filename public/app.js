import { Sound } from './sound.js';
import { FX, flyPoint, tilt } from './fx.js';
import { createVoice } from './voice.js';
import { avatarSVG, randomAvatar, normalize, SPEC, GROUPS, LABELS, PALETTES } from './avatar.js';

// =====================================================================
// Утилиты
// =====================================================================

const $ = (sel, root = document) => root.querySelector(sel);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  exit: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H4"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><path d="M12 19h.01"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  micOff: '<path d="M9 9v2a3 3 0 0 0 5.1 2.1"/><path d="M15 9.3V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 11.6 5.3"/><path d="M19 11a7 7 0 0 1-.7 3"/><path d="M12 18v3"/><path d="M3 3l18 18"/>',
  hangup: '<path d="M3 15.5c5.5-5 12.5-5 18 0l-2.4 2.4-3.3-1.5v-2.6a11 11 0 0 0-6.6 0v2.6l-3.3 1.5z"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/>',
  relay: '<path d="M4 12a8 8 0 0 1 13.7-5.6"/><path d="M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 3v4h-4"/><path d="M6 21v-4h4"/>'
};

function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  return el;
}

function icon(name, cls = 'icon') {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return wrap.firstElementChild;
}

function crown() {
  const s = h('span', { class: 'crown', role: 'img', 'aria-label': 'Хозяин комнаты', title: 'Хозяин комнаты' });
  s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 5 7l5 5 2-7 2 7 5-5 2 11z"/></svg>';
  return s;
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).trim().slice(0, 2).toUpperCase();
}

// Персонаж игрока; у старых клиентов без персонажа — инициалы на цветном круге.
function ava(p, cls = '') {
  const el = h('span', { class: `ava ${cls}`.trim(), 'aria-hidden': 'true' });
  if (p.avatar) el.innerHTML = avatarSVG(p.avatar);
  else {
    el.style.background = p.color;
    el.textContent = initials(p.name);
  }
  return el;
}

// Аватарка с кольцом голоса: пульсирует, когда человек говорит, и значком микрофона.
function avaV(p, cls = '') {
  const wrap = h('span', { class: 'ava-wrap', 'data-pid': p.id }, ava(p, cls), h('span', { class: 'voice-ring', 'aria-hidden': 'true' }), h('span', { class: 'voice-wave', 'aria-hidden': 'true' }));
  if (p.voice && p.voice !== 'off') {
    const relay = S.voice && S.voice.viaRelay(p.id);
    wrap.append(
      h(
        'span',
        { class: `mic-badge${p.voice === 'muted' ? ' muted' : ''}`, title: p.voice === 'muted' ? 'Микрофон выключен' : relay ? 'Голос через ретранслятор' : 'В голосовом чате' },
        icon(p.voice === 'muted' ? 'micOff' : relay ? 'relay' : 'mic', 'icon icon-xs')
      )
    );
  }
  return wrap;
}

function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

// Ответ внутри фразы: в середине — со строчной, после кавычки и в начале — как на карте.
function fitAnswer(before, answer) {
  const a = String(answer || '');
  if (a.length < 2 || a[1] !== a[1].toLowerCase()) return a;
  const prev = before.replace(/\s+$/, '').slice(-1);
  if (!prev || '«"(.!?'.includes(prev)) return a;
  return a[0].toLowerCase() + a.slice(1);
}

// Текст вопроса: «___» превращаем в линию; можно подставить ответ.
function questionNodes(text, fill) {
  const parts = String(text).split('___');
  const out = [];
  // кавычки и точка рядом с пропуском не должны отрываться от него при переносе
  let carry = '';
  parts.forEach((part, i) => {
    let body = carry + part;
    carry = '';
    if (i < parts.length - 1) {
      const lead = body.match(/\S*$/)[0];
      body = body.slice(0, body.length - lead.length);
      const next = parts[i + 1];
      const tail = next.match(/^\S*/)[0];
      parts[i + 1] = next.slice(tail.length);
      out.push(body);
      out.push(h('span', { class: 'nowrap' }, lead, fill ? h('q', {}, fitAnswer(body + lead, fill)) : h('span', { class: 'blank', 'aria-label': 'пропуск' }), tail));
    } else out.push(body);
  });
  if (fill && parts.length === 1) out.push(' — ', h('q', {}, fill));
  return out.filter((x) => x !== '');
}

const store = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
};

function toast(message, kind = '') {
  const box = $('#toasts');
  const el = h('div', { class: `toast ${kind}` }, message);
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function announce(text) {
  const sr = $('#sr');
  sr.textContent = '';
  setTimeout(() => (sr.textContent = text), 40);
}

// =====================================================================
// Состояние и сеть
// =====================================================================

const S = {
  ws: null,
  open: false,
  retry: 0,
  state: null,
  prev: null,
  session: store.get('gr.session'),
  name: store.get('gr.name', ''),
  offset: 0,
  screen: null,
  view: null,
  busy: null,
  invite: (new URLSearchParams(location.search).get('room') || '').replace(/\D/g, '').slice(0, 4) || null,
  inviteInfo: null,
  replaced: false,
  seenCards: new Set(),
  hotkeys: null,
  chosen: null,
  lastTick: null,
  avatar: null,
  voice: null,
  pending: null
};

// свой персонаж: сохранён в браузере или придумываем случайного
S.avatar = (() => {
  const saved = store.get('gr.avatar');
  if (saved) return normalize(saved);
  const a = randomAvatar();
  store.set('gr.avatar', a);
  return a;
})();

const serverNow = () => Date.now() + S.offset;
const me = () => S.state && S.state.players.find((p) => p.id === S.state.me);
const playerById = (id) => S.state && S.state.players.find((p) => p.id === id);
const isHost = () => S.state && S.state.room.hostId === S.state.me;
const isJudge = () => S.state && S.state.room.judgeId === S.state.me;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  S.ws = ws;
  ws.addEventListener('open', () => {
    if (S.ws !== ws) return;
    S.open = true;
    S.retry = 0;
    $('#net').hidden = true;
    if (S.session) send({ t: 'resume', ...S.session });
    else if (S.invite) send({ t: 'peek', code: S.invite });
    if (S.view && S.view.refresh) S.view.refresh();
  });
  ws.addEventListener('message', (e) => {
    if (e.data instanceof ArrayBuffer) {
      S.voice && S.voice.onBinary(new Uint8Array(e.data));
      return;
    }
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    onMessage(m);
  });
  ws.addEventListener('close', () => {
    if (S.ws !== ws) return;
    S.open = false;
    S.busy = null;
    if (S.view && S.view.refresh) S.view.refresh();
    if (S.replaced) return;
    if (S.state) $('#net').hidden = false;
    const delay = Math.min(8000, 500 * 2 ** S.retry++);
    setTimeout(connect, delay);
  });
}

function send(msg) {
  if (S.ws && S.ws.readyState === 1) {
    S.ws.send(JSON.stringify(msg));
    return true;
  }
  toast('Нет связи с сервером — переподключаемся', 'error');
  return false;
}

// связь голосового чата с сервером игры
const bus = {
  send: (msg) => send(msg),
  sendBinary: (u8) => {
    if (S.ws && S.ws.readyState === 1 && S.ws.bufferedAmount < 64 * 1024) S.ws.send(u8);
  },
  request: (msg, replyType) =>
    new Promise((resolve) => {
      if (!send(msg)) return resolve({ ok: false, error: 'Нет связи с сервером' });
      const timer = setTimeout(() => {
        S.pending = null;
        resolve({ ok: false, error: 'Сервер не ответил' });
      }, 8000);
      S.pending = { type: replyType, done: (r) => (clearTimeout(timer), (S.pending = null), resolve(r)) };
    })
};

S.voice = createVoice(bus, {
  onChange: (kind) => onVoiceChange(kind),
  onError: (msg) => {
    toast(msg, 'error');
    Sound.play('error');
  }
});

function setUrlRoom(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url.pathname + url.search);
}

function onMessage(m) {
  switch (m.t) {
    case 'joined':
      S.session = { code: m.code, token: m.token };
      store.set('gr.session', S.session);
      S.busy = null;
      S.invite = null;
      setUrlRoom(m.code);
      // после переподключения сервер забыл голосовой чат — заходим в него снова
      if (S.voice && S.voice.state.joined) setTimeout(() => S.voice.rejoin(), 300);
      break;
    case 'voice:joined':
      if (S.pending && S.pending.type === 'voice:joined') S.pending.done(m);
      break;
    case 'voice:signal':
      S.voice && S.voice.onSignal(m);
      break;
    case 'state': {
      S.prev = S.state;
      S.state = m;
      S.offset = m.serverNow - Date.now();
      S.voice && S.voice.sync(m.players);
      render();
      react(m, S.prev);
      break;
    }
    case 'error':
      S.busy = null;
      if (m.for === 'voice' && S.pending) {
        S.pending.done({ ok: false, error: m.message });
        return;
      }
      if (m.for === 'resume') {
        S.session = null;
        store.del('gr.session');
        S.state = null;
        render();
        if (S.invite) send({ t: 'peek', code: S.invite });
        return;
      }
      toast(m.message, 'error');
      Sound.play('error');
      if (S.view && S.view.refresh) S.view.refresh(m);
      break;
    case 'peek':
      S.inviteInfo = m;
      if (!m.exists) {
        toast('Комнаты из приглашения уже нет — создайте новую', 'error');
        S.invite = null;
        setUrlRoom(null);
      }
      if (S.view && S.view.refresh) S.view.refresh();
      break;
    case 'replaced':
      S.replaced = true;
      showReplaced();
      break;
    case 'left':
      if (m.reason === 'kicked') toast('Хозяин исключил вас из комнаты', 'error');
      S.session = null;
      store.del('gr.session');
      S.state = null;
      S.prev = null;
      setUrlRoom(null);
      if (S.voice) S.voice.cleanup();
      render();
      break;
    case 'react':
      floatReaction(m);
      break;
    default:
      break;
  }
}

// Звуки и объявления по событиям сервера.
function react(st, prev) {
  if (!prev) return;
  const myId = st.me;
  for (const ev of st.events || []) {
    switch (ev.type) {
      case 'joined':
        if (ev.id !== myId) Sound.play('join');
        break;
      case 'drawn':
        Sound.play('draw');
        Sound.play('deal', { delay: 0.18 });
        announce(`Вопрос: ${String(st.question?.text || '').replace(/___/g, 'пропуск')}`);
        break;
      case 'redrawn':
        Sound.play('deal');
        announce(`Новый вопрос: ${String(st.question?.text || '').replace(/___/g, 'пропуск')}`);
        break;
      case 'answered':
        if (ev.id !== myId) Sound.play('tap');
        break;
      case 'swapped':
        if (ev.id === myId) Sound.play('shuffle');
        break;
      case 'judging':
        Sound.play('fan');
        break;
      case 'flip': {
        Sound.play('flip');
        const card = document.querySelectorAll('.ans .flip')[ev.index];
        if (card) {
          const r = card.getBoundingClientRect();
          setTimeout(() => FX.splash(r.left + r.width / 2, r.top + r.height / 2, { count: 8, power: 0.6, splat: false }), 320);
        }
        break;
      }
      case 'picked': {
        const winner = st.players.find((p) => p.id === ev.winnerId);
        Sound.play(ev.winnerId === myId ? 'win' : 'point');
        Sound.play('stamp', { delay: 0.35 });
        requestAnimationFrame(() => {
          const card = $('.ans.win .flip');
          const r = card?.getBoundingClientRect();
          if (r) {
            FX.splash(r.left + r.width / 2, r.top + r.height * 0.4, { count: 26, power: 1.2 });
            if (ev.winnerId === myId) FX.burst(r.left + r.width / 2, r.top + 40, 110);
          }
          flyPoint(card, document.querySelector(`.prow[data-pid="${ev.winnerId}"] .score`));
        });
        announce(winner ? `Очко получает ${winner.name}` : 'Очко получает игрок, который ушёл');
        break;
      }
      case 'empty':
      case 'judge-lost':
        Sound.play('sad');
        break;
      case 'final':
        Sound.play('fanfare');
        break;
      case 'round':
        if (st.room.round === 1 && (prev.room.phase === 'lobby' || prev.room.phase === 'final')) Sound.play('shuffle');
        else if (prev.room.phase === 'result') Sound.play('select');
        break;
      case 'voice':
        if (ev.id !== myId) Sound.play(ev.on ? 'voice-on' : 'voice-off', { gain: 0.7 });
        break;
      default:
        break;
    }
  }
}

// =====================================================================
// Рендер экранов
// =====================================================================

function screenFor(st) {
  if (!st) return 'entry';
  const ph = st.room.phase;
  if (ph === 'lobby') return 'lobby';
  if (ph === 'final') return 'final';
  return 'game';
}

function render() {
  const screen = screenFor(S.state);
  if (screen !== S.screen) {
    if (S.view && S.view.destroy) S.view.destroy();
    const root = $('#app');
    root.replaceChildren();
    S.screen = screen;
    S.view = SCREENS[screen]();
    root.append(S.view.el);
    S.view.update(S.state, null);
    window.scrollTo({ top: 0 });
  } else if (S.view) {
    S.view.update(S.state, S.prev);
  }
}

// ---------- общая шапка ----------

function Header() {
  const roomChip = h('button', { class: 'chip chip-btn', type: 'button', title: 'Скопировать приглашение', onclick: copyInvite });
  const roundInfo = h('div', { class: 'round-info' });
  const deckChip = h('span', { class: 'chip chip-cream' });
  const soundBtn = h('button', { class: 'icon-btn', type: 'button', onclick: toggleSound });
  const voiceBtn = h('button', { class: 'icon-btn voice-btn', type: 'button', onclick: toggleVoice });
  const hangBtn = h(
    'button',
    {
      class: 'icon-btn hang-btn',
      type: 'button',
      'aria-label': 'Выйти из голосового чата',
      title: 'Выйти из голосового чата',
      onclick: () => {
        S.voice.leave();
        Sound.play('voice-off');
      }
    },
    icon('hangup')
  );
  const el = h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, h('img', { src: '/wordmark.svg', alt: 'ГРЯЗЬ', class: 'brand-word', width: 116, height: 43 }), roomChip),
    roundInfo,
    h('div', { class: 'top-actions' }, deckChip, h('div', { class: 'voice-ctl', role: 'group', 'aria-label': 'Голосовой чат' }, voiceBtn, hangBtn), soundBtn, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Выйти из комнаты', title: 'Выйти', onclick: confirmLeave }, icon('exit')))
  );
  const paintSound = () => {
    soundBtn.replaceChildren(icon(Sound.muted ? 'mute' : 'sound'));
    soundBtn.setAttribute('aria-label', Sound.muted ? 'Включить звуки игры' : 'Выключить звуки игры');
    soundBtn.setAttribute('aria-pressed', String(!Sound.muted));
  };
  const paintVoice = () => {
    const V = S.voice.state;
    const on = V.joined && !V.muted;
    voiceBtn.classList.toggle('on', on);
    voiceBtn.classList.toggle('muted', V.joined && V.muted);
    voiceBtn.classList.toggle('busy', V.joining);
    voiceBtn.replaceChildren(V.joining ? h('span', { class: 'spin', 'aria-hidden': 'true' }) : icon(on ? 'mic' : 'micOff'));
    const label = !V.joined ? 'Включить голосовой чат' : V.muted ? 'Включить микрофон' : 'Выключить микрофон';
    voiceBtn.setAttribute('aria-label', label);
    voiceBtn.title = label;
    voiceBtn.setAttribute('aria-pressed', String(on));
    hangBtn.hidden = !V.joined;
  };
  paintSound();
  paintVoice();
  return {
    el,
    paintSound,
    paintVoice,
    update(st) {
      fill(roomChip, st.room.hasPassword ? icon('lock', 'icon icon-sm') : null, h('span', { class: 'room-word' }, 'Комната '), st.room.code);
      const deck = st.room.decks.find((d) => d.id === st.room.settings.deck);
      deckChip.textContent = deck ? deck.title : '';
      if (st.room.phase === 'lobby') roundInfo.replaceChildren(h('span', {}, 'Ждём игроков'));
      else roundInfo.replaceChildren(h('b', {}, `Раунд ${st.room.round}`), h('span', {}, `игра до ${st.room.settings.target} ${plural(st.room.settings.target, ['очка', 'очков', 'очков'])}`));
    }
  };
}

async function toggleVoice() {
  const V = S.voice.state;
  Sound.ensure();
  if (V.joining) return;
  if (!V.joined) {
    const r = await S.voice.join();
    if (r.ok) {
      Sound.play('voice-on');
      if (!store.get('gr.voiceHint')) {
        toast('Голосовой чат включён. В наушниках не будет эха');
        store.set('gr.voiceHint', 1);
      }
    }
    return;
  }
  S.voice.setMuted(!V.muted);
  Sound.play(V.muted ? 'voice-off' : 'voice-on', { gain: 0.6 });
}

// кольцо вокруг аватарки следует за громкостью голоса
let voiceLoopOn = false;
function voiceLoop() {
  if (voiceLoopOn) return;
  voiceLoopOn = true;
  let lastFrame = 0;
  const step = (t) => {
    if (!S.voice || !S.voice.state.joined) {
      document.querySelectorAll('.ava-wrap.speaking').forEach((el) => el.classList.remove('speaking'));
      voiceLoopOn = false;
      return;
    }
    if (t - lastFrame > 66) {
      lastFrame = t;
      document.querySelectorAll('.ava-wrap[data-pid]').forEach((el) => {
        const id = el.dataset.pid;
        const speaking = S.voice.isSpeaking(id);
        el.classList.toggle('speaking', speaking);
        const lvl = Math.min(1, S.voice.level(id) * 9);
        el.style.setProperty('--lvl', speaking ? lvl.toFixed(2) : '0');
      });
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function onVoiceChange(kind) {
  if (S.view && S.view.header && S.view.header.paintVoice) S.view.header.paintVoice();
  if (S.voice.state.joined) voiceLoop();
  // значок «через ретранслятор» на аватарке меняется без сообщений сервера
  if (kind === 'state' && S.state && S.view) S.view.update(S.state, S.state);
}

function toggleSound() {
  Sound.setMuted(!Sound.muted);
  if (!Sound.muted) Sound.play('pop');
  if (S.view && S.view.header) S.view.header.paintSound();
}

async function copyInvite() {
  if (!S.state) return;
  const url = `${location.origin}/?room=${S.state.room.code}`;
  const text = `Залетай в ГРЯЗЬ — комната ${S.state.room.code}: ${url}${S.state.room.hasPassword ? '\nПароль скажу отдельно.' : ''}`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: 'ГРЯЗЬ', text });
      return;
    } catch {}
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Приглашение скопировано — отправьте друзьям');
  } catch {
    window.prompt('Скопируйте приглашение:', text);
  }
}

function confirmLeave() {
  const dlg = h(
    'dialog',
    { class: 'modal' },
    h('h2', {}, 'Выйти из комнаты?'),
    h('p', {}, 'Ваши очки пропадут. Вернуться можно по коду комнаты, но уже новым игроком.'),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Остаться'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => {
            dlg.close();
            if (!send({ t: 'leave' })) return;
          }
        },
        'Выйти'
      )
    )
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

function showReplaced() {
  const ov = h(
    'div',
    { class: 'overlay', role: 'dialog', 'aria-modal': 'true' },
    h('h2', {}, 'Игра открыта в другой вкладке'),
    h('p', {}, 'Играть можно только в одной вкладке одновременно.'),
    h(
      'button',
      {
        class: 'btn btn-primary btn-lg',
        type: 'button',
        onclick: () => {
          ov.remove();
          S.replaced = false;
          connect();
        }
      },
      'Играть здесь'
    )
  );
  document.body.append(ov);
}

// ---------- конструктор персонажа ----------

function openAvatarEditor(onSaved) {
  let cfg = { ...S.avatar };
  let tab = GROUPS[0].id;
  const preview = h('div', { class: 'ae-preview-img' });
  const panel = h('div', { class: 'ae-panel', role: 'tabpanel' });
  const tabs = h('div', { class: 'ae-tabs', role: 'tablist', 'aria-label': 'Части персонажа' });
  const paintPreview = (bounce) => {
    preview.innerHTML = avatarSVG(cfg, { title: 'Ваш персонаж' });
    if (bounce) {
      preview.classList.remove('pop');
      void preview.offsetWidth;
      preview.classList.add('pop');
    }
  };
  const set = (key, value) => {
    cfg = { ...cfg, [key]: value };
    Sound.play('select');
    paintPreview(true);
    paintPanel();
  };
  function paintTabs() {
    tabs.replaceChildren(
      ...GROUPS.map((g) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': String(g.id === tab),
            onclick: () => {
              tab = g.id;
              paintTabs();
              paintPanel();
            }
          },
          g.title
        )
      )
    );
  }
  function paintPanel() {
    const group = GROUPS.find((g) => g.id === tab);
    panel.replaceChildren(
      ...group.keys.map((key) => {
        const palette = PALETTES[key];
        const opts = Array.from({ length: SPEC[key] }, (_, i) => {
          const picked = cfg[key] === i;
          if (palette) {
            return h('button', { type: 'button', class: `ae-swatch${picked ? ' on' : ''}`, style: { background: palette[i] }, 'aria-label': `${LABELS[key]} ${i + 1}`, 'aria-pressed': String(picked), onclick: () => set(key, i) });
          }
          const b = h('button', { type: 'button', class: `ae-opt${picked ? ' on' : ''}`, 'aria-label': `${LABELS[key]}: вариант ${i + 1}${i === 0 && ['beard', 'acc', 'hat', 'extra', 'brows'].includes(key) ? ' (без)' : ''}`, 'aria-pressed': String(picked), onclick: () => set(key, i) });
          b.innerHTML = avatarSVG({ ...cfg, [key]: i });
          return b;
        });
        return h('div', { class: 'ae-row' }, h('span', { class: 'ae-label' }, LABELS[key]), h('div', { class: palette ? 'ae-swatches' : 'ae-opts' }, opts));
      })
    );
  }
  const dlg = h(
    'dialog',
    { class: 'modal ae-modal', 'aria-label': 'Конструктор персонажа' },
    h('h2', {}, 'Твой персонаж'),
    h(
      'div',
      { class: 'ae-body' },
      h(
        'div',
        { class: 'ae-preview' },
        preview,
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-sm',
            onclick: () => {
              cfg = randomAvatar();
              Sound.play('deal');
              paintPreview(true);
              paintPanel();
            }
          },
          icon('dice'),
          'Случайный'
        )
      ),
      h('div', { class: 'ae-controls' }, tabs, panel)
    ),
    h(
      'div',
      { class: 'btn-row ae-foot' },
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Отмена'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => {
            S.avatar = normalize(cfg);
            store.set('gr.avatar', S.avatar);
            if (S.state) send({ t: 'avatar', avatar: S.avatar });
            Sound.play('confirm');
            dlg.close();
            onSaved && onSaved(S.avatar);
          }
        },
        'Готово'
      )
    )
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  paintPreview();
  paintTabs();
  paintPanel();
  dlg.showModal();
}

// ---------- экран входа ----------

function EntryScreen() {
  const nameIn = h('input', { type: 'text', id: 'name', maxlength: 18, autocomplete: 'nickname', placeholder: 'Как вас называть', value: S.name || '' });
  const myAva = h('button', { type: 'button', class: 'me-ava', 'aria-label': 'Изменить персонажа', title: 'Изменить персонажа', onclick: () => openAvatarEditor(paintMe) });
  const paintMe = () => {
    myAva.innerHTML = avatarSVG(S.avatar);
    myAva.append(h('span', { class: 'me-ava-edit', 'aria-hidden': 'true' }, icon('pencil', 'icon icon-xs')));
  };
  paintMe();
  const reroll = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': 'Случайный персонаж',
      title: 'Случайный персонаж',
      onclick: () => {
        S.avatar = randomAvatar();
        store.set('gr.avatar', S.avatar);
        Sound.ensure();
        Sound.play('deal');
        paintMe();
        myAva.classList.remove('pop');
        void myAva.offsetWidth;
        myAva.classList.add('pop');
      }
    },
    icon('dice')
  );
  const pwCreate = h('input', { type: 'password', id: 'pw-create', maxlength: 32, autocomplete: 'new-password', placeholder: 'Можно оставить пустым' });
  let deck = store.get('gr.deck', 'adult');
  const deckBtns = [
    ['clean', 'Приличная'],
    ['adult', 'Злая 18+']
  ].map(([id, title]) =>
    h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(deck === id),
        onclick: (e) => {
          deck = id;
          store.set('gr.deck', id);
          deckBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
          Sound.play('select');
        }
      },
      title
    )
  );
  const createBtn = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Создать комнату');
  const codeIn = h('input', { type: 'text', id: 'code', class: 'code', inputmode: 'numeric', maxlength: 4, autocomplete: 'off', placeholder: '0000', value: S.invite || '' });
  const pwJoin = h('input', { type: 'password', id: 'pw-join', maxlength: 32, autocomplete: 'current-password', placeholder: 'Скажет хозяин комнаты' });
  const pwJoinField = h('label', { class: 'field', for: 'pw-join' }, 'Пароль', pwJoin);
  const joinBtn = h('button', { class: 'btn btn-light btn-lg btn-block', type: 'submit' }, 'Войти');
  const inviteNote = h('p', { class: 'invite-note', hidden: true });

  codeIn.addEventListener('input', () => {
    codeIn.value = codeIn.value.replace(/\D/g, '').slice(0, 4);
  });
  nameIn.addEventListener('input', () => {
    S.name = nameIn.value;
    store.set('gr.name', nameIn.value.trim());
  });

  function needName() {
    const name = nameIn.value.trim();
    if (!name) {
      nameIn.focus();
      nameIn.classList.remove('shake');
      void nameIn.offsetWidth;
      nameIn.classList.add('shake');
      toast('Сначала напишите имя', 'error');
      return null;
    }
    store.set('gr.name', name);
    return name;
  }

  const createForm = h(
    'form',
    {
      class: 'panel',
      onsubmit: (e) => {
        e.preventDefault();
        Sound.ensure();
        const name = needName();
        if (!name || S.busy) return;
        if (send({ t: 'create', name, password: pwCreate.value, settings: { deck }, avatar: S.avatar })) {
          S.busy = 'create';
          refresh();
        }
      }
    },
    h('h2', {}, 'Создать комнату'),
    h('label', { class: 'field', for: 'pw-create' }, 'Пароль комнаты', pwCreate),
    h('div', { class: 'field' }, h('span', {}, 'Колода'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Колода' }, deckBtns)),
    createBtn
  );
  const joinForm = h(
    'form',
    {
      class: 'panel',
      onsubmit: (e) => {
        e.preventDefault();
        Sound.ensure();
        const name = needName();
        if (!name || S.busy) return;
        const code = codeIn.value.trim();
        if (code.length !== 4) {
          codeIn.focus();
          toast('Код комнаты — 4 цифры', 'error');
          return;
        }
        if (send({ t: 'join', code, password: pwJoin.value, name, avatar: S.avatar })) {
          S.busy = 'join';
          refresh();
        }
      }
    },
    h('h2', {}, 'Войти по коду'),
    inviteNote,
    h('label', { class: 'field', for: 'code' }, 'Код комнаты', codeIn),
    pwJoinField,
    joinBtn
  );

  const logoSlot = h('div', { class: 'logo-slot' }, h('img', { src: '/logo.svg', alt: 'ГРЯЗЬ', width: 620, height: 187 }));
  fetch('/logo-anim.svg')
    .then((r) => (r.ok ? r.text() : null))
    .then((svg) => {
      if (svg && svg.startsWith('<svg')) logoSlot.innerHTML = svg;
    })
    .catch(() => {});
  const deco = [
    { pos: { left: '-110px', top: '90px' }, rot: -18, w: 200, c: 'var(--red)', d: 0 },
    { pos: { left: '-70px', top: '600px' }, rot: 12, w: 170, c: 'var(--cream)', d: 1 },
    { pos: { right: '-100px', top: '60px' }, rot: 16, w: 190, c: 'var(--cream)', d: 0.5 },
    { pos: { right: '-80px', top: '580px' }, rot: -10, w: 180, c: 'var(--red)', d: 1.5 }
  ].map((d) =>
    h(
      'div',
      { class: 'deco', 'aria-hidden': 'true', style: { ...d.pos, transform: `rotate(${d.rot}deg)` } },
      h('div', { style: { width: d.w + 'px', height: Math.round(d.w * 1.4) + 'px', background: d.c, opacity: '0.85', animationDelay: d.d + 's' } })
    )
  );

  const el = h(
    'main',
    { class: 'screen entry' },
    deco,
    h('div', { class: 'hero' }, logoSlot, h('p', {}, 'Вопросы — из колоды. Ответы — у тебя на руках.')),
    h('div', { class: 'entry-name' }, h('div', { class: 'me-row' }, myAva, h('label', { class: 'field', for: 'name' }, 'Ваше имя', nameIn), reroll)),
    h('div', { class: 'entry-forms' }, createForm, joinForm),
    h(
      'div',
      { class: 'rules', 'aria-label': 'Как играть' },
      h('div', { class: 'rule' }, h('b', {}, '1'), h('span', {}, 'Игроки по очереди тянут вопрос и становятся судьёй раунда.')),
      h('div', { class: 'rule' }, h('b', {}, '2'), h('span', {}, 'У каждого на руках 6 карт с ответами — выбери самую смешную.')),
      h('div', { class: 'rule' }, h('b', {}, '3'), h('span', {}, 'Судья читает ответы без имён и выбирает самый смешной.'))
    ),
    h('p', { class: 'entry-foot' }, 'От 3 до 10 игроков · удобно играть с телефона')
  );

  function refresh() {
    const offline = !S.open;
    createBtn.disabled = offline || !!S.busy;
    joinBtn.disabled = offline || !!S.busy;
    fill(createBtn, S.busy === 'create' ? h('span', { class: 'spin', 'aria-hidden': 'true' }) : null, offline ? 'Подключаемся…' : 'Создать комнату');
    fill(joinBtn, S.busy === 'join' ? h('span', { class: 'spin', 'aria-hidden': 'true' }) : null, offline ? 'Подключаемся…' : 'Войти');
    const inv = S.invite;
    joinForm.classList.toggle('invited', !!inv);
    if (inv && !codeIn.value) codeIn.value = inv;
    if (inv) {
      inviteNote.hidden = false;
      const info = S.inviteInfo && S.inviteInfo.code === inv ? S.inviteInfo : null;
      inviteNote.textContent = info && info.exists ? `Вас позвали в комнату ${inv} — за столом ${info.players} ${plural(info.players, ['игрок', 'игрока', 'игроков'])}` : `Вас позвали в комнату ${inv}`;
      pwJoinField.hidden = !!(info && info.exists && !info.hasPassword);
    } else {
      inviteNote.hidden = true;
      pwJoinField.hidden = false;
    }
  }

  return {
    el,
    refresh,
    update() {
      refresh();
      setTimeout(() => (S.invite && nameIn.value ? (S.inviteInfo?.hasPassword ? pwJoin : joinBtn) : nameIn.value ? null : nameIn)?.focus({ preventScroll: true }), 50);
    }
  };
}

// ---------- лобби ----------

function LobbyScreen() {
  const header = Header();
  const code = h('span', { class: 'code-big' });
  const codeMeta = h('span', { class: 'code-meta' });
  const seats = h('div', { class: 'seats' });
  const seatsTitle = h('h2', { class: 'eyebrow' });
  const notice = h('div', { class: 'notice', hidden: true });
  const deckSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Колода' });
  const targetPills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Играем до' });
  const timePills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Время на выбор карты' });
  const startBtn = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: () => send({ t: 'start' }) }, 'Начать партию');
  const hint = h('p', { class: 'foot-hint' });
  let lastIds = new Set();

  const setting = (key, value) => {
    Sound.play('select');
    send({ t: 'settings', settings: { [key]: value } });
  };

  const el = h(
    'div',
    { class: 'screen' },
    header.el,
    h(
      'div',
      { class: 'lobby-body' },
      h(
        'section',
        { class: 'lobby-main' },
        notice,
        h(
          'div',
          { class: 'code-row' },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, h('span', { class: 'eyebrow' }, 'Код комнаты'), code, codeMeta),
          h('button', { class: 'btn', type: 'button', onclick: copyInvite }, icon('copy'), 'Скопировать приглашение')
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, seatsTitle, seats)
      ),
      h(
        'aside',
        { class: 'panel settings' },
        h('h2', {}, 'Настройки партии'),
        h('div', { class: 'group' }, h('span', {}, 'Колода'), deckSeg),
        h('div', { class: 'group' }, h('span', {}, 'Играем до'), targetPills),
        h('div', { class: 'group' }, h('span', {}, 'Время на выбор карты'), timePills),
        startBtn,
        hint
      )
    )
  );

  return {
    el,
    header,
    update(st) {
      header.update(st);
      const host = isHost();
      code.textContent = st.room.code;
      codeMeta.replaceChildren(icon(st.room.hasPassword ? 'lock' : 'wifi', 'icon icon-sm'), st.room.hasPassword ? 'Вход по паролю' : 'Вход только по коду');
      notice.hidden = !st.room.notice;
      notice.textContent = st.room.notice || '';

      const live = st.players.filter((p) => p.connected).length;
      seatsTitle.textContent = `За столом ${live} из ${st.room.maxPlayers}`;
      const ids = new Set(st.players.map((p) => p.id));
      seats.replaceChildren(
        ...st.players.map((p, i) => {
          const fresh = !lastIds.has(p.id);
          return h(
            'div',
            { class: `seat${p.id === st.me ? ' me' : ''}${p.connected ? '' : ' away'}`, style: { animationDelay: fresh ? `${i * 0.05}s` : '0s', animationDuration: fresh ? null : '1ms' } },
            host && p.id !== st.me ? h('button', { class: 'kick', type: 'button', 'aria-label': `Исключить ${p.name}`, title: 'Исключить', onclick: () => confirmKick(p) }, icon('close', 'icon icon-sm')) : null,
            h('div', { class: 'seat-ava' }, avaV(p, 'ava-lg'), p.id === st.room.hostId ? crown() : null),
            h('span', { class: 'name' }, p.name),
            p.id === st.me
              ? h('button', { type: 'button', class: 'seat-edit', onclick: () => openAvatarEditor() }, icon('pencil', 'icon icon-xs'), 'Изменить персонажа')
              : h('span', { class: 'note' }, p.connected ? (p.id === st.room.hostId ? 'хозяин' : 'за столом') : 'не в сети')
          );
        }),
        ...Array.from({ length: Math.max(0, Math.min(st.room.maxPlayers, Math.max(st.room.minPlayers, st.players.length + 2)) - st.players.length) }, () =>
          h('div', { class: 'seat seat-empty' }, h('span', { class: 'ava ava-lg' }), h('span', {}, 'Свободно'))
        )
      );
      lastIds = ids;

      deckSeg.replaceChildren(...st.room.decks.map((d) => h('button', { type: 'button', 'aria-pressed': String(st.room.settings.deck === d.id), disabled: !host, onclick: () => setting('deck', d.id) }, d.title)));
      targetPills.replaceChildren(...st.room.targets.map((n) => h('button', { type: 'button', 'aria-pressed': String(st.room.settings.target === n), disabled: !host, onclick: () => setting('target', n) }, `${n} ${plural(n, ['очко', 'очка', 'очков'])}`)));
      timePills.replaceChildren(...st.room.times.map((n) => h('button', { type: 'button', 'aria-pressed': String(st.room.settings.time === n), disabled: !host, onclick: () => setting('time', n) }, `${n} с`)));

      startBtn.hidden = !host;
      startBtn.disabled = live < st.room.minPlayers;
      const need = st.room.minPlayers - live;
      if (host) hint.textContent = need > 0 ? `Нужно ещё ${need} ${plural(need, ['игрок', 'игрока', 'игроков'])} — отправьте приглашение` : 'Все в сборе? Жмите «Начать партию»';
      else {
        const hostP = playerById(st.room.hostId);
        hint.textContent = hostP ? `Настройки выбирает ${hostP.name}. Ждём, пока начнёт партию.` : 'Ждём хозяина комнаты';
      }
    }
  };
}

function confirmKick(p) {
  const dlg = h(
    'dialog',
    { class: 'modal' },
    h('h2', {}, `Исключить ${p.name}?`),
    h('p', {}, 'Игрок выйдет из комнаты, его очки пропадут.'),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Отмена'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => {
            dlg.close();
            send({ t: 'kick', id: p.id });
          }
        },
        'Исключить'
      )
    )
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- игра ----------

function Timer() {
  const bar = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const R = 29;
  const C = 2 * Math.PI * R;
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 68 68" aria-hidden="true"><circle class="track" cx="34" cy="34" r="${R}"/></svg>`;
  const svg = wrap.firstElementChild;
  bar.setAttribute('class', 'bar');
  bar.setAttribute('cx', '34');
  bar.setAttribute('cy', '34');
  bar.setAttribute('r', String(R));
  bar.setAttribute('stroke-dasharray', String(C));
  svg.append(bar);
  const num = h('b', {});
  const label = h('span', { class: 'lbl' }, 'осталось');
  const ring = h('div', { class: 'ring', role: 'timer' }, svg, num);
  const el = h('div', { class: 'timer', hidden: true }, label, ring);
  let cfg = null;
  let raf = 0;
  let lastSec = null;
  function frame() {
    raf = 0;
    if (!cfg) return;
    const left = Math.max(0, cfg.deadline - serverNow());
    const frac = Math.min(1, left / cfg.total);
    bar.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
    const sec = Math.ceil(left / 1000);
    num.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    el.classList.toggle('urgent', sec <= 10 && sec > 0);
    document.body.classList.toggle('hurry', !!(cfg.tick && sec <= 5 && sec > 0 && cfg.tick()));
    if (sec !== lastSec) {
      if (sec <= 5 && sec > 0 && cfg.tick && cfg.tick()) Sound.play('tick');
      ring.setAttribute('aria-label', `Осталось ${sec} ${plural(sec, ['секунда', 'секунды', 'секунд'])}`);
      lastSec = sec;
    }
    if (left > 0) raf = requestAnimationFrame(frame);
  }
  return {
    el,
    set(next) {
      cfg = next;
      el.hidden = !next;
      if (!next) document.body.classList.remove('hurry');
      if (next && !raf) raf = requestAnimationFrame(frame);
    },
    stop() {
      cfg = null;
      document.body.classList.remove('hurry');
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

function statusText(p, st) {
  if (!p.connected) return { cls: '', node: 'Не в сети' };
  const ph = st.room.phase;
  if (p.status === 'judge') return { cls: 'judge', node: ph === 'draw' ? 'Тянет вопрос · судья' : 'Судья раунда' };
  if (ph === 'write' && p.status === 'ready') return { cls: 'ready', node: [icon('check', 'icon icon-sm'), 'Карта на столе'] };
  if (ph === 'write') return { cls: '', node: ['Выбирает', h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))] };
  if (ph === 'draw') return { cls: '', node: 'Ждёт вопрос' };
  return { cls: '', node: '' };
}

function PlayersList() {
  const bumpAt = new Map();
  const list = h('div', { class: 'plist' });
  const title = h('h2', { class: 'eyebrow' });
  const el = h('aside', { class: 'players', 'aria-label': 'Игроки' }, title, list);
  return {
    el,
    update(st, prev) {
      title.textContent = `Игроки · ${st.players.length}`;
      const host = isHost();
      list.replaceChildren(
        ...st.players.map((p) => {
          const before = prev && prev.players.find((x) => x.id === p.id);
          if (before && p.score > before.score) bumpAt.set(p.id, Date.now());
          const since = Date.now() - (bumpAt.get(p.id) || 0);
          const bumped = since < 700;
          const s = statusText(p, st);
          return h(
            'div',
            { class: `prow${p.id === st.me ? ' me' : ''}${p.status === 'judge' ? ' judge' : ''}${p.connected ? '' : ' away'}`, 'data-pid': p.id },
            avaV(p),
            h(
              'div',
              { class: 'info' },
              h('span', { class: 'nm' }, p.name, p.id === st.me ? h('small', {}, 'вы') : null),
              h('span', { class: `st ${s.cls}` }, s.node)
            ),
            host && !p.connected && p.id !== st.me ? h('button', { class: 'kick', type: 'button', 'aria-label': `Исключить ${p.name}`, title: 'Исключить', onclick: () => confirmKick(p) }, icon('close', 'icon icon-sm')) : null,
            h('span', { class: `score${bumped ? ' bump' : ''}`, style: bumped ? { animationDelay: `-${since}ms` } : null, 'aria-label': `${p.score} ${plural(p.score, ['очко', 'очка', 'очков'])}` }, String(p.score))
          );
        })
      );
    }
  };
}

function QuestionCard(q, cls = '') {
  return h(
    'article',
    { class: `card qcard ${cls}`.trim(), 'aria-label': 'Вопрос' },
    h('span', { class: 'cap' }, 'Вопрос'),
    h('p', { class: 'qtext' }, questionNodes(q.text)),
    h('div', { class: 'meta' }, h('span', {}, 'ГРЯЗЬ'), h('span', {}, `№ ${String(q.no).padStart(3, '0')}`))
  );
}

// Розыгрыш: колода → вопрос → карта из руки.
function PlayStage() {
  const deck = h('div', { class: 'deck' }, h('div', { class: 'dc' }), h('div', { class: 'dc' }));
  const qslot = tilt(h('div', { class: 'qslot' }, deck));
  const aslot = h('div', { class: 'aslot' });
  const hand = HandZone((id) => onPick(id));
  const el = h('div', { class: 'play' }, qslot, aslot, hand.el);
  let deckTop = null;
  let qKey = null;
  let qFill = null;
  let aKey = null;
  let answerUI = null;
  let sel = null; // карта, которую примеряем к вопросу

  function paintDeck(st) {
    const judge = isJudge() && st.room.phase === 'draw';
    const want = st.room.phase === 'draw' ? (judge ? 'btn' : 'wait') : 'idle';
    if (deckTop && deckTop.dataset.mode === want) return;
    deckTop?.remove();
    if (want === 'btn') {
      deckTop = h(
        'button',
        {
          class: 'dc top',
          type: 'button',
          'data-mode': 'btn',
          onclick: () => {
            Sound.ensure();
            send({ t: 'draw' });
          }
        },
        h('img', { src: '/mark.svg', alt: '' }),
        h('span', {}, 'Тянуть вопрос')
      );
    } else {
      deckTop = h('div', { class: 'dc top', 'data-mode': want }, h('img', { src: '/mark.svg', alt: '' }));
    }
    deck.classList.toggle('waiting', want === 'wait');
    deck.append(deckTop);
    if (st.room.phase === 'draw' && st.room.round === 1 && !deck.dataset.riffled) {
      deck.dataset.riffled = '1';
      deck.classList.add('riffle');
      setTimeout(() => deck.classList.remove('riffle'), 1400);
    }
  }

  // текст карты, которая сейчас стоит в пропуске вопроса
  function fillText(st) {
    const id = sel || st.myCard;
    const c = id && st.myHand.find((x) => x.id === id);
    return c ? c.text : null;
  }

  function paintQuestion(st, prev) {
    const q = st.question;
    const key = q ? `${q.deck}:${q.no}` : null;
    if (key !== qKey) {
      qKey = key;
      qFill = null;
      qslot.querySelector('.qcard')?.remove();
      if (!q) return;
      const fromDeck = prev && (prev.room.phase === 'draw' || (prev.question && prev.question.no !== q.no));
      qslot.append(QuestionCard(q, fromDeck && !reduceMotion ? 'deal' : 'fade'));
    }
    if (!q) return;
    // примеряем выбранную карту прямо в вопрос
    const fill = fillText(st);
    if (fill === qFill) return;
    qFill = fill;
    const qtext = qslot.querySelector('.qtext');
    if (!qtext) return;
    qtext.replaceChildren(...questionNodes(q.text, fill));
    const len = q.text.length + (fill ? fill.length : 0);
    qtext.classList.toggle('len-m', len > 72 && len <= 112);
    qtext.classList.toggle('len-l', len > 112);
    qslot.querySelector('.qcard').classList.toggle('filled', !!fill);
  }

  function place() {
    const st = S.state;
    if (!sel || !st || st.room.phase !== 'write' || isJudge()) return;
    Sound.ensure();
    if (send({ t: 'submit', card: sel })) {
      Sound.play('place');
      const from = aslot.querySelector('.acard') || hand.el.querySelector('.hcard.sel');
      const r = from?.getBoundingClientRect();
      if (r) FX.splash(r.left + r.width / 2, r.top + r.height * 0.6, { count: 16, power: 0.9 });
      sel = null;
    }
  }

  function onPick(id) {
    const st = S.state;
    if (!st) return;
    if (st.room.phase !== 'write' || isJudge()) {
      hand.nudge(id);
      return;
    }
    Sound.ensure();
    if (st.myCard === id) sel = null;
    else if (sel === id) return place();
    else {
      sel = id;
      Sound.play('select');
    }
    repaint(st, null);
  }

  function paintAnswer(st) {
    const ph = st.room.phase;
    const judge = isJudge();
    if (sel && !st.myHand.some((c) => c.id === sel)) sel = null;
    let mode;
    if (ph === 'draw') mode = judge ? 'judge-draw' : 'wait-draw';
    else if (judge) mode = 'judge-write';
    else if (sel && sel !== st.myCard) mode = `preview:${sel}:${st.myCard ? 1 : 0}`;
    else if (st.myCard) mode = `placed:${st.myCard}`;
    else mode = 'empty';
    if (mode !== aKey) {
      aKey = mode;
      const wide = mode.startsWith('judge') || mode === 'wait-draw';
      aslot.className = `aslot${wide ? ' wide' : ''}${mode === 'empty' ? ' is-empty' : ''}`;
      answerUI = null;
      aslot.replaceChildren();
      if (mode === 'judge-draw') {
        aslot.append(
          h(
            'div',
            { class: 'judge-panel' },
            h('h3', {}, 'Ты судья этого раунда'),
            h('p', {}, 'Вытяни вопрос — нажми на колоду. Потом прочитай его вслух, пока остальные выбирают карты.'),
            h('p', { class: 'auto-note' }),
            h(
              'button',
              {
                class: 'btn btn-primary btn-lg',
                type: 'button',
                onclick: () => {
                  Sound.ensure();
                  send({ t: 'draw' });
                }
              },
              'Тянуть вопрос'
            )
          )
        );
      } else if (mode === 'wait-draw') {
        aslot.append(h('div', { class: 'judge-panel' }, h('h3', {}, 'Сейчас будет вопрос'), h('p', { class: 'wait-note' }), h('p', {}, 'Когда вопрос появится, выбери из своих карт самый смешной ответ.')));
      } else if (mode === 'judge-write') {
        answerUI = JudgeWaitPanel();
        aslot.append(answerUI.el);
      } else if (mode === 'empty') {
        aslot.append(
          h('div', { class: 'card slot-card' }, h('span', { class: 'cap' }, 'Твой ответ'), h('p', {}, 'Выбери карту из руки — она встанет в вопрос'), h('span', { class: 'slot-arrow', 'aria-hidden': 'true' }, '↓'))
        );
      } else if (mode.startsWith('preview')) {
        const c = st.myHand.find((x) => x.id === sel);
        const card = h('div', { class: 'card acard preview' }, h('span', { class: 'cap' }, 'Твой ответ'), h('p', { class: 'hand', style: { margin: 0 } }, c ? c.text : ''), h('span', { class: 'meta' }, h('span', {}, 'Судья не узнает, чья карта')));
        const go = h('button', { class: 'btn btn-primary', id: 'place-btn', type: 'button', onclick: place }, st.myCard ? 'Заменить карту на столе' : 'Положить на стол');
        const back = h('button', { class: 'btn', type: 'button', 'aria-label': 'Отменить выбор', onclick: () => ((sel = null), repaint(S.state, null)) }, icon('close'));
        aslot.append(tilt(h('div', { class: 'tilt-box' }, card)), h('div', { class: 'btn-row' }, back, go));
      } else if (mode.startsWith('placed')) {
        const c = st.myHand.find((x) => x.id === st.myCard);
        const card = h('div', { class: 'card acard placed' }, h('span', { class: 'cap' }, 'Карта на столе'), h('p', { class: 'hand', style: { margin: 0 } }, c ? c.text : st.myAnswer || ''), h('span', { class: 'stamp' }, 'Принято'));
        const take = h('button', { class: 'btn', id: 'take-btn', type: 'button', onclick: () => send({ t: 'retract' }) }, icon('refresh'), 'Забрать карту');
        aslot.append(tilt(h('div', { class: 'tilt-box' }, card)), h('div', { class: 'btn-row' }, take));
      }
    }
    if (answerUI && answerUI.update) answerUI.update(st);
    const judgeP = playerById(st.room.judgeId);
    const waitNote = aslot.querySelector('.wait-note');
    if (waitNote) waitNote.textContent = judgeP ? `${judgeP.name} тянет вопрос из колоды.` : 'Судья тянет вопрос.';
  }

  function repaint(st, prev) {
    el.classList.toggle('writing', !!st.question);
    paintDeck(st);
    paintAnswer(st);
    paintQuestion(st, prev);
    hand.update(st, sel);
  }

  // с клавиатуры: 1–6 — выбрать карту, Enter — положить
  function hotkey(e) {
    const st = S.state;
    if (!st || st.room.phase !== 'write' || isJudge()) return;
    if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= st.myHand.length) {
      e.preventDefault();
      onPick(st.myHand[n - 1].id);
    } else if (e.key === 'Enter' && sel && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      place();
    } else if (e.key === 'Escape' && sel) {
      sel = null;
      repaint(st, null);
    }
  }

  return {
    el,
    hotkey,
    update: repaint,
    tick(st) {
      const note = aslot.querySelector('.auto-note');
      if (note && st.room.phase === 'draw' && st.deadline) {
        const sec = Math.max(0, Math.ceil((st.deadline - serverNow()) / 1000));
        note.textContent = `Через ${sec} ${plural(sec, ['секунду', 'секунды', 'секунд'])} колода сама выдаст вопрос.`;
      }
    }
  };
}

// длинные слова не должны рваться посреди узкой карты — для них шрифт поменьше
function wordFit(text) {
  const longest = Math.max(...String(text).split(/[\s-]+/).map((w) => w.replace(/[,.!?]/g, '').length));
  return longest >= 13 ? ' xlong' : longest >= 11 ? ' long' : '';
}

// Рука: шесть карт ответов веером под столом.
function HandZone(onPick) {
  const row = h('div', { class: 'hand-row' });
  const hint = h('span', { class: 'hand-hint' });
  const swapLabel = h('span', {}, 'Сменить все карты');
  const swapBtn = h('button', { class: 'btn btn-sm swap-btn', type: 'button', title: 'Один раз за партию' }, icon('refresh'), swapLabel);
  const el = h('section', { class: 'hand-zone', 'aria-label': 'Твои карты' }, h('div', { class: 'hand-head' }, h('span', { class: 'eyebrow' }, 'Твои карты'), hint, swapBtn), row);
  const nodes = new Map();
  let armed = 0;
  let armTimer = 0;

  swapBtn.addEventListener('click', () => {
    if (Date.now() - armed > 3000) {
      armed = Date.now();
      swapLabel.textContent = 'Точно? Нажми ещё раз';
      swapBtn.classList.add('armed');
      clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        swapLabel.textContent = 'Сменить все карты';
        swapBtn.classList.remove('armed');
      }, 3000);
      return;
    }
    armed = 0;
    clearTimeout(armTimer);
    swapLabel.textContent = 'Сменить все карты';
    swapBtn.classList.remove('armed');
    Sound.ensure();
    send({ t: 'swap' });
  });

  function makeCard(c) {
    const node = h(
      'button',
      { class: 'hcard', type: 'button', 'data-card': c.id },
      h('span', { class: `ht${wordFit(c.text)}` }, c.text),
      h('span', { class: 'hm' }, h('span', {}, 'ГРЯЗЬ'), h('span', { class: 'hk' })),
      h('span', { class: 'on-tag' }, 'на столе')
    );
    node.addEventListener('click', () => onPick(c.id));
    node.addEventListener('animationend', (e) => {
      if (e.animationName === 'handIn') node.classList.remove('in');
      if (e.animationName === 'nudge') node.classList.remove('nudge');
    });
    return node;
  }

  return {
    el,
    nudge(id) {
      const node = nodes.get(id);
      if (!node) return;
      node.classList.remove('nudge');
      void node.offsetWidth;
      node.classList.add('nudge');
    },
    update(st, sel) {
      const ph = st.room.phase;
      const judge = isJudge();
      const canPlay = ph === 'write' && !judge;
      el.classList.toggle('resting', judge);
      el.classList.toggle('idle', !canPlay);
      el.hidden = !st.myHand.length;
      const ids = new Set(st.myHand.map((c) => c.id));
      for (const [id, node] of nodes) {
        if (!ids.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      }
      const fresh = [];
      const n = st.myHand.length;
      st.myHand.forEach((c, i) => {
        let node = nodes.get(c.id);
        if (!node) {
          node = makeCard(c);
          nodes.set(c.id, node);
          if (!S.seenCards.has(c.id)) {
            S.seenCards.add(c.id);
            fresh.push(node);
          }
        }
        const off = i - (n - 1) / 2;
        node.style.setProperty('--rot', `${(off * 3.2).toFixed(2)}deg`);
        node.style.setProperty('--arc', `${(off * off * 3).toFixed(1)}px`);
        node.querySelector('.hk').textContent = String(i + 1);
        if (row.children[i] !== node) row.insertBefore(node, row.children[i] || null);
        const onTable = st.myCard === c.id;
        node.classList.toggle('sel', sel === c.id && !onTable);
        node.classList.toggle('on-table', onTable);
        node.setAttribute('aria-pressed', String(sel === c.id || onTable));
        node.setAttribute('aria-disabled', String(!canPlay));
        node.setAttribute('aria-label', `${onTable ? 'На столе: ' : ''}${c.text}`);
      });
      if (fresh.length && !reduceMotion) {
        fresh.forEach((node, k) => {
          node.style.setProperty('--d', `${k * 90}ms`);
          node.classList.add('in');
        });
        fresh.slice(0, 6).forEach((_, k) => Sound.play('deal', { delay: k * 0.09, gain: 0.55 }));
      }
      swapBtn.hidden = !st.swapAvailable;
      if (judge) hint.textContent = 'Ты судья — в этом раунде карты отдыхают';
      else if (ph === 'draw') hint.textContent = 'Пока изучи карты — сейчас будет вопрос';
      else if (st.myCard) hint.textContent = 'Передумал(а)? Выбери другую карту';
      else if (sel) hint.textContent = 'Нажми на карту ещё раз — и она на столе';
      else hint.textContent = 'Нажми на карту, чтобы примерить её к вопросу';
    }
  };
}

function JudgeWaitPanel() {
  const pile = h('div', { class: 'pile', 'aria-hidden': 'true' });
  const line = h('p', {});
  const redraw = h('button', { class: 'btn', type: 'button', onclick: () => send({ t: 'redraw' }) }, icon('refresh'), 'Другой вопрос');
  const el = h(
    'div',
    { class: 'judge-panel' },
    h('h3', {}, 'Ты судья — сегодня без карт'),
    h('p', {}, 'Прочитай вопрос вслух. Когда все положат карты, переворачивать их будешь ты.'),
    pile,
    line,
    redraw
  );
  let shown = 0;
  return {
    el,
    update(st) {
      const n = st.answered;
      const total = st.expected;
      const kids = [];
      for (let i = 0; i < total; i++) kids.push(h('span', { class: `mini${i < n ? '' : ' slot'}${i < n && i >= shown ? ' in' : ''}` }));
      pile.replaceChildren(...kids);
      shown = n;
      line.textContent = `На столе ${n} ${plural(n, ['карта', 'карты', 'карт'])} из ${total}`;
      redraw.hidden = !st.redrawAvailable;
    }
  };
}

// Раскрытие ответов и итог раунда.
function RevealStage(st0) {
  const q = st0.question;
  const qcard = q ? QuestionCard(q, 'small') : null;
  const grid = h('div', { class: 'answers' });
  const line = h('div', { class: 'winner-line', hidden: true });
  const el = h('div', { class: 'reveal' }, qcard, grid, line);
  const items = [];
  let built = false;

  function build(st) {
    built = true;
    grid.replaceChildren();
    items.length = 0;
    if (!st.cards.length) {
      grid.append(h('div', { class: 'empty-round' }, st.result && st.result.empty ? 'Никто не сыграл карту — раунд без очков.' : 'Ответов нет.'));
      return;
    }
    st.cards.forEach((c, i) => {
      const back = h('div', { class: 'face back card backcard' }, h('img', { src: '/mark.svg', alt: '' }));
      const textEl = h('p', { class: 'hand', style: { margin: 0 } });
      const mineTag = h('span', { class: 'mine-tag', hidden: true }, 'твой');
      const front = h('div', { class: 'face front card acard' }, h('span', { class: 'cap' }, `Ответ ${c.letter}`, ' ', mineTag), textEl, h('span', { class: 'meta' }, h('span', {}, 'автор скрыт'), h('span', { class: 'auto-tag', hidden: true }, 'легла сама')));
      const flip = h('button', { class: 'flip', type: 'button', 'aria-label': `Перевернуть ответ ${c.letter}` }, h('div', { class: 'inner' }, back, front));
      const action = h('button', { class: 'btn btn-block', type: 'button' });
      const who = h('div', { class: 'who' });
      const box = tilt(h('div', { class: 'ans', style: { animationDelay: `${i * 0.12}s` } }, flip, action, who), 5);
      const item = { c, box, flip, textEl, mineTag, meta: front.querySelector('.meta span'), autoTag: front.querySelector('.auto-tag'), front, action, who, flipped: null };
      flip.addEventListener('click', () => {
        if (!item.flipped) send({ t: 'flip', index: i });
      });
      action.addEventListener('click', () => onAction(i));
      items.push(item);
      grid.append(box);
    });
  }

  function onAction(i) {
    const st = S.state;
    if (!st || st.room.phase !== 'judge' || !isJudge()) return;
    if (!st.cards.every((c) => c.flipped)) return;
    if (S.chosen === i) {
      send({ t: 'pick', index: i });
    } else {
      S.chosen = i;
      Sound.play('select');
      update(st);
    }
  }

  function update(st) {
    if (!built || items.length !== st.cards.length) build(st);
    const judge = isJudge();
    const judging = st.room.phase === 'judge';
    const result = st.room.phase === 'result' ? st.result : null;
    const allFlipped = st.cards.every((c) => c.flipped);
    if (!judging) S.chosen = null;

    st.cards.forEach((c, i) => {
      const it = items[i];
      if (!it) return;
      const canFlip = judging && judge && !c.flipped;
      it.flip.disabled = !canFlip;
      if (c.text && it.textEl.textContent !== c.text) it.textEl.textContent = c.text;
      it.mineTag.hidden = !c.mine;
      it.meta.textContent = c.authorName ? c.authorName : c.mine ? 'это твоя карта' : 'автор скрыт';
      it.autoTag.hidden = !c.auto;
      it.flip.setAttribute('aria-label', c.flipped ? `Ответ ${c.letter}: ${c.text || ''}` : `Перевернуть ответ ${c.letter}`);
      if (it.flipped !== c.flipped) {
        // первый показ без анимации, если карта уже открыта
        if (it.flipped === null && c.flipped) {
          const inner = it.flip.querySelector('.inner');
          inner.style.transition = 'none';
          requestAnimationFrame(() => requestAnimationFrame(() => (inner.style.transition = '')));
        }
        it.flip.classList.toggle('on', c.flipped);
        it.flipped = c.flipped;
      }
      const chosen = judging && S.chosen === i;
      it.flip.classList.toggle('chosen', chosen);

      // кнопка под картой
      if (judging && judge) {
        it.action.hidden = false;
        if (!c.flipped) {
          it.action.className = 'btn btn-block';
          it.action.textContent = 'Перевернуть';
          it.action.disabled = false;
          it.action.onclick = () => send({ t: 'flip', index: i });
        } else {
          it.action.onclick = null;
          it.action.className = chosen ? 'btn btn-primary btn-block' : 'btn btn-block';
          it.action.textContent = chosen ? 'Отдать очко' : 'Этот';
          it.action.disabled = !allFlipped;
          it.action.title = allFlipped ? '' : 'Сначала переверни все карты';
        }
      } else {
        it.action.hidden = true;
      }

      // итог
      const win = result && result.winnerId && result.index === i;
      it.box.classList.toggle('win', !!win);
      it.box.classList.toggle('lose', !!(result && result.winnerId && !win));
      if (c.authorName) {
        if (!it.who.dataset.done) {
          const author = playerById(c.authorId);
          fill(it.who, author ? ava(author) : null, win ? `${c.authorName} · +1` : c.authorName);
          it.who.classList.add('reveal-in');
          it.who.style.animationDelay = win ? '0.1s' : `${0.25 + i * 0.08}s`;
          it.who.dataset.done = '1';
          if (win) it.front.append(h('span', { class: 'stamp' }, '+1 очко'));
        }
      } else {
        it.who.replaceChildren();
        delete it.who.dataset.done;
      }
    });

    if (result && result.winnerId && st.question) {
      line.hidden = false;
      line.replaceChildren(...questionNodes(st.question.text, result.text));
    } else line.hidden = true;
  }

  return { el, update: (st) => update(st) };
}

function Reactions() {
  const KINDS = [
    ['laugh', '😂', 'Смешно'],
    ['fire', '🔥', 'Огонь'],
    ['skull', '💀', 'Убило'],
    ['clap', '👏', 'Браво']
  ];
  let last = 0;
  const el = h(
    'div',
    { class: 'react-bar', role: 'group', 'aria-label': 'Реакции' },
    KINDS.map(([kind, emoji, label]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-label': label,
          title: label,
          onclick: () => {
            const t = Date.now();
            if (t - last < 500) return;
            last = t;
            send({ t: 'react', kind });
          }
        },
        emoji
      )
    )
  );
  return { el, emoji: Object.fromEntries(KINDS.map(([k, e]) => [k, e])) };
}

const REACT_EMOJI = { laugh: '😂', fire: '🔥', skull: '💀', clap: '👏' };
function floatReaction(m) {
  const p = playerById(m.from);
  const node = h('div', { class: 'float-react', style: { left: `${10 + Math.random() * 80}%` } }, h('b', {}, REACT_EMOJI[m.kind] || '🔥'), p ? h('span', {}, p.name) : null);
  $('#reactions').append(node);
  setTimeout(() => node.remove(), 2700);
  Sound.play('pop');
}

function GameScreen() {
  const header = Header();
  const players = PlayersList();
  const sub = h('span', { class: 'sub' });
  const subWrap = h('span', { class: 'sub-wrap' }, h('span', { class: 'sub-round' }), sub);
  const title = h('span', { class: 'title' });
  const timer = Timer();
  const stage = h('div', { class: 'stage' });
  const foot = h('div', { class: 'foot' });
  const reactions = Reactions();
  const table = h('section', { class: 'table', 'aria-live': 'off' }, h('div', { class: 'status' }, h('div', { class: 'status-text' }, subWrap, title), timer.el), stage, foot);
  const el = h('div', { class: 'screen' }, header.el, h('div', { class: 'game' }, players.el, table));
  let key = null;
  let stageView = null;
  let loop = 0;
  let nextBtn = null;
  let footMode = null;

  function stageKey(st) {
    const ph = st.room.phase;
    const group = ph === 'draw' || ph === 'write' ? 'play' : 'reveal';
    return `${group}:${st.room.round}:${st.room.judgeId}`;
  }

  function texts(st) {
    const judgeP = playerById(st.room.judgeId);
    const jn = judgeP ? judgeP.name : 'Судья';
    const judge = isJudge();
    const ph = st.room.phase;
    sub.classList.toggle('hot', judge);
    subWrap.firstElementChild.textContent = `Раунд ${st.room.round} · `;
    if (ph === 'draw') {
      sub.textContent = judge ? 'Ты судья этого раунда' : `Судья — ${jn}`;
      title.textContent = judge ? 'Тяни вопрос из колоды' : `${jn} тянет вопрос`;
    } else if (ph === 'write') {
      sub.textContent = judge ? 'Ты судья — сегодня без карт' : `Судья — ${jn}`;
      title.textContent = judge ? 'Прочитай вопрос вслух' : st.myAnswer != null ? 'Карта на столе — ждём остальных' : 'Выбери самую смешную карту';
    } else if (ph === 'judge') {
      const left = st.cards.filter((c) => !c.flipped).length;
      sub.textContent = judge ? 'Ты судья этого раунда' : `Судья — ${jn}`;
      if (judge) title.textContent = left ? `Переверни ${left === st.cards.length ? 'карты' : `ещё ${left}`} и прочитай вслух` : 'Выбери самый смешной ответ';
      else title.textContent = left ? `${jn} читает ответы` : `${jn} выбирает лучший ответ`;
    } else if (ph === 'result') {
      const r = st.result || {};
      sub.textContent = 'Итоги раунда';
      if (r.judgeLost) title.textContent = 'Судья пропал — раунд без очков';
      else if (r.empty || !r.winnerId) title.textContent = 'Никто не сыграл карту';
      else if (r.winnerId === st.me) title.textContent = 'Твоя карта победила! +1 очко';
      else title.textContent = `Очко получает ${r.winnerName}`;
    }
  }

  function paintFoot(st) {
    const ph = st.room.phase;
    let mode = ph;
    if (ph === 'result') mode = 'result';
    if (mode !== footMode) {
      footMode = mode;
      nextBtn = null;
      foot.replaceChildren();
      if (ph === 'judge') foot.append(reactions.el, h('span', { class: 'muted' }, 'Ответы перемешаны: авторов не видно до выбора судьи'));
      else if (ph === 'result') {
        if (st.room.judgeId === st.me || isHost()) {
          nextBtn = h('button', { class: 'btn btn-light btn-lg', type: 'button', onclick: () => send({ t: 'next' }) }, 'Дальше');
          foot.append(reactions.el, nextBtn);
        } else foot.append(reactions.el, h('span', { class: 'muted next-note' }));
      } else if (ph === 'write') foot.append(h('span', { class: 'muted write-note' }));
    }
    if (ph === 'write') {
      const note = foot.querySelector('.write-note');
      const waiting = st.players.filter((p) => p.status === 'writing');
      const names = waiting.map((p) => (p.id === st.me ? 'ты' : p.name));
      note.textContent =
        `На столе ${st.answered} ${plural(st.answered, ['карта', 'карты', 'карт'])} из ${st.expected}` +
        (waiting.length && waiting.length <= 3 ? ` · ещё ${waiting.length === 1 ? 'выбирает' : 'выбирают'}: ${names.join(', ').replace(/, ([^,]*)$/, ' и $1')}` : '') +
        (waiting.some((p) => p.id === st.me) ? ' · не успеешь — ляжет случайная' : '');
    }
  }

  function tick() {
    loop = 0;
    const st = S.state;
    if (!st || S.view !== api) return;
    if (stageView && stageView.tick) stageView.tick(st);
    if (st.room.phase === 'result' && st.deadline) {
      const sec = Math.max(0, Math.ceil((st.deadline - serverNow()) / 1000));
      if (nextBtn) nextBtn.textContent = `Дальше · ${sec}`;
      const note = foot.querySelector('.next-note');
      if (note) note.textContent = `Следующий раунд через ${sec} ${plural(sec, ['секунду', 'секунды', 'секунд'])}`;
    }
    loop = setTimeout(tick, 250);
  }

  const api = {
    el,
    header,
    update(st, prev) {
      header.update(st);
      players.update(st, prev);
      const k = stageKey(st);
      if (k !== key) {
        key = k;
        S.chosen = null;
        stageView = st.room.phase === 'draw' || st.room.phase === 'write' ? PlayStage() : RevealStage(st);
        stage.replaceChildren(stageView.el);
        S.hotkeys = stageView.hotkey || null;
        footMode = null;
      }
      stageView.update(st, prev);
      texts(st);
      paintFoot(st);
      if (st.room.phase === 'write' && st.deadline) {
        const total = st.room.settings.time * 1000;
        timer.set({ deadline: st.deadline, total, tick: () => !isJudge() && S.state.myAnswer == null && S.state.room.phase === 'write' });
      } else timer.set(null);
      if (!loop) tick();
    },
    destroy() {
      timer.stop();
      clearTimeout(loop);
      loop = 0;
      S.hotkeys = null;
    }
  };
  return api;
}

// ---------- финал ----------

function FinalScreen() {
  const header = Header();
  const eyebrow = h('span', { class: 'eyebrow' });
  const titleEl = h('h1', {});
  const subEl = h('p', {});
  const pair = tilt(h('div', { class: 'pair' }), 6);
  const board = h('ol', { class: 'board' });
  const actions = h('div', { class: 'btn-row' });
  const el = h(
    'div',
    { class: 'screen' },
    header.el,
    h('main', { class: 'screen final', style: { minHeight: 'auto', flex: '1' } }, h('div', { class: 'final-head' }, eyebrow, titleEl, subEl), h('div', { class: 'final-body' }, pair, board), actions)
  );
  let celebrated = false;
  return {
    el,
    header,
    update(st) {
      header.update(st);
      const f = st.final || {};
      const iWon = f.winnerId === st.me;
      eyebrow.textContent = `Партия окончена · ${f.rounds || st.room.round} ${plural(f.rounds || st.room.round, ['раунд', 'раунда', 'раундов'])}`;
      titleEl.textContent = iWon ? 'Ты забираешь партию!' : `${f.winnerName || 'Победитель'} забирает партию`;
      subEl.textContent = `${st.room.settings.target} ${plural(st.room.settings.target, ['очко', 'очка', 'очков'])} — и самый грязный язык за этим столом`;
      const hl = f.highlight;
      pair.replaceChildren();
      if (hl && hl.question) {
        pair.append(
          h('article', { class: 'card qcard' }, h('span', { class: 'cap' }, 'Победный вопрос'), h('p', { class: 'qtext' }, questionNodes(hl.question.text)), h('span', { class: 'meta' }, h('span', {}, `Раунд ${hl.round}`))),
          h('div', { class: 'card acard' }, h('span', { class: 'cap' }, `Ответ: ${hl.author}`), h('p', { class: 'hand', style: { margin: 0 } }, hl.text), h('span', { class: 'stamp' }, 'Победа'))
        );
      }
      const sorted = st.players.slice().sort((a, b) => b.score - a.score);
      board.replaceChildren(
        ...sorted.map((p, i) =>
          h(
            'li',
            { class: i === 0 ? 'first' : '', style: { animationDelay: `${0.3 + i * 0.08}s` } },
            h('span', { class: 'rk' }, String(i + 1)),
            avaV(p),
            h('span', { class: 'nm' }, p.name, p.id === st.me ? ' (вы)' : ''),
            h('span', { class: 'sc' }, String(p.score))
          )
        )
      );
      actions.replaceChildren();
      if (isHost()) {
        const live = st.players.filter((p) => p.connected).length;
        const again = h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: live < st.room.minPlayers, onclick: () => send({ t: 'start' }) }, 'Ещё партию');
        actions.append(again, h('button', { class: 'btn btn-lg', type: 'button', onclick: () => send({ t: 'lobby' }) }, 'Сменить настройки'));
      } else {
        const hostP = playerById(st.room.hostId);
        actions.append(h('span', { class: 'muted', style: { color: 'var(--muted)', alignSelf: 'center' } }, hostP ? `${hostP.name} решает, играем ли ещё` : 'Ждём хозяина'));
      }
      if (!celebrated) {
        celebrated = true;
        FX.rain(iWon ? 6000 : 3500);
        setTimeout(() => {
          const r = pair.getBoundingClientRect();
          FX.burst(r.width ? r.left + r.width / 2 : innerWidth / 2, r.width ? r.top + 40 : innerHeight / 2, 90);
        }, 500);
      }
    },
    destroy() {
      FX.stop();
    }
  };
}

const SCREENS = { entry: EntryScreen, lobby: LobbyScreen, game: GameScreen, final: FinalScreen };

// =====================================================================
// Старт
// =====================================================================

addEventListener('pointerdown', () => Sound.ensure(), { once: true, capture: true });
document.addEventListener('keydown', (e) => S.hotkeys && S.hotkeys(e));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.ws && S.ws.readyState > 1 && !S.replaced) connect();
});
render();
connect();
