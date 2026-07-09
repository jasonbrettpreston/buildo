#!/usr/bin/env node
/**
 * compute-cost-estimates.js — Surgical Cost Estimation Muscle
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §7
 * DUAL CODE PATH: Both this Muscle and src/features/leads/lib/cost-model.ts
 * delegate all formula logic to estimateCostShared() in
 * src/features/leads/lib/cost-model-shared.js (the Brain). No valuation
 * math lives in this file. Any formula change must land in the Brain.
 *
 * CHAIN: Runs inside the permits chain (step 14 of 14). Not the sources chain.
 *
 * RUNBOOK: Script is idempotent — ON CONFLICT DO UPDATE is safe to re-run
 * after a crash. Stream-level batch failures emit failed_rows in audit_table;
 * investigate before re-running. Advisory lock 83 prevents concurrent runs.
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { safeParsePositiveInt } = require('./lib/safe-math');
// Brain: pure valuation logic shared by this Muscle and the TS read-path.
// §3-ARCHETYPE (WF2 2026-07-06): resolveArchetypeRates keeps the Spec 88 §2.9
// escalation formula single-sourced; archetypeMapperOutcome classifies T4
// fallthrough rows for the nofit-residential gate.
const {
  estimateCostShared,
  resolveArchetypeRates,
  archetypeMapperOutcome,
  MODEL_VERSION,
} = require('../src/features/leads/lib/cost-model-shared');

// ─── Constants ───────────────────────────────────────────────────────────────
// Spec 40 §3.5: advisory lock ID = spec number convention.
const ADVISORY_LOCK_ID = 83;

// Spec 47 §6.3: BATCH_SIZE = Math.floor((65535 - 1) / column_count).
// cost_estimates bulk UPSERT writes 15 columns per row:
// permit_num, revision_num, estimated_cost, cost_source, cost_tier,
// cost_range_low, cost_range_high, premium_factor, complexity_score,
// model_version, is_geometric_override, modeled_gfa_sqm,
// effective_area_sqm, trade_contract_values, computed_at.
// WF3 #16 (2026-05-22) — Spec 79 §7a Cycle 2 Finding M fix.
// Mig 145 (Phase D classifier substrate, 2026-05-18) changed cost_estimates
// PK from (permit_num, revision_num) → (lead_id). The script's INSERT was
// not updated, causing every batch to fail with "no unique or exclusion
// constraint matching the ON CONFLICT specification" since 2026-05-19.
// Fix: include lead_id in INSERT column list (computed from permit_num +
// padded revision_num) + change ON CONFLICT target to (lead_id). Column
// count bumps from 15 → 16.
const BULK_COLUMN_COUNT = 16;
const BATCH_SIZE = Math.floor((65535 - 1) / BULK_COLUMN_COUNT); // 4095

// Spec 47 §3.6 bounded-array discipline — cap the unique-key telemetry Map at
// 200 entries to prevent OOM under a long-tail anomaly (e.g., a data-import
// bug that generates thousands of new permit_type×structure_type variations).
// Cap-enforcement is "keep-frequent / drop-new-at-cap" so existing entries
// keep accumulating once seen, while truly new keys past the cap are not
// tracked individually (the scalar matrixMissUniqueKeys counter still grows
// so operators see the long-tail magnitude via _truncated + _total flags).
const MATRIX_MISS_KEYS_CAP = 200;

// ─── Zod config schema ───────────────────────────────────────────────────────
// Every logic_variable consumed by this script must appear here. Validated at
// startup — bad DB values (NULL, 0, wrong type) throw immediately with a clear
// message instead of silently producing NaN or corrupting estimates.
const COST_MODEL_CONFIG_SCHEMA = z.object({
  urban_coverage_ratio:           z.coerce.number().positive().max(1),
  suburban_coverage_ratio:        z.coerce.number().positive().max(1),
  // trust_threshold_pct intentionally excluded — reserved for Spec 83 Phase 2
  // (per-dataset coverage trust gate not yet implemented in the Brain).
  // Remains seeded in logic_variables.json and ZERO_IS_INVALID for future use.
  liar_gate_threshold:            z.coerce.number().positive().max(1),
  // P13-2 upper sentinel + P13-1/P13-2 legacy magnitude ceilings (Spec 83). Validated
  // at startup so a missing/out-of-range value fails fast instead of silently disabling
  // the placeholder guard / clamp.
  permit_declared_cost_ceiling:     z.coerce.number().finite().positive(),
  cost_est_legacy_cost_ceiling_cad: z.coerce.number().finite().positive(),
  cost_est_legacy_gfa_ceiling_sqm:  z.coerce.number().finite().positive(),
  cost_model_coverage_warn_pct:   z.coerce.number().finite().positive(),
  // WF1 Spec 83 §3.A — externalized OB-2/OB-3a/OB-3b thresholds. Validated at
  // startup so a missing or out-of-range Spec 86 Control Panel value fails
  // fast instead of silently producing NaN that would disable the FAIL gate.
  cost_model_coverage_fail_pct:   z.coerce.number().finite().min(0).max(100),
  cost_matrix_miss_warn_pct:      z.coerce.number().finite().min(0).max(100),
  cost_matrix_miss_fail_pct:      z.coerce.number().finite().min(0).max(100),
  cost_ptc_skipped_warn_pct:      z.coerce.number().finite().min(0).max(100),
  // §3-ARCHETYPE (WF2 2026-07-06) — ladder guards + T4-scoped observability
  // thresholds. All seeded in logic_variables.json; validated here so a bad
  // Control Panel edit fails fast instead of silently disabling a T1/T2 bound.
  cost_t4_matrix_miss_warn_pct:         z.coerce.number().finite().min(0).max(100),
  cost_t4_matrix_miss_fail_pct:         z.coerce.number().finite().min(0).max(100),
  archetype_nofit_residential_warn_pct: z.coerce.number().finite().min(0).max(100),
  archetype_t1_fsi_min:                 z.coerce.number().positive().finite(),
  archetype_t1_fsi_max:                 z.coerce.number().positive().finite(),
  archetype_t1_total_cap:               z.coerce.number().positive().finite(),
  archetype_t2_reno_line_cap:           z.coerce.number().positive().finite(),
  archetype_t2_build_line_cap:          z.coerce.number().positive().finite(),
  archetype_t2_build_line_min:          z.coerce.number().finite().min(0),
  archetype_t3_total_cap:               z.coerce.number().positive().finite(), // WF3 F2 — T3 per-unit cap
  // Escalation index (Spec 88 §2.9) — optional; missing → multiplier 1.0
  // (mirrors compute-parcel-cost-estimates.js, which WARNs but never crashes).
  cost_escalation_index:                z.coerce.number().positive().finite().optional(),
}).passthrough();

// ─── Source query ─────────────────────────────────────────────────────────────
// Joins permits with parcel massing, neighbourhood demographics, and the
// LATERAL permit_trades subquery that provides active_trade_slugs.
// COALESCE(pt.active_trades, ARRAY[]::text[]) ensures the column is always an
// array, never NULL — prevents the Brain from seeing a null active_trade_slugs.
const SOURCE_SQL = `
  SELECT
    p.permit_num,
    p.revision_num,
    p.permit_type,
    p.structure_type,
    p.work,
    p.est_const_cost::float8              AS est_const_cost,
    p.scope_tags,
    p.dwelling_units_created,
    p.storeys,
    -- §3-ARCHETYPE (WF2 2026-07-06): mapper inputs + the Spec 88 §4D propagated
    -- premium-INCLUSIVE cost scalars + their geom-basis areas + the lead's own
    -- declared areas (T1). All live on permits directly — no parcel_cost_menu join.
    p.project_type,
    p.residential_sqm::float8             AS residential_sqm,
    p.interior_alterations_sqm::float8    AS interior_alterations_sqm,
    p.neighbourhood_cost_premium::float8  AS neighbourhood_cost_premium,
    p.cost_fb_total::float8               AS cost_fb_total,
    p.cost_coa_total::float8              AS cost_coa_total,
    p.cost_addition_total::float8         AS cost_addition_total,
    p.cost_gut_total::float8              AS cost_gut_total,
    p.cost_basement_underpin_per_sqm::float8 AS cost_basement_underpin_per_sqm,
    p.cost_basement_per_sqm::float8       AS cost_basement_per_sqm,
    p.cost_garage_total::float8           AS cost_garage_total,
    p.cost_laneway_suite_total::float8    AS cost_laneway_suite_total,
    p.cost_garden_suite_total::float8     AS cost_garden_suite_total,
    p.cost_kitchen_per_sqm::float8        AS cost_kitchen_per_sqm,
    p.cost_bath_per_sqm::float8           AS cost_bath_per_sqm,
    p.cost_solar_total::float8            AS cost_solar_total,
    p.opt_aor_gfa_sqm::float8             AS opt_aor_gfa_sqm,
    p.opt_coa_gfa_sqm::float8             AS opt_coa_gfa_sqm,
    p.cur_floor_gfa_sqm::float8           AS cur_floor_gfa_sqm,
    p.cur_pot_2story_gfa_sqm::float8      AS cur_pot_2story_gfa_sqm,
    p.max_garage_gfa_sqm::float8          AS max_garage_gfa_sqm,
    p.max_laneway_suite_gfa_sqm::float8   AS max_laneway_suite_gfa_sqm,
    p.max_garden_suite_gfa_sqm::float8    AS max_garden_suite_gfa_sqm,
    p.cur_est_kitchen_gfa_sqm::float8     AS cur_est_kitchen_gfa_sqm,
    p.cur_est_bath_gfa_sqm::float8        AS cur_est_bath_gfa_sqm,
    p.max_buildable_footprint_sqm::float8 AS max_buildable_footprint_sqm,
    pp_parcel.lot_size_sqm::float8        AS lot_size_sqm,
    pp_parcel.frontage_m::float8          AS frontage_m,
    bf.footprint_area_sqm::float8         AS footprint_area_sqm,
    bf.estimated_stories,
    n.avg_household_income::float8        AS avg_household_income,
    n.tenure_renter_pct::float8           AS tenure_renter_pct,
    COALESCE(pt.active_trades, ARRAY[]::text[]) AS active_trade_slugs,
    COALESCE(ptc.class, 'unclassified')   AS permit_type_class
  FROM permits p
  LEFT JOIN LATERAL (
    SELECT parcel_id
    FROM permit_parcels
    WHERE permit_num = p.permit_num AND revision_num = p.revision_num
    ORDER BY parcel_id ASC
    LIMIT 1
  ) pp ON true
  LEFT JOIN parcels pp_parcel ON pp_parcel.id = pp.parcel_id
  LEFT JOIN LATERAL (
    SELECT building_id
    FROM parcel_buildings
    WHERE parcel_id = pp.parcel_id AND is_primary = true
    LIMIT 1
  ) pb ON true
  LEFT JOIN building_footprints bf ON bf.id = pb.building_id
  -- permits.neighbourhood_id is a FK to neighbourhoods.id (the SERIAL) per
  -- migration 109 fk_permits_neighbourhoods. Joining against
  -- n.neighbourhood_id (the city open-data PK) silently miss-matches every
  -- row → wrong avg_household_income → wrong premium tier → wrong cost
  -- estimate for ~237K permits. WF3 2026-05-08 corrective fix; operator
  -- runbook: re-run this script post-merge so the IS DISTINCT FROM guard
  -- rewrites cost_estimates rows whose premium_factor / estimated_cost change.
  LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id
  LEFT JOIN LATERAL (
    SELECT ARRAY_AGG(t.slug) AS active_trades
    FROM permit_trades pt2
    JOIN trades t ON t.id = pt2.trade_id
    WHERE pt2.permit_num = p.permit_num AND pt2.revision_num = p.revision_num
    -- All classified trades included regardless of construction phase.
    -- is_active filters for lead-scoring (phase relevance for tradespeople);
    -- cost distribution requires the full classified trade set so declared
    -- costs on alteration permits are not silently discarded. (WF3-L2)
  ) pt ON true
  -- WF2 #3 (Spec 80 §5 + Spec 83 §3): permit_type_classifications drives the
  -- Surgical Triangle gate. COALESCE to 'unclassified' so missing/new
  -- permit_types fall through to safe-skip (Brain emits cost_source='none').
  LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
`;

// ─── Bulk UPSERT SQL builder ──────────────────────────────────────────────────
// Builds a parameterized multi-row VALUES INSERT for batchSize rows.
// IS DISTINCT FROM guard on 5 columns prevents WAL bloat from no-op rewrites.
function buildBulkUpsertSQL(batchSize) {
  const valueGroups = [];
  for (let i = 0; i < batchSize; i++) {
    const b = i * BULK_COLUMN_COUNT;
    valueGroups.push(
      `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14}::jsonb,$${b+15}::timestamptz,$${b+16})`,
    );
  }
  return `
    INSERT INTO cost_estimates (
      permit_num, revision_num, estimated_cost, cost_source, cost_tier,
      cost_range_low, cost_range_high, premium_factor, complexity_score,
      model_version, is_geometric_override, modeled_gfa_sqm,
      effective_area_sqm, trade_contract_values, computed_at, lead_id
    ) VALUES
      ${valueGroups.join(',\n      ')}
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
       OR EXCLUDED.is_geometric_override IS DISTINCT FROM cost_estimates.is_geometric_override
       OR EXCLUDED.effective_area_sqm    IS DISTINCT FROM cost_estimates.effective_area_sqm
       OR EXCLUDED.trade_contract_values::text IS DISTINCT FROM cost_estimates.trade_contract_values::text
    RETURNING (xmax = 0) AS inserted
  `;
}

// ─── Batch flush ──────────────────────────────────────────────────────────────
// Flushes a batch of cost estimates as a single bulk VALUES UPSERT in one
// transaction. No per-row try/catch — errors propagate to withTransaction which
// rolls back the entire batch, and the outer catch increments failedBatches.
async function flushBatch(pool, rows, RUN_AT) {
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };
  return await pipeline.withTransaction(pool, async (client) => {
    const sql = buildBulkUpsertSQL(rows.length);
    const params = [];
    // Only DB schema columns included; the Brain's `_`-prefixed telemetry
    // fields (_matrixMiss, _matrixMissKey, _liarsGateOverride, _zeroTotalBypass,
    // _usedFallback, _permitTypeClassSkipped) are read by the Muscle's counter
    // logic but explicitly NOT pushed into params here, so they cannot leak
    // into the INSERT statement and cause a schema error.
    for (const r of rows) {
      // WF3 #16 (2026-05-22) — lead_id computed from permit_num + padded
      // revision_num per mig 132 trigger contract (matches the auto-populated
      // `permits.lead_id` shape so JOINs against cost_estimates by lead_id
      // align with the permits trigger output).
      const leadId = `permit:${r.permit_num}:${String(r.revision_num).padStart(2, '0')}`;
      params.push(
        r.permit_num,
        r.revision_num,
        r.estimated_cost,
        r.cost_source,
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
        leadId,
      );
    }
    const res = await client.query(sql, params);
    const inserted = res.rows.filter((r) => r.inserted).length;
    const updated = res.rows.filter((r) => !r.inserted).length;
    // Rows unchanged (IS DISTINCT FROM filter rejected them) return no RETURNING row
    const skipped = rows.length - res.rows.length;
    return { inserted, updated, skipped };
  });
}

// ─── Pipeline entry point ──────────────────────────────────────────────────────
// Guarded by require.main === module so the module can be require()-d from
// parity-battery tests without starting the pool or executing the run.
if (require.main === module) {
  // ── CLI flags ──────────────────────────────────────────────────────────────
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const rowLimit = limitArg ? safeParsePositiveInt(limitArg.split('=')[1], 'limit') : null;
  if (dryRun) pipeline.log.info('[compute-cost-estimates]', 'DRY-RUN mode — no DB writes will occur');
  if (rowLimit) pipeline.log.info('[compute-cost-estimates]', `Row limit: ${rowLimit}`);

  pipeline.run('compute-cost-estimates', async (pool) => {
    // ── 1. Concurrency guard — pipeline.withAdvisoryLock (Phase 2 migration) ───
    // §4: ALL state-dependent initialization (loadMarketplaceConfigs, rate table
    // pre-fetch, config build) MUST execute inside the lock callback to ensure
    // absolute isolation.
    const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

    // ── 2. Load control panel ──────────────────────────────────────────────
    const { logicVars } = await loadMarketplaceConfigs(pool, 'compute-cost-estimates');

    // ── 3. Zod validation — fail fast if any critical knob is invalid ──────
    const validation = validateLogicVars(logicVars, COST_MODEL_CONFIG_SCHEMA, 'compute-cost-estimates');
    if (!validation.valid) {
      throw new Error(`[compute-cost-estimates] Config validation failed: ${validation.errors.join(', ')}`);
    }

    // ── 4. Pre-fetch surgical rate tables ────────────────────────────────
    const [tradeRatesRes, scopeMatrixRes, archetypeRatesRes] = await Promise.all([
      pool.query(
        'SELECT trade_slug, base_rate_sqft::float8, structure_complexity_factor::float8 FROM trade_sqft_rates',
      ),
      pool.query(
        'SELECT permit_type, structure_type, gfa_allocation_percentage::float8 FROM scope_intensity_matrix',
      ),
      // §3-ARCHETYPE T3 — same table Spec 88's engine prices from.
      pool.query(
        `SELECT archetype, cost_per_sqm::float8 AS cost_per_sqm,
                cost_adjustment_factor::float8 AS cost_adjustment_factor,
                escalation_index_base::float8 AS escalation_index_base
           FROM archetype_cost_rates`,
      ),
    ]);
    const tradeRates = Object.fromEntries(
      tradeRatesRes.rows.map((r) => [r.trade_slug, {
        base_rate_sqft: r.base_rate_sqft,
        structure_complexity_factor: r.structure_complexity_factor,
      }]),
    );
    // Spec 83 §3.A WF1 re-key — exact production vocabulary, no case
    // normalization. Defensive .trim() to symmetrise the Brain's input
    // sanitization (PI-7 found 1.9% of permits with leading/trailing
    // whitespace). DB-side rows assumed clean (PI-7 also found 0 anomalies
    // in scope_intensity_matrix); .trim() here is defence-in-depth.
    const scopeMatrix = Object.fromEntries(
      scopeMatrixRes.rows.map((r) => [
        `${(r.permit_type || '').trim()}::${(r.structure_type || '').trim()}`,
        r.gfa_allocation_percentage,
      ]),
    );
    if (tradeRatesRes.rows.length === 0) {
      throw new Error('trade_sqft_rates table is empty — aborting to prevent zero-cost estimates for all permits');
    }
    // §3-ARCHETYPE T3 rates — pre-resolved to premium-EXCLUSIVE per-sqm via the
    // Brain's single-source escalation helper (Spec 88 §2.9: MAX(1, now/base)).
    // Empty rates table is a WARN, not fatal: T1/T2 still price from the
    // propagated scalars; only the T3 rung degrades (those rows fall to T4).
    const archetypeRates = resolveArchetypeRates(
      archetypeRatesRes.rows,
      logicVars.cost_escalation_index != null ? Number(logicVars.cost_escalation_index) : null,
    );
    if (archetypeRatesRes.rows.length === 0) {
      pipeline.log.warn(
        '[compute-cost-estimates]',
        'archetype_cost_rates is empty — T3 rung disabled; T3-eligible rows fall through to T4',
      );
    }
    pipeline.log.info(
      '[compute-cost-estimates]',
      `Pre-fetched ${tradeRatesRes.rows.length} trade rates, ${scopeMatrixRes.rows.length} matrix entries, ${archetypeRatesRes.rows.length} archetype rates`,
    );

    // WF2 #3 — startup guard (Spec 47 §R5): permit_type_classifications drives
    // the Surgical Triangle gate. An empty table would silently treat every
    // permit as 'unclassified' and wipe all cost_estimates rows. Refuse-to-run
    // is the right default — apply migration 120 first.
    const ptcCountRes = await pool.query('SELECT COUNT(*)::int AS n FROM permit_type_classifications');
    if (ptcCountRes.rows[0].n === 0) {
      throw new Error(
        'permit_type_classifications table is empty — refusing to run; apply migration 120 first (WF2 #1, Spec 80 §5)',
      );
    }

    // ── 5. Build Brain config ──────────────────────────────────────────────
    const config = {
      tradeRates,
      scopeMatrix,
      urbanCoverageRatio:    logicVars.urban_coverage_ratio,
      suburbanCoverageRatio: logicVars.suburban_coverage_ratio,
      liarGateThreshold:     logicVars.liar_gate_threshold,
      // P13-2 upper sentinel threaded into the Liar's Gate (Step D).
      permitDeclaredCostCeiling: Number(logicVars.permit_declared_cost_ceiling),
      // §3-ARCHETYPE (WF2 2026-07-06) — the T1–T3 ladder ahead of Steps A–D.
      // Zod-validated above; Number() coercion here because logic_variables
      // values arrive as text.
      // ROLLBACK KILL-SWITCH (Phase F): `ARCHETYPE_COST_DISABLED=1` flips the
      // ladder OFF so a re-run reproduces the legacy Spec-83 derivation end-to-end
      // (the old path is code-preserved as T4). Default ON. See the runbook:
      // docs/specs/01-pipeline/runbooks/83_archetype_cost_rollback.md
      archetypeEnabled:   process.env.ARCHETYPE_COST_DISABLED !== '1',
      archetypeRates,
      archetypeT1FsiMin:  Number(logicVars.archetype_t1_fsi_min),
      archetypeT1FsiMax:  Number(logicVars.archetype_t1_fsi_max),
      archetypeT1TotalCap: Number(logicVars.archetype_t1_total_cap),
      archetypeT2RenoCap:  Number(logicVars.archetype_t2_reno_line_cap),
      archetypeT2BuildCap: Number(logicVars.archetype_t2_build_line_cap),
      archetypeT2BuildMin: Number(logicVars.archetype_t2_build_line_min),
      archetypeT3TotalCap: Number(logicVars.archetype_t3_total_cap), // WF3 F2
    };

    // ── 6. RUN_AT: single DB timestamp captured once after lock ────────────
    // Using SELECT NOW() here (not in batched SQL) prevents Midnight Cross
    // drift: if the run starts just before midnight and flushes batches just
    // after, all computed_at values are anchored to the same instant.
    // (Spec 47 §8 — no NOW() in WHERE/SET clauses of the batch UPSERT)
    const RUN_AT = await pipeline.getDbTimestamp(pool);

    // ── 7. Stream + batch ──────────────────────────────────────────────────
    let processed  = 0;
    let inserted   = 0;
    let updated    = 0;
    let skipped    = 0;
    let failedBatches = 0;
    let failedRows = 0;
    let nullEstimates     = 0;
    let liarsGateOverrides  = 0;
    let zeroTotalBypasses   = 0;
    let permitTypeClassSkipped = 0; // WF2 #3 — Spec 80 §5 / Spec 83 §3 gate
    let matrixMisses = 0;          // WF3 Pass-2.5 Finding D — Spec 83 §3 Step B
    let matrixMissUniqueKeys = 0;  // scalar — counts ALL distinct keys seen (uncapped)
    const matrixMissByKey = new Map(); // bounded at MATRIX_MISS_KEYS_CAP
    // §3-ARCHETYPE (WF2 2026-07-06) — per-tier + fallthrough telemetry.
    // t4Processed is the denominator for the T4-scoped matrix-miss gate
    // (Observability item 1: full-population %s are meaningless once T1–T3
    // bypass the matrix). nofit split per the plan: mapper-null residential is
    // the WARN-gated mapper-quality signal; the non-lowrise bypass is INFO.
    let archetypeT1 = 0;             // cost_source = archetype_declared_area
    let archetypeT2 = 0;             // cost_source = archetype_parcel (single line)
    let archetypeT3 = 0;             // cost_source = archetype_rate
    let archetypeAdditive = 0;       // archetype_parcel via an additive pair
    let archetypeFitBlocked = 0;     // fits:false → cost_source 'none'
    let archetypeZeroTotal = 0;      // present-but-zero scalar → 'none' (tier_none_count)
    let archetypeTradeless = 0;      // archetype-priced with trade_contract_values = {}
    let archetypeNofitResidential = 0; // low-rise residential, mapper returned null → T4
    let archetypeUnpriceableT4 = 0;  // mapped but no scalar + no own area → T4
    let t4NonResidential = 0;        // outside the low-rise gate → T4 (mapper never called)
    let t4Processed = 0;             // all rows priced by the legacy Steps A–D
    let legacyBoundExceeded = 0;     // P13-2 — legacy rows nulled by the magnitude clamp

    // P13-1/P13-2 durable magnitude clamp: a LEGACY (model/permit) row whose
    // estimated_cost or modeled_gfa_sqm breaches the ceiling is priced on
    // mislinked/whole-campus massing GFA — the honest outcome is "we cannot price
    // this", so estimated_cost is nulled (cost_source is kept, recording that the
    // legacy path was tried). Archetype (lot-validated) sources are exempt. Runs
    // every compute, so a one-off DB null can't be re-inflated on the next run.
    const legacyCostCeiling = Number(logicVars.cost_est_legacy_cost_ceiling_cad);
    const legacyGfaCeiling  = Number(logicVars.cost_est_legacy_gfa_ceiling_sqm);

    try {
      const sourceSQL = rowLimit ? `${SOURCE_SQL} LIMIT ${rowLimit}` : SOURCE_SQL;

      // WF3 #16 fold (2026-05-22) — defensive Map dedupe by lead_id within the
      // batch. After the Finding M ON CONFLICT fix surfaced this latent issue
      // (6 batches × 4095 rows = 24,570 collisions), a Map keyed by lead_id
      // prevents intra-batch duplicates from triggering PG's "ON CONFLICT DO
      // UPDATE command cannot affect row a second time" error. Latest-wins
      // semantic — if the same lead_id appears twice in the stream, the
      // second estimate overwrites. Cheap O(1) per row; flushBatch reads
      // Map.values() instead of the array.
      const batchByLeadId = new Map();
      const getBatchLeadId = (r) => `permit:${r.permit_num}:${String(r.revision_num).padStart(2, '0')}`;

      for await (const row of pipeline.streamQuery(pool, sourceSQL)) {
        processed++;

        // WF2 §3-ARCHETYPE (2026-07-06): compute ALWAYS runs — dry-run is the
        // Phase E shadow/report mode, so every estimate + telemetry counter must
        // be exercised. Only the DB write is skipped: the batch is staged +
        // flushed under `if (!dryRun)` (the Map stays empty in dry-run, so the
        // flush blocks below never fire). The prior `if (dryRun) continue` here
        // short-circuited BEFORE pricing, producing an all-zero (meaningless)
        // audit — it could not serve as a shadow of the archetype ladder.
        const estimate = estimateCostShared(row, config);

        // P13-1/P13-2 magnitude clamp (durable — see the counter declaration above).
        const isLegacySource = estimate.cost_source === 'model' || estimate.cost_source === 'permit';
        if (isLegacySource && estimate.estimated_cost != null
            && (estimate.estimated_cost > legacyCostCeiling
                || (estimate.modeled_gfa_sqm != null && estimate.modeled_gfa_sqm > legacyGfaCeiling))) {
          estimate.estimated_cost   = null;
          estimate.cost_tier        = null;
          estimate.cost_range_low   = null;
          estimate.cost_range_high  = null;
          estimate._boundExceeded   = true;
          legacyBoundExceeded++;
        }

        if (!dryRun) batchByLeadId.set(getBatchLeadId(estimate), estimate);

        if (estimate.estimated_cost == null) nullEstimates++;

        // §3-ARCHETYPE tier + fallthrough classification (WF2 2026-07-06).
        // Envelope-first: archetype-priced rows carry cost_source archetype_* or
        // the _archetype* 'none' flags; everything else that passed the class
        // gate went down the legacy Steps A–D (T4) and gets the nofit split via
        // the Brain's own mapper (archetypeMapperOutcome — same input builder).
        const isArchetypeSource = typeof estimate.cost_source === 'string'
          && estimate.cost_source.startsWith('archetype_');
        if (isArchetypeSource) {
          if (estimate._archetypeTier === 'additive') archetypeAdditive++;
          else if (estimate._archetypeTier === 't1') archetypeT1++;
          else if (estimate._archetypeTier === 't3') archetypeT3++;
          else archetypeT2++;
          if (Object.keys(estimate.trade_contract_values || {}).length === 0) archetypeTradeless++;
        } else if (estimate._archetypeFitBlocked) {
          archetypeFitBlocked++;
        } else if (estimate._archetypeZeroTotal) {
          archetypeZeroTotal++;
        } else if (!estimate._permitTypeClassSkipped) {
          t4Processed++;
          const outcome = archetypeMapperOutcome(row);
          if (outcome === 'mapper_null') archetypeNofitResidential++;
          else if (outcome === 'mapped') archetypeUnpriceableT4++;
          else t4NonResidential++;
        }

        // WF2 §3-ARCHETYPE (2026-07-06): the archetype envelopes hard-set
        // _liarsGateOverride:false / _zeroTotalBypass:false — the Liar's Gate is
        // retired for T1–T3 (Decision 2) and archetype zero-totals route through
        // _archetypeZeroTotal instead. So these two counters (and the
        // data_quality_snapshots columns they feed) now measure the T4 (legacy)
        // path ONLY. They are KEPT unchanged (no second migration) with this
        // T4-scope annotation; the archetype tiers report via their own telemetry.
        if (estimate._liarsGateOverride) liarsGateOverrides++;
        if (estimate._zeroTotalBypass)   zeroTotalBypasses++;
        if (estimate._permitTypeClassSkipped) permitTypeClassSkipped++;
        if (estimate._matrixMiss) {
          matrixMisses++;
          const key = estimate._matrixMissKey;
          // Keep-frequent / drop-new-at-cap (Spec 47 §3.6 bounded-array):
          // existing entries keep accumulating; new entries past the cap are
          // counted globally but not tracked individually.
          if (matrixMissByKey.has(key)) {
            matrixMissByKey.set(key, matrixMissByKey.get(key) + 1);
          } else if (matrixMissByKey.size < MATRIX_MISS_KEYS_CAP) {
            matrixMissByKey.set(key, 1);
            matrixMissUniqueKeys++;
          } else {
            matrixMissUniqueKeys++;
          }
        }

        if (batchByLeadId.size >= BATCH_SIZE) {
          const batch = Array.from(batchByLeadId.values());
          batchByLeadId.clear();
          try {
            const res = await flushBatch(pool, batch, RUN_AT);
            inserted += res.inserted;
            updated  += res.updated;
            skipped  += res.skipped;
          } catch (err) {
            failedBatches++;
            failedRows += batch.length;
            pipeline.log.error('[compute-cost-estimates]', 'batch failed', {
              batch_size: batch.length,
              err: err && err.message,
            });
          }
        }
      }

      // Final partial batch — drain the Map.
      if (batchByLeadId.size > 0) {
        const batch = Array.from(batchByLeadId.values());
        batchByLeadId.clear();
        try {
          const res = await flushBatch(pool, batch, RUN_AT);
          inserted += res.inserted;
          updated  += res.updated;
          skipped  += res.skipped;
        } catch (err) {
          failedBatches++;
          failedRows += batch.length;
          pipeline.log.error('[compute-cost-estimates]', 'final batch failed', {
            batch_size: batch.length,
            err: err && err.message,
          });
        }
      }
    } catch (streamErr) {
      // If a batch was in-flight when the stream died, those rows are lost.
      // Count them as failed so emitSummary reflects reality.
      if (batchByLeadId.size > 0) {
        failedBatches++;
        failedRows += batchByLeadId.size;
        pipeline.log.error('[compute-cost-estimates]', 'stream error — dropping in-flight batch', {
          dropped_rows: batchByLeadId.size,
          err: streamErr && streamErr.message,
        });
      } else {
        pipeline.log.error('[compute-cost-estimates]', 'stream error', {
          err: streamErr && streamErr.message,
        });
      }
      throw streamErr;
    }

    // ── 8. data_quality_snapshots — observability counters ─────────────────
    // Best-effort UPDATE for today's snapshot row (if it exists). The snapshot
    // row is created by refresh-snapshot.js which runs later in the chain;
    // if absent, this UPDATE is a no-op and the values appear only in
    // audit_table for this pipeline_run.
    if (!dryRun) {
      try {
        const snapResult = await pool.query(
          `UPDATE data_quality_snapshots
              SET cost_estimates_liar_gate_overrides = $1,
                  cost_estimates_zero_total_bypass   = $2
            WHERE snapshot_date = ($3::timestamptz AT TIME ZONE 'UTC')::date`,
          [liarsGateOverrides, zeroTotalBypasses, RUN_AT],
        );
        if (snapResult.rowCount === 0) {
          pipeline.log.info(
            '[compute-cost-estimates]',
            'data_quality_snapshots: no row for today — counters stored in audit_table only',
          );
        }
      } catch (snapErr) {
        pipeline.log.warn('[compute-cost-estimates]', 'data_quality_snapshots update failed', {
          err: snapErr && snapErr.message,
        });
      }
    }

    // ── 8.5 §3-ARCHETYPE declared-ratio calibration signal ──────────────────
    // Declared cost is never ASSIGNED on T1–T3 (Decision 2) but stays the
    // calibration signal: per-tier p50 of model÷declared, computed DB-SIDE via
    // PERCENTILE_CONT (the CoA OOM precedent — never accumulate ratios in JS).
    // Best-effort INFO telemetry; > PLACEHOLDER threshold excludes the $1
    // placeholder filings that made the old Liar's Gate necessary.
    const declaredRatioRows = [];
    if (!dryRun) {
      try {
        const ratioRes = await pool.query(
          `SELECT ce.cost_source,
                  PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY ce.estimated_cost::float8 / p.est_const_cost::float8
                  ) AS ratio_p50,
                  COUNT(*)::int AS n
             FROM cost_estimates ce
             JOIN permits p ON p.permit_num = ce.permit_num
                           AND p.revision_num = ce.revision_num
            WHERE ce.cost_source LIKE 'archetype\\_%'
              AND ce.estimated_cost IS NOT NULL
              AND p.est_const_cost > 1000
            GROUP BY ce.cost_source`,
        );
        for (const r of ratioRes.rows) {
          declaredRatioRows.push({
            metric: `declared_ratio_p50_${r.cost_source}`,
            value: r.ratio_p50 != null ? Number(r.ratio_p50).toFixed(2) + `x (n=${r.n})` : 'N/A',
            threshold: null,
            status: 'INFO',
          });
        }
      } catch (ratioErr) {
        pipeline.log.warn('[compute-cost-estimates]', 'declared-ratio telemetry query failed', {
          err: ratioErr && ratioErr.message,
        });
      }
    }

    // ── 9. Emit summary ────────────────────────────────────────────────────
    // WF1 Spec 83 §3.A re-key — OB-1 cascade + OB-2 zero-coverage FAIL +
    // OB-3a permit_type_class_skipped_pct + OB-3b matrix_miss_pct.
    // OB-2 is the architecture-independent gate that catches the 14-day
    // silent regression mechanism (model_coverage_pct stuck at 0).
    const modelCoveragePct = processed > 0
      ? ((processed - nullEstimates) / processed) * 100
      : 0;
    const matrixMissPct = processed > 0
      ? (matrixMisses / processed) * 100
      : 0;
    const permitTypeClassSkippedPct = processed > 0
      ? (permitTypeClassSkipped / processed) * 100
      : 0;
    // §3-ARCHETYPE denominators (WF2 2026-07-06). residentialProcessed = every
    // construction-class row inside the low-rise gate (priced + none'd + T4
    // fallthrough); matrix misses can only occur on the T4 path, so the gated
    // miss rate uses t4Processed.
    const archetypePriced = archetypeT1 + archetypeT2 + archetypeT3 + archetypeAdditive;
    const residentialProcessed = archetypePriced + archetypeFitBlocked + archetypeZeroTotal
      + archetypeNofitResidential + archetypeUnpriceableT4;
    const archetypeCoveragePct = residentialProcessed > 0
      ? (archetypePriced / residentialProcessed) * 100
      : 0;
    const archetypeNofitPct = residentialProcessed > 0
      ? (archetypeNofitResidential / residentialProcessed) * 100
      : 0;
    const t4MatrixMissPct = t4Processed > 0
      ? (matrixMisses / t4Processed) * 100
      : 0;

    // All thresholds externalized to logic_variables (Spec 86 Control Panel-tunable).
    // Defaults documented in scripts/seeds/logic_variables.json.
    const warnPct      = Number(logicVars.cost_model_coverage_warn_pct);
    const coverageFail = Number(logicVars.cost_model_coverage_fail_pct);
    const missWarnPct  = Number(logicVars.cost_matrix_miss_warn_pct);
    const missFailPct  = Number(logicVars.cost_matrix_miss_fail_pct);
    const ptcWarnPct   = Number(logicVars.cost_ptc_skipped_warn_pct);
    const t4MissWarnPct = Number(logicVars.cost_t4_matrix_miss_warn_pct);
    const t4MissFailPct = Number(logicVars.cost_t4_matrix_miss_fail_pct);
    const nofitWarnPct  = Number(logicVars.archetype_nofit_residential_warn_pct);

    // OB-2 row — empty-input INFO branch, otherwise PASS/WARN/FAIL on coverage.
    // Spec 83 §3.A WF1 thresholds: PI-3 mapping predicts ~52% post-fix coverage
    // (47-57% acceptance band per D2). WARN = <warn_pct; FAIL <= coverageFail
    // (architecture-independent: catches "matrix never matches anything" class).
    const modelCoverageRow = !Number.isFinite(modelCoveragePct)
      ? { metric: 'model_coverage_pct', value: 'N/A', threshold: `>= ${warnPct}%`, status: 'INFO' }
      : processed === 0
        ? { metric: 'model_coverage_pct', value: 'N/A', threshold: `>= ${warnPct}%`, status: 'INFO' }
        : modelCoveragePct <= coverageFail
          ? { metric: 'model_coverage_pct', value: modelCoveragePct.toFixed(1) + '%', threshold: `> ${coverageFail}%`, status: 'FAIL' }
          : modelCoveragePct >= warnPct
            ? { metric: 'model_coverage_pct', value: modelCoveragePct.toFixed(1) + '%', threshold: `>= ${warnPct}%`, status: 'PASS' }
            : { metric: 'model_coverage_pct', value: modelCoveragePct.toFixed(1) + '%', threshold: `>= ${warnPct}%`, status: 'WARN' };

    // OB-3b matrix_miss_pct — DEMOTED to INFO (§3-ARCHETYPE, WF2 2026-07-06):
    // the full-population miss rate is meaningless once T1–T3 bypass the matrix
    // (it can only shrink as archetype coverage grows). The GATED metric is
    // t4_matrix_miss_pct below, on the T4 denominator, so a T4-only regression
    // (matrix vocabulary drift) stays visible. Old thresholds kept as context.
    const matrixMissRow = processed === 0
      ? { metric: 'matrix_miss_pct', value: 'N/A', threshold: null, status: 'INFO' }
      : { metric: 'matrix_miss_pct', value: matrixMissPct.toFixed(1) + '%', threshold: `(demoted; was <= ${missWarnPct}%/${missFailPct}%)`, status: 'INFO' };

    // §3-ARCHETYPE t4_matrix_miss_pct — the T4-scoped replacement gate.
    const t4MatrixMissRow = t4Processed === 0
      ? { metric: 't4_matrix_miss_pct', value: 'N/A', threshold: `<= ${t4MissWarnPct}%`, status: 'INFO' }
      : t4MatrixMissPct > t4MissFailPct
        ? { metric: 't4_matrix_miss_pct', value: t4MatrixMissPct.toFixed(1) + '%', threshold: `<= ${t4MissWarnPct}% WARN, <= ${t4MissFailPct}% FAIL`, status: 'FAIL' }
        : t4MatrixMissPct > t4MissWarnPct
          ? { metric: 't4_matrix_miss_pct', value: t4MatrixMissPct.toFixed(1) + '%', threshold: `<= ${t4MissWarnPct}%`, status: 'WARN' }
          : { metric: 't4_matrix_miss_pct', value: t4MatrixMissPct.toFixed(1) + '%', threshold: `<= ${t4MissWarnPct}%`, status: 'PASS' };

    // §3-ARCHETYPE archetype_map_nofit_residential — the mapper-quality WARN
    // gate (mapper CALLED and returned null, over the low-rise denominator).
    const nofitRow = residentialProcessed === 0
      ? { metric: 'archetype_map_nofit_residential_pct', value: 'N/A', threshold: `<= ${nofitWarnPct}%`, status: 'INFO' }
      : archetypeNofitPct > nofitWarnPct
        ? { metric: 'archetype_map_nofit_residential_pct', value: archetypeNofitPct.toFixed(1) + '%', threshold: `<= ${nofitWarnPct}%`, status: 'WARN' }
        : { metric: 'archetype_map_nofit_residential_pct', value: archetypeNofitPct.toFixed(1) + '%', threshold: `<= ${nofitWarnPct}%`, status: 'PASS' };

    // OB-3a permit_type_class_skipped_pct — externalized threshold.
    const ptcSkippedRow = processed === 0
      ? { metric: 'permit_type_class_skipped_pct', value: 'N/A', threshold: `<= ${ptcWarnPct}%`, status: 'INFO' }
      : permitTypeClassSkippedPct > ptcWarnPct
        ? { metric: 'permit_type_class_skipped_pct', value: permitTypeClassSkippedPct.toFixed(1) + '%', threshold: `<= ${ptcWarnPct}%`, status: 'WARN' }
        : { metric: 'permit_type_class_skipped_pct', value: permitTypeClassSkippedPct.toFixed(1) + '%', threshold: `<= ${ptcWarnPct}%`, status: 'PASS' };

    const costAuditRows = [
      { metric: 'permits_processed',         value: processed,          threshold: null,    status: 'INFO' },
      { metric: 'permits_inserted',          value: inserted,           threshold: null,    status: 'INFO' },
      { metric: 'permits_updated',           value: updated,            threshold: null,    status: 'INFO' },
      { metric: 'permits_skipped_unchanged', value: skipped,            threshold: null,    status: 'INFO' },
      { metric: 'liar_gate_overrides',       value: liarsGateOverrides, threshold: null,    status: 'INFO' },
      { metric: 'zero_total_bypass',         value: zeroTotalBypasses,  threshold: null,    status: 'INFO' },
      { metric: 'permit_type_class_skipped', value: permitTypeClassSkipped, threshold: null, status: 'INFO' },
      ptcSkippedRow,
      modelCoverageRow,
      matrixMissRow,
      t4MatrixMissRow,
      // §3-ARCHETYPE tier + fallthrough rows (WF2 2026-07-06) — tier counts INFO;
      // the nofit split: mapper-null residential WARN-gated, non-lowrise INFO.
      { metric: 'archetype_t1_declared_area',   value: archetypeT1,             threshold: null, status: 'INFO' },
      { metric: 'archetype_t2_parcel',          value: archetypeT2,             threshold: null, status: 'INFO' },
      { metric: 'archetype_t3_rate',            value: archetypeT3,             threshold: null, status: 'INFO' },
      { metric: 'archetype_additive_pairs',     value: archetypeAdditive,       threshold: null, status: 'INFO' },
      { metric: 'archetype_coverage_pct',       value: residentialProcessed > 0 ? archetypeCoveragePct.toFixed(1) + '%' : 'N/A', threshold: null, status: 'INFO' },
      { metric: 'tier_none_count',              value: archetypeFitBlocked + archetypeZeroTotal, threshold: null, status: 'INFO' },
      { metric: 'archetype_fit_blocked',        value: archetypeFitBlocked,     threshold: null, status: 'INFO' },
      { metric: 'archetype_zero_total',         value: archetypeZeroTotal,      threshold: null, status: 'INFO' },
      { metric: 'archetype_tradeless_count',    value: archetypeTradeless,      threshold: null, status: 'INFO' },
      { metric: 'archetype_unpriceable_t4',     value: archetypeUnpriceableT4,  threshold: null, status: 'INFO' },
      { metric: 't4_nonresidential_count',      value: t4NonResidential,        threshold: null, status: 'INFO' },
      // P13-2 — legacy (model/permit) rows nulled by the magnitude clamp because their
      // cost/GFA rode mislinked whole-campus massing. INFO (an honest 'cannot price'
      // outcome, not a run failure); assert-data-bounds carries the residual WARN gate.
      { metric: 'legacy_bound_exceeded',        value: legacyBoundExceeded,     threshold: null, status: 'INFO' },
      nofitRow,
      ...declaredRatioRows,
    ];
    // WF3 Pass-2.5 Finding D — gated on >0 to avoid zero-count noise (DeepSeek NIT)
    if (matrixMisses > 0) {
      const topKeys = Array.from(matrixMissByKey.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      costAuditRows.push({
        metric: 'matrix_misses',
        value: matrixMisses,
        threshold: null,
        status: 'INFO',
      });
      // value = tracked in Map (capped at MATRIX_MISS_KEYS_CAP);
      // _total = true uncapped count seen across the run;
      // _truncated = true when the Map dropped at least one new key.
      costAuditRows.push({
        metric: 'matrix_miss_unique_keys',
        value: matrixMissByKey.size,
        threshold: null,
        status: 'INFO',
        _truncated: matrixMissUniqueKeys > MATRIX_MISS_KEYS_CAP,
        _total: matrixMissUniqueKeys,
      });
      costAuditRows.push({
        metric: 'matrix_miss_top_keys',
        value: JSON.stringify(Object.fromEntries(topKeys)),
        threshold: null,
        status: 'INFO',
      });
    }
    if (failedRows > 0) {
      costAuditRows.push({ metric: 'failed_rows',    value: failedRows,    threshold: '== 0', status: 'WARN' });
      costAuditRows.push({ metric: 'failed_batches', value: failedBatches, threshold: '== 0', status: 'WARN' });
    }
    // OB-1 row-derived verdict cascade (Spec 47 §8.2): pick highest severity
    // from any audit row. Replaces parallel-boolean which couldn't escalate
    // to FAIL (the 14-day silent regression mechanism — coverage was 0 but
    // verdict capped at WARN). Now FAIL propagates and the chain orchestrator
    // can short-circuit downstream consumers.
    const costVerdict = costAuditRows.some((r) => r.status === 'FAIL')
      ? 'FAIL'
      : costAuditRows.some((r) => r.status === 'WARN')
        ? 'WARN'
        : 'PASS';

    pipeline.emitSummary({
      records_total:   processed,
      records_new:     inserted,
      records_updated: updated,
      records_meta: {
        audit_table: {
          phase:   14,
          name:    'Cost Estimates',
          verdict: costVerdict,
          rows:    costAuditRows,
        },
        ...(failedBatches > 0 ? { failed_batches: failedBatches, failed_rows: failedRows } : {}),
        ...(dryRun ? { dry_run: true } : {}),
      },
    });

    pipeline.emitMeta(
      {
        permits:                [
          'permit_num', 'revision_num', 'permit_type', 'structure_type', 'est_const_cost', 'scope_tags',
          // §3-ARCHETYPE (WF2 2026-07-06): mapper inputs + Spec 88 §4D propagated columns
          'project_type', 'residential_sqm', 'interior_alterations_sqm', 'dwelling_units_created',
          'neighbourhood_cost_premium',
          'cost_fb_total', 'cost_coa_total', 'cost_addition_total', 'cost_gut_total',
          'cost_basement_underpin_per_sqm', 'cost_basement_per_sqm', 'cost_garage_total',
          'cost_laneway_suite_total', 'cost_garden_suite_total', 'cost_kitchen_per_sqm',
          'cost_bath_per_sqm', 'cost_solar_total',
          'opt_aor_gfa_sqm', 'opt_coa_gfa_sqm', 'cur_floor_gfa_sqm', 'cur_pot_2story_gfa_sqm',
          'max_garage_gfa_sqm', 'max_laneway_suite_gfa_sqm', 'max_garden_suite_gfa_sqm',
          'cur_est_kitchen_gfa_sqm', 'cur_est_bath_gfa_sqm', 'max_buildable_footprint_sqm',
        ],
        permit_trades:          ['permit_num', 'revision_num', 'trade_slug'],
        permit_parcels:         ['permit_num', 'revision_num', 'parcel_id'],
        parcels:                ['id', 'lot_size_sqm'],
        parcel_buildings:       ['parcel_id', 'building_id', 'is_primary'],
        building_footprints:    ['id', 'footprint_area_sqm', 'estimated_stories'],
        neighbourhoods:         ['neighbourhood_id', 'avg_household_income', 'tenure_renter_pct'],
        trade_sqft_rates:       ['trade_slug', 'base_rate_sqft', 'structure_complexity_factor'],
        scope_intensity_matrix: ['permit_type', 'structure_type', 'gfa_allocation_percentage'],
        permit_type_classifications: ['permit_type', 'class'],
        // §3-ARCHETYPE T3 rates + escalation index (Spec 88 §2.9)
        archetype_cost_rates:   ['archetype', 'cost_per_sqm', 'cost_adjustment_factor', 'escalation_index_base'],
      },
      {
        cost_estimates: [
          'permit_num', 'revision_num', 'estimated_cost', 'cost_source', 'cost_tier',
          'cost_range_low', 'cost_range_high', 'premium_factor', 'complexity_score',
          'model_version', 'is_geometric_override', 'modeled_gfa_sqm',
          'effective_area_sqm', 'trade_contract_values', 'computed_at',
          'lead_id', // WF3 #16 fold (mig 145 PK fix)
        ],
        data_quality_snapshots: ['cost_estimates_liar_gate_overrides', 'cost_estimates_zero_total_bypass'],
      },
    );

  }, { skipEmit: false }); // end withAdvisoryLock

  // Lock held — emit rich SKIP with audit_table (FreshnessTimeline verdict).
  if (!lockResult.acquired) {
    pipeline.emitSummary({
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        skipped: true,
        reason: 'advisory_lock_held_elsewhere',
        advisory_lock_id: ADVISORY_LOCK_ID,
        audit_table: {
          phase: 14,
          name: 'Cost Estimates',
          verdict: 'SKIP',
          rows: [
            { metric: 'permits_processed', value: 0, threshold: null, status: 'SKIP' },
            { metric: 'permits_inserted',  value: 0, threshold: null, status: 'SKIP' },
            { metric: 'permits_updated',   value: 0, threshold: null, status: 'SKIP' },
          ],
        },
      },
    });
    pipeline.emitMeta(
      {
        permits:                ['permit_num'],
        permit_trades:          ['permit_num', 'revision_num', 'trade_slug'],
        trade_sqft_rates:       ['trade_slug'],
        scope_intensity_matrix: ['permit_type', 'structure_type'],
      },
      { cost_estimates: ['permit_num'] },
    );
    return;
  }
}); // pipeline.run

} // if (require.main === module)

// ─── Exports ──────────────────────────────────────────────────────────────────
// Re-export the Brain's estimateCostShared so parity-battery tests can access
// both JS and TS paths via a single require() of this file.
module.exports = { estimateCostShared };
