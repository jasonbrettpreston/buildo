// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
//
// Live-DB integration test for migration 145 (Phase D classifier substrate).
// Verifies the 6 components materialized correctly against a fresh testcontainer:
//   1. coa_applications timestamp columns
//   2. 4 partial indexes
//   3. cost_estimates PK swap (lead_id is new PK; permit_num/revision_num nullable)
//   4. cost_source CHECK extension preserves 'none' AND adds 'geometric'
//   5. lead_id_orphan_audit view uses COALESCE for cost_estimates branch
//   6. FK COMMENT documenting Phase G interlock
//
// Plus end-to-end assertions per R2.v4/v5 triage #9:
//   * CoA insert with NULL permit_num/revision_num succeeds (vacuous FK)
//   * DELETE permits CASCADEs to permit-keyed cost_estimates rows
//     but does NOT touch CoA-keyed rows

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, dbAvailable } from './setup-testcontainer';

const TEST_PERMIT_NUM = 'MIG145-TEST-1';
const TEST_PERMIT_REV = '00';
const TEST_PERMIT_LEAD_ID = `permit:${TEST_PERMIT_NUM}:${TEST_PERMIT_REV}`;
const TEST_COA_NUM = 'MIG145-COA-1';
const TEST_COA_LEAD_ID = `coa:${TEST_COA_NUM}`;
const TEST_PRE_PERMIT_NUM = 'MIG145-PRE-1';
const TEST_PRE_LEAD_ID = `permit:${TEST_PRE_PERMIT_NUM}:${TEST_PERMIT_REV}`;

describe.skipIf(!dbAvailable())('migration 145 — Phase D classifier substrate (R5.1)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getTestPool()!;
    // Clean slate — any prior test rows
    await pool.query(`DELETE FROM cost_estimates WHERE lead_id IN ($1, $2, $3)`, [TEST_PERMIT_LEAD_ID, TEST_COA_LEAD_ID, TEST_PRE_LEAD_ID]);
    await pool.query(`DELETE FROM permits WHERE permit_num IN ($1, $2)`, [TEST_PERMIT_NUM, TEST_PRE_PERMIT_NUM]);
    await pool.query(`DELETE FROM coa_applications WHERE application_number = $1`, [TEST_COA_NUM]);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM cost_estimates WHERE lead_id IN ($1, $2, $3)`, [TEST_PERMIT_LEAD_ID, TEST_COA_LEAD_ID, TEST_PRE_LEAD_ID]);
    await pool.query(`DELETE FROM permits WHERE permit_num IN ($1, $2)`, [TEST_PERMIT_NUM, TEST_PRE_PERMIT_NUM]);
    await pool.query(`DELETE FROM coa_applications WHERE application_number = $1`, [TEST_COA_NUM]);
    await pool.end();
  });

  describe('Component 1: coa_applications timestamp columns', () => {
    it('parcel_linked_at column exists and is nullable', async () => {
      const result = await pool.query(`
        SELECT data_type, is_nullable FROM information_schema.columns
         WHERE table_name = 'coa_applications' AND column_name = 'parcel_linked_at'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data_type).toBe('timestamp with time zone');
      expect(result.rows[0].is_nullable).toBe('YES');
    });

    it('trade_classified_at column exists and is nullable', async () => {
      const result = await pool.query(`
        SELECT data_type, is_nullable FROM information_schema.columns
         WHERE table_name = 'coa_applications' AND column_name = 'trade_classified_at'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data_type).toBe('timestamp with time zone');
      expect(result.rows[0].is_nullable).toBe('YES');
    });
  });

  describe('Component 2: 4 partial indexes exist', () => {
    it('idx_coa_parcel_linked_at exists with partial WHERE clause', async () => {
      const result = await pool.query(`
        SELECT indexdef FROM pg_indexes
         WHERE indexname = 'idx_coa_parcel_linked_at'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef).toMatch(/WHERE\s+\(?parcel_linked_at\s+IS\s+NOT\s+NULL/i);
    });

    it('idx_coa_scope_classified_at exists with partial WHERE clause', async () => {
      const result = await pool.query(`
        SELECT indexdef FROM pg_indexes
         WHERE indexname = 'idx_coa_scope_classified_at'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef).toMatch(/WHERE\s+\(?scope_classified_at\s+IS\s+NOT\s+NULL/i);
    });

    it('idx_coa_trade_classified_at exists with partial WHERE clause', async () => {
      const result = await pool.query(`
        SELECT indexdef FROM pg_indexes
         WHERE indexname = 'idx_coa_trade_classified_at'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef).toMatch(/WHERE\s+\(?trade_classified_at\s+IS\s+NOT\s+NULL/i);
    });

    it('idx_coa_cost_classified_at exists with partial WHERE clause', async () => {
      const result = await pool.query(`
        SELECT indexdef FROM pg_indexes
         WHERE indexname = 'idx_coa_cost_classified_at'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef).toMatch(/WHERE\s+\(?cost_classified_at\s+IS\s+NOT\s+NULL/i);
    });
  });

  describe('Component 3: cost_estimates PK swap', () => {
    it('cost_estimates PK is now (lead_id), not (permit_num, revision_num)', async () => {
      const result = await pool.query(`
        SELECT a.attname AS column_name
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
         WHERE c.conrelid = 'cost_estimates'::regclass
           AND c.contype = 'p'
         ORDER BY array_position(c.conkey, a.attnum)
      `);
      const pkColumns = result.rows.map((r) => r.column_name);
      expect(pkColumns).toEqual(['lead_id']);
    });

    it('permit_num is now nullable', async () => {
      const result = await pool.query(`
        SELECT is_nullable FROM information_schema.columns
         WHERE table_name = 'cost_estimates' AND column_name = 'permit_num'
      `);
      expect(result.rows[0].is_nullable).toBe('YES');
    });

    it('revision_num is now nullable', async () => {
      const result = await pool.query(`
        SELECT is_nullable FROM information_schema.columns
         WHERE table_name = 'cost_estimates' AND column_name = 'revision_num'
      `);
      expect(result.rows[0].is_nullable).toBe('YES');
    });

    it('redundant uniq_cost_estimates_lead_id index is dropped', async () => {
      const result = await pool.query(`
        SELECT indexname FROM pg_indexes
         WHERE indexname = 'uniq_cost_estimates_lead_id'
      `);
      expect(result.rows.length).toBe(0);
    });
  });

  describe('Component 4: cost_source CHECK extension', () => {
    it('CHECK constraint exists with all 4 allowed values', async () => {
      const result = await pool.query(`
        SELECT pg_get_constraintdef(oid) AS def
          FROM pg_constraint
         WHERE conname = 'cost_estimates_cost_source_check'
      `);
      expect(result.rows.length).toBe(1);
      const def = result.rows[0].def;
      expect(def).toMatch(/'permit'/);
      expect(def).toMatch(/'model'/);
      expect(def).toMatch(/'none'/);
      expect(def).toMatch(/'geometric'/);
    });

    it('cost_estimates INSERT accepts cost_source=\'geometric\'', async () => {
      // First insert a permit so the FK is satisfied for the non-CoA path
      await pool.query(
        `INSERT INTO permits (permit_num, revision_num, status, permit_type, application_date)
         VALUES ($1, $2, 'Permit Issued', 'New Building', '2024-01-01')
         ON CONFLICT DO NOTHING`,
        [TEST_PERMIT_NUM, TEST_PERMIT_REV],
      );
      await expect(
        pool.query(
          `INSERT INTO cost_estimates (lead_id, permit_num, revision_num, estimated_cost, cost_source)
           VALUES ($1, $2, $3, 100000, 'geometric')`,
          [TEST_PERMIT_LEAD_ID, TEST_PERMIT_NUM, TEST_PERMIT_REV],
        ),
      ).resolves.toBeTruthy();
    });

    it('cost_estimates INSERT still accepts cost_source=\'none\' (preserved from mig 096)', async () => {
      // Use a separate lead_id to avoid PK collision with prior test row
      const altLeadId = `${TEST_PERMIT_LEAD_ID}-none`;
      await pool.query(
        `INSERT INTO permits (permit_num, revision_num, status, permit_type, application_date)
         VALUES ('MIG145-NONE-1', $1, 'Permit Issued', 'New Building', '2024-01-01')
         ON CONFLICT DO NOTHING`,
        [TEST_PERMIT_REV],
      );
      await expect(
        pool.query(
          `INSERT INTO cost_estimates (lead_id, permit_num, revision_num, estimated_cost, cost_source)
           VALUES ($1, 'MIG145-NONE-1', $2, 0, 'none')`,
          [altLeadId, TEST_PERMIT_REV],
        ),
      ).resolves.toBeTruthy();
      await pool.query(`DELETE FROM cost_estimates WHERE lead_id = $1`, [altLeadId]);
      await pool.query(`DELETE FROM permits WHERE permit_num = 'MIG145-NONE-1'`);
    });

    it('cost_estimates INSERT rejects rogue cost_source value', async () => {
      const altLeadId = `${TEST_PERMIT_LEAD_ID}-bad`;
      await expect(
        pool.query(
          `INSERT INTO cost_estimates (lead_id, permit_num, revision_num, estimated_cost, cost_source)
           VALUES ($1, $2, $3, 100, 'rogue_value')`,
          [altLeadId, TEST_PERMIT_NUM, TEST_PERMIT_REV],
        ),
      ).rejects.toThrow();
    });
  });

  describe('Component 5: lead_id_orphan_audit view COALESCE', () => {
    it('view definition exists', async () => {
      const result = await pool.query(`
        SELECT viewname FROM pg_views WHERE viewname = 'lead_id_orphan_audit'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('cost_estimates branch uses COALESCE(ce.lead_id, ...) to avoid NULL source_row_id', async () => {
      const result = await pool.query(`
        SELECT definition FROM pg_views WHERE viewname = 'lead_id_orphan_audit'
      `);
      expect(result.rows[0].definition).toMatch(/COALESCE\s*\(\s*ce\.lead_id/i);
    });
  });

  describe('Component 6: FK COMMENT', () => {
    it('composite FK on cost_estimates has a COMMENT mentioning Phase G', async () => {
      const result = await pool.query(`
        SELECT obj_description(c.oid, 'pg_constraint') AS comment
          FROM pg_constraint c
         WHERE c.conrelid = 'cost_estimates'::regclass
           AND c.contype = 'f'
           AND c.confrelid = 'permits'::regclass
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].comment).toBeTruthy();
      expect(result.rows[0].comment).toMatch(/Phase\s+G/i);
    });
  });

  describe('End-to-end: NULL composite FK semantics (R2.v4/v5 triage #9)', () => {
    it('CoA cost_estimates INSERT with NULL permit_num + NULL revision_num succeeds (vacuous FK)', async () => {
      // Need a coa_applications row first so the parent table lookup succeeds.
      await pool.query(
        `INSERT INTO coa_applications (application_number, description, sub_type)
         VALUES ($1, 'Test CoA for migration 145', 'minor_variance')
         ON CONFLICT DO NOTHING`,
        [TEST_COA_NUM],
      );
      // Now insert a cost_estimates row keyed only on lead_id, with NULL
      // permit_num/revision_num. Postgres composite FK with MATCH SIMPLE
      // (default) treats this as vacuously satisfied.
      await expect(
        pool.query(
          `INSERT INTO cost_estimates (lead_id, permit_num, revision_num, estimated_cost, cost_source)
           VALUES ($1, NULL, NULL, 250000, 'geometric')`,
          [TEST_COA_LEAD_ID],
        ),
      ).resolves.toBeTruthy();
    });

    it('DELETE FROM permits CASCADEs to permit-keyed cost_estimates but NOT to CoA-keyed rows', async () => {
      // Seed a PRE-permit + its cost_estimates row
      await pool.query(
        `INSERT INTO permits (permit_num, revision_num, status, permit_type, application_date)
         VALUES ($1, $2, 'Permit Issued', 'Pre-Permit', '2024-01-01')
         ON CONFLICT DO NOTHING`,
        [TEST_PRE_PERMIT_NUM, TEST_PERMIT_REV],
      );
      await pool.query(
        `INSERT INTO cost_estimates (lead_id, permit_num, revision_num, estimated_cost, cost_source)
         VALUES ($1, $2, $3, 50000, 'permit')`,
        [TEST_PRE_LEAD_ID, TEST_PRE_PERMIT_NUM, TEST_PERMIT_REV],
      );

      // Confirm both rows exist before DELETE
      const before = await pool.query(
        `SELECT lead_id FROM cost_estimates WHERE lead_id IN ($1, $2)`,
        [TEST_PRE_LEAD_ID, TEST_COA_LEAD_ID],
      );
      const beforeLeadIds = new Set(before.rows.map((r) => r.lead_id));
      expect(beforeLeadIds.has(TEST_PRE_LEAD_ID)).toBe(true);
      expect(beforeLeadIds.has(TEST_COA_LEAD_ID)).toBe(true);

      // Phase G-style DELETE: remove the PRE-permit row
      await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [TEST_PRE_PERMIT_NUM]);

      // After CASCADE: PRE cost_estimates gone; CoA cost_estimates untouched
      const after = await pool.query(
        `SELECT lead_id FROM cost_estimates WHERE lead_id IN ($1, $2)`,
        [TEST_PRE_LEAD_ID, TEST_COA_LEAD_ID],
      );
      const afterLeadIds = new Set(after.rows.map((r) => r.lead_id));
      expect(afterLeadIds.has(TEST_PRE_LEAD_ID)).toBe(false);
      expect(afterLeadIds.has(TEST_COA_LEAD_ID)).toBe(true);
    });
  });
});
