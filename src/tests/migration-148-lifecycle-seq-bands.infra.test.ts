// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
//             docs/specs/01-pipeline/48_pipeline_observability.md §3.2
//
// SQL-shape regression-lock for migration 148 — Phase E.4 v4.
//
// Mig 148 derives lifecycle_seq_band_<N>_min/_max keys from
// universal_stream_catalog.rows_count via INSERT...SELECT. v4 2-branch
// continuous tolerance formula:
//   rows_count IS NULL OR 0 → min=0, max=NULL    (INFO-only)
//   rows_count >= 1         → min=FLOOR(rc*0.7), max=CEIL(rc*1.3) + 20
//
// Also seeds lifecycle_seq_unclassified_max via a third (VALUES) INSERT —
// v4 fold v3-Indep-MED-3 so the assert script's Zod validation doesn't
// throw when running between migration apply and seed-script run.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 148 — lifecycle_seq band keys (WF1 Phase E.4 v4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/148_lifecycle_seq_bands_logic_variables.sql'),
      'utf-8',
    );
  });

  // ─── UP — INSERT...SELECT shape ─────────────────────────────────────

  it('contains TWO INSERT...SELECT statements reading universal_stream_catalog', () => {
    const matches = sql.match(/INSERT\s+INTO\s+logic_variables\s*\([^)]*\)[\s\S]*?FROM\s+universal_stream_catalog/gi);
    expect(matches?.length).toBe(2);
  });

  it('builds variable_key as lifecycle_seq_band_<seq>_min for the min INSERT', () => {
    expect(sql).toMatch(/'lifecycle_seq_band_'\s*\|\|\s*seq\s*\|\|\s*'_min'\s+AS\s+variable_key/i);
  });

  it('builds variable_key as lifecycle_seq_band_<seq>_max for the max INSERT', () => {
    expect(sql).toMatch(/'lifecycle_seq_band_'\s*\|\|\s*seq\s*\|\|\s*'_max'\s+AS\s+variable_key/i);
  });

  // ─── Tolerance formula — v4 2-branch continuous ─────────────────────

  it('min CASE: NULL/0 rows_count → 0; else FLOOR(rows_count * 0.7) wrapped in GREATEST', () => {
    // Find the min INSERT's CASE block — the one whose key concatenates '_min'.
    const minBlock = sql.match(/'lifecycle_seq_band_'\s*\|\|\s*seq\s*\|\|\s*'_min'[\s\S]*?FROM\s+universal_stream_catalog/i)?.[0] ?? '';
    expect(minBlock, 'min INSERT block not found').toBeTruthy();
    expect(minBlock).toMatch(/WHEN\s+rows_count\s+IS\s+NULL\s+OR\s+rows_count\s*=\s*0\s+THEN\s+0/i);
    expect(minBlock).toMatch(/GREATEST\s*\(\s*0\s*,\s*FLOOR\s*\(\s*rows_count\s*\*\s*0\.7\s*\)/i);
  });

  it('max CASE: NULL/0 rows_count → NULL (not 999999) — v4 fold v3-G-CRIT-formula', () => {
    const maxBlock = sql.match(/'lifecycle_seq_band_'\s*\|\|\s*seq\s*\|\|\s*'_max'[\s\S]*?FROM\s+universal_stream_catalog/i)?.[0] ?? '';
    expect(maxBlock, 'max INSERT block not found').toBeTruthy();
    expect(maxBlock).toMatch(/WHEN\s+rows_count\s+IS\s+NULL\s+OR\s+rows_count\s*=\s*0\s+THEN\s+NULL/i);
    expect(maxBlock).not.toMatch(/999999/);
  });

  it('max CASE: non-NULL rows_count → CEIL(rows_count * 1.3) + 20 (continuous +20 buffer)', () => {
    const maxBlock = sql.match(/'lifecycle_seq_band_'\s*\|\|\s*seq\s*\|\|\s*'_max'[\s\S]*?FROM\s+universal_stream_catalog/i)?.[0] ?? '';
    expect(maxBlock).toMatch(/CEIL\s*\(\s*rows_count\s*\*\s*1\.3\s*\)[\s\S]*?\+\s*20/i);
  });

  it('does NOT contain the legacy 3-branch formula (rows_count < 30 → max*5)', () => {
    // The v3 plan-review flagged the discontinuous 3-branch formula. v4 uses a
    // single 2-branch continuous formula. The pattern `rows_count < 30` (or `<= 29`)
    // would indicate the old branch logic survives.
    expect(sql).not.toMatch(/rows_count\s*<\s*30/i);
    expect(sql).not.toMatch(/rows_count\s*<=\s*29/i);
    expect(sql).not.toMatch(/rows_count\s*\*\s*5/);  // the old low-volume multiplier
  });

  // ─── lifecycle_seq_unclassified_max — third INSERT (VALUES) ─────────

  it('contains a third INSERT (VALUES) seeding lifecycle_seq_unclassified_max with default 5000', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables[\s\S]*?VALUES[\s\S]*?'lifecycle_seq_unclassified_max'\s*,\s*5000/i);
  });

  // ─── Idempotency ────────────────────────────────────────────────────

  it('all three INSERT statements use ON CONFLICT DO NOTHING (operator-tuned values preserved)', () => {
    // Strip line comments before counting — narrative blocks may reference
    // these constructs in documentation.
    const executableOnly = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const insertCount = (executableOnly.match(/INSERT\s+INTO\s+logic_variables/gi) ?? []).length;
    const onConflictCount = (executableOnly.match(/ON\s+CONFLICT\s*\(\s*variable_key\s*\)\s+DO\s+NOTHING/gi) ?? []).length;
    expect(insertCount).toBe(3);
    expect(onConflictCount).toBe(3);
  });

  // ─── Transaction-handling convention ────────────────────────────────

  it('does NOT contain explicit top-level BEGIN/COMMIT (mig 135 R8 hotfix convention)', () => {
    expect(sql).not.toMatch(/^\s*BEGIN\s*;/m);
    expect(sql).not.toMatch(/^\s*COMMIT\s*;/m);
  });

  // ─── -- UP marker (pre-commit hook enforces this) ───────────────────

  it('contains an `-- UP` marker (project pre-commit hook enforces)', () => {
    expect(sql).toMatch(/--\s*UP\b/i);
  });

  // ─── Comment-only DOWN block (Rule 6) ───────────────────────────────

  it('comment-only DOWN block (Rule 6 — migrate.js does not respect markers)', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    expect(downIdx).toBeGreaterThan(0);
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

  it('does NOT use CREATE INDEX CONCURRENTLY (those live in mig 149)', () => {
    // Mig 148 must stay transactional (INSERTs only). CREATE INDEX CONCURRENTLY
    // would force the entire file through the non-transactional path,
    // breaking INSERT atomicity. Mig 149 handles the index builds.
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
  });

  it('SPEC LINK header references Spec 42 §6.11 + Spec 84 §3.4 + Spec 48 §3.2', () => {
    expect(sql).toMatch(/SPEC LINK[\s\S]*?42_chain_coa/i);
    expect(sql).toMatch(/SPEC LINK[\s\S]*?84_lifecycle_phase_engine/i);
    expect(sql).toMatch(/SPEC LINK[\s\S]*?48_pipeline_observability/i);
  });
});
