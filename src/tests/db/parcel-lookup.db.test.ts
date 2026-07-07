// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (API) + §5 (edge cases)
//
// Live-DB integration for the Parcel Cost Model Tool lookup lib: (a) a CONTRACT SMOKE over real
// dev-DB data (self-skips when the DB has <1000 parcels, so fresh CI DBs skip it) — the Phase A
// contract-validation + perf-sanity gate; (b) seeded deterministic fixtures for the edge cases.
// Skipped entirely unless BUILDO_TEST_DB=1.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import {
  resolveAddress,
  fetchParcelById,
  fetchCoaProjects,
  assembleParcelPayload,
  allMappedColumns,
  EXCLUDED_COLS,
} from '@/lib/admin/parcel-lookup';
import { ParcelPayloadSchema, GROUP_KEYS } from '@/app/api/admin/parcels/lookup/types';

const sq = (x0: number, y0: number, side: number): string => JSON.stringify({
  type: 'Polygon', coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]],
});

describe.skipIf(!dbAvailable())('Spec 89 parcel-lookup — live DB', () => {
  let pool: Pool;
  let realData = false;
  beforeAll(async () => {
    pool = getTestPool() as Pool;
    const { rows: [c] } = await pool.query(`SELECT count(*)::int AS n FROM parcels`);
    realData = c.n > 1000; // dev DB = ~486K; fresh CI DB skips the smoke describe
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'PLKP-TEST-%'`);
  });

  // ── (a) Contract smoke on REAL data (Phase A gate) ─────────────────────────
  it('SMOKE: real address resolves → full payload Zod-valid → all 9 groups populated (<500ms budget)', async () => {
    if (!realData) return; // fresh DB — fixture cases below still run
    const t0 = Date.now();
    const res = await resolveAddress('26 Hurlingham Cres');
    expect(res.match).not.toBeNull();
    expect(res.match!.matchType).toBe('exact');

    const row = await fetchParcelById(res.match!.parcelId);
    expect(row).not.toBeNull();
    const nbhd = row!.neighbourhood_id == null ? null : Number(row!.neighbourhood_id);
    const coa = await fetchCoaProjects(nbhd);
    const { payload } = assembleParcelPayload(row!, coa);
    const durationMs = Date.now() - t0;

    // The assembled payload is contract-valid on REAL data.
    expect(() => ParcelPayloadSchema.parse(payload)).not.toThrow();
    // All 9 tier-3 groups exist and are non-empty objects.
    for (const g of GROUP_KEYS) {
      expect(Object.keys(payload.groups[g] ?? {}).length).toBeGreaterThan(0);
    }
    // No geometry blob leaked into the response.
    const flat = JSON.stringify(payload);
    expect(Object.keys(payload.groups.identity)).not.toContain('geometry');
    expect(Object.keys(payload.groups.identity)).not.toContain('geom');
    expect(flat.length).toBeLessThan(2_000_000); // sanity: no megablob
    // Perf budget (Spec 89 / plan): the full 3-query chain under 500ms.
    expect(durationMs).toBeLessThan(500);
  }, 30_000);

  it('SMOKE: typeahead — partial street resolves to candidates with the production status filter', async () => {
    if (!realData) return;
    const res = await resolveAddress('Hurlingham Cres'); // no number → typeahead path
    // Either a unique typeahead match or a candidate list — never a silent empty on a real street.
    expect(res.match !== null || res.candidates.length > 0).toBe(true);
  }, 30_000);

  it('SMOKE: cost-menu-bearing parcel round-trips menu + scalars', async () => {
    if (!realData) return;
    const { rows: [p] } = await pool.query(
      `SELECT parcel_id FROM parcels WHERE parcel_cost_menu IS NOT NULL AND neighbourhood_id IS NOT NULL LIMIT 1`,
    );
    if (!p) return; // cost model not yet run on this DB
    const row = await fetchParcelById(p.parcel_id);
    const { payload, warnings } = assembleParcelPayload(row!, []);
    expect(payload.costMenu.menu).not.toBeNull();       // deep-validated, not degraded
    expect(warnings).toHaveLength(0);
    expect(Object.keys(payload.costMenu.scalars)).toContain('cost_fb_total');
  }, 30_000);

  // ── (b) Deterministic fixtures (edge cases, run everywhere) ────────────────
  // NB: the ALWAYS-RUN half of this guard lives in parcel-lookup.infra.test.ts (mapping vs the
  // committed snapshot). This live-DB half catches a STALE SNAPSHOT: information_schema is the truth.
  it('projection covers ALL parcels columns except the geometry exclusions (schema drift guard)', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'parcels'`,
    );
    const dbCols = new Set(rows.map((r: { column_name: string }) => r.column_name));
    const mapped = new Set([...allMappedColumns(), ...EXCLUDED_COLS]);
    // Every DB column is mapped (or excluded) — the "ALL fields" mandate, enforced.
    const unmapped = [...dbCols].filter((c) => !mapped.has(c as string));
    expect(unmapped).toEqual([]);
    // And nothing mapped is phantom (protects the SELECT from column-not-found).
    const phantom = [...mapped].filter((c) => !dbCols.has(c));
    expect(phantom).toEqual([]);
  });

  it('un-enriched parcel → NULL-heavy payload, no crash; NULL neighbourhood → coaProjects []', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ('PLKP-TEST-1', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326))`,
      [sq(40, 40, 0.0002)],
    );
    const row = await fetchParcelById('PLKP-TEST-1');
    expect(row).not.toBeNull();
    const coa = await fetchCoaProjects(null); // NULL-neighbourhood guard
    expect(coa).toEqual([]);
    const { payload } = assembleParcelPayload(row!, coa);
    expect(() => ParcelPayloadSchema.parse(payload)).not.toThrow();
    expect(payload.costMenu.menu).toBeNull();
    expect(payload.neighbourhood.summary).toBeNull();
  });

  it('drifted parcel_cost_menu JSONB → degrades to null + warning (tier-stratified, no throw)', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, parcel_cost_menu)
       VALUES ('PLKP-TEST-2', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), $2::jsonb)`,
      [sq(41, 40, 0.0002), JSON.stringify({ kitchen: { total: 'NOT-A-NUMBER' } })],
    );
    const row = await fetchParcelById('PLKP-TEST-2');
    const { payload, warnings } = assembleParcelPayload(row!, []);
    expect(payload.costMenu.menu).toBeNull();                    // degraded, not thrown
    expect(warnings.some((w) => w.includes('cost menu'))).toBe(true);
    expect(() => ParcelPayloadSchema.parse(payload)).not.toThrow(); // rest of payload intact
  });

  it('injection attempt resolves to a safe miss (parameterized SQL)', async () => {
    const res = await resolveAddress(`26 Hurlingham'; DROP TABLE parcels; --`);
    expect(res.match === null || res.match.matchType === 'exact' || res.match.matchType === 'typeahead').toBe(true);
    const { rows: [c] } = await pool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='parcels'`);
    expect(c.n).toBe(1); // parcels still exists
  });
});
