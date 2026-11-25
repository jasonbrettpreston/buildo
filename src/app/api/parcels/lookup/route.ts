// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3 (API), header item 2 (dated note 2026-11-11)
// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §7 + §11b.7 rules 5-6 (MF-45, dated note 2026-11-11)
//
// GET /api/parcels/lookup — CONSUMER (mobile) read-only lookup for the Parcel Cost Tool.
// ?q=<address> (free-text → exact | at most the candidate cap setting of candidates) XOR ?parcelId=<id> (direct — candidate click).
// A miss OR an unknown parcelId is a valid 200 result (match:null, parcel:null), NOT a 404
// (Spec 100 §2.6 — the shape drives the client state machine).
//
// Auth: getCurrentUserContext FIRST await (Spec 90 §11; blanket-guarded by route-guard '/api/parcels').
// Gate: server-side entitlement check (Spec 100 §5), per product (MF-45, D-4 a): a parcel_tool entitlement in
//   ACTIVE_SUBSCRIPTION_STATUSES → metered; else the lead_gen status in the same set → the App A shelf, UNMETERED, a
//   declared deviation MF-50 removes; else 403 — before any parcel DB work.
// Meter: for a parcel_tool holder, after the .strict() parse, openReport (usage_events, one row per new lot in the billing month) runs only
//   when a report is PRODUCED for the found lot: a hit whose response carries `page`. Dated 2026-11-19 (operator, RR-0278, verbatim "it shouldnt
//   count the report unless the report is produced. I should only be charged a report if I find the address and lot Im looking for and a report
//   is produced"; MORNING-DECISIONS.md:1082): a lookup that ends in candidates, no-match, the lot map, a dangling id, a hit with no page, or an
//   unsure lot whose semi question comes first counts nothing. Prior text: a hit with an evaluated option counted at the lookup (route.ts:161).
//   SRCH.METER-2 (task-360, 2026-11-19): that unsure lot's `page` is not sent either (null; neither the stored read nor the compute runs, meter semi_pending) until
//   the request carries semi=answered, so a page that is sent is a page that is counted. Prior text: the page was sent and only the meter said semi_pending.
//   A new lot past the allowance → 403 REPORT_LIMIT_REACHED, no payload. Fail closed: a meter error is a 500, never an unmetered payload.
// Rate: `parcels-search:${uid}` on the q path and `parcels-lookup:${uid}` on parcelId, a 60 s window; the per-minute counts are the settings
//   parcel_lookup_search_per_min (default 60) and parcel_lookup_detail_per_min (default 30). task-454 SEARCHFIX.6 (operator, verbatim, 2026-11-20: "yes
//   follow the rules register them.", MORNING-DECISIONS.md:1494; Spec 128 Rule 3): they, the slow-query mark (parcel_lookup_slow_query_ms) and the
//   candidate cap (maxbld_page_candidate_cap) are read in ONE read (readSearchSettings) after the parse and before the limiter, whose number comes from
//   it; a missing or out-of-bounds row is the generic 500. Prior text: "60/min on the q path; 30/min on parcelId" (typed constants).
// MF-48 Stage B (Spec 100 §3.2 dated note 2026-11-12, B-3 a): a hit also carries `page`, the mobile report page view built by MF-57's core from the
//   lot's producer response (src/lib/parcels/report-page.ts); null for every lot until MB-44 serves one. The meter is unchanged by it.
// Response: the WHITELIST (Spec 100 §3.2) — Tier 1 cost menu + headline areas, Tier 2 neighbourhood;
// NO Tier-3 `groups` (the .strict() boundary parse rejects a leak).
// Log hygiene: uid + outcome + parcelId + matchType + resolution + map counts + duration + access + meter — NEVER the raw q, the map address,
//   the pin or the start view (Spec 100 §2.8; MF-53 security L-4).
// MF-53 (Spec 100 §2.6 / §3.2 dated note 2026-11-11): every response names its `resolution`; `map` (lot outlines, pin, start view, faint
//   neighbours) is read and sent ONLY for multi_parcel / unlinked on the q path, from the resolver's own seed. It is not metered: no report
//   is shown (MF-45 fold 12). A map-read failure is a 500 through the catch below, never a silent fallback to the list.
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
import { openReport } from '@/lib/entitlements';
import { logInfo, logWarn } from '@/lib/logger';
import { hasEvaluatedOption } from '@/lib/parcels/consumer-lookup';
import { readSearchSettings, runLookupFlow } from '@/lib/parcels/lookup-flow';
import { parcelToolAccess } from '@/lib/parcels/tool-gate';
import { ConsumerParcelLookupQuerySchema } from './types';

const TAG = '[api/parcel-lookup]';
const RATE_WINDOW_SEC = 60; // the window of both buckets ("a minute"); the counts are settings (task-454)

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // 1. Auth — Firebase uid + profile (Bearer for mobile). The first call (Spec 90 §11).
  const ctx = await getCurrentUserContext(request, pool);
  if (!ctx) return unauthorized();

  // 2. Entitlement gate (Spec 100 §5) — the proprietary cost model is not served to a lapsed
  //    or deleted account, even if a stale client bypasses the UI gate. Per product (MF-45, D-4 a):
  //    parcel_tool first (metered everywhere); else the lead_gen status (ctx.subscription_status, the
  //    LEAD_GEN_ENTITLEMENT_JOIN) on the transitional App A path, unmetered until MF-50 removes it.
  //    ACTIVE_SUBSCRIPTION_STATUSES is the one Spec 96 §10 status set, shared by both arms.
  const access = await parcelToolAccess(pool, ctx);
  if (access === null) return forbiddenSubscription();

  // 3. Validate query — exactly one of q | parcelId.
  const sp = new URL(request.url).searchParams;
  const parsed = ConsumerParcelLookupQuerySchema.safeParse({
    q: sp.get('q') ?? undefined,
    parcelId: sp.get('parcelId') ?? undefined,
    semi: sp.get('semi') ?? undefined,
  });
  if (!parsed.success) return badRequestZod(parsed.error);
  const { q, parcelId, semi } = parsed.data;

  // 4. The search settings (task-454): one read; the limiter's number comes from it. A bad row throws to the generic 500 (no data, no database text).
  let settings: Awaited<ReturnType<typeof readSearchSettings>>;
  try {
    settings = await readSearchSettings(pool);
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/parcels/lookup' });
  }

  // 5. Rate limit — separate buckets so heavy searching cannot exhaust the detail budget (q: chatty typeahead exploration, Spec 100 §3).
  const rl = q
    ? { key: `parcels-search:${ctx.uid}`, limit: settings.search_per_min }
    : { key: `parcels-lookup:${ctx.uid}`, limit: settings.detail_per_min };
  const rateLimit = await withRateLimit(request, { key: rl.key, limit: rl.limit, windowSec: RATE_WINDOW_SEC });
  if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);

  const t0 = Date.now();
  try {
    // The flow (resolve, map, lot row, page, response, boundary parse) lives in src/lib/parcels/lookup-flow.ts (Standard 10.3); the meter and the log stay here (RR-0331).
    const { response, body, parcelRef, pageSource, computeMs } = await runLookupFlow({ q, parcelId, semi, candidateCap: settings.candidate_cap });

    // Meter (MF-45; RR-0278 2026-11-19): only a hit whose report is produced (`page` sent) on the parcel_tool path counts. Candidates, a miss, a
    // map or a dangling id show no report and count nothing; nor does an unsure lot before its semi question (SEMI-B, the app asks it before the
    // report shows). SRCH.SEMI stage 2 (task-319, MF-93): the semi page's Continue fetches again with `semi=answered`, which lifts that hold, so the lot then counts like any lot, once, and only if its report is produced. Under the row lock the status is re-tested.
    // Operator 2026-11-12, verbatim "1 b 2 a" (item 1 (b); Spec 100 §3.2 dated note): a hit with no evaluated option is served and
    // NOT counted (meter not_evaluated), so a report whose sizes and costs read "Not yet evaluated" costs the user nothing.
    let meter: 'counted' | 'already_counted' | 'limit_reached' | 'not_entitled' | 'none' | 'unmetered' | 'not_evaluated' | 'semi_pending' | 'not_produced' =
      access === 'parcel_tool' ? 'none' : 'unmetered';
    let refusal: ReturnType<typeof reportLimitReached> | ReturnType<typeof forbiddenSubscription> | null = null;
    if (access === 'parcel_tool' && body.parcel && parcelRef !== null && !hasEvaluatedOption(body.parcel)) meter = 'not_evaluated';
    else if (access === 'parcel_tool' && body.parcel && parcelRef !== null && body.lotForm?.unsure === true && semi !== 'answered') meter = 'semi_pending';
    else if (access === 'parcel_tool' && body.parcel && parcelRef !== null && body.page === null) meter = 'not_produced';
    else if (access === 'parcel_tool' && body.parcel && parcelRef !== null) {
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
      resolution: response.resolution,
      map_lots: response.map?.lots.length ?? null,
      map_neighbours: response.map?.neighbours.length ?? null,
      duration_ms,
      access,
      meter,
      lot_form: response.lotForm?.detected ?? null, // SEMI-B: the detected form, never the address
      lot_form_unsure: response.lotForm?.unsure ?? null,
      semi_answered: semi === 'answered', // SRCH.SEMI stage 2: the flag the semi page sends at Continue
      page: response.page !== null, // MF-48 Stage B: whether a report page was sent (never its content)
      page_source: pageSource, // LOAD.1: stored, computed or none
      compute_ms: computeMs, // LOAD.1: the compute entry's time when it ran (about 0 while the switch is off), null when W served the page
    });
    if (duration_ms > settings.slow_query_ms) {
      logWarn(TAG, 'slow_query', { duration_ms, outcome });
    }

    if (refusal) return refusal;
    return ok(body);
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/parcels/lookup' });
  }
});
