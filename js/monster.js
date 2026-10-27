// monster.js — the star: scary → smaller → soft → fluffy Boo.
// Real art (monster1_stage1..4.png) when present; procedural blob otherwise.
// Each word the kid says transforms him one stage — this is the core reward.
import { art } from './art.js';
import { clamp, lerp, mixColor, tweenP, easeInOutSine } from './util.js';

const STAGES = [
// scale stays 1.0 in every stage: the monster's HEIGHT never changes —
// each word makes him kinder via colors, spikes, eyes, smile, blush, fuzz
// — not smaller.
  { scale: 1.00, body: '#4a4e69', belly: '#5c6078', spikes: 8, spikeLen: 1.0, eyeSize: 0.55, brow: 1.0, teeth: 1.0, smile: 0.0, blush: 0.0, fuzz: 0.0, wobble: 5.0, eyeColor: '#ff5d5d' },
  { scale: 1.00, body: '#6d5a86', belly: '#7e6c99', spikes: 5, spikeLen: 0.7, eyeSize: 0.80, brow: 0.5, teeth: 0.6, smile: 0.15, blush: 0.0, fuzz: 0.0, wobble: 3.4, eyeColor: '#ffb703' },
  { scale: 1.00, body: '#9b8bbb', belly: '#ac9cc8', spikes: 3, spikeLen: 0.35, eyeSize: 1.05, brow: 0.0, teeth: 0.25, smile: 0.6, blush: 0.4, fuzz: 0.3, wobble: 2.2, eyeColor: '#48b8e0' },
  { scale: 1.00, body: '#c8b6e8', belly: '#dccffc', spikes: 0, spikeLen: 0.0, eyeSize: 1.25, brow: 0.0, teeth: 0.0, smile: 1.0, blush: 0.85, fuzz: 1.0, wobble: 1.4, eyeColor: '#8f7bff' },
];

export class Monster {
// sheet: art.js DEFS name ('monster1' | 'monster2' …); flip: whether the
// sheet's frames must be mirrored to face the family (both monster sheets
// paint their figures facing right).
  constructor({ sheet = 'monster1', flip = true } = {}) {
    this.sheet = sheet;
    this.faceFlip = flip;
    this.reset();
    this.wobbleSeeds = Array.from({ length: 26 }, (_, i) => (i * 137) % 100 / 100);
  }

  reset() {
    this.visible = false;
    this.stage = 0;
    this.worldX = null; // set at the M2 encounter trigger; main converts with the camera
    this.cur = { ...STAGES[0] };
    this.yOff = 0;
    this.flash = 0;
    this.celebrating = false;
    this.bounce = 0;
    this._cx = 0; this._cy = 0;
    this.transformAnim = null; // { from, to, e } for procedural blending
    this.artCross = null;      // { fromIdx, toIdx, e } for art crossfade
  }

  hide() { this.visible = false; this.celebrating = false; }

// Reveal at the walk trigger: he is simply there — already sitting on the
// path ahead (no entrance, no sky-drop). worldX must be set BEFORE calling
// this (main.js owns it) or the draw would fall back to a fixed screen
// position.
  reveal() {
    this.visible = true;
    this.yOff = 0;
  }

  async appear() {
    // Keep the await-able shape for the encounter state machine; the monster
    // revealed by the walk trigger is already sitting, so this only covers
    // walk-less runs (M1 legacy) and play-again safety.
    this.reveal();
  }

  async transformTo(stage) {
    this.stage = stage;
    const from = { ...this.cur };
    const to = STAGES[stage];
    const artFrom = this.artFrameFor(this.stage - 1), artTo = this.artFrameFor(stage);
    this.flash = 1;
    this.transformAnim = null;
    this.artCross = (artFrom != null && artTo != null) ? { fromIdx: artFrom, toIdx: artTo, e: 0 } : null;
    await tweenP({
      dur: 850, ease: easeInOutSine,
      onUpdate: e => {
        this.flash = 1 - e;
        if (this.artCross) { this.artCross.e = e; return; }
        const c = this.cur;
        for (const k of ['scale', 'spikes', 'spikeLen', 'eyeSize', 'brow', 'teeth', 'smile', 'blush', 'fuzz', 'wobble']) c[k] = lerp(from[k], to[k], e);
        c.body = mixColor(from.body, to.body, e);
        c.belly = mixColor(from.belly, to.belly, e);
        c.eyeColor = mixColor(from.eyeColor, to.eyeColor, e);
        // squash-stretch pop at the end of the change
        const pop = e > 0.85 ? 1 + Math.sin((e - 0.85) / 0.15 * Math.PI) * 0.07 : 1;
        this.popScale = pop;
      },
    });
    this.cur = { ...to };
    this.transformAnim = null; this.artCross = null; this.popScale = 1;
  }

  celebrate() { this.celebrating = true; }

  artFrameFor(stage) {
    // Map stage (0..3) to art frame index; returns null when art missing
    const idx = clamp(stage, 0, 3);
    return art.has(this.sheet, idx) ? idx : null;
  }

  center() { return { x: this._cx, y: this._cy }; }

  draw(ctx, x, footY, t, W, H) {
    if (!this.visible) return;
    const R = Math.min(W, H) * 0.17 * this.cur.scale * (this.popScale || 1);
    const bounce = this.celebrating ? Math.abs(Math.sin(t * 5)) * (R * 0.22) : 0;
    const breathe = 1 + Math.sin(t * (this.celebrating ? 5 : this.cur.wobble)) * 0.015;
    const cy = footY - R * 1.18 + this.yOff - bounce;
    this._cx = x; this._cy = cy;

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(40,60,40,.2)';
    ctx.beginPath(); ctx.ellipse(x, footY + 4, R * 0.95, R * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const artH = R * 2.6;
// the sheets face right; the monster must look at the family on the left
// — mirror every frame at draw time
    if (this.artCross) {
      const { fromIdx, toIdx, e } = this.artCross;
      art.drawFrame(ctx, this.sheet, fromIdx, x, footY + this.yOff, artH, { alpha: 1 - e, scale: lerp(1, 0.94, e), flip: this.faceFlip });
      art.drawFrame(ctx, this.sheet, toIdx, x, footY + this.yOff, artH, { alpha: e, scale: lerp(1.06, 1, e), flip: this.faceFlip });
    } else if (art.has(this.sheet, this.stage)) {
      art.drawFrame(ctx, this.sheet, this.stage, x, footY + this.yOff, artH, { flip: this.faceFlip });
    } else {
      this.drawBlob(ctx, x, cy, R * breathe, t);
    }

    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.7;
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, R * 2.2);
      g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, cy, R * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // Procedural placeholder: a wobbly blob whose mood follows the stage params
  drawBlob(ctx, x, y, R, t) {
    const c = this.cur;
    const n = this.wobbleSeeds.length;
    const wobbleAmp = 0.045 + (c.wobble / 5) * 0.035;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = 1 + Math.sin(t * c.wobble + this.wobbleSeeds[i] * Math.PI * 2) * wobbleAmp;
      const sq = 1 + Math.sin(a) * 0.06; // slightly oval
      pts.push({ x: x + Math.cos(a) * R * w * sq, y: y + Math.sin(a) * R * w * (1 / sq) });
    }

    // fuzz halo (fluffy stages)
    if (c.fuzz > 0.03) {
      ctx.save();
      ctx.globalAlpha = c.fuzz * 0.9;
      ctx.fillStyle = '#efe6ff';
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI * 0.9 + (i / 13) * Math.PI * 0.8;
        const wob = Math.sin(t * 2 + i) * 3;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * R * 1.02 + wob, y + Math.sin(a) * R * 1.02, R * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // spikes
    const spikeN = Math.round(c.spikes);
    if (spikeN > 0) {
      ctx.fillStyle = mixColor('#3a3d52', '#6d5a86', 0.5);
      for (let i = 0; i < spikeN; i++) {
        const a = -Math.PI * 0.85 + (i / Math.max(1, spikeN - 1)) * Math.PI * 0.7;
        const bx = x + Math.cos(a) * R, by = y + Math.sin(a) * R;
        const len = R * 0.38 * c.spikeLen;
        const px = Math.cos(a), py = Math.sin(a);
        const side = 0.35;
        ctx.beginPath();
        ctx.moveTo(bx + -py * R * side * 0.3, by + px * R * side * 0.3);
        ctx.lineTo(bx + px * len, by + py * len);
        ctx.lineTo(bx + py * R * side * 0.3, by + -px * R * side * 0.3);
        ctx.closePath(); ctx.fill();
      }
    }

    // body
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n], prev = pts[i - 1];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
    }
    ctx.closePath(); ctx.fill();

    // belly
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = c.belly;
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.35, R * 0.55, R * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // eyes
    const eyeDX = R * 0.38, eyeY = y - R * 0.18;
    const big = c.eyeSize >= 0.9;
    for (const side of [-1, 1]) {
      const ex = x + side * eyeDX;
      const eyeR = big ? R * 0.17 * c.eyeSize : R * 0.085 * (0.6 + c.eyeSize);
      if (big) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.eyeColor;
        ctx.beginPath(); ctx.arc(ex + side * eyeR * 0.08, eyeY + eyeR * 0.05, eyeR * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a2438';
        ctx.beginPath(); ctx.arc(ex + side * eyeR * 0.1, eyeY + eyeR * 0.08, eyeR * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex - eyeR * 0.22, eyeY - eyeR * 0.25, eyeR * 0.16, 0, Math.PI * 2); ctx.fill();
        const sp = 0.5 + 0.5 * Math.sin(t * 3 + side);
        if (sp > 0.7) { ctx.beginPath(); ctx.arc(ex + eyeR * 0.25, eyeY + eyeR * 0.3, eyeR * 0.09, 0, Math.PI * 2); ctx.fill(); }
        if (c.blush > 0.1) {
          ctx.globalAlpha = c.blush * 0.5; ctx.fillStyle = '#ff8fa3';
          ctx.beginPath(); ctx.ellipse(ex + side * eyeR * 1.7, eyeY + eyeR * 1.3, eyeR * 0.55, eyeR * 0.32, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        const g = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeR * 1.6);
        g.addColorStop(0, '#fff'); g.addColorStop(0.3, c.eyeColor); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ex, eyeY, eyeR * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      // angry brows on scary stages
      if (c.brow > 0.05) {
        ctx.save();
        ctx.globalAlpha = c.brow;
        ctx.strokeStyle = '#2a2438'; ctx.lineWidth = R * 0.045; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - side * eyeR * 1.4, eyeY - eyeR * (big ? 1.6 : 2.2));
        ctx.lineTo(ex + side * eyeR * 1.2, eyeY - eyeR * (big ? 1.0 : 1.4));
        ctx.stroke();
        ctx.restore();
      }
    }

    // mouth
    const my = y + R * 0.28;
    if (c.smile > 0.5) {
      ctx.fillStyle = '#7a3b5e';
      ctx.beginPath();
      ctx.moveTo(x - R * 0.3, my - R * 0.04);
      ctx.quadraticCurveTo(x, my + R * 0.3 * c.smile, x + R * 0.3, my - R * 0.04);
      ctx.quadraticCurveTo(x, my + R * 0.06, x - R * 0.3, my - R * 0.04);
      ctx.fill();
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath(); ctx.ellipse(x, my + R * 0.14, R * 0.12, R * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#2a2438';
      ctx.beginPath();
      ctx.moveTo(x - R * 0.32, my - R * 0.1);
      ctx.quadraticCurveTo(x, my + R * 0.22, x + R * 0.32, my - R * 0.1);
      ctx.closePath(); ctx.fill();
      const teeth = Math.round(c.teeth * 5);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < teeth; i++) {
        const tx = lerp(x - R * 0.26, x + R * 0.26, teeth === 1 ? 0.5 : i / (teeth - 1));
        const depth = R * 0.16 * c.teeth;
        ctx.beginPath();
        ctx.moveTo(tx - R * 0.05, my - R * 0.07);
        ctx.lineTo(tx + R * 0.05, my - R * 0.07);
        ctx.lineTo(tx, my - R * 0.07 + depth);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}
