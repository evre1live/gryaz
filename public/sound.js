// Звуки игры: записи из бесплатных наборов Kenney (CC0, см. /sfx/CREDITS.txt).
// Загружаются один раз через Web Audio, у каждого звука несколько вариантов —
// чтобы карты не шуршали одинаково, берём случайный и чуть меняем скорость.

const KEY = 'gr.muted';
const VOL_KEY = 'gr.volume';

const BANK = {
  deal: { files: ['deal1', 'deal2', 'deal3', 'deal4'], gain: 0.85 },
  draw: { files: ['draw'], gain: 0.9 },
  flip: { files: ['flip1', 'flip2', 'flip3', 'flip4'], gain: 0.9 },
  place: { files: ['place1', 'place2', 'place3'], gain: 0.85 },
  tap: { files: ['chip1', 'chip2', 'chip3'], gain: 0.55 },
  fan: { files: ['fan'], gain: 0.8 },
  shuffle: { files: ['shuffle'], gain: 0.55 },
  point: { files: ['chips1', 'chips2', 'chips3'], gain: 0.8 },
  win: { files: ['win'], gain: 0.75, then: { name: 'chips-pile', at: 0.25, gain: 0.6 } },
  fanfare: { files: ['fanfare'], gain: 0.7, then: { name: 'chips-pile', at: 0.5, gain: 0.7 } },
  sad: { files: ['sad'], gain: 0.6 },
  stamp: { files: ['stamp'], gain: 0.7 },
  select: { files: ['select'], gain: 0.45 },
  tick: { files: ['tick'], gain: 0.5 },
  error: { files: ['error'], gain: 0.5 },
  join: { files: ['join'], gain: 0.55 },
  pop: { files: ['pop'], gain: 0.5 },
  'voice-on': { files: ['voice-on'], gain: 0.5 },
  'voice-off': { files: ['voice-off'], gain: 0.5 },
  confirm: { files: ['confirm'], gain: 0.5 },
  leave: { files: ['leave'], gain: 0.5 }
};

const read = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch {
    return d;
  }
};

export const Sound = {
  ctx: null,
  master: null,
  buffers: new Map(),
  loading: null,
  muted: read(KEY, '0') === '1',
  volume: Number(read(VOL_KEY, '0.8')) || 0.8,
  last: new Map(),

  ensure() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      // мягкий компрессор, чтобы наложенные звуки не хрипели
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
      this.load();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  load() {
    if (this.loading) return this.loading;
    const names = new Set();
    for (const s of Object.values(BANK)) {
      s.files.forEach((f) => names.add(f));
      if (s.then) names.add(s.then.name);
    }
    this.loading = Promise.all(
      [...names].map(async (name) => {
        try {
          const res = await fetch(`/sfx/${name}.mp3`);
          const data = await res.arrayBuffer();
          const buf = await new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail));
          this.buffers.set(name, buf);
        } catch {
          /* без этого звука игра всё равно работает */
        }
      })
    );
    return this.loading;
  },

  setMuted(value) {
    this.muted = value;
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {}
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
    try {
      localStorage.setItem(VOL_KEY, String(this.volume));
    } catch {}
  },

  shot(name, gain, when = 0, rate = 1) {
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(this.ctx.currentTime + when);
  },

  play(name, { gain = 1, delay = 0 } = {}) {
    if (this.muted) return;
    const s = BANK[name];
    if (!s) return;
    const c = this.ensure();
    if (!c) return;
    // один и тот же звук чаще раза в 60 мс не нужен — иначе каша
    const now = performance.now();
    if (now - (this.last.get(name) || 0) < 60) return;
    this.last.set(name, now);
    const file = s.files[(Math.random() * s.files.length) | 0];
    const rate = s.files.length > 1 || name === 'tap' ? 0.96 + Math.random() * 0.08 : 1;
    this.shot(file, s.gain * gain, delay, rate);
    if (s.then) this.shot(s.then.name, s.then.gain * gain, delay + s.then.at);
  }
};
