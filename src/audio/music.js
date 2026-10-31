// What plays, and when.
//
// The pacing is the farm-sim day's, and it is most of what makes that kind of
// soundtrack restful rather than wallpaper: a piece plays ONCE, and then the
// valley gets a minute or so to itself — birds, footsteps, a hen somewhere —
// before the next one. Forty minutes of continuous music over a survey is how
// a student ends up muting the game; a piece arriving out of the quiet is how
// it stays welcome. Two scenes:
//
//   title   the theme, looped with a breath between plays — on the opening
//           screen, and again once the last property is done
//   field   the three field pieces from a shuffle bag, each followed by quiet;
//           a new job fades the current piece and brings in the next
//
// The scheduler is the standard lookahead kind. A timer every 100 ms queues
// whatever falls in the next half second against the AUDIO clock, so the
// timing is sample-exact however much the main thread stutters baking ground
// chunks. A stall longer than the lookahead drops the notes it missed rather
// than firing them all at once — a missing bar is a hiccup, a burst is a crash.
//
// Nothing is scheduled while the sound is muted or the music switched off. On
// a classroom machine that is forty minutes of synthesis not spent on silence.

import { arrange } from './arrange.js';
import { TRACKS, TITLE, FIELD } from './tracks.js';
import { makeBand } from './instruments.js';

/** Seconds of notes queued ahead of the audio clock. */
export const LOOKAHEAD = 0.5;
export const TICK_MS = 100;
/** Seconds of quiet between field pieces, drawn uniformly from this range. */
export const QUIET = [45, 75];
/** Seconds between plays of the title theme. */
export const BREATH = 6;
/** The fade when a scene or a job changes, and the pause after it. */
export const FADE = 2;
export const GAP = 2.5;
/** A note this late is dropped rather than played late. */
const LATE = 0.05;

/**
 * Every piece once before any piece twice, and never the same piece twice
 * running — not even across the boundary where the bag is refilled, which is
 * exactly where a plain shuffle repeats itself one time in three.
 */
export function makeBag(ids, random = Math.random) {
  let bag = [];
  let last = null;
  return {
    next() {
      if (!bag.length) {
        bag = [...ids];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        const top = bag.length - 1;
        if (top > 0 && bag[top] === last) [bag[0], bag[top]] = [bag[top], bag[0]];
      }
      last = bag.pop();
      return last;
    },
  };
}

/**
 * @param {object} p
 * @param {BaseAudioContext} p.ctx
 * @param {AudioNode} p.out        the music bus
 * @param {() => boolean} [p.audible]   false while muted or with music off
 * @param {(tonic:number) => void} [p.onKey]  told the key of every piece as it starts
 * @param {() => number} [p.random]
 * @param {boolean} [p.autoTick]   false in tests, which call `tick()` themselves
 */
export function makeDirector({ ctx, out, audible = () => true, onKey = () => {}, random = Math.random, autoTick = true, tracks = TRACKS }) {
  const fader = ctx.createGain();
  fader.connect(out);
  const band = makeBand(ctx, fader);
  const bag = makeBag(FIELD, random);

  let scene = null;
  let current = null; // { piece, t0, i, warm }
  let upcoming = null; // arranged during the quiet, so its strings are ready
  let restUntil = 0;
  let paused = false;
  let plays = 0;

  const now = () => ctx.currentTime;

  function pick() {
    const id = scene === 'title' ? TITLE : bag.next();
    plays += 1;
    // A fresh seed every play: the same notes, never quite the same performance.
    const piece = arrange(tracks[id], { seed: `${plays}:${Math.floor(random() * 1e9)}` });
    return { piece, scene };
  }

  function begin(piece) {
    const t = now();
    fader.gain.cancelScheduledValues(t);
    fader.gain.setValueAtTime(piece.level, t);
    current = { piece, t0: t + 0.15, i: 0, warm: false };
    onKey(piece.tonic);
  }

  function fadeOut(seconds) {
    if (!current) return;
    const t = now();
    fader.gain.cancelScheduledValues(t);
    fader.gain.setValueAtTime(fader.gain.value, t);
    fader.gain.linearRampToValueAtTime(0, t + seconds);
    current = null;
  }

  function tick() {
    const t = now();
    if (!audible()) {
      if (current) fadeOut(0.3);
      paused = true;
      return;
    }
    if (paused) {
      // Back on: a fresh piece after a moment, never the middle of a phrase.
      paused = false;
      restUntil = Math.max(restUntil, t + GAP);
    }

    if (current) {
      const { piece, t0 } = current;
      const horizon = t + LOOKAHEAD;
      while (current.i < piece.events.length) {
        const ev = piece.events[current.i];
        const at = t0 + ev.t;
        if (at >= horizon) break;
        current.i++;
        if (at < t - LATE) continue;
        band.play(ev, Math.max(at, t));
      }
      if (!current.warm) current.warm = band.warm(piece.events.slice(current.i), 2);
      if (t >= t0 + piece.length) {
        current = null;
        restUntil = t + (scene === 'title' ? BREATH : QUIET[0] + random() * (QUIET[1] - QUIET[0]));
      }
      return;
    }

    if (!scene) return;
    if (!upcoming || upcoming.scene !== scene) upcoming = pick();
    band.warm(upcoming.piece.events);
    if (t >= restUntil) {
      const { piece } = upcoming;
      upcoming = null;
      begin(piece);
    }
  }

  const timer = autoTick ? setInterval(tick, TICK_MS) : null;

  return {
    tick,

    /** `'title'`, `'field'`, or null for silence. Changing scene fades what is playing. */
    setScene(name) {
      if (name === scene) return;
      scene = name;
      const t = now();
      if (current) {
        fadeOut(FADE);
        restUntil = t + FADE + GAP;
      } else {
        restUntil = Math.min(Math.max(restUntil, t), t + (name === 'title' ? 0.3 : GAP));
      }
    },

    /** A new job: fade the field piece and bring in the next one. */
    nextTrack() {
      if (scene !== 'field') return;
      const t = now();
      if (current) {
        fadeOut(FADE);
        restUntil = t + FADE + GAP;
      } else {
        restUntil = Math.min(restUntil, t + GAP);
      }
    },

    stop() {
      if (timer) clearInterval(timer);
      fadeOut(0.3);
      scene = null;
    },

    /** What is happening right now, for the debug handle and the jukebox. */
    get nowPlaying() {
      const t = now();
      if (current) {
        const at = Math.max(0, t - current.t0);
        const bars = current.piece.bars.filter((b) => b.t <= at);
        return {
          scene,
          state: 'playing',
          id: current.piece.id,
          title: current.piece.title,
          at: +at.toFixed(2),
          length: +current.piece.length.toFixed(2),
          bar: bars.length,
          section: bars.length ? bars[bars.length - 1].section : null,
        };
      }
      return {
        scene,
        state: paused ? 'paused' : scene ? 'resting' : 'idle',
        next: upcoming?.piece.id ?? null,
        restLeft: +Math.max(0, restUntil - t).toFixed(2),
      };
    },
  };
}
