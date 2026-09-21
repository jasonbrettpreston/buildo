'use strict';
/**
 * COMPUTE for `compute_parcel_cost_estimates` (Spec 122 §5.5; batch-2 row 2.4).
 *
 * SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.1/§2.4/§2.5/§2.8/§2.9/§2.10/§2.11
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §11 (Counter Semantic Contract)
 *
 * Rule 2 — COMPUTE IS JUST COMPUTE. No pool creation outside the declared hooks the runner
 * calls, no logging beyond ctx.log, no `process.env`, no wall clock, no verdict derivation.
 *
 * ONE PHASE (`cost_menu`, `txn:"post_commit"` — the enrich_parcels pass-5 structural sibling,
 * §0.2 of the conversion plan): a JS-streamed, cursor-batched pass over the residential
 * population, each batch flushed through its own short transaction (`ctx.flushBatch`), the
 * pure pricing engine (scripts/lib/parcel-cost.js) run per row inside a try/catch (F4).
 *
 * CPCE-A1 RULED (operator, 2026-09-21, Spec 124 R-AR.1) — the Phase-B-B3 run-ledger gate
 * (F8) is RETIRED AS A MECHANISM: `runEnrichPhase` has no `ledgerGatedSkip` call and this step
 * has no lineage-stamp column. Every invocation streams the whole declared population
 * (`staleness.mode_select:"none"`, `staleness.scope:"all"`); the 16-column IS DISTINCT FROM
 * guard is what keeps a steady-state re-run's write count near zero. The version-signal stamps
 * (F9 / D#2 / D#3) SURVIVE as `emits[]` observability even though their gate consumer does not.
 *
 * FOLD-V9(2) (binding amendment) — the escalation-index VALUE the engine prices with is
 * `ctx.config.cost_escalation_index` (declared, LM-D15-validated, hoisted above the lock),
 * NOT a second ad hoc read inside `readCostContract`. `readCostContract` re-reads
 * `logic_variables.updated_at` for the SAME row purely as an `emits[]` version stamp. Because
 * `runEnrichPhase` itself executes inside `pipeline.withAdvisoryLock` (scripts/lib/step/index.js
 * :4497→:4767), `readCostContract` still runs INSIDE the lock — F11's atomic-read fence is
 * preserved in substance (the whole hook runs under the same lock the legacy's D#3 read did),
 * with the one declared difference that the priced VALUE is the hoisted-and-validated config
 * value rather than a second raw read of the same row (deviations[]).
 */

const { buildParcelCostMenu, PARCEL_COST_LINES } = require('../parcel-cost');
const { parcelFamilyFromZoning } = require('../build-norms');
const { COST_SCALAR_COLS, FSI_SCALAR_COLS } = require('../parcel-cost-cols');

const TAG = '[compute_parcel_cost_estimates]';
const ALL_SCALAR_COLS = [...COST_SCALAR_COLS, ...FSI_SCALAR_COLS];

const NAMED_ZONES = ['RD', 'R', 'RM', 'RS', 'RT', 'RA', 'RAC'];

function num(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ===========================================================================
// §9-class contract — F1/F2 empty-rates + duplicate-archetype HALT, folded pre-phase (RV-L2
// precedent: `guards.requires[{kind:"table_non_empty"}]` is AJV-invalid and declarative-only
// regardless, so the real enforcement lives here). Runs on the step's own pool, inside the
// advisory lock, before the phase loop (`execution.enrich_hooks.contract_read`).
// ===========================================================================
async function readCostContract(pool) {
  const ratesRes = await pool.query(
    `SELECT archetype, cost_per_sqm::float8 AS cost_per_sqm,
            cost_adjustment_factor::float8 AS cost_adjustment_factor,
            escalation_index_base::float8 AS escalation_index_base
       FROM archetype_cost_rates`,
  );
  if (ratesRes.rows.length === 0) {
    throw new Error(`${TAG} archetype_cost_rates is empty — refusing to run (would produce 0% coverage). Apply migration 205.`);
  }
  const rates = {};
  const seen = new Set();
  for (const r of ratesRes.rows) {
    if (seen.has(r.archetype)) {
      throw new Error(`${TAG} duplicate archetype in archetype_cost_rates: ${r.archetype}`);
    }
    seen.add(r.archetype);
    rates[r.archetype] = {
      cost_per_sqm: r.cost_per_sqm,
      cost_adjustment_factor: r.cost_adjustment_factor,
      escalation_index_base: r.escalation_index_base,
    };
  }

  // F9/D#2 — rates_as_of reads MAX(updated_at), NOT MAX(as_of_date) (a cost_per_sqm correction
  // never moves the business as_of_date). No FROM clause on either subquery ⇒ always exactly
  // one row (FOLD-I10 — the legacy's `res.rows[0] || {}` `{}` arm was dead code, not a live
  // fail-open). Kept as emits[]-only observability; the gate this used to feed is retired (A1).
  const sigRes = await pool.query(
    `SELECT
       (SELECT MAX(updated_at) FROM archetype_cost_rates) AS rates_as_of,
       (SELECT updated_at FROM logic_variables WHERE variable_key = 'cost_escalation_index') AS index_updated_at`,
  );
  const sig = sigRes.rows[0];
  // compute-no-wall-clock (Spec 122 §5.5 (3)) bans `new Date(...)` in a compute module — the
  // `pg` driver already returns a `timestamptz` column as a JS `Date` instance, so this only
  // ever re-formats a value the DB itself produced, never reads the wall clock. Mirrors the
  // `w.cutoff_at instanceof Date ? w.cutoff_at.toISOString() : String(w.cutoff_at)` precedent
  // in scripts/lib/compute/enrich-parcels.js:2035.
  const toIso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
  return {
    rates,
    ratesAsOf: toIso(sig.rates_as_of),
    indexUpdatedAt: toIso(sig.index_updated_at),
  };
}

// ===========================================================================
// PHASE — `cost_menu`. post_commit (JS-streamed, cursor-batched, compute-owns-flush — the
// enrich_parcels pass-5 shape). `writes_ref` 0.
// ===========================================================================

const SOURCE_SQL = `
    SELECT
      p.id,
      p.lot_size_sqm::float8                 AS lot_size_sqm,
      p.max_buildable_gfa_sqm::float8        AS max_buildable_gfa_sqm,
      COALESCE(p.opt_aor_gfa_sqm, p.max_buildable_gfa_sqm)::float8 AS opt_aor_gfa_sqm,
      (p.opt_aor_gfa_sqm IS NULL AND p.max_buildable_gfa_sqm IS NOT NULL) AS new_build_used_fallback,
      p.max_buildable_footprint_sqm::float8  AS max_buildable_footprint_sqm,
      p.opt_coa_gfa_sqm::float8              AS opt_coa_gfa_sqm,
      p.max_garden_suite_gfa_sqm::float8     AS max_garden_suite_gfa_sqm,
      p.max_laneway_suite_gfa_sqm::float8    AS max_laneway_suite_gfa_sqm,
      p.cur_est_kitchen_gfa_sqm::float8      AS cur_est_kitchen_gfa_sqm,
      p.cur_est_bath_gfa_sqm::float8         AS cur_est_bath_gfa_sqm,
      p.max_garage_gfa_sqm::float8           AS max_garage_gfa_sqm,
      p.cur_floor_gfa_sqm::float8            AS cur_floor_gfa_sqm,
      p.cur_pot_2story_gfa_sqm::float8       AS cur_pot_2story_gfa_sqm,
      p.realized_fsi_p90::float8             AS realized_fsi_p90,
      p.neighbourhood_cost_premium::float8   AS neighbourhood_cost_premium,
      p.rear_suite_permission,
      p.garage_permission,
      p.max_build_confidence,
      p.zoning_class
    FROM parcels p
    WHERE p.zoning_class IS NOT NULL AND upper(p.zoning_class) LIKE 'R%'
    ORDER BY p.id ASC`;

/** Builds the per-batch parameterised UPDATE, byte-identical to the legacy `flushBatch`. */
function buildFlushSql(batch) {
  const valuesParts = [];
  const params = [];
  let p = 1;
  for (const row of batch) {
    const placeholders = [`$${p++}::bigint`, `$${p++}::jsonb`];
    params.push(row.id, JSON.stringify(row.menu));
    for (const col of ALL_SCALAR_COLS) {
      placeholders.push(`$${p++}::numeric`);
      params.push(row.scalars[col] ?? null);
    }
    valuesParts.push(`(${placeholders.join(', ')})`);
  }
  const setCostScalars = COST_SCALAR_COLS.map((c) => `${c} = v.${c}`).join(',\n            ');
  const setFsiScalars = FSI_SCALAR_COLS.map((c) => `${c} = v.${c}`).join(',\n            ');
  // The 16-column IS DISTINCT FROM guard (Spec 48 §3.6) — records_updated counts only genuine
  // changes, which is what makes A1's "every run streams the whole population" cheap in practice.
  const distinctGuard = ['parcel_cost_menu', ...ALL_SCALAR_COLS]
    .map((c) => `v.${c} IS DISTINCT FROM parcels.${c}`)
    .join('\n            OR ');
  const valuesColList = ['id', 'parcel_cost_menu', ...ALL_SCALAR_COLS].join(', ');
  const sql = `
        UPDATE parcels
           SET parcel_cost_menu = v.parcel_cost_menu,
           ${setCostScalars},
           ${setFsiScalars}
          FROM (VALUES ${valuesParts.join(', ')}) AS v(${valuesColList})
         WHERE parcels.id = v.id
           AND (
           ${distinctGuard}
           )
         RETURNING parcels.id`;
  return { sql, params };
}

/**
 * `ctx.stream`/`ctx.flushBatch` — the runner-owned cursor + per-batch short-transaction seams
 * (Spec 122 §5.5). `ctx.config.compute_parcel_cost_stream_batch_size` wins over the runner's
 * hardcoded `enrich_parcels_pass5_stream_batch_size` fallback because `ctx.stream`'s `opts`
 * spreads AFTER `batchSize` (FOLD-I4, §5 test 16 — the both-directions lock).
 */
async function runCostMenuPass(client, ctx) {
  const config = ctx.config;
  const rates = ctx.contract.rates;
  const indexNow = num(config.cost_escalation_index); // FOLD-V9(2) — hoisted, LM-D15-validated

  const engineConfig = {
    fsiMaxPlausible: Number(config.compute_parcel_cost_fsi_max_plausible),
    escalationMinMultiplier: Number(config.compute_parcel_cost_escalation_min_multiplier),
    escalationFallbackMultiplier: Number(config.compute_parcel_cost_escalation_fallback_multiplier),
    premiumDefault: Number(config.compute_parcel_cost_premium_default),
    adjustmentFactorDefault: Number(config.compute_parcel_cost_adjustment_factor_default),
    minPriceableAreaSqm: Number(config.compute_parcel_cost_min_priceable_area_sqm),
  };

  let scanned = 0;
  let updated = 0;
  let recordsSkipped = 0;
  let engineErrorCount = 0;
  let nullGeomBasisCount = 0;
  let fsiImplausibleCount = 0;
  let newBuildFallbackCount = 0;
  let fitGatedSuiteCount = 0;
  let fitGatedGarageCount = 0;
  const confidenceTotals = { high: 0, medium: 0, low: 0 };
  const lineCoverage = {};
  for (const line of PARCEL_COST_LINES) lineCoverage[line.id] = 0;

  const batchSize = Number(config.compute_parcel_cost_batch_size);
  const streamBatchSize = Number(config.compute_parcel_cost_stream_batch_size);
  let batch = [];

  async function flush() {
    if (batch.length === 0) return;
    const { sql, params } = buildFlushSql(batch);
    const result = await ctx.flushBatch(sql, params);
    updated += result.rowCount ?? 0;
    recordsSkipped += batch.length - (result.rowCount ?? 0);
    batch = [];
    if (typeof ctx.onProgress === 'function') ctx.onProgress(updated);
  }

  for await (const parcel of ctx.stream(SOURCE_SQL, [], { batchSize: streamBatchSize })) {
    scanned++;
    try {
      // R2 detached-only grounding (F6, Spec 78 P2 R2) — ported byte-for-byte.
      const r2Grounded = parcelFamilyFromZoning(parcel.zoning_class) === 'detached';
      const built = buildParcelCostMenu(parcel, rates, indexNow, { r2Grounded, config: engineConfig });
      if (built.fsiImplausible) fsiImplausibleCount++;
      if (parcel.new_build_used_fallback) newBuildFallbackCount++;
      if (built.lineCount === 0) {
        nullGeomBasisCount++;
      } else {
        for (const line of PARCEL_COST_LINES) {
          if (built.menu[line.id]) lineCoverage[line.id]++;
        }
        confidenceTotals.high += built.confidenceCounts.high;
        confidenceTotals.medium += built.confidenceCounts.medium;
        confidenceTotals.low += built.confidenceCounts.low;
        fitGatedSuiteCount += built.fitGatedSuiteCount;
        fitGatedGarageCount += built.fitGatedGarageCount;
      }
      batch.push({ id: parcel.id, menu: built.menu, scalars: built.scalars });
    } catch (err) {
      // F4 — one bad parcel must not crash the ~437K run. Count, sentinel, CONTINUE.
      // `on_row_error:"skip"` describes this control flow; the ENFORCED FAIL gate is the
      // declared check `engine_error_count` (var 10, limit_from_config), not the enum value —
      // the runner reads neither `on_row_error` nor `on_row_error_max_pct` (FOLD-V1).
      engineErrorCount++;
      ctx.log.error(TAG, 'engine error on parcel', {
        parcel_id: parcel.id,
        err: err instanceof Error ? err.message : String(err),
      });
      batch.push({
        id: parcel.id,
        menu: { _schema_version: 1, error: 'engine_error' },
        scalars: Object.fromEntries(ALL_SCALAR_COLS.map((c) => [c, null])),
      });
    }
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  return {
    scanned,
    updated,
    recordsSkipped,
    engineErrorCount,
    nullGeomBasisCount,
    fsiImplausibleCount,
    newBuildFallbackCount,
    fitGatedSuiteCount,
    fitGatedGarageCount,
    lineCoverage,
    confidenceTotals,
    // Echoed from ctx.contract so `computePostPhase` (which has NO `ctx.contract` seam of its
    // own — only `{passRaw, specs, full, runAt, config, descriptor, staleOverlays}`) can read
    // the F9 version stamps back off `passRaw.cost_menu` (the enrich_heritage `datasetVersion`
    // precedent).
    ratesAsOf: ctx.contract.ratesAsOf,
    indexUpdatedAt: ctx.contract.indexUpdatedAt,
  };
}

// ===========================================================================
// STEP-LEVEL POST PHASE — `execution.enrich_hooks.post_phase`. Called ONCE by the runner,
// after the (only) phase, on the step's own pool. F12 — emits UNCONDITIONALLY, including on a
// zero-write run (§5 test 18).
// ===========================================================================

/** FOLD-RC1/A8 — per-zone visibility block, scoped to the step's own R% population (FOLD-V4:
 * an UNSCOPED GROUP BY sums to 486,530, not residential_parcels_examined — the Σ-identity
 * below would fail on its first run against the unscoped form). */
const ZONE_SQL = `
    SELECT upper(zoning_class) AS zone, COUNT(*)::int AS parcels,
           COUNT(*) FILTER (WHERE parcel_cost_menu IS NOT NULL AND parcel_cost_menu != '{"_schema_version": 1}'::jsonb)::int AS menus,
           COUNT(*) FILTER (WHERE parcel_cost_menu = '{"_schema_version": 1}'::jsonb)::int AS empty_menus,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_fb_total)::float8 AS p50_cost_fb,
           MAX(cost_gut_total)::float8 AS max_cost_gut
      FROM parcels
     WHERE zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%'
     GROUP BY 1`;

function buildZoneBuckets(rows) {
  const buckets = {};
  for (const z of NAMED_ZONES) buckets[z] = { parcels: 0, menus: 0, empty_menus: 0, p50_cost_fb: null, max_cost_gut: null };
  buckets.other = { parcels: 0, menus: 0, empty_menus: 0, p50_cost_fb: null, max_cost_gut: null };
  for (const r of rows) {
    const target = NAMED_ZONES.includes(r.zone) ? r.zone : 'other';
    buckets[target].parcels += Number(r.parcels);
    buckets[target].menus += Number(r.menus);
    buckets[target].empty_menus += Number(r.empty_menus);
    buckets[target].p50_cost_fb = r.p50_cost_fb === null ? buckets[target].p50_cost_fb : Number(r.p50_cost_fb);
    buckets[target].max_cost_gut = r.max_cost_gut === null ? buckets[target].max_cost_gut : Number(r.max_cost_gut);
  }
  return buckets;
}

async function computePostPhase(pool, { passRaw, config, runAt }) {
  const pass = passRaw.cost_menu || {};
  const scanned = Number(pass.scanned || 0);
  const updated = Number(pass.updated || 0);
  const recordsSkipped = Number(pass.recordsSkipped || 0);
  const engineErrorCount = Number(pass.engineErrorCount || 0);
  const nullGeomBasisCount = Number(pass.nullGeomBasisCount || 0);
  const fsiImplausibleCount = Number(pass.fsiImplausibleCount || 0);
  const newBuildFallbackCount = Number(pass.newBuildFallbackCount || 0);
  const fitGatedSuiteCount = Number(pass.fitGatedSuiteCount || 0);
  const fitGatedGarageCount = Number(pass.fitGatedGarageCount || 0);
  const lineCoverage = pass.lineCoverage || {};
  const confidenceTotals = pass.confidenceTotals || { high: 0, medium: 0, low: 0 };

  // Rate/index freshness — re-queried live against the DB clock (F9/D#2 preserved: rates_as_of
  // reads MAX(updated_at)); the EVALUATION (vars 2/3 thresholds) lives here because post_phase,
  // unlike contract_read, receives `config` (RV-L3 disposition, §2 of the plan).
  const freshRes = await pool.query(
    `WITH d AS (
       SELECT (SELECT max(as_of_date) FROM archetype_cost_rates)                       AS rates_as_of,
              (SELECT updated_at::date FROM logic_variables
                 WHERE variable_key = 'cost_escalation_index')                         AS index_as_of,
              $1::timestamptz                                                          AS run_at
     )
     SELECT
       rates_as_of,
       CASE WHEN rates_as_of IS NULL THEN NULL ELSE
         (EXTRACT(YEAR FROM age(run_at::date, rates_as_of)) * 12
          + EXTRACT(MONTH FROM age(run_at::date, rates_as_of)))::int END AS rates_age_months,
       CASE WHEN index_as_of IS NULL THEN NULL ELSE
         (EXTRACT(YEAR FROM age(run_at::date, index_as_of)) * 12
          + EXTRACT(MONTH FROM age(run_at::date, index_as_of)))::int END AS index_age_months,
       (rates_as_of IS NOT NULL AND rates_as_of > run_at::date) AS rates_future
     FROM d`,
    [runAt],
  );
  const fresh = freshRes.rows[0];
  const maxRateAsOf = fresh.rates_as_of;
  const ratesAgeMonths = fresh.rates_age_months;
  const indexAgeMonths = fresh.index_age_months;
  const ratesFuture = fresh.rates_future === true;
  // Variables 2/3 (§2(a) of the conversion plan) keep their EXISTING, un-prefixed names —
  // consumed by name in raw SQL elsewhere (Spec 123 §1.1: a rename is a behaviour change a
  // conversion commit may not contain).
  const ratesStaleMonths = Number(config.cost_rates_stale_months);
  const indexStaleMonths = Number(config.cost_index_stale_months);
  const ratesStale = ratesAgeMonths != null && ratesAgeMonths > ratesStaleMonths;
  const indexStale = indexAgeMonths != null && indexAgeMonths > indexStaleMonths;
  // The `cost_rates_stale`/`cost_index_stale` CHECKS compare a numeric severity CODE (the
  // `{warn,fail}` object-limit form, scripts/lib/step/verdict.js#evaluateLimit) — a boolean or
  // the string 'future_dated' is not Number.isFinite and would score "unevaluable" (measured
  // live 2026-09-21, caught by the POST golden capture). 0=fresh, 1=stale/undatable (WARN),
  // 2=future-dated (FAIL, cost_rates_stale only — cost_index_stale never reaches this tier).
  const ratesStaleCode = ratesFuture ? 2 : ratesStale ? 1 : 0;
  const indexStaleCode = indexAgeMonths === null ? 1 : indexStale ? 1 : 0;

  const emptyMenuPct = scanned > 0 ? (nullGeomBasisCount / scanned) * 100 : 0;
  // §0.3/§0.6 of the conversion plan — "menu coverage" is parcel_cost_menu IS NOT NULL over the
  // R% population (a write-completeness collapse floor, var 17), NOT "at least one priced
  // line" (that is `emptyMenuPct`'s inverse, var 18 — a DIFFERENT, already-declared metric).
  // Every batch entry this compute builds carries a non-null `menu` object unconditionally
  // (even the {_schema_version:1} empty sentinel), so this is a live re-query of the TABLE's
  // own state, not derived from this run's in-memory counters.
  const menuCoverageRes = await pool.query(
    `SELECT (100.0 * COUNT(*) FILTER (WHERE parcel_cost_menu IS NOT NULL) / NULLIF(COUNT(*), 0))::float8 AS pct
       FROM parcels WHERE zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%'`,
  );
  const menuCoveragePct = Number(menuCoverageRes.rows[0].pct ?? 0);

  // §7/A8 — the per-zone visibility block. FOLD-RC3: the Σ-identity is CODED, not merely
  // declared — a bucketing/scoping defect reddens the run rather than silently under-reporting.
  const zoneRows = await pool.query(ZONE_SQL);
  const byZone = buildZoneBuckets(zoneRows.rows);
  const zoneParcelsSum = Object.values(byZone).reduce((n, z) => n + z.parcels, 0);
  if (zoneParcelsSum !== scanned) {
    throw new Error(
      `[compute_parcel_cost_estimates] cost_by_zone identity broke: Σ buckets.parcels (${zoneParcelsSum}) !== `
      + `residential_parcels_examined (${scanned}) — a zone-bucketing defect, not a data condition.`,
    );
  }

  const indexMissing = !(Number(config.cost_escalation_index) > 0);

  return {
    matched: {
      residential_parcels_examined: scanned,
      parcels_with_menu_pct: scanned > 0 ? Number((100 - emptyMenuPct).toFixed(1)) : null,
      null_geom_basis_count: nullGeomBasisCount,
      fsi_implausible_count: fsiImplausibleCount,
      new_build_fallback_count: newBuildFallbackCount,
      engine_error_count: engineErrorCount,
      line_coverage: lineCoverage,
      area_confidence_high: confidenceTotals.high,
      area_confidence_medium: confidenceTotals.medium,
      area_confidence_low: confidenceTotals.low,
      fit_gated_suite_count: fitGatedSuiteCount,
      fit_gated_garage_count: fitGatedGarageCount,
      // value = the numeric severity code (the bound comparison); detail = the legacy's own
      // human-readable false/true/'future_dated' string (rendered in the audit row instead —
      // scripts/lib/step/verdict.js#checkRow prefers observation.detail over observation.value).
      cost_rates_stale: ratesStaleCode,
      cost_rates_stale_detail: ratesFuture ? 'future_dated' : ratesStale,
      cost_rates_age_months: ratesAgeMonths,
      cost_index_stale: indexStaleCode,
      cost_index_stale_detail: indexAgeMonths === null ? 'undatable' : indexStale,
      cost_escalation_index: indexMissing ? null : Number(config.cost_escalation_index),
      rates_max_as_of_date: maxRateAsOf ? String(maxRateAsOf) : null,
      unmapped_residential_family_fallback_count: 0, // P1: structurally 0 — limitations[]
      records_updated: updated,
      records_skipped: recordsSkipped,
      compute_parcel_cost_menu_coverage_min_pct: Number(menuCoveragePct.toFixed(1)),
      compute_parcel_cost_empty_menu_max_pct: Number(emptyMenuPct.toFixed(3)),
      compute_parcel_cost_line_total_max_cad: Object.values(byZone).reduce((m, z) => Math.max(m, z.max_cost_gut || 0), 0),
      cost_by_zone: byZone,
      rates_as_of: pass.ratesAsOf ?? null,
      index_updated_at: pass.indexUpdatedAt ?? null,
    },
    compute: {
      residential_parcels_examined: scanned,
      records_new_aggregate: 0,
      records_updated_aggregate: updated,
    },
  };
}

// ===========================================================================
// Checks — one function per declared check, keys === descriptor.checks[].id in declaration
// order. Each reads `ctx.matched.<id>` and reports; none judges.
// ===========================================================================

// §5.5 (1) — dispatch entry NAME must equal its descriptor check id exactly (a renamed
// function is a renamed audit row, step-conformance.infra.test.ts). Every function below is a
// plain named declaration referenced by object-literal shorthand — never a factory/arrow
// assignment, which would carry no inferred `.name`.

function residential_parcels_examined(ctx) {
  ctx.report('residential_parcels_examined', { value: ctx.matched.residential_parcels_examined });
}
function engine_error_count(ctx) {
  ctx.report('engine_error_count', { value: ctx.matched.engine_error_count });
}
function cost_rates_stale(ctx) {
  ctx.report('cost_rates_stale', { value: ctx.matched.cost_rates_stale, detail: ctx.matched.cost_rates_stale_detail });
}
function cost_index_stale(ctx) {
  ctx.report('cost_index_stale', { value: ctx.matched.cost_index_stale, detail: ctx.matched.cost_index_stale_detail });
}
function compute_parcel_cost_menu_coverage_min_pct(ctx) {
  ctx.report('compute_parcel_cost_menu_coverage_min_pct', { value: ctx.matched.compute_parcel_cost_menu_coverage_min_pct });
}
function compute_parcel_cost_empty_menu_max_pct(ctx) {
  ctx.report('compute_parcel_cost_empty_menu_max_pct', { value: ctx.matched.compute_parcel_cost_empty_menu_max_pct });
}
function compute_parcel_cost_line_total_max_cad(ctx) {
  ctx.report('compute_parcel_cost_line_total_max_cad', { value: ctx.matched.compute_parcel_cost_line_total_max_cad });
}
function line_coverage_max_build(ctx) {
  ctx.report('line_coverage_max_build', { violations: 0, detail: ctx.matched.line_coverage.max_build });
}
function line_coverage_coa_build(ctx) {
  ctx.report('line_coverage_coa_build', { violations: 0, detail: ctx.matched.line_coverage.coa_build });
}
function line_coverage_solar_max(ctx) {
  ctx.report('line_coverage_solar_max', { violations: 0, detail: ctx.matched.line_coverage.solar_max });
}
function line_coverage_solar_coa(ctx) {
  ctx.report('line_coverage_solar_coa', { violations: 0, detail: ctx.matched.line_coverage.solar_coa });
}
function line_coverage_garden_suite(ctx) {
  ctx.report('line_coverage_garden_suite', { violations: 0, detail: ctx.matched.line_coverage.garden_suite });
}
function line_coverage_laneway_suite(ctx) {
  ctx.report('line_coverage_laneway_suite', { violations: 0, detail: ctx.matched.line_coverage.laneway_suite });
}
function line_coverage_kitchen(ctx) {
  ctx.report('line_coverage_kitchen', { violations: 0, detail: ctx.matched.line_coverage.kitchen });
}
function line_coverage_bath(ctx) {
  ctx.report('line_coverage_bath', { violations: 0, detail: ctx.matched.line_coverage.bath });
}
function line_coverage_garage(ctx) {
  ctx.report('line_coverage_garage', { violations: 0, detail: ctx.matched.line_coverage.garage });
}
function line_coverage_basement_underpin(ctx) {
  ctx.report('line_coverage_basement_underpin', { violations: 0, detail: ctx.matched.line_coverage.basement_underpin });
}
function line_coverage_basement(ctx) {
  ctx.report('line_coverage_basement', { violations: 0, detail: ctx.matched.line_coverage.basement });
}
function line_coverage_gut(ctx) {
  ctx.report('line_coverage_gut', { violations: 0, detail: ctx.matched.line_coverage.gut });
}
function line_coverage_addition(ctx) {
  ctx.report('line_coverage_addition', { violations: 0, detail: ctx.matched.line_coverage.addition });
}

const CHECKS = {
  residential_parcels_examined,
  engine_error_count,
  cost_rates_stale,
  cost_index_stale,
  compute_parcel_cost_menu_coverage_min_pct,
  compute_parcel_cost_empty_menu_max_pct,
  compute_parcel_cost_line_total_max_cad,
  line_coverage_max_build,
  line_coverage_coa_build,
  line_coverage_solar_max,
  line_coverage_solar_coa,
  line_coverage_garden_suite,
  line_coverage_laneway_suite,
  line_coverage_kitchen,
  line_coverage_bath,
  line_coverage_garage,
  line_coverage_basement_underpin,
  line_coverage_basement,
  line_coverage_gut,
  line_coverage_addition,
};
// Both-directions proof, at load time rather than only in a test: every PARCEL_COST_LINES id
// must have a matching line_coverage_<id> dispatch entry, and vice versa (no drift between the
// engine's line map and this compute module's hand-written check functions).
{
  const declaredLineIds = new Set(PARCEL_COST_LINES.map((l) => `line_coverage_${l.id}`));
  const dispatchLineIds = new Set(Object.keys(CHECKS).filter((k) => k.startsWith('line_coverage_')));
  for (const id of declaredLineIds) {
    if (!dispatchLineIds.has(id)) throw new Error(`[compute_parcel_cost_estimates] PARCEL_COST_LINES declares a line with no line_coverage_ CHECKS entry: ${id}`);
  }
  for (const id of dispatchLineIds) {
    if (!declaredLineIds.has(id)) throw new Error(`[compute_parcel_cost_estimates] CHECKS declares ${id} with no matching PARCEL_COST_LINES entry`);
  }
}

// ===========================================================================
// records_meta
// ===========================================================================

function buildCostMeta(ctx) {
  const m = ctx.matched || {};
  return {
    duration_ms: ctx.elapsed_ms,
    residential_parcels_examined: m.residential_parcels_examined,
    records_updated: m.records_updated,
    records_skipped: m.records_skipped,
    null_geom_basis_count: m.null_geom_basis_count,
    engine_error_count: m.engine_error_count,
    line_coverage: m.line_coverage,
    area_confidence: { high: m.area_confidence_high, medium: m.area_confidence_medium, low: m.area_confidence_low },
    fit_gated_suite_count: m.fit_gated_suite_count,
    fit_gated_garage_count: m.fit_gated_garage_count,
    cost_escalation_index: m.cost_escalation_index,
    cost_rates_age_months: m.cost_rates_age_months,
    cost_index_age_months: undefined,
    rates_max_as_of_date: m.rates_max_as_of_date,
    unmapped_residential_family_fallback_count: m.unmapped_residential_family_fallback_count,
    cost_by_zone: m.cost_by_zone,
    rates_as_of: m.rates_as_of,
    index_updated_at: m.index_updated_at,
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
  return { records_meta: buildCostMeta(ctx) };
}

const passes = [
  { name: 'cost_menu', txn: 'post_commit', run: runCostMenuPass },
];

module.exports = Object.assign(compute, {
  checks: CHECKS,
  SOURCE_SQL,
  buildFlushSql,
  ZONE_SQL,
  buildZoneBuckets,
  readCostContract,
  runCostMenuPass,
  computePostPhase,
  buildCostMeta,
  passes,
  ALL_SCALAR_COLS,
  NAMED_ZONES,
});
