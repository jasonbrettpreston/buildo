// Fixture — src/tests/template-freeze.infra.test.ts, GAP G-3 (Spec 124 Rule 11).
// A minimal stand-in for one phase runner's body, in its DECLARED order —
// mirrors the real shape (prior -> gate -> guards -> pre_write -> write).
async function runFixturePhase({ descriptor, pool }) {
  const prior = await staleness.readPriorEmit(pool, descriptor);
  const gate = await staleness.selectMode({ descriptor, pool, prior });
  const privilege = await write.assertWritePrivileges(pool, descriptor);
  await preWriteGate(descriptor, gate);
  await write.executeWrite(pool, descriptor);
}
