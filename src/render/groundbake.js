// Ground chunks: bitmaps, textures, and a work queue that never blows a frame.
//
// A 32 m chunk at 16 px/m is a 512x512 bitmap carrying a couple of thousand
// individually stamped tufts of grass. Painting one costs 35-40 ms, which is
// two or three lost frames if it happens inside `render`. Phase 1 did exactly
// that and walking into fresh ground stuttered.
//
// So a bake is a state machine that can be stopped mid-way. `pump(budgetMs)`
// does as much as it can afford and returns; the chunk shows a flat placeholder
// colour until it is finished. Nothing ever waits for a whole chunk, and the
// queue is sorted by distance from the camera so what you are looking at
// resolves first.

import { PX_PER_M } from './pixbuf.js';
import { classGrid, groundFields, paintBase, paintDetail, paintFurrows, shadeField, detailRows, CLASS_IDS } from './groundpaint.js';
import { buildGroundSprites } from './sprites/index.js';
import { GROUND } from './palette.js';
import { pixi } from './pixi.js';

const CHUNK_M = 32;
const MAX_CHUNKS = 64;

/** Work stages, in order. */
const STAGE = { GRID: 0, FIELDS: 1, BASE: 2, FURROWS: 3, DETAIL: 4, UPLOAD: 5, DONE: 6 };

/**
 * Output rows per base slice. A slice is the smallest unit of work and always
 * runs, even when the frame has no budget left, so it has to fit inside one
 * frame's budget on its own: 32 rows is about a millisecond and a half here.
 */
const BASE_ROWS = 32;

export function makeGroundBaker(terrain, { chunkMetres = CHUNK_M, pxPerM = PX_PER_M } = {}) {
  const sprites = buildGroundSprites();
  const size = chunkMetres * pxPerM;

  /** key -> {texture, source, canvas, lastUsed} */
  const done = new Map();
  /** key -> job */
  const jobs = new Map();
  let clock = 0;

  const keyOf = (cx, cy) => `${cx},${cy}`;

  function startJob(cx, cy) {
    const originE = cx * chunkMetres;
    const originN = cy * chunkMetres;
    // The grid is allocated here but filled in slices, like everything else.
    const { grid, size: gridSize } = classGrid(terrain, originE, originN, chunkMetres, null, 0, 0);
    return {
      cx,
      cy,
      originE,
      originN,
      grid,
      gridSize,
      /**
       * The shore, the smooth fields and the rest of what every painter of
       * this chunk shares: made once the grid is complete, a step at a time,
       * then read by every slice after.
       */
      fields: null,
      shade: shadeField(originE, originN, chunkMetres),
      buf: new Uint8ClampedArray(size * size * 4),
      stage: STAGE.GRID,
      gridRow: 0,
      row: 0,
      detailRow: 0,
      detailEnd: detailRows(chunkMetres) - 1,
    };
  }

  /**
   * Advance one job. Returns true when it finished this call.
   *
   * Always performs at least one unit of work before consulting the clock.
   * Checking the deadline first means that if the frame has already overrun
   * when `pump` is called, the queue does nothing at all — and a chunk that
   * never finishes is a hole in the world that never fills in.
   */
  function advance(job, deadline) {
    do {
      switch (job.stage) {
        case STAGE.GRID: {
          const end = job.gridRow + 32;
          const r = classGrid(terrain, job.originE, job.originN, chunkMetres, job.grid, job.gridRow, end);
          job.gridRow = end;
          if (r.done) {
            // Once, not once per slice: the shore field used to be rebuilt
            // inside every base slice because `paintBase` was called without it.
            job.fields = groundFields(
              job.grid, job.gridSize, job.originE, job.originN, chunkMetres,
              null, job.shade, { deferred: true },
            );
            job.stage = STAGE.FIELDS;
          }
          break;
        }
        case STAGE.FIELDS: {
          // A field at a time: all of them at once is several milliseconds.
          const step = job.fields.work.shift();
          if (step) step();
          if (!job.fields.work.length) job.stage = STAGE.BASE;
          break;
        }
        case STAGE.BASE: {
          const end = Math.min(size, job.row + BASE_ROWS);
          paintBase(
            job.buf, job.grid, job.gridSize, job.originE, job.originN,
            chunkMetres, pxPerM, job.row, end, job.shade, null, job.fields,
          );
          job.row = end;
          if (job.row >= size) job.stage = STAGE.FURROWS;
          break;
        }
        case STAGE.FURROWS: {
          paintFurrows(job.buf, job.grid, job.gridSize, job.originE, job.originN, chunkMetres, pxPerM, sprites, job.fields);
          job.stage = STAGE.DETAIL;
          break;
        }
        case STAGE.DETAIL: {
          const end = Math.min(job.detailEnd, job.detailRow + 9);
          paintDetail(
            job.buf, job.grid, job.gridSize, job.originE, job.originN,
            chunkMetres, pxPerM, sprites, job.detailRow, end, job.fields,
          );
          job.detailRow = end + 1;
          if (job.detailRow > job.detailEnd) job.stage = STAGE.UPLOAD;
          break;
        }
        case STAGE.UPLOAD: {
          upload(job);
          job.stage = STAGE.DONE;
          return true;
        }
        default:
          return true;
      }
    } while (performance.now() < deadline);
    return false;
  }

  function upload(job) {
    const PIXI = pixi();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').putImageData(new ImageData(job.buf, size, size), 0, 0);

    const source = new PIXI.CanvasSource({
      resource: canvas,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
    });
    done.set(keyOf(job.cx, job.cy), {
      texture: new PIXI.Texture({ source }),
      source,
      canvas,
      lastUsed: ++clock,
    });
    jobs.delete(keyOf(job.cx, job.cy));
    evict();
  }

  /** Drop the least recently used chunks once the cache is over budget. */
  function evict() {
    while (done.size > MAX_CHUNKS) {
      let oldestKey = null;
      let oldest = Infinity;
      for (const [k, v] of done) {
        if (v.lastUsed < oldest) {
          oldest = v.lastUsed;
          oldestKey = k;
        }
      }
      if (!oldestKey) return;
      done.get(oldestKey).source.destroy();
      done.delete(oldestKey);
    }
  }

  /**
   * The flat colour to show while a chunk is still baking.
   *
   * Sampling the middle of the chunk is enough: it is on screen for a few
   * frames, and a plausible green beats a hole in the world.
   */
  const placeholderCache = new Map();
  function placeholder(cx, cy) {
    const k = keyOf(cx, cy);
    let c = placeholderCache.get(k);
    if (c !== undefined) return c;
    const soil = terrain.soilAt((cx + 0.5) * chunkMetres, (cy + 0.5) * chunkMetres);
    c = GROUND[soil.id]?.base ?? GROUND[CLASS_IDS[0]].base;
    placeholderCache.set(k, c);
    return c;
  }

  return {
    chunkMetres,
    size,

    /** The finished texture, or null while it bakes. Requesting queues it. */
    get(cx, cy) {
      const k = keyOf(cx, cy);
      const hit = done.get(k);
      if (hit) {
        hit.lastUsed = ++clock;
        return hit.texture;
      }
      if (!jobs.has(k)) jobs.set(k, startJob(cx, cy));
      return null;
    },

    placeholder,

    /**
     * Spend up to `budgetMs` baking, nearest chunk to (e, n) first.
     * @returns {number} jobs still outstanding
     */
    pump(budgetMs, e = 0, n = 0) {
      if (!jobs.size) return 0;
      const deadline = performance.now() + budgetMs;

      const queue = [...jobs.values()].sort((a, b) => {
        const da = (a.originE + chunkMetres / 2 - e) ** 2 + (a.originN + chunkMetres / 2 - n) ** 2;
        const db = (b.originE + chunkMetres / 2 - e) ** 2 + (b.originN + chunkMetres / 2 - n) ** 2;
        return da - db;
      });

      for (const job of queue) {
        if (performance.now() >= deadline) break;
        advance(job, deadline);
      }
      return jobs.size;
    },

    /**
     * Bake to completion, ignoring the budget.
     * Used behind the intro modal, where a 200 ms pause costs nothing and
     * arriving to a fully painted valley is worth a great deal.
     */
    bakeNow(cx, cy) {
      const k = keyOf(cx, cy);
      if (done.has(k)) return done.get(k).texture;
      const job = jobs.get(k) || startJob(cx, cy);
      jobs.set(k, job);
      while (job.stage !== STAGE.DONE) advance(job, Infinity);
      return done.get(k)?.texture ?? null;
    },

    invalidateAll() {
      for (const v of done.values()) v.source.destroy();
      done.clear();
      jobs.clear();
      placeholderCache.clear();
    },

    get stats() {
      return { baked: done.size, queued: jobs.size };
    },
  };
}
