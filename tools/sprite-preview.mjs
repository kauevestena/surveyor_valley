// Look at the art without launching the game.
//
//     node tools/sprite-preview.mjs                # everything
//     node tools/sprite-preview.mjs tree           # keys starting "tree"
//     node tools/sprite-preview.mjs tree out.png   # somewhere specific
//     PREVIEW_SCALE=6 node tools/sprite-preview.mjs tree-0-2   # close up
//
// Writes a contact sheet: every matching sprite on a checkered ground, each one
// standing on a common baseline inside its cell so silhouettes can be compared
// by eye. Scaled 2x by whole pixels, because that is how the game shows them.
//
// A dev tool, not part of the build. Nothing here is committed as an asset —
// the default output goes to a temp directory.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makePix } from '../src/render/pixbuf.js';
import { buildSprites } from '../src/render/sprites/index.js';
import { toPNG } from './png.mjs';

const prefix = process.argv[2] ?? '';
const out = process.argv[3] ?? join(tmpdir(), `sprites-${prefix || 'all'}.png`);

const sprites = buildSprites().filter((s) => s.key.startsWith(prefix));
if (!sprites.length) {
  console.error(`no sprite key starts with "${prefix}"`);
  process.exit(1);
}

const PAD = 6;
const SCALE = Number(process.env.PREVIEW_SCALE) || 2;
const cellW = Math.max(...sprites.map((s) => s.pix.w)) + PAD * 2;
const cellH = Math.max(...sprites.map((s) => s.pix.h)) + PAD * 2;
const cols = Math.min(sprites.length, Math.max(1, Math.floor(1200 / (cellW * SCALE))));
const rows = Math.ceil(sprites.length / cols);

const sheet = makePix(cols * cellW, rows * cellH);

// A checker, so transparent pixels are obvious and a stray contact shadow shows.
for (let y = 0; y < sheet.h; y++) {
  for (let x = 0; x < sheet.w; x++) {
    sheet.px(x, y, ((x >> 3) + (y >> 3)) & 1 ? '#5a6a52' : '#4e5c47');
  }
}

sprites.forEach((s, i) => {
  const cx = (i % cols) * cellW;
  const cy = Math.floor(i / cols) * cellH;
  // Every sprite's anchor sits on the same line in every cell: that is what
  // makes two trees of different heights actually comparable.
  const baseline = cy + cellH - PAD;
  const dx = Math.round(cx + cellW / 2 - s.pix.w * s.anchorX);
  const dy = Math.round(baseline - s.pix.h * s.anchorY);
  sheet.hline(cx + 1, cx + cellW - 2, baseline, '#7c8a6f');
  sheet.blit(s.pix, dx, dy);
});

const big = makePix(sheet.w * SCALE, sheet.h * SCALE);
for (let y = 0; y < sheet.h; y++) {
  for (let x = 0; x < sheet.w; x++) {
    big.fill(x * SCALE, y * SCALE, SCALE, SCALE, sheet.get(x, y));
  }
}

writeFileSync(out, toPNG(big));
console.log(`${out}  ${big.w}x${big.h}  ${sprites.length} sprites, ${cols} per row`);
for (let r = 0; r < rows; r++) {
  console.log('  ' + sprites.slice(r * cols, r * cols + cols).map((s) => s.key).join('  '));
}
