// 🔗 SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §8e, §11.1, §L24
//
// Real-DB integration for the §8e centreline propagation in enrich-permits.js. Locks the
// divergent decisions on live data: DEC-A (corner+through both-true via bool_or, no carve-out),
// DEC-B (frontage = smallest-parcel_id NON-NULL, skipping NULLs, NOT the dominant/max-area parcel),
// orphan un-link → false/false/NULL, idempotent re-run, CoA via lead_parcels, L24b/c HALTs.
// Skipped unless BUILDO_TEST_DB=1.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichLeads, assertCentrelineEnriched } = require('../../../scripts/enrich-permits');

const T = 992_000_000; // distinct test-id range
const PSCOPE = `p.permit_num LIKE 'CL-%'`;
const CSCOPE = `c.application_number LIKE 'CL-%'`;

async function insParcel(
  c: PoolClient, id: number, corner: boolean, through: boolean,
  frontage: string | null, area = 100,
) {
  await c.query(
    `INSERT INTO parcels (id, parcel_id, zoning_class, lot_size_sqm, zoning_enriched_at,
       is_corner_lot, is_through_lot, primary_frontage_street_name, centreline_dataset_version_when_enriched)
     VALUES ($1, $2, 'R', $3, NOW(), $4, $5, $6, 'cv1')`,
    [id, String(id), area, corner, through, frontage],
  );
}
async function insPermit(c: PoolClient, num: string) {
  await c.query(`INSERT INTO permits (permit_num, revision_num, permit_type) VALUES ($1, '00', 'BLD')`, [num]);
}
async function linkPermit(c: PoolClient, num: string, parcelId: number) {
  await c.query(
    `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence) VALUES ($1, '00', $2, 'test', 0.9)`,
    [num, parcelId],
  );
}

describe.skipIf(!dbAvailable())('enrich-permits §8e centreline propagation — live DB', () => {
  const pool = getTestPool()!;
  let c: PoolClient;
  beforeAll(async () => { if (pool) c = await pool.connect(); });
  afterAll(async () => { if (c) c.release(); if (pool) await pool.end(); });

  it('DEC-A bool_or (corner+through both true) / DEC-B frontage smallest-non-NULL-id / orphan / idempotent', async () => {
    if (!pool) return;
    await c.query('BEGIN');
    try {
      // corner-only, through-only, plain, and a frontage trio.
      await insParcel(c, T + 1, true, false, 'Corner St');
      await insParcel(c, T + 2, false, true, 'Through Ave');
      await insParcel(c, T + 3, false, false, null);
      // Frontage trio: smallest id has NULL (must be skipped); next id has a name (must win);
      // largest id is the DOMINANT (max-area) parcel with a different name (must NOT win — DEC-B).
      await insParcel(c, T + 11, false, false, null, 100);
      await insParcel(c, T + 12, false, false, 'Bathurst St', 100);
      await insParcel(c, T + 13, false, false, 'Avenue Rd', 9999); // dom (max area)

      await insPermit(c, 'CL-CORNER'); await linkPermit(c, 'CL-CORNER', T + 1); await linkPermit(c, 'CL-CORNER', T + 3);
      await insPermit(c, 'CL-BOTH');   await linkPermit(c, 'CL-BOTH', T + 1);   await linkPermit(c, 'CL-BOTH', T + 2); // corner + through parcels
      await insPermit(c, 'CL-NONE');   await linkPermit(c, 'CL-NONE', T + 3);
      await insPermit(c, 'CL-FRONT');  await linkPermit(c, 'CL-FRONT', T + 11); await linkPermit(c, 'CL-FRONT', T + 12); await linkPermit(c, 'CL-FRONT', T + 13);

      const res = await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      expect(res.updated).toBeGreaterThanOrEqual(3);

      const rows = (await c.query(
        `SELECT permit_num, is_corner_lot k, is_through_lot t, primary_frontage_street_name f
           FROM permits WHERE permit_num LIKE 'CL-%' ORDER BY permit_num`)).rows;
      const by = Object.fromEntries(rows.map((r: any) => [r.permit_num, r]));
      // corner-only.
      expect(by['CL-CORNER'].k).toBe(true);  expect(by['CL-CORNER'].t).toBe(false);
      // DEC-A: linked to a corner parcel AND a through parcel → BOTH true (no mutual-exclusivity).
      expect(by['CL-BOTH'].k).toBe(true);    expect(by['CL-BOTH'].t).toBe(true);
      // plain → false/false/NULL.
      expect(by['CL-NONE'].k).toBe(false);   expect(by['CL-NONE'].t).toBe(false); expect(by['CL-NONE'].f).toBeNull();
      // DEC-B: smallest-id NON-NULL frontage wins ('Bathurst St' @ id T+12) — NOT the NULL at T+11,
      // NOT the dominant/max-area parcel ('Avenue Rd' @ T+13), NOT alphabetical.
      expect(by['CL-FRONT'].f).toBe('Bathurst St');

      // Idempotent: re-run changes 0 rows.
      const r2 = await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      expect(r2.updated).toBe(0);

      // Orphan un-link: drop CL-CORNER's links → reset to false/false/NULL.
      await c.query(`DELETE FROM permit_parcels WHERE permit_num = 'CL-CORNER'`);
      await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      const after = (await c.query(`SELECT is_corner_lot k, is_through_lot t, primary_frontage_street_name f FROM permits WHERE permit_num='CL-CORNER'`)).rows[0];
      expect(after.k).toBe(false); expect(after.t).toBe(false); expect(after.f).toBeNull();
    } finally {
      await c.query('ROLLBACK');
    }
  });

  it('CoA propagates centreline via lead_parcels', async () => {
    if (!pool) return;
    await c.query('BEGIN');
    try {
      await insParcel(c, T + 21, true, false, 'King St W');
      const lead = 'coa:CL-A1';
      await c.query(`INSERT INTO coa_applications (application_number, lead_id) VALUES ('CL-A1', $1)`, [lead]);
      await c.query(`INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence) VALUES ($1, $2, 'test', 0.9)`, [lead, T + 21]);

      const res = await enrichLeads(c, { target: 'coa', scopeWhere: CSCOPE });
      expect(res.updated).toBeGreaterThanOrEqual(1);
      const a = (await c.query(`SELECT is_corner_lot k, primary_frontage_street_name f FROM coa_applications WHERE application_number='CL-A1'`)).rows[0];
      expect(a.k).toBe(true); expect(a.f).toBe('King St W');
    } finally {
      await c.query('ROLLBACK');
    }
  });

  it('assertCentrelineEnriched HALTs when no enrich_centreline run is recorded (L24b)', async () => {
    if (!pool) return;
    await c.query('BEGIN');
    try {
      // Remove any recorded enrich_centreline run within this txn's visibility.
      await c.query(`DELETE FROM pipeline_runs WHERE pipeline IN ('sources:enrich_centreline','enrich_centreline')`);
      await expect(assertCentrelineEnriched(c)).rejects.toThrow(/§8d has not run/);
    } finally {
      await c.query('ROLLBACK');
    }
  });
});
