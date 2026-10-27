// util.js — shared helpers: test mode, easing, seeded random, colors, tweens
export const TEST = new URLSearchParams(location.search).has('test');
export const TIME_SCALE = TEST ? 0.35 : 1; // animations finish faster under automation

// Scene vertical anchors — the single place to tune where everyone stands.
export const GROUND_Y = 0.82; // land line as a fraction of viewport height
export const PLANT_PX = 18;   // feet sit this many px below the land line (planted into the grass)

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = t => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixColor(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

// --- tween engine (frame-updated, respects TIME_SCALE)
const tweens = new Set();
export function tween({ dur = 500, delay = 0, ease = easeOutCubic, onUpdate, onDone }) {
  const tw = {
    t: -(delay * TIME_SCALE),
    dur: Math.max(1, dur * TIME_SCALE),
    ease, onUpdate, onDone, done: false,
    cancel() { if (this.done) return; this.done = true; tweens.delete(this); },
  };
  tweens.add(tw);
  return tw;
}
export function updateTweens(dtMs) {
  for (const tw of [...tweens]) {
    if (tw.done) continue;
    tw.t += dtMs;
    if (tw.t < 0) continue;
    const p = clamp(tw.t / tw.dur, 0, 1);
    if (tw.onUpdate) tw.onUpdate(tw.ease(p), p);
    if (p >= 1) { tw.done = true; tweens.delete(tw); if (tw.onDone) tw.onDone(); }
  }
}
export function tweenP(opts) {
  return new Promise(res => tween({ ...opts, onDone: () => { if (opts.onDone) opts.onDone(); res(); } }));
}
export function delay(ms) { return tweenP({ dur: ms, onUpdate: () => {} }); }
