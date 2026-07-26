import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { dispatchWorkflow, cancelWorkflowRun, GithubDispatchError } from '@/lib/admin/github-dispatch';

/**
 * Admin pipeline trigger — dispatches a GitHub Actions workflow (WF2, 2026-07-25).
 *
 * The chains run on the GH runner (Spec 113 §8 / D8). The previous implementation
 * `spawn`ed run-chain.js inside the Vercel serverless function, which the platform
 * kills on response return → the pipeline_runs row stuck at 'running'. This route
 * now dispatches the workflow; run-chain.js on the runner owns pipeline_runs
 * exactly as before (rows, records_meta, verdict) — the admin panels poll unchanged.
 *
 * Only CHAIN slugs are dispatchable; individual-step runs are intentionally
 * unsupported on cloud (operator decision). coa + permits share the combined
 * coa→permits workflow.
 */

const CHAIN_WORKFLOWS: Record<string, string> = {
  chain_coa: 'chain-coa-permits.yml',
  chain_permits: 'chain-coa-permits.yml',
  chain_sources: 'chain-sources.yml',
  chain_entities: 'chain-entities.yml',
  chain_deep_scrapes: 'chain-deep-scrapes.yml',
};

/**
 * The pipeline_runs chain rows each workflow produces (for the 409 guard + the
 * cancel row-marking). The combined workflow produces BOTH chain_coa and
 * chain_permits — cancelling must target both (a coa-only cancel would leave
 * permits running; RC finding).
 */
const WORKFLOW_CHAINS: Record<string, string[]> = {
  'chain-coa-permits.yml': ['chain_coa', 'chain_permits'],
  'chain-sources.yml': ['chain_sources'],
  'chain-entities.yml': ['chain_entities'],
  'chain-deep-scrapes.yml': ['chain_deep_scrapes'],
};

// Engineering Standards §4.4: every response uses the { data, error, meta } envelope.
function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ data, error: null, meta: null }, { status });
}
function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ data: null, error: { code, message }, meta: null }, { status });
}
function unauthorized(): NextResponse {
  return fail('UNAUTHORIZED', 'Admin auth required', 401);
}
/** Map a GithubDispatchError to an HTTP status: config→500, network→503, upstream GitHub→502. */
function ghStatus(err: GithubDispatchError): number {
  if (err.code === 'NO_TOKEN' || err.code === 'NO_REPO') return 500;
  if (err.code === 'NETWORK') return 503;
  return 502; // AUTH / NOT_FOUND / DISPATCH_FAILED — upstream GitHub problem
}

async function slugParam(context: unknown): Promise<string> {
  const { slug } = await (context as { params: Promise<{ slug: string }> }).params;
  return slug;
}

/**
 * isChainRunning "exact query" (Spec 113 §8.3 / G8): a 'running' row inside the
 * 12h TTL window. Matches the chain slug directly — run-chain.js inserts
 * pipeline = chain_<id>, which is exactly the admin slug.
 */
async function anyChainRunning(chains: string[]): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `SELECT id FROM pipeline_runs
      WHERE pipeline = ANY($1) AND status = 'running'
        AND started_at > NOW() - INTERVAL '12 hours'
      LIMIT 1`,
    [chains],
  );
  return rows.length > 0;
}

/**
 * POST /api/admin/pipelines/[slug] — dispatch the chain's GitHub Actions workflow.
 */
export const POST = withApiEnvelope(async function POST(request: NextRequest, context?: unknown) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

  const slug = await slugParam(context);
  const workflowFile = CHAIN_WORKFLOWS[slug];
  if (!workflowFile) {
    return fail(
      'INVALID_SLUG',
      slug.startsWith('chain_')
        ? `Chain ${slug} has no scheduled workflow and cannot be run from the admin.`
        : 'Manual step runs are not supported on cloud — run the chain.',
      400,
    );
  }

  // Pre-dispatch concurrency guard: without it a double-click fires two dispatches
  // → GitHub queues a full DUPLICATE serialized run. Reject if the workflow's
  // chain(s) are already running, giving immediate feedback and skipping the GH call.
  const chains = WORKFLOW_CHAINS[workflowFile] ?? [slug];
  try {
    if (await anyChainRunning(chains)) {
      return fail('ALREADY_RUNNING', `Pipeline ${slug} is already running`, 409);
    }
  } catch (err) {
    // A DB error on the guard shouldn't hard-block the operator — the workflow's
    // own check-chain-running.js guard is a second line of defense (fail-open by design).
    logError(`[pipelines/${slug}]`, err, { event: 'running_check_failed' });
  }

  try {
    await dispatchWorkflow(workflowFile);
    return ok({ status: 'dispatched', pipeline: slug, workflow: workflowFile });
  } catch (err) {
    logError(`[pipelines/${slug}]`, err, {
      event: 'dispatch_failed',
      code: err instanceof GithubDispatchError ? err.code : undefined,
    });
    return err instanceof GithubDispatchError
      ? fail(err.code, err.message, ghStatus(err))
      : fail('INTERNAL', 'Failed to dispatch pipeline', 500);
  }
});

/**
 * DELETE /api/admin/pipelines/[slug] — cancel the chain's in-flight run.
 *
 * Cancels the WHOLE GitHub run (for the combined coa→permits workflow, a DB-row
 * cancel alone would leave permits to run after coa is cancelled), then marks
 * every 'running'/'queued' pipeline_runs row for the workflow's chains (and their
 * scoped step rows) 'cancelled' so the UI reflects it immediately.
 */
export const DELETE = withApiEnvelope(async function DELETE(request: NextRequest, context?: unknown) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

  const slug = await slugParam(context);
  const workflowFile = CHAIN_WORKFLOWS[slug];
  if (!workflowFile) {
    return fail('INVALID_SLUG', `Invalid chain: ${slug}`, 400);
  }
  const chains = WORKFLOW_CHAINS[workflowFile] ?? [slug];

  try {
    const { cancelled, runId } = await cancelWorkflowRun(workflowFile);
    // Mark the chain rows AND their scoped step rows cancelled. run-chain.js names
    // step rows `<chainId>:<step>` (e.g. `coa:link_similar`), so a `chain_coa` slug
    // maps to the `coa:%` LIKE pattern. This DB flag is itself a cancel signal —
    // run-chain.js polls its own row between steps and self-aborts on 'cancelled'
    // (so the mark is intentionally unconditional, not gated on the GH-run cancel).
    const result = await query<{ id: number }>(
      `UPDATE pipeline_runs
          SET status = 'cancelled', error_message = 'Cancelled by user', completed_at = NOW()
        WHERE status IN ('running', 'queued')
          AND (pipeline = ANY($1) OR pipeline LIKE ANY($2))
        RETURNING id`,
      [chains, chains.map((c) => `${c.replace(/^chain_/, '')}:%`)],
    );
    return ok({
      cancelled: result.length,
      gh_run_cancelled: cancelled,
      gh_run_id: runId ?? null,
      pipeline: slug,
      status: 'cancelled',
    });
  } catch (err) {
    logError(`[pipelines/${slug}]`, err, {
      event: 'cancel_failed',
      code: err instanceof GithubDispatchError ? err.code : undefined,
    });
    return err instanceof GithubDispatchError
      ? fail(err.code, err.message, ghStatus(err))
      : fail('INTERNAL', 'Failed to cancel pipeline', 500);
  }
});
