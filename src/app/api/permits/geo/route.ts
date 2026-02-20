import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Bounding box parameters (required for viewport-based loading)
  const neLat = parseFloat(searchParams.get('ne_lat') || '');
  const neLng = parseFloat(searchParams.get('ne_lng') || '');
  const swLat = parseFloat(searchParams.get('sw_lat') || '');
  const swLng = parseFloat(searchParams.get('sw_lng') || '');

  if ([neLat, neLng, swLat, swLng].some(isNaN)) {
    return NextResponse.json(
      { error: 'Bounding box params required: ne_lat, ne_lng, sw_lat, sw_lng' },
      { status: 400 }
    );
  }

  const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 2000);
  const status = searchParams.get('status');
  const tradeSlug = searchParams.get('trade_slug');
  const minCost = searchParams.get('min_cost');

  const conditions = [
    'p.latitude IS NOT NULL',
    'p.longitude IS NOT NULL',
    'p.latitude BETWEEN $1 AND $2',
    'p.longitude BETWEEN $3 AND $4',
  ];
  const params: unknown[] = [swLat, neLat, swLng, neLng];
  let paramIdx = 5;

  if (status) {
    conditions.push(`p.status = $${paramIdx}`);
    params.push(status);
    paramIdx++;
  }

  if (minCost) {
    conditions.push(`p.est_const_cost >= $${paramIdx}`);
    params.push(parseInt(minCost, 10));
    paramIdx++;
  }

  let joinClause = '';
  if (tradeSlug) {
    joinClause = `
      JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
      JOIN trades t ON t.id = pt.trade_id AND t.slug = $${paramIdx}`;
    params.push(tradeSlug);
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  const rows = await query(
    `SELECT
      p.permit_num,
      p.revision_num,
      p.street_num,
      p.street_name,
      p.street_type,
      p.status,
      p.permit_type,
      p.est_const_cost,
      p.latitude,
      p.longitude,
      p.ward
    FROM permits p
    ${joinClause}
    WHERE ${where}
    ORDER BY p.issued_date DESC NULLS LAST
    LIMIT $${paramIdx}`,
    [...params, limit]
  );

  // Summary stats for the viewport
  const countResult = await query<{ count: string; avg_cost: string }>(
    `SELECT COUNT(*) as count, AVG(p.est_const_cost) as avg_cost
     FROM permits p
     ${joinClause}
     WHERE ${where}`,
    params
  );

  return NextResponse.json({
    permits: rows,
    viewport: {
      total: parseInt(countResult[0]?.count || '0', 10),
      avg_cost: parseFloat(countResult[0]?.avg_cost || '0'),
      bounds: { ne: { lat: neLat, lng: neLng }, sw: { lat: swLat, lng: swLng } },
    },
  });
}
