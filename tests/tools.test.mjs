// The tool rail's gating rules.
//
// `canActivate` is the single description of why a tool can or cannot be used
// right now — the toolbar's disabled state and tooltip both come from it, so a
// wrong branch here is a wrong button in the game with no other symptom. It was
// previously exercised only as a side effect of driving a full service in
// `pipeline.test.mjs`, which never asserted the gating itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeBus, EV } from '../src/core/bus.js';
import { makeTools, TOOL, TOOL_ORDER, PANEL_TOOLS } from '../src/game/tools.js';

/** A context with everything permissive; override per test. */
function makeContext(overrides = {}) {
  return {
    world: {},
    service: {},
    inventory: { marcos: 1 },
    knownOrPlacedMarcos: 2,
    station: { id: 's1' },
    atInstrument: { ok: true },
    observationCount: 1,
    setupCount: 3,
    parcelSurveyed: true,
    ...overrides,
  };
}

function makeToolsWithContext(ctx) {
  const bus = makeBus();
  const tools = makeTools({ getContext: () => ctx, bus, EV });
  return { tools, bus };
}

test('no world or service refuses every tool', () => {
  const { tools } = makeToolsWithContext(makeContext({ world: null, service: null }));
  for (const tool of TOOL_ORDER) {
    assert.deepEqual(tools.canActivate(tool), { ok: false, reasonKey: 'tip.noService' });
  }
});

test('WALK and MAPA are always available', () => {
  const { tools } = makeToolsWithContext(
    makeContext({ inventory: { marcos: 0 }, knownOrPlacedMarcos: 0, station: null, observationCount: 0, setupCount: 0, parcelSurveyed: false }),
  );
  assert.equal(tools.canActivate(TOOL.WALK).ok, true);
  assert.equal(tools.canActivate(TOOL.MAPA).ok, true);
});

test('MARCO is gated on having any monuments left', () => {
  const { tools } = makeToolsWithContext(makeContext({ inventory: { marcos: 0 } }));
  assert.deepEqual(tools.canActivate(TOOL.MARCO), { ok: false, reasonKey: 'tip.noMarcosLeft' });

  const { tools: tools2 } = makeToolsWithContext(makeContext({ inventory: { marcos: 1 } }));
  assert.equal(tools2.canActivate(TOOL.MARCO).ok, true);
});

test('ESTACAO needs at least two known or placed monuments', () => {
  const { tools: t0 } = makeToolsWithContext(makeContext({ knownOrPlacedMarcos: 0 }));
  assert.deepEqual(t0.canActivate(TOOL.ESTACAO), { ok: false, reasonKey: 'tip.needTwoMarcos' });

  const { tools: t1 } = makeToolsWithContext(makeContext({ knownOrPlacedMarcos: 1 }));
  assert.deepEqual(t1.canActivate(TOOL.ESTACAO), { ok: false, reasonKey: 'tip.needTwoMarcos' });

  const { tools: t2 } = makeToolsWithContext(makeContext({ knownOrPlacedMarcos: 2 }));
  assert.equal(t2.canActivate(TOOL.ESTACAO).ok, true);
});

test('VISADA needs a station, and needs the player standing at it', () => {
  const { tools: noStation } = makeToolsWithContext(makeContext({ station: null }));
  assert.deepEqual(noStation.canActivate(TOOL.VISADA), { ok: false, reasonKey: 'tip.needStation' });

  const { tools: notAt } = makeToolsWithContext(makeContext({ atInstrument: { ok: false } }));
  assert.deepEqual(notAt.canActivate(TOOL.VISADA), { ok: false, reasonKey: 'tip.notAtInstrument' });

  const { tools: at } = makeToolsWithContext(makeContext({ atInstrument: { ok: true } }));
  assert.equal(at.canActivate(TOOL.VISADA).ok, true);
});

test('CADERNETA needs at least one recorded observation', () => {
  const { tools: none } = makeToolsWithContext(makeContext({ observationCount: 0 }));
  assert.deepEqual(none.canActivate(TOOL.CADERNETA), { ok: false, reasonKey: 'tip.noObservations' });

  const { tools: some } = makeToolsWithContext(makeContext({ observationCount: 1 }));
  assert.equal(some.canActivate(TOOL.CADERNETA).ok, true);
});

test('CALCULOS needs at least three setups, exactly at the boundary', () => {
  for (const setupCount of [0, 1, 2]) {
    const { tools } = makeToolsWithContext(makeContext({ setupCount }));
    assert.deepEqual(tools.canActivate(TOOL.CALCULOS), { ok: false, reasonKey: 'tip.needThreeSetups' });
  }
  for (const setupCount of [3, 4]) {
    const { tools } = makeToolsWithContext(makeContext({ setupCount }));
    assert.equal(tools.canActivate(TOOL.CALCULOS).ok, true);
  }
});

test('ENTREGA needs the parcel fully surveyed', () => {
  const { tools: incomplete } = makeToolsWithContext(makeContext({ parcelSurveyed: false }));
  assert.deepEqual(incomplete.canActivate(TOOL.ENTREGA), { ok: false, reasonKey: 'tip.parcelIncomplete' });

  const { tools: done } = makeToolsWithContext(makeContext({ parcelSurveyed: true }));
  assert.equal(done.canActivate(TOOL.ENTREGA).ok, true);
});

test('an unknown tool is refused with its own reason', () => {
  const { tools } = makeToolsWithContext(makeContext());
  assert.deepEqual(tools.canActivate('nonsense'), { ok: false, reasonKey: 'tip.unknownTool' });
});

test('activate() on refusal notifies and does not change the active tool', () => {
  const { tools, bus } = makeToolsWithContext(makeContext({ inventory: { marcos: 0 } }));
  const notifications = [];
  bus.on(EV.NOTIFY, (payload) => notifications.push(payload));

  const verdict = tools.activate(TOOL.MARCO);

  assert.equal(verdict.ok, false);
  assert.equal(tools.active, TOOL.WALK);
  assert.deepEqual(notifications, [{ kind: 'warn', key: 'tip.noMarcosLeft' }]);
});

test('activate() on success for a non-panel tool changes the active tool', () => {
  const { tools, bus } = makeToolsWithContext(makeContext());
  const changes = [];
  bus.on(EV.TOOL_CHANGED, (payload) => changes.push(payload));

  const verdict = tools.activate(TOOL.MARCO);

  assert.equal(verdict.ok, true);
  assert.equal(tools.active, TOOL.MARCO);
  assert.deepEqual(changes, [{ tool: TOOL.MARCO, panel: false }]);
});

test('activate() on success for a panel tool leaves the active tool alone', () => {
  const { tools, bus } = makeToolsWithContext(makeContext());
  const changes = [];
  bus.on(EV.TOOL_CHANGED, (payload) => changes.push(payload));
  assert.ok(PANEL_TOOLS.has(TOOL.CADERNETA));

  const before = tools.active;
  const verdict = tools.activate(TOOL.CADERNETA);

  assert.equal(verdict.ok, true);
  assert.equal(tools.active, before, 'a panel tool must not take over the map cursor');
  assert.deepEqual(changes, [{ tool: TOOL.CADERNETA, panel: true }]);
});

test('reset() returns to WALK and announces it', () => {
  const { tools, bus } = makeToolsWithContext(makeContext());
  tools.activate(TOOL.MARCO);
  const changes = [];
  bus.on(EV.TOOL_CHANGED, (payload) => changes.push(payload));

  tools.reset();

  assert.equal(tools.active, TOOL.WALK);
  assert.deepEqual(changes, [{ tool: TOOL.WALK, panel: false }]);
});

test('survey() reports every tool, in order, and isolates the one that is disabled', () => {
  const { tools } = makeToolsWithContext(makeContext({ observationCount: 0 }));
  const report = tools.survey();

  assert.deepEqual(report.map((r) => r.tool), TOOL_ORDER);
  for (const r of report) {
    if (r.tool === TOOL.CADERNETA) {
      assert.equal(r.ok, false);
      assert.equal(r.reasonKey, 'tip.noObservations');
    } else {
      assert.equal(r.ok, true, `${r.tool} should be enabled by this context`);
    }
  }
});
