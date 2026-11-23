// The error budget behind the hidden theory panel.
//
// Every σ that panel prints is a formula in `src/survey/budget.js`, and a
// formula on a teaching screen has to be right. So most of these tests do not
// check the algebra against itself: they run the GAME's own observation model,
// or the traverse computation, a few thousand times and check that the
// predicted σ is what actually comes out.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RHO_SEC,
  centringSec,
  directionTerms,
  orientationSigmaSec,
  pointSigma,
  sightsSigma,
  angleSigmaSec,
  traverseAngleSigmas,
  typicalTolerance,
  TYPICAL_LEG,
  expectedMisclosure,
  traversePrediction,
  areaSigma,
  ringSigmas,
  kitTable,
  TABLE_DISTANCES,
} from '../src/survey/budget.js';
import { resolveKit, directionSigma } from '../src/survey/instrument.js';
import { setupOverKnownPoint, sightTarget } from '../src/survey/station.js';
import { computeTraverse, anglesFromCoords, distancesFromCoords, angularTolerance } from '../src/survey/traverse.js';
import { azimuth, areaOf } from '../src/survey/geometry.js';
import { normalize180, toRad } from '../src/survey/units.js';
import { makeRng } from '../src/core/rng.js';
import pt from '../src/ui/lang/pt.js';
import en from '../src/ui/lang/en.js';

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${a} ≈ ${b} (tol ${tol})`);
const within = (a, b, frac, msg) => near(a, b, Math.abs(b) * frac, msg);

const STARTER = resolveKit({ instrument: 'et10', tripod: 'tri-mad', target: 'bastao' });

/** A kit with no centring at all, to isolate the instrument. */
const NO_CENTRING = {
  ...STARTER,
  tripod: { ...STARTER.tripod, centringSigma_mm: 0 },
  target: { ...STARTER.target, centringSigma_mm: 0 },
};

/** An irregular, convex-ish pentagon, CCW. Metres. */
const PENTAGON = [
  { id: 'P1', E: 1000, N: 1000 },
  { id: 'P2', E: 1062, N: 992 },
  { id: 'P3', E: 1081, N: 1047 },
  { id: 'P4', E: 1033, N: 1079 },
  { id: 'P5', E: 987, N: 1041 },
];

// ------------------------------------------------------------- the pieces ---

test('ρ" is the arc-seconds in a radian, and centring reads as ρ"·σ/d', () => {
  near(RHO_SEC, 206264.806, 1e-3);
  near(centringSec(2.5, 20), 25.78, 0.01, '2.5 mm at 20 m');
  near(centringSec(2.5, 200), 2.578, 0.001, 'ten times further, ten times smaller');
});

test('direction terms rebuild directionSigma, and two faces divide by √2', () => {
  for (const d of [2, 5, 20, 100, 300]) {
    const t = directionTerms(STARTER.instrument, d);
    near(t.total, directionSigma(STARTER.instrument, d) * 3600, 1e-9, `total at ${d} m`);
    near(Math.hypot(t.instrument, t.pointing), t.total, 1e-9, 'quadrature');
    near(directionTerms(STARTER.instrument, d, { twoFace: true }).total, t.total / Math.SQRT2, 1e-9);
  }
});

test('with no centring and long sights an angle is √2·σ_dir — the assumption inside angularTolerance', () => {
  const a = angleSigmaSec({ kit: NO_CENTRING, d1: 500, d2: 500, chord: 700 });
  near(a.total, Math.SQRT2 * STARTER.instrument.sigmaDirSec, 0.01);
  // angularTolerance(σ, n) = 2·σ_β·√n, so the same √2 must come out of it.
  near(angularTolerance(10, 4), 2 * Math.SQRT2 * 10 * 2, 1e-9);
});

test('the tripod term vanishes when the two targets line up, and peaks when they are opposite', () => {
  const zero = angleSigmaSec({ kit: STARTER, d1: 30, d2: 30, chord: 0 });
  near(zero.tripod, 0, 1e-12);
  const opposite = angleSigmaSec({ kit: STARTER, d1: 30, d2: 30, chord: 60 });
  near(opposite.tripod, (RHO_SEC * 0.0025 * 60) / 900, 1e-9, 'ρ"·σ_i·c/(d₁d₂)');
});

test('a short ré swings everything radiated from the setup: the orientation term grows as d/d_ré', () => {
  // The orientation's share of the fixed part is exactly d·σ_θ₀/ρ.
  const si = STARTER.tripod.centringSigma_mm / 1000;
  for (const [d, dRe] of [[100, 10], [100, 50], [30, 30]]) {
    const p = pointSigma({ kit: STARTER, d, dRe });
    const orientation = Math.sqrt(p.fixed ** 2 - 2 * si * si);
    near(orientation, (d * orientationSigmaSec({ kit: STARTER, dRe })) / RHO_SEC, 1e-12, `d=${d}, d_ré=${dRe}`);
  }
  // Centring dominates a short ré, so halving the ré roughly doubles σ_θ₀...
  within(orientationSigmaSec({ kit: STARTER, dRe: 10 }) / orientationSigmaSec({ kit: STARTER, dRe: 20 }), 2, 0.05);
  // ...and a point ten times further than the ré moves ten times the centring sideways.
  const far = pointSigma({ kit: STARTER, d: 100, dRe: 10 });
  const ci = Math.hypot(STARTER.tripod.centringSigma_mm, STARTER.target.centringSigma_mm) / 1000;
  assert.ok(far.transverse > 9 * ci, `transverse ${far.transverse} m vs ${ci} m of centring`);
});

test('a repeated sight averages the random part and not the fixed part', () => {
  const one = sightsSigma({ kit: STARTER, sights: [{ d: 40, dRe: 40 }] });
  const many = sightsSigma({ kit: STARTER, sights: Array.from({ length: 400 }, () => ({ d: 40, dRe: 40 })) });
  const p = pointSigma({ kit: STARTER, d: 40, dRe: 40 });
  near(one.total, p.total, 1e-12, 'one sight is one point');
  near(many.total, p.fixed, p.fixed * 0.02, 'four hundred sights leave the fixed part standing');
  assert.equal(many.k, 400);
});

// --------------------------------------- against the game's own model -------

test('angle σ matches the observation model in station.js, centring and all', () => {
  const rng = makeRng('budget', 'angle');
  const S = { id: 'S', E: 0, N: 0, trueE: 0, trueN: 0 };
  const A = { id: 'A', E: 0, N: 40, trueE: 0, trueN: 40 };
  const C = { id: 'C', E: 30, N: -10, trueE: 30, trueN: -10 };
  const trueBeta = azimuth(0, 0, 30, -10) - azimuth(0, 0, 0, 40);

  for (const twoFace of [false, true]) {
    let s2 = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const setup = setupOverKnownPoint({ over: S, backsight: A, kit: STARTER, rng });
      const a = sightTarget({ setup, target: A, kit: STARTER, rng, twoFace });
      const c = sightTarget({ setup, target: C, kit: STARTER, rng, twoFace });
      const e = normalize180(c.hz - a.hz - trueBeta) * 3600;
      s2 += e * e;
    }
    const predicted = angleSigmaSec({ kit: STARTER, d1: 40, d2: Math.hypot(30, 10), chord: Math.hypot(30, 50), twoFace });
    within(Math.sqrt(s2 / n), predicted.total, 0.05, `σ_β (twoFace=${twoFace})`);
  }
});

test('a radiated point scatters by σ_P; collimation adds a bias only when the faces are mixed', () => {
  const rng = makeRng('budget', 'point');
  const S = { id: 'S', E: 0, N: 0, trueE: 0, trueN: 0 };
  const A = { id: 'A', E: 0, N: 25, trueE: 0, trueN: 25 };
  const C = { id: 'C', E: 60, N: 15, trueE: 60, trueN: 15 };
  const d = Math.hypot(60, 15);

  // [faces of the ré, faces of the sight]
  for (const [twoFaceRe, twoFace] of [[false, false], [true, true], [false, true], [true, false]]) {
    let s2 = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const setup = setupOverKnownPoint({ over: S, backsight: A, kit: STARTER, rng, twoFace: twoFaceRe });
      const o = sightTarget({ setup, target: C, kit: STARTER, rng, twoFace });
      s2 += (o.E - C.E) ** 2 + (o.N - C.N) ** 2;
    }
    const p = pointSigma({ kit: STARTER, d, dRe: 25, twoFace, twoFaceRe });
    // Mean square error = variance + bias²: the bias is the collimation.
    within(Math.sqrt(s2 / n), Math.hypot(p.total, p.collimation), 0.05, `radial RMS (ré ${twoFaceRe}, sight ${twoFace})`);
    if (twoFace === twoFaceRe) near(p.collimation, 0, 0, 'same faces: c cancels');
    else near(p.collimation, (d * STARTER.instrument.collimationSec) / RHO_SEC, 1e-12, 'mixed: d·c/ρ"');
  }
});

test('a two-face ré is a quieter orientation; centring is untouched by it', () => {
  const one = orientationSigmaSec({ kit: NO_CENTRING, dRe: 30 });
  const two = orientationSigmaSec({ kit: NO_CENTRING, dRe: 30, twoFaceRe: true });
  near(two, one / Math.SQRT2, 1e-9);
  // With centring in, the √2 only touches the pointing part.
  assert.ok(orientationSigmaSec({ kit: STARTER, dRe: 30, twoFaceRe: true }) > orientationSigmaSec({ kit: STARTER, dRe: 30 }) / Math.SQRT2);
});

test('expected linear misclosure matches a simulated traverse, after equal angle distribution', () => {
  const pts = PENTAGON;
  const angles = anglesFromCoords(pts);
  const distances = distancesFromCoords(pts);
  const startAzimuth = azimuth(pts[0].E, pts[0].N, pts[1].E, pts[1].N);
  const sigmaBetaSec = [40, 25, 60, 30, 45];
  const sigmaDist = [0.01, 0.012, 0.008, 0.015, 0.01];
  const predicted = expectedMisclosure({ coords: pts, sigmaBetaSec, sigmaDist });

  const rng = makeRng('budget', 'traverse');
  let s2 = 0;
  const n = 3000;
  for (let i = 0; i < n; i++) {
    const r = computeTraverse({
      stations: pts.map((p) => ({ id: p.id })),
      angles: angles.map((a, k) => a + (rng.gauss() * sigmaBetaSec[k]) / 3600),
      distances: distances.map((dd, k) => dd + rng.gauss() * sigmaDist[k]),
      startPoint: pts[0],
      startAzimuth,
    });
    s2 += r.eLin * r.eLin;
  }
  within(Math.sqrt(s2 / n), predicted.sigma, 0.05, 'RMS of the linear misclosure');
  // The radii are to the centroid, not to the first station.
  const cE = pts.reduce((s, p) => s + p.E, 0) / pts.length;
  near(predicted.radii[0], Math.hypot(pts[0].E - cE, pts[0].N - pts.reduce((s, p) => s + p.N, 0) / pts.length), 1e-9);
});

test("each station's σ_β uses its own two legs and the chord between its neighbours", () => {
  const pts = PENTAGON;
  const sig = traverseAngleSigmas({ kit: STARTER, angles: anglesFromCoords(pts), distances: distancesFromCoords(pts) });
  const n = pts.length;
  sig.forEach((s, i) => {
    const back = pts[(i - 1 + n) % n];
    const here = pts[i];
    const fwd = pts[(i + 1) % n];
    near(s.d1, Math.hypot(here.E - back.E, here.N - back.N), 1e-9, `d₁ at ${i}`);
    near(s.d2, Math.hypot(fwd.E - here.E, fwd.N - here.N), 1e-9, `d₂ at ${i}`);
    near(s.chord, Math.hypot(fwd.E - back.E, fwd.N - back.N), 1e-9, `chord at ${i}: the law of cosines`);
  });
  // Faces are per reading: both on two faces is quieter than one, which is quieter than none.
  const faces = (back, fwd) => pts.map(() => ({ back, fwd }));
  const t = (f) => traverseAngleSigmas({ kit: STARTER, angles: anglesFromCoords(pts), distances: distancesFromCoords(pts), faces: f })[0].direction;
  assert.ok(t(faces(true, true)) < t(faces(true, false)) && t(faces(true, false)) < t(faces(false, false)));
});

test('with a kit, the traverse tolerance is 2σ of the closure, centring in', () => {
  const pts = PENTAGON;
  const args = {
    stations: pts.map((p) => ({ id: p.id })),
    angles: anglesFromCoords(pts),
    distances: distancesFromCoords(pts),
    startPoint: pts[0],
    startAzimuth: azimuth(pts[0].E, pts[0].N, pts[1].E, pts[1].N),
    sigmaDirSec: 10,
  };
  const bare = computeTraverse(args);
  const withKit = computeTraverse({ ...args, kit: STARTER });

  assert.equal(bare.tolIncludesCentring, false);
  near(bare.tolAngSec, angularTolerance(10, 5), 1e-9, 'no kit: the textbook figure, unchanged');
  assert.equal(withKit.tolIncludesCentring, true);
  near(withKit.tolAngNominalSec, angularTolerance(10, 5), 1e-9);
  const expected = 2 * Math.sqrt(withKit.angleSigmas.reduce((s, a) => s + a.total ** 2, 0));
  near(withKit.tolAngSec, expected, 1e-9);
  assert.ok(withKit.tolAngSec > 2 * withKit.tolAngNominalSec, 'a 5 mm pole on 60 m legs counts for more than the 10" itself');

  // The panel's prediction is the verdict's own number.
  near(traversePrediction({ traverse: withKit, kit: STARTER }).tolPredictedSec, withKit.tolAngSec, 1e-9);
  near(traversePrediction({ traverse: bare, kit: STARTER }).tolPredictedSec, withKit.tolAngSec, 1e-9, 'and recomputed the same way');

  const better = resolveKit({ instrument: 'et10', tripod: 'tri-fib', target: 'prisma-tri' });
  assert.ok(computeTraverse({ ...args, kit: better }).tolAngSec < withKit.tolAngSec, 'better centring, tighter tolerance');
});

test("the shop's typical tolerance: a regular pentagon of 25 m legs", () => {
  const chord = 2 * 25 * Math.sin(toRad(54));
  const sb = angleSigmaSec({ kit: STARTER, d1: 25, d2: 25, chord }).total;
  near(typicalTolerance({ kit: STARTER }), 2 * Math.sqrt(5) * sb, 1e-9);
  assert.equal(TYPICAL_LEG, 25);

  const prism = resolveKit({ instrument: 'et10', tripod: 'tri-mad', target: 'prisma-tri' });
  const top = resolveKit({ instrument: 'et1', tripod: 'tri-fib', target: 'prisma-tri' });
  const inst = resolveKit({ instrument: 'et1', tripod: 'tri-mad', target: 'bastao' });
  const starter = typicalTolerance({ kit: STARTER });
  assert.ok(typicalTolerance({ kit: prism }) < starter * 0.7, 'the prism is the big step');
  assert.ok(typicalTolerance({ kit: inst }) > starter * 0.9, 'the instrument alone barely moves it on short legs');
  assert.ok(typicalTolerance({ kit: top }) < typicalTolerance({ kit: prism }));
});

test('traversePrediction reads a computed traverse and gives 2σ and an expected 1:X', () => {
  const pts = PENTAGON;
  const r = computeTraverse({
    stations: pts.map((p) => ({ id: p.id })),
    angles: anglesFromCoords(pts),
    distances: distancesFromCoords(pts),
    startPoint: pts[0],
    startAzimuth: azimuth(pts[0].E, pts[0].N, pts[1].E, pts[1].N),
  });
  const pred = traversePrediction({ traverse: r, kit: STARTER });
  assert.equal(pred.stations.length, 5);
  near(pred.tolPredictedSec, 2 * pred.sigmaAngClosureSec, 1e-12);
  near(pred.expectedRelDen, r.sumD / pred.sigmaLin, 1e-9);
  near(Math.hypot(pred.sigmaLinFromAngles, pred.sigmaLinFromDistances), pred.sigmaLin, 1e-12);
  // Centring is real: the predicted tolerance is wider than the nominal one.
  assert.ok(pred.tolPredictedSec > r.tolAngSec);
  assert.equal(traversePrediction({ traverse: { ok: false }, kit: STARTER }), null);
});

test('area σ matches a simulation of the shoelace formula', () => {
  const sig = [0.01, 0.02, 0.005, 0.015, 0.01];
  const predicted = areaSigma(PENTAGON, sig);
  const a0 = areaOf(PENTAGON).m2;
  const rng = makeRng('budget', 'area');
  let s2 = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const ring = PENTAGON.map((p, k) => ({ E: p.E + rng.gauss() * sig[k], N: p.N + rng.gauss() * sig[k] }));
    s2 += (areaOf(ring).m2 - a0) ** 2;
  }
  within(Math.sqrt(s2 / n), predicted, 0.05, 'σ_A');
  near(areaSigma(PENTAGON, 0.01), areaSigma(PENTAGON, [0.01, 0.01, 0.01, 0.01, 0.01]), 1e-12, 'scalar = uniform array');
});

test('ringSigmas finds each corner by target id and uses its setup\'s ré', () => {
  const setups = [{ id: 'st-1', backsightDistance: 12 }, { id: 'st-2', backsightDistance: 60 }];
  const observations = [
    { targetId: 'c1', setupId: 'st-1', distance: 50, twoFace: false },
    { targetId: 'c2', setupId: 'st-2', distance: 50, twoFace: false },
    { targetId: 'c2', setupId: 'st-2', distance: 50, twoFace: false },
  ];
  const [c1, c2, c3] = ringSigmas({ markIds: ['c1', 'c2', 'c3'], observations, setups, kit: STARTER });
  assert.equal(c1.k, 1);
  assert.equal(c2.k, 2);
  assert.equal(c3.k, 0);
  assert.ok(Number.isNaN(c3.total), 'an unsighted corner has no σ');
  assert.ok(c1.total > c2.total, 'a short ré and a single sight are both worse');
});

test('the kit table has one row per distance and grows the way the theory says', () => {
  const rows = kitTable(STARTER);
  assert.deepEqual(rows.map((r) => r.d), TABLE_DISTANCES);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].centringSec < rows[i - 1].centringSec, 'centring as an angle falls with distance');
    assert.ok(rows[i].mixedFacesMm > rows[i - 1].mixedFacesMm, 'mixing faces costs more the further the point');
  }
  near(rows[3].mixedFacesMm, (50 * 22 * 1000) / RHO_SEC, 1e-9, '22" at 50 m');
  // Consistent faces carry no collimation, so the point σ is the same either way but quieter on two.
  assert.ok(kitTable(STARTER, { twoFace: true }).every((r, i) => r.pointMm < rows[i].pointMm));
});

// ------------------------------------------------------------------ i18n ----

test('every theory.* string exists in both languages', () => {
  const ptKeys = Object.keys(pt).filter((k) => k.startsWith('theory.'));
  const enKeys = Object.keys(en).filter((k) => k.startsWith('theory.'));
  assert.ok(ptKeys.length > 20, 'the panel has its text');
  assert.deepEqual(ptKeys.filter((k) => !(k in en)), [], 'missing in en.js');
  assert.deepEqual(enKeys.filter((k) => !(k in pt)), [], 'missing in pt.js');
});

test('every string the panel lays out exists, in both languages', async () => {
  const { SECTIONS } = await import('../src/ui/theory.js');
  const missing = [];
  for (const [id, suffixes] of SECTIONS) {
    for (const key of [`theory.${id}.title`, ...suffixes.map((s) => `theory.${id}.${s}`)]) {
      if (!(key in pt)) missing.push(`pt ${key}`);
      if (!(key in en)) missing.push(`en ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the secret code: "erro" typed without pausing, in any case, and nothing else', async () => {
  const { makeCodeMatcher } = await import('../src/ui/theory.js');
  const type = (feed, word, t0 = 0, step = 100) => [...word].map((k, i) => feed(k, t0 + i * step));

  assert.deepEqual(type(makeCodeMatcher(), 'erro'), [false, false, false, true]);
  assert.deepEqual(type(makeCodeMatcher(), 'ERRO'), [false, false, false, true], 'Caps Lock still counts');
  assert.ok(type(makeCodeMatcher(), 'wasderro').at(-1), 'walking first does not spoil it');
  assert.ok(type(makeCodeMatcher(), 'error')[3], '"error" fires on its fourth letter');
  assert.ok(!type(makeCodeMatcher(), 'erro', 0, 5000).some(Boolean), 'a long pause between letters starts again');
  assert.ok(type(makeCodeMatcher(), 'erro', 0, 1500).at(-1), 'a slow typist still gets there');
  assert.ok(!type(makeCodeMatcher(), 'eror').some(Boolean));

  const feed = makeCodeMatcher();
  assert.equal(feed('Shift', 0), false, 'named keys are ignored');
  assert.deepEqual(type(feed, 'erroerro', 10), [false, false, false, true, false, false, false, true], 'fires again');
});

test('formulas split into whole equations, so a phone never breaks one in half', async () => {
  const { splitFormula } = await import('../src/ui/theory.js');
  assert.deepEqual(splitFormula('Az = Hz + θ₀        E = E₀ + d·sen Az'), [{ lead: '', parts: ['Az = Hz + θ₀', 'E = E₀ + d·sen Az'] }]);
  assert.deepEqual(splitFormula('a = b\n     + c'), [{ lead: '', parts: ['a = b'] }, { lead: '     ', parts: ['+ c'] }]);
  // Three spaces are alignment inside an equation, not a gap between two.
  assert.deepEqual(splitFormula('Transit:   δE = x'), [{ lead: '', parts: ['Transit:   δE = x'] }]);
  // Every formula in both languages comes apart into non-empty pieces.
  for (const dict of [pt, en]) {
    for (const [k, v] of Object.entries(dict)) {
      if (!/^theory\.\w+\.f\d$/.test(k)) continue;
      for (const line of splitFormula(v)) assert.ok(line.parts.length >= 1 && line.parts.every((p) => p.trim()), k);
    }
  }
});
