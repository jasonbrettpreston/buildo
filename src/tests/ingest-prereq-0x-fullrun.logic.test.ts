// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A18 (0x; RE-FREEZE #29, logged in 122 §8)
//
// INGESTOR prerequisite 0x (part C) — THE FULL RUN, end to end, TWO targets.
//
// Parts A (the per-primary `target` binding), B (the runner's two-target write
// plan) and B2 (the two postures of the multi-target refusal) each lock ONE seam
// of the multi-target INGESTOR at a time: that an external can NAME the write
// target it feeds, that the runner validates those bindings by name before any
// network call, and that a mis-declared binding is refused rather than silently
// dropped. This file locks what NONE of them can: that the whole assembled
// thing — a REAL descriptor (a clone of the shipped `load_ravines`, so the
// INGESTOR profile, the write discipline and the checks are the real ones, not a
// hand-rolled approximation), TWO primaries bound to TWO tables, the real
// `step(...).run(...)` lifecycle and the runner's OWN ledger — reaches
// `complete` after writing BOTH targets, EACH in its OWN transaction, and
// finalizing its ledger row exactly once.
//
// T11 is deliberately the integrated claim, so it asserts exactly four things
// and no more:
//
//   (1) `out.status === 'completed'` — a two-primary load is a SUCCESS, not a
//       refusal: the whole point of 0x is that the runner stops refusing a
//       descent that declares two primaries;
//   (2) the statements land as TWO SEPARATE TRANSACTIONS, in the declared order:
//       the first `INSERT INTO ta` precedes a `COMMIT`, which precedes the next
//       `BEGIN`, which precedes the first `INSERT INTO tb`. This is the one
//       property no unit test of part A or B can observe — `executeWrite` opens
//       its own `pipeline.withTransaction`, so two targets written by one runner
//       are two `BEGIN`/`COMMIT` pairs, and a runner that folded them into ONE
//       transaction would satisfy every part A/B assertion while changing the
//       atomicity contract of the step;
//   (3) exactly ONE `sql` entry matches `/UPDATE pipeline_runs/` — `chainId:null`
//       is a STANDALONE run, so the runner OWNS the ledger row (ledger.js
//       `ownsLedgerRow = !chainId`) and finalizes it once. Two targets must not
//       grow a second finalize: the row is per-RUN, not per-target;
//   (4) `out.recordsMeta.k` equals `{from:'compute'}` — the compute's returned
//       `records_meta` is carried out on the SAME path, proving the run reached
//       the compute with `ctx.written` set (the fixture's compute returns the
//       keyed block ONLY when `ctx.written` is truthy).
//
// RED BEFORE 0x, and for the reason §4 T11 names: `step(H2(), compute)` is
// AJV-validated at CONSTRUCTION against step.schema.json, and
// `inputs.reads.externals.items` declares `additionalProperties: false`
// [READ scripts/steps/_schema/step.schema.json:1949] with no `target` property,
// so the two bound primaries fail with the `must NOT have additional properties
// {"additionalProperty":"target"}` error and the runner is never reached. The
// second, hidden refusal is still in place behind it: without the 0x runner,
// `runIngestPhase` throws "the INGESTOR archetype drives exactly ONE write
// target" for the two declared writes [READ scripts/lib/step/index.js:670].
// Either refusal alone reddens this test; the schema one fires first.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const LOAD_RAVINES = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
const ravineCompute = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

type FakePoolOpts = { logicVars?: Record<string, unknown> };

/**
 * The minimal fake pool the 0fs full-run test uses (:95-115), extended with ONE
 * answer: an `INSERT INTO ta` / `INSERT INTO tb` returns a row shaped
 * `{is_insert: true}` so `executeWrite`'s `result.rows.filter((r) => r.is_insert)`
 * counts one insert per target rather than reading an empty `rows[]` (which would
 * make both targets indistinguishable from a no-op upsert). The recorded
 * `sql[]` is the ledger observer for T11 — the pool IS the run's own statement
 * stream, so "two transactions" and "one finalize" are read off the statements a
 * production run would have issued rather than off a mock's call count.
 */
function fakePool(opts: FakePoolOpts = {}) {
  const sql: string[] = [];
  const answer = (text: string) => {
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(opts.logicVars ?? {}).map(([variable_key, variable_value]) => ({
          variable_key, variable_value, variable_value_json: null,
        })),
      };
    }
    if (text.includes('current_database()')) {
      return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    // The full run captures one DB timestamp (pipeline.getDbTimestamp: `SELECT NOW() AS now`).
    if (/SELECT NOW\(\) AS now/i.test(text)) return { rows: [{ now: new Date('2026-09-28T00:00:00Z') }] };
    // ONE row per target's guarded upsert, counted as an INSERT — the two-target
    // run's own write evidence (see the docblock above).
    if (/INSERT INTO t[ab]\b/.test(text)) return { rows: [{ is_insert: true }] };
    return { rows: [] };
  };
  const record = async (text: string) => { sql.push(text); return answer(text); };
  return { sql, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

/**
 * H2 — the descriptor under test: the TWO-PRIMARY INGESTOR 0x exists to make
 * representable. A clone of the REAL `load_ravines` descriptor, so the INGESTOR
 * profile (`execution.shape`), the `write_discipline`, the checks and the
 * terminals are the shipped ones, with the minimum set of changes that turns it
 * into a two-target descent:
 *
 *   · `inputs.reads.externals` — two primaries, `a` and `b`, the second's url
 *     perturbed (`?b`) so the pair is not byte-identical. Each CARRIES a
 *     `target`: the write table its features feed (`ta` / `tb`). This is the key
 *     the schema does not yet admit — the RED reason.
 *   · `outputs.writes` — the same write spec, TWICE, retabled `ta` / `tb`, so
 *     the two declared targets are the ones the two primaries name.
 *   · `emits` — one emit, key `k`, skeleton keyed `{a:{}, b:{}}` so the two
 *     targets' blocks are distinguishable.
 *   · `staleness.trigger` — the shipped pair, duplicated per primary: a
 *     `source_validator` pre-acquisition and a `content_hash` post-acquisition
 *     trigger FOR EACH of `a` and `b` (an unbound trigger would gate on the
 *     wrong source, or on none).
 *   · `guards.requires` emptied (the shipped ravines guards name tables/indexes
 *     an unrelated runner probe would refuse over), `invariants`/`plausibility`
 *     set to `"none"` so the run reaches the write phase with no unrelated
 *     post-run SQL on the fake pool.
 *
 * The `target` bindings are what 0x adds; everything else is the shipped
 * descriptor, deliberately, so this is an integration test and not a
 * construction test wearing a full-run test's name.
 */
function H2(): Record<string, unknown> {
  const d = clone(LOAD_RAVINES) as Record<string, unknown> & {
    inputs: { reads: { externals: Array<Record<string, unknown>> } };
    outputs: { writes: Array<Record<string, unknown>> };
    staleness: { trigger: Array<Record<string, unknown>> };
    emits: Array<Record<string, unknown>>;
    execution: Record<string, unknown>;
    guards: Record<string, unknown>;
  };
  const e0 = d.inputs.reads.externals[0]!;
  d.inputs.reads.externals = [
    { ...e0, id: 'a', target: 'ta' },
    { ...e0, id: 'b', url: String(e0.url) + '?b', target: 'tb' },
  ];
  const w0 = d.outputs.writes[0]!;
  d.outputs.writes = [{ ...w0, table: 'ta' }, { ...w0, table: 'tb' }];
  d.emits = [{ ...d.emits[0], key: 'k', skeleton: { a: {}, b: {} } }];
  d.execution.shape = 'ingest';
  d.staleness.trigger = ['a', 'b'].flatMap((x) => [
    { signal: 'source_validator', position: 'pre_acquisition', external: x },
    { signal: 'content_hash', position: 'post_acquisition', external: x },
  ]);
  d.guards.requires = [];
  d.invariants = 'none';
  d.plausibility = 'none';
  return d;
}

/**
 * The seeded tunables — every `config.logic_variables[].name` of THIS descriptor
 * at its default from the committed seed registry, so the hoisted config
 * resolution succeeds and the run reaches the write phase. Same helper shape as
 * 0fs's own `seededLogicVars`.
 */
function seededLogicVars(): Record<string, number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the committed seed registry
  const seed = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
  const out: Record<string, number> = {};
  for (const v of LOAD_RAVINES.config.logic_variables as Array<{ name: string }>) {
    out[v.name] = seed[v.name]!.default;
  }
  return out;
}

/**
 * The four seams T11 stubs so the run is a full-run test and not an acquisition
 * test: the prior-read (a fixed baseline for both targets), the RLS preflight
 * (both tables writable), the acquisition (one feature per primary, no
 * download) and the geometry validation (one carried row per target, no repair).
 * `executeWrite` is deliberately NOT stubbed — the REAL one issues the INSERTs
 * on the fake pool, which is the entire point of the two-transaction assertion.
 */
function stubs() {
  const spies = [
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({
      prior: { a: { feature_count: 1, content_hash: 'aa' }, b: { feature_count: 1, content_hash: 'aa' } },
      error: null,
    }),
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({
      ta: { rls_enabled: true, bypassrls: true, policies: 0 },
      tb: { rls_enabled: true, bypassrls: true, policies: 0 },
    }),
    vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
      tier1: { skip: false },
      tier2: { skip: false },
      emitBlock: null,
      features: [{ source_id: 1, geojson: '{}', record: {} }],
      acquired: {
        feature_count: 1,
        rows_parsed: 1,
        invalid_geometry_skipped: 0,
        invalid_geometry_repaired: 0,
        geometry_collection_extracted: 0,
        skipped_keys: [],
        content_hash: 'bb',
        source_dataset_version: 'bb',
        head_error: null,
      },
    }),
    vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
      carried: [{ source_id: 1, geom: Buffer.from('') }],
      repaired: 0,
      collectionExtracted: 0,
      skipped: 0,
      skippedKeys: [],
    }),
  ];
  return { spies };
}

/**
 * The compute: `load-ravines.js` with its declared-check dispatch preserved
 * (`{...ravineCompute}`), but the entry point replaced by a fixture that reports
 * EVERY selected check — an unreported check would leave the run `incomplete`
 * for the wrong reason, and T11 asserts `completed` — and returns the keyed
 * `records_meta` block ONLY when `ctx.written` is set, which is how the run's
 * write phase is made observable from the OUTSIDE (assertion (4)).
 */
const compute = Object.assign(async (ctx: { checks: string[]; report: (id: string, o: unknown) => void; written?: unknown }) => {
  for (const id of ctx.checks) ctx.report(id, { value: 0, inert: true });
  return ctx.written ? { records_meta: { k: { from: 'compute' } } } : { records_meta: {} };
}, { ...ravineCompute });

describe('INGESTOR prerequisite 0x — the full run: two primaries, two targets, two transactions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // T11 RED — the schema rejects `target`
  // (`/inputs/reads/externals/0: must NOT have additional properties`), and
  // behind it `runIngestPhase` still refuses "exactly ONE write target".
  //
  // The integrated claim, and the only 0x test that goes through
  // `step(...).run(...)`: one real descriptor, two primaries, real lifecycle.
  // `pool` is the run's OWN statement stream, so "two transactions" and "one
  // ledger finalize" are read off what a production run would have issued.
  // -------------------------------------------------------------------------
  it('T11 — a two-primary run completes: both targets written in their own transactions, one ledger finalize', async () => {
    const { spies } = stubs();
    expect(spies.length).toBe(4);
    const pool = fakePool({ logicVars: seededLogicVars() });
    const fetch = vi.fn(async () => { throw new Error('a stubbed acquisition must not reach the network — not even a HEAD'); });

    // RED today: this THROWS at construction on the unknown `target` key...
    // chainId null = standalone: the runner OWNS the ledger row (ledger.js ownsLedgerRow =
    // `!chainId`), so it opens and finalizes it. Under a chain id run-chain.js owns the row
    // and the runner issues no `UPDATE pipeline_runs` at all.
    const out = await stepLib.step(H2(), compute).run({ pool, chainId: null, fetch }) as {
      status: string;
      recordsMeta: Record<string, unknown>;
    };

    // ...so none of the four assertions below is reached until `target` is representable.
    expect(out.status, 'a two-primary INGESTOR is a success, not the runner\'s ONE-target refusal').toBe('completed');

    const firstInsertA = pool.sql.findIndex((s) => /INSERT INTO ta\b/i.test(s));
    const firstCommit = pool.sql.findIndex((s) => /^COMMIT$/i.test(s.trim()));
    const firstBeginAfterA = pool.sql.findIndex((s, i) => i > firstCommit && /^BEGIN$/i.test(s.trim()));
    const firstInsertB = pool.sql.findIndex((s) => /INSERT INTO tb\b/i.test(s));
    expect(firstInsertA, 'target a\'s INSERT is issued').toBeGreaterThanOrEqual(0);
    expect(firstCommit, 'target a\'s transaction COMMITs').toBeGreaterThan(firstInsertA);
    expect(firstBeginAfterA, 'target b opens its OWN transaction after a\'s COMMIT').toBeGreaterThan(firstCommit);
    expect(firstInsertB, 'target b\'s INSERT lands inside that second transaction').toBeGreaterThan(firstBeginAfterA);

    const finalizes = pool.sql.filter((s) => /UPDATE pipeline_runs/i.test(s));
    expect(finalizes.length, 'the runner-owned ledger row is finalized exactly ONCE, however many targets were written').toBe(1);

    expect(out.recordsMeta.k, 'the compute\'s returned records_meta rode out on the completed path (ctx.written was set)')
      .toEqual({ from: 'compute' });
  });
});
