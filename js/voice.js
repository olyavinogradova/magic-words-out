// voice.js — language packs: recorded audio files take priority over TTS placeholders.
// A pack is a folder with manifest.json; swapping languages = swapping folders.
import { TEST } from './util.js';
import { NATIVE_DEFAULT, TARGET_DEFAULT } from '../data/fallback-lines.js';

const PACK_URLS = {
  native: 'assets/audio/native-ru/manifest.json',
  target: 'assets/audio/target-en/manifest.json',
};
const PACK_DEFAULTS = { native: NATIVE_DEFAULT, target: TARGET_DEFAULT };

const wait = ms => new Promise(r => setTimeout(r, ms));

// Google voices are NETWORK voices — nicer when they work, but slow or
// hanging ones read as a long pause before mom speaks. false = instant
// local system voices first, Google as fallback.
const PREFER_GOOGLE_VOICES = false;

export const voice = {
  packs: {},
  audioCtx: null,
  buffers: new Map(),
  voices: [],
  ttsDead: false, // set when the engine stops STARTING lines (wedge / no voices)
  onTtsDead: null,    // main.js shows the parent hint when this fires
  _voicesReadyP: null,
  _deadStreak: 0,     // consecutive lines that never started
  _everStarted: false,
  _lastProbe: null,   // Date.now() of the last recovery attempt while muted

  async init() {
    await Promise.all(Object.keys(PACK_URLS).map(async kind => {
      try {
        const r = await fetch(PACK_URLS[kind], { cache: 'no-cache' });
        if (!r.ok) throw new Error(String(r.status));
        this.packs[kind] = await r.json();
      } catch {
        // file:// or missing folder — embedded copy keeps the game playable
        this.packs[kind] = PACK_DEFAULTS[kind];
      }
    }));
    if (!TEST && 'speechSynthesis' in window) {
      const refresh = () => { this.voices = speechSynthesis.getVoices(); };
      refresh();
      speechSynthesis.onvoiceschanged = refresh;
      setTimeout(refresh, 300); setTimeout(refresh, 1200); setTimeout(refresh, 2500);
// Leaving the engine speaking into a closing page can wedge TTS for every
// FUTURE session. Cancel on real exits, but ONLY when something is actually
// playing — a bare cancel() during teardown correlated with the wedge too
// (quit with "x" while idle → next launch silent). beforeunload fires
// while the page can still deliver the command; pagehide is the
// last-chance sweep.
      const quietTTS = () => {
        try {
          if (speechSynthesis.speaking || speechSynthesis.pending) {
// resume BEFORE cancel: cancel-while-paused at teardown is the likely
// poison that silences the NEXT tab
            speechSynthesis.resume();
            speechSynthesis.cancel();
          }
        } catch {}
      };
      window.addEventListener('beforeunload', quietTTS);
      window.addEventListener('pagehide', quietTTS);
    }
  },

  pack(kind) { return this.packs[kind] || PACK_DEFAULTS[kind]; },
  line(kind, id) { return this.pack(kind).lines[id] || PACK_DEFAULTS[kind].lines[id]; },
  voiceParams(kind, speaker) {
    return this.pack(kind).voices?.[speaker] || PACK_DEFAULTS[kind].voices?.[speaker] || { pitch: 1, rate: 0.9 };
  },
  packDir(kind) { return PACK_URLS[kind].slice(0, PACK_URLS[kind].lastIndexOf('/')); },

  unlock() { // must run inside a user gesture: opens the audio context, warms up TTS
    if (this.audioCtx) { this.audioCtx.resume(); return; }
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.audioCtx.resume();
    } catch {}
    // Warm the TTS engine without a dummy utterance: the old silent ' '
    // dummy was cancelled by the first real line milliseconds later —
    // a cancelled mid-init utterance is a prime wedge suspect.
    try { speechSynthesis.resume(); speechSynthesis.getVoices(); } catch {}
  },

  async speak(kind, lineId) {
    const line = this.line(kind, lineId);
    if (!line) { console.warn('voice: missing line', kind, lineId); return; }
    if (line.audio) {
      try { await this.playFile(`${this.packDir(kind)}/${line.audio}`); return; } catch { /* fall through to TTS */ }
    }
    const p = this.voiceParams(kind, line.speaker);
    await this.tts(line.text, this.pack(kind).lang, p);
  },

  tts(text, lang, { pitch = 1, rate = 0.9, male = false } = {}) {
    if (TEST) return wait(220); // deterministic and silent under automation
    if (this.ttsDead) {
      const now = Date.now();
// The mute is not forever: probe the engine with a real line every ~8 s —
// a transient wedge heals by itself and mom's voice returns mid-walk.
      if (this._lastProbe === null || now - this._lastProbe > 8000) {
        this._lastProbe = now;
        return this._speakSmart(text, lang, { pitch, rate, male }, 0);
      }
      return wait(350);
    }
    return this._speakSmart(text, lang, { pitch, rate, male }, 0);
  },

  // Chrome loads its voice list asynchronously: on a cold start pickVoice()
  // can be empty and the first line is slow to start — that is NOT a dead
  // engine, so wait a little for voices before judging.
  voicesReady() {
    if (this.voices.length) return Promise.resolve();
    if (this._voicesReadyP) return this._voicesReadyP;
    this._voicesReadyP = new Promise(res => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        // Short wait: if the list is still missing we speak with just u.lang
        // and Chrome picks a matching voice itself — a 3 s wait read as a
// big pause before mom's first line.
        if (this.voices.length || Date.now() - t0 > 800) { clearInterval(iv); res(); }
      }, 100);
    });
    return this._voicesReadyP;
  },

  async _speakSmart(text, lang, params, attemptNo) {
    await this.voicesReady();
    if (this.voices.length === 0) {
// No voice list at all after the wait (a wedge variant: getVoices()
// returns 0) — nothing can ever speak; tell the parent.
      this._markTtsDead();
      return;
    }
    const v = attemptNo === 0 ? this.pickVoice(lang, params.male)
                              : this.pickVoice(lang, params.male, true);
// The FIRST judged line of a session gets a much longer window: Chrome's
// very first synthesis after a cold start can take seconds. Later lines
// keep the normal cap — a truly dead engine must not eat the whole walk
// in long waits.
    const firstLine = attemptNo === 0 && !this._everStarted && this._deadStreak === 0;
    const capMs = attemptNo === 0 ? (firstLine ? 5000 : 0) : 1500;
    const { started } = await this._speakOnce(text, lang, v, params, capMs);
    if (started) {
      this._deadStreak = 0;
      this._everStarted = true;
      if (this.ttsDead) { // a probe succeeded — voices are back
        this.ttsDead = false;
        this._lastProbe = null;
        if (this.onTtsRecovered) this.onTtsRecovered();
      }
      return;
    }
    // The line never STARTED: one fresh retry — a local system voice when we
    // can get one; even the SAME voice as a new utterance often kicks a
    // stalling engine.
    if (attemptNo === 0) { await this._speakSmart(text, lang, params, 1); return; }
// A slow first synthesis can miss even a generous window, so muting
// needs a STREAK of dead lines — one bad line must not mute the whole
// session.
    this._deadStreak++;
    if (this._deadStreak >= 2) this._markTtsDead();
  },

  _markTtsDead() {
    if (this.ttsDead) return;
    this.ttsDead = true;
    if (this.onTtsDead) this.onTtsDead();
  },

  _speakOnce(text, lang, voiceObj, { pitch = 1, rate = 0.9 } = {}, capMs = 0) {
    return new Promise(res => {
      let settled = false, started = false, cap = null;
      const finish = wasStarted => {
        if (settled) return;
        settled = true;
        if (cap) clearTimeout(cap);
        res({ started: wasStarted });
      };
      const u = new SpeechSynthesisUtterance(text);
      if (voiceObj) { u.voice = voiceObj; u.lang = voiceObj.lang; } else u.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
      u.pitch = pitch; u.rate = rate;
      u.onstart = () => { started = true; };
      u.onend = () => finish(true);
      u.onerror = () => finish(started);
      try {
        // resume() unwedges an engine left paused/stuck by an interrupted
        // line; cancel only when something is actually playing — a bare
        // cancel() on an idle engine correlated with the browser-wide wedge
        if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
        speechSynthesis.resume();
        speechSynthesis.speak(u);
      } catch { finish(false); return; }
      // "Chrome sometimes drops onend" cap; a never-starting line resolves here
      cap = setTimeout(() => finish(started), Math.max(capMs, 1500 + text.length * 90));
    });
  },

  pickVoice(lang, male = false, localOnly = false) {
    const want = lang === 'ru' ? 'ru' : 'en';
    let vs = this.voices.filter(v => (v.lang || '').toLowerCase().startsWith(want));
    if (localOnly) vs = vs.filter(v => !/Google/i.test(v.name)); // system voices only
    const MALE_NAME = /male|daniel|alex|aaron|albert|fred|david|george|james|arthur|yuri|gordon|junior|ralph|tom|oliver|eddy|reed|rocko|nathan|hugo|bruce|rishi/i;
    const FEMALE_NAME = /samantha|karen|moira|tessa|fiona|susan|zoe|victoria|vicki|allison|ava|serena|kate|stephanie|catherine|cathy|joana|milena|anna|amelie|audrey|jane|nancy|luciana|paulina|zosia|laura|sara|ellen|katya|yelena|alena|agnes|kathy|female/i;
    if (male) {
      // manifest speakers may ask for a man's voice (the monster says "I'm Boo")
      const m = vs.find(v => MALE_NAME.test(v.name));
      if (m) return m;
    } else {
// mom and the daughter must never sound like a man — prefer a known
// female voice, else avoid known males
      const fem = vs.filter(v => FEMALE_NAME.test(v.name));
      if (fem.length) vs = fem;
      else {
        const notMale = vs.filter(v => !MALE_NAME.test(v.name));
        if (notMale.length) vs = notMale;
      }
    }
    if (localOnly) return vs[0] || null; // any system voice beats silence
    const google = vs.find(v => /Google/i.test(v.name));
    const sys = vs.find(v => !/Google/i.test(v.name));
    return PREFER_GOOGLE_VOICES ? (google || sys || null) : (sys || google || null);
  },

  async playFile(url) {
    if (!this.audioCtx) throw new Error('audio not unlocked');
    let buf = this.buffers.get(url);
    if (!buf) {
      const data = await (await fetch(url)).arrayBuffer();
      buf = await this.audioCtx.decodeAudioData(data);
      this.buffers.set(url, buf);
    }
    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.audioCtx.destination);
    return new Promise(res => {
      src.onended = res;
      src.start();
      setTimeout(res, (buf.duration + 1) * 1000);
    });
  },

  // synthesized SFX — no audio files needed
  sfx(name) {
    if (TEST || !this.audioCtx) return;
    const ctx = this.audioCtx, t0 = ctx.currentTime;
    const tone = (f, t, dur, type = 'sine', vol = 0.22) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    };
    switch (name) {
      case 'chime': tone(660, t0, 0.25); tone(880, t0 + 0.09, 0.3); tone(1320, t0 + 0.18, 0.4, 'sine', 0.15); break;
      case 'miss': tone(220, t0, 0.25, 'triangle'); tone(180, t0 + 0.12, 0.3, 'triangle', 0.15); break;
      case 'gem': tone(1568, t0, 0.18, 'sine', 0.18); tone(2093, t0 + 0.07, 0.25, 'sine', 0.13); break;
      case 'pop': tone(880, t0, 0.08, 'sine', 0.2); break;
      case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => tone(f, t0 + i * 0.12, 0.35, 'triangle')); break;
      case 'magic': {
// the monster's transformation: rising bell arpeggio + a soft airy
// shimmer sweeping up — fairy-dust magic, not a noise whoosh. Sits nicely
// on top of the word-success chime.
        const notes = [1047, 1319, 1568, 2093]; // C6 · E6 · G6 · C7
        notes.forEach((freq, i) => {
          const t = t0 + i * 0.07;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, t);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.12, t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
          o.connect(g); g.connect(ctx.destination);
          o.start(t); o.stop(t + 0.55);
          // quiet high partial — the "bell" in the tone
          const o2 = ctx.createOscillator(), g2 = ctx.createGain();
          o2.type = 'sine';
          o2.frequency.setValueAtTime(freq * 2.01, t);
          g2.gain.setValueAtTime(0, t);
          g2.gain.linearRampToValueAtTime(0.04, t + 0.01);
          g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          o2.connect(g2); g2.connect(ctx.destination);
          o2.start(t); o2.stop(t + 0.35);
        });
        // fairy dust: soft noise through a bandpass sweeping up
        const dur = 0.6;
        const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (i / d.length);
        const s = ctx.createBufferSource(); s.buffer = b;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 6;
        f.frequency.setValueAtTime(1200, t0);
        f.frequency.exponentialRampToValueAtTime(5200, t0 + dur);
        const g3 = ctx.createGain(); g3.gain.value = 0.08;
        s.connect(f); f.connect(g3); g3.connect(ctx.destination);
        s.start(t0);
        break;
      }
    }
  },
};
