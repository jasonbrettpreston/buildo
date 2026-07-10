// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §4.2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §12 + §13
//
// GET /api/admin/leads/watchlist/search?q= — address → permit/coa resolution
// for the Flight Center search box. PORTS the permits street-substring logic
// from the consumer /api/leads/search route behind verifyAdminAuth (Spec 33
// §8 wants the per-route admin guard, not inherited consumer auth) and ADDS
// a coa arm over coa_applications.address. [D-search v1: substring resolver;
// the Spec 89 address_points fuzzy upgrade is a filed follow-up.]
//
// Returns enough to save: lead_type, lead_key (canonical via buildLeadKey —
// byte-exact for the forecast join [ORC5]), permit/coa identifiers, address,
// lifecycle_phase. A miss is a valid 200 empty result, not an error
// (Spec 89 §2.5 precedent). The [PF2] pg_trgm GIN indexes (mig 215)
// accelerate the leading-wildcard ILIKE on both arms.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { ok } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logInfo, logWarn } from '@/lib/logger';
import { buildLeadKey } from '@/features/leads/lib/record-lead-view';
import {
  WatchlistSearchQuerySchema,
  WatchlistSearchItemSchema,
  type WatchlistSearchItem,
} from '@/lib/admin/watchlist-schemas';

const TAG = '[api/admin/watchlist-search]';
const SLOW_QUERY_MS = 500; // Spec 33 §12

// Each arm caps at 20 (consumer-search parity); the arms are independent
// parenthesized selects so each keeps its own recency ordering.
const SEARCH_SQL = `
  (
    SELECT
      'permit'::text AS lead_type,
      p.permit_num,
      p.revision_num,
      NULL::text AS coa_application_number,
      TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')) AS address,
      p.lifecycle_phase
    FROM permits p
    WHERE p.permit_num ILIKE $1
      OR TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')) ILIKE $1
    ORDER BY p.last_seen_at DESC NULLS LAST
    LIMIT 20
  )
  UNION ALL
  (
    SELECT
      'coa'::text AS lead_type,
      NULL::text AS permit_num,
      NULL::text AS revision_num,
      c.application_number AS coa_application_number,
      COALESCE(c.address, '') AS address,
      c.lifecycle_phase
    FROM coa_applications c
    WHERE c.application_number IS NOT NULL
      AND (c.application_number ILIKE $1 OR c.address ILIKE $1)
    ORDER BY c.last_seen_at DESC NULLS LAST
    LIMIT 20
  )
`;

interface SearchRow {
  lead_type: 'permit' | 'coa';
  permit_num: string | null;
  revision_num: string | null;
  coa_application_number: string | null;
  address: string;
  lifecycle_phase: string | null;
}

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
      { status: 401 },
    );
  }

  const parsed = WatchlistSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return badRequestZod(parsed.error);
  const { q } = parsed.data;
  const pattern = `%${q}%`;

  const t0 = Date.now();
  try {
    const result = await pool.query<SearchRow>(SEARCH_SQL, [pattern]);

    const items: WatchlistSearchItem[] = result.rows.map((row) => ({
      ...row,
      // [ORC5] the ONE canonical key builder — byte-exact for the forecast join.
      lead_key:
        row.lead_type === 'permit'
          ? buildLeadKey({
              lead_type: 'permit',
              // SAFETY: the permit arm always selects non-null PK columns.
              permit_num: row.permit_num as string,
              revision_num: row.revision_num as string,
            })
          : buildLeadKey({
              lead_type: 'coa',
              // SAFETY: the coa arm filters application_number IS NOT NULL.
              coa_application_number: row.coa_application_number as string,
            }),
    }));

    const duration_ms = Date.now() - t0;
    // Public cadastral address query — not PII (Spec 89 §13 precedent).
    logInfo(TAG, 'watchlist search', {
      uid: adminCtx.uid,
      q,
      rows: items.length,
      duration_ms,
    });
    if (duration_ms > SLOW_QUERY_MS) {
      logWarn(TAG, 'slow_query', { duration_ms, q });
      Sentry.addBreadcrumb({
        category: 'slow_query',
        data: { route: 'GET /api/admin/leads/watchlist/search', duration_ms },
      });
    }

    // Spec 33 §13 — Zod-parse the response payload at the boundary.
    return ok(z.array(WatchlistSearchItemSchema).parse(items));
  } catch (cause) {
    return internalError(cause, {
      route: 'GET /api/admin/leads/watchlist/search',
      q,
    });
  }
});
