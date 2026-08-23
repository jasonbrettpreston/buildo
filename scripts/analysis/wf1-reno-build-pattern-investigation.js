#!/usr/bin/env node
/**
 * WF1 Reno-Build Pattern Investigation
 *
 * Detect "three-wall renovation" pattern: permits classified as additions/
 * small residential projects but economically new builds (high declared cost
 * + new-construction-keyword description + many active trades).
 *
 * Read-only investigation. Outputs to:
 *   docs/reports/wf1-reno-build-pattern-investigation.md
 */
'use strict';

const { createResolvedPool } = require('../lib/resolve-db');
const fs = require('fs');
const path = require('path');

const pool = createResolvedPool({ label: 'wf1-reno-build-pattern-investigation' });
const lines = [];

function out(s) { lines.push(s); }
function header(s) { out('\n## ' + s + '\n'); }
function fmt(v) {
  if (v == null) return 'N/A';
  const n = Number(v);
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

async function prevalence() {
  header('Part 1 — Prevalence by detection signal');
  out('For SFD-Detached permits classified as Small Residential Projects or Building Additions/Alterations, count permits matching each detection signal.\n');

  const r = await pool.query(`
    WITH base AS (
      SELECT *
      FROM permits
      WHERE permit_type IN ('Small Residential Projects', 'Building Additions/Alterations')
        AND structure_type IN ('SFD - Detached', 'SFD - Semi-Detached', 'SFD - Townhouse',
                                '2 Unit - Detached', '2 Unit - Semi-detached', '3+ Unit - Detached')
    )
    SELECT permit_type, structure_type,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE est_const_cost > 500000) AS cost_gt_500k,
           COUNT(*) FILTER (WHERE est_const_cost > 1000000) AS cost_gt_1m,
           COUNT(*) FILTER (WHERE description ~* '(demolish|tear[- ]down|rebuild|new construction|three[- ]wall|substantial(ly)? renovat|gut renovat|complete renovat|down to studs)') AS reno_keyword_n,
           COUNT(*) FILTER (WHERE description ~* '(addition.*new|new.*addition|second storey addition|3rd storey|third storey|raise (the )?roof)') AS major_addition_n,
           COUNT(*) FILTER (WHERE est_const_cost > 500000
                           AND description ~* '(demolish|tear[- ]down|rebuild|new construction|three[- ]wall|substantial(ly)? renovat|gut renovat|down to studs)') AS likely_reno_build
    FROM base
    GROUP BY permit_type, structure_type
    ORDER BY total DESC
  `);
  out('| permit_type | structure_type | total | cost > $500K | cost > $1M | keyword: demolish/rebuild/etc | major addition keywords | likely reno-build (both signals) |');
  out('|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    const totalNum = Number(row.total);
    const pct = n => Math.round(100 * Number(n) / totalNum) + '%';
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.total,
      row.cost_gt_500k + ' (' + pct(row.cost_gt_500k) + ')',
      row.cost_gt_1m + ' (' + pct(row.cost_gt_1m) + ')',
      row.reno_keyword_n + ' (' + pct(row.reno_keyword_n) + ')',
      row.major_addition_n + ' (' + pct(row.major_addition_n) + ')',
      row.likely_reno_build + ' (' + pct(row.likely_reno_build) + ')',
    ].join(' | ') + ' |');
  });
}

async function sampleHighCost() {
  header('Part 2 — Sample of likely reno-build permits');
  out('SFD permits classified as Small Resid Proj / Building Add/Alt with declared cost > $1M (rare for a "small residential project"). Includes description excerpts to verify the pattern.\n');
  const r = await pool.query(`
    SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
           p.est_const_cost, p.dwelling_units_created,
           LEFT(p.description, 240) AS description_short,
           ce.estimated_cost,
           ce.modeled_gfa_sqm
    FROM permits p
    LEFT JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num
    WHERE p.permit_type IN ('Small Residential Projects', 'Building Additions/Alterations')
      AND p.structure_type IN ('SFD - Detached', 'SFD - Semi-Detached', 'SFD - Townhouse')
      AND p.est_const_cost > 1000000
    ORDER BY p.est_const_cost DESC
    LIMIT 20
  `);
  out('| permit | type / struct | declared $ | model $ | model GFA | description (first 240 chars) |');
  out('|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      row.permit_num + ':' + row.revision_num,
      (row.permit_type || '').slice(0, 8) + ' / ' + (row.structure_type || '').slice(0, 12),
      fmt(row.est_const_cost),
      fmt(row.estimated_cost),
      row.modeled_gfa_sqm ? Math.round(Number(row.modeled_gfa_sqm)) + ' m²' : 'N/A',
      (row.description_short || '').replace(/[\r\n|]+/g, ' ').slice(0, 240),
    ].join(' | ') + ' |');
  });
}

async function keywordFingerprints() {
  header('Part 3 — Description keyword frequency in addition/small-reno permits');
  out('Specific phrases that often signal reno-build scope hidden inside an "addition" classification.\n');
  const r = await pool.query(`
    WITH base AS (
      SELECT description, est_const_cost
      FROM permits
      WHERE permit_type IN ('Small Residential Projects', 'Building Additions/Alterations')
        AND structure_type IN ('SFD - Detached', 'SFD - Semi-Detached')
        AND description IS NOT NULL
    )
    SELECT
      'demolish (any form)'        AS pattern, COUNT(*) FILTER (WHERE description ~* 'demolish')                              AS n_total, COUNT(*) FILTER (WHERE description ~* 'demolish' AND est_const_cost > 500000) AS n_high_cost FROM base
    UNION ALL SELECT
      'tear down / tear-down',                  COUNT(*) FILTER (WHERE description ~* 'tear[- ]down'),                          COUNT(*) FILTER (WHERE description ~* 'tear[- ]down' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'new construction',                        COUNT(*) FILTER (WHERE description ~* 'new construction'),                     COUNT(*) FILTER (WHERE description ~* 'new construction' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'rebuild',                                  COUNT(*) FILTER (WHERE description ~* 'rebuild'),                              COUNT(*) FILTER (WHERE description ~* 'rebuild' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'three wall / 3 wall',                     COUNT(*) FILTER (WHERE description ~* 'three[- ]wall|3[- ]wall'),                COUNT(*) FILTER (WHERE description ~* 'three[- ]wall|3[- ]wall' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'gut renovation',                          COUNT(*) FILTER (WHERE description ~* 'gut renovat'),                          COUNT(*) FILTER (WHERE description ~* 'gut renovat' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'substantial(ly) renovat',                  COUNT(*) FILTER (WHERE description ~* 'substantial(ly)? renovat'),             COUNT(*) FILTER (WHERE description ~* 'substantial(ly)? renovat' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'down to studs',                            COUNT(*) FILTER (WHERE description ~* 'down to studs'),                       COUNT(*) FILTER (WHERE description ~* 'down to studs' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'complete renovat',                         COUNT(*) FILTER (WHERE description ~* 'complete renovat'),                    COUNT(*) FILTER (WHERE description ~* 'complete renovat' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'second storey addition',                   COUNT(*) FILTER (WHERE description ~* 'second storey addition|2nd storey addition'),  COUNT(*) FILTER (WHERE description ~* 'second storey addition|2nd storey addition' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'third storey addition',                    COUNT(*) FILTER (WHERE description ~* 'third storey addition|3rd storey addition'),  COUNT(*) FILTER (WHERE description ~* 'third storey addition|3rd storey addition' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'raise roof',                               COUNT(*) FILTER (WHERE description ~* 'raise (the )?roof'),                   COUNT(*) FILTER (WHERE description ~* 'raise (the )?roof' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'rear addition',                            COUNT(*) FILTER (WHERE description ~* 'rear addition'),                       COUNT(*) FILTER (WHERE description ~* 'rear addition' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'second floor addition',                    COUNT(*) FILTER (WHERE description ~* 'second floor addition|2nd floor addition'),  COUNT(*) FILTER (WHERE description ~* 'second floor addition|2nd floor addition' AND est_const_cost > 500000) FROM base
    UNION ALL SELECT
      'main floor renovation',                    COUNT(*) FILTER (WHERE description ~* 'main floor renovat|first floor renovat'),  COUNT(*) FILTER (WHERE description ~* 'main floor renovat|first floor renovat' AND est_const_cost > 500000) FROM base
    ORDER BY n_total DESC
  `);
  out('| keyword pattern | n (any cost) | n (cost > $500K) |');
  out('|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [row.pattern, row.n_total, row.n_high_cost].join(' | ') + ' |');
  });
}

async function tradeFingerprint() {
  header('Part 4 — Trade count fingerprint for likely reno-builds');
  out('Permits classified as small reno but with FULL trade composition (foundation/framing/structural-steel + plumbing + electrical + hvac + drywall + roofing) almost certainly are new-build-scope work. Typical small addition would have 2-4 trades; full reno-builds have 8-12+.\n');
  const r = await pool.query(`
    WITH trade_counts AS (
      SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type, p.est_const_cost,
             (SELECT COUNT(DISTINCT trade_id) FROM permit_trades pt WHERE pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num AND pt.is_active) AS trade_count
      FROM permits p
      WHERE p.permit_type IN ('Small Residential Projects', 'Building Additions/Alterations')
        AND p.structure_type IN ('SFD - Detached', 'SFD - Semi-Detached')
    )
    SELECT permit_type, structure_type,
           CASE
             WHEN trade_count <= 2 THEN '0-2 (typical reno)'
             WHEN trade_count BETWEEN 3 AND 5 THEN '3-5 (medium reno)'
             WHEN trade_count BETWEEN 6 AND 8 THEN '6-8 (major reno)'
             WHEN trade_count >= 9 THEN '9+ (reno-build pattern)'
             ELSE 'unknown'
           END AS trade_band,
           COUNT(*) AS n,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY est_const_cost)::numeric AS median_declared
    FROM trade_counts
    GROUP BY permit_type, structure_type, trade_band
    ORDER BY permit_type, structure_type, trade_band
  `);
  out('| permit_type | structure_type | trade band | n permits | median declared $ |');
  out('|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.trade_band,
      row.n,
      fmt(row.median_declared),
    ].join(' | ') + ' |');
  });
}

async function impactEstimate() {
  header('Part 5 — Cost-model impact estimate of correcting reno-build allocation');
  out('IF reno-build permits should have allocation 1.0 instead of 0.25 (current matrix value for `Small Residential Projects × SFD - Detached`), how many permits are affected and what is the cost-estimate delta?\n');

  const r = await pool.query(`
    WITH likely_reno_build AS (
      SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
             p.est_const_cost,
             ce.estimated_cost AS current_estimated_cost,
             ce.modeled_gfa_sqm,
             ce.cost_source
      FROM permits p
      JOIN cost_estimates ce ON ce.permit_num = p.permit_num AND ce.revision_num = p.revision_num
      WHERE p.permit_type IN ('Small Residential Projects', 'Building Additions/Alterations')
        AND p.structure_type IN ('SFD - Detached', 'SFD - Semi-Detached')
        AND p.est_const_cost > 500000
        AND p.description ~* '(demolish|tear[- ]down|rebuild|new construction|three[- ]wall|substantial(ly)? renovat|gut renovat|down to studs|complete renovat)'
        AND ce.lead_id LIKE 'permit:%'
    )
    SELECT permit_type, structure_type,
           COUNT(*) AS n,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY est_const_cost)::numeric AS median_declared,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY current_estimated_cost)::numeric AS current_median_modeled,
           SUM(est_const_cost)::numeric AS total_declared,
           SUM(current_estimated_cost)::numeric AS total_currently_modeled,
           COUNT(*) FILTER (WHERE cost_source = 'permit') AS source_permit,
           COUNT(*) FILTER (WHERE cost_source = 'model')  AS source_model
    FROM likely_reno_build
    GROUP BY permit_type, structure_type
  `);
  out('| permit_type | structure_type | n likely reno-build | median declared | current median modeled | total declared | total currently modeled | from permit / model |');
  out('|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.n,
      fmt(row.median_declared),
      fmt(row.current_median_modeled),
      fmt(row.total_declared),
      fmt(row.total_currently_modeled),
      row.source_permit + ' / ' + row.source_model,
    ].join(' | ') + ' |');
  });
}

async function main() {
  out('# WF1 — Reno-Build Pattern Investigation');
  out('');
  out('**Date:** ' + new Date().toISOString().slice(0, 10));
  out('**Hypothesis:** A non-trivial fraction of permits classified as `Small Residential Projects` or `Building Additions/Alterations` are economically new builds — builders retain a wall or two (or the foundation) to avoid full demolition permit classification and to preserve grandfathered FSI/setbacks. The matrix allocation of 0.25 under-estimates these by 3-4x.');
  out('');
  out('**Detection signals tested:** declared cost magnitude, description text keywords, trade count, dwelling_units_created.');
  try {
    await prevalence();
    await keywordFingerprints();
    await tradeFingerprint();
    await impactEstimate();
    await sampleHighCost();
  } finally {
    await pool.end();
  }
  const outPath = path.resolve(__dirname, '../../docs/reports/wf1-reno-build-pattern-investigation.md');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log('Report written to: ' + outPath);
}

main().catch(err => {
  console.error('FATAL: ' + err.message);
  console.error(err.stack);
  pool.end().finally(() => process.exit(1));
});
