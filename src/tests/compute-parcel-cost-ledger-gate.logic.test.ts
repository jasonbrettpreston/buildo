// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.9
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Spec 124 §7 rung — a retirement
//            is stated with its reason, never silently deleted)
//
// Batch-2 row 2.4 (2026-09-21) — RETIRED IN FULL. CPCE-A1 RULED (Spec 124 R-AR.1): the
// Phase-B-B3 run-ledger gate this whole file locked is knowingly-retired as a mechanism —
// `runEnrichPhase` has no `ledgerGatedSkip` call and this step has no lineage-stamp column to
// hold a Layer-2 predicate, so the 2.2 (enrich_heritage) remedy (port a Layer-2 scope predicate)
// is structurally unavailable here. `hasRateOrIndexChanged`, `readCostVersionSignals`'s gate
// role, and `FORCE_FULL_ENV` (FOLD-V3 — its only purpose was bypassing this same gate) no longer
// exist on the frozen shell (scripts/compute-parcel-cost-estimates.js).
//
// Net: 11 cases in this file, ALL retired, 0 re-derived — the largest single retirement in the
// conversion (T7's "no unexplained assertion decrease" rule is satisfied by explanation, not
// exemption). Per-case disposition:
//   C1 #1 (canonical ISO keys stamped run+skip path)        → RETIRED, successor: violations.test.ts
//                                                              (db) test 19 (F9 stamps survive,
//                                                              canonical ISO, both directions)
//   C1 #2 (readCostVersionSignals .toISOString(), MAX(updated_at) not MAX(as_of_date)) → RETIRED,
//                                                              successor: test 19 RED-1
//   C1 #3 (one round-trip query, no torn read)               → RETIRED, successor: test 19 RED-2
//   C1 #4 (main() rebuilds config from the LOCKED read)      → RETIRED, successor: test 19 RED-2
//     (FOLD-V9(2), the binding amendment: the converted form's priced VALUE is now
//     `ctx.config.cost_escalation_index` — hoisted above the lock, LM-D15-validated — not a
//     second in-hook re-read; the atomic co-read fence survives in SUBSTANCE because
//     `readCostContract` still runs inside `pipeline.withAdvisoryLock` (index.js:4497→4767),
//     declared as `deviations[]` in the descriptor, not silently dropped.)
//   C2 all 5 cases (hasRateOrIndexChanged, pure)             → RETIRED, NO SUCCESSOR — the
//     function's SUBJECT (comparing this run's rate/index signals against what the gate's own
//     last completed run stamped) cannot exist once the gate itself is gone; nothing replaces a
//     comparison whose only consumer was the retired gate.
//   C3 #1 (FORCE_FULL_ENV === 'COMPUTE_PARCEL_COST_FORCE_FULL') → RETIRED, successor:
//                                                              violations.test.ts test 15
//     (`descriptor.override.force_full === "none"` + a `deviations[]` entry naming the
//     retirement) — FOLD-V3 corrected the previous fold's guess that this env var would survive
//     under a new name; its only use (`bypassGate`) is gone with the gate.
//   C3 #2 (main() reads process.env[FORCE_FULL_ENV])          → RETIRED, same successor as C3 #1.
//
// Also re-derived in the same commit, NOT in this file: run-chain-defer.logic.test.ts §⑤(c)
// (the C3 cross-reference) and source-version.logic.test.ts's "adoption-lock" (the B3-caller-set
// this file's own C1/C2/C3 comment block named "the one still-unconverted B3 caller" — now empty
// on both directions).

import { describe, it, expect } from 'vitest';

describe('compute-parcel-cost-ledger-gate — RETIRED (batch-2 row 2.4, CPCE-A1)', () => {
  it('the retired functions genuinely no longer exist on the frozen shell (the retirement is not merely asserted in prose)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shell = require('../../scripts/compute-parcel-cost-estimates.js');
    expect(shell.hasRateOrIndexChanged).toBeUndefined();
    expect(shell.readCostVersionSignals).toBeUndefined();
    expect(shell.FORCE_FULL_ENV).toBeUndefined();
    expect(shell.OWN_SLUGS).toBeUndefined();
  });
});
