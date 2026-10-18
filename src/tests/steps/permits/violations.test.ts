// SPEC LINK: docs/specs/01-pipeline/50_source_permits.md §3
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1–13, R-BZ, R-CT, R-CU, R-DF, R-DL
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §A.5 (lock 2)
//
// Phase 4 wave 1 — `permits` (scripts/load-permits.js), the permits-chain root. Proposed archetype
// INGESTOR (one CKAN DataStore resource → `permits` + the `lifecycle_status_history` ledger). Converted
// to McDonald's Airtight V3 from ①: zero purity findings (R-BZ), every gate hard (R-BA), every value
// externalized (R-DF EXTERNALIZED), visible in the admin surface (R-DL).
// PART 1 = the legacy ORACLE PINS L1–L13: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy
// text via `./fixtures/legacy-harness` (never source-text assertions), recording what the legacy script
// DOES so the conversion can prove it reproduced the same observables (Spec 123 §4.5).
// PART 2 = the CONVERTED claims D1–D9: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS until ② lands
// them — flipped to plain `it(...)` at ②.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, type LegacyOpts, type LegacyOracle, type CkanRecord } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/load-permits.descriptor.json';
const NOTES_REL = 'scripts/load-permits.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/load-permits.js';
const SHELL_REL = 'scripts/load-permits.js';
const SEEDS_REL = 'scripts/seeds/logic_variables.json';
/** Spec 47 §A.5 lock registry row 2 [READ scripts/load-permits.js]. */
const LOCK_ID = 2;
/** The CKAN resource id of Toronto Open Data "Building Permits — Active Permits". */
const RESOURCE_ID = '6d0229af-bc54-46de-9c2b-26759b01dd05';

/** A complete CKAN record carrying every CRITICAL_FIELDS key. */
function rec(n: string, rev: string, over: Partial<CkanRecord> = {}): CkanRecord {
  return {
    _id: Number(n.replace(/\D/g, '').slice(-6)) || 1,
    PERMIT_NUM: n,
    REVISION_NUM: rev,
    STATUS: 'Permit Issued',
    PERMIT_TYPE: 'Small Residential Projects',
    STREET_NUM: '10',
    STREET_NAME: 'MAIN',
    STREET_TYPE: 'ST',
    RESIDENTIAL: '120',
    ISSUED_DATE: '2026-09-01T00:00:00',
    APPLICATION_DATE: '2026-05-01T00:00:00',
    ...over,
  };
}

async function run(opts: LegacyOpts = {}): Promise<{ o: LegacyOracle; err: Error | null }> {
  const o = loadLegacy(opts);
  try {
    await o.runMain();
    return { o, err: null };
  } catch (err) {
    return { o, err: err as Error };
  }
}

type AuditRow = { metric: string; value: unknown; threshold: string | null; status: string };
function rows(o: LegacyOracle): AuditRow[] {
  const last = o.summaries[o.summaries.length - 1];
  if (last === undefined) throw new Error('[permits] emitSummary() was never called');
  const t = (last.records_meta as { audit_table?: { rows?: AuditRow[] } }).audit_table;
  if (!t || !Array.isArray(t.rows)) throw new Error('[permits] records_meta.audit_table.rows[] missing');
  return t.rows;
}
const sqls = (o: LegacyOracle, re: RegExp) => o.queries.filter((q) => re.test(q.sql));

describe('PART 1 — legacy oracle pins (GREEN today, Spec 123 §4.5)', () => {
  it('L1 — one advisory lock, id 2 (Spec 47 §A.5 row 2)', async () => {
    const { o } = await run({ records: [rec('26 100001 BLD', '00')] });
    expect(o.lockIds).toEqual([LOCK_ID]);
  });

  it('L2 — CKAN DataStore pagination: resource 6d0229af…, limit 10000, offset 0 (bare literal page size)', async () => {
    const { o } = await run({ records: [rec('26 100001 BLD', '00')] });
    expect(o.fetchUrls).toEqual([
      `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?resource_id=${RESOURCE_ID}&limit=10000&offset=0`,
    ]);
  });

  it('L3 — schema drift: a first page missing RESIDENTIAL emits a drift summary and throws', async () => {
    const r = rec('26 100001 BLD', '00');
    delete r.RESIDENTIAL;
    const { o, err } = await run({ records: [r] });
    expect(err?.message).toBe('Schema drift detected: RESIDENTIAL');
    const meta = o.summaries[0]?.records_meta as { data_health: { schema_drift: string[] } };
    expect(meta.data_health.schema_drift).toEqual(['RESIDENTIAL']);
    expect(sqls(o, /INSERT INTO permits/)).toHaveLength(0);
  });

  it('L4 — the §9 audit rows, in order, and records_total = new + updated', async () => {
    const { o } = await run({ records: [rec('26 100001 BLD', '00'), rec('26 100002 BLD', '00')], priorStatus: { '26 100002 BLD--00': 'Permit Issued' } });
    expect(rows(o).map((r) => r.metric)).toEqual([
      'records_fetched', 'records_mapped', 'records_errors', 'records_deduplicated', 'records_inserted',
      'records_updated', 'records_unchanged', 'api_errors', 'avg_latency_ms', 'schema_drift',
      'lifecycle_status_history_inserted', 'lifecycle_status_history_errors',
    ]);
    const s = o.summaries[o.summaries.length - 1]!;
    expect(s.records_new).toBe(1);
    expect(s.records_updated).toBe(1);
    expect(s.records_total).toBe(2);
  });

  it('L5 — records_fetched is judged against a bare literal floor ">= 200000" (FAIL on a 2-row feed)', async () => {
    const { o } = await run({ records: [rec('26 100001 BLD', '00'), rec('26 100002 BLD', '00')] });
    const r = rows(o).find((x) => x.metric === 'records_fetched')!;
    expect(r.threshold).toBe('>= 200000');
    expect(r.status).toBe('FAIL');
  });

  it('L6 — the permits upsert: 40 bound columns per row, data_hash IS DISTINCT FROM guard, enriched_status clear', async () => {
    const { o } = await run({ records: [rec('26 100001 BLD', '00')] });
    const up = sqls(o, /^\s*INSERT INTO permits \(/);
    expect(up).toHaveLength(1);
    const cols = /INSERT INTO permits \(([^)]+)\)/.exec(up[0]!.sql)![1]!.split(',');
    expect(cols).toHaveLength(40);
    expect(up[0]!.sql).toContain('WHERE permits.data_hash IS DISTINCT FROM EXCLUDED.data_hash');
    expect(up[0]!.sql).toContain("enriched_status = CASE WHEN EXCLUDED.status IS DISTINCT FROM 'Inspection' THEN NULL ELSE permits.enriched_status END");
    expect(up[0]!.params).toHaveLength(41); // 40 values + RUN_AT
  });

  it('L7 — every batch row gets its last_seen_at touch, changed or not', async () => {
    const { o } = await run({
      records: [rec('26 100001 BLD', '00'), rec('26 100002 BLD', '00')],
      priorStatus: { '26 100001 BLD--00': 'Permit Issued', '26 100002 BLD--00': 'Permit Issued' },
      unchangedKeys: ['26 100001 BLD--00', '26 100002 BLD--00'],
    });
    const touch = sqls(o, /UPDATE permits SET last_seen_at/);
    expect(touch).toHaveLength(1);
    expect(touch[0]!.params).toEqual(['26 100001 BLD', '00', '26 100002 BLD', '00', new Date('2026-10-17T12:00:00Z')]);
  });

  it("L8 — a status change writes one lifecycle_status_history row; 'Permit Issued' takes issued_date as event_date", async () => {
    const { o } = await run({ records: [rec('26 100001 BLD', '00')], priorStatus: { '26 100001 BLD--00': 'Under Review' } });
    const led = sqls(o, /INSERT INTO lifecycle_status_history/);
    expect(led).toHaveLength(1);
    const p = led[0]!.params as unknown[][];
    expect(p[1]).toEqual(['Under Review']);
    expect(p[2]).toEqual(['Permit Issued']);
    expect(p[4]).toEqual(['load-permits.js']);
    expect(p[6]).toEqual(['2026-09-01']);
    expect(sqls(o, /^SAVEPOINT ledger_write$/)).toHaveLength(1);
  });

  it('L9 — an unchanged status writes no ledger row', async () => {
    const { o } = await run({ records: [rec('26 100001 BLD', '00')], priorStatus: { '26 100001 BLD--00': 'Permit Issued' } });
    expect(sqls(o, /INSERT INTO lifecycle_status_history/)).toHaveLength(0);
  });

  it('L10 — a failing ledger insert rolls back to the savepoint, keeps the upsert, and WARNs the audit row', async () => {
    const { o, err } = await run({ records: [rec('26 100001 BLD', '00')], failLedger: true });
    expect(err).toBeNull();
    expect(sqls(o, /^ROLLBACK TO SAVEPOINT ledger_write$/)).toHaveLength(1);
    expect(rows(o).find((x) => x.metric === 'lifecycle_status_history_errors')!.status).toBe('WARN');
  });

  it('L11 — cross-page duplicates: the highest CKAN _id wins', async () => {
    const a = rec('26 100001 BLD', '00', { _id: 5, DESCRIPTION: 'old' });
    const b = rec('26 100001 BLD', '00', { _id: 9, DESCRIPTION: 'new' });
    const { o } = await run({ records: [a, b] });
    expect(rows(o).find((x) => x.metric === 'records_deduplicated')!.value).toBe(1);
    const up = sqls(o, /^\s*INSERT INTO permits \(/)[0]!;
    expect(up.params).toContain('new');
    expect(up.params).not.toContain('old');
  });

  it('L12 — the run is logged to the legacy sync_runs table with NOW() (CP-PERMITS: refresh_snapshot reads it)', async () => {
    const { o } = await run({ records: [rec('26 100001 BLD', '00')] });
    const sr = sqls(o, /INSERT INTO sync_runs/);
    expect(sr).toHaveLength(1);
    expect(sr[0]!.sql).toContain("NOW() - make_interval(secs => $7), NOW(), 'completed'");
  });

  it('L13 — a record without REVISION_NUM is an error and records_errors FAILs ("== 0")', async () => {
    const r = rec('26 100001 BLD', '00');
    delete r.REVISION_NUM;
    const { o } = await run({ records: [rec('26 100002 BLD', '00'), r] });
    const e = rows(o).find((x) => x.metric === 'records_errors')!;
    expect(e.value).toBe(1);
    expect(e.status).toBe('FAIL');
  });
});

const exists = (rel: string) => fs.existsSync(path.join(REPO_ROOT, rel));
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('PART 2 — converted claims (RED until ② as named missing artifacts)', () => {
  it.fails('D1 — the descriptor exists and declares archetype INGESTOR — flips at ②', () => {
    const d = JSON.parse(read(DESCRIPTOR_REL)) as { identity: { archetype: string } };
    expect(d.identity.archetype).toBe('INGESTOR');
  });

  it.fails('D2 — the compute module exists (shell = pipeline.step) — flips at ②', () => {
    expect(exists(COMPUTE_REL)).toBe(true);
    expect(read(SHELL_REL)).toContain('pipeline.step(');
  });

  it.fails('D3 — the notes file exists — flips at ②', () => {
    expect(exists(NOTES_REL)).toBe(true);
  });

  it.fails('D4 — CP-PERMITS: nothing writes sync_runs any more (the run ledger is pipeline_runs) — flips at ②', () => {
    expect(exists(COMPUTE_REL)).toBe(true);
    expect(read(SHELL_REL) + read(COMPUTE_REL)).not.toMatch(/sync_runs/);
  });

  it.fails('D5 — EXTERNALIZED (R-DF): page size, retries, backoff and the fetched floor are seeded logic variables — flips at ②', () => {
    const seeds = JSON.parse(read(SEEDS_REL)) as Record<string, unknown>;
    for (const k of ['load_permits_page_size', 'load_permits_download_retries', 'load_permits_retry_backoff_ms', 'load_permits_records_fetched_min']) {
      expect(Object.prototype.hasOwnProperty.call(seeds, k), k).toBe(true);
    }
  });

  it.fails('D6 — RLS (R-CT): both write targets declare rls_bypass_or_policy — flips at ②', () => {
    const d = JSON.parse(read(DESCRIPTOR_REL)) as { guards: { requires: Array<{ kind: string; name: string }> } };
    const names = d.guards.requires.filter((r) => r.kind === 'rls_bypass_or_policy').map((r) => r.name).sort();
    expect(names).toEqual(['lifecycle_status_history', 'permits']);
  });

  it.fails('D7 — admin visibility (R-DL): manifest telemetry_tables covers every declared write table — flips at ②', () => {
    const d = JSON.parse(read(DESCRIPTOR_REL)) as { outputs: { writes: Array<{ table: string }> } };
    const m = JSON.parse(read('scripts/manifest.json')) as { scripts: Record<string, { telemetry_tables?: string[] }> };
    const tel = new Set(m.scripts.permits!.telemetry_tables ?? []);
    for (const w of d.outputs.writes) expect(tel.has(w.table), w.table).toBe(true);
  });

  it.fails('D8 — the CKAN critical-field contract is a declared check, not a compute abort — flips at ②', () => {
    const d = JSON.parse(read(DESCRIPTOR_REL)) as { checks: Array<{ id: string }> };
    expect(d.checks.map((c) => c.id)).toContain('schema_drift'); // the legacy audit metric id, kept for consumer continuity
  });

  it.fails('D9 — the lifecycle_status_history ledger is a declared second write target — flips at ②', () => {
    const d = JSON.parse(read(DESCRIPTOR_REL)) as { outputs: { writes: Array<{ table: string }> } };
    expect(d.outputs.writes.map((w) => w.table)).toEqual(['permits', 'lifecycle_status_history']);
  });
});
