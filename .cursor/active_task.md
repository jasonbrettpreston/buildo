# Active Task: Dead-Code & Dependency Sweep (Post Two-Client Purge)
**Status:** Implementation
**Rollback anchor:** `df94281`

## Context
* **Goal:** Remove all orphaned files, packages, and dead exports identified by `knip` after the Two-Client Architecture Purge. Next.js is now API backend + admin panel only — 10 UI files, 10 npm packages, 1 broken Cloud Function import, and 80 dead-export items are confirmed dead.
* **Target Spec:** `docs/specs/00-architecture/00_engineering_standards.md` (§10 Plan Compliance)
* **Key Files:**
  * Phase 1 (delete): 10 src/ files listed below
  * Phase 2 (uninstall): `package.json` / `package-lock.json`
  * Phase 3 (fix): `functions/src/index.ts`
  * Phase 4 (prune): 19 files with dead exports + 61 files with dead exported types

## Technical Implementation

### Phase 1 — Delete 10 Orphaned Files
All confirmed zero-consumer after Two-Client purge:
```
src/lib/utils.ts
src/components/onboarding/OnboardingWizard.tsx
src/components/ui/avatar.tsx
src/components/ui/button.tsx
src/components/ui/card.tsx
src/components/ui/drawer.tsx
src/components/ui/label.tsx
src/components/ui/skeleton.tsx
src/components/ui/toggle-group.tsx
src/lib/observability/sentry.ts
```
`src/components/ui/button.tsx` etc. internally import from `@/lib/utils` and Radix — both being uninstalled in Phase 2. All are safe to delete once knip confirms no survivors.

### Phase 2 — Uninstall 10 Dead npm Packages
```
@heroicons/react          (UI icons — all consumers deleted)
@radix-ui/react-avatar    (avatar.tsx only consumer)
@radix-ui/react-label     (label.tsx only consumer)
@radix-ui/react-slot      (button.tsx only consumer)
@radix-ui/react-toggle-group (toggle-group.tsx only consumer)
class-variance-authority  (utils.ts + button.tsx only consumers)
clsx                      (utils.ts only consumer)
tailwind-merge            (utils.ts only consumer)
vaul                      (drawer.tsx only consumer)
@testing-library/user-event (zero surviving test imports confirmed)
```

### Phase 3 — Fix Broken Cloud Function Import (functions/src/index.ts:723)
`src/lib/notifications/matcher.ts` does not exist. `findMatchingUsers` is imported dynamically at line 723 and called in the loop at lines 768-815.

**Impact:** Removing the import + the matching loop (lines 764-815) stubs the `matchNotifications` Cloud Function. It will still receive PubSub triggers and query classified permits but will no longer create notification records. The function is already broken today (throws at runtime on the missing import). The surrounding try/finally (pool.end()) and error handler are retained; the function emits logs and exits cleanly.

### Phase 4 — Prune Dead Exports and Types
**Rule 1:** Used nowhere in codebase → delete the block entirely.
**Rule 2:** Used locally within own file but not externally → remove `export` keyword only.

**Delete (14 items — no local usage):**
| Symbol | File |
|--------|------|
| `getProductGroupBySlug`, `getProductGroupById` | `src/lib/classification/products.ts` |
| `generatePermitsCsv` | `src/lib/export/csv.ts` |
| `SQM_TO_SQFT` | `src/lib/massing/geometry.ts` |
| `LeadFeedRequest`, `LeadFeedResponseMeta`, `LeadFeedResponse` | `src/features/leads/api/types.ts` |
| `Builder` | `src/lib/permits/types.ts` |
| `CoaLinkResult` | `src/lib/coa/types.ts` |
| `PermitParcel`, `ParcelMatchResult` | `src/lib/parcels/types.ts` |
| `NeighbourhoodProfile` | `src/lib/neighbourhoods/types.ts` |
| `ResidentialTagSlug`, `NewHouseBuildingType`, `NewHouseFeature` | `src/lib/classification/scope.ts` |

**Remove `export` keyword only (66 items across 20 files — all used locally):**
- `parsePositiveIntEnv` — `src/lib/db/client.ts`
- `applyScopeLimit` — `src/lib/classification/classifier.ts`
- `TAG_PRODUCT_MATRIX` alias export — `src/lib/classification/tag-product-matrix.ts`
- `INSPECTION_PIPELINE_P18_SET` — `src/lib/classification/lifecycle-phase.ts`
- `COMPLEXITY_SIGNALS`, `LIAR_GATE_THRESHOLD_DEFAULT`, `CostModelResult`, `TradeAllocationPct`, `TradeRate`, `EstimateCostConfig` — `src/features/leads/lib/cost-model.ts`
- `M_TO_FT`, `StoriesSource` — `src/lib/massing/geometry.ts`
- `USE_TYPE_TAG_CONFIG`, `NEW_HOUSE_TAG_CONFIG`, `RESIDENTIAL_TAG_CONFIG`, `WorkType`, `ScopeTag`, `ScopeResult`, `UseType` — `src/lib/classification/scope.ts`
- `CALIBRATION_STALE_DAYS`, `MIN_SAMPLE_SIZE` — `src/features/leads/lib/timing.ts`
- `getStreetViewUrl`, `getDisplayState` — `src/components/permits/PropertyPhoto.tsx`
- `LIFECYCLE_PHASE_DISPLAY` — `src/features/leads/lib/lifecycle-phase-display.ts`
- `RouteClass` — `src/lib/auth/route-guard.ts`
- `PipelineGroup`, `PipelineEntry`, `ChainStep`, `PipelineChain`, `FreshnessTimelineProps` — `src/components/FreshnessTimeline.tsx`
- `ApiSuccess`, `ApiErrorBody`, `SuccessStatus`, `ErrorStatus` — `src/features/leads/api/envelope.ts`
- `UserContext` — `src/lib/auth/get-user-context.ts`
- `RecordLeadViewResult` — `src/features/leads/lib/record-lead-view.ts`
- `LeadApiError` — `src/features/leads/api/types.ts`
- `TagTradeEntry` — `src/lib/classification/tag-trade-matrix.ts`
- `UpcomingLeadsOptions` — `src/lib/coa/pre-permits.ts`
- `PermitClassifierInput`, `PermitClassifierResult`, `CoaClassifierInput`, `CoaClassifierResult`, `TradeTarget` — `src/lib/classification/lifecycle-phase.ts`
- `ExtractedContacts`, `BuilderSearchInput`, `SkipCandidate`, `SkipResult` — `src/lib/builders/extract-contacts.ts`
- `CostEstimate`, `CostSource`, `CostTier`, `InspectionStageMapRow`, `LeadType`, `LeadView`, `StageRelationship` — `src/features/leads/types.ts` (remove from the `export type {}` re-export block)
- `EventName` — `src/lib/observability/capture.ts`
- `CentroidCandidate` — `src/lib/parcels/geometry.ts`
- `PerfMarkBuilder` — `src/features/leads/lib/perf-marks.ts`
- `CoverageRate`, `MatchingMetrics`, `DurationAnomaly` — `src/lib/quality/types.ts`
- `FunnelStats` — `src/lib/admin/funnel.ts`
- `ScheduleEditModalProps` — `src/components/ScheduleEditModal.tsx`
- `PipelineMeta` — `src/components/funnel/FunnelPanels.tsx`
- `SerperSearchOptions` — `src/lib/enrichment/serper-client.ts`

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes. Phase 3 retains the existing try/catch around the Cloud Function body; only the matching loop inside is removed.
* **Unhappy Path Tests:** N/A — no new logic paths introduced.
* **logError Mandate:** N/A — no new catch blocks.
* **Mobile-First:** N/A — backend/cleanup only.

## Database Impact: NO

## Execution Plan
- [ ] **State Verification:** `npm run dead-code` confirms the 10 files/10 packages show as orphaned.
- [ ] **Contract Definition:** N/A — no API route shape changes.
- [ ] **Spec Update:** N/A — run `npm run system-map` at end only.
- [ ] **Schema Evolution:** N/A
- [ ] **Guardrail Test:** Existing 4278-test suite is the guardrail; must remain green post-cleanup.
- [ ] **Red Light:** N/A — deleting dead code; tests pass before and after.
- [ ] **Implementation:** Execute Phases 1 → 2 → 3 → 4 in sequence. Run `npm run typecheck` after Phase 4.
- [ ] **UI Regression Check:** `npx vitest run src/tests/*.ui.test.tsx` after Phase 4.
- [ ] **Pre-Review Self-Checklist:** Generate before Green Light.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
