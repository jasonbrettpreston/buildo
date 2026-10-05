// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3, §9, §11, §12
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 21)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §A.5 (lock 58)
//
// Batch-2 row 3.3 — `load_zoning`, INGESTOR: ten CKAN DataStore layers → ten targets, one txn per
// layer; commit form compressed (R-PACE-1) — ① assessment + this suite, ② descriptor + compute +
// notes + shell + seeds, ③ cutover.
// PART 1 (this peel) = the legacy ORACLE PINS L1–L29: plain `it(...)`, GREEN today. They EXECUTE the
// VERBATIM legacy text via `./fixtures/legacy-harness` (never source-text assertions), recording what
// the legacy script DOES so a future conversion can prove it reproduced the same observables
// (Spec 123 §4.5).
// PART 2 (later peel) = the CONVERTED claims D1–D11: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS
// (descriptor / compute / notes / shell) until ② lands them — flipped to plain `it(...)` at ② (2026-10-03).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, LAYER_KEYS, DEFAULT_VERSION, type LegacyOracle, type LegacyOpts, type CkanRecord } from './fixtures/legacy-harness';
import zoningRecords from './fixtures/zoning-records.json';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/load-zoning.descriptor.json';
const NOTES_REL = 'scripts/load-zoning.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-zoning.js';
const SHELL_REL = 'scripts/load-zoning.js';
const REPORT_REL = 'docs/reports/2026-10-02-batch2-p3-3-load-zoning-assessment.md';
/** Spec 47 §A.5 lock registry row 58 [READ scripts/load-zoning.js]. */
const LOCK_ID = 58;
/** The measured CKAN `metadata_modified` (package_show fallback) the harness defaults to. */
const V = DEFAULT_VERSION;
/** The frozen run timestamp (`pipeline.getDbTimestamp(pool)` return) the harness defaults to. */
const RUN_AT = new Date('2026-10-02T12:00:00Z');
/** The committed per-layer CKAN records, keyed by layer key. */
const FX = zoningRecords as unknown as Record<(typeof LAYER_KEYS)[number], CkanRecord[]> & Record<string, CkanRecord[] | undefined>;

/** One named §9 audit row (`records_meta.audit_table.rows[]`). */
interface AuditRow {
  metric: string;
  value: unknown;
  status: string;
  _no_baseline?: boolean;
}

/** `records_meta` as an open bag; `audit_table` is the block this suite reads. */
type RecordsMeta = Record<string, unknown> & {
  audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] };
};

/**
 * Run the legacy oracle to completion, catching a thrown error into `err` so a pin can assert the
 * failure lane instead of blowing up the test.
 */
async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy(opts);
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}

/** The `records_meta` of the LAST emitted summary payload. */
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[row 3.3] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}

/** The §9 named audit rows from `records_meta.audit_table.rows[]`. */
function rows(o: LegacyOracle): AuditRow[] {
  const table = meta(o).audit_table;
  if (table === undefined || !Array.isArray(table.rows)) {
    throw new Error('[row 3.3] records_meta.audit_table.rows[] missing from the emitted summary');
  }
  return table.rows;
}

/** Look up one named audit row by metric (last write wins). */
function row(o: LegacyOracle, metric: string): AuditRow {
  const hits = rows(o).filter((r) => r.metric === metric);
  const hit = hits[hits.length - 1];
  if (hit === undefined) {
    throw new Error(
      `[row 3.3] audit metric "${metric}" absent; emitted metrics were ${JSON.stringify(metrics(o))}`,
    );
  }
  return hit;
}

/** The emitted audit metric names, in row order (duplicates preserved). */
function metrics(o: LegacyOracle): string[] {
  return rows(o).map((r) => r.metric);
}

/** The row-derived verdict from `records_meta.audit_table.verdict`. */
function verdict(o: LegacyOracle): string {
  const v = meta(o).audit_table?.verdict;
  if (typeof v !== 'string') throw new Error('[row 3.3] records_meta.audit_table.verdict missing');
  return v;
}

/** The captured `datastore_search` http calls, optionally filtered to one layer. */
function ds(o: LegacyOracle, layer?: string): { url: string; timeout: unknown; kind: string; layer: string | null }[] {
  const datastore = o.httpCalls.filter((c) => c.kind === 'datastore_search');
  if (layer === undefined) return datastore;
  return datastore.filter((c) => c.layer === layer);
}

/**
 * Rebuild the parameter object of the upsert chunk whose FIRST bound param is `id`, from the SQL
 * `INSERT INTO <table> (col, col, ...)` shape and the flat `params` array walked in column strides.
 */
function paramsFor(o: LegacyOracle, table: string, id: unknown): Record<string, unknown> | null {
  const q = o.pool.queries.find((c) => new RegExp('^INSERT INTO ' + table + ' \\(([^)]*)\\)').test(c.sql));
  if (q === undefined) return null;
  const m = new RegExp('^INSERT INTO ' + table + ' \\(([^)]*)\\)').exec(q.sql)!;
  const cols = m[1]!.split(', ');
  const params = q.params;
  for (let i = 0; i + cols.length <= params.length; i += cols.length) {
    if (params[i] !== id) continue;
    return Object.fromEntries(cols.map((c, j) => [c, params[i + j]]));
  }
  return null;
}

/** The first captured pool.query() whose SQL matches `re`; throws when there is none. */
function sqlOf(o: LegacyOracle, re: RegExp): { sql: string; params: unknown[] } {
  const q = o.pool.queries.find((c) => re.test(c.sql));
  if (q === undefined) throw new Error(`[row 3.3] no pool.query() matched ${String(re)}`);
  return q;
}

/** Timing noise must never trip the legacy F-H14 duration WARN — pin every `_duration_ms` row to 1e9. */
function priorFrom(m: RecordsMeta): RecordsMeta {
  const clone = JSON.parse(JSON.stringify(m)) as RecordsMeta;
  for (const r of clone.audit_table?.rows ?? []) {
    if (r.metric.endsWith('_duration_ms')) r.value = 1e9;
  }
  return clone;
}

/** A happy-path run, reduced to the prior-run `records_meta` a second run can be handed. */
async function happyPrior(): Promise<RecordsMeta> {
  const { o } = await run();
  return priorFrom(meta(o));
}

/** Map every layer key to the same value (per-layer fixture/override bags). */
function layerMap<T>(v: T): Record<string, T> {
  return Object.fromEntries(LAYER_KEYS.map((k) => [k, v])) as Record<string, T>;
}

describe('row 3.3 — legacy oracle pins A (GREEN today)', () => {
  it('L1 — first run, happy path', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();

    // Summary: one emit, base-only counters derived from the base layer's upsert stream.
    expect(o.summaries.length).toBe(1);
    const s = o.summaries[0]!;
    expect(s).toMatchObject({ records_total: 4, records_new: 4, records_updated: 0 });

    // The frozen §9 records_meta contract: exactly these keys (no more, no fewer).
    const m = meta(o);
    expect(Object.keys(m).sort()).toEqual([
      'audit_table',
      'base_layer_committed_after_overlays_failed',
      'source_dataset_version',
      'zoning_layer_versions',
      'zoning_layers_loaded',
      'zoning_partial_load',
    ]);

    // Values: all ten layers loaded, no missing layers, base committed cleanly, one dataset version.
    expect(m.zoning_layers_loaded).toEqual(layerMap(true));
    expect(m.zoning_partial_load).toBe(false);
    expect(m.base_layer_committed_after_overlays_failed).toBe(false);
    expect(m.source_dataset_version).toBe(V);
    expect(m.zoning_layer_versions).toEqual(layerMap(V));

    // Audit table: phase = lock id, fixed name, WARN verdict (the height-label WARN row).
    expect(m.audit_table?.phase).toBe(58);
    expect(m.audit_table?.name).toBe('Toronto Zoning By-law ingest');
    expect(verdict(o)).toBe('WARN');
    // The only non-INFO row is the height-overlay unparseable-label WARN.
    const nonInfo = rows(o).filter((r) => r.status !== 'INFO');
    expect(nonInfo.map((r) => r.metric)).toEqual(['zoning_height_overlay_unparseable_label_count']);

    // HTTP: one package_show first, then one datastore_search per layer in LAYERS order.
    const A = o.helpers.CKAN_ACTION as string;
    const P = o.helpers.CKAN_PACKAGE_ID as string;
    const L = o.helpers.LAYERS as { key: string; resourceId: string }[];
    expect(o.httpCalls[0]).toMatchObject({
      kind: 'package_show',
      url: `${A}/package_show?id=${P}`,
    });
    const datastore = ds(o);
    expect(datastore.map((c) => c.layer)).toEqual([...LAYER_KEYS]);
    for (let i = 0; i < LAYER_KEYS.length; i++) {
      expect(datastore[i]!.url).toBe(
        `${A}/datastore_search?resource_id=${L[i]!.resourceId}&limit=10000&offset=0`,
      );
    }
    // No server-side sorting (the ordering contract is client-side); every request pins the timeout.
    expect(o.httpCalls.some((c) => c.url.includes('sort'))).toBe(false);
    for (const c of o.httpCalls) expect(c.timeout).toBe(30000);

    // One transaction per layer (10) and exactly the zoning advisory lock id.
    expect(o.txns()).toBe(10);
    expect(o.lockIds).toEqual([LOCK_ID]);

    // Meta: a single emitMeta triplet describing every read/write pair.
    expect(o.metas.length).toBe(1);
    const { reads, writes, externals } = o.metas[0]!;
    expect(Object.keys(reads).length).toBe(10);
    expect(Object.keys(writes).length).toBe(10);
    expect(reads['ckan:zoning-height-overlay']).toEqual(['_id', 'geometry', 'HT_STORIES', 'HT_STRING', 'HT_LABEL']);
    expect(writes.zoning_height_overlay).toEqual([
      'source_id',
      'ht_stories',
      'ht_string',
      'height_max_m',
      'geometry',
      'geom',
      'source_dataset_version',
    ]);
    expect(externals).toEqual(['CKAN']);

    // The §3.5 geometry-validation batch: LINESTRING layers use ST_IsSimple (L), others do not (P).
    const validation = o.pool.queries
      .filter((q) => /WITH ORDINALITY/.test(q.sql))
      .map((q) => (q.sql.includes('ST_IsSimple') ? 'L' : 'P'));
    expect(validation.join('')).toBe('PPPPPLPPLP');
  });

  it('L2 — D3 base fetch 503 aborts before any overlay; its FAIL rows are never emitted (LZ-D19)', async () => {
    const { o, err } = await run({ layerHttp: { base: { status: 503 } } });
    expect(err?.message).toBe('CKAN HTTP 503');
    // The abort happens before any overlay fetch: only the base datastore_search was attempted.
    expect(ds(o).map((c) => c.layer)).toEqual(['base']);
    // The throw unwinds past emitSummary/emitMeta and past the base txn.
    expect(o.summaries.length).toBe(0);
    expect(o.txns()).toBe(0);
    expect(o.metas.length).toBe(0);
  });

  it('L3 — D3 base non-throw failure (CodeRev H2)', async () => {
    // (a) Zero base rows → loadLayer returns ok=false and main() halts the chain.
    const a = await run({ records: { base: [] } });
    expect(a.err?.message).toContain('base layer load returned ok=false');
    expect(a.o.summaries.length).toBe(0);
    expect(ds(a.o).length).toBe(1);

    // (b) Required-column drift (drop ZN_ZONE) → loadLayer returns ok=false and main() halts.
    const b = await run({
      records: {
        base: FX.base.map((r) => {
          const c = { ...r };
          delete c.ZN_ZONE;
          return c;
        }),
      },
    });
    expect(b.err?.message).toContain('base layer load returned ok=false');
    expect(b.o.summaries.length).toBe(0);
    expect(ds(b.o).length).toBe(1);
  });

  it('L4 — an overlay fetch 503 gives WARN rows; the run continues; F-M3 sentinel', async () => {
    const { o, err } = await run({ layerHttp: { height_overlay: { status: 503 } } });
    expect(err).toBeNull();

    // The failed overlay is the only layer not loaded.
    const loaded = meta(o).zoning_layers_loaded as Record<string, boolean>;
    expect(loaded.height_overlay).toBe(false);
    for (const k of LAYER_KEYS) {
      if (k === 'height_overlay') continue;
      expect(loaded[k]).toBe(true);
    }

    // F-M3 sentinel: base committed, then an overlay failed → the pair is recordable.
    expect(meta(o).zoning_partial_load).toEqual({ missing_layers: ['height_overlay'] });
    expect(meta(o).base_layer_committed_after_overlays_failed).toBe(true);

    // The fetch-error + fetch-skipped WARN rows name the failed overlay.
    expect(row(o, 'height_overlay_fetch_error')).toMatchObject({ value: 'CKAN HTTP 503', status: 'WARN' });
    expect(row(o, 'height_overlay_fetch_skipped')).toMatchObject({ value: true, status: 'WARN' });

    // Nine layer txns (base + the eight surviving overlays); base-only counters still 4.
    expect(o.txns()).toBe(9);
    expect(o.summaries[0]!.records_total).toBe(4);
  });

  it('L5 — LZ-D12 (pinned wrong-form): the failed overlay\'s NEW version is recorded, so the next run skips it', async () => {
    // Run 1: the failed overlay still records its NEW (current) version against its key.
    const run1 = await run({ layerHttp: { height_overlay: { status: 503 } } });
    const versions1 = meta(run1.o).zoning_layer_versions as Record<string, string | null>;
    expect(versions1.height_overlay).toBe(V);

    // Run 2: fed run 1's meta, the unchanged-from-prior decision skips every layer (no fetches).
    const run2 = await run({ priorMeta: priorFrom(meta(run1.o)) });
    expect(run2.err).toBeNull();
    expect(ds(run2.o).length).toBe(0);

    // The skip run forwards the prior load state unchanged, partial-load included.
    const m2 = meta(run2.o);
    const loaded2 = m2.zoning_layers_loaded as Record<string, boolean>;
    expect(loaded2.height_overlay).toBe(false);
    expect(m2.zoning_partial_load).toEqual({ missing_layers: ['height_overlay'] });

    // A no-op refresh emits only the INFO bookkeeping rows (license, no-op, age).
    expect(metrics(run2.o)).toEqual([
      'dataset_source_license',
      'no_op_refresh',
      'dataset_version_age_days',
    ]);
  });
});

describe('row 3.3 — legacy oracle pins B (GREEN today)', () => {
  it('L6 — R2-12 all-layers skip re-emits the full §9 contract from the prior; counters null (LZ-D9); no emitMeta', async () => {
    const { o, err } = await run({ priorMeta: await happyPrior() });
    expect(err).toBeNull();

    // Every layer unchanged → no fetches at all (one package_show, zero datastore_search).
    expect(ds(o).length).toBe(0);
    expect(o.httpCalls.filter((c) => c.kind === 'package_show').length).toBe(1);

    // The skip summary carries null counters — not 0, not the prior counts.
    expect(o.summaries[0]).toMatchObject({
      records_total: null,
      records_new: null,
      records_updated: null,
    });

    // The frozen §9 contract is forwarded whole: same six keys, same load map/versions.
    const m = meta(o);
    expect(Object.keys(m).sort()).toEqual([
      'audit_table',
      'base_layer_committed_after_overlays_failed',
      'source_dataset_version',
      'zoning_layer_versions',
      'zoning_layers_loaded',
      'zoning_partial_load',
    ]);
    expect(m.zoning_layers_loaded).toEqual(layerMap(true));
    expect(m.zoning_layer_versions).toEqual(layerMap(V));

    // Only the INFO bookkeeping rows emitted — no per-layer audit rows.
    expect(metrics(o)).toEqual([
      'dataset_source_license',
      'no_op_refresh',
      'dataset_version_age_days',
    ]);

    // The age is computed from the STORED (current prod) version against the run timestamp.
    const age = row(o, 'dataset_version_age_days');
    expect(age.status).toBe('INFO');
    const expected = (o.helpers.ageDaysFrom as (n: number, v: string) => number | null)(
      Date.parse(String(RUN_AT)),
      V,
    );
    expect(age.value).toBe(expected);
    // Date.parse reads the TZ-less version as local time, so the exact day count is TZ-dependent.
    expect([223, 224]).toContain(age.value);

    // A skip run is read-only: no layer txns and no emitMeta triplet.
    expect(o.metas.length).toBe(0);
    expect(o.txns()).toBe(0);
  });

  it('L7 — R2-12 is all-or-nothing: one changed layer reloads all ten', async () => {
    const { o, err } = await run({
      priorMeta: await happyPrior(),
      versions: { queenstw_eat_overlay: '2026-09-01T00:00:00' },
    });
    expect(err).toBeNull();

    // A single changed layer defeats the EVERY-layer skip → all ten layers reload.
    expect(ds(o).length).toBe(10);

    // The changed layer records its NEW version; the base version is still the dataset version.
    const m = meta(o);
    const versions = m.zoning_layer_versions as Record<string, string | null>;
    expect(versions.queenstw_eat_overlay).toBe('2026-09-01T00:00:00');
    expect(m.source_dataset_version).toBe(V);

    // The prior carries zoning_areas_loaded_count 4 → a full 4-row reload is a PASS at 100%.
    expect(row(o, 'zoning_areas_loaded_pct')).toMatchObject({ value: 100, status: 'PASS' });
  });

  it('L8 — D9: the −1 sentinel and out-of-range values null the CELL, keep the row, and are counted', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();

    // Base record 2: FSI_TOTAL −1 and PRCNT_COMM −1 null the cells; the row still lands.
    expect(paramsFor(o, 'zoning_bylaw_areas', 2)).toMatchObject({
      fsi_max: null,
      pct_commercial_max: null,
      exception_number: 123,
      zn_zone: 'CR',
    });
    // Base record 3: COVERAGE 150 exceeds max 100 → cell nulled, row kept.
    expect(paramsFor(o, 'zoning_bylaw_areas', 3)).toMatchObject({ coverage_max_pct: null });

    // Counters: 3 nulled cells in base, 1 in the height overlay.
    expect(row(o, 'zoning_areas_out_of_range_nulled_count')).toMatchObject({ value: 3, status: 'INFO' });
    expect(row(o, 'height_overlay_out_of_range_nulled_count')).toMatchObject({ value: 1, status: 'INFO' });

    // Derived null-counts over the four loaded base rows.
    expect(row(o, 'coverage_max_pct_null_count')).toMatchObject({ value: 4 });
    expect(row(o, 'fsi_max_null_count')).toMatchObject({ value: 1 });
    expect(row(o, 'frontage_min_m_null_count')).toMatchObject({ value: 1 });

    expect(o.summaries[0]!.records_total).toBe(4);
  });

  it('L9 — TEXT maxLen truncation, blank → null, top-20 distribution, exceptions count', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();

    // Base 4: ZN_ZONE truncated to the declared maxLen of 20.
    expect(paramsFor(o, 'zoning_bylaw_areas', 4)).toMatchObject({
      zn_zone: 'ABCDEFGHIJKLMNOPQRST',
    });
    // Base 1: blank bylaw_exception_ref and blank COVERAGE both become null.
    expect(paramsFor(o, 'zoning_bylaw_areas', 1)).toMatchObject({
      bylaw_exception_ref: null,
      coverage_max_pct: null,
    });
    // Base 4: a null FRONTAGE stays null.
    expect(paramsFor(o, 'zoning_bylaw_areas', 4)).toMatchObject({ frontage_min_m: null });

    // Distribution: four distinct zones, each count 1, tie-broken by string locale order.
    expect(row(o, 'zoning_areas_distribution_top20')).toMatchObject({
      value: [
        { zone: 'ABCDEFGHIJKLMNOPQRST', count: 1 },
        { zone: 'CR', count: 1 },
        { zone: 'RD', count: 1 },
        { zone: 'RM', count: 1 },
      ],
      status: 'INFO',
    });

    // Records 2 and 3 carry a non-null exception_number.
    expect(row(o, 'zoning_areas_with_exceptions_count')).toMatchObject({ value: 2, status: 'INFO' });
  });

  it('L10 — R2-16 strict HT_LABEL parse (ranges and blanks never fabricate a height)', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();

    // Height 1: "12 m" parses to 12; HT_STORIES 4 and HT_STRING pass through.
    const h1 = paramsFor(o, 'zoning_height_overlay', 1);
    expect(h1).toMatchObject({ height_max_m: 12, ht_stories: 4, ht_string: 'HT 12' });
    // Height 2: the range label is unparseable → null; HT_STORIES −1 is out of range → null.
    const h2 = paramsFor(o, 'zoning_height_overlay', 2);
    expect(h2).toMatchObject({ height_max_m: null, ht_stories: null, ht_string: 'HT 10-12' });
    // Height 3: the blank label and blank HT_STRING are null; HT_STORIES 3 is kept.
    const h3 = paramsFor(o, 'zoning_height_overlay', 3);
    expect(h3).toMatchObject({ height_max_m: null, ht_stories: 3, ht_string: null });

    // Exactly one unparseable label across the layer → WARN.
    expect(row(o, 'zoning_height_overlay_unparseable_label_count')).toMatchObject({ value: 1, status: 'WARN' });
  });

  it('L11 — R2-17 reject-ALL duplicates: base FAIL row, overlay WARN; the run still completes', async () => {
    const { o, err } = await run({
      records: {
        base: FX.base.map((r) => (r._id === 4 ? { ...r, _id: 3 } : r)),
        lot_coverage_overlay: [FX.lot_coverage_overlay[0]!, { ...FX.lot_coverage_overlay[0]! }],
      },
    });
    expect(err).toBeNull();

    // Base keeps only source_ids 1 and 2 (both 3s rejected); the overlay keeps none.
    expect(o.summaries[0]!.records_total).toBe(2);

    // Base duplicates are a FAIL; overlay duplicates are a WARN.
    expect(row(o, 'zoning_areas_duplicate_source_id_count')).toMatchObject({ value: 2, status: 'FAIL' });
    expect(row(o, 'lot_coverage_overlay_duplicate_source_id_count')).toMatchObject({ value: 2, status: 'WARN' });

    // The emptied overlay skips its orphan delete and reports a 0 load (INFO, not FAIL).
    expect(row(o, 'lot_coverage_overlay_loaded_count')).toMatchObject({ value: 0, status: 'INFO' });
    expect(row(o, 'lot_coverage_overlay_orphan_delete_skipped')).toMatchObject({ value: true, status: 'INFO' });

    // The FAIL propagates to the verdict, but the overlay is still marked loaded.
    expect(verdict(o)).toBe('FAIL');
    const loaded = meta(o).zoning_layers_loaded as Record<string, boolean>;
    expect(loaded.lot_coverage_overlay).toBe(true);
  });

  it('L12 — F-M7/M4 INTEGER key: "1" binds the number 1; 0 and "abc" are rejected and counted', async () => {
    const r1 = FX.base[0]!;
    const r2 = FX.base[1]!;
    const r3 = FX.base[2]!;
    const r4 = FX.base[3]!;
    const { o, err } = await run({
      records: {
        base: [
          { ...r1, _id: '1' },
          { ...r2, _id: 0 },
          { ...r3, _id: 'abc' },
          r4,
        ],
      },
    });
    expect(err).toBeNull();

    // Only the coerced "1" and the integer 4 survive → two base rows.
    expect(o.summaries[0]!.records_total).toBe(2);
    expect(row(o, 'zoning_areas_non_integer_source_id_count')).toMatchObject({ value: 2, status: 'WARN' });

    // The numeric string binds as the NUMBER 1 (not the string "1").
    const p = paramsFor(o, 'zoning_bylaw_areas', 1);
    expect(p?.source_id).toBe(1);
    expect(typeof p?.source_id).toBe('number');
  });

  it('L13 — a null geometry is counted BEFORE key coercion', async () => {
    const r1 = FX.base[0]!;
    const r2 = FX.base[1]!;
    const r3 = FX.base[2]!;
    const r4 = FX.base[3]!;
    const { o, err } = await run({
      records: { base: [r1, r2, r3, { ...r4, _id: 'abc', geometry: null }] },
    });
    expect(err).toBeNull();

    // The null geometry is counted and the row dropped before the bad source_id is even considered.
    expect(row(o, 'zoning_areas_null_geometry_count')).toMatchObject({ value: 1, status: 'WARN' });
    expect(metrics(o)).not.toContain('zoning_areas_non_integer_source_id_count');
    expect(o.summaries[0]!.records_total).toBe(3);
  });
});

describe('row 3.3 — legacy oracle pins C (GREEN today)', () => {
  it('L14 — F-M9 line arm + the base invalid-band FAIL + repaired count + Multi-wrapped geom per family', async () => {
    const { o, err } = await run({
      validation: {
        [String(FX.policy_road_overlay[1]!.geometry)]: { simple_ok: false },
        [String(FX.base[0]!.geometry)]: { empty_after: true },
        [String(FX.base[1]!.geometry)]: { valid_before: false },
      },
    });
    expect(err).toBeNull();

    // Base: 4 kept, 1 discarded (empty_after) → 3 inserted; the discarded row is never bound.
    expect(o.summaries[0]!.records_total).toBe(3);
    expect(paramsFor(o, 'zoning_bylaw_areas', 1)).toBeNull();

    // The F-M9 LineString arm discards policy_road_overlay[1] → 1 of 2 → WARN (legacy's misnomer).
    expect(row(o, 'policy_road_overlay_invalid_polygon_count')).toMatchObject({ value: 1, status: 'WARN' });
    expect(row(o, 'policy_road_overlay_loaded_count')).toMatchObject({ value: 1, status: 'INFO' });

    // Base: 1 of 4 = 25 % > 0.5 % → FAIL; the MakeValid repair is counted but stays INFO.
    expect(row(o, 'zoning_areas_invalid_polygon_count')).toMatchObject({ value: 1, status: 'FAIL' });
    expect(row(o, 'zoning_areas_repaired_polygon_count')).toMatchObject({ value: 1, status: 'INFO' });
    expect(verdict(o)).toBe('FAIL');

    // Geom column: polygon layers extract type 3; the LineString overlay extracts type 2.
    const baseUpsert = sqlOf(o, /^INSERT INTO zoning_bylaw_areas/).sql;
    expect(baseUpsert).toMatch(
      /ST_Multi\(ST_CollectionExtract\(ST_MakeValid\(ST_GeomFromGeoJSON\(\$\d+\)\), 3\)\)/,
    );
    const roadUpsert = sqlOf(o, /^INSERT INTO zoning_policy_road_overlay/).sql;
    expect(roadUpsert).toMatch(
      /ST_Multi\(ST_CollectionExtract\(ST_MakeValid\(ST_GeomFromGeoJSON\(\$\d+\)\), 2\)\)/,
    );

    // The F-M9 simple/length guard is only on the LineString validation query.
    expect(sqlOf(o, /ST_IsSimple/).sql).toContain('(ST_Length(g.geom::geography) > 0 AND ST_IsSimple(g.geom))');
    // The FIRST WITH ORDINALITY query (the base polygon layer) carries no ST_IsSimple arm.
    const firstValidation = o.pool.queries.find((q) => /WITH ORDINALITY/.test(q.sql))!.sql;
    expect(firstValidation).not.toContain('ST_IsSimple');
  });

  it('L15 — H5 + LZ-D2: source_dataset_version is in SET but NOT in the guard', async () => {
    const { o, err } = await run();
    expect(err).toBeNull();

    const s = sqlOf(o, /^INSERT INTO zoning_bylaw_areas/).sql;
    expect(s).toContain('ON CONFLICT (source_id) DO UPDATE SET');
    expect(s).toContain('source_dataset_version = EXCLUDED.source_dataset_version');
    expect(s).toContain('zoning_bylaw_areas.geometry IS DISTINCT FROM EXCLUDED.geometry');
    expect(s).toContain('zoning_bylaw_areas.geom IS DISTINCT FROM EXCLUDED.geom');
    expect(s).not.toContain('source_dataset_version IS DISTINCT FROM');
    expect(s).toContain('RETURNING (xmax = 0) AS is_insert');

    // The change guard is the 23 base data columns + geometry + geom.
    const orClauses = s.split('WHERE ')[1]!.split('\n')[0]!.split(' OR ');
    expect(orClauses).toHaveLength(25);
  });

  it('L16 — LZ-D1 unchanged derived by subtraction; P-C1 counters are base-only', async () => {
    const { o, err } = await run({
      existing: { zoning_bylaw_areas: [1, 2, 3, 4], zoning_height_overlay: [1, 2, 3] },
      unchanged: { zoning_bylaw_areas: [1, 2] },
    });
    expect(err).toBeNull();

    // Base: 4 insertable, ids 1–2 unchanged → 0 inserted, 2 updated.
    const s = o.summaries[0]!;
    expect([s.records_total, s.records_new, s.records_updated]).toEqual([4, 0, 2]);

    // unchanged = loaded − inserted − updated (base), and the class counts are base-only.
    expect(row(o, 'zoning_areas_unchanged_skipped')).toMatchObject({ value: 2, status: 'INFO' });
    // The height overlay's 3 unchanged rows never reach records_updated → its own INFO row is 0.
    expect(row(o, 'height_overlay_unchanged_skipped')).toMatchObject({ value: 0, status: 'INFO' });
    expect(row(o, 'zoning_areas_orphans_removed_count')).toMatchObject({ value: 0, status: 'INFO' });
  });

  it('L17 — F-C1 empty guard; an EMPTY overlay counts as loaded; the F-H1 orphan band on the PRE-delete count', async () => {
    const { o, err } = await run({
      records: {
        policy_area_overlay: [{ ...FX.policy_area_overlay[0]!, geometry: null }],
        queenstw_eat_overlay: [],
      },
      existing: { zoning_bylaw_areas: [1, 2, 3, 4, 99], zoning_policy_area_overlay: [1, 7] },
    });
    expect(err).toBeNull();

    // Neither overlay can wipe its table: no DELETE runs for either.
    expect(o.pool.queries.some((q) => /^DELETE FROM zoning_policy_area_overlay/.test(q.sql))).toBe(false);
    expect(o.pool.queries.some((q) => /^DELETE FROM zoning_queenstw_eat_overlay/.test(q.sql))).toBe(false);

    // policy_area: the single record's null geometry empties it → skip + 0 loaded (INFO, not FAIL).
    expect(row(o, 'policy_area_overlay_orphan_delete_skipped')).toMatchObject({ value: true, status: 'INFO' });
    expect(row(o, 'policy_area_overlay_orphans_removed_count')).toMatchObject({ value: 0, status: 'INFO' });
    expect(row(o, 'policy_area_overlay_loaded_count')).toMatchObject({ value: 0, status: 'INFO' });

    // queenstw_eat: an EMPTY record set short-circuits but still counts as loaded.
    expect(row(o, 'queenstw_eat_overlay_loaded_count')).toMatchObject({ value: 0, status: 'INFO' });
    expect(row(o, 'queenstw_eat_overlay_orphan_delete_skipped')).toMatchObject({ value: true, status: 'INFO' });
    const loaded = meta(o).zoning_layers_loaded as Record<string, boolean>;
    expect(loaded.queenstw_eat_overlay).toBe(true);

    // The empty layer opens no transaction: base + the eight non-empty overlays.
    expect(o.txns()).toBe(9);

    // F-H1 uses the PRE-delete count: id 99 orphaned out of 5 = 20 % > 2 % → FAIL.
    expect(row(o, 'zoning_areas_orphans_removed_count')).toMatchObject({ value: 1, status: 'FAIL' });
    expect(verdict(o)).toBe('FAIL');
  });
});

describe('row 3.3 — legacy oracle pins C2 (GREEN today)', () => {
  it('L18 — LZ-D3: attribute drift reads records[0] only', async () => {
    // (a) Base: record 1 gains an extra field; record 2 loses GEN_ZONE.
    const b1 = { ...FX.base[0]!, NEW_FIELD: 1 };
    const b2 = { ...FX.base[1]! };
    delete b2.GEN_ZONE;
    const a = await run({
      records: { base: [b1, b2, FX.base[2]!, FX.base[3]!] },
    });
    expect(a.err).toBeNull();

    // Drift is judged from records[0] ONLY: the extra field is seen, the later missing one is not.
    expect(row(a.o, 'zoning_areas_attr_drift')).toMatchObject({
      value: { missing: [], extra: ['NEW_FIELD'] },
      status: 'WARN',
    });
    expect(a.o.summaries[0]!.records_total).toBe(4);

    // Record 2's missing GEN_ZONE silently nulls the cell even though drift stayed silent.
    expect(paramsFor(a.o, 'zoning_bylaw_areas', 2)?.gen_zone).toBeNull();

    // (b) policy_road_overlay: every record loses ROAD_NAME → missing drift → layer fails.
    const b = await run({
      records: {
        policy_road_overlay: FX.policy_road_overlay.map((r) => {
          const c = { ...r };
          delete c.ROAD_NAME;
          return c;
        }),
      },
    });
    expect(b.err).toBeNull();

    expect(row(b.o, 'policy_road_overlay_attr_drift')).toMatchObject({
      value: { missing: ['ROAD_NAME'], extra: [] },
      status: 'WARN',
    });
    const loaded = meta(b.o).zoning_layers_loaded as Record<string, boolean>;
    expect(loaded.policy_road_overlay).toBe(false);
    expect(meta(b.o).zoning_partial_load).toEqual({ missing_layers: ['policy_road_overlay'] });
    expect(meta(b.o).base_layer_committed_after_overlays_failed).toBe(true);
    expect(b.o.txns()).toBe(9);
  });

  it('L19 — LZ-D4 offset pagination with no sort; LZ-D18 validation in 1,000-row batches', async () => {
    const { o, err } = await run({
      records: {
        policy_road_overlay: Array.from({ length: 10001 }, (_, i) => ({
          _id: i + 1,
          ROAD_NAME: 'R' + (i + 1),
          geometry: FX.policy_road_overlay[0]!.geometry,
        })),
      },
    });
    expect(err).toBeNull();

    // Two offset pages: 10 000 then the 1-row tail; the client-side ordering contract means no sort.
    const road = ds(o, 'policy_road_overlay');
    expect(road.length).toBe(2);
    expect(road[0]!.url.endsWith('&limit=10000&offset=0')).toBe(true);
    expect(road[1]!.url.endsWith('&limit=10000&offset=10000')).toBe(true);
    expect(o.httpCalls.some((c) => c.url.includes('sort'))).toBe(false);

    // LZ-D18: the geometry-validation query is chunked at 1 000 rows — 10 full + a 1-row tail per
    // LineString layer (policy_road_overlay ×11), then priority_retail's 2 rows (2 × 1).
    const batches = o.pool.queries
      .filter((q) => q.sql.includes('ST_IsSimple'))
      .map((q) => (q.params[0] as unknown[]).length);
    expect(batches).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1, 1]);

    // All 10 001 rows load.
    expect(row(o, 'policy_road_overlay_loaded_count').value).toBe(10001);
  });

  it('L20 — lock contention: the SDK skips; nothing is fetched or emitted', async () => {
    const { o, err } = await run({ lockAcquired: false });
    expect(err).toBeNull();

    // The lock was attempted (id 58) but never acquired → main() is a no-op.
    expect(o.lockIds).toEqual([LOCK_ID]);
    expect(o.summaries.length).toBe(0);
    expect(o.metas.length).toBe(0);
    expect(o.httpCalls.length).toBe(0);
  });

  it('L21 — LZ-D20: a prior-read failure silently degrades to a first run', async () => {
    const { o, err } = await run({ priorError: true });
    expect(err).toBeNull();

    // The failure is logged at WARN with the exact operator-facing message, then swallowed.
    const warn = o.logs.find(
      (l) => l.level === 'warn' && l.args.join(' ') === '[load-zoning] prior-run query failed (treating as no baseline): prior read boom',
    );
    expect(warn).toBeDefined();

    // No baseline → a full first-run fetch of all ten layers.
    expect(ds(o).length).toBe(10);

    // With no baseline the loaded-% row is INFO/null and flagged `_no_baseline` (not FAIL).
    expect(row(o, 'zoning_areas_loaded_pct')).toMatchObject({
      value: null,
      status: 'INFO',
      _no_baseline: true,
    });
  });
});

describe('row 3.3 — legacy oracle pins D (GREEN today)', () => {
  it('L22 — the ① force seam (plan O2): with ZONING_FORCE_RELOAD=1 every layer loads past an all-unchanged prior', async () => {
    // A full happy-path prior run, then force-reload: the every-layer skip is defeated by the env.
    const forced = await run({ priorMeta: await happyPrior(), env: { ZONING_FORCE_RELOAD: '1' } });
    expect(forced.err).toBeNull();

    // All ten layers re-fetch despite an unchanged prior.
    expect(ds(forced.o).length).toBe(10);

    // The presence row is emitted (WARN) and is the ONLY row appended by the seam.
    expect(row(forced.o, 'zoning_override_force_reload_present')).toMatchObject({
      value: true,
      status: 'WARN',
    });
    expect(metrics(forced.o)[1]).toBe('zoning_override_force_reload_present');

    // The harness restores process.env after the run: the flag never leaks out.
    expect(process.env.ZONING_FORCE_RELOAD).toBeUndefined();

    // Unset (same prior): the skip decision stands, so nothing is fetched and no row is emitted.
    const unset = await run({ priorMeta: await happyPrior() });
    expect(unset.err).toBeNull();
    expect(ds(unset.o).length).toBe(0);
    expect(metrics(unset.o)).not.toContain('zoning_override_force_reload_present');

    // The seam itself: only a skippable decision flips; a load decision is passed through byte-equal.
    const apply = forced.o.helpers.applyForceReload as (d: unknown, f: boolean) => unknown;
    expect(apply({ skip: true, reason: 'unchanged' }, true)).toEqual({ skip: false, reason: 'forced' });
  });

  it('L23 — network posture: redirect cap 5 (LZ-D14), 30 s socket-idle timeout (LZ-D15), the success:false text', async () => {
    const h = await run();
    // The frozen transport constants the converted descriptor must reproduce.
    expect(h.o.helpers.MAX_REDIRECTS).toBe(5);
    expect(h.o.helpers.HTTP_TIMEOUT_MS).toBe(30000);
    expect(h.o.helpers.DATASTORE_PAGE).toBe(10000);
    expect(h.o.helpers.BATCH_SIZE).toBe(1000);

    // (a) Exactly at the cap: five hops are followed, then the sixth URL serves the body.
    const a = await run({ layerHttp: { base: { redirects: 5 } } });
    expect(a.err).toBeNull();
    expect(ds(a.o, 'base').length).toBe(6);
    expect(a.o.summaries.length).toBe(1);

    // (b) One hop past the cap: the redirect is rejected with the exact operator-facing text.
    const b = await run({ layerHttp: { base: { redirects: 6 } } });
    expect(b.err?.message).toBe('CKAN: too many redirects');
    expect(ds(b.o, 'base').length).toBe(6);

    // (c) A socket-idle timeout on an overlay: the request aborts with the exact message (WARN).
    const c = await run({ layerHttp: { lot_coverage_overlay: { timeout: true } } });
    expect(c.err).toBeNull();
    expect(row(c.o, 'lot_coverage_overlay_fetch_error')).toMatchObject({
      value: 'CKAN request timed out',
      status: 'WARN',
    });

    // (d) A datastore_search that returns success:false names the offending resource id (WARN).
    const d = await run({ layerHttp: { lot_coverage_overlay: { success: false } } });
    expect(d.err).toBeNull();
    expect(row(d.o, 'lot_coverage_overlay_fetch_error')).toMatchObject({
      value: 'CKAN datastore_search: success=false (resource 58ad8814-ca4e-43d6-848d-d5fd8d873574)',
      status: 'WARN',
    });
  });

  it('L24 — LZ-D6 (pinned wrong-form): a failed package_show logs INFO "proceed"; every layer binds String(runAt)', async () => {
    const { o, err } = await run({ packageShow: { status: 500 } });
    expect(err).toBeNull();

    // The 500 is swallowed into a skip_check_error row and the run proceeds without versions.
    expect(row(o, 'skip_check_error')).toMatchObject({ value: 'CKAN HTTP 500', status: 'INFO' });

    // With no resource versions, every layer's dataset version falls back to String(runAt).
    // (PostgreSQL rejects that string as TIMESTAMPTZ, so the base upsert would throw there; the
    //  fake pool does not type-check, so the run completes here.)
    expect(paramsFor(o, 'zoning_bylaw_areas', 1)?.source_dataset_version).toBe(String(RUN_AT));
    expect(paramsFor(o, 'zoning_height_overlay', 1)?.source_dataset_version).toBe(String(RUN_AT));

    // The meta records the same fallback: base version + a per-layer version map of all-null.
    expect(meta(o).source_dataset_version).toBe(String(RUN_AT));
    expect(meta(o).zoning_layer_versions).toEqual(layerMap(null));
    expect(row(o, 'dataset_version_age_days')).toMatchObject({ value: 0, status: 'INFO' });
    expect(ds(o).length).toBe(10);

    // A success:false package_show takes the other throw path but is logged identically.
    const s = await run({ packageShow: { success: false } });
    expect(row(s.o, 'skip_check_error')).toMatchObject({
      value: 'CKAN package_show: success=false',
      status: 'INFO',
    });
  });

  it('L25 — a resource package_show omits gets String(runAt) and records null', async () => {
    const { o, err } = await run({ packageShow: { omit: ['height_overlay'] } });
    expect(err).toBeNull();

    // The omitted overlay has no last_modified → its upsert binds String(runAt)…
    expect(paramsFor(o, 'zoning_height_overlay', 1)?.source_dataset_version).toBe(String(RUN_AT));

    // …and its per-layer version is recorded as null, while the listed base keeps the real version.
    const versions = meta(o).zoning_layer_versions as Record<string, string | null>;
    expect(versions.height_overlay).toBeNull();
    expect(versions.base).toBe(V);
  });
});

describe('row 3.3 — legacy oracle pins D2 (GREEN today)', () => {
  it('L26 — LZ-D7 (pinned): baselines read the latest prior\u2019s rows, so after a skip run they are vacuous', async () => {
    // A prior whose ONLY rows are the three skip-run bookkeeping rows: it carries no
    // `zoning_areas_loaded_count` / `zoning_areas_with_exceptions_count` baseline at all.
    // Typed as an open bag (not the narrow RecordsMeta) so the §9 audit_table may carry its
    // phase/name header fields; `run(...)` accepts any `Record<string, unknown>` prior meta.
    const skipPrior: Record<string, unknown> & { audit_table: { phase: number; name: string; verdict: string; rows: AuditRow[] } } = {
      ...(await happyPrior()),
      audit_table: {
        phase: 58,
        name: 'Toronto Zoning By-law ingest',
        verdict: 'PASS',
        rows: [
          { metric: 'dataset_source_license', value: 'x', status: 'INFO' },
          { metric: 'no_op_refresh', value: true, status: 'INFO' },
          { metric: 'dataset_version_age_days', value: 221, status: 'INFO' },
        ],
      },
    };

    // (a) A changed base version forces a load (the every-layer skip is defeated).
    const a = await run({ priorMeta: skipPrior, versions: { base: '2026-09-01T00:00:00' } });
    expect(a.err).toBeNull();

    // The F-H11 baseline lookup finds no `zoning_areas_loaded_count` row → null → vacuous.
    expect(row(a.o, 'zoning_areas_loaded_pct')).toMatchObject({
      value: null,
      status: 'INFO',
      _no_baseline: true,
    });
    // F-H13 likewise reads no prior → INFO, but the live count (EXCPTN_NO 123 and 5) is 2.
    expect(row(a.o, 'zoning_areas_with_exceptions_count')).toMatchObject({ value: 2, status: 'INFO' });

    // (b) The SAME rows plus a stale baseline of 100 → 4 loaded / 100 = 4 % → FAIL, verdict FAIL.
    const withBaseline: RecordsMeta = {
      ...skipPrior,
      audit_table: {
        ...skipPrior.audit_table,
        rows: [...skipPrior.audit_table!.rows!, { metric: 'zoning_areas_loaded_count', value: 100, status: 'INFO' }],
      },
    };
    const b = await run({ priorMeta: withBaseline, versions: { base: '2026-09-01T00:00:00' } });
    expect(b.err).toBeNull();
    expect(row(b.o, 'zoning_areas_loaded_pct')).toMatchObject({ value: 4, status: 'FAIL' });
    expect(verdict(b.o)).toBe('FAIL');
  });

  it('L27 — LZ-D13: with no `zoning_layer_versions` in the prior, every layer falls back to `source_dataset_version` (`?? storedVersion`)', async () => {
    // happyPrior() (a full happy run) minus its per-layer version map.
    const prior = await happyPrior();
    delete prior.zoning_layer_versions;

    const { o, err } = await run({ priorMeta: prior });
    expect(err).toBeNull();

    // `storedLayerVersions[l.key] ?? storedVersion` → every layer re-reads the dataset version,
    // so all ten match and the run skips (no fetches at all).
    expect(ds(o).length).toBe(0);

    // The skip re-emits `zoning_layer_versions` as the EMPTY map it was handed (LZ-D13).
    expect(meta(o).zoning_layer_versions).toEqual({});
  });

  it('L28 — LZ-D8: the 730-day window runs from the PUBLISHER\u2019s version', async () => {
    // V (the prior run\u2019s publisher version, 2026-02-20) is stored per-layer in happyPrior().
    // (a) 2028-03-01 is >730 d past V (not past RUN_AT\u2019s own cadence) → cache_stale_force_reload.
    const stale = await run({ runAt: new Date('2028-03-01T12:00:00Z'), priorMeta: await happyPrior() });
    expect(stale.err).toBeNull();

    // The stale window defeats the every-layer skip → all ten layers reload.
    expect(ds(stale.o).length).toBe(10);

    // C4 age is measured from the publisher\u2019s base version against RUN_AT (TZ-less parse = local).
    const age = row(stale.o, 'dataset_version_age_days');
    expect(age.status).toBe('FAIL');
    const expected = (stale.o.helpers.ageDaysFrom as (n: number, v: string) => number | null)(
      Date.parse(String(new Date('2028-03-01T12:00:00Z'))),
      V,
    );
    expect(age.value).toBe(expected);
    expect([739, 740]).toContain(age.value);
    expect(verdict(stale.o)).toBe('FAIL');

    // (b) 2027-06-01 is inside the 730-day window and the version is unchanged → skip.
    const fresh = await run({ runAt: new Date('2027-06-01T12:00:00Z'), priorMeta: await happyPrior() });
    expect(fresh.err).toBeNull();
    expect(ds(fresh.o).length).toBe(0);

    const age2 = row(fresh.o, 'dataset_version_age_days');
    expect(age2.status).toBe('WARN');
    expect([465, 466]).toContain(age2.value);
  });

  it('L29 — load errors: an overlay is WARN-skipped with its version STILL recorded (LZ-D12, second path); a base error rejects with no summary (LZ-D19)', async () => {
    // (a) An OVERLAY upsert rejects: the layer is WARN-skipped and its version is still recorded.
    const a = await run({ failUpsert: ['zoning_parking_zone_overlay'] });
    expect(a.err).toBeNull();
    expect(row(a.o, 'parking_zone_overlay_load_error')).toMatchObject({
      value: 'upsert boom zoning_parking_zone_overlay',
      status: 'WARN',
    });
    const loaded = meta(a.o).zoning_layers_loaded as Record<string, boolean>;
    expect(loaded.parking_zone_overlay).toBe(false);
    expect(meta(a.o).zoning_partial_load).toEqual({ missing_layers: ['parking_zone_overlay'] });
    // LZ-D12 (second path): the failed overlay's version is STILL the publisher version.
    expect((meta(a.o).zoning_layer_versions as Record<string, string | null>).parking_zone_overlay).toBe(V);

    // (b) A BASE upsert rejects: the error propagates out, so no summary is ever emitted.
    const b = await run({ failUpsert: ['zoning_bylaw_areas'] });
    expect(b.err?.message).toBe('upsert boom zoning_bylaw_areas');
    expect(b.o.summaries.length).toBe(0);
    // Only the base layer\u2019s datastore_search was attempted before the throw.
    expect(ds(b.o).length).toBe(1);
  });
});

// ===========================================================================
// PART 2a (row 3.3 ①/5a) — the converted claims D1–D3 (`it.fails` at ①, flip
// to `it` at ②). At ① each is RED as a NAMED MISSING ARTIFACT (descriptor /
// compute / notes / shell), never as a TS or import error — `it.fails()`
// INVERTS, so a fully-green run of this block is itself the proof every claim
// is genuinely red at this commit. Each body's FIRST statement reaches for a
// future artifact through `loadDescriptor()` / `loadComputeModule()` /
// `artifact(...)`, so the RED reason is the missing file, named.
//
// Gate answers folded into these claims (as recorded in the ① assessment):
// ten CKAN DataStore primaries (0y) 1:1 with the legacy LAYERS registry, ids
// are the layer keys (`base` / `height_overlay` / …), `kind:"http_api"` +
// `format:"ckan_datastore"`, `url = ${CKAN_ACTION}/datastore_search`,
// `key_property:"_id"`, `license = LICENSE_URL`; the BASE abort is the D3
// `on_failure` OMISSION (abort_step), every OVERLAY is `on_failure:
// "warn_row_continue"`; `staleness.skip_scope:"all_primaries"`; the single
// `ckan_metadata` trigger emits `zoning_layer_versions`; the recovery +
// override are `ZONING_FORCE_RELOAD`. The oracle's `module.exports` helpers
// (`CKAN_ACTION`, `CKAN_PACKAGE_ID`, `LICENSE_URL`, `LAYERS`) are the parity
// source.
// ===========================================================================

// ---------------------------------------------------------------------------
// Artifact helpers (copied from src/tests/steps/load_heritage/violations.test.ts:736-860)
// ---------------------------------------------------------------------------

function abs(rel: string): string {
  return path.join(REPO_ROOT, rel);
}

/** Assert a FUTURE artifact exists; the failure message names it. Returns the absolute path. */
function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the row-3.3 commit sequence)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string {
  return fs.readFileSync(artifact(rel), 'utf8');
}

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d); // throws with the AJV error list — the loader property (Spec 122 §4.2)
  return d;
}

interface ComputeModule {
  coerceKey?: (raw: unknown, ctx?: { geojson?: string | null }) => number | null;
  dedupeBySourceId?: (rows: Record<string, unknown>[]) => unknown;
  shapeRecord?: (
    r: Record<string, unknown>,
    seam: { geojson: string; config: Record<string, unknown>; run_at: Date; tag: (t: string) => void },
  ) => Record<string, unknown> | string | null;
  [k: string]: unknown;
}

function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return mod;
}

// ONE compiler, the same one pipeline.step() validates with.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

// ---------------------------------------------------------------------------
// Descriptor / compute shapes (declared here so the types are one home)
// ---------------------------------------------------------------------------

interface Check {
  id: string;
  kind: string;
  severity: string;
  blocking: boolean;
  when: string;
  limit: unknown;
  limit_from_config?: string;
  warn_limit?: unknown;
  warn_limit_from_config?: string;
  [k: string]: unknown;
}

interface ExternalSpec {
  id: string;
  kind: string;
  format: string;
  url?: string;
  license?: string;
  on_failure?: string;
  on_head_error?: string;
  key_property?: string;
  target?: string;
  ckan?: { resource_id: string; package_url: string; page_size_from_config: string };
  cache?: string;
  line_validity?: string;
  [k: string]: unknown;
}

interface WriteSpec {
  table: string;
  key: string | string[];
  key_sql_type?: string;
  retract?: string;
  geometry_kind?: string;
  columns: Array<{ name: string; on_empty?: string; written?: string; bind?: string }>;
  write_discipline: {
    class: string;
    guard_columns: unknown;
    idempotent_rerun?: string;
    set_source?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface Descriptor {
  identity: {
    name: string;
    archetype: string;
    lock: number;
    spec: string;
    spec_version?: string;
    display_name?: string;
    [k: string]: unknown;
  };
  /** Spec 122 §5.1 — the frozen shape lives under `execution`. */
  execution: {
    shape: string;
    network?: { retries_from_config?: string; timeout_from_config?: string; [k: string]: unknown };
    [k: string]: unknown;
  };
  inputs: { reads: { externals: ExternalSpec[] } };
  outputs: 'none' | { writes: WriteSpec[]; invalidates?: unknown };
  checks: Check[];
  staleness?: {
    skip_scope?: string;
    trigger?: Array<{
      signal: string;
      position: string;
      style: string;
      emit_key: string;
      max_age_days_from_config: string;
      external?: unknown;
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  };
  recovery?: { interrupted?: string; force?: string; [k: string]: unknown };
  override?: { force_run?: string; [k: string]: unknown };
  /** Spec 124 Rule 3 — the declared §6 logic-variable bindings (name → {on_invalid}). */
  config?: { logic_variables?: Array<{ name?: string; on_invalid?: string; [k: string]: unknown }>; [k: string]: unknown };
  [k: string]: unknown;
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'an INGESTOR may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

function writeByTable(d: Descriptor, table: string): WriteSpec {
  const w = writes(d).find((x) => x.table === table);
  expect(w, `descriptor declares no write target "${table}"`).toBeDefined();
  return w as WriteSpec;
}

/** The evaluated legacy `module.exports` (`LAYERS`, `CKAN_ACTION`, the url constants). */
function legacy(): Record<string, unknown> {
  return loadLegacy().helpers;
}

/** The legacy `LAYERS` registry, typed (key/table/resourceId/geomKind/cols). */
function legacyLayers(): {
  key: string;
  table: string;
  resourceId: string;
  geomKind: string;
  cols: { col: string; src: string; kind: string; min?: number; max?: number; maxLen?: number }[];
}[] {
  return legacy().LAYERS as {
    key: string;
    table: string;
    resourceId: string;
    geomKind: string;
    cols: { col: string; src: string; kind: string; min?: number; max?: number; maxLen?: number }[];
  }[];
}

/** `scripts/seeds/logic_variables.json` — parsed directly (the RED reason stays the seed row). */
function seedOf(name: string): unknown {
  const json = JSON.parse(
    fs.readFileSync(abs('scripts/seeds/logic_variables.json'), 'utf8'),
  ) as Record<string, { default?: unknown }>;
  return json[name]?.default;
}

/** The fifteen `load_zoning`-prefixed §6 knobs, in the registered order. */
const ZONING_VARS = [
  'load_zoning_datastore_page_size',
  'load_zoning_http_timeout_ms',
  'load_zoning_orphan_warn_pct',
  'load_zoning_orphan_fail_pct',
  'load_zoning_loaded_pct_warn_below',
  'load_zoning_loaded_pct_fail_below',
  'load_zoning_dataset_age_warn_days',
  'load_zoning_dataset_age_fail_days',
  'load_zoning_force_reload_max_age_days',
  'load_zoning_null_count_warn_over_pct',
  'load_zoning_with_exceptions_warn_below_pct',
  'load_zoning_duration_warn_factor',
  'load_zoning_base_invalid_polygon_warn_max_count',
  'load_zoning_base_invalid_polygon_warn_max_pct',
  'load_zoning_distribution_top_n',
];

describe('row 3.3 — converted claims part A (RED at ①; flip to `it` at ②)', () => {
  // D1 — identity / shape / shell (the §5.1 frozen shell + §A.5 lock 58).
  it(
    'D1 — identity and frozen shell: descriptor AJV-valid, identity lock 58 / spec "58" / archetype INGESTOR, execution.shape "ingest", notes + compute load, shell is a pipeline.step() with ADVISORY_LOCK_ID = 58 (flips at ②)',
    () => {
      const d = loadDescriptor();

      expect(d.identity.name).toBe('load_zoning');
      expect(d.identity.archetype).toBe('INGESTOR');
      expect(d.identity.spec).toBe('58');
      expect(d.identity.lock).toBe(LOCK_ID);
      expect(d.execution.shape).toBe('ingest');

      // The notes file exists (read its text — the named missing artifact if absent).
      expect(readText(NOTES_REL).length).toBeGreaterThan(0);

      // The compute module loads (the named missing artifact if absent).
      expect(loadComputeModule()).toBeDefined();

      // The frozen shell is a `pipeline.step(...)` declaration carrying the lock textual, and is
      // NOT the pre-conversion `pipeline.run(...)` loader.
      const shell = readText(SHELL_REL);
      expect(shell).toContain('pipeline.step(');
      expect(shell).toContain('ADVISORY_LOCK_ID = 58');
      expect(shell).not.toContain('pipeline.run(');
    },
  );

  // D2 — TEN CKAN DataStore primaries (0y), 1:1 with the legacy LAYERS registry.
  it(
    'D2 — ten CKAN DataStore primaries: externals ids equal the legacy LAYERS keys in order, each http_api/ckan_datastore with url `${CKAN_ACTION}/datastore_search`, ckan.resource_id/package_url/page_size_from_config, key_property "_id", target/table/license parity, and the assert-schema.js copy matches every resource_id (flips at ②)',
    () => {
      const d = loadDescriptor();

      const ext = d.inputs.reads.externals;
      const A = legacy().CKAN_ACTION as string;
      const P = legacy().CKAN_PACKAGE_ID as string;
      const LICENSE_URL = legacy().LICENSE_URL as string;
      const L = legacyLayers();

      expect(ext.map((e) => e.id)).toEqual(L.map((l) => l.key));

      for (let i = 0; i < L.length; i += 1) {
        const e = ext[i]!;
        const l = L[i]!;

        expect(e.kind).toBe('http_api');
        expect(e.format).toBe('ckan_datastore');
        expect(e.url).toBe(`${A}/datastore_search`);
        expect(e.ckan).toEqual({
          resource_id: l.resourceId,
          package_url: `${A}/package_show?id=${P}`,
          page_size_from_config: 'load_zoning_datastore_page_size',
        });
        expect(e.key_property).toBe('_id');
        expect(e.target).toBe(l.table);
        expect(e.license).toBe(LICENSE_URL);
        expect(e.on_head_error).not.toBe('warn_row');
      }

      // The BASE (index 0) aborts the step; every OVERLAY continue-warns.
      expect(ext[0]).not.toHaveProperty('on_failure');
      for (let i = 1; i < ext.length; i += 1) {
        expect(ext[i]!.on_failure).toBe('warn_row_continue');
      }

      // The second copy of every resourceId must not drift (the assert-schema.js §3.5 constants).
      const assertSchema = fs.readFileSync(abs('scripts/lib/compute/assert-schema.js'), 'utf8');
      for (const l of L) {
        expect(assertSchema).toContain(l.resourceId);
      }
    },
  );

  // D3 — the staleness gate and the interrupted-run recovery.
  it(
    'D3 — staleness.skip_scope "all_primaries"; exactly one trigger {signal "source_validator", position "pre_acquisition", style "ckan_metadata", emit_key "zoning_layer_versions", max_age_days_from_config "load_zoning_force_reload_max_age_days"} with no external; recovery.interrupted "force_full_on_next_run"; override.force_run === recovery.force === "ZONING_FORCE_RELOAD" (flips at ②)',
    () => {
      const d = loadDescriptor();

      expect(d.staleness?.skip_scope).toBe('all_primaries');

      const trigger = d.staleness?.trigger;
      expect(trigger).toHaveLength(1);
      expect(trigger?.[0]).toMatchObject({
        signal: 'source_validator',
        position: 'pre_acquisition',
        style: 'ckan_metadata',
        emit_key: 'zoning_layer_versions',
        max_age_days_from_config: 'load_zoning_force_reload_max_age_days',
      });
      expect(trigger?.[0]).not.toHaveProperty('external');

      expect(d.recovery?.interrupted).toBe('force_full_on_next_run');
      expect(d.override?.force_run).toBe('ZONING_FORCE_RELOAD');
      expect(d.recovery?.force).toBe('ZONING_FORCE_RELOAD');
    },
  );
});

// ===========================================================================
// PART 2b (row 3.3 ①/5b) — the converted claims D4–D6 (`it.fails` at ①, flip
// to `it` at ②). Same RED-as-NAMED-MISSING-ARTIFACT discipline as part A: the
// FIRST statement reaches for the future descriptor, so the RED reason is
// `scripts/load-zoning.descriptor.json` (absent at ①), never a TS/import error.
//
// Gate answers folded in (as recorded in the ① assessment):
//   D4 — ten class-B (`upsert_scoped_departure_delete`) write targets, 1:1 with
//        the legacy LAYERS tables; `INTEGER` source_id keys; guard
//        `is_distinct_from` over `[...L.cols, 'geometry', 'geom']`; LZ-D2 pins
//        `source_dataset_version` into SET but OUT of the guard. The two
//        LINESTRING layers (policy_road_overlay, priority_retail_overlay)
//        declare the 0z1 `multiline` + `line_validity:"length_and_simple"`.
//   D5 — no retry; ONE whole-request deadline `load_zoning_http_timeout_ms`
//        (LZ-D15 >30000 replaces the 30 s socket-idle timeout).
//   D6 — Rule 3: every `load_zoning_*` knob is a DECLARED logic variable with
//        `on_invalid:"fail"` (Gate answer B), its seed default equal to the
//        legacy literal; `load_zoning_max_redirects` is STRUCK (LZ-D14).
// ===========================================================================

describe('row 3.3 — converted claims part A2 (RED at ①; flip to it at ②)', () => {
  // D4 — ten class-B write targets, each keyed source_id, guarded on the
  // legacy `IS DISTINCT FROM` arms MINUS the version stamp (LZ-D2).
  it(
    'D4 — ten class-B write targets: writes tables equal the legacy LAYERS tables in order, each key source_id / key_sql_type INTEGER, class upsert_scoped_departure_delete / guard is_distinct_from / idempotent_rerun zero_writes; sorted guard_columns equal [...L.cols, "geometry", "geom"] and exclude source_dataset_version; linestring layers declare geometry_kind "multiline" + line_validity "length_and_simple", all others "polygon" with no line_validity (flips at ②)',
    () => {
      const d = loadDescriptor();
      const L = legacyLayers();

      expect(writes(d).map((w) => w.table)).toEqual(L.map((l) => l.table));
      expect(writes(d)).toHaveLength(10);

      for (let i = 0; i < L.length; i += 1) {
        const w = writes(d)[i]!;
        const l = L[i]!;

        expect(w.table).toBe(l.table);
        expect(w.key).toBe('source_id');
        expect(w.key_sql_type).toBe('INTEGER');

        expect(w.write_discipline.class).toBe('upsert_scoped_departure_delete');
        expect(w.write_discipline.guard).toBe('is_distinct_from');
        expect(w.write_discipline.idempotent_rerun).toBe('zero_writes');

        // LZ-D2: the guard is the legacy data-column set + geometry + geom, NEVER the version.
        const guardColumns = (w.write_discipline.guard_columns as string[]).slice().sort();
        const expectedGuard = [...l.cols.map((c) => c.col), 'geometry', 'geom'].sort();
        expect(guardColumns).toEqual(expectedGuard);
        expect(guardColumns).not.toContain('source_dataset_version');
      }

      // Geometry (0z1): LINESTRING layers are multilines with a distinct length+simple guard;
      // every polygon layer declares "polygon" and carries NO line_validity property.
      for (let i = 0; i < L.length; i += 1) {
        const w = writes(d)[i]!;
        const l = L[i]!;
        if (l.geomKind === 'linestring') {
          expect(w.geometry_kind).toBe('multiline');
          expect(w.line_validity).toBe('length_and_simple');
        } else {
          expect(w.geometry_kind).toBe('polygon');
          expect(w).not.toHaveProperty('line_validity');
        }
      }
    },
  );

  // D5 — network posture: no retry, ONE whole-request deadline > 30000 ms (LZ-D15).
  it(
    'D5 — execution.network.retries_from_config "none", timeout_from_config "load_zoning_http_timeout_ms", and Number(seedOf("load_zoning_http_timeout_ms")) > 30000 (a whole-request deadline replaces the 30 s socket-idle timeout, LZ-D15) (flips at ②)',
    () => {
      const d = loadDescriptor();

      expect(d.execution.network?.retries_from_config).toBe('none');
      expect(d.execution.network?.timeout_from_config).toBe('load_zoning_http_timeout_ms');
      // ② fix: seedOf() already returns the seed row's `default`; the ① body read `.default` twice (NaN, never green).
      expect(Number(seedOf('load_zoning_http_timeout_ms'))).toBeGreaterThan(30000);
    },
  );

  // D6 — Rule 3 logic variables: every load_zoning_* knob declared `on_invalid:"fail"` with a
  // legacy-equal seed default; the struck redirect knob is wholly absent (LZ-D14).
  it(
    'D6 — every ZONING_VARS name is in config.logic_variables with on_invalid "fail"; load_zoning_max_redirects is in neither JSON.stringify(descriptor) nor the seed keys (struck, LZ-D14); seed defaults equal the legacy literals (datastore_page_size 10000 === legacy DATASTORE_PAGE, orphan 0.5/2, loaded 95/90, age 450/730, force 730, null 10, exceptions 50, duration 2, invalid-polygon 50/0.5, top-n 20) (flips at ②)',
    () => {
      const d = loadDescriptor();
      const declared = d.config?.logic_variables;
      expect(Array.isArray(declared), 'the descriptor must declare config.logic_variables').toBe(true);

      const byName = new Map((declared ?? []).map((v) => [v.name, v]));
      for (const name of ZONING_VARS) {
        const v = byName.get(name);
        expect(v, `logic variable "${name}" must be declared`).toBeDefined();
        expect(v?.on_invalid, `"${name}" must be on_invalid:"fail" (Gate answer B)`).toBe('fail');
      }

      // LZ-D14: the redirect cap is STRUCK — absent from BOTH the descriptor and the seed file.
      const seedJson = JSON.parse(
        fs.readFileSync(abs('scripts/seeds/logic_variables.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(JSON.stringify(d)).not.toContain('load_zoning_max_redirects');
      expect(Object.keys(seedJson)).not.toContain('load_zoning_max_redirects');

      // Seed defaults equal the legacy literals (each carries the load_zoning_ prefix).
      const legacyHelpers = legacy();
      const P = 'load_zoning_';
      expect(seedOf(`${P}datastore_page_size`)).toBe(10000);
      expect(seedOf(`${P}datastore_page_size`)).toBe(legacyHelpers.DATASTORE_PAGE);

      expect(seedOf(`${P}orphan_warn_pct`)).toBe(0.5);
      expect(seedOf(`${P}orphan_fail_pct`)).toBe(2);
      expect(seedOf(`${P}loaded_pct_warn_below`)).toBe(95);
      expect(seedOf(`${P}loaded_pct_fail_below`)).toBe(90);
      expect(seedOf(`${P}dataset_age_warn_days`)).toBe(450);
      expect(seedOf(`${P}dataset_age_fail_days`)).toBe(730);
      expect(seedOf(`${P}force_reload_max_age_days`)).toBe(730);
      expect(seedOf(`${P}null_count_warn_over_pct`)).toBe(10);
      expect(seedOf(`${P}with_exceptions_warn_below_pct`)).toBe(50);
      expect(seedOf(`${P}duration_warn_factor`)).toBe(2);
      expect(seedOf(`${P}base_invalid_polygon_warn_max_count`)).toBe(50);
      expect(seedOf(`${P}base_invalid_polygon_warn_max_pct`)).toBe(0.5);
      expect(seedOf(`${P}distribution_top_n`)).toBe(20);
    },
  );
});

// ===========================================================================
// PART 2c (row 3.3 ①/6) — the converted claims D7–D11 (`it.fails` at ①, flip
// to `it` at ②) + the commit-① report-marker test (plain `it`: GREEN today).
// Same RED-as-NAMED-MISSING-ARTIFACT discipline as parts A/A2: each D-body's
// FIRST reach is the absent `scripts/lib/compute/load-zoning.js` (via
// `loadComputeModule()`) or `scripts/load-zoning.descriptor.json` (via
// `loadDescriptor()`), so the RED reason is the missing file, named — never a
// TS or import error. `it.fails()` INVERTS, so a fully-green run here is itself
// the proof every claim is genuinely red at ①.
//
// Gate answers folded in (as recorded in the ① assessment):
//   D7 — R2-17 reject-ALL dedupe (`dedupeRejectAll`), NOT keep-first.
//   D8 — one `shapeRecord(record, {geojson, config, run_at, tag})` seam serving
//        all ten layers, tag-for-tag parity with the legacy `coerceColumn`
//        (`out_of_range_nulled` ×2 on base `_id` 2; `unparseable_height` on
//        height `_id` 2).
//   D9 — every numeric bound is config-bound (Gate A); the force seam keeps its
//        L22 WARN row `zoning_override_force_reload_present` (heritage D15
//        precedent).
//   D10 — the §9 emit/counters freeze (P-C1): base-only counters via
//         `written.by_target`.
//   E — the compute imports `MS_PER_DAY` from `scripts/lib/units.js`; no
//        numeric literal (declared here as the dataset-age bound, no assert).
// ===========================================================================

describe('row 3.3 — converted claims part B (RED at ①; flip to `it` at ②)', () => {
  /**
   * The slice of `step.schema.json` part 2b reads BEYOND the part-2a `Descriptor`: the §9 emit
   * freeze, the §11 counter contract and the declared defect arrays. Read through ONE cast so the
   * part-2a interface stays the single home of the already-claimed fields.
   */
  interface StepDescriptorExtras {
    emits?: 'none' | Array<{ key: string; type?: string; consumers: string[]; skeleton?: unknown }>;
    counters?: 'none' | {
      records_total: { source: string; scoped_by?: unknown };
      records_new: { source: string; scoped_by?: unknown };
      records_updated: { source: string; scoped_by?: unknown };
    };
    deviations?: unknown;
    limitations?: unknown;
  }

  /** The part-2a descriptor plus the fields part 2b claims (one cast, one cast only). */
  function loadDescriptorExtras(): Descriptor & StepDescriptorExtras {
    return loadDescriptor() as Descriptor & StepDescriptorExtras;
  }

  // D7 — key + dedupe parity with the legacy oracle (F-M7 / F-M4 / R2-17).
  it(
    'D7 — coerceKey parity with legacy coerceSourceId over ["1",1,"0",0,"-5","abc","",undefined,null,1.5,11719]; dedupeBySourceId([{source_id:1,a:"x"},{source_id:1,a:"y"},{source_id:2}]) deep-equals legacy().dedupeRejectAll(rows) AND equals {kept:[{source_id:2}], duplicateCount:2} (R2-17 reject-ALL, NOT keep-first) (flips at ②)',
    () => {
      const compute = loadComputeModule();
      const coerceSourceId = legacy().coerceSourceId as (raw: unknown) => number | null;
      const dedupeRejectAll = legacy().dedupeRejectAll as (rows: Record<string, unknown>[]) => unknown;

      for (const x of ['1', 1, '0', 0, '-5', 'abc', '', undefined, null, 1.5, 11719]) {
        expect(compute.coerceKey?.(x as never)).toBe(coerceSourceId(x));
      }

      const rows = [
        { source_id: 1, a: 'x' },
        { source_id: 1, a: 'y' },
        { source_id: 2 },
      ];
      // Parity with the legacy R2-17 oracle …
      expect(compute.dedupeBySourceId?.(rows)).toEqual(dedupeRejectAll(rows));
      // … and the frozen reject-ALL outcome: BOTH rows sharing source_id 1 are dropped.
      expect(compute.dedupeBySourceId?.(rows)).toEqual({ kept: [{ source_id: 2 }], duplicateCount: 2 });
    },
  );

  // D8 — shapeRecord parity with legacy `coerceColumn`, record by record, over the full fixture.
  it(
    'D8 — shapeRecord(r, {geojson, config, run_at, tag}) toMatchObject the legacy coerceColumn value for every fixture record of every layer; base _id 2 tags "out_of_range_nulled" ×2 and height _id 2 tags "unparseable_height" (flips at ②)',
    () => {
      const compute = loadComputeModule();
      const coerceColumn = legacy().coerceColumn as (
        rawValue: unknown,
        colDef: unknown,
      ) => { value: unknown };
      const L = legacyLayers();

      for (const layer of L) {
        for (const r of FX[layer.key] ?? []) {
          const tags: string[] = [];
          const out = compute.shapeRecord?.(r, {
            geojson: r.geometry as string,
            config: {},
            run_at: RUN_AT,
            tag: (t: string) => {
              tags.push(t);
            },
          });

          // Every declared column's coerced value matches the legacy oracle, cell for cell.
          expect(out).toMatchObject(
            Object.fromEntries(layer.cols.map((c) => [c.col, coerceColumn(r[c.src], c).value])),
          );

          // Base _id 2 carries FSI_TOTAL −1 and PRCNT_COMM −1 → two out-of-range nulls.
          if (layer.key === 'base' && r._id === 2) {
            expect(tags.filter((t) => t === 'out_of_range_nulled').length).toBe(2);
          }
          // Height _id 2 carries the range label "10-12" → one unparseable height.
          if (layer.key === 'height_overlay' && r._id === 2) {
            expect(tags).toContain('unparseable_height');
          }
        }
      }
    },
  );

  // D9 — the checks are config-bound (Gate A) and the force seam keeps its L22 WARN row.
  it(
    'D9 — every check.limit === "viol == 0" OR its limit_from_config is a declared config.logic_variables name; limit_from_config ∪ warn_limit_from_config covers load_zoning_orphan_fail_pct / load_zoning_loaded_pct_fail_below / load_zoning_dataset_age_fail_days / load_zoning_base_invalid_polygon_warn_max_count; a check id "zoning_override_force_reload_present" exists with severity "WARN" (L22 parity, heritage D15 precedent) (flips at ②)',
    () => {
      const d = loadDescriptor();

      const declared = (d.config?.logic_variables ?? []).map((v) => v.name).filter((n): n is string => n !== undefined);
      const declaredNames = new Set(declared);

      // Gate A: no check carries a bare numeric literal — each is `viol == 0` or a config name.
      for (const check of d.checks) {
        const boundByConfig =
          typeof check.limit_from_config === 'string' && declaredNames.has(check.limit_from_config);
        expect(
          check.limit === 'viol == 0' || boundByConfig,
          `check "${check.id}" must be config-bound (Gate A)`,
        ).toBe(true);
        // ② tightening: a declared warn tier must be config-bound too (Gate A covers limit AND warn_limit).
        if (check.warn_limit !== undefined) {
          expect(
            typeof check.warn_limit_from_config === 'string' && declaredNames.has(check.warn_limit_from_config),
            `check "${check.id}" warn_limit must be config-bound (Gate A)`,
          ).toBe(true);
        }
      }

      // The four thresholds the legacy literals (> seed defaults) resolve from config names.
      // ② correction: a PASS/WARN/FAIL band is limit = the WARN bound + warn_limit = the looser FAIL bound
      // (verdict.js checkRow), so a *_fail_* variable binds through warn_limit_from_config.
      const bound = new Set(
        d.checks
          .flatMap((c) => [c.limit_from_config, c.warn_limit_from_config])
          .filter((n): n is string => typeof n === 'string'),
      );
      for (const name of [
        'load_zoning_orphan_fail_pct',
        'load_zoning_loaded_pct_fail_below',
        'load_zoning_dataset_age_fail_days',
        'load_zoning_base_invalid_polygon_warn_max_count',
      ]) {
        expect(bound, `some check must bind limit_from_config or warn_limit_from_config "${name}"`).toContain(name);
      }

      // L22 parity: the force-reload seam keeps its WARN row (heritage D15 precedent).
      const force = d.checks.find((c) => c.id === 'zoning_override_force_reload_present');
      expect(force, 'the force-reload presence check must exist').toBeDefined();
      expect(force?.severity).toBe('WARN');
    },
  );

  // D10 — the §9 emit + counters freeze (P-C1; counters are base-only).
  it(
    'D10 — emits keys include zoning_layers_loaded / zoning_partial_load / source_dataset_version / zoning_layer_versions / base_layer_committed_after_overlays_failed; the zoning_layers_loaded emit consumers === ["enrich_parcels"]; counters.records_total/records_new/records_updated .source each contains "zoning_bylaw_areas" (base-only, via written.by_target) (flips at ②)',
    () => {
      const d = loadDescriptorExtras();

      expect(d.emits, 'the loader declares its §9 emits').not.toBe('none');
      const emits = d.emits as Array<{ key: string; consumers: string[] }>;
      const emitKeys = emits.map((e) => e.key);
      for (const key of [
        'zoning_layers_loaded',
        'zoning_partial_load',
        'source_dataset_version',
        'zoning_layer_versions',
        'base_layer_committed_after_overlays_failed',
      ]) {
        expect(emitKeys, `the emit set must include "${key}"`).toContain(key);
      }

      const layersLoaded = emits.find((e) => e.key === 'zoning_layers_loaded');
      expect(layersLoaded?.consumers).toEqual(['enrich_parcels']);

      expect(d.counters, 'a LOADER declares its counters (§11)').not.toBe('none');
      const c = d.counters as {
        records_total: { source: string };
        records_new: { source: string };
        records_updated: { source: string };
      };
      expect(c.records_total.source).toContain('zoning_bylaw_areas');
      expect(c.records_new.source).toContain('zoning_bylaw_areas');
      expect(c.records_updated.source).toContain('zoning_bylaw_areas');
    },
  );

  // D11 — the declared defects the ① conversion records (deviations vs limitations).
  it(
    'D11 — JSON.stringify(deviations) names LZ-D11 / LZ-D13 / LZ-D14 / LZ-D15 / LZ-D16 / LZ-D17 / LZ-D18; JSON.stringify(limitations) names LZ-D2 / LZ-D3 / LZ-D4 / LZ-D8 (flips at ②)',
    () => {
      const d = loadDescriptorExtras();

      const deviations = JSON.stringify(d.deviations);
      for (const id of ['LZ-D11', 'LZ-D13', 'LZ-D14', 'LZ-D15', 'LZ-D16', 'LZ-D17', 'LZ-D18']) {
        expect(deviations, `deviations must name ${id}`).toContain(id);
      }

      const limitations = JSON.stringify(d.limitations);
      for (const id of ['LZ-D2', 'LZ-D3', 'LZ-D4', 'LZ-D8']) {
        expect(limitations, `limitations must name ${id}`).toContain(id);
      }
    },
  );
});

describe('row 3.3 — the commit-① assessment report (plain it: GREEN today)', () => {
  it('the commit-① report states the compressed-form marker (R-PACE-1)', () => {
    const report = fs.readFileSync(abs(REPORT_REL), 'utf8');
    expect(report).toContain('**Commit form: compressed (R-PACE-1)**');
  });
});
