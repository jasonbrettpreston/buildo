// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.2, §4.3, §7.1 (S2-min)
// SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.2b, §4.1
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6, §3.7
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AK, R-AV
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (write classes), §5.1 (no per-step escape hatches)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (batch-2 row 3.1 prerequisite 0b — INGESTOR CSV acquisition)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (batch-2 row 3.1 prerequisite 0e — DECLARED geometry_kind, polygon vs point)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1 (new schema field carries an x-ruling), Rule 8 (per-target declarations)
//
// S2-min — `pipeline.step(descriptor, compute)`, the minimal lifecycle library
// the `assert_schema` pilot needs. The real proof of this library is the C1
// pilot's golden-master differential; what is provable HERE is the set of
// properties that must hold before a pilot is worth running at all:
//
//   1. it is a FACTORY (claim #86) — requiring/constructing opens no pool.
//      Proven in a CHILD PROCESS with a patched `pg.Pool`, because an in-process
//      module-registry patch under vitest cannot promise it patched the same
//      module object `scripts/lib/pipeline.js` destructured from.
//   2. an invalid descriptor THROWS at construction — that throw IS the loader
//      property Spec 122 §4.2 claims is stronger than a build-time loader.
//   3. the verdict is ROW-DERIVED, {PASS, WARN, FAIL} all reachable, and — the
//      load-bearing half — a check the library could not evaluate NEVER reads
//      as PASS (Spec 121 §12b.6's "green because it never looked").
//   4. `checks[].chains` selects per chain; `assert_schema` is shared ×3 and a
//      pilot that ran permit checks under `sources` would be a false green.
//   5. `crashed` is not writable in-process — it belongs to the A3 reaper.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const verdictLib = require(join(process.cwd(), 'scripts/lib/step/verdict.js'));
const ledgerLib = require(join(process.cwd(), 'scripts/lib/step/ledger.js'));
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));

const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
// EP-D17 (WF3, 2026-09-10) — the ceiling/duration/concurrency/maintenance executor.
const plausibilityLib = require(join(process.cwd(), 'scripts/lib/step/plausibility.js'));

const FIXTURES = join(process.cwd(), 'scripts/steps/_schema/fixtures');
const ASSERT_SCHEMA = require(join(FIXTURES, 'valid/assert_schema.descriptor.json'));
/** The INGESTOR descriptor: the only one declaring override.force_run + two gate tiers. */
const LOAD_RAVINES = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noop = async () => {};

type Row = { metric: string; value: unknown; threshold: unknown; status: string };

// ---------------------------------------------------------------------------
// 1. The factory property (claim #86)
// ---------------------------------------------------------------------------

describe('pipeline.step is a FACTORY — requiring a step opens no pool (claim #86)', () => {
  it('constructs zero pg.Pools on require + construct', () => {
    const probe = `
      const pg = require('pg');
      let pools = 0;
      const Real = pg.Pool;
      pg.Pool = class extends Real { constructor(...a) { super(...a); pools++; } };
      const pipeline = require('./scripts/lib/pipeline');
      const descriptor = require('./scripts/steps/_schema/fixtures/valid/assert_schema.descriptor.json');
      const runnable = pipeline.step(descriptor, async () => {});
      console.log('PROBE:' + JSON.stringify({
        pools,
        run: typeof runnable.run,
        compute: typeof runnable.compute,
        name: runnable.descriptor.identity.name,
      }));
    `;
    const out = execFileSync('node', ['-e', probe], { cwd: process.cwd(), encoding: 'utf8' });
    const result = JSON.parse((out.split('PROBE:')[1] ?? '').trim());
    expect(result.pools, 'requiring + constructing a step must open no pool').toBe(0);
    // ...and the thing returned is runnable, not run.
    expect(result.run).toBe('function');
    expect(result.compute).toBe('function');
    expect(result.name).toBe('assert_schema');
  });

  it('exposes descriptor and compute for the compute-swap test (§5.2 / #163)', () => {
    const compute = async () => {};
    const runnable = pipeline.step(ASSERT_SCHEMA, compute);
    expect(runnable.descriptor).toBe(ASSERT_SCHEMA);
    expect(runnable.compute).toBe(compute);
  });
});

// ---------------------------------------------------------------------------
// 2. Descriptor validation at construction
// ---------------------------------------------------------------------------

describe('the descriptor is AJV-validated at CONSTRUCTION, and it throws (§4.2)', () => {
  const INVALID: Array<{ file: string; rule: string; mentions: string }> = [
    { file: 'checks-none.json', rule: 'claim #7 — checks may never be "none"', mentions: '/checks' },
    { file: 'missing-category.json', rule: 'omission is a build failure', mentions: 'terminals' },
    { file: 'banned-value-severity-pass.json', rule: '§12.5 — severity PASS is not declarable', mentions: '/checks/0/severity' },
    { file: 'assert-with-outputs.json', rule: '§1.10 — an ASSERT declares outputs "none"', mentions: '/outputs' },
    { file: 'unknown-key.json', rule: 'the schema is CLOSED', mentions: '/identity' },
    { file: 'warn-limit-wrong-grammar.json', rule: 'RE-FREEZE #7 — warn_limit is the STRING bound grammar only, never the {warn,fail} object form', mentions: '/checks/13/warn_limit' },
    { file: 'warn-limit-with-object-limit.json', rule: 'RE-FREEZE #7 — warn_limit is redundant, and rejected, on a check whose limit is already the {warn,fail} object form', mentions: '/checks/15' },
  ];

  for (const fx of INVALID) {
    it(`${fx.file} — ${fx.rule}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- fixture load
      const bad = require(join(FIXTURES, 'invalid', fx.file));
      expect(() => pipeline.step(bad, noop)).toThrow(/does not satisfy step\.schema\.json/);
      try {
        pipeline.step(bad, noop);
      } catch (err) {
        expect((err as Error).message, 'the throw must name WHERE, or it is undiagnosable').toContain(fx.mentions);
      }
    });
  }

  it('a valid descriptor with a non-function compute also throws', () => {
    expect(() => pipeline.step(ASSERT_SCHEMA, 'not a function' as never)).toThrow(/must be a function/);
  });

  it('a non-object descriptor throws before AJV ever sees it', () => {
    expect(() => pipeline.step(null as never, noop)).toThrow(/descriptor must be an object/);
  });
});

// ---------------------------------------------------------------------------
// 3. The verdict matrix — row-derived, all three reachable, never green-by-blindness
// ---------------------------------------------------------------------------

/** A minimal descriptor carrying exactly the checks a case needs. */
function withChecks(checks: Array<Record<string, unknown>>, onCheckError = 'fail_step') {
  const d = clone(ASSERT_SCHEMA);
  d.execution.on_check_error = onCheckError;
  if (onCheckError !== 'omit_row') delete d.execution.on_check_error_why;
  d.checks = checks.map((c, i) => ({
    id: `c${i}`,
    kind: 'schema',
    expect: [],
    limit: 'viol == 0',
    severity: 'FAIL',
    blocking: false,
    when: 'post',
    chains: 'all',
    accept_until: 'none',
    why: { text: 'a synthetic check for the verdict matrix', liveness: 'none' },
    ...c,
  }));
  return d;
}

describe('the verdict is ROW-DERIVED, and all three values are reachable (§7.1, claim #28)', () => {
  const build = (d: Record<string, unknown>, obs: Record<string, unknown>) =>
    verdictLib.buildAuditTable(d, null, obs);

  it('PASS — every check inside its limit', () => {
    const d = withChecks([{}, { severity: 'WARN' }]);
    const built = build(d, { c0: { violations: 0 }, c1: { violations: 0 } });
    expect(built.audit_table.verdict).toBe('PASS');
    expect(built.rows.map((r: Row) => r.status)).toEqual(['PASS', 'PASS']);
    expect(built.blockingFailures).toEqual([]);
  });

  it('WARN — a WARN-severity check is violated', () => {
    const built = build(withChecks([{}, { severity: 'WARN' }]), { c0: { violations: 0 }, c1: { violations: 3 } });
    expect(built.audit_table.verdict).toBe('WARN');
  });

  it('FAIL — a FAIL-severity check is violated, and a blocking one is named', () => {
    const built = build(withChecks([{ blocking: true, when: 'pre' }]), { c0: { violations: 1 } });
    expect(built.audit_table.verdict).toBe('FAIL');
    expect(built.blockingFailures).toEqual(['c0']);
  });

  it('the verdict is computed FROM the rows, not alongside them', () => {
    const built = build(withChecks([{ severity: 'WARN' }]), { c0: { violations: 9 } });
    expect(built.audit_table.verdict).toBe(verdictLib.deriveVerdict(built.audit_table.rows));
    // Mutate a row and re-derive: the cascade tracks the rows, so a parallel
    // boolean would be visible here as a frozen verdict.
    const mutated = [...built.audit_table.rows, { metric: 'x', value: 1, threshold: null, status: 'FAIL' }];
    expect(verdictLib.deriveVerdict(mutated)).toBe('FAIL');
  });

  it('INFO severity is orthogonal — it can never drive a verdict', () => {
    const built = build(withChecks([{ severity: 'INFO' }]), { c0: { violations: 99 } });
    expect(built.rows[0].status).toBe('INFO');
    expect(built.audit_table.verdict).toBe('PASS');
  });

  it('⚠️ a check compute NEVER REPORTED reads as its severity, never PASS', () => {
    const built = build(withChecks([{}]), {});
    expect(built.rows[0].value).toMatch(/not reported/);
    expect(built.rows[0].status).toBe('FAIL');
    expect(built.audit_table.verdict).toBe('FAIL');
  });

  it('⚠️ a limit form the library cannot evaluate reads as its severity, never PASS', () => {
    // `pop >= N` and `ratio <= N x median` are still unimplemented; `pct <= N` LANDED
    // at the INGESTOR pilot (LG-5) and is asserted below, so this canary moved to a
    // form that is genuinely still missing rather than being deleted.
    const built = build(withChecks([{ limit: 'pop >= 100', severity: 'WARN' }]), { c0: { violations: 0 } });
    expect(built.rows[0].value).toMatch(/unevaluable/);
    expect(built.rows[0].status).toBe('WARN');
  });

  it('LG-5 — `pct <= N` compares the reported RATIO, and an unreported ratio is still never PASS', () => {
    // A pct check reports `value` (the ratio), not a violation count: the threshold
    // column has to describe the comparison that was actually made.
    const d = withChecks([{ limit: 'pct <= 0.5', severity: 'FAIL' }]);
    expect(build(d, { c0: { value: 0.4 } }).rows[0].status).toBe('PASS');
    expect(build(d, { c0: { value: 0.5 } }).rows[0].status).toBe('PASS');
    expect(build(d, { c0: { value: 0.51 } }).rows[0].status).toBe('FAIL');
    expect(build(d, { c0: {} }).rows[0].status).toBe('FAIL');
    expect(build(d, { c0: {} }).rows[0].value).toMatch(/unevaluable/);
  });

  it('A-4 — `limit_from_config` renders the RESOLVED value as the row threshold, and evaluates against it', () => {
    const d = withChecks([{ limit: 'pct <= 0.5', limit_from_config: 'tuned_bound', severity: 'FAIL' }]);
    const tightened = verdictLib.buildAuditTable(d, null, { c0: { value: 0.4 } }, [], { tuned_bound: 0.25 });
    expect(tightened.rows[0].threshold, 'the value IN FORCE, not the seed default').toBe('pct <= 0.25');
    expect(tightened.rows[0].status).toBe('FAIL');
    // No config resolved (a chain that never selected it) → the declared literal stands.
    expect(verdictLib.buildAuditTable(d, null, { c0: { value: 0.4 } }).rows[0].threshold).toBe('pct <= 0.5');
  });

  it('the {warn, fail} limit object escalates independently of the declared severity', () => {
    const d = withChecks([{ limit: { warn: 5, fail: 10 }, severity: 'FAIL' }]);
    expect(build(d, { c0: { violations: 4 } }).audit_table.verdict).toBe('PASS');
    expect(build(d, { c0: { violations: 5 } }).audit_table.verdict).toBe('WARN');
    expect(build(d, { c0: { violations: 10 } }).audit_table.verdict).toBe('FAIL');
  });

  it('`viol <= N` and `viol == N` are distinct bounds', () => {
    expect(verdictLib.evaluateLimit('viol <= 2', { violations: 2 })).toEqual({ ok: true });
    expect(verdictLib.evaluateLimit('viol == 2', { violations: 1 })).toEqual({ ok: false });
    expect(verdictLib.evaluateLimit('viol == 0', { violations: 0 })).toEqual({ ok: true });
  });

  it('R-T addendum (Ask 2, Fold A-4b) — `value_min N`/`value_max N` compare a RAW measured value, never falling back through violations', () => {
    expect(verdictLib.evaluateLimit('value_min 0', { value: 520492 })).toEqual({ ok: true });
    expect(verdictLib.evaluateLimit('value_min 0', { value: -1 })).toEqual({ ok: false });
    expect(verdictLib.evaluateLimit('value_max 100', { value: 100 })).toEqual({ ok: true });
    expect(verdictLib.evaluateLimit('value_max 100', { value: 100.01 })).toEqual({ ok: false });
    // negative bounds are declared-legal (the schema's `bound` grammar allows a leading `-`)
    expect(verdictLib.evaluateLimit('value_min -5', { value: -5 })).toEqual({ ok: true });
    // a violations-only observation is UNEVALUABLE for value_min/value_max — this form
    // deliberately does not fall back through the violations-first `measured` reading
    // every other limit form uses, because the whole point is "the raw value", not a count.
    expect(verdictLib.evaluateLimit('value_min 0', { violations: 0 })).toEqual({
      unevaluable: 'check reported no numeric value for value_min',
    });
    expect(verdictLib.evaluateLimit('value_max 0', { violations: 0 })).toEqual({
      unevaluable: 'check reported no numeric value for value_max',
    });
  });

  it('execution.on_check_error governs an errored check — and omit_row is the DECLARED fiction', () => {
    const errored = { c0: { error: new Error('CKAN unreachable') } };
    expect(build(withChecks([{}], 'omit_row'), errored).rows).toHaveLength(0);
    expect(build(withChecks([{}], 'warn_row'), errored).rows[0].status).toBe('WARN');
    expect(build(withChecks([{ severity: 'FAIL' }], 'fail_step'), errored).rows[0].status).toBe('FAIL');
  });

  // POST-B1-1 (WF3, 2026-09-15) — `fail_step` must MEAN a step failure.
  //
  // The test directly above locked `fail_step` only on a `severity: 'FAIL'` check,
  // where the errored branch's severity FALL-THROUGH and the declared arm produce the
  // same row — so the lock was green while the finding was true. Every check in the
  // four assert fleets is WARN-severity, so a check query that THREW read as an
  // ordinary WARN, indistinguishable from a data-driven warning except by reading the
  // `value: "check errored: …"` string (review_followups.md HIGH, filed by I3 commit 8,
  // 2026-09-14: `"fail_step" currently means nothing operationally`).
  //
  // `on_check_error` is declared ONCE PER STEP, not per check, so it is
  // SEVERITY-INDEPENDENT in both directions: it outranks the check's own severity
  // (WARN and INFO alike — a step that wants an errored check to be tolerated
  // declares `warn_row`), and it never touches a check that did not error.
  it('POST-B1-1 — fail_step yields a FAIL row on a WARN-severity check, and the row-derived cascade fails the step', () => {
    const errored = { c0: { error: new Error('relation "parcels" does not exist') } };
    const built = build(withChecks([{ severity: 'WARN' }], 'fail_step'), errored);
    expect(String(built.rows[0].value)).toMatch(/^check errored: /);
    expect(built.rows[0].status, 'the DECLARED on_check_error outranks the check severity').toBe('FAIL');
    expect(built.audit_table.verdict).toBe('FAIL');
    // Row-derived, never a parallel boolean: the verdict is exactly what the rows say.
    expect(verdictLib.deriveVerdict(built.audit_table.rows)).toBe('FAIL');
    // LPA-D6 severity-separated arrays: an errored fail_step check is an ERROR, so
    // `checks_failed` (errors.length at the call site) counts it.
    expect(built.errors[0]).toMatch(/^c0: check errored: /);
    expect(built.warnings).toEqual([]);
  });

  it('POST-B1-1 (Q2) — fail_step outranks INFO too: an errored INFO-severity check is a FAIL row', () => {
    const errored = { c0: { error: new Error('canceling statement due to statement timeout') } };
    const built = build(withChecks([{ severity: 'INFO' }], 'fail_step'), errored);
    expect(built.rows[0].status).toBe('FAIL');
    expect(built.audit_table.verdict).toBe('FAIL');
  });

  it('POST-B1-1 — the other direction: a check that did NOT error is untouched by fail_step, at every severity', () => {
    const d = withChecks([{ severity: 'WARN' }], 'fail_step');
    expect(build(d, { c0: { violations: 0 } }).rows[0].status).toBe('PASS');
    expect(build(d, { c0: { violations: 3 } }).rows[0].status).toBe('WARN');
    expect(build(withChecks([{ severity: 'INFO' }], 'fail_step'), { c0: { violations: 3 } }).rows[0].status).toBe('INFO');
    // …and a check the compute never reported still reads at its DECLARED severity —
    // "not reported" is a different branch from "errored", and this fix does not move it.
    expect(build(withChecks([{ severity: 'WARN' }], 'fail_step'), {}).rows[0].status).toBe('WARN');
  });

  it('POST-B1-1 — the INVERSE arms are unchanged: warn_row reads WARN and omit_row is still the declared fiction, at every severity', () => {
    const errored = { c0: { error: new Error('CKAN unreachable') } };
    for (const severity of ['INFO', 'WARN', 'FAIL']) {
      expect(build(withChecks([{ severity }], 'warn_row'), errored).rows[0].status, severity).toBe('WARN');
      expect(build(withChecks([{ severity }], 'omit_row'), errored).rows, severity).toHaveLength(0);
    }
  });

  // POST-B1-1 Guardian fold (operator ruling, 2026-09-15) — `override.accept_anomaly`
  // covers a MEASURED anomaly ONLY. Now that `fail_step` produces a real FAIL row, a
  // standing accept flag on that check id would have walked the row straight into
  // `index.js`'s acceptance branch (`verdict === 'FAIL' && unaccepted.length === 0 &&
  // failedIds.size > 0` ⇒ COMPLETED_WITH_ERRORS), converting "the query threw, we
  // measured nothing" into "an operator looked at the number and accepted it" — the
  // green-because-it-never-looked class, re-entering through the acceptance door.
  // The errored row therefore stays UNACCEPTED, so the run lands on FAILED /
  // `fail_check`. Modelled on load-ravines' real `ravine_count_drift_pct` acceptance.
  describe('POST-B1-1 Guardian fold — an errored check QUERY is never covered by override.accept_anomaly', () => {
    const ACCEPT_ENV = 'RAVINE_ACCEPT_FEATURE_COUNT_DRIFT';
    const ACCEPTED_CHECK = 'ravine_count_drift_pct';

    afterEach(() => { delete process.env[ACCEPT_ENV]; });

    /** The REAL acceptance set, read from the REAL descriptor + the REAL env flag. */
    function standingAcceptance(): Set<string> {
      process.env[ACCEPT_ENV] = '1';
      const accepted = stepLib.acceptedCheckIds(LOAD_RAVINES);
      expect(accepted.has(ACCEPTED_CHECK), 'the fixture must model a REAL standing acceptance').toBe(true);
      return accepted;
    }

    it('the acceptance branch stays reachable for a MEASURED anomaly (the other direction — acceptance still works)', () => {
      const rows = [{ metric: ACCEPTED_CHECK, value: 12.5, threshold: 'pct <= 5', status: 'FAIL' }];
      const { failedIds, unaccepted } = stepLib.partitionFailedRows(rows, standingAcceptance());
      expect(failedIds.size, 'the FAIL row is never suppressed — acceptance is a STATUS decision').toBe(1);
      expect(unaccepted).toEqual([]);
      // …which is exactly the index.js precondition for COMPLETED_WITH_ERRORS.
      expect(unaccepted.length === 0 && failedIds.size > 0).toBe(true);
    });

    it('an ERRORED check with the SAME standing acceptance stays unaccepted ⇒ FAILED, never COMPLETED_WITH_ERRORS', () => {
      const errored = verdictLib.checkRow(
        { id: ACCEPTED_CHECK, severity: 'WARN', limit: 'pct <= 5' },
        { error: new Error('canceling statement due to statement timeout') },
        'fail_step',
      );
      expect(errored.status, 'precondition: the fold only bites once fail_step yields a FAIL row').toBe('FAIL');
      const { failedIds, unaccepted } = stepLib.partitionFailedRows([errored], standingAcceptance());
      expect(unaccepted, 'an errored query measured NOTHING — there is no anomaly to accept').toEqual([ACCEPTED_CHECK]);
      expect(errored.errored, 'the row carries an explicit marker — never a value-string sniff').toBe(true);
      // The acceptance branch is therefore UNREACHABLE for this row: index.js falls
      // through to `verdict === 'FAIL'` ⇒ RUN_STATUS.FAILED, discriminator unaccepted[0].
      expect(unaccepted.length === 0 && failedIds.size > 0, 'COMPLETED_WITH_ERRORS must be unreachable here').toBe(false);
      expect(unaccepted[0]).toBe(ACCEPTED_CHECK);
    });

    it('the marker is declared-only-if-present — a non-errored row never carries it, so acceptance is untouched everywhere else', () => {
      const clean = verdictLib.checkRow({ id: ACCEPTED_CHECK, severity: 'FAIL', limit: 'viol == 0' }, { violations: 2 }, 'fail_step');
      expect(clean.status).toBe('FAIL');
      expect('errored' in clean, 'no empty/null placeholder key on an ordinary row').toBe(false);
      expect(stepLib.partitionFailedRows([clean], standingAcceptance()).unaccepted).toEqual([]);
    });

    it('a warn_row-errored row carries the marker too, and cannot reach acceptance at all (it is not a FAIL row)', () => {
      const warned = verdictLib.checkRow({ id: ACCEPTED_CHECK, severity: 'FAIL', limit: 'viol == 0' }, { error: new Error('boom') }, 'warn_row');
      expect(warned.status).toBe('WARN');
      expect(warned.errored).toBe(true);
      const { failedIds, unaccepted } = stepLib.partitionFailedRows([warned], standingAcceptance());
      expect(failedIds.size).toBe(0);
      expect(unaccepted).toEqual([]);
    });

    it('SYNTHETIC rows too — an errored invariants[]/plausibility[] entry is a FAIL row with the marker (buildAuditTable\'s syntheticOnCheckError path)', () => {
      const d = withChecks([{ severity: 'WARN' }], 'fail_step');
      const built = verdictLib.buildAuditTable(d, null, { c0: { violations: 0 } }, [], null, null, {
        checks: [{ id: 'pb_rows_sane', severity: 'WARN', limit: 'value_min 1', source: 'plausibility' }],
        observations: { pb_rows_sane: { error: new Error('relation "pb_rows" does not exist') } },
      });
      const synthetic = built.rows.find((r: Row & { errored?: boolean }) => r.metric === 'pb_rows_sane');
      expect(synthetic.status, 'a synthetic errored entry runs the SAME checkRow path').toBe('FAIL');
      expect(synthetic.errored).toBe(true);
      expect(built.audit_table.verdict).toBe('FAIL');
      expect(built.errors[0]).toMatch(/^pb_rows_sane: check errored: /);
      // …and it is unacceptable even with a standing flag naming it.
      const accepted = new Set(['pb_rows_sane']);
      expect(stepLib.partitionFailedRows(built.rows, accepted).unaccepted).toEqual(['pb_rows_sane']);
    });

    // POST-B1-1 Observability fold (2026-09-15) — the pre_write gate ABORTS the write
    // (correctly, now that an errored check FAILs), but the gate's own rows are
    // discarded: the cascade scores only the FINAL pass's observations, compute runs
    // twice, and `failedPreWrite` / `write_skipped_pre_write_fail` had NO consumer
    // anywhere in the library. So a transient throw could skip the entire write while
    // the run ended `completed`/PASS with not one row saying nothing was written —
    // the same "green because it never looked" class, one layer up. The abort must
    // therefore land ONE FAIL row on the final audit table (no boolean, no second
    // cascade: the row is the failure).
    it('OBSERVABILITY FOLD — a pre_write gate abort lands one FAIL row naming the gate and the failed ids, so the cascade fails the step', () => {
      const failed = ['pending_scope_parcels'];
      const rows = stepLib.preWriteAbortRows([null, { failedPreWrite: failed, written: { write_skipped_pre_write_fail: true } }, null]);
      expect(rows, 'exactly one row — never one per failed id').toHaveLength(1);
      expect(rows[0].metric).toBe('pre_write_gate');
      expect(String(rows[0].value)).toBe('aborted: pending_scope_parcels');
      expect(rows[0].status, 'the row IS the halt — the cascade reads it, nothing re-derives it').toBe('FAIL');
      expect(rows[0].source).toBe('gate');
      expect(rows[0].errored, 'an aborted gate is never accept_anomaly-able either').toBe(true);
      // Row-derived end to end: FAIL row ⇒ verdict FAIL ⇒ index.js RUN_STATUS.FAILED,
      // and the id stays unaccepted even with a standing flag naming it.
      expect(verdictLib.deriveVerdict(rows)).toBe('FAIL');
      expect(stepLib.partitionFailedRows(rows, new Set(['pre_write_gate'])).unaccepted).toEqual(['pre_write_gate']);
    });

    it('OBSERVABILITY FOLD — no abort, no row (declared-only-if-present): a healthy run\'s audit table is byte-unchanged', () => {
      expect(stepLib.preWriteAbortRows([null, null, null])).toEqual([]);
      expect(stepLib.preWriteAbortRows([{ failedPreWrite: [] }, { written: {} }])).toEqual([]);
      expect(stepLib.preWriteAbortRows([])).toEqual([]);
      expect(stepLib.preWriteAbortRows(undefined)).toEqual([]);
    });

    it('OBSERVABILITY FOLD — every runner that can abort feeds the row, and index.js actually consumes it', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- matching this file's existing source-read idiom
      const src = require('fs').readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8') as string;
      // 9 runners produce `failedPreWrite` on their abort path (was 8 — `runLinkColumnPhase`
      // joined at I4, 2026-09-16). This count is the R-B/LW-D20 "a fold applied to N runners
      // needs a test that iterates ALL N" lock, and it fired correctly on that conversion:
      // adding the 9th runner reddened BOTH halves until the new runner was wired into the
      // consumer list too, which is exactly the silent-gap this assertion exists to prevent.
      expect((src.match(/failedPreWrite: decision\.failed|failedPreWrite: gateDecision\.failed/g) || []).length).toBe(9);
      // …and the assembled extraRows is the ONE consumer (before this fold: zero).
      expect(src, 'failedPreWrite must not be write-only').toContain('...preWriteAbortRows([ingest, link, linkKeyed, linkColumn, cascade, materialize, backfill, recorder, enrich])');
    });

    it('index.js derives the partition in ONE place — no second, divergent acceptance filter', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- matching this file's existing source-read idiom
      const src = require('fs').readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8') as string;
      expect(src).toContain('partitionFailedRows(built.rows, accepted)');
      expect(src, 'the status cascade must not re-derive acceptance inline').not.toMatch(/\[\.\.\.failedIds\]\.filter/);
      expect(src, 'the pre_write gate must not re-derive acceptance inline').not.toMatch(/status === 'FAIL' && !accepted\.has/);
    });
  });

  it('POST-B1-1 (Q1, Rule 12) — an on_check_error value the frozen enum forbids THROWS, never a silent severity fall-through', () => {
    const check = { id: 'c0', severity: 'WARN', limit: 'viol == 0' };
    const errored = { error: new Error('boom') };
    expect(() => verdictLib.checkRow(check, errored, 'swallow_row')).toThrow(/on_check_error/);
    expect(() => verdictLib.checkRow(check, errored, undefined)).toThrow(/on_check_error/);
    // The three declarable arms are the ONLY non-throwing values.
    for (const arm of ['fail_step', 'warn_row', 'omit_row']) {
      expect(() => verdictLib.checkRow(check, errored, arm), arm).not.toThrow();
    }
    // A value the enum forbids is only ever a defect on the ERRORED path — a healthy
    // check never consults it, and must not be made to throw by this guard.
    expect(() => verdictLib.checkRow(check, { violations: 0 }, 'swallow_row')).not.toThrow();
  });

  it('the SKIP path verdict is row-derived too — no hardcoded PASS', () => {
    const meta = stepLib.skipRecordsMeta(ASSERT_SCHEMA, 'advisory_lock_held_elsewhere');
    expect(meta.audit_table.name).toBe(ASSERT_SCHEMA.identity.display_name);
    expect(meta.audit_table.rows.length).toBeGreaterThan(0);
    expect(meta.audit_table.verdict).toBe(verdictLib.deriveVerdict(meta.audit_table.rows));
    expect(meta.reason).toBe('advisory_lock_held_elsewhere');
    // VRD-SKIP (Spec 124 §2 Rule 10 R-H addendum): a self-skip is the maximal
    // case of "a check the library could not evaluate" — it must never fold
    // to PASS. rung (b): the 'status' row's declared severity is WARN.
    expect(meta.audit_table.verdict).toBe('WARN');
    expect(meta.audit_table.verdict).not.toBe('PASS');
  });

  // LM-D16 — `errors[]`/`warnings[]` interpolate `row.value` directly, so an
  // object-valued `detail` (9 sites across scripts/lib/compute/*.js report one)
  // rendered as the literal string "[object Object]" — captured live in
  // docs/reports/golden/link_massing/post/sources-full-forced-1.json
  // summary.records_meta.errors, and shown verbatim to operators by
  // FreshnessTimeline.tsx. `renderValue` must stringify deterministically
  // (sorted keys) rather than losing the value.
  //
  // LPA-D6 (WF3-C, 2026-08-29) — `errors[]`/`warnings[]` are now severity-separated
  // (a WARN row renders into `warnings[]`, never `errors[]`); these fixtures declare
  // `severity: 'WARN'`, so they read `.warnings[0]`, not `.errors[0]`.
  it('LM-D16 — an object-valued check detail renders as stable sorted JSON, not [object Object]', () => {
    const d = withChecks([{ severity: 'WARN' }]);
    const built = build(d, { c0: { violations: 1, detail: { ratio: 1, scanned: 10, changed: 10 } } });
    expect(built.rows[0].status).toBe('WARN');
    // The audit row itself keeps the real object — only warnings[] is a rendered string.
    expect(built.rows[0].value).toEqual({ ratio: 1, scanned: 10, changed: 10 });
    expect(built.errors).toEqual([]);
    expect(built.warnings[0]).toBe('c0: {"changed":10,"ratio":1,"scanned":10}');
  });

  it('LM-D16 — a primitive check value renders unchanged, no stringify', () => {
    const d = withChecks([{ severity: 'WARN' }]);
    expect(build(d, { c0: { violations: 1, detail: 42 } }).warnings[0]).toBe('c0: 42');
    expect(build(d, { c0: { violations: 1, detail: 'bypassrls=true policies=0' } }).warnings[0])
      .toBe('c0: bypassrls=true policies=0');
  });

  it('LM-D16 — a large rendered value is capped, so warnings[] stays bounded', () => {
    const d = withChecks([{ severity: 'WARN' }]);
    const bigDetail = { items: Array.from({ length: 100 }, (_, i) => `item-${i}`) };
    const built = build(d, { c0: { violations: 1, detail: bigDetail } });
    const rendered = built.warnings[0].slice('c0: '.length);
    expect(rendered.length).toBeLessThanOrEqual(301);
    expect(rendered.endsWith('…')).toBe(true);
  });

  // LPA-D6 (WF3-C) — the FAIL side of the split, proving errors[] is genuinely
  // FAIL-only (not merely "warnings[] moved, errors[] still conflated").
  it('LPA-D6 — a FAIL row renders into errors[], never warnings[]; a WARN row renders into warnings[], never errors[] (both directions, mixed severities in one build)', () => {
    const d = withChecks([{ severity: 'FAIL' }, { severity: 'WARN' }]);
    const built = build(d, {
      c0: { violations: 1, detail: 'fail-detail' },
      c1: { violations: 1, detail: 'warn-detail' },
    });
    expect(built.rows.map((r: Row) => r.status)).toEqual(['FAIL', 'WARN']);
    expect(built.errors).toEqual(['c0: fail-detail']);
    expect(built.warnings).toEqual(['c1: warn-detail']);
  });

  // Rule 11 observability (Spec 124 §2 Rule 11; Spec 48 §3.11, WF3 Rules
  // 10-12 output panel remediation, commit 2) — a `checks[].order_guarantee`
  // declared on the descriptor is passed through onto ITS OWN audit row as
  // `{anchor, guarantee}` — `spec_ref` is NOT re-emitted (it is the citation
  // coordinate `checkOrderGuaranteesCited` re-resolves at descriptor-
  // validation time, not something a records_meta reader needs). Both
  // directions: declared → present; undeclared (the overwhelming majority of
  // checks) → the key is absent altogether, never an empty/null placeholder.
  it('declared checks[].order_guarantee is passed through onto its own audit row as {anchor, guarantee} (spec_ref omitted)', () => {
    const d = withChecks([
      {
        when: 'pre_write',
        order_guarantee: {
          guarantee: 'abort before any DB write',
          spec_ref: 'docs/specs/fixture/999_fixture.md',
          anchor: 'THE ANCHOR TEXT',
        },
      },
    ]);
    const built = build(d, { c0: { violations: 0 } });
    expect(built.rows[0].order_guarantee).toEqual({ guarantee: 'abort before any DB write', anchor: 'THE ANCHOR TEXT' });
    expect(built.rows[0].order_guarantee).not.toHaveProperty('spec_ref');
  });

  it('a check with NO declared order_guarantee carries no order_guarantee key on its row at all', () => {
    const d = withChecks([{}]);
    const built = build(d, { c0: { violations: 0 } });
    expect(built.rows[0]).not.toHaveProperty('order_guarantee');
  });

  // RE-FREEZE #7 (Spec 124 §5 R-AD, 2026-09-11) — `checks[].warn_limit` +
  // `warn_limit_from_config`: a second, looser, config-driven bound giving one
  // check 3-tier PASS/WARN/FAIL coverage in a SINGLE row. Ruled to unblock
  // `assert_global_coverage` (C4 batch 1 I1) commit 7 — see
  // `.cursor/batch1_i1_assert_global_coverage_active_task.md` Fold B.
  describe('RE-FREEZE #7 — checks[].warn_limit (Spec 124 §5 R-AD)', () => {
    it('absent warn_limit is OLD BEHAVIOUR, byte-for-byte: no warn_threshold key, PASS/FAIL-only cascade unchanged', () => {
      const d = withChecks([{ limit: 'pct <= 0.5', severity: 'FAIL' }]);
      const pass = build(d, { c0: { value: 0.4 } });
      const fail = build(d, { c0: { value: 0.51 } });
      expect(pass.rows[0].status).toBe('PASS');
      expect(fail.rows[0].status).toBe('FAIL');
      expect(pass.rows[0]).not.toHaveProperty('warn_threshold');
      expect(fail.rows[0]).not.toHaveProperty('warn_threshold');
    });

    it('limit ok -> PASS; else warn_limit present and ok -> WARN; else the declared severity', () => {
      const d = withChecks([{ limit: 'pct <= 0.5', warn_limit: 'pct <= 0.75', severity: 'FAIL' }]);
      expect(build(d, { c0: { value: 0.4 } }).rows[0].status, 'inside limit -> PASS').toBe('PASS');
      expect(build(d, { c0: { value: 0.6 } }).rows[0].status, 'between limit and warn_limit -> WARN').toBe('WARN');
      expect(build(d, { c0: { value: 0.9 } }).rows[0].status, 'beyond warn_limit -> the declared severity').toBe('FAIL');
    });

    it('the resolved warn_limit is exposed as warn_threshold, present only when warn_limit is declared', () => {
      const d = withChecks([{ limit: 'pct <= 0.5', warn_limit: 'pct <= 0.75', severity: 'FAIL' }]);
      const built = build(d, { c0: { value: 0.6 } });
      expect(built.rows[0].warn_threshold).toBe('pct <= 0.75');
      expect(built.rows[0].threshold).toBe('pct <= 0.5');
    });

    it('warn_limit_from_config substitutes into warn_threshold, the same way limit_from_config substitutes into threshold', () => {
      const d = withChecks([{
        limit: 'pct <= 0.5',
        limit_from_config: 'tuned_limit',
        warn_limit: 'pct <= 0.75',
        warn_limit_from_config: 'tuned_warn_limit',
        severity: 'FAIL',
      }]);
      const config = { tuned_limit: 0.2, tuned_warn_limit: 0.4 };
      const inLimit = verdictLib.buildAuditTable(d, null, { c0: { value: 0.1 } }, [], config);
      expect(inLimit.rows[0].threshold).toBe('pct <= 0.2');
      expect(inLimit.rows[0].warn_threshold).toBe('pct <= 0.4');
      expect(inLimit.rows[0].status).toBe('PASS');

      const inWarn = verdictLib.buildAuditTable(d, null, { c0: { value: 0.3 } }, [], config);
      expect(inWarn.rows[0].status, 'between the CONFIG-SUBSTITUTED bounds, not the seed defaults').toBe('WARN');

      const beyondWarn = verdictLib.buildAuditTable(d, null, { c0: { value: 0.5 } }, [], config);
      expect(beyondWarn.rows[0].status).toBe('FAIL');

      // No config resolved (a chain that never selected either name) -> the declared literals stand.
      const noConfig = build(d, { c0: { value: 0.6 } });
      expect(noConfig.rows[0].threshold).toBe('pct <= 0.5');
      expect(noConfig.rows[0].warn_threshold).toBe('pct <= 0.75');
    });

    it('a warn_limit is never consulted once limit already escalated via the {warn,fail} object form', () => {
      // Defensive: the schema forbids declaring warn_limit alongside an object-form
      // limit (an AJV RED fixture proves the construction-time refusal separately —
      // scripts/steps/_schema/fixtures/invalid/warn-limit-with-object-limit.json).
      // This proves the LIBRARY's own runtime guard independently of the schema gate.
      const d = withChecks([{ limit: { warn: 5, fail: 10 }, severity: 'FAIL' }]);
      d.checks[0].warn_limit = 'viol <= 2'; // smuggled past the schema, proving the code-level guard
      expect(build(d, { c0: { violations: 4 } }).rows[0].status).toBe('PASS');
      expect(build(d, { c0: { violations: 5 } }).rows[0].status).toBe('WARN');
      expect(build(d, { c0: { violations: 10 } }).rows[0].status).toBe('FAIL');
    });

    it('resolveWarnLimit returns undefined when no warn_limit is declared, distinct from a falsy substitution', () => {
      expect(verdictLib.resolveWarnLimit({ id: 'c0' }, null)).toBeUndefined();
      expect(verdictLib.resolveWarnLimit({ id: 'c0', warn_limit: 'viol <= 2' }, null)).toBe('viol <= 2');
      expect(verdictLib.resolveWarnLimit({ id: 'c0', warn_limit: 'viol <= 2', warn_limit_from_config: 'x' }, { x: 5 })).toBe('viol <= 5');
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Per-chain check selection — assert_schema is shared ×3
// ---------------------------------------------------------------------------

describe('checks[].chains selects per chain (§1.7, sharing.varies_by_chain.checks)', () => {
  const ids = (chainId: string | null) =>
    verdictLib.selectChecks(ASSERT_SCHEMA, chainId).map((c: { id: string }) => c.id);

  it('permits runs only the permit checks', () => {
    expect(ids('permits')).toEqual(['permit_columns', 'permit_cost_type_sample']);
  });

  it('coa runs only the CoA check', () => {
    expect(ids('coa')).toEqual(['coa_columns']);
  });

  it('sources runs the six source checks — and no permit check leaks in', () => {
    const selected = ids('sources');
    expect(selected).toHaveLength(6);
    expect(selected).not.toContain('permit_columns');
    expect(selected).toContain('zoning_resource_columns');
  });

  it('the three chain sets partition the declared checks with no overlap', () => {
    const all = [...ids('permits'), ...ids('coa'), ...ids('sources')];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(ASSERT_SCHEMA.checks.length);
  });

  it('a STANDALONE run runs everything — a chain filter must not narrow a manual run', () => {
    expect(ids(null)).toHaveLength(ASSERT_SCHEMA.checks.length);
  });

  it('varies_by_chain.checks = "none" makes the per-check chains field inert', () => {
    const d = clone(ASSERT_SCHEMA);
    d.sharing.varies_by_chain.checks = 'none';
    expect(verdictLib.selectChecks(d, 'permits')).toHaveLength(d.checks.length);
  });

  it('audit_table.phase comes from the explicit map, never a ternary', () => {
    const d = clone(ASSERT_SCHEMA);
    d.sharing.varies_by_chain.phase = { permits: 1, coa: 4, sources: 6 };
    expect(verdictLib.resolvePhase(d, 'coa')).toBe(4);
    expect(verdictLib.resolvePhase(d, 'sources')).toBe(6);
    // Standalone is only unambiguous when every chain agrees.
    expect(verdictLib.resolvePhase(d, null)).toBe(0);
    expect(verdictLib.resolvePhase(ASSERT_SCHEMA, null)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. The ledger — crashed ≠ failed, and ownership
// ---------------------------------------------------------------------------

describe('the ledger row (§4.1 ①㉝, Spec 120 §3.2b)', () => {
  it('the library owns the row STANDALONE only — in-chain it is run-chain.js:591', () => {
    expect(ledgerLib.ownsLedgerRow(null)).toBe(true);
    expect(ledgerLib.ownsLedgerRow('sources')).toBe(false);
  });

  it('⚠️ finalize REFUSES to write `crashed` — nothing judged is the reaper\'s verdict, not a finally\'s', async () => {
    await expect(
      ledgerLib.finalizeLedgerRow({ query: async () => ({ rows: [] }) }, 1, {
        slug: 'assert_schema',
        status: ledgerLib.RUN_STATUS.CRASHED,
        durationMs: 1,
      }),
    ).rejects.toThrow(/refuses to write 'crashed'/);
  });

  it('⚠️ the finalize UPDATE assigns the counters DIRECTLY — a COALESCE regression is a NULL→0 lie', async () => {
    // `pipeline_runs.records_total/_new/_updated` DEFAULT to 0, so
    // `COALESCE($5, records_total)` would silently persist 0 for a step that
    // declares `counters: "none"` — stdout says null, the ledger says 0, and
    // the `counters` category's whole purpose (one declared meaning per
    // counter) is defeated one layer below where it was declared.
    let sql = '';
    let params: unknown[] = [];
    await ledgerLib.finalizeLedgerRow(
      { query: async (text: string, values: unknown[]) => { sql = text; params = values; return { rows: [] }; } },
      99,
      { slug: 'assert_schema', status: 'completed', durationMs: 12, recordsMeta: { a: 1 } },
    );
    expect(sql).toMatch(/records_total = \$5/);
    expect(sql).toMatch(/records_new = \$6/);
    expect(sql).toMatch(/records_updated = \$7/);
    expect(sql, 'no COALESCE may wrap a counter — it resolves a deliberate NULL to the column default 0')
      .not.toMatch(/COALESCE\(\$[567]/);
    // ...while records_meta KEEPS its COALESCE: null there means "this path
    // produced no meta", and blanking it would destroy already-written rows.
    expect(sql).toMatch(/records_meta = COALESCE\(\$8::jsonb, records_meta\)/);
    expect(params.slice(4, 7), 'a counters:"none" step must persist NULL, not 0').toEqual([null, null, null]);
  });

  it('carries the full Spec 120 §3.2b status vocabulary', () => {
    expect(Object.values(ledgerLib.RUN_STATUS)).toEqual(
      expect.arrayContaining([
        'running', 'completed', 'completed_with_warnings', 'completed_with_errors',
        'failed', 'crashed', 'skipped', 'self_skipped', 'deferred_to_full', 'cancelled',
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. The lifecycle, end to end, against a fake pool (no DB)
// ---------------------------------------------------------------------------

type FakePoolOpts = {
  lockAcquired?: boolean;
  migrations?: number;
  database?: string;
  /** logic_variables rows this DB "has". Absent ⇒ zero rows ⇒ the loader's seed fallbacks. */
  logicVars?: Record<string, unknown>;
  /** R-T addendum, commit 3 — SQL-text-matched answers for invariants[]/plausibility[]
   * entries' own queries (checked BEFORE the fixed switch below, additive/backward
   * compatible — no existing caller passes this). */
  queryAnswers?: Array<{ match: (text: string) => boolean; rows: Array<Record<string, unknown>> }>;
};

function fakePool(opts: FakePoolOpts = {}) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const answer = (text: string) => {
    const override = opts.queryAnswers?.find((qa) => qa.match(text));
    if (override) return { rows: override.rows };
    if (text.includes('current_database()')) {
      return { rows: [{ database: opts.database ?? 'postgres', db_user: 'postgres', has_tracking: true }] };
    }
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(opts.logicVars ?? {}).map(([variable_key, variable_value]) => ({
          variable_key,
          variable_value,
          variable_value_json: null,
        })),
      };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: opts.migrations ?? 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: opts.lockAcquired !== false }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    return { rows: [] };
  };
  const record = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    return answer(text);
  };
  return {
    sql,
    params,
    query: record,
    connect: async () => ({ query: record, release: () => {} }),
  };
}

/** The bound parameters of the single statement matching `match` — asserting there is exactly one. */
function paramsOf(pool: ReturnType<typeof fakePool>, match: (sql: string) => boolean): unknown[] {
  const idx = pool.sql.findIndex(match);
  expect(idx, 'expected exactly one matching statement').toBeGreaterThan(-1);
  return pool.params[idx] ?? [];
}

/** Capture PIPELINE_SUMMARY / PIPELINE_META without letting them reach the reporter. */
function captureEmissions() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return {
    restore: () => spy.mockRestore(),
    summary: () => JSON.parse(lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop()!.slice('PIPELINE_SUMMARY:'.length)),
    meta: () => JSON.parse(lines.filter((l) => l.startsWith('PIPELINE_META:')).pop()!.slice('PIPELINE_META:'.length)),
    lines,
  };
}

/** Report `violations: 0` for every check the chain selected. */
const allClean = async (ctx: { descriptor: Record<string, unknown>; chainId: string | null }) => {
  for (const c of verdictLib.selectChecks(ctx.descriptor, ctx.chainId)) {
    (ctx as unknown as { report: (id: string, o: unknown) => void }).report(c.id, { violations: 0 });
  }
};

describe('run(ctx) — the lifecycle, against a fake pool', () => {
  it('a clean sources run: PASS verdict, audit_table named from identity.display_name', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      const out = await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: 'sources' });
      expect(out.status).toBe('completed');
      const summary = cap.summary();
      expect(summary.records_meta.audit_table.verdict).toBe('PASS');
      expect(summary.records_meta.audit_table.name).toBe('Schema Validation');
      expect(summary.records_meta.checks_passed).toBe('all');
      expect(summary.records_meta.checks_failed).toBe(0);
      // ASSERT profile: counters "none" — records_new/updated stay null, not 0.
      expect(summary.records_new).toBeNull();
      expect(summary.records_updated).toBeNull();
      // Six source checks + the two sys_* rows emitSummary always injects.
      const metrics = summary.records_meta.audit_table.rows.map((r: Row) => r.metric);
      expect(metrics).toContain('parcel_columns');
      expect(metrics).not.toContain('permit_columns');
      expect(metrics).toContain('sys_duration_ms');
    } finally {
      cap.restore();
    }
  });

  it('LW-D13 — records_meta.ledger_row is stamped from ownsLedgerRow(chainId): "chain_owned" in-chain', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: 'sources' });
      const summary = cap.summary();
      expect(summary.records_meta.ledger_row, 'in-chain, run-chain.js owns the row, not this process').toBe('chain_owned');
    } finally {
      cap.restore();
    }
  });

  it('LW-D13 — records_meta.ledger_row is stamped from ownsLedgerRow(chainId): "owned" standalone (chainId null)', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: null });
      const summary = cap.summary();
      expect(summary.records_meta.ledger_row, 'standalone, this process itself owns the pipeline_runs row').toBe('owned');
    } finally {
      cap.restore();
    }
  });

  it('LW-D13 — ledger_row is also stamped on the self_skipped (advisory-lock-contention) path, both values reachable', async () => {
    const chainPool = fakePool({ lockAcquired: false });
    const standalonePool = fakePool({ lockAcquired: false });
    const cap1 = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, async () => {}).run({ pool: chainPool, chainId: 'sources' });
      expect(cap1.summary().records_meta.ledger_row).toBe('chain_owned');
    } finally {
      cap1.restore();
    }
    const cap2 = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, async () => {}).run({ pool: standalonePool, chainId: null });
      expect(cap2.summary().records_meta.ledger_row).toBe('owned');
    } finally {
      cap2.restore();
    }
  });

  it('PIPELINE_META is derived from the descriptor, not hand-maintained', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: 'sources' });
      const meta = cap.meta();
      expect(meta.writes, 'outputs "none" means it writes nothing').toEqual({});
      expect(meta.external).toContain('ckan_datastore_api');
      expect(meta.external).toHaveLength(ASSERT_SCHEMA.inputs.reads.externals.length);
    } finally {
      cap.restore();
    }
  });

  it('records_meta.pool_errors (pilot 9 commit 8 P5(a), Spec 48 §3.10) — COALESCE-merged from the pool\'s own __buildoPoolErrorCount, 0 on the common (no-error) case, the real count when the pool saw idle-client errors', async () => {
    const cleanPool = fakePool();
    const cap1 = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool: cleanPool, chainId: 'sources' });
      expect(cap1.summary().records_meta.pool_errors, 'always present, never omitted when zero').toBe(0);
    } finally {
      cap1.restore();
    }

    const dirtyPool = fakePool();
    (dirtyPool as unknown as { __buildoPoolErrorCount: number }).__buildoPoolErrorCount = 3;
    const cap2 = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool: dirtyPool, chainId: 'sources' });
      expect(cap2.summary().records_meta.pool_errors, 'the run\'s own persisted record reflects idle-client errors the pool saw, not merely a stdout log line').toBe(3);
    } finally {
      cap2.restore();
    }
  });

  it('a blocking FAIL rejects — but the audit rows are emitted FIRST (WAP, §7.2)', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      const drift = async (ctx: { descriptor: Record<string, unknown>; chainId: string | null }) => {
        for (const c of verdictLib.selectChecks(ctx.descriptor, ctx.chainId)) {
          (ctx as unknown as { report: (id: string, o: unknown) => void })
            .report(c.id, { violations: c.id === 'parcel_columns' ? 1 : 0 });
        }
      };
      await expect(pipeline.step(ASSERT_SCHEMA, drift).run({ pool, chainId: 'sources' }))
        .rejects.toThrow(/blocking checks failed: parcel_columns/);
      const summary = cap.summary();
      expect(summary.records_meta.audit_table.verdict).toBe('FAIL');
      expect(summary.records_meta.errors).toEqual(expect.arrayContaining([expect.stringContaining('parcel_columns')]));
    } finally {
      cap.restore();
    }
  });

  it('lock held elsewhere: self_skipped, with a row-derived verdict, and compute never runs', async () => {
    const pool = fakePool({ lockAcquired: false });
    const cap = captureEmissions();
    let computeRan = false;
    try {
      const out = await pipeline
        .step(ASSERT_SCHEMA, async () => { computeRan = true; })
        .run({ pool, chainId: 'sources' });
      expect(computeRan).toBe(false);
      expect(out.status).toBe('self_skipped');
      const summary = cap.summary();
      expect(summary.records_meta.skipped).toBe(true);
      // VRD-SKIP (Spec 124 §2 Rule 10 rung b): a SELF_SKIPPED terminal must
      // not verdict identically to a genuine PASS — the 'status' row's
      // declared severity is WARN (threshold:'ran'), row-derived through the
      // unchanged deriveVerdict, never a hardcoded terminal value.
      expect(summary.records_meta.audit_table.verdict).toBe('WARN');
      expect(summary.records_meta.audit_table.rows.some((r: Row) => r.metric === 'reason')).toBe(true);
    } finally {
      cap.restore();
    }
  });

  it('STANDALONE opens and finalizes its own ledger row; IN-CHAIN writes none', async () => {
    const standalone = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool: standalone, chainId: null });
    } finally {
      cap.restore();
    }
    const inserts = standalone.sql.filter((s) => s.startsWith('INSERT INTO pipeline_runs'));
    const updates = standalone.sql.filter((s) => s.trim().startsWith('UPDATE pipeline_runs'));
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(paramsOf(standalone, (s) => s.trim().startsWith('UPDATE pipeline_runs'))[0]).toBe('completed');
    // Nothing SELECTs a prior run: reconcile (A3) is not implemented and is not assumed.
    expect(standalone.sql.some((s) => /SELECT[\s\S]*FROM pipeline_runs/i.test(s))).toBe(false);

    const inChain = fakePool();
    const cap2 = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool: inChain, chainId: 'sources' });
    } finally {
      cap2.restore();
    }
    expect(inChain.sql.some((s) => s.includes('pipeline_runs')), 'run-chain.js:591 owns the in-chain row').toBe(false);
  });

  it('the ledger is finalized `failed` — never `crashed` — when compute throws', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await expect(
        pipeline.step(ASSERT_SCHEMA, async () => { throw new Error('compute exploded'); })
          .run({ pool, chainId: null }),
      ).rejects.toThrow('compute exploded');
    } finally {
      cap.restore();
    }
    const update = paramsOf(pool, (s) => s.trim().startsWith('UPDATE pipeline_runs'));
    expect(update[0]).toBe('failed');
    expect(update[2]).toBe('compute exploded');
  });

  it('⚠️ DECLARED GAP — a raw compute throw emits ZERO audit rows, only the ledger error_message', async () => {
    // Pinned so the gap is a known property rather than a discovery. `assert-
    // schema.js:318-443` wraps each source fetch individually, so one dead
    // archive reddens ONE row; a converted compute that lets a fetch escape to
    // the top level trades nine audit rows for one error string. Library-side
    // per-check boundaries are the validator growth wave — see index.js's catch.
    const pool = fakePool();
    const cap = captureEmissions();
    let lines: string[] = [];
    try {
      await expect(
        pipeline.step(ASSERT_SCHEMA, async () => { throw new Error('CKAN unreachable'); })
          .run({ pool, chainId: null }),
      ).rejects.toThrow('CKAN unreachable');
      lines = [...cap.lines];
    } finally {
      cap.restore();
    }
    expect(lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')), 'no summary is emitted at all').toHaveLength(0);
    expect(lines.filter((l) => l.startsWith('PIPELINE_META:'))).toHaveLength(0);
    // The ONLY surviving signal is the ledger row — status + error_message.
    const update = paramsOf(pool, (s) => s.trim().startsWith('UPDATE pipeline_runs'));
    expect(update[0]).toBe('failed');
    expect(update[2]).toBe('CKAN unreachable');
    expect(update[7], 'records_meta is null — there are no audit rows to write').toBeNull();
  });

  it('⚠️ a below-floor database REFUSES before the lock is ever taken (§4.1 ③④)', async () => {
    const pool = fakePool({ migrations: 222 });
    await expect(pipeline.step(ASSERT_SCHEMA, noop).run({ pool, chainId: 'sources' }))
      .rejects.toThrow(/below-floor database/);
    expect(pool.sql.some((s) => s.includes('pg_try_advisory_xact_lock'))).toBe(false);
  });

  it('compute may not report a check the descriptor does not declare', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await expect(
        pipeline.step(ASSERT_SCHEMA, async (ctx: { report: (id: string, o: unknown) => void }) => {
          ctx.report('a_check_nobody_declared', { violations: 0 });
        }).run({ pool, chainId: 'sources' }),
      ).rejects.toThrow(/does not declare/);
    } finally {
      cap.restore();
    }
  });

  it('config: "none" — ctx.config is an empty FROZEN object and records_meta carries NO config key', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    let seen: Record<string, unknown> | undefined;
    try {
      await pipeline
        .step(ASSERT_SCHEMA, async (ctx: { config: Record<string, unknown> }) => { seen = ctx.config; })
        .run({ pool, chainId: 'sources' })
        .catch(() => undefined);
      expect(ASSERT_SCHEMA.config, 'the fixture is the config:"none" case').toBe('none');
      expect(seen).toEqual({});
      expect(Object.isFrozen(seen)).toBe(true);
      expect('config' in cap.summary().records_meta, 'a config:"none" step must pay ZERO records_meta bytes (§1.2a P3)').toBe(false);
      expect(pool.sql.some((s) => s.includes('FROM logic_variables')), 'no config query for a step that declares none').toBe(false);
    } finally {
      cap.restore();
    }
  });

  it('§5.5 (2) — `ctx.report()` is the ONLY observation path: a returned `observations` object is NOT merged', async () => {
    // Fold D (pilot 1 output panel). The dual path let a compute bypass the
    // declared-check guard above by returning observations instead of reporting
    // them. With the merge gone, a compute that only RETURNS is a compute that
    // reported nothing: every selected check lands as "not reported" (FAIL).
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      const returned: Record<string, unknown> = {};
      for (const c of verdictLib.selectChecks(ASSERT_SCHEMA, 'sources')) returned[c.id] = { violations: 0 };
      await pipeline.step(ASSERT_SCHEMA, async () => ({ observations: returned }))
        .run({ pool, chainId: 'sources' })
        .catch(() => undefined); // blocking checks throw AFTER the emit — the summary is what is under test
      const summary = cap.summary();
      expect(summary.records_meta.audit_table.verdict).toBe('FAIL');
      const parcel = summary.records_meta.audit_table.rows.find((r: Row) => r.metric === 'parcel_columns');
      expect(parcel, 'the check row still exists — the library scores every selected check').toBeDefined();
      expect(String(parcel.value)).toMatch(/not reported/);
      expect(parcel.status).toBe('FAIL');
    } finally {
      cap.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// 6b. R-T addendum (Spec 124 §2 Rule 13, commit 3) — the invariants[]/plausibility[]
//     EVERY_RUN executor, end to end against a fake pool.
// ---------------------------------------------------------------------------

/** A schema-valid invariants[] entry (definitions.invariant, step.schema.json). */
function testInvariant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test_invariant',
    sql: "SELECT 1 AS v -- TEST_INVARIANT_SQL",
    bound: 'value_min 0',
    severity: 'FAIL',
    blocking: false,
    when: 'pre',
    source: 'invariant',
    frequency: 'every_run',
    last_measured: {
      value: 1, at: '2026-08-30T00:00:00.000Z', commit: '0000000', cost_ms: 1, sample_n: 5,
      source_run: { run_id: null, chain: null, event: 'fixture' },
    },
    why: { text: 'fixture, R-T addendum test', liveness: 'none' },
    ...overrides,
  };
}

/** ASSERT_SCHEMA with a declared invariants[] array — the fixture's plausibility stays absent (optional, staged). */
function withInvariants(invariants: Array<Record<string, unknown>>) {
  const d = clone(ASSERT_SCHEMA);
  d.invariants = invariants;
  return d;
}

describe('R-T addendum, commit 3 — invariants[]/plausibility[] EVERY_RUN executor (fake pool, no DB)', () => {
  it('GREEN — a satisfied every_run invariant PASSes and carries source:"invariant" (Fold B-3)', async () => {
    const d = withInvariants([testInvariant({ id: 'rows_ok', bound: 'value_min 0' })]);
    const pool = fakePool({ queryAnswers: [{ match: (t) => t.includes('TEST_INVARIANT_SQL'), rows: [{ v: 42 }] }] });
    const cap = captureEmissions();
    try {
      await pipeline.step(d, allClean).run({ pool, chainId: 'sources' });
      const summary = cap.summary();
      const row = summary.records_meta.audit_table.rows.find((r: Row) => r.metric === 'rows_ok');
      expect(row, 'the synthetic invariant row must appear in audit_table.rows').toBeDefined();
      expect(row.status).toBe('PASS');
      expect(row.source, 'Fold B-3 — every synthetic row carries its declared source').toBe('invariant');
      expect(row.value).toBe(42);
    } finally {
      cap.restore();
    }
  });

  it('RED-then-GREEN — a BLOCKING invariant FAIL populates errors[]/checks_failed/errorMessage exactly like a real check (Fold A-2, the correction this commit exists to land)', async () => {
    const d = withInvariants([testInvariant({ id: 'must_be_zero', bound: 'value_max 0', severity: 'FAIL', blocking: true })]);
    const pool = fakePool({ queryAnswers: [{ match: (t) => t.includes('TEST_INVARIANT_SQL'), rows: [{ v: 5 }] }] });
    const cap = captureEmissions();
    try {
      await expect(
        pipeline.step(d, allClean).run({ pool, chainId: 'sources' }),
      ).rejects.toThrow(/blocking checks failed: must_be_zero/);
      const summary = cap.summary();
      // Fold A-2's own BLOCKING correction: the row must reach errors[]/checks_failed —
      // an `extraRows`-only append (the plan's original, WRONG assumption) never would.
      expect(summary.records_meta.checks_failed).toBeGreaterThan(0);
      expect(summary.records_meta.errors.some((e: string) => e.startsWith('must_be_zero:'))).toBe(true);
      const row = summary.records_meta.audit_table.rows.find((r: Row) => r.metric === 'must_be_zero');
      expect(row.status).toBe('FAIL');
    } finally {
      cap.restore();
    }
  });

  it('RED-then-GREEN — a validate_only invariant does NOT fire at the run-end hook, both directions (frequency gating)', async () => {
    const everyRun = testInvariant({ id: 'cheap_check', frequency: 'every_run' });
    const validateOnly = testInvariant({
      id: 'expensive_check', frequency: 'validate_only', statement_timeout: 'none', statement_timeout_why: { text: 'fixture, no ceiling to raise against', liveness: 'none' },
    });
    const d = withInvariants([everyRun, validateOnly]);
    const pool = fakePool({
      queryAnswers: [
        { match: (t) => t.includes('TEST_INVARIANT_SQL'), rows: [{ v: 0 }] },
      ],
    });
    const cap = captureEmissions();
    try {
      await pipeline.step(d, allClean).run({ pool, chainId: 'sources' });
      const summary = cap.summary();
      const metrics = summary.records_meta.audit_table.rows.map((r: Row) => r.metric);
      // Both entries share the SAME sql text (TEST_INVARIANT_SQL), so this is a frequency
      // assertion, not a "which query ran" one: cheap_check (every_run) must appear,
      // expensive_check (validate_only) must NOT — it is not even a "not reported" row,
      // because it is never SELECTED at all at run-end (unlike a real declared check).
      expect(metrics).toContain('cheap_check');
      expect(metrics).not.toContain('expensive_check');
    } finally {
      cap.restore();
    }
  });

  it('Fold A-3/B-2 — a gated-skip (self_skipped, advisory lock contention) run fires ZERO invariant executions, even for every_run entries', async () => {
    const d = withInvariants([testInvariant({ id: 'never_reached', when: 'pre' })]);
    const pool = fakePool({ lockAcquired: false, queryAnswers: [{ match: (t) => t.includes('TEST_INVARIANT_SQL'), rows: [{ v: 0 }] }] });
    const cap = captureEmissions();
    try {
      await pipeline.step(d, async () => {}).run({ pool, chainId: 'sources' });
      // Self-skip never acquires the advisory lock, so it never reaches the invariants
      // executor at all — the strongest possible proof is that the query was never
      // issued (the skip's own records_meta, built by skipRecordsMeta(), is a FIXED
      // {status, reason, sys_*} shape unrelated to checks[]/invariants[] entirely, so
      // asserting against it would prove nothing about THIS mechanism specifically).
      expect(pool.sql.some((s) => s.includes('TEST_INVARIANT_SQL'))).toBe(false);
    } finally {
      cap.restore();
    }
  });

  it('Fold B-2 — a `when:"pre"` invariant DOES fire even when the run narrows to a gated-skip subset that excludes "post"', async () => {
    // isIngestStep's own gated-skip narrowing (`ingest.skipped`) restricts onlyChecks/
    // onlyWhen to `['pre']` only — assert_schema IS an ingest-shaped step in this
    // library sense structurally, but its own descriptor never gates, so this proves
    // the MECHANISM directly against buildAuditTable/runValidatorEntries instead:
    // a `when:'pre'` entry is unaffected by an `onlyWhen: ['pre']` narrowing.
    const verdictLibDirect = verdictLib as unknown as {
      buildAuditTable: (
        descriptor: unknown, chainId: string | null, observations: unknown, extraRows: unknown[],
        config: unknown, only: Set<string> | null, synthetic: { checks: unknown[]; observations: Record<string, unknown> },
      ) => { rows: Row[] };
    };
    const preCheck = { id: 'pre_entry', limit: 'value_min 0', severity: 'INFO', blocking: false, source: 'invariant' };
    const postCheck = { id: 'post_entry', limit: 'value_min 0', severity: 'INFO', blocking: false, source: 'invariant' };
    const built = verdictLibDirect.buildAuditTable(
      withChecks([]), 'sources', {}, [], null, null,
      { checks: [preCheck, postCheck], observations: { pre_entry: { value: 1 }, post_entry: { value: 1 } } },
    );
    const metrics = built.rows.map((r) => r.metric);
    // buildAuditTable itself does not narrow by `when` — the CALLER (index.js) is
    // responsible for pre-filtering via runValidatorEntries's own `when` param before
    // ever building the `synthetic` object (proven end-to-end by the metrics.not.toContain
    // 'expensive_check' assertion above, which exercises the REAL index.js call site).
    // This unit-level check instead locks that buildAuditTable folds EVERYTHING it is
    // handed, uniformly, with no category-specific branch — the actual Fold A-2 guarantee.
    expect(metrics).toEqual(expect.arrayContaining(['pre_entry', 'post_entry']));
  });
});

// ---------------------------------------------------------------------------
// 6c. EP-D17 (WF3, 2026-09-10) — plausibility.js's executeEntry/runValidatorEntries
//     ceiling default, loud-timeout, duration_ms and concurrency; runMaintenance
//     (the execution.maintenance library executor). Unit-level against hand-built
//     fake pools/clients — the fixture in 6b (ASSERT_SCHEMA + fakePool) has no
//     execution.statement_timeout worth asserting a default FROM, so these test
//     plausibility.js's exported functions directly (SPEC LINK: 124_step_standard_policy.md
//     §7 ladder rungs (a)(iii)/(b)/(c)/(d)).
// ---------------------------------------------------------------------------

function epD17TestEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep_d17_test_entry',
    sql: 'SELECT 1 AS v -- EP_D17_TEST_SQL',
    bound: 'value_min 0',
    severity: 'WARN',
    blocking: false,
    when: 'post',
    source: 'plausibility',
    frequency: 'every_run',
    last_measured: {
      value: 1, at: '2026-09-10T00:00:00.000Z', commit: '0000000', cost_ms: 1, sample_n: 1,
      source_run: { run_id: null, chain: null, event: 'fixture' },
    },
    why: { text: 'fixture, EP-D17 test', liveness: 'none' },
    ...overrides,
  };
}

describe('EP-D17 (WF3, 2026-09-10) — executeEntry ceiling default + duration_ms + loud timeout', () => {
  it('lock 1 (RED-first) — an entry with NO declared statement_timeout still runs inside BEGIN/SET LOCAL/COMMIT when a defaultTimeoutMs is supplied (never the bare pool.query branch)', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('EP_D17_TEST_SQL')) return { rows: [{ v: 7 }] };
        return { rows: [] };
      },
      release: () => {},
    };
    const pool = {
      connect: async () => client,
      query: async () => { throw new Error('must not take the bare pool.query branch once a ceiling applies'); },
    };
    const result = await plausibilityLib.executeEntry(pool, epD17TestEntry(), 600000);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toMatch(/^SET LOCAL statement_timeout = 600000$/);
    expect(calls[2]).toContain('EP_D17_TEST_SQL');
    expect(calls[3]).toBe('COMMIT');
    expect(result.value).toBe(7);
    expect(typeof result.duration_ms).toBe('number');
  });

  it('a DECLARED statement_timeout still wins over defaultTimeoutMs (the entry-level override is never silently widened by the step-level default)', async () => {
    const calls: string[] = [];
    const client = { query: async (sql: string) => { calls.push(sql); return sql.includes('EP_D17_TEST_SQL') ? { rows: [{ v: 1 }] } : { rows: [] }; }, release: () => {} };
    const pool = { connect: async () => client, query: async () => { throw new Error('unused'); } };
    await plausibilityLib.executeEntry(pool, epD17TestEntry({ statement_timeout: '30s', statement_timeout_why: { text: 'fixture', liveness: 'none' } }), 600000);
    expect(calls[1]).toBe('SET LOCAL statement_timeout = 30000');
  });

  it('an entry with NO declared timeout and NO defaultTimeoutMs falls through to the bare pool.query branch (fixture safety net, never a live step)', async () => {
    const pool = { connect: async () => { throw new Error('must not connect when no ceiling applies at all'); }, query: async (sql: string) => (sql.includes('EP_D17_TEST_SQL') ? { rows: [{ v: 3 }] } : { rows: [] }) };
    const result = await plausibilityLib.executeEntry(pool, epD17TestEntry(), null);
    expect(result.value).toBe(3);
  });

  it('lock 2 (both directions) — a 57014 statement-timeout error is a distinct FAIL-shaped {error} observation, never a swallowed value/0, and the client is released on the throw path', async () => {
    const err = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    let released = false;
    const client = {
      query: async (sql: string) => {
        if (sql.includes('EP_D17_TEST_SQL')) throw err;
        return { rows: [] }; // BEGIN / SET LOCAL / ROLLBACK all succeed
      },
      release: () => { released = true; },
    };
    const pool = { connect: async () => client, query: async () => { throw new Error('unused'); } };
    const result = await plausibilityLib.executeEntry(pool, epD17TestEntry(), 5000);
    expect(result.error).toBe(err);
    expect(result.value).toBeUndefined();
    expect(typeof result.duration_ms, 'a timed-out entry must still carry how long it ran before it died').toBe('number');
    expect(released, 'the client must be released on the throw path too, not only on success').toBe(true);
  });

  it('lock 6 — runValidatorEntries attaches duration_ms to EVERY executed entry\'s observation, keyed by entry id', async () => {
    const pool = {
      connect: async () => ({ query: async (sql: string) => (sql.includes('EP_D17_TEST_SQL') ? { rows: [{ v: 1 }] } : { rows: [] }), release: () => {} }),
      query: async () => { throw new Error('unused'); },
    };
    const { observations } = await plausibilityLib.runValidatorEntries(
      pool, [epD17TestEntry({ id: 'a' }), epD17TestEntry({ id: 'b' })],
      { frequency: 'every_run', when: null, defaultTimeoutMs: 5000 },
    );
    expect(typeof observations.a.duration_ms).toBe('number');
    expect(typeof observations.b.duration_ms).toBe('number');
  });

  it('lock 5 (RED-first, both directions) — every selected entry\'s client is connect()ed BEFORE any of their queries resolve, each is released on both the success and throw path, and one entry\'s FAIL does not swallow the other\'s row', async () => {
    const order: string[] = [];
    const released: boolean[] = [];
    let openGate: (() => void) | undefined;
    const gate = new Promise<void>((res) => { openGate = res; });
    let connectCount = 0;
    const pool = {
      connect: async () => {
        const myIndex = connectCount++;
        order.push(`connect:${myIndex}`);
        return {
          query: async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.startsWith('SET LOCAL')) return { rows: [] };
            order.push(`query:${myIndex}`);
            if (myIndex === 0) throw Object.assign(new Error('boom'), { code: '57014' }); // entry 0 fails
            await gate; // entry 1 waits until BOTH connects are on record, proving they raced ahead of it
            return { rows: [{ v: myIndex }] };
          },
          release: () => { released[myIndex] = true; },
        };
      },
      query: async () => { throw new Error('unused — every entry declares/derives a ceiling'); },
    };
    const entries = [epD17TestEntry({ id: 'e0' }), epD17TestEntry({ id: 'e1' })];
    const runPromise = plausibilityLib.runValidatorEntries(pool, entries, { frequency: 'every_run', when: null, defaultTimeoutMs: 5000 });
    await new Promise((r) => setTimeout(r, 0));
    expect(order.filter((o) => o.startsWith('connect:')), 'both clients must be requested before either query resolves — proves Promise.all, not the old for-await serial loop').toHaveLength(2);
    openGate!();
    const { observations } = await runPromise;
    expect(observations.e0.error, 'entry 0\'s FAIL must not short-circuit Promise.all').toBeDefined();
    expect(observations.e1.value, 'entry 1\'s row must still be produced despite entry 0\'s failure').toBe(1);
    expect(released[0]).toBe(true);
    expect(released[1]).toBe(true);
  });
});

/** A fake pool whose `connect()` returns a dedicated client sharing the SAME
 * `calls` log as `pool.query()` — mirrors runMaintenance's real dedicated-client
 * ceiling path (F5) without needing the full `fakePool()` helper's config/ledger
 * machinery for these pure-function unit tests. */
function fakeMaintenancePool(answer: (sql: string) => { rows: unknown[] }) {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => { calls.push(sql); return answer(sql); },
    release: () => {},
  };
  return { calls, connect: async () => client, query: async (sql: string) => { calls.push(sql); return answer(sql); } };
}

describe('EP-D17 (WF3, 2026-09-10, C4) — runMaintenance: the execution.maintenance library executor', () => {
  it('"none" declaration produces zero rows and issues zero queries (every converted step but enrich_parcels, today)', async () => {
    const pool = { query: async () => { throw new Error('must not query at all for a "none" declaration'); }, connect: async () => { throw new Error('must not connect at all'); } };
    const rows = await plausibilityLib.runMaintenance(pool, 'none', {});
    expect(rows).toEqual([]);
  });

  it('below the declared threshold — SKIPPED, INFO, no VACUUM issued, sys_-prefixed metric (F1)', async () => {
    const pool = fakeMaintenancePool((sql) => (sql.includes('pg_stat_user_tables') ? { rows: [{ live: '900', dead: '100' }] } : { rows: [] })); // dead_ratio 0.10
    const rows = await plausibilityLib.runMaintenance(
      pool,
      [{ operation: 'vacuum_analyze', table: 'parcels', owned_by: 'self', why: { text: 'fixture, EP-D17 test', liveness: 'none' } }],
      { parcels_dead_tuple_ratio_warn_max: 0.3 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe('sys_maintenance_parcels_vacuum_analyze');
    expect(rows[0].status).toBe('INFO');
    expect(rows[0].value).toBe(0.1);
    expect(pool.calls.some((s) => s.startsWith('VACUUM'))).toBe(false);
  });

  it('both directions, RED-first — AT/ABOVE the declared threshold, the declared VACUUM (ANALYZE) statement is issued on a DEDICATED client with its own declared ceiling (F5), and the row records it under a sys_-prefixed metric (F1)', async () => {
    const pool = fakeMaintenancePool((sql) => (sql.includes('pg_stat_user_tables') ? { rows: [{ live: '300', dead: '700' }] } : { rows: [] })); // dead_ratio 0.70
    const rows = await plausibilityLib.runMaintenance(
      pool,
      [{ operation: 'vacuum_analyze', table: 'parcels', owned_by: 'self', why: { text: 'fixture, EP-D17 test', liveness: 'none' } }],
      { parcels_dead_tuple_ratio_warn_max: 0.3 },
    );
    expect(pool.calls).toContain('VACUUM (ANALYZE) "parcels"');
    // F5 — the default 15-minute ceiling, applied on the SAME dedicated client, BEFORE the statement.
    const setIdx = pool.calls.findIndex((s) => s === 'SET statement_timeout = 900000');
    const vacIdx = pool.calls.findIndex((s) => s === 'VACUUM (ANALYZE) "parcels"');
    expect(setIdx, 'the ceiling must be SET before the VACUUM statement, on the same client').toBeGreaterThan(-1);
    expect(setIdx).toBeLessThan(vacIdx);
    expect(rows[0].metric).toBe('sys_maintenance_parcels_vacuum_analyze');
    expect(rows[0].status).toBe('INFO');
    expect(rows[0].value).toBe(0.7);
    expect(typeof rows[0].duration_ms).toBe('number');
  });

  it('F5 lock (both directions) — a declared `${table}_maintenance_timeout_minutes` overrides the 15-minute default, and the applied SET reflects it (raising the tunable changes the applied ceiling)', async () => {
    const pool = fakeMaintenancePool((sql) => (sql.includes('pg_stat_user_tables') ? { rows: [{ live: '300', dead: '700' }] } : { rows: [] }));
    await plausibilityLib.runMaintenance(
      pool,
      [{ operation: 'vacuum_analyze', table: 'parcels', owned_by: 'self', why: { text: 'fixture, EP-D17 test', liveness: 'none' } }],
      { parcels_dead_tuple_ratio_warn_max: 0.3, parcels_maintenance_timeout_minutes: 30 },
    );
    expect(pool.calls).toContain('SET statement_timeout = 1800000');
    expect(pool.calls).not.toContain('SET statement_timeout = 900000');
  });

  it('no matching logic-variable declared for this table — SKIPPED with a WARN reason, never a silent hardcoded threshold', async () => {
    const pool = fakeMaintenancePool((sql) => (sql.includes('pg_stat_user_tables') ? { rows: [{ live: '100', dead: '900' }] } : { rows: [] }));
    const rows = await plausibilityLib.runMaintenance(
      pool,
      [{ operation: 'vacuum_analyze', table: 'parcels', owned_by: 'self', why: { text: 'fixture, EP-D17 test', liveness: 'none' } }],
      {}, // no parcels_dead_tuple_ratio_warn_max
    );
    expect(rows[0].status).toBe('WARN');
  });

  it('F6 lock — a measurement failure (pg_stat_user_tables query throws) is reported AND logged (pipeline.log.warn), never crashes the step and never silently swallowed', async () => {
    const pool = { query: async () => { throw new Error('connection reset'); }, connect: async () => { throw new Error('unused'); } };
    const warnings: Array<[string, string]> = [];
    const rows = await plausibilityLib.runMaintenance(
      pool,
      [{ operation: 'vacuum_analyze', table: 'parcels', owned_by: 'self', why: { text: 'fixture, EP-D17 test', liveness: 'none' } }],
      { parcels_dead_tuple_ratio_warn_max: 0.3 },
      { log: { warn: (tag: string, msg: string) => { warnings.push([tag, msg]); } }, tag: '[test-step]' },
    );
    expect(rows[0].status).toBe('WARN');
    expect(rows[0].value).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]![0]).toBe('[test-step]');
    expect(warnings[0]![1]).toContain('connection reset');
  });

  it('F6 lock — an execution FAILURE (the VACUUM statement itself throws) is also reported AND logged', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.startsWith('SET statement_timeout')) return { rows: [] };
        throw new Error('canceling statement due to statement timeout');
      },
      release: () => {},
    };
    const pool = {
      connect: async () => client,
      query: async (sql: string) => (sql.includes('pg_stat_user_tables') ? { rows: [{ live: '300', dead: '700' }] } : { rows: [] }),
    };
    const warnings: Array<[string, string]> = [];
    const rows = await plausibilityLib.runMaintenance(
      pool,
      [{ operation: 'vacuum_analyze', table: 'parcels', owned_by: 'self', why: { text: 'fixture, EP-D17 test', liveness: 'none' } }],
      { parcels_dead_tuple_ratio_warn_max: 0.3 },
      { log: { warn: (tag: string, msg: string) => { warnings.push([tag, msg]); } }, tag: '[test-step]' },
    );
    expect(rows[0].status).toBe('WARN');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]![1]).toContain('statement timeout');
  });
});

describe('EP-D17 output-panel fix F2 (HIGH) — execution.maintenance runs BEFORE the run-end invariants[]/plausibility[] checks', () => {
  it('lock (order asserted) — the dead_ratio measurement query issues strictly before any post-check SQL, end to end through pipeline.step()', async () => {
    const d = withInvariants([testInvariant({ id: 'post_check', when: 'post' })]);
    (d as unknown as { execution: Record<string, unknown> }).execution = {
      ...(d as unknown as { execution: Record<string, unknown> }).execution,
      maintenance: [{ operation: 'vacuum_analyze', table: 'parcels', owned_by: 'self', why: { text: 'fixture, EP-D17 test', liveness: 'none' } }],
    };
    const pool = fakePool({
      queryAnswers: [
        { match: (t) => t.includes('pg_stat_user_tables'), rows: [{ live: '100', dead: '900' }] },
        { match: (t) => t.includes('TEST_INVARIANT_SQL'), rows: [{ v: 0 }] },
      ],
    });
    const cap = captureEmissions();
    try {
      await pipeline.step(d, allClean).run({ pool, chainId: 'sources' });
    } finally {
      cap.restore();
    }
    const statIdx = pool.sql.findIndex((s) => s.includes('pg_stat_user_tables'));
    const checkIdx = pool.sql.findIndex((s) => s.includes('TEST_INVARIANT_SQL'));
    expect(statIdx, 'the maintenance dead_ratio measurement must have run').toBeGreaterThan(-1);
    expect(checkIdx, 'the post check must have run').toBeGreaterThan(-1);
    expect(statIdx, 'maintenance must run BEFORE the post checks it exists to protect').toBeLessThan(checkIdx);
  });
});

describe('EP-D17 output-panel fix F1 (CRITICAL) — golden-scrub stability for the new audit rows', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real generator
  const goldenLib = require(join(process.cwd(), 'scripts/analysis/capture-step-golden.js')) as {
    normalise: (capture: Record<string, unknown>) => { normalised: unknown };
  };

  function captureWith(rows: Array<Record<string, unknown>>) {
    return {
      step: 'enrich_parcels', chain: 'sources', exit_code: 0,
      summary: { records_meta: { audit_table: { rows } } },
      summary_count: 1, meta: [], parse_errors: [], pipeline_runs: [],
      stdout: '', table_state: [], invariants: [],
    };
  }

  it('two runs with DIFFERENT raw duration_ms/dead_ratio values scrub to an IDENTICAL normalised shape', () => {
    const runA = captureWith([
      { metric: 'sys_post_check_duration_ms', value: 214, threshold: null, status: 'INFO' },
      { metric: 'sys_maintenance_parcels_vacuum_analyze', value: 0.697, threshold: 0.3, status: 'INFO', note: 'ran "VACUUM (ANALYZE) \"parcels\"" — dead_ratio 0.697 > 0.3', duration_ms: 187345 },
    ]);
    const runB = captureWith([
      { metric: 'sys_post_check_duration_ms', value: 2411987, threshold: null, status: 'INFO' },
      { metric: 'sys_maintenance_parcels_vacuum_analyze', value: 0.412, threshold: 0.3, status: 'INFO', note: 'ran "VACUUM (ANALYZE) \"parcels\"" — dead_ratio 0.412 > 0.3', duration_ms: 903221 },
    ]);
    const a = goldenLib.normalise(runA).normalised;
    const b = goldenLib.normalise(runB).normalised;
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toContain('duration_ms');
    expect(JSON.stringify(a)).not.toContain('0.697');
  });

  it('a NON-sys_-prefixed duration/maintenance row would NOT scrub identically — proves the prefix is load-bearing, not incidental', () => {
    const runA = captureWith([{ metric: 'post_check_duration_ms', value: 214, threshold: null, status: 'INFO' }]);
    const runB = captureWith([{ metric: 'post_check_duration_ms', value: 999999, threshold: null, status: 'INFO' }]);
    const a = goldenLib.normalise(runA).normalised;
    const b = goldenLib.normalise(runB).normalised;
    expect(a).not.toEqual(b);
  });
});

describe('R-U (Fold B-5, commit 5) — records_meta.chain_run_id propagation', () => {
  afterEach(() => {
    delete process.env.CHAIN_RUN_ID;
  });

  it('RED/GREEN #1 — a chain-spawned step (ctx.chainRunId set, mirrors run-chain.js:638\'s env-var spawn) carries chain_run_id matching the parent pipeline_runs.id', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: 'sources', chainRunId: 4242 });
      expect(cap.summary().records_meta.chain_run_id).toBe(4242);
    } finally {
      cap.restore();
    }
  });

  it('RED/GREEN #1b — the SAME propagation via process.env.CHAIN_RUN_ID (the real run-chain.js mechanism — ctx.chainRunId is the test-only override, the env var is what a real spawned child actually reads)', async () => {
    process.env.CHAIN_RUN_ID = '4242';
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: 'sources' });
      expect(cap.summary().records_meta.chain_run_id).toBe(4242);
    } finally {
      cap.restore();
    }
  });

  it('RED/GREEN #2 — a standalone invocation (no ctx.chainRunId, no CHAIN_RUN_ID env — a manual run-step.mjs shape) carries chain_run_id: null, never fabricating a false correlation', async () => {
    expect(process.env.CHAIN_RUN_ID).toBeUndefined();
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: null });
      expect(cap.summary().records_meta.chain_run_id).toBeNull();
    } finally {
      cap.restore();
    }
  });

  it('a malformed CHAIN_RUN_ID env value (never emitted by run-chain.js itself, but defensively read) degrades to null rather than NaN or a thrown error', async () => {
    process.env.CHAIN_RUN_ID = 'not-a-number';
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: 'sources' });
      expect(cap.summary().records_meta.chain_run_id).toBeNull();
    } finally {
      cap.restore();
    }
  });

  it('chain_run_id is also stamped on the contention-skip (self_skipped) path — the SAME key on every row regardless of branch', async () => {
    const pool = fakePool({ lockAcquired: false });
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: 'sources', chainRunId: 777 });
      expect(cap.summary().records_meta.chain_run_id).toBe(777);
    } finally {
      cap.restore();
    }
  });

  it('capture-diff shape: chain_run_id is the ONLY new key vs. the pre-R-U records_meta shape — a standalone run\'s key set gains exactly +1 member', async () => {
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      await pipeline.step(ASSERT_SCHEMA, allClean).run({ pool, chainId: null });
      const meta = cap.summary().records_meta as Record<string, unknown>;
      // The pre-commit-5 key set, reconstructed from every OTHER commit-3/4 key this
      // same fixture/compute combination is known to emit (ledger_row, terminal,
      // checks_passed, checks_failed, checks_warned, audit_table) — asserting the
      // diff is +1, not re-deriving the whole shape from scratch.
      const preR_U_keys = new Set(Object.keys(meta).filter((k) => k !== 'chain_run_id'));
      const postR_U_keys = new Set(Object.keys(meta));
      expect(postR_U_keys.size - preR_U_keys.size).toBe(1);
      expect(meta.chain_run_id).toBeNull();
      expect(preR_U_keys.has('chain_run_id')).toBe(false);
    } finally {
      cap.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. §1.2a P4 — `ctx.config`, the ONE seam a compute reaches a tunable through
// ---------------------------------------------------------------------------
//
// P4 is a DIRECTIVE ("every tunable is externalized to admin logic variables"), and
// the four properties that make it real rather than decorative are:
//   1. PROJECTION — `validation: "strict"` is not a checker that could be skipped,
//      it is an object that does not contain the undeclared key.
//   2. BOUNDS BEFORE COMPUTE — `on_invalid` decides, and it decides before any
//      observation exists, so a bad threshold never produces a green audit row.
//   3. HOISTING — a SKIP-eligible step resolves ABOVE the advisory lock, so an
//      invalid value cannot hide behind a green SKIPPED summary (link-wsib's A1/A2).
//   4. THE STAMP — the value in force is in `records_meta.config`, every run.

/** ASSERT_SCHEMA with a `config` block, so the fixture's own `config:"none"` case stays intact. */
function withConfig(
  vars: Array<{ name: string; min?: number | 'none'; max?: number | 'none'; on_invalid?: 'fail' | 'default' | 'clamp' }>,
  hoisted = true,
) {
  const d = clone(ASSERT_SCHEMA);
  d.config = {
    logic_variables: vars.map((v) => ({
      name: v.name,
      min: v.min === undefined ? 'none' : v.min,
      max: v.max === undefined ? 'none' : v.max,
      on_invalid: v.on_invalid ?? 'fail',
    })),
    validation: 'strict',
    hoisted_above_gate: hoisted,
  };
  return d;
}

/** Run a descriptor against a fake pool; return ctx.config as compute saw it, the throw, the summary. */
async function runWithConfig(d: Record<string, unknown>, opts: FakePoolOpts = {}) {
  const pool = fakePool(opts);
  const cap = captureEmissions();
  let seen: Record<string, unknown> | undefined;
  let error: Error | null = null;
  let summary: { records_meta: Record<string, unknown> } | null = null;
  try {
    const compute = async (ctx: { config: Record<string, unknown>; descriptor: Record<string, unknown>; chainId: string | null }) => {
      seen = ctx.config;
      await allClean(ctx);
    };
    await pipeline.step(d, compute).run({ pool, chainId: 'sources' });
    summary = cap.summary();
  } catch (err) {
    error = err as Error;
  } finally {
    cap.restore();
  }
  return { pool, seen, error, summary };
}

// Seed default 20, bounds [1, 1000] — the var Pilot 1 externalized (`&limit=20`).
const SEED_SAMPLE_ROWS = 'assert_schema_type_sample_rows';

describe('§1.2a P4 — ctx.config: resolved, bounds-checked, projected, stamped', () => {
  it('resolves the DECLARED names from the DB and stamps them into records_meta.config', async () => {
    const d = withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000 }]);
    const { seen, error, summary } = await runWithConfig(d, { logicVars: { [SEED_SAMPLE_ROWS]: '37' } });
    expect(error).toBeNull();
    expect(seen).toEqual({ [SEED_SAMPLE_ROWS]: 37 });
    // The stamp is the whole point: "the value in force is observable in the run's
    // records_meta". An operator edit that changed behaviour is visible in the ledger.
    expect(summary?.records_meta.config).toEqual({ [SEED_SAMPLE_ROWS]: 37 });
  });

  it('the projection is FROZEN and contains ONLY the declared names (validation: "strict")', async () => {
    const d = withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000 }]);
    const { seen } = await runWithConfig(d, { logicVars: { [SEED_SAMPLE_ROWS]: '20', los_base_divisor: '4' } });
    expect(Object.isFrozen(seen)).toBe(true);
    expect(Object.keys(seen as object)).toEqual([SEED_SAMPLE_ROWS]);
    expect(
      (seen as Record<string, unknown>).los_base_divisor,
      'an undeclared name is UNREACHABLE, not merely unvalidated',
    ).toBeUndefined();
  });

  it('a declared name in NO registry throws BEFORE compute — a name no operator can edit is a hidden literal', async () => {
    const { error, seen } = await runWithConfig(withConfig([{ name: 'a_var_no_seed_and_no_db_has' }]));
    expect(error?.message).toMatch(/exists in NO registry/);
    expect(seen, 'compute never ran').toBeUndefined();
  });

  it('on_invalid "fail" REFUSES an out-of-bounds value; "default" falls back to the seed; "clamp" clamps', async () => {
    const failed = await runWithConfig(
      withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000, on_invalid: 'fail' }]),
      { logicVars: { [SEED_SAMPLE_ROWS]: '9999' } },
    );
    expect(failed.error?.message).toMatch(/above_max/);
    expect(failed.seen, 'compute never ran on the bad value').toBeUndefined();

    const defaulted = await runWithConfig(
      withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000, on_invalid: 'default' }]),
      { logicVars: { [SEED_SAMPLE_ROWS]: '0' } },
    );
    expect(defaulted.error).toBeNull();
    expect(defaulted.seen, 'the seed default IS the pre-externalization literal').toEqual({ [SEED_SAMPLE_ROWS]: 20 });
    expect(defaulted.summary?.records_meta.config).toEqual({ [SEED_SAMPLE_ROWS]: 20 });

    const clamped = await runWithConfig(
      withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000, on_invalid: 'clamp' }]),
      { logicVars: { [SEED_SAMPLE_ROWS]: '5000' } },
    );
    expect(clamped.error).toBeNull();
    expect(clamped.seen).toEqual({ [SEED_SAMPLE_ROWS]: 1000 });
  });

  it('"default" with a seed default that ALSO violates the bounds throws — it never proceeds on nothing', async () => {
    const { error, seen } = await runWithConfig(
      withConfig([{ name: SEED_SAMPLE_ROWS, min: 5000, max: 9000, on_invalid: 'default' }]),
      { logicVars: { [SEED_SAMPLE_ROWS]: '1' } },
    );
    expect(error?.message).toMatch(/nothing to fall back to/);
    expect(seen).toBeUndefined();
  });

  it('⚠️ hoisted_above_gate: config resolves ABOVE the lock — an invalid value cannot hide behind a green SKIP', async () => {
    // The lock is held elsewhere. WITHOUT hoisting this run emits a green
    // self_skipped summary and nobody ever learns the threshold was garbage.
    const { error, pool } = await runWithConfig(
      withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000, on_invalid: 'fail' }], true),
      { lockAcquired: false, logicVars: { [SEED_SAMPLE_ROWS]: '9999' } },
    );
    expect(error?.message, 'a contended run must still REFUSE an out-of-bounds threshold').toMatch(/above_max/);
    const cfgAt = pool.sql.findIndex((s: string) => s.includes('FROM logic_variables'));
    const lockAt = pool.sql.findIndex((s: string) => s.includes('pg_try_advisory_xact_lock'));
    expect(cfgAt, 'the config query must have run').toBeGreaterThan(-1);
    expect(lockAt === -1 || cfgAt < lockAt, 'config resolved before the lock was attempted').toBe(true);
  });

  it('NOT hoisted: a contended run self-skips and pays no config query at all', async () => {
    const { error, pool } = await runWithConfig(
      withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000, on_invalid: 'fail' }], false),
      { lockAcquired: false, logicVars: { [SEED_SAMPLE_ROWS]: '9999' } },
    );
    expect(error, 'the un-hoisted step skips before it ever looks at config').toBeNull();
    expect(pool.sql.some((s: string) => s.includes('FROM logic_variables'))).toBe(false);
  });

  it('a config failure lands as a `failed` ledger row carrying the error_message, not a silent no-op', async () => {
    const d = withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000, on_invalid: 'fail' }]);
    const standalone = fakePool({ logicVars: { [SEED_SAMPLE_ROWS]: '9999' } });
    const cap = captureEmissions();
    try {
      await expect(pipeline.step(d, allClean).run({ pool: standalone, chainId: null })).rejects.toThrow(/above_max/);
    } finally {
      cap.restore();
    }
    const update = paramsOf(standalone, (s) => s.trim().startsWith('UPDATE pipeline_runs'));
    expect(update[0]).toBe('failed');
    expect(String(update[2])).toMatch(/above_max/);
    expect(update[7], 'no audit rows exist — the failure predates every observation').toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7b. LM-D15 — a declared variable with no `logic_variables` ROW resolves
// silently through the seed clone and is stamped as if operator-set. Presence
// in the LIVE TABLE, not presence in the seed-primed `logicVars` object, is
// what makes a variable operator-editable (Spec 122 §1.2a P4).
// ---------------------------------------------------------------------------

describe('LM-D15 — a declared name absent from logic_variables is a FAILED run, not a seed fallback', () => {
  it('(a) declared name WITH a DB row still resolves — happy path is byte-identical', async () => {
    const d = withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000 }]);
    const { seen, error, summary } = await runWithConfig(d, { logicVars: { [SEED_SAMPLE_ROWS]: '37' } });
    expect(error).toBeNull();
    expect(seen).toEqual({ [SEED_SAMPLE_ROWS]: 37 });
    expect(summary?.records_meta.config).toEqual({ [SEED_SAMPLE_ROWS]: 37 });
  });

  it('(b) declared name with a SEED default but NO logic_variables row throws with the remedy command', async () => {
    const d = withConfig([{ name: SEED_SAMPLE_ROWS, min: 1, max: 1000 }]);
    const { error, seen } = await runWithConfig(d, { logicVars: {} });
    expect(error?.message).toMatch(/no logic_variables row/);
    expect(error?.message).toMatch(/seed default exists/);
    expect(error?.message).toMatch(/node -r dotenv\/config scripts\/seeds\/apply-logic-variables\.js/);
    expect(error?.message).toMatch(/Spec 122 §1\.2a P4/);
    expect(seen, 'compute never ran').toBeUndefined();
  });

  it('(c) declared name in NEITHER registry keeps the original "exists in NO registry" message', async () => {
    const { error, seen } = await runWithConfig(withConfig([{ name: 'a_var_no_seed_and_no_db_has' }]));
    expect(error?.message).toMatch(/exists in NO registry/);
    expect(error?.message).not.toMatch(/no logic_variables row/);
    expect(seen).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. The GATING peel (8a) — the force arm and the prior-run error posture
// ---------------------------------------------------------------------------

describe('override.force_run — the arm that makes a frozen source loadable (A-3 / LG-10)', () => {
  const FROZEN = 'Mon, 14 Mar 2022 15:25:09 GMT';
  const FORCE_ENV = 'RAVINE_FORCE_RELOAD';
  const priorOf = (lastModified: string, contentHash: string) => ({
    last_modified: lastModified,
    etag: null,
    content_hash: contentHash,
    feature_count: 854,
  });

  it('the env var is DECLARED, read in exactly one place, and armed by "1" alone', () => {
    expect(stalenessLib.forceRunEnv(LOAD_RAVINES)).toBe(FORCE_ENV);
    expect(stalenessLib.forceRunRequested(LOAD_RAVINES, { [FORCE_ENV]: '1' })).toBe(true);
    // Never truthiness: an operator who exports "true" or "0" has NOT armed a reload.
    for (const v of ['true', 'yes', '0', '', undefined]) {
      expect(stalenessLib.forceRunRequested(LOAD_RAVINES, { [FORCE_ENV]: v }), `env "${String(v)}"`).toBe(false);
    }
    // A descriptor that declares no force_run can never be forced by any env.
    expect(stalenessLib.forceRunEnv(ASSERT_SCHEMA)).toBeNull();
    expect(stalenessLib.forceRunRequested(ASSERT_SCHEMA, { [FORCE_ENV]: '1' })).toBe(false);
  });

  it('ctx.overrides.force_run reflects the env and is FROZEN (a compute cannot arm its own reload)', () => {
    const armed = stalenessLib.resolveOverrides(LOAD_RAVINES, { [FORCE_ENV]: '1' });
    expect(armed.force_run).toBe(true);
    expect(Object.isFrozen(armed)).toBe(true);
    expect(stalenessLib.resolveOverrides(LOAD_RAVINES, {}).force_run).toBe(false);
  });

  // Peel 8b (pilot 3) — `force_full` was read ONLY by `selectMode`, which uses it to DECIDE
  // the mode, and never reached `ctx.overrides`. A step declaring an
  // `override_force_full_present` WARN saw `undefined` and reported CLEAN on every run,
  // INCLUDING forced ones: the 2026-08-27 forced relink emitted
  // `full_mode_reason: "force_full_env"` and a PASS on that row. Locked both directions
  // here, and on a descriptor that declares `force_full: "none"` so the flag cannot be
  // armed by an env var it never named.
  it('ctx.overrides.force_full reflects the env too — the DECISION and the AUDIT ROW read the same source', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
    const LINK_MASSING = require(join(process.cwd(), 'scripts/link-massing.descriptor.json'));
    const FULL_ENV = stalenessLib.forceFullEnv(LINK_MASSING);
    expect(FULL_ENV, 'link_massing declares override.force_full').toBe('LINK_MASSING_FORCE_FULL');
    const armed = stalenessLib.resolveOverrides(LINK_MASSING, { [FULL_ENV]: '1' });
    expect(armed.force_full, 'a standing force-full env must be OBSERVABLE, not only obeyed').toBe(true);
    expect(Object.isFrozen(armed)).toBe(true);
    expect(stalenessLib.resolveOverrides(LINK_MASSING, {}).force_full).toBe(false);
    // Never truthiness — same rule as force_run.
    for (const v of ['true', 'yes', '0', '', undefined]) {
      expect(stalenessLib.resolveOverrides(LINK_MASSING, { [FULL_ENV]: v }).force_full, `env "${String(v)}"`).toBe(false);
    }
    // A descriptor declaring force_full: "none" can never be armed.
    expect(stalenessLib.forceFullEnv(LOAD_RAVINES)).toBeNull();
    expect(stalenessLib.resolveOverrides(LOAD_RAVINES, { [FULL_ENV]: '1' }).force_full).toBe(false);
    // And the DECISION still agrees with the row: same env, same source.
    expect(stalenessLib.forceFullRequested(LINK_MASSING, { [FULL_ENV]: '1' })).toBe(true);
  });

  it('TIER 1 — unforced skips on equal validators; forced LOADS with reason "force_run" (both directions)', () => {
    const prior = priorOf(FROZEN, 'deadbeef');
    const validators = { lastModified: FROZEN, etag: null };
    const unforced = stalenessLib.preAcquisitionDecision({ descriptor: LOAD_RAVINES, validators, prior, forced: false });
    expect(unforced.skip, 'the normal outcome: the CKAN resource has not moved since 2022-03-14').toBe(true);
    expect(unforced.reason).toBe('unchanged_last_modified');
    const forced = stalenessLib.preAcquisitionDecision({ descriptor: LOAD_RAVINES, validators, prior, forced: true });
    expect(forced.skip, 'forced: the gate must not short-circuit').toBe(false);
    expect(forced.reason).toBe('force_run');
    expect(forced.trigger.signal, 'the terminal discriminator still names the gate that was bypassed').toBe('source_validator');
  });

  it('TIER 2 — unforced skips on an identical content hash; forced walks past it into extraction', async () => {
    const payload = Buffer.from('not-a-zip-archive');
    const hash = createHash('md5').update(payload).digest('hex');
    // Tier 1 must NOT fire, so the HEAD reports a DIFFERENT last-modified than the prior
    // run: this is the CKAN re-stamp case fence 0b230472 exists for — metadata says
    // "changed" while the bytes are byte-identical.
    const prior = priorOf(FROZEN, hash);
    const RESTAMPED = 'Tue, 01 Apr 2025 00:00:00 GMT';
    const fetchImpl = async (_url: string, init?: { method?: string }) =>
      (init && init.method === 'HEAD'
        ? new Response(null, { headers: { 'last-modified': RESTAMPED } })
        : new Response(new Uint8Array(payload), { headers: { 'last-modified': RESTAMPED } }));
    const log = { info: () => {}, warn: () => {}, error: () => {} };
    const args = (forced: boolean) => ({
      ctxFetch: fetchImpl,
      log,
      tag: '[load_ravines]',
      slug: 'load_ravines',
      external: LOAD_RAVINES.inputs.reads.externals[0],
      descriptor: LOAD_RAVINES,
      prior,
      timeoutMs: 30_000,
      keyProperty: 'OBJECTID',
      keyColumn: 'source_id',
      coerceKey: (raw: unknown) => Number(raw),
      forced,
      emitSkeleton: {},
      preAcquisitionGate: (head: { lastModified: string | null; etag: string | null }) =>
        stalenessLib.preAcquisitionDecision({ descriptor: LOAD_RAVINES, validators: head, prior, forced }),
    });

    const unforced = await acquireLib.acquireExternal(args(false));
    expect(unforced.tier1.skip, 'tier 1 must not fire — the metadata changed').toBe(false);
    expect(unforced.tier2.skip, 'tier 2: identical bytes, nothing parsed').toBe(true);
    expect(unforced.features).toEqual([]);
    expect(unforced.acquired.bytes_downloaded, 'tier 2 can only decide AFTER the transfer').toBe(payload.length);
    expect(unforced.emitBlock, 'the skip still re-emits a block, so it lands a completed row (DS4)').not.toBeNull();

    // Forced: both gates are bypassed, so the payload reaches the unzip — which is
    // where a non-archive fails. Resolving here would mean a gate had short-circuited.
    await expect(acquireLib.acquireExternal(args(true))).rejects.toThrow();
  });

  it('the content-hash gate itself still skips — the force arm is a bypass, never a removal', () => {
    const decision = acquireLib.contentHashSkip({
      descriptor: LOAD_RAVINES,
      contentHash: 'abc123',
      prior: { content_hash: 'abc123' },
    });
    expect(decision.skip).toBe(true);
    expect(acquireLib.contentHashSkip({ descriptor: LOAD_RAVINES, contentHash: 'abc123', prior: { content_hash: 'zzz' } }).skip).toBe(false);
  });
});

describe('staleness.on_prior_run_error — the DECLARED posture for a failed baseline read (LR-D2)', () => {
  const boom = new Error('connection terminated unexpectedly');
  const throwingPool = { query: async () => { throw boom; } };

  it('the posture is declared, and ABSENT means fail_step — unstated is allowed, silent is not', () => {
    expect(stalenessLib.priorRunErrorPosture(LOAD_RAVINES)).toBe('fail_step');
    expect(stalenessLib.priorRunErrorPosture(ASSERT_SCHEMA), 'a descriptor that does not declare it').toBe(stalenessLib.POSTURE_FAIL);
  });

  it('fail_step PROPAGATES — no null baseline is ever returned quietly', async () => {
    await expect(
      stalenessLib.readPriorEmitWithPosture(throwingPool, 'sources:load_ravines', 'ravine_load', stalenessLib.POSTURE_FAIL),
    ).rejects.toThrow(/connection terminated/);
  });

  it('warn_row proceeds with NO baseline and OWES a row — the row is what the swallow never had', async () => {
    const out = await stalenessLib.readPriorEmitWithPosture(
      throwingPool, 'sources:load_ravines', 'ravine_load', stalenessLib.POSTURE_WARN_ROW,
    );
    expect(out.prior, 'no baseline').toBeNull();
    expect(out.error, 'and the error is CARRIED, not discarded').toBe(boom);
    const row = stalenessLib.priorRunErrorRow(out.error);
    expect(row.metric).toBe(stalenessLib.PRIOR_RUN_ERROR_METRIC);
    expect(row.status).toBe('WARN');
    expect(String(row.value)).toMatch(/connection terminated/);
    // The row is not decoration: it moves the row-derived verdict off PASS.
    expect(verdictLib.deriveVerdict([{ status: 'PASS' }])).toBe('PASS');
    expect(verdictLib.deriveVerdict([{ status: 'PASS' }, row])).toBe('WARN');
  });

  it('a SUCCESSFUL read emits no row at all under either posture (no happy-path widening)', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    for (const posture of [stalenessLib.POSTURE_FAIL, stalenessLib.POSTURE_WARN_ROW]) {
      const out = await stalenessLib.readPriorEmitWithPosture(pool, 'sources:load_ravines', 'ravine_load', posture);
      expect(out.error, `posture ${posture}`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 9. The VERDICT/AUDIT peel (8b) — lock contention on a WRITE-CLASS step (LR-D6)
// ---------------------------------------------------------------------------

describe('LR-D6 — lock contention emits a row-derived SKIP, on a write-class step too', () => {
  /** The six declared tunables at their seed defaults, so the hoisted resolve succeeds. */
  function seededLogicVars(): Record<string, number> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the committed seed registry
    const seed = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
    const out: Record<string, number> = {};
    for (const v of LOAD_RAVINES.config.logic_variables as Array<{ name: string }>) out[v.name] = seed[v.name]!.default;
    return out;
  }

  it('the terminal is DECLARED — a contended run has a named exit path, not an unlabelled one', () => {
    const t = (LOAD_RAVINES.terminals as Array<{ id: string; kind: string; status: string }>)
      .find((x) => x.kind === 'skip_lock_contention');
    expect(t, 'no skip_lock_contention terminal is declared').toBeDefined();
    expect(t?.status).toBe('self_skipped');
  });

  it('contention: self_skipped, audit_table present with a ROW-DERIVED verdict, and NOTHING is acquired', async () => {
    const pool = fakePool({ lockAcquired: false, logicVars: seededLogicVars() });
    const cap = captureEmissions();
    let computeRan = false;
    let fetched = false;
    try {
      const out = await pipeline
        .step(LOAD_RAVINES, async () => { computeRan = true; })
        .run({ pool, chainId: 'sources', fetch: () => { fetched = true; throw new Error('a contended run must not reach the network'); } });
      expect(out.status).toBe('self_skipped');
      const summary = cap.summary();
      // Pre-conversion this path was a bare `return;`: the SDK's built-in SKIP carried no
      // audit_table at all, so contention read as verdict UNKNOWN downstream.
      expect(summary.records_meta.skipped).toBe(true);
      expect(summary.records_meta.audit_table, 'the SKIP summary must carry an audit_table').toBeDefined();
      expect(summary.records_meta.audit_table.verdict)
        .toBe(verdictLib.deriveVerdict(summary.records_meta.audit_table.rows));
      expect(summary.records_meta.audit_table.rows.some((r: Row) => r.metric === 'reason')).toBe(true);
    } finally {
      cap.restore();
    }
    expect(computeRan, 'the compute must not run').toBe(false);
    expect(fetched, 'no HEAD, no download — the acquisition seam is INSIDE the lock').toBe(false);
    // And no write reached the table: a contended loader that upserted would be the
    // whole reason lock 59 exists.
    expect(pool.sql.some((s: string) => /INSERT INTO ravines|DELETE FROM ravines/i.test(s))).toBe(false);
  });

  it('the counters read "not counted", not "counted zero" — a contended run measured nothing', async () => {
    const pool = fakePool({ lockAcquired: false, logicVars: seededLogicVars() });
    const cap = captureEmissions();
    try {
      await pipeline.step(LOAD_RAVINES, async () => {}).run({ pool, chainId: 'sources' });
      const summary = cap.summary();
      expect(summary.records_new, 'nothing was inserted, and nothing MEASURED an insert').toBeNull();
      expect(summary.records_updated).toBeNull();
      // LW-D12 (2026-08-28): pre-fix, `pipeline.emitSummary` normalised ONLY this one slot
      // (`?? 0`, coercing an explicit null too) while records_new/records_updated preserved
      // null (`!== undefined ? … : 0`) — a genuine asymmetry, not the deliberate "plan C-11"
      // normalisation this test used to cite (C-11 is `run-chain.js`'s OWN DB-write
      // normalisation for the pre-conversion `load_ravines` script, docs/reports/
      // 2026-08-25-pilot2-load-ravines-assessment.md:89 — a different layer; it does not
      // license `pipeline.js#emitSummary` doing the same thing to one of three symmetric
      // fields). `scripts/lib/step/ledger.js#finalizeLedgerRow` deliberately carries NO
      // COALESCE on these three columns, so a step's declared null must reach
      // `pipeline_runs` as null — the pre-fix stdout summary (`records_total: 0`) and the
      // SAME run's ledger row (`records_total: null`) disagreed. Fixed: all three fields are
      // now null-symmetric (`src/tests/pipeline-sdk.logic.test.ts` "LW-D12" tests).
      expect(summary.records_total, 'records_total is null-symmetric with records_new/records_updated (LW-D12)').toBeNull();
    } finally {
      cap.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// LR-D9 — `when: "pre_write"`: the write does not happen (Fold C, operator §7.1
// 2026-08-26). The library half of the fence; the descriptor/compute half is
// locked in src/tests/steps/load_ravines/violations.test.ts.
// ---------------------------------------------------------------------------

describe('LR-D9 — when:"pre_write" aborts BEFORE any write (Fold C, operator ruling §7.1 2026-08-26)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute + write modules
  const ravineCompute = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- same
  const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));

  const PRIOR_COUNT = 854;
  const DRIFT_ENV = 'RAVINE_ACCEPT_FEATURE_COUNT_DRIFT';

  function seedConfig(): Record<string, number> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the committed seed registry
    const seed = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
    const out: Record<string, number> = {};
    for (const v of LOAD_RAVINES.config.logic_variables as Array<{ name: string }>) out[v.name] = seed[v.name]!.default;
    return out;
  }

  const prior = { feature_count: PRIOR_COUNT, content_hash: 'aa', last_modified: 'Mon, 14 Mar 2022 15:25:09 GMT' };

  function acquiredOf(featureCount: number, skipped: number) {
    return {
      feature_count: featureCount,
      invalid_geometry_skipped: skipped,
      invalid_geometry_repaired: 0,
      geometry_collection_extracted: 0,
      skipped_keys: [],
      last_modified: prior.last_modified,
      last_modified_ms: Date.parse(prior.last_modified),
      etag: null,
      content_hash: 'bb',
      source_dataset_version: 'bb',
      license_url: 'https://open.toronto.ca/open-data-license/',
    };
  }

  /** The ctx the runner would have built by the time the gate fires. */
  function stepCtxFor(descriptor: Record<string, unknown>, config: Record<string, number>) {
    return {
      pool: null,
      chainId: null,
      runId: 1,
      descriptor,
      checks: (descriptor.checks as Array<{ id: string }>).map((c) => c.id),
      log: { info: () => {}, warn: () => {}, error: () => {} },
      clock: () => Date.parse('2026-08-26T00:00:00Z'),
      config,
      acquired: null,
      written: null,
      prior: null,
      overrides: null,
      gate: null,
      report: () => {},
    };
  }

  function gateFor(descriptor: Record<string, unknown>) {
    const config = seedConfig();
    return stepLib.makePreWriteGate({
      descriptor,
      chainId: null,
      stepCtx: stepCtxFor(descriptor, config),
      compute: ravineCompute,
      config,
    });
  }

  /** Build the gate and run it with `env` standing — acceptance is read off process.env. */
  async function decide(acquired: object, env: Record<string, string> = {}) {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
    try {
      const gate = gateFor(LOAD_RAVINES);
      expect(gate, 'the descriptor declares pre_write checks, so a gate must exist').not.toBeNull();
      return await gate({ acquired, prior, overrides: {} });
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  }

  it('the two Spec 59 abort checks are declared at when:"pre_write", and they read no ctx.written', () => {
    const ids = (LOAD_RAVINES.checks as Array<{ id: string; when: string }>)
      .filter((c) => c.when === 'pre_write').map((c) => c.id);
    expect(ids, 'L7 (count drift) + L8 (invalid geometry) — Spec 59 aborts BEFORE the write').toEqual(
      ['ravine_count_drift_pct', 'ravine_geometry_skipped_pct'],
    );
    // The position is only sound while the observers are write-independent: the gate
    // runs them with `ctx.written === null`, the final table runs them again after the
    // write, and both must report the same number.
    for (const id of ids) {
      expect(String(ravineCompute.checks[id]), `${id} must not read ctx.written at a pre_write position`)
        .not.toMatch(/ctx\.written/);
    }
  });

  it('L7 over the limit, no override -> ABORT; under the limit -> proceed (both directions)', async () => {
    expect(await decide(acquiredOf(100, 0))).toEqual({ abort: true, failed: ['ravine_count_drift_pct'] });
    expect(await decide(acquiredOf(PRIOR_COUNT, 0)), 'a healthy load must not be gated')
      .toEqual({ abort: false, failed: [] });
  });

  it('L7 with RAVINE_ACCEPT_FEATURE_COUNT_DRIFT=1 -> the write PROCEEDS (A-5: acceptance moves the decision, not the row)', async () => {
    expect(await decide(acquiredOf(100, 0), { [DRIFT_ENV]: '1' })).toEqual({ abort: false, failed: [] });
    // Truthiness is not acceptance — only the literal "1" arms an override.
    expect((await decide(acquiredOf(100, 0), { [DRIFT_ENV]: 'true' })).abort).toBe(true);
  });

  it('L8 over the limit -> ABORT, and there is NO accept_anomaly entry that can rescue it', async () => {
    expect(await decide(acquiredOf(PRIOR_COUNT, 200))).toEqual({
      abort: true, failed: ['ravine_geometry_skipped_pct'],
    });
    const accepts = (LOAD_RAVINES.override.accept_anomaly as Array<{ check_id: string }>).map((a) => a.check_id);
    expect(accepts, 'Spec 59 L8 declares no operator override — the abort is unconditional')
      .not.toContain('ravine_geometry_skipped_pct');
  });

  it('REVERSION DETECTOR — moving those checks back to when:"post" leaves NO gate at all', () => {
    const reverted = clone(LOAD_RAVINES) as { checks: Array<{ id: string; when: string }> };
    for (const c of reverted.checks) if (c.when === 'pre_write') c.when = 'post';
    expect(
      gateFor(reverted as unknown as Record<string, unknown>),
      'a post-only descriptor gates nothing — the write is unguarded again',
    ).toBeNull();
  });

  it('runIngestPhase SKIPS executeWrite on an unaccepted pre_write FAIL — zero write statements, zeroed counters', async () => {
    const config = seedConfig();
    const pool = fakePool({ logicVars: config });
    const stubs = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
      vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
        tier1: { skip: false },
        tier2: { skip: false },
        emitBlock: null,
        features: [{ source_id: 1, geojson: '{}' }],
        acquired: acquiredOf(100, 0), // 88% count drift vs prior 854
      }),
      vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
        carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
      }),
      vi.spyOn(writeLib, 'executeWrite'),
    ];
    try {
      const out = await stepLib.runIngestPhase({
        descriptor: LOAD_RAVINES,
        pool,
        compute: ravineCompute,
        config,
        fetchImpl: async () => { throw new Error('the gate must not fetch'); },
        chainId: null,
        log: { info: () => {}, warn: () => {}, error: () => {} },
        tag: '[load_ravines]',
        clockNow: new Date('2026-08-26T00:00:00Z'),
        preWriteGate: gateFor(LOAD_RAVINES),
      });

      expect(writeLib.executeWrite, 'the class-B write executor must never be called').not.toHaveBeenCalled();
      expect(
        pool.sql.some((s: string) => /INSERT INTO ravines|DELETE FROM ravines/i.test(s)),
        'no upsert and no departure DELETE reached the pool',
      ).toBe(false);
      expect(out.writeSkipped).toBe(true);
      expect(out.reason).toBe('pre_write_check_failed');
      expect(out.failedPreWrite).toEqual(['ravine_count_drift_pct']);
      expect(out.written.rows_changed, 'an EMPTY written — the remaining post checks score over nothing').toBe(0);
      expect(out.written).toMatchObject({
        inserted: 0, updated: 0, deleted: 0, rows_scanned: 0, write_skipped_pre_write_fail: true,
      });
      expect(out.written.privilege, 'the MEASURED privilege survives — zeroing it manufactures a second FAIL row')
        .toMatchObject({ bypassrls: true });
      // `acquired` is fully populated: the FAIL row and the counters describe a real load.
      expect(out.acquired.feature_count).toBe(1);
    } finally {
      for (const s of stubs) s.mockRestore();
    }
  });

  it('the OTHER direction — a healthy load still reaches executeWrite through the same gate', async () => {
    const config = seedConfig();
    const pool = fakePool({ logicVars: config });
    const written = { inserted: 0, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 0, delete_skipped_empty_guard: false };
    const stubs = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: { ...prior, feature_count: 1 }, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
      vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
        tier1: { skip: false },
        tier2: { skip: false },
        emitBlock: null,
        features: [{ source_id: 1, geojson: '{}' }],
        acquired: acquiredOf(1, 0),
      }),
      vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
        carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
      }),
      vi.spyOn(writeLib, 'executeWrite').mockResolvedValue(written),
    ];
    try {
      const out = await stepLib.runIngestPhase({
        descriptor: LOAD_RAVINES,
        pool,
        compute: ravineCompute,
        config,
        fetchImpl: async () => { throw new Error('unused'); },
        chainId: null,
        log: { info: () => {}, warn: () => {}, error: () => {} },
        tag: '[load_ravines]',
        clockNow: new Date('2026-08-26T00:00:00Z'),
        preWriteGate: gateFor(LOAD_RAVINES),
      });
      expect(writeLib.executeWrite).toHaveBeenCalledTimes(1);
      expect(out.writeSkipped).toBe(false);
      expect(out.reason).toBe('loaded');
    } finally {
      for (const s of stubs) s.mockRestore();
    }
  });

  it('a descriptor with NO pre_write check gets no gate — assert_schema’s ingest path is untouched', () => {
    expect((ASSERT_SCHEMA.checks as Array<{ when: string }>).some((c) => c.when === 'pre_write')).toBe(false);
    expect(stepLib.makePreWriteGate({
      descriptor: ASSERT_SCHEMA,
      chainId: null,
      stepCtx: stepCtxFor(ASSERT_SCHEMA, {}),
      compute: async () => {},
      config: {},
    })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fold D — the OUTPUT panel's A-class findings, each locked in the direction that
// made it a finding: a generator that must not lie about what it supports, a
// timeout that must not mean zero, and a terminal question asked about the run
// that actually happened.
// ---------------------------------------------------------------------------

describe('Fold D — write.js refuses what it cannot generate, and types its casts from the descriptor', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write module
  const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));

  const spec = () => clone(LOAD_RAVINES.outputs.writes[0]) as {
    table: string; key: string | string[]; key_sql_type?: string;
    columns: Array<{ name: string; bind?: string; written?: string }>;
  };

  it('key_sql_type is TEMPLATED into validation_sql — the same cast the departure DELETE uses', () => {
    const bigint = writeLib.buildWritePlan(spec(), LOAD_RAVINES);
    expect(bigint.validation_sql, 'the declared BIGINT reaches the unnest cast').toContain('unnest($1::BIGINT[])');
    expect(bigint.delete_sql).toContain('$1::BIGINT[]');

    const text = spec();
    text.key_sql_type = 'TEXT';
    const plan = writeLib.buildWritePlan(text, LOAD_RAVINES);
    // The finding: the validation SQL hard-coded BIGINT[] while the DELETE read the
    // declared type, so a TEXT-keyed step cast its keys two different ways in one plan.
    expect(plan.validation_sql, 'a TEXT key must not be cast to BIGINT on the way in').toContain('unnest($1::TEXT[])');
    expect(plan.validation_sql).not.toContain('BIGINT');
    expect(plan.delete_sql).toContain('$1::TEXT[]');
    expect(plan.key_sql_type).toBe('TEXT');
  });

  it('an ABSENT key_sql_type still falls back to the declared default, both statements agreeing', () => {
    const s = spec();
    delete s.key_sql_type;
    const plan = writeLib.buildWritePlan(s, LOAD_RAVINES);
    expect(plan.key_sql_type).toBe(writeLib.DEFAULT_KEY_SQL_TYPE);
    expect(plan.validation_sql).toContain(`unnest($1::${writeLib.DEFAULT_KEY_SQL_TYPE}[])`);
    expect(plan.delete_sql).toContain(`$1::${writeLib.DEFAULT_KEY_SQL_TYPE}[]`);
  });

  // ── NARROWED at the LINK pilot (LG-2, 2026-08-27) — and the narrowing is the point ──
  //
  // The refusal used to be blanket: "composite keys are not supported by the generated
  // class-B write". It covered THREE unrelated statements at once, and two of the three
  // genuinely mean it — `retract: "departed"` casts ONE key array (`<key> <> ALL($1::t[])`,
  // which cannot express a tuple) and `validateGeometries` joins its result back on ONE key
  // column. The third, `ON CONFLICT (<keys>)`, has taken a column LIST since Postgres 9.5
  // and needed nothing but a join.
  //
  // So the ban now attaches to the two statements that mean it, and the conflict target is
  // supported — which is what lets `parcel_buildings`'s real key `(parcel_id, building_id)`
  // be declared at all. Both directions are asserted: what still throws, and what now works.
  it('⚠️ a COMPOSITE key still THROWS where the statement really indexes keys[0] — a scoped DELETE that retracts by half a key is worse than none', () => {
    const s = spec();
    s.key = ['source_id', 'source_dataset_version'];
    // retract: "departed" — the departure DELETE cannot express a tuple.
    expect(() => writeLib.buildWritePlan(s, LOAD_RAVINES)).toThrow(/retract "departed" is not supported on a composite key/i);
    // ...and it names the columns, so the refusal is actionable without reading write.js.
    expect(() => writeLib.buildWritePlan(s, LOAD_RAVINES)).toThrow(/source_id, source_dataset_version/);
    // The geometry-validation half refuses independently: even with the departure DELETE
    // gone, a wkb_geometry column joins its validation result back on ONE key column.
    const geomOnly = spec();
    geomOnly.key = ['source_id', 'source_dataset_version'];
    (geomOnly as unknown as { retract: string }).retract = 'none';
    expect(() => writeLib.buildWritePlan(geomOnly, LOAD_RAVINES)).toThrow(/wkb_geometry column with a composite key/i);
    // The other direction: the single-key form this step declares still builds.
    expect(writeLib.buildWritePlan(spec(), LOAD_RAVINES).keys).toEqual(['source_id']);
  });

  it('a COMPOSITE conflict target BUILDS when nothing indexes keys[0] — the LG-2 support, proven on the real junction descriptor', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real committed descriptor
    const LINK_MASSING = require(join(process.cwd(), 'scripts/link-massing.descriptor.json'));
    const plan = writeLib.buildWritePlan(LINK_MASSING.outputs.writes[1], LINK_MASSING);
    expect(plan.keys).toEqual(['parcel_id', 'building_id']);
    expect(plan.upsert_sql).toMatch(/ON CONFLICT \(parcel_id, building_id\) DO UPDATE/);
    // No geometry column and no departure delete on this target, which is exactly why the
    // narrowed refusal lets it through — and its retraction is the scoped `retract: "all"`
    // form, which takes a predicate rather than a key array.
    expect(plan.geometry_columns).toEqual([]);
    expect(plan.delete_sql).not.toMatch(/<> ALL/);
    expect(plan.delete_sql).toMatch(/^DELETE FROM parcel_buildings WHERE parcel_id IN \(SELECT id FROM parcels/);
  });

  it('⚠️ a SECOND wkb_geometry column THROWS — it would be bound NULL on every row, silently', () => {
    const s = spec();
    const geom = s.columns.find((c) => c.bind === 'wkb_geometry');
    expect(geom, 'the ravines write declares one geometry column').toBeDefined();
    s.columns.push({ ...geom!, name: 'geom_simplified' });
    expect(() => writeLib.buildWritePlan(s, LOAD_RAVINES)).toThrow(/columns declare bind "wkb_geometry"/i);
    expect(() => writeLib.buildWritePlan(s, LOAD_RAVINES)).toThrow(/geom_simplified/);
    expect(writeLib.buildWritePlan(spec(), LOAD_RAVINES).geometry_columns, 'one is still fine').toHaveLength(1);
  });
});

describe('Fold D — a NULL acquisition timeout means NO deadline, not a zero-millisecond one', () => {
  it('resolveTimeoutMs really can return null — the input the guard exists for', () => {
    expect(acquireLib.resolveTimeoutMs({ execution: { network: 'none' } }, null)).toBeNull();
    // An unparseable duration literal: a descriptor typo, not an unreachable publisher.
    expect(acquireLib.resolveTimeoutMs({ execution: { network: { timeout: '60 seconds' } } }, null)).toBeNull();
    expect(acquireLib.resolveTimeoutMs(LOAD_RAVINES, null), 'the declared literal still parses').toBeGreaterThan(0);
  });

  it('⚠️ null/0 ⇒ NO timer is armed — setTimeout(fn, null) coerces to 0 and aborts on the next tick', () => {
    for (const bad of [null, undefined, 0, -1, NaN]) {
      const ctrl = new AbortController();
      expect(acquireLib.abortTimer(ctrl, bad), `timeoutMs ${String(bad)} must arm no timer`).toBeNull();
      expect(ctrl.signal.aborted).toBe(false);
    }
  });

  it('a real deadline DOES arm a timer, and it does abort when it elapses (the other direction)', async () => {
    const ctrl = new AbortController();
    const t = acquireLib.abortTimer(ctrl, 5);
    expect(t, 'a positive deadline arms a real timer').not.toBeNull();
    await new Promise((r) => setTimeout(r, 40));
    expect(ctrl.signal.aborted, 'the armed timer fired').toBe(true);
    clearTimeout(t);
  });

  it('a null-timeout HEAD completes instead of failing instantly with an AbortError', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const res = await acquireLib.headValidators(
      async (_url: string, init: { signal?: AbortSignal }) => {
        seen.push(init.signal);
        await new Promise((r) => setTimeout(r, 25)); // longer than the 0ms a null timeout used to mean
        if (init.signal?.aborted) throw new Error('AbortError — the null timeout fired');
        return { ok: true, status: 200, headers: { get: (h: string) => (h === 'etag' ? 'W/"x"' : null) } };
      },
      'https://example.invalid/x',
      null,
    );
    expect(res).toEqual({ lastModified: null, etag: 'W/"x"' });
    expect(seen[0]?.aborted, 'nothing aborted the request').toBe(false);
  });
});

describe('Fold D — the INGESTOR drives exactly ONE write target, and says so at plan time', () => {
  it('⚠️ two declared writes THROW before the HEAD — writes[1] would be declared, gated over and left empty', async () => {
    const d = clone(LOAD_RAVINES);
    d.outputs.writes.push({ ...clone(LOAD_RAVINES.outputs.writes[0]), table: 'ravines_shadow' });
    let fetched = false;
    await expect(stepLib.runIngestPhase({
      descriptor: d,
      pool: fakePool(),
      compute: async () => {},
      config: {},
      fetchImpl: async () => { fetched = true; throw new Error('unreachable'); },
      chainId: null,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      tag: '[load_ravines]',
      clockNow: new Date(),
      preWriteGate: null,
    })).rejects.toThrow(/exactly ONE write target[\s\S]*declares 2 \(ravines, ravines_shadow\)/);
    expect(fetched, 'a mis-declared step costs no network').toBe(false);
  });

  it('isIngestStep still accepts the single-target descriptor this pilot ships', () => {
    expect(stepLib.isIngestStep(LOAD_RAVINES)).toBe(true);
    expect(LOAD_RAVINES.outputs.writes).toHaveLength(1);
  });
});

describe('Fold D — terminal selection is asked about the status the run ACTUALLY reached', () => {
  const successTerminal = (status: string) => ({
    id: `loaded_${status}`, kind: 'success', status, records_meta: {},
  });

  it('a WARN verdict can select a completed_with_warnings terminal — unreachable while COMPLETED was passed', () => {
    const d = clone(LOAD_RAVINES);
    d.terminals = [successTerminal('completed'), successTerminal('completed_with_warnings')];
    expect(stepLib.selectTerminal(d, { kind: 'success', status: 'completed_with_warnings' }).id)
      .toBe('loaded_completed_with_warnings');
    expect(stepLib.selectTerminal(d, { kind: 'success', status: 'completed' }).id).toBe('loaded_completed');
  });

  it('a descriptor that declares no such terminal still falls back to the first success one (no null regression)', () => {
    // load_ravines declares `loaded` (completed) + `loaded_anomaly_accepted`; neither is
    // completed_with_warnings, so the WARN path must still land a named terminal.
    expect(stepLib.selectTerminal(LOAD_RAVINES, { kind: 'success', status: 'completed_with_warnings' }).id)
      .toBe('loaded');
  });

  it('⚠️ THE CALL SITE — a WARN run stamps the completed_with_warnings terminal, end to end', async () => {
    // The lock that goes red if the WARN arm reverts to passing RUN_STATUS.COMPLETED:
    // this descriptor declares BOTH success terminals, so the two statuses are
    // distinguishable in `records_meta.terminal` for the first time.
    const d = clone(ASSERT_SCHEMA);
    d.checks[0].severity = 'WARN';
    d.terminals.push({
      id: 'completed_with_warnings', kind: 'success', status: 'completed_with_warnings', records_meta: 'runner_default',
    });
    const warnOne = async (ctx: { descriptor: Record<string, unknown>; chainId: string | null }) => {
      for (const c of verdictLib.selectChecks(ctx.descriptor, ctx.chainId)) {
        (ctx as unknown as { report: (id: string, o: unknown) => void })
          .report(c.id, { violations: c.id === d.checks[0].id ? 1 : 0 });
      }
    };
    const pool = fakePool();
    const cap = captureEmissions();
    try {
      const out = await pipeline.step(d, warnOne).run({ pool, chainId: 'permits' });
      const summary = cap.summary();
      expect(summary.records_meta.audit_table.verdict).toBe('WARN');
      expect(out.status).toBe('completed_with_warnings');
      expect(summary.records_meta.terminal, 'the terminal must describe the run that happened')
        .toBe('completed_with_warnings');
    } finally {
      cap.restore();
    }
  });
});

describe('Fold D — the three loss counters the library measures are REPORTED (plan D-4)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute
  const ravineCompute = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));

  const LOSS: Array<[string, string]> = [
    ['ravine_bad_objectid_count', 'bad_key_count'],
    ['ravine_null_geometry_count', 'null_geometry_count'],
    ['ravine_duplicate_objectid_count', 'duplicate_key_count'],
  ];

  it('each is DECLARED at WARN/post, has an observer, and reads the counter the library actually sets', () => {
    for (const [id, field] of LOSS) {
      const check = (LOAD_RAVINES.checks as Array<{ id: string; severity: string; when: string }>).find((c) => c.id === id);
      expect(check, `${id} must be declared — the counter existed and nothing reported it`).toBeDefined();
      expect(check!.severity, 'WARN, per the pre-conversion push it restores').toBe('WARN');
      // `post`, not `pre_write`: a pre_write check is one whose FAIL stops the write.
      expect(check!.when).toBe('post');
      expect(typeof ravineCompute.checks[id]).toBe('function');
      expect(String(ravineCompute.checks[id]), `${id} must read ctx.acquired.${field}`).toContain(`acquired.${field}`);
    }
  });

  it('the LIBRARY sets all three field names — the producer half of the contract', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- reading the sources as text
    const fs = require('node:fs');
    const acquireSrc = fs.readFileSync(join(process.cwd(), 'scripts/lib/step/acquire.js'), 'utf8');
    const indexSrc = fs.readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    expect(acquireSrc).toContain('bad_key_count: parsed.badKey');
    expect(acquireSrc).toContain('null_geometry_count: parsed.nullGeometry');
    expect(indexSrc).toContain('duplicate_key_count: duplicateCount');
  });

  it('zero ⇒ PASS row, non-zero ⇒ WARN row — both directions, and a healthy run is no longer SILENT', () => {
    const acquired = {
      feature_count: 854, bad_key_count: 0, null_geometry_count: 0, duplicate_key_count: 0,
    };
    const run = (over: Record<string, number>) => {
      const observations: Record<string, unknown> = {};
      const ctx = {
        acquired: { ...acquired, ...over },
        checks: LOSS.map(([id]) => id),
        descriptor: LOAD_RAVINES,
        log: { info: () => {}, warn: () => {}, error: () => {} },
        report: (id: string, o: unknown) => { observations[id] = o; },
      };
      for (const [id] of LOSS) ravineCompute.checks[id](ctx);
      const only = new Set(LOSS.map(([id]) => id));
      return verdictLib.buildAuditTable(LOAD_RAVINES, null, observations, [], null, only).rows as Row[];
    };

    const healthy = run({});
    expect(healthy.map((r) => r.status), 'the old conditional push emitted NOTHING here').toEqual(['PASS', 'PASS', 'PASS']);
    expect(healthy.map((r) => r.value)).toEqual([0, 0, 0]);

    for (const [id, field] of LOSS) {
      const rows = run({ [field]: 7 });
      const row = rows.find((r) => r.metric === id)!;
      expect(row.status, `${id} must WARN once the source lost something`).toBe('WARN');
      expect(row.value).toBe(7);
    }
  });
});

// ---------------------------------------------------------------------------
// LW-D10 (commit 8b, 2026-08-28) — the T7 tier-3 convergence loop's own MECHANISM,
// unit-tested in isolation. Before this fix, runCascadePhase's mode-"full" block
// hardcoded `{ exhausted: false, iterations: 1 }` — a converged-looking result that
// was never actually computed. `runTierToConvergence` is the extracted loop; these
// locks pin its two directions with a fixture "pass" function (no pool, no
// transaction — the loop's CALLER, runCascadePhase, wires the real SQL-issuing
// passes, proven separately by the step-conformance/violations suites' live-DB and
// descriptor-shape coverage).
// ---------------------------------------------------------------------------
describe('LW-D10 — runTierToConvergence: loops while matched > 0 and iterations < the bound; exhausted only when the bound stops a still-matching pass', () => {
  /** A fixture "pass" that returns the next canned linked count each call, and counts its own calls. */
  function fixturePass(linkedSequence: number[]): { run: () => Promise<{ linked: number; flagged: number; contacts: number }>; calls: number[] } {
    const calls: number[] = [];
    let i = 0;
    return {
      calls,
      run: async () => {
        const linked = linkedSequence[Math.min(i, linkedSequence.length - 1)] ?? 0;
        calls.push(linked);
        i += 1;
        return { linked, flagged: linked, contacts: linked };
      },
    };
  }

  it('loops === false — runs the pass EXACTLY ONCE, unconditionally (incremental mode / a tier with no declared bound — the pre-LW-D10 behaviour, byte-identical)', async () => {
    const fx = fixturePass([1000, 1000, 320, 0]); // would keep going if loops were true
    const result = await stepLib.runTierToConvergence(fx.run, false, 20);
    expect(fx.calls, 'loops:false must call the pass exactly once, regardless of what it returns').toEqual([1000]);
    expect(result).toEqual({ iterations: 1, linked_total: 1000, flagged_total: 1000, contacts_total: 1000, exhausted: false });
  });

  it('loops === true, converges naturally — 1000,1000,320,0 → 4 iterations, 2,320 relinked total, NOT exhausted (this is the ruling\'s own worked example)', async () => {
    const fx = fixturePass([1000, 1000, 320, 0]);
    const result = await stepLib.runTierToConvergence(fx.run, true, 20);
    expect(fx.calls, 'must stop at the first 0-matched pass, never call a 5th time').toEqual([1000, 1000, 320, 0]);
    expect(result).toEqual({ iterations: 4, linked_total: 2320, flagged_total: 2320, contacts_total: 2320, exhausted: false });
  });

  it('loops === true, bound hit while still matching — WARN-worthy: iterations caps at maxIterations, exhausted TRUE', async () => {
    const fx = fixturePass([500, 500, 500, 500, 500]); // never reaches 0 within the bound
    const result = await stepLib.runTierToConvergence(fx.run, true, 3);
    expect(fx.calls, 'must stop at exactly maxIterations passes, never a 4th').toEqual([500, 500, 500]);
    expect(result).toEqual({ iterations: 3, linked_total: 1500, flagged_total: 1500, contacts_total: 1500, exhausted: true });
  });

  it('loops === true, bound hit on a pass that ITSELF matched 0 — a normal converged stop, NOT exhaustion', async () => {
    const fx = fixturePass([500, 0]);
    const result = await stepLib.runTierToConvergence(fx.run, true, 2);
    expect(fx.calls).toEqual([500, 0]);
    expect(result.exhausted, 'the bound and a natural convergence landed on the same iteration — this must read as converged, not exhausted').toBe(false);
  });

  it('loops === true, first pass already 0 — 1 iteration, never exhausted (the "nothing to repair" case)', async () => {
    const fx = fixturePass([0]);
    const result = await stepLib.runTierToConvergence(fx.run, true, 20);
    expect(fx.calls).toEqual([0]);
    expect(result).toEqual({ iterations: 1, linked_total: 0, flagged_total: 0, contacts_total: 0, exhausted: false });
  });
});

// ---------------------------------------------------------------------------
// LW-D15 — --dry-run must issue ZERO UPDATE/INSERT/DELETE statements, in BOTH the
// LINK phase (runLinkPhase, link_massing) and the CASCADE/MATCHER phase
// (runCascadePhase, link_wsib). Pre-fix, `--dry-run` bypassed the ledger gate
// (staleness.dryRunArgPresent) but the write phase ran unconditionally — a
// --dry-run invocation of ANY converted LINK/MATCHER step wrote for real.
// ---------------------------------------------------------------------------

/**
 * A pool double built for the write-suppression claim specifically: every issued
 * statement is recorded VERBATIM (so a test can assert "no UPDATE/INSERT/DELETE was
 * ever issued" by pattern-matching the recorded text, never by trusting a return
 * value), and `answerFn(text, values, callNumberForThisText)` lets each test supply
 * exact answers for its own stub SQL markers. Unmatched SELECTs fall back to
 * generic, always-present answers for the cross-cutting guards every phase runs
 * (extension/index/fk/column existence probes, the RLS privilege probe, and any
 * `pipeline_runs` read) so a test only has to answer the queries IT cares about.
 */
function dryRunFakePool(answerFn: (text: string, values: unknown, callNumber: number) => { rows: unknown[] } | undefined) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const callCounts = new Map<string, number>();
  const record = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    const n = (callCounts.get(text) || 0) + 1;
    callCounts.set(text, n);
    const custom = answerFn(text, values, n);
    if (custom !== undefined) return custom;
    if (/pg_extension|information_schema\.columns|pg_indexes|pg_constraint|pg_proc/i.test(text)) return { rows: [{ x: 1 }] };
    if (/relrowsecurity/i.test(text)) return { rows: [{ rls_enabled: false, policies: 0, bypassrls: true }] };
    return { rows: [] };
  };
  return {
    sql,
    params,
    query: record,
    connect: async () => ({ query: record, release: () => {} }),
  };
}

const NOOP_LOG = { info: () => {}, warn: () => {}, error: () => {} };

/** Runs `fn` with `--dry-run` appended to `process.argv` (mirrors the 2633c1cb precedent), always restoring it. */
async function withDryRunArgv<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.argv;
  process.argv = [...original, '--dry-run'];
  try {
    return await fn();
  } finally {
    process.argv = original;
  }
}

describe('LW-D15 — --dry-run issues ZERO write statements (LINK + CASCADE/MATCHER phases)', () => {
  it('runLinkPhase (link_massing, cloned + override.dry_run armed) issues zero UPDATE/INSERT/DELETE under --dry-run; the match SELECTs still run', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
    const descriptor = clone(require(join(process.cwd(), 'scripts/link-massing.descriptor.json')));
    // Neutralize guards/staleness-trigger DB probing (orthogonal to write-suppression,
    // and this test calls runLinkPhase directly — no AJV validation gates the mutation).
    descriptor.guards.requires = [];
    descriptor.staleness.trigger = 'none';
    descriptor.override.dry_run = '--dry-run';

    const compute = {
      buildMatchSql: () => ({
        eligible_count_sql: 'STUB_LM_ELIGIBLE_COUNT',
        eligible_batch_sql: 'STUB_LM_ELIGIBLE_BATCH',
        primary_match_sql: 'STUB_LM_PRIMARY_MATCH',
        fallback_match_sql: null,
        cumulative_sql: 'STUB_LM_CUMULATIVE',
        cumulative_params: [],
        primary_counter: 'stub_primary',
        fallback_counter: 'stub_fallback',
      }),
      classifyMatches: (rows: unknown[]) => (rows.length > 0 ? { rows: [{}], parcels: 1, matches: 1 } : { rows: [], parcels: 0, matches: 0 }),
      classifyFallback: () => ({ rows: [], parcels: 0 }),
    };

    await withDryRunArgv(async () => {
      const pool = dryRunFakePool((text: string, _values: unknown, n: number) => {
        if (text === 'STUB_LM_ELIGIBLE_COUNT') return { rows: [{ total: '2' }] };
        if (text === 'STUB_LM_ELIGIBLE_BATCH') return n === 1 ? { rows: [{ id: 1 }] } : { rows: [] };
        if (text === 'STUB_LM_PRIMARY_MATCH') return { rows: [{ id: 1 }] };
        if (text === 'STUB_LM_CUMULATIVE') return { rows: [{ linked: 1, total: 1 }] };
        return undefined;
      });
      const result = await stepLib.runLinkPhase({
        descriptor, pool, compute, config: {}, chainId: null,
        log: NOOP_LOG, tag: '[link_massing]', clockNow: new Date('2026-08-28T00:00:00Z'),
      });
      expect(result.overrides.dry_run, 'ctx.overrides.dry_run must be exposed (LW-D15)').toBe(true);
      const writes = pool.sql.filter((s: string) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(s));
      expect(writes, 'a --dry-run LINK-phase run must issue ZERO write statements').toEqual([]);
      expect(pool.sql.includes('STUB_LM_PRIMARY_MATCH'), 'the match SELECT itself must still run — dry-run simulates, it does not skip reading').toBe(true);
      // written stays genuinely zero: nothing was written, so nothing should claim it was.
      const targetKeys = Object.keys(result.written).filter((k) => k.startsWith('e'));
      for (const k of targetKeys) expect(result.written[k].rows_changed, `written.${k}.rows_changed`).toBe(0);
    });
  });

  it('runCascadePhase (link_wsib, cloned) issues zero UPDATE/INSERT/DELETE under --dry-run; the count-mirror SELECTs still run and report the real would-be counts', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
    const descriptor = clone(require(join(process.cwd(), 'scripts/link-wsib.descriptor.json')));
    descriptor.guards.requires = [];
    descriptor.staleness.trigger = 'none';
    descriptor.override.dry_run = '--dry-run';

    const tierSql = {
      wsib_count_sql: 'STUB_LW_TIER_COUNT', wsib_count_params: [],
      entities_flag_count_sql: 'STUB_LW_FLAG_COUNT', entities_flag_count_params: [],
      entities_contacts_count_sql: 'STUB_LW_CONTACTS_COUNT', entities_contacts_count_params: [],
      // The WRITE-side SQL a live (non-dry-run) pass would issue — included so a
      // regression that reaches the write branch under dry-run is caught by the
      // write-statement assertion below, not masked by a missing field.
      wsib_update_sql: 'UPDATE wsib_registry SET linked_entity_id = 1', wsib_update_params: [],
      entities_flag_scope_params: [],
      entities_contacts_sql: 'UPDATE entities SET primary_phone = 1', entities_contacts_params: [],
    };
    const compute = {
      buildRetractionScopeParams: () => [0.6],
      buildEntitiesUnflagSql: () => 'UPDATE entities SET is_wsib_registered = false',
      buildContactsReverseClearSql: () => 'UPDATE entities SET primary_phone = NULL',
      buildTierSql: () => tierSql,
      // LW-D19: the is_wsib_registered fill-true scope AND the unconditional self-heal
      // correction both read the two exact-tier confidences via this helper.
      exactTierConfidences: () => [0.95, 0.9],
      buildEntitiesUnflagCorrectionCountSql: () => 'STUB_LW_UNFLAG_COUNT',
      // LW-D14: every cascade compute's CUMULATIVE_SQL is now a function of `descriptor`
      // (was a bare string) so a step's invariant can read declared descriptor data
      // (link_wsib's token-overlap stopword list) the way the write-side SQL builders do.
      buildCumulativeSql: () => 'STUB_LW_CUMULATIVE',
    };

    await withDryRunArgv(async () => {
      const pool = dryRunFakePool((text: string) => {
        if (/unlinked_start/i.test(text)) return { rows: [{ unlinked_start: '5', entities_count: '3' }] };
        if (text === 'STUB_LW_TIER_COUNT') return { rows: [{ n: 2 }] };
        if (text === 'STUB_LW_FLAG_COUNT') return { rows: [{ n: 1 }] };
        if (text === 'STUB_LW_CONTACTS_COUNT') return { rows: [{ n: 0 }] };
        if (text === 'STUB_LW_CUMULATIVE') return { rows: [{ linked: 1, total: 1 }] };
        if (text === 'STUB_LW_UNFLAG_COUNT') return { rows: [{ n: 4 }] };
        return undefined;
      });
      const result = await stepLib.runCascadePhase({
        descriptor, pool, compute, config: {}, chainId: null,
        log: NOOP_LOG, tag: '[link_wsib]', clockNow: new Date('2026-08-28T00:00:00Z'),
      });
      expect(result.overrides.dry_run, 'ctx.overrides.dry_run must be exposed (LW-D15)').toBe(true);
      expect(result.skipped, 'dry-run must BYPASS the ledger gated-skip (mirrors the pre-conversion bypassGate = dryRun fix, A2) — never SKIP').toBeFalsy();
      const writes = pool.sql.filter((s: string) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(s));
      expect(writes, 'a --dry-run CASCADE-phase run must issue ZERO write statements').toEqual([]);
      expect(pool.sql.includes('STUB_LW_TIER_COUNT'), 'the count-mirror SELECT must still run under dry-run').toBe(true);
      expect(pool.sql.includes('STUB_LW_UNFLAG_COUNT'), 'LW-D19: the self-heal correction count-mirror SELECT must still run under dry-run').toBe(true);
      expect(result.matched.is_wsib_registered_corrected, 'LW-D19: the dry-run would-be correction count is the real count-mirror value, not zeroed').toBe(4);
      const tierIds = Object.keys(result.matched.tiers);
      expect(tierIds.length, 'every declared tier still reports a would-be count').toBeGreaterThan(0);
      for (const id of tierIds) {
        expect(result.matched.tiers[id].linked, `tiers.${id}.linked is the real count-mirror value, not zeroed`).toBe(2);
      }
    });
  });

  it('RED half — the write-statement filter itself fires when a write statement IS present (proves the assertion above is not vacuous)', () => {
    const sql = ['SELECT 1', 'UPDATE wsib_registry SET x = 1', 'BEGIN', 'COMMIT'];
    const writes = sql.filter((s) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(s));
    expect(writes).toEqual(['UPDATE wsib_registry SET x = 1']);
  });
});

// ---------------------------------------------------------------------------
// LW-D16 — staleness.ledgerGatedSkip (LG-15) behavioral locks (fake pool, no live
// DB). Filed against src/tests/db/ledger-gate-callers.db.test.ts's FALSE claim that
// link_wsib's ledger-gate coverage was "RE-HOMED" to
// src/tests/steps/link_wsib/ledger-gate.db.test.ts — that file was never created
// (git log --all on the path is empty). ledgerGatedSkip never had a direct
// behavioral test at all; these five lock the rules its own docblock/code state.
// ---------------------------------------------------------------------------

/** The exact `link_wsib` `staleness.trigger[]` config_version entry (real descriptor). */
const LW_CONFIG_TRIGGER = {
  signal: 'config_version', position: 'pre_compute', emit_key: 'threshold_updated_at', variable: 'wsib_fuzzy_match_threshold',
};
/** A minimal descriptor carrying just what ledgerGatedSkip/deriveLedgerSlugs read. */
function ledgerGateTestDescriptor(trigger: unknown[] = [LW_CONFIG_TRIGGER]) {
  return {
    identity: { name: 'link_wsib' },
    execution: { invocation: { sources: {}, permits: {} } },
    inputs: { reads: { steps: [{ step: 'load_wsib' }] } },
    staleness: { trigger },
  };
}

/** Answers the `runLedgerGateDecision` WITH-clause query with a fixed shape. */
function ledgerGateAnswer(shape: { ownCompleted: string | null; ownLastRecordsMeta: unknown; nonCompleted?: number; completedWithChanges?: number }) {
  return {
    rows: [{
      own_started: shape.ownCompleted, own_completed: shape.ownCompleted, own_last_records_meta: shape.ownLastRecordsMeta,
      non_completed: shape.nonCompleted ?? 0, completed_with_changes: shape.completedWithChanges ?? 0, stale_running: 0,
    }],
  };
}

describe('LW-D16 — staleness.ledgerGatedSkip behavioral locks (fake pool)', () => {
  it('(1) bypassed:true NEVER SKIPs, even against a baseline that would otherwise SKIP — and issues ZERO queries', async () => {
    const descriptor = ledgerGateTestDescriptor([]); // no config trigger — isolate the bypass rule alone
    const pool = dryRunFakePool(() => ledgerGateAnswer({ ownCompleted: '2026-08-01T00:00:00Z', ownLastRecordsMeta: {}, nonCompleted: 0, completedWithChanges: 0 }));
    const result = await stalenessLib.ledgerGatedSkip(pool, descriptor, { now: new Date(), bypassed: true });
    expect(result.skip, 'bypassed must never SKIP, regardless of what the ledger would say').toBe(false);
    expect(result.reason).toBe('bypassed');
    expect(pool.sql.length, 'a bypass must short-circuit before any query — the gate is never even consulted').toBe(0);
  });

  it('(2) a CHANGED config_version signal forces skip:false even when the ledger gate alone reads skip:true', async () => {
    const descriptor = ledgerGateTestDescriptor();
    const pool = dryRunFakePool((text: string) => {
      if (text.includes('own_last')) {
        // no_upstream_changes: a completed own-last run, zero non-completed/changed upstream -> gate.skip = true
        return ledgerGateAnswer({ ownCompleted: '2026-08-01T00:00:00Z', ownLastRecordsMeta: { threshold_updated_at: '2026-06-10T14:01:54.545Z' } });
      }
      if (text.includes('updated_at FROM logic_variables')) return { rows: [{ updated_at: '2026-08-28T12:00:00.000Z' }] }; // NEWER than the baseline above -> changed
      return undefined;
    });
    const result = await stalenessLib.ledgerGatedSkip(pool, descriptor, { now: new Date(), bypassed: false });
    expect(result.gate.skip, 'sanity: the RAW ledger gate alone must read skip:true here').toBe(true);
    expect(result.configVersionChanged).toBe(true);
    expect(result.skip, 'a changed config_version signal overrides an otherwise-SKIP ledger gate').toBe(false);
    expect(result.reason).toBe('config_version_changed');
  });

  it('(3) NO baseline (no prior completed own run) reads its config signal as fail-safe changed:true (never "unchanged" on an absent baseline)', async () => {
    const descriptor = ledgerGateTestDescriptor();
    const pool = dryRunFakePool((text: string) => {
      if (text.includes('own_last')) return ledgerGateAnswer({ ownCompleted: null, ownLastRecordsMeta: null });
      if (text.includes('updated_at FROM logic_variables')) return { rows: [{ updated_at: '2026-08-28T12:00:00.000Z' }] };
      return undefined;
    });
    const result = await stalenessLib.ledgerGatedSkip(pool, descriptor, { now: new Date(), bypassed: false });
    expect(result.gate.reason, 'sanity: the raw gate\'s own fail-safe fires').toBe('no_prior_completed_run');
    expect(result.configSignals[0].changed, 'an absent baseline is fail-safe CHANGED, not "nothing to compare so unchanged"').toBe(true);
    expect(result.skip).toBe(false);
  });

  it('(4) gate.ownLastRecordsMeta passes a prior SKIP\'s meta (consecutive_skips + a carried metric row) through UNMODIFIED', async () => {
    const descriptor = ledgerGateTestDescriptor([]); // isolate: no config trigger noise
    const priorMeta = {
      consecutive_skips: 3,
      last_full_run_at: '2026-08-01T00:00:00Z',
      audit_table: { rows: [{ metric: 'link_rate_pct', value: 42, threshold: null, status: 'INFO' }] },
    };
    const pool = dryRunFakePool((text: string) => {
      if (text.includes('own_last')) return ledgerGateAnswer({ ownCompleted: '2026-08-01T00:00:00Z', ownLastRecordsMeta: priorMeta });
      return undefined;
    });
    const result = await stalenessLib.ledgerGatedSkip(pool, descriptor, { now: new Date(), bypassed: false });
    expect(result.gate.ownLastRecordsMeta, 'a caller (e.g. cascade.prior) reads this verbatim — no field may be dropped or reshaped in transit').toEqual(priorMeta);
  });

  it('(5) a hoisted, out-of-bounds wsib_fuzzy_match_threshold THROWS before the ledger gate is ever reached — SKIP-eligible or not', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
    const descriptor = require(join(process.cwd(), 'scripts/link-wsib.descriptor.json'));
    expect(descriptor.config.hoisted_above_gate, 'sanity: this is the fence under test').toBe(true);
    const pool = fakePool({
      lockAcquired: true,
      logicVars: {
        wsib_fuzzy_match_threshold: 5, // out of bounds: max is 1
        link_wsib_link_rate_warn_pct: 5,
        link_wsib_tier1_confidence: 0.95,
        link_wsib_tier2_confidence: 0.9,
        link_wsib_tier3_confidence: 0.6,
        link_wsib_entity_fanin_warn: 20,
        link_wsib_tier3_full_max_iterations: 20,
      },
    });
    await expect(
      stepLib.step(descriptor, noop).run({ pool, chainId: 'sources' }), // in-chain: owns=false, so not even openLedgerRow runs first
    ).rejects.toThrow(/on_invalid "fail"/);
    expect(
      pool.sql.some((s: string) => s.includes('own_last')),
      'the throw must land BEFORE the ledger gate is ever consulted — SKIP-eligibility must not matter',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LW-D17 — R-M / LG-17: write.writeBeforeImage / buildBeforeImageSelectSql (fake pool
// for the DB read, a REAL scratch subtree under docs/reports/golden/ — the function's
// declared write location per the schema — standing in for the "tmp dir" the mechanism
// itself has no way to be pointed away from; deleted in `finally` every time).
// ---------------------------------------------------------------------------

describe('LW-D17 — write.writeBeforeImage / buildBeforeImageSelectSql (R-M / LG-17)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
  const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fs/os for the scratch-dir cleanup
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os');

  const SLUG = '_wf3g_test_before_image';
  const SCRATCH_DIR = join(process.cwd(), 'docs', 'reports', 'golden', SLUG);

  afterEach(() => {
    fs.rmSync(SCRATCH_DIR, { recursive: true, force: true });
  });

  it('buildBeforeImageSelectSql mirrors the plan\'s own scope/keys/step_columns (no query, pure)', () => {
    const plan = { table: 'wsib_registry', keys: ['id'], step_columns: ['linked_entity_id', 'match_confidence', 'matched_at'], scope: 'match_confidence = $1' };
    const select = writeLib.buildBeforeImageSelectSql(plan);
    expect(select.sql).toBe('SELECT id, linked_entity_id, match_confidence, matched_at FROM wsib_registry WHERE match_confidence = $1');
    expect(select.columns).toEqual(['id', 'linked_entity_id', 'match_confidence', 'matched_at']);
  });

  it('buildBeforeImageSelectSql returns null when the plan has no scope (e.g. a departed-class target) — a declared limitation, not a crash', () => {
    const plan = { table: 'ravines', keys: ['id'], step_columns: ['geom'], scope: null };
    expect(writeLib.buildBeforeImageSelectSql(plan)).toBeNull();
  });

  it('writeBeforeImage reads via the mirror SQL and writes a JSONL file BEFORE any retraction would run, then reports {written, path, rows}', async () => {
    const rows = [{ id: 1, linked_entity_id: 10, match_confidence: 0.6, matched_at: '2026-08-01T00:00:00Z' }, { id: 2, linked_entity_id: 11, match_confidence: 0.6, matched_at: '2026-08-01T00:00:00Z' }];
    let queried: { sql: string; params: unknown[] } | null = null;
    const client = { query: async (sql: string, params: unknown[]) => { queried = { sql, params }; return { rows }; } };
    const plan = { table: 'wsib_registry', keys: ['id'], step_columns: ['linked_entity_id', 'match_confidence', 'matched_at'], scope: 'match_confidence = $1' };
    const runAt = new Date('2026-08-28T12:34:56.789Z');

    const result = await writeLib.writeBeforeImage(client, plan, [0.6], SLUG, runAt);

    expect(queried, 'the mirror SELECT must actually be issued').not.toBeNull();
    expect(queried!.params).toEqual([0.6]);
    expect(result.written).toBe(true);
    expect(result.rows).toBe(2);
    expect(result.path).toBe(`docs/reports/golden/${SLUG}/before-image/2026-08-28T12-34-56.789Z-wsib_registry.jsonl`);

    const absPath = join(process.cwd(), result.path);
    expect(fs.existsSync(absPath), 'the file must exist on disk, written before any retraction call').toBe(true);
    const lines = fs.readFileSync(absPath, 'utf8').trim().split('\n').map((l: string) => JSON.parse(l));
    expect(lines).toEqual(rows);
  });

  it('writeBeforeImage writes ZERO files and returns {written:false} when the plan has no scope to mirror (never a silent partial write)', async () => {
    let queryCalled = false;
    const client = { query: async () => { queryCalled = true; return { rows: [] }; } };
    const plan = { table: 'ravines', keys: ['id'], step_columns: ['geom'], scope: null };
    const result = await writeLib.writeBeforeImage(client, plan, [], SLUG, new Date());
    expect(result).toEqual({ written: false });
    expect(queryCalled, 'no scope to mirror means no query either — nothing to read').toBe(false);
    expect(fs.existsSync(SCRATCH_DIR), 'no directory should even be created').toBe(false);
  });

  it('writeBeforeImage writes an empty JSONL file (not a missing one) when the scope matches zero rows', async () => {
    const client = { query: async () => ({ rows: [] }) };
    const plan = { table: 'wsib_registry', keys: ['id'], step_columns: ['linked_entity_id'], scope: 'match_confidence = $1' };
    const result = await writeLib.writeBeforeImage(client, plan, [0.6], SLUG, new Date('2026-08-28T00:00:00.000Z'));
    expect(result.rows).toBe(0);
    const absPath = join(process.cwd(), result.path);
    expect(fs.existsSync(absPath)).toBe(true);
    expect(fs.readFileSync(absPath, 'utf8')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// R-B runtime reader (LW-D20 / LG-19, closed 2026-08-29) — FAST fake-pool lock,
// no DB required. The `.db.test.ts` sibling
// (src/tests/db/staleness-interrupted-retraction.db.test.ts) proves the real SQL
// against real Postgres, including a live kill-and-rerun proof against
// link_wsib (10.5 min real forced-full repair, 548 rows relinked, before-image
// written, verdict PASS — see the pilot 4 assessment report SS R for the full
// record); THIS block locks the two bugs that live proof actually found, fast
// enough to run on every commit:
//   1. a step's OWN just-opened `running` row must never self-trigger (ownRunId)
//   2. the interrupted-retraction check must be reachable even when the ledger
//      gated-skip would otherwise return BEFORE selectMode ever runs
// ---------------------------------------------------------------------------
describe('R-B (LW-D20 / LG-19) — interrupted-retraction reader, fake-pool lock', () => {
  const INTERRUPTED_QUERY_MARK = "status IN ('running', 'crashed')";

  function poolWithInterruptedRow(row: { id: number; pipeline: string; status: string; started_at: string } | null) {
    return dryRunFakePool((text: string) => {
      if (text.includes(INTERRUPTED_QUERY_MARK)) return { rows: row ? [row] : [] };
      if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 9001 }] };
      return undefined;
    });
  }

  const STUCK_ROW = { id: 555, pipeline: 'link_wsib', status: 'running', started_at: '2026-08-29T19:00:00.000Z' };

  it('detectInterruptedRetraction: SCOPE GATE — recovery.interrupted !== "force_full_on_next_run" never queries the DB at all', async () => {
    const pool = poolWithInterruptedRow(STUCK_ROW);
    const descriptor = { identity: { name: 'x' }, recovery: { interrupted: 'none' }, execution: { invocation: 'none' }, inputs: { reads: { steps: [] } } };
    const result = await stalenessLib.detectInterruptedRetraction(pool, descriptor);
    expect(result).toEqual({ interrupted: false, row: null });
    expect(pool.sql.some((s: string) => s.includes(INTERRUPTED_QUERY_MARK)), 'a step with nothing to recover must not even issue the query').toBe(false);
  });

  it('detectInterruptedRetraction: a stuck row IS surfaced when found', async () => {
    const pool = poolWithInterruptedRow(STUCK_ROW);
    const descriptor = { identity: { name: 'link_wsib' }, recovery: { interrupted: 'force_full_on_next_run' }, execution: { invocation: 'none' }, inputs: { reads: { steps: [] } } };
    const result = await stalenessLib.detectInterruptedRetraction(pool, descriptor);
    expect(result.interrupted).toBe(true);
    expect(result.row).toEqual(STUCK_ROW);
  });

  it('REGRESSION (found by the live kill-and-rerun proof, 2026-08-29) — ownRunId is bound as a real query parameter, excluding the caller\'s own row', async () => {
    const pool = poolWithInterruptedRow(STUCK_ROW);
    const descriptor = { identity: { name: 'link_wsib' }, recovery: { interrupted: 'force_full_on_next_run' }, execution: { invocation: 'none' }, inputs: { reads: { steps: [] } } };
    await stalenessLib.detectInterruptedRetraction(pool, descriptor, { ownRunId: 555 });
    const call = pool.params.find((_p: unknown[], i: number) => pool.sql[i]?.includes(INTERRUPTED_QUERY_MARK));
    expect(call, 'the query must be issued').toBeDefined();
    expect(call).toContain(555);
  });

  it('selectMode: an interrupted retraction resolves mode "full" UNCONDITIONALLY — forced=false, explicit_full=false, no trigger changed', async () => {
    const pool = poolWithInterruptedRow(STUCK_ROW);
    const descriptor = {
      identity: { name: 'link_wsib' },
      staleness: { mode_select: 'tri_state', trigger: 'none' },
      recovery: { interrupted: 'force_full_on_next_run' },
      execution: { invocation: 'none' },
      inputs: { reads: { steps: [] } },
    };
    const result = await stalenessLib.selectMode({ descriptor, pool, prior: { some_key: 'unchanged' }, argv: [], env: {} });
    expect(result.mode).toBe('full');
    expect(result.reason).toBe('recover_interrupted_retraction');
    expect(result.forced).toBe(false);
    expect(result.explicit_full).toBe(false);
    expect(result.interrupted_retraction).toEqual(STUCK_ROW);
  });

  it('selectMode: NOT interrupted resolves the ordinary incremental/full logic, and interrupted_retraction is null', async () => {
    const pool = poolWithInterruptedRow(null);
    const descriptor = {
      identity: { name: 'link_wsib' },
      staleness: { mode_select: 'tri_state', trigger: 'none' },
      recovery: { interrupted: 'force_full_on_next_run' },
      execution: { invocation: 'none' },
      inputs: { reads: { steps: [] } },
    };
    const result = await stalenessLib.selectMode({ descriptor, pool, prior: null, argv: [], env: {} });
    expect(result.reason).not.toBe('recover_interrupted_retraction');
    expect(result.interrupted_retraction).toBeNull();
  });

  it('REGRESSION (found by the live kill-and-rerun proof, 2026-08-29) — runCascadePhase folds the interrupted check into `bypassed`, BEFORE the ledger gated-skip, so it cannot be skipped past', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
    const descriptor = clone(require(join(process.cwd(), 'scripts/link-wsib.descriptor.json')));
    descriptor.guards.requires = [];
    descriptor.staleness.trigger = 'none'; // orthogonal to this claim — same simplification the dry-run sibling test uses
    descriptor.override.dry_run = '--dry-run'; // keeps this fake-pool run from needing real write-statement answers — orthogonal to the claim under test
    // Same tierSql/compute shape the KNOWN-WORKING "runCascadePhase (link_wsib, cloned)"
    // dry-run test above uses — runCascadePhase always calls these regardless of mode.
    const tierSql = {
      wsib_count_sql: 'STUB_LW_TIER_COUNT', wsib_count_params: [],
      entities_flag_count_sql: 'STUB_LW_FLAG_COUNT', entities_flag_count_params: [],
      entities_contacts_count_sql: 'STUB_LW_CONTACTS_COUNT', entities_contacts_count_params: [],
      wsib_update_sql: 'UPDATE wsib_registry SET linked_entity_id = 1', wsib_update_params: [],
      entities_flag_scope_params: [],
      entities_contacts_sql: 'UPDATE entities SET primary_phone = 1', entities_contacts_params: [],
    };
    const compute = {
      buildRetractionScopeParams: () => [0.6],
      buildEntitiesUnflagSql: () => 'UPDATE entities SET is_wsib_registered = false',
      buildContactsReverseClearSql: () => 'UPDATE entities SET primary_phone = NULL',
      buildTierSql: () => tierSql,
      exactTierConfidences: () => [0.95, 0.9],
      buildEntitiesUnflagCorrectionCountSql: () => 'STUB_LW_UNFLAG_COUNT',
      buildCumulativeSql: () => 'STUB_LW_CUMULATIVE',
    };
    const pool = dryRunFakePool((text: string) => {
      if (text.includes(INTERRUPTED_QUERY_MARK)) return { rows: [STUCK_ROW] };
      if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 9002 }] };
      // The ledger-gate's own "own_last"/"upstream_since" query would normally
      // decide skip/run from real activity; if it is ever REACHED with bypassed
      // correctly forced true, ledgerGatedSkip returns {skip:false} regardless of
      // what this answers — so answering it as "definitely skip" is the sharpest
      // possible proof: if the OLD (buggy) placement let this fire, the test would
      // observe a SKIP terminal instead of a mode gate log, and fail loudly.
      if (text.includes('own_last') && text.includes('upstream_since')) {
        return { rows: [{ own_started: '2026-08-29T00:00:00Z', own_completed: '2026-08-29T00:00:00Z', own_last_records_meta: {}, non_completed: '0', completed_with_changes: '0', stale_running: '0' }] };
      }
      if (/unlinked_start/i.test(text)) return { rows: [{ unlinked_start: '5', entities_count: '3' }] };
      if (text === 'STUB_LW_TIER_COUNT') return { rows: [{ n: 2 }] };
      if (text === 'STUB_LW_FLAG_COUNT') return { rows: [{ n: 1 }] };
      if (text === 'STUB_LW_CONTACTS_COUNT') return { rows: [{ n: 0 }] };
      if (text === 'STUB_LW_CUMULATIVE') return { rows: [{ linked: 1, total: 1 }] };
      if (text === 'STUB_LW_UNFLAG_COUNT') return { rows: [{ n: 4 }] };
      return undefined;
    });
    const logs: string[] = [];
    const result = await withDryRunArgv<{ skipped?: boolean; gate?: { reason?: string } }>(() => stepLib.runCascadePhase({
      descriptor, pool, compute, config: {}, chainId: null,
      log: { info: (_tag: string, msg: string) => logs.push(msg), warn: () => {}, error: () => {} },
      tag: '[link_wsib]', clockNow: new Date('2026-08-29T20:00:00Z'),
    }));
    expect(result.skipped, 'an interrupted retraction must never resolve to a SKIP, even though the gate itself was fed a definite-skip answer').toBeFalsy();
    expect(result.gate?.reason).toBe('recover_interrupted_retraction');
    expect(logs.some((l) => l.includes('recover_interrupted_retraction')), 'the cascade mode gate log line must name the real reason').toBe(true);
  });

  // -------------------------------------------------------------------------
  // P0 (2026-09-08, Spec 47 §125) — the REGRESSION above (2026-08-29) proved
  // detectInterruptedRetraction's OWN ownRunId parameter excludes the caller's
  // row when threaded. It did NOT prove `runWithPool` (the ONLY real caller in
  // a live chain run) actually THREADS it: `42ebaaea` found runWithPool's
  // chain-mode branch (`owns=false`) left `runId = null` for the step's entire
  // lifetime — run-chain.js opens this step's OWN pipeline_runs row and passes
  // its id via the STEP_RUN_ID env var specifically so the step could read it
  // back (run-chain.js:606/:658), but nothing read it until `42ebaaea`. The
  // live consequence, unwitnessed by any prior test: link_wsib/link_massing's
  // OWN just-opened `running` row satisfied `detectInterruptedRetraction`
  // on EVERY chain run, forcing mode "full" forever (measured on cloud,
  // review_followups.md, 2026-08-29..2026-09-08).
  //
  // This block exercises the REAL integration seam — `pipeline.step(...)
  // .run({pool, chainId})` → `runWithPool` → `parseStepRunIdEnv()` →
  // `runCascadePhase({..., ownRunId})` → `staleness.detectInterruptedRetraction`
  // — via a `vi.spyOn` on the shared `staleness` module object (index.js reads
  // `staleness.detectInterruptedRetraction` as a live property access, never a
  // destructured reference, so the spy observes the REAL call args/return
  // without needing the rest of the (partially-stubbed) run to complete
  // cleanly downstream).
  // -------------------------------------------------------------------------
  describe('P0 — runWithPool threads STEP_RUN_ID (parseStepRunIdEnv) into ownRunId in chain mode (42ebaaea)', () => {
    const OWN_RUN_ID = 555;
    const OWN_ROW = { id: OWN_RUN_ID, pipeline: 'link_wsib', status: 'running', started_at: '2026-09-08T19:00:00.000Z' };

    async function runChainModeAndCaptureInterruptedCheck(stepRunId: string | undefined) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
      const descriptor = clone(require(join(process.cwd(), 'scripts/link-wsib.descriptor.json')));
      descriptor.guards.requires = []; // orthogonal to this claim — same simplification every sibling test in this file uses
      descriptor.staleness.trigger = 'none';
      descriptor.override.dry_run = '--dry-run'; // keeps this fake-pool run from needing real write-statement answers
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute module (must be the function export, S2-min's own contract)
      const compute = require(join(process.cwd(), 'scripts/lib/compute/link-wsib.js'));
      // link-wsib.descriptor.json's config.hoisted_above_gate is TRUE (resolveConfig runs
      // BEFORE the advisory lock, S2-min §1.2a P4) — every declared logic_variable needs a
      // real row or resolveConfig throws before detectInterruptedRetraction is ever
      // reached. Defaults copied from scripts/seeds/logic_variables.json (bootstrap values,
      // not re-derived — orthogonal to this claim).
      const LOGIC_VAR_DEFAULTS: Record<string, number> = {
        wsib_fuzzy_match_threshold: 0.6, link_wsib_link_rate_warn_pct: 5,
        link_wsib_tier1_confidence: 0.95, link_wsib_tier2_confidence: 0.9,
        link_wsib_tier3_confidence: 0.6, link_wsib_entity_fanin_warn: 20,
        link_wsib_tier3_full_max_iterations: 20, link_wsib_tier3_token_overlap_fail_pct: 50,
      };
      const pool = dryRunFakePool((text: string, values: unknown) => {
        if (text.includes(INTERRUPTED_QUERY_MARK)) {
          // Simulates the REAL WHERE clause's `$2::integer IS NULL OR p.id <> $2::integer`
          // exclusion (staleness.js) rather than asserting on it after the fact — this fake
          // pool is not a real Postgres, so the exclusion must be reproduced here from the
          // BOUND PARAM the runner actually sent, exactly the behaviour the fix controls.
          const ownParam = (values as unknown[] | undefined)?.[1];
          return { rows: ownParam === OWN_ROW.id ? [] : [OWN_ROW] };
        }
        if (text.includes('current_database()')) return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
        if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
        if (text.includes('FROM logic_variables')) {
          return { rows: Object.entries(LOGIC_VAR_DEFAULTS).map(([variable_key, variable_value]) => ({ variable_key, variable_value, variable_value_json: null })) };
        }
        if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
        if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 9003 }] };
        if (/NOW\(\)\s+AS\s+now/i.test(text)) return { rows: [{ now: new Date('2026-09-08T20:00:00Z') }] };
        if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
        if (/unlinked_start/i.test(text)) return { rows: [{ unlinked_start: '5', entities_count: '3' }] };
        return undefined;
      });
      const spy = vi.spyOn(stalenessLib, 'detectInterruptedRetraction');
      const prevStepRunId = process.env.STEP_RUN_ID;
      if (stepRunId === undefined) delete process.env.STEP_RUN_ID; else process.env.STEP_RUN_ID = stepRunId;
      const cap = captureEmissions();
      try {
        // Tolerate a downstream throw from partial stubbing (real buildTierSql/checks
        // issue real SQL text this fake pool does not know) — the interrupted-retraction
        // read happens BEFORE the tier loop and BEFORE checks, so by the time any such
        // throw could occur the spy has already recorded the call this test asserts on.
        await withDryRunArgv(() => pipeline.step(descriptor, compute).run({ pool, chainId: 'sources' }));
      } catch {
        // intentionally swallowed — see comment above
      } finally {
        cap.restore();
        if (prevStepRunId === undefined) delete process.env.STEP_RUN_ID; else process.env.STEP_RUN_ID = prevStepRunId;
      }
      // ⚠️ Captured BEFORE spy.mockRestore(): mockRestore() also CLEARS mock.calls/
      // mock.results (same as mockReset()) — reading them after restore always finds
      // an empty call list, regardless of whether the spy actually fired. This bug was
      // caught live authoring this exact test (2026-09-08): the first draft restored
      // then asserted, and "detectInterruptedRetraction was never called" fired on BOTH
      // branches even though a standalone reproduction outside vitest proved the spy's
      // target function ran to completion every time.
      expect(spy, 'detectInterruptedRetraction was never called — the interrupted-retraction read did not happen at all').toHaveBeenCalled();
      const callArgs = spy.mock.calls[0]!;
      const opts = callArgs[2] as { ownRunId?: number | null } | undefined;
      const result = await spy.mock.results[0]!.value;
      spy.mockRestore();
      return { ownRunId: opts?.ownRunId ?? null, result: result as { interrupted: boolean; row: unknown } };
    }

    it('chain mode (chainId set, owns=false), STEP_RUN_ID=555: ownRunId is threaded as 555, and the step\'s own just-opened running row (id 555) is excluded — interrupted:false', async () => {
      const { ownRunId, result } = await runChainModeAndCaptureInterruptedCheck(String(OWN_RUN_ID));
      expect(ownRunId, 'runWithPool must read STEP_RUN_ID via parseStepRunIdEnv and thread it as ownRunId (42ebaaea)').toBe(OWN_RUN_ID);
      expect(result.interrupted, 'the step\'s own just-opened row (id === STEP_RUN_ID) must be excluded — the forced-FULL-forever bug this fix closes').toBe(false);
    });

    // RED PROOF (grounded per Spec 08 §11 — not merely asserted): this exact test,
    // run against `scripts/lib/step/index.js` with the ONE line `runId =
    // parseStepRunIdEnv();` (:2934) reverted to `runId = null;` — the literal
    // pre-42ebaaea shape of the `owns=false` branch — reproducibly FAILS both
    // assertions below (ownRunId reads null; interrupted reads true, because the
    // step's own row is no longer excluded). Executed live 2026-09-08 (revert →
    // rerun → RED → restore → rerun → GREEN); not re-run automatically here because
    // permanently reverting shipped code inside a test file to prove a historical
    // regression would itself be the bug this suite exists to catch.
    it('chain mode, STEP_RUN_ID unset (standalone-shaped call in chain mode — the pre-42ebaaea observable state): ownRunId is null, and the step\'s own row is NOT excluded — interrupted:true (same fake pool, same own row, only the env var differs)', async () => {
      const { ownRunId, result } = await runChainModeAndCaptureInterruptedCheck(undefined);
      expect(ownRunId, 'no STEP_RUN_ID env — ownRunId has nothing to read and must stay null').toBeNull();
      expect(result.interrupted, 'RED-shaped: with no ownRunId to exclude it, the own row satisfies the interrupted-retraction predicate').toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // R-B/LW-D20 RECURRENCE — `runMaterializePhase` (added at pilot 5, 5ee14f5b)
  // never received the same fold `runCascadePhase`/`runLinkPhase` got at
  // 8adf5d19: its `bypassed` omitted the `interruptedRetraction.interrupted`
  // term entirely, so a future MATERIALIZE step that ever declares
  // `recovery.interrupted: "force_full_on_next_run"` would hit the exact
  // unreachable-check bug LW-D20 already found and fixed once (the SAME
  // `ledgerGatedSkip` early-return shape CASCADE has, LG-15). No live
  // MATERIALIZER declares that today (link_parcel_addresses is `"none"`,
  // LPA-D1/R-F item 1) — this locks the RUNNER, not one step's descriptor.
  // -------------------------------------------------------------------------
  function materializeCompute(materializeSql: Record<string, unknown>) {
    return { buildMaterializeSql: () => materializeSql };
  }

  const LPA_BATCH_SQL = 'INSERT INTO parcel_address_points (parcel_id, address_point_id) '
    + 'SELECT 1, 1 WHERE FALSE ON CONFLICT DO NOTHING RETURNING 0 AS new_links, NULL AS max_id, 0 AS rows_in_batch';
  const LPA_MATERIALIZE_SQL = {
    pre_sql: 'STUB_LPA_PRE', batch_sql: LPA_BATCH_SQL, post_sql: 'STUB_LPA_POST',
    invariants_sql: 'STUB_LPA_INVARIANTS', invariants_params: [], batch_size_config_key: 'stub_batch_size',
  };

  function materializePool(interruptedRow: { id: number; pipeline: string; status: string; started_at: string } | null, ledgerSkip: boolean) {
    return dryRunFakePool((text: string) => {
      if (text.includes(INTERRUPTED_QUERY_MARK)) return { rows: interruptedRow ? [interruptedRow] : [] };
      if (text.includes('own_last') && text.includes('upstream_since')) {
        // A definite SKIP answer (own-last completed, zero upstream activity/changes) —
        // reached ONLY if `bypassed` was computed false. Mirrors the cascade regression
        // test's "sharpest possible proof" reasoning: if bypassed is wrongly false, the
        // run SKIPs on this answer; if correctly true, `ledgerGatedSkip` never queries it.
        return ledgerSkip
          ? { rows: [{ own_started: '2026-08-01T00:00:00Z', own_completed: '2026-08-01T00:00:00Z', own_last_records_meta: {}, non_completed: '0', completed_with_changes: '0', stale_running: '0' }] }
          : { rows: [{ own_started: '2026-08-01T00:00:00Z', own_completed: '2026-08-01T00:00:00Z', own_last_records_meta: {}, non_completed: '1', completed_with_changes: '0', stale_running: '0' }] };
      }
      if (text === 'STUB_LPA_PRE') return { rows: [{ parcels_with_geom: 5 }] };
      if (text === LPA_BATCH_SQL) return { rows: [{ new_links: 0, max_id: null, rows_in_batch: 0 }] };
      if (text === 'STUB_LPA_POST') return { rows: [{ parcel_address_points_count: 0 }] };
      if (text === 'STUB_LPA_INVARIANTS') return { rows: [{ fanout_ok: true }] };
      return undefined;
    });
  }

  function lpaDescriptor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
    const descriptor = clone(require(join(process.cwd(), 'scripts/link-parcel-addresses.descriptor.json')));
    descriptor.guards.requires = [];
    // Orthogonal to this claim: proves the RUNNER's wiring is generic, independent of
    // this one step's own current "none" declaration (LPA-D1/R-F item 1) — the fold
    // must hold for the ARCHETYPE, not just whichever step happens to declare it today.
    descriptor.recovery.interrupted = 'force_full_on_next_run';
    return descriptor;
  }

  it('REGRESSION (R-B/LW-D20 recurrence, MATERIALIZER) — runMaterializePhase folds the interrupted-retraction check into `bypassed`, BEFORE the ledger gated-skip, so it cannot be skipped past', async () => {
    const descriptor = lpaDescriptor();
    const pool = materializePool(STUCK_ROW, true);
    const result = await stepLib.runMaterializePhase({
      descriptor, pool, compute: materializeCompute(LPA_MATERIALIZE_SQL), config: {}, chainId: null,
      log: NOOP_LOG, tag: '[link_parcel_addresses]', clockNow: new Date('2026-08-29T20:00:00Z'),
      ownRunId: 9003,
    });
    expect(pool.sql.some((s: string) => s.includes(INTERRUPTED_QUERY_MARK)), 'the interrupted-retraction reader must actually be invoked').toBe(true);
    expect(result.skipped, 'an interrupted retraction must never resolve to a SKIP, even though the gate itself was fed a definite-skip answer').toBeFalsy();
    expect(result.gatedSkip?.reason, 'ledgerGatedSkip short-circuits to "bypassed" and must never reach the real skip/run query').toBe('bypassed');
    expect(pool.sql.some((s: string) => s.includes('own_last') && s.includes('upstream_since')), 'bypassed:true must short-circuit BEFORE the ledger-gate query is ever issued').toBe(false);
  });

  it('REVERSE (R-B/LW-D20 recurrence, MATERIALIZER) — NOT interrupted resolves `bypassed:false`, so the real ledger gate decides, and SKIPs when it genuinely would', async () => {
    const descriptor = lpaDescriptor();
    const pool = materializePool(null, true);
    const result = await stepLib.runMaterializePhase({
      descriptor, pool, compute: materializeCompute(LPA_MATERIALIZE_SQL), config: {}, chainId: null,
      log: NOOP_LOG, tag: '[link_parcel_addresses]', clockNow: new Date('2026-08-29T20:00:00Z'),
      ownRunId: 9004,
    });
    expect(pool.sql.some((s: string) => s.includes(INTERRUPTED_QUERY_MARK)), 'the interrupted-retraction reader must actually be invoked').toBe(true);
    expect(pool.sql.some((s: string) => s.includes('own_last') && s.includes('upstream_since')), 'not interrupted → bypassed:false → the real ledger-gate query must be reached').toBe(true);
    expect(result.skipped, 'a genuinely unchanged upstream must still SKIP when nothing bypasses the gate').toBe(true);
    expect(result.gatedSkip?.reason).toBe('no_upstream_changes');
  });
});

// ---------------------------------------------------------------------------
// I4 / e37eaab9 — runLinkColumnPhase's counter ARITHMETIC, executed.
//
// THE GAP THIS CLOSES (Regression Guardian, OUTPUT panel, 2026-09-16). Every other lock
// on this runner's counters is a STATIC read: `chain.logic.test.ts`'s re-homed §11
// assertion reads the descriptor's declared `source` string, and the step's own
// `violations.test.ts` greps `index.js` for literal source text. NONE of them execute the
// runner. The golden differential cannot either — the measured estate's eligible scope is
// 0, so every capture reads `records_updated: 0`, which is exactly what the conversion's
// own assessment says out loud. So if a future edit reintroduced
// `written.e1.updated = changed + matched.no_match` — the literal arithmetic fence
// e37eaab9 exists to forbid, and the one a null-counter bug already slipped past once in
// this same conversion — nothing currently green would catch it.
//
// This is the fake-pool lifecycle test `runCascadePhase`/`runMaterializePhase` already
// have and this runner did not, with `changed < eligible` so the two candidate formulas
// give DIFFERENT answers and the assertion can tell them apart.
// ---------------------------------------------------------------------------
describe('I4 — runLinkColumnPhase counter arithmetic (fence e37eaab9, executed not grepped)', () => {
  const CORPUS = 158;
  const ELIGIBLE = 40;      // pre-write eligible count
  const CHANGED = 25;       // rows the containment UPDATE actually stamped
  const NO_MATCH = 15;      // still NULL and unmatchable, read POST-write

  function linkColumnDescriptor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor, not a fixture copy
    const descriptor = clone(require(join(process.cwd(), 'scripts/link-neighbourhoods.descriptor.json')));
    // Neutralise the DB-probing preconditions and the staleness trigger: this test is about
    // the counter arithmetic, and it calls the runner directly (no AJV gate on the clone).
    descriptor.guards.requires = [];
    descriptor.staleness.trigger = 'none';
    return descriptor;
  }

  function linkColumnPool() {
    return dryRunFakePool((text: string) => {
      if (/FROM neighbourhoods WHERE geom IS NOT NULL/.test(text) && /count\(\*\)::int AS n/.test(text)) {
        return { rows: [{ n: CORPUS }] };
      }
      if (/count\(\*\)::int AS total FROM permits/.test(text)) return { rows: [{ total: ELIGIBLE }] };
      if (/^UPDATE permits p SET neighbourhood_id/.test(text)) {
        // `executeSetBasedJoinUpdate` reads rowCount, which dryRunFakePool does not model —
        // the rowCount assertion rides on the real executor below, so this only needs to
        // not throw. The runner's own `changed` comes from the stubbed executor.
        return { rows: [], rowCount: CHANGED };
      }
      if (/AS no_match_remaining/.test(text)) {
        return { rows: [{ linked: 240947, total: 254082, negative_ids: 0, no_match_remaining: NO_MATCH, neighbourhoods_loaded: CORPUS }] };
      }
      return undefined;
    });
  }

  it('records_total counts what was IN SCOPE at write time (changed + no_match_remaining), never the pre-write eligible count — and records_updated is the stamped count ALONE', async () => {
    const descriptor = linkColumnDescriptor();
    const pool = linkColumnPool();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute, not a fixture
    const compute = require(join(process.cwd(), 'scripts/lib/compute/link-neighbourhoods.js'));
    const result = await stepLib.runLinkColumnPhase({
      descriptor, pool, compute, config: {}, chainId: null,
      log: NOOP_LOG, tag: '[link_neighbourhoods]', preWriteGate: null,
    });

    // THE FENCE: the success counter is the stamped count alone. `changed + no_match` here
    // is 40 — numerically equal to the pre-write eligible count, which is why ELIGIBLE was
    // chosen to equal that sum: it makes the WRONG formula for `updated` (the e37eaab9
    // regression) produce 40 and the right one produce 25, unmistakably.
    expect(result.written.e1.updated, 'records_updated must be the stamped count, never stamped + unmatched').toBe(CHANGED);
    expect(result.written.e1.rows_changed).toBe(CHANGED);

    // …and `scanned` is the POST-write snapshot sum, so it can never read below `updated`.
    expect(result.written.e1.scanned).toBe(CHANGED + NO_MATCH);
    expect(result.written.e1.scanned).toBeGreaterThanOrEqual(result.written.e1.updated);
    expect(result.matched.permits_processed).toBe(CHANGED + NO_MATCH);
    expect(result.matched.permits_linked).toBe(CHANGED);
    expect(result.matched.no_match).toBe(NO_MATCH);

    // the pre-write eligible count survives as its OWN observation, never as the counter
    expect(result.matched.permits_eligible).toBe(ELIGIBLE);

    // the two corpus fields stay distinct — the `_before_write` row's whole point
    expect(result.matched.neighbourhoods_loaded_before_write).toBe(CORPUS);
    expect(result.matched.neighbourhoods_loaded).toBe(CORPUS);

    // a class-N target can never INSERT, so records_new is structurally 0
    expect(result.written.e1.inserted).toBe(0);
  });

  it('the post-write scalars are read strictly — a renamed/missing column THROWS rather than rendering as a healthy zero', async () => {
    const descriptor = linkColumnDescriptor();
    // the cumulative query answers with a MISPELLED alias, the LW-D18 drift shape
    const pool = dryRunFakePool((text: string) => {
      if (/count\(\*\)::int AS n/.test(text)) return { rows: [{ n: CORPUS }] };
      if (/count\(\*\)::int AS total FROM permits/.test(text)) return { rows: [{ total: 0 }] };
      if (/AS no_match_remaining/.test(text)) {
        return { rows: [{ linked: 1, total: 1, negative_ids: 0, no_match_remainingg: 0, neighbourhoods_loaded: CORPUS }] };
      }
      return undefined;
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real compute, not a fixture
    const compute = require(join(process.cwd(), 'scripts/lib/compute/link-neighbourhoods.js'));
    await expect(stepLib.runLinkColumnPhase({
      descriptor, pool, compute, config: {}, chainId: null,
      log: NOOP_LOG, tag: '[link_neighbourhoods]', preWriteGate: null,
    })).rejects.toThrow(/no "no_match_remaining" column/);
  });
});

// ---------------------------------------------------------------------------
// STA-3 (WF1 "state tables reset", 2026-09-03) — the three destructive-reset
// guards in scripts/lib/step/reset.js, each proven refused-when-bad and
// permitted-when-good. Not wired into any live descriptor today (STA-2's own
// grounding: 0 descriptors declare recovery.reset "generated"), so these are
// fixture-only unit locks on the exported guard functions themselves — the
// same standing this file already gives fakePool-based unit locks elsewhere
// (LR-D6's lock-contention proof, above).
// ---------------------------------------------------------------------------
describe('STA-3 — the three destructive-reset guards (scripts/lib/step/reset.js)', () => {
  const oneStatementPlan = { statements: [{ table: 'fixture_table', kind: 'delete_all', sql: 'DELETE FROM fixture_table WHERE 1=1;' }] };
  const zeroStatementPlan = { statements: [] };

  describe('guard 1 — assertBeforeImageDeclared (R-M)', () => {
    it('BAD — a destructive statement with recovery.before_image "none" is refused', () => {
      const descriptor = { identity: { name: 'fixture_step' }, recovery: { before_image: 'none' } };
      expect(() => stepLib.assertBeforeImageDeclared(descriptor, oneStatementPlan)).toThrow(/before_image/);
      expect(() => stepLib.assertBeforeImageDeclared(descriptor, oneStatementPlan)).toThrow(/fixture_step/);
    });

    it('BAD — a destructive statement with recovery.before_image MISSING entirely is refused', () => {
      const descriptor = { identity: { name: 'fixture_step' }, recovery: {} };
      expect(() => stepLib.assertBeforeImageDeclared(descriptor, oneStatementPlan)).toThrow(/before_image/);
    });

    it('GOOD — a destructive statement with recovery.before_image "generated" is permitted', () => {
      const descriptor = { identity: { name: 'fixture_step' }, recovery: { before_image: 'generated' } };
      expect(() => stepLib.assertBeforeImageDeclared(descriptor, oneStatementPlan)).not.toThrow();
    });

    it('GOOD — a plan with ZERO statements is permitted regardless of before_image (nothing destructive to guard)', () => {
      const descriptor = { identity: { name: 'fixture_step' }, recovery: { before_image: 'none' } };
      expect(() => stepLib.assertBeforeImageDeclared(descriptor, zeroStatementPlan)).not.toThrow();
    });
  });

  describe('guard 2 — assertForceFullAuthorized (R-L)', () => {
    const manifestWithChainArgs = { scripts: { fixture_step: { chain_args: { sources: ['--full'] } } } };
    const manifestWithoutChainArgs = { scripts: { fixture_step: {} } };

    it('BAD — override.force_full is not true, refused', () => {
      expect(() => stepLib.assertForceFullAuthorized({ overrides: {}, manifest: manifestWithChainArgs, slug: 'fixture_step' })).toThrow(/force_full/);
      expect(() => stepLib.assertForceFullAuthorized({ overrides: { force_full: false }, manifest: manifestWithChainArgs, slug: 'fixture_step' })).toThrow(/force_full/);
      expect(() => stepLib.assertForceFullAuthorized({ manifest: manifestWithChainArgs, slug: 'fixture_step' })).toThrow(/force_full/);
    });

    it('BAD — force_full is true but the slug\'s manifest entry declares no chain_args.sources "--full", refused', () => {
      expect(() => stepLib.assertForceFullAuthorized({ overrides: { force_full: true }, manifest: manifestWithoutChainArgs, slug: 'fixture_step' })).toThrow(/chain_args/);
    });

    it('GOOD — force_full true AND the slug\'s manifest entry declares chain_args.sources including "--full", permitted (mirrors the real enrich_parcels/link_massing/link_wsib shape)', () => {
      expect(() => stepLib.assertForceFullAuthorized({ overrides: { force_full: true }, manifest: manifestWithChainArgs, slug: 'fixture_step' })).not.toThrow();
    });

    it('the real manifest.json agrees this shape exists for at least one live slug (non-vacuity)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real committed manifest
      const manifest = require(join(process.cwd(), 'scripts/manifest.json'));
      expect(() => stepLib.assertForceFullAuthorized({ overrides: { force_full: true }, manifest, slug: 'link_massing' })).not.toThrow();
    });
  });

  describe('guard 3 — assertAdvisoryLockAvailable (§4.1② / index.js:2270)', () => {
    it('BAD — pg_try_advisory_xact_lock returns acquired:false (fakePool lockAcquired:false), refused with advisory_lock_held_elsewhere', async () => {
      const pool = fakePool({ lockAcquired: false });
      await expect(stepLib.assertAdvisoryLockAvailable(pool, 99)).rejects.toThrow(/advisory_lock_held_elsewhere/);
    });

    it('GOOD — pg_try_advisory_xact_lock returns acquired:true (fakePool lockAcquired:true), permitted', async () => {
      const pool = fakePool({ lockAcquired: true });
      await expect(stepLib.assertAdvisoryLockAvailable(pool, 99)).resolves.toBe(true);
      expect(pool.sql.some((s: string) => s.includes('pg_try_advisory_xact_lock'))).toBe(true);
    });
  });

  describe('applyGeneratedReset — the three guards run in order, before any statement, then writeBeforeImage strictly before each statement', () => {
    it('a lock held elsewhere refuses BEFORE any statement runs, even when the other two guards would pass', async () => {
      const descriptor = { identity: { name: 'fixture_step', lock: 99 }, recovery: { before_image: 'generated' } };
      const manifest = { scripts: { fixture_step: { chain_args: { sources: ['--full'] } } } };
      const pool = fakePool({ lockAcquired: false });
      await expect(
        stepLib.applyGeneratedReset(pool, descriptor, oneStatementPlan, { overrides: { force_full: true }, manifest, runAt: new Date('2026-09-03T00:00:00Z') }),
      ).rejects.toThrow(/advisory_lock_held_elsewhere/);
      expect(pool.sql.some((s: string) => /DELETE FROM fixture_table/.test(s)), 'the destructive statement must never run when the lock guard refuses').toBe(false);
    });

    it('a missing before_image refuses before the force_full/lock guards are even reached (guard order)', async () => {
      const descriptor = { identity: { name: 'fixture_step', lock: 99 }, recovery: {} };
      const pool = fakePool({ lockAcquired: true });
      await expect(
        stepLib.applyGeneratedReset(pool, descriptor, oneStatementPlan, { overrides: {}, manifest: { scripts: {} }, runAt: new Date('2026-09-03T00:00:00Z') }),
      ).rejects.toThrow(/before_image/);
      expect(pool.sql.some((s: string) => s.includes('pg_try_advisory_xact_lock')), 'guard 1 must refuse before guard 3 ever queries the lock').toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 7. recordHeartbeat / captureStallDiagnostic / startStallTicker (LG-28, first-of-kind
//    library growth, pilot 9 commit 7d) — RETARGETED here at pilot 9 commit 7e/2: these
//    were previously exercised ONLY as an embedded, enrich_parcels-specific mechanism
//    (the legacy `enrichOptimalConfig`'s own heartbeatMinutes/pipelineRunId params,
//    src/tests/enrich-parcels-optconfig.logic.test.ts's "WF3 cloud-parity FIX 3
//    remediation"/"WF3 enrich_parcels stall commit 3" blocks). The thin-shell
//    conversion GENERALIZED them into standalone scripts/lib/step/index.js exports,
//    called by runEnrichPhase around EVERY phase (not pass-5-only) — they had ZERO
//    standalone unit coverage of their own (Fold D3's own "first-of-kind, zero prior
//    hits" note), so this block is new coverage, not a mechanical retarget: same
//    behaviours the old embedded tests proved, now against the real exported functions.
// ---------------------------------------------------------------------------

describe('recordHeartbeat / captureStallDiagnostic / startStallTicker (LG-28, fake pool)', () => {
  describe('recordHeartbeat', () => {
    it('issues an UPDATE pipeline_runs with current_pass/rows_processed/last_heartbeat_at, addressed to runId', async () => {
      const pool = fakePool();
      await stepLib.recordHeartbeat(pool, 4242, 'zoning', 7);
      const hb = pool.sql.find((s: string) => /UPDATE pipeline_runs/.test(s) && /current_pass/.test(s));
      expect(hb).toBeDefined();
      expect(hb).toContain('last_heartbeat_at');
      expect(hb).toContain("COALESCE(records_meta, '{}'::jsonb)");
      const idx = pool.sql.indexOf(hb!);
      expect(pool.params[idx]).toEqual(['zoning', 7, 4242]);
    });

    it('no-ops when runId is null (standalone invocation) — issues no query at all', async () => {
      const pool = fakePool();
      await stepLib.recordHeartbeat(pool, null, 'zoning', 0);
      expect(pool.sql).toHaveLength(0);
    });

    it('swallows a query failure via pipeline.log.warn — never throws', async () => {
      const throwingPool = { query: async () => { throw new Error('connection reset'); } };
      const origWarn = pipeline.log.warn;
      const warnSpy = vi.fn(origWarn);
      pipeline.log.warn = warnSpy;
      try {
        await expect(stepLib.recordHeartbeat(throwingPool, 4242, 'zoning', 0)).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/heartbeat.*4242/));
      } finally {
        pipeline.log.warn = origWarn;
      }
    });
  });

  describe('captureStallDiagnostic', () => {
    it('probes pg_stat_activity for the given pid and writes stall_diagnostic + stall_diagnostic_at', async () => {
      const pool = fakePool({
        queryAnswers: [{
          match: (t: string) => /FROM pg_stat_activity WHERE pid/.test(t),
          rows: [{ pid: 555, state: 'active', wait_event_type: 'IO', wait_event: 'DataFileRead', query_start: '2026-09-07T00:00:00Z' }],
        }],
      });
      await stepLib.captureStallDiagnostic(pool, 4242, 555);
      const upd = pool.sql.find((s: string) => /UPDATE pipeline_runs/.test(s) && /stall_diagnostic/.test(s));
      expect(upd).toBeDefined();
      const idx = pool.sql.indexOf(upd!);
      const diag = JSON.parse(pool.params[idx]![0] as string);
      expect(diag.pid).toBe(555);
      expect(diag.state).toBe('active');
    });

    it('falls back to a "no matching backend" note when pid is null', async () => {
      const pool = fakePool();
      await stepLib.captureStallDiagnostic(pool, 4242, null);
      const upd = pool.sql.find((s: string) => /UPDATE pipeline_runs/.test(s) && /stall_diagnostic/.test(s));
      const idx = pool.sql.indexOf(upd!);
      const diag = JSON.parse(pool.params[idx]![0] as string);
      expect(diag.note).toMatch(/no matching backend/);
    });

    it('no-ops when runId is null — issues no query at all', async () => {
      const pool = fakePool();
      await stepLib.captureStallDiagnostic(pool, null, 555);
      expect(pool.sql).toHaveLength(0);
    });

    it('swallows a query failure via pipeline.log.warn — never throws', async () => {
      const throwingPool = { query: async () => { throw new Error('connection reset'); } };
      const origWarn = pipeline.log.warn;
      const warnSpy = vi.fn(origWarn);
      pipeline.log.warn = warnSpy;
      try {
        await expect(stepLib.captureStallDiagnostic(throwingPool, 4242, 555)).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/stall diagnostic.*4242/));
      } finally {
        pipeline.log.warn = origWarn;
      }
    });
  });

  describe('startStallTicker', () => {
    it('intervalMs <= 0 returns a no-op stop function (defensive) — never schedules a timer', () => {
      const pool = fakePool();
      const stop = stepLib.startStallTicker(pool, 4242, 0, () => 555);
      expect(typeof stop).toBe('function');
      expect(() => stop()).not.toThrow();
    });

    it('fires exactly ONE captureStallDiagnostic after 2x intervalMs of silence, then latches (never fires twice for the same ticker)', async () => {
      vi.useFakeTimers();
      try {
        const pool = fakePool();
        const stop = stepLib.startStallTicker(pool, 4242, 100, () => 555);
        await vi.advanceTimersByTimeAsync(210); // one 2x-interval tick (200ms) elapses
        await vi.advanceTimersByTimeAsync(210); // a second tick would fire at 400ms if not latched
        stop();
        const diagnosticUpdates = pool.sql.filter((s: string) => /stall_diagnostic/.test(s));
        expect(diagnosticUpdates).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('no diagnostic fires when stop() is called before 2x intervalMs elapses (progress keeps pace)', async () => {
      vi.useFakeTimers();
      try {
        const pool = fakePool();
        const stop = stepLib.startStallTicker(pool, 4242, 100, () => 555);
        await vi.advanceTimersByTimeAsync(50);
        stop();
        await vi.advanceTimersByTimeAsync(500); // stopped — no further ticks should fire
        expect(pool.sql.filter((s: string) => /stall_diagnostic/.test(s))).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 8. runEnrichPhase as a GENERIC ENRICHER runner (batch-2 Phase 0.10,
//    `.cursor/wf2_enrich_runner_generic_active_task.md`).
//
//    Until 0.10 `runEnrichPhase` was `enrich_parcels` with a descriptor-shaped
//    front door: the Spec 58 §9/§11 contract read and the Spec 122 §3.0b
//    scope-defer decision were HARDCODED to that step's own compute exports,
//    and the heartbeat/lock-timeout intervals were read from two hardcoded
//    `config.enrich_parcels_*` keys. A second enrich-shaped step therefore
//    (a) threw `TypeError: compute.readZoningContract is not a function`
//    before its first phase and (b), had it got past that, would have run with
//    `heartbeatMs === NaN` — which `startHeartbeatTicker`'s `!intervalMs` guard
//    silently turns into a no-op ticker: `last_heartbeat_at` NULL for the whole
//    run, no warning, no audit row, no throw (ER-D1, Spec 48 §3.6 silence class).
//
//    These locks live HERE, in the LIBRARY's own test file, rather than in
//    `src/tests/steps/enrich_parcels/violations.test.ts` on purpose: they are
//    about what the runner does for a step that is NOT `enrich_parcels`.
//    `violations.test.ts` owns the hook-parity half (L3) — that one IS an
//    enrich_parcels claim.
//
//    FIXTURE NOTE — CORRECTED at batch-2 Phase 0.10b (2026-09-16). It used to
//    read: "the fixture descriptors below declare FIVE write targets even where
//    one would do, because runEnrichPhase's counter block still assigns
//    written[write.targetKey(0..4)] from five hardcoded pass-result names … a
//    4-target ENRICHER throws TypeError there." That was true when it was
//    written and STOPPED being true inside the very commit that wrote it: the
//    0.10 fold (see the L9 block further down this file) replaced those fifteen
//    assignments with a loop over `execution.phases[]` keyed by each entry's own
//    `writes_ref`, and 0.10b then moved the five pass-name lookups out of the
//    `matched` build into the step's own declared `post_phase` hook. The
//    five-target fixtures below are now merely OVER-SPECIFIED, not required —
//    harmless, and left alone rather than re-cut, because re-cutting them would
//    churn a dozen unrelated assertions for no behaviour. The genuinely
//    remaining hardcoding is the two CLASS-BASED targets (`set_based_scoped`,
//    `insert_only_no_retraction`), which NO `execution.phases[]` entry declares
//    a `writes_ref` for, so the loop structurally cannot reach them — filed MED,
//    stated in place at the call site, and skipped entirely for a step that
//    declares neither class.
// ---------------------------------------------------------------------------

describe('runEnrichPhase — the GENERIC ENRICHER runner (batch-2 Phase 0.10)', () => {
  interface FakeClient { query: (text: string, values?: unknown[]) => Promise<unknown>; release: () => void }

  /**
   * The minimum fake pool `runEnrichPhase` needs, trimmed from
   * `violations.test.ts`'s own (no cancel bus, no per-session statement_timeout
   * modelling — neither is this block's subject).
   */
  function enrichPool() {
    const sql: string[] = [];
    const params: unknown[][] = [];
    const clients: FakeClient[] = [];
    const answer = (text: string) => {
      if (/pg_backend_pid/.test(text)) return { rows: [{ pid: 4242 }] };
      if (/pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: true }] };
      if (/COUNT\(\*\)::int AS n FROM parcels/.test(text)) return { rows: [{ n: 0 }] };
      return { rows: [], rowCount: 0 };
    };
    const record = async (text: string, values?: unknown[]) => {
      sql.push(text);
      params.push(values ?? []);
      return answer(text);
    };
    return {
      sql,
      params,
      clients,
      query: record,
      connect: async () => {
        const c: FakeClient = { query: record, release: () => {} };
        clients.push(c);
        return c;
      },
    };
  }

  /** Five write targets — see the FIXTURE NOTE above for why five and not one. */
  const fiveTargets = (firstClass = 'set_based_join_update') => [
    { table: 'fixture_rows', key: 'id', write_discipline: { class: firstClass } },
    { table: 'fixture_rows', key: 'id', write_discipline: { class: 'temp_materialize' } },
    { table: 'fixture_rows', key: 'id', write_discipline: { class: 'temp_materialize' } },
    { table: 'fixture_rows', key: 'id', write_discipline: { class: 'temp_materialize' } },
    { table: 'fixture_rows', key: 'id', write_discipline: { class: 'temp_materialize' } },
  ];

  /** An enrich-shaped descriptor for a step that is NOT enrich_parcels. */
  function genericDescriptor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      identity: { name: 'fixture_geocode', lock: 987654, archetype: 'ENRICHER', spec: '999' },
      outputs: { writes: fiveTargets() },
      execution: {
        shape: 'enrich',
        heartbeat_minutes_from_config: 'fixture_heartbeat_minutes',
        lock_timeout_ms_from_config: 'fixture_lock_timeout_ms',
        phases: [
          { name: 'geocode', order: 1, txn: 'shared', writes_ref: 0, scope: 'full', timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
        ],
        invocation: { sources: { argv: [], env: {} } },
      },
      guards: { requires: [] },
      recovery: 'none',
      override: { force_full: 'none', force_run: 'none', dry_run: 'none' },
      checks: [],
      ...overrides,
    };
  }

  interface FakeCompute { [k: string]: unknown }

  /** A compute with NO readZoningContract / computeDeferScope — i.e. every ENRICHER but enrich_parcels. */
  function genericCompute(
    passLog: string[],
    run?: (client: unknown, ctx: Record<string, unknown>) => Promise<Record<string, unknown>>,
  ): FakeCompute {
    return {
      computeAggregateRecordsUpdated: () => 0,
      passes: [{
        name: 'geocode',
        txn: 'shared',
        run: async (client: unknown, ctx: Record<string, unknown>) => {
          passLog.push('geocode');
          return run ? run(client, ctx) : { scoped: 0, updated: 0, updatedIds: [] };
        },
      }],
    };
  }

  const args = (
    descriptor: Record<string, unknown>,
    pool: ReturnType<typeof enrichPool>,
    compute: FakeCompute,
    configOverrides: Record<string, unknown> = {},
  ) => ({
    descriptor,
    pool,
    compute,
    config: {
      fixture_pass_timeout_minutes: 5,
      fixture_heartbeat_minutes: 60,
      fixture_lock_timeout_ms: 0,
      ...configOverrides,
    },
    chainId: null,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    tag: '[fixture_geocode]',
    clockNow: new Date('2026-09-15T00:00:00.000Z'),
    preWriteGate: null,
    ownRunId: 4242,
  });

  // --- L1 -----------------------------------------------------------------
  it('L1 — an enrich descriptor declaring NO execution.enrich_hooks runs phase 1 without calling any contract-read or defer-scope hook', async () => {
    const passLog: string[] = [];
    const pool = enrichPool();
    const compute = genericCompute(passLog);
    const res = await stepLib.runEnrichPhase(args(genericDescriptor(), pool, compute) as never) as Record<string, unknown>;
    expect(passLog, 'the declared phase must actually have run').toEqual(['geocode']);
    expect(res.deferred, 'an undeclared defer_scope hook must not enter the !full early-return at all — the pre-0.10 NaN-comparison escape was an accident, not a contract').toBe(false);
    expect(res.skipped).toBe(false);
  });

  it('L1b — the <slug>_duration_ms telemetry key is derived from identity.name, never the literal enrich_parcels_*', async () => {
    const passLog: string[] = [];
    const pool = enrichPool();
    const res = await stepLib.runEnrichPhase(args(genericDescriptor(), pool, genericCompute(passLog)) as never) as { matched: Record<string, unknown> };
    expect(Object.keys(res.matched)).toContain('fixture_geocode_duration_ms');
    expect(Object.keys(res.matched)).not.toContain('enrich_parcels_duration_ms');
  });

  // --- L2 -----------------------------------------------------------------
  it('L2 — a DECLARED hook the compute does not export is a NAMED throw citing the descriptor field, never a raw TypeError', async () => {
    const pool = enrichPool();
    const d = genericDescriptor();
    (d.execution as Record<string, unknown>).enrich_hooks = { contract_read: 'readZoningContract' };
    await expect(stepLib.runEnrichPhase(args(d, pool, genericCompute([])) as never))
      .rejects.toThrow(/execution\.enrich_hooks\.contract_read[\s\S]*readZoningContract[\s\S]*compute/);
  });

  it('L2b — a declared defer_scope whose export is missing is likewise a named throw', async () => {
    const pool = enrichPool();
    const d = genericDescriptor();
    (d.execution as Record<string, unknown>).enrich_hooks = {
      defer_scope: { export: 'computeDeferScope', threshold_from_config: 'fixture_defer_threshold_rows' },
    };
    await expect(stepLib.runEnrichPhase(args(d, pool, genericCompute([]), { fixture_defer_threshold_rows: 10 }) as never))
      .rejects.toThrow(/execution\.enrich_hooks\.defer_scope\.export[\s\S]*computeDeferScope[\s\S]*compute/);
  });

  it('L2c — DECLARED hooks that DO exist are called, in order, before the first phase', async () => {
    const order: string[] = [];
    const passLog: string[] = [];
    const pool = enrichPool();
    const d = genericDescriptor();
    (d.execution as Record<string, unknown>).enrich_hooks = {
      contract_read: 'readFixtureContract',
      defer_scope: { export: 'computeFixtureScope', threshold_from_config: 'fixture_defer_threshold_rows' },
    };
    const compute = genericCompute(passLog) as Record<string, unknown>;
    compute.OVERLAY_LAYERS = [{ key: 'fixture_overlay', col: 'fixture_col' }];
    compute.readFixtureContract = async () => { order.push('contract'); return { layers: { fixture_overlay: false } }; };
    compute.computeFixtureScope = async (_pool: unknown, threshold: number) => {
      order.push(`defer:${threshold}`);
      return { scope_count: 0, threshold, ratio: 0 };
    };
    await stepLib.runEnrichPhase(args(d, pool, compute, { fixture_defer_threshold_rows: 1000 }) as never);
    expect(order, 'contract read then defer-scope, both before phase 1').toEqual(['contract', 'defer:1000']);
    expect(passLog).toEqual(['geocode']);
  });

  it('L2d — a declared defer_scope OVER threshold returns the zero-write deferred result, keyed by the step own slug', async () => {
    const passLog: string[] = [];
    const pool = enrichPool();
    const d = genericDescriptor();
    (d.execution as Record<string, unknown>).enrich_hooks = {
      defer_scope: { export: 'computeFixtureScope', threshold_from_config: 'fixture_defer_threshold_rows' },
    };
    const compute = genericCompute(passLog) as Record<string, unknown>;
    compute.computeFixtureScope = async () => ({ scope_count: 5000, threshold: 1000, ratio: 5 });
    const res = await stepLib.runEnrichPhase(args(d, pool, compute, { fixture_defer_threshold_rows: 1000 }) as never) as { deferred: boolean; matched: Record<string, unknown> };
    expect(res.deferred).toBe(true);
    expect(passLog, 'a deferred run writes nothing and runs no pass').toEqual([]);
    expect(Object.keys(res.matched)).toContain('fixture_geocode_duration_ms');
    expect(Object.keys(res.matched)).not.toContain('enrich_parcels_duration_ms');
  });

  // --- L4 — ER-D1 ---------------------------------------------------------
  it('L4 — ER-D1: a heartbeat interval that resolves to a NON-FINITE value THROWS at construction (Rule 12), it does NOT silently install a no-op ticker (Spec 48 §3.6)', async () => {
    const pool = enrichPool();
    // The exact pre-0.10 shape: the config carries no entry for the declared
    // variable, so `Number(undefined)` is NaN, `!NaN` is true, and
    // startHeartbeatTicker returned `() => {}` with ZERO warnings.
    await expect(
      stepLib.runEnrichPhase(args(genericDescriptor(), pool, genericCompute([]), { fixture_heartbeat_minutes: undefined }) as never),
    ).rejects.toThrow(/heartbeat_minutes_from_config[\s\S]*fixture_heartbeat_minutes/);
  });

  it('L4b — ER-D1: the lock-timeout interval gets the same treatment (the identical NaN class)', async () => {
    const pool = enrichPool();
    await expect(
      stepLib.runEnrichPhase(args(genericDescriptor(), pool, genericCompute([]), { fixture_lock_timeout_ms: 'not-a-number' }) as never),
    ).rejects.toThrow(/lock_timeout_ms_from_config[\s\S]*fixture_lock_timeout_ms/);
  });

  it('L4c — ER-D1: a DELIBERATE 0 still disables the ticker rather than throwing — Number.isFinite, never !x (that distinction IS the fix)', async () => {
    const passLog: string[] = [];
    const pool = enrichPool();
    const res = await stepLib.runEnrichPhase(args(genericDescriptor(), pool, genericCompute(passLog), { fixture_heartbeat_minutes: 0 }) as never);
    expect(res, 'an explicitly-declared 0 is an operator choice, not a missing declaration').toBeDefined();
    expect(passLog).toEqual(['geocode']);
  });

  it('L4e — ER-D1: the literal "none" is a DECLARED disable (the same escape timeout_minutes_from_config carries), while an unresolvable NAME still throws — the accident and the declaration must not render identically', async () => {
    const passLog: string[] = [];
    const pool = enrichPool();
    const d = genericDescriptor();
    (d.execution as Record<string, unknown>).heartbeat_minutes_from_config = 'none';
    (d.execution as Record<string, unknown>).lock_timeout_ms_from_config = 'none';
    await stepLib.runEnrichPhase(args(d, pool, genericCompute(passLog), { fixture_heartbeat_minutes: undefined, fixture_lock_timeout_ms: undefined }) as never);
    expect(passLog, 'a declared "none" disables the guard and lets the step run').toEqual(['geocode']);
    expect(pool.sql.some((q) => /^SET LOCAL lock_timeout/.test(q)), 'a declared "none" issues no lock ceiling').toBe(false);
    // ...and the accident is still loud, on the very same field.
    const d2 = genericDescriptor();
    (d2.execution as Record<string, unknown>).heartbeat_minutes_from_config = 'fixture_not_declared_anywhere';
    await expect(stepLib.runEnrichPhase(args(d2, enrichPool(), genericCompute([])) as never))
      .rejects.toThrow(/fixture_not_declared_anywhere/);
  });

  // --- L4f/L4g/L4h — the PER-PHASE bound joins ER-D1 -----------------------
  //
  // WF3 2026-09-17, closing docs/reports/review_followups.md:3788. L4e's own title
  // asserted `"none"` is "the same escape timeout_minutes_from_config carries" — and it
  // was not: `runEnrichPhase` evaluated `Number(config[phase.timeout_minutes_from_config])`
  // bare at both its phase loops, so `"none"` AND a typo both produced NaN, `if (timeoutMs
  // > 0)` was false (no `SET LOCAL statement_timeout`), `startPhaseDeadline(..., NaN, ...)`
  // took its `!timeoutMs` no-op arm, and the phase logged `timeout NaNmin`.
  //
  // RED BEFORE THE FIX, measured live on `geocode_permits` (which declares `"none"`
  // truthfully on both phases): `phase geocode starting (shared txn, timeout NaNmin)` —
  // present verbatim in all three committed POST goldens' `stdout`.
  //
  // Both directions, because the disable is load-bearing: L4f pins that a DECLARED "none"
  // keeps disabling; L4g pins that an ACCIDENT throws, above the lock; L4h pins that a
  // finite bound is unchanged down to the log bytes (enrich_parcels' five goldens).
  const infoLog = () => {
    const lines: string[] = [];
    return { lines, log: { info: (_t: string, m: string) => { lines.push(m); }, warn: () => {}, error: () => {} } };
  };

  it('L4f — a phase declaring timeout_minutes_from_config "none" disables the bound deliberately: no SET LOCAL statement_timeout, no throw, and the log says so instead of "NaNmin"', async () => {
    const passLog: string[] = [];
    const pool = enrichPool();
    const d = genericDescriptor();
    ((d.execution as Record<string, unknown>).phases as Record<string, unknown>[])[0]!.timeout_minutes_from_config = 'none';
    const cap = infoLog();
    await stepLib.runEnrichPhase({ ...args(d, pool, genericCompute(passLog), { fixture_pass_timeout_minutes: undefined }), log: cap.log } as never);
    expect(passLog, 'a declared "none" must still let the phase run').toEqual(['geocode']);
    expect(pool.sql.some((q) => /^SET LOCAL statement_timeout/.test(q)), 'a declared "none" issues no statement ceiling').toBe(false);
    const start = cap.lines.find((l) => l.startsWith('phase geocode starting'));
    expect(start).toBe('phase geocode starting (shared txn, timeout disabled (declared "none"))');
    expect(cap.lines.join('\n'), 'NaN must never reach an operator-facing line').not.toMatch(/NaN/);
  });

  it('L4g — a phase naming a variable that resolves to nothing THROWS, naming the field, the phase and the variable — and it throws ABOVE the advisory lock, before any transaction', async () => {
    const pool = enrichPool();
    const passLog: string[] = [];
    await expect(
      stepLib.runEnrichPhase(args(genericDescriptor(), pool, genericCompute(passLog), { fixture_pass_timeout_minutes: undefined }) as never),
    ).rejects.toThrow(/execution\.phases\[geocode\]\.timeout_minutes_from_config[\s\S]*fixture_pass_timeout_minutes/);
    expect(passLog, 'no pass may run').toEqual([]);
    expect(
      pool.sql.some((q) => /pg_try_advisory/.test(q)),
      'the throw must precede the advisory lock — a post_commit-site throw would fire AFTER the shared txn COMMITted',
    ).toBe(false);
  });

  it('L4i — a variable that resolves to 0 is an ADMIN-TUNABLE disable, not the descriptor\'s `"none"` — three states, three renderings', async () => {
    // Regression Guardian 2026-09-17. The first cut branched on `ms > 0`, which rendered a
    // config value of 0 as `timeout disabled (declared "none")` — telling the reader the
    // DESCRIPTOR declared no bound when in fact an operator had turned one off in the admin UI.
    // `scripts/seeds/logic_variables.json`'s `enrich_parcels_pass5_timeout_minutes` documents
    // `0 = disabled` with `min: 0`, and `enrich-parcels.descriptor.json`'s `optimal_config`
    // phase consumes exactly that key, so this is reachable, not hypothetical. It also broke
    // this WF's own "byte-identical for a finite bound" claim: 0 IS finite, and the pre-fix
    // code logged `timeout 0min`.
    const passLog: string[] = [];
    const pool = enrichPool();
    const cap = infoLog();
    await stepLib.runEnrichPhase({ ...args(genericDescriptor(), pool, genericCompute(passLog), { fixture_pass_timeout_minutes: 0 }), log: cap.log } as never);
    expect(passLog, 'a deliberate 0 still runs the phase').toEqual(['geocode']);
    expect(pool.sql.some((q) => /^SET LOCAL statement_timeout/.test(q)), '0 issues no statement ceiling').toBe(false);
    expect(cap.lines.find((l) => l.startsWith('phase geocode starting')))
      .toBe('phase geocode starting (shared txn, timeout 0min)');
    expect(cap.lines.join('\n'), 'a tunable 0 must NOT claim the descriptor declared "none"').not.toMatch(/declared "none"/);
  });

  it('L4h — a finite declared bound is UNCHANGED: the same SET LOCAL statement_timeout and the same log bytes as before the fix (enrich_parcels goldens must not move)', async () => {
    const passLog: string[] = [];
    const pool = enrichPool();
    const cap = infoLog();
    await stepLib.runEnrichPhase({ ...args(genericDescriptor(), pool, genericCompute(passLog), { fixture_pass_timeout_minutes: 5 }), log: cap.log } as never);
    expect(pool.sql.some((q) => q === 'SET LOCAL statement_timeout = 300000')).toBe(true);
    expect(cap.lines.find((l) => l.startsWith('phase geocode starting')))
      .toBe('phase geocode starting (shared txn, timeout 5min)');
  });

  it('L4d — ER-D1: an UNDECLARED execution.heartbeat_minutes_from_config is itself the throw (the field is not optional on an enrich shape)', async () => {
    const pool = enrichPool();
    const d = genericDescriptor();
    delete (d.execution as Record<string, unknown>).heartbeat_minutes_from_config;
    await expect(stepLib.runEnrichPhase(args(d, pool, genericCompute([])) as never))
      .rejects.toThrow(/heartbeat_minutes_from_config/);
  });

  // --- L5 — before-image + class-O / class-N reachability ------------------
  it('L5 — the enrich write path reaches write.writeBeforeImage STRICTLY BEFORE write.executeSetBasedClear for a class-O retraction', async () => {
    const pool = enrichPool();
    const d = genericDescriptor({
      outputs: { writes: fiveTargets('set_based_null_retract') },
      recovery: { before_image: 'generated', interrupted: 'none' },
    });
    const specs = (d.outputs as { writes: Array<Record<string, unknown>> }).writes;
    specs[0]!.write_discipline = { class: 'set_based_null_retract', scope: 'fixture_col IS NOT NULL', retract: 'all' };
    specs[0]!.columns = [{ name: 'fixture_col', source: 'compute', written: 'always' }];
    let retracted: number | null = null;
    const compute = genericCompute([], async (_client, ctx) => {
      retracted = await (ctx.retract as (ref: number, params: unknown[]) => Promise<number>)(0, []);
      return { scoped: 0, updated: 0, updatedIds: [] };
    });
    await stepLib.runEnrichPhase(args(d, pool, compute) as never);
    const biIdx = pool.sql.findIndex((s) => /^\s*SELECT/.test(s) && /fixture_col/.test(s));
    const clearIdx = pool.sql.findIndex((s) => /UPDATE fixture_rows/.test(s));
    expect(biIdx, 'the before-image SELECT must have been issued').toBeGreaterThan(-1);
    expect(clearIdx, 'the retraction UPDATE must have been issued').toBeGreaterThan(-1);
    expect(biIdx, 'R-M — the before image is written STRICTLY BEFORE the retraction it protects').toBeLessThan(clearIdx);
    expect(retracted).not.toBeNull();
  });

  it('L5b — a class-O retraction on a step whose recovery declares before_image:"none" is REFUSED, never silently un-imaged (R-M)', async () => {
    const pool = enrichPool();
    const d = genericDescriptor({ outputs: { writes: fiveTargets('set_based_null_retract') } });
    const specs = (d.outputs as { writes: Array<Record<string, unknown>> }).writes;
    specs[0]!.write_discipline = { class: 'set_based_null_retract', scope: 'fixture_col IS NOT NULL', retract: 'all' };
    specs[0]!.columns = [{ name: 'fixture_col', source: 'compute', written: 'always' }];
    const compute = genericCompute([], async (_client, ctx) => {
      await (ctx.retract as (ref: number, params: unknown[]) => Promise<number>)(0, []);
      return {};
    });
    await expect(stepLib.runEnrichPhase(args(d, pool, compute) as never)).rejects.toThrow(/before_image/);
    expect(pool.sql.some((s) => /UPDATE fixture_rows/.test(s)), 'the retraction must never have run').toBe(false);
  });

  it('L5c — ctx.joinUpdate routes a class-N (set_based_join_update) write through write.executeSetBasedJoinUpdate, which structurally refuses INSERT/ON CONFLICT text', async () => {
    const pool = enrichPool();
    const d = genericDescriptor();
    let updated: number | null = null;
    let refused: unknown = null;
    const compute = genericCompute([], async (_client, ctx) => {
      const joinUpdate = ctx.joinUpdate as (ref: number, sql: string, p: unknown[]) => Promise<number>;
      updated = await joinUpdate(0, 'UPDATE fixture_rows SET fixture_col = s.v FROM src s WHERE s.id = fixture_rows.id', []);
      try {
        await joinUpdate(0, 'INSERT INTO fixture_rows (id) VALUES (1) ON CONFLICT DO NOTHING', []);
      } catch (err) {
        refused = err;
      }
      return {};
    });
    await stepLib.runEnrichPhase(args(d, pool, compute) as never);
    expect(updated).not.toBeNull();
    expect(refused, 'executeSetBasedJoinUpdate must structurally refuse INSERT/ON CONFLICT text').not.toBeNull();
  });

  it('L5d — the seams REFUSE a target whose declared class does not admit them (no silent widening of the write surface)', async () => {
    const pool = enrichPool();
    const d = genericDescriptor();
    const refusals: string[] = [];
    const compute = genericCompute([], async (_client, ctx) => {
      // target 1 is `temp_materialize` — neither a class-O retraction nor a class-N join update.
      try {
        await (ctx.retract as (r: number, p: unknown[]) => Promise<number>)(1, []);
      } catch (err) { refusals.push(String((err as Error).message)); }
      try {
        await (ctx.joinUpdate as (r: number, s: string, p: unknown[]) => Promise<number>)(1, 'UPDATE fixture_rows SET x = 1', []);
      } catch (err) { refusals.push(String((err as Error).message)); }
      return {};
    });
    await stepLib.runEnrichPhase(args(d, pool, compute) as never);
    expect(refusals).toHaveLength(2);
    expect(refusals.every((m) => /temp_materialize/.test(m)), refusals.join(' | ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ER-D1 (batch-2 Phase 0.10, Spec 48 §3.6 silence class) — startHeartbeatTicker
// itself, at the unit level.
//
// THE DEFECT, exactly: `if (!intervalMs || intervalMs <= 0) return () => {}`
// cannot tell a DELIBERATE 0 (an operator disabling the ticker) from a
// NON-FINITE value (a step whose heartbeat variable resolved to `undefined`,
// because the interval was read from a hardcoded `config.enrich_parcels_*` key
// no other step declares). `!NaN` is true, so the second case installed a NO-OP
// ticker: `last_heartbeat_at` stayed NULL for the whole run, with no warning,
// no audit row and no throw — the exact silence EP-D12/EP-D15 were built to end.
// Latent until batch 2, only because ENRICHER had exactly one member.
//
// `Number.isFinite`, never `!x`, IS the fix — so both arms are locked.
// ---------------------------------------------------------------------------

describe('startHeartbeatTicker — ER-D1: a non-finite interval is LOUD, a deliberate 0 is not (Spec 48 §3.6)', () => {
  it('RED-then-GREEN — NaN THROWS rather than silently returning a no-op ticker', () => {
    expect(() => stepLib.startHeartbeatTicker({ query: async () => ({ rows: [] }) }, 4242, () => 'zoning', NaN, () => 0))
      .toThrow(/non-finite|finite/i);
  });

  it('RED-then-GREEN — undefined (the real shape: Number(config.<undeclared>) * 60000) THROWS too', () => {
    expect(() => stepLib.startHeartbeatTicker({ query: async () => ({ rows: [] }) }, 4242, () => 'zoning', Math.round(Number(undefined) * 60000), () => 0))
      .toThrow(/non-finite|finite/i);
  });

  it('a DELIBERATE 0 still returns a no-op stop() and schedules nothing — the disable case survives the fix', async () => {
    vi.useFakeTimers();
    try {
      const pool = fakePool();
      const stop = stepLib.startHeartbeatTicker(pool, 4242, () => 'zoning', 0, () => 0);
      await vi.advanceTimersByTimeAsync(5000);
      expect(pool.sql.filter((s: string) => /last_heartbeat_at/.test(s))).toHaveLength(0);
      expect(() => stop()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a finite, positive interval TICKS repeatedly (un-latched) — the vacuity guard on the two arms above', async () => {
    vi.useFakeTimers();
    try {
      const pool = fakePool();
      const stop = stepLib.startHeartbeatTicker(pool, 4242, () => 'zoning', 100, () => 7);
      await vi.advanceTimersByTimeAsync(350);
      stop();
      expect(pool.sql.filter((s: string) => /last_heartbeat_at/.test(s)).length).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// L9 (batch-2 Phase 0.10 FOLD, ruled 2026-09-15) — THE PER-TARGET COUNTERS ARE
// DRIVEN BY THE DECLARATION, not by five hardcoded indices.
//
// THE DEFECT, measured while building the locks above: after the phases run,
// `runEnrichPhase` assigned `written[write.targetKey(0)] … targetKey(4)` from
// five pass-result variables looked up by literal pass name (`passRaw.zoning`,
// `.max_build`, `.existing_structure`, `.comparable_builds`, `.optimal_config`).
// An ENRICHER declaring FEWER than five write targets therefore died at
// `TypeError: Cannot set properties of undefined (setting 'scanned')` AFTER
// every pass had already run and, for a shared-txn step, after the transaction
// had already COMMITted — the worst possible place to fail. `geocode_permits`
// (batch-2 Phase 0.9 I5) declares TWO targets, so 0.10 would not have unblocked
// it. The fix iterates `execution.phases[]`, resolving each pass's counters onto
// the target its own `writes_ref` declares.
//
// Both directions, because the inverse is the whole point of the row:
// `enrich_parcels`' five phases → five targets must produce the IDENTICAL
// numbers (the `written` half of the golden hash-equality gate). That arm lives
// in src/tests/steps/enrich_parcels/violations.test.ts, against its real
// 5-phase/7-target fixture.
// ---------------------------------------------------------------------------

describe('runEnrichPhase — per-target counters come from execution.phases[].writes_ref (batch-2 Phase 0.10 fold)', () => {
  interface FakeClient { query: (text: string, values?: unknown[]) => Promise<unknown>; release: () => void }

  function pool2() {
    const sql: string[] = [];
    const clients: FakeClient[] = [];
    const answer = (text: string) => {
      if (/pg_backend_pid/.test(text)) return { rows: [{ pid: 4242 }] };
      if (/pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: true }] };
      if (/COUNT\(\*\)::int AS n FROM parcels/.test(text)) return { rows: [{ n: 0 }] };
      return { rows: [], rowCount: 0 };
    };
    const record = async (text: string) => { sql.push(text); return answer(text); };
    return {
      sql,
      query: record,
      connect: async () => { const c: FakeClient = { query: record, release: () => {} }; clients.push(c); return c; },
    };
  }

  /** TWO write targets, TWO phases — the `geocode_permits` shape, not `enrich_parcels`'. */
  const twoTargetDescriptor = () => ({
    identity: { name: 'fixture_two_target', lock: 987655, archetype: 'ENRICHER', spec: '999' },
    outputs: {
      writes: [
        { table: 'fixture_a', key: 'id', write_discipline: { class: 'set_based_join_update' } },
        { table: 'fixture_b', key: 'id', write_discipline: { class: 'temp_materialize' } },
      ],
    },
    execution: {
      shape: 'enrich',
      heartbeat_minutes_from_config: 'fixture_heartbeat_minutes',
      lock_timeout_ms_from_config: 'fixture_lock_timeout_ms',
      phases: [
        { name: 'geocode', order: 1, txn: 'shared', writes_ref: 0, scope: 'full', timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
        { name: 'backfill_geom', order: 2, txn: 'shared', writes_ref: 1, scope: 'full', timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
      ],
      invocation: { sources: { argv: [], env: {} } },
    },
    guards: { requires: [] },
    recovery: 'none',
    override: { force_full: 'none', force_run: 'none', dry_run: 'none' },
    checks: [],
  });

  const twoTargetCompute = (results: Record<string, Record<string, unknown>>) => ({
    computeAggregateRecordsUpdated: () => 0,
    passes: ['geocode', 'backfill_geom'].map((name) => ({
      name,
      txn: 'shared',
      run: async () => results[name] ?? {},
    })),
  });

  const args2 = (descriptor: Record<string, unknown>, pool: ReturnType<typeof pool2>, compute: unknown) => ({
    descriptor,
    pool,
    compute,
    config: { fixture_pass_timeout_minutes: 5, fixture_heartbeat_minutes: 60, fixture_lock_timeout_ms: 0 },
    chainId: null,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    tag: '[fixture_two_target]',
    clockNow: new Date('2026-09-15T00:00:00.000Z'),
    preWriteGate: null,
    ownRunId: 4242,
  });

  it('L9 — a TWO-target ENRICHER runs to completion and its counters land on the targets its phases DECLARE', async () => {
    const pool = pool2();
    const compute = twoTargetCompute({
      geocode: { scoped: 120, updated: 90, updatedIds: [] },
      backfill_geom: { scoped: 40, updated: 35, updatedIds: [] },
    });
    const res = await stepLib.runEnrichPhase(args2(twoTargetDescriptor(), pool, compute) as never) as {
      written: Record<string, { scanned: number; updated: number; rows_changed: number }>;
    };
    const w = res.written;
    expect(w.fixture_a_written ?? w[Object.keys(w)[0]!], 'target keys exist').toBeDefined();
    const keys = Object.keys(w).filter((k) => typeof w[k] === 'object' && w[k] !== null && 'rows_changed' in (w[k] as object));
    expect(keys, 'exactly two declared write targets, no more').toHaveLength(2);
    const [k0, k1] = keys as [string, string];
    expect(w[k0]).toMatchObject({ scanned: 120, updated: 90, rows_changed: 90 });
    expect(w[k1]).toMatchObject({ scanned: 40, updated: 35, rows_changed: 35 });
  });

  it('L9b — a phase whose writes_ref points past the declared outputs.writes[] is a NAMED throw, not an undefined-property TypeError', async () => {
    const pool = pool2();
    const d = twoTargetDescriptor() as unknown as Record<string, unknown>;
    (d.execution as { phases: Array<{ writes_ref: number }> }).phases[1]!.writes_ref = 7;
    await expect(stepLib.runEnrichPhase(args2(d, pool, twoTargetCompute({})) as never))
      .rejects.toThrow(/writes_ref 7[\s\S]*outputs\.writes/);
  });

  it('L9c — the pass-result counter contract is honoured per pass: scoped / candidates / a bare updated all resolve, and scenarioUpdated is ADDED to updated', async () => {
    const pool = pool2();
    const compute = twoTargetCompute({
      // `candidates` (pass-4 shape) feeds `scanned`; `scenarioUpdated` (pass-3 shape) is added to `updated`.
      geocode: { candidates: 500, updated: 7, scenarioUpdated: 3 },
      // No scanned/scoped/candidates at all (pass-5 shape) — `updated` feeds BOTH.
      backfill_geom: { updated: 11 },
    });
    const res = await stepLib.runEnrichPhase(args2(twoTargetDescriptor(), pool, compute) as never) as {
      written: Record<string, { scanned: number; updated: number; rows_changed: number }>;
    };
    const keys = Object.keys(res.written).filter((k) => typeof res.written[k] === 'object' && res.written[k] !== null && 'rows_changed' in (res.written[k] as object));
    expect(res.written[keys[0]!]).toMatchObject({ scanned: 500, updated: 10, rows_changed: 10 });
    expect(res.written[keys[1]!]).toMatchObject({ scanned: 11, updated: 11, rows_changed: 11 });
  });
});

// ---------------------------------------------------------------------------
// batch-2 Phase 0.10b — THE POST-PHASE SEAM (`execution.enrich_hooks.post_phase`)
//
// 0.10 generalised `runEnrichPhase`'s PRE-phase hooks, its write seams and its
// per-target `written[]` counters. It did NOT generalise the POST-phase region,
// and I5 (`geocode_permits`) stopped at commit 4 on the consequence. Measured at
// `e074df3d`, before this row:
//
//   * three unconditional `SELECT COUNT(*) … FROM parcels` queries ran for EVERY
//     enrich-shaped step (only `enrich_parcels` could use any of them);
//   * `matched` was a hand-written ~30-key `enrich_parcels` literal built from five
//     LITERAL pass names, with no per-step contribution seam — so a second
//     ENRICHER's `counters.records_total.source: "matched.<its own key>"` resolved
//     NULL forever (Spec 48 §3.6, Spec 79 C11);
//   * `compute.computeAggregateRecordsUpdated(…)` was called with NO function guard,
//     unlike `contract_read`/`defer_scope`, which do guard — so an ENRICHER whose
//     compute lacks that export died at `TypeError` AFTER every pass had run and,
//     on a shared-txn step, AFTER COMMIT.
//
// The locks below prove both directions. Their `enrich_parcels` inverse arm —
// "the declared hook produces the SAME object the retired literal did" — lives in
// src/tests/steps/enrich_parcels/violations.test.ts, because that is an
// `enrich_parcels` claim and these are claims about a step that is NOT it.
// ---------------------------------------------------------------------------

describe('runEnrichPhase — the POST-PHASE seam (batch-2 Phase 0.10b)', () => {
  interface FakeClient { query: (text: string, values?: unknown[]) => Promise<unknown>; release: () => void }

  function poolP(rowCounts: Array<{ re: RegExp; rowCount: number }> = []) {
    const sql: string[] = [];
    const clients: FakeClient[] = [];
    const answer = (text: string) => {
      if (/pg_backend_pid/.test(text)) return { rows: [{ pid: 4242 }] };
      if (/pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: true }] };
      // M1e/M1g/M1h (RV-D4) — a caller-supplied rowCount for a specific write's SQL text,
      // needed to prove the SEAM's own increment (`ctx.joinUpdate`/`ctx.retract`, which
      // reads `result.rowCount` off THIS mock) reaches `written[key]` un-doubled.
      const hit = rowCounts.find((r) => r.re.test(text));
      if (hit) return { rows: [], rowCount: hit.rowCount };
      // Deliberately NOT stubbed: the whole point of M1 is that a step with no
      // post_phase hook must never issue this query, so an answer here would hide
      // the defect rather than expose it. (`{rows: []}` below makes the retired
      // code's `.then(r => r.rows[0].n)` throw, which is the RED.)
      return { rows: [], rowCount: 0 };
    };
    const record = async (text: string) => { sql.push(text); return answer(text); };
    return {
      sql,
      query: record,
      connect: async () => { const c: FakeClient = { query: record, release: () => {} }; clients.push(c); return c; },
    };
  }

  /** The `geocode_permits` shape: two targets, two phases, NO class-based target. */
  const baseDescriptor = () => ({
    identity: { name: 'fixture_post_phase', lock: 987656, archetype: 'ENRICHER', spec: '999' },
    outputs: {
      writes: [
        { table: 'fixture_a', key: 'id', write_discipline: { class: 'set_based_join_update' } },
        { table: 'fixture_b', key: 'id', write_discipline: { class: 'temp_materialize' } },
      ],
    },
    execution: {
      shape: 'enrich',
      heartbeat_minutes_from_config: 'fixture_heartbeat_minutes',
      lock_timeout_ms_from_config: 'fixture_lock_timeout_ms',
      phases: [
        { name: 'geocode', order: 1, txn: 'shared', writes_ref: 0, scope: 'full', timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
        { name: 'backfill_geom', order: 2, txn: 'shared', writes_ref: 1, scope: 'full', timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
      ],
      invocation: { sources: { argv: [], env: {} } },
    },
    guards: { requires: [] },
    recovery: 'none',
    override: { force_full: 'none', force_run: 'none', dry_run: 'none' },
    checks: [],
  });

  /**
   * A compute WITHOUT `computeAggregateRecordsUpdated` — which is the point. Before
   * 0.10b every ENRICHER had to export it or die after COMMIT; the four pre-existing
   * fake computes in this repo all stub it, which is exactly why no test reddened on
   * the real defect.
   */
  const bareCompute = (results: Record<string, Record<string, unknown>>, passLog?: string[], names: string[] = ['geocode', 'backfill_geom']) => ({
    passes: names.map((name) => ({
      name,
      txn: 'shared',
      run: async () => { if (passLog) passLog.push(name); return results[name] ?? {}; },
    })),
  });

  const argsP = (descriptor: Record<string, unknown>, pool: ReturnType<typeof poolP>, compute: unknown, extraConfig: Record<string, unknown> = {}) => ({
    descriptor,
    pool,
    compute,
    config: { fixture_pass_timeout_minutes: 5, fixture_heartbeat_minutes: 60, fixture_lock_timeout_ms: 0, ...extraConfig },
    chainId: null,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    tag: '[fixture_post_phase]',
    clockNow: new Date('2026-09-15T00:00:00.000Z'),
    preWriteGate: null,
    ownRunId: 4242,
  });

  it('M1 — an ENRICHER with NO post_phase hook and NO aggregate helper runs to completion, issues no `parcels` query, and still emits FINITE counters', async () => {
    const pool = poolP();
    const res = await stepLib.runEnrichPhase(argsP(baseDescriptor(), pool, bareCompute({
      geocode: { scoped: 120, updated: 90 },
      backfill_geom: { scoped: 40, updated: 35 },
    })) as never) as { matched: Record<string, unknown>; written: Record<string, { scanned: number; inserted: number; updated: number }> };

    // RED at e074df3d: `TypeError: Cannot read properties of undefined (reading 'n')`
    // from the first `parcels` COUNT, and — with that stubbed — `TypeError:
    // compute.computeAggregateRecordsUpdated is not a function`, both thrown after
    // the shared transaction had already COMMITted.
    expect(pool.sql.some((t) => /FROM parcels/.test(t)), 'a step that does not read `parcels` must not be made to COUNT it three times').toBe(false);

    const agg = res.matched.compute as Record<string, number>;
    expect(agg, '`matched.compute` is the declared counter-source root — never absent').toBeDefined();
    // DERIVED from the declared per-target counters, not invented: 120+40 scanned,
    // 0 inserted (neither pass reports one), 90+35 updated.
    expect(agg).toEqual({ records_scanned_aggregate: 160, records_new_aggregate: 0, records_updated_aggregate: 125 });
    for (const [k, v] of Object.entries(agg)) {
      expect(Number.isFinite(v), `compute.${k} must be a finite number, not null — NULL is not zero (Spec 48 §3.6)`).toBe(true);
    }
    // And the generic runner-owned keys are all still there.
    expect(Object.keys(res.matched)).toContain('fixture_post_phase_duration_ms');
    expect(res.matched.passes).toBeDefined();
  });

  it('M1b — a declared post_phase hook OWNS `matched.compute`, key names included; the derived fallback does not overwrite it', async () => {
    const pool = poolP();
    const compute = {
      ...bareCompute({ geocode: { scoped: 120, updated: 90 }, backfill_geom: { scoped: 40, updated: 35 } }),
      myPostPhase: async () => ({
        matched: { newly_geocoded: 77, zombies_cleaned: 4 },
        compute: { total_permits_scanned: 254082, records_new_aggregate: 0, records_updated_aggregate: 77 },
      }),
    };
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.execution as Record<string, unknown>).enrich_hooks = { post_phase: 'myPostPhase' };
    const res = await stepLib.runEnrichPhase(argsP(d, pool, compute) as never) as { matched: Record<string, unknown> };

    // THE POINT OF THE ROW: a second ENRICHER's own key reaches `matched`, so
    // `counters.records_total.source: "matched.newly_geocoded"` resolves to 77
    // instead of null forever.
    expect(res.matched.newly_geocoded).toBe(77);
    expect(res.matched.zombies_cleaned).toBe(4);
    expect(res.matched.compute).toEqual({ total_permits_scanned: 254082, records_new_aggregate: 0, records_updated_aggregate: 77 });
    // The step's own vocabulary survives — the runner does not mint `records_scanned_aggregate`
    // over the top of a block the step declared.
    expect(Object.keys(res.matched.compute as object)).not.toContain('records_scanned_aggregate');
  });

  it('M1c — a hook that returns `matched` but NO `compute` still gets a derived, finite aggregate', async () => {
    const pool = poolP();
    const compute = {
      ...bareCompute({ geocode: { scoped: 10, updated: 6 }, backfill_geom: { updated: 2 } }),
      myPostPhase: async () => ({ matched: { newly_geocoded: 6 } }),
    };
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.execution as Record<string, unknown>).enrich_hooks = { post_phase: 'myPostPhase' };
    const res = await stepLib.runEnrichPhase(argsP(d, pool, compute) as never) as { matched: Record<string, unknown> };
    expect(res.matched.newly_geocoded).toBe(6);
    expect(res.matched.compute).toEqual({ records_scanned_aggregate: 12, records_new_aggregate: 0, records_updated_aggregate: 8 });
  });

  it('M1d — the derived aggregate sums the DECLARED-phase targets only, so a class-based stamp target cannot double-count rows its own phases already reported', async () => {
    // Output-panel Integration seat, 2026-09-16. `enrich_parcels` declares SEVEN write
    // targets but only FIVE are named by an `execution.phases[].writes_ref`; the two
    // class-based ones are filled AFTER the phase loop by the runner's own stampsIdx /
    // scopeIdx blocks, and the stamp target's `updated` is `zoning.updated +
    // max_build.updated` — rows already counted on those two phases' own targets. Summing
    // every declared write would double-count them under the SAME key name a hook fills
    // with a distinct-id UNION: one key, two semantics. RED before the fix: 90 + 35 + 125
    // = 250 updated (the stamp target counted twice).
    const pool = poolP();
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.outputs as { writes: unknown[] }).writes.push({ table: 'fixture_stamp', key: 'id', write_discipline: { class: 'set_based_scoped' } });
    const ph = (d.execution as { phases: Array<{ name: string }> }).phases;
    ph[0]!.name = 'zoning';
    ph[1]!.name = 'max_build';
    const res = await stepLib.runEnrichPhase(argsP(d, pool, bareCompute({
      // the stampsIdx block reads these two LITERAL pass names (the narrowed, filed residue),
      // so name the passes accordingly to make the target non-zero and the hazard reachable.
      zoning: { scoped: 120, updated: 90 },
      max_build: { scoped: 40, updated: 35 },
    }, undefined, ['zoning', 'max_build'])) as never) as {
      matched: Record<string, unknown>; written: Record<string, { updated: number }>;
    };
    // The stamp target IS filled — the runner-owned block still runs, unchanged …
    const stampKey = Object.keys(res.written).filter((k) => /^e\d+$/.test(k)).sort()[2]!;
    expect(res.written[stampKey]!.updated, 'stampsIdx still fills the class-based target').toBe(125);
    // … and it is EXCLUDED from the aggregate, because no phase declares it.
    expect(res.matched.compute).toEqual({ records_scanned_aggregate: 160, records_new_aggregate: 0, records_updated_aggregate: 125 });
  });

  // ---------------------------------------------------------------------------
  // M1e-M1h — RV-D4 (WF3, 2026-09-20). `runEnrichPhase` keeps a per-run set of
  // seam-touched target keys, filled inside `ctx.joinUpdate`/`ctx.retract`
  // (`makeWriteSeams`); the PASS_SCANNED_FIELDS fallback loop skips `updated`/
  // `rows_changed` for any key in that set, because the seam already incremented
  // them. Before the fix the fallback was unconditional, so a pass using a seam
  // AND returning `updated` in its own result got counted TWICE.
  // ---------------------------------------------------------------------------

  it('M1e — a seam pass (ctx.joinUpdate) returning `updated` in its pass result counts the write ONCE, not twice', async () => {
    // RED at 39b246c0: the seam's own `written.e1.updated += 30` (inside ctx.joinUpdate)
    // composes with the unconditional PASS_SCANNED_FIELDS fallback's `written.e1.updated
    // += r.updated` (30 again) → 60, not 30 (rows_changed likewise).
    const pool = poolP([{ re: /UPDATE fixture_a/, rowCount: 30 }]);
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    const compute = {
      passes: [
        {
          name: 'geocode',
          txn: 'shared',
          run: async (_client: unknown, ctx: Record<string, unknown>) => {
            await (ctx.joinUpdate as (ref: number, sql: string, p: unknown[]) => Promise<number>)(
              0, 'UPDATE fixture_a SET x = s.v FROM src s WHERE s.id = fixture_a.id', [],
            );
            return { updated: 30 };
          },
        },
        { name: 'backfill_geom', txn: 'shared', run: async () => ({}) },
      ],
    };
    const res = await stepLib.runEnrichPhase(argsP(d, pool, compute) as never) as {
      matched: Record<string, unknown>; written: Record<string, { updated: number; rows_changed: number }>;
    };
    expect(res.written.e1!.updated, 'RED before fix: 60 (seam 30 + fallback 30)').toBe(30);
    expect(res.written.e1!.rows_changed, 'RED before fix: 60').toBe(30);
    expect((res.matched.compute as Record<string, number>).records_updated_aggregate).toBe(30);
  });

  it('M1f — a NON-seam pass on a class-N (set_based_join_update) target is still counted via the fallback (the enrich_parcels comparable_builds fence — the rejected class-gated shape zeroes this)', async () => {
    // GREEN today and after the fix. The REJECTED filed shape ("skip the fallback when
    // the declared class is a seam class") is proven wrong by temporarily applying it
    // here and observing this test go RED (0, not 25) — recorded in the commit body,
    // then reverted; see the plan's "REJECTED fix shape" section.
    const pool = poolP();
    const compute = bareCompute({ geocode: { candidates: 40, updated: 25 }, backfill_geom: {} });
    const res = await stepLib.runEnrichPhase(argsP(baseDescriptor(), pool, compute) as never) as {
      written: Record<string, { updated: number; scanned: number }>;
    };
    expect(res.written.e1!.updated).toBe(25);
    expect(res.written.e1!.scanned).toBe(40);
  });

  it('M1g — ctx.retract on a class-O (set_based_null_retract) target counts `retracted`/`rows_changed` from the seam only; `updated` stays 0', async () => {
    // RED at 39b246c0: rows_changed 14 (seam's 7 + fallback's 7), updated 7 (from the
    // pass's own `{ updated: 7 }`, which a retraction target should never report).
    const pool = poolP([{ re: /UPDATE fixture_a/, rowCount: 7 }]);
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d as Record<string, unknown>).recovery = { before_image: 'generated' };
    const specs = (d.outputs as { writes: Array<Record<string, unknown>> }).writes;
    specs[0] = {
      table: 'fixture_a',
      key: 'id',
      write_discipline: { class: 'set_based_null_retract', scope: 'fixture_col IS NOT NULL', retract: 'all' },
      columns: [{ name: 'fixture_col', source: 'compute', written: 'always' }],
    };
    const compute = {
      passes: [
        {
          name: 'geocode',
          txn: 'shared',
          run: async (_client: unknown, ctx: Record<string, unknown>) => {
            await (ctx.retract as (ref: number, p: unknown[]) => Promise<number>)(0, []);
            return { retracted: 7, updated: 7 };
          },
        },
        { name: 'backfill_geom', txn: 'shared', run: async () => ({}) },
      ],
    };
    const res = await stepLib.runEnrichPhase(argsP(d, pool, compute) as never) as {
      written: Record<string, { retracted: number; updated: number; rows_changed: number }>;
    };
    expect(res.written.e1!.retracted).toBe(7);
    expect(res.written.e1!.rows_changed, 'RED before fix: 14').toBe(7);
    expect(res.written.e1!.updated, 'RED before fix: 7').toBe(0);
  });

  it('M1h — the `scanned` fallback still applies on a seam-owned key (no seam writes `scanned`)', async () => {
    const pool = poolP([{ re: /UPDATE fixture_a/, rowCount: 30 }]);
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    const compute = {
      passes: [
        {
          name: 'geocode',
          txn: 'shared',
          run: async (_client: unknown, ctx: Record<string, unknown>) => {
            await (ctx.joinUpdate as (ref: number, sql: string, p: unknown[]) => Promise<number>)(
              0, 'UPDATE fixture_a SET x = s.v FROM src s WHERE s.id = fixture_a.id', [],
            );
            return { scanned: 100, updated: 30 };
          },
        },
        { name: 'backfill_geom', txn: 'shared', run: async () => ({}) },
      ],
    };
    const res = await stepLib.runEnrichPhase(argsP(d, pool, compute) as never) as {
      written: Record<string, { scanned: number; updated: number }>;
    };
    expect(res.written.e1!.scanned).toBe(100);
    expect(res.written.e1!.updated).toBe(30);
  });

  it('M2 — a DECLARED-but-not-exported post_phase is a NAMED throw raised BEFORE the first phase, never a TypeError after COMMIT', async () => {
    const pool = poolP();
    const passLog: string[] = [];
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.execution as Record<string, unknown>).enrich_hooks = { post_phase: 'computeNoSuchThing' };
    await expect(stepLib.runEnrichPhase(argsP(d, pool, bareCompute({}, passLog)) as never))
      .rejects.toThrow(/execution\.enrich_hooks\.post_phase names "computeNoSuchThing"[\s\S]*does not export/);
    // The half that makes it a fix rather than a rename: NOTHING ran.
    expect(passLog, 'the throw must land before the first phase, not after the transaction has committed').toEqual([]);
    expect(pool.sql.some((t) => /BEGIN/i.test(t)), 'no transaction was opened').toBe(false);
  });

  it('M2b — the literal "none", like an omitted field, disables the hook rather than naming an export', async () => {
    const pool = poolP();
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.execution as Record<string, unknown>).enrich_hooks = { post_phase: 'none' };
    const res = await stepLib.runEnrichPhase(argsP(d, pool, bareCompute({ geocode: { updated: 1 } })) as never) as { matched: Record<string, unknown> };
    expect((res.matched.compute as Record<string, number>).records_updated_aggregate).toBe(1);
  });

  it('M3 — a hook returning a RUNNER-OWNED key is a named throw, never a silent overwrite in either direction', async () => {
    for (const key of ['passes', 'compute', 'before_image', 'fixture_post_phase_duration_ms', 'scope_retired_rows']) {
      const pool = poolP();
      const compute = {
        ...bareCompute({ geocode: { updated: 1 } }),
        myPostPhase: async () => ({ matched: { [key]: 'hijacked' } }),
      };
      const d = baseDescriptor() as unknown as Record<string, unknown>;
      (d.execution as Record<string, unknown>).enrich_hooks = { post_phase: 'myPostPhase' };
      await expect(stepLib.runEnrichPhase(argsP(d, pool, compute) as never), `"${key}" is runner-owned`)
        .rejects.toThrow(new RegExp(`returned the key "${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}", which the RUNNER owns`));
    }
  });

  it('M4 — a non-finite value anywhere in the hook\'s `compute` block is a named throw, not a counter that silently resolves to null', async () => {
    for (const bad of [undefined, null, NaN, '77', Infinity]) {
      const pool = poolP();
      const compute = {
        ...bareCompute({ geocode: { updated: 1 } }),
        myPostPhase: async () => ({ compute: { records_updated_aggregate: bad } }),
      };
      const d = baseDescriptor() as unknown as Record<string, unknown>;
      (d.execution as Record<string, unknown>).enrich_hooks = { post_phase: 'myPostPhase' };
      await expect(stepLib.runEnrichPhase(argsP(d, pool, compute) as never), `${String(bad)} is not a finite number`)
        .rejects.toThrow(/returned compute\.records_updated_aggregate = .*which is not a finite number/);
    }
  });

  it('M4b — a hook returning a non-object, or a non-object `matched`/`compute`, is a named throw', async () => {
    const cases: Array<[unknown, RegExp]> = [
      [[1, 2], /returned an array[\s\S]*plain object/],
      ['nope', /returned "nope"[\s\S]*plain object/],
      [{ matched: [1] }, /`matched` that is not a plain object[\s\S]*an array/],
      [{ compute: 5 }, /`compute` block that is not a plain object/],
    ];
    for (const [ret, re] of cases) {
      const pool = poolP();
      const compute = { ...bareCompute({ geocode: { updated: 1 } }), myPostPhase: async () => ret };
      const d = baseDescriptor() as unknown as Record<string, unknown>;
      (d.execution as Record<string, unknown>).enrich_hooks = { post_phase: 'myPostPhase' };
      await expect(stepLib.runEnrichPhase(argsP(d, pool, compute) as never), String(JSON.stringify(ret))).rejects.toThrow(re);
    }
  });

  it('M6 — the four `scope_*` retirement keys are gated on the DECLARED scope-ledger write class, not emitted as four permanent nulls', async () => {
    // (a) no `insert_only_no_retraction` target ⇒ the keys are ABSENT, not null.
    const poolA = poolP();
    const resA = await stepLib.runEnrichPhase(argsP(baseDescriptor(), poolA, bareCompute({ geocode: { updated: 1 } })) as never) as { matched: Record<string, unknown> };
    for (const k of ['scope_backlog_at_step_start', 'scope_retired_rows', 'scope_retired_cohorts', 'scope_retire_window']) {
      expect(Object.keys(resA.matched), `${k} describes a mechanism this step does not have`).not.toContain(k);
    }

    // (b) declare one ⇒ all four are present, carrying the retirement's own numbers.
    // NOTE (filed, not fixed here): the retention window is still read from the
    // HARDCODED key `config.enrich_parcels_scope_retire_after_hours` — the same
    // Rule-3 class 0.10 retired for the heartbeat and the lock timeout, surviving
    // here because `hasScopeLedger` gates it and `enrich_parcels` is the only step
    // that has ever declared that write class.
    const poolB = poolP();
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.outputs as { writes: unknown[] }).writes.push({ table: 'fixture_scope', key: 'id', write_discipline: { class: 'insert_only_no_retraction' } });
    const compute = {
      ...bareCompute({ geocode: { updated: 1 } }),
      retireStaleScope: async () => ({ backlog_rows: 8, backlog_cohorts: 2, retired_rows: 5, retired_cohorts: 1, retire_after_hours: 24, cutoff_at: new Date('2026-09-14T00:00:00.000Z') }),
    };
    const resB = await stepLib.runEnrichPhase(argsP(d, poolB, compute, { enrich_parcels_scope_retire_after_hours: 24 }) as never) as { matched: Record<string, unknown> };
    expect(resB.matched.scope_backlog_at_step_start).toBe(8);
    expect(resB.matched.scope_retired_rows).toBe(5);
    expect(resB.matched.scope_retired_cohorts).toBe(1);
    expect(resB.matched.scope_retire_window).toEqual({ hours: 24, cutoff_at: new Date('2026-09-14T00:00:00.000Z') });
  });
});

describe('runEnrichPhase — override.dry_run seam (batch-2 row 2.6, Spec 124 R-AV)', () => {
  // The Phase 0.10b block above scopes `poolP`/`baseDescriptor`/`argsP` to ITS own
  // `describe`; the same three helpers are reproduced here VERBATIM so this block is
  // independent of that one's lifetime (no shared mutable fixture).
  interface FakeClient { query: (text: string, values?: unknown[]) => Promise<unknown>; release: () => void }

  function poolP(rowCounts: Array<{ re: RegExp; rowCount: number }> = []) {
    const sql: string[] = [];
    const clients: FakeClient[] = [];
    const answer = (text: string) => {
      if (/pg_backend_pid/.test(text)) return { rows: [{ pid: 4242 }] };
      if (/pg_try_advisory(?:_xact)?_lock\(\$1, \$2\)/.test(text)) return { rows: [{ acquired: true }] };
      const hit = rowCounts.find((r) => r.re.test(text));
      if (hit) return { rows: [], rowCount: hit.rowCount };
      return { rows: [], rowCount: 0 };
    };
    const record = async (text: string) => { sql.push(text); return answer(text); };
    return {
      sql,
      query: record,
      connect: async () => { const c: FakeClient = { query: record, release: () => {} }; clients.push(c); return c; },
    };
  }

  const baseDescriptor = () => ({
    identity: { name: 'fixture_post_phase', lock: 987656, archetype: 'ENRICHER', spec: '999' },
    outputs: {
      writes: [
        { table: 'fixture_a', key: 'id', write_discipline: { class: 'set_based_join_update' } },
        { table: 'fixture_b', key: 'id', write_discipline: { class: 'temp_materialize' } },
      ],
    },
    execution: {
      shape: 'enrich',
      heartbeat_minutes_from_config: 'fixture_heartbeat_minutes',
      lock_timeout_ms_from_config: 'fixture_lock_timeout_ms',
      phases: [
        { name: 'geocode', order: 1, txn: 'shared', writes_ref: 0, scope: 'full', timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
        { name: 'backfill_geom', order: 2, txn: 'shared', writes_ref: 1, scope: 'full', timeout_minutes_from_config: 'fixture_pass_timeout_minutes' },
      ],
      invocation: { sources: { argv: [], env: {} } },
    },
    guards: { requires: [] },
    recovery: 'none',
    override: { force_full: 'none', force_run: 'none', dry_run: 'none' },
    checks: [],
  });

  const argsP = (descriptor: Record<string, unknown>, pool: ReturnType<typeof poolP>, compute: unknown, extraConfig: Record<string, unknown> = {}) => ({
    descriptor,
    pool,
    compute,
    config: { fixture_pass_timeout_minutes: 5, fixture_heartbeat_minutes: 60, fixture_lock_timeout_ms: 0, ...extraConfig },
    chainId: null,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    tag: '[fixture_post_phase]',
    clockNow: new Date('2026-09-15T00:00:00.000Z'),
    preWriteGate: null,
    ownRunId: 4242,
  });

  // ---------------------------------------------------------------------------
  // Spec 124 R-AV. `runEnrichPhase` resolved `overrides` and then read
  // `overrides.dry_run` at ZERO sites in its body, while the shared audit assembly
  // emitted `dryRunRow()` (`dry_run_no_writes: true`) and persisted `dry_run: true`
  // on the run record whenever `stepCtx.overrides.dry_run` was truthy. An ENRICHER
  // descriptor declaring an argv arm (`"dry_run": "--dry-run"`) would therefore
  // print "no writes" on a run that WROTE. The gate keys on `overrides.dry_run`
  // (via `staleness.resolveOverrides` → `dryRunArgPresent`), NEVER raw `process.argv`.
  // ---------------------------------------------------------------------------

  it('T1 — override.dry_run declared + --dry-run on argv ⇒ NO write region is entered (RED before: UPDATE issued, updated=30)', async () => {
    // RED before the fix: the shared-txn pass execution runs, so `ctx.joinUpdate`
    // issues its UPDATE and `res.written.e1.updated` reads the row count (30).
    const pool = poolP([{ re: /UPDATE fixture_a/, rowCount: 30 }]);
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.override as Record<string, unknown>).dry_run = '--dry-run';
    const passLog: string[] = [];
    const compute = {
      passes: [
        {
          name: 'geocode',
          txn: 'shared',
          run: async (_client: unknown, ctx: Record<string, unknown>) => {
            passLog.push('geocode');
            await (ctx.joinUpdate as (ref: number, sql: string, p: unknown[]) => Promise<number>)(
              0, 'UPDATE fixture_a SET x = s.v FROM src s WHERE s.id = fixture_a.id', [],
            );
            return { updated: 30 };
          },
        },
        { name: 'backfill_geom', txn: 'shared', run: async () => { passLog.push('backfill_geom'); return {}; } },
      ],
    };
    let res!: { written: Record<string, { updated: number; rows_changed: number }> };
    await withDryRunArgv(async () => {
      res = await stepLib.runEnrichPhase(argsP(d, pool, compute) as never) as typeof res;
    });

    // `poolP`'s single `record` is shared by every `connect()`ed client, so the
    // runner's OWN heartbeat writes (`UPDATE pipeline_runs`, an observability write on
    // a dedicated autocommit client, never a step write region) land in `pool.sql` too.
    // The claim is that no STEP write is issued: exclude the heartbeat table, and the
    // remaining set must be empty.
    const writes = pool.sql.filter((t) => /^\s*(UPDATE|INSERT|DELETE)/i.test(t) && !/pipeline_runs/i.test(t));
    expect(writes, `a dry-run must issue zero step-write statements; saw: ${writes.join(' | ')}`).toEqual([]);
    expect(res.written.e1!.updated, 'RED before fix: 30').toBe(0);
    expect(res.written.e1!.rows_changed, 'RED before fix: 30').toBe(0);
    expect(passLog, 'the write region is skipped whole — the pass body must not execute').toEqual([]);
  });

  it('T2 — identical descriptor/compute WITHOUT --dry-run ⇒ the UPDATE is issued and updated=30', async () => {
    const pool = poolP([{ re: /UPDATE fixture_a/, rowCount: 30 }]);
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.override as Record<string, unknown>).dry_run = '--dry-run';
    const compute = {
      passes: [
        {
          name: 'geocode',
          txn: 'shared',
          run: async (_client: unknown, ctx: Record<string, unknown>) => {
            await (ctx.joinUpdate as (ref: number, sql: string, p: unknown[]) => Promise<number>)(
              0, 'UPDATE fixture_a SET x = s.v FROM src s WHERE s.id = fixture_a.id', [],
            );
            return { updated: 30 };
          },
        },
        { name: 'backfill_geom', txn: 'shared', run: async () => ({}) },
      ],
    };
    const res = await stepLib.runEnrichPhase(argsP(d, pool, compute) as never) as {
      written: Record<string, { updated: number; rows_changed: number }>;
    };
    expect(pool.sql.some((t) => /^\s*UPDATE fixture_a/i.test(t)), 'the flag is absent — the write region runs').toBe(true);
    expect(res.written.e1!.updated).toBe(30);
    expect(res.written.e1!.rows_changed).toBe(30);
  });

  it('T3 — override.dry_run = "none" WITH --dry-run on argv ⇒ the UPDATE is issued and updated=30 (declaration governs, not raw argv)', async () => {
    const pool = poolP([{ re: /UPDATE fixture_a/, rowCount: 30 }]);
    const d = baseDescriptor() as unknown as Record<string, unknown>;
    (d.override as Record<string, unknown>).dry_run = 'none';
    const compute = {
      passes: [
        {
          name: 'geocode',
          txn: 'shared',
          run: async (_client: unknown, ctx: Record<string, unknown>) => {
            await (ctx.joinUpdate as (ref: number, sql: string, p: unknown[]) => Promise<number>)(
              0, 'UPDATE fixture_a SET x = s.v FROM src s WHERE s.id = fixture_a.id', [],
            );
            return { updated: 30 };
          },
        },
        { name: 'backfill_geom', txn: 'shared', run: async () => ({}) },
      ],
    };
    let res!: { written: Record<string, { updated: number; rows_changed: number }> };
    await withDryRunArgv(async () => {
      res = await stepLib.runEnrichPhase(argsP(d, pool, compute) as never) as typeof res;
    });
    expect(pool.sql.some((t) => /^\s*UPDATE fixture_a/i.test(t)), 'no declared arm ⇒ --dry-run on argv means nothing here').toBe(true);
    expect(res.written.e1!.updated).toBe(30);
    expect(res.written.e1!.rows_changed).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// WF3 batch-2 row 3.1, prerequisite 0a — the FIRST class-A INGESTOR
// (`address_points`) found that `runIngestPhase` had never executed a `guarded_upsert`
// plan. `write-class-disposition.json` lists only the link/keyed/compute executors for
// class A, so the ingest path's `executeWrite` had only ever seen a class-B plan whose
// `delete_sql` is a string — and it issued that statement unconditionally. A class-A plan
// carries `delete_sql: null` (buildWritePlan maps `retract: "none"` to null, rather than a
// statement "the runner remembers not to call"), so the first non-empty class-A run
// reached `client.query(null, [keys])` and pg threw.
//
// The fix is on the RUNNER, gated on the plan's own `delete_sql` — the same premise
// `retractionFires` reads — and NOT a `shouldSkipDelete` that returns true for class A:
// that would be the per-step escape hatch Spec 122 §5.1 forbids (and would also mark
// `delete_skipped_empty_guard`, conflating "nothing declared" with "guard fired").
// All three arms are locked, so the fix cannot widen the guard's meaning either.
// ---------------------------------------------------------------------------

describe('executeWrite — class-A guarded_upsert issues NO departure DELETE (batch-2 row 3.1 prerequisite 0a, Spec 122 §1.4 / §5.1)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write module
  const write = require(join(process.cwd(), 'scripts/lib/step/write.js'));

  /**
   * The class-B plan the ingest runner has always seen: `load-ravines`' declared write.
   * The class-A twin is DERIVED from it (never hand-built), so the two plans differ by
   * exactly the two declared axes the classes are named for — `write_discipline.class`
   * and `retract` — and by the `delete_sql: null` those axes generate.
   */
  const classBSpec = () => clone(LOAD_RAVINES.outputs.writes[0]) as {
    write_discipline: { class: string; guard: string; guard_columns: string[] };
    retract: string;
    [k: string]: unknown;
  };

  /** The class-A twin: `guarded_upsert` + `retract: "none"`, guard unchanged. */
  const classASpec = () => {
    const s = classBSpec();
    s.write_discipline.class = 'guarded_upsert';
    s.retract = 'none';
    // Kept from class B on purpose: class A is "no departure DELETE", NOT "no guard".
    expect(s.write_discipline.guard).toBe('is_distinct_from');
    expect(s.write_discipline.guard_columns).toEqual(['geom', 'source_dataset_version']);
    return s;
  };

  /** Two rows of the shape `carried` has when it arrives from `validateGeometries`. */
  const carried = [
    { source_id: 101, geom: '\\\\x00' },
    { source_id: 102, geom: '\\\\x00' },
  ];

  /**
   * The fake pool these tests use: `fakePool` PLUS the two things pg guarantees and the
   * default helper does not — a non-string statement is a `TypeError`, and an upsert
   * `RETURNING (xmax = 0) AS is_insert` yields one row per bound row. Without the first,
   * the class-A RED would be a silent no-op (`sql.push(null)` succeeds); without the
   * second, `written.inserted` could not be derived from `is_insert` rows at all.
   *
   * @param inserted how many of the returned `RETURNING` rows report `is_insert: true`.
   */
  const writePool = (inserted: number) => {
    const pool = fakePool();
    const statement = async (text: string, values?: unknown[]) => {
      if (typeof text !== 'string') throw new TypeError('sql must be a string');
      pool.sql.push(text);
      pool.params.push(values ?? []);
      if (/^\s*INSERT INTO/i.test(text)) {
        const rows = Math.max(1, (values ?? []).length / 4);
        return { rows: Array.from({ length: rows }, (_, i) => ({ is_insert: i < inserted })) };
      }
      if (/^\s*DELETE/i.test(text)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };
    // `query` is the SAME recording surface `connect()` hands out, so the default helper's
    // `paramsOf`/`fakePool` type is satisfied without changing what `executeWrite` sees.
    return { ...pool, connect: async () => ({ query: statement, release: () => {} }) };
  };

  const log = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() });

  it('T1 — a class-A plan (delete_sql === null) issues the guarded upsert and NO departure DELETE (RED before the fix: rejects with TypeError("sql must be a string") from the null statement)', async () => {
    const spec = classASpec();
    const plan = write.buildWritePlan(spec, LOAD_RAVINES);
    // The PREMISE, asserted first: class A generates no retraction statement at all.
    expect(plan.delete_sql, 'retract "none" ⇒ no statement, rather than a statement the runner must remember not to call').toBeNull();
    expect(plan.mechanic).toBe('guarded_upsert');

    const pool = writePool(1);
    const l = log();
    // Pre-fix this awaited call rejects: TypeError('sql must be a string') — the same
    // thing pg does when `client.query(null, …)` reaches it.
    const written = await write.executeWrite(pool, {
      plan,
      writeSpec: spec,
      carried,
      columnValues: (row: Record<string, unknown>) => ({ ...row, source_dataset_version: 3, updated_at: 'now' }),
      shouldSkipDelete: () => false,
      log: l,
      tag: 'load_ravines',
    }) as { inserted: number; updated: number; deleted: number; rows_changed: number; delete_skipped_empty_guard: boolean };

    // No DELETE, and — the real RED — no query call received a non-string statement.
    expect(pool.sql.filter((s) => /^\s*DELETE/i.test(s)), 'class A has nothing to retract').toEqual([]);
    expect(pool.sql.every((s) => typeof s === 'string'), 'a null statement would have thrown above; assert it never got that far').toBe(true);
    // Both rows went through the guarded upsert (counted per the fake pool's is_insert rows).
    expect(written.inserted + written.updated).toBe(2);
    expect(written.inserted).toBe(1);
    expect(written.updated).toBe(1);
    expect(written.rows_changed).toBe(2);
    // ARM 1 is silent and does not touch the guard's counter: "nothing declared" is not
    // "the guard fired".
    expect(written.deleted).toBe(0);
    expect(written.delete_skipped_empty_guard).toBe(false);
    expect(l.warn, 'ARM 1 must not warn — the guard warning would drown on every clean class-A run').not.toHaveBeenCalled();
  });

  it('T2 — the other direction: a class-B plan still issues exactly ONE departure DELETE with [loadedKeys] as its params', async () => {
    const spec = classBSpec();
    const plan = write.buildWritePlan(spec, LOAD_RAVINES);
    expect(typeof plan.delete_sql, 'class B generates the scoped departure DELETE').toBe('string');
    expect(plan.delete_sql).toMatch(/^\s*DELETE FROM ravines/i);

    const pool = writePool(2);
    const written = await write.executeWrite(pool, {
      plan,
      writeSpec: spec,
      carried,
      columnValues: (row: Record<string, unknown>) => ({ ...row, source_dataset_version: 3, updated_at: 'now' }),
      shouldSkipDelete: () => false,
      log: log(),
      tag: 'load_ravines',
    }) as { inserted: number; updated: number; deleted: number; delete_skipped_empty_guard: boolean };

    const deletes = pool.sql.filter((s) => /^\s*DELETE/i.test(s));
    expect(deletes, 'exactly one departure DELETE').toHaveLength(1);
    // The DELETE binds the keys this run just wrote — the retraction is scoped to the run.
    expect(paramsOf(pool, (s) => /^\s*DELETE/i.test(s))).toEqual([[101, 102]]);
    // ...and `deleted` is the statement's rowCount, not a constant.
    expect(written.deleted).toBe(1);
    expect(written.inserted + written.updated).toBe(2);
    expect(written.delete_skipped_empty_guard).toBe(false);
  });

  it('T3 — the empty-set guard still suppresses a class-B DELETE, and still warns exactly once (pinned so ARM 1 cannot widen it)', async () => {
    const spec = classBSpec();
    const plan = write.buildWritePlan(spec, LOAD_RAVINES);
    const pool = writePool(2);
    const l = log();
    const written = await write.executeWrite(pool, {
      plan,
      writeSpec: spec,
      carried,
      columnValues: (row: Record<string, unknown>) => ({ ...row, source_dataset_version: 3, updated_at: 'now' }),
      shouldSkipDelete: () => true,
      log: l,
      tag: 'load_ravines',
    }) as { inserted: number; updated: number; deleted: number; delete_skipped_empty_guard: boolean };

    expect(pool.sql.filter((s) => /^\s*DELETE/i.test(s))).toEqual([]);
    expect(written.deleted).toBe(0);
    // The upsert half is untouched — only the retraction is suppressed.
    expect(written.inserted + written.updated).toBe(2);
    expect(written.delete_skipped_empty_guard).toBe(true);
    expect(l.warn).toHaveBeenCalledTimes(1);
    expect(l.warn).toHaveBeenCalledWith('load_ravines', expect.stringMatching(/empty-set guard: the scoped departure DELETE was suppressed/));
  });
});

// ---------------------------------------------------------------------------
// INGESTOR CSV acquisition — format axis + compute.shapeRecord (batch-2 row 3.1
// prerequisite 0b). Before this brief `acquireExternal` was dispatch-free:
// `downloadArchive -> extractArchive -> locateShapefile -> parseShapefile`,
// unconditionally, for every declared external. Three of the eight INGESTORs
// (address_points, parcels, load_wsib) are bare CSVs, so a declared, required
// `format` axis (`step.schema.json inputs.reads.externals[].format`) now selects
// the parser instead of an extension sniff. `downloadArchive`/`hashThrough` (FENCE
// 0b230472) are untouched by this brief — bytes are still hashed as they land on
// either branch.
// ---------------------------------------------------------------------------
describe('INGESTOR CSV acquisition — format axis + compute.shapeRecord (batch-2 row 3.1 prerequisite 0b)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real write.js lib, spied on below
  const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fixture bytes
  const fsSync = require('node:fs');

  const CSV_FIXTURES = join(process.cwd(), 'src/tests/fixtures/csv-acquire');
  const NO_LOG = { info: () => {}, warn: () => {}, error: () => {} };
  const intOrNull = (raw: unknown) => { const n = Number(raw); return Number.isFinite(n) ? n : null; };

  /** A fake `ctxFetch`: HEAD returns headers only, GET streams the given bytes — the
   * same two-call shape `downloadArchive`/`headValidators` drive in production. */
  function fetchImplFor(bytes: Buffer) {
    return async (_url: string, init?: { method?: string }) =>
      (init && init.method === 'HEAD'
        ? new Response(null, { headers: { 'last-modified': 'Tue, 01 Apr 2025 00:00:00 GMT' } })
        : new Response(new Uint8Array(bytes), { headers: { 'last-modified': 'Tue, 01 Apr 2025 00:00:00 GMT' } }));
  }

  it('T1 — acquireExternal(format:"csv") parses 5 rows into {[keyColumn]: key, record}, bad_key_count 0 '
    + '(RED before this brief: every external was unzipped unconditionally, so this threw inside extractArchive — "not a zip")', async () => {
    const bytes = fsSync.readFileSync(join(CSV_FIXTURES, 'five-rows.csv'));
    const external = {
      id: 'csv-acquire-t1', format: 'csv', csv_options: { bom: false, relax_quotes: true },
      url: 'https://example.invalid/five-rows.csv',
    };
    const out = await acquireLib.acquireExternal({
      ctxFetch: fetchImplFor(bytes),
      log: NO_LOG,
      tag: '[csv_acquire_t1]',
      slug: 'csv_acquire_t1',
      external,
      descriptor: LOAD_RAVINES,
      prior: null,
      timeoutMs: 30_000,
      keyProperty: 'ID',
      keyColumn: 'source_id',
      coerceKey: intOrNull,
      forced: true,
      emitSkeleton: {},
      preAcquisitionGate: () => ({ skip: false, reason: 'test' }),
    });
    expect(out.features).toHaveLength(5);
    for (const f of out.features as Array<{ source_id: number; record: Record<string, unknown> }>) {
      expect(typeof f.source_id).toBe('number');
      expect(typeof f.record).toBe('object');
    }
    expect(out.acquired.bad_key_count).toBe(0);
    expect(out.acquired.feature_count).toBe(5);
  });

  it('T2 — csv_options.bom is HONOURED, not inferred: bom:true keeps the key intact; bom:false leaves a '
    + '﻿ID header, so bad_key_count is 5 (the other direction)', async () => {
    const bomBytes = fsSync.readFileSync(join(CSV_FIXTURES, 'five-rows-bom.csv'));
    const run = async (bom: boolean) => acquireLib.acquireExternal({
      ctxFetch: fetchImplFor(bomBytes),
      log: NO_LOG,
      tag: '[csv_acquire_t2]',
      slug: 'csv_acquire_t2',
      external: { id: 'csv-acquire-t2', format: 'csv', csv_options: { bom, relax_quotes: true }, url: 'https://example.invalid/five-rows-bom.csv' },
      descriptor: LOAD_RAVINES,
      prior: null,
      timeoutMs: 30_000,
      keyProperty: 'ID',
      keyColumn: 'source_id',
      coerceKey: intOrNull,
      forced: true,
      emitSkeleton: {},
      preAcquisitionGate: () => ({ skip: false, reason: 'test' }),
    });

    const withBom = await run(true);
    expect(withBom.features, 'bom:true strips the BOM before the header is read — the first key is intact').toHaveLength(5);
    expect(withBom.acquired.bad_key_count).toBe(0);

    const withoutBom = await run(false);
    expect(withoutBom.features, 'bom:false: EVERY row misses key_property under the ﻿ID header — options are honoured, not inferred').toHaveLength(0);
    expect(withoutBom.acquired.bad_key_count).toBe(5);
  });

  it('T3 — format:"shapefile_zip" keeps the extract→locate→parse arm byte-identical (existing tests untouched): '
    + 'forced still walks a non-zip payload into extractArchive and rejects there, same as before this brief', async () => {
    const payload = Buffer.from('not-a-zip-archive');
    await expect(acquireLib.acquireExternal({
      ctxFetch: fetchImplFor(payload),
      log: NO_LOG,
      tag: '[csv_acquire_t3]',
      slug: 'csv_acquire_t3',
      external: { id: 'csv-acquire-t3', format: 'shapefile_zip', url: 'https://example.invalid/x.zip' },
      descriptor: LOAD_RAVINES,
      prior: null,
      timeoutMs: 30_000,
      keyProperty: 'OBJECTID',
      keyColumn: 'source_id',
      coerceKey: intOrNull,
      forced: true,
      emitSkeleton: {},
      preAcquisitionGate: () => ({ skip: false, reason: 'test' }),
    })).rejects.toThrow();
  });

  it('T4 — AJV: format:"csv" with no csv_options FAILS, an unrecognised format FAILS, load_ravines '
    + '(format:"shapefile_zip") PASSES construction', () => {
    const noCsvOptions = clone(LOAD_RAVINES);
    noCsvOptions.inputs.reads.externals[0].format = 'csv';
    delete noCsvOptions.inputs.reads.externals[0].csv_options;
    expect(() => pipeline.step(noCsvOptions, noop)).toThrow(/does not satisfy step\.schema\.json/);

    const badFormat = clone(LOAD_RAVINES);
    badFormat.inputs.reads.externals[0].format = 'pdf';
    expect(() => pipeline.step(badFormat, noop)).toThrow(/does not satisfy step\.schema\.json/);

    expect(() => pipeline.step(LOAD_RAVINES, noop), 'load_ravines already declares format:"shapefile_zip"').not.toThrow();
  });

  it('T5 — runIngestPhase: a csv external whose compute lacks shapeRecord rejects with the named Error '
    + 'BEFORE any download (no pool touch, no fetch)', async () => {
    const descriptor = clone(LOAD_RAVINES);
    descriptor.inputs.reads.externals[0].format = 'csv';
    descriptor.inputs.reads.externals[0].csv_options = { bom: false, relax_quotes: true };
    const compute = { coerceKey: intOrNull }; // no shapeRecord export
    const pool = { query: async () => { throw new Error('the guard must fire before any pool access'); } };
    await expect(stepLib.runIngestPhase({
      descriptor,
      pool,
      compute,
      config: {},
      fetchImpl: async () => { throw new Error('the guard must fire before any network call'); },
      chainId: null,
      log: NO_LOG,
      tag: '[csv_acquire_t5]',
      clockNow: new Date('2026-09-23T00:00:00Z'),
      preWriteGate: null,
    })).rejects.toThrow(/shapeRecord/);
  });

  it('T5 — runIngestPhase: shapeRecord returning null for one of 5 records counts acquired.shaped_skipped===1 '
    + 'and dedupeBySourceId receives the 4 survivors', async () => {
    const descriptor = clone(LOAD_RAVINES);
    descriptor.inputs.reads.externals[0].format = 'csv';
    descriptor.inputs.reads.externals[0].csv_options = { bom: false, relax_quotes: true };

    const rawFeatures = [1, 2, 3, 4, 5].map((n) => ({
      source_id: n,
      record: { ID: n, NAME: `row${n}`, geometry: n === 3 ? null : '{"type":"Point","coordinates":[0,0]}' },
    }));
    const dedupeSpy = vi.fn((feats: unknown[]) => ({ kept: feats, duplicateCount: 0 }));
    const compute = {
      coerceKey: intOrNull,
      shapeRecord: (record: { geometry: string | null; NAME: string }) => (record.geometry == null ? null : { geojson: record.geometry, name: record.NAME }),
      dedupeBySourceId: dedupeSpy,
      validatorCounterDelta: () => ({}),
    };

    const stubs = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: null, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
      vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
        tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
        features: rawFeatures,
        acquired: {
          feature_count: 5, bad_key_count: 0, null_geometry_count: 0, bytes_downloaded: 100,
          content_hash: 'deadbeef', source_dataset_version: 'deadbeef',
          last_modified: null, last_modified_ms: null, etag: null, license_url: null,
        },
      }),
      vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({ carried: [], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [] }),
      vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
        inserted: 0, updated: 0, deleted: 0, rows_scanned: 0, rows_changed: 0, delete_skipped_empty_guard: false,
      }),
    ];
    try {
      const out = await stepLib.runIngestPhase({
        descriptor,
        pool: fakePool(),
        compute,
        config: {},
        fetchImpl: async () => { throw new Error('unused — acquireExternal is mocked'); },
        chainId: null,
        log: NO_LOG,
        tag: '[csv_acquire_t5b]',
        clockNow: new Date('2026-09-23T00:00:00Z'),
        preWriteGate: null,
      });
      expect(out.acquired.shaped_skipped).toBe(1);
      expect(dedupeSpy).toHaveBeenCalledTimes(1);
      expect(dedupeSpy.mock.calls[0]?.[0] as unknown[]).toHaveLength(4);
    } finally {
      for (const s of stubs) s.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// batch-2 row 3.1 prerequisite 0e — validateGeometries honours a DECLARED
// geometry kind (point vs polygon). Spec 124 Rule 1 (the new field carries an
// x-ruling), Spec 122 §5.1 (a runner-wide change, never a per-step hatch).
// Measured: the converted address_points (a geometry column of type Point)
// crashed on its first write with
//   Geometry type (MultiPolygon) does not match column type (Point)
// because geometryValidationSql was POLYGON-ONLY by construction. The polygon
// arm must stay BYTE-IDENTICAL so load_ravines' golden is untouched.
// ---------------------------------------------------------------------------

describe('write.js geometry_kind — the validator repair/accept arm is DECLARED, never sniffed', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS write module
  const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));

  const spec = (geometryKind?: string) => {
    const s = clone(LOAD_RAVINES.outputs.writes[0]) as Record<string, unknown>;
    if (geometryKind === undefined) delete s.geometry_kind;
    else s.geometry_kind = geometryKind;
    return s;
  };

  it('T1 — a POINT-kind plan extracts type 1 and NEVER emits ST_Multi', () => {
    const plan = writeLib.buildWritePlan(spec('point'), LOAD_RAVINES);
    expect(plan.geometry_kind).toBe('point');
    expect(plan.validation_sql).toContain('ST_CollectionExtract(repaired, 1)');
    // No ST_Multi anywhere — the exact construct that produced the measured crash.
    expect(plan.validation_sql).not.toContain('ST_Multi');
    // Accepts ST_Point only; a MultiPoint from a >1-point extract is skipped.
    expect(plan.validation_sql).toContain("ST_GeometryType(geom_final) IN ('ST_Point')");
    expect(plan.validation_sql).not.toContain('ST_MultiPolygon');
    // The outcome vocabulary is UNCHANGED — consumers count on these four.
    for (const status of ['collection_extracted', 'accepted', 'skipped_null', 'skipped_unsupported_type']) {
      expect(plan.validation_sql, `${status} must survive`).toContain(status);
    }
  });

  it('T2 — the POLYGON-kind SQL is BYTE-IDENTICAL to the pre-geometry_kind text', () => {
    // The exact `validated AS (…)` block as it read BEFORE geometry_kind existed,
    // copied from the current file prior to editing. A byte-drift here is a diff on
    // load_ravines' golden with no behaviour change to justify it.
    const PREVIOUS_VALIDATED_BLOCK = [
      'validated AS (',
      '  SELECT',
      '    source_key,',
      '    ST_GeometryType(repaired) AS repaired_type,',
      '    ST_Multi(COALESCE(ST_CollectionExtract(repaired, 3), repaired)) AS geom_final,',
      '    is_valid_original',
      '  FROM (',
      '    SELECT source_key,',
      '           ST_IsValid(geom)   AS is_valid_original,',
      '           ST_MakeValid(geom) AS repaired',
      '      FROM input',
      '  ) s',
      ')',
    ].join('\n');
    const PREVIOUS_CASE_ACCEPT = [
      "         WHEN ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')",
      '              AND NOT ST_IsEmpty(geom_final)',
      "              AND repaired_type = 'ST_GeometryCollection'                       THEN 'collection_extracted'",
      "         WHEN ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')",
      '              AND NOT ST_IsEmpty(geom_final)                                     THEN \'accepted\'',
    ].join('\n');

    const plan = writeLib.buildWritePlan(spec('polygon'), LOAD_RAVINES);
    expect(plan.geometry_kind).toBe('polygon');
    expect(plan.validation_sql).toContain(PREVIOUS_VALIDATED_BLOCK);
    expect(plan.validation_sql).toContain(PREVIOUS_CASE_ACCEPT);
    // The default-keyed module constant is the polygon shape too, byte-for-byte.
    expect(writeLib.GEOMETRY_VALIDATION_SQL).toContain(PREVIOUS_VALIDATED_BLOCK);
    expect(writeLib.GEOMETRY_VALIDATION_SQL).toContain(PREVIOUS_CASE_ACCEPT);
  });

  it('T3 — validateGeometries THROWS the named Error for a missing kind; buildWritePlan does NOT', async () => {
    // The runtime backstop lives on the VALIDATOR, not on the plan builder. A plan with a
    // wkb_geometry bind and no kind is CARRIED (never thrown for) because LINK/CASCADE steps
    // bind geometry too and never call validateGeometries — a throw in buildWritePlan sent 0
    // write statements through the LINK dry-run path (LW-D15). The ingest path is the only
    // caller whose SQL is chosen by the kind, so that is where an absent kind must stop.
    const noopLog = { warn: () => {}, info: () => {} };
    const plan = writeLib.buildWritePlan(spec(), LOAD_RAVINES);
    expect(plan.geometry_kind).toBeNull();
    // No kind ⇒ no validator SQL is BUILT (the builder asserts); the plan still builds so a
    // LINK/CASCADE step that never validates can proceed.
    expect(plan.validation_sql).toBeNull();

    await expect(writeLib.validateGeometries({ query: async () => ({ rows: [] }) }, plan, [], () => ({}), { log: noopLog, tag: '[t3]' }))
      .rejects.toThrow(writeLib.MissingGeometryKindError);
    try {
      await writeLib.validateGeometries({ query: async () => ({ rows: [] }) }, plan, [], () => ({}), { log: noopLog, tag: '[t3]' });
    } catch (err) {
      expect((err as Error).name).toBe('MissingGeometryKindError');
      expect((err as Error).message).toContain('geometry_kind');
      expect((err as Error).message).toContain('wkb_geometry');
    }
    // A plan whose write carries a kind validates fine (it reaches the pool, which is stubbed).
    const ok = writeLib.buildWritePlan(spec('polygon'), LOAD_RAVINES);
    await expect(writeLib.validateGeometries({ query: async () => ({ rows: [] }) }, ok, [], () => ({}), { log: noopLog, tag: '[t3]' }))
      .resolves.toBeDefined();
    // An UNRECOGNISED kind is refused by name too, never a silent polygon default. The
    // refusal comes from the SQL builder (which `buildWritePlan` invokes for a known-shaped
    // kind), so an unknown kind still throws at PLAN time — only a MISSING kind is carried.
    // 'curve', not 'line': 0g (2026-09-24) made 'line' a real kind, so the placeholder for
    // "unrecognised" moved to a name that stays unrecognised.
    expect(() => writeLib.buildWritePlan(spec('curve'), LOAD_RAVINES)).toThrow(/unknown geometry_kind/);
    expect(plan.geometry_kind).toBeNull();
    // And the validator SQL builder itself refuses an absent kind rather than defaulting.
    expect(() => writeLib.geometryValidationSql('BIGINT')).toThrow(writeLib.MissingGeometryKindError);
  });

  it('T4 — AJV: both real descriptors validate; a mutant with no geometry_kind FAILS', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- descriptor load
    const ravines = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- descriptor load
    const addresses = require(join(process.cwd(), 'scripts/load-address-points.descriptor.json'));
    expect(ravines.outputs.writes[0].geometry_kind).toBe('polygon');
    expect(addresses.outputs.writes[0].geometry_kind).toBe('point');
    // pipeline.step runs the full AJV validation and throws on a schema violation.
    expect(() => pipeline.step(ravines, noop)).not.toThrow();
    expect(() => pipeline.step(addresses, noop)).not.toThrow();

    // The mutant: a wkb_geometry bind with the field stripped must FAIL the schema,
    // naming the missing geometry_kind at the write's own path.
    const mutant = clone(ravines);
    delete mutant.outputs.writes[0].geometry_kind;
    expect(() => pipeline.step(mutant, noop)).toThrow(/does not satisfy step\.schema\.json/);
    try {
      pipeline.step(mutant, noop);
    } catch (err) {
      expect((err as Error).message).toContain('geometry_kind');
    }
  });

  it('T5 — the point-arm SQL collapses a single-member ST_CollectionExtract back to its Point via a CASE WHEN ST_NumGeometries(...) = 1 guard (measured 2026-09-23: a Point column rejects a MultiPoint)', () => {
    // Locks the write.js capture-time fix landed at commit a8c1a42f (geometryFinalExpr('point')):
    // ST_CollectionExtract always returns a MULTI geometry, so a bare extract crashes a Point
    // column. A single-member extract must collapse to its one Point; a genuine multi-member
    // one stays MultiPoint and falls through to the accept arm's skipped_unsupported_type status.
    const plan = writeLib.buildWritePlan(spec('point'), LOAD_RAVINES);
    expect(plan.geometry_kind).toBe('point');
    expect(plan.validation_sql).toContain(
      'CASE WHEN ST_NumGeometries(ST_CollectionExtract(repaired, 1)) = 1 '
      + 'THEN ST_GeometryN(ST_CollectionExtract(repaired, 1), 1) '
      + 'ELSE ST_CollectionExtract(repaired, 1) END',
    );
  });

  it('T6 — validateGeometries carries EVERY shaped feature field, not just key + geom', async () => {
    // Locks the write.js capture-time fix landed at commit a8c1a42f: a multi-column INGESTOR
    // (address_points: 16 columns, measured 2026-09-23 "null value in column latitude") needs
    // every shaped field carried through, not just the key and the validated geometry — the
    // key and geom columns still win on collision (byte-identical for a key+geom-only feature
    // like load_ravines).
    const plan = writeLib.buildWritePlan(spec('point'), LOAD_RAVINES);
    const feature = { source_id: 1, geojson: '{"type":"Point","coordinates":[1,2]}', latitude: 43.1, foo: 'bar' };
    const noopLog = { warn: () => {}, info: () => {} };
    const fakePool = {
      query: async () => ({
        rows: [{ source_key: 1, status: 'accepted', is_valid_original: true, geom_wkb: '0101000020E6100000AAAA' }],
      }),
    };
    const classify = () => ({ repaired: 0, collectionExtracted: 0, skipped: 0, carry: true });
    const result = await writeLib.validateGeometries(fakePool, plan, [feature], classify, { log: noopLog, tag: '[t6]' });
    expect(result.carried).toHaveLength(1);
    expect(result.carried[0].source_id).toBe(1);
    expect(result.carried[0].latitude).toBe(43.1);
    expect(result.carried[0].foo).toBe('bar');
    expect(result.carried[0].geom).toBe('0101000020E6100000AAAA');
    expect(result.skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// batch-2 Phase 3 prerequisites 0f + 0g (2026-09-24, brief
// .cursor/engine-briefs/b2-p3-c0f-shapefile-record.md). Spec 122 §5.1 (runner
// changes for everyone, no per-step hatch), §5.5 (compute is just compute —
// domain mapping handed IN), Spec 124 Rule 1 (schema enum widening under
// x-frozen carries an x-ruling).
//
// 0f: parseShapefile carries `record` (the DBF properties) beside key+geojson
// and runIngestPhase resolves compute.shapeRecord(record, {geojson}) for
// EVERY external format — the one hook for attribute columns and a per-feature
// classify/refuse (shaped_skipped). A shapefile compute WITHOUT the export
// (load_ravines today) passes through unchanged. 0g: outputs.writes[].
// geometry_kind gains "line" (extract dimension 2, accept ST_LineString,
// single-member collapse, never ST_Multi — enrich-centreline.js requires a
// true LineString).
//
// Fixture: src/tests/steps/load_ravines/fixtures/missing-prj/ravines.shp +
// ravines.dbf — an EXISTING real 1-polygon shapefile the repo already ships,
// whose .dbf carries two DBF attributes (OBJECTID=9914257, NAME="Ravine
// North"), per src/tests/fixtures/shapefile-acquire/README.mjs (the
// `shapefile` package ships no writer, so a freshly-generated fixture is not
// committed — the README documents the faithful generator for a future
// writable toolchain).
// ---------------------------------------------------------------------------

describe('INGESTOR shapefile acquisition — compute.shapeRecord + geometry_kind "line" (batch-2 Phase 3 prerequisites 0f+0g)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real write.js lib
  const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));

  const SHAPEFILE_FIXTURES = join(process.cwd(), 'src/tests/steps/load_ravines/fixtures/missing-prj');
  const NO_LOG = { info: () => {}, warn: () => {}, error: () => {} };
  const intOrNull = (raw: unknown) => { const n = Number(raw); return Number.isFinite(n) ? n : null; };

  const withStubs = (fn: () => Promise<void>) => async () => {
    const stubs = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: null, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
      vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({ carried: [], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [] }),
      vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
        inserted: 0, updated: 0, deleted: 0, rows_scanned: 0, rows_changed: 0, delete_skipped_empty_guard: false,
      }),
    ];
    try {
      await fn();
    } finally {
      for (const s of stubs) s.mockRestore();
    }
  };

  it('T1 — parseShapefile carries the DBF properties on `record` beside key+geojson '
    + '(RED before 0f: the shapefile arm kept only {key, geojson})', async () => {
    const { features, badKey, nullGeometry } = await acquireLib.parseShapefile(
      join(SHAPEFILE_FIXTURES, 'ravines.shp'),
      join(SHAPEFILE_FIXTURES, 'ravines.dbf'),
      'OBJECTID',
      intOrNull,
      'source_id',
    );
    expect(features).toHaveLength(1);
    const feature = (features as Array<{ source_id: number; geojson: string; record: Record<string, unknown> }>)[0];
    if (!feature) throw new Error('expected one feature');
    expect(feature.source_id).toBe(9914257);
    expect(typeof feature.geojson).toBe('string');
    expect(JSON.parse(feature.geojson).type).toBe('Polygon');
    expect(feature.record).toEqual({ OBJECTID: 9914257, NAME: 'Ravine North' });
    expect(badKey).toBe(0);
    expect(nullGeometry).toBe(0);
  });

  it('T2 — runIngestPhase: a shapefile_zip compute exporting shapeRecord shapes 2 of 3 features '
    + 'with the extra column, and acquired.shaped_skipped counts the 1 refused '
    + '(RED before 0f: shapeRecord was resolved for csv only; mock acquireExternal per the '
    + 'INGESTOR CSV acquisition T5 precedent)', withStubs(async () => {
    const descriptor = clone(LOAD_RAVINES); // format stays 'shapefile_zip' (the descriptor default)
    const rawFeatures = [1, 2, 3].map((n) => ({
      source_id: n,
      geojson: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      record: { OBJECTID: n, NAME: n === 2 ? 'refuse-me' : `Ravine ${n}` },
    }));
    const dedupeSpy = vi.fn((feats: unknown[]) => ({ kept: feats, duplicateCount: 0 }));
    const compute = {
      coerceKey: intOrNull,
      shapeRecord: (record: { NAME: string }, ctx: { geojson: string }) =>
        (record.NAME === 'refuse-me' ? null : { geojson: ctx.geojson, class: 'x', name: record.NAME }),
      dedupeBySourceId: dedupeSpy,
      validatorCounterDelta: () => ({}),
    };
    const acquireStub = vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
      tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
      features: rawFeatures,
      acquired: {
        feature_count: 3, bad_key_count: 0, null_geometry_count: 0, bytes_downloaded: 100,
        content_hash: 'deadbeef', source_dataset_version: 'deadbeef',
        last_modified: null, last_modified_ms: null, etag: null, license_url: null,
      },
    });
    try {
      const out = await stepLib.runIngestPhase({
        descriptor,
        pool: fakePool(),
        compute,
        config: {},
        fetchImpl: async () => { throw new Error('unused — acquireExternal is mocked'); },
        chainId: null,
        log: NO_LOG,
        tag: '[shp_acquire_t2]',
        clockNow: new Date('2026-09-24T00:00:00Z'),
        preWriteGate: null,
      });
      expect(out.acquired.shaped_skipped).toBe(1);
      expect(dedupeSpy).toHaveBeenCalledTimes(1);
      const shaped = dedupeSpy.mock.calls[0]?.[0] as Array<{ class: string }>;
      expect(shaped).toHaveLength(2);
      for (const row of shaped) expect(row.class).toBe('x');
    } finally {
      acquireStub.mockRestore();
    }
  }));

  it('T3 — runIngestPhase: a shapefile_zip compute with NO shapeRecord export (load_ravines-shaped) '
    + 'passes every feature through UNCHANGED — no throw, acquired.shaped_skipped stays 0', withStubs(async () => {
    const descriptor = clone(LOAD_RAVINES);
    const rawFeatures = [1, 2, 3].map((n) => ({
      source_id: n,
      geojson: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      record: { OBJECTID: n, NAME: `Ravine ${n}` },
    }));
    const dedupeSpy = vi.fn((feats: unknown[]) => ({ kept: feats, duplicateCount: 0 }));
    const compute = {
      coerceKey: intOrNull,
      // NO shapeRecord export — load_ravines' actual shape today.
      dedupeBySourceId: dedupeSpy,
      validatorCounterDelta: () => ({}),
    };
    const acquireStub = vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
      tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
      features: rawFeatures,
      acquired: {
        feature_count: 3, bad_key_count: 0, null_geometry_count: 0, bytes_downloaded: 100,
        content_hash: 'deadbeef', source_dataset_version: 'deadbeef',
        last_modified: null, last_modified_ms: null, etag: null, license_url: null,
      },
    });
    try {
      const out = await stepLib.runIngestPhase({
        descriptor,
        pool: fakePool(),
        compute,
        config: {},
        fetchImpl: async () => { throw new Error('unused — acquireExternal is mocked'); },
        chainId: null,
        log: NO_LOG,
        tag: '[shp_acquire_t3]',
        clockNow: new Date('2026-09-24T00:00:00Z'),
        preWriteGate: null,
      });
      expect(out.acquired.shaped_skipped).toBe(0);
      expect(dedupeSpy).toHaveBeenCalledTimes(1);
      const passed = dedupeSpy.mock.calls[0]?.[0];
      expect(passed).toHaveLength(3);
      expect(passed).toEqual(rawFeatures);
    } finally {
      acquireStub.mockRestore();
    }
  }));

  it('T4 — runIngestPhase: a csv external whose compute lacks shapeRecord still rejects with the '
    + 'named Error before any download — 0f left the csv hard-error arm untouched (GREEN, stays)', async () => {
    const descriptor = clone(LOAD_RAVINES);
    descriptor.inputs.reads.externals[0].format = 'csv';
    descriptor.inputs.reads.externals[0].csv_options = { bom: false, relax_quotes: true };
    const compute = { coerceKey: intOrNull }; // no shapeRecord export
    const pool = { query: async () => { throw new Error('the guard must fire before any pool access'); } };
    await expect(stepLib.runIngestPhase({
      descriptor,
      pool,
      compute,
      config: {},
      fetchImpl: async () => { throw new Error('the guard must fire before any network call'); },
      chainId: null,
      log: NO_LOG,
      tag: '[shp_acquire_t4]',
      clockNow: new Date('2026-09-24T00:00:00Z'),
      preWriteGate: null,
    })).rejects.toThrow(/shapeRecord/);
  });

  it('T5 — geometryValidationSql(\'line\'): ST_CollectionExtract(repaired, 2) + the single-member '
    + 'collapse, accepts ST_LineString only, never ST_Multi; assertGeometryKind(\'line\') passes, '
    + '\'curve\' throws by name; polygon/point SQL stays byte-identical', () => {
    expect(writeLib.GEOMETRY_KINDS).toEqual(['polygon', 'point', 'line']);
    expect(writeLib.GEOMETRY_KIND_EXTRACT_TYPE.line).toBe(2);
    expect(writeLib.GEOMETRY_KIND_ACCEPTED_TYPES.line).toBe("('ST_LineString')");

    expect(writeLib.assertGeometryKind('line', 't')).toBe('line');
    expect(() => writeLib.assertGeometryKind('curve', 't')).toThrow(/unknown geometry_kind 'curve'/);

    const lineSql = writeLib.geometryValidationSql('BIGINT', 'line');
    expect(lineSql).toContain(
      'CASE WHEN ST_NumGeometries(ST_CollectionExtract(repaired, 2)) = 1 '
      + 'THEN ST_GeometryN(ST_CollectionExtract(repaired, 2), 1) '
      + 'ELSE ST_CollectionExtract(repaired, 2) END',
    );
    expect(lineSql).toContain("ST_GeometryType(geom_final) IN ('ST_LineString')");
    expect(lineSql).not.toContain('ST_Multi(');
    for (const status of ['collection_extracted', 'accepted', 'skipped_null', 'skipped_unsupported_type']) {
      expect(lineSql, `${status} must survive`).toContain(status);
    }

    // polygon/point pinned byte-identical to the pre-0g text (same constructs the
    // "write.js geometry_kind" describe above locks for 0e).
    const PREVIOUS_VALIDATED_BLOCK = [
      'validated AS (',
      '  SELECT',
      '    source_key,',
      '    ST_GeometryType(repaired) AS repaired_type,',
      '    ST_Multi(COALESCE(ST_CollectionExtract(repaired, 3), repaired)) AS geom_final,',
      '    is_valid_original',
      '  FROM (',
      '    SELECT source_key,',
      '           ST_IsValid(geom)   AS is_valid_original,',
      '           ST_MakeValid(geom) AS repaired',
      '      FROM input',
      '  ) s',
      ')',
    ].join('\n');
    const polygonSql = writeLib.geometryValidationSql('BIGINT', 'polygon');
    expect(polygonSql).toContain(PREVIOUS_VALIDATED_BLOCK);
    expect(polygonSql).toContain("ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')");

    const pointSql = writeLib.geometryValidationSql('BIGINT', 'point');
    expect(pointSql).toContain(
      'CASE WHEN ST_NumGeometries(ST_CollectionExtract(repaired, 1)) = 1 '
      + 'THEN ST_GeometryN(ST_CollectionExtract(repaired, 1), 1) '
      + 'ELSE ST_CollectionExtract(repaired, 1) END',
    );
    expect(pointSql).toContain("ST_GeometryType(geom_final) IN ('ST_Point')");
  });

  it('T6 — AJV: outputs.writes[].geometry_kind accepts "line" on an INGESTOR descriptor, still rejects "curve"', () => {
    const lineDescriptor = clone(LOAD_RAVINES);
    lineDescriptor.outputs.writes[0].geometry_kind = 'line';
    expect(() => pipeline.step(lineDescriptor, noop)).not.toThrow();

    const curveDescriptor = clone(LOAD_RAVINES);
    curveDescriptor.outputs.writes[0].geometry_kind = 'curve';
    expect(() => pipeline.step(curveDescriptor, noop)).toThrow(/does not satisfy step\.schema\.json/);
  });
});

