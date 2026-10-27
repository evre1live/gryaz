// Эффекты поверх страницы на одном canvas: конфетти и брызги «грязи».

const COLORS = ['#C8102E', '#F5F0E6', '#FFB4A2', '#A7C7E7', '#E9D8A6', '#C9B6F2', '#FF8A9A'];
const MUD = ['#C8102E', '#A50D26', '#E0193A'];

export const FX = {
  canvas: null,
  ctx: null,
  parts: [],
  splats: [],
  running: false,
  rainUntil: 0,

  init() {
    if (this.canvas) return;
    this.canvas = document.getElementById('fx');
    this.ctx = this.canvas.getContext('2d');
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = innerWidth * dpr;
      this.canvas.height = innerHeight * dpr;
      this.canvas.style.width = innerWidth + 'px';
      this.canvas.style.height = innerHeight + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);
  },

  reduced() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  confetto(x, y, vx, vy) {
    this.parts.push({ kind: 'c', x, y, vx, vy, w: 6 + Math.random() * 6, h: 9 + Math.random() * 8, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, color: COLORS[(Math.random() * COLORS.length) | 0], life: 0 });
  },

  burst(x, y, count = 90) {
    if (this.reduced()) return;
    this.init();
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const s = 6 + Math.random() * 9;
      this.confetto(x, y, Math.cos(a) * s, Math.sin(a) * s);
    }
    this.loop();
  },

  rain(ms = 4500) {
    if (this.reduced()) return;
    this.init();
    this.rainUntil = performance.now() + ms;
    this.loop();
  },

  // брызги: капли разлетаются, падают и оставляют пятна, которые тают
  splash(x, y, { count = 18, power = 1, splat = true } = {}) {
    if (this.reduced()) return;
    this.init();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (2 + Math.random() * 6) * power;
      this.parts.push({ kind: 'd', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2 * power, r: 1.5 + Math.random() * 3.5 * power, color: MUD[(Math.random() * MUD.length) | 0], life: 0, max: 40 + Math.random() * 30 });
    }
    if (splat) {
      const blobs = [];
      const n = 6 + ((Math.random() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 14 * power;
        blobs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: (4 + Math.random() * 8) * power });
      }
      this.splats.push({ x, y, blobs, life: 0, max: 70 });
    }
    this.loop();
  },

  stop() {
    this.parts = [];
    this.splats = [];
    this.rainUntil = 0;
  },

  loop() {
    if (this.running) return;
    this.running = true;
    const step = (t) => {
      const { ctx } = this;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (t < this.rainUntil) {
        for (let i = 0; i < 3; i++) this.confetto(Math.random() * innerWidth, -20, (Math.random() - 0.5) * 2, 2 + Math.random() * 3);
      }
      // пятна
      this.splats = this.splats.filter((s) => s.life < s.max);
      for (const s of this.splats) {
        s.life++;
        const k = s.life / s.max;
        const grow = Math.min(1, s.life / 6);
        ctx.globalAlpha = 0.55 * (1 - k);
        ctx.fillStyle = '#C8102E';
        for (const b of s.blobs) {
          ctx.beginPath();
          ctx.arc(s.x + b.dx * grow, s.y + b.dy * grow, b.r * grow, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // частицы
      this.parts = this.parts.filter((p) => p.y < innerHeight + 40 && (p.kind === 'c' ? p.life < 600 : p.life < p.max));
      for (const p of this.parts) {
        p.life++;
        if (p.kind === 'd') {
          p.vy += 0.35;
          p.vx *= 0.97;
          p.x += p.vx;
          p.y += p.vy;
          ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          // капля вытягивается по направлению полёта
          const sp = Math.hypot(p.vx, p.vy);
          const ang = Math.atan2(p.vy, p.vx);
          ctx.ellipse(p.x, p.y, p.r * (1 + sp * 0.08), p.r, ang, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          continue;
        }
        p.vy += 0.18;
        p.vx *= 0.99;
        p.vy = Math.min(p.vy, 7);
        p.x += p.vx + Math.sin((p.life + p.w) / 12) * 0.6;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.scale(1, Math.cos(p.life / 8));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (this.parts.length || this.splats.length || t < this.rainUntil) requestAnimationFrame(step);
      else {
        this.running = false;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
      }
    };
    requestAnimationFrame(step);
  }
};

// «+1» вылетает из карты победителя и летит к его счёту
export function flyPoint(fromEl, toEl, text = '+1') {
  if (!fromEl || !toEl || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  if (!b.width) return;
  const el = document.createElement('div');
  el.className = 'fly-point';
  el.textContent = text;
  document.body.append(el);
  const x0 = a.left + a.width / 2;
  const y0 = a.top + a.height * 0.35;
  const x1 = b.left + b.width / 2;
  const y1 = b.top + b.height / 2;
  const mx = (x0 + x1) / 2;
  const my = Math.min(y0, y1) - 120;
  const kf = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const s = t < 0.15 ? 0.4 + t * 6 : 1.3 - t * 0.6;
    kf.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`, opacity: t > 0.92 ? (1 - t) * 12 : 1 });
  }
  el.animate(kf, { duration: 1100, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' }).finished.then(() => el.remove(), () => el.remove());
}

// лёгкий наклон карты за курсором (только там, где есть мышь)
export function tilt(el, max = 7) {
  if (!el || !matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return el;
  el.classList.add('tilt');
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(px * max * 2).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-py * max * 2).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`);
  });
  el.addEventListener('pointerleave', () => {
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  });
  return el;
}

// старое имя — чтобы ничего не сломалось
export const Confetti = FX;
