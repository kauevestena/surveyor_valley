// The error budget: what the instrument model PREDICTS, before anything is
// measured.
//
// `instrument.js` says how each reading is drawn; this file runs those same
// numbers through the law of propagation of variances,
//
//     σ_y² = Σ (∂f/∂xᵢ)² · σᵢ²
//
// so the hidden theory panel can put a predicted σ beside every misclosure the
// player actually got. Nothing here draws a random number, and nothing reads
// the truth: a prediction needs the kit and the geometry, never where the
// marcos really are. That is what lets the panel show these numbers outside
// the debrief without breaking "truth is shown in exactly one place".
//
// Everything is first order and treats the inputs as independent. The game's
// own errors are not quite: one occupation's centring rides on every sight
// from it, and the same prism centring enters two neighbouring angles of a
// traverse. The panel says so, and the tests check that the simple formulas
// still land within a few per cent of a simulation.

import { directionSigma, distanceSigma } from './instrument.js';
import { toRad } from './units.js';

/** Arc-seconds in one radian, ρ" = 180·3600/π ≈ 206 265. */
export const RHO_SEC = (180 / Math.PI) * 3600;

/**
 * The angle a centring offset subtends at distance d, in arc-seconds.
 * ε" = ρ"·σ_c/d. The same millimetres are 26" at 20 m and 2.6" at 200 m.
 */
export function centringSec(sigma_mm, d) {
  return (RHO_SEC * (sigma_mm / 1000)) / Math.max(d, 1e-6);
}

/**
 * The direction sigma, split the way `directionSigma` builds it: the
 * instrument's stated σ and the short-sight pointing term, in quadrature.
 * Two faces average two independent readings, so every term falls by √2.
 * @returns {{instrument:number, pointing:number, total:number}} arc-seconds
 */
export function directionTerms(instrument, d, { twoFace = false } = {}) {
  const single = directionSigma(instrument, d) * 3600;
  const inst = instrument.sigmaDirSec;
  const pointing = Math.sqrt(Math.max(0, single * single - inst * inst));
  const k = twoFace ? Math.SQRT2 : 1;
  return { instrument: inst / k, pointing: pointing / k, total: single / k };
}

/**
 * σ of the orientation θ₀ = Az_ré − Hz_ré, in arc-seconds.
 *
 * The ré reading — one face, or the mean of two when the setup was made with
 * PD/PI on — plus the tripod's centring and the ré target's own, both seen as
 * an angle at the backsight distance:
 *
 *     σ_θ₀² = σ_dir(d_ré)² + (ρ"·σ_i/d_ré)² + (ρ"·σ_t/d_ré)²
 */
export function orientationSigmaSec({ kit, dRe, twoFaceRe = false }) {
  const dir = directionTerms(kit.instrument, dRe, { twoFace: twoFaceRe }).total;
  const ci = centringSec(kit.tripod.centringSigma_mm, dRe);
  const ct = centringSec(kit.target.centringSigma_mm, dRe);
  return Math.sqrt(dir * dir + ci * ci + ct * ct);
}

/**
 * One radiated point (irradiação), E = E₀ + d·sin Az, N = N₀ + d·cos Az.
 *
 * Along the line the error is the EDM; across it, it is the distance times the
 * azimuth error. Centring is a plain displacement in coordinates — σ in both
 * directions, whatever the distance — and the orientation error swings every
 * point of the setup through the same small angle, so its effect grows with d.
 *
 * `fixed` is the part a repeated sight from the SAME setup cannot average
 * (the tripod's centring, drawn once per occupation, and the orientation);
 * `random` is the part it can. `collimation` is a bias, not a σ: zero when the
 * sight and the ré were read on the same faces, because c cancels between
 * them; d·c/ρ" when the faces were mixed.
 *
 * The station's own coordinate error is not included: it is the traverse's
 * business, and it moves every point of the setup by the same vector.
 *
 * @returns {{longitudinal:number, transverse:number, fixed:number, random:number,
 *            total:number, collimation:number}} metres; total = √(σ_E² + σ_N²)
 */
export function pointSigma({ kit, d, dRe = d, twoFace = false, twoFaceRe = twoFace }) {
  const sd = distanceSigma(kit.instrument, d);
  const dirRad = directionTerms(kit.instrument, d, { twoFace }).total / RHO_SEC;
  const oriRad = orientationSigmaSec({ kit, dRe, twoFaceRe }) / RHO_SEC;
  const si = kit.tripod.centringSigma_mm / 1000;
  const st = kit.target.centringSigma_mm / 1000;

  const longitudinal = Math.sqrt(sd * sd + si * si + st * st);
  const transverse = Math.sqrt((d * dirRad) ** 2 + (d * oriRad) ** 2 + si * si + st * st);
  const fixed = Math.sqrt(2 * si * si + (d * oriRad) ** 2);
  const random = Math.sqrt(sd * sd + (d * dirRad) ** 2 + 2 * st * st);
  const collimation = Boolean(twoFace) === Boolean(twoFaceRe) ? 0 : (d * (kit.instrument.collimationSec ?? 0)) / RHO_SEC;

  return {
    longitudinal,
    transverse,
    fixed,
    random,
    total: Math.hypot(longitudinal, transverse),
    collimation,
  };
}

/**
 * A corner seen k times: the averaging part falls by √k, the fixed part does
 * not. Conservative when the sights came from different setups, whose fixed
 * parts would in fact average too.
 *
 * @param {Array<{d:number, dRe?:number|null, twoFace?:boolean, twoFaceRe?:boolean}>} sights
 * @returns {{total:number, perAxis:number, k:number}} metres
 */
export function sightsSigma({ kit, sights }) {
  const k = sights.length;
  if (!k) return { total: NaN, perAxis: NaN, k: 0 };
  let fixed2 = 0;
  let random2 = 0;
  for (const s of sights) {
    const twoFace = Boolean(s.twoFace);
    const p = pointSigma({ kit, d: s.d, dRe: s.dRe ?? s.d, twoFace, twoFaceRe: s.twoFaceRe ?? twoFace });
    fixed2 += p.fixed * p.fixed;
    random2 += p.random * p.random;
  }
  const total = Math.sqrt(fixed2 / k + random2 / (k * k));
  return { total, perAxis: total / Math.SQRT2, k };
}

/**
 * σ of a horizontal angle β measured from one occupation: back sight at d₁,
 * forward sight at d₂, the two targets `chord` apart.
 *
 *     σ_β² = σ_dir(d₁)² + σ_dir(d₂)²                  two readings
 *          + (ρ"·σ_i · chord / (d₁·d₂))²              tripod centring
 *          + (ρ"·σ_t)² · (1/d₁² + 1/d₂²)              prism centring
 *
 * The tripod term is the classic one: a displaced instrument swings both
 * directions, and what is left of it in the angle depends on how far apart the
 * two targets are — nothing when they line up, the most when they are opposite.
 * Each reading has its own faces: `twoFace` sets both, and `twoFaceBack` /
 * `twoFaceFwd` override one.
 * @returns {{direction:number, tripod:number, prism:number, total:number}} arc-seconds
 */
export function angleSigmaSec({ kit, d1, d2, chord, twoFace = false, twoFaceBack = twoFace, twoFaceFwd = twoFace }) {
  const a = directionTerms(kit.instrument, d1, { twoFace: twoFaceBack }).total;
  const b = directionTerms(kit.instrument, d2, { twoFace: twoFaceFwd }).total;
  const direction = Math.hypot(a, b);
  const si = kit.tripod.centringSigma_mm / 1000;
  const st = kit.target.centringSigma_mm / 1000;
  const tripod = (RHO_SEC * si * chord) / Math.max(d1 * d2, 1e-9);
  const prism = RHO_SEC * st * Math.sqrt(1 / (d1 * d1) + 1 / (d2 * d2));
  return { direction, tripod, prism, total: Math.sqrt(direction ** 2 + tripod ** 2 + prism ** 2) };
}

/**
 * σ_β at every station of a traverse, from the traverse's own observations:
 * the legs either side (d₁ = leg i−1, d₂ = leg i, the index convention of
 * `traverse.js`), the chord between the two neighbours by the law of cosines,
 * and the faces each of the two readings was taken on.
 *
 * This is the ONE place the per-station σ is worked out: `computeTraverse`
 * takes its tolerance from it and the theory panel its prediction, so the
 * verdict and the explanation cannot disagree.
 *
 * @param {number[]} p.angles     angle to the right at each station, degrees
 * @param {number[]} p.distances  leg i → i+1, metres
 * @param {Array<{back:boolean, fwd:boolean}>} [p.faces]
 */
export function traverseAngleSigmas({ kit, angles, distances, faces = [] }) {
  const n = angles.length;
  return angles.map((beta, i) => {
    const d1 = distances[(i - 1 + n) % n];
    const d2 = distances[i];
    const chord = Math.sqrt(Math.max(0, d1 * d1 + d2 * d2 - 2 * d1 * d2 * Math.cos(toRad(beta))));
    const f = faces[i] || {};
    return {
      d1,
      d2,
      chord,
      ...angleSigmaSec({ kit, d1, d2, chord, twoFaceBack: Boolean(f.back), twoFaceFwd: Boolean(f.fwd) }),
    };
  });
}

/** The leg length the shop quotes its tolerances on: a typical traverse in this valley. */
export const TYPICAL_LEG = 25;

/**
 * The angular tolerance a kit would be held to on a regular n-sided traverse
 * of `leg`-metre sides: 2·√n·σ_β, with the interior angle (n−2)·180°/n and the
 * two neighbours 2·leg·sin(β/2) apart. What the shop quotes beside each item.
 */
export function typicalTolerance({ kit, n = 5, leg = TYPICAL_LEG, twoFace = false }) {
  const beta = ((n - 2) * 180) / n;
  const chord = 2 * leg * Math.sin(toRad(beta / 2));
  const sb = angleSigmaSec({ kit, d1: leg, d2: leg, chord, twoFace }).total;
  return 2 * Math.sqrt(n) * sb;
}

/**
 * Expected size of the linear misclosure of a closed traverse, once the
 * angular misclosure has been distributed equally.
 *
 *     E[e²] = Σ σ_dᵢ²  +  Σ (σ_βᵢ/ρ)² · rᵢ²
 *
 * where rᵢ is the distance from station i to the CENTROID of the stations.
 * A distance error moves the closing point along its own leg. An angle error
 * at station i swings every leg after it about station i — but equal
 * distribution subtracts the mean angle error from every station, and what
 * survives of station i's error is a rotation about the centroid instead.
 * (Index convention as `traverse.js`: angle i at station i, leg i from i to i+1.)
 *
 * @param {Array<{E:number, N:number}>} p.coords  stations in loop order
 * @param {number[]} p.sigmaBetaSec  σ of each station's angle, arc-seconds
 * @param {number[]} p.sigmaDist     σ of each leg i → i+1, metres
 * @returns {{sigma:number, fromDistances:number, fromAngles:number, radii:number[]}}
 */
export function expectedMisclosure({ coords, sigmaBetaSec, sigmaDist }) {
  const n = coords.length;
  const cE = coords.reduce((s, p) => s + p.E, 0) / n;
  const cN = coords.reduce((s, p) => s + p.N, 0) / n;
  const radii = coords.map((p) => Math.hypot(p.E - cE, p.N - cN));
  const fromDistances = sigmaDist.reduce((s, v) => s + v * v, 0);
  const fromAngles = radii.reduce((s, r, i) => s + ((sigmaBetaSec[i] / RHO_SEC) * r) ** 2, 0);
  return {
    sigma: Math.sqrt(fromDistances + fromAngles),
    fromDistances: Math.sqrt(fromDistances),
    fromAngles: Math.sqrt(fromAngles),
    radii,
  };
}

/**
 * What the kit predicts for a traverse the player has already computed, to
 * set beside what it actually closed to.
 *
 * The per-station σ_β is the one the traverse's own tolerance was built from
 * when it carries it (`computeTraverse` with a kit); otherwise it is worked
 * out here the same way, from the traverse's angles, legs and faces.
 *
 * Distances carry the tripod's centring at the near end and the prism's at the
 * far end, along the line, on top of the EDM's own σ.
 *
 * @param {object} p.traverse  a successful `computeTraverse` result
 */
export function traversePrediction({ traverse, kit, twoFace = false }) {
  if (!traverse?.ok) return null;
  const pts = traverse.coords;
  const si = kit.tripod.centringSigma_mm / 1000;
  const st = kit.target.centringSigma_mm / 1000;

  const sigmas =
    traverse.angleSigmas ??
    traverseAngleSigmas({
      kit,
      angles: traverse.rows.map((r) => r.angleObs),
      distances: traverse.rows.map((r) => r.distance),
      faces: traverse.faces ?? traverse.rows.map(() => ({ back: twoFace, fwd: twoFace })),
    });
  const stations = sigmas.map((s, i) => ({ id: traverse.rows[i].from, ...s }));

  const sigmaBetaSec = stations.map((s) => s.total);
  const sigmaDist = traverse.rows.map((r) => {
    const sd = distanceSigma(kit.instrument, r.distance);
    return Math.sqrt(sd * sd + si * si + st * st);
  });

  const lin = expectedMisclosure({ coords: pts, sigmaBetaSec, sigmaDist });
  const sigmaAngClosureSec = Math.sqrt(sigmaBetaSec.reduce((s, v) => s + v * v, 0));

  return {
    stations,
    sigmaDist,
    /** σ of Σβ, centring included. */
    sigmaAngClosureSec,
    /** 2σ — the tolerance `computeTraverse` applies when it is given the kit. */
    tolPredictedSec: 2 * sigmaAngClosureSec,
    sigmaLin: lin.sigma,
    sigmaLinFromDistances: lin.fromDistances,
    sigmaLinFromAngles: lin.fromAngles,
    expectedRelDen: lin.sigma > 0 ? traverse.sumD / lin.sigma : Infinity,
  };
}

/**
 * σ of a shoelace area, A = ½ Σ (Eᵢ·Nᵢ₊₁ − Eᵢ₊₁·Nᵢ).
 *
 *     ∂A/∂Eᵢ = ½(Nᵢ₊₁ − Nᵢ₋₁)     ∂A/∂Nᵢ = ½(Eᵢ₋₁ − Eᵢ₊₁)
 *     σ_A² = Σ σᵢ² · |Pᵢ₊₁ − Pᵢ₋₁|² / 4
 *
 * so a corner matters in proportion to the diagonal between its two
 * neighbours — a corner on a long, thin spike barely moves the area.
 *
 * @param {Array<{E:number, N:number}>} ring
 * @param {number|number[]} sigma  per-axis σ of each corner, metres
 */
export function areaSigma(ring, sigma) {
  const n = ring.length;
  if (n < 3) return NaN;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const next = ring[(i + 1) % n];
    const si = Array.isArray(sigma) ? sigma[i] : sigma;
    s2 += (si * si * ((next.E - prev.E) ** 2 + (next.N - prev.N) ** 2)) / 4;
  }
  return Math.sqrt(s2);
}

/**
 * Per-corner σ for the active parcel, from each corner's own sights.
 *
 * A free station has no ré; its orientation is treated as though the
 * reference were as far away as the corner, which is roughly what a resection
 * on surrounding points gives.
 *
 * @param {string[]} p.markIds  the parcel's corner targets, in ring order
 * @returns {Array<{total:number, perAxis:number, k:number}>}
 */
export function ringSigmas({ markIds, observations, setups, kit }) {
  const setupById = new Map(setups.map((s) => [s.id, s]));
  return markIds.map((id) => {
    const sights = observations
      .filter((o) => o.targetId === id)
      .map((o) => {
        const setup = setupById.get(o.setupId);
        return {
          d: o.distance,
          dRe: setup?.backsightDistance ?? null,
          twoFace: Boolean(o.twoFace),
          // The faces the orientation was taken on: the ré's, or a free
          // station's resection sights'. Absent on older saves: one face.
          twoFaceRe: Boolean(setup?.backsightTwoFace),
        };
      });
    return sightsSigma({ kit, sights });
  });
}

/** The table the panel prints for the kit in hand, one row per distance. */
export const TABLE_DISTANCES = [5, 10, 20, 50, 100, 200];

export function kitTable(kit, { distances = TABLE_DISTANCES, twoFace = false, shortRe = 10 } = {}) {
  const ci = kit.tripod.centringSigma_mm;
  const ct = kit.target.centringSigma_mm;
  return distances.map((d) => {
    const dir = directionTerms(kit.instrument, d, { twoFace });
    const same = pointSigma({ kit, d, dRe: d, twoFace });
    const short = pointSigma({ kit, d, dRe: shortRe, twoFace });
    return {
      d,
      dirSec: dir.total,
      centringSec: centringSec(Math.hypot(ci, ct), d),
      distMm: distanceSigma(kit.instrument, d) * 1000,
      transDirMm: ((d * dir.total) / RHO_SEC) * 1000,
      pointMm: same.total * 1000,
      pointShortReMm: short.total * 1000,
      /** What mixing faces would cost: the ré on one, the sight on the other. */
      mixedFacesMm: ((d * (kit.instrument.collimationSec ?? 0)) / RHO_SEC) * 1000,
    };
  });
}
