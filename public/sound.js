// Звуки синтезируются на лету через Web Audio — без файлов.

const KEY = 'oy.muted';

export const Sound = {
  ctx: null,
  muted: (() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  })(),

  ensure() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  setMuted(value) {
    this.muted = value;
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {}
  },

  tone(freq, dur, { type = 'sine', gain = 0.12, when = 0, to = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  noise(dur, { gain = 0.08, from = 2400, to = 700, when = 0, q = 0.9, type = 'bandpass' } = {}) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },

  play(name) {
    if (this.muted) return;
    const c = this.ensure();
    if (!c) return;
    switch (name) {
      case 'deal':
        this.noise(0.22, { gain: 0.09, from: 3800, to: 600 });
        this.tone(180, 0.12, { type: 'triangle', gain: 0.07, when: 0.12 });
        break;
      case 'flip':
        this.noise(0.09, { gain: 0.08, from: 5200, to: 1800, type: 'highpass' });
        this.tone(520, 0.08, { type: 'triangle', gain: 0.05, to: 380 });
        break;
      case 'place':
        this.tone(150, 0.14, { type: 'triangle', gain: 0.12 });
        this.noise(0.06, { gain: 0.05, from: 1600, to: 600 });
        break;
      case 'tap':
        this.tone(420, 0.05, { type: 'sine', gain: 0.05 });
        break;
      case 'tick':
        this.tone(1250, 0.035, { type: 'square', gain: 0.025 });
        break;
      case 'join':
        this.tone(660, 0.09, { gain: 0.07 });
        this.tone(990, 0.12, { gain: 0.07, when: 0.08 });
        break;
      case 'select':
        this.tone(740, 0.07, { type: 'triangle', gain: 0.06 });
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', gain: 0.09, when: i * 0.08 }));
        break;
      case 'point':
        [587.33, 880].forEach((f, i) => this.tone(f, 0.22, { gain: 0.08, when: i * 0.1 }));
        break;
      case 'fanfare':
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.34, { type: 'sawtooth', gain: 0.045, when: i * 0.11 }));
        this.tone(1046.5, 0.9, { type: 'triangle', gain: 0.08, when: 0.55 });
        break;
      case 'error':
        this.tone(220, 0.16, { type: 'square', gain: 0.04, to: 150 });
        break;
      case 'pop':
        this.tone(880, 0.06, { gain: 0.05, to: 1320 });
        break;
      default:
        break;
    }
  }
};
