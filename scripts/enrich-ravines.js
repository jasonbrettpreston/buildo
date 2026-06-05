#!/usr/bin/env node
/**
 * Enrich Parcel Ravine Protection (Spec 59 §8d) — spatial-joins parcels.geom
 * against the ravines table (§8c) and writes the Chapter-658 flag + signed
 * distance + dataset lineage onto parcels via one set-based UPDATE (§11.1).
 * SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md (v1.2 §8d)
 *
 * Sibling of load-ravines.js (L6 — independent deployability), advisory lock 60
 * (L4b). Consumes the §8c producer's frozen records_meta.ravine_load contract.
 */
'use strict';

const pipeline = require('./lib/pipeline');

const ADVISORY_LOCK_ID = 60; // L4b (verified unassigned)
// The §8c producer, read via the L18 cross-run contract. The chain records the
// load step as 'sources:load_ravines' (run-chain.js:253) — NOT the spec §9 literal
// 'source-ravines', which is stale (review_followups #409).
const PRODUCER_NAME = 'sources:load_ravines';
const SPEC_VERSION = '1.2'; // L10
const TAG = '[enrich-ravines]';

// Coverage gate: a real spatial join populates ravine_distance_m for every
// geom-bearing parcel (ravines is non-empty per L14), so this should be ~100%.
const DISTANCE_COVERAGE_PASS_PCT = 95;
const DISTANCE_COVERAGE_WARN_PCT = 90;

// ---------------------------------------------------------------------------
// Consumer read protocol (§9 / L18) — DEC-C. HALTs on any bad producer state.
// ---------------------------------------------------------------------------
async function readRavineContract(pool) {
  const res = await pool.query(
    `SELECT records_meta FROM pipeline_runs
      WHERE pipeline = $1 AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1`,
    [PRODUCER_NAME],
  );
  if (res.rows.length === 0) {
    throw new Error(`${TAG} no successful ${PRODUCER_NAME} run — cannot enrich without a versioned source dataset`);
  }
  const rl = (res.rows[0].records_meta || {}).ravine_load || {};
  if (rl.spec_version !== SPEC_VERSION) {
    throw new Error(`${TAG} ${PRODUCER_NAME}.spec_version=${rl.spec_version} !== ${SPEC_VERSION} — aborting to prevent contract violation`);
  }
  // Defense-in-depth (§9 step 3): a 'completed' run should already have these clean;
  // these fire only in pipeline_runs tracking edge-cases (manual status overrides).
  if (rl.delete_skipped_empty_guard === true) {
    throw new Error(`${TAG} producer delete_skipped_empty_guard=true — ravines may contain stale orphans; aborting`);
  }
  if (rl.drift_check_passed === false || rl.mass_delete_check_passed === false) {
    throw new Error(`${TAG} producer drift/mass-delete check failed — aborting against churned ravines`);
  }
  // §9 step 3 (belt-and-suspenders): invalid-geometry threshold. A 'completed' load
  // can't normally breach L8 (the producer aborts pre-transaction), but guard against
  // a manual pipeline_runs status override that smuggled an incomplete dataset through.
  const featureCount = Number(rl.feature_count) || 0;
  const geomSkipped = Number(rl.invalid_geometry_skipped) || 0;
  if (featureCount > 0 && geomSkipped / featureCount > 0.05) {
    throw new Error(`${TAG} producer invalid_geometry_skipped ${geomSkipped}/${featureCount} > 5% — aborting against an incomplete ravines load`);
  }
  // §9 step 5 — source_dataset_version must be a non-empty lineage string.
  const sourceDatasetVersion = rl.source_dataset_version;
  if (!sourceDatasetVersion) {
    throw new Error(`${TAG} producer source_dataset_version is null/empty — cannot stamp lineage`);
  }
  return { sourceDatasetVersion };
}

// L14 empty-ravines guard — never run the UPDATE against an empty source (would
// NULL-out / reset every parcel's enrichment). Reused by assertPreconditions AND the
// pre-skip path in main() so the invariant holds on BOTH branches (a wiped ravines table
// must HALT even when matching version stamps would otherwise satisfy the #418 skip — Gemini).
async function assertRavinesNonEmpty(db) {
  const cnt = await db.query('SELECT COUNT(*)::int AS n FROM ravines');
  if (cnt.rows[0].n === 0) {
    throw new Error(`${TAG} ravines table is empty — aborting to avoid resetting all parcels' enrichment (L14)`);
  }
}

// DEC-E — fail clearly if migration 168's lineage column is absent, instead of a cryptic
// 42703 from the #418 staleCount query.
async function assertVersionColumn(db) {
  const res = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'parcels' AND column_name = 'ravine_dataset_version_when_enriched'`,
  );
  if (res.rows.length === 0) {
    throw new Error(`${TAG} parcels.ravine_dataset_version_when_enriched missing — migration 168 not applied`);
  }
}

// #418 Layer-1 — cheap full-table COUNT (no KNN) of geom-bearing parcels not yet enriched
// against this exact ravines version. 0 ⇒ every parcel is current ⇒ the per-parcel KNN is a
// guaranteed no-op ⇒ SKIP the whole transaction.
async function countStale(db, sourceDatasetVersion) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM parcels
      WHERE geom IS NOT NULL AND ravine_dataset_version_when_enriched IS DISTINCT FROM $1`,
    [sourceDatasetVersion],
  );
  return res.rows[0].n;
}

// ---------------------------------------------------------------------------
// Preconditions (DEC-F + §3.10 SRID + L14) — non-viable spatial join without these.
// ---------------------------------------------------------------------------
async function assertPreconditions(client) {
  const pg = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
  if (pg.rows.length === 0) throw new Error(`${TAG} PostGIS not installed — cannot run the ravine spatial join`);

  const idx = async (name) =>
    (await client.query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [name])).rows.length > 0;
  if (!(await idx('idx_parcels_geom_gist'))) {
    throw new Error(`${TAG} no idx_parcels_geom_gist (migration 039) — refusing a sequential-scan join`);
  }
  if (!(await idx('idx_ravines_geom_gist'))) {
    throw new Error(`${TAG} no idx_ravines_geom_gist (planar, migration 167) — ST_Intersects would seq-scan`);
  }
  if (!(await idx('idx_ravines_geog_gist'))) {
    throw new Error(`${TAG} no idx_ravines_geog_gist (geography, migration 167) — <-> nearest-neighbor would seq-scan`);
  }
  // §3.10 SRID guard — both layers must be 4326 (no ST_Transform path).
  const srid = await client.query("SELECT Find_SRID('public', 'parcels', 'geom') AS srid");
  if (Number(srid.rows[0].srid) !== 4326) {
    throw new Error(`${TAG} parcels.geom SRID is ${srid.rows[0].srid}, expected 4326`);
  }
  // L14 empty-ravines guard (shared with the main() pre-skip path).
  await assertRavinesNonEmpty(client);
}

// §11.1 set-based UPDATE — the index-accelerated LATERAL form (L13's prose).
// PERF (critical): the spec §11.1 *code block* inlines ST_Centroid(p.geom)::geography
// inside a correlated subquery's ORDER BY — that computed expression does NOT bind
// the geography-GIST KNN, so each of ~486K parcels seq-scans all ~854 ravines
// (~415M geography-distance calcs, measured at ~2h+ with 0 progress). Fix: materialize
// the centroid as a stored value (parcel_c.cg), then a LEFT JOIN LATERAL whose
// `pc.cg <-> r.geom::geography` binds idx_ravines_geog_gist as a per-row constant.
// ST_Intersects uses the planar idx_ravines_geom_gist. Semantically EQUIVALENT to the
// intent of §11.1 + L2 (boolean = any-intersect; distance = nearest × sign; 0 inside) but
// implemented for index performance — the spec's inline-correlated form is pathologically
// slow. Equivalence verified on live data (0 mismatches). $1 = source_dataset_version.
//
// #418 Layer-2 scoping: parcel_c is restricted to geom-bearing parcels that are STALE
// against this exact ravines version (NULL/older stamp). In steady state nothing is stale
// (Layer-1 skip never reaches the UPDATE); a ravines refresh bumps every stamp → all stale
// → full recompute (paid once per refresh); a handful of newly-geocoded / geom-changed
// parcels (their stamp NULLed by load-parcels — DEC-FENCE2) KNN only themselves, not all 486K.
// Correctness rests on the stamp going stale on BOTH a ravines-version bump AND a parcel-geom
// change; the inner IS DISTINCT FROM triple-guard (§8d no-op-write fence) is KEPT.
const ENRICH_SQL = `
WITH parcel_c AS MATERIALIZED (
  SELECT p.id AS parcel_id, p.geom, ST_Centroid(p.geom)::geography AS cg
    FROM parcels p
   WHERE p.geom IS NOT NULL
     AND p.ravine_dataset_version_when_enriched IS DISTINCT FROM $1   -- #418 stale-only scope
),
enrichment AS (
  SELECT
    pc.parcel_id,
    ex.new_in_ravine,
    nn.dist * CASE WHEN ex.new_in_ravine THEN -1 ELSE 1 END AS new_distance_m
  FROM parcel_c pc
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM ravines r WHERE ST_Intersects(pc.geom, r.geom)) AS new_in_ravine
  ) ex
  LEFT JOIN LATERAL (
    SELECT ST_Distance(pc.cg, r.geom::geography) AS dist
      FROM ravines r
  ORDER BY pc.cg <-> r.geom::geography      -- binds idx_ravines_geog_gist (cg is a per-row constant)
     LIMIT 1
  ) nn ON true
)
UPDATE parcels p
   SET is_in_ravine_protection_area         = e.new_in_ravine,
       ravine_distance_m                    = e.new_distance_m,
       ravine_dataset_version_when_enriched = $1
  FROM enrichment e
 WHERE p.id = e.parcel_id
   AND (p.is_in_ravine_protection_area IS DISTINCT FROM e.new_in_ravine
        OR p.ravine_distance_m            IS DISTINCT FROM e.new_distance_m
        OR p.ravine_dataset_version_when_enriched IS DISTINCT FROM $1);
`;

/** Engine — runs on the caller's transaction client. Returns the updated count. */
async function enrichRavines(client, { sourceDatasetVersion }) {
  const upd = await client.query(ENRICH_SQL, [sourceDatasetVersion]);
  return { updated: upd.rowCount };
}

/** Row-derived verdict cascade (Spec 47 §8.2). */
function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

// Coverage stats + audit-row emit — shared by BOTH the skip and recompute paths so the
// dashboard step always reports (never UNKNOWN) and the producer/consumer column contract is
// honored on a skip (Integration BUG). Coverage is RE-QUERIED live on every call so a
// pre-existing partial-coverage hole stays visible even when this run skips (Regression Guardian).
async function emitResults(pool, { sourceDatasetVersion, updated, skipped, t0 }) {
  // Coverage stats over geom-bearing parcels (denominator explicit — DeepSeek MED).
  const cov = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE geom IS NOT NULL)                                          AS geom_total,
      COUNT(*) FILTER (WHERE geom IS NOT NULL AND ravine_distance_m IS NOT NULL)         AS with_distance,
      COUNT(*) FILTER (WHERE is_in_ravine_protection_area)                               AS in_ravine,
      COUNT(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom))                  AS invalid_geom
    FROM parcels`);
  const c = cov.rows[0];
  const geomTotal = Number(c.geom_total);
  const withDistance = Number(c.with_distance);
  const inRavine = Number(c.in_ravine);
  const invalidGeom = Number(c.invalid_geom);
  const distancePct = geomTotal ? Math.round((1000 * withDistance) / geomTotal) / 10 : 0;

  const auditRows = [];
  auditRows.push({
    metric: 'parcels_with_ravine_distance_pct', value: distancePct,
    status: distancePct >= DISTANCE_COVERAGE_PASS_PCT ? 'PASS'
      : distancePct >= DISTANCE_COVERAGE_WARN_PCT ? 'WARN' : 'FAIL',
  });
  auditRows.push({ metric: 'parcels_in_ravine_count', value: inRavine, status: 'INFO' });
  // Root-cause signal for any distance-coverage drop: a degenerate parcel geom yields a
  // NULL centroid → NULL distance → counts as not-enriched (Gemini/DeepSeek MED). Live data = 0.
  auditRows.push({ metric: 'parcels_invalid_geom_count', value: invalidGeom, status: 'INFO' });
  auditRows.push({ metric: 'parcels_enriched_count', value: updated, status: 'INFO' });
  // #418 — whether this run took the Layer-1 skip (steady state) or recomputed (post-refresh).
  auditRows.push({ metric: 'parcels_ravine_enrich_skipped', value: skipped, status: 'INFO' });
  auditRows.push({ metric: 'ravine_source_dataset_version', value: sourceDatasetVersion, status: 'INFO' });
  auditRows.push({ metric: 'enrich_ravines_duration_ms', value: Date.now() - t0, status: 'INFO' });

  pipeline.emitSummary({
    records_total: null, // Enrich archetype — does not create rows (Spec 47 §11)
    records_new: null,
    records_updated: updated,
    records_meta: {
      audit_table: {
        phase: ADVISORY_LOCK_ID,
        name: 'Parcel ravine enrichment',
        verdict: verdictCascade(auditRows),
        rows: auditRows,
      },
    },
  });

  // §9 — lead_id is NOT read here (it's an §8e concern); reads are id + geom only.
  pipeline.emitMeta(
    { ravines: ['geom'], parcels: ['id', 'geom'] },
    { parcels: ['is_in_ravine_protection_area', 'ravine_distance_m', 'ravine_dataset_version_when_enriched'] },
  );

  pipeline.log.info(TAG, skipped
    ? `skip — all geom-bearing parcels already enriched at ravine version ${sourceDatasetVersion} (in_ravine ${inRavine}, distance coverage ${distancePct}%)`
    : `enriched ${updated} parcels (in_ravine ${inRavine}, distance coverage ${distancePct}%)`);
}

async function main(pool) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();

    // §9/L18 consumer protocol — HALTs on missing/failed/stale producer.
    const { sourceDatasetVersion } = await readRavineContract(pool);

    // DEC-E — migration-168 lineage column must exist before the staleCount query.
    await assertVersionColumn(pool);
    // L14 holds on BOTH paths (Gemini): a wiped ravines table must HALT even when matching
    // version stamps would otherwise satisfy the #418 skip below.
    await assertRavinesNonEmpty(pool);

    // #418 Layer-1 incremental skip — if no geom-bearing parcel is stale against this exact
    // ravines version, the per-parcel KNN is a guaranteed no-op: skip the transaction entirely.
    // The skip path STILL emits coverage + summary + meta (shared emitResults) so the dashboard
    // step is never UNKNOWN and the producer/consumer column contract holds (Integration BUG).
    const staleCount = await countStale(pool, sourceDatasetVersion);
    if (staleCount === 0) {
      await emitResults(pool, { sourceDatasetVersion, updated: 0, skipped: true, t0 });
      return { ok: true };
    }

    // Layer-2 — recompute, scoped (parcel_c filters on version) to the stale parcels only.
    let result;
    await pipeline.withTransaction(pool, async (client) => {
      await assertPreconditions(client);
      result = await enrichRavines(client, { sourceDatasetVersion });
    });

    await emitResults(pool, { sourceDatasetVersion, updated: result.updated, skipped: false, t0 });
    return { ok: true };
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP already
}

if (require.main === module) {
  pipeline.run('enrich-ravines', main);
}

module.exports = {
  ADVISORY_LOCK_ID,
  PRODUCER_NAME,
  ENRICH_SQL,
  readRavineContract,
  assertPreconditions,
  assertRavinesNonEmpty,
  assertVersionColumn,
  countStale,
  enrichRavines,
  emitResults,
  verdictCascade,
};
