import { query } from '@/lib/db/client';

/**
 * Auto-fail orphaned `running` pipeline_runs rows (process died mid-run). Extracted out of
 * src/app/api/admin/stats/route.ts (a route.ts file's own generated type-check restricts
 * it to the Next.js HTTP-method/config export allowlist — an extra named export fails
 * `tsc` against `.next/types/app/api/admin/stats/route.ts`) so it is independently
 * DB-testable — see src/tests/db/admin-stats-reaper.db.test.ts.
 *
 * Pilot 9 commit 8 P5(d), Spec 48 §3.10 — a converted step's own `runEnrichPhase` (LG-28)
 * writes `records_meta.last_heartbeat_at` (`recordHeartbeat`) while it is genuinely making
 * progress; a row carrying a heartbeat within the last 30 minutes is NOT reaped on the
 * elapsed-wall-clock rule alone, even if `started_at` is well past 2 hours ago (a
 * long-running but healthy pass, e.g. enrich_parcels pass 2's own measured 46-48min
 * dominant cost, must not be killed out from under it). A row with NO heartbeat at all (a
 * legacy, unconverted step, or a converted step that died before its first heartbeat
 * write) keeps the original 2-hour rule unchanged — this is a WIDENING of what survives,
 * never a narrowing of what gets reaped. `scripts/reconcile-runs.js` (Spec 122 §7.4) is
 * now the more authoritative Step-0 reaper (writes `crashed`, not `failed`) and has the
 * SAME heartbeat-unaware gap — not fixed here, out of scope for this peel, named for
 * awareness rather than left silently unmentioned.
 */
export async function reapStaleRunningRows(): Promise<void> {
  try {
    await query(
      `UPDATE pipeline_runs
       SET status = 'failed', completed_at = NOW(),
           error_message = 'interrupted: stale run auto-cleaned'
       WHERE status = 'running'
         AND (
           ((records_meta->>'last_heartbeat_at') IS NOT NULL
             AND (records_meta->>'last_heartbeat_at')::timestamptz < NOW() - INTERVAL '30 minutes')
           OR
           ((records_meta->>'last_heartbeat_at') IS NULL
             AND started_at < NOW() - INTERVAL '2 hours')
         )`
    );
  } catch {
    // Non-fatal — table may not exist yet
  }
}
