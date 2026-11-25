// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.10 (a migration that adds a CHECK constraint MUST land with a `*.db.test.ts` file under
//              src/tests/db/); docs/specs/01-pipeline/69a_mcbylaw_register.md (M-61, M-72, M-377, M-378, M-384: migration 309).
//
// task-456 D5 (mcfixreborn-g2 GROUNDER-B.md:79; fold plan FIX.MIG309-DBTEST). Real-database test for the two named CHECK constraints of
// migrations/309_parcel_maxbld_scenarios.sql (never edited here):
//   parcel_maxbld_scenarios_value_iff_computed    a value exactly when the status is computed (gain_reasons may be computed with no value);
//   parcel_maxbld_scenarios_reason_iff_undecided  a reason exactly when the status is not_evaluated, not_modelled or not_permitted.
// Accepted rows: computed with a value; gain_reasons computed with a null value; not_evaluated with a reason. Refused, SQLSTATE 23514 naming the
// constraint: computed with a null value and not_buildable with a value (value_iff_computed); not_evaluated and not_permitted with a null reason
// (reason_iff_undecided). Both directions inside the database: with the constraint dropped the refused row is accepted; after the rollback to the
// savepoint it is refused again and pg_constraint lists the name again (the drop did not persist).
//
// Where it runs: a throwaway container only (setup-testcontainer.ts). It never runs against an existing database: BUILDO_TEST_DB_EXTERNAL=1 points
// the harness at one (the shared test stack), where DROP CONSTRAINT takes an ACCESS EXCLUSIVE lock, so the file skips itself there. One client,
// one BEGIN in beforeAll and one ROLLBACK in afterAll: no row and no DDL is ever committed, a crash leaves nothing behind, and there is no delete step.
// A refused insert aborts the transaction, so each refused case runs between SAVEPOINT s and ROLLBACK TO SAVEPOINT s.
// Pattern: migration-070-xor.db.test.ts; the parcel seed follows enrich-parcels-scenarios.db.test.ts (feature_type 'TEST'; the 997_000_000 range,
// used by no other file under src/tests).

import type { DatabaseError, Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const TEST_PARCEL = '997000001';
const VALUE_IFF = 'parcel_maxbld_scenarios_value_iff_computed';
const REASON_IFF = 'parcel_maxbld_scenarios_reason_iff_undecided';

interface Scenario { field_id: string; status: string; value: number | null; reason: string | null }

function poly(x0: number, y0: number, x1: number, y1: number): string {
  return JSON.stringify({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
}

describe.skipIf(!dbAvailable() || process.env.BUILDO_TEST_DB_EXTERNAL === '1')('migration 309 — parcel_maxbld_scenarios CHECK constraints (real database)', () => {
  let pool: Pool | null = null;
  let client: PoolClient | null = null;
  let parcelPk = 0;

  beforeAll(async () => {
    pool = getTestPool();
    if (!pool) return;
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, lot_size_sqm)
       VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326), 400)`,
      [TEST_PARCEL, poly(0, 0, 0.0002, 0.0002)],
    );
    const { rows } = await client.query<{ id: number }>('SELECT id FROM parcels WHERE parcel_id = $1', [TEST_PARCEL]);
    parcelPk = rows[0]!.id; // parcel_maxbld_scenarios.parcel_id is parcels.id (migration 309:22)
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    if (pool) await pool.end();
  });

  /** One scenario row naming every NOT NULL column of migration 309:21-39. */
  const insert = (s: Scenario) => (client as PoolClient).query(
    `INSERT INTO parcel_maxbld_scenarios (parcel_id, building_type, field_id, increment, status, value, reason, trace, content_sha, switches,
                                          catalogue_sha, switchboard_sha, settings_sha, layer2_table_version, computed_at)
     VALUES ($1, 'detached_house', $2, '1', $3, $4, $5, '{}'::jsonb, 'c', '[]'::jsonb, 'cat', 'sw', 's', 'T1', now())`,
    [parcelPk, s.field_id, s.status, s.value, s.reason],
  );

  /** The insert inside SAVEPOINT s; the error it raised (null when accepted), with the transaction restored either way. */
  const tryInsert = async (s: Scenario): Promise<DatabaseError | null> => {
    const c = client as PoolClient;
    await c.query('SAVEPOINT s');
    try {
      await insert(s);
      await c.query('RELEASE SAVEPOINT s');
      return null;
    } catch (err) {
      await c.query('ROLLBACK TO SAVEPOINT s');
      return err as DatabaseError;
    }
  };

  const constraintNames = async (): Promise<string[]> => (await (client as PoolClient).query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'parcel_maxbld_scenarios'::regclass AND contype = 'c' AND conname = ANY($1::text[]) ORDER BY conname`,
    [[VALUE_IFF, REASON_IFF]],
  )).rows.map((r) => r.conname);

  it('pg_constraint lists both named CHECK constraints', async () => {
    expect(await constraintNames()).toEqual([REASON_IFF, VALUE_IFF].sort());
  });

  it.each<[string, Scenario]>([
    ['computed with a value', { field_id: 'gfa_max_m2', status: 'computed', value: 248.05, reason: null }],
    ['gain_reasons computed with a null value', { field_id: 'gain_reasons', status: 'computed', value: null, reason: null }],
    ['not_evaluated with a reason', { field_id: 'storeys_max', status: 'not_evaluated', value: null, reason: 'under_min_area' }],
  ])('accepts: %s', async (_name, s) => {
    expect(await tryInsert(s)).toBeNull();
  });

  it.each<[string, Scenario, string]>([
    ['computed with a null value', { field_id: 'refused_a', status: 'computed', value: null, reason: null }, VALUE_IFF],
    ['not_buildable with a value', { field_id: 'refused_b', status: 'not_buildable', value: 1, reason: null }, VALUE_IFF],
    ['not_evaluated with a null reason', { field_id: 'refused_c', status: 'not_evaluated', value: null, reason: null }, REASON_IFF],
    ['not_permitted with a null reason', { field_id: 'refused_d', status: 'not_permitted', value: null, reason: null }, REASON_IFF],
  ])('refuses: %s (23514, %s)', async (_name, s, name) => {
    const err = await tryInsert(s);
    expect(err?.code).toBe('23514');
    expect(err?.constraint).toBe(name);
  });

  // Last case of the file: inside SAVEPOINT d the constraint is gone, so the order matters and the rollback to d restores it.
  it.each<[string, Scenario]>([
    [VALUE_IFF, { field_id: 'both_ways_a', status: 'computed', value: null, reason: null }],
    [REASON_IFF, { field_id: 'both_ways_b', status: 'not_evaluated', value: null, reason: null }],
  ])('both directions: with %s dropped the refused row is accepted; after the rollback it is refused again', async (name, s) => {
    const c = client as PoolClient;
    await c.query('SAVEPOINT d');
    try {
      await c.query(`ALTER TABLE parcel_maxbld_scenarios DROP CONSTRAINT ${name}`);
      expect(await tryInsert(s)).toBeNull();
    } finally {
      await c.query('ROLLBACK TO SAVEPOINT d');
    }
    const err = await tryInsert(s);
    expect(err?.code).toBe('23514');
    expect(err?.constraint).toBe(name);
    expect(await constraintNames()).toContain(name);
  });
});
