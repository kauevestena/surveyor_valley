// Render-layer tests.
//
// These run under plain `node --test` with nothing installed, which is only
// possible because the art pipeline is DOM-free: a sprite is a plain
// `{w, h, data}`, and `groundpaint` fills a typed array. Canvases and textures
// live in `atlas.js` and `groundbake.js` and are not touched here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { makePix, ramp, rgba, rgbToHsl, hash2, PX_PER_M } from '../src/render/pixbuf.js';
import { buildSprites, buildGroundSprites } from '../src/render/sprites/index.js';
import { ANIMAL_VARIANTS, PETS, LIVESTOCK } from '../src/render/sprites/animals.js';
import { makeHerd } from '../src/game/animals.js';
import { SKIN_TONES, HAIR_TONES, HAT_STYLES, OWNER_LOOKS, resolveLook } from '../src/render/palette.js';
import { classGrid, paintBase, paintDetail, shadeField } from '../src/render/groundpaint.js';
import { makeTerrain } from '../src/world/terrain.js';
import { buildWorld } from '../src/world/world.js';
import { DIFFICULTY } from '../src/core/state.js';
import { makeCamera, ZOOM_LADDER, ZOOM_DEFAULT } from '../src/render/camera.js';
import { UI, UI_FONT, alpha, tintOf } from '../src/render/tokens.js';
import fs from 'node:fs';

// ------------------------------------------------------------ the painter ---

test('the pixel painter blends, bounds-checks and hashes stably', () => {
  const a = makePix(8, 8);
  a.fill(2, 2, 4, 4, '#ff0000');
  assert.deepEqual(a.get(3, 3), [255, 0, 0, 255]);
  assert.deepEqual(a.get(0, 0), [0, 0, 0, 0]);

  // Writes outside the buffer are dropped, not wrapped onto the other edge.
  a.px(-1, 4, '#00ff00');
  a.px(99, 4, '#00ff00');
  assert.deepEqual(a.get(7, 4), [0, 0, 0, 0]);

  const b = makePix(8, 8);
  b.fill(2, 2, 4, 4, '#ff0000');
  assert.equal(a.hash(), b.hash(), 'same operations must give the same pixels');
});

test('outline traces the alpha edge and ignores translucent pixels', () => {
  const pix = makePix(9, 9);
  pix.fill(3, 3, 3, 3, '#4f9c33');
  // A translucent shadow, of the kind `contactShadow` lays down.
  pix.px(1, 8, '#1e2a18', 0.25);

  pix.outline('auto');

  // The edge next to the solid block is drawn...
  assert.ok(pix.get(2, 4)[3] > 0, 'edge pixel beside solid content must be outlined');
  // ...and it is a DARKER GREEN, not black: auto-outline takes the local hue.
  const [r, g, b] = pix.get(2, 4);
  assert.ok(g > r && g > b, 'outline beside green content should stay green');

  // The lone translucent pixel is background, so nothing was drawn around it.
  // Getting this wrong drew a black ellipse around every tree's contact shadow.
  assert.equal(pix.get(0, 8)[3], 0, 'a translucent pixel must not be treated as content');
  assert.equal(pix.get(2, 8)[3], 0);
});

test('ramp shifts hue toward yellow in light and blue in shadow, for any hue', () => {
  // The bug this pins down: a fixed +hue delta warms an orange correctly and
  // sends a green straight into cyan. Grass highlights came out mint.
  for (const base of ['#5fa03c', '#a8763e', '#3f92c4', '#b8503a']) {
    const [dark, mid, light] = ramp(base, 3);
    const hl = rgbToHsl(...rgba(light).slice(0, 3));
    const hm = rgbToHsl(...rgba(mid).slice(0, 3));
    const hd = rgbToHsl(...rgba(dark).slice(0, 3));

    assert.ok(hl[2] > hm[2], `${base}: highlight must be lighter`);
    assert.ok(hd[2] < hm[2], `${base}: shadow must be darker`);

    // Distance round the hue circle to yellow, closer for the highlight.
    const toYellow = (h) => Math.abs(((h - 0.13 + 0.5) % 1) - 0.5);
    assert.ok(
      toYellow(hl[0]) <= toYellow(hm[0]) + 1e-6,
      `${base}: highlight must move toward yellow, not away (got hue ${hl[0].toFixed(3)})`,
    );
    const toBlue = (h) => Math.abs(((h - 0.66 + 0.5) % 1) - 0.5);
    assert.ok(toBlue(hd[0]) <= toBlue(hm[0]) + 1e-6, `${base}: shadow must move toward blue`);
  }
});

// -------------------------------------------------------------- the sheet ---

test('every sprite is deterministic, outlined, and a plausible real size', () => {
  const first = buildSprites();
  const second = buildSprites();
  assert.ok(first.length > 60, 'the roster should not have quietly emptied');
  assert.equal(first.length, second.length);

  for (let i = 0; i < first.length; i++) {
    const a = first[i];
    const b = second[i];
    assert.equal(a.key, b.key);
    assert.equal(a.pix.hash(), b.pix.hash(), `${a.key} must paint identically every time`);
    assert.ok(a.pix.bounds(), `${a.key} must not be empty`);
    assert.ok(a.anchorY > 0 && a.anchorY <= 1, `${a.key} anchor must be inside the sprite`);
  }

  // Sizes are derived from the pixel buffer, so this is really asserting that
  // the art and the world agree about how big things are.
  const size = (key) => {
    const s = first.find((x) => x.key === key);
    return s && { wm: s.pix.w / PX_PER_M, hm: s.pix.h / PX_PER_M };
  };

  const person = size('char-S-0');
  assert.ok(person.hm > 1.6 && person.hm < 2.6, `a surveyor is ${person.hm} m tall`);
  assert.ok(person.wm > 1.0 && person.wm < 2.0);

  const tree = size('tree-0-1');
  assert.ok(tree.wm > 3 && tree.wm < 7, `a tree is ${tree.wm} m across`);
  assert.ok(tree.hm > person.hm * 2, 'a tree must dwarf the surveyor');

  const station = size('station');
  assert.ok(station.hm > 1.5 && station.hm < 3.0, `the instrument is ${station.hm} m tall`);
});

test('the three painted size buckets really differ in size', () => {
  const sprites = buildSprites();
  const at = (s) => sprites.find((x) => x.key === `tree-0-${s}`).pix.w;
  assert.ok(at(0) < at(1) && at(1) < at(2), 'tree size buckets must be strictly increasing');
  // Discrete sizes exist so nothing is ever scaled at draw time; if the buckets
  // were nearly equal there would be no point paying for three of them.
  assert.ok(at(2) - at(0) > 10, 'buckets should be visibly different');
});

test('a tree stands up: canopy above, trunk below, roots on the ground', () => {
  const byKey = new Map(buildSprites().map((s) => [s.key, s]));

  for (const v of [0, 3, 5]) {
    const t = byKey.get(`tree-${v}-1`);
    // The whole point of the shape: a canopy taller than it is wide over a
    // trunk you can actually see. The old tree was a wide cushion on a stump
    // and came out almost square.
    assert.ok(t.pix.h > t.pix.w * 1.4, `tree-${v} is ${t.pix.w}x${t.pix.h}, not an upright tree`);

    // Two pixels above the ground line there must be wood: brown, meaning red
    // clearly ahead of green. Sampling the middle third catches the trunk
    // wherever its lean put it.
    const groundY = Math.round(t.pix.h * t.anchorY) - 2;
    let wood = 0;
    for (let x = Math.round(t.pix.w / 3); x < Math.round((t.pix.w * 2) / 3); x++) {
      const [r, g, b, a] = t.pix.get(x, groundY);
      if (a > 128 && r > g + 20 && g > b) wood++;
    }
    assert.ok(wood > 8, `tree-${v} has ${wood} px of trunk at the ground`);

    // And through the middle of the canopy it must be leaf: green ahead of red.
    let foliage = 0;
    for (let x = 4; x < t.pix.w - 4; x++) {
      const [r, g, b, a] = t.pix.get(x, Math.round(t.pix.h * 0.35));
      if (a > 128 && g > r && g > b) foliage++;
    }
    assert.ok(foliage > t.pix.w / 3, `tree-${v} has ${foliage} px of canopy across its middle`);
  }
});

test('every tree variant is its own tree, and two of them are autumn', () => {
  const byKey = new Map(buildSprites().map((s) => [s.key, s]));

  // Eight variants that painted four looks was the old arrangement: `variant`
  // only chose a leaf ramp, so half the sheet was duplicates in different
  // greens. They now differ in silhouette too.
  const hashes = new Set();
  for (let v = 0; v < 8; v++) hashes.add(byKey.get(`tree-${v}-1`).pix.hash());
  assert.equal(hashes.size, 8, 'the eight tree variants must not repeat');

  /** Mean colour of the canopy band, over opaque pixels only. */
  const canopy = (key) => {
    const t = byKey.get(key);
    let r = 0;
    let g = 0;
    let n = 0;
    for (let y = Math.round(t.pix.h * 0.1); y < t.pix.h * 0.5; y++) {
      for (let x = 0; x < t.pix.w; x++) {
        const [pr, pg, , a] = t.pix.get(x, y);
        if (a < 128) continue;
        r += pr;
        g += pg;
        n++;
      }
    }
    return { r: r / n, g: g / n };
  };

  for (const v of [0, 1, 2, 3, 4, 5]) {
    const c = canopy(`tree-${v}-1`);
    assert.ok(c.g > c.r, `tree-${v} should be in leaf, got r=${c.r | 0} g=${c.g | 0}`);
  }
  for (const v of [6, 7]) {
    const c = canopy(`tree-${v}-1`);
    // Warm, and specifically NOT the plum that the house hue rotation turns an
    // orange into on its shadow step — hence red well clear of green rather
    // than merely ahead of it.
    assert.ok(c.r > c.g * 1.25, `tree-${v} should be in autumn colour, got r=${c.r | 0} g=${c.g | 0}`);
  }
});

test('the canopy is painted, not filled', () => {
  const t = buildSprites().find((s) => s.key === 'tree-0-2');
  const seen = new Set();
  for (let y = Math.round(t.pix.h * 0.1); y < t.pix.h * 0.55; y++) {
    for (let x = 0; x < t.pix.w; x++) {
      const [r, g, b, a] = t.pix.get(x, y);
      if (a > 128) seen.add(`${r},${g},${b}`);
    }
  }
  // Three leaf steps, three branch steps, the hollows and the outline's
  // per-pixel shades. A flat green disc would score about four.
  assert.ok(seen.size > 12, `expected a painted canopy, got ${seen.size} distinct colours`);
});

test('sprite keys the scene asks for all exist', () => {
  const keys = new Set(buildSprites().map((s) => s.key));
  for (let v = 0; v < 8; v++) for (let s = 0; s < 3; s++) assert.ok(keys.has(`tree-${v}-${s}`));
  for (const dir of ['S', 'N', 'E', 'W']) {
    for (let f = 0; f < 4; f++) assert.ok(keys.has(`char-${dir}-${f}`), `char-${dir}-${f} missing`);
    assert.ok(keys.has(`char-${dir}-idle`), `char-${dir}-idle missing`);
  }
  // The crouch is directional too. It used to be a single east-facing pose, so
  // walking to the tripod from the west spun the surveyor round to face away
  // from the instrument she was supposedly operating.
  for (const side of ['E', 'W']) {
    assert.ok(keys.has(`char-kneel-${side}`), `char-kneel-${side} missing`);
    assert.ok(keys.has(`char-kneel-${side}-idle`), `char-kneel-${side}-idle missing`);
  }
  for (const k of ['marco', 'station', 'prism', 'poste', 'divisa-0']) {
    assert.ok(keys.has(k), `${k} missing`);
  }
  // Ligeirinho carries the same roster minus the kneel: the tribrach is at the
  // player's end of the sight and he is at the other, holding the pole.
  for (const dir of ['S', 'N', 'E', 'W']) {
    for (let f = 0; f < 4; f++) assert.ok(keys.has(`aux-${dir}-${f}`), `aux-${dir}-${f} missing`);
    assert.ok(keys.has(`aux-${dir}-idle`), `aux-${dir}-idle missing`);
  }
});

test('the two of the crew can be told apart at a glance', () => {
  // At 24 pixels across, a silhouette is not enough — hi-vis orange against a
  // checked shirt is what actually distinguishes them, and a player who cannot
  // tell which one they are driving is a player who has lost the plot.
  const byKey = new Map(buildSprites().map((s) => [s.key, s]));
  for (const dir of ['S', 'N', 'E', 'W']) {
    const me = byKey.get(`char-${dir}-0`);
    const him = byKey.get(`aux-${dir}-0`);
    assert.notEqual(him.pix.hash(), me.pix.hash(), `aux-${dir}-0 paints identically to the player`);
    assert.equal(him.anchorY, me.anchorY, 'and stands on the same ground line');
  }
});

/**
 * The neighbours.
 *
 * One standing figure per owner look per body, and standing is the whole
 * roster: an owner waits on their own doorstep, so there is no walk cycle. The
 * atlas is painted from fixed archetypes long before any valley exists, which
 * is why the key carries the body and the variant — the world picks one at
 * generation time and can only pick something already painted.
 */
test('every landowner has a face, and none of them is the crew', () => {
  const byKey = new Map(buildSprites().map((s) => [s.key, s]));
  const crew = new Set(['char-S-0', 'aux-S-0'].map((k) => byKey.get(k).pix.hash()));
  const seen = new Map();

  for (const body of ['m', 'f']) {
    for (let v = 0; v < OWNER_LOOKS.length; v++) {
      for (const dir of ['S', 'N', 'E', 'W']) {
        for (const pose of ['0', 'idle']) {
          const key = `owner-${body}${v}-${dir}-${pose}`;
          assert.ok(byKey.has(key), `${key} missing`);
        }
        assert.equal(
          byKey.get(`owner-${body}${v}-${dir}-0`).anchorY,
          byKey.get(`char-${dir}-0`).anchorY,
          'everybody stands on the same ground line',
        );
      }

      const face = byKey.get(`owner-${body}${v}-S-0`).pix.hash();
      assert.ok(!crew.has(face), `owner-${body}${v} is painted as one of the crew`);
      assert.ok(!seen.has(face), `owner-${body}${v} is identical to ${seen.get(face)}`);
      seen.set(face, `owner-${body}${v}`);
    }
  }
});

/**
 * The one join between a generated valley and a sheet painted at boot.
 *
 * `placeResidents` writes an atlas key onto an entity. Nothing checks it at
 * runtime — `scene.js` asks the atlas for a frame and silently draws nothing if
 * it is missing — so a person standing invisibly on a doorstep is exactly the
 * kind of bug that survives a play-through.
 */
test('the owner an actual world puts on a doorstep has a sprite to be drawn with', () => {
  const keys = new Set(buildSprites().map((s) => s.key));
  const w = buildWorld('sv-morador', DIFFICULTY.medio);
  for (const p of w.parcels) {
    const who = w.residentFor(p.id);
    if (!who) continue;
    for (const dir of ['S', 'N', 'E', 'W']) {
      for (const pose of ['0', 'idle']) {
        assert.ok(keys.has(`${who.look}-${dir}-${pose}`), `${p.id}: no sprite ${who.look}-${dir}-${pose}`);
      }
    }
  }
});

/**
 * The farm.
 *
 * Livestock wanders, so unlike the owners it needs a walk cycle — and unlike
 * the owners it also needs the two rest poses a grazing animal alternates
 * between, which is the whole of what stops a paddock reading as a display
 * case. Every frame of that has to exist, because `scene.js` asks the atlas for
 * a key and silently draws nothing when it is missing: an invisible cow is
 * exactly the bug that survives a play-through.
 */
test('every farm animal has every frame it will be asked for', () => {
  const byKey = new Map(buildSprites().map((s) => [s.key, s]));

  for (const species of Object.keys(LIVESTOCK)) {
    // The ground line is NOT a shared fraction the way the people's is — a hen
    // is twelve pixels tall and a cow twenty-two, so `anchorY` differs by
    // construction. What has to hold is that the anchor lands on the bottom of
    // the painted art, or the animal floats, and that every frame of one
    // species agrees, or it bobs as it walks.
    const stands = (made, key) => {
      const b = made.pix.bounds();
      assert.ok(b, `${key} painted nothing`);
      const foot = Math.round(made.anchorY * made.pix.h);
      assert.ok(
        Math.abs(foot - (b.y + b.h - 1)) <= 1,
        `${key} does not stand on its own feet: anchor at ${foot}, art ends at ${b.y + b.h - 1}`,
      );
    };
    const level = byKey.get(`${species}-0-S-0`).anchorY;
    const seen = new Map();
    for (let v = 0; v < ANIMAL_VARIANTS; v++) {
      for (const dir of ['S', 'N', 'E', 'W']) {
        for (const pose of ['0', '1', '2', '3', 'idle', 'graze']) {
          const key = `${species}-${v}-${dir}-${pose}`;
          const made = byKey.get(key);
          assert.ok(made, `${key} missing`);
          stands(made, key);
          assert.equal(made.anchorY, level, `${key} sits at a different height from the rest of its species`);
        }

        // The four walk frames cannot all be the same picture, or the animal
        // slides across the field with its legs welded together.
        const walk = new Set(['0', '1', '2', '3'].map((f) => byKey.get(`${species}-${v}-${dir}-${f}`).pix.hash()));
        assert.ok(walk.size > 1, `${species}-${v}-${dir} has no walk cycle at all`);

        const graze = byKey.get(`${species}-${v}-${dir}-graze`).pix.hash();
        assert.notEqual(graze, byKey.get(`${species}-${v}-${dir}-idle`).pix.hash(), `${species}-${v}-${dir}: grazing and standing paint the same`);
      }

      // Two coats, and they have to be tellable apart or the second is a
      // pointless doubling of the atlas.
      const face = byKey.get(`${species}-${v}-E-0`).pix.hash();
      assert.ok(!seen.has(face), `${species} coat ${v} is identical to coat ${seen.get(face)}`);
      seen.set(face, v);
    }
  }
});

test('a cat and a dog sit differently, and neither is livestock', () => {
  const byKey = new Map(buildSprites().map((s) => [s.key, s]));
  const stock = new Set(
    Object.keys(LIVESTOCK).flatMap((sp) =>
      [0, 1].map((v) => byKey.get(`${sp}-${v}-S-0`).pix.hash()),
    ),
  );

  for (const species of PETS) {
    for (let v = 0; v < ANIMAL_VARIANTS; v++) {
      for (const dir of ['S', 'N', 'E', 'W']) {
        for (const pose of ['0', 'idle']) {
          const key = `${species}-${v}-${dir}-${pose}`;
          const made = byKey.get(key);
          assert.ok(made, `${key} missing`);
          const b = made.pix.bounds();
          assert.ok(b, `${key} painted nothing`);
          // Sitting on the ground rather than hovering over it. A pet's own
          // height differs from a person's, so this is the anchor against its
          // own art, not against the crew's fraction.
          assert.ok(
            Math.abs(Math.round(made.anchorY * made.pix.h) - (b.y + b.h - 1)) <= 1,
            `${key} is not sitting on the ground`,
          );
        }
        // The breath has to actually move something, or the pet is a photograph
        // sitting beside a person who is not.
        assert.notEqual(
          byKey.get(`${species}-${v}-${dir}-0`).pix.hash(),
          byKey.get(`${species}-${v}-${dir}-idle`).pix.hash(),
          `${species}-${v}-${dir} does not breathe`,
        );
      }
      assert.ok(!stock.has(byKey.get(`${species}-${v}-S-0`).pix.hash()), `${species} coat ${v} is painted as livestock`);
    }
  }

  // A pointed ear over a short face against a folded ear over a long one is
  // the entire difference between the two, and it has to survive.
  for (const dir of ['S', 'N', 'E']) {
    assert.notEqual(
      byKey.get(`cat-0-${dir}-0`).pix.hash(),
      byKey.get(`dog-0-${dir}-0`).pix.hash(),
      `the cat and the dog paint identically facing ${dir}`,
    );
  }
});

/**
 * The other half of the join `animals.test.mjs` holds.
 *
 * A world deals coats and pets from its seed; the atlas is painted at boot from
 * fixed archetypes and cannot know what it dealt. Nothing checks the two agree
 * at runtime — a missing key draws nothing, silently.
 */
test('every animal an actual valley puts on a farm has a sprite to be drawn with', () => {
  const keys = new Set(buildSprites().map((s) => s.key));
  const w = buildWorld('sv-fazenda', DIFFICULTY.medio);

  for (const a of makeHerd(w)) {
    for (const dir of ['S', 'N', 'E', 'W']) {
      for (const pose of ['0', '1', '2', '3', 'idle', 'graze']) {
        assert.ok(keys.has(`${a.species}-${a.variant}-${dir}-${pose}`), `${a.id}: no sprite for ${dir}-${pose}`);
      }
    }
  }

  for (const p of w.parcels) {
    const who = w.residentFor(p.id);
    if (!who) continue;
    assert.ok(who.pet, `${p.id}: the owner has nobody with them`);
    for (const dir of ['S', 'N', 'E', 'W']) {
      for (const pose of ['0', 'idle']) {
        assert.ok(
          keys.has(`${who.pet}-${who.petVariant}-${dir}-${pose}`),
          `${p.id}: no sprite ${who.pet}-${who.petVariant}-${dir}-${pose}`,
        );
      }
    }
  }
});

test('every look is distinct, deterministic, and keeps its feet on the ground', () => {
  // The choice is saved as indices, so these tables are a save format: a look
  // that painted nothing, or painted the same face for two different tones,
  // would be a silent disappointment rather than an error.
  const reference = buildSprites({ body: 'm', skin: 1, hair: 0, hat: 0 });
  const base = reference.find((s) => s.key === 'char-S-0');
  const seen = new Map([[base.pix.hash(), 'skin 1']]);

  for (let i = 0; i < SKIN_TONES.length; i++) {
    const made = buildSprites({ body: 'm', skin: i, hair: 0, hat: 0 });
    const s = made.find((x) => x.key === 'char-S-0');
    assert.ok(s.pix.bounds(), `skin ${i} painted nothing`);
    assert.equal(s.anchorY, base.anchorY, `skin ${i} moved the ground line`);
    if (i !== 1) assert.ok(!seen.has(s.pix.hash()), `skin ${i} is identical to ${seen.get(s.pix.hash())}`);
    seen.set(s.pix.hash(), `skin ${i}`);
    // Painting it again must give the same pixels, or the world changes under
    // the player between sessions.
    const again = buildSprites({ body: 'm', skin: i, hair: 0, hat: 0 }).find((x) => x.key === 'char-S-0');
    assert.equal(again.pix.hash(), s.pix.hash(), `skin ${i} is not deterministic`);
  }

  const hats = new Set();
  for (let i = 0; i < HAT_STYLES.length; i++) {
    const s = buildSprites({ body: 'm', skin: 1, hair: 0, hat: i }).find((x) => x.key === 'char-S-0');
    assert.ok(!hats.has(s.pix.hash()), `hat ${i} is identical to another`);
    assert.equal(s.anchorY, base.anchorY, `hat ${i} lifted the surveyor off the ground`);
    hats.add(s.pix.hash());
  }

  const hairs = new Set();
  for (let i = 0; i < HAIR_TONES.length; i++) {
    const s = buildSprites({ body: 'm', skin: 1, hair: i, hat: 0 }).find((x) => x.key === 'char-S-0');
    assert.ok(!hairs.has(s.pix.hash()), `hair ${i} is identical to another`);
    hairs.add(s.pix.hash());
  }

  // The two bodies must differ from every direction, including from behind,
  // where there is no face to go on at all.
  for (const dir of ['S', 'N', 'E']) {
    const m = buildSprites({ body: 'm', skin: 1, hair: 0, hat: 0 }).find((x) => x.key === `char-${dir}-0`);
    const f = buildSprites({ body: 'f', skin: 1, hair: 0, hat: 0 }).find((x) => x.key === `char-${dir}-0`);
    assert.notEqual(f.pix.hash(), m.pix.hash(), `the two bodies paint identically facing ${dir}`);
    assert.equal(f.anchorY, m.anchorY);
  }
});

test('a look out of a newer save degrades instead of painting undefined', () => {
  // Indices come out of a save file. One from a build with more tones than this
  // one must clamp to a plausible surveyor rather than throwing, or painting a
  // face out of `undefined` ramps.
  const wild = buildSprites({ body: 'x', skin: 99, hair: -3, hat: 42 });
  const s = wild.find((x) => x.key === 'char-S-0');
  assert.ok(s && s.pix.bounds(), 'an out-of-range look still paints a surveyor');
});

test('the idle pose actually differs from standing still', () => {
  // A breath that changes no pixels is not a breath. The two frames the game
  // alternates between while standing are walk frame 0 and the idle pose, so if
  // those ever paint identically the surveyor is a photograph again — which is
  // exactly the complaint this animation exists to answer.
  const byKey = new Map(buildSprites().map((s) => [s.key, s]));
  for (const dir of ['S', 'N', 'E', 'W']) {
    const rest = byKey.get(`char-${dir}-0`);
    const idle = byKey.get(`char-${dir}-idle`);
    assert.notEqual(idle.pix.hash(), rest.pix.hash(), `char-${dir}-idle is identical to the rest pose`);
    assert.equal(idle.anchorY, rest.anchorY, `char-${dir}-idle must keep its feet on the ground`);
  }
  for (const side of ['E', 'W']) {
    const kneel = byKey.get(`char-kneel-${side}`);
    const kneelIdle = byKey.get(`char-kneel-${side}-idle`);
    assert.notEqual(kneelIdle.pix.hash(), kneel.pix.hash(), 'the kneeling breath changes nothing');
    assert.equal(kneelIdle.anchorY, kneel.anchorY);
  }
  // West is east mirrored, and mirroring is the whole of the difference.
  const east = byKey.get('char-kneel-E');
  const west = byKey.get('char-kneel-W');
  assert.equal(west.pix.hash(), east.pix.mirrorX().hash(), 'char-kneel-W is not char-kneel-E mirrored');
  assert.equal(west.anchorY, east.anchorY, 'the mirror lifted her off the ground');
});

/**
 * The crouch is a pose of the SAME character, not a second one.
 *
 * This is the regression test for a bug that survived several releases: the
 * kneeling painter was written before the look system and never revisited, so
 * walking up to the tripod swapped in a figure that ignored the vest, the body,
 * three quarters of every colour ramp, and — because it never drew the temples
 * — the hair colour the player had chosen. It read as art from an older build,
 * which is exactly what it was.
 *
 * Everything below is asserted against `char-S-0` in the look test above and
 * was asserted against nothing at all here, which is why nobody caught it.
 */
test('the crouch honours every look the standing sprite does', () => {
  const kneelOf = (look) => buildSprites(look).find((x) => x.key === 'char-kneel-E');
  const base = kneelOf({ body: 'm', skin: 1, hair: 0, hat: 0 });
  assert.ok(base.pix.bounds(), 'the crouch painted nothing');

  const distinct = (label, looks) => {
    const seen = new Map();
    for (const [name, look] of looks) {
      const s = kneelOf(look);
      assert.ok(s.pix.bounds(), `${label} ${name} painted nothing`);
      assert.equal(s.anchorY, base.anchorY, `${label} ${name} moved the ground line`);
      assert.ok(!seen.has(s.pix.hash()), `${label} ${name} paints identically to ${seen.get(s.pix.hash())}`);
      seen.set(s.pix.hash(), name);
    }
  };

  distinct('skin', SKIN_TONES.map((_, i) => [i, { body: 'm', skin: i, hair: 0, hat: 0 }]));
  distinct('hat', HAT_STYLES.map((_, i) => [i, { body: 'm', skin: 1, hair: 0, hat: i }]));
  // The one that was actually invisible: a hat covers the crown, not the sides,
  // so a crouch that skips the temples shows no hair colour at all.
  distinct('hair', HAIR_TONES.map((_, i) => [i, { body: 'm', skin: 1, hair: i, hat: 0 }]));
  distinct('body', [
    ['m', { body: 'm', skin: 1, hair: 0, hat: 0 }],
    ['f', { body: 'f', skin: 1, hair: 0, hat: 0 }],
  ]);

  // Painting it twice must give the same pixels, like every other sprite.
  assert.equal(kneelOf({ body: 'm', skin: 1, hair: 0, hat: 0 }).pix.hash(), base.pix.hash());
});

/**
 * The crouch uses whole ramps, not the light half of each one.
 *
 * The old painter reached for `[1]` and `[2]` of skin, shirt and vest and never
 * `[0]` — the entire shadow end — which is why the crouch read as flatter and
 * rounder-headed than the sprite it replaced. Asserting every step of every
 * ramp lands on at least one pixel is the cheapest thing that catches a painter
 * quietly dropping back to two-tone.
 */
test('the crouch is shaded with the full ramps, not half of each', () => {
  const look = resolveLook({ body: 'm', skin: 1, hair: 0, hat: 0 });
  const byKey = new Map(buildSprites({ body: 'm', skin: 1, hair: 0, hat: 0 }).map((s) => [s.key, s]));

  const present = (key) => {
    const { pix } = byKey.get(key);
    const out = new Set();
    for (let i = 0; i < pix.data.length; i += 4) {
      if (pix.data[i + 3] < 255) continue;
      out.add(`#${[0, 1, 2].map((k) => pix.data[i + k].toString(16).padStart(2, '0')).join('')}`);
    }
    return out;
  };

  const crouched = present('char-kneel-E');
  const standing = present('char-E-0');

  // Measured against the profile rather than against the ramp, because the
  // profile does not use every step of every ramp either — a leg gets one
  // trouser colour, not three. The claim is that the crouch is shaded no more
  // cheaply than the sprite it interrupts, which is the thing that broke.
  for (const part of ['skin', 'hair', 'shirt', 'vest', 'trousers', 'boots']) {
    look[part].forEach((colour, step) => {
      if (!standing.has(colour)) return;
      assert.ok(crouched.has(colour), `the profile shades with ${part}[${step}] (${colour}); the crouch does not`);
    });
  }
});

// ------------------------------------------------------------- the ground ---

const BOUNDS = { minE: 0, minN: 0, maxE: 640, maxN: 640, width: 640, height: 640 };

test('a chunk bakes identically every time, and slices only touch their rows', () => {
  const terrain = makeTerrain('render-test', BOUNDS);
  const M = 32;
  const W = M * PX_PER_M;
  const { grid, size } = classGrid(terrain, 256, 256, M);
  const shade = shadeField(256, 256, M);

  const whole = new Uint8ClampedArray(W * W * 4);
  paintBase(whole, grid, size, 256, 256, M, PX_PER_M, 0, W, shade);

  // Painted in slices, exactly as the budgeted queue does it.
  const sliced = new Uint8ClampedArray(W * W * 4);
  for (let r = 0; r < W; r += 48) {
    paintBase(sliced, grid, size, 256, 256, M, PX_PER_M, r, Math.min(W, r + 48), shade);
  }
  assert.deepEqual(Buffer.from(sliced), Buffer.from(whole), 'slicing must not change the result');

  // A slice must touch ONLY its own rows. If it painted the whole chunk each
  // time, the budget would be meaningless and the bake would still hitch.
  const one = new Uint8ClampedArray(W * W * 4);
  paintBase(one, grid, size, 256, 256, M, PX_PER_M, 48, 96, shade);
  const rowOpaque = (y) => one[(y * W + 5) * 4 + 3] > 0;
  assert.ok(rowOpaque(50), 'rows inside the slice must be painted');
  assert.ok(!rowOpaque(10), 'rows before the slice must be untouched');
  assert.ok(!rowOpaque(200), 'rows after the slice must be untouched');
});

test('the ground is painted where the terrain actually is', () => {
  // The test that was missing, and its absence let the whole ground map ship
  // MIRRORED north-for-south inside every chunk: the class grid is built with
  // row j increasing northward while all three painters indexed it as if row 0
  // were the north edge. Half the valley was painted as the wrong soil, most of
  // the visible water was not water, and most of the real water was painted as
  // pasture — which is how a surveyor walks across a lake and is stopped dead
  // in an empty field.
  //
  // Water is the probe because it is the one class nothing else looks like.
  const terrain = makeTerrain('render-test', BOUNDS);
  const M = 32;
  const W = M * PX_PER_M;
  const wet = (e, n) => terrain.soilAt(e, n).id === 'AGUA';

  // A chunk with water in it, and with the water LOPSIDED north to south — a
  // chunk whose halves match cannot catch a mirror at all.
  let origin = null;
  for (let oe = 0; oe < BOUNDS.width - M && !origin; oe += M) {
    for (let on = 0; on < BOUNDS.height - M && !origin; on += M) {
      let north = 0;
      let south = 0;
      for (let j = 0; j < M; j++) {
        for (let i = 0; i < M; i++) {
          if (!wet(oe + i + 0.5, on + j + 0.5)) continue;
          if (j >= M / 2) north++;
          else south++;
        }
      }
      const total = north + south;
      if (total > M * M * 0.08 && Math.abs(north - south) > total * 0.35) origin = { oe, on };
    }
  }
  assert.ok(origin, 'found a chunk with lopsided water to test against');

  const { oe, on } = origin;
  const { grid, size } = classGrid(terrain, oe, on, M);
  const buf = new Uint8ClampedArray(W * W * 4);
  paintBase(buf, grid, size, oe, on, M, PX_PER_M, 0, W, shadeField(oe, on, M));

  // Water and its shallows are the only blue-dominant tones in the palette.
  const paintedWet = (px, py) => {
    const o = (py * W + px) * 4;
    return buf[o + 2] > buf[o] + 8 && buf[o + 2] > buf[o + 1] + 8;
  };

  let agree = 0;
  let total = 0;
  let paintedN = 0;
  let paintedCount = 0;
  let trueN = 0;
  let trueCount = 0;
  for (let py = 0; py < W; py += 2) {
    for (let px = 0; px < W; px += 2) {
      // Canvas rows run north to south; the world's N axis runs the other way.
      const e = oe + (px + 0.5) / PX_PER_M;
      const n = on + M - (py + 0.5) / PX_PER_M;
      const p = paintedWet(px, py);
      const t = wet(e, n);
      if (p === t) agree++;
      total++;
      if (p) {
        paintedN += n;
        paintedCount++;
      }
      if (t) {
        trueN += n;
        trueCount++;
      }
    }
  }

  // Not 100%: the shore deliberately blurs half a metre of foam and two metres
  // of shallows outward, and the class lookup is jittered to ragged the edges.
  const ratio = agree / total;
  assert.ok(ratio > 0.9, `painted soil should match the terrain (${(ratio * 100).toFixed(1)}% agreed)`);

  // The sharpest statement of the same thing: a mirror moves the water to the
  // other side of the chunk, so its centre of mass flips about the mid-line.
  const dN = Math.abs(paintedN / paintedCount - trueN / trueCount);
  assert.ok(dN < 2, `painted water should sit where the water is (centroid off by ${dN.toFixed(1)} m)`);
});

test('ground detail is placed from world position, so chunks tile seamlessly', () => {
  const terrain = makeTerrain('render-test', BOUNDS);
  const sprites = buildGroundSprites();
  const M = 32;
  const W = M * PX_PER_M;

  const bake = () => {
    const buf = new Uint8ClampedArray(W * W * 4);
    const { grid, size } = classGrid(terrain, 128, 128, M);
    paintBase(buf, grid, size, 128, 128, M, PX_PER_M, 0, W, shadeField(128, 128, M));
    paintDetail(buf, grid, size, 128, 128, M, PX_PER_M, sprites);
    return Buffer.from(buf);
  };
  assert.deepEqual(bake(), bake(), 'the same patch of ground must grow the same tufts');
});

test('the ground actually has texture rather than being a flat fill', () => {
  const terrain = makeTerrain('render-test', BOUNDS);
  const sprites = buildGroundSprites();
  const M = 32;
  const W = M * PX_PER_M;

  const buf = new Uint8ClampedArray(W * W * 4);
  const { grid, size } = classGrid(terrain, 300, 300, M);
  paintBase(buf, grid, size, 300, 300, M, PX_PER_M, 0, W, shadeField(300, 300, M));
  paintDetail(buf, grid, size, 300, 300, M, PX_PER_M, sprites);

  const seen = new Set();
  for (let i = 0; i < buf.length; i += 4) seen.add((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2]);

  // The Phase 1 ground was one colour per class, blurred. That is the failure
  // this guards against — anything under a few dozen tones is a flat fill.
  assert.ok(seen.size > 40, `expected a textured surface, got ${seen.size} distinct colours`);
  assert.equal(buf[3], 255, 'the ground must be fully opaque — no holes in the world');
});

test('hash2 is stable, well spread, and independent across salts', () => {
  assert.equal(hash2(7, 9, 3), hash2(7, 9, 3));
  assert.notEqual(hash2(7, 9, 3), hash2(7, 9, 4));

  let sum = 0;
  let n = 0;
  for (let x = 0; x < 100; x++) {
    for (let y = 0; y < 100; y++) {
      const v = hash2(x, y, 1);
      assert.ok(v >= 0 && v < 1);
      sum += v;
      n++;
    }
  }
  assert.ok(Math.abs(sum / n - 0.5) < 0.02, 'detail placement must not be biased');
});

// ------------------------------------------------------------- the camera ---

test('field zoom is always an integer multiple of the art resolution', () => {
  // Non-integer scaling is what turns pixel art into mush, so this is a
  // correctness property of the renderer, not a preference.
  for (const z of ZOOM_LADDER) {
    if (z < PX_PER_M) continue; // the plan view draws lines, not sprites
    assert.equal(z % PX_PER_M, 0, `zoom ${z} is not a whole number of art pixels`);
  }
  assert.ok(ZOOM_LADDER.includes(ZOOM_DEFAULT));
});

test('the world container always lands on a whole screen pixel', () => {
  // The one rounding in the renderer. Every sprite is positioned relative to
  // this, so if it is integral the whole scene shares one quantization — and if
  // it is not, each sprite finds its own and the picture shimmers.
  const cam = makeCamera({ e: 100, n: 100 });
  cam.setViewport(1280, 800);
  cam.setBounds(BOUNDS);

  const whole = (v) => Math.abs(v - Math.round(v)) < 1e-9;

  for (const zoom of ZOOM_LADDER) {
    cam.setZoom(zoom);
    cam.snapTo({ e: 123.456789, n: 87.1357 });
    for (let i = 0; i < 120; i++) {
      cam.tick(1 / 60);
      cam.follow({ e: 300.371, n: 251.919 }, 1 / 60);
      // At every alpha, not just at the ends of a step.
      for (const a of [0, 0.13, 0.5, 0.87, 1]) {
        cam.setAlpha(a);
        const off = cam.containerOffset();
        assert.ok(whole(off.x) && whole(off.y), `container off-pixel at zoom ${zoom}, step ${i}`);
      }
    }
  }
});

test('the camera follow never stalls and never reverses', () => {
  // Half of the regression test for the walking jitter. Snapping the STORED
  // position fed the rounding error back into the follow, so an increment below
  // half a base pixel vanished entirely: the camera held still for several steps
  // and then jumped a whole one, and the world lurched instead of gliding.
  const cam = makeCamera({ e: 300, n: 300, zoom: ZOOM_DEFAULT });
  cam.setViewport(1280, 800);
  cam.setBounds(BOUNDS);

  const dt = 1 / 60;
  const target = { e: 300, n: 300 };
  const offsets = [];
  for (let i = 0; i < 400; i++) {
    target.e += 4.5 * dt; // WALK_SPEED, due east, in a straight line
    cam.tick(dt);
    cam.follow(target, dt);
    cam.setAlpha(1);
    offsets.push(cam.containerOffset().x);
  }

  // Walking east moves the world container west, monotonically.
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i] <= offsets[i - 1], `container reversed at frame ${i}`);
  }

  // And it must not lurch. Once up to speed the camera tracks a 4.5 m/s walk,
  // which at zoom 32 is 144 screen px/s — a shade over two per frame. Anything
  // larger than three is the stall-then-jump this test exists to catch.
  const settled = offsets.slice(200);
  for (let i = 1; i < settled.length; i++) {
    const step = settled[i - 1] - settled[i];
    assert.ok(step > 0, `camera stalled at frame ${200 + i}`);
    assert.ok(step <= 3, `camera lurched ${step} px at frame ${200 + i}`);
  }
});

test('a drag moves the camera without smearing the next frame', () => {
  // Pan and pinch run off pointer events, outside the fixed step. If they moved
  // `e` without moving `prevE` with it, the following frame would interpolate
  // across the whole drag.
  const cam = makeCamera({ e: 300, n: 300 });
  cam.setViewport(1280, 800);
  cam.setBounds(BOUNDS);

  cam.setPosition(317.4, 288.6);
  cam.setAlpha(0); // the start of a step: must already be where the drag put it
  assert.equal(cam.rE, 317.4, 'a drag must not be interpolated away');
  assert.equal(cam.rN, 288.6);
});

test('zoom steps rung to rung and stays inside the ladder', () => {
  const cam = makeCamera({ zoom: ZOOM_DEFAULT });
  cam.setViewport(1280, 800);

  for (let i = 0; i < 10; i++) cam.stepZoom(1);
  assert.equal(cam.zoom, ZOOM_LADDER[ZOOM_LADDER.length - 1], 'zooming in must clamp at the top');
  for (let i = 0; i < 20; i++) cam.stepZoom(-1);
  assert.equal(cam.zoom, ZOOM_LADDER[0], 'zooming out must clamp at the bottom');

  cam.setZoom(30);
  assert.ok(ZOOM_LADDER.includes(cam.zoom), 'setZoom must snap to a rung');
});

test('zooming toward a point keeps that point under the cursor', () => {
  const cam = makeCamera({ e: 320, n: 320, zoom: 32 });
  cam.setViewport(1280, 800);
  cam.setBounds(BOUNDS);

  const sx = 900;
  const sy = 300;
  const before = cam.screenToWorld(sx, sy);
  cam.zoomAt(sx, sy, 1);
  const after = cam.screenToWorld(sx, sy);

  // Within one art pixel: the camera snaps to the grid, so exactness is neither
  // achievable nor wanted.
  assert.ok(Math.hypot(after.e - before.e, after.n - before.n) < 1 / PX_PER_M + 1e-9);
});

test('Ligeirinho is still a different person from the look most like his', () => {
  // His face is fixed and the player's is not, so the collision to worry about
  // is the player who picks the same skin and the same straw hat. What actually
  // separates them is the wardrobe — checked shirt and denim against hi-vis,
  // and the prism pole — which is a claim worth pinning rather than assuming.
  const twin = new Map(buildSprites({ body: 'm', skin: 0, hair: 3, hat: 1 }).map((s) => [s.key, s]));
  for (const dir of ['S', 'N', 'E', 'W']) {
    const me = twin.get(`char-${dir}-0`);
    const him = twin.get(`aux-${dir}-0`);
    assert.notEqual(him.pix.hash(), me.pix.hash(), `aux-${dir}-0 is indistinguishable from that player`);
    assert.equal(him.anchorY, me.anchorY, 'and stands on the same ground line');
  }
});

// --------------------------------------------------------------- tokens ---

/**
 * The house colours exist twice — as CSS custom properties for the DOM and as
 * `tokens.js` for the two canvases — because a canvas cannot read a CSS
 * variable without a `getComputedStyle` per draw. Duplication that nothing
 * checks is duplication that drifts, and this one had: the overlay carried a
 * green that was not the interface's green, a red that was not its red, and
 * three different golds meant "surveyed or valuable".
 */
test('the JS tokens and the CSS custom properties have not drifted apart', () => {
  const css = fs.readFileSync(new URL('../styles/base.css', import.meta.url), 'utf8');
  const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  const declared = new Map();
  for (const m of root.matchAll(/--([a-z-]+):\s*([^;]+);/g)) declared.set(m[1], m[2].trim());

  const pairs = {
    panel: 'panel', 'panel-alt': 'panelAlt', wood: 'wood', 'wood-light': 'woodLight',
    'wood-dark': 'woodDark', ink: 'ink', 'ink-soft': 'inkSoft', 'ink-faint': 'inkFaint',
    line: 'line', accent: 'accent', 'accent-dark': 'accentDark', gold: 'gold',
    green: 'green', amber: 'amber', red: 'red', blue: 'blue',
  };
  for (const [cssName, jsName] of Object.entries(pairs)) {
    assert.ok(declared.has(cssName), `--${cssName} is missing from base.css`);
    assert.equal(
      UI[jsName].toLowerCase(),
      declared.get(cssName).toLowerCase(),
      `--${cssName} and UI.${jsName} disagree`,
    );
  }

  // The font too: the canvases asked for "Inter" for a long time, which is not
  // loaded anywhere, so world labels silently fell back to system-ui while the
  // DOM around them rendered in ui-rounded.
  assert.equal(UI_FONT, declared.get('font'), 'the canvas font is not --font');

  // Every custom property `game.css` reaches for must actually exist, or it
  // renders as its fallback forever and nobody notices.
  const game = fs.readFileSync(new URL('../styles/game.css', import.meta.url), 'utf8');
  const used = new Set([...game.matchAll(/var\(--([a-z-]+)/g)].map((m) => m[1]));
  const undeclared = [...used].filter((v) => !declared.has(v) && !v.startsWith('safe-'));
  assert.deepEqual(undeclared, [], 'game.css uses custom properties that base.css never defines');
});

test('the token helpers produce what a canvas and Pixi actually want', () => {
  assert.equal(alpha('#f2b93c', 0.16), 'rgba(242, 185, 60, 0.16)');
  assert.equal(tintOf('#f2b93c'), 0xf2b93c);
});
