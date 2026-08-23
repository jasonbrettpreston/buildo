#!/usr/bin/env node
/**
 * WF1 Bylaw-Heuristic Validation
 *
 * Tests the proposed bylaw-driven GFA heuristic for new builds:
 *   new_build_GFA = lot_size × coverage_ratio × floors
 *     (with floors derived from dwelling_units for high-density)
 *
 * And for laneway/garden suites:
 *   laneway_GFA = MIN(laneway_bylaw_max_sqm, lot_size × max_coverage)
 *
 * Validation method: derive implied $/m² from declared cost ÷ heuristic GFA.
 * If the heuristic is good, implied $/m² should cluster within $1,500-$5,000
 * (industry range for Toronto residential hard costs, 2024-2026).
 *
 * Read-only. Outputs to docs/reports/wf1-bylaw-heuristic-validation.md.
 */
'use strict';

const { createResolvedPool } = require('../lib/resolve-db');
const fs = require('fs');
const path = require('path');

const pool = createResolvedPool({ label: 'wf1-bylaw-heuristic-validation' });
const lines = [];

function out(s) { lines.push(s); }
function header(s) { out('\n## ' + s + '\n'); }
function fmtSqm(v) {
  if (v == null) return 'N/A';
  const n = Number(v);
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K m²';
  return n.toFixed(0) + ' m²';
}
function fmtCost(v) {
  if (v == null) return 'N/A';
  const n = Number(v);
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

// Proposed per-structure-type defaults
const STRUCTURE_DEFAULTS = {
  'SFD - Detached':              { coverage: 0.40, floors: 2.5 },
  'SFD - Semi-Detached':         { coverage: 0.45, floors: 2.5 },
  'SFD - Townhouse':             { coverage: 0.55, floors: 3.0 },
  '2 Unit - Detached':           { coverage: 0.40, floors: 3.0 },
  '2 Unit - Semi-detached':      { coverage: 0.45, floors: 3.0 },
  '3+ Unit - Detached':          { coverage: 0.40, floors: 3.0 },
  'Stacked Townhouses':          { coverage: 0.60, floors: 4.0 },
  'Multiple Unit Building':      { coverage: 0.65, floors: 6.0 },
  'Apartment Building':          { coverage: 0.70, floors: 12.0 },  // derived for high-density
  'Mixed Use/Res w Non Res':     { coverage: 0.75, floors: 10.0 },  // derived
  'Office':                      { coverage: 0.70, floors: 8.0 },
  'Retail Store':                { coverage: 0.60, floors: 1.5 },
  'Industrial':                  { coverage: 0.60, floors: 1.5 },
};

const UNIT_SQM_DEFAULT = 80;       // Toronto condo unit average
const EFFICIENCY       = 0.85;      // GFA → sellable-area ratio
const LANEWAY_BYLAW_MAX_SQM = 60;
const LANEWAY_MAX_COVERAGE  = 0.20; // ~20% of lot for laneway/garden suite

function computeHeuristicGfa(row) {
  const lotSize = Number(row.lot_size_sqm) || 0;
  const units = Number(row.dwelling_units_created) || 0;
  const structureType = row.structure_type;

  if (structureType === 'Laneway / Rear Yard Suite') {
    return Math.min(LANEWAY_BYLAW_MAX_SQM, lotSize * LANEWAY_MAX_COVERAGE);
  }

  const cfg = STRUCTURE_DEFAULTS[structureType];
  if (!cfg || lotSize <= 0) return null;

  let floors = cfg.floors;
  // For high-density (Apartment/Mixed Use), derive floors from unit density
  if ((structureType === 'Apartment Building' || structureType === 'Mixed Use/Res w Non Res') && units > 20) {
    const derivedFloors = Math.ceil(
      (units * UNIT_SQM_DEFAULT) / (lotSize * cfg.coverage * EFFICIENCY)
    );
    floors = Math.max(cfg.floors, derivedFloors);
  }

  return lotSize * cfg.coverage * floors;
}

async function validateNewBuilds() {
  header('Validation A — New-build heuristic vs declared cost');
  out('For each `New Building` / `New Houses` / `Residential Building Permit` permit with declared cost > $100K, compute:');
  out('- `heuristic_gfa = lot_size × coverage × floors` (per structure_type defaults)');
  out('- `implied_$/m² = declared_cost ÷ heuristic_gfa`');
  out('');
  out('**Industry expectation** for Toronto residential hard cost (2024-2026):');
  out('- SFD/Semi/Townhouse new build: $2,500-$4,000/m²');
  out('- Apartment Building new construction: $3,000-$5,000/m²');
  out('- If implied $/m² lands in this range, heuristic GFA is right-sized.');
  out('- If implied $/m² is suspiciously LOW (<$1,000/m²), heuristic GFA is too LARGE.');
  out('- If implied $/m² is suspiciously HIGH (>$8,000/m²), heuristic GFA is too SMALL.');
  out('');

  const rows = await pool.query(`
    SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
           p.dwelling_units_created::int AS units,
           p.est_const_cost::numeric AS declared_cost,
           ce.modeled_gfa_sqm::numeric AS current_modeled_gfa,
           ce.estimated_cost::numeric AS current_estimated_cost,
           par.lot_size_sqm::numeric AS lot_size_sqm,
           bf.footprint_area_sqm::numeric AS existing_footprint,
           bf.estimated_stories::int AS existing_stories
    FROM permits p
    JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num
    LEFT JOIN LATERAL (
      SELECT pp.parcel_id FROM permit_parcels pp
      WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
      ORDER BY pp.parcel_id ASC LIMIT 1
    ) parcel ON true
    LEFT JOIN parcels par ON par.id = parcel.parcel_id
    LEFT JOIN parcel_buildings pb ON pb.parcel_id = parcel.parcel_id AND pb.is_primary = true
    LEFT JOIN building_footprints bf ON bf.id = pb.building_id
    WHERE p.permit_type IN ('New Building', 'New Houses', 'Residential Building Permit')
      AND p.est_const_cost > 100000
      AND par.lot_size_sqm > 0
      AND ce.lead_id LIKE 'permit:%'
  `);

  // Per-combo analysis
  const byCombo = new Map();
  for (const r of rows.rows) {
    const heuristicGfa = computeHeuristicGfa(r);
    if (!heuristicGfa || heuristicGfa <= 0) continue;
    const impliedRate = Number(r.declared_cost) / heuristicGfa;
    const key = r.permit_type + '||' + r.structure_type;
    if (!byCombo.has(key)) byCombo.set(key, []);
    byCombo.get(key).push({
      permit_num: r.permit_num,
      revision_num: r.revision_num,
      units: r.units,
      declared: Number(r.declared_cost),
      lot_size: Number(r.lot_size_sqm),
      current_modeled_gfa: Number(r.current_modeled_gfa) || null,
      current_estimated_cost: Number(r.current_estimated_cost) || null,
      heuristic_gfa: heuristicGfa,
      implied_rate: impliedRate,
    });
  }

  out('### Per-combo distribution of implied $/m² (from declared cost ÷ heuristic GFA)');
  out('');
  out('| permit_type | structure_type | n | median heuristic GFA | median declared | median implied $/m² | in-band % ($1K-$8K) |');
  out('|---|---|---|---|---|---|---|');
  const sortedCombos = Array.from(byCombo.entries())
    .filter(([_, arr]) => arr.length >= 20)
    .sort((a, b) => b[1].length - a[1].length);

  for (const [key, arr] of sortedCombos) {
    const [permit_type, structure_type] = key.split('||');
    arr.sort((a, b) => a.implied_rate - b.implied_rate);
    const median = (xs, k) => xs[Math.floor(xs.length * k)];
    const medianGfa = median(arr.slice().sort((a, b) => a.heuristic_gfa - b.heuristic_gfa), 0.5).heuristic_gfa;
    const medianDeclared = median(arr.slice().sort((a, b) => a.declared - b.declared), 0.5).declared;
    const medianRate = median(arr, 0.5).implied_rate;
    const inBand = arr.filter(x => x.implied_rate >= 1000 && x.implied_rate <= 8000).length;
    const inBandPct = (100 * inBand / arr.length).toFixed(0);
    out('| ' + [
      permit_type.slice(0, 28),
      structure_type.slice(0, 22),
      arr.length,
      fmtSqm(medianGfa),
      fmtCost(medianDeclared),
      '$' + medianRate.toFixed(0) + '/m²',
      inBandPct + '%',
    ].join(' | ') + ' |');
  }

  out('\n### Comparison: heuristic GFA vs current modeled GFA (same permits)');
  out('| combo | n | heuristic median | current modeled median | ratio |');
  out('|---|---|---|---|---|');
  for (const [key, arr] of sortedCombos) {
    const [permit_type, structure_type] = key.split('||');
    const arrWithCurrent = arr.filter(x => x.current_modeled_gfa && x.current_modeled_gfa > 0);
    if (arrWithCurrent.length < 10) continue;
    arrWithCurrent.sort((a, b) => a.heuristic_gfa - b.heuristic_gfa);
    const medianHeuristic = arrWithCurrent[Math.floor(arrWithCurrent.length / 2)].heuristic_gfa;
    arrWithCurrent.sort((a, b) => a.current_modeled_gfa - b.current_modeled_gfa);
    const medianCurrent   = arrWithCurrent[Math.floor(arrWithCurrent.length / 2)].current_modeled_gfa;
    const ratio = medianHeuristic / medianCurrent;
    out('| ' + [
      permit_type.slice(0, 12) + '/' + structure_type.slice(0, 18),
      arrWithCurrent.length,
      fmtSqm(medianHeuristic),
      fmtSqm(medianCurrent),
      ratio.toFixed(2) + 'x',
    ].join(' | ') + ' |');
  }

  out('\n### Sample: high-cost megaproject permits with heuristic GFA');
  out('Previously these had model_GFA of 100-500 m². Heuristic should produce 10K-50K m².\n');
  const mega = rows.rows
    .filter(r => Number(r.declared_cost) > 50000000 && (r.structure_type === 'Apartment Building' || r.structure_type === 'Mixed Use/Res w Non Res'))
    .map(r => ({ ...r, heuristic_gfa: computeHeuristicGfa(r), implied_rate: Number(r.declared_cost) / (computeHeuristicGfa(r) || 1) }))
    .filter(r => r.heuristic_gfa)
    .sort((a, b) => Number(b.declared_cost) - Number(a.declared_cost))
    .slice(0, 12);
  out('| permit | combo | units | lot | current GFA | heuristic GFA | declared $ | implied $/m² |');
  out('|---|---|---|---|---|---|---|---|');
  for (const r of mega) {
    out('| ' + [
      r.permit_num + ':' + r.revision_num,
      (r.structure_type || '').slice(0, 22),
      r.units,
      fmtSqm(r.lot_size_sqm),
      fmtSqm(r.current_modeled_gfa),
      fmtSqm(r.heuristic_gfa),
      fmtCost(r.declared_cost),
      '$' + r.implied_rate.toFixed(0),
    ].join(' | ') + ' |');
  }
}

async function validateLaneways() {
  header('Validation B — Laneway / garden suite heuristic');
  out('Heuristic: `laneway_GFA = MIN(60 m² bylaw max, lot × 0.20 physical cap)`.');
  out('Industry expectation: laneway suites are typically $200K-$500K total cost = $3,000-$8,000/m² for ~60 m² (a small premium for separate utility hookups vs main-house addition).\n');

  const rows = await pool.query(`
    SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
           p.est_const_cost::numeric AS declared_cost,
           ce.modeled_gfa_sqm::numeric AS current_modeled_gfa,
           ce.estimated_cost::numeric AS current_estimated_cost,
           par.lot_size_sqm::numeric AS lot_size_sqm
    FROM permits p
    JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num
    LEFT JOIN LATERAL (
      SELECT pp.parcel_id FROM permit_parcels pp
      WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
      ORDER BY pp.parcel_id ASC LIMIT 1
    ) parcel ON true
    LEFT JOIN parcels par ON par.id = parcel.parcel_id
    WHERE p.structure_type = 'Laneway / Rear Yard Suite'
      AND p.est_const_cost > 50000
      AND par.lot_size_sqm > 0
      AND ce.lead_id LIKE 'permit:%'
  `);

  const enriched = rows.rows.map(r => {
    const heuristicGfa = Math.min(LANEWAY_BYLAW_MAX_SQM, Number(r.lot_size_sqm) * LANEWAY_MAX_COVERAGE);
    const impliedRate = Number(r.declared_cost) / heuristicGfa;
    return { ...r, heuristic_gfa: heuristicGfa, implied_rate: impliedRate };
  });

  enriched.sort((a, b) => a.implied_rate - b.implied_rate);
  const median = (xs, k) => xs[Math.floor(xs.length * k)];

  out('**n permits analyzed:** ' + enriched.length);
  out('');
  out('| stat | value |');
  out('|---|---|');
  out('| heuristic GFA p25 | ' + fmtSqm(median(enriched.slice().sort((a, b) => a.heuristic_gfa - b.heuristic_gfa), 0.25).heuristic_gfa) + ' |');
  out('| heuristic GFA p50 | ' + fmtSqm(median(enriched.slice().sort((a, b) => a.heuristic_gfa - b.heuristic_gfa), 0.50).heuristic_gfa) + ' |');
  out('| heuristic GFA p75 | ' + fmtSqm(median(enriched.slice().sort((a, b) => a.heuristic_gfa - b.heuristic_gfa), 0.75).heuristic_gfa) + ' |');
  out('| declared cost p50 | ' + fmtCost(median(enriched.slice().sort((a, b) => a.declared_cost - b.declared_cost), 0.5).declared_cost) + ' |');
  out('| implied $/m² p25  | $' + median(enriched, 0.25).implied_rate.toFixed(0) + ' |');
  out('| implied $/m² p50  | $' + median(enriched, 0.50).implied_rate.toFixed(0) + ' |');
  out('| implied $/m² p75  | $' + median(enriched, 0.75).implied_rate.toFixed(0) + ' |');

  const inBand = enriched.filter(x => x.implied_rate >= 2000 && x.implied_rate <= 10000).length;
  out('| in-band $2K-$10K/m² | ' + inBand + ' of ' + enriched.length + ' (' + (100 * inBand / enriched.length).toFixed(0) + '%) |');

  out('\n### Comparison: current vs heuristic for laneways');
  out('Current cost model multiplies the PRIMARY HOUSE GFA by 1.00 allocation → estimates the WHOLE primary house cost as the laneway cost.\n');
  const currentRates = enriched.filter(x => x.current_modeled_gfa && x.current_modeled_gfa > 0)
    .map(x => Number(x.current_estimated_cost) / Number(x.current_modeled_gfa)).filter(x => x && Number.isFinite(x)).sort((a, b) => a - b);
  if (currentRates.length > 0) {
    out('| stat | current model | heuristic |');
    out('|---|---|---|');
    out('| median GFA used | ' + fmtSqm(median(enriched.slice().sort((a, b) => a.current_modeled_gfa - b.current_modeled_gfa), 0.5).current_modeled_gfa) + ' | ' + fmtSqm(median(enriched.slice().sort((a, b) => a.heuristic_gfa - b.heuristic_gfa), 0.5).heuristic_gfa) + ' |');
    out('| median est cost | ' + fmtCost(median(enriched.slice().sort((a, b) => (a.current_estimated_cost || 0) - (b.current_estimated_cost || 0)), 0.5).current_estimated_cost) + ' | (would be heuristic_gfa × rate) |');
  }
}

async function main() {
  out('# WF1 Bylaw-Heuristic Validation Report');
  out('');
  out('**Date:** ' + new Date().toISOString().slice(0, 10));
  out('**Hypothesis:** developers/owners maximize the bylaw envelope. For new builds:');
  out('  `new_build_GFA = lot_size × coverage × floors` (with floors derived from units for high-density)');
  out('  For laneway: `MIN(60 m², lot × 0.20)`');
  out('**Defaults assumed** (per `STRUCTURE_DEFAULTS` in this script): see source.');
  try {
    await validateNewBuilds();
    await validateLaneways();
  } finally {
    await pool.end();
  }
  const outPath = path.resolve(__dirname, '../../docs/reports/wf1-bylaw-heuristic-validation.md');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log('Report written to: ' + outPath);
}

main().catch(err => {
  console.error('FATAL: ' + err.message);
  console.error(err.stack);
  pool.end().finally(() => process.exit(1));
});
