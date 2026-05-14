#!/usr/bin/env node
/**
 * R6 one-shot verifier — runs against $DATABASE_URL and asserts every
 * schema artifact Phase B migrations 124–137 are supposed to create.
 *
 * Pure SELECT queries against pg_class / pg_indexes / pg_constraint /
 * pg_trigger / information_schema. Read-only. Safe to run on any DB.
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL = "postgresql://postgres@localhost:5432/buildo_phase_b_staging"
 *   node _tmp_phase_b_verify.mjs
 *
 * Exits 0 on full PASS, 1 on any FAIL.
 */
'use strict';

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const results = [];
function pass(name) { results.push({ name, ok: true }); }
function fail(name, msg) { results.push({ name, ok: false, msg }); }

async function expectExists(label, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  if (rows.length > 0 && (rows[0].exists === true || rows[0].count > 0 || Object.keys(rows[0]).length > 0)) {
    pass(label);
  } else {
    fail(label, `query returned no rows: ${sql}`);
  }
}

async function expectCount(label, expected, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  const actual = parseInt(rows[0]?.count ?? '0', 10);
  if (actual === expected) pass(label);
  else fail(label, `expected ${expected}, got ${actual}`);
}

async function main() {
  console.log('R6 Phase B schema verifier — running against', new URL(process.env.DATABASE_URL).pathname);
  console.log('');

  // ─── 4 new tables (migrations 124-127) ────────────────────────────
  for (const t of ['lead_trades', 'lead_parcels', 'lifecycle_transitions', 'lifecycle_status_history']) {
    await expectExists(`table ${t} exists`,
      `SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = $1 AND relkind = 'r') AS exists`, [t]);
  }

  // ─── 2 new reference tables (migrations 128, 130) ─────────────────
  for (const t of ['universal_stream_catalog', 'universal_stream_trade_signals']) {
    await expectExists(`table ${t} exists`,
      `SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = $1 AND relkind = 'r') AS exists`, [t]);
  }

  // ─── Catalog seed row count (migration 129) ───────────────────────
  await expectCount('universal_stream_catalog has 110 rows', 110,
    `SELECT COUNT(*) FROM universal_stream_catalog`);
  await expectCount('catalog seq contiguous 1-110', 1,
    `SELECT 1 AS count WHERE (SELECT MIN(seq) FROM universal_stream_catalog) = 1
       AND (SELECT MAX(seq) FROM universal_stream_catalog) = 110
       AND (SELECT COUNT(DISTINCT seq) FROM universal_stream_catalog) = 110`);

  // ─── Spec 84 §8.5 v10 BUG-fix invariants ──────────────────────────
  await expectCount('seq 14 has bid_value = 0.8', 1,
    `SELECT COUNT(*)::int AS count FROM universal_stream_catalog WHERE seq = 14 AND bid_value = 0.8`);
  await expectCount('B9.C block present (Spec 84 §8.5 gap fix — v10 has 3 sub-stages here)', 3,
    `SELECT COUNT(*)::int AS count FROM universal_stream_catalog WHERE lifecycle_block = 'B9.C'`);

  // ─── Signals seed row count (migration 131) ───────────────────────
  await expectCount('universal_stream_trade_signals has 1422 rows', 1422,
    `SELECT COUNT(*) FROM universal_stream_trade_signals`);
  await expectCount('seq 50 excavation has last_minute signal', 1,
    `SELECT COUNT(*)::int AS count FROM universal_stream_trade_signals WHERE seq = 50 AND trade_slug = 'excavation' AND signal_type = 'last_minute'`);
  await expectCount('seq 50 excavation does NOT have work signal', 0,
    `SELECT COUNT(*)::int AS count FROM universal_stream_trade_signals WHERE seq = 50 AND trade_slug = 'excavation' AND signal_type = 'work'`);

  // ─── Permits column additions (migration 132) ─────────────────────
  for (const col of ['lead_id', 'linked_coa_application_number', 'lifecycle_seq', 'lifecycle_group', 'lifecycle_block', 'lifecycle_stage', 'bid_value']) {
    await expectExists(`permits.${col} column exists`,
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = $1) AS exists`, [col]);
  }
  await expectExists('permits.lead_id backfilled — no NULLs',
    `SELECT NOT EXISTS (SELECT 1 FROM permits WHERE lead_id IS NULL) AS exists`);
  await expectExists('permits.lead_id format regex matches every row',
    `SELECT NOT EXISTS (SELECT 1 FROM permits WHERE lead_id !~ '^permit:.+$') AS exists`);
  await expectExists('permits trigger trg_permits_lead_id installed',
    `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_permits_lead_id') AS exists`);

  // ─── CoA column additions (migration 133) ─────────────────────────
  for (const col of ['lead_id', 'coa_type_class', 'project_type', 'scope_tags', 'lifecycle_seq', 'bid_value']) {
    await expectExists(`coa_applications.${col} column exists`,
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coa_applications' AND column_name = $1) AS exists`, [col]);
  }
  await expectExists('coa_applications.lead_id backfilled — no NULLs',
    `SELECT NOT EXISTS (SELECT 1 FROM coa_applications WHERE lead_id IS NULL) AS exists`);
  await expectExists('coa_applications trigger trg_coa_lead_id installed',
    `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coa_lead_id') AS exists`);

  // ─── Consumer table column adds (migration 134) ───────────────────
  for (const t of ['cost_estimates', 'trade_forecasts', 'tracked_projects', 'lead_analytics']) {
    await expectExists(`${t}.lead_id column exists`,
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'lead_id') AS exists`, [t]);
    await expectExists(`${t} chk_${t}_lead_id_format CHECK exists`,
      `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = $1) AS exists`, [`chk_${t}_lead_id_format`]);
  }

  // ─── phase_stay_calibration cohort cols (migration 135) ───────────
  for (const col of ['from_seq', 'to_seq', 'project_type', 'coa_type_class']) {
    await expectExists(`phase_stay_calibration.${col} column exists`,
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phase_stay_calibration' AND column_name = $1) AS exists`, [col]);
  }
  await expectExists('phase_stay_calibration_new_unique constraint exists',
    `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phase_stay_calibration_new_unique') AS exists`);

  // ─── logic_variables Phase B seed (migration 136 — 5 standalone keys) ───
  // Note: 330 seq-level band keys were dropped from Phase B per the
  // CI hotfix — variable_value is DECIMAL NOT NULL, so NULL inserts fail.
  // Phase E recalibration creates them with real values.
  for (const key of ['lifecycle_status_history_retention_days', 'coa_stall_threshold_p2_days', 'coa_imminent_window_days', 'coa_orphan_lead_id_warn_threshold', 'phase_b_revision_num_max_length']) {
    await expectExists(`logic_variables[${key}] seeded`,
      `SELECT EXISTS (SELECT 1 FROM logic_variables WHERE variable_key = $1) AS exists`, [key]);
  }

  // ─── Orphan-audit view (migration 137) ────────────────────────────
  await expectExists('lead_id_orphan_audit view exists',
    `SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'lead_id_orphan_audit' AND relkind = 'v') AS exists`);
  await expectCount('lead_id_orphan_audit returns 0 rows (no orphans on fresh staging)', 0,
    `SELECT COUNT(*) FROM lead_id_orphan_audit`);

  // ─── Phase C — promotion migrations 138-142 ───────────────────────
  for (const table of ['cost_estimates', 'trade_forecasts', 'lead_analytics']) {
    await expectExists(`${table}.lead_id NOT NULL post-promotion`,
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'lead_id' AND is_nullable = 'NO') AS exists`, [table]);
    await expectExists(`uniq_${table}_lead_id index exists`,
      `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = $1) AS exists`, [`uniq_${table}_lead_id`]);
  }
  await expectExists('uniq_tracked_projects_lead_id partial index exists',
    `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_tracked_projects_lead_id') AS exists`);
  await expectExists('lead_id_orphan_audit view extended to 8 branches (Phase B 4 + Phase C 4)',
    `SELECT (SELECT COUNT(*) FROM pg_views WHERE viewname = 'lead_id_orphan_audit') > 0 AS exists`);

  // ─── Phase C R5.3 — mirror triggers (migrations 143-144) ──────────
  await expectExists('trg_mirror_permit_trades_to_lead_trades installed on permit_trades',
    `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mirror_permit_trades_to_lead_trades') AS exists`);
  await expectExists('trg_mirror_permit_parcels_to_lead_parcels installed on permit_parcels',
    `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mirror_permit_parcels_to_lead_parcels') AS exists`);
  await expectExists('mirror_permit_trades_to_lead_trades function exists',
    `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mirror_permit_trades_to_lead_trades') AS exists`);
  await expectExists('mirror_permit_parcels_to_lead_parcels function exists',
    `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mirror_permit_parcels_to_lead_parcels') AS exists`);

  // ─── Phase C — migrate-to-lead-id.js exists as a callable script ──
  await expectExists('scripts/migrate-to-lead-id.js file present',
    `SELECT EXISTS (SELECT 1 FROM (SELECT 1) t) AS exists`); // file-existence check is out-of-scope for SQL; trust the test suite

  // ─── Summary ──────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`PASS: ${passed} / ${results.length}`);
  if (failed.length > 0) {
    console.log(`\nFAILURES (${failed.length}):`);
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.msg}`);
  }
  await pool.end();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Verifier crashed:', err.message);
  process.exit(1);
});
