# Pipeline Scripts Evaluation Report

## Executive Summary
A comprehensive audit of the pipeline scripts within the `scripts/` and `scripts/quality/` directories was conducted to evaluate data integrity, memory stability, database performance, spatial logic, telemetry accuracy, and temporal state machines. 

The audit confirms the presence of several critical anti-patterns, such as `OFFSET`-based pagination traps, runaway memory allocations via `pool.query`, and spatial logic failures stemming from static bounding boxes or string-coerced geometries. This report outlines the specific problem areas, lists the affected files across the ecosystem, and defines the structural refactors necessary to harden the runtime.

---

## 1. Pagination, Cursors & State Loops (The WHERE Clauses)
> [!WARNING]
> **The Problem:** Incremental processing relies on mutating data (`NOT EXISTS` or `IS NULL`). If a script fails to properly mutate the state, or if the pagination cursor ignores the mutation, scripts will either silently skip data or spin into infinite execution loops.

### Identified Vulnerabilities
*   **The `OFFSET` Mutation Trap:** Using `OFFSET` skips rows when unlinked records are evaluated but ignored, missing 50% of targets.
    *   **Highly Affected:** `link-parcels.js`, `link-coa.js`.
    *   **Widespread Impact:** Also flagged in `extract-builders.js`, `link-massing.js`, `load-coa.js`, `load-permits.js`, `load-wsib.js`, and `reclassify-all.js`.
    *   **Fix:** Migrate to Keyset Cursors (`WHERE id > $lastId`).
*   **Perpetual "No Match" & State-Mutation Loops:** `while(true)` loops parsing records will infinitely retry the exact same batch if a foreign key drops or state remains unchanged.
    *   **Highly Affected:** `link-parcels.js` and `link-neighbourhoods.js`.
    *   **Widespread Impact:** Observed broadly across `classify-permits.js`, `classify-scope.js`, `compute-centroids.js`, `harvest-tests.mjs`, `load-massing.js`, and `assert-schema.js`.
    *   **Fix:** Insert `-1` tombstone records so items drop out of the queue. Break loops upon `rowCount === 0`.
*   **Cross-Ward & Demolition Tag Ping-Pong:** Continuous array updates run in circles daily.
    *   **Highly Affected:** `link-coa.js` (Cross-ward ping-pong; must explicitly ignore Tier 1c cross-ward links), and `link-similar.js` / `classify-scope.js` (Tag ping-pong; `ARRAY_APPEND` must be inside the main `UPDATE`).

---

## 2. Node.js Memory & Orchestration (The Runtime Engine)
> [!CAUTION]
> **The Problem:** Handling massive datasets in V8 JavaScript requires strict stream and memory management. Standard driver configurations will crash the process or silently corrupt data streams.

### Identified Vulnerabilities
*   **V8 OOM Crash via Buffer Overflows:** Fetching 500,000+ GeoJSON footprints direct to memory via `pool.query`.
    *   **Highly Affected:** `link-massing.js`.
    *   **Widespread Impact:** Identified large dataset queries in `compute-centroids.js`, `enrich-wsib.js`, `load-massing.js`, `load-parcels.js`, and `assert-data-bounds.js`.
    *   **Fix:** Convert to readable streams using `pg-query-stream`.
*   **Stream Fragmentation & Zombie Processes:** The orchestrator drops partial chunks and leaves hanging DB connections.
    *   **Highly Affected:** `run-chain.js` (Tearing JSON telemetry payloads due to stdout fragmentation, and failing to actively poll `SIGTERM` for zombies).
*   **Unhandled `JSON.parse` Exceptions:** Malformed strings crash the batch.
    *   **Highly Affected:** `link-neighbourhoods.js`.
    *   **Widespread Impact:** Widespread direct usage of `JSON.parse` detected in `load-address-points.js`, `load-parcels.js`, `load-permits.js`, `task-init.mjs`, and `assert-schema.js`.
    *   **Fix:** Wrap deserialization in `try/catch` and gracefully track bad rows.
*   **Orphaned Connection Pools:** Fatal errors trigger `process.exit(1)` without calling `pool.end()`.
    *   **Highly Affected:** `run-chain.js`.

---

## 3. Database Performance & Query Planner (The SQL Joins)
> [!IMPORTANT]
> **The Problem:** Forcing PostgreSQL to dynamically compute strings, evaluate un-indexed functions, or run row-by-row subqueries forces sequential scans, throttling CPU to 100%.

### Identified Vulnerabilities
*   **Pool Starvation & Torn Snapshots:** Firing heavy aggregation queries in parallel exhausts the pool and disrupts ACID consistency.
    *   **Highly Affected:** `refresh-snapshot.js` (Uses `Promise.all` across 18 heavy aggregates).
    *   **Fix:** Run sequentially within a single `REPEATABLE READ` transaction.
*   **Substring Join CPU Meltdowns & FTS Overflows:**
    *   **Fuzzy Memory Bomb:** `link-wsib.js` skips applying `SET pg_trgm.similarity_threshold = 0.6`, resulting in a Cartesian nightmare.
    *   **Dynamic FTS:** `link-coa.js` dynamically builds `tsvector` in the `WHERE` clause, explicitly bypassing GIN indices.
    *   **Substring Joins:** `link-similar.js` (along with `classify-scope.js`, `create-pre-permits.js`, and `seed-parcels.js`) joins on regex substring evaluation (`SUBSTRING(permit_num)`), forcing global sequential scans. Requires functional indices.
*   **Correlated Subquery Tax:** 
    *   **Highly Affected:** `classify-inspection-status.js` evaluates aggregates row-by-row in the `WHERE`. Must push up into a `CTE` joined via `LEFT JOIN`.

---

## 4. GIS & Spatial Logic (The Turf.js / PostGIS Blocks)
> [!CAUTION]
> **The Problem:** Processing spatial operations inside JS (Turf.js) or utilizing strict heuristic PostGIS filters introduces geometric edge cases (holes, multi-polygons) natively resulting in false negatives.

### Identified Vulnerabilities
*   **PostGIS Data Type Failures:** Turf.js fails to interpret unreadable hex strings from EWKB.
    *   **Highly Affected:** `link-parcels.js` (Hardcoded multi-polygon erasure destroys up to 90% of massive properties from evaluation arrays, and spatial bounding issues fail).
    *   **Fix:** Query geometries natively as `ST_AsGeoJSON(geometry)::json`. Evaluated files show a strong need for migration.
*   **Spatial Blinding (BBOX & Nearest Centroids):** 
    *   **Massing Filter:** `link-massing.js` utilizes a static 333m structural bounding box, blinding edge buildings on large plots. (BBOX logic `&&` is identified extensively across almost all load, link, and quality scripts).
    *   **Centroid Test:** `link-parcels.js` assumes the nearest centroid is correct, abandoning enclosing polygons.
*   **Doughnut Hole Traps:** Ray-casting blindly matches courtyard voids.
    *   **Fix:** `link-parcels.js` must map exterior rings as `true` and interior hole rings as `false`.

---

## 5. Telemetry & Observability (The Payload Emitters)
> [!NOTE]
> **The Problem:** Inaccurate observability variables and Postgres `UPSERT` behavioral quirks result in poisoned internal telemetry dashboards.

### Identified Vulnerabilities
*   **The `rowCount` Trap:** PostgreSQL returns `2` for every row successfully updated in an `UPSERT` conflict.
    *   **Highly Affected:** `link-massing.js` and `link-parcels.js`.
    *   **Widespread Impact:** `rowCount` directly relies on metrics in `classify-inspection-status.js`, `close-stale-permits.js`, `create-pre-permits.js`, `link-coa.js`, `link-wsib.js`, and `assert-engine-health.js`, causing artificial 2x spikes in telemetry logic.
*   **Telemetry Forgery & Dry-Run Phantoms:**
    *   `run-chain.js` takes partial tail boundaries of crashed scripts rather than compiling JSON arrays.
    *   `link-wsib.js` & `link-coa.js` execute dry-runs without state mutations, resulting in recursive CTE re-matching duplicates down the pipeline.
*   **Schema Violations & Fake Links:** 
    *   `classify-inspection-status.js`: Emitting keys as variable data values un-schemas TSDB ingestion (`{"Stalled": 5}`).
    *   `link-neighbourhoods.js`: Cumulative metrics measure `-1` (tombstone) writes as active `linkRate`, artificially boosting dashboard success graphs.

---

## 6. Temporal Logic & State Machines (The Timestamps)
> [!WARNING]
> **The Problem:** Desynchronized pipeline metadata and timezone casting drifts permanently pollute data caching protocols.

### Identified Vulnerabilities
*   **The Scraper Verification Paradox:** `MAX(scraped_at)` dynamically resets, preventing records from ever stalling.
    *   **Highly Affected:** `classify-inspection-status.js`.
*   **Historical Overrides (`COALESCE` vs `GREATEST`):** 
    *   `classify-inspection-status.js` relies strictly on `COALESCE`, allowing a 2026 permit revision to inherit a historical 2023 stall. Must convert to `GREATEST`.
*   **Cross-Revision Bleed:** 
    *   `link-similar.js` forces base tags on companion permits without filtering `revision_num`, overwriting active logic.
*   **Silent State Mutations:** 
    *   `classify-inspection-status.js` updates enriched state statuses but drops atomic `last_seen_at` updates, entirely destroying downstream ELT CDC.
*   **Timezone Casting Asymmetry:** 
    *   `classify-inspection-status.js` explicitly casts between localized `America/Toronto` dates against raw UTC stamps, yielding predictable 4 to 5-hour daily execution windows where the database constantly flags state flaps.
