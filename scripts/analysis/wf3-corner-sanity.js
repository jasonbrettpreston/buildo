#!/usr/bin/env node
/** #431-FU sanity — is is_corner_lot ~11% realistic? Cross-check vs real street-intersection count. Read-only. */
'use strict';
const pipeline = require('../lib/pipeline');
pipeline.run('wf3-corner-sanity', async (pool) => {
  const tot = await pool.query(`SELECT count(*)::int n, count(*) FILTER (WHERE is_corner_lot)::int c
    FROM parcels WHERE geom IS NOT NULL AND ST_IsValid(geom)`);
  const { n, c } = tot.rows[0];
  pipeline.log.info(`parcels=${n}  corner_lots=${c}  (${(100 * c / n).toFixed(1)}%)`);

  // Real intersections: a node (from_ or to_intersection_id) with >=3 incident NON-laneway street segment-ends
  // (4-way=4, T=3). 2 incident = a name-change / continuation, NOT an intersection. Count distinct STREET names
  // too, so a node needs >=2 distinct named streets to count as a real crossing.
  const ix = await pool.query(`
    WITH ends AS (
      SELECT from_intersection_id AS node, id, linear_name FROM toronto_centreline
        WHERE LOWER(feature_code_desc) <> 'laneway' AND linear_name IS NOT NULL AND from_intersection_id IS NOT NULL
      UNION ALL
      SELECT to_intersection_id AS node, id, linear_name FROM toronto_centreline
        WHERE LOWER(feature_code_desc) <> 'laneway' AND linear_name IS NOT NULL AND to_intersection_id IS NOT NULL
    ),
    nodes AS (
      SELECT node, count(*) AS seg_ends, count(DISTINCT linear_name) AS distinct_streets
      FROM ends GROUP BY node
    )
    SELECT
      count(*) FILTER (WHERE seg_ends >= 3 AND distinct_streets >= 2)::int real_intersections,
      count(*) FILTER (WHERE seg_ends >= 4 AND distinct_streets >= 2)::int four_way_plus,
      count(*) FILTER (WHERE seg_ends = 3 AND distinct_streets >= 2)::int three_way_T
    FROM nodes`);
  const { real_intersections, four_way_plus, three_way_T } = ix.rows[0];
  pipeline.log.info(`real intersections (>=3 ends, >=2 streets): ${real_intersections}  (4-way+ ${four_way_plus}, T ${three_way_T})`);
  // expected corner lots if ~4 per 4-way and ~3 per T (upper bound — assumes every quadrant is a separate lot)
  const expHi = four_way_plus * 4 + three_way_T * 3;
  const expLo = four_way_plus * 2 + three_way_T * 2; // lower bound (corners often shared / non-residential)
  pipeline.log.info(`corner_lots / real_intersection = ${(c / real_intersections).toFixed(2)}  (4-way+T geometry expects ~2-4)`);
  pipeline.log.info(`expected corner range: ${expLo}-${expHi}  (${(100 * expLo / n).toFixed(1)}%-${(100 * expHi / n).toFixed(1)}% of parcels); actual ${c} (${(100 * c / n).toFixed(1)}%)`);

  pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null });
  pipeline.emitMeta({ parcels: ['is_corner_lot'], toronto_centreline: ['from_intersection_id', 'to_intersection_id', 'linear_name', 'feature_code_desc'] }, {});
});
