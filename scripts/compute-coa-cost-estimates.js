#!/usr/bin/env node
/**
 * compute-coa-cost-estimates.js — CoA-side cost estimator (geometric-only path)
 *
 * Streams coa_applications joined with parcel/building/neighbourhood/trade
 * context through `estimateCostShared` (the Brain) via the R5.1 substrate
 * (`scripts/lib/coa-cost-model.js`). Writes:
 *
 *   - `coa_applications` cost columns (modeled_gfa_sqm, estimated_cost,
 *     cost_source, cost_classified_at) for every processed CoA
 *   - `cost_estimates` row (lead_id-keyed PK per mig 145) ONLY when the
 *     Brain returns a non-NULL estimated_cost
 *
 * Spec 83 §Geometric-Only Path: CoA records carry no applicant-declared
 * cost, so the Liar's Gate is dead-code on the CoA path (rawCost=null
 * routes through Brain Branch 2, returning cost_source='model'). This
 * script transforms 'model' → 'geometric' on the way to the DB
 * (mig 145 CHECK extension permits 'geometric').
 *
 * R5.5 plan-review folds applied (4-reviewer convergence, 2026-05-14):
 *   #1 R5.1 substrate field-name fix (in scripts/lib/coa-cost-model.js)
 *   #2 R5.1 substrate adds urban/suburban coverage ratios (same)
 *   #3 cost_distribution_p25_p50_p75 via PostgreSQL PERCENTILE_CONT (this file)
 *   #4 ORDER BY building_id ASC in parcel_buildings LATERAL (this file)
 *   #5 R5.1 substrate dead-flag removal (same)
 *   #6 null_cost_reasons restructured (this file)
 *   #7 coverage_pct = N/A when processed=0 (this file)
 *   #8 cost_source + is_geometric_override transform (this file)
 *   #9 drop ::text casts on JSONB IS DISTINCT FROM (this file)
 *   #10 column count 16 + BATCH_SIZE formula (this file)
 *   #11 records_new/_updated cost_estimates semantics + coa_applications_updated (this file)
 *   #12 corrected checklist (l) cursor semantics (verified in tests)
 *   #13 coa_cost_coverage_threshold_pct seed (logic_variables.json)
 *   #14 --dry-run + --limit CLI flags (this file)
 *
 * Phase H integration gap: downstream compute-trade-forecasts.js,
 * compute-opportunity-scores.js, update-tracked-projects.js still read
 * permit_trades / permits-keyed cost_estimates. CoA cost rows exist in
 * cost_estimates correctly but produce zero trade_forecasts coverage
 * until the Phase H rekey (Spec 42 §6.11 Phase H).
 *
 * Usage:
 *   node scripts/compute-coa-cost-estimates.js [--dry-run] [--limit=N]
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 12 + §6.6.D + §6.8 row 668 + §6.11 Phase D R5.5
 *            docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 *            docs/specs/01-pipeline/48_pipeline_observability.md §3 (observer consumes audit_table)
 *            docs/specs/01-pipeline/83_lead_cost_model.md §Geometric-Only Path for CoA
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { safeParsePositiveInt } = require('./lib/safe-math');
const { buildCoaConfig, mapCoaRowToBrainInput } = require('./lib/coa-cost-model');
const { estimateCostShared, MODEL_VERSION } = require('../src/features/leads/lib/cost-model-shared');

// §R2 — advisory lock 4204 (Spec 42 §6.8 Phase D allocation)
const ADVISORY_LOCK_ID = 4204;

// R5.5 review fold #10: cost_estimates INSERT writes 16 columns per row
// (lead_id, permit_num, revision_num, estimated_cost, cost_source, cost_tier,
// cost_range_low, cost_range_high, premium_factor, complexity_score,
// model_version, is_geometric_override, modeled_gfa_sqm, effective_area_sqm,
// trade_contract_values, computed_at). Spec 47 §6.3:
// BATCH_SIZE = Math.floor((65535 - 1) / column_count). The Math.min(1000, ...)
// cap is memory-bounded, not param-bounded.
const COST_ESTIMATES_COL_COUNT = 16;
const INSERT_BATCH_SIZE = Math.min(1000, Math.floor((65535 - 1) / COST_ESTIMATES_COL_COUNT));

// §R4 — Zod schema for logic_variables consumed by this script + the Brain.
// Fold #2: urban/suburban coverage ratios must come from DB (Spec 47 §4.1).
// Fold #13: coa_cost_coverage_threshold_pct WARN threshold for audit_table.
const ConfigSchema = z
  .object({
    liar_gate_threshold:                z.coerce.number().positive().max(1),
    model_range_pct:                    z.coerce.number().finite().nonnegative().max(1),
    fallback_range_pct:                 z.coerce.number().finite().nonnegative().max(1),
    urban_coverage_ratio:               z.coerce.number().positive().max(1),
    suburban_coverage_ratio:            z.coerce.number().positive().max(1),
    coa_cost_coverage_threshold_pct:    z.coerce.number().finite().nonnegative().max(100),
  })
  .passthrough();

// ── CLI flags ────────────────────────────────────────────────────────────────
// Fold #14: operator safety knobs. --dry-run skips writes; --limit=N caps rows.
// Diff-review fold (Gemini MED): regex parse rejects malformed --limit= input.
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitMatch = args.find((a) => /^--limit=\d+$/.test(a));
const rowLimit = limitMatch ? safeParsePositiveInt(limitMatch.split('=')[1], 'limit') : null;

pipeline.run('compute-coa-cost-estimates', async (pool) => {
  // §R3.5 + §R5: RUN_AT + config validation BEFORE lock contention.
  // Self-checklist (n): RUN_AT must be captured before withAdvisoryLock.
  const RUN_AT = await pipeline.getDbTimestamp(pool);
  const startTime = Date.now();

  const { logicVars } = await loadMarketplaceConfigs(pool, 'compute-coa-cost-estimates');
  const validation = validateLogicVars(logicVars, ConfigSchema, 'compute-coa-cost-estimates');
  if (!validation.valid) {
    throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  }
  const coverageThresholdPct = logicVars.coa_cost_coverage_threshold_pct;

  if (dryRun) pipeline.log.info('[compute-coa-cost-estimates]', 'DRY-RUN mode — no DB writes will occur');
  if (rowLimit) pipeline.log.info('[compute-coa-cost-estimates]', `Row limit: ${rowLimit}`);

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // ── Diff-review fold (W#2 CRIT L2-3): mig 145 startup guard ─────────────
    // This script writes cost_source='geometric' and permit_num=NULL, both of
    // which require mig 145 (cost_source CHECK extension + DROP NOT NULL).
    // Refuse to run if mig 145 hasn't been applied — gives the operator a
    // clear error instead of a downstream CHECK violation rolling back batches.
    const migCheck = await pool.query(
      `SELECT 1 FROM pg_constraint
        WHERE conrelid = 'cost_estimates'::regclass
          AND conname  = 'cost_estimates_pkey'
          AND pg_get_constraintdef(oid) ILIKE '%lead_id%'`,
    );
    if (migCheck.rows.length === 0) {
      throw new Error(
        '[compute-coa-cost-estimates] migration 145 (lead_id PK swap) has not been applied — refusing to run',
      );
    }

    // ── Load reference tables (bounded queries — Spec 47 §6.2) ─────────────
    const [tradeRatesRes, scopeMatrixRes] = await Promise.all([
      pool.query('SELECT trade_slug, base_rate_sqft, structure_complexity_factor FROM trade_sqft_rates'),
      pool.query('SELECT permit_type, structure_type, gfa_allocation_percentage FROM scope_intensity_matrix'),
    ]);

    // Diff-review fold (W#1 M3): startup guard on empty trade_sqft_rates.
    // Without rates, Brain produces surgicalTotal=0 for every CoA → 100%
    // null cost. Refuse to run so the operator gets a clear startup-time
    // signal, not a buried WARN after processing all rows.
    if (tradeRatesRes.rows.length === 0) {
      throw new Error(
        '[compute-coa-cost-estimates] trade_sqft_rates is empty — refusing to run (would produce 0% cost coverage)',
      );
    }

    // Diff-review fold (DeepSeek MED): defend against duplicate rate-table
    // rows silently overwriting via Object.fromEntries. If a future schema
    // bug allows duplicates, this catches it loudly instead of silently
    // corrupting cost calculations.
    const tradeSlugSeen = new Set();
    for (const r of tradeRatesRes.rows) {
      if (tradeSlugSeen.has(r.trade_slug)) {
        throw new Error(
          `[compute-coa-cost-estimates] duplicate trade_slug in trade_sqft_rates: ${r.trade_slug}`,
        );
      }
      tradeSlugSeen.add(r.trade_slug);
    }
    const scopeKeySeen = new Set();
    for (const r of scopeMatrixRes.rows) {
      const key = `${r.permit_type}::${r.structure_type}`;
      if (scopeKeySeen.has(key)) {
        throw new Error(
          `[compute-coa-cost-estimates] duplicate (permit_type, structure_type) in scope_intensity_matrix: ${key}`,
        );
      }
      scopeKeySeen.add(key);
    }

    const brainConfig = buildCoaConfig({
      tradeRates: tradeRatesRes.rows,
      scopeMatrix: scopeMatrixRes.rows,
      logicVars,
    });

    pipeline.log.info(
      '[compute-coa-cost-estimates]',
      `Loaded ${tradeRatesRes.rows.length} trade rates + ${scopeMatrixRes.rows.length} scope matrix rows`,
    );

    // ── Counters ───────────────────────────────────────────────────────────
    let processed = 0;
    let coaWithCost = 0;
    let coaWithoutCost = 0;
    let coaWithFallback = 0;
    let recordsNew = 0;        // R5.4 fold #10 + R5.5 fold #11 — xmax-derived for cost_estimates UPSERT
    let recordsUpdated = 0;
    let recordsSkipped = 0;    // IS DISTINCT FROM guard short-circuited (no RETURNING row)
    let coaApplicationsUpdated = 0;  // R5.5 fold #11 — side-effect UPDATE rowCount

    // R5.5 fold #6 — restructured null_cost_reasons (no_building dropped:
    // lot-size fallback produces a non-null cost, so it's not a null reason).
    // Priority order: no_parcel → no_scope_tags → no_active_trades → no_matching_rate.
    const nullReasons = {
      no_parcel: 0,         // lead_parcels.parcel_id IS NULL
      no_scope_tags: 0,     // scope_tags NULL or empty array (R5.3 didn't classify)
      no_active_trades: 0,  // active_trade_slugs empty (R5.4 produced no trades)
      no_matching_rate: 0,  // Brain surgicalTotal=0 despite non-empty trades + scope_tags
    };
    // Diff-review fold (W#2 L3-3): additive tally counts each blocking condition
    // independently. Sum can exceed coaWithoutCost when multiple blockers fire.
    // Surfaces multi-blocker CoAs the priority bucket hides.
    const nullReasonsAdditive = {
      no_parcel: 0,
      no_scope_tags: 0,
      no_active_trades: 0,
    };

    // Batched UPSERT staging.
    const batch = {
      coaIds: [],
      coaUpdates: [],  // [{id, modeled_gfa_sqm, estimated_cost, cost_source}]
      ceRows: [],      // cost_estimates rows (only when estimated_cost != null)
    };

    /** Transform Brain output → DB-writable cost_source + is_geometric_override.
     *
     * R5.5 fold #8: Brain emits 'model'/'none'/'permit' (last unreachable for
     * CoA since est_const_cost is always null). Spec 42 §6.6.D mandates
     * cost_source='geometric' for CoA writes; we transform 'model' → 'geometric'
     * and force is_geometric_override=true for the non-null path. For null
     * estimates (Brain returned cost_source='none' on Zero-Total Bypass),
     * we preserve 'none' on coa_applications and SKIP the cost_estimates
     * INSERT entirely (cleaner audit semantics than writing 'none' rows).
     */
    function transformCostSource(brainOutput) {
      if (brainOutput.estimated_cost != null) {
        return { cost_source: 'geometric', is_geometric_override: true };
      }
      return { cost_source: 'none', is_geometric_override: false };
    }

    async function flushBatch() {
      if (batch.coaIds.length === 0) return;
      if (dryRun) {
        // Reset without writing.
        batch.coaIds = [];
        batch.coaUpdates = [];
        batch.ceRows = [];
        return;
      }

      await pipeline.withTransaction(pool, async (client) => {
        // ── (1) UPSERT cost_estimates (only rows with non-null estimated_cost) ──
        // R5.5 fold #10: 16 cols/row; param count = 16 × ceRows.length ≤ 16 × 1000 = 16000 < 65535.
        if (batch.ceRows.length > 0) {
          const valuesParts = [];
          const params = [];
          let p = 1;
          for (const r of batch.ceRows) {
            valuesParts.push(
              `($${p++}::text, $${p++}::varchar, $${p++}::varchar, $${p++}::numeric, $${p++}::varchar, $${p++}::varchar, $${p++}::numeric, $${p++}::numeric, $${p++}::numeric, $${p++}::int, $${p++}::int, $${p++}::boolean, $${p++}::numeric, $${p++}::numeric, $${p++}::jsonb, $${p++}::timestamptz)`,
            );
            params.push(
              r.lead_id,
              r.permit_num,          // NULL for CoA (mig 145 DROP NOT NULL)
              r.revision_num,        // NULL for CoA (mig 145 DROP NOT NULL)
              r.estimated_cost,
              r.cost_source,         // 'geometric' (post-transform)
              r.cost_tier,
              r.cost_range_low,
              r.cost_range_high,
              r.premium_factor,
              r.complexity_score,
              MODEL_VERSION,
              r.is_geometric_override,
              r.modeled_gfa_sqm,
              r.effective_area_sqm,
              JSON.stringify(r.trade_contract_values || {}),
              RUN_AT,
            );
          }

          // R5.5 fold #9: NO ::text casts — JSONB has canonical storage so
          // IS DISTINCT FROM compares canonically.
          // R5.5 fold #11 + R5.4 fold #10: RETURNING (xmax = 0) for accurate
          // records_new vs records_updated split.
          const result = await client.query(
            `INSERT INTO cost_estimates (
               lead_id, permit_num, revision_num,
               estimated_cost, cost_source, cost_tier,
               cost_range_low, cost_range_high, premium_factor, complexity_score,
               model_version, is_geometric_override, modeled_gfa_sqm,
               effective_area_sqm, trade_contract_values, computed_at
             )
             VALUES ${valuesParts.join(', ')}
             ON CONFLICT (lead_id) DO UPDATE SET
               estimated_cost        = EXCLUDED.estimated_cost,
               cost_source           = EXCLUDED.cost_source,
               cost_tier             = EXCLUDED.cost_tier,
               cost_range_low        = EXCLUDED.cost_range_low,
               cost_range_high       = EXCLUDED.cost_range_high,
               premium_factor        = EXCLUDED.premium_factor,
               complexity_score      = EXCLUDED.complexity_score,
               model_version         = EXCLUDED.model_version,
               is_geometric_override = EXCLUDED.is_geometric_override,
               modeled_gfa_sqm       = EXCLUDED.modeled_gfa_sqm,
               effective_area_sqm    = EXCLUDED.effective_area_sqm,
               trade_contract_values = EXCLUDED.trade_contract_values,
               computed_at           = EXCLUDED.computed_at
             WHERE EXCLUDED.estimated_cost        IS DISTINCT FROM cost_estimates.estimated_cost
                OR EXCLUDED.cost_source           IS DISTINCT FROM cost_estimates.cost_source
                OR EXCLUDED.cost_tier             IS DISTINCT FROM cost_estimates.cost_tier
                -- Diff-review fold #1 (Gemini CRIT + W#2 L1-1): expand guard to
                -- include range + premium + complexity + model_version so
                -- logicVar changes (model_range_pct, neighbourhood income
                -- refresh) propagate to DB and surface in 7-day observer diffs.
                OR EXCLUDED.cost_range_low        IS DISTINCT FROM cost_estimates.cost_range_low
                OR EXCLUDED.cost_range_high       IS DISTINCT FROM cost_estimates.cost_range_high
                OR EXCLUDED.premium_factor        IS DISTINCT FROM cost_estimates.premium_factor
                OR EXCLUDED.complexity_score      IS DISTINCT FROM cost_estimates.complexity_score
                OR EXCLUDED.model_version         IS DISTINCT FROM cost_estimates.model_version
                OR EXCLUDED.is_geometric_override IS DISTINCT FROM cost_estimates.is_geometric_override
                OR EXCLUDED.modeled_gfa_sqm       IS DISTINCT FROM cost_estimates.modeled_gfa_sqm
                OR EXCLUDED.effective_area_sqm    IS DISTINCT FROM cost_estimates.effective_area_sqm
                OR EXCLUDED.trade_contract_values IS DISTINCT FROM cost_estimates.trade_contract_values
             RETURNING (xmax = 0) AS is_insert`,
            params,
          );
          for (const row of result.rows) {
            if (row.is_insert) recordsNew++;
            else recordsUpdated++;
          }
          recordsSkipped += batch.ceRows.length - result.rows.length;
        }

        // ── (2) Batched UPDATE coa_applications — advance cost_classified_at
        // unconditionally (R5.4 BUG-5 + R5.5 fold #12: cursor advance prevents
        // infinite re-fetch). Side-effect UPDATE counted separately per fold #11.
        const valuesParts = [];
        const params = [];
        let p = 1;
        for (const u of batch.coaUpdates) {
          valuesParts.push(`($${p++}::bigint, $${p++}::numeric, $${p++}::numeric, $${p++}::varchar)`);
          params.push(u.id, u.modeled_gfa_sqm, u.estimated_cost, u.cost_source);
        }
        const runAtParam = p++;
        params.push(RUN_AT);

        const updRes = await client.query(
          `UPDATE coa_applications ca
              SET modeled_gfa_sqm    = v.modeled_gfa_sqm,
                  estimated_cost     = v.estimated_cost,
                  cost_source        = v.cost_source,
                  cost_classified_at = $${runAtParam}::timestamptz
             FROM (VALUES ${valuesParts.join(', ')}) AS v(id, modeled_gfa_sqm, estimated_cost, cost_source)
            WHERE ca.id = v.id`,
          params,
        );
        coaApplicationsUpdated += updRes.rowCount ?? 0;
      });

      batch.coaIds = [];
      batch.coaUpdates = [];
      batch.ceRows = [];
    }

    // §R7 — streamQuery over 6-table LEFT JOIN per Spec 42 §6.8 row 668.
    // R5.5 fold #4: ORDER BY building_id ASC in parcel_buildings LATERAL makes
    // primary-building selection deterministic when multiple primaries exist.
    // Self-checklist (l) (R5.5 fold #12): cursor does NOT enforce
    // trade_classified_at IS NOT NULL. CoAs without trades are fetched via the
    // cost_classified_at IS NULL branch, produce no_active_trades/no_scope_tags,
    // and advance cost_classified_at. R5.4 → R5.5 chain order is the gate.
    const limitClause = rowLimit ? ` LIMIT ${rowLimit}` : '';
    const sourceStream = pipeline.streamQuery(
      pool,
      `
      SELECT
        ca.id,
        ca.lead_id,
        ca.scope_tags,
        ca.structure_type,
        lp.parcel_id,
        p.lot_size_sqm::float8        AS lot_size_sqm,
        p.frontage_m::float8          AS frontage_m,
        bf.footprint_area_sqm::float8 AS footprint_area_sqm,
        bf.estimated_stories          AS estimated_stories,
        n.avg_household_income::float8 AS avg_household_income,
        n.tenure_renter_pct::float8   AS tenure_renter_pct,
        COALESCE(lt_agg.active_trades, ARRAY[]::text[]) AS active_trade_slugs
      FROM coa_applications ca
      LEFT JOIN LATERAL (
        SELECT lp.parcel_id
        FROM lead_parcels lp
        WHERE lp.lead_id = ca.lead_id
        ORDER BY lp.confidence DESC NULLS LAST, lp.parcel_id ASC
        LIMIT 1
      ) lp ON true
      LEFT JOIN parcels p ON p.id = lp.parcel_id
      LEFT JOIN LATERAL (
        SELECT building_id
        FROM parcel_buildings
        WHERE parcel_id = lp.parcel_id AND is_primary = true
        ORDER BY building_id ASC
        LIMIT 1
      ) pb ON true
      LEFT JOIN building_footprints bf ON bf.id = pb.building_id
      LEFT JOIN neighbourhoods n ON n.id = ca.neighbourhood_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(t.slug ORDER BY t.slug) FILTER (WHERE lt.is_active = true) AS active_trades
        FROM lead_trades lt
        JOIN trades t ON t.id = lt.trade_id
        WHERE lt.lead_id = ca.lead_id
      ) lt_agg ON true
      WHERE (
              ca.cost_classified_at IS NULL
           OR ca.cost_classified_at < ca.trade_classified_at
            )
        -- Diff-review fold (Gemini CRIT): defensive guard against
        -- future-dated trade_classified_at (clock skew / manual DB edit).
        -- Without this, a row with trade_classified_at greater than the
        -- current run timestamp would be re-fetched on every run forever.
        AND (ca.trade_classified_at IS NULL OR ca.trade_classified_at <= $1::timestamptz)
      ORDER BY ca.id ASC${limitClause}
      `,
      [RUN_AT],
    );

    for await (const row of sourceStream) {
      processed++;

      // R5.5 fold #6: distinguish null-cost reasons BEFORE invoking Brain.
      // The script can detect 3 of the 4 reasons cheaply; the Brain's
      // _zeroTotalBypass flag covers the 4th.
      const scopeTagsEmpty = !Array.isArray(row.scope_tags) || row.scope_tags.length === 0;
      const activeTradesEmpty = !Array.isArray(row.active_trade_slugs) || row.active_trade_slugs.length === 0;
      const noParcel = row.parcel_id == null;

      const brainInput = mapCoaRowToBrainInput(row);
      const brainOutput = estimateCostShared(brainInput, brainConfig);
      const { cost_source: dbCostSource, is_geometric_override: dbIsGeometricOverride } = transformCostSource(brainOutput);

      // Stage coa_applications UPDATE (always — cursor advancement).
      batch.coaUpdates.push({
        id: row.id,
        modeled_gfa_sqm: brainOutput.modeled_gfa_sqm,
        estimated_cost: brainOutput.estimated_cost,
        cost_source: dbCostSource,
      });
      batch.coaIds.push(row.id);

      if (brainOutput.estimated_cost != null) {
        coaWithCost++;
        // Diff-review fold (W#2 L3-7): defensive existence check. The Brain
        // emits `_usedFallback` as an internal telemetry flag (underscore
        // prefix → unstable API). If a future Brain refactor drops it, this
        // counter silently stays 0; the existence check makes the dependency
        // explicit.
        if ('_usedFallback' in brainOutput && brainOutput._usedFallback) coaWithFallback++;
        // Stage cost_estimates row.
        batch.ceRows.push({
          lead_id: row.lead_id,
          permit_num: null,        // mig 145 — NULL permitted for CoA rows
          revision_num: null,
          estimated_cost: brainOutput.estimated_cost,
          cost_source: dbCostSource,
          cost_tier: brainOutput.cost_tier,
          cost_range_low: brainOutput.cost_range_low,
          cost_range_high: brainOutput.cost_range_high,
          premium_factor: brainOutput.premium_factor,
          complexity_score: brainOutput.complexity_score,
          is_geometric_override: dbIsGeometricOverride,
          modeled_gfa_sqm: brainOutput.modeled_gfa_sqm,
          effective_area_sqm: brainOutput.effective_area_sqm,
          trade_contract_values: brainOutput.trade_contract_values,
        });
      } else {
        coaWithoutCost++;
        // R5.5 fold #6: classify null reason in priority order (operator-action
        // priority — fixing the upstream condition cascades).
        if (noParcel) nullReasons.no_parcel++;
        else if (scopeTagsEmpty) nullReasons.no_scope_tags++;
        else if (activeTradesEmpty) nullReasons.no_active_trades++;
        else nullReasons.no_matching_rate++;
        // Diff-review fold (W#2 L3-3): also track conditions independently so
        // operators can see when a CoA is blocked by multiple upstream gaps
        // (e.g., no_parcel + no_scope_tags) — the priority bucket above shows
        // only the root cause, but the additive tally surfaces "whack-a-mole"
        // multi-blocker situations.
        if (noParcel) nullReasonsAdditive.no_parcel++;
        if (scopeTagsEmpty) nullReasonsAdditive.no_scope_tags++;
        if (activeTradesEmpty) nullReasonsAdditive.no_active_trades++;
      }

      // Diff-review fold (Gemini NIT): batch.ceRows.length <= batch.coaIds.length
      // always (ceRows is pushed only when coaIds is pushed). The second
      // condition was redundant.
      if (batch.coaIds.length >= INSERT_BATCH_SIZE) {
        await flushBatch();
        if (processed % 5000 === 0) {
          pipeline.log.info(
            '[compute-coa-cost-estimates]',
            `Processed ${processed.toLocaleString()} CoAs so far`,
          );
        }
      }
    }

    // Final flush.
    await flushBatch();

    // ── R5.5 fold #3: percentile via PostgreSQL post-run query ──────────────
    // Bounded-memory (DB-side aggregation) — replaces in-process JS array
    // accumulation that Gemini + Worktree#2 flagged as OOM-prone at scale.
    let p25 = null, p50 = null, p75 = null;
    if (!dryRun && coaWithCost > 0) {
      const percRes = await pool.query(
        `SELECT
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY estimated_cost) AS p25,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY estimated_cost) AS p50,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY estimated_cost) AS p75
         FROM cost_estimates
         WHERE lead_id LIKE 'coa:%'
           AND computed_at = $1::timestamptz
           AND estimated_cost IS NOT NULL`,
        [RUN_AT],
      );
      p25 = percRes.rows[0].p25 != null ? Number(percRes.rows[0].p25) : null;
      p50 = percRes.rows[0].p50 != null ? Number(percRes.rows[0].p50) : null;
      p75 = percRes.rows[0].p75 != null ? Number(percRes.rows[0].p75) : null;
    }
    // Diff-review fold (W#2 L1-3): pin locale so the percentile distribution
    // string is identical across Node runtime environments — otherwise the
    // 7-day baseline diff in spec 48's observer becomes fragile.
    const fmtMoney = (v) => (v == null ? 'N/A' : `$${Math.round(v).toLocaleString('en-CA')}`);
    const distributionString =
      p25 == null && p50 == null && p75 == null
        ? 'N/A'
        : `${fmtMoney(p25)} / ${fmtMoney(p50)} / ${fmtMoney(p75)}`;

    // ── Audit table (Spec 42 §6.8 row 668 + folds #6, #7, #11) ──────────────
    const durationMs = Date.now() - startTime;
    const totalCeWrites = recordsNew + recordsUpdated;
    const fallbackPct = coaWithCost > 0 ? (coaWithFallback / coaWithCost) * 100 : 0;
    const coveragePct = processed > 0 ? (coaWithCost / processed) * 100 : 0;

    // R5.5 fold #7: emit N/A INFO when processed=0 (don't WARN on healthy empty cursor).
    const coverageRow =
      processed === 0
        ? { metric: 'cost_estimate_coverage_pct', value: 'N/A', threshold: `>= ${coverageThresholdPct}%`, status: 'INFO' }
        : {
            metric: 'cost_estimate_coverage_pct',
            value: coveragePct.toFixed(1) + '%',
            threshold: `>= ${coverageThresholdPct}%`,
            status: coveragePct >= coverageThresholdPct ? 'PASS' : 'WARN',
          };

    const auditRows = [
      // Diff-review fold (W#2 L1-2): INFO (not WARN) when processed=0 — quiet
      // incremental runs are the normal steady state. WARN here drowns out
      // real signal in the spec 48 observer's 7-day baseline.
      {
        metric: 'coa_eligible',
        value: processed,
        threshold: '> 0',
        status: processed > 0 ? 'PASS' : 'INFO',
      },
      { metric: 'coa_with_cost', value: coaWithCost, threshold: null, status: 'INFO' },
      { metric: 'coa_without_cost', value: coaWithoutCost, threshold: null, status: 'INFO' },
      coverageRow,
      { metric: 'null_reason_no_parcel', value: nullReasons.no_parcel, threshold: null, status: 'INFO' },
      { metric: 'null_reason_no_scope_tags', value: nullReasons.no_scope_tags, threshold: null, status: 'INFO' },
      { metric: 'null_reason_no_active_trades', value: nullReasons.no_active_trades, threshold: null, status: 'INFO' },
      { metric: 'null_reason_no_matching_rate', value: nullReasons.no_matching_rate, threshold: null, status: 'INFO' },
      {
        metric: 'cost_with_fallback_pct',
        value: coaWithCost > 0 ? fallbackPct.toFixed(1) + '%' : 'N/A',
        threshold: null,
        status: 'INFO',
      },
      { metric: 'cost_distribution_p25_p50_p75', value: distributionString, threshold: null, status: 'INFO' },
      // Diff-review fold (W#2 L2-4): Phase H gap as machine-readable audit row.
      // Lets the spec 48 observer distinguish "CoA trade_forecasts coverage is
      // expected-zero" from "classifier is broken." Phase H rekey of
      // compute-trade-forecasts/opportunity-scores/tracked-projects will
      // remove this metric.
      { metric: 'phase_h_gap_active', value: true, threshold: null, status: 'INFO' },
      { metric: 'records_new', value: recordsNew, threshold: null, status: 'INFO' },
      { metric: 'records_updated', value: recordsUpdated, threshold: null, status: 'INFO' },
      { metric: 'records_skipped', value: recordsSkipped, threshold: null, status: 'INFO' },
      { metric: 'coa_applications_updated', value: coaApplicationsUpdated, threshold: null, status: 'INFO' },
      { metric: 'total_cost_estimates_written', value: totalCeWrites, threshold: null, status: 'INFO' },
    ];

    const verdict = auditRows.some((r) => r.status === 'FAIL')
      ? 'FAIL'
      : auditRows.some((r) => r.status === 'WARN')
        ? 'WARN'
        : 'PASS';

    pipeline.emitSummary({
      records_total: processed,
      // R5.5 fold #11: records_new/_updated reflect cost_estimates UPSERT
      // semantics (1:1 with CoAs producing a non-null estimate). The
      // separate `coa_applications_updated` audit row tracks the side-effect
      // UPDATE that always fires for cursor advancement.
      records_new: recordsNew,
      records_updated: recordsUpdated,
      records_meta: {
        duration_ms: durationMs,
        coa_processed: processed,
        coa_with_cost: coaWithCost,
        coa_without_cost: coaWithoutCost,
        coa_with_fallback: coaWithFallback,
        null_cost_reasons: nullReasons,
        // Diff-review fold (W#2 L3-3): additive tally surfaces multi-blocker
        // CoAs (e.g., no_parcel + no_scope_tags both true).
        null_cost_reasons_additive: nullReasonsAdditive,
        cost_distribution: { p25, p50, p75 },
        coa_applications_updated: coaApplicationsUpdated,
        dry_run: dryRun,
        row_limit: rowLimit,
        audit_table: {
          phase: 42,
          name: 'CoA Cost Estimation',
          verdict,
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      {
        coa_applications: [
          'id',
          'lead_id',
          'scope_tags',
          'structure_type',
          'neighbourhood_id',
          'trade_classified_at',
          'cost_classified_at',
        ],
        lead_parcels: ['lead_id', 'parcel_id', 'confidence'],
        parcels: ['id', 'lot_size_sqm', 'frontage_m'],
        parcel_buildings: ['parcel_id', 'building_id', 'is_primary'],
        building_footprints: ['id', 'footprint_area_sqm', 'estimated_stories'],
        neighbourhoods: ['id', 'avg_household_income', 'tenure_renter_pct'],
        lead_trades: ['lead_id', 'trade_id', 'is_active'],
        trades: ['id', 'slug'],
        trade_sqft_rates: ['trade_slug', 'base_rate_sqft', 'structure_complexity_factor'],
        scope_intensity_matrix: ['permit_type', 'structure_type', 'gfa_allocation_percentage'],
      },
      {
        cost_estimates: [
          'lead_id',
          'permit_num',
          'revision_num',
          'estimated_cost',
          'cost_source',
          'cost_tier',
          'cost_range_low',
          'cost_range_high',
          'premium_factor',
          'complexity_score',
          'model_version',
          'is_geometric_override',
          'modeled_gfa_sqm',
          'effective_area_sqm',
          'trade_contract_values',
          'computed_at',
        ],
        coa_applications: [
          'modeled_gfa_sqm',
          'estimated_cost',
          'cost_source',
          'cost_classified_at',
        ],
      },
    );

    pipeline.log.info('[compute-coa-cost-estimates]', 'Cost estimation complete', {
      processed,
      coa_with_cost: coaWithCost,
      coa_without_cost: coaWithoutCost,
      records_new: recordsNew,
      records_updated: recordsUpdated,
      coa_applications_updated: coaApplicationsUpdated,
      duration: `${(durationMs / 1000).toFixed(1)}s`,
    });
  });

  // §R12 — SKIP guard.
  if (!lockResult.acquired) return;
});
