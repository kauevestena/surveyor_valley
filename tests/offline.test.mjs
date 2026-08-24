// The offline guarantee.
//
// PixiJS comes from a CDN, which is the one thing that could stop this game
// working in the classroom it was written for. The mitigation is a service
// worker that caches everything on first load — and a mitigation nobody checks
// is not a mitigation.
//
// The failure this catches is silent and nasty: a service worker only sees
// requests made after it takes control, so the module imports issued during the
// very first page load never pass through it. Precache the entry point alone
// and the second, offline visit gets a styled shell, a working renderer, and no
// game at all — with no error anywhere. Adding a module and forgetting the list
// reproduces exactly that, months later, on somebody else's machine.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localPixiUrl } from '../src/render/pixi.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

/** The `CORE` array's string literals, in order. */
function precached() {
  const start = sw.indexOf('const CORE = [');
  assert.ok(start > 0, 'sw.js must declare a CORE precache list');
  const end = sw.indexOf('];', start);
  return [...sw.slice(start, end).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

test('every shipped module and stylesheet is precached for offline use', () => {
  const listed = new Set(precached().map((p) => p.replace(/^\.\//, '')));

  const onDisk = [
    'index.html',
    ...walk('src').filter((f) => f.endsWith('.js')),
    ...walk('styles').filter((f) => f.endsWith('.css')),
    // The logo is on screen before the player has clicked anything — the HUD
    // wears the pixel one and the intro the vector one — so a second, offline
    // visit showing two broken-image icons is exactly the silent failure the
    // rest of this file exists to catch.
    ...walk('assets').filter((f) => /\.(svg|png)$/.test(f)),
  ];

  const missing = onDisk.filter((f) => !listed.has(f));
  assert.deepEqual(
    missing,
    [],
    `these files ship but would not be available offline — add them to CORE in sw.js:\n  ${missing.join('\n  ')}`,
  );

  // And nothing listed that no longer exists, which would make `install` retry
  // a 404 on every visit.
  const real = new Set(onDisk);
  const stale = [...listed].filter((f) => f !== '' && f !== 'index.html' && !real.has(f));
  assert.deepEqual(stale, [], `CORE lists files that are gone: ${stale.join(', ')}`);
});

test('the Pixi pin, its integrity hash and the cached URL all agree', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const loader = readFileSync(join(ROOT, 'src/render/pixi.js'), 'utf8');

  const urlIn = (text) => (text.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/pixi\.js@[^'"\s]+/) || [])[0];
  const htmlUrl = urlIn(html);
  const swUrl = urlIn(sw);
  const loaderVersion = (loader.match(/PIXI_VERSION = '([^']+)'/) || [])[1];

  assert.ok(htmlUrl, 'index.html must preload the Pixi bundle');
  assert.equal(swUrl, htmlUrl, 'the service worker must cache the exact URL the page loads');
  assert.ok(htmlUrl.includes(`@${loaderVersion}/`), `pixi.js version pin disagrees: html=${htmlUrl}, loader=${loaderVersion}`);

  // Subresource Integrity only applies through the modulepreload; a dynamic
  // import cannot carry it. Losing the attribute silently drops the check.
  assert.match(html, /rel="modulepreload"/, 'the preload is what applies SRI — do not remove it');
  assert.match(html, /integrity="sha384-[A-Za-z0-9+/=]+"/, 'the Pixi preload must carry an SRI hash');
  assert.match(html, /crossorigin="anonymous"/, 'SRI on a cross-origin preload requires crossorigin');

  // A floating range cannot be pinned by a hash.
  assert.match(htmlUrl, /@\d+\.\d+\.\d+\//, 'pin an exact version, never a range');
});

/**
 * The last line of defence, and the one that had quietly fallen over.
 *
 * A vendored bundle beside index.html is the only route to Pixi that cannot be
 * blocked — it is what a genuinely air-gapped lab has instead of a CDN and
 * instead of a first successful visit to prime the cache. It was reached by one
 * relative string used for two different things, and the two resolve against
 * different bases:
 *
 *   `fetch('./vendor/x')`  against the PAGE    -> /vendor/x
 *   `import('./vendor/x')` against the MODULE  -> /src/render/vendor/x
 *
 * So the probe passed, the import 404'd, and the 404 landed in the same catch
 * as "there is no local copy" — the fallback was skipped on every load, exactly
 * where there was no network left to fall back to. Nothing said so.
 */
test('a vendored Pixi resolves next to the page, never next to the module', () => {
  const cases = [
    ['https://kauevestena.github.io/surveyor_valley/', 'https://kauevestena.github.io/surveyor_valley/vendor/pixi.min.mjs'],
    ['https://kauevestena.github.io/surveyor_valley/index.html', 'https://kauevestena.github.io/surveyor_valley/vendor/pixi.min.mjs'],
    ['http://localhost:8000/index.html?seed=sv-1a2b3c&start=1', 'http://localhost:8000/vendor/pixi.min.mjs'],
    ['file:///home/aluno/surveyor_valley/index.html', 'file:///home/aluno/surveyor_valley/vendor/pixi.min.mjs'],
  ];

  for (const [base, want] of cases) {
    assert.equal(localPixiUrl(base), want, `resolved wrongly from ${base}`);
    // The specific shape of the old bug: anything under the importing module's
    // own directory is a path that has never existed on disk.
    assert.ok(!localPixiUrl(base).includes('/src/'), `${base}: resolved under src/, where no vendored copy lives`);
  }
});

test('the loader never hands a bare relative path to import()', () => {
  // The rule behind the test above, stated where it can be broken again. A
  // relative specifier means one thing to `fetch` and another to `import`, so
  // inside this module — which does both to the same file — every dynamic
  // import must be given an already-resolved URL.
  //
  // Comments are stripped first, and not as a nicety: the loader's header
  // explains this very bug by quoting `import('./vendor/x')`, so a scan of the
  // raw source flags the documentation that exists to prevent it.
  const loader = readFileSync(join(ROOT, 'src/render/pixi.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  const specifiers = [...loader.matchAll(/\bimport\(\s*([^)]+?)\s*\)/g)].map((m) => m[1]);
  assert.ok(specifiers.length > 0, 'the loader no longer imports Pixi at all');

  for (const spec of specifiers) {
    assert.ok(
      !/^['"`]\./.test(spec),
      `import(${spec}) is relative — it resolves against this module, not the page, so it cannot reach a vendored copy`,
    );
  }

  // And the header has to keep telling somebody where to put the file.
  assert.match(
    readFileSync(join(ROOT, 'src/render/pixi.js'), 'utf8'),
    /vendor\/pixi\.min\.mjs/,
    'the vendored path must be documented in the loader',
  );
});
