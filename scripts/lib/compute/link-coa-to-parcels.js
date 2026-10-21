'use strict';
/**
 * COMPUTE for `link_coa_to_parcels` (Spec 122 §5.5; phase-4 wave 4, compressed form commit ②).
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9, §6.8, §6.11.1
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §3 (level 0)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2, R-W, R-BZ, R-DF, R-EG)
 *
 * LINK, the second runLinkPhase family (Spec 124 R-EG, RE-FREEZE #37; first member). Rule 2 — COMPUTE IS
 * JUST COMPUTE: this file authors SQL text and pure classifiers; the runner owns the pool, the keyset loop,
 * every transaction, the run clock and the verdict.
 *
 * THE THREE OPERATOR-RULED CHANGES (wave-4 plan question 10, operator y 2026-10-18; assessment §12):
 *   1. RE-CHECK EVERY RUN (LCTP-D3/D6/D7, the link_parcels O4 row 7 copy): every eligible CoA
 *      (lead_id IS NOT NULL AND street_name_normalized IS NOT NULL) is re-matched every run; there is no
 *      write-once filter. lead_parcels is a guarded upsert plus a per-batch keyed retraction of departed
 *      (lead, parcel) pairs plus the vanished-lead sweep, all scoped to `coa:` leads. The coa_applications
 *      back-fill fires only for a CoA whose link changed this run (LOST_LINK_FLAG_SQL below).
 *   2. SET-BASED fail_fast (LCTP-D4): no per-row isolation; a bad row fails the batch transaction.
 *   3. NO TURF (LCTP-D5, R-W): PostGIS only (guards.requires extension postgis).
 *
 * THE CASCADE (preserved, one set statement): per CoA, the address-points bridge (tier 1a, match_type
 * `address_points_exact`; the SQL text is scripts/lib/coa-link-sql.js tier1aBridgeSql, unchanged), then the
 * parcels-table exact (tier 1a, `tier_1a_exact`), and — only when street_num is blank — the name-only match
 * (tier 1b, `tier_1b_name_only`). The first tier that finds a parcel wins (legacy :391-445).
 */

const { parseLinearName } = require('../address-normalizers');
const { tier1aBridgeSql } = require('../coa-link-sql');

/** The step-owned logic variables (migration 272, W4A-R1 copy form; no literal fallback — LCTP-D1). */
const CONFIG_KEYS = {
  tier1aConfidence: 'link_coa_to_parcels_conf_tier1a',
  tier1bConfidence: 'link_coa_to_parcels_conf_tier1b',
};

/** The lead-id namespace this step owns in the shared lead_parcels table (the permit mirror trigger writes `permit:`, LCTP-D9). */
const COA_SCOPE = "lp.lead_id LIKE 'coa:%'";

/** A CoA the cascade can try: it has a lead and a normalized street name (legacy batch SELECT :341-358, minus the write-once filter). */
const ELIGIBLE = 'ca.lead_id IS NOT NULL AND ca.street_name_normalized IS NOT NULL';

/**
 * The tier-1a bridge, re-bound from the legacy positional parameters to the LATERAL input row. The text is the
 * one in scripts/lib/coa-link-sql.js (the intent ledger keeps it the single home of the bridge rule); only its
 * three placeholders are rebound: $1 street_num, $2 street_name_normalized, $3 the parsed street type.
 */
function bridgeLateralSql() {
  return tier1aBridgeSql(true)
    .replace(/\$1\b/g, 'i.street_num')
    .replace(/\$2\b/g, 'i.street_name')
    .replace(/\$3\b/g, 'i.street_type');
}

/**
 * buildMatchSql(descriptor, config, mode) — the runLinkPhase match plan (link_massing form, R-EG). `mode` is
 * always "full" under staleness.mode_select "none" (resolveLinkGate), so no statement depends on it.
 *
 * @param {object} _descriptor
 * @param {Readonly<Record<string, number>>|null} config ctx.config; the two confidences are interpolated as
 *   validated finite numbers (the link_parcels / link_massing idiom), never strings.
 */
function buildMatchSql(_descriptor, config) {
  const tier1a = config ? Number(config[CONFIG_KEYS.tier1aConfidence]) : null;
  const tier1b = config ? Number(config[CONFIG_KEYS.tier1bConfidence]) : null;
  if (config && !(Number.isFinite(tier1a) && Number.isFinite(tier1b))) {
    throw new Error('[link_coa_to_parcels] the tier confidences must be finite numbers (link_coa_to_parcels_conf_tier1a / _tier1b)');
  }
  const conf1a = tier1a === null ? '$CONF_1A' : `${tier1a}::numeric`;
  const conf1b = tier1b === null ? '$CONF_1B' : `${tier1b}::numeric`;

  // The rows of THIS batch's CoAs that the cascade no longer derives ($1 = the batch's lead ids, $2/$3 = the
  // derived (lead_id, parcel_id) pairs). Shared by the before-image SELECT and the keyed DELETE so the two
  // cannot drift (the link_massing NOT_DERIVED form).
  const NOT_DERIVED = 'lp.lead_id = ANY($1::text[])\n'
    + `   AND ${COA_SCOPE}\n`
    + '   AND NOT EXISTS (SELECT 1 FROM unnest($2::text[], $3::int[]) AS d(lead_id, parcel_id)\n'
    + '                    WHERE d.lead_id = lp.lead_id AND d.parcel_id = lp.parcel_id)';

  return {
    // R-EG (1): the LINK counters under this step's names — CoAs, not parcels.
    counters: {
      eligible: 'coa_eligible',
      processed: 'coa_processed',
      linked: 'coa_linked',
      no_match: 'no_parcel_match',
      cumulative_linked: 'coa_corpus_linked_count',
      cumulative_total: 'coa_corpus_total',
    },
    eligible_count_sql: `SELECT COUNT(*) AS total FROM coa_applications ca WHERE ${ELIGIBLE};`,
    // Keyset on the lead id (unique: 'coa:' || application_number, UNIQUE; trg_coa_lead_id, migration 133). The
    // runner pages on the returned `id` column, so the lead id is returned under that name: it is also the
    // upsert's leading key, which keeps the runner's linked / no-match accounting in one key space.
    eligible_batch_sql:
      'SELECT ca.lead_id AS id, ca.street_num, ca.street_name_normalized, ca.street_name\n'
      + '  FROM coa_applications ca\n'
      + ` WHERE ${ELIGIBLE}\n`
      + '   AND ca.lead_id > $2\n'
      + ' ORDER BY ca.lead_id\n'
      + ' LIMIT $1;',
    // The cascade, ONE statement per batch. Params (primaryMatchBinds): $1 lead ids, $2 trimmed street_num ('' when
    // blank), $3 trimmed street_name_normalized, $4 the parsed street type ('' when unknown or no street_num).
    primary_match_sql:
      'WITH i (lead_id, street_num, street_name, street_type) AS (\n'
      + '  SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::text[]), unnest($4::text[])\n'
      + ')\n'
      + 'SELECT i.lead_id, m.parcel_id, m.match_type, m.type_confirmed\n'
      + '  FROM i\n'
      + '  CROSS JOIN LATERAL (\n'
      + '    SELECT c.parcel_id, c.match_type, c.type_confirmed FROM (\n'
      + "      SELECT b.id AS parcel_id, 'address_points_exact'::text AS match_type, b.type_confirmed, 1 AS tier\n"
      + `        FROM (${bridgeLateralSql()}) b\n`
      + "       WHERE i.street_num <> '' AND i.street_name <> ''\n"
      + '      UNION ALL\n'
      + "      SELECT e.id, 'tier_1a_exact'::text, NULL::boolean, 2\n"
      + '        FROM (SELECT p.id FROM parcels p\n'
      + '               WHERE p.addr_num_normalized = i.street_num\n'
      + '                 AND p.street_name_normalized = i.street_name\n'
      + "                 AND (i.street_type = '' OR p.street_type_normalized IS NULL OR p.street_type_normalized = i.street_type)\n"
      + '               ORDER BY p.id DESC\n'
      + '               LIMIT 1) e\n'
      + "       WHERE i.street_num <> '' AND i.street_name <> ''\n"
      + '      UNION ALL\n'
      + "      SELECT n.id, 'tier_1b_name_only'::text, NULL::boolean, 3\n"
      + '        FROM (SELECT p.id FROM parcels p\n'
      + '               WHERE p.street_name_normalized = i.street_name\n'
      + '               ORDER BY p.id DESC\n'
      + '               LIMIT 1) n\n'
      + "       WHERE i.street_num = '' AND i.street_name <> ''\n"
      + '    ) c\n'
      + '    ORDER BY c.tier\n'
      + '    LIMIT 1\n'
      + '  ) m;',
    // No spatial fallback: a CoA has no coordinates before its parcel match, so a tier-2 spatial pass is
    // unreachable by construction (Spec 42 §6.5 step 9; R2.v5 fix #14; the legacy file's own header).
    fallback_match_sql: null,
    // R-ID (CoA cutover ruling 4): the two per-run bridge type counters, counted per batch by classifyMatches and
    // summed by the runner (R-EG (1) additive amendment). Legacy :305-306, :407.
    extra_counters: ['tier_1a_type_confirmed', 'tier_1a_type_tolerant'],
    primary_counter: 'cascade_matches',
    fallback_counter: 'spatial_fallback_matches',
    fallback_bbox_degrees: null,
    fallback_max_distance: null,
    // ONE post-write read: the corpus coverage (the legacy buildCorpusCoverageRows, :157-187) plus the per-tier,
    // neighbourhood, coordinate and centroid observations over the ELIGIBLE CoAs. Every eligible CoA is re-derived
    // each run (re-check every run), so the eligible set's links after the run ARE this run's derivation.
    cumulative_sql:
      'SELECT\n'
      + "  (SELECT COUNT(DISTINCT lp.lead_id) FROM lead_parcels lp WHERE lp.lead_id LIKE 'coa:%') AS linked,\n"
      + '  (SELECT COUNT(*) FROM coa_applications WHERE lead_id IS NOT NULL) AS total,\n'
      + '  (SELECT COUNT(*) FROM coa_applications\n'
      + '     WHERE lead_id IS NOT NULL AND street_name IS NOT NULL AND street_name_normalized IS NULL) AS coa_corpus_missing_normalized_count,\n'
      + '  (SELECT COUNT(*) FROM coa_applications WHERE lead_id IS NOT NULL AND street_name_normalized IS NULL) AS no_address_data,\n'
      + '  (SELECT COUNT(*) FROM lead_parcels lp JOIN coa_applications ca ON ca.lead_id = lp.lead_id\n'
      + `     WHERE ${ELIGIBLE} AND lp.match_type = 'address_points_exact') AS tier_1a_via_bridge,\n`
      + '  (SELECT COUNT(*) FROM lead_parcels lp JOIN coa_applications ca ON ca.lead_id = lp.lead_id\n'
      + `     WHERE ${ELIGIBLE} AND lp.match_type = 'tier_1a_exact') AS tier_1a_parcels_exact,\n`
      + '  (SELECT COUNT(*) FROM lead_parcels lp JOIN coa_applications ca ON ca.lead_id = lp.lead_id\n'
      + `     WHERE ${ELIGIBLE} AND lp.match_type = 'tier_1b_name_only') AS tier_1b_name_only,\n`
      + '  (SELECT COUNT(DISTINCT ca.id) FROM coa_applications ca JOIN lead_parcels lp ON lp.lead_id = ca.lead_id\n'
      + `     WHERE ${ELIGIBLE}) AS eligible_linked,\n`
      + '  (SELECT COUNT(DISTINCT ca.id) FROM coa_applications ca JOIN lead_parcels lp ON lp.lead_id = ca.lead_id\n'
      + `     WHERE ${ELIGIBLE} AND ca.neighbourhood_id IS NOT NULL) AS eligible_linked_with_neighbourhood,\n`
      + '  (SELECT COUNT(DISTINCT ca.id) FROM coa_applications ca JOIN lead_parcels lp ON lp.lead_id = ca.lead_id\n'
      + `     WHERE ${ELIGIBLE} AND ca.latitude IS NOT NULL AND ca.longitude IS NOT NULL) AS eligible_linked_geocoded,\n`
      + '  (SELECT COUNT(*) FROM lead_parcels lp JOIN coa_applications ca ON ca.lead_id = lp.lead_id\n'
      + '     JOIN parcels p ON p.id = lp.parcel_id\n'
      + `     WHERE ${ELIGIBLE} AND p.geom IS NOT NULL AND p.centroid_lat IS NOT NULL AND p.centroid_lng IS NOT NULL\n`
      + '       AND NOT ST_Contains(p.geom, ST_SetSRID(ST_MakePoint(p.centroid_lng::double precision, p.centroid_lat::double precision), 4326))\n'
      + '  ) AS centroid_outside_polygon;',
    cumulative_params: [],
    // ── the keyed per-batch statements (the link_massing O4 row 5 / R-EG form). The runner executes, inside the
    // batch transaction: guarded upsert → stale SELECT → link-change back-fill → keyed DELETE. Only these three
    // descriptive-class statements are compute-authored (the LG-24 link_full_retraction / LG-22
    // set_source:"compute" precedent).
    // <lctp-keyed-descriptive-class-sql>
    stale_link_select_sql:
      'SELECT lp.lead_id, lp.parcel_id, lp.match_type, lp.confidence, lp.matched_at\n'
      + '  FROM lead_parcels lp\n'
      + ` WHERE ${NOT_DERIVED};`,
    // THE BACK-FILL, ON A LINK CHANGE ONLY (ruling 1; LCTP-D7). A CoA of this batch whose link changed this run —
    // it lost a (lead, parcel) pair ($1, the runner's lost_keys) or its lead_parcels row was inserted or rewritten
    // at this run's clock ($3; the upsert guard leaves matched_at alone on an unchanged link) — gets the parcel's
    // centroid coordinates, the neighbourhood containing that centroid and parcel_linked_at = the run clock. A CoA
    // whose link did not change is never written, so link_coa's permit-inherited coordinates are never rewritten
    // (26,723 rows measured, assessment §1.4). A CoA that lost its link and gained none keeps its coordinates and
    // neighbourhood (there is no parcel to take them from; the legacy step never cleared them either) and only its
    // marker moves. $2 = the batch's lead ids (R-EG (4): lost_keys, batch_keys, run_at, in that order).
    lost_link_flag_sql:
      'WITH changed AS (\n'
      + '  SELECT ca.id, ca.lead_id\n'
      + '    FROM coa_applications ca\n'
      + '   WHERE ca.lead_id = ANY($2::text[])\n'
      + '     AND (ca.lead_id = ANY($1::text[])\n'
      + '          OR EXISTS (SELECT 1 FROM lead_parcels lp WHERE lp.lead_id = ca.lead_id AND lp.matched_at = $3::timestamptz))\n'
      + '), cur AS (\n'
      + '  SELECT c.id, p.id AS parcel_id, p.centroid_lat, p.centroid_lng\n'
      + '    FROM changed c\n'
      + '    LEFT JOIN LATERAL (\n'
      + '      SELECT lp.parcel_id FROM lead_parcels lp\n'
      + '       WHERE lp.lead_id = c.lead_id\n'
      + '       ORDER BY lp.matched_at DESC, lp.parcel_id DESC\n'
      + '       LIMIT 1\n'
      + '    ) l ON true\n'
      + '    LEFT JOIN parcels p ON p.id = l.parcel_id\n'
      + '), v AS (\n'
      + '  SELECT cur.id, cur.parcel_id, cur.centroid_lat, cur.centroid_lng,\n'
      + '         (SELECT n.id FROM neighbourhoods n\n'
      + '           WHERE n.geom IS NOT NULL AND cur.centroid_lat IS NOT NULL AND cur.centroid_lng IS NOT NULL\n'
      + '             AND ST_Contains(n.geom, ST_SetSRID(ST_MakePoint(cur.centroid_lng::double precision, cur.centroid_lat::double precision), 4326))\n'
      + '           ORDER BY n.id\n'
      + '           LIMIT 1) AS neighbourhood_id\n'
      + '    FROM cur\n'
      + ')\n'
      + 'UPDATE coa_applications ca\n   SET latitude         = CASE WHEN v.parcel_id IS NULL THEN ca.latitude ELSE v.centroid_lat::numeric END,\n'
      + '       longitude        = CASE WHEN v.parcel_id IS NULL THEN ca.longitude ELSE v.centroid_lng::numeric END,\n'
      + '       neighbourhood_id = CASE WHEN v.parcel_id IS NULL THEN ca.neighbourhood_id ELSE v.neighbourhood_id END,\n'
      + '       parcel_linked_at = $3::timestamptz\n'
      + '  FROM v\n'
      + ' WHERE ca.id = v.id\n'
      + '   AND (ca.parcel_linked_at IS DISTINCT FROM $3::timestamptz\n'
      + '        OR ca.latitude IS DISTINCT FROM CASE WHEN v.parcel_id IS NULL THEN ca.latitude ELSE v.centroid_lat::numeric END\n'
      + '        OR ca.longitude IS DISTINCT FROM CASE WHEN v.parcel_id IS NULL THEN ca.longitude ELSE v.centroid_lng::numeric END\n'
      + '        OR ca.neighbourhood_id IS DISTINCT FROM CASE WHEN v.parcel_id IS NULL THEN ca.neighbourhood_id ELSE v.neighbourhood_id END)\n'
      + ' RETURNING ca.id;',
    lost_link_flag_binds: ['lost_keys', 'batch_keys', 'run_at'],
    stale_link_delete_sql:
      'DELETE FROM lead_parcels lp\n'
      + ` WHERE ${NOT_DERIVED};`,
    // </lctp-keyed-descriptive-class-sql>
  };
}

/**
 * R-EG (2): the primary-match binds, pure, over the batch rows — the legacy per-row inputs (:375-391): the trimmed
 * street number and name ('' when blank) and the street TYPE parsed from the raw street_name with the parser that
 * produced address_points/parcels street_type_normalized (LP-D9 port), only when both number and name are present.
 *
 * @param {Array<{id:string, street_num:string|null, street_name_normalized:string|null, street_name:string|null}>} rows
 * @returns {[string[], string[], string[], string[]]}
 */
function primaryMatchBinds(rows) {
  const leadIds = [];
  const nums = [];
  const names = [];
  const types = [];
  for (const r of rows) {
    const num = r.street_num ? r.street_num.trim() : '';
    const name = r.street_name_normalized ? r.street_name_normalized.trim() : '';
    leadIds.push(r.id);
    nums.push(num);
    names.push(name);
    types.push(num !== '' && name !== '' ? parseLinearName(r.street_name || '').street_type : '');
  }
  return [leadIds, nums, names, types];
}

/**
 * The cascade rows -> lead_parcels rows. One row per matched CoA (the cascade's LIMIT 1); the confidence is the
 * tier's declared variable (tier 1a for the bridge and the parcels exact, tier 1b for name-only, legacy :402-443).
 *
 * @returns {{rows: object[], parcels: number, matches: number}} `parcels` = CoAs linked (the runner's linked counter)
 */
function classifyMatches(matchRows, config) {
  const tier1a = Number(config[CONFIG_KEYS.tier1aConfidence]);
  const tier1b = Number(config[CONFIG_KEYS.tier1bConfidence]);
  const rows = [];
  const counters = { tier_1a_type_confirmed: 0, tier_1a_type_tolerant: 0 };
  for (const r of matchRows) {
    // Legacy :407: a bridge match whose candidate type equals the application's is confirmed; otherwise tolerant.
    if (r.match_type === 'address_points_exact') counters[r.type_confirmed === true ? 'tier_1a_type_confirmed' : 'tier_1a_type_tolerant'] += 1;
    rows.push({
      lead_id: r.lead_id,
      parcel_id: Number(r.parcel_id),
      match_type: r.match_type,
      confidence: r.match_type === 'tier_1b_name_only' ? tier1b : tier1a,
    });
  }
  return { rows, parcels: rows.length, matches: rows.length, counters };
}

/** Unreachable (fallback_match_sql is null); declared because the runner contract names it. */
function classifyFallback() {
  return { rows: [], parcels: 0 };
}

// ===========================================================================
// Checks — one function per declared check (Spec 122 §5.5 (1)); each reads what the runner measured and reports.
// ===========================================================================

function pct(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}
function pctText(v) {
  return v.toFixed(1) + '%';
}
function m(ctx, k) {
  return Number(ctx.matched && ctx.matched[k]) || 0;
}
function corpus(ctx) {
  return {
    total: Number(ctx.cumulative && ctx.cumulative.coa_corpus_total) || 0,
    linked: Number(ctx.cumulative && ctx.cumulative.coa_corpus_linked_count) || 0,
  };
}
function written(ctx, key, field) {
  const w = ctx.written && ctx.written[key];
  return w ? Number(w[field]) || 0 : 0;
}

function coa_corpus_total(ctx) {
  ctx.report('coa_corpus_total', { violations: 0, detail: corpus(ctx).total });
}
function coa_corpus_linked_count(ctx) {
  ctx.report('coa_corpus_linked_count', { violations: 0, detail: corpus(ctx).linked });
}
function coa_corpus_unlinked_pct(ctx) {
  const c = corpus(ctx);
  const unlinked = Math.max(0, c.total - c.linked);
  const v = pct(unlinked, c.total);
  ctx.report('coa_corpus_unlinked_pct', { value: v, detail: `${pctText(v)} (${unlinked} of ${c.total}; linked ${pctText(pct(c.linked, c.total))})` });
}
function coa_corpus_missing_normalized_count(ctx) {
  ctx.report('coa_corpus_missing_normalized_count', { violations: m(ctx, 'coa_corpus_missing_normalized_count') });
}
function coa_processed(ctx) {
  ctx.report('coa_processed', { violations: 0, detail: m(ctx, 'coa_processed') });
}
function tier_1a_exact(ctx) {
  ctx.report('tier_1a_exact', { violations: 0, detail: m(ctx, 'tier_1a_via_bridge') + m(ctx, 'tier_1a_parcels_exact') });
}
function tier_1a_via_bridge(ctx) {
  ctx.report('tier_1a_via_bridge', { violations: 0, detail: m(ctx, 'tier_1a_via_bridge') });
}
function tier_1a_type_confirmed(ctx) {
  ctx.report('tier_1a_type_confirmed', { violations: 0, detail: m(ctx, 'tier_1a_type_confirmed') });
}
function tier_1a_type_tolerant(ctx) {
  ctx.report('tier_1a_type_tolerant', { violations: 0, detail: m(ctx, 'tier_1a_type_tolerant') });
}
function tier_1b_name_only(ctx) {
  ctx.report('tier_1b_name_only', { violations: 0, detail: m(ctx, 'tier_1b_name_only') });
}
function no_address_data(ctx) {
  ctx.report('no_address_data', { violations: 0, detail: m(ctx, 'no_address_data') });
}
function no_parcel_match(ctx) {
  ctx.report('no_parcel_match', { violations: 0, detail: m(ctx, 'no_parcel_match') });
}
function unmatched_coa_pct(ctx) {
  const processed = m(ctx, 'coa_processed');
  const unmatched = m(ctx, 'no_parcel_match');
  const v = pct(unmatched, processed);
  ctx.report('unmatched_coa_pct', { value: v, detail: `${pctText(v)} (${unmatched} of ${processed})` });
}
function coa_neighbourhood_coverage_pct(ctx) {
  const linked = m(ctx, 'eligible_linked');
  const v = pct(m(ctx, 'eligible_linked_with_neighbourhood'), linked);
  ctx.report('coa_neighbourhood_coverage_pct', linked === 0 ? { value: v, detail: pctText(v), inert: true } : { value: v, detail: pctText(v) });
}
function coa_geocoded_pct(ctx) {
  ctx.report('coa_geocoded_pct', { violations: 0, detail: pctText(pct(m(ctx, 'eligible_linked_geocoded'), m(ctx, 'eligible_linked'))) });
}
function centroid_outside_polygon_count(ctx) {
  const outside = m(ctx, 'centroid_outside_polygon');
  const linked = m(ctx, 'eligible_linked');
  const v = pct(outside, linked);
  ctx.report('centroid_outside_polygon_count', { value: v, detail: `${outside} (${pctText(v)} of linked CoAs)` });
}
function links_retracted(ctx) {
  ctx.report('links_retracted', { violations: 0, detail: written(ctx, 'e2', 'deleted') });
}
function ghost_orphans_cleaned(ctx) {
  ctx.report('ghost_orphans_cleaned', { violations: 0, detail: written(ctx, 'e1', 'retracted') });
}
function coa_backfilled(ctx) {
  ctx.report('coa_backfilled', { violations: 0, detail: written(ctx, 'e3', 'updated') });
}

const CHECKS = {
  coa_corpus_total,
  coa_corpus_linked_count,
  coa_corpus_unlinked_pct,
  coa_corpus_missing_normalized_count,
  coa_processed,
  tier_1a_exact,
  tier_1a_via_bridge,
  tier_1a_type_confirmed,
  tier_1a_type_tolerant,
  tier_1b_name_only,
  no_address_data,
  no_parcel_match,
  unmatched_coa_pct,
  coa_neighbourhood_coverage_pct,
  coa_geocoded_pct,
  centroid_outside_polygon_count,
  links_retracted,
  ghost_orphans_cleaned,
  coa_backfilled,
};

function buildMeta(ctx) {
  const c = corpus(ctx);
  return {
    duration_ms: ctx.elapsed_ms,
    coa_corpus_total: c.total,
    coa_corpus_linked_count: c.linked,
    coa_corpus_unlinked_count: Math.max(0, c.total - c.linked),
    coa_corpus_missing_normalized_count: m(ctx, 'coa_corpus_missing_normalized_count'),
    coa_processed: m(ctx, 'coa_processed'),
    tier_1a_exact: m(ctx, 'tier_1a_via_bridge') + m(ctx, 'tier_1a_parcels_exact'),
    tier_1a_via_bridge: m(ctx, 'tier_1a_via_bridge'),
    tier_1a_type_confirmed: m(ctx, 'tier_1a_type_confirmed'),
    tier_1a_type_tolerant: m(ctx, 'tier_1a_type_tolerant'),
    tier_1b_name_only: m(ctx, 'tier_1b_name_only'),
    no_address_data: m(ctx, 'no_address_data'),
    no_parcel_match: m(ctx, 'no_parcel_match'),
    neighbourhood_matched: m(ctx, 'eligible_linked_with_neighbourhood'),
    centroid_outside_polygon: m(ctx, 'centroid_outside_polygon'),
    links_inserted: written(ctx, 'e1', 'inserted'),
    links_updated: written(ctx, 'e1', 'updated'),
    links_retracted: written(ctx, 'e2', 'deleted'),
    ghost_deleted: written(ctx, 'e1', 'retracted'),
    coa_backfilled: written(ctx, 'e3', 'updated'),
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
  if (!ctx.matched) return { records_meta: {} };
  return { records_meta: buildMeta(ctx) };
}

module.exports = Object.assign(compute, {
  checks: CHECKS,
  buildMatchSql,
  primaryMatchBinds,
  classifyMatches,
  classifyFallback,
  buildMeta,
  CONFIG_KEYS,
});
