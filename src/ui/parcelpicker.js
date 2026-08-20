// Choosing the next job.
//
// Six properties, shown as a board of jobs on offer. The spec asks for the
// player to move from service to service and to be able to reuse control they
// have already established — so the count of reusable monuments is the most
// important number on each card. It is the whole strategy layer: taking the
// neighbouring property while your marcos are still in the ground is worth more
// than taking the biggest one.

import { el } from './dom.js';
import { t, num } from './i18n.js';
import { reusableFor } from '../survey/network.js';
import { estimatePayment, JOB_SWITCH_PENALTY } from '../game/economy.js';
import { fmtDuration } from '../survey/units.js';

/**
 * @param {object} p
 * @param {object} p.modals
 * @param {Array} p.parcels        all six, from the world
 * @param {object} p.state
 * @param {object} p.difficulty
 * @param {(parcelId:string)=>void} p.onChoose
 * @param {boolean} [p.dismissible] false while the player has no active job
 * @param {string|null} [p.activeParcelId] the job in progress, if any — taking
 *   a DIFFERENT card than this one is a switch, and costs money
 * @param {{e:number,n:number}|null} [p.playerPos] for "nearest" badging
 * @param {Set<string>} [p.surveyedIds] every target id measured so far, for
 *   "most already measured" badging
 */
export function showParcelPicker({
  modals,
  parcels,
  state,
  difficulty,
  onChoose,
  dismissible = true,
  activeParcelId = null,
  playerPos = null,
  surveyedIds = new Set(),
}) {
  const done = Object.values(state.parcels || {}).filter((p) => p.status === 'done').length;

  // Badges point at the best reasons to switch, not at every job — so they
  // only compete among jobs that are actually candidates: not finished, and
  // not the one already underway (switching to your own job isn't a choice).
  const candidates = parcels.filter((p) => p.id !== activeParcelId && state.parcels?.[p.id]?.status !== 'done');
  const nearestId = playerPos
    ? candidates.reduce(
        (best, p) => {
          const d = Math.hypot(p.centroid.e - playerPos.e, p.centroid.n - playerPos.n);
          return d < best.d ? { id: p.id, d } : best;
        },
        { id: null, d: Infinity },
      ).id
    : null;
  const mostReadyId = candidates.reduce(
    (best, p) => {
      const n = p.markIds.filter((id) => surveyedIds.has(id)).length;
      return n > best.n ? { id: p.id, n } : best;
    },
    { id: null, n: 0 },
  ).id;

  const body = el('div');
  body.append(
    el('p.hint', { text: t('picker.intro', { done, total: parcels.length }) }),
    el('div.parcel-list', {}, parcels.map((parcel) => card(parcel))),
  );

  const dialog = modals.open({
    title: t('picker.title'),
    body,
    wide: true,
    dismissible,
  });

  function card(parcel) {
    const progress = state.parcels?.[parcel.id];
    const isDone = progress?.status === 'done';
    const reusable = reusableFor(state.network || [], parcel, 150);
    const isSwitch = activeParcelId != null && parcel.id !== activeParcelId && !isDone;

    const badges = [];
    if (parcel.id === nearestId) badges.push(el('span.parcel-badge.parcel-badge-near', { text: t('picker.nearest') }));
    if (parcel.id === mostReadyId) badges.push(el('span.parcel-badge.parcel-badge-ready', { text: t('picker.mostReady') }));

    const node = el(
      `div.parcel-card${isDone ? '.is-done' : ''}`,
      {},
      el(
        'div.parcel-card-head',
        {},
        el('h4', { text: parcel.propertyName }),
        badges.length ? el('div.parcel-badges', {}, badges) : null,
      ),
      el('p.parcel-owner', { text: parcel.owner }),
      el(
        'dl.parcel-facts',
        {},
        el('dt', { text: t('picker.area') }),
        el('dd', { text: `${num(parcel.hectares, 2)} ha` }),
        el('dt', { text: t('picker.vertices') }),
        el('dd', { text: String(parcel.vertices.length) }),
        el('dt', { text: t('picker.pays') }),
        el('dd', { text: `R$ ${num(estimatePayment(parcel, difficulty), 0)}` }),
      ),
    );

    if (reusable.length) {
      node.append(
        el('p.parcel-reuse', {
          text: t('picker.reusable', { n: reusable.length }),
        }),
      );
    }

    if (isSwitch) {
      node.append(
        el('p.parcel-warn', {
          text: t('picker.switchCost', { amount: num(JOB_SWITCH_PENALTY, 0) }),
        }),
      );
    }

    if (isDone) {
      node.append(
        el('p.parcel-done', {
          text: t('picker.completed', {
            time: fmtDuration(progress.elapsedMs || 0),
            paid: num(progress.payment || 0, 0),
          }),
        }),
      );
    } else {
      node.append(
        el('button.btn.btn-primary.parcel-take', {
          type: 'button',
          text: t('picker.take'),
          onclick: () => {
            dialog.close();
            onChoose(parcel.id);
          },
        }),
      );
    }
    return node;
  }

  return dialog;
}

/**
 * The end of the campaign. Six properties surveyed; show what the whole
 * campaign came to rather than just congratulating.
 */
export function showCampaignEnd({ modals, state, parcels, onRestart }) {
  const rows = parcels.map((p) => {
    const prog = state.parcels?.[p.id] || {};
    return [p.propertyName, fmtDuration(prog.elapsedMs || 0), `R$ ${num(prog.payment || 0, 0)}`];
  });

  const body = el('div');
  body.append(
    el('p', { text: t('campaign.body') }),
    el(
      'div.stats',
      {},
      el(
        'div.stat',
        {},
        el('span.stat-label', { text: t('campaign.totalTime') }),
        el('span.stat-value', { text: fmtDuration(state.stats.totalElapsedMs) }),
      ),
      el(
        'div.stat',
        {},
        el('span.stat-label', { text: t('campaign.totalEarned') }),
        el('span.stat-value', { text: `R$ ${num(state.stats.totalEarned, 0)}` }),
      ),
      el(
        'div.stat',
        {},
        el('span.stat-label', { text: t('campaign.kit') }),
        el('span.stat-value', { text: t(`eq.${state.inventory.instrument}`) }),
      ),
    ),
    el(
      'table.tbl',
      {},
      el('thead', {}, el('tr', {}, [t('picker.property'), t('hud.elapsed'), t('picker.pays')].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => el('td', { text: c }))))),
    ),
  );

  return modals.open({
    title: t('campaign.title'),
    body,
    dismissible: false,
    actions: [{ label: t('campaign.restart'), primary: true, onClick: onRestart }],
  });
}
