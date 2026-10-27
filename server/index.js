'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room, GameError, makeCode, cleanText, LIMITS } = require('./game');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ROOM_IDLE_MS = 15 * 60 * 1000; // пустая комната живёт 15 минут
const STUN = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];

// Если задан TURN (переменные окружения на Render), браузеры чаще соединяются напрямую.
// Без него голос, который не прошёл напрямую, идёт через сам сервер игры (ретранслятор).
function iceServers() {
  const list = [{ urls: STUN }];
  if (process.env.TURN_URL) {
    list.push({ urls: process.env.TURN_URL.split(',').map((u) => u.trim()), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' });
  }
  return list;
}

const idBytes = (hex) => Buffer.from(hex, 'hex');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8'
};

function createServer({ now = () => Date.now(), tickMs = 250 } = {}) {
  const rooms = new Map();
  const sockets = new Map(); // ws -> { roomCode, playerId }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Не найдено');
        return;
      }
      const ext = path.extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
        'x-content-type-options': 'nosniff'
      });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });

  function send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function broadcast(room) {
    for (const [ws, info] of sockets) {
      if (info.roomCode === room.code && info.playerId) send(ws, room.view(info.playerId));
    }
  }

  function getRoom(code) {
    return rooms.get(String(code || '').trim());
  }

  function attach(ws, room, player) {
    // старое подключение того же игрока закрываем — он открыл игру в новой вкладке
    for (const [other, info] of sockets) {
      if (other !== ws && info.roomCode === room.code && info.playerId === player.id) {
        info.playerId = null;
        send(other, { t: 'replaced' });
        other.close(4000, 'replaced');
      }
    }
    const info = sockets.get(ws);
    info.roomCode = room.code;
    info.playerId = player.id;
    send(ws, { t: 'joined', code: room.code, token: player.token, id: player.id });
    room.setConnected(player.id, true);
    send(ws, room.view(player.id));
  }

  function makeRoom(password) {
    const code = makeCode(rooms);
    const room = new Room({ code, password, now });
    room.onChange(broadcast);
    rooms.set(code, room);
    return room;
  }

  function handle(ws, msg) {
    const info = sockets.get(ws);
    switch (msg.t) {
      case 'create': {
        const room = makeRoom(msg.password);
        if (msg.settings && typeof msg.settings === 'object') {
          const s = msg.settings;
          if (['clean', 'adult'].includes(s.deck)) room.settings.deck = s.deck;
        }
        const player = room.addPlayer(msg.name, msg.avatar);
        attach(ws, room, player);
        return;
      }
      case 'join': {
        const room = getRoom(msg.code);
        if (!room) throw new GameError('NO_ROOM', 'Комнаты с таким кодом нет');
        if (!room.checkPassword(msg.password)) throw new GameError('BAD_PASSWORD', 'Неверный пароль');
        const player = room.addPlayer(msg.name, msg.avatar);
        attach(ws, room, player);
        return;
      }
      case 'resume': {
        const room = getRoom(msg.code);
        const player = room && room.byToken(String(msg.token || ''));
        if (!player) throw new GameError('NO_SESSION', 'Игра уже закончилась');
        attach(ws, room, player);
        return;
      }
      case 'peek': {
        // проверка кода из ссылки-приглашения: есть ли комната и нужен ли пароль
        const room = getRoom(msg.code);
        send(ws, { t: 'peek', code: msg.code, exists: !!room, hasPassword: !!(room && room.password), players: room ? room.players.size : 0 });
        return;
      }
      case 'ping':
        send(ws, { t: 'pong', serverNow: now() });
        return;
      default:
        break;
    }

    const room = info.roomCode && getRoom(info.roomCode);
    if (!room || !info.playerId) throw new GameError('NO_ROOM', 'Вы не в комнате');
    const id = info.playerId;
    switch (msg.t) {
      case 'settings':
        return room.setSettings(id, msg.settings);
      case 'start':
        return room.start(id);
      case 'draw':
        return room.draw(id);
      case 'redraw':
        return room.redraw(id);
      case 'submit':
        return room.submit(id, msg.text);
      case 'retract':
        return room.retract(id);
      case 'flip':
        return room.flip(id, msg.index);
      case 'pick':
        return room.pick(id, msg.index);
      case 'next':
        return room.next(id);
      case 'kick': {
        const target = String(msg.id || '');
        room.requireHost(id);
        for (const [other, o] of sockets) {
          if (o.roomCode === room.code && o.playerId === target && target !== id) {
            o.playerId = null;
            o.roomCode = null;
            send(other, { t: 'left', reason: 'kicked' });
          }
        }
        return room.kick(id, target);
      }
      case 'lobby':
        return room.toLobby(id);
      case 'avatar':
        return room.setAvatar(id, msg.avatar);
      case 'voice':
        return handleVoice(ws, room, id, msg);
      case 'react': {
        const emoji = ['laugh', 'fire', 'skull', 'clap'].includes(msg.kind) ? msg.kind : null;
        if (!emoji) return;
        for (const [other, o] of sockets) {
          if (o.roomCode === room.code && o.playerId) send(other, { t: 'react', from: id, kind: emoji });
        }
        return;
      }
      case 'leave': {
        info.playerId = null;
        info.roomCode = null;
        room.removePlayer(id);
        send(ws, { t: 'left' });
        return;
      }
      default:
        throw new GameError('BAD', 'Неизвестная команда');
    }
  }

  function socketsOf(room, playerId) {
    const out = [];
    for (const [other, o] of sockets) if (o.roomCode === room.code && o.playerId === playerId) out.push(other);
    return out;
  }

  function handleVoice(ws, room, id, msg) {
    switch (msg.a) {
      case 'join': {
        const peers = room.voiceJoin(id, !!msg.muted);
        send(ws, { t: 'voice:joined', ok: true, me: id, peers, ice: iceServers() });
        return;
      }
      case 'leave':
        return room.voiceLeave(id);
      case 'mute':
        return room.voiceMute(id, !!msg.muted);
      case 'signal': {
        const to = String(msg.to || '');
        if (!room.inVoice(id) || !room.inVoice(to) || !msg.data || typeof msg.data !== 'object') return;
        for (const other of socketsOf(room, to)) send(other, { t: 'voice:signal', from: id, data: msg.data });
        return;
      }
      default:
        throw new GameError('BAD', 'Неизвестная команда голоса');
    }
  }

  // ретранслятор: [число адресатов][по 6 байт на адресата][звук] → каждому [6 байт отправителя][звук]
  function relayAudio(ws, data) {
    const info = sockets.get(ws);
    if (!info || !info.playerId) return;
    const room = getRoom(info.roomCode);
    if (!room || !room.inVoice(info.playerId) || room.players.get(info.playerId).voice === 'muted') return;
    const t = now();
    info.vbucket = Math.min(80, info.vbucket + ((t - info.vlast) / 1000) * 40);
    info.vlast = t;
    if (info.vbucket < 1) return;
    info.vbucket -= 1;
    const buf = Buffer.isBuffer(data) ? data : Buffer.concat(data);
    const n = buf[0];
    const head = 1 + n * 6;
    if (!n || n > 9 || buf.length <= head || buf.length - head > 2048) return;
    const audio = buf.subarray(head);
    const out = Buffer.concat([idBytes(info.playerId), audio]);
    for (let i = 0; i < n; i++) {
      const to = buf.subarray(1 + i * 6, 7 + i * 6).toString('hex');
      if (to === info.playerId || !room.inVoice(to)) continue;
      for (const other of socketsOf(room, to)) if (other.readyState === 1) other.send(out, { binary: true });
    }
  }

  wss.on('connection', (ws) => {
    sockets.set(ws, { roomCode: null, playerId: null, alive: true, bucket: 30, last: now(), vbucket: 80, vlast: now(), sbucket: 120, slast: now() });
    ws.on('pong', () => {
      const info = sockets.get(ws);
      if (info) info.alive = true;
    });
    ws.on('message', (raw, isBinary) => {
      const info = sockets.get(ws);
      if (!info) return;
      if (isBinary) {
        relayAudio(ws, raw);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      const t = now();
      if (msg.t === 'voice' && msg.a === 'signal') {
        // знакомство браузеров шлёт пачку сообщений сразу — у него свой запас
        info.sbucket = Math.min(120, info.sbucket + ((t - info.slast) / 1000) * 40);
        info.slast = t;
        if (info.sbucket < 1) return;
        info.sbucket -= 1;
      } else {
        // простой ограничитель: 30 сообщений с пополнением 15 в секунду
        info.bucket = Math.min(30, info.bucket + ((t - info.last) / 1000) * 15);
        info.last = t;
        if (info.bucket < 1) return;
        info.bucket -= 1;
      }
      try {
        handle(ws, msg);
      } catch (err) {
        if (err instanceof GameError) send(ws, { t: 'error', code: err.code, message: err.message, for: msg.t });
        else {
          console.error(err);
          send(ws, { t: 'error', code: 'SERVER', message: 'Что-то пошло не так', for: msg.t });
        }
      }
    });
    ws.on('close', () => {
      const info = sockets.get(ws);
      sockets.delete(ws);
      if (!info || !info.playerId) return;
      const room = getRoom(info.roomCode);
      if (!room) return;
      const stillHere = [...sockets.values()].some((o) => o.roomCode === room.code && o.playerId === info.playerId);
      if (!stillHere) room.setConnected(info.playerId, false);
    });
  });

  const ticker = setInterval(() => {
    const t = now();
    for (const [code, room] of rooms) {
      try {
        room.tick();
      } catch (err) {
        console.error('tick', code, err);
      }
      const anyone = room.connected().length > 0;
      if (!anyone && t - room.lastActive > ROOM_IDLE_MS) rooms.delete(code);
    }
  }, tickMs);

  const heartbeat = setInterval(() => {
    for (const [ws, info] of sockets) {
      if (!info.alive) {
        ws.terminate();
        continue;
      }
      info.alive = false;
      try {
        ws.ping();
      } catch {}
    }
  }, 25000);

  function stop() {
    clearInterval(ticker);
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    return new Promise((resolve) => server.close(() => resolve()));
  }
  server.on('close', () => {
    clearInterval(ticker);
    clearInterval(heartbeat);
  });

  return { server, rooms, wss, stop };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = createServer();
  server.listen(port, () => console.log(`ГРЯЗЬ слушает порт ${port}`));
}

module.exports = { createServer, cleanText, LIMITS };
