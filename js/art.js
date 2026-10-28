// art.js — loads art by canonical per-pose filenames.
// Missing files fall back to a raw sheet (auto-sliced) and then to procedural
// placeholders, so the game is always playable.
//
// Frames are baked: each pose is scaled ONCE into an offscreen canvas at
// display height × devicePixelRatio and cached — per-frame drawImage then
// copies 1:1 with no re-filtering. Cache is keyed by rounded pixel height
// and cleared on resize (main.js calls art.clearBakes()).

// canonical file -> fallback sheet names tried in order (sheets are sliced at runtime)
const DEFS = {
  mom: {
    // 0 idle · 1 walk1 · 2 jump · 3 land · 4 happy · 5 shield
    frames: ['mom_idle.png', 'mom_walk1.png', 'mom_jump.png', 'mom_land.png', 'mom_happy.png', 'mom_shield.png'],
    sheets: ['mom.png', 'mom_sheet.png', 'mother.png'],
  },
  daughter: {
    // 0 idle · 1 walk1(run) · 2 jump · 3 land · 4 happy · 5 pick · 6 hold
    frames: ['daughter_idle.png', 'daughter_walk1.png', 'daughter_jump.png', 'daughter_land.png', 'daughter_happy.png', 'daughter_pick.png', 'daughter_hold.png'],
    sheets: ['daughter.png', 'daughter_sheet.png', 'girl.png'],
  },
  momkid: {
// the encounter's shield pair (players.js frame 0)
    frames: ['momkid_peek1.png'],
    sheets: [],
  },
  stones: {
// 24 variants; walk.js cycles them i % 24, the gem-counter icon uses frame 0.
    frames: Array.from({ length: 24 }, (_, i) => `stones_${i + 1}.png`),
    sheets: ['stones.png', 'stone.png', 'gems.png'],
  },
  background: {
    frames: ['background.png'],
    sheets: ['bg.png', 'forest.png'],
  },
  ground: {
    frames: ['ground.png'],
    sheets: ['ground_strip.png'],
  },
  monster1: {
    frames: ['monster1_stage1.png', 'monster1_stage2.png', 'monster1_stage3.png', 'monster1_stage4.png'],
    sheets: ['monster1.png', 'monster_1.png', 'monster01.png', 'boo.png'],
  },
  monster2: {
// second monster — real alpha; figures face right like monster1.
    frames: ['monster2_stage1.png', 'monster2_stage2.png', 'monster2_stage3.png', 'monster2_stage4.png'],
    sheets: [],
  },
  props: {
// barrier art: the three LOW barriers — log · big stone · stump — plus the
// two TALL ones (pillar · cliff; a high barrier is reachable only from the
// top of a low one). Ladder/vine excluded by design. Frame order =
// js/props.js FRAME; data/levels.js kinds must match. Drawn at the
// barrier's data height; levels.js widths match the art aspect.
    frames: ['barriers_log.png', 'barriers_bigstone.png', 'barriers_stump.png',
             'barriers_pillar.png', 'barriers_cliff.png'],
    sheets: [],
  },
  trees: {
// scene trees: trees2_1..6 in sheet reading order (1–4 upper row, 5–6 lower);
// frame indices = js/world.js TREE_CAST (0..5 — tree 7 never casts).
    frames: ['trees2_1.png', 'trees2_2.png', 'trees2_3.png', 'trees2_4.png',
             'trees2_5.png', 'trees2_6.png'],
    sheets: [],
  },
  cover: {
// start screen: full-bleed illustration used WHOLE — never split, component
// slicing would crop it.
    frames: ['cover.png'],
    sheets: [],
  },
  buttons: {
// phone touch controls (back · fwd · jump) — drawn by the DOM buttons in
// index.html (js/controls.js), not the canvas; missing files fall back to
// procedural SVG arrows.
    frames: ['buttons_back.png', 'buttons_fwd.png', 'buttons_jump.png'],
    sheets: [],
  },
};

const ART_DIR = 'assets/art/';
const loaded = {}; // name -> { imgs:[Image|null...], total:n }
const bakes = new Map(); // `${name}:${i}:${pxH}` -> canvas (already at DPR scale)

function curDpr() { return Math.min(2, window.devicePixelRatio || 1); }

function tryImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

export const art = {
  // Non-blocking: game starts on placeholders, real art swaps in as it arrives.
  load() {
    for (const [name, def] of Object.entries(DEFS)) {
      const entry = { imgs: def.frames.map(() => null), total: def.frames.length };
      // first settle (loaded/missing) of frame 0's own file — art.ready();
      // a sheet filling frame 0 later doesn't re-resolve it (fine: kinds
      // that need ready() have no sheets)
      let settle0;
      entry.settled = new Promise(r => { settle0 = r; });
      // resolves once EVERY frame settled (loaded or missing) — callers that
      // consume whole frames arrays gate on this, not on settled
      let settleAll;
      entry.all = new Promise(r => { settleAll = r; });
      let pending = def.frames.length;
      const oneSettled = () => { if (--pending === 0) settleAll(entry.imgs.every(Boolean)); };
      loaded[name] = entry;
      def.frames.forEach((file, i) => {
        tryImage(ART_DIR + file)
          .then(img => { entry.imgs[i] = img; bakes.clear(); if (i === 0) settle0(true); oneSettled(); })
          .catch(() => { if (i === 0) settle0(false); oneSettled(); });
      });
      // also try a whole sheet covering all frames (sliced at runtime)
      (async () => {
        for (const sheet of def.sheets) {
          try {
            const img = await tryImage(ART_DIR + sheet);
            const n = Math.max(1, Math.round(img.width / img.height));
            for (let i = 0; i < entry.imgs.length; i++) {
              if (!entry.imgs[i]) entry.imgs[i] = sliceSheet(img, i, n);
            }
            bakes.clear();
            return;
          } catch { /* next name */ }
        }
      })();
    }
  },

  clearBakes() { bakes.clear(); },

  // A specific frame (pose) is available?
  has(name, i = 0) { return !!loaded[name]?.imgs[i]; },

  // Frame 0's own file settled: true = loaded, false = missing. Lets callers
  // choose art-driven UI vs fallback WITHOUT racing the async load.
  ready(name) { return loaded[name]?.settled ?? Promise.resolve(false); },

  // Every frame of `name` settled (loaded or missing); true = ALL loaded.
  // `loaded` is undefined until art.load() ran — resolves false then.
  all(name) { return loaded[name]?.all ?? Promise.resolve(false); },

  // The baked offscreen canvas for a frame at a given display height (CSS px).
  baked(name, i, img, h) {
    const key = `${name}:${i}:${Math.round(h)}`;
    let c = bakes.get(key);
    if (!c) {
      const dpr = curDpr();
      const bh = Math.max(2, Math.round(h * dpr));
      const bw = Math.max(2, Math.round(img.width * (bh / img.height)));
      c = document.createElement('canvas');
      c.width = bw; c.height = bh;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, bw, bh);
      if (bakes.size > 64) bakes.clear(); // height churn safety valve
      bakes.set(key, c);
    }
    return c;
  },

  // Draw frame i centered at x, bottom (feet) at y, scaled to height h.
  // Returns true if art was drawn, false if a placeholder is needed.
  drawFrame(ctx, name, i, x, yBottom, h, { flip = false, alpha = 1, scale = 1 } = {}) {
    const img = loaded[name]?.imgs[i];
    if (!img) return false;
    const b = this.baked(name, i, img, h);
    const drawH = h * scale, drawW = (b.width / b.height) * drawH;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flip) { ctx.translate(x, yBottom); ctx.scale(-1, 1); ctx.drawImage(b, -drawW / 2, -drawH, drawW, drawH); }
    else ctx.drawImage(b, x - drawW / 2, yBottom - drawH, drawW, drawH);
    ctx.restore();
    return true;
  },

  image(name, i = 0) { return loaded[name]?.imgs[i] || null; },
};

// Slice frame i out of a horizontal sheet (equal-width cells)
function sliceSheet(img, i, n) {
  const cellW = img.width / n;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cellW));
  c.height = img.height;
  c.getContext('2d').drawImage(img, i * cellW, 0, cellW, img.height, 0, 0, c.width, c.height);
  return c;
}
