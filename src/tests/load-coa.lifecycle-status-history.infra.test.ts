// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase I.1
//
// Phase I.1 — presence-only source-grep regression-lock for load-coa.js's
// lifecycle_status_history ledger writer. Q1 trigger = status only (decision is
// snapshot at every status-change row). Behavioral verification in `.db.test.ts`.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('load-coa.js — lifecycle_status_history ledger writer (Phase I.1)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../scripts/load-coa.js'), 'utf-8');
  });

  it('pre-UPSERT capture queries coa_applications.status', () => {
    expect(src).toMatch(/SELECT application_number, status\s+FROM coa_applications/);
  });

  it('Q1 trigger fires on prevStatus !== b.status (status only, NOT decision)', () => {
    // v2.3 Independent v2.2 HIGH 4 fold — POSITIVE assertion of the JS-level
    // trigger keying on status, replacing the inverted negative regex from v2.2.
    // Phase 3 refactor (WF3 #9) extracted `prevStatus = prevStatusByAppNum.get(b.application_number)`
    // to a local variable for reuse — regex updated to match the new shape.
    expect(src).toMatch(/const prevStatus = prevStatusByAppNum\.get\(b\.application_number\)/);
    expect(src).toMatch(/if \(prevStatus !== b\.status\)/);
  });

  it('uses literal detected_by string matching mig 127 CHECK constraint', () => {
    expect(src).toMatch(/'load-coa\.js'/);
  });

  it('ON CONFLICT clause is ledger-scoped with verbatim mig 127 expression and uses DO UPDATE WHERE for event_date (Phase 3)', () => {
    // WF3 Pass-2.5 Finding C Phase 3 — DO NOTHING → DO UPDATE on event_date,
    // with WHERE guard ensuring (a) only writes when EXCLUDED.event_date differs
    // AND is non-null (preserves WAL discipline + never overwrites with NULL).
    expect(src).toMatch(
      /lifecycle_status_history[\s\S]{0,800}ON CONFLICT \(lead_id, to_status, date_trunc\('second', transitioned_at AT TIME ZONE 'UTC'\)\)[\s\S]{0,200}DO UPDATE SET event_date = EXCLUDED\.event_date/,
    );
    expect(src).toMatch(
      /WHERE EXCLUDED\.event_date IS DISTINCT FROM lifecycle_status_history\.event_date[\s\S]{0,50}AND EXCLUDED\.event_date IS NOT NULL/,
    );
  });

  it('STATUS_TO_DATE_COLUMN_COA const is defined with 8 milestone-status entries (Phase 3)', () => {
    expect(src).toMatch(/const STATUS_TO_DATE_COLUMN_COA\s*=\s*Object\.freeze\(\{/);
    // Hearing-scheduled group → hearing_date (3 statuses)
    expect(src).toMatch(/'Tentatively Scheduled':\s*'hearing_date'/);
    expect(src).toMatch(/'Hearing Scheduled':\s*'hearing_date'/);
    expect(src).toMatch(/'Hearing Rescheduled':\s*'hearing_date'/);
    // Decision-rendered group → decision_date (5 statuses)
    expect(src).toMatch(/'Conditional Consent':\s*'decision_date'/);
    expect(src).toMatch(/'Approved':\s*'decision_date'/);
    expect(src).toMatch(/'Approved with Conditions':\s*'decision_date'/);
    expect(src).toMatch(/'Refused':\s*'decision_date'/);
    expect(src).toMatch(/'Await Expiry Date':\s*'decision_date'/);
  });

  it('ledger-build loop applies .trim() before STATUS_TO_DATE_COLUMN_COA lookup (whitespace defense)', () => {
    expect(src).toMatch(/\(b\.status \?\? ''\)\.trim\(\)/);
    expect(src).toMatch(/STATUS_TO_DATE_COLUMN_COA\[statusKey\]/);
  });

  it('INSERT writes event_date as the 8th unnest column ($8::date[])', () => {
    expect(src).toMatch(/INSERT INTO lifecycle_status_history[\s\S]{0,400}event_date\)/);
    expect(src).toMatch(/\$8::date\[\]/);
    expect(src).toMatch(/ledgerRows\.map\(\(r\) => r\.event_date\)/);
  });

  it('SAVEPOINT pattern present + nested try/catch around ROLLBACK', () => {
    expect(src).toMatch(/SAVEPOINT ledger_write/);
    expect(src).toMatch(/RELEASE SAVEPOINT ledger_write/);
    expect(src).toMatch(/ROLLBACK TO SAVEPOINT ledger_write/);
    // Nested try/catch for ROLLBACK
    expect(src).toMatch(/try\s*\{\s*await client\.query\('ROLLBACK TO SAVEPOINT ledger_write'\)/);
  });

  it('decision + decision_date snapshot captured at status-change row', () => {
    // CoA ledger INSERT includes decision and decision_date columns from batch payload.
    expect(src).toMatch(/lifecycle_status_history\s*\(\s*lead_id, from_status, to_status, decision, decision_date,/);
  });

  it('lead_id constructed in JS via prefix concat (NOT padStart since CoA uses application_number directly)', () => {
    expect(src).toMatch(/'coa:'\s*\+\s*b\.application_number/);
  });

  it('auditRows includes lifecycle_status_history_inserted + lifecycle_status_history_errors', () => {
    expect(src).toMatch(/metric:\s*'lifecycle_status_history_inserted'/);
    expect(src).toMatch(/metric:\s*'lifecycle_status_history_errors'/);
  });

  it('verdict derived from rows.some() cascade (v2.3 Observability v2.2 HIGH 1 fold)', () => {
    // Replaces the parallel boolean pattern (coaAuditHasFails / coaAuditHasWarns)
    // that derived independently of row statuses.
    expect(src).toMatch(/coaAuditRows\.some\(\(r\) => r\.status === 'FAIL'\)/);
    expect(src).toMatch(/coaAuditRows\.some\(\(r\) => r\.status === 'WARN'\)/);
    expect(src).not.toMatch(/coaAuditHasFails\s*\?\s*'FAIL'\s*:\s*coaAuditHasWarns/);
  });

  it('emitMeta writes-list includes lifecycle_status_history with decision + decision_date + event_date (Phase 3)', () => {
    expect(src).toMatch(/"lifecycle_status_history":\s*\[[^\]]*"decision"[^\]]*"decision_date"/);
    expect(src).toMatch(/"lifecycle_status_history":\s*\[[^\]]*"event_date"/);
  });

  it('emitMeta reads-list adds coa_applications.status — does NOT inflate with coa_type_class (v2.3 DeepSeek MED 1)', () => {
    // coa_type_class is batch-sourced from CKAN payload, NOT a DB SELECT.
    expect(src).toMatch(/"coa_applications":\s*\["application_number",\s*"status"\]/);
  });
});
