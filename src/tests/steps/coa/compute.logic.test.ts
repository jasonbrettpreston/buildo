// SPEC LINK: docs/specs/01-pipeline/51_source_coa.md §2, §3
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ, R-DF, R-DM, R-DX, R-DY, R-DZ
//
// coa ② — the pure compute (scripts/lib/compute/load-coa.js) and the runner plans its descriptor declares,
// against the frozen legacy ORACLE (./fixtures/legacy-harness, executing fixtures/legacy-load-coa.js.txt).
// Parity: the mapped row, data_hash, skip vocabulary, dedup and the ledger rows are the legacy's own; the
// generated upsert keeps the data_hash guard and the ledger keeps the shared natural-key conflict form.
// The declared changes are pinned as changes: COA-D3 (dates bound as calendar-date text), COA-D11 (UTC
// hash form), COA-D6 (portal rot from the newest hearing on/before the run date, operator-ruled 2026-10-17).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

import { loadLegacy, ACTIVE_ID, CLOSED_ID, type CkanRecord } from './fixtures/legacy-harness';

const req = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../../../');
type Row = Record<string, unknown> & { application_number: string; decision_date: string | null; hearing_date: string | null; data_hash: string; status: string | null };
type Report = { violations?: number; value?: number; detail?: unknown; inert?: boolean };
interface Ctx { checks: string[]; descriptor: { identity: { name: string } }; acquired?: Record<string, unknown> | null; written?: Record<string, unknown> | null; pool?: { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> }; clock?: () => number; report: (id: string, o: Report) => void }
interface CoaCompute {
  (ctx: Ctx): Promise<{ records_meta: { coa_load: Record<string, unknown> } }>;
  coerceKey(raw: unknown): string | null;
  shapeRecord(raw: CkanRecord, seam: { run_at?: Date; tag?: (n: string) => void }): Row | string;
  dedupeBySourceId(rows: Row[]): { kept: Row[]; duplicateCount: number };
  deriveRows(table: string, slice: Row[], prior: Map<string, { status: string | null }>, seam: { run_at: Date; keyOf: (r: Row) => string }): Array<Record<string, unknown>>;
  daysSince(iso: string | null, nowMs: number): number | null;
  NEWEST_PAST_HEARING_SQL: string;
}
const c = req(path.join(REPO_ROOT, 'scripts/lib/compute/load-coa.js')) as CoaCompute;
const writeLib = req(path.join(REPO_ROOT, 'scripts/lib/step/write.js')) as {
  buildWritePlan: (w: unknown, d: unknown, o?: { conflictTarget?: string[] }) => { upsert_sql: string; touch_sql?: string; seen_column?: string; insert_only_columns: string[]; guard_columns: string[] };
};
const DESCRIPTOR = req(path.join(REPO_ROOT, 'scripts/load-coa.descriptor.json')) as { outputs: { writes: unknown[] } };
const RUN_AT = new Date('2026-10-17T12:00:00Z');
const keyOf = (r: Row) => JSON.stringify([String(r.application_number)]);
const LEDGER_EXPRS = ['lead_id', 'to_status', "date_trunc('second'::text, (transitioned_at AT TIME ZONE 'UTC'::text))"];
const MAPPED = ['application_number', 'address', 'street_num', 'street_name', 'street_name_normalized', 'ward', 'status', 'decision', 'decision_date', 'hearing_date', 'description', 'applicant', 'sub_type', 'zoning_designation'];

function rec(over: Partial<CkanRecord> = {}): CkanRecord {
  return {
    _id: 1, 'REFERENCE_FILE#': 'A0001/26TEY', C_OF_A_DESCISION: 'Approved', STATUSDESC: 'Hearing Scheduled',
    HEARING_DATE: '2026-10-01', STREET_NUM: '123', STREET_NAME: 'QUEEN', STREET_TYPE: 'ST', STREET_DIRECTION: 'E',
    WARD: '10', DESCRIPTION: 'To permit a rear addition.', SUB_TYPE: 'Minor Variance',
    ZONING_DESIGNATION: 'RD (f12.0; a370) (x5)', APPEAL_EXPIRY_DATE: '2026-10-21', ...over,
  };
}
const shape = (r: CkanRecord): Row => {
  const out = c.shapeRecord(r, { run_at: RUN_AT });
  if (typeof out === 'string') throw new Error(`skipped: ${out}`);
  return out;
};
const isoOf = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

async function legacyUpsert(records: Record<string, CkanRecord[]>, full = false) {
  const o = loadLegacy({ runAt: RUN_AT, records, full });
  await o.runMain();
  const ins = o.queries.find((q) => /^\s*INSERT INTO coa_applications/.test(q.sql));
  if (!ins) throw new Error('legacy wrote no upsert');
  return { o, params: ins.params as unknown[][] };
}

describe('coa ② compute — parity with the legacy oracle', () => {
  it('shapeRecord reproduces the legacy upsert binds column by column (Active and Closed shapes)', async () => {
    const closed = rec({ 'REFERENCE_FILE#': 'B0002/17NY', WARD: undefined, WARD_NUMBER: '05', FINALDATE: '2018-03-02T00:00:00', CONTACT_NAME: '' });
    const { params } = await legacyUpsert({ [ACTIVE_ID]: [rec()], [CLOSED_ID]: [closed] }, true);
    const rows = c.dedupeBySourceId([shape(rec()), shape(closed)]).kept;
    MAPPED.forEach((col, i) => expect(rows.map((r) => r[col]), col).toEqual(params[i]!.map(isoOf)));
    // The Active row hashes byte-identically to the legacy; the Closed row is the COA-D11 form (below).
    expect(rows[0]?.data_hash).toEqual(params[14]![0]);
    expect(rows[0]?.first_seen_at).toBe(RUN_AT);
    expect(rows[0]).not.toHaveProperty('last_seen_at'); // R-DZ: the runner binds the seen column
  });

  it('skip vocabulary: a blank key is a bad key (legacy missing_app_num); a missing CRITICAL field is schema_mismatch', () => {
    expect(c.coerceKey('  ')).toBeNull();
    expect(c.coerceKey(' A1 ')).toBe('A1');
    const bad = rec();
    delete bad.STATUSDESC;
    expect(c.shapeRecord(bad, { run_at: RUN_AT })).toBe('schema_mismatch');
    const noZoning = rec();
    delete noZoning.ZONING_DESIGNATION;
    expect(shape(noZoning).zoning_designation).toBeNull(); // optional field: null, never drift (Spec 51 §3)
  });

  it('applicant_present is tagged per mapped record carrying CONTACT_NAME (legacy mapped.filter, pre-dedup)', () => {
    const tags: string[] = [];
    c.shapeRecord(rec({ CONTACT_NAME: 'J. Doe' }), { run_at: RUN_AT, tag: (n) => tags.push(n) });
    c.shapeRecord(rec({ CONTACT_NAME: '  ' }), { run_at: RUN_AT, tag: (n) => tags.push(n) });
    expect(tags).toEqual(['applicant_present']);
  });

  it('dedup keeps the later decision_date (legacy L10); a tie keeps the first (Active before Closed)', () => {
    const a = shape(rec({ APPEAL_EXPIRY_DATE: '2026-01-01' }));
    const b = shape(rec({ APPEAL_EXPIRY_DATE: '2026-05-01' }));
    expect(c.dedupeBySourceId([a, b]).kept[0]?.decision_date).toBe('2026-05-01');
    expect(c.dedupeBySourceId([b, a]).kept[0]?.decision_date).toBe('2026-05-01');
    expect(c.dedupeBySourceId([a, b]).duplicateCount).toBe(1);
    const tie = shape(rec({ DESCRIPTION: 'other' }));
    expect(c.dedupeBySourceId([shape(rec()), tie]).kept[0]?.description).toBe('To permit a rear addition.');
  });

  it('deriveRows equals the legacy lifecycle_status_history binds (status change, event_date group, unmapped status, new key)', async () => {
    const recs = [rec(), rec({ 'REFERENCE_FILE#': 'P1', STATUSDESC: 'Postponed' })];
    const o = loadLegacy({ runAt: RUN_AT, records: { [ACTIVE_ID]: recs }, prevStatus: { 'A0001/26TEY': 'Accepted' } });
    await o.runMain();
    const led = o.queries.find((q) => /^\s*INSERT INTO lifecycle_status_history/.test(q.sql))!;
    const p = led.params as unknown[][];
    const rows = c.deriveRows('lifecycle_status_history', recs.map(shape), new Map([[keyOf(shape(rec())), { status: 'Accepted' }]]), { run_at: RUN_AT, keyOf });
    expect(rows.map((r) => r.lead_id)).toEqual(p[0]);
    expect(rows.map((r) => r.from_status)).toEqual(p[1]);
    expect(rows.map((r) => r.to_status)).toEqual(p[2]);
    expect(rows.map((r) => r.decision)).toEqual(p[3]);
    expect(rows.map((r) => r.decision_date)).toEqual(p[4]!.map(isoOf));
    expect(rows.map((r) => r.transitioned_at)).toEqual(p[5]);
    expect(rows.map((r) => r.detected_by)).toEqual(p[6]);
    expect(rows.map((r) => r.event_date)).toEqual(p[7]!.map(isoOf));
    // An unchanged status writes no ledger row (legacy L15).
    expect(c.deriveRows('lifecycle_status_history', [shape(rec())], new Map([[keyOf(shape(rec())), { status: 'Hearing Scheduled' }]]), { run_at: RUN_AT, keyOf })).toEqual([]);
    expect(() => c.deriveRows('coa_applications', [], new Map(), { run_at: RUN_AT, keyOf })).toThrow(/no rows/);
  });
});

describe('coa ② — the generated write plans the descriptor declares (runner-owned SQL, R-BZ G5)', () => {
  it('coa_applications: data_hash-guarded upsert on application_number; last_seen_at is the seen column with a touch statement (R-DZ, COA-D4)', () => {
    const plan = writeLib.buildWritePlan(DESCRIPTOR.outputs.writes[0], DESCRIPTOR);
    expect(plan.upsert_sql).toContain('ON CONFLICT (application_number) DO UPDATE SET');
    expect(plan.upsert_sql).toContain('WHERE coa_applications.data_hash IS DISTINCT FROM EXCLUDED.data_hash');
    expect(plan.guard_columns).toEqual(['data_hash']);
    expect(plan.insert_only_columns).toEqual(['first_seen_at']);
    expect(plan.seen_column).toBe('last_seen_at');
    expect(plan.touch_sql).toMatch(/^UPDATE coa_applications AS t SET last_seen_at = \$1 FROM UNNEST\(\$2::TEXT\[\]\) AS v\(application_number\)/);
    // COA-D3: no timestamptz cast reaches the DATE columns — the calendar-date text binds by the column type.
    expect(plan.upsert_sql).not.toMatch(/timestamptz/i);
  });

  it('lifecycle_status_history: the shared natural-key conflict target, event_date updated only when non-null and different (legacy :389-401)', () => {
    const plan = writeLib.buildWritePlan(DESCRIPTOR.outputs.writes[1], DESCRIPTOR, { conflictTarget: LEDGER_EXPRS });
    expect(plan.upsert_sql).toContain(`ON CONFLICT (${LEDGER_EXPRS.join(', ')}) DO UPDATE SET event_date = COALESCE(EXCLUDED.event_date, lifecycle_status_history.event_date)`);
    expect(plan.upsert_sql).toContain('(EXCLUDED.event_date IS NOT NULL AND lifecycle_status_history.event_date IS DISTINCT FROM EXCLUDED.event_date)');
  });
});

describe('coa ② compute — the declared changes', () => {
  // rule-map: R-EV (partial) — TZ-independent data_hash; admission conditions (a)-(d) not asserted (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
  it('COA-D11: data_hash takes dates in the UTC-midnight ISO form, independent of the process TZ (legacy Date.parse read FINALDATE in local time)', () => {
    const r = shape(rec({ FINALDATE: '2018-03-02T00:00:00' }));
    const crypto = req('crypto') as typeof import('crypto');
    const input: Record<string, unknown> = {};
    for (const k of MAPPED) input[k] = r[k];
    input.decision_date = '2018-03-02T00:00:00.000Z';
    input.hearing_date = '2026-10-01T00:00:00.000Z';
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(input).sort()) sorted[k] = input[k];
    expect(r.data_hash).toBe(crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex'));
  });

  it('COA-D3: dates are calendar-date text (Closed FINALDATE keeps its date part)', () => {
    const r = shape(rec({ FINALDATE: '2018-03-02T00:00:00' }));
    expect(r.decision_date).toBe('2018-03-02');
    expect(r.hearing_date).toBe('2026-10-01');
  });

  it('COA-D6: max_days_stale reads the newest hearing on/before the run date among the fed rows; the legacy clamped a future max to 0', async () => {
    const recs = [rec({ HEARING_DATE: '2026-08-01' }), rec({ 'REFERENCE_FILE#': 'F1', HEARING_DATE: '2027-10-08' })];
    const o = loadLegacy({ runAt: RUN_AT, records: { [ACTIVE_ID]: recs } });
    await o.runMain();
    const legacyRow = ((o.summaries[0]?.records_meta as { audit_table: { rows: { metric: string; value: unknown }[] } }).audit_table.rows).find((x) => x.metric === 'max_days_stale');
    expect(legacyRow?.value).toBe(0);
    expect(c.NEWEST_PAST_HEARING_SQL).toMatch(/c\.hearing_date <= \(run\.at AT TIME ZONE 'UTC'\)::date/);
    // the observer over the dispatch-built ctx (value 78 from 2026-08-01) is locked in ./dispatch.logic.test.ts (R-EW)
    expect(c.daysSince('2026-08-01', RUN_AT.getTime())).toBe(78);
    expect(c.daysSince(null, RUN_AT.getTime())).toBeNull();
  });
});
// The observers over the runner result (ctx.acquired / ctx.written) are locked in ./dispatch.logic.test.ts against the
// context the REAL ingestPrimaries dispatch builds (Spec 124 R-EW, COA-D13): a hand-built ctx here fed the flat
// runIngestPhase shape and missed the zero counters the Night P4 swap measured (2026-10-20).
