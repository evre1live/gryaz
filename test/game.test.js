'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, TIMING, HAND_SIZE } = require('../server/game');
const { DECKS, ANSWERS } = require('../server/decks');

function setup(n = 4, opts = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms) => (t += ms) };
  let seed = 7;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const room = new Room({ code: '1234', password: opts.password || '', now: clock.now, rng, ...(opts.decks ? { decks: opts.decks, answers: opts.answers } : {}) });
  const players = [];
  for (let i = 0; i < n; i++) players.push(room.addPlayer(['Аня', 'Тимур', 'Дина', 'Рустам', 'Лола', 'Саша', 'Мадина', 'Олег', 'Гуля', 'Марат'][i]));
  return { room, players, clock };
}

function playRound(room, clock, { pickFirst = true } = {}) {
  assert.equal(room.phase, 'draw');
  room.draw(room.judgeId);
  assert.equal(room.phase, 'write');
  for (const p of room.writers()) room.submit(p.id, p.hand[0]);
  clock.advance(TIMING.writeGraceMs);
  room.tick();
  assert.equal(room.phase, 'judge');
  room.cards.forEach((_, i) => room.flip(room.judgeId, i));
  const index = pickFirst ? 0 : room.cards.length - 1;
  const winner = room.cards[index].authorId;
  room.pick(room.judgeId, index);
  assert.equal(room.phase, 'result');
  return winner;
}

test('хозяин — первый игрок, старт только с трёх', () => {
  const { room, players } = setup(2);
  assert.equal(room.hostId, players[0].id);
  assert.throws(() => room.start(players[0].id), /минимум 3/);
  room.addPlayer('Дина');
  assert.throws(() => room.start(players[1].id), /хозяин/);
  room.start(players[0].id);
  assert.equal(room.phase, 'draw');
  assert.equal(room.round, 1);
});

test('имена уникальны, пустое имя и переполнение запрещены', () => {
  const { room } = setup(3);
  assert.throws(() => room.addPlayer('аня'), /занято/);
  assert.throws(() => room.addPlayer('   '), /имя/);
  for (let i = 0; i < 7; i++) room.addPlayer(`Игрок ${i}`);
  assert.throws(() => room.addPlayer('Лишний'), /10 игроков/);
});

test('пароль проверяется', () => {
  const { room } = setup(1, { password: 'грязь' });
  assert.equal(room.checkPassword('грязь'), true);
  assert.equal(room.checkPassword('чисто'), false);
  assert.equal(room.checkPassword(''), false);
});

test('полный раунд: вопрос, ответы, раскрытие, очко, смена судьи', () => {
  const { room, players, clock } = setup(4);
  room.start(players[0].id);
  const firstJudge = room.judgeId;
  assert.throws(() => room.draw(room.writers()[0].id), /судья/);
  room.draw(firstJudge);
  assert.ok(room.question.text.length > 5);
  assert.throws(() => room.submit(firstJudge, room.players.get(firstJudge).hand[0]), /не отвечает/);
  const writers = room.writers();
  assert.throws(() => room.submit(writers[0].id, 'c-нет-такой'), /нет/);
  // чужую карту сыграть нельзя
  assert.throws(() => room.submit(writers[0].id, writers[1].hand[0]), /нет/);

  writers.forEach((p) => room.submit(p.id, p.hand[2]));
  assert.equal(room.answers.get(writers[0].id).text, ANSWERS.get(writers[0].hand[2]));

  // все ответили — короткая пауза, потом раскрытие
  room.tick();
  assert.equal(room.phase, 'write');
  clock.advance(TIMING.writeGraceMs);
  room.tick();
  assert.equal(room.phase, 'judge');
  assert.equal(room.cards.length, 3);

  assert.throws(() => room.pick(firstJudge, 0), /переверните/);
  assert.throws(() => room.flip(writers[0].id, 0), /судья/);
  room.cards.forEach((_, i) => room.flip(firstJudge, i));
  const winnerId = room.cards[1].authorId;
  room.pick(firstJudge, 1);
  assert.equal(room.players.get(winnerId).score, 1);
  assert.equal(room.phase, 'result');

  clock.advance(TIMING.resultMs);
  room.tick();
  assert.equal(room.phase, 'draw');
  assert.equal(room.round, 2);
  const idx = room.order.indexOf(firstJudge);
  assert.equal(room.judgeId, room.order[(idx + 1) % room.order.length]);
});

test('что видит игрок: чужие ответы и авторов до выбора не видно', () => {
  const { room, players, clock } = setup(3);
  room.start(players[0].id);
  room.draw(room.judgeId);
  const [a, b] = room.writers();
  const secret = ANSWERS.get(a.hand[1]);
  room.submit(a.id, a.hand[1]);
  const viewB = room.view(b.id);
  assert.equal(viewB.myAnswer, null);
  assert.equal(viewB.myHand.length, HAND_SIZE);
  assert.ok(!JSON.stringify(viewB).includes(secret), 'чужая карта утекла');
  assert.equal(room.view(a.id).myAnswer, secret);
  assert.equal(room.view(a.id).myCard, a.hand[1]);
  room.submit(b.id, b.hand[0]);
  clock.advance(TIMING.writeGraceMs);
  room.tick();
  const judgeView = room.view(room.judgeId);
  assert.ok(judgeView.cards.every((c) => c.text === null && c.authorId === null));
  room.flip(room.judgeId, 0);
  const after = room.view(room.judgeId);
  assert.ok(after.cards[0].text);
  assert.equal(after.cards[0].authorId, null);
  room.flip(room.judgeId, 1);
  room.pick(room.judgeId, 0);
  const res = room.view(a.id);
  assert.ok(res.cards.every((c) => c.authorId && c.authorName));
});

test('время вышло: за тех, кто не успел, карта ложится сама', () => {
  const { room, players, clock } = setup(5);
  room.start(players[0].id);
  room.draw(room.judgeId);
  const [a, b, c, d] = room.writers();
  room.submit(a.id, a.hand[0]);
  room.setConnected(d.id, false);
  clock.advance(room.settings.time * 1000);
  room.tick();
  assert.equal(room.phase, 'judge');
  assert.equal(room.cards.length, 3, 'отключившийся не играет');
  assert.equal(room.cards.filter((x) => x.auto).length, 2);
  for (const p of [a, b, c]) assert.equal(p.hand.length, HAND_SIZE - 1, 'сыгранная карта ушла из руки');
  assert.equal(d.hand.length, HAND_SIZE);
  room.cards.forEach((_, i) => room.flip(room.judgeId, i));
  const auto = room.cards.findIndex((x) => x.auto);
  room.pick(room.judgeId, auto);
  assert.equal(room.view(a.id).cards[auto].auto, true, 'после выбора видно, что карта выпала сама');
});

test('никто не играет — раунд без очков', () => {
  const { room, players, clock } = setup(3);
  room.start(players[0].id);
  room.draw(room.judgeId);
  for (const w of room.writers()) room.setConnected(w.id, false);
  clock.advance(room.settings.time * 1000);
  room.tick();
  assert.equal(room.phase, 'result');
  assert.equal(room.result.empty, true);
  assert.ok([...room.players.values()].every((p) => p.score === 0));
});

test('судья не тянет вопрос — колода выдаёт его сама', () => {
  const { room, players, clock } = setup(3);
  room.start(players[0].id);
  clock.advance(TIMING.autoDrawMs);
  room.tick();
  assert.equal(room.phase, 'write');
  assert.ok(room.question);
});

test('смена вопроса: один раз и только до первого ответа', () => {
  const { room, players } = setup(3);
  room.start(players[0].id);
  room.draw(room.judgeId);
  const first = room.question.no;
  room.redraw(room.judgeId);
  assert.notEqual(room.question.no, first);
  assert.throws(() => room.redraw(room.judgeId), /уже меняли/);

  const { room: r2, players: p2 } = setup(3);
  r2.start(p2[0].id);
  r2.draw(r2.judgeId);
  r2.submit(r2.writers()[0].id, r2.writers()[0].hand[0]);
  assert.throws(() => r2.redraw(r2.judgeId), /поздно/);
});

test('карту можно забрать со стола или заменить другой', () => {
  const { room, players } = setup(3);
  room.start(players[0].id);
  room.draw(room.judgeId);
  const w = room.writers()[0];
  room.submit(w.id, w.hand[0]);
  room.retract(w.id);
  assert.equal(room.answers.has(w.id), false);
  room.submit(w.id, w.hand[1]);
  room.submit(w.id, w.hand[3]);
  assert.equal(room.answers.get(w.id).cardId, w.hand[3]);
  assert.equal(room.answers.size, 1);
});

test('рука: шесть карт, без повторов, добор после раунда', () => {
  const { room, players, clock } = setup(5);
  room.start(players[0].id);
  for (const p of players) assert.equal(p.hand.length, HAND_SIZE);
  const all = players.flatMap((p) => p.hand);
  assert.equal(new Set(all).size, all.length, 'одна карта у двоих');
  const played = new Map();
  room.draw(room.judgeId);
  for (const p of room.writers()) {
    played.set(p.id, p.hand[4]);
    room.submit(p.id, p.hand[4]);
  }
  clock.advance(TIMING.writeGraceMs);
  room.tick();
  room.cards.forEach((_, i) => room.flip(room.judgeId, i));
  room.pick(room.judgeId, 0);
  clock.advance(TIMING.resultMs);
  room.tick();
  assert.equal(room.round, 2);
  for (const p of players) {
    assert.equal(p.hand.length, HAND_SIZE, `${p.name}: рука добрана`);
    if (played.has(p.id)) assert.ok(!p.hand.includes(played.get(p.id)), 'сыгранная карта не вернулась');
  }
  const again = players.flatMap((p) => p.hand);
  assert.equal(new Set(again).size, again.length);
});

test('рука: сменить карты можно один раз за партию и не с картой на столе', () => {
  const { room, players } = setup(3);
  room.start(players[0].id);
  const p = players[1];
  const before = p.hand.slice();
  assert.equal(room.view(p.id).swapAvailable, true);
  room.swapHand(p.id);
  assert.equal(p.hand.length, HAND_SIZE);
  assert.ok(p.hand.every((c) => !before.includes(c)), 'старые карты ушли');
  assert.equal(room.view(p.id).swapAvailable, false);
  assert.throws(() => room.swapHand(p.id), /уже меняли/);
  room.draw(room.judgeId);
  const w = room.writers().find((x) => x.id !== p.id);
  room.submit(w.id, w.hand[0]);
  assert.throws(() => room.swapHand(w.id), /со стола/);
  room.toLobby(players[0].id);
  assert.equal(room.view(p.id).myHand.length, 0);
  room.start(players[0].id);
  assert.equal(room.view(p.id).swapAvailable, true, 'в новой партии снова можно');
});

test('рука: новичок посреди партии сразу получает карты и может сыграть', () => {
  const { room, players } = setup(3);
  room.start(players[0].id);
  room.draw(room.judgeId);
  const late = room.addPlayer('Лола');
  assert.equal(late.hand.length, HAND_SIZE);
  room.submit(late.id, late.hand[0]);
  assert.ok(room.answers.has(late.id));
});

test('колоды ответов: приличная комната — только приличные карты', () => {
  const { room, players } = setup(4);
  room.setSettings(players[0].id, { deck: 'clean' });
  room.start(players[0].id);
  assert.ok(players.every((p) => p.hand.every((c) => c.startsWith('c'))));
  const { room: r2, players: p2 } = setup(10);
  r2.start(p2[0].id);
  const ids = p2.flatMap((p) => p.hand);
  assert.ok(ids.every((c) => ANSWERS.has(c)));
});

test('колода ответов кончилась — замешивается заново без повторов на руках', () => {
  const answers = new Map();
  for (let i = 0; i < 24; i++) answers.set(`t${i}`, `карта ${i}`);
  const decks = { adult: { id: 'adult', title: 'Тест', questions: DECKS.adult.questions, answers: [...answers.keys()] } };
  const { room, players, clock } = setup(3, { decks, answers });
  room.start(players[0].id);
  for (let r = 0; r < 12; r++) {
    playRound(room, clock);
    clock.advance(TIMING.resultMs);
    room.tick();
    for (const p of players) assert.equal(p.hand.length, HAND_SIZE);
    const all = players.flatMap((p) => p.hand);
    assert.equal(new Set(all).size, all.length, `раунд ${r}: повтор на руках`);
  }
});

test('судья вышел посреди раунда — раунд переигрывается со следующим', () => {
  const { room, players } = setup(4);
  room.start(players[0].id);
  room.draw(room.judgeId);
  const judge = room.judgeId;
  const seat = room.order.indexOf(judge);
  const expectedNext = room.order[(seat + 1) % room.order.length];
  const round = room.round;
  room.removePlayer(judge);
  assert.equal(room.phase, 'draw');
  assert.equal(room.round, round);
  assert.equal(room.judgeId, expectedNext);
  assert.match(room.notice, /переигрываем/);
});

test('судья пропал во время выбора — раунд без очков', () => {
  const { room, players, clock } = setup(3);
  room.start(players[0].id);
  room.draw(room.judgeId);
  room.writers().forEach((p) => room.submit(p.id, p.hand[0]));
  clock.advance(TIMING.writeGraceMs);
  room.tick();
  room.setConnected(room.judgeId, false);
  clock.advance(TIMING.judgeOfflineMs);
  room.tick();
  assert.equal(room.phase, 'result');
  assert.equal(room.result.judgeLost, true);
});

test('отвалившийся писатель не держит раунд', () => {
  const { room, players, clock } = setup(4);
  room.start(players[0].id);
  room.draw(room.judgeId);
  const [a, b, c] = room.writers();
  room.submit(a.id, a.hand[0]);
  room.submit(b.id, b.hand[0]);
  room.setConnected(c.id, false);
  clock.advance(TIMING.writeGraceMs);
  room.tick();
  assert.equal(room.phase, 'judge');
});

test('хозяин уходит в офлайн — хозяином становится другой', () => {
  const { room, players } = setup(3);
  room.setConnected(players[0].id, false);
  assert.notEqual(room.hostId, players[0].id);
  assert.ok(room.players.get(room.hostId).connected);
});

test('меньше трёх игроков — партия на паузе', () => {
  const { room, players, clock } = setup(3);
  room.start(players[0].id);
  room.draw(room.judgeId);
  const w = room.writers()[0];
  room.removePlayer(w.id);
  room.writers().forEach((p) => room.submit(p.id, p.hand[0]));
  clock.advance(TIMING.writeGraceMs);
  room.tick();
  room.cards.forEach((_, i) => room.flip(room.judgeId, i));
  room.pick(room.judgeId, 0);
  clock.advance(TIMING.resultMs);
  room.tick();
  assert.equal(room.phase, 'lobby');
  assert.match(room.notice, /пауз/);
});

test('партия до победы и новая партия с нуля', () => {
  const { room, players, clock } = setup(3);
  room.setSettings(players[0].id, { target: 5, deck: 'clean', time: 30 });
  assert.throws(() => room.setSettings(players[1].id, { target: 7 }), /хозяин/);
  assert.throws(() => room.setSettings(players[0].id, { target: 3 }), /Неверное/);
  room.start(players[0].id);
  assert.throws(() => room.setSettings(players[0].id, { target: 7 }), /между партиями/);
  let guard = 0;
  while (room.phase !== 'final' && guard++ < 100) {
    playRound(room, clock);
    clock.advance(TIMING.resultMs);
    room.tick();
  }
  assert.equal(room.phase, 'final');
  const champ = room.players.get(room.final.winnerId);
  assert.equal(champ.score, 5);
  assert.ok(room.final.highlight.text);
  assert.equal(room.question.deck, 'clean');
  room.start(players[0].id);
  assert.equal(room.round, 1);
  assert.ok([...room.players.values()].every((p) => p.score === 0));
});

test('вопросы не повторяются, пока колода не кончится', () => {
  const { room, players, clock } = setup(3);
  room.start(players[0].id);
  const seen = new Set();
  const total = room.decks[room.settings.deck].questions.length;
  for (let i = 0; i < total; i++) {
    if (room.phase !== 'draw') room.startRound();
    room.draw(room.judgeId);
    const key = room.question.no;
    assert.ok(!seen.has(key), `вопрос ${key} повторился`);
    seen.add(key);
  }
  assert.equal(seen.size, total);
  clock.advance(1);
});

test('колоды: достаточно вопросов и готовых ответов', () => {
  for (const deck of Object.values(DECKS)) {
    assert.ok(deck.questions.length >= 100, `${deck.title}: ${deck.questions.length}`);
    const uniq = new Set(deck.questions);
    assert.equal(uniq.size, deck.questions.length, `${deck.title}: есть повторы`);
    for (const q of deck.questions) {
      assert.ok(q.length > 10 && q.length < 120, q);
      assert.ok(q.includes('___') || q.endsWith('?'), `нет места для ответа: ${q}`);
    }
    // десять игроков по шесть карт — и ещё остаётся на добор
    assert.ok(deck.answers.length >= 150, `${deck.title}: ответов ${deck.answers.length}`);
    for (const id of deck.answers) assert.ok(ANSWERS.has(id), id);
  }
  const texts = [...ANSWERS.values()];
  assert.ok(texts.length >= 200 && texts.length <= 320, `всего ответов ${texts.length}`);
  assert.equal(new Set(texts.map((t) => t.toLowerCase())).size, texts.length, 'повторы среди ответов');
  for (const t of texts) assert.ok(t.length >= 3 && t.length <= 60, t);
});

test('персонаж: сохраняется, мусор приводится к допустимому', () => {
  const { cleanAvatar, AVATAR_SPEC } = require('../server/game');
  const { room, players } = setup(3);
  room.setAvatar(players[0].id, { hair: 3, hat: 99, skin: -1, bogus: 5 });
  const a = room.players.get(players[0].id).avatar;
  assert.equal(a.hair, 3);
  assert.equal(a.hat, 0);
  assert.equal(a.skin, 0);
  assert.equal(a.bogus, undefined);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(AVATAR_SPEC).sort());
  assert.equal(cleanAvatar('строка'), null);
  const p = room.addPlayer('Новый', { hair: 15, hairColor: 9 });
  assert.equal(room.view(p.id).players.find((x) => x.id === p.id).avatar.hair, 15);
});

test('голос: вход, микрофон, выход, отключение', () => {
  const { room, players } = setup(3);
  const [a, b] = players;
  assert.deepEqual(room.voiceJoin(a.id, false), []);
  assert.deepEqual(room.voiceJoin(b.id, true), [a.id]);
  assert.equal(room.view(a.id).players.find((p) => p.id === b.id).voice, 'muted');
  room.voiceMute(b.id, false);
  assert.equal(room.players.get(b.id).voice, 'on');
  room.setConnected(b.id, false);
  assert.equal(room.players.get(b.id).voice, 'off');
  assert.equal(room.inVoice(b.id), false);
  room.voiceLeave(a.id);
  assert.equal(room.inVoice(a.id), false);
});

test('описание персонажа на клиенте совпадает с сервером', async () => {
  const { AVATAR_SPEC } = require('../server/game');
  const mod = await import('../public/avatar.js');
  assert.deepEqual(mod.SPEC, AVATAR_SPEC);
  const svg = mod.avatarSVG(mod.randomAvatar());
  assert.match(svg, /^<svg /);
  for (const [k, n] of Object.entries(mod.SPEC)) {
    for (let i = 0; i < n; i++) assert.match(mod.avatarSVG({ ...mod.normalize({}), [k]: i }), /<\/svg>$/);
  }
});
