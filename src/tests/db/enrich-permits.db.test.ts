// 🔗 SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md (v1.0) §2, §3, §4
//
// Live-DB integration test for Spec 66 enrich-permits — migration 166 schema + the
// relational dominant-parcel enrichment, against a real DB. Skipped unless
// DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer) is set; the harness
// applies migrations 001..166 first. All inside BEGIN/ROLLBACK (no fixture cleanup).
//
// Covers the bug-classes mocked tests miss:
//   - permits + CoA JOIN happy path (dominant parcel zoning copied onto the lead)
//   - multi-parcel: dominant = largest lot_size_sqm; applicable_bylaws array
//   - gap lead (no parcel link) → NULL zoning, counted not failed
//   - WF2-never-ran precondition HALT
//   - idempotent re-run updates 0 rows (IS DISTINCT FROM guard)

import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichLeads, assertWf2Ran } = require('../../../scripts/enrich-permits');

const T = 990_000_000; // test id range — isolated by ROLLBACK
const PSCOPE = `p.permit_num LIKE 'ZT-%'`;
const CSCOPE = `c.application_number LIKE 'ZT-%'`;

async function insParcel(c: PoolClient, id: number, zn: string | null, fsi: number | null, lot: number) {
  await c.query(
    `INSERT INTO parcels (id, parcel_id, zoning_class, bylaw_max_fsi, lot_size_sqm, zoning_enriched_at)
     VALUES ($1, $1::text, $2, $3, $4, NOW())`,
    [id, zn, fsi, lot],
  );
}
async function insPermit(c: PoolClient, num: string, type: string) {
  await c.query(
    `INSERT INTO permits (permit_num, revision_num, permit_type) VALUES ($1, '00', $2)`,
    [num, type],
  );
}
async function linkPermit(c: PoolClient, num: string, parcelId: number, conf: number) {
  await c.query(
    `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence)
     VALUES ($1, '00', $2, 'test', $3)`,
    [num, parcelId, conf],
  );
}

describe.skipIf(!dbAvailable())('Spec 66 enrich-permits — live DB (migration 166 + engine)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('migration 166 added the zoning columns to permits + coa_applications', async () => {
    const { rows } = await pool.query(
      `SELECT table_name, count(*)::int n FROM information_schema.columns
       WHERE table_name IN ('permits','coa_applications')
         AND (column_name LIKE 'bylaw_%' OR column_name LIKE 'zoning_%'
              OR column_name IN ('exception_number','applicable_bylaws','overlay_summary','variance_context'))
       GROUP BY table_name ORDER BY table_name`);
    const m = Object.fromEntries(rows.map((r) => [r.table_name, r.n]));
    expect(m.permits).toBe(11);
    expect(m.coa_applications).toBe(10);
  });

  it('assertWf2Ran throws when no parcel is enriched, passes once one is', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // No enriched parcel in a fresh test DB → HALT.
      await expect(assertWf2Ran(c)).rejects.toThrow();
      await insParcel(c, T + 1, 'RD', 2.0, 500);
      await expect(assertWf2Ran(c)).resolves.not.toThrow();
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('enriches permits from the dominant linked parcel; gap permit → NULL', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO permit_type_classifications (permit_type, class) VALUES ('ZTConstruct','construction') ON CONFLICT DO NOTHING`);
      await insParcel(c, T + 1, 'RD', 2.0, 300);  // smaller
      await insParcel(c, T + 2, 'CR', 3.0, 900);  // larger → dominant
      await insPermit(c, 'ZT-1', 'ZTConstruct');
      await linkPermit(c, 'ZT-1', T + 1, 0.9);
      await linkPermit(c, 'ZT-1', T + 2, 0.9);    // multi-parcel
      await insPermit(c, 'ZT-2', 'ZTConstruct');  // gap — no link

      const res = await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      expect(res.updated).toBeGreaterThanOrEqual(1);

      const p1 = (await c.query(`SELECT * FROM permits WHERE permit_num='ZT-1'`)).rows[0];
      expect(p1.zoning_class).toBe('CR');              // dominant = larger parcel
      expect(Number(p1.bylaw_max_fsi)).toBe(3.0);
      expect(Number(p1.zoning_parcel_count)).toBe(2);
      expect(Number(p1.zoning_dominant_parcel_id)).toBe(T + 2);
      expect(Array.isArray(p1.applicable_bylaws)).toBe(true);
      expect(p1.applicable_bylaws.length).toBe(2);
      expect(p1.applicable_bylaws[0].zoning_class).toBe('CR'); // dominant first

      const p2 = (await c.query(`SELECT zoning_class FROM permits WHERE permit_num='ZT-2'`)).rows[0];
      expect(p2.zoning_class).toBeNull();              // gap
      expect(res.gaps).toBeGreaterThanOrEqual(1);

      // idempotent
      const r2 = await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      expect(r2.updated).toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('enriches CoA via the stored lead_id (DEC-4)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insParcel(c, T + 5, 'R', 1.5, 400);
      const lead = 'coa:ZT-A1';
      await c.query(
        `INSERT INTO coa_applications (application_number, lead_id) VALUES ('ZT-A1', $1)`, [lead]);
      await c.query(
        `INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence) VALUES ($1, $2, 'test', 0.8)`,
        [lead, T + 5]);
      const res = await enrichLeads(c, { target: 'coa', scopeWhere: CSCOPE });
      expect(res.updated).toBeGreaterThanOrEqual(1);
      const a = (await c.query(`SELECT * FROM coa_applications WHERE application_number='ZT-A1'`)).rows[0];
      expect(a.zoning_class).toBe('R');
      expect(a.variance_context?.base?.zoning_class).toBe('R');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
