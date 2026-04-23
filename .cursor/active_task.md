# Active Task: Design Audit Remediation — Phases 4-7 (WF2 + WF3 bundle)
**Status:** Planning
**Domain Mode:** Frontend

## Context
* **Goal:** Apply 13 design-audit findings from the 2026-04-23 five-pillar audit (visual consistency, UX flow, a11y, perf, best-in-class benchmark). Mix of WF2 enhancements and WF3 hardening fixes.
* **Rollback Anchor:** `dbe0618`
* **Target Specs:**
  * `docs/specs/03-mobile/90_mobile_engineering_protocol.md` — master
  * `docs/specs/03-mobile/91_mobile_lead_feed.md` — §4.3 for Lead Detail
  * `docs/specs/03-mobile/77_mobile_crm_flight_board.md` — §3.2 swipe hint
  * `docs/specs/03-mobile/92_mobile_engagement_hardware.md` — a11y referenced
* **Key Files (Modified/Created):**
  * `mobile/app/(app)/[lead].tsx` — new full Detail Investigation View (stub → full screen)
  * `mobile/app/(app)/_layout.tsx` — tab bar Animated.View wrapper
  * `mobile/app/(app)/map.tsx` — OfflineBanner mount + marker overflow banner
  * `mobile/app/(app)/settings.tsx` — OfflineBanner + slider a11y + typography hierarchy
  * `mobile/app/(app)/index.tsx` — `useMemo` on `allItems`
  * `mobile/app/(app)/flight-board.tsx` — `useMemo` on `buildListItems`; swipe hint
  * `mobile/src/components/feed/OpportunityRing.tsx` — score text + accessibilityLabel
  * `mobile/src/components/feed/TemporalSectionHeader.tsx` — `accessibilityRole="header"`
  * `mobile/src/components/feed/EmptyBoardState.tsx` — AppState pause
  * `mobile/src/components/feed/FlightCard.tsx` — a11y actions + swipe affordance
  * `mobile/src/components/feed/LeadMapPane.tsx` — overflow count
  * `mobile/src/components/shared/NotificationToast.tsx` — icon replacement
  * `mobile/src/components/feed/SearchPermitsSheet.tsx` — icon replacement
  * `mobile/package.json` — `lucide-react-native` dependency

## Technical Implementation

### WF3 items (7 — pure hardening)

**2. Tab bar hide-on-scroll wiring** — `(app)/_layout.tsx`: replace `<Tabs screenOptions.tabBarStyle>` static object with an animated wrapper. The cleanest pattern for expo-router: use the `tabBar` render prop, wrap the default `BottomTabBar` in `<Animated.View style={tabBarStyle}>`. Ensures `tabBarVisible` shared value drives translateY.

**4. OfflineBanner on Map + Settings** — mount `<OfflineBanner />` below the screen header in both screens. Matches Feed + Flight Board pattern.

**7. Settings slider a11y** — add `accessibilityLabel="Search radius in kilometers"` + `accessibilityValue={{ min: 10, max: 50, now: localRadius, text: \`${localRadius} kilometers\` }}` to both sliders (radius + cost tier).

**8. TemporalSectionHeader header role** — add `accessibilityRole="header"` to the root `<View>`.

**10. Memoization** — `useMemo` wraps for `allItems = data?.pages.flatMap(...)` in `index.tsx` (dep: `data`) and `buildListItems(boardData)` in `flight-board.tsx` (dep: `boardData`).

**11. EmptyBoardState AppState pause** — add AppState listener in `useEffect`; `cancelAnimation(rotation)` on background, restart `withRepeat(withTiming(360, {duration: 4000}), -1, false)` on foreground.

**13. Settings typography hierarchy** — change "Settings" title from `font-mono text-xs uppercase tracking-widest` to `text-zinc-100 text-2xl font-bold` (screen title). Section headers keep `font-mono text-xs uppercase tracking-wider` (now visually subordinate).

### WF2 items (6 — enhancements)

**1. `[lead].tsx` Detailed Investigation View** — enhance stub into full screen per spec 91 §4.3:
  * SafeAreaView + nav bar ("← Back" / "Permit Detail")
  * ScrollView with: address + permit_num header, OpportunityRing (left-anchored, 56×56), score text + target_window badge + cost tier + competition count, lifecycle phase, predicted_start (font-mono amber xl), neighbourhood profile row, description
  * `SaveButton` fixed at bottom via `position: absolute`
  * Data source: fetch from existing `useLeadFeed` cache via `queryClient.getQueryData` looking up by `lead_id`; if not in cache, show "Details not available" empty state (avoids WF1-sized new API route)

**3. OpportunityRing score text + a11y** — add a `<Text>` in the SVG center rendering the numeric score (0-100) in `font-mono text-xs text-zinc-100`. Add `accessibilityLabel={\`Opportunity score: ${score} out of 100\`}` to outer View.

**5. Swipe-to-remove a11y alternative** — `FlightCard` Pressable gets `accessibilityActions={[{ name: 'remove', label: 'Remove from board' }]}` and `onAccessibilityAction` handler that calls `onRemove`. VoiceOver shows "Remove from board" in Actions rotor.

**6. Swipe affordance hint** — on `FlightCard` first mount per session, play a one-shot Reanimated animation: translateX from 0 → -24 → 0 over 600ms, delayed 1s after mount. MMKV flag `flight_board_swipe_hint_shown` gates so it runs at most once per install.

**9. Map marker overflow indicator** — `LeadMapPane` accepts `totalPermits: number` prop (full count before slice). When `totalPermits > MARKER_CAP`, render a bottom-left floating pill `bg-zinc-900/95 border border-amber-500/40 rounded-full px-3 py-2` with text `"Showing 50 of ${totalPermits} — zoom in to see more"` in `font-mono text-xs text-amber-400`.

**14. Icon library unification** — `npm install lucide-react-native`. Replace UI chrome icons only (keep semantic emoji `⚠ ⚡ 💎 🚨` as content):
  * `⌕` FAB + SearchPermitsSheet → `<Search />` 24px
  * `←` back buttons → `<ChevronLeft />` 20px
  * `✕` NotificationToast dismiss → `<X />` 18px

## Database Impact: NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes. `[lead].tsx` reads from cache via `queryClient.getQueryData`; no fetch layer.
* **Unhappy Path Tests:** `[lead].tsx` handles cache-miss with empty state. `LeadMapPane` handles `totalPermits <= MARKER_CAP` (no banner).
* **logError Mandate:** N/A — frontend only.
* **Mobile-First:** All changes are mobile-only; no `md:`/`lg:` breakpoints needed (app is Expo, not responsive web).

## §11 Plan Compliance (frontend WF)

* ✅ **UI Component Check** (all items affect UI):
  * Mobile-first: base classes only ✓
  * Touch targets ≥ 44px: SaveButton retains `minWidth: 44, minHeight: 44` ✓
  * 375px viewport: Expo renders to actual device resolution ✓
  * No `.env` secrets in 'use client': N/A (no `use client` directive in Expo) ✓
  * User input escaped: Lead detail shows only server-sourced data ✓
* ✅ **Frontend Boundary Check:**
  * No modifications to `scripts/`, `migrations/`, `scripts/lib/` ✓
  * API route stability: N/A (no route changes) ✓
  * Business logic in `src/lib/`: N/A ✓
* ✅ **Pre-Review Self-Checklist** (WF2 variant):
  1. Does `[lead].tsx` honor the 56×56 OpportunityRing geometry from spec 91 §4.1?
  2. Does the tab bar `translateY` survive a tab-switch round trip (show after scroll-up on new screen)?
  3. Does OpportunityRing `accessibilityLabel` read correctly across score bands (0, 79, 80, 100)?
  4. Does swipe affordance hint fire exactly once per install (MMKV gate working)?
  5. Does marker overflow banner hide when user zooms in enough to reduce `totalPermits` ≤ cap?
  6. Does EmptyBoardState animation resume correctly after backgrounding 60+ seconds (iOS throttles JS timers)?
  7. Does `useMemo` dep on `data` in index.tsx correctly re-run when new pages arrive (infinite scroll integrity)?
  8. Does a11y action `remove` fire `onRemove(item)` without also triggering `onPress(item)`?
* ⬜ **DB:** N/A — no migrations
* ⬜ **API:** N/A — no route changes
* ⬜ **Shared Logic:** N/A — no classification/scoring touched
* ⬜ **Pipeline:** N/A — no pipeline scripts touched
* ⬜ **Cross-Layer Contracts:** N/A — no new thresholds

## Execution Plan

- [ ] **Rollback Anchor:** `dbe0618`
- [ ] **State Verification:** all 13 file targets confirmed readable; current stubs + extension points verified
- [ ] **Spec Review:** specs 90/91/77/92 previously read; §4.3 governs `[lead].tsx` full build
- [ ] **Red Light:** baseline `npx jest` (62 pass) + `tsc` (0 net errors) captured
- [ ] **Implementation Batch A (WF3 hardening):** items 2, 4, 7, 8, 10, 11, 13 → run jest after
- [ ] **Implementation Batch B (WF2 enhancements):** items 3, 5, 6, 9, 14 → run jest after
- [ ] **Implementation Batch C (WF2 — big screen):** item 1 `[lead].tsx` rebuild → run jest
- [ ] **Adversarial Review:** spawn DeepSeek + Gemini + Independent reviewers (three parallel agents) on the diff
- [ ] **WF3 Fix Loop:** for each agent-flagged genuine bug, apply fix; defer low-priority items to `docs/reports/review_followups.md §4`
- [ ] **Pre-Review Self-Checklist:** 8-item walk-through (listed above) against actual diff → PASS/FAIL each
- [ ] **Green Light:** `cd mobile && npx jest --ci --no-coverage` passes + `tsc --noEmit` clean → WF6
- [ ] **WF6 Hardening Sweep:** 5-point (error paths, edge cases, type safety, consistency, drift) + collateral + Founder's Audit + atomic commits

## Deferred (3 items to `review_followups.md §4`)

* **Item 12 — Notification toast Quick Actions:** requires swipe-reveal UX, new interaction model, spec 92 additions. WF1 scope.
* **Item 15 — `hasUpdate` wiring:** requires backend `permits.updated_at` projection in flight-board API, schema field, and AppState foreground compute. Cross-Domain Mode, exceeds WF2/WF3.
* **Item 17 — Dynamic Type + light mode toggle:** requires semantic color token system + every zinc-* replacement + `useColorScheme` wiring. Multi-week Phase 8 scope.

---

## §10/§11 Compliance Summary (visible per protocol)

- ✅ **DB:** N/A — no migrations, no schema changes
- ✅ **API:** N/A — no routes created or modified; `[lead].tsx` reads from existing cache only
- ✅ **UI:**
  - ✅ Mobile-first layout (Expo-only, no responsive breakpoints)
  - ✅ Touch targets ≥44px (verified on SaveButton, back buttons, swipe actions)
  - ✅ 375px viewport (Expo renders to device)
  - ✅ No secrets in client components
  - ✅ User input escaped (server-sourced only)
- ✅ **Shared Logic:** N/A — no classification/scoring touched
- ✅ **Pipeline:** N/A — no pipeline scripts
- ✅ **Frontend Boundary:** no `scripts/` or `migrations/` touched
- ✅ **Frontend Foundation (§12):** applies to `src/features/leads/` only; mobile is out of scope for Biome; TanStack Query already in use (no useEffect fetches); no form state changes; Zustand already used for nav state; no Shadcn Drawer (mobile uses Gorhom BottomSheet correctly); FlashList v2 auto-sizes (no TanStack Virtual needed)
- ✅ **Pre-Review Self-Checklist:** 8 items enumerated above, to be walked PASS/FAIL before Green Light
- ✅ **Cross-Layer Contracts:** N/A — no threshold changes

**PLAN LOCKED. Do you authorize this bundled WF2+WF3 plan? (y/n)**

---

## ⏸ Deferred from prior plan — Phase 8: Testing & Release Readiness (Days 21–22)

_These items were in the prior active_task.md plan (replaced by this Design Audit plan) and are not yet completed. Preserving here so they are not lost._

- [ ] **Jest coverage gate:** `jest --coverage`. Enforce in `jest.config.js`: `coverageThreshold: { global: { lines: 80, functions: 80 } }` for `src/hooks/` and `src/lib/`. Fix any gaps.
- [ ] **Maestro suite complete:** All four flows pass: `scroll-feed.yaml`, `map-view.yaml`, `flight-board.yaml`, `notifications.yaml`.
- [ ] **EAS Preview Build:** `eas build --profile preview --platform all`. Confirm iOS `.ipa` and Android `.apk` build clean. Verify Sentry source maps appear in Sentry dashboard (crash report shows human-readable stack trace, not minified).
- [ ] **EAS Update wired:** `eas.json` production profile sets `channel: "production"`. Add to CI (`mobile-ci.yml`): on merge to `main`, run `eas update --branch production --message "OTA: ${{ github.event.head_commit.message }}"`. This is the fast-fix lane that bypasses App Store review for JS-only patches (addresses spec 90 §13).
- [ ] **Bundle size check:** `npx expo-bundle-analyzer`. Main JS bundle must be < 2MB (per `mobile-rules.md` §8 release checklist). Flag any unexpectedly large dependencies.
- [ ] **Backend Green Light:** `npm run test && npm run lint -- --fix` in the Next.js repo — all tests pass with the new middleware Bearer path, flight-board route, search route, and notification routes.
- [ ] **Pre-Review Self-Checklist:** Before WF6, generate a 10-item checklist covering spec 90 Behavioral Contract (Dumb Glass violations?), spec 91 §4 (all card fields rendered?), spec 77 §3 (all temporal groups present, auto-archive works?), spec 92 §2 (all 4 triggers implemented?). Walk each item against the diff. Output PASS/FAIL per item.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` (Next.js repo) + `jest --coverage` + all Maestro flows pass → WF6.
