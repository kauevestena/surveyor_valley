// Turning a set of occupations and their sighted angles/distances into the
// ordered loop `computeTraverse` needs — including recovering from an
// occupation order that is not itself a closable traverse.
//
// Extracted from service.js because it is fully self-contained: it never
// touches the store for anything but reading a control point's coordinate,
// and never mutates anything.

import { azimuth } from '../survey/geometry.js';
import { normalize360 } from '../survey/units.js';
import { isSelfIntersecting } from '../core/math2d.js';

/**
 * A monument exists twice: as a control point (`M3`) and as the world entity
 * you actually point the instrument at (`marco-M3`). Sights carry the entity
 * id, so this translates between them.
 */
const entityIdForPoint = (pointId) => `marco-${pointId}`;

/**
 * Build a closed traverse from the stations the player occupied.
 *
 * A station contributes an angle only if it sighted BOTH its neighbours in
 * the loop — which is exactly the discipline a real traverse demands, and the
 * panel says so when the data is not there yet.
 *
 * @param {object} p
 * @param {Array} p.setups  every occupation recorded on the active service (svc.setups)
 * @param {(id: string) => object|null} p.findControlPoint  store.findControlPoint
 */
export function buildTraverseInput({ setups, findControlPoint }) {
  // Every occupation of every monument, grouped by monument, in the order the
  // monuments were first occupied.
  const occupationOrder = [];
  const byStation = new Map();
  for (const s of setups) {
    if (s.mode !== 'known' || !s.overId) continue;
    if (!byStation.has(s.overId)) {
      byStation.set(s.overId, []);
      occupationOrder.push(s.overId);
    }
    byStation.get(s.overId).push(s);
  }
  const loop = occupationOrder.map((id) => ({ id, setups: byStation.get(id) }));
  if (loop.length < 3) return { ok: false, reason: 'needThreeStations', have: loop.length };

  // Sights are recorded against the world entity (`marco-M3`), while the loop
  // is keyed by control point (`M3`), so accept either spelling.
  const readingTo = (setup, pointId) => {
    const entityId = entityIdForPoint(pointId);
    const hits = setup.observations.filter((o) => o.targetId === pointId || o.targetId === entityId);
    return hits.length ? hits[hits.length - 1] : null;
  };

  /**
   * An angle is the difference of two circle readings, so both must come from
   * the SAME occupation — each setup has its own arbitrary circle zero, and
   * mixing readings across two setups would silently produce nonsense. So
   * pick, per station, an occupation that saw both of its loop neighbours.
   */
  const occupationSeeingBoth = (station, backId, fwdId) => {
    for (const setup of station.setups) {
      const oBack = readingTo(setup, backId);
      const oFwd = readingTo(setup, fwdId);
      if (oBack && oFwd) return { setup, oBack, oFwd };
    }
    return null;
  };

  /** Does this cyclic ordering give every station a usable angle? */
  const picksFor = (order) => {
    const out = [];
    for (let i = 0; i < order.length; i++) {
      const pick = occupationSeeingBoth(
        order[i],
        order[(i - 1 + order.length) % order.length].id,
        order[(i + 1) % order.length].id,
      );
      if (!pick) return null;
      out.push(pick);
    }
    return out;
  };

  /**
   * The order the player happened to occupy the monuments in is NOT
   * necessarily a traverse: two consecutive occupations may have a rock or a
   * stand of trees between them, so no angle exists there. Rather than make
   * the player guess the right sequence, work out which closed loop their
   * observations actually support.
   *
   * The candidate that matters most is the stations sorted by bearing around
   * their own centroid: that is guaranteed to be a SIMPLE polygon, and a
   * simple polygon is the only kind whose angles obey (n∓2)·180°. A crossing
   * loop can still satisfy every "saw both neighbours" check while closing at
   * something absurd like 1:4, so geometry is checked, not just visibility.
   */
  /** Always the SURVEYED coordinate, never one this function's own output moved. */
  const radiated = (cp) => (cp && cp.radiatedE != null ? { E: cp.radiatedE, N: cp.radiatedN } : cp);

  const coordOf = (station) => {
    const cp = radiated(findControlPoint(station.id));
    return cp && cp.E != null ? { E: cp.E, N: cp.N } : null;
  };

  const simple = (candidate) => {
    const pts = candidate.map(coordOf);
    if (pts.some((p) => !p)) return false;
    return !isSelfIntersecting(pts.map((p) => [p.E, p.N]));
  };

  const byBearing = () => {
    const withCoords = loop.map((s) => ({ s, c: coordOf(s) })).filter((x) => x.c);
    if (withCoords.length !== loop.length) return null;
    const cE = withCoords.reduce((t, x) => t + x.c.E, 0) / withCoords.length;
    const cN = withCoords.reduce((t, x) => t + x.c.N, 0) / withCoords.length;
    return withCoords
      .map((x) => ({ ...x, a: Math.atan2(x.c.E - cE, x.c.N - cN) }))
      .sort((p, q) => p.a - q.a)
      .map((x) => x.s);
  };

  const legLength = (a, b) => {
    for (const s of a.setups) {
      const o = readingTo(s, b.id);
      if (o) return o.distance;
    }
    return Infinity;
  };
  const loopLength = (candidate) =>
    candidate.reduce((sum, s, i) => sum + legLength(s, candidate[(i + 1) % candidate.length]), 0);

  let order = null;
  let picks = null;
  /** Stations left out of the closed figure, reported to the player. */
  let dropped = 0;

  for (const candidate of [byBearing(), loop]) {
    if (!candidate) continue;
    const p = picksFor(candidate);
    if (p && simple(candidate)) {
      order = candidate;
      picks = p;
      break;
    }
  }

  if (!picks && loop.length <= 8) {
    // A cycle is rotation-invariant, so pin the first station and permute the
    // rest: 7! at the very most, and typically far fewer. Only simple
    // polygons are eligible; among those, the shortest wins.
    let best = null;
    let bestLen = Infinity;
    const permute = (rest, acc) => {
      if (!rest.length) {
        const candidate = [loop[0], ...acc];
        if (picksFor(candidate) && simple(candidate)) {
          const len = loopLength(candidate);
          if (len < bestLen) {
            bestLen = len;
            best = candidate;
          }
        }
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
      }
    };
    permute(loop.slice(1), []);
    if (best) {
      order = best;
      picks = picksFor(order);
    }
  }

  /**
   * Last resort: drop the stations that break the chain and close a traverse
   * around what is left.
   *
   * Occupying twelve stations and finding that one pair could not see each
   * other should not cost the player the entire computation — a real surveyor
   * would simply run the polygon through the stations that do connect. Each
   * pass removes one offender and re-tests, because removing a station makes
   * its two neighbours adjacent and may open a new gap.
   */
  if (!picks) {
    // Breadth-first over "remove one station", keeping the LARGEST subset
    // that closes. Greedily dropping the first offender cascades: removing a
    // station makes its two neighbours adjacent, and that new pair very often
    // was never measured together either, so a single bad choice early can
    // eat the whole figure. Exploring a few alternatives at each level costs
    // almost nothing and recovers traverses the greedy walk throws away.
    const seen = new Set();
    const queue = [byBearing() || loop];
    let examined = 0;

    while (queue.length && examined < 60) {
      const cur = queue.shift();
      if (cur.length < 3) continue;
      const fingerprint = cur.map((s) => s.id).join(',');
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      examined++;

      const p = picksFor(cur);
      if (p && simple(cur)) {
        order = cur;
        picks = p;
        dropped = loop.length - cur.length;
        break;
      }
      if (cur.length === 3) continue;

      // Branch on every station that cannot see both of its neighbours.
      for (let i = 0; i < cur.length; i++) {
        const back = cur[(i - 1 + cur.length) % cur.length];
        const fwd = cur[(i + 1) % cur.length];
        if (occupationSeeingBoth(cur[i], back.id, fwd.id)) continue;
        queue.push(cur.filter((_, k) => k !== i));
      }
    }
  }

  if (!picks) {
    // Report against the occupation order, which is what the player sees.
    const missing = [];
    for (let i = 0; i < loop.length; i++) {
      const here = loop[i];
      const back = loop[(i - 1 + loop.length) % loop.length];
      const fwd = loop[(i + 1) % loop.length];
      if (occupationSeeingBoth(here, back.id, fwd.id)) continue;
      const sawBack = here.setups.some((s) => readingTo(s, back.id));
      const sawFwd = here.setups.some((s) => readingTo(s, fwd.id));
      missing.push({
        station: here.id,
        needs: [!sawBack ? back.id : null, !sawFwd ? fwd.id : null].filter(Boolean),
        sameSetup: sawBack && sawFwd,
      });
    }
    return { ok: false, reason: 'incompleteAngles', missing };
  }

  const angles = [];
  const distances = [];

  for (let i = 0; i < order.length; i++) {
    const here = order[i];
    const fwd = order[(i + 1) % order.length];
    const pick = picks[i];

    angles.push(normalize360(pick.oFwd.hz - pick.oBack.hz));

    // Prefer this station's own measurement of the leg ahead; average with
    // the far end's measurement of the same leg when both exist.
    const dHere = pick.oFwd.distance;
    const dThere = fwd.setups.map((s) => readingTo(s, here.id)?.distance).find((d) => d != null);
    distances.push(dThere != null ? (dHere + dThere) / 2 : dHere);
  }

  if (distances.some((d) => d == null || !Number.isFinite(d))) {
    return { ok: false, reason: 'incompleteDistances' };
  }

  // `order` is the loop that was actually solved, which may be a reordering
  // of the occupation sequence.
  const first = radiated(findControlPoint(order[0].id));
  const second = radiated(findControlPoint(order[1].id));
  if (!first || first.E == null || !second || second.E == null) {
    return { ok: false, reason: 'noStartCoordinates' };
  }

  return {
    ok: true,
    reordered: order !== loop,
    dropped,
    stations: order.map((s) => ({ id: s.id })),
    angles,
    distances,
    startPoint: { E: first.E, N: first.N },
    startAzimuth: azimuth(first.E, first.N, second.E, second.N),
  };
}
