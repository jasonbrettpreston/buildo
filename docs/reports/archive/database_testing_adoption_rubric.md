# Database Health Data Integrity: Testing Adoption Rubric (V2 - Updated)

This report evaluates our current codebase (specifically `scripts/quality/assert-data-bounds.js`, `assert-schema.js`, and the newly adopted `assert-engine-health.js`) against the recommended database engine health and data integrity testing strategy.

## 1. Data Quality & Anomaly Tests (Reality Checks)

These tests look for impossible states or regressions in the actual ingested data.

*   **Duplicate Detection**
    *   **Recommendation:** Writing SQL assertions to hunt for rows with matching unique keys.
    *   **Status: ADOPTED.**
    *   **Implementation:** In `assert-data-bounds.js`, we actively check for duplicate `permit_num` + `revision_num` groups, duplicate `address_point_id`, duplicate `parcel_id`, and duplicate `neighbourhood_id` across all respective pipeline branches.

*   **Orphaned Record Checks**
    *   **Recommendation:** Ensuring linked tables don't reference non-existent entities using LEFT JOIN checks.
    *   **Status: ADOPTED.**
    *   **Implementation:** In `assert-data-bounds.js`, we run `LEFT JOIN` checks to ensure there are zero orphaned `permit_trades`, zero orphaned `permit_parcels`, zero orphaned `linked_permit_num` in CoA applications, and zero orphaned `wsib_registry` entity links.

*   **Fill Rate checks**
    *   **Recommendation:** Calculating the percentage of NULL values in critical columns to detect upstream API regressions.
    *   **Status: ADOPTED.**
    *   **Implementation:** In `assert-data-bounds.js`, we track the last 24-hours of permits and assert that the `description` NULL rate is below 5%, the `builder_name` NULL rate is below 20%, and the `status` NULL rate is absolutely 0. We also catch things like empty legal names in the `wsib_registry`.

## 2. Freshness & Staleness Tests (Pipeline Efficacy)

Checking if the pipeline is actually updating records, not just running the script.

*   **Global Freshness**
    *   **Recommendation:** Asserting `MAX(last_seen_at)` to ensure the DB received commits within the expected SLAs.
    *   **Status: PARTIALLY ADOPTED.**
    *   **Implementation:** Our `pipeline_runs` table tracks when the pipeline *script* ran, but we don't currently have a CQA gate actively failing the pipeline if the *database table's* `MAX(last_seen_at)` is drastically stale.

*   **Staleness Distribution**
    *   **Recommendation:** Identifying records that the city API dropped silently (ghost records) by locating rows where `last_seen_at` is older than 30 days.
    *   **Status: SELECTED FOR ADOPTION (In Progress).**
    *   **Implementation Plan:** We are adding a SQL check to `assert-data-bounds.js` (`SELECT count(*) FROM permits WHERE last_seen_at < CURRENT_DATE - INTERVAL '30 days'`). However, we have deliberately decided **not** to auto-archive these rows. CQA tiers are for detection/warning only; mutating business data (like `is_archived = true`) violates the separation of concerns and belongs in a dedicated pipeline ingestion step.

## 3. Schema & Structural Integrity Tests

Ensuring the database engine enforces the application contract.

*   **Constraint Violations**
    *   **Recommendation:** Deliberately testing insertion of invalid data to ensure NOT NULL, UNIQUE, and CHECK constraints are properly blocking bad data.
    *   **Status: NOT ADOPTED (Explicit Check) / ADOPTED (Implicit Schema).**
    *   **Implementation:** We enforce rigorous constraints directly inside the `039_schema_hardening.sql` migrations (e.g., `CHECK (est_const_cost >= 0)`). However, we do not formally execute unit tests (e.g. via `pgTAP` or a Jest script) that maliciously attempt to insert bad data to prove the constraints fire correctly.

## 4. PostgreSQL Engine Health Tests

Gauging how well the engine is handling the pipeline load.

*   **Table Bloat & Ping-Pong Checks**
    *   **Recommendation:** Querying `pg_stat_user_tables` to compare `n_dead_tup` vs `n_live_tup` and identifying excessive upserts.
    *   **Status: FULLY ADOPTED.**
    *   **Implementation:** The newly added `assert-engine-health.js` tier mitigates table bloat risks. It actively flags any table exceeding a 10% dead-tuple ratio and specifically flags any table where the cumulative Update volume is > 2x the Insert volume (a dead giveaway of cross-batch ping-pong scripts).

*   **Index Hit Rates**
    *   **Recommendation:** Ensuring your heavy `ON CONFLICT` deduplication queries are actively using `idx_scan` and not falling back to slow `seq_scan`.
    *   **Status: FULLY ADOPTED.**
    *   **Implementation:** `assert-engine-health.js` monitors sequential vs index scans. It actively flags warnings on large tables (>10,000 rows) if sequential scans constitute more than 80% of total scans.

---

## Evaluation of Strategic Recommendations (Active Task)

The core engineering team has reviewed the 3 strategic recommendations for maximizing the CQA trio and has actively adopted them with the following implementation constraints:

### 1. Auto-VACUUM in `assert-engine-health.js` (ACCEPTED)
*   **Assessment:** Highly valuable and low risk. The script already calculates the 10% dead tuple threshold. Adding a non-blocking `VACUUM ANALYZE` execution right after heavy chain ingestion is a natural remediation. 
*   **Implementation:** A dedicated execution block is being added to `scripts/quality/assert-engine-health.js`.

### 2. CQA Warning Display in UI (ACCEPTED)
*   **Assessment:** This is the highest-value UX improvement. Currently, the UI hides behind summary counts (e.g., "PASSED with 6 warnings"). The text data is already captured in the `records_meta` JSON payload.
*   **Implementation:** `FreshnessTimeline.tsx` is being updated to extract and render the specific warning strings natively in the accordion (e.g., rendering "Builder name null rate 95%" directly on screen).

### 3. Catch Ghost Records / Staleness (ACCEPTED WITH MODIFICATION)
*   **Assessment:** Highly valuable metric. The `last_seen_at` temporal data already exists.
*   **Implementation:** The SQL check is being added to `assert-data-bounds.js` to warn if records fall older than 30 days.
*   **Modification (Crucial):** We explicitly rejected the recommendation to *auto-archive* the records dynamically inside the CQA script. CQA scripts are designed to validate and alert, not to execute business-logic mutations that alter dashboard states. Updating `is_archived` will be handled by a dedicated lifecycle step outside the validation loop.
