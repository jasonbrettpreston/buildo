// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md §3.9
//
// Migration 085 file-shape test. Asserts the migration file exists on
// disk and contains the required columns, indexes, DO-block wrappers
// for large-table index creation, and DOWN block.
//
// This is a file-shape test, NOT an applied-migration test — it parses
// the SQL source to verify expected structure without needing a live DB.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  process.cwd(),
  'migrations',
  '085_lifecycle_phase_columns.sql',
);

const source = readFileSync(MIGRATION_PATH, 'utf8');

describe('Migration 085 — lifecycle_phase columns', () => {
  test('file exists and is non-empty', () => {
    expect(source.length).toBeGreaterThan(100);
  });

  test('has UP block marker', () => {
    expect(source).toMatch(/^\s*--\s*UP\b/m);
  });

  test('has DOWN block marker', () => {
    expect(source).toMatch(/^\s*--\s*DOWN\b/m);
  });

  // ─────────────────────────────────────────────────────────────
  // permits.lifecycle_phase + lifecycle_stalled + lifecycle_classified_at
  // ─────────────────────────────────────────────────────────────
  test('adds permits.lifecycle_phase column as VARCHAR(10)', () => {
    expect(source).toMatch(
      /ALTER TABLE permits\s+ADD COLUMN lifecycle_phase VARCHAR\(10\)/,
    );
  });

  test('adds permits.lifecycle_stalled column as NOT NULL with DEFAULT false', () => {
    expect(source).toMatch(
      /ALTER TABLE permits\s+ADD COLUMN lifecycle_stalled BOOLEAN NOT NULL DEFAULT false/,
    );
  });

  test('adds permits.lifecycle_classified_at column as TIMESTAMPTZ', () => {
    expect(source).toMatch(
      /ALTER TABLE permits\s+ADD COLUMN lifecycle_classified_at TIMESTAMPTZ/,
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Large-table index creation MUST be wrapped in DO/EXECUTE blocks
  // per the 067/078/083 pattern (validate-migration.js rule)
  // ─────────────────────────────────────────────────────────────
  test('idx_permits_lifecycle_phase is created inside a DO block', () => {
    expect(source).toMatch(
      /DO \$phase_idx\$[\s\S]*?EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permits_lifecycle_phase[\s\S]*?\$phase_idx\$/,
    );
  });

  test('idx_permits_lifecycle_phase is a partial index WHERE lifecycle_phase IS NOT NULL', () => {
    expect(source).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_permits_lifecycle_phase[\s\S]*?WHERE lifecycle_phase IS NOT NULL/,
    );
  });

  test('idx_permits_lifecycle_dirty is created inside a DO block', () => {
    expect(source).toMatch(
      /DO \$dirty_idx\$[\s\S]*?EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permits_lifecycle_dirty[\s\S]*?\$dirty_idx\$/,
    );
  });

  test('idx_permits_lifecycle_dirty is a partial index WHERE lifecycle_classified_at IS NULL', () => {
    expect(source).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_permits_lifecycle_dirty[\s\S]*?WHERE lifecycle_classified_at IS NULL/,
    );
  });

  // ─────────────────────────────────────────────────────────────
  // coa_applications columns
  // ─────────────────────────────────────────────────────────────
  test('adds coa_applications.lifecycle_phase column', () => {
    expect(source).toMatch(
      /ALTER TABLE coa_applications\s+ADD COLUMN lifecycle_phase VARCHAR\(10\)/,
    );
  });

  test('adds coa_applications.lifecycle_classified_at column', () => {
    expect(source).toMatch(
      /ALTER TABLE coa_applications\s+ADD COLUMN lifecycle_classified_at TIMESTAMPTZ/,
    );
  });

  test('coa_applications indexes created directly (not in DO block — small table)', () => {
    expect(source).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_coa_lifecycle_phase\s+ON coa_applications \(lifecycle_phase\)\s+WHERE lifecycle_phase IS NOT NULL/,
    );
    expect(source).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_coa_lifecycle_dirty\s+ON coa_applications \(id\)\s+WHERE lifecycle_classified_at IS NULL/,
    );
  });

  // ─────────────────────────────────────────────────────────────
  // DOWN block contents (commented, per repo convention)
  // ─────────────────────────────────────────────────────────────
  test('DOWN block mentions both permits and coa_applications drops', () => {
    const downIndex = source.search(/^\s*--\s*DOWN\b/m);
    expect(downIndex).toBeGreaterThan(0);
    const downBlock = source.slice(downIndex);
    expect(downBlock).toMatch(/DROP COLUMN IF EXISTS lifecycle_phase/);
    expect(downBlock).toMatch(/DROP COLUMN IF EXISTS lifecycle_stalled/);
    expect(downBlock).toMatch(/DROP COLUMN IF EXISTS lifecycle_classified_at/);
    expect(downBlock).toMatch(/DROP INDEX IF EXISTS idx_permits_lifecycle_phase/);
    expect(downBlock).toMatch(/DROP INDEX IF EXISTS idx_coa_lifecycle_phase/);
  });

  // ─────────────────────────────────────────────────────────────
  // Column COMMENTs for schema documentation
  // ─────────────────────────────────────────────────────────────
  test('permits.lifecycle_phase has a COMMENT describing the value domain', () => {
    expect(source).toMatch(
      /COMMENT ON COLUMN permits\.lifecycle_phase IS[\s\S]*?Strangler Fig[\s\S]*?P3[\s\S]*?O1/,
    );
  });

  test('coa_applications.lifecycle_phase has a COMMENT describing P1/P2', () => {
    expect(source).toMatch(
      /COMMENT ON COLUMN coa_applications\.lifecycle_phase IS[\s\S]*?P1[\s\S]*?P2/,
    );
  });
});
