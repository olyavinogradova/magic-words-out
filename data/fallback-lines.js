// data/fallback-lines.js — embedded copy of the language-pack manifests.
// Used when the manifest files can't be fetched (file:// etc.); files always win.
export const NATIVE_DEFAULT = {
  pack: 'native', lang: 'ru',
  voices: { mom: { pitch: 1.05, rate: 0.92 }, daughter: { pitch: 1.35, rate: 1.0 } },
  lines: {
    'walk-intro': { speaker: 'mom', text: 'Пойдём гулять!', audio: null },
    'wow': { speaker: 'daughter', text: 'Ой!', audio: null },
    'walk-resume': { speaker: 'mom', text: 'Идём дальше!', audio: null },
    'finish': { speaker: 'mom', text: 'Ура! Мы прошли весь лес!', audio: null },
    'intro': { speaker: 'mom', text: 'Не бойся, я рядом. Давай спросим, как его зовут. Повторяй за мной!', audio: null },
    'intro2': { speaker: 'mom', text: 'Давай и его спросим, как тебя зовут!', audio: null },
    'miss': { speaker: 'mom', text: 'Почти получилось! Слушай ещё раз.', audio: null },
    'tap-stone': { speaker: 'mom', text: 'Нажми на волшебный камушек!', audio: null },
    'praise': { speaker: 'mom', text: 'Ура! Ты справилась! Он стал добрым!', audio: null },
    'praise2': { speaker: 'mom', text: 'Ещё один новый друг. У тебя получается всё лучше!', audio: null },
  },
};

export const TARGET_DEFAULT = {
  pack: 'target', lang: 'en',
  voices: {
    'mom-en': { pitch: 1.0, rate: 0.75 },  // mom demonstrating target words: slow and clear
    'daughter': { pitch: 1.3, rate: 0.95 },
    'monster': { pitch: 0.9, rate: 0.6, male: true }, // a man's voice, unhurried ("I'm Boo")
  },
  lines: {
    'wow': { speaker: 'daughter', text: 'Oh!', audio: null },
    'w1': { speaker: 'mom-en', text: "What's", audio: null },
    'w2': { speaker: 'mom-en', text: 'your', audio: null },
    'w3': { speaker: 'mom-en', text: 'name', audio: null },
    'whole': { speaker: 'mom-en', text: "What's your name?", audio: null },
    'boo-reply': { speaker: 'monster', text: "I'm Boo!", audio: null },
    'chick-reply': { speaker: 'monster', text: "I'm Chick!", audio: null },
  },
};
