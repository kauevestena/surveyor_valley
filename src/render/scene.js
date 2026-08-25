// The Pixi scene.
//
// Replaces the Phase 1 immediate-mode renderer. Three things changed, and each
// one was a measured problem:
//
//   * Visible entities come from `world.spatial`, the uniform hash grid that
//     already existed and that the old renderer never touched. It scanned all
//     ~2000 entities every frame, allocated a fresh array and sorted it.
//   * Sprites are POOLED. A container child is reused frame to frame and simply
//     re-pointed at a different texture, so a walk across the valley allocates
//     nothing.
//   * Ground chunks are textures, not per-frame pixel work.
//
// The world container is laid out in BASE PIXELS (16 per metre) and scaled by an
// integer. Everything inside therefore lands on exact pixel boundaries, which is
// the whole reason the art stays crisp.

import { PX_PER_M } from './pixbuf.js';
import { DETAIL_ZOOM } from './camera.js';
import { KIND } from '../world/entities.js';
import { SIZES } from './sprites/nature.js';
import { buildingSortNorthing } from './sprites/built.js';
import { pixi } from './pixi.js';
import { OCCUPY_RADIUS } from '../game/service.js';
import { warmPass, P } from './palette.js';
import { UI, tintOf } from './tokens.js';

/**
 * The vignette, open at midday and closed at both ends of the day.
 *
 * Small numbers: this is a frame, not a mood. Past about 0.3 the corners of a
 * 40-hectare valley go to mud and the player loses the scenery they are meant
 * to be surveying.
 */
const VIGNETTE_DAY = 0.10;
const VIGNETTE_EDGE = 0.28;

/**
 * The cloud shadow: how dark, and how fast it crosses.
 *
 * Both small on purpose. This is a change in the light, not a set-dressing
 * element the player should ever look at directly — if you notice the cloud
 * rather than the valley going briefly dim, it is too strong or too quick.
 * Drift is in base pixels per second, and the two axes are deliberately not a
 * round ratio so the pattern does not visibly repeat on a diagonal.
 */
const CLOUD_ALPHA = 0.18;
const CLOUD_DRIFT_E = 11;
const CLOUD_DRIFT_N = 3.4;

/**
 * How far the 256-pixel cloud tile is stretched.
 *
 * The world container is in base pixels at 16 per metre, so the tile at 1:1
 * would be sixteen metres across — a cloud the size of a garden.
 *
 * At 3 the tile spans 48 m, which puts a cloud at roughly twenty metres across:
 * bigger than the default zoom's forty-metre view would make legible if it were
 * any larger. Tried at 6 first, and a cloud then filled more than the whole
 * screen — the shadow EDGE never appeared, so it read as the picture dimming
 * rather than as weather going over. What sells this is seeing the edge cross.
 */
const CLOUD_SCALE = 3;

/**
 * A previously-measured survey target, tinted gold — the same job as the
 * plan-view's orange→yellow "surveyed" swap, so the colour means the same
 * thing in both views. Flat, no pulse: a memory aid should sit still.
 */
const TINT_SURVEYED = tintOf(UI.gold);
const TINT_NONE = 0xffffff;
/** The target under the reticle: a lift, not a colour. */
const TINT_HOVER = 0xfff0c8;

/**
 * How long a target takes to turn gold once it has been measured.
 *
 * The flip used to happen on the same frame as the spark, as a hard colour
 * swap — so the single most important event in the game read as a glitch beside
 * its own particle effect. A fifth of a second is enough to see it happen
 * without holding anything up.
 */
const SURVEYED_FADE = 0.2;

/** Which painted size bucket an entity's continuous scale belongs in. */
function sizeBucket(scale = 1) {
  let best = 0;
  for (let i = 1; i < SIZES.length; i++) {
    if (Math.abs(SIZES[i] - scale) < Math.abs(SIZES[best] - scale)) best = i;
  }
  return best;
}

const spriteKeyFor = (ent) => {
  switch (ent.kind) {
    case KIND.ARVORE:
      return `tree-${ent.variant % 8}-${sizeBucket(ent.scale)}`;
    case KIND.ARBUSTO:
      return `bush-${ent.variant % 6}-${sizeBucket(ent.scale)}`;
    case KIND.ROCHA:
      return `rock-${ent.variant % 5}-${sizeBucket(ent.scale)}`;
    case KIND.POSTE:
      return 'poste';
    case KIND.MARCO_DIVISA:
      return `divisa-${ent.variant % 3}`;
    case KIND.MARCO_JOGADOR:
      return 'marco';
    case KIND.BENFEITORIA:
      return `building-${ent.id}`;
    default:
      return null;
  }
};

export function makeScene({ app, camera, atlas, ground }) {
  const PIXI = pixi();

  // ---- containers ---------------------------------------------------------
  const world = new PIXI.Container();
  const groundLayer = new PIXI.Container();
  const overlayLines = new PIXI.Graphics(); // parcel boundaries and fences
  const sorted = new PIXI.Container();
  const effects = new PIXI.Container();

  /**
   * Cloud shadow, drifting.
   *
   * The one piece of weather in the game, and deliberately the only one: it is
   * pure presentation, so it can never disagree with a sight line or a soil
   * verdict the way rain or fog would be tempted to. A valley whose light never
   * changes reads as a screenshot however good the art is, and a shadow
   * crossing it costs one sprite.
   *
   * Last child of the world container, so it falls across the trees and the
   * crew as well as the ground — a cloud shadow that stopped at the treeline
   * would be a stain on the grass instead.
   */
  const clouds = new PIXI.TilingSprite({ texture: makeClouds(PIXI), width: 1, height: 1 });
  clouds.blendMode = 'multiply';
  clouds.alpha = CLOUD_ALPHA;
  clouds.tileScale.set(CLOUD_SCALE);

  sorted.sortableChildren = true;
  world.addChild(groundLayer, overlayLines, sorted, effects, clouds);
  app.stage.addChild(world);

  // Screen-space light pass: a multiply tint, an additive warmth, and a vignette.
  //
  // The multiply alone can only ever take light away, so an evening painted with
  // it is a darker, browner midday — the sun sets by the valley going muddy. The
  // additive pass is the other half of `lightAt()`, and it is what makes golden
  // hour read as light rather than as dusk arriving early.
  const light = new PIXI.Container();
  const tint = new PIXI.Sprite(PIXI.Texture.WHITE);
  tint.blendMode = 'multiply';
  tint.alpha = 0;
  const warm = new PIXI.Sprite(PIXI.Texture.WHITE);
  warm.blendMode = 'add';
  warm.alpha = 0;
  const vignette = new PIXI.Sprite(makeVignette(PIXI));
  // Enough to frame the scene and draw the eye to the middle; any more and the
  // corners of a 40-hectare valley go to mud. Varied through the day below.
  vignette.alpha = VIGNETTE_DAY;
  light.addChild(tint, warm, vignette);
  app.stage.addChild(light);

  // ---- pools --------------------------------------------------------------
  /** chunk key -> Sprite */
  const chunkSprites = new Map();
  /** Reusable entity sprites; index into `sorted.children`. */
  const entityPool = [];
  let entityUsed = 0;

  function takeEntitySprite() {
    let s = entityPool[entityUsed];
    if (!s) {
      s = new PIXI.Sprite();
      s.anchor.set(0, 0);
      entityPool.push(s);
      sorted.addChild(s);
    }
    entityUsed++;
    s.visible = true;
    return s;
  }

  // ---- ground -------------------------------------------------------------
  function drawGround(w) {
    const cm = ground.chunkMetres;
    const view = camera.viewRect(cm);
    const minCx = Math.floor(view.minE / cm);
    const maxCx = Math.floor(view.maxE / cm);
    const minCy = Math.floor(view.minN / cm);
    const maxCy = Math.floor(view.maxN / cm);

    const live = new Set();

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const originE = cx * cm;
        const originN = cy * cm;
        if (
          originE + cm < w.bounds.minE || originE > w.bounds.maxE ||
          originN + cm < w.bounds.minN || originN > w.bounds.maxN
        ) continue;

        const key = `${cx},${cy}`;
        live.add(key);
        let sp = chunkSprites.get(key);
        if (!sp) {
          sp = new PIXI.Sprite();
          // Base pixels; N up in the world means the chunk's TOP edge is its
          // highest northing.
          sp.x = originE * PX_PER_M;
          sp.y = -(originN + cm) * PX_PER_M;
          groundLayer.addChild(sp);
          chunkSprites.set(key, sp);
        }

        const tex = ground.get(cx, cy);
        if (tex) {
          if (sp.texture !== tex) {
            sp.texture = tex;
            sp.tint = TINT_NONE;
            sp.width = cm * PX_PER_M;
            sp.height = cm * PX_PER_M;
          }
        } else if (sp.texture !== PIXI.Texture.WHITE) {
          // Still baking: a plausible flat green beats a hole in the world.
          sp.texture = PIXI.Texture.WHITE;
          sp.tint = parseInt(ground.placeholder(cx, cy).slice(1), 16);
          sp.width = cm * PX_PER_M;
          sp.height = cm * PX_PER_M;
        }
      }
    }

    // Retire chunks that have scrolled away, so the display list stays small.
    for (const [key, sp] of chunkSprites) {
      if (live.has(key)) continue;
      sp.destroy();
      chunkSprites.delete(key);
    }
  }

  // ---- parcel boundaries and fences ---------------------------------------
  function drawLines(w, activeParcelId, now) {
    overlayLines.clear();

    for (const parcel of w.parcels) {
      const active = parcel.id === activeParcelId;
      const pts = parcel.vertices;
      if (pts.length < 3) continue;

      overlayLines.moveTo(pts[0].e * PX_PER_M, -pts[0].n * PX_PER_M);
      for (let i = 1; i < pts.length; i++) {
        overlayLines.lineTo(pts[i].e * PX_PER_M, -pts[i].n * PX_PER_M);
      }
      overlayLines.closePath();

      // The active parcel breathes. A static eight-percent wash was the only
      // "this is the job" marker on the world layer, and at that strength over
      // grass it was easy to lose entirely; a slow pulse costs nothing and the
      // eye finds movement long before it finds a tint.
      if (active) {
        const breath = 0.08 + 0.035 * (0.5 + 0.5 * Math.sin(now * 1.5));
        overlayLines.fill({ color: tintOf(UI.gold), alpha: breath });
      }
      overlayLines.stroke({
        width: active ? 3 : 1.5,
        color: active ? tintOf(UI.accent) : tintOf(UI.woodDark),
        alpha: active ? 0.95 : 0.3,
      });
    }

    // Fences: two rails with a shadow under them. A single hairline reads as a
    // scratch on the grass rather than as something you cannot walk through —
    // and a fence the player cannot see is a fence they will walk into.
    for (const ent of w.entities) {
      if (ent.kind !== KIND.CERCA || !ent.seg) continue;
      const trace = (dy) => {
        overlayLines.moveTo(ent.seg[0][0] * PX_PER_M, -ent.seg[0][1] * PX_PER_M + dy);
        for (let i = 1; i < ent.seg.length; i++) {
          overlayLines.lineTo(ent.seg[i][0] * PX_PER_M, -ent.seg[i][1] * PX_PER_M + dy);
        }
      };
      trace(3);
      overlayLines.stroke({ width: 2, color: tintOf(UI.ink), alpha: 0.25 });
      trace(-6);
      overlayLines.stroke({ width: 2, color: tintOf(P.wood[1]), alpha: 1 });
      trace(-11);
      overlayLines.stroke({ width: 2, color: tintOf(P.wood[2]), alpha: 1 });
    }
  }

  // ---- everything that stands up ------------------------------------------
  const visible = [];

  /**
   * Which frame of the surveyor to draw.
   *
   * The kneel used to be chosen by "is a station set up at all", and a setup
   * survives for the rest of the job — so from the first tripod onwards the
   * surveyor slid around the entire valley permanently crouched, legs frozen
   * mid-fold. Kneeling is a thing you do AT the instrument, so it is now
   * decided by where the player actually is.
   *
   * "At the instrument" is `OCCUPY_RADIUS`, imported rather than restated. This
   * used to carry its own copy of the rule at twice the distance, which put a
   * whole metre-wide ring around every tripod where the surveyor was drawn
   * crouched over an instrument the game would not let her sight through.
   *
   * Standing still resolves to the idle breath rather than to walk frame 0,
   * which is what stopped the sprite looking like a photograph.
   */
  function characterKey(p, station) {
    if (station && !p.moving) {
      const sE = station.trueE ?? station.E;
      const sN = station.trueN ?? station.N;
      if (Math.hypot(sE - p.e, sN - p.n) <= OCCUPY_RADIUS) {
        // She crouches facing the instrument, so the side is whichever way it
        // lies from her. Standing exactly on it resolves east, arbitrarily but
        // stably — a tie that flickered would be worse than a tie that picks.
        const side = sE < p.e ? 'W' : 'E';
        return p.idleFrame ? `char-kneel-${side}-idle` : `char-kneel-${side}`;
      }
    }
    if (p.moving) return `char-${p.facing}-${p.frame % 4}`;
    return p.idleFrame ? `char-${p.facing}-idle` : `char-${p.facing}-0`;
  }

  /**
   * Which frame of Ligeirinho to draw.
   *
   * The same rule as the player's minus the kneel, which is hers alone: the
   * tribrach is at her end of the sight and he is at the other, holding the
   * pole. He carries it in every frame, so there is no separate planted pose to
   * paint — standing still with the prism up IS the idle.
   */
  function assistantKey(a) {
    if (a.moving) return `aux-${a.facing}-${a.frame % 4}`;
    return a.idleFrame ? `aux-${a.facing}-idle` : `aux-${a.facing}-0`;
  }

  /**
   * Which frame of a resident to draw.
   *
   * They never move, so their whole animation is a breath and where they are
   * looking. Both are computed here rather than stored on the entity: a person
   * on a doorstep is pure presentation, and `world/` has no business holding a
   * facing that only exists because somebody walked past.
   *
   * The breath is offset per person by their own position, or six neighbours
   * would inhale in unison across the valley, which reads as machinery.
   */
  const BREATH_SLOT = 0.8;
  const BREATH_PATTERN = [0, 0, 1];
  /** Near enough for them to have noticed you. */
  const NOTICE_RADIUS = 14;

  function residentPose(ent, playerState, now) {
    let dir = 'S';
    if (playerState) {
      const dE = playerState.e - ent.e;
      const dN = playerState.n - ent.n;
      if (Math.hypot(dE, dN) <= NOTICE_RADIUS) {
        dir = Math.abs(dN) >= Math.abs(dE) ? (dN > 0 ? 'N' : 'S') : dE > 0 ? 'E' : 'W';
      }
    }
    const phase = now + ent.e * 0.37 + ent.n * 0.11;
    const breath = BREATH_PATTERN[Math.floor(phase / BREATH_SLOT) % BREATH_PATTERN.length];
    return { dir, breath };
  }

  function residentKey(ent, playerState, now) {
    const { dir, breath } = residentPose(ent, playerState, now);
    return `${ent.look || 'owner-m0'}-${dir}-${breath ? 'idle' : '0'}`;
  }

  /**
   * How far to the side of their person the pet sits.
   *
   * Just outside the owner's own silhouette — a 24-pixel figure is 1.5 m wide —
   * and a little to the south, so the existing `zIndex = -n` sort draws the
   * animal in front of the person with no special case for it.
   */
  const PET_OFFSET = 0.85;
  const PET_FORWARD = 0.2;

  /**
   * The cat or dog at an owner's side.
   *
   * Driven from the owner's OWN pose rather than from a pose of its own: they
   * turn together to watch you come up the track, and they breathe on the same
   * beat. Two figures near each other that blink out of step read as two
   * sprites; in step, they read as a pair.
   */
  function petKey(ent, dir, breath) {
    if (!ent.pet) return null;
    return `${ent.pet}-${ent.petVariant ?? 0}-${dir}-${breath ? 'idle' : '0'}`;
  }

  /**
   * Which frame of a farm animal to draw.
   *
   * Walking is the crew's contract exactly — four frames off a walk phase
   * driven by ground covered. Standing still is NOT the crew's: a grazing
   * animal alternates head-down and head-up on the same breath pattern a
   * person breathes on, so a paddock has cows lifting their heads to look
   * around in it rather than six statues facing the same way.
   */
  function animalKey(a) {
    if (a.moving) return `${a.species}-${a.variant}-${a.facing}-${a.frame % 4}`;
    return `${a.species}-${a.variant}-${a.facing}-${a.idleFrame ? 'idle' : 'graze'}`;
  }

  /**
   * How gold each measured target is, keyed by entity id.
   *
   * Held here rather than on the entity: `world/` describes a valley, and how
   * far through a colour transition a marker happens to be is pure
   * presentation. Entries are dropped when their entity leaves the screen, so
   * this cannot grow without bound over a long job.
   */
  const goldness = new Map();

  function tintFor(ent, surveyed, hoverId, dt) {
    const measured = Boolean(ent.targetable && surveyed?.has(ent.id));
    let k = goldness.get(ent.id) ?? (measured ? 1 : 0);
    if (measured && k < 1) k = Math.min(1, k + dt / SURVEYED_FADE);
    else if (!measured && k > 0) k = Math.max(0, k - dt / SURVEYED_FADE);
    if (k > 0) goldness.set(ent.id, k);
    else goldness.delete(ent.id);

    // The reticle's target lifts toward white. Applied over the gold rather
    // than instead of it, so hovering something already measured still reads as
    // hovered — otherwise the one class of thing you point at most would be the
    // one class that never responds.
    const base = k > 0 ? mixRgb(TINT_NONE, TINT_SURVEYED, k) : TINT_NONE;
    return ent.id === hoverId ? mixRgb(base, TINT_HOVER, 0.65) : base;
  }

  function drawEntities(w, playerState, station, assistantState, now, surveyed, hoverId, dt, animals = []) {
    const detail = camera.zoom >= DETAIL_ZOOM;
    const view = camera.viewRect(12);
    visible.length = 0;

    // The spatial index turns "what is on screen" from a scan of the whole
    // valley into a walk over a handful of 16 m cells.
    for (const ent of w.spatial.queryRect(view.minE, view.minN, view.maxE, view.maxN)) {
      if (ent.kind === KIND.CERCA) continue; // drawn as lines
      if (!detail && (ent.kind === KIND.ARBUSTO || ent.kind === KIND.ROCHA)) continue;
      // Not yet found: buried in the scrub, and drawn only once the crew has
      // turned it up. `game/discovery.js` clears the flag on the same radius
      // this used to test for itself, so the two cannot disagree any more.
      if (ent.hidden) continue;
      visible.push(ent);
    }

    entityUsed = 0;

    for (const ent of visible) {
      const resident = ent.kind === KIND.MORADOR;
      const pose = resident ? residentPose(ent, playerState, now) : null;
      const key = resident ? `${ent.look || 'owner-m0'}-${pose.dir}-${pose.breath ? 'idle' : '0'}` : spriteKeyFor(ent);
      const frame = key && atlas.get(key);
      if (!frame) continue;
      const sp = takeEntitySprite();
      place(sp, frame, ent.e, ent.n, sortNorthing(ent));
      // Sprites are pooled, so the tint must be reset every frame — otherwise
      // a marker's gold glow leaks onto whatever unrelated entity reuses its
      // sprite next.
      sp.tint = tintFor(ent, surveyed, hoverId, dt);

      if (!resident) continue;
      const petFrame = atlas.get(petKey(ent, pose.dir, pose.breath));
      if (petFrame) {
        place(takeEntitySprite(), petFrame, ent.e + (ent.petSide ?? 1) * PET_OFFSET, ent.n - PET_FORWARD);
      }
    }

    // ---- the farm ----------------------------------------------------------
    // Drawn with `placeActor`, not `place`: these walk, and `place` rounds to
    // the art grid, which is precisely the jitter that function's own comment
    // documents. Culled against the same view rect the entities use, with two
    // metres of margin: a hen is a small sprite, but the margin is sized for
    // the largest animal `LIVESTOCK` can paint rather than for the one `STOCK`
    // happens to plant today.
    for (const a of animals) {
      if (a.e < view.minE - 2 || a.e > view.maxE + 2 || a.n < view.minN - 2 || a.n > view.maxN + 2) continue;
      const af = atlas.get(animalKey(a));
      if (af) placeActor(takeEntitySprite(), af, a.e, a.n);
    }

    // The instrument, when one is set up, and the surveyor.
    if (station) {
      const f = atlas.get('station');
      if (f) place(takeEntitySprite(), f, station.trueE ?? station.E, station.trueN ?? station.N);
    }

    const cf = atlas.get(characterKey(playerState, station)) || atlas.get('char-S-0');
    if (cf) placeActor(takeEntitySprite(), cf, playerState.e, playerState.n);

    if (assistantState) {
      const af = atlas.get(assistantKey(assistantState)) || atlas.get('aux-S-0');
      if (af) placeActor(takeEntitySprite(), af, assistantState.e, assistantState.n);
    }

    // Park the leftovers rather than destroying them; next frame may want them.
    for (let i = entityUsed; i < entityPool.length; i++) entityPool[i].visible = false;
  }

  /**
   * Stretch the cloud layer over whatever is on screen and drift it.
   *
   * The tile offset is anchored to WORLD coordinates rather than to the sprite,
   * so the shadow stays over the same patch of ground while the camera pans —
   * clouds that slid with the viewport would read as a smear on the lens.
   */
  function drawClouds(now) {
    const view = camera.viewRect(4);
    clouds.x = Math.round(view.minE * PX_PER_M);
    clouds.y = Math.round(-view.maxN * PX_PER_M);
    clouds.width = Math.ceil((view.maxE - view.minE) * PX_PER_M);
    clouds.height = Math.ceil((view.maxN - view.minN) * PX_PER_M);
    // `tilePosition` is measured in tile space, which `tileScale` then blows up
    // — so both the world anchor and the drift have to be divided by it, or the
    // shadow slides eight times too fast and detaches from the ground.
    clouds.tilePosition.x = (-clouds.x + now * CLOUD_DRIFT_E) / CLOUD_SCALE;
    clouds.tilePosition.y = (-clouds.y + now * CLOUD_DRIFT_N) / CLOUD_SCALE;
  }

  /**
   * Where an entity sorts, which is not always where it stands. Only buildings
   * differ, because only they are painted below their own coordinate.
   */
  function sortNorthing(ent) {
    if (ent.kind !== KIND.BENFEITORIA || !ent.seg || ent.seg.length < 3) return ent.n;
    return buildingSortNorthing(ent.seg);
  }

  /**
   * Position one sprite. Rounded to whole BASE pixels: the container scale is an
   * integer, so a rounded base pixel is an exact screen pixel and the sprite
   * never lands between two of them.
   *
   * Right for scenery, which does not move: its pixels stay aligned with the
   * ground's. Wrong for anyone walking — see `placeActor`.
   */
  function place(sprite, frame, e, n, sortN = n) {
    sprite.texture = frame.texture;
    sprite.x = Math.round(e * PX_PER_M - frame.w * frame.ax);
    sprite.y = Math.round(-n * PX_PER_M - frame.h * frame.ay);
    // Far things are drawn first, so a tree to the south overlaps one to the
    // north. That single rule is what gives a top-down scene any depth at all.
    //
    // `sortN` defaults to the position, which is right for everything whose
    // sprite stands ON its own coordinate. A building does not — see
    // `buildingSortNorthing`.
    sprite.zIndex = -sortN;
    // Sprites are pooled and reused frame to frame, so a tint has to be given
    // a default here — otherwise the station or the player could inherit the
    // gold "already measured" glow left behind by whichever marker last held
    // this same pooled sprite. Callers that want the tint override it after.
    sprite.tint = TINT_NONE;
  }

  /**
   * Position someone who is moving. Rounded to a whole SCREEN pixel rather than
   * a whole base pixel — at zoom 64 those differ by a factor of four.
   *
   * A walking figure is drawn from an interpolated position against a camera
   * that is itself moving, and its position on screen is the difference of the
   * two. Round both to the art grid and that difference is not monotonic: the
   * surveyor slid forward, hung, then twitched back a base pixel — four screen
   * pixels at the closest zoom — which is what read as jitter. Quantizing to the
   * finest thing the display actually has leaves a one-pixel wobble, and one
   * pixel at 60 Hz is invisible.
   *
   * Scenery keeps `place`. Only the people move, so only the people need this,
   * and a static sprite off the art grid is the shimmer this file guards against.
   */
  function placeActor(sprite, frame, e, n) {
    const k = camera.scale;
    sprite.texture = frame.texture;
    sprite.x = Math.round((e * PX_PER_M - frame.w * frame.ax) * k) / k;
    sprite.y = Math.round((-n * PX_PER_M - frame.h * frame.ay) * k) / k;
    sprite.zIndex = -n;
    sprite.tint = TINT_NONE;
  }

  // ---- frame --------------------------------------------------------------
  let lastNow = 0;

  function render(view) {
    const {
      world: w,
      player,
      assistant,
      activeParcelId,
      station,
      light: lightState,
      now = 0,
      surveyed,
      hoverId = null,
      animals = [],
    } = view;

    // Seconds since the previous frame, for anything that eases. Taken from the
    // scene clock the caller already advances rather than from the wall clock,
    // so a transition holds still while a dialog is open exactly as the crew
    // does — and cannot leap when the tab comes back from the background.
    const dt = Math.max(0, Math.min(0.1, now - lastNow));
    lastNow = now;

    if (!w) {
      world.visible = false;
      return;
    }

    // Plan mode draws on the overlay canvas instead; hiding the world container
    // is both correct and free.
    if (camera.planMode) {
      world.visible = false;
      light.visible = false;
      return;
    }

    world.visible = true;
    light.visible = true;

    const k = camera.scale;
    const off = camera.containerOffset();
    world.scale.set(k);
    world.x = off.x;
    world.y = off.y;

    drawGround(w);
    drawLines(w, activeParcelId, now);
    drawEntities(w, player, station, assistant, now, surveyed, hoverId, dt, animals);
    drawClouds(now);

    // Light pass, in screen space.
    for (const sp of [tint, warm, vignette]) {
      sp.width = camera.vw;
      sp.height = camera.vh;
    }
    if (lightState) {
      const [r, g, b] = lightState.tint;
      tint.tint = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
      tint.alpha = 1;

      const glow = warmPass(lightState);
      if (glow) {
        const [wr, wg, wb] = glow.rgb;
        warm.tint =
          (Math.round(wr * 255) << 16) | (Math.round(wg * 255) << 8) | Math.round(wb * 255);
        warm.alpha = glow.alpha;
      } else {
        warm.alpha = 0;
      }

      // Wide open at midday, closing in at both ends of the day. A constant
      // vignette frames every hour identically, which wastes the one cue that
      // says the light is going.
      const noon = 1 - Math.abs(lightState.t * 2 - 1);
      vignette.alpha = VIGNETTE_EDGE + (VIGNETTE_DAY - VIGNETTE_EDGE) * noon;
    } else {
      tint.alpha = 0;
      warm.alpha = 0;
      vignette.alpha = VIGNETTE_DAY;
    }
  }

  return {
    render,
    world,
    light,
    /**
     * Where `effects.js` hangs its sprites. Inside the sorted container, so a
     * butterfly or a swaying tuft is depth-sorted with the trees rather than
     * floating over everything.
     */
    effectsLayer: sorted,
    /** Chunk textures are the big allocation; a new world must drop them. */
    reset() {
      for (const sp of chunkSprites.values()) sp.destroy();
      chunkSprites.clear();
      overlayLines.clear();
    },
    get stats() {
      return { entities: visible.length, chunks: chunkSprites.size, pool: entityPool.length };
    },

    /**
     * Which frame of the surveyor is being drawn, for tests and probes.
     *
     * Exposed rather than re-derived by the caller: the rule about when the
     * player kneels was wrong for a whole release, and a copy of it in a test
     * would have been wrong in exactly the same way.
     */
    characterKey,
    assistantKey,
    residentKey,
    petKey,
    animalKey,
  };
}

/**
 * A seamlessly tiling field of soft dark blobs, for the cloud shadow.
 *
 * Every blob is drawn nine times, once per wrap of the tile, which is the
 * cheapest way to get a pattern with no visible seam — and a seam is exactly
 * what the eye finds first in something that drifts slowly across the screen.
 */
function makeClouds(PIXI) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);

  // Each cloud is a CLUSTER of offset lobes, not one circle. A single radial
  // gradient reads unmistakably as a polka dot however soft its edge is; four
  // overlapping ones read as a shape with no particular geometry, which is what
  // a cloud shadow is.
  //
  // Mostly clear sky between them on purpose. A pattern that covered the tile
  // evenly would not be weather passing over the valley — it would be a
  // permanent dimming of everything, which is strictly worse than no clouds.
  //
  // Fixed rather than random: the sky must not differ between two sessions of
  // the same job, like every other archetype in the renderer.
  const CLOUDS = [
    { x: 0.20, y: 0.26, a: 0.95, lobes: [[0, 0, 0.17], [0.13, -0.05, 0.13], [-0.12, 0.06, 0.11], [0.06, 0.10, 0.10], [0.22, 0.05, 0.08]] },
    { x: 0.70, y: 0.20, a: 0.72, lobes: [[0, 0, 0.13], [-0.10, -0.05, 0.10], [0.09, 0.04, 0.09], [0.02, -0.10, 0.07]] },
    { x: 0.44, y: 0.62, a: 0.88, lobes: [[0, 0, 0.15], [0.12, 0.04, 0.11], [-0.11, -0.04, 0.10], [0.04, -0.10, 0.08]] },
    { x: 0.88, y: 0.74, a: 0.62, lobes: [[0, 0, 0.11], [0.09, 0.04, 0.085], [-0.08, 0.02, 0.07]] },
    { x: 0.06, y: 0.82, a: 0.70, lobes: [[0, 0, 0.12], [0.10, -0.04, 0.09], [-0.07, 0.05, 0.075]] },
  ];

  for (const cloud of CLOUDS) {
    for (const [dx, dy, lobeR] of cloud.lobes) {
      // Every lobe is drawn nine times, once per wrap of the tile. That is the
      // cheapest way to a pattern with no seam, and a seam is the first thing
      // the eye finds in something that drifts slowly across the screen.
      for (let wx = -1; wx <= 1; wx++) {
        for (let wy = -1; wy <= 1; wy++) {
          const cx = (cloud.x + dx + wx) * S;
          const cy = (cloud.y + dy + wy) * S;
          const r = lobeR * S;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, `rgba(96,104,120,${cloud.a})`);
          g.addColorStop(0.55, `rgba(96,104,120,${cloud.a * 0.66})`);
          g.addColorStop(1, 'rgba(96,104,120,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Linear filtering, deliberately — the one texture in the game that must NOT
  // be nearest-sampled. It is a gradient blown up several times, and pixel-snapping
  // a soft shadow would give it a staircase edge.
  return new PIXI.Texture({
    source: new PIXI.CanvasSource({ resource: canvas, addressMode: 'repeat' }),
  });
}

/** Blend two 24-bit colours, for tints that ease rather than switch. */
function mixRgb(a, b, k) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * k) << 16) |
    (Math.round(ag + (bg - ag) * k) << 8) |
    Math.round(ab + (bb - ab) * k)
  );
}

/** A soft radial darkening at the edges. Cheap, and it frames the scene. */
function makeVignette(PIXI) {
  // 256 stretched across a 2560-pixel viewport is a ten-times blow-up of an
  // 8-bit gradient, which bands visibly in the corners.
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.72);
  g.addColorStop(0, 'rgba(20,26,16,0)');
  g.addColorStop(1, 'rgba(20,26,16,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: canvas }) });
}
