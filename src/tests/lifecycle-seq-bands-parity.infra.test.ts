// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
//
// Mig-vs-seed parity test — Phase E.4 v4 fold v2-G-HIGH (mig-vs-seed parity).
//
// Reads migrations/129_seed_universal_stream_catalog.sql, extracts each
// seq's `rows_count` via tuple parsing, applies the v3/v4 2-branch continuous
// tolerance formula in JS (identical to mig 148's SQL CASE), and asserts
// equality with scripts/seeds/logic_variables.json entries for all 220 band
// keys. Programmatic parity gate — tweaking the formula in either side
// without the other fails the test.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// rows_count is the 20th column (0-indexed = 19) in mig 129's INSERT.
// Column ordering (as documented in the INSERT statement header):
//   0: seq, 1: source_row_num, 2: lifecycle_group, 3: group_label,
//   4: lifecycle_block, 5: block_label, 6: lifecycle_stage, 7: stage_label,
//   8: source, 9: status, 10: phase, 11: bid_value, 12: loop_marker,
//   13: group_color, 14: group_icon, 15: block_color, 16: block_icon,
//   17: stage_color, 18: stage_icon, 19: rows_count
const SEQ_IDX = 0;
const ROWS_COUNT_IDX = 19;
const EXPECTED_TUPLE_LENGTH = 20;

// v4 fold v3-G-CRIT-formula: 2-branch continuous formula matching mig 148 SQL.
function computeBand(rowsCount: number | null): { min: number; max: number | null } {
  if (rowsCount == null || rowsCount === 0) {
    return { min: 0, max: null };
  }
  return {
    min: Math.max(0, Math.floor(rowsCount * 0.7)),
    max: Math.ceil(rowsCount * 1.3) + 20,
  };
}

// Top-level comma split (commas not inside parentheses or quotes).
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let inStr = false;
  let strChar = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      cur += c;
      if (c === strChar) {
        // SQL doubled-quote escape: '' inside a quoted literal
        if (s[i + 1] === strChar) {
          cur += s[++i]!;
        } else {
          inStr = false;
        }
      }
    } else if (c === "'" || c === '"') {
      cur += c;
      inStr = true;
      strChar = c;
    } else if (c === '(') {
      depth++;
      cur += c;
    } else if (c === ')') {
      depth--;
      cur += c;
    } else if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim().length > 0) out.push(cur.trim());
  return out;
}

// Extract top-level parenthesized tuples from the SQL.
function extractTuples(sql: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (c === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0 && start >= 0) {
        tuples.push(sql.slice(start + 1, i));
        start = -1;
      }
    }
  }
  return tuples;
}

interface CatalogRow {
  seq: number;
  rowsCount: number | null;
}

describe('Phase E.4 v4 — mig 148 vs seed JSON parity (lifecycle_seq band keys)', () => {
  let catalogRows: CatalogRow[];
  let seed: Record<string, { default: unknown }>;

  beforeAll(() => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/129_seed_universal_stream_catalog.sql'),
      'utf-8',
    );
    seed = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'),
        'utf-8',
      ),
    ) as Record<string, { default: unknown }>;

    const tuples = extractTuples(sql);
    catalogRows = [];
    for (const t of tuples) {
      const parts = splitTopLevelCommas(t);
      if (parts.length !== EXPECTED_TUPLE_LENGTH) continue;
      const seqRaw = parts[SEQ_IDX]!.trim();
      const rcRaw = parts[ROWS_COUNT_IDX]!.trim();
      const seq = Number.parseInt(seqRaw, 10);
      if (!Number.isFinite(seq)) continue;
      const rowsCount = rcRaw === 'NULL' ? null : Number.parseInt(rcRaw, 10);
      catalogRows.push({ seq, rowsCount });
    }
  });

  it('extracts exactly 110 catalog rows from mig 129', () => {
    expect(catalogRows.length).toBe(110);
  });

  it('every seq in [1, 110] has both _min and _max keys in seed JSON', () => {
    const missing: string[] = [];
    for (const row of catalogRows) {
      const minKey = `lifecycle_seq_band_${row.seq}_min`;
      const maxKey = `lifecycle_seq_band_${row.seq}_max`;
      if (!(minKey in seed)) missing.push(minKey);
      if (!(maxKey in seed)) missing.push(maxKey);
    }
    expect(missing).toEqual([]);
  });

  it('every seed entry matches the 2-branch continuous formula applied to catalog rows_count', () => {
    const mismatches: string[] = [];
    for (const row of catalogRows) {
      const expected = computeBand(row.rowsCount);
      const seedMin = seed[`lifecycle_seq_band_${row.seq}_min`]?.default;
      const seedMax = seed[`lifecycle_seq_band_${row.seq}_max`]?.default;
      if (seedMin !== expected.min) {
        mismatches.push(`seq ${row.seq} min: seed=${String(seedMin)}, expected=${expected.min} (rows_count=${row.rowsCount})`);
      }
      if (seedMax !== expected.max) {
        mismatches.push(`seq ${row.seq} max: seed=${String(seedMax)}, expected=${String(expected.max)} (rows_count=${row.rowsCount})`);
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches.length).toBe(0);
  });

  // ─── Edge-case verification of the formula continuity property ──────

  it('rows_count=1 → band [0, 22] (low-volume continuous, +20 buffer)', () => {
    expect(computeBand(1)).toEqual({ min: 0, max: 22 });
  });

  it('rows_count=29 → band [20, 58] (continuous with rows_count=30)', () => {
    expect(computeBand(29)).toEqual({ min: 20, max: 58 });
  });

  it('rows_count=30 → band [21, 59] (no cliff vs rows_count=29)', () => {
    expect(computeBand(30)).toEqual({ min: 21, max: 59 });
  });

  it('rows_count=100 → band [70, 150] (steady-state ±30% + 20)', () => {
    expect(computeBand(100)).toEqual({ min: 70, max: 150 });
  });

  it('rows_count=904 (seq 19) → band [632, 1196]', () => {
    expect(computeBand(904)).toEqual({ min: 632, max: 1196 });
  });

  it('rows_count=NULL → band [0, null] (INFO-only)', () => {
    expect(computeBand(null)).toEqual({ min: 0, max: null });
  });

  it('rows_count=0 → band [0, null] (INFO-only, same as NULL)', () => {
    expect(computeBand(0)).toEqual({ min: 0, max: null });
  });

  // ─── lifecycle_seq_unclassified_max ──────────────────────────────────

  it('seed contains lifecycle_seq_unclassified_max with default 5000', () => {
    expect(seed.lifecycle_seq_unclassified_max).toBeDefined();
    expect(seed.lifecycle_seq_unclassified_max!.default).toBe(5000);
  });
});
