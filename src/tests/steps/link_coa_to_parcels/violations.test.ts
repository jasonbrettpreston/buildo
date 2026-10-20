// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9, §6.8, §6.11.1
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5, §8.1
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-W, R-BZ, R-DF, R-DL
//
// Phase 4 wave 4 — `link_coa_to_parcels` (scripts/link-coa-to-parcels.js), LINK: an address-tier cascade
// (bridge -> parcels exact -> name-only) from coa_applications to parcels, writing lead_parcels (guarded
// upsert + the coa-scoped ghost DELETE) and the coa_applications lat/lng/neighbourhood/parcel_linked_at
// back-fill; McDonald's Airtight V3 from ①. Commit form compressed (R-PACE-1): ① assessment + this
// suite, ② descriptor + compute + notes + seeds, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L16: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy
// text via `./fixtures/legacy-harness` (never source-text assertions), recording what the legacy script
// DOES so the conversion can prove it reproduced the same observables (Spec 123 §4.5), and pinning the
// three operator-RULED behaviour changes (2026-10-18, wave-4 plan question 10) in their LEGACY form.
// PART 2 = the CONVERTED claims D1–D9: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS (descriptor /
// compute / notes / registry) until ② and ③ land them.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, DEFAULT_LOGIC_VARS, type LegacyOracle, type LegacyOpts, type CoaRow, type ParcelRow } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/link-coa-to-parcels.descriptor.json';
const NOTES_REL = 'scripts/link-coa-to-parcels.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/link-coa-to-parcels.js';
const SHELL_REL = 'scripts/link-coa-to-parcels.js';
const REPORT_REL = 'docs/reports/2026-10-18-batch4-p4-2-link-coa-to-parcels-assessment.md';
/** Spec 42 §6.8 Phase D advisory lock (`link-coa-to-parcels.js:48`). */
const LOCK_ID = 4201;
const RUN_AT = new Date('2026-10-18T12:00:00Z');

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

function coa(over: Partial<CoaRow> = {}): CoaRow {
  return { id: 1, lead_id: 'coa:A0001/26TEY', street_num: '123', street_name_normalized: 'QUEEN', street_name: 'QUEEN ST E', ...over };
}
function parcel(over: Partial<ParcelRow> = {}): ParcelRow {
  return { id: 500, centroid_lat: '43.6500000', centroid_lng: '-79.3800000', geom: 'POLY', type_confirmed: true, ...over };
}

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy({ runAt: RUN_AT, ...opts });
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}
function meta(o: LegacyOracle): RecordsMeta {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[link_coa_to_parcels ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[link_coa_to_parcels ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[link_coa_to_parcels ①] audit row ' + metric + ' missing');
  return r;
}
function sqlOf(o: LegacyOracle, re: RegExp): { sql: string; params: unknown[]; via: string }[] {
  return o.queries.filter((q) => re.test(q.sql));
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJson<T = Record<string, unknown>>(rel: string): T {
  return JSON.parse(readText(rel)) as T;
}

const HAPPY: LegacyOpts = {
  coas: [coa()],
  bridge: { '123|QUEEN': parcel() },
  nhAt: { '-79.38,43.65': 77 },
  corpus: { total: 10, linked: 10, missing_normalized: 0 },
};

describe('link_coa_to_parcels ① — legacy oracle pins A: startup, config and the write-once eligibility (GREEN today)', () => {
  it('L1 — logic variables load and validate BEFORE the advisory lock 4201 is taken; an invalid set throws with no lock', async () => {
    const ok = await run(HAPPY);
    expect(ok.err).toBeNull();
    expect(ok.o.lockIds).toEqual([LOCK_ID]);
    expect(ok.o.events[0]).toBe('config');
    const bad = await run({ ...HAPPY, logicVars: { coa_unmatched_threshold_pct: 101 } });
    expect(bad.err?.message).toMatch(/^logicVars validation failed: coa_unmatched_threshold_pct/);
    expect(bad.o.lockIds).toEqual([]);
  });

  it('L2 — the tier confidences fall back to literals 0.95 / 0.80 when their variables are absent (the ?? fallbacks, :207-208)', async () => {
    const { o } = await run({ ...HAPPY, coas: [coa(), coa({ id: 2, lead_id: 'coa:B2', street_num: null, street_name_normalized: 'KING' })], byName: { KING: parcel({ id: 600 }) }, logicVars: { coa_unmatched_threshold_pct: 5 } });
    const ins = sqlOf(o, /^\s*INSERT INTO lead_parcels/);
    expect(ins.map((q) => [q.params[2], q.params[3]])).toEqual([['address_points_exact', 0.95], ['tier_1b_name_only', 0.8]]);
  });

  it('L3 — WRITE-ONCE (RULED to change, O4 row 7 copy): the count, pre-pass and batch SELECT all filter parcel_linked_at IS NULL, so a linked CoA is never re-checked', async () => {
    const { o } = await run(HAPPY);
    expect(sqlOf(o, /^\s*SELECT COUNT\(\*\)::int AS n FROM coa_applications/)[0]?.sql).toMatch(/WHERE parcel_linked_at IS NULL AND lead_id IS NOT NULL/);
    const batch = sqlOf(o, /^\s*SELECT ca\.id,/);
    expect(batch.length).toBe(2); // one page, then the empty page that ends the keyset loop
    expect(batch[0]?.sql).toMatch(/WHERE ca\.parcel_linked_at IS NULL\s+AND ca\.lead_id IS NOT NULL\s+AND ca\.street_name_normalized IS NOT NULL\s+AND ca\.id > \$1/);
    expect(batch.map((q) => q.params)).toEqual([[0, 1000], [1, 1000]]);
  });

  it('L4 — zero unprocessed: a NO_NEW_WORK summary with phase 11 (the main path says 42), corpus rows decide the verdict, emitMeta, and no write', async () => {
    const { o, err } = await run({ coas: [], corpus: { total: 100, linked: 90, missing_normalized: 2 } });
    expect(err).toBeNull();
    const t = meta(o).audit_table;
    expect(t?.phase).toBe(11);
    expect(t?.verdict).toBe('WARN');
    expect(rows(o).map((r) => r.metric)).toEqual(['status', 'reason', 'coa_corpus_total', 'coa_corpus_linked_count', 'coa_corpus_linked_pct', 'coa_corpus_unlinked_count', 'coa_corpus_missing_normalized_count']);
    expect(row(o, 'coa_corpus_linked_pct')).toMatchObject({ value: '90.0%', threshold: '>= 95%', status: 'WARN' });
    expect(row(o, 'coa_corpus_missing_normalized_count').status).toBe('WARN');
    expect(o.metas).toHaveLength(1);
    expect(sqlOf(o, /^\s*(INSERT|UPDATE|DELETE)/)).toHaveLength(0);
  });

  it('L5 — the pre-pass stamps every no-street_name_normalized CoA processed in one UPDATE, counted as no_address_data', async () => {
    const { o } = await run({ ...HAPPY, prePassCount: 3 });
    const pre = sqlOf(o, /^\s*UPDATE coa_applications\s+SET parcel_linked_at = \$1::timestamptz\s+WHERE parcel_linked_at IS NULL/);
    expect(pre).toHaveLength(1);
    expect(pre[0]?.params).toEqual([RUN_AT]);
    expect(pre[0]?.via).toBe('pool');
    expect(meta(o).no_address_data).toBe(3);
    expect(meta(o).coa_processed).toBe(4);
  });

  it('L6 — PostGIS is probed once, inside the lock, and the neighbourhoods are loaded with their geometry', async () => {
    const { o } = await run(HAPPY);
    expect(sqlOf(o, /pg_extension/)).toHaveLength(1);
    expect(sqlOf(o, /^SELECT id, neighbourhood_id, name, geometry FROM neighbourhoods WHERE geometry IS NOT NULL/)).toHaveLength(1);
  });
});

describe('link_coa_to_parcels ① — legacy oracle pins B: the cascade and the three writes (GREEN today)', () => {
  it('L7 — tier order: the address-points bridge first (address_points_exact), the parcels-table exact on a bridge miss (tier_1a_exact), name-only when street_num is blank (tier_1b_name_only)', async () => {
    const { o } = await run({
      coas: [coa({ id: 1 }), coa({ id: 2, lead_id: 'coa:B', street_num: '9', street_name_normalized: 'BAY' }), coa({ id: 3, lead_id: 'coa:C', street_num: '  ', street_name_normalized: 'KING' })],
      bridge: { '123|QUEEN': parcel({ id: 501 }) },
      exact: { '9|BAY': parcel({ id: 502 }) },
      byName: { KING: parcel({ id: 503 }) },
      corpus: { total: 3, linked: 3, missing_normalized: 0 },
    });
    expect(sqlOf(o, /^\s*INSERT INTO lead_parcels/).map((q) => [q.params[0], q.params[1], q.params[2]])).toEqual([
      ['coa:A0001/26TEY', 501, 'address_points_exact'],
      ['coa:B', 502, 'tier_1a_exact'],
      ['coa:C', 503, 'tier_1b_name_only'],
    ]);
    expect(meta(o)).toMatchObject({ tier_1a_exact: 2, tier_1a_via_bridge: 1, tier_1b_name_only: 1 });
  });

  it('L8 — the bridge query binds the parsed street TYPE from the raw street_name (LP-D9 port) and the bridge SQL text is coa-link-sql tier1aBridgeSql', async () => {
    const { o } = await run(HAPPY);
    const br = sqlOf(o, /FROM address_points ap/);
    expect(br).toHaveLength(1);
    expect(br[0]?.params).toEqual(['123', 'QUEEN', 'ST']);
    expect(br[0]?.sql).toMatch(/ST_Area\(p\.geom::geography\) ASC/);
    expect(meta(o)).toMatchObject({ tier_1a_type_confirmed: 1, tier_1a_type_tolerant: 0 });
  });

  it('L9 — PER-ROW SAVEPOINT (RULED to change -> set-based fail_fast): every row runs inside SAVEPOINT row_sp ... RELEASE, all rows of a batch in ONE transaction', async () => {
    const { o } = await run({ ...HAPPY, coas: [coa({ id: 1 }), coa({ id: 2, lead_id: 'coa:B' })], bridge: { '123|QUEEN': parcel() } });
    expect(o.txns()).toBe(1);
    expect(o.events.filter((e) => /SAVEPOINT/.test(e))).toEqual(['SAVEPOINT row_sp', 'RELEASE SAVEPOINT row_sp', 'SAVEPOINT row_sp', 'RELEASE SAVEPOINT row_sp']);
  });

  it('L10 — a poison row rolls back to its savepoint, is logged, counts per_row_errors (WARN), and the rest of the batch still commits', async () => {
    const { o, err } = await run({ ...HAPPY, coas: [coa({ id: 1, lead_id: 'coa:BAD' }), coa({ id: 2, lead_id: 'coa:OK' })], bridge: { '123|QUEEN': parcel() }, failLeadIds: ['coa:BAD'] });
    expect(err).toBeNull();
    expect(o.events).toContain('ROLLBACK TO SAVEPOINT row_sp');
    expect(o.events).toContain('UPDATE backfill 2');
    expect(o.events).not.toContain('UPDATE backfill 1');
    expect(row(o, 'per_row_errors')).toMatchObject({ value: 1, threshold: '== 0', status: 'WARN' });
    expect(o.logs.some((l) => l.level === 'warn' && String(l.args[1]).includes('lead_id=coa:BAD'))).toBe(true);
  });

  it('L11 — lead_parcels is a guarded upsert ON CONFLICT (lead_id, parcel_id) on match_type/confidence; a CoA whose match moves to another parcel keeps its old row (no per-lead retraction)', async () => {
    const { o } = await run(HAPPY);
    const ins = sqlOf(o, /^\s*INSERT INTO lead_parcels/);
    expect(ins[0]?.sql).toMatch(/ON CONFLICT \(lead_id, parcel_id\) DO UPDATE SET/);
    expect(ins[0]?.sql).toMatch(/WHERE lead_parcels\.match_type IS DISTINCT FROM EXCLUDED\.match_type\s+OR lead_parcels\.confidence IS DISTINCT FROM EXCLUDED\.confidence/);
    expect(ins[0]?.params).toEqual(['coa:A0001/26TEY', 500, 'address_points_exact', 0.95, RUN_AT]);
    // The only DELETE is the ghost sweep keyed on a vanished coa_applications row — never "the lead's other parcels".
    expect(sqlOf(o, /^\s*DELETE/).every((q) => /NOT EXISTS \(\s*SELECT 1 FROM coa_applications ca WHERE ca\.lead_id = lp\.lead_id/.test(q.sql))).toBe(true);
  });

  it('L12 — the back-fill writes lat/lng/neighbourhood_id/parcel_linked_at, IS DISTINCT FROM guarded; a no-match CoA is stamped only (marker), never left NULL', async () => {
    const { o } = await run({ ...HAPPY, coas: [coa({ id: 1 }), coa({ id: 2, lead_id: 'coa:NOPE', street_num: '1', street_name_normalized: 'NOWHERE' })] });
    const bf = sqlOf(o, /^\s*UPDATE coa_applications\s+SET latitude/);
    expect(bf).toHaveLength(1);
    expect(bf[0]?.params).toEqual([43.65, -79.38, 77, RUN_AT, 1]);
    expect(bf[0]?.sql).toMatch(/OR parcel_linked_at IS DISTINCT FROM \$4::timestamptz\)/);
    const stamp = sqlOf(o, /^\s*UPDATE coa_applications\s+SET parcel_linked_at = \$1::timestamptz\s+WHERE id = \$2/);
    expect(stamp.map((q) => q.params)).toEqual([[RUN_AT, 2]]);
    expect(meta(o)).toMatchObject({ no_parcel_match: 1, lat_lng_written: 1 });
  });

  it('L13 — neighbourhood by PostGIS ST_Contains on the parcel centroid, plus the centroid-outside-polygon audit', async () => {
    const { o } = await run({ ...HAPPY, centroidInside: false });
    expect(sqlOf(o, /^\s*SELECT id FROM neighbourhoods/)[0]?.params).toEqual([-79.38, 43.65]);
    expect(meta(o)).toMatchObject({ neighbourhood_matched: 1, centroid_outside_polygon: 1 });
    expect(row(o, 'centroid_outside_polygon_count')).toMatchObject({ value: 1, threshold: '<= 1% of matches', status: 'WARN' });
  });

  it('L14 — PostGIS/TURF FALLBACK (RULED to retire, R-W): without PostGIS the script lazy-loads Turf and finds the neighbourhood in JS', async () => {
    const square = { type: 'Polygon', coordinates: [[[-79.5, 43.6], [-79.3, 43.6], [-79.3, 43.7], [-79.5, 43.7], [-79.5, 43.6]]] };
    const { o, err } = await run({ ...HAPPY, postgis: false, nhoods: [{ id: 88, neighbourhood_id: 8, name: 'Sq', geometry: square }], bridge: { '123|QUEEN': parcel({ geom: null, geometry: square }) } });
    expect(err).toBeNull();
    expect(o.requiredModules).toContain('@turf/boolean-point-in-polygon');
    expect(sqlOf(o, /^\s*SELECT id FROM neighbourhoods/)).toHaveLength(0);
    expect(sqlOf(o, /^\s*UPDATE coa_applications\s+SET latitude/)[0]?.params[2]).toBe(88);
    // the JS path still sends the bridge SQL, which orders by ST_Area(p.geom::geography) — a PostGIS function.
    expect(sqlOf(o, /FROM address_points ap/)[0]?.sql).toMatch(/ST_Area\(p\.geom::geography\)/);
  });
});

describe('link_coa_to_parcels ① — legacy oracle pins C: retraction, audit and meta (GREEN today)', () => {
  it('L15 — the ghost sweep deletes coa-scoped orphans in LIMIT 1000 batches on the pool until a batch deletes 0', async () => {
    const { o } = await run({ ...HAPPY, ghosts: [1000, 7] });
    const del = sqlOf(o, /^\s*DELETE FROM lead_parcels/);
    expect(del.map((q) => q.params)).toEqual([[1000], [1000], [1000]]);
    expect(del[0]?.sql).toMatch(/lp\.lead_id LIKE 'coa:%'/);
    expect(del.every((q) => q.via === 'pool')).toBe(true);
    expect(meta(o).ghost_deleted).toBe(1007);
  });

  it('L16 — audit rows, order, literal thresholds (95 % neighbourhood, 1 % centroid) and the summary counts', async () => {
    const { o } = await run({ ...HAPPY, prePassCount: 1 });
    expect(rows(o).map((r) => r.metric)).toEqual([
      'coa_corpus_total', 'coa_corpus_linked_count', 'coa_corpus_linked_pct', 'coa_corpus_unlinked_count', 'coa_corpus_missing_normalized_count',
      'coa_processed', 'tier_1a_exact', 'tier_1a_via_bridge', 'tier_1a_type_confirmed', 'tier_1a_type_tolerant', 'tier_1b_name_only',
      'no_address_data', 'no_parcel_match', 'coa_parcels_linked_pct', 'unmatched_coa_count', 'coa_neighbourhood_coverage_pct',
      'coa_geocoded_pct', 'centroid_outside_polygon_count', 'ghost_orphans_cleaned', 'per_row_errors',
    ]);
    expect(meta(o).audit_table?.phase).toBe(42);
    expect(row(o, 'coa_neighbourhood_coverage_pct').threshold).toBe('>= 95%');
    expect(row(o, 'coa_parcels_linked_pct')).toMatchObject({ value: '50.0%', threshold: '>= 95%', status: 'WARN' });
    expect(row(o, 'unmatched_coa_count')).toMatchObject({ value: 1, threshold: '<= 5%' });
    const s = o.summaries[0];
    expect([s?.records_total, s?.records_new, s?.records_updated]).toEqual([2, 0, 1]);
    expect(o.metas[0]?.writes).toEqual({
      lead_parcels: ['lead_id', 'parcel_id', 'match_type', 'confidence', 'matched_at'],
      coa_applications: ['neighbourhood_id', 'latitude', 'longitude', 'parcel_linked_at'],
    });
    expect(Object.keys(o.metas[0]?.reads ?? {})).toEqual(['coa_applications', 'parcels', 'address_points', 'parcel_address_points', 'neighbourhoods']);
  });

  it('L17 — a contended lock returns with no SQL inside the lock and no summary (the SDK emits the SKIP)', async () => {
    const { o, err } = await run({ ...HAPPY, lockAcquired: false });
    expect(err).toBeNull();
    expect(o.queries).toHaveLength(0);
    expect(o.summaries).toHaveLength(0);
  });

  it('L18 — the frozen oracle text is byte-identical to the shipped script while it is still legacy (pipeline.run, not pipeline.step)', () => {
    const shell = readText(SHELL_REL);
    if (!/pipeline\.run\(/.test(shell)) return; // ② swapped the shell: the oracle stays frozen, this pin retires
    expect(readText('src/tests/steps/link_coa_to_parcels/fixtures/legacy-link-coa-to-parcels.js.txt')).toBe(shell);
    expect(Object.keys(DEFAULT_LOGIC_VARS)).toEqual(['coa_unmatched_threshold_pct', 'coa_parcel_conf_tier1a', 'coa_parcel_conf_tier1b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART 2 — the converted claims D1–D9. Commit ② (2026-10-19) lands at stage compute_ported (W4A-R6, operator y
// 2026-10-18; Spec 124 R-EF): descriptor, compute, notes and migration 272 (value-carrying COPIES of the legacy
// variables). The legacy shell stays the live step until ③ (the assert_coa_freshness ② ffec8296 form), so the
// frozen-shell half of D1 (D1b) flips at ③ with the shell swap, as does D9. D6 was re-stated at ②: the ghost batch
// literal is retired, not seeded — the converted step sweeps vanished leads with ONE statement after the loop
// (Spec 124 R-EG (5), 124:265), so no batch exists to tune; the assessment's literal ledger left exactly that to ②
// (§7: "or retired if link_full_retraction runs set-based; decided at ②"). D3/D4 read the scope where the schema
// declares it, outputs.writes[].write_discipline.scope (step.schema.json definitions.write is additionalProperties
// false; the ① draft read a write-level `scope` the schema has no slot for).
// ─────────────────────────────────────────────────────────────────────────────────────────────────
type Descriptor = {
  identity: { name: string; archetype: string; lock: number; spec: string };
  execution?: { shape?: string };
  outputs: { writes: Array<{ table: string; write_discipline?: { class?: string; scope?: string } }>; invalidates?: Array<{ table: string; column: string }> };
  staleness?: { mode_select?: string };
  guards?: { requires?: Array<{ kind: string; name: string }> };
  inputs?: { config?: Array<{ key?: string; name?: string }> } & Record<string, unknown>;
};

describe('link_coa_to_parcels — converted claims (D1/D2–D7 GREEN at ②; D1b at the R-EQ swap; D9 at ③)', () => {
  it('D1 — identity: descriptor exists, archetype LINK, lock 4201, spec "42" (flipped at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.identity).toMatchObject({ name: 'link_coa_to_parcels', archetype: 'LINK', lock: LOCK_ID, spec: '42' });
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
  });

  // FLIPPED at the Night P4 shell swap (Spec 124 R-EQ, operator y 2026-10-19: "A step whose ② landed at `compute_ported` moves to
  // `runner_wired` in its swap commit"): the frozen shell is the live writer from runner_wired; D9 (converted[]) stays at ③.
  it('D1b — frozen shell: pipeline.step(), not pipeline.run() (flipped at the R-EQ shell swap, stage runner_wired)', () => {
    const shell = readText(SHELL_REL);
    expect(shell).toMatch(/pipeline\.step\(/);
    expect(shell).not.toMatch(/pipeline\.run\(/);
  });

  it('D2 — RULED re-check every run (O4 row 7 copy, operator 2026-10-18): staleness.mode_select "none", a parcel_linked_at invalidator, and no parcel_linked_at IS NULL filter in compute (flipped at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.staleness?.mode_select).toBe('none');
    expect((d.outputs.invalidates ?? []).some((i) => i.table === 'coa_applications' && i.column === 'parcel_linked_at')).toBe(true);
    expect(readText(COMPUTE_REL)).not.toMatch(/parcel_linked_at IS NULL/);
  });

  it('D3 — lead_parcels: every write and retraction is scoped lead_id LIKE \'coa:%\' (the permit mirror trigger co-writes the table) with a per-lead retraction of departed parcels; both targets carry rls_bypass_or_policy (flipped at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const lp = d.outputs.writes.filter((w) => w.table === 'lead_parcels');
    expect(lp.length).toBeGreaterThan(0);
    expect(lp.every((w) => (w.write_discipline?.scope ?? '').includes("lead_id LIKE 'coa:%'"))).toBe(true);
    expect(lp.some((w) => w.write_discipline?.class === 'link_full_retraction')).toBe(true);
    const rls = (d.guards?.requires ?? []).filter((r) => r.kind === 'rls_bypass_or_policy').map((r) => r.name).sort();
    expect(rls).toEqual(['coa_applications', 'lead_parcels']);
  });

  it('D4 — the coa_applications back-fill fires only for a CoA whose parcel link CHANGED this run, so link_coa\'s permit-inherited lat/lng (26,723 rows measured) is never ping-ponged (flipped at ②)', () => {
    const notes = readText(NOTES_REL);
    expect(notes).toMatch(/link_coa/);
    expect(notes).toMatch(/changed this run/);
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const bf = d.outputs.writes.filter((w) => w.table === 'coa_applications');
    expect(bf.length).toBe(1);
    expect(bf[0]?.write_discipline?.scope ?? '').toMatch(/link changed/);
  });

  it('D5 — RULED retirements: no SAVEPOINT anywhere, no Turf and no JS point-in-polygon in compute (R-W), and guards.requires extension postgis (flipped at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/SAVEPOINT/);
    expect(src).not.toMatch(/@turf|pointInGeoJSON|haversine/);
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect((d.guards?.requires ?? []).some((r) => r.kind === 'extension' && r.name === 'postgis')).toBe(true);
  });

  it('D6 — EXTERNALIZED (R-DF): no ?? 0.95 / ?? 0.80 fallback, no 1000 / 0.95 literal; the 95 % neighbourhood floor and the 1 % centroid ceiling are registered link_coa_to_parcels_* variables seeded by migration 272, and the ghost batch is retired with the batched sweep (flipped at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/\?\?\s*0\.(95|80?)\b/);
    expect(src).not.toMatch(/\b1000\b|0\.95\b/);
    const seeds = readText('scripts/seeds/logic_variables.json');
    for (const k of ['link_coa_to_parcels_neighbourhood_coverage_min_pct', 'link_coa_to_parcels_centroid_outside_max_pct']) {
      expect(seeds).toContain(k);
    }
    expect(seeds).not.toContain('link_coa_to_parcels_ghost_batch_size');
    expect(readText('migrations/272_link_coa_to_parcels_logic_variables.sql')).toContain('link_coa_to_parcels_centroid_outside_max_pct');
  });

  it('D7 — compute is pure (R-BZ): no Date.now, no .query(, no withTransaction / withAdvisoryLock, no pipeline require (flipped at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/Date\.now\(|\.query\(|withTransaction|withAdvisoryLock|require\(['"]\.\.\/pipeline['"]\)/);
  });

  // FLIPPED at RE-FREEZE #37 / replay night N1 (operator y 2026-10-19): step-validate --all --write writes the generated
  // scorecard into the assessment report of EVERY registry step — converted[] and pending[] alike, red_suite included —
  // as designed by Spec 124 R-R / Rule 13 (step-validate.mjs is the ONE command that generates the Spec 123 §6
  // scorecard, over the registry derived from converted.json + pending). The block now exists before ②.
  it('D8 — the assessment report carries the generated validation scorecard (written by step-validate --all --write at N1, R-R / Rule 13)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D9 — registered: census archetype LINK and converted.json converted[] holds scripts/link-coa-to-parcels.js (③) (flips at ③)', () => {
    const conv = readJson<{ converted: string[] }>('scripts/steps/_schema/converted.json');
    expect(conv.converted).toContain(SHELL_REL);
  });
});
