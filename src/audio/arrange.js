// From a score to a performance.
//
// `tracks.js` writes a piece the way a lead sheet does: chord symbols, the
// melodies note by note, and for everything else only the NAME of what to play
// — "fingerpick these chords", "hold them on the strings", "walk the bass into
// the next one". This module turns those names into notes, voice-leads every
// chord from the one before it, and then plays the result the way a person
// would: a few milliseconds early or late, a little heavier on the downbeat, a
// strum rather than a block.
//
// Two stages, kept apart on purpose:
//
//   score(track)            ticks, bars, sections — exact, and what `lint`
//                           checks; no randomness anywhere in it.
//   arrange(track, {seed})  seconds, humanized through a seeded stream from
//                           `core/rng.js`, so one (piece, seed) pair is one
//                           performance, reproducible to the sample, and the
//                           game can hand every play a fresh seed so a piece
//                           is never note-for-note the same twice.
//
// DOM-free, and it knows nothing about what plays the notes.

import { TPQ, parseMeter, parseKey, parseLine, parseChord, voiceChord, bassNote, consonantWith, midiOf, pcOf } from './theory.js';
import { makeRng } from '../core/rng.js';

/** Seconds of silence kept after the last note, for the reverb to finish in. */
export const TAIL = 3;

const STEP = { q: TPQ, e: TPQ / 2, s: TPQ / 4 };

/**
 * The accompaniment vocabulary.
 *
 * Chordal patterns are one token per step: `b` the chord's bass in the part's
 * own low register, `f` the fifth above it, `0`–`3` the voicing from the bottom
 * (an index past the top wraps an octave up), `+` to play several at once, `-`
 * to hold, `.` to rest. Bass patterns use `R` (root, or the slash bass), `F`
 * (fifth), `A` (an approach note into the next chord's bass). Percussion is
 * `x`, `X` for an accent, and `.`.
 *
 * A pattern given as a list alternates when the chord does not change — the
 * second bar of a held chord gets the second line, which is how a waltz bass
 * goes root, fifth, root, fifth without a new chord announcing every bar.
 */
export const PATTERNS = {
  // Fingerpicking: the thumb alternates bass and fifth on every beat while the
  // fingers fill the off-beats from the chord above.
  travis: { meter: '4/4', step: 'e', steps: 'b+2 1 f 0 b 2 f 1' },
  // A harp's broken chord, up through the voicing and back down.
  arp8: { meter: '4/4', step: 'e', steps: 'b 0 1 2 3 2 1 0' },
  // The rocking arpeggio of a toada: two pulses of three.
  toada: { meter: '6/8', step: 'e', steps: 'b 0 1 2 1 0' },
  // The viola's own figure, with the bass answered by the fifth on the second pulse.
  ponteio: { meter: '6/8', step: 'e', steps: 'b+2 0 1 f+2 0 1' },
  // Beat one is the bass's; the keys play the "pah pah".
  waltz: { meter: '3/4', step: 'q', steps: '. 0+1+2 0+1+2' },
  // Soft chords on beats one and three, under a melody that needs the room.
  pulse: { meter: '4/4', step: 'q', steps: '0+1+2+3 - 0+1+2+3 -' },
  // Struck once and left to ring.
  strum4: { meter: '4/4', step: 'q', steps: 'b+0+1+2+3 - - -' },
  strum3: { meter: '3/4', step: 'q', steps: 'b+0+1+2 - -' },
  strum68: { meter: '6/8', step: 'e', steps: 'b+0+1+2 - - - - -' },

  hold: { kind: 'hold' },
  pedal: { kind: 'pedal' },
  root5: { kind: 'bass', meter: '4/4', step: 'e', steps: 'R - - - F - - A' },
  half: { kind: 'bass', meter: '4/4', step: 'q', steps: ['R - F -', 'R - F -'] },
  bass68: { kind: 'bass', meter: '6/8', step: 'e', steps: 'R - - F - -' },
  waltzBass: { kind: 'bass', meter: '3/4', step: 'q', steps: ['R . .', 'F . .'] },

  offbeat: { kind: 'perc', meter: '4/4', step: 'e', steps: '. x . x . x . x' },
  caxixi: { kind: 'perc', meter: '6/8', step: 'e', steps: 'X . x x . x' },
  tick68: { kind: 'perc', meter: '6/8', step: 'e', steps: 'x . . x . .' },
};

/** Velocity by position in the bar, as fractions of a bar. Downbeats lean. */
const METRIC = {
  '4/4': (pos) => (pos === 0 ? 1 : pos === 0.5 ? 0.93 : pos % 0.25 === 0 ? 0.86 : 0.8),
  '3/4': (pos) => (pos === 0 ? 1 : Math.abs((pos * 3) % 1) < 1e-9 ? 0.84 : 0.8),
  '6/8': (pos) => (pos === 0 ? 1 : pos === 0.5 ? 0.92 : 0.8),
};

// ---- the score --------------------------------------------------------------

/** A section with everything it inherits filled in. */
function resolveSection(track, name, seen = []) {
  const sec = track.sections[name];
  if (!sec) throw new Error(`${track.id}: no section "${name}"`);
  if (!sec.extends) return sec;
  if (seen.includes(name)) throw new Error(`${track.id}: section "${name}" extends itself`);
  const base = resolveSection(track, sec.extends, [...seen, name]);
  return {
    ...base,
    ...sec,
    lines: { ...base.lines, ...sec.lines },
    patterns: { ...base.patterns, ...sec.patterns },
  };
}

/** `'D | A/C# | Em7 A7'` → chord spans in ticks; a bar of several chords splits evenly. */
function parseChords(text, barTicks) {
  const bars = text.split('|').map((b) => b.trim());
  if (bars.length && bars[bars.length - 1] === '') bars.pop();
  const spans = [];
  bars.forEach((bar, i) => {
    const symbols = bar.split(/\s+/).filter(Boolean);
    if (!symbols.length) throw new Error(`bar ${i + 1} has no chord`);
    const each = barTicks / symbols.length;
    if (!Number.isInteger(each)) throw new Error(`bar ${i + 1}: ${symbols.length} chords do not split a bar evenly`);
    symbols.forEach((s, k) => spans.push({ tick: i * barTicks + k * each, dur: each, chord: parseChord(s) }));
  });
  return { spans, bars: bars.length };
}

const noteName = (midi) => {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  return `${names[pcOf(midi)]}${Math.floor(midi / 12) - 1}`;
};

/**
 * The piece in ticks: every section of the form laid end to end, every chord
 * span, every written line, and every pattern realized into notes.
 *
 * Throws on anything structurally wrong — an unreadable token, a bar of the
 * wrong length, a line with a different number of bars from its chords — and
 * says which piece, section and part, because "bar 5 is 3.5 beats long" is no
 * help without knowing which of forty melodies it means.
 */
export function score(track) {
  const meter = parseMeter(track.meter);
  const key = parseKey(track.key);
  const { barTicks } = meter;

  // Pass one: lay out the form.
  const sections = [];
  const spans = [];
  let tick = 0;
  let bar = 0;
  for (const name of track.form) {
    const sec = resolveSection(track, name);
    let parsed;
    try {
      parsed = parseChords(sec.chords, barTicks);
    } catch (err) {
      throw new Error(`${track.id} ${name} chords: ${err.message}`);
    }
    const entry = { name, sec, tick, bar, bars: parsed.bars, spanFrom: spans.length };
    for (const s of parsed.spans) spans.push({ ...s, tick: tick + s.tick, section: sections.length });
    sections.push(entry);
    tick += parsed.bars * barTicks;
    bar += parsed.bars;
  }
  const totalTicks = tick;

  // Pass two: voice every chord for every part that needs one, in order, so
  // the voice leading runs continuously through the whole piece — including
  // across sections where the part happens to be silent.
  const voicings = {};
  const basses = {};
  for (const [part, def] of Object.entries(track.parts)) {
    const pattern = def.pattern ? PATTERNS[def.pattern] : null;
    if (def.pattern && !pattern) throw new Error(`${track.id} ${part}: no pattern "${def.pattern}"`);
    const chordal = pattern && !['bass', 'pedal', 'perc'].includes(pattern.kind);
    if (def.range && chordal) {
      const lo = midiOf(def.range[0]);
      const hi = midiOf(def.range[1]);
      let prev = null;
      voicings[part] = spans.map((s) => (prev = voiceChord(s.chord, prev, { lo, hi, voices: def.voices ?? 3 })));
    }
    const bassRange = def.bassRange ?? (pattern?.kind === 'bass' || pattern?.kind === 'pedal' ? def.range : null);
    if (bassRange) {
      const lo = midiOf(bassRange[0]);
      const hi = midiOf(bassRange[1]);
      let prev = null;
      basses[part] = spans.map((s) => (prev = bassNote(s.chord, prev, { lo, hi })));
    }
  }

  const spanAt = (t) => {
    // Spans are sorted and contiguous; a binary search keeps this cheap.
    let lo = 0;
    let hi = spans.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (spans[mid].tick <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const notes = [];
  const add = (n) => notes.push(n);
  const held = new Map();
  const weight = METRIC[track.meter];

  // Pass three: realize every section.
  for (const [si, s] of sections.entries()) {
    const { sec, name } = s;
    const active = new Set(sec.parts ?? []);
    const dyn = sec.dyn ?? 1;

    // Written lines.
    for (const [part, text] of Object.entries(sec.lines ?? {})) {
      if (text == null) continue;
      const def = track.parts[part];
      if (!def) throw new Error(`${track.id} ${name}: a line for "${part}", which is not a part`);
      let parsed;
      try {
        parsed = parseLine(text, barTicks);
      } catch (err) {
        throw new Error(`${track.id} ${name} ${part}: ${err.message}`);
      }
      if (parsed.bars !== s.bars) {
        throw new Error(`${track.id} ${name} ${part}: ${parsed.bars} bars of melody over ${s.bars} bars of chords`);
      }
      for (const n of parsed.notes) {
        if (n.midi == null) continue;
        // A melody leans on the downbeat too, but only a little: its phrasing
        // is already in the rhythm it was written with.
        const lean = 0.9 + 0.1 * weight((n.tick % barTicks) / barTicks);
        add({ part, inst: def.inst, tick: s.tick + n.tick, dur: n.dur, midi: n.midi + 12 * (def.octave ?? 0), vel: (def.vel ?? 0.8) * dyn * lean, line: true, section: si });
      }
    }

    // Harmony generated from another part's line in this section.
    for (const [part, def] of Object.entries(track.parts)) {
      if (!def.harmonize || !active.has(part)) continue;
      const source = notes.filter((n) => n.section === si && n.part === def.harmonize.from);
      for (const n of source) {
        const chord = spans[spanAt(n.tick)].chord;
        const strong = meter.strong.includes((n.tick - s.tick) % barTicks) || n.dur >= meter.beat * 2;
        const h = harmonyNote(n.midi, chord, key, strong);
        if (h == null) continue;
        add({ part, inst: def.inst, tick: n.tick, dur: n.dur, midi: h + 12 * (def.harmonize.octave ?? 0), vel: (def.vel ?? 0.7) * dyn, line: true, section: si });
      }
    }

    // Patterns.
    for (const part of active) {
      const def = track.parts[part];
      if (!def) throw new Error(`${track.id} ${name}: "${part}" is not a part`);
      if (def.harmonize) continue;
      const patName = sec.patterns?.[part] ?? def.pattern;
      const pattern = PATTERNS[patName];
      if (!pattern) throw new Error(`${track.id} ${name} ${part}: no pattern "${patName}"`);
      const vel = (def.vel ?? 0.7) * dyn;
      const ctx = { track, part, def, pattern, vel, s, si, spans, spanAt, voicings, basses, key, meter, add, totalTicks, held };
      if (pattern.kind === 'hold' || pattern.kind === 'pedal') realizeHeld(ctx);
      else realizeSteps(ctx, patName);
    }
  }

  // A string struck again stops ringing: the earlier note ends where the new
  // one begins. Without this, a ringing arpeggio piles one pluck on another of
  // the same pitch and the sum is louder than anything the player did.
  const byVoice = new Map();
  notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
  for (const n of notes) {
    const k = `${n.part}:${n.midi}`;
    const prev = byVoice.get(k);
    if (prev && prev.tick + prev.dur > n.tick) prev.dur = Math.max(1, n.tick - prev.tick);
    byVoice.set(k, n);
  }

  return { track, meter, key, barTicks, totalTicks, sections, spans, spanAt, notes };
}

/**
 * One sustained chord or bass note per chord.
 *
 * A note the next chord also contains is HELD rather than struck again, which
 * is what a string section does with a common tone — re-attacking it would
 * dip the one note that should carry straight through the change, and a pad
 * with a second-long attack makes that dip very audible. `held` carries the
 * sounding notes across section boundaries for the same reason.
 */
function realizeHeld({ part, def, pattern, vel, s, si, spans, voicings, basses, add, totalTicks, held }) {
  const from = s.spanFrom;
  const to = spans.findIndex((x, i) => i >= from && x.section !== si);
  const last = to < 0 ? spans.length : to;
  let carry = held.get(part);
  if (!carry || carry.end !== spans[from].tick) carry = { end: -1, notes: new Map() };

  for (let i = from; i < last; i++) {
    let j = i;
    while (j + 1 < last && spans[j + 1].chord.symbol === spans[i].chord.symbol) j++;
    const tick = spans[i].tick;
    const end = j + 1 < spans.length ? spans[j + 1].tick : totalTicks;
    const pitches = pattern.kind === 'pedal' ? [basses[part][i]] : voicings[part][i];
    const notes = new Map();
    for (const midi of pitches) {
      const going = carry.end === tick ? carry.notes.get(midi) : null;
      if (going) {
        going.dur = end - going.tick;
        notes.set(midi, going);
      } else {
        const n = { part, inst: def.inst, tick, dur: end - tick, midi, vel, section: si };
        add(n);
        notes.set(midi, n);
      }
    }
    carry = { end, notes };
    i = j;
  }
  held.set(part, carry);
}

/** A step pattern, bar by bar, against whatever chord is sounding at each step. */
function realizeSteps(ctx, patName) {
  const { track, part, def, pattern, vel, s, si, spans, spanAt, voicings, basses, key, meter, add } = ctx;
  if (pattern.meter !== track.meter) throw new Error(`${track.id} ${part}: "${patName}" is for ${pattern.meter}, not ${track.meter}`);
  const stepTicks = STEP[pattern.step];
  const lines = (Array.isArray(pattern.steps) ? pattern.steps : [pattern.steps]).map((l) => l.split(/\s+/));
  for (const l of lines) {
    if (l.length * stepTicks !== meter.barTicks) throw new Error(`pattern "${patName}" is not one bar long`);
  }
  const weight = METRIC[track.meter];

  let sounding = []; // notes from the last struck step, so `-` can extend them
  let prevSpanSymbol = null;
  let variant = 0;
  const ringEnd = (spanIndex, tick) => {
    // A plucked note rings until the chord changes, and no longer than a bar.
    const next = spans[spanIndex + 1];
    const changes = next ? next.tick : ctx.totalTicks;
    return Math.min(changes, tick + meter.barTicks);
  };

  for (let b = 0; b < s.bars; b++) {
    const barTick = s.tick + b * meter.barTicks;
    const barSpan = spanAt(barTick);
    const symbol = spans[barSpan].chord.symbol;
    variant = symbol === prevSpanSymbol ? (variant + 1) % lines.length : 0;
    prevSpanSymbol = symbol;
    const steps = lines[variant];

    steps.forEach((tok, k) => {
      const tick = barTick + k * stepTicks;
      if (tok === '-') {
        for (const n of sounding) n.dur = Math.max(n.dur, tick + stepTicks - n.tick);
        return;
      }
      if (!def.ring) for (const n of sounding) n.dur = Math.min(n.dur, tick - n.tick);
      sounding = [];
      if (tok === '.') return;

      const si2 = spanAt(tick);
      const chord = spans[si2].chord;
      const pos = (k * stepTicks) / meter.barTicks;
      const v = vel * weight(pos);
      const end = def.ring ? ringEnd(si2, tick) : tick + stepTicks;
      const strike = (midi, accent = 1, extra = {}) => {
        const n = { part, inst: def.inst, tick, dur: end - tick, midi, vel: v * accent, section: si, ...extra };
        add(n);
        sounding.push(n);
      };

      if (pattern.kind === 'perc') {
        strike(60, tok === 'X' ? 1 : 0.7);
        return;
      }
      if (pattern.kind === 'bass') {
        const midi = bassStep(tok, { chord, part, si2, spans, basses, key, def });
        if (midi != null) strike(midi);
        return;
      }
      const voicing = voicings[part][si2];
      const parts = tok.split('+');
      parts.forEach((ref, order) => {
        let midi;
        if (ref === 'b') midi = basses[part][si2];
        else if (ref === 'f') midi = fifthAbove(chord, basses[part][si2]);
        else {
          const idx = Number(ref);
          if (!Number.isInteger(idx)) throw new Error(`pattern "${patName}": cannot read "${ref}"`);
          midi = voicing[idx % voicing.length] + 12 * Math.floor(idx / voicing.length);
        }
        strike(midi, 1, parts.length > 1 ? { strum: order } : {});
      });
    });
  }
}

/** The chord's fifth, placed in the octave just above `bass`. */
function fifthAbove(chord, bass) {
  const fifth = chord.intervals.includes(7) ? 7 : chord.intervals.includes(6) ? 6 : 8;
  let n = bass + 1;
  while (pcOf(n) !== pcOf(chord.root + fifth)) n++;
  return n;
}

function bassStep(tok, { chord, part, si2, spans, basses, key, def }) {
  const here = basses[part][si2];
  const lo = midiOf(def.range[0]);
  const hi = midiOf(def.range[1]);
  if (tok === 'R') return here;
  const fifth = () => {
    const pc = pcOf(chord.root + (chord.intervals.includes(7) ? 7 : 6));
    let best = null;
    for (let n = lo; n <= hi; n++) if (pcOf(n) === pc && (best == null || Math.abs(n - here) < Math.abs(best - here))) best = n;
    return best ?? here;
  };
  if (tok === 'F') return fifth();
  if (tok === 'A') {
    const next = basses[part][si2 + 1];
    if (next == null) return here;
    if (next === here) return fifth();
    // A step into the coming bass note: the scale tone beside it on the side
    // we arrive from, then the other side, then a chromatic neighbour — and
    // never the note already sounding, which would be a repeat, not a walk.
    const usable = (n) => n !== here && n >= lo && n <= hi;
    const diatonic = (dir) => {
      let n = next + dir;
      while (!key.scale.includes(pcOf(n))) n += dir;
      return n;
    };
    const from = next > here ? -1 : 1;
    for (const n of [diatonic(from), diatonic(-from), next + from, next - from]) if (usable(n)) return n;
    return fifth();
  }
  throw new Error(`bass pattern: cannot read "${tok}"`);
}

/**
 * A second voice a third below a melody note — the parallel thirds of a dupla
 * caipira, two voices singing one tune.
 *
 * Off the strong beats it is simply the diatonic third, so the two voices move
 * together the way singers do. On a strong beat, or under a long note, it must
 * also sit with the chord — the adjustment a real second voice makes where the
 * plain third would grate. In order of preference:
 *
 *   1. a third below that is a (consonant) tone of the chord, in the key or not — a
 *      borrowed chord's own colour (the F of a Dm6 in A major) is exactly what
 *      a second voice should land on;
 *   2. a third below that is a consonant tension, as long as it is in the key —
 *      a D♯ over E in A major is "allowed" over the chord and still sounds
 *      like somebody singing in the wrong key;
 *   3. a chord tone a fourth to a sixth below, then an in-key tension there;
 *   4. anything consonant at all, before giving up and leaving a rest.
 */
export function harmonyNote(midi, chord, key, strong) {
  const thirds = [midi - 3, midi - 4];
  const wider = [midi - 5, midi - 7, midi - 8, midi - 9];
  const inKey = (n) => key.scale.includes(pcOf(n));
  const grates = (n) => chord.pcs.includes(pcOf(n - 1));
  if (!strong) {
    for (const n of thirds) if (inKey(n) && !grates(n)) return n;
  }
  const ok = consonantWith(chord);
  const fits = (n) => ok.has(pcOf(n));
  // A chord tone is only a landing place if it is also consonant: the root of
  // a maj7 is a tone of the chord and still grates against its seventh.
  const tone = (n) => chord.pcs.includes(pcOf(n)) && fits(n);
  const tiers = [
    [thirds, tone],
    [thirds, (n) => fits(n) && inKey(n)],
    [wider, tone],
    [wider, (n) => fits(n) && inKey(n)],
    [[...thirds, ...wider], fits],
  ];
  for (const [candidates, accept] of tiers) {
    for (const n of candidates) if (accept(n)) return n;
  }
  return null;
}

// ---- checking the score -------------------------------------------------------

/**
 * Everything musically wrong with a piece, as readable sentences. Empty is the
 * goal, and `tests/music.test.mjs` holds every piece to it.
 *
 * The check is the one a teacher makes first: on every strong beat, whatever
 * each melody is holding must belong over the chord underneath it — a chord
 * tone, or a tension that does not sit a semitone above anything the chord
 * contains. Passing notes between the beats are free, as they should be.
 */
export function lint(track) {
  let sc;
  try {
    sc = score(track);
  } catch (err) {
    return [err.message];
  }
  const problems = [];
  const { meter, spans, spanAt, notes, sections, barTicks } = sc;
  const lines = notes.filter((n) => n.line);
  for (const s of sections) {
    for (let b = 0; b < s.bars; b++) {
      for (const beat of meter.strong) {
        const t = s.tick + b * barTicks + beat;
        const chord = spans[spanAt(t)].chord;
        const ok = consonantWith(chord);
        for (const n of lines) {
          if (n.tick > t || n.tick + n.dur <= t) continue;
          if (!ok.has(pcOf(n.midi))) {
            problems.push(`${track.id} ${s.name} bar ${b + 1} beat ${beat / TPQ + 1}: ${n.part} holds ${noteName(n.midi)} over ${chord.symbol}`);
          }
        }
      }
    }
  }
  return problems;
}

// ---- the performance ------------------------------------------------------------

/**
 * The piece in seconds, played by somebody.
 *
 * @param {object} track  from `tracks.js`
 * @param {{seed?:string|number}} [opts]
 * @returns {{ id:string, title:string, tonic:number, length:number,
 *             events:Array<{t:number, dur:number, midi:number, vel:number, inst:string, part:string}>,
 *             bars:Array<{t:number, section:string}> }}
 */
export function arrange(track, { seed = 0 } = {}) {
  const sc = score(track);
  const { meter, sections, barTicks, totalTicks } = sc;
  const rng = makeRng(String(seed), `music:${track.id}`);

  // Tempo, bar by bar: a section with `rit` slows towards that fraction of the
  // tempo by its last bar. Swing, if any, bends the second eighth of each beat.
  const barStart = [];
  const barSpt = [];
  let at = 0;
  for (const s of sections) {
    const rit = s.sec.rit ?? 1;
    for (let b = 0; b < s.bars; b++) {
      const k = s.bars > 1 ? (b + 1) / s.bars : 1;
      const tempo = track.bpm * (1 - (1 - rit) * k);
      barStart.push(at);
      barSpt.push(60 / tempo / TPQ);
      at += barTicks * barSpt[barSpt.length - 1];
    }
  }
  const swing = track.swing ?? 0.5;
  const toSec = (tick) => {
    const b = Math.min(barStart.length - 1, Math.floor(tick / barTicks));
    let within = tick - b * barTicks;
    if (swing !== 0.5) {
      const beat = Math.floor(within / TPQ);
      const frac = (within - beat * TPQ) / TPQ;
      const bent = frac < 0.5 ? frac * 2 * swing : swing + (frac - 0.5) * 2 * (1 - swing);
      within = (beat + bent) * TPQ;
    }
    return barStart[b] + within * barSpt[b];
  };

  const jitter = (sd) => Math.max(-2 * sd, Math.min(2 * sd, rng.normal(0, sd)));
  const events = [];
  for (const n of sc.notes) {
    const def = track.parts[n.part];
    const sd = n.line ? 0.005 : def.pattern === 'hold' ? 0.002 : 0.004;
    // A chord on a plucked string is a strum, low to high, never a block.
    const strum = n.strum ? n.strum * (def.strum ?? 0.011) : 0;
    const t = Math.max(0, toSec(n.tick) + jitter(sd) + strum);
    const end = toSec(Math.min(totalTicks, n.tick + n.dur));
    const vel = Math.max(0.05, Math.min(1, n.vel * (1 + rng.normal(0, 0.05))));
    events.push({ t, dur: Math.max(0.03, end - t), midi: n.midi, vel, inst: n.inst, part: n.part });
  }
  events.sort((a, b) => a.t - b.t);

  const last = events.reduce((m, e) => Math.max(m, e.t + e.dur), 0);
  return {
    id: track.id,
    title: track.title,
    tonic: sc.key.tonic,
    length: last + TAIL,
    level: track.level ?? 1,
    events,
    bars: sections.flatMap((s) => Array.from({ length: s.bars }, (_, b) => ({ t: barStart[s.bar + b], section: s.name }))),
  };
}
