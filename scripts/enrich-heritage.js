#!/usr/bin/env node
/**
 * Enrich Parcel Heritage Designation (Spec 61 §8d) — spatial-joins parcels.geom
 * against the §8c heritage tables and writes is_heritage_designated +
 * heritage_designation_type (Part IV / Part V HCD) + heritage_designation_date +
 * dataset lineage onto parcels via one set-based UPDATE (§11.1).
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (v1.1 §8d)
 *
 * Sibling of load-heritage.js (advisory lock 62). Consumes the §8c producer's
 * frozen records_meta.heritage_load contract (per-dataset sub-blocks).
 *
 * Match (CONTAINMENT — live-validation finding, supersedes the spec's §11.1 radius):
 * Part V HCD = ST_Intersects(parcel, hcd_polygon); Part IV individual = ST_Intersects(
 * parcel, heritage_point) — the parcel that CONTAINS the point. The spec's Part IV
 * ST_DWithin(50m)+levenshtein over-matched 4× (tagged ~4 neighbours of every point), so
 * containment is used instead (precision over recall; ~10% of Part IV points fall outside
 * any parcel and are unmatched — surfaced as heritage_points_no_parcel_match). Both bind
 * planar GISTs; no centroid/KNN needed. L12: Part IV wins over Part V HCD. See review_followups #424.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
const { z } = require('zod');

const ADVISORY_LOCK_ID = 62; // DEC-A (sibling of load-heritage=61; spec L4b=63 stale). 62 verified free.
const PIPELINE_NAME = 'sources:enrich_heritage'; // chain-scoped (run-chain.js:253)
const PRODUCER_NAME = 'sources:load_heritage';    // §8c chain-scoped slug (DEC-C; NOT spec's 'source-heritage')
const SPEC_VERSION = '1.1'; // L10 — consumer pins on the §8c producer's spec_version
const TAG = '[enrich-heritage]';

// D#4 (B3 output-panel remediation) — escape hatch (LINK_MASSING_FORCE_FULL /
// COMPUTE_PARCEL_COST_FORCE_FULL precedent): forces a real recompute past the
// #418 Layer-1 staleCount skip even when it would otherwise SKIP. Before this
// commit, enrich-heritage.js had no operator override if the skip misfired.
const FORCE_FULL_ENV = 'ENRICH_HERITAGE_FORCE_FULL';

const ConfigSchema = z.object({
  // heritage_point_match_radius_m (spec §12.3a) intentionally NOT consumed: the live-validation
  // finding switched Part IV from a radius match to containment (ST_Intersects), so there is no
  // radius parameter. Left out of the schema rather than declared-and-ignored.
  heritageAddressLevenshteinThreshold: z.number().int().nonnegative().default(2), // tiebreak when a parcel contains >1 Part IV point
  // L21 heritage_points_no_parcel_match thresholds. Spec §12.3a seeds 0.05/0.20, but those assumed
  // the radius match (~0% unmatched); under containment ~10% of Part IV points legitimately fall
  // outside any parcel, so the defaults are calibrated above that baseline → INFO at steady state,
  // escalating only on real regression (review_followups #424).
  heritageUnlinkedPointWarnPct: z.number().default(0.15),
  heritageUnlinkedPointFailPct: z.number().default(0.30),
});

// ---------------------------------------------------------------------------
// Consumer read protocol (§9 / L23, 2-dataset) — HALTs on any bad producer state.
// ---------------------------------------------------------------------------
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
  // Defensive sub-block guards (DeepSeek MED) — clean FAIL, never a raw TypeError.
  const reg = hl.heritage_register;
  const hcd = hl.heritage_districts;
  if (!reg) throw new Error(`${TAG} producer records_meta.heritage_load.heritage_register sub-block is missing — aborting`);
  if (!hcd) throw new Error(`${TAG} producer records_meta.heritage_load.heritage_districts sub-block is missing — aborting`);
  // Per-table feature_count (C-v1.1.3) — distinct messages for operator triage.
  if (!(Number(reg.feature_count) > 0)) {
    throw new Error(`${TAG} heritage_register dataset ingested zero features; refusing to enrich`);
  }
  if (!(Number(hcd.feature_count) > 0)) {
    throw new Error(`${TAG} heritage_districts dataset ingested zero features; refusing to enrich`);
  }
  // Per-table drift guard (explicit-false sentinel; null/undefined passes).
  if (reg.drift_check_passed === false || hcd.drift_check_passed === false) {
    throw new Error(`${TAG} producer drift_check_passed=false — aborting against a churned heritage source`);
  }
  // §9 step 5 — both lineage strings must be present; combine deterministically.
  if (!reg.source_dataset_version) throw new Error(`${TAG} heritage_register.source_dataset_version is null/empty — cannot stamp lineage`);
  if (!hcd.source_dataset_version) throw new Error(`${TAG} heritage_districts.source_dataset_version is null/empty — cannot stamp lineage`);
  const datasetVersion = `${reg.source_dataset_version}|${hcd.source_dataset_version}`;
  return { datasetVersion };
}

// L14 — never run against an empty heritage source (would reset every parcel's
// enrichment). Shared by assertPreconditions (Layer-2 recompute path) AND the
// #418 pre-skip path in main() so the invariant holds on BOTH branches — a
// wiped heritage_properties/heritage_districts table must HALT even when
// matching version stamps would otherwise satisfy the #418 skip below
// (enrich-ravines.js precedent, Gemini finding carried over verbatim).
async function assertHeritageSourceNonEmpty(db) {
  const hp = await db.query('SELECT COUNT(*)::int AS n FROM heritage_properties');
  const hd = await db.query('SELECT COUNT(*)::int AS n FROM heritage_districts');
  if (hp.rows[0].n === 0) throw new Error(`${TAG} heritage_properties is empty — aborting (L14)`);
  if (hd.rows[0].n === 0) throw new Error(`${TAG} heritage_districts is empty — aborting (L14)`);
}

// Commit C (B3 output-panel remediation) — fail clearly if migration 171's
// lineage column is absent, instead of a cryptic 42703 from the #418
// countStale query below. enrich-ravines.js:82 (assertVersionColumn, DEC-E)
// added exactly this guard BECAUSE countStale moves a column read ahead of
// assertPreconditions — without it, a missing column throws a raw pg 42703
// ("column ... does not exist") instead of a clear "migration N not applied"
// message. The 74653a8f commit body claimed this mechanism was "ported
// verbatim from enrich-ravines.js" — it was NOT: enrich-ravines.js HAS this
// guard and enrich-heritage.js (until this commit) did not.
async function assertVersionColumn(db) {
  const res = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'parcels' AND column_name = 'heritage_dataset_version_when_enriched'`,
  );
  if (res.rows.length === 0) {
    throw new Error(`${TAG} parcels.heritage_dataset_version_when_enriched missing — migration 171 not applied`);
  }
}

// Phase B B3 — #418 Layer-1 (ported from enrich-ravines.js's countStale): cheap
// full-table COUNT (no spatial join) of ELIGIBLE geom-bearing parcels not yet
// enriched against this exact heritage dataset version. 0 ⇒ every eligible
// parcel is current ⇒ the spatial join is a guaranteed no-op ⇒ SKIP.
//
// ⛔ THE WEDGE-OPEN TRAP (B3 grounding fold, live-grounded): ENRICH_SQL's
// parcel_c CTE (:143 below) excludes invalid/empty geometries — 16 parcels,
// live-measured — that can therefore NEVER be stamped by the UPDATE. A naive
// port of ravines' `WHERE geom IS NOT NULL` probe would count those 16 as
// permanently stale FOREVER, so staleCount would NEVER reach 0 and this skip
// branch would be dead code behind a green suite (every hand-built fixture
// happens to use valid geometry, so the trap never fires in tests unless a
// fixture deliberately includes an invalid one). The fix: this probe MIRRORS
// ENRICH_SQL's full eligibility predicate (NOT ST_IsEmpty + ST_IsValid) so the
// 16 excluded parcels are excluded from the denominator here exactly as they
// are excluded from the UPDATE itself — they can neither force a stale count
// nor silently satisfy one; they are simply out of scope for this gate, same
// as they are out of scope for the enrichment.
async function countStale(db, datasetVersion) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM parcels
      WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom)
        AND heritage_dataset_version_when_enriched IS DISTINCT FROM $1`,
    [datasetVersion],
  );
  return res.rows[0].n;
}

// ---------------------------------------------------------------------------
// Preconditions (DEC-F) — non-viable spatial join without these.
// ---------------------------------------------------------------------------
async function assertPreconditions(client) {
  const pg = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
  if (pg.rows.length === 0) throw new Error(`${TAG} PostGIS not installed — cannot run the heritage spatial join`);
  const fz = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'fuzzystrmatch'");
  if (fz.rows.length === 0) throw new Error(`${TAG} fuzzystrmatch not installed (migration 170) — levenshtein() unavailable`);
  const fn = await client.query("SELECT 1 FROM pg_proc WHERE proname = 'normalize_address'");
  if (fn.rows.length === 0) throw new Error(`${TAG} normalize_address() function missing (migration 170)`);

  const idx = async (name) =>
    (await client.query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [name])).rows.length > 0;
  if (!(await idx('idx_parcels_geom_gist'))) throw new Error(`${TAG} no idx_parcels_geom_gist (migration 039) — refusing a sequential-scan join`);
  if (!(await idx('idx_heritage_districts_geom_gist'))) throw new Error(`${TAG} no idx_heritage_districts_geom_gist (migration 170) — Part V ST_Intersects would seq-scan`);
  if (!(await idx('idx_heritage_properties_geom_gist'))) throw new Error(`${TAG} no idx_heritage_properties_geom_gist (migration 170) — Part IV ST_Intersects would seq-scan`);

  // M-2 columns must exist (else the UPDATE crashes with "column does not exist"; DeepSeek HIGH / L24).
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'parcels'
        AND column_name IN ('is_heritage_designated','heritage_designation_type','heritage_designation_date','heritage_dataset_version_when_enriched')`,
  );
  if (cols.rows.length < 4) {
    throw new Error(`${TAG} parcels heritage columns missing (migration 171 not applied) — found ${cols.rows.length}/4`);
  }

  // §3.10 SRID guard — parcels must be 4326 (no ST_Transform path).
  const srid = await client.query("SELECT Find_SRID('public', 'parcels', 'geom') AS srid");
  if (Number(srid.rows[0].srid) !== 4326) {
    throw new Error(`${TAG} parcels.geom SRID is ${srid.rows[0].srid}, expected 4326`);
  }
  // L14 empty-heritage-source guard (shared with the main() pre-skip path).
  await assertHeritageSourceNonEmpty(client);
}

// §11.1 set-based UPDATE — CONTAINMENT match (live-validation finding, 2026-06-04).
// The spec's Part IV ST_DWithin(50m) over-matched 4× (6,217 parcels vs 1,549 source points —
// a 50m radius around each parcel centroid grabbed ~4 neighbours of every heritage point). For
// a regulatory flag, false positives (tagging non-heritage parcels) are worse than missing the
// ~10% of points that fall outside any parcel, so Part IV matches the parcel that CONTAINS the
// point: ST_Intersects(pc.geom, hp.geom) — exactly one parcel per point, binds the planar
// idx_heritage_properties_geom_gist. Part V HCD = ST_Intersects(pc.geom, hd.geom) (planar
// idx_heritage_districts_geom_gist). No centroid / geography-KNN needed (the Spec 59 §8d trap is
// moot under containment). L12: Part IV wins. levenshtein = tiebreak only when a parcel contains
// >1 Part IV point. $1=lev_threshold, $2=dataset_version. Valid-geom parcels only (excluded rows
// keep prior enrichment). Known limitation: ~10% of Part IV points fall outside any parcel and are
// unmatched (filed as a follow-up — precision over recall for the regulatory flag).
const ENRICH_SQL = `
WITH parcel_c AS MATERIALIZED (
  SELECT
    p.id AS parcel_id,
    p.geom,
    NULLIF(normalize_address(concat_ws(' ', p.addr_num_normalized, p.street_name_normalized, p.street_type_normalized)), '') AS norm_addr
  FROM parcels p
  WHERE p.geom IS NOT NULL AND NOT ST_IsEmpty(p.geom) AND ST_IsValid(p.geom)  -- exclude invalid geoms (ST_Intersects can false-negative); counted separately as INFO
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
       AND ST_Intersects(pc.geom, hp.geom)                    -- point falls WITHIN this parcel; binds idx_heritage_properties_geom_gist
     ORDER BY
       CASE WHEN pc.norm_addr IS NOT NULL
                 AND levenshtein(pc.norm_addr, normalize_address(hp.address_text)) <= $1
            THEN 0 ELSE 1 END ASC,                            -- tiebreak when a parcel contains >1 Part IV point
       hp.id ASC                                              -- deterministic
     LIMIT 1
  ) piv ON true
),
resolved AS (
  SELECT
    parcel_id,
    (hcd_id IS NOT NULL OR hp_id IS NOT NULL) AS new_designated,
    CASE
      WHEN hp_id  IS NOT NULL THEN 'part_iv_individual'       -- L12: Part IV wins over Part V HCD
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

/** Engine — runs on the caller's transaction client. Returns the updated count. */
async function enrichHeritage(client, { levenshteinThreshold, datasetVersion }) {
  const upd = await client.query(ENRICH_SQL, [levenshteinThreshold, datasetVersion]);
  return { updated: upd.rowCount };
}

/** Row-derived verdict cascade (Spec 47 §8.2 / Spec 48 §3.6). */
function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

// Coverage stats + audit-row emit — shared by BOTH the #418 skip path and the
// recompute path so the dashboard step always reports (never UNKNOWN) and the
// producer/consumer column contract holds on a skip (Integration BUG, ported
// from enrich-ravines.js's emitResults). Coverage is RE-QUERIED live on every
// call so a pre-existing partial-coverage hole stays visible even when this
// run skips (Regression Guardian).
async function emitHeritageResults(pool, { datasetVersion, updated, skipped, t0, config }) {
  const cov = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_heritage_designated)                                  AS designated,
      COUNT(*) FILTER (WHERE heritage_designation_type = 'part_iv_individual')        AS part_iv,
      COUNT(*) FILTER (WHERE heritage_designation_type = 'part_v_hcd')                AS part_v,
      COUNT(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom))               AS invalid_geom,
      (SELECT COUNT(*) FROM heritage_properties WHERE status = 'part_iv')             AS part_iv_source
    FROM parcels`);
  const c = cov.rows[0];
  const designated = Number(c.designated);
  const partIv = Number(c.part_iv);
  const partV = Number(c.part_v);
  const invalidGeom = Number(c.invalid_geom);
  const partIvSource = Number(c.part_iv_source);

  // L21: Part IV source points NOT contained by any (valid-geom) parcel — the containment
  // limitation made observable. ST_Intersects binds idx_parcels_geom_gist (index-bound).
  const unl = await pool.query(`
    SELECT COUNT(*)::int AS n FROM heritage_properties hp
     WHERE hp.status = 'part_iv'
       AND NOT EXISTS (SELECT 1 FROM parcels p WHERE p.geom IS NOT NULL AND ST_IsValid(p.geom) AND ST_Intersects(p.geom, hp.geom))`);
  const unmatchedPoints = Number(unl.rows[0].n);
  const unmatchedFrac = partIvSource > 0 ? unmatchedPoints / partIvSource : 0;

  const auditRows = [];
  // Broken-join FAIL gate: a hard zero means the spatial join matched NOTHING (wrong SRID /
  // unbound GIST / Option-C bug) — distinct from a legitimately-small heritage subset (DEC-H / Obs).
  auditRows.push({ metric: 'parcels_heritage_designated_count', value: designated, status: designated === 0 ? 'FAIL' : 'INFO' });
  // Part IV broken-while-Part-V-works visibility: WARN when 0 matched but source has Part IV points.
  auditRows.push({ metric: 'parcels_part_iv_count', value: partIv, status: (partIv === 0 && partIvSource > 0) ? 'WARN' : 'INFO' });
  auditRows.push({ metric: 'parcels_part_v_hcd_count', value: partV, status: 'INFO' });
  auditRows.push({ metric: 'heritage_part_iv_source_count', value: partIvSource, status: 'INFO' });
  // L21 — % of Part IV source points with no containing parcel (containment limitation; calibrated thresholds).
  auditRows.push({
    metric: 'heritage_points_no_parcel_match',
    value: Math.round(unmatchedFrac * 1000) / 10,
    status: unmatchedFrac > config.heritageUnlinkedPointFailPct ? 'FAIL'
      : unmatchedFrac > config.heritageUnlinkedPointWarnPct ? 'WARN' : 'INFO',
  });
  // INFO (not WARN): invalid-geom parcels are excluded from the join (parcel_c WHERE ST_IsValid),
  // so they don't corrupt enrichment — this is a steady-state parcels-loader data-quality fact, not a
  // per-run alert. WARN-on->0 would force a perpetual-WARN verdict (alert fatigue). Mirrors enrich-ravines.
  auditRows.push({ metric: 'parcels_invalid_geom_count', value: invalidGeom, status: 'INFO' });
  auditRows.push({ metric: 'parcels_enriched_count', value: updated, status: 'INFO' });
  // #418 — whether this run took the Layer-1 skip (steady state) or recomputed (post-refresh).
  auditRows.push({ metric: 'parcels_heritage_enrich_skipped', value: skipped, status: 'INFO' });
  auditRows.push({ metric: 'heritage_source_dataset_version', value: datasetVersion, status: 'INFO' });
  auditRows.push({ metric: 'enrich_heritage_duration_ms', value: Date.now() - t0, status: 'INFO' });

  pipeline.emitSummary({
    records_total: null, // Enrich archetype — does not create rows (Spec 47 §11)
    records_new: null,
    records_updated: updated,
    records_meta: {
      audit_table: {
        phase: ADVISORY_LOCK_ID,
        name: 'Parcel heritage enrichment',
        verdict: verdictCascade(auditRows),
        rows: auditRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      heritage_properties: ['geom', 'status', 'address_text', 'designated_date'],
      heritage_districts: ['geom', 'designated_date'],
      parcels: ['id', 'geom', 'addr_num_normalized', 'street_name_normalized', 'street_type_normalized'],
    },
    { parcels: ['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date', 'heritage_dataset_version_when_enriched'] },
  );

  pipeline.log.info(TAG, skipped
    ? `skip — all eligible geom-bearing parcels already enriched at heritage version ${datasetVersion} (designated ${designated}: part_iv ${partIv}/${partIvSource}, part_v ${partV})`
    : `enriched ${updated} parcels (designated ${designated}: part_iv ${partIv}/${partIvSource}, part_v ${partV})`);
}

async function main(pool) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();
    const { logicVars } = await loadMarketplaceConfigs(pool, 'enrich-heritage');
    const config = ConfigSchema.parse(logicVars || {});

    // §9/L23 consumer protocol — HALTs on missing/failed/stale producer.
    const { datasetVersion } = await readHeritageContract(pool);

    // Commit C — the lineage-column guard BEFORE countStale reads it (mirrors
    // enrich-ravines.js's ordering exactly; see assertVersionColumn's docblock).
    await assertVersionColumn(pool);

    // Commit C — the skip path (#418 Layer-1 below) never used to call
    // assertPreconditions (only the recompute path did, in-txn), so PostGIS/
    // the three GIST indexes/SRID went unvalidated on a skip — a dropped
    // extension or index would be silently masked behind a green SKIP just as
    // readily as a stale dataset version. assertPreconditions's checks are all
    // cheap catalog/metadata lookups (no spatial join), so it is hoisted here
    // to run on BOTH paths — it also calls assertHeritageSourceNonEmpty
    // internally (L14, ravines precedent: a wiped heritage source must HALT
    // even when matching stamps would otherwise satisfy the #418 skip below).
    await assertPreconditions(pool);

    // #418 Layer-1 (ported) — see countStale's docblock for the invalid-geom
    // wedge-open trap and how the probe is scoped to avoid it. The skip path
    // STILL emits coverage + summary + meta (shared emitHeritageResults) so
    // the dashboard step is never UNKNOWN and the producer/consumer column
    // contract holds (Integration BUG).
    const forceFull = process.env[FORCE_FULL_ENV] === '1';
    const staleCount = forceFull ? 1 : await countStale(pool, datasetVersion);
    if (staleCount === 0) {
      await emitHeritageResults(pool, { datasetVersion, updated: 0, skipped: true, t0, config });
      return { ok: true };
    }

    let result;
    await pipeline.withTransaction(pool, async (client) => {
      await assertPreconditions(client);
      result = await enrichHeritage(client, {
        levenshteinThreshold: config.heritageAddressLevenshteinThreshold,
        datasetVersion,
      });
    });

    await emitHeritageResults(pool, { datasetVersion, updated: result.updated, skipped: false, t0, config });
    return { ok: true };
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP already
}

if (require.main === module) {
  pipeline.run('enrich-heritage', main);
}

module.exports = {
  ADVISORY_LOCK_ID,
  PRODUCER_NAME,
  PIPELINE_NAME,
  FORCE_FULL_ENV,
  ENRICH_SQL,
  readHeritageContract,
  assertPreconditions,
  assertHeritageSourceNonEmpty,
  assertVersionColumn,
  countStale,
  enrichHeritage,
  emitHeritageResults,
  verdictCascade,
};
