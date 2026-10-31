// The soundtrack.
//
// The score was written blind — as text, by somebody who could not hear it —
// so this file is the ear. Three kinds of promise, and each fails silently in
// a browser if nothing checks it:
//
//   * THE SCORE IS RIGHT. Every bar is a bar long, every note is in its
//     instrument's range, and every strong beat of every tune sits with its
//     chord. A wrong note does not throw anywhere; it just sounds wrong, in one
//     bar of one piece, for every player, forever.
//   * THE SOUND IS BUILDABLE. A non-finite frequency or an exponential ramp to
//     zero throws inside Web Audio, and inside the scheduler that means a note
//     — or the whole rest of a piece — never plays, with nothing on screen to
//     say so. Every note of every piece is played here into a mock context
//     that refuses exactly what a browser refuses.
//   * THE PACING HOLDS. A piece, then quiet, then a different piece; a new job
//     brings the next one in; nothing is scheduled while the music is off.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TPQ, midiOf, hzOf, pcOf, parseChord, parseLine, consonantWith, voiceChord, shiftFromA, parseKey } from '../src/audio/theory.js';
import { arrange, lint, score, PATTERNS, harmonyNote } from '../src/audio/arrange.js';
import { TRACKS, TITLE, FIELD } from '../src/audio/tracks.js';
import { makeBand, renderPluck, renderString, makeImpulse, RANGE, PLUCK_RATE } from '../src/audio/instruments.js';
import { makeDirector, makeBag, QUIET, BREATH, FADE, GAP } from '../src/audio/music.js';
import { mulberry32 } from '../src/core/rng.js';

const PIECES = Object.values(TRACKS);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const names = (set) => [...set].sort((a, b) => a - b).map((pc) => NAMES[pc]);

// ---- theory -------------------------------------------------------------------

test('pitch names map to MIDI and to concert pitch', () => {
  assert.equal(midiOf('A4'), 69);
  assert.equal(midiOf('C4'), 60);
  assert.equal(midiOf('Bb3'), 58);
  assert.equal(midiOf('F#5'), 78);
  // Spelled the way the harmony wants it read, and the number agrees.
  assert.equal(midiOf('Cb4'), 59);
  assert.equal(midiOf('E#4'), 65);
  assert.equal(hzOf(69), 440);
  assert.ok(Math.abs(hzOf(60) - 261.6256) < 1e-3);
  assert.throws(() => midiOf('H2'), /not a pitch/);
});

test('chord symbols parse, slash basses included', () => {
  const c = parseChord('Gmaj7/B');
  assert.equal(c.root, 7);
  assert.equal(c.bass, 11);
  assert.deepEqual(names(c.pcs), ['D', 'F#', 'G', 'B']);
  assert.equal(c.family, 'major');

  assert.deepEqual(names(parseChord('A7sus4').pcs), ['D', 'E', 'G', 'A']);
  assert.equal(parseChord('A7sus4').family, 'sus4');
  assert.deepEqual(names(parseChord('Cadd9').pcs), ['C', 'D', 'E', 'G']);
  assert.deepEqual(names(parseChord('Dm6').pcs), ['D', 'F', 'A', 'B']);
  assert.equal(parseChord('C#7').family, 'dominant');
  // A slash bass outside the chord is still a sounding note.
  assert.deepEqual(names(parseChord('A/G').pcs), ['C#', 'E', 'G', 'A']);

  assert.throws(() => parseChord('Cmaj13#11'), /unknown chord quality/);
  assert.throws(() => parseChord('X7'), /not a chord/);
});

test('the avoid-note rule: nothing a semitone above what the chord contains', () => {
  // The fourth over a major chord sits on its third.
  assert.ok(!consonantWith(parseChord('C')).has(5));
  // The root of a maj7 sits on its seventh — a tone of the chord, and still out.
  assert.ok(!consonantWith(parseChord('Cmaj7')).has(0));
  assert.ok(consonantWith(parseChord('C')).has(0));
  // Ninths, sixths and sevenths are colour.
  assert.ok(consonantWith(parseChord('C')).has(2));
  assert.ok(consonantWith(parseChord('C')).has(9));
  assert.ok(consonantWith(parseChord('Cmaj7')).has(11));
  // The eleventh over minor is fine; the minor sixth is not.
  assert.ok(consonantWith(parseChord('Am7')).has(2));
  assert.ok(!consonantWith(parseChord('Am7')).has(5));
  // The slash bass counts: G♯ over A/G is a semitone over the G.
  assert.ok(!consonantWith(parseChord('A/G')).has(8));
});

test('melody lines: durations, ties, triplets — and errors that say where', () => {
  const { notes, bars } = parseLine('F#5q. E5e D5e E5e F#5q | E5h. A4q~ | A4q rh.', 4 * TPQ);
  assert.equal(bars, 3);
  assert.deepEqual(notes.slice(0, 2), [
    { tick: 0, dur: 1.5 * TPQ, midi: 78 },
    { tick: 1.5 * TPQ, dur: TPQ / 2, midi: 76 },
  ]);
  // The tie folds across the barline into one note of two beats.
  assert.deepEqual(notes.at(-2), { tick: 7 * TPQ, dur: 2 * TPQ, midi: 69 });
  assert.equal(notes.at(-1).midi, null);

  const trip = parseLine('C5et D5et E5et F5h.', 4 * TPQ).notes;
  assert.deepEqual(trip.map((n) => n.dur), [TPQ / 3, TPQ / 3, TPQ / 3, 3 * TPQ]);

  assert.throws(() => parseLine('C5q D5q | E5w', 4 * TPQ), /bar 1 is 2 beats long, not 4/);
  assert.throws(() => parseLine('C5q D5x E5h', 4 * TPQ), /cannot read "D5x"/);
  assert.throws(() => parseLine('C5h~ D5h', 4 * TPQ), /tie between two different pitches/);
  assert.throws(() => parseLine('C5w~', 4 * TPQ), /ends on a tie/);
});

test('the sound effects follow the key of the music, never more than a tritone', () => {
  for (let tonic = 0; tonic < 12; tonic++) {
    const s = shiftFromA(tonic);
    assert.ok(s >= -6 && s <= 5, `shift ${s} for ${NAMES[tonic]}`);
    assert.equal(pcOf(9 + s), tonic, `A moved by ${s} is not ${NAMES[tonic]}`);
  }
  assert.equal(shiftFromA(parseKey('A').tonic), 0);
});

// ---- the score ---------------------------------------------------------------------

test('the title theme is not in the field rotation, and every piece in it exists', () => {
  assert.ok(TRACKS[TITLE], 'no title theme');
  assert.ok(!FIELD.includes(TITLE));
  assert.equal(new Set(FIELD).size, FIELD.length);
  assert.ok(FIELD.length >= 3);
  for (const id of FIELD) assert.ok(TRACKS[id], `field piece "${id}" is not in TRACKS`);
  for (const [id, t] of Object.entries(TRACKS)) assert.equal(t.id, id);
});

test('every bar of every piece is a bar long, and every strong beat sits with its chord', () => {
  // `lint` collects rather than throws, so one failing piece reports every
  // bar that is wrong instead of only the first.
  const problems = PIECES.flatMap((t) => lint(t));
  assert.deepEqual(problems, [], `\n  ${problems.join('\n  ')}`);
});

test('the lint catches a wrong note and a bar of the wrong length', () => {
  // The check above passes; a check that could never fail would pass too.
  const probe = (lines, chords = 'C | Cmaj7') => ({
    id: 'probe',
    title: 'probe',
    key: 'C',
    meter: '4/4',
    bpm: 100,
    parts: { lead: { inst: 'flute' } },
    sections: { A: { chords, lines: { lead: lines }, parts: [] } },
    form: ['A'],
  });
  assert.deepEqual(lint(probe('E5w | B4w')), []);
  const clash = lint(probe('E5w | C5w'));
  assert.ok(clash.some((p) => /probe A bar 2 beat 1: lead holds C5 over Cmaj7/.test(p)), clash.join('\n'));
  assert.ok(lint(probe('F5w | B4w')).some((p) => /bar 1 beat 1: lead holds F5 over C/.test(p)));
  assert.ok(lint(probe('E5w | B4h')).some((p) => /bar 2 is 2 beats long/.test(p)));
  assert.ok(lint(probe('E5w', 'C | C')).some((p) => /1 bars of melody over 2 bars of chords/.test(p)));
});

test('every note is inside its instrument, and every instrument exists', () => {
  for (const t of PIECES) {
    const { notes } = score(t);
    for (const n of notes) {
      const range = RANGE[n.inst];
      assert.ok(range, `${t.id}: "${n.part}" plays "${n.inst}", which the band does not have`);
      if (n.inst === 'shaker' || n.inst === 'wood') continue;
      assert.ok(n.midi >= range[0] && n.midi <= range[1], `${t.id} ${n.part}: MIDI ${n.midi} is outside ${n.inst}'s ${range[0]}–${range[1]}`);
    }
  }
});

test('every pattern is exactly one bar of its metre', () => {
  const bar = { '4/4': 4 * TPQ, '3/4': 3 * TPQ, '6/8': 3 * TPQ };
  const step = { q: TPQ, e: TPQ / 2, s: TPQ / 4 };
  for (const [name, p] of Object.entries(PATTERNS)) {
    if (!p.steps) continue;
    for (const line of Array.isArray(p.steps) ? p.steps : [p.steps]) {
      assert.equal(line.split(/\s+/).length * step[p.step], bar[p.meter], `pattern "${name}"`);
    }
  }
});

test('chords move like voices: small steps, and no cluster at the top', () => {
  for (const t of PIECES) {
    for (const [part, def] of Object.entries(t.parts)) {
      const pattern = PATTERNS[def.pattern];
      if (!def.range || !pattern || ['bass', 'pedal', 'perc'].includes(pattern.kind)) continue;
      const symbols = t.form.flatMap((n) => t.sections[n].chords.split('|').flatMap((b) => b.trim().split(/\s+/).filter(Boolean)));
      let prev = null;
      let moved = 0;
      let changes = 0;
      for (const s of symbols) {
        const v = voiceChord(parseChord(s), prev, { lo: midiOf(def.range[0]), hi: midiOf(def.range[1]), voices: def.voices ?? 3 });
        assert.ok(v.at(-1) - v.at(-2) > 1, `${t.id} ${part}: ${s} voiced with a semitone at the top`);
        if (prev && prev.length === v.length) {
          moved += v.reduce((sum, n, i) => sum + Math.abs(n - prev[i]), 0);
          changes++;
        }
        prev = v;
      }
      assert.ok(moved / changes <= 6, `${t.id} ${part}: voices move ${(moved / changes).toFixed(1)} semitones a change`);
    }
  }
});

test('the second voice sings a third below where it can, and never clashes on a beat', () => {
  const key = parseKey('A');
  // A plain third, off the beat.
  assert.equal(harmonyNote(midiOf('E5'), parseChord('A'), key, false), midiOf('C#5'));
  // On the borrowed Dm6, the third below A is the chord's own F, out of key or not.
  assert.equal(harmonyNote(midiOf('A5'), parseChord('Dm6'), key, true), midiOf('F5'));
  // Never the root of a maj7, even though it is a tone of the chord.
  const under = harmonyNote(midiOf('D6'), parseChord('Bbmaj7'), parseKey('F'), true);
  assert.notEqual(pcOf(under), 10);
  assert.ok(consonantWith(parseChord('Bbmaj7')).has(pcOf(under)));
});

// ---- the performance --------------------------------------------------------------

test('a performance is reproducible from its seed, and a new seed changes only the feel', () => {
  for (const t of PIECES) {
    const a = arrange(t, { seed: 'one' });
    assert.deepEqual(arrange(t, { seed: 'one' }), a, `${t.id}: same seed, different performance`);
    const b = arrange(t, { seed: 'two' });
    const notes = (p) => p.events.map((e) => `${e.part}:${e.midi}`).sort();
    assert.deepEqual(notes(b), notes(a), `${t.id}: a new seed changed the notes`);
    assert.ok(a.events.some((e, i) => e.t !== b.events[i].t), `${t.id}: a new seed changed nothing at all`);
  }
});

test('every event is playable, and every piece is a sensible length', () => {
  for (const t of PIECES) {
    const p = arrange(t, { seed: 1 });
    assert.ok(p.length >= 90 && p.length <= 180, `${t.id} runs ${p.length.toFixed(0)} s`);
    assert.ok(p.level > 0 && p.level <= 2, `${t.id}: level ${p.level}`);
    assert.ok(Number.isInteger(p.tonic) && p.tonic >= 0 && p.tonic < 12);
    let last = -Infinity;
    for (const e of p.events) {
      assert.ok(Number.isFinite(e.t) && e.t >= 0, `${t.id}: event at ${e.t}`);
      assert.ok(e.dur > 0 && Number.isFinite(e.dur), `${t.id}: duration ${e.dur}`);
      assert.ok(e.vel > 0 && e.vel <= 1, `${t.id}: velocity ${e.vel}`);
      assert.ok(e.t >= last, `${t.id}: events out of order`);
      last = e.t;
    }
    assert.equal(p.bars[0].t, 0);
    assert.ok(p.bars.every((b, i) => i === 0 || b.t > p.bars[i - 1].t));
  }
});

// ---- the strings and the room -------------------------------------------------------

/** Pitch by autocorrelation, refined with a parabola through the peak. */
function pitchOf(x, sampleRate, near) {
  const from = Math.round(0.05 * sampleRate);
  const len = Math.round(0.2 * sampleRate);
  const r = (lag) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += x[from + i] * x[from + i + lag];
    return s;
  };
  const p0 = sampleRate / near;
  let best = 0;
  let bestR = -Infinity;
  for (let lag = Math.floor(p0 * 0.9); lag <= Math.ceil(p0 * 1.1); lag++) {
    const v = r(lag);
    if (v > bestR) {
      bestR = v;
      best = lag;
    }
  }
  const [a, b, c] = [r(best - 1), r(best), r(best + 1)];
  return sampleRate / (best + (0.5 * (a - c)) / (a - 2 * b + c));
}

test('a plucked string is in tune, from the bass to the top of a harp', () => {
  // The integer delay line alone would leave the top strings tens of cents
  // flat; the allpass tuning is what this holds to.
  for (const midi of [40, 45, 52, 57, 64, 69, 74, 79, 84, 88]) {
    const hz = hzOf(midi);
    const x = renderPluck(PLUCK_RATE, hz, { t60: 2, length: 0.5 });
    const cents = 1200 * Math.log2(pitchOf(x, PLUCK_RATE, hz) / hz);
    assert.ok(Math.abs(cents) < 3, `MIDI ${midi} is ${cents.toFixed(2)} cents out`);
  }
});

test('a plucked string decays, and every kind of string renders cleanly', () => {
  const rms = (x, a, b) => Math.sqrt(x.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
  for (const kind of ['harp', 'guitar', 'viola', 'upright']) {
    for (const midi of [40, 55, 70]) {
      const x = renderString(kind, midi);
      assert.ok(x.every(Number.isFinite), `${kind} ${midi}: not finite`);
      const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      assert.ok(peak > 0.85 && peak <= 0.9 + 1e-6, `${kind} ${midi}: peak ${peak}`);
      const n = Math.round(0.1 * PLUCK_RATE);
      assert.ok(rms(x, x.length - n, x.length) < rms(x, 0, n) / 100, `${kind} ${midi} does not die away`);
    }
  }
});

test('the room decays, and its two channels are different rooms', () => {
  const [l, r] = makeImpulse(48000);
  assert.ok(l.every(Number.isFinite) && r.every(Number.isFinite));
  const energy = (x, a, b) => x.subarray(a, b).reduce((s, v) => s + v * v, 0);
  const tenth = Math.floor(l.length / 10);
  assert.ok(energy(l, l.length - tenth, l.length) < energy(l, 0, tenth) / 1000);
  let same = 0;
  for (let i = 0; i < l.length; i++) same += l[i] * r[i];
  assert.ok(Math.abs(same) < 0.1 * Math.sqrt(energy(l, 0, l.length) * energy(r, 0, r.length)), 'the channels are not decorrelated');
});

// ---- the graph ---------------------------------------------------------------------

/**
 * A BaseAudioContext that records every node and refuses what a browser
 * refuses: non-finite values, exponential ramps to or from zero, a time
 * constant that is not positive, a frequency above Nyquist, a source stopped
 * before it starts or started twice, a source started and never stopped (which
 * is a looping noise buffer playing forever), and a connection to something
 * that is not a node.
 */
function mockContext({ sampleRate = 48000 } = {}) {
  const problems = [];
  const sources = [];
  const fail = (m) => {
    if (problems.length < 20) problems.push(m);
  };
  const finite = (v, what) => Number.isFinite(v) || fail(`${what} is ${v}`);

  const param = (name, initial, { max = Infinity } = {}) => {
    let last = initial;
    const set = (v, what) => {
      finite(v, `${name} ${what}`);
      if (Math.abs(v) > max) fail(`${name} ${what} ${v} exceeds ${max}`);
      last = v;
    };
    const p = {
      isParam: true,
      get value() {
        return last;
      },
      set value(v) {
        set(v, 'value');
      },
      setValueAtTime(v, t) {
        finite(t, `${name} time`);
        set(v, 'setValueAtTime');
        return p;
      },
      linearRampToValueAtTime(v, t) {
        finite(t, `${name} time`);
        set(v, 'linearRamp');
        return p;
      },
      exponentialRampToValueAtTime(v, t) {
        finite(t, `${name} time`);
        if (v === 0 || last === 0 || Math.sign(v) !== Math.sign(last)) fail(`${name}: exponential ramp from ${last} to ${v}`);
        set(v, 'exponentialRamp');
        return p;
      },
      setTargetAtTime(v, t, tc) {
        finite(t, `${name} time`);
        if (!(tc > 0)) fail(`${name}: time constant ${tc}`);
        set(v, 'setTarget');
        return p;
      },
      cancelScheduledValues(t) {
        finite(t, `${name} cancel time`);
        return p;
      },
    };
    return p;
  };

  const node = (kind, fields = {}) => {
    const n = {
      isNode: true,
      kind,
      connect(dest) {
        if (!dest || !(dest.isNode || dest.isParam)) fail(`${kind} connected to ${dest}`);
        return dest;
      },
      disconnect() {},
      ...fields,
    };
    return n;
  };

  const source = (kind, fields) => {
    const s = node(kind, fields);
    s.startedAt = null;
    s.stoppedAt = null;
    s.start = (when = 0, offset = 0) => {
      finite(when, `${kind} start`);
      if (s.startedAt != null) fail(`${kind} started twice`);
      if (kind === 'buffer' && s.buffer && offset >= s.buffer.duration) fail(`buffer started at offset ${offset} past its end`);
      s.startedAt = when;
      sources.push(s);
    };
    s.stop = (when = 0) => {
      finite(when, `${kind} stop`);
      if (s.startedAt != null && when < s.startedAt) fail(`${kind} stopped at ${when}, before it started at ${s.startedAt}`);
      s.stoppedAt = when;
    };
    return s;
  };

  const nyquist = sampleRate / 2;
  const ctx = {
    sampleRate,
    currentTime: 0,
    destination: node('destination'),
    problems,
    sources,
    createGain: () => node('gain', { gain: param('gain', 1) }),
    createOscillator: () =>
      source('oscillator', {
        type: 'sine',
        frequency: param('oscillator.frequency', 440, { max: nyquist }),
        detune: param('detune', 0),
        setPeriodicWave(w) {
          if (!w?.isWave) fail('setPeriodicWave without a wave');
        },
      }),
    createBufferSource: () => source('buffer', { buffer: null, loop: false, playbackRate: param('playbackRate', 1) }),
    createBiquadFilter: () =>
      node('biquad', { type: 'lowpass', frequency: param('biquad.frequency', 350, { max: nyquist }), Q: param('Q', 1), gain: param('biquad.gain', 0) }),
    createStereoPanner: () => node('panner', { pan: param('pan', 0, { max: 1 }) }),
    createDynamicsCompressor: () =>
      node('compressor', ['threshold', 'knee', 'ratio', 'attack', 'release'].reduce((o, k) => ({ ...o, [k]: param(k, 0) }), {})),
    createConvolver() {
      const c = node('convolver', { normalize: true });
      let buffer = null;
      Object.defineProperty(c, 'buffer', {
        get: () => buffer,
        set(b) {
          if (b.sampleRate !== sampleRate) fail(`convolver buffer at ${b.sampleRate} Hz in a ${sampleRate} Hz context`);
          buffer = b;
        },
      });
      return c;
    },
    createBuffer(channels, length, rate) {
      if (!(channels >= 1 && length >= 1 && rate >= 3000 && rate <= 768000)) fail(`createBuffer(${channels}, ${length}, ${rate})`);
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: (c) => data[c] };
    },
    createPeriodicWave(real, imag) {
      if (real.length !== imag.length || real.length < 2) fail('periodic wave tables disagree');
      return { isWave: true };
    },
  };
  return ctx;
}

test('every note of every piece builds into a graph a browser would accept', () => {
  const ctx = mockContext();
  const band = makeBand(ctx, ctx.destination);
  for (const t of PIECES) {
    for (const ev of arrange(t, { seed: 3 }).events) band.play(ev, 1 + ev.t);
  }
  assert.deepEqual(ctx.problems, []);
  const unstopped = ctx.sources.filter((s) => s.stoppedAt == null);
  assert.deepEqual(
    unstopped.map((s) => s.kind),
    [],
    'sources started and never stopped play for ever — a looping noise buffer especially',
  );
  assert.ok(ctx.sources.length > 2000, `only ${ctx.sources.length} sources for four pieces`);
});

test('the band renders at any sample rate a context might have', () => {
  for (const rate of [22050, 44100, 48000, 96000]) {
    const ctx = mockContext({ sampleRate: rate });
    const band = makeBand(ctx, ctx.destination);
    for (const ev of arrange(TRACKS.vale, { seed: 1 }).events.slice(0, 200)) band.play(ev, ev.t);
    assert.deepEqual(ctx.problems, [], `at ${rate} Hz`);
  }
});

test('the strings a piece needs can be rendered ahead of time, a few per call', () => {
  const ctx = mockContext();
  const band = makeBand(ctx, ctx.destination);
  const events = arrange(TRACKS.toada, { seed: 1 }).events;
  let calls = 0;
  while (!band.warm(events, 0.5)) calls++;
  assert.ok(band.cachedStrings > 10, `${band.cachedStrings} strings cached`);
  assert.ok(calls > 0, 'everything rendered in one tight call — the budget is not being honoured');
  const before = ctx.sources.length;
  band.play(events.find((e) => e.inst === 'viola'), 0);
  assert.equal(ctx.sources.length, before + 1);
});

// ---- pacing ------------------------------------------------------------------------

test('the shuffle bag plays every field piece before repeating one, and never one twice running', () => {
  const bag = makeBag(FIELD, mulberry32(11));
  const drawn = Array.from({ length: 300 }, () => bag.next());
  for (let i = 0; i < drawn.length; i += FIELD.length) {
    assert.deepEqual([...drawn.slice(i, i + FIELD.length)].sort(), [...FIELD].sort(), `round ${i / FIELD.length + 1}`);
  }
  for (let i = 1; i < drawn.length; i++) assert.notEqual(drawn[i], drawn[i - 1], `the same piece twice at draw ${i}`);
});

/** Run a director on a mock clock, in 100 ms ticks, recording what it does. */
function runDirector({ audible = () => true } = {}) {
  const ctx = mockContext({ sampleRate: 22050 });
  const keys = [];
  const director = makeDirector({ ctx, out: ctx.destination, audible: () => audible(), onKey: (k) => keys.push(k), random: mulberry32(5), autoTick: false });
  const log = [];
  const advance = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 10); i++) {
      ctx.currentTime = +(ctx.currentTime + 0.1).toFixed(3);
      director.tick();
      const np = director.nowPlaying;
      const prev = log.at(-1);
      if (!prev || prev.state !== np.state || prev.id !== np.id) log.push({ t: ctx.currentTime, ...np });
    }
  };
  return { ctx, director, keys, log, advance };
}

test('the title theme loops, with a breath between plays, in its own key', () => {
  const run = runDirector();
  run.director.setScene('title');
  run.advance(1);
  assert.equal(run.director.nowPlaying.id, TITLE);
  assert.equal(run.keys[0], parseKey(TRACKS[TITLE].key).tonic);
  run.advance(arrange(TRACKS[TITLE]).length + BREATH + 2);
  const plays = run.log.filter((e) => e.state === 'playing');
  assert.equal(plays.length, 2, JSON.stringify(run.log));
  assert.ok(plays.every((e) => e.id === TITLE));
  const gap = plays[1].t - run.log.find((e) => e.state === 'resting' && e.t > plays[0].t).t;
  assert.ok(Math.abs(gap - BREATH) < 0.5, `breath of ${gap} s`);
  assert.deepEqual(run.ctx.problems, []);
});

test('in the field: a piece, then quiet, then a different piece', () => {
  const run = runDirector();
  run.director.setScene('title');
  run.advance(5);
  run.director.setScene('field');
  run.advance(FADE + GAP + 1);
  const first = run.director.nowPlaying;
  assert.equal(first.state, 'playing');
  assert.ok(FIELD.includes(first.id), `${first.id} is not a field piece`);

  run.advance(arrange(TRACKS[first.id]).length + QUIET[1] + 2);
  const plays = run.log.filter((e) => e.state === 'playing' && FIELD.includes(e.id));
  assert.ok(plays.length >= 2, JSON.stringify(run.log));
  assert.notEqual(plays[1].id, plays[0].id);
  const restStart = run.log.find((e) => e.state === 'resting' && e.t > plays[0].t).t;
  const quiet = plays[1].t - restStart;
  assert.ok(quiet >= QUIET[0] - 0.2 && quiet <= QUIET[1] + 0.2, `${quiet.toFixed(1)} s of quiet`);
});

test('a new job fades the field piece and brings in the next one', () => {
  const run = runDirector();
  run.director.setScene('field');
  run.advance(GAP + 1);
  const was = run.director.nowPlaying.id;
  run.advance(10);
  run.director.nextTrack();
  assert.equal(run.director.nowPlaying.state, 'resting');
  run.advance(FADE + GAP + 0.5);
  const now = run.director.nowPlaying;
  assert.equal(now.state, 'playing');
  assert.notEqual(now.id, was);

  // And on the title screen it does nothing: a job cannot start there.
  const title = runDirector();
  title.director.setScene('title');
  title.advance(2);
  title.director.nextTrack();
  title.advance(1);
  assert.equal(title.director.nowPlaying.id, TITLE);
});

test('nothing is scheduled while the music is off, and it comes back with a fresh piece', () => {
  let on = true;
  const run = runDirector({ audible: () => on });
  run.director.setScene('field');
  run.advance(GAP + 5);
  assert.equal(run.director.nowPlaying.state, 'playing');

  on = false;
  run.advance(0.2);
  const count = run.ctx.sources.length;
  run.advance(30);
  assert.equal(run.director.nowPlaying.state, 'paused');
  assert.equal(run.ctx.sources.length, count, 'notes were scheduled into a muted bus');

  on = true;
  run.advance(GAP - 0.5);
  assert.notEqual(run.director.nowPlaying.state, 'playing', 'picked up the middle of a phrase instead of pausing first');
  run.advance(1.5);
  assert.equal(run.director.nowPlaying.state, 'playing');
  assert.equal(run.director.nowPlaying.bar, 1);
});
