// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §P2 (family-aware neighbourhood norms)
//
// Regression-lock for migration 208 (neighbourhood_build_norms.structure_family swap). Pins the new
// uniqueness contract so a future edit can't silently regress it:
//   - composite UNIQUE(neighbourhood_id, structure_family): (5,'detached')+(5,'townhouse') OK; dup (5,'detached') fails
//   - citywide-singleton partial index (structure_family) WHERE neighbourhood_id IS NULL: one row PER family,
//     multiple (NULL, family) OK, but a duplicate (NULL,'detached') fails
//   - DEFAULT 'all' backfills existing/omitting rows (the family-agnostic backstop)
// Skipped unless DATABASE_URL / BUILDO_TEST_DB=1. Fixtures cleaned per-test.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const NB = 9208; // a test neighbourhood id

// Insert a norm row with all NOT-NULL columns satisfied. structure_family omitted → DEFAULT 'all'.
async function insNorm(pool: Pool, nbhd: number | null, family?: string) {
  const cols = [
    'neighbourhood_id', 'new_builds_5yr', 'additions_5yr', 'renos_5yr', 'suites_5yr', 'demos_5yr',
    'coa_approved', 'coa_refused', 'coa_total', 'sample_n', 'low_sample', 'data_provenance',
  ];
  const vals: unknown[] = [nbhd, 0, 0, 0, 0, 0, 0, 0, 0, 1, false, 'test'];
  if (family !== undefined) {
    cols.push('structure_family');
    vals.push(family);
  }
  const ph = vals.map((_, i) => `$${i + 1}`).join(',');
  await pool.query(`INSERT INTO neighbourhood_build_norms (${cols.join(',')}) VALUES (${ph})`, vals);
}

describe.skipIf(!dbAvailable())('migration 208 — neighbourhood_build_norms.structure_family (Spec 78 P2)', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = getTestPool() as Pool;
    await pool.query(`INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES ($1,$1,$2) ON CONFLICT (id) DO NOTHING`, [NB, `PCM-FAM-${NB}`]);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM neighbourhood_build_norms WHERE data_provenance = 'test'`);
  });

  it('composite UNIQUE(neighbourhood_id, structure_family): distinct families per nbhd OK; dup family fails', async () => {
    await insNorm(pool, NB, 'detached');
    await insNorm(pool, NB, 'townhouse'); // same nbhd, different family → OK
    await expect(insNorm(pool, NB, 'detached')).rejects.toThrow(/duplicate key|unique/i);
  });

  it('citywide-singleton partial index: one row PER family; dup citywide family fails', async () => {
    await insNorm(pool, null, 'detached');
    await insNorm(pool, null, 'townhouse');
    await insNorm(pool, null, 'all'); // three distinct citywide families → OK
    await expect(insNorm(pool, null, 'detached')).rejects.toThrow(/duplicate key|unique/i);
  });

  it("structure_family DEFAULTs to 'all' when omitted (the family-agnostic backstop)", async () => {
    await insNorm(pool, NB); // no family arg
    const r = await pool.query(
      `SELECT structure_family FROM neighbourhood_build_norms WHERE neighbourhood_id = $1 AND data_provenance = 'test'`,
      [NB],
    );
    expect(r.rows[0].structure_family).toBe('all');
  });

  it('column-level UNIQUE(neighbourhood_id) is GONE — same nbhd can hold multiple family rows', async () => {
    await insNorm(pool, NB, 'detached');
    await insNorm(pool, NB, 'multiplex');
    const r = await pool.query(
      `SELECT count(*)::int AS n FROM neighbourhood_build_norms WHERE neighbourhood_id = $1 AND data_provenance = 'test'`,
      [NB],
    );
    expect(r.rows[0].n).toBe(2);
  });
});
