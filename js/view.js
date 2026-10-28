// view.js — virtual viewport. All game logic and draw code work in a
// landscape stage DESIGN_H px tall; the stage is scaled onto the real screen
// and rotated 90° on portrait screens, so the game always renders landscape
// and every on-screen proportion matches the design resolution regardless
// of the device.
export const DESIGN_H = 900; // design height — the px constants in the game assume it
export const W_MIN = 700;    // virtual width clamp: keeps encounter framing sane
export const W_MAX = 2200;

export const view = { W: 0, H: DESIGN_H, s: 1, rotated: false, tx: 0, ty: 0 };

// Fit the stage to the window: height-locked scale, width adapts (clamped —
// a clamped width re-fits the scale and letterboxes), portrait = rotate.
// Also sizes the canvas CSS box and sets --sw/--sh (stage px) for CSS that
// must react to the stage rather than the real screen.
export function layoutViewport(stage, canvas, innerW, innerH) {
  const rotated = innerH > innerW;
  const sw = rotated ? innerH : innerW; // screen extent along the stage width
  const sh = rotated ? innerW : innerH; // screen extent along the stage height
  let s = sh / DESIGN_H;
  const W = Math.max(W_MIN, Math.min(W_MAX, Math.round(sw / s)));
  if (W * s > sw) s = sw / W;
  view.W = W; view.H = DESIGN_H; view.s = s; view.rotated = rotated;
  stage.style.width = W + 'px';
  stage.style.height = DESIGN_H + 'px';
  stage.style.setProperty('--sw', W + 'px');
  stage.style.setProperty('--sh', DESIGN_H + 'px');
  // 1 real screen px in stage units — lets DOM overlays size controls in
  // device px (touch targets, insets) while living inside the scaled stage
  stage.style.setProperty('--u', (1 / s) + 'px');
  // transform list applies right-to-left: point -> scale -> (rotate) -> translate
  view.tx = rotated ? s * DESIGN_H : (innerW - W * s) / 2;
  view.ty = rotated ? (innerH - W * s) / 2 : (innerH - DESIGN_H * s) / 2;
  stage.style.transform = `translate(${view.tx}px, ${view.ty}px)` +
    (rotated ? ' rotate(90deg)' : '') + ` scale(${s})`;
  canvas.style.width = W + 'px';
  canvas.style.height = DESIGN_H + 'px';
}

// screen (client) px -> stage px: exact inverse of the transform above.
// Rotated forward mapping is screen_x = tx − s·y, screen_y = ty + s·x.
export function toVirtual(clientX, clientY) {
  return view.rotated
    ? { x: (clientY - view.ty) / view.s, y: (view.tx - clientX) / view.s }
    : { x: (clientX - view.tx) / view.s, y: (clientY - view.ty) / view.s };
}
