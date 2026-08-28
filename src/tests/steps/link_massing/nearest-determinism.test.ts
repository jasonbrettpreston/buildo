// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6.1 (G4d — both-directions locks), §15 (step testing)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (the compute owns the SQL TEXT, ruling A-2 option 2)
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §3 (the matching predicate)
//
// LM-D13 — THE NEAREST FALLBACK'S SELECTION RULE, PROVEN AGAINST A DATABASE (peel 8b).
//
// The defect: `SELECT DISTINCT ON (p.id) … ORDER BY p.id, ST_Distance(...) ASC` keeps the FIRST
// row of the sort, and with distance alone an equidistant pair has NO ordering between its
// members — so which building a parcel gets is whatever the plan happened to emit first.
// Measured on the live junction: 18,252 of 103,530 nearest links can flip, 17,566 of them tied
// at distance 0 (a footprint overlapping the lot with its centroid outside it). Two forced FULL
// relinks of the old code hashed `a0023203` and `0d2ea577` with all eight invariants identical.
//
// The rule, declared in the descriptor's `match_nearest_fallback` check and implemented in
// `buildMatchSql`: distance first, then the fence-5bb31faf order — LARGEST footprint wins,
// LOWEST building_id breaks the remainder.
//
// ⚠️ WHY THE PRE-SHUFFLE. A tie is only observable if the input order can vary, and on a
// two-row fixture it otherwise never does. `(SELECT * FROM building_footprints ORDER BY random())`
// makes the row order genuinely arbitrary on every execution, which is exactly the condition the
// query planner creates at 427,077 rows. Both directions are then real measurements rather than
// assertions about text:
//   · WITH the tiebreak    — 40 shuffled executions, the SAME building every time (the larger).
//   · WITHOUT it (mutant)  — 40 shuffled executions return BOTH buildings. If a mutant that
//                            dropped the rule still answered consistently, this lock would be
//                            proving nothing, and that is what the second half refuses.
//
// The text-level half of this fence (F5, every reversion shape) lives in violations.test.ts and
// runs with no database. This file is the behavioural half.
//
// Skipped unless DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer). BEGIN/ROLLBACK.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool } from '../../db/setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute under test
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/link-massing.js')) as {
  buildMatchSql: (d: unknown, c: Record<string, number> | null, mode?: string) => {
    fallback_match_sql: string;
    fallback_bbox_degrees: number;
    fallback_max_distance: number;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor (guards.srid)
const descriptor = require(path.join(REPO_ROOT, 'scripts/link-massing.descriptor.json'));

const CONFIG = {
  massing_shed_threshold_sqm: 20,
  massing_garage_max_sqm: 60,
  massing_nearest_max_distance_m: 50,
  link_massing_centroid_confidence: 0.95,
  link_massing_nearest_confidence: 0.6,
};
const PLAN = compute.buildMatchSql(descriptor, CONFIG, 'full');

/** The production statement, with `building_footprints` replaced by a randomly ordered scan. */
function shuffled(sql: string): string {
  return sql
    .replace(/JOIN building_footprints bf/, 'JOIN (SELECT * FROM building_footprints ORDER BY random()) bf')
    .replace(/;$/, '');
}
/** The pre-8b text: the same statement with the declared tiebreak removed. */
function withoutTiebreak(sql: string): string {
  const out = sql.replace(/,\s*bf\.footprint_area_sqm DESC, bf\.id ASC/, '');
  if (out === sql) throw new Error('the mutant is identical to the subject — the tiebreak is not in the production SQL');
  return out;
}

const TRIALS = 40;
const PARCEL_BASE = 993_000_000;
/** The two areas the rule must choose between. Set explicitly so the rule, not the geometry, decides. */
const BIG_AREA = 100;
const SMALL_AREA = 40;

function square(x0: number, y0: number, side: number): string {
  return `POLYGON((${x0} ${y0}, ${x0 + side} ${y0}, ${x0 + side} ${y0 + side}, ${x0} ${y0 + side}, ${x0} ${y0}))`;
}

describe.skipIf(!dbAvailable())('LM-D13 — the nearest fallback resolves a distance tie by a declared rule, not by plan order', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  /**
   * One lot and TWO footprints that both OVERLAP it — so both sit at geography distance 0 and
   * the distance term cannot separate them — with different areas and, deliberately, the LARGER
   * one inserted SECOND so heap order and the declared rule disagree.
   */
  async function seedTie(c: PoolClient, n: number): Promise<{ parcel: number; big: number; small: number }> {
    const lotWkt = square(0, 0, 0.0002);
    const lot = await c.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, centroid_lat, centroid_lng)
       VALUES ($1, 'TEST', ST_AsGeoJSON(ST_GeomFromText($2, 4326))::jsonb, ST_GeomFromText($2, 4326),
               ST_Y(ST_Centroid(ST_GeomFromText($2, 4326))), ST_X(ST_Centroid(ST_GeomFromText($2, 4326))))
       RETURNING id`,
      [PARCEL_BASE + n, lotWkt],
    );
    const footprint = async (tag: string, wkt: string, area: number): Promise<number> => {
      const r = await c.query(
        `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm, centroid_lat, centroid_lng)
         VALUES ($1, ST_AsGeoJSON(ST_GeomFromText($2, 4326))::jsonb, ST_GeomFromText($2, 4326), $3,
                 ST_Y(ST_Centroid(ST_GeomFromText($2, 4326))), ST_X(ST_Centroid(ST_GeomFromText($2, 4326))))
         RETURNING id`,
        [tag, wkt, area],
      );
      return Number(r.rows[0].id);
    };
    // Both straddle a lot edge: the polygons intersect the lot (distance 0) while their
    // centroids fall outside it, which is exactly the 17,566-row live population.
    const small = await footprint(`LM-D13-${n}-small`, square(-0.00006, 0.00005, 0.00008), SMALL_AREA);
    const big = await footprint(`LM-D13-${n}-big`, square(0.00016, 0.00005, 0.00012), BIG_AREA);
    return { parcel: Number(lot.rows[0].id), big, small };
  }

  async function winners(c: PoolClient, sql: string, parcel: number): Promise<Set<number>> {
    const seen = new Set<number>();
    for (let i = 0; i < TRIALS; i++) {
      const r = await c.query(sql, [[parcel], PLAN.fallback_bbox_degrees, PLAN.fallback_max_distance]);
      expect(r.rows.length, 'DISTINCT ON (p.id) must return exactly one row per parcel').toBe(1);
      seen.add(Number(r.rows[0].building_id));
    }
    return seen;
  }

  it('the fixture really is a tie — both footprints sit at geography distance 0 from the lot', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      const { parcel, big, small } = await seedTie(c, 1);
      const { rows } = await c.query(
        `SELECT bf.id, ST_Distance(p.geom::geography, bf.geom::geography) AS d
           FROM parcels p JOIN building_footprints bf ON bf.id = ANY($2::int[])
          WHERE p.id = $1 ORDER BY bf.id`,
        [parcel, [big, small]],
      );
      expect(rows.length).toBe(2);
      for (const r of rows) expect(Number(r.d), `building ${r.id} must be at distance 0 — otherwise the distance term, not the tiebreak, is deciding`).toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it(`WITH the declared tiebreak: ${TRIALS} randomly ordered executions all return the SAME building, and it is the larger footprint`, async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      const { parcel, big } = await seedTie(c, 2);
      const seen = await winners(c, shuffled(PLAN.fallback_match_sql), parcel);
      expect([...seen], `LM-D13: the tie must resolve identically on every execution, got ${seen.size} distinct winners`).toEqual([big]);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('WITH the declared tiebreak: toggling the planner (enable_seqscan on/off) does not change the winner', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      const { parcel, big } = await seedTie(c, 3);
      const sql = PLAN.fallback_match_sql.replace(/;$/, '');
      const picks: number[] = [];
      for (const seqscan of ['on', 'off']) {
        await c.query(`SET LOCAL enable_seqscan = ${seqscan}`);
        const r = await c.query(sql, [[parcel], PLAN.fallback_bbox_degrees, PLAN.fallback_max_distance]);
        picks.push(Number(r.rows[0].building_id));
      }
      expect(picks[0], 'the same query under two plans must link the same building').toBe(picks[1]);
      expect(picks[0], 'and it must be the building the RULE names, not the one the plan happened to emit').toBe(big);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it(`WITHOUT the tiebreak (the pinned pre-8b text): ${TRIALS} randomly ordered executions return BOTH buildings — the mutation reddens the lock`, async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      const { parcel, big, small } = await seedTie(c, 4);
      const seen = await winners(c, withoutTiebreak(shuffled(PLAN.fallback_match_sql)), parcel);
      expect([...seen].sort((a, b) => a - b), `the pinned text must be shown NON-deterministic — if one building won all ${TRIALS} shuffled executions this lock proves nothing`)
        .toEqual([big, small].sort((a, b) => a - b));
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});

describe('LM-D13 — the statement under test is the production statement (runs without a database)', () => {
  it('the tiebreak is read off buildMatchSql, and the mutant is a real mutation of it', () => {
    expect(PLAN.fallback_match_sql).toMatch(/ORDER BY p\.id, ST_Distance\(p\.geom::geography, bf\.geom::geography\) ASC, bf\.footprint_area_sqm DESC, bf\.id ASC/);
    expect(() => withoutTiebreak(PLAN.fallback_match_sql), 'the mutant must differ from the subject').not.toThrow();
    expect(withoutTiebreak(PLAN.fallback_match_sql)).not.toContain('footprint_area_sqm DESC');
    expect(shuffled(PLAN.fallback_match_sql)).toContain('ORDER BY random()');
  });
});
