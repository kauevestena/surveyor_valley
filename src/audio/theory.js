// The music theory the soundtrack is written in, and no more of it.
//
// The score in `tracks.js` is text: a melody is a line of tokens, a harmony is
// a line of chord symbols. This module turns that text into numbers — MIDI
// pitches, durations in ticks, pitch-class sets — and answers the one question
// the score is checked against: which notes may sit on a strong beat over a
// given chord without clashing with it.
//
// That question matters more than it would for a composer who can hear. The
// pieces were written blind, as data, so `tests/music.test.mjs` is the ear: it
// runs every strong beat of every line through `consonantWith()` and names the
// bar that fails. DOM-free for exactly that reason.

/** Ticks per quarter note. Divisible by 2, 3, 4, 8, 12 and 16, so a dotted
 *  sixteenth and an eighth-note triplet are both whole numbers of ticks. */
export const TPQ = 48;

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class, always in 0..11 — `%` alone keeps the sign of a negative. */
export const pcOf = (n) => ((n % 12) + 12) % 12;

/**
 * Scientific pitch to MIDI: `'A4'` is 69, `'C4'` (middle C) is 60.
 *
 * Accidentals are taken literally, so `'Cb4'` is 59 and `'E#4'` is 65 — the
 * score spells a note the way the harmony wants it read, and the number has to
 * agree with the spelling rather than with the nearest white key.
 */
export function midiOf(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`not a pitch: "${name}"`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + LETTER[m[1]] + acc;
}

/** Equal temperament at A4 = 440 Hz. */
export const hzOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function pcOfName(name) {
  const m = /^([A-G])(#|b)?$/.exec(name);
  if (!m) throw new Error(`not a note name: "${name}"`);
  return pcOf(LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
}

// ---- keys ------------------------------------------------------------------

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** `'D'` or `'F#m'` → its tonic and the pitch classes of its scale. */
export function parseKey(name) {
  const m = /^([A-G][#b]?)(m?)$/.exec(name);
  if (!m) throw new Error(`not a key: "${name}"`);
  const tonic = pcOfName(m[1]);
  const steps = m[2] ? MINOR : MAJOR;
  return { name, tonic, minor: Boolean(m[2]), scale: steps.map((s) => pcOf(tonic + s)) };
}

// ---- durations and melody lines ---------------------------------------------

const DUR = { w: 4 * TPQ, h: 2 * TPQ, q: TPQ, e: TPQ / 2, s: TPQ / 4 };

/** `'4/4'`, `'3/4'` or `'6/8'` → bar length, and where its strong beats fall. */
export function parseMeter(meter) {
  switch (meter) {
    case '4/4':
      return { meter, barTicks: 4 * TPQ, strong: [0, 2 * TPQ], beat: TPQ };
    case '3/4':
      return { meter, barTicks: 3 * TPQ, strong: [0], beat: TPQ };
    case '6/8':
      // Two dotted-quarter pulses, felt as two beats of three eighths.
      return { meter, barTicks: 3 * TPQ, strong: [0, 1.5 * TPQ], beat: 1.5 * TPQ };
    default:
      throw new Error(`unsupported meter: "${meter}"`);
  }
}

/**
 * One token: a pitch or `r`, a duration letter, then optionally `.` (dotted)
 * or `t` (triplet), then optionally `~` (tied into the next note).
 *
 *   `F#5q.`  dotted quarter      `Bb4e~`  eighth, tied over
 *   `rh`     half-note rest      `A5et`   eighth-note triplet
 */
const TOKEN = /^(r|[A-G][#b]?\d)([whqes])([.t]?)(~?)$/;

/**
 * Parse a melody line into notes.
 *
 * Bars are separated by `|`, and every bar must add up to exactly one bar —
 * that is checked here rather than trusted, because a line that runs an eighth
 * long drifts against the harmony for the rest of the piece and sounds like a
 * wrong note in a different place every time.
 *
 * @returns {{ notes: Array<{tick:number, dur:number, midi:number|null}>, bars:number }}
 *          `tick` is from the start of the line; rests are kept as `midi: null`.
 */
export function parseLine(text, barTicks) {
  const bars = text.split('|').map((b) => b.trim());
  if (bars.length && bars[bars.length - 1] === '') bars.pop();

  const raw = [];
  bars.forEach((bar, i) => {
    let at = 0;
    for (const tok of bar.split(/\s+/).filter(Boolean)) {
      const m = TOKEN.exec(tok);
      if (!m) throw new Error(`bar ${i + 1}: cannot read "${tok}"`);
      let dur = DUR[m[2]];
      if (m[3] === '.') dur *= 1.5;
      if (m[3] === 't') dur = (dur * 2) / 3;
      const midi = m[1] === 'r' ? null : midiOf(m[1]);
      if (m[4] && midi == null) throw new Error(`bar ${i + 1}: a rest cannot be tied ("${tok}")`);
      raw.push({ tick: i * barTicks + at, dur, midi, tie: Boolean(m[4]), bar: i + 1 });
      at += dur;
    }
    if (at !== barTicks) {
      throw new Error(`bar ${i + 1} is ${at / TPQ} beats long, not ${barTicks / TPQ}: "${bar}"`);
    }
  });

  // Fold ties into one long note. A tie between two different pitches is a
  // typo, not a slur, and is reported as one.
  const notes = [];
  for (let i = 0; i < raw.length; i++) {
    const n = { tick: raw[i].tick, dur: raw[i].dur, midi: raw[i].midi };
    while (raw[i].tie) {
      const next = raw[i + 1];
      if (!next) throw new Error(`bar ${raw[i].bar}: the line ends on a tie`);
      if (next.midi !== n.midi) throw new Error(`bar ${raw[i].bar}: tie between two different pitches`);
      n.dur += next.dur;
      i++;
    }
    notes.push(n);
  }
  return { notes, bars: bars.length };
}

// ---- chords --------------------------------------------------------------------

/** Intervals above the root. Ninths are written as 14 so a voicing knows to put them high. */
const QUALITIES = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  9: [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
};

/**
 * Colour notes each kind of chord takes on a strong beat, above the root. The
 * conventional ones and nothing exotic: ninths and sixths over major, the
 * dorian sixth and the eleventh over minor, and so on.
 */
const TENSIONS = {
  major: [2, 9, 11],
  dominant: [2, 9],
  minor: [2, 5, 9, 10],
  sus4: [2, 9, 10],
  sus2: [4, 5, 9, 11],
  halfdim: [2, 5, 8],
  dim: [2, 5, 8, 11],
  aug: [2, 10],
};

function familyOf(iv) {
  const has = (n) => iv.includes(n);
  if (has(4)) return has(8) && !has(7) ? 'aug' : has(10) ? 'dominant' : 'major';
  if (has(3)) return has(6) ? (has(10) ? 'halfdim' : 'dim') : 'minor';
  if (has(5)) return 'sus4';
  if (has(2) || has(14)) return 'sus2';
  throw new Error('a chord needs a third or a suspension');
}

/**
 * `'Gmaj7/B'` → its root, intervals, pitch classes and bass.
 *
 * The bass of a slash chord counts as one of its tones: it is sounding, and a
 * melody a semitone off it clashes exactly as it would against any other note.
 */
export function parseChord(symbol) {
  const [head, slash, ...extra] = symbol.split('/');
  if (extra.length) throw new Error(`not a chord: "${symbol}"`);
  const m = /^([A-G][#b]?)(.*)$/.exec(head);
  if (!m) throw new Error(`not a chord: "${symbol}"`);
  const iv = QUALITIES[m[2]];
  if (!iv) throw new Error(`unknown chord quality "${m[2]}" in "${symbol}"`);

  const root = pcOfName(m[1]);
  const bass = slash === undefined ? root : pcOfName(slash);
  const pcs = [...new Set([...iv.map((i) => pcOf(root + i)), bass])];
  return { symbol, root, intervals: iv, pcs, bass, family: familyOf(iv) };
}

/**
 * The pitch classes a melody may hold over `chord` on a strong beat.
 *
 * Chord tones and the family's tensions — minus any pitch class sitting a
 * semitone ABOVE something the chord contains. That one subtraction is the
 * whole of the "avoid note" rule: the fourth over a major chord sits a semitone
 * over its third, the root of a maj7 a semitone over its seventh, and both are
 * the notes that sound like a mistake when the accompaniment holds the chord
 * underneath them. A semitone BELOW a chord tone is a major seventh once it is
 * voiced above it, which is a colour rather than a clash, and is left alone.
 */
export function consonantWith(chord) {
  const tensions = TENSIONS[chord.family].map((i) => pcOf(chord.root + i));
  const sounding = new Set(chord.pcs);
  const ok = new Set();
  for (const pc of [...chord.pcs, ...tensions]) {
    if (!sounding.has(pcOf(pc - 1))) ok.add(pc);
  }
  return ok;
}

/**
 * Which tones to voice, most important first: the third (or the suspension)
 * says what the chord is, the seventh or sixth what colour it is, then the
 * ninth, the root, and last the fifth, which every instrument already implies.
 */
function voicePriority(chord) {
  const order = [];
  const take = (pred) => {
    for (const i of chord.intervals) if (pred(i) && !order.includes(i)) order.push(i);
  };
  take((i) => i === 3 || i === 4 || i === 5 || (i === 2 && chord.family === 'sus2'));
  take((i) => i === 10 || i === 11 || i === 9);
  take((i) => i === 14);
  take((i) => i === 0);
  take(() => true);
  return [...new Set(order.map((i) => pcOf(chord.root + i)))];
}

/**
 * How much a voicing grates, independent of where it came from.
 *
 * Two voices a semitone apart are a cluster, and on a soft pad a cluster reads
 * as a wrong note rather than as colour — worst at the top, where the ear
 * hears the melody. A whole step low in the register is merely mud.
 */
function roughness(v) {
  let r = 0;
  for (let i = 1; i < v.length; i++) {
    const gap = v[i] - v[i - 1];
    if (gap === 1) r += i === v.length - 1 ? 8 : 4;
    else if (gap === 2 && v[i - 1] < 55) r += 1;
  }
  return r;
}

/**
 * Lay a chord out between `lo` and `hi`, as close as possible to the voicing
 * before it.
 *
 * Every close-position inversion that fits is a candidate, plus each one with
 * its second-highest note dropped an octave (an open voicing, which is what
 * makes a string pad sound like strings rather than an organ). The winner moves
 * the fewest semitones from `prev`, plus a penalty for clusters; with nothing
 * before it, the one nearest the middle of the range. That single rule is most
 * of what makes a progression sound like voices moving rather than blocks being
 * swapped.
 *
 * A chord with fewer tones than `voices` doubles its lowest notes an octave up,
 * on top — a triad asked for four voices is root position plus the octave.
 *
 * @returns {number[]} MIDI pitches, low to high
 */
export function voiceChord(chord, prev, { lo, hi, voices = 4 } = {}) {
  const pcs = voicePriority(chord).slice(0, voices);
  const extra = voices - pcs.length;
  const sorted = [...pcs].sort((a, b) => a - b);

  const candidates = [];
  const keep = (v) => {
    if (v[0] >= lo && v[v.length - 1] <= hi) candidates.push(v);
  };
  for (let r = 0; r < sorted.length; r++) {
    const order = [...sorted.slice(r), ...sorted.slice(0, r)];
    for (let base = lo; base < lo + 12; base++) {
      if (pcOf(base) !== order[0]) continue;
      const close = [base];
      for (let k = 1; k < order.length; k++) {
        let n = close[k - 1] + 1;
        while (pcOf(n) !== order[k]) n++;
        close.push(n);
      }
      for (let k = 0; k < extra; k++) close.push(close[k] + 12);
      keep(close);
      if (close.length >= 3) {
        const open = [...close];
        open[open.length - 2] -= 12;
        keep(open.sort((a, b) => a - b));
      }
    }
  }
  if (!candidates.length) throw new Error(`no voicing of ${chord.symbol} fits between ${lo} and ${hi}`);

  const centre = (lo + hi) / 2;
  const motion = (v) => {
    if (!prev?.length) return Math.abs(v.reduce((s, n) => s + n, 0) / v.length - centre);
    if (prev.length === v.length) return v.reduce((s, n, i) => s + Math.abs(n - prev[i]), 0);
    return v.reduce((s, n) => s + Math.min(...prev.map((p) => Math.abs(n - p))), 0);
  };
  let best = null;
  let bestCost = Infinity;
  for (const v of candidates) {
    const c = motion(v) + roughness(v);
    if (c < bestCost) {
      best = v;
      bestCost = c;
    }
  }
  return best;
}

/** The chord's bass note inside `[lo, hi]`, nearest the previous one. */
export function bassNote(chord, prev, { lo, hi }) {
  const options = [];
  for (let n = lo; n <= hi; n++) if (pcOf(n) === chord.bass) options.push(n);
  if (!options.length) throw new Error(`no ${chord.symbol} bass between ${lo} and ${hi}`);
  const target = prev ?? lo + 5;
  return options.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
}

/**
 * The semitone shift that moves A onto `tonic`, kept within a tritone.
 *
 * The sound effects are built on A3; transposing them by this much puts every
 * chime in the key of whatever is playing, and never more than six semitones
 * from where the effect was tuned.
 */
export function shiftFromA(tonic) {
  return pcOf(tonic - 9 + 6) - 6;
}
