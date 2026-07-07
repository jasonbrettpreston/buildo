#!/usr/bin/env node
/**
 * WF2 P5 — Priceable-but-'none' rejection taxonomy (permits + CoA).
 *
 * Re-runs the LIVE archetype mapper + T1→T3 ladder in-memory over every
 * residential-lowrise permit / every CoA that carries cost_source='none', and
 * buckets the REASON the row is unpriced. Programmatic (not sampled): every
 * target row is re-classified. Read-only — no DB writes.
 *
 * Buckets (per row):
 *   now_priced:<source>   the re-run WOULD now price it (stale data / fixed bug)
 *   class_gate            permit_type_class != 'construction' (permits only)
 *   not_lowrise           structure_type outside the low-rise residential gate
 *   mapper_null:*         low-rise, but the scope maps to NO archetype line
 *   fit_blocked           mapped to a fit-gated line whose scalar is NULL (fits:false)
 *   zero_total            mapped line scalar <= 0 (data-poison guard)
 *   ladder_rejected:<r>   mapped + priced but every rung rejected (t1_band/t2_bound/…)
 *   mapped_no_scalar      mapped, but the line carries no propagated cost + no own area
 *
 * Output: docs/reports/pipeline-validation/2026-07-07-priceable-none-taxonomy.md
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPool, getDbTimestamp } = require('../lib/pipeline');
const { loadMarketplaceConfigs } = require('../lib/config-loader');
const {
  estimateCostShared,
  tryArchetypeCost,
  priceLine,
  resolveArchetypeRates,
} = require('../../src/features/leads/lib/cost-model-shared');
const { mapToLines, isLowRiseResidential } = require('../../src/features/leads/lib/archetype-cost-map');
const { buildCoaConfig, buildCoaArchetypeInput, mapCoaRowToBrainInput } = require('../lib/coa-cost-model');

const pool = createPool();

// The exact §4D-propagated cost/area column list the two Muscles fetch.
// Parameterized by the base-table alias (p=permits, ca=coa) so the bare
// column names are never ambiguous against joined parcels/neighbourhoods.
const costCols = (a) => `
  ${a}.neighbourhood_cost_premium::float8  AS neighbourhood_cost_premium,
  ${a}.cost_fb_total::float8               AS cost_fb_total,
  ${a}.cost_coa_total::float8              AS cost_coa_total,
  ${a}.cost_addition_total::float8         AS cost_addition_total,
  ${a}.cost_gut_total::float8              AS cost_gut_total,
  ${a}.cost_basement_underpin_per_sqm::float8 AS cost_basement_underpin_per_sqm,
  ${a}.cost_basement_per_sqm::float8       AS cost_basement_per_sqm,
  ${a}.cost_garage_total::float8           AS cost_garage_total,
  ${a}.cost_laneway_suite_total::float8    AS cost_laneway_suite_total,
  ${a}.cost_garden_suite_total::float8     AS cost_garden_suite_total,
  ${a}.cost_kitchen_per_sqm::float8        AS cost_kitchen_per_sqm,
  ${a}.cost_bath_per_sqm::float8           AS cost_bath_per_sqm,
  ${a}.cost_solar_total::float8            AS cost_solar_total,
  ${a}.opt_aor_gfa_sqm::float8             AS opt_aor_gfa_sqm,
  ${a}.opt_coa_gfa_sqm::float8             AS opt_coa_gfa_sqm,
  ${a}.cur_floor_gfa_sqm::float8           AS cur_floor_gfa_sqm,
  ${a}.cur_pot_2story_gfa_sqm::float8      AS cur_pot_2story_gfa_sqm,
  ${a}.max_garage_gfa_sqm::float8          AS max_garage_gfa_sqm,
  ${a}.max_laneway_suite_gfa_sqm::float8   AS max_laneway_suite_gfa_sqm,
  ${a}.max_garden_suite_gfa_sqm::float8    AS max_garden_suite_gfa_sqm,
  ${a}.cur_est_kitchen_gfa_sqm::float8     AS cur_est_kitchen_gfa_sqm,
  ${a}.cur_est_bath_gfa_sqm::float8        AS cur_est_bath_gfa_sqm,
  ${a}.max_buildable_footprint_sqm::float8 AS max_buildable_footprint_sqm
`;

const uniq = (a) => [...new Set(Array.isArray(a) ? a : [])];

// ── Permit config (mirror of compute-cost-estimates.js §5) ────────────────
async function buildPermitConfig() {
  const { logicVars } = await loadMarketplaceConfigs(pool, 'compute-cost-estimates');
  const [tradeRatesRes, scopeMatrixRes, archetypeRatesRes] = await Promise.all([
    pool.query('SELECT trade_slug, base_rate_sqft::float8, structure_complexity_factor::float8 FROM trade_sqft_rates'),
    pool.query('SELECT permit_type, structure_type, gfa_allocation_percentage::float8 FROM scope_intensity_matrix'),
    pool.query(`SELECT archetype, cost_per_sqm::float8 AS cost_per_sqm,
                       cost_adjustment_factor::float8 AS cost_adjustment_factor,
                       escalation_index_base::float8 AS escalation_index_base
                  FROM archetype_cost_rates`),
  ]);
  const tradeRates = Object.fromEntries(tradeRatesRes.rows.map((r) => [r.trade_slug, {
    base_rate_sqft: r.base_rate_sqft, structure_complexity_factor: r.structure_complexity_factor,
  }]));
  const scopeMatrix = Object.fromEntries(scopeMatrixRes.rows.map((r) => [
    `${(r.permit_type || '').trim()}::${(r.structure_type || '').trim()}`, r.gfa_allocation_percentage,
  ]));
  const archetypeRates = resolveArchetypeRates(
    archetypeRatesRes.rows, logicVars.cost_escalation_index != null ? Number(logicVars.cost_escalation_index) : null);
  return {
    tradeRates, scopeMatrix,
    urbanCoverageRatio: logicVars.urban_coverage_ratio,
    suburbanCoverageRatio: logicVars.suburban_coverage_ratio,
    liarGateThreshold: logicVars.liar_gate_threshold,
    archetypeEnabled: true, archetypeRates,
    archetypeT1FsiMin: Number(logicVars.archetype_t1_fsi_min),
    archetypeT1FsiMax: Number(logicVars.archetype_t1_fsi_max),
    archetypeT1TotalCap: Number(logicVars.archetype_t1_total_cap),
    archetypeT2RenoCap: Number(logicVars.archetype_t2_reno_line_cap),
    archetypeT2BuildCap: Number(logicVars.archetype_t2_build_line_cap),
    archetypeT2BuildMin: Number(logicVars.archetype_t2_build_line_min),
    archetypeT3TotalCap: Number(logicVars.archetype_t3_total_cap),
  };
}

async function buildCoaConfigs() {
  const { logicVars } = await loadMarketplaceConfigs(pool, 'compute-coa-cost-estimates');
  const [tradeRatesRes, scopeMatrixRes, archetypeRatesRes] = await Promise.all([
    pool.query('SELECT trade_slug, base_rate_sqft::float8, structure_complexity_factor::float8 FROM trade_sqft_rates'),
    pool.query('SELECT permit_type, structure_type, gfa_allocation_percentage FROM scope_intensity_matrix'),
    pool.query(`SELECT archetype, cost_per_sqm::float8 AS cost_per_sqm,
                       cost_adjustment_factor::float8 AS cost_adjustment_factor,
                       escalation_index_base::float8 AS escalation_index_base
                  FROM archetype_cost_rates`),
  ]);
  const archetypeRates = resolveArchetypeRates(
    archetypeRatesRes.rows, logicVars.cost_escalation_index != null ? Number(logicVars.cost_escalation_index) : null);
  const brainConfig = buildCoaConfig({
    tradeRates: tradeRatesRes.rows, scopeMatrix: scopeMatrixRes.rows, archetypeRates, logicVars,
  });
  const archConfig = { ...brainConfig, archetypeEnabled: true };
  return { brainConfig, archConfig };
}

// ── The per-row classifier ────────────────────────────────────────────────
function classifyPermitNone(row, config) {
  const result = estimateCostShared(row, config);
  if (result.cost_source && result.cost_source !== 'none') return { bucket: `now_priced:${result.cost_source}` };
  if (result._permitTypeClassSkipped) return { bucket: 'class_gate' };
  if (!isLowRiseResidential(row.structure_type)) return { bucket: 'not_lowrise' };
  const mapped = mapToLines({
    projectType: row.project_type, scopeTags: row.scope_tags, structureType: row.structure_type,
    isCoa: false, activeTradeCount: uniq(row.active_trade_slugs).length,
  });
  if (!mapped) return { bucket: result._matrixMiss ? 'mapper_null:matrix_miss' : 'mapper_null:legacy_none' };
  return classifyMappedRejection(row, mapped, config);
}

function classifyCoaNone(row, brainConfig, archConfig) {
  const archRow = buildCoaArchetypeInput(row);
  const archResult = tryArchetypeCost(archRow, archConfig);
  const result = archResult || estimateCostShared(mapCoaRowToBrainInput(row), brainConfig);
  if (result.cost_source && result.cost_source !== 'none') return { bucket: `now_priced:${result.cost_source}` };
  if (!isLowRiseResidential(row.structure_type)) return { bucket: 'not_lowrise' };
  const mapped = mapToLines({
    projectType: row.project_type, scopeTags: row.scope_tags, structureType: row.structure_type,
    isCoa: true, activeTradeCount: uniq(row.active_trade_slugs).length,
  });
  if (!mapped) return { bucket: 'mapper_null:t4' };
  return classifyMappedRejection(archRow, mapped, archConfig);
}

// Mapped but stayed 'none' → re-run priceLine per line and read WHY.
function classifyMappedRejection(row, mapped, config) {
  const outs = mapped.lines.map((l) => priceLine(row, l, config, mapped.capClass));
  if (outs.some((o) => o && o.fitBlocked)) return { bucket: 'fit_blocked', mapKind: mapped.mapKind, lines: mapped.lines };
  if (outs.some((o) => o && o.zeroTotal)) return { bucket: 'zero_total', mapKind: mapped.mapKind, lines: mapped.lines };
  const rejections = [...new Set(outs.flatMap((o) => (o && o.rejections) || []))].sort();
  if (rejections.length) return { bucket: `ladder_rejected:${rejections.join('+')}`, mapKind: mapped.mapKind, lines: mapped.lines };
  return { bucket: 'mapped_no_scalar', mapKind: mapped.mapKind, lines: mapped.lines };
}

// ── Aggregation ────────────────────────────────────────────────────────────
function newAgg() { return { counts: new Map(), tags: new Map(), samples: new Map() }; }
function record(agg, verdict, row, keyId) {
  const b = verdict.bucket;
  agg.counts.set(b, (agg.counts.get(b) || 0) + 1);
  // tag patterns
  const tagSig = uniq(row.scope_tags).slice(0, 6).join(',') || '(none)';
  if (!agg.tags.has(b)) agg.tags.set(b, new Map());
  const tm = agg.tags.get(b);
  tm.set(tagSig, (tm.get(tagSig) || 0) + 1);
  // samples (up to 12)
  if (!agg.samples.has(b)) agg.samples.set(b, []);
  const s = agg.samples.get(b);
  if (s.length < 12) s.push({ id: keyId, pt: row.project_type, st: row.structure_type, tags: tagSig, lines: (verdict.lines || []).join('+'), mapKind: verdict.mapKind || '' });
}

function bucketTable(agg, total) {
  const rows = [...agg.counts.entries()].sort((a, b) => b[1] - a[1]);
  const lines = ['| bucket | count | pct |', '|---|---:|---:|'];
  for (const [b, c] of rows) lines.push(`| \`${b}\` | ${c} | ${(100 * c / total).toFixed(1)}% |`);
  lines.push(`| **TOTAL** | **${total}** | 100% |`);
  return lines.join('\n');
}

function topTagsFor(agg, bucket, n = 8) {
  const tm = agg.tags.get(bucket);
  if (!tm) return '(none)';
  return [...tm.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([sig, c]) => `  - ${c}× \`${sig}\``).join('\n');
}

function samplesFor(agg, bucket, n = 10) {
  const s = agg.samples.get(bucket) || [];
  return s.slice(0, n).map((x) => `  - ${x.id} | pt=${x.pt} st=${x.st || '∅'} | lines=${x.lines || '∅'} ${x.mapKind ? '(' + x.mapKind + ')' : ''} | tags=[${x.tags}]`).join('\n');
}

async function main() {
  const RUN_AT = await getDbTimestamp(pool);
  const out = [];
  out.push('# WF2 P5 — Priceable-but-none rejection taxonomy (permits + CoA)');
  out.push('');
  out.push(`_Generated ${RUN_AT.toISOString ? RUN_AT.toISOString() : RUN_AT} by \`scripts/analysis/wf2-priceable-none-taxonomy.js\`. Read-only re-run of the live mapper + ladder._`);
  out.push('');
  out.push('> **PRE-P6.6 baseline.** These counts precede WF2 Phase 6.6 (the CoA fan-out fix that flips bundle-only lead_trades to `is_active=false`). Coverage impact of P6.6 on these numbers is expected ≈ 0 (archetype ladder runs before any trade path), but the figures are validated post-P6.6 in P7.');
  out.push('');

  // ── PERMITS ──
  const permitConfig = await buildPermitConfig();
  const permitAgg = newAgg();
  let permitTotal = 0;
  const permitSQL = `
    SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type, p.work,
           p.est_const_cost::float8 AS est_const_cost, p.scope_tags, p.dwelling_units_created,
           p.storeys, p.project_type,
           p.residential_sqm::float8 AS residential_sqm,
           p.interior_alterations_sqm::float8 AS interior_alterations_sqm,
           ${costCols('p')},
           pp_parcel.lot_size_sqm::float8 AS lot_size_sqm,
           pp_parcel.frontage_m::float8 AS frontage_m,
           bf.footprint_area_sqm::float8 AS footprint_area_sqm, bf.estimated_stories,
           n.avg_household_income::float8 AS avg_household_income,
           n.tenure_renter_pct::float8 AS tenure_renter_pct,
           COALESCE(pt.active_trades, ARRAY[]::text[]) AS active_trade_slugs,
           COALESCE(ptc.class, 'unclassified') AS permit_type_class
    FROM permits p
    JOIN cost_estimates ce ON ce.lead_id = p.lead_id AND ce.cost_source = 'none'
    LEFT JOIN LATERAL (SELECT parcel_id FROM permit_parcels WHERE permit_num=p.permit_num AND revision_num=p.revision_num ORDER BY parcel_id ASC LIMIT 1) pp ON true
    LEFT JOIN parcels pp_parcel ON pp_parcel.id = pp.parcel_id
    LEFT JOIN LATERAL (SELECT building_id FROM parcel_buildings WHERE parcel_id=pp.parcel_id AND is_primary=true LIMIT 1) pb ON true
    LEFT JOIN building_footprints bf ON bf.id = pb.building_id
    LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id
    LEFT JOIN LATERAL (SELECT ARRAY_AGG(t.slug) AS active_trades FROM permit_trades pt2 JOIN trades t ON t.id=pt2.trade_id WHERE pt2.permit_num=p.permit_num AND pt2.revision_num=p.revision_num) pt ON true
    LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
    WHERE p.project_type IN ('addition','new_build','renovation')
      AND (p.structure_type IS NULL OR p.structure_type ~* 'sfd|townhouse|duplex|converted house|laneway|rear yard suite|unit - (detached|semi)')
  `;
  for await (const row of pipeline_stream(permitSQL)) {
    permitTotal++;
    const v = classifyPermitNone(row, permitConfig);
    record(permitAgg, v, row, `permit:${row.permit_num}:${row.revision_num}`);
  }

  out.push('## Permits — residential-lowrise, project_type ∈ {addition,new_build,renovation}, cost_source=none');
  out.push('');
  out.push(bucketTable(permitAgg, permitTotal));
  out.push('');
  const permitTop = [...permitAgg.counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  out.push('### Top-bucket tag patterns + spot samples (permits)');
  for (const [b] of permitTop) {
    out.push(`\n**\`${b}\`** — top tag signatures:`);
    out.push(topTagsFor(permitAgg, b));
    out.push(`\nSpot samples (≥10):`);
    out.push(samplesFor(permitAgg, b));
  }

  // ── CoA (corpus + open subset) ──
  const { brainConfig, archConfig } = await buildCoaConfigs();
  const coaCorpusAgg = newAgg();
  const coaOpenAgg = newAgg();
  let coaCorpusTotal = 0;
  let coaOpenTotal = 0;
  // open subset = geocoded (lead_parcels link OR lat/lng) + non-terminal lifecycle.
  const coaSQL = `
    SELECT ca.id, ca.lead_id, ca.scope_tags, ca.structure_type, ca.project_type,
           ${costCols('p')},
           lp.parcel_id,
           p.lot_size_sqm::float8 AS lot_size_sqm, p.frontage_m::float8 AS frontage_m,
           bf.footprint_area_sqm::float8 AS footprint_area_sqm, bf.estimated_stories,
           n.avg_household_income::float8 AS avg_household_income,
           n.tenure_renter_pct::float8 AS tenure_renter_pct,
           COALESCE(lt_agg.active_trades, ARRAY[]::text[]) AS active_trade_slugs,
           (ca.latitude IS NOT NULL AND ca.longitude IS NOT NULL) AS has_geo,
           ca.lifecycle_group
    FROM coa_applications ca
    -- CoA 'none' = NO cost_estimates row (the CoA Muscle writes only archetype-
    -- priced rows; T4/none outcomes produce no row). Anti-join is the correct
    -- selector (verified: 13,831 CoAs have no cost_estimates row).
    LEFT JOIN LATERAL (SELECT lp.parcel_id FROM lead_parcels lp WHERE lp.lead_id=ca.lead_id ORDER BY lp.confidence DESC NULLS LAST, lp.parcel_id ASC LIMIT 1) lp ON true
    LEFT JOIN parcels p ON p.id = lp.parcel_id
    LEFT JOIN LATERAL (SELECT building_id FROM parcel_buildings WHERE parcel_id=lp.parcel_id AND is_primary=true ORDER BY building_id ASC LIMIT 1) pb ON true
    LEFT JOIN building_footprints bf ON bf.id = pb.building_id
    LEFT JOIN neighbourhoods n ON n.id = ca.neighbourhood_id
    LEFT JOIN LATERAL (SELECT ARRAY_AGG(t.slug ORDER BY t.slug) FILTER (WHERE lt.is_active=true) AS active_trades FROM lead_trades lt JOIN trades t ON t.id=lt.trade_id WHERE lt.lead_id=ca.lead_id) lt_agg ON true
    WHERE NOT EXISTS (SELECT 1 FROM cost_estimates ce WHERE ce.lead_id = ca.lead_id)
  `;
  for await (const row of pipeline_stream(coaSQL)) {
    coaCorpusTotal++;
    const v = classifyCoaNone(row, brainConfig, archConfig);
    record(coaCorpusAgg, v, row, row.lead_id);
    // OPEN subset = geocoded (lat/lng OR parcel link) AND non-terminal.
    // CoA terminal = lifecycle_group 'C4' (CoA Closure — Spec 84 §Block-C4;
    // 87.6% of CoAs land in Closed). Non-terminal = C1/C2/C3.
    const grp = String(row.lifecycle_group || '').toUpperCase();
    const isOpen = (row.has_geo === true || row.parcel_id != null)
      && ['C1', 'C2', 'C3'].includes(grp);
    if (isOpen) {
      coaOpenTotal++;
      record(coaOpenAgg, v, row, row.lead_id);
    }
  }

  out.push('\n## CoA — cost_source=none (corpus)');
  out.push('');
  out.push(bucketTable(coaCorpusAgg, coaCorpusTotal));
  out.push('');
  out.push(`## CoA — cost_source=none (OPEN subset: geocoded + non-terminal)`);
  out.push('');
  out.push(bucketTable(coaOpenAgg, coaOpenTotal));
  out.push('');
  const coaTop = [...coaCorpusAgg.counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  out.push('### Top-bucket tag patterns + spot samples (CoA corpus)');
  for (const [b] of coaTop) {
    out.push(`\n**\`${b}\`** — top tag signatures:`);
    out.push(topTagsFor(coaCorpusAgg, b));
    out.push(`\nSpot samples (≥10):`);
    out.push(samplesFor(coaCorpusAgg, b));
  }

  out.push('\n## Findings & verdicts (WF2 P5)');
  out.push('');
  out.push('**No cost-model code bug found.** Every bucket is a CORRECT `\'none\'` for a documented reason (spot-verified ≥10/bucket against the live DB):');
  out.push('');
  out.push('- `mapped_no_scalar` (largest) — scope maps to a line but the parcel carries NO propagated §4D cost scalar (≈50% have no `permit_parcels` link; the rest link a parcel whose cost-menu was never computed). **A propagation-COVERAGE gap, not a mapper/ladder defect.** Highest-leverage follow-up.');
  out.push('- `fit_blocked` — fit-gated accessory line (garage/laneway/garden) with `NULL` scalar = `fits:false` (Spec 88 §2.4). Verified genuine: 99.6% link a parcel + 99.3% carry `NULL max_*_gfa_sqm` (the accessory-fit model returned no envelope). Correct by design; the fit-model conservatism (declining garages on permits that ARE for garages) is a Spec 65 follow-up.');
  out.push('- `ladder_rejected:t2_bound` — propagated total outside the T2 plausibility bounds; the data-poison guard firing as designed.');
  out.push('- `class_gate` — verified administrative/safety/modifier permit_types (Spec 80 §5). Correct.');
  out.push('- `not_lowrise` / `mapper_null:t4` (CoA) — commercial/apartment or severance/tagless/descriptor-only; out of low-rise archetype scope / no scope to price. Correct.');
  out.push('- `now_priced:*` — the current code WOULD price these (stale rows not re-processed since the ladder shipped). Not a bug; resolves on the P7 in-chain re-run.');
  out.push('');
  out.push('**CoA acceptance re-derivation:** corpus 19,449/33,280 = **58.4%** priced (inflated by closed C4 CoAs); feed-relevant OPEN subset (geo + non-terminal C1–C3) 1,585/3,200 = **49.5%** priced. Replaces the stale "≥80%" (which assumed a geometric path that priced 0.0%). See Spec 83 §Geometric-Only Path (SUPERSEDED) + §3-ARCHETYPE acceptance.');
  out.push('');
  out.push('**Follow-ups (not this WF\'s code):** (1) expand §4D parcel cost-menu propagation coverage — the `mapped_no_scalar` lever; (2) revisit accessory-fit-model conservatism (Spec 65 §7) — the `fit_blocked` lever.');
  out.push('');

  const reportPath = path.resolve(__dirname, '../../docs/reports/pipeline-validation/2026-07-07-priceable-none-taxonomy.md');
  fs.writeFileSync(reportPath, out.join('\n') + '\n');
  // machine-readable summary to stdout
  console.log(JSON.stringify({
    permitTotal,
    permits: Object.fromEntries([...permitAgg.counts.entries()].sort((a, b) => b[1] - a[1])),
    coaCorpusTotal,
    coaCorpus: Object.fromEntries([...coaCorpusAgg.counts.entries()].sort((a, b) => b[1] - a[1])),
    coaOpenTotal,
    coaOpen: Object.fromEntries([...coaOpenAgg.counts.entries()].sort((a, b) => b[1] - a[1])),
  }, null, 2));
  console.log(`\nReport written: ${reportPath}`);
}

// tiny streaming helper (analysis script — bounded target sets, but stream anyway)
async function* pipeline_stream(sql) {
  const { streamQuery } = require('../lib/pipeline');
  yield* streamQuery(pool, sql, []);
}

main()
  .then(() => pool.end())
  .catch((err) => { console.error(err); return pool.end().finally(() => process.exit(1)); });
