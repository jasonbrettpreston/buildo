import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Map of allowed pipeline slugs to their script paths (relative to project root).
 */
const PIPELINE_SCRIPTS: Record<string, string> = {
  // Ingest (load raw data)
  permits: 'scripts/load-permits.js',
  coa: 'scripts/load-coa.js',
  builders: 'scripts/extract-builders.js',
  address_points: 'scripts/load-address-points.js',
  parcels: 'scripts/load-parcels.js',
  massing: 'scripts/load-massing.js',
  neighbourhoods: 'scripts/load-neighbourhoods.js',
  // Link (join data sources)
  geocode_permits: 'scripts/geocode-permits.js',
  link_parcels: 'scripts/link-parcels.js',
  link_neighbourhoods: 'scripts/link-neighbourhoods.js',
  link_massing: 'scripts/link-massing.js',
  link_coa: 'scripts/link-coa.js',
  // Enrich (augment records)
  enrich_wsib_builders: 'scripts/enrich-web-search.js',
  enrich_named_builders: 'scripts/enrich-web-search.js',
  load_wsib: 'scripts/load-wsib.js',
  link_wsib: 'scripts/link-wsib.js',
  // Scrape (external portal data)
  inspections: 'scripts/poc-aic-scraper.js',
  // Classify (derive fields)
  classify_scope_class: 'scripts/classify-scope.js',
  classify_scope_tags: 'scripts/classify-scope.js',
  classify_permits: 'scripts/classify-permits.js',
  // Compute centroids
  compute_centroids: 'scripts/compute-centroids.js',
  // Link similar + pre-permits
  link_similar: 'scripts/link-similar.js',
  create_pre_permits: 'scripts/create-pre-permits.js',
  // Snapshot (capture metrics)
  refresh_snapshot: 'scripts/refresh-snapshot.js',
  // Quality (CQA validation)
  assert_schema: 'scripts/quality/assert-schema.js',
  assert_data_bounds: 'scripts/quality/assert-data-bounds.js',
  // Chain orchestrators
  chain_permits: 'scripts/run-chain.js',
  chain_coa: 'scripts/run-chain.js',
  chain_sources: 'scripts/run-chain.js',
};

const CHAIN_SLUGS = new Set(['chain_permits', 'chain_coa', 'chain_sources']);

const ALLOWED_PIPELINES = Object.keys(PIPELINE_SCRIPTS);

/**
 * POST /api/admin/pipelines/[slug] - Trigger a manual pipeline run.
 *
 * Creates a pipeline_runs row, spawns the script in the background,
 * and returns immediately with the run ID.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!ALLOWED_PIPELINES.includes(slug)) {
    return NextResponse.json(
      { error: `Invalid pipeline: ${slug}. Allowed: ${ALLOWED_PIPELINES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate script exists before spawning
  const scriptPath = path.resolve(process.cwd(), PIPELINE_SCRIPTS[slug]);
  if (!fs.existsSync(scriptPath)) {
    return NextResponse.json(
      { error: `Script not found: ${PIPELINE_SCRIPTS[slug]}` },
      { status: 500 }
    );
  }

  const isChain = CHAIN_SLUGS.has(slug);

  // Concurrency guard: reject if this pipeline (or its chain) is already running
  try {
    const alreadyRunning = await query<{ id: number; pipeline: string }>(
      `SELECT id, pipeline FROM pipeline_runs
       WHERE status = 'running'
         AND started_at > NOW() - INTERVAL '2 hours'
         AND pipeline = $1
       LIMIT 1`,
      [slug]
    );
    if (alreadyRunning.length > 0) {
      return NextResponse.json(
        { error: `Pipeline ${slug} is already running (run ${alreadyRunning[0].id})` },
        { status: 409 }
      );
    }
  } catch {
    // Non-fatal — proceed without guard if table doesn't exist
  }

  // Chain orchestrator manages its own pipeline_runs rows; skip for chains
  let runId: number | null = null;
  if (!isChain) {
    try {
      const rows = await query<{ id: number }>(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running')
         RETURNING id`,
        [slug]
      );
      runId = rows[0].id;
    } catch (trackErr) {
      console.warn(`[pipelines/${slug}] pipeline_runs table not available, running without tracking:`, trackErr instanceof Error ? trackErr.message : trackErr);
    }
  }

  try {
    const startMs = Date.now();

    // For chain slugs, pass the chain ID as an extra argument
    const args = isChain
      ? [scriptPath, slug.replace(/^chain_/, '')]
      : [scriptPath];
    const timeout = isChain ? 3_600_000 : 600_000; // 1 hour for chains, 10 min for individual

    const child = execFile(
      'node',
      args,
      { timeout, env: process.env },
      async (err, _stdout, stderr) => {
        const durationMs = Date.now() - startMs;
        const status = err ? 'failed' : 'completed';
        // Prefer stderr for error details, fall back to err.message
        const errorMsg = err
          ? (stderr?.trim() || err.message).slice(0, 4000)
          : null;

        if (err) {
          console.error(`[pipelines/${slug}] Script failed${runId ? ` (run ${runId})` : ''}:`, err.message);
          if (stderr) console.error(`[pipelines/${slug}] stderr:`, stderr.slice(0, 2000));
        }

        if (runId) {
          try {
            await query(
              `UPDATE pipeline_runs
               SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3
               WHERE id = $4`,
              [status, durationMs, errorMsg, runId]
            );
          } catch (updateErr) {
            console.error(`[pipelines/${slug}] Failed to update run ${runId}:`, updateErr);
          }
        }
      }
    );

    // Detach so the API response isn't blocked
    child.unref();

    return NextResponse.json({ run_id: runId, pipeline: slug, status: 'running' });
  } catch (err) {
    console.error(`[pipelines/${slug}] Error triggering pipeline:`, err);
    return NextResponse.json(
      { error: 'Failed to trigger pipeline' },
      { status: 500 }
    );
  }
}
