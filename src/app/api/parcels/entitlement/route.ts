// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 rules 5-6 (MF-45, dated note 2026-11-11)
// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6 (the shape drives the client state machine)
//
// GET /api/parcels/entitlement — the caller's parcel_tool plan and this billing month's report counts (MF-45, the
// entitlement read contract; operator 2026-11-11 "4. will we need to build this later.. we have the tokens now").
// Read by the app search page's reports-left line (the left count, the allowance and the served reset label) and the Account page. A display, never a gate: the lookup's
// 403 REPORT_LIMIT_REACHED is the gate. Every value is server-computed (FE-05).
//
// Auth: getCurrentUserContext FIRST await (Spec 90 §11; route-guard '/api/parcels'). No entitlement guard: it reports
// the entitlement, including its absence (no parcel_tool row -> 200 with every field null).
// Rate: `parcels-entitlement:${uid}`, a 60 s window; the count is the setting parcel_entitlement_read_per_min (default 30), read through readSearchSettings
//   after auth and before the limiter (task-454 SEARCHFIX.6; operator, verbatim, 2026-11-20: "yes follow the rules register them.", MORNING-DECISIONS.md:1494;
//   Spec 128 Rule 3); a missing or out-of-bounds row is the generic 500. Prior text: "30/min". Read-only: no lock, no write.
// Log: a success logs uid and duration (task-454, g3 GROUNDER-F D4; the lot-size route's shape), never the counts.
// Status: 200 · 401 no session · 429 rate limited · 500 logged+sanitized.

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { pool } from '@/lib/db/client';
import { ok } from '@/features/leads/api/envelope';
import { internalError, rateLimited, unauthorized } from '@/features/leads/api/error-mapping';
import { readSearchSettings } from '@/lib/admin/parcel-lookup';
import { readParcelToolUsage } from '@/lib/entitlements';
import { logInfo } from '@/lib/logger';
import { ParcelToolEntitlementResponseSchema } from './types';

const TAG = '[api/parcel-entitlement]';
const RATE_WINDOW_SEC = 60; // "a minute"; the count is a setting (task-454)

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const ctx = await getCurrentUserContext(request, pool);
  if (!ctx) return unauthorized();
  const t0 = Date.now();

  let limit: number;
  try {
    limit = (await readSearchSettings(pool)).entitlement_per_min;
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/parcels/entitlement' });
  }

  const rateLimit = await withRateLimit(request, {
    key: `parcels-entitlement:${ctx.uid}`,
    limit,
    windowSec: RATE_WINDOW_SEC,
  });
  if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);

  try {
    const usage = await readParcelToolUsage(pool, ctx.uid);
    const body = ParcelToolEntitlementResponseSchema.parse(usage);
    logInfo(TAG, 'parcel entitlement', { uid: ctx.uid, duration_ms: Date.now() - t0 });
    return ok(body);
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/parcels/entitlement' });
  }
});
