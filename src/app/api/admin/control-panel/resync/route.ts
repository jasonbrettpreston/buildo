/**
 * POST /api/admin/control-panel/resync
 *
 * Triggers the downstream pipeline steps that depend on Gravity config
 * (Steps 14-24 of the permits chain). Returns immediately with the step list;
 * the chain runs in the background and is tracked in pipeline_runs.
 *
 * Auth: `verifyAdminAuth` is the FIRST statement (Spec 33 §8 — "per-route
 * guard, NOT middleware").
 *
 * REPLACES the header line this file carried until 2026-09-15: "Admin-gated by
 * src/middleware.ts (no per-route check needed)." The middleware's admin/API
 * arm performs a PRESENCE check only (`src/middleware.ts:115`) — any
 * `x-admin-key` header value, or any non-empty `sb-*-auth-token` cookie,
 * passes. This endpoint `spawn`s `node scripts/run-chain.js permits`, so
 * "no per-route check needed" meant an unauthenticated caller could start the
 * whole permits chain.
 *
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 6
 *            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §8.1
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { unauthorized, sessionRequired } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';

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

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  // Spec 33 §8.1 — `admin_audit_log.admin_uid` is UUID NOT NULL; the shared
  // 'admin-key' / 'dev-user' sentinels cannot be recorded, so an
  // unattributable chain trigger is refused rather than run unaudited.
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/control-panel/resync');

  const triggeredAt = new Date().toISOString();

  // Audit BEFORE the spawn — a background chain run has no transaction to
  // enclose the audit row in, and an untraceable chain trigger is exactly the
  // compliance hole Spec 128 R-12 names.
  await writeAdminAudit(
    {
      adminUid: adminCtx.uid,
      action: 'pipeline_resync_trigger',
      targetUid: null,
      newValue: { steps: [...RESYNC_STEPS], triggered_at: triggeredAt },
      reason: 'Admin triggered a Gravity-config downstream resync',
    },
    pool,
  );

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
});
