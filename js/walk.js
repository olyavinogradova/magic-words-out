// walk.js — the walking world. The DAUGHTER leads (she is the player):
// hold a screen half / arrow key to walk, Space / ⬆ / W to jump. There is
// no on-screen jump button — jumping is keyboard-only, and since barriers
// block nobody, jumping is optional gem play. Mom follows on a breadcrumb
// trail on the ground (she replays the girl's PATH but never her jumps —
// and has no prop logic at all: she walks past every barrier). When the
// girl walks BACK and reaches her, mom turns with her, waits for the
// usual gap, and then follows behind on the girl's new side (stepMom).
// The barriers don't block the GIRL either — she passes them on the
// ground IN FRONT; the tops stay landable platforms, so jumping is how
// she reaches the barrier gems (js/props.js). At the encounter trigger,
// input freezes, the camera locks, and MOM DASHES FORWARD past the girl
// to shield her — then encounter.js takes over. After the monster is
// befriended the gate opens and the walk resumes to the finish gate.
//
// The arrive-sequence is frame-driven (no awaits); reset() bumps a run id
// so a reset mid-sequence is safe (encounter.js pattern).

import { clamp, GROUND_Y, PLANT_PX } from './util.js';
import { art } from './art.js';
import { voice } from './voice.js';
import { fx, drawGemShape } from './fx.js';
import { PAL } from './ui_style.js';
import { LEVEL_1 } from '../data/levels.js';
import { DAU_H_FRAC } from './players.js';
import { drawProp, surfacePad } from './props.js';

const WALK = {
  maxSpeed: 320, accel: 1700, friction: 1500, turnBoost: 2.2,
  jumpVelocity: 950, jumpForward: 200,
// An early-release short hop (cutMult) was dropped on purpose: a 5-6yo
// TAPS the key — a tap must give the full ~180px jump, or the high stones
// are unreachable. fallMult (snappier fall) is kept.
  gravity: 2500, fallMult: 1.3, maxFall: 1300,
  cameraSoftness: 8, lookAhead: 70,
  collectR: 75,
  trailGap: 115,        // mom stays this far behind the girl
  dashSpeed: 640,       // mom's run to the shield position
  autoSpeed: 250,       // girl's auto-walk to her encounter mark
  gatePad: 110,         // the girl can't pass this point left of the monster
};

const D = LEVEL_1.walk;

export class Walk {
  constructor({ ui, onArrive, onEncounter, onFinish }) {
    this.ui = ui;
    this.onArrive = onArrive;       // (encIndex) => void — main reveals THAT monster sitting
    this.onEncounter = onEncounter; // (encIndex) => void — main starts that encounter.run()
    this.onFinish = onFinish;       // () => void — main plays the finish flow
    this.runId = 0;
    this.reset();
  }

  reset() {
    this.runId++;
    this.phase = 'idle';        // idle | walk | arrive | frozen | done
    this.t = 0;
    this.input = { left: false, right: false, jump: false };
    this.keys = { left: false, right: false, jump: false };
    this.pointers = new Map();  // pointerId -> 'left' | 'right' | 'jump'
    this.jumpPrev = false;
    this.jumpPulse = false; // one-frame jump press from the test API
    this.girl = { x: D.startX, vx: 0, vy: 0, y: 0, dir: 1, onGround: true, onProp: null, landT: 0, pickT: 0, holdT: 0 };
    this.mom = { x: D.startX - WALK.trailGap, y: 0, dir: 1, speed: 0 };
    this.trail = [{ x: this.girl.x, y: 0, dir: 1 }];
    this.camX = 0;
    this.camLock = null;
    this.marks = null;          // { momX, girlX } world coords at the encounter
    this.props = (D.props || []).map(p => ({ ...p })); // barriers — girl-only platforms
    this.stones = D.stones.map((s, i) => ({ x: s.x, t: s.t, v: i % 24, taken: false }));
// barrier gems (t2): lying ON the prop's top (see stoneY). They cycle a
// crystal-heavy slice of the stones sheet so they read as little
// treasures — spread up to 110 px apart (two stones side by side read as
// one pile, not a treasure).
    let vi = this.stones.length;
    for (const p of this.props) {
      const n = p.gems || 0;
      const span = Math.min(p.w - 60, 110 * (n - 1));
      for (let i = 0; i < n; i++) {
        this.stones.push({
          x: p.x + (n > 1 ? -span / 2 + (span / (n - 1)) * i : 0),
          t: 2, v: (5 + (vi++) * 4) % 24, taken: false, prop: p,
        });
      }
    }
    this.collected = 0;
    this.encIndex = 0;         // how many encounters are DONE; encounters[encIndex] is next
    this.finished = false;
    this.girlWow = null;        // promise of the girl's reaction line (encounter awaits it)
    this.moved = false;
    this.dustAcc = 0;
  }

  begin() {
    this.reset();
    this.phase = 'walk';
    voice.speak('native', LEVEL_1.linesNative.walkIntro); // fire-and-forget: the kid can walk while mom talks
  }

  active() { return this.phase !== 'idle'; }
  frozen() { return this.phase === 'arrive' || this.phase === 'frozen' || this.phase === 'done'; }

  snapshot() {
    return {
      phase: this.phase,
      enc: this.encIndex, // how many encounters are done (0,1,2)
      x: this.girl.x, momX: this.mom.x, momDir: this.mom.dir, camX: this.camX,
      collected: this.collected, air: !this.girl.onGround,
      stonesLeft: this.stones.filter(s => !s.taken).length,
      stonesTaken: this.stones.map(s => (s.taken ? 1 : 0)).join(''),
      airY: Math.round(this.girl.y),
      onProp: this.girl.onProp ? this.girl.onProp.kind : null,
    };
  }

  // --- input (pointer zones + keyboard + test API all merge here)
  hitZone(x, y, W, H) {
// no on-screen jump button — the whole right half walks right; jump is
// keyboard-only
    return x < W / 2 ? 'left' : 'right';
  }

  pointerDown(id, x, y, W, H) {
    if (this.phase !== 'walk') return false;
    this.pointers.set(id, this.hitZone(x, y, W, H));
    this.applyInputs();
    return true;
  }

  pointerMove(id, x, y, W, H) {
    if (this.pointers.has(id)) this.pointers.set(id, this.hitZone(x, y, W, H));
    this.applyInputs();
  }

  pointerUp(id) { this.pointers.delete(id); this.applyInputs(); }

  setKey(name, down) { this.keys[name] = !!down; this.applyInputs(); }

  applyInputs() {
    const held = new Set(this.pointers.values());
    this.input.left = held.has('left') || this.keys.left;
    this.input.right = held.has('right') || this.keys.right;
    this.input.jump = held.has('jump') || this.keys.jump;
  }

  // --- update
  update(dtMs, W, H) {
    const dt = Math.min(dtMs, 50) / 1000;
    this.t += dt;
    const g = this.girl;
    g.landT = Math.max(0, g.landT - dtMs);
    g.pickT = Math.max(0, g.pickT - dtMs);
    g.holdT = Math.max(0, g.holdT - dtMs);

    if (this.phase === 'walk') {
      this.stepGirl(dt, W, H);
      this.stepMom(dt);
      this.collectStones(W, H);
      this.checkZones(W, H);
    } else if (this.phase === 'arrive') {
      this.stepArrive(dt, W, H);
    }
    this.stepCamera(dt, W, H);
    // a test-API jump pulse lasts one frame
    this.jumpPulse = false;
  }

// The praise visual: by the time mom speaks, the girl is already standing
// slightly AHEAD of her, both calm, facing the friend — the same picture
// the walk resumes into. Instant reposition, no animation.
  girlComeForward(dx) {
    if (this.phase !== 'frozen') return;
    this.girl.x = Math.min(this.girl.x + dx, D.worldWidth - 40);
    this.girl.dir = 1;
    this.girl.vx = 0;
    this.trail = [{ x: this.girl.x, y: 0, dir: 1 }];
  }

  stepGirl(dt, W, H) {
    const g = this.girl;
    const groundY = H * GROUND_Y + PLANT_PX;
    const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    if (dir !== 0) {
      if (g.onGround && dir * g.vx < -WALK.maxSpeed * 0.5) fx.dust(g.x - this.camX, groundY, 5);
      g.dir = dir;
      const boost = dir * g.vx < 0 ? WALK.turnBoost : 1;
      g.vx = clamp(g.vx + dir * WALK.accel * boost * dt, -WALK.maxSpeed, WALK.maxSpeed);
      this.moved = true;
    } else if (g.onGround) {
      const f = WALK.friction * dt;
      g.vx = Math.abs(g.vx) <= f ? 0 : g.vx - Math.sign(g.vx) * f;
    }
    g.x += g.vx * dt;
    g.x = clamp(g.x, 40, D.worldWidth - 40);
    // encounter gate — the NEXT monster blocks the way until it is befriended
    // (encounters[] in data/levels.js; with all befriended the path is open)
    const pending = D.encounters[this.encIndex];
    if (pending) {
      const gate = pending.x - WALK.gatePad;
      if (g.x > gate) { g.x = gate; if (g.vx > 0) g.vx = 0; }
    }
// Barriers do NOT block the girl: like mom she passes them on the ground
// IN FRONT — the level is walkable without collecting the top gems. They
// stay LANDABLE tops (below): jumping on one makes it a platform to reach
// its gems, and the low step log before the tall rock (data/levels.js)
// turns that climb into two easy hops.

    if (g.onGround) {
      const jumpHeld = this.input.jump || this.jumpPulse;
      if (jumpHeld && !this.jumpPrev) {
        g.vy = WALK.jumpVelocity;
        if (dir !== 0 && dir * g.vx < WALK.jumpForward) g.vx = dir * WALK.jumpForward;
        g.onGround = false;
        g.onProp = null;
        fx.dust(g.x - this.camX, groundY, 6);
      }
    }
    // walked off a barrier's edge? -> fall (support is lost past its rim)
    if (g.onGround && g.onProp && Math.abs(g.x - g.onProp.x) > g.onProp.w / 2 + 4) {
      g.onGround = false; g.onProp = null; g.vy = 0;
    }
    if (!g.onGround) {
      const gr = g.vy > 0 ? WALK.gravity : WALK.gravity * WALK.fallMult; // full jump, always
      g.vy = Math.max(g.vy - gr * dt, -WALK.maxFall);
      const prevY = g.y;
      g.y += g.vy * dt;
      // land ON a barrier top — a girl-only platform; mom never leaves the ground
      if (g.vy < 0) {
        for (const p of this.props) {
          if (Math.abs(g.x - p.x) > p.w / 2 + 8) continue;
          if (prevY >= p.h && g.y <= p.h) {
            g.y = p.h; g.vy = 0; g.onGround = true; g.onProp = p; g.landT = 200;
            fx.dust(g.x - this.camX, groundY - p.h, 8);
            break;
          }
        }
      }
      if (!g.onGround && g.y <= 0) {
        g.y = 0; g.vy = 0; g.onGround = true; g.onProp = null;
        g.landT = 200;
        fx.dust(g.x - this.camX, groundY, 8);
      }
    }
    this.jumpPrev = this.input.jump || this.jumpPulse;

    // breadcrumb trail for mom — sample on movement
    const last = this.trail[0];
    if (!last || Math.abs(last.x - g.x) > 6 || Math.abs(last.y - g.y) > 8) {
      this.trail.unshift({ x: g.x, y: g.y, dir: g.dir });
      if (this.trail.length > 600) this.trail.pop();
    }
  }

  stepMom(dt) {
// Mom follows on the girl's breadcrumb trail, always BEHIND her kid at
// trailGap — on whichever side of the girl she currently is. She moves
// independently at the girl's pace and stays ON THE GROUND — she does NOT
// replay the girl's jumps and has NO prop logic at all: she passes every
// barrier on the ground, drawn in front of it.
    //
// Retreat choreography: when the girl walks back and reaches her, mom
// TURNS to face the way the girl is going — then WAITS, turned, while the
// girl opens the usual trailGap between them, and only then starts
// following as usual. Mom keeps her current side of the girl; sides swap
// only by the GIRL crossing HER, never by mom walking past the girl.
    const g = this.girl;
    let tx;
    if (this.mom.x <= g.x) {
      // mom behind on the LEFT (the usual lead): chase the newest trail point
      // at least trailGap left of the girl
      let tgt = null;
      for (const s of this.trail) {
        if (s.x <= g.x - WALK.trailGap) { tgt = s; break; }
      }
      if (!tgt) tgt = this.trail[this.trail.length - 1] || { x: g.x - WALK.trailGap, y: 0, dir: 1 };
      tx = Math.min(tgt.x, g.x - WALK.trailGap); // never ahead of the gap
// she never walks left just to open the gap — the girl must cross her
// and open the usual distance herself
      if (tx < this.mom.x && g.x >= this.mom.x - WALK.trailGap) tx = this.mom.x;
    } else {
      // mom behind on the RIGHT (the girl walked back past her): mirror —
      // chase the newest trail point at least trailGap RIGHT of the girl
      let tgt = null;
      for (const s of this.trail) {
        if (s.x >= g.x + WALK.trailGap) { tgt = s; break; }
      }
      if (!tgt) tgt = this.trail[this.trail.length - 1] || { x: g.x + WALK.trailGap, y: 0, dir: -1 };
      tx = Math.max(tgt.x, g.x + WALK.trailGap); // never ahead of the gap
      // and she never walks right just to open the gap either
      if (tx > this.mom.x && g.x <= this.mom.x + WALK.trailGap) tx = this.mom.x;
    }
// facing while she WAITS: she faces the girl's side of her — the crossing
// itself is the turn; the 10 px seam keeps the facing from flickering
// when they stand overlapping
    if (Math.abs(tx - this.mom.x) < 0.5) {
      if (g.x < this.mom.x - 10) this.mom.dir = -1;
      else if (g.x > this.mom.x + 10) this.mom.dir = 1;
    }
    const speed = WALK.maxSpeed * 1.15;
    const step = clamp(tx - this.mom.x, -speed * dt, speed * dt);
    this.mom.x = clamp(this.mom.x + step, 10, D.worldWidth - 10);
    this.mom.speed = dt > 0 ? Math.abs(step) / dt : 0;
    this.mom.y = 0;
    if (Math.abs(step) > 1) this.mom.dir = step > 0 ? 1 : -1;
  }

  collectStones(W, H) {
    const g = this.girl;
    const girlH = H * DAU_H_FRAC;
    const cy = g.y + girlH * 0.4; // her center, height above the land line
    for (const s of this.stones) {
      if (s.taken) continue;
// barrier gems are taken from UP ON the barrier — standing below them
// (even pressed against the side) collects nothing. Up there the stone
// lies at her feet: vertical distance is zero, the horizontal check is
// what matters (the sunk gem tops + tall windows could otherwise push dy
// past collectR).
      if (s.prop && g.y < s.prop.h - 40) continue;
      const dx = g.x - s.x;
      const dy = s.prop ? 0 : cy - this.stoneY(s);
      if (dx * dx + dy * dy < WALK.collectR * WALK.collectR) {
        s.taken = true;
        this.collected++;
        const groundY = H * GROUND_Y + PLANT_PX;
        const sx = s.x - this.camX, sy = groundY - this.stoneY(s);
        fx.burst(sx, sy, { color: '#ffe08a', n: 14, speed: 200 });
        voice.sfx('gem'); // at the PICKUP moment — not when the gem lands at the counter
        fx.flyGem({ x: sx, y: sy }, this.ui.gemCounterPos(), 600, 0, () => {
          this.ui.setGems(this.ui.gems + 1);
        });
        g.pickT = 420; g.holdT = 1400; // pick, then hold the gem up
      }
    }
  }

// Tier -> height above the land line (px). t1 rests on the grass (16 px
// puts the art bottom on the grass line); a barrier gem (t2) lies ON its
// prop's VISIBLE top face — the painted silhouette sags below the flat
// collision plane (curved tops), so sink the stone by the measured
// per-column depth (props.js surfacePad). Collect logic still uses the
// plane.
  stoneY(s) {
    if (s.prop) {
      const u = (s.x - s.prop.x) / s.prop.w + 0.5;
      return s.prop.h + 16 - surfacePad(s.prop.kind, u, s.prop.h);
    }
    return 16;
  }

  checkZones(W, H) {
    if (this.phase !== 'walk') return;
    const next = D.encounters[this.encIndex];
    if (!this.marks && next) {
      const trig = next.x - Math.max(560, W * 0.36 + Math.min(W, H) * 0.075 + 90);
// Fire only from the GROUND: the arrive sequence and the encounter layout
// assume ground level, and the girl can cross the trigger line mid-fall
// off a barrier rim — she'd slide to her mark floating. Waiting for her
// feet to touch grass costs at most a few frames.
      if (this.girl.x > trig && this.girl.onGround && !this.girl.onProp) this.startArrive(W, H);
    }
    if (!next && !this.finished && this.girl.x > D.finishX - 60) {
      this.finished = true;
      this.phase = 'done';
      this.onFinish();
    }
  }

  startArrive(W, H) {
    const ex = D.encounters[this.encIndex].x; // this segment's monster
    this.phase = 'arrive';
    this.camLock = ex - W * 0.67;   // the monster SITS at 0.67 of the screen
    this.marks = {
      momX: this.camLock + W * 0.31,
      girlX: this.camLock + W * 0.31 - Math.min(W, H) * 0.075,
    };
    this.pointers.clear();
    this.applyInputs();
// Gentle reveal: the monster is simply sitting on the path ahead, the
// camera softly pans him to his mark, and the girl reacts the moment he
// comes into view. Fire-and-forget here, but encounter.run() AWAITS this
// before mom's intro — every TTS line begins with speechSynthesis.cancel(),
// so mom would otherwise cut her off mid-word.
    this.onArrive(this.encIndex);
    this.girlWow = voice.speak('native', LEVEL_1.linesNative.wow);
  }

  stepArrive(dt, W, H) {
    const g = this.girl;
    if (Math.abs(g.x - this.marks.girlX) > 3) {
      g.x = g.x + Math.sign(this.marks.girlX - g.x) * Math.min(WALK.autoSpeed * dt, Math.abs(this.marks.girlX - g.x));
      g.dir = 1; g.vx = WALK.autoSpeed;
    } else { g.vx = 0; }
    if (Math.abs(this.mom.x - this.marks.momX) > 3) {
      const step = Math.min(WALK.dashSpeed * dt, Math.abs(this.marks.momX - this.mom.x));
      this.mom.x += Math.sign(this.marks.momX - this.mom.x) * step;
      this.mom.dir = 1; this.mom.speed = WALK.dashSpeed;
      this.dustAcc += step;
      if (this.dustAcc > 90) {
        this.dustAcc = 0;
        fx.dust(this.mom.x - this.camX, H * GROUND_Y + PLANT_PX, 4);
      }
    } else { this.mom.speed = 0; }
    if (Math.abs(g.x - this.marks.girlX) <= 3 && Math.abs(this.mom.x - this.marks.momX) <= 3) {
      g.x = this.marks.girlX; this.mom.x = this.marks.momX; g.vx = 0;
      this.phase = 'frozen';
      this.onEncounter(this.encIndex);
    }
  }

  resumeAfterEncounter() {
    this.encIndex++; // opens the gate to the next stretch (or the finish)
    this.camLock = null;
    this.marks = null; // re-arm the NEXT encounter's trigger (checkZones gates on !marks)
    this.phase = 'walk';
    this.trail = [{ x: this.girl.x, y: this.girl.y, dir: this.girl.dir }];
    this.ui.stonesVisible = false; // the spoken phrase is done — stones go away
    voice.speak('native', LEVEL_1.linesNative.walkResume);
  }

  stepCamera(dt, W, H) {
    const target = this.camLock != null
      ? this.camLock
      : clamp(this.girl.x + this.girl.dir * WALK.lookAhead - W * 0.45, 0, Math.max(0, D.worldWidth - W));
    this.camX += (target - this.camX) * Math.min(1, dt * WALK.cameraSoftness);
  }

  // --- visuals for players.js (positions in SCREEN coords — camera applied
  // here; poses null = let players.js use its internal pose state, i.e. the
  // encounter's setPoses)
  actorVisual() {
    const g = this.girl;
    let girlPose, momPose;
    if (this.phase === 'done') { girlPose = 'happy'; momPose = 'happy'; }
    else if (this.phase === 'frozen') { girlPose = null; momPose = null; }
    else {
      girlPose = g.pickT > 0 ? 'pick' : g.holdT > 0 ? 'hold'
        : !g.onGround ? 'jump' : g.landT > 0 ? 'land'
        : Math.abs(g.vx) > 25 ? 'walk1' : 'idle';
      momPose = this.mom.speed > 25 ? 'walk1' : 'idle'; // mom never jumps (walks past the barriers)
    }
    return {
      momX: this.mom.x - this.camX, momDir: this.mom.dir, momAirY: this.mom.y, momPose,
      girlX: g.x - this.camX, girlDir: g.dir,
// on a barrier her feet land on the collision plane — the painted
// surface sags below it, so sink her onto the visible top at her own x
// (draw only; physics stay on the plane) — same measured-depth rule as
// the top gems: the pixels must touch her feet
      girlAirY: g.onProp
        ? g.y - surfacePad(g.onProp.kind, (g.x - g.onProp.x) / g.onProp.w + 0.5, g.onProp.h)
        : g.y,
      girlPose,
    };
  }

  // --- drawing
  drawWorld(ctx, W, H, t) {
    if (this.phase === 'idle') return;
    const groundY = H * GROUND_Y + PLANT_PX;

// barriers (logs / rocks / stone piles) — drawn BEHIND the gems and behind
// both players: mom AND the girl pass IN FRONT of them on the ground;
// their tops are landable platforms for reaching the gems
    for (const p of this.props) {
      const sx = p.x - this.camX;
      if (sx < -180 || sx > W + 180) continue;
      drawProp(ctx, p, sx, groundY);
    }

// stones — grounded, no bob. The grey mossy boulder (stones_1) is the
// base size; every other stone keeps its sheet-height ratio to it —
// crystals stand tall, pebbles stay small.
    const baseStoneH = art.image('stones', 0)?.height || 0;
    for (const s of this.stones) {
      if (s.taken) continue;
      const sx = s.x - this.camX;
      if (sx < -60 || sx > W + 60) continue;
      const sy = groundY - this.stoneY(s);
      // soft glow — the affordance for a kid who can't read
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 34);
      glow.addColorStop(0, 'rgba(255,235,170,.5)');
      glow.addColorStop(1, 'rgba(255,235,170,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI * 2); ctx.fill();
      const img = baseStoneH && art.image('stones', s.v);
      if (img) art.drawFrame(ctx, 'stones', s.v, sx, sy + 18, 36 * img.height / baseStoneH);
      else drawGemShape(ctx, sx, sy, 15, t + s.x);
    }

    // finish gate — two glowing poles and a sparkle arc
    const fx0 = D.finishX - this.camX;
    if (fx0 > -120 && fx0 < W + 120 && !this.finished) {
      ctx.save();
      for (const px of [fx0 - 60, fx0 + 60]) {
        const grad = ctx.createLinearGradient(px, groundY - 190, px, groundY);
        grad.addColorStop(0, 'rgba(255,209,102,0)');
        grad.addColorStop(0.5, 'rgba(255,209,102,.85)');
        grad.addColorStop(1, 'rgba(255,209,102,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px - 7, groundY - 190, 14, 190);
      }
      ctx.fillStyle = 'rgba(255,235,170,.8)';
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        const px = fx0 + Math.cos(a) * 60;
        const py = groundY - 190 + Math.sin(a) * 46 + Math.sin(t * 3 + i) * 3;
        ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawUI(ctx, W, H, t) {
    if (this.phase !== 'walk') return;
// no jump button here anymore — jump is Space / ⬆ / W (input.js). Drawn
// controls: just the start chevrons until the first move: pulsing "go
// right" chevrons (audio line covers the rest)
    if (!this.moved) {
      const p = (t * 0.9) % 1;
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const a = 0.15 + 0.55 * Math.max(0, 1 - Math.abs((p * 1.5 - i * 0.35) % 1.5 - 0.25) * 2);
        ctx.globalAlpha = a;
        ctx.strokeStyle = PAL.white; ctx.lineWidth = 9; ctx.lineCap = 'round';
        const x0 = W * 0.78 + i * 34, y0 = H * 0.52;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - 24); ctx.lineTo(x0 + 22, y0); ctx.lineTo(x0, y0 + 24);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
