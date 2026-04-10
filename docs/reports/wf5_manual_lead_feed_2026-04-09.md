# WF5 Manual — Lead Feed scenario checklist (2026-04-09)

**Spec source:** `docs/specs/product/future/70_lead_feed.md` §4 Behavioral Contract + §Edge Cases, `docs/specs/product/future/75_lead_feed_implementation_guide.md` §4 component contracts.

**Anchor commits this checklist guards against:**
- Phase 3-vi `lead_key` prefix regression (fixed in `850d16b`) — §4 Save / Unsave Flow
- Phase 3 holistic auth + telemetry hygiene (fixed in `f543453`) — §5 Auth Lifecycle
- Phase 3 holistic accessibility + motion (fixed in `9e299ce`) — §3 Filter Sheet, §6 Mobile gestures
- Phase 3 holistic polish (fixed in `3cb46a6`) — §1 Cold-load happy path

**Execution notes:**
- Run on a real iOS Safari device when possible (the iOS-Safari-specific scenarios cannot be reproduced in Chrome DevTools mobile mode).
- Open Chrome DevTools or Safari Web Inspector with the Console + Network panels visible. Each scenario should be observed via real network activity, not assumed.
- For PostHog assertions, set `localStorage.setItem('ph-debug-events', 'true')` so events log to the console.
- Mark each item PASS / FAIL / N-A. Any FAIL → file a WF3 immediately with bug name + repro steps + expected behaviour, then continue (don't block on the failing item).
- Bottom of doc has a place to record WF3s filed during this run.

---

## 1. Cold-load happy path

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 1.1 | Sign in + navigate to `/leads` for the first time after a fresh session | Geolocation prompt shown by browser; on grant, header populates with "Near you · {radius}km" | ☐ |
| 1.2 | Header reflects the persisted radius (default 10km from a fresh user) | Reads "Near you · 10km" or "Set location · 10km" | ☐ |
| 1.3 | First page of leads renders within ~2s of fetch resolve | 15 cards visible (or fewer if the radius is sparse); no skeleton flash after data arrives | ☐ |
| 1.4 | Lead count readout matches the number of rendered cards | "{N} leads" / "1 lead" pluralization correct | ☐ |
| 1.5 | Cards are visibly ordered by relevance (highest score first by visual inspection of timing borders, dollar amounts, distance) | Top card has the strongest combination of score pillars | ☐ |
| 1.6 | Cost display formats — find a card with `> $999K` and `< $1M` cost | Shows "$NNK" (NOT "$1000K"). Closer-to-1M values still show "$999K" until they actually cross $1M, then "$1.0M". (Phase F1 fix) | ☐ |
| 1.7 | Each card carries a SaveButton (heart). Initial state matches server | Hearts that should be saved are filled (red/amber); unsaved are outline | ☐ |

## 2. Empty / loading / error states

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 2.1 | First-load skeleton (DevTools throttle Slow 3G + reload) | 3 skeleton cards render before data arrives | ☐ |
| 2.2 | Empty trade-zone — set radius small (5km) in a sparse area | EmptyLeadState component, "Closest lead is X km away" message, expand-radius CTA | ☐ |
| 2.3 | Server 500 — temporarily kill the API by stopping the dev server, then attempt a fresh fetch | Error boundary surfaces a retry CTA, NOT a blank screen | ☐ |
| 2.4 | Geolocation **denied** by user (revoke permission in browser settings, reload `/leads`) | Header shows "Set location" + a CTA path to set location manually; feed does not silently use (0,0) | ☐ |
| 2.5 | Geolocation **timeout** (DevTools → Sensors → Location: "no location") | Same fallback as denial; no infinite spinner | ☐ |
| 2.6 | Rate limit exceeded — hit `/api/leads/feed` 100 times in <60s via the browser console | UI shows "Too many requests" message + auto-retry; PostHog `lead_feed.client_error` fires once with `code: 'RATE_LIMITED'` (or similar bounded code) | ☐ |
| 2.7 | Sustained error state from 2.3 — stay on the error screen for 30s, the same error should NOT spam telemetry | Only ONE `lead_feed.client_error` event in the PostHog console, not many (Phase E1 dedupe) | ☐ |

## 3. Filter sheet

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 3.1 | Tap the location/radius button in the header | Vaul drawer slides up from bottom (NOT a centered modal) | ☐ |
| 3.2 | All 5 radius options visible: 5 / 10 / 20 / 30 / 50 km | All 5 fit on screen at 320px (iPhone SE) — none clipped, none cut off the right edge. (Phase D2 flex-wrap fix) | ☐ |
| 3.3 | Currently-selected radius is visually highlighted | The active option has the data-state=on style | ☐ |
| 3.4 | Tap a different radius (e.g., 10 → 20) | Sheet does NOT close; feed re-fetches in the background; header readout updates to "20km" | ☐ |
| 3.5 | Tap the SAME radius again (deselect attempt) | Zustand `radiusKm` stays at the current value; NO `lead_feed.filter_changed` event in PostHog console (the empty-string guard fires) | ☐ |
| 3.6 | Tap "Reset to defaults" | Radius returns to 10km; sheet closes; feed refetches | ☐ |
| 3.7 | Open OS Settings → Accessibility → Reduce Motion ON; reload `/leads`; open the filter sheet; tap a radius | Sheet still works; no spring bounce on the toggle press; ToggleGroup items don't scale on tap. (Phase D1 prefers-reduced-motion fix) | ☐ |
| 3.8 | With the sheet open, screen reader (VoiceOver / TalkBack) reads the trigger button | Reader announces it as a "popup, dialog" — `aria-haspopup="dialog"` + `aria-controls="lead-filter-sheet"` (Phase D3 fix) | ☐ |
| 3.9 | DrawerTitle "Filters" is announced when the sheet opens | Required for Radix Dialog ARIA contract | ☐ |

## 4. Save / unsave flow (the regression we just fixed)

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 4.1 | Tap the heart on a permit lead | Heart fills immediately (optimistic); haptic vibration on supported devices | ☐ |
| 4.2 | After 4.1, pull-to-refresh the feed | Heart **stays filled** after refetch. (THIS is the Phase A regression — pre-fix the heart would reset to outline because is_saved was structurally always false.) | ☐ |
| 4.3 | Same as 4.1 but on a builder lead (the second card type) | Same: heart fills, persists across refetch | ☐ |
| 4.4 | Tap a saved heart to unsave | Heart returns to outline immediately; pull-to-refresh confirms it stays outline | ☐ |
| 4.5 | Force a server error mid-save: open DevTools, set network condition to Offline, tap an unsaved heart | Heart fills optimistically, then **rolls back** to outline within ~2s; toast or inline error indicates the failure | ☐ |
| 4.6 | Compensating telemetry on 4.5: PostHog console shows `lead_feed.lead_save_failed` after the rollback | Counts a save_failed in addition to the original lead_saved so the funnel can subtract | ☐ |
| 4.7 | Double-click guard: rapidly tap a heart 5x in <1s | Only ONE network request fires; the others are ignored while `mutation.isPending` | ☐ |
| 4.8 | Mid-mutation refetch: tap to save, then immediately pull-to-refresh BEFORE the mutation resolves | The optimistic state survives — the heart does NOT flicker unsaved → saved → unsaved → saved (the `mutation.isPending` gate in SaveButton.useEffect) | ☐ |
| 4.9 | Cross-device check: sign in on a second device with the same account → the saves from device 1 are present | Validates server-side persistence + the prefix JOIN contract (the very thing the new real-DB test pins) | ☐ |

## 5. Auth lifecycle (the second-most-important fix)

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 5.1 | Mid-session 401: open DevTools → Application → Cookies, delete the `__session` cookie, then trigger any feed action | Client surfaces an `AUTH_EXPIRED` flow (redirect to login or auth-expired toast), NOT a generic "unreachable" empty state. (Phase C2 fix) | ☐ |
| 5.2 | After 5.1, the redirect should land on `/login` | Confirm URL matches | ☐ |
| 5.3 | Sign out from the user menu | Firebase auth state clears AND `localStorage['buildo-lead-feed']` is gone (check DevTools → Application → Local Storage). (Phase C3/C4 fix) | ☐ |
| 5.4 | After 5.3, sign in as a DIFFERENT user (shared device test) | First feed fetch uses the NEW user's GPS / saved location, not user A's `snappedLocation`. Verify by inspecting the request URL: `lat`/`lng` should be the new user's, not the prior. (The Independent reviewer C2 finding.) | ☐ |
| 5.5 | Unknown protected route — visit `/leads/foo-not-a-real-route` while signed out | Middleware redirects to `/login` (fail-closed default). (Phase C1 fix) | ☐ |
| 5.6 | Same route while signed in | Lands on the Next.js 404, NOT publicly served | ☐ |
| 5.7 | Verify `process.env.NEXT_PUBLIC_DEV_MODE` no longer affects the server-side auth check: in production-build mode, even with `NEXT_PUBLIC_DEV_MODE=true`, the middleware still requires a real cookie because it now reads the server-only `DEV_MODE` var | Confirms the defense-in-depth split | ☐ |

## 6. Mobile gestures + iOS Safari

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 6.1 | Pull-to-refresh from the top of the feed | Refresh indicator appears, feed refetches, indicator dismisses cleanly | ☐ |
| 6.2 | Scroll down through 5 pages | Each page (15 cards) loads via infinite scroll trigger; AT page 5 (75 cards) the scroll halts and a "Showing first 75 leads" footer appears (V1 cap from spec 75 §11 Phase 7) | ☐ |
| 6.3 | iOS Safari address-bar collapse during scroll | Sticky header stays visible at the top — no layout jump (uses `position: sticky`, NOT `fixed`) | ☐ |
| 6.4 | iOS Safari home-bar gesture during a Drawer open | Drawer responds normally; no broken touch handling | ☐ |
| 6.5 | Tap any card | Card scales briefly (0.98) on tap (or NO scale if reduce-motion is on, per Phase D1) | ☐ |
| 6.6 | Long-press a card | No iOS context menu hijack (text selection disabled correctly on touch targets) | ☐ |
| 6.7 | Tap a phone number on a builder card | iOS prompts to call; href is sanitized (no extension digits, no letters) | ☐ |
| 6.8 | Tap "Get directions" on a permit card | Opens Google Maps with the permit's lat/lng | ☐ |
| 6.9 | Touch target audit: every interactive element ≥ 44×44 px | Use Safari Inspector → Element → Box Model on heart, filter button, footer buttons | ☐ |

## 7. Telemetry sanity

Open the PostHog debug console (`localStorage.setItem('ph-debug-events', 'true')`) and walk through any happy-path flow. Verify each event fires once and carries only bounded properties.

| # | Event | Trigger | Bounded properties only? | Status |
|---|-------|---------|--------------------------|--------|
| 7.1 | `lead_feed.viewed` | Page mount | `trade_slug`, `radius_km`, `count` (no PII, no lead_id list) | ☐ |
| 7.2 | `lead_feed.lead_clicked` | Tap any card | `lead_type`, `lead_id`, `distance_m` — note: lead_id retained intentionally for click attribution; product RFC tracks this in review_followups | ☐ |
| 7.3 | `lead_feed.lead_saved` / `lead_feed.lead_unsaved` | Heart toggle | `lead_type`, `lead_id`, `trade_slug` | ☐ |
| 7.4 | `lead_feed.filter_sheet_opened` | Header tap | `source: 'header_tap'` — NOT conflated with `lead_feed.filter_changed` (the Independent reviewer Item 15 fix) | ☐ |
| 7.5 | `lead_feed.filter_changed` | Radius change inside the sheet | `field: 'radius'`, `from`, `to`, `source: 'filter_sheet'` | ☐ |
| 7.6 | `lead_feed.client_error` | Force a 500 via 2.3 | `code` (bounded enum) + `trade_slug` ONLY — NO `message` field. (Phase E1 fix) | ☐ |
| 7.7 | Sustained error: same error refetched 5x | client_error fires ONCE, not 5x (dedupe ref) | ☐ |
| 7.8 | `lead_feed.lead_save_failed` | Force the offline save in 4.5 | `lead_type`, `lead_id`, `intended_action`, `error_code` | ☐ |

## 8. Edge cases

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 8.1 | TanStack Query 24h cache window — load the feed, kill the dev server, reload the page | Cached cards render from IndexedDB persist client; "Last updated X minutes ago" banner | ☐ |
| 8.2 | GPS jitter sub-500m (DevTools → Sensors → set lat 43.6500, then 43.6502) | NO refetch — `snappedLocation` doesn't advance; queryKey stable; same cards | ☐ |
| 8.3 | GPS jump > 500m (43.6500 → 43.6700) | Snap advances; new fetch fires; new cards (or different ordering) appear | ☐ |
| 8.4 | localStorage tamper — open DevTools and edit `buildo-lead-feed` to set `radiusKm: 9999` | On reload, `validatePersistedSlice` clamps to MAX_RADIUS_KM (50) and emits a recovery telemetry event. (Zod deadlock Layer 2) | ☐ |
| 8.5 | localStorage tamper — set `lat: 999, lng: 0` (out of WGS84 range) | Rejected on rehydration; falls back to defaults | ☐ |
| 8.6 | Tab visibility change — backgrounding the tab for 30s, return | TanStack Query `refetchOnWindowFocus` triggers a refetch; UI does not flicker | ☐ |
| 8.7 | Browser back button after navigating from a permit detail page | Returns to the SAME scroll position in the feed (TanStack Query restored from cache, scroll preserved by the browser) | ☐ |

## 9. WF3s filed during this run

> Record any FAIL items here as they're discovered. Each entry: bug name + brief repro + expected behaviour. File the actual WF3 task immediately after this run completes.

| # | Item ref | Bug name | Repro | Expected |
|---|----------|----------|-------|----------|
| | | | | |
| | | | | |

## 10. Verdict

- Total scenarios: **74**
- PASS: **___**
- FAIL: **___**
- N-A: **___**
- WF3s filed: **___**

**Production readiness gate:** all of §4 (save/unsave) and §5 (auth lifecycle) MUST pass — those are the regression-guard items for the bugs we just fixed. Failures elsewhere are filed but not blocking.
