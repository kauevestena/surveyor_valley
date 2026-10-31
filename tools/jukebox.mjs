// The jukebox page's code. See `tools/jukebox.html`.
//
// Live playback uses the same lookahead scheduling as `src/audio/music.js`;
// rendering uses an OfflineAudioContext with every note scheduled up front.
// Both go through `makeBand`, so neither is a second implementation of the
// instruments that could drift from the game's.

import { TRACKS, TITLE, FIELD } from '../src/audio/tracks.js';
import { arrange } from '../src/audio/arrange.js';
import { makeBand } from '../src/audio/instruments.js';

/** The game's music bus and master, so a render here is at the level a player hears. */
const MUSIC_GAIN = 0.14;
const MASTER_GAIN = 0.9;

/**
 * Render a piece to an AudioBuffer.
 *
 * @param {string} id
 * @param {object} [o]
 * @param {string|number} [o.seed]      the performance; the same seed renders the same samples
 * @param {number} [o.sampleRate]
 * @param {string[]} [o.parts]          only these parts — a stem, for checking one instrument's level
 * @param {boolean} [o.atGameLevel]     through the game's music bus and master rather than at unity
 */
export async function render(id, { seed = 1, sampleRate = 44100, parts = null, atGameLevel = false } = {}) {
  const piece = arrange(TRACKS[id], { seed });
  const ctx = new OfflineAudioContext(2, Math.ceil(piece.length * sampleRate), sampleRate);
  const level = ctx.createGain();
  level.gain.value = piece.level * (atGameLevel ? MUSIC_GAIN * MASTER_GAIN : 1);
  level.connect(ctx.destination);
  const band = makeBand(ctx, level);
  for (const ev of piece.events) {
    if (!parts || parts.includes(ev.part)) band.play(ev, ev.t);
  }
  return ctx.startRendering();
}

/** A 16-bit PCM WAV of an AudioBuffer. */
export function wav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// ---- live playback -------------------------------------------------------------

let live = null;

function stop() {
  if (!live) return;
  clearInterval(live.timer);
  live.ctx.close();
  live = null;
  status('stopped');
}

function play(id, { section = null, parts = null } = {}) {
  stop();
  const ctx = new AudioContext();
  const piece = arrange(TRACKS[id], { seed: Date.now() });
  // At unity rather than at the game's level, the same as a render: the game's
  // music bus is quiet on purpose, under the effects, and listening to a piece
  // on its own wants it at a level you can hear.
  const out = ctx.createGain();
  out.gain.value = piece.level;
  out.connect(ctx.destination);
  const band = makeBand(ctx, out);
  const from = section ? piece.bars.find((b) => b.section === section)?.t ?? 0 : 0;
  const events = piece.events.filter((ev) => ev.t >= from && (!parts || parts.includes(ev.part)));
  const t0 = ctx.currentTime + 0.2 - from;
  let i = 0;
  const timer = setInterval(() => {
    const now = ctx.currentTime;
    while (i < events.length && t0 + events[i].t < now + 0.5) {
      band.play(events[i], Math.max(now, t0 + events[i].t));
      i++;
    }
    const at = now - t0;
    const bar = piece.bars.filter((b) => b.t <= at);
    status(`${piece.title} — ${bar.length ? bar[bar.length - 1].section : ''} bar ${bar.length} — ${at.toFixed(1)} / ${piece.length.toFixed(1)} s`);
    if (at > piece.length) stop();
  }, 100);
  live = { ctx, timer };
}

// ---- the page ---------------------------------------------------------------------

function status(text) {
  document.getElementById('status').textContent = text;
}

function button(text, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.onclick = onclick;
  return b;
}

function pieceCard(id) {
  const track = TRACKS[id];
  const piece = arrange(track, { seed: 1 });
  const card = document.createElement('section');
  card.className = 'piece';
  card.dataset.id = id;

  const h = document.createElement('h2');
  h.textContent = `${track.title} — ${track.subtitle}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${id === TITLE ? 'title theme' : 'field'} · ${track.key} · ${track.meter} · ${track.bpm} bpm · ${piece.length.toFixed(0)} s · ${piece.events.length} notes`;

  const sections = document.createElement('select');
  for (const name of [...new Set(track.form)]) sections.append(new Option(`from ${name}`, name));

  const solo = Object.keys(track.parts).map((part) => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.value = part;
    label.append(box, ` ${part}`);
    return label;
  });
  const chosen = () => {
    const on = solo.map((l) => l.firstChild).filter((b) => b.checked).map((b) => b.value);
    return on.length === solo.length ? null : on;
  };

  const download = document.createElement('a');
  const renderBtn = button('Render WAV', async () => {
    status(`rendering ${track.title}…`);
    const buffer = await render(id, { parts: chosen() });
    download.href = URL.createObjectURL(wav(buffer));
    download.download = `${id}.wav`;
    download.textContent = `${id}.wav`;
    download.click();
    status(`rendered ${track.title}`);
  });

  const row1 = document.createElement('div');
  row1.className = 'row';
  row1.append(button('▶ Play', () => play(id, { section: sections.value, parts: chosen() })), button('■ Stop', stop), sections, renderBtn, download);
  const row2 = document.createElement('div');
  row2.className = 'row';
  row2.append(...solo);
  card.append(h, meta, row1, row2);
  return card;
}

if (typeof document !== 'undefined') {
  const list = document.getElementById('pieces');
  for (const id of [TITLE, ...FIELD]) list.append(pieceCard(id));
  // For headless probes: render without clicking.
  globalThis.jukebox = { render, wav, TRACKS };
}
