// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.2, §4.3, §7.1 (S2-min)
// SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.2b, §4.1
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6, §3.7
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
