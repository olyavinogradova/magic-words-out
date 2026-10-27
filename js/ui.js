// ui.js — word stones, mic indicator, gem counter, HTML overlays, tap hit-testing.
// The child can't read: stones communicate by glow/pulse, text is a bonus for adults.
import { art } from './art.js';
import { drawGemShape } from './fx.js';
import { PAL, withAlpha, PEN_W, uiPill, uiCircle, applyGlow, clearGlow, starIcon, handPointIcon, micIcon } from './ui_style.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.words = [];
    this.stoneStates = [];
    this.stoneRects = [];
    this.mic = 'off';           // off | listen | miss | ready
    this.missT = 0;
    this.gems = 0;
    this.gemPop = 0;
    this.monsters = 0;          // friends made (0/2) — its own counter
    this.monsterPop = 0;        // progress splits into STONES and MONSTERS, no gem gifts)
    this.stoneTapHandler = null; // set by main: (i) => void
    this.onPrimary = null;        // Enter/Space key
    this.stonesVisible = false;   // word stones exist only inside the encounter
    this.t = 0;
// Start screen: with cover art a DOM pop-up shows the illustration and the
// milk CLOUD painted in it is the button (#coverBtn in index.html). No idle
// animation — it reacts on push only; Space/Enter also start (main.js
// onPrimary routes the start phase here).
    this.coverMode = null;   // null deciding/hidden · true cover · false card
    this.startCb = null;
    this.lastPress = 0;      // re-fire guard for key+click double starts
    $('coverBtn').addEventListener('pointerdown', () => this.pressCloud());
  }

  // The visible sink: veil + word dips (CSS), 150 ms so it is SEEN, then
  // start — still inside the gesture's activation window, so the audio
  // unlock in startGame stays valid.
  pressCloud() {
    if (!this.startCb) return;
    const now = performance.now();
    if (now - this.lastPress < 400) return;
    this.lastPress = now;
    const btn = $('coverBtn');
    btn.classList.add('pressed');
    setTimeout(() => { btn.classList.remove('pressed'); this.startPressed(); }, 150);
  }

  setStones(words) {
    this.words = words;
    this.stoneStates = words.map(() => 'pending');
  }

  setStoneState(i, state) { if (this.stoneStates[i] !== undefined) this.stoneStates[i] = state; }

  micState(s) {
    this.mic = s;
    if (s === 'miss') this.missT = 650;
  }

  setGems(n) { this.gems = n; this.gemPop = 350; }

  setMonsters(n) { this.monsters = n; }
  addMonster() { this.monsters++; this.monsterPop = 350; }

  // --- overlays
  // 'deciding' shows the scrim only while the cover art load settles, then
  // the cover POP-UP (index.html .cover-card) or — zero art — the HTML card.
  showStart(cb) {
    this.startCb = cb;
    const el = $('start');
    el.style.display = 'flex';
    el.classList.add('deciding');
    $('startBtn').onclick = () => this.startPressed(); // hidden in cover mode, still clickable (boo.pressStart)
    art.ready('cover').then(ok => {
      if (el.style.display === 'none') return; // already started
      this.coverMode = ok;
      el.classList.remove('deciding');
      el.classList.toggle('cover', ok);
    });
  }

  startPressed() { // the ONE start path — HTML button, cloud button and keys all land here
    if (!this.startCb) return;
    const cb = this.startCb;
    this.hideOverlays();
    cb();
  }

  showEnd(cb, msg = 'Ура! Новый друг!') {
    $('endMsg').textContent = msg;
    $('again').style.display = 'flex';
    $('againBtn').onclick = () => { this.hideOverlays(); cb(); };
  }

  hideOverlays() {
    this.coverMode = null;
    this.startCb = null;
    const el = $('start');
    el.style.display = 'none';
    el.classList.remove('deciding', 'cover');
    $('coverBtn').classList.remove('pressed');
    $('again').style.display = 'none';
  }

  // --- hit testing for taps (stones only respond in 'tap-ready')
  hit(x, y) {
    for (let i = 0; i < this.stoneRects.length; i++) {
      const r = this.stoneRects[i];
      if (this.stoneStates[i] === 'tap-ready' &&
          x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return { id: 'stone-' + i, cb: () => this.stoneTapHandler && this.stoneTapHandler(i) };
      }
    }
    return null;
  }

  stoneCenter(i) {
    const r = this.stoneRects[i];
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: 0, y: 0 };
  }

  gemCounterPos() { return { x: 46, y: 40 }; }

  // the MONSTERS counter sits right of the stones one (drawCounters keeps
  // room for two digits between them) — the friend beat bursts here
  monsterCounterPos() { return { x: 150, y: 40 }; }

  update(dtMs) {
    this.t += dtMs / 1000;
    if (this.missT > 0) {
      this.missT -= dtMs;
      if (this.missT <= 0 && this.mic === 'miss') this.mic = 'listen';
    }
    if (this.gemPop > 0) this.gemPop -= dtMs;
    if (this.monsterPop > 0) this.monsterPop -= dtMs;
  }

  draw(ctx, W, H) {
    // The start screen is pure DOM (scrim + .cover-card pop-up), so the
    // canvas just draws the world under it — no cover code here.
    this.drawWordStones(ctx, W, H, this.t);
    this.drawMic(ctx, W, H, this.t);
    this.drawCounters(ctx, W, H, this.t);
    this.drawTapKey(ctx, W, H, this.t);
  }

// The skip cue for keyboard kids: in tap-ready the pointing hand on the
// stone shows WHERE, this pill shows HOW — press the big jump key. The
// shape IS the space bar; no text (the child can't read). Touch devices
// skip it — there the stone tap is the natural gesture.
  drawTapKey(ctx, W, H, t) {
    if (!this.stoneStates.includes('tap-ready')) return;
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) return;
    const cx = W / 2, cy = H * 0.9; // the mic's spot — free while mic hides in tap-ready
    const w = Math.min(150, W * 0.3), h = 40;
    ctx.save();
    ctx.translate(cx, cy + Math.sin(t * 4) * 3);
    applyGlow(ctx, PAL.pink, 1, t, 'tapkey');
    uiPill(ctx, -w / 2, -h / 2, w, h, { fill: PAL.pinkLight, outline: null, seed: 'tapkey' });
    clearGlow(ctx);
    uiPill(ctx, -w / 2, -h / 2, w, h, { fill: null, outline: PAL.outline, lineW: PEN_W, seed: 'tapkey' });
    uiPill(ctx, -w * 0.22, -3, w * 0.44, 6, { fill: PAL.white, outline: null, seed: 'tapbar' }); // the ␣ glyph
    ctx.restore();
  }

  drawWordStones(ctx, W, H, t) {
    if (!this.words.length || !this.stonesVisible) { this.stoneRects = []; return; }
    const y = H * 0.13;
    const h = Math.min(64, H * 0.095);
    const gap = 14;
    ctx.font = `600 ${Math.round(h * 0.38)}px 'Lilita One', system-ui, sans-serif`;
    const widths = this.words.map(w => ctx.measureText(w.text).width + h * 0.7);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (this.words.length - 1);
    let x = (W - total) / 2;
    this.stoneRects = [];
    for (let i = 0; i < this.words.length; i++) {
      const state = this.stoneStates[i];
      let scale = 1;
      if (state === 'active') scale = 1 + Math.sin(t * 6) * 0.04;
      if (state === 'tap-ready') scale = 1.12 + Math.sin(t * 8) * 0.07;
      const w = widths[i] * scale, hh = h * scale;
      const cx = x + widths[i] / 2, cy = y + h / 2;
      this.stoneRects.push({ x: cx - w / 2, y: cy - hh / 2, w, h: hh });

// flat palette fill + hand-drawn outline; glow in the stone's own
// accent (soft when active, strongest when tap-ready). Seed stays stable
// per stone so the wobble never jumps between frames or state changes.
      const seed = 'stone-' + i;
      const style = state === 'done'
        ? { fill: PAL.green, line: PAL.outline, text: PAL.white }
        : state === 'tap-ready'
          ? { fill: PAL.pinkLight, line: PAL.outline, text: PAL.outline, glow: [PAL.pink, 1] }
          : state === 'active'
            ? { fill: PAL.yellow, line: PAL.outline, text: PAL.outline, glow: [PAL.yellow, 0.5] }
            : { fill: withAlpha(PAL.white, 0.42), line: withAlpha(PAL.outline, 0.8), text: withAlpha(PAL.outline, 0.72) };
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      if (style.glow) applyGlow(ctx, style.glow[0], style.glow[1], t, seed);
      uiPill(ctx, -w / 2, -hh / 2, w, hh, { fill: style.fill, outline: null, seed });
      clearGlow(ctx);
      uiPill(ctx, -w / 2, -hh / 2, w, hh, { fill: null, outline: style.line, lineW: PEN_W, seed });
      ctx.fillStyle = style.text;
      ctx.font = `600 ${Math.round(h * 0.38)}px 'Lilita One', system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.words[i].text, 0, 1);
      if (state === 'done') starIcon(ctx, w / 2 - h * 0.2, -hh / 2 + h * 0.17, h * 0.16, PAL.white);
      if (state === 'tap-ready') {
        handPointIcon(ctx, 0, -hh / 2 - h * 0.34 + Math.sin(t * 8) * 4, h * 0.38, PAL.white, PAL.outline);
      }
      ctx.restore();
      x += widths[i] + gap;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  drawMic(ctx, W, H, t) {
    if (this.mic === 'off' || this.mic === 'ready') return;
    const cx = W / 2, cy = H * 0.9;
    const r = 30;
    const missShake = this.mic === 'miss' ? Math.sin(t * 60) * 5 : 0;
    const col = this.mic === 'miss' ? PAL.coral : PAL.pink;
    ctx.save();
    ctx.translate(cx + missShake, cy);
    if (this.mic === 'listen') {
      for (const ph of [0, 0.5]) {
        const p = ((t * 0.8 + ph) % 1);
        ctx.globalAlpha = (1 - p) * 0.45;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r + 8 + p * 34, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    uiCircle(ctx, 0, 0, r, { fill: col, outline: PAL.outline, lineW: PEN_W, seed: 'mic' });
    micIcon(ctx, 0, -1, 34, PAL.white);
    ctx.restore();
  }

// The two progress counters: progress measures STONES and MONSTERS
// separately — befriending no longer pays gems. Recipe: a storybook art
// icon + the digit in warm white with a deep-outline stroke, pop-scale on
// gain; procedural fallback keeps the zero-art path.
  drawCounters(ctx, W, H, t) {
    ctx.font = `700 26px 'Lilita One', system-ui, sans-serif`;
    const digit = (x, y, n) => {
      ctx.fillStyle = PAL.white;
      ctx.strokeStyle = PAL.deep; ctx.lineWidth = 4;
      ctx.strokeText(String(n), x, y);
      ctx.fillText(String(n), x, y);
    };
    // stones — the grey boulder frame (stones_1), collected in the world
    const { x, y } = this.gemCounterPos();
    const pop = this.gemPop > 0 ? 1 + Math.sin((this.gemPop / 350) * Math.PI) * 0.35 : 1;
    if (art.has('stones', 0)) {
      art.drawFrame(ctx, 'stones', 0, x, y + 20 * pop, 40 * pop);
    } else {
      drawGemShape(ctx, x, y, 19 * pop, t);
    }
    digit(x + 30, y + 10, this.gems);
    // monsters — the fluffy befriended form; icon pops when a friend is made
    const m = this.monsterCounterPos();
    const mpop = this.monsterPop > 0 ? 1 + Math.sin((this.monsterPop / 350) * Math.PI) * 0.35 : 1;
    if (art.has('monster1', 3)) {
      art.drawFrame(ctx, 'monster1', 3, m.x, m.y + 20 * mpop, 40 * mpop);
    } else {
// zero-art fallback: a lavender magic blob with two eyes
      uiCircle(ctx, m.x, m.y + 20 * mpop, 19 * mpop, { fill: PAL.lavender, outline: PAL.outline, lineW: PEN_W, seed: 'mon-counter' });
      ctx.fillStyle = PAL.outline;
      for (const ex of [m.x - 7, m.x + 7]) {
        ctx.beginPath();
        ctx.arc(ex, m.y + 20 * mpop - 3, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    digit(m.x + 30, m.y + 10, this.monsters);
  }
}
