# Active Task: WF2 — Lead Feed Health Dashboard Removal + TestFeedTool Extraction
**Status:** Implementation

## Context
* **Goal:** Surgically remove the over-engineered Lead Feed Health dashboard (traffic lights, Tremor charts, polling, cost/engagement metrics) while preserving and promoting the Test Feed Tool as a standalone admin component.
* **Target Spec:** `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md`
* **Rollback Anchor:** `a57633f7674e68789ebae270bafc6936b91556b2`
* **Key Files:**
  - DELETE: `src/components/LeadFeedHealthDashboard.tsx`
  - DELETE: `src/app/api/admin/leads/health/route.ts`
  - DELETE: `src/tests/LeadFeedHealthDashboard.ui.test.tsx`
  - DELETE: `src/tests/lead-feed-health.infra.test.ts`
  - DELETE: `src/tests/lead-feed-health.logic.test.ts`
  - SLIM+RENAME: `src/lib/admin/lead-feed-health.ts` → `src/lib/admin/test-feed-utils.ts` (keep only: TestFeedDebug, computeTestFeedDebug, isPostgisAvailable, sanitizePgErrorMessage, __resetPostgisCacheForTests)
  - UPDATE IMPORTS: `src/app/api/leads/feed/route.ts` (imports isPostgisAvailable)
  - UPDATE IMPORTS: `src/app/api/admin/leads/test-feed/route.ts` (imports from lead-feed-health)
  - CREATE: `src/components/admin/TestFeedTool.tsx`
  - CREATE: `src/tests/test-feed-utils.logic.test.ts`
  - CREATE: `src/tests/test-feed.infra.test.ts`
  - UPDATE: `src/app/admin/lead-feed/page.tsx`
  - KEEP UNCHANGED: `src/app/api/admin/leads/test-feed/route.ts` (already correct — PostGIS pre-flight + admin-test bypass already implemented)
  - KEEP: @tremor/react in package.json — still required by TimingBadge.tsx

## Technical Implementation
* **New/Modified Components:**
  - `src/components/admin/TestFeedTool.tsx` — extracted standalone component, no Tremor, plain Tailwind, mobile-first
* **Data Hooks/Libs:**
  - `src/lib/admin/test-feed-utils.ts` — extracted utilities (isPostgisAvailable, sanitizePgErrorMessage, TestFeedDebug, computeTestFeedDebug, __resetPostgisCacheForTests)
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** No new API routes. Existing test-feed route already has full try-catch + logError. N/A for deletions.
* **Unhappy Path Tests:** test-feed.infra.test.ts preserves structure tests for 400/503/500 codes.
* **logError Mandate:** N/A — no new catch blocks introduced. Existing route compliant.
* **Mobile-First:** TestFeedTool uses `flex flex-col md:flex-row` layout. Touch targets min-h-[44px] on all inputs/buttons.

## Execution Plan
- [ ] **State Verification:** isPostgisAvailable is consumed by BOTH /api/leads/feed/route.ts AND /api/admin/leads/test-feed/route.ts. Cannot delete lead-feed-health.ts without extracting shared utilities first.
- [ ] **Contract Definition:** N/A — test-feed route contract unchanged. Route already correct.
- [ ] **Spec Update:** Update docs/specs/02-web-admin/76_lead_feed_health_dashboard.md. Run npm run system-map.
- [ ] **Schema Evolution:** N/A.
- [ ] **Guardrail Test — Red Light:** Run npm run test to confirm baseline. Deletions will cause expected failures.
- [ ] **Step 1 — Extract utilities:** Create src/lib/admin/test-feed-utils.ts with: TestFeedDebug, computeTestFeedDebug, isPostgisAvailable, __resetPostgisCacheForTests, sanitizePgErrorMessage.
- [ ] **Step 2 — Update imports:** Update /api/leads/feed/route.ts and /api/admin/leads/test-feed/route.ts to import from @/lib/admin/test-feed-utils.
- [ ] **Step 3 — Delete health files:** Delete LeadFeedHealthDashboard.tsx, health/route.ts, lead-feed-health.ts.
- [ ] **Step 4 — Create TestFeedTool.tsx:** Standalone use client component. useState for form fields (admin tool, not in src/features/leads/ — strict Foundation rules do not apply). Button-triggered fetch (not useEffect). No Tremor. Mobile-first Tailwind.
- [ ] **Step 5 — Update admin page:** Replace LeadFeedHealthDashboard import with TestFeedTool in src/app/admin/lead-feed/page.tsx.
- [ ] **Step 6 — Replace tests:** Delete LeadFeedHealthDashboard.ui.test.tsx. Write test-feed-utils.logic.test.ts (computeTestFeedDebug + isPostgisAvailable). Write test-feed.infra.test.ts (test-feed route shape only — no health route tests).
- [ ] **UI Regression Check:** npx vitest run src/tests/*.ui.test.tsx
- [ ] **Pre-Review Self-Checklist:** Walk diff against spec. Output PASS/FAIL per item.
- [ ] **Green Light:** npm run test && npm run lint -- --fix. All pass. Then WF6.
