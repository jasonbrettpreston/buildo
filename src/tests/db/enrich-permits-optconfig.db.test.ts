// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §4D (optimal-config + comp propagation)
//
// Live-DB integration for the Spec-49 propagation of the optimal-config + comp headline scalars onto
// permits + coa_applications (migration 204). Dominant-parcel happy path, orphan-nullify (incl. the
// NULLABLE opt_suite_fits_full → NULL not false), and idempotency. BEGIN/ROLLBACK isolated; skipped
// unless BUILDO_TEST_DB=1.

import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichLeads } = require('../../../scripts/enrich-permits');

const T = 990_500_000;

// Seed an enriched dominant parcel carrying the 13 opt/comp values (+ the minimal zoning the propagation reads).
async function insParcel(c: PoolClient, id: number, lot: number, over: Record<string, unknown> = {}) {
  const cols: Record<string, unknown> = {
    id, parcel_id: String(id), zoning_class: 'RD', lot_size_sqm: lot, zoning_enriched_at: 'NOW()',
    is_in_ravine_protection_area: false, is_heritage_designated: false, is_corner_lot: false, is_through_lot: false,
    opt_aor_storeys: 2, opt_aor_gfa_sqm: 275, opt_aor_units: 2, opt_coa_storeys: 3, opt_coa_gfa_sqm: 362,
    opt_suite_type: 'garden', opt_suite_fits_full: true, opt_binding_constraint: 'coverage', opt_config_confidence: 'medium',
    comp_count: 10, comp_dominant_build: 'new_build', comp_build_ratio_p50: 0.81, comp_fsi_p50: null, ...over,
  };
  const keys = Object.keys(cols);
  const params = keys.filter((k) => cols[k] !== 'NOW()').map((k) => cols[k]);
  // re-number the $ placeholders to skip the NOW() literal
  let i = 0;
  const ph = keys.map((k) => (cols[k] === 'NOW()' ? 'NOW()' : `$${++i}`));
  await c.query(`INSERT INTO parcels (${keys.join(',')}) VALUES (${ph.join(',')})`, params);
}

describe.skipIf(!dbAvailable())('Spec 78 §4D opt/comp propagation — live DB (mig 204)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('migration 204 added the 13 opt/comp columns to permits + coa_applications', async () => {
    const cols = ['opt_aor_storeys', 'opt_aor_gfa_sqm', 'opt_aor_units', 'opt_coa_storeys', 'opt_coa_gfa_sqm',
      'opt_suite_type', 'opt_suite_fits_full', 'opt_binding_constraint', 'opt_config_confidence',
      'comp_count', 'comp_dominant_build', 'comp_build_ratio_p50', 'comp_fsi_p50'];
    const { rows } = await pool.query(
      `SELECT table_name, count(*)::int n FROM information_schema.columns
       WHERE table_name IN ('permits','coa_applications') AND column_name = ANY($1::text[])
       GROUP BY table_name`, [cols]);
    const m = Object.fromEntries(rows.map((r) => [r.table_name, r.n]));
    expect(m.permits).toBe(13);
    expect(m.coa_applications).toBe(13);
  });

  it('propagates the dominant parcel opt/comp onto the permit; orphan → NULL (incl. the nullable bool); idempotent', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insParcel(c, T + 1, 400);
      await c.query(`INSERT INTO permits (permit_num, revision_num, permit_type) VALUES ('ZT-OPT-1','00','ZTConstruct')`);
      await c.query(`INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence) VALUES ('ZT-OPT-1','00',$1,'test',0.9)`, [T + 1]);
      await c.query(`INSERT INTO permits (permit_num, revision_num, permit_type) VALUES ('ZT-OPT-2','00','ZTConstruct')`); // orphan, no link

      const res = await enrichLeads(c, { target: 'permits', scopeWhere: `p.permit_num LIKE 'ZT-OPT-%'` });
      expect(res.updated).toBeGreaterThanOrEqual(1);

      const p1 = (await c.query(`SELECT opt_aor_gfa_sqm, opt_coa_gfa_sqm, opt_suite_type, opt_suite_fits_full, opt_config_confidence, comp_count, comp_dominant_build, comp_build_ratio_p50 FROM permits WHERE permit_num='ZT-OPT-1'`)).rows[0];
      expect(Number(p1.opt_aor_gfa_sqm)).toBe(275);
      expect(Number(p1.opt_coa_gfa_sqm)).toBe(362);
      expect(p1.opt_suite_type).toBe('garden');
      expect(p1.opt_suite_fits_full).toBe(true);
      expect(p1.opt_config_confidence).toBe('medium');
      expect(Number(p1.comp_count)).toBe(10);
      expect(p1.comp_dominant_build).toBe('new_build');
      expect(Number(p1.comp_build_ratio_p50)).toBeCloseTo(0.81, 2);

      const p2 = (await c.query(`SELECT opt_config_confidence, opt_suite_fits_full, comp_count FROM permits WHERE permit_num='ZT-OPT-2'`)).rows[0];
      expect(p2.opt_config_confidence).toBeNull();
      expect(p2.opt_suite_fits_full).toBeNull();   // NULLABLE bool → NULL on orphan (NOT false)
      expect(p2.comp_count).toBeNull();

      const r2 = await enrichLeads(c, { target: 'permits', scopeWhere: `p.permit_num LIKE 'ZT-OPT-%'` });
      expect(r2.updated).toBe(0);                   // idempotent (IS DISTINCT FROM)
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('propagates opt/comp onto a CoA lead via the stored lead_id', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insParcel(c, T + 5, 400);
      await c.query(`INSERT INTO coa_applications (application_number, lead_id) VALUES ('ZT-OPT-A1', 'coa:ZT-OPT-A1')`);
      await c.query(`INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence) VALUES ('coa:ZT-OPT-A1', $1, 'test', 0.8)`, [T + 5]);
      const res = await enrichLeads(c, { target: 'coa', scopeWhere: `c.application_number LIKE 'ZT-OPT-%'` });
      expect(res.updated).toBeGreaterThanOrEqual(1);
      const a1 = (await c.query(`SELECT opt_config_confidence, comp_count, opt_suite_type FROM coa_applications WHERE application_number='ZT-OPT-A1'`)).rows[0];
      expect(a1.opt_config_confidence).toBe('medium');
      expect(Number(a1.comp_count)).toBe(10);
      expect(a1.opt_suite_type).toBe('garden');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);
});
