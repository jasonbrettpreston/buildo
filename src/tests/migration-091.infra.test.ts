// 🔗 SPEC LINK: Signal Evolution (migration 091)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 091 — signal evolution schema', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/091_signal_evolution.sql'),
      'utf-8',
    );
  });

  // ─── lead_analytics ───────────────────────────────────────────
  describe('lead_analytics table', () => {
    it('creates lead_analytics with VARCHAR(100) PRIMARY KEY', () => {
      expect(sql).toMatch(/CREATE TABLE lead_analytics/);
      expect(sql).toMatch(/lead_key\s+VARCHAR\(100\)\s+PRIMARY KEY/);
    });

    it('has tracking_count and saving_count with non-negative CHECK', () => {
      expect(sql).toMatch(/tracking_count\s+INTEGER\s+NOT NULL\s+DEFAULT 0/);
      expect(sql).toMatch(/saving_count\s+INTEGER\s+NOT NULL\s+DEFAULT 0/);
      expect(sql).toMatch(/chk_tracking_count/);
      expect(sql).toMatch(/chk_saving_count/);
      expect(sql).toMatch(/tracking_count >= 0/);
      expect(sql).toMatch(/saving_count >= 0/);
    });

    it('documents why no expression index was added (formula mismatch)', () => {
      // Adversarial HIGH-2: the competition formula uses 0.3 * saving_count
      // weighting, so a raw sum index would be dead weight.
      expect(sql).toMatch(/expression index/i);
      expect(sql).toMatch(/removed/i);
    });
  });

  // ─── cost_estimates audit columns ─────────────────────────────
  describe('cost_estimates audit columns', () => {
    it('adds is_geometric_override BOOLEAN', () => {
      expect(sql).toMatch(/is_geometric_override\s+BOOLEAN\s+NOT NULL\s+DEFAULT false/);
    });

    it('adds modeled_gfa_sqm DECIMAL (nullable)', () => {
      expect(sql).toMatch(/modeled_gfa_sqm\s+DECIMAL/);
    });

    it('does NOT add trade_contract_values (already exists from migration 089)', () => {
      expect(sql).not.toMatch(/ADD COLUMN trade_contract_values/);
      expect(sql).toMatch(/trade_contract_values already exists/);
    });
  });

  // ─── trade_forecasts scoring columns ──────────────────────────
  describe('trade_forecasts scoring columns', () => {
    it('adds opportunity_score with CHECK 0-100', () => {
      expect(sql).toMatch(/opportunity_score\s+INTEGER\s+NOT NULL\s+DEFAULT 0/);
      expect(sql).toMatch(/chk_opportunity_score/);
      expect(sql).toMatch(/opportunity_score >= 0 AND opportunity_score <= 100/);
    });

    it('adds target_window with CHECK (bid/work)', () => {
      expect(sql).toMatch(/target_window\s+VARCHAR\(20\)/);
      expect(sql).toMatch(/chk_target_window/);
      expect(sql).toMatch(/'bid'/);
      expect(sql).toMatch(/'work'/);
    });
  });

  // ─── DOWN block ───────────────────────────────────────────────
  describe('DOWN block', () => {
    it('has commented DOWN covering all changes', () => {
      expect(sql).toMatch(/-- DOWN/);
      expect(sql).toMatch(/DROP TABLE.*lead_analytics/);
      expect(sql).toMatch(/DROP COLUMN.*opportunity_score/);
      expect(sql).toMatch(/DROP COLUMN.*is_geometric_override/);
    });
  });
});
