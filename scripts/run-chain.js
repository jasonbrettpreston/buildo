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
    'assert_schema',
    'permits',
    'classify_scope_class',
    'classify_scope_tags',
    'classify_permits',
    'builders',
    'link_wsib',
    'geocode_permits',
    'link_parcels',
    'link_neighbourhoods',
    'link_massing',
    'link_similar',
    'link_coa',
    'refresh_snapshot',
    'assert_data_bounds',
  ],
  coa: [
    'assert_schema',
    'coa',
    'link_coa',
    'create_pre_permits',
    'refresh_snapshot',
    'assert_data_bounds',
  ],
  sources: [
    'assert_schema',
    'address_points',
    'geocode_permits',
    'parcels',
    'compute_centroids',
    'link_parcels',
    'massing',
    'link_massing',
    'neighbourhoods',
    'link_neighbourhoods',
    'load_wsib',
    'link_wsib',
    'refresh_snapshot',
    'assert_data_bounds',
  ],
  entities: [
    'enrich_wsib_builders',
    'enrich_named_builders',
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
  enrich_wsib_builders: 'scripts/enrich-web-search.js',
  enrich_named_builders:'scripts/enrich-web-search.js',
  load_wsib:            'scripts/load-wsib.js',
  link_wsib:            'scripts/link-wsib.js',
  classify_scope_class: 'scripts/classify-scope.js',
  classify_scope_tags:  'scripts/classify-scope.js',
  classify_permits:     'scripts/classify-permits.js',
  compute_centroids:    'scripts/compute-centroids.js',
  link_similar:         'scripts/link-similar.js',
  create_pre_permits:   'scripts/create-pre-permits.js',
  refresh_snapshot:     'scripts/refresh-snapshot.js',
  assert_schema:        'scripts/quality/assert-schema.js',
  assert_data_bounds:   'scripts/quality/assert-data-bounds.js',
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

  // Use pre-created run ID from the API trigger (argv[3]) to avoid a duplicate
  // INSERT and ensure the row exists before the first UI poll.
  // Falls back to inserting its own row when run standalone (no argv[3]).
  let chainRunId = null;
  const chainStart = Date.now();
  const externalRunId = process.argv[3] ? parseInt(process.argv[3], 10) : null;
  if (externalRunId) {
    chainRunId = externalRunId;
    console.log(`Using pre-created pipeline_runs row: ${chainRunId}`);
  } else {
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
  }

  // Pre-fetch enabled/disabled state for all pipeline steps
  const disabledSlugs = new Set();
  try {
    const res = await pool.query(
      `SELECT pipeline FROM pipeline_schedules WHERE enabled = FALSE`
    );
    for (const row of res.rows) disabledSlugs.add(row.pipeline);
  } catch {
    // pipeline_schedules may not have enabled column yet — treat all as enabled
  }

  let failedStep = null;

  for (let i = 0; i < steps.length; i++) {
    const slug = steps[i];
    const stepLabel = `[${i + 1}/${steps.length}] ${slug}`;

    // Check if chain was cancelled between steps
    if (chainRunId) {
      try {
        const statusCheck = await pool.query(
          `SELECT status FROM pipeline_runs WHERE id = $1`,
          [chainRunId]
        );
        if (statusCheck.rows[0]?.status === 'cancelled') {
          console.log(`\nChain cancelled by user — stopping before ${slug}`);
          failedStep = slug;
          break;
        }
      } catch { /* non-fatal — continue if check fails */ }
    }

    // Skip disabled steps
    if (disabledSlugs.has(slug)) {
      console.log(`${stepLabel} — SKIPPED (disabled)`);
      const scopedSlug = `${chainId}:${slug}`;
      try {
        await pool.query(
          `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, duration_ms)
           VALUES ($1, NOW(), NOW(), 'skipped', 0)`,
          [scopedSlug]
        );
      } catch {
        // Non-fatal — skip tracking if table unavailable
      }
      continue;
    }

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

    console.log(`${stepLabel} — starting...`);

    // Insert step tracking row — scoped to chain (e.g. permits:assert_schema)
    // so status doesn't bleed across chains that share the same step slug.
    const scopedSlug = `${chainId}:${slug}`;
    let stepRunId = null;
    const stepStart = Date.now();
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running')
         RETURNING id`,
        [scopedSlug]
      );
      stepRunId = res.rows[0].id;
    } catch (err) {
      console.warn(`  Could not insert step tracking row: ${err.message}`);
    }

    try {
      const stepEnv = { ...process.env, PIPELINE_CHAIN: chainId };
      // Sources chain reloads massing data, so link_massing needs a full rescan.
      // Permits chain only has new permits — incremental (default) is sufficient.
      if (slug === 'link_massing' && chainId === 'sources') {
        stepEnv.LINK_MASSING_FULL = '1';
      }
      if (slug === 'enrich_wsib_builders') {
        stepEnv.ENRICH_WSIB_ONLY = '1';
      }
      if (slug === 'enrich_named_builders') {
        stepEnv.ENRICH_UNMATCHED_ONLY = '1';
      }
      const stdout = execFileSync('node', [scriptPath], {
        env: stepEnv,
        stdio: ['inherit', 'pipe', 'inherit'],
        maxBuffer: 50 * 1024 * 1024,
      });

      // Tee stdout to console so logs still appear
      const output = stdout.toString('utf-8');
      if (output) process.stdout.write(output);

      // Parse PIPELINE_SUMMARY line for record counts
      let recordsTotal = null;
      let recordsNew = null;
      let recordsUpdated = null;
      const summaryMatch = output.match(/PIPELINE_SUMMARY:(.+)/);
      if (summaryMatch) {
        try {
          const summary = JSON.parse(summaryMatch[1]);
          recordsTotal = summary.records_total ?? null;
          recordsNew = summary.records_new ?? null;
          recordsUpdated = summary.records_updated ?? null;
        } catch { /* malformed summary — ignore */ }
      }

      const durationMs = Date.now() - stepStart;
      console.log(`${stepLabel} — completed (${(durationMs / 1000).toFixed(1)}s)\n`);

      if (stepRunId) {
        await pool.query(
          `UPDATE pipeline_runs
           SET completed_at = NOW(), status = 'completed', duration_ms = $1,
               records_total = COALESCE($3, records_total),
               records_new = COALESCE($4, records_new),
               records_updated = COALESCE($5, records_updated)
           WHERE id = $2`,
          [durationMs, stepRunId, recordsTotal, recordsNew, recordsUpdated]
        ).catch(() => {});
      }
    } catch (err) {
      // Tee any captured stdout from the failed step so progress logs aren't lost
      if (err.stdout) process.stdout.write(err.stdout);
      const durationMs = Date.now() - stepStart;
      const errorMsg = (err.message || String(err)).slice(0, 4000);
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
