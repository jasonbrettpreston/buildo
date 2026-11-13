// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4, ML-4 (dated note 2026-11-13, SEMI-B)
//
// SEMI-B · L-SEMI a, b, c, e (the view `parcel_lot_form`, migration 320) on the live test DB: strict O-4, the 3-parcel doubt rule, the
// switch off, the min-wall setting, and a detached lot. Fixtures are committed then cleaned (CLKP-SEMI-*); the three settings are
// restored to what they were. Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL. NOT RUN by the lane (no test stack write): the orchestrator's
// rehearsal on the test stack runs it after migration 320 is applied.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const KEYS = ['semi_doubt_enabled', 'semi_doubt_max_link_parcels', 'semi_doubt_min_shared_len_m'] as const;

describe.skipIf(!dbAvailable())('Spec 78 O-4 semi detector: the view parcel_lot_form (migration 320)', () => {
  let pool: Pool;
  let saved: Array<{ variable_key: string; variable_value: string }> = [];
  beforeAll(async () => {
    pool = getTestPool() as Pool;
    saved = (await pool.query(`SELECT variable_key, variable_value::text FROM logic_variables WHERE variable_key = ANY($1)`, [KEYS])).rows;
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM parcel_abutments WHERE parcel_id IN (SELECT id FROM parcels WHERE parcel_id LIKE 'CLKP-SEMI-%')`);
    await pool.query(`DELETE FROM parcel_buildings WHERE parcel_id IN (SELECT id FROM parcels WHERE parcel_id LIKE 'CLKP-SEMI-%')`);
    await pool.query(`DELETE FROM building_footprints WHERE source_id LIKE 'CLKP-SEMI-%'`);
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'CLKP-SEMI-%'`);
    for (const r of saved) await pool.query(`UPDATE logic_variables SET variable_value = $2 WHERE variable_key = $1`, [r.variable_key, r.variable_value]);
  });

  const parcel = async (code: string): Promise<number> =>
    (await pool.query(`INSERT INTO parcels (parcel_id) VALUES ($1) RETURNING id`, [`CLKP-SEMI-${code}`])).rows[0].id as number;
  const building = async (code: string): Promise<number> =>
    (await pool.query(`INSERT INTO building_footprints (source_id, geometry) VALUES ($1, '{}'::jsonb) RETURNING id`, [`CLKP-SEMI-${code}`])).rows[0].id as number;
  const link = (parcelId: number, buildingId: number) =>
    pool.query(`INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, match_type, confidence) VALUES ($1, $2, true, 'nearest', 0.60)`, [parcelId, buildingId]);
  const abut = (a: number, b: number, bldg: number, len: number) =>
    pool.query(
      `INSERT INTO parcel_abutments (parcel_id, neighbour_id, shared_len_m, neighbour_residential, neighbour_building_id, est_status, linked_at)
       VALUES ($1, $2, $3, true, $4, 'no_frontage_street', now()), ($2, $1, $3, true, $4, 'no_frontage_street', now())`,
      [a, b, len, bldg],
    );
  const row = async (id: number) => (await pool.query(`SELECT * FROM parcel_lot_form WHERE parcel_id = $1`, [id])).rows[0];
  const set = (k: string, v: number) => pool.query(`UPDATE logic_variables SET variable_value = $2 WHERE variable_key = $1`, [k, v]);

  it('(a) strict O-4: two parcels on one footprint that abut -> semi_half, o4_two_parcel_abut, not unsure; one row per parcel', async () => {
    const [p1, p2] = [await parcel('A1'), await parcel('A2')];
    const b = await building('A');
    await link(p1, b); await link(p2, b); await abut(p1, p2, b, 20);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'semi_half', lot_form_basis: 'o4_two_parcel_abut', unsure: false, linked_parcel_count: 2 });
    expect((await pool.query(`SELECT count(*)::int AS n FROM parcel_lot_form WHERE parcel_id = $1`, [p1])).rows[0].n).toBe(1);
  });

  it('strict O-4 with a short party wall is still a semi but is asked (unsure); with the switch off it is not asked', async () => {
    const [p1, p2] = [await parcel('W1'), await parcel('W2')];
    const b = await building('W');
    await link(p1, b); await link(p2, b); await abut(p1, p2, b, 2);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'semi_half', unsure: true });
    await set('semi_doubt_enabled', 0);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'semi_half', unsure: false });
  });

  it('(b) a footprint over 3 parcels with an abutting wall -> semi_half, doubt_multi_parcel_abut, unsure', async () => {
    const [p1, p2, p3] = [await parcel('B1'), await parcel('B2'), await parcel('B3')];
    const b = await building('B');
    await link(p1, b); await link(p2, b); await link(p3, b); await abut(p1, p2, b, 15);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'semi_half', lot_form_basis: 'doubt_multi_parcel_abut', unsure: true, linked_parcel_count: 3 });
    // the third parcel abuts nobody: not a semi
    expect(await row(p3)).toMatchObject({ lot_form_detected: 'detached', lot_form_basis: 'o4_not_met', unsure: false });
  });

  it('(c) the switch off leaves the 3-parcel lot detached; max_link_parcels 2 does the same', async () => {
    const [p1, p2, p3] = [await parcel('C1'), await parcel('C2'), await parcel('C3')];
    const b = await building('C');
    await link(p1, b); await link(p2, b); await link(p3, b); await abut(p1, p2, b, 15);
    await set('semi_doubt_enabled', 0);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'detached', unsure: false });
    await set('semi_doubt_enabled', 1);
    await set('semi_doubt_max_link_parcels', 2);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'detached', unsure: false });
  });

  it('the min-wall setting: a 3-parcel lot whose wall is under it stays detached', async () => {
    const [p1, p2, p3] = [await parcel('M1'), await parcel('M2'), await parcel('M3')];
    const b = await building('M');
    await link(p1, b); await link(p2, b); await link(p3, b); await abut(p1, p2, b, 3);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'detached' });
    await set('semi_doubt_min_shared_len_m', 1);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'semi_half', unsure: true });
  });

  it('(e) a detached lot: one primary footprint on one parcel -> detached, o4_not_met, never unsure; a lot with no building too', async () => {
    const p1 = await parcel('E1');
    const p2 = await parcel('E2');
    const b = await building('E');
    await link(p1, b);
    expect(await row(p1)).toMatchObject({ lot_form_detected: 'detached', lot_form_basis: 'o4_not_met', unsure: false });
    expect(await row(p2)).toMatchObject({ lot_form_detected: 'detached', lot_form_basis: 'o4_not_met', unsure: false });
  });

  it('the ask band is always semi_half and the values are closed, over the whole table', async () => {
    const r = (await pool.query(
      `SELECT count(*) FILTER (WHERE unsure AND lot_form_detected <> 'semi_half')::int AS ask_not_semi,
              count(*) FILTER (WHERE lot_form_detected NOT IN ('semi_half','detached') OR lot_form_basis NOT IN ('o4_two_parcel_abut','doubt_multi_parcel_abut','o4_not_met') OR unsure IS NULL)::int AS open_values
         FROM parcel_lot_form`,
    )).rows[0];
    expect(r).toEqual({ ask_not_semi: 0, open_values: 0 });
  });
});
