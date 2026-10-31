// The soundtrack, as a score.
//
// Four pieces: a title theme, and three for the field that take turns while a
// job is under way. The model is the farm-sim day — warm, unhurried, mostly
// acoustic, a piece and then a stretch of birdsong before the next one — and
// the accent is the valley's own: a viola caipira's doubled strings, a tune
// sung in parallel thirds the way a dupla caipira sings one, a toada rocking
// in six-eight.
//
// THE MELODIES ARE NOBODY'S BUT OURS. The genre is the acknowledged target, as
// the farm-sim house style is for the art: a warm palette of plucks, flute,
// bells and strings, gentle tempos, a descending bass under a singable tune —
// conventions, which belong to nobody. Not one phrase here is transcribed from
// another game's score, and a contribution to this file is held to the same
// line as one to `render/sprites/`.
//
// How to read it. Chords are one bar each between `|`; two in a bar split it.
// A melody is a line of `<pitch><duration>` tokens — `F#5q.` is a dotted
// quarter, `rh` a half rest, `~` ties into the next note (see `theory.js`).
// Everything else is the NAME of a pattern (`arrange.js` → `PATTERNS`) played
// over the chords: a part lists its instrument, its register and its pattern
// once, and a section lists which parts play in it.
//
// `tests/music.test.mjs` checks every bar of this file: lengths, registers,
// and that every strong beat of every tune sits with its chord. Write a wrong
// note and the test names the piece, the section and the bar.
//
// `level` is a per-piece gain, measured rather than guessed: each piece was
// rendered through `tools/jukebox.html` and set to the same K-weighted
// loudness (-15 LUFS at unity, ungated), so no piece arrives noticeably louder
// than the one before it. Re-measure after changing an arrangement.

/** The title theme: on the opening screen, and again when the campaign is done. */
export const TITLE = 'vale';

/** The field rotation, in no particular order — `music.js` shuffles it. */
export const FIELD = ['manha', 'toada', 'valsa'];

// ---- Vale do Agrimensor ------------------------------------------------------
//
// D major, 84 bpm. The main theme: a harp's broken chords, a flute tune built
// on one gesture — a leap of a sixth that steps back down — over a bass that
// walks down the scale a bar at a time, and bells that answer it in the gaps.

const VALE_HEAD = 'D | A/C# | Bm7 | F#m/A | Gadd9 | D/F#';
const VALE_TUNE = `
  F#5q. E5e D5e E5e F#5q | E5h. A4q | D5q. C#5e B4e C#5e D5q | C#5h. D5q |
  B5q. A5e G5e A5e B5q | A5h. F#5q`;
const VALE_BELLS = `
  rw | rh A5e C#6e E6q | rw | rh E6e C#6e A5q |
  rw | rh F#6e E6e D6q | rw | rh A5e D6e F#6q`;

const vale = {
  id: 'vale',
  title: 'Vale do Agrimensor',
  subtitle: "The Surveyor's Valley",
  key: 'D',
  meter: '4/4',
  bpm: 84,
  level: 0.81,
  parts: {
    flute: { inst: 'flute', vel: 0.82 },
    bells: { inst: 'bells', vel: 0.55 },
    harp: { inst: 'harp', pattern: 'arp8', voices: 4, range: ['F#3', 'D5'], bassRange: ['G2', 'F#3'], ring: true, vel: 0.6 },
    pad: { inst: 'pad', pattern: 'hold', voices: 4, range: ['D3', 'A4'], vel: 0.4 },
    bass: { inst: 'bass', pattern: 'pedal', range: ['D2', 'C#3'], vel: 0.68 },
  },
  sections: {
    intro: {
      chords: 'Dmaj9 | Gmaj7 | Dmaj9 | A7sus4',
      lines: { flute: 'rw | rw | rw | rh. A4q' },
      parts: ['harp'],
      dyn: 0.85,
    },
    A: {
      chords: `${VALE_HEAD} | Em7 | A7sus4 A7`,
      lines: { flute: `${VALE_TUNE} | G5q. F#5e E5e D5e E5q | D5h C#5q A4q` },
      parts: ['harp', 'bass'],
      dyn: 0.9,
    },
    A2: {
      chords: `${VALE_HEAD} | Em7 A7 | D`,
      lines: { flute: `${VALE_TUNE} | G5q. F#5e E5q C#5q | D5h. rq`, bells: VALE_BELLS },
      parts: ['harp', 'pad', 'bass'],
      dyn: 0.95,
    },
    B: {
      chords: 'Gmaj7 | A/G | F#m7 | Bm7 | Em7 | F#m7 | Gmaj7 | A7sus4 A7',
      lines: {
        flute: `
          D5q G5q B5h | A5h. E5q | F#5q. E5e F#5q A5q | B5h. rq |
          G5q B5q E6h | C#6h. A5q | B5h A5q G5q | A5h G5q E5q`,
        bells: 'rw | rh C#6e E6e A6q | rw | rh F#6e D6e B5q | rw | rh E6e F#6e A6q | rw | rw',
      },
      parts: ['harp', 'pad', 'bass'],
      patterns: { bass: 'half' },
      dyn: 1,
    },
    tag: {
      chords: 'Gmaj7 | D/F# | Em7 A7sus4',
      lines: { flute: 'rh D5q E5q | F#5q. E5e D5q A4q | G5q. F#5e E5h' },
      parts: ['harp', 'pad', 'bass'],
      dyn: 0.88,
      rit: 0.86,
    },
    end: {
      chords: 'Dmaj9',
      lines: { flute: 'F#5w', bells: 're D6e F#6e A6e C#7q rq' },
      parts: ['harp', 'pad', 'bass'],
      patterns: { harp: 'strum4' },
      dyn: 0.8,
      rit: 0.8,
    },
  },
  form: ['intro', 'A', 'A2', 'B', 'A2', 'tag', 'end'],
};

// ---- Manhã no Campo -------------------------------------------------------------
//
// G major, 96 bpm, a little swing. Morning: a nylon guitar fingerpicking under
// a flute that skips rather than sings, a glockenspiel answering from above,
// and a shaker that only arrives once the tune has been heard through once.

const MANHA_HEAD = 'G | D/F# | Em7 | Cmaj7 | G/B | C';
const MANHA_TUNE = `
  D5e G5e B5q A5e G5e A5q | F#5q. E5e D5h | B4e E5e G5q F#5e E5e F#5q | E5q. D5e B4h |
  D5e G5e B5q A5e G5e A5q | G5q. E5e C5h`;

const manha = {
  id: 'manha',
  title: 'Manhã no Campo',
  subtitle: 'Morning in the Field',
  key: 'G',
  meter: '4/4',
  bpm: 96,
  swing: 0.55,
  level: 0.82,
  parts: {
    flute: { inst: 'flute', vel: 0.8 },
    glock: { inst: 'bells', vel: 0.48 },
    guitar: { inst: 'guitar', pattern: 'travis', voices: 3, range: ['G3', 'A4'], bassRange: ['E2', 'D3'], ring: true, vel: 0.6 },
    keys: { inst: 'keys', pattern: 'pulse', voices: 4, range: ['E3', 'D5'], vel: 0.4, strum: 0.004 },
    bass: { inst: 'bass', pattern: 'root5', range: ['E2', 'D3'], vel: 0.66 },
    shaker: { inst: 'shaker', pattern: 'offbeat', vel: 0.3 },
  },
  sections: {
    intro: {
      chords: 'G | Cmaj7/G | G | D7',
      lines: { glock: 'rw | rw | D6e G6e B6q A6e G6e A6q | F#6q. E6e D6h' },
      parts: ['guitar'],
      dyn: 0.85,
    },
    A: {
      chords: `${MANHA_HEAD} | Am7 | D7sus4 D7`,
      lines: { flute: `${MANHA_TUNE} | A4e C5e E5q D5e C5e D5q | E5h F#5q A5q` },
      parts: ['guitar', 'bass'],
      dyn: 0.9,
    },
    A2: {
      chords: `${MANHA_HEAD} | Am7 D7 | G`,
      lines: {
        flute: `${MANHA_TUNE} | A4e C5e E5q F#5q A5q | G5h. rq`,
        glock: 'rw | rh A5e D6e F#6q | rw | rh G5e B5e E6q | rw | rh E6e D6e C6q | rw | rh B5e D6e G6q',
      },
      parts: ['guitar', 'bass', 'shaker'],
      dyn: 0.95,
    },
    B: {
      chords: 'Cmaj7 | D | Bm7 | Em7 | Am7 | Bm7 | Cmaj7 | D7sus4 D7',
      lines: {
        flute: `
          E5q G5q B5h | A5h. F#5q | F#5q. E5e D5q B4q | E5h. rq |
          C5q E5q A5h | B5h. A5q | G5q. A5e B5h | A5h F#5q D5q`,
        glock: 'rw | rh D6e E6e F#6q | rw | rh G6e F#6e E6q | rw | rh D6e C#6e B5q | rw | rw',
      },
      parts: ['guitar', 'bass', 'shaker', 'keys'],
      dyn: 1,
    },
    tag: {
      chords: 'Cmaj7 | G/B | Am7 D7sus4',
      lines: { flute: 'E5q G5q B5h | A5h. G5q | E5h D5h' },
      parts: ['guitar', 'bass', 'keys'],
      patterns: { bass: 'pedal' },
      dyn: 0.85,
      rit: 0.88,
    },
    end: {
      chords: 'G',
      lines: { flute: 'B4w', glock: 'rq G6q B6q D7q' },
      parts: ['guitar', 'bass'],
      patterns: { guitar: 'strum4', bass: 'pedal' },
      dyn: 0.8,
      rit: 0.82,
    },
  },
  form: ['intro', 'A', 'A2', 'B', 'A2', 'tag', 'end'],
};

// ---- Toada da Porteira -------------------------------------------------------------
//
// A major, six-eight, a dotted quarter at 50. The one with the valley's accent:
// a viola caipira rocking through its arpeggio, and the tune sung twice — the
// second time by two voices a third apart, flute and clarinet, the way a dupla
// sings. The bridge turns to F♯ minor and hands the tune to the clarinet; the
// way home borrows D minor's sixth chord for one bar, which is the saudade in it.

const TOADA_HEAD = 'A | E/G# | F#m7 | C#m7 | D';
const TOADA_TUNE = `
  E5q C#5e E5q A5e | G#5q. F#5q E5e | F#5q A5e C#6q B5e | G#5q. E5q. |
  F#5q D5e F#5q A5e`;

const toada = {
  id: 'toada',
  title: 'Toada da Porteira',
  subtitle: 'Song at the Farm Gate',
  key: 'A',
  meter: '6/8',
  // Quarter notes, as every tempo here is: a dotted quarter at 50.
  bpm: 75,
  level: 0.83,
  parts: {
    flute: { inst: 'flute', vel: 0.78 },
    clarinet: { inst: 'clarinet', vel: 0.8 },
    // The segunda voz: the flute's own line, a third below.
    segunda: { inst: 'clarinet', harmonize: { from: 'flute' }, vel: 0.5 },
    viola: { inst: 'viola', pattern: 'toada', voices: 3, range: ['A3', 'C#5'], bassRange: ['A2', 'G#3'], ring: true, vel: 0.6 },
    pad: { inst: 'pad', pattern: 'hold', voices: 4, range: ['C#3', 'A4'], vel: 0.34 },
    bass: { inst: 'upright', pattern: 'bass68', range: ['E2', 'D#3'], vel: 0.8 },
    caxixi: { inst: 'shaker', pattern: 'caxixi', vel: 0.26 },
  },
  sections: {
    intro: {
      chords: 'A | D/A | A | E7sus4',
      lines: { clarinet: 'rh. | rh. | E4q. C#4q. | B3h.' },
      parts: ['viola', 'bass'],
      patterns: { bass: 'pedal' },
      dyn: 0.85,
    },
    A: {
      chords: `${TOADA_HEAD} | A/C# | Bm7 | E7sus4 E7`,
      lines: { flute: `${TOADA_TUNE} | A5q. E5q. | D5q F#5e A5q G#5e | A5q. G#5q.` },
      parts: ['viola', 'bass'],
      dyn: 0.9,
    },
    A2: {
      chords: `${TOADA_HEAD} | Dm6 | A/E E7 | A`,
      lines: { flute: `${TOADA_TUNE} | A5q. F5q. | C#5q. B4q. | A4h.` },
      parts: ['viola', 'bass', 'pad', 'caxixi', 'segunda'],
      dyn: 0.95,
    },
    B: {
      chords: 'F#m | C#m/E | D | A/C# | Bm7 | C#7 | F#m | E7sus4 E7',
      lines: {
        clarinet: `
          C#5q. A4q F#4e | G#4q. E4q. | F#4q A4e D5q C#5e | E5h. |
          D5q. F#5q E5e | B4q G#4e E#4q. | F#4h. | rh.`,
        flute: 'rh. | rq. B5q G#5e | rh. | rq. C#6q A5e | rh. | rq. G#5q. | rh. | A5q. G#5q.',
      },
      parts: ['viola', 'bass', 'pad', 'caxixi'],
      dyn: 1,
    },
    tag: {
      chords: 'D | Dm6 | A/E E7',
      lines: { flute: 'F#5q. A5q. | F5q. D5q. | C#5q. B4q.' },
      parts: ['viola', 'bass', 'pad', 'segunda'],
      dyn: 0.85,
      rit: 0.85,
    },
    end: {
      chords: 'A',
      lines: { flute: 'A4h.' },
      parts: ['viola', 'bass', 'pad', 'segunda'],
      patterns: { viola: 'strum68', bass: 'pedal' },
      dyn: 0.8,
      rit: 0.78,
    },
  },
  form: ['intro', 'A', 'A2', 'B', 'A2', 'tag', 'end'],
};

// ---- Valsa do Marco ------------------------------------------------------------------
//
// F major, three-four, 104 bpm. A music box over an electric piano's "pah pah"
// and a plucked upright that goes root, fifth, root, fifth. The middle is in D
// minor over a bass that steps down by semitones, and a clarinet joins the
// music box a third below for the rest of the way.

const VALSA_HEAD = 'F | F | C/E | C/E | Dm7 | Dm7 | Am7 | Am7 | Bbmaj7 | Bbmaj7 | F/A | F/A';
const VALSA_TUNE = `
  C5q F5q A5q | C6h A5q | G5q. F5e E5q | C5h. |
  D5q F5q A5q | D6h C6q | E6q. D6e C6q | A5h. |
  D6q C6q Bb5q | A5h. | C6q A5q F5q | A5h G5q`;

const valsa = {
  id: 'valsa',
  title: 'Valsa do Marco',
  subtitle: 'Waltz of the Boundary Stone',
  key: 'F',
  meter: '3/4',
  bpm: 104,
  level: 1.35,
  parts: {
    musicbox: { inst: 'musicbox', vel: 0.75 },
    clarinet: { inst: 'clarinet', harmonize: { from: 'musicbox' }, vel: 0.24 },
    keys: { inst: 'keys', pattern: 'waltz', voices: 3, range: ['G3', 'A4'], vel: 0.38, strum: 0.004 },
    bass: { inst: 'upright', pattern: 'waltzBass', range: ['F2', 'E3'], vel: 0.65 },
    pad: { inst: 'pad', pattern: 'hold', voices: 4, range: ['C3', 'A4'], vel: 0.21 },
  },
  sections: {
    intro: {
      chords: 'F | Bb/F | F | C7',
      lines: { musicbox: 'rh. | rh. | rh. | rq E5q G5q' },
      parts: ['keys', 'bass'],
      dyn: 0.85,
    },
    A: {
      chords: `${VALSA_HEAD} | Gm7 | C7 | F | C7sus4`,
      lines: { musicbox: `${VALSA_TUNE} | Bb5q. A5e G5q | E5q G5q Bb5q | A5h. | G5h.` },
      parts: ['keys', 'bass'],
      dyn: 0.9,
    },
    B: {
      chords: `
        Dm | Dm | A7/C# | A7/C# | Dm/C | Dm/C | G7/B | G7/B |
        Bbmaj7 | Bbmaj7 | Gm7 | Gm7 | A7sus4 | A7 | Dm | C7`,
      lines: {
        musicbox: `
          A5q. G5e F5q | D5h. | E5q. F5e G5q | G5h E5q |
          F5q. E5e D5q | A5h. | B5q. A5e G5q | F5h. |
          D5q F5q A5q | D6h C6q | Bb5q. A5e G5q | D5h. |
          D5q. E5e D5q | C#5h. | D5h A5q | G5h E5q`,
      },
      parts: ['keys', 'bass', 'pad', 'clarinet'],
      dyn: 0.95,
    },
    A2: {
      chords: `${VALSA_HEAD} | Gm7 | C7 | F | F`,
      lines: { musicbox: `${VALSA_TUNE} | Bb5q. A5e G5q | E5q G5q C6q | F5h. | rh.` },
      parts: ['keys', 'bass', 'pad', 'clarinet'],
      dyn: 1,
    },
    tag: {
      chords: 'Bb | Bbm6 | F/C',
      lines: { musicbox: 'D6q C6q Bb5q | Db6h. | C6q A5q F5q' },
      parts: ['keys', 'bass', 'pad', 'clarinet'],
      dyn: 0.85,
      rit: 0.85,
    },
    end: {
      chords: 'F',
      lines: { musicbox: 'F5h.' },
      parts: ['keys', 'bass', 'pad', 'clarinet'],
      patterns: { keys: 'hold', bass: 'pedal' },
      dyn: 0.75,
      rit: 0.75,
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'tag', 'end'],
};

export const TRACKS = { vale, manha, toada, valsa };
