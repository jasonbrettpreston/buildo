// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
//             docs/specs/00_engineering_standards.md §3.1
//
// SQL-shape regression-lock for migration 149 — Phase E.4 v4.
//
// Mig 149 adds partial CREATE INDEX CONCURRENTLY on permits.lifecycle_seq +
// coa_applications.lifecycle_seq to support the per-seq aggregate query in
// assert-lifecycle-phase-distribution.js without full-table scans.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 149 — lifecycle_seq partial indices (WF1 Phase E.4 v4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/149_lifecycle_seq_indices.sql'),
      'utf-8',
    );
  });

  // ─── UP — index creation ────────────────────────────────────────────

  it('creates partial CONCURRENTLY index on permits(lifecycle_seq) WHERE lifecycle_seq IS NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_permits_lifecycle_seq[\s\S]*?ON\s+permits\s*\(\s*lifecycle_seq\s*\)[\s\S]*?WHERE\s+lifecycle_seq\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('creates partial CONCURRENTLY index on coa_applications(lifecycle_seq) WHERE lifecycle_seq IS NOT NULL', () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_applications_lifecycle_seq[\s\S]*?ON\s+coa_applications\s*\(\s*lifecycle_seq\s*\)[\s\S]*?WHERE\s+lifecycle_seq\s+IS\s+NOT\s+NULL/i,
    );
  });

  // ─── CONCURRENTLY routing ───────────────────────────────────────────

  it('uses CONCURRENTLY on both indices (routes through migrate.js non-transactional path)', () => {
    const matches = sql.match(/CREATE\s+INDEX\s+CONCURRENTLY/gi);
    expect(matches?.length).toBe(2);
  });

  it('does NOT contain INSERT/UPDATE/DELETE statements (would be incorrectly batched into non-transactional path)', () => {
    // Strip comments first so DOWN block references don't trip the check.
    const executableOnly = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executableOnly).not.toMatch(/\bINSERT\b/i);
    expect(executableOnly).not.toMatch(/\bUPDATE\b/i);
    expect(executableOnly).not.toMatch(/\bDELETE\b/i);
  });

  // ─── Transaction-handling convention ────────────────────────────────

  it('does NOT contain explicit BEGIN/COMMIT (CONCURRENTLY rejects transaction blocks)', () => {
    expect(sql).not.toMatch(/^\s*BEGIN\s*;/m);
    expect(sql).not.toMatch(/^\s*COMMIT\s*;/m);
  });

  it('contains an `-- UP` marker (project pre-commit hook enforces)', () => {
    expect(sql).toMatch(/--\s*UP\b/i);
  });

  // ─── Comment-only DOWN block (Rule 6) ───────────────────────────────

  it('comment-only DOWN block (Rule 6)', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    const afterDown = sql.slice(downIdx);
    const offending = afterDown
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t === '' || t.startsWith('--')) return false;
        return /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t);
      });
    expect(offending).toEqual([]);
  });

  it('DOWN block documents DROP INDEX CONCURRENTLY (avoids table lock during rollback)', () => {
    const downIdx = sql.search(/--\s*DOWN\b/i);
    const afterDown = sql.slice(downIdx);
    expect(afterDown).toMatch(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+idx_permits_lifecycle_seq/i);
    expect(afterDown).toMatch(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+idx_coa_applications_lifecycle_seq/i);
  });

  it('SPEC LINK header references Spec 42 §6.11 + Engineering Standards §3.1', () => {
    expect(sql).toMatch(/SPEC LINK[\s\S]*?42_chain_coa/i);
    expect(sql).toMatch(/SPEC LINK[\s\S]*?00_engineering_standards/i);
  });
});
