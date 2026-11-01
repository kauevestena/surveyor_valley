// Look at the ground without launching the game.
//
//     node tools/ground-preview.mjs              # every soil, and the borders between them
//     node tools/ground-preview.mjs out.png      # somewhere specific
//     PREVIEW_SCALE=3 node tools/ground-preview.mjs
//
// Bakes real chunks of real valleys with the game's own painters — the same
// calls in the same order as `render/groundbake.js` — and crops a window out
// of them for each soil, then for the borders between pairs of soils:
//
//     row 1   pasture, scrub, bare earth, crops
//     row 2   sand, rock, marsh, water
//     rows 3-4  borders, in the order of `PAIRS` below
//
// Each window is the best example found across a handful of seeds, and where
// it came from is printed, so it can be walked to in the game. This is the
// ground's counterpart to `sprite-preview.mjs`: the place to look first when
// a palette or painter change needs judging by eye.
//
// A dev tool, not part of the build. Nothing here is committed as an asset —
// the default output goes to a temp directory.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildWorld } from '../src/world/world.js';
import { DIFFICULTY } from '../src/core/state.js';
import { makePix, PX_PER_M } from '../src/render/pixbuf.js';
import { buildGroundSprites } from '../src/render/sprites/index.js';
import { classGrid, groundFields, paintBase, paintFurrows, paintDetail, detailRows, shadeField, CLASS_IDS } from '../src/render/groundpaint.js';
import { toPNG } from './png.mjs';

const out = process.argv[2] ?? join(tmpdir(), 'ground.png');
const SCALE = Number(process.env.PREVIEW_SCALE) || 2;
const SEEDS = ['sv-3a9197', 'sv-1a2b3c', 'sv-77aa01', 'sv-0c0ffe', 'sv-5eed42'];

const SOILS = ['PASTO', 'CAMPO_SUJO', 'SOLO_EXPOSTO', 'LAVOURA', 'AREIA', 'ROCHA', 'BREJO', 'AGUA'];
const PAIRS = [
  ['PASTO', 'SOLO_EXPOSTO'],
  ['PASTO', 'LAVOURA'],
  ['PASTO', 'CAMPO_SUJO'],
  ['CAMPO_SUJO', 'ROCHA'],
  ['BREJO', 'AGUA'],
  ['AREIA', 'AGUA'],
  ['PASTO', 'BREJO'],
  ['SOLO_EXPOSTO', 'LAVOURA'],
];

const CHUNK = 32;
const WIN = 14; // metres across a window
const STEP = 2; // metres between candidate windows

// ---- find the windows ----------------------------------------------------------

/** Per-class coverage of every window, from a 1 m class map and a summed-area table per class. */
function survey(terrain, bounds) {
  const W = Math.floor(bounds.width);
  const H = Math.floor(bounds.height);
  const K = CLASS_IDS.length;
  const index = new Map(CLASS_IDS.map((id, i) => [id, i]));
  const sat = new Int32Array((W + 1) * (H + 1) * K);
  const at = (x, y, k) => ((y * (W + 1) + x) * K) + k;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = index.get(terrain.soilAt(bounds.minE + x + 0.5, bounds.minN + y + 0.5).id) ?? 0;
      for (let k = 0; k < K; k++) {
        sat[at(x + 1, y + 1, k)] = (k === c ? 1 : 0) + sat[at(x, y + 1, k)] + sat[at(x + 1, y, k)] - sat[at(x, y, k)];
      }
    }
  }
  return (x, y, k) =>
    (sat[at(x + WIN, y + WIN, k)] - sat[at(x, y + WIN, k)] - sat[at(x + WIN, y, k)] + sat[at(x, y, k)]) / (WIN * WIN);
}

const worlds = SEEDS.map((seed) => ({ seed, ...buildWorld(seed, DIFFICULTY.facil) }));
const best = new Map();
const consider = (key, score, w, x, y) => {
  if (score > (best.get(key)?.score ?? -Infinity)) best.set(key, { score, w, e: w.bounds.minE + x, n: w.bounds.minN + y });
};
for (const w of worlds) {
  const cover = survey(w.terrain, w.bounds);
  const k = (id) => CLASS_IDS.indexOf(id);
  for (let y = 4; y + WIN < w.bounds.height - 4; y += STEP) {
    for (let x = 4; x + WIN < w.bounds.width - 4; x += STEP) {
      // A soil: as much of it as possible, short of filling the window — the
      // edge of a patch is part of how it looks. Water wants its shore in view.
      for (const id of SOILS) {
        const c = cover(x, y, k(id));
        const cap = id === 'AGUA' ? 0.72 : 0.9;
        if (c <= cap) consider(id, c, w, x, y);
      }
      // A border: both soils well represented, and little else in the way.
      for (const [a, b] of PAIRS) {
        const ca = cover(x, y, k(a));
        const cb = cover(x, y, k(b));
        if (ca + cb > 0.85) consider(`${a}|${b}`, Math.min(ca, cb), w, x, y);
      }
    }
  }
}

// ---- bake ----------------------------------------------------------------------

const sprites = buildGroundSprites();
const S = CHUNK * PX_PER_M;
const chunks = new Map();

/** One chunk, exactly as the game bakes it: grid, fields, base, crops, detail. */
function chunk(w, cx, cy) {
  const key = `${w.seed}:${cx},${cy}`;
  if (chunks.has(key)) return chunks.get(key);
  const oe = cx * CHUNK;
  const on = cy * CHUNK;
  const { grid, size } = classGrid(w.terrain, oe, on, CHUNK);
  const F = groundFields(grid, size, oe, on, CHUNK, null, shadeField(oe, on, CHUNK));
  const buf = new Uint8ClampedArray(S * S * 4);
  paintBase(buf, grid, size, oe, on, CHUNK, PX_PER_M, 0, S, F.shade, null, F);
  paintFurrows(buf, grid, size, oe, on, CHUNK, PX_PER_M, sprites, F);
  paintDetail(buf, grid, size, oe, on, CHUNK, PX_PER_M, sprites, 0, detailRows(CHUNK) - 1, F);
  const c = { buf, oe, on };
  chunks.set(key, c);
  return c;
}

// ---- lay out -------------------------------------------------------------------

const keys = [...SOILS, ...PAIRS.map(([a, b]) => `${a}|${b}`)];
const COLS = 4;
const PAD = 8;
const cell = WIN * PX_PER_M * SCALE;
const rows = Math.ceil(keys.length / COLS);
const sheet = makePix(COLS * cell + (COLS + 1) * PAD, rows * cell + (rows + 1) * PAD);
for (let i = 0; i < sheet.data.length; i += 4) {
  sheet.data[i] = sheet.data[i + 1] = sheet.data[i + 2] = 38;
  sheet.data[i + 3] = 255;
}

keys.forEach((key, i) => {
  const b = best.get(key);
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x0 = PAD + col * (cell + PAD);
  const y0 = PAD + row * (cell + PAD);
  if (!b) {
    console.log(`${key.padEnd(24)} none found`);
    return;
  }
  const side = WIN * PX_PER_M;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      // World pixel centres, north up, exactly as the camera sees them.
      const we = b.e + (x + 0.5) / PX_PER_M;
      const wn = b.n + WIN - (y + 0.5) / PX_PER_M;
      const c = chunk(b.w, Math.floor(we / CHUNK), Math.floor(wn / CHUNK));
      const lx = Math.floor((we - c.oe) * PX_PER_M);
      const ly = Math.floor((CHUNK - (wn - c.on)) * PX_PER_M);
      const o = (ly * S + lx) * 4;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const p = ((y0 + y * SCALE + dy) * sheet.w + x0 + x * SCALE + dx) * 4;
          sheet.data[p] = c.buf[o];
          sheet.data[p + 1] = c.buf[o + 1];
          sheet.data[p + 2] = c.buf[o + 2];
        }
      }
    }
  }
  const where = `${b.w.seed} at E ${b.e.toFixed(0)}, N ${b.n.toFixed(0)} (window's south-west corner)`;
  console.log(`${key.replace('|', ' / ').padEnd(24)} ${where}`);
});

writeFileSync(out, toPNG(sheet));
console.log(`\nwrote ${out}  (${sheet.w}x${sheet.h}, ${chunks.size} chunks baked)`);
