import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const sortBy = searchParams.get('sort_by') || 'permit_count';

  const ALLOWED_SORT = ['permit_count', 'name', 'google_rating', 'enriched_at'];
  const sort = ALLOWED_SORT.includes(sortBy) ? sortBy : 'permit_count';
  const sortOrder = searchParams.get('sort_order') === 'asc' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (search) {
    conditions.push(`name ILIKE $${paramIdx}`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await query(
    `SELECT * FROM builders ${where}
     ORDER BY ${sort} ${sortOrder}
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM builders ${where}`,
    params
  );
  const total = parseInt(countResult[0]?.count || '0', 10);

  return NextResponse.json({
    builders: rows,
    pagination: {
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  });
}
