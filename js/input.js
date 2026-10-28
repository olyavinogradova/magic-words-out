// input.js — unified pointer/touch + keyboard.
// While walking: hold a screen half to walk (phones also get the corner
// buttons, js/controls.js); jump is keyboard-only on desktop — Space / ⬆ /
// W. On the start screen Space/Enter press the cover's cloud button
// (⬆/W deliberately don't). During the encounter: taps hit word
// stones; Enter or a jump key (Space/⬆/W) taps the active stone (desktop)
// — the kid never needs the touchpad.
import { view, toVirtual } from './view.js';

export function initInput(canvas, ui, walk) {
  // pointer coords arrive in SCREEN px — map them into stage px (the stage
  // may be scaled and rotated on portrait screens)
  const pos = e => {
    const v = toVirtual(e.clientX, e.clientY);
    return { x: v.x, y: v.y, w: view.W, h: view.H };
  };

  canvas.addEventListener('pointerdown', e => {
    const { x, y, w, h } = pos(e);
    if (walk.active() && walk.pointerDown(e.pointerId, x, y, w, h)) {
      e.preventDefault();
      return;
    }
    const hit = ui.hit(x, y);
    if (hit) { e.preventDefault(); hit.cb(); }
  }, { passive: false });

  window.addEventListener('pointermove', e => {
    if (!walk.active()) return;
    const { x, y, w, h } = pos(e);
    walk.pointerMove(e.pointerId, x, y, w, h);
  });

  const release = e => { if (walk.active()) walk.pointerUp(e.pointerId); };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  };
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault();
      walk.setKey(k, true);
      // Jump keys double as the tap-ready skip (main.js guards the phase, so
      // this is inert while walking): the kid's big familiar key, no touchpad.
      // Left/right stay movement-only — kids hold them constantly and would
      // insta-skip the moment the fallback opens.
      if (k === 'jump' && ui.onPrimary) ui.onPrimary(e.code);
      return;
    }
    if (e.key === 'Enter' && ui.onPrimary) { e.preventDefault(); ui.onPrimary(e.code); }
    // Q — the parent's secret word skip (no hint anywhere in the game UI)
    if (e.code === 'KeyQ' && ui.onSecret) { e.preventDefault(); ui.onSecret(); }
  });
  window.addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k) walk.setKey(k, false);
  });
  window.addEventListener('blur', () => {
    walk.setKey('left', false); walk.setKey('right', false); walk.setKey('jump', false);
  });
}
