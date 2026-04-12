// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md (Phase 1 timing schema)
//
// File-shape tests for migration 086 — predictive timing schema.
// Validates exact column names, types, indexes, constraints, FKs,
// and an executable DOWN block.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 086 — predictive timing schema', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/086_predictive_timing_schema.sql'),
      'utf-8',
    );
  });

  // ─── permits.phase_started_at ─────────────────────────────────
  describe('permits.phase_started_at column', () => {
    it('adds phase_started_at as TIMESTAMPTZ', () => {
      expect(sql).toMatch(
        /ALTER TABLE permits ADD COLUMN phase_started_at TIMESTAMPTZ/,
      );
    });

    it('is nullable with no DEFAULT (instant ALTER, no table rewrite)', () => {
      const alterLine = sql.match(
        /ALTER TABLE permits ADD COLUMN phase_started_at[^;]*/,
      );
      expect(alterLine).toBeTruthy();
      expect(alterLine![0]).not.toMatch(/NOT NULL/);
      expect(alterLine![0]).not.toMatch(/DEFAULT/);
    });
  });

  // ─── permit_phase_transitions ─────────────────────────────────
  describe('permit_phase_transitions table', () => {
    it('creates the table with expected columns', () => {
      expect(sql).toMatch(/CREATE TABLE permit_phase_transitions/);
      expect(sql).toMatch(/id\s+SERIAL PRIMARY KEY/);
      expect(sql).toMatch(/permit_num\s+VARCHAR\(30\)\s+NOT NULL/);
      expect(sql).toMatch(/revision_num\s+VARCHAR\(10\)\s+NOT NULL/);
      expect(sql).toMatch(/from_phase\s+VARCHAR\(10\)/);
      expect(sql).toMatch(/to_phase\s+VARCHAR\(10\)\s+NOT NULL/);
      expect(sql).toMatch(/transitioned_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT NOW\(\)/);
    });

    it('has CHECK constraints on from_phase and to_phase against VALID_PHASES', () => {
      expect(sql).toMatch(/chk_transitions_from_phase/);
      expect(sql).toMatch(/chk_transitions_to_phase/);
      // Both must include the full phase domain
      expect(sql).toMatch(/from_phase IN \([^)]*'P11'[^)]*'O3'/);
      expect(sql).toMatch(/to_phase IN \([^)]*'P11'[^)]*'O3'/);
    });

    it('has FK to permits with ON DELETE CASCADE', () => {
      expect(sql).toMatch(/fk_transitions_permit/);
      expect(sql).toMatch(
        /REFERENCES permits\(permit_num,\s*revision_num\)/,
      );
      expect(sql).toMatch(/ON DELETE CASCADE/);
    });

    it('has 4 indexes (timeline, calibration pair, target, neighbourhood)', () => {
      expect(sql).toMatch(/idx_phase_transitions_permit/);
      expect(sql).toMatch(/idx_phase_transitions_pair/);
      expect(sql).toMatch(/idx_phase_transitions_target/);
      expect(sql).toMatch(/idx_phase_transitions_neighbourhood/);
    });

    it('neighbourhood index covers (neighbourhood_id, from_phase, to_phase)', () => {
      expect(sql).toMatch(
        /idx_phase_transitions_neighbourhood[\s\S]*?\(neighbourhood_id,\s*from_phase,\s*to_phase\)/,
      );
    });
  });

  // ─── trade_forecasts ──────────────────────────────────────────
  describe('trade_forecasts table', () => {
    it('creates the table with composite PK', () => {
      expect(sql).toMatch(/CREATE TABLE trade_forecasts/);
      expect(sql).toMatch(
        /PRIMARY KEY\s*\(permit_num,\s*revision_num,\s*trade_slug\)/,
      );
    });

    it('has CHECK constraint on confidence (low/medium/high)', () => {
      expect(sql).toMatch(/chk_forecast_confidence/);
      expect(sql).toMatch(
        /confidence IN \(\s*'low',\s*'medium',\s*'high'\s*\)/,
      );
    });

    it('has CHECK constraint on urgency (6 valid values)', () => {
      expect(sql).toMatch(/chk_forecast_urgency/);
      expect(sql).toMatch(/urgency IN \(/);
      expect(sql).toMatch(/'unknown'/);
      expect(sql).toMatch(/'imminent'/);
      expect(sql).toMatch(/'delayed'/);
      expect(sql).toMatch(/'overdue'/);
    });

    it('has FK to permits with ON DELETE CASCADE', () => {
      expect(sql).toMatch(/fk_forecasts_permit/);
      expect(sql).toMatch(/ON DELETE CASCADE/);
    });

    it('has calibration source metadata columns', () => {
      expect(sql).toMatch(/calibration_method\s+VARCHAR\(30\)/);
      expect(sql).toMatch(/sample_size\s+INT/);
      expect(sql).toMatch(/median_days\s+INT/);
      expect(sql).toMatch(/p25_days\s+INT/);
      expect(sql).toMatch(/p75_days\s+INT/);
    });

    it('has 2 indexes for feed queries', () => {
      expect(sql).toMatch(/idx_trade_forecasts_trade_urgency/);
      expect(sql).toMatch(/idx_trade_forecasts_trade_start/);
    });

    it('imminent-leads index is partial (WHERE predicted_start IS NOT NULL)', () => {
      expect(sql).toMatch(
        /idx_trade_forecasts_trade_start[\s\S]*?WHERE predicted_start IS NOT NULL/,
      );
    });
  });

  // ─── DOWN block ───────────────────────────────────────────────
  // Project convention: DOWN blocks are COMMENTED OUT because the
  // migration runner executes the full file with no UP/DOWN parsing.
  // The validator checks for the TEXT `-- DOWN` as a documentation
  // requirement. Tests verify the rollback SQL is present (even if
  // commented) and covers all 3 structures.
  describe('DOWN block', () => {
    let downSection: string;
    beforeAll(() => {
      const downIdx = sql.indexOf('-- DOWN');
      expect(downIdx).toBeGreaterThan(-1);
      downSection = sql.slice(downIdx);
    });

    it('contains DROP TABLE for both new tables (commented per convention)', () => {
      expect(downSection).toMatch(/DROP TABLE.*trade_forecasts/);
      expect(downSection).toMatch(/DROP TABLE.*permit_phase_transitions/);
    });

    it('contains DROP COLUMN for phase_started_at (commented per convention)', () => {
      expect(downSection).toMatch(/DROP COLUMN.*phase_started_at/);
    });

    it('uses IF EXISTS for safety', () => {
      expect(downSection).toMatch(/IF EXISTS/);
    });
  });
});
