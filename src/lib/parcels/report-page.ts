// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (dated note 2026-11-12, MF-48 Stage B: the nullable `page`),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 dated note 2026-11-11 (MF-48 D-4 a: the page view is built by MF-57's
//            core on the server, never a second resolver), §11a.7 dated note 2026-11-12 (Stage B), Spec 69a MB-44 (the customer report waits MB-38).
//
// MF-48 Stage B · the server half of the mobile report (operator 2026-11-12 "Ball y", B-3 a). The lookup route asks ONE producer for the lot's
// page response ({page, values, hidden, not_evaluated}, the input of MF-57's buildPage) and, when there is one, sends the mobile page view
// pageViewOf(buildPage(response), {target: 'mobile'}) as `page`. The core checks the tree and the view and throws on any problem (fail closed: the
// route's catch makes it a 500, never a half page).
// The customer producer is NONE today: no stored per-lot report exists for customers until MB-44 (McBylaws queue, WAITS MB-38), so it answers null
// for every lot and the app shows the approved miss text. It reads nothing: a declared read that refuses cleanly (the MB-86 / MB-93 precedent).
// MB-44 plugs its producer in here; the tester feed of MB-94 part (f) (EI-D2 b) lands with that part behind its own switch and import fence. The
// admin preview producer (src/lib/admin/report-preview-live/) is never imported here (lock L1, src/tests/admin-report-preview-live.logic.test.ts).
import { buildPage, pageViewOf } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';
import { ReportPageViewSchema, type ReportPageView } from '@/app/api/parcels/lookup/types';

type Json = Record<string, unknown>;

/** The page view target the app renders (report-layout.json targets). */
export const MOBILE_TARGET = 'mobile';

/** The customer page producer. Null for every lot until MB-44 (no customer report data exists yet). `parcelRef` is parcels.parcel_id. */
export async function readCustomerPageResponse(parcelRef: string): Promise<Json | null> {
  void parcelRef;
  return null;
}

/** One producer response to the mobile page view, through MF-57's core (it throws a ReportRenderError on any problem), parsed by the strict view
 * schema of the lookup contract (a ZodError on a stray key: the route's catch makes either a 500). */
export function mobilePageView(response: Json): ReportPageView {
  return ReportPageViewSchema.parse(pageViewOf(buildPage(response, reportCtx), { target: MOBILE_TARGET }, reportCtx));
}
