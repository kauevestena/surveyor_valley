// What people put on the land.
//
// Buildings are the one sprite whose size is not known until the world is
// generated, so this painter is called at world-build time with the real
// footprint and registered with the atlas as a one-off. There are six of them,
// so the cost is nothing and the alternative — a fixed sprite stretched to fit
// — would put the roof pitch at a different angle on every farm.
//
// The view is three-quarter from the south, matching everything else: you see
// the roof, and a strip of the front wall below it.

import { makePix, contactShadow, P, shadeOf } from './shared.js';
import { PX_PER_M } from '../pixbuf.js';

/**
 * One row per archetype. The roof and the chimney used to be two independent
 * `variant % 2` checks — which meant widening the variant count would just
 * repeat an existing look (variant 2 would get the same roof+chimney combo as
 * variant 0) rather than produce a new one. A single table keeps every trait
 * of a look together.
 */
const VARIANTS = [
  { roof: 'roof', chimney: true, wallTone: 'wall', wallShadeTone: 'wallShade' }, // 0: terracotta house
  { roof: 'roofZinc', chimney: false, wallTone: 'wall', wallShadeTone: 'wallShade' }, // 1: zinc shed
  { roof: 'roof', chimney: false, wallTone: 'wood', wallShadeTone: 'woodDark' }, // 2: barn
];
export const BUILDING_VARIANTS = VARIANTS.length;

/** The visible front wall, in metres. The roof sits on top of this. */
const WALL_M = 1.35;
/** The eave lip, in pixels: the roof overhangs the footprint on all four sides. */
const EAVE = 4;
/** How far the chimney pokes above the roof, in pixels. */
const CHIMNEY = 3;
/** The wall in whole pixels, which is what actually gets painted. */
const WALL_PX = Math.round(WALL_M * PX_PER_M);
/** `pix.outline` lays one more pixel all round at the end. */
const OUTLINE = 1;

/**
 * How far the painted building spills past its footprint ring, in metres.
 *
 * The sprite is anchored on the footprint CENTRE, not on its base, so it
 * covers ground the collision ring says is outside the building: the eave
 * either side, the chimney above the ridge, and — much the largest of the
 * three — the whole front wall below, because a wall seen from the south is
 * drawn under the roof it holds up. Anything deciding what may be drawn where
 * a building stands has to measure with these, not with the ring, or it will
 * put grass on the roof.
 */
export const BUILDING_OVERHANG = {
  side: EAVE / PX_PER_M,
  north: (CHIMNEY + OUTLINE) / PX_PER_M,
  south: WALL_PX / PX_PER_M,
};

/**
 * The northing a building has to be y-sorted at: the southern edge of what it
 * PAINTS, not the centre of its footprint.
 *
 * The scene sorts on `zIndex = -n`, so a body further south is drawn later and
 * overlaps one further north. Sorting a house at its centre broke that for the
 * strip of ground its front wall is painted over: a hen standing a step south
 * of the south wall is north of where the wall is DRAWN, so she sorted later
 * than the house and appeared to be perched on it. She was not somewhere she
 * should not have been — that ground is hers, and `canStand` is right to let
 * her have it — she was simply drawn in the wrong order.
 *
 * Sorting at the sprite's own base is the fix, and it is the right one for
 * everything else in that strip too: in a three-quarter view the ground under
 * a painted wall is ground BEHIND that wall, so anything standing on it belongs
 * behind the house. Player, assistant, residents and trees all get this for
 * free, because they were never the ones that were wrong.
 *
 * @param {Array<[number, number]>} ring  the footprint
 */
export function buildingSortNorthing(ring) {
  let minN = Infinity;
  for (const [, n] of ring) if (n < minN) minN = n;
  return minN - BUILDING_OVERHANG.south;
}

/**
 * A farmhouse, shed or barn.
 * @param {object} rng
 * @param {{wm:number, hm:number, variant?:number}} p  footprint in metres
 * @returns {{pix:object, anchorX:number, anchorY:number}}  anchored on the
 *          footprint CENTRE, so it lands exactly on the entity's coordinates.
 */
export function building(rng, { wm, hm, variant = 0 }) {
  const fw = Math.max(24, Math.round(wm * PX_PER_M));
  const fh = Math.max(20, Math.round(hm * PX_PER_M));
  const wallPx = WALL_PX; // the front wall we can see
  const eave = EAVE;

  const W = fw + eave * 2;
  const H = fh + wallPx + eave;
  const pix = makePix(W, H);

  const left = eave;
  const right = eave + fw - 1;
  const roofTop = eave;
  const roofBot = eave + fh - 1;
  const wallTop = roofBot + 1;
  const wallBot = wallTop + wallPx - 1;

  const v = VARIANTS[variant % VARIANTS.length];
  const roof = P[v.roof];
  const wallBase = P[v.wallTone];
  const wallShade = P[v.wallShadeTone];
  const isBarn = v.wallTone === 'wood';

  contactShadow(pix, W / 2, wallBot + 1, fw * 0.5, 4);

  // ---- front wall ---------------------------------------------------------
  pix.fill(left + 2, wallTop, fw - 4, wallPx, wallBase[1]);
  pix.hline(left + 2, right - 2, wallBot, wallShade[0]);
  pix.vline(right - 2, wallTop, wallBot, wallShade[1]);

  // Door, centred, and a window either side if there is room.
  const dx = Math.round(W / 2);
  const doorW = 7;
  pix.fill(dx - Math.floor(doorW / 2), wallBot - wallPx + 4, doorW, wallPx - 4, P.woodDark[1]);
  pix.vline(dx - Math.floor(doorW / 2), wallBot - wallPx + 4, wallBot, P.woodDark[2]);
  pix.px(dx + 1, wallBot - Math.round(wallPx / 2), P.instrumentTrim[1]);

  if (isBarn) {
    // A single hayloft opening high on the gable, in place of windows: a barn
    // is loaded from above, not looked into.
    const loftW = 9;
    const loftX = dx - Math.floor(loftW / 2);
    const loftY = wallTop + 3;
    pix.fill(loftX, loftY, loftW, 6, P.woodDark[2]);
    pix.rect(loftX, loftY, loftW, 6, P.woodDark[0]);
  } else if (fw > 70) {
    for (const wx of [left + Math.round(fw * 0.2), left + Math.round(fw * 0.78)]) {
      pix.fill(wx - 4, wallTop + 4, 8, 7, P.lens[0]);
      pix.fill(wx - 3, wallTop + 5, 6, 5, P.lens[1]);
      pix.hline(wx - 3, wx + 2, wallTop + 5, P.lens[2]);
      pix.rect(wx - 4, wallTop + 4, 8, 7, P.wood[0]);
    }
  }

  // ---- roof ---------------------------------------------------------------
  // The ridge runs along the LONGER axis, the way a real roof does.
  const ridgeHorizontal = fw >= fh;
  const shadeRoof = shadeOf(roof[1], 0.3);

  if (ridgeHorizontal) {
    const ridgeY = roofTop + Math.round(fh / 2);
    // The far slope tips away from the light and the near slope catches it, so
    // the ridge reads as a fold rather than as a drawn line.
    pix.fill(0, roofTop, W, ridgeY - roofTop + 1, roof[0]);
    pix.fill(0, ridgeY, W, roofBot - ridgeY + 1, roof[1]);
    pix.hline(0, W - 1, ridgeY - 1, roof[2]);
    pix.hline(0, W - 1, ridgeY, roof[2]);
    // Tile courses, and a rafter line every few courses.
    for (let y = roofTop + 3; y < roofBot; y += 4) {
      if (y === ridgeY || y === ridgeY - 1) continue;
      pix.hline(0, W - 1, y, shadeRoof, 0.42);
    }
    for (let x = 5; x < W; x += 9) pix.vline(x, roofTop, roofBot, shadeRoof, 0.18);
  } else {
    const ridgeX = left + Math.round(fw / 2);
    pix.fill(0, roofTop, ridgeX, roofBot - roofTop + 1, roof[0]);
    pix.fill(ridgeX, roofTop, W - ridgeX, roofBot - roofTop + 1, roof[1]);
    pix.vline(ridgeX - 1, roofTop, roofBot, roof[2]);
    pix.vline(ridgeX, roofTop, roofBot, roof[2]);
    for (let x = 3; x < W; x += 4) {
      if (x === ridgeX || x === ridgeX - 1) continue;
      pix.vline(x, roofTop, roofBot, shadeRoof, 0.42);
    }
    for (let y = roofTop + 5; y < roofBot; y += 9) pix.hline(0, W - 1, y, shadeRoof, 0.18);
  }

  // Eaves: a darker lip all round, which is what makes the roof overhang.
  pix.hline(0, W - 1, roofTop, shadeRoof);
  pix.hline(0, W - 1, roofBot, shadeRoof);
  pix.vline(0, roofTop, roofBot, shadeRoof);
  pix.vline(W - 1, roofTop, roofBot, shadeRoof);

  // Eave shadow on the wall, which is what makes the roof sit ON the building.
  pix.fill(left + 2, wallTop, fw - 4, 2, wallShade[0], 0.55);

  // Chimney, on the houses.
  if (v.chimney) {
    const chx = left + Math.round(fw * 0.72);
    pix.fill(chx, roofTop - CHIMNEY, 6, 9, P.rock[1]);
    pix.hline(chx, chx + 5, roofTop - CHIMNEY, P.rock[2]);
    pix.hline(chx, chx + 5, roofTop - 1, P.rock[0]);
  }

  pix.outline('auto', { amount: 0.45 });
  void rng;

  return {
    pix,
    anchorX: 0.5,
    // Land the FOOTPRINT centre on the entity coordinate.
    anchorY: (roofTop + fh / 2) / H,
  };
}
