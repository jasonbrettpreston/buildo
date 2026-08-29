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
};

function fakePool(opts: FakePoolOpts = {}) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const answer = (text: string) => {
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
      expect(summary.records_meta.audit_table.verdict).toBe('PASS');
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
});
