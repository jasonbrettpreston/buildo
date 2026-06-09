#!/usr/bin/env node
/**
 * #431-FU ground-truth spot-check — verify is_corner_lot against an INDEPENDENT signal:
 * distance to the nearest REAL street-intersection node (≥3 non-lane street-ends, ≥2 distinct names),
 * cross-checked with the count of distinct non-lane streets the parcel actually abuts (≤13 m).
 * A true corner sits AT a node (≤~20 m) and abuts ≥2 streets; a true mid-block lot is FAR (≥~30 m).
 * Deterministic spread sample (md5) so it's reproducible. Read-only.
 */
'use strict';
const pipeline = require('../lib/pipeline');

const ABUT = 13;
const NEAR_NODE = 20;   // a real corner's node is within ~20 m
const FAR_NODE = 30;    // a real mid-block lot's nearest node is ≥ ~30 m away

pipeline.run('wf3-corner-groundtruth', async (pool) => {
  const rows = (await pool.query(`
    WITH ends AS (
      SELECT from_intersection_id node, ST_StartPoint(geom) pt, linear_name nm FROM toronto_centreline
        WHERE LOWER(feature_code_desc) <> 'laneway' AND linear_name IS NOT NULL AND from_intersection_id IS NOT NULL
      UNION ALL
      SELECT to_intersection_id, ST_EndPoint(geom), linear_name FROM toronto_centreline
        WHERE LOWER(feature_code_desc) <> 'laneway' AND linear_name IS NOT NULL AND to_intersection_id IS NOT NULL
    ),
    real_nodes AS (   -- independent intersection definition: ≥3 street-ends AND ≥2 distinct street names
      SELECT node, (array_agg(pt))[1] AS geom
      FROM ends GROUP BY node HAVING count(*) >= 3 AND count(DISTINCT nm) >= 2
    ),
    sample AS (
      (SELECT id, geom, true AS flagged FROM parcels
         WHERE is_corner_lot AND geom IS NOT NULL AND ST_IsValid(geom) ORDER BY md5(id::text) LIMIT 30)
      UNION ALL
      (SELECT id, geom, false AS flagged FROM parcels
         WHERE NOT is_corner_lot AND NOT is_through_lot AND geom IS NOT NULL AND ST_IsValid(geom) ORDER BY md5(id::text) LIMIT 30)
    )
    SELECT s.id, s.flagged,
      round(nn.dist_node::numeric, 1) AS dist_node,
      (SELECT count(DISTINCT c.linear_name) FROM toronto_centreline c
         WHERE LOWER(c.feature_code_desc) <> 'laneway' AND c.linear_name IS NOT NULL
           AND ST_DWithin(s.geom::geography, c.geom::geography, ${ABUT})) AS streets_abutted,
      round(ST_Y(ST_PointOnSurface(s.geom))::numeric, 6) AS lat,
      round(ST_X(ST_PointOnSurface(s.geom))::numeric, 6) AS lon
    FROM sample s
    CROSS JOIN LATERAL (
      SELECT ST_Distance(s.geom::geography, rn.geom::geography) dist_node
      FROM real_nodes rn ORDER BY s.geom <-> rn.geom LIMIT 1
    ) nn
    ORDER BY s.flagged DESC, dist_node`)).rows;

  let tp = 0, fp = 0, tn = 0, fn = 0;
  const suspect = [];
  for (const r of rows) {
    const nearNode = r.dist_node <= NEAR_NODE;
    const looksCorner = nearNode && r.streets_abutted >= 2;  // independent ground-truth verdict
    let verdict;
    if (r.flagged && looksCorner) { verdict = 'TP'; tp++; }
    else if (r.flagged && !looksCorner) { verdict = 'FP?'; fp++; suspect.push(r); }
    else if (!r.flagged && r.dist_node >= FAR_NODE) { verdict = 'TN'; tn++; }
    else if (!r.flagged && looksCorner) { verdict = 'FN?'; fn++; suspect.push(r); }
    else { verdict = !r.flagged ? 'TN~' : 'TP~'; if (!r.flagged) tn++; else tp++; } // borderline node-dist, abut decides
    pipeline.log.info(`${r.flagged ? 'CORNER ' : 'mid-blk'} #${r.id}  node=${r.dist_node}m  abuts=${r.streets_abutted} st  -> ${verdict}   (${r.lat},${r.lon})`);
  }
  pipeline.log.info(`--- flagged(30): TP≈${tp - (rows.filter((r) => !r.flagged).length ? 0 : 0)} ; mid-block(30): TN/FN ---`);
  pipeline.log.info(`SUMMARY  flagged: TP=${tp} FP?=${fp}  |  mid-block: TN=${tn} FN?=${fn}`);
  pipeline.log.info(`precision(corner)≈${(100 * tp / (tp + fp)).toFixed(0)}%  ; mid-block correctness≈${(100 * tn / (tn + fn)).toFixed(0)}%`);
  if (suspect.length) {
    pipeline.log.info('DISAGREEMENTS (eyeball on a map):');
    for (const r of suspect) pipeline.log.info(`  #${r.id} flagged=${r.flagged} node=${r.dist_node}m abuts=${r.streets_abutted}  https://www.google.com/maps/@${r.lat},${r.lon},19z`);
  }

  pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null });
  pipeline.emitMeta({ parcels: ['is_corner_lot', 'is_through_lot', 'geom'], toronto_centreline: ['from_intersection_id', 'to_intersection_id', 'linear_name', 'feature_code_desc', 'geom'] }, {});
});
