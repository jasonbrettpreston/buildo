'use strict';
/**
 * COMPUTE for `enrich_heritage` (Spec 122 §5.5; batch-2 row 2.2).
 *
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8d, §9, §11.1
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §11 (Counter Semantic Contract)
 *
 * Rule 2 — COMPUTE IS JUST COMPUTE. No pool creation outside the declared hooks the runner
 * calls, no logging, no `process.env`, no wall clock, no verdict derivation, no thresholds.
 * Every number this module produces is MEASURED; every judgement about it is made by the
 * library from the descriptor.
 *
 * ONE PHASE, ONE STATEMENT (`execution.phases` has exactly one entry, `heritage_join`, inside
 * the shared transaction). Spatial-joins parcels.geom against heritage_properties (Part IV
 * individual) and heritage_districts (Part V HCD) and writes the designation flag + type + date
 * + dataset lineage stamp, scoped to eligible parcels whose lineage stamp is stale against the
 * producer's current combined source_dataset_version (H-A1 (a) — Layer-2 subsumes the
 * pre-conversion #418 Layer-1 cheap-COUNT early return, which is RETIRED as a mechanism —
 * deviations[] in the descriptor).
 */

// ===========================================================================
// §9 consumer protocol — the pre-transaction HALT, resolved as
// `execution.enrich_hooks.contract_read`. Called by the runner ABOVE the phase loop, before
// any transaction opens, on the step's own pool (not a txn client).
// ===========================================================================

const PRODUCER_NAME = 'sources:load_heritage';
const SPEC_VERSION = '1.1'; // L10
const TAG = '[enrich_heritage]';

/**
 * §9 producer-protocol HALT, ported verbatim (9 throws, all before any transaction): producer
 * missing, spec_version mismatch, either sub-block missing, either feature_count <= 0, either
 * drift_check_passed === false, either source_dataset_version empty. Combines the two lineage
 * strings deterministically as `<register>|<districts>`.
 *
 * L14 (folded in here, RV-L2 precedent) — a wiped heritage source must HALT even when matching
 * version stamps would otherwise satisfy the write's own zero-scope fast path.
 *
 * The SRID=4326 assertion (§3.10 half of F3/F4) — REQUIREMENT_PROBES has no "srid" kind, so this
 * one clause cannot move to guards.requires and is folded in here instead.
 */
async function readHeritageContract(pool) {
  const res = await pool.query(
    `SELECT records_meta FROM pipeline_runs
      WHERE pipeline = $1 AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1`,
    [PRODUCER_NAME],
  );
  if (res.rows.length === 0) {
    throw new Error(`${TAG} no successful ${PRODUCER_NAME} run — cannot enrich without a versioned heritage source`);
  }
  const hl = (res.rows[0].records_meta || {}).heritage_load || {};
  if (hl.spec_version !== SPEC_VERSION) {
    throw new Error(`${TAG} ${PRODUCER_NAME}.spec_version=${hl.spec_version} !== ${SPEC_VERSION} — aborting to prevent contract violation`);
  }
  const reg = hl.heritage_register;
  const hcd = hl.heritage_districts;
  if (!reg) throw new Error(`${TAG} producer records_meta.heritage_load.heritage_register sub-block is missing — aborting`);
  if (!hcd) throw new Error(`${TAG} producer records_meta.heritage_load.heritage_districts sub-block is missing — aborting`);
  if (!(Number(reg.feature_count) > 0)) {
    throw new Error(`${TAG} heritage_register dataset ingested zero features; refusing to enrich`);
  }
  if (!(Number(hcd.feature_count) > 0)) {
    throw new Error(`${TAG} heritage_districts dataset ingested zero features; refusing to enrich`);
  }
  if (reg.drift_check_passed === false || hcd.drift_check_passed === false) {
    throw new Error(`${TAG} producer drift_check_passed=false — aborting against a churned heritage source`);
  }
  if (!reg.source_dataset_version) throw new Error(`${TAG} heritage_register.source_dataset_version is null/empty — cannot stamp lineage`);
  if (!hcd.source_dataset_version) throw new Error(`${TAG} heritage_districts.source_dataset_version is null/empty — cannot stamp lineage`);

  // L14 — both heritage source tables must be non-empty on EVERY invocation.
  const hp = await pool.query('SELECT COUNT(*)::int AS n FROM heritage_properties');
  const hd = await pool.query('SELECT COUNT(*)::int AS n FROM heritage_districts');
  if (hp.rows[0].n === 0) throw new Error(`${TAG} heritage_properties is empty — aborting (L14)`);
  if (hd.rows[0].n === 0) throw new Error(`${TAG} heritage_districts is empty — aborting (L14)`);

  // §3.10 SRID guard — parcels.geom must be 4326 (no ST_Transform path in this compute).
  const srid = await pool.query("SELECT Find_SRID('public', 'parcels', 'geom') AS srid");
  if (Number(srid.rows[0].srid) !== 4326) {
    throw new Error(`${TAG} parcels.geom SRID is ${srid.rows[0].srid}, expected 4326`);
  }

  const datasetVersion = `${reg.source_dataset_version}|${hcd.source_dataset_version}`;
  return { datasetVersion };
}

// ===========================================================================
// PHASE — `heritage_join`. Class N (`set_based_join_update`), executed through `ctx.joinUpdate`,
// whose executor structurally refuses any statement text containing INSERT INTO / ON CONFLICT.
// ===========================================================================

/**
 * §11.1 set-based UPDATE, PORTED BYTE-FOR-BYTE except the ONE declared Layer-2 scope conjunct
 * added to parcel_c under H-A1 (a), RULED. CONTAINMENT match (live-validation finding,
 * 2026-06-04): Part V HCD = ST_Intersects(parcel, hcd_polygon); Part IV individual =
 * ST_Intersects(parcel, heritage_point) — the parcel that CONTAINS the point (NOT the spec's
 * ST_DWithin(50m)+levenshtein, which over-matched 4x). L12: Part IV wins over Part V HCD.
 * `$1` = levenshtein tiebreak threshold, `$2` = combined source_dataset_version.
 *
 * H-A1 (a) Layer-2 scoping: `parcel_c` is restricted to eligible parcels (geom non-null,
 * non-empty, valid — the wedge-open-trap eligibility, mirrored from the legacy countStale probe
 * so the 16 invalid-geom parcels are excluded from scope exactly as they are excluded from the
 * write) that are STALE against this exact heritage version. The inner 4-column IS DISTINCT FROM
 * guard is KEPT — it is what makes a second run against an unchanged heritage version write 0
 * rows, since the Layer-1 early-return mechanism itself is retired (deviations[]).
 */
/**
 * H-A1 (a) — `full` selects the UNSCOPED form (the stale-only conjunct dropped, mirroring the
 * legacy's own forceFull -> staleCount=1 -> "re-evaluate everything" escape hatch): the ONLY
 * remaining way to widen scope beyond the Layer-2 predicate, and the FOLD-I5 remedy for a
 * levenshtein-threshold or address-only change that no longer re-stales on its own. Mirrors
 * enrich_parcels' buildPass1ScopeWhere({full}) pattern exactly: `full ? 'TRUE' : <predicate>`.
 */
function buildEnrichSql({ full = false } = {}) {
  const staleConjunct = full
    ? ''
    : '\n    AND p.heritage_dataset_version_when_enriched IS DISTINCT FROM $2          -- H-A1 (a) Layer-2 stale-only scope';
  return `
WITH parcel_c AS MATERIALIZED (
  SELECT
    p.id AS parcel_id,
    p.geom,
    NULLIF(normalize_address(concat_ws(' ', p.addr_num_normalized, p.street_name_normalized, p.street_type_normalized)), '') AS norm_addr
  FROM parcels p
  WHERE p.geom IS NOT NULL AND NOT ST_IsEmpty(p.geom) AND ST_IsValid(p.geom)   -- eligibility (wedge-open trap)${staleConjunct}
),
enrichment AS (
  SELECT
    pc.parcel_id,
    pv.hcd_id, pv.hcd_date,
    piv.hp_id, piv.hp_date
  FROM parcel_c pc
  LEFT JOIN LATERAL (
    SELECT hd.id AS hcd_id, hd.designated_date AS hcd_date
      FROM heritage_districts hd
     WHERE ST_Intersects(pc.geom, hd.geom)
     ORDER BY hd.id ASC
     LIMIT 1
  ) pv ON true
  LEFT JOIN LATERAL (
    SELECT hp.id AS hp_id, hp.designated_date AS hp_date
      FROM heritage_properties hp
     WHERE hp.status = 'part_iv'
       AND ST_Intersects(pc.geom, hp.geom)
     ORDER BY
       CASE WHEN pc.norm_addr IS NOT NULL
                 AND levenshtein(pc.norm_addr, normalize_address(hp.address_text)) <= $1
            THEN 0 ELSE 1 END ASC,
       hp.id ASC
     LIMIT 1
  ) piv ON true
),
resolved AS (
  SELECT
    parcel_id,
    (hcd_id IS NOT NULL OR hp_id IS NOT NULL) AS new_designated,
    CASE
      WHEN hp_id  IS NOT NULL THEN 'part_iv_individual'
      WHEN hcd_id IS NOT NULL THEN 'part_v_hcd'
      ELSE NULL
    END AS new_type,
    CASE
      WHEN hp_id  IS NOT NULL THEN hp_date
      WHEN hcd_id IS NOT NULL THEN hcd_date
      ELSE NULL
    END AS new_date
  FROM enrichment
)
UPDATE parcels p
   SET is_heritage_designated                = r.new_designated,
       heritage_designation_type             = r.new_type,
       heritage_designation_date             = r.new_date,
       heritage_dataset_version_when_enriched = $2
  FROM resolved r
 WHERE p.id = r.parcel_id
   AND (p.is_heritage_designated    IS DISTINCT FROM r.new_designated
        OR p.heritage_designation_type IS DISTINCT FROM r.new_type
        OR p.heritage_designation_date IS DISTINCT FROM r.new_date
        OR p.heritage_dataset_version_when_enriched IS DISTINCT FROM $2);
`;
}

/** The default (incremental, H-A1 (a) Layer-2) form — the structural-test / documentation constant. */
const ENRICH_SQL = buildEnrichSql({ full: false });

/**
 * Phase `heritage_join`, `writes_ref` 0, inside the shared transaction.
 *
 * `ctx.contract` is the object `readHeritageContract` returned (the passCtx.contract seam,
 * landed batch-2 row 2.1). The returned key is `updated` (RV-D4's `seamOwned` guard has landed —
 * `scripts/lib/step/index.js`'s reconciliation loop owns `written[key].updated` by SEAM USE, not
 * by the pass's return-key spelling, so no key-name workaround is needed).
 *
 * `ctx.full` selects the unscoped form (H-A1 (a) — ENRICH_HERITAGE_FORCE_FULL, retained and
 * load-bearing; FOLD-I5's declared remedy for a levenshtein-threshold or address-only change
 * that no longer re-stales on its own under the Layer-2 predicate).
 */
async function runHeritageJoinPass(client, ctx) {
  const datasetVersion = ctx.contract.datasetVersion;
  const levenshteinThreshold = ctx.config.enrich_heritage_address_levenshtein_threshold;
  const sql = buildEnrichSql({ full: ctx.full });
  const updated = await ctx.joinUpdate(0, sql, [levenshteinThreshold, datasetVersion]);
  ctx.onProgress(updated);
  return { updated, datasetVersion };
}

// ===========================================================================
// STEP-LEVEL POST PHASE — `execution.enrich_hooks.post_phase`. Called ONCE by the runner,
// after the last phase and after COMMIT, on the step's own pool.
// ===========================================================================

/** Coverage stats, re-queried LIVE on every call (F7 — the dashboard step is never UNKNOWN). */
const COVERAGE_SQL = `
    SELECT
      COUNT(*) FILTER (WHERE is_heritage_designated)                                  AS designated,
      COUNT(*) FILTER (WHERE heritage_designation_type = 'part_iv_individual')        AS part_iv,
      COUNT(*) FILTER (WHERE heritage_designation_type = 'part_v_hcd')                AS part_v,
      COUNT(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom))               AS invalid_geom,
      (SELECT COUNT(*) FROM heritage_properties WHERE status = 'part_iv')             AS part_iv_source
    FROM parcels`;

/** L21 — Part IV source points NOT contained by any valid-geom parcel (the containment limitation). */
const UNLINKED_SQL = `
    SELECT COUNT(*)::int AS n FROM heritage_properties hp
     WHERE hp.status = 'part_iv'
       AND NOT EXISTS (SELECT 1 FROM parcels p WHERE p.geom IS NOT NULL AND ST_IsValid(p.geom) AND ST_Intersects(p.geom, hp.geom))`;

/** FOLD-RC1 — per-zone designated share, an INFO-only visibility row (no gating, no new tunables). */
const ZONE_SQL = `
    SELECT COALESCE(zoning_class, '(null)') AS zone, COUNT(*)::int AS parcels, COUNT(*) FILTER (WHERE is_heritage_designated)::int AS designated
      FROM parcels GROUP BY 1`;

const NAMED_ZONES = ['RD', 'R', 'RM', 'RS', 'CR', 'RT', 'RA', 'CRE'];

function buildZoneBuckets(rows) {
  const buckets = {};
  for (const z of NAMED_ZONES) buckets[z] = { parcels: 0, designated: 0 };
  buckets['(null)'] = { parcels: 0, designated: 0 };
  buckets.other = { parcels: 0, designated: 0 };
  for (const r of rows) {
    const zone = r.zone;
    const target = zone === '(null)' ? '(null)' : (NAMED_ZONES.includes(zone) ? zone : 'other');
    buckets[target].parcels += Number(r.parcels);
    buckets[target].designated += Number(r.designated);
  }
  return buckets;
}

/**
 * `matched` carries one entry per declared check id plus the raw scan population.
 * `compute` carries the three counter sources — `matched.compute.*` / `written.e1.*`, never a
 * bare `compute.*` (the ENRICHER null-counter trap).
 */
async function computePostPhase(pool, { passRaw }) {
  const join = passRaw.heritage_join || {};
  const updated = Number(join.updated || 0);
  const datasetVersion = join.datasetVersion;

  const cov = await pool.query(COVERAGE_SQL);
  const c = cov.rows[0];
  const designated = Number(c.designated);
  const partIv = Number(c.part_iv);
  const partV = Number(c.part_v);
  const invalidGeom = Number(c.invalid_geom);
  const partIvSource = Number(c.part_iv_source);

  const unl = await pool.query(UNLINKED_SQL);
  const unmatchedPoints = Number(unl.rows[0].n);
  const unmatchedPct = partIvSource > 0 ? Math.round((1000 * unmatchedPoints) / partIvSource) / 10 : 0;

  const zoneRows = await pool.query(ZONE_SQL);
  const byZone = buildZoneBuckets(zoneRows.rows);

  // FOLD-RC1 identity — a visibility row that can silently drop population is the same
  // blindness it exists to close. Σ(buckets.designated) MUST equal the audit table's own
  // parcels_heritage_designated_count (the same scan, never a parallel count): the 10 buckets
  // (8 named zones + '(null)' + 'other') are a total partition of every zoning_class value, so
  // this is a real identity, not an approximation. A mismatch is a compute defect (a join or
  // bucketing bug), not an upstream data condition, and reddens the run rather than silently
  // rendering a wrong number.
  const zoneDesignatedSum = Object.values(byZone).reduce((n, z) => n + z.designated, 0);
  if (zoneDesignatedSum !== designated) {
    throw new Error(
      `[enrich_heritage] heritage_designated_by_zone identity broke: Σ buckets.designated (${zoneDesignatedSum}) !== `
      + `parcels_heritage_designated_count (${designated}) — a zone-bucketing defect, not a data condition.`,
    );
  }

  // F9 — re-derived from the write count, since the Layer-1 skip BRANCH is retired.
  const skipped = updated === 0;

  // eligible_parcels_scanned — the scan population parcel_c's eligibility clause admits, TOTAL
  // (not scoped by staleness), matching enrich_ravines'/enrich_parcels' A4-ruled counters.compute
  // convention: "the scanned population" reads the whole eligible fleet, not just the stale slice.
  const eligible = await pool.query(
    `SELECT COUNT(*)::int AS n FROM parcels WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom)`,
  );
  const eligibleScanned = Number(eligible.rows[0].n);

  return {
    matched: {
      parcels_heritage_designated_count: designated,
      parcels_part_iv_count: partIv,
      parcels_part_v_hcd_count: partV,
      heritage_part_iv_source_count: partIvSource,
      heritage_points_no_parcel_match: unmatchedPct,
      parcels_invalid_geom_count: invalidGeom,
      parcels_enriched_count: updated,
      parcels_heritage_enrich_skipped: skipped,
      heritage_source_dataset_version: datasetVersion,
      // FOLD-RC1 — emits[].heritage_designated_by_zone. Only `matched`/`compute` survive the
      // runner's postPhase contract (`{matched?, compute?}`), so the zone buckets travel inside
      // `matched` and buildHeritageMeta reads them back off `ctx.matched` below.
      heritage_designated_by_zone: byZone,
    },
    compute: {
      eligible_parcels_scanned: eligibleScanned,
      records_new_aggregate: 0,
      records_updated_aggregate: updated,
    },
  };
}

// ===========================================================================
// Checks — one function per declared check, keys === descriptor.checks[].id in declaration
// order. Each reads `ctx.matched.<id>` and reports; none judges.
// ===========================================================================

function parcels_heritage_designated_count(ctx) {
  ctx.report('parcels_heritage_designated_count', { value: ctx.matched.parcels_heritage_designated_count });
}

function parcels_part_iv_count(ctx) {
  ctx.report('parcels_part_iv_count', { value: ctx.matched.parcels_part_iv_count });
}

function parcels_part_v_hcd_count(ctx) {
  ctx.report('parcels_part_v_hcd_count', { violations: 0, detail: ctx.matched.parcels_part_v_hcd_count });
}

function heritage_part_iv_source_count(ctx) {
  ctx.report('heritage_part_iv_source_count', { violations: 0, detail: ctx.matched.heritage_part_iv_source_count });
}

function heritage_points_no_parcel_match(ctx) {
  ctx.report('heritage_points_no_parcel_match', { value: ctx.matched.heritage_points_no_parcel_match });
}

function parcels_invalid_geom_count(ctx) {
  ctx.report('parcels_invalid_geom_count', { violations: 0, detail: ctx.matched.parcels_invalid_geom_count });
}

function parcels_enriched_count(ctx) {
  ctx.report('parcels_enriched_count', { violations: 0, detail: ctx.matched.parcels_enriched_count });
}

function parcels_heritage_enrich_skipped(ctx) {
  ctx.report('parcels_heritage_enrich_skipped', { violations: 0, detail: ctx.matched.parcels_heritage_enrich_skipped });
}

function heritage_source_dataset_version(ctx) {
  ctx.report('heritage_source_dataset_version', { violations: 0, detail: ctx.matched.heritage_source_dataset_version });
}

function enrich_heritage_duration_ms(ctx) {
  ctx.report('enrich_heritage_duration_ms', { violations: 0, detail: ctx.elapsed_ms });
}

const CHECKS = {
  parcels_heritage_designated_count,
  parcels_part_iv_count,
  parcels_part_v_hcd_count,
  heritage_part_iv_source_count,
  heritage_points_no_parcel_match,
  parcels_invalid_geom_count,
  parcels_enriched_count,
  parcels_heritage_enrich_skipped,
  heritage_source_dataset_version,
  enrich_heritage_duration_ms,
  // Note: the four invariants[] rows and the three plausibility[] rows (§7) are declared in the
  // descriptor's invariants[]/plausibility[] arrays, not checks[] — executed generically by
  // scripts/lib/step/plausibility.js against their own declared `sql`, never through this table.
};

// ===========================================================================
// records_meta
// ===========================================================================

/** The step's `records_meta` block — matches the three `emits[]`-declared extra keys exactly. */
function buildHeritageMeta(ctx) {
  return {
    duration_ms: ctx.elapsed_ms,
    code_version: ctx.descriptor.staleness.logic_version,
    heritage_designated_by_zone: (ctx.matched && ctx.matched.heritage_designated_by_zone) || {},
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
  return { records_meta: buildHeritageMeta(ctx) };
}

// The declared phase order — names MUST match `execution.phases[].name`, in order.
const passes = [
  { name: 'heritage_join', txn: 'shared', run: runHeritageJoinPass },
];

module.exports = Object.assign(compute, {
  checks: CHECKS,
  ENRICH_SQL,
  buildEnrichSql,
  COVERAGE_SQL,
  UNLINKED_SQL,
  ZONE_SQL,
  buildZoneBuckets,
  readHeritageContract,
  runHeritageJoinPass,
  computePostPhase,
  buildHeritageMeta,
  passes,
  PRODUCER_NAME,
  SPEC_VERSION,
});
