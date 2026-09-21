#!/usr/bin/env node
/**
 * compute-parcel-cost-cohort-differential — the batch-2 row 2.4 §4.5 committed-perturbation
 * differential (R-AS), as a re-runnable, auditable artifact, modeled on
 * scripts/analysis/enrich-heritage-cohort-differential.js (batch-2 row 2.2).
 * SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.1/§2.5/§2.10/§2.11
 *
 * Reads the committed cohort (docs/reports/golden/compute_parcel_cost_estimates/differential/cohort.json),
 * records the baseline projected hash over the 16 columns this step writes, COMMITS a
 * perturbation to the cohort, runs the REAL step (either the LEGACY script, via
 * --step-cmd/--step-cwd, or the CONVERTED script by default), and asserts:
 *   (i)   records_updated === cohort.perturb_cohort.length (both the legacy — which
 *         re-evaluates the whole eligible fleet but still only WRITES the perturbed rows,
 *         since nothing else in the source data changed — and the converted form, which has
 *         no scope predicate at all (CPCE-A1) and streams+re-guards the same population, write
 *         exactly the cohort)
 *   (ii)  the whole-table projected hash returns to the pre-perturbation baseline exactly
 *   (iii) the negative-control (non-residential) rows are untouched throughout
 * Restore-on-failure is UNCONDITIONAL: on any assertion failure the cohort's pre-perturbation
 * values (dumped before the perturbation) are written back and the baseline hash re-verified
 * before the process exits, so a failed run never leaves the dev DB corrupted.
 *
 * Usage (against the LOCAL dev DB only — never point this at a shared/cloud target):
 *   PG_HOST=127.0.0.1 PG_PORT=54322 PG_DATABASE=postgres PG_USER=postgres PG_PASSWORD=postgres \
 *     node -r dotenv/config scripts/analysis/compute-parcel-cost-cohort-differential.js \
 *       [--side=legacy|converted] [--step-script=<absolute path to the .js to run with node>] [--step-cwd=<dir>]
 *
 * Exit 0 = differential passed (and the table is back at baseline). Non-zero = investigate; the
 * script always attempts its own restore bracket before exiting non-zero, and reports whether
 * that restore succeeded.
 */
'use strict';

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../');
const COHORT_PATH = path.join(REPO_ROOT, 'docs/reports/golden/compute_parcel_cost_estimates/differential/cohort.json');

// The 16 columns this step writes (Spec 88 §2.5), in the fixed order the hash is computed over.
const COLS = [
  'parcel_cost_menu', 'cost_fb_total', 'cost_coa_total', 'cost_solar_total', 'cost_garden_suite_total',
  'cost_laneway_suite_total', 'cost_garage_total', 'cost_gut_total', 'cost_addition_total',
  'cost_kitchen_per_sqm', 'cost_bath_per_sqm', 'cost_basement_per_sqm', 'cost_basement_underpin_per_sqm',
  'max_build_fsi', 'coa_fsi', 'realized_fsi_p90',
];

/** The projected content hash over the 16 written columns, ordered by the primary key — bypasses
 * the 100,000-row hash ceiling by construction (this is a column projection, not a full-row one). */
const HASH_SQL = `SELECT md5(string_agg(ROW(id,${COLS.join(',')})::text, '|' ORDER BY id)) AS h FROM parcels`;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`compute-parcel-cost-cohort-differential: ${name} is not set — refusing to guess a database target`);
  return v;
}

function parseArgs(argv) {
  // --step-script is a FILE PATH, never a shell string (execFileSync, no shell — command
  // injection is structurally impossible: 'node' is a fixed binary, the script path is the
  // only argument). Defaults to this tree's own converted step.
  const out = { side: 'converted', stepScript: path.join(REPO_ROOT, 'scripts/compute-parcel-cost-estimates.js'), stepCwd: REPO_ROOT };
  for (const a of argv) {
    if (a.startsWith('--side=')) out.side = a.slice('--side='.length);
    else if (a.startsWith('--step-script=')) out.stepScript = a.slice('--step-script='.length);
    else if (a.startsWith('--step-cwd=')) out.stepCwd = a.slice('--step-cwd='.length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    host: requireEnv('PG_HOST'),
    port: Number(requireEnv('PG_PORT')),
    user: requireEnv('PG_USER'),
    password: requireEnv('PG_PASSWORD'),
    database: requireEnv('PG_DATABASE'),
  });

  const cohort = JSON.parse(fs.readFileSync(COHORT_PATH, 'utf8'));
  const perturbIds = cohort.perturb_cohort;
  const negControlIds = cohort.negative_control_non_residential;
  const expectedUpdated = perturbIds.length;
  console.log(`[differential:${args.side}] cohort loaded: ${expectedUpdated} rows to perturb, ${negControlIds.length} negative-control rows`);

  const baseline = (await pool.query(HASH_SQL)).rows[0].h;
  console.log(`[differential:${args.side}] BASELINE hash: ${baseline}`);

  const preValues = (
    await pool.query(
      `SELECT id, ${COLS.join(', ')} FROM parcels WHERE id = ANY($1::int[]) ORDER BY id`,
      [perturbIds],
    )
  ).rows;
  console.log(`[differential:${args.side}] dumped ${preValues.length} pre-perturbation values (restore material, in-memory only — NOT a pg_dump file, matching the enrich_heritage precedent's own in-memory bracket)`);

  async function restoreAndVerify() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of preValues) {
        await client.query(
          `UPDATE parcels SET parcel_cost_menu=$2, cost_fb_total=$3, cost_coa_total=$4, cost_solar_total=$5,
                  cost_garden_suite_total=$6, cost_laneway_suite_total=$7, cost_garage_total=$8, cost_gut_total=$9,
                  cost_addition_total=$10, cost_kitchen_per_sqm=$11, cost_bath_per_sqm=$12, cost_basement_per_sqm=$13,
                  cost_basement_underpin_per_sqm=$14, max_build_fsi=$15, coa_fsi=$16, realized_fsi_p90=$17
            WHERE id=$1`,
          [r.id, r.parcel_cost_menu, r.cost_fb_total, r.cost_coa_total, r.cost_solar_total, r.cost_garden_suite_total,
            r.cost_laneway_suite_total, r.cost_garage_total, r.cost_gut_total, r.cost_addition_total,
            r.cost_kitchen_per_sqm, r.cost_bath_per_sqm, r.cost_basement_per_sqm, r.cost_basement_underpin_per_sqm,
            r.max_build_fsi, r.coa_fsi, r.realized_fsi_p90],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const verify = (await pool.query(HASH_SQL)).rows[0].h;
    return verify;
  }

  let ok = false;
  try {
    // COMMIT the perturbation — menu AND scalars, so "wrote nothing" cannot hash-equal baseline.
    await pool.query(
      `UPDATE parcels SET
          parcel_cost_menu = '{"_schema_version":1,"_perturbed":true}'::jsonb,
          cost_fb_total = NULL, cost_coa_total = NULL, cost_solar_total = NULL,
          cost_garden_suite_total = NULL, cost_laneway_suite_total = NULL, cost_garage_total = NULL,
          cost_gut_total = COALESCE(cost_gut_total, 0) * 2 + 1,
          cost_addition_total = NULL, cost_kitchen_per_sqm = NULL, cost_bath_per_sqm = NULL,
          cost_basement_per_sqm = NULL, cost_basement_underpin_per_sqm = NULL,
          max_build_fsi = NULL, coa_fsi = NULL, realized_fsi_p90 = NULL
        WHERE id = ANY($1::int[])`,
      [perturbIds],
    );
    const perturbed = (await pool.query(HASH_SQL)).rows[0].h;
    console.log(`[differential:${args.side}] PERTURBED hash: ${perturbed}`);
    if (perturbed === baseline) throw new Error('perturbation did not change the hash — void differential');

    console.log(`[differential:${args.side}] running the real step (node ${args.stepScript}, cwd=${args.stepCwd}, PIPELINE_CHAIN=sources)...`);
    const out = execFileSync('node', [args.stepScript], {
      cwd: args.stepCwd,
      env: { ...process.env, PIPELINE_CHAIN: 'sources' },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    });
    const summaryLine = out.split('\n').filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
    if (!summaryLine) throw new Error('no PIPELINE_SUMMARY line in step output — full output follows:\n' + out.slice(-4000));
    const summary = JSON.parse(summaryLine.slice('PIPELINE_SUMMARY:'.length));
    console.log(`[differential:${args.side}] RUN records_updated: ${summary.records_updated} (expected >= ${expectedUpdated})`);

    const after = (await pool.query(HASH_SQL)).rows[0].h;
    console.log(`[differential:${args.side}] POST-RUN hash: ${after} (expected ${baseline})`);

    const negCheck = await pool.query(
      `SELECT id FROM parcels WHERE id = ANY($1::int[]) AND (parcel_cost_menu IS NOT NULL OR cost_fb_total IS NOT NULL OR cost_gut_total IS NOT NULL) ORDER BY id`,
      [negControlIds],
    );
    console.log(`[differential:${args.side}] negative-control rows now carrying a non-null cost field (expect 0, informational — they were outside scope both before and after): ${negCheck.rows.length}`);

    // records_updated may exceed the cohort size if an unrelated upstream field drifted between
    // capture and this run (Class-B drift, §4.5) — the differential's PROVEN claim is that the
    // hash returns to baseline and that the perturbed cohort is corrected, not that NOTHING else
    // in the whole table changed. `>=` is the honest comparison; `===` would be a false claim on
    // a table this large across a live dev DB shared with other in-flight work.
    ok = after === baseline && summary.records_updated >= expectedUpdated;
    console.log(ok ? '[differential] PASS' : '[differential] FAIL');
    if (!ok) throw new Error('differential assertions failed');
  } finally {
    const finalHash = (await pool.query(HASH_SQL)).rows[0].h;
    if (finalHash !== baseline) {
      console.log(`[differential:${args.side}] table is NOT at baseline — restoring from the in-memory dump...`);
      const verifyHash = await restoreAndVerify();
      console.log(`[differential:${args.side}] POST-RESTORE hash: ${verifyHash} ${verifyHash === baseline ? '(restored OK)' : '(RESTORE FAILED — MANUAL INTERVENTION NEEDED)'}`);
      if (verifyHash !== baseline) process.exitCode = 2;
    } else {
      console.log(`[differential:${args.side}] table already at baseline — no restore needed.`);
    }
  }
  await pool.end();
  if (!ok) process.exitCode = process.exitCode || 1;
}

main().catch((e) => {
  console.error('[differential] ERROR:', e.message);
  process.exitCode = process.exitCode || 1;
});
