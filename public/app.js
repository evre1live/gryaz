import { Sound } from './sound.js';
import { Confetti } from './fx.js';

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
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><path d="M12 19h.01"/>'
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

function ava(p, cls = '') {
  return h('span', { class: `ava ${cls}`.trim(), style: { background: p.color }, 'aria-hidden': 'true' }, initials(p.name));
}

function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
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
      out.push(h('span', { class: 'nowrap' }, lead, fill ? h('q', {}, fill) : h('span', { class: 'blank', 'aria-label': 'пропуск' }), tail));
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
  drafts: {},
  chosen: null,
  lastTick: null
};

const serverNow = () => Date.now() + S.offset;
const me = () => S.state && S.state.players.find((p) => p.id === S.state.me);
const playerById = (id) => S.state && S.state.players.find((p) => p.id === id);
const isHost = () => S.state && S.state.room.hostId === S.state.me;
const isJudge = () => S.state && S.state.room.judgeId === S.state.me;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
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
      break;
    case 'state': {
      S.prev = S.state;
      S.state = m;
      S.offset = m.serverNow - Date.now();
      render();
      react(m, S.prev);
      break;
    }
    case 'error':
      S.busy = null;
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
      case 'redrawn':
        Sound.play('deal');
        announce(`Вопрос: ${String(st.question?.text || '').replace(/___/g, 'пропуск')}`);
        break;
      case 'answered':
        if (ev.id !== myId) Sound.play('tap');
        break;
      case 'judging':
        Sound.play('deal');
        break;
      case 'flip':
        Sound.play('flip');
        break;
      case 'picked': {
        const winner = st.players.find((p) => p.id === ev.winnerId);
        if (ev.winnerId === myId) {
          Sound.play('win');
          const r = $('.ans.win')?.getBoundingClientRect();
          Confetti.burst(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + 40 : innerHeight / 2, 110);
        } else Sound.play('point');
        announce(winner ? `Очко получает ${winner.name}` : 'Очко получает игрок, который ушёл');
        break;
      }
      case 'final':
        Sound.play('fanfare');
        break;
      case 'round':
        if (prev.room.phase === 'result' || prev.room.phase === 'lobby' || prev.room.phase === 'final') Sound.play('pop');
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
  const el = h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, h('img', { src: '/wordmark.svg', alt: 'ГРЯЗЬ', class: 'brand-word', width: 116, height: 43 }), roomChip),
    roundInfo,
    h('div', { class: 'top-actions' }, deckChip, soundBtn, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Выйти из комнаты', title: 'Выйти', onclick: confirmLeave }, icon('exit')))
  );
  const paintSound = () => {
    soundBtn.replaceChildren(icon(Sound.muted ? 'mute' : 'sound'));
    soundBtn.setAttribute('aria-label', Sound.muted ? 'Включить звук' : 'Выключить звук');
    soundBtn.setAttribute('aria-pressed', String(!Sound.muted));
  };
  paintSound();
  return {
    el,
    paintSound,
    update(st) {
      fill(roomChip, st.room.hasPassword ? icon('lock', 'icon icon-sm') : null, h('span', { class: 'room-word' }, 'Комната '), st.room.code);
      const deck = st.room.decks.find((d) => d.id === st.room.settings.deck);
      deckChip.textContent = deck ? deck.title : '';
      if (st.room.phase === 'lobby') roundInfo.replaceChildren(h('span', {}, 'Ждём игроков'));
      else roundInfo.replaceChildren(h('b', {}, `Раунд ${st.room.round}`), h('span', {}, `игра до ${st.room.settings.target} ${plural(st.room.settings.target, ['очка', 'очков', 'очков'])}`));
    }
  };
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

// ---------- экран входа ----------

function EntryScreen() {
  const nameIn = h('input', { type: 'text', id: 'name', maxlength: 18, autocomplete: 'nickname', placeholder: 'Как вас называть', value: S.name || '' });
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
        if (send({ t: 'create', name, password: pwCreate.value, settings: { deck } })) {
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
        if (send({ t: 'join', code, password: pwJoin.value, name })) {
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
    h('div', { class: 'hero' }, h('img', { src: '/logo.svg', alt: 'ГРЯЗЬ', width: 620, height: 187 }), h('p', {}, 'Вопросы — из колоды. Ответы — из вашей головы.')),
    h('div', { class: 'entry-name' }, h('label', { class: 'field', for: 'name' }, 'Ваше имя', nameIn)),
    h('div', { class: 'entry-forms' }, createForm, joinForm),
    h(
      'div',
      { class: 'rules', 'aria-label': 'Как играть' },
      h('div', { class: 'rule' }, h('b', {}, '1'), h('span', {}, 'Игроки по очереди тянут вопрос и становятся судьёй раунда.')),
      h('div', { class: 'rule' }, h('b', {}, '2'), h('span', {}, 'Остальные пишут ответ своими словами — никаких готовых карт.')),
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
  const timePills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Время на ответ' });
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
        h('div', { class: 'group' }, h('span', {}, 'Время на ответ'), timePills),
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
            h('div', { class: 'ava-wrap' }, ava(p, 'ava-lg'), p.id === st.room.hostId ? crown() : null),
            h('span', { class: 'name' }, p.name),
            h('span', { class: 'note' }, p.id === st.me ? 'это вы' : p.connected ? (p.id === st.room.hostId ? 'хозяин' : 'за столом') : 'не в сети')
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
      if (next && !raf) raf = requestAnimationFrame(frame);
    },
    stop() {
      cfg = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

function statusText(p, st) {
  if (!p.connected) return { cls: '', node: 'Не в сети' };
  const ph = st.room.phase;
  if (p.status === 'judge') return { cls: 'judge', node: ph === 'draw' ? 'Тянет вопрос · судья' : 'Судья раунда' };
  if (ph === 'write' && p.status === 'ready') return { cls: 'ready', node: [icon('check', 'icon icon-sm'), 'Ответ на столе'] };
  if (ph === 'write') return { cls: '', node: ['Пишет', h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))] };
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
            { class: `prow${p.id === st.me ? ' me' : ''}${p.status === 'judge' ? ' judge' : ''}${p.connected ? '' : ' away'}` },
            ava(p),
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

// Розыгрыш: колода → вопрос → ответы.
function PlayStage() {
  const deck = h('div', { class: 'deck' }, h('div', { class: 'dc' }), h('div', { class: 'dc' }));
  const qslot = h('div', { class: 'qslot' }, deck);
  const aslot = h('div', { class: 'aslot' });
  const el = h('div', { class: 'play' }, qslot, aslot);
  let deckTop = null;
  let qKey = null;
  let aMode = null;
  let answerUI = null;

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
  }

  function paintQuestion(st, prev) {
    const q = st.question;
    const key = q ? `${q.deck}:${q.no}` : null;
    if (key === qKey) return;
    qKey = key;
    qslot.querySelector('.qcard')?.remove();
    if (!q) return;
    const fromDeck = prev && (prev.room.phase === 'draw' || (prev.question && prev.question.no !== q.no));
    qslot.append(QuestionCard(q, fromDeck && !reduceMotion ? 'deal' : 'fade'));
  }

  function paintAnswer(st) {
    const ph = st.room.phase;
    const judge = isJudge();
    let mode;
    if (ph === 'draw') mode = judge ? 'judge-draw' : 'wait-draw';
    else if (judge) mode = 'judge-write';
    else mode = st.myAnswer != null ? 'placed' : 'edit';
    if (mode !== aMode) {
      aMode = mode;
      aslot.className = mode === 'edit' || mode === 'placed' ? 'aslot' : 'aslot wide';
      answerUI = null;
      aslot.replaceChildren();
      if (mode === 'judge-draw') {
        aslot.append(
          h(
            'div',
            { class: 'judge-panel' },
            h('h3', {}, 'Ты судья этого раунда'),
            h('p', {}, 'Вытяни вопрос — нажми на колоду. Потом прочитай его вслух, пока остальные пишут ответы.'),
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
        aslot.append(h('div', { class: 'judge-panel' }, h('h3', {}, 'Сейчас будет вопрос'), h('p', { class: 'wait-note' }), h('p', {}, 'Когда вопрос появится, напиши на чистой карте самый смешной ответ.')));
      } else if (mode === 'judge-write') {
        answerUI = JudgeWaitPanel();
        aslot.append(answerUI.el);
      } else if (mode === 'edit') {
        answerUI = AnswerEditor(st);
        aslot.append(answerUI.el);
        if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => answerUI && answerUI.focus && answerUI.focus(), 700);
      } else if (mode === 'placed') {
        answerUI = PlacedAnswer();
        aslot.append(answerUI.el);
      }
    }
    if (answerUI && answerUI.update) answerUI.update(st);
    const judgeP = playerById(st.room.judgeId);
    const waitNote = aslot.querySelector('.wait-note');
    if (waitNote) waitNote.textContent = judgeP ? `${judgeP.name} тянет вопрос из колоды.` : 'Судья тянет вопрос.';
  }

  return {
    el,
    update(st, prev) {
      el.classList.toggle('writing', !!st.question);
      paintDeck(st);
      paintQuestion(st, prev);
      paintAnswer(st);
    },
    tick(st) {
      const note = aslot.querySelector('.auto-note');
      if (note && st.room.phase === 'draw' && st.deadline) {
        const sec = Math.max(0, Math.ceil((st.deadline - serverNow()) / 1000));
        note.textContent = `Через ${sec} ${plural(sec, ['секунду', 'секунды', 'секунд'])} колода сама выдаст вопрос.`;
      }
    }
  };
}

function AnswerEditor(st) {
  const round = st.room.round;
  const draftKey = `${st.room.code}:${round}`;
  const ta = h('textarea', { id: 'answer', maxlength: 90, rows: 4, placeholder: 'Напиши что-нибудь острое…', 'aria-describedby': 'answer-count' });
  ta.value = S.drafts[draftKey] || '';
  const count = h('span', { class: 'count', id: 'answer-count' });
  const submit = h('button', { class: 'btn btn-primary', type: 'button' }, 'Положить на стол');
  const clear = h('button', { class: 'btn', type: 'button' }, 'Стереть');
  const card = h(
    'div',
    { class: 'card acard edit' },
    h('label', { class: 'cap', for: 'answer' }, 'Твой ответ'),
    ta,
    h('div', { class: 'meta' }, h('span', {}, 'Судья не увидит, чей ответ'), count)
  );
  const el = h('div', { style: { display: 'contents' } }, card, h('div', { class: 'btn-row' }, clear, submit));
  const paint = () => {
    const n = ta.value.length;
    count.textContent = `${n} / 90`;
    count.classList.toggle('warn', n >= 80);
    submit.disabled = !ta.value.trim() || !S.open;
    S.drafts[draftKey] = ta.value;
  };
  const doSubmit = () => {
    const text = ta.value.trim();
    if (!text) {
      ta.focus();
      return;
    }
    Sound.ensure();
    if (send({ t: 'submit', text })) Sound.play('place');
  };
  ta.addEventListener('input', paint);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      doSubmit();
    }
  });
  clear.addEventListener('click', () => {
    ta.value = '';
    paint();
    ta.focus();
  });
  submit.addEventListener('click', doSubmit);
  paint();
  return { el, focus: () => ta.focus({ preventScroll: true }), update: paint };
}

function PlacedAnswer() {
  const text = h('p', { class: 'hand', style: { margin: 0 } });
  const card = h('div', { class: 'card acard placed' }, h('span', { class: 'cap' }, 'Твой ответ на столе'), text, h('span', { class: 'stamp' }, 'Принято'));
  const edit = h(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: () => {
        const k = `${S.state.room.code}:${S.state.room.round}`;
        S.drafts[k] = S.state.myAnswer || '';
        send({ t: 'retract' });
      }
    },
    icon('pencil'),
    'Изменить'
  );
  const el = h('div', { style: { display: 'contents' } }, card, h('div', { class: 'btn-row' }, edit));
  return {
    el,
    update(st) {
      text.textContent = st.myAnswer || '';
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
    h('h3', {}, 'Ты судья — сегодня не пишешь'),
    h('p', {}, 'Прочитай вопрос вслух. Когда все ответят, карты перевернёшь ты.'),
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
      line.textContent = `На столе ${n} ${plural(n, ['ответ', 'ответа', 'ответов'])} из ${total}`;
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
      grid.append(h('div', { class: 'empty-round' }, st.result && st.result.empty ? 'Никто не успел ответить — раунд без очков.' : 'Ответов нет.'));
      return;
    }
    st.cards.forEach((c, i) => {
      const back = h('div', { class: 'face back card backcard' }, h('img', { src: '/mark.svg', alt: '' }));
      const textEl = h('p', { class: 'hand', style: { margin: 0 } });
      const mineTag = h('span', { class: 'mine-tag', hidden: true }, 'твой');
      const front = h('div', { class: 'face front card acard' }, h('span', { class: 'cap' }, `Ответ ${c.letter}`, ' ', mineTag), textEl, h('span', { class: 'meta' }, h('span', {}, 'автор скрыт')));
      const flip = h('button', { class: 'flip', type: 'button', 'aria-label': `Перевернуть ответ ${c.letter}` }, h('div', { class: 'inner' }, back, front));
      const action = h('button', { class: 'btn btn-block', type: 'button' });
      const who = h('div', { class: 'who' });
      const box = h('div', { class: 'ans', style: { animationDelay: `${i * 0.12}s` } }, flip, action, who);
      const item = { c, box, flip, textEl, mineTag, meta: front.querySelector('.meta span'), front, action, who, flipped: null };
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
      it.meta.textContent = c.authorName ? c.authorName : c.mine ? 'это твой ответ' : 'автор скрыт';
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
      sub.textContent = judge ? `Ты судья раунда ${st.room.round}` : `Раунд ${st.room.round} · судья ${jn}`;
      title.textContent = judge ? 'Тяни вопрос из колоды' : `${jn} тянет вопрос`;
    } else if (ph === 'write') {
      sub.textContent = judge ? 'Ты судья — сегодня не пишешь' : `Судья — ${jn}`;
      title.textContent = judge ? 'Прочитай вопрос вслух' : st.myAnswer != null ? 'Ответ на столе — ждём остальных' : 'Напиши свой ответ';
    } else if (ph === 'judge') {
      const left = st.cards.filter((c) => !c.flipped).length;
      sub.textContent = judge ? 'Ты судья этого раунда' : `Судья — ${jn}`;
      if (judge) title.textContent = left ? `Переверни ${left === st.cards.length ? 'карты' : `ещё ${left}`} и прочитай вслух` : 'Выбери самый смешной ответ';
      else title.textContent = left ? `${jn} читает ответы` : `${jn} выбирает лучший ответ`;
    } else if (ph === 'result') {
      const r = st.result || {};
      sub.textContent = `Раунд ${st.room.round}`;
      if (r.judgeLost) title.textContent = 'Судья пропал — раунд без очков';
      else if (r.empty || !r.winnerId) title.textContent = 'Никто не успел ответить';
      else if (r.winnerId === st.me) title.textContent = 'Твой ответ победил! +1 очко';
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
        `На столе ${st.answered} ${plural(st.answered, ['ответ', 'ответа', 'ответов'])} из ${st.expected}` +
        (waiting.length && waiting.length <= 3 ? ` · ещё ${waiting.length === 1 ? 'пишет' : 'пишут'}: ${names.join(', ').replace(/, ([^,]*)$/, ' и $1')}` : '');
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
  const pair = h('div', { class: 'pair' });
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
            ava(p),
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
        Confetti.rain(iWon ? 6000 : 3500);
        setTimeout(() => {
          const r = pair.getBoundingClientRect();
          Confetti.burst(r.width ? r.left + r.width / 2 : innerWidth / 2, r.width ? r.top + 40 : innerHeight / 2, 90);
        }, 500);
      }
    },
    destroy() {
      Confetti.stop();
    }
  };
}

const SCREENS = { entry: EntryScreen, lobby: LobbyScreen, game: GameScreen, final: FinalScreen };

// =====================================================================
// Старт
// =====================================================================

addEventListener('pointerdown', () => Sound.ensure(), { once: true, capture: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.ws && S.ws.readyState > 1 && !S.replaced) connect();
});
render();
connect();
