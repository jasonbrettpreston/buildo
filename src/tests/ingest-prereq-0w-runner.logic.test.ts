// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A16 (0w; RE-FREEZE #27, logged in 122 §8)
//
// INGESTOR prerequisite 0w (part C1) — the RUNNER acquires lookups. Parts A/B taught
// the acquisition seam `role:"lookup"` + `format:"xlsx"` and the schema the two nested
// declarations. This file locks the runner half: `runIngestPhase` splits
// `inputs.reads.externals[]` into the ONE url-bearing PRIMARY (role absent or
// "primary") and every `role:"lookup"` side-source, acquires each lookup through the
// SAME seam (HEAD → download+hash → parse; never gated), calls
// `compute.buildLookup(l.id, rows, { config })` ONCE per lookup, hands the resulting
// MAP to `shapeRecord` as `ctx.lookups[id]`, and records the lookup's own acquisition
// block on `acquired.lookups[id]` (content_hash / bytes_downloaded / download_attempts
// / rows_parsed / head_error) plus `stats` from `buildLookup`.
//
// Before this file, `runIngestPhase` read `externals.find((e) => typeof e.url === 'string'
// && e.url.length > 0)` — a SILENT `.find`: a 2nd url-bearing external was declared and
// never fetched (the "declared, left empty, green verdict" class the `writes.length !== 1`
// guard already closes), and a lookup was never downloaded at all. The Fix (Fold CF-3):
// "exactly ONE url-bearing PRIMARY" is a RUNTIME refusal (never a schema maxItems, so 3.4
// `load_heritage` widens by lifting the throw + one binding field, zero enum churn).
//
// T-pin: a descriptor that declares NO lookup acquires exactly what it did before —
// one `acquireExternal` call, shapeRecord's ctx carrying its four historical keys
// (`config`, `geojson`, `run_at`, `tag`) and NOTHING else, and no `acquired.lookups`.
// All four converted INGESTORs declare exactly one url'd external and none has a `role`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const ravineCompute = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));
const LOAD_RAVINES = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
const LOAD_ADDRESS_POINTS = require(join(process.cwd(), 'scripts/load-address-points.descriptor.json'));
const LOAD_PARCELS = require(join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
const LOAD_CENTRELINE = require(join(process.cwd(), 'scripts/load-centreline.descriptor.json'));
const LOAD_MASSING = require(join(process.cwd(), 'scripts/load-massing.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/** The ravine external's id — every trigger in the descriptor is scoped to it. */
const PRIMARY_ID = LOAD_RAVINES.inputs.reads.externals[0].id;

/** The 0w lookup: an xlsx side-source, declared with a role and no key_property. */
const LOOKUP = {
  id: 'l', kind: 'http_file', url: 'http://ex/p.xlsx', format: 'xlsx', role: 'lookup', cache: 'none',
};

type FakePoolOpts = { logicVars?: Record<string, unknown> };

/**
 * The minimal fake pool the LR-D9 test in src/tests/step-library.logic.test.ts uses:
 * SQL text is recorded, logic_variables rows are answered, everything else is `{rows: []}`.
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
    return { rows: [] };
  };
  const record = async (text: string) => { sql.push(text); return answer(text); };
  return { sql, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

/** The resolved config the runner threads to compute — the seed defaults for ravine's vars. */
function seedConfig(): Record<string, number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the committed seed registry
  const seed = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
  const out: Record<string, number> = {};
  for (const v of LOAD_RAVINES.config.logic_variables as Array<{ name: string }>) out[v.name] = seed[v.name]!.default;
  return out;
}

const prior = { feature_count: 854, content_hash: 'aa', last_modified: 'Mon, 14 Mar 2022 15:25:09 GMT' };

/** The primary's acquisition block — every field the runner reads off `result.acquired`. */
function primaryAcquired() {
  return {
    feature_count: 1,
    rows_parsed: 1,
    invalid_geometry_skipped: 0,
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

/** The lookup's acquisition block: exactly the five fields the runner carries, plus stats. */
function lookupAcquired() {
  return {
    content_hash: 'h', bytes_downloaded: 9, download_attempts: 1, rows_parsed: 1, head_error: null,
  };
}

/**
 * The descriptor under test: load_ravines + the pushed lookup, with every
 * `staleness.trigger[].external` named so the trigger set is SCOPED (the runner
 * refuses an unscoped trigger alongside a declared lookup — part C2's lock).
 */
function descriptorWithLookup(): Record<string, unknown> {
  const d = clone(LOAD_RAVINES) as Record<string, unknown> & {
    inputs: { reads: { externals: Array<Record<string, unknown>> } };
    staleness: { trigger: Array<{ external?: string; position: string }> };
  };
  d.inputs.reads.externals.push(clone(LOOKUP));
  for (const t of d.staleness.trigger) t.external = PRIMARY_ID;
  return d;
}

/** runIngestPhase's compute: the real ravine module + the two 0w seams, both observed. */
function computeWithFns() {
  return {
    ...ravineCompute,
    shapeRecord: vi.fn((r: Record<string, unknown>, c: { geojson: string }) => ({ geojson: c.geojson })),
    buildLookup: vi.fn(() => ({ map: { 7: 'x' }, stats: { matched_rows: 2 } })),
  };
}

/** Every stub a `runIngestPhase` call needs, restored by the caller. */
function stubsFor() {
  return [
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior, error: null }),
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
    vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((async ({ external }: { external: Record<string, unknown> }) => {
      if (external.role === 'lookup') {
        return {
          tier1: { skip: false, reason: 'lookup_ungated' },
          tier2: { skip: false, reason: 'lookup_ungated' },
          features: [],
          rows: [{ a: 1 }],
          acquired: lookupAcquired(),
          emitBlock: null,
        };
      }
      return {
        tier1: { skip: false },
        tier2: { skip: false },
        emitBlock: null,
        // A shapefile arm carries a pre-stringified geojson and the DBF properties; the
        // declared key column is `source_id` (outputs.writes[0].key).
        features: [{ source_id: 1, geojson: '{}', record: {} }],
        acquired: primaryAcquired(),
      };
    }) as (...args: unknown[]) => unknown),
    vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
      carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
    }),
    vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
      inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, delete_skipped_empty_guard: false,
    }),
  ] as Array<{ mockRestore: () => void }>;
}

/** One runner call against the stubbed seams. `compute` defaults to the real ravine module. */
async function runPhase(descriptor: Record<string, unknown>, compute: Record<string, unknown> = ravineCompute as unknown as Record<string, unknown>, config = seedConfig()) {
  return stepLib.runIngestPhase({
    descriptor,
    pool: fakePool({ logicVars: config }),
    compute,
    config,
    fetchImpl: async () => { throw new Error('the runner must not reach the network in this test'); },
    chainId: null,
    log: noopLog,
    tag: '[ingest-0w-runner]',
    clockNow: new Date('2026-08-26T00:00:00Z'),
    preWriteGate: null,
  });
}

describe('INGESTOR prerequisite 0w — runner lookups', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  // -------------------------------------------------------------------------
  // T1 — a declared lookup IS acquired: acquireExternal runs twice (primary
  // FIRST), buildLookup is called ONCE with the lookup's id + parsed rows +
  // { config }, its map reaches shapeRecord's ctx as `lookups.l`, and the
  // result carries `acquired.lookups.l` = the five fields + stats.
  // RED before 0w: the 2nd external was never downloaded at all (the `.find`).
  // -------------------------------------------------------------------------
  it('T1 — acquires the lookup, calls buildLookup once, hands the map to shapeRecord and the block to acquired.lookups', async () => {
    const config = seedConfig();
    const compute = computeWithFns();
    restored = stubsFor();
    const out = await runPhase(descriptorWithLookup(), compute as unknown as Record<string, unknown>, config) as {
      acquired: { lookups: Record<string, Record<string, unknown>> };
    };

    const calls = (acquireLib.acquireExternal as unknown as { mock: { calls: Array<[{ external: { id: string } }]> } }).mock.calls;
    expect(calls, 'the primary AND the lookup are acquired — two externals, two fetches').toHaveLength(2);
    expect(calls[0]![0].external.id, 'the PRIMARY is acquired first — the lookup joins over it').toBe(PRIMARY_ID);
    expect(calls[1]![0].external.id).toBe('l');

    expect(compute.buildLookup).toHaveBeenCalledTimes(1);
    expect(compute.buildLookup).toHaveBeenCalledWith('l', [{ a: 1 }], { config });

    // The lookup's MAP is the ONLY thing shapeRecord sees — `{l: {7: 'x'}}`, not the
    // whole built object, and not keyed by anything else.
    const ctx = compute.shapeRecord.mock.calls[0]![1] as { lookups: unknown };
    expect(ctx.lookups).toEqual({ l: { 7: 'x' } });

    const block = out.acquired.lookups.l;
    expect(block).toEqual({ ...lookupAcquired(), stats: { matched_rows: 2 } });
  });

  // -------------------------------------------------------------------------
  // T2 — TWO url-bearing PRIMARIES is a named construction refusal, BEFORE any
  // fetch. Before 0w `.find` silently ignored the 2nd url'd external — the
  // declared-and-never-acquired class. Fold CF-3: a RUNTIME refusal only (no
  // schema maxItems), so 3.4 load_heritage lifts the throw instead of the enum.
  // RED before 0w: the call RESOLVES (the 2nd external is ignored).
  // -------------------------------------------------------------------------
  it('T2 — a 2nd url-bearing external with NO role rejects /exactly ONE/ and fetches nothing', async () => {
    const d = clone(LOAD_RAVINES) as { inputs: { reads: { externals: Array<Record<string, unknown>> } } };
    d.inputs.reads.externals.push({ id: 'l', kind: 'http_file', url: 'http://ex/p.csv', format: 'csv', cache: 'none' });
    const compute = computeWithFns();
    restored = stubsFor();

    await expect(runPhase(d as unknown as Record<string, unknown>, compute as unknown as Record<string, unknown>))
      .rejects.toThrow(/exactly ONE/);
    expect(acquireLib.acquireExternal, 'a mis-declared descriptor must cost no network').not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T5 (T-pin) — a descriptor with NO lookup is byte-identical: one
  // acquireExternal call, shapeRecord's ctx carrying EXACTLY its four
  // historical keys, and no `acquired.lookups` key at all. And the estate's
  // four converted INGESTORs all declare exactly one url'd external, none with
  // a `role` — the measured precondition for the T2 refusal above.
  // -------------------------------------------------------------------------
  it('T5 — a plain descriptor acquires once, shapeRecord ctx is the four historical keys, no acquired.lookups', async () => {
    const compute = computeWithFns();
    restored = stubsFor();
    const out = await runPhase(clone(LOAD_RAVINES) as unknown as Record<string, unknown>, compute as unknown as Record<string, unknown>) as {
      acquired: Record<string, unknown>;
    };

    expect(acquireLib.acquireExternal, 'no lookup declared — exactly one acquisition').toHaveBeenCalledTimes(1);
    expect(compute.buildLookup, 'buildLookup is a lookup-only seam').not.toHaveBeenCalled();
    expect(compute.shapeRecord).toHaveBeenCalledTimes(1);
    const ctx = compute.shapeRecord.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(ctx).sort(), 'byte-identical ctx — no `lookups` key unless one is declared')
      .toEqual(['config', 'geojson', 'run_at', 'tag']);
    expect(Object.prototype.hasOwnProperty.call(out.acquired, 'lookups'), 'the block is absent, not {}').toBe(false);
  });

  it('T5 — each converted INGESTOR declares exactly one url-bearing external and none carries a role', () => {
    for (const [name, descriptor] of [
      ['load-ravines', LOAD_RAVINES],
      ['load-address-points', LOAD_ADDRESS_POINTS],
      ['load-parcels', LOAD_PARCELS],
      ['load-centreline', LOAD_CENTRELINE],
      ['load-massing', LOAD_MASSING],
    ] as Array<[string, { inputs: { reads: { externals: Array<Record<string, unknown>> } } }]>) {
      const externals = descriptor.inputs.reads.externals;
      const urled = externals.filter((e) => typeof e.url === 'string' && (e.url as string).length > 0);
      expect(urled, `${name}: exactly one url'd external — the precondition for the T2 refusal`).toHaveLength(1);
      for (const e of externals) {
        expect(Object.prototype.hasOwnProperty.call(e, 'role'), `${name}: absent role === primary, byte-identical`).toBe(false);
      }
    }
  });

  // -------------------------------------------------------------------------
  // T6 — the PRIMARY's tier-1 gate SKIPPED: the run ends before the lookups are
  // reached, so no lookup is fetched and buildLookup is never called. The
  // lookup must NOT be acquired when nothing is going to be written.
  // -------------------------------------------------------------------------
  it('T6 — a primary tier-1 skip acquires once and never calls buildLookup', async () => {
    const compute = computeWithFns();
    restored = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
      vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
        tier1: { skip: true, reason: 'source_validator' },
        tier2: { skip: false, reason: 'not_reached' },
        features: [],
        emitBlock: null,
        acquired: { ...primaryAcquired(), content_hash: null },
      }),
    ];
    const out = await runPhase(descriptorWithLookup(), compute as unknown as Record<string, unknown>) as { skipped: boolean };

    expect(out.skipped).toBe(true);
    expect(acquireLib.acquireExternal, 'the lookup is not worth a download on a skip run').toHaveBeenCalledTimes(1);
    expect(compute.buildLookup, 'no lookup acquired === nothing to build').not.toHaveBeenCalled();
  });

  // =========================================================================
  // PART C2 — THE CONSTRUCTION REFUSALS (Fold CF-2 (i)/(ii), Fold CF-3).
  //
  // Every one of these fires in `runIngestPhase` BEFORE the first network call,
  // for the same reason the `writes.length !== 1` guard and the `csv`/`shapeRecord`
  // format check do: a mis-declared descriptor must cost no HEAD, no download and
  // no pool access. Each test therefore also asserts `acquireExternal` was NEVER
  // called — the refusal is construction, not a post-download discovery.
  // =========================================================================

  // -------------------------------------------------------------------------
  // T3 — a `staleness.trigger[]` entry that NAMES a lookup is refused by name
  // (refusal ii, the scoped half). A lookup has no staleness lifecycle of its
  // own (`acquire.js` short-circuits both tiers to `lookup_ungated` from the
  // `role` alone), so a trigger pointed at one would gate on a signal that can
  // never move — the skip semantics over two hashes are not designed.
  // RED before C2: the descriptor resolves and the lookup is downloaded.
  // -------------------------------------------------------------------------
  it('T3 — a post_acquisition trigger whose external names a lookup rejects /lookup/ and fetches nothing', async () => {
    const d = descriptorWithLookup();
    (d as { staleness: { trigger: Array<Record<string, unknown>> } }).staleness.trigger = [
      { signal: 'content_hash', position: 'post_acquisition', external: 'l' },
    ];
    const compute = computeWithFns();
    restored = stubsFor();

    await expect(runPhase(d, compute as unknown as Record<string, unknown>))
      .rejects.toThrow(/lookup/);
    expect(acquireLib.acquireExternal, 'a mis-declared descriptor must cost no network').not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T3 (the UNSCOPED half, refusal ii) — a trigger with its `external` DELETED
  // is an unscoped trigger, and an unscoped trigger alongside a declared lookup
  // is refused too: it would have to apply to SOME external, and the lookup is
  // the one it must never reach. RED before C2: the run proceeds.
  // -------------------------------------------------------------------------
  it('T3 — a trigger with no external (unscoped) alongside a lookup rejects /lookup/ and fetches nothing', async () => {
    const d = descriptorWithLookup();
    const triggers = (d as { staleness: { trigger: Array<Record<string, unknown>> } }).staleness.trigger;
    // Drop `external` from the FIRST trigger only — the other stays scoped to the
    // primary, so the refusal can only be coming from the now-unscoped one.
    delete triggers[0]!.external;
    const compute = computeWithFns();
    restored = stubsFor();

    await expect(runPhase(d, compute as unknown as Record<string, unknown>))
      .rejects.toThrow(/lookup/);
    expect(acquireLib.acquireExternal, 'a mis-declared descriptor must cost no network').not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T4 — a lookup declared with NO `compute.buildLookup` export is refused by
  // name (refusal iii), BEFORE the download: the runner would otherwise fetch
  // the workbook and only then discover it has no way to pivot it, which is the
  // "declared, left empty" class one more time. The throw names the export and
  // its contract. RED before C2: the download is attempted with the stub still
  // returning, so this resolves (no refusal).
  // -------------------------------------------------------------------------
  it('T4 — a lookup with no compute.buildLookup rejects /buildLookup/ and fetches nothing', async () => {
    const compute = computeWithFns();
    delete (compute as Record<string, unknown>).buildLookup;
    restored = stubsFor();

    await expect(runPhase(descriptorWithLookup(), compute as unknown as Record<string, unknown>))
      .rejects.toThrow(/buildLookup/);
    expect(acquireLib.acquireExternal, 'the refusal is construction — it must precede the HEAD').not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T4 — a lookup declaring `key_property` is refused (refusal iv; INERT, R-AJ):
  // an xlsx lookup is a side-source joined INSIDE `shapeRecord`, never a keyed
  // source of its own, so a key column on it is a declaration the runner cannot
  // honour. Refused rather than ignored. RED before C2: it resolves.
  // -------------------------------------------------------------------------
  it('T4 — a lookup declaring key_property rejects /key_property/ and fetches nothing', async () => {
    const d = descriptorWithLookup();
    ((d as { inputs: { reads: { externals: Array<Record<string, unknown>> } } }).inputs.reads.externals[1]!).key_property = 'X';
    const compute = computeWithFns();
    restored = stubsFor();

    await expect(runPhase(d, compute as unknown as Record<string, unknown>))
      .rejects.toThrow(/key_property/);
    expect(acquireLib.acquireExternal, 'an inert declaration is still refused before the network').not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T7 — `staleness.trigger: "none"` is the LEGAL spelling of "no triggers at
  // all" (address_points / parcels / neighbourhoods all declare it, and a step
  // with no skip path is exactly the case a lookup belongs to). It must NOT
  // trip refusal (ii): the refusal is about a trigger that could REACH a lookup,
  // and `"none"` is the string `Array.isArray` refuses to iterate. GREEN before
  // and after C2 by construction — this test is the fence that keeps the string
  // arm from being read as an empty-but-present trigger list.
  // -------------------------------------------------------------------------
  it('T7 — staleness.trigger "none" is not a refusal: the lookup is acquired normally', async () => {
    const d = descriptorWithLookup();
    (d as { staleness: Record<string, unknown> }).staleness.trigger = 'none';
    const compute = computeWithFns();
    restored = stubsFor();

    const out = await runPhase(d, compute as unknown as Record<string, unknown>) as {
      acquired: { lookups: Record<string, Record<string, unknown>> };
    };
    expect(compute.buildLookup, 'no triggers declared === nothing to refuse').toHaveBeenCalledTimes(1);
    expect(acquireLib.acquireExternal, 'the primary AND its lookup are still acquired').toHaveBeenCalledTimes(2);
    expect(out.acquired.lookups.l).toEqual({ ...lookupAcquired(), stats: { matched_rows: 2 } });
  });

  // T8 — refusal (ii) is scoped to the three ACQUISITION positions. A `pre_compute`
  // trigger (ledger/code/interval) is step-scoped and carries no `external` by design,
  // so an unscoped one beside a lookup stays legal.
  it('T8 — an unscoped pre_compute trigger alongside a lookup is NOT refused', async () => {
    const d = descriptorWithLookup();
    (d as { staleness: { trigger: Array<Record<string, unknown>> } }).staleness.trigger
      .push({ signal: 'code_version', position: 'pre_compute' });
    const compute = computeWithFns();
    restored = stubsFor();

    await runPhase(d, compute as unknown as Record<string, unknown>);
    expect(compute.buildLookup).toHaveBeenCalledTimes(1);
    expect(acquireLib.acquireExternal).toHaveBeenCalledTimes(2);
  });
});
