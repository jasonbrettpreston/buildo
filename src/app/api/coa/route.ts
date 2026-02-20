import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const permitNum = searchParams.get('permit_num');
  const ward = searchParams.get('ward');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (permitNum) {
    conditions.push(`linked_permit_num = $${paramIdx}`);
    params.push(permitNum);
    paramIdx++;
  }

  if (ward) {
    conditions.push(`ward = $${paramIdx}`);
    params.push(ward);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await query(
    `SELECT * FROM coa_applications ${where}
     ORDER BY hearing_date DESC NULLS LAST
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM coa_applications ${where}`,
    params
  );
  const total = parseInt(countResult[0]?.count || '0', 10);

  return NextResponse.json({
    applications: rows,
    pagination: {
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  });
}
