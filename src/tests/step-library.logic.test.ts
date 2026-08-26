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
import { describe, expect, it, vi } from 'vitest';
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
