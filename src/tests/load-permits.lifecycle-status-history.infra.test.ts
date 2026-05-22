// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase I.1
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R9 Tier framework
//
// Phase I.1 — presence-only source-grep regression-lock for load-permits.js's
// lifecycle_status_history ledger writes. Semantic verification (SAVEPOINT
// rollback, RUN_AT consistency, zero-row emission) lives in the paired
// `.db.test.ts` file (v2.3 reframe: source-grep cannot reliably verify scope-
// level "outside any if guard" — those assertions moved to the live DB layer).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('load-permits.js — lifecycle_status_history ledger writer (Phase I.1)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../scripts/load-permits.js'), 'utf-8');
  });

  it('uses JOIN UNNEST(...) pattern for pre-UPSERT capture (NOT invalid IN ($1::text[], $2::text[]))', () => {
    // v2.3 Gemini v2 HIGH 4 fold — composite tuple IN array is invalid SQL syntax.
    expect(src).toMatch(/JOIN UNNEST\(\$1::text\[\], \$2::text\[\]\)/);
  });

  it('constructs lead_id via String(...).padStart(2, \'0\') — NOT SQL LPAD', () => {
    // v2.3 Gemini v2.2 CRIT 1 fold — LPAD in JS context would crash at runtime.
    expect(src).toMatch(/String\(b\.revision_num\)\.padStart\(2, '0'\)/);
    expect(src).not.toMatch(/LPAD\(b\.revision_num/);
  });

  it('uses literal detected_by string matching mig 127 CHECK constraint', () => {
    expect(src).toMatch(/'load-permits\.js'/);
  });

  it('ON CONFLICT clause is ledger-scoped (matches mig 127 UNIQUE INDEX verbatim) and uses DO UPDATE WHERE for event_date (Phase 2)', () => {
    // WF3 Pass-2.5 Finding C Phase 2 — DO NOTHING → DO UPDATE on event_date,
    // with WHERE guard ensuring (a) only writes when EXCLUDED.event_date differs
    // AND is non-null (preserves WAL discipline + never overwrites with NULL).
    expect(src).toMatch(
      /lifecycle_status_history[\s\S]{0,800}ON CONFLICT \(lead_id, to_status, date_trunc\('second', transitioned_at AT TIME ZONE 'UTC'\)\)[\s\S]{0,200}DO UPDATE SET event_date = EXCLUDED\.event_date/,
    );
    expect(src).toMatch(
      /WHERE EXCLUDED\.event_date IS DISTINCT FROM lifecycle_status_history\.event_date[\s\S]{0,50}AND EXCLUDED\.event_date IS NOT NULL/,
    );
    // Regression lock: the old DO NOTHING form is gone.
    expect(src).not.toMatch(/lifecycle_status_history[\s\S]{0,500}DO NOTHING/);
  });

  it('STATUS_TO_DATE_COLUMN const is defined with 7 milestone-status entries (Phase 2)', () => {
    expect(src).toMatch(/const STATUS_TO_DATE_COLUMN\s*=\s*Object\.freeze\(\{/);
    expect(src).toMatch(/'Permit Issued':\s*'issued_date'/);
    expect(src).toMatch(/'Closed':\s*'completed_date'/);
    expect(src).toMatch(/'File Closed':\s*'completed_date'/);
    expect(src).toMatch(/'Permit Issued\/Close File':\s*'completed_date'/);
    expect(src).toMatch(/'Request Received':\s*'application_date'/);
    expect(src).toMatch(/'Application Received':\s*'application_date'/);
    expect(src).toMatch(/'Application Acceptable':\s*'application_date'/);
    // Gemini HIGH fold — 'Open' and 'Active' deliberately NOT mapped (generic IBMS states).
    expect(src).not.toMatch(/'Open':\s*'application_date'/);
    expect(src).not.toMatch(/'Active':\s*'application_date'/);
  });

  it('ledger-build loop applies .trim() before STATUS_TO_DATE_COLUMN lookup (whitespace defense)', () => {
    // 3-reviewer convergence fold — Spec 84 §2.5.a documents CKAN whitespace
    // anomalies on at least one status; defensive trim guards future drift.
    expect(src).toMatch(/\(b\.status \?\? ''\)\.trim\(\)/);
    expect(src).toMatch(/STATUS_TO_DATE_COLUMN\[statusKey\]/);
  });

  it('INSERT writes event_date as the 7th unnest column ($7::date[])', () => {
    expect(src).toMatch(/INSERT INTO lifecycle_status_history[\s\S]{0,300}event_date\)/);
    expect(src).toMatch(/\$7::date\[\]/);
    // ledgerRows.map for event_date appears in the params list.
    expect(src).toMatch(/ledgerRows\.map\(\(r\) => r\.event_date\)/);
  });

  it('SAVEPOINT pattern present (SAVEPOINT + RELEASE + ROLLBACK TO SAVEPOINT all appear)', () => {
    expect(src).toMatch(/SAVEPOINT ledger_write/);
    expect(src).toMatch(/RELEASE SAVEPOINT ledger_write/);
    expect(src).toMatch(/ROLLBACK TO SAVEPOINT ledger_write/);
  });

  it('nested try/catch around ROLLBACK TO SAVEPOINT (v2.3 Gemini HIGH 1 — rollback itself could throw)', () => {
    // Source-grep proof: the inner try/catch wraps the ROLLBACK call to prevent
    // primary UPSERT rollback if the SAVEPOINT rollback itself errors.
    expect(src).toMatch(/try\s*\{\s*await client\.query\('ROLLBACK TO SAVEPOINT ledger_write'\)/);
  });

  it('auditRows includes lifecycle_status_history_inserted (INFO) row', () => {
    expect(src).toMatch(/metric:\s*'lifecycle_status_history_inserted'/);
  });

  it('auditRows includes lifecycle_status_history_errors (WARN-grade gate) row', () => {
    expect(src).toMatch(/metric:\s*'lifecycle_status_history_errors'/);
    // WARN-grade, NOT FAIL — preserves primary verdict on ledger errors.
    expect(src).toMatch(/lifecycle_status_history_errors[\s\S]{0,200}status:\s*[^?]+\?\s*'WARN'/);
  });

  it('verdict derived from rows.some() cascade (v2.3 Observability CRIT 1 fold — replaces hardcoded boolean)', () => {
    expect(src).toMatch(/auditRows\.some\(\(r\) => r\.status === 'FAIL'\)/);
    expect(src).toMatch(/auditRows\.some\(\(r\) => r\.status === 'WARN'\)/);
    expect(src).not.toMatch(/permitAuditHasFails\s*\?\s*'FAIL'\s*:\s*'PASS'/);
  });

  it('emitMeta writes-list includes lifecycle_status_history with event_date (Phase 2)', () => {
    expect(src).toMatch(/"lifecycle_status_history":\s*\[[^\]]*"lead_id"[^\]]*"detected_by"/);
    expect(src).toMatch(/"lifecycle_status_history":\s*\[[^\]]*"event_date"/);
  });

  it('emitMeta reads-list adds permits.status for pre-UPSERT capture', () => {
    // The reads-list now has a "permits" entry (in addition to "CKAN API") that
    // documents the new pre-UPSERT SELECT.
    expect(src).toMatch(/"permits":\s*\["permit_num",\s*"revision_num",\s*"status"\]/);
  });

  it('detected_by literal matches mig 127 CHECK exactly (no typos)', () => {
    expect(src).toMatch(/=>\s*'load-permits\.js'/);
  });

  it('RUN_AT capture stays inside withAdvisoryLock callback (v2.3 Gemini v2.2 CRIT 2)', () => {
    // Source-grep: pipeline.getDbTimestamp(pool) appears AFTER withAdvisoryLock opening.
    const lockIdx = src.indexOf('withAdvisoryLock(pool, ADVISORY_LOCK_ID');
    const runAtIdx = src.indexOf('await pipeline.getDbTimestamp(pool)');
    expect(lockIdx).toBeGreaterThan(0);
    expect(runAtIdx).toBeGreaterThan(lockIdx);
  });
});
