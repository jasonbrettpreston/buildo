// Infra Layer Tests — Migration 073 (timing_calibration schema)
// 🔗 SPEC LINK: docs/specs/product/future/71_lead_timing_engine.md
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migrations',
  '073_timing_calibration.sql',
);

describe('Migration 073 — timing_calibration', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

  it('has UP and DOWN blocks', () => {
    expect(sql).toMatch(/^--\s*UP\b/m);
    expect(sql).toMatch(/^--\s*DOWN\b/m);
  });

  it('creates the timing_calibration table', () => {
    expect(sql).toMatch(/CREATE TABLE timing_calibration/);
  });

  it('has permit_type NOT NULL UNIQUE', () => {
    expect(sql).toMatch(/permit_type\s+VARCHAR\(100\)\s+NOT NULL/);
    expect(sql).toMatch(/UNIQUE \(permit_type\)/);
  });

  it('has median/p25/p75 INTEGER NOT NULL', () => {
    expect(sql).toMatch(/median_days_to_first_inspection\s+INTEGER\s+NOT NULL/);
    expect(sql).toMatch(/p25_days\s+INTEGER\s+NOT NULL/);
    expect(sql).toMatch(/p75_days\s+INTEGER\s+NOT NULL/);
  });

  it('has sample_size and computed_at default NOW', () => {
    expect(sql).toMatch(/sample_size\s+INTEGER\s+NOT NULL/);
    expect(sql).toMatch(/computed_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT NOW\(\)/);
  });
});
