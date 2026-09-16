import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { COA_IDENTITY_LINK_MIN_CONFIDENCE } from '@/lib/coa/link-confidence';
import { COA_PUBLIC_COLS, selectList } from '@/lib/api/public-projections';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const permitNum = searchParams.get('permit_num');
    const ward = searchParams.get('ward');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (permitNum) {
      // P12-B1: identity floor — only surface CoAs identity-linked to this permit
      // (≥0.85); sub-0.85 links are same-street/wrong-house or geo associations.
      conditions.push(`linked_permit_num = $${paramIdx} AND linked_confidence >= ${COA_IDENTITY_LINK_MIN_CONFIDENCE}`);
      params.push(permitNum);
      paramIdx++;
    }

    if (ward) {
      conditions.push(`ward = $${paramIdx}`);
      params.push(ward);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // §4.3 — explicit allow-list, never `SELECT *`. `coa_applications` has
    // grown to 146 columns; this route is unauthenticated (PUBLIC_PREFIXES),
    // so every pipeline column the chain adds would otherwise be published on
    // the next deploy with no code change. See lib/api/public-projections.ts.
    const rows = await query(
      `SELECT ${selectList(COA_PUBLIC_COLS)} FROM coa_applications ${where}
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
  } catch (err) {
    logError('[api/coa]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch CoA applications' },
      { status: 500 }
    );
  }
});
