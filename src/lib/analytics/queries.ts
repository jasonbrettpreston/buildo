// ---------------------------------------------------------------------------
// Analytics queries for the admin dashboard and reporting
// ---------------------------------------------------------------------------

import { query } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Permits by date range
// ---------------------------------------------------------------------------

/**
 * Count permits grouped by a time bucket (day, week, or month) within a
 * date range. Uses `date_trunc` for consistent grouping.
 */
export async function getPermitsByDateRange(
  startDate: Date,
  endDate: Date,
  groupBy: 'day' | 'week' | 'month'
): Promise<{ date: string; count: number }[]> {
  const rows = await query<{ date: string; count: string }>(
    `SELECT
      date_trunc($1, issued_date)::date::text AS date,
      COUNT(*)::text AS count
    FROM permits
    WHERE issued_date >= $2 AND issued_date <= $3
    GROUP BY date_trunc($1, issued_date)
    ORDER BY date_trunc($1, issued_date) ASC`,
    [groupBy, startDate.toISOString(), endDate.toISOString()]
  );

  return rows.map((r) => ({
    date: r.date,
    count: parseInt(r.count, 10),
  }));
}

// ---------------------------------------------------------------------------
// Trade distribution
// ---------------------------------------------------------------------------

/**
 * Breakdown of permit counts and average lead scores per trade within a
 * date range. Useful for demand analysis and trade-level reporting.
 */
export async function getTradeDistribution(
  startDate: Date,
  endDate: Date
): Promise<{ trade_name: string; count: number; avg_score: number }[]> {
  const rows = await query<{ trade_name: string; count: string; avg_score: string }>(
    `SELECT
      pt.trade_name,
      COUNT(*)::text AS count,
      ROUND(AVG(pt.lead_score)::numeric, 2)::text AS avg_score
    FROM permit_trades pt
    INNER JOIN permits p
      ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num
    WHERE p.issued_date >= $1 AND p.issued_date <= $2
    GROUP BY pt.trade_name
    ORDER BY count DESC`,
    [startDate.toISOString(), endDate.toISOString()]
  );

  return rows.map((r) => ({
    trade_name: r.trade_name,
    count: parseInt(r.count, 10),
    avg_score: parseFloat(r.avg_score),
  }));
}

// ---------------------------------------------------------------------------
// Cost by ward
// ---------------------------------------------------------------------------

/**
 * Aggregate estimated construction cost and permit count grouped by ward.
 */
export async function getCostByWard(): Promise<
  { ward: string; total_cost: number; permit_count: number }[]
> {
  const rows = await query<{ ward: string; total_cost: string; permit_count: string }>(
    `SELECT
      ward,
      COALESCE(SUM(est_const_cost), 0)::text AS total_cost,
      COUNT(*)::text AS permit_count
    FROM permits
    WHERE ward IS NOT NULL AND ward <> ''
    GROUP BY ward
    ORDER BY total_cost DESC`
  );

  return rows.map((r) => ({
    ward: r.ward,
    total_cost: parseFloat(r.total_cost),
    permit_count: parseInt(r.permit_count, 10),
  }));
}

// ---------------------------------------------------------------------------
// Status distribution
// ---------------------------------------------------------------------------

/**
 * Count permits by status. Suitable for rendering a donut/pie chart.
 */
export async function getStatusDistribution(): Promise<
  { status: string; count: number }[]
> {
  const rows = await query<{ status: string; count: string }>(
    `SELECT
      status,
      COUNT(*)::text AS count
    FROM permits
    GROUP BY status
    ORDER BY count DESC`
  );

  return rows.map((r) => ({
    status: r.status,
    count: parseInt(r.count, 10),
  }));
}

// ---------------------------------------------------------------------------
// Top builders
// ---------------------------------------------------------------------------

/**
 * Return the top builders ranked by permit count, with average estimated
 * construction cost per permit.
 */
export async function getTopBuilders(
  limit: number = 10
): Promise<{ name: string; permit_count: number; avg_cost: number }[]> {
  const rows = await query<{ name: string; permit_count: string; avg_cost: string }>(
    `SELECT
      b.name,
      b.permit_count::text AS permit_count,
      COALESCE(
        ROUND(
          (SELECT AVG(p.est_const_cost) FROM permits p WHERE p.builder_name = b.name)::numeric,
          2
        ),
        0
      )::text AS avg_cost
    FROM builders b
    ORDER BY b.permit_count DESC
    LIMIT $1`,
    [limit]
  );

  return rows.map((r) => ({
    name: r.name,
    permit_count: parseInt(r.permit_count, 10),
    avg_cost: parseFloat(r.avg_cost),
  }));
}

// ---------------------------------------------------------------------------
// Permit trends (from sync runs)
// ---------------------------------------------------------------------------

/**
 * Return daily new and updated permit counts derived from sync run data
 * over the last N days.
 */
export async function getPermitTrends(
  days: number = 30
): Promise<{ date: string; new_count: number; updated_count: number }[]> {
  const rows = await query<{ date: string; new_count: string; updated_count: string }>(
    `SELECT
      date_trunc('day', started_at)::date::text AS date,
      COALESCE(SUM(records_new), 0)::text AS new_count,
      COALESCE(SUM(records_updated), 0)::text AS updated_count
    FROM sync_runs
    WHERE started_at >= NOW() - make_interval(days => $1)
      AND status = 'completed'
    GROUP BY date_trunc('day', started_at)
    ORDER BY date ASC`,
    [days]
  );

  return rows.map((r) => ({
    date: r.date,
    new_count: parseInt(r.new_count, 10),
    updated_count: parseInt(r.updated_count, 10),
  }));
}
