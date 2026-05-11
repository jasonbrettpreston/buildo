#!/usr/bin/env node
// One-off fixture capture for WF1 #C R3.
// Emits 3 JSON fixtures from the live DB:
//   1. Terminal (P18 with rich transition history)
//   2. Mid-pipeline (P10/P11/P12 with cohort data)
//   3. Off-canonical-path (84-W11 surface — e.g. New Houses at O1/O2/O3)
//
// Output files: src/tests/fixtures/lifecycle-timeline-*.fixture.json
//
// Not registered in manifest.json — purely operator-invoked for R3 setup.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Load .env exactly the way pipeline SDK does — manual parse for both
// scripts/ and src/lib/ at startup.
const envPath = path.resolve(__dirname, '..', '..', '.env');
const env = fs.readFileSync(envPath, 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

const { Pool } = require('pg');
// Use the same PG_ prefix scheme as scripts/lib/pipeline.js — `new Pool()`
// without args looks at PGHOST/PGUSER which this codebase does not set.
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});
const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'src', 'tests', 'fixtures');
if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });

async function findCandidate(category) {
  if (category === 'terminal') {
    const r = await pool.query(`
      SELECT p.permit_num, p.revision_num, p.permit_type, p.lifecycle_phase, p.phase_started_at,
        (SELECT COUNT(*) FROM permit_phase_transitions t
         WHERE t.permit_num=p.permit_num AND t.revision_num=p.revision_num) AS tx_count
      FROM permits p
      WHERE p.lifecycle_phase = 'P18'
        AND p.permit_type IN ('New Building','Building Additions/Alterations','New Houses','Residential Building Permit')
      ORDER BY tx_count DESC LIMIT 1`);
    return r.rows[0];
  }
  if (category === 'mid-pipeline') {
    // Relax cohort + phase filters — any phase ∈ P9-P14 with some cohort
    // data + non-terminal status works for the fixture demonstration.
    const r = await pool.query(`
      SELECT p.permit_num, p.revision_num, p.permit_type, p.lifecycle_phase, p.phase_started_at,
        (SELECT COUNT(*) FROM permit_phase_transitions t
         WHERE t.permit_num=p.permit_num AND t.revision_num=p.revision_num) AS tx_count,
        psc.sample_size AS cohort_n
      FROM permits p
      LEFT JOIN phase_stay_calibration psc ON psc.permit_type=p.permit_type AND psc.phase=p.lifecycle_phase
      WHERE p.lifecycle_phase IN ('P9','P10','P11','P12','P13','P14')
        AND p.permit_type IN ('New Building','Building Additions/Alterations','New Houses','Residential Building Permit')
      ORDER BY (psc.sample_size IS NULL), psc.sample_size DESC NULLS LAST, tx_count DESC
      LIMIT 1`);
    return r.rows[0];
  }
  if (category === 'off-path') {
    const r = await pool.query(`
      SELECT p.permit_num, p.revision_num, p.permit_type, p.lifecycle_phase, p.phase_started_at,
        (SELECT COUNT(*) FROM permit_phase_transitions t
         WHERE t.permit_num=p.permit_num AND t.revision_num=p.revision_num) AS tx_count
      FROM permits p
      WHERE p.permit_type IN ('New Building','New Houses','Building Additions/Alterations','Residential Building Permit')
        AND p.lifecycle_phase IN ('O1','O2','O3')
      ORDER BY tx_count DESC LIMIT 1`);
    return r.rows[0];
  }
  throw new Error(`unknown category: ${category}`);
}

async function captureTimeline(permitNum, revisionNum) {
  const transitions = await pool.query(`
    SELECT from_phase, to_phase, transitioned_at
    FROM permit_phase_transitions
    WHERE permit_num = $1 AND revision_num = $2
    ORDER BY transitioned_at ASC`,
    [permitNum, revisionNum]);

  const permit = await pool.query(`
    SELECT permit_num, revision_num, permit_type, lifecycle_phase, phase_started_at,
      lifecycle_stalled, lifecycle_classified_at
    FROM permits WHERE permit_num = $1 AND revision_num = $2`,
    [permitNum, revisionNum]);

  const p = permit.rows[0];

  const calibration = await pool.query(`
    SELECT phase, median_days, p25_days, p75_days, sample_size, computed_at
    FROM phase_stay_calibration
    WHERE permit_type = $1`,
    [p.permit_type]);

  return {
    permit_num: p.permit_num,
    revision_num: p.revision_num,
    permit_type: p.permit_type,
    lifecycle_phase: p.lifecycle_phase,
    lifecycle_stalled: p.lifecycle_stalled,
    phase_started_at: p.phase_started_at?.toISOString?.() ?? p.phase_started_at,
    lifecycle_classified_at: p.lifecycle_classified_at?.toISOString?.() ?? p.lifecycle_classified_at,
    transitions: transitions.rows.map((t) => ({
      from_phase: t.from_phase,
      to_phase: t.to_phase,
      transitioned_at: t.transitioned_at?.toISOString?.() ?? t.transitioned_at,
    })),
    calibration: calibration.rows.map((c) => ({
      phase: c.phase,
      median_days: c.median_days,
      p25_days: c.p25_days,
      p75_days: c.p75_days,
      sample_size: c.sample_size,
    })),
  };
}

(async () => {
  const categories = ['terminal', 'mid-pipeline', 'off-path'];
  for (const cat of categories) {
    const candidate = await findCandidate(cat);
    if (!candidate) {
      console.error(`No candidate for ${cat}`);
      continue;
    }
    console.log(`${cat}: ${candidate.permit_num} rev ${candidate.revision_num} (${candidate.permit_type}, phase=${candidate.lifecycle_phase}, ${candidate.tx_count} transitions)`);
    const fixture = await captureTimeline(candidate.permit_num, candidate.revision_num);
    const filePath = path.join(FIXTURES_DIR, `lifecycle-timeline-${cat}.fixture.json`);
    fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2) + '\n');
    console.log(`  → ${path.relative(path.resolve(__dirname, '..', '..'), filePath)}`);
  }
  await pool.end();
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
