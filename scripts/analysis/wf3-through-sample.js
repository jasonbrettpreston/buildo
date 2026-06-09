#!/usr/bin/env node
/** WF3 #431 — sample through-flagged parcels: are they genuine double-frontage lots? Read-only. */
'use strict';
const pipeline = require('../lib/pipeline');
pipeline.run('wf3-through-sample', async (pool) => {
  // For 25 through-flagged parcels, show the best opposite-parallel named pair: names, both abut distances, bearing gap.
  const q = await pool.query(`
    WITH samp AS (SELECT id, geom FROM parcels WHERE is_through_lot AND geom IS NOT NULL AND ST_IsValid(geom) ORDER BY id LIMIT 25),
    pos AS (SELECT id, geom, ST_PointOnSurface(geom) p FROM samp),
    near AS (
      SELECT s.id, c.linear_name nm, c.geom cg, s.p,
             degrees(ST_Azimuth(s.p, ST_ClosestPoint(c.geom, s.p))) az,
             round(ST_Distance(s.geom::geography, c.geom::geography)::numeric,1) d
      FROM pos s JOIN toronto_centreline c ON ST_DWithin(s.geom::geography, c.geom::geography, 20)
      WHERE c.linear_name IS NOT NULL),
    pairs AS (
      SELECT a.id, a.nm n1, b.nm n2, a.d d1, b.d d2,
             round(abs(((a.az-b.az+540)::numeric % 360)-180),0) gap_to_180
      FROM near a JOIN near b ON a.id=b.id AND a.nm<>b.nm AND a.nm<b.nm
      WHERE GREATEST(a.d,b.d) <= 13 AND abs(((a.az-b.az+540)::numeric % 360)-180) <= 45)
    SELECT id, n1, n2, d1, d2, gap_to_180 FROM (
      SELECT *, row_number() OVER (PARTITION BY id ORDER BY gap_to_180) rn FROM pairs
    ) z WHERE rn=1 ORDER BY id`);
  for (const r of q.rows) pipeline.log.info(`#${r.id}: "${r.n1}"(${r.d1}m) ⟷ "${r.n2}"(${r.d2}m)  oppGap=${r.gap_to_180}°`);
  pipeline.log.info(`sampled pairs: ${q.rows.length}`);
  pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null });
  pipeline.emitMeta({ parcels: ['is_through_lot'], toronto_centreline: ['geom', 'linear_name'] }, {});
});
