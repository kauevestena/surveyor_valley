// The band.
//
// Every instrument here is oscillators, filtered noise and a few buffers this
// file computes itself, so the "no audio files" rule holds for the score
// exactly as it does for the footsteps. A plucked string is Karplus–Strong — a
// burst of noise recirculating through a delay line one period long — rendered
// once per pitch the first time it is needed; a flute is a soft waveform with
// a breath of noise under it and vibrato that arrives late, the way a player's
// does; the strings are two detuned saws behind a slow filter.
//
// Nothing here assumes a live AudioContext. `makeBand(ctx, out)` accepts any
// BaseAudioContext, so an OfflineAudioContext renders the identical graph —
// which is how `tools/jukebox.html` writes a piece to a WAV file, and how a
// level in this file gets measured instead of guessed.
//
// `renderPluck` and `makeImpulse` are pure functions over plain arrays, so the
// tuning of the strings and the shape of the room are tested without a browser.

import { hzOf, midiOf } from './theory.js';
import { mulberry32 } from '../core/rng.js';

/**
 * Plucked strings are rendered at this rate and resampled on playback. All of
 * what a nylon string has is well under its 12 kHz Nyquist, and it halves the
 * memory every cached pitch costs.
 */
export const PLUCK_RATE = 24000;

/** Where each instrument can play. The score is checked against this. */
export const RANGE = Object.fromEntries(
  Object.entries({
    flute: ['C4', 'C7'],
    clarinet: ['D3', 'G6'],
    bells: ['C5', 'C8'],
    musicbox: ['C5', 'C8'],
    keys: ['C2', 'C7'],
    harp: ['C2', 'C7'],
    guitar: ['E2', 'E6'],
    viola: ['D2', 'E6'],
    pad: ['C3', 'C6'],
    bass: ['C1', 'G3'],
    upright: ['C1', 'G3'],
    shaker: ['C4', 'C4'],
    wood: ['C4', 'C4'],
  }).map(([k, [lo, hi]]) => [k, [midiOf(lo), midiOf(hi)]]),
);

/**
 * The mixing desk: how loud each instrument is at full velocity, where it sits
 * left to right, and how much of it goes to the room. Levels were set against
 * rendered audio, not by eye — see `tools/jukebox.html`.
 */
const DESK = {
  flute: { gain: 0.3, pan: 0.14, wet: 0.32 },
  clarinet: { gain: 0.26, pan: -0.16, wet: 0.3 },
  bells: { gain: 0.28, pan: -0.3, wet: 0.42 },
  musicbox: { gain: 0.26, pan: 0.06, wet: 0.36 },
  // A 1:1 FM pair puts its first lower sideband at exactly 0 Hz — a DC offset
  // that grows with every chord — so the keys' strip starts with a highpass.
  keys: { gain: 0.15, pan: -0.06, wet: 0.24, highpass: 35 },
  harp: { gain: 0.72, pan: -0.22, wet: 0.34 },
  guitar: { gain: 0.6, pan: -0.2, wet: 0.2 },
  viola: { gain: 0.8, pan: -0.16, wet: 0.24 },
  // Strings and the round bass each sit behind ONE filter on their strip rather
  // than one per note: the same sound, and a fraction of the work for a pad
  // that holds four notes at a time.
  pad: { gain: 0.07, pan: 0.02, wet: 0.5, lowpass: 1900 },
  bass: { gain: 0.15, pan: 0, wet: 0.04, lowpass: 520 },
  upright: { gain: 0.66, pan: 0.04, wet: 0.08 },
  shaker: { gain: 0.75, pan: 0.34, wet: 0.14 },
  wood: { gain: 0.12, pan: 0.26, wet: 0.16 },
};

/** Karplus–Strong settings for the strings that use it. `t60` is at A3. */
const STRINGS = {
  harp: { t60: 3.4, bright: 0.55, pos: 0.28 },
  guitar: { t60: 2.6, bright: 0.42, pos: 0.16 },
  // Steel and doubled: a second string a few cents sharp, and on the low
  // courses a third an octave up, which is what makes a viola caipira shimmer.
  viola: { t60: 3, bright: 0.72, pos: 0.12, double: 4, octaveBelow: 57 },
  upright: { t60: 1.5, bright: 0.12, pos: 0.22 },
};

// ---- pure DSP --------------------------------------------------------------------

/**
 * The first-order allpass coefficient whose phase delay at `w` is `delay`.
 *
 * The allpass supplies the fraction of a sample the delay line cannot: rounded
 * to whole samples, a string's period is up to a sample short, and at the top
 * of the harp — a period of about eighteen samples — that is tens of cents
 * sharp. The usual closed form for the coefficient, (1 − d)/(1 + d), is exact
 * only at low frequency; solving the phase delay itself costs forty iterations
 * once per pitch and takes the last fraction of a cent off as well.
 */
function allpassFor(delay, w) {
  const phaseDelay = (c) => (Math.atan2(Math.sin(w), c + Math.cos(w)) - Math.atan2(c * Math.sin(w), 1 + c * Math.cos(w))) / w;
  let lo = -0.999;
  let hi = 0.999;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (phaseDelay(mid) > delay) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * One plucked string, as samples.
 *
 * @param {number} sampleRate
 * @param {number} hz      the pitch, which this hits to within a fraction of a cent
 * @param {object} [o]
 * @param {number} [o.t60]     seconds to decay by 60 dB at the fundamental
 * @param {number} [o.bright]  0..1, how hard and how near the bridge it was plucked
 * @param {number} [o.pos]     pluck position along the string, which notches the harmonics
 * @param {number} [o.seed]    the excitation noise is seeded, so a render is reproducible
 * @param {number} [o.length]  seconds of buffer
 * @returns {Float32Array} peak-normalized to 0.9, faded out at the end
 */
export function renderPluck(sampleRate, hz, { t60 = 2, bright = 0.5, pos = 0.2, seed = 1, length } = {}) {
  const n = Math.max(64, Math.round((length ?? Math.min(4, t60)) * sampleRate));
  const out = new Float32Array(n);
  const period = sampleRate / hz;
  const w = (2 * Math.PI * hz) / sampleRate;

  // The loop: N whole samples, half a sample in the two-point average, and an
  // allpass for the fraction that is left.
  const N = Math.max(2, Math.floor(period - 0.65));
  const C = allpassFor(period - 0.5 - N, w);
  const g = Math.min(0.99999, Math.pow(10, -3 / (t60 * hz)) / Math.cos(w / 2));

  // A period of noise, smoothed by how soft the pluck is, then notched by
  // where on the string it happened.
  const rnd = mulberry32(seed);
  const exc = new Float32Array(N);
  const a = 0.1 + 0.85 * bright;
  let y = 0;
  for (let i = 0; i < N; i++) {
    y += a * (rnd() * 2 - 1 - y);
    exc[i] = y;
  }
  const k = Math.max(1, Math.round(pos * N));
  for (let i = N - 1; i >= k; i--) exc[i] -= exc[i - k];
  let mean = 0;
  for (let i = 0; i < N; i++) mean += exc[i];
  mean /= N;
  for (let i = 0; i < N; i++) exc[i] -= mean;

  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = i >= N ? out[i - N] : 0;
    const s1 = i > N ? out[i - N - 1] : 0;
    const v = g * 0.5 * (s0 + s1);
    const ap = C * v + x1 - C * y1;
    x1 = v;
    y1 = ap;
    out[i] = ap + (i < N ? exc[i] : 0);
  }

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? 0.9 / peak : 0;
  const fade = Math.min(n, Math.round(0.03 * sampleRate));
  for (let i = 0; i < n; i++) {
    const tail = i >= n - fade ? (n - i) / fade : 1;
    out[i] *= scale * tail;
  }
  return out;
}

/** A string of the named kind at a MIDI pitch, doubled where the kind is. */
export function renderString(kind, midi, sampleRate = PLUCK_RATE) {
  const s = STRINGS[kind];
  const hz = hzOf(midi);
  // Higher strings ring for less time, as they do on any instrument.
  const t60 = s.t60 * Math.pow(220 / hz, 0.35);
  const opts = { t60, bright: s.bright, pos: s.pos, seed: midi * 7 + 1 };
  const out = renderPluck(sampleRate, hz, opts);
  if (!s.double) return out;

  const second = renderPluck(sampleRate, hz * Math.pow(2, s.double / 1200), { ...opts, seed: opts.seed + 1, length: out.length / sampleRate });
  const octave = midi < s.octaveBelow ? renderPluck(sampleRate, hz * 2, { ...opts, t60: t60 * 0.8, seed: opts.seed + 2, length: out.length / sampleRate }) : null;
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] += 0.8 * second[i] + (octave ? 0.4 * octave[i] : 0);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < out.length; i++) out[i] *= 0.9 / peak;
  return out;
}

/**
 * A room, as a stereo impulse response.
 *
 * Exponentially decaying noise, darker as it goes because high frequencies die
 * first in any real space, with a handful of early reflections in front so it
 * sounds like walls rather than fog. The two channels are independent noise,
 * which is all the stereo width a reverb needs.
 *
 * @returns {[Float32Array, Float32Array]}
 */
export function makeImpulse(sampleRate, seconds = 2.4, { seed = 7, predelay = 0.012 } = {}) {
  const n = Math.round(seconds * sampleRate);
  const pre = Math.round(predelay * sampleRate);
  const rnd = mulberry32(seed);
  const channels = [new Float32Array(n), new Float32Array(n)];
  const early = [
    [0.011, 0.5],
    [0.019, -0.36],
    [0.027, 0.3],
    [0.041, -0.22],
    [0.053, 0.16],
  ];
  channels.forEach((ch, c) => {
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sampleRate;
      const a = 0.08 + 0.85 * Math.exp(-t * 2.2);
      lp += a * (rnd() * 2 - 1 - lp);
      ch[i] = lp * Math.exp((-6.9 * t) / seconds);
    }
    for (const [at, gain] of early) {
      const i = pre + Math.round(at * (c ? 1.13 : 1) * sampleRate);
      if (i < n) ch[i] += gain;
    }
  });
  return channels;
}

// ---- the graph -------------------------------------------------------------------

/** Harmonic recipes for the two wind instruments, as sine amplitudes. */
const WAVES = {
  // Nearly a sine, with just enough above it to be a flute and not a whistle.
  flute: [0, 1, 0.38, 0.14, 0.06, 0.025],
  // Odd harmonics strong and even ones faint: a closed pipe, which is a clarinet.
  clarinet: [0, 1, 0.06, 0.48, 0.05, 0.3, 0.04, 0.16, 0.02, 0.08, 0.01, 0.04],
};

/** Inharmonic partials of a struck bar: [ratio, amplitude, decay time constant]. */
const BARS = {
  bells: [
    [1, 1, 0.7],
    [2.76, 0.3, 0.22],
    [5.4, 0.11, 0.08],
  ],
  musicbox: [
    [1, 1, 0.5],
    [2, 0.16, 0.24],
    [4.16, 0.08, 0.07],
  ],
};

/**
 * Attack, decay to a sustain level, release — on a gain parameter.
 *
 * Linear up from silence (an exponential ramp cannot start at zero, which is
 * the bug the old ambient pad worked round with 0.0001), then exponential
 * approaches, which never need a non-zero target.
 *
 * @returns {number} the time by which the voice is inaudible
 */
function envelope(param, when, dur, { a, d, s, r, peak }) {
  const release = when + Math.max(dur, a + 0.005);
  param.setValueAtTime(0, when);
  param.linearRampToValueAtTime(peak, when + a);
  param.setTargetAtTime(peak * s, when + a, d);
  param.setTargetAtTime(0, release, r);
  // Five time constants is -43 dB: inaudible under a mix, and every voice
  // stopped sooner is one the audio thread is no longer computing.
  return release + r * 5;
}

/**
 * Build the band on `ctx`, playing into `out`.
 *
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @returns {{ play(ev:object, when:number):void, warm(events:object[], budgetMs?:number):boolean }}
 */
export function makeBand(ctx, out) {
  const sr = ctx.sampleRate;
  const nyquist = sr / 2;

  // The room and the bus. A lowpass takes the fizz off the top of every synth
  // voice at once — the warmth is mostly what is missing above 9 kHz — and a
  // gentle compressor keeps a chord landing on a melody note from poking out.
  const bus = ctx.createGain();
  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.value = 9000;
  warmth.Q.value = 0.5;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.knee.value = 18;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.02;
  glue.release.value = 0.35;
  bus.connect(warmth).connect(glue).connect(out);

  const room = ctx.createConvolver();
  room.normalize = true;
  const [left, right] = makeImpulse(sr);
  const ir = ctx.createBuffer(2, left.length, sr);
  ir.getChannelData(0).set(left);
  ir.getChannelData(1).set(right);
  room.buffer = ir;
  const roomIn = ctx.createGain();
  roomIn.connect(room).connect(bus);

  // One second of seeded noise, for breath, shakers and clicks.
  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  const rnd = mulberry32(99);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  const waves = {};
  for (const [name, amps] of Object.entries(WAVES)) {
    const imag = Float32Array.from(amps);
    waves[name] = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
  }

  // A channel strip per instrument: pan, then a dry path and a send to the room.
  const strips = {};
  for (const [name, d] of Object.entries(DESK)) {
    const input = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = d.pan;
    let head = input;
    for (const type of ['lowpass', 'highpass']) {
      if (!d[type]) continue;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = Math.min(nyquist * 0.8, d[type]);
      f.Q.value = type === 'lowpass' ? 0.5 : 0.7;
      head = head.connect(f);
    }
    const dry = ctx.createGain();
    dry.gain.value = 1;
    const send = ctx.createGain();
    send.gain.value = d.wet;
    head.connect(pan);
    pan.connect(dry).connect(bus);
    pan.connect(send).connect(roomIn);
    strips[name] = input;
  }

  const plucks = new Map();
  function pluckBuffer(kind, midi) {
    const key = `${kind}:${midi}`;
    let buf = plucks.get(key);
    if (!buf) {
      const data = renderString(kind, midi);
      buf = ctx.createBuffer(1, data.length, PLUCK_RATE);
      buf.getChannelData(0).set(data);
      plucks.set(key, buf);
    }
    return buf;
  }

  /** Where in the noise buffer a voice starts — varied, and still reproducible. */
  const noiseOffset = (ev, when) => (ev.midi * 0.0731 + when * 0.37) % 0.8;

  function osc(type, hz, when) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, when);
    return o;
  }

  function plucked(kind) {
    return (ev, when, input, gain) => {
      const buf = pluckBuffer(kind, ev.midi);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const length = buf.length / PLUCK_RATE;
      const damp = when + Math.min(Math.max(ev.dur, 0.05), length);
      g.gain.setValueAtTime(ev.vel * gain, when);
      // Lifting a finger off the string, rather than letting it ring out.
      g.gain.setTargetAtTime(0, damp, 0.07);
      src.connect(g).connect(input);
      src.start(when);
      src.stop(Math.min(when + length, damp + 0.5));
    };
  }

  function wind(wave, { attack, vibrato, breath, cutoff }) {
    return (ev, when, input, gain) => {
      const hz = hzOf(ev.midi);
      const peak = ev.vel * gain;
      const o = ctx.createOscillator();
      o.setPeriodicWave(waves[wave]);
      o.frequency.setValueAtTime(hz, when);
      const amp = ctx.createGain();
      const end = envelope(amp.gain, when, ev.dur, { a: attack, d: 0.3, s: 0.86, r: 0.08, peak });
      if (cutoff) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(Math.min(nyquist * 0.9, cutoff), when);
        lp.Q.setValueAtTime(0.6, when);
        o.connect(lp).connect(amp);
      } else {
        o.connect(amp);
      }
      amp.connect(input);
      o.start(when);
      o.stop(end);

      // Vibrato that arrives late, and only on a note long enough to hold it.
      if (ev.dur > 0.45) {
        const lfo = osc('sine', 5.1, when);
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, when);
        depth.gain.setValueAtTime(0, when + 0.22);
        depth.gain.linearRampToValueAtTime(hz * vibrato, when + 0.62);
        lfo.connect(depth).connect(o.frequency);
        lfo.start(when);
        lfo.stop(end);
      }

      // Breath: a chiff at the start that settles into the tone. Only the first
      // moments of a note — air under a held note costs three nodes for its
      // whole length and is masked by the reverb anyway.
      const airEnd = Math.min(end, when + 0.35);
      const air = ctx.createBufferSource();
      air.buffer = noise;
      air.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(Math.min(nyquist * 0.8, hz * 2.2), when);
      band.Q.setValueAtTime(0.9, when);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0, when);
      ag.gain.linearRampToValueAtTime(peak * breath, when + 0.015);
      ag.gain.setTargetAtTime(0, when + 0.015, 0.05);
      air.connect(band).connect(ag).connect(input);
      air.start(when, noiseOffset(ev, when));
      air.stop(airEnd);
    };
  }

  function struck(partials, click) {
    return (ev, when, input, gain) => {
      const hz = hzOf(ev.midi);
      const peak = ev.vel * gain;
      let end = when;
      for (const [ratio, amount, tc] of partials) {
        if (hz * ratio >= nyquist * 0.9) continue;
        const o = osc('sine', hz * ratio, when);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(peak * amount, when + 0.002);
        g.gain.setTargetAtTime(0, when + 0.002, tc);
        o.connect(g).connect(input);
        o.start(when);
        const stop = when + 0.002 + tc * 5;
        o.stop(stop);
        end = Math.max(end, stop);
      }
      if (click) {
        const c = ctx.createBufferSource();
        c.buffer = noise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(Math.min(nyquist * 0.8, 5000), when);
        const g = ctx.createGain();
        g.gain.setValueAtTime(peak * click, when);
        g.gain.setTargetAtTime(0, when, 0.004);
        c.connect(hp).connect(g).connect(input);
        c.start(when, noiseOffset(ev, when));
        c.stop(when + 0.04);
      }
      return end;
    };
  }

  const VOICES = {
    flute: wind('flute', { attack: 0.07, vibrato: 0.0055, breath: 0.3 }),
    clarinet: wind('clarinet', { attack: 0.05, vibrato: 0.0035, breath: 0.12, cutoff: 2600 }),
    bells: struck(BARS.bells, 0),
    musicbox: struck(BARS.musicbox, 0.18),
    harp: plucked('harp'),
    guitar: plucked('guitar'),
    viola: plucked('viola'),
    upright: plucked('upright'),

    // Two-operator FM, the electric piano every keyboard of the eighties had:
    // the modulator's depth falls away after the strike, so it starts bright
    // and settles into something close to a sine.
    keys(ev, when, input, gain) {
      const hz = hzOf(ev.midi);
      const carrier = osc('sine', hz, when);
      const mod = osc('sine', hz, when);
      const index = ctx.createGain();
      index.gain.setValueAtTime(hz * (0.8 + 1.3 * ev.vel), when);
      index.gain.setTargetAtTime(hz * 0.16, when, 0.32);
      mod.connect(index).connect(carrier.frequency);
      const amp = ctx.createGain();
      const end = envelope(amp.gain, when, ev.dur, { a: 0.004, d: 0.9, s: 0.32, r: 0.22, peak: ev.vel * gain });
      carrier.connect(amp).connect(input);
      carrier.start(when);
      mod.start(when);
      carrier.stop(end);
      mod.stop(end);
    },

    // Strings: two saws a few cents apart, so they beat like a section, behind
    // the strip's filter. The slow attack is the bow.
    pad(ev, when, input, gain) {
      const hz = hzOf(ev.midi);
      const amp = ctx.createGain();
      const end = envelope(amp.gain, when, ev.dur, { a: 1.1, d: 1.2, s: 1, r: 0.7, peak: ev.vel * gain });
      for (const cents of [-7, 7]) {
        const o = osc('sawtooth', hz, when);
        o.detune.setValueAtTime(cents, when);
        o.connect(amp);
        o.start(when);
        o.stop(end);
      }
      amp.connect(input);
    },

    // A round bass: a triangle for the body and a sine under it, behind the
    // strip's filter so only the note comes through and none of the edge.
    bass(ev, when, input, gain) {
      const hz = hzOf(ev.midi);
      const amp = ctx.createGain();
      const end = envelope(amp.gain, when, ev.dur * 0.94, { a: 0.012, d: 0.4, s: 0.62, r: 0.07, peak: ev.vel * gain });
      const tri = osc('triangle', hz, when);
      const sub = osc('sine', hz, when);
      const subGain = ctx.createGain();
      subGain.gain.value = 0.6;
      tri.connect(amp);
      sub.connect(subGain).connect(amp);
      amp.connect(input);
      for (const o of [tri, sub]) {
        o.start(when);
        o.stop(end);
      }
    },

    // A shaker, or a caxixi: a short hiss with nothing under 4 kHz.
    shaker(ev, when, input, gain) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(Math.min(nyquist * 0.8, 4200), when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(ev.vel * gain, when + 0.006);
      g.gain.setTargetAtTime(0, when + 0.006, 0.036);
      src.connect(hp).connect(g).connect(input);
      src.start(when, noiseOffset(ev, when));
      src.stop(when + 0.2);
    },

    // A woodblock: a pitched knock that drops as it dies.
    wood(ev, when, input, gain) {
      const o = osc('sine', 1180, when);
      o.frequency.setTargetAtTime(880, when, 0.012);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(ev.vel * gain, when + 0.002);
      g.gain.setTargetAtTime(0, when + 0.002, 0.022);
      o.connect(g).connect(input);
      o.start(when);
      o.stop(when + 0.2);
    },
  };

  return {
    /** Schedule one note. Unknown instruments are ignored rather than thrown on. */
    play(ev, when) {
      const voice = VOICES[ev.inst];
      if (!voice) return;
      voice(ev, when, strips[ev.inst], DESK[ev.inst].gain);
    },

    /**
     * Render the string buffers a piece will need, a few at a time.
     *
     * Each one costs a millisecond or so, which is nothing once and a dropped
     * frame twenty times over — so they are made during the quiet before a
     * piece rather than on its first downbeat.
     *
     * @returns {boolean} true once everything asked for is ready
     */
    warm(events, budgetMs = 3) {
      const clock = globalThis.performance ?? Date;
      const start = clock.now();
      for (const ev of events) {
        if (!STRINGS[ev.inst] || plucks.has(`${ev.inst}:${ev.midi}`)) continue;
        if (clock.now() - start > budgetMs) return false;
        pluckBuffer(ev.inst, ev.midi);
      }
      return true;
    },

    get cachedStrings() {
      return plucks.size;
    },
  };
}
