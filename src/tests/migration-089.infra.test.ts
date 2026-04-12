// 🔗 SPEC LINK: Valuation Engine + Claiming System (migration 089)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 089 — valuation + claiming schema', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/089_valuation_claiming_schema.sql'),
      'utf-8',
    );
  });

  // ─── cost_estimates.trade_contract_values ─────────────────────
  describe('cost_estimates JSONB column', () => {
    it('adds trade_contract_values as JSONB NOT NULL with empty-object default', () => {
      expect(sql).toMatch(
        /ALTER TABLE cost_estimates[\s\S]*?ADD COLUMN trade_contract_values JSONB NOT NULL/,
      );
      expect(sql).toMatch(/DEFAULT '\{\}'::jsonb/);
    });
  });

  // ─── tracked_projects ─────────────────────────────────────────
  describe('tracked_projects table', () => {
    it('creates the table with expected columns', () => {
      expect(sql).toMatch(/CREATE TABLE tracked_projects/);
      expect(sql).toMatch(/permit_num\s+VARCHAR\(30\)\s+NOT NULL/);
      expect(sql).toMatch(/revision_num\s+VARCHAR\(10\)\s+NOT NULL/);
      expect(sql).toMatch(/trade_slug\s+VARCHAR\(50\)\s+NOT NULL/);
      expect(sql).toMatch(/status\s+VARCHAR\(50\)\s+NOT NULL/);
      expect(sql).toMatch(/claimed_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT NOW\(\)/);
    });

    it('uses VARCHAR(128) for user_id, NOT UUID (WF3 Bug 1)', () => {
      // Firebase Auth UIDs are 28-char base64 strings, not UUID format.
      // Project convention: ADR 006, migrations 010/070/075/076.
      expect(sql).toMatch(/user_id\s+VARCHAR\(128\)\s+NOT NULL/);
      expect(sql).not.toMatch(/user_id\s+UUID/);
    });

    it('has updated_at column for status transition auditing (WF3 Bug 3)', () => {
      expect(sql).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT NOW\(\)/);
    });

    it('has CHECK constraint on status values', () => {
      expect(sql).toMatch(/chk_tracked_status/);
      expect(sql).toMatch(/'claimed_unverified'/);
      expect(sql).toMatch(/'verified'/);
      expect(sql).toMatch(/'expired'/);
    });

    it('UNIQUE includes revision_num (revisions can be materially different)', () => {
      expect(sql).toMatch(/uq_tracked_user_permit_trade/);
      // Must include revision_num — matches composite PK convention
      expect(sql).toMatch(
        /UNIQUE\s*\(user_id,\s*permit_num,\s*revision_num,\s*trade_slug\)/,
      );
    });

    it('has index on user_id for My Projects queries', () => {
      expect(sql).toMatch(/idx_tracked_projects_user/);
    });

    it('has index on permit for admin/analytics queries', () => {
      expect(sql).toMatch(/idx_tracked_projects_permit/);
    });
  });

  // ─── DOWN block ──────────────────────────────────────���────────
  describe('DOWN block', () => {
    it('has commented DOWN with DROP TABLE + DROP COLUMN', () => {
      expect(sql).toMatch(/-- DOWN/);
      expect(sql).toMatch(/DROP TABLE.*tracked_projects/);
      expect(sql).toMatch(/DROP COLUMN.*trade_contract_values/);
    });
  });
});
