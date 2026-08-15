// SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §1, §7.1
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md
//
// WF3 F1 (2026-08-15) — VALUE EQUIVALENCE, not shape. The shape lock lives in
// src/tests/refresh-snapshot-query-consolidation.logic.test.ts; this file proves the
// measured winner produces THE SAME NUMBERS as the pre-fix queries it replaces — "the
// numbers into data_quality_snapshots must be identical, only the query shape changed."
//
// Method: the pre-fix query TEXT is reproduced verbatim below (12 queries — the 10
// scalar + 2 GROUP BY that buildPermitsScalarQuery/buildTagBreakdownQuery replace) and
// run back-to-back with the new builders' output against the SAME snapshot of the
// `permits` table (no writes happen between the two passes within a test, so both see
// identical data regardless of what else is in the table — the equivalence property
// does not require the table to be empty or fixture-scoped, only that OLD and NEW read
// the same rows). A rich FX-prefixed fixture exercises every FILTER branch with
// non-zero values so a trivial "both are 0 on an empty table" pass can't hide a bug.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/refresh-snapshot-consolidation.db.test.ts

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real module's exports
const snapshotMod = require('../../../scripts/refresh-snapshot.js');

const FX = 'FXF1SNAP';
const ACTIVE = snapshotMod.ACTIVE_PERMIT_STATUSES as string[];

describe.skipIf(!dbAvailable())('refresh-snapshot.js — WF3 F1 value equivalence (old queries vs consolidated builders)', () => {
  let pool: any;

  beforeAll(() => {
    pool = getTestPool();
    if (!pool) throw new Error('dbAvailable() true but no test pool');
  });

  // Filled in beforeEach with the SERIAL `id` values assigned to the fixture
  // neighbourhoods rows — fk_permits_neighbourhoods references neighbourhoods.id,
  // NOT the natural-key neighbourhoods.neighbourhood_id column.
  let nb: number[] = [];

  beforeEach(async () => {
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE '${FX}%'`);
    await pool.query(`DELETE FROM neighbourhoods WHERE name LIKE 'FX Neighbourhood%' OR neighbourhood_id = -1`);
    // A synthetic id=-1 row so the -1 "no match" sentinel (link-neighbourhoods.js:149)
    // satisfies fk_permits_neighbourhoods the same way it must in production.
    await pool.query(
      `INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES (-1, -1, 'FX Unknown')`,
    );
    const { rows: nbRows } = await pool.query(
      `INSERT INTO neighbourhoods (neighbourhood_id, name)
       SELECT 9000 + g, 'FX Neighbourhood ' || g FROM generate_series(1, 4) g
       RETURNING id`,
    );
    nb = nbRows.map((r: { id: number }) => r.id);

    // A deliberately varied fixture: active/inactive status, null/empty/set builder,
    // valid/-1/null neighbourhood, geocoded/not, core+extra scope_tags, recent/old
    // last_seen_at, every null-count/violation column exercised both ways.
    await pool.query(
      `INSERT INTO permits (
         permit_num, revision_num, status, builder_name, neighbourhood_id,
         latitude, longitude, scope_tags, last_seen_at,
         description, street_num, street_name, geo_id,
         est_const_cost, issued_date
       ) VALUES
         ('${FX}01','00','Permit Issued','Acme Builders',${nb[0]},43.6,-79.4,ARRAY['residential','roofing'],NOW(),'desc','12','Main','G1',50000,'2020-01-01'),
         ('${FX}02','00','Revision Issued',NULL,NULL,NULL,NULL,ARRAY['commercial'],NOW() - INTERVAL '2 days','desc','12','Main','G2',75000,'2020-01-01'),
         ('${FX}03','00','Under Review','',-1,43.7,-79.5,ARRAY['mixed-use','electrical'],NOW() - INTERVAL '10 days',NULL,NULL,NULL,NULL,NULL,NULL),
         ('${FX}04','00','Inspection','Beta Co',${nb[1]},43.8,-79.6,ARRAY['plumbing'],NOW() - INTERVAL '40 days','','','','',50,'2099-01-01'),
         ('${FX}05','00','Examination','Gamma Inc',${nb[2]},NULL,NULL,NULL,NOW(),'d','1','St','G5',2000000000,'2020-06-01'),
         ('${FX}06','00','Closed','Delta LLC',${nb[3]},43.9,-79.7,ARRAY['residential'],NOW(),'d','1','St','G6',10000,'2020-06-01'),
         ('${FX}07','00',NULL,'Epsilon',NULL,NULL,NULL,ARRAY[]::text[],NOW(),'d','1','St','G7',10000,'2020-06-01'),
         ('${FX}08','00','Permit Issued','Zeta',${nb[0]},43.65,-79.45,ARRAY['residential','commercial','hvac'],NOW(),'d','1','St','G8',10000,'2020-06-01')`,
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE '${FX}%'`);
    await pool.query(`DELETE FROM neighbourhoods WHERE name LIKE 'FX Neighbourhood%' OR neighbourhood_id = -1`);
    await pool.end();
  });

  /** Reproduces the pre-WF3-F1 10-query shape verbatim (values only — not the plan). */
  async function computeOldScalars() {
    const permitsRes = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')) as active
       FROM permits`,
    );
    const permitsBuilderRes = await pool.query(
      `SELECT COUNT(*) as count FROM permits WHERE builder_name IS NOT NULL AND builder_name != ''`,
    );
    const nhoodRes = await pool.query(
      `SELECT COUNT(*) as count FROM permits
       WHERE neighbourhood_id IS NOT NULL AND neighbourhood_id != -1
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`,
    );
    const geoRes = await pool.query(
      `SELECT COUNT(*) as count FROM permits WHERE latitude IS NOT NULL AND longitude IS NOT NULL`,
    );
    const scopeRes = await pool.query(
      `SELECT COUNT(*) as count FROM permits
       WHERE ('residential' = ANY(scope_tags) OR 'commercial' = ANY(scope_tags) OR 'mixed-use' = ANY(scope_tags))
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`,
    );
    const scopeTagsRes = await pool.query(
      `SELECT COUNT(*) as count FROM permits
       WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`,
    );
    const detailedTagsRes = await pool.query(
      `SELECT COUNT(*) as count FROM permits
       WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')
         AND EXISTS (SELECT 1 FROM unnest(scope_tags) AS t WHERE t NOT IN ('residential', 'commercial', 'mixed-use'))`,
    );
    const freshRes = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours') as updated_24h,
              COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days') as updated_7d,
              COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '30 days') as updated_30d
       FROM permits`,
    );
    const nullsRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE description IS NULL OR description = '') as null_description,
         COUNT(*) FILTER (WHERE builder_name IS NULL OR builder_name = '') as null_builder_name,
         COUNT(*) FILTER (WHERE est_const_cost IS NULL) as null_est_const_cost,
         COUNT(*) FILTER (WHERE street_num IS NULL OR street_num = '') as null_street_num,
         COUNT(*) FILTER (WHERE street_name IS NULL OR street_name = '') as null_street_name,
         COUNT(*) FILTER (WHERE geo_id IS NULL OR geo_id = '') as null_geo_id
       FROM permits
       WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`,
    );
    const violationsRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE est_const_cost IS NOT NULL AND (est_const_cost < 100 OR est_const_cost > 1000000000)) as cost_oor,
         COUNT(*) FILTER (WHERE issued_date > NOW()) as future_issued,
         COUNT(*) FILTER (WHERE status IS NULL OR status = '') as missing_status
       FROM permits
       WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`,
    );
    return {
      total: permitsRes.rows[0].total, active: permitsRes.rows[0].active,
      permits_with_builder: permitsBuilderRes.rows[0].count,
      neighbourhood_count: nhoodRes.rows[0].count,
      geocoded_count: geoRes.rows[0].count,
      scope_count: scopeRes.rows[0].count,
      scope_tags_count: scopeTagsRes.rows[0].count,
      detailed_tags_count: detailedTagsRes.rows[0].count,
      updated_24h: freshRes.rows[0].updated_24h, updated_7d: freshRes.rows[0].updated_7d, updated_30d: freshRes.rows[0].updated_30d,
      null_description: nullsRes.rows[0].null_description, null_builder_name: nullsRes.rows[0].null_builder_name,
      null_est_const_cost: nullsRes.rows[0].null_est_const_cost, null_street_num: nullsRes.rows[0].null_street_num,
      null_street_name: nullsRes.rows[0].null_street_name, null_geo_id: nullsRes.rows[0].null_geo_id,
      cost_oor: violationsRes.rows[0].cost_oor, future_issued: violationsRes.rows[0].future_issued,
      missing_status: violationsRes.rows[0].missing_status,
    };
  }

  /** Reproduces the pre-WF3-F1 2-query GROUP BY shape verbatim. */
  async function computeOldTagRows() {
    const topTagsRes = await pool.query(
      `SELECT tag, COUNT(*) as count
       FROM (SELECT unnest(scope_tags) as tag FROM permits
             WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
               AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')) sub
       WHERE tag NOT IN ('residential', 'commercial', 'mixed-use')
       GROUP BY tag ORDER BY count DESC LIMIT 10`,
    );
    const scopeBreakdownRes = await pool.query(
      `SELECT tag, COUNT(*) as count
       FROM (SELECT unnest(scope_tags) as tag FROM permits
             WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
               AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')) sub
       WHERE tag IN ('residential', 'commercial', 'mixed-use')
       GROUP BY tag`,
    );
    const breakdown: Record<string, number> = {};
    for (const r of scopeBreakdownRes.rows) breakdown[r.tag] = parseInt(r.count, 10);
    const tagsTop: Record<string, number> = {};
    for (const r of topTagsRes.rows) tagsTop[r.tag] = parseInt(r.count, 10);
    return { breakdown, tagsTop };
  }

  it('① consolidated scalar query produces IDENTICAL values to the 10 old queries, per metric', async () => {
    const oldValues = await computeOldScalars();
    const { sql, params } = snapshotMod.buildPermitsScalarQuery();
    expect(params).toEqual([ACTIVE]);
    const { rows } = await pool.query(sql, params);
    const newValues = rows[0];

    // Sanity: this fixture must actually exercise non-zero values, or equivalence
    // would trivially hold on an all-zero comparison.
    expect(Number(oldValues.total)).toBeGreaterThanOrEqual(8);
    expect(Number(oldValues.active)).toBeGreaterThan(0);
    expect(Number(oldValues.null_description)).toBeGreaterThan(0);
    expect(Number(oldValues.cost_oor)).toBeGreaterThan(0);

    for (const metric of Object.keys(oldValues) as Array<keyof typeof oldValues>) {
      expect(String(newValues[metric]), `metric "${metric}" diverged: old=${oldValues[metric]} new=${newValues[metric]}`)
        .toBe(String(oldValues[metric]));
    }
  });

  it('② consolidated tag-breakdown query produces IDENTICAL breakdown + top-tags maps to the 2 old queries', async () => {
    const old = await computeOldTagRows();
    const { sql, params } = snapshotMod.buildTagBreakdownQuery();
    const { rows } = await pool.query(sql, params);
    const { breakdown, tagsTop } = snapshotMod.splitTagBreakdown(rows);

    // Sanity: non-trivial fixture.
    expect(Object.keys(old.breakdown).length).toBeGreaterThan(0);
    expect(Object.keys(old.tagsTop).length).toBeGreaterThan(0);

    expect(breakdown).toEqual(old.breakdown);
    expect(tagsTop).toEqual(old.tagsTop);
  });

  it('③ tradeByType query (unchanged shape) still returns the expected 4 columns', async () => {
    const { sql, params } = snapshotMod.buildTradeByTypeQuery();
    const { rows } = await pool.query(sql, params);
    const row = rows[0];
    expect(row).toHaveProperty('res_classified');
    expect(row).toHaveProperty('res_total');
    expect(row).toHaveProperty('com_classified');
    expect(row).toHaveProperty('com_total');
    // res_total counts every FX permit tagged 'residential': 01 and 08 = 2.
    expect(Number(row.res_total)).toBe(2);
  });
});
