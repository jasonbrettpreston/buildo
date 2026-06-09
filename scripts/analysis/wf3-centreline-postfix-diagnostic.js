#!/usr/bin/env node
/**
 * WF3 #431 post-fix diagnostic — why are corner (17.8%) / through (14.2%) still high?
 * Read-only. Samples flagged parcels and re-derives the street config + node distance + bearings.
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §11
 */
'use strict';
const pipeline = require('../lib/pipeline');

const PROX = 20;

pipeline.run('wf3-centreline-postfix-diagnostic', async (pool) => {
  const tot = await pool.query(`SELECT count(*)::int n,
      count(*) FILTER (WHERE is_corner_lot)::int c,
      count(*) FILTER (WHERE is_through_lot)::int t,
      count(*) FILTER (WHERE primary_frontage_street_name IS NOT NULL)::int f
    FROM parcels WHERE geom IS NOT NULL AND ST_IsValid(geom)`);
  const r = tot.rows[0];
  pipeline.log.info(`totals: parcels=${r.n} corner=${r.c} (${(100*r.c/r.n).toFixed(1)}%) through=${r.t} (${(100*r.t/r.n).toFixed(1)}%) frontage=${r.f}`);

  // For a sample of THROUGH parcels, re-derive: how many distinct-named streets within 20m, and the
  // min angular gap (deg) between the two "most opposite" segments from the interior point.
  const through = await pool.query(`
    WITH samp AS (
      SELECT id, geom FROM parcels WHERE is_through_lot AND geom IS NOT NULL AND ST_IsValid(geom)
      ORDER BY id LIMIT 400
    ),
    pos AS (SELECT id, geom, ST_PointOnSurface(geom) p FROM samp),
    near AS (
      SELECT s.id, c.linear_name nm, c.geom cg, s.p,
             degrees(ST_Azimuth(s.p, ST_ClosestPoint(c.geom, s.p))) az,
             ST_Distance(s.geom::geography, c.geom::geography) d
      FROM pos s JOIN toronto_centreline c
        ON ST_DWithin(s.geom::geography, c.geom::geography, ${PROX})
      WHERE c.linear_name IS NOT NULL
    ),
    pairs AS (
      SELECT a.id,
             abs(((a.az - b.az + 540)::numeric % 360) - 180) gap   -- angular gap to 180 (0 = perfectly opposite)
      FROM near a JOIN near b ON a.id=b.id AND a.nm <> b.nm AND a.nm < b.nm
    )
    SELECT
      count(DISTINCT id)::int sampled,
      count(*) FILTER (WHERE gap <= 45)::int pairs_opposite,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (SELECT min(gap) FROM pairs p2 WHERE p2.id=pairs.id))::numeric,1) AS median_min_gap
    FROM pairs`);
  pipeline.log.info(`through sample: ${JSON.stringify(through.rows[0])}`);

  // distinct named-street count distribution for through parcels
  const cnt = await pool.query(`
    WITH samp AS (SELECT id, geom FROM parcels WHERE is_through_lot AND geom IS NOT NULL AND ST_IsValid(geom) ORDER BY id LIMIT 400),
    nc AS (SELECT s.id, count(DISTINCT c.linear_name) k
           FROM samp s JOIN toronto_centreline c ON ST_DWithin(s.geom::geography, c.geom::geography, ${PROX})
           WHERE c.linear_name IS NOT NULL GROUP BY s.id)
    SELECT k, count(*)::int n FROM nc GROUP BY k ORDER BY k`);
  pipeline.log.info(`through distinct-named-street counts: ${JSON.stringify(cnt.rows)}`);

  // CORNER: distance from parcel to the shared node, distribution
  const corner = await pool.query(`
    WITH samp AS (SELECT id, geom FROM parcels WHERE is_corner_lot AND geom IS NOT NULL AND ST_IsValid(geom) ORDER BY id LIMIT 800),
    seg AS (SELECT s.id, s.geom pg, c.id cid, c.geom cg, c.linear_name nm, c.from_intersection_id fn, c.to_intersection_id tn
            FROM samp s JOIN toronto_centreline c ON ST_DWithin(s.geom::geography, c.geom::geography, ${PROX}) WHERE c.linear_name IS NOT NULL),
    pairs AS (
      SELECT a.id, a.pg,
        (CASE WHEN ST_Distance(ST_StartPoint(a.cg), b.cg) <= ST_Distance(ST_EndPoint(a.cg), b.cg) THEN ST_StartPoint(a.cg) ELSE ST_EndPoint(a.cg) END) node
      FROM seg a JOIN seg b ON a.id=b.id AND a.nm<>b.nm AND a.cid<b.cid
        AND (a.fn=b.fn OR a.fn=b.tn OR a.tn=b.fn OR a.tn=b.tn)
    ),
    mind AS (SELECT id, min(ST_Distance(pg::geography, node::geography)) dnode FROM pairs GROUP BY id)
    SELECT count(*)::int sampled,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dnode)::numeric,1) p50,
      round(percentile_cont(0.75) WITHIN GROUP (ORDER BY dnode)::numeric,1) p75,
      count(*) FILTER (WHERE dnode <= 12)::int le12,
      count(*) FILTER (WHERE dnode <= 15)::int le15,
      count(*) FILTER (WHERE dnode > 18)::int gt18
    FROM mind`);
  pipeline.log.info(`corner node-distance (post-fix flagged): ${JSON.stringify(corner.rows[0])}`);

  // THROUGH abut: for flagged parcels, distance to the FARTHER of the two opposite-parallel streets.
  // If an "abut both" cap cleanly separates true through lots, most should be small.
  const thruAbut = await pool.query(`
    WITH samp AS (SELECT id, geom FROM parcels WHERE is_through_lot AND geom IS NOT NULL AND ST_IsValid(geom) ORDER BY id LIMIT 1500),
    pos AS (SELECT id, geom, ST_PointOnSurface(geom) p FROM samp),
    near AS (
      SELECT s.id, s.geom pg, c.linear_name nm,
             degrees(ST_Azimuth(s.p, ST_ClosestPoint(c.geom, s.p))) az,
             ST_Distance(s.geom::geography, c.geom::geography) d
      FROM pos s JOIN toronto_centreline c ON ST_DWithin(s.geom::geography, c.geom::geography, ${PROX})
      WHERE c.linear_name IS NOT NULL),
    opp AS (
      SELECT a.id, GREATEST(a.d, b.d) farther
      FROM near a JOIN near b ON a.id=b.id AND a.nm<>b.nm AND a.nm<b.nm
        AND abs(((a.az-b.az+540)::numeric % 360)-180) <= 45),
    perparcel AS (SELECT id, min(farther) abut FROM opp GROUP BY id)
    SELECT count(*)::int n,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY abut)::numeric,1) p50,
      round(percentile_cont(0.75) WITHIN GROUP (ORDER BY abut)::numeric,1) p75,
      count(*) FILTER (WHERE abut<=10)::int le10,
      count(*) FILTER (WHERE abut<=13)::int le13,
      count(*) FILTER (WHERE abut<=15)::int le15
    FROM perparcel`);
  pipeline.log.info(`through abut (farther-of-opposite-pair dist): ${JSON.stringify(thruAbut.rows[0])}`);

  // CORNER abut: distance to the FARTHER of the two node-sharing streets (the cross street for adjacents).
  const cornAbut = await pool.query(`
    WITH samp AS (SELECT id, geom FROM parcels WHERE is_corner_lot AND geom IS NOT NULL AND ST_IsValid(geom) ORDER BY id LIMIT 1500),
    seg AS (SELECT s.id, s.geom pg, c.id cid, c.linear_name nm, c.from_intersection_id fn, c.to_intersection_id tn,
                   ST_Distance(s.geom::geography, c.geom::geography) d
            FROM samp s JOIN toronto_centreline c ON ST_DWithin(s.geom::geography, c.geom::geography, ${PROX}) WHERE c.linear_name IS NOT NULL),
    pairs AS (SELECT a.id, GREATEST(a.d,b.d) farther
              FROM seg a JOIN seg b ON a.id=b.id AND a.nm<>b.nm AND a.cid<b.cid
                AND (a.fn=b.fn OR a.fn=b.tn OR a.tn=b.fn OR a.tn=b.tn)),
    perparcel AS (SELECT id, min(farther) abut FROM pairs GROUP BY id)
    SELECT count(*)::int n,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY abut)::numeric,1) p50,
      round(percentile_cont(0.75) WITHIN GROUP (ORDER BY abut)::numeric,1) p75,
      count(*) FILTER (WHERE abut<=10)::int le10,
      count(*) FILTER (WHERE abut<=13)::int le13,
      count(*) FILTER (WHERE abut<=15)::int le15
    FROM perparcel`);
  pipeline.log.info(`corner abut (farther-of-pair dist): ${JSON.stringify(cornAbut.rows[0])}`);

  pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null });
  pipeline.emitMeta({ parcels: ['is_corner_lot', 'is_through_lot'], toronto_centreline: ['geom', 'linear_name'] }, {});
});
