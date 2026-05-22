// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2
//
// Live-DB integration test for migration 161 (CHECK constraint locking
// classifier-derived rows to event_date IS NULL). WF3 Pass-2.5 Finding C
// Phase 4 of 5. Resolves Phase 1 review_followups row 153 (Gemini MEDIUM).
//
// Verifies:
//   1. Constraint exists in pg_constraint with the expected name
//   2. INSERT rejected: detected_by='classify-lifecycle-phase.js' AND event_date IS NOT NULL
//   3. INSERT allowed:  detected_by='classify-lifecycle-phase.js' AND event_date IS NULL
//   4. INSERT allowed:  detected_by='load-permits.js' AND event_date IS NOT NULL
//      (constraint only applies to classifier-derived rows)
//
// Plus a source-shape regression-lock (no DB):
//   - Migration UP uses NOT VALID + separate VALIDATE pattern (Spec 47 §18.4)
//   - DOWN block is comments-only per Rule 6
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
  '161_lifecycle_status_history_classifier_event_date_check.sql',
);

const CONSTRAINT_NAME = 'lifecycle_status_history_classifier_event_date_null';
const TEST_LEAD_ID = 'permit:I1TEST-C4-MIG161:00';

describe.skipIf(!dbAvailable())('migration 161 — classifier event_date CHECK constraint (live DB)', () => {
  it('constraint exists in pg_constraint with the expected name', async () => {
    const pool = getTestPool();
    if (!pool) return;
    const result = await pool.query<{ conname: string; consrc: string | null }>(
      `SELECT conname, pg_get_constraintdef(oid) AS consrc
         FROM pg_constraint
        WHERE conname = $1`,
      [CONSTRAINT_NAME],
    );
    expect(result.rows.length).toBe(1);
    const row = result.rows[0]!;
    expect(row.conname).toBe(CONSTRAINT_NAME);
    // pg_get_constraintdef returns "CHECK ((detected_by <> 'classify-lifecycle-phase.js'::character varying OR event_date IS NULL))"
    // — accept either != or <> per PG's canonical form.
    expect(row.consrc).toMatch(/CHECK/);
    expect(row.consrc).toMatch(/classify-lifecycle-phase\.js/);
    expect(row.consrc).toMatch(/event_date IS NULL/);
  });

  it('REJECTS INSERT with detected_by=classify-lifecycle-phase.js AND event_date IS NOT NULL', async () => {
    const pool = getTestPool();
    if (!pool) return;
    await expect(
      pool.query(
        `INSERT INTO lifecycle_status_history
           (lead_id, from_status, to_status, transitioned_at, detected_by, event_date)
         VALUES ($1, NULL, 'Permit Issued', NOW(), 'classify-lifecycle-phase.js', $2::date)`,
        [TEST_LEAD_ID, '2024-05-15'],
      ),
    ).rejects.toThrow(/check constraint|lifecycle_status_history_classifier_event_date_null/i);
  });

  it('ALLOWS INSERT with detected_by=classify-lifecycle-phase.js AND event_date IS NULL', async () => {
    const pool = getTestPool();
    if (!pool) return;
    const allowedLeadId = `${TEST_LEAD_ID}-allowed1`;
    await pool.query(
      `INSERT INTO lifecycle_status_history
         (lead_id, from_status, to_status, transitioned_at, detected_by, event_date)
       VALUES ($1, NULL, 'Permit Issued', NOW(), 'classify-lifecycle-phase.js', NULL)`,
      [allowedLeadId],
    );
    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM lifecycle_status_history WHERE lead_id = $1`,
      [allowedLeadId],
    );
    expect(res.rows[0]!.count).toBe('1');
    // Cleanup
    await pool.query(`DELETE FROM lifecycle_status_history WHERE lead_id = $1`, [allowedLeadId]);
  });

  it('ALLOWS INSERT with detected_by=load-permits.js AND event_date IS NOT NULL (constraint scoped to classifier rows only)', async () => {
    const pool = getTestPool();
    if (!pool) return;
    const allowedLeadId = `${TEST_LEAD_ID}-allowed2`;
    await pool.query(
      `INSERT INTO lifecycle_status_history
         (lead_id, from_status, to_status, transitioned_at, detected_by, event_date)
       VALUES ($1, NULL, 'Permit Issued', NOW(), 'load-permits.js', $2::date)`,
      [allowedLeadId, '2024-05-15'],
    );
    const res = await pool.query<{ event_date: string }>(
      `SELECT event_date::text AS event_date FROM lifecycle_status_history WHERE lead_id = $1`,
      [allowedLeadId],
    );
    expect(res.rows[0]!.event_date).toBe('2024-05-15');
    // Cleanup
    await pool.query(`DELETE FROM lifecycle_status_history WHERE lead_id = $1`, [allowedLeadId]);
  });
});

describe('migration 161 — source-shape regression locks (no DB)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');

  it('UP block uses NOT VALID + separate VALIDATE pattern with DO $$ idempotency guard (Spec 47 §18.4)', () => {
    // Catalog-only add first, wrapped in DO $$ idempotency guard per Spec 47
    // §18.4 mandate ("the DO $$...$$ idempotency guard is mandatory: if the
    // migration runner crashes after ADD CONSTRAINT but before VALIDATE, the
    // next run must skip the ADD and go directly to VALIDATE").
    expect(sql).toMatch(/DO \$\$\s*BEGIN[\s\S]{0,200}IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = 'lifecycle_status_history_classifier_event_date_null'/);
    expect(sql).toMatch(/ADD CONSTRAINT lifecycle_status_history_classifier_event_date_null[\s\S]{0,200}NOT VALID/);
    expect(sql).toMatch(/END \$\$/);
    // Separate VALIDATE step (outside the DO $$ guard) that scans rows under ACCESS SHARE.
    expect(sql).toMatch(/VALIDATE CONSTRAINT lifecycle_status_history_classifier_event_date_null/);
  });

  it('CHECK expression matches the design invariant', () => {
    // detected_by != 'classify-lifecycle-phase.js' OR event_date IS NULL
    expect(sql).toMatch(/detected_by\s*!=\s*'classify-lifecycle-phase\.js'\s*OR\s*event_date IS NULL/);
  });

  it('DOWN block is comments-only per Rule 6', () => {
    const downBlock = sql.split(/--\s*DOWN/i)[1];
    expect(downBlock).toBeDefined();
    if (!downBlock) return;
    // The rollback statement appears as a commented line.
    expect(downBlock).toMatch(/--\s+ALTER TABLE lifecycle_status_history DROP CONSTRAINT IF EXISTS lifecycle_status_history_classifier_event_date_null/);
    // Defense: no uncommented ALTER TABLE / DROP in the DOWN block.
    const downLines = downBlock.split('\n');
    for (const line of downLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('ALTER TABLE') || trimmed.startsWith('DROP ')) {
        throw new Error(`DOWN block contains executable SQL (Rule 6 violation): "${trimmed}"`);
      }
    }
  });
});
