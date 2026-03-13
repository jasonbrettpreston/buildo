# Database Health & Data Integrity Testing Strategy

When building data pipelines that ingest external data (like CKAN open data), the application layer's reporting can often mask underlying issues—as seen with the 488 ghost updates. To ensure the database is truly healthy and records are updating correctly, we must implement tests that evaluate the data directly at the PostgreSQL level.

Here is a comprehensive breakdown of the types of tests we can run directly on the database to assess its engine health and data integrity.

---

## 1. Data Quality & Anomaly Tests (The "Reality Checks")

These tests look for impossible states, anomalies, or regressions in the actual ingested data.

*   **Duplicate Detection (Uniqueness Assertions):**
    *   *What it tests:* Ensures our deduplication logic works.
    *   *SQL Example:* `SELECT permit_num, revision_num, COUNT(*) FROM permits GROUP BY permit_num, revision_num HAVING COUNT(*) > 1;`
    *   *Assessment:* Must always return 0 rows. A return > 0 indicates pipeline deduplication failures.
*   **Orphaned Record Checks (Referential Integrity):**
    *   *What it tests:* Ensures linked tables (e.g., permits linked to builders/parcels) don't reference non-existent entities.
    *   *SQL Example:* `SELECT count(*) FROM permits p LEFT JOIN parcels pt ON p.geo_id = pt.id WHERE pt.id IS NULL AND p.geo_id IS NOT NULL;`
    *   *Assessment:* A high or growing number implies the linked pipeline (parcels) is failing to ingest parents, or the source data is driftings.
*   **Impossible State Transitions:**
    *   *What it tests:* Tracks logical flows, e.g., a permit shouldn't go from "Closed" back to "Under Review".
    *   *Assessment:* Requires temporal querying (comparing `updated_at` states) or audit tables.
*   **Fill Rate / Sparsity Checks:**
    *   *What it tests:* Ensures critical columns aren't suddenly being dropped by the upstream API.
    *   *SQL Example:* `SELECT count(*) FROM permits WHERE status IS NULL;`
    *   *Assessment:* If the NULL rate for `status` jumps from 0.1% to 15% overnight, an ingestion alert should fire.

## 2. Freshness & Staleness Tests (Pipeline Efficacy)

These tests ensure the pipeline is actually updating records, not just spinning its wheels.

*   **Global Freshness Thresholds:**
    *   *What it tests:* Ensures the pipeline ran recently and successfully committed data.
    *   *SQL Example:* `SELECT MAX(last_seen_at) FROM permits;`
    *   *Assessment:* If the `MAX(last_seen_at)` is older than 48 hours for a daily pipeline, the pipeline is failing (even if the app says "Success").
*   **Staleness Distribution (The "Ghost Record" Check):**
    *   *What it tests:* Identifies records that the city API dropped silently (e.g., deleted permits).
    *   *SQL Example:* `SELECT count(*) FROM permits WHERE last_seen_at < NOW() - INTERVAL '30 days';`
    *   *Assessment:* If a record hasn't been "seen" by the ingest script in 30 days, we must assess if it was deleted upstream and needs an archival flag.
*   **Hash Collision / Volatility Checks (The "488 Bug" Detector):**
    *   *What it tests:* Detects records that update too frequently.
    *   *SQL Example:* Looking at an audit table or `xmax` transaction frequencies to find rows updating every single run.
    *   *Assessment:* If the same 500 rows update every 24 hours while the rest remain static, there is a hashing or data-type coercion bug causing false positives.

## 3. Schema & Structural Integrity Tests

These tests ensure the database schema matches the application's contract.

*   **Constraint Violations (The Safety Net):**
    *   *What it tests:* Verifies that `NOT NULL`, `UNIQUE`, and `CHECK` constraints are active and not being bypassed or dropped.
    *   *Assessment:* Can be tested by deliberately attempting to insert bad data via unit tests (e.g., `INSERT INTO permits (permit_num) VALUES (NULL)` must throw a DB-level error).
*   **Data Type & Length Mismatches:**
    *   *What it tests:* Catches silent truncation. If CKAN changes a 50-char field to 100-chars, PostgreSQL might truncate or throw errors depending on the column definition (`VARCHAR(50)` vs `TEXT`).
    *   *Assessment:* Querying `information_schema.columns` to ensure our column types remain appropriate for the observed data max-lengths.

## 4. PostgreSQL Engine Health (Performance & System Tests)

These gauge how well the database engine itself is performing under the load of our pipelines.

*   **Table Bloat (Dead Tuples):**
    *   *What it tests:* When pipelines update thousands of records (like the 488 ping-pong), PostgreSQL creates "dead tuples" before vacuuming them. Excessive updates cause table bloat, slowing down all queries.
    *   *SQL Example:* `SELECT n_dead_tup, n_live_tup FROM pg_stat_user_tables WHERE relname = 'permits';`
    *   *Assessment:* If `n_dead_tup` is massive compared to `n_live_tup`, the autovacuum daemon isn't keeping up with pipeline `UPSERT` volume.
*   **Index Usage & Hit Rates:**
    *   *What it tests:* Ensures our queries (like the deduplication or geo-spatial joins) are actually using indexes.
    *   *SQL Example:* `SELECT idx_scan, seq_scan FROM pg_stat_user_tables WHERE relname = 'permits';`
    *   *Assessment:* A high `seq_scan` count on massive tables indicates missing indexes or poorly written pipeline upserts.
*   **Connection Pooling & Locks:**
    *   *What it tests:* Ensures pipelines aren't holding open idle transactions or deadlocking.
    *   *SQL Example:* `SELECT state, count(*) FROM pg_stat_activity GROUP BY state;`
    *   *Assessment:* Finding long-running queries in `idle in transaction` indicates an orchestrator script crashed without closing its DB connection.

---

## How Do We Assess and Implement This?

To implement these systematically without relying on the Node.js application layer:

1.  **Continuous Query Assertions (CQA):**
    Run a separate "Data Quality" pipeline step immediately after ingestion. This step runs pure SQL queries (like the Duplicate and Null checks above). If any query returns rows, the CQA script throws an error, flagging the pipeline run as a "Data Quality Failure".
2.  **pgTAP (Automated DB Unit Testing):**
    Utilize `pgTAP`, a suite of database functions that allow you to write unit tests *inside* PostgreSQL using SQL. You can write tests like `SELECT has_unique('permits');` and run them via a CI/CD pipeline or a nightly cron job.
3.  **The "Raw DB Transparency" Dashboard (Option C):**
    This aligns perfectly with our recent DB Transparency plan. By rendering `pg_stat` (Engine Health) and `count()` aggregates directly on the dashboard, we shift from assuming the app worked to mathematically proving the database received the exact expected payload securely.
