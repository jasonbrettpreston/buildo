# WF5 Audit: CQA Drill-Down Metrics
**Date**: March 7, 2026

This report constitutes a Workflow 5 (WF5) audit of the "Last Run" drill-down panel for the Schema Validation (`assert_schema`) and Data Quality (`assert_data_bounds`) pipeline steps.

## Evaluation Rubric

| Evaluation Vector | Criteria for Grade 'A' | Grade Assessment | Finding |
| :--- | :--- | :--- | :--- |
| **Logic & Accuracy** | Drill-down metrics present data relevant to the step's specific function (e.g., checks rather than records for CQA). | **FAIL** | CQA steps incorrectly display "Records: 0" and "New/Changed: 0" above the actual quality metrics. |
| **UI/UX Consistency** | The UI hierarchy cleanly separates metadata from core metrics; irrelevant metrics are hidden rather than shown as zero. | **B** | `records_meta` is successfully rendering `checks_passed` and `checks_failed`, but is cluttered by the irrelevant inherited metrics. |

## Bug Diagnosis: Irrelevant "Records" Metrics in CQA Steps
**Finding: Inherited Metric Bloat**
The core issue reported by the user is that the "Last Run" section for `assert_schema` and `assert_data_bounds` lists "Records" and "New/Changed" (which are irrelevant to a validation script) instead of exclusively showing the validation results.

*   **The Cause:** In `FreshnessTimeline.tsx`, the non-funnel "Last Run" tile checks `info.records_total != null` before rendering the "Records" row. Because the CQA scripts pass `0` to the database for these fields (to satisfy the numerical column), the frontend sees `0 != null` and renders "Records: 0" and "New/Changed: 0". The *actual* relevant data (`checks_passed`, `checks_failed`, `errors`) is stored in the `records_meta` JSONB payload and is rendered *below* these irrelevant zeros.
*   **The Fix:** We need to explicitly hide the `records_total`, `records_new`, and `records_updated` UI block if the pipeline step belongs to the `quality` group (or similar non-ingestion infrastructure steps). By hiding these, the UI will neatly promote the `records_meta` object (which correctly contains `checks_passed`, `checks_warned`, and `checks_failed`) to be the primary metrics displayed in the tile.

**Quality Group Steps**
As defined in the `PIPELINE_REGISTRY`, the steps belonging strictly to the `quality` group are:
- `assert_schema` (Schema Validation)
- `assert_data_bounds` (Data Quality Checks)

## Conclusion & Next Steps
We will move to execution to patch `FreshnessTimeline.tsx`. Specifically, we will wrap the `Records` and `New/Changed` rendering block with a check ensuring the `stepGroup` is not `quality` or `snapshot`, ensuring CQA steps only show their highly relevant `records_meta` metrics.

---

# WF5 Audit: Top Health Banner
**Date**: March 7, 2026

This report assesses the utility, relevance, code health, and UX of the "Health Banner" at the top of the Data Quality Dashboard.

## Evaluation Rubric

| Evaluation Vector | Criteria for Grade 'A' | Grade Assessment | Finding |
| :--- | :--- | :--- | :--- |
| **Logic & Utility**| Metrics displayed directly inform user action. | **FAIL** | "Violations," "Completeness," "Volume," and "Enrichment" summarize data generically but offer no actionable insight into *which* pipelines are lagging relative to their schedule. |
| **Code Health**    | Component logic is decoupled and testable. | **B** | `DataQualityDashboard.tsx` dynamically calculates trend deltas inline (lines 380-454). While functional, it bloats the view component. |
| **UX & Actionability** | The banner guides the user toward maintaining system health. | **C** | While 1-click "Retry Failed" exists, the user cannot see at a glance if a quarterly dataset (like Address Points) is slipping past its SLA. |

## Bug Diagnosis: Irrelevant Aggregate Metrics
**Finding: Lack of Actionable Pipeline Status**
The top banner currently renders four generic trend blocks: Violations, Completeness, Volume (24h), and Enrichment. While these provide high-level health signals, they are "somewhat useless" for an administrator whose primary job is managing pipeline execution.
Instead, the administrator needs to know which pipelines are out of date relative to their schedule (e.g., "Address Points: 15 days overdue for Quarterly run").

*   **The Fix:** We will replace the four generic trend blocks in `DataQualityDashboard.tsx` with pipeline status indicators. The new layout will iterate over the pipeline schedules and identify which major groups (Ingest, Link, Quality) have steps that are overdue, pending, or healthy relative to their `cadence` (Daily, Quarterly, Annual).

### Schedule vs. Reality Visual Mappings
To make the top banner and individual pipeline tiles instantly readable, we will map status to specific colors and icons indicating schedule adherence. A pipeline is considered "Stale" if its `last_run_at` exceeds the threshold defined by its `cadence` (e.g., >24h for Daily, >90 days for Quarterly).

| Status State | Condition | Tile Background | Icon | Label | Mobile Pulse |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Healthy** | Completed within scheduled cadence. | `bg-green-50` / `border-green-200` | ✔️ (Check) | Up to Date | None |
| **Running** | Currently executing. | `bg-blue-50` / `border-blue-300` | 🔄 (Spinner) | Running | Blue glow (`tile-flash-running`) |
| **Pending** | Never run before (Net new). | `bg-gray-50` / `border-gray-200` | ⏳ (Hourglass) | Pending | None |
| **Stale / Due** | Overdue based on cadence elapsed time. | `bg-yellow-50` / `border-yellow-400` | ⚠️ (Triangle) | Due for Run | Yellow pulse (`tile-flash-warning`) |
| **Overdue** | Failed to update or 2x beyond cadence cadence. | `bg-purple-50` / `border-purple-400` | ⏰ (Alarm clock) | Overdue | Purple pulse (`tile-flash-overdue`) |
| **Failed** | Last run ended in error state. | `bg-red-50` / `border-red-400` | ❌ (Cross) | Failed | Red pulse (`tile-flash-stale`) |

## Conclusion & Next Steps
We will update the implementation plan to replace the `current` and `prev` trend delta blocks in `DataQualityDashboard.tsx` with a new, pipeline-schedule-focused UX incorporating the visual language outlined above.

---

# Resolution Update
**Date**: March 7, 2026

| # | Finding | Status | Resolution |
|---|---------|--------|------------|
| 1 | CQA drill-down records bloat | **RESOLVED** | Records/New/Changed block in FreshnessTimeline.tsx guarded by `stepGroup !== 'quality' && stepGroup !== 'snapshot'`. CQA steps now show only `records_meta` (checks_passed, checks_failed, checks_warned/errors with color-coded counts). |
| 2 | Health banner generic trends | **RESOLVED** | Replaced Violations/Completeness/Volume/Enrichment trend blocks with 4 pipeline chain status tiles (Permits, CoA, Entities, Sources). Each shows schedule adherence (Up to date / Due / Failed / Running / Pending) based on cadence thresholds (Daily=26h, Quarterly=95d) with last-run timestamp. |

**Test Coverage:** 3 new guardrail tests. Full suite: 1784 tests passing.

**All audit findings are now resolved.**

---

# Resolution Update
**Date**: March 7, 2026

| # | Finding | Status | Resolution |
|---|---------|--------|------------|
| 1 | CQA drill-down records bloat | **RESOLVED** | Records/New/Changed block in FreshnessTimeline.tsx guarded by `stepGroup !== 'quality' && stepGroup !== 'snapshot'`. CQA steps now show only `records_meta` (checks_passed/failed/warned). |
| 2 | Health banner generic trends | **RESOLVED** | Replaced Violations/Completeness/Volume/Enrichment trend blocks with 4 pipeline-group schedule adherence indicators (Ingest/Enrich/Classify/Quality). Each shows healthy/due/failed status with overdue count based on cadence thresholds (Daily=26h, Quarterly=95d, Annual=370d). |

**Test Coverage:** 3 new guardrail tests added. Full suite: 1784 tests passing.

**All audit findings are now resolved. No remaining debt.**
