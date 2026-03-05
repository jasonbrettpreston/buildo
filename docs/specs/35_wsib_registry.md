# Spec 35 -- WSIB Registry Integration

## 1. Goal & User Story
As an admin, I want to ingest the WSIB Businesses Classification Details open dataset so that builders can be matched to their WSIB registration status, and unmatched Class G entries become outreach leads for the sales team.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend scripts and admin API trigger) |

## 3. Behavioral Contract
- **Inputs:** Annual CSV file from WSIB Open Data portal (`BusinessClassificationDetails(YYYY).csv`); admin trigger via pipeline dashboard "Update Now".
- **Core Logic:**
  - **Source dataset:** WSIB "Businesses classification details" — annual CSV with 9 columns: `Legal name`, `Trade name`, `Mailing Address`, `Predominant class`, `NAICS code`, `Description` (NAICS), `Class/subclass`, `Description` (subclass), `Business size`. Updated annually (latest: Nov 2025). Available at `https://www.wsib.ca/en/open-data/businesses-classification-details`.
  - **Dataset profile (2025):** 345K total rows, ~133K Class G rows (construction), ~121K unique businesses, ~59K with trade names. Subclass breakdown: G1 (Residential building) 29K, G2 (Infrastructure) 3K, G3 (Non-residential building) 23K, G4 (Building equipment) 28K, G5 (Specialty trades) 41K, G6 (Other construction) 6K. Business sizes: Small 124K, Medium 7K, Large 2K.
  - **Multi-row structure:** A single business can appear in multiple rows with different NAICS codes/subclasses. The `Predominant class` column contains the subclass (e.g., `G1`, `G5`) not just `G`. We de-duplicate to one row per unique `(legal_name_normalized, mailing_address)`, keeping the predominant subclass.
  - **Ingestion (`scripts/load-wsib.js`):** Parse CSV via `csv-parse`, filter to rows where `Predominant class` starts with `G` OR `Class/subclass` starts with `G`. Normalize legal name and trade name using the same logic as `normalizeBuilderName()` (uppercase, strip suffixes INC/LTD/CORP/etc., collapse whitespace). Upsert by `(legal_name_normalized, mailing_address)` unique key — update `last_seen_at` on conflict. Requires local CSV file via `--file` flag (no automated download — WSIB portal uses dynamic download URLs that require browser interaction).
  - **Matching (`scripts/link-wsib.js`):** 3-tier bulk SQL cascade against `builders` table:
    - Tier 1: Exact trade name match — `wsib_registry.trade_name_normalized = builders.name_normalized` → 0.95 confidence.
    - Tier 2: Exact legal name match — `wsib_registry.legal_name_normalized = builders.name_normalized` → 0.90 confidence.
    - Tier 3: Fuzzy name match — `builders.name_normalized LIKE '%' || wsib_registry.trade_name_normalized || '%'` OR reverse → 0.60 confidence.
    - On match: `UPDATE builders SET wsib_status = 'Registered (Class ' || subclass || ')'` and `UPDATE wsib_registry SET linked_builder_id = builders.id, match_confidence = N, matched_at = NOW()`.
  - **Pipeline integration:** Two new pipeline slugs: `load_wsib` (ingest) and `link_wsib` (match). Registered in `PIPELINE_SCRIPTS`. Schedule: Annual (matching WSIB data release cadence).
  - **Dashboard integration:** WSIB Registry appears as a new data source circle in the Data Quality Dashboard hub-and-spoke, feeding into Builders. Metrics: total Class G entries, linked count, unlinked lead pool count.
  - **CQA integration:** `assert-data-bounds.js` gains wsib_registry checks: row count > 0, no entries with NULL legal_name, all entries have subclass starting with `G`, no orphaned `linked_builder_id`.
- **Outputs:** `wsib_registry` table populated with Class G businesses; `builders.wsib_status` updated for matched builders; unmatched entries available as outreach leads; pipeline tracking in `pipeline_runs`.
- **Edge Cases:**
  - CSV format changes across years (column name drift) — `load-wsib.js` validates header row before processing, aborts on unexpected columns.
  - Same business at multiple addresses — each `(legal_name_normalized, mailing_address)` combination gets its own row.
  - Same business with multiple NAICS codes — de-duplicated during ingestion, keeping the G-subclass row.
  - Trade name is NULL for ~55% of entries — Tier 1 matching skips these, Tier 2 uses legal name instead.
  - Builder name normalization mismatches — fuzzy Tier 3 catches partial matches.
  - Empty CSV or non-G classes leaking in — pre-filter rejects, post-ingestion CQA asserts 0 non-G rows.
  - Re-running load on same CSV is idempotent (upsert on `last_seen_at`).
  - BOM character (UTF-8 BOM `\uFEFF`) at start of CSV — stripped during header parsing.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`wsib.logic.test.ts`): WSIB Registry Integration
- **Infra** (`wsib.infra.test.ts`): WSIB Registry Infrastructure
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `migrations/040_wsib_registry.sql` — CREATE TABLE, indexes, unique constraint
- `scripts/load-wsib.js` — CSV parser, Class G filter, name normalization, bulk upsert
- `scripts/link-wsib.js` — 3-tier name matching against builders table
- `src/app/api/admin/pipelines/[slug]/route.ts` — Add load_wsib, link_wsib slugs
- `scripts/run-chain.js` — Add wsib to PIPELINE_SCRIPTS
- `scripts/quality/assert-data-bounds.js` — Add wsib_registry validation checks
- `src/components/DataQualityDashboard.tsx` — Add WSIB data source circle
- `src/components/FreshnessTimeline.tsx` — Add WSIB pipeline entries
- `src/app/api/admin/stats/route.ts` — Add wsib_registry count queries
- `src/tests/wsib.logic.test.ts` — Logic tests
- `src/tests/wsib.infra.test.ts` — Infrastructure tests
- `src/tests/factories.ts` — Add wsibRegistryEntry factory

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08.
- **`src/lib/sync/`**: Governed by Spec 02/04.
- **`scripts/enrich-builders.js`**: Governed by Spec 11. Google Places enrichment unchanged.
- **Web search enrichment (report Step 3):** Deferred to a future spec. This spec covers ingestion + matching only.
- **Outreach dashboard (report Step 4):** Deferred to a future spec. Unmatched leads are queryable but no dedicated UI yet.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: New migration for `wsib_registry` table.
- Relies on **Spec 11 (Builder Enrichment)**: Matches against `builders` table, updates `wsib_status`.
- Relies on **Spec 28 (Data Quality Dashboard)**: Integrates into dashboard and CQA pipeline.
