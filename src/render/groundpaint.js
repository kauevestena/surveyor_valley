// Painting the ground.
//
// This is where the valley stops looking like a weather map. The Phase 1
// terrain was one flat colour per soil class, bilinearly blurred — which is
// exactly what a pasture does not look like. Here every square metre gets
// texture, and roughly one tuft of grass, and occasionally a flower.
//
// The density is affordable because none of it is an entity. Detail is placed
// by hashing the world position, painted straight into the chunk bitmap, and
// then forgotten: a screenful of ten thousand grass blades costs the same
// twenty blits as a screenful of bare dirt.
//
// Cost is split by frequency, which is the whole performance story:
//
//   once per CELL (25 cm)   the expensive part — the soil class, from three
//                           fields of fBm — memoised by `terrain.soilAt`
//   once per CHUNK          the smooth fields that shape everything: how a
//                           border wanders, where the ground is lusher or
//                           damper, where the marsh holds water
//   once per PIXEL          a few hashes, some lookups and a colour write
//
// EVERYTHING IS ANCHORED TO THE WORLD, never to the chunk. A hash or a field
// read in chunk-local coordinates gives the same pattern in every chunk and a
// different answer on either side of a chunk's edge — measured, the brightness
// of the ground jumped by up to 11% across every north–south chunk border,
// and the grain repeated exactly every 32 m. The world pixel (X east, Y north)
// is the only coordinate anything here hashes.
//
// Borders between soils are a SOFT, ORGANIC BLEND. Each pixel warps its
// position by a smooth field so the outline meanders, weighs the 3x3 soil
// cells around it with a quadratic B-spline, and mixes the textured colour of
// every soil present — so grass thins into dirt over a few pixels instead of
// stopping at a line or dissolving into confetti. Water is the exception: it
// meets the land at a line, softened by a lip of foam and a damp bank.
//
// DOM-free on purpose: it fills a Uint8ClampedArray, and `groundbake.js` deals
// with canvases and textures.

import { rgba, hash2 } from './pixbuf.js';
import { GROUND, P } from './palette.js';
import { CELLS_PER_M } from '../world/terrain.js';
import { makeNoise } from '../core/noise.js';

/**
 * Detail population per soil class, in items per square metre.
 *
 * Grass is deliberately dense — at 32 screen pixels per metre, a tuft every
 * square metre reads as scattered dashes on a green sheet rather than as a
 * pasture. Density is free here; these are baked, not drawn.
 */
const DETAIL = {
  PASTO: { tuft: 2.0, flower: 0.028, pebble: 0.015 },
  CAMPO_SUJO: { tuftDry: 1.7, tuftTall: 0.55, tussock: 0.1, pebble: 0.03 },
  SOLO_EXPOSTO: { clod: 0.5, pebble: 0.34, tuftDry: 0.06 },
  LAVOURA: { clod: 0.14 }, // the crops themselves come from the furrow pass
  AREIA: { pebble: 0.1 },
  ROCHA: { stone: 0.4, pebbleGrey: 0.42, tuftDry: 0.07 },
  BREJO: { cattail: 0.35, reed: 0.6, tuft: 0.6 },
  AGUA: { lilypad: 0.5 },
};

/**
 * Things that grow in patches rather than evenly: [density inside a patch,
 * density outside one] as multiples of `DETAIL`'s, and which patch field they
 * follow. About a fifth of the ground is inside a patch, so the pairs keep a
 * kind's average density near its `DETAIL` figure — except flowers, which are
 * allowed to be commoner in a meadow than their number says.
 *
 * Cattails and lily pads keep patches of their own: on the same field as the
 * reeds, a cattail stand could only ever grow inside a reed bed, where the
 * reeds take every spot first.
 */
const CLUMPY = {
  flower: [8, 0.12, 0],
  tussock: [4, 0.2, 0],
  stone: [3, 0.3, 0],
  reed: [4.2, 0.1, 0],
  cattail: [4.5, 0.03, 1],
  lilypad: [4.6, 0.1, 2],
};

/** Which of the DETAIL items are growing things rather than litter. */
const GRASSES = new Set(['tuft', 'tuftDry', 'tuftTall', 'tussock', 'reed', 'cattail']);

/**
 * How grassy each soil class is, as a fraction of pasture.
 *
 * The baked pass above is the only honest account of what grows where, so the
 * animated sway layer in `effects.js` reads its density rather than keeping a
 * second opinion — the two are the same grass, one painted into the chunk and
 * one standing on top of it moving, and they have to agree about whether there
 * is any. Derived from `DETAIL` so that changing a density there changes both.
 *
 * Capped at pasture: `CAMPO_SUJO` is denser still by count, but it is dry
 * scrub, and letting it exceed 1 would give the poorer ground the livelier
 * grass.
 */
export const GRASS_COVER = Object.fromEntries(
  Object.entries(DETAIL).map(([cls, items]) => {
    let sum = 0;
    for (const [item, density] of Object.entries(items)) if (GRASSES.has(item)) sum += density;
    return [cls, Math.min(1, sum / DETAIL.PASTO.tuft)];
  }),
);

/** Soil ids, in the order `world/terrain.js` declares them. */
export const CLASS_IDS = Object.keys(GROUND);
const CLASS_INDEX = new Map(CLASS_IDS.map((id, i) => [id, i]));
const NCLASS = CLASS_IDS.length;
const C = Object.fromEntries(CLASS_IDS.map((id, i) => [id, i]));
const WATER = C.AGUA;

/** `DETAIL` by class index, as [kind, per m², clumping or null] — the shape the scatter loop wants. */
const DETAIL_BY_INDEX = CLASS_IDS.map((id) =>
  DETAIL[id] ? Object.entries(DETAIL[id]).map(([kind, perM2]) => [kind, perM2, CLUMPY[kind] ?? null]) : null,
);

/**
 * Cells of margin around a chunk's class grid, on every side.
 *
 * Three metres, and every part of that is used: a border may wander a third of
 * a metre and blend over another cell, and the shore's depth shading reaches
 * three metres out from the waterline. A chunk that could not see that far
 * past its own edge would shade a lake differently from its neighbour, and
 * the seam would show as a line across the water.
 */
export const GRID_BORDER = 12;

/** How far a border wanders from the 25 cm grid, in metres, and how long its wiggles are. */
const WARP_AMP = 0.32;
const WARP_SCALE = 1.7;
/** Depth, in metres from the waterline, past which water is simply deep. */
const DEEP = 3;

// The art's own noise. Fixed seeds: the ground's texture belongs to the art,
// like the sprites, and does not change from one valley to the next — only the
// soil under it does.
const ART = 'ground-art';
const WARP_E = makeNoise(ART, 'warp-e');
const WARP_N = makeNoise(ART, 'warp-n');
const MOTTLE = makeNoise(ART, 'mottle');
const POOLS = makeNoise(ART, 'pools');
const CRACKS = makeNoise(ART, 'cracks');
const CLUMPS = makeNoise(ART, 'clumps');

/**
 * `hash2`'s mixing, returning all 32 bits as an integer, so one hash can make
 * several independent choices from different bits of it.
 */
function bits(x, y, salt) {
  let h = 374761393 ^ Math.imul(x | 0, 668265263) ^ Math.imul(y | 0, 2246822519) ^ Math.imul(salt | 0, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h ^ (h >>> 16);
}

/** How many grain clusters are dark, and as many light: a tenth each. */
const GRAIN_RATE = 0.1;

/**
 * The grain along a row: for `count` pixels of row Y from X0 eastward, -1
 * dark, +1 light, 0 none.
 *
 * Chosen per 2x2 block and then thinned, so a speck is a little crumb of two
 * or three pixels rather than a single dead one — from ONE hash per block,
 * shared by the two pixels of it on this row: its top byte picks the block's
 * tone, and two bits per pixel of the rest thin it, keeping three in four.
 * The same for every soil, so it is worked out once per row, not per soil.
 */
function grainRow(X0, Y, count, out) {
  const yb = (Y & 1) << 1;
  let px = 0;
  while (px < count) {
    const X = X0 + px;
    const h = bits(X >> 1, Y >> 1, 5);
    const t = (h >>> 8) / 16777216;
    const tone = t < GRAIN_RATE ? -1 : t > 1 - GRAIN_RATE ? 1 : 0;
    // This pixel, and its partner in the block if the row has it.
    out[px] = tone && ((h >>> (((X & 1) | yb) << 1)) & 3) !== 0 ? tone : 0;
    px++;
    if ((X & 1) === 0 && px < count) {
      out[px] = tone && ((h >>> ((1 | yb) << 1)) & 3) !== 0 ? tone : 0;
      px++;
    }
  }
}

/**
 * The soil class of every 25 cm cell of a chunk, plus `GRID_BORDER` cells of
 * margin all round.
 *
 * @returns {{grid:Uint8Array, size:number, cell:number, done:boolean}} `size`
 *          includes the margin.
 */
export function classGrid(terrain, originE, originN, metres, into = null, jStart = 0, jEnd = Infinity) {
  const cell = 1 / CELLS_PER_M;
  const size = metres * CELLS_PER_M + 2 * GRID_BORDER;
  const grid = into || new Uint8Array(size * size);
  // Sliceable by row, like every other stage of a bake: classifying a chunk's
  // worth of soil is the expensive half now that cells are 25 cm, and doing it
  // in one go would put back exactly the hitch the budgeted baker exists to
  // prevent.
  const j1 = Math.min(size, jEnd);
  for (let j = jStart; j < j1; j++) {
    for (let i = 0; i < size; i++) {
      const soil = terrain.soilAt(originE + (i - GRID_BORDER + 0.5) * cell, originN + (j - GRID_BORDER + 0.5) * cell);
      grid[j * size + i] = CLASS_INDEX.get(soil.id) ?? 0;
    }
  }
  return { grid, size, cell, done: j1 >= size };
}

/**
 * Signed distance in metres from the water's edge — negative in the water,
 * positive on land — by a two-pass chamfer over the cell grid.
 *
 * A hard line where a lake meets a pasture is the single most artificial thing
 * a generated landscape can do. With this, the water deepens away from the
 * shore, the last few centimetres of it get a foam lip, and the first metre
 * of land gets damp: the boundary reads as a shore.
 *
 * Eight neighbours, the diagonals at √2: with four, every distance was a
 * city-block distance, and the shore's bands came out as diamonds.
 */
export function edgeField(grid, gridSize, cell = 1 / CELLS_PER_M) {
  const FAR = 1e6;
  const n = gridSize;
  const d = new Float32Array(n * n);
  const diag = cell * Math.SQRT2;

  // Seed the boundary: a cell touching the other medium is half a cell away, in
  // METRES, so the shore bands stay the widths they are described as however
  // fine the grid gets.
  const half = cell * 0.5;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const wet = grid[i] === WATER;
      const edge =
        (x > 0 && (grid[i - 1] === WATER) !== wet) ||
        (x < n - 1 && (grid[i + 1] === WATER) !== wet) ||
        (y > 0 && (grid[i - n] === WATER) !== wet) ||
        (y < n - 1 && (grid[i + n] === WATER) !== wet);
      d[i] = edge ? half : FAR;
    }
  }

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let best = d[i];
      if (x > 0 && d[i - 1] + cell < best) best = d[i - 1] + cell;
      if (y > 0) {
        if (d[i - n] + cell < best) best = d[i - n] + cell;
        if (x > 0 && d[i - n - 1] + diag < best) best = d[i - n - 1] + diag;
        if (x < n - 1 && d[i - n + 1] + diag < best) best = d[i - n + 1] + diag;
      }
      d[i] = best;
    }
  }
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      let best = d[i];
      if (x < n - 1 && d[i + 1] + cell < best) best = d[i + 1] + cell;
      if (y < n - 1) {
        if (d[i + n] + cell < best) best = d[i + n] + cell;
        if (x < n - 1 && d[i + n + 1] + diag < best) best = d[i + n + 1] + diag;
        if (x > 0 && d[i + n - 1] + diag < best) best = d[i + n - 1] + diag;
      }
      d[i] = best;
    }
  }

  // Sign it: negative in the water.
  for (let i = 0; i < d.length; i++) if (grid[i] === WATER) d[i] = -d[i];
  return d;
}

// ---- smooth fields ------------------------------------------------------------

/**
 * A field sampled on a world-anchored lattice covering one chunk, read back by
 * interpolation. Lattice point (i, j) is at world (`(i0 + i) * step`,
 * `(j0 + j) * step`), so two chunks that share a point share its value — which
 * is the whole of what makes the ground seamless.
 */
function lattice(originE, originN, metres, step, margin, fn, { lazy = false } = {}) {
  const i0 = Math.floor(originE / step) - margin;
  const j0 = Math.floor(originN / step) - margin;
  const n = Math.ceil(metres / step) + 2 * margin + 2;
  const f = new Float32Array(n * n);
  if (lazy) f.fill(NaN);
  else {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) f[j * n + i] = fn((i0 + i) * step, (j0 + j) * step);
    }
  }
  return { f, n, step, i0, j0, fn };
}

/**
 * A lazy lattice at (e, n), bilinear, computing any corner not yet known.
 *
 * For the fields only one soil reads — the cracks in bare earth, the pools in
 * a marsh — which a chunk needs over a corner of its area, if at all. Filling
 * the whole lattice up front was most of the cost of preparing a chunk.
 */
function sampleLazy(L, e, n) {
  const u = e / L.step - L.i0;
  const v = n / L.step - L.j0;
  let iu = Math.floor(u);
  let iv = Math.floor(v);
  const tu = u - iu;
  const tv = v - iv;
  if (iu < 0) iu = 0;
  else if (iu > L.n - 2) iu = L.n - 2;
  if (iv < 0) iv = 0;
  else if (iv > L.n - 2) iv = L.n - 2;
  const k = iv * L.n + iu;
  const f = L.f;
  // NaN is the only value not equal to itself: "not computed yet".
  if (f[k] !== f[k]) f[k] = L.fn((L.i0 + iu) * L.step, (L.j0 + iv) * L.step);
  if (f[k + 1] !== f[k + 1]) f[k + 1] = L.fn((L.i0 + iu + 1) * L.step, (L.j0 + iv) * L.step);
  if (f[k + L.n] !== f[k + L.n]) f[k + L.n] = L.fn((L.i0 + iu) * L.step, (L.j0 + iv + 1) * L.step);
  if (f[k + L.n + 1] !== f[k + L.n + 1]) f[k + L.n + 1] = L.fn((L.i0 + iu + 1) * L.step, (L.j0 + iv + 1) * L.step);
  const a = f[k] + (f[k + 1] - f[k]) * tu;
  const b = f[k + L.n] + (f[k + L.n + 1] - f[k + L.n]) * tu;
  return a + (b - a) * tv;
}

/** A lattice at world position (e, n), bilinear. */
function sampleLin(L, e, n) {
  const u = e / L.step - L.i0;
  const v = n / L.step - L.j0;
  let iu = Math.floor(u);
  let iv = Math.floor(v);
  const tu = u - iu;
  const tv = v - iv;
  if (iu < 0) iu = 0;
  else if (iu > L.n - 2) iu = L.n - 2;
  if (iv < 0) iv = 0;
  else if (iv > L.n - 2) iv = L.n - 2;
  const k = iv * L.n + iu;
  const f = L.f;
  const a = f[k] + (f[k + 1] - f[k]) * tu;
  const b = f[k + L.n] + (f[k + L.n + 1] - f[k + L.n]) * tu;
  return a + (b - a) * tv;
}

/**
 * A whole row of three lattices of the same geometry at once — the border's
 * warp east and north, and the mottle: `count` points from `e0` eastward every
 * `de` metres, at northing `n`.
 *
 * The per-pixel cost of a smooth field is the interpolation, and along a row
 * most of it repeats: the two lattice columns either side do not change for
 * eight pixels at a time. So each lattice cell is set up once and its pixels
 * stepped through — which is what makes four smooth fields per pixel
 * affordable at all. The step is a power of two of a metre, so stepping
 * accumulates no rounding: a pixel's values do not depend on where along the
 * row the stepping started, which is to say on which chunk painted it.
 */
function sampleRows3(A, B, Cl, n, e0, de, count, outA, outB, outC) {
  const N = A.n;
  const inv = 1 / A.step;
  const v = n * inv - A.j0;
  let iv = Math.floor(v);
  if (iv < 0) iv = 0;
  else if (iv > N - 2) iv = N - 2;
  const tv = v - iv;
  const fa = A.f;
  const fb = B.f;
  const fc = Cl.f;
  const r0 = iv * N;
  const du = de * inv;
  let u = e0 * inv - A.i0;
  let px = 0;
  while (px < count) {
    let iu = Math.floor(u);
    if (iu < 0) iu = 0;
    else if (iu > N - 2) iu = N - 2;
    const k = r0 + iu;
    const a0 = fa[k] + (fa[k + N] - fa[k]) * tv;
    const ad = fa[k + 1] + (fa[k + N + 1] - fa[k + 1]) * tv - a0;
    const b0 = fb[k] + (fb[k + N] - fb[k]) * tv;
    const bd = fb[k + 1] + (fb[k + N + 1] - fb[k + 1]) * tv - b0;
    const c0 = fc[k] + (fc[k + N] - fc[k]) * tv;
    const cd = fc[k + 1] + (fc[k + N + 1] - fc[k + 1]) * tv - c0;
    const next = iu + 1;
    do {
      const t = u - iu;
      outA[px] = a0 + ad * t;
      outB[px] = b0 + bd * t;
      outC[px] = c0 + cd * t;
      px++;
      u += du;
    } while (px < count && u < next);
  }
}

/**
 * The same with smoothstep weights, for a lattice coarse enough that straight
 * interpolation would show its corners — and mapped through `lo + span * v`
 * on the way out, so a brightness field arrives as the factor it is used as.
 */
function sampleRowSmooth(L, n, e0, de, count, out, lo, span) {
  const N = L.n;
  const inv = 1 / L.step;
  const v = n * inv - L.j0;
  let iv = Math.floor(v);
  if (iv < 0) iv = 0;
  else if (iv > N - 2) iv = N - 2;
  let tv = v - iv;
  tv = tv * tv * (3 - 2 * tv);
  const f = L.f;
  const r0 = iv * N;
  const du = de * inv;
  let u = e0 * inv - L.i0;
  let px = 0;
  while (px < count) {
    let iu = Math.floor(u);
    if (iu < 0) iu = 0;
    else if (iu > N - 2) iu = N - 2;
    const k = r0 + iu;
    const a = f[k] + (f[k + N] - f[k]) * tv;
    const d = f[k + 1] + (f[k + N + 1] - f[k + 1]) * tv - a;
    const next = iu + 1;
    do {
      const t = u - iu;
      out[px++] = lo + span * (a + d * t * t * (3 - 2 * t));
      u += du;
    } while (px < count && u < next);
  }
}

/**
 * A smooth low-frequency brightness field, one sample every 2 m, in [0, 1].
 *
 * Real ground is lighter here and darker there over ten-metre scales. This
 * used to be sampled with its rows counting NORTH while the painter read them
 * counting SOUTH, so every chunk was mirrored about its own middle and the
 * brightness jumped by up to 11% across each north–south chunk border: a line
 * across the valley every 32 m. On a world-anchored lattice it cannot.
 */
export function shadeField(originE, originN, metres, step = 2) {
  return lattice(originE, originN, metres, step, 2, (e, n) => {
    const I = Math.round(e / step);
    const J = Math.round(n / step);
    // Two octaves: broad regions, plus a little break-up inside them.
    return hash2(I, J, 31) * 0.68 + hash2(I * 2 + 1, J * 2 + 1, 37) * 0.32;
  });
}

/**
 * Two octaves of a noise field, largest feature `scale` metres: exactly
 * `noise.fbm(e, n, {scale, octaves: 2})`, without the options object, which
 * tens of thousands of calls a chunk turn into that many allocations.
 */
function fbm2(noise, e, n, scale) {
  const f = 1 / scale;
  return (noise.at(e * f, n * f) + noise.at(e * f * 2, n * f * 2) * 0.5) / 1.5;
}

/**
 * Everything one chunk's painters share, computed once per chunk: the shore
 * distance, the smooth fields, and which cells sit in the middle of a single
 * soil (most of them), where a pixel needs no blending at all.
 *
 * With `deferred`, nothing is computed yet: the result carries `work`, a list
 * of steps of a millisecond or so each, for a budgeted baker to run one at a
 * time. Run them all before painting with it.
 */
export function groundFields(grid, gridSize, originE, originN, metres, edges = null, shade = null, { deferred = false } = {}) {
  const present = new Uint8Array(NCLASS);
  for (let i = 0; i < grid.length; i++) present[grid[i]] = 1;

  const F = {
    originE,
    originN,
    metres,
    grid,
    gridSize,
    uniform: null,
    edges,
    shade: shade || shadeField(originE, originN, metres),
    warpE: null,
    warpN: null,
    mottle: null,
    pools: null,
    cracks: null,
    slabs: null,
    // A chunk inside one 64 m ploughing block (every 32 m chunk is) knows its
    // furrows' direction once, rather than hashing for it at every pixel.
    plough:
      Math.floor(originE / 64) === Math.floor((originE + metres) / 64 - 1e-9) &&
      Math.floor(originN / 64) === Math.floor((originN + metres) / 64 - 1e-9)
        ? ploughedVertically(originE, originN)
        : null,
    work: null,
  };
  // Lattice spacing follows the feature size: half a metre for fields whose
  // smallest wiggle is a metre or more, a quarter for the cracks, which are
  // drawn as a thin line along one level of their field and would come out
  // as straight segments on anything coarser.
  const work = [
    () => {
      F.uniform = uniformCells(grid, gridSize);
      if (!F.edges) F.edges = edgeField(grid, gridSize);
    },
    () => (F.warpE = lattice(originE, originN, metres, 0.5, 3, (e, n) => fbm2(WARP_E, e, n, WARP_SCALE) * WARP_AMP)),
    () => (F.warpN = lattice(originE, originN, metres, 0.5, 3, (e, n) => fbm2(WARP_N, e, n, WARP_SCALE) * WARP_AMP)),
    // The same spacing and margin as the warp, so a row of all three can be
    // interpolated in one pass (`sampleRows3`).
    () => (F.mottle = lattice(originE, originN, metres, 0.5, 3, (e, n) => fbm2(MOTTLE, e, n, 3.2))),
  ];
  // Only their own soil reads these, so they fill in as it asks.
  if (present[C.BREJO]) F.pools = lattice(originE, originN, metres, 0.5, 2, (e, n) => fbm2(POOLS, e, n, 2.6), { lazy: true });
  if (present[C.SOLO_EXPOSTO]) F.cracks = lattice(originE, originN, metres, 0.25, 2, (e, n) => fbm2(CRACKS, e, n, 1.3), { lazy: true });
  if (present[C.ROCHA]) work.push(() => (F.slabs = slabPoints(originE, originN, metres)));

  if (deferred) F.work = work;
  else for (const step of work) step();
  return F;
}

/**
 * Which cells have a 3x3 neighbourhood all of one soil. A pixel there takes
 * that soil whole and skips the blend: away from borders, which is most of
 * the valley.
 */
function uniformCells(grid, size) {
  const uniform = new Uint8Array(size * size);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const c = grid[i];
      uniform[i] =
        grid[i - 1] === c && grid[i + 1] === c &&
        grid[i - size] === c && grid[i + size] === c &&
        grid[i - size - 1] === c && grid[i - size + 1] === c &&
        grid[i + size - 1] === c && grid[i + size + 1] === c ? 1 : 0;
    }
  }
  return uniform;
}

/** Rock slab size, in metres. */
const SLAB = 1.25;

/** One jittered point per `SLAB` cell around a chunk: the centres of the slabs. */
function slabPoints(originE, originN, metres) {
  const i0 = Math.floor(originE / SLAB) - 3;
  const j0 = Math.floor(originN / SLAB) - 3;
  const n = Math.ceil(metres / SLAB) + 7;
  const pe = new Float32Array(n * n);
  const pn = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const I = i0 + i;
      const J = j0 + j;
      pe[j * n + i] = (I + 0.15 + hash2(I, J, 301) * 0.7) * SLAB;
      pn[j * n + i] = (J + 0.15 + hash2(I, J, 303) * 0.7) * SLAB;
    }
  }
  return { pe, pn, n, i0, j0 };
}

// ---- sampling the soil ----------------------------------------------------------

/** Weights per class at one point, reused: the painters never allocate per pixel. */
const ACC = new Float32Array(NCLASS);

/**
 * The quadratic B-spline weights of the 3x3 cells around a continuous cell
 * coordinate, summed per soil class into `ACC`. Returns the class holding the
 * most weight.
 */
function accumulate(F, gx, gy) {
  const size = F.gridSize;
  let ic = Math.round(gx);
  let jc = Math.round(gy);
  if (ic < 1) ic = 1;
  else if (ic > size - 2) ic = size - 2;
  if (jc < 1) jc = 1;
  else if (jc > size - 2) jc = size - 2;
  const tx = gx - ic;
  const ty = gy - jc;
  const wx0 = 0.5 * (0.5 - tx) * (0.5 - tx);
  const wx1 = 0.75 - tx * tx;
  const wx2 = 0.5 * (0.5 + tx) * (0.5 + tx);
  const wy0 = 0.5 * (0.5 - ty) * (0.5 - ty);
  const wy1 = 0.75 - ty * ty;
  const wy2 = 0.5 * (0.5 + ty) * (0.5 + ty);
  for (let c = 0; c < NCLASS; c++) ACC[c] = 0;
  const g = F.grid;
  let k = (jc - 1) * size + ic - 1;
  ACC[g[k]] += wx0 * wy0;
  ACC[g[k + 1]] += wx1 * wy0;
  ACC[g[k + 2]] += wx2 * wy0;
  k += size;
  ACC[g[k]] += wx0 * wy1;
  ACC[g[k + 1]] += wx1 * wy1;
  ACC[g[k + 2]] += wx2 * wy1;
  k += size;
  ACC[g[k]] += wx0 * wy2;
  ACC[g[k + 1]] += wx1 * wy2;
  ACC[g[k + 2]] += wx2 * wy2;
  let best = 0;
  for (let c = 1; c < NCLASS; c++) if (ACC[c] > ACC[best]) best = c;
  return best;
}

/** Continuous cell coordinates (cell centres at integers) of a world point, after the warp. */
function cellCoords(F, e, n, out) {
  const we = e + sampleLin(F.warpE, e, n);
  const wn = n + sampleLin(F.warpN, e, n);
  out[0] = (we - F.originE) * CELLS_PER_M + GRID_BORDER - 0.5;
  out[1] = (wn - F.originN) * CELLS_PER_M + GRID_BORDER - 0.5;
}

/** Signed shore distance at a continuous cell coordinate, bilinear. */
function shoreAt(F, gx, gy) {
  const size = F.gridSize;
  let i = Math.floor(gx);
  let j = Math.floor(gy);
  if (i < 0) i = 0;
  else if (i > size - 2) i = size - 2;
  if (j < 0) j = 0;
  else if (j > size - 2) j = size - 2;
  const tx = Math.min(1, Math.max(0, gx - i));
  const ty = Math.min(1, Math.max(0, gy - j));
  const d = F.edges;
  const k = j * size + i;
  const a = d[k] + (d[k + 1] - d[k]) * tx;
  const b = d[k + size] + (d[k + size + 1] - d[k + size]) * tx;
  return a + (b - a) * ty;
}

const COORD = new Float64Array(2);

/** What the last `probe` found besides the class: its share of the blend, and the shore distance. */
const PROBE = { weight: 0, shore: 0 };

/**
 * The soil index at a world point as the painters see it, without allocating:
 * the detail and crop passes ask this thousands of times a chunk.
 */
function probe(F, e, n) {
  cellCoords(F, e, n, COORD);
  let cls = accumulate(F, COORD[0], COORD[1]);
  const shore = shoreAt(F, COORD[0], COORD[1]);
  // Water and land meet at a line, so the shore distance decides between them.
  if (shore < 0) cls = WATER;
  else if (cls === WATER) {
    let land = -1;
    for (let c = 0; c < NCLASS; c++) if (c !== WATER && (land < 0 || ACC[c] > ACC[land])) land = c;
    cls = land;
  }
  PROBE.shore = shore;
  PROBE.weight = cls === WATER ? 1 : ACC[cls] / Math.max(1e-6, 1 - ACC[WATER]);
  return cls;
}

/**
 * What the ground is at a world point, as the painters see it: the soil there
 * after the border's wander, how much of the blend it holds, every class's
 * share, and how far the water's edge is.
 *
 * The one place the painters' idea of "which soil is this" is written down,
 * so the tufts, the crops and the colour underneath cannot disagree.
 *
 * @returns {{cls:string, weight:number, weights:Object<string,number>, shore:number}}
 */
export function groundSample(F, e, n) {
  const cls = probe(F, e, n);
  const weights = {};
  for (let c = 0; c < NCLASS; c++) if (ACC[c] > 0) weights[CLASS_IDS[c]] = ACC[c];
  return { cls: CLASS_IDS[cls], weight: PROBE.weight, weights, shore: PROBE.shore };
}

// ---- colour ------------------------------------------------------------------------

const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** How hard each soil leans into its mottling. Grass barely; bare earth more. */
const MOTTLE_AMT = { PASTO: 0.32, CAMPO_SUJO: 0.4, SOLO_EXPOSTO: 0.5, LAVOURA: 0.25, AREIA: 0.3, ROCHA: 0.35, BREJO: 0.45, AGUA: 0 };

/** The soils with a pattern of their own on top of the shared mottle and grain. */
const MOTIFS = new Set(['SOLO_EXPOSTO', 'LAVOURA', 'AREIA', 'ROCHA', 'BREJO']);

/**
 * Every tone the per-pixel loop needs, as plain numbers, resolved once.
 *
 * Flat fields rather than little [r, g, b] arrays: this is read for every
 * pixel of every chunk, and each array is one more load and bounds check.
 */
const TEX = CLASS_IDS.map((id) => {
  const g = GROUND[id];
  const [r, gg, b] = rgba(g.base);
  const dark = rgba(g.grain[0]);
  const light = rgba(g.grain[1]);
  const pd = rgba(g.patch[0]);
  const pl = rgba(g.patch[1]);
  return {
    r,
    g: gg,
    b,
    // Grain as an OFFSET from the base, so it rides on top of the mottling
    // instead of punching base-coloured holes through a lighter patch.
    gdr: dark[0] - r,
    gdg: dark[1] - gg,
    gdb: dark[2] - b,
    glr: light[0] - r,
    glg: light[1] - gg,
    glb: light[2] - b,
    pdr: pd[0],
    pdg: pd[1],
    pdb: pd[2],
    plr: pl[0],
    plg: pl[1],
    plb: pl[2],
    pDark: pd,
    pLight: pl,
    mottle: MOTTLE_AMT[id] ?? 0,
    motif: MOTIFS.has(id),
  };
});

const CRACK = rgba(GROUND.SOLO_EXPOSTO.crack);
const FLECK = rgba(P.soil[2]);
const MOSS = rgba(GROUND.ROCHA.moss);
const LICHEN = rgba(GROUND.ROCHA.lichen);
const ROCK_LIT = rgba(P.rock[2]);
const ROCK_DARK = rgba(P.rock[0]);
// Marsh water is murky — greener and browner than the lake, so it reads as a
// puddle in the reeds and is never mistaken for open water.
const POOL_SHALLOW = mixRGB(rgba(P.grassDeep[1]), rgba(P.water[1]), 0.3);
// Greener than blue at its deepest, on purpose and with a margin: the tests
// find water by its blue, and a marsh puddle must never be counted as lake.
const POOL_DEEP = mixRGB(rgba(P.grassDeep[0]), rgba(P.water[1]), 0.28);
const POOL_GLINT = mixRGB(POOL_SHALLOW, rgba(P.foam[1]), 0.35);
const POOL_RIM = mixRGB(rgba(P.earth[0]), rgba(P.grassDeep[0]), 0.5);
const DUCKWEED = rgba(P.leaf[3][1]);
const FOAM = rgba(P.foam[0]);
// Shallows only a little lighter than open water: any paler, and a pond too
// small to have a middle is pale all over and reads as ice.
const SHALLOW = mixRGB(rgba(P.water[1]), rgba(P.water[2]), 0.18);
const MID = rgba(P.water[1]);
const DEEP_WATER = rgba(P.waterDeep[1]);
const RIPPLE = rgba(P.water[2]);

/** One colour, reused, so a pixel's texture is written without allocating. */
const RGB = new Float64Array(3);

function lerpInto(target, t) {
  RGB[0] += (target[0] - RGB[0]) * t;
  RGB[1] += (target[1] - RGB[1]) * t;
  RGB[2] += (target[2] - RGB[2]) * t;
}

/** Is a ploughed field's furrow running north–south here? One answer per 64 m block. */
const ploughedVertically = (e, n) => hash2(Math.floor(e / 64), Math.floor(n / 64), 77) > 0.5;

/** Ploughed rows repeat every 13 art pixels: 0.8 m. */
const ROW_PX = 13;

/**
 * The textured colour of soil `ci` at world pixel (X, Y), world metres (e, n),
 * into `RGB`. `m` is the mottle there, (`we`, `wn`) the border's warp, and
 * `gs` the grain from `grainRow`.
 */
function texture(ci, F, X, Y, e, n, m, we, wn, gs) {
  const T = TEX[ci];
  let r = T.r;
  let g = T.g;
  let b = T.b;

  // Mottling: a lusher hollow, a damp blotch, a mossy shoulder of rock.
  if (m > 0.16) {
    const t = (m > 0.58 ? 1 : (m - 0.16) / 0.42) * T.mottle;
    r += (T.plr - r) * t;
    g += (T.plg - g) * t;
    b += (T.plb - b) * t;
  } else if (m < -0.16) {
    const t = (m < -0.58 ? 1 : (-m - 0.16) / 0.42) * T.mottle;
    r += (T.pdr - r) * t;
    g += (T.pdg - g) * t;
    b += (T.pdb - b) * t;
  }

  if (gs < 0) {
    r += T.gdr;
    g += T.gdg;
    b += T.gdb;
  } else if (gs > 0) {
    r += T.glr;
    g += T.glg;
    b += T.glb;
  }
  RGB[0] = r;
  RGB[1] = g;
  RGB[2] = b;
  if (T.motif) motif(ci, T, F, X, Y, e, n, m, we, wn);
}

/** The pattern particular to a soil, over what `texture` has put in `RGB`. */
function motif(ci, T, F, X, Y, e, n, m, we, wn) {
  switch (ci) {
    case C.SOLO_EXPOSTO: {
      // Dry ground cracks; damp ground does not.
      if (F.cracks && m > -0.12) {
        const c = sampleLazy(F.cracks, e, n);
        if (c < 0.019 && c > -0.019) lerpInto(CRACK, 0.5);
      }
      if (hash2(X, Y, 17) > 0.988) lerpInto(FLECK, 0.7);
      break;
    }
    case C.LAVOURA: {
      // Ridges along the rows: a dark trough, a lit crest. The rows wander by
      // a pixel or two with the border field, because nobody ploughs with a
      // laser.
      const vertical = F.plough ?? ploughedVertically(e, n);
      const q = (vertical ? X : Y) + Math.round((vertical ? we : wn) * 5);
      // A literal 13 (ROW_PX), not the constant: the engine turns a division
      // by a literal into a multiply, and this runs for every pixel of a field.
      let r = q % 13;
      if (r < 0) r += 13;
      if (r < 2) lerpInto(T.pDark, 0.55);
      else if (r < 4) lerpInto(T.pDark, 0.22);
      else if (r >= 9 && r < 11) lerpInto(T.pLight, 0.4);
      break;
    }
    case C.AREIA: {
      // Wind ripples: one prevailing wind across the whole valley, bent by the
      // same field that bends the borders.
      const ph = (e * 0.93 + n * 0.37 + we * 1.6) / 0.42;
      const f = ph - Math.floor(ph);
      if (f < 0.1) lerpInto(T.pLight, 0.5);
      else if (f > 0.5 && f < 0.6) lerpInto(T.pDark, 0.22);
      break;
    }
    case C.ROCHA: {
      // Through the border's warp, so a fissure wanders like one.
      if (F.slabs) slab(F.slabs, e + we * 0.8, n + wn * 0.8);
      // Moss where the mottling is high, in crumbs; a fleck of lichen here and there.
      if (m > 0.3 && hash2(X >> 1, Y >> 1, 41) < (m - 0.3) * 1.7) lerpInto(MOSS, 0.75);
      else if (hash2(X, Y, 43) > 0.994) lerpInto(LICHEN, 0.8);
      break;
    }
    case C.BREJO: {
      if (F.pools) {
        const p = sampleLazy(F.pools, e, n) + m * 0.15;
        if (p > 0.36) {
          // Deeper toward the middle; duckweed on the still edges, in crumbs.
          let t = Math.min(1, (p - 0.36) / 0.16);
          t = t * t * (3 - 2 * t);
          RGB[0] = POOL_SHALLOW[0] + (POOL_DEEP[0] - POOL_SHALLOW[0]) * t;
          RGB[1] = POOL_SHALLOW[1] + (POOL_DEEP[1] - POOL_SHALLOW[1]) * t;
          RGB[2] = POOL_SHALLOW[2] + (POOL_DEEP[2] - POOL_SHALLOW[2]) * t;
          if (t < 0.5 && hash2(X >> 1, Y >> 1, 61) < 0.3 * (1 - 2 * t)) lerpInto(DUCKWEED, 0.8);
          else if (hash2(X, Y, 59) > 0.985) lerpInto(POOL_GLINT, 1);
        } else if (p > 0.31) lerpInto(POOL_RIM, 0.5 * ((p - 0.31) / 0.05));
      }
      break;
    }
    default:
      break;
  }
}

/**
 * A rock slab's face at (e, n): each slab a shade lighter or darker than its
 * neighbours, and between some of them a fissure — a dark crack with a lit
 * lip on the side facing the light, from the upper left.
 *
 * SOME of them: a crack between every pair of slabs is crazy paving, which is
 * exactly what the first version of this looked like. Weathered rock has a
 * network of fissures that runs, forks and stops.
 */
function slab(S, e, n) {
  const ci = Math.floor(e / SLAB) - S.i0;
  const cj = Math.floor(n / SLAB) - S.j0;
  let d1 = Infinity;
  let d2 = Infinity;
  let k1 = -1;
  let k2 = -1;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || j < 0 || i >= S.n || j >= S.n) continue;
      const k = j * S.n + i;
      const de = S.pe[k] - e;
      const dn = S.pn[k] - n;
      const dd = de * de + dn * dn;
      if (dd < d1) {
        d2 = d1;
        k2 = k1;
        d1 = dd;
        k1 = k;
      } else if (dd < d2) {
        d2 = dd;
        k2 = k;
      }
    }
  }
  if (k1 < 0) return;
  // World-anchored identities, so a slab is the same slab to every chunk.
  const id1 = (S.i0 + (k1 % S.n)) * 4096 + (S.j0 + Math.floor(k1 / S.n));
  const tone = hash2(id1, 0, 307);
  if (tone > 0.72) lerpInto(ROCK_LIT, 0.14);
  else if (tone < 0.28) lerpInto(ROCK_DARK, 0.12);
  if (k2 < 0) return;
  const id2 = (S.i0 + (k2 % S.n)) * 4096 + (S.j0 + Math.floor(k2 / S.n));
  if (hash2(Math.min(id1, id2), Math.max(id1, id2), 311) < 0.42) return;

  const gap = Math.sqrt(d2) - Math.sqrt(d1);
  if (gap < 0.05) {
    lerpInto(ROCK_DARK, 0.62);
  } else if (gap < 0.13) {
    // Which way this edge faces: from the slab's centre out to the pixel.
    const face = (n - S.pn[k1]) - (e - S.pe[k1]); // up and to the left is positive
    if (face > 0.05) lerpInto(ROCK_LIT, 0.4);
    else if (face < -0.05) lerpInto(ROCK_DARK, 0.2);
  }
}

/** The colour of water `depth` metres out from its edge, at world pixel (X, Y), into `RGB`. */
/** Width of the foam lip, in metres: two pixels. */
const LIP = 0.13;

function water(depth, X, Y, m) {
  if (depth < LIP) {
    // The lip: shallows broken by foam, in crumbs rather than single pixels.
    const c = hash2(X >> 1, Y, 71) > 0.5 ? FOAM : SHALLOW;
    RGB[0] = c[0];
    RGB[1] = c[1];
    RGB[2] = c[2];
    return;
  }
  let a;
  let b;
  let t;
  if (depth < 1.1) {
    a = SHALLOW;
    b = MID;
    t = (depth - LIP) / (1.1 - LIP);
  } else {
    a = MID;
    b = DEEP_WATER;
    t = Math.min(1, (depth - 1.1) / (DEEP - 1.1));
  }
  t = t * t * (3 - 2 * t);
  RGB[0] = a[0] + (b[0] - a[0]) * t;
  RGB[1] = a[1] + (b[1] - a[1]) * t;
  RGB[2] = a[2] + (b[2] - a[2]) * t;
  // Deep water is not one flat colour either.
  if (depth > 1.5) {
    const k = 1 + m * 0.06;
    RGB[0] *= k;
    RGB[1] *= k;
    RGB[2] *= k;
  }
  // Ripples: short level dashes of light, never a grid of them.
  if (depth > 0.6 && (X & 3) !== 3 && hash2(X >> 2, Y, 211) > 0.991) lerpInto(RIPPLE, 0.65);
}

/** Is this machine little-endian? Decides the byte order of a packed pixel. */
const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/**
 * A channel value to a byte. Never negative here — every tone in the palette
 * is well clear of black, and nothing subtracts more than it adds — so only
 * the top needs clamping.
 */
const byte = (v) => {
  const b = (v + 0.5) | 0;
  return b > 255 ? 255 : b;
};

/**
 * An opaque pixel as one 32-bit word, in the byte order RGBA lands in memory.
 * Signed on purpose: an unsigned word above 2^31 is a double to the engine.
 */
function packRGB(r, g, b) {
  return LITTLE
    ? (255 << 24) | (byte(b) << 16) | (byte(g) << 8) | byte(r)
    : (byte(r) << 24) | (byte(g) << 16) | (byte(b) << 8) | 255;
}

/** One row of each smooth field, reused from row to row. */
let ROW_WE = new Float32Array(0);
let ROW_WN = ROW_WE;
let ROW_M = ROW_WE;
let ROW_K = ROW_WE;
let ROW_G = new Int8Array(0);

/**
 * Paint one chunk's base ground.
 *
 * @param {Uint8ClampedArray} out   RGBA, `metres*pxPerM` square
 * @param {Uint8Array} grid         from `classGrid`
 * @param {number} rowStart, rowEnd rows of the OUTPUT to paint, for slicing the
 *                                  work across frames
 * @param {object} [shade]          from `shadeField`
 * @param {Float32Array} [edges]    from `edgeField`
 * @param {object} [fields]         from `groundFields`, which a bake makes once
 *                                  and every slice shares
 */
export function paintBase(out, grid, gridSize, originE, originN, metres, pxPerM, rowStart, rowEnd, shade, edges, fields) {
  const F = fields || groundFields(grid, gridSize, originE, originN, metres, edges, shade);
  const W = metres * pxPerM;
  const inv = 1 / pxPerM;
  // The world pixel of the chunk's west column and its north row. Y counts
  // northward, as the world does; canvas rows count the other way.
  const X0 = Math.round(originE * pxPerM);
  const Ytop = Math.round((originN + metres) * pxPerM) - 1;
  const size = gridSize;
  const uniform = F.uniform;
  const near = F.edges;
  const e0 = originE + 0.5 * inv;
  // Cell coordinates have cell centres on the integers.
  const gOff = GRID_BORDER - 0.5;
  // One 32-bit write per pixel instead of four clamped byte writes, which
  // measured as the single most expensive line in the loop.
  const out32 = new Int32Array(out.buffer, out.byteOffset, out.length >> 2);
  if (ROW_WE.length < W) {
    ROW_WE = new Float32Array(W);
    ROW_WN = new Float32Array(W);
    ROW_M = new Float32Array(W);
    ROW_K = new Float32Array(W);
    ROW_G = new Int8Array(W);
  }
  // Locals, not the module's bindings: a module-level `let` is reloaded and
  // checked on every access, and these are read for every pixel.
  const rowWE = ROW_WE;
  const rowWN = ROW_WN;
  const rowM = ROW_M;
  const rowK = ROW_K;
  const rowG = ROW_G;
  const acc = ACC;
  const rgb = RGB;

  for (let py = rowStart; py < rowEnd; py++) {
    const n = originN + metres - (py + 0.5) * inv;
    const Y = Ytop - py;
    sampleRows3(F.warpE, F.warpN, F.mottle, n, e0, inv, W, rowWE, rowWN, rowM);
    // +-7% over ten-metre scales: enough to see as regions of ground, not
    // enough to read as a stain.
    sampleRowSmooth(F.shade, n, e0, inv, W, rowK, 0.93, 0.14);
    grainRow(X0, Y, W, rowG);
    const gyRow = (n - originN) * CELLS_PER_M + gOff;

    for (let px = 0; px < W; px++) {
      const e = e0 + px * inv;
      const X = X0 + px;
      const m = rowM[px];
      const we = rowWE[px];
      const wn = rowWN[px];
      const gs = rowG[px];
      const gx = (e + we - originE) * CELLS_PER_M + gOff;
      const gy = gyRow + wn * CELLS_PER_M;
      // Rounding by truncation: both are positive wherever it matters, and
      // anything below 1 is clamped to 1 anyway.
      let ic = (gx + 0.5) | 0;
      let jc = (gy + 0.5) | 0;
      if (ic < 1) ic = 1;
      else if (ic > size - 2) ic = size - 2;
      if (jc < 1) jc = 1;
      else if (jc > size - 2) jc = size - 2;
      const cidx = jc * size + ic;

      let r = 0;
      let g = 0;
      let b = 0;
      const d0 = near[cidx];
      // 1.6 m, not the 1.2 m the damp bank reaches: the pixel can sit a cell's
      // diagonal (0.35 m) nearer the water than the centre of its cell.
      if (uniform[cidx] && d0 > 1.6) {
        // The middle of one soil: most of the valley, and the fast path.
        texture(grid[cidx], F, X, Y, e, n, m, we, wn, gs);
        r = rgb[0];
        g = rgb[1];
        b = rgb[2];
      } else {
        // Far out on a lake the depth has long stopped changing, and the
        // cell's own value is as good as interpolating it.
        const shore = d0 > -4 ? shoreAt(F, gx, gy) : d0;
        if (shore < 0) {
          water(-shore, X, Y, m);
          r = rgb[0];
          g = rgb[1];
          b = rgb[2];
        } else if (uniform[cidx]) {
          // One soil, but near enough the water for the bank to be damp.
          texture(grid[cidx], F, X, Y, e, n, m, we, wn, gs);
          r = rgb[0];
          g = rgb[1];
          b = rgb[2];
          if (shore < 1.2) {
            const t = shore / 1.2;
            const k = 0.76 + 0.24 * t * t * (3 - 2 * t);
            r *= k;
            g *= k * 1.01;
            b *= k * 0.97;
          }
        } else {
          accumulate(F, gx, gy);
          // Land only: whatever weight the water held is shared out among
          // the soils on this side of the waterline.
          acc[WATER] = 0;
          // A little roughness in the blend, so a border is a soft band of
          // ground and not an airbrushed gradient: each soil's share is
          // scaled by 0.8-1.2, from four bits apiece of one hash. A sliver of
          // a soil in the corner of the kernel is dropped rather than
          // textured for a twentieth of a pixel.
          const h = bits(X, Y, 90);
          let total = 0;
          for (let c = 0; c < NCLASS; c++) {
            if (acc[c] < 0.04) {
              acc[c] = 0;
              continue;
            }
            acc[c] *= 0.8 + 0.4 * (((h >>> (c << 2)) & 15) / 15);
            total += acc[c];
          }
          for (let c = 0; c < NCLASS; c++) {
            if (acc[c] === 0) continue;
            const w = acc[c] / total;
            texture(c, F, X, Y, e, n, m, we, wn, gs);
            r += rgb[0] * w;
            g += rgb[1] * w;
            b += rgb[2] * w;
          }
          // The first metre of a bank is damp, fading as it climbs away.
          if (shore < 1.2) {
            const t = shore / 1.2;
            const k = 0.76 + 0.24 * t * t * (3 - 2 * t);
            r *= k;
            g *= k * 1.01;
            b *= k * 0.97;
          }
        }
      }

      const k = rowK[px];
      out32[py * W + px] = packRGB(r * k, g * k, b * k);
    }
  }
}

/**
 * Blit one sprite buffer into the chunk, clipped.
 * Anchored bottom-centre, like everything else that stands on the ground.
 */
function stamp(out, W, H, pix, cx, by) {
  const x0 = Math.round(cx - pix.w / 2);
  const y0 = Math.round(by - pix.h);
  for (let y = 0; y < pix.h; y++) {
    const ty = y0 + y;
    if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < pix.w; x++) {
      const tx = x0 + x;
      if (tx < 0 || tx >= W) continue;
      const si = (y * pix.w + x) * 4;
      const a = pix.data[si + 3];
      if (a === 0) continue;
      const o = (ty * W + tx) * 4;
      if (a === 255) {
        out[o] = pix.data[si];
        out[o + 1] = pix.data[si + 1];
        out[o + 2] = pix.data[si + 2];
      } else {
        const sa = a / 255;
        out[o] = pix.data[si] * sa + out[o] * (1 - sa);
        out[o + 1] = pix.data[si + 1] * sa + out[o + 1] * (1 - sa);
        out[o + 2] = pix.data[si + 2] * sa + out[o + 2] * (1 - sa);
      }
      out[o + 3] = 255;
    }
  }
}

/** Candidate spacing for scattered detail, in metres. */
const STEP = 0.6;
/** How far outside a chunk a candidate can stand and still reach into it. */
const REACH = 1.2;

/** Candidate rows a chunk spans, so the baker knows how many slices there are. */
export const detailRows = (metres) => Math.ceil((metres + 2 * REACH) / STEP) + 2;

/**
 * Patches of things that grow in patches, as a weight in a smooth field.
 *
 * This used to be a hash per 7 m square, which is exactly what it looked
 * like: reed beds and stone heaps with straight edges, lined up on a grid. A
 * smooth field gives them the outline of something that grew.
 */
export const clumpAt = (e, n) => fbm2(CLUMPS, e, n, 4.5);

/** The three patch fields: the one field, read at three places far apart. */
const PATCH_OFFSET = [
  [0, 0],
  [211.7, -97.3],
  [-151.1, 303.9],
];
const PATCH = new Float64Array(3);

/**
 * Scatter ground cover over a chunk.
 *
 * Candidates sit on a jittered grid rather than a Poisson disc: the same
 * "natural but not clumped" result for a fraction of the work. The grid is the
 * WORLD's, not the chunk's — a tuft standing on a chunk's edge is the same
 * tuft to both chunks, painted half by each, where a chunk-local grid gave the
 * two halves to two different tufts.
 */
export function paintDetail(out, grid, gridSize, originE, originN, metres, pxPerM, sprites, jStart, jEnd, fields) {
  const F = fields || groundFields(grid, gridSize, originE, originN, metres);
  const W = metres * pxPerM;
  const H = W;
  const I0 = Math.floor((originE - REACH) / STEP);
  const I1 = Math.ceil((originE + metres + REACH) / STEP);
  const J0 = Math.floor((originN - REACH) / STEP);
  const rows = detailRows(metres);
  const j0 = jStart ?? 0;
  const j1 = Math.min(rows - 1, jEnd ?? rows - 1);

  for (let j = j0; j <= j1; j++) {
    const J = J0 + j;
    for (let I = I0; I <= I1; I++) {
      const we = (I + hash2(I, J, 101)) * STEP;
      const wn = (J + hash2(I, J, 103)) * STEP;
      if (wn < originN - REACH || wn > originN + metres + REACH) continue;

      const cls = probe(F, we, wn);
      const wants = DETAIL_BY_INDEX[cls];
      if (!wants) continue;
      // Thin out toward a border: grass gives way to dirt over a few tufts,
      // not at a line.
      if (hash2(I, J, 113) > PROBE.weight * PROBE.weight) continue;
      const shore = PROBE.shore;

      const roll = hash2(I, J, 107);
      // The patch fields are evaluated only if something here asks for them.
      PATCH[0] = PATCH[1] = PATCH[2] = NaN;
      let acc = 0;
      let chosen = null;
      for (const [kind, perM2, clumping] of wants) {
        let k = 1;
        if (clumping) {
          const f = clumping[2];
          if (PATCH[f] !== PATCH[f]) PATCH[f] = clumpAt(we + PATCH_OFFSET[f][0], wn + PATCH_OFFSET[f][1]);
          k = PATCH[f] > 0.3 ? clumping[0] : clumping[1];
        }
        acc += perM2 * STEP * STEP * k;
        if (roll < acc) {
          chosen = kind;
          break;
        }
      }
      if (!chosen) continue;
      // A lily pad floats on still water: never against the bank, never far out.
      if (chosen === 'lilypad' && (shore > -0.8 || shore < -DEEP)) continue;

      const bank = sprites[chosen];
      if (!bank || !bank.length) continue;
      const pix = bank[Math.floor(hash2(I, J, 109) * bank.length) % bank.length];

      const px = (we - originE) * pxPerM;
      const py = (metres - (wn - originN)) * pxPerM;
      // Flat things are centred on their spot; standing things stand on it.
      stamp(out, W, H, pix, px, chosen === 'lilypad' ? py + pix.h / 2 : py);
    }
  }
}

/**
 * Crops along the ridges of a ploughed field. The ridges themselves are part
 * of the ground's texture; this plants the crest of each one.
 *
 * World-anchored like everything else, and thinned toward the field's edge so
 * a crop field fades into the pasture around it rather than stopping dead.
 */
export function paintFurrows(out, grid, gridSize, originE, originN, metres, pxPerM, sprites, fields) {
  const bank = sprites.crop;
  if (!bank || !bank.length) return;
  const F = fields || groundFields(grid, gridSize, originE, originN, metres);
  if (!F.grid.includes(C.LAVOURA)) return;

  const W = metres * pxPerM;
  const X0 = Math.round(originE * pxPerM);
  const Ytop = Math.round((originN + metres) * pxPerM) - 1;
  const along = Math.round(0.62 * pxPerM);
  const margin = Math.round(REACH * pxPerM);

  for (const vertical of [true, false]) {
    // Rows across the chunk, on the world's row grid: the crest is at 9.5 px.
    const span0 = vertical ? X0 - margin : Ytop - W - margin;
    const span1 = vertical ? X0 + W + margin : Ytop + margin;
    const first = Math.floor((span0 - 9) / ROW_PX) * ROW_PX + 9;
    for (let q = first; q <= span1; q += ROW_PX) {
      const startA = vertical ? Ytop - W - margin : X0 - margin;
      const firstA = Math.floor(startA / along) * along;
      for (let a = firstA; a <= startA + W + 2 * margin; a += along) {
        const X = vertical ? q : a;
        const Y = vertical ? a : q;
        const e = (X + 0.5) / pxPerM;
        const n = (Y + 0.5) / pxPerM;
        if (ploughedVertically(e, n) !== vertical) continue;
        if (probe(F, e, n) !== C.LAVOURA) continue;
        const h = hash2(X, Y, 131);
        // Gaps, so the rows are not machine-perfect, and fewer toward the edge.
        if (h > 0.82 || hash2(X, Y, 133) > (PROBE.weight - 0.35) * 2) continue;
        const pix = bank[Math.floor(hash2(X, Y, 137) * bank.length) % bank.length];
        // The ridge wanders with the warp field (see `texture`); so does its crop.
        const wobble = Math.round(sampleLin(vertical ? F.warpE : F.warpN, e, n) * 5);
        if (vertical) stamp(out, W, W, pix, X - wobble - X0 + 0.5 + (h - 0.5) * 3, Ytop - Y + 2);
        else stamp(out, W, W, pix, X - X0 + (h - 0.5) * 3, Ytop - (Y - wobble) + 2);
      }
    }
  }
}
