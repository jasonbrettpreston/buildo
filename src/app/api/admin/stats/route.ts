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
    ]);

    return NextResponse.json({
      total_permits: parseInt(permitsResult[0]?.count ?? '0', 10),
      total_builders: parseInt(buildersResult[0]?.count ?? '0', 10),
      total_trades: parseInt(tradesResult[0]?.count ?? '0', 10),
      active_rules: parseInt(activeRulesResult[0]?.count ?? '0', 10),
      permits_this_week: parseInt(recentPermitsResult[0]?.count ?? '0', 10),
      last_sync_at: lastSyncResult[0]?.last_sync_at ?? null,
      notifications_pending: parseInt(pendingNotificationsResult[0]?.count ?? '0', 10),
      active_permits: parseInt(activePermitsResult[0]?.count ?? '0', 10),
      permits_with_builder: parseInt(permitsWithBuilderResult[0]?.count ?? '0', 10),
      permits_with_parcel: parseInt(permitsWithParcelResult[0]?.count ?? '0', 10),
      permits_with_neighbourhood: parseInt(permitsWithNeighbourhoodResult[0]?.count ?? '0', 10),
      coa_total: parseInt(coaTotalResult[0]?.count ?? '0', 10),
      coa_linked: parseInt(coaLinkedResult[0]?.count ?? '0', 10),
      coa_upcoming: parseInt(coaUpcomingResult[0]?.count ?? '0', 10),
    });
  } catch (err) {
    console.error('[admin/stats] Error fetching stats:', err);
    return NextResponse.json(
      { error: 'Failed to fetch system statistics' },
      { status: 500 }
    );
  }
}
