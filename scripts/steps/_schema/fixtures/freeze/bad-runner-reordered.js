// Fixture — src/tests/template-freeze.infra.test.ts, GAP G-3 (Spec 124 Rule 11).
// Same calls as good-runner-order.js, but `preWriteGate` moved to BEFORE
// `staleness.selectMode` — a real phase reorder (the pre_write gate would run
// before the mode/staleness gate decides whether this run is even eligible).
// The RED canary: extractPhaseOrder() must report a DIFFERENT sequence than
// the good fixture, proving the frozen phase_order is reorder-sensitive.
async function runFixturePhase({ descriptor, pool }) {
  const prior = await staleness.readPriorEmit(pool, descriptor);
  await preWriteGate(descriptor, null);
  const gate = await staleness.selectMode({ descriptor, pool, prior });
  const privilege = await write.assertWritePrivileges(pool, descriptor);
  await write.executeWrite(pool, descriptor);
}
