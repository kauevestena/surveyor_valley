// The farm: chickens, cows, pigs, and the pet at an owner's side.
//
// The valley had six farmhouses, six yards and nothing alive in any of them.
// The moradores were added for exactly this reason — a name in a memorial is
// not a neighbour — and a homestead with no animal in it is a diagram of a farm
// rather than a farm.
//
// Same conventions as every other sprite in the game, and they are what make a
// hen and a fence post look like they were drawn by the same hand: light comes
// from the upper left, colour comes from three-step ramps in `palette.js` and
// nowhere else, there is a contact shadow under everything, and the returned
// anchor puts the feet on the same ground line the crew stands on.
//
// The signature mirrors `character.js#surveyor` on purpose. Four walk frames
// computed from one swing parameter, west produced by mirroring east in the
// roster, and an `idle` pose that is the top of a breath — so the animals share
// the crew's animation contract instead of inventing a second one that would
// drift away from it.
//
// `graze` is the pose with no equivalent among the people: head down, eating.
// It is what an animal in a field does for most of the day, and alternating it
// with `idle` is what stops a paddock reading as a display case.

import { makePix, contactShadow, P } from './shared.js';

/** Coats per species. Two each, so a flock does not read as one bird copied. */
export const ANIMAL_VARIANTS = 2;

/**
 * Frames 0 and 2 are the passing pose, 1 and 3 the strides — the same table
 * `surveyor()` swings its limbs from, so a cow and a surveyor walking side by
 * side are on the same beat.
 */
const SWING = [0, 1, 0, -1];

/**
 * One leg: a tapered limb from body to foot, with the foot drawn last.
 *
 * Thickness is a parameter rather than a constant because a cow's cannon bone
 * and a chicken's shank are two pixels apart in width and that difference is
 * most of what says which animal you are looking at from behind.
 */
function leg(pix, x, top, bottom, dx, colour, foot = null, half = 1) {
  const span = Math.max(1, bottom - top);
  for (let y = top; y <= bottom; y++) {
    const k = (y - top) / span;
    const cx = x + dx * k;
    pix.hline(Math.round(cx - half), Math.round(cx + half), y, colour);
  }
  if (foot) pix.ellipse(x + dx, bottom, half + 0.6, 1, foot);
}

/** A tail hanging and swinging: a line with a tuft on the end. */
function tail(pix, x, y, len, dx, colour, tuft = null) {
  for (let i = 0; i <= len; i++) {
    const k = i / len;
    pix.px(Math.round(x + dx * k * k), Math.round(y + i), colour);
  }
  if (tuft) pix.ellipse(x + dx, y + len + 0.5, 1.4, 1.4, tuft);
}

/**
 * Blotches on a hide, placed from a fixed table rather than an rng.
 *
 * The atlas is painted from a constant seed for a reason — the art must not
 * change under a player between sessions — and a patched cow whose patches
 * moved would break that far more visibly than a tree would.
 */
function patches(pix, spots, colour) {
  for (const [x, y, rx, ry] of spots) pix.ellipse(x, y, rx, ry, colour);
}

// ---------------------------------------------------------------- chicken ---

const CHICKEN_COATS = [
  { body: P.feather, wing: P.featherRed },
  // A warm dark brown, not `hideDark`: the tail is the whole of the view from
  // behind, and painted in a near-black the bird reads as a hole in the grass
  // rather than as a hen.
  { body: P.featherRed, wing: P.woodDark },
];

const CH_W = 10;
const CH_H = 12;

/**
 * A hen.
 *
 * The smallest animal in the game and the one that has to survive being three
 * pixels of body: everything below is in service of the silhouette — a round
 * body, a tail cocked up behind, a comb on top — because at this size the
 * outline is the whole of what reads.
 */
export function chicken({ dir = 'S', frame = 0, pose = 'walk', variant = 0 } = {}) {
  const c = CHICKEN_COATS[variant % CHICKEN_COATS.length];
  const pix = makePix(CH_W, CH_H);
  const cx = CH_W / 2;
  const baseY = 10;

  const graze = pose === 'graze';
  const lift = pose === 'idle' ? 1 : 0;
  const swing = SWING[frame % 4];
  const side = dir === 'E';

  // A pecking hen folds down over her feet; a breath lifts the whole bird,
  // which is right for something this round — there is no torso to lengthen.
  const bodyCy = (graze ? 7.4 : 6.2) - lift * 0.5;
  const headCy = graze ? 8.6 : 2.9 - lift;
  const headX = side ? cx + 2.6 : cx;

  contactShadow(pix, cx, baseY + 1, 3.4, 1.5);

  // ---- legs: shanks and toes, and they are always under the bird ----------
  leg(pix, cx - 1.4, bodyCy + 2, baseY, swing * 0.8, P.beak[0], null, 0);
  leg(pix, cx + 1.4, bodyCy + 2, baseY, -swing * 0.8, P.beak[1], null, 0);
  pix.hline(cx - 2.4 + swing * 0.8, cx - 0.4 + swing * 0.8, baseY, P.beak[1]);
  pix.hline(cx + 0.4 - swing * 0.8, cx + 2.4 - swing * 0.8, baseY, P.beak[0]);

  // ---- tail, behind the body ---------------------------------------------
  // Cocked up, and the one part of a hen that survives at any distance.
  if (dir !== 'N') {
    const tx = side ? cx - 3.4 : cx;
    pix.ellipse(tx, bodyCy - 2.2, side ? 1.8 : 2.6, side ? 2.2 : 1.4, c.wing[1]);
    pix.ellipse(tx + (side ? 0.6 : 0), bodyCy - 1.4, side ? 1.2 : 1.8, 1.0, c.wing[0]);
  }

  // ---- body ---------------------------------------------------------------
  pix.ellipse(cx, bodyCy, side ? 3.4 : 2.9, 2.9, c.body[1]);
  pix.ellipse(cx - 0.9, bodyCy - 0.9, 1.8, 1.6, c.body[2]);
  pix.ellipse(cx + 1.2, bodyCy + 1.2, 1.5, 1.3, c.body[0]);

  if (dir === 'N') {
    // From behind: the tail is what you see, straight up the middle.
    pix.ellipse(cx, bodyCy - 2.4, 2.2, 2.0, c.wing[1]);
    pix.ellipse(cx - 0.6, bodyCy - 3.0, 1.2, 1.2, c.wing[2]);
    // Folded wing tips either side of the tail, and the comb just clearing the
    // top of the head. Without them the view from behind is a brown lump with
    // legs, indistinguishable from anything else in the game at this size.
    pix.ellipse(cx - 2.2, bodyCy + 0.6, 1.2, 1.8, c.wing[2]);
    pix.ellipse(cx + 2.2, bodyCy + 0.6, 1.2, 1.8, c.wing[1]);
    if (!graze) pix.ellipse(cx, bodyCy - 4.2, 1.0, 0.8, P.comb[0]);
  } else {
    // A folded wing, and it is drawn on the near flank only — a wing on a
    // front-on bird is two pixels of noise.
    if (side) pix.ellipse(cx + 0.4, bodyCy + 0.4, 1.9, 1.5, c.wing[1]);
  }

  // ---- head and neck ------------------------------------------------------
  if (dir !== 'N') {
    pix.vline(Math.round(headX), Math.round(headCy) + 1, Math.round(bodyCy) - 1, c.body[1]);
    pix.disc(headX, headCy, 1.7, c.body[1]);
    pix.disc(headX - 0.5, headCy - 0.5, 1.0, c.body[2]);

    // Comb and wattle, in the one saturated colour on the bird.
    pix.ellipse(headX, headCy - 1.9, 1.2, 0.9, P.comb[1]);
    pix.px(Math.round(headX), Math.round(headCy) + 2, P.comb[0]);

    if (side) {
      pix.px(Math.round(headX) + 1, Math.round(headCy), '#2b2b2b');
      pix.hline(Math.round(headX) + 2, Math.round(headX) + 3, Math.round(headCy) + (graze ? 1 : 0), P.beak[1]);
    } else {
      pix.px(Math.round(headX) - 1, Math.round(headCy), '#2b2b2b');
      pix.px(Math.round(headX) + 1, Math.round(headCy), '#2b2b2b');
      pix.px(Math.round(headX), Math.round(headCy) + 1, P.beak[1]);
    }
  }

  pix.outline('auto', { amount: 0.46 });
  return { pix, anchorX: 0.5, anchorY: (baseY + 1) / CH_H };
}

// -------------------------------------------------------------------- cow ---

const COW_COATS = [
  {
    hide: P.hide,
    mark: P.hideDark,
    spots: [[8, 9, 3.2, 2.4], [17, 13, 2.6, 1.8], [12, 7, 2.0, 1.4]],
    front: [[13, 8, 2.2, 1.8], [18, 12, 1.8, 1.4]],
  },
  { hide: P.hideBrown, mark: P.hideDark, spots: [], front: [] },
];

const COW_W = 30;
const COW_H = 22;

/**
 * A cow. The biggest thing that moves in the valley, and the one whose walk has
 * to look like weight rather than like a trot — hence the slower swing and the
 * head that swings with the stride rather than staying level.
 */
export function cow({ dir = 'S', frame = 0, pose = 'walk', variant = 0 } = {}) {
  const c = COW_COATS[variant % COW_COATS.length];
  const pix = makePix(COW_W, COW_H);
  const cx = COW_W / 2;
  const baseY = 20;

  const graze = pose === 'graze';
  const lift = pose === 'idle' ? 1 : 0;
  const swing = SWING[frame % 4] * 1.6;
  const side = dir === 'E';

  contactShadow(pix, cx, baseY + 1, side ? 10 : 5.5, 2.4);

  if (side) {
    const backY = 9 - lift;
    const bellyY = 16;

    // ---- far legs first, so the near pair overlaps them ------------------
    leg(pix, cx - 6, bellyY - 1, baseY - 1, -swing, c.hide[0], P.hideDark[0], 1);
    leg(pix, cx + 6, bellyY - 1, baseY - 1, swing, c.hide[0], P.hideDark[0], 1);

    // ---- tail --------------------------------------------------------------
    tail(pix, cx - 10, backY + 1, 7, -1.5 - swing * 0.4, c.hide[0], P.hideDark[1]);

    // ---- barrel ------------------------------------------------------------
    pix.ellipse(cx - 1, (backY + bellyY) / 2, 9.5, 4.4, c.hide[1]);
    pix.ellipse(cx - 3, backY + 1.6, 6.5, 2.2, c.hide[2]);
    pix.ellipse(cx + 2, bellyY - 1.4, 6.0, 2.0, c.hide[0]);
    // The rump, squared off — a cow tapers to the shoulder, not to the tail.
    pix.ellipse(cx - 8, (backY + bellyY) / 2 - 0.5, 3.0, 4.0, c.hide[1]);
    patches(pix, c.spots, c.mark);

    // ---- near legs ---------------------------------------------------------
    leg(pix, cx - 4.5, bellyY - 1, baseY, swing, c.hide[1], P.hideDark[1], 1);
    leg(pix, cx + 7.5, bellyY - 1, baseY, -swing, c.hide[1], P.hideDark[1], 1);

    // ---- neck and head -----------------------------------------------------
    // Grazing drops the whole head-and-neck assembly to the ground rather than
    // bending the neck alone: a cow eats with her nose in the grass.
    const headCy = graze ? baseY - 3 : backY - 1;
    const headX = cx + 11.5;
    pix.poly(
      [
        [cx + 6, backY - 0.5],
        [headX - 1, headCy - 2.2],
        [headX + 0.5, headCy + 2.2],
        [cx + 7, bellyY - 3],
      ],
      c.hide[1],
    );
    pix.ellipse(headX, headCy, 3.0, 2.4, c.hide[1]);
    pix.ellipse(headX - 0.8, headCy - 0.9, 1.8, 1.2, c.hide[2]);
    // Muzzle: the one pink on the animal, and what makes it a cow's face.
    pix.ellipse(headX + 2.2, headCy + 1.1, 1.6, 1.4, P.pork[1]);
    pix.px(Math.round(headX) + 2, Math.round(headCy) + 1, P.porkDark[0]);
    pix.px(Math.round(headX) + 1, Math.round(headCy) - 1, '#2b2b2b');
    // Ear back, horn forward.
    pix.ellipse(headX - 2.6, headCy - 1.6, 1.5, 1.0, c.hide[0]);
    pix.ellipse(headX - 0.4, headCy - 2.8, 1.2, 0.8, P.horn[1]);
  } else {
    const north = dir === 'N';
    const chestCy = 13.5 - lift * 0.5;
    const bellyY = 16;

    // Head-on, a cow is a chest with a head on it — the barrel is BEHIND and
    // shows only as width at the shoulders. Drawing the full body oval here is
    // what made the first attempt read as a sheep.
    pix.ellipse(cx, chestCy, 6.0, 4.4, c.hide[1]);
    pix.ellipse(cx - 2.4, chestCy - 2.0, 3.6, 2.2, c.hide[2]);
    pix.ellipse(cx + 2.6, chestCy + 2.0, 3.0, 1.8, c.hide[0]);
    patches(pix, c.front, c.mark);

    leg(pix, cx - 3.6, bellyY - 1, baseY, swing, c.hide[1], P.hideDark[1], 1);
    leg(pix, cx + 3.6, bellyY - 1, baseY, -swing, c.hide[0], P.hideDark[0], 1);

    if (north) {
      // From behind: rump, tail down the middle, and two ear tips over the top.
      // No face at all, which is the whole of what distinguishes this view.
      pix.ellipse(cx, chestCy - 0.5, 5.6, 4.6, c.hide[1]);
      pix.ellipse(cx - 2.2, chestCy - 2.2, 3.2, 2.2, c.hide[2]);
      tail(pix, cx, chestCy - 5, 9, 0.5, c.hide[0], P.hideDark[1]);
      pix.ellipse(cx - 4.6, chestCy - 5.4, 1.7, 1.1, c.hide[1]);
      pix.ellipse(cx + 4.6, chestCy - 5.4, 1.7, 1.1, c.hide[0]);
    } else {
      // Grazing head-on is a NOD, not a nose in the grass: from directly in
      // front there is nothing of a lowered head left to see, so dropping it
      // all the way just hid the face behind the chest.
      const headCy = (graze ? chestCy - 1.4 : chestCy - 5.6) + lift * 0.5;

      // Ears first, so the skull overlaps their roots rather than floating
      // between them.
      pix.ellipse(cx - 4.4, headCy + 0.4, 1.9, 1.2, c.hide[1]);
      pix.ellipse(cx + 4.4, headCy + 0.4, 1.9, 1.2, c.hide[0]);

      pix.ellipse(cx, headCy, 3.4, 3.2, c.hide[1]);
      pix.ellipse(cx - 1.3, headCy - 1.3, 1.9, 1.5, c.hide[2]);

      // Two separate marks at the corners of the skull. A single band across
      // the top reads as a hat, which is exactly what the first pass looked
      // like.
      pix.ellipse(cx - 2.8, headCy - 2.9, 1.2, 0.8, P.horn[1]);
      pix.ellipse(cx + 2.8, headCy - 2.9, 1.2, 0.8, P.horn[0]);

      pix.ellipse(cx, headCy + 2.2, 2.4, 1.6, P.pork[1]);
      pix.px(Math.round(cx) - 1, Math.round(headCy) + 2, P.porkDark[0]);
      pix.px(Math.round(cx) + 1, Math.round(headCy) + 2, P.porkDark[0]);
      pix.px(Math.round(cx) - 2, Math.round(headCy) - 1, '#2b2b2b');
      pix.px(Math.round(cx) + 2, Math.round(headCy) - 1, '#2b2b2b');
    }
  }

  pix.outline('auto', { amount: 0.46 });
  return { pix, anchorX: 0.5, anchorY: (baseY + 1) / COW_H };
}

// -------------------------------------------------------------------- pig ---

const PIG_COATS = [
  { hide: P.pork, mark: P.porkDark, spots: [] },
  { hide: P.pork, mark: P.hideDark, spots: [[7, 8, 2.4, 1.8], [14, 10, 1.8, 1.4]] },
];

const PIG_W = 20;
const PIG_H = 14;

/** A pig. Low, wide and nearly all barrel — the silhouette does the work. */
export function pig({ dir = 'S', frame = 0, pose = 'walk', variant = 0 } = {}) {
  const c = PIG_COATS[variant % PIG_COATS.length];
  const pix = makePix(PIG_W, PIG_H);
  const cx = PIG_W / 2;
  const baseY = 12;

  const graze = pose === 'graze';
  const lift = pose === 'idle' ? 1 : 0;
  const swing = SWING[frame % 4];
  const side = dir === 'E';

  contactShadow(pix, cx, baseY + 1, side ? 6.5 : 4, 1.8);

  if (side) {
    const backY = 5 - lift;
    const bellyY = 10;

    leg(pix, cx - 4, bellyY - 1, baseY - 1, -swing, c.hide[0], P.porkDark[0], 0);
    leg(pix, cx + 4, bellyY - 1, baseY - 1, swing, c.hide[0], P.porkDark[0], 0);

    // The curl, and nothing else says pig this fast.
    pix.px(Math.round(cx) - 7, Math.round(backY) + 1, c.hide[0]);
    pix.px(Math.round(cx) - 8, Math.round(backY) + 1, c.hide[0]);
    pix.px(Math.round(cx) - 8, Math.round(backY), c.hide[0]);

    pix.ellipse(cx, (backY + bellyY) / 2, 6.4, 3.2, c.hide[1]);
    pix.ellipse(cx - 2, backY + 1.2, 4.2, 1.6, c.hide[2]);
    pix.ellipse(cx + 1.5, bellyY - 1.0, 4.0, 1.4, c.hide[0]);
    patches(pix, c.spots, c.mark);

    leg(pix, cx - 3, bellyY - 1, baseY, swing, c.hide[1], P.porkDark[1], 0);
    leg(pix, cx + 5, bellyY - 1, baseY, -swing, c.hide[1], P.porkDark[1], 0);

    // A pig's head runs straight on from the shoulder — there is no neck to
    // draw, and drawing one makes it a dog.
    const headCy = graze ? bellyY - 0.5 : (backY + bellyY) / 2 - 0.6;
    const headX = cx + 6.6;
    pix.ellipse(headX, headCy, 2.8, 2.6, c.hide[1]);
    pix.ellipse(headX - 0.8, headCy - 0.8, 1.6, 1.2, c.hide[2]);
    pix.ellipse(headX + 2.2, headCy + 0.6, 1.5, 1.3, c.mark[1]);
    pix.px(Math.round(headX) + 2, Math.round(headCy), '#2b2b2b');
    // The ear flops forward over the eye, which is what a pig's does.
    pix.ellipse(headX - 0.6, headCy - 2.0, 1.8, 1.4, c.hide[0]);
  } else {
    const north = dir === 'N';
    const backY = 6 - lift;
    const bellyY = 10;

    pix.ellipse(cx, (backY + bellyY) / 2 + 0.5, 4.2, 3.4, c.hide[1]);
    pix.ellipse(cx - 1.5, backY + 1.4, 2.6, 1.8, c.hide[2]);
    patches(pix, c.spots.map(([x, y, rx, ry]) => [cx + (x - 10) * 0.4, y - 1, rx * 0.7, ry * 0.7]), c.mark);

    leg(pix, cx - 2.4, bellyY - 1, baseY, swing, c.hide[1], P.porkDark[1], 0);
    leg(pix, cx + 2.4, bellyY - 1, baseY, -swing, c.hide[0], P.porkDark[0], 0);

    if (north) {
      pix.px(Math.round(cx), Math.round(backY), c.hide[0]);
      pix.px(Math.round(cx), Math.round(backY) - 1, c.hide[0]);
      pix.px(Math.round(cx) + 1, Math.round(backY) - 1, c.hide[0]);
    } else {
      // A nod, for the reason the cow's front view nods: head-on there is
      // nothing of a lowered head left to see.
      const headCy = (graze ? backY + 0.4 : backY - 1.6) + lift * 0.5;
      pix.ellipse(cx, headCy, 3.0, 2.4, c.hide[1]);
      pix.ellipse(cx - 1.0, headCy - 0.8, 1.6, 1.2, c.hide[2]);
      pix.ellipse(cx, headCy + 1.4, 1.8, 1.2, c.mark[1]);
      pix.px(Math.round(cx) - 1, Math.round(headCy) + 1, P.porkDark[0]);
      pix.px(Math.round(cx) + 1, Math.round(headCy) + 1, P.porkDark[0]);
      pix.px(Math.round(cx) - 2, Math.round(headCy) - 1, '#2b2b2b');
      pix.px(Math.round(cx) + 2, Math.round(headCy) - 1, '#2b2b2b');
      pix.ellipse(cx - 2.8, headCy - 1.6, 1.5, 1.3, c.hide[0]);
      pix.ellipse(cx + 2.8, headCy - 1.6, 1.5, 1.3, c.hide[0]);
    }
  }

  pix.outline('auto', { amount: 0.46 });
  return { pix, anchorX: 0.5, anchorY: (baseY + 1) / PIG_H };
}

// ------------------------------------------------------------------- pets ---

const CAT_COATS = [
  { fur: P.furTabby, mark: P.furDark },
  { fur: P.furSoot, mark: P.furSoot },
];
const DOG_COATS = [
  { fur: P.furTan, mark: P.furDark },
  { fur: P.furDark, mark: P.furTan },
];

/**
 * A cat or a dog, sitting.
 *
 * SITTING IS THE WHOLE ROSTER, for the same reason the landowners have no walk
 * cycle: this animal is at its person's side and its person does not move. Two
 * poses a direction — the rest pose and the top of a breath — and `scene.js`
 * drives both from the SAME breath the owner is on, so the pair rise and settle
 * together instead of reading as two unrelated sprites that happen to be near
 * each other.
 *
 * The two species share this painter because they share the pose: a sitting
 * animal is a haunch, a straight front leg, a chest and a head. What separates
 * them at thirteen pixels is the ear and the muzzle, so those are the only
 * things the shape table below actually changes.
 */
const PET = {
  cat: {
    W: 12, H: 15, baseY: 13,
    coats: CAT_COATS,
    ears: 'point',
    r: 2.5,          // skull radius
    chest: 2.7,      // half-width at the shoulders
    haunch: 3.0,
    snout: 1.4,
    tailLen: 7,
    sit: 9,          // height of the skull centre above the ground line
  },
  dog: {
    W: 14, H: 17, baseY: 15,
    coats: DOG_COATS,
    ears: 'flop',
    r: 2.9,
    chest: 3.2,
    haunch: 3.6,
    snout: 2.2,
    tailLen: 6,
    sit: 10,
  },
};

export function pet(species, { dir = 'S', pose = 'sit', variant = 0 } = {}) {
  const s = PET[species] || PET.cat;
  const c = s.coats[variant % s.coats.length];
  const pix = makePix(s.W, s.H);
  const cx = s.W / 2;
  const baseY = s.baseY;

  // The breath lifts the head and the shoulders and leaves the haunch on the
  // ground — an animal breathing, not an animal bouncing. Same rule the
  // surveyor's idle follows, for the same reason.
  const lift = pose === 'idle' ? 1 : 0;
  const side = dir === 'E';
  const north = dir === 'N';

  const headCy = baseY - s.sit - lift;
  const eye = '#2b2b2b';

  contactShadow(pix, cx, baseY + 1, s.haunch + 1, 1.6);

  if (side) {
    // Profile, facing east. The three masses have to stay SEPARATE or the
    // whole thing is one lump: haunch on the ground at the back, chest rising
    // in front of it, skull above the chest with a neck you can see.
    const hipX = cx - 2.8;
    const chestX = cx + 1.8;
    const headX = cx + 2.6;

    tail(pix, hipX - s.haunch + 0.5, baseY - s.haunch - 1, s.tailLen, -1.8, c.fur[0]);

    // Haunch: the folded back leg, on the ground at the rear.
    pix.ellipse(hipX, baseY - 2.6, s.haunch, 2.8, c.fur[1]);
    pix.ellipse(hipX - 0.8, baseY - 3.6, s.haunch - 1.4, 1.5, c.fur[2]);

    // Chest: a NARROW upright column in front of the haunch, shoulder down to
    // paw. Sitting is a vertical silhouette. The first pass ran the chest out
    // to a six-pixel base along the ground and the result was unmistakably an
    // animal lying down — a sphinx, not a dog waiting beside its person.
    const top = Math.round(headCy + s.r - 1);
    for (let y = top; y <= baseY - 2; y++) {
      const k = (y - top) / Math.max(1, baseY - 2 - top);
      const hw = s.chest * (0.5 + 0.22 * k);
      pix.hline(Math.round(chestX - hw), Math.round(chestX + hw), y, c.fur[1]);
      pix.px(Math.round(chestX - hw), y, c.fur[2]);
      pix.px(Math.round(chestX + hw), y, c.fur[0]);
    }
    pix.ellipse(chestX + 0.8, baseY - 1, 1.7, 1.2, c.fur[2]);

    petHead(pix, s, c, headX, headCy, 'E', eye);
  } else {
    // Head-on and from behind: the haunch is hidden, so this is a chest, two
    // front paws and a head — narrower than the profile, which is what says
    // the animal has turned rather than changed size.
    if (north) tail(pix, cx + s.chest * 0.8, baseY - s.haunch - 2, s.tailLen, 0.9, c.fur[0]);

    pix.ellipse(cx, baseY - 3, s.haunch, 3.0, c.fur[1]);
    pix.ellipse(cx - 1.2, baseY - 4, s.haunch - 1.6, 1.6, c.fur[2]);

    for (let y = Math.round(headCy + s.r); y <= baseY - 2; y++) {
      const k = (y - (headCy + s.r)) / Math.max(1, baseY - 2 - (headCy + s.r));
      const hw = s.chest * (0.55 + 0.45 * k);
      pix.hline(Math.round(cx - hw), Math.round(cx + hw), y, c.fur[1]);
      pix.px(Math.round(cx - hw), y, c.fur[2]);
      pix.px(Math.round(cx + hw), y, c.fur[0]);
    }

    if (!north) {
      // Two front paws, side by side and clear of each other — a single pale
      // bar across the bottom reads as a plinth.
      pix.ellipse(cx - s.chest * 0.6, baseY - 1, 1.5, 1.1, c.fur[2]);
      pix.ellipse(cx + s.chest * 0.6, baseY - 1, 1.5, 1.1, c.fur[1]);
    }

    petHead(pix, s, c, cx, headCy, north ? 'N' : 'S', eye);
  }

  pix.outline('auto', { amount: 0.46 });
  return { pix, anchorX: 0.5, anchorY: (baseY + 1) / s.H };
}

/**
 * The head, which is the entire difference between the two species.
 *
 * A sitting cat and a sitting dog are the same three masses in the same places;
 * what separates them at thirteen pixels is a pointed ear over a short face
 * against a folded ear over a long one. So the body above is shared and this is
 * the only part with a species in it.
 */
function petHead(pix, s, c, x, y, dir, eye) {
  const side = dir === 'E';
  const north = dir === 'N';

  // Ears BEFORE the skull, so the skull overlaps their roots and they read as
  // growing out of the head rather than as stuck to the sides of it.
  if (s.ears === 'point') {
    const er = s.r - 0.4;
    if (!side) {
      pix.poly([[x - er - 1, y + 0.4], [x - er + 0.4, y - s.r - 2.2], [x - er + 2.0, y - 0.4]], c.fur[2]);
      pix.poly([[x + er + 1, y + 0.4], [x + er - 0.4, y - s.r - 2.2], [x + er - 2.0, y - 0.4]], c.fur[0]);
    } else {
      pix.poly([[x - er - 0.4, y - 0.2], [x - er + 1.2, y - s.r - 2.2], [x - er + 2.4, y - 0.8]], c.fur[1]);
      pix.poly([[x + 0.6, y - 0.6], [x + 1.6, y - s.r - 1.8], [x + 2.4, y - 1.0]], c.fur[0]);
    }
  } else if (side) {
    pix.ellipse(x - s.r + 0.7, y + 0.4, 1.2, 2.2, c.mark[1]);
  } else {
    pix.ellipse(x - s.r - 0.3, y + 0.3, 1.2, 2.2, c.mark[1]);
    pix.ellipse(x + s.r + 0.3, y + 0.3, 1.2, 2.2, c.mark[0]);
  }

  pix.disc(x, y, s.r, c.fur[1]);
  pix.ellipse(x - 1, y - 1, s.r - 1.2, s.r - 1.4, c.fur[2]);

  if (north) {
    // Away from us: all fur and no face, exactly as the people are drawn from
    // behind. The tail is what tells you which way this animal is looking.
    return;
  }

  if (side) {
    pix.px(Math.round(x) + 1, Math.round(y) - 1, eye);
    pix.ellipse(x + s.r - 0.4, y + 0.9, s.snout, 1.3, c.fur[2]);
    pix.px(Math.round(x + s.r + s.snout - 1), Math.round(y) + 1, c.mark[0]);
  } else {
    pix.px(Math.round(x) - 1, Math.round(y) - 1, eye);
    pix.px(Math.round(x) + 1, Math.round(y) - 1, eye);
    pix.ellipse(x, y + 1.5, s.snout, 1.2, c.fur[2]);
    pix.px(Math.round(x), Math.round(y) + 1, c.mark[0]);
  }
}

/** Every species that wanders a farmyard, and the painter for each. */
export const LIVESTOCK = { chicken, cow, pig };

/** Every species that sits at an owner's side. */
export const PETS = ['cat', 'dog'];
