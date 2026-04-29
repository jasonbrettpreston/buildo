// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 7b
// GET /api/onboarding/suppliers?trade={slug}
// Returns admin-curated supplier names for the given trade slug.
// Returns [] (not 404) when no suppliers are seeded — the mobile client
// auto-skips the supplier screen on an empty array.
// Route is fail-closed by default (middleware default = authenticated).
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const uid = await getUserIdFromSession(request);
  if (!uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const trade = request.nextUrl.searchParams.get('trade');
  if (!trade || !trade.trim()) {
    return NextResponse.json({ error: 'trade query parameter is required' }, { status: 400 });
  }

  try {
    const rows = await query<{ name: string }>(
      `SELECT name
       FROM trade_suppliers
       WHERE trade_slug = $1 AND active = true
       ORDER BY display_order ASC`,
      [trade.trim()],
    );
    const suppliers = rows.map((r) => r.name);
    return NextResponse.json({ data: { suppliers } });
  } catch (err) {
    logError('onboarding-suppliers', err, { trade });
    return NextResponse.json({ error: 'Failed to load suppliers' }, { status: 500 });
  }
});
