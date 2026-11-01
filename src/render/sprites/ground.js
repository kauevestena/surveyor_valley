// Ground cover.
//
// These are the small things — blades, pebbles, flowers, reeds — that get baked
// straight into the terrain chunks rather than drawn as entities. That is the
// whole trick behind the density: a screen can carry ten thousand tufts of
// grass because none of them costs a draw call, only the twenty chunk blits do.
//
// They are mostly drawn WITHOUT an outline. An outline on a 6-pixel tuft turns
// a field into visual static; outlines are for things that stand up.

import { makePix, P } from './shared.js';

/** A clump of grass blades. The single most repeated shape in the game. */
export function grassTuft(rng, { tall = false, dry = false } = {}) {
  const W = 12;
  const H = tall ? 13 : 9;
  const pix = makePix(W, H);
  const ramp = dry ? P.grassDry : P.grass;
  const baseY = H - 1;
  const cx = W / 2;

  const blades = rng.int(4, 6);
  for (let i = 0; i < blades; i++) {
    const lean = rng.range(-3, 3);
    const len = rng.range(tall ? 6 : 4, tall ? 11 : 7);
    const x0 = cx + rng.range(-2.5, 2.5);
    const shade = i % 2 === 0 ? ramp[2] : ramp[0];
    // A blade curves: it leaves the ground upright and falls away at the tip.
    for (let s = 0; s <= len; s++) {
      const k = s / len;
      pix.px(Math.round(x0 + lean * k * k), Math.round(baseY - s), shade);
    }
  }
  return { pix, anchorX: 0.5, anchorY: 1 };
}

/** A denser hummock, for the rough grazing. */
export function tussock(rng) {
  const W = 14;
  const H = 12;
  const pix = makePix(W, H);
  const cx = W / 2;
  const baseY = H - 1;

  pix.blob(cx, baseY - 3, 6, 3.2, P.grassDry[0], rng, { wobble: 0.3 });
  for (let i = 0; i < 9; i++) {
    const x0 = cx + rng.range(-5, 5);
    const len = rng.range(4, 9);
    const lean = rng.range(-3, 3);
    const shade = i % 3 === 0 ? P.grassDry[2] : i % 3 === 1 ? P.grassDry[1] : P.grass[0];
    for (let s = 0; s <= len; s++) {
      const k = s / len;
      pix.px(Math.round(x0 + lean * k * k), Math.round(baseY - 2 - s), shade);
    }
  }
  return { pix, anchorX: 0.5, anchorY: 1 };
}

/** A wildflower. Rare enough to be a small event when you walk past one. */
export function flower(rng, variant = 0) {
  const W = 7;
  const H = 9;
  const pix = makePix(W, H);
  const cx = W / 2;
  const baseY = H - 1;
  const petal = P.flower[variant % P.flower.length];

  const h = rng.int(4, 6);
  for (let s = 0; s <= h; s++) pix.px(cx, baseY - s, P.grassDeep[1]);
  // A leaf on the stem.
  pix.px(cx - 1, baseY - 2, P.grassDeep[2]);

  const cy = baseY - h - 1;
  pix.px(cx, cy, petal[2]);
  pix.px(cx - 1, cy, petal[1]);
  pix.px(cx + 1, cy, petal[1]);
  pix.px(cx, cy - 1, petal[1]);
  pix.px(cx, cy + 1, petal[0]);
  if (rng.chance(0.5)) {
    pix.px(cx - 1, cy - 1, petal[0]);
    pix.px(cx + 1, cy + 1, petal[0]);
  }
  return { pix, anchorX: 0.5, anchorY: 1 };
}

/**
 * A pebble. Three pixels of nothing that stop bare soil looking like paper.
 *
 * Grey on rock, a warm grey everywhere else. These used to pick the soil ramp
 * half the time, which on bare earth is invisible and on a grey outcrop is an
 * orange dot — the rock read as concrete sprinkled with rust. The one-pixel
 * shadow down and to the right is what makes it sit on the ground instead of
 * being printed on it.
 */
export function pebble(rng, { grey = false } = {}) {
  const W = 6;
  const H = 5;
  const pix = makePix(W, H);
  const ramp = grey ? P.rock : P.pebble;
  const rx = rng.range(1.1, 2.1);
  const ry = rng.range(0.8, 1.3);
  const cx = W / 2 - 0.5;
  const cy = H - 2.2;
  pix.ellipse(cx + 1, cy + 1, rx, ry, P.shadow, 0.32);
  pix.ellipse(cx, cy, rx, ry, ramp[1]);
  pix.px(Math.round(cx - rx * 0.45), Math.round(cy - ry * 0.45), ramp[2]);
  return { pix, anchorX: 0.5, anchorY: 1 };
}

/**
 * A lily pad, seen from above and a little to the south, so a round leaf is a
 * flattened disc. A notch to the middle — the one thing that makes it a lily
 * pad rather than a green coin — and a dark line of water under its south
 * edge, so it floats. Some flower.
 */
export function lilypad(rng, { bloom = false, small = false } = {}) {
  const W = 11;
  const H = 8;
  const pix = makePix(W, H);
  const pad = P.leaf[1];
  const rx = small ? rng.range(2.2, 2.8) : rng.range(3.4, 4.4);
  const ry = rx * rng.range(0.52, 0.62);
  const cx = W / 2;
  const cy = H / 2 - 0.3;
  const notch = rng.range(0, Math.PI * 2);

  // The water under the leaf's southern rim, first, so the leaf covers most of it.
  pix.ellipse(cx + 0.4, cy + 1, rx, ry, P.waterDeep[0], 0.55);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      // The notch: a narrow wedge from the rim to the middle.
      let a = Math.atan2(dy, dx) - notch;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (d > 0.18 && Math.abs(a) < 0.34) continue;
      // Lit toward the upper left, as everything in the valley is.
      const lit = -dx - dy;
      const c = d > 0.78 && dy > 0.1 ? pad[0] : lit > 0.75 ? pad[2] : pad[1];
      pix.px(x, y, c);
    }
  }
  // A vein or two from the middle, one shade down: barely there, and enough.
  const vx = Math.round(cx + Math.cos(notch + Math.PI) * rx * 0.55);
  const vy = Math.round(cy + Math.sin(notch + Math.PI) * ry * 0.55);
  if (pix.alphaAt(vx, vy) === 255) pix.px(vx, vy, pad[0], 0.6);

  if (bloom) {
    // Off-centre, and small: a flower the size of the pad would be a hat.
    const petal = P.flower[rng.chance(0.6) ? 0 : 3];
    const fx = Math.round(cx + rng.range(-1.2, 1.2));
    const fy = Math.round(cy - ry * 0.35);
    pix.px(fx - 1, fy, petal[1]);
    pix.px(fx + 1, fy, petal[1]);
    pix.px(fx, fy - 1, petal[2]);
    pix.px(fx, fy + 1, petal[0]);
    pix.px(fx, fy, P.flower[1][2]);
  }
  return { pix, anchorX: 0.5, anchorY: 0.5 };
}

/**
 * A cattail — taboa — at the wet edge of a marsh: a few blades, and one or two
 * stems carrying the brown velvet head that says "marsh" from across the
 * valley in a way a plain reed cannot.
 */
export function cattail(rng) {
  const W = 9;
  const H = 21;
  const pix = makePix(W, H);
  const cx = W / 2;
  const baseY = H - 1;

  for (let i = 0; i < rng.int(3, 4); i++) {
    const x0 = cx + rng.range(-3, 3);
    const len = rng.range(7, 13);
    const lean = rng.range(-3, 3);
    const shade = i % 2 ? P.grassDeep[1] : P.grassDeep[2];
    for (let s = 0; s <= len; s++) {
      const k = s / len;
      pix.px(Math.round(x0 + lean * k * k), Math.round(baseY - s), shade);
    }
  }
  const heads = rng.chance(0.4) ? 2 : 1;
  for (let i = 0; i < heads; i++) {
    const x = Math.round(cx + (heads === 1 ? rng.range(-0.8, 0.8) : i ? rng.range(1, 2.5) : rng.range(-2.5, -1)));
    const top = Math.round(rng.range(1.5, 4.5));
    // The stem, straight: a cattail stands up even when the blades round it lean.
    for (let y = top; y <= baseY; y++) pix.px(x, y, P.grassDeep[0]);
    // The head: two pixels wide, lit on the west, a pale spike above it.
    const h0 = top + 2;
    for (let y = h0; y < h0 + 4; y++) {
      pix.px(x, y, P.woodDark[1]);
      pix.px(x + 1, y, P.woodDark[0]);
    }
    pix.px(x, h0, P.woodDark[2]);
    pix.px(x, top, P.grassDry[2]);
    pix.px(x, top + 1, P.grassDry[1]);
  }
  return { pix, anchorX: 0.5, anchorY: 1 };
}

/**
 * A loose stone on rocky ground — bigger than a pebble, gets an outline.
 *
 * In two sizes, and some of them weathered darker: a heap of identical pale
 * stones reads as a clutch of eggs.
 */
export function stone(rng, { small = false } = {}) {
  const W = 10;
  const H = 8;
  const pix = makePix(W, H);
  const cx = W / 2;
  const baseY = H - 1;
  const sz = small ? 0.62 : 1;

  const n = rng.int(5, 7);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = rng.range(0.7, 1);
    pts.push([cx + Math.cos(a) * 4 * r * sz, baseY - 2.5 * sz + Math.sin(a) * 2.5 * r * sz]);
  }
  pix.ellipse(cx + 1, baseY - 0.6, 4 * sz, 1.4 * sz, P.shadow, 0.3);
  pix.poly(pts, rng.chance(0.4) ? P.pebble[1] : P.rock[1]);
  pix.poly(
    pts.map(([x, y]) => [x - 1, y - 1]),
    P.rock[2],
  );
  pix.poly(pts.map(([x, y]) => [x + 1.5, y + 1.5]).slice(0, 3).concat([[cx, baseY - 1]]), P.rock[0]);
  pix.outline('auto', { amount: 0.38 });
  return { pix, anchorX: 0.5, anchorY: 1 };
}

/** Marsh reeds. Tall, thin, and unmistakably "do not put a tripod here". */
export function reed(rng) {
  const W = 9;
  const H = 18;
  const pix = makePix(W, H);
  const cx = W / 2;
  const baseY = H - 1;

  for (let i = 0; i < rng.int(3, 5); i++) {
    const x0 = cx + rng.range(-3, 3);
    const len = rng.range(9, 16);
    const lean = rng.range(-2.5, 2.5);
    const shade = i % 2 ? P.grassDeep[1] : P.grassDeep[2];
    let tipX = x0;
    let tipY = baseY;
    for (let s = 0; s <= len; s++) {
      const k = s / len;
      tipX = x0 + lean * k * k;
      tipY = baseY - s;
      pix.px(Math.round(tipX), Math.round(tipY), shade);
    }
    // Seed head.
    if (rng.chance(0.6)) {
      pix.px(Math.round(tipX), Math.round(tipY - 1), P.grassDry[2]);
      pix.px(Math.round(tipX), Math.round(tipY - 2), P.earth[1]);
    }
  }
  return { pix, anchorX: 0.5, anchorY: 1 };
}

/** A clod of turned earth: dark below, catching the light on top. */
export function clod(rng) {
  const W = 6;
  const H = 5;
  const pix = makePix(W, H);
  const rx = rng.range(1.4, 2.4);
  const ry = rng.range(1, 1.6);
  pix.ellipse(W / 2, H - 2, rx, ry, P.earth[0]);
  pix.ellipse(W / 2 - 0.4, H - 2.4, rx * 0.7, ry * 0.6, P.earth[1]);
  pix.px(Math.round(W / 2 - 1), H - 3, P.earth[2]);
  return { pix, anchorX: 0.5, anchorY: 1 };
}

/** A crop plant, for the tilled fields. Rows of these are what read as lavoura. */
export function crop(rng) {
  const W = 9;
  const H = 11;
  const pix = makePix(W, H);
  const cx = W / 2;
  const baseY = H - 1;

  for (let i = 0; i < rng.int(4, 6); i++) {
    const lean = rng.range(-3.2, 3.2);
    const len = rng.range(5, 9);
    const shade = i % 2 ? P.grassDeep[1] : P.grass[1];
    for (let s = 0; s <= len; s++) {
      const k = s / len;
      pix.px(Math.round(cx + lean * k), Math.round(baseY - s * 0.9), shade);
      if (s > len * 0.5) pix.px(Math.round(cx + lean * k) + 1, Math.round(baseY - s * 0.9), shade);
    }
  }
  return { pix, anchorX: 0.5, anchorY: 1 };
}
