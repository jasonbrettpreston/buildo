// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase I.1
//             docs/specs/01-pipeline/42_chain_coa.md §6.7 9-rule classifier precedence
//
// Phase I.1 — presence-only source-grep regression-lock for classify-lifecycle-phase.js's
// lifecycle_status_history ledger writer. Q2 zero-delta suppression (matched_status diff
// comparison). Two separate INSERTs (permit-side + CoA-side) for cohort column clarity.
// Behavioral verification (semantic ordering, fault injection) in `.db.test.ts`.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('classify-lifecycle-phase.js — lifecycle_status_history ledger writer (Phase I.1)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/classify-lifecycle-phase.js'),
      'utf-8',
    );
  });

  it('permit-side dirty SELECT extended with matched_status AS old_matched_status', () => {
    // mig 155 enabled this column on permits; classifier reads it for Q2 diff.
    expect(src).toMatch(
      /SELECT permit_num, revision_num, status, enriched_status, issued_date, last_seen_at,[\s\S]{0,300}matched_status AS old_matched_status/,
    );
  });

  it('permit-side dirty SELECT extended with lifecycle_seq AS old_lifecycle_seq', () => {
    expect(src).toMatch(/lifecycle_seq AS old_lifecycle_seq/);
  });

  it('CoA-side dirty SELECT extended with ca.matched_status AS old_matched_status', () => {
    expect(src).toMatch(/ca\.matched_status\s+AS old_matched_status/);
  });

  it('Q2 zero-delta suppression: filter on matched_status diff comparison', () => {
    // r.matched_status != null && r.matched_status !== r.old_matched_status
    expect(src).toMatch(
      /r\.matched_status\s*!=\s*null\s*&&\s*r\.matched_status\s*!==\s*r\.old_matched_status/,
    );
  });

  it('uses literal detected_by string matching mig 127 CHECK constraint', () => {
    expect(src).toMatch(/'classify-lifecycle-phase\.js'/);
  });

  it('ON CONFLICT clause is ledger-scoped with verbatim mig 127 expression', () => {
    expect(src).toMatch(
      /lifecycle_status_history[\s\S]{0,800}ON CONFLICT \(lead_id, to_status, date_trunc\('second', transitioned_at AT TIME ZONE 'UTC'\)\)[\s\S]{0,50}DO NOTHING/,
    );
  });

  it('TWO separate ledger INSERTs (permit-side without coa_type_class, CoA-side with cohort columns)', () => {
    // Two INSERT INTO lifecycle_status_history occurrences (one in flushPermitBatch,
    // one in flushCoaBatch).
    const matches = src.match(/INSERT INTO lifecycle_status_history/g);
    expect(matches?.length ?? 0).toBe(2);
  });

  it('SAVEPOINT pattern with nested ROLLBACK try/catch (both flush sites)', () => {
    // Both flush functions should have SAVEPOINT pattern.
    const savepointMatches = src.match(/SAVEPOINT ledger_write/g);
    expect(savepointMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
    const rollbackMatches = src.match(/ROLLBACK TO SAVEPOINT ledger_write/g);
    expect(rollbackMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('CoA-side INSERT includes coa_type_class and project_type cohort columns', () => {
    // CoA-side ledger INSERT enumerates coa_type_class + project_type in column list.
    expect(src).toMatch(
      /INSERT INTO lifecycle_status_history[\s\S]{0,500}coa_type_class,\s*project_type/,
    );
  });

  it('permit-side batch row carries old_matched_status from dirty SELECT', () => {
    expect(src).toMatch(/old_matched_status:\s*row\.old_matched_status/);
  });

  it('CoA-side batch row carries old_matched_status', () => {
    // Same key but in the coaBatch.push site
    expect(src).toMatch(/old_matched_status:\s*row\.old_matched_status/);
  });

  it('auditRows includes lifecycle_status_history_inserted + _errors counters', () => {
    expect(src).toMatch(/metric:\s*'lifecycle_status_history_inserted'/);
    expect(src).toMatch(/metric:\s*'lifecycle_status_history_errors'/);
  });

  it('classifier verdict cascade already row-derived from Phase E.2 (NO change needed — v2.3 Independent v2.2 MED 2)', () => {
    // Phase E.2 already implements rows-derived cascade. Sanity check it's still
    // there (NOT replaced with a hardcoded boolean).
    expect(src).toMatch(/auditRows\.some\(\(r\) => r\.status === 'FAIL'\)/);
  });

  it('emitMeta writes-list includes lifecycle_status_history', () => {
    expect(src).toMatch(/lifecycle_status_history:\s*\[[^\]]*'lead_id'[^\]]*'detected_by'/);
  });

  it('emitMeta reads-list includes permits.matched_status + lifecycle_seq', () => {
    expect(src).toMatch(
      /permits:\s*\[[^\]]*'matched_status'[^\]]*'lifecycle_seq'/,
    );
  });

  it('emitMeta reads-list includes coa_applications.matched_status', () => {
    expect(src).toMatch(
      /coa_applications:\s*\[[^\]]*'matched_status'/,
    );
  });

  // Spec 79 validation 2026-05-19 — Step 21 surfaced a TDZ ReferenceError
  // because `let lifecycleStatusHistoryErrors` was declared inside the CoA
  // section but referenced by flushPermitBatch's SAVEPOINT catch path.
  // These regression-locks assert source-order: both ledger counters MUST be
  // declared BEFORE `const flushPermitBatch` so the catch-path increment is
  // not in temporal dead zone when called from the permits streaming loop.
  it('lifecycleStatusHistoryErrors is declared before flushPermitBatch (TDZ regression-lock)', () => {
    const declIdx = src.indexOf('let lifecycleStatusHistoryErrors');
    const flushIdx = src.indexOf('const flushPermitBatch');
    expect(declIdx).toBeGreaterThan(-1);
    expect(flushIdx).toBeGreaterThan(-1);
    expect(declIdx).toBeLessThan(flushIdx);
  });

  it('lifecycleStatusHistoryInserted is declared before flushPermitBatch (TDZ regression-lock)', () => {
    const declIdx = src.indexOf('let lifecycleStatusHistoryInserted');
    const flushIdx = src.indexOf('const flushPermitBatch');
    expect(declIdx).toBeGreaterThan(-1);
    expect(flushIdx).toBeGreaterThan(-1);
    expect(declIdx).toBeLessThan(flushIdx);
  });
});
