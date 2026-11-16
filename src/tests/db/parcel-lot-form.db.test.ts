// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4, ML-4 (dated note 2026-11-13, SEMI-B)
//
// SEMI-B · L-SEMI a, b, c, e (the view `parcel_lot_form`, migration 320) on the live test DB: strict O-4, the 3-parcel doubt rule, the
// switch off, the min-wall setting, and a detached lot. Fixtures are committed then cleaned (CLKP-SEMI-*); the three settings are
// restored to what they were. Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL. NOT RUN by the lane (no test stack write): the orchestrator's
// rehearsal on the test stack runs it after migration 320 is applied.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const KEYS = ['semi_doubt_enabled', 'semi_doubt_max_link_parcels', 'semi_doubt_min_shared_len_m', 'semi_auto_max_shared_len_m', 'semi_detect_zone_classes', 'semi_ask_two_parcel_zone_classes'] as const;

describe.skipIf(!dbAvailable())('Spec 78 O-4 semi detector: the view parcel_lot_form (migrations 320 and 323)', () => {
  let pool: Pool;
  let saved: Array<{ variable_key: string; variable_value: string; variable_value_json: string | null }> = [];
  beforeAll(async () => {
    pool = getTestPool() as Pool;
    saved = (await pool.query(`SELECT variable_key, variable_value::text, variable_value_json::text FROM logic_variables WHERE variable_key = ANY($1)`, [KEYS])).rows;
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM parcel_abutments WHERE parcel_id IN (SELECT id FROM parcels WHERE parcel_id LIKE 'CLKP-SEMI-%')`);
    await pool.query(`DELETE FROM parcel_buildings WHERE parcel_id IN (SELECT id FROM parcels WHERE parcel_id LIKE 'CLKP-SEMI-%')`);
    await pool.query(`DELETE FROM building_footprints WHERE source_id LIKE 'CLKP-SEMI-%'`);
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'CLKP-SEMI-%'`);
    for (const r of saved) await pool.query(`UPDATE logic_variables SET variable_value = $2, variable_value_json = $3::jsonb WHERE variable_key = $1`, [r.variable_key, r.variable_value, r.variable_value_json]);
  });

  // zone defaults to RS (a residential class the detector reads); a fixture names another zone only where the zone is the thing under test
  const parcel = async (code: string, zone: string | null = 'RS'): Promise<number> =>
    (await pool.query(`INSERT INTO parcels (parcel_id, zoning_class) VALUES ($1, $2) RETURNING id`, [`CLKP-SEMI-${code}`, zone])).rows[0].id as number;
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
  const setList = (k: string, v: unknown) => pool.query(`UPDATE logic_variables SET variable_value_json = $2::jsonb WHERE variable_key = $1`, [k, JSON.stringify(v)]);
  const pair = async (code: string, zone: string | null, len: number, p3 = false) => {
    const [p1, p2] = [await parcel(`${code}1`, zone), await parcel(`${code}2`, zone)];
    const b = await building(code);
    await link(p1, b); await link(p2, b);
    if (p3) await link(await parcel(`${code}3`, zone), b);
    await abut(p1, p2, b, len);
    return p1;
  };
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


  // ---- SEMI-B2 (operator ruling a, 2026-11-14; migration 323) ----------------------------------------------------------------------
  it.each(["RS", "R", "RM", "RT"])("B2 a %s two-parcel semi with a 30 m wall stays auto-called (semi_half, not unsure)", async (z) => {
    const p = await pair(`Z${z}`, z, 30);
    expect(await row(p)).toMatchObject({ lot_form_detected: "semi_half", lot_form_basis: "o4_two_parcel_abut", unsure: false });
  });

  it("B2 item 2: an RD two-parcel match is asked (semi_half, unsure), not auto-called", async () => {
    const p = await pair("RD", "RD", 30);
    expect(await row(p)).toMatchObject({ lot_form_detected: "semi_half", lot_form_basis: "o4_two_parcel_abut", unsure: true });
  });

  it("B2 item 3: a shared length above 60 m is asked; exactly 60 m is auto-called", async () => {
    expect(await row(await pair("L75", "RS", 75))).toMatchObject({ lot_form_detected: "semi_half", unsure: true });
    expect(await row(await pair("L60", "RS", 60))).toMatchObject({ lot_form_detected: "semi_half", lot_form_basis: "o4_two_parcel_abut", unsure: false });
    expect(await row(await pair("L59", "RM", 59))).toMatchObject({ lot_form_detected: "semi_half", unsure: false });
    expect(await row(await pair("L61", "RM", 61))).toMatchObject({ lot_form_detected: "semi_half", unsure: true });
    expect(await row(await pair("L75T", "RT", 75))).toMatchObject({ lot_form_detected: "semi_half", unsure: true });
  });

  it("B2 item 1: a zone outside the residential list is detached and never asked (CR, IH, no zone), including a 3-parcel doubt lot", async () => {
    for (const z of ["CR", "IH", null]) {
      expect(await row(await pair(`N${z ?? "NULL"}`, z, 30))).toMatchObject({ lot_form_detected: "detached", lot_form_basis: "o4_not_met", unsure: false });
    }
    // the ask arms sit inside semi_half: a non-residential lot with a long wall is detached, never asked
    expect(await row(await pair("NL", "CR", 75))).toMatchObject({ lot_form_detected: "detached", unsure: false });
    expect(await row(await pair("N3", "CR", 15, true))).toMatchObject({ lot_form_detected: "detached", lot_form_basis: "o4_not_met", unsure: false });
  });

  it("B2 settings move the rules: the long-wall limit, the ask list and the detect list", async () => {
    const long = await pair("S75", "RS", 75);
    await set("semi_auto_max_shared_len_m", 80);
    expect(await row(long)).toMatchObject({ unsure: false });
    const rd = await pair("SRD", "RD", 30);
    const rs = await pair("SRS", "RS", 30);
    await setList("semi_ask_two_parcel_zone_classes", ["RS"]);
    expect(await row(rd)).toMatchObject({ unsure: false });
    expect(await row(rs)).toMatchObject({ unsure: true });
    await setList("semi_detect_zone_classes", ["RD"]);
    expect(await row(rs)).toMatchObject({ lot_form_detected: "detached", unsure: false });
    expect(await row(rd)).toMatchObject({ lot_form_detected: "semi_half" });
  });

  it("B2 on_invalid default: an empty list, a non-array and an out-of-bounds number read as the seeded defaults", async () => {
    const rd = await pair("IRD", "RD", 30);
    const rs = await pair("IRS", "RS", 30);
    const long = await pair("I75", "RS", 75);
    await setList("semi_detect_zone_classes", []);
    await setList("semi_ask_two_parcel_zone_classes", "RS");
    await set("semi_auto_max_shared_len_m", 5000);
    expect(await row(rs)).toMatchObject({ lot_form_detected: "semi_half", unsure: false });
    expect(await row(rd)).toMatchObject({ lot_form_detected: "semi_half", unsure: true });
    expect(await row(long)).toMatchObject({ unsure: true });
  });

  it("B2 a footprint on two parcels that do NOT abut is detached whatever the zone (strict O-4 still needs the abutment)", async () => {
    const [p1, p2] = [await parcel("NA1", "RS"), await parcel("NA2", "RS")];
    const b = await building("NA");
    await link(p1, b); await link(p2, b);
    expect(await row(p1)).toMatchObject({ lot_form_detected: "detached", lot_form_basis: "o4_not_met", unsure: false });
  });

  it("B2 a closed list: a code outside the residential five (or a non-string member) makes the list invalid, so it reads as the default", async () => {
    const rs = await pair("CL", "RS", 30);
    await setList("semi_detect_zone_classes", ["RD", "CR"]); // RS is not in it, but the list is invalid, so the default (RS in) applies
    expect(await row(rs)).toMatchObject({ lot_form_detected: "semi_half" });
    await setList("semi_detect_zone_classes", [1, "RS"]);
    expect(await row(rs)).toMatchObject({ lot_form_detected: "semi_half" });
  });

  it("B2 the switch off does not auto-call RD or a long wall (the ruling is not a doubt cut)", async () => {
    await set("semi_doubt_enabled", 0);
    expect(await row(await pair("OFFRD", "RD", 30))).toMatchObject({ unsure: true });
    expect(await row(await pair("OFFL", "RS", 75))).toMatchObject({ unsure: true });
    expect(await row(await pair("OFFS", "RS", 30))).toMatchObject({ unsure: false });
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
