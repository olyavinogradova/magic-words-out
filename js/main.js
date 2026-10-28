// main.js — bootstrap: canvas, game loop, walk↔encounter wiring, and window.boo.
// Flow: start → walk (girl leads, mom follows) → encounter trigger (mom
// dashes forward to shield) → the encounter → walk resumes → finish gate →
// "play again" resets the whole level.
import { updateTweens, TEST, clamp, GROUND_Y, PLANT_PX } from './util.js';
import { view, layoutViewport } from './view.js';
import { voice } from './voice.js';
import { speech, matchWord } from './speech.js';
import { art } from './art.js';
import { fx } from './fx.js';
import { World } from './world.js';
import { Players } from './players.js';
import { Monster } from './monster.js';
import { UI } from './ui.js';
import { Walk } from './walk.js';
import { initInput } from './input.js';
import { initControls } from './controls.js';
import { Encounter } from './encounter.js';
import { LEVEL_1 } from '../data/levels.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, innerW = 0, innerH = 0;

// ?vw=&vh= forces a viewport (device-framing preview on desktop)
const FORCE_W = +(new URLSearchParams(location.search).get('vw')) || 0;
const FORCE_H = +(new URLSearchParams(location.search).get('vh')) || 0;

function resize() {
  innerW = FORCE_W || window.innerWidth;
  innerH = FORCE_H || window.innerHeight;
  layoutViewport(stage, canvas, innerW, innerH);
  W = view.W; H = view.H; // VIRTUAL stage size — everything draws in stage px
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr * view.s);
  canvas.height = Math.round(H * dpr * view.s);
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, 0, 0);
  art.clearBakes(); // baked frames depend on viewport-scaled heights
}
window.addEventListener('resize', resize);
resize();

// scene — walk is created before the encounter so the encounter can ask the
// girl to step forward during the praise
const world = new World();
const players = new Players();
const monster = new Monster();
const monster2 = new Monster({ sheet: 'monster2' });
const ui = new UI();
const ENC = LEVEL_1.walk.encounters;
const walk = new Walk({
  ui,
  onArrive: i => { // THAT monster is revealed SITTING at his spot — worldX first (invariant)
    const m = i === 0 ? monster : monster2;
    m.worldX = ENC[i].x;
    m.reveal();
  },
  onEncounter: startEncounter,
  onFinish: finishLevel,
});
// Two encounters, same mechanics: mom's intro/praise lines and the monster's
// name reply differ per instance (ids come from data/levels.js encounters[]
// — monster 2 is Chick).
const encounter = new Encounter({
  monster, players, ui, walk,
  lines: { intro: ENC[0].intro, praise: ENC[0].praise, reply: ENC[0].reply },
});
const encounter2 = new Encounter({
  monster: monster2, players, ui, walk,
  lines: { intro: ENC[1].intro, praise: ENC[1].praise, reply: ENC[1].reply },
});
// The one currently running (routes taps, keys and the test API). Draw order:
// monster2 draws BEFORE the players (the girl walks PAST him in front;
// during his encounter the family stands left of him so the order never
// overlaps); monster1 keeps drawing AFTER the players (the encounter focal).
let activeEncounter = encounter;

let ended = false; // the finish overlay is up

async function startEncounter(i) { // walk.js fires this when mom reaches the shield mark
  const m = i === 0 ? monster : monster2;
  activeEncounter = i === 0 ? encounter : encounter2;
  m.worldX = ENC[i].x;
  await activeEncounter.run();
  walk.resumeAfterEncounter();
}

async function finishLevel() { // walk.js fires this at the finish gate
  ended = true;
  players.setPoses('happy', 'happy');
  voice.sfx('fanfare');
  fx.confetti(W / 2, H * 0.3);
  await voice.speak('native', LEVEL_1.linesNative.finish);
  ui.showEnd(playAgain, 'Ура! Мы прошли весь лес!');
}

function playAgain() {
  ended = false;
  encounter.reset();               // zeroes the shared stones counter
  encounter2.reset({ gems: false }); // second instance must NOT re-zero it
  walk.reset();
  ui.setGems(0);
  ui.setMonsters(0);               // friends are progress too — the replay restarts them
  fx.clear();
  walk.begin();
}

// wiring — taps/keys always go to the encounter that is actually running;
// on the start screen Space/Enter press the cover's cloud button — startCb
// is set exactly while that screen is up
ui.stoneTapHandler = i => activeEncounter.onStoneTap(i);
ui.onPrimary = (code) => {
  if (ui.startCb) {
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') ui.pressCloud();
    return;
  }
  if (activeEncounter.phase === 'tap-ready') activeEncounter.onStoneTap(activeEncounter.wordIndex);
};
ui.onSecret = () => activeEncounter.devAccept();
initInput(canvas, ui, walk);

const voiceReady = voice.init();
art.load();
const updateControls = initControls(walk); // phone buttons — after art.load(), the art swap keys on it

function startGame() {
  started = true; // draw the players again + lift the scene blur
  canvas.classList.remove('blur');
  voice.unlock();
  voiceReady.then(() => walk.begin());
}

ui.showStart(startGame);

// Pre-start: the scene stays a blurred backdrop behind the cover pop-up and
// mom + girl are NOT drawn until «Начать» — the cover is the whole first
// impression.
let started = false;
canvas.classList.add('blur');

// loop — tick(now) holds the whole frame body so the test API can step it
// (boo.step) without depending on the browser scheduling real frames
let last = performance.now();
function tick(now) {
  const dt = clamp(now - last, 0, 50);
  last = now;
  const t = now / 1000;

// self-heal viewport capture: some webviews settle their size after load
// without firing a resize event — W drives the encounter trigger, so a
// stale value misplaces it
  if ((FORCE_W || window.innerWidth) !== innerW ||
      (FORCE_H || window.innerHeight) !== innerH) resize();

  updateTweens(dt);
  ui.update(dt);
  walk.update(dt, W, H);
  updateControls(walk.phase);
  fx.update(dt);

  ctx.save();
  world.draw(ctx, W, H, t, walk.camX);
  walk.drawWorld(ctx, W, H, t);
  // monster2: hidden until HIS walk trigger (revealed by onArrive(1)), passes
  // behind the family after befriending — drawn before the players (see top)
  if (monster2.worldX != null) {
    monster2.draw(ctx, monster2.worldX - walk.camX, H * GROUND_Y + PLANT_PX, t, W, H);
  }
// pre-start: only the (blurred) landscape — no players, no HUD
  if (started) {
    players.draw(ctx, W, H, t, walk.active() ? walk.actorVisual() : null);
    monster.draw(ctx, monster.worldX != null ? monster.worldX - walk.camX : W * 0.67,
      H * GROUND_Y + PLANT_PX, t, W, H);
    ui.draw(ctx, W, H);
    walk.drawUI(ctx, W, H, t);
  }
  fx.draw(ctx);
  ctx.restore();
}
function frame(now) {
  tick(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test API — development/automation helper; harmless in normal play
window.boo = {
  testMode: TEST,
  pressStart() {
    const btn = document.getElementById('startBtn');
    if (walk.phase === 'idle' && encounter.phase === 'start' && encounter2.phase === 'start' && btn) btn.click();
  },
  state() {
    const e = activeEncounter.snapshot();
    const w = walk.snapshot();
    let phase;
    if (walk.phase === 'frozen') phase = e.phase;
    else if (ended) phase = 'end';
    else if (walk.phase === 'done') phase = 'finish';
    else phase = w.phase === 'idle' ? 'start' : w.phase;
    return {
      phase,
      enc: w.enc, // how many encounters are done (0/1/2) — which monster is next
      wordIndex: e.wordIndex, attempts: e.attempts, monsterStage: e.monsterStage,
      gems: e.gems, friends: e.friends, tapReady: e.tapReady, words: e.words, stoneStates: e.stoneStates, micError: e.micError,
      x: w.x, momX: w.momX, momDir: w.momDir, camX: w.camX, collected: w.collected, air: w.air,
      stonesLeft: w.stonesLeft, stonesTaken: w.stonesTaken, airY: w.airY,
      onProp: w.onProp,
    };
  },
  hear(text) { return speech.inject(text); },
  tapWord(i) { return activeEncounter.onStoneTap(i); },
  match(text, i) { return matchWord(LEVEL_1.words[i], text); },
  hold(dir) { walk.setKey(dir === 'left' ? 'left' : 'right', true); },
  release() { walk.setKey('left', false); walk.setKey('right', false); walk.pointers.clear(); walk.applyInputs(); },
  jump() { walk.jumpPulse = true; },
  // advance the game by n synthetic frames (~16.7 ms each) — the test drive
  // runs on this instead of real time, so a suspended browser pane cannot
  // stall it; wall-clock timers (test-mode TTS lines) degrade it gracefully
  step(n = 1, dtMs = 16.7) {
    for (let i = 0; i < n; i++) tick(last + Math.min(50, dtMs));
    return this.state();
  },
};

window.addEventListener('error', e => {
  const el = document.getElementById('err');
  if (el) { el.style.display = 'block'; el.textContent = e.message; }
});

// Voices dead (wedged browser speech engine): the game keeps flowing
// silently; tell the PARENT how to recover (the kid cannot read).
voice.onTtsDead = () => {
  const el = document.getElementById('err');
  if (el) { el.style.display = 'block'; el.textContent = 'Голос не завёлся. Полностью закройте Chrome (⌘Q) и откройте игру заново.'; }
};
// The engine answered a recovery probe — remove our hint (but never a real error).
voice.onTtsRecovered = () => {
  const el = document.getElementById('err');
  if (el && el.textContent.indexOf('Голос не завёлся') === 0) el.style.display = '';
};
