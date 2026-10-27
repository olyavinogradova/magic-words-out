// ui_style.js — the UI style lock as code: the palette and shared drawing
// helpers every UI element must use (canvas side).
//
// Self-contained on purpose: it must not reach into util.js or any other
// game module.

// The palette — the only colors UI may use. One entry per hex.
export const PAL = {
  outline:   '#2B2524', // main outline: every outline & icon stroke, text on paper
  deep:      '#1B1210', // deep outline: pressed states, deepest accents, scrim base
  paper:     '#F5EBDD', // warm paper: panels, cards, info windows
  white:     '#FFF8EE', // warm white: lightest fills, highlights, text on accents
  pink:      '#ED9794', // daughter pink: the voice / mic accent
  pinkLight: '#F3AAA5', // pink highlight: tap-ready fill, pressed
  green:     '#6F9B72', // success green : done stones, word-success bursts
  teal:      '#6FA6A0', // informational / neutral accent: controls
  yellow:    '#E8C66A', // active / reward / praise
  lavender:  '#9B8FB5', // magic / special moments
  coral:     '#C97870', // gentle miss / error — never harsh red
};

// Accent ↔ meaning: pink = voice · yellow = active/reward ·
// green = success/done · teal = info/controls · lavender = magic · coral = miss/error.

// The ONE outline pen: a constant 0.6 px #2B2524 line for every element —
// UI and scene alike. Matches the character art's on-screen stroke
// (mom ≈ 0.9 px, daughter ≈ 1.1 px, stones ≈ 0.6 px at game scale). Line
// weight belongs to the artwork, not the element size — never scale the
// pen with size.
export const PEN_W = 0.6;

export function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// --- handmade wobble ---------------------------------------------------------
// Subtle, STABLE irregularity: the same seed always bends a shape the
// same way, so nothing crawls between frames (±2–3 % of size, never
// per-frame random).

function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Exported for scene drawing (js/world.js): the same seeded, frame-stable wobble.
export function wobbleRng(seed) { // mulberry32
  let a = hashSeed(seed) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Closed smooth curve through points (quadratic midpoints) — the one path maker.
// Exported for scene drawing (js/world.js) so the whole page shares one wobble language.
export function smoothClosed(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

function circlePoints(cx, cy, r, seed, amp) {
  const rnd = wobbleRng(seed), pts = [], n = 16;
  const off = Array.from({ length: n }, () => rnd() * 2 - 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = r + off[i] * amp;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

function pillPoints(x, y, w, h, seed, amp) {
  const R = h / 2, cy = y + R, rnd = wobbleRng(seed), pts = [];
  const push = (px, py, nx, ny) =>
    pts.push([px + nx * amp * (rnd() * 2 - 1), py + ny * amp * (rnd() * 2 - 1)]);
  const m = 6, k = 4;
  for (let i = 0; i <= m; i++) {           // right cap, top → bottom
    const a = -Math.PI / 2 + (i / m) * Math.PI;
    push(x + w - R + Math.cos(a) * R, cy + Math.sin(a) * R, Math.cos(a), Math.sin(a));
  }
  for (let i = 1; i <= k; i++)             // bottom edge, right → left
    push(x + w - R - (i / k) * (w - 2 * R), cy + R, 0, 1);
  for (let i = 0; i <= m; i++) {           // left cap, bottom → top
    const a = Math.PI / 2 + (i / m) * Math.PI;
    push(x + R + Math.cos(a) * R, cy + Math.sin(a) * R, Math.cos(a), Math.sin(a));
  }
  for (let i = 1; i <= k; i++)             // top edge, left → right
    push(x + R + (i / k) * (w - 2 * R), cy - R, 0, -1);
  return pts;
}

function strokeFill(ctx, fill, outline, lineW) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineW;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// --- the two standard UI shapes (flat fill + hand-drawn outline in one call) --

export function uiPill(ctx, x, y, w, h, opts = {}) {
  const { fill = PAL.paper, outline = PAL.outline, lineW = null, seed = 'pill', amp = null } = opts;
  const a = amp ?? Math.max(1, Math.min(w, h) * 0.025);
  smoothClosed(ctx, pillPoints(x, y, w, h, seed, a));
  strokeFill(ctx, fill, outline, lineW ?? PEN_W);
}

export function uiCircle(ctx, cx, cy, r, opts = {}) {
  const { fill = PAL.paper, outline = PAL.outline, lineW = null, seed = 'circle', amp = null } = opts;
  const a = amp ?? Math.max(1, r * 0.045);
  smoothClosed(ctx, circlePoints(cx, cy, r, seed, a));
  strokeFill(ctx, fill, outline, lineW ?? PEN_W);
}

// --- glow & shadow ------------------------------------------------------------

// Glow — the child's non-reading signal channel. An element glows in its
// OWN accent; strength 0..1 (active ≈ 0.5, tap-ready = 1). Sets ctx.shadow*;
// pair with clearGlow after the glowing fill.
export function applyGlow(ctx, color, strength, t, seed = 0) {
  const pulse = Math.sin(t * 4 + (hashSeed(seed) % 7)) * 0.5 + 0.5; // ~1.6 s, gentle
  ctx.shadowColor = color;
  ctx.shadowBlur = (8 + 22 * strength) * (0.72 + 0.4 * pulse * strength);
}

export function clearGlow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// Soft warm-dark shadow, separation only (rgba(27,18,16,.12–.18), wide blur).
// Draws a solid caster under the element; the real (opaque) element covers it.
export function softShadow(ctx, kind, x, y, w, h, opts = {}) {
  const { offsetY = 4, blur = 16, alpha = 0.16 } = opts;
  ctx.save();
  ctx.shadowColor = `rgba(27,18,16,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  ctx.fillStyle = PAL.deep;
  ctx.beginPath();
  if (kind === 'circle') ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
  else ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.restore();
}

// --- drawn icons (silhouette-first, at most two inner lines) -------------------

export function starIcon(ctx, cx, cy, r, color = PAL.white) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.18; // fattens + rounds the tips so it stays handmade
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function arrowUpIcon(ctx, cx, cy, r, color = PAL.teal) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.95, cy + r * 0.55);
  ctx.lineTo(cx - r * 0.95, cy + r * 0.55);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.32; // bold rounded silhouette
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function micIcon(ctx, cx, cy, h, color = PAL.white) {
  const w = h * 0.42;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h * 0.52, w / 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, h * 0.09);
  ctx.lineCap = 'round';
  ctx.beginPath(); // cradle
  ctx.arc(cx, cy - h * 0.02, h * 0.3, -0.15, Math.PI + 0.15);
  ctx.stroke();
  ctx.beginPath(); // stem
  ctx.moveTo(cx, cy + h * 0.26);
  ctx.lineTo(cx, cy + h * 0.42);
  ctx.stroke();
  ctx.restore();
}

// Simplified pointing hand (tap cue): extended index finger + fist blob, one
// shared silhouette. Replaces the 👆 emoji.
export function handPointIcon(ctx, cx, cy, s, color = PAL.white, outline = PAL.outline) {
  const fingerPath = () => {
    ctx.beginPath();
    ctx.roundRect(cx - s * 0.11, cy - s * 0.66, s * 0.22, s * 0.8, s * 0.11);
  };
  const fistPath = () => {
    ctx.beginPath();
    ctx.arc(cx + s * 0.02, cy + s * 0.22, s * 0.34, 0, Math.PI * 2);
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(2, s * 0.14);
  fingerPath(); ctx.stroke();
  fistPath(); ctx.stroke();
  ctx.fillStyle = color;
  fingerPath(); ctx.fill();
  fistPath(); ctx.fill();
  ctx.restore();
}
