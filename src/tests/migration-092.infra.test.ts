// 🔗 SPEC LINK: Marketplace Control Panel (migration 092)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 092 — control panel', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/092_control_panel.sql'),
      'utf-8',
    );
  });

  describe('trade_configurations table', () => {
    it('creates with expected columns', () => {
      expect(sql).toMatch(/CREATE TABLE trade_configurations/);
      expect(sql).toMatch(/trade_slug\s+VARCHAR\(50\)\s+PRIMARY KEY/);
      expect(sql).toMatch(/bid_phase_cutoff\s+VARCHAR\(10\)/);
      expect(sql).toMatch(/work_phase_target\s+VARCHAR\(10\)/);
      expect(sql).toMatch(/imminent_window_days\s+INTEGER/);
      expect(sql).toMatch(/allocation_pct\s+DECIMAL\(5,4\)/);
    });

    it('seeds 32 trades', () => {
      const matches = sql.match(/\('[\w-]+',\s*'P/g);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBe(32);
    });

    it('uses ON CONFLICT DO NOTHING for idempotent seeding', () => {
      expect(sql).toMatch(/ON CONFLICT \(trade_slug\) DO NOTHING/);
    });
  });

  describe('logic_variables table', () => {
    it('creates with expected columns', () => {
      expect(sql).toMatch(/CREATE TABLE logic_variables/);
      expect(sql).toMatch(/variable_key\s+VARCHAR\(100\)\s+PRIMARY KEY/);
      expect(sql).toMatch(/variable_value\s+DECIMAL\s+NOT NULL/);
    });

    it('seeds scoring constants', () => {
      expect(sql).toMatch(/'los_multiplier_bid'/);
      expect(sql).toMatch(/'los_multiplier_work'/);
      expect(sql).toMatch(/'los_penalty_tracking'/);
      expect(sql).toMatch(/'los_penalty_saving'/);
      expect(sql).toMatch(/'liar_gate_threshold'/);
    });

    it('uses ON CONFLICT DO NOTHING for idempotent seeding', () => {
      expect(sql).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING/);
    });
  });

  describe('does NOT recreate lead_analytics', () => {
    it('does not contain CREATE TABLE lead_analytics', () => {
      expect(sql).not.toMatch(/CREATE TABLE lead_analytics/);
    });
  });

  describe('DOWN block', () => {
    it('has commented DOWN', () => {
      expect(sql).toMatch(/-- DOWN/);
      expect(sql).toMatch(/DROP TABLE.*logic_variables/);
      expect(sql).toMatch(/DROP TABLE.*trade_configurations/);
    });
  });
});
