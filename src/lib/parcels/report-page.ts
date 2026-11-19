// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (dated note 2026-11-12, MF-48 Stage B: the nullable `page`),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 dated note 2026-11-11 (MF-48 D-4 a: the page view is built by MF-57's
//            core on the server, never a second resolver), §11a.7 dated note 2026-11-12 (Stage B), Spec 69a MB-44 (the customer report waits MB-38).
//
// MF-48 Stage B · the server half of the mobile report (operator 2026-11-12 "Ball y", B-3 a). The lookup route asks ONE producer for the lot's
// page response ({page, values, hidden, not_evaluated}, the input of MF-57's buildPage) and, when there is one, sends the mobile page view
// pageViewOf(buildPage(response), {target: 'mobile'}) as `page`. The core checks the tree and the view and throws on any problem (fail closed: the
// route's catch makes it a 500, never a half page).
// MB-44 W (task-123, 1.3; operator "1. it has to happen now - read the objectives", MORNING-DECISIONS.md:789, and "task 341 approved", :1160): the
// customer producer is W below. It is gated by the one web live switch (MAXBLD_WEB_LIVE, pinned false until LS.12), so with the switch off it answers
// null for every lot and reads no lot data. With it on it reads the lot's STORED results through the shared read in src/lib/report-projection/ (the same
// SQL and projection as the admin preview, shared OUT of the admin producer so lock L1 stays true: this module never imports it) and answers a page only
// when the stored record is current (or the lot is gated); a missing or stale record is a miss (null), which LOAD.1 reads as "compute". W holds no
// user check, meters nothing and writes nothing: the callers (session, plan, rate limit, meter) run around it. The tester feed of MB-94 part (f) lands
// behind its own switch and import fence.
// LOAD.1 (task-266): the lookup route asks W first and, on a miss, the one-lot compute (src/lib/parcels/report-compute.ts); that entry applies the SAME
// miss rule through the exported pageForVerdict below (one place), so a computed lot and a stored lot are served or missed by one rule.
// (Integrated with the board head, merge ba7953933.)
import { pool } from '@/lib/db/client';
import { logWarn } from '@/lib/logger';
import { readStoredPage, type StoredPage } from '@/lib/report-projection/read-stored';
import { MAXBLD_WEB_LIVE } from '@/lib/surfaces/maxbld-web';
import { buildPage, pageViewOf } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';
import { ReportPageViewSchema, type ReportPageView } from '@/app/api/parcels/lookup/types';

type Json = Record<string, unknown>;

/** The page view target the app renders (report-layout.json targets). */
const MOBILE_TARGET = 'mobile';

const TAG = '[parcels/report-page]';

/**
 * What a lot's stored freshness verdict becomes for a customer: ONE place, so a different ruling is a one-branch change (plan D2).
 * current and gated serve the page (a gated lot is a deliberate all-not-evaluated page, not a miss); out_of_date is a miss (a stale record is never
 * served, doc-16 section 4); not_stored is a miss (no record yet: LOAD.1 computes at the pick). D2 (what a no-record lot shows): to show the
 * "Not yet evaluated" page for a lot with no record instead, change the `not_stored` branch to `return stored.response`.
 */
export function pageForVerdict(stored: StoredPage): Json | null {
  switch (stored.lineage.freshness.verdict) {
    case 'current':
    case 'gated':
      return stored.response as unknown as Json;
    case 'out_of_date':
      return null;
    case 'not_stored': // D2
      return null;
  }
}

/**
 * The customer page producer (W). `parcelRef` is parcels.parcel_id. Null = a miss: the switch is off, no such parcel, or no current stored record.
 * A thrown query propagates (the route's catch makes it a 500); it is never read as a miss.
 */
export async function readCustomerPageResponse(parcelRef: string): Promise<Json | null> {
  if (!MAXBLD_WEB_LIVE) return null;
  const stored = await readStoredPage(pool, parcelRef);
  if (stored === null) return null;
  const { verdict, not_stored_reason } = stored.lineage.freshness;
  if (verdict === 'not_stored' && not_stored_reason === 'table_absent') logWarn(TAG, 'scenario table absent: every lot is a miss', { reason: not_stored_reason });
  return pageForVerdict(stored);
}

/** One producer response to the mobile page view, through MF-57's core (it throws a ReportRenderError on any problem), parsed by the strict view
 * schema of the lookup contract (a ZodError on a stray key: the route's catch makes either a 500). */
export function mobilePageView(response: Json): ReportPageView {
  return ReportPageViewSchema.parse(pageViewOf(buildPage(response, reportCtx), { target: MOBILE_TARGET }, reportCtx));
}
