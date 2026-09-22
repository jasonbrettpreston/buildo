/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §4
 * SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §5.4.1
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5
 *
 * CQA Tier 2: Post-Ingestion Data Bounds Validation — THE DOMAIN LOGIC ONLY.
 *
 * Ported from `scripts/quality/assert-data-bounds.js` (pre-conversion, 1,055 L) per
 * `docs/reports/2026-09-12-batch1-i2-assert-data-bounds-assessment.md`. Every SQL
 * statement below is VERBATIM from the pre-conversion file (§1.2 statement table),
 * relocated behind memoized, ctx-scoped loaders. Checks are DATA
 * (`scripts/lib/assert-data-bounds-fields.js` CHECK_DEFS), not 52 hand-typed
 * functions — one generic evaluator per `kind`, dispatched by CHECK_DEFS[i].kind.
 *
 * ── SPEC 30 §5.4.1 — THE HALT-CLASSIFICATION MECHANISM THIS FILE PRESERVES ──
 *
 * Re-reading the pre-conversion source line-by-line this session (not merely the
 * 3 literal `fatalErrors.push` call sites the report names) found the REAL
 * classification is broader: `:124` opens ONE try that wraps ALL SIX blocks
 * (permits/coa/sources/wsib/inspection/cost+ghost); `:964` is its ONE catch.
 * Any query with NO try/catch of its own (permits' orphan/dup checks, every coa
 * query, sources' core counts) — or a ravines/heritage/centreline "does not
 * exist" guard's RE-THROWN non-missing-table error — reaches that outer catch
 * and becomes fatal. wsib (`:696-705`) and inspection (`:829-837`) catch
 * locally and push to `fatalErrors` directly (no re-throw, but still fatal).
 * `cost_estimates`/ghost-records (`:923-925`, `:958-961`) are the ONLY two
 * groups whose catch SWALLOWS EVERYTHING — genuinely non-fatal, "SKIP" logged,
 * nothing pushed anywhere.
 *
 * This compute reproduces the OBSERVABLE HALT CONTRACT for the single-chain
 * invocation `src/tests/db/assert-data-bounds-halt.db.test.ts` Case B exercises
 * (`PIPELINE_CHAIN=permits`, one query's table renamed away): every check
 * EXCEPT the two `costest`/`ghost`-loader checks has NO per-check error
 * boundary here — an unhandled query error propagates OUT OF `compute()`
 * uncaught, exactly as the pre-conversion outer catch's eventual re-throw
 * (`:1035`) did. `costest`/`ghost` checks swallow every error internally and
 * report a SKIP-safe PASS row, matching `:923-925`/`:958-961` byte-for-byte.
 * DECLARED SIMPLIFICATION (not silently dropped): a STANDALONE (multi-chain)
 * run where one chain's query fails now loses EVERY chain's rows (compute()
 * rejects wholesale) rather than only the failing block's — pre-conversion lost
 * only the one block that threw, still building/emitting the others. Case B's
 * own scenario is single-chain and is unaffected; the standalone difference is
 * recorded here and in the commit report, not silently accepted.
 *
 * "does not exist" GUARDS preserved verbatim (ravines/heritage_properties/
 * heritage_districts/toronto_centreline migration-ordering; wsib_registry/
 * permit_inspections table-absent) — report a SKIP-safe row, never fatal.
 *
 * ── NAMED CONVERSION CONSEQUENCES — see scripts/lib/assert-data-bounds-fields.js
 *    header for the full list (display_name sharing, the Pre-Permit id split,
 *    2 promoted warnings-only rows, the inert inspection_ancient_dates var).
 */
'use strict';

const { CHECK_DEFS, COST_MAG_ACCEPT } = require('../assert-data-bounds-fields');

// ---------------------------------------------------------------------------
// Memoized per-ctx branch loaders (one round trip per branch per run, regardless
// of how many of that branch's checks are selected) — mirrors
// scripts/lib/compute/assert-global-coverage.js's BRANCH_MEMO pattern.
// ---------------------------------------------------------------------------
const BRANCH_MEMO = new WeakMap();
function memo(ctx, key, loader) {
  let byKey = BRANCH_MEMO.get(ctx);
  if (!byKey) { byKey = new Map(); BRANCH_MEMO.set(ctx, byKey); }
  if (!byKey.has(key)) byKey.set(key, loader());
  return byKey.get(key);
}

/**
 * Deploy-ordering guard: is `err` Postgres 42P01 for the ONE relation a loader
 * is allowed to treat as "not yet migrated"?
 *
 * ── WHY THE TABLE NAME IS A REQUIRED ARGUMENT (review_followups LOW, 2026-08-13) ──
 * This predicate used to be table-agnostic — `err.message.includes('does not
 * exist')` — and every call site guarded a MULTI-QUERY block. `loadWsibBranch`
 * is the case that broke: its last query joins `entities`, so a missing
 * `entities` (an outage of a table this step does NOT own) raised
 * `relation "entities" does not exist`, matched the broad predicate, and made
 * the whole WSIB block report `{ checked: false }` — a SKIP meaning "nothing to
 * check" for a metric that was never read. "I could not check" must never read
 * as "nothing to check".
 *
 * Naming the guarded relation narrows the guard to exactly the deploy-order
 * case it was written for: every OTHER missing relation rethrows out of
 * `compute()` and halts the chain, per the file header's Spec 30 §5.4.1 halt
 * contract.
 *
 * Both the bare (`relation "x" does not exist`) and schema-qualified
 * (`relation "public.x" does not exist`) message forms are accepted, so a
 * non-default search_path does not silently disable a guard.
 */
function isMissingTable(err, table) {
  if (!err || !err.message || !table) return false;
  return err.message.includes(`relation "${table}" does not exist`)
    || err.message.includes(`relation "public.${table}" does not exist`);
}

// ── permits (fatal-eligible: no local catch) ────────────────────────────────
async function loadPermitsBranch(ctx) {
  return memo(ctx, 'permits', async () => {
    const pool = ctx.pool;
    const costOutliersRes = await pool.query(
      `SELECT COUNT(*) FROM permits WHERE est_const_cost < 0 OR est_const_cost > $1`,
      [ctx.config.cost_outlier_ceiling_cad],
    );
    const costOutliers = parseInt(costOutliersRes.rows[0].count, 10);

    const recentTotalRes = await pool.query(`SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day'`);
    const recentTotal = parseInt(recentTotalRes.rows[0].count, 10);

    let descNull = 0, descPct = 0, builderNull = 0, builderPct = 0, statusNull = 0;
    if (recentTotal > 0) {
      const descNullRes = await pool.query(`SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND description IS NULL`);
      descNull = parseInt(descNullRes.rows[0].count, 10);
      descPct = Math.round((descNull / recentTotal) * 1000) / 10;

      const builderNullRes = await pool.query(`SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND builder_name IS NULL`);
      builderNull = parseInt(builderNullRes.rows[0].count, 10);
      builderPct = Math.round((builderNull / recentTotal) * 1000) / 10;

      const statusNullRes = await pool.query(`SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND status IS NULL`);
      statusNull = parseInt(statusNullRes.rows[0].count, 10);
    }

    const orphanTradesRes = await pool.query(
      `SELECT COUNT(*) FROM permit_trades pt
       LEFT JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num
       WHERE p.permit_num IS NULL`,
    );
    const orphanTrades = parseInt(orphanTradesRes.rows[0].count, 10);

    const orphanParcelsRes = await pool.query(
      `SELECT COUNT(*) FROM permit_parcels pp
       LEFT JOIN permits p ON p.permit_num = pp.permit_num AND p.revision_num = pp.revision_num
       WHERE p.permit_num IS NULL`,
    );
    const orphanParcels = parseInt(orphanParcelsRes.rows[0].count, 10);

    const dupesRes = await pool.query(
      `SELECT COUNT(*) FROM (
         SELECT permit_num, revision_num FROM permits
         GROUP BY permit_num, revision_num HAVING COUNT(*) > 1
       ) d`,
    );
    const dupes = parseInt(dupesRes.rows[0].count, 10);

    const prePermitRes = await pool.query(`SELECT COUNT(*) FROM permits WHERE permit_type='Pre-Permit'`);
    const prePermitCount = parseInt(prePermitRes.rows[0].count, 10);

    return { costOutliers, recentTotal, descNull, descPct, builderNull, builderPct, statusNull, orphanTrades, orphanParcels, dupes, prePermitCount };
  });
}

// ── coa (fatal-eligible) ─────────────────────────────────────────────────────
async function loadCoaBranch(ctx) {
  return memo(ctx, 'coa', async () => {
    const pool = ctx.pool;
    const orphanCoaRes = await pool.query(
      `SELECT COUNT(*) FROM coa_applications ca
       WHERE ca.linked_permit_num IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM permits p WHERE p.permit_num = ca.linked_permit_num)`,
    );
    const orphanCoa = parseInt(orphanCoaRes.rows[0].count, 10);

    const sub085Res = await pool.query(
      `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE linked_confidence IS NULL OR linked_confidence < 0.85)
                     / NULLIF(COUNT(*), 0), 1) AS pct
         FROM coa_applications WHERE linked_permit_num IS NOT NULL`,
    );
    const coaSub085 = sub085Res.rows[0].pct != null ? parseFloat(sub085Res.rows[0].pct) : 0;

    const nullAddressRes = await pool.query(`SELECT COUNT(*) FROM coa_applications WHERE address IS NULL OR TRIM(address) = ''`);
    const nullAddress = parseInt(nullAddressRes.rows[0].count, 10);

    const nullAppNumRes = await pool.query(`SELECT COUNT(*) FROM coa_applications WHERE application_number IS NULL OR TRIM(application_number) = ''`);
    const nullAppNum = parseInt(nullAppNumRes.rows[0].count, 10);

    // coa_future_hearing_window_years (new var, report §2.4 item 12) — bound as
    // a parameterised interval multiplier, never a literal (Fold A item 3 style fix).
    const futureHearingRes = await pool.query(
      `SELECT COUNT(*) FROM coa_applications WHERE hearing_date > CURRENT_DATE + ($1 * INTERVAL '1 year')`,
      [ctx.config.coa_future_hearing_window_years],
    );
    const futureHearing = parseInt(futureHearingRes.rows[0].count, 10);

    const ancientHearingRes = await pool.query(`SELECT COUNT(*) FROM coa_applications WHERE hearing_date < '2010-01-01'`);
    const ancientHearing = parseInt(ancientHearingRes.rows[0].count, 10);

    const coaCostGt10mRes = await pool.query(
      `SELECT COUNT(*) FROM coa_applications WHERE estimated_cost > $1`,
      [ctx.config.coa_cost_gt_threshold_cad],
    );
    const coaCostGt10m = parseInt(coaCostGt10mRes.rows[0].count, 10);

    const coaAppFsiGt5Res = await pool.query(
      `SELECT COUNT(*) FROM coa_applications WHERE coa_fsi > $1`,
      [ctx.config.coa_fsi_gt_threshold],
    );
    const coaAppFsiGt5 = parseInt(coaAppFsiGt5Res.rows[0].count, 10);

    const coaGfaGt3LotRes = await pool.query(
      `SELECT COUNT(*) FROM coa_applications WHERE lot_size_sqm > 0 AND max_buildable_gfa_sqm > $1 * lot_size_sqm`,
      [ctx.config.coa_gfa_over_lot_multiple],
    );
    const coaGfaGt3Lot = parseInt(coaGfaGt3LotRes.rows[0].count, 10);

    // Phase G (Spec 42 §6.11) — SAME SQL as permits' prePermitCount (IL-3 ACCEPT,
    // 2 independent sites, disjoint-guard defense-in-depth).
    const coaPrePermitRes = await pool.query(`SELECT COUNT(*) FROM permits WHERE permit_type='Pre-Permit'`);
    const coaPrePermitCount = parseInt(coaPrePermitRes.rows[0].count, 10);

    return { orphanCoa, coaSub085, nullAddress, nullAppNum, futureHearing, ancientHearing, coaCostGt10m, coaAppFsiGt5, coaGfaGt3Lot, coaPrePermitCount };
  });
}

// ── sources (core counts fatal-eligible; ravines/heritage/centreline "does not
//    exist"-guarded — SKIP-safe on missing table, fatal on any other error) ──
async function loadSourcesBranch(ctx) {
  return memo(ctx, 'sources', async () => {
    const pool = ctx.pool;
    const apCountRes = await pool.query(`SELECT COUNT(*) FROM address_points`);
    const apCount = parseInt(apCountRes.rows[0].count, 10);

    const apDupesRes = await pool.query(
      `SELECT COUNT(*) FROM (SELECT address_point_id FROM address_points GROUP BY address_point_id HAVING COUNT(*) > 1) d`,
    );
    const apDupes = parseInt(apDupesRes.rows[0].count, 10);

    const parcelCountRes = await pool.query(`SELECT COUNT(*) FROM parcels`);
    const parcelCount = parseInt(parcelCountRes.rows[0].count, 10);

    const parcelDupesRes = await pool.query(
      `SELECT COUNT(*) FROM (SELECT parcel_id FROM parcels GROUP BY parcel_id HAVING COUNT(*) > 1) d`,
    );
    const parcelDupes = parseInt(parcelDupesRes.rows[0].count, 10);

    const lotOutliersRes = await pool.query(
      `SELECT COUNT(*) FROM parcels WHERE lot_size_sqm IS NOT NULL AND (lot_size_sqm <= 0 OR lot_size_sqm > 1000000)`,
    );
    const lotOutliers = parseInt(lotOutliersRes.rows[0].count, 10);

    const bfCountRes = await pool.query(`SELECT COUNT(*) FROM building_footprints`);
    const bfCount = parseInt(bfCountRes.rows[0].count, 10);

    const heightOutliersRes = await pool.query(
      `SELECT COUNT(*) FROM building_footprints WHERE max_height_m IS NOT NULL AND (max_height_m < 0 OR max_height_m > 500)`,
    );
    const heightOutliers = parseInt(heightOutliersRes.rows[0].count, 10);

    const nhoodCountRes = await pool.query(`SELECT COUNT(*) FROM neighbourhoods`);
    const nhoodCount = parseInt(nhoodCountRes.rows[0].count, 10);

    const nhoodDupesRes = await pool.query(
      `SELECT COUNT(*) FROM (SELECT neighbourhood_id FROM neighbourhoods GROUP BY neighbourhood_id HAVING COUNT(*) > 1) d`,
    );
    const nhoodDupes = parseInt(nhoodDupesRes.rows[0].count, 10);

    let ravinesCount = null;
    try {
      const r = await pool.query(`SELECT COUNT(*) FROM ravines`);
      ravinesCount = parseInt(r.rows[0].count, 10);
    } catch (err) {
      if (!isMissingTable(err, 'ravines')) throw err;
    }

    let heritagePropsCount = null;
    let heritageDistrictsCount = null;
    try {
      const hp = await pool.query(`SELECT COUNT(*) FROM heritage_properties`);
      heritagePropsCount = parseInt(hp.rows[0].count, 10);
      const hd = await pool.query(`SELECT COUNT(*) FROM heritage_districts`);
      heritageDistrictsCount = parseInt(hd.rows[0].count, 10);
    } catch (err) {
      if (!isMissingTable(err, 'heritage_properties') && !isMissingTable(err, 'heritage_districts')) throw err;
      heritagePropsCount = null;
      heritageDistrictsCount = null;
    }

    let centrelineCount = null;
    try {
      const c = await pool.query(`SELECT COUNT(*) FROM toronto_centreline`);
      centrelineCount = parseInt(c.rows[0].count, 10);
    } catch (err) {
      if (!isMissingTable(err, 'toronto_centreline')) throw err;
    }

    return { apCount, apDupes, parcelCount, parcelDupes, lotOutliers, bfCount, heightOutliers, nhoodCount, nhoodDupes, ravinesCount, heritagePropsCount, heritageDistrictsCount, centrelineCount };
  });
}

// ── wsib (shared permits+sources, IL-4 — "does not exist"/empty SKIP-safe,
//    any other error fatal) ──────────────────────────────────────────────────
async function loadWsibBranch(ctx) {
  return memo(ctx, 'wsib', async () => {
    const pool = ctx.pool;
    try {
      const countRes = await pool.query(`SELECT COUNT(*) FROM wsib_registry`);
      const wsibCount = parseInt(countRes.rows[0].count, 10);
      if (wsibCount === 0) return { checked: false, wsibNoName: 0, wsibNonG: 0, wsibBadNaics: 0, wsibOrphan: 0 };

      const noNameRes = await pool.query(`SELECT COUNT(*) FROM wsib_registry WHERE legal_name IS NULL OR TRIM(legal_name) = ''`);
      const wsibNoName = parseInt(noNameRes.rows[0].count, 10);

      const nonGRes = await pool.query(
        `SELECT COUNT(*) FROM wsib_registry
         WHERE predominant_class NOT LIKE 'G%' AND (subclass IS NULL OR subclass NOT LIKE 'G%')`,
      );
      const wsibNonG = parseInt(nonGRes.rows[0].count, 10);

      const badNaicsRes = await pool.query(`SELECT COUNT(*) FROM wsib_registry WHERE naics_code IS NOT NULL AND naics_code !~ '^[0-9]+$'`);
      const wsibBadNaics = parseInt(badNaicsRes.rows[0].count, 10);

      const orphanRes = await pool.query(
        `SELECT COUNT(*) FROM wsib_registry w
         WHERE w.linked_entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = w.linked_entity_id)`,
      );
      const wsibOrphan = parseInt(orphanRes.rows[0].count, 10);

      return { checked: true, wsibNoName, wsibNonG, wsibBadNaics, wsibOrphan };
    } catch (err) {
      // ONLY a missing `wsib_registry` is SKIP-safe here. The orphan query
      // above joins `entities` — a missing `entities` is a DIFFERENT relation's
      // outage and must rethrow (review_followups LOW, 2026-08-13: the
      // table-agnostic predicate used to mask it as "nothing to check").
      if (isMissingTable(err, 'wsib_registry')) return { checked: false, wsibNoName: 0, wsibNonG: 0, wsibBadNaics: 0, wsibOrphan: 0 };
      throw err; // fatal — :696-705
    }
  });
}

// ── inspection (deep_scrapes — "does not exist"/empty SKIP-safe, any other
//    error fatal) ─────────────────────────────────────────────────────────────
async function loadInspectionBranch(ctx) {
  return memo(ctx, 'inspection', async () => {
    const pool = ctx.pool;
    const empty = {
      checked: false, nullPermitNum: 0, nullStageName: 0, nullStatus: 0, nullScrapedAt: 0,
      orphanInsp: 0, badStatus: 0, outstandingWithDate: 0, completedNoDate: 0, inspDupes: 0,
      futureDates: 0, ancientDates: 0, dateBeforePermit: 0,
    };
    try {
      const countRes = await pool.query(`SELECT COUNT(*) FROM permit_inspections`);
      const inspCount = parseInt(countRes.rows[0].count, 10);
      if (inspCount === 0) return empty;

      const nullPermitNumRes = await pool.query(`SELECT COUNT(*) FROM permit_inspections WHERE permit_num IS NULL OR permit_num = ''`);
      const nullStageNameRes = await pool.query(`SELECT COUNT(*) FROM permit_inspections WHERE stage_name IS NULL OR stage_name = ''`);
      const nullStatusRes = await pool.query(`SELECT COUNT(*) FROM permit_inspections WHERE status IS NULL OR status = ''`);
      const nullScrapedAtRes = await pool.query(`SELECT COUNT(*) FROM permit_inspections WHERE scraped_at IS NULL`);
      const orphanInspRes = await pool.query(
        `SELECT COUNT(*) FROM permit_inspections pi WHERE NOT EXISTS (SELECT 1 FROM permits p WHERE p.permit_num = pi.permit_num)`,
      );
      const badStatusRes = await pool.query(
        `SELECT COUNT(*) FROM permit_inspections WHERE status NOT IN ('Outstanding', 'Passed', 'Not Passed', 'Partial')`,
      );
      const outstandingWithDateRes = await pool.query(
        `SELECT COUNT(*) FROM permit_inspections WHERE status = 'Outstanding' AND inspection_date IS NOT NULL`,
      );
      const completedNoDateRes = await pool.query(
        `SELECT COUNT(*) FROM permit_inspections WHERE status != 'Outstanding' AND inspection_date IS NULL`,
      );
      const inspDupesRes = await pool.query(
        `SELECT COUNT(*) FROM (SELECT permit_num, stage_name FROM permit_inspections GROUP BY permit_num, stage_name HAVING COUNT(*) > 1) d`,
      );
      const futureDatesRes = await pool.query(`SELECT COUNT(*) FROM permit_inspections WHERE inspection_date > CURRENT_DATE`);
      const ancientDatesRes = await pool.query(`SELECT COUNT(*) FROM permit_inspections WHERE inspection_date < '2020-01-01'`);
      const dateBeforePermitRes = await pool.query(
        `SELECT COUNT(*) FROM permit_inspections
         WHERE inspection_date IS NOT NULL
           AND EXTRACT(YEAR FROM inspection_date) < (2000 + SUBSTRING(permit_num FROM '^[0-9]{2}')::int)`,
      );

      return {
        checked: true,
        nullPermitNum: parseInt(nullPermitNumRes.rows[0].count, 10),
        nullStageName: parseInt(nullStageNameRes.rows[0].count, 10),
        nullStatus: parseInt(nullStatusRes.rows[0].count, 10),
        nullScrapedAt: parseInt(nullScrapedAtRes.rows[0].count, 10),
        orphanInsp: parseInt(orphanInspRes.rows[0].count, 10),
        badStatus: parseInt(badStatusRes.rows[0].count, 10),
        outstandingWithDate: parseInt(outstandingWithDateRes.rows[0].count, 10),
        completedNoDate: parseInt(completedNoDateRes.rows[0].count, 10),
        inspDupes: parseInt(inspDupesRes.rows[0].count, 10),
        futureDates: parseInt(futureDatesRes.rows[0].count, 10),
        ancientDates: parseInt(ancientDatesRes.rows[0].count, 10),
        dateBeforePermit: parseInt(dateBeforePermitRes.rows[0].count, 10),
      };
    } catch (err) {
      if (isMissingTable(err, 'permit_inspections')) return empty;
      throw err; // fatal — :829-837
    }
  });
}

// ── cost-estimates magnitude gates (fatal-eligible — no local catch; the
//    ceiling values bind as query params, fixing the :888/:894 interpolation,
//    Fold A item 3) ───────────────────────────────────────────────────────────
async function loadCostMagBranch(ctx) {
  return memo(ctx, 'costmag', async () => {
    const pool = ctx.pool;
    const acceptClause = `permit_num <> ALL($2::text[])`;
    const costMagRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cost_estimates WHERE estimated_cost > $1 AND ${acceptClause}`,
      [ctx.config.cost_est_legacy_cost_ceiling_cad, COST_MAG_ACCEPT],
    );
    const gfaMagRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cost_estimates
        WHERE modeled_gfa_sqm > $1 AND estimated_cost IS NOT NULL AND ${acceptClause}`,
      [ctx.config.cost_est_legacy_gfa_ceiling_sqm, COST_MAG_ACCEPT],
    );
    return { costMagCount: costMagRes.rows[0].n, gfaMagCount: gfaMagRes.rows[0].n };
  });
}

// ── cost_estimates coverage (non-fatal — swallows ALL errors, :923-925) ──────
async function loadCostEstBranch(ctx) {
  return memo(ctx, 'costest', async () => {
    const pool = ctx.pool;
    try {
      const ceTotalRes = await pool.query(`SELECT COUNT(*) FROM cost_estimates`);
      const ceTotal = parseInt(ceTotalRes.rows[0].count, 10);
      if (ceTotal === 0) return { ceTotal: 0, ceNull: 0, nullPct: 0, tierCount: 0, skip: 'cost_estimates table is empty' };
      const ceNullRes = await pool.query(`SELECT COUNT(*) FROM cost_estimates WHERE estimated_cost IS NULL`);
      const ceNull = parseInt(ceNullRes.rows[0].count, 10);
      const tiersRes = await pool.query(`SELECT COUNT(DISTINCT cost_tier) as tiers FROM cost_estimates WHERE cost_tier IS NOT NULL`);
      const tierCount = parseInt(tiersRes.rows[0].tiers, 10);
      const nullPct = Math.round((ceNull / ceTotal) * 1000) / 10;
      return { ceTotal, ceNull, nullPct, tierCount, skip: null };
    } catch (err) {
      return { ceTotal: 0, ceNull: 0, nullPct: 0, tierCount: 0, skip: `cost_estimates check failed: ${err.message}` };
    }
  });
}

// ── ghost records (non-fatal — swallows ALL errors, :958-961) ────────────────
async function loadGhostBranch(ctx) {
  return memo(ctx, 'ghost', async () => {
    const pool = ctx.pool;
    try {
      const res = await pool.query(
        `SELECT COUNT(*) AS count, MIN(last_seen_at) AS oldest
         FROM permits
         WHERE last_seen_at < CURRENT_DATE - INTERVAL '30 days'
           AND lifecycle_phase IS NOT NULL
           AND lifecycle_phase NOT IN ('P19', 'P20')`,
      );
      return { ghostCount: parseInt(res.rows[0].count, 10), oldest: res.rows[0].oldest, skip: null };
    } catch (err) {
      return { ghostCount: 0, oldest: null, skip: `Ghost record check failed: ${err.message}` };
    }
  });
}

async function loadBranch(ctx, loaderKey) {
  switch (loaderKey) {
    case 'permits': return loadPermitsBranch(ctx);
    case 'coa': return loadCoaBranch(ctx);
    case 'sources': return loadSourcesBranch(ctx);
    case 'wsib': return loadWsibBranch(ctx);
    case 'inspection': return loadInspectionBranch(ctx);
    case 'costmag': return loadCostMagBranch(ctx);
    case 'costest': return loadCostEstBranch(ctx);
    case 'ghost': return loadGhostBranch(ctx);
    default: throw new Error(`assert-data-bounds compute: unknown loader "${loaderKey}"`);
  }
}

function getPath(obj, p) {
  if (obj === null || obj === undefined) return undefined;
  return p.split('.').reduce((acc, k) => (acc === null || acc === undefined ? acc : acc[k]), obj);
}

// ---------------------------------------------------------------------------
// Per-kind evaluators — one generic function per CHECK_DEFS[i].kind.
// ---------------------------------------------------------------------------

/** ==0 structural invariants + checkInsp()-style value>0 checks. */
async function evalRaw0(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  // SKIP-safe branches (wsib/inspection/sources-guarded/costest/ghost) signal
  // "not applicable" via `checked:false`/`skip`/null fields — always PASS-safe
  // (0 violations), never omitted (Nothing Hidden over the pre-conversion
  // silent-omission shape).
  if (branch && branch.checked === false) {
    ctx.report(def.id, { violations: 0, detail: 'SKIP: source table empty or not yet loaded' });
    return;
  }
  if (branch && Object.prototype.hasOwnProperty.call(branch, 'skip') && branch.skip) {
    ctx.report(def.id, { violations: 0, detail: `SKIP: ${branch.skip}` });
    return;
  }
  const value = getPath(branch, def.field);
  if (value === null || value === undefined) {
    ctx.report(def.id, { violations: 0, detail: 'SKIP: dependent table not present (deploy-ordering guard)' });
    return;
  }
  ctx.report(def.id, { violations: Number.isFinite(value) ? value : 0 });
}

/** A real JS `count >= ctx.config[cfgVar]` comparison, booleanized (avoids the
 * compute-shape `compute-no-literal-threshold` class entirely — the comparator
 * reads ctx.config, never a numeric literal — and sidesteps the `viol <=`
 * grammar's off-by-one risk against a WARN-triggers-at-N default). */
async function evalBoolCfgGe(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  const value = getPath(branch, def.field);
  const bound = ctx.config[def.cfgVar];
  const over = Number.isFinite(value) && Number.isFinite(bound) && value >= bound;
  ctx.report(def.id, { violations: over ? 1 : 0, detail: value });
}

/** A real JS `count > ctx.config[cfgVar]` comparison, booleanized — the strict
 * form (vs `evalBoolCfgGe`'s `>=`), for a bound whose pre-conversion display
 * text promised "count <= N is safe" (i.e. WARN triggers only ABOVE N, not AT
 * N). ADB-D7 (`ancient_dates`, commit 8c): the pre-conversion `checkInsp()`
 * helper's displayed `'<= N'` label was never itself compared — every call
 * site evaluated unconditionally `value > 0`. Wiring the real bound here uses
 * `>` (not `>=`) to match that "<=N is safe" framing exactly, not
 * `evalBoolCfgGe`'s off-by-one-different `>=` semantics its 3 existing
 * siblings (`cost_outliers`/`null_address`/`ancient_hearing`) use. */
async function evalBoolCfgGt(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  const value = getPath(branch, def.field);
  const bound = ctx.config[def.cfgVar];
  const over = Number.isFinite(value) && Number.isFinite(bound) && value > bound;
  ctx.report(def.id, { violations: over ? 1 : 0, detail: value });
}

/** value_min / value_max forms — the raw measured count/value, config-substituted. */
async function evalValueBound(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  const value = getPath(branch, def.field);
  if (value === null || value === undefined) {
    ctx.report(def.id, { value: null, detail: 'SKIP: dependent table not present (deploy-ordering guard)' });
    return;
  }
  ctx.report(def.id, { value, detail: value });
}

/** pct <= <config> form — value is already a percentage/ratio in the loader. */
async function evalPctMax(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  if (branch && Object.prototype.hasOwnProperty.call(branch, 'skip') && branch.skip) {
    ctx.report(def.id, { value: 0, detail: `SKIP: ${branch.skip}` });
    return;
  }
  const value = getPath(branch, def.field);
  ctx.report(def.id, { value: Number.isFinite(value) ? value : 0 });
}

const EVALUATORS = {
  raw0: evalRaw0,
  boolcfg_ge: evalBoolCfgGe,
  boolcfg_gt: evalBoolCfgGt,
  floor_min: evalValueBound,
  ceiling_max: evalValueBound,
  pctmax_cfg: evalPctMax,
};

// ---------------------------------------------------------------------------
// Dispatch table — built FROM CHECK_DEFS (single source of truth with the
// descriptor generator).
// ---------------------------------------------------------------------------
const CHECKS = {};
for (const def of CHECK_DEFS) {
  const evaluator = EVALUATORS[def.kind];
  if (!evaluator) throw new Error(`assert-data-bounds compute: no evaluator for kind "${def.kind}" (check ${def.id})`);
  const dispatchFn = (ctx) => evaluator(ctx, def);
  Object.defineProperty(dispatchFn, 'name', { value: def.id, configurable: true });
  CHECKS[def.id] = dispatchFn;
}

// Loaders whose underlying query errors are NEVER fatal (costest/ghost swallow
// internally already) — every OTHER check's dispatch call is intentionally left
// UNCAUGHT here so a genuine query failure propagates out of compute() (see the
// file header's halt-classification note).
const NON_FATAL_LOADERS = new Set(['costest', 'ghost']);

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else.
 *
 * Only `costest`/`ghost`-loader checks get a per-check error boundary here
 * (matching their own internal swallow-everything catch, belt-and-braces).
 * Every other check's error is left to propagate — Spec 30 §5.4.1's halt
 * contract (see file header).
 */
async function compute(ctx) {
  ctx.log.info(`[${ctx.descriptor.identity.name}]`, '=== CQA Tier 2: Data Bounds Validation ===');
  for (const id of ctx.checks) {
    const def = CHECK_DEFS.find((d) => d.id === id);
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    if (def && NON_FATAL_LOADERS.has(def.loader)) {
      try {
        await check(ctx);
      } catch (err) {
        ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
        ctx.report(id, { error: err });
      }
    } else {
      // Deliberately uncaught — see file header (Spec 30 §5.4.1 halt contract).
      await check(ctx);
    }
  }
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// Named loader exports — additive, for direct unit testing of the
// deploy-ordering guard WITHOUT a live database (src/tests/steps/
// assert_data_bounds/missing-table-guard.test.ts). The loaders already took
// `ctx` as their only argument; exporting them changes no production path
// (loadBranch — the sole internal caller — is untouched).
module.exports.loadWsibBranch = loadWsibBranch;
module.exports.loadInspectionBranch = loadInspectionBranch;
