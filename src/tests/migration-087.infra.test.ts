// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md (Phase 3)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 087 — phase_calibration', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/087_phase_calibration.sql'),
      'utf-8',
    );
  });

  it('creates phase_calibration table with expected columns', () => {
    expect(sql).toMatch(/CREATE TABLE phase_calibration/);
    expect(sql).toMatch(/from_phase\s+VARCHAR\(10\)\s+NOT NULL/);
    expect(sql).toMatch(/to_phase\s+VARCHAR\(10\)\s+NOT NULL/);
    expect(sql).toMatch(/permit_type\s+VARCHAR\(100\)/);
    expect(sql).toMatch(/median_days\s+INT\s+NOT NULL/);
    expect(sql).toMatch(/p25_days\s+INT\s+NOT NULL/);
    expect(sql).toMatch(/p75_days\s+INT\s+NOT NULL/);
    expect(sql).toMatch(/sample_size\s+INT\s+NOT NULL/);
  });

  it('has CHECK constraints on from_phase and to_phase', () => {
    expect(sql).toMatch(/chk_calibration_from_phase/);
    expect(sql).toMatch(/chk_calibration_to_phase/);
    // from_phase allows 'ISSUED' as a special value
    expect(sql).toMatch(/'ISSUED'/);
  });

  it('has CHECK on sample_size >= 5', () => {
    expect(sql).toMatch(/chk_calibration_sample/);
    expect(sql).toMatch(/sample_size >= 5/);
  });

  it('has unique index using COALESCE for NULL permit_type', () => {
    expect(sql).toMatch(/idx_phase_calibration_unique/);
    expect(sql).toMatch(/COALESCE\(permit_type,\s*'__ALL__'\)/);
  });

  it('has lookup index on (from_phase, permit_type)', () => {
    expect(sql).toMatch(/idx_phase_calibration_from/);
  });

  it('has commented DOWN block', () => {
    expect(sql).toMatch(/-- DOWN/);
    expect(sql).toMatch(/DROP TABLE.*phase_calibration/);
  });
});
