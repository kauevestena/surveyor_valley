// The floating thumbstick, and the promise it exists to keep: it never sits on
// a control.
//
// The pad it replaced was placed by CSS offsets that could not know how tall
// the tool rail had grown, and measured in Chromium it overlapped the rail on
// four of five touch layouts. The layouts below were measured the same way,
// from the game itself, at five screen sizes, each as it opens, with the batch
// bar up and with the checklist unfolded: `hard` is everything a thumb
// presses, which the stick may never touch, and `soft` the panels it keeps
// clear of when there is room (see `placeStick`). The geometry is asked the
// questions `game/input.js` asks, and every answer is checked.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stickZone, placeStick, restPosition, stickVector, circleHitsRect, inside, STICK_GAP } from '../src/game/stick.js';

const R = (left, top, right, bottom) => ({ left, top, right, bottom });

/** Measured from the running game in headless Chromium; CSS pixels. */
const LAYOUTS = {
  'phone 390x844': {
    view: { width: 390, height: 844 }, radius: 66, knob: 60,
    // hud-bar toolbar
    hard: [R(0, 0, 390, 74.2), R(15.6, 676.4, 374.4, 834.4)],
    // checklist tool-label
    soft: [R(140.2, 57.6, 382, 137.2), R(172.1, 808.2, 217.8, 827.4)],
  },
  'phone 390x844, batch bar shown': {
    view: { width: 390, height: 844 }, radius: 66, knob: 60,
    // field-actions hud-bar toolbar
    hard: [R(118.7, 636, 271.3, 692), R(0, 0, 390, 74.2), R(15.6, 676.4, 374.4, 834.4)],
    // checklist tool-label
    soft: [R(140.2, 57.6, 382, 137.2), R(172.1, 808.2, 217.8, 827.4)],
  },
  'phone 390x844, checklist open': {
    view: { width: 390, height: 844 }, radius: 66, knob: 60,
    // hud-bar toolbar
    hard: [R(0, 0, 390, 74.2), R(15.6, 676.4, 374.4, 834.4)],
    // checklist tool-label
    soft: [R(140.2, 57.6, 382, 526.5), R(172.1, 808.2, 217.8, 827.4)],
  },
  'phone 360x640': {
    view: { width: 360, height: 640 }, radius: 66, knob: 60,
    // hud-bar toolbar
    hard: [R(0, 0, 360, 74.2), R(14.4, 472.4, 345.6, 630.4)],
    // checklist tool-label
    soft: [R(128.8, 57.6, 352, 137.2), R(157.1, 604.2, 202.9, 623.4)],
  },
  'phone 360x640, batch bar shown': {
    view: { width: 360, height: 640 }, radius: 66, knob: 60,
    // field-actions hud-bar toolbar
    hard: [R(103.7, 432, 256.3, 488), R(0, 0, 360, 74.2), R(14.4, 472.4, 345.6, 630.4)],
    // checklist tool-label
    soft: [R(128.8, 57.6, 352, 137.2), R(157.1, 604.2, 202.9, 623.4)],
  },
  'phone 360x640, checklist open': {
    view: { width: 360, height: 640 }, radius: 66, knob: 60,
    // hud-bar toolbar
    hard: [R(0, 0, 360, 74.2), R(14.4, 472.4, 345.6, 630.4)],
    // checklist tool-label
    soft: [R(128.8, 57.6, 352, 441.6), R(157.1, 604.2, 202.9, 623.4)],
  },
  'phone landscape 844x390': {
    view: { width: 844, height: 390 }, radius: 72, knob: 64,
    // hud-bar toolbar
    hard: [R(0, 0, 844, 76.6), R(9.6, 78.4, 154, 352.4)],
    // checklist tool-label
    soft: [R(580.4, 64, 830.4, 153.2), R(160.6, 89.4, 212.4, 117)],
  },
  'phone landscape 844x390, batch bar shown': {
    view: { width: 844, height: 390 }, radius: 72, knob: 64,
    // field-actions hud-bar toolbar
    hard: [R(345.7, 266.8, 498.3, 322.8), R(0, 0, 844, 76.6), R(9.6, 78.4, 154, 352.4)],
    // checklist tool-label
    soft: [R(580.4, 64, 830.4, 153.2), R(160.6, 89.4, 212.4, 117)],
  },
  'phone landscape 844x390, checklist open': {
    view: { width: 844, height: 390 }, radius: 72, knob: 64,
    // hud-bar toolbar
    hard: [R(0, 0, 844, 76.6), R(9.6, 78.4, 154, 352.4)],
    // checklist tool-label
    soft: [R(580.4, 64, 830.4, 366), R(160.6, 89.4, 212.4, 117)],
  },
  'tablet 768x1024': {
    view: { width: 768, height: 1024 }, radius: 72, knob: 64,
    // hud-bar toolbar
    hard: [R(0, 0, 768, 76.6), R(9.6, 245.4, 89.2, 778.6)],
    // checklist tool-label tool-label tool-label tool-label tool-label tool-label tool-label tool-label
    soft: [R(504.4, 64, 754.4, 153.2), R(85, 271.4, 136.8, 299), R(85, 336.2, 205.2, 363.8), R(85, 401, 212.8, 428.6), R(85, 465.8, 187.8, 493.4), R(85, 530.6, 170.5, 558.2), R(85, 595.4, 192, 623), R(85, 660.2, 172.6, 687.8), R(85, 725, 194.1, 752.6)],
  },
  'tablet 768x1024, batch bar shown': {
    view: { width: 768, height: 1024 }, radius: 72, knob: 64,
    // field-actions hud-bar toolbar
    hard: [R(307.7, 900.8, 460.3, 956.8), R(0, 0, 768, 76.6), R(9.6, 245.4, 89.2, 778.6)],
    // checklist tool-label tool-label tool-label tool-label tool-label tool-label tool-label tool-label
    soft: [R(504.4, 64, 754.4, 153.2), R(85, 271.4, 136.8, 299), R(85, 336.2, 205.2, 363.8), R(85, 401, 212.8, 428.6), R(85, 465.8, 187.8, 493.4), R(85, 530.6, 170.5, 558.2), R(85, 595.4, 192, 623), R(85, 660.2, 172.6, 687.8), R(85, 725, 194.1, 752.6)],
  },
  'tablet 768x1024, checklist open': {
    view: { width: 768, height: 1024 }, radius: 72, knob: 64,
    // hud-bar toolbar
    hard: [R(0, 0, 768, 76.6), R(9.6, 245.4, 89.2, 778.6)],
    // checklist tool-label tool-label tool-label tool-label tool-label tool-label tool-label tool-label
    soft: [R(504.4, 64, 754.4, 542.5), R(85, 271.4, 136.8, 299), R(85, 336.2, 205.2, 363.8), R(85, 401, 212.8, 428.6), R(85, 465.8, 187.8, 493.4), R(85, 530.6, 170.5, 558.2), R(85, 595.4, 192, 623), R(85, 660.2, 172.6, 687.8), R(85, 725, 194.1, 752.6)],
  },
  'tablet landscape 1024x768': {
    view: { width: 1024, height: 768 }, radius: 72, knob: 64,
    // hud-bar toolbar
    hard: [R(0, 0, 1024, 76.6), R(9.6, 247, 154, 521)],
    // checklist tool-label
    soft: [R(760.4, 64, 1010.4, 153.2), R(160.6, 258, 212.4, 285.6)],
  },
  'tablet landscape 1024x768, batch bar shown': {
    view: { width: 1024, height: 768 }, radius: 72, knob: 64,
    // field-actions hud-bar toolbar
    hard: [R(435.7, 644.8, 588.3, 700.8), R(0, 0, 1024, 76.6), R(9.6, 247, 154, 521)],
    // checklist tool-label
    soft: [R(760.4, 64, 1010.4, 153.2), R(160.6, 258, 212.4, 285.6)],
  },
  'tablet landscape 1024x768, checklist open': {
    view: { width: 1024, height: 768 }, radius: 72, knob: 64,
    // hud-bar toolbar
    hard: [R(0, 0, 1024, 76.6), R(9.6, 247, 154, 521)],
    // checklist tool-label
    soft: [R(760.4, 64, 1010.4, 542.5), R(160.6, 258, 212.4, 285.6)],
  },
};

/** What `input.js#layoutStick` derives from the measured base and knob. */
function geometry(L) {
  const travel = L.radius - L.knob / 4;
  const reach = Math.max(L.radius, travel + L.knob / 2);
  const zone = stickZone({ view: L.view, obstacles: L.hard, radius: reach });
  return { travel, reach, zone };
}

const clearOf = (p, r, obstacles) => obstacles.filter((o) => circleHitsRect(p.x, p.y, r, o));
const onScreen = (p, r, view) => p.x - r >= 0 && p.y - r >= 0 && p.x + r <= view.width && p.y + r <= view.height;

test('the stick waits clear of every control, in the lower left, on every measured layout', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) {
    const { reach, zone } = geometry(L);
    const rest = restPosition({ ...zone, obstacles: L.hard, soft: L.soft, radius: reach });
    assert.ok(rest, `${name}: nowhere for the stick to wait`);
    assert.deepEqual(clearOf(rest, reach + STICK_GAP, L.hard), [], `${name}: the waiting stick is on a button`);
    assert.ok(onScreen(rest, reach, L.view), `${name}: the waiting stick is off the screen`);
    assert.ok(inside(rest, zone.touch), `${name}: the stick waits outside the corner a thumb starts it from`);
    assert.ok(rest.x < L.view.width / 2 && rest.y > L.view.height / 2, `${name}: the stick is not waiting in the lower left`);

    // Clear of the reading panels too — unless nothing clear of them exists,
    // and then it keeps exactly the place it would have had without them.
    if (clearOf(rest, reach + STICK_GAP, L.soft).length) {
      const everything = [...L.hard, ...L.soft];
      assert.equal(restPosition({ ...zone, obstacles: everything, radius: reach }), null, `${name}: it sat under a panel with room to spare`);
      assert.deepEqual(rest, restPosition({ ...zone, obstacles: L.hard, radius: reach }), name);
    }
  }
});

test('wherever a thumb comes down in the quarter, the stick lands clear of every button', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) {
    const { reach, zone } = geometry(L);
    let tried = 0;
    for (let x = zone.touch.left; x <= zone.touch.right; x += 6) {
      for (let y = zone.touch.top; y <= zone.touch.bottom; y += 6) {
        const at = placeStick({ x, y }, { free: zone.free, obstacles: L.hard, soft: L.soft, radius: reach });
        assert.ok(at, `${name}: no place for a thumb at ${x},${y}`);
        assert.deepEqual(clearOf(at, reach + STICK_GAP, L.hard), [], `${name}: a thumb at ${x},${y} put the stick on a button`);
        assert.ok(onScreen(at, reach, L.view), `${name}: a thumb at ${x},${y} put the stick off the screen`);
        tried++;
      }
    }
    assert.ok(tried > 100, `${name}: only ${tried} points tried`);
  }
});

test('with room to spare, the stick comes up exactly under the thumb', () => {
  let checked = 0;
  for (const [name, L] of Object.entries(LAYOUTS)) {
    const { reach, zone } = geometry(L);
    const rest = restPosition({ ...zone, obstacles: L.hard, soft: L.soft, radius: reach });
    // A little up and to the right of where it waits, when that is clear of everything.
    const thumb = { x: rest.x + 6, y: rest.y - 6 };
    if (clearOf(thumb, reach + STICK_GAP, [...L.hard, ...L.soft]).length || !inside(thumb, zone.touch)) continue;
    assert.deepEqual(placeStick(thumb, { free: zone.free, obstacles: L.hard, soft: L.soft, radius: reach }), thumb, name);
    checked++;
  }
  assert.ok(checked >= 10, `only ${checked} layouts had room to check`);
});

test('a thumb just above the phone rail lifts the stick exactly clear of it', () => {
  const L = LAYOUTS['phone 390x844'];
  const { reach, zone } = geometry(L);
  const rail = L.hard.find((o) => o.top > L.view.height / 2 && o.right - o.left > L.view.width * 0.6);
  const at = placeStick({ x: 110, y: rail.top - 4 }, { free: zone.free, obstacles: L.hard, soft: L.soft, radius: reach });
  assert.equal(at.x, 110);
  assert.ok(Math.abs(at.y - (rail.top - reach - STICK_GAP)) < 1e-9, `${at.y} against ${rail.top - reach - STICK_GAP}`);
});

test('the corner is the lower-left quarter of the free area, and grows when a quarter cannot hold the stick', () => {
  const view = { width: 400, height: 800 };
  const hud = R(0, 0, 400, 70);
  const rail = R(10, 650, 390, 790);
  const { free, touch } = stickZone({ view, obstacles: [hud, rail], radius: 50 });
  assert.deepEqual(free, R(0, 70, 400, 650));
  assert.deepEqual(touch, R(0, 360, 200, 650));

  // A short screen: half of 120 px cannot hold a 120 px stick, so the corner grows to fit it.
  const short = stickZone({ view: { width: 400, height: 190 }, obstacles: [hud], radius: 50 });
  assert.equal(short.touch.bottom - short.touch.top, 120);

  // The safe-area insets are edges too.
  const notched = stickZone({ view, obstacles: [hud], radius: 50, insets: { left: 44, bottom: 30 } });
  assert.equal(notched.free.left, 44);
  assert.equal(notched.free.bottom, 770);
});

test('with no room anywhere, there is no stick rather than one on a button', () => {
  const free = R(0, 0, 400, 400);
  assert.equal(placeStick({ x: 100, y: 300 }, { free, obstacles: [R(0, 0, 400, 400)], radius: 60 }), null);
  assert.equal(placeStick({ x: 100, y: 300 }, { free: R(0, 0, 100, 100), obstacles: [], radius: 60 }), null);
  // A reading panel over everything does not take the stick away; a button would.
  const panel = R(0, 0, 400, 400);
  assert.deepEqual(placeStick({ x: 100, y: 300 }, { free, obstacles: [], soft: [panel], radius: 60 }), { x: 100, y: 300 });
});

test('a drag means the same thing wherever the base had to go', () => {
  const still = stickVector(0, 0, 50);
  assert.deepEqual([still.e, still.n, still.magnitude], [0, 0, 0]);

  const east = stickVector(50, 0, 50);
  assert.ok(Math.abs(east.e - 1) < 1e-12 && Math.abs(east.n) < 1e-12);

  // Screen y grows down; dragging up is north.
  const north = stickVector(0, -25, 50);
  assert.ok(Math.abs(north.n - 0.5) < 1e-12 && Math.abs(north.e) < 1e-12);
  assert.deepEqual(north.knob, { x: 0, y: -25 });

  // Past the travel it saturates: only the direction still changes.
  const far = stickVector(300, 400, 50);
  assert.ok(Math.abs(far.magnitude - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(far.knob.x, far.knob.y) - 50) < 1e-9);
  assert.ok(Math.abs(far.e - 0.6) < 1e-12 && Math.abs(far.n + 0.8) < 1e-12);
});

test('touching an edge is not a collision; being inside one is', () => {
  const box = R(0, 0, 100, 100);
  assert.equal(circleHitsRect(150, 50, 50, box), false);
  assert.equal(circleHitsRect(149, 50, 50, box), true);
  assert.equal(circleHitsRect(50, 50, 1, box), true);
});
