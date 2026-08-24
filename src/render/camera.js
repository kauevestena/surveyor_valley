// The one place metres become pixels.
//
// `zoom` is screen pixels per metre, so a 100 m sight line at zoom 32 is 3200 px
// long and the scale bar needs no conversion factor of its own.
//
// The Y flip lives here and nowhere else: North is up in the world, down on a
// screen. Every other module works in metres and stays honest.
//
// Two rules keep the pixel art sharp, and both are load-bearing:
//
//   1. Field zoom is an INTEGER MULTIPLE of the 16 px/m art resolution. Scaling
//      pixel art by 1.37 gives the soft mush that made the first version look
//      like a stretched screenshot.
//   2. The world CONTAINER lands on a whole screen pixel, and it is the only
//      thing that gets rounded. Every sprite sits at a base-pixel offset inside
//      it and the scale is an integer, so they all inherit one rounding and move
//      together. Round per sprite against a fractional camera instead and the
//      scene shimmers, because each one crosses its pixel on a different frame.
//
//      This used to be done by snapping the camera's stored position to the art
//      grid, and that was the source of the walking jitter. Two reasons. The
//      snap was fed back into the follow, so an increment below half a base
//      pixel rounded away entirely and the camera held still for several steps
//      before jumping a whole one. And the quantum was a BASE pixel — four
//      screen pixels at zoom 64 — so the player, drawn against it, twitched
//      backwards by four pixels at a time.
//
//      So the stored position stays a plain float, `setAlpha` interpolates it
//      against the same clock the player is drawn on, and the only rounding is
//      `containerOffset`'s, to the nearest SCREEN pixel. That is the finest
//      quantum a pixel grid has; what is left is a one-pixel wobble, which is
//      the floor rather than a defect.

import { PX_PER_M } from './pixbuf.js';
import { makeShake, easeInOutCubic, clamp01 } from './tween.js';

/**
 * Screen pixels per metre.
 * 16/32/48/64 are the field rungs (x1..x4 of the art). 4 and 8 are the plan
 * view, which draws lines rather than sprites and so does not need an integer
 * relationship to anything.
 */
export const ZOOM_LADDER = [4, 8, 16, 32, 48, 64];
export const ZOOM_MIN = ZOOM_LADDER[0];
export const ZOOM_MAX = ZOOM_LADDER[ZOOM_LADDER.length - 1];

/** The default: a 42 x 26 m view, with a 48 x 68 px surveyor in the middle. */
export const ZOOM_DEFAULT = 32;

/**
 * Knock strengths, in metres of throw at the default zoom.
 *
 * Small numbers: this is a thump you feel, not a screen shake you notice. A
 * monument going into the ground gets the larger one because it is the player
 * hitting something; a blocked sight is the world refusing, which is a smaller
 * event even though it is the more annoying one.
 */
export const KNOCK = { thunk: 0.22, blocked: 0.14 };

/** Below this the world container is hidden and the plan view takes over. */
export const PLAN_MODE_ZOOM = 12;
/** Below this, small scenery is skipped. */
export const DETAIL_ZOOM = 14;

/** How long `fit` takes to glide to what it framed. */
const FIT_PAN_SECONDS = 0.28;

export function makeCamera({ e = 320, n = 320, zoom = ZOOM_DEFAULT } = {}) {
  const shake = makeShake();
  /** An eased pan in progress, or null. */
  let pan = null;

  const cam = {
    e,
    n,
    zoom,
    /**
     * Where the camera was at the start of the current fixed step, so `setAlpha`
     * can interpolate between the two exactly as the player is interpolated. A
     * camera advancing in 60 Hz lumps behind a player drawn at display rate is
     * half of what made walking jitter.
     */
    prevE: e,
    prevN: n,
    /**
     * The position this frame is DRAWN from: `e`/`n` interpolated across the
     * current step. Written only by `setAlpha`; everything that puts pixels on
     * the screen reads it, and nothing writes back into `e`/`n`. Deliberately
     * NOT rounded — the rounding happens once, in `containerOffset`.
     */
    rE: e,
    rN: n,

    /**
     * Fix the frame's render position. Called once at the top of `render`,
     * before anything draws — the world container, the overlay canvas and
     * hit-testing all read `rE`/`rN`, and they have to agree.
     */
    setAlpha(a) {
      const k = Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1;
      cam.rE = cam.prevE + (cam.e - cam.prevE) * k;
      cam.rN = cam.prevN + (cam.n - cam.prevN) * k;
    },

    /**
     * Put the camera somewhere with no glide and no interpolation: `prev` moves
     * with it, so the next frame does not smear across the jump. This is what a
     * drag or a pinch wants — those run off pointer events, outside the fixed
     * step, and have already been smoothed by the hand doing them.
     */
    setPosition(pe, pn) {
      cam.e = pe;
      cam.n = pn;
      cam.clampToBounds();
      cam.prevE = cam.e;
      cam.prevN = cam.n;
      // And land the render position too. A drag or a wheel zoom is followed by
      // pointer events long before the next frame calls `setAlpha`, and
      // `screenToWorld` answers those from `rE` — left stale, a click landing
      // between a zoom and the next frame would hit-test against the old view.
      cam.setAlpha(1);
    },
    /** Viewport size in CSS pixels; set by the renderer on resize. */
    vw: 800,
    vh: 600,
    bounds: null,

    setViewport(w, h) {
      cam.vw = w;
      cam.vh = h;
    },

    setBounds(b) {
      cam.bounds = b;
    },

    /** Integer upscale of the 16 px/m art. 1, 2, 3 or 4 in the field. */
    get scale() {
      return cam.zoom / PX_PER_M;
    },

    /**
     * World metres -> CSS pixels. Used by the overlay canvas and hit-testing.
     *
     * From the RENDERED position, not the stored one: a sight line drawn half a
     * pixel off the sprite it starts at is the whole point of having one origin.
     */
    worldToScreen(we, wn) {
      return {
        x: cam.vw / 2 + (we - cam.rE) * cam.zoom,
        y: cam.vh / 2 - (wn - cam.rN) * cam.zoom,
      };
    },

    screenToWorld(sx, sy) {
      return {
        e: cam.rE + (sx - cam.vw / 2) / cam.zoom,
        n: cam.rN - (sy - cam.vh / 2) / cam.zoom,
      };
    },

    /**
     * Where the world container must sit, in SCREEN pixels, given that the
     * container itself is laid out in base pixels and scaled by `scale`.
     *
     * THE rounding. Everything drawn in the world is positioned relative to this
     * one integer, so the whole scene shares a single quantization instead of
     * each sprite finding its own.
     */
    containerOffset() {
      // The shake is added HERE rather than to `cam.e`/`cam.n`, so it moves the
      // picture without moving the camera: nothing downstream — culling, the
      // overlay, a click turned back into metres — sees a position the player
      // never travelled to. Rounded like everything else, or a knock would put
      // the whole world permanently between two pixels.
      return {
        x: Math.round(cam.vw / 2 - cam.rE * cam.zoom + shake.e * cam.zoom),
        y: Math.round(cam.vh / 2 + cam.rN * cam.zoom + shake.n * cam.zoom),
      };
    },

    /**
     * Advance the camera's own animations. Called once per fixed step.
     *
     * Separate from `follow` because these run whether or not the camera is
     * following anything — a knock while standing at the instrument still has
     * to decay, and a pan has to finish even if the player never moves.
     */
    tick(dt) {
      // The step starts here, so this is where the frame's interpolation origin
      // is taken from — before `follow` or a glide moves anything.
      cam.prevE = cam.e;
      cam.prevN = cam.n;
      shake.update(dt);
      if (pan) {
        pan.elapsed += dt;
        const k = easeInOutCubic(clamp01(pan.elapsed / pan.duration));
        cam.e = pan.fromE + (pan.toE - pan.fromE) * k;
        cam.n = pan.fromN + (pan.toN - pan.fromN) * k;
        cam.clampToBounds();
        if (k >= 1) pan = null;
      }
    },

    /**
     * A knock. Magnitude is in metres of throw at the default zoom, scaled so a
     * shake feels the same size zoomed in as zoomed out.
     */
    knock(magnitude) {
      shake.kick(magnitude * (ZOOM_DEFAULT / cam.zoom));
    },

    /** Whatever else is happening, stop animating and be where you are told. */
    cancelPan() {
      pan = null;
    },

    /** World rectangle currently visible, with an optional margin in metres. */
    viewRect(margin = 0) {
      const halfW = cam.vw / 2 / cam.zoom + margin;
      const halfH = cam.vh / 2 / cam.zoom + margin;
      return {
        minE: cam.rE - halfW,
        maxE: cam.rE + halfW,
        minN: cam.rN - halfH,
        maxN: cam.rN + halfH,
      };
    },

    /**
     * Critically damped follow. The exponential form is frame-rate independent,
     * so the camera behaves identically at 60 and 144 Hz — and the dead zone
     * keeps it from twitching while the player shuffles about setting up.
     *
     * The dead zone used to be 1.2 m, but it was never really 1.2: snapping the
     * stored position meant the follow could not move at all until the increment
     * cleared half a base pixel, which put the true threshold nearer 1.45 m and
     * made the world set off with a lurch. With the snap gone `excess` ramps from
     * zero properly, so a shorter, softer zone reads better than the old one did.
     */
    follow(target, dt, { deadZone = 0.7, stiffness = 6 } = {}) {
      // A pan owns the camera until it finishes; otherwise the follow drags it
      // back toward the player on every frame of the glide.
      if (pan) return;
      const dE = target.e - cam.e;
      const dN = target.n - cam.n;
      const d = Math.hypot(dE, dN);
      if (d > deadZone) {
        const excess = (d - deadZone) / d;
        const k = 1 - Math.exp(-stiffness * dt);
        cam.e += dE * excess * k;
        cam.n += dN * excess * k;
      }
      cam.clampToBounds();
    },

    snapTo(target) {
      pan = null;
      cam.setPosition(target.e, target.n);
    },

    /** Keep the valley on screen, with a little slack past the edge. */
    clampToBounds(margin = 40) {
      // Every camera mutation funnels through here, so this is the one place a
      // bad coordinate can be caught. A NaN camera draws nothing at all and
      // raises no error — the entire world simply disappears — which is a
      // miserable thing to debug from a screenshot.
      if (!Number.isFinite(cam.e) || !Number.isFinite(cam.n)) {
        const b = cam.bounds;
        cam.e = Number.isFinite(cam.e) ? cam.e : b ? (b.minE + b.maxE) / 2 : 0;
        cam.n = Number.isFinite(cam.n) ? cam.n : b ? (b.minN + b.maxN) / 2 : 0;
        console.warn('[camera] non-finite position, recentred');
      }

      if (cam.bounds) {
        const b = cam.bounds;
        const halfW = cam.vw / 2 / cam.zoom;
        const halfH = cam.vh / 2 / cam.zoom;

        const minE = b.minE - margin + halfW;
        const maxE = b.maxE + margin - halfW;
        const minN = b.minN - margin + halfH;
        const maxN = b.maxN + margin - halfH;

        // When the whole world fits on screen, centre it rather than fight over it.
        cam.e = minE > maxE ? (b.minE + b.maxE) / 2 : Math.min(maxE, Math.max(minE, cam.e));
        cam.n = minN > maxN ? (b.minN + b.maxN) / 2 : Math.min(maxN, Math.max(minN, cam.n));
      }
      // No snapping here. The stored position stays a float and the art-pixel
      // grid is applied once, at draw time, in `setAlpha` — see the header.
    },

    /**
     * Zoom toward a screen point, so the ground under the cursor stays put.
     * Snaps to the ladder — there are no in-between zoom levels, by design.
     */
    zoomAt(sx, sy, dir) {
      const before = cam.screenToWorld(sx, sy);
      const idx = ZOOM_LADDER.indexOf(cam.zoom);
      const from = idx >= 0 ? idx : nearestRung(cam.zoom);
      const next = Math.min(ZOOM_LADDER.length - 1, Math.max(0, from + dir));
      if (ZOOM_LADDER[next] === cam.zoom) return cam.zoom;

      cam.zoom = ZOOM_LADDER[next];
      const after = cam.screenToWorld(sx, sy);
      cam.setPosition(cam.e + before.e - after.e, cam.n + before.n - after.n);
      return cam.zoom;
    },

    stepZoom(dir, sx = null, sy = null) {
      if (sx != null) return cam.zoomAt(sx, sy, dir);
      const next = Math.min(ZOOM_LADDER.length - 1, Math.max(0, nearestRung(cam.zoom) + dir));
      cam.zoom = ZOOM_LADDER[next];
      cam.setPosition(cam.e, cam.n);
      return cam.zoom;
    },

    setZoom(z) {
      cam.zoom = ZOOM_LADDER[nearestRung(z)];
      cam.setPosition(cam.e, cam.n);
      return cam.zoom;
    },

    /**
     * Frame a set of world points — used when a station is set up, so the whole
     * figure being measured comes into view without the player fighting the
     * wheel. Picks the closest rung that fits.
     */
    fit(points, { padding = 12 } = {}) {
      if (!points.length) return cam.zoom;
      let minE = Infinity;
      let maxE = -Infinity;
      let minN = Infinity;
      let maxN = -Infinity;
      for (const p of points) {
        const pe = p.e ?? p.E;
        const pn = p.n ?? p.N;
        if (pe == null || pn == null) continue;
        if (pe < minE) minE = pe;
        if (pe > maxE) maxE = pe;
        if (pn < minN) minN = pn;
        if (pn > maxN) maxN = pn;
      }
      if (!Number.isFinite(minE)) return cam.zoom;

      const w = maxE - minE + padding * 2;
      const h = maxN - minN + padding * 2;
      const want = Math.min(cam.vw / w, cam.vh / h);

      let best = 0;
      for (let i = 0; i < ZOOM_LADDER.length; i++) if (ZOOM_LADDER[i] <= want) best = i;
      cam.zoom = ZOOM_LADDER[best];

      // The zoom lands immediately and the position glides.
      //
      // Only the position: the rungs are integer multiples of the art
      // resolution and tweening between two of them would put the whole world
      // on a fractional scale for the duration, which is the one thing this
      // file exists to prevent. Sliding to the figure is most of the effect
      // anyway — it was the teleport that read as a glitch.
      const toE = (minE + maxE) / 2;
      const toN = (minN + maxN) / 2;
      if (Math.hypot(toE - cam.e, toN - cam.n) < 0.5) {
        pan = null;
        cam.setPosition(toE, toN);
      } else {
        pan = { fromE: cam.e, fromN: cam.n, toE, toN, elapsed: 0, duration: FIT_PAN_SECONDS };
        cam.clampToBounds();
      }
      return cam.zoom;
    },

    /** Whether an eased pan is running, so `follow` can keep its hands off. */
    get panning() {
      return pan !== null;
    },

    get planMode() {
      return cam.zoom < PLAN_MODE_ZOOM;
    },
    get showDetail() {
      return cam.zoom >= DETAIL_ZOOM;
    },
  };

  cam.setAlpha(1);
  return cam;
}

function nearestRung(zoom) {
  let best = 0;
  for (let i = 1; i < ZOOM_LADDER.length; i++) {
    if (Math.abs(ZOOM_LADDER[i] - zoom) < Math.abs(ZOOM_LADDER[best] - zoom)) best = i;
  }
  return best;
}
