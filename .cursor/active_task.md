# Active Task: Dynamic DB Schema for Pipeline Descriptions (WF2)
**Status:** Implementation

## Context
* **Goal:** Replace hardcoded `STEP_DESCRIPTIONS.fields` arrays with live `information_schema` data queried from the database. This eliminates schema drift permanently — the UI always shows the exact columns that exist in each target table.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Audit Report:** `docs/reports/pipeline_descriptions_wf5_audit.md`
* **Key Files:** `src/lib/admin/funnel.ts`, `src/app/api/admin/stats/route.ts`, `src/components/DataQualityDashboard.tsx`, `src/components/FreshnessTimeline.tsx`, `src/tests/quality.logic.test.ts`, `src/tests/admin.ui.test.tsx`

## Technical Implementation

### Change 1: API — Query `information_schema.columns`
* **File:** `src/app/api/admin/stats/route.ts`
* **What:** Add a new parallel query that fetches column names grouped by table for all tables referenced in `STEP_DESCRIPTIONS`. Return as `db_schema_map: Record<string, string[]>` in the JSON response.
* **Query:** `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name, ordinal_position`
* **Tables param:** Deduplicated list of `STEP_DESCRIPTIONS[*].table` values.

### Change 2: Strip `fields` from `STEP_DESCRIPTIONS`
* **File:** `src/lib/admin/funnel.ts`
* **What:** Remove `fields: string[]` from `StepDescription` interface and all hardcoded `fields` arrays from `STEP_DESCRIPTIONS`. Keep `summary` and `table` (both are accurate per the audit).

### Change 3: Pass schema map through component tree
* **File:** `src/components/DataQualityDashboard.tsx`
* **What:** Extract `db_schema_map` from stats response and pass it to `FreshnessTimeline` as a new prop.

### Change 4: Render live columns in Description tile
* **File:** `src/components/FreshnessTimeline.tsx`
* **What:** Accept `dbSchemaMap?: Record<string, string[]>` prop. In the Description tile (line 724), replace `desc.fields.map(...)` with `(dbSchemaMap?.[desc.table] ?? []).map(...)`. Add a small "Live DB Schema" badge next to the table name.

### Database Impact
NO — read-only `information_schema` query.

## Standards Compliance
* **Try-Catch Boundary:** The schema query is inside the existing stats route try-catch. Non-fatal — empty map fallback if query fails.
* **Unhappy Path Tests:** Test that UI gracefully handles missing/empty schema map (falls back to empty field list).
* **logError Mandate:** N/A — no new API routes, existing catch block already uses `logError`.
* **Mobile-First:** N/A — no layout changes, just data source swap.

## Execution Plan
- [x] **Standards Verification:** No new API routes; existing try-catch covers schema query. No layout changes. Mobile-first N/A.
- [ ] **State Verification:** `STEP_DESCRIPTIONS.fields` consumed in: FreshnessTimeline.tsx (line 725), quality.logic.test.ts (lines 708-757), admin.ui.test.tsx (line 1074). `yieldFields` on FUNNEL_SOURCES is a separate concern (not consumed in UI rendering) — leave untouched.
- [ ] **Spec Update:** Update spec 28 to note dynamic schema query replaces hardcoded fields.
- [ ] **Viewport Mocking:** Backend + data source change, N/A.
- [ ] **Guardrail Test:** Update quality.logic.test.ts: remove `fields`-based assertions, add test that `StepDescription` interface has no `fields` property, add test that stats route queries `information_schema`.
- [ ] **Red Light:** Verify new tests fail.
- [ ] **Implementation:**
  - (a) Remove `fields` from `StepDescription` interface and all entries in `STEP_DESCRIPTIONS`.
  - (b) Add `information_schema.columns` query to stats route, return as `db_schema_map`.
  - (c) Pass `dbSchemaMap` from DataQualityDashboard → FreshnessTimeline.
  - (d) Render live columns in Description tile with "Live DB Schema" badge.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`.
- [ ] **Collateral Check:** `npx vitest related src/lib/admin/funnel.ts src/components/FreshnessTimeline.tsx --run`.
- [ ] **Atomic Commit:** `feat(28_data_quality_dashboard): replace hardcoded description fields with live information_schema query`
