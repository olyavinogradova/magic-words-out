// props.js — forest barriers: three LOW kinds — log · big stone · stump —
// plus two TALL ones (pillar · cliff), each reachable only from the top of
// the barrier before it (levels.js cascade; a ground jump's apex is
// 180.5 px). The GIRL jumps onto their tops (walk.js platform physics,
// girl-only); mom has NO prop logic at all and passes them on the ground —
// she never jumps.
//
// The real art (assets/art/barriers_*.png) draws at the barrier's data
// height; this procedural path stays as the zero-art fallback.
import { art } from './art.js';
import { World } from './world.js';
import { PAL, PEN_W } from './ui_style.js';
import { clamp } from './util.js';

// The blob/rock drawing helpers live in world.js — this bare instance
// exists purely to reuse them.
const shapes = new World();

// Placeholder wood tones for the log/stump/pillar — scene colors, same status
// as world.js's ROCK greys (the real art defines the final look).
const LOG = '#A68A64', LOG_DARK = '#8A6D4A', LOG_END = '#C4AD8B';

// kind → frame index in the props art; data/levels.js kinds must match.
const FRAME = { log: 0, rock: 1, stump: 2, pillar: 3, cliff: 4 };

// Per-column VISIBLE surface of each barrier art: the collision plane sits
// at the art's apex tangent, but the painted silhouettes are CURVED — per
// column the visible top sags 10–70% of the art height below that tangent
// (log apex at u≈0.70, stone at u≈0.30, stump at u≈0.87). Measured ONCE
// per kind from the loaded art (downscaled readback, cached); the flat
// gemSink offsets this replaces could only fit one column.
// DRAW-ONLY: landing, side-block and gem-collect physics stay on the plane.
const SURF_COLS = 96, SURF_ROWS = 64, SURF_ALPHA = 24;
const surfRows = new Map(); // kind -> Float32Array(SURF_COLS) pad fractions | null

function measureSurface(kind) {
  const i = FRAME[kind] ?? 1;
  if (!art.has('props', i)) return null;
  const img = art.image('props', i);
  const c = document.createElement('canvas');
  c.width = SURF_COLS; c.height = SURF_ROWS;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, SURF_COLS, SURF_ROWS);
  const data = g.getImageData(0, 0, SURF_COLS, SURF_ROWS).data;
  const tops = new Float32Array(SURF_COLS);
  let apex = SURF_ROWS;
  for (let col = 0; col < SURF_COLS; col++) {
    let top = SURF_ROWS;
    for (let row = 0; row < SURF_ROWS; row++) {
      if (data[(row * SURF_COLS + col) * 4 + 3] > SURF_ALPHA) { top = row; break; }
    }
    tops[col] = top;
    if (top < apex) apex = top;
  }
  // pad as a fraction of art height, clamped so a degenerate column (a hole
  // or a stray fleck) can't sink the girl absurdly low
  const out = new Float32Array(SURF_COLS);
  for (let col = 0; col < SURF_COLS; col++) out[col] = Math.min(0.75, (tops[col] - apex) / SURF_ROWS);
  return out;
}

function surfaceRow(kind) {
  const i = FRAME[kind] ?? 1;
  let row = surfRows.get(kind);
  // a cached null means "art wasn't loaded YET" (art.js loads async) — recheck
  if (row === undefined || (row === null && art.has('props', i))) {
    row = measureSurface(kind);
    surfRows.set(kind, row);
  }
  return row;
}

// How far the VISIBLE surface sits below the collision plane at u∈[0,1] across
// the barrier's width (u = (x − p.x)/p.w + 0.5), in px at the barrier's drawn
// height h. Zero-art fallback → 0 (the procedural shapes draw to the plane).
export function surfacePad(kind, u, h) {
  const row = surfaceRow(kind);
  if (!row) return 0;
  const f = clamp(u, 0, 1) * (SURF_COLS - 1);
  const i0 = Math.floor(f), i1 = Math.min(SURF_COLS - 1, i0 + 1);
  return (row[i0] + (row[i1] - row[i0]) * (f - i0)) * h;
}

// Draw one barrier at screen x, feet on the land line. The collision plane is
// groundY - p.h — the art is drawn at exactly that height so its top matches.
export function drawProp(ctx, p, sx, groundY) {
  const i = FRAME[p.kind] ?? 1;
  if (art.has('props', i)) {
    art.drawFrame(ctx, 'props', i, sx, groundY, p.h);
    return;
  }
  ctx.save();
  ctx.lineWidth = PEN_W;
  ctx.strokeStyle = PAL.outline;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const top = groundY - p.h;
  if (p.kind === 'log') {
    ctx.beginPath();
    ctx.roundRect(sx - p.w / 2, top, p.w, p.h, p.h / 2);
    ctx.fillStyle = LOG; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx - p.w / 2 + p.h * 0.55, top + p.h / 2, p.h * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = LOG_END; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx - p.w / 2 + p.h * 0.55, top + p.h / 2, p.h * 0.13, 0, Math.PI * 2);
    ctx.strokeStyle = LOG_DARK; ctx.stroke();
  } else if (p.kind === 'rock') {
    shapes.drawRock(ctx, sx, groundY, p.w, p.h, 'prop' + p.x);
  } else if (p.kind === 'pillar') {
    // tall wooden post — the top face exactly at groundY - p.h
    ctx.beginPath();
    ctx.roundRect(sx - p.w * 0.3, top, p.w * 0.6, p.h, p.w * 0.22);
    ctx.fillStyle = LOG; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(sx, top, p.w * 0.3, p.h * 0.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = LOG_END; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = LOG_DARK;
    for (const dy of [0.3, 0.55, 0.8]) {
      ctx.beginPath();
      ctx.moveTo(sx - p.w * 0.22, top + p.h * dy);
      ctx.quadraticCurveTo(sx, top + p.h * (dy - 0.06), sx + p.w * 0.22, top + p.h * dy);
      ctx.stroke();
    }
  } else if (p.kind === 'cliff') {
    // tall rock wall — the same rock shapes as world.js, stretched tall
    shapes.drawRock(ctx, sx, groundY, p.w, p.h, 'prop' + p.x);
  } else { // stump — mossy trunk disc, the top face exactly at groundY - p.h
    ctx.beginPath();
    ctx.roundRect(sx - p.w * 0.32, groundY - p.h * 0.7, p.w * 0.64, p.h * 0.7, 6);
    ctx.fillStyle = LOG; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(sx, groundY - p.h * 0.7, p.w * 0.32, p.h * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = LOG_END; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(sx, groundY - p.h * 0.7, p.w * 0.17, p.h * 0.085, 0, 0, Math.PI * 2);
    ctx.strokeStyle = LOG_DARK; ctx.stroke();
  }
  ctx.restore();
}
