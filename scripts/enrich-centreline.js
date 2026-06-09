#!/usr/bin/env node
/**
 * Enrich parcels with Toronto Centreline geometry (Spec 62 §8d) — spatial-joins
 * parcels.geom against toronto_centreline and writes is_corner_lot / is_through_lot /
 * primary_frontage_street_name + dataset lineage via one set-based UPDATE (§11).
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md (v1.1 §8d, §11)
 *
 * Sibling of load-centreline.js (advisory lock 64; load = 63). Consumes the §8c producer's
 * frozen records_meta.centreline_load contract. The §11 8-CTE block is the spec's authoritative
 * SQL, used with 3 precedent fences: parcel_segments AS MATERIALIZED (read by 5 CTEs); a
 * geom-validity filter; and a 4th lineage write/guard (§9 step-5 + the mig 168/171 precedent).
 *
 * Usage: node scripts/enrich-centreline.js
 */
'use strict';

const pipeline = require('./lib/pipeline');

const ADVISORY_LOCK_ID = 64; // L4b re-derived: spec's 66 collides with enrich-permits; 64 free (sibling of load=63).
const SPEC_VERSION = '1.1'; // L10
// The §8c producer, read via the cross-run contract. run-chain records it as
// 'sources:load_centreline' (NOT the spec §9 literal 'source-centreline' — the #409 trap).
const PRODUCER_NAME = 'sources:load_centreline';
const TAG = '[enrich-centreline]';

// Thresholds (future-tunable via logic_variables; hardcoded per the enrich-ravines precedent).
const UNLINKED_WARN_PCT = 10; // L21
const UNLINKED_FAIL_PCT = 40; // L21
const NAME_COVERAGE_WARN_PCT = 90; // L29 — P1 reliance
const INTERSECTION_NULL_WARN_PCT = 50; // F5c — corner-detection signal
const ADDRESS_NULL_WARN_PCT = 10; // G4/F7 — P2 degradation signal
// §11 WF2 proximity radius: street centerlines sit ~10 m off the lot polygons (containment
// ST_Intersects matched only 0.05% of parcels live). Distance probe (1000 parcels): p50 9.9 m,
// p90 12.9 m, 97.1% within 20 m. Hardcoded — change here to tune (NOT via logic_variables).
const CENTRELINE_PROXIMITY_M = 20;
// §11 WF3 (#431) corner/through PRECISION. The 20 m frontage radius over-flags the two booleans
// (live: corner 24%, through 16.7% vs typical ~13%/<5%) because it reaches streets the parcel does
// not actually abut. The discriminator is "abuts BOTH streets": a true corner/through lot touches
// both streets (≤ CENTRELINE_ABUT_M); an adjacent lot abuts one and merely sees the other ~18-20 m
// away. Live-validated: abut ≤13 m lands corner ~13% / through ~8% (node-proximity alone only reached
//   17.8% — an adjacent lot still shares the intersection node). Corner additionally requires the two
//   streets to SHARE A NODE (they intersect); through requires them PARALLEL on OPPOSITE sides.
// Hardcoded/dev-tuned (enrich-ravines precedent). Tune here.
const CENTRELINE_ABUT_M = 13;
const THROUGH_OPPOSITE_TOL_DEG = 45;

// ---------------------------------------------------------------------------
// §11 — the authoritative 8-CTE chain, materialized into a temp table so the
// expensive ST_Intersects join + per-pair azimuth math runs ONCE (then we UPDATE
// + derive all tallies from the temp). $1 = producer source_dataset_version.
// Deviations from the spec block (plan F1/F2/F3 + the WF2 proximity correction):
//   - parcel_segments AS MATERIALIZED + WHERE p.geom IS NOT NULL AND ST_IsValid(p.geom)
//   - parcel_frontage surfaces frontage_priority (1/2/3) for the centreline_enrich tallies
//   - WF2: join is ST_DWithin(::geography, CENTRELINE_PROXIMITY_M), NOT ST_Intersects — street
//     centerlines sit ~10 m off the lot polygons (containment matched 0.05% live). Needs the
//     geography GIST (mig 175). Frontage P3 = nearest segment (ST_Distance ASC), not longest
//     intersection (which is 0 under proximity). Corner/through pairs require both names NOT NULL
//     (unnamed laneways within range are not "a different street").
// ---------------------------------------------------------------------------
const BUILD_TEMP_SQL = `
DROP TABLE IF EXISTS tmp_centreline_enrich;
CREATE TEMP TABLE tmp_centreline_enrich ON COMMIT DROP AS
WITH
parcel_segments AS MATERIALIZED (
  SELECT
    p.id                       AS parcel_id,
    p.geom                     AS parcel_geom,
    ST_Centroid(p.geom)        AS parcel_centroid,
    p.address_number           AS parcel_addr_text,
    p.street_name_normalized   AS parcel_street_norm,
    c.id                       AS centreline_id,
    c.geom                     AS seg_geom,
    c.linear_name              AS seg_name_base,
    c.linear_name_full         AS seg_name_full,
    c.from_intersection_id     AS from_node,
    c.to_intersection_id       AS to_node,
    c.lo_num_l, c.hi_num_l, c.parity_l,
    c.lo_num_r, c.hi_num_r, c.parity_r,
    (LOWER(c.feature_code_desc) = 'laneway') AS seg_is_lane   -- WF3 #431-FU: a laneway is not a "street" for corner/through
  FROM parcels p
  JOIN toronto_centreline c
    ON ST_DWithin(p.geom::geography, c.geom::geography, ${CENTRELINE_PROXIMITY_M})  -- WF2: proximity, not containment (idx_toronto_centreline_geog_gist, mig 175)
  WHERE p.geom IS NOT NULL AND ST_IsValid(p.geom)        -- F2 geom-validity (precedent)
),
parcel_ids_intersecting AS (
  SELECT DISTINCT parcel_id FROM parcel_segments
),
parcel_counts AS (
  SELECT parcel_id, COUNT(DISTINCT centreline_id) AS intersected_segment_count
  FROM parcel_segments GROUP BY parcel_id
),
parcel_segments_capped AS (
  SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY parcel_id ORDER BY centreline_id) AS rn
    FROM parcel_segments
  ) s WHERE rn <= 20                                      -- L30 Cartesian-explosion cap
),
parcel_pairs AS (
  SELECT
    ps1.parcel_id,
    ps1.centreline_id AS c1_id,    ps2.centreline_id AS c2_id,
    ps1.seg_geom      AS c1_geom,  ps2.seg_geom      AS c2_geom,
    ps1.seg_name_base AS c1_name,  ps2.seg_name_base AS c2_name,
    ps1.from_node     AS c1_from,  ps1.to_node       AS c1_to,
    ps2.from_node     AS c2_from,  ps2.to_node       AS c2_to,
    ps1.parcel_centroid AS centroid,
    ps1.parcel_geom     AS parcel_geom,
    ST_PointOnSurface(ps1.parcel_geom) AS pos,    -- WF3 DEC-B: guaranteed-interior point (concave/L/U lots) for through azimuths
    ST_Distance(ps1.parcel_geom::geography, ps1.seg_geom::geography) AS c1_dist,  -- WF3: "abuts both" cap (#431)
    ST_Distance(ps1.parcel_geom::geography, ps2.seg_geom::geography) AS c2_dist,
    ps1.seg_is_lane AS c1_is_lane, ps2.seg_is_lane AS c2_is_lane   -- WF3 #431-FU: exclude laneways from corner/through
  FROM parcel_segments_capped ps1
  INNER JOIN parcel_segments_capped ps2 ON ps1.parcel_id = ps2.parcel_id
  WHERE ps1.centreline_id < ps2.centreline_id
),
parcel_corner_pairs AS (
  SELECT parcel_id,
         bool_or(
           c1_name IS DISTINCT FROM c2_name
           AND c1_name IS NOT NULL AND c2_name IS NOT NULL   -- WF2 DEC-C: unnamed laneways are not "a different street"
           AND (c1_from IS NOT DISTINCT FROM c2_from OR c1_from IS NOT DISTINCT FROM c2_to
                OR c1_to IS NOT DISTINCT FROM c2_from OR c1_to IS NOT DISTINCT FROM c2_to)
           AND (c1_from IS NOT NULL OR c1_to IS NOT NULL OR c2_from IS NOT NULL OR c2_to IS NOT NULL)
           AND c1_dist <= ${CENTRELINE_ABUT_M} AND c2_dist <= ${CENTRELINE_ABUT_M}
                 -- WF3 (#431): the parcel must ABUT BOTH intersecting streets. Share-node alone over-flags
                 -- adjacent lots (they share the intersection node but the cross street is ~18-20 m away).
                 -- Abut-both is digitization-immune (a planar/geography distance, no endpoint assumption).
           AND NOT c1_is_lane AND NOT c2_is_lane
                 -- WF3 #431-FU: a laneway is not a "street" — a lot fronting a street with a rear/side lane
                 -- is a normal lot, not a corner. Extends the WF2 unnamed-name guard to NAMED laneways.
         ) AS has_corner_pair
  FROM parcel_pairs GROUP BY parcel_id
),
parcel_parallel_pairs AS (
  SELECT parcel_id,
         bool_or(
           c1_name IS DISTINCT FROM c2_name
           AND c1_name IS NOT NULL AND c2_name IS NOT NULL   -- WF2 DEC-C: exclude unnamed laneways from through-lot
           AND abs(cos(LEAST(
             abs(
               COALESCE(
                 ST_Azimuth(ST_ClosestPoint(c1_geom, centroid),
                   ST_LineInterpolatePoint(c1_geom, LEAST(
                     ST_LineLocatePoint(c1_geom, ST_ClosestPoint(c1_geom, centroid))
                     + 10.0 / GREATEST(ST_Length(c1_geom::geography), 1.0), 1.0))),
                 ST_Azimuth(ST_StartPoint(c1_geom), ST_EndPoint(c1_geom)))
               -
               COALESCE(
                 ST_Azimuth(ST_ClosestPoint(c2_geom, centroid),
                   ST_LineInterpolatePoint(c2_geom, LEAST(
                     ST_LineLocatePoint(c2_geom, ST_ClosestPoint(c2_geom, centroid))
                     + 10.0 / GREATEST(ST_Length(c2_geom::geography), 1.0), 1.0))),
                 ST_Azimuth(ST_StartPoint(c2_geom), ST_EndPoint(c2_geom)))
             ),
             2 * pi() - abs(
               COALESCE(
                 ST_Azimuth(ST_ClosestPoint(c1_geom, centroid),
                   ST_LineInterpolatePoint(c1_geom, LEAST(
                     ST_LineLocatePoint(c1_geom, ST_ClosestPoint(c1_geom, centroid))
                     + 10.0 / GREATEST(ST_Length(c1_geom::geography), 1.0), 1.0))),
                 ST_Azimuth(ST_StartPoint(c1_geom), ST_EndPoint(c1_geom)))
               -
               COALESCE(
                 ST_Azimuth(ST_ClosestPoint(c2_geom, centroid),
                   ST_LineInterpolatePoint(c2_geom, LEAST(
                     ST_LineLocatePoint(c2_geom, ST_ClosestPoint(c2_geom, centroid))
                     + 10.0 / GREATEST(ST_Length(c2_geom::geography), 1.0), 1.0))),
                 ST_Azimuth(ST_StartPoint(c2_geom), ST_EndPoint(c2_geom)))
             )
           ))) > cos(radians(15))
           AND LEAST(
                 abs(
                   (CASE WHEN ST_Distance(pos, ST_ClosestPoint(c1_geom, pos)) > 0
                         THEN ST_Azimuth(pos, ST_ClosestPoint(c1_geom, pos)) END)
                   -
                   (CASE WHEN ST_Distance(pos, ST_ClosestPoint(c2_geom, pos)) > 0
                         THEN ST_Azimuth(pos, ST_ClosestPoint(c2_geom, pos)) END)
                 ),
                 2 * pi() - abs(
                   (CASE WHEN ST_Distance(pos, ST_ClosestPoint(c1_geom, pos)) > 0
                         THEN ST_Azimuth(pos, ST_ClosestPoint(c1_geom, pos)) END)
                   -
                   (CASE WHEN ST_Distance(pos, ST_ClosestPoint(c2_geom, pos)) > 0
                         THEN ST_Azimuth(pos, ST_ClosestPoint(c2_geom, pos)) END)
                 )
               ) > pi() - radians(${THROUGH_OPPOSITE_TOL_DEG})
                 -- WF3 DEC-B (#431): the two parallel streets must be on OPPOSITE sides of the parcel —
                 -- bearings from the interior point (pos) to each segment differ by ~180° (angular gap > 135°).
                 -- Degenerate guard: if pos lies ON a segment (ST_Distance = 0) ST_Azimuth throws → the CASE
                 -- (no ELSE) yields NULL → the LEAST(...) comparison is NULL → bool_or ignores it (not-through).
           AND c1_dist <= ${CENTRELINE_ABUT_M} AND c2_dist <= ${CENTRELINE_ABUT_M}
                 -- WF3 (#431): the parcel must ABUT BOTH parallel streets (front + back), not merely sit
                 -- within 20 m of two streets it doesn't front. Same "abuts both" cap as corner.
           AND NOT c1_is_lane AND NOT c2_is_lane
                 -- WF3 #431-FU: a street + rear LANEWAY is a normal lot, not a through lot. (Most downtown
                 -- lots back onto a named lane; counting it as a 2nd frontage was the main through inflation.)
         ) AS has_parallel_different_street_pair
  FROM parcel_pairs GROUP BY parcel_id
),
parcel_frontage AS (
  SELECT DISTINCT ON (parcel_id)
    parcel_id,
    seg_name_full AS primary_frontage_street_name,
    CASE WHEN name_match_p1 THEN 1 WHEN addr_match_p2 THEN 2 ELSE 3 END AS frontage_priority
  FROM (
    SELECT
      ps.parcel_id, ps.centreline_id, ps.seg_name_full,
      -- WF2 DEC-B (R2): proximity ⇒ no overlap ⇒ ST_Length(ST_Intersection)=0; P3 = NEAREST segment.
      ST_Distance(ps.parcel_geom::geography, ps.seg_geom::geography) AS dist_m,
      (ps.parcel_street_norm IS NOT NULL AND ps.seg_name_base IS NOT NULL
        AND LOWER(ps.parcel_street_norm) = LOWER(ps.seg_name_base)) AS name_match_p1,
      (address_match_status(ps.parcel_addr_text, ps.parity_l, ps.lo_num_l, ps.hi_num_l)
        OR address_match_status(ps.parcel_addr_text, ps.parity_r, ps.lo_num_r, ps.hi_num_r)) AS addr_match_p2
    FROM parcel_segments ps
  ) sided
  ORDER BY parcel_id,
           CASE WHEN name_match_p1 THEN 0 ELSE 1 END,
           CASE WHEN addr_match_p2 THEN 0 ELSE 1 END,
           dist_m ASC,                                   -- P3: nearest segment (was longest intersection)
           centreline_id ASC
)
SELECT
  pii.parcel_id,
  COALESCE(pc.intersected_segment_count, 0)            AS seg_count,
  COALESCE(pcp.has_corner_pair, false)                 AS new_is_corner_lot,
  (COALESCE(pc.intersected_segment_count, 0) >= 2
    AND COALESCE(ppp.has_parallel_different_street_pair, false)) AS new_is_through_lot,
  pf.primary_frontage_street_name                       AS new_primary_frontage_street_name,
  pf.frontage_priority                                  AS frontage_priority
FROM parcel_ids_intersecting pii
LEFT JOIN parcel_counts        pc  USING (parcel_id)
LEFT JOIN parcel_corner_pairs  pcp USING (parcel_id)
LEFT JOIN parcel_parallel_pairs ppp USING (parcel_id)
LEFT JOIN parcel_frontage      pf  USING (parcel_id);
`;

// UPDATE parcels from the materialized temp; 4-disjunct IS DISTINCT FROM write-guard
// (3 derived + the lineage stamp). $1 = source_dataset_version.
const UPDATE_SQL = `
UPDATE parcels p
   SET is_corner_lot                = e.new_is_corner_lot,
       is_through_lot               = e.new_is_through_lot,
       primary_frontage_street_name = e.new_primary_frontage_street_name,
       centreline_dataset_version_when_enriched = $1
  FROM tmp_centreline_enrich e
 WHERE p.id = e.parcel_id
   AND (p.is_corner_lot                IS DISTINCT FROM e.new_is_corner_lot
        OR p.is_through_lot            IS DISTINCT FROM e.new_is_through_lot
        OR p.primary_frontage_street_name IS DISTINCT FROM e.new_primary_frontage_street_name
        OR p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1);
`;

// ---------------------------------------------------------------------------
// Consumer read protocol (§9 / DEC-E) — 4-tier + extract source_dataset_version.
// ---------------------------------------------------------------------------
async function readCentrelineContract(pool) {
  const res = await pool.query(
    `SELECT records_meta FROM pipeline_runs WHERE pipeline = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
    [PRODUCER_NAME],
  );
  if (res.rows.length === 0) {
    throw new Error(`${TAG} no successful ${PRODUCER_NAME} run — cannot enrich without a versioned source`);
  }
  const cl = (res.rows[0].records_meta || {}).centreline_load || {};
  if (cl.spec_version !== SPEC_VERSION) {
    throw new Error(`${TAG} ${PRODUCER_NAME}.spec_version=${cl.spec_version} !== ${SPEC_VERSION} — aborting`);
  }
  if (!(Number(cl.features_inserted) > 0)) {
    throw new Error(`${TAG} producer features_inserted=${cl.features_inserted} — nothing to enrich against`);
  }
  const sourceDatasetVersion = cl.source_dataset_version;
  if (!sourceDatasetVersion) {
    throw new Error(`${TAG} producer source_dataset_version is null/empty — cannot stamp lineage`);
  }
  return { sourceDatasetVersion };
}

// ---------------------------------------------------------------------------
// Preconditions (DEC-E G2) — non-viable join/UPDATE without these.
// ---------------------------------------------------------------------------
async function assertPreconditions(client) {
  if ((await client.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'")).rows.length === 0) {
    throw new Error(`${TAG} PostGIS not installed — cannot run the centreline spatial join`);
  }
  const idx = async (name) => (await client.query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [name])).rows.length > 0;
  if (!(await idx('idx_toronto_centreline_geom_gist'))) {
    throw new Error(`${TAG} no idx_toronto_centreline_geom_gist (migration 173) — refusing a sequential-scan join`);
  }
  if (!(await idx('idx_toronto_centreline_geog_gist'))) {
    throw new Error(`${TAG} no idx_toronto_centreline_geog_gist (migration 175) — the §11 ST_DWithin proximity join would seq-scan 47K×486K`);
  }
  if (!(await idx('idx_parcels_geom_gist'))) {
    throw new Error(`${TAG} no idx_parcels_geom_gist (migration 039) — refusing a sequential-scan join`);
  }
  const TARGET_COLS = ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'centreline_dataset_version_when_enriched'];
  const cols = (await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = ANY($1)`,
    [TARGET_COLS],
  )).rows.map((r) => r.column_name);
  const missingCols = TARGET_COLS.filter((c) => !cols.includes(c));
  if (missingCols.length) {
    throw new Error(`${TAG} parcels missing ${missingCols.join(', ')} — migration 174 not applied`);
  }
  const fns = (await client.query(
    `SELECT proname FROM pg_proc WHERE proname = ANY($1)`,
    [['normalize_address_number', 'address_match_status']],
  )).rows.map((r) => r.proname);
  for (const f of ['normalize_address_number', 'address_match_status']) {
    if (!fns.includes(f)) throw new Error(`${TAG} function ${f}() absent — migration 173 not applied`);
  }
  if ((await client.query('SELECT 1 FROM toronto_centreline LIMIT 1')).rows.length === 0) {
    throw new Error(`${TAG} toronto_centreline is empty — aborting to avoid enriching every parcel to all-false`);
  }
}

/** Engine — builds the temp table + UPDATEs, on the caller's transaction client. */
async function enrichCentreline(client, { sourceDatasetVersion }) {
  await client.query(BUILD_TEMP_SQL);
  const upd = await client.query(UPDATE_SQL, [sourceDatasetVersion]);
  // Per-priority + boolean tallies from the materialized temp (one pass, no re-join).
  const t = (await client.query(`
    SELECT
      COUNT(*)::int                                                   AS intersecting,
      COUNT(*) FILTER (WHERE new_is_corner_lot)::int                  AS corner_true,
      COUNT(*) FILTER (WHERE new_is_through_lot)::int                 AS through_true,
      COUNT(*) FILTER (WHERE new_primary_frontage_street_name IS NOT NULL)::int AS frontage_resolved,
      COUNT(*) FILTER (WHERE frontage_priority = 1)::int             AS p1,
      COUNT(*) FILTER (WHERE frontage_priority = 2)::int             AS p2,
      COUNT(*) FILTER (WHERE frontage_priority = 3)::int             AS p3,
      COUNT(*) FILTER (WHERE seg_count > 20)::int                     AS truncated
    FROM tmp_centreline_enrich`)).rows[0];
  return { updated: upd.rowCount, tally: t };
}

/** Row-derived verdict cascade (Spec 47 §8.2). */
function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Grade the 5 diagnostic audit rows (pure — exported for the logic test). L21 is the gate. */
function gradeDiagnosticRows({ zeroPct, invalidGeom, namePct, nodeNullPct, addrNullPct }) {
  return [
    { metric: 'parcels_with_zero_centreline_intersections_pct', value: zeroPct,
      status: zeroPct >= UNLINKED_FAIL_PCT ? 'FAIL' : zeroPct >= UNLINKED_WARN_PCT ? 'WARN' : 'PASS' }, // L21
    { metric: 'parcels_invalid_geom_count', value: invalidGeom, status: 'INFO' }, // F2
    { metric: 'parcels_street_name_normalized_pct', value: namePct, status: namePct < NAME_COVERAGE_WARN_PCT ? 'WARN' : 'INFO' }, // F5b / L29
    { metric: 'centreline_intersection_id_null_pct', value: nodeNullPct, status: nodeNullPct > INTERSECTION_NULL_WARN_PCT ? 'WARN' : 'INFO' }, // F5c
    { metric: 'parcels_address_number_null_pct', value: addrNullPct, status: addrNullPct > ADDRESS_NULL_WARN_PCT ? 'WARN' : 'INFO' }, // G4 / F7
  ];
}

async function main(pool) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now(); // elapsed-time only (allowed)
    const RUN_AT = await pipeline.getDbTimestamp(pool); // §R3.5 — DB clock for completed_at
    const { sourceDatasetVersion } = await readCentrelineContract(pool);

    let result;
    await pipeline.withTransaction(pool, async (client) => {
      await assertPreconditions(client);
      result = await enrichCentreline(client, { sourceDatasetVersion });
    });
    const tally = result.tally;

    // Diagnostics over the parcel population (cheap COUNTs; F5b/F5c/G4 + L21 zero-intersection).
    const d = (await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE geom IS NOT NULL)                                          AS geom_total,
        COUNT(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom))                 AS invalid_geom,
        COUNT(*) FILTER (WHERE geom IS NOT NULL AND street_name_normalized IS NOT NULL)   AS name_pop,
        COUNT(*) FILTER (WHERE geom IS NOT NULL AND address_number IS NOT NULL)           AS addr_pop
      FROM parcels`)).rows[0];
    const c = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE from_intersection_id IS NULL AND to_intersection_id IS NULL) AS node_null,
             COUNT(*) AS total
      FROM toronto_centreline`)).rows[0];

    const geomTotal = Number(d.geom_total);
    const intersecting = tally.intersecting;
    const zeroCount = Math.max(geomTotal - intersecting, 0);
    const zeroPct = geomTotal ? round1((1000 * zeroCount) / geomTotal) / 10 : 0;
    const namePct = geomTotal ? round1((1000 * Number(d.name_pop)) / geomTotal) / 10 : 0;
    const addrNullPct = geomTotal ? round1((1000 * (geomTotal - Number(d.addr_pop))) / geomTotal) / 10 : 0;
    const nodeNullPct = Number(c.total) ? round1((1000 * Number(c.node_null)) / Number(c.total)) / 10 : 0;

    const auditRows = gradeDiagnosticRows({
      zeroPct, invalidGeom: Number(d.invalid_geom), namePct, nodeNullPct, addrNullPct,
    });
    const push = (metric, value, status) => auditRows.push({ metric, value, status });
    push('parcels_is_corner_lot_count', tally.corner_true, 'INFO');
    push('parcels_is_through_lot_count', tally.through_true, 'INFO');
    push('parcels_primary_frontage_resolved_count', tally.frontage_resolved, 'INFO');
    push('parcels_frontage_priority1_match_count', tally.p1, 'INFO');
    push('parcels_frontage_priority2_match_count', tally.p2, 'INFO');
    push('parcels_frontage_priority3_match_count', tally.p3, 'INFO');
    push('parcels_truncated_pair_count', tally.truncated, 'INFO');
    push('parcels_enriched_count', result.updated, 'INFO');
    push('centreline_source_dataset_version', sourceDatasetVersion, 'INFO');
    push('enrich_centreline_duration_ms', Date.now() - t0, 'INFO');

    pipeline.emitSummary({
      records_total: null, // Enrich archetype — does not create rows
      records_new: null,
      records_updated: result.updated,
      records_meta: {
        audit_table: {
          phase: ADVISORY_LOCK_ID,
          name: 'Parcel centreline enrichment',
          verdict: verdictCascade(auditRows),
          rows: auditRows,
        },
        centreline_enrich: {
          spec_version: SPEC_VERSION,
          parcels_updated: result.updated,
          parcels_with_zero_centreline_intersections_count: zeroCount,
          parcels_with_zero_centreline_intersections_pct: zeroPct,
          parcels_is_corner_lot_true_count: tally.corner_true,
          parcels_is_through_lot_true_count: tally.through_true,
          parcels_primary_frontage_resolved_count: tally.frontage_resolved,
          parcels_frontage_priority1_name_match_count: tally.p1,
          parcels_frontage_priority2_addrrange_match_count: tally.p2,
          parcels_frontage_priority3_nearest_segment_count: tally.p3,
          parcels_truncated_pair_count: tally.truncated,
          completed_at: RUN_AT.toISOString(),
        },
      },
    });

    pipeline.emitMeta(
      {
        toronto_centreline: ['geom', 'linear_name', 'linear_name_full', 'from_intersection_id', 'to_intersection_id', 'lo_num_l', 'hi_num_l', 'lo_num_r', 'hi_num_r', 'parity_l', 'parity_r'],
        parcels: ['id', 'geom', 'address_number', 'street_name_normalized'],
      },
      { parcels: ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'centreline_dataset_version_when_enriched'] },
    );

    pipeline.log.info(TAG, `enriched ${result.updated} parcels (corner ${tally.corner_true}, through ${tally.through_true}, frontage ${tally.frontage_resolved}; zero-intersection ${zeroPct}%)`);
    return { ok: true };
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP already
}

if (require.main === module) {
  pipeline.run('enrich-centreline', main);
}

module.exports = {
  ADVISORY_LOCK_ID,
  PRODUCER_NAME,
  BUILD_TEMP_SQL,
  UPDATE_SQL,
  readCentrelineContract,
  assertPreconditions,
  enrichCentreline,
  verdictCascade,
  gradeDiagnosticRows,
};
