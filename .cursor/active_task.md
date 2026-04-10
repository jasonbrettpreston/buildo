# Active Task: Lead Feed Health Dashboard UI (Phase B)
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `9bc72e1d` (9bc72e1d05d767d8a6cbf5ad0884da23a2d8b11b)

## Context
* **Goal:** Build the admin dashboard UI for lead feed health observability. Phase A (committed as 9bc72e1) delivered two backend endpoints (`GET /api/admin/leads/health` and `GET /api/admin/leads/test-feed`). Phase B builds the admin page and dashboard component that consumes them.
* **Target Spec:** `docs/specs/product/admin/76_lead_feed_health_dashboard.md` §2.3
* **Key Files:**
  - `src/lib/admin/lead-feed-health.ts` (types: `LeadFeedHealthResponse`, `TestFeedDebug`)
  - `src/app/api/admin/leads/health/route.ts` (health endpoint — read-only)
  - `src/app/api/admin/leads/test-feed/route.ts` (test feed endpoint)
  - `src/app/admin/page.tsx` (3rd tile already added in Phase A)
  - `src/components/DataQualityDashboard.tsx` (polling pattern to follow)

## Technical Implementation
* **New Components:**
  - `src/app/admin/lead-feed/page.tsx` — admin page shell, renders `<LeadFeedHealthDashboard />`
  - `src/components/LeadFeedHealthDashboard.tsx` — 4-section dashboard (readiness gauge, cost/timing coverage, engagement panel, test feed tool)
* **Data Hooks/Libs:**
  - Consumes `LeadFeedHealthResponse` and `TestFeedDebug` from `src/lib/admin/lead-feed-health.ts`
  - Polling via `setInterval` + `fetch` (same pattern as `DataQualityDashboard.tsx`)
  - Test feed form uses on-demand fetch (no polling)
* **Database Impact:** NO — all data already exists, read-only consumption
* **UI Libraries Used:**
  - Tremor `ProgressCircle` for readiness gauge, `BarList` for trade breakdown
  - Shadcn `Card`, `Button`, `Label`, `Skeleton` for layout/loading
  - Tailwind mobile-first styling

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes in Phase B (backend done in Phase A)
* **Unhappy Path Tests:** API fetch failure → error state, empty data → zero states, timeout → stale badge
* **logError Mandate:** N/A — no API routes
* **Mobile-First:** Base = single column stack. `md:grid-cols-2` for sections 1+2 side-by-side. Full-width form inputs on mobile, inline on `md:`. Touch targets >= 44px.

## Execution Plan
- [ ] **Contract Definition:** N/A — no new API routes. Phase A endpoints are committed and typed.
- [ ] **Spec & Registry Sync:** Spec exists (`76_lead_feed_health_dashboard.md`). Run `npm run system-map` after implementation.
- [ ] **Schema Evolution:** N/A — no DB changes.
- [ ] **Test Scaffolding:** Create `src/tests/LeadFeedHealthDashboard.ui.test.tsx` with tests for:
  - Readiness gauge renders feed_ready_pct with correct traffic light color
  - Breakdown bar shows geocoded/classified/cost segments
  - Builder readiness row shows counts
  - Cost source pie chart segments (permit/model/null)
  - Timing freshness badge color (green <24h, yellow <48h, red >48h)
  - Engagement: views/saves numbers, trade breakdown table
  - Test feed form: default values, trade dropdown, submit triggers fetch
  - Test feed results: debug panel shows score distribution + pillar averages
  - Loading state: skeleton placeholders
  - Error state: error message displayed
  - Empty engagement: zero values, no crash
  - Mobile viewport (375px): single column, touch targets >= 44px
  - Desktop viewport: multi-column grid layout
- [ ] **Red Light:** Run `npx vitest run src/tests/LeadFeedHealthDashboard.ui.test.tsx`. Must see failing tests.
- [ ] **Implementation:** Build `src/app/admin/lead-feed/page.tsx` and `src/components/LeadFeedHealthDashboard.tsx`.
  - Section 1: Feed Readiness Gauge (ProgressCircle + breakdown bar + traffic light)
  - Section 2: Cost & Timing Coverage (cost source bar + timing freshness badge)
  - Section 3: User Engagement (views/saves numbers + trade breakdown BarList)
  - Section 4: Test Feed Tool (form + results + debug panel)
  - 10s polling for health endpoint
  - Loading/error/empty states
- [ ] **Auth Boundary & Secrets:** Page is under `/admin/` route — already guarded by middleware. No secrets in client component.
- [ ] **Pre-Review Self-Checklist:** Walk spec §2.3 requirements against actual diff before Green Light.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
