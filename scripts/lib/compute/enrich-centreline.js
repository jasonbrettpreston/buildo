'use strict';
/**
 * COMPUTE for `enrich_centreline` (Spec 122 §5.5; batch-2 row 3.10, commit ②).
 *
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.11 (version-skip gate), §9 (centreline_enrich), §11 (the CTE chain + UPDATE guard)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (compute is just compute), Rule 3 (tunables), Rule 10 (row-derived verdict)
 *
 * Rule 2 — COMPUTE IS JUST COMPUTE. No pool creation, no logging, no `process.env`, no wall
 * clock, no verdict derivation, no thresholds. Every number here is MEASURED; every judgement
 * about it is made by the library from the descriptor's checks[].
 *
 * ONE PHASE (`centreline_join`, inside the shared transaction). Plan D1 = (a): the legacy
 * three-mode version-skip gate (WF2 P11-1) is PORTED VERBATIM — `readCentrelineContract`
 * (the `contract_read` hook, on the pool, before any transaction) resolves
 * {sourceDatasetVersion, lastVersion, staleCount, mode} with the legacy SQL in the legacy
 * order; the pass runs the full / scoped / no-op statements; `computePostPhase` (after
 * COMMIT) builds the mode-shaped `centreline_enrich` block and, in full mode only, the
 * diagnostics. Every §11 number is a logic variable (plan §5) rendered byte-exact at its
 * default (red test B4).
 */

// ===========================================================================
// Names the contract reads by. EC-D10 FIXED (operator ruling R2 = (b), <DATE>): the producer and
// self reads admit every ledger form of the slug — slugForms(name, ['sources']) in
// scripts/lib/ledger.js, pinned equal by src/tests/enrich-centreline.logic.test.ts — and both
// runner success statuses, so a converted standalone run (bare slug, completed_with_warnings) is
// read (registry-truth Phase 1 item 6; gate #44 FAIL:PRODUCER). PRODUCER_NAME / SELF_NAME stay the
// chain-prefixed names the HALT messages print.
// ===========================================================================

const PRODUCER_NAME = 'sources:load_centreline';
const SELF_NAME = 'sources:enrich_centreline';
const PRODUCER_FORMS = Object.freeze(['sources:load_centreline', 'load_centreline', 'load-centreline']);
const SELF_FORMS = Object.freeze(['sources:enrich_centreline', 'enrich_centreline', 'enrich-centreline']);
// L10 contract pin — DECLARED in this step's descriptor (staleness.pins, LDG-10 class 3), never a
// hard-coded const here: declared == executed. Read once at require() time (enrich-heritage.js
// precedent); a missing pin throws at load (fail-closed).
const DESCRIPTOR = require('../../enrich-centreline.descriptor.json');
const { pinnedEquals } = require('../staleness-pins');
const PRODUCER_STEP = 'load_centreline';
const PIN_STAMP = 'records_meta.centreline_load.spec_version';
/** The producer spec_version this reader halts on anything but (pinnedSpecVersion = the descriptor pin). */
const pinnedSpecVersion = () => pinnedEquals(DESCRIPTOR, PRODUCER_STEP, PIN_STAMP);
const SPEC_VERSION = pinnedSpecVersion();
const TAG = '[enrich-centreline]';

/** Separate DROP for the scoped build (legacy :382): a parameterized query is single-statement. */
const DROP_TEMP_SQL = 'DROP TABLE IF EXISTS tmp_centreline_enrich';

/**
 * Render a §5 numeric the way the legacy SQL literal was written. The azimuth sample step was
 * the float literal `10.0`; an integral value keeps its `.0` so the default is byte-exact.
 * Interpolation is safe: scripts/lib/step/config.js refuses any non-finite value.
 */
function sqlFloat(n) {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/**
 * The §11 CTE chain (9 CTEs), materialized into a temp table so the proximity join and the
 * per-pair azimuth math run ONCE. ONE builder for both modes (retires the legacy
 * `.replace()` string surgery, EC-D7 / LC-4):
 *   - full   — a PARAMETERLESS multi-statement query (`DROP …; CREATE TEMP …`), exactly the
 *              legacy BUILD_TEMP_SQL;
 *   - scoped — no DROP (issued separately, DROP_TEMP_SQL) + the stale-stamp conjunct with the
 *              query's ONE `$1` (= the producer source_dataset_version), exactly the legacy
 *              BUILD_TEMP_SQL_SCOPED.
 * The §5 numerics are INTERPOLATED, never bound (Fold A5): binding would change the full-mode
 * statement from parameterless to parameterized, which the extended protocol refuses for a
 * multi-statement query.
 */
function buildTempSql({ scoped = false } = {}, config) {
  const proximityM = config.enrich_centreline_proximity_m;
  const pairCap = config.enrich_centreline_pair_cap;
  const abutM = config.enrich_centreline_abut_m;
  const parallelTolDeg = config.enrich_centreline_parallel_tol_deg;
  const sampleM = sqlFloat(config.enrich_centreline_azimuth_sample_m);
  const oppositeTolDeg = config.enrich_centreline_through_opposite_tol_deg;
  // The legacy SQL comment states the opposite-sides gap as a degree literal (a half-turn minus the
  // tolerance); rendering it from the variable keeps it byte-equal at the default and true under a change.
  const oppositeGapDeg = 180 - oppositeTolDeg;
  const dropStatement = scoped ? '' : 'DROP TABLE IF EXISTS tmp_centreline_enrich;';
  const scopeConjunct = scoped
    ? '\n    AND (p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1)  -- WF2 P11-1: NULL/stale-stamp parcels only'
    : '';
  return `
${dropStatement}
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
    ON ST_DWithin(p.geom::geography, c.geom::geography, ${proximityM})  -- WF2: proximity, not containment (idx_toronto_centreline_geog_gist, mig 175)
  WHERE p.geom IS NOT NULL AND ST_IsValid(p.geom)        -- F2 geom-validity (precedent)${scopeConjunct}
),
parcel_ids_intersecting AS (
  SELECT DISTINCT parcel_id FROM parcel_segments
),
parcel_counts AS (
  SELECT parcel_id, COUNT(DISTINCT centreline_id) AS intersected_segment_count
  FROM parcel_segments GROUP BY parcel_id
),
parcel_lane AS (
  -- Spec 65 Phase 3 / #431-FU2: does the parcel abut a laneway? bool_or over its adjacent segments.
  -- Reuses the same seg_is_lane flag (and the same §8d 20m proximity model) as the corner/through
  -- exclusion — it does NOT alter those CTEs. Gates laneway-suite eligibility downstream (enrich-parcels).
  SELECT parcel_id, bool_or(seg_is_lane) AS abuts_laneway
  FROM parcel_segments GROUP BY parcel_id
),
parcel_segments_capped AS (
  SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY parcel_id ORDER BY centreline_id) AS rn
    FROM parcel_segments
  ) s WHERE rn <= ${pairCap}                                      -- L30 Cartesian-explosion cap
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
           AND c1_dist <= ${abutM} AND c2_dist <= ${abutM}
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
                     + ${sampleM} / GREATEST(ST_Length(c1_geom::geography), 1.0), 1.0))),
                 ST_Azimuth(ST_StartPoint(c1_geom), ST_EndPoint(c1_geom)))
               -
               COALESCE(
                 ST_Azimuth(ST_ClosestPoint(c2_geom, centroid),
                   ST_LineInterpolatePoint(c2_geom, LEAST(
                     ST_LineLocatePoint(c2_geom, ST_ClosestPoint(c2_geom, centroid))
                     + ${sampleM} / GREATEST(ST_Length(c2_geom::geography), 1.0), 1.0))),
                 ST_Azimuth(ST_StartPoint(c2_geom), ST_EndPoint(c2_geom)))
             ),
             2 * pi() - abs(
               COALESCE(
                 ST_Azimuth(ST_ClosestPoint(c1_geom, centroid),
                   ST_LineInterpolatePoint(c1_geom, LEAST(
                     ST_LineLocatePoint(c1_geom, ST_ClosestPoint(c1_geom, centroid))
                     + ${sampleM} / GREATEST(ST_Length(c1_geom::geography), 1.0), 1.0))),
                 ST_Azimuth(ST_StartPoint(c1_geom), ST_EndPoint(c1_geom)))
               -
               COALESCE(
                 ST_Azimuth(ST_ClosestPoint(c2_geom, centroid),
                   ST_LineInterpolatePoint(c2_geom, LEAST(
                     ST_LineLocatePoint(c2_geom, ST_ClosestPoint(c2_geom, centroid))
                     + ${sampleM} / GREATEST(ST_Length(c2_geom::geography), 1.0), 1.0))),
                 ST_Azimuth(ST_StartPoint(c2_geom), ST_EndPoint(c2_geom)))
             )
           ))) > cos(radians(${parallelTolDeg}))
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
               ) > pi() - radians(${oppositeTolDeg})
                 -- WF3 DEC-B (#431): the two parallel streets must be on OPPOSITE sides of the parcel —
                 -- bearings from the interior point (pos) to each segment differ by ~180° (angular gap > ${oppositeGapDeg}°).
                 -- Degenerate guard: if pos lies ON a segment (ST_Distance = 0) ST_Azimuth throws → the CASE
                 -- (no ELSE) yields NULL → the LEAST(...) comparison is NULL → bool_or ignores it (not-through).
           AND c1_dist <= ${abutM} AND c2_dist <= ${abutM}
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
  pf.frontage_priority                                  AS frontage_priority,
  COALESCE(pl.abuts_laneway, false)                    AS new_abuts_laneway   -- Spec 65 Phase 3 / #431-FU2
FROM parcel_ids_intersecting pii
LEFT JOIN parcel_counts        pc  USING (parcel_id)
LEFT JOIN parcel_lane          pl  USING (parcel_id)
LEFT JOIN parcel_corner_pairs  pcp USING (parcel_id)
LEFT JOIN parcel_parallel_pairs ppp USING (parcel_id)
LEFT JOIN parcel_frontage      pf  USING (parcel_id);
`;
}

/**
 * UPDATE parcels from the materialized temp — class N `set_based_join_update`, executed
 * through `ctx.joinUpdate` (whose executor refuses INSERT/ON CONFLICT text). The 5-disjunct
 * IS DISTINCT FROM guard includes `abuts_laneway` and the lineage stamp, so a same-version
 * re-run writes 0 rows. `$1` = the producer source_dataset_version. Byte-equal to the legacy.
 * No retraction arm: a parcel not in the temp table keeps its values (EC-D4, pinned).
 */
const UPDATE_SQL = `
UPDATE parcels p
   SET is_corner_lot                = e.new_is_corner_lot,
       is_through_lot               = e.new_is_through_lot,
       primary_frontage_street_name = e.new_primary_frontage_street_name,
       abuts_laneway                = e.new_abuts_laneway,
       centreline_dataset_version_when_enriched = $1
  FROM tmp_centreline_enrich e
 WHERE p.id = e.parcel_id
   AND (p.is_corner_lot                IS DISTINCT FROM e.new_is_corner_lot
        OR p.is_through_lot            IS DISTINCT FROM e.new_is_through_lot
        OR p.primary_frontage_street_name IS DISTINCT FROM e.new_primary_frontage_street_name
        OR p.abuts_laneway            IS DISTINCT FROM e.new_abuts_laneway
        OR p.centreline_dataset_version_when_enriched IS DISTINCT FROM $1);
`;

/** Per-priority + boolean tallies from the materialized temp (one pass, no re-join). */
function buildTallySql(config) {
  const pairCap = config.enrich_centreline_pair_cap;
  return `
    SELECT
      COUNT(*)::int                                                   AS intersecting,
      COUNT(*) FILTER (WHERE new_is_corner_lot)::int                  AS corner_true,
      COUNT(*) FILTER (WHERE new_is_through_lot)::int                 AS through_true,
      COUNT(*) FILTER (WHERE new_primary_frontage_street_name IS NOT NULL)::int AS frontage_resolved,
      COUNT(*) FILTER (WHERE frontage_priority = 1)::int             AS p1,
      COUNT(*) FILTER (WHERE frontage_priority = 2)::int             AS p2,
      COUNT(*) FILTER (WHERE frontage_priority = 3)::int             AS p3,
      COUNT(*) FILTER (WHERE seg_count > ${pairCap})::int                     AS truncated,
      COUNT(*) FILTER (WHERE new_abuts_laneway)::int                  AS abuts_laneway_true
    FROM tmp_centreline_enrich`;
}

// ===========================================================================
// PRE-TRANSACTION — `execution.enrich_hooks.contract_read`. Called by the runner ABOVE the
// phase loop, before any transaction opens, on the step's own pool.
// ===========================================================================

/**
 * The version the LAST completed `sources:enrich_centreline` run stamped (the run row, NOT the
 * per-parcel column — a stray per-parcel value must not defeat the gate). Prefers
 * `records_meta.centreline_enrich.source_dataset_version`; falls back to the pre-P11
 * `centreline_source_dataset_version` audit row. Ported verbatim (legacy :289-301).
 */
async function readLastEnrichedVersion(pool) {
  const res = await pool.query(
    `SELECT records_meta FROM pipeline_runs WHERE pipeline = ANY($1::text[]) AND status IN ('completed', 'completed_with_warnings') AND NOT COALESCE(records_meta->'audit_table'->'rows' @> '[{"metric":"write_skipped_pre_write_warn"}]'::jsonb, false) ORDER BY completed_at DESC LIMIT 1`,
    [SELF_FORMS],
  );
  if (res.rows.length === 0) return null;
  const meta = res.rows[0].records_meta || {};
  const fromMeta = (meta.centreline_enrich || {}).source_dataset_version;
  if (fromMeta) return fromMeta;
  const auditRows = ((meta.audit_table || {}).rows) || [];
  const row = auditRows.find((r) => r.metric === 'centreline_source_dataset_version');
  return row ? row.value : null;
}

/**
 * Valid-geom parcels whose stamp is NULL/stale against `version` — the work set of an
 * unchanged-version run (legacy :305-313). Zero ⇒ skip; >0 ⇒ incremental. EC-D2 (pinned):
 * the never-stamped out-of-range tail keeps this above zero in steady state.
 */
async function countStaleParcels(pool, version) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM parcels
      WHERE geom IS NOT NULL AND ST_IsValid(geom)
        AND (centreline_dataset_version_when_enriched IS DISTINCT FROM $1)`,
    [version],
  );
  return rows[0].n;
}

/**
 * WF2 P11-1 — the pure mode decision (legacy :420-424, verbatim).
 *   changed version (or no prior run) → 'full'; unchanged + >0 stale → 'incremental';
 *   unchanged + 0 stale → 'skip'.
 */
function decideCentrelineMode({ lastVersion, currentVersion, staleCount }) {
  const versionUnchanged = lastVersion !== null && lastVersion !== undefined && lastVersion === currentVersion;
  if (!versionUnchanged) return 'full';
  return staleCount === 0 ? 'skip' : 'incremental';
}

/**
 * The §9 / DEC-E consumer read protocol — the four legacy HALTs, BEFORE any transaction
 * (legacy :318-338) — followed by the version-skip gate's reads in the legacy order
 * (:496-501): the self read, then the stale count ONLY when the version is unchanged.
 * Returns everything the pass and post_phase need (Fold A1: post_phase has no `contract`,
 * so the pass hands these four keys on through `passRaw`).
 */
async function readCentrelineContract(pool) {
  const res = await pool.query(
    `SELECT records_meta FROM pipeline_runs WHERE pipeline = ANY($1::text[]) AND status IN ('completed', 'completed_with_warnings') AND NOT COALESCE(records_meta->'audit_table'->'rows' @> '[{"metric":"write_skipped_pre_write_warn"}]'::jsonb, false) ORDER BY completed_at DESC LIMIT 1`,
    [PRODUCER_FORMS],
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
  const lastVersion = await readLastEnrichedVersion(pool);
  const staleCount = (lastVersion !== null && lastVersion === sourceDatasetVersion)
    ? await countStaleParcels(pool, sourceDatasetVersion)
    : null;
  const mode = decideCentrelineMode({ lastVersion, currentVersion: sourceDatasetVersion, staleCount });
  return { sourceDatasetVersion, lastVersion, staleCount, mode };
}

// ===========================================================================
// PHASE — `centreline_join`, `writes_ref` 0, inside the shared transaction.
// ===========================================================================

/**
 * The legacy L14-equivalent refusal (legacy :373-375), kept at its legacy POSITION: inside the
 * transaction, in full and incremental mode only (the skip path never ran it — EC-D6). No
 * `guards.requires` kind can express "non-empty", so it stays here.
 */
async function assertCentrelineNonEmpty(client) {
  if ((await client.query('SELECT 1 FROM toronto_centreline LIMIT 1')).rows.length === 0) {
    throw new Error(`${TAG} toronto_centreline is empty — aborting to avoid enriching every parcel to all-false`);
  }
}

/**
 * Fold A1 — `mode = ctx.full ? 'full' : ctx.contract.mode`: a forced (ENRICH_CENTRELINE_FORCE_FULL)
 * or interrupted-prior run is FULL, because the contract hook never sees `full`.
 *   skip        — no statement at all (legacy :503-507);
 *   incremental — DROP + scoped build ($1) + UPDATE + tally (legacy :381-383, :387-400);
 *   full        — the parameterless build + UPDATE + tally (legacy :385, :387-400).
 * The UPDATE goes through `ctx.joinUpdate` (the runner owns the counter); the tally reads the
 * temp table on the same client.
 */
async function runCentrelineJoinPass(client, ctx) {
  const { sourceDatasetVersion, lastVersion, staleCount } = ctx.contract;
  const mode = ctx.full ? 'full' : ctx.contract.mode;
  if (mode === 'skip') {
    return { mode, lastVersion, sourceDatasetVersion, staleCount, updated: 0, tally: null };
  }
  await assertCentrelineNonEmpty(client);
  if (mode === 'incremental') {
    await client.query(DROP_TEMP_SQL);
    await client.query(buildTempSql({ scoped: true }, ctx.config), [sourceDatasetVersion]);
  } else {
    await client.query(buildTempSql({ scoped: false }, ctx.config));
  }
  const updated = await ctx.joinUpdate(0, UPDATE_SQL, [sourceDatasetVersion]);
  ctx.onProgress(updated);
  const tally = (await client.query(buildTallySql(ctx.config))).rows[0];
  return { mode, lastVersion, sourceDatasetVersion, staleCount, updated, tally };
}

// ===========================================================================
// STEP-LEVEL POST PHASE — `execution.enrich_hooks.post_phase`. Called ONCE by the runner,
// after the phase and after COMMIT, on the step's own pool.
// ===========================================================================

/** F5b/G4 + the L21 denominator (legacy :524-530) — full mode only. */
const DIAGNOSTIC_PARCELS_SQL = `
      SELECT
        COUNT(*) FILTER (WHERE geom IS NOT NULL)                                          AS geom_total,
        COUNT(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom))                 AS invalid_geom,
        COUNT(*) FILTER (WHERE geom IS NOT NULL AND street_name_normalized IS NOT NULL)   AS name_pop,
        COUNT(*) FILTER (WHERE geom IS NOT NULL AND address_number IS NOT NULL)           AS addr_pop
      FROM parcels`;

/** F5c (legacy :531-534) — full mode only. */
const DIAGNOSTIC_CENTRELINE_SQL = `
      SELECT COUNT(*) FILTER (WHERE from_intersection_id IS NULL AND to_intersection_id IS NULL) AS node_null,
             COUNT(*) AS total
      FROM toronto_centreline`;

/**
 * The legacy percentage `round1(1000·x/t)/10` with `round1(n) = round(n·10)/10`, written with
 * the operator-editable `enrich_centreline_round_scale` s: `round((100·s·x/t)·s)/s/s`. At the
 * default s = 10 the float operations are the legacy ones in the legacy order (100·10 = 1000
 * is exact), so the value is byte-equal (red test A12/B7: 14528 of 486530 → 2.9899999999999998).
 * A zero denominator reads 0, as the legacy did.
 */
function pctOf(x, total, scale) {
  return total ? Math.round(((100 * scale * x) / total) * scale) / scale / scale : 0;
}

/** Legacy skip_reason vocabulary (legacy :446). */
function skipReasonFor(mode) {
  return mode === 'skip' ? 'version_and_geometry_unchanged' : 'version_unchanged_incremental';
}

/**
 * `matched` carries one entry per declared check id (a full-only check is ABSENT in a reduced
 * mode, and its check function reports it not-measured — EC-D1 carried) plus the mode-shaped
 * `centreline_enrich` emit, verbatim per mode (full :571-588, reduced :466-474). `compute`
 * carries the counter sources (A8): records_total = the population this mode scanned (full:
 * valid-geom parcels; incremental: the stale count; skip: 0), records_new = 0.
 */
async function computePostPhase(pool, { passRaw, runAt, config }) {
  const join = passRaw.centreline_join || {};
  const mode = join.mode;
  const sourceDatasetVersion = join.sourceDatasetVersion;
  const updated = Number(join.updated || 0);
  const completedAt = runAt.toISOString();

  if (mode !== 'full') {
    const skipReason = skipReasonFor(mode);
    const recomputed = mode === 'skip' ? 0 : join.staleCount;
    return {
      matched: {
        enrich_centreline_mode: mode,
        enrich_centreline_skip_reason: skipReason,
        parcels_recomputed: recomputed,
        parcels_enriched_count: updated,
        centreline_source_dataset_version: sourceDatasetVersion,
        centreline_enrich: {
          spec_version: SPEC_VERSION,
          source_dataset_version: sourceDatasetVersion,
          mode,
          skip_reason: skipReason,
          parcels_recomputed: recomputed,
          parcels_updated: updated,
          completed_at: completedAt,
        },
      },
      compute: { parcels_scanned: recomputed, records_new_aggregate: 0 },
    };
  }

  const tally = join.tally || {};
  const d = (await pool.query(DIAGNOSTIC_PARCELS_SQL)).rows[0];
  const c = (await pool.query(DIAGNOSTIC_CENTRELINE_SQL)).rows[0];
  const scale = config.enrich_centreline_round_scale;
  const geomTotal = Number(d.geom_total);
  const invalidGeom = Number(d.invalid_geom);
  const zeroCount = Math.max(geomTotal - tally.intersecting, 0);
  const zeroPct = pctOf(zeroCount, geomTotal, scale);
  return {
    matched: {
      parcels_with_zero_centreline_intersections_pct: zeroPct,
      parcels_invalid_geom_count: invalidGeom,
      parcels_street_name_normalized_pct: pctOf(Number(d.name_pop), geomTotal, scale),
      centreline_intersection_id_null_pct: pctOf(Number(c.node_null), Number(c.total), scale),
      parcels_address_number_null_pct: pctOf(geomTotal - Number(d.addr_pop), geomTotal, scale),
      parcels_is_corner_lot_count: tally.corner_true,
      parcels_is_through_lot_count: tally.through_true,
      parcels_abuts_laneway_count: tally.abuts_laneway_true,
      parcels_primary_frontage_resolved_count: tally.frontage_resolved,
      parcels_frontage_priority1_match_count: tally.p1,
      parcels_frontage_priority2_match_count: tally.p2,
      parcels_frontage_priority3_match_count: tally.p3,
      parcels_truncated_pair_count: tally.truncated,
      enrich_centreline_mode: mode,
      enrich_centreline_skip_reason: null,
      parcels_recomputed: null,
      parcels_enriched_count: updated,
      centreline_source_dataset_version: sourceDatasetVersion,
      centreline_enrich: {
        spec_version: SPEC_VERSION,
        source_dataset_version: sourceDatasetVersion,
        mode,
        parcels_updated: updated,
        parcels_with_zero_centreline_intersections_count: zeroCount,
        parcels_with_zero_centreline_intersections_pct: zeroPct,
        parcels_is_corner_lot_true_count: tally.corner_true,
        parcels_is_through_lot_true_count: tally.through_true,
        parcels_abuts_laneway_true_count: tally.abuts_laneway_true,
        parcels_primary_frontage_resolved_count: tally.frontage_resolved,
        parcels_frontage_priority1_name_match_count: tally.p1,
        parcels_frontage_priority2_addrrange_match_count: tally.p2,
        parcels_frontage_priority3_nearest_segment_count: tally.p3,
        parcels_truncated_pair_count: tally.truncated,
        completed_at: completedAt,
      },
    },
    compute: { parcels_scanned: geomTotal - invalidGeom, records_new_aggregate: 0 },
  };
}

// ===========================================================================
// Checks — one function per declared check, keys === descriptor.checks[].id in declaration
// order. Each reads `ctx.matched.<id>` and reports; none judges.
// ===========================================================================

/**
 * EC-D1 carried (pinned, ④a fixes): a reduced run (incremental / skip) never measures the
 * full-mode diagnostics. The row is still emitted — INERT (renders INFO, never PASS/WARN/FAIL)
 * with a detail naming the mode — so the reduced audit table keeps the legacy's all-INFO,
 * PASS-verdict shape without a hard-coded verdict. The `value` 0 only makes the declared bound
 * evaluable; `inert` overrides the result and `detail` is what the row shows.
 */
function reportNotMeasured(ctx, id) {
  const mode = (ctx.matched || {}).enrich_centreline_mode;
  ctx.report(id, { value: 0, inert: true, detail: `not measured (mode=${mode})` });
}

/** A graded percentage (L21 / F5b / F5c / G4): the library compares `value` to the declared bound. */
function reportGradedPct(ctx, id) {
  const value = (ctx.matched || {})[id];
  if (value === undefined) return reportNotMeasured(ctx, id);
  return ctx.report(id, { value });
}

/** An INFO observation (`viol == 0`): the row shows the measured value. */
function reportObserved(ctx, id) {
  const value = (ctx.matched || {})[id];
  if (value === undefined) return reportNotMeasured(ctx, id);
  return ctx.report(id, { violations: 0, detail: value });
}

function parcels_with_zero_centreline_intersections_pct(ctx) {
  reportGradedPct(ctx, 'parcels_with_zero_centreline_intersections_pct');
}

function parcels_invalid_geom_count(ctx) {
  reportObserved(ctx, 'parcels_invalid_geom_count');
}

function parcels_street_name_normalized_pct(ctx) {
  reportGradedPct(ctx, 'parcels_street_name_normalized_pct');
}

function centreline_intersection_id_null_pct(ctx) {
  reportGradedPct(ctx, 'centreline_intersection_id_null_pct');
}

function parcels_address_number_null_pct(ctx) {
  reportGradedPct(ctx, 'parcels_address_number_null_pct');
}

function parcels_is_corner_lot_count(ctx) {
  reportObserved(ctx, 'parcels_is_corner_lot_count');
}

function parcels_is_through_lot_count(ctx) {
  reportObserved(ctx, 'parcels_is_through_lot_count');
}

function parcels_abuts_laneway_count(ctx) {
  reportObserved(ctx, 'parcels_abuts_laneway_count');
}

function parcels_primary_frontage_resolved_count(ctx) {
  reportObserved(ctx, 'parcels_primary_frontage_resolved_count');
}

function parcels_frontage_priority1_match_count(ctx) {
  reportObserved(ctx, 'parcels_frontage_priority1_match_count');
}

function parcels_frontage_priority2_match_count(ctx) {
  reportObserved(ctx, 'parcels_frontage_priority2_match_count');
}

function parcels_frontage_priority3_match_count(ctx) {
  reportObserved(ctx, 'parcels_frontage_priority3_match_count');
}

function parcels_truncated_pair_count(ctx) {
  reportObserved(ctx, 'parcels_truncated_pair_count');
}

function enrich_centreline_mode(ctx) {
  reportObserved(ctx, 'enrich_centreline_mode');
}

function enrich_centreline_skip_reason(ctx) {
  reportObserved(ctx, 'enrich_centreline_skip_reason');
}

function parcels_recomputed(ctx) {
  reportObserved(ctx, 'parcels_recomputed');
}

function parcels_enriched_count(ctx) {
  reportObserved(ctx, 'parcels_enriched_count');
}

function centreline_source_dataset_version(ctx) {
  reportObserved(ctx, 'centreline_source_dataset_version');
}

function enrich_centreline_duration_ms(ctx) {
  ctx.report('enrich_centreline_duration_ms', { violations: 0, detail: ctx.elapsed_ms });
}

const CHECKS = {
  parcels_with_zero_centreline_intersections_pct,
  parcels_invalid_geom_count,
  parcels_street_name_normalized_pct,
  centreline_intersection_id_null_pct,
  parcels_address_number_null_pct,
  parcels_is_corner_lot_count,
  parcels_is_through_lot_count,
  parcels_abuts_laneway_count,
  parcels_primary_frontage_resolved_count,
  parcels_frontage_priority1_match_count,
  parcels_frontage_priority2_match_count,
  parcels_frontage_priority3_match_count,
  parcels_truncated_pair_count,
  enrich_centreline_mode,
  enrich_centreline_skip_reason,
  parcels_recomputed,
  parcels_enriched_count,
  centreline_source_dataset_version,
  enrich_centreline_duration_ms,
  // The invariants[] and plausibility[] rows are executed generically by
  // scripts/lib/step/plausibility.js against their own declared `sql`, never through this table.
};

// ===========================================================================
// records_meta
// ===========================================================================

/** The step's `records_meta` block — the three `emits[]`-declared keys. */
function buildCentrelineMeta(ctx) {
  const block = ctx.matched.centreline_enrich;
  return {
    duration_ms: ctx.elapsed_ms,
    code_version: ctx.descriptor.staleness.logic_version,
    ...(block ? { centreline_enrich: block } : {}),
  };
}

/** §5.5 (2) — run the SELECTED checks, and nothing else. */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.matched) return { records_meta: {} };
  return { records_meta: buildCentrelineMeta(ctx) };
}

// The declared phase order — names MUST match `execution.phases[].name`, in order.
const passes = [
  { name: 'centreline_join', txn: 'shared', run: runCentrelineJoinPass },
];

module.exports = Object.assign(compute, {
  checks: CHECKS,
  buildTempSql,
  buildTallySql,
  UPDATE_SQL,
  DROP_TEMP_SQL,
  DIAGNOSTIC_PARCELS_SQL,
  DIAGNOSTIC_CENTRELINE_SQL,
  readCentrelineContract,
  readLastEnrichedVersion,
  countStaleParcels,
  decideCentrelineMode,
  runCentrelineJoinPass,
  computePostPhase,
  buildCentrelineMeta,
  pctOf,
  passes,
  PRODUCER_NAME,
  SELF_NAME,
  PRODUCER_FORMS,
  SELF_FORMS,
  SPEC_VERSION,
});
