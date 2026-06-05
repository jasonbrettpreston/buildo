// 🔗 SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8e, §11.2, §11.3
//
// Real-DB integration for the §8e heritage propagation in enrich-permits.js: a permit/CoA
// linked to a Part IV parcel → part_iv_individual; to a Part V parcel → part_v_hcd; to BOTH
// → Part IV wins (L12); multi-winning-parcel date → MIN(date); orphan un-link → false/NULL;
// idempotent re-run; assertHeritageEnriched HALT. Skipped unless BUILDO_TEST_DB=1.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichLeads, assertHeritageEnriched } = require('../../../scripts/enrich-permits');

const T = 991_000_000; // distinct test-id range
const PSCOPE = `p.permit_num LIKE 'HT-%'`;
const CSCOPE = `c.application_number LIKE 'HT-%'`;

async function insParcel(
  c: PoolClient, id: number, designated: boolean,
  type: string | null, date: string | null,
) {
  await c.query(
    `INSERT INTO parcels (id, parcel_id, zoning_class, lot_size_sqm, zoning_enriched_at,
       is_heritage_designated, heritage_designation_type, heritage_designation_date, heritage_dataset_version_when_enriched)
     VALUES ($1, $2, 'R', 100, NOW(), $3, $4, $5, 'hv1')`,
    [id, String(id), designated, type, date],
  );
}
async function insPermit(c: PoolClient, num: string, type: string) {
  await c.query(`INSERT INTO permits (permit_num, revision_num, permit_type) VALUES ($1, '00', $2)`, [num, type]);
}
async function linkPermit(c: PoolClient, num: string, parcelId: number) {
  await c.query(
    `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence) VALUES ($1, '00', $2, 'test', 0.9)`,
    [num, parcelId],
  );
}

describe.skipIf(!dbAvailable())('enrich-permits §8e heritage propagation — live DB', () => {
  const pool = getTestPool()!;
  let c: PoolClient;
  beforeAll(async () => { if (pool) c = await pool.connect(); });
  afterAll(async () => { if (c) c.release(); if (pool) await pool.end(); });

  it('Part IV / Part V / both→Part-IV (L12) / MIN(date) / orphan→false-NULL / idempotent', async () => {
    if (!pool) return;
    await c.query('BEGIN');
    try {
      // Parcels: a part_iv, a part_v, and a SECOND part_iv with an EARLIER date (MIN-date tie-break).
      await insParcel(c, T + 1, true, 'part_iv_individual', '1997-12-08');
      await insParcel(c, T + 2, true, 'part_v_hcd', '2005-10-28');
      await insParcel(c, T + 3, true, 'part_iv_individual', '1990-01-01'); // earlier part_iv date
      await insParcel(c, T + 4, false, null, null);

      await insPermit(c, 'HT-IV', 'BLD');   await linkPermit(c, 'HT-IV', T + 1);
      await insPermit(c, 'HT-V', 'BLD');    await linkPermit(c, 'HT-V', T + 2);
      await insPermit(c, 'HT-BOTH', 'BLD'); await linkPermit(c, 'HT-BOTH', T + 2); await linkPermit(c, 'HT-BOTH', T + 3); // part_v + earlier part_iv
      await insPermit(c, 'HT-NONE', 'BLD'); await linkPermit(c, 'HT-NONE', T + 4);

      const res = await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      expect(res.updated).toBeGreaterThanOrEqual(3);

      const rows = (await c.query(
        `SELECT permit_num, is_heritage_designated d, heritage_designation_type t, heritage_designation_date dt
           FROM permits WHERE permit_num LIKE 'HT-%' ORDER BY permit_num`)).rows;
      const by = Object.fromEntries(rows.map((r: any) => [r.permit_num, r]));
      expect(by['HT-IV'].d).toBe(true);  expect(by['HT-IV'].t).toBe('part_iv_individual');
      expect(by['HT-V'].d).toBe(true);   expect(by['HT-V'].t).toBe('part_v_hcd');
      // L12: linked to BOTH a part_v and a part_iv parcel → Part IV wins; date = MIN(part_iv date) = 1990.
      expect(by['HT-BOTH'].d).toBe(true); expect(by['HT-BOTH'].t).toBe('part_iv_individual');
      expect(new Date(by['HT-BOTH'].dt).toISOString().slice(0, 10)).toBe('1990-01-01');
      // undesignated → false / NULL.
      expect(by['HT-NONE'].d).toBe(false); expect(by['HT-NONE'].t).toBeNull(); expect(by['HT-NONE'].dt).toBeNull();

      // Idempotent: re-run changes 0 rows.
      const r2 = await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      expect(r2.updated).toBe(0);

      // Orphan un-link: drop HT-IV's link → next run resets it to false/NULL.
      await c.query(`DELETE FROM permit_parcels WHERE permit_num = 'HT-IV'`);
      await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      const ivAfter = (await c.query(`SELECT is_heritage_designated d, heritage_designation_type t FROM permits WHERE permit_num='HT-IV'`)).rows[0];
      expect(ivAfter.d).toBe(false); expect(ivAfter.t).toBeNull();
    } finally {
      await c.query('ROLLBACK');
    }
  });

  it('CoA propagates via lead_parcels (part_v_hcd)', async () => {
    if (!pool) return;
    await c.query('BEGIN');
    try {
      await insParcel(c, T + 11, true, 'part_v_hcd', '2007-09-27');
      const lead = 'coa:HT-A1';
      await c.query(`INSERT INTO coa_applications (application_number, lead_id) VALUES ('HT-A1', $1)`, [lead]);
      await c.query(`INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence) VALUES ($1, $2, 'test', 0.9)`, [lead, T + 11]);

      const res = await enrichLeads(c, { target: 'coa', scopeWhere: CSCOPE });
      expect(res.updated).toBeGreaterThanOrEqual(1);
      const a = (await c.query(`SELECT is_heritage_designated d, heritage_designation_type t FROM coa_applications WHERE application_number='HT-A1'`)).rows[0];
      expect(a.d).toBe(true); expect(a.t).toBe('part_v_hcd');
    } finally {
      await c.query('ROLLBACK');
    }
  });

  it('assertHeritageEnriched HALTs when no parcel has heritage_dataset_version_when_enriched', async () => {
    if (!pool) return;
    await c.query('BEGIN');
    try {
      await c.query('UPDATE parcels SET heritage_dataset_version_when_enriched = NULL');
      await expect(assertHeritageEnriched(c)).rejects.toThrow(/enrich-heritage \(§8d\) has not run/);
    } finally {
      await c.query('ROLLBACK');
    }
  });
});
