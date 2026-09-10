// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md P3A.1 (D4' recovery bound)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md 3.0b (scope hand-off ledger)
// SPEC LINK: .cursor/wf3_ep_d14_pass5_recovery_scan_active_task.md C2
//
// WF3 EP-D14 — migration 246 adds a partial index on enrich_parcels_pass3_scope(parcel_id)
// WHERE consumed_at IS NULL, serving consumePendingScope's own predicate (neither the PK
// (run_id, parcel_id) nor idx_pass3_scope_unconsumed (run_id) WHERE consumed_at IS NULL leads
// on parcel_id alone). Per docs/specs/00_engineering_standards.md §12.10/§5.2, a migration
// touching indexes requires a *.db.test.ts (a SQL-string assertion does not catch these).
//
// Second describe block closes the ADJACENT gap named in this WF3's own plan: neither index
// created by migration 240 (idx_parcels_massing_enriched_at_null, idx_pass3_scope_unconsumed)
// was asserted by any test anywhere before this commit.
//
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 246 — idx_pass3_scope_parcel_unconsumed', () => {
  it('the partial index exists on (parcel_id) WHERE consumed_at IS NULL', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'enrich_parcels_pass3_scope' AND indexname = 'idx_pass3_scope_parcel_unconsumed'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toMatch(/\(parcel_id\)/);
    expect(rows[0].indexdef).toMatch(/WHERE\s+\(?consumed_at\s+IS\s+NULL/i);
  });

  it('the index carries a COMMENT naming the predicate it serves', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT obj_description('idx_pass3_scope_parcel_unconsumed'::regclass, 'pg_class') AS comment`,
    );
    const comment: string | null = rows[0]?.comment ?? null;
    expect(comment).not.toBeNull();
    expect(comment).toMatch(/consumePendingScope/);
  });

  it('at scale (fixture-seeded, ~50K rows across 3 run_ids), the planner genuinely picks this index with a real Index Cond on parcel_id — never merely a Filter', async () => {
    if (!pool) return;
    await pool.query('BEGIN');
    try {
      // Seed enough rows that idx_pass3_scope_unconsumed's (run_id)-only lead is a poor plan
      // relative to a parcel_id-selective lookup — an empty/near-empty table defeats this proof
      // (the same gap migration-244's own test file documents removing for wsib_registry).
      await pool.query(
        `INSERT INTO enrich_parcels_pass3_scope (run_id, parcel_id)
         SELECT 900000 + (g % 3), g
         FROM generate_series(1, 50000) AS g
         ON CONFLICT DO NOTHING`,
      );
      await pool.query('ANALYZE enrich_parcels_pass3_scope');
      const { rows } = await pool.query(
        `EXPLAIN UPDATE enrich_parcels_pass3_scope SET consumed_at = now() WHERE parcel_id = 12345 AND consumed_at IS NULL`,
      );
      const plan = rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n');
      expect(plan).toMatch(/idx_pass3_scope_parcel_unconsumed/);
      expect(plan, 'must be a real Index Cond on parcel_id, not a Filter atop a different index').toMatch(/Index Cond: \(parcel_id = 12345\)/);
    } finally {
      // ROLLBACK — this test must not leave fixture rows behind for any other test/run.
      await pool.query('ROLLBACK');
    }
  });
});

describe.skipIf(!dbAvailable())('migration 240 — the two indexes it created (gap closure: neither was previously asserted by any test)', () => {
  it('idx_parcels_massing_enriched_at_null exists on parcels(id) WHERE massing_enriched_at IS NULL', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'parcels' AND indexname = 'idx_parcels_massing_enriched_at_null'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toMatch(/\(id\)/);
    expect(rows[0].indexdef).toMatch(/WHERE\s+\(?massing_enriched_at\s+IS\s+NULL/i);
  });

  it('idx_pass3_scope_unconsumed exists on enrich_parcels_pass3_scope(run_id) WHERE consumed_at IS NULL', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'enrich_parcels_pass3_scope' AND indexname = 'idx_pass3_scope_unconsumed'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toMatch(/\(run_id\)/);
    expect(rows[0].indexdef).toMatch(/WHERE\s+\(?consumed_at\s+IS\s+NULL/i);
  });
});
