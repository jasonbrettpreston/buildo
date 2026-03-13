# Data Source Database Structure Evaluation

This report evaluates the core database schema for Buildo's primary data sources (`permits`, `coa_applications`, `parcels`, `builders`) against a "Best in Class" Enterprise Data Engineering rubric.

## Evaluation Rubric

An enterprise-grade analytical database must score highly across 5 dimensions:
1. **Normalization & Types:** Are data types chemically precise (e.g., `DECIMAL(10,7)` for coords vs `VARCHAR`)? Are repeating groups normalized?
2. **Indexing & Query Performance:** Are indexes present for filtering, joining, and sorting? Are full-text indexes (`GIN`) used appropriately?
3. **Change Data Capture (CDC):** How is historical change tracked over time (`created_at`, `updated_at`, hashing)?
4. **Referential Integrity:** Are foreign keys used to strictly enforce linking, or is it loosely coupled?
5. **Observability (Metadata):** Does the schema track *how* and *when* rows were linked or enriched (confidence scores, enrichment timestamps)?

---

## 1. Building Permits (`001_permits.sql`)
**Score: B+**

**Strengths:**
* **Excellent CDC Foundation:** Uses `(permit_num, revision_num)` as a composite primary key, inherently supporting versioning rather than destructively overwriting data.
* **Precise Types:** Correctly uses `DECIMAL(10,7)` for lat/long and `DECIMAL(15,2)` for construction costs.
* **Full-Text Search:** Implements PostgreSQL `GIN` index on `description`, enabling fast semantic matching.
* **Hash Tracking:** Includes `data_hash` to detect when a seemingly identical row has actually mutated at the source.

**Gaps to "Best in Class":**
* **Lack of Normalization for Scope:** Fields like `dwelling_units_created`, `housing_units`, and `storeys` are flat columns. Standard enterprise architecture extracts these varying properties into a flexible key-value `permit_attributes` or `JSONB` structure, preventing column-bloat if the city starts tracking "bicycles parking spaces."
* **Missing Index for Geocoding Nulls:** The `geocoded_at` field lacks a partial index (e.g., `WHERE geocoded_at IS NULL`), meaning the geocoding worker must full-table scan to find unmapped permits.

---

## 2. Committee of Adjustment (`009_coa_applications.sql`)
**Score: B-**

**Strengths:**
* **Linking Metadata:** Includes `linked_permit_num` and, crucially, `linked_confidence (3,2)`, allowing downstream algorithms to filter out fuzzy/low-confidence matches.
* **Timestamps:** Standard `first_seen_at` and `last_seen_at` patterns.

**Gaps to "Best in Class":**
* **Loose Referential Integrity:** `linked_permit_num` is just a `VARCHAR`. There is no `FOREIGN KEY References permits(permit_num)` constraint. It is possible to link a CoA to a permit that has been deleted or does not exist, creating orphaned links.
* **Redundant Address Fields:** `address`, `street_num`, and `street_name` are all separate fields but are usually derived from one another. Depending on the ingestion script, this can lead to sync anomalies if `address` ="123 Main St" but `street_name` = "King St".

---

## 3. Property Boundaries / Parcels (`011_parcels.sql`)
**Score: A-**

**Strengths:**
* **PostGIS Native:** Uses `JSONB` for `geometry` (though `GEOMETRY` via PostGIS extension would be the true gold standard).
* **Metric Conversion Support:** Hardcodes both `_sqm` and `_sqft` equivalents, preventing runtime computational overhead across the dashboard.
* **Normalized Street Matching:** Extracts `addr_num_normalized` and `street_name_normalized` with dedicated indexes to support the spatial join fallback linking algorithms.

**Gaps to "Best in Class":**
* **Missing Geospatial Index:** Because `geometry` is stored as `JSONB`, spatial queries (e.g., "Find all permits inside this parcel polygon") cannot use standard `GiST` spatial indexing. This is a massive scalability bottleneck.

---

## 4. Builder Directory (`007_builders.sql`)
**Score: A**

**Strengths:**
* **Denormalized Counters:** `permit_count` is stored directly on the builder row, allowing instantaneous "Top Builders" sorting without expensive `GROUP BY` aggregates on the permits table.
* **Enrichment Tracking:** Tracks `enriched_at` independently of `last_seen_at`, separating system update timestamps from third-party (Google Places/WSIB) scrape timestamps.
* **Strict Normalization Indexing:** Enforces `UNIQUE (name_normalized)` at the database level to physically prevent duplicate profiles.

**Gaps to "Best in Class":**
* **String Overloading:** `wsib_status` is a `VARCHAR(50)`. In enterprise systems, constrained state variables should use `ENUM` types or reference lookup tables to prevent data pollution (e.g., preventing a script from inserting "Not_Applicable" instead of "Exempt").

## 5. 3D Massing (`024_parcel_buildings.sql`)
**Score: B+**

**Strengths:**
* **Junction Normalization:** Correctly uses a distinct many-to-many junction table (`parcel_buildings`) to link parcels (lots) to building footprints, accommodating lots with multiple structures (e.g., house + laneway suite).
* **Metadata Tracking:** Includes `is_primary` and `structure_type` flags directly on the junction, letting downstream apps easily identify the main dwelling vs. accessory structures.
* **Integrity Guardrails:** Enforces `UNIQUE (parcel_id, building_id)` preventing duplicate linking rows.

**Gaps to "Best in Class":**
* **Lack of Unlinking Mechanics:** The table has a `linked_at` timestamp but lacks an `unlinked_at` or `is_active` boolean. If a new spatial scan reveals a building was demolished, deleting the row destroys historical audit logs. Enterprise CDC prefers soft-deletes.

---

## 6. Neighbourhoods (`013_neighbourhoods.sql`)
**Score: A-**

**Strengths:**
* **Analytical Column Expansion:** Provides a vast array of pre-calculated, flattened analytics (`avg_household_income`, `university_degree_pct`) stored as `DECIMAL(5,2)`. This makes demographic dashboard queries virtually instantaneous compared to joining out to raw census dimension tables.
* **Census Versioning:** Includes `census_year DEFAULT 2021`, future-proofing the table for when new census blocks drop.

**Gaps to "Best in Class":**
* **Spatial Disconnect:** Stores boundaries as `geometry JSONB` rather than PostGIS `GEOMETRY`. This prevents fast, native point-in-polygon queries (e.g., checking which neighbourhood a geocoded permit falls into) inside the database.

---

## 7. Scope Classification (`019_permit_scope.sql`)
**Score: A**

**Strengths:**
* **Native Array Support:** Leverages PostgreSQL's native `TEXT[]` array for `scope_tags`. This is a massive enterprise feature that avoids the painful anti-pattern of a massive junction table (`permit_scope_tags`) just to store simple architectural flags like `['HVAC', 'Plumbing']`.
* **GIN Indexing:** Immediately pairs the array with a `GIN (scope_tags)` index, making array-containment queries (e.g., "Find all permits containing 'Laneway Suite'") lightning fast.
* **Zero-Fill Indexing:** Uses `WHERE scope_tags IS NOT NULL` on the index, ensuring the index size remains minimal and only tracks classified permits.

**Gaps to "Best in Class":**
* **In-Place Mutation:** The migration uses `ALTER TABLE permits ADD COLUMN`. While efficient, if the scope classification rules engine is re-run, it overwrites the previous results. A true enterprise system often moves AI-derived tags to a separate `permit_derived_scope` log table to track *how* and *why* the classification changed over time.

---

## 8. Permit Trades (`006_permit_trades.sql`)
**Score: A-**

**Strengths:**
* **Rich Metadata:** Doesn't just link a trade; it records `confidence`, `phase`, and `lead_score`. This transforms it from a dumb junction table into a prioritized sales lead engine.
* **Soft Deletes:** Uses `is_active BOOLEAN DEFAULT true`. When a trade is re-classified as irrelevant, it is soft-deleted, preserving the history of the AI's mistakes for model tuning.
* **Targeted Indexing:** Includes explicit indexes on `is_active` and `lead_score DESC` to instantly power the core UI views.

**Gaps to "Best in Class":**
* **Missing FK on Permit PK:** Links to permits using `(permit_num, revision_num)`. However, there is no explicit `FOREIGN KEY (permit_num, revision_num) REFERENCES permits (permit_num, revision_num)` constraint in this file. This allows the AI classifier to insert a trade for a permit that does not exist or was rolled back.

---

## 9. Master Recommendations for Enterprise Upgrade

To bring the data warehouse to a true "Best in Class" state, the following explicit DDL migrations should be executed:

1. **Activate PostGIS:** Install the PostgreSQL `POSTGIS` extension. Alter `parcels.geometry` from `JSONB` to `GEOMETRY(Polygon, 4326)`. Create a `GiST` index on this column. This will make address-to-parcel matching exponentially faster.
2. **Enforce Foreign Keys:** Alter `coa_applications`, `permit_trades`, and `permit_parcels` to include strict `FOREIGN KEY` constraints referencing the composite primary key of the `permits` table.
3. **Partial Indexes for Workers:** Create partial indexes targeted specifically at the pipeline workers:
   * `CREATE INDEX idx_permits_needs_geocode ON permits(id) WHERE geocoded_at IS NULL;`
   * `CREATE INDEX idx_builders_needs_enrich ON builders(id) WHERE enriched_at < NOW() - INTERVAL '30 days';`
4. **Enum Safety:** Convert `status` columns (`permits.status`, `coa.status`, `builders.wsib_status`) into strictly defined PostgreSQL `ENUM` types.

---

## 10. Continuous Quality Assurance Strategy

To ensure the database structure and underlying data quality remain "Best in Class" over time, it is not enough to rely on static table definitions. Enterprise systems deploy **Continuous Quality Assurance (CQA)** scripts directly into the ETL/ELT pipelines.

We recommend implementing a three-tiered automated testing strategy using tools like [Great Expectations](https://greatexpectations.io/) or custom Jest/Node scripts that run as mandatory steps in the pipeline orchestrator (`scripts/run-chain.js`).

### Tier 1: Schema & Drift Validation (Pre-Ingestion)
Before a staging table is merged into a production table, the pipeline must run a schema assertion script (`scripts/quality/assert-schema.ts`):
*   **Column Validation:** Ensure the upstream CKAN or GeoJSON file still contains the exact column names expected (e.g., `EST_CONST_COST`). Alert if columns are dropped or renamed.
*   **Type Coercion Checks:** Assert that fields expected to be numeric (like lot size) are not suddenly arriving as strings containing letters (e.g., "150 sqft" instead of "150").

### Tier 2: Chemical Data Quality Testing (Post-Ingestion)
After data is loaded into the tables, but before the dashboards update, a runtime script (`scripts/quality/assert-data-bounds.ts`) should execute SQL queries asserting business logic rules:
*   **Bounds Testing:** `SELECT COUNT(*) FROM permits WHERE est_const_cost < 100 OR est_const_cost > 500000000`. Any count > 0 triggers a Data Quality Alert to review those specific outliers.
*   **Null-Rate Thresholds:** If the percentage of `description IS NULL` exceeds 5% on today's ingested batch, the pipeline flags a "Completeness Warning".
*   **Referential Audits:** Assert that `SELECT COUNT(*) FROM permit_trades pt LEFT JOIN permits p ON pt.permit_num = p.permit_num WHERE p.id IS NULL` is always exactly 0 (ensuring no orphaned junction data).

### Tier 3: CI/CD Migration Linting (Pre-Deployment)
To ensure future developers don't degrade the database structure (e.g., by adding JSONB geometry or missing foreign keys again):
*   **SQL Linting:** Add `sqlfluff` to the GitHub Actions pipeline. Require developers to pass linting rules (enforcing normalization and index creation) before a PR containing a new `.sql` migration file can be merged.
*   **Test-Db Instantiation:** The CI pipeline must spin up a blank PostgreSQL container, run all 38+ migrations in order, and assert the schema builds successfully before allowing code merges.

---

## 11. Appendix: Evaluating Local vs Cloud Pipeline Scheduling

When attempting to automate the Data Quality pipelines locally, you noted that "cloud scheduler" is not working. Based on an audit of `docs/specs/04_sync_scheduler.md` and `functions/src/index.ts`, here is the exact diagnosis of why it is failing and how to fix it.

### Why Google Cloud Scheduler Fails Locally
Google Cloud Scheduler is a public, cloud-native service designed to send HTTP requests or Pub/Sub messages to publicly accessible endpoints (like a deployed Cloud Function). 

Because your app is running locally (e.g., `http://localhost:3000`), **Google Cloud cannot reach your computer**. It is blocked by your router and firewall. Furthermore, the `syncTrigger` cloud function is currently configured for a Pub/Sub architecture that relies on GCP infrastructure, which doesn't natively exist on your local Windows machine. 

### Recommendations for Local & Hybrid Automation

To achieve the "Best in Class" automated pipeline experience while developing locally, you have three primary architectural options depending on your goal:

#### Option 1: The Tunnel Method (Testing the exact Cloud Architecture)
If you want to use the actual Google Cloud Scheduler while developing locally to ensure parity with production:
1. Run a secure tunnel like **Ngrok** (`ngrok http 3000`). This gives your localhost a public URL (e.g., `https://1234.ngrok.io`).
2. Update your GCP Cloud Scheduler job to target `https://1234.ngrok.io/api/sync`.
3. *Pros:* Exact parity with production logic. *Cons:* Requires Ngrok to be running constantly.

#### Option 2: The Local Node Worker (Best for permanent local development)
If you just want the pipeline to run on a schedule automatically in the background without relying on Google Cloud:
1. Do not use Cloud Scheduler.
2. Create a dedicated local background worker script (e.g., `scripts/local-cron.ts`).
3. Use a library like `node-cron` inside this script:
   ```typescript
   import cron from 'node-cron';
   // Run exactly at 6 AM Monday-Friday
   cron.schedule('0 6 * * 1-5', async () => {
       await fetch('http://localhost:3000/api/sync', { method: 'POST' });
   });
   ```
4. Run this script in a separate terminal tab: `npx tsx scripts/local-cron.ts`.
5. *Pros:* Works entirely offline, requires zero cloud infrastructure.

#### Option 3: OS-Level Task Scheduler
Since you are on Windows, you can bypass Node entirely for the trigger layer:
1. Open Windows Task Scheduler.
2. Create a Basic Task set to fire at 6:00 AM daily.
3. Set the Action to run PowerShell: `powershell.exe -Command "Invoke-WebRequest -Uri 'http://localhost:3000/api/sync' -Method POST"`
4. *Pros:* Zero code required. *Cons:* Invisible to other developers because it lives in your Windows OS, not the codebase.

**The "Best in Class" Decision:** Implement **Option 2**. Creating a dedicated `local-cron.ts` script ensures that any developer who clones this repository can instantly spin up the automated schedules locally alongside the Next.js server without needing GCP credentials or OS-specific configurations.
