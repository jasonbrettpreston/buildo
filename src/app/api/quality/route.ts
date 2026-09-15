import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getQualityData } from '@/lib/quality/metrics';
import { query } from '@/lib/db/client';
import { logError, logWarn } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import {
  detectVolumeAnomalies,
  detectSchemaDrift,
  detectDurationAnomalies,
  detectEngineHealthIssues,
  computeSystemHealth,
  ENGINE_HEALTH_DEFAULTS,
  PipelineFailure,
} from '@/lib/quality/types';
import type {
  EngineHealthEntry,
  EngineHealthAnomaly,
  EngineHealthThresholds,
  EngineHealthPayload,
} from '@/lib/quality/types';

/**
 * A `logic_variables.variable_value` that must read as a finite number.
 * Rejects NULL, '' and anything non-numeric so a corrupt row falls back to the
 * seeded default LOUDLY instead of silently becoming NaN (or 0) in a threshold
 * comparison.
 */
const NumericVariableValue = z
  .string()
  .refine((v) => v.trim() !== '' && Number.isFinite(Number(v)), {
    message: 'not a finite number',
  })
  .transform(Number);

/**
 * Resolve the 7 `engine_health_*` thresholds from `logic_variables` — the same
 * rows `assert_engine_health` reads through `ctx.config` (Spec 26 §3.4).
 *
 * Targeted 7-key SELECT rather than `loadAllConfigs()`: `/api/quality` is a
 * PUBLIC route (`src/lib/auth/route-guard.ts`), so it must not pull the whole
 * tuning table into a public handler's memory, and §4.3 wants projected fields.
 *
 * Never throws, and never swallows:
 *   * a FAILED QUERY is error-class — `logError` (Sentry), because the table
 *     should be readable and something is wrong if it is not;
 *   * an ABSENT or unparseable ROW is info-class — ONE aggregated `logWarn`
 *     naming every key that fell back, matching the pipeline's own precedent
 *     for the same condition (`scripts/lib/config-loader.js` `narrate`:
 *     "logic_variables.<key> is non-finite — keeping fallback"). Seven Sentry
 *     events per request for a fresh DB that has simply not been seeded yet is
 *     alert noise, not signal.
 */
async function loadEngineHealthThresholds(): Promise<EngineHealthThresholds> {
  const keys = Object.keys(ENGINE_HEALTH_DEFAULTS) as (keyof EngineHealthThresholds)[];
  const resolved: EngineHealthThresholds = { ...ENGINE_HEALTH_DEFAULTS };

  let rows: { variable_key: string; variable_value: string | null }[];
  try {
    rows = await query<{ variable_key: string; variable_value: string | null }>(
      `SELECT variable_key, variable_value
         FROM logic_variables
        WHERE variable_key = ANY($1)`,
      [keys]
    );
  } catch (err) {
    logError('[api/quality]', err, {
      phase: 'engine_health_thresholds',
      fallback: 'seeded module defaults for all 7 engine_health_* thresholds',
    });
    return resolved;
  }

  const byKey = new Map(rows.map((r) => [r.variable_key, r.variable_value]));
  const fellBack: { variable_key: string; raw: string | null; fallback: number }[] = [];
  for (const key of keys) {
    const parsed = NumericVariableValue.safeParse(byKey.get(key));
    if (parsed.success) {
      resolved[key] = parsed.data;
      continue;
    }
    fellBack.push({
      variable_key: key,
      raw: byKey.get(key) ?? null,
      fallback: ENGINE_HEALTH_DEFAULTS[key],
    });
  }

  if (fellBack.length > 0) {
    logWarn(
      '[api/quality]',
      `engine health thresholds missing or non-finite in logic_variables — keeping seeded fallbacks: ${fellBack
        .map((f) => f.variable_key)
        .join(', ')}`,
      { phase: 'engine_health_thresholds', fell_back: fellBack }
    );
  }

  return resolved;
}

/**
 * GET /api/quality - Return the latest snapshot + last 30 days of trend data,
 * plus computed anomalies and system health summary.
 */
export const GET = withApiEnvelope(async function GET() {
  try {
    const data = await getQualityData();

    // Compute anomalies from trends
    const anomalies = data.trends.length > 0
      ? detectVolumeAnomalies(data.trends)
      : [];

    // Compute schema drift from last two snapshots
    const schemaDrift = data.trends.length >= 2 && data.trends[0] && data.trends[1]
      ? detectSchemaDrift(
          data.trends[0].schema_column_counts,
          data.trends[1].schema_column_counts
        )
      : [];

    // Compute duration anomalies from pipeline_runs (last 8 runs per pipeline)
    let durationAnomalies: import('@/lib/quality/types').DurationAnomaly[] = [];
    try {
      const durationRows = await query<{ pipeline: string; duration_ms: number }>(
        `SELECT base_pipeline AS pipeline, duration_ms
         FROM (
           SELECT CASE WHEN pipeline LIKE '%:%'
                       THEN SPLIT_PART(pipeline, ':', 2)
                       ELSE pipeline END AS base_pipeline,
                  duration_ms,
                  ROW_NUMBER() OVER (
                    PARTITION BY CASE WHEN pipeline LIKE '%:%'
                                      THEN SPLIT_PART(pipeline, ':', 2)
                                      ELSE pipeline END
                    ORDER BY started_at DESC
                  ) AS rn
           FROM pipeline_runs
           WHERE status = 'completed' AND duration_ms IS NOT NULL
             AND pipeline NOT LIKE '%classify_scope_class%'
             AND pipeline NOT LIKE '%classify_scope_tags%'
             -- B5 (B3 output-panel remediation) — exclude run-ledger-gate SKIP
             -- rows (scripts/lib/source-version.js#buildSkipGateRecordsMeta
             -- stamps records_meta.gated_skip:true). A gate skip measures a
             -- real, non-zero duration (274-320ms observed) that the
             -- detectDurationAnomalies' d > 0 filter cannot distinguish from a
             -- genuinely fast run; left in, a run of consecutive skips collapses
             -- a pipeline's rolling average until the next REAL run trips a
             -- false-positive anomaly (measured: ratio 664.5 after seven).
             AND COALESCE((records_meta->>'gated_skip')::boolean, false) = false
         ) sub
         WHERE rn <= 8
         ORDER BY base_pipeline, rn`
      );
      const runsByPipeline: Record<string, number[]> = {};
      for (const row of durationRows) {
        const arr = runsByPipeline[row.pipeline] ?? [];
        arr.push(row.duration_ms);
        runsByPipeline[row.pipeline] = arr;
      }
      durationAnomalies = detectDurationAnomalies(runsByPipeline);
    } catch {
      // pipeline_runs table may not exist yet — skip duration anomalies
    }

    // Query pipeline failures — only pipelines whose LATEST run is 'failed'
    // (not historical 24h failures that may have been successfully rerun since)
    // Normalize chain-prefixed names (e.g. "permits:assert_schema" → "assert_schema")
    // so a successful chain run supersedes a stale standalone failure.
    let pipelineFailures: PipelineFailure[] = [];
    try {
      const failureRows = await query<{ pipeline: string; error_message: string; failed_at: string }>(
        `SELECT base_pipeline AS pipeline, error_message, failed_at
         FROM (
           SELECT DISTINCT ON (base_pipeline)
                  CASE WHEN pipeline LIKE '%:%'
                       THEN SPLIT_PART(pipeline, ':', 2)
                       ELSE pipeline END AS base_pipeline,
                  status, error_message, started_at AS failed_at
           FROM pipeline_runs
           ORDER BY base_pipeline, started_at DESC
         ) latest
         WHERE status = 'failed'`
      );
      pipelineFailures = failureRows.map((r) => ({
        pipeline: r.pipeline,
        error_message: r.error_message || 'Unknown error',
        failed_at: r.failed_at,
      }));
    } catch (err) {
      logError('[api/quality]', err, { phase: 'pipeline_failures' });
    }

    // Engine health — LIVE `pg_stat_user_tables` read over a curated table list.
    //
    // POST-B1-2 deliberately did NOT repoint this at `engine_health_snapshots`:
    //   * liveness is load-bearing. The snapshot is written per chain run, and
    //     the live cadence measured 2026-09-15 is NOT daily (snapshot_dates
    //     2026-09-14, 08-24, 08-01, 07-17), so the dashboard would have gone
    //     from "now" to "up to three weeks ago" with no visible marker.
    //   * scope is a DISCLOSURE decision, not an implementation detail. The
    //     step discovers all 87 public tables; `/api/quality` is UNAUTHENTICATED
    //     (`src/lib/auth/route-guard.ts` classifies it `public`), so widening
    //     would publish row counts for `admin_backup_codes`, `admin_audit_log`,
    //     `subscribe_nonces`, `stripe_webhook_events`, `profiles`,
    //     `user_profiles` and `device_tokens`. Blocked on an auth ruling —
    //     filed in docs/reports/review_followups.md.
    //
    // What POST-B1-2 DID fix is the second source of truth: every threshold
    // applied below now comes from the same 7 `engine_health_*` logic-variable
    // rows `assert_engine_health` reads through `ctx.config`, and the ratio
    // predicates are byte-for-byte the step's (`buildTableResults`). Spec 26 §3.4.
    let engineHealthEntries: EngineHealthEntry[] = [];
    let engineHealthAnomalies: EngineHealthAnomaly[] = [];
    try {
      const engineRows = await query<{
        table_name: string;
        n_live_tup: string;
        n_dead_tup: string;
        seq_scan: string;
        idx_scan: string;
      }>(
        `SELECT relname AS table_name,
                n_live_tup::bigint::text AS n_live_tup,
                n_dead_tup::bigint::text AS n_dead_tup,
                seq_scan::bigint::text AS seq_scan,
                idx_scan::bigint::text AS idx_scan
         FROM pg_stat_user_tables
         WHERE relname = ANY($1)
         ORDER BY relname`,
        [['permits', 'entities', 'coa_applications', 'parcels', 'address_points',
          'building_footprints', 'neighbourhoods', 'permit_trades', 'permit_parcels',
          'parcel_buildings', 'wsib_registry']]
      );
      engineHealthEntries = engineRows.map((r) => {
        const live = parseInt(r.n_live_tup, 10) || 0;
        const dead = parseInt(r.n_dead_tup, 10) || 0;
        const seq = parseInt(r.seq_scan, 10) || 0;
        const idx = parseInt(r.idx_scan, 10) || 0;
        return {
          table_name: r.table_name,
          n_live_tup: live,
          n_dead_tup: dead,
          dead_ratio: live > 0 ? Math.round((dead / live) * 10000) / 10000 : 0,
          seq_scan: seq,
          idx_scan: idx,
          seq_ratio: (seq + idx) > 0 ? Math.round((seq / (seq + idx)) * 10000) / 10000 : 0,
        };
      });

      const thresholds = await loadEngineHealthThresholds();
      engineHealthAnomalies = detectEngineHealthIssues(engineHealthEntries, thresholds);
    } catch (err) {
      // pg_stat_user_tables may be unreadable (permissions, a fresh DB) — the
      // rest of the quality payload is still useful, so this stays non-fatal.
      // It no longer stays SILENT (logError mandate / ESLint no-empty).
      logError('[api/quality]', err, { phase: 'engine_health' });
    }

    // Compute system health
    const health = data.current
      ? computeSystemHealth(data.current, anomalies, schemaDrift, durationAnomalies, pipelineFailures, engineHealthAnomalies)
      : { level: 'red' as const, issues: ['No snapshot data'], warnings: [] };

    const enginePayload: EngineHealthPayload = {
      engineHealth: engineHealthEntries,
      engineHealthAnomalies,
    };

    return NextResponse.json({
      ...data,
      anomalies,
      schemaDrift,
      health,
      ...enginePayload,
    });
  } catch (err) {
    logError('[api/quality]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch data quality metrics' },
      { status: 500 }
    );
  }
});
