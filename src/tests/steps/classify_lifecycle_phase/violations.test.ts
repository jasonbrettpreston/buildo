// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md
// SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §2 (the enqueuer half)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit ① PH-7)
// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.8, core.9, core.12, core.14, core.16, enricher.2, x-stages.1-2, x-captures.2
//
// V3-COA package I (C6-5) — `classify_lifecycle_phase` (scripts/classify-lifecycle-phase.js), ENRICHER:
// streams dirty permits and CoA applications, classifies each with the pure lifecycle-phase functions and
// writes the lifecycle columns back, appends three history tables (permit_phase_transitions,
// lifecycle_transitions, lifecycle_status_history) and queues user notifications (notifications); runs in
// the permits AND coa chains. McDonald's Airtight V3 from ①. Commit form compressed (Spec 132
// §x-tooling.2 (R-PACE-1)): ① assessment + this suite, ② descriptor + compute + notes + seeds, ③ cutover.
// PART 1 = the legacy ORACLE PINS L1–L19: plain `it(...)`, GREEN today. They EXECUTE the VERBATIM legacy
// text via `./fixtures/legacy-harness` (never source-text assertions on the script), recording what the
// legacy script DOES so the conversion can prove it reproduced the same observables (Spec 123 §4.5).
// The defects the assessment files (CLP-D1..D15) are pinned in their LEGACY form here.
// PART 2 = the CONVERTED claims D1–D10: `it.fails(...)`, RED as NAMED MISSING ARTIFACTS (descriptor /
// compute / registry) until ② and ③ land them.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { loadLegacy, DEFAULT_LOGIC_VARS, DEFAULT_CATALOG, type LegacyOracle, type LegacyOpts, type PermitRow, type CoaRow } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DESCRIPTOR_REL = 'scripts/classify-lifecycle-phase.descriptor.json';
const COMPUTE_REL = 'scripts/lib/compute/classify-lifecycle-phase.js';
const SHELL_REL = 'scripts/classify-lifecycle-phase.js';
const ORACLE_REL = 'src/tests/steps/classify_lifecycle_phase/fixtures/legacy-classify-lifecycle-phase.js.txt';
const REPORT_REL = 'docs/reports/2026-10-23-batch5-p5-1-classify-lifecycle-phase-assessment.md';
/** `ADVISORY_LOCK_ID` (`classify-lifecycle-phase.js:488`). */
const LOCK_ID = 84;
const RUN_AT = new Date('2026-10-23T12:00:00Z');
const WRITTEN_TABLES = ['coa_applications', 'lifecycle_status_history', 'lifecycle_transitions', 'notifications', 'permit_phase_transitions', 'permits'];
const APPEND_TABLES = ['lifecycle_status_history', 'lifecycle_transitions', 'notifications', 'permit_phase_transitions'];

interface AuditRow { metric: string; value: unknown; threshold?: unknown; status: string }
type RecordsMeta = Record<string, unknown> & { audit_table?: { phase?: number; name?: string; verdict?: string; rows?: AuditRow[] } };

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
  if (last === undefined) throw new Error('[classify_lifecycle_phase ①] emitSummary() was never called');
  return last.records_meta as RecordsMeta;
}
function rows(o: LegacyOracle): AuditRow[] {
  const t = meta(o).audit_table;
  if (t === undefined || !Array.isArray(t.rows)) throw new Error('[classify_lifecycle_phase ①] audit_table.rows[] missing');
  return t.rows;
}
function row(o: LegacyOracle, metric: string): AuditRow {
  const r = rows(o).find((x) => x.metric === metric);
  if (!r) throw new Error('[classify_lifecycle_phase ①] audit row ' + metric + ' missing');
  return r;
}
function sqlOf(o: LegacyOracle, re: RegExp) {
  return o.queries.filter((q) => re.test(q.norm));
}
function readText(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJson<T = Record<string, unknown>>(rel: string): T {
  return JSON.parse(readText(rel)) as T;
}
const WRITE = /^(INSERT|UPDATE|DELETE)\b/;
const NOTIF_INSERT = /^INSERT INTO notifications \(/;

// ── fixtures (outputs verified against the REAL classifiers at ①) ─────────────────────────────────────
/** P6 -> P7a (a real transition), status changed -> one ledger row. */
const P_A: PermitRow = { permit_num: '24 100001 BLD', revision_num: '00', status: 'Permit Issued', issued_date: new Date('2026-10-10'), old_phase: 'P6', old_stalled: false, old_matched_status: 'Ready for Issuance', permit_type: 'Building', neighbourhood_id: 7 };
/** P7a -> P7b: a time-bucket shift, suppressed from the transition log; status unchanged -> no ledger row. */
const P_B: PermitRow = { permit_num: '24 100002 BLD', revision_num: '00', status: 'Permit Issued', issued_date: new Date('2026-08-01'), old_phase: 'P7a', old_stalled: false, old_matched_status: 'Permit Issued', permit_type: 'Building', neighbourhood_id: 7 };
/** P7c stays P7c but becomes stalled (false -> true): the stall alert, no transition. */
const P_C: PermitRow = { permit_num: '24 100003 BLD', revision_num: '00', status: 'Permit Issued', issued_date: new Date('2025-01-01'), old_phase: 'P7c', old_stalled: false, old_matched_status: 'Permit Issued', permit_type: 'Building', neighbourhood_id: 7 };
/** First classification (old_phase NULL, old_stalled NULL): P3 is logged as a transition from NULL. */
const P_D: PermitRow = { permit_num: '24 100004 BLD', revision_num: '00', status: 'Application Received', old_phase: null, old_stalled: null, old_matched_status: null, permit_type: 'Building', neighbourhood_id: 7 };
/** CoA first classification: P1, seq 5 from the catalog -> one lifecycle_transitions row + one ledger row. */
const C_1: CoaRow = { id: 1, lead_id: 'coa:A0001/26', decision: null, status: 'Application Received', old_phase: null, old_seq: null, old_matched_status: null, permit_type: null, project_type: 'addition', coa_type_class: 'minor_variance', neighbourhood_id: 3, days_since_activity: 5 };
/** CoA unchanged P2, an unknown decision (unmapped_decision) and a status missing from the catalog. */
const C_2: CoaRow = { id: 2, lead_id: 'coa:A0002/26', decision: 'weird thing', status: 'Hearing Scheduled', old_phase: 'P2', old_seq: null, old_matched_status: 'Hearing Scheduled', permit_type: null, project_type: null, coa_type_class: null, neighbourhood_id: 3, days_since_activity: 2 };

const HAPPY: LegacyOpts = {
  bldCmb: ['24 100001 BLD', '24 100002 BLD', '24 100003 BLD', '24 100004 BLD'],
  permits: [P_A, P_B, P_C, P_D],
  coas: [C_1, C_2],
  saved: [
    { user_id: 'u1', permit_num: '24 100001 BLD', revision_num: '00', trade_slug: 'plumbing' },
    { user_id: 'u1', permit_num: '24 100003 BLD', revision_num: '00', trade_slug: 'plumbing' },
    { user_id: 'u2', permit_num: '24 100001 BLD', revision_num: '00', trade_slug: 'hvac' },
  ],
  urgent: [{ user_id: 'u3', permit_num: '24 200000 BLD', revision_num: '01', trade_slug: 'roofing', predicted_start: '2026-10-29T18:00:00Z' }],
};

describe('classify_lifecycle_phase ① — legacy oracle pins A: lock, config, guards and the dirty sets (GREEN today)', () => {
  it('L1 — advisory lock 84 first, then RUN_AT, the first-deploy grace read, then the six logic variables load and validate INSIDE the lock; an invalid variable throws before any write', async () => {
    const ok = await run(HAPPY);
    expect(ok.err).toBeNull();
    expect(ok.o.lockIds).toEqual([LOCK_ID]);
    expect(ok.o.helpers.ADVISORY_LOCK_ID).toBe(LOCK_ID);
    expect(ok.o.events.slice(0, 3)).toEqual(['lock 84', 'run_at', 'config']);
    expect(ok.o.queries[0]?.norm).toMatch(/^SELECT COUNT\(\*\) FILTER \(WHERE started_at < NOW\(\) - INTERVAL '7 days'\)/);
    expect(Object.keys(DEFAULT_LOGIC_VARS).sort()).toEqual(['coa_stall_threshold', 'lifecycle_inspection_stall_days', 'lifecycle_issued_stall_days', 'lifecycle_orphan_stall_days', 'lifecycle_p7a_max_days', 'lifecycle_p7b_max_days']);
    const bad = await run({ ...HAPPY, logicVars: { ...DEFAULT_LOGIC_VARS, lifecycle_p7a_max_days: 0 } });
    expect(bad.err?.message).toMatch(/config validation failed: lifecycle_p7a_max_days/);
    expect(bad.o.queries.filter((q) => WRITE.test(q.norm))).toHaveLength(0);
  });

  it('L2 — three pre-write guards throw with nothing written: a missing mig-146 column, an empty universal_stream_catalog, a catalog with no coa.status row', async () => {
    const noCol = await run({ ...HAPPY, coaAuditCols: ['matched_status', 'matched_rule', 'unmapped_status'] });
    expect(noCol.err?.message).toMatch(/migration 146 not applied — missing columns on coa_applications: unmapped_decision/);
    const empty = await run({ ...HAPPY, catalog: [] });
    expect(empty.err?.message).toMatch(/universal_stream_catalog returned 0 rows/);
    const noCoa = await run({ ...HAPPY, catalog: [{ ...DEFAULT_CATALOG[0]!, source: 'permit.status' }] });
    expect(noCoa.err?.message).toMatch(/has no coa\.status rows/);
    for (const r of [noCol, empty, noCoa]) expect(r.o.queries.filter((q) => WRITE.test(q.norm))).toHaveLength(0);
  });

  it('L3 — the dirty sets are keyed on the ROOTS\' seen column: permits and coa_applications both re-classify when last_seen_at > lifecycle_classified_at, when never classified, or when matched_rule IS NULL', async () => {
    const { o } = await run(HAPPY);
    const streams = o.queries.filter((q) => q.via === 'stream');
    expect(streams).toHaveLength(2);
    expect(streams[0]?.norm).toMatch(/FROM permits WHERE lifecycle_classified_at IS NULL OR last_seen_at > lifecycle_classified_at OR matched_rule IS NULL$/);
    expect(streams[1]?.norm).toMatch(/FROM coa_applications ca WHERE ca\.lifecycle_classified_at IS NULL OR ca\.last_seen_at > ca\.lifecycle_classified_at OR ca\.matched_rule IS NULL$/);
    // the CoA stream binds RUN_AT for days_since_activity; the CoA cohort permit_type is the literal NULL
    expect(streams[1]?.params).toEqual([RUN_AT]);
    expect(streams[1]?.norm).toContain('NULL::text AS permit_type');
  });
});

describe('classify_lifecycle_phase ① — legacy oracle pins B: the per-batch write unit and the append-only history (GREEN today)', () => {
  it('L4 — one permit batch is ONE transaction of four statements in order: the guarded phase UPDATE, the transitions INSERT (no ON CONFLICT), the SAVEPOINT-wrapped status-ledger INSERT, the classified_at stamp; every timestamp is RUN_AT', async () => {
    const { o, err } = await run(HAPPY);
    expect(err).toBeNull();
    const firstTxn = o.queries.find((q) => q.via === 'client')?.txn;
    const inTxn = o.queries.filter((q) => q.txn === firstTxn).map((q) => q.norm.slice(0, 48));
    expect(inTxn).toEqual([
      'UPDATE permits p SET lifecycle_phase = upd.phase',
      'INSERT INTO permit_phase_transitions (permit_num',
      'SAVEPOINT ledger_write',
      'INSERT INTO lifecycle_status_history (lead_id, f',
      'RELEASE SAVEPOINT ledger_write',
      'UPDATE permits SET lifecycle_classified_at = $3:',
    ]);
    const upd = sqlOf(o, /^UPDATE permits p SET lifecycle_phase = upd\.phase/)[0]!;
    expect(upd.norm).toContain('phase_started_at = CASE WHEN p.lifecycle_phase IS DISTINCT FROM upd.phase THEN $8::timestamptz ELSE p.phase_started_at END');
    expect(upd.norm).toMatch(/AND \(p\.lifecycle_phase IS DISTINCT FROM upd\.phase OR p\.lifecycle_stalled IS DISTINCT FROM upd\.stalled/);
    expect(upd.params[7]).toBe(RUN_AT);
    const tr = sqlOf(o, /^INSERT INTO permit_phase_transitions \(.*\) VALUES/)[0]!;
    expect(tr.norm).not.toMatch(/ON CONFLICT/);
    expect(tr.params.filter((p) => p === RUN_AT)).toHaveLength(2);
    expect(sqlOf(o, /^INSERT INTO lifecycle_status_history/)[0]!.norm).toMatch(/ON CONFLICT \(lead_id, to_status, date_trunc\('second', transitioned_at AT TIME ZONE 'UTC'\)\) DO NOTHING$/);
  });

  it('L5 — transition rows: a real phase change and a first classification (from_phase NULL) are logged; a P7a -> P7b time-bucket shift and a stall-only change are not', async () => {
    const { o } = await run(HAPPY);
    const tr = sqlOf(o, /^INSERT INTO permit_phase_transitions \(.*\) VALUES/)[0]!;
    // 7 params per row: permit_num, revision_num, from_phase, to_phase, RUN_AT, permit_type, neighbourhood_id
    expect(tr.params).toHaveLength(14);
    expect(tr.params.slice(0, 4)).toEqual(['24 100001 BLD', '00', 'P6', 'P7a']);
    expect(tr.params.slice(7, 11)).toEqual(['24 100004 BLD', '00', null, 'P3']);
    expect(row(o, 'permits_dirty').value).toBe(4);
    expect(meta(o).phase_transitions_logged).toBe(2);
  });

  it('L6 — status-ledger rows only where matched_status changed; a failing ledger INSERT rolls back to the SAVEPOINT, keeps the phase UPDATE and the stamp, and WARNs lifecycle_status_history_errors', async () => {
    const ok = await run(HAPPY);
    const permitLedger = sqlOf(ok.o, /^INSERT INTO lifecycle_status_history/)[0]!;
    expect(permitLedger.params[0]).toEqual(['permit:24 100001 BLD:00', 'permit:24 100004 BLD:00']);
    expect(permitLedger.params[8]).toEqual(['classify-lifecycle-phase.js', 'classify-lifecycle-phase.js']);
    expect(row(ok.o, 'lifecycle_status_history_errors')).toMatchObject({ value: 0, status: 'PASS' });
    const bad = await run({ ...HAPPY, ledgerFail: true });
    expect(bad.err).toBeNull();
    expect(bad.o.events).toContain('ROLLBACK TO SAVEPOINT ledger_write');
    expect(bad.o.events.filter((e) => e === 'STAMP permits')).toHaveLength(1);
    expect(row(bad.o, 'lifecycle_status_history_errors')).toMatchObject({ value: 2, status: 'WARN' });
    expect(meta(bad.o).audit_table?.verdict).toBe('WARN');
  });

  it('L7 — CoA batch: ONE transaction of the 11-column guarded UPDATE, the lifecycle_transitions INSERT (ON CONFLICT (lead_id, transitioned_at) DO NOTHING) on a phase OR seq change, the ledger INSERT and the stamp; the catalog supplies seq/group/block/stage/bid_value; no CoA notification', async () => {
    const { o } = await run(HAPPY);
    const coaTxn = o.queries.find((q) => q.norm.startsWith('UPDATE coa_applications ca SET lifecycle_phase'))!.txn;
    expect(o.queries.filter((q) => q.txn === coaTxn).map((q) => q.norm.slice(0, 40))).toEqual([
      'UPDATE coa_applications ca SET lifecycle',
      'INSERT INTO lifecycle_transitions (lead_',
      'SAVEPOINT ledger_write',
      'INSERT INTO lifecycle_status_history (le',
      'RELEASE SAVEPOINT ledger_write',
      'UPDATE coa_applications SET lifecycle_cl',
    ]);
    const coaUpd = sqlOf(o, /^UPDATE coa_applications ca SET lifecycle_phase/)[0]!;
    expect(coaUpd.params.slice(0, 4)).toEqual([[1, 2], ['P1', 'P2'], [false, false], [5, null]]);
    expect(coaUpd.params[12]).toBe(RUN_AT);
    const lt = sqlOf(o, /^INSERT INTO lifecycle_transitions/)[0]!;
    expect(lt.norm).toMatch(/ON CONFLICT \(lead_id, transitioned_at\) DO NOTHING$/);
    expect(lt.params[0]).toEqual(['coa:A0001/26']);
    expect(row(o, 'catalog_status_missing_count')).toMatchObject({ value: 1, status: 'PASS' });
    expect(row(o, 'unmapped_decision_count')).toMatchObject({ value: 1, status: 'PASS' });
    const notifLeads = sqlOf(o, NOTIF_INSERT).flatMap((q) => q.params.filter((p) => typeof p === 'string' && p.startsWith('coa:')));
    expect(notifLeads).toEqual([]);
  });

  it('L8 — phase_started_at backfill (autocommit, on the pool) and the initial-transition backfill (one transaction, NOT EXISTS, RUN_AT fallback) run every run; both are no-ops once filled', async () => {
    const { o } = await run({ ...HAPPY, backfilled: 3, initialTrans: 2 });
    const bf = sqlOf(o, /^UPDATE permits SET phase_started_at = CASE/)[0]!;
    expect(bf.via).toBe('pool');
    expect(bf.norm).toMatch(/WHERE lifecycle_phase IS NOT NULL AND phase_started_at IS NULL RETURNING 1$/);
    const it2 = sqlOf(o, /^INSERT INTO permit_phase_transitions \(.*\) SELECT/)[0]!;
    expect(it2.via).toBe('client');
    expect(it2.norm).toMatch(/NOT EXISTS \( SELECT 1 FROM permit_phase_transitions t WHERE t\.permit_num = permits\.permit_num AND t\.revision_num = permits\.revision_num \) RETURNING 1$/);
    expect(it2.params).toEqual([RUN_AT]);
    expect([meta(o).phase_started_at_backfilled, meta(o).initial_transitions_backfilled]).toEqual([3, 2]);
  });
});

describe('classify_lifecycle_phase ① — legacy oracle pins C: the notification enqueue and its replay behaviour (GREEN today)', () => {
  it('L9 — phase-change and stall alerts are queued AFTER the batch COMMIT, on the pool, outside the transaction: one row per saved user per lead, PIPEDA body, lead_id permit:NUM:REV, created_at RUN_AT', async () => {
    const { o } = await run(HAPPY);
    const firstCommit = o.events.indexOf('COMMIT');
    expect(o.events.indexOf('SELECT lead_views saved')).toBeGreaterThan(firstCommit);
    const ins = sqlOf(o, NOTIF_INSERT);
    const phaseIns = ins[0]!;
    expect(phaseIns.via).toBe('pool');
    expect(phaseIns.txn).toBeNull();
    // u1 + u2 on 24 100001 (PHASE_CHANGED), u1 on 24 100003 (STALLED: false -> true); 8 params per row
    expect(phaseIns.params).toHaveLength(24);
    expect(phaseIns.params.slice(0, 8)).toEqual(['u1', 'LIFECYCLE_PHASE_CHANGED', '24 100001 BLD', 'plumbing', 'Phase Update', 'A job you are tracking has advanced to the next phase.', 'permit:24 100001 BLD:00', RUN_AT]);
    expect(phaseIns.params.slice(16, 20)).toEqual(['u1', 'LIFECYCLE_STALLED', '24 100003 BLD', 'plumbing']);
    expect(String(phaseIns.params[5])).not.toContain('24 100001');
    // the saved-lead read for transitions binds the FIRST-classification permit too (from_phase NULL)
    const savedReads = sqlOf(o, /^SELECT DISTINCT ON \(lv\.user_id, lv\.permit_num, lv\.revision_num\)/);
    expect(savedReads[0]!.params[0]).toEqual(['24 100001 BLD', '24 100004 BLD']);
  });

  it('L10 — a notification failure never aborts the run: a failing saved-lead read or a failing queue INSERT is logged and swallowed, the verdict is unchanged and no audit row counts it', async () => {
    const readFail = await run({ ...HAPPY, savedFail: true });
    expect(readFail.err).toBeNull();
    expect(readFail.o.logs.some((l) => l.level === 'warn' && /PHASE_CHANGED saved-lead query failed/.test(String(l.args[1])))).toBe(true);
    const insFail = await run({ ...HAPPY, notifInsertFail: true });
    expect(insFail.err).toBeNull();
    expect(insFail.o.logs.some((l) => l.level === 'warn' && /threw unexpectedly/.test(String(l.args[1])))).toBe(true);
    expect(meta(insFail.o).audit_table?.verdict).toBe('PASS');
    expect(rows(insFail.o).some((r) => /notif|enqueue/.test(r.metric))).toBe(false);
  });

  it('L11 — START_DATE_URGENT is queued on EVERY run from a wall-clock window (NOW() + 6..7 days) over trade_forecasts, independent of what was classified: a rerun with nothing dirty queues the same rows again (no idempotency key on notifications)', async () => {
    const first = await run(HAPPY);
    const urgentRead = sqlOf(first.o, /^SELECT DISTINCT ON \(tf\.permit_num, tf\.revision_num, lv\.user_id\)/)[0]!;
    expect(urgentRead.norm).toMatch(/tf\.predicted_start >= NOW\(\) \+ INTERVAL '6 days' AND tf\.predicted_start <= NOW\(\) \+ INTERVAL '7 days'/);
    const urgentIns = sqlOf(first.o, NOTIF_INSERT).at(-1)!;
    expect(urgentIns.params.slice(0, 7)).toEqual(['u3', 'START_DATE_URGENT', '24 200000 BLD', 'roofing', 'Work Starting Soon', 'A saved job is predicted to start in 7 days.', 'permit:24 200000 BLD:01']);
    // the replay: the same database after run 1 — nothing is dirty, so no phase/stall alert, but URGENT repeats
    const rerun = await run({ ...HAPPY, permits: [], coas: [] });
    const rerunIns = sqlOf(rerun.o, NOTIF_INSERT);
    expect(rerunIns).toHaveLength(1);
    expect(rerunIns[0]!.params.slice(0, 2)).toEqual(['u3', 'START_DATE_URGENT']);
    expect(row(rerun.o, 'permits_dirty').value).toBe(0);
  });
});

describe('classify_lifecycle_phase ① — legacy oracle pins D: audit table, verdict, summary and the exit lanes (GREEN today)', () => {
  it('L12 — 18 audit rows in a fixed order, phase 21 in every chain, the verdict derived from the row statuses; the bands are code literals (1/3, 3/5, 100)', async () => {
    const { o } = await run(HAPPY);
    expect(rows(o).map((r) => r.metric)).toEqual([
      'permits_dirty', 'permits_updated', 'permit_unmapped_status_count', 'permit_code_drift_count',
      'permit_rule_distribution_top5', 'permit_first_deploy_grace', 'coa_evaluated', 'coa_rows_updated',
      'coa_phase_transitions_count', 'lifecycle_status_history_inserted', 'lifecycle_status_history_errors',
      'stalled_count', 'coa_stalled_count', 'unmapped_status_count', 'unmapped_decision_count',
      'catalog_status_missing_count', 'catalog_invalid_phase_count', 'unclassified_count',
    ]);
    expect(meta(o).audit_table).toMatchObject({ phase: 21, name: 'Classify Lifecycle Phase', verdict: 'PASS' });
    expect(row(o, 'unmapped_status_count').threshold).toBe('<=3 WARN, <=1 PASS');
    expect(row(o, 'unmapped_decision_count').threshold).toBe('<=5 WARN, <=3 PASS');
    expect(row(o, 'unclassified_count').threshold).toBe('<= 100');
    const warn = await run({ ...HAPPY, catalog: [...DEFAULT_CATALOG, { ...DEFAULT_CATALOG[0]!, seq: 9, phase: 'P2', status: 'Hearing Scheduled' }], coas: [C_2, { ...C_2, id: 3 }, { ...C_2, id: 4 }, { ...C_2, id: 5 }] });
    expect(row(warn.o, 'unmapped_decision_count')).toMatchObject({ value: 4, status: 'WARN' });
    expect(meta(warn.o).audit_table?.verdict).toBe('WARN');
  });

  it('L13 — the first-deploy grace reads pipeline_runs on the wall clock: with no prior run older than 7 days permit_unmapped_status_count is INFO; afterwards it is banded', async () => {
    const unmapped: PermitRow[] = ['A', 'B', 'C', 'D'].map((k, i) => ({ permit_num: `24 30000${i} BLD`, revision_num: '00', status: 'Mystery Status', old_phase: null, old_stalled: null, old_matched_status: null }));
    const bld = unmapped.map((p) => p.permit_num);
    const grace = await run({ ...HAPPY, bldCmb: bld, permits: unmapped, priorRuns7d: 0 });
    expect(row(grace.o, 'permit_unmapped_status_count')).toMatchObject({ value: 4, status: 'INFO' });
    expect(row(grace.o, 'permit_first_deploy_grace').value).toBe(1);
    const steady = await run({ ...HAPPY, bldCmb: bld, permits: unmapped, priorRuns7d: 9 });
    expect(row(steady.o, 'permit_unmapped_status_count')).toMatchObject({ value: 4, status: 'FAIL' });
    expect(meta(steady.o).audit_table?.verdict).toBe('FAIL');
    expect(steady.err).toBeNull();
    expect(meta(steady.o).permit_classifier_extended).toBe('true');
  });

  it('L14 — unclassified > 100 throws AFTER every write committed and AFTER emitSummary/emitMeta; the count sums permits and CoAs while the message says "permits"', async () => {
    const { o, err } = await run({ ...HAPPY, unclPermits: 60, unclCoas: 41 });
    expect(err?.message).toBe('BLOCKING: 101 unclassified permits exceed threshold of 100. See log for top unhandled statuses.');
    expect(o.summaries).toHaveLength(1);
    expect(o.metas).toHaveLength(1);
    expect(o.events.filter((e) => e === 'COMMIT').length).toBeGreaterThanOrEqual(3);
    expect(row(o, 'unclassified_count')).toMatchObject({ value: 101, status: 'FAIL' });
    expect(sqlOf(o, /^SELECT status, COUNT\(\*\)::int AS n FROM permits WHERE lifecycle_phase IS NULL/)).toHaveLength(1);
  });

  it('L15 — summary: records_total counts dirty PERMITS only, records_updated permit UPDATE rows only (CoA, history and queue writes are not counted); the batch sizes are code constants', async () => {
    const { o } = await run(HAPPY);
    const s = o.summaries[0]!;
    expect([s.records_total, s.records_new, s.records_updated]).toEqual([4, 0, 4]);
    expect(meta(o).coas_updated).toBe(2);
    expect([o.helpers.PERMIT_BATCH_SIZE, o.helpers.COA_BATCH_SIZE, o.helpers.NOTIF_INSERT_BATCH]).toEqual([9362, 5000, 8191]);
  });

  it('L16 — emitMeta: the declared reads omit pipeline_runs and permit columns the statements read, and declare coa_applications.permit_type, which the CoA SELECT says does not exist', async () => {
    const { o } = await run(HAPPY);
    const m = o.metas[0]!;
    expect(Object.keys(m.reads).sort()).toEqual(['coa_applications', 'lead_views', 'permit_inspections', 'permits', 'trade_forecasts', 'universal_stream_catalog']);
    for (const c of ['permit_type', 'neighbourhood_id', 'linked_coa_application_number', 'lifecycle_phase', 'lifecycle_stalled', 'matched_rule', 'application_date', 'first_seen_at', 'phase_started_at']) {
      expect(m.reads.permits).not.toContain(c);
    }
    expect(m.reads.coa_applications).toContain('permit_type');
    expect(Object.keys(m.writes).sort()).toEqual(WRITTEN_TABLES);
    const manifest = readJson<{ scripts: Record<string, { telemetry_tables?: string[]; supports_dry_run?: boolean }> }>('scripts/manifest.json');
    expect(manifest.scripts.classify_lifecycle_phase?.telemetry_tables).toEqual(['permits', 'coa_applications']);
  });

  it('L17 — a contended lock returns with no config load, no SQL and no summary; emitMeta({}, {})', async () => {
    const { o, err } = await run({ ...HAPPY, lockAcquired: false });
    expect(err).toBeNull();
    expect(o.events).toEqual(['lock 84']);
    expect(o.queries).toHaveLength(0);
    expect(o.summaries).toHaveLength(0);
    expect(o.metas).toEqual([{ reads: {}, writes: {} }]);
  });

  it('L18 — the script reads no argv or env: --dry-run is not honoured and the manifest says supports_dry_run false', async () => {
    const src = readText(ORACLE_REL);
    expect(src).not.toMatch(/process\.(argv|env)/);
    const manifest = readJson<{ scripts: Record<string, { supports_dry_run?: boolean }> }>('scripts/manifest.json');
    expect(manifest.scripts.classify_lifecycle_phase?.supports_dry_run).toBe(false);
  });

  it('L19 — the frozen oracle text is byte-identical to the shipped script while it is still legacy (pipeline.run, not pipeline.step)', () => {
    const shell = readText(SHELL_REL);
    if (!/pipeline\.run\(/.test(shell)) return; // ② swapped the shell: the oracle stays frozen, this pin retires
    expect(readText(ORACLE_REL)).toBe(shell);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART 2 — the converted claims D1–D10 (`it.fails` at ①). Each is RED as a NAMED MISSING ARTIFACT or a
// named registry state; ② / ③ flip each to `it` in the commit that lands it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
type WriteSpec = { table: string; columns?: Array<{ name: string; source?: string }>; write_discipline?: { class?: string; guard?: unknown; idempotent_rerun?: string } };
type Descriptor = {
  identity: { name: string; archetype: string; lock: number; spec: string };
  outputs: { writes: WriteSpec[] };
  staleness?: { pins?: unknown[] };
  guards?: { requires?: Array<{ kind: string; name: string }> };
  checks?: Array<{ id: string; severity?: string }>;
  config?: { logic_variables?: Array<{ name: string }> | Record<string, unknown> };
};

describe('classify_lifecycle_phase ① — converted claims (RED at ①; flip to `it` at ② / ③)', () => {
  it.fails('D1 — identity and frozen shell: descriptor exists, archetype ENRICHER (census, Spec 132 §core.4), lock 84, spec "84"; shell is pipeline.step(), not pipeline.run() (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect(d.identity).toMatchObject({ name: 'classify_lifecycle_phase', archetype: 'ENRICHER', lock: LOCK_ID, spec: '84' });
    const shell = readText(SHELL_REL);
    expect(shell).toMatch(/pipeline\.step\(/);
    expect(shell).not.toMatch(/pipeline\.run\(/);
  });

  it.fails('D2 — write discipline per target (Spec 132 §core.12): all six written tables are declared targets with a class and a guard, and each RLS-enabled table (migrations 227/230) carries rls_bypass_or_policy (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect([...new Set(d.outputs.writes.map((w) => w.table))].sort()).toEqual(WRITTEN_TABLES);
    for (const w of d.outputs.writes) {
      expect(typeof w.write_discipline?.class).toBe('string');
      expect(w.write_discipline?.guard).toBeDefined();
    }
    for (const t of WRITTEN_TABLES) {
      expect((d.guards?.requires ?? []).some((r) => r.kind === 'rls_bypass_or_policy' && r.name === t)).toBe(true);
    }
  });

  it.fails('D3 — replay-safe appends: every append target (the three history tables and the notifications queue) declares idempotent_rerun "zero_writes", so a rerun with nothing dirty writes no history row and queues no alert (cards CLP-Q1, CLP-Q2) (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    for (const t of APPEND_TABLES) {
      const targets = d.outputs.writes.filter((w) => w.table === t);
      expect(targets.length).toBeGreaterThan(0);
      for (const w of targets) expect(w.write_discipline?.idempotent_rerun).toBe('zero_writes');
    }
  });

  it.fails('D4 — the re-classify trigger is the §6.3 watermark pin (Spec 132 §core.14 (R-FF)): lifecycle_classified_at is a source:"run_at" stamp and staleness.pins names the roots, never a by:"seen" (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    const stamps = d.outputs.writes.flatMap((w) => (w.columns ?? []).filter((c) => c.name === 'lifecycle_classified_at'));
    expect(stamps.length).toBeGreaterThanOrEqual(2);
    for (const c of stamps) expect(c.source).toBe('run_at');
    expect((d.staleness?.pins ?? []).length).toBeGreaterThan(0);
  });

  it.fails('D5 — EXTERNALIZED (Spec 132 §core.8): compute holds none of the legacy literals (the 100 unclassified ceiling, the 1/3 and 3/5 bands, the 7-day grace, the 6..7-day urgent window, the 9362 / 5000 batch sizes) and the step variables follow <slug>_<name> or the shared map (flips at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/\b(9362|5000)\b|<=\s*100\b|INTERVAL '(6|7) days'|passAt:\s*\d|warnAt:\s*\d/);
    const seeds = readText('scripts/seeds/logic_variables.json');
    expect(seeds).toContain('"classify_lifecycle_phase_');
  });

  it.fails('D6 — compute is pure (Spec 132 §core.9): no Date.now, no NOW(), no .query(, no transaction / lock wrapper, no pipeline require, no process.env / argv, no swallowing catch, no pipeline_runs read (flips at ②)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/Date\.now\(|\bNOW\(\)|\.query\(|withTransaction|withAdvisoryLock|require\(['"]\.\.\/pipeline['"]\)|process\.(env|argv)|\bcatch\b|pipeline_runs/);
  });

  it.fails('D7 — a notification failure is a declared WARN check bounded at zero (the R-DM warn_row form), not a swallowed log line (flips at ②)', () => {
    const d = readJson<Descriptor>(DESCRIPTOR_REL);
    expect((d.checks ?? []).some((c) => /notification/.test(c.id) && c.severity === 'WARN')).toBe(true);
  });

  it.fails('D8 — admin-verifiable (Spec 132 §core.16 (R-DL)): PIPELINE_TABLE_MAP maps the step, STEP_DESCRIPTIONS no longer says "final step", and manifest telemetry_tables cover every written table (flips at ③)', () => {
    const funnel = readText('src/lib/admin/funnel.ts');
    const mapBlock = funnel.slice(funnel.indexOf('export const PIPELINE_TABLE_MAP'));
    expect(mapBlock).toMatch(/\n {2}classify_lifecycle_phase:/);
    expect(funnel).not.toMatch(/classify_lifecycle_phase: \{ summary: '[^']*final step/);
    const manifest = readJson<{ scripts: Record<string, { telemetry_tables?: string[] }> }>('scripts/manifest.json');
    expect([...(manifest.scripts.classify_lifecycle_phase?.telemetry_tables ?? [])].sort()).toEqual(WRITTEN_TABLES);
  });

  it.fails('D9 — the assessment report carries the generated validation scorecard (flips at ②)', () => {
    expect(readText(REPORT_REL)).toContain('## Validation scorecard (generated)');
  });

  it.fails('D10 — registered: converted.json converted[] holds scripts/classify-lifecycle-phase.js (flips at ③)', () => {
    const conv = readJson<{ converted: string[] }>('scripts/steps/_schema/converted.json');
    expect(conv.converted).toContain(SHELL_REL);
  });
});
