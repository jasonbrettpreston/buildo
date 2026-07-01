#!/usr/bin/env node
/**
 * compute-parcel-cost-estimates.js — Parcel Renovation Cost Model (Mutator)
 *
 * Streams every RESIDENTIAL parcel through the pure engine (scripts/lib/parcel-cost.js)
 * and writes a menu of 13 priced renovation scenarios to `parcels.parcel_cost_menu`
 * (JSONB) + the 12 headline cost scalars + 3 FSI scalars (§2.5). PURE PARCEL MODEL —
 * external industry cost ONLY (archetype_cost_rates); NO permit data, NO declared cost,
 * NO Liar's Gate (Spec 88 §1).
 *
 * The per-trade/product breakdown is DEFERRED to P3 (the menu emits trades:null /
 * products:null — a documented not-yet-calibrated sentinel; the total is the anchor).
 *
 * Idempotent full-rewrite: re-runnable; the batched UPDATE carries an IS DISTINCT FROM
 * guard so records_updated counts only parcels whose cost actually changed. Per-parcel
 * try/catch → engine_error_count++ + an `error` sentinel in that parcel's JSONB +
 * CONTINUE (one bad row must not crash the ~380K run).
 *
 * Structure: `computeParcelCostEstimates(pool, opts)` is the testable core (no lock, no
 * summary emission — like compute-storey-norms). `main()` wraps it in pipeline.run with
 * the advisory lock + emitSummary/emitMeta. The DB test calls the core directly.
 *
 * Usage:
 *   node scripts/compute-parcel-cost-estimates.js [--dry-run] [--limit=N]
 *
 * SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.1/2.4/2.9/2.11
 *            docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 *            docs/specs/01-pipeline/48_pipeline_observability.md §3.6 (row-derived verdict)
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { safeParsePositiveInt } = require('./lib/safe-math');
const { buildParcelCostMenu, PARCEL_COST_LINES } = require('./lib/parcel-cost');
const { parcelFamilyFromZoning } = require('./lib/build-norms'); // Spec 78 P2 R2 — detached-only norm_basis
const { COST_SCALAR_COLS, FSI_SCALAR_COLS } = require('./lib/parcel-cost-cols');

// §R2 — advisory lock. The owning Spec is 88, but lock 88 is taken by classify-permits.js
// (predates the spec-number convention). Per the compute-phase-calibration / backfill-realtor
// precedent (free-ID when the owning-spec slot is taken), lock 117 is assigned from the
// post-Wave-7 free range. The audit_table `phase` below still carries the spec number (88).
const ADVISORY_LOCK_ID = 117;

// Spec 47 §6.3: BATCH_SIZE = floor((65535 - 1) / column_count). The UPDATE VALUES
// row carries 17 columns (id + parcel_cost_menu + 12 cost scalars + 3 FSI scalars).
const PARCEL_UPDATE_COL_COUNT = 17;
const UPDATE_BATCH_SIZE = Math.min(1000, Math.floor((65535 - 1) / PARCEL_UPDATE_COL_COUNT));

// §R4 — logic_variables consumed by this script (Spec 88 §2.8/2.9). The per-archetype
// rate + escalation_index_base + cost_adjustment_factor live in archetype_cost_rates
// (NOT logic_variables) — loaded separately by the core.
const ConfigSchema = z
  .object({
    // The current escalation index (StatCan BCPI Toronto CMA), manually updated quarterly.
    // Missing/invalid is tolerated at runtime (→ 1.0 multiplier + WARN), so this is optional;
    // when present it must be a positive finite number.
    cost_escalation_index: z.coerce.number().positive().finite().optional(),
    cost_rates_stale_months: z.coerce.number().int().positive(),
    cost_index_stale_months: z.coerce.number().int().positive(),
  })
  .passthrough();

// The 12 headline scalar columns (§2.5) + 3 FSI scalars (single-sourced in parcel-cost-cols.js,
// shared with enrich-permits.js's §4D propagation), in the order the UPDATE writes them.
const ALL_SCALAR_COLS = [...COST_SCALAR_COLS, ...FSI_SCALAR_COLS];

/**
 * Testable core. Loads the rate table, streams residential parcels, writes the cost
 * menu + scalars, and returns all observability counters + the built audit rows +
 * verdict. NO advisory lock + NO emitSummary/emitMeta (main() owns those).
 *
 * @param {import('pg').Pool} pool
 * @param {Object} [opts]
 * @param {boolean} [opts.dryRun]   skip writes
 * @param {number|null} [opts.rowLimit]  cap streamed rows
 * @param {Object} [opts.config]   resolved logic-var config
 * @param {number|null} [opts.config.indexNow]
 * @param {boolean} [opts.config.indexMissing]
 * @param {number} [opts.config.ratesStaleMonths]
 * @param {number} [opts.config.indexStaleMonths]
 * @returns {Promise<Object>} stats + auditRows + verdict
 */
async function computeParcelCostEstimates(pool, opts = {}) {
  const { dryRun = false, rowLimit = null } = opts;
  const config = opts.config || {};
  const indexNow = config.indexNow ?? null;
  const indexMissing = config.indexMissing ?? (indexNow == null || !Number.isFinite(indexNow) || indexNow <= 0);
  const ratesStaleMonths = Number(config.ratesStaleMonths ?? 3);
  const indexStaleMonths = Number(config.indexStaleMonths ?? 4);

  // §R3.5 — DB clock (not new Date()).
  const RUN_AT = await pipeline.getDbTimestamp(pool);
  const startTime = Date.now();

  // ── Load the rate table (bounded query — Spec 47 §6.2) ─────────────────────
  const ratesRes = await pool.query(
    `SELECT archetype, cost_per_sqm::float8 AS cost_per_sqm,
            cost_adjustment_factor::float8 AS cost_adjustment_factor,
            escalation_index_base::float8 AS escalation_index_base,
            as_of_date
       FROM archetype_cost_rates`,
  );

  // Startup guard: empty rates → 0% coverage. Refuse to run (clear signal, not a buried WARN).
  if (ratesRes.rows.length === 0) {
    throw new Error(
      '[compute-parcel-cost-estimates] archetype_cost_rates is empty — refusing to run (would produce 0% coverage). Apply migration 205.',
    );
  }

  /** @type {Record<string, {cost_per_sqm:number, cost_adjustment_factor:number, escalation_index_base:number}>} */
  const rates = {};
  const seen = new Set();
  for (const r of ratesRes.rows) {
    if (seen.has(r.archetype)) {
      throw new Error(`[compute-parcel-cost-estimates] duplicate archetype in archetype_cost_rates: ${r.archetype}`);
    }
    seen.add(r.archetype);
    rates[r.archetype] = {
      cost_per_sqm: r.cost_per_sqm,
      cost_adjustment_factor: r.cost_adjustment_factor,
      escalation_index_base: r.escalation_index_base,
    };
  }

  pipeline.log.info('[compute-parcel-cost-estimates]', `Loaded ${ratesRes.rows.length} archetype rates`);

  // ── Rate/index freshness via SQL against the DB clock (§2.9) — month-ages
  // computed in Postgres (no JS wall-clock new Date()). rates as_of in the
  // FUTURE → FAIL; older than the stale thresholds → WARN.
  const freshRes = await pool.query(
    `WITH d AS (
       SELECT (SELECT max(as_of_date) FROM archetype_cost_rates)                      AS rates_as_of,
              -- index staleness clock = the cost_escalation_index row's updated_at
              -- (auto-refreshes when an operator edits the index via the admin panel).
              (SELECT updated_at::date FROM logic_variables
                 WHERE variable_key = 'cost_escalation_index')                        AS index_as_of,
              $1::timestamptz                                                         AS run_at
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
    [RUN_AT],
  );
  const fresh = freshRes.rows[0];
  const maxRateAsOf = fresh.rates_as_of;
  const ratesAgeMonths = fresh.rates_age_months;
  const indexAgeMonths = fresh.index_age_months;
  const ratesFuture = fresh.rates_future === true;
  const ratesStale = ratesAgeMonths != null && ratesAgeMonths > ratesStaleMonths;
  const indexStale = indexAgeMonths != null && indexAgeMonths > indexStaleMonths;

  // ── Counters / observability accumulators ──────────────────────────────────
  let processed = 0;
  let recordsUpdated = 0;
  let recordsSkipped = 0;
  let engineErrorCount = 0;
  let nullGeomBasisCount = 0; // residential parcels with NO computable line (empty menu)
  let fsiImplausibleCount = 0; // parcels whose max_build/coa FSI was NULLed as a garbage max-build artifact
  let fitGatedSuiteCount = 0;
  let fitGatedGarageCount = 0;
  const unmappedFamilyFallbackCount = 0; // P1: always 0 (family logic is P2) — emitted for the inventory
  const confidenceTotals = { high: 0, medium: 0, low: 0 };
  /** @type {Record<string, number>} per-line coverage — always emitted incl. value:0 */
  const lineCoverage = {};
  for (const line of PARCEL_COST_LINES) lineCoverage[line.id] = 0;

  const batch = []; // [{ id, menu, scalars }]

  async function flushBatch() {
    if (batch.length === 0) return;
    if (dryRun) {
      batch.length = 0;
      return;
    }

    await pipeline.withTransaction(pool, async (client) => {
      const valuesParts = [];
      const params = [];
      let p = 1;
      for (const row of batch) {
        // id, parcel_cost_menu(jsonb), 12 cost scalars, 3 FSI scalars
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
      // IS DISTINCT FROM guard across the JSONB + every scalar → records_updated
      // counts only genuine changes (Spec 48 §3.6; the "don't hide" mandate — a
      // re-run with unchanged inputs reports 0 updated, not 380K).
      const distinctGuard = ['parcel_cost_menu', ...ALL_SCALAR_COLS]
        .map((c) => `v.${c} IS DISTINCT FROM parcels.${c}`)
        .join('\n            OR ');

      const valuesColList = ['id', 'parcel_cost_menu', ...ALL_SCALAR_COLS].join(', ');
      const result = await client.query(
        `UPDATE parcels
            SET parcel_cost_menu = v.parcel_cost_menu,
            ${setCostScalars},
            ${setFsiScalars}
           FROM (VALUES ${valuesParts.join(', ')}) AS v(${valuesColList})
          WHERE parcels.id = v.id
            AND (
            ${distinctGuard}
            )
          RETURNING parcels.id`,
        params,
      );
      recordsUpdated += result.rowCount ?? 0;
      recordsSkipped += batch.length - (result.rowCount ?? 0);
    });

    batch.length = 0;
  }

  // §R7 — stream all residential parcels (zoning_class R-prefixed: RD/RS/RT/RM/R).
  // Numerics cast to float8 for clean JS arithmetic; the engine's num() also coerces.
  const limitClause = rowLimit ? ` LIMIT ${rowLimit}` : '';
  const sourceStream = pipeline.streamQuery(
    pool,
    `
    SELECT
      p.id,
      p.lot_size_sqm::float8                 AS lot_size_sqm,
      p.max_buildable_gfa_sqm::float8        AS max_buildable_gfa_sqm,
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
    ORDER BY p.id ASC${limitClause}
    `,
  );

  for await (const parcel of sourceStream) {
    processed++;
    try {
      // R2 is DETACHED-ONLY (plan fold #3): only detached parcels' opt_coa_gfa is realized-FSI-grounded,
      // so only their coa_build line is r2_refined; townhouse/multiplex/generic stay pre_r2 (by-law).
      const r2Grounded = parcelFamilyFromZoning(parcel.zoning_class) === 'detached';
      const built = buildParcelCostMenu(parcel, rates, indexNow, { r2Grounded });
      if (built.fsiImplausible) fsiImplausibleCount++;
      if (built.lineCount === 0) {
        nullGeomBasisCount++;
      } else {
        // line_coverage counts parcels with a non-NULL area field for each line (the line is in the
        // menu). For fit-gated lines (suites/garage) this INCLUDES fits:false entries — they are still
        // priced + present (§2.4). So line_coverage_garden_suite = "area-available" parcels, NOT
        // "permitted-to-build" parcels (the fit_gated_* counters carry the not-permitted count).
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
      // §2.11 — one bad parcel must not crash the run. Log, count, write an
      // `error` sentinel into that parcel's JSONB (re-processable), continue.
      engineErrorCount++;
      pipeline.log.error('[compute-parcel-cost-estimates]', 'engine error on parcel', {
        parcel_id: parcel.id,
        err: err instanceof Error ? err.message : String(err),
      });
      batch.push({
        id: parcel.id,
        menu: { _schema_version: 1, error: 'engine_error' },
        scalars: Object.fromEntries(ALL_SCALAR_COLS.map((c) => [c, null])),
      });
    }

    if (batch.length >= UPDATE_BATCH_SIZE) {
      await flushBatch();
      if (processed % 50000 === 0) {
        pipeline.log.info('[compute-parcel-cost-estimates]', `Processed ${processed.toLocaleString()} parcels`);
      }
    }
  }
  await flushBatch();

  // ── Audit rows (Spec 48 §3.6 — ALWAYS emitted incl. value:0) ───────────────
  const coveragePct = processed > 0 ? ((processed - nullGeomBasisCount) / processed) * 100 : 0;
  const auditRows = [
    {
      metric: 'residential_parcels_examined',
      value: processed,
      threshold: '> 0',
      status: processed > 0 ? 'PASS' : 'INFO',
    },
    {
      metric: 'parcels_with_menu_pct',
      value: processed > 0 ? coveragePct.toFixed(1) + '%' : 'N/A',
      threshold: null,
      status: 'INFO',
    },
    { metric: 'null_geom_basis_count', value: nullGeomBasisCount, threshold: null, status: 'INFO' },
    // FSI NULLed as a garbage max-build artifact (implausible max_buildable_gfa ÷ lot) — surfaced, not hidden.
    { metric: 'fsi_implausible_count', value: fsiImplausibleCount, threshold: null, status: 'INFO' },
    // engine_error_count — deliberately strict: any engine error fails the step.
    {
      metric: 'engine_error_count',
      value: engineErrorCount,
      threshold: '== 0',
      status: engineErrorCount === 0 ? 'PASS' : 'FAIL',
    },
    // Per-line coverage (13 rows — INFO; value:0 at cold-start is expected, not a fault).
    ...PARCEL_COST_LINES.map((line) => ({
      metric: `line_coverage_${line.id}`,
      value: lineCoverage[line.id],
      threshold: null,
      status: 'INFO',
    })),
    { metric: 'area_confidence_high', value: confidenceTotals.high, threshold: null, status: 'INFO' },
    { metric: 'area_confidence_medium', value: confidenceTotals.medium, threshold: null, status: 'INFO' },
    { metric: 'area_confidence_low', value: confidenceTotals.low, threshold: null, status: 'INFO' },
    { metric: 'fit_gated_suite_count', value: fitGatedSuiteCount, threshold: null, status: 'INFO' },
    { metric: 'fit_gated_garage_count', value: fitGatedGarageCount, threshold: null, status: 'INFO' },
    // Rate freshness: stale → WARN; future-dated → FAIL; age companion always INFO. The value is
    // made informative (not a bare boolean) so a FAIL/WARN row is self-explanatory in the audit table.
    {
      metric: 'cost_rates_stale',
      value: ratesFuture ? 'future_dated' : ratesStale,
      threshold: `age <= ${ratesStaleMonths}mo`,
      status: ratesFuture ? 'FAIL' : ratesStale ? 'WARN' : 'PASS',
    },
    { metric: 'cost_rates_age_months', value: ratesAgeMonths ?? 'N/A', threshold: null, status: 'INFO' },
    // Index freshness. An UNDATABLE index (no cost_escalation_index row → its updated_at / indexAgeMonths
    // is NULL) means staleness can't be evaluated — surface that as WARN, never silent PASS (Spec 88 §2.9
    // + the "don't hide a bad result" mandate; review fold OBS-12).
    {
      metric: 'cost_index_stale',
      value: indexAgeMonths === null ? 'undatable' : indexStale,
      threshold: `age <= ${indexStaleMonths}mo`,
      status: indexAgeMonths === null ? 'WARN' : indexStale ? 'WARN' : 'PASS',
    },
    // Domain counters.
    {
      metric: 'cost_escalation_index',
      value: indexMissing ? 'MISSING' : indexNow,
      threshold: null,
      status: indexMissing ? 'WARN' : 'INFO',
    },
    { metric: 'rates_max_as_of_date', value: maxRateAsOf ? String(maxRateAsOf) : 'N/A', threshold: null, status: 'INFO' },
    // P1: family logic is P2 → always 0 here; emitted for the always-on inventory.
    {
      metric: 'unmapped_residential_family_fallback_count',
      value: unmappedFamilyFallbackCount,
      threshold: '== 0 (P1; family mapping is P2)',
      status: unmappedFamilyFallbackCount === 0 ? 'PASS' : 'WARN',
    },
    { metric: 'records_updated', value: recordsUpdated, threshold: null, status: 'INFO' },
    { metric: 'records_skipped', value: recordsSkipped, threshold: null, status: 'INFO' },
    { metric: 'dry_run', value: dryRun, threshold: null, status: 'INFO' },
  ];

  // §3.6 — verdict derived from the rows (NO parallel boolean).
  const verdict = auditRows.some((r) => r.status === 'FAIL')
    ? 'FAIL'
    : auditRows.some((r) => r.status === 'WARN')
      ? 'WARN'
      : 'PASS';

  const durationMs = Date.now() - startTime;
  return {
    processed,
    recordsUpdated,
    recordsSkipped,
    engineErrorCount,
    nullGeomBasisCount,
    fitGatedSuiteCount,
    fitGatedGarageCount,
    lineCoverage,
    confidenceTotals,
    indexNow,
    indexMissing,
    ratesAgeMonths,
    indexAgeMonths,
    maxRateAsOf,
    durationMs,
    dryRun,
    rowLimit,
    auditRows,
    verdict,
  };
}

function main() {
  // ── CLI flags ────────────────────────────────────────────────────────────
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitMatch = args.find((a) => /^--limit=\d+$/.test(a));
  const rowLimit = limitMatch ? safeParsePositiveInt(limitMatch.split('=')[1], 'limit') : null;

  pipeline.run('compute-parcel-cost-estimates', async (pool) => {
    // §R5 — load + validate logic_variables BEFORE lock contention.
    const { logicVars } = await loadMarketplaceConfigs(pool, 'compute-parcel-cost-estimates');
    const validation = validateLogicVars(logicVars, ConfigSchema, 'compute-parcel-cost-estimates');
    if (!validation.valid) {
      throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
    }

    // §2.9: missing/invalid index → 1.0 multiplier + WARN (NOT a crash).
    const indexNow = logicVars.cost_escalation_index != null ? Number(logicVars.cost_escalation_index) : null;
    const indexMissing = indexNow == null || !Number.isFinite(indexNow) || indexNow <= 0;
    const config = {
      indexNow,
      indexMissing,
      ratesStaleMonths: Number(logicVars.cost_rates_stale_months),
      indexStaleMonths: Number(logicVars.cost_index_stale_months),
    };

    if (dryRun) pipeline.log.info('[compute-parcel-cost-estimates]', 'DRY-RUN mode — no DB writes');
    if (rowLimit) pipeline.log.info('[compute-parcel-cost-estimates]', `Row limit: ${rowLimit}`);
    if (indexMissing) {
      pipeline.log.warn(
        '[compute-parcel-cost-estimates]',
        'cost_escalation_index missing/invalid — escalation multiplier defaults to 1.0',
      );
    }

    const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
      const s = await computeParcelCostEstimates(pool, { dryRun, rowLimit, config });

      pipeline.emitSummary({
        // §2.11 counter scoping: records_total = residential parcels examined (NOT 13×).
        records_total: s.processed,
        records_new: 0, // parcels pre-exist — this Mutator only UPDATEs
        records_updated: s.recordsUpdated,
        records_meta: {
          duration_ms: s.durationMs,
          residential_parcels_examined: s.processed,
          records_skipped: s.recordsSkipped,
          null_geom_basis_count: s.nullGeomBasisCount,
          engine_error_count: s.engineErrorCount,
          line_coverage: s.lineCoverage,
          area_confidence: s.confidenceTotals,
          fit_gated_suite_count: s.fitGatedSuiteCount,
          fit_gated_garage_count: s.fitGatedGarageCount,
          cost_escalation_index: s.indexMissing ? null : s.indexNow,
          cost_rates_age_months: s.ratesAgeMonths,
          cost_index_age_months: s.indexAgeMonths,
          dry_run: s.dryRun,
          row_limit: s.rowLimit,
          audit_table: {
            phase: 88,
            name: 'Parcel Cost Estimation',
            verdict: s.verdict,
            rows: s.auditRows,
          },
        },
      });

      pipeline.emitMeta(
        {
          // Reads — enumerated by name (Spec 47 §R11).
          archetype_cost_rates: ['archetype', 'cost_per_sqm', 'cost_adjustment_factor', 'escalation_index_base', 'as_of_date'],
          parcels: [
            'id',
            'zoning_class',
            'lot_size_sqm',
            'max_buildable_gfa_sqm',
            'max_buildable_footprint_sqm',
            'opt_coa_gfa_sqm',
            'max_garden_suite_gfa_sqm',
            'max_laneway_suite_gfa_sqm',
            'cur_est_kitchen_gfa_sqm',
            'cur_est_bath_gfa_sqm',
            'max_garage_gfa_sqm',
            'cur_floor_gfa_sqm',
            'cur_pot_2story_gfa_sqm',
            'realized_fsi_p90',
            'neighbourhood_cost_premium',
            'rear_suite_permission',
            'garage_permission',
            'max_build_confidence',
          ],
          logic_variables: ['variable_key', 'variable_value', 'updated_at', 'cost_escalation_index', 'cost_rates_stale_months', 'cost_index_stale_months'],
        },
        {
          parcels: ['parcel_cost_menu', ...ALL_SCALAR_COLS],
        },
      );

      pipeline.log.info('[compute-parcel-cost-estimates]', 'Cost estimation complete', {
        processed: s.processed,
        records_updated: s.recordsUpdated,
        records_skipped: s.recordsSkipped,
        engine_error_count: s.engineErrorCount,
        null_geom_basis_count: s.nullGeomBasisCount,
        duration: `${(s.durationMs / 1000).toFixed(1)}s`,
      });
    });

    // §R12 — SKIP guard.
    if (!lockResult.acquired) return;
  });
}

module.exports = {
  computeParcelCostEstimates,
  ADVISORY_LOCK_ID,
  PARCEL_COST_LINES,
  COST_SCALAR_COLS,
  FSI_SCALAR_COLS,
  ALL_SCALAR_COLS,
};

if (require.main === module) main();
