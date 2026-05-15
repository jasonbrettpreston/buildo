// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R9
//             docs/specs/01-pipeline/42_chain_coa.md §6.7 step 6
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7
//
// Pure-function helper tests for scripts/compute-phase-calibration.js — Phase E.3 v5.
// Validates buildBulkInsertSQL + flattenBuckets + classifyTier per v5 fold v3-G-MED-1
// (name-based lookup; order-independent).

import { describe, it, expect } from 'vitest';

// The script is a CommonJS module — require it once at module top. The script
// exports the helpers under `module.exports` so they can be unit-tested without
// invoking the main `pipeline.run` block (gated by `require.main === module`).
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const calibration = require('../../scripts/compute-phase-calibration.js') as {
  ADVISORY_LOCK_ID: number;
  buildBulkInsertSQL: (table: string, cols: readonly string[], rowCount: number) => string;
  flattenBuckets: (
    buckets: ReadonlyArray<Record<string, unknown>>,
    runAt: Date | string,
  ) => Array<unknown>;
  classifyTier: (sampleSize: number) => 'high' | 'mid' | 'low' | 'outlier';
  COHORT_INSERT_COLS: readonly string[];
};

describe('compute-phase-calibration — pure-function helpers (Phase E.3 v5)', () => {
  describe('buildBulkInsertSQL (v2 fold #4 — eliminates manual placeholder arithmetic)', () => {
    it('produces correct placeholder string for 3 cols × 2 rows', () => {
      const sql = calibration.buildBulkInsertSQL('t', ['a', 'b', 'c'], 2);
      expect(sql).toBe(
        'INSERT INTO t (a, b, c) VALUES ($1, $2, $3), ($4, $5, $6)',
      );
    });

    it('produces correct placeholder string for 11 cols × 1 row (Phase E.3 shape)', () => {
      const cols = calibration.COHORT_INSERT_COLS;
      expect(cols).toHaveLength(11);
      const sql = calibration.buildBulkInsertSQL('phase_stay_calibration_staging', cols, 1);
      // 11 placeholders, named-column list
      expect(sql).toMatch(
        /^INSERT INTO phase_stay_calibration_staging \(.+\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11\)$/,
      );
    });

    it('rowCount=0 throws — caller must guard before invocation (v6 fold v5-D-2 — Independent Issue 1)', () => {
      // The legacy implementation would produce `INSERT INTO t (a) VALUES `
      // (no tuples, trailing space), a SQL syntax error. The v6 fold makes the
      // empty-case contract explicit: callers MUST guard before invocation.
      expect(() => calibration.buildBulkInsertSQL('t', ['a'], 0)).toThrow(/rowCount must be > 0/);
      expect(() => calibration.buildBulkInsertSQL('t', ['a'], -1)).toThrow(/rowCount must be > 0/);
    });
  });

  describe('flattenBuckets (v5 fold v3-G-MED-1 — name-based lookup, order-independent)', () => {
    const runAt = new Date('2026-05-14T12:00:00.000Z');

    it('maps each bucket to params in COHORT_INSERT_COLS order, regardless of input key order', () => {
      const cols = calibration.COHORT_INSERT_COLS;
      // Build a bucket with keys in REVERSED order from COHORT_INSERT_COLS.
      // Name-based lookup must produce the same flattened output as a normally-ordered bucket.
      const orderedBucket: Record<string, unknown> = {};
      const reversedBucket: Record<string, unknown> = {};
      cols.forEach((col, i) => {
        const value = col === 'computed_at' ? null : `v_${i}`;
        orderedBucket[col] = value;
      });
      [...cols].reverse().forEach((col, i) => {
        const value = col === 'computed_at' ? null : `v_${cols.length - 1 - i}`;
        reversedBucket[col] = value;
      });

      const orderedParams = calibration.flattenBuckets([orderedBucket], runAt);
      const reversedParams = calibration.flattenBuckets([reversedBucket], runAt);
      expect(orderedParams).toEqual(reversedParams);
    });

    it('replaces `computed_at` with runAt timestamp (per v5 special-case)', () => {
      const cols = calibration.COHORT_INSERT_COLS;
      const bucket: Record<string, unknown> = {};
      cols.forEach((col) => {
        bucket[col] = col === 'computed_at' ? 'IGNORED' : 'value';
      });
      const params = calibration.flattenBuckets([bucket], runAt);
      const computedAtIdx = cols.indexOf('computed_at');
      expect(params[computedAtIdx]).toBe(runAt);
    });

    it('missing keys produce null (defensive nullable handling)', () => {
      // CoA-side buckets can legitimately have null permit_type / null project_type /
      // null coa_type_class. The helper must produce explicit null parameter values
      // for these, not undefined (which pg.js would convert to a SQL error).
      const params = calibration.flattenBuckets([{}], runAt);
      const computedAtIdx = calibration.COHORT_INSERT_COLS.indexOf('computed_at');
      params.forEach((p, i) => {
        if (i === computedAtIdx) {
          expect(p).toBe(runAt);
        } else {
          expect(p).toBeNull();
        }
      });
    });

    it('flattens N buckets into N × cols.length params', () => {
      const cols = calibration.COHORT_INSERT_COLS;
      const buckets = Array.from({ length: 4 }, (_, i) => ({ permit_type: `pt-${i}` }));
      const params = calibration.flattenBuckets(buckets, runAt);
      expect(params).toHaveLength(4 * cols.length);
    });
  });

  describe('classifyTier (v2 fold #11 + v5 — sample-size boundaries)', () => {
    // Tier boundaries:
    //   high:    sample_size >= 100
    //   mid:     30 <= sample_size < 100
    //   low:     10 <= sample_size < 30
    //   outlier: sample_size < 10

    it('classifies 100 as high', () => {
      expect(calibration.classifyTier(100)).toBe('high');
    });

    it('classifies 99 as mid', () => {
      expect(calibration.classifyTier(99)).toBe('mid');
    });

    it('classifies 30 as mid (boundary)', () => {
      expect(calibration.classifyTier(30)).toBe('mid');
    });

    it('classifies 29 as low', () => {
      expect(calibration.classifyTier(29)).toBe('low');
    });

    it('classifies 10 as low (boundary)', () => {
      expect(calibration.classifyTier(10)).toBe('low');
    });

    it('classifies 9 as outlier', () => {
      expect(calibration.classifyTier(9)).toBe('outlier');
    });

    it('classifies 1 as outlier', () => {
      expect(calibration.classifyTier(1)).toBe('outlier');
    });
  });

  describe('ADVISORY_LOCK_ID (Spec 47 §R2 — registry-assigned uniqueness)', () => {
    it('exports ADVISORY_LOCK_ID = 93 (registry-assigned; owning spec 84 taken by classify-lifecycle-phase.js)', () => {
      expect(calibration.ADVISORY_LOCK_ID).toBe(93);
    });
  });

  describe('COHORT_INSERT_COLS (Phase E.3 v5 — shape contract)', () => {
    it('includes 11 column names in the canonical order', () => {
      // Order must match what the staging-table INSERT VALUES placeholders reference.
      // Tests are documentation: column reorders must update both this assertion
      // AND the buildBulkInsertSQL invocations.
      expect(calibration.COHORT_INSERT_COLS).toEqual([
        'permit_type',
        'project_type',
        'coa_type_class',
        'from_seq',
        'to_seq',
        'phase',
        'median_days',
        'p25_days',
        'p75_days',
        'sample_size',
        'computed_at',
      ]);
    });
  });
});
