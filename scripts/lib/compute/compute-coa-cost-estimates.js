'use strict';
/**
 * compute_coa_cost_estimates — the pure compute (MATERIALIZER, `execution.materialize_form: "rows"`).
 *
 * Phase-4 wave 4 lane C; full-form row 7 (Spec 123 §7, operator Q5 y 2026-10-19). Written against the
 * MATERIALIZER runner-built row form, Spec 124 R-EH (RE-FREEZE #37). The runner pages the
 * source, reads the three rate lookups once (refusing an empty trade_sqft_rates or a duplicate key, the
 * legacy startup guards), stamps `computed_at` / `cost_classified_at` from its single RUN_AT capture,
 * writes both targets in one transaction per batch, and runs `buildPostSql` once after the last batch.
 * This module holds no query, transaction, clock, catalog probe, argv/env read or status decision (R-BZ).
 *
 * The pricing is the shipped Brain, unchanged: the archetype ladder first (`tryArchetypeCost` over
 * `buildCoaArchetypeInput`, T2-or-nothing on CoA), the legacy geometric path (`estimateCostShared`, T4)
 * on fallthrough (Spec 83 §3-ARCHETYPE; legacy `compute-coa-cost-estimates.js:543-551`).
 *
 * The source reads the enrich_parcels max-build family off coa_applications EXACTLY as legacy does
 * (`:473-482`; Spec 78 O-11 keeps those columns, so this consumer must not change what it reads).
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 12, §6.8 row 668
 *            docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE, §Geometric-Only Path for CoA
 *            docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ), R-CY (iii), R-DF
 */

const { buildCoaConfig, mapCoaRowToBrainInput, buildCoaArchetypeInput } = require('../coa-cost-model');
const {
  estimateCostShared,
  tryArchetypeCost,
  resolveArchetypeRates,
  archetypeMapperOutcome,
  MODEL_VERSION,
} = require('../../../src/features/leads/lib/cost-model-shared');

/** The select list, byte-for-byte the legacy column set and casts (`:449-490`). */
const SELECT_LIST = `ca.id,
       ca.lead_id,
       ca.scope_tags,
       ca.structure_type,
       ca.project_type,
       ca.neighbourhood_cost_premium::float8 AS neighbourhood_cost_premium,
       ca.cost_fb_total::float8 AS cost_fb_total,
       ca.cost_coa_total::float8 AS cost_coa_total,
       ca.cost_addition_total::float8 AS cost_addition_total,
       ca.cost_gut_total::float8 AS cost_gut_total,
       ca.cost_basement_underpin_per_sqm::float8 AS cost_basement_underpin_per_sqm,
       ca.cost_basement_per_sqm::float8 AS cost_basement_per_sqm,
       ca.cost_garage_total::float8 AS cost_garage_total,
       ca.cost_laneway_suite_total::float8 AS cost_laneway_suite_total,
       ca.cost_garden_suite_total::float8 AS cost_garden_suite_total,
       ca.cost_kitchen_per_sqm::float8 AS cost_kitchen_per_sqm,
       ca.cost_bath_per_sqm::float8 AS cost_bath_per_sqm,
       ca.cost_solar_total::float8 AS cost_solar_total,
       ca.opt_aor_gfa_sqm::float8 AS opt_aor_gfa_sqm,
       ca.opt_coa_gfa_sqm::float8 AS opt_coa_gfa_sqm,
       ca.cur_floor_gfa_sqm::float8 AS cur_floor_gfa_sqm,
       ca.cur_pot_2story_gfa_sqm::float8 AS cur_pot_2story_gfa_sqm,
       ca.max_garage_gfa_sqm::float8 AS max_garage_gfa_sqm,
       ca.max_laneway_suite_gfa_sqm::float8 AS max_laneway_suite_gfa_sqm,
       ca.max_garden_suite_gfa_sqm::float8 AS max_garden_suite_gfa_sqm,
       ca.cur_est_kitchen_gfa_sqm::float8 AS cur_est_kitchen_gfa_sqm,
       ca.cur_est_bath_gfa_sqm::float8 AS cur_est_bath_gfa_sqm,
       ca.max_buildable_footprint_sqm::float8 AS max_buildable_footprint_sqm,
       lp.parcel_id,
       p.lot_size_sqm::float8 AS lot_size_sqm,
       p.frontage_m::float8 AS frontage_m,
       bf.footprint_area_sqm::float8 AS footprint_area_sqm,
       bf.estimated_stories AS estimated_stories,
       n.avg_household_income::float8 AS avg_household_income,
       n.tenure_renter_pct::float8 AS tenure_renter_pct,
       COALESCE(lt_agg.active_trades, ARRAY[]::text[]) AS active_trade_slugs`;

/** The joins, byte-for-byte legacy (`:491-514`). */
const FROM_JOINS = `FROM coa_applications ca
  LEFT JOIN LATERAL (
    SELECT lp.parcel_id FROM lead_parcels lp
     WHERE lp.lead_id = ca.lead_id
     ORDER BY lp.confidence DESC NULLS LAST, lp.parcel_id ASC
     LIMIT 1
  ) lp ON true
  LEFT JOIN parcels p ON p.id = lp.parcel_id
  LEFT JOIN LATERAL (
    SELECT building_id FROM parcel_buildings
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
  ) lt_agg ON true`;

/**
 * The cursor (`:515-527`): incremental = never cost-classified or trades reclassified since; full
 * (`override.force_full`, the legacy `--full`) = every trade-classified CoA; both exclude a
 * future-dated trade_classified_at against the run clock ($3).
 */
function pendingWhere(mode) {
  const gate = mode === 'full'
    ? 'ca.trade_classified_at IS NOT NULL'
    : 'ca.cost_classified_at IS NULL OR ca.cost_classified_at < ca.trade_classified_at';
  return `(${gate})
   AND (ca.trade_classified_at IS NULL OR ca.trade_classified_at <= $3::timestamptz)`;
}

/** @returns {{count_sql: string, batch_sql: string, batch_binds: string[], count_binds: string[]}} */
function buildSourceSql(_descriptor, _config, { mode } = {}) {
  const where = pendingWhere(mode).replace('$3::timestamptz', '$1::timestamptz');
  return {
    count_sql: `SELECT COUNT(*)::int AS coa_eligible FROM coa_applications ca WHERE ${where}`,
    count_binds: ['run_at'],
    batch_sql: `SELECT ${SELECT_LIST}
  ${FROM_JOINS}
 WHERE ${pendingWhere(mode)}
   AND ca.id > $1
 ORDER BY ca.id ASC
 LIMIT $2`,
    batch_binds: ['last_key', 'batch_size', 'run_at'],
  };
}

/**
 * The once-per-run post reads (ruling §2 (e)): the cost distribution over this run's written coa: rows
 * (legacy predicate `computed_at = RUN_AT`, CCCE-D6 — guard-skipped rows keep their old computed_at and are
 * excluded, parity) and the corpus coverage. The percentiles are definitional, pinned min = max variables
 * (R-CV), bound as parameters.
 */
function buildPostSql(_descriptor, config) {
  return {
    post_sql: `SELECT
  PERCENTILE_CONT($2::float8) WITHIN GROUP (ORDER BY estimated_cost) AS p25,
  PERCENTILE_CONT($3::float8) WITHIN GROUP (ORDER BY estimated_cost) AS p50,
  PERCENTILE_CONT($4::float8) WITHIN GROUP (ORDER BY estimated_cost) AS p75,
  (SELECT COUNT(*) FROM cost_estimates WHERE lead_id LIKE 'coa:%' AND estimated_cost IS NOT NULL)::int AS coa_corpus_priced,
  (SELECT COUNT(*) FROM coa_applications)::int AS coa_corpus_total
FROM cost_estimates
WHERE lead_id LIKE 'coa:%'
  AND computed_at = $1::timestamptz
  AND estimated_cost IS NOT NULL`,
    post_binds: ['run_at'],
    post_params: [
      config.compute_coa_cost_estimates_distribution_p25,
      config.compute_coa_cost_estimates_distribution_p50,
      config.compute_coa_cost_estimates_distribution_p75,
    ],
  };
}

/** The Brain configs, built once per lookups object (pure memo on an immutable input). */
const brainCache = new WeakMap();
function brainConfigs(lookups, config) {
  const hit = brainCache.get(lookups);
  if (hit && hit.config === config) return hit;
  const archetypeRates = resolveArchetypeRates(
    lookups.archetype_cost_rates,
    config.cost_escalation_index != null ? Number(config.cost_escalation_index) : null,
  );
  // The cost model reads the legacy names; this step declares their step-owned copies (R-DE (v), migration 275).
  const logicVars = {
    ...config,
    model_range_pct: config.compute_coa_cost_estimates_model_range_pct,
    fallback_range_pct: config.compute_coa_cost_estimates_fallback_range_pct,
  };
  const base = buildCoaConfig({ tradeRates: lookups.trade_sqft_rates, scopeMatrix: lookups.scope_intensity_matrix, archetypeRates, logicVars });
  const made = { config, base, arch: { ...base, archetypeEnabled: Number(config.archetype_cost_enabled) === 1 } };
  brainCache.set(lookups, made);
  return made;
}

/**
 * One batch: source rows → target rows (ruling §2 (c)). Pure.
 *   e1 cost_estimates   A guarded_upsert (12 guard columns), only for a non-NULL estimate; no retraction (CCCE-D1)
 *   e2 coa_applications G keyed update, every processed row (the cost columns + the run_at watermark)
 */
function materializeRows(sourceRows, { config, lookups }) {
  const { base, arch } = brainConfigs(lookups, config);
  const e1 = [];
  const e2 = [];
  const m = {
    processed: 0, coa_with_cost: 0, coa_without_cost: 0, coa_with_fallback: 0,
    archetype_t1: 0, archetype_t2: 0, archetype_t3: 0, archetype_additive: 0, archetype_fit_blocked: 0,
    archetype_zero_total: 0, archetype_tradeless: 0, archetype_nofit_residential: 0, archetype_unpriceable_t4: 0,
    t4_nonresidential: 0, t4_processed: 0,
    null_cost_reasons: { no_parcel: 0, no_scope_tags: 0, no_active_trades: 0, no_matching_rate: 0 },
    null_cost_reasons_additive: { no_parcel: 0, no_scope_tags: 0, no_active_trades: 0 },
  };

  for (const row of sourceRows) {
    m.processed += 1;
    const scopeTagsEmpty = !Array.isArray(row.scope_tags) || !row.scope_tags.length;
    const activeTradesEmpty = !Array.isArray(row.active_trade_slugs) || !row.active_trade_slugs.length;
    const noParcel = row.parcel_id == null;

    const archRow = buildCoaArchetypeInput(row);
    const out = tryArchetypeCost(archRow, arch) || estimateCostShared(mapCoaRowToBrainInput(row), base);

    if (typeof out.cost_source === 'string' && out.cost_source.startsWith('archetype_')) {
      if (out._archetypeTier === 'additive') m.archetype_additive += 1;
      else if (out._archetypeTier === 't1') m.archetype_t1 += 1;
      else if (out._archetypeTier === 't3') m.archetype_t3 += 1;
      else m.archetype_t2 += 1;
      if (!Object.keys(out.trade_contract_values || {}).length) m.archetype_tradeless += 1;
    } else if (out._archetypeFitBlocked) {
      m.archetype_fit_blocked += 1;
    } else if (out._archetypeZeroTotal) {
      m.archetype_zero_total += 1;
    } else if (!out._permitTypeClassSkipped) {
      m.t4_processed += 1;
      const outcome = archetypeMapperOutcome(archRow);
      if (outcome === 'mapper_null') m.archetype_nofit_residential += 1;
      else if (outcome === 'mapped') m.archetype_unpriceable_t4 += 1;
      else m.t4_nonresidential += 1;
    }

    e2.push({ id: row.id, modeled_gfa_sqm: out.modeled_gfa_sqm, estimated_cost: out.estimated_cost, cost_source: out.cost_source });

    if (out.estimated_cost != null) {
      m.coa_with_cost += 1;
      if ('_usedFallback' in out && out._usedFallback) m.coa_with_fallback += 1;
      e1.push({
        lead_id: row.lead_id,
        permit_num: null,
        revision_num: null,
        estimated_cost: out.estimated_cost,
        cost_source: out.cost_source,
        cost_tier: out.cost_tier,
        cost_range_low: out.cost_range_low,
        cost_range_high: out.cost_range_high,
        premium_factor: out.premium_factor,
        complexity_score: out.complexity_score,
        model_version: MODEL_VERSION,
        is_geometric_override: out.is_geometric_override === true,
        modeled_gfa_sqm: out.modeled_gfa_sqm,
        effective_area_sqm: out.effective_area_sqm,
        trade_contract_values: out.trade_contract_values || {},
      });
    } else {
      m.coa_without_cost += 1;
      const r = m.null_cost_reasons;
      if (noParcel) r.no_parcel += 1;
      else if (scopeTagsEmpty) r.no_scope_tags += 1;
      else if (activeTradesEmpty) r.no_active_trades += 1;
      else r.no_matching_rate += 1;
      const a = m.null_cost_reasons_additive;
      if (noParcel) a.no_parcel += 1;
      if (scopeTagsEmpty) a.no_scope_tags += 1;
      if (activeTradesEmpty) a.no_active_trades += 1;
    }
  }
  return { rows: { e1, e2 }, replace_keys: {}, matched: m };
}

/** Legacy money format (`:697`), locale pinned for a stable 7-day observer diff. */
function fmtMoney(v) {
  return v == null ? 'N/A' : `$${Math.round(v).toLocaleString('en-CA')}`;
}

/**
 * Run-level derivations over the runner-summed `matched` and the post read (pure). Every bound lives in a
 * declared check (G7): coverage (`limit_from_config` FAIL floor + `warn_limit_from_config` WARN floor) and
 * the nofit share (`limit_from_config`).
 */
function finalizeMatched(m, { post }) {
  const p = post || {};
  const num = (v) => (v == null ? null : Number(v));
  const [p25, p50, p75] = [num(p.p25), num(p.p50), num(p.p75)];
  const priced = m.archetype_t1 + m.archetype_t2 + m.archetype_t3 + m.archetype_additive;
  const residential = priced + m.archetype_fit_blocked + m.archetype_zero_total + m.archetype_nofit_residential + m.archetype_unpriceable_t4;
  const pct = (a, b) => (b ? (100 * a) / b : null);
  return {
    ...m,
    coa_eligible: m.processed,
    cost_estimate_coverage_pct: pct(m.coa_with_cost, m.processed),
    cost_with_fallback_pct: pct(m.coa_with_fallback, m.coa_with_cost),
    // Spec 124 R-DE (iv) "Emits are flat" (operator Q-W4G-3 (a), 2026-10-19): the fixed-key objects travel as keys.
    cost_distribution_p25: p25,
    cost_distribution_p50: p50,
    cost_distribution_p75: p75,
    ...flatten('null_cost_reasons', m.null_cost_reasons),
    ...flatten('null_cost_reasons_additive', m.null_cost_reasons_additive),
    cost_distribution_p25_p50_p75: p25 == null && p50 == null && p75 == null ? 'N/A' : `${fmtMoney(p25)} / ${fmtMoney(p50)} / ${fmtMoney(p75)}`,
    coa_corpus_priced: num(p.coa_corpus_priced),
    coa_corpus_total: num(p.coa_corpus_total),
    coa_corpus_cost_coverage_pct: pct(num(p.coa_corpus_priced), num(p.coa_corpus_total)),
    archetype_coverage_pct: pct(priced, residential),
    archetype_map_nofit_residential_pct: pct(m.archetype_nofit_residential, residential),
    tier_none_count: m.archetype_fit_blocked + m.archetype_zero_total,
  };
}

/** One fixed-key tally object as flat `<prefix>_<key>` emits (R-DE (iv)). */
function flatten(prefix, obj) {
  return Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [`${prefix}_${k}`, v]));
}

// ---- checks (descriptor order; Spec 122 §5.5 (1), (4)) ----

function cost_estimate_coverage_pct(ctx) {
  const m = ctx.matched;
  // Legacy INFO N/A on an empty cursor (`:738-741`, pinned L16): the population is empty.
  if (!m.processed) ctx.report('cost_estimate_coverage_pct', { value: 0, inert: true, detail: 'N/A' });
  else ctx.report('cost_estimate_coverage_pct', { value: m.cost_estimate_coverage_pct });
}

function archetype_map_nofit_residential_pct(ctx) {
  const m = ctx.matched;
  // Legacy INFO N/A when no low-rise residential CoA was processed (`:727-728`, pinned L19).
  if (m.archetype_map_nofit_residential_pct == null) ctx.report('archetype_map_nofit_residential_pct', { value: 0, inert: true, detail: 'N/A' });
  else ctx.report('archetype_map_nofit_residential_pct', { value: m.archetype_map_nofit_residential_pct });
}

// ---- dispatch ----

/** Spec 122 §5.5 (1): keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  cost_estimate_coverage_pct,
  archetype_map_nofit_residential_pct,
};

/**
 * §5.5 (1): run the SELECTED post checks over the runner-summed `ctx.matched` (the rows arm hands it over, R-EH),
 * and return the declared emits. The loop is the error boundary.
 */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.matched) return { records_meta: {} };
  const meta = {};
  for (const e of ctx.descriptor.emits || []) if (ctx.matched[e.key] !== undefined) meta[e.key] = ctx.matched[e.key];
  return { records_meta: meta };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildSourceSql = buildSourceSql;
module.exports.buildPostSql = buildPostSql;
module.exports.materializeRows = materializeRows;
module.exports.finalizeMatched = finalizeMatched;
module.exports.fmtMoney = fmtMoney;
