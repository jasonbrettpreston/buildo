// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 + §6 (.db battery)
//
// Live-DB integration for the CONSUMER parcel-lookup lib (reuses the Spec 89 admin resolver
// internals): exact hit → whitelist payload · ambiguous → candidates · direct parcelId ·
// unknown parcelId → null (200-miss at the route) · cost-menu-null · NULL-neighbourhood → [].
// Fixtures are COMMITTED then cleaned. Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { resolveAddress, fetchParcelById, fetchCoaProjects, parseFreeTextAddress } from '@/lib/admin/parcel-lookup';
import { assembleConsumerPayload, CONSUMER_HEADLINE_COLS } from '@/lib/parcels/consumer-lookup';
import { ConsumerParcelSchema } from '@/app/api/parcels/lookup/types';
import { T3_GROUPS } from '@/lib/admin/parcel-lookup';

const sq = (x0: number, y0: number, side: number): string => JSON.stringify({
  type: 'Polygon', coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]],
});

describe.skipIf(!dbAvailable())('Spec 100 consumer parcel-lookup — live DB', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = getTestPool() as Pool;
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'CLKP-TEST-%'`);
  });

  it('exact hit → whitelist payload: cost menu present, NO Tier-3 diagnostic leak, no `groups`', async () => {
    const { num, streetName } = parseFreeTextAddress('999 Consumertest Ave');
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, address_number, linear_name_full, lot_size_sqm, opt_aor_gfa_sqm,
         max_build_fsi, parcel_cost_menu, nearby_builds_summary, comp_count, comp_fsi_p50,
         comparable_builds, zoning_zn_string)
       VALUES ('CLKP-TEST-1','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),
         $2,$3,'999','Consumertest Ave',400,300,1.25,$4::jsonb,$5::jsonb,7,0.85,$6::jsonb,'R2')`,
      [
        sq(45, 45, 0.0002), num, streetName,
        JSON.stringify({ _schema_version: 3, kitchen: { total: 1000, per_sqm: 100, area: 10, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null } }),
        JSON.stringify({ headline: 'Mostly detached', basis: 'comp' }),
        JSON.stringify([{ address: '5 Elm', permit_fsi: 0.95, structure_family: 'detached', work_type: 'new_build', SECRET: 'x' }]),
      ],
    );

    const res = await resolveAddress('999 Consumertest Ave');
    expect(res.match).not.toBeNull();
    expect(res.match!.matchType).toBe('exact');

    const row = await fetchParcelById(res.match!.parcelId);
    const { payload, warnings } = assembleConsumerPayload(row!, []);
    expect(() => ConsumerParcelSchema.parse(payload)).not.toThrow();
    expect(warnings).toHaveLength(0);
    expect(payload.costMenu.menu).not.toBeNull();
    expect(payload.neighbourhood.comparableBuilds![0]!.permit_fsi).toBe(0.95);

    const flat = JSON.stringify(payload);
    expect(flat).not.toContain('SECRET');
    expect(flat).not.toContain('zoning_zn_string');
    expect(payload).not.toHaveProperty('groups');
    for (const k of Object.keys(payload.areas)) expect(CONSUMER_HEADLINE_COLS).toContain(k);
    // Sanity: at least one real Tier-3 column is genuinely absent.
    expect(Object.values(T3_GROUPS).flat()).toContain('zoning_zn_string');
  });

  it('ambiguous → candidates (≤10), no single match', async () => {
    const { num, streetName } = parseFreeTextAddress('12 Ambitest Rd');
    for (const id of [1, 2]) {
      await pool.query(
        `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
           street_name_normalized, address_number, linear_name_full)
         VALUES ($1,'TEST',$2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326),$3,$4,'12','Ambitest Rd')`,
        [`CLKP-TEST-A${id}`, sq(46 + id * 0.01, 46, 0.0002), num, streetName],
      );
    }
    const res = await resolveAddress('12 Ambitest Rd');
    expect(res.match).toBeNull();
    expect(res.candidates.length).toBeGreaterThanOrEqual(2);
    expect(res.candidates.length).toBeLessThanOrEqual(10);
  });

  it('direct parcelId → row fetched → whitelist payload', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, lot_size_sqm, opt_aor_gfa_sqm)
       VALUES ('CLKP-TEST-D1','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),500,350)`,
      [sq(47, 47, 0.0002)],
    );
    const row = await fetchParcelById('CLKP-TEST-D1');
    expect(row).not.toBeNull();
    const { payload } = assembleConsumerPayload(row!, []);
    expect(payload.areas.lot_size_sqm).toBe(500);
    expect(() => ConsumerParcelSchema.parse(payload)).not.toThrow();
  });

  it('unknown parcelId → fetchParcelById returns null (the route maps this to a 200 miss)', async () => {
    const row = await fetchParcelById('CLKP-TEST-DOES-NOT-EXIST');
    expect(row).toBeNull();
  });

  it('cost-menu-null parcel → Tier 1 renders honestly (null menu, no throw, no warning)', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ('CLKP-TEST-C1','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326))`,
      [sq(48, 48, 0.0002)],
    );
    const row = await fetchParcelById('CLKP-TEST-C1');
    const { payload, warnings } = assembleConsumerPayload(row!, []);
    expect(payload.costMenu.menu).toBeNull();
    expect(warnings).toHaveLength(0);
    expect(() => ConsumerParcelSchema.parse(payload)).not.toThrow();
  });

  it('NULL neighbourhood → fetchCoaProjects returns [] (guard, no query)', async () => {
    const coa = await fetchCoaProjects(null);
    expect(coa).toEqual([]);
  });

  it('drifted parcel_cost_menu → degrades to null + warning (tier-stratified, no throw)', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, parcel_cost_menu)
       VALUES ('CLKP-TEST-DR','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), $2::jsonb)`,
      [sq(49, 48, 0.0002), JSON.stringify({ kitchen: { total: 'NOT-A-NUMBER' } })],
    );
    const row = await fetchParcelById('CLKP-TEST-DR');
    const { payload, warnings } = assembleConsumerPayload(row!, []);
    expect(payload.costMenu.menu).toBeNull();
    expect(warnings.some((w) => w.includes('cost menu'))).toBe(true);
    expect(() => ConsumerParcelSchema.parse(payload)).not.toThrow();
  });
});
