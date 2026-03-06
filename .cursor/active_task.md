# Active Task: Pipeline Toggle Controls
**Status:** Complete — awaiting commit

## Context
* **Goal:** Add on/off toggle switches for individual pipeline steps so specific enrichments (e.g. "Enrich WSIB", "Enrich Web Entities") can be disabled now and enabled at a later stage. When a step is toggled off, it is skipped during chain execution. The 3 chain "Run All" buttons already exist in FreshnessTimeline — no changes needed there.
* **Target Spec:** `docs/specs/26_admin.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` — UI toggle switches per pipeline step
  - `src/app/api/admin/pipelines/schedules/route.ts` — extend for enabled/disabled toggle
  - `scripts/run-chain.js` — chain orchestrator (skip disabled steps)
  - `migrations/047_pipeline_enabled.sql` — add `enabled` column to `pipeline_schedules`
  - `src/components/DataQualityDashboard.tsx` — fetch and pass disabled state
  - `src/tests/admin.ui.test.tsx` — test toggle logic
  - `src/tests/chain.logic.test.ts` — test chain skip logic

## Technical Implementation
* **Database:** Add `enabled BOOLEAN NOT NULL DEFAULT TRUE` column to existing `pipeline_schedules` table via migration 047. Then set `enrich_wsib_builders` and `enrich_named_builders` to `FALSE` (disabled by default — to be turned on later).
* **API — PATCH schedules:** Add a `PATCH` handler to `/api/admin/pipelines/schedules` for toggling: `PATCH { pipeline: string, enabled: boolean }`. Existing GET returns `enabled` field. Existing PUT unchanged.
* **Chain orchestrator (`run-chain.js`):** Before executing each step, query `pipeline_schedules` for `enabled` status. If `enabled = false`, log skip, mark step as `skipped` in `pipeline_runs`, then continue to next step.
* **FreshnessTimeline UI:** Add a small toggle switch on each pipeline step row (visible on hover, always visible if disabled). Disabled steps appear dimmed with strikethrough name. Toggle fires `onToggle(slug, enabled)` callback.
* **DataQualityDashboard:** Fetch enabled states from stats (already includes `pipeline_schedules`), derive `disabledPipelines` set, pass to FreshnessTimeline with `onToggle` callback that calls PATCH.

## Standards Compliance
* **Try-Catch Boundary:** The new PATCH handler wraps its body in try-catch, returns `{ error: 'message' }` on failure with appropriate status codes.
* **logError Mandate (Rule 6.1):** The PATCH handler MUST use `logError(tag, err, context)` from `src/lib/logger.ts` in its catch block — never bare `console.error()`. The `run-chain.js` skip logging uses `console.log` (scripts are exempt from logError), but any new server-side API error path must use `logError`.
* **Unhappy Path Tests:** Test toggling a non-existent pipeline (404), invalid body (400), missing fields (400). Test chain skip behavior for disabled steps.
* **Mobile-First:** Toggle switch uses min-h-[44px] min-w-[44px] touch target area. Layout unchanged — toggle fits inline in existing row.
* **Mobile Viewport Test (Rule 5.3):** UI tests MUST mock a narrow viewport (e.g. 375px) and assert the toggle switch remains accessible at 44px touch target and that disabled-step dimming renders correctly on mobile. This verifies the mobile-first mandate is not just CSS but tested.

## Execution Plan
- [ ] **Standards Verification:** Plan adheres to Try-Catch, Unhappy Path, Mobile-First, and logError rules per `docs/specs/00_engineering_standards.md`. PATCH handler has overarching try-catch with `logError()` (not `console.error`). Toggle has 44px touch target. Tests cover error paths and narrow-viewport rendering.
- [ ] **Schema Evolution:** Migration `047_pipeline_enabled.sql` — `ALTER TABLE pipeline_schedules ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE`. Then `UPDATE pipeline_schedules SET enabled = FALSE WHERE pipeline IN ('enrich_wsib_builders', 'enrich_named_builders')`. DOWN block: `ALTER TABLE pipeline_schedules DROP COLUMN IF EXISTS enabled`.
- [ ] **Contract Definition:** PATCH `/api/admin/pipelines/schedules` — Request: `{ pipeline: string, enabled: boolean }`, Response: `{ updated: { pipeline, enabled } }` or `{ error: string }`.
- [ ] **Spec Update:** Update `docs/specs/26_admin.md` to document toggle behavior and PATCH endpoint.
- [ ] **Guardrail Test — Toggle API:** Add tests in `admin.ui.test.tsx` for: toggle switch rendering for enabled/disabled states, disabled step visual dimming, PATCH request validation (missing pipeline = 400, unknown pipeline = 404). Include a narrow-viewport test (375px mock) asserting toggle touch target >= 44px and disabled-step dimming renders correctly on mobile.
- [ ] **Guardrail Test — Chain Skip:** Add test in `chain.logic.test.ts` verifying that a disabled step is skipped and logged as `skipped`.
- [ ] **Red Light:** Run tests — new tests must fail.
- [ ] **Implementation:**
  1. Run migration `047_pipeline_enabled.sql`.
  2. Extend `schedules/route.ts` GET to include `enabled`, add PATCH handler. PATCH catch block MUST use `logError('[admin/pipelines/schedules]', err, { handler: 'PATCH' })` — never bare `console.error()`.
  3. Update `run-chain.js` to query `pipeline_schedules` and skip disabled steps.
  4. Add toggle UI to `FreshnessTimeline.tsx` — inline switch per step row.
  5. Update `FreshnessTimelineProps` with `disabledPipelines` and `onToggle` callback.
  6. Wire toggle in `DataQualityDashboard.tsx` — derive disabled set from stats, pass to FreshnessTimeline, call PATCH on toggle.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. All tests must pass.
- [ ] **Atomic Commit:** Prompt user to commit: `git commit -m "feat(26_admin): pipeline step toggle controls"`.
- [ ] **Founder's Audit:** Verify no laziness placeholders, all exports resolve, schema matches spec.
