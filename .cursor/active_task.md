# Active Task: WF5 Manual Audit — Spec 94 Mobile Onboarding
**Status:** In Progress
**Workflow:** WF5 manual mobile_onboarding
**Domain Mode:** Admin (mobile/ Expo source — audit only, no src/ writes until authorized)

---

## Context

* **Goal:** Audit the Spec 94 mobile onboarding implementation against the spec's behavioral contract. Identify any gaps, bugs, or non-compliance. File WF3s for blockers, defer non-blockers to review_followups.md.
* **Target Spec:** `docs/specs/03-mobile/94_mobile_onboarding.md`
* **Scope:** All files under `mobile/app/(onboarding)/`, `mobile/src/store/onboardingStore.ts`, `mobile/src/lib/onboarding/`, `mobile/src/components/onboarding/`, `mobile/app/_layout.tsx`, `src/app/api/onboarding/suppliers/route.ts`

---

## Scenario Checklist (from spec §§ 2–11)

### §2 Architecture & Gates
- [ ] S01: `_layout.tsx` AuthGate redirects to `/(onboarding)/profession` when `user && !isOnboardingComplete && !inOnboardingGroup`
- [ ] S02: `(onboarding)/_layout.tsx` redirects to `/(app)/` when `isComplete = true` (deep-link safety)
- [ ] S03: `IncompleteBanner` renders on `(app)` screens when `isComplete = false`
- [ ] S04: Manufacturer gate: `account_preset === 'manufacturer'` routes to `manufacturer-hold.tsx`

### §3 Profession / Trade Selection
- [ ] S05: `profession.tsx` renders SectionList with 6 categories, 33 items (32 trades + realtor)
- [ ] S06: `stickySectionHeadersEnabled={true}` present
- [ ] S07: Trade row unselected has `accessibilityRole="radio"` AND `accessibilityState={{ selected: false }}`
- [ ] S08: Trade row selected has `accessibilityState={{ selected: true }}` + amber border-left + Check icon
- [ ] S09: Trade lock BottomSheet uses `@gorhom/bottom-sheet` v5, `<BottomSheetView>` as direct child
- [ ] S10: PATCH fires ONLY after user taps "Confirm" in the sheet (not on trade row tap)
- [ ] S11: `successNotification()` haptic fires on PATCH success (not before)
- [ ] S12: Realtor → skips `path.tsx`, goes to `address.tsx` directly
- [ ] S13: Tradesperson → goes to `path.tsx`

### §4 Path R — Realtor
- [ ] S14: `address.tsx` hides GPS Live button for Realtor path
- [ ] S15: PATCH on address confirm includes `location_mode: 'home_base_fixed'`
- [ ] S16: No progress stepper shown for Path R

### §5 Path L — Tradesperson (Leads)
- [ ] S17: `path.tsx` has two card options; tapping navigates immediately (no "Continue" CTA)
- [ ] S18: Progress stepper shown at steps 2–5 of Path L (screens: address, supplier, terms, complete)
- [ ] S19: GPS permission denied shows explainer + `Linking.openSettings()` + secondary "use fixed address" CTA
- [ ] S20: GPS Live PATCH includes `location_mode: 'gps_live'` BEFORE navigating

### §6 Path T — Tradesperson (Tracking)
- [ ] S21: Path T has no progress stepper
- [ ] S22: Supplier screen section header is more prominent for Path T
- [ ] S23: `first-permit.tsx` has both "Yes search" path and "Skip" link to `terms.tsx`
- [ ] S24: `terms.tsx` Path T final PATCH includes `{ default_tab: 'flight_board', location_mode: 'gps_live', onboarding_complete: true }`
- [ ] S25: Path T navigates to `/(app)/flight-board` not `/(app)/` after completion

### §8 Toronto Address Validation
- [ ] S26: Empty geocode array guard (`results.length === 0` check before `results[0]`)
- [ ] S27: Outside Toronto bounds shows warning with nearest centroid suggestion
- [ ] S28: `snapToGrid` result is re-validated with `isInsideToronto` (post-snap check)
- [ ] S29: `TORONTO_BOUNDS` = lat 43.58–43.86, lng −79.64 to −79.12

### §9 Design
- [ ] S30: All interactive elements `min-h-[52px]` (spot-check 3 screens)
- [ ] S31: `address.tsx` text input uses `font-sans` not `font-mono`
- [ ] S32: `supplier.tsx` uses `FlatList numColumns={2}` (NOT FlashList)
- [ ] S33: `supplier.tsx` `columnWrapperStyle` is an inline style object (not NativeWind class)
- [ ] S34: `complete.tsx` staggered entry: 4 separate `useSharedValue` + `useAnimatedStyle` (no loop hooks)
- [ ] S35: ProgressStepper active dot uses nested Views with border (not `ring-*`)

### §10 Implementation — Drop-off Recovery
- [ ] S36: `onboardingStore` MMKV step advances only on PATCH success (not on screen entry or skip)
- [ ] S37: `markComplete()` sets `isComplete: true` AND clears `currentStep`
- [ ] S38: `authStore.signOut()` calls `onboardingStore.reset()`
- [ ] S39: `registerPushToken` not called during onboarding (only in post-onboarding branch of root `_layout.tsx`)

### §10 Step 7b — Suppliers API
- [ ] S40: `GET /api/onboarding/suppliers` returns 401 for unauthenticated
- [ ] S41: Returns `{ data: { suppliers: [] } }` (not 404) for unknown trade
- [ ] S42: `supplier.tsx` auto-skips screen when suppliers list is empty

---

## Execution Status

TBD — running now
