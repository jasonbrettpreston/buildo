// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2.5.h.2
//             docs/reports/spec_84_universal_stream_v10.csv (canonical seed source)
//
// SQL-shape regression-lock for migration 131 (universal_stream_trade_signals seed).
//
// Migration 131 normalizes the 152 per-trade × per-row signal columns (38
// trades × 4 signal types) from the v10 CSV into ~1,500 (seq, trade_slug,
// signal_type) rows. The generator (one-shot _tmp_phase_b_seed_signals.mjs)
// iterates the CSV and emits one row per ✓ cell.
//
// Critical regression-locks from Spec 84 §8.5 v10 BUG-fix decisions:
//   - seq 50 (#31 Active Inspection): Work:excavation removed (was wrong in v9);
//     Bid: Last Minute:excavation added (column-alignment shift fix)
//   - Same alignment fix applied to temporary-fencing at seq 50
//   - Drywall LM signal moved to seq 114 (was seq 116 in v9 — data-quality variant)

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 131 — universal_stream_trade_signals seed (WF1 #coa-pipeline-parity-phase-b R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/131_seed_universal_stream_trade_signals.sql'),
      'utf-8',
    );
  });

  it('inserts into universal_stream_trade_signals', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+universal_stream_trade_signals/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE/i);
  });

  it('declares all 3 columns in INSERT column list', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+universal_stream_trade_signals\s*\(\s*seq\s*,\s*trade_slug\s*,\s*signal_type\s*\)/i);
  });

  it('contains a substantial number of rows (>= 1000 — sum of ✓ marks across 152 trade columns)', () => {
    // Spec 42 §6.6.B estimates ~1,500 rows. Lower bound 1000 catches a
    // generator that mis-emitted only a subset. Match `(<int>, '<...>'` at
    // the start of a line — the canonical layout the seed generator emits.
    // Rows may span multiple INSERT statements (chunked) so a single VALUES
    // capture would miss later chunks; line-anchored counting handles that.
    const rowOpenings = sql.match(/^\s*\(\s*\d{1,3}\s*,\s*'/gm) ?? [];
    expect(rowOpenings.length).toBeGreaterThanOrEqual(1000);
    expect(rowOpenings.length).toBeLessThanOrEqual(2500);
  });

  it('uses ON CONFLICT (seq, trade_slug, signal_type) DO NOTHING for re-runnability', () => {
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*seq\s*,\s*trade_slug\s*,\s*signal_type\s*\)\s+DO\s+NOTHING/i);
  });

  it("contains at least one 'bid' signal row", () => {
    expect(sql).toMatch(/,\s*'bid'\s*\)/);
  });

  it("contains at least one 'work' signal row", () => {
    expect(sql).toMatch(/,\s*'work'\s*\)/);
  });

  it("contains at least one 'fallback' signal row", () => {
    expect(sql).toMatch(/,\s*'fallback'\s*\)/);
  });

  it("contains at least one 'last_minute' signal row", () => {
    expect(sql).toMatch(/,\s*'last_minute'\s*\)/);
  });

  it('regression-lock: at least one realtor signal exists (Spec 84 §8.5 v10 trade matrix)', () => {
    expect(sql).toMatch(/'realtor'/);
  });

  it('regression-lock: seq 50 excavation has last_minute (column-alignment fix)', () => {
    // v9 had Work:excavation at seq 50 (wrong). v10 fix removes Work:excavation
    // and adds Bid: Last Minute:excavation at seq 50.
    expect(sql).toMatch(/\(\s*50\s*,\s*'excavation'\s*,\s*'last_minute'\s*\)/);
  });

  it('regression-lock: seq 50 does NOT contain excavation work (v9 bug removed)', () => {
    expect(sql).not.toMatch(/\(\s*50\s*,\s*'excavation'\s*,\s*'work'\s*\)/);
  });

  it('does NOT use CONCURRENTLY (seed is INSERTs only, no indexes)', () => {
    expect(sql).not.toMatch(/CONCURRENTLY/i);
  });

  it('comment-only DOWN block per Rule 6', () => {
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
