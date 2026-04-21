import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { PIPELINE_TABLE_MAP } from '@/lib/admin/funnel';

/**
 * GET /api/admin/stats - Return system-wide statistics for the admin dashboard.
 */
export async function GET() {
  try {
    // Run all count queries in parallel for performance
    const [
      permitsResult,
      buildersResult,
      tradesResult,
      activeRulesResult,
      recentPermitsResult,
      lastSyncResult,
      pendingNotificationsResult,
      activePermitsResult,
      permitsWithBuilderResult,
      permitsWithParcelResult,
      permitsWithNeighbourhoodResult,
      coaTotalResult,
      coaLinkedResult,
      coaUpcomingResult,
      // Data Sources & Health Dashboard queries
      permitsGeocodedResult,
      permitsClassifiedResult,
      buildersWithContactResult,
      addressPointsResult,
      parcelsTotalResult,
      footprintsTotalResult,
      parcelsWithMassingResult,
      permitsWithMassingResult,
      neighbourhoodsTotalResult,
      coaApprovedResult,
      newestPermitResult,
      newestCoaResult,
      // WSIB Registry
      wsibTotalResult,
      wsibLinkedResult,
      wsibLeadPoolResult,
      wsibWithTradeResult,
      permitsPropagatedResult,
      leadViewsTotalResult,
      leadViewsSavedResult,
    ] = await Promise.all([
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM permits'
      ),
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM entities'
      ),
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM trades'
      ),
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM trade_mapping_rules WHERE is_active = true'
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM permits
         WHERE first_seen_at > NOW() - INTERVAL '7 days'`
      ),
      query<{ last_sync_at: Date | null }>(
        'SELECT MAX(started_at) AS last_sync_at FROM sync_runs'
      ),
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM notifications WHERE is_sent = false'
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM permits
         WHERE status IN ('Permit Issued', 'Revision Issued', 'Under Review', 'Inspection')`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM permits
         WHERE builder_name IS NOT NULL AND builder_name != ''`
      ),
      query<{ count: string }>(
        `SELECT COUNT(DISTINCT (pp.permit_num, pp.revision_num))::text AS count
         FROM permit_parcels pp`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM permits
         WHERE neighbourhood_id IS NOT NULL AND neighbourhood_id > 0`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM coa_applications`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM coa_applications
         WHERE linked_permit_num IS NOT NULL`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM coa_applications
         WHERE decision IN ('Approved', 'Approved with Conditions')
           AND linked_permit_num IS NULL
           AND decision_date >= NOW() - INTERVAL '90 days'`
      ),
      // Geocoded permits
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM permits
         WHERE latitude IS NOT NULL`
      ),
      // Classified permits (at least one trade match)
      query<{ count: string }>(
        `SELECT COUNT(DISTINCT (permit_num, revision_num))::text AS count
         FROM permit_trades`
      ),
      // Builders with contact info
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM entities
         WHERE primary_phone IS NOT NULL OR primary_email IS NOT NULL`
      ),
      // Address points total
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM address_points`
      ).catch(() => [{ count: '0' }]),
      // Parcels total
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM parcels`
      ).catch(() => [{ count: '0' }]),
      // Building footprints total
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM building_footprints`
      ).catch(() => [{ count: '0' }]),
      // Parcels with massing data
      query<{ count: string }>(
        `SELECT COUNT(DISTINCT parcel_id)::text AS count FROM parcel_buildings`
      ).catch(() => [{ count: '0' }]),
      // Permits linked to massing (via permit_parcels → parcel_buildings)
      query<{ count: string }>(
        `SELECT COUNT(DISTINCT (pp.permit_num, pp.revision_num))::text AS count
         FROM permit_parcels pp
         JOIN parcel_buildings pb ON pb.parcel_id = pp.parcel_id`
      ).catch(() => [{ count: '0' }]),
      // Neighbourhoods total
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM neighbourhoods`
      ).catch(() => [{ count: '0' }]),
      // CoA approved (for link rate denominator)
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM coa_applications
         WHERE decision IN ('Approved', 'Approved with Conditions')`
      ),
      // Newest permit by ingestion date — "Under Review" permits have no
      // issued_date, so we use first_seen_at to capture all recent data
      query<{ newest: string | null }>(
        `SELECT MAX(first_seen_at)::text AS newest FROM permits`
      ).catch(() => [{ newest: null }]),
      // Newest CoA hearing_date
      query<{ newest: string | null }>(
        `SELECT MAX(hearing_date)::text AS newest FROM coa_applications`
      ).catch(() => [{ newest: null }]),
      // WSIB Registry total Class G
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM wsib_registry`
      ).catch(() => [{ count: '0' }]),
      // WSIB linked to entities
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM wsib_registry WHERE linked_entity_id IS NOT NULL`
      ).catch(() => [{ count: '0' }]),
      // WSIB lead pool (unlinked Class G)
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM wsib_registry WHERE linked_entity_id IS NULL`
      ).catch(() => [{ count: '0' }]),
      // WSIB entries with trade name
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM wsib_registry WHERE trade_name IS NOT NULL`
      ).catch(() => [{ count: '0' }]),
      // Permits with propagated scope tags (link_similar baseline)
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM permits WHERE scope_source = 'propagated'`
      ).catch(() => [{ count: '0' }]),
      // Lead views engagement
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM lead_views'
      ).catch(() => [{ count: '0' }]),
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM lead_views WHERE saved = true'
      ).catch(() => [{ count: '0' }]),
    ]);

    // Auto-fail orphaned "running" rows older than 2 hours (process died mid-run)
    try {
      await query(
        `UPDATE pipeline_runs
         SET status = 'failed', completed_at = NOW(),
             error_message = 'interrupted: stale run auto-cleaned'
         WHERE status = 'running'
           AND started_at < NOW() - INTERVAL '2 hours'`
      );
    } catch {
      // Non-fatal — table may not exist yet
    }

    // Pipeline freshness: last run per pipeline from pipeline_runs table (extended with observability)
    const pipelineLastRun: Record<string, {
      last_run_at: string | null;
      status: string | null;
      duration_ms: number | null;
      error_message: string | null;
      records_total: number | null;
      records_new: number | null;
      records_updated: number | null;
      records_meta: Record<string, unknown> | null;
    }> = {};
    try {
      // Try full query first (includes records_meta from migration 041)
      let pipelineRows: Array<{
        pipeline: string;
        started_at: Date;
        status: string;
        duration_ms: number | null;
        error_message: string | null;
        records_total: number | null;
        records_new: number | null;
        records_updated: number | null;
        records_meta: Record<string, unknown> | null;
      }>;
      try {
        pipelineRows = await query(
          `SELECT DISTINCT ON (pipeline) pipeline, started_at, status,
                  duration_ms, error_message, records_total, records_new, records_updated, records_meta
           FROM pipeline_runs
           ORDER BY pipeline, started_at DESC`
        );
      } catch {
        // Fallback: records_meta column may not exist yet (migration 041)
        pipelineRows = (await query<{
          pipeline: string;
          started_at: Date;
          status: string;
          duration_ms: number | null;
          error_message: string | null;
          records_total: number | null;
          records_new: number | null;
          records_updated: number | null;
        }>(
          `SELECT DISTINCT ON (pipeline) pipeline, started_at, status,
                  duration_ms, error_message, records_total, records_new, records_updated
           FROM pipeline_runs
           ORDER BY pipeline, started_at DESC`
        )).map(r => ({ ...r, records_meta: null }));
      }
      for (const row of pipelineRows) {
        const entry = {
          last_run_at: row.started_at ? new Date(row.started_at).toISOString() : null,
          status: row.status,
          duration_ms: row.duration_ms,
          error_message: row.error_message,
          records_total: row.records_total,
          records_new: row.records_new,
          records_updated: row.records_updated,
          records_meta: row.records_meta ?? null,
        };
        pipelineLastRun[row.pipeline] = entry;

        // Normalize chain-prefixed names (e.g. "permits:assert_schema" → "assert_schema")
        // so the frontend sees the latest run regardless of standalone vs chain execution
        if (row.pipeline.includes(':')) {
          const baseName = row.pipeline.split(':').pop()!;
          const existing = pipelineLastRun[baseName];
          if (!existing || !existing.last_run_at || (entry.last_run_at && entry.last_run_at > existing.last_run_at)) {
            pipelineLastRun[baseName] = entry;
          }
        }
      }

      // Reverse alias: populate chain-scoped keys from bare slugs when a step
      // was triggered individually (e.g. bare "inspections" → "deep_scrapes:inspections").
      const CHAIN_STEP_MAP: Record<string, string[]> = {
        inspections: ['deep_scrapes:inspections'],
        coa_documents: ['deep_scrapes:coa_documents'],
      };
      for (const [bare, scopedKeys] of Object.entries(CHAIN_STEP_MAP)) {
        const bareEntry = pipelineLastRun[bare];
        if (!bareEntry) continue;
        for (const scoped of scopedKeys) {
          const existing = pipelineLastRun[scoped];
          if (!existing || !existing.last_run_at || (bareEntry.last_run_at && bareEntry.last_run_at > existing.last_run_at)) {
            pipelineLastRun[scoped] = bareEntry;
          }
        }
      }
    } catch {
      // pipeline_runs table may not exist yet
    }

    // Pipeline schedules from DB
    const pipelineSchedules: Record<string, { cadence: string; cron_expression: string | null; enabled: boolean }> = {};
    try {
      const scheduleRows = await query<{ pipeline: string; cadence: string; cron_expression: string | null; enabled: boolean }>(
        `SELECT pipeline, cadence, cron_expression, enabled FROM pipeline_schedules`
      );
      for (const row of scheduleRows) {
        pipelineSchedules[row.pipeline] = {
          cadence: row.cadence,
          cron_expression: row.cron_expression,
          enabled: row.enabled,
        };
      }
    } catch {
      // pipeline_schedules table may not exist yet
    }

    // Live DB schema map — query information_schema.columns for all tables
    // referenced by STEP_DESCRIPTIONS so the UI never shows stale field lists
    const dbSchemaMap: Record<string, string[]> = {};
    try {
      const tables = [...new Set(Object.values(PIPELINE_TABLE_MAP))];
      const schemaRows = await query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ANY($1)
         ORDER BY table_name, ordinal_position`,
        [tables]
      );
      for (const row of schemaRows) {
        const cols = dbSchemaMap[row.table_name] ?? [];
        cols.push(row.column_name);
        dbSchemaMap[row.table_name] = cols;
      }
    } catch {
      // Non-fatal — UI will show description without field list
    }

    // T3: Live table counts using pg_class.reltuples (fast approximate)
    const liveTableCounts: Record<string, number> = {};
    try {
      const countRows = await query<{ relname: string; reltuples: string }>(
        `SELECT relname, reltuples::bigint::text AS reltuples
         FROM pg_class
         WHERE relname = ANY($1) AND relkind = 'r'`,
        [['permits', 'entities', 'coa_applications', 'parcels', 'address_points',
          'building_footprints', 'neighbourhoods', 'permit_trades', 'permit_parcels',
          'parcel_buildings', 'wsib_registry', 'data_quality_snapshots', 'pipeline_runs',
          'lead_views', 'cost_estimates', 'phase_calibration']]
      );
      for (const row of countRows) {
        liveTableCounts[row.relname] = Math.max(0, parseInt(row.reltuples, 10));
      }
    } catch {
      // Non-fatal — UI degrades gracefully without counts
    }

    const p = (r: { count: string }[] | { count: string }) =>
      parseInt(Array.isArray(r) ? (r[0]?.count ?? '0') : (r.count ?? '0'), 10);

    return NextResponse.json({
      total_permits: p(permitsResult),
      total_builders: p(buildersResult),
      total_trades: p(tradesResult),
      active_rules: p(activeRulesResult),
      permits_this_week: p(recentPermitsResult),
      last_sync_at: lastSyncResult[0]?.last_sync_at ?? null,
      notifications_pending: p(pendingNotificationsResult),
      active_permits: p(activePermitsResult),
      permits_with_builder: p(permitsWithBuilderResult),
      permits_with_parcel: p(permitsWithParcelResult),
      permits_with_neighbourhood: p(permitsWithNeighbourhoodResult),
      coa_total: p(coaTotalResult),
      coa_linked: p(coaLinkedResult),
      coa_upcoming: p(coaUpcomingResult),
      // Data Sources & Health Dashboard fields
      permits_geocoded: p(permitsGeocodedResult),
      permits_classified: p(permitsClassifiedResult),
      builders_with_contact: p(buildersWithContactResult),
      address_points_total: p(addressPointsResult),
      parcels_total: p(parcelsTotalResult),
      building_footprints_total: p(footprintsTotalResult),
      parcels_with_massing: p(parcelsWithMassingResult),
      permits_with_massing: p(permitsWithMassingResult),
      neighbourhoods_total: p(neighbourhoodsTotalResult),
      coa_approved: p(coaApprovedResult),
      // Newest record dates
      newest_permit_date: (Array.isArray(newestPermitResult) ? newestPermitResult[0]?.newest : null) ?? null,
      newest_coa_date: (Array.isArray(newestCoaResult) ? newestCoaResult[0]?.newest : null) ?? null,
      // WSIB Registry
      wsib_total: p(wsibTotalResult),
      wsib_linked: p(wsibLinkedResult),
      wsib_lead_pool: p(wsibLeadPoolResult),
      wsib_with_trade: p(wsibWithTradeResult),
      permits_propagated: p(permitsPropagatedResult),
      // Lead views engagement
      lead_views_total: p(leadViewsTotalResult),
      lead_views_saved: p(leadViewsSavedResult),
      // Pipeline freshness
      pipeline_last_run: pipelineLastRun,
      // Pipeline schedules
      pipeline_schedules: pipelineSchedules,
      // Live DB schema for pipeline description tiles
      db_schema_map: dbSchemaMap,
      // T3: Fast approximate row counts from pg_class
      live_table_counts: liveTableCounts,
    });
  } catch (err) {
    logError('[admin/stats]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch system statistics' },
      { status: 500 }
    );
  }
}
