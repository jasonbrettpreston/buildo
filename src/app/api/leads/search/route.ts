// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1 Global Search & Claim
//
// GET /api/leads/search?q={address_or_permit}
// Full-text permit search for the Flight Board FAB. Returns up to 20 permits
// matching the query by permit number prefix or address substring.
// No geo-filtering — the search is app-wide since users find jobs outside
// their default radius.

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { pool } from '@/lib/db/client';
import { ok } from '@/features/leads/api/envelope';
import { badRequestZod, internalError, unauthorized } from '@/features/leads/api/error-mapping';
import { z } from 'zod';

const searchQuerySchema = z.object({
  q: z.string().min(2).max(100).trim(),
});

const SEARCH_SQL = `
  SELECT
    p.permit_num,
    p.revision_num,
    TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')) AS address,
    p.lifecycle_phase,
    p.status
  FROM permits p
  WHERE p.permit_num ILIKE $1
    OR TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')) ILIKE $1
  ORDER BY p.last_seen_at DESC NULLS LAST
  LIMIT 20
`;

interface SearchRow {
  permit_num: string;
  revision_num: string;
  address: string;
  lifecycle_phase: string | null;
  status: string | null;
}

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentUserContext(request, pool);
    if (!ctx) return unauthorized();

    const parsed = searchQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) return badRequestZod(parsed.error);

    const { q } = parsed.data;
    const pattern = `%${q}%`;

    const result = await pool.query<SearchRow>(SEARCH_SQL, [pattern]);

    return ok(result.rows);
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/leads/search' });
  }
});
