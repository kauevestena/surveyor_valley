// The farm animals, and where they are allowed to be.
//
// Hens, pigs and cows, a few of each around every homestead. Their whole job is
// to make a farmyard look like somewhere people work rather than a diagram with
// a house on it — the same argument that put the moradores on their doorsteps.
//
// THEY ARE SCENERY, AND THAT IS A DESIGN DECISION RATHER THAN AN OMISSION.
// Nothing here blocks walking, blocks a sight line, or can be pointed at with
// the instrument. `entities.js` already states the rule for a person standing
// in their own gate, and it binds harder on something that moves: a cow between
// the tripod and a corner would refuse a sight for a reason no student could
// learn anything from, and — worse — the same seed would then close to a
// different error depending on where she happened to be standing. The valley's
// determinism is the thing the whole game is built on.
//
// So the herd lives OUTSIDE `world.entities`, held by `main.js` next to the
// player and Ligeirinho, who are outside it for the same reason. Two mechanical
// facts make that the only workable place anyway:
//
//   * `world.spatial` is insert-only — there is no remove and no move, because
//     nothing in the world was ever supposed to travel.
//   * `world.hash()` mixes every entity's position, and a herd inside it would
//     change the world's identity sixty times a second.
//
// PLACEMENT IS SEEDED; MOTION IS NOT. Which farm gets the brown cow comes out
// of the seed, so a valley is the same valley every time it is built. Where she
// has wandered to by half past nine does not, and must not look as though it
// does — this is presentation, exactly like the butterflies in `effects.js`.
//
// DOM-free, so `tests/animals.test.mjs` can run a herd across a real world.

import { makeRng } from '../core/rng.js';
import { slideStep, canStand } from './player.js';

export const SPECIES = {
  CHICKEN: 'chicken',
  COW: 'cow',
  PIG: 'pig',
};

/**
 * What lives on a farm, and how much room it needs.
 *
 * Real animal paces, not the crew's. The player runs at 7 m/s and Ligeirinho
 * dashes at 45 because the alternative is watching somebody amble across a
 * field forty times a job — nothing is ever waiting on a cow, so she gets to
 * move like a cow.
 *
 * `roam` is measured from the doorstep. Hens stay in the yard, pigs keep near
 * it, and the cattle are out on the pasture, which is both true and what makes
 * a farmyard read as having a middle and an edge.
 */
export const STOCK = {
  [SPECIES.CHICKEN]: { min: 3, max: 5, roam: 6, speed: 1.2, radius: 0.15, stride: 0.32, graze: [1.5, 4] },
  [SPECIES.PIG]: { min: 1, max: 2, roam: 9, speed: 0.8, radius: 0.4, stride: 0.5, graze: [3, 7] },
  [SPECIES.COW]: { min: 2, max: 3, roam: 18, speed: 0.5, radius: 0.7, stride: 0.9, graze: [4, 9] },
};

/** Coats per species, matching what the atlas was painted with. */
export const COATS = 2;

/**
 * How far an animal must stay from a boundary mark.
 *
 * A cow is thirty pixels wide and a marco is four. Parked on one she hides it
 * completely, and the player would be hunting the scrub for a corner that is
 * standing right there behind a animal — a puzzle the game never set and cannot
 * explain. The farmhouse is sited well inside the parcel, so this almost never
 * binds; "almost never" is not a guarantee, and this is the guarantee.
 */
export const MARK_CLEARANCE = 3;

/**
 * Only animals this close to the player are stepped.
 *
 * Six farms of livestock is around forty bodies, and stepping every one of them
 * through a collision solver sixty times a second to animate a paddock nobody
 * is looking at is work for nothing. They are presentation: an animal nobody
 * can see may hold perfectly still, and does.
 */
export const ACTIVE_RADIUS = 70;

/** Arrival, and the patience for getting there. */
const ARRIVE = 0.4;
const STUCK_TIMEOUT = 1.2;

/** How long a walk may last before the animal simply stops and grazes. */
const WALK_CEILING = 14;

const BREATH_SLOT = 0.8;
const BREATH_PATTERN = [0, 0, 1];

export const MODE = {
  /** Head down, eating. Where an animal spends most of its day. */
  GRAZE: 'graze',
  /** Ambling to somewhere else in the paddock. */
  WALK: 'walk',
};

/**
 * How near the player an animal has to be to be heard, and how often any of
 * them is. Sparse on purpose: a farm heard from the next field, not a petting
 * zoo. `scheduleBirds` in `audio.js` sets the tempo this is tuned against.
 */
const CALL_RADIUS = 18;
const CALL_GAP = [6, 14];

/**
 * Stand a herd on every farm in the valley.
 *
 * Seeded from the world's own seed on a stream of its own — naming the stream
 * is what guarantees that tuning the livestock can never shift a parcel corner
 * or move a tree, because `makeRng` derives each stream independently.
 *
 * Animals whose farm has no homestead are simply not born: `sedeFor` returns
 * null when the generator could find nowhere to put a house, and a cow with no
 * farm to belong to is a cow in the middle of a field.
 *
 * @param {object} world
 * @returns {Array<object>} the herd, in no particular order
 */
export function makeHerd(world) {
  const rng = makeRng(world.seed, 'livestock');
  const herd = [];

  for (const parcel of world.parcels) {
    const sede = world.sedeFor(parcel.id);
    if (!sede) continue;

    for (const species of Object.keys(STOCK)) {
      const s = STOCK[species];
      const count = rng.int(s.min, s.max);
      for (let i = 0; i < count; i++) {
        const spot = findSpot(world, rng, sede.door, s.roam, s.radius);
        if (!spot) continue;
        herd.push(spawn(`${species}-${parcel.id}-${i}`, species, rng.int(0, COATS - 1), parcel.id, sede.door, s, spot));
      }
    }
  }

  return herd;
}

function spawn(id, species, variant, parcelId, home, s, spot) {
  return {
    id,
    species,
    variant,
    parcelId,
    /** The doorstep this animal belongs to, and how far it may stray from it. */
    home: { e: home.e, n: home.n },
    roam: s.roam,
    e: spot.e,
    n: spot.n,
    prevE: spot.e,
    prevN: spot.n,
    facing: 'S',
    frame: 0,
    walkPhase: 0,
    moving: false,
    speed: 0,
    idlePhase: 0,
    idleFrame: 0,
    mode: MODE.GRAZE,
    /** Seconds left of the current graze, or of the ceiling on the current walk. */
    timer: 1 + Math.random() * 5,
    target: null,
    stalledFor: 0,
    bestDistance: Infinity,
  };
}

/**
 * Somewhere in the paddock an animal of this size may actually stand.
 *
 * Rejects three things, in the order they are cheapest to test: outside the
 * roam disc, too near a boundary mark, and ground the game itself refuses —
 * `canStand` is the same predicate the player is judged by, so a pig cannot
 * end up somewhere the player could walk through her.
 *
 * @param {{next:Function}|null} rng  seeded at placement, absent while wandering
 */
function findSpot(world, rng, home, roam, radius) {
  const roll = rng ? () => rng.next() : Math.random;
  for (let attempt = 0; attempt < 24; attempt++) {
    // sqrt so the points are spread evenly over the disc rather than crowding
    // the middle, which would put every animal on the doorstep.
    const d = Math.sqrt(roll()) * roam;
    const a = roll() * Math.PI * 2;
    const e = home.e + Math.cos(a) * d;
    const n = home.n + Math.sin(a) * d;
    if (!canStand(world, e, n, radius)) continue;
    if (nearMark(world, e, n)) continue;
    return { e, n };
  }
  return null;
}

/** Is this spot close enough to a boundary mark to hide it? */
function nearMark(world, e, n) {
  for (const ent of world.spatial.queryCircle(e, n, MARK_CLEARANCE)) {
    if (ent.targetKind === 'divisa' || ent.targetKind === 'marco') return true;
  }
  return false;
}

/** The same facing rule the player and Ligeirinho follow, so all three agree. */
function facingFor(dx, dy, current) {
  if (dx === 0 && dy === 0) return current;
  if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'N' : 'S';
  return dx > 0 ? 'E' : 'W';
}

/**
 * Advance the whole herd one fixed step.
 *
 * @param {Array<object>} herd
 * @param {object} world
 * @param {number} dt
 * @param {{player:{e:number,n:number}}} ctx
 * @returns {{called: string|null}}  the species of an animal near enough to be
 *          heard, on the step its call comes due. `main.js` plays it — this
 *          module stays DOM-free, exactly as `updateAssistant` reports an
 *          arrival rather than taking the reading itself.
 */
export function updateHerd(herd, world, dt, { player } = {}) {
  const result = { called: null };
  if (!herd || !herd.length) return result;

  const near = [];

  for (const a of herd) {
    a.prevE = a.e;
    a.prevN = a.n;

    const far = player && Math.hypot(a.e - player.e, a.n - player.n) > ACTIVE_RADIUS;
    if (far) {
      // Out of sight. Hold still rather than stepping a collision solver for a
      // paddock nobody is looking at.
      a.moving = false;
      a.speed = 0;
      continue;
    }
    if (player && Math.hypot(a.e - player.e, a.n - player.n) <= CALL_RADIUS) near.push(a);

    step(a, world, dt);
  }

  // ---- a call, now and then ------------------------------------------------
  callCooldown -= dt;
  if (callCooldown <= 0) {
    if (near.length) {
      result.called = near[Math.floor(Math.random() * near.length)].species;
      callCooldown = CALL_GAP[0] + Math.random() * (CALL_GAP[1] - CALL_GAP[0]);
    } else {
      // Nothing in earshot. Check again shortly rather than resetting the full
      // gap, or walking up to a farm would be followed by a long silence.
      callCooldown = 1;
    }
  }

  return result;
}

/**
 * Seconds until the next call. Module-level rather than per-herd because it is
 * a property of the listener — the player has one pair of ears, however many
 * farms are on screen.
 */
let callCooldown = 3;

/** Start the ear fresh. A new valley should not inherit the last one's silence. */
export function resetCalls(seconds = 3) {
  callCooldown = seconds;
}

function step(a, world, dt) {
  const s = STOCK[a.species];
  const startE = a.e;
  const startN = a.n;

  a.timer -= dt;

  if (a.mode === MODE.GRAZE) {
    if (a.timer <= 0) {
      const spot = findSpot(world, null, a.home, a.roam, s.radius);
      if (spot) {
        a.target = spot;
        a.mode = MODE.WALK;
        a.timer = WALK_CEILING;
        a.stalledFor = 0;
        a.bestDistance = Infinity;
      } else {
        // Boxed in. Try again after another mouthful rather than spinning on
        // it every frame.
        a.timer = grazeFor(s);
      }
    }
  } else if (a.target) {
    const dE = a.target.e - a.e;
    const dN = a.target.n - a.n;
    const dist = Math.hypot(dE, dN);

    if (dist <= ARRIVE) {
      settle(a, s);
    } else {
      slideStep(world, a, (dE / dist) * s.speed * dt, (dN / dist) * s.speed * dt, s.radius);

      // Progress in the only sense that matters — closer than ever before.
      // Grinding along a wall covers ground without getting anywhere, which is
      // exactly the case this timeout is for.
      const now = Math.hypot(a.target.e - a.e, a.target.n - a.n);
      if (now < a.bestDistance - 0.02) {
        a.bestDistance = now;
        a.stalledFor = 0;
      } else {
        a.stalledFor += dt;
      }

      if (now <= ARRIVE || a.stalledFor >= STUCK_TIMEOUT || a.timer <= 0) settle(a, s);
    }
  } else {
    settle(a, s);
  }

  // ---- animation, from ground actually covered ----------------------------
  // The rule the player and Ligeirinho both follow: legs driven by
  // displacement, never by intent, so an animal stopped by a tree stops
  // walking rather than moonwalking against it.
  const moved = Math.hypot(a.e - startE, a.n - startN);
  a.speed = moved / dt;

  if (moved > 1e-5) {
    a.facing = facingFor(a.e - startE, a.n - startN, a.facing);
    a.walkPhase = (a.walkPhase + moved / s.stride) % 4;
    a.moving = true;
    a.idlePhase = 0;
    a.idleFrame = 0;
  } else {
    a.moving = false;
    a.walkPhase = 0;
    a.idlePhase += dt;
    a.idleFrame = BREATH_PATTERN[Math.floor(a.idlePhase / BREATH_SLOT) % BREATH_PATTERN.length];
  }
  a.frame = Math.floor(a.walkPhase) % 4;
}

const grazeFor = (s) => s.graze[0] + Math.random() * (s.graze[1] - s.graze[0]);

function settle(a, s) {
  a.mode = MODE.GRAZE;
  a.target = null;
  a.timer = grazeFor(s);
}

/** Interpolated positions for rendering between fixed steps. */
export function interpolatedHerd(herd, alpha) {
  const out = [];
  for (const a of herd) {
    out.push({ ...a, e: a.prevE + (a.e - a.prevE) * alpha, n: a.prevN + (a.n - a.prevN) * alpha });
  }
  return out;
}

/** Bring the herd to rest, for the moments the fixed step does not run. */
export function haltHerd(herd) {
  for (const a of herd) {
    a.moving = false;
    a.speed = 0;
    a.walkPhase = 0;
    a.frame = 0;
  }
}
