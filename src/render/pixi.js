// Loading PixiJS.
//
// Pixi comes from a CDN, pinned to an exact version with a Subresource
// Integrity hash. That buys batched WebGL sprite rendering for free, at the
// cost of the one thing a classroom cannot always offer: a working network on
// first load.
//
// So the load is defended three ways, in order:
//
//   1. `index.html` carries `<link rel="modulepreload" integrity=...>`, which
//      is what applies SRI here — a bare dynamic `import()` cannot be checked.
//      The import below then reuses that already-verified response.
//   2. A service worker caches the bundle on first success, so every visit
//      after the first works with no network at all.
//   3. If it still fails, the caller gets a clean, translated explanation
//      instead of a black canvas.
//
// If a fully air-gapped lab ever needs it, drop the bundle at
// `vendor/pixi.min.mjs` BESIDE index.html. Nothing else has to change: the
// loader prefers a local copy whenever one is there.

export const PIXI_VERSION = '8.19.0';
export const PIXI_URL = `https://cdn.jsdelivr.net/npm/pixi.js@${PIXI_VERSION}/dist/pixi.min.mjs`;
export const PIXI_SRI = 'sha384-tzOF3u3ENZL6upupKzzwDX4ZejjfFAIk3YWjgqGaOhyGL5lgC0i4AYng0reLPTwu';

/** Where a vendored copy lives, relative to the PAGE. Absent by default. */
const LOCAL_PATH = './vendor/pixi.min.mjs';

/**
 * The vendored copy's absolute URL.
 *
 * A function resolving against the DOCUMENT, rather than the bare relative
 * string this used to be, and the difference is the whole bug:
 *
 *   `fetch('./vendor/x')`  resolves against the PAGE   -> /vendor/x
 *   `import('./vendor/x')` resolves against THIS MODULE -> /src/render/vendor/x
 *
 * One string used for both silently disagrees. The probe finds the file, the
 * import asks for a path that has never existed, the 404 lands in the same
 * `catch` as "no local copy" — and the one route that cannot be blocked is
 * skipped on every single load. So the air-gapped fallback had never worked and
 * could not have: it failed precisely where there is no network to fall back
 * to, silently, which is the only way this could have gone unnoticed.
 *
 * Computed on call rather than at module load: `document` does not exist under
 * `node --test`, and this module is reachable from `render/scene.js`.
 *
 * @param {string} [base]  the document base. Injectable so a test can check the
 *        resolution without a browser — see `tests/offline.test.mjs`.
 */
export function localPixiUrl(base = document.baseURI) {
  return new URL(LOCAL_PATH, base).href;
}

let PIXI = null;
let loading = null;

/**
 * @returns {Promise<object>} the Pixi namespace
 * @throws {Error} with `.code = 'pixi-unavailable'` when every route failed
 */
export function loadPixi() {
  if (PIXI) return Promise.resolve(PIXI);
  if (loading) return loading;

  loading = (async () => {
    // A vendored copy wins: it is the only route that cannot be blocked.
    try {
      const local = localPixiUrl();

      // A probe that THROWS is not proof of absence. The service worker only
      // intercepts GET, so a HEAD skips the cache entirely — on an offline
      // visit it fails even when the bundle is sitting right there, and the
      // import below, which does go through the cache, would have found it.
      // So a failed probe falls through to the import and lets the cache
      // answer. Only an explicit 404 from a server that did reply skips it,
      // which is what keeps the ordinary load — no vendored copy, network
      // fine — free of a 404 in the console.
      const head = await fetch(local, { method: 'HEAD' }).catch(() => null);
      if (!head || head.ok) {
        PIXI = await import(/* @vite-ignore */ local);
        return PIXI;
      }
    } catch {
      // No local copy. Entirely expected.
    }

    try {
      PIXI = await import(/* @vite-ignore */ PIXI_URL);
      return PIXI;
    } catch (cause) {
      const err = new Error(`PixiJS ${PIXI_VERSION} could not be loaded`);
      err.code = 'pixi-unavailable';
      err.cause = cause;
      loading = null;
      throw err;
    }
  })();

  return loading;
}

/** The namespace, once loaded. Throws rather than returning a half-built scene. */
export function pixi() {
  if (!PIXI) throw new Error('loadPixi() has not resolved yet');
  return PIXI;
}

export const isPixiReady = () => PIXI !== null;
