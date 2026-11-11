// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 dated note 2026-11-11 (MF-44: the MaxBLD web pages on synthetic
//            goldens; the live switch), §11b.7 W4-W6, .cursor/MCFRONTEND-QUEUE.md MF-44 dated notes 2026-11-11 (MB-44 for live data only).
//
// MF-44 · the MaxBLD web pages as data (operator "Build Mf-44 on synthetic goldens" and "01-a 0-2 b as long as they are complaint").
// The mount files import this module (an allowed @/lib/ path, FE-31 C-2) instead of reaching scripts/ themselves (the MF-37 surfaces.ts pattern).
import searchContent from '../../../scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json';
import type { WebSituation } from '@/components/surfaces/web/SearchBinding';

/**
 * THE LIVE SWITCH (O-2 b). While false: the web search sends no lookup request (a lookup hit charges a report, src/app/api/parcels/lookup/route.ts,
 * the meter call), and the web report route answers not found for every lot after the sign-in and plan check. It is flipped to true by the
 * row that lands the live report data (MB-44), together with the web target of mobile_parcel_detail and the report meter on the web route.
 * Pinned false by src/tests/maxbld-web-pages.logic.test.ts.
 * Conditions owed by the row that flips it (MF-44 OUTPUT panel, security F2): the lookup route meters only same-origin, non-prefetch requests on
 * the cookie path (PLAN security S-5); the web page's lookup shares the `parcels-lookup:{uid}` rate bucket (S-6); the web never navigates to the
 * core's `disambiguate?q=` path (the map page is MF-53, and `q` never goes in a URL, S-7); the mount passes its action callbacks (until then every
 * control renders disabled).
 */
export const MAXBLD_WEB_LIVE: boolean = false; // typed boolean so the guarded branches stay reachable to the type checker (OUTPUT panel, DeepSeek F13)

/** The search page strings: the one content file of mobile_parcel_search (shared with the app; SV-SBIND judges its keys). */
export const SEARCH_CONTENT: Record<string, string> = searchContent;

const NO_ERRORS: WebSituation['errors'] = { rateLimited: false, retryAfterSeconds: null, entitlement: false, unexpected: false, schemaDrift: false };

/** The idle page (the descriptor's `static` state) with no recent searches: the web keeps no search history (no store; MF-44 security S-4). */
export const WEB_STATIC_SITUATION: WebSituation = {
  input: '', query: '', outcome: 'idle', isFetching: false, errors: NO_ERRORS, candidates: [], overCap: false,
  showMiss: false, showPrompt: true, recent: [], selectedParcelId: null, route: null,
};

/** A signed-in user without an active parcel_tool plan: the descriptor's own `unauthorized` state (the entitlement notice, no prompt). */
export const WEB_UNAUTHORIZED_SITUATION: WebSituation = {
  ...WEB_STATIC_SITUATION, errors: { ...NO_ERRORS, entitlement: true }, showPrompt: false,
};

/** The segment's error boundary: the descriptor's own `error` state (the error notice and Retry, which resets the boundary). */
export const WEB_ERROR_SITUATION: WebSituation = {
  ...WEB_STATIC_SITUATION, errors: { ...NO_ERRORS, unexpected: true }, showPrompt: false,
};
