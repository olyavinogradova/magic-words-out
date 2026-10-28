# Words magic («Магия слов») — first words in a new language

A prototype of a browser game that teaches kids aged 5–6 their first phrases in a new language. The game is designed for families who plan to relocate or travel to a new country. It focuses on the phrases that matter most to a kid in their first days.

## Plot

A girl and her mom walk through a magical forest and meet monsters that look scary — but become
friends when the child speaks to them out loud. Everything runs on voice, glow
and tap: no reading required. First language pair: **Russian → English** (the
child repeats English words after her mom and the monsters).

## Play

- **Online:** https://olyavinogradova.github.io/magic-words-out/

Desktop **Chrome** is the supported browser (speech recognition uses its Web
Speech API). The child plays with voice and taps; on desktop, jumping between
the high barriers is keyboard-only (Space / ↑ / W), so a grown-up may need to
help. On phones and tablets the game shows on-screen walk and jump buttons;
the microphone works over https.

## Microphone & privacy

- The game asks for **microphone access** so the child can repeat words aloud —
  speaking is the whole mechanic.
- Recognition uses the browser's built-in Web Speech API. **In Chrome,
  recognized speech is processed by Google's cloud speech service.**
- The game itself records nothing, stores nothing, and sends nothing anywhere
  else. No accounts, no analytics, no ads, no cookies.
- Internet is needed for two fonts and for speech recognition; the game files
  are fully static.

## How it's built

- Vanilla JavaScript ES modules: no frameworks, no build step, no dependencies.
- Art is hand-painted PNG crops; every art/audio module also has a procedural
  fallback, so the game still runs with zero asset files present.
- Voice lines live in per-language packs (`assets/audio/`); recorded audio
  always replaces TTS when present. Words and levels are data files (`data/`).
- The child cannot read: all UX is audio, glow and tap.

## License

Code and art: [MIT](LICENSE).
Fonts: [Lilita One](https://fonts.google.com/specimen/Lilita+One) and
[Nunito](https://fonts.google.com/specimen/Nunito) — SIL Open Font License.
