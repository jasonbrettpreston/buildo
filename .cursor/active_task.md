# Active Task: WF1 — Two-Client Architecture Purge (Next.js Admin + Expo Mobile)
**Status:** Implementation

## Context
* **Goal:** Surgically remove all tradesperson-facing UI from the Next.js app, leaving it as a pure API backend + Admin Control Panel. Codify the Expo mobile-app engineering rules in `mobile-rules.md`.
* **Target Spec:** `docs/specs/00-architecture/two_client_architecture.md` (to be created)
* **Key Files:**
  * DELETE: `src/app/leads/`, `src/app/map/`, `src/app/search/`, `src/app/onboarding/`
  * DELETE: `src/features/leads/components/` (all 12 components incl. badges/)
  * DELETE: `src/features/leads/hooks/` (useGeolocation.ts, useLeadFeedState.ts)
  * DELETE: 14 `*.ui.test.tsx` files (see Phase 1 list)
  * MODIFY: `src/lib/auth/route-guard.ts` — remove dead route classifications
  * MODIFY: `src/tests/middleware.logic.test.ts` — remove dead-route assertions
  * MODIFY: `package.json` — remove 4 web-only UI packages
  * CREATE: `mobile-rules.md` at project root
  * CREATE: `docs/specs/00-architecture/two_client_architecture.md`

## Technical Implementation

### Phase 1 — UI Purge (delete only, no new code)
**App pages to delete:**
- `src/app/leads/` (error.tsx, LeadsClientShell.tsx, loading.tsx, page.tsx)
- `src/app/map/page.tsx`
- `src/app/search/page.tsx`
- `src/app/onboarding/page.tsx`

**Feature components to delete:**
- `src/features/leads/components/` — BuilderLeadCard.tsx, EmptyLeadState.tsx, LeadFeed.tsx, LeadFeedHeader.tsx, LeadFilterSheet.tsx, LeadMapMarker.tsx, LeadMapPane.tsx, PermitLeadCard.tsx, SkeletonLeadCard.tsx
- `src/features/leads/components/badges/` — OpportunityBadge.tsx, SaveButton.tsx, TimingBadge.tsx
- `src/features/leads/hooks/` — useGeolocation.ts, useLeadFeedState.ts

**UI tests to delete** (test deleted components):
- BuilderLeadCard.ui.test.tsx, EmptyLeadState.ui.test.tsx, LeadFeed.ui.test.tsx
- LeadFeedHeader.ui.test.tsx, LeadFilterSheet.ui.test.tsx, LeadMapMarker.ui.test.tsx
- LeadMapPane.ui.test.tsx, map.ui.test.tsx, onboarding.ui.test.tsx
- PermitLeadCard.ui.test.tsx, SkeletonLeadCard.ui.test.tsx, SaveButton.ui.test.tsx
- OpportunityBadge.ui.test.tsx, TimingBadge.ui.test.tsx

**UI tests to KEEP (admin-facing, unaffected):**
- admin.ui.test.tsx, control-panel.ui.test.tsx, dashboard.ui.test.tsx
- FreshnessTimeline.ui.test.tsx, TestFeedTool.ui.test.tsx

**Note:** `src/components/map/` is an empty directory — no tracked files, no action needed.
**Note:** `src/features/leads/api/useLeadView.ts` and `src/features/leads/lib/haptics.ts` are dead code after deletion but are NOT in the deletion mandate. Flag via `npm run dead-code` in Green Light.

### Phase 2 — Middleware Cleanup
`src/lib/auth/route-guard.ts` changes:
- Remove `/search` and `/map` from `PUBLIC_PATHS` array (pages deleted)
- Remove `pathname.startsWith('/onboarding')` and `/leads` page guards from the authenticated block
- Leave all `/api/leads` in AUTHENTICATED_API_ROUTES unchanged (API still serves Expo)
- Leave all public API prefixes unchanged (mobile app consumes them)

`src/tests/middleware.logic.test.ts` changes:
- Remove/update assertions that `/search` → 'public' and `/map` → 'public'
- Remove/update assertions that `/leads` and `/onboarding` → 'authenticated'

`src/middleware.ts` — no changes (delegates entirely to classifyRoute())

### Phase 3 — Dependency Cleanup
Remove from `package.json` (all have zero surviving consumers):
- `@vis.gl/react-google-maps` — only in LeadMapMarker.tsx + LeadMapPane.tsx (deleted)
- `react-infinite-scroll-component` — only in LeadFeed.tsx (deleted)
- `motion` — imported as `motion/react` in SaveButton, BuilderLeadCard, LeadFeed, LeadMapMarker, PermitLeadCard (all deleted)
- `@tremor/react` — only in TimingBadge.tsx (deleted)

Run `npm install` to update lockfile.

### Phase 4 — Codify Mobile Rules
Create `mobile-rules.md` at project root expanding the 4 user-specified rules into a complete Expo engineering reference.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes created or modified.
* **Unhappy Path Tests:** N/A — deletion only; no new logic paths introduced.
* **logError Mandate:** N/A — no new API catch blocks.
* **Mobile-First:** N/A — backend-only app remains; mobile-rules.md governs the new Expo client.

## Database Impact: NO

## Execution Plan
- [ ] **Contract Definition:** N/A — no API route changes.
- [ ] **Spec & Registry Sync:** Create `docs/specs/00-architecture/two_client_architecture.md`. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no DB changes.
- [ ] **Test Scaffolding:** N/A — deleting tests, not creating. Deletion list is in Phase 1 above.
- [ ] **Red Light:** Run `npm run test` — establish baseline (4588 passing). Confirm typecheck clean.
- [ ] **Implementation Phase 1:** Delete app pages, feature components, hooks, and 14 UI test files.
- [ ] **Implementation Phase 2:** Update route-guard.ts + middleware.logic.test.ts.
- [ ] **Implementation Phase 3:** Remove 4 packages from package.json, run `npm install`.
- [ ] **Implementation Phase 4:** Create `mobile-rules.md` at project root.
- [ ] **Auth Boundary & Secrets:** N/A — route-guard cleanup removes dead guards; no new auth surface created.
- [ ] **Pre-Review Self-Checklist:** Verify 5-10 items: (1) no `src/app/api/` file touched; (2) no `src/app/admin/` file touched; (3) no `src/lib/` business logic deleted; (4) no `scripts/` files touched; (5) `get-lead-feed.ts` and all API lib modules untouched; (6) remaining test suite passes without import errors; (7) `npm run typecheck` clean after package removal; (8) package.json dependencies have zero surviving src/ consumers each; (9) route-guard dead-route removal doesn't accidentally block the Expo API routes.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. Run `npm run dead-code` and note residual dead code (haptics.ts, useLeadView.ts) in review-followups.md.
- [ ] **Independent Review Agent:** Spawn with `isolation: "worktree"` against modified files. Self-generated checklist.
- [ ] **Adversarial Review:** Spawn Gemini + DeepSeek agents in parallel. Triage findings. WF3 bugs. Defer rest to `docs/reports/review_followups.md`.
- [ ] **Atomic Commit:** `chore(00_system_map): two-client architecture purge — remove tradesperson UI from Next.js`
