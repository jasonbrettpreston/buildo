#!/usr/bin/env node
/**
 * WF1 GFA Accuracy Investigation
 *
 * Investigates whether modeled_gfa_sqm is the upstream cause of cost over/under-prediction.
 *
 * Lens A: GFA distribution by (permit_type, structure_type) — sanity check vs industry norms
 * Lens B: GFA path mix — what % of permits use primary (massing) vs fallback (lot×coverage)?
 * Lens C: GFA vs declared cost correlation — large declared cost should imply large GFA
 * Lens D: Per-combo GFA p50 vs known typical building size (residential expectations)
 * Lens E: Outlier permits — GFA outside reasonable bounds for the combo
 *
 * Read-only. Outputs to docs/reports/wf1-gfa-accuracy-investigation.md.
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3 Step A (GFA computation)
 */
'use strict';

const { createPool } = require('../lib/pipeline');
const fs = require('fs');
const path = require('path');

const pool = createPool();
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

async function lensA_distribution() {
  header('Lens A — GFA distribution by (permit_type, structure_type)');
  out('Filters: modeled_gfa_sqm IS NOT NULL, permits only, n >= 30 per combo.\n');
  out('**Industry expectations for sanity check:**');
  out('- SFD detached: 100-400 m² (typical ~200 m²)');
  out('- SFD townhouse: 100-250 m² (typical ~150 m²)');
  out('- Apartment Building: 2,000-50,000 m² (mid-rise 5,000-15,000; high-rise 15,000-50,000+)');
  out('- Office: 500-50,000 m² (small commercial 500-2,000; mid-rise 2,000-15,000)');
  out('- Industrial: 1,000-30,000 m²');
  out('- Retail Store: 200-5,000 m²');
  out('');
  const r = await pool.query(`
    SELECT p.permit_type, p.structure_type, ce.cost_source,
           COUNT(*) AS n,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS p25,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS p50,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS p75,
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS p95,
           MAX(ce.modeled_gfa_sqm)::numeric AS max_val
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    WHERE ce.modeled_gfa_sqm IS NOT NULL
      AND ce.lead_id LIKE 'permit:%'
    GROUP BY p.permit_type, p.structure_type, ce.cost_source
    HAVING COUNT(*) >= 30
    ORDER BY n DESC
    LIMIT 40
  `);
  out('| permit_type | structure_type | src | n | p25 | p50 | p75 | p95 | max |');
  out('|---|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.cost_source,
      row.n,
      fmtSqm(row.p25),
      fmtSqm(row.p50),
      fmtSqm(row.p75),
      fmtSqm(row.p95),
      fmtSqm(row.max_val),
    ].join(' | ') + ' |');
  });
}

async function lensB_pathMix() {
  header('Lens B — GFA computation path mix (primary massing vs fallback lot×coverage)');
  out('Primary path: `GFA = footprint_area_sqm × stories` (requires `parcel_buildings.is_primary=true` + `building_footprints`).');
  out('Fallback path: `GFA = lot_size_sqm × coverage_ratio × floors` (when massing missing — clearly wrong for additions, treats the whole lot as built).');
  out('');
  out('We infer the path by joining cost_estimates → permits → permit_parcels → parcels → parcel_buildings → building_footprints. If a primary building footprint exists, the Brain used the primary path.\n');
  const r = await pool.query(`
    WITH pathed AS (
      SELECT p.permit_type, p.structure_type,
             ce.modeled_gfa_sqm,
             CASE
               WHEN bf.footprint_area_sqm IS NOT NULL
                AND bf.estimated_stories IS NOT NULL
                AND bf.footprint_area_sqm > 0 THEN 'primary'
               ELSE 'fallback_or_none'
             END AS gfa_path
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
      LEFT JOIN LATERAL (
        SELECT pp.parcel_id FROM permit_parcels pp
        WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
        ORDER BY pp.parcel_id ASC LIMIT 1
      ) parcel ON true
      LEFT JOIN parcel_buildings pb ON pb.parcel_id = parcel.parcel_id AND pb.is_primary = true
      LEFT JOIN building_footprints bf ON bf.id = pb.building_id
      WHERE ce.modeled_gfa_sqm IS NOT NULL
        AND ce.lead_id LIKE 'permit:%'
    )
    SELECT permit_type, structure_type,
           COUNT(*) AS n,
           COUNT(*) FILTER (WHERE gfa_path = 'primary') AS primary_n,
           COUNT(*) FILTER (WHERE gfa_path = 'fallback_or_none') AS fallback_n,
           ROUND(100.0 * COUNT(*) FILTER (WHERE gfa_path = 'primary') / COUNT(*), 1) AS primary_pct,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY modeled_gfa_sqm)
             FILTER (WHERE gfa_path = 'primary')::numeric AS primary_median_gfa,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY modeled_gfa_sqm)
             FILTER (WHERE gfa_path = 'fallback_or_none')::numeric AS fallback_median_gfa
    FROM pathed
    GROUP BY permit_type, structure_type
    HAVING COUNT(*) >= 100
    ORDER BY n DESC
    LIMIT 25
  `);
  out('| permit_type | structure_type | n | primary% | primary median GFA | fallback median GFA |');
  out('|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.n,
      row.primary_pct + '%',
      fmtSqm(row.primary_median_gfa),
      fmtSqm(row.fallback_median_gfa),
    ].join(' | ') + ' |');
  });
  out('\n**Interpretation:** if `fallback_median_gfa` is dramatically higher than `primary_median_gfa` for the same combo, the fallback is over-estimating (treating the whole lot as buildable). This is the suspected over-prediction root cause for additions/alterations.');
}

async function lensC_gfaVsDeclared() {
  header('Lens C — GFA vs declared cost correlation');
  out('For permits with both `est_const_cost > $1K` (real applicant declaration) AND `modeled_gfa_sqm > 0`, compute implied $/m² from declared. If our trade rates (~$100-$500/m²) are right, declared $/sqm should land in that range. Wildly different ratios signal GFA error.\n');
  const r = await pool.query(`
    SELECT p.permit_type, p.structure_type,
           COUNT(*) AS n,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS median_gfa_sqm,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY p.est_const_cost)::numeric AS median_declared,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY p.est_const_cost / NULLIF(ce.modeled_gfa_sqm, 0))::numeric AS median_declared_per_sqm
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    WHERE ce.modeled_gfa_sqm > 0
      AND p.est_const_cost > 1000
      AND ce.lead_id LIKE 'permit:%'
    GROUP BY p.permit_type, p.structure_type
    HAVING COUNT(*) >= 50
    ORDER BY n DESC
    LIMIT 25
  `);
  out('| permit_type | structure_type | n | median GFA | median declared | implied $/m² |');
  out('|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    const dollarPerSqm = Number(row.median_declared_per_sqm);
    let flag = '';
    if (dollarPerSqm < 50) flag = ' ← suspiciously low';
    else if (dollarPerSqm > 10000) flag = ' ← suspiciously high';
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.n,
      fmtSqm(row.median_gfa_sqm),
      fmtCost(row.median_declared),
      '$' + Number(dollarPerSqm).toFixed(0) + '/m²' + flag,
    ].join(' | ') + ' |');
  });
}

async function lensD_megaprojectGFA() {
  header('Lens D — Megaproject GFA diagnosis (the under-prediction class)');
  out('From the cost-accuracy report: `New Building / Apartment Building` and `New Building / Mixed Use/Res w Non Res` were model-under-predicted (model $2-3M vs declared $30-65M). Hypothesis: their `modeled_gfa_sqm` is much smaller than the true building envelope.\n');
  const r = await pool.query(`
    SELECT p.permit_type, p.structure_type,
           COUNT(*) AS n,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS p25_gfa,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS p50_gfa,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS p75_gfa,
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS p95_gfa,
           MAX(ce.modeled_gfa_sqm)::numeric AS max_gfa,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY p.storeys)::numeric AS median_declared_storeys,
           MAX(p.storeys) AS max_declared_storeys
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    WHERE ce.modeled_gfa_sqm > 0
      AND ce.lead_id LIKE 'permit:%'
      AND p.permit_type IN ('New Building', 'New Houses', 'Residential Building Permit')
    GROUP BY p.permit_type, p.structure_type
    HAVING COUNT(*) >= 20
    ORDER BY n DESC
    LIMIT 15
  `);
  out('| permit_type | structure_type | n | GFA p25 | GFA p50 | GFA p75 | GFA p95 | GFA max | declared storeys p50 / max |');
  out('|---|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.n,
      fmtSqm(row.p25_gfa),
      fmtSqm(row.p50_gfa),
      fmtSqm(row.p75_gfa),
      fmtSqm(row.p95_gfa),
      fmtSqm(row.max_gfa),
      row.median_declared_storeys + ' / ' + row.max_declared_storeys,
    ].join(' | ') + ' |');
  });

  out('\n**Specific high-cost permits — what GFA did they get?**');
  const r2 = await pool.query(`
    SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
           p.storeys, p.dwelling_units_created,
           ce.modeled_gfa_sqm, ce.estimated_cost, p.est_const_cost,
           bf.footprint_area_sqm, bf.estimated_stories AS massing_stories,
           parcel.lot_size_sqm
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    LEFT JOIN LATERAL (
      SELECT pp.parcel_id, par.lot_size_sqm
      FROM permit_parcels pp JOIN parcels par ON par.id = pp.parcel_id
      WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
      ORDER BY pp.parcel_id ASC LIMIT 1
    ) parcel ON true
    LEFT JOIN parcel_buildings pb ON pb.parcel_id = parcel.parcel_id AND pb.is_primary = true
    LEFT JOIN building_footprints bf ON bf.id = pb.building_id
    WHERE ce.lead_id LIKE 'permit:%'
      AND p.permit_type = 'New Building'
      AND p.structure_type IN ('Apartment Building', 'Mixed Use/Res w Non Res')
      AND p.est_const_cost >= 20000000
    ORDER BY p.est_const_cost DESC
    LIMIT 10
  `);
  out('| permit | type/struct | declared storeys | dwelling units | modeled_gfa | declared cost | model cost | footprint_sqm | massing_stories | lot_size_sqm |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  r2.rows.forEach(row => {
    out('| ' + [
      row.permit_num + ':' + row.revision_num,
      (row.permit_type || '').slice(0, 12) + '/' + (row.structure_type || '').slice(0, 18),
      row.storeys,
      row.dwelling_units_created,
      fmtSqm(row.modeled_gfa_sqm),
      fmtCost(row.est_const_cost),
      fmtCost(row.estimated_cost),
      fmtSqm(row.footprint_area_sqm),
      row.massing_stories ?? 'N/A',
      fmtSqm(row.lot_size_sqm),
    ].join(' | ') + ' |');
  });
}

async function lensE_outliers() {
  header('Lens E — GFA outliers');
  out('Permits with modeled_gfa_sqm > 10× combo median (likely over-estimate) or < 0.1× combo median (under-estimate). Combos with n < 30 excluded.\n');
  const r = await pool.query(`
    WITH stats AS (
      SELECT p.permit_type, p.structure_type,
             PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS median_gfa,
             COUNT(*) AS n
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
      WHERE ce.modeled_gfa_sqm > 0 AND ce.lead_id LIKE 'permit:%'
      GROUP BY p.permit_type, p.structure_type
      HAVING COUNT(*) >= 30
    )
    SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
           ce.modeled_gfa_sqm, ce.estimated_cost, p.est_const_cost,
           s.median_gfa,
           ce.modeled_gfa_sqm / NULLIF(s.median_gfa, 0) AS deviation
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    JOIN stats s ON s.permit_type = p.permit_type AND s.structure_type = p.structure_type
    WHERE ce.modeled_gfa_sqm > 0 AND ce.lead_id LIKE 'permit:%'
      AND (ce.modeled_gfa_sqm > s.median_gfa * 10 OR ce.modeled_gfa_sqm < s.median_gfa * 0.1)
    ORDER BY ABS(LN(GREATEST(ce.modeled_gfa_sqm / NULLIF(s.median_gfa, 1), 0.0001))) DESC
    LIMIT 25
  `);
  out('| permit | type/struct | modeled_gfa | declared cost | est cost | combo median GFA | deviation |');
  out('|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      row.permit_num + ':' + row.revision_num,
      (row.permit_type || '').slice(0, 14) + '/' + (row.structure_type || '').slice(0, 14),
      fmtSqm(row.modeled_gfa_sqm),
      fmtCost(row.est_const_cost),
      fmtCost(row.estimated_cost),
      fmtSqm(row.median_gfa),
      Number(row.deviation).toFixed(2) + 'x',
    ].join(' | ') + ' |');
  });
}

async function lensF_massingPresence() {
  header('Lens F — Massing data presence and completeness');
  out('Massing data comes from `link-massing.js` (spatial join: permit → parcel → primary building → footprint). For each link to feed the primary GFA path, we need: a permit→parcel link, a parcel→building link (with `is_primary=true`), a footprint_area_sqm value, AND an estimated_stories value.\n');
  const r = await pool.query(`
    WITH p_stats AS (
      SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
             (SELECT COUNT(*) FROM permit_parcels pp WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num) AS parcel_links,
             (SELECT pp.parcel_id FROM permit_parcels pp WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num ORDER BY pp.parcel_id ASC LIMIT 1) AS first_parcel_id
      FROM permits p
      WHERE p.last_seen_at > NOW() - INTERVAL '120 days'
    )
    SELECT permit_type, structure_type,
           COUNT(*) AS n,
           COUNT(*) FILTER (WHERE parcel_links > 0) AS has_parcel,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p_stats.first_parcel_id
           )) AS has_any_building,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p_stats.first_parcel_id AND pb.is_primary = true
           )) AS has_primary_building,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM parcel_buildings pb
             JOIN building_footprints bf ON bf.id = pb.building_id
             WHERE pb.parcel_id = p_stats.first_parcel_id AND pb.is_primary = true
               AND bf.footprint_area_sqm > 0 AND bf.estimated_stories IS NOT NULL
           )) AS full_primary_path
    FROM p_stats
    GROUP BY permit_type, structure_type
    HAVING COUNT(*) >= 100
    ORDER BY n DESC
    LIMIT 25
  `);
  out('| permit_type | structure_type | n | parcel% | any-building% | primary-building% | full-path% |');
  out('|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    const parcelPct       = (100 * row.has_parcel / row.n).toFixed(1);
    const anyBldgPct      = (100 * row.has_any_building / row.n).toFixed(1);
    const primaryBldgPct  = (100 * row.has_primary_building / row.n).toFixed(1);
    const fullPathPct     = (100 * row.full_primary_path / row.n).toFixed(1);
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.n,
      parcelPct + '%',
      anyBldgPct + '%',
      primaryBldgPct + '%',
      fullPathPct + '%',
    ].join(' | ') + ' |');
  });
  out('\n**Interpretation:** the gap between `primary-building%` and `full-path%` shows how often a primary building exists but lacks footprint OR stories. The gap between `parcel%` and `primary-building%` shows the link-massing spatial-join failure rate.');
}

async function lensG_sanityVsDeclared() {
  header('Lens G — Massing sanity check vs declared dwelling units (residential only)');
  out('For residential permits with `dwelling_units_created > 0`: a typical residential unit is 50-150 m². So **expected GFA ≈ dwelling_units × 90 m² midpoint**. We flag cases where modeled GFA differs from this expectation by > 5x in either direction.\n');
  const r = await pool.query(`
    WITH residential AS (
      SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
             p.dwelling_units_created::int AS units,
             ce.modeled_gfa_sqm,
             ce.modeled_gfa_sqm / NULLIF(p.dwelling_units_created::numeric, 0) AS sqm_per_unit
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
      WHERE ce.modeled_gfa_sqm > 0
        AND ce.lead_id LIKE 'permit:%'
        AND p.dwelling_units_created > 0
        AND p.structure_type IN (
          'SFD - Detached', 'SFD - Semi-Detached', 'SFD - Townhouse',
          'Apartment Building', 'Multiple Unit Building', 'Stacked Townhouses',
          '2 Unit - Detached', '2 Unit - Semi-detached', '3+ Unit - Detached',
          'Mixed Use/Res w Non Res', 'Laneway / Rear Yard Suite'
        )
    )
    SELECT permit_type, structure_type,
           COUNT(*) AS n,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY units)::numeric AS median_units,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY modeled_gfa_sqm)::numeric AS median_gfa,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY sqm_per_unit)::numeric AS median_sqm_per_unit,
           COUNT(*) FILTER (WHERE sqm_per_unit < 18) AS suspicious_low,
           COUNT(*) FILTER (WHERE sqm_per_unit > 450) AS suspicious_high
    FROM residential
    GROUP BY permit_type, structure_type
    HAVING COUNT(*) >= 30
    ORDER BY n DESC
    LIMIT 25
  `);
  out('| permit_type | structure_type | n | median units | median GFA | median m²/unit | < 18 m²/unit | > 450 m²/unit |');
  out('|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    const lowPct  = (100 * row.suspicious_low / row.n).toFixed(0);
    const highPct = (100 * row.suspicious_high / row.n).toFixed(0);
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.n,
      row.median_units,
      fmtSqm(row.median_gfa),
      Number(row.median_sqm_per_unit).toFixed(0) + ' m²/unit',
      row.suspicious_low + ' (' + lowPct + '%)',
      row.suspicious_high + ' (' + highPct + '%)',
    ].join(' | ') + ' |');
  });
  out('\n**Interpretation:** typical residential is **50-150 m²/unit**. A "suspicious_low" rate of >20% means the massing footprint is much too small for the declared unit count — likely the linked building is a different (smaller) one on the lot. A "suspicious_high" rate >20% means modeled_gfa is too large for the unit count — likely fallback path treating the whole lot as buildable, or the primary building is much bigger than the new work.');
}

async function lensH_buildingLinkConfidence() {
  header('Lens H — Building-link confidence (link-massing quality)');
  out('`parcel_buildings.confidence` is set by link-massing.js based on spatial-match quality. Low confidence = weak spatial evidence that the building belongs to the parcel. We look at confidence distribution for the primary-flagged building on each permit\'s parcel.\n');
  const r = await pool.query(`
    SELECT
      CASE
        WHEN pb.confidence IS NULL THEN 'null_confidence'
        WHEN pb.confidence >= 0.95 THEN '0.95+_high'
        WHEN pb.confidence >= 0.80 THEN '0.80-0.94_medium'
        WHEN pb.confidence >= 0.60 THEN '0.60-0.79_low'
        ELSE '<0.60_very_low'
      END AS confidence_band,
      COUNT(*) AS n_links,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY bf.footprint_area_sqm)::numeric AS median_footprint
    FROM parcel_buildings pb
    LEFT JOIN building_footprints bf ON bf.id = pb.building_id
    WHERE pb.is_primary = true
    GROUP BY confidence_band
    ORDER BY confidence_band
  `);
  out('| confidence | n primary links | median footprint |');
  out('|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      row.confidence_band,
      row.n_links,
      fmtSqm(row.median_footprint),
    ].join(' | ') + ' |');
  });

  out('\n**Cost impact: how is modeled_gfa distributed by confidence?**');
  const r2 = await pool.query(`
    SELECT
      CASE
        WHEN pb.confidence IS NULL THEN 'null_confidence'
        WHEN pb.confidence >= 0.95 THEN '0.95+_high'
        WHEN pb.confidence >= 0.80 THEN '0.80-0.94_medium'
        WHEN pb.confidence >= 0.60 THEN '0.60-0.79_low'
        ELSE '<0.60_very_low'
      END AS confidence_band,
      COUNT(*) AS n,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS median_gfa,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS median_estimated
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    JOIN LATERAL (
      SELECT pp.parcel_id FROM permit_parcels pp
      WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
      ORDER BY pp.parcel_id ASC LIMIT 1
    ) parcel ON true
    LEFT JOIN parcel_buildings pb ON pb.parcel_id = parcel.parcel_id AND pb.is_primary = true
    WHERE ce.modeled_gfa_sqm > 0 AND ce.lead_id LIKE 'permit:%'
    GROUP BY confidence_band
    ORDER BY confidence_band
  `);
  out('| confidence | n permits | median GFA | median estimated_cost |');
  out('|---|---|---|---|');
  r2.rows.forEach(row => {
    out('| ' + [
      row.confidence_band,
      row.n,
      fmtSqm(row.median_gfa),
      fmtCost(row.median_estimated),
    ].join(' | ') + ' |');
  });
}

async function lensI_multiBuildingParcels() {
  header('Lens I — Multi-building parcel handling');
  out('When a parcel has > 1 building, link-massing.js picks one as `is_primary=true`. For permits on multi-building parcels (apartment complexes, mixed-use sites, etc.), the picked "primary" may not match the building under construction. Quantify how often this happens and whether it impacts modeled GFA.\n');
  const r = await pool.query(`
    WITH parcel_bldg_count AS (
      SELECT parcel_id, COUNT(*) AS bldg_count
      FROM parcel_buildings
      GROUP BY parcel_id
    )
    SELECT
      CASE
        WHEN pbc.bldg_count = 1 THEN '1_building'
        WHEN pbc.bldg_count BETWEEN 2 AND 3 THEN '2-3_buildings'
        WHEN pbc.bldg_count BETWEEN 4 AND 10 THEN '4-10_buildings'
        WHEN pbc.bldg_count > 10 THEN '>10_buildings'
        ELSE 'no_buildings'
      END AS bucket,
      COUNT(DISTINCT p.permit_num || ':' || p.revision_num) AS n_permits,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.modeled_gfa_sqm)::numeric AS median_gfa
    FROM permits p
    JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num
    LEFT JOIN LATERAL (
      SELECT pp.parcel_id FROM permit_parcels pp
      WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
      ORDER BY pp.parcel_id ASC LIMIT 1
    ) parcel ON true
    LEFT JOIN parcel_bldg_count pbc ON pbc.parcel_id = parcel.parcel_id
    WHERE ce.modeled_gfa_sqm > 0 AND ce.lead_id LIKE 'permit:%'
    GROUP BY bucket
    ORDER BY bucket
  `);
  out('| parcel building count | n permits | median modeled GFA |');
  out('|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      row.bucket,
      row.n_permits,
      fmtSqm(row.median_gfa),
    ].join(' | ') + ' |');
  });
  out('\n**Interpretation:** if median GFA is similar across multi-building buckets, link-massing is consistently picking a reasonable representative building. If multi-building parcels show systematically smaller or larger GFA, the spatial-join may be picking the wrong building (e.g., a tower vs an adjacent townhouse row).');
}

async function lensJ_newBuildingMassingDiagnosis() {
  header('Lens J — Why New Building permits get tiny GFAs (the smoking gun)');
  out('Lens D showed the under-prediction class: New Building permits with 100s of dwelling units modeled at <500 m² GFA. The hypothesis: the linked "primary" building on the parcel is a small existing structure (shed/garage/teardown), NOT the new megaproject (which by definition doesn\'t exist yet in the city massing data).\n');
  const r = await pool.query(`
    SELECT
      CASE
        WHEN bf.footprint_area_sqm IS NULL THEN '0_no_footprint'
        WHEN bf.footprint_area_sqm < 100 THEN '1_<100sqm_tiny'
        WHEN bf.footprint_area_sqm < 500 THEN '2_100-500sqm_small'
        WHEN bf.footprint_area_sqm < 2000 THEN '3_500-2000sqm_mid'
        WHEN bf.footprint_area_sqm < 10000 THEN '4_2K-10K_large'
        ELSE '5_>10K_megaproject'
      END AS footprint_bucket,
      COUNT(*) AS n,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY p.dwelling_units_created::numeric)::numeric AS median_units,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY p.est_const_cost)::numeric AS median_declared,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS median_modeled
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    LEFT JOIN LATERAL (
      SELECT pp.parcel_id FROM permit_parcels pp
      WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
      ORDER BY pp.parcel_id ASC LIMIT 1
    ) parcel ON true
    LEFT JOIN parcel_buildings pb ON pb.parcel_id = parcel.parcel_id AND pb.is_primary = true
    LEFT JOIN building_footprints bf ON bf.id = pb.building_id
    WHERE ce.lead_id LIKE 'permit:%'
      AND p.permit_type = 'New Building'
      AND p.structure_type IN ('Apartment Building', 'Mixed Use/Res w Non Res')
    GROUP BY footprint_bucket
    ORDER BY footprint_bucket
  `);
  out('| linked footprint bucket | n permits | median declared units | median declared cost | median modeled cost |');
  out('|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      row.footprint_bucket,
      row.n,
      row.median_units,
      fmtCost(row.median_declared),
      fmtCost(row.median_modeled),
    ].join(' | ') + ' |');
  });
  out('\n**Interpretation:** for New Building megaprojects, if a high percentage of links land in the `<100sqm_tiny` or `100-500sqm_small` buckets, it confirms link-massing is matching wrong/old buildings. The correct massing should be `>10K_megaproject` for an apartment building with 200+ units. **Specifically:** apartment buildings declared > $30M almost always need GFA > 5,000 m² to be plausible; if they\'re getting < 500 m², the link is wrong.');
}

async function lensL_residentialCoverage() {
  header('Lens L — Residential building-to-lot coverage (NON-commercial focus)');
  out('**Operator question:** for our highest-volume residential combos (SFD/semi-detached/townhouse additions, new builds, and laneway/garden suites), how accurate is the massing data — specifically `footprint_area_sqm / lot_size_sqm` (lot coverage ratio)?');
  out('');
  out('**Toronto residential zoning baseline:** typical built coverage is **30-50%** of lot size for SFD/semi-detached/townhouse. Garden suites + laneway suites push toward 35-45% when added to existing primary structures.');
  out('');
  out('**Interpretation rules:**');
  out('- `coverage < 10%`: building is suspiciously small for the lot → likely wrong building linked (shed/garage) or lot data is wrong (large vacant parcel');
  out('- `coverage 10-25%`: under-built lot (small house on big lot — possible but rare for additions/new builds)');
  out('- `coverage 25-55%`: **EXPECTED RANGE** — accurate Toronto residential coverage');
  out('- `coverage 55-75%`: dense lot (could be townhouse or laneway suite included)');
  out('- `coverage > 75%`: implausible — either lot_size_sqm is wrong (under-counted) OR building includes adjacent parcel');
  out('');

  const RESIDENTIAL_FILTER = `
    p.permit_type IN ('New Houses', 'Small Residential Projects', 'Residential Building Permit', 'New Building')
    AND p.structure_type IN (
      'SFD - Detached', 'SFD - Semi-Detached', 'SFD - Townhouse',
      '2 Unit - Detached', '2 Unit - Semi-detached', '3+ Unit - Detached',
      'Laneway / Rear Yard Suite', 'Converted House', 'Stacked Townhouses'
    )
  `;

  const r = await pool.query(`
    WITH coverage AS (
      SELECT p.permit_type, p.structure_type, p.permit_num, p.revision_num,
             bf.footprint_area_sqm,
             par.lot_size_sqm,
             100.0 * bf.footprint_area_sqm / NULLIF(par.lot_size_sqm, 0) AS coverage_pct
      FROM permits p
      LEFT JOIN LATERAL (
        SELECT pp.parcel_id FROM permit_parcels pp
        WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
        ORDER BY pp.parcel_id ASC LIMIT 1
      ) parcel ON true
      LEFT JOIN parcels par ON par.id = parcel.parcel_id
      LEFT JOIN parcel_buildings pb ON pb.parcel_id = parcel.parcel_id AND pb.is_primary = true
      LEFT JOIN building_footprints bf ON bf.id = pb.building_id
      WHERE ${RESIDENTIAL_FILTER}
        AND bf.footprint_area_sqm > 0
        AND par.lot_size_sqm > 0
    )
    SELECT permit_type, structure_type,
           COUNT(*) AS n,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY coverage_pct)::numeric AS p25,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY coverage_pct)::numeric AS p50,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY coverage_pct)::numeric AS p75,
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY coverage_pct)::numeric AS p95,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY footprint_area_sqm)::numeric AS median_footprint,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY lot_size_sqm)::numeric AS median_lot,
           COUNT(*) FILTER (WHERE coverage_pct < 10)  AS too_low,
           COUNT(*) FILTER (WHERE coverage_pct BETWEEN 25 AND 55) AS in_band,
           COUNT(*) FILTER (WHERE coverage_pct > 75)  AS too_high
    FROM coverage
    GROUP BY permit_type, structure_type
    HAVING COUNT(*) >= 30
    ORDER BY n DESC
  `);

  out('### Coverage distribution by combo');
  out('| permit_type | structure_type | n | p25 | p50 | p75 | p95 | median footprint | median lot | <10% | in 25-55% band | >75% |');
  out('|---|---|---|---|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    const inBandPct = ((100 * row.in_band / row.n)).toFixed(0);
    const tooLowPct = ((100 * row.too_low / row.n)).toFixed(0);
    const tooHighPct = ((100 * row.too_high / row.n)).toFixed(0);
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.n,
      Number(row.p25).toFixed(1) + '%',
      Number(row.p50).toFixed(1) + '%',
      Number(row.p75).toFixed(1) + '%',
      Number(row.p95).toFixed(1) + '%',
      fmtSqm(row.median_footprint),
      fmtSqm(row.median_lot),
      row.too_low + ' (' + tooLowPct + '%)',
      row.in_band + ' (' + inBandPct + '%)',
      row.too_high + ' (' + tooHighPct + '%)',
    ].join(' | ') + ' |');
  });

  out('\n### Verdict per combo');
  r.rows.forEach(row => {
    const p50 = Number(row.p50);
    const inBandPct = (100 * row.in_band / row.n);
    let verdict;
    if (p50 >= 25 && p50 <= 55 && inBandPct >= 60) {
      verdict = '✅ **ACCURATE** — median in 25-55% band, ≥60% of permits in band';
    } else if (p50 < 25 && (100 * row.too_low / row.n) > 30) {
      verdict = '⚠️ **UNDER-COVERAGE** — median below 25%, suggests wrong/tiny building linked for ' + (100 * row.too_low / row.n).toFixed(0) + '% of permits';
    } else if (p50 > 55 && (100 * row.too_high / row.n) > 30) {
      verdict = '⚠️ **OVER-COVERAGE** — median above 55%, suggests lot data under-counted OR building includes adjacent area for ' + (100 * row.too_high / row.n).toFixed(0) + '% of permits';
    } else if (p50 >= 25 && p50 <= 55) {
      verdict = '🟡 **MEDIAN OK, TAIL NOISY** — median in band but only ' + inBandPct.toFixed(0) + '% of permits land in band';
    } else {
      verdict = '🟡 **MIXED** — median ' + p50.toFixed(1) + '%, in-band rate ' + inBandPct.toFixed(0) + '%';
    }
    out('- **' + (row.permit_type || '') + ' / ' + (row.structure_type || '') + '** (n=' + row.n + '): ' + verdict);
  });

  out('\n### Sample of suspiciously low-coverage permits (likely wrong building linked)');
  const r2 = await pool.query(`
    WITH coverage AS (
      SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
             p.dwelling_units_created,
             bf.footprint_area_sqm, par.lot_size_sqm,
             100.0 * bf.footprint_area_sqm / NULLIF(par.lot_size_sqm, 0) AS coverage_pct,
             ce.estimated_cost, p.est_const_cost
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
      WHERE ${RESIDENTIAL_FILTER}
        AND bf.footprint_area_sqm > 0
        AND par.lot_size_sqm > 0
        AND ce.lead_id LIKE 'permit:%'
    )
    SELECT permit_num, revision_num, permit_type, structure_type,
           dwelling_units_created, footprint_area_sqm, lot_size_sqm,
           coverage_pct, estimated_cost, est_const_cost
    FROM coverage
    WHERE coverage_pct < 5
    ORDER BY est_const_cost DESC NULLS LAST
    LIMIT 15
  `);
  out('| permit | combo | units | footprint | lot | coverage% | est cost | declared cost |');
  out('|---|---|---|---|---|---|---|---|');
  r2.rows.forEach(row => {
    out('| ' + [
      row.permit_num + ':' + row.revision_num,
      (row.permit_type || '').slice(0, 12) + '/' + (row.structure_type || '').slice(0, 18),
      row.dwelling_units_created,
      fmtSqm(row.footprint_area_sqm),
      fmtSqm(row.lot_size_sqm),
      Number(row.coverage_pct).toFixed(1) + '%',
      fmtCost(row.estimated_cost),
      fmtCost(row.est_const_cost),
    ].join(' | ') + ' |');
  });

  out('\n### Sample of suspiciously high-coverage permits (likely lot data under-counted)');
  const r3 = await pool.query(`
    WITH coverage AS (
      SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
             p.dwelling_units_created,
             bf.footprint_area_sqm, par.lot_size_sqm,
             100.0 * bf.footprint_area_sqm / NULLIF(par.lot_size_sqm, 0) AS coverage_pct,
             ce.estimated_cost, p.est_const_cost
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
      WHERE ${RESIDENTIAL_FILTER}
        AND bf.footprint_area_sqm > 0
        AND par.lot_size_sqm > 0
        AND ce.lead_id LIKE 'permit:%'
    )
    SELECT permit_num, revision_num, permit_type, structure_type,
           dwelling_units_created, footprint_area_sqm, lot_size_sqm,
           coverage_pct, estimated_cost, est_const_cost
    FROM coverage
    WHERE coverage_pct > 95
    ORDER BY est_const_cost DESC NULLS LAST
    LIMIT 15
  `);
  out('| permit | combo | units | footprint | lot | coverage% | est cost | declared cost |');
  out('|---|---|---|---|---|---|---|---|');
  r3.rows.forEach(row => {
    out('| ' + [
      row.permit_num + ':' + row.revision_num,
      (row.permit_type || '').slice(0, 12) + '/' + (row.structure_type || '').slice(0, 18),
      row.dwelling_units_created,
      fmtSqm(row.footprint_area_sqm),
      fmtSqm(row.lot_size_sqm),
      Number(row.coverage_pct).toFixed(1) + '%',
      fmtCost(row.estimated_cost),
      fmtCost(row.est_const_cost),
    ].join(' | ') + ' |');
  });
}

async function lensK_storiesData() {
  header('Lens K — Stories data quality (declared vs modeled)');
  out('GFA formula in primary path: `footprint_area_sqm × estimated_stories`. A wrong story count multiplicatively breaks GFA. We have TWO story sources: `permits.storeys` (declared at permit application) and `building_footprints.estimated_stories` (from city massing). Previously `permits.storeys` was reported as returning zero everywhere — check whether that\'s still the case and how it affects GFA.\n');

  const r1 = await pool.query(`
    SELECT
      CASE
        WHEN p.storeys IS NULL THEN '0_null'
        WHEN p.storeys = 0      THEN '1_zero'
        WHEN p.storeys BETWEEN 1 AND 3 THEN '2_low_rise'
        WHEN p.storeys BETWEEN 4 AND 12 THEN '3_mid_rise'
        WHEN p.storeys >= 13   THEN '4_high_rise'
      END AS bucket,
      COUNT(*) AS n
    FROM permits p
    GROUP BY bucket
    ORDER BY bucket
  `);
  out('### permits.storeys distribution (declared)');
  out('| bucket | n |');
  out('|---|---|');
  r1.rows.forEach(row => out('| ' + row.bucket + ' | ' + row.n + ' |'));

  const r2 = await pool.query(`
    SELECT
      CASE
        WHEN bf.estimated_stories IS NULL THEN '0_null'
        WHEN bf.estimated_stories = 0      THEN '1_zero'
        WHEN bf.estimated_stories BETWEEN 1 AND 3 THEN '2_low_rise'
        WHEN bf.estimated_stories BETWEEN 4 AND 12 THEN '3_mid_rise'
        WHEN bf.estimated_stories >= 13   THEN '4_high_rise'
      END AS bucket,
      COUNT(*) AS n,
      ROUND(AVG(bf.footprint_area_sqm)::numeric, 0) AS avg_footprint_sqm
    FROM building_footprints bf
    GROUP BY bucket
    ORDER BY bucket
  `);
  out('\n### building_footprints.estimated_stories distribution (city massing)');
  out('| bucket | n | avg footprint |');
  out('|---|---|---|');
  r2.rows.forEach(row => out('| ' + row.bucket + ' | ' + row.n + ' | ' + fmtSqm(row.avg_footprint_sqm) + ' |'));

  out('\n### Permits with non-zero declared storeys (verify "previously zero" status)');
  const r3 = await pool.query(`
    SELECT
      COUNT(*) AS total_permits,
      COUNT(*) FILTER (WHERE storeys IS NULL) AS null_storeys,
      COUNT(*) FILTER (WHERE storeys = 0)      AS zero_storeys,
      COUNT(*) FILTER (WHERE storeys > 0)      AS positive_storeys,
      ROUND(100.0 * COUNT(*) FILTER (WHERE storeys > 0) / COUNT(*), 1) AS positive_pct
    FROM permits
  `);
  out('| total | NULL | zero | > 0 | positive% |');
  out('|---|---|---|---|---|');
  const r3r = r3.rows[0];
  out('| ' + [r3r.total_permits, r3r.null_storeys, r3r.zero_storeys, r3r.positive_storeys, r3r.positive_pct + '%'].join(' | ') + ' |');

  out('\n### Story disagreement (declared vs massing) for permits with BOTH populated');
  const r4 = await pool.query(`
    WITH joined AS (
      SELECT p.permit_num, p.permit_type, p.structure_type,
             p.storeys AS declared,
             bf.estimated_stories AS massing,
             ce.modeled_gfa_sqm,
             ce.estimated_cost
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
      LEFT JOIN LATERAL (
        SELECT pp.parcel_id FROM permit_parcels pp
        WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
        ORDER BY pp.parcel_id ASC LIMIT 1
      ) parcel ON true
      LEFT JOIN parcel_buildings pb ON pb.parcel_id = parcel.parcel_id AND pb.is_primary = true
      LEFT JOIN building_footprints bf ON bf.id = pb.building_id
      WHERE p.storeys IS NOT NULL AND p.storeys > 0
        AND bf.estimated_stories IS NOT NULL AND bf.estimated_stories > 0
        AND ce.lead_id LIKE 'permit:%'
    )
    SELECT permit_type, structure_type,
           COUNT(*) AS n,
           ROUND(AVG(declared)::numeric, 1) AS avg_declared,
           ROUND(AVG(massing)::numeric, 1) AS avg_massing,
           COUNT(*) FILTER (WHERE ABS(declared - massing) > 3) AS big_diff_n
    FROM joined
    GROUP BY permit_type, structure_type
    HAVING COUNT(*) >= 30
    ORDER BY n DESC
    LIMIT 20
  `);
  out('| permit_type | structure_type | n | avg declared | avg massing | n with |Δ|>3 |');
  out('|---|---|---|---|---|---|');
  r4.rows.forEach(row => {
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.n,
      row.avg_declared,
      row.avg_massing,
      row.big_diff_n,
    ].join(' | ') + ' |');
  });
  out('\n**Interpretation:** if `permits.storeys` is mostly zero or null, the Brain falls back to massing-side `estimated_stories`, which (per the Brain code at cost-model-shared.js:193) defaults to 1 when both are missing. For megaprojects this means **GFA = footprint × 1**, drastically under-estimating multi-story buildings. This is the load-bearing question: is `permits.storeys` reliable enough to be the source of truth, or do we need to derive stories from `dwelling_units_created` / `footprint_area_sqm` as a fallback?');
}

async function main() {
  out('# WF1 GFA + Massing Accuracy Investigation');
  out('');
  out('**Date:** ' + new Date().toISOString().slice(0, 10));
  out('**Parent:** `docs/reports/wf1-cost-accuracy-investigation.md` (cost over/under-prediction findings)');
  out('**Method:** read-only DB queries against modeled_gfa_sqm, building_footprints, parcels, parcel_buildings.');
  out('**Hypothesis under test:** the cost over-prediction for additions/alterations and under-prediction for megaprojects is rooted in GFA computation, not matrix allocation. Massing data quality (building outline on the lot) is the upstream driver.');
  try {
    await lensA_distribution();
    await lensB_pathMix();
    await lensC_gfaVsDeclared();
    await lensD_megaprojectGFA();
    await lensE_outliers();
    await lensF_massingPresence();
    await lensG_sanityVsDeclared();
    await lensH_buildingLinkConfidence();
    await lensI_multiBuildingParcels();
    await lensJ_newBuildingMassingDiagnosis();
    await lensK_storiesData();
    await lensL_residentialCoverage();
  } finally {
    await pool.end();
  }
  const outPath = path.resolve(__dirname, '../../docs/reports/wf1-gfa-accuracy-investigation.md');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log('Report written to: ' + outPath);
}

main().catch(err => {
  console.error('FATAL: ' + err.message);
  console.error(err.stack);
  pool.end().finally(() => process.exit(1));
});
