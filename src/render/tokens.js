// The house colours, once.
//
// These are the SAME values as the custom properties in `styles/base.css`, and
// that duplication is the whole point of this file existing: a canvas cannot
// read a CSS variable without a `getComputedStyle` per draw, so the numbers
// have to live in JavaScript too. Before this there were five copies of them —
// `base.css`, the overlay's own `COL` table, the plan view's inline strings,
// a handful of raw hex in `scene.js`, and the sprite palette — and they had
// drifted: three different golds for "surveyed or valuable", a green in the
// overlay that was not the green in the UI, a red that was not the red.
//
// `tests/render.test.mjs` parses `base.css` and asserts the two agree, so the
// drift cannot come back quietly. If you change a colour, change it in
// `base.css` and here, and the test will tell you if you forgot.

/** Parchment, wood and ink: the interface. */
export const UI = {
  panel: '#f7ead0',
  panelAlt: '#ecdab6',
  wood: '#8b5a2b',
  woodLight: '#c69a5e',
  woodDark: '#5c3a1a',
  ink: '#3b2a16',
  inkSoft: '#6b5334',
  inkFaint: '#96805c',
  line: '#d3ba91',

  accent: '#d9622b',
  accentDark: '#a8461c',
  gold: '#f2b93c',
  green: '#4a8f36',
  amber: '#e0a52e',
  red: '#c4402f',
  blue: '#35709e',
};

/**
 * The font the canvas draws labels in.
 *
 * It used to ask for "Inter", which is not loaded anywhere — no `@font-face`,
 * no link in `index.html` — so every label in the world silently fell back to
 * `system-ui` while the DOM around it rendered in ui-rounded. Two typefaces on
 * one screen, neither of them the one that was asked for.
 *
 * Kept identical to `--font` in `base.css`.
 */
export const UI_FONT = 'ui-rounded, "Segoe UI", Roboto, system-ui, -apple-system, sans-serif';

/** `font` shorthand for a canvas, in the house typeface. */
export const font = (size, weight = 400) => `${weight} ${size}px ${UI_FONT}`;

/** `#rrggbb` plus an alpha, as a canvas-ready colour. */
export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** The same value as a Pixi tint. */
export const tintOf = (hex) => parseInt(hex.slice(1), 16);
