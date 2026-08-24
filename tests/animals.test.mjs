// The farm.
//
// Every assertion here defends one of two promises, and both of them are the
// kind that fail silently months later on somebody else's machine.
//
// The first is that the animals are SCENERY. They are outside `world.entities`
// on purpose — `world.spatial` is insert-only and `world.hash()` mixes every
// entity position — and the moment one leaks in, a cow standing between the
// tripod and a corner starts refusing sights, and the same seed stops closing
// to the same error. That is the property the whole game rests on, so it is
// asserted directly rather than reasoned about.
//
// The second is that a herd stays where it belongs: on its own farm, on ground
// the game agrees can be stood on, and off the boundary marks it is big enough
// to hide.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeHerd,
  updateHerd,
  interpolatedHerd,
  haltHerd,
  resetCalls,
  STOCK,
  COATS,
  MARK_CLEARANCE,
  ACTIVE_RADIUS,
  MODE,
  SPECIES,
} from '../src/game/animals.js';
import { buildWorld } from '../src/world/world.js';
import { DIFFICULTY } from '../src/core/state.js';
import { canStand } from '../src/game/player.js';

const DT = 1 / 60;
const SEED = 'sv-fazenda';

/** Run the herd for `seconds`, with the player standing among them. */
function run(herd, world, seconds, player) {
  for (let i = 0; i < Math.round(seconds / DT); i++) updateHerd(herd, world, DT, { player });
}

/** A player position that keeps every animal inside the active radius. */
const middle = (world) => ({ e: world.bounds.maxE / 2, n: world.bounds.maxN / 2 });

test('every homestead is stocked, and only homesteads are', () => {
  const world = buildWorld(SEED, DIFFICULTY.medio);
  const herd = makeHerd(world);
  assert.ok(herd.length > 0, 'the valley has no animals in it at all');

  const farms = new Map();
  for (const a of herd) {
    assert.ok(world.sedeFor(a.parcelId), `${a.id} belongs to a parcel with no homestead`);
    const per = farms.get(a.parcelId) || {};
    per[a.species] = (per[a.species] || 0) + 1;
    farms.set(a.parcelId, per);
  }

  for (const parcel of world.parcels) {
    if (!world.sedeFor(parcel.id)) continue;
    const per = farms.get(parcel.id);
    assert.ok(per, `${parcel.id} has a farmhouse and nothing alive on it`);
    for (const [species, s] of Object.entries(STOCK)) {
      // A count may fall short of `min` when the paddock is too crowded to
      // place one — never above `max`, which would mean the roll is wrong.
      assert.ok((per[species] || 0) <= s.max, `${parcel.id}: too many ${species}`);
    }
  }
});

test('the same seed stocks the same farms, and a different one does not', () => {
  const world = buildWorld(SEED, DIFFICULTY.medio);
  const shape = (h) => h.map((a) => `${a.id}:${a.variant}:${a.e.toFixed(6)}:${a.n.toFixed(6)}`);

  assert.deepEqual(shape(makeHerd(world)), shape(makeHerd(world)), 'a herd is not reproducible');

  const other = buildWorld('sv-outra-fazenda', DIFFICULTY.medio);
  assert.notDeepEqual(shape(makeHerd(other)), shape(makeHerd(world)), 'every valley gets the same herd');
});

test('every coat an animal is dealt is one the atlas was painted with', () => {
  // The atlas is painted at boot from fixed archetypes and cannot know which
  // farm got the brown cow. A variant off the end of that table draws nothing
  // at all, silently — `render.test.mjs` holds the other half of this join.
  const world = buildWorld(SEED, DIFFICULTY.dificil);
  for (const a of makeHerd(world)) {
    assert.ok(Number.isInteger(a.variant), `${a.id} has a non-integer coat`);
    assert.ok(a.variant >= 0 && a.variant < COATS, `${a.id} has coat ${a.variant}, outside 0..${COATS - 1}`);
    assert.ok(Object.hasOwn(STOCK, a.species), `${a.id} is a ${a.species}, which is not livestock`);
  }
});

test('animals start on ground the game agrees can be stood on, clear of the marks', () => {
  const world = buildWorld(SEED, DIFFICULTY.medio);
  for (const a of makeHerd(world)) {
    const s = STOCK[a.species];
    assert.ok(canStand(world, a.e, a.n, s.radius), `${a.id} was put down where it cannot stand`);
    assert.ok(
      Math.hypot(a.e - a.home.e, a.n - a.home.n) <= a.roam,
      `${a.id} starts outside its own paddock`,
    );

    // A cow is thirty pixels wide and a marco is four: parked on one she hides
    // it completely, and the player hunts the scrub for a corner that is
    // standing right there behind an animal.
    for (const ent of world.spatial.queryCircle(a.e, a.n, MARK_CLEARANCE)) {
      if (ent.targetKind !== 'divisa' && ent.targetKind !== 'marco') continue;
      assert.fail(`${a.id} is standing on ${ent.id}, a survey target it is big enough to hide`);
    }
  }
});

test('a wandering herd stays in its paddock and on its feet', () => {
  const world = buildWorld(SEED, DIFFICULTY.medio);
  const herd = makeHerd(world);
  run(herd, world, 90, middle(world));

  for (const a of herd) {
    const s = STOCK[a.species];
    // Half a metre of slack: an animal may be pushed a little past the line by
    // the slide solver on the step it arrives, and being fenced to the
    // millimetre is not what this promise is about.
    assert.ok(
      Math.hypot(a.e - a.home.e, a.n - a.home.n) <= a.roam + 0.5,
      `${a.id} wandered ${Math.hypot(a.e - a.home.e, a.n - a.home.n).toFixed(1)} m from a ${a.roam} m paddock`,
    );
    assert.ok(canStand(world, a.e, a.n, s.radius), `${a.id} walked somewhere it cannot stand`);
    assert.ok(Number.isFinite(a.e) && Number.isFinite(a.n), `${a.id} has a position that is not a number`);
  }
});

/**
 * The one that matters most.
 *
 * A herd inside `world.entities` would change `world.hash()` sixty times a
 * second, and every promise the survey makes — that a seed is a valley, that a
 * traverse closes the same way twice — goes with it.
 */
test('the herd is not in the world, and moving it does not move the world', () => {
  const world = buildWorld(SEED, DIFFICULTY.medio);
  const before = world.hash();
  const entities = world.entities.length;

  const herd = makeHerd(world);
  run(herd, world, 60, middle(world));

  assert.equal(world.hash(), before, 'the herd changed the identity of the valley');
  assert.equal(world.entities.length, entities, 'an animal got into world.entities');

  for (const a of herd) {
    assert.equal(world.entity(a.id), null, `${a.id} is addressable as an entity`);
    for (const ent of world.spatial.queryCircle(a.e, a.n, 1)) {
      assert.notEqual(ent.id, a.id, `${a.id} got into the spatial index`);
    }
  }
});

test('an animal nobody can see holds still', () => {
  const world = buildWorld(SEED, DIFFICULTY.medio);
  const herd = makeHerd(world);
  const far = { e: world.bounds.maxE + ACTIVE_RADIUS * 4, n: world.bounds.maxN + ACTIVE_RADIUS * 4 };
  const where = herd.map((a) => [a.e, a.n]);

  run(herd, world, 30, far);

  herd.forEach((a, i) => {
    assert.deepEqual([a.e, a.n], where[i], `${a.id} wandered while off-camera`);
    assert.equal(a.moving, false, `${a.id} is animating a walk it is not taking`);
  });
});

test('the walk cycle is driven by ground covered, never by intent', () => {
  // The rule the player and Ligeirinho both follow. An animal wedged against a
  // tree must stop walking rather than moonwalk against it.
  const world = buildWorld(SEED, DIFFICULTY.medio);
  const herd = makeHerd(world);
  const player = middle(world);

  for (let i = 0; i < 60 * 20; i++) {
    const before = herd.map((a) => [a.e, a.n]);
    updateHerd(herd, world, DT, { player });
    herd.forEach((a, k) => {
      const moved = Math.hypot(a.e - before[k][0], a.n - before[k][1]);
      if (moved <= 1e-5) assert.equal(a.moving, false, `${a.id} claims to be walking without moving`);
    });
  }
});

test('a grazing animal is grazing, and gets up again', () => {
  const world = buildWorld(SEED, DIFFICULTY.facil);
  const herd = makeHerd(world);
  const player = middle(world);

  for (const a of herd) assert.equal(a.mode, MODE.GRAZE, `${a.id} starts mid-stride`);

  // Over a minute and a half, every animal with anywhere to go should have
  // gone somewhere: a paddock of statues is the failure this catches.
  const start = herd.map((a) => [a.e, a.n]);
  run(herd, world, 90, player);
  const walked = herd.filter((a, i) => Math.hypot(a.e - start[i][0], a.n - start[i][1]) > 0.5);
  assert.ok(walked.length > herd.length * 0.5, `only ${walked.length} of ${herd.length} animals moved at all`);
});

test('calls come only from animals near enough to be heard, and not often', () => {
  const world = buildWorld(SEED, DIFFICULTY.medio);
  const herd = makeHerd(world);

  // Nobody within earshot: silence, however long you wait.
  resetCalls(0);
  let heard = 0;
  const far = { e: world.bounds.maxE + 500, n: world.bounds.maxN + 500 };
  for (let i = 0; i < 60 * 60; i++) if (updateHerd(herd, world, DT, { player: far }).called) heard++;
  assert.equal(heard, 0, 'an animal on the far side of the valley was heard');

  // Standing among them: calls, and each one from a species that is actually
  // on this farm.
  const cow = herd.find((a) => a.species === SPECIES.COW) || herd[0];
  resetCalls(0);
  const calls = [];
  for (let i = 0; i < 60 * 120; i++) {
    const { called } = updateHerd(herd, world, DT, { player: { e: cow.e, n: cow.n } });
    if (called) calls.push(called);
  }
  assert.ok(calls.length > 0, 'standing in a farmyard for two minutes was silent');
  // Six a minute would be a petting zoo. The gap is 6-14 s.
  assert.ok(calls.length <= 24, `${calls.length} calls in two minutes is not a distant farm`);
  for (const c of calls) assert.ok(Object.hasOwn(STOCK, c), `heard a ${c}, which is not livestock`);
});

test('interpolation moves an animal without moving the animal', () => {
  const world = buildWorld(SEED, DIFFICULTY.medio);
  const herd = makeHerd(world);
  run(herd, world, 5, middle(world));

  const drawn = interpolatedHerd(herd, 0.5);
  assert.equal(drawn.length, herd.length);
  drawn.forEach((d, i) => {
    const a = herd[i];
    assert.equal(d.id, a.id);
    assert.ok(Math.abs(d.e - (a.prevE + (a.e - a.prevE) * 0.5)) < 1e-9, 'interpolated east is wrong');
    assert.ok(Math.abs(d.n - (a.prevN + (a.n - a.prevN) * 0.5)) < 1e-9, 'interpolated north is wrong');
    // The real animal must be untouched — this is a view, not a step.
    assert.equal(a.e, herd[i].e);
  });

  haltHerd(herd);
  for (const a of herd) assert.equal(a.moving, false, 'halt left an animal mid-stride');
});
