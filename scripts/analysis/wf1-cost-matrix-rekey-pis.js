#!/usr/bin/env node
/**
 * WF1 PIs — scope_intensity_matrix production-vocabulary re-key.
 * Read-only investigation: PI-1, PI-2, PI-5, PI-6, PI-7, PI-8.
 * (PI-0, PI-3, PI-4, PI-9, PI-10 are not DB queries — handled separately.)
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md
 */
'use strict';

const { createPool } = require('../lib/pipeline');

const pool = createPool();

async function safeQuery(label, sql, params) {
  try {
    const result = await pool.query(sql, params || []);
    return result.rows;
  } catch (err) {
    console.log('  [' + label + '] ERROR: ' + err.message.split('\n')[0]);
    return null;
  }
}

function header(title) {
  console.log('\n========== ' + title + ' ==========');
}

async function pi1() {
  header('PI-1: Top-N construction permit (permit_type, structure_type) coverage');
  const rows = await safeQuery('PI-1', `
    SELECT p.permit_type, p.structure_type, COUNT(*) AS n,
           ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS individual_pct,
           ROUND(100.0 * SUM(COUNT(*)) OVER (ORDER BY COUNT(*) DESC ROWS UNBOUNDED PRECEDING)
                 / SUM(COUNT(*)) OVER (), 2) AS cumulative_pct
    FROM permits p
    LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
    WHERE COALESCE(ptc.class, 'unclassified') = 'construction'
      AND p.permit_type IS NOT NULL AND p.permit_type <> ''
      AND p.structure_type IS NOT NULL AND p.structure_type <> ''
    GROUP BY p.permit_type, p.structure_type
    ORDER BY n DESC
    LIMIT 80
  `);
  if (!rows) return;
  console.log('rank | n      | individual% | cumulative% | permit_type | structure_type');
  console.log('-----|--------|-------------|-------------|-------------|---------------');
  rows.forEach((r, i) => {
    console.log(
      String(i + 1).padStart(4) + ' | ' +
      String(r.n).padStart(6) + ' | ' +
      String(r.individual_pct).padStart(11) + ' | ' +
      String(r.cumulative_pct).padStart(11) + ' | ' +
      (r.permit_type || '').slice(0, 40).padEnd(40) + ' | ' +
      (r.structure_type || '').slice(0, 40)
    );
  });
  const included = rows.filter(r => Number(r.individual_pct) >= 0.5 || (Number(r.cumulative_pct) - Number(r.individual_pct)) < 90);
  const capped = included.slice(0, 60);
  const predictedCoverage = capped.reduce((s, r) => s + Number(r.individual_pct), 0);
  console.log('\nPI-1 inclusion: ' + capped.length + ' rows (capped at 60)');
  console.log('PI-1 predicted post-fix coverage: ' + predictedCoverage.toFixed(2) + '%');
}

async function pi2() {
  header('PI-2: trade_sqft_rates vs permit_trades.trade_slug vocabulary check');
  const rates = await safeQuery('PI-2 rates', `
    SELECT trade_slug, COUNT(*) AS n FROM trade_sqft_rates GROUP BY trade_slug ORDER BY trade_slug
  `);
  const trades = await safeQuery('PI-2 trades', `
    SELECT trade_slug, COUNT(*) AS n FROM permit_trades GROUP BY trade_slug ORDER BY n DESC LIMIT 50
  `);
  if (rates) {
    console.log('\ntrade_sqft_rates trade_slugs (' + rates.length + '):');
    rates.forEach(r => console.log('  ' + r.trade_slug));
  }
  if (trades) {
    console.log('\npermit_trades trade_slugs top 50:');
    trades.forEach(r => console.log('  ' + r.trade_slug + '  (' + r.n + ')'));
  }
  if (rates && trades) {
    const rateSet = new Set(rates.map(r => r.trade_slug));
    const tradeSet = new Set(trades.map(r => r.trade_slug));
    const missingFromRates = trades.filter(t => !rateSet.has(t.trade_slug)).map(t => t.trade_slug);
    const missingFromTrades = rates.filter(r => !tradeSet.has(r.trade_slug)).map(r => r.trade_slug);
    console.log('\nMissing in trade_sqft_rates (top-50 of permit_trades): ' + missingFromRates.length);
    missingFromRates.slice(0, 10).forEach(s => console.log('  ' + s));
    console.log('Present in trade_sqft_rates but not in top-50 permit_trades: ' + missingFromTrades.length);
    missingFromTrades.slice(0, 10).forEach(s => console.log('  ' + s));
  }
}

async function pi5() {
  header('PI-5: CoA empirical impact');
  const keyPresence = await safeQuery('PI-5 keys', `
    SELECT
      COUNT(*) AS total_coa,
      COUNT(*) FILTER (WHERE permit_type IS NOT NULL AND permit_type <> '') AS with_permit_type,
      COUNT(*) FILTER (WHERE structure_type IS NOT NULL AND structure_type <> '') AS with_structure_type,
      COUNT(*) FILTER (WHERE permit_type IS NOT NULL AND permit_type <> '' AND structure_type IS NOT NULL AND structure_type <> '') AS with_both
    FROM coa_applications
  `);
  if (keyPresence) {
    console.log('coa_applications keys:');
    console.log(JSON.stringify(keyPresence[0], null, 2));
  }
  const costDist = await safeQuery('PI-5 coa cost_source', `
    SELECT cost_source, COUNT(*) AS n FROM cost_estimates WHERE lead_id LIKE 'coa:%' GROUP BY cost_source ORDER BY n DESC
  `);
  if (costDist) {
    console.log('\nCoA cost_estimates cost_source distribution (pre-migration snapshot):');
    costDist.forEach(r => console.log('  ' + (r.cost_source || 'NULL') + ': ' + r.n));
  }
}

async function pi6() {
  header('PI-6: Column collation — BOTH source (permits) AND target (scope_intensity_matrix)');
  const collations = await safeQuery('PI-6', `
    SELECT table_name, column_name, data_type, collation_name
    FROM information_schema.columns
    WHERE (table_name = 'scope_intensity_matrix' AND column_name IN ('permit_type', 'structure_type'))
       OR (table_name = 'permits' AND column_name IN ('permit_type', 'structure_type'))
    ORDER BY table_name, column_name
  `);
  if (collations) {
    console.log('table | column | type | collation');
    collations.forEach(r => console.log('  ' + r.table_name + ' | ' + r.column_name + ' | ' + r.data_type + ' | ' + (r.collation_name || 'DEFAULT')));
  }
  const dbCollation = await safeQuery('PI-6 db', `
    SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()
  `);
  if (dbCollation) {
    console.log('\nDB-level collation:');
    console.log('  datcollate: ' + dbCollation[0].datcollate);
    console.log('  datctype:   ' + dbCollation[0].datctype);
  }
}

async function pi7() {
  header('PI-7: Whitespace audit — permits source side');
  const ws = await safeQuery('PI-7', `
    SELECT
      COUNT(*) FILTER (WHERE permit_type != TRIM(permit_type) OR structure_type != TRIM(structure_type)) AS leading_trailing,
      COUNT(*) FILTER (WHERE permit_type ~ '\\s{2,}' OR structure_type ~ '\\s{2,}') AS collapsed_spaces,
      COUNT(*) FILTER (WHERE permit_type ~ '[\\u00a0\\u200b\\u2028\\u2029]' OR structure_type ~ '[\\u00a0\\u200b\\u2028\\u2029]') AS non_ascii_space
    FROM permits
  `);
  if (ws) {
    console.log('Whitespace anomalies in permits:');
    console.log(JSON.stringify(ws[0], null, 2));
  }
}

async function pi8() {
  header('PI-8: PRIMARY KEY / UNIQUE constraint on scope_intensity_matrix');
  const cons = await safeQuery('PI-8', `
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'scope_intensity_matrix'::regclass
      AND contype IN ('p', 'u')
    ORDER BY contype
  `);
  if (cons) {
    cons.forEach(r => console.log('  [' + r.contype + '] ' + r.conname + ' -> ' + r.def));
  }
}

async function matrixSnapshot() {
  header('Reference: current scope_intensity_matrix state');
  const rows = await safeQuery('matrix', `
    SELECT permit_type, structure_type, gfa_allocation_percentage
    FROM scope_intensity_matrix
    ORDER BY permit_type, structure_type
  `);
  if (rows) {
    console.log('Current rows (' + rows.length + '):');
    rows.forEach(r => console.log('  ' + r.permit_type + ' | ' + r.structure_type + ' | ' + r.gfa_allocation_percentage));
  }
}

async function main() {
  console.log('WF1 PI investigation - scope_intensity_matrix production-vocab re-key');
  console.log('Date: ' + new Date().toISOString());
  console.log('DB: ' + (process.env.PG_DATABASE || 'buildo') + '@' + (process.env.PG_HOST || 'localhost'));
  try {
    await matrixSnapshot();
    await pi1();
    await pi2();
    await pi5();
    await pi6();
    await pi7();
    await pi8();
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL: ' + err.message);
  console.error(err.stack);
  pool.end().finally(() => process.exit(1));
});
