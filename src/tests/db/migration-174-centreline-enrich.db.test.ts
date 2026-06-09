// 🔗 SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §2 (M-2) + §11 (§8d)
//
// Real-DB integration tests for migration 174 + the §11 enrich engine. M-2 adds the
// 4 parcels columns; the §11 8-CTE UPDATE derives corner/through/frontage. Each mutating
// case runs in BEGIN/ROLLBACK on a dedicated connection (the enrich-parcels precedent) and
// inserts its own fixtures; in a fresh testcontainer parcels/toronto_centreline are empty,
// so the global §11 join operates only on the fixtures. Skipped unless BUILDO_TEST_DB=1.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ec = require('../../../scripts/enrich-centreline.js');

const SRC_VER = 'cev1';

async function insSeg(
  c: PoolClient, sid: number, name: string | null, nameFull: string | null,
  fromNode: number | null, toNode: number | null, wkt: string,
  loL: string | null = null, hiL: string | null = null, parityL: string | null = null,
  featureCodeDesc = 'Local',   // WF3 #431-FU: 'Laneway' fixtures exercise the lane-exclusion guard
) {
  await c.query(
    `INSERT INTO toronto_centreline
       (source_id, geom, linear_name, linear_name_full, feature_code_desc, jurisdiction,
        from_intersection_id, to_intersection_id, lo_num_l, hi_num_l, parity_l, source_dataset_version)
     VALUES ($1, ST_GeomFromText($2,4326), $3, $4, $11, 'CITY OF TORONTO', $5, $6, $7, $8, $9, $10)`,
    [sid, wkt, name, nameFull, fromNode, toNode, loL, hiL, parityL, SRC_VER, featureCodeDesc],
  );
}
async function insParcel(c: PoolClient, pid: string, wkt: string, streetNorm: string | null, addr: string | null) {
  const { rows } = await c.query(
    `INSERT INTO parcels (parcel_id, geom, street_name_normalized, address_number)
     VALUES ($1, ST_GeomFromText($2,4326), $3, $4) RETURNING id`,
    [pid, wkt, streetNorm, addr],
  );
  return rows[0].id as number;
}
async function getParcel(c: PoolClient, id: number) {
  const { rows } = await c.query(
    `SELECT is_corner_lot, is_through_lot, primary_frontage_street_name, centreline_dataset_version_when_enriched AS ver
       FROM parcels WHERE id = $1`, [id]);
  return rows[0];
}

describe.skipIf(!dbAvailable())('migration 174 + §11 enrich-centreline (real PostGIS)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { await pool.end(); });

  it('M-2 adds the 4 parcels columns with the §2 contract', async () => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name='parcels' AND column_name = ANY($1)`,
      [['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'centreline_dataset_version_when_enriched']],
    );
    const by = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    expect(by.is_corner_lot.data_type).toBe('boolean');
    expect(by.is_corner_lot.is_nullable).toBe('NO');
    expect(by.is_through_lot.data_type).toBe('boolean');
    expect(by.primary_frontage_street_name.data_type).toBe('text');
    expect(by.primary_frontage_street_name.is_nullable).toBe('YES');
    expect(by.centreline_dataset_version_when_enriched.data_type).toBe('text');
  });

  it('corner lot: 2 different streets sharing an intersection node ~11 m away → is_corner_lot=true + P1 frontage + lineage', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Real Toronto coords (the WF3 corner test is geography-based — synthetic grid coords are meaningless).
      // Parcel = 18 m square; NE corner ≈ (-79.39978, 43.70018). 'Main' runs E-W ~4 m north and ENDS at the
      // shared node 101 = (-79.39965, 43.70022); 'King' STARTS at node 101 and runs south. The parcel ABUTS
      // BOTH streets (Main ~4 m, King ~11 m — both ≤ CENTRELINE_ABUT_M=13) and they share node 101 → corner.
      await insSeg(c, 1, 'Main', 'Main St', 100, 101, 'LINESTRING(-79.40010 43.70022, -79.39965 43.70022)', '1', '99', null);
      await insSeg(c, 2, 'King', 'King St', 101, 102, 'LINESTRING(-79.39965 43.70022, -79.39965 43.69995)');
      const id = await insParcel(c, 'CE-CORNER', 'POLYGON((-79.4 43.7, -79.39978 43.7, -79.39978 43.70018, -79.4 43.70018, -79.4 43.7))', 'Main', '30');

      const res = await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      expect(res.updated).toBeGreaterThanOrEqual(1);
      const p = await getParcel(c, id);
      expect(p.is_corner_lot).toBe(true);
      expect(p.primary_frontage_street_name).toBe('Main St'); // P1 name match (street_name_normalized='Main')
      expect(res.tally.p1).toBeGreaterThanOrEqual(1);
      expect(p.ver).toBe(SRC_VER); // lineage stamped
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF3 corner abut: parcel abuts one street; the cross street it shares a node with is ~19 m away → NOT corner', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // The over-detection case the 20 m frontage radius caused: 'Main' ABUTS the parcel (~4 m north) and ends at
      // node 101 ~18 m east; 'King' starts at node 101 and runs south, its nearest point ~19 m from the parcel.
      // Both are within 20 m (the pair forms) and they share node 101 — but the parcel does NOT abut King (>13 m).
      // Node-share alone (the rejected approach) flags this; "abuts BOTH streets" correctly rejects it.
      await insSeg(c, 11, 'Main', 'Main St', 100, 101, 'LINESTRING(-79.40010 43.70022, -79.39954 43.70022)');
      await insSeg(c, 12, 'King', 'King St', 101, 102, 'LINESTRING(-79.39954 43.70022, -79.39954 43.69996)');
      const id = await insParcel(c, 'CE-CORNER-ADJ', 'POLYGON((-79.4 43.7, -79.39978 43.7, -79.39978 43.70018, -79.4 43.70018, -79.4 43.7))', 'Main', '8');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_corner_lot).toBe(false); // King ~19 m away > CENTRELINE_ABUT_M (13)
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF3 corner abut: a true corner on a moderately-wide road (far street ~12 m, within the cap) → is_corner_lot=true', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Guards against over-tightening: a TRUE corner where the wider-allowance cross street sits ~12 m out — the
      // 13 m cap keeps it (a 10 m cap would have dropped it). 'Bloor' (~7 m) + 'Yonge' (~12 m) share node 101.
      await insSeg(c, 13, 'Bloor', 'Bloor St W', 100, 101, 'LINESTRING(-79.40010 43.70024, -79.39963 43.70024)');
      await insSeg(c, 14, 'Yonge', 'Yonge St', 101, 102, 'LINESTRING(-79.39963 43.70024, -79.39963 43.69998)');
      const id = await insParcel(c, 'CE-ARTERIAL', 'POLYGON((-79.4 43.7, -79.39978 43.7, -79.39978 43.70018, -79.4 43.70018, -79.4 43.7))', 'Bloor', '40');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_corner_lot).toBe(true); // both ≤ 13 m
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF3 through lot: two parallel streets on OPPOSITE sides (front + back) → is_through_lot=true', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Deep lot fronting 'Front St' (~3 m south) and backing onto 'Back St' (~3 m north); both E-W parallel, no
      // shared node. seg_count≥2 + parallel + opposite-sides → through (but NOT corner — no shared node).
      await insSeg(c, 15, 'Front', 'Front St', 200, 201, 'LINESTRING(-79.40020 43.69997, -79.39958 43.69997)');
      await insSeg(c, 16, 'Back', 'Back St', 300, 301, 'LINESTRING(-79.40020 43.70033, -79.39958 43.70033)');
      const id = await insParcel(c, 'CE-THRU', 'POLYGON((-79.4 43.7, -79.39978 43.7, -79.39978 43.70030, -79.4 43.70030, -79.4 43.7))', 'Front', '5');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_through_lot).toBe(true);
      expect(p.is_corner_lot).toBe(false); // parallel, no shared node
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF3 through over-detection: two parallel streets on the SAME side → NOT through', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // The over-detection case: 'RoadA' (~3 m north) + 'RoadB' (~13 m north) are parallel & both within 20 m, but
      // BOTH north of the parcel. Old logic (parallel different streets) → false through. WF3 requires opposite sides.
      await insSeg(c, 17, 'RoadA', 'Road A', 400, 401, 'LINESTRING(-79.40020 43.70033, -79.39958 43.70033)');
      await insSeg(c, 18, 'RoadB', 'Road B', 500, 501, 'LINESTRING(-79.40020 43.70042, -79.39958 43.70042)');
      const id = await insParcel(c, 'CE-THRU-SAME', 'POLYGON((-79.4 43.70015, -79.39978 43.70015, -79.39978 43.70030, -79.4 43.70030, -79.4 43.70015))', 'RoadA', '6');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_through_lot).toBe(false); // both streets on the same (north) side → not opposite
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF3 concave (L-shaped) through lot: ST_PointOnSurface stays inside → is_through_lot=true', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // L-shaped parcel whose ST_Centroid can fall OUTSIDE the polygon; ST_PointOnSurface guarantees an interior
      // point so the opposite-sides azimuths are taken from inside the lot. Front (~3 m south) + Back (~3 m north).
      await insSeg(c, 19, 'LFront', 'L Front St', 600, 601, 'LINESTRING(-79.40020 43.69997, -79.39958 43.69997)');
      await insSeg(c, 20, 'LBack', 'L Back St', 700, 701, 'LINESTRING(-79.40020 43.70033, -79.39958 43.70033)');
      const id = await insParcel(
        c, 'CE-THRU-L',
        'POLYGON((-79.4 43.7, -79.39978 43.7, -79.39978 43.70012, -79.39989 43.70012, -79.39989 43.70030, -79.4 43.70030, -79.4 43.7))',
        'LFront', '7',
      );
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_through_lot).toBe(true); // opposite-sides held from the interior point despite the concave shape
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('interior lot: touches one street → not corner, not through', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insSeg(c, 3, 'Queen', 'Queen St', 200, 201, 'LINESTRING(95 105, 115 105)');
      const id = await insParcel(c, 'CE-INTERIOR', 'POLYGON((100 100,110 100,110 110,100 110,100 100))', 'Queen', '12');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_corner_lot).toBe(false);
      expect(p.is_through_lot).toBe(false);
      expect(p.primary_frontage_street_name).toBe('Queen St');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('frontage P2: no name match → address-range try-both resolves the street', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // parcel street_name_normalized does NOT match the segment base name → P1 fails;
      // civic number 30 falls in the left range 1..99 → P2 (address_match_status) resolves.
      await insSeg(c, 4, 'Elm', 'Elm Ave', 300, 301, 'LINESTRING(95 105, 115 105)', '1', '99', null);
      const id = await insParcel(c, 'CE-P2', 'POLYGON((100 100,110 100,110 110,100 110,100 100))', 'Mismatch', '30');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.primary_frontage_street_name).toBe('Elm Ave'); // resolved via P2
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('idempotent: a second enrich at the same version updates 0 rows', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insSeg(c, 5, 'Bay', 'Bay St', 400, 401, 'LINESTRING(-5 5, 15 5)');
      await insParcel(c, 'CE-IDEM', 'POLYGON((0 0,10 0,10 10,0 10,0 0))', 'Bay', '5');
      const r1 = await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      expect(r1.updated).toBeGreaterThanOrEqual(1);
      await c.query('DROP TABLE IF EXISTS tmp_centreline_enrich'); // simulate a second process run
      const r2 = await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      expect(r2.updated).toBe(0); // same version + same derived values → write-guard suppresses
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF2 proximity: a parcel ~11 m from a non-intersecting street is matched + frontage resolved', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Real Toronto coords. Parcel top edge at lat 43.70015; 'Birch' runs ~11 m north (43.70025,
      // 0.0001° lat ≈ 11 m) — NOT intersecting, but within the 20 m proximity radius.
      await insSeg(c, 6, 'Birch', 'Birch Ave', 600, 601, 'LINESTRING(-79.4 43.70025, -79.3998 43.70025)');
      const id = await insParcel(c, 'CE-NEAR', 'POLYGON((-79.4 43.7, -79.3998 43.7, -79.3998 43.70015, -79.4 43.70015, -79.4 43.7))', 'Birch', '7');
      const res = await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      expect(res.updated).toBeGreaterThanOrEqual(1); // matched despite NO intersection (containment would have missed it)
      const p = await getParcel(c, id);
      expect(p.primary_frontage_street_name).toBe('Birch Ave'); // P1 name match resolved
      expect(p.is_corner_lot).toBe(false);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF2 DEC-C: a NULL-name laneway sharing a node with a named street does NOT flag corner', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // 'Cedar' (node 700→701) crosses the parcel; an UNNAMED laneway (linear_name NULL, node 701→702)
      // touches the parcel's right edge, sharing node 701 with Cedar. Without the NULL-name guard,
      // (Cedar IS DISTINCT FROM NULL) + shared node → false corner. The guard suppresses it.
      await insSeg(c, 7, 'Cedar', 'Cedar St', 700, 701, 'LINESTRING(-79.40005 43.70008, -79.39975 43.70008)');
      await insSeg(c, 8, null, null, 701, 702, 'LINESTRING(-79.3998 43.70008, -79.3998 43.70025)');
      const id = await insParcel(c, 'CE-LANE', 'POLYGON((-79.4 43.7, -79.3998 43.7, -79.3998 43.70015, -79.4 43.70015, -79.4 43.7))', 'Cedar', '9');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_corner_lot).toBe(false); // DEC-C guard: unnamed laneway is not "a different street"
      expect(p.primary_frontage_street_name).toBe('Cedar St'); // still resolves frontage via the named street
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF3 #431-FU: a NAMED laneway sharing a node with a street (both abut) does NOT flag corner', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // CLONE of CE-CORNER geometry (would be corner=true: named, share node 101, both abut ≤13 m) BUT the
      // cross segment is a NAMED 'Laneway' — the WF2 name guard doesn't catch it; only the #431-FU lane guard does.
      await insSeg(c, 1, 'Main', 'Main St', 100, 101, 'LINESTRING(-79.40010 43.70022, -79.39965 43.70022)', '1', '99', null);
      await insSeg(c, 2, 'Smith Lane', 'Smith Lane', 101, 102, 'LINESTRING(-79.39965 43.70022, -79.39965 43.69995)', null, null, null, 'Laneway');
      const id = await insParcel(c, 'CE-LANE-NAMED-CORNER', 'POLYGON((-79.4 43.7, -79.39978 43.7, -79.39978 43.70018, -79.4 43.70018, -79.4 43.7))', 'Main', '30');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_corner_lot).toBe(false); // #431-FU: a street + named laneway junction is not a corner
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WF3 #431-FU: a parcel fronting a street and backing a NAMED laneway does NOT flag through', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // CLONE of CE-THRU geometry (would be through=true: parallel, opposite, both abut) BUT the back segment is
      // a NAMED 'Laneway' — the normal downtown lot (street front + rear lane), not a double-frontage through lot.
      await insSeg(c, 15, 'Front', 'Front St', 200, 201, 'LINESTRING(-79.40020 43.69997, -79.39958 43.69997)');
      await insSeg(c, 16, 'Rear Lane', 'Rear Lane', 300, 301, 'LINESTRING(-79.40020 43.70033, -79.39958 43.70033)', null, null, null, 'Laneway');
      const id = await insParcel(c, 'CE-LANE-THRU', 'POLYGON((-79.4 43.7, -79.39978 43.7, -79.39978 43.70030, -79.4 43.70030, -79.4 43.7))', 'Front', '5');
      await ec.enrichCentreline(c, { sourceDatasetVersion: SRC_VER });
      const p = await getParcel(c, id);
      expect(p.is_through_lot).toBe(false); // #431-FU: a rear laneway is not a second street frontage
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('assertPreconditions passes against the migrated schema (indexes + columns + functions)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insSeg(c, 9, 'Spadina', 'Spadina Ave', 900, 901, 'LINESTRING(0 0, 1 1)'); // non-empty source (L14-equiv)
      await expect(ec.assertPreconditions(c)).resolves.toBeUndefined();
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
