import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

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
    ] = await Promise.all([
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM permits'
      ),
      query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM builders'
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
        `SELECT COUNT(*)::text AS count FROM builders
         WHERE phone IS NOT NULL OR email IS NOT NULL`
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
    }> = {};
    try {
      const pipelineRows = await query<{
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
      );
      for (const row of pipelineRows) {
        pipelineLastRun[row.pipeline] = {
          last_run_at: row.started_at ? new Date(row.started_at).toISOString() : null,
          status: row.status,
          duration_ms: row.duration_ms,
          error_message: row.error_message,
          records_total: row.records_total,
          records_new: row.records_new,
          records_updated: row.records_updated,
        };
      }
    } catch {
      // pipeline_runs table may not exist yet (migration not applied)
    }

    // Pipeline schedules from DB
    const pipelineSchedules: Record<string, { cadence: string; cron_expression: string | null }> = {};
    try {
      const scheduleRows = await query<{ pipeline: string; cadence: string; cron_expression: string | null }>(
        `SELECT pipeline, cadence, cron_expression FROM pipeline_schedules`
      );
      for (const row of scheduleRows) {
        pipelineSchedules[row.pipeline] = {
          cadence: row.cadence,
          cron_expression: row.cron_expression,
        };
      }
    } catch {
      // pipeline_schedules table may not exist yet
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
      // Pipeline freshness
      pipeline_last_run: pipelineLastRun,
      // Pipeline schedules
      pipeline_schedules: pipelineSchedules,
    });
  } catch (err) {
    console.error('[admin/stats] Error fetching stats:', err);
    return NextResponse.json(
      { error: 'Failed to fetch system statistics' },
      { status: 500 }
    );
  }
}
