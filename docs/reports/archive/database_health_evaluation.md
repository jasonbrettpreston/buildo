# Database Health Infrastructure: Current Evaluation & Recommendations

This report evaluates the current database health infrastructure against an industry-standard Data Quality Rubric. It analyzes the existing Continuous Query Assertions (CQA) scripts (`assert-schema.js` and `assert-data-bounds.js`) to score our pipeline resilience and identify gaps.

---

## 1. Evaluation Rubric & Current State Analysis

| Rubric Pillar | Goal | Current Implementation | Score |
| :--- | :--- | :--- | :--- |
| **1. Upstream Schema Drift Defense** | Prevent broken structures (changed column names, dropped CSV headers) from crashing the pipeline mid-run. | **Excellent.** `assert-schema.js` acts as an incredibly robust Tier 1 gate. It pings the CKAN API for metadata and CSV headers, explicitly blocking execution if upstream data structures drift. | ⭐️⭐️⭐️⭐️⭐️ (5/5) |
| **2. Post-Ingestion Bounds & Sparsity** | Detect logical anomalies, impossible states, or sudden drops in data completeness (null rates). | **Strong.** `assert-data-bounds.js` tracks 24-hour null-rate thresholds for critical fields (e.g., Description, Builder Name) and detects numerical outliers (e.g., construction costs > $500M). | ⭐️⭐️⭐️⭐️ (4/5) |
| **3. Referential & Structural Integrity** | Ensure linked entities exist (no orphans) and primary keys remain unique. | **Strong.** Explicit SQL queries hunt for orphaned records across `permit_trades`, `permit_parcels`, and `coa_applications`. Identifies duplicate PKs. | ⭐️⭐️⭐️⭐️ (4/5) |
| **4. Engine Health & Volume Volatility** | Monitor how the database engine handles the payload (Dead tuples, index usage, Update ping-pong spikes). | **Weak. (The "488 Bug" Gap).** While bounds checks exist, there is no engine-level metric tracking. The pipeline did not detect that it was updating exactly 488 rows in a continuous ping-pong loop, nor does it monitor `n_dead_tup` table bloat resulting from excessive updates. | ⭐️⭐️ (2/5) |
| **5. Subsurface Transparency (Visibility)** | How easily can engineers verify if the database matches the application's reported success? | **Improving.** Historically, these states were hidden inside infrastructure logs. The upcoming Option C DB Transparency plan aims to expose these exact SQL-layer truths directly to the UI. | ⭐️⭐️⭐️ (3/5) |

---

## 2. Findings & Gaps

Your current CQA scripts (`assert-schema.js` and `assert-data-bounds.js`) represent a highly mature, defensively-engineered data pipeline. Many teams fail entirely at Pillar 1 (Upstream Defense), reacting only when pipelines crash. Your architecture preempts crashes.

**The Major Gap (Pillar 4):**
The infrastructure currently verifies that the *data* is legally shaped and structurally sound, but it fails to evaluate the *transactional behavior* of the script against the database. 
As proven by the 488-update bug, you can have perfectly valid schema boundaries and no orphaned rows, but still have a destructive script churning thousands of unnecessary `ON CONFLICT DO UPDATE` operations every night.

---

## 3. Recommended Approach

To achieve a perfect score across all 5 pillars, I recommend the following three-pronged approach:

### Step 1: Fix the Ping-Pong Bug (Immediate)
Before building new transparency tools, we must fix the `load-permits.js` deduplication bug. The script must deduplicate at the global streaming level, not the batch array level, to stop the engine-level churn.

### Step 2: Implement DB Transparency (Option C UI)
Proceed with integrating the mapped Telemetry Features (T1 & T2) into `FreshnessTimeline.tsx`. T2 requires the pipeline orchestrator to query `pg_stat_user_tables` before and after each chain. This covers the Pillar 4 & 5 gap permanently by exposing Engine Health (Updates vs Inserts) to the administrator on every run.

### Step 3: Expand the Bounds Assertions (Future Hardening)
Extend `assert-data-bounds.js` to include:
1.  **Ghost Record Detection:** `SELECT count(*) FROM permits WHERE last_seen_at < NOW() - INTERVAL '30 days'` (Detect upstream silent drops).
2.  **State Reversion Checks:** (e.g., A permit cannot move from "Closed" back to "Under Review").
3.  **Table Bloat Assertion:** Fail the pipeline if the ratio of dead tuples to live tuples exceeds 25%.
