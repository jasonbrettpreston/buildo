// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4; registry-truth plan fold 10 item 1 (records_retired / records_unretired audit rows, mass-retire guard)
//
// FLEET-2 fold 10 — the RUNNER half of soft-retire, in the RED direction.
//
// `scripts/lib/step/write.js` already MEASURES a `departed_mark` plan's retirement
// (`retired`, `unretired`, `retire_candidates`, `retire_pct`,
// `retire_suppressed_mass_guard`, `retire_skipped_empty_guard`). What is missing, and
// what these locks demand, is the two-part WIRING:
//
//   RW1 — `runIngestPhase` must RESOLVE the plan's `retire_max_pct_from_config` out of
//         `config` (the resolved logic-variable values) and hand it to `executeWrite` as
//         `retireMaxPct`. A `departed_mark` plan that never receives its bound throws
//         fail-closed inside `executeWrite`; a plan with no `departed_mark` must not grow
//         the arg at all (byte-identical call shape).
//   RW2-RW6 — the library must carry a pure `retireAuditRows(phaseResults)` builder that
//         renders the measured retirement on the AUDIT TABLE: two INFO rows
//         (`records_retired` / `records_unretired`), a FAIL `mass_retire_guard` row when
//         the measured pct breached the declared bound (a MEASURED threshold breach, not
//         a refusal — so NO `errored` key), a WARN `retire_empty_set_guard` row when the
//         empty-set guard suppressed the mark, and target-suffixed metric names on the
//         multi-primary (`by_target`) shape.
//
// Today NONE of that wiring exists: `retireAuditRows` is not exported and `runIngestPhase`
// never passes `retireMaxPct`. So every lock below FAILS except the GREEN control in RW1.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const RAVINE_COMPUTE = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));
const LOAD_RAVINES = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */
const requireWriteLib = () => writeLib;
const clone =<T>(o: T): T => JSON.parse(JSON.stringify(o));
const NO_LOG = { info: () => {}, warn: () => {}, error: () => {} };

// ---------------------------------------------------------------------------
// The runner idiom, copied from `src/tests/step-library.logic.test.ts`'s
// 'the OTHER direction — a healthy load still reaches executeWrite through the same
// gate'. Only the pieces these locks need are reproduced here — this file must not
// import from that one.
// ---------------------------------------------------------------------------

type FakePoolOpts = { logicVars?: Record<string, unknown> };

function fakePool(opts: FakePoolOpts = {}) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const answer = (text: string) => {
    if (text.includes('current_database()')) {
      return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
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
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    return { rows: [] };
  };
  const record = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    return answer(text);
  };
  return { sql, params, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

const PRIOR_COUNT = 854;

/** The resolved logic-variable values, exactly as `runIngestPhase` would resolve them. */
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
    rows_parsed: featureCount,
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

/** The two Spec 59 pre_write checks must not gate the healthy-path locks; silence them. */
function gateFor(descriptor: Record<string, unknown>) {
  const config = seedConfig();
  return stepLib.makePreWriteGate({
    descriptor,
    chainId: null,
    stepCtx: {
      pool: null, chainId: null, runId: 1, descriptor,
      checks: (descriptor.checks as Array<{ id: string }>).map((c) => c.id),
      log: NO_LOG, clock: () => Date.parse('2026-08-26T00:00:00Z'),
      config, acquired: null, written: null, prior: null, overrides: null, gate: null, report: () => {},
    },
    compute: RAVINE_COMPUTE,
    config,
  });
}

/** A `load_ravines` clone whose write target carries the given extra keys. */
function ravineDescriptorWithWriteExtras(extras: Record<string, unknown>): Record<string, unknown> {
  const d = clone(LOAD_RAVINES) as Record<string, unknown>;
  const w = ((d.outputs as Record<string, unknown>).writes as Array<Record<string, unknown>>)[0]!;
  Object.assign(w, extras);
  return d;
}

/** Stand the healthy-load stubs, run `runIngestPhase`, and return the spied executeWrite. */
async function runHealthyIngest(descriptor: Record<string, unknown>, config: Record<string, number>) {
  const pool = fakePool({ logicVars: config });
  const write = requireWriteLib();
  const stubs = [
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: { ...prior, feature_count: 1 }, error: null }),
    vi.spyOn(write, 'assertWritePrivileges' as never).mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
    vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
      tier1: { skip: false },
      tier2: { skip: false },
      emitBlock: null,
      features: [{ source_id: 1, geojson: '{}' }],
      acquired: acquiredOf(1, 0),
    }),
    vi.spyOn(write, 'validateGeometries' as never).mockResolvedValue({
      carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
    }),
    vi.spyOn(write, 'executeWrite' as never).mockResolvedValue({
      inserted: 0, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 0, unchanged: 1, delete_skipped_empty_guard: false,
    }),
  ];
  try {
    const out = await stepLib.runIngestPhase({
      descriptor,
      pool,
      compute: RAVINE_COMPUTE,
      config,
      fetchImpl: async () => { throw new Error('unused'); },
      chainId: null,
      log: NO_LOG,
      tag: '[load_ravines]',
      clockNow: new Date('2026-08-26T00:00:00Z'),
      preWriteGate: gateFor(descriptor),
    });
    // The spy is returned BEFORE any restore: mockRestore clears mock.calls, and the
    // file-level afterEach(vi.restoreAllMocks) restores every stub after the assertions.
    return { out, executeWrite: stubs[4] as unknown as ReturnType<typeof vi.fn> };
  } catch (err) {
    for (const s of stubs) s.mockRestore();
    throw err;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FLEET-2 fold 10 RW1 — runIngestPhase resolves retireMaxPct from the declared config var', () => {
  it('RW1 RED — a departed_mark target declaring retire_max_pct_from_config hands executeWrite the RESOLVED config value', async () => {
    const config = seedConfig();
    const descriptor = ravineDescriptorWithWriteExtras({
      retract: 'departed_mark',
      retire_max_pct_from_config: 'load_ravines_mass_delete_fail_pct',
    });
    // buildWritePlan also requires the soft-retire column (written insert_only).
    const wCols = ((descriptor.outputs as Record<string, unknown>).writes as Array<Record<string, unknown>>)[0]!;
    (wCols.columns as Array<Record<string, unknown>>).push({ name: 'retired_at', vocabulary: 'none', written: 'insert_only' });
    // `buildWritePlan` admits `retract: "departed_mark"` only on the guarded_upsert
    // executor, so the clone's discipline has to name it to reach the wiring under test.
    const w0 = ((descriptor.outputs as Record<string, unknown>).writes as Array<Record<string, unknown>>)[0]!;
    ((w0.write_discipline as Record<string, unknown>).class) = 'guarded_upsert';
    const { executeWrite } = await runHealthyIngest(descriptor, config);

    expect(executeWrite, 'the healthy load must reach the write executor').toHaveBeenCalledTimes(1);
    const args = executeWrite.mock.calls[0]![1] as { retireMaxPct?: unknown };
    expect(args.retireMaxPct, 'the plan names the logic variable; the runner must resolve it')
      .toBe(config.load_ravines_mass_delete_fail_pct);
  });

  it('RW1 GREEN control — an unmodified load_ravines descriptor carries no retireMaxPct', async () => {
    const config = seedConfig();
    const { executeWrite } = await runHealthyIngest(clone(LOAD_RAVINES), config);

    expect(executeWrite).toHaveBeenCalledTimes(1);
    const args = executeWrite.mock.calls[0]![1] as { retireMaxPct?: unknown };
    expect(args.retireMaxPct == null, 'a target with no departed_mark must not resolve a bound').toBe(true);
  });
});

describe('FLEET-2 fold 10 RW2-RW6 — retireAuditRows renders the measured retirement on the audit table', () => {
  it('RW2 RED — a modest retirement yields exactly the two INFO rows, records_retired then records_unretired', () => {
    expect(typeof stepLib.retireAuditRows, 'the library must export the builder').toBe('function');
    const rows = stepLib.retireAuditRows([{
      written: {
        retired: 3, unretired: 2, retire_candidates: 3, retire_pct: 0.03,
        retire_suppressed_mass_guard: false, retire_skipped_empty_guard: false,
      },
    }]);
    expect(rows).toEqual([
      { metric: 'records_retired', value: 3, threshold: null, status: 'INFO' },
      { metric: 'records_unretired', value: 2, threshold: null, status: 'INFO' },
    ]);
  });

  it('RW3 RED — a suppressed mass-retire adds ONE FAIL gate row naming the breach, with NO errored key', () => {
    const rows = stepLib.retireAuditRows([{
      written: {
        retired: 0, unretired: 0, retire_candidates: 60, retire_pct: 0.6,
        retire_suppressed_mass_guard: true, retire_skipped_empty_guard: false,
        retire_max_pct: 0.5,
      },
    }]);
    expect(rows.slice(0, 2)).toEqual([
      { metric: 'records_retired', value: 0, threshold: null, status: 'INFO' },
      { metric: 'records_unretired', value: 0, threshold: null, status: 'INFO' },
    ]);
    const guard = rows.find((r: { metric: string }) => r.metric === 'mass_retire_guard');
    expect(guard, 'a measured breach must land a FAIL row').toBeTruthy();
    expect(guard.status).toBe('FAIL');
    expect(guard.source).toBe('gate');
    expect(String(guard.value)).toContain('0.6');
    expect(String(guard.value)).toContain('60');
    expect(guard.threshold).toBe('pct <= 0.5');
    expect(Object.prototype.hasOwnProperty.call(guard, 'errored'),
      'a MEASURED threshold breach is not a refusal — errored must be ABSENT').toBe(false);
  });

  it('RW4 RED — the empty-set guard suppression adds ONE WARN row', () => {
    const rows = stepLib.retireAuditRows([{
      written: {
        retired: 0, unretired: 0, retire_candidates: 0, retire_pct: 0,
        retire_suppressed_mass_guard: false, retire_skipped_empty_guard: true,
      },
    }]);
    expect(rows.slice(0, 2)).toEqual([
      { metric: 'records_retired', value: 0, threshold: null, status: 'INFO' },
      { metric: 'records_unretired', value: 0, threshold: null, status: 'INFO' },
    ]);
    const guard = rows.find((r: { metric: string }) => (
      r.metric === 'retire_empty_set_guard' || r.metric.startsWith('retire_empty_set_guard')
    ));
    expect(guard, 'the empty-set guard must say so').toBeTruthy();
    expect(guard.metric).toBe('retire_empty_set_guard');
    expect(guard.status).toBe('WARN');
    expect(guard.source).toBe('gate');
  });

  it('RW5 RED — a multi-primary by_target block yields target-suffixed metric names, and nothing for a target with no retirement', () => {
    const rows = stepLib.retireAuditRows([{
      written: {
        by_target: {
          a: {
            retired: 1, unretired: 0, retire_pct: 0, retire_candidates: 1,
            retire_suppressed_mass_guard: false, retire_skipped_empty_guard: false,
          },
          b: { inserted: 1 },
        },
      },
    }]);
    expect(rows).toEqual([
      { metric: 'records_retired:a', value: 1, threshold: null, status: 'INFO' },
      { metric: 'records_unretired:a', value: 0, threshold: null, status: 'INFO' },
    ]);
  });

  it('RW6 GREEN control (RED today only because the function is missing) — a step with no departed_mark gets NO new rows', () => {
    expect(typeof stepLib.retireAuditRows, 'the library must export the builder').toBe('function');
    expect(stepLib.retireAuditRows([{ written: { inserted: 1, updated: 0 } }])).toEqual([]);
    expect(stepLib.retireAuditRows([null])).toEqual([]);
  });
});
