// encounter.js — the heart of the game: the word-by-word befriending loop.
// Monster appears → mom shields → phrase word-by-word → kid repeats each word
// (mic; tap fallback after 2 misses) → monster transforms per word → says his
// name ("I'm Boo!" / "I'm Chick!") → friend (+1 on the monsters counter) →
// praise → play again.
import { voice } from './voice.js';
import { speech } from './speech.js';
import { fx } from './fx.js';
import { delay } from './util.js';
import { LEVEL_1 } from '../data/levels.js';

// the breathing beat between the girl's «Ой» and mom's answer — the calm
// moment before mom starts talking.
const WOW_TO_INTRO_PAUSE_MS = 700;

export class Encounter {
// lines: which lines this instance speaks — { intro, praise, reply } ids
// (per-instance: monster 2 repeats the mechanic with intro2/praise2 and
// answers "I'm Chick!"; wow/miss/tap-stone/whole stay shared LEVEL_1 ids).
  constructor({ monster, players, ui, walk, lines }) {
    this.monster = monster;
    this.players = players;
    this.ui = ui;
    this.walk = walk;   // may be undefined in theory — praise guards for it
    this.lines = lines || {
      intro: LEVEL_1.linesNative.intro, praise: LEVEL_1.linesNative.praise,
      reply: LEVEL_1.booReply,
    };
    this.runId = 0;
    this.reset();
  }

  // gems:false = don't zero the shared stones counter (the SECOND instance's
  // play-again reset — the first one already zeroed it). The monsters counter
  // is NOT touched here — only playAgain (main.js) zeroes it.
  reset({ gems = true } = {}) {
    this.runId++;
    this.phase = 'start';
    this.wordIndex = 0;
    this.attempts = 0;
    this.monsterStage = 0;
    this.micError = null;
    this.tapReadyFlag = false;
    if (this._tapResolve) { const r = this._tapResolve; this._tapResolve = null; r(); }
    this.monster.reset();
    this.monster.hide();
    this.players.setPoses('idle', 'idle');
    if (gems) this.ui.setGems(0);
    this.ui.setStones(LEVEL_1.words);
    this.ui.stonesVisible = false; // word stones exist only inside the encounter
    this.ui.micState('off');
  }

  snapshot() {
    return {
      phase: this.phase,
      wordIndex: this.wordIndex,
      attempts: this.attempts,
      monsterStage: this.monsterStage,
      gems: this.ui.gems,
      friends: this.ui.monsters,
      tapReady: this.tapReadyFlag,
      words: LEVEL_1.words.map(w => w.text),
      stoneStates: this.ui.stoneStates.slice(), // each lesson starts fresh
      micError: this.micError,
    };
  }

  async run() {
    const alive = () => run === this.runId;
    const run = ++this.runId;

    this.ui.hideOverlays();
    this.ui.stonesVisible = true;
// Fresh word stones on EVERY run: the stones are SHARED ui state and
// instance 1 leaves them all 'done' — monster 2's lesson must not inherit
// his greens (reset() runs only at construction/play-again, never between
// the two encounters of one walk).
    this.ui.setStones(LEVEL_1.words);
    this.phase = 'appear';
    // NOTE: no monster.reset() here — it would null worldX (set by main at the
    // trigger) and the monster would fall back to a FIXED SCREEN position,
    // i.e. travel with the camera after the walk resumes. reset() runs in
    // encounter.reset() (constructor + play-again), which is always called
    // before run().
// Gentle appearance: the monster was already revealed SITTING at the walk
// trigger (walk.js onArrive) and the girl said her "Wow!" there — no growl,
// no sky-drop, no screen shake. appear() just makes sure he sits visible
// (covers walk-less runs).
    await this.monster.appear();
    if (!alive()) return;
    this.players.setPoses('shield', 'peek');
    // The girl's reaction fired at the walk trigger — she gets to FINISH it
    // before mom speaks (voice.tts cancels whatever is playing when the next
    // line starts). speak() never rejects, so this await is safe to leave
    // fire-and-forget on the walk side.
    if (this.walk && this.walk.girlWow) await this.walk.girlWow;
    if (!alive()) return;
    await delay(WOW_TO_INTRO_PAUSE_MS); // let the moment breathe
    if (!alive()) return;

    this.phase = 'intro';
    await voice.speak('native', this.lines.intro);
    if (!alive()) return;

    for (let i = 0; i < LEVEL_1.words.length; i++) {
      this.wordIndex = i;
      this.attempts = 0;
      this.tapReadyFlag = false;
      this.phase = 'word-mom';
      this.ui.setStoneState(i, 'active');
      await voice.speak('target', LEVEL_1.words[i].line);
      if (!alive()) return;

      await this.listenCycle(i, alive);
      if (!alive()) return;

      this.phase = 'word-success';
      this.ui.setStoneState(i, 'done');
      voice.sfx('chime');
      const sc = this.ui.stoneCenter(i);
      fx.burst(sc.x, sc.y, { color: '#ffe08a', n: 22, speed: 260 });
      this.monsterStage = i + 1;
      voice.sfx('magic'); // the transformation itself — sparkle, not noise
      await this.monster.transformTo(this.monsterStage);
      if (!alive()) return;
    }

    this.phase = 'phrase-complete';
    await delay(450);
    if (!alive()) return;
    await voice.speak('target', LEVEL_1.wholeLine);
    if (!alive()) return;

    this.phase = 'boo-speaks';
    this.monster.celebrate();
    voice.sfx('pop');
    await voice.speak('target', this.lines.reply); // per-instance name line — Boo / Chick
    if (!alive()) return;

    this.phase = 'friend';
// The friend beat: progress measures STONES and MONSTERS separately — the
// monster gives friendship, not gems (no gem gift flight; mom's praise
// doesn't mention stones). His counter pops the moment he's befriended.
    this.ui.addMonster();
    const cp = this.ui.monsterCounterPos();
    fx.burst(cp.x, cp.y, { color: '#ffe08a', n: 16, speed: 230 });
    await delay(600); // let the +1 pop read before mom's praise
    if (!alive()) return;

    this.phase = 'praise';
// The praise visual: the girl is already slightly ahead, both stand calm
// facing the friend — the picture the walk resumes into. Their talk-pose
// art is left-facing and is flipped by players.js when used.
    if (this.walk) this.walk.girlComeForward(120);
    this.players.setPoses('idle', 'idle');
    voice.sfx('fanfare');
    fx.confetti(window.innerWidth / 2, window.innerHeight * 0.3);
    await voice.speak('native', this.lines.praise);
    if (!alive()) return;
    // The encounter ends here — main resumes the walk (the level's own
    // finish gate shows the end overlay); run() resolving is the hand-off.
  }

  async listenCycle(i, alive) {
    while (alive()) {
      this.phase = 'listen';
      this.ui.micState('listen');
      const res = await speech.listenFor(LEVEL_1.words[i]);
      if (!alive()) return;
      if (res.matched) { this.ui.micState('off'); return; }
      if (res.error === 'nomic' || res.error === 'unsupported') { this.micError = res.error; break; }
      this.attempts++;
      this.ui.micState('miss');
      voice.sfx('miss');
      if (this.attempts >= 2) break;
      await voice.speak('native', LEVEL_1.linesNative.miss);
      if (!alive()) return;
      await voice.speak('target', LEVEL_1.words[i].line);
      if (!alive()) return;
    }
    if (!alive()) return;
    // tap fallback — no child ever gets stuck
    this.phase = 'tap-ready';
    this.tapReadyFlag = true;
    this.ui.micState('ready');
    this.ui.setStoneState(i, 'tap-ready');
    const tapDone = this.waitForTap(i); // arm before the hint line — eager kids tap immediately
    await voice.speak('native', LEVEL_1.linesNative.tapHint);
    if (!alive()) return;
    await tapDone;
  }

  waitForTap(i) {
    return new Promise(res => { this._tapResolve = res; });
  }

  onStoneTap(i) {
    if (this.phase !== 'tap-ready' || i !== this.wordIndex || !this._tapResolve) return;
    const r = this._tapResolve;
    this._tapResolve = null;
    this.ui.micState('off');
    r();
  }
}
