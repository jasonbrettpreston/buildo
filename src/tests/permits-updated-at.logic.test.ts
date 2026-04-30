// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Amber Update Flash
//            docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detailed Investigation View
//
// Migration 115 structural assertions — verifies the file applies the
// zero-downtime sequence (§3.1) for the 237K-row permits table:
// nullable add → backfill → default + NOT NULL → trigger.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION_PATH = resolve(__dirname, '../../migrations/115_permits_updated_at.sql');
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('migration 115 — permits.updated_at', () => {
  it('adds the column nullable first (no default in the ADD COLUMN line)', () => {
    // The §3.1 zero-downtime pattern requires a nullable add to avoid a
    // table rewrite on the 237K-row permits table. A `DEFAULT NOW()` in the
    // ADD COLUMN line would force PG to compute a per-row default, which
    // is volatile and triggers a rewrite even on PG 11+.
    expect(sql).toMatch(/ALTER TABLE permits ADD COLUMN[^;]*updated_at TIMESTAMPTZ\s*;/i);
    expect(sql).not.toMatch(/ADD COLUMN[^;]*updated_at[^;]*DEFAULT/i);
  });

  it('backfills existing rows from last_seen_at/first_seen_at/NOW()', () => {
    expect(sql).toMatch(/UPDATE permits[\s\S]*SET updated_at = COALESCE\(last_seen_at, first_seen_at, NOW\(\)\)/i);
  });

  it('sets the DEFAULT and NOT NULL constraints AFTER the backfill', () => {
    // Anchor on the ALTER TABLE statement so the explanatory comment block
    // at the top of the file doesn't shadow the real DDL position.
    const backfillIdx = sql.search(/UPDATE permits\s/i);
    const defaultIdx = sql.search(/ALTER TABLE permits ALTER COLUMN updated_at SET DEFAULT NOW\(\)/i);
    const notNullIdx = sql.search(/ALTER TABLE permits ALTER COLUMN updated_at SET NOT NULL/i);
    expect(backfillIdx).toBeGreaterThan(-1);
    expect(defaultIdx).toBeGreaterThan(backfillIdx);
    expect(notNullIdx).toBeGreaterThan(backfillIdx);
  });

  it('uses the validated-CHECK pattern so SET NOT NULL skips the table scan', () => {
    // Without this pattern, ALTER COLUMN ... SET NOT NULL forces a full
    // table scan under ACCESS EXCLUSIVE lock — 100-500ms blocked window
    // on the 237K-row permits table. PG 12+ skips the scan when a
    // validated CHECK (col IS NOT NULL) constraint already exists.
    expect(sql).toMatch(/ADD CONSTRAINT permits_updated_at_not_null\s+CHECK \(updated_at IS NOT NULL\) NOT VALID/i);
    expect(sql).toMatch(/VALIDATE CONSTRAINT permits_updated_at_not_null/i);
    expect(sql).toMatch(/DROP CONSTRAINT permits_updated_at_not_null/i);
    // Order: ADD NOT VALID → VALIDATE → SET NOT NULL → DROP
    const addCheckIdx = sql.search(/ADD CONSTRAINT permits_updated_at_not_null/i);
    const validateIdx = sql.search(/VALIDATE CONSTRAINT permits_updated_at_not_null/i);
    const notNullIdx = sql.search(/ALTER TABLE permits ALTER COLUMN updated_at SET NOT NULL/i);
    const dropCheckIdx = sql.search(/DROP CONSTRAINT permits_updated_at_not_null/i);
    expect(validateIdx).toBeGreaterThan(addCheckIdx);
    expect(notNullIdx).toBeGreaterThan(validateIdx);
    expect(dropCheckIdx).toBeGreaterThan(notNullIdx);
  });

  it('reuses trigger_set_timestamp() from migration 100 (does not redefine)', () => {
    // The §10 plan note: function is reused, only the trigger row is added.
    expect(sql).toMatch(/CREATE TRIGGER set_updated_at[\s\S]*BEFORE UPDATE ON permits[\s\S]*EXECUTE FUNCTION trigger_set_timestamp\(\)/i);
    // Negative assertion: this migration must NOT redefine the function.
    expect(sql).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION trigger_set_timestamp/i);
  });

  it('has a DOWN block that drops the trigger and the column', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS set_updated_at ON permits/i);
    expect(sql).toMatch(/ALTER TABLE permits DROP COLUMN IF EXISTS updated_at/i);
  });
});
