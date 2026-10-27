// world.js — forest scene: background.png (or procedural storybook forest) + ground strip.
// The ground is a separate layer because it tiles and varies per level.
// With a camera: the ground, tufts and flowers scroll in world coordinates;
// the far background stays fixed; procedural tree layers get light parallax.
//
// Flat storybook look aligned with the UI palette — ONE flat sky, green
// triangle mountains (one giant), fewer teal trees, grey rocks, sage
// ground, and the ONE-PEN rule: a constant 0.6 px #2B2524 outline on every
// shape (PEN_W in ui_style.js — the same pen the UI elements draw with).
// Knobs: the color block below; every hex is an exact palette color, a
// blend of two, or a sample of the painted background (noted inline).
import { art } from './art.js';
import { mulberry32, GROUND_Y } from './util.js';
import { MOM_H_FRAC } from './players.js'; // mom's drawn height = H * MOM_H_FRAC
import { LEVEL_1 } from '../data/levels.js';
import { PAL, PEN_W, wobbleRng, smoothClosed } from './ui_style.js';

const WORLD_W = LEVEL_1.walk.worldWidth;
// procedural far layers shift this fraction of the camera (background.png stays fixed)
const PARALLAX = [0.12, 0.24, 0.4];

// --- painted forest art ------------------------------------------------------
// When the tree art is present the scene draws ONLY the flat sky, the
// painted trees (+ ground/flowers/pollen): the sun, clouds, mountains,
// rocks and blob trees below are the ZERO-ART FALLBACK.
// Tree SIZE is anchored to mom, not the viewport ("most trees twice as
// high as mom"): target = 2 × mom's height, ±5% variety from the slot's
// random tr.h, far layers a touch smaller for depth. The drawn height is
// STILL capped at the art's natural pixel height — a tree is never
// upscaled, so on very tall windows trees stop growing at their source
// size instead of stretching.
const TREE_H_VS_MOM = 2;            // most trees stand this × mom's height
const TREE_LAYER_SIZE = [0.9, 0.95, 1]; // far → near depth scaling
const LAYER_DROP_PX = [18, 14, 12]; // painted feet sink below the layer's land
                                    // line — the bases must sit IN the grass band,
                                    // never above it
// slot casting: 'layer-slot' → trees frame index, -1 = a deliberate gap
// (sky). The slot SET (which slots paint, which stay gaps): density
// ~0.8, 13 of 17 slots painted. Tree 7 is OUT; tree 6 is cast ~1.4× the
// others (3 slots vs 2).
const TREE_CAST = {
  '0-0': 0, '0-2': 1, '0-3': 2, '0-5': 3, '0-7': 4, '0-8': 5, '0-9': -1,
  '1-0': 5, '1-1': 0, '1-2': 1, '1-3': 2, '1-4': -1, '1-5': -1,
  '2-0': 3, '2-2': 4, '2-3': 5, '2-5': -1,
};

// --- the scene palette -------------------------------------------------------
const SKY = '#D2E2E9';          // "S4 powder blue" — sky softened toward warm white
const SUN = '#E8C66A';          // exact palette warm yellow
const CLOUD = '#FFF8EE';        // exact palette warm white
const MOUNTAIN = '#89AC88';     // green — success green lightened toward warm white
const TREES = ['#5E8681', '#6FA6A0', '#B0CBC3']; // teal family far→near (B1):
                                // blend(teal, deep outline) · exact palette teal · blend(teal, warm white)
const ROCK = '#867E77';         // warm stone grey — blend(outline, paper)
const ROCK2 = '#68605C';        // darker companion boulder
const GROUND_TOP = '#97B595';   // sage ground — success green + warm white (matches done stones)
const GROUND_BOT = '#78A179';
const GROUND_LIP = '#ABC2A6';   // top band of the grass
const TUFT = '#5B785B';         // grass tufts — success green + deep outline
const FLOWERS = ['#ED9794', '#E8C66A', '#9B8FB5']; // exact palette pink · yellow · lavender
const FLOWER_CENTER = '#FFF8EE';
const POLLEN = 'rgba(255,248,238,.55)'; // warm white flecks

export class World {
  constructor() {
    const rnd = mulberry32(20261001);
    this.layers = [
      // far: trees + 2 mountains + the one giant; near: trees + 2 rock pairs
      { trees: this.makeTrees(rnd, 10, 0.55), alpha: 0.85 },
      { trees: this.makeTrees(rnd, 6, 0.75), alpha: 0.9 },
      { trees: this.makeTrees(rnd, 6, 1.0), alpha: 1 },
    ];
    this.layers[0].trees.forEach((t, i) => {
      t.kind = (i === 1 || i === 4) ? 'mountain' : (i === 6 ? 'giant' : 'tree');
    });
    this.layers[2].trees.forEach((t, i) => { t.kind = i % 3 === 1 ? 'rock' : 'tree'; });
    this.pollen = Array.from({ length: 26 }, () => ({
      x: rnd(), y: rnd(), phase: rnd() * Math.PI * 2, speed: 0.3 + rnd() * 0.5, r: 1.5 + rnd() * 2.5,
    }));
    // tufts/flowers live in world space: x is a fraction of the world width
    this.tufts = Array.from({ length: 150 }, () => ({ x: rnd(), h: 6 + rnd() * 10, lean: (rnd() - 0.5) * 8, off: 14 + rnd() * 34 }));
    this.flowers = Array.from({ length: 34 }, () => ({ x: rnd(), off: 8 + rnd() * 30, c: rnd() }));
  }

  makeTrees(rnd, count, scale) {
    return Array.from({ length: count }, () => ({ x: rnd() * 1.25 - 0.05, h: 0.5 + rnd() * 0.5, w: 0.5 + rnd() * 0.4 }));
  }

  draw(ctx, W, H, t, camX = 0) {
    const bg = art.image('background', 0);
    if (bg) {
      const s = Math.max(W / bg.width, H / bg.height);
      ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s);
    } else {
      this.drawProceduralSky(ctx, W, H, camX);
    }
    this.drawPollen(ctx, W, H, t);

    const groundY = H * GROUND_Y;
    const groundImg = art.image('ground', 0);
    if (groundImg) {
      const gh = Math.min(groundImg.height, H - groundY + 40);
      const w = (groundImg.width / groundImg.height) * gh;
      let x = -(camX % w) - w; // start one tile left so the world never shows a gap
      for (; x < W + w; x += w) ctx.drawImage(groundImg, x, H - gh, w, gh);
    } else {
      this.drawProceduralGround(ctx, W, H, groundY, camX);
    }
  }

  // --- one-pen helpers (seeded per element, so nothing crawls between frames) ---
  blobPoints(cx, cy, rx, ry, seed, amp, n = 12) {
    const rnd = wobbleRng(seed), pts = [];
    const off = Array.from({ length: n }, () => rnd() * 2 - 1);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      pts.push([cx + Math.cos(a) * (rx + off[i] * amp), cy + Math.sin(a) * (ry + off[i] * amp)]);
    }
    return pts;
  }
  fillStroke(ctx, pts, fill) {
    smoothClosed(ctx, pts);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = PEN_W;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
  }
  drawTree(ctx, x, yBase, h, w, color, seed) {
    const trunkH = h * 0.30, tw = Math.max(9, w * 0.14);
    const r = wobbleRng(seed + 't');
    const tp = [[x - tw / 2, yBase + 4], [x - tw / 2 + (r() * 2 - 1) * 1.5, yBase - trunkH],
                [x + tw / 2 + (r() * 2 - 1) * 1.5, yBase - trunkH], [x + tw / 2, yBase + 4]];
    this.fillStroke(ctx, tp, color);
    const rx = w * 0.75, ry = h * 0.32;
    this.fillStroke(ctx, this.blobPoints(x, yBase - trunkH - h * 0.28, rx, ry, seed + 'c', rx * 0.07, 14), color);
  }
  // a clean TRIANGLE, base on the land line (straight edges — smoothing rounds the peak off)
  drawMountain(ctx, x, yb, w, h, color, seed) {
    const r = wobbleRng(seed), j = () => (r() * 2 - 1) * w * 0.015;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5 + j(), yb);
    ctx.lineTo(x - w * 0.04 + j(), yb - h + j());   // peak
    ctx.lineTo(x + w * 0.5 + j(), yb);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = PEN_W;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
  }
  drawRock(ctx, x, yb, w, h, seed) {
    this.fillStroke(ctx,
      this.blobPoints(x, yb - h * 0.5, w / 2, h * 0.52, seed, w * 0.05, 10).map(p => [p[0], Math.min(p[1], yb - 2)]),
      ROCK);
    const w2 = w * 0.42, h2 = h * 0.5;
    this.fillStroke(ctx,
      this.blobPoints(x + w * 0.55, yb - h2 * 0.5, w2 / 2, h2 * 0.55, seed + 'b', w2 * 0.06, 9).map(p => [p[0], Math.min(p[1], yb - 2)]),
      ROCK2);
  }
  drawClouds(ctx, W, H) {
    this.fillStroke(ctx, this.blobPoints(W * 0.16, H * 0.155, W * 0.07, 26, 'cloud-a', 26 * 0.18, 12), CLOUD);
    this.fillStroke(ctx, this.blobPoints(W * 0.875, H * 0.28, W * 0.052, 21, 'cloud-b', 21 * 0.18, 12), CLOUD);
  }

  drawProceduralSky(ctx, W, H, camX) {
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, W, H);
    if (art.has('trees', 0)) { this.drawTreeLayers(ctx, W, H, camX); return; }

    this.fillStroke(ctx, this.blobPoints(W * 0.78, H * 0.16, H * 0.052, H * 0.052, 'sun', H * 0.052 * 0.05, 12), SUN);
    this.drawClouds(ctx, W, H);

    const groundY = H * GROUND_Y, span = W * 1.25;
    this.layers.forEach((layer, li) => {
      ctx.save();
      ctx.globalAlpha = layer.alpha;
      const col = TREES[li];
      const yBase = groundY + li * 8;
      const shift = camX * PARALLAX[li];
      layer.trees.forEach((tr, i) => {
        const x = (((tr.x * span - shift) % span) + span) % span;
        if (tr.kind === 'giant') {
          // the one near-screen-height mountain, world-locked like its layer, full opacity
          ctx.save();
          ctx.globalAlpha = 1;
          this.drawMountain(ctx, x, yBase + 6, W * 0.34, H * 0.78, MOUNTAIN, `giant${i}`);
          ctx.restore();
        } else if (tr.kind === 'mountain') {
          this.drawMountain(ctx, x, yBase + 6, W * (0.13 + tr.w * 0.10), H * (0.34 + tr.h * 0.22), MOUNTAIN, `m${li}-${i}`);
        } else if (tr.kind === 'rock') {
          const rw = 90 + tr.w * 70;
          this.drawRock(ctx, x, yBase + 4, rw, rw * 0.52, `r${li}-${i}`);
        } else {
          this.drawTree(ctx, x, yBase, tr.h * H * 0.55 * (0.6 + layer.alpha * 0.4), tr.w * W * 0.09 + 18, col, `t${li}-${i}`);
        }
      });
      ctx.restore();
    });
  }

// the painted forest: the same three parallax layers and slot positions as
// the procedural one. Mountains/rocks slots and empty cast slots draw
// nothing here. Ring copies (±span) keep a tree painting until it is
// FULLY off-screen — the span wrap alone teleports a tree out when its
// center crosses the edge, which pops up to half a wide crown.
  drawTreeLayers(ctx, W, H, camX) {
    const groundY = H * GROUND_Y, span = W * 1.25;
    this.layers.forEach((layer, li) => {
      ctx.save();
      ctx.globalAlpha = layer.alpha;
      const yBase = groundY + li * 8;
      const shift = camX * PARALLAX[li];
      layer.trees.forEach((tr, i) => {
        const idx = TREE_CAST[`${li}-${i}`];
        if (idx == null || idx < 0 || !art.has('trees', idx)) return;
        const img = art.image('trees', idx);
// twice mom's height, ±5% per slot, depth-scaled per layer — and never
// upscaled past the art's natural pixels
        const ih = Math.min(
            H * MOM_H_FRAC * TREE_H_VS_MOM * (0.95 + (tr.h - 0.5) * 0.15) * TREE_LAYER_SIZE[li],
            img.height);
        const iw = ih * img.width / img.height;
        const yTop = yBase + (LAYER_DROP_PX[li] ?? 4) - ih;
        const x = (((tr.x * span - shift) % span) + span) % span;
        for (const k of [-1, 0, 1]) {
          const cx = x + k * span;
          if (cx + iw / 2 < 0 || cx - iw / 2 > W) continue;
          ctx.drawImage(img, cx - iw / 2, yTop, iw, ih);
        }
      });
      ctx.restore();
    });
  }

  drawProceduralGround(ctx, W, H, groundY, camX) {
    const g = ctx.createLinearGradient(0, groundY, 0, H);
    g.addColorStop(0, GROUND_TOP); g.addColorStop(1, GROUND_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = GROUND_LIP; ctx.fillRect(0, groundY, W, 8);

    // wobbly ink line along the land line — grounds the scene like a storybook page
    const r = wobbleRng('landline');
    ctx.beginPath();
    for (let x = -10; x <= W + 50; x += 40) {
      const y = groundY + (r() * 2 - 1) * 2;
      if (x < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = PEN_W; ctx.lineCap = 'round'; ctx.stroke();

    ctx.strokeStyle = TUFT; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const tf of this.tufts) {
      const x = tf.x * WORLD_W - camX;
      if (x < -10 || x > W + 10) continue;
      const y = groundY + tf.off;
      if (y > H - 4) continue;
      const sway = Math.sin(tf.x * 40) * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + tf.lean / 2, y - tf.h / 2, x + tf.lean + sway, y - tf.h); ctx.stroke();
    }
    for (const fl of this.flowers) {
      const x = fl.x * WORLD_W - camX;
      if (x < -10 || x > W + 10) continue;
      const y = groundY + fl.off + 4;
      if (y > H - 6) continue;
      const col = fl.c < 0.5 ? FLOWERS[0] : fl.c < 0.8 ? FLOWERS[1] : FLOWERS[2];
      ctx.fillStyle = col; ctx.strokeStyle = PAL.outline; ctx.lineWidth = PEN_W;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = FLOWER_CENTER;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  drawPollen(ctx, W, H, t) {
    ctx.save();
    ctx.fillStyle = POLLEN;
    for (const p of this.pollen) {
      const x = (p.x + Math.sin(t * 0.1 * p.speed + p.phase) * 0.02) * W;
      const y = (p.y + Math.cos(t * 0.07 * p.speed + p.phase) * 0.015) * H * 0.8;
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * p.speed + p.phase);
      ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
