// Конструктор персонажей ГРЯЗИ: плоские «наклейки» с толстым контуром,
// в цветах игры. Персонаж — набор небольших чисел, сервер хранит только их.

export const SPEC = {
  skin: 8,
  face: 4,
  eyes: 8,
  brows: 6,
  mouth: 10,
  hair: 16,
  hairColor: 10,
  beard: 6,
  acc: 10,
  hat: 12,
  extra: 6,
  top: 6,
  topColor: 8,
  bg: 8
};

const INK = '#141414';
const SKIN = ['#FFDBC4', '#F6C9A4', '#E8B48A', '#C98C5E', '#A26B43', '#7A4B2C', '#B8E0A2', '#BFD0F5'];
const HAIR = ['#1B1B1E', '#4A3020', '#7A4A24', '#B5702F', '#E2B04A', '#ECE6DA', '#C8102E', '#FF8FC7', '#5B8CFF', '#6FCB86'];
const BG = ['#FFB4A2', '#A7C7E7', '#E9D8A6', '#C9B6F2', '#9ED9C8', '#F7C6DD', '#BFD7A5', '#F2C38F'];
const TOP = ['#C8102E', '#1E1E23', '#F5F0E6', '#4E7BEA', '#2F6B57', '#E8A64B', '#8F7BD8', '#7A6E62'];
const RED = '#C8102E';
const GOLD = '#E9B949';

export const PALETTES = { skin: SKIN, hairColor: HAIR, bg: BG, topColor: TOP };

export const LABELS = {
  skin: 'Кожа',
  face: 'Лицо',
  eyes: 'Глаза',
  brows: 'Брови',
  mouth: 'Рот',
  hair: 'Причёска',
  hairColor: 'Цвет волос',
  beard: 'Усы и борода',
  acc: 'На лице',
  hat: 'На голове',
  extra: 'Детали',
  top: 'Одежда',
  topColor: 'Цвет одежды',
  bg: 'Фон'
};

export const GROUPS = [
  { id: 'face', title: 'Лицо', keys: ['skin', 'face', 'eyes', 'brows', 'mouth'] },
  { id: 'hair', title: 'Волосы', keys: ['hair', 'hairColor', 'beard'] },
  { id: 'stuff', title: 'Аксессуары', keys: ['hat', 'acc', 'extra'] },
  { id: 'look', title: 'Одежда и фон', keys: ['top', 'topColor', 'bg'] }
];

export function normalize(raw) {
  const out = {};
  for (const [k, n] of Object.entries(SPEC)) {
    const v = Number(raw && raw[k]);
    out[k] = Number.isInteger(v) && v >= 0 && v < n ? v : 0;
  }
  return out;
}

export function randomAvatar(rng = Math.random) {
  const pick = (n) => Math.floor(rng() * n);
  const a = {};
  for (const [k, n] of Object.entries(SPEC)) a[k] = pick(n);
  // аксессуары не на всех — так толпа разнообразнее
  if (rng() < 0.45) a.hat = 0;
  if (rng() < 0.5) a.acc = 0;
  if (rng() < 0.55) a.beard = 0;
  if (rng() < 0.4) a.extra = 0;
  if (rng() < 0.85 && a.skin >= 6) a.skin = pick(6);
  return a;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const S = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
const L = `fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;

// ---------- голова ----------
const HEADS = [
  { shape: `<ellipse cx="60" cy="57" rx="23" ry="27"/>`, ears: [37, 83] },
  { shape: `<circle cx="60" cy="58" r="25"/>`, ears: [35.5, 84.5] },
  { shape: `<rect x="36" y="31" width="48" height="52" rx="17"/>`, ears: [36.5, 83.5] },
  { shape: `<ellipse cx="60" cy="56" rx="21" ry="29"/>`, ears: [39, 81] }
];

function head(a) {
  const skin = SKIN[a.skin];
  const h = HEADS[a.face];
  const ear = (x) => `<ellipse cx="${x}" cy="60" rx="5" ry="6.5" fill="${skin}" ${S}/><path d="M${x + (x < 60 ? 1.5 : -1.5)} 58 q${x < 60 ? -2 : 2} 2 0 4" ${L} stroke-width="1.6"/>`;
  return `${ear(h.ears[0])}${ear(h.ears[1])}<g fill="${skin}" ${S}>${h.shape}</g>`;
}

// ---------- одежда ----------
function body(a) {
  const skin = SKIN[a.skin];
  const c = TOP[a.topColor];
  const dark = shade(c, -0.12);
  const torso = `M12 122 C12 101 32 92 60 92 C88 92 108 101 108 122 Z`;
  const neck = `<path d="M51 78 L51 95 C55 99 65 99 69 95 L69 78 Z" fill="${shade(skin, -0.06)}" ${S}/>`;
  switch (a.top) {
    case 1: // худи
      return `<path d="M30 100 C30 84 44 80 60 80 C76 80 90 84 90 100" fill="${dark}" ${S}/>${neck}<path d="${torso}" fill="${c}" ${S}/><path d="M44 94 C48 104 72 104 76 94" ${L}/><path d="M53 100 L52 112 M67 100 L68 112" ${L} stroke-width="2"/>`;
    case 2: // пиджак и галстук
      return `${neck}<path d="${torso}" fill="#1E1E23" ${S}/><path d="M46 92 L60 116 L74 92 Z" fill="#F5F0E6" ${S}/><path d="M57 98 L60 95 L63 98 L61.5 112 L60 115 L58.5 112 Z" fill="${c === '#1E1E23' ? RED : c}" ${S} stroke-width="2"/><path d="M46 92 L54 106 M74 92 L66 106" ${L} stroke-width="2"/>`;
    case 3: // майка
      return `${neck}<path d="${torso}" fill="${skin}" ${S}/><path d="M38 122 L40 102 C46 108 52 110 60 110 C68 110 74 108 80 102 L82 122 Z" fill="${c}" ${S}/><path d="M40 102 L42 94 M80 102 L78 94" ${L} stroke-width="4" stroke="${c}"/>`;
    case 4: // водолазка
      return `<path d="${torso}" fill="${c}" ${S}/><path d="M48 80 L48 98 C54 102 66 102 72 98 L72 80 Z" fill="${dark}" ${S}/><path d="M48 87 L72 87 M48 93 L72 93" ${L} stroke-width="1.6"/>`;
    case 5: { // полоски
      const stripe = c === '#F5F0E6' ? RED : '#F5F0E6';
      return `${neck}<path d="${torso}" fill="${c}" ${S}/><g stroke="${stripe}" stroke-width="4"><path d="M18 106 L102 106"/><path d="M14 115 L106 115"/></g><path d="${torso}" fill="none" ${S}/><path d="M48 92 C52 99 68 99 72 92" ${L}/>`;
    }
    default: // футболка
      return `${neck}<path d="${torso}" fill="${c}" ${S}/><path d="M47 92 C50 100 70 100 73 92" ${L}/>`;
  }
}

// ---------- волосы: что за головой и что поверх ----------
function hairBack(a) {
  const c = HAIR[a.hairColor];
  switch (a.hair) {
    case 4:
      return `<circle cx="60" cy="46" r="35" fill="${c}" ${S}/>`;
    case 6:
      return `<g fill="${c}" ${S}><path d="M33 52 C18 52 14 72 22 86 C26 76 30 66 36 62 Z"/><path d="M87 52 C102 52 106 72 98 86 C94 76 90 66 84 62 Z"/></g><g fill="${RED}" ${S} stroke-width="2"><circle cx="33" cy="58" r="4"/><circle cx="87" cy="58" r="4"/></g>`;
    case 7:
      return `<path d="M34 50 C33 24 87 24 86 50 L92 104 C80 108 40 108 28 104 Z" fill="${c}" ${S}/>`;
    case 8:
      return `<path d="M38 58 L30 96 C38 98 42 92 44 86 L42 66 Z M82 58 L90 96 C82 98 78 92 76 86 L78 66 Z" fill="${c}" ${S}/>`;
    case 15:
      return `<path d="M78 34 C100 36 104 66 94 92 C90 76 86 62 80 54 Z" fill="${c}" ${S}/><circle cx="84" cy="44" r="4" fill="${RED}" ${S} stroke-width="2"/>`;
    default:
      return '';
  }
}

function hairFront(a) {
  const c = HAIR[a.hairColor];
  const g = (d, extra = '') => `<path d="${d}" fill="${c}" ${S}/>${extra}`;
  const cap = 'M36 52 C34 30 47 24 60 24 C73 24 86 30 84 52 C80 42 72 37 60 37 C48 37 40 42 36 52 Z';
  switch (a.hair) {
    case 0: // лысый с бликом
      return `<path d="M50 36 C54 32 60 31 64 32" fill="none" stroke="#fff" stroke-opacity="0.65" stroke-width="3" stroke-linecap="round"/>`;
    case 1:
      return g(cap);
    case 2:
      return g('M36 52 L33 34 L42 38 L43 23 L52 31 L58 18 L64 30 L72 21 L74 33 L85 30 L84 52 C80 42 72 37 60 37 C48 37 40 42 36 52 Z');
    case 3:
      return g('M54 40 C51 22 55 8 60 5 C65 8 69 22 66 40 Z') + `<path d="M40 44 C44 40 48 38 52 38 M80 44 C76 40 72 38 68 38" fill="none" stroke="${c}" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round"/>`;
    case 4:
      return g('M36 47 C31 31 45 21 60 23 C75 21 89 31 84 47 C79 39 71 35 60 35 C49 35 41 39 36 47 Z');
    case 5:
      return g(cap) + `<circle cx="60" cy="17" r="9" fill="${c}" ${S}/>`;
    case 6:
      return g(cap);
    case 7:
      return g('M36 52 C35 32 48 25 60 25 C72 25 85 32 84 52 C80 46 75 42 69 41 L65 47 L59 40 C49 40 41 45 36 52 Z');
    case 8:
      return g('M37 50 C35 31 47 25 60 25 C73 25 85 31 83 50 C79 42 72 38 60 38 C48 38 41 42 37 50 Z');
    case 9:
      return g('M36 52 C33 34 40 21 53 17 C68 11 88 15 90 28 C82 25 75 29 73 38 C66 36 52 36 44 42 C40 45 38 48 36 52 Z');
    case 10:
      return `<g fill="${c}" ${S}>${[[39, 44], [44, 34], [52, 27], [61, 25], [70, 28], [77, 35], [81, 45]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7.5"/>`).join('')}</g><path d="M38 46 C44 38 52 34 60 34 C70 34 78 39 82 46" fill="${c}" stroke="none"/>`;
    case 11:
      return g('M36 53 C33 31 50 23 65 25 C79 26 87 37 84 53 C82 42 77 36 68 35 C60 40 47 43 36 53 Z') + `<path d="M66 26 L68 35" ${L} stroke-width="1.8"/>`;
    case 12:
      return `<path d="${cap}" fill="${c}" fill-opacity="0.55" ${S} stroke-opacity="0.6"/>`;
    case 13:
      return g('M36 50 C36 30 50 24 62 24 C77 24 86 33 84 52 C81 57 76 63 71 67 C69 56 65 46 58 40 C50 40 42 44 36 50 Z');
    case 14: {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const ang = Math.PI + (i / 14) * Math.PI;
        const r = i % 2 ? 26 : 36;
        pts.push(`${(60 + Math.cos(ang) * r * 1.08).toFixed(1)} ${(48 + Math.sin(ang) * r).toFixed(1)}`);
      }
      return g(`M36 52 L${pts.join(' L')} L84 52 C80 42 72 37 60 37 C48 37 40 42 36 52 Z`);
    }
    case 15:
      return g(cap);
    default:
      return g(cap);
  }
}

// ---------- лицо ----------
function eyes(a) {
  const w = (x, y, r = 6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" ${S} stroke-width="2.2"/>`;
  const p = (x, y, r = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>`;
  switch (a.eyes) {
    case 1:
      return w(50, 55) + w(70, 55) + p(51, 56) + p(71, 56) + `<circle cx="52" cy="54.6" r="1" fill="#fff"/><circle cx="72" cy="54.6" r="1" fill="#fff"/>`;
    case 2:
      return w(50, 56, 5.5) + w(70, 56, 5.5) + p(50, 57.5, 2.6) + p(70, 57.5, 2.6) + `<path d="M44.5 55 C47 51 53 51 55.5 55 M64.5 55 C67 51 73 51 75.5 55" fill="${SKIN[a.skin]}" ${S} stroke-width="2.2"/>`;
    case 3:
      return `<path d="M45 57 C47 52 53 52 55 57 M65 57 C67 52 73 52 75 57" ${L}/>`;
    case 4:
      return w(50, 56, 5.5) + w(70, 56, 5.5) + p(51, 57, 2.6) + p(69, 57, 2.6) + `<path d="M44 51 L56 55 M76 51 L64 55" ${L}/>`;
    case 5:
      return p(50, 55, 3.2) + `<path d="M65 56 C67 52 73 52 75 56" ${L}/>`;
    case 6:
      return w(49, 55, 7.5) + w(71, 56, 4.5) + p(46, 57, 3.4) + p(73, 54, 2.2);
    case 7:
      return p(50, 56, 3.4) + p(70, 56, 3.4) + `<path d="M45 52 L43.5 49.5 M48 50.5 L47.5 47.5 M75 52 L76.5 49.5 M72 50.5 L72.5 47.5" ${L} stroke-width="1.8"/>`;
    default:
      return p(50, 56, 3.3) + p(70, 56, 3.3);
  }
}

function brows(a) {
  const c = a.hair === 0 || a.hair === 12 ? shade(HAIR[a.hairColor], -0.2) : HAIR[a.hairColor];
  const line = (d, w = 3) => `<path d="${d}" fill="none" stroke="${c === '#ECE6DA' ? '#8A8478' : INK}" stroke-width="${w}" stroke-linecap="round"/>`;
  switch (a.brows) {
    case 1:
      return line('M45 47 L55 47 M65 47 L75 47');
    case 2:
      return line('M45 47 C48 43 53 43 55 46 M65 46 C67 43 72 43 75 47');
    case 3:
      return line('M45 45 L55 49 M75 45 L65 49');
    case 4:
      return line('M45 49 L55 45 M75 49 L65 45');
    case 5:
      return line('M44 47 C50 44 56 45 60 47 C64 45 70 44 76 47', 4.2);
    default:
      return '';
  }
}

function nose(a) {
  return a.acc === 7 ? '' : `<path d="M59 60 C58 64 59 66 62.5 66" ${L} stroke-width="2.2"/>`;
}

function mouth(a) {
  switch (a.mouth) {
    case 1:
      return `<path d="M50 70 L70 70 C69 79 51 79 50 70 Z" fill="#fff" ${S} stroke-width="2.2"/><path d="M50.5 72.5 L69.5 72.5" ${L} stroke-width="1.4"/>`;
    case 2:
      return `<path d="M52 73 C58 76 64 74 69 68" ${L}/>`;
    case 3:
      return `<path d="M49 69 L71 69 C70 82 50 82 49 69 Z" fill="#3A1218" ${S} stroke-width="2.2"/><path d="M54 76.5 C57 73.5 63 73.5 66 76.5 C64 79 56 79 54 76.5 Z" fill="#FF7A8A"/>`;
    case 4:
      return `<path d="M50 70 C55 75 65 75 70 70" ${L}/><path d="M57 73 L57 79 C57 83 64 83 64 79 L64 73" fill="#FF7A8A" ${S} stroke-width="2"/><path d="M60.5 74 L60.5 78" ${L} stroke-width="1.2"/>`;
    case 5:
      return `<ellipse cx="60" cy="73" rx="4.5" ry="5.5" fill="#3A1218" ${S} stroke-width="2.2"/>`;
    case 6:
      return `<path d="M52 72 L68 72" ${L}/>`;
    case 7:
      return `<path d="M50 72 C52 69 54 75 57 72 C59 69 61 75 63 72 C65 69 67 75 70 72" ${L} stroke-width="2.2"/>`;
    case 8:
      return `<path d="M50 70 C55 75 65 75 70 70" ${L}/><path d="M54 72.3 L55.5 77 L57 73.4 M63 73.4 L64.5 77 L66 72.3" fill="#fff" ${S} stroke-width="1.6"/>`;
    case 9:
      return `<path d="M56 73 C56 69 60 69 60 72 C60 69 64 69 64 73 C64 76 60 78 60 78 C60 78 56 76 56 73 Z" fill="${RED}" ${S} stroke-width="2"/>`;
    default:
      return `<path d="M51 70 C55 76 65 76 69 70" ${L}/>`;
  }
}

function beard(a) {
  const c = HAIR[a.hairColor];
  switch (a.beard) {
    case 1:
      return `<path d="M50 67 C54 63 58 64 60 66 C62 64 66 63 70 67 C66 69 62 68 60 67 C58 68 54 69 50 67 Z" fill="${c}" ${S} stroke-width="2"/>`;
    case 2:
      return `<path d="M60 66 C56 63 50 64 47 68 C45 70 42 68 42 65 C44 72 52 71 60 68 C68 71 76 72 78 65 C78 68 75 70 73 68 C70 64 64 63 60 66 Z" fill="${c}" ${S} stroke-width="2"/>`;
    case 3:
      return `<path d="M54 80 C55 88 65 88 66 80 C63 82 57 82 54 80 Z" fill="${c}" ${S} stroke-width="2"/>`;
    case 4:
      return `<path d="M37 58 C37 76 46 90 60 90 C74 90 83 76 83 58 C80 66 76 70 70 70 C66 66 54 66 50 70 C44 70 40 66 37 58 Z" fill="${c}" ${S}/>`;
    case 5:
      return `<g fill="${shade(SKIN[a.skin], -0.28)}">${[[46, 74], [50, 78], [55, 80], [60, 81], [65, 80], [70, 78], [74, 74], [52, 75], [68, 75], [58, 84], [62, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9"/>`).join('')}</g>`;
    default:
      return '';
  }
}

function extra(a) {
  switch (a.extra) {
    case 1:
      return `<g fill="${shade(SKIN[a.skin], -0.25)}">${[[44, 63], [47, 66], [42, 67], [76, 63], [73, 66], [78, 67]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1"/>`).join('')}</g>`;
    case 2:
      return `<g fill="#FF7A8A" fill-opacity="0.55"><ellipse cx="44" cy="65" rx="5" ry="3"/><ellipse cx="76" cy="65" rx="5" ry="3"/></g>`;
    case 3:
      return `<path d="M44 42 L52 60" fill="none" stroke="${shade(SKIN[a.skin], -0.3)}" stroke-width="2.4" stroke-linecap="round"/><path d="M45 47 L49 45.5 M47 52 L51 50.5 M49 57 L53 55.5" fill="none" stroke="${shade(SKIN[a.skin], -0.3)}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 4: // фирменная грязь
      return `<g fill="${RED}"><path d="M68 36 C74 33 80 36 79 42 C78 45 76 44 76 49 C76 53 72 53 72 49 C72 45 70 46 68 43 C66 41 65 37 68 36 Z"/><circle cx="82" cy="35" r="1.6"/><circle cx="74" cy="56" r="1.4"/><path d="M42 70 C45 68 49 70 48 73 C47 75 46 75 46 78 C46 80 43.5 80 43.5 78 C43.5 75 41 74 41 72 Z"/></g>`;
    case 5: {
      const x = HEADS[a.face].ears[1];
      return `<circle cx="${x}" cy="68.5" r="3.4" fill="none" stroke="${GOLD}" stroke-width="2.2"/>`;
    }
    default:
      return '';
  }
}

function acc(a) {
  switch (a.acc) {
    case 1:
      return `<g ${L} stroke-width="2.4"><circle cx="50" cy="55.5" r="8.5" fill="#fff" fill-opacity="0.18"/><circle cx="70" cy="55.5" r="8.5" fill="#fff" fill-opacity="0.18"/><path d="M58.5 55 C59.5 53.5 60.5 53.5 61.5 55 M41.5 54 L37 52 M78.5 54 L83 52"/></g>`;
    case 2:
      return `<g ${L} stroke-width="2.6"><rect x="41" y="49" width="17" height="13" rx="2.5" fill="#fff" fill-opacity="0.15"/><rect x="62" y="49" width="17" height="13" rx="2.5" fill="#fff" fill-opacity="0.15"/><path d="M58 54 L62 54 M41 53 L37 51 M79 53 L83 51"/></g>`;
    case 3:
      return `<path d="M39 50 L81 50 L80 56 C79 63 66 64 63 57 L61 54 L59 54 L57 57 C54 64 41 63 40 56 Z" fill="${INK}" ${S} stroke-width="2"/><path d="M44 53 L49 53 M66 53 L71 53" stroke="#fff" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/><path d="M39 51 L35 49 M81 51 L85 49" ${L}/>`;
    case 4: {
      const heart = (x) => `<path d="M${x} 61 C${x - 11} 54 ${x - 8} 46 ${x} 51 C${x + 8} 46 ${x + 11} 54 ${x} 61 Z" fill="${RED}" ${S} stroke-width="2"/>`;
      return heart(50) + heart(70) + `<path d="M56 52 L64 52" ${L} stroke-width="2"/>`;
    }
    case 5:
      return `<circle cx="70" cy="56" r="8" fill="#fff" fill-opacity="0.2" stroke="${GOLD}" stroke-width="2.6"/><path d="M76 61 C80 70 76 80 82 92" fill="none" stroke="${GOLD}" stroke-width="1.4"/>`;
    case 6:
      return `<path d="M36 46 L84 64" ${L} stroke-width="2"/><ellipse cx="50" cy="55.5" rx="8" ry="7" fill="${INK}"/>`;
    case 7:
      return `<circle cx="60" cy="63" r="6.5" fill="${RED}" ${S} stroke-width="2"/><circle cx="58" cy="61" r="1.6" fill="#fff" fill-opacity="0.7"/>`;
    case 8:
      return `<g transform="rotate(-25 74 68)"><rect x="66" y="65" width="16" height="6" rx="2" fill="#F5F0E6" ${S} stroke-width="1.8"/><rect x="71" y="60" width="6" height="16" rx="2" fill="#F5F0E6" ${S} stroke-width="1.8"/></g>`;
    case 9:
      return `<rect x="40" y="49" width="40" height="13" rx="3" fill="#F5F0E6" ${S} stroke-width="2.2"/><rect x="43" y="51.5" width="14" height="8" rx="1.5" fill="#E8424F" fill-opacity="0.8"/><rect x="63" y="51.5" width="14" height="8" rx="1.5" fill="#3E8EF0" fill-opacity="0.8"/>`;
    default:
      return '';
  }
}

function hat(a) {
  switch (a.hat) {
    case 1:
      return `<path d="M34 46 C33 20 87 20 86 46 Z" fill="${RED}" ${S}/><rect x="32" y="39" width="56" height="11" rx="5" fill="${shade(RED, -0.15)}" ${S}/><circle cx="60" cy="18" r="6" fill="#F5F0E6" ${S}/>`;
    case 2:
      return `<path d="M35 45 C35 20 85 20 85 45 Z" fill="#4E7BEA" ${S}/><path d="M36 40 L16 44 C16 49 22 50 38 47 Z" fill="${shade('#4E7BEA', -0.15)}" ${S}/><circle cx="60" cy="24" r="2.6" fill="${INK}"/>`;
    case 3:
      return `<path d="M42 38 C40 16 49 12 60 17 C71 12 80 16 78 38 Z" fill="#8A5A34" ${S}/><path d="M42 33 L78 33" stroke="${RED}" stroke-width="4"/><path d="M42 38 C40 16 49 12 60 17 C71 12 80 16 78 38" fill="none" ${S}/><path d="M18 36 C26 44 94 44 102 36 C96 46 24 46 18 36 Z" fill="#9C6A40" ${S}/>`;
    case 4:
      return `<rect x="43" y="4" width="34" height="32" rx="3" fill="${INK}" ${S}/><rect x="43" y="25" width="34" height="6" fill="${RED}"/><ellipse cx="60" cy="36" rx="30" ry="5" fill="${INK}" ${S}/>`;
    case 5:
      return `<path d="M38 38 L39 15 L49 26 L60 10 L71 26 L81 15 L82 38 Z" fill="${GOLD}" ${S}/><circle cx="60" cy="30" r="3" fill="${RED}" ${S} stroke-width="1.6"/><circle cx="47" cy="32" r="2" fill="#4E7BEA"/><circle cx="73" cy="32" r="2" fill="#4E7BEA"/>`;
    case 6:
      return `<path d="M46 34 L60 1 L74 34 Z" fill="#F5F0E6" ${S}/><path d="M50 25 L66 18 M48 30 L70 22 M54 15 L63 11" stroke="${RED}" stroke-width="3"/><path d="M46 34 L60 1 L74 34 Z" fill="none" ${S}/><circle cx="60" cy="2" r="4.5" fill="${RED}" ${S} stroke-width="2"/>`;
    case 7:
      return `<path d="M35 41 C45 37 75 37 85 41 L85 47 C75 43 45 43 35 47 Z" fill="${RED}" ${S} stroke-width="2.2"/><path d="M84 43 L96 38 L94 46 L98 52 L86 47 Z" fill="${RED}" ${S} stroke-width="2"/>`;
    case 8:
      return `<path d="M44 34 C38 28 37 16 42 8 C44 18 48 24 54 28 Z" fill="${RED}" ${S}/><path d="M76 34 C82 28 83 16 78 8 C76 18 72 24 66 28 Z" fill="${RED}" ${S}/>`;
    case 9:
      return `<ellipse cx="60" cy="13" rx="19" ry="5" fill="none" stroke="${GOLD}" stroke-width="3.4"/><ellipse cx="60" cy="13" rx="19" ry="5" fill="none" stroke="#FFF3C4" stroke-width="1.2"/>`;
    case 10:
      return `<g fill="#fff" ${S}><circle cx="47" cy="22" r="10"/><circle cx="73" cy="22" r="10"/><circle cx="60" cy="15" r="12"/></g><path d="M44 26 L76 26" stroke="#fff" stroke-width="10"/><rect x="42" y="27" width="36" height="13" rx="3" fill="#fff" ${S}/>`;
    case 11:
      return `<path d="M30 36 C28 22 48 18 64 20 C82 22 92 30 88 37 C80 41 40 42 30 36 Z" fill="${RED}" ${S}/><path d="M60 20 L62 13" ${L} stroke-width="3"/>`;
    default:
      return '';
  }
}

// Полный персонаж — строка SVG (для превью и для аватарок в игре).
export function avatarSVG(raw, { title = '' } = {}) {
  const a = normalize(raw);
  const hatOn = a.hat !== 0;
  // высокие причёски под шляпой прячем частично — иначе смешно, но нечитаемо
  const front = hatOn && [3, 5, 9, 14].includes(a.hair) ? hairFront({ ...a, hair: 1 }) : hairFront(a);
  return (
    `<svg viewBox="12 8 96 96" xmlns="http://www.w3.org/2000/svg" ${title ? `role="img" aria-label="${title.replace(/[<>&"]/g, '')}"` : 'aria-hidden="true"'}>` +
    `<rect width="120" height="120" fill="${BG[a.bg]}"/>` +
    `<circle cx="96" cy="22" r="26" fill="#fff" fill-opacity="0.18"/>` +
    hairBack(a) +
    body(a) +
    head(a) +
    extra(a) +
    eyes(a) +
    brows(a) +
    nose(a) +
    mouth(a) +
    beard(a) +
    (a.beard === 4 ? mouth(a) : '') +
    front +
    acc(a) +
    hat(a) +
    `</svg>`
  );
}
