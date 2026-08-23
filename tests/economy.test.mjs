// Getting paid, and spending it.
//
// `economy.js`'s own header says its functions are "pure functions of plain
// data, so the numbers can be tested without a browser" — this file is that
// promise kept. Previously the module was only exercised indirectly, through
// `pipeline.test.mjs`/`persistence.test.mjs` calling `collectPayment()`, which
// checks that a payment happens, not that its arithmetic is right at the
// boundaries that matter (the time-multiplier tiers, the overtime floor, the
// shop's owned/locked logic, `buy()`'s refusal reasons).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  qualityFrom,
  paymentBreakdown,
  catalogue,
  shopState,
  buy,
  marcoPackPrice,
  MARCO_PACK,
  BASE_PAY_PER_HA,
  CALLOUT,
  estimatePayment,
} from '../src/game/economy.js';
import { TIERS, TRIPODS, TARGETS, MARCOS } from '../src/survey/instrument.js';

const parcel = { hectares: 0.2, propertyName: 'Sítio Teste' };
const difficulty = { payMult: 1 };

function near(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} to be close to ${b}`);
}

test('qualityFrom scores exactly meeting the requirement as 0.5', () => {
  near(qualityFrom(1000, 1000), 0.5);
});

test('qualityFrom rewards beating the requirement and never exceeds 1', () => {
  const twiceAsGood = qualityFrom(500, 1000); // relPrecision is a ratio, smaller is better
  near(twiceAsGood, 0.5 + 1 / 6);
  near(qualityFrom(1, 1000000), 1); // absurdly good, clamped at the ceiling
});

test('qualityFrom clamps at 0 for a survey far outside tolerance', () => {
  near(qualityFrom(100000, 1000), 0);
});

test('qualityFrom treats non-finite or non-positive precision as perfect (no data yet)', () => {
  near(qualityFrom(0, 1000), 1);
  near(qualityFrom(-5, 1000), 1);
  near(qualityFrom(NaN, 1000), 1);
  near(qualityFrom(Infinity, 1000), 1);
});

test('timeMult tier boundaries: under 1h, under 2h, under 3h, and 3h+', () => {
  const cases = [
    [0.999 * 3600000, 1.1],
    [1 * 3600000, 1.0],
    [1.999 * 3600000, 1.0],
    [2 * 3600000, 0.92],
    [2.999 * 3600000, 0.92],
    [3 * 3600000, 0.85],
    [3.5 * 3600000, 0.85],
  ];
  for (const [elapsedMs, expectedMult] of cases) {
    const quality = 0.7;
    const area = Math.round(parcel.hectares * BASE_PAY_PER_HA);
    const qualityMult = 0.6 + 0.6 * quality;
    const gross = CALLOUT + area;
    const afterQuality = gross * qualityMult;
    const expectedTimeLine = Math.round(afterQuality * expectedMult - afterQuality);

    const { lines } = paymentBreakdown({ parcel, quality, elapsedMs, difficulty });
    const timeLine = lines.find((l) => l.key === 'pay.time');
    assert.equal(timeLine.detail.mult, expectedMult, `elapsed ${elapsedMs}ms`);
    assert.equal(timeLine.value, expectedTimeLine, `elapsed ${elapsedMs}ms`);
  }
});

test('qualityMult line matches 0.6 + 0.6*quality at both ends', () => {
  const area = Math.round(parcel.hectares * BASE_PAY_PER_HA);
  const gross = CALLOUT + area;

  const worst = paymentBreakdown({ parcel, quality: 0, elapsedMs: 1.5 * 3600000, difficulty });
  const worstLine = worst.lines.find((l) => l.key === 'pay.quality');
  assert.equal(worstLine.detail.mult, 0.6);
  assert.equal(worstLine.value, Math.round(gross * 0.6 - gross));

  const best = paymentBreakdown({ parcel, quality: 1, elapsedMs: 1.5 * 3600000, difficulty });
  const bestLine = best.lines.find((l) => l.key === 'pay.quality');
  assert.equal(bestLine.detail.mult, 1.2);
  assert.equal(bestLine.value, Math.round(gross * 1.2 - gross));
});

test('no overtime line at all when the job finished on time', () => {
  const { lines, overtimeMs } = paymentBreakdown({ parcel, quality: 0.6, elapsedMs: 3600000, difficulty });
  assert.equal(overtimeMs, 0);
  assert.equal(lines.some((l) => l.key === 'pay.overtime'), false);
});

test('overtime penalty bottoms out at a 0.4 multiplier, however late', () => {
  const threeHoursOver = 3 * 3600000; // well past the 0.4 floor (hit at 1.5h over)
  const { lines } = paymentBreakdown({ parcel, quality: 0.6, elapsedMs: 3600000, difficulty, overtimeMs: threeHoursOver });
  const overtimeLine = lines.find((l) => l.key === 'pay.overtime');
  assert.ok(overtimeLine, 'an overtime line must appear once overtimeMs > 0');
  assert.equal(overtimeLine.detail.mult, 0.4);
});

test('materials are deducted, and the total never goes negative', () => {
  const { lines: withMaterials, total } = paymentBreakdown({
    parcel,
    quality: 0.6,
    elapsedMs: 3600000,
    difficulty,
    marcosUsed: 5,
    marcoUnitPrice: 65,
  });
  const materialsLine = withMaterials.find((l) => l.key === 'pay.materials');
  assert.equal(materialsLine.value, -325);

  const noMaterials = paymentBreakdown({ parcel, quality: 0.6, elapsedMs: 3600000, difficulty });
  assert.equal(noMaterials.lines.some((l) => l.key === 'pay.materials'), false);

  // Materials costing far more than the job could ever gross must floor at 0.
  const { total: flooredTotal } = paymentBreakdown({
    parcel,
    quality: 0.6,
    elapsedMs: 3600000,
    difficulty,
    marcosUsed: 1000,
    marcoUnitPrice: 1000,
  });
  assert.equal(flooredTotal, 0);
  assert.ok(total >= 0);
});

test('estimatePayment is a fixed-assumption wrapper around paymentBreakdown', () => {
  const expected = paymentBreakdown({
    parcel,
    quality: 0.55,
    elapsedMs: 75 * 60 * 1000,
    difficulty,
  }).total;
  assert.equal(estimatePayment(parcel, difficulty), expected);
});

test('catalogue() has one group per slot, matching the instrument spec lengths', () => {
  const groups = catalogue();
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((g) => g.slot),
    ['instrument', 'tripod', 'target'],
  );
  assert.equal(groups.find((g) => g.slot === 'instrument').items.length, TIERS.length);
  assert.equal(groups.find((g) => g.slot === 'tripod').items.length, TRIPODS.length);
  assert.equal(groups.find((g) => g.slot === 'target').items.length, TARGETS.length);
});

test('shopState marks everything below what is owned as superseded, and the owned item as owned', () => {
  const inventory = { instrument: TIERS[1].id, tripod: TRIPODS[0].id, target: TARGETS[0].id };
  const money = 0;
  const [instruments] = shopState(inventory, money);
  assert.equal(instruments.items[0].superseded, true);
  assert.equal(instruments.items[1].owned, true);
  assert.equal(instruments.items[1].superseded, false);
});

test('shopState locks an unaffordable upgrade and unlocks it at exactly its price', () => {
  const inventory = { instrument: TIERS[1].id, tripod: TRIPODS[0].id, target: TARGETS[0].id };
  const price = TIERS[2].price;

  const [tooPoor] = shopState(inventory, price - 1);
  const lockedItem = tooPoor.items[2];
  assert.equal(lockedItem.locked, true);
  assert.equal(lockedItem.affordable, false);

  const [justEnough] = shopState(inventory, price);
  const unlockedItem = justEnough.items[2];
  assert.equal(unlockedItem.locked, false);
  assert.equal(unlockedItem.affordable, true);
});

test('shopState handles nothing owned yet in a slot without crashing', () => {
  const inventory = { instrument: 'not-a-real-item', tripod: 'nope', target: 'nope' };
  const [instruments] = shopState(inventory, 0);
  for (const item of instruments.items) {
    assert.equal(item.superseded, false);
    assert.equal(typeof item.locked, 'boolean');
    assert.equal(typeof item.affordable, 'boolean');
  }
});

test('buy() refuses a downgrade', () => {
  const state = { player: { money: 1000000 }, inventory: { instrument: TIERS[1].id } };
  const result = buy(state, 'instrument', TIERS[0].id);
  assert.deepEqual(result, { ok: false, reason: 'alreadyOwned' });
  assert.equal(state.inventory.instrument, TIERS[1].id, 'the inventory must not change on refusal');
});

test('buy() refuses when the player cannot afford it, and succeeds at exactly the price', () => {
  const target = TIERS[2];
  const short = { player: { money: target.price - 1 }, inventory: { instrument: TIERS[1].id } };
  assert.deepEqual(buy(short, 'instrument', target.id), { ok: false, reason: 'cannotAfford' });

  const exact = { player: { money: target.price }, inventory: { instrument: TIERS[1].id } };
  const result = buy(exact, 'instrument', target.id);
  assert.equal(result.ok, true);
  assert.equal(exact.player.money, 0);
  assert.equal(exact.inventory.instrument, target.id);
});

test('buy() rejects an unknown slot or item', () => {
  const state = { player: { money: 1000000 }, inventory: {} };
  assert.deepEqual(buy(state, 'nonsense', 'x'), { ok: false, reason: 'unknownSlot' });
  assert.deepEqual(buy(state, 'instrument', 'nonsense'), { ok: false, reason: 'unknownItem' });
});

test('buy() on the marcos slot adds a full pack and charges its price', () => {
  const price = marcoPackPrice();
  assert.equal(price, Math.round(MARCOS[0].unitPrice * MARCO_PACK));

  const poor = { player: { money: price - 1 }, inventory: { marcos: 0 } };
  assert.deepEqual(buy(poor, 'marcos', 'estaca-mad'), { ok: false, reason: 'cannotAfford' });

  const rich = { player: { money: price }, inventory: { marcos: 3 } };
  const result = buy(rich, 'marcos', 'estaca-mad');
  assert.equal(result.ok, true);
  assert.equal(rich.inventory.marcos, 3 + MARCO_PACK);
  assert.equal(rich.player.money, 0);
});
