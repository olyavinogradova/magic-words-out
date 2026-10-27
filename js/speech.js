// speech.js — kid speech recognition with generous fuzzy matching.
// The child speaks the target-language word; Chrome's Web Speech API hears it.
// Two generous layers (the game encourages, it never grades pronunciation):
//   letters — exact / bigram / prefix / Levenshtein(0.34 of length);
//   sound   — soundKey() skeletons compared the same way ("euro" ≈ "your":
//             3 letter edits apart, 1 sound-class edit apart).
// Interim hypotheses stream in while the child speaks; a win held by two
// consecutive interims resolves immediately, BEFORE Chrome's end-of-speech
// silence window: correct answers must not feel slow —
// misses still wait for the final transcript, which proves more).
// In TEST mode no microphone is touched: boo.hear(text) injects what "was said".
import { TEST } from './util.js';

function norm(s) {
  return String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-zа-яё ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// --- sound-key encoder --------------------------------------------------------
// Letter → sound class, adjacent runs collapsed. Vowels merge (@), the
// voiced/unvoiced pairs merge (b/p, d/t, g/k, f/v/w, s/z), silent h drops.
// The point is not phonetic accuracy — it is that a foreign accent moves a
// word INSIDE a class cluster, not between clusters: "your"→@r, "euro"→@r@,
// "name"/"nim"→n@m, "was"→f@s vs "whats"→f@ts. Unmapped characters (spaces,
// Cyrillic — Chrome's en-US recognizer shouldn't emit them, and a wrong
// language must not match anyway) drop out of the key.
const SOUND_CLASS = {
  a: '@', e: '@', i: '@', o: '@', u: '@', y: '@',
  b: 'p', p: 'p',
  d: 't', t: 't',
  g: 'k', k: 'k', q: 'k', c: 'k',
  f: 'f', v: 'f', w: 'f',
  s: 's', z: 's', x: 's',
  m: 'm', n: 'n',
  l: 'l', r: 'r',
  j: 'j',
  h: '',
};

export function soundKey(s) {
  let out = '';
  for (const ch of norm(s)) {
    const cls = SOUND_CLASS[ch];
    if (!cls) continue;
    if (out.slice(-1) !== cls) out += cls;
  }
  return out;
}

// Does `heard` (a raw recognition transcript) contain the word described by wordSpec?
// Generous on purpose: kids' pronunciation of foreign words is approximate.
export function matchWord(wordSpec, heard) {
  const targets = new Set();
  for (const w of [wordSpec.text, ...(wordSpec.accept || [])]) {
    const n = norm(w);
    if (n) targets.add(n);
  }
  const toks = norm(heard).split(' ').filter(Boolean);
  const keys = toks.map(soundKey);
  const targetKeys = new Map([...targets].map(tg => [tg, soundKey(tg)]));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const bigram = toks[i + 1] ? t + ' ' + toks[i + 1] : null;
    const k = keys[i];
    const kb = bigram ? soundKey(bigram) : null;
    for (const target of targets) {
      if (t === target || bigram === target) return true;
      if (target.length >= 4 && t.length >= 3 && t.startsWith(target.slice(0, 3))) return true;
      const maxD = Math.max(1, Math.floor(target.length * 0.34));
      if (levenshtein(t, target) <= maxD) return true;
      if (bigram && levenshtein(bigram, target) <= maxD) return true;
      // Sound layer — the accent path. Spelling distance is a bad proxy for
      // sound distance; same budget, applied to the skeletons.
      const tk = targetKeys.get(target);
      const sMaxD = Math.max(1, Math.floor(tk.length * 0.34));
      if (k && levenshtein(k, tk) <= sMaxD) return true;
      if (kb && levenshtein(kb, tk) <= sMaxD) return true;
    }
  }
  return false;
}

export const speech = {
  active: null, // { wordSpec, resolve }

  // Resolves { matched:boolean, heard?:string, error?:string }
  listenFor(wordSpec) {
    return new Promise(resolve => {
      if (TEST) { this.active = { wordSpec, resolve }; return; } // automation drives via inject()
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return resolve({ matched: false, error: 'unsupported' });
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = true; // stream hypotheses — the fast pass needs them
      rec.maxAlternatives = 5;
      rec.continuous = false;
      let done = false;
      let hot = 0; // consecutive MATCHING interims (fast-pass guard)
      const finish = res => {
        if (done) return;
        done = true;
        this.active = null;
        try { rec.stop(); } catch {}
        resolve(res);
      };
      rec.onresult = e => {
        const res = e.results[e.results.length - 1];
        const alts = [...res].map(r => r.transcript);
        const matched = alts.some(a => matchWord(wordSpec, a));
        if (res.isFinal) {
          console.log('[speech] final', JSON.stringify(alts), '→', wordSpec.text, '→', matched ? 'MATCH' : 'miss');
          finish({ matched, heard: alts[0] || '' });
          return;
        }
        // FAST PASS: a win on two consecutive interims (~300 ms apart) is real —
        // take it without waiting out Chrome's end-of-speech silence window.
        // A mismatching interim proves nothing; misses keep waiting for final.
        if (matched) {
          if (++hot >= 2) {
            console.log('[speech] early match on interims', JSON.stringify(alts), '→', wordSpec.text);
            finish({ matched: true, heard: alts[0] || '' });
          }
        } else hot = 0;
      };
      rec.onerror = e => { console.log('[speech] error:', e.error); finish({ matched: false, error: e.error }); }; // no-speech | not-allowed | aborted…
      rec.onend = () => finish({ matched: false });
      this.active = { wordSpec, resolve: finish };
      try { rec.start(); } catch { finish({ matched: false, error: 'start-failed' }); }
      setTimeout(() => { try { rec.stop(); } catch {} }, 9000);
    });
  },

  inject(text) { // test-only: pretend the kid just said `text`
    const active = this.active;
    if (!active) return false;
    this.active = null;
    active.resolve({ matched: matchWord(active.wordSpec, String(text)), heard: String(text) });
    return true;
  },
};
