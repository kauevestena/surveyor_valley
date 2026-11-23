// "Bastidores do erro": the hidden panel that explains where the error comes
// from and how it travels to the area.
//
// Hidden rather than on the rail because it is a reference for whoever goes
// looking, not a step of the job: type `erro` anywhere, or press the faint σ in
// the cálculos panel or the debrief. design-notes.md says so; the intro's
// controls page does not.
//
// Two halves. The theory is fixed text, every word of it in the language files.
// The live box runs the player's own kit and survey through `survey/budget.js`
// and puts a prediction beside each misclosure. It never reads the truth: true
// coordinates appear in exactly one place, the debrief, and this panel can be
// opened in the middle of a job.

import { el, table } from './dom.js';
import { t, num, locale } from './i18n.js';
import { specOf } from '../survey/instrument.js';
import { formatRelPrecision, angularTolerance } from '../survey/traverse.js';
import { areaOf } from '../survey/geometry.js';
import { kitTable, traversePrediction, areaSigma } from '../survey/budget.js';

/**
 * Each section is a list of key suffixes under `theory.<section>.`, and the
 * first letter says what the text is: `p` a paragraph, `f` a formula, `n` a
 * note, `o` a numbered step and `l` a bullet. Consecutive `o` or `l` keys
 * share one list. Keeping the layout here as data means a translator only
 * ever touches the language files.
 */
export const SECTIONS = [
  ['path', ['p1', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'n1']],
  ['kinds', ['p1', 'p2', 'p3', 'f1', 'p4', 'n1']],
  ['law', ['p1', 'f1', 'p2', 'l1', 'l2', 'l3', 'l4', 'p3', 'f2', 'n1', 'n2']],
  ['instrument', ['p1', 'p2', 'f1', 'p3', 'f2', 'p4', 'f3', 'p5', 'f4', 'n1', 'n2']],
  ['radial', ['p1', 'f1', 'p2', 'f2', 'f3', 'p3', 'f4', 'p4', 'f5', 'p5', 'n1']],
  ['repeat', ['p1', 'l1', 'l2', 'f1', 'p2']],
  ['traverse', ['p1', 'f1', 'n1', 'p2', 'f2', 'n2', 'p3', 'f3', 'p4', 'f4', 'p5', 'f5', 'n3', 'p6', 'f6', 'n4', 'n5']],
  ['free', ['p1', 'f1', 'p2', 'f2', 'f3', 'n1']],
  ['area', ['f1', 'f2', 'f3', 'p1', 'n1']],
  ['debrief', ['p1', 'f1', 'f2', 'p2', 'n1']],
];

function blocks(section, suffixes) {
  const out = [];
  let list = null;
  for (const s of suffixes) {
    const key = `theory.${section}.${s}`;
    const kind = s[0];
    if (kind === 'o' || kind === 'l') {
      const tag = kind === 'o' ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = el(`${tag}.theory-list`);
        out.push(list);
      }
      list.append(el('li', { text: t(key) }));
      continue;
    }
    list = null;
    if (kind === 'f') out.push(formula(t(key)));
    else if (kind === 'n') out.push(el('p.hint', { text: t(key) }));
    else out.push(el('p', { text: t(key) }));
  }
  return out;
}

/**
 * A formula string, laid out so a narrow screen never breaks an equation in
 * half. Lines are lines; on each, a run of four or more spaces separates
 * equations, and each equation is one unbreakable piece — so on a phone they
 * stack, and on a desktop they sit side by side. Leading spaces are kept, for
 * the continuation lines that are aligned under an `=`.
 */
export const splitFormula = (text) =>
  String(text)
    .split('\n')
    .map((line) => {
      const lead = line.match(/^ */)[0];
      return { lead, parts: line.slice(lead.length).split(/ {4,}/).filter(Boolean) };
    });

const formula = (text) =>
  el(
    'div.formula.theory-formula',
    {},
    splitFormula(text).map(({ lead, parts }) =>
      el(
        'div.formula-line',
        {},
        lead ? el('span.formula-lead', { text: lead }) : null,
        parts.map((p) => el('span.formula-eq', { text: p })),
      ),
    ),
  );

const section = (id, body, open = false) =>
  el(
    'details.theory-section',
    { open, dataset: { section: id } },
    el('summary', { text: t(`theory.${id}.title`) }),
    el('div.theory-body', {}, body),
  );

const stat = (label, value, cls = '') =>
  el(`div.stat${cls}`, {}, el('span.stat-label', { text: label }), el('span.stat-value', { text: value }));

const sec = (v, d = 1) => `${num(v, d)}"`;
const mm = (v, d = 1) => `${num(v, d)} mm`;

// ------------------------------------------------------------------ live --

function liveKit({ kit, twoFace }) {
  return el(
    'div.stats',
    {},
    stat(t('theory.live.instrument'), specOf(kit.instrument)),
    stat(t('theory.live.tripod'), `σ_i = ${mm(kit.tripod.centringSigma_mm)}`),
    stat(t('theory.live.target'), `σ_t = ${mm(kit.target.centringSigma_mm)}`),
    stat(t('theory.live.collimation'), `c = ${sec(kit.instrument.collimationSec ?? 0, 0)}`),
    stat(t('theory.live.twoFace'), t(twoFace ? 'common.yes' : 'common.no')),
  );
}

function liveTable({ kit, twoFace }) {
  const rows = kitTable(kit, { twoFace });
  return el(
    'div.theory-table',
    {},
    table(
      [
        t('theory.live.colD'),
        t('theory.live.colDir'),
        t('theory.live.colCentring'),
        t('theory.live.colDist'),
        t('theory.live.colTrans'),
        t('theory.live.colPoint'),
        t('theory.live.colPointShort'),
        t('theory.live.colMixed'),
      ],
      rows.map((r) => [
        `${r.d} m`,
        sec(r.dirSec),
        sec(r.centringSec),
        mm(r.distMm),
        mm(r.transDirMm),
        mm(r.pointMm),
        mm(r.pointShortReMm),
        mm(r.mixedFacesMm),
      ]),
    ),
  );
}

function liveTraverse({ kit, twoFace, traverse, requiredPrecision }) {
  const pred = traversePrediction({ traverse, kit, twoFace });
  if (!pred) return el('p.hint', { text: t('theory.live.noTraverse') });

  const absE = Math.abs(traverse.eAngSec);
  const loc = locale();
  // A traverse saved before the tolerance counted centring carries only the
  // instrument's figure; the prediction is the same 2σ worked out here.
  const tol = traverse.tolIncludesCentring ? traverse.tolAngSec : pred.tolPredictedSec;
  const nominal = traverse.tolAngNominalSec ?? angularTolerance(kit.instrument.sigmaDirSec, traverse.nStations);
  return el(
    'div',
    {},
    el(
      'div.stats',
      {},
      stat(t('theory.live.eAng'), sec(traverse.eAngSec), absE <= tol ? '.is-good' : '.is-bad'),
      stat(t('theory.live.tolGame'), `± ${sec(tol)}`),
      stat(t('theory.live.tolNominal'), `± ${sec(nominal)}`),
      stat(t('theory.live.eLin'), `${num(traverse.eLin, 3)} m`),
      stat(t('theory.live.eLinExpected'), `${num(pred.sigmaLin, 3)} m`),
      stat(t('theory.live.relObserved'), formatRelPrecision(traverse.relDenominator, loc)),
      stat(t('theory.live.relExpected'), formatRelPrecision(pred.expectedRelDen, loc)),
      stat(t('theory.live.relRequired'), formatRelPrecision(1 / requiredPrecision, loc)),
    ),
    el('p.hint', {
      text: t('theory.live.eLinSplit', {
        angles: num(pred.sigmaLinFromAngles, 3),
        distances: num(pred.sigmaLinFromDistances, 3),
      }),
    }),
    el(
      'div.theory-table',
      {},
      table(
        [
          t('theory.live.colStation'),
          'd₁',
          'd₂',
          t('theory.live.colBetaDir'),
          t('theory.live.colBetaTripod'),
          t('theory.live.colBetaPrism'),
          'σ_β',
        ],
        pred.stations.map((s) => [
          s.id,
          `${num(s.d1, 1)} m`,
          `${num(s.d2, 1)} m`,
          sec(s.direction),
          sec(s.tripod),
          sec(s.prism),
          sec(s.total),
        ]),
      ),
    ),
    el('p.hint', { text: t('theory.live.traverseNote') }),
  );
}

function liveArea({ ring, ringSigmas }) {
  if (!ring || ring.length < 3 || !ringSigmas || ringSigmas.some((s) => !Number.isFinite(s.perAxis))) {
    return el('p.hint', { text: t('theory.live.noRing') });
  }
  const sigmaA = areaSigma(ring, ringSigmas.map((s) => s.perAxis));
  const area = areaOf(ring).m2;
  let worst = 0;
  for (let i = 1; i < ringSigmas.length; i++) if (ringSigmas[i].total > ringSigmas[worst].total) worst = i;

  return el(
    'div',
    {},
    el(
      'div.stats',
      {},
      stat(t('theory.live.area'), `${num(area, 2)} m²`),
      stat(t('theory.live.sigmaArea'), `± ${num(sigmaA, 2)} m²`),
      stat(t('theory.live.sigmaAreaPct'), `± ${num((sigmaA / area) * 100, 3)} %`),
      stat(
        t('theory.live.worstCorner'),
        `${ring[worst].label || ring[worst].id} · ${mm(ringSigmas[worst].total * 1000)} (${ringSigmas[worst].k}×)`,
      ),
    ),
    el('p.hint', { text: t('theory.live.areaNote') }),
  );
}

function liveBody(live) {
  if (!live?.kit) return [el('p.hint', { text: t('theory.live.noKit') })];
  return [
    el('p', { text: t('theory.live.p1') }),
    el('h5.theory-h', { text: t('theory.live.kitTitle') }),
    liveKit(live),
    el('h5.theory-h', { text: t('theory.live.tableTitle') }),
    liveTable(live),
    el('p.hint', { text: t('theory.live.tableNote') }),
    el('h5.theory-h', { text: t('theory.live.traverseTitle') }),
    liveTraverse(live),
    el('h5.theory-h', { text: t('theory.live.areaTitle') }),
    liveArea(live),
  ];
}

// ----------------------------------------------------------------- panel --

/**
 * @param {object} [live]
 * @param {object} [live.kit]          resolveKit(inventory)
 * @param {boolean} [live.twoFace]
 * @param {object} [live.traverse]     the service's LAST computed traverse; never re-run here
 * @param {number} [live.requiredPrecision]
 * @param {Array}  [live.ring]         surveyed corners, ring order
 * @param {Array}  [live.ringSigmas]   budget.ringSigmas() for the same ring
 */
export function renderTheory(live = {}) {
  return el(
    'div.theory',
    {},
    el('p.notice.notice-muted', { text: t('theory.lead') }),
    SECTIONS.map(([id, suffixes], i) => section(id, blocks(id, suffixes), i === 0)),
    section('live', liveBody(live), Boolean(live?.traverse?.ok)),
  );
}

/** The faint σ that opens the panel from the cálculos panel and the debrief. */
export function theoryPeek(onOpen) {
  return el('button.theory-peek', {
    type: 'button',
    text: 'σ',
    title: t('theory.open'),
    'aria-label': t('theory.open'),
    onclick: () => onOpen?.(),
  });
}

/**
 * The typed code, as a pure matcher so it can be tested without a keyboard.
 * Letters only count while they keep coming: a pause longer than `gapMs`
 * starts the word again, so E, R, R and O pressed minutes apart never add up.
 * Generous on purpose — none of the four letters does anything else in the
 * game, so the only risk worth guarding against is a slow typist on a tablet
 * keyboard, and a laptop with no GPU that is a second late with every key.
 * @returns {(key:string, timeMs:number) => boolean}  true on the last letter
 */
export function makeCodeMatcher(code = 'erro', gapMs = 4000) {
  let typed = '';
  let last = -Infinity;
  return (key, timeMs) => {
    if (typeof key !== 'string' || key.length !== 1) return false;
    if (timeMs - last > gapMs) typed = '';
    last = timeMs;
    typed = (typed + key.toLowerCase()).slice(-code.length);
    if (typed !== code) return false;
    typed = '';
    return true;
  };
}

/**
 * Listen for the code on the whole window.
 *
 * Its own listener, not part of `game/input.js`: that one drops every key
 * while a modal is open, and the panel is meant to open on top of the cálculos
 * as readily as on top of the field. Typing into a text field never counts.
 */
export function watchSecretCode(onOpen, opts = {}) {
  const feed = makeCodeMatcher(opts.code, opts.gapMs);
  const onKey = (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tg = ev.target;
    if (tg instanceof HTMLInputElement || tg instanceof HTMLTextAreaElement || tg?.isContentEditable) return;
    // When the key was PRESSED, not when this handler got round to it: a busy
    // frame (a chunk bake, a long reduction) must not split a word typed at
    // normal speed into letters that look a pause apart.
    if (feed(ev.key, ev.timeStamp || performance.now())) onOpen();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
