// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2
//
// Live-DB integration test for migration 160 (lifecycle_status_history.event_date).
// WF3 Pass-2.5 Finding C Phase 1 of 5.
//
// Verifies the additive nullable column landed correctly against the
// testcontainer-applied schema:
//   1. event_date column exists on lifecycle_status_history
//   2. data_type = 'date'
//   3. is_nullable = 'YES'
//   4. column_default IS NULL
//   5. COMMENT ON COLUMN is non-empty (operator-discoverable semantics)
//
// Plus a source-shape regression-lock (no DB needed, separate describe):
//   - Migration file's -- DOWN block contains DROP COLUMN IF EXISTS event_date
//   - Migration file's -- UP block does NOT contain a DEFAULT clause on event_date
//
// Skipped when BUILDO_TEST_DB=1 / DATABASE_URL is not set.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const MIGRATION_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'migrations',
  '160_lifecycle_status_history_event_date.sql',
);

describe.skipIf(!dbAvailable())('migration 160 — lifecycle_status_history.event_date (live DB)', () => {
  it('event_date column exists with data_type=date, is_nullable=YES, column_default=NULL', async () => {
    const pool = getTestPool();
    if (!pool) return;
    const result = await pool.query<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'lifecycle_status_history'
          AND column_name = 'event_date'`,
    );
    expect(result.rows.length).toBe(1);
    const row = result.rows[0]!;
    expect(row.data_type).toBe('date');
    expect(row.is_nullable).toBe('YES');
    expect(row.column_default).toBeNull();
  });

  it('COMMENT ON COLUMN is populated (operator-discoverable semantics)', async () => {
    const pool = getTestPool();
    if (!pool) return;
    const result = await pool.query<{ description: string | null }>(
      `SELECT pgd.description
         FROM pg_catalog.pg_statio_all_tables AS st
         JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid
         JOIN information_schema.columns c
           ON c.table_schema = st.schemaname
          AND c.table_name = st.relname
          AND c.ordinal_position = pgd.objsubid
        WHERE c.table_name = 'lifecycle_status_history'
          AND c.column_name = 'event_date'`,
    );
    expect(result.rows.length).toBe(1);
    const row = result.rows[0]!;
    expect(row.description).not.toBeNull();
    expect(row.description).toMatch(/event_date|Finding C|WF3/i);
  });
});

describe('migration 160 — source-shape regression locks (no DB)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');

  it('-- UP block adds event_date as DATE without a DEFAULT clause', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS event_date DATE/);
    // No DEFAULT — would force a table rewrite on PG <11 and is semantically wrong
    // (column intent is NULL when source provides no date; not zero/sentinel).
    expect(sql).not.toMatch(/event_date\s+DATE\s+DEFAULT/i);
  });

  it('-- UP block includes COMMENT ON COLUMN with Finding C provenance', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN lifecycle_status_history\.event_date/);
    expect(sql).toMatch(/Finding C/);
  });

  it('-- DOWN block documents the manual DROP COLUMN rollback (commented per Rule 6)', () => {
    // Rule 6: DOWN blocks contain comments only (scripts/migrate.js runs every executable
    // line; an executable DROP in DOWN would auto-revert on re-apply). The rollback SQL
    // lives as a comment so an operator can copy-paste it manually if needed.
    const downBlock = sql.split(/--\s*DOWN/i)[1];
    expect(downBlock).toBeDefined();
    if (!downBlock) return;
    // The rollback statement appears as a commented line (preceded by `--`).
    expect(downBlock).toMatch(/--\s+ALTER TABLE lifecycle_status_history DROP COLUMN IF EXISTS event_date/);
    // Defense: assert no UNcommented ALTER TABLE in the DOWN block.
    const downLines = downBlock.split('\n');
    for (const line of downLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('ALTER TABLE') || trimmed.startsWith('DROP ')) {
        throw new Error(`DOWN block contains executable SQL (Rule 6 violation): "${trimmed}"`);
      }
    }
  });

  it('-- UP block uses ADD COLUMN IF NOT EXISTS (idempotent)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS event_date/);
  });
});
