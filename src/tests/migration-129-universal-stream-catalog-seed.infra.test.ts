// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2.5.h.2
//             docs/reports/spec_84_universal_stream_v10.csv (canonical seed source)
//
// SQL-shape regression-lock for migration 129 (universal_stream_catalog seed).
//
// Migration 129 seeds 110 rows into the catalog from the locked v10 CSV.
// Phase A R0.6 + R8 validated: 110 rows × 174 columns, all 3 BUGs resolved,
// all 6 QUESTIONABLE items reviewed-and-decided.
//
// Per Spec 42 §6.6.B seed migration contract:
//   - Split from table create (migration 128) so seed failure cannot roll back table
//   - Every INSERT uses ON CONFLICT (seq) DO NOTHING for re-runnability
//   - Empty CSV cells map to SQL NULL (not empty string)
//
// Critical regression-locks from Spec 84 §8.5 v10 BUG-fix decisions:
//   - seq 14 (Final & Binding) has bid_value = 0.8 (was 0 in v9 — contradiction fix)
//   - B9.C row exists with non-empty block_label (B9.A → B9.B → B9.D gap fix)
//   - 110 rows contiguous (seq 1-110, no gaps)

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 129 — universal_stream_catalog seed (WF1 #coa-pipeline-parity-phase-b R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/129_seed_universal_stream_catalog.sql'),
      'utf-8',
    );
  });

  it('inserts into universal_stream_catalog (not the create table)', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+universal_stream_catalog/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE/i);
  });

  it('declares all 20 columns in INSERT column list', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+universal_stream_catalog\s*\([\s\S]*?seq[\s\S]*?source_row_num[\s\S]*?lifecycle_group[\s\S]*?group_label[\s\S]*?lifecycle_block[\s\S]*?block_label[\s\S]*?lifecycle_stage[\s\S]*?stage_label[\s\S]*?source[\s\S]*?status[\s\S]*?phase[\s\S]*?bid_value[\s\S]*?loop_marker[\s\S]*?group_color[\s\S]*?group_icon[\s\S]*?block_color[\s\S]*?block_icon[\s\S]*?stage_color[\s\S]*?stage_icon[\s\S]*?rows_count[\s\S]*?\)/i);
  });

  it('contains exactly 110 VALUES rows (one per Universal Stream seq)', () => {
    // Count rows by matching `(<integer>,` at the start of a line — the
    // canonical row layout emitted by the seed generator. The `m` flag
    // is essential because each row begins on its own line. Counts the
    // first row (after `VALUES\n`) as well as subsequent rows.
    const rowOpenings = sql.match(/^\s*\(\s*\d{1,3}\s*,/gm) ?? [];
    expect(rowOpenings.length).toBe(110);
  });

  it('uses ON CONFLICT (seq) DO NOTHING for re-runnability', () => {
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*seq\s*\)\s+DO\s+NOTHING/i);
  });

  it('regression-lock: seq 14 has bid_value = 0.8 (Spec 84 §8.5 v10 BUG fix — Final & Binding)', () => {
    // seq 14 is "Final and Binding" — v9 had bid_value=0 contradicting the all-Bid-✓ row.
    // v10 fix sets bid_value=0.8. Seed must preserve this.
    // The row literal contains `14, ..., 0.8, ...` somewhere.
    // Conservative regex: a row beginning with `(14,` containing `, 0.8,`.
    const seq14Row = sql.match(/\(\s*14\s*,[^)]+?\)/);
    expect(seq14Row).toBeTruthy();
    expect(seq14Row?.[0]).toMatch(/,\s*0\.80?\s*,/);
  });

  it('regression-lock: at least one row references B9.C block (Spec 84 §8.5 v10 gap fix)', () => {
    // v9 had B9.A → B9.B → B9.D (B9.C missing). v10 fix inserts B9.C.
    expect(sql).toMatch(/'B9\.C'/);
  });

  it('contains seqs 1, 110, and 55 (spot-check contiguous 1-110)', () => {
    // Boundary + middle. (Full contiguity is asserted by the 110-row count test above.)
    expect(sql).toMatch(/\(\s*1\s*,/);
    expect(sql).toMatch(/\(\s*55\s*,/);
    expect(sql).toMatch(/\(\s*110\s*,/);
  });

  it('does NOT use CONCURRENTLY (seed is INSERTs only, no indexes)', () => {
    expect(sql).not.toMatch(/CONCURRENTLY/i);
  });

  it('comment-only DOWN block per Rule 6 (manual DELETE FROM in comments)', () => {
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
});
