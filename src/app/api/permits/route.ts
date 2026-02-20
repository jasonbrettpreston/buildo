import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import type { PermitFilter } from '@/lib/permits/types';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const filter: PermitFilter = {
    status: params.get('status') || undefined,
    permit_type: params.get('permit_type') || undefined,
    structure_type: params.get('structure_type') || undefined,
    work: params.get('work') || undefined,
    ward: params.get('ward') || undefined,
    trade_slug: params.get('trade_slug') || undefined,
    min_cost: params.get('min_cost') ? Number(params.get('min_cost')) : undefined,
    max_cost: params.get('max_cost') ? Number(params.get('max_cost')) : undefined,
    search: params.get('search') || undefined,
    page: params.get('page') ? Number(params.get('page')) : 1,
    limit: params.get('limit') ? Math.min(Number(params.get('limit')), 100) : 20,
    sort_by: params.get('sort_by') || 'issued_date',
    sort_order: (params.get('sort_order') as 'asc' | 'desc') || 'desc',
  };

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (filter.status) {
    conditions.push(`p.status = $${paramIdx++}`);
    values.push(filter.status);
  }
  if (filter.permit_type) {
    conditions.push(`p.permit_type = $${paramIdx++}`);
    values.push(filter.permit_type);
  }
  if (filter.structure_type) {
    conditions.push(`p.structure_type = $${paramIdx++}`);
    values.push(filter.structure_type);
  }
  if (filter.work) {
    conditions.push(`p.work = $${paramIdx++}`);
    values.push(filter.work);
  }
  if (filter.ward) {
    conditions.push(`p.ward = $${paramIdx++}`);
    values.push(filter.ward);
  }
  if (filter.min_cost != null) {
    conditions.push(`p.est_const_cost >= $${paramIdx++}`);
    values.push(filter.min_cost);
  }
  if (filter.max_cost != null) {
    conditions.push(`p.est_const_cost <= $${paramIdx++}`);
    values.push(filter.max_cost);
  }
  if (filter.search) {
    conditions.push(
      `to_tsvector('english', coalesce(p.description,'') || ' ' || coalesce(p.street_name,'') || ' ' || coalesce(p.builder_name,'')) @@ plainto_tsquery('english', $${paramIdx++})`
    );
    values.push(filter.search);
  }

  let joinClause = '';
  if (filter.trade_slug) {
    joinClause = `INNER JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
                  INNER JOIN trades t ON t.id = pt.trade_id`;
    conditions.push(`t.slug = $${paramIdx++}`);
    values.push(filter.trade_slug);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sort column to prevent SQL injection
  const ALLOWED_SORT = ['issued_date', 'application_date', 'est_const_cost', 'status', 'ward', 'permit_num'];
  const sortBy = ALLOWED_SORT.includes(filter.sort_by!) ? filter.sort_by : 'issued_date';
  const sortOrder = filter.sort_order === 'asc' ? 'ASC' : 'DESC';

  const page = Math.max(1, filter.page || 1);
  const limit = filter.limit || 20;
  const offset = (page - 1) * limit;

  try {
    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM permits p ${joinClause} ${whereClause}`,
      values
    );
    const total = parseInt(countResult[0].total, 10);

    // Get paginated results
    const permits = await query(
      `SELECT p.* FROM permits p ${joinClause} ${whereClause}
       ORDER BY p.${sortBy} ${sortOrder} NULLS LAST
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...values, limit, offset]
    );

    // Fetch trade classifications for returned permits
    let tradesByPermit: Record<string, { trade_slug: string; trade_name: string; color: string; confidence: number; tier: number; lead_score: number; phase: string }[]> = {};
    if (permits.length > 0) {
      const permitKeys = permits.map((p: Record<string, unknown>) => `${p.permit_num}--${p.revision_num}`);
      const tradeRows = await query(
        `SELECT pt.permit_num, pt.revision_num, t.slug as trade_slug, t.name as trade_name,
                t.color, pt.confidence, pt.tier, pt.lead_score, pt.phase
         FROM permit_trades pt
         JOIN trades t ON t.id = pt.trade_id
         WHERE pt.permit_num || '--' || pt.revision_num = ANY($1)
         ORDER BY pt.lead_score DESC`,
        [permitKeys]
      );
      for (const row of tradeRows) {
        const key = `${row.permit_num}--${row.revision_num}`;
        if (!tradesByPermit[key]) tradesByPermit[key] = [];
        tradesByPermit[key].push({
          trade_slug: row.trade_slug,
          trade_name: row.trade_name,
          color: row.color,
          confidence: row.confidence,
          tier: row.tier,
          lead_score: row.lead_score,
          phase: row.phase,
        });
      }
    }

    // Attach trades to each permit
    const permitsWithTrades = permits.map((p: Record<string, unknown>) => ({
      ...p,
      trades: tradesByPermit[`${p.permit_num}--${p.revision_num}`] || [],
    }));

    return NextResponse.json({
      data: permitsWithTrades,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Error fetching permits:', err);
    return NextResponse.json(
      { error: 'Failed to fetch permits' },
      { status: 500 }
    );
  }
}
