// Trees, scrub and stone.
//
// Each of these is a *generator*, not a drawing: `tree(rng)` called forty times
// gives forty trees that are recognisably the same species and visibly
// different individuals. That is the only affordable way to fill a 40-hectare
// valley without it looking stamped.
//
// Size is a discrete parameter, not a render-time scale factor. Entities carry
// a continuous `scale` for collision and sight-line radii, but drawing a
// 16 px/m sprite at 0.83x destroys the pixel grid — so the scene buckets that
// scale and asks for a sprite that was PAINTED at the size it needs.
//
// Light comes from the upper left in every sprite in the game. Consistency
// about that one thing does more for coherence than any amount of detail.

import { makePix, contactShadow, P } from './shared.js';

/** Painted size buckets. The scene maps an entity's `scale` onto these. */
export const SIZES = [0.78, 1.0, 1.24];

/**
 * A pasture tree: about 4.5 m of canopy over 2 m of clear trunk at size 1.
 * @param {object} rng      seeded stream — the same rng gives the same tree
 * @param {number} variant  0-7, picks the leaf ramp and the silhouette
 * @param {number} size     index into SIZES
 */
export function tree(rng, variant = 0, size = 1) {
  const k = SIZES[size] ?? 1;
  const W = Math.round(72 * k);
  const H = Math.round(104 * k);
  const pix = makePix(W, H);
  const leaf = P.leaf[variant % P.leaf.length];
  const cx = W / 2;
  const baseY = H - Math.round(4 * k);

  contactShadow(pix, cx, baseY - 1, 24 * k, 7 * k);

  // Trunk: short and stubby, because the canopy above is about to be wide
  // enough that a tall one reads as a flagpole. Most of it is hidden under
  // the lowest canopy lobes anyway — what shows is a thick stump, not a stem.
  const lean = rng.range(-3, 3) * k;
  const trunkTop = Math.round(58 * k);
  const halfW = rng.range(4.2, 5.8) * k;
  for (let y = trunkTop; y <= baseY; y++) {
    const t = (y - trunkTop) / (baseY - trunkTop);
    // Flares out at the root.
    const wHere = halfW * (1 + t * t * 1.5);
    const x = cx + lean * (1 - t);
    pix.hline(Math.round(x - wHere), Math.round(x + wHere), y, P.trunk[1]);
    pix.hline(Math.round(x - wHere), Math.round(x - wHere + 1), y, P.trunk[2]);
    pix.px(Math.round(x + wHere), y, P.trunk[0]);
  }

  // A couple of bark ticks, enough to read as texture at 1x.
  for (let i = 0; i < 3; i++) {
    const y = Math.round(rng.range(trunkTop + 4 * k, baseY - 4 * k));
    pix.hline(cx - 2, cx + 1, y, P.trunk[0]);
  }

  // Canopy: built from leaf clusters, not shaded regions. Every earlier pass
  // at this used a handful of big blobs to fake a round, shaded mass — and
  // every one of them showed the same failure once actually rendered: a flat
  // colour fill has a hard edge with no antialiasing, so a BIG region of it
  // reads as a seam cutting across the canopy, not as shading. Small regions
  // don't have that problem — a hard edge around something leaf-sized reads
  // as the leaf's own outline. So the whole canopy is packed, ring by ring
  // from the centre out, with three-ish dozen small round leaf clusters
  // instead of a few big lobes. Density (rings overlapping their neighbours)
  // keeps the mass solid; each ring's blobs shrink toward the rim, which is
  // what gives the silhouette its scalloped, leafy edge for free.
  const cy = 42 * k;
  const rx = rng.range(29, 34) * k;
  const ry = rng.range(25, 30) * k;
  // Unit vector the light comes FROM; a cluster's alignment with it decides
  // whether that cluster sits on the lit or the shadowed side of the canopy.
  const lightX = -0.7;
  const lightY = -0.7;

  // Each cluster's tone is a WEIGHTED COIN FLIP biased by light direction,
  // not a threshold on it. A threshold draws one clean line and produces
  // exactly the two-big-regions look this replaced; a biased flip means the
  // lit side is MOSTLY light clusters with dark ones mixed in and vice
  // versa, so neighbouring clusters keep disagreeing with each other — which
  // is what actually reads as individual leaves catching the light
  // differently, rather than two smooth-edged patches of colour.
  function leafTone(dx, dy) {
    const bias = dx * lightX + dy * lightY; // roughly -1 (shadow) .. 1 (lit)
    const pLight = Math.max(0.06, Math.min(0.72, 0.32 + bias * 0.34));
    const pDark = Math.max(0.06, Math.min(0.72, 0.32 - bias * 0.34));
    const roll = rng.range(0, 1);
    if (roll < pLight) return leaf[2];
    if (roll < pLight + pDark) return leaf[0];
    return leaf[1];
  }

  const rings = [
    { rFrac: 0, count: 1, size: [8, 10] },
    { rFrac: 0.26, count: 6, size: [6.5, 8.5] },
    { rFrac: 0.48, count: 8, size: [6, 8] },
    { rFrac: 0.68, count: 11, size: [5.5, 7.5] },
    { rFrac: 0.85, count: 13, size: [5, 6.5] },
    { rFrac: 0.99, count: 15, size: [4, 5.5] },
  ];

  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + rng.range(-0.35, 0.35);
      const r = ring.rFrac + rng.range(-0.04, 0.04);
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r;
      const s = rng.range(ring.size[0], ring.size[1]) * k;
      pix.blob(cx + dx * rx, cy + dy * ry, s, s * 0.88, leafTone(dx, dy), rng, { wobble: 0.32, lobes: 3 });
    }
  }

  pix.outline('auto', { amount: 0.42 });
  return { pix, anchorX: 0.5, anchorY: baseY / H };
}

/**
 * Scrub. Small enough to walk past, tall enough that the big ones block a
 * sight — so it has to read as a rounded MASS with height, not as a flat green
 * pancake lying on the grass.
 */
export function bush(rng, variant = 0, size = 1) {
  const k = SIZES[size] ?? 1;
  const W = Math.round(40 * k);
  const H = Math.round(38 * k);
  const pix = makePix(W, H);
  const leaf = P.leaf[(variant + 1) % P.leaf.length];
  const cx = W / 2;
  const baseY = H - Math.round(3 * k);

  contactShadow(pix, cx, baseY, 12 * k, 3.5 * k);

  // Built bottom-up so it has a silhouette with a shoulder, like a shrub.
  pix.blob(cx + 1 * k, baseY - 7 * k, 13 * k, 7 * k, leaf[0], rng, { wobble: 0.26 });
  pix.blob(cx - 5 * k, baseY - 12 * k, 9 * k, 8 * k, leaf[0], rng, { wobble: 0.3 });
  pix.blob(cx + 6 * k, baseY - 13 * k, 8 * k, 8 * k, leaf[1], rng, { wobble: 0.3 });
  pix.blob(cx, baseY - 16 * k, 10 * k, 9 * k, leaf[1], rng, { wobble: 0.28 });
  pix.blob(cx - 3 * k, baseY - 21 * k, 6.5 * k, 6 * k, leaf[2], rng, { wobble: 0.34 });
  pix.blob(cx + 5 * k, baseY - 19 * k, 5 * k, 4.5 * k, leaf[2], rng, { wobble: 0.36 });

  // A hint of shaded interior on the lower right.
  pix.blob(cx + 7 * k, baseY - 9 * k, 5 * k, 4 * k, leaf[0], rng, { wobble: 0.35 });

  // Berries on some of them: a spot of complementary colour goes a long way.
  if (rng.chance(0.35)) {
    const berry = P.flower[rng.int(0, 1)];
    for (let i = 0; i < rng.int(4, 7); i++) {
      const bx = Math.round(cx + rng.range(-9, 9) * k);
      const by = Math.round(baseY - rng.range(8, 22) * k);
      pix.px(bx, by, berry[1]);
      pix.px(bx, by - 1, berry[2]);
    }
  }

  pix.outline('auto', { amount: 0.4 });
  return { pix, anchorX: 0.5, anchorY: (baseY + 1) / H };
}

/** A boulder. Faceted rather than round, so it reads as stone and not as a ball. */
export function rock(rng, variant = 0, size = 1) {
  const k = SIZES[size] ?? 1;
  const W = Math.round(42 * k);
  const H = Math.round(34 * k);
  const pix = makePix(W, H);
  const cx = W / 2;
  const baseY = H - Math.round(3 * k);
  const stone = variant % 3 === 2 ? P.rockMoss : P.rock;

  contactShadow(pix, cx, baseY, 15 * k, 4 * k);

  // An irregular silhouette, generated then shaded by facet.
  const n = rng.int(6, 8);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = rng.range(0.72, 1.0);
    pts.push([cx + Math.cos(a) * 16 * k * r, baseY - 9 * k + Math.sin(a) * 10 * k * r]);
  }
  pix.poly(pts, stone[1]);

  // Top-left facet catches the light; the lower right falls away.
  pix.poly(
    pts.map(([x, y]) => [x + 3 * k, y + 4 * k]),
    stone[0],
  );
  pix.poly(pts, stone[1]);
  pix.poly(
    pts.map(([x, y]) => [(x + cx) / 2 - 2 * k, (y + (baseY - 9 * k)) / 2 - 3 * k]),
    stone[2],
  );

  // A crack or two.
  for (let i = 0; i < rng.int(1, 2); i++) {
    const x0 = Math.round(cx + rng.range(-8, 8) * k);
    const y0 = Math.round(baseY - rng.range(6, 14) * k);
    pix.line(x0, y0, x0 + Math.round(rng.range(-5, 5) * k), y0 + Math.round(rng.range(3, 7) * k), stone[0]);
  }

  if (variant % 3 === 2) {
    // Moss on the shaded side.
    for (let i = 0; i < 14; i++) {
      pix.px(Math.round(cx + rng.range(-2, 13) * k), Math.round(baseY - rng.range(2, 10) * k), P.grassDeep[1]);
    }
  }

  pix.outline('auto', { amount: 0.4 });
  return { pix, anchorX: 0.5, anchorY: (baseY + 1) / H };
}
