// SPEC LINK: docs/specs/01-pipeline/51_source_coa.md §3
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-DF, R-DL
//
// Phase 4 wave 1 — `coa` (scripts/load-coa.js), INGESTOR: two CKAN DataStore resources → coa_applications
// (+ lifecycle_status_history ledger rows); McDonald's Airtight V3 from ①. Commit form compressed
// (R-PACE-1): ① assessment + this suite, ② descriptor + compute + notes + shell + seeds, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L24: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM
// legacy text via `./fixtures/legacy-harness` (never source-text assertions), recording what the legacy
// script DOES so the conversion can prove it reproduced the same observables (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D8: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS (descriptor /
// compute / notes / shell / registry) until ② and ③ land them.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { loadLegacy, ACTIVE_ID, CLOSED_ID, type LegacyOracle, type LegacyOpts, type CkanRecord } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/load-coa.descriptor.json';
const NOTES_REL = 'scripts/load-coa.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-coa.js';
const SHELL_REL = 'scripts/load-coa.js';
const REPORT_REL = 'docs/reports/2026-10-17-batch4-p1-2-coa-assessment.md';
/** Spec 47 §A.5 advisory lock of the legacy loader (`load-coa.js:432`). */
const LOCK_ID = 95;
const RUN_AT = new Date('2026-10-17T12:00:00Z');

/** One named §9 audit row. */
interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

/** A CKAN record with every CRITICAL field present. */
function rec(over: Partial<CkanRecord> = {}): CkanRecord {
  return {
    _id: 1,
    'REFERENCE_FILE#': 'A0001/26TEY',
    C_OF_A_DESCISION: 'Approved',
    STATUSDESC: 'Hearing Scheduled',
    HEARING_DATE: '2026-10-01',
    STREET_NUM: '123',
    STREET_NAME: 'QUEEN',
    STREET_TYPE: 'ST',
    STREET_DIRECTION: 'E',
    WARD: '10',
    DESCRIPTION: 'To permit a rear addition.',
    SUB_TYPE: 'Minor Variance',
    ZONING_DESIGNATION: 'RD (f12.0; a370) (x5)',
    APPEAL_EXPIRY_DATE: '2026-10-21',
    ...over,
  };
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
  if (last === undefined) throw new Error('[coa ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[coa ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[coa ①] audit row ' + metric + ' missing');
  return r;
}
function sqlOf(o: LegacyOracle, re: RegExp): { sql: string; params: unknown[]; via: string }[] {
  return o.queries.filter((q) => re.test(q.sql));
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('coa ① — legacy oracle pins A: acquisition (GREEN today)', () => {
  it('L1 — incremental mode reads ONLY the Active resource, one page of 10000 from offset 0', async () => {
    const { o, err } = await run({ records: { [ACTIVE_ID]: [rec()] } });
    expect(err).toBeNull();
    expect(o.fetchUrls).toHaveLength(1);
    const u = new URL(o.fetchUrls[0] ?? '');
    expect(u.pathname).toBe('/api/3/action/datastore_search');
    expect(u.searchParams.get('resource_id')).toBe(ACTIVE_ID);
    expect(u.searchParams.get('limit')).toBe('10000');
    expect(u.searchParams.get('offset')).toBe('0');
  });

  it('L2 — full mode reads Active then Closed, in that order', async () => {
    const { o } = await run({ full: true, records: { [ACTIVE_ID]: [rec()], [CLOSED_ID]: [rec({ 'REFERENCE_FILE#': 'B0002/24TEY' })] } });
    expect(o.fetchUrls.map((x) => new URL(x).searchParams.get('resource_id'))).toEqual([ACTIVE_ID, CLOSED_ID]);
  });

  it('L3 — pagination continues while a page is full (10000) and stops on a short page', async () => {
    const many = Array.from({ length: 10001 }, (_, i) => rec({ 'REFERENCE_FILE#': 'A' + String(i).padStart(5, '0') + '/26TEY' }));
    const { o } = await run({ records: { [ACTIVE_ID]: many } });
    expect(o.fetchUrls.map((x) => new URL(x).searchParams.get('offset'))).toEqual(['0', '10000']);
  });

  it('L4 — a failed request retries with 2000·2^(n-1) ms backoff, and three failures throw with api_errors 1', async () => {
    const ok = await run({ records: { [ACTIVE_ID]: [rec()] }, fetchPlan: { [ACTIVE_ID]: [{ status: 500 }] } });
    expect(ok.err).toBeNull();
    expect(ok.o.delays).toEqual([2000]);
    const bad = await run({ records: { [ACTIVE_ID]: [rec()] }, fetchPlan: { [ACTIVE_ID]: [{ status: 500 }, { success: false }, { throwError: true }] } });
    expect(bad.err?.message).toBe('network boom');
    expect(bad.o.delays).toEqual([2000, 4000]);
    expect(bad.o.summaries).toHaveLength(0);
  });

  it('L5 — zero records: WARN summary with a SKIPPED row, emitMeta, and no write at all', async () => {
    const { o, err } = await run({ records: { [ACTIVE_ID]: [] } });
    expect(err).toBeNull();
    expect(meta(o).audit_table?.verdict).toBe('WARN');
    expect(rows(o).map((r) => [r.metric, r.value])).toEqual([
      ['status', 'SKIPPED'],
      ['reason', 'Zero records returned from CKAN — possible API outage or empty dataset'],
    ]);
    expect(o.metas).toHaveLength(1);
    expect(sqlOf(o, /INSERT|UPDATE|VACUUM/)).toHaveLength(0);
  });

  it('L6 — schema drift: a record missing a CRITICAL field aborts before any write and throws', async () => {
    const drifted = rec();
    delete drifted.STATUSDESC;
    const { o, err } = await run({ records: { [ACTIVE_ID]: [drifted] } });
    expect(err?.message).toBe('Schema drift detected: STATUSDESC');
    expect(o.summaries).toHaveLength(1);
    expect(o.summaries[0]?.records_total).toBe(0);
    expect((meta(o).data_health as Record<string, unknown>).schema_drift).toEqual(['STATUSDESC']);
    expect(sqlOf(o, /INSERT|UPDATE|VACUUM/)).toHaveLength(0);
  });
});

describe('coa ① — legacy oracle pins B: mapping and dedup (GREEN today)', () => {
  it('L7 — mapRecord composes "123 QUEEN ST E", ward from WARD_NUMBER||WARD, decision_date from FINALDATE||APPEAL_EXPIRY_DATE', () => {
    const o = loadLegacy();
    const mapRecord = o.helpers.mapRecord as (raw: CkanRecord, drift: string[]) => { record: Record<string, unknown> | null; skipReason: string | null };
    const a = mapRecord(rec(), []).record ?? {};
    expect(a.address).toBe('123 QUEEN ST E');
    expect(a.street_name).toBe('QUEEN ST E');
    expect(a.ward).toBe('10');
    expect((a.decision_date as Date).toISOString()).toBe('2026-10-21T00:00:00.000Z');
    const b = mapRecord(rec({ WARD: undefined, WARD_NUMBER: '7', FINALDATE: '2026-11-05T00:00:00' }), []).record ?? {};
    expect(b.ward).toBe('7');
    expect((b.decision_date as Date).getTime()).toBe(Date.parse('2026-11-05T00:00:00'));
  });

  it('L8 — the row hash covers the MAPPED fields (sorted keys), never the raw CKAN _id', () => {
    const o = loadLegacy();
    const mapRecord = o.helpers.mapRecord as (raw: CkanRecord, drift: string[]) => { record: Record<string, unknown> | null };
    const a = mapRecord(rec({ _id: 1 }), []).record ?? {};
    const b = mapRecord(rec({ _id: 999 }), []).record ?? {};
    expect(a.data_hash).toBe(b.data_hash);
    const fields: Record<string, unknown> = { ...a };
    delete fields.data_hash;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(fields).sort()) sorted[k] = fields[k];
    expect(a.data_hash).toBe(crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex'));
  });

  it('L9 — a blank REFERENCE_FILE# is skipped as missing_app_num; ZONING_DESIGNATION absent is null, not drift', async () => {
    const { o } = await run({ records: { [ACTIVE_ID]: [rec(), rec({ 'REFERENCE_FILE#': '  ' }), rec({ 'REFERENCE_FILE#': 'A0009/26TEY', ZONING_DESIGNATION: undefined })] } });
    const dh = meta(o).data_health as Record<string, unknown>;
    expect(dh.skip_reasons).toEqual({ missing_app_num: 1 });
    expect(dh.schema_mismatch_count).toBe(0);
    expect(row(o, 'records_skipped').value).toBe(1);
  });

  it('L10 — dedup by application_number keeps the record with the later decision_date', async () => {
    const { o } = await run({ full: true, records: {
      [ACTIVE_ID]: [rec({ APPEAL_EXPIRY_DATE: '2026-01-01', STATUSDESC: 'Hearing Scheduled' })],
      [CLOSED_ID]: [rec({ APPEAL_EXPIRY_DATE: undefined, FINALDATE: '2026-03-01T00:00:00', STATUSDESC: 'Closed' })],
    } });
    const ins = sqlOf(o, /^\s*INSERT INTO coa_applications/)[0];
    expect((ins?.params[6] as string[])).toEqual(['Closed']);
    expect((meta(o).data_health as Record<string, unknown>).records_deduplicated).toBe(1);
  });
});

describe('coa ① — legacy oracle pins C: writes (GREEN today)', () => {
  it('L11 — one txn per 500-row batch; the upsert is change-guarded (data_hash IS DISTINCT FROM) with 16 params', async () => {
    const recs = Array.from({ length: 501 }, (_, i) => rec({ 'REFERENCE_FILE#': 'A' + String(i).padStart(4, '0') + '/26TEY' }));
    const { o } = await run({ records: { [ACTIVE_ID]: recs } });
    expect(o.txns()).toBe(2);
    const ups = sqlOf(o, /^\s*INSERT INTO coa_applications/);
    expect(ups).toHaveLength(2);
    expect(ups[0]?.via).toBe('client');
    expect(ups[0]?.params).toHaveLength(16);
    expect(ups[0]?.params[15]).toBe(RUN_AT);
    expect(ups[0]?.sql).toContain('WHERE coa_applications.data_hash IS DISTINCT FROM EXCLUDED.data_hash');
    expect((ups[0]?.params[0] as string[]).length).toBe(500);
  });

  it('L12 — dates bind as $9/$10::timestamptz[] into DATE columns (correct only under a UTC session)', async () => {
    const { o } = await run({ records: { [ACTIVE_ID]: [rec()] } });
    const ins = sqlOf(o, /^\s*INSERT INTO coa_applications/)[0];
    expect(ins?.sql).toContain('unnest($9::timestamptz[])');
    expect(ins?.sql).toContain('unnest($10::timestamptz[])');
    expect(((ins?.params[9] as Date[])[0] as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('L13 — records_new / records_updated come from RETURNING (xmax = 0); an unchanged row returns nothing', async () => {
    const { o } = await run({
      records: { [ACTIVE_ID]: [rec({ 'REFERENCE_FILE#': 'N1' }), rec({ 'REFERENCE_FILE#': 'U1' }), rec({ 'REFERENCE_FILE#': 'S1' })] },
      existing: ['U1', 'S1'], unchanged: ['S1'],
    });
    expect(o.summaries[0]?.records_new).toBe(1);
    expect(o.summaries[0]?.records_updated).toBe(1);
    expect(o.summaries[0]?.records_total).toBe(2);
  });

  it('L14 — a status change writes one lifecycle_status_history row (lead coa:<app>, event_date by status group) inside a SAVEPOINT', async () => {
    const { o } = await run({ records: { [ACTIVE_ID]: [rec({ STATUSDESC: 'Hearing Scheduled' })] }, prevStatus: { 'A0001/26TEY': 'Accepted' } });
    const seq = o.queries.filter((q) => q.via === 'client').map((q) => q.sql.trim().split(/\s+/).slice(0, 3).join(' '));
    expect(seq).toEqual(['SELECT application_number, status', 'INSERT INTO coa_applications', 'SAVEPOINT ledger_write', 'INSERT INTO lifecycle_status_history', 'RELEASE SAVEPOINT ledger_write']);
    const led = sqlOf(o, /^\s*INSERT INTO lifecycle_status_history/)[0];
    expect(led?.params[0]).toEqual(['coa:A0001/26TEY']);
    expect(led?.params[1]).toEqual(['Accepted']);
    expect(led?.params[2]).toEqual(['Hearing Scheduled']);
    expect(led?.params[6]).toEqual(['load-coa.js']);
    expect(((led?.params[7] as Date[])[0] as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(row(o, 'lifecycle_status_history_inserted').value).toBe(1);
  });

  it('L15 — an unchanged status writes no ledger row; a status outside the 8-status map gets event_date null', async () => {
    const same = await run({ records: { [ACTIVE_ID]: [rec()] }, prevStatus: { 'A0001/26TEY': 'Hearing Scheduled' } });
    expect(sqlOf(same.o, /lifecycle_status_history/)).toHaveLength(0);
    const other = await run({ records: { [ACTIVE_ID]: [rec({ STATUSDESC: 'Postponed' })] } });
    const led = sqlOf(other.o, /^\s*INSERT INTO lifecycle_status_history/)[0];
    expect(led?.params[1]).toEqual([null]);
    expect(led?.params[7]).toEqual([null]);
  });

  it('L16 — a ledger failure rolls back to the SAVEPOINT, keeps the upsert, and turns the verdict WARN', async () => {
    const { o, err } = await run({ records: { [ACTIVE_ID]: [rec()] }, ledgerFail: true });
    expect(err).toBeNull();
    expect(sqlOf(o, /ROLLBACK TO SAVEPOINT ledger_write/)).toHaveLength(1);
    expect(row(o, 'lifecycle_status_history_errors')).toMatchObject({ value: 1, status: 'WARN' });
    expect(meta(o).audit_table?.verdict).toBe('WARN');
  });

  it('L17 — every seen row gets last_seen_at = RUN_AT in 500-id slices, guarded by IS DISTINCT FROM, on the POOL (outside the batch txn)', async () => {
    const { o } = await run({ records: { [ACTIVE_ID]: [rec()] } });
    const upd = sqlOf(o, /^\s*UPDATE coa_applications/);
    expect(upd).toHaveLength(1);
    expect(upd[0]?.via).toBe('pool');
    expect(upd[0]?.params).toEqual([RUN_AT, ['A0001/26TEY']]);
    expect(upd[0]?.sql).toContain('last_seen_at IS DISTINCT FROM $1::timestamptz');
  });

  it('L18 — the loader issues VACUUM ANALYZE coa_applications itself, then a log-only stats SELECT with NOW() - INTERVAL \'90 days\'', async () => {
    const { o } = await run({ records: { [ACTIVE_ID]: [rec()] } });
    const tail = o.queries.slice(-2).map((q) => q.sql.trim());
    expect(tail[0]).toBe('VACUUM ANALYZE coa_applications');
    expect(tail[1]).toContain("NOW() - INTERVAL '90 days'");
  });
});

describe('coa ① — legacy oracle pins D: audit, meta, lock (GREEN today)', () => {
  it('L19 — the §9 audit rows, in order', async () => {
    const { o } = await run({ records: { [ACTIVE_ID]: [rec()] } });
    expect(rows(o).map((r) => r.metric)).toEqual([
      'records_fetched', 'records_mapped', 'records_skipped', 'skip_rate', 'records_inserted', 'records_updated',
      'api_errors', 'avg_latency_ms', 'schema_mismatch_count', 'max_days_stale', 'applicant_names_present',
      'zoning_designation_null', 'lifecycle_status_history_inserted', 'lifecycle_status_history_errors',
    ]);
    expect(meta(o).audit_table).toMatchObject({ phase: 2, name: 'CoA Ingestion', verdict: 'PASS' });
  });

  it('L20 — skip_rate FAILs at exactly 5% (>= 5), threshold text "< 5%"', async () => {
    const recs = [...Array.from({ length: 19 }, (_, i) => rec({ 'REFERENCE_FILE#': 'K' + i })), rec({ 'REFERENCE_FILE#': '' })];
    const { o } = await run({ records: { [ACTIVE_ID]: recs } });
    expect(row(o, 'skip_rate')).toMatchObject({ value: '5.0%', threshold: '< 5%', status: 'FAIL' });
    expect(meta(o).audit_table?.verdict).toBe('FAIL');
  });

  it('L21 — max_days_stale WARNs at >= 45 days from the frozen clock, but the log line fires only at > 45 (boundary differs)', async () => {
    const at45 = await run({ records: { [ACTIVE_ID]: [rec({ HEARING_DATE: '2026-09-02' })] }, nowMs: Date.parse('2026-10-17T00:00:00Z') });
    expect(row(at45.o, 'max_days_stale')).toMatchObject({ value: 45, status: 'WARN' });
    expect(at45.o.logs.some((l) => l.level === 'warn' && String(l.args[1]).startsWith('Portal rot warning'))).toBe(false);
    const at46 = await run({ records: { [ACTIVE_ID]: [rec({ HEARING_DATE: '2026-09-01' })] }, nowMs: Date.parse('2026-10-17T00:00:00Z') });
    expect(at46.o.logs.some((l) => l.level === 'warn' && String(l.args[1]).startsWith('Portal rot warning'))).toBe(true);
  });

  it('L22 — applicant_names_present WARNs on any CONTACT_NAME; zoning_designation_null WARNs only when EVERY row is null', async () => {
    const named = await run({ records: { [ACTIVE_ID]: [rec({ CONTACT_NAME: 'Someone' })] } });
    expect(row(named.o, 'applicant_names_present').status).toBe('WARN');
    const allNull = await run({ records: { [ACTIVE_ID]: [rec({ ZONING_DESIGNATION: null })] } });
    expect(row(allNull.o, 'zoning_designation_null')).toMatchObject({ value: 1, status: 'WARN' });
    const oneNull = await run({ records: { [ACTIVE_ID]: [rec({ ZONING_DESIGNATION: null }), rec({ 'REFERENCE_FILE#': 'Z2' })] } });
    expect(row(oneNull.o, 'zoning_designation_null')).toMatchObject({ value: 1, status: 'PASS' });
  });

  it('L23 — emitMeta reads {CKAN API, coa_applications[application_number,status]} and writes coa_applications + lifecycle_status_history', async () => {
    const { o } = await run({ records: { [ACTIVE_ID]: [rec()] } });
    expect(o.metas).toHaveLength(1);
    expect(Object.keys(o.metas[0]?.reads ?? {})).toEqual(['CKAN API', 'coa_applications']);
    expect(o.metas[0]?.reads.coa_applications).toEqual(['application_number', 'status']);
    expect(Object.keys(o.metas[0]?.writes ?? {})).toEqual(['coa_applications', 'lifecycle_status_history']);
    expect(o.metas[0]?.writes.lifecycle_status_history).toEqual(['lead_id', 'from_status', 'to_status', 'decision', 'decision_date', 'transitioned_at', 'detected_by', 'event_date']);
  });

  it('L24 — advisory lock 95; when not acquired, nothing is fetched or written', async () => {
    const held = await run({ records: { [ACTIVE_ID]: [rec()] }, lockAcquired: false });
    expect(held.o.lockIds).toEqual([LOCK_ID]);
    expect(held.o.fetchUrls).toHaveLength(0);
    expect(held.o.queries).toHaveLength(0);
    expect(held.o.summaries).toHaveLength(0);
  });
});

// PART 2 — the converted claims D1–D8 (`it.fails` at ①). Each is RED as a NAMED MISSING ARTIFACT or a
// named legacy fact the conversion removes, never as a TS/import error. They flip to `it` at ② (D1–D7)
// and ③ (D8).
interface Descriptor {
  identity: { name: string; archetype: string; spec: string; lock: number };
  execution: { shape: string };
  inputs: { reads: { externals: { id: string; url: string }[] } };
  outputs: { writes: { table: string }[] };
  guards: { requires?: { kind: string; name: string }[] };
  config: { logic_variables: { name: string }[] };
}
function loadDescriptor(): Descriptor {
  return JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
}

describe('coa ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype INGESTOR, lock 95, spec "51", shape "ingest"; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.identity).toMatchObject({ name: 'coa', archetype: 'INGESTOR', spec: '51', lock: LOCK_ID });
    expect(d.execution.shape).toBe('ingest');
    expect(readText(NOTES_REL).length).toBeGreaterThan(0);
    const shell = readText(SHELL_REL);
    expect(shell).toContain('pipeline.step(');
    expect(shell).not.toContain('pipeline.run(');
  });

  it.fails('D2 — two CKAN externals (Active, Closed) with declared urls; no http(s) literal in compute (G10) (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.inputs.reads.externals.map((e) => e.id).sort()).toEqual(['coa_active', 'coa_closed']);
    expect(readText(COMPUTE_REL)).not.toMatch(/https?:\/\//);
  });

  it.fails('D3 — both write targets declared, each with an rls_bypass_or_policy requirement (R-CT; both tables have RLS on) (flips at ②)', () => {
    const d = loadDescriptor();
    expect(d.outputs.writes.map((w) => w.table).sort()).toEqual(['coa_applications', 'lifecycle_status_history']);
    const req = (d.guards.requires ?? []).filter((r) => r.kind === 'rls_bypass_or_policy').map((r) => r.name).sort();
    expect(req).toEqual(['coa_applications', 'lifecycle_status_history']);
  });

  it.fails('D4 — every legacy literal is a registered logic variable (R-DF EXTERNALIZED): batch, page size, retries, backoff, skip-rate and staleness bounds (flips at ②)', () => {
    const names = loadDescriptor().config.logic_variables.map((v) => v.name);
    for (const n of ['coa_batch_size', 'coa_page_size', 'coa_download_retries', 'coa_download_retry_backoff_ms', 'coa_skip_rate_max_pct', 'coa_max_days_stale_warn']) {
      expect(names).toContain(n);
    }
  });

  it.fails('D5 — compute is pure (R-BZ): no Date.now, no VACUUM, no SAVEPOINT, no direct .query DML, no NOW()/INTERVAL literal (flips at ②)', () => {
    const c = readText(COMPUTE_REL);
    expect(c).not.toMatch(/Date\.now\(/);
    expect(c).not.toMatch(/VACUUM|SAVEPOINT/);
    expect(c).not.toMatch(/\.query\(\s*`?\s*(INSERT|UPDATE|DELETE)/);
    expect(c).not.toMatch(/NOW\(\)|INTERVAL '/);
  });

  it.fails('D6 — dates bind as ::date (never ::timestamptz into a DATE column), so the stored date does not depend on the session TimeZone (flips at ②)', () => {
    expect(readText(COMPUTE_REL)).not.toMatch(/timestamptz\[\]\)\s*,?\s*--?\s*(hearing|decision)|unnest\(\$\d+::timestamptz\[\]\)/);
  });

  it.fails('D7 — the assessment report carries the generated validation scorecard (flips at ②)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D8 — registered: census archetype INGESTOR and converted.json converted[] holds scripts/load-coa.js (③) (flips at ③)', () => {
    const conv = JSON.parse(readText('scripts/steps/_schema/converted.json')) as { converted: unknown[] };
    expect(JSON.stringify(conv.converted)).toContain('scripts/load-coa.js');
    const census = readText('scripts/steps/_schema/step-archetype-census.json');
    expect(census).toMatch(/"slug": "coa",\s*"file": "scripts\/load-coa.js",\s*"archetype": "INGESTOR"/);
  });
});
