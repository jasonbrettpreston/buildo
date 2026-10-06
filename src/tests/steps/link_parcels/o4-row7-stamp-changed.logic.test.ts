// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, §6.6.1; O4 row 7 (registry-truth folds 14 + 15) — link_parcels full_rescan, stamp only changed links
//
// O4 row 7 (operator ruling 2026-10-03, folds 14/15): link_parcels re-checks EVERY permit every run
// (staleness.mode_select "none" — full_rescan) but writes permits.parcel_linked_at ONLY for a permit whose
// parcel link actually changed this run — a permit_parcels row inserted or value-changed by the guarded
// upsert (its linked_at = RUN_AT), or a row removed by the keyed DELETE. No ≈240K-row permits rewrite, no
// permits BEFORE UPDATE trigger storm.
// The match_type='spatial' FULL-only mass retraction is RETIRED under full_rescan: the mode is "full" on
// every run, so it would delete and re-insert every spatial link every run (every one re-stamped). The
// runner refuses a retract "all" target under mode_select "none" (R7-5).
// The keyed DELETE's before-image is now EXACT (the same predicate as the DELETE, read once) instead of
// every link of every permit in the batch — under full_rescan the superset would dump the whole table
// to JSONL on every run.
// Fixture: P1 keeps parcel 100 [unchanged], P2 moves 200 → 201, P3 loses 300 (no match).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/link-parcels.js'));
const REAL = require(join(process.cwd(), 'scripts/link-parcels.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const NOOP_LOG = { info: () => {}, warn: () => {}, error: () => {} };
const RUN_AT = new Date('2026-10-03T12:00:00Z');
const CONFIG: Record<string, number> = Object.freeze({
  link_parcels_confidence_address_points_exact: 0.97,
  link_parcels_confidence_exact_address: 0.95,
  link_parcels_confidence_spatial_polygon: 0.90,
  link_parcels_confidence_name_only: 0.80,
  link_parcels_link_rate_warn_pct: 25,
  spatial_match_max_distance_m: 100,
  spatial_match_confidence: 0.65,
});

/** The FLEET-2 target descriptor shape for row 7 (seat B lands the real edit; this fixture pins it). */
function row7Descriptor() {
  const d = clone(REAL);
  d.guards.requires = [];
  d.staleness.trigger = 'none';
  d.staleness.mode_select = 'none';
  d.outputs.writes[0].retract = 'none';
  delete d.outputs.writes[0].retract_when;
  return d;
}

type Answer = { rows: unknown[]; rowCount?: number } | undefined;

function fakePool(answer: (text: string, values: unknown[]) => Answer) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const record = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    const custom = answer(text, values ?? []);
    if (custom !== undefined) return custom;
    if (/pg_extension|information_schema\.columns|pg_indexes|pg_constraint|pg_proc/i.test(text)) return { rows: [{ x: 1 }] };
    if (/relrowsecurity/i.test(text)) return { rows: [{ rls_enabled: false, policies: 0, bypassrls: true }] };
    return { rows: [], rowCount: 0 };
  };
  return { sql, params, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

const BATCH = [
  { permit_num: 'P1', revision_num: '00', street_num: '1', street_name: 'ALPHA', street_type: 'ST', latitude: null, longitude: null },
  { permit_num: 'P2', revision_num: '00', street_num: '2', street_name: 'BETA', street_type: 'ST', latitude: null, longitude: null },
  { permit_num: 'P3', revision_num: '00', street_num: '3', street_name: 'GAMMA', street_type: 'ST', latitude: null, longitude: null },
];
const STALE = [
  { permit_num: 'P2', revision_num: '00', parcel_id: 200, match_type: 'exact_address', confidence: '0.95', linked_at: '2026-09-01T00:00:00Z' },
  { permit_num: 'P3', revision_num: '00', parcel_id: 300, match_type: 'spatial', confidence: '0.65', linked_at: '2026-09-01T00:00:00Z' },
];

function scenario(staleRows: Array<Record<string, unknown>>, stampedRows: Array<Record<string, unknown>>) {
  const m = compute.buildMatchSql(row7Descriptor(), CONFIG, 'full');
  let batchCalls = 0;
  return fakePool((text) => {
    if (text === m.eligible_count_sql) return { rows: [{ total: '3' }] };
    if (text === m.eligible_batch_sql) { batchCalls += 1; return batchCalls === 1 ? { rows: BATCH } : { rows: [] }; }
    if (text === m.primary_match_sql) return { rows: [
      { permit_num: 'P1', revision_num: '00', parcel_id: 100, match_type: 'address_points_exact', confidence: 0.97 },
      { permit_num: 'P2', revision_num: '00', parcel_id: 201, match_type: 'exact_address', confidence: 0.95 },
    ] };
    if (text === m.spatial_fallback_sql) return { rows: [] };
    if (text === m.cumulative_sql) return { rows: [{ linked: 2, total: 3 }] };
    if (m.street_type_mismatch_sql && text === m.street_type_mismatch_sql) return { rows: [{ n: 0 }] };
    if (text === m.delete_by_key_select_sql) return { rows: staleRows };
    if (text === m.delete_by_key_sql) return { rows: [], rowCount: staleRows.length };
    if (text === m.watermark_update_sql) return { rows: stampedRows, rowCount: stampedRows.length };
    return undefined;
  });
}

async function run(pool: ReturnType<typeof fakePool>, descriptor = row7Descriptor()) {
  return stepLib.runLinkKeyedPhase({
    descriptor, pool, compute, config: CONFIG, chainId: 'permits',
    log: NOOP_LOG, tag: '[link_parcels]', clockNow: RUN_AT,
  });
}

afterEach(() => { vi.restoreAllMocks(); });

describe('O4 row 7 — link_parcels full_rescan stamps parcel_linked_at only on a changed link', () => {
  it('R7-1 (RED) — the watermark is change-guarded and the keyed delete has an exact-predicate SELECT twin', () => {
    const m = compute.buildMatchSql(row7Descriptor(), CONFIG, 'full');
    expect(m.watermark_update_sql).toMatch(/^\s*UPDATE permits/);
    expect(m.watermark_update_sql).toContain('parcel_linked_at IS DISTINCT FROM $3::timestamptz');
    // stamped only when (a) the upsert wrote a permit_parcels row THIS run, or (b) the keyed delete removed one
    expect(m.watermark_update_sql).toContain('pp.linked_at = $3::timestamptz');
    expect(m.watermark_update_sql).toContain('unnest($4::text[])');
    expect(m.watermark_update_sql).toContain('unnest($5::text[])');
    expect(m.delete_by_key_select_sql).toMatch(/^\s*SELECT pp\.permit_num, pp\.revision_num, pp\.parcel_id, pp\.match_type, pp\.confidence, pp\.linked_at/);
    const tail = (s: string) => s.slice(s.indexOf('WHERE')).replace(/RETURNING[\s\S]*$/, '').replace(/;\s*$/, '').trim();
    expect(tail(m.delete_by_key_select_sql)).toBe(tail(m.delete_by_key_sql));
    // full_rescan: no incremental parcel_linked_at filter in the eligible set
    expect(m.eligible_batch_sql).not.toContain('parcel_linked_at');
  });

  it('R7-2 (RED) — mode_select "none" resolves to a full rescan; the only DELETE is the keyed per-batch delete', async () => {
    vi.spyOn(writeLib, 'persistBeforeImageRows').mockReturnValue({ written: true, path: 'stub', rows: 2 });
    const pool = scenario(STALE, [{ permit_num: 'P2' }, { permit_num: 'P3' }]);
    const result = await run(pool);
    expect(result.gate.mode).toBe('full');
    expect(result.gate.reason).toBe('full_rescan');
    const m = compute.buildMatchSql(row7Descriptor(), CONFIG, 'full');
    expect(pool.sql.filter((s) => /^\s*DELETE\b/i.test(s))).toEqual([m.delete_by_key_sql]);
  });

  it('R7-3 (RED) — a changed link (P2 moved, P3 lost) ⇒ exactly those permits are offered to the watermark, after the delete, in one transaction', async () => {
    const spy = vi.spyOn(writeLib, 'persistBeforeImageRows').mockReturnValue({ written: true, path: 'stub', rows: 2 });
    const pool = scenario(STALE, [{ permit_num: 'P2' }, { permit_num: 'P3' }]);
    const result = await run(pool);
    const m = compute.buildMatchSql(row7Descriptor(), CONFIG, 'full');
    const ui = pool.sql.findIndex((s) => /^\s*INSERT INTO permit_parcels/i.test(s));
    const si = pool.sql.indexOf(m.delete_by_key_select_sql);
    const di = pool.sql.indexOf(m.delete_by_key_sql);
    const wi = pool.sql.indexOf(m.watermark_update_sql);
    expect(ui).toBeGreaterThanOrEqual(0);
    expect(si).toBeGreaterThan(ui);
    expect(di).toBeGreaterThan(si);
    expect(wi).toBeGreaterThan(di);
    expect(pool.sql.indexOf('COMMIT', ui)).toBeGreaterThan(wi);
    expect(pool.params[si]).toEqual(pool.params[di]);
    expect(pool.params[wi]).toEqual([['P1', 'P2', 'P3'], ['00', '00', '00'], RUN_AT, ['P2', 'P3'], ['00', '00']]);
    expect(spy).toHaveBeenCalledWith(STALE, 'permit_parcels', REAL.identity.name, RUN_AT);
    expect(result.written.e2.deleted).toBe(2);
    expect(result.written.e3.rows_changed).toBe(2);
  });

  it('R7-4 (RED) — unchanged links ⇒ nothing removed, no before-image, the watermark binds no removed keys and writes 0 permits', async () => {
    const spy = vi.spyOn(writeLib, 'persistBeforeImageRows').mockReturnValue({ written: true, path: 'stub', rows: 0 });
    const pool = scenario([], []);
    const result = await run(pool);
    const m = compute.buildMatchSql(row7Descriptor(), CONFIG, 'full');
    expect(spy).not.toHaveBeenCalled();
    expect(pool.params[pool.sql.indexOf(m.watermark_update_sql)]).toEqual([['P1', 'P2', 'P3'], ['00', '00', '00'], RUN_AT, [], []]);
    expect(result.written.e3.rows_changed).toBe(0);
  });

  it('R7-5 (RED) — the spatial mass retraction is refused under mode_select "none" (it would re-stamp every spatial permit every run)', async () => {
    const d = row7Descriptor();
    d.outputs.writes[0].retract = 'all';
    d.outputs.writes[0].retract_when = 'full_only';
    const pool = scenario([], []);
    await expect(run(pool, d)).rejects.toThrow(/retract "all"/);
  });
});
