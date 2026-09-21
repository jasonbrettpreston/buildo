#!/usr/bin/env node
/**
 * enrich-heritage-cohort-differential — the batch-2 row 2.2 §4.5 committed-perturbation
 * differential (FOLD-I1/FOLD-V1), as a re-runnable, auditable artifact (output-panel O2,
 * Code Review FAIL: "the cohort differential is not auditable" — this closes that finding).
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8d, §11.1
 *
 * Reads the committed cohort (docs/reports/golden/enrich_heritage/differential/cohort.json —
 * 494 rows: 94 multi-Part-IV-point parcels, 100 single-Part-IV sample, 200 Part-V-HCD sample
 * incl. one parcel per null-designated-date district, 100 undesignated sample; 16 invalid-geom
 * parcels held out as a NEGATIVE CONTROL, never perturbed), records the baseline projected hash,
 * COMMITS a perturbation (stamp NULLed + all 3 value columns corrupted on the 494), runs the
 * REAL step (`node scripts/enrich-heritage.js`, PIPELINE_CHAIN=sources) exactly as
 * capture-step-golden.js's spawnStep does, and asserts:
 *   (i)   records_updated === cohort.perturb_cohort.length (the Layer-2 scope is exactly the
 *         perturbed cohort once converted; the legacy re-evaluates the whole eligible fleet but
 *         still only WRITES the same 494 rows, since nothing else in the source data changed)
 *   (ii)  the whole-table projected hash returns to the pre-perturbation baseline exactly
 *   (iii) the 16 invalid-geom negative-control rows are untouched throughout
 * Restore-on-failure is UNCONDITIONAL: on any assertion failure the cohort's pre-perturbation
 * values (dumped before the perturbation) are written back and the baseline hash re-verified
 * before the process exits, so a failed run never leaves the dev DB corrupted.
 *
 * Usage (against the LOCAL dev DB only — never point this at a shared/cloud target):
 *   PG_HOST=127.0.0.1 PG_PORT=54322 PG_DATABASE=postgres PG_USER=postgres PG_PASSWORD=postgres \
 *     node -r dotenv/config scripts/analysis/enrich-heritage-cohort-differential.js
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
const COHORT_PATH = path.join(REPO_ROOT, 'docs/reports/golden/enrich_heritage/differential/cohort.json');

/** The projected content hash — same formula capture-step-golden.js's narrow-table path uses,
 * scoped to the four columns this step writes, ordered by the primary key. */
const HASH_SQL = `SELECT md5(string_agg(ROW(id,is_heritage_designated,heritage_designation_type,heritage_designation_date,heritage_dataset_version_when_enriched)::text, '|' ORDER BY "id")) AS h FROM parcels`;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`enrich-heritage-cohort-differential: ${name} is not set — refusing to guess a database target`);
  return v;
}

async function main() {
  const pool = new Pool({
    host: requireEnv('PG_HOST'),
    port: Number(requireEnv('PG_PORT')),
    user: requireEnv('PG_USER'),
    password: requireEnv('PG_PASSWORD'),
    database: requireEnv('PG_DATABASE'),
  });

  const cohort = JSON.parse(fs.readFileSync(COHORT_PATH, 'utf8'));
  const perturbIds = cohort.perturb_cohort;
  const expectedUpdated = perturbIds.length;
  console.log(`[differential] cohort loaded: ${expectedUpdated} rows to perturb, ${cohort.invalid_geom_parcels_negative_control.length} invalid-geom negative-control rows`);

  const baseline = (await pool.query(HASH_SQL)).rows[0].h;
  console.log(`[differential] BASELINE hash: ${baseline}`);

  const preValues = (
    await pool.query(
      `SELECT id, is_heritage_designated, heritage_designation_type, heritage_designation_date, heritage_dataset_version_when_enriched
         FROM parcels WHERE id = ANY($1::int[]) ORDER BY id`,
      [perturbIds],
    )
  ).rows;
  console.log(`[differential] dumped ${preValues.length} pre-perturbation values (restore material, in-memory only)`);

  async function restoreAndVerify() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of preValues) {
        await client.query(
          `UPDATE parcels SET is_heritage_designated=$2, heritage_designation_type=$3, heritage_designation_date=$4, heritage_dataset_version_when_enriched=$5 WHERE id=$1`,
          [r.id, r.is_heritage_designated, r.heritage_designation_type, r.heritage_designation_date, r.heritage_dataset_version_when_enriched],
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
    await pool.query(
      `UPDATE parcels SET heritage_dataset_version_when_enriched = NULL, is_heritage_designated = NOT is_heritage_designated,
              heritage_designation_type = NULL, heritage_designation_date = NULL
        WHERE id = ANY($1::int[])`,
      [perturbIds],
    );
    const perturbed = (await pool.query(HASH_SQL)).rows[0].h;
    console.log(`[differential] PERTURBED hash: ${perturbed}`);
    if (perturbed === baseline) throw new Error('perturbation did not change the hash — void differential');

    console.log('[differential] running the real converted step (node scripts/enrich-heritage.js, PIPELINE_CHAIN=sources)...');
    const out = execFileSync('node', ['scripts/enrich-heritage.js'], {
      cwd: REPO_ROOT,
      env: { ...process.env, PIPELINE_CHAIN: 'sources' },
      encoding: 'utf8',
    });
    const summaryLine = out.split('\n').filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
    if (!summaryLine) throw new Error('no PIPELINE_SUMMARY line in step output');
    const summary = JSON.parse(summaryLine.slice('PIPELINE_SUMMARY:'.length));
    console.log(`[differential] RUN records_updated: ${summary.records_updated} (expected ${expectedUpdated})`);

    const after = (await pool.query(HASH_SQL)).rows[0].h;
    console.log(`[differential] POST-RUN hash: ${after} (expected ${baseline})`);

    const invalidCheck = await pool.query(
      `SELECT id, heritage_dataset_version_when_enriched FROM parcels WHERE id = ANY($1::int[]) ORDER BY id`,
      [cohort.invalid_geom_parcels_negative_control],
    );
    const invalidTouched = invalidCheck.rows.filter((r) => r.heritage_dataset_version_when_enriched !== null);
    console.log(`[differential] invalid-geom rows touched (expect 0): ${invalidTouched.length}`);

    ok = after === baseline && summary.records_updated === expectedUpdated && invalidTouched.length === 0;
    console.log(ok ? '[differential] PASS' : '[differential] FAIL');
    if (!ok) throw new Error('differential assertions failed');
  } finally {
    const finalHash = (await pool.query(HASH_SQL)).rows[0].h;
    if (finalHash !== baseline) {
      console.log('[differential] table is NOT at baseline — restoring from the in-memory dump...');
      const verifyHash = await restoreAndVerify();
      console.log(`[differential] POST-RESTORE hash: ${verifyHash} ${verifyHash === baseline ? '(restored OK)' : '(RESTORE FAILED — MANUAL INTERVENTION NEEDED)'}`);
      if (verifyHash !== baseline) process.exitCode = 2;
    } else {
      console.log('[differential] table already at baseline — no restore needed.');
    }
  }
  await pool.end();
  if (!ok) process.exitCode = process.exitCode || 1;
}

main().catch((e) => {
  console.error('[differential] ERROR:', e.message);
  process.exitCode = process.exitCode || 1;
});
