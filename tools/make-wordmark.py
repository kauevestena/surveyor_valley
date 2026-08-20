#!/usr/bin/env python3
"""Draw the Surveyor Valley wordmark, and the looking glass on its own.

Writes `assets/logo.svg` and `assets/mark.svg`. Run it only when the logo itself
changes — the SVGs are committed, and nothing in the game or the build depends
on this script at runtime.

    pip install fonttools && python3 tools/make-wordmark.py

WHY A SCRIPT AND NOT A HAND-DRAWN SVG. The letterforms come from Alfa Slab One
(SIL Open Font License 1.1), the closest thing in a libre catalogue to the fat,
hand-lettered slab serif Stardew Valley is set in. They are converted to PATHS
here, so the published SVG carries no font dependency and renders identically on
a machine with nothing installed. The OFL explicitly permits this; the font is
credited in the readme. What the script exists to keep is the recipe: the arc,
the tracking, the lens geometry and the colour ramps are all parameters, and a
logo whose only source is a 45 kB blob of bezier data cannot be adjusted.

The palette is the game's own — see `src/render/palette.js`. Gold `#f2c14e` is
`P.instrumentTrim`, the ink `#3b2a16` is the overlay ink, the glass blues are
`P.lens`, and the handle is `P.wood` over `P.woodDark`. The logo and the valley
are painted from the same box of crayons.
"""

import math
import os
import urllib.request

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

# Alfa Slab One v21, straight from Google Fonts. Not committed: it is an input,
# and the outlines it produces are the output.
FONT_URL = 'https://fonts.gstatic.com/s/alfaslabone/v21/6NUQ8FmMKwSEKjnm5-4v-4Jh6dU.ttf'
FONT_CACHE = '/tmp/alfa-slab-one.ttf'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPM = 1000.0
X_HEIGHT = 556.0   # of Alfa Slab One, in font units
CAP = 778.0

# ---- the composition -------------------------------------------------------
# `ARC` is the radius of the circle the baseline rides on, in the same units as
# everything else. Negative bends the ends UP, which is the way a banner hangs
# and the reason the wordmark reads as cheerful rather than as sagging. It is
# very large on purpose: the arc has to be felt, not read.
TOP_SIZE = 300      # cap height of "Surveyor" is 0.778 of this
BOT_SIZE = 290
TRACK_TOP = 6
TRACK_BOT = 42      # "Valley" is six letters against eight; tracking evens the block
BASELINE_GAP = 268  # tight, so the two words read as one object
ARC = -9000

LENS_R = 0.78       # of the x-height: the lens bulges past the o it replaces
GLASS_R = 0.72      # of the lens
HANDLE_ANGLE = 52   # degrees, down and to the right
HANDLE_LEN = 2.9    # of the lens radius, measured from its centre
HANDLE_W = 0.34
OUTLINE = 62

INK = '#3b2a16'


def load_font():
    if not os.path.exists(FONT_CACHE):
        urllib.request.urlretrieve(FONT_URL, FONT_CACHE)
    return TTFont(FONT_CACHE)


def layout(font, word, size, tracking, baseline, skip=None):
    """Glyph outlines as SVG paths, rolled along the arc. Returns (paths, spans)."""
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font['hmtx']

    advances = [hmtx[cmap[ord(c)]][0] * size / UPM + tracking for c in word]
    width = sum(advances) - tracking
    x = -width / 2
    paths, spans = [], []

    for ch, adv in zip(word, advances):
        cx = x + (adv - tracking) / 2
        angle = cx / ARC
        # Riding a circle: a glyph away from the middle is rotated by its own
        # arc angle AND lifted by the sagitta, or the baseline would kink.
        rise = ARC * (1 - math.cos(angle))
        t = (Transform()
             .translate(cx, baseline + rise)
             .rotate(angle)
             .translate(-cx, -baseline)
             .translate(x, baseline)
             .scale(size / UPM, -size / UPM))   # font y is up, SVG y is down
        spans.append({'ch': ch, 'x': x, 'adv': adv - tracking, 'cx': cx, 'cy': baseline + rise})
        if not (skip and skip(ch)):
            pen = SVGPathPen(gs)
            gs[cmap[ord(ch)]].draw(TransformPen(pen, tuple(t)))
            paths.append(pen.getCommands())
        x += adv

    return paths, spans, width


def magnifier(cx, cy, r, ink_width):
    """The looking glass: rim, glass, glare, handle. Returns (behind, front)."""
    gr = r * GLASS_R
    a = math.radians(HANDLE_ANGLE)
    hx, hy = math.cos(a), math.sin(a)
    h0 = (cx + hx * r * 0.80, cy + hy * r * 0.80)
    h1 = (cx + hx * r * HANDLE_LEN, cy + hy * r * HANDLE_LEN)
    hf = (cx + hx * r * 1.28, cy + hy * r * 1.28)
    hw = r * HANDLE_W

    # The shaft goes BEHIND the letters, so it reads as a magnifier lying on the
    # word rather than as a stick drawn over it; only the knob comes out the far
    # side. The lens itself is in front — it is standing in for a letter.
    behind = f'''
    <line x1="{h0[0]:.1f}" y1="{h0[1]:.1f}" x2="{h1[0]:.1f}" y2="{h1[1]:.1f}" stroke="{INK}" stroke-width="{hw * 2 + ink_width:.0f}"/>
    <line x1="{h0[0]:.1f}" y1="{h0[1]:.1f}" x2="{h1[0]:.1f}" y2="{h1[1]:.1f}" stroke="url(#wood)" stroke-width="{hw * 2:.0f}"/>
    <line x1="{hf[0]:.1f}" y1="{hf[1]:.1f}" x2="{h0[0]:.1f}" y2="{h0[1]:.1f}" stroke="url(#brass)" stroke-width="{hw * 2.05:.0f}"/>
    <circle cx="{h1[0]:.1f}" cy="{h1[1]:.1f}" r="{hw * 1.2:.1f}" fill="url(#wood)" stroke="{INK}" stroke-width="{ink_width * 0.55:.0f}"/>'''

    front = f'''
    <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="url(#glass)" stroke="{INK}" stroke-width="{ink_width * 0.55:.0f}"/>
    <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{(r + gr) / 2:.1f}" fill="none" stroke="url(#brass)" stroke-width="{r - gr:.1f}"/>
    <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{gr:.1f}" fill="none" stroke="{INK}" stroke-width="{ink_width * 0.30:.0f}"/>
    <g stroke="#ffffff" opacity="0.72">
      <line x1="{cx - gr * 0.55:.1f}" y1="{cy - gr * 0.10:.1f}" x2="{cx - gr * 0.10:.1f}" y2="{cy - gr * 0.58:.1f}" stroke-width="{gr * 0.26:.1f}"/>
      <line x1="{cx - gr * 0.22:.1f}" y1="{cy + gr * 0.30:.1f}" x2="{cx + gr * 0.16:.1f}" y2="{cy - gr * 0.14:.1f}" stroke-width="{gr * 0.13:.1f}"/>
    </g>'''

    return behind, front, (h0, h1, hw)


def defs(top, bottom, cy, r, h0, h1):
    return f'''  <defs>
    <linearGradient id="ink" x1="0" y1="{top:.0f}" x2="0" y2="{bottom:.0f}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f7ecd0"/>
      <stop offset="0.42" stop-color="#f2c14e"/>
      <stop offset="0.62" stop-color="#e8a730"/>
      <stop offset="1" stop-color="#f2c14e"/>
    </linearGradient>
    <linearGradient id="brass" x1="0" y1="{cy - r:.1f}" x2="0" y2="{cy + r:.1f}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f7e3a8"/><stop offset="1" stop-color="#c9922c"/>
    </linearGradient>
    <linearGradient id="wood" x1="{h0[0]:.1f}" y1="{h0[1]:.1f}" x2="{h1[0]:.1f}" y2="{h1[1]:.1f}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#b9834a"/><stop offset="1" stop-color="#7a5227"/>
    </linearGradient>
    <radialGradient id="glass" cx="0.36" cy="0.30" r="0.85">
      <stop offset="0" stop-color="#eaf7fd"/><stop offset="0.55" stop-color="#9fdcf4"/><stop offset="1" stop-color="#4fb2dd"/>
    </radialGradient>
  </defs>'''


def build_logo(font):
    top, spans, w1 = layout(font, 'Surveyor', TOP_SIZE, TRACK_TOP, 0, skip=lambda c: c == 'o')
    bottom, _, w2 = layout(font, 'Valley', BOT_SIZE, TRACK_BOT, BASELINE_GAP)
    letters = '\n      '.join(f'<path d="{p}"/>' for p in top + bottom)

    o = next(s for s in spans if s['ch'] == 'o')
    xh = X_HEIGHT * TOP_SIZE / UPM
    cx, cy = o['cx'], o['cy'] - xh / 2
    r = xh * LENS_R
    behind, front, (h0, h1, hw) = magnifier(cx, cy, r, OUTLINE)

    pad = 90
    minx = -max(w1, w2) / 2 - pad
    miny = -CAP * TOP_SIZE / UPM - pad - 40
    maxy = BASELINE_GAP + 90 + pad
    w, h = -2 * minx, maxy - miny

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx:.1f} {miny:.1f} {w:.1f} {h:.1f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="Surveyor Valley">
  <title>Surveyor Valley</title>
{defs(miny, maxy, cy, r, h0, h1)}
  <g stroke-linejoin="round" stroke-linecap="round">
    <g transform="translate(0,{OUTLINE * 0.42:.0f})" fill="#2a1c0d" stroke="#2a1c0d" stroke-width="{OUTLINE}" opacity="0.30">
      {letters}
      <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}"/>
      <line x1="{h0[0]:.1f}" y1="{h0[1]:.1f}" x2="{h1[0]:.1f}" y2="{h1[1]:.1f}" stroke-width="{hw * 2 + OUTLINE:.0f}"/>
    </g>{behind}
    <g fill="{INK}" stroke="{INK}" stroke-width="{OUTLINE}">{letters}</g>
    <g fill="url(#ink)">{letters}</g>{front}
  </g>
</svg>
'''


def build_mark():
    """The looking glass alone, for a favicon or a badge."""
    r = 100.0
    cx = cy = 0.0
    behind, front, (h0, h1, hw) = magnifier(cx, cy, r, OUTLINE * 0.72)
    span = r * HANDLE_LEN + hw * 1.2 + OUTLINE * 0.6
    minx = -r - OUTLINE * 0.6
    miny = minx
    w = span - minx
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx:.1f} {miny:.1f} {w:.1f} {w:.1f}" width="{w:.0f}" height="{w:.0f}" role="img" aria-label="Surveyor Valley">
  <title>Surveyor Valley</title>
{defs(miny, miny + w, cy, r, h0, h1)}
  <g stroke-linejoin="round" stroke-linecap="round">{behind}{front}
  </g>
</svg>
'''


def main():
    font = load_font()
    out = os.path.join(ROOT, 'assets')
    os.makedirs(out, exist_ok=True)
    for name, svg in (('logo.svg', build_logo(font)), ('mark.svg', build_mark())):
        path = os.path.join(out, name)
        with open(path, 'w') as fh:
            fh.write(svg)
        print(f'{path}  {len(svg) / 1024:.1f} kB')


if __name__ == '__main__':
    main()
