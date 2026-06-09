#!/usr/bin/env node
/** #431-FU scoping — how do laneways appear in toronto_centreline, and how much do they inflate corner/through? Read-only. */
'use strict';
const pipeline = require('../lib/pipeline');
pipeline.run('wf3-laneway-scope', async (pool) => {
  // 1. feature_code_desc distribution + named/unnamed split
  const fc = await pool.query(`
    SELECT feature_code_desc, count(*)::int n,
           count(*) FILTER (WHERE linear_name IS NOT NULL)::int named,
           count(*) FILTER (WHERE linear_name IS NULL)::int unnamed
    FROM toronto_centreline GROUP BY feature_code_desc ORDER BY n DESC`);
  console.log('FCDIST', JSON.stringify(fc.rows));

  // 2. how do laneway names look? sample distinct linear_name where it's a laneway feature
  const lanePat = `feature_code_desc ILIKE '%lane%' OR feature_code_desc ILIKE '%way%'`;
  const laneNames = await pool.query(`
    SELECT DISTINCT linear_name FROM toronto_centreline
    WHERE (${lanePat}) AND linear_name IS NOT NULL ORDER BY linear_name LIMIT 15`);
  pipeline.log.info(`sample NAMED laneway linear_name values: ${JSON.stringify(laneNames.rows.map((r) => r.linear_name))}`);

  // 3. do any NON-laneway features have names starting "Ln " / "Lane"? (would a name-pattern guard misfire?)
  const nameLn = await pool.query(`
    SELECT feature_code_desc, count(*)::int n FROM toronto_centreline
    WHERE linear_name ILIKE 'Ln %' OR linear_name ILIKE 'Lane %' OR linear_name ILIKE '% Lane' OR linear_name ILIKE '% Ln'
    GROUP BY feature_code_desc ORDER BY n DESC`);
  pipeline.log.info(`features whose linear_name looks lane-like: ${JSON.stringify(nameLn.rows)}`);

  // 4. IMPACT: of currently-flagged parcels, how many would FLIP to false if laneway segments are dropped
  //    from the pair population? Re-derive corner/through with laneways excluded, compare to current flags.
  const impact = await pool.query(`
    WITH flagged AS (
      SELECT id, geom, is_corner_lot, is_through_lot FROM parcels
      WHERE (is_corner_lot OR is_through_lot) AND geom IS NOT NULL AND ST_IsValid(geom)
      ORDER BY id LIMIT 3000
    ),
    -- segments within 20m, split by laneway-ness
    seg AS (
      SELECT f.id, f.is_corner_lot cf, f.is_through_lot tf, c.linear_name nm,
             (c.feature_code_desc ILIKE '%lane%') AS is_lane,
             ST_Distance(f.geom::geography, c.geom::geography) d
      FROM flagged f JOIN toronto_centreline c ON ST_DWithin(f.geom::geography, c.geom::geography, 20)
      WHERE c.linear_name IS NOT NULL
    ),
    -- per parcel: count distinct NON-laneway named streets it abuts (<=13m)
    nonlane AS (
      SELECT id, cf, tf, count(DISTINCT nm) FILTER (WHERE NOT is_lane AND d <= 13) AS nonlane_abut,
             count(DISTINCT nm) FILTER (WHERE d <= 13) AS any_abut,
             bool_or(is_lane AND d <= 13) AS abuts_a_lane
      FROM seg GROUP BY id, cf, tf
    )
    SELECT
      count(*) FILTER (WHERE tf)::int through_flagged,
      count(*) FILTER (WHERE tf AND abuts_a_lane)::int through_touches_lane,
      count(*) FILTER (WHERE tf AND nonlane_abut < 2)::int through_loses_if_lane_excluded,
      count(*) FILTER (WHERE cf)::int corner_flagged,
      count(*) FILTER (WHERE cf AND abuts_a_lane)::int corner_touches_lane,
      count(*) FILTER (WHERE cf AND nonlane_abut < 2)::int corner_loses_if_lane_excluded
    FROM nonlane`);
  pipeline.log.info(`IMPACT (3000-flagged sample, "abut<=13m, named"): ${JSON.stringify(impact.rows[0])}`);

  pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null });
  pipeline.emitMeta({ parcels: ['is_corner_lot', 'is_through_lot'], toronto_centreline: ['feature_code_desc', 'linear_name', 'geom'] }, {});
});
