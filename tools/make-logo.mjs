// The pixel half of the identity: the wordmark in the HUD bar, and the favicon.
//
//     node tools/make-logo.mjs
//
// Writes `assets/logo-pixel.png` and `assets/favicon.png`. Committed output,
// like the SVGs — this runs only when the logo changes.
//
// It is painted with the GAME'S OWN PAINTER (`src/render/pixbuf.js`) out of the
// game's own palette, which is the whole point of having a second version of
// the logo at all. The vector wordmark in `assets/logo.svg` is a title: smooth,
// arced, meant for a readme or a splash. This one has to sit in a 26 px HUD bar
// two pixels from a total station sprite, and anything with an antialiased edge
// looks foreign there. Same letterforms in spirit, drawn on a grid, outlined by
// `pix.outline()` exactly as every tree and surveyor in the valley is.
//
// The PNG writer at the bottom is a dozen lines against a dependency, and node
// has zlib built in.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makePix } from '../src/render/pixbuf.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The logo's own ramps, [shadow, mid, light], matching `assets/logo.svg` step
 * for step so the two versions of the identity agree on their colours.
 *
 * Deliberately NOT `P.instrumentTrim` and friends out of `render/palette.js`:
 * `ramp()` rotates hue as value falls, so the shadow step of every warm colour
 * in that palette lands on crimson — which is right on a tree trunk in a green
 * field, and reads as a misprint under a letterform. The palette says as much
 * itself, where the skin tones ask for a reduced rotation for the same reason.
 */
const INK = '#3b2a16';
const GOLD = ['#c9922c', '#f2c14e', '#f7ecd0'];
const GLASS = ['#4fb2dd', '#9fdcf4', '#eaf7fd'];
const BRASS = ['#c9922c', '#f2c14e', '#f7e3a8'];
const WOOD = ['#7a5227', '#b9834a', '#c9a06a'];

/**
 * Five by seven, which is the smallest grid that still has a middle bar.
 *
 * All caps: at this size a lowercase run loses its x-height to the outline and
 * turns to mush, and a HUD brand is read as a shape rather than as a word.
 * `O` is missing on purpose — a looking glass stands in for it, drawn below.
 */
const GLYPHS = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#..#.', '#...#', '#...#'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
};

/** The magnifier, in the space of one letter: lens on top, handle below right. */
const LENS = ['.###.', '#...#', '#...#', '#...#', '.###.', '...##', '....#'];
/** Where the light catches it, in the same cell. */
const GLARE = [
  [1, 1],
  [2, 1],
  [1, 2],
];

const WORD = 'SURVEYOR VALLEY';
const CELL_W = 5;
const CELL_H = 7;
const GAP = 1;
const SPACE = 3;

function wordmark() {
  let width = 0;
  for (const ch of WORD) width += (ch === ' ' ? SPACE : CELL_W) + GAP;
  width -= GAP;

  // One pixel of margin all round, for the outline to live in.
  const pix = makePix(width + 2, CELL_H + 2);
  let x = 1;

  for (const ch of WORD) {
    if (ch === ' ') {
      x += SPACE + GAP;
      continue;
    }
    const rows = ch === 'O' ? LENS : GLYPHS[ch];
    if (!rows) throw new Error(`no glyph for ${ch}`);

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] !== '#') continue;
        const px = x + c;
        const py = 1 + r;
        if (ch !== 'O') {
          // Top row lighter, bottom row darker: a one-pixel bevel is all the
          // room there is, and without it gold reads as a flat sticker.
          pix.px(px, py, r === 0 ? GOLD[2] : r === rows.length - 1 ? GOLD[0] : GOLD[1]);
        } else if (r >= 5) {
          pix.px(px, py, WOOD[1]);
        } else {
          const rim = r === 0 || r === 4 || c === 0 || c === 4;
          pix.px(px, py, rim ? BRASS[1] : GLASS[1]);
        }
      }
    }

    if (ch === 'O') {
      for (const [gx, gy] of GLARE) pix.px(x + gx, 1 + gy, GLASS[2]);
    }
    x += CELL_W + GAP;
  }

  pix.outline(INK, { diagonal: true, amount: 0 });
  return pix;
}

/**
 * The mark on its own, sixteen pixels square, for the browser tab.
 *
 * Drawn rather than scaled down from the wordmark: a 5 px lens upscaled is four
 * fat squares, and a favicon is the one place the art has to survive being
 * looked at from three metres away in a tab strip.
 */
function mark() {
  const pix = makePix(16, 16);

  // Handle first: the rim is drawn over it, so the two meet cleanly.
  for (let i = 0; i < 6; i++) {
    const x = 8 + i;
    const y = 8 + i;
    pix.px(x, y, WOOD[1]);
    pix.px(x - 1, y, WOOD[0]);
    pix.px(x, y - 1, WOOD[2]);
  }

  pix.disc(6.5, 6.5, 5.6, BRASS[0]);
  pix.disc(6.5, 6.5, 4.6, BRASS[1]);
  pix.disc(6.5, 6.5, 3.6, GLASS[1]);
  pix.px(5, 4, GLASS[2]);
  pix.px(4, 5, GLASS[2]);
  pix.px(5, 5, GLASS[2]);
  pix.px(8, 8, BRASS[0]);

  pix.outline(INK, { diagonal: true, amount: 0 });
  return pix;
}

/** Nearest-neighbour, integer factors only — the rule the whole game runs on. */
function scale(pix, k) {
  const out = makePix(pix.w * k, pix.h * k);
  for (let y = 0; y < pix.h; y++) {
    for (let x = 0; x < pix.w; x++) {
      const [r, g, b, a] = pix.get(x, y);
      if (!a) continue;
      out.fill(x * k, y * k, k, k, [r, g, b, a]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- PNG -------

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const payload = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(payload));
  return Buffer.concat([len, payload, crc]);
}

function toPNG(pix) {
  const stride = pix.w * 4;
  const raw = Buffer.alloc((stride + 1) * pix.h);
  for (let y = 0; y < pix.h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none. The images are tiny.
    Buffer.from(pix.data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pix.w, 0);
  ihdr.writeUInt32BE(pix.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, pix) {
  const path = join(ROOT, 'assets', name);
  writeFileSync(path, toPNG(pix));
  console.log(`${path}  ${pix.w}x${pix.h}`);
}

// The wordmark ships at 1x and is scaled by whole numbers in CSS; the favicon
// ships at 2x because 32 px is the size browsers actually ask for.
write('logo-pixel.png', wordmark());
write('favicon.png', scale(mark(), 2));
