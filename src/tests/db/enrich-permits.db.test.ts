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
const { enrichLeads, assertWf2Ran, assertRavinesEnriched } = require('../../../scripts/enrich-permits');

const T = 990_000_000; // test id range — isolated by ROLLBACK
const PSCOPE = `p.permit_num LIKE 'ZT-%'`;
const CSCOPE = `c.application_number LIKE 'ZT-%'`;

// NOTE: separate $1 (bigint id) / $2 (text parcel_id) params — reusing one `$1`/`$1::text`
// fails on PG16 with "inconsistent types deduced for parameter $1" (pre-existing test-helper
// bug, fixed here). §8e: also seeds the parcel ravine feed (is_in_ravine + signed distance +
// lineage) so the ravine propagation has source data + assertRavinesEnriched passes.
async function insParcel(
  c: PoolClient, id: number, zn: string | null, fsi: number | null, lot: number,
  inRavine = false, ravineDist: number | null = null,
) {
  await c.query(
    `INSERT INTO parcels (id, parcel_id, zoning_class, bylaw_max_fsi, lot_size_sqm, zoning_enriched_at,
       is_in_ravine_protection_area, ravine_distance_m, ravine_dataset_version_when_enriched)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, 'tv1')`,
    [id, String(id), zn, fsi, lot, inRavine, ravineDist],
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
      // §8e L12 §11.2 mixed case: T+1 inside (dist -200), T+2 outside (dist +10).
      await insParcel(c, T + 1, 'RD', 2.0, 300, true, -200);  // smaller; inside a ravine
      await insParcel(c, T + 2, 'CR', 3.0, 900, false, 10);   // larger → dominant; outside
      await insPermit(c, 'ZT-1', 'ZTConstruct');
      await linkPermit(c, 'ZT-1', T + 1, 0.9);
      await linkPermit(c, 'ZT-1', T + 2, 0.9);    // multi-parcel
      await insPermit(c, 'ZT-2', 'ZTConstruct');  // gap — no link

      const res = await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      expect(res.updated).toBeGreaterThanOrEqual(1);

      const p1 = (await c.query(`SELECT * FROM permits WHERE permit_num='ZT-1'`)).rows[0];
      // Zoning REGRESSION LOCK — dominant-parcel zoning must be byte-identical to pre-§8e.
      expect(p1.zoning_class).toBe('CR');              // dominant = larger parcel
      expect(Number(p1.bylaw_max_fsi)).toBe(3.0);
      expect(Number(p1.zoning_parcel_count)).toBe(2);
      expect(Number(p1.zoning_dominant_parcel_id)).toBe(T + 2);
      expect(Array.isArray(p1.applicable_bylaws)).toBe(true);
      expect(p1.applicable_bylaws.length).toBe(2);
      expect(p1.applicable_bylaws[0].zoning_class).toBe('CR'); // dominant first
      // §8e ravine (L12): bool_or(true,false)=true; MIN(ABS(200,10))=10; ×sign(any-inside)=-10.
      expect(p1.is_in_ravine_protection_area).toBe(true);
      expect(Number(p1.ravine_distance_m)).toBe(-10);  // magnitude from the OUTSIDE parcel, sign from any-inside (§11.2 intentional)

      const p2 = (await c.query(`SELECT zoning_class, is_in_ravine_protection_area, ravine_distance_m FROM permits WHERE permit_num='ZT-2'`)).rows[0];
      expect(p2.zoning_class).toBeNull();              // gap
      expect(p2.is_in_ravine_protection_area).toBe(false); // orphan permit → default false
      expect(p2.ravine_distance_m).toBeNull();         // orphan → NULL (§11.2: no parcel link)
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
      await insParcel(c, T + 5, 'R', 1.5, 400, true, 0); // inside a ravine (centroid inside → dist 0)
      const lead = 'coa:ZT-A1';
      await c.query(
        `INSERT INTO coa_applications (application_number, lead_id) VALUES ('ZT-A1', $1)`, [lead]);
      await c.query(
        `INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence) VALUES ($1, $2, 'test', 0.8)`,
        [lead, T + 5]);
      const res = await enrichLeads(c, { target: 'coa', scopeWhere: CSCOPE });
      expect(res.updated).toBeGreaterThanOrEqual(1);
      const a = (await c.query(`SELECT * FROM coa_applications WHERE application_number='ZT-A1'`)).rows[0];
      expect(a.zoning_class).toBe('R');                  // zoning regression lock
      expect(a.variance_context?.base?.zoning_class).toBe('R');
      // §8e ravine via lead_parcels: inside → true, distance 0 (centroid inside, §11.1 L2).
      expect(a.is_in_ravine_protection_area).toBe(true);
      expect(Number(a.ravine_distance_m)).toBeCloseTo(0); // -0 is correct (inside → 0×-1; L2: -0.0 = 0.0)
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('§8e assertRavinesEnriched HALTs when no parcel has ravine_dataset_version_when_enriched', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Deterministic precondition (isolated by ROLLBACK): clear any ravine lineage so the
      // "§8d not run" branch is genuinely exercised regardless of other fixtures.
      await c.query('UPDATE parcels SET ravine_dataset_version_when_enriched = NULL');
      await expect(assertRavinesEnriched(c)).rejects.toThrow(/enrich-ravines \(§8d\) has not run/);
      await insParcel(c, T + 9, 'RD', 2.0, 500, false, null); // insParcel stamps ravine_dataset_version='tv1'
      await expect(assertRavinesEnriched(c)).resolves.not.toThrow();
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('§8e un-link resets ravine to false/NULL (NOT a NOT-NULL violation)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO permit_type_classifications (permit_type, class) VALUES ('ZTConstruct','construction') ON CONFLICT DO NOTHING`);
      await insParcel(c, T + 20, 'RD', 2.0, 500, true, -5); // inside
      await insPermit(c, 'ZT-U', 'ZTConstruct');
      await linkPermit(c, 'ZT-U', T + 20, 0.9);
      await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      const before = (await c.query(`SELECT is_in_ravine_protection_area inr, ravine_distance_m dist FROM permits WHERE permit_num='ZT-U'`)).rows[0];
      expect(before.inr).toBe(true);
      expect(Number(before.dist)).toBe(-5);
      // Un-link the parcel → the orphan-nullify must reset ravine WITHOUT violating NOT NULL.
      await c.query(`DELETE FROM permit_parcels WHERE permit_num='ZT-U'`);
      await enrichLeads(c, { target: 'permits', scopeWhere: PSCOPE });
      const after = (await c.query(`SELECT is_in_ravine_protection_area inr, ravine_distance_m dist, zoning_class zc FROM permits WHERE permit_num='ZT-U'`)).rows[0];
      expect(after.inr).toBe(false);   // reset to default false (NOT NULL respected)
      expect(after.dist).toBeNull();   // reset to NULL
      expect(after.zc).toBeNull();     // zoning also cleared on un-link (existing behavior)
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
