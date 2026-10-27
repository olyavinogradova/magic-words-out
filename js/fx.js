// fx.js — particles: bursts, confetti, flying gems
import { mulberry32, lerp } from './util.js';

const parts = [];
const rnd = mulberry32(777);

export const fx = {
  burst(x, y, { n = 18, color = '#ffd166', speed = 220, life = 700, size = 5, gravity = 300 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, sp = speed * (0.35 + rnd() * 0.65);
      parts.push({
        type: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.2,
        life: life * (0.6 + rnd() * 0.5), maxLife: life, color, size: size * (0.6 + rnd() * 0.8), gravity,
      });
    }
  },

  confetti(x, y, n = 70) {
    const colors = ['#ff8fa3', '#ffd166', '#8ecae6', '#b8f2a6', '#c8b6e8', '#ff9f68'];
    for (let i = 0; i < n; i++) {
      parts.push({
        type: 'rect', x: x + (rnd() - 0.5) * 260, y: y + (rnd() - 0.5) * 60,
        vx: (rnd() - 0.5) * 240, vy: -rnd() * 320 - 60,
        life: 1600 + rnd() * 900, maxLife: 2200, color: colors[(rnd() * colors.length) | 0],
        size: 4 + rnd() * 5, gravity: 420, rot: rnd() * Math.PI, vr: (rnd() - 0.5) * 10,
      });
    }
  },

// Soft ground puffs — take-off, landing, hard turns.
  dust(x, y, n = 6, up = 1) {
    for (let i = 0; i < n; i++) {
      parts.push({
        type: 'dot',
        x: x + (rnd() - 0.5) * 14, y: y - 3,
        vx: (rnd() - 0.5) * 70, vy: -(14 + rnd() * 38) * up,
        life: 300 + rnd() * 300, maxLife: 600,
        color: 'rgba(150,140,110,.4)', size: 2 + rnd() * 2.5, gravity: 60,
      });
    }
  },

  // A gem flies from `from` to `to` on a curved path with a sparkle trail; onArrive fires.
  flyGem(from, to, dur = 650, delayMs = 0, onArrive) {
    parts.push({
      type: 'gem', p: -(delayMs / dur), dur,
      from: { ...from }, to: { ...to },
      ctrl: { x: lerp(from.x, to.x, 0.5), y: Math.min(from.y, to.y) - 140 },
      onArrive, trailT: 0,
    });
  },

  update(dtMs) {
    const dt = dtMs / 1000;
    for (const p of parts) {
      if (p.type === 'gem') {
        p.p += dtMs / p.dur;
        p.trailT += dtMs;
        if (p.trailT > 50 && p.p > 0 && p.p < 1) {
          p.trailT = 0;
          const pos = gemPos(p, Math.max(0, Math.min(1, p.p)));
          parts.push({ type: 'dot', x: pos.x, y: pos.y, vx: 0, vy: 20, life: 320, maxLife: 320, color: '#fff3b0', size: 3, gravity: 0 });
        }
        if (p.p >= 1) { p.dead = true; if (p.onArrive) p.onArrive(); }
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt;
      if (p.vr) p.rot += p.vr * dt;
      p.life -= dtMs;
      if (p.life <= 0) p.dead = true;
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].dead) parts.splice(i, 1);
  },

  draw(ctx) {
    for (const p of parts) {
      if (p.type === 'gem') {
        if (p.p < 0) continue;
        const pos = gemPos(p, Math.min(1, p.p));
        drawGemShape(ctx, pos.x, pos.y, 13, p.p);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      if (p.type === 'rect') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },

  clear() { parts.length = 0; },
};

function gemPos(p, t) {
  const u = 1 - t;
  return {
    x: u * u * p.from.x + 2 * u * t * p.ctrl.x + t * t * p.to.x,
    y: u * u * p.from.y + 2 * u * t * p.ctrl.y + t * t * p.to.y,
  };
}

export function drawGemShape(ctx, x, y, r, t = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 + Math.sin(t * 8) * 0.06, 1 + Math.cos(t * 8) * 0.06);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#ffd6e8'); g.addColorStop(0.5, '#ff8fa3'); g.addColorStop(1, '#c86b98');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r * 0.82, -r * 0.25); ctx.lineTo(r * 0.55, r);
  ctx.lineTo(-r * 0.55, r); ctx.lineTo(-r * 0.82, -r * 0.25);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.55); ctx.lineTo(r * 0.1, -r * 0.3); ctx.lineTo(-r * 0.32, -r * 0.05);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
