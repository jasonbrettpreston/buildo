// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 rules 5-6 (MF-45, dated note 2026-11-11)
// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6 (the shape drives the client state machine)
//
// GET /api/parcels/entitlement — the caller's parcel_tool plan and this billing month's report counts (MF-45, the
// entitlement read contract; operator 2026-11-11 "4. will we need to build this later.. we have the tokens now").
// Read by the search page line "N of 20 reports left" and the Account page. A display, never a gate: the lookup's
// 403 REPORT_LIMIT_REACHED is the gate. Every value is server-computed (FE-05).
//
// Auth: getCurrentUserContext FIRST await (Spec 90 §11; route-guard '/api/parcels'). No entitlement guard: it reports
// the entitlement, including its absence (no parcel_tool row -> 200 with every field null).
// Rate: `parcels-entitlement:${uid}` 30/min. Read-only: no lock, no write.
// Status: 200 · 401 no session · 429 rate limited · 500 logged+sanitized.

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { pool } from '@/lib/db/client';
import { ok } from '@/features/leads/api/envelope';
import { internalError, rateLimited, unauthorized } from '@/features/leads/api/error-mapping';
import { readParcelToolUsage } from '@/lib/entitlements';
import { ParcelToolEntitlementResponseSchema } from './types';

const RATE_WINDOW_SEC = 60;
const ENTITLEMENT_LIMIT_PER_MIN = 30;

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const ctx = await getCurrentUserContext(request, pool);
  if (!ctx) return unauthorized();

  const rateLimit = await withRateLimit(request, {
    key: `parcels-entitlement:${ctx.uid}`,
    limit: ENTITLEMENT_LIMIT_PER_MIN,
    windowSec: RATE_WINDOW_SEC,
  });
  if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);

  try {
    const usage = await readParcelToolUsage(pool, ctx.uid);
    return ok(ParcelToolEntitlementResponseSchema.parse(usage));
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/parcels/entitlement' });
  }
});
