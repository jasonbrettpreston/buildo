# DB Transparency Implementation Plan (Option C)

## Executive Summary
This report outlines the implementation strategy for "Option C: Raw DB transparency" in the pipeline monitoring dashboard. The goal is to eliminate systemic bugs (specifically bugs #1, #2, #3, #8, and #9) by shifting from hardcoded dashboard logic to a dynamic, database-driven approach. 

**Critical Prerequisite:** As per the audit verdict, **Bug #4 (hardcoded records) MUST be fixed first** before initiating this implementation.

## The 5 Requests (DB Transparency Features)

### T1: Pre-run snapshot (COUNT before/after)
**Concept:** Capture the exact number of rows in target tables immediately before a pipeline starts and right after it finishes.
**Implementation:** 
- Inject a telemetry step in the pipeline runner that executes `SELECT count(*) FROM target_table` before the ETL process begins.
- Execute the same query upon pipeline completion.
- Store the `before_count` and `after_count` in a `metrics` JSONB column within the `pipeline_runs` table.

### T2: Row-level diff via pg_stat (ins/upd/del)
**Concept:** Utilize PostgreSQL's internal statistics to track exact mutation volumes.
**Implementation:**
- Query `pg_stat_user_tables` for `n_tup_ins`, `n_tup_upd`, and `n_tup_del` for the relevant tables before the run.
- Query again after the run.
- The delta provides the exact number of rows inserted, updated, and deleted by the pipeline, independent of application-level counting. 
- *Note:* `pg_stat` views can have slight delays depending on the DB configuration; ensure `ANALYZE` or explicit metric flushing is considered if millisecond accuracy is required.

### T3: Live DB state bar (table row counts)
**Concept:** A persistent UI element on the dashboard showing real-time row counts for primary domain tables (e.g., permits, properties, etc.).
**Implementation:**
- Create a new API endpoint `/api/db/stats` that executes lightweight approximate counts (or exact counts if tables are small/cached).
- In the frontend, build a `LiveStateBar` React component that polls this endpoint periodically (e.g., every 30-60 secs) or uses SWR/React Query for background refetching.

### T4: Before/after column NULL fill audit
**Concept:** Track how effectively a pipeline is enriching data by measuring the reduction of `NULL` values in specific target columns.
**Implementation:**
- For pipelines configured to enrich specific columns (e.g., `classified_at`, `geometry`), query `SELECT count(*) FROM table WHERE column IS NULL` before and after the run.
- Calculate the "Fill Audit Response" (e.g., "500 NULLs populated").
- Expose this metric in the pipeline run summary UI.

### T5: Historical sparkline (last N runs)
**Concept:** Visual trend lines indicating pipeline health, duration, or volume over its recent execution history.
**Implementation:**
- Create an API route that queries the last 10-20 runs for a given pipeline from the `pipeline_runs` table.
- Use a lightweight charting library (or a custom SVG component) to map duration, processed rows, or success/failure states into a sparkline. 
- Render this inline next to each pipeline name on the dashboard.

---

## Architectural Adjustments

### 1. Simplify `getStatusDot()`
By reading directly from `pipeline_runs`, we bypass application-level state assumptions.
```typescript
// Proposed Refactor (5 lines)
export function getStatusDot(runStatus: 'running' | 'success' | 'failed') {
  const colorMap = { running: 'bg-yellow-400', success: 'bg-green-500', failed: 'bg-red-500' };
  return <div className={`w-3 h-3 rounded-full ${colorMap[runStatus] || 'bg-gray-300'}`} />;
}
```

### 2. Dynamic Schema Retrieval
Instead of hardcoding table names and expected columns in the UI, the dashboard config should fetch the schema context directly from the database or the centralized Drizzle schema definitions. This ensures the dashboard always matches reality, eliminating data drift bugs.

## UI Integration Strategy (The "Data Flow" Tile Upgrade)

Based on the existing `FreshnessTimeline.tsx` and `accordion-tile` components, the best approach is to consolidate the Data Quality Audit and DB layer metrics directly into the **Data Flow / Description tile** (the top tile when a pipeline is expanded). This provides a single, high-density view of *what the pipeline is supposed to do* versus *what it actually did* on its last run.

### 1. In-Line Pipeline Header (T3 & T5)
The main pipeline rows (the closed state) currently show Status, Records (Total/New/Updated), Duration, and Last Run.
- **T5 (Historical Sparkline):** Introduce a small, inline SVG sparkline (e.g., last 10 runs' durations or record counts) next to the "Records" column. This gives immediate macro-context without requiring a click.
- **T3 (Live DB State Bar):** Instead of a separate global widget, append an unobtrusive "Live Rows" count next to the pipeline name (e.g., `Building Permits [47,192 rows]`), polled every 60s via the new `/api/db/stats` endpoint.

### 2. The Upgraded "Data Flow" Description Tile (T1, T2, T4 & Schema)
When expanded, the first tile the user sees acts as the pipeline's contract and its most recent audit. We will upgrade the existing `DataFlowTile`:

**A. DB-Sourced Schema Mapping:**
- Remove hardcoded field arrays from the UI code. 
- The description area will dynamically list the **Read Tables/Fields** and **Write Tables/Fields** directly queried from the database's `information_schema` (or Drizzle schema). 
- *Benefit:* Ensures the dashboard is a true reflection of the DB structure. If a column is dropped, it disappears from the UI autonomously.

**B. Data Quality Audit (Baseline vs. Last Run):**
Directly beneath the schema mapping, we inject the exact database mutations from the last execution:
- **T1 (Pre/Post Count Snapshot):** Show the literal table row expansion.
  - *Format:* `Permits Table: 47,100 → 47,192 (+92)`
- **T2 (pg_stat Engine Diff):** Display the database engine's reality check beneath the T1 count.
  - *Format:* `<span class="bg-green-100 text-green-700">Ins: 80</span> <span class="bg-blue-100 text-blue-700">Upd: 12</span> <span class="bg-red-100 text-red-700">Del: 0</span>`
- **T4 (NULL Fill Audit):** For enrichment pipelines, display the fill-rate improvement right next to the written columns.
  - *Format:* `Column 'geometry': 15% missing → 2% missing (260 filled)`

### Summary of Component Changes:
- **`FreshnessTimeline.tsx`**: Add `Sparkline` component to the closed-row view. Fetch and display the T3 Live Count near the pipeline name.
- **`FunnelPanels.tsx`**: Significantly expand the `DataFlowTile` component. It will now consume `dbSchemaMap` to render accurate Read/Write boundaries, and it will consume the new JSONB telemetry (T1 `counts`, T2 `pg_stats`, T4 `null_fills`) from the `pipeline_runs` row to render the Data Quality Audit inline.

## Recommended Execution Plan (WF2)

1. **Gate Check:** Resolve High-Severity Bug #4 (hardcoded records) to establish a baseline of trust.
2. **Phase 1: Database Telemetry Hooks** 
   - Extend the pipeline execution engine to support `pre_run_hooks` and `post_run_hooks`.
   - Implement the `pg_stat` and `COUNT()` extractors for T1, T2, and T4.
3. **Phase 2: Data Persistence**
   - Ensure `pipeline_runs` has a `metrics` (JSONB) column to store the Before/After states and stats.
4. **Phase 3: API & Endpoints**
   - Build `/api/pipelines/history` (T5).
   - Build `/api/db/stats` (T3).
5. **Phase 4: UI Dashboard Wipe & Rebuild**
   - Strip out the current hardcoded dashboard logic.
   - Implement the new Option C layout containing the Live DB state bar (T3), historical sparklines (T5), and robust drill-down views displaying telemetry (T1, T2, T4).
