#!/usr/bin/env node
/**
 * WF1 Cost Accuracy Investigation — lenses #1 + #2 + #3
 *
 * Lens #1: Distribution percentiles by (permit_type, structure_type, cost_source)
 * Lens #2: Outliers (permits with estimates extreme vs their combo median)
 * Lens #3: MAPE — model vs permit declared cost divergence per combo
 * Lens #4: Liar's Gate override rate by combo
 * Lens #5: Trade contract value sanity check
 *
 * Read-only. Outputs to docs/reports/wf1-cost-accuracy-investigation.md.
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md
 */
'use strict';

const { createPool } = require('../lib/pipeline');
const fs = require('fs');
const path = require('path');

const pool = createPool();
const lines = [];

function out(s) { lines.push(s); }
function header(s) { out('\n## ' + s + '\n'); }
function fmt(v) {
  if (v == null) return 'N/A';
  if (typeof v === 'number') {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v.toFixed(0);
  }
  return String(v);
}

async function lens1_distributions() {
  header('Lens #1 — Per-combo cost distributions (p25/p50/p75/p95)');
  out('Filters: estimated_cost IS NOT NULL, permits only, n >= 20 per combo group.\n');
  const r = await pool.query(`
    SELECT p.permit_type, p.structure_type, ce.cost_source,
           COUNT(*) AS n,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS p25,
           PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS p50,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS p75,
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS p95,
           MAX(ce.estimated_cost) AS max_val
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    WHERE ce.estimated_cost IS NOT NULL
      AND ce.lead_id LIKE 'permit:%'
    GROUP BY p.permit_type, p.structure_type, ce.cost_source
    HAVING COUNT(*) >= 20
    ORDER BY n DESC
    LIMIT 60
  `);
  out('| permit_type | structure_type | source | n | p25 | p50 | p75 | p95 | max |');
  out('|---|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      (row.permit_type || '').slice(0, 30),
      (row.structure_type || '').slice(0, 25),
      row.cost_source,
      row.n,
      fmt(Number(row.p25)),
      fmt(Number(row.p50)),
      fmt(Number(row.p75)),
      fmt(Number(row.p95)),
      fmt(Number(row.max_val)),
    ].join(' | ') + ' |');
  });
}

async function lens2_outliers() {
  header('Lens #2 — Top 30 outlier permits (estimates extreme vs their combo median)');
  out('Outlier = `estimated_cost / combo_median > 10` OR `< 0.1`. Combo defined by (permit_type, structure_type). Combos with n < 10 excluded.\n');
  const r = await pool.query(`
    WITH combo_stats AS (
      SELECT p.permit_type, p.structure_type,
             PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS median,
             COUNT(*) AS n
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
      WHERE ce.estimated_cost IS NOT NULL AND ce.lead_id LIKE 'permit:%'
      GROUP BY p.permit_type, p.structure_type
      HAVING COUNT(*) >= 10
    ),
    flagged AS (
      SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type,
             ce.estimated_cost, ce.cost_source, p.est_const_cost,
             cs.median,
             ce.estimated_cost / NULLIF(cs.median, 0) AS deviation_ratio
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
      JOIN combo_stats cs ON cs.permit_type = p.permit_type AND cs.structure_type = p.structure_type
      WHERE ce.estimated_cost IS NOT NULL AND ce.lead_id LIKE 'permit:%'
        AND (ce.estimated_cost > cs.median * 10 OR ce.estimated_cost < cs.median * 0.1)
    )
    SELECT * FROM flagged
    ORDER BY ABS(LN(GREATEST(deviation_ratio, 0.0001))) DESC
    LIMIT 30
  `);
  out('| permit_num | permit_type | structure_type | source | estimated | declared | combo_median | dev_ratio |');
  out('|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      row.permit_num + ':' + row.revision_num,
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.cost_source,
      fmt(Number(row.estimated_cost)),
      fmt(Number(row.est_const_cost)),
      fmt(Number(row.median)),
      Number(row.deviation_ratio).toFixed(2) + 'x',
    ].join(' | ') + ' |');
  });
}

async function lens3_mape() {
  header('Lens #3 — Model vs declared cost divergence (MAPE-style by combo)');
  out('For each combo with BOTH `cost_source=model` AND `cost_source=permit` populations, compare their medians. Flag combos where the ratio is < 0.5 (model under-estimates) or > 2 (model over-estimates).\n');
  const r = await pool.query(`
    WITH per_combo AS (
      SELECT p.permit_type, p.structure_type, ce.cost_source,
             COUNT(*) AS n,
             PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS median
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
      WHERE ce.estimated_cost IS NOT NULL AND ce.lead_id LIKE 'permit:%'
        AND ce.cost_source IN ('model', 'permit')
      GROUP BY p.permit_type, p.structure_type, ce.cost_source
      HAVING COUNT(*) >= 10
    ),
    pivoted AS (
      SELECT permit_type, structure_type,
             MAX(CASE WHEN cost_source='model'  THEN median END) AS model_median,
             MAX(CASE WHEN cost_source='permit' THEN median END) AS permit_median,
             MAX(CASE WHEN cost_source='model'  THEN n END) AS model_n,
             MAX(CASE WHEN cost_source='permit' THEN n END) AS permit_n
      FROM per_combo
      GROUP BY permit_type, structure_type
    )
    SELECT permit_type, structure_type, model_n, permit_n,
           model_median, permit_median,
           model_median / NULLIF(permit_median, 0) AS ratio
    FROM pivoted
    WHERE model_median IS NOT NULL AND permit_median IS NOT NULL
    ORDER BY ABS(LN(GREATEST(model_median / NULLIF(permit_median, 1), 0.0001))) DESC
    LIMIT 40
  `);
  out('| permit_type | structure_type | model_n | permit_n | model_p50 | permit_p50 | ratio | verdict |');
  out('|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    const ratio = Number(row.ratio);
    let verdict;
    if (ratio < 0.5)      verdict = 'UNDER (model < 50% of declared)';
    else if (ratio > 2.0) verdict = 'OVER (model > 2x declared)';
    else if (ratio < 0.75) verdict = 'mild under';
    else if (ratio > 1.5) verdict = 'mild over';
    else                  verdict = 'aligned';
    out('| ' + [
      (row.permit_type || '').slice(0, 30),
      (row.structure_type || '').slice(0, 22),
      row.model_n,
      row.permit_n,
      fmt(Number(row.model_median)),
      fmt(Number(row.permit_median)),
      ratio.toFixed(2),
      verdict,
    ].join(' | ') + ' |');
  });
}

async function lens4_liarGateRate() {
  header('Lens #4 — Liar\'s Gate override rate by combo (model under-prediction signal)');
  out('Override rate = `is_geometric_override=true` / total. High rate means the surgical model consistently came in below 25% of the declared cost → the model is under-predicting for this combo (matrix allocation or trade rates too low).\n');
  const r = await pool.query(`
    SELECT p.permit_type, p.structure_type,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ce.is_geometric_override) AS overrides,
           ROUND(100.0 * COUNT(*) FILTER (WHERE ce.is_geometric_override) / COUNT(*), 1) AS override_pct
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    WHERE ce.estimated_cost IS NOT NULL AND ce.lead_id LIKE 'permit:%'
    GROUP BY p.permit_type, p.structure_type
    HAVING COUNT(*) >= 50
    ORDER BY override_pct DESC
    LIMIT 30
  `);
  out('| permit_type | structure_type | total | overrides | override% |');
  out('|---|---|---|---|---|');
  r.rows.forEach(row => {
    out('| ' + [
      (row.permit_type || '').slice(0, 30),
      (row.structure_type || '').slice(0, 25),
      row.total,
      row.overrides,
      row.override_pct + '%',
    ].join(' | ') + ' |');
  });
}

async function lens5_tradeMix() {
  header('Lens #5 — Trade-contract-value composition sanity check');
  out('For permits with `cost_source=model` (full surgical compute), look at the average percentage allocation per trade across the largest combos. Industry expectation for new residential: framing 15-20%, plumbing 5-10%, electrical 5-10%, drywall 8-12%, roofing 3-7%. Material divergence signals trade_sqft_rates miscalibration.\n');

  // Distinct combos to inspect (top by row count + cost_source=model)
  const combos = await pool.query(`
    SELECT p.permit_type, p.structure_type, COUNT(*) AS n
    FROM cost_estimates ce
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    WHERE ce.estimated_cost IS NOT NULL AND ce.lead_id LIKE 'permit:%'
      AND ce.cost_source = 'model'
      AND ce.trade_contract_values IS NOT NULL AND ce.trade_contract_values != '{}'::jsonb
    GROUP BY p.permit_type, p.structure_type
    HAVING COUNT(*) >= 100
    ORDER BY n DESC
    LIMIT 8
  `);

  for (const c of combos.rows) {
    out('\n### ' + c.permit_type + ' / ' + c.structure_type + ' (n=' + c.n + ' model-source permits)');
    const trades = await pool.query(`
      WITH expanded AS (
        SELECT
          tv.key AS trade_slug,
          (tv.value)::numeric AS trade_cost,
          ce.estimated_cost
        FROM cost_estimates ce
        JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
        CROSS JOIN LATERAL jsonb_each_text(ce.trade_contract_values) AS tv
        WHERE p.permit_type = $1 AND p.structure_type = $2
          AND ce.cost_source = 'model'
          AND ce.estimated_cost > 0
          AND ce.trade_contract_values IS NOT NULL
      )
      SELECT trade_slug,
             COUNT(*) AS n,
             ROUND(AVG(100.0 * trade_cost / estimated_cost), 1) AS avg_pct,
             ROUND(SUM(trade_cost)::numeric, 0) AS total_value
      FROM expanded
      WHERE trade_cost > 0
      GROUP BY trade_slug
      ORDER BY avg_pct DESC
      LIMIT 12
    `, [c.permit_type, c.structure_type]);
    out('| trade | n | avg % of total | total value |');
    out('|---|---|---|---|');
    trades.rows.forEach(row => {
      out('| ' + [row.trade_slug, row.n, row.avg_pct + '%', fmt(Number(row.total_value))].join(' | ') + ' |');
    });
  }
}

async function summary() {
  header('Calibration backlog (data-driven, ranked)');
  out('Based on Lens #2 (outliers) + Lens #3 (model-vs-declared divergence) + Lens #4 (override rate), the top calibration candidates for Control Panel tuning are:\n');
  const r = await pool.query(`
    WITH per_combo AS (
      SELECT p.permit_type, p.structure_type, ce.cost_source,
             COUNT(*) AS n,
             PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ce.estimated_cost)::numeric AS median,
             COUNT(*) FILTER (WHERE ce.is_geometric_override) AS overrides
      FROM cost_estimates ce
      JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
      WHERE ce.estimated_cost IS NOT NULL AND ce.lead_id LIKE 'permit:%'
        AND ce.cost_source IN ('model', 'permit')
      GROUP BY p.permit_type, p.structure_type, ce.cost_source
      HAVING COUNT(*) >= 50
    ),
    pivoted AS (
      SELECT permit_type, structure_type,
             MAX(CASE WHEN cost_source='model'  THEN median END) AS model_median,
             MAX(CASE WHEN cost_source='permit' THEN median END) AS permit_median,
             SUM(n) AS total_n,
             SUM(overrides) AS total_overrides
      FROM per_combo
      GROUP BY permit_type, structure_type
    )
    SELECT permit_type, structure_type, total_n,
           model_median, permit_median,
           model_median / NULLIF(permit_median, 0) AS ratio,
           ROUND(100.0 * total_overrides / total_n, 1) AS override_pct
    FROM pivoted
    WHERE model_median IS NOT NULL AND permit_median IS NOT NULL
      AND (ABS(LN(GREATEST(model_median / NULLIF(permit_median, 1), 0.0001))) > 0.5
           OR total_overrides::numeric / total_n > 0.4)
    ORDER BY total_n DESC
    LIMIT 20
  `);
  out('| permit_type | structure_type | n | model_p50 | permit_p50 | ratio | override% | suggested action |');
  out('|---|---|---|---|---|---|---|---|');
  r.rows.forEach(row => {
    const ratio = Number(row.ratio);
    let action;
    if (ratio < 0.5) action = 'BUMP UP matrix allocation or trade rates';
    else if (ratio > 2.0) action = 'BUMP DOWN matrix allocation';
    else if (Number(row.override_pct) > 50) action = 'REVIEW trade composition (high LG override)';
    else action = 'minor recalibration';
    out('| ' + [
      (row.permit_type || '').slice(0, 28),
      (row.structure_type || '').slice(0, 22),
      row.total_n,
      fmt(Number(row.model_median)),
      fmt(Number(row.permit_median)),
      ratio.toFixed(2),
      row.override_pct + '%',
      action,
    ].join(' | ') + ' |');
  });
}

async function main() {
  out('# WF1 Cost Accuracy Investigation');
  out('');
  out('**Date:** ' + new Date().toISOString().slice(0, 10));
  out('**Plan:** `.cursor/active_task.md` (WF1 v3 + IMPL folds)');
  out('**Method:** internal cross-validation — model vs declared cost (no external ground-truth data).');
  out('**Scope:** permits-side `cost_estimates` rows post WF1 §3.A re-key.');
  try {
    await lens1_distributions();
    await lens2_outliers();
    await lens3_mape();
    await lens4_liarGateRate();
    await lens5_tradeMix();
    await summary();
  } finally {
    await pool.end();
  }
  const outPath = path.resolve(__dirname, '../../docs/reports/wf1-cost-accuracy-investigation.md');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log('Report written to: ' + outPath);
}

main().catch(err => {
  console.error('FATAL: ' + err.message);
  console.error(err.stack);
  pool.end().finally(() => process.exit(1));
});
