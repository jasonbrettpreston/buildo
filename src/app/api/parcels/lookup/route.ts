// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 (API), header item 2 (dated note 2026-11-11)
// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §7 + §11b.7 rules 5-6 (MF-45, dated note 2026-11-11)
//
// GET /api/parcels/lookup — CONSUMER (mobile) read-only lookup for the Parcel Cost Tool.
// ?q=<address> (free-text → exact | ≤10 candidates) XOR ?parcelId=<id> (direct — candidate click).
// A miss OR an unknown parcelId is a valid 200 result (match:null, parcel:null), NOT a 404
// (Spec 100 §2.6 — the shape drives the client state machine).
//
// Auth: getCurrentUserContext FIRST await (Spec 90 §11; blanket-guarded by route-guard '/api/parcels').
// Gate: server-side entitlement check (Spec 100 §5), per product (MF-45, D-4 a): a parcel_tool entitlement in
//   ACTIVE_SUBSCRIPTION_STATUSES → metered; else the lead_gen status in the same set → the App A shelf, UNMETERED, a
//   declared deviation MF-50 removes; else 403 — before any parcel DB work.
// Meter: on a hit for a parcel_tool holder, after the .strict() parse, openReport (usage_events, one row per new lot in
//   the billing month); a new lot past the allowance → 403 REPORT_LIMIT_REACHED, no payload. Fail closed: a meter error
//   is a 500, never an unmetered payload.
// Rate: `parcels-search:${uid}` 60/min on the q path; `parcels-lookup:${uid}` 30/min on parcelId.
// Response: the WHITELIST (Spec 100 §3.2) — Tier 1 cost menu + headline areas, Tier 2 neighbourhood;
// NO Tier-3 `groups` (the .strict() boundary parse rejects a leak).
// Log hygiene: uid + outcome + parcelId + matchType + duration + access + meter — NEVER the raw q (Spec 100 §2.8).
//
// Status: 200 ok (hit, candidates, or miss) · 400 bad params · 401 no session · 403 inactive sub
//   (SUBSCRIPTION_REQUIRED) or monthly limit (REPORT_LIMIT_REACHED) · 429 rate limited · 500 logged+sanitized.

import type { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { pool, withTransaction } from '@/lib/db/client';
import { ok } from '@/features/leads/api/envelope';
import {
  badRequestZod,
  forbiddenSubscription,
  internalError,
  rateLimited,
  reportLimitReached,
  unauthorized,
} from '@/features/leads/api/error-mapping';
import { ACTIVE_SUBSCRIPTION_STATUSES, getEntitlementStatus, openReport } from '@/lib/entitlements';
import { logInfo, logWarn } from '@/lib/logger';
import { resolveAddress, fetchParcelById, fetchCoaProjects } from '@/lib/admin/parcel-lookup';
import { assembleConsumerPayload } from '@/lib/parcels/consumer-lookup';
import {
  ConsumerParcelLookupQuerySchema,
  ConsumerParcelLookupResponseSchema,
  type ConsumerParcelLookupResponse,
} from './types';

const TAG = '[api/parcel-lookup]';
const SLOW_QUERY_MS = 500;
const RATE_WINDOW_SEC = 60;
const SEARCH_LIMIT_PER_MIN = 60; // q path — typeahead exploration is chatty (Spec 100 §3)
const LOOKUP_LIMIT_PER_MIN = 30; // parcelId path — detail budget kept separate

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // 1. Auth — Firebase uid + profile (Bearer for mobile). The first call (Spec 90 §11).
  const ctx = await getCurrentUserContext(request, pool);
  if (!ctx) return unauthorized();

  // 2. Entitlement gate (Spec 100 §5) — the proprietary cost model is not served to a lapsed
  //    or deleted account, even if a stale client bypasses the UI gate. Per product (MF-45, D-4 a):
  //    parcel_tool first (metered everywhere); else the lead_gen status (ctx.subscription_status, the
  //    LEAD_GEN_ENTITLEMENT_JOIN) on the transitional App A path, unmetered until MF-50 removes it.
  //    ACTIVE_SUBSCRIPTION_STATUSES is the one Spec 96 §10 status set, shared by both arms.
  const parcelTool = await getEntitlementStatus(pool, ctx.uid, 'parcel_tool');
  let access: 'parcel_tool' | 'lead_gen_transitional';
  if (parcelTool && ACTIVE_SUBSCRIPTION_STATUSES.has(parcelTool.status)) access = 'parcel_tool';
  else if (ACTIVE_SUBSCRIPTION_STATUSES.has(ctx.subscription_status ?? '')) access = 'lead_gen_transitional';
  else return forbiddenSubscription();

  // 3. Validate query — exactly one of q | parcelId.
  const sp = new URL(request.url).searchParams;
  const parsed = ConsumerParcelLookupQuerySchema.safeParse({
    q: sp.get('q') ?? undefined,
    parcelId: sp.get('parcelId') ?? undefined,
  });
  if (!parsed.success) return badRequestZod(parsed.error);
  const { q, parcelId } = parsed.data;

  // 4. Rate limit — separate buckets so heavy searching cannot exhaust the detail budget.
  const rl = q
    ? { key: `parcels-search:${ctx.uid}`, limit: SEARCH_LIMIT_PER_MIN }
    : { key: `parcels-lookup:${ctx.uid}`, limit: LOOKUP_LIMIT_PER_MIN };
  const rateLimit = await withRateLimit(request, { key: rl.key, limit: rl.limit, windowSec: RATE_WINDOW_SEC });
  if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);

  const t0 = Date.now();
  try {
    // Resolution: direct id (candidate click) bypasses address parsing.
    const resolution = parcelId
      ? { match: { parcelId, matchType: 'direct' as const, address: '' }, candidates: [], truncated: false }
      : await resolveAddress(q!);

    let response: ConsumerParcelLookupResponse = {
      match: resolution.match,
      candidates: resolution.candidates,
      warnings: resolution.truncated ? ['more matches exist — refine the address (e.g. add a unit number)'] : [],
      parcel: null,
    };

    // The matched parcels.parcel_id of the fetched row: the meter's subject_key (R-04 parcel_ref), never request text.
    let parcelRef: string | null = null;
    if (resolution.match) {
      const row = await fetchParcelById(resolution.match.parcelId);
      if (!row) {
        // An unknown parcelId (dangling id / direct path) is a 200 miss, NOT a 404 (§2.6).
        response = { match: null, candidates: [], warnings: [], parcel: null };
      } else {
        const nbhdId = row.neighbourhood_id == null ? null : Number(row.neighbourhood_id);
        const coaProjects = await fetchCoaProjects(nbhdId); // NULL-neighbourhood → []
        const { payload, warnings } = assembleConsumerPayload(row, coaProjects);
        parcelRef = String(row.parcel_id);
        response = {
          match: { ...resolution.match, address: resolution.match.address || String(row.__display_address ?? '') },
          candidates: [],
          warnings,
          parcel: payload,
        };
      }
    }

    // Boundary validation of OUR OWN assembled shape — the .strict() parse rejects any Tier-3 leak.
    // It runs BEFORE the meter, so a response that fails it charges nothing (MF-45 fold 3).
    const body = ConsumerParcelLookupResponseSchema.parse(response);

    // Meter (MF-45): only a hit (a report shown) on the parcel_tool path counts. Candidates, a miss or a
    // dangling id show no report and count nothing. Under the row lock the status is re-tested.
    let meter: 'counted' | 'already_counted' | 'limit_reached' | 'not_entitled' | 'none' | 'unmetered' =
      access === 'parcel_tool' ? 'none' : 'unmetered';
    let refusal: ReturnType<typeof reportLimitReached> | ReturnType<typeof forbiddenSubscription> | null = null;
    if (access === 'parcel_tool' && body.parcel && parcelRef !== null) {
      const ref = parcelRef;
      const m = await withTransaction((client) => openReport(client, ctx.uid, ref));
      meter = m.kind;
      if (m.kind === 'limit_reached') refusal = reportLimitReached(m.reportsLimit, m.resetsOn);
      else if (m.kind === 'not_entitled') refusal = forbiddenSubscription();
    }

    // Observability (Spec 100 §2.8) — outcome + parcelId + matchType + duration + access + meter; NEVER the raw q.
    const duration_ms = Date.now() - t0;
    const outcome = response.match ? 'hit' : response.candidates.length ? 'candidates' : 'miss';
    logInfo(TAG, 'consumer parcel lookup', {
      uid: ctx.uid,
      outcome,
      parcelId: response.match?.parcelId ?? parcelId ?? null,
      matchType: response.match?.matchType ?? null,
      duration_ms,
      access,
      meter,
    });
    if (duration_ms > SLOW_QUERY_MS) {
      logWarn(TAG, 'slow_query', { duration_ms, outcome });
    }

    if (refusal) return refusal;
    return ok(body);
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/parcels/lookup' });
  }
});
