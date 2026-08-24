// Easing, and the small amount of state a knock needs.
//
// There was none of this anywhere in the render layer, which is why every
// transition in the game was a step: the camera teleported when a station was
// framed, and nothing anywhere could decay. None of those wanted a different
// value — they wanted the same value arrived at over a fraction of a second.
//
// Deliberately tiny, and deliberately only what has a caller. An easing library
// with twelve curves and two users is the same dead API as an audio setting
// with no button.

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Eased in and out. For things that both start and stop, like a pan. */
export function easeInOutCubic(t) {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/**
 * A decaying random offset: a knock, not a vibration.
 *
 * Amplitude falls off exponentially and the direction is re-rolled every frame,
 * so it reads as an impact settling rather than as a rumble. Callers round the
 * result — the whole renderer snaps to whole art pixels, and a shake is the one
 * effect that would otherwise leave the world permanently between two of them.
 *
 * `kick` takes the LARGER of the two magnitudes rather than adding them, so a
 * burst of events cannot compound into a screen-clearing lurch.
 */
export function makeShake({ decay = 7 } = {}) {
  let amp = 0;
  let e = 0;
  let n = 0;
  return {
    kick(magnitude) {
      amp = Math.max(amp, magnitude);
    },
    update(dt) {
      if (amp <= 0.01) {
        amp = 0;
        e = 0;
        n = 0;
        return;
      }
      amp *= Math.exp(-decay * dt);
      const a = Math.random() * Math.PI * 2;
      e = Math.cos(a) * amp;
      n = Math.sin(a) * amp;
    },
    get e() {
      return e;
    },
    get n() {
      return n;
    },
    get active() {
      return amp > 0;
    },
  };
}
