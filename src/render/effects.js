// Things that move.
//
// Baked ground is dense and detailed and completely dead. This layer puts a
// small number of moving sprites on top of it — grass that sways and bends away
// as you walk through, dust off your boots when you run, a butterfly or two,
// and a ring that expands out of a target the instant an observation lands.
//
// The budget is deliberately tiny: around eighty sprites, all pooled, all from
// the one atlas texture. The density in this game comes from the baked chunks;
// this is only about motion, and motion is cheap when there is little of it.

import { PX_PER_M } from './pixbuf.js';
import { makePix, P } from './sprites/shared.js';
import { hash2 } from './pixbuf.js';
import { UI } from './tokens.js';
import { BUILDING_OVERHANG } from './sprites/built.js';
import { GRASS_COVER } from './groundpaint.js';

const SWAY_RADIUS = 11; // metres of grass that reacts
const SWAY_STEP = 1.5; // spacing of the animated tufts
const MAX_PARTICLES = 90;
const MAX_BUTTERFLIES = 3;
const MAX_GLINTS = 14;
/** Generous half-span of the largest farmhouse `scatter.js` builds, in metres. */
const HOUSE_REACH = 14;
/** Share of grid cells that carry a tuft on full pasture. */
const SWAY_OCCUPANCY = 0.42;

/**
 * Wind.
 *
 * The sway used to be one fixed sine, which meant the grass breathed at exactly
 * the same rate forever — regular enough that the eye reads it as machinery
 * rather than as weather. A gust is two slow sines beating against each other
 * at frequencies with no common multiple, so the pattern never audibly repeats,
 * plus a lull floor so the air is never completely still.
 *
 * `WIND_DIR` is the direction gusts push, in radians. Fixed for the valley:
 * wind that changed direction while you watched would be a different and much
 * larger feature, and every blade of grass agreeing about which way it is
 * blowing is most of what sells this.
 */
const WIND_DIR = -0.55;
const WIND_LULL = 0.35;

/** 0..1, how hard it is blowing right now. */
function gustAt(t) {
  const a = Math.sin(t * 0.21);
  const b = Math.sin(t * 0.37 + 1.3);
  return WIND_LULL + (1 - WIND_LULL) * (0.5 + 0.5 * a * 0.6 + 0.5 * b * 0.4);
}

export function makeEffects({ PIXI, atlas, container, camera }) {
  let t = 0;

  // ---- extra textures, painted here because nothing else wants them -------
  const dustTex = texFrom(PIXI, () => {
    const p = makePix(5, 5);
    p.ellipse(2.5, 2.5, 2.4, 2.0, P.dust[1]);
    p.ellipse(1.8, 1.8, 1.2, 1.0, P.dust[2]);
    return p;
  });

  const sparkTex = texFrom(PIXI, () => {
    const p = makePix(3, 3);
    // The palette's brightest step rather than pure white: `palette.js` keeps a
    // no-pure-white rule so nothing on screen is brighter than the sunlight,
    // and a spark is the easiest place to break it by accident.
    p.px(1, 1, P.spark[2]);
    p.px(0, 1, P.spark[1]);
    p.px(2, 1, P.spark[1]);
    p.px(1, 0, P.spark[1]);
    p.px(1, 2, P.spark[1]);
    return p;
  });

  // A single bright dash. Water is baked into the chunk bitmap and so is
  // completely static; a handful of these drifting across it is the cheapest
  // thing that makes a lake look wet rather than painted.
  const glintTex = texFrom(PIXI, () => {
    const p = makePix(6, 3);
    p.hline(1, 4, 1, P.foam[2]);
    p.px(0, 1, P.foam[1]);
    p.px(5, 1, P.foam[1]);
    p.px(2, 0, P.foam[1]);
    p.px(3, 2, P.foam[1]);
    return p;
  });

  const butterflyTex = [0, 1].map((frame) =>
    texFrom(PIXI, () => {
      const p = makePix(7, 5);
      const spread = frame === 0 ? 3 : 2;
      p.ellipse(3.5 - spread * 0.5, 2, spread * 0.5 + 0.6, 1.6, P.flower[1][2]);
      p.ellipse(3.5 + spread * 0.5, 2, spread * 0.5 + 0.6, 1.6, P.flower[1][1]);
      p.px(3, 2, UI.ink);
      p.px(3, 3, UI.ink);
      return p;
    }),
  );

  // ---- swaying grass ------------------------------------------------------
  // Every sprite goes straight into the shared sorted container rather than
  // into a sub-container of its own. A Container has a single zIndex, so
  // grouping them would sort all the grass as one layer and a butterfly would
  // pass in front of a tree it is standing behind.
  const swayPool = [];

  /**
   * The ground the nearby buildings cover, as world-metre rectangles.
   *
   * Rebuilt once per frame rather than queried per cell: the sway grid is two
   * hundred odd cells and there is almost never more than one house in reach,
   * so this turns a couple of hundred spatial queries into one, and the test
   * each cell then does is four comparisons.
   */
  const houseRects = [];

  function collectHouses(player, world) {
    houseRects.length = 0;
    if (!world?.spatial) return;
    // Buildings are indexed by their centre, and a big one reaches half a
    // dozen metres past it, so the query has to be wider than the sway disc or
    // a house the player is standing beside is missed.
    for (const ent of world.spatial.queryCircle(player.e, player.n, SWAY_RADIUS + HOUSE_REACH)) {
      if (ent.kind !== 'benfeitoria' || !ent.seg || ent.seg.length < 3) continue;
      let minE = Infinity;
      let maxE = -Infinity;
      let minN = Infinity;
      let maxN = -Infinity;
      for (const [e, n] of ent.seg) {
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
        if (n < minN) minN = n;
        if (n > maxN) maxN = n;
      }
      houseRects.push({
        minE: minE - BUILDING_OVERHANG.side,
        maxE: maxE + BUILDING_OVERHANG.side,
        minN: minN - BUILDING_OVERHANG.south,
        maxN: maxN + BUILDING_OVERHANG.north,
      });
    }
  }

  /** Would a tuft here be standing on a building? */
  function onBuilding(e, n) {
    for (const r of houseRects) {
      if (e >= r.minE && e <= r.maxE && n >= r.minN && n <= r.maxN) return true;
    }
    return false;
  }

  /**
   * How much grass this spot is entitled to, 0..1.
   *
   * Unknown classes answer 1 rather than 0: a soil added later should arrive
   * grassy and be turned down deliberately, not vanish from this layer with
   * nobody noticing.
   */
  function coverAt(world, e, n) {
    const terrain = world?.terrain;
    if (!terrain) return 1;
    return GRASS_COVER[terrain.soilAt(e, n).id] ?? 1;
  }

  function updateSway(player, world, dt) {
    const half = Math.ceil(SWAY_RADIUS / SWAY_STEP);
    const baseE = Math.round(player.e / SWAY_STEP) * SWAY_STEP;
    const baseN = Math.round(player.n / SWAY_STEP) * SWAY_STEP;

    collectHouses(player, world);

    let used = 0;
    for (let i = -half; i <= half; i++) {
      for (let j = -half; j <= half; j++) {
        const e = baseE + i * SWAY_STEP;
        const n = baseN + j * SWAY_STEP;
        const d = Math.hypot(e - player.e, n - player.n);
        if (d > SWAY_RADIUS) continue;

        const gx = Math.round(e / SWAY_STEP);
        const gy = Math.round(n / SWAY_STEP);
        const h = hash2(gx, gy, 211);
        if (h > SWAY_OCCUPANCY) continue; // most cells stay empty; this is accent, not cover

        // The jitter is resolved before the two tests below rather than after,
        // so that both ask about the spot the tuft will actually stand on. It
        // reaches 0.6 m and a soil cell is 0.25 m, so gating on the grid point
        // and then drawing at the jittered one puts tufts several cells inside
        // the lake they were supposed to stay out of.
        const jitterE = (hash2(gx, gy, 213) - 0.5) * SWAY_STEP * 0.8;
        const jitterN = (hash2(gx, gy, 217) - 0.5) * SWAY_STEP * 0.8;
        const te = e + jitterE;
        const tn = n + jitterN;

        // This was the one grass in the game that never consulted the world it
        // was scattered over: the baked pass reads the soil class and the
        // entity scatter reads the parcel, but a sway tuft appeared wherever
        // the hash liked — waving on open water and on bare rock.
        //
        // Scaling the occupancy rather than switching it off keeps the soil
        // boundaries ragged. A hard cut would draw this layer's own edge
        // across ground whose baked grass fades out over several metres, and
        // two disagreeing outlines of the same marsh is worse than either.
        if (h > SWAY_OCCUPANCY * coverAt(world, te, tn)) continue;

        // Nor does grass grow through a floor. A tuft SOUTH of a house sorts
        // after it (`zIndex = -n`) and so drew over the roof: grass sprouting
        // from the tiles as the player walked up to a sede. The rectangle is
        // the SPRITE's and not the footprint's, because the front wall and the
        // eaves are painted outside the ring.
        if (onBuilding(te, tn)) continue;

        const sprite = swayPool[used] || makeSway();
        used++;
        sprite.visible = true;

        sprite.x = Math.round(te * PX_PER_M);
        sprite.y = Math.round(-tn * PX_PER_M);
        sprite.zIndex = -tn;

        // Idle sway, plus a shove away from the player when they walk through.
        // The shove is the bit that sells it: the world reacts to you.
        //
        // The gust scales the amplitude AND adds a standing lean, so hard wind
        // does not merely wave the grass faster — it holds it over. Position is
        // folded into the phase so a field bends in travelling waves rather
        // than all at once, which is the difference between wind and a wobble.
        const gust = gustAt(t);
        const wave = Math.sin(t * 1.7 + h * 24 + (e * 0.35 + n * 0.2));
        const idle = wave * 0.055 * (0.5 + gust) + Math.sin(WIND_DIR) * gust * 0.09;
        const push = d < 1.6 ? (1 - d / 1.6) * 0.55 * Math.sign(e - player.e || 1) : 0;
        sprite.rotation = idle + push;
        // Fade out at the rim so tufts do not pop in as the player walks.
        sprite.alpha = Math.min(1, (SWAY_RADIUS - d) / 2.5);
      }
    }
    for (let i = used; i < swayPool.length; i++) swayPool[i].visible = false;
    void dt;
  }

  function makeSway() {
    const frame = atlas.get(`tuft-${swayPool.length % 4}`);
    const s = new PIXI.Sprite(frame ? frame.texture : PIXI.Texture.EMPTY);
    // Anchored at the base, so rotation bends the blades rather than spinning
    // the tuft about its middle.
    s.anchor.set(0.5, 1);
    container.addChild(s);
    swayPool.push(s);
    return s;
  }

  // ---- particles ----------------------------------------------------------
  /** @type {Array<{sprite:object, e:number,n:number, ve:number,vn:number, life:number, ttl:number, spin:number, grow:number}>} */
  const particles = [];

  function spawn(texture, e, n, opts) {
    if (particles.length >= MAX_PARTICLES) {
      const dead = particles.findIndex((p) => p.life / p.ttl > 0.75);
      if (dead < 0) return null;
      retire(particles[dead]);
      particles.splice(dead, 1);
    }
    const sprite = takeParticleSprite(texture);
    const p = { sprite, e, n, ve: 0, vn: 0, life: 0, ttl: 0.7, spin: 0, grow: 0, drag: 2.6, ...opts };
    sprite.zIndex = -n;
    particles.push(p);
    return p;
  }

  /**
   * Particle sprites are reused, not rebuilt.
   *
   * This file's own header promised "around eighty sprites, all pooled", and
   * they were not: every `ping` allocated twelve Sprites and destroyed twelve
   * more within half a second, which is a lot of garbage for the one effect
   * that fires on the most common action in the game.
   */
  const spritePool = [];

  function takeParticleSprite(texture) {
    const s = spritePool.pop() || makeParticleSprite();
    s.texture = texture;
    s.visible = true;
    s.alpha = 1;
    s.rotation = 0;
    s.scale.set(1);
    return s;
  }

  function makeParticleSprite() {
    const s = new PIXI.Sprite();
    s.anchor.set(0.5, 0.5);
    container.addChild(s);
    return s;
  }

  function retire(p) {
    p.sprite.visible = false;
    spritePool.push(p.sprite);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        retire(p);
        particles.splice(i, 1);
        continue;
      }
      const k = p.life / p.ttl;
      p.e += p.ve * dt;
      p.n += p.vn * dt;
      p.ve -= p.ve * p.drag * dt;
      p.vn -= p.vn * p.drag * dt;

      p.sprite.x = Math.round(p.e * PX_PER_M);
      p.sprite.y = Math.round(-p.n * PX_PER_M);
      p.sprite.alpha = 1 - k * k;
      p.sprite.rotation += p.spin * dt;
      const s = 1 + p.grow * k;
      p.sprite.scale.set(s);
    }
  }

  // ---- butterflies --------------------------------------------------------
  const flies = [];

  function updateButterflies(player, dt) {
    while (flies.length < MAX_BUTTERFLIES) {
      const s = new PIXI.Sprite(butterflyTex[0]);
      s.anchor.set(0.5, 0.5);
      container.addChild(s);
      flies.push({
        sprite: s,
        e: player.e + (Math.random() - 0.5) * 16,
        n: player.n + (Math.random() - 0.5) * 16,
        phase: Math.random() * 100,
        speed: 0.7 + Math.random() * 0.6,
      });
    }

    for (const f of flies) {
      // A wandering path from two out-of-phase sines: never straight, never
      // circling, and free of any state to keep.
      f.e += Math.cos(t * f.speed + f.phase) * 1.4 * dt;
      f.n += Math.sin(t * f.speed * 1.37 + f.phase * 1.7) * 1.4 * dt;

      // Keep them loosely around the player rather than letting them drift off.
      const d = Math.hypot(f.e - player.e, f.n - player.n);
      if (d > 14) {
        f.e += (player.e - f.e) * 0.6 * dt;
        f.n += (player.n - f.n) * 0.6 * dt;
      }

      f.sprite.texture = butterflyTex[Math.floor(t * 9 + f.phase) % 2];
      f.sprite.x = Math.round(f.e * PX_PER_M);
      // Bobbing height above the ground.
      f.sprite.y = Math.round(-f.n * PX_PER_M - 18 - Math.sin(t * 3 + f.phase) * 4);
      f.sprite.zIndex = -f.n + 0.01;
      f.sprite.alpha = Math.min(1, Math.max(0, (16 - d) / 4));
    }
  }

  // ---- water -------------------------------------------------------------
  /**
   * Glints on open water.
   *
   * Sampled against the terrain rather than against the baked chunks: the baker
   * knows where the water is but it has already thrown the answer away into a
   * bitmap, and `soilAt` is the same query the footstep sound and the tripod
   * verdict both use. So a glint can only ever appear where the game agrees
   * there is water.
   *
   * Each one lives a couple of seconds, fades in and out, then re-rolls
   * somewhere else on screen — no state to keep, and nothing to clean up when
   * the player walks away from the lake.
   */
  const glints = [];

  function updateGlints(world, dt) {
    const terrain = world?.terrain;
    if (!terrain) return;

    while (glints.length < MAX_GLINTS) {
      const s = new PIXI.Sprite(glintTex);
      s.anchor.set(0.5, 0.5);
      s.blendMode = 'add';
      s.visible = false;
      container.addChild(s);
      glints.push({ sprite: s, life: 0, ttl: 0, e: 0, n: 0 });
    }

    const view = camera.viewRect(2);
    for (const g of glints) {
      g.life += dt;
      if (g.life >= g.ttl) {
        // Re-roll. One sample per frame per glint, not a search: on a screen
        // with no water they simply stay hidden, which costs nothing.
        const e = view.minE + Math.random() * (view.maxE - view.minE);
        const n = view.minN + Math.random() * (view.maxN - view.minN);
        if (terrain.soilAt(e, n).id !== 'AGUA') {
          g.sprite.visible = false;
          g.life = 0;
          g.ttl = 0.25;
          continue;
        }
        g.e = e;
        g.n = n;
        g.life = 0;
        g.ttl = 1.4 + Math.random() * 1.6;
        g.sprite.x = Math.round(e * PX_PER_M);
        g.sprite.y = Math.round(-n * PX_PER_M);
        g.sprite.zIndex = -n;
        g.sprite.visible = true;
      }
      if (!g.sprite.visible) continue;
      // In and out on a single hump, so nothing ever pops.
      const k = g.life / g.ttl;
      g.sprite.alpha = Math.sin(k * Math.PI) * 0.55;
      // A slow drift, as if the surface were moving under it.
      g.sprite.x = Math.round((g.e + Math.sin(t * 0.7 + g.n) * 0.12) * PX_PER_M);
    }
  }

  // ---- public emitters ----------------------------------------------------
  let dustCooldown = 0;

  return {
    /** @param {{player:object, running:boolean, world:object, paused:boolean}} view */
    update(dt, { player, running = false, world = null, paused = false } = {}) {
      t += dt;
      if (!player) return;

      // Plan mode hides this whole container, so everything below is work
      // nobody can see — and worse, the sway would wander to an arbitrary phase
      // while it was hidden and jump on the way back in.
      if (paused) return;

      updateSway(player, world, dt);
      updateButterflies(player, dt);
      updateGlints(world, dt);

      // Dust off the boots, but only when actually running.
      dustCooldown -= dt;
      if (running && player.moving && dustCooldown <= 0) {
        dustCooldown = 0.11;
        spawn(dustTex, player.e + (Math.random() - 0.5) * 0.4, player.n - 0.15, {
          ve: (Math.random() - 0.5) * 0.8,
          vn: -0.5 - Math.random() * 0.4,
          ttl: 0.5,
          grow: 0.9,
          spin: (Math.random() - 0.5) * 3,
        });
      }

      updateParticles(dt);
      void camera;
    },

    /** A monument going into the ground: a puff of dirt at the base. */
    thunk(e, n) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + Math.random();
        spawn(dustTex, e, n, {
          ve: Math.cos(a) * (1.1 + Math.random()),
          vn: Math.sin(a) * (0.5 + Math.random() * 0.5),
          ttl: 0.55,
          grow: 1.2,
          spin: (Math.random() - 0.5) * 5,
        });
      }
    },

    /** An observation landing: a bright ring of sparks out of the target. */
    ping(e, n) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        spawn(sparkTex, e, n, {
          ve: Math.cos(a) * 3.2,
          vn: Math.sin(a) * 3.2,
          ttl: 0.5,
          drag: 5.5,
          grow: -0.4,
        });
      }
    },

    /**
     * A buried corner turning up: a slow upward scatter, distinct from `ping`'s
     * outward ring (a measurement) and `thunk`'s dirt puff (a monument driven
     * in) — this one is neither, it is evidence found in the scrub.
     */
    found(e, n) {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
        spawn(sparkTex, e, n, {
          ve: Math.cos(a) * 0.6,
          vn: Math.sin(a) * 0.6 + 0.9,
          ttl: 0.6,
          drag: 1.6,
          grow: -0.2,
        });
      }
    },

    /** A refusal: a small dark scatter, so a rejected click is never silent. */
    reject(e, n) {
      for (let i = 0; i < 5; i++) {
        spawn(dustTex, e, n, {
          ve: (Math.random() - 0.5) * 1.4,
          vn: 0.6 + Math.random() * 0.5,
          ttl: 0.32,
          grow: 0.4,
        });
      }
    },

    reset() {
      for (const p of particles) retire(p);
      particles.length = 0;
    },

    get stats() {
      return { sway: swayPool.length, particles: particles.length, pooled: spritePool.length, flies: flies.length, glints: glints.length };
    },
  };
}

/** Turn a freshly painted buffer into a nearest-filtered texture. */
function texFrom(PIXI, paint) {
  const pix = paint();
  const canvas = document.createElement('canvas');
  canvas.width = pix.w;
  canvas.height = pix.h;
  canvas.getContext('2d').putImageData(new ImageData(pix.data, pix.w, pix.h), 0, 0);
  return new PIXI.Texture({
    source: new PIXI.CanvasSource({ resource: canvas, scaleMode: 'nearest', autoGenerateMipmaps: false }),
  });
}
