#!/usr/bin/env node
/**
 * Pipeline Chain Orchestrator
 *
 * Runs a sequence of pipeline scripts in order, tracking each step and
 * the overall chain in the pipeline_runs table. Stops on first failure.
 *
 * Usage: node scripts/run-chain.js <chain_id>
 *   chain_id: permits | coa | sources | entities
 *
 * Example: node scripts/run-chain.js permits
 */
const pipeline = require('./lib/pipeline');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Pipeline Manifest — single source of truth (§9.6)
// ---------------------------------------------------------------------------

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'manifest.json'), 'utf-8')
);

const CHAINS = manifest.chains;

// Build slug → script path map from manifest
const PIPELINE_SCRIPTS = {};
for (const [slug, entry] of Object.entries(manifest.scripts)) {
  PIPELINE_SCRIPTS[slug] = entry.file;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const pool = pipeline.createPool();

  const chainId = process.argv[2];
  if (!chainId || !CHAINS[chainId]) {
    pipeline.log.error('[run-chain]', `Invalid chain_id. Available: ${Object.keys(CHAINS).join(', ')}`);
    await pool.end().catch(() => {});
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
      pipeline.log.warn('[run-chain]', `Could not insert chain tracking row: ${err.message}`);
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
  let wasCancelled = false;

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
          wasCancelled = true;
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
      pipeline.log.error('[run-chain]', `No script mapping for slug: ${slug}`);
      failedStep = slug;
      break;
    }

    const scriptPath = path.resolve(projectRoot, scriptRelPath);
    if (!fs.existsSync(scriptPath)) {
      pipeline.log.error('[run-chain]', `Script not found: ${scriptRelPath}`);
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
      pipeline.log.warn('[run-chain]', `Could not insert step tracking row: ${err.message}`);
    }

    try {
      const stepEnv = { ...process.env, PIPELINE_CHAIN: chainId };
      // Sources chain reloads massing data, so link_massing needs a full rescan.
      // Permits chain only has new permits — incremental (default) is sufficient.
      // Build extra argv flags from manifest supports_full + chain context.
      const extraArgs = [];
      if (slug === 'link_massing' && chainId === 'sources') {
        extraArgs.push('--full');
      }
      if (slug === 'enrich_wsib_builders') {
        stepEnv.ENRICH_WSIB_ONLY = '1';
      }
      if (slug === 'enrich_named_builders') {
        stepEnv.ENRICH_UNMATCHED_ONLY = '1';
      }
      const stdout = execFileSync('node', [scriptPath, ...extraArgs], {
        env: stepEnv,
        stdio: ['inherit', 'pipe', 'inherit'],
        maxBuffer: 50 * 1024 * 1024,
      });

      // Tee stdout to console so logs still appear
      const output = stdout.toString('utf-8');
      if (output) process.stdout.write(output);

      // Parse PIPELINE_SUMMARY line for record counts + records_meta
      let recordsTotal = null;
      let recordsNew = null;
      let recordsUpdated = null;
      let recordsMeta = null;
      const summaryMatch = output.match(/PIPELINE_SUMMARY:(.+)/);
      if (summaryMatch) {
        try {
          const summary = JSON.parse(summaryMatch[1]);
          recordsTotal = summary.records_total ?? null;
          recordsNew = summary.records_new ?? null;
          recordsUpdated = summary.records_updated ?? null;
          recordsMeta = summary.records_meta ?? null;
        } catch { /* malformed summary — ignore */ }
      }

      // Parse PIPELINE_META line for self-documented reads/writes
      const metaMatch = output.match(/PIPELINE_META:(.+)/);
      if (metaMatch) {
        try {
          const pipelineMeta = JSON.parse(metaMatch[1]);
          // Merge into records_meta under pipeline_meta key
          recordsMeta = { ...(recordsMeta || {}), pipeline_meta: pipelineMeta };
        } catch { /* malformed meta — ignore */ }
      }

      const durationMs = Date.now() - stepStart;
      console.log(`${stepLabel} — completed (${(durationMs / 1000).toFixed(1)}s)\n`);

      if (stepRunId) {
        await pool.query(
          `UPDATE pipeline_runs
           SET completed_at = NOW(), status = 'completed', duration_ms = $1,
               records_total = COALESCE($3, records_total),
               records_new = COALESCE($4, records_new),
               records_updated = COALESCE($5, records_updated),
               records_meta = COALESCE($6::jsonb, records_meta)
           WHERE id = $2`,
          [durationMs, stepRunId, recordsTotal, recordsNew, recordsUpdated, recordsMeta ? JSON.stringify(recordsMeta) : null]
        ).catch(() => {});
      }

      // Abort chain when the primary ingest step produced zero changes.
      // Link/classify steps legitimately yield 0 when everything is already
      // processed — only the data-loading gate step should trigger an abort.
      const gate = manifest.chain_gates[chainId];
      if (gate && slug === gate && recordsNew === 0 && (recordsUpdated ?? 0) === 0) {
        console.log(`${stepLabel} — 0 new records — skipping downstream steps`);
        failedStep = slug;
        break;
      }
    } catch (err) {
      // Tee any captured stdout from the failed step so progress logs aren't lost
      if (err.stdout) process.stdout.write(err.stdout);
      const durationMs = Date.now() - stepStart;
      const errorMsg = (err.message || String(err)).slice(0, 4000);
      pipeline.log.error('[run-chain]', `${stepLabel} — FAILED (${(durationMs / 1000).toFixed(1)}s)`, { error: errorMsg.slice(0, 200) });

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
  const chainStatus = wasCancelled ? 'cancelled' : failedStep ? 'failed' : 'completed';
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
    pipeline.log.error('[run-chain]', `Chain stopped at step: ${failedStep}`);
  }

  await pool.end().catch(() => {});

  if (failedStep) process.exit(1);
}

run().catch((err) => {
  pipeline.log.error('[run-chain]', err, { phase: 'fatal' });
  process.exit(1);
});
