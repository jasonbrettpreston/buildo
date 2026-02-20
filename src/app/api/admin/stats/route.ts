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
    ]);

    return NextResponse.json({
      total_permits: parseInt(permitsResult[0]?.count ?? '0', 10),
      total_builders: parseInt(buildersResult[0]?.count ?? '0', 10),
      total_trades: parseInt(tradesResult[0]?.count ?? '0', 10),
      active_rules: parseInt(activeRulesResult[0]?.count ?? '0', 10),
      permits_this_week: parseInt(recentPermitsResult[0]?.count ?? '0', 10),
      last_sync_at: lastSyncResult[0]?.last_sync_at ?? null,
      notifications_pending: parseInt(pendingNotificationsResult[0]?.count ?? '0', 10),
    });
  } catch (err) {
    console.error('[admin/stats] Error fetching stats:', err);
    return NextResponse.json(
      { error: 'Failed to fetch system statistics' },
      { status: 500 }
    );
  }
}
