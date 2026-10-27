// data/levels.js — level content, purely data-driven.
// Line ids reference the language packs; adding a language = new pack folders.
export const LEVEL_1 = {
  id: 'whats-your-name',
  words: [
    { line: 'w1', text: "What's", accept: ["what's", 'whats', 'what is', 'what', 'watts', 'wat'] },
    { line: 'w2', text: 'your', accept: ['yor', 'you', 'yur', 'yours', 'ure'] },
    { line: 'w3', text: 'name', accept: ['name', 'nem', 'neim', 'naem', 'may'] },
  ],
  wholeLine: 'whole',
  booReply: 'boo-reply',     // monster 1 answers with his name — "I'm Boo!"
  chickReply: 'chick-reply', // monster 2's name — "I'm Chick!"
    // Walking world: the daughter leads (player-controlled), mom follows.
    // Stone t = tier: t1 lies on the ground, t2 lies ON a barrier from walk.props
    // (the stone's `prop` reference gives its height — js/walk.js stoneY()).
// The stretch after the monster got BARRIERS the girl jumps onto — mom
// passes them on the ground with no extra movements (she never jumps).
// Gem total: 5 ground + 12 barrier (2 per gem barrier) = 17 at finish (the
// monster gem gifts are GONE — progress measures stones and monsters
// separately).
  walk: {
    worldWidth: 6200,
    startX: 220,     // daughter's spawn x (mom trails ~115 px behind)
// TWO encounters, the SAME mechanics twice — monster1 blocks the path, then
// monster2 — mom's intro/praise lines differ per instance (ids in
// linesNative; intro2/praise2 live in both packs + the fallback), and so
// does the monster's NAME line (Boo vs Chick, target pack).
    // monster2's trigger (x − max(560, 0.36W+…) ≈ 3590 on a 1280 pane) clears
    // the stump's ×1.5 right edge (3450 + 114 = 3564) — the girl falls off the
    // rim to the ground before the camera can lock (walk.js also gates the
    // trigger on girl.onGround).
    encounters: [
      { x: 1700, intro: 'intro',   praise: 'praise',   reply: 'boo-reply'   },
      { x: 4200, intro: 'intro2',  praise: 'praise2',  reply: 'chick-reply' },
    ],
    finishX: 5700,    // sparkling gate that ends the level
// Barriers — landable platforms with gems on top. They block NOBODY: the
// girl passes them on the ground in front like mom (walk.js — the path is
// walkable without collecting the gems); jumping is for reaching the tops.
// kind: 'log' | 'rock' | 'stump' | 'pillar' | 'cliff' (js/props.js); widths
// keep each art frame's aspect (drawFrame scales by h), tops are measured
// per-column (props.js surfacePad) so feet and gems sink onto the painted
// surface.
// Height audit (jump apex = 950²/(2·2500) = 180.5 px): log 108 ✓ (72 px
// margin), log 138 ✓ (42), stump 132 ✓ (48); rock 165 was 15 px under the
// apex — a 0.22 s timing window, too tight for a 5–6yo. The LOW STEP LOG
// (x2700 h84) right before it fixes the climb: 84 → 165, two easy hops; a
// straight-up jump in front of the rock (apex 180.5) also lands on it. A
// PLAYGROUND LOG before the monster (x900, no gems): the kid meets a
// jumpable barrier early.
    //
// THE CASCADE AFTER MONSTER 2: a HIGH barrier is reachable only from the
// top of a low one — log 138 (the usual height, jumpable from the ground)
// → pillar 250 (138 + 180.5 = 318.5 ≥ 250 ✓ but the ground apex 180.5 <
// 250 ✗ — the log is REQUIRED) → cliff 380 (from the log top 318.5 < 380
// ✗ — the PILLAR is required; pillar→cliff climb = 130, the same
// difficulty as the stump's 132).
    props: [
      { x: 900,  kind: 'log',    w: 225, h: 108, gems: 0 },
      { x: 2450, kind: 'log',    w: 287, h: 138, gems: 2 },
      { x: 2700, kind: 'log',    w: 175, h: 84,  gems: 0 }, // the step up to the rock
      { x: 2950, kind: 'rock',   w: 222, h: 165, gems: 2 },
      { x: 3450, kind: 'stump',  w: 228, h: 132, gems: 2 },
      // the cascade: log → pillar → cliff, ~55 px gaps between rims (a
      // standstill jump from a rim lands ~115 px forward — inside each top)
      { x: 4700, kind: 'log',    w: 287, h: 138, gems: 2 },
      { x: 4990, kind: 'pillar', w: 181, h: 250, gems: 2 },
      { x: 5290, kind: 'cliff',  w: 310, h: 380, gems: 2 },
    ],
    stones: [
      { x: 400, t: 1 }, { x: 520, t: 1 }, { x: 640, t: 1 }, { x: 760, t: 1 },
      { x: 2150, t: 1 }, // welcome-back freebie right after the monster
      // +2 gems per barrier above are appended in walk.reset() (t2, on top)
    ],
  },
  linesNative: {
    walkIntro: 'walk-intro',
    walkResume: 'walk-resume',
    finish: 'finish',
    wow: 'wow', // the girl reacts to first seeing the monster — wonder, not fear
    intro: 'intro',
    intro2: 'intro2',   // monster2's encounter: same loop, mom's lines differ
    miss: 'miss',
    tapHint: 'tap-stone',
    praise: 'praise',
    praise2: 'praise2',
  },
};
