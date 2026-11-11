// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.9 (user inputs; dated note 2026-11-11), §11a.4 (provenance)
// 🔗 SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-19, FE-20; docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §5
//
// POST /api/parcels/lot-size — MF-19 (operator 2026-11-11, D-1..D-8 "all as recommmended"): a signed-in user enters the lot area of one lot,
// once. The entry is its own record (parcel_user_inputs, D-1 a) that wins over the City value for every reader; the City value stays.
//
// Order (the lookup route's pattern, Spec 90 §11):
//   1. auth — getCurrentUserContext FIRST (401).
//   2. the switch — readLotSizeSettings, ONE read; OFF -> 403 ENTRY_OFF before anything else is read or written (D-6; the lock test proves it).
//      It is OFF today (seed bounds 0-0): this route cannot write until the flip (MB-42 and the one-lot re-evaluation row, D-8).
//   3. the entitlement gate (D-4): the lookup's status check on this base. Restack note: on MF-45 it becomes MF-45's parcel_tool arm
//      (getEntitlementStatus(pool, uid, 'parcel_tool') in ACTIVE_SUBSCRIPTION_STATUSES), the same form as the lookup gate there.
//   4. strict body parse (400; an extra key such as entered_by is refused) BEFORE the rate limit, so a mistyped form does not burn the bucket.
//   5. rate — the existing withRateLimit, bucket parcels-lot-size:{uid}, window one day, limit from the admin setting (D-4: 5 a day) -> 429.
//   6. one transaction — 404 unknown lot, 409 LOT_SIZE_ALREADY_ENTERED (with the stored entry), 400 OUT_OF_RANGE / FAR_FROM_CITY_RECORD with the
//      server-formatted message (D-2, D-3), else the insert (source 'user', entered_at by the DB clock).
// Log hygiene (fold F7): uid, parcel_id, outcome, duration — never the typed value; logError context is a whitelist (never the body).

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { pool, withTransaction } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, forbiddenSubscription, internalError, rateLimited, unauthorized } from '@/features/leads/api/error-mapping';
import { logInfo } from '@/lib/logger';
import { insertLotSizeEntry, LotSizeRefusal, readLotSizeSettings } from '@/lib/parcels/lot-size-entry';
import { LotSizeEntryRequestSchema, LotSizeEntryResponseSchema } from './types';

const TAG = '[api/parcel-lot-size]';
const ROUTE = 'POST /api/parcels/lot-size';
const RATE_WINDOW_SEC = 86_400; // D-4: "a day"; the count is the admin setting user_lot_size_entries_per_day

// Statuses that grant app content (the lookup route's set on this base, Spec 96 §10).
const ACTIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(['trial', 'active', 'past_due', 'admin_managed']);

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  // 1. Auth — the first call (Spec 90 §11).
  const ctx = await getCurrentUserContext(request, pool);
  if (!ctx) return unauthorized();
  const t0 = Date.now();
  const done = (outcome: string, parcel_id: string | null) =>
    logInfo(TAG, 'lot size entry', { uid: ctx.uid, outcome, parcel_id, duration_ms: Date.now() - t0 });

  try {
    // 2. The switch: OFF refuses before any other read or write (D-6).
    const settings = await readLotSizeSettings(pool);
    if (!settings.enabled) {
      done('entry_off', null);
      return err('ENTRY_OFF', 'Lot size entry is not open yet', 403);
    }

    // 3. Entitlement gate (D-4) — before the body is read.
    if (!ACTIVE_SUBSCRIPTION_STATUSES.has(ctx.subscription_status ?? '')) {
      done('forbidden', null);
      return forbiddenSubscription();
    }

    // 4. Strict body parse.
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return err('INVALID_JSON', 'Request body is not valid JSON', 400);
    }
    const parsed = LotSizeEntryRequestSchema.safeParse(raw);
    if (!parsed.success) return badRequestZod(parsed.error);
    const body = parsed.data;

    // 5. Rate: the admin-editable entries a day, through the existing limiter.
    const rl = await withRateLimit(request, { key: `parcels-lot-size:${ctx.uid}`, limit: settings.per_day, windowSec: RATE_WINDOW_SEC });
    if (!rl.allowed) {
      done('rate_limited', body.parcel_id);
      return rateLimited(rl.remaining, RATE_WINDOW_SEC);
    }

    // 6. One transaction.
    try {
      const lot_size = await withTransaction((client) => insertLotSizeEntry(client, body, ctx.uid, settings));
      done('stored', body.parcel_id);
      return ok(LotSizeEntryResponseSchema.parse({ lot_size }));
    } catch (cause) {
      if (cause instanceof LotSizeRefusal) {
        done(cause.code === 'LOT_SIZE_ALREADY_ENTERED' ? 'already_entered' : cause.status === 404 ? 'not_found' : 'out_of_range', body.parcel_id);
        return err(cause.code, cause.message, cause.status, cause.details);
      }
      throw cause;
    }
  } catch (cause) {
    return internalError(cause, { route: ROUTE, uid: ctx.uid });
  }
});
