# Enterprise Data Quality Dashboard Enhancement
This document outlines the UX evaluation, requirements, and formal implementation plan to upgrade the Data Quality Dashboard (`/admin/data-quality`) to an Enterprise Data Command Center.

## I. Overarching Goals
The fundamental purpose of the Data Quality view is to shift the admin experience from *reactive* debugging to *proactive* system health monitoring. 

A best-in-class data quality dashboard must instantly answer three questions for the administrator:
1. **Is the data flowing?** (Volume, Latency, Schedules)
2. **Is the data chemically accurate?** (Schema integrity, Out-of-bounds metrics, Deep field completeness)
3. **Is the data linking successfully?** (Entity resolution rates for Parcels, CoA, Builders, Neighbourhoods)

If any pipeline fails or if data quality drops abruptly, the dashboard must immediately surface **actionable evidence** (explicit logs and unmatched counts) rather than failing silently or obscuring the root cause behind an aggregated percentage.

---

## II. Current UI Evaluation (The 9 Operational Questions)
Based on an audit of `DataQualityDashboard.tsx`, `DataSourceCircle.tsx`, and `FreshnessTimeline.tsx`:

1. **Did it update?** (Yes, timestamps show clearly in the circles and timeline).
2. **How successfully?** (Partial. It shows total linkage percentages, but hides the count of *failed* matches, and completely hides the error logs when a pipeline crashes).
3. **When will it update next?** (Yes, based on a hardcoded frontend estimation).
4. **Are we getting better?** (Yes. The 30-day `trendDelta` micro-arrows are fantastic UX).
5. **Did all the pipeline run?** (Yes, the connected `FreshnessTimeline` accurately visualizes the 3 chains).
6. **Can they do this using a schedule?** (No. The UI shows the schedule, but the user cannot edit or pause it).
7. **Are we updating efficiently?** (No. There is no visibility into how many seconds/minutes a pipeline took to run).
8. **Easier to understand?** (Yes, listing the exact `fields` and top tags makes the circles very readable).
9. **Improvements?** (See Sections III and IV below).

---

## III. Best-in-Class Enterprise Additions
To elevate this dashboard to a "Command Center," we must move beyond basic "cron job successes" and track the chemical makeup of the data itself.

### A. Anomaly Detection & Volume Drops
* **What it tracks:** If you normally ingest 250 building permits a day, and today you ingested 2, the pipeline technically "Succeeded" but the data is completely wrong. 
* **UI Implementation:** A "Volume Anomaly" sparkline or badge next to each data source. If the ingested row count drops by more than 2 standard deviations from the 30-day moving average, turn the circle Orange and flag an anomaly.

### B. Schema Drift Monitoring
* **What it tracks:** Upstream providers frequently change column names or drop fields without warning.
* **UI Implementation:** A "Schema Health" badge. If a scraper job expects 42 columns and only finds 41, the pipeline shouldn't just crash silently or insert nulls—the dashboard should explicitly surface "Warning: Upstream Schema Drift Detected".

### C. Latency vs. SLA Tracking
* **What it tracks:** "When it ran last" is good, but "Are we breaking our promise to the user?" is better. If your SLA is that users see new permits within 24 hours of municipal publication, you need to track latency.
* **UI Implementation:** Calculate the delta between `upstream_publication_date` and `system_ingestion_date`. If it exceeds 24 hours, flag it as an SLA breach directly on the timeline.

### D. Deep Completeness & Null Tracking
* **What it tracks:** You are tracking *Linking* success (e.g., 85% mapped to a parcel), but what about internal data completeness? 
* **UI Implementation:** Inside the "Building Permits" hero circle, track critical field null-rates: `% Missing Values`, `% Missing Descriptions`, `% Missing Addresses`. 

### E. Out-of-Bounds & Garbage Data Rules
* **What it tracks:** Validating that data isn't just present, but chemically accurate. 
* **UI Implementation:** Configure strict bounds (e.g., `construction_value > $100` and `< $1,000,000,000`). If a permit comes in with a $1 value (often a municipal placeholder), the dashboard flags it as a "Data Quality Violation".

---

## IV. Formal Implementation Plan

**Objective:** Upgrade the dashboard integrating the UX improvements and Best-in-Class tracking, while explicitly retaining the current "Hub and Spoke" layout and SVG connector lines.

### 1. Database Layer
* **`pipeline_runs` Table Enhancement:** Add a dedicated tracking table (or modify the existing `sync_logs`) to capture:
  * `slug` (The data source/pipeline).
  * `status`, `started_at`.
  * `duration_ms` (To answer the "Efficiency" requirement).
  * `error_log` (Full stack traces for frontend surfacing).
  * `records_processed`, `records_failed_linkage`.
* **Garbage Data Tracking:** Build explicit rule-violation logging tables (e.g., `permit_quality_violations`) to capture schema drift and out-of-bounds errors on ingestion.

### 2. API Layer
* **`GET /api/admin/pipelines/runs`:** Expose endpoints to fetch paginated error logs and execution durations for the pipelines to feed the `FreshnessTimeline`.
* **`PUT /api/admin/pipelines/schedules`:** Expose endpoints for the UI to update the `PIPELINE_SCHEDULES` (moving schedule configuration from the front-end to standard server config/DB).
* **`metrics.ts` Upgrade:** Enhance snapshot capture to explicitly calculate:
  * **Volume Anomalies** (Today vs 30-day average).
  * **SLA Latency** (`avg(publication_date - ingestion_date)`).
  * **Deep Completeness** (Null-rates for critical fields).

### 3. UI Components
* **`DataQualityDashboard.tsx`:** 
  * Add a high-level **"System Health" Traffic Light banner** at the very top (Green/Yellow/Red) aggregating pipeline state and anomaly detection instantly.
  * Retain the SVG connector lines and Hub/Spoke grid structure.
  * Convert the text "Daily/Quarterly" into **clickable modals** that let the admin alter the cron schedules (satisfying the "Can they do this using a schedule?" goal interactively).
* **`DataSourceCircle.tsx`:**
  * **Explicit Failure Rows:** Add an explicit `"Unmatched"` count alongside the existing matching tiers so admins know exactly how many records failed to link.
  * **Anomaly & SLA Badging:** If `metrics.ts` returns a volume anomaly or an SLA breach, overlay a warning triangle directly on the circle.
  * **Deep Completeness:** Expand the Hero circle to show `% Missing Descriptions` and `% Missing Addresses`.
* **`FreshnessTimeline.tsx`:**
  * **Efficiency Metrics:** Append the `duration_ms` (e.g., "Ran in 42s") next to the runtime timestamp.
  * **Actionable Error Logs:** When a pipeline step fails (Red), make the badge clickable to pop open a detailed Error Modal displaying the precise `error_log` from the database.
