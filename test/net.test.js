'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { createServer } = require('../server/index');

function startServer() {
  const { server, rooms, stop } = createServer({ tickMs: 50 });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, rooms, stop, port: server.address().port })));
}

class Client {
  constructor(port) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.msgs = [];
    this.waiters = [];
    this.state = null;
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'state') this.state = m;
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => !w(m));
    });
  }
  ready() {
    return new Promise((r) => (this.ws.readyState === 1 ? r() : this.ws.once('open', r)));
  }
  send(m) {
    this.ws.send(JSON.stringify(m));
  }
  wait(pred, ms = 3000) {
    return new Promise((resolve, reject) => {
      const done = (m) => {
        if (pred(m)) {
          clearTimeout(timer);
          resolve(m);
          return true;
        }
        return false;
      };
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      if (this.state && pred(this.state)) {
        clearTimeout(timer);
        resolve(this.state);
        return;
      }
      this.waiters.push(done);
    });
  }
  close() {
    this.ws.close();
  }
}

test('по сети: комната, пароль, полная партия-раунд, реконнект, исключение', async () => {
  const { stop, port } = await startServer();
  try {
    const host = new Client(port);
    await host.ready();
    host.send({ t: 'create', name: 'Джамшид', password: 'грязь', settings: { deck: 'clean' } });
    const joined = await host.wait((m) => m.t === 'joined');
    const code = joined.code;
    assert.match(code, /^\d{4}$/);
    await host.wait((m) => m.t === 'state' && m.room.code === code);
    assert.equal(host.state.room.settings.deck, 'clean');

    // приглашение: проверка кода
    const guest = new Client(port);
    await guest.ready();
    guest.send({ t: 'peek', code });
    const peek = await guest.wait((m) => m.t === 'peek');
    assert.equal(peek.exists, true);
    assert.equal(peek.hasPassword, true);

    guest.send({ t: 'join', code, password: 'неверно', name: 'Аня' });
    const err = await guest.wait((m) => m.t === 'error');
    assert.equal(err.code, 'BAD_PASSWORD');
    guest.send({ t: 'join', code: '0000', password: 'грязь', name: 'Аня' });
    assert.equal((await guest.wait((m) => m.t === 'error' && m.code === 'NO_ROOM')).code, 'NO_ROOM');
    guest.send({ t: 'join', code, password: 'грязь', name: 'Аня' });
    const gJoined = await guest.wait((m) => m.t === 'joined');

    const third = new Client(port);
    await third.ready();
    third.send({ t: 'join', code, password: 'грязь', name: 'Тимур' });
    await third.wait((m) => m.t === 'joined');
    await host.wait((m) => m.t === 'state' && m.players.length === 3);

    // не хозяин не может стартовать
    guest.send({ t: 'start' });
    assert.equal((await guest.wait((m) => m.t === 'error' && m.for === 'start')).code, 'NOT_HOST');

    host.send({ t: 'start' });
    await host.wait((m) => m.t === 'state' && m.room.phase === 'draw');
    const clients = [host, guest, third];
    const byId = (id) => clients.find((c) => c.state.me === id);
    const judge = byId(host.state.room.judgeId);
    judge.send({ t: 'draw' });
    await host.wait((m) => m.t === 'state' && m.room.phase === 'write');
    assert.ok(host.state.question.text);

    const writers = clients.filter((c) => c !== judge);
    writers[0].send({ t: 'submit', text: 'первый ответ' });
    await writers[1].wait((m) => m.t === 'state' && m.answered === 1);
    assert.equal(writers[1].state.myAnswer, null);
    assert.ok(!JSON.stringify(writers[1].state).includes('первый ответ'), 'чужой ответ утёк');

    // реконнект посреди раунда: второй писатель закрывает вкладку и возвращается
    const token = writers[1] === guest ? gJoined.token : null;
    if (token) {
      guest.close();
      await host.wait((m) => m.t === 'state' && m.players.find((p) => p.name === 'Аня' && !p.connected));
      const back = new Client(port);
      await back.ready();
      back.send({ t: 'resume', code, token });
      await back.wait((m) => m.t === 'state' && m.room.phase === 'write');
      clients[1] = back;
      writers[1] = back;
    }
    writers[1].send({ t: 'submit', text: 'второй ответ' });
    await judge.wait((m) => m.t === 'state' && m.room.phase === 'judge', 4000);
    assert.equal(judge.state.cards.length, 2);
    assert.ok(judge.state.cards.every((c) => c.text === null));

    judge.send({ t: 'pick', index: 0 });
    assert.equal((await judge.wait((m) => m.t === 'error' && m.for === 'pick')).code, 'UNREAD');
    judge.send({ t: 'flip', index: 0 });
    judge.send({ t: 'flip', index: 1 });
    await judge.wait((m) => m.t === 'state' && m.cards.every((c) => c.flipped));
    judge.send({ t: 'pick', index: 1 });
    const res = await writers[0].wait((m) => m.t === 'state' && m.room.phase === 'result');
    const winner = res.players.find((p) => p.id === res.result.winnerId);
    assert.equal(winner.score, 1);
    assert.ok(res.cards.every((c) => c.authorName));

    // реакции доходят до всех
    writers[0].send({ t: 'react', kind: 'laugh' });
    await judge.wait((m) => m.t === 'react' && m.kind === 'laugh');

    judge.send({ t: 'next' });
    await host.wait((m) => m.t === 'state' && m.room.phase === 'draw' && m.room.round === 2);
    assert.notEqual(host.state.room.judgeId, judge.state.me);

    // вторая вкладка того же игрока вытесняет первую
    const dup = new Client(port);
    await dup.ready();
    const thirdToken = third.msgs.find((m) => m.t === 'joined').token;
    dup.send({ t: 'resume', code, token: thirdToken });
    await third.wait((m) => m.t === 'replaced');
    await dup.wait((m) => m.t === 'state');

    // хозяин исключает игрока
    host.send({ t: 'kick', id: dup.state.me });
    const left = await dup.wait((m) => m.t === 'left');
    assert.equal(left.reason, 'kicked');
    await host.wait((m) => m.t === 'state' && m.players.length === 2);

    // вышедший игрок не может вернуться по старому токену
    const ghost = new Client(port);
    await ghost.ready();
    ghost.send({ t: 'resume', code, token: thirdToken });
    assert.equal((await ghost.wait((m) => m.t === 'error')).code, 'NO_SESSION');

    for (const c of [host, ...clients, dup, ghost, third]) c.close();
  } finally {
    await stop();
  }
});

test('по сети: мусорные сообщения не роняют сервер', async () => {
  const { stop, port } = await startServer();
  try {
    const c = new Client(port);
    await c.ready();
    c.ws.send('не json');
    c.ws.send(JSON.stringify({ t: 'draw' }));
    const e = await c.wait((m) => m.t === 'error');
    assert.equal(e.code, 'NO_ROOM');
    c.send({ t: 'create', name: '' });
    assert.equal((await c.wait((m) => m.t === 'error' && m.code === 'NAME')).code, 'NAME');
    c.send({ t: 'ping' });
    await c.wait((m) => m.t === 'pong');
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.match(await page.text(), /ГРЯЗЬ/);
    const evil = await fetch(`http://127.0.0.1:${port}/..%2f..%2fpackage.json`);
    assert.notEqual(evil.status, 200);
    c.close();
  } finally {
    await stop();
  }
});
