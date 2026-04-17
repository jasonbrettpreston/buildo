/**
 * POST /api/admin/control-panel/resync
 *
 * Triggers the downstream pipeline steps that depend on Gravity config
 * (Steps 14-24 of the permits chain). Returns immediately with the step list;
 * the chain runs in the background and is tracked in pipeline_runs.
 *
 * Admin-gated by src/middleware.ts (no per-route check needed).
 * SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phase 6
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logError } from '@/lib/logger';

// Prevent Next.js from caching the resync response — each POST must hit the server.
export const dynamic = 'force-dynamic';

/**
 * The downstream steps that depend on Gravity config (logic_variables,
 * trade_configurations, scope_intensity_matrix). Steps 14–24 of the
 * permits chain in scripts/manifest.json.
 */
const RESYNC_STEPS = [
  'compute_cost_estimates',
  'compute_timing_calibration_v2',
  'link_coa',
  'create_pre_permits',
  'refresh_snapshot',
  'assert_data_bounds',
  'assert_engine_health',
  'classify_lifecycle_phase',
  'compute_trade_forecasts',
  'compute_opportunity_scores',
  'update_tracked_projects',
] as const;

export async function POST() {
  const triggeredAt = new Date().toISOString();

  // Fire-and-forget: spawn the permits chain in the background.
  // The chain orchestrator (run-chain.js) handles pipeline_runs tracking,
  // error recovery, and step-level status updates.
  const scriptPath = path.resolve(process.cwd(), 'scripts/run-chain.js');

  if (fs.existsSync(scriptPath)) {
    try {
      const child = spawn('node', [scriptPath, 'permits'], {
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      // Accumulate stderr so we can log it on non-zero exit.
      // The chain normally logs to pipeline_runs, but if it crashes before
      // connecting to the DB (e.g. missing env var), stderr is the only trace.
      const stderrChunks: Buffer[] = [];
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (err) => {
        logError('[control-panel/resync]', err, { event: 'chain_spawn_failed' });
      });

      child.on('close', (code) => {
        if (code !== 0 && code !== null) {
          const stderr = Buffer.concat(stderrChunks).toString('utf8').slice(0, 2000);
          logError(
            '[control-panel/resync]',
            new Error(`run-chain.js exited with code ${code}`),
            { event: 'chain_nonzero_exit', exit_code: code, stderr },
          );
        }
      });

      // Detach so the API response isn't blocked
      child.unref();
    } catch (err) {
      logError('[control-panel/resync]', err, { event: 'chain_trigger_failed' });
      // Still return 200 — config save already succeeded; chain is best-effort
    }
  } else {
    logError(
      '[control-panel/resync]',
      new Error('run-chain.js not found'),
      { event: 'chain_script_missing', path: scriptPath },
    );
  }

  return NextResponse.json({
    data: { pipeline_run_ids: [] },
    error: null,
    meta: {
      triggered_at: triggeredAt,
      steps: [...RESYNC_STEPS],
    },
  });
}
