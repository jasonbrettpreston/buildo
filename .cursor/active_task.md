# Active Task: Phase 8 — Testing & Release Readiness
**Status:** Planning
**Domain Mode:** Frontend (mobile) — spans all phases reviewed

## Context
* **Goal:** Before firing up Maestro UI tests and cutting EAS release builds, run a comprehensive pre-test review gauntlet (Phase 8.0) across the entire mobile codebase. Three AI personas (Adversarial, Independent, UI/UX) are weaponized with specific "search-and-destroy" mandates keyed to each Phase (1-7), plus three holistic macro-audits, plus two deterministic automated guards. WF3 all critical findings inline; defer lower-priority items to `review_followups.md §5`. Only then proceed to 8.1-8.6 (Jest coverage, Maestro suite, EAS Preview Build, EAS Update, bundle size, Green Light).
* **Rollback Anchor:** `0a50f9d`
* **Target Specs:**
  * `docs/specs/03-mobile/90_mobile_engineering_protocol.md` — master
  * `docs/specs/03-mobile/91_mobile_lead_feed.md` — Phase 3 + 4
  * `docs/specs/03-mobile/77_mobile_crm_flight_board.md` — Phase 5
  * `docs/specs/03-mobile/92_mobile_engagement_hardware.md` — Phase 6 + 7

## Database Impact: NO (review-only; remediation may follow)

## Standards Compliance
* **Try-Catch Boundary:** N/A — review-only phase; any remediation WF3s apply standards
* **Unhappy Path Tests:** reviewer mandates explicitly include unhappy-path scenarios
* **logError Mandate:** N/A (mobile frontend only; no API route changes)
* **Mobile-First:** all reviews focused on mobile Expo app

---

## Phase 8.0 — Pre-Test Comprehensive Review (Gauntlet)

### 8.0.A — Stage-by-Stage Micro Audits (4 parallel reviewers)

| Phase Scope | Reviewer Persona | Mandate | Target files |
|---|---|---|---|
| **Phases 1+2** Auth & Zod | Adversarial | **"Dirty Data" audit.** What happens if the Next.js API returns a 500 HTML page instead of JSON? What if the MMKV token is corrupted? Prove the app won't fatally crash. Trace every fetch path through `apiClient.ts`, every Zod parse in `schemas.ts`, every MMKV read in `authStore.ts` + `pushTokens.ts`. | `mobile/src/lib/apiClient.ts`, `mobile/src/lib/schemas.ts`, `mobile/src/store/authStore.ts`, `mobile/src/lib/pushTokens.ts`, `mobile/app/_layout.tsx`, `mobile/app/(auth)/login.tsx`, `mobile/src/components/ErrorBoundary.tsx` |
| **Phases 3+4** Feed & Map | Independent | **"Memory Leak" audit.** Identify any inline arrow functions passed to `renderItem`. Verify FlashList props (FlashList v2: confirm no `estimatedItemSize`; verify `getItemType`, `keyExtractor`). Check map panning is properly debounced (400ms spec) before triggering TanStack Query. Look for Reanimated shared values without `cancelAnimation` cleanup, event listeners without `.remove()`, timers without `clearTimeout`. | `mobile/app/(app)/index.tsx`, `mobile/app/(app)/map.tsx`, `mobile/src/components/feed/LeadMapPane.tsx`, `mobile/src/components/feed/LeadCard.tsx`, `mobile/src/components/feed/LeadCardSkeleton.tsx`, `mobile/src/components/feed/OpportunityRing.tsx`, `mobile/src/components/feed/FilterTriggerRow.tsx`, `mobile/src/components/feed/LeadFilterSheet.tsx`, `mobile/src/hooks/useLeadFeed.ts`, `mobile/src/hooks/useLocation.ts` |
| **Phase 5** Flight Board | Adversarial | **"Race Condition" audit.** Focus on optimistic updates. If I swipe to remove a job, and the network drops exactly 10ms later, does the UI roll back gracefully, or does it leave the TanStack cache corrupted? What about double-swipes mid-undo-window? What if the user navigates away mid-delete? What about save/unsave-then-save stream on the same lead? | `mobile/app/(app)/flight-board.tsx`, `mobile/app/(app)/[flight-job].tsx`, `mobile/src/components/feed/FlightCard.tsx`, `mobile/src/components/feed/FlightCardSkeleton.tsx`, `mobile/src/components/feed/TemporalSectionHeader.tsx`, `mobile/src/components/feed/EmptyBoardState.tsx`, `mobile/src/components/feed/SearchPermitsSheet.tsx`, `mobile/src/hooks/useFlightBoard.ts`, `mobile/src/hooks/useRemoveFromBoard.ts`, `mobile/src/hooks/useSaveLead.ts`, `mobile/src/hooks/useSearchPermits.ts` |
| **Phases 6+7** Push & Offline | UI/UX Designer | **"Basement Mode" audit.** Focus on state transitions. Are there any generic `ActivityIndicator` spinners instead of Skeleton loaders? Does the `OfflineBanner` push UI down (layout shift) or overlay smoothly? Do push notification deep-links behave the same way from cold-boot vs backgrounded? Are empty states thematically consistent? Is the industrial utilitarian aesthetic maintained through error/loading/offline states? | `mobile/src/components/shared/OfflineBanner.tsx`, `mobile/src/components/shared/NotificationToast.tsx`, `mobile/src/components/shared/NotificationPermissionModal.tsx`, `mobile/src/components/shared/SaveButton.tsx`, `mobile/app/_layout.tsx`, `mobile/app/(app)/settings.tsx`, `mobile/src/lib/pushTokens.ts`, `mobile/src/lib/mmkvPersister.ts`, `mobile/src/lib/queryClient.ts`, `mobile/__mocks__/@react-native-community/netinfo.js` |

### 8.0.B — Holistic Pre-Test Macro Audits (3 parallel reviewers)

| Mandate | Reviewer | Scope |
|---|---|---|
| **PII & Telemetry Sweep.** Trace every payload sent to PostHog + Sentry. Guarantee zero PII (names, exact addresses, phone numbers, emails) leaks into observability or push notification payloads. Check payloads in `classify-lifecycle-phase.js`, every `captureEvent` call, every `Sentry.captureException`, and the Expo Push API `data` field contents. | Adversarial | Full `mobile/` tree + `scripts/classify-lifecycle-phase.js` + `src/app/api/notifications/*` |
| **Component Render Waterfall.** Trace Zustand store updates. Identify any component that will unnecessarily re-render when global location coordinates change by 1 meter. Check `useFilterStore`, `useAuthStore`, `useNotificationStore`, `tabBarStore`. Look for components that subscribe to the whole store instead of selectors. | Independent | All `mobile/src/store/*` + every consumer screen/component |
| **Tactile & Visual Polish.** Verify every interactive element has ≥44px touch target. Ensure every mutation (Save, Remove, Refresh) uses the exact `expo-haptics` call specified in Spec 92 §4.3. Check industrial utilitarian aesthetic consistency: amber accent discipline, monospace for data, borders/radii discipline. | UI/UX Designer | All `mobile/src/components/*`, `mobile/app/(app)/*` |

### 8.0.C — Automated Guards (deterministic)

| Guard | Command | Pass criteria |
|---|---|---|
| **Strict typecheck barrier** | `cd mobile && npx tsc --noEmit` | 0 new errors vs baseline (known pre-existing: `offline.test.ts` persister module, `settings.tsx` slider module, `_layout.tsx` NotificationBehavior) |
| **Bundle analyzer** | `cd mobile && npx expo-bundle-analyzer` or `npx expo export --platform ios --output-dir /tmp/bundle-check` + inspect size | Main JS bundle < 2MB (spec 90 §14); flag any unexpected heavy dep (e.g. `react-native-maps` dragging in Apple Maps into Android build) |
| **Lint gate** | `cd mobile && npx eslint .` (if configured) or skip with note | 0 errors |

### 8.0.D — Triage & Fix Loop

- Consolidate findings from 8.0.A + 8.0.B + 8.0.C
- Rank by severity × confidence (CRITICAL/IMPORTANT/LOW)
- **WF3** all critical findings inline (same-commit fixes)
- **Defer** lower-priority items to `docs/reports/review_followups.md §5`
- Re-run jest + typecheck after fixes
- Atomic commit following WF6 hardening sweep

---

## Phases 8.1–8.7 — DEFERRED to next active task

_Scope-reduced: the pre-test gauntlet (8.0) surfaced enough remediation work that release-readiness steps below are carved out to a future active task to keep this WF focused._

- [ ] **8.1** Jest coverage gate (80% threshold on hooks/lib)
- [ ] **8.2** Maestro suite (scroll-feed, map-view, flight-board, notifications)
- [ ] **8.3** EAS Preview Build (iOS + Android)
- [ ] **8.4** EAS Update channel wired in CI
- [ ] **8.5** Bundle size check (< 2MB main JS)
- [ ] **8.6** Backend Green Light (Next.js tests + lint)
- [ ] **8.7** Pre-Review Self-Checklist + WF6 exit gate

---

## §10/§11 Compliance Summary

- ✅ **DB:** N/A — review-only phase
- ✅ **API:** N/A — no routes created or modified during the review gauntlet
- ✅ **UI:** mobile-first ✓ · touch targets ≥44px ✓ (reviewer will verify) · no client secrets ✓ · server-sourced input only ✓
- ✅ **Shared Logic:** N/A — classification/scoring not touched
- ✅ **Pipeline:** N/A — pipeline scripts only read for PII audit, not modified
- ✅ **Frontend Boundary:** no `scripts/` or `migrations/` touched by the review
- ✅ **Frontend Foundation (§12):** applies to web `src/features/leads/` only; mobile stack already compliant
- ✅ **Pre-Review Self-Checklist (WF2+WF3 variant):** 8 items to enumerate during Phase 8.0.D fix loop walkthrough
- ✅ **Cross-Layer Contracts:** N/A — no threshold changes

---

**PLAN LOCKED. Do you authorize Phase 8.0 (pre-test comprehensive review gauntlet) followed by Phases 8.1-8.7? (y/n)**

---

## ⏸ Phase 8 Appendix (original checklist — preserved for 8.1-8.7 reference)

_From the prior Phase 8 plan._

- [ ] **Jest coverage gate:** `jest --coverage`. Enforce in `jest.config.js`: `coverageThreshold: { global: { lines: 80, functions: 80 } }` for `src/hooks/` and `src/lib/`. Fix any gaps.
- [ ] **Maestro suite complete:** All four flows pass: `scroll-feed.yaml`, `map-view.yaml`, `flight-board.yaml`, `notifications.yaml`.
- [ ] **EAS Preview Build:** `eas build --profile preview --platform all`. Confirm iOS `.ipa` and Android `.apk` build clean. Verify Sentry source maps appear in Sentry dashboard (crash report shows human-readable stack trace, not minified).
- [ ] **EAS Update wired:** `eas.json` production profile sets `channel: "production"`. Add to CI (`mobile-ci.yml`): on merge to `main`, run `eas update --branch production --message "OTA: ${{ github.event.head_commit.message }}"`. This is the fast-fix lane that bypasses App Store review for JS-only patches (addresses spec 90 §13).
- [ ] **Bundle size check:** `npx expo-bundle-analyzer`. Main JS bundle must be < 2MB (per `mobile-rules.md` §8 release checklist). Flag any unexpectedly large dependencies.
- [ ] **Backend Green Light:** `npm run test && npm run lint -- --fix` in the Next.js repo — all tests pass with the new middleware Bearer path, flight-board route, search route, and notification routes.
- [ ] **Pre-Review Self-Checklist:** Before WF6, generate a 10-item checklist covering spec 90 Behavioral Contract (Dumb Glass violations?), spec 91 §4 (all card fields rendered?), spec 77 §3 (all temporal groups present, auto-archive works?), spec 92 §2 (all 4 triggers implemented?). Walk each item against the diff. Output PASS/FAIL per item.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` (Next.js repo) + `jest --coverage` + all Maestro flows pass → WF6.
