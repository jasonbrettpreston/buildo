/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 9
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md §4
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §4
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2a, §1.4, §1.7, §1.8, §4.1, §5.1, §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (13 rules, R-K.1, R-W)
 *
 * Parcel Linking — THE DOMAIN LOGIC ONLY. Pilot 7, LINK archetype 2nd member.
 *
 * WHAT THIS FILE IS (mirrors `link-massing.js`'s own 3-thing split):
 *   1. buildMatchSql(descriptor, config, mode) — the SQL TEXT, pure, no pool. Composite-key
 *      keyset pagination (LG-25), the address UNION ALL primary pass (1a/1b/2), and the
 *      two-stage spatial pass (Step 1 containment, Step 2 THE FIX's KNN fallback).
 *   2. The pure row classifiers the library calls between each match pass and the write.
 *   3. One named observer per declared check, reading what the library measured.
 *
 * THE FIX (Spec 124 §7 rung (e), Finding 1 / LP-D1). Strategy 3 Step 2 no longer ranks
 * candidate parcels by the materialized centroid columns — it ranks by
 * the parcel's own live `geom` via the KNN operator (`<->`, LATERAL, GiST-accelerated),
 * with a declared `, pa.id ASC` tiebreak (19 exact ties measured, LM-D13 precedent) and
 * the 100m cap applied as a SCALAR POST-FILTER, never a co-resident `ST_DWithin` bound —
 * measured live (Fold B item 1) that combination costs 97.5s/batch, unviable; the shipped
 * shape costs 400-500ms/batch. LP-D6 (Fold B item 2, evidence corrected Fold C blocking
 * item 1 — the real observed link is parcel `439990`, never `id=1`): an explicit
 * `WHERE v.lng IS NOT NULL AND v.lat IS NOT NULL` guard excludes NULL-coordinate permits
 * from the LATERAL join entirely, rather than letting an unguarded KNN comparison
 * silently resolve to an arbitrary row.
 *
 * WHAT DID NOT CHANGE: Strategy 3 Step 1 (`ST_Contains`, `spatial_polygon`, confidence
 * T3) is already geometry-correct and untouched. Strategies 1a/1b/2 (address matching)
 * fold into ONE `primary_match_sql` via `UNION ALL` (A-4 ruling) but are otherwise
 * byte-for-byte the pre-conversion SQL, confirmed against the G3 intent ledger's own
 * `preserved-in-compute` dispositions (report §2).
 */
'use strict';

/** T1-T5 (Finding 6 / LP-D4) — the five previously-undeclared literal tunables, now read from ctx.config. */
const CONFIG_KEYS = {
  addressPointsExactConfidence: 'link_parcels_confidence_address_points_exact', // T1, was 0.97
  exactAddressConfidence: 'link_parcels_confidence_exact_address',             // T2, was 0.95
  spatialPolygonConfidence: 'link_parcels_confidence_spatial_polygon',         // T3, was 0.90
  nameOnlyConfidence: 'link_parcels_confidence_name_only',                     // T4, was 0.80
  linkRateWarnPct: 'link_parcels_link_rate_warn_pct',                         // T5, was 75
};

/**
 * buildMatchSql(descriptor, config, mode) — ruling A-2 option 2, mirrors `link-massing.js`.
 * The SQL is STATIC TEXT, parameterised by UNNEST arrays for every VALUES-shaped input
 * (no per-batch string rebuilding) — the same idiom the pre-conversion script's own
 * Strategy 3 spatial queries already used (`unnest($1::text[])...`).
 *
 * @param {object} descriptor
 * @param {Readonly<Record<string, number>>|null} config - ctx.config; null yields SQL text
 *   with its placeholders and no bind values baked in for the confidence literals (a
 *   shape test / reviewer read) — the confidence values are INTERPOLATED (validated
 *   finite numbers, never a string), the same idiom `link-massing.js` uses for its own
 *   two confidence config vars.
 * @param {'full'|'incremental'} mode
 */
function buildMatchSql(descriptor, config, mode) {
  const addressPointsExactConfidence = config ? config[CONFIG_KEYS.addressPointsExactConfidence] : 0.97;
  const exactAddressConfidence = config ? config[CONFIG_KEYS.exactAddressConfidence] : 0.95;
  const spatialPolygonConfidence = config ? config[CONFIG_KEYS.spatialPolygonConfidence] : 0.90;
  const nameOnlyConfidence = config ? config[CONFIG_KEYS.nameOnlyConfidence] : 0.80;

  const addressFilter = `(street_num IS NOT NULL AND street_num != ''
       AND street_name IS NOT NULL AND street_name != '')
       OR (latitude IS NOT NULL AND longitude IS NOT NULL)`;
  // Incremental filter — byte-for-byte the pre-conversion predicate (f0daba71, 2026-04-15):
  // re-link only permits never linked, or newly geocoded since last link. geocoded_at,
  // never last_seen_at (load-permits.js touches last_seen_at for every daily-feed permit,
  // which would defeat the incremental design).
  const incrementalFilter = `AND (p.parcel_linked_at IS NULL
       OR (p.geocoded_at IS NOT NULL AND p.parcel_linked_at < p.geocoded_at))`;
  const extraFilter = mode === 'full' ? '' : incrementalFilter;

  return {
    eligible_count_sql:
      `SELECT COUNT(*) AS total FROM permits p WHERE (${addressFilter}) ${extraFilter};`,

    // LG-25 — composite-key keyset pagination (permits has no surrogate id).
    eligible_batch_sql:
      `SELECT p.permit_num, p.revision_num, p.street_num, p.street_name, p.street_type,
              p.latitude, p.longitude
         FROM permits p
        WHERE (${addressFilter}) ${extraFilter}
          AND (p.permit_num, p.revision_num) > ($2, $3)
        ORDER BY p.permit_num, p.revision_num
        LIMIT $1;`,

    // Strategies 1a + 1b + 2, folded into ONE UNION ALL (A-4 ruling). Params (in order):
    // $1 permit_num[], $2 revision_num[], $3 addr_num[], $4 street_name[], $5 street_type[].
    primary_match_sql: `
      WITH input_permits (permit_num, revision_num, addr_num, street_name, street_type) AS (
        SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::text[]), unnest($4::text[]), unnest($5::text[])
      ),
      -- LP-D9 (commit 8a, 2026-08-30): address_points carries NO street-type column of
      -- its own (linear_name_normalized is type-less), so this CTE originally matched on
      -- house-number + street-name ONLY -- a same-name-different-type collision (e.g. "26
      -- MEADOWVALE RD" vs "26 MEADOWVALE DR", ~31.6km apart in the live DB) could resolve
      -- to whichever candidate happened to win the class/area/id-ASC tiebreak below,
      -- REGARDLESS of which type the permit itself declared. p.street_type_normalized
      -- (via the already-joined parcels p) is the disambiguator; the JOIN clause AND the
      -- WHERE clause below mirror Strategy 1b's (exact, below) OWN empty-type predicate
      -- shape byte-for-byte, not a stricter or looser form -- verified live (LP-D9 lock)
      -- that 1b's own "empty tolerance" is, in practice, NOT permissive (its JOIN's hard
      -- equality already requires pa.street_type_normalized = '' when ip.street_type
      -- is empty, which real parcels essentially never have -- 0/8,439 sampled), so this
      -- CTE reproduces that SAME effectively-strict behavior, never a more lenient one.
      address_points_exact AS (
        SELECT DISTINCT ON (ip.permit_num, ip.revision_num)
          ip.permit_num, ip.revision_num, pap.parcel_id,
          'address_points_exact' AS match_type, ${addressPointsExactConfidence}::numeric AS confidence
        FROM input_permits ip
        JOIN address_points ap
          ON ap.addr_num_normalized = ip.addr_num
         AND ap.linear_name_normalized = ip.street_name
         AND (ap.maint_stage IS NULL OR UPPER(ap.maint_stage) = 'REGULAR')
         AND (ap.address_status IS NULL OR UPPER(ap.address_status) IN ('CURRENT', 'NONE'))
        JOIN parcel_address_points pap ON pap.address_point_id = ap.address_point_id
        JOIN parcels p ON p.id = pap.parcel_id
         AND p.street_type_normalized = ip.street_type
        WHERE (ip.street_type = '' OR p.street_type_normalized = ip.street_type)
        ORDER BY ip.permit_num, ip.revision_num,
          CASE UPPER(COALESCE(ap.address_class_desc, ''))
            WHEN 'STRUCTURE'           THEN 1
            WHEN 'STRUCTURE ENTRANCE'  THEN 2
            WHEN 'LAND'                THEN 3
            ELSE 4
          END,
          ST_Area(p.geom::geography) ASC,
          ap.address_point_id ASC
      ),
      exact AS (
        SELECT DISTINCT ON (ip.permit_num, ip.revision_num)
          ip.permit_num, ip.revision_num, pa.id AS parcel_id,
          'exact_address' AS match_type, ${exactAddressConfidence}::numeric AS confidence
        FROM input_permits ip
        JOIN parcels pa ON pa.addr_num_normalized = ip.addr_num
          AND pa.street_name_normalized = ip.street_name
          AND pa.street_type_normalized = ip.street_type
        WHERE (ip.street_type = '' OR pa.street_type_normalized = ip.street_type)
          AND NOT EXISTS (
            SELECT 1 FROM address_points_exact ape
            WHERE ape.permit_num = ip.permit_num AND ape.revision_num = ip.revision_num
          )
        ORDER BY ip.permit_num, ip.revision_num, pa.id
      ),
      name_only AS (
        SELECT DISTINCT ON (ip.permit_num, ip.revision_num)
          ip.permit_num, ip.revision_num, pa.id AS parcel_id,
          'name_only' AS match_type, ${nameOnlyConfidence}::numeric AS confidence
        FROM input_permits ip
        JOIN parcels pa ON pa.addr_num_normalized = ip.addr_num
          AND pa.street_name_normalized = ip.street_name
        WHERE NOT EXISTS (
          SELECT 1 FROM address_points_exact ape
          WHERE ape.permit_num = ip.permit_num AND ape.revision_num = ip.revision_num
        )
        AND NOT EXISTS (
          SELECT 1 FROM exact e
          WHERE e.permit_num = ip.permit_num AND e.revision_num = ip.revision_num
        )
        ORDER BY ip.permit_num, ip.revision_num, pa.id
      )
      SELECT * FROM address_points_exact
      UNION ALL
      SELECT * FROM exact
      UNION ALL
      SELECT * FROM name_only;`,

    // Strategy 3 Step 1 — UNCHANGED, already geometry-correct. Params: $1 permit_num[],
    // $2 revision_num[], $3 lng[], $4 lat[].
    spatial_containment_sql: `
      SELECT v.pn AS permit_num, v.rv AS revision_num, pa.id AS parcel_id,
             'spatial_polygon' AS match_type, ${spatialPolygonConfidence}::numeric AS confidence
      FROM (SELECT unnest($1::text[]) AS pn, unnest($2::text[]) AS rv,
                   unnest($3::float[]) AS lng, unnest($4::float[]) AS lat) v
      JOIN parcels pa ON pa.geom IS NOT NULL
        AND ST_Contains(pa.geom, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326));`,

    // Strategy 3 Step 2 — THE FIX. Unconstrained KNN LATERAL on the live geometry,
    // declared pa.id ASC tiebreak, cap as a scalar post-filter (never a co-resident
    // distance-radius bound predicate — Fold B item 1, see this file's own header for
    // the retired form's own name), explicit NULL-coordinate guard (LP-D6, Fold B
    // item 2). Params: $1 permit_num[], $2 revision_num[], $3 lng[], $4 lat[], $5 cap_m.
    // confidence is bound as $6 (a plain numeric bind, not interpolated, matching the
    // ALREADY-registered spatial_match_confidence var's own pre-existing form).
    spatial_fallback_sql: `
      SELECT v.pn AS permit_num, v.rv AS revision_num, c.id AS parcel_id,
             'spatial' AS match_type, $6::numeric AS confidence
      FROM (SELECT unnest($1::text[]) AS pn, unnest($2::text[]) AS rv,
                   unnest($3::float[]) AS lng, unnest($4::float[]) AS lat) v
      CROSS JOIN LATERAL (
        SELECT pa.id, pa.geom
        FROM parcels pa
        WHERE pa.geom IS NOT NULL
        ORDER BY pa.geom <-> ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326), pa.id ASC
        LIMIT 1
      ) c
      WHERE v.lng IS NOT NULL AND v.lat IS NOT NULL
        AND ST_Distance(c.geom::geography, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography) <= $5;`,

    // LG-24 — the per-batch keyed DELETE of superseded rows. A single UNNEST-based
    // statement handles BOTH the changed-match retraction (8a1c7d25, keep_parcel_id set)
    // AND the zero-match cleanup (keep_parcel_id NULL — "delete every existing link for
    // this permit"): `v.keep_parcel_id IS NULL` makes the OR unconditionally true, so
    // NULL genuinely means "keep nothing", matching the pre-conversion script's own
    // two-branch logic (`369341ae`'s batching + `8a1c7d25`'s changed-match extension,
    // G3 report §2) collapsed into one statement. Params: $1 permit_num[], $2
    // revision_num[], $3 keep_parcel_id[] (nullable ints).
    delete_by_key_sql: `
      DELETE FROM permit_parcels pp
      USING (
        SELECT unnest($1::text[]) AS permit_num,
               unnest($2::text[]) AS revision_num,
               unnest($3::int[])  AS keep_parcel_id
      ) v
      WHERE pp.permit_num = v.permit_num
        AND pp.revision_num = v.revision_num
        AND (v.keep_parcel_id IS NULL OR pp.parcel_id != v.keep_parcel_id);`,

    // The declared FULL-mode-only scoped mass retraction (Fold A I-1) — rendered here so
    // it is visible beside the rest of the match SQL, but it is actually EXECUTED by
    // write.js's generic W1 mechanism off `outputs.writes[0].write_discipline.scope` +
    // `retract:"all"`/`retract_when:"full_only"`, never called directly by this file.
    full_retraction_scope_sql_text: "match_type = 'spatial'",

    cumulative_sql:
      `SELECT
         (SELECT COUNT(DISTINCT (permit_num, revision_num)) FROM permit_parcels) AS linked,
         (SELECT COUNT(*) FROM permits) AS total;`,

    // LP-D9 (commit 8a) OBSERVABILITY — a standing, whole-table audit (not merely a
    // run-scoped counter) of every CURRENTLY-written address_points_exact link whose
    // permit street_type conflicts with its linked parcel's own street_type_normalized.
    // Post-fix the JOIN structurally prevents a NEW mismatch, but this check exists to
    // (a) catch any pre-existing residual row an incremental run never revisits, and
    // (b) stand as the permanent regression detector if the predicate is ever removed
    // again — "this class must never be invisible again." Empty-type-tolerant rows
    // (permit street_type '' or NULL) are correctly excluded: they were never claimed to
    // satisfy this invariant, mirroring Strategy 1b's own empty-type disposition.
    street_type_mismatch_sql:
      `SELECT COUNT(*) AS n
         FROM permit_parcels pp
         JOIN permits p ON p.permit_num = pp.permit_num AND p.revision_num = pp.revision_num
         JOIN parcels pa ON pa.id = pp.parcel_id
        WHERE pp.match_type = 'address_points_exact'
          AND p.street_type IS NOT NULL AND TRIM(p.street_type) != ''
          AND UPPER(TRIM(p.street_type)) != pa.street_type_normalized;`,
  };
}

/** Primary-pass rows (1a/1b/2) already carry match_type/confidence from the SQL — pass through, count by tier. */
function classifyPrimary(rows) {
  let addressPointsExact = 0;
  let exactLegacy = 0;
  let nameOnly = 0;
  for (const r of rows) {
    if (r.match_type === 'address_points_exact') addressPointsExact++;
    else if (r.match_type === 'exact_address') exactLegacy++;
    else if (r.match_type === 'name_only') nameOnly++;
  }
  return { rows, addressPointsExact, exactLegacy, nameOnly };
}

/** Strategy 3 Step 1 (containment) rows — already typed by the SQL. */
function classifySpatialContainment(rows) {
  return { rows, matched: rows.length };
}

/** Strategy 3 Step 2 (THE FIX) rows — already typed by the SQL. */
function classifySpatialFallback(rows) {
  return { rows, matched: rows.length };
}

// ---- checks ----
// §5.5 (2)'s observation contract (scripts/lib/step/verdict.js checkRow): a "viol == 0"
// limit form reads `observation.violations` (falls back to `.value`); a "pct <=" bound
// form reads `observation.value` DIRECTLY, never `.violations` — mirrors link-massing.js's
// own convention exactly (parcels_processed/run_matched/multi_primary_parcels vs link_rate).

function permits_processed(ctx) {
  ctx.report('permits_processed', { violations: 0, detail: ctx.matched.permits_processed });
}

function tier_1_exact_address(ctx) {
  const total = ctx.matched.address_points_exact + ctx.matched.exact_legacy;
  ctx.report('tier_1_exact_address', { violations: 0, detail: total });
}

function tier_1_via_bridge(ctx) {
  ctx.report('tier_1_via_bridge', { violations: 0, detail: ctx.matched.address_points_exact });
}

function tier_2_name_only(ctx) {
  ctx.report('tier_2_name_only', { violations: 0, detail: ctx.matched.name_only });
}

function tier_3_spatial(ctx) {
  ctx.report('tier_3_spatial', { violations: 0, detail: ctx.matched.spatial_polygon + ctx.matched.spatial });
}

function tier_3_polygon(ctx) {
  ctx.report('tier_3_polygon', { violations: 0, detail: ctx.matched.spatial_polygon });
}

function run_matched(ctx) {
  const m = ctx.matched;
  const total = m.address_points_exact + m.exact_legacy + m.name_only + m.spatial_polygon + m.spatial;
  ctx.report('run_matched', { violations: 0, detail: total });
}

function no_match(ctx) {
  ctx.report('no_match', { violations: 0, detail: ctx.matched.no_match });
}

function permit_parcels_written(ctx) {
  const w = ctx.written && ctx.written.e1;
  ctx.report('permit_parcels_written', { violations: 0, detail: (w && w.rows_changed) || 0 });
}

/** LP-D6, Fold B item 2 — WARN, R-H retighten candidate. Evidence corrected at Fold C blocking item 1: the real observed link is parcel `439990`, never `id=1`. Non-zero IS the violation count — this check WARNs whenever NULL-coordinate permits are excluded from Strategy 3 Step 2, mirroring link-massing.js's own multi_primary_parcels shape (a count check, not an always-zero INFO row). */
function spatial_null_coordinate_permits(ctx) {
  const n = ctx.matched.null_coordinate_permits || 0;
  ctx.report('spatial_null_coordinate_permits', { violations: n, detail: n });
}

/** LP-D9 (commit 8a) — WARN, mirrors spatial_null_coordinate_permits' own shape (a whole-table
 * standing audit, non-zero IS the violation count, never an always-zero INFO row). Post-fix
 * this should read 0 on every run; a non-zero value means either a not-yet-reprocessed
 * pre-fix residual row (self-heals on the next FULL run touching that permit) or a
 * regression in the street_type predicate itself — "this class must never be invisible
 * again" (nothing-hidden policy). */
function street_type_conflict(ctx) {
  const n = ctx.matched.street_type_mismatch || 0;
  ctx.report('street_type_conflict', { violations: n, detail: n });
}

/** T5 (LP-D4) — the link_rate verdict bound, cumulative (not run-scoped, a760e0e7's own reasoning). Reported as the UNLINKED complement (mirrors link-massing.js's own link_rate: the descriptor's limit form is an upper bound, "pct <= 25", so pct <= 25 on the complement is exactly link_rate >= 75). */
function link_rate(ctx) {
  const linked = ctx.cumulative.linked_parcels;
  const total = ctx.cumulative.parcels_with_link_eligibility;
  const rate = total > 0 ? (linked / total) * 100 : 0;
  const unlinked = total > 0 ? 100 - rate : 100;
  ctx.report('link_rate', {
    value: unlinked,
    detail: { link_rate_pct: round(rate), unlinked_pct: round(unlinked), linked, total },
  });
}

function write_privilege(ctx) {
  const p = (ctx.written && ctx.written.privilege) || null;
  const writable = Boolean(p && (p.rls_enabled === false || p.bypassrls === true || p.policies > 0));
  ctx.report('write_privilege', {
    violations: writable ? 0 : 1,
    detail: p ? `bypassrls=${p.bypassrls === true} policies=${p.policies}` : 'not measured',
  });
}

function round(n) { return Math.round(n * 100) / 100; }

const CHECKS = {
  permits_processed,
  tier_1_exact_address,
  tier_1_via_bridge,
  tier_2_name_only,
  tier_3_spatial,
  tier_3_polygon,
  run_matched,
  no_match,
  permit_parcels_written,
  spatial_null_coordinate_permits,
  street_type_conflict,
  link_rate,
  write_privilege,
};

function buildLinkMeta(ctx) {
  const m = ctx.matched;
  const w = ctx.written && ctx.written.e1;
  return {
    duration_ms: ctx.elapsed_ms,
    permits_processed: m.permits_processed,
    matches_tier_1_exact: m.address_points_exact + m.exact_legacy,
    matches_tier_1_via_bridge: m.address_points_exact,
    matches_tier_2_name: m.name_only,
    matches_tier_3_spatial: m.spatial_polygon + m.spatial,
    matches_tier_3_polygon: m.spatial_polygon,
    matches_tier_3_fallback: m.spatial,
    no_match_count: m.no_match,
    null_coordinate_permits: m.null_coordinate_permits || 0,
    street_type_mismatch_count: m.street_type_mismatch || 0,
    db_upserted: (w && w.rows_changed) || 0,
  };
}

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
  if (!ctx.matched || !ctx.cumulative) return { records_meta: {} };
  return { records_meta: buildLinkMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildMatchSql = buildMatchSql;
module.exports.classifyPrimary = classifyPrimary;
module.exports.classifySpatialContainment = classifySpatialContainment;
module.exports.classifySpatialFallback = classifySpatialFallback;
module.exports.buildLinkMeta = buildLinkMeta;
module.exports.CONFIG_KEYS = CONFIG_KEYS;
