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
//
// On where the look comes from: the farm-sim house style is the target here,
// as it is for the palette and for the 16 px tile. What that means in practice
// is a set of conventions — one light direction, three-step ramps, a canopy
// taller than it is wide over a trunk you can actually see — and conventions
// are not anybody's property. Every pixel below is computed by this file out
// of `palette.js`. Nothing is traced, sampled, eyedropped or copied from
// another game's art, and no such art is in this repository to copy from.

import { makePix, contactShadow, shadeOf, rgba, P } from './shared.js';

/** Painted size buckets. The scene maps an entity's `scale` onto these. */
export const SIZES = [0.78, 1.0, 1.24];

/**
 * One leaf: a short teardrop pointing along (ux, uy), fattest a third of the
 * way along and tapering to a point.
 *
 * This is the only new mark in the vocabulary and it is what separates a tree
 * from a green cloud. A canopy built only from round clusters reads as a MASS
 * at every distance; the same mass with its rim broken by a few dozen
 * leaf-shaped notches reads as foliage. Five pixels is about a hand-sized leaf
 * at 16 px/m — too small to name a species, big enough to see.
 */
function leafMark(pix, x, y, len, ux, uy, c) {
  const nx = -uy;
  const ny = ux;
  const steps = Math.max(2, Math.round(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const half = Math.sin(Math.pow(t, 0.62) * Math.PI) * len * 0.3;
    const bx = x + ux * len * t;
    const by = y + uy * len * t;
    pix.px(Math.round(bx), Math.round(by), c);
    for (let o = -half; o <= half; o += 0.7) {
      pix.px(Math.round(bx + nx * o), Math.round(by + ny * o), c);
    }
  }
}

/**
 * Canopy silhouettes. `tuck` pulls the bottom in so the mass sits OVER the
 * trunk instead of resting on it; `shoulder` pushes the upper flanks out.
 * Three of them, so the eight variants differ in shape and not only in hue —
 * a stand of trees that share one outline reads as wallpaper.
 */
const PROFILES = [
  { rx: [24, 26], ry: [31, 34], tuck: 0.3, shoulder: 0.06 }, // upright egg
  { rx: [25, 27], ry: [28, 31], tuck: 0.22, shoulder: 0.12 }, // broad dome
  { rx: [23, 25], ry: [33, 36], tuck: 0.36, shoulder: 0.0 }, // narrow spire
];

/**
 * A pasture tree: 4.25 m across and 7 m tall at size 1, of which the top three
 * fifths is canopy and the rest is trunk you can see.
 * @param {object} rng      seeded stream — the same rng gives the same tree
 * @param {number} variant  0-7; picks the leaf ramp AND the silhouette. 6 and 7
 *                          are the autumn pair, which the scatter places rarely.
 * @param {number} size     index into SIZES
 */
export function tree(rng, variant = 0, size = 1) {
  const k = SIZES[size] ?? 1;
  const W = Math.round(68 * k);
  const H = Math.round(112 * k);
  const pix = makePix(W, H);
  const leaf = variant < 6 ? P.leaf[variant % P.leaf.length] : P.leafAutumn[(variant - 6) % P.leafAutumn.length];
  const prof = PROFILES[variant % PROFILES.length];
  const cx = W / 2;
  const baseY = H - Math.round(4 * k);

  // Nudged down and right, away from the light. A shadow centred under the
  // trunk reads as noon on the equator.
  contactShadow(pix, cx + 2 * k, baseY - 1, 19 * k, 5.5 * k);

  // --------------------------------------------------- trunk and roots -----
  // Long enough to read as a trunk rather than a stump, tapered, and leaning a
  // little — the lean is the single cheapest thing that stops forty trees from
  // looking like forty copies.
  const lean = rng.range(-3, 3) * k;
  const trunkTop = Math.round(66 * k);
  const wTop = rng.range(2.8, 3.6) * k;
  const wBase = rng.range(6.0, 7.2) * k;
  /** Trunk centre at height fraction `t` (0 at the top, 1 at the ground). */
  const trunkX = (t) => cx + lean * (1 - t) * (1 - t);
  const trunkHalf = (t) => {
    const w = wTop + (wBase - wTop) * Math.pow(t, 1.8);
    // A gentle flare only: the roots below do the widening, and a trunk that
    // fans out on its own as well ends up standing on a solid slab.
    return t > 0.88 ? w + 1.8 * k * Math.pow((t - 0.88) / 0.12, 1.6) : w;
  };

  // The outer quarter of the right-hand side in shadow, two pixels of
  // catch-light on the left. Bark is matte and nearly cylindrical, so the
  // shaded side is a wide flat band rather than a gradient — and at this size
  // a one-pixel dark edge just reads as an outline, which the trunk already
  // gets for free.
  for (let y = trunkTop; y <= baseY; y++) {
    const t = (y - trunkTop) / (baseY - trunkTop);
    const x = trunkX(t);
    const half = trunkHalf(t);
    pix.hline(Math.round(x - half), Math.round(x + half), y, P.trunk[1]);
    // The boundary wanders a pixel either way; a ruled vertical line down a
    // trunk reads as a join between two planks.
    const edge = 0.45 + 0.09 * Math.sin(y * 0.7 + lean);
    pix.hline(Math.round(x + half * edge), Math.round(x + half), y, P.trunk[0]);
    pix.hline(Math.round(x - half), Math.round(x - half + 1), y, P.trunk[2]);
  }

  // Roots. Each one leaves the trunk WELL ABOVE the ground and falls away in a
  // curve, so what sits between it and the trunk is a wedge of open grass.
  //
  // Three earlier versions of this fused into a rectangular foot. The lesson
  // each time was the same: roots that leave the trunk at ground level, at the
  // same height, along straight lines, fill in the gaps between each other —
  // and the gaps ARE the flare. Hence the curve (`t^1.9` keeps the root high
  // against the trunk and drops it steeply at the tip) and the per-column
  // vertical spans, which cannot quietly merge into a slab the way a stack of
  // horizontal lines can.
  for (let i = 0, n = rng.int(3, 4); i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const leaveT = rng.range(0.68, 0.86); // how far down the trunk it starts
    const hy = trunkTop + leaveT * (baseY - trunkTop);
    const from = trunkX(leaveT) + side * trunkHalf(leaveT) * 0.6;
    const len = rng.range(6.5, 11) * k;
    const tipY = baseY - rng.range(0, 1.5) * k;
    const w = rng.range(2.2, 3.2) * k;
    const steps = Math.max(3, Math.round(len));
    for (let sIdx = 0; sIdx <= steps; sIdx++) {
      const t = sIdx / steps;
      const x = Math.round(from + side * len * t);
      const y = hy + (tipY - hy) * Math.pow(t, 1.9);
      const half = w * Math.pow(1 - t, 0.8) + 0.4;
      pix.vline(x, Math.round(y - half * 0.7), Math.round(y + half * 0.9), P.trunk[1]);
      // Lit on top, shaded underneath — the same upper-left light as
      // everything else, which is what stops them reading as flat.
      pix.px(x, Math.round(y - half * 0.7), P.trunk[2]);
      pix.px(x, Math.round(y + half * 0.9), P.trunk[0]);
    }
  }

  // Bark grain runs the way the tree grew: DOWN. The old horizontal ticks read
  // as rungs on a ladder.
  for (let i = 0, n = rng.int(5, 8); i < n; i++) {
    const t0 = rng.range(0.04, 0.62);
    const t1 = Math.min(0.95, t0 + rng.range(0.12, 0.34));
    const off = rng.range(-0.62, 0.62);
    const c = off < -0.15 ? P.trunk[2] : P.trunk[0];
    for (let y = trunkTop + t0 * (baseY - trunkTop); y <= trunkTop + t1 * (baseY - trunkTop); y++) {
      const t = (y - trunkTop) / (baseY - trunkTop);
      pix.px(Math.round(trunkX(t) + off * trunkHalf(t)), Math.round(y), c);
    }
  }

  // One knot, where a limb was lost.
  {
    const t = rng.range(0.25, 0.55);
    const kx = Math.round(trunkX(t) + rng.range(-0.3, 0.3) * trunkHalf(t));
    const ky = Math.round(trunkTop + t * (baseY - trunkTop));
    pix.ellipse(kx, ky, 1.9 * k, 1.3 * k, P.trunk[0]);
    pix.px(kx, ky - Math.round(1.4 * k), P.trunk[2]);
  }

  // ------------------------------------------------------------ canopy -----
  // Built from leaf clusters, not shaded regions. Every earlier pass at this
  // used a handful of big blobs to fake a round, shaded mass — and every one
  // of them showed the same failure once actually rendered: a flat colour fill
  // has a hard edge with no antialiasing, so a BIG region of it reads as a
  // seam cutting across the canopy, not as shading. Small regions don't have
  // that problem — a hard edge around something leaf-sized reads as the leaf's
  // own outline. So the mass is packed ring by ring from the centre out with
  // three dozen small clusters, and the leaf marks go on top of that.
  const cy = 40 * k;
  const rx = rng.range(prof.rx[0], prof.rx[1]) * k;
  const ry = rng.range(prof.ry[0], prof.ry[1]) * k;
  const lightX = -0.7;
  const lightY = -0.7;

  /**
   * Where a point in unit-circle coordinates lands on this canopy. `dy > 0` is
   * DOWN the sprite, and that half gets tucked in: the underside of a canopy
   * is narrower than its waist because it has to sit over a trunk.
   */
  function shape(dx, dy) {
    const tuck = 1 - prof.tuck * Math.max(0, dy);
    const shoulder = 1 + prof.shoulder * Math.max(0, -dy - 0.1);
    return [cx + dx * rx * tuck * shoulder, cy + dy * ry];
  }

  // Each cluster's tone is a WEIGHTED COIN FLIP biased by light direction, not
  // a threshold on it. A threshold draws one clean line and produces exactly
  // the two-big-regions look this replaced; a biased flip means the lit side is
  // MOSTLY light clusters with dark ones mixed in and vice versa, so
  // neighbouring clusters keep disagreeing with each other — which is what
  // actually reads as individual leaves catching the light differently, rather
  // than two smooth-edged patches of colour.
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
    { rFrac: 0.48, count: 9, size: [6, 8] },
    { rFrac: 0.68, count: 12, size: [5.5, 7.5] },
    { rFrac: 0.85, count: 14, size: [5, 6.5] },
    { rFrac: 0.99, count: 16, size: [4, 5.5] },
  ];

  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + rng.range(-0.35, 0.35);
      const r = ring.rFrac + rng.range(-0.04, 0.04);
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r;
      const [x, y] = shape(dx, dy);
      const s = rng.range(ring.size[0], ring.size[1]) * k;
      pix.blob(x, y, s, s * 0.88, leafTone(dx, dy), rng, { wobble: 0.32, lobes: 3 });
    }
  }

  // The underside. Light from above means the bottom of a canopy is in its own
  // shadow, and that band of dark is most of what makes the mass look round
  // rather than flat.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.18 + (i / 8) * 0.64);
    const dx = Math.cos(a) * rng.range(0.55, 0.9);
    const dy = Math.sin(a) * rng.range(0.72, 0.95);
    const [x, y] = shape(dx, dy);
    const s = rng.range(4.5, 6.5) * k;
    pix.blob(x, y, s, s * 0.8, leaf[0], rng, { wobble: 0.3, lobes: 3 });
  }

  // Three or four holes in the lower right, dark enough to read as a look
  // straight through the foliage at the shaded branches behind it.
  const hollow = shadeOf(leaf[0], 0.3);
  for (let i = 0, n = rng.int(3, 5); i < n; i++) {
    const a = rng.range(0.1, 0.85) * Math.PI;
    const r = rng.range(0.25, 0.7);
    const [x, y] = shape(Math.cos(a) * r, Math.sin(a) * r);
    pix.blob(x, y, rng.range(2.2, 3.6) * k, rng.range(1.8, 3) * k, hollow, rng, { wobble: 0.4, lobes: 4 });
  }

  // ---------------------------------------------------------- branches -----
  // Painted ON TOP of the mass and then broken up by the cover clusters below,
  // so what survives is the glimpse of a dark limb through a gap in the leaves.
  // Painted underneath instead — which is the obvious way round — not one
  // pixel of them ever showed, and a canopy with nothing visible underneath it
  // is a balloon on a stick.
  const forkY = trunkTop + 3 * k;
  for (let i = 0, n = rng.int(2, 3); i < n; i++) {
    const a = i === 0 ? rng.range(-2.5, -2.1) : i === 1 ? rng.range(-1.05, -0.65) : rng.range(-1.75, -1.4);
    const len = rng.range(15, 26) * k;
    const bend = rng.range(-0.3, 0.3);
    const steps = Math.round(len);
    for (let sIdx = 0; sIdx <= steps; sIdx++) {
      const t = sIdx / steps;
      const aa = a + bend * t;
      const x = trunkX(0) + Math.cos(aa) * len * t;
      const y = forkY + Math.sin(aa) * len * t;
      const half = 2.1 * k * (1 - t * 0.8);
      pix.hline(Math.round(x - half), Math.round(x + half), Math.round(y), P.branch[1]);
      pix.px(Math.round(x + half), Math.round(y), P.branch[0]);
    }
  }

  // The cover: a dozen clusters over the limbs, leaving them showing only in
  // the gaps between.
  for (let i = 0; i < 13; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.range(0.04, 1)) * 0.82;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    const [x, y] = shape(dx, dy);
    const sz = rng.range(5, 7.5) * k;
    pix.blob(x, y, sz, sz * 0.86, leafTone(dx, dy), rng, { wobble: 0.34, lobes: 3 });
  }

  // ------------------------------------------------------- leaf marks -----
  // Around the rim first, pointing out of the mass: this is what cuts the
  // silhouette into leaves rather than into lobes. Then a scatter across the
  // face, so the middle of the canopy isn't smoother than its edge.
  //
  // A mark is worth nothing if it lands in its own colour, and with three
  // steps and a biased coin that happens a third of the time — so the tone is
  // chosen against WHAT IS ALREADY THERE, stepping away from it toward the
  // light or away from it. That one rule is the difference between a canopy
  // that has leaves and a canopy that has a slightly noisy surface.
  const nearestStep = (x, y) => {
    const [r, g, b, a] = pix.get(Math.round(x), Math.round(y));
    if (!a) return -1;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < leaf.length; i++) {
      const [lr, lg, lb] = rgba(leaf[i]);
      const d = (lr - r) ** 2 + (lg - g) ** 2 + (lb - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  function markTone(x, y, dx, dy) {
    const under = nearestStep(x, y);
    const want = leafTone(dx, dy);
    if (under < 0 || leaf[under] !== want) return want;
    const lit = dx * lightX + dy * lightY > 0;
    const other = lit ? under + 1 : under - 1;
    return leaf[Math.max(0, Math.min(leaf.length - 1, other === under ? under - 1 : other))];
  }

  const rimCount = Math.round(52 * k);
  for (let i = 0; i < rimCount; i++) {
    const a = (i / rimCount) * Math.PI * 2 + rng.range(-0.06, 0.06);
    const r = rng.range(0.86, 1.02);
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    const [x, y] = shape(dx, dy);
    // Outward, with a little droop: leaves hang.
    const ux = Math.cos(a) + rng.range(-0.25, 0.25);
    const uy = Math.sin(a) + rng.range(-0.1, 0.3);
    const m = Math.hypot(ux, uy) || 1;
    leafMark(pix, x, y, rng.range(4, 6.5) * k, ux / m, uy / m, markTone(x, y, dx, dy));
  }

  const faceCount = Math.round(34 * k);
  for (let i = 0; i < faceCount; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.range(0, 1)) * 0.8;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    const [x, y] = shape(dx, dy);
    const ua = rng.range(0, Math.PI * 2);
    leafMark(pix, x, y, rng.range(3.5, 5.5) * k, Math.cos(ua), Math.sin(ua), markTone(x, y, dx, dy));
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

  // The same leaf marks the tree wears, at the same size — a leaf is a leaf
  // whatever it is growing on, and scrub beside a tree that had a smooth
  // outline looked like a different material entirely.
  const bcy = baseY - 13 * k;
  for (let i = 0, n = Math.round(18 * k); i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.12, 0.12);
    const dx = Math.cos(a);
    const dy = Math.sin(a) * 0.85;
    const r = rng.range(0.82, 1.0);
    const x = cx + dx * r * 12 * k;
    const y = bcy + dy * r * 9 * k;
    // Lit up and left, shaded down and right, same as everything else.
    const bias = dx * -0.7 + dy * -0.7;
    const tone = leaf[bias > 0.35 ? 2 : bias < -0.35 ? 0 : 1];
    const uy = Math.sin(a) + rng.range(0, 0.25);
    const m = Math.hypot(dx, uy) || 1;
    leafMark(pix, x, y, rng.range(3.5, 5) * k, dx / m, uy / m, tone);
  }

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
