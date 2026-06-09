#!/usr/bin/env node
/** #431-FU — decisive test for the 4 ground-truth "suspect" corner parcels: distance from the parcel to the
 *  point where its TWO abutting streets actually meet (ST_ClosestPoint between the two geometries). A real
 *  corner sits ~≤20 m from that junction; a false "corner" (two streets that pass near but cross far away) is far.
 *  Read-only. */
'use strict';
const pipeline = require('../lib/pipeline');
const IDS = [346894, 33363, 263585, 189330];

pipeline.run('wf3-corner-suspects', async (pool) => {
  for (const id of IDS) {
    const r = (await pool.query(`
      WITH p AS (SELECT geom FROM parcels WHERE id = $1),
      near AS (
        SELECT DISTINCT ON (c.linear_name) c.linear_name nm, c.geom cg,
               ST_Distance((SELECT geom FROM p)::geography, c.geom::geography) d
        FROM toronto_centreline c
        WHERE LOWER(c.feature_code_desc) <> 'laneway' AND c.linear_name IS NOT NULL
          AND ST_DWithin((SELECT geom FROM p)::geography, c.geom::geography, 13)
        ORDER BY c.linear_name, d
      ),
      two AS (SELECT nm, cg, d FROM near ORDER BY d LIMIT 2),
      agg AS (SELECT array_agg(cg ORDER BY d) g, string_agg(nm || ' (' || round(d::numeric,1) || 'm)', '  +  ' ORDER BY d) names FROM two)
      SELECT names,
        round(ST_Distance((SELECT geom FROM p)::geography, ST_ClosestPoint(g[1], g[2])::geography)::numeric, 1) AS dist_to_junction,
        ST_Intersects(g[1], g[2]) AS streets_cross
      FROM agg`, [id])).rows[0];
    const real = r.dist_to_junction !== null && r.dist_to_junction <= 22;
    pipeline.log.info(`#${id}: ${r.names}   junction=${r.dist_to_junction}m  cross=${r.streets_cross}  → ${real ? 'REAL corner' : 'FALSE (streets meet far away)'}`);
  }
  pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null });
  pipeline.emitMeta({ parcels: ['geom'], toronto_centreline: ['geom', 'linear_name', 'feature_code_desc'] }, {});
});
