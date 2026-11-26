// SPEC LINK: docs/specs/00-architecture/116_multi_product_architecture.md (OD5 — MaxBLD is its own
//            product; the parcel product shows no lead-gen navigation)
//            docs/specs/03-mobile/91_mobile_lead_feed.md §2 (the five-tab bar this governs)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (SHELL archetype)
//
// Leaf module for the app shell's routing decisions. ZERO side-effect imports — no reanimated, no
// expo-router, no stores — so it and its unit tests can run without dragging the native-module
// graph into the test environment (the `mobile/src/lib/errors.ts` precedent, Spec 99 §9.6).

/**
 * Route groups inside `(app)` that own their OWN navigation shelf, and for which the five-tab
 * lead-gen bar (S-046 `shell_app_tabs`: Lead Feed · Flight Board · Map · Parcels · Settings) must
 * not be rendered.
 *
 * `parcel-tool` is the MaxBLD product (Spec 116 OD5). Its shell is S-004
 * `shell_parcel_tool_stack`, which draws a three-tab shelf — Lookup · Tracked Lots · Account.
 * Showing both bars would put lead-gen navigation inside a product that has no lead-gen concepts.
 */
export const SELF_SHELVED_ROUTES: ReadonlySet<string> = new Set(['parcel-tool']);

/**
 * Should the five-tab bar be hidden for the currently focused route?
 *
 * A pure function of the route name, so the decision is testable and cannot drift into component
 * state. Hiding the bar — rather than moving `parcel-tool` out of the `(app)` group — is
 * deliberate: `(app)/_layout.tsx`'s subscription gate returns before `<Tabs>` renders, so leaving
 * the group would take the parcel product out from behind that gate.
 */
export function shouldHideAppTabBar(focusedRouteName: string | undefined): boolean {
  return focusedRouteName != null && SELF_SHELVED_ROUTES.has(focusedRouteName);
}

// task-313 (McApp card 1, the front door; PLAN-313-v1 M1; RR-0499 "1a", MORNING-DECISIONS.md:2598: the MaxBLD app lives inside the one project, sign-in
// goes straight to search, the MaxBLD bar is the only bar, the lead-app screens stay in the code unreachable). Still a leaf: no import of any kind.

/** Which app this build is. The one switch that keeps the lead path compiled for the other app (Spec 116 dated note 2026-11-25). */
export const APP_PRODUCT: 'parcel_tool' | 'lead_gen' = 'parcel_tool';

/** Where the MaxBLD front door lands: the Lookup tab. Equal to PARCEL_TAB_ROUTE.lookup (mobile/src/lib/parcelSearchMatch.ts), pinned by appShell.test.ts. */
export const MAXBLD_LOOKUP_ROUTE = '/(app)/parcel-tool';

/** The (app) child segment of the MaxBLD routes, derived from MAXBLD_LOOKUP_ROUTE (its last path part), so a nested route such as [parcelId] enters. */
const MAXBLD_SEGMENT = MAXBLD_LOOKUP_ROUTE.split('/').pop();

/** The answer of the front door: draw the Opening (loading, offline, error), send the person to the Lookup, or let the route draw. */
export type MaxbldGate = 'loading' | 'offline' | 'error' | 'redirect' | 'enter';

/** What the gate reads: stable signals only (Spec 99 §6.5): the entitlement read's status and fetchStatus, never isFetching. */
export interface MaxbldGateInput {
  hydrated: boolean;
  signedIn: boolean;
  read: { status: 'pending' | 'error' | 'success'; fetchStatus: 'fetching' | 'paused' | 'idle'; hasData: boolean };
  segments: readonly string[];
  /** How long the read has been without data since the gate mounted or Try again was pressed. */
  pendingMs: number;
  /** The bound past which a read still pending is an error: REPORT_GIVE_UP_MS, passed in by the mount (no setting of its own). */
  giveUpMs: number;
}

/**
 * The MaxBLD front door (PLAN-313-v1 M1). Once the read has data the answer never flips back to the Opening: a failed refetch keeps 'enter' (Spec 99 §6.5
 * stable gate). The plan is not checked here: the server 403 on the parcel routes is the plan check (RR-0503 Q1 A). The redirect is a convenience, not the
 * control: every retained lead route is protected by server authorisation alone.
 */
export function decideMaxbldGate(input: MaxbldGateInput): MaxbldGate {
  if (input.read.hasData) return input.segments[1] === MAXBLD_SEGMENT ? 'enter' : 'redirect';
  if (!input.hydrated || !input.signedIn) return 'loading';
  if (input.read.fetchStatus === 'paused') return 'offline';
  if (input.read.status === 'error') return 'error';
  if (input.pendingMs >= input.giveUpMs) return 'error';
  return 'loading';
}
