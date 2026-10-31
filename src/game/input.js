// Keyboard, mouse, wheel — and touch.
//
// Movement keys are polled (held state), everything else is dispatched on the
// event. WASD and the arrow keys are both bound, and so are the Brazilian
// keyboard's usual suspects, because a student should not have to discover the
// control scheme by trial.
//
// Touch is here because without it the game is not merely awkward on a tablet,
// it is unplayable: every tool already worked through pointer events and double
// tap already fast-travelled, but movement was WASD only, so you could not
// reach a corner, find a buried mark or walk to the sede. Three gestures have
// no mouse equivalent to inherit — walking, panning and zooming — and they are
// the three added below.
//
// Everything touch contributes joins the SAME `intent()` the keyboard feeds, so
// `game/player.js` does not know any of this exists.

import { TOOL_KEYS } from './tools.js';
import { stickZone, placeStick, restPosition, stickVector, inside, STICK_GAP } from './stick.js';

/**
 * Past this fraction of full deflection the surveyor runs.
 *
 * `updatePlayer` normalises the intent vector, so a partial push cannot mean a
 * slower walk however hard anyone leans on it — magnitude has to buy something
 * discrete instead, and Shift is what it stands in for.
 */
const RUN_DEFLECTION = 0.7;

/** Movement of a single touch beyond this is a drag, not a tap. */
const TAP_SLOP = 12;
const TAP_MS = 700;

const MOVE_KEYS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/**
 * Is this session being played with a thumb?
 *
 * The one place that decides, and the only thing that tells the stylesheet so
 * — `html.is-touch` is what every enlarged control in `game.css` hangs off. It
 * lives in this file because this file already owns the question: the
 * thumbstick has been asking it since touch support landed.
 *
 * Three signals, because no one of them is enough alone:
 *
 *   * a coarse pointer — a phone or a tablet, whatever its width;
 *   * a viewport under 720 px, the width at which the rail already moves to
 *     the bottom, and cramped for a mouse too;
 *   * a touch having actually happened, which is the case NO media query can
 *     express: a convertible reports a FINE primary pointer right up until
 *     somebody puts a finger on the screen.
 *
 * Deliberately not written as a media query in the CSS. Expressing "coarse OR
 * narrow OR a touch seen at runtime" there would mean the same breakpoint in
 * two files, drifting apart the first time one of them is edited.
 *
 * Module scope, not `makeInput`, because the INTRO comes first: the player
 * picks a face, a language and a difficulty before any world exists, on a
 * screen full of buttons that need to be just as reachable. `main.js` calls
 * this once at boot, long before there is a canvas to put a thumbstick on.
 */
const narrowMq = typeof matchMedia === 'function' ? matchMedia('(max-width: 720px)') : null;
const coarseMq = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
let touchHappened = false;

export function applyTouchMode() {
  if (typeof document === 'undefined') return;
  const on = touchHappened || Boolean(coarseMq?.matches) || Boolean(narrowMq?.matches);
  document.documentElement.classList.toggle('is-touch', on);
}

/** A real touch arrived; from here on this is a touch session for good. */
function noteTouch() {
  touchHappened = true;
  applyTouchMode();
}

// Rotating a tablet, or dragging a window across the breakpoint. `main.js`
// re-measures the panels on `resize` already, so the insets that keep map
// markers clear of the controls follow the new sizes by themselves.
narrowMq?.addEventListener?.('change', applyTouchMode);

export function makeInput({ canvas, root, camera, bus, EV, onClick, onDoubleClick, onToolKey, onBatchKey, onAct, onHover, onTouch, isModalOpen }) {
  const held = new Set();
  let run = false;
  let pointer = { x: 0, y: 0, inside: false };
  let lastWorld = { e: 0, n: 0 };

  const detach = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    detach.push(() => target.removeEventListener(type, fn, opts));
  };

  /**
   * Capture, but never at the cost of the rest of the handler.
   *
   * `setPointerCapture` throws NotFoundError whenever the pointer is no longer
   * active — a finger lifted between the event and the handler, or a synthetic
   * event. It is a convenience here (the overlay covers the play area anyway),
   * and letting it throw took the whole `pointerdown` branch down with it: the
   * second finger never registered, so pinch and two-finger pan silently did
   * nothing.
   */
  const capture = (target, id) => {
    try {
      target.setPointerCapture?.(id);
    } catch {
      /* the pointer is already gone; nothing to capture and nothing to do */
    }
  };

  on(window, 'keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;

    // A modal owns the keyboard. Movement keys must not pile up behind it, or
    // closing the dialog sets the player walking off in whatever direction they
    // were last pressing — and the arrow keys are how you scroll a long table,
    // so they are not even movement input at that point.
    if (isModalOpen?.() && ev.key !== 'Escape') {
      held.clear();
      run = false;
      return;
    }

    if (MOVE_KEYS[ev.code]) {
      held.add(ev.code);
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Shift') {
      run = true;
      return;
    }

    /**
     * Space does whatever the active tool does, where you stand. Every action
     * in this game already happens at the player's feet, so this is the same
     * thing a click does — without having to put the cursor anywhere.
     *
     * `preventDefault` twice over: Space scrolls the page, and it also
     * re-activates a focused button. The toolbar and the HUD are real
     * `<button>` elements which keep focus after a click, and the guard at the
     * top of this handler only excludes inputs and textareas — so without the
     * blur below, clicking a tool and then pressing Space would fire the button
     * again AND take the action. That only shows up after a mouse click, never
     * in a keyboard-only run, which is exactly the kind of bug that ships.
     */
    if (ev.key === ' ' || ev.code === 'Space') {
      ev.preventDefault();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
      onAct?.(ev);
      return;
    }

    if (ev.key === 'Escape') {
      onToolKey?.('walk', ev);
      return;
    }
    const tool = TOOL_KEYS[ev.key];
    if (tool) {
      onToolKey?.(tool, ev);
      ev.preventDefault();
      return;
    }
    // Batch measuring. Not in TOOL_KEYS because it is an action, not a mode.
    if (ev.key === 'b' || ev.key === 'B') {
      onBatchKey?.(ev);
      ev.preventDefault();
      return;
    }
    if (ev.key === '+' || ev.key === '=' || ev.key === 'z' || ev.key === 'Z') {
      camera.stepZoom(1);
      bus.emit(EV.CAMERA_ZOOM, camera.zoom);
    }
    if (ev.key === '-' || ev.key === '_' || ev.key === 'x' || ev.key === 'X') {
      camera.stepZoom(-1);
      bus.emit(EV.CAMERA_ZOOM, camera.zoom);
    }
  });

  on(window, 'keyup', (ev) => {
    held.delete(ev.code);
    if (ev.key === 'Shift') run = false;
  });

  // Losing focus mid-stride would otherwise leave the player walking forever.
  on(window, 'blur', () => {
    held.clear();
    run = false;
  });

  const toCanvas = (ev) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };

  // ---------------------------------------------------------------- touch ---
  //
  // Shown for a coarse pointer, and also the first time a real touch arrives:
  // a convertible laptop reports BOTH a fine and a coarse pointer, so the media
  // query alone leaves the stick hidden on exactly the machine that has a
  // touchscreen and a mouse.
  //
  // The stick FLOATS: a thumb coming down anywhere in the lower-left quarter of
  // the map brings it up under that thumb, and a drag walks. It used to be a
  // fixed pad, for a reason that was right — a stick that appears wherever a
  // thumb lands steals the taps that sight a corner and send Ligeirinho off —
  // and the answer here is to give them back: a touch that lifts again quickly
  // without travelling is a TAP, and is handed to the map exactly as a tap
  // anywhere else would be. Only a drag is the stick's.
  const stick = { e: 0, n: 0, id: null, engaged: false, x0: 0, y0: 0, x: 0, y: 0, at: 0, moved: 0 };
  let touchSeen = false;
  /** Where the stick may go, measured from the panels on screen. See `layoutStick`. */
  let place = null;

  const stickRoot = root ? makeStick(root) : null;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  /**
   * Is this session being played with a thumb?
   *
   * The one place that decides, and the only thing that tells the stylesheet
   * so — `html.is-touch` is what every enlarged control in `game.css` hangs
   * off. It lives here because this file already owns the question: the
   * thumbstick has been asking it since touch support landed.
   *
   * Three signals, because no one of them is enough on its own:
   *
   *   * a coarse pointer — a phone or a tablet, whatever its width;
   *   * a viewport under 720 px — the width at which the rail already moves
   *     to the bottom, and cramped for a mouse too;
   *   * a touch having actually happened, which is the case NO media query
   *     can express. A convertible reports a fine primary pointer right up
   *     until somebody puts a finger on the screen, and that is the machine
   *     the comment above is about.
   *
   * Deliberately not a media query in the CSS: expressing "coarse OR narrow OR
   * a touch we saw at runtime" there would mean the same numbers written in
   * two places, drifting apart the first time one of them is edited.
   */
  if (stickRoot && coarse) showStick();

  function showStick() {
    if (touchSeen) return;
    touchSeen = true;
    stickRoot?.node.classList.add('is-on');
    noteTouch();
    // The stick appears mid-session on a hybrid machine, and it lands in the
    // bottom-left corner where the scale bar already is — so whoever is keeping
    // track of what covers the canvas has to be told. That is also what lays
    // the stick out: `main.js#measureSafeArea` calls `layoutStick` first.
    onTouch?.();
  }

  /**
   * Measure what is on screen and settle the stick where it waits.
   *
   * Everything a thumb could press, which the stick never touches, and the
   * panels it keeps clear of when it can — the checklist, the tool captions
   * (see `placeStick`). Toasts are left out on purpose: they pass through
   * touches and are gone in seconds. Run on every layout change —
   * `main.js` calls it from `measureSafeArea` — and again on every touch, so
   * a batch bar that appeared a moment ago is already an obstacle.
   */
  function layoutStick() {
    if (!stickRoot || !touchSeen) return null;
    const frame = canvas.getBoundingClientRect();
    const base = stickRoot.base.getBoundingClientRect();
    const knob = stickRoot.knob.getBoundingClientRect();
    if (!base.width || !frame.width) return null;

    const radius = base.width / 2;
    // The knob may travel until a quarter of it hangs over the rim, and it is
    // the knob's reach, not the base, that must stay off the panels.
    const travel = radius - knob.width / 4;
    const reach = Math.max(radius, travel + knob.width / 2);

    const obstacles = panels(HARD);
    const soft = panels(SOFT);
    const insets = safeInsets(stickRoot.insets);
    const view = { width: frame.right, height: frame.bottom };
    const zone = stickZone({ view, obstacles, radius: reach, gap: STICK_GAP, insets });
    const rest = restPosition({ ...zone, obstacles, soft, radius: reach, gap: STICK_GAP });
    place = { ...zone, obstacles, soft, radius, reach, travel, rest };

    if (rest) {
      const host = stickRoot.node.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
      stickRoot.node.style.left = `${rest.x - radius - host.left}px`;
      stickRoot.node.style.top = `${rest.y - radius - host.top}px`;
      stickRoot.node.style.bottom = 'auto';
    }
    stickRoot.node.classList.toggle('is-homeless', !rest);
    return place;
  }

  /** Put the base under (or as near as it may go to) `centre`, and the knob at `knob`. */
  function drawStick(centre, knob) {
    if (!stickRoot || !place?.rest) return;
    stickRoot.base.style.transform = centre ? `translate(${centre.x - place.rest.x}px, ${centre.y - place.rest.y}px)` : '';
    stickRoot.knob.style.transform = knob ? `translate(${knob.x}px, ${knob.y}px)` : '';
  }

  /** A thumb came down. If it is in the stick's quarter, it is the stick's — for now. */
  function startStick(ev) {
    if (!stickRoot || stick.id != null) return false;
    const at = layoutStick();
    const point = { x: ev.clientX, y: ev.clientY };
    if (!at?.rest || !inside(point, at.touch)) return false;
    const centre = placeStick(point, { free: at.free, obstacles: at.obstacles, soft: at.soft, radius: at.reach, gap: STICK_GAP });
    if (!centre) return false;

    Object.assign(stick, { id: ev.pointerId, engaged: false, x0: point.x, y0: point.y, x: point.x, y: point.y, at: Date.now(), moved: 0, e: 0, n: 0 });
    stickRoot.node.classList.add('is-active');
    drawStick(centre, null);
    capture(canvas, ev.pointerId);
    return true;
  }

  function moveStick(ev) {
    stick.x = ev.clientX;
    stick.y = ev.clientY;
    const dx = stick.x - stick.x0;
    const dy = stick.y - stick.y0;
    stick.moved = Math.max(stick.moved, Math.hypot(dx, dy));
    // A tap may wobble; a drag is a drag once it has gone further than a tap
    // ever does. Until then the surveyor does not move.
    if (!stick.engaged && stick.moved > TAP_SLOP) stick.engaged = true;
    if (!stick.engaged) return;
    const v = stickVector(dx, dy, place.travel);
    stick.e = v.e;
    stick.n = v.n;
    stickRoot.node.classList.add('is-dragging');
    stickRoot.knob.style.transform = `translate(${v.knob.x}px, ${v.knob.y}px)`;
  }

  /** Back to rest, gliding, with nothing held. */
  function releaseStick() {
    Object.assign(stick, { id: null, engaged: false, e: 0, n: 0, moved: 0 });
    if (!stickRoot) return;
    stickRoot.node.classList.remove('is-active', 'is-dragging');
    drawStick(null, null);
  }

  /** Lifted. A short touch that never travelled was a tap on the map after all. */
  function endStick(ev) {
    const tap = !stick.engaged && stick.moved <= TAP_SLOP && Date.now() - stick.at <= TAP_MS;
    releaseStick();
    if (tap) tapAt(ev);
  }

  /**
   * A second finger arrived before the first had started walking: the two of
   * them are a pinch or a pan, so the first one is handed to the gesture code
   * as though it had been an ordinary touch all along.
   */
  function stickToGesture() {
    touches.set(stick.id, { x: stick.x, y: stick.y, x0: stick.x0, y0: stick.y0, at: stick.at, moved: stick.moved });
    releaseStick();
  }

  /** Live touches on the canvas, for telling a tap from a pan from a pinch. */
  const touches = new Map();
  let gesture = null;

  const centroid = () => {
    let x = 0;
    let y = 0;
    for (const t of touches.values()) {
      x += t.x;
      y += t.y;
    }
    return { x: x / touches.size, y: y / touches.size };
  };
  const spread = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  on(canvas, 'pointermove', (ev) => {
    if (ev.pointerId === stick.id) {
      moveStick(ev);
      return;
    }
    if (ev.pointerType === 'touch' && touches.has(ev.pointerId)) {
      const t = touches.get(ev.pointerId);
      t.x = ev.clientX;
      t.y = ev.clientY;
      t.moved = Math.max(t.moved, Math.hypot(ev.clientX - t.x0, ev.clientY - t.y0));

      if (touches.size >= 2 && gesture) {
        // Two fingers: drag pans, spreading zooms. Zoom stays on the ladder —
        // the art is pixel-exact only at whole multiples of 16 px/m, so a
        // continuous pinch would undo the rule the whole renderer rests on.
        const c = centroid();
        // `setPosition` rather than assigning `e`/`n`: this runs off pointer
        // events, not the fixed step, so the camera's interpolation origin has
        // to come with it or the next frame smears across the drag.
        camera.setPosition(
          gesture.e - (c.x - gesture.cx) / camera.zoom,
          gesture.n + (c.y - gesture.cy) / camera.zoom,
        );

        const now = spread();
        const ratio = now / gesture.spread;
        if (ratio > 1.35 || ratio < 0.74) {
          const p = toCanvas({ clientX: c.x, clientY: c.y });
          camera.zoomAt(p.x, p.y, ratio > 1 ? 1 : -1);
          bus.emit(EV.CAMERA_ZOOM, camera.zoom);
          gesture.spread = now;
          gesture.e = camera.e;
          gesture.n = camera.n;
          gesture.cx = c.x;
          gesture.cy = c.y;
        }
      }
      return;
    }

    const p = toCanvas(ev);
    pointer = { ...p, inside: true };
    lastWorld = camera.screenToWorld(p.x, p.y);
    onHover?.(lastWorld, p);
  });

  on(canvas, 'pointerleave', () => {
    pointer.inside = false;
    onHover?.(null, null);
  });

  on(canvas, 'pointerdown', (ev) => {
    if (ev.pointerType === 'touch') {
      if (!touchSeen) showStick();
      // The first finger down, in the lower-left quarter: the stick's, unless
      // it turns out to be a tap or the start of a pinch.
      if (touches.size === 0 && startStick(ev)) return;
      if (stick.id != null && !stick.engaged) stickToGesture();
      touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, at: Date.now(), moved: 0 });
      capture(canvas, ev.pointerId);
      if (touches.size === 2) {
        const c = centroid();
        gesture = { cx: c.x, cy: c.y, e: camera.e, n: camera.n, spread: spread() };
      }
      return;
    }
    if (ev.button !== 0) return;
    capture(canvas, ev.pointerId);
    const p = toCanvas(ev);
    onClick?.(camera.screenToWorld(p.x, p.y), p, ev);
  });

  /** What a tap does, wherever on the map it landed. */
  function tapAt(ev) {
    const p = toCanvas(ev);
    pointer = { ...p, inside: true };
    lastWorld = camera.screenToWorld(p.x, p.y);
    // There is no hover on a touchscreen, so the tap has to do that job too.
    onHover?.(lastWorld, p);
    onClick?.(lastWorld, p, ev);
  }

  const endTouch = (ev) => {
    if (ev.pointerId === stick.id) {
      if (ev.type === 'pointercancel') releaseStick();
      else endStick(ev);
      return;
    }
    if (ev.pointerType !== 'touch') return;
    const t = touches.get(ev.pointerId);
    touches.delete(ev.pointerId);
    if (touches.size < 2) gesture = null;
    if (!t) return;

    // A tap ACTS; a drag was a pan and must not also plant a monument. The mouse
    // still fires on pointerdown, unchanged — waiting for the release would put
    // a lag on every click for the sake of a gesture mice do not make.
    const still = Math.hypot(ev.clientX - t.x0, ev.clientY - t.y0) <= TAP_SLOP && t.moved <= TAP_SLOP;
    if (still && Date.now() - t.at <= TAP_MS && touches.size === 0 && !gesture) tapAt(ev);
  };
  on(canvas, 'pointerup', endTouch);
  on(canvas, 'pointercancel', endTouch);
  on(window, 'blur', () => releaseStick());

  on(canvas, 'dblclick', (ev) => {
    const p = toCanvas(ev);
    onDoubleClick?.(camera.screenToWorld(p.x, p.y), p, ev);
  });

  // Zoom is rung-to-rung, not continuous: the art is only pixel-exact at
  // integer multiples of its 16 px/m resolution. Wheel deltas are accumulated
  // so a trackpad's many small events still make one clean step.
  let wheelAcc = 0;
  on(
    canvas,
    'wheel',
    (ev) => {
      ev.preventDefault();
      wheelAcc += ev.deltaY;
      if (Math.abs(wheelAcc) < 40) return;
      const dir = wheelAcc < 0 ? 1 : -1;
      wheelAcc = 0;
      const p = toCanvas(ev);
      camera.zoomAt(p.x, p.y, dir);
      bus.emit(EV.CAMERA_ZOOM, camera.zoom);
    },
    { passive: false },
  );

  // Right-drag pans, for looking around without walking.
  let panning = null;
  on(canvas, 'contextmenu', (ev) => ev.preventDefault());
  on(canvas, 'pointerdown', (ev) => {
    if (ev.button !== 2) return;
    panning = { x: ev.clientX, y: ev.clientY, e: camera.e, n: camera.n };
  });
  on(window, 'pointermove', (ev) => {
    if (!panning) return;
    camera.setPosition(
      panning.e - (ev.clientX - panning.x) / camera.zoom,
      panning.n + (ev.clientY - panning.y) / camera.zoom,
    );
  });
  on(window, 'pointerup', () => {
    panning = null;
  });

  return {
    /** Movement intent for this frame, in world axes. */
    intent() {
      let e = 0;
      let n = 0;
      for (const code of held) {
        const v = MOVE_KEYS[code];
        if (!v) continue;
        e += v[0];
        n += v[1];
      }
      // The stick joins the keyboard rather than replacing it, so a tablet with
      // a keyboard attached behaves like both at once and neither has to win.
      let running = run;
      if (stick.engaged) {
        e += stick.e;
        n += stick.n;
        if (Math.hypot(stick.e, stick.n) >= RUN_DEFLECTION) running = true;
      }
      return { e, n, run: running };
    },
    /** True once this session has seen touch: the HUD hints change with it. */
    get touch() {
      return touchSeen;
    },
    get pointer() {
      return pointer;
    },
    get worldPointer() {
      return lastWorld;
    },
    clear() {
      held.clear();
      run = false;
      releaseStick();
      touches.clear();
      gesture = null;
    },
    /**
     * Re-measure the panels and settle the stick where it waits. Returns where
     * it may go, or null while there is no stick. `main.js` calls this before
     * measuring what covers the canvas, so the corner it rests in is counted.
     */
    layoutStick,
    destroy() {
      detach.forEach((fn) => fn());
      detach.length = 0;
    },
  };
}

/** What the stick must never touch: everything a thumb presses. */
const HARD = '.hud-bar, .toolbar, .field-actions';
/** What it keeps clear of when there is room: panels read rather than pressed. */
const SOFT = '.checklist, .toolbar .tool-label, .banner';

/** The visible panels matching `selector`, as plain rectangles. */
function panels(selector) {
  const out = [];
  for (const node of document.querySelectorAll(selector)) {
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (Number(getComputedStyle(node).opacity) < 0.05) continue;
    out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return out;
}

/**
 * The thumbstick: an anchor that sits where the stick waits — which is what
 * `measureSafeArea` measures — and inside it the base, which travels to the
 * thumb and back. None of it takes a pointer: the canvas underneath keeps
 * every touch, so taps, double taps and pinches arrive where they always did.
 */
function makeStick(root) {
  const node = document.createElement('div');
  node.className = 'thumbstick';
  node.setAttribute('aria-hidden', 'true');
  const base = document.createElement('div');
  base.className = 'thumbstick-base';
  const knob = document.createElement('div');
  knob.className = 'thumbstick-knob';
  base.append(knob);
  node.append(base);
  // `env(safe-area-inset-*)` is readable from CSS only, so it is measured off a
  // probe padded by it: a notch is an edge the stick must not sit under.
  const insets = document.createElement('div');
  insets.className = 'thumbstick-insets';
  root.append(node, insets);
  return { node, base, knob, insets };
}

function safeInsets(probe) {
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}
