#!/usr/bin/env node
'use strict';
/**
 * One-time grounder: captures REAL `last_measured` values for the 8
 * assert_parcel_sanity distribution plausibility entries (Fold A-1/A-4e/B-1 —
 * a >=5-timings median, never a single sample) against the live local DB.
 * Writes scripts/quality/generated/assert-parcel-sanity.dist-measured.json, consumed by
 * scripts/generate-assert-parcel-sanity-descriptor.js.
 *
 * Usage: node -r dotenv/config scripts/one-time/measure-assert-parcel-sanity-distribution.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createResolvedPool } = require('../lib/resolve-db');
const { RES, ZC, DIST_DEFS, LOGIC_VAR_DEFS } = require('../lib/assert-parcel-sanity-fields');
const { buildDistributionQuery } = require('../lib/step/plausibility');

const OUT = path.join(__dirname, '..', 'quality', 'generated', 'assert-parcel-sanity.dist-measured.json');
const SAMPLE_N = 5;

async function main() {
  const pool = createResolvedPool({ label: 'measure-assert-parcel-sanity-distribution' });
  const commit = execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..', '..') }).toString().trim();
  const at = new Date().toISOString();
  const out = {};
  for (const d of DIST_DEFS) {
    const sql = buildDistributionQuery(RES, ZC, d);
    const timings = [];
    let lastRow = null;
    for (let i = 0; i < SAMPLE_N; i++) {
      const start = Date.now();
      const res = await pool.query(sql);
      timings.push(Date.now() - start);
      lastRow = res.rows[0];
    }
    timings.sort((a, b) => a - b);
    const median = timings[Math.floor(timings.length / 2)];
    out[d.id] = {
      value: { viol: lastRow.viol, worst: lastRow.worst },
      at,
      commit,
      cost_ms: median,
      sample_n: SAMPLE_N,
      source_run: { run_id: null, chain: null, event: 'manual_measurement' },
    };
    console.log(`${d.id}: viol=${lastRow.viol} worst=${lastRow.worst} median_ms=${median} (single-session, n=${SAMPLE_N})`);
  }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
