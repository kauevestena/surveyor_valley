// Where the thumbstick may be, and what a drag on it means.
//
// The stick floats: it appears wherever the thumb comes down in the lower-left
// of the map, the way the left stick of most phone games does, rather than
// waiting in one painted spot. Floating is what made it collide. The fixed pad
// it replaces was placed by CSS offsets that could not know how tall the tool
// rail had grown, and measured on real layouts it sat ON the rail in four out
// of five: 16 px into the phone rail, 21 px into the tablet's, and on a phone
// held sideways into a rail that did not fit the screen at all.
//
// So the geometry is computed from what is actually on screen. `game/input.js`
// measures the panels — the HUD, the rail, the checklist, the batch bar — and
// asks the functions below where the stick may go. They answer with plain
// numbers and know nothing about the DOM, which is what lets
// `tests/stick.test.mjs` replay those same measured layouts and assert that the
// stick never lands on a control, wherever the thumb comes down.

/** Space kept between the stick and any control or edge, in CSS pixels. */
export const STICK_GAP = 10;

/**
 * @typedef {{left:number, top:number, right:number, bottom:number}} Rect
 * @typedef {{x:number, y:number}} Point
 */

/** Does a circle overlap a rectangle? Touching edges do not count. */
export function circleHitsRect(cx, cy, radius, rect) {
  const nx = Math.max(rect.left, Math.min(cx, rect.right));
  const ny = Math.max(rect.top, Math.min(cy, rect.bottom));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < radius * radius - 1e-6;
}

/**
 * Where a thumb may start the stick, and where its base may sit.
 *
 * `free` is the play area: the screen inside its safe-area insets, below the
 * panels that span the top and above those that span the bottom. A panel
 * counts as such a band when it is at least 60% of the screen wide — the same
 * rule `main.js#measureSafeArea` uses, so the two can never disagree about
 * what a band is. Pass only the hard obstacles: a checklist unfolded down a
 * phone is 62% of its width, and as a band it would drag the whole play area
 * down to its bottom edge. `touch` is the lower-left quarter of it: the place a left
 * thumb rests, and the only place a touch becomes the stick. It grows if a
 * quarter is too small to hold the stick at all, which on a phone held
 * sideways it nearly is.
 *
 * @param {object} p
 * @param {{width:number, height:number}} p.view
 * @param {Rect[]} p.obstacles   every panel on screen
 * @param {number} p.radius      the stick's base radius
 * @param {number} [p.gap]
 * @param {{left?:number, top?:number, right?:number, bottom?:number}} [p.insets]
 * @returns {{free: Rect, touch: Rect}}
 */
export function stickZone({ view, obstacles, radius, gap = STICK_GAP, insets = {} }) {
  let top = insets.top || 0;
  let bottom = view.height - (insets.bottom || 0);
  for (const o of obstacles) {
    if (o.right - o.left < view.width * 0.6) continue;
    if ((o.top + o.bottom) / 2 < view.height / 2) top = Math.max(top, o.bottom);
    else bottom = Math.min(bottom, o.top);
  }
  const left = insets.left || 0;
  const right = view.width - (insets.right || 0);
  const free = { left, top, right, bottom };

  const need = 2 * (radius + gap);
  const width = Math.max(right - left, 0);
  const height = Math.max(bottom - top, 0);
  const touch = {
    left,
    right: left + Math.min(width, Math.max(width / 2, need)),
    top: bottom - Math.min(height, Math.max(height / 2, need)),
    bottom,
  };
  return { free, touch };
}

/** Is a point inside a rectangle, edges included? */
export const inside = (p, r) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

/**
 * Where the base goes for a thumb at `point`.
 *
 * Right under the thumb whenever that is clear — that is the whole point of a
 * floating stick, and the common case. Near an edge or a panel it is the
 * nearest centre that is clear: first the obvious ones, pushed straight off
 * each panel in each direction, and then a grid over the whole free area,
 * which is what finds a way out of a corner between two panels where every
 * single push lands on the other one. Null when the free area cannot hold the
 * stick at all.
 *
 * `obstacles` are never touched — they are buttons. `soft` ones are panels to
 * read rather than press, the checklist and the tool captions, and they are
 * kept clear of whenever there is room. When there is none — the checklist
 * unfolded over the whole corner of a small phone — the stick keeps its place
 * and the panel covers its edge, rather than the stick vanishing while the
 * player reads. The stick sits beneath every panel, so it never covers one.
 *
 * @returns {Point|null}
 */
export function placeStick(point, { free, obstacles, soft = [], radius, gap = STICK_GAP }) {
  const clearOfAll = placeAmong(point, free, [...obstacles, ...soft], radius, gap);
  return clearOfAll ?? (soft.length ? placeAmong(point, free, obstacles, radius, gap) : null);
}

function placeAmong(point, free, obstacles, radius, gap) {
  const r = radius + gap;
  const box = { left: free.left + r, right: free.right - r, top: free.top + r, bottom: free.bottom - r };
  if (box.left > box.right || box.top > box.bottom) return null;
  const clampX = (x) => Math.min(box.right, Math.max(box.left, x));
  const clampY = (y) => Math.min(box.bottom, Math.max(box.top, y));
  const clear = (x, y) => obstacles.every((o) => !circleHitsRect(x, y, r, o));

  const start = { x: clampX(point.x), y: clampY(point.y) };
  if (clear(start.x, start.y)) return start;

  const candidates = [];
  for (const o of obstacles) {
    candidates.push(
      { x: start.x, y: o.top - r },
      { x: start.x, y: o.bottom + r },
      { x: o.left - r, y: start.y },
      { x: o.right + r, y: start.y },
    );
  }
  const step = Math.max(6, r / 4);
  for (let x = box.left; x <= box.right + 1e-9; x += step) {
    for (let y = box.top; y <= box.bottom + 1e-9; y += step) candidates.push({ x, y });
  }

  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const x = clampX(c.x);
    const y = clampY(c.y);
    if (!clear(x, y)) continue;
    const d = (x - point.x) ** 2 + (y - point.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}

/**
 * Where the stick waits, faintly, while nobody is touching it: as far into
 * the bottom-left of the thumb zone as it can go without touching anything.
 * Showing it there is what tells a new player that there is a stick at all.
 */
export function restPosition({ free, touch, obstacles, soft = [], radius, gap = STICK_GAP }) {
  return placeStick({ x: touch.left, y: touch.bottom }, { free, obstacles, soft, radius, gap });
}

/**
 * A drag, as movement.
 *
 * Measured from where the thumb CAME DOWN, never from the base's centre: when
 * the base had to be nudged off a panel, the thumb starts a few pixels from
 * the middle of it, and measuring from the middle would set the surveyor
 * walking before the thumb had moved at all. Saturates at `travel`, past which
 * a drag only changes direction.
 *
 * @returns {{e:number, n:number, magnitude:number, knob:Point}}  `knob` is the
 *          knob's offset from the base's centre, in pixels, for drawing.
 */
export function stickVector(dx, dy, travel) {
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return { e: 0, n: 0, magnitude: 0, knob: { x: 0, y: 0 } };
  const magnitude = Math.min(1, len / travel);
  const k = magnitude / len;
  // Screen y grows downward; north grows up.
  return { e: dx * k, n: -dy * k, magnitude, knob: { x: dx * k * travel, y: dy * k * travel } };
}
