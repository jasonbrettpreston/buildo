# Active Task: assert-global-coverage — Exhaustive Field Profile Rewrite
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `b107009`

---

## Context
* **Goal:** Rewrite `scripts/quality/assert-global-coverage.js` to fix four classes of bugs: (1) >100% coverage from row-level numerators vs permit-level denominators; (2) drastically incomplete field mapping — the original script covered ~20 fields; the exhaustive spec requires ~100 fields across 8 denominator groups; (3) naive uniform thresholds that FAIL scraper-sparse fields; (4) `step_target` column too narrow in the FreshnessTimeline UI.
* **Target Spec:** `docs/specs/pipeline/49_data_completeness_profiling.md`
* **Key Files:**
  - `scripts/quality/assert-global-coverage.js`
  - `src/components/FreshnessTimeline.tsx` (ColumnarAuditTable width)

---

## Bug Analysis

### Bug 1 — >100% Coverage (Grain Mismatch) — Confirmed live

| Step | Field | Root Cause | Fix |
|------|-------|-----------|-----|
| Step 9 | `permit_parcels.linked_permits` | Numerator=227,845 DISTINCT permits in permit_parcels; denominator=222,890 geocoded permits. Address-matched links exist for non-geocoded permits. | Change denominator → `permitsTotal` (all permits) |
| Step 23 | `predicted_start`, `urgency` | Numerator=raw `COUNT(*) FILTER` over forecast rows (1 row/trade per permit); denominator=`forecastEligible` (DISTINCT permits). Multiple trades per permit → rows > permits. | Numerator → `COUNT(DISTINCT permit_num\|\|revision_num) FILTER (...)` |

---

### Bug 2 — Exhaustive Field Mapping (Complete Gap Analysis)

The rewrite is organized around **8 exact denominator groups**. Fields in the user's spec that were **missing from my previous plan** are marked `NEW`. Fields I had but with the wrong denominator are marked `FIX DENOM`.

---

#### Denominator A — `SELECT COUNT(*) FROM permits` (ALL permits including PRE-%)

**Base fields (Step 2 — load_permits):**

| Field | Status | Notes |
|-------|--------|-------|
| `permit_type` | NEW | |
| `structure_type` | NEW | |
| `work` | NEW | |
| `street_num` | NEW | |
| `street_name` | NEW | |
| `street_name_normalized` | NEW | |
| `street_type` | NEW | |
| `street_direction` | NEW | |
| `city` | NEW | |
| `postal` | NEW | |
| `geo_id` | HAD | Change: simple `IS NOT NULL` (not the geocodeable filter — that's Step 8 denom) |
| `building_type` | NEW | |
| `category` | NEW | |
| `application_date` | NEW | |
| `issued_date` | HAD | FIX DENOM: was non-PRE only, now all permits |
| `completed_date` | HAD | FIX DENOM: was stale-only denominator, now all permits |
| `status` | NEW | |
| `description` | HAD | FIX DENOM |
| `est_const_cost` | HAD | Use `externalRow` (scraper data, ~54% structural sparsity) |
| `builder_name` | HAD | FIX DENOM |
| `owner` | NEW | |
| `dwelling_units_created` | NEW | |
| `dwelling_units_lost` | NEW | |
| `ward` | NEW | |
| `council_district` | NEW | |
| `current_use` | NEW | |
| `proposed_use` | NEW | |
| `housing_units` | NEW | |
| `storeys` | NEW | |
| `data_hash` | NEW | Nullable — confirms hash written |
| `raw_json` | NEW | Nullable — confirms raw source preserved |

**Enriched fields (Steps 4, 5, 8, 10, 21):**

| Field | Step | Status |
|-------|------|--------|
| `enriched_status` | Step 4 | HAD |
| `last_seen_at` | Step 2 | NEW — NOT NULL in schema, serves as integrity check |
| `project_type` | Step 5 | HAD |
| `scope_tags` (array_length > 0) | Step 5 | HAD |
| `scope_classified_at` | Step 5 | HAD |
| `scope_source` | Step 5 | HAD |
| `latitude` | Step 8 | HAD (FIX DENOM: all permits, not geocodeable) |
| `longitude` | Step 8 | HAD (FIX DENOM) |
| `location` (geometry IS NOT NULL) | Step 8 | NEW |
| `geocoded_at` | Step 8 | NEW |
| `neighbourhood_id` | Step 10 | HAD (FIX DENOM) |
| `lifecycle_phase` | Step 21 | HAD |
| `phase_started_at` | Step 21 | HAD |
| `lifecycle_stalled` | Step 21 | NEW |
| `lifecycle_classified_at` | Step 21 | HAD |

**Table coverage metrics (cross-table, Denom A):**

| Metric | Status |
|--------|--------|
| % permits with ≥1 row in `permit_parcels` | NEW — `COUNT(DISTINCT pp.permit_num\|\|revision_num)` / permitsTotal |
| % permits with ≥1 active row in `permit_trades` | HAD (was non-PRE only, FIX DENOM) |
| % permits with ≥1 row in `cost_estimates` | HAD (FIX DENOM) |

---

#### Denominator B — `SELECT COUNT(*) FROM entities`

| Field | Status | Threshold |
|-------|--------|-----------|
| `legal_name` | NEW | standard (NOT NULL in schema → 100% expected) |
| `name_normalized` | HAD | standard |
| `permit_count` | NEW | standard (NOT NULL) |
| `entity_type` | NEW | standard |
| `last_seen_at` | NEW | standard (NOT NULL) |
| `is_wsib_registered` | HAD | standard |
| `primary_phone` | HAD | `externalRow` (scraped) |
| `primary_email` | HAD | `externalRow` |
| `website` | NEW (was in previous plan) | `externalRow` |

---

#### Denominator C — `SELECT COUNT(*) FROM permits WHERE latitude IS NOT NULL` (geocoded permits)

All `permit_parcels` columns are `NOT NULL` in schema — coverage equals "% geocoded permits with any parcel link".

| Field | Table | Status |
|-------|-------|--------|
| `match_type` | `permit_parcels` | NEW |
| `confidence` | `permit_parcels` | NEW |
| `linked_at` | `permit_parcels` | NEW |

Numerator for each: `COUNT(DISTINCT pp.permit_num||revision_num) FROM permit_parcels pp JOIN permits p ON ... WHERE p.latitude IS NOT NULL AND pp.X IS NOT NULL`

---

#### Denominator D — `SELECT COUNT(*) FROM parcel_buildings`

All columns `NOT NULL` — serves as completeness/integrity check.

| Field | Status |
|-------|--------|
| `is_primary` | NEW |
| `structure_type` | NEW |
| `match_type` | NEW |
| `confidence` | NEW |
| `linked_at` | NEW |

---

#### Denominator E — `SELECT COUNT(*) FROM permit_trades`

| Field | Nullable | Status | Threshold |
|-------|----------|--------|-----------|
| `tier` | YES | HAD (was adding) | standard |
| `confidence` | YES | HAD (was adding) | standard |
| `is_active` | NO | NEW | standard (NOT NULL → ~100%) |
| `phase` | YES | HAD (was adding) | standard |
| `lead_score` | NO | NEW | standard (NOT NULL → ~100%) |
| `classified_at` | NO | NEW | standard (NOT NULL → ~100%) |

---

#### Denominator F — `SELECT COUNT(*) FROM cost_estimates`

| Field | Nullable | Status |
|-------|----------|--------|
| `estimated_cost` | YES | HAD |
| `cost_source` | NO | NEW (NOT NULL → ~100%) |
| `cost_tier` | YES | HAD (was adding) |
| `cost_range_low` | YES | NEW |
| `cost_range_high` | YES | NEW |
| `premium_factor` | YES | HAD (was adding) |
| `complexity_score` | YES | HAD (was adding) |
| `model_version` | NO | NEW (NOT NULL → ~100%) |
| `is_geometric_override` | NO | HAD (was adding, NOT NULL) |
| `modeled_gfa_sqm` | YES | HAD (was adding) |
| `effective_area_sqm` | YES | NEW |
| `trade_contract_values` | NO | NEW (NOT NULL JSONB → ~100%) |
| `computed_at` | NO | NEW (NOT NULL → ~100%) |

---

#### Denominator G — Eligible Forecast Permits (DISTINCT permits with active trade, non-skip phase)

Exact query matches existing `forecastEligible` computation:
```sql
SELECT COUNT(DISTINCT p.permit_num || '--' || p.revision_num)
FROM permits p
JOIN permit_trades pt ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num AND pt.is_active = true
WHERE p.lifecycle_phase IS NOT NULL
  AND p.phase_started_at IS NOT NULL
  AND p.lifecycle_phase NOT IN ('P19','P20','O1','O2','O3','P1','P2')
```

| Metric | Status |
|--------|--------|
| % eligible permits with ≥1 row in `trade_forecasts` | HAD (partial — was numerator vs this denominator) |

---

#### Denominator H — `SELECT COUNT(*) FROM trade_forecasts`

| Field | Nullable | Status |
|-------|----------|--------|
| `trade_slug` | NO | NEW (NOT NULL → ~100%) |
| `predicted_start` | YES | FIX: change numerator to DISTINCT permit count |
| `target_window` | YES | NEW |
| `confidence` | NO | NEW (NOT NULL → ~100%) |
| `urgency` | NO | FIX: DISTINCT permit numerator |
| `calibration_method` | YES | NEW |
| `sample_size` | YES | NEW |
| `median_days` | YES | NEW |
| `p25_days` | YES | NEW |
| `p75_days` | YES | NEW |
| `opportunity_score` | NO | HAD (NOT NULL → ~100% expected) |
| `computed_at` | NO | NEW (NOT NULL → ~100%) |

---

### Bug 3 — Context-Aware Thresholds

**New `externalRow()` builder** — fixed thresholds (PASS ≥ 10%, WARN ≥ 5%, FAIL < 5%):
Applied to: `primary_phone`, `primary_email`, `website`, `wsib_registry.linked_entity_id`

**`infoRow` (no traffic-light judgment)**:
Applied to: `est_const_cost` (city CKAN structural sparsity, pipeline cannot control)

**Standard `coverageRow()`** (90%/70% from logic_variables):
All other fields.

**Fields with NOT NULL constraint** will always show ~100% — serve as integrity sentinels.

---

### Bug 4 — UX Column Width

`ColumnarAuditTable` in `FreshnessTimeline.tsx`:
- `step_target`: `min-w-[140px]` → `min-w-[280px]`
- `field`: no width → add `min-w-[180px]`

---

## New Query Architecture

Replace the current mixed approach with 8 dedicated queries + existing auxiliary queries:

1. **`pa`** — massive permits FILTER query (~50 expressions), Denom A
2. **`ea`** — entities aggregate, Denom B
3. **`pp`** — permit_parcels coverage vs geocoded permits, Denom C
4. **`pb`** — parcel_buildings aggregate, Denom D
5. **`pt`** — permit_trades aggregate (active trades), Denom E
6. **`ce`** — cost_estimates aggregate, Denom F
7. **`tfd`** — forecastEligible (existing, Denom G)
8. **`tfa`** — trade_forecasts aggregate with DISTINCT permit counts, Denom H

Retained unchanged: `bnd` (builder-to-entity JOIN), `wa` (wsib_registry), `pSchema` (column count), `etRuns` (entity tracing verdict), `misc` (sub-selects for coa, tracked_projects, snapshots).

---

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline.run() wraps; no new API routes.
* **Unhappy Path Tests:** Additive SQL expressions — no structural changes, existing infra tests cover the shape contract.
* **logError Mandate:** N/A — no new catch blocks.
* **Mobile-First:** N/A for script. FreshnessTimeline UX fix is additive Tailwind width change.

---

## Execution Plan
- [ ] **Rollback Anchor:** `b107009` recorded.
- [ ] **State Verification:** DB confirms grain mismatch (227,845 parcel-linked permits > 222,890 geocoded permits). All new column names validated against `01_database_schema.md`.
- [ ] **Spec Review:** Spec 49 §4 Denominator Matrix reviewed. Updating to user-specified 8-denominator model.
- [ ] **Fix:** Rewrite permits query (Denom A), extend entities query (Denom B), add pp/pb/pt/ce queries (Denom C-F), fix tf query grain (Denom H), keep tfd unchanged (Denom G). Add `externalRow` builder. Reclassify `est_const_cost` as infoRow.
- [ ] **UX:** Widen ColumnarAuditTable step_target + field columns.
- [ ] **Pre-Review Self-Checklist:** Verify no remaining row-level numerators against permit-level denominators. Verify every field name matches `01_database_schema.md`. Verify NOT NULL fields show correctly. Verify `externalRow` fields don't include any that should genuinely fail.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. → WF6.
