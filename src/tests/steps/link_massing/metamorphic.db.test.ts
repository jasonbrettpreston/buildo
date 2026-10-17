// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §15 (claim #172 — metamorphic invariants)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (the compute is pure)
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §3 (the matching predicate, the classifier)
//
// METAMORPHIC INVARIANTS — properties that hold for EVERY input, not for one fixture.
//
// ⚠️ WHY THIS FILE EXISTS SEPARATELY FROM THE RUNG-1 FIXTURES. A fixture says "this input
// gives this output"; it cannot say "no input gives a second primary" or "the answer does
// not depend on row order". Those are the properties a spatial step actually breaks — the
// b16c036d incident was NOT a wrong answer on a known parcel, it was an ASYMMETRIC
// relation applied in the wrong direction across the whole city, which every individual
// fixture would have kept passing on the parcels where a house happens to cover its lot
// centroid.
//
// M1-M3 are pure and always run. M4-M5 need PostGIS and are skipped without a database.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool } from '../../db/setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
interface MatchRow { parcel_id: number; building_id: number; footprint_area_sqm: number }
interface LinkRow { parcel_id: number; building_id: number; is_primary: boolean; structure_type: string; match_type: string; confidence: number }
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute under test
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/link-massing.js')) as {
  classifyMatches: (rows: MatchRow[], config: Record<string, number>) => { rows: LinkRow[]; parcels: number; matches: number };
  classifyStructure: (area: number, all: number[], shed: number, garage: number) => string;
  buildMatchSql: (d: unknown, c: Record<string, number> | null, mode?: string) => { primary_match_sql: string };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor
const descriptor = require(path.join(REPO_ROOT, 'scripts/link-massing.descriptor.json'));

const CONFIG = {
  massing_shed_threshold_sqm: 20,
  massing_garage_max_sqm: 60,
  massing_nearest_max_distance_m: 50,
  link_massing_centroid_confidence: 0.95,
  link_massing_nearest_confidence: 0.6,
};

/** A small deterministic pseudo-random generator — same sequence on every machine. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** N synthetic match rows across P parcels, with areas spanning the shed/garage/primary bands. */
function sampleRows(seed: number, parcels = 40): MatchRow[] {
  const r = rng(seed);
  const rows: MatchRow[] = [];
  let buildingId = 1;
  for (let p = 1; p <= parcels; p++) {
    const n = 1 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      rows.push({ parcel_id: p, building_id: buildingId++, footprint_area_sqm: Math.round(r() * 400 * 100) / 100 });
    }
  }
  return rows;
}

function shuffle<T>(items: T[], seed: number): T[] {
  const r = rng(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function key(row: LinkRow): string {
  return `${row.parcel_id}:${row.building_id}:${row.is_primary}:${row.structure_type}`;
}

describe('metamorphic — the classifier (pure, always runs)', () => {
  it('M1 — EXACTLY ONE primary per parcel, for every generated input', () => {
    // The property idx_parcel_buildings_one_primary enforces at the database and fence
    // 5bb31faf's clear preserves at write time. If classifyStructure ever returned
    // 'primary' for two equal-area buildings without the id tiebreak collapsing one of
    // them, this fires long before a partial-unique-index violation does.
    for (let seed = 1; seed <= 25; seed++) {
      const { rows } = compute.classifyMatches(sampleRows(seed), CONFIG);
      const primaries = new Map<number, number>();
      for (const r of rows) if (r.is_primary) primaries.set(r.parcel_id, (primaries.get(r.parcel_id) ?? 0) + 1);
      const offenders = [...primaries.entries()].filter(([, n]) => n !== 1);
      expect(offenders, `seed ${seed}: parcels with != 1 primary`).toEqual([]);
      const parcels = new Set(rows.map((r) => r.parcel_id));
      expect(primaries.size, `seed ${seed}: every parcel with a link has a primary`).toBe(parcels.size);
    }
  });

  it('M2 — PERMUTATION INVARIANCE: the result does not depend on the order the join returned rows in', () => {
    // The join has no ORDER BY (the classifier supplies its own), so a plan change can
    // reorder its output at any time. If the classification depended on arrival order, a
    // Postgres upgrade would silently re-assign primaries across the whole city.
    for (let seed = 1; seed <= 25; seed++) {
      const base = compute.classifyMatches(sampleRows(seed), CONFIG).rows.map(key).sort();
      const permuted = compute.classifyMatches(shuffle(sampleRows(seed), seed * 7 + 1), CONFIG).rows.map(key).sort();
      expect(permuted, `seed ${seed}: permuting the input changed the links`).toEqual(base);
    }
  });

  it('M3 — SCALE INVARIANCE: scaling every area and both thresholds by k leaves the classification unchanged', () => {
    // The classifier compares areas against thresholds and against each other, so it is a
    // pure function of RATIOS. A future edit that mixed an absolute constant into it — a
    // square-metre floor, a rounding step — breaks this without breaking any fixture.
    for (const k of [0.5, 2, 10]) {
      for (let seed = 1; seed <= 10; seed++) {
        const rows = sampleRows(seed);
        const base = compute.classifyMatches(rows, CONFIG).rows.map((r) => `${r.parcel_id}:${r.building_id}:${r.structure_type}`);
        const scaled = compute.classifyMatches(
          rows.map((r) => ({ ...r, footprint_area_sqm: r.footprint_area_sqm * k })),
          { ...CONFIG, massing_shed_threshold_sqm: CONFIG.massing_shed_threshold_sqm * k, massing_garage_max_sqm: CONFIG.massing_garage_max_sqm * k },
        ).rows.map((r) => `${r.parcel_id}:${r.building_id}:${r.structure_type}`);
        expect(scaled, `k=${k} seed=${seed}`).toEqual(base);
      }
    }
  });
});

describe.skipIf(!dbAvailable())('metamorphic — the spatial predicate (PostGIS)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  const PLAN = compute.buildMatchSql(descriptor, CONFIG, 'full');

  it('M4 — CONTAINMENT IS ASYMMETRIC: swapping the arguments is a DIFFERENT relation (fence b16c036d)', async () => {
    // The incident, stated as a property rather than as a parcel. If the two directions
    // agreed, the flip would have been a no-op and the 58% -> 99.7% coverage jump could
    // not have happened — so a test suite in which they agree is a suite testing the wrong
    // geometries.
    const c: PoolClient = await pool.connect();
    try {
      const lot = 'POLYGON((0 0, 0.0002 0, 0.0002 0.0002, 0 0.0002, 0 0))';
      const house = 'POLYGON((0.00003 0.00003, 0.00009 0.00003, 0.00009 0.00009, 0.00003 0.00009, 0.00003 0.00003))';
      const { rows } = await c.query(
        `SELECT ST_Contains(l.g, ST_Centroid(h.g))  AS building_centre_on_lot,
                ST_Contains(h.g, ST_Centroid(l.g))  AS lot_centre_in_building
           FROM (SELECT ST_GeomFromText($1, 4326) AS g) l,
                (SELECT ST_GeomFromText($2, 4326) AS g) h`,
        [lot, house],
      );
      expect(rows[0].building_centre_on_lot, 'the building centre IS on the lot').toBe(true);
      expect(rows[0].lot_centre_in_building, 'the lot centre is NOT in the building — the asymmetry').toBe(false);
    } finally { c.release(); }
  });

  it('M5 — TRANSLATION INVARIANCE: moving a lot and its building together does not change whether they link', async () => {
    // A containment relation must not depend on WHERE in the city the pair sits. If it
    // did, the step would be linking by coordinate magnitude — which is exactly what the
    // retired Mercator auto-detect heuristic risked (it switched reprojection on whether a
    // coordinate exceeded 200).
    const c: PoolClient = await pool.connect();
    try {
      const offsets: Array<[number, number]> = [[0, 0], [-79.4, 43.7], [10, -20]];
      for (const [dx, dy] of offsets) {
        const lot = `POLYGON((${dx} ${dy}, ${dx + 0.0002} ${dy}, ${dx + 0.0002} ${dy + 0.0002}, ${dx} ${dy + 0.0002}, ${dx} ${dy}))`;
        const house = `POLYGON((${dx + 0.00003} ${dy + 0.00003}, ${dx + 0.00009} ${dy + 0.00003}, ${dx + 0.00009} ${dy + 0.00009}, ${dx + 0.00003} ${dy + 0.00009}, ${dx + 0.00003} ${dy + 0.00003}))`;
        const { rows } = await c.query(
          `SELECT ST_Contains(ST_GeomFromText($1, 4326), ST_Centroid(ST_GeomFromText($2, 4326))) AS linked`,
          [lot, house],
        );
        expect(rows[0].linked, `translated by (${dx}, ${dy})`).toBe(true);
      }
      expect(PLAN.primary_match_sql).toContain('ST_Contains');
    } finally { c.release(); }
  });
});
