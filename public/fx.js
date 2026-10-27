// Конфетти на canvas поверх страницы.

const COLORS = ['#C8102E', '#F5F0E6', '#FFB4A2', '#A7C7E7', '#E9D8A6', '#C9B6F2', '#FF8A9A'];

export const Confetti = {
  canvas: null,
  ctx: null,
  parts: [],
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

  spawn(x, y, vx, vy) {
    this.parts.push({
      x,
      y,
      vx,
      vy,
      w: 6 + Math.random() * 6,
      h: 9 + Math.random() * 8,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 0
    });
  },

  burst(x, y, count = 90) {
    if (this.reduced()) return;
    this.init();
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const s = 6 + Math.random() * 9;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s);
    }
    this.loop();
  },

  rain(ms = 4500) {
    if (this.reduced()) return;
    this.init();
    this.rainUntil = performance.now() + ms;
    this.loop();
  },

  stop() {
    this.parts = [];
    this.rainUntil = 0;
  },

  loop() {
    if (this.running) return;
    this.running = true;
    const step = (t) => {
      const { ctx } = this;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (t < this.rainUntil) {
        for (let i = 0; i < 3; i++) this.spawn(Math.random() * innerWidth, -20, (Math.random() - 0.5) * 2, 2 + Math.random() * 3);
      }
      this.parts = this.parts.filter((p) => p.y < innerHeight + 40 && p.life < 600);
      for (const p of this.parts) {
        p.life++;
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
      if (this.parts.length || t < this.rainUntil) requestAnimationFrame(step);
      else {
        this.running = false;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
      }
    };
    requestAnimationFrame(step);
  }
};
