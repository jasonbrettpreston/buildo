# DB Transparency Field Mapping & Baseline Review

This report outlines exactly which actual database fields, tables, and system queries will be used to populate the T1-T5 features in the new DB Transparency dashboard. It also contrasts this against the current application-level baseline.

## 1. The Core State Object (Pipeline Runs)

**Current Implementation Baseline:**
The current UI reads from the `pipeline_runs` table using:
- `status` (String: running/completed/failed)
- `duration_ms` (Integer)
- `last_run_at` (Timestamp)
- `records_new` (Integer: Manually incremented/counted by the Node.js script logic)
- `records_updated` (Integer: Manually incremented/counted by the Node.js script logic)
- `records_total` (Integer: Manually incremented/counted by the Node.js script logic)

*Problem with Baseline:* The `records_*` fields are entirely synthetic. If a script errors out before reaching `await db.update(pipeline_runs).set({ records_new: x })`, the dashboard reads null/zero, even if 5,000 rows were successfully pushed to the DB in earlier batches.

**New DB Transparency Plan:**
We will reuse the existing `pipeline_runs.records_meta` column (which is a JSONB object). We are adding a new `telemetry` payload into this JSONB object:

```json
{
  "telemetry": {
    "counts": { ...T1 data... },
    "pg_stats": { ...T2 data... },
    "null_fills": { ...T4 data... }
  }
}
```

---

## 2. Field Mapping by Feature (T1–T5)

Below are the exact database queries and fields that will be sourced to populate the dashboard elements.

### T1 (Pre-run snapshot: COUNT before/after)
* **Target Table:** Whichever target table the pipeline writes to (e.g., `permits`, `properties`).
* **Sourced Field:** Dynamic aggregate.
* **DB Query Form:** 
  `SELECT count(*) FROM target_schema.target_table;`
* **JSONB Storage Path:** 
  `pipeline_runs.records_meta -> 'telemetry' -> 'counts' -> 'target_table' -> 'before'`
  `pipeline_runs.records_meta -> 'telemetry' -> 'counts' -> 'target_table' -> 'after'`

### T2 (Row-level diff via pg_stat)
* **Target Table:** PostgreSQL's internal schema view: `pg_catalog.pg_stat_user_tables`
* **Sourced Fields:** `n_tup_ins` (inserted), `n_tup_upd` (updated), `n_tup_del` (deleted).
* **DB Query Form:** 
  `SELECT n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_user_tables WHERE relname = 'target_table';`
* **JSONB Storage Path:** 
  `pipeline_runs.records_meta -> 'telemetry' -> 'pg_stats' -> 'target_table' -> 'ins'` (computed delta)

### T3 (Live DB state bar)
* **Target Table:** PostgreSQL's internal optimization view: `pg_catalog.pg_class`
* **Sourced Fields:** `reltuples` (Live metadata estimate of total rows).
* **DB Query Form:** 
  `SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'target_table';`
* **Execution:** Not stored in `pipeline_runs`. Executed live by `/api/db/stats` polling the DB in real-time.

### T4 (Before/after column NULL fill audit)
* **Target Table:** The specific table being enriched (e.g., `permits`).
* **Sourced Fields:** Dynamic aggregate filtering `NULL`.
* **DB Query Form:**
  `SELECT count(*) FROM target_schema.target_table WHERE target_column IS NULL;`
* **JSONB Storage Path:** 
  `pipeline_runs.records_meta -> 'telemetry' -> 'null_fills' -> 'target_table' -> 'target_column' -> 'before'`

### T5 (Historical sparkline)
* **Target Table:** `pipeline_runs`
* **Sourced Fields:** `duration_ms` (Current DB Column), `started_at` (Current DB Column), and potentially the extracted T1/T2 JSONB data depending on the sparkline metric.
* **DB Query Form:**
  `SELECT started_at, duration_ms, status FROM pipeline_runs WHERE pipeline_id = 'pipeline_slug' ORDER BY started_at DESC LIMIT 10;`

### UI Schema Mapping (The "Contract" display)
To eliminate hardcoded `STEP_DESCRIPTIONS` objects linking fields in the UI, the Data Flow tile will query the actual DB schema boundaries.
* **Target Table:** PostgreSQL's internal schema dictionary: `information_schema.columns`
* **Sourced Fields:** `table_name`, `column_name`, `data_type`
* **DB Query Form:**
  `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (...)`
* **Usage:** The backend maps the pipeline's configured `source` tables and `target` tables against this query. The UI then loops over the returned `column_name`s to render exactly what columns exist today for the step to read/write. If a developer drops the `classified_at` column from DB schema, it disappears from this tile instantly.

---

## 3. Review Against The Plan

The mapping above perfectly aligns with the current `db_transparency_implementation_plan.md` strategy.

By injecting T1, T2, and T4 queries directly into the pipeline orchestration SDK (`scripts/lib/pipeline.js` or similar orchestrator wrapper), the system will interrogate the PostgreSQL internal engines (`pg_stat` and `count()` aggregates) immediately before executing a step, and immediately after. 

## 4. Per-Step UX Mapping

How these extracted database fields will be surfaced to the user in the `FreshnessTimeline` and `FunnelPanels` components on a **per-pipeline step** basis:

### A. The Closed Step Row 
When a pipeline step (e.g., `Classify Trades`) is collapsed in the timeline list:

1. **[T3: Live DB State Bar]**
   - **Location:** Inline, directly beside the pipeline step name.
   - **UX Format:** `Classify Trades` `<span class="text-xs text-gray-400 border px-1 rounded">234,101 rows</span>`
   - **Data Value:** `pg_class.reltuples` fetched from `/api/db/stats`.

2. **[T5: Historical Sparkline]**
   - **Location:** Inline, occupying the blank space between the pipeline step name and the standard "Records" tally on the far right.
   - **UX Format:** A 40px × 16px SVG curve mapping the `duration_ms` of the last 10 runs (`pipeline_runs` history).

### B. The Expanded Accordion (The "Data Flow" Tile)
When the user clicks the chevron to expand the pipeline step, exposing the `DataFlowTile`:

1. **[DB Schema Mapping]**
   - **Location:** The top section of the `DataFlowTile`.
   - **UX Format:** A literal representation of the DB boundaries showing the tables and their exact available structure.
     `READ:` `[permits.id, permits.description]`
     `WRITE:` `[permits.classified_at, permits.scope_id]`
   - **Data Value:** Dynamic mapping built by combining the pipeline definition with `information_schema.columns` (`table_name`, `column_name`, `data_type`).

2. **[T1: Pre/Post Count Snapshot] & [T2: Row-level pg_stat diff]**
   - **Current Location (Baseline):** The application currently renders a tile labeled **"Last Run"**. Inside this tile, it uses `records_total`, `records_new`, and `records_updated` (all pulled from the root of `pipeline_runs`) to render simple generic text strings (e.g., "Records: 48,000", "New/Changed: 10").
   - **New UX Location:** These new db-engine metrics will entirely replace the generic `records_*` counts inside the **"Last Run" tile**. 
   - **New UX Format:** 
     Within the "Last Run" tile, beneath Duration/Status:
     `Table: 84,200 → 84,500 (+300)` *(T1 Data)*
     `<pill-green>Ins: 300</pill-green>` `<pill-blue>Upd: 12</pill-blue>` `<pill-red>Del: 0</pill-red>` *(T2 Data)*
   - **Data Value:** 
     - T1: Extracted from `pipeline_runs.records_meta.telemetry.counts` JSONB.
     - T2: Extracted from `pipeline_runs.records_meta.telemetry.pg_stats` JSONB.

4. **[T4: NULL Fill Audit]** (Only visible on enrichment steps like Geocoding or Classification)
   - **Location:** A new right-aligned panel or sub-row beneath the T2 pills, specifically highlighting the column the step is designed to fill.
   - **UX Format:** A small progress/fill bar. 
     `classified_at: 10% NULL → 2% NULL (800 filled)`
   - **Data Value:** Extracted from `pipeline_runs.records_meta.telemetry.null_fills` JSONB.

## 5. Global Chain Execution Summary

When an entire pipeline chain finishes executing (e.g., the Daily Permits Chain completes its 14 steps), it is necessary to present a consolidated wrap-up summarizing the net data impact across all stages. 

### Sourcing & Aggregation
Rather than tracking application-level loop iterations, the chain orchestrator will compute an aggregate summary directly from the collected PostgreSQL telemetry JSONBs of the individual steps.

- **Net Insertions:** Sum of `pg_stat.n_tup_ins` across all Ingest steps (e.g., permits, address_points).
- **Net Updates:** Sum of `pg_stat.n_tup_upd` across all Link and Classify steps.
- **Null Values Remedied:** Sum of all `null_fills.filled` columns from enrichment loops.

### UX Mapping: The "Chain Completion Report"
- **Location:** A new, distinct, alert-style tile injected at the top of the chain's step list within `FreshnessTimeline.tsx` (only visible once the entire chain wraps).
- **UX Format:** 
  It acts as a dynamic receipt:
  `[✅ PERMITS CHAIN COMPLETED]`
  `Duration: 4m 12s | 340 New Rows Ingested | 1,202 Records Enriched | 100% Schema Compliance`

### Deterministic Chain Success Logic
Under this new methodology, a chain's success isn't just "did the scripts run without throwing an error 500?" It is defined by actual DB impact:
- **Success:** The chain is marked "Success" if the pre/post row counts (T1) or the `pg_stat_user_tables` delta (T2) are > 0 for the ingestion steps, and the CQA `assert_schema` gates all pass.
- **Warning (Stale):** If the chain completes, but T1 and T2 show `0` inserts/updates across all steps, the completion summary will flag a Warning: *Chain Executed, but Source Data Was Stale (0 rows impacted).*
- **Failure:** If any pipeline script crashes OR the PostgreSQL pg_stat returns significantly anomalous deletions or schema violations against the expected data load.
