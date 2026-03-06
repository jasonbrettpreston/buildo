import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const sortBy = searchParams.get('sort_by') || 'permit_count';

    const ALLOWED_SORT = ['permit_count', 'legal_name', 'google_rating', 'last_enriched_at'];
    const sort = ALLOWED_SORT.includes(sortBy) ? sortBy : 'permit_count';
    const sortOrder = searchParams.get('sort_order') === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Only return entities that have a Builder role
    conditions.push(
      `id IN (SELECT entity_id FROM entity_projects WHERE role = 'Builder')`
    );

    if (search) {
      conditions.push(`legal_name ILIKE $${paramIdx}`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await query(
      `SELECT * FROM entities ${where}
       ORDER BY ${sort} ${sortOrder}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM entities ${where}`,
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
  } catch (err) {
    console.error('[api/builders] Error fetching builders:', err);
    return NextResponse.json(
      { error: 'Failed to fetch builders' },
      { status: 500 }
    );
  }
}
