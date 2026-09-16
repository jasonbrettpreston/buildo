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
