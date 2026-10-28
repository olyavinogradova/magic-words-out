// controls.js — the phone's on-screen buttons (back · fwd · jump). The DOM
// lives inside the stage (index.html #controls) so it rotates/scales with
// it; sizes/insets are real screen px via the --u var from view.js. Art is
// the buttons sheet; with zero art the procedural SVG arrows stay visible.
// Holding a button drives the touch path (walk.btnDown/btnUp), so the
// encounter's input freeze releases it like any screen-half touch.

import { art } from './art.js';

const COARSE = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const FORCE = new URLSearchParams(location.search).has('ctl'); // desktop preview: ?ctl=1

export function initControls(walk) {
  const root = document.getElementById('controls');
  const defs = [['ctlLeft', 'left', 0], ['ctlRight', 'right', 1], ['ctlJump', 'jump', 2]];
  const btns = defs.map(([id, zone, frame]) => {
    const el = document.getElementById(id);
    const bid = 'ctl:' + zone; // synthetic pointer id in walk.pointers
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* old webview */ }
      el.classList.add('pressed');
      walk.btnDown(bid, zone);
    });
    const release = () => { el.classList.remove('pressed'); walk.btnUp(bid); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', e => e.preventDefault()); // a long-press menu would eat the pointerup
    return { el, bid };
  });
  const dropAll = () => {
    for (const b of btns) { b.el.classList.remove('pressed'); walk.btnUp(b.bid); }
  };
  window.addEventListener('blur', dropAll); // walk keys clear in input.js; the button holds are ours

  // Art swap once every sheet frame settled (initControls runs after
  // art.load()); a missing single frame keeps ITS svg arrow — per-frame
  // fallback, like the canvas art.
  art.all('buttons').then(ok => {
    if (!ok) return;
    for (const [id, , frame] of defs) {
      const img = art.image('buttons', frame);
      if (!img) continue;
      const el = document.getElementById(id);
      el.classList.add('art');
      el.querySelector('img').src = img.src;
    }
  });

  let shown = null;
  // called per frame from main.js — visible exactly while the walk takes input
  return phase => {
    const next = (COARSE || FORCE) && phase === 'walk';
    if (next === shown) return;
    shown = next;
    root.classList.toggle('on', next);
    if (!next) dropAll(); // a phase change mid-press must not stick a zone
  };
}
