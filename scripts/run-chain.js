#!/usr/bin/env node
/**
 * Pipeline Chain Orchestrator
 *
 * Runs a sequence of pipeline scripts in order, tracking each step and
 * the overall chain in the pipeline_runs table. Stops on first failure.
 *
 * Usage: node scripts/run-chain.js <chain_id>
 *   chain_id: permits | coa | sources
 *
 * Example: node scripts/run-chain.js permits
 */
const { Pool } = require('pg');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

// ---------------------------------------------------------------------------
// Chain definitions — mirrors PIPELINE_CHAINS in FreshnessTimeline.tsx
// ---------------------------------------------------------------------------

const CHAINS = {
  permits: [
    'permits',
    'classify_scope_class',
    'classify_scope_tags',
    'classify_permits',
    'builders',
    'enrich_google',
    'enrich_wsib',
    'geocode_permits',
    'link_parcels',
    'link_neighbourhoods',
    'link_massing',
    'link_similar',
    'link_coa',
    'refresh_snapshot',
  ],
  coa: [
    'coa',
    'link_coa',
    'create_pre_permits',
    'refresh_snapshot',
  ],
  sources: [
    'address_points',
    'geocode_permits',
    'parcels',
    'compute_centroids',
    'link_parcels',
    'massing',
    'link_massing',
    'neighbourhoods',
    'link_neighbourhoods',
    'refresh_snapshot',
  ],
};

// ---------------------------------------------------------------------------
// Slug → script path — mirrors PIPELINE_SCRIPTS in route.ts
// ---------------------------------------------------------------------------

const PIPELINE_SCRIPTS = {
  permits:              'scripts/load-permits.js',
  coa:                  'scripts/load-coa.js',
  builders:             'scripts/extract-builders.js',
  address_points:       'scripts/load-address-points.js',
  parcels:              'scripts/load-parcels.js',
  massing:              'scripts/load-massing.js',
  neighbourhoods:       'scripts/load-neighbourhoods.js',
  geocode_permits:      'scripts/geocode-permits.js',
  link_parcels:         'scripts/link-parcels.js',
  link_neighbourhoods:  'scripts/link-neighbourhoods.js',
  link_massing:         'scripts/link-massing.js',
  link_coa:             'scripts/link-coa.js',
  enrich_google:        'scripts/enrich-builders.js',
  enrich_wsib:          'scripts/enrich-wsib.js',
  classify_scope_class: 'scripts/classify-scope.js',
  classify_scope_tags:  'scripts/classify-scope.js',
  classify_permits:     'scripts/classify-permits.js',
  compute_centroids:    'scripts/compute-centroids.js',
  link_similar:         'scripts/link-similar.js',
  create_pre_permits:   'scripts/create-pre-permits.js',
  refresh_snapshot:     'scripts/refresh-snapshot.js',
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const chainId = process.argv[2];
  if (!chainId || !CHAINS[chainId]) {
    console.error(`Usage: node scripts/run-chain.js <chain_id>`);
    console.error(`  Available chains: ${Object.keys(CHAINS).join(', ')}`);
    process.exit(1);
  }

  const steps = CHAINS[chainId];
  const chainSlug = `chain_${chainId}`;
  const projectRoot = path.resolve(__dirname, '..');

  console.log(`\n=== Chain: ${chainId} (${steps.length} steps) ===\n`);

  // Insert parent chain tracking row
  let chainRunId = null;
  const chainStart = Date.now();
  try {
    const res = await pool.query(
      `INSERT INTO pipeline_runs (pipeline, started_at, status)
       VALUES ($1, NOW(), 'running')
       RETURNING id`,
      [chainSlug]
    );
    chainRunId = res.rows[0].id;
  } catch (err) {
    console.warn('Could not insert chain tracking row:', err.message);
  }

  let failedStep = null;

  for (let i = 0; i < steps.length; i++) {
    const slug = steps[i];
    const scriptRelPath = PIPELINE_SCRIPTS[slug];
    if (!scriptRelPath) {
      console.error(`  No script mapping for slug: ${slug}`);
      failedStep = slug;
      break;
    }

    const scriptPath = path.resolve(projectRoot, scriptRelPath);
    if (!fs.existsSync(scriptPath)) {
      console.error(`  Script not found: ${scriptRelPath}`);
      failedStep = slug;
      break;
    }

    const stepLabel = `[${i + 1}/${steps.length}] ${slug}`;
    console.log(`${stepLabel} — starting...`);

    // Insert step tracking row
    let stepRunId = null;
    const stepStart = Date.now();
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running')
         RETURNING id`,
        [slug]
      );
      stepRunId = res.rows[0].id;
    } catch (err) {
      console.warn(`  Could not insert step tracking row: ${err.message}`);
    }

    try {
      execFileSync('node', [scriptPath], {
        env: process.env,
        stdio: 'inherit',
        // No per-step timeout — heavy scripts (link_massing, link_coa) can
        // take 30-120 min depending on data volume. The API route applies
        // its own overall timeout when triggering chains remotely.
      });

      const durationMs = Date.now() - stepStart;
      console.log(`${stepLabel} — completed (${(durationMs / 1000).toFixed(1)}s)\n`);

      if (stepRunId) {
        await pool.query(
          `UPDATE pipeline_runs
           SET completed_at = NOW(), status = 'completed', duration_ms = $1
           WHERE id = $2`,
          [durationMs, stepRunId]
        ).catch(() => {});
      }
    } catch (err) {
      const durationMs = Date.now() - stepStart;
      const errorMsg = (err.stderr || err.message || String(err)).slice(0, 4000);
      console.error(`${stepLabel} — FAILED (${(durationMs / 1000).toFixed(1)}s)`);
      console.error(`  Error: ${errorMsg.slice(0, 200)}\n`);

      if (stepRunId) {
        await pool.query(
          `UPDATE pipeline_runs
           SET completed_at = NOW(), status = 'failed', duration_ms = $1, error_message = $2
           WHERE id = $3`,
          [durationMs, errorMsg, stepRunId]
        ).catch(() => {});
      }

      failedStep = slug;
      break;
    }
  }

  // Update parent chain row
  const chainDurationMs = Date.now() - chainStart;
  const chainStatus = failedStep ? 'failed' : 'completed';
  const chainError = failedStep ? `Stopped at step: ${failedStep}` : null;

  if (chainRunId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3
       WHERE id = $4`,
      [chainStatus, chainDurationMs, chainError, chainRunId]
    ).catch(() => {});
  }

  console.log(`=== Chain ${chainId}: ${chainStatus} (${(chainDurationMs / 1000).toFixed(1)}s) ===`);
  if (failedStep) {
    console.error(`Chain stopped at step: ${failedStep}`);
  }

  await pool.end();

  if (failedStep) process.exit(1);
}

run().catch((err) => {
  console.error('Chain orchestrator error:', err);
  pool.end().catch(() => {});
  process.exit(1);
});
