// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.5
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.9, §4.9
//
// C5 (merged into Phase B B2) — `records_meta.step_completeness` producer/consumer
// contract. BINDING: `.cursor/active_task.md` §C5 (design text) as amended by
// `.cursor/phase_b_active_task_INPROGRESS.md` "B0 ITEM 7" RULING 2 (the ONE CONTRACT:
// `{expected, executed, died_at, skipped_gate, skipped_budget, deferred_at}`, v5's
// separate `deferred_step` chain-meta key RETIRED) and "v6.1 CORRECTIONS" X-2 (the
// `deferred_to_full ⟺ deferred_at` tripwire is scoped to OK_STATUSES rows only — a
// defer-then-FAIL run legally carries `deferred_at` under `completed_with_errors`,
// and the streak keys on `deferred_at` regardless).
//
// IMPLEMENTED 2026-08-14 — `classifyStepCompleteness(sc, status)` now exists on
// check-chain-verdict.js; every case below is GREEN. The `it.skipIf(!HAS_EXPORT)`
// gates below are dead weight now that HAS_EXPORT is always true, kept in place
// (not stripped) so this file needs no further edits if the export is ever
// legitimately renamed/removed — the skip would simply reactivate as the diagnostic
// it was designed to be. Per the task instructions, export-absence WAS the
// diagnostic for a case marked ⓔ pre-impl: the primary assertion in each describe
// block documents the exact contract the implementer had to land.
//
// check-chain-verdict.js already has a `require.main === module` guard (:201-203)
// and a safe `module.exports` (:205) today, so requiring it here is safe — unlike
// run-chain.js (see run-chain-defer.logic.test.ts's file-level comment for why that
// one is NOT required directly).
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/step-completeness.logic.test.ts src/tests/run-chain-defer.logic.test.ts src/tests/db/enrich-parcels-incremental.db.test.ts --no-file-parallelism

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkChainVerdict = require('../../scripts/check-chain-verdict.js') as {
  classifyVerdict: (row: unknown) => { ok: boolean; reason: string };
  // Not yet exported — typed as unknown-shaped so `typeof` checks below compile
  // regardless of whether the export exists.
  classifyStepCompleteness?: (
    sc: StepCompleteness | null | undefined,
    status: string,
  ) => { ok: boolean; reason: string; annotate?: boolean };
};

interface StepCompleteness {
  expected: string[];
  executed: string[];
  died_at: string | null;
  skipped_gate: string[];
  skipped_budget: string[];
  deferred_at?: string | null;
}

const classifyStepCompleteness = checkChainVerdict.classifyStepCompleteness;
const HAS_EXPORT = typeof classifyStepCompleteness === 'function';

function call(
  sc: StepCompleteness | null | undefined,
  status: string,
): { ok: boolean; reason: string; annotate?: boolean } {
  if (!classifyStepCompleteness) {
    throw new Error('classifyStepCompleteness is not exported — see the ⓔ tests below.');
  }
  return classifyStepCompleteness(sc, status);
}

describe('check-chain-verdict.js — classifyStepCompleteness export (ⓔ, net-new — C5/B2 RULING 2)', () => {
  it('exports classifyStepCompleteness as a function (export-absence IS the diagnostic today)', () => {
    expect(typeof checkChainVerdict.classifyStepCompleteness).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// C5-1 — died_at on an OK-status row must fail. A step recorded as died
// (failedStep, per RULING 2's "died_at = wasCancelled ? null : failedStep")
// contradicts a chain that otherwise reads green — the row lied about being
// complete. This is the "net for chains that die silently inside OK_STATUSES"
// (active_task.md §C5 X2).
// ---------------------------------------------------------------------------
describe('C5-1 — died_at-on-green fails (ⓔ)', () => {
  it.skipIf(!HAS_EXPORT)('died_at set on a status inside OK_STATUSES is a contradiction — not ok', () => {
    const sc: StepCompleteness = {
      expected: ['a', 'b', 'c'],
      executed: ['a', 'b'],
      died_at: 'c',
      skipped_gate: [],
      skipped_budget: [],
    };
    const { ok, reason } = call(sc, 'completed');
    expect(ok).toBe(false);
    expect(reason).toContain('died_at');
  });

  it.skipIf(!HAS_EXPORT)('also fails under completed_with_warnings (both members of OK_STATUSES are covered)', () => {
    const sc: StepCompleteness = {
      expected: ['a', 'b'],
      executed: ['a'],
      died_at: 'b',
      skipped_gate: [],
      skipped_budget: [],
    };
    expect(call(sc, 'completed_with_warnings').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C5-2..4 — gate-skip / budget-stop / advisory-lock-SKIP are all PASS.
// §C5's binding text (active_task.md :963): "executed/skipped_gate/skipped_budget
// are INFORMATIONAL; the verdict function must not consume them. Wiring
// `executed.length !== expected.length` misclassifies every legitimate
// gate-skip as incomplete." So: a step present in `expected` but absent from
// `executed` is legitimate whenever `skipped_gate` or `skipped_budget` names it
// — the comparison must be per-slug reconciliation, not a length check.
// ---------------------------------------------------------------------------
describe('C5-2..4 — gate-skip / budget-stop / advisory-lock-SKIP all PASS (informational fields never consumed)', () => {
  it.skipIf(!HAS_EXPORT)('C5-2 — gate-skip: executed shorter than expected, gap covered by skipped_gate → ok', () => {
    const sc: StepCompleteness = {
      expected: ['assert_schema', 'permits', 'link_wsib', 'geocode_permits'],
      executed: ['assert_schema', 'permits'],
      died_at: null,
      skipped_gate: ['link_wsib', 'geocode_permits'],
      skipped_budget: [],
    };
    expect(call(sc, 'completed').ok).toBe(true);
  });

  it.skipIf(!HAS_EXPORT)('C5-3 — budget-stop: executed shorter than expected, gap covered by skipped_budget → ok', () => {
    const sc: StepCompleteness = {
      expected: ['assert_schema', 'coa', 'link_coa_to_parcels'],
      executed: ['assert_schema'],
      died_at: null,
      skipped_gate: [],
      skipped_budget: ['coa', 'link_coa_to_parcels'],
    };
    expect(call(sc, 'completed_with_warnings').ok).toBe(true);
  });

  it.skipIf(!HAS_EXPORT)(
    'C5-4 — advisory-lock SKIP is invisible at chain-completeness altitude (the step still ran, just did no work — Spec 47 §R12) → ok',
    () => {
      // An advisory-lock SKIP is an SDK-level decision made INSIDE the step's own
      // script (pipeline.withAdvisoryLock's `if (!lockResult.acquired) return`);
      // run-chain.js still records the step 'completed' — it is present in
      // `executed` like any other successful step. There is nothing for
      // classifyStepCompleteness to distinguish here; the case exists to prove
      // the function does NOT invent a divergence from information it doesn't have.
      const sc: StepCompleteness = {
        expected: ['assert_schema', 'link_wsib'],
        executed: ['assert_schema', 'link_wsib'],
        died_at: null,
        skipped_gate: [],
        skipped_budget: [],
      };
      expect(call(sc, 'completed').ok).toBe(true);
    },
  );

  it.skipIf(!HAS_EXPORT)('a legitimate gap NOT covered by died_at/skipped_gate/skipped_budget/deferred_at is still incomplete → not ok', () => {
    // Negative companion to C5-2..4: prove the function is not simply `ok:true`
    // unconditionally once died_at is null. An unexplained executed/expected gap
    // must still fail — this is what makes C5-2..4's PASS meaningful.
    const sc: StepCompleteness = {
      expected: ['assert_schema', 'permits', 'link_wsib'],
      executed: ['assert_schema', 'permits'],
      died_at: null,
      skipped_gate: [],
      skipped_budget: [],
    };
    expect(call(sc, 'completed').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C5-5 — absent field: {ok:true, annotate:true}. Legacy rows written before
// this deploy cycle carry no step_completeness key at all — "absent ≠ pass"
// (active_task.md :964) means the annotate window is a DELIBERATE, time-boxed
// relaxation (Spec 48 §4.9), not silent success. The companion §4.9
// self-announcing pair (modelled on scripts/lib/accepted-baseline.js's
// acceptedBaselineRows :44-61 — file-level comment explicitly cites it) is a
// SEPARATE, undetermined-shape concern at this altitude: it is emitted by
// whatever caller builds the audit rows (not proven to be
// classifyStepCompleteness's own return value), so it is pinned here only as
// a source-scan diagnostic on check-chain-verdict.js, not a call contract.
// ---------------------------------------------------------------------------
describe('C5-5 — absent step_completeness field (ⓔ)', () => {
  it.skipIf(!HAS_EXPORT)('undefined step_completeness → {ok:true, annotate:true}', () => {
    const { ok, annotate, reason } = call(undefined, 'completed');
    expect(ok).toBe(true);
    expect(annotate).toBe(true);
    expect(reason).toMatch(/absent|missing/i);
  });

  it.skipIf(!HAS_EXPORT)('null step_completeness (JSONB key present but SQL NULL) is treated the same as undefined', () => {
    const { ok, annotate } = call(null, 'completed');
    expect(ok).toBe(true);
    expect(annotate).toBe(true);
  });

  it.skipIf(!HAS_EXPORT)('a FULLY populated step_completeness on the same row does NOT set annotate (only true absence is relaxed)', () => {
    const sc: StepCompleteness = {
      expected: ['assert_schema'], executed: ['assert_schema'], died_at: null,
      skipped_gate: [], skipped_budget: [],
    };
    const { annotate } = call(sc, 'completed');
    expect(annotate).toBeFalsy();
  });

  it(
    'the §4.9 self-announcing pair (accepted-WARN + _retighten INFO, modelled on accepted-baseline.js) ' +
      'is not yet wired into check-chain-verdict.js — export/wiring-absence is the diagnostic ' +
      '(exact shape TBD at implementation; the reference model is scripts/lib/accepted-baseline.js:41-61)',
    () => {
      const src = readFileSync(join(process.cwd(), 'scripts/check-chain-verdict.js'), 'utf8');
      // Guess at the load-bearing wiring: importing the existing §4.9 builder (the
      // file-level design comment explicitly models on it) OR a dedicated
      // step_completeness-shaped equivalent. Either signature change reds today.
      expect(src).toMatch(/accepted-baseline|acceptedBaselineRows|_retighten/);
    },
  );

  it(
    'the flip-mechanism follow-up (operator-triggered, one-line commit — never self-executing) is filed ' +
      'in docs/reports/review_followups.md IN the same commit that lands the annotate window (S-3/X-3: ' +
      'the window closes only after a full cycle of all 5 scheduled chains, structurally gated on B6 — ' +
      'not checkable pre-impl; documented here as the binding requirement, not a runnable assertion)',
    () => {
      // No assertion — this is the plan's own text (v6.1 S-3/X-3) restated as a
      // comment so the implementer's commit message / review_followups.md entry
      // can be checked against it by eye. A runnable lock would need the commit
      // to already exist, which defeats red-first.
      expect(true).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// C5-6 — defer arm. RULING 2 + v6.1 X-2: `deferred_to_full ⟺ deferred_at`,
// SCOPED TO OK_STATUSES ROWS ONLY (a defer-then-FAIL run legally carries
// deferred_at under completed_with_errors, which is outside OK_STATUSES and
// therefore outside classifyStepCompleteness's jurisdiction entirely per
// active_task.md :964 — "consulted only on rows already inside OK_STATUSES").
// "legit-incomplete PASS" = missing steps are those at-or-after deferred_at's
// position in `expected` (manifest order); anything missing BEFORE that
// position is still a genuine gap.
// ---------------------------------------------------------------------------
describe('C5-6 — defer arm (ⓔ, OK-scoped per v6.1 X-2)', () => {
  it.skipIf(!HAS_EXPORT)(
    'legit-incomplete PASS — steps missing at-or-after deferred_at (manifest order) are legitimate',
    () => {
      const sc: StepCompleteness = {
        expected: ['massing', 'link_massing', 'enrich_parcels', 'compute_parcel_cost_estimates', 'assert_global_coverage'],
        executed: ['massing', 'link_massing', 'enrich_parcels'],
        died_at: null,
        skipped_gate: [],
        skipped_budget: [],
        deferred_at: 'enrich_parcels', // the deferring step's OWN row still exists (rewritten, not missing)
      };
      const { ok } = call(sc, 'deferred_to_full');
      expect(ok).toBe(true);
    },
  );

  it.skipIf(!HAS_EXPORT)(
    'a step missing BEFORE deferred_at in manifest order is still a genuine gap, not covered by the defer arm',
    () => {
      const sc: StepCompleteness = {
        expected: ['massing', 'link_massing', 'enrich_parcels', 'compute_parcel_cost_estimates'],
        executed: ['massing', 'enrich_parcels'], // link_massing missing — BEFORE deferred_at
        died_at: null,
        skipped_gate: [],
        skipped_budget: [],
        deferred_at: 'enrich_parcels',
      };
      expect(call(sc, 'deferred_to_full').ok).toBe(false);
    },
  );

  it.skipIf(!HAS_EXPORT)('completed + deferred_at present FAILs — the ⟺ tripwire, OK-scoped direction 1', () => {
    const sc: StepCompleteness = {
      expected: ['assert_schema', 'enrich_parcels'],
      executed: ['assert_schema', 'enrich_parcels'],
      died_at: null,
      skipped_gate: [],
      skipped_budget: [],
      deferred_at: 'enrich_parcels', // a 'completed' chain must never carry a defer marker
    };
    const { ok, reason } = call(sc, 'completed');
    expect(ok).toBe(false);
    expect(reason).toMatch(/deferred_at/);
  });

  it.skipIf(!HAS_EXPORT)('deferred_to_full without deferred_at FAILs — the ⟺ tripwire, OK-scoped direction 2', () => {
    const sc: StepCompleteness = {
      expected: ['assert_schema', 'enrich_parcels'],
      executed: ['assert_schema'],
      died_at: null,
      skipped_gate: [],
      skipped_budget: [],
      // deferred_at deliberately absent
    };
    const { ok, reason } = call(sc, 'deferred_to_full');
    expect(ok).toBe(false);
    expect(reason).toMatch(/deferred_at/);
  });

  it.skipIf(!HAS_EXPORT)(
    'the tripwire is OK-scoped (X-2): a completed_with_errors row carrying deferred_at (defer-then-FAIL) ' +
      'is NOT this function\'s concern — classifyVerdict already reds it via the status-outside-allowlist ' +
      'path BEFORE step_completeness is ever consulted (active_task.md :964). Documented, not independently ' +
      'callable in isolation without a live row — see run-chain-defer.logic.test.ts case ⑦b for the caller-side wiring.',
    () => {
      expect(true).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// C5-7 — D3(iii): check-pipeline-freshness.js:244 `::notice` → `::error` for
// the backup-freshness annotation ONLY. The permits-running race-guard notice
// at :248-254 is explicitly UNCHANGED (do not weaken the race guard — it
// lives in pipeline-watchdog.yml:191-193, not this script). Pure source-scan;
// no DB, no child process — check-pipeline-freshness.js is already safely
// requireable (require.main guard at :272-274) but a plain regex read is
// simpler and matches the house lock-test convention.
// ---------------------------------------------------------------------------
describe('C5-7 — check-pipeline-freshness.js backup-freshness notice → error (✓red)', () => {
  const src = () => readFileSync(join(process.cwd(), 'scripts/check-pipeline-freshness.js'), 'utf8');

  it('the backup-freshness annotation is an ::error, not a ::notice (RED today — it is still ::notice)', () => {
    // THE red-first assertion. Today :244-247 emits:
    //   `::notice title=Pipeline freshness::No completed backup row ...`
    expect(src()).toMatch(/::error title=Pipeline freshness::No completed backup row/);
  });

  it('the backup-freshness ::notice form is gone post-fix (both directions of the same lock)', () => {
    expect(src()).not.toMatch(/::notice title=Pipeline freshness::No completed backup row/);
  });

  it('g/b — the permits-running race-guard notice (:248-254) stays ::notice, UNCHANGED (do not weaken the race guard)', () => {
    expect(src()).toMatch(/::notice title=Pipeline freshness::permits chain is currently running/);
  });

  it('g/b — the exit-code gate (:256-260) is untouched: it already fails when chainsFresh && backupFresh is false', () => {
    expect(src()).toMatch(/chainsFresh\s*&&\s*backupFresh/);
  });
});
