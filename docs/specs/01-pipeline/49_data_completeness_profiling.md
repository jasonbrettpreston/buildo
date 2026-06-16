# Spec 49 — Global Data Completeness Profile

**Status:** Active  
**Script:** `scripts/quality/assert-global-coverage.js`  
**Advisory Lock ID:** 111  

---

## 1. Goal & User Story

As a pipeline operator, I want a single authoritative field-level coverage report at the end of every chain run — so I can tell at a glance what fraction of permits, CoA applications, and enrichment records have been fully processed by each step, without manually cross-referencing multiple assert scripts.

---

## 2. Architecture

**Placement (post-Phase G):**
- Permits chain: step 26 (last step, after assert_entity_tracing) — was step 27 pre-Phase G; `create_pre_permits` removed by Phase G.
- CoA chain: step 10 (last step, after assert_lifecycle_phase_distribution) — was step 12 pre-Phase G; `create_pre_permits` + `assert_pre_permit_aging` removed by Phase G.

**Non-halting.** Coverage gaps emit WARN/FAIL rows in the audit_table but do not throw. Infrastructure failures (DB connectivity, Zod validation) re-throw.

**Chain-aware:** `process.env.PIPELINE_CHAIN`
- `permits` → full profile (all steps 1–26)
- `coa` → CoA-scoped subset (CoA steps 1–11)
- unset → full profile (default for standalone runs)

---

## 3. Behavioral Contract

### Inputs
- PostgreSQL (all tables written by upstream steps)
- `logic_variables.profiling_coverage_pass_pct` — coverage ≥ this value → PASS
- `logic_variables.profiling_coverage_warn_pct` — coverage ≥ this value → WARN; below → FAIL

### Core Logic
1. Acquire advisory lock 111 (`pg_try_advisory_xact_lock`). If lock held, emit skip and exit.
2. Load and Zod-validate the threshold variables (field-coverage + vocabulary-coverage pairs).
3. **Field-coverage** (the original dimension): run `COUNT(*) FILTER (WHERE ...)` queries grouped by table; one row per step/field. `populated/denominator`. Step-attributed via the metric label.
4. **Vocabulary-coverage** (the value/vocabulary dimension): for each triple in the `VOCAB_COVERAGE` matrix (§4.x), `COUNT(DISTINCT dataColumn)` PRESENT vs `COUNT(DISTINCT vocabColumn)` DEFINED — catches *silent under-emission* a field-NULL query can't see (a never-emitted value has no row to be null). An unresolved/type-mismatched triple → a **WARN** row (never silent INFO-skip).
5. INFO rows (quality steps, count-only metrics, `denominator=0`/`vocab_size=0`) always get `status: 'INFO'`.
6. Compute `verdict` = worst status across all rows (`rows.some(FAIL)?FAIL:some(WARN)?WARN:PASS`). **Non-halting** — verdict never throws (only Zod/DB infra errors do).
7. `emitSummary({ records_total: 1, ... })` — `records_total` is ALWAYS 1 (one audit pass).

### Zod Schema
```js
const LOGIC_VARS_SCHEMA = z.object({
  profiling_coverage_pass_pct: z.coerce.number().int().min(0).max(100),
  profiling_coverage_warn_pct: z.coerce.number().int().min(0).max(100),
  vocab_coverage_pass_pct: z.coerce.number().int().min(0).max(100),   // §3 vocabulary dimension
  vocab_coverage_warn_pct: z.coerce.number().int().min(0).max(100),
}).passthrough()                                                       // other logic_vars flow through
  .refine(d => d.profiling_coverage_warn_pct < d.profiling_coverage_pass_pct, { message: '…' })
  .refine(d => d.vocab_coverage_warn_pct  < d.vocab_coverage_pass_pct,  { message: '…' });
```

### Output: `{ metric, value, threshold, status }` rows (NOT columnar — the "P3 fix")
The script emits standard SDK rows, NOT a `columns[]`-keyed columnar table. The old columnar shape (`step_target`/`populated`/`denominator`/`coverage_pct` keys) was removed because it broke the SDK's auto-injected `{metric,value,threshold,status}` rows (`sys_*`/`dq_*`) in the admin renderer; `assert-global-coverage.infra.test.ts` now *bans* those keys (whole-file regex). Step attribution lives in the **metric label**.
```js
{ records_total: 1, records_new: 0, records_updated: 0,
  records_meta: { audit_table: { phase: 111, name: 'Global Data Completeness Profile',
    verdict: 'PASS' | 'WARN' | 'FAIL',
    rows: [
      // field-coverage (original dimension)
      { metric: 'permits.description (Step 2 — load_permits)', value: '97.5%', threshold: '>= 90%', status: 'PASS' },
      // vocabulary-coverage (value dimension) — present/defined; discriminator 'vocab' in the label
      { metric: 'trade_id vocab (Step 13 — classify_permits)', value: '22/38 (57.9%)', threshold: '>= 90%', status: 'FAIL' },
      { metric: 'neighbourhood_id vocab (Step 10 — link_neighbourhoods)', value: '158/158 (100%)', threshold: '>= 90%', status: 'PASS' },
    ] } } }
```

### Edge Cases
- field `denominator = 0` / vocab `vocab_size = 0` → `value: '<n>/0'`, `threshold: 'N/A'`, `status: 'INFO'` (nothing to measure)
- vocab triple unresolved (missing table/column) or type-mismatch → `value: 'unresolved: <reason>'`, `threshold: 'N/A'`, `status: 'WARN'` (visible, never silent)
- Advisory lock held → emit skip payload, `records_total: 0`, `reason: 'lock_held'`
- any threshold var missing from logic_variables → Zod throws (halting) — **the seed must run before the first execution**
- Zero real permits in DB → field rows emit `0%`/`status: 'FAIL'`

---

## 4. Denominator Matrix

Phase G (commit `3944f88`) retired PRE-% synthetic permits. The `permit_num NOT LIKE 'PRE-%'` clauses preserved below are now vestigial defense-in-depth (always-true post-retirement; harmless but documents the historical exclusion intent).
"All real permits" = the count above.

**Step 17 `create_pre_permits` row REMOVED by Phase G** — the script is now a one-shot DELETE shim and removed from both chains. The `permits.pre_permit_leads` denominator is replaced at the assertion layer by the `permits_pre_permit_count == 0` FAIL gate in `assert-data-bounds.js` (both audits per Phase G v2-Q2).

### Permits Chain — Full Profile

| step_target | field | populated condition | denominator |
|------------|-------|---------------------|-------------|
| Step 1 — assert_schema | permits.columns_present | `COUNT(column_name) FROM information_schema.columns WHERE table_name='permits'` | expected column count (INFO) |
| Step 2 — load_permits | permits.description | `description IS NOT NULL` | all real permits |
| Step 2 — load_permits | permits.builder_name | `builder_name IS NOT NULL` | all real permits |
| Step 2 — load_permits | permits.est_const_cost | `est_const_cost IS NOT NULL` | all real permits |
| Step 2 — load_permits | permits.issued_date | `issued_date IS NOT NULL` | all real permits |
| Step 2 — load_permits | permits.geo_id | `geo_id IS NOT NULL AND geo_id != '' AND geo_id ~ '^[0-9]+$'` | all real permits |
| Step 3 — close_stale_permits | permits.completed_date | `completed_date IS NOT NULL` | permits with `status IN ('Pending Closed','Closed')` — output-state denominator |
| Step 4 — classify_permit_phase | permits.enriched_status | `enriched_status IS NOT NULL` | INFO — only populated for active inspection stages (P9–P17); ~5.2% of all real permits is the data reality, not a quality gap. `infoRow` — threshold check removed. |
| Step 5 — classify_scope | permits.project_type | `project_type IS NOT NULL` | all real permits |
| Step 5 — classify_scope | permits.scope_tags | `array_length(scope_tags,1) > 0` | all real permits |
| Step 5 — classify_scope | permits.scope_classified_at | `scope_classified_at IS NOT NULL` | all real permits |
| Step 5 — classify_scope | permits.scope_source | `scope_source IS NOT NULL` | all real permits |
| Step 6 — extract_builders | entities.name_normalized | `name_normalized IS NOT NULL` | `COUNT(DISTINCT builder_name) FROM permits WHERE builder_name IS NOT NULL AND permit_num NOT LIKE 'PRE-%'` |
| Step 6 — extract_builders | entities.primary_phone | `primary_phone IS NOT NULL` | `COUNT(*) FROM entities` |
| Step 6 — extract_builders | entities.primary_email | `primary_email IS NOT NULL` | `COUNT(*) FROM entities` |
| Step 7 — link_wsib | entities.is_wsib_registered | `is_wsib_registered = true` | `COUNT(*) FROM entities` — `externalRow` (PASS ≥ 10%, WARN ≥ 5%); third-party scraper field, ~24% coverage by design |
| Step 7 — link_wsib | wsib_registry.linked_entity_id | `linked_entity_id IS NOT NULL` | `COUNT(*) FROM wsib_registry` |
| Step 8 — geocode_permits | permits.latitude | `latitude IS NOT NULL` | `geo_id IS NOT NULL AND geo_id != '' AND permit_num NOT LIKE 'PRE-%'` |
| Step 8 — geocode_permits | permits.longitude | `longitude IS NOT NULL` | same as latitude |
| Step 9 — link_parcels | permit_parcels.linked_permits | `COUNT(DISTINCT permit_num\|\|revision_num) FROM permit_parcels` | real permits with `latitude IS NOT NULL` |
| Step 10 — link_neighbourhoods | permits.neighbourhood_id | `neighbourhood_id IS NOT NULL AND neighbourhood_id != -1` | all real permits |
| Step 11 — link_massing | parcel_buildings.linked_parcels | `COUNT(DISTINCT parcel_id) FROM parcel_buildings` | `COUNT(*) FROM parcels WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL` |
| Step 12 — link_similar | permits.scope_propagated | companion permits with `scope_tags IS NOT NULL` | companion (HVA/PLB/DRN) permits at BLD-permit addresses |
| Step 13 — classify_permits | permit_trades.active_per_permit | `COUNT(DISTINCT permit_num\|\|revision_num) FROM permit_trades WHERE is_active=true` | all real permits |
| Step 14 — compute_cost_estimates | cost_estimates.estimated_cost | `estimated_cost IS NOT NULL` | all real permits |
| Step 15 — compute_timing_calibration_v2 | phase_calibration.rows | `COUNT(*) FROM phase_calibration WHERE median_days IS NOT NULL` | INFO: total calibration rows |
| Step 16 — link_coa | coa_applications.linked_permit_num | `linked_permit_num IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| ~~Step 17 — create_pre_permits~~ | _Removed by Phase G (commit `3944f88`); replaced by `permits_pre_permit_count == 0` gate in assert-data-bounds.js_ | | |
| Step 18 — refresh_snapshot | data_quality_snapshots.today | `COUNT(*) WHERE snapshot_date=CURRENT_DATE` | 1 (INFO) |
| Step 19 — assert_data_bounds | permits.duplicate_pks | duplicate `(permit_num,revision_num)` pairs | 0 expected (INFO: non-zero = anomaly) |
| Step 20 — assert_engine_health | engine_health_snapshots.today | rows recorded `> NOW() - 25h` | ≥ 1 expected (INFO) |
| Step 21 — classify_lifecycle_phase | permits.lifecycle_phase | `lifecycle_phase IS NOT NULL` | all real permits |
| Step 21 — classify_lifecycle_phase | permits.phase_started_at | `phase_started_at IS NOT NULL` | real permits with `lifecycle_phase IS NOT NULL` |
| Step 21 — classify_lifecycle_phase | permits.lifecycle_stalled | `lifecycle_stalled = true` | INFO — `BOOLEAN NOT NULL DEFAULT false`; always populated. Shows count of stalled permits. |
| Step 21 — classify_lifecycle_phase | permits.lifecycle_classified_at | `lifecycle_classified_at IS NOT NULL` | all real permits |
| Step 21 — classify_lifecycle_phase | coa_applications.lifecycle_phase | `lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL` | `COUNT(*) FROM coa_applications WHERE linked_permit_num IS NULL` (unlinked only — classifier skips linked apps) |
| Step 22 — assert_lifecycle_phase_distribution | permits.unclassified_count | `lifecycle_phase IS NULL AND permit_num NOT LIKE 'PRE-%'` | all real permits (INFO: target = 0) |
| Step 23 — compute_trade_forecasts | trade_forecasts.permits_covered | `COUNT(DISTINCT permit_num\|\|revision_num)` in trade_forecasts | forecastEligible (INFO — ~36% is the designed outcome after stall/zombie gates; not a quality indicator) |
| Step 23 — compute_trade_forecasts | trade_forecasts.predicted_start | `predicted_start IS NOT NULL` (DISTINCT permits) | forecastEligible (INFO — same gate rationale as permits_covered) |
| Step 23 — compute_trade_forecasts | trade_forecasts.urgency (classified) | `urgency IS NOT NULL` (DISTINCT permits) | forecastEligible (INFO — same gate rationale as permits_covered) |
| Step 24 — compute_opportunity_scores | trade_forecasts.opportunity_score | `opportunity_score > 0` | `COUNT(*) FROM trade_forecasts WHERE urgency IS NULL OR urgency <> 'expired'` |
| Step 25 — update_tracked_projects | tracked_projects.active | `status != 'archived'` | `COUNT(*) FROM tracked_projects` (INFO) |
| Step 25 — update_tracked_projects | lead_analytics.rows | `COUNT(*) FROM lead_analytics` | `COUNT(*) FROM tracked_projects WHERE status != 'archived'` (INFO) |
| Step 26 — assert_entity_tracing | entity_tracing.last_verdict | most recent pipeline_run verdict for `assert_entity_tracing` | INFO: PASS/WARN/FAIL |

### CoA Chain — Scoped Subset (PIPELINE_CHAIN=coa)

| step_target | field | populated condition | denominator |
|------------|-------|---------------------|-------------|
| CoA Step 1 — assert_schema | coa_applications.columns_present | columns in information_schema for coa_applications | expected column count (INFO) |
| CoA Step 2 — load_coa | coa_applications.address | `address IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| CoA Step 2 — load_coa | coa_applications.ward | `ward IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| CoA Step 2 — load_coa | coa_applications.decision | `decision IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| CoA Step 2 — load_coa | coa_applications.application_number | `application_number IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| CoA Step 3 — assert_coa_freshness | coa_applications.days_since_latest | `EXTRACT(days FROM NOW() - MAX(created_at))` | threshold = 45 days (INFO, > 45 = WARN) |
| CoA Step 4 — link_coa | coa_applications.linked_permit_num | `linked_permit_num IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| CoA Step 4 — link_coa | coa_applications.linked_confidence | `linked_confidence IS NOT NULL` | `COUNT(*) FROM coa_applications WHERE linked_permit_num IS NOT NULL` |
| ~~CoA Step 5 — create_pre_permits~~ | _Removed by Phase G (commit `3944f88`)_ | | |
| ~~CoA Step 6 — assert_pre_permit_aging~~ | _Removed by Phase G (commit `3944f88`)_ | | |
| CoA Step 7 — refresh_snapshot | data_quality_snapshots.today | same as P18 | 1 (INFO) |
| CoA Step 8 — assert_data_bounds | coa_applications.duplicate_pks | duplicate `application_number` pairs | 0 expected (INFO) |
| CoA Step 9 — assert_engine_health | engine_health_snapshots.today | same as P20 | ≥ 1 expected (INFO) |
| CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_phase | `lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL` | `COUNT(*) FROM coa_applications WHERE linked_permit_num IS NULL` (unlinked only — classifier assigns P1/P2 only to unlinked apps) |
| CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_stalled | `lifecycle_stalled = true AND linked_permit_num IS NULL` | `COUNT(*) WHERE lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL` (INFO — `BOOLEAN NOT NULL DEFAULT false`; shows count of stalled classified apps) |
| CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_classified_at | `lifecycle_classified_at IS NOT NULL AND linked_permit_num IS NULL` | `COUNT(*) FROM coa_applications WHERE linked_permit_num IS NULL` (unlinked only) |
| CoA Step 11 — assert_lifecycle_phase_distribution | coa_applications.unclassified_count | `lifecycle_phase IS NULL` | `COUNT(*) FROM coa_applications` (INFO: target = 0) |

#### CoA Pipeline Parity additions (WF1 #coa-pipeline-parity-phase-a, 2026-05-13)

Added with the CoA pipeline parity rollout per Spec 42 §6. Coverage targets:

| step_target | field | populated condition | denominator + threshold |
|---|---|---|---|
| CoA Step D — classify-coa-scope | coa_applications.coa_type_class | `coa_type_class IS NOT NULL` | `COUNT(*) FROM coa_applications WHERE decision NOT IN ('Refused','Withdrawn','Closed')` — target ≥ 95% |
| CoA Step D — classify-coa-scope | coa_applications.project_type | `project_type IS NOT NULL` | same denominator — target ≥ 90% |
| CoA Step D — classify-coa-scope | coa_applications.scope_tags | `scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0` | same — target ≥ 80% |
| CoA Step D — link-coa-to-parcels | lead_parcels WHERE lead_id LIKE 'coa:%' | `EXISTS row` | `COUNT(*) FROM coa_applications WHERE latitude IS NOT NULL` — target ≥ 75% (parcel-match floor at confidence 0.50) |
| CoA Step D — link-coa-to-parcels | coa_applications.structure_type | `structure_type IS NOT NULL` | denominator of CoAs with `lead_parcels` row — target ≥ 80% |
| CoA Step D — link-coa-to-parcels | coa_applications.neighbourhood_id | `neighbourhood_id IS NOT NULL` | same denominator — target ≥ 95% |
| CoA Step D — classify-coa-trades | lead_trades WHERE lead_id LIKE 'coa:%' | `EXISTS row` | `COUNT(*) FROM coa_applications` active — target ≥ 90% (default fallback allowed) |
| CoA Step D — compute-coa-cost-estimates | coa_applications.estimated_cost | `estimated_cost IS NOT NULL` | active CoAs — target ≥ 80% |
| CoA Step D — compute-coa-cost-estimates | coa_applications.modeled_gfa_sqm | `modeled_gfa_sqm IS NOT NULL` | active CoAs — target ≥ 80% |
| CoA Step E — classify_lifecycle_phase (fixed) | coa_applications.lifecycle_phase | `lifecycle_phase IS NOT NULL` | `COUNT(*) FROM coa_applications WHERE decision NOT IN ('Refused','Withdrawn','Closed')` — target ≥ 95% (was 0.6% pre-84-W12 fix) |
| CoA Step E — classify_lifecycle_phase (granular) | coa_applications.lifecycle_seq | `lifecycle_seq IS NOT NULL` | active CoAs — target ≥ 95% |
| CoA Step E — classify_lifecycle_phase (granular) | permits.lifecycle_seq | `lifecycle_seq IS NOT NULL` | `COUNT(*) FROM permits WHERE lifecycle_phase IS NOT NULL` — target ≥ 95% |
| CoA Step E — classify_lifecycle_phase | lifecycle_status_history | row count per active CoA over rolling 30-day window | `COUNT(DISTINCT lead_id) WHERE lead_id LIKE 'coa:%' AND transitioned_at > NOW() - 30 days` ≥ 1 per active CoA |
| Universal — lead_id column population | cost_estimates.lead_id | `lead_id IS NOT NULL` | `COUNT(*) FROM cost_estimates` — target 100% post-Phase C backfill |
| Universal — lead_id column population | trade_forecasts.lead_id | `lead_id IS NOT NULL` | same pattern across `tracked_projects`, `lifecycle_transitions`, `lifecycle_status_history` — all 100% post-Phase C |

#### WF3 #406 — zoning enrichment coverage (enrich_permits / enrich_coa_zoning, migration 166)

Added 2026-06-01 (WF3 #406) so the global profile reports the Spec 66 WF3 relational-zoning feed. **`zoning_class` is the one GATED row** — emitted via `calibratedRow` at **PASS ≥ 80 / WARN ≥ 75** (per-field threshold, same mechanism as the `externalRow` 10/5 row above; thresholds are the source of truth and are NOT the global `logic_variables` pass/warn). 80/75 matches the F-H12 enrich-step ceiling and sits below live coverage (permits 83.6% / CoA 84.4% at authorization), so a real regression below 80% WARNs/FAILs the profile instead of going silent. **All other zoning fields are INFO** (`infoRow`) — sparse-by-design cost inputs (`bylaw_max_*`, `exception_number`), co-written jsonb (`applicable_bylaws`/`overlay_summary`/`variance_context`), and write-provenance (`zoning_parcel_count`/`zoning_dominant_parcel_id`/`zoning_dominant_parcel_method`/`zoning_enriched_at`); they are excluded from the verdict cascade (Spec 48 §3.6) and so cannot newly WARN/FAIL.

Step labels `Step 9b` (permits, after `link_parcels`) / `CoA Step 4b` (CoA, after `link_coa_to_parcels`) are the deliberate insert-after convention (the #405 full label-renumber to manifest order remains a separate deferred cosmetic item). INFO sub-field denominator context = the `zoning_enriched_at`-populated count (coverage "of enriched leads", not all leads).

| step_target | field | populated condition | denominator + threshold |
|---|---|---|---|
| Step 9b — enrich_permits | permits.zoning_class | `zoning_class IS NOT NULL` | all real permits — **GATED: PASS ≥ 80 / WARN ≥ 75** |
| Step 9b — enrich_permits | permits.zoning_enriched_at | `zoning_enriched_at IS NOT NULL` | enriched permits (INFO — enrichment radius) |
| Step 9b — enrich_permits | permits.bylaw_max_coverage_pct | `bylaw_max_coverage_pct IS NOT NULL` | enriched permits (INFO — sparse cost input) |
| Step 9b — enrich_permits | permits.bylaw_max_fsi | `bylaw_max_fsi IS NOT NULL` | enriched permits (INFO — sparse cost input) |
| Step 9b — enrich_permits | permits.bylaw_max_height_m | `bylaw_max_height_m IS NOT NULL` | enriched permits (INFO — sparse cost input) |
| Step 9b — enrich_permits | permits.exception_number | `exception_number IS NOT NULL` | enriched permits (INFO — sparse) |
| Step 9b — enrich_permits | permits.applicable_bylaws | `applicable_bylaws IS NOT NULL` | enriched permits (INFO — jsonb; non-empty by writer contract) |
| Step 9b — enrich_permits | permits.overlay_summary | `overlay_summary IS NOT NULL` | enriched permits (INFO — jsonb) |
| Step 9b — enrich_permits | permits.zoning_parcel_count | `zoning_parcel_count IS NOT NULL` | enriched permits (INFO — write provenance) |
| Step 9b — enrich_permits | permits.zoning_dominant_parcel_id | `zoning_dominant_parcel_id IS NOT NULL` | enriched permits (INFO — write provenance) |
| Step 9b — enrich_permits | permits.zoning_dominant_parcel_method | `zoning_dominant_parcel_method IS NOT NULL` | enriched permits (INFO — CHECK-pinned `'max_area'`; mirrors `zoning_enriched_at`) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_class | `zoning_class IS NOT NULL` | all CoAs — **GATED: PASS ≥ 80 / WARN ≥ 75** |
| CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_enriched_at | `zoning_enriched_at IS NOT NULL` | enriched CoAs (INFO — enrichment radius) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.bylaw_max_coverage_pct | `bylaw_max_coverage_pct IS NOT NULL` | enriched CoAs (INFO — sparse cost input) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.bylaw_max_fsi | `bylaw_max_fsi IS NOT NULL` | enriched CoAs (INFO — sparse cost input) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.bylaw_max_height_m | `bylaw_max_height_m IS NOT NULL` | enriched CoAs (INFO — sparse cost input) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.exception_number | `exception_number IS NOT NULL` | enriched CoAs (INFO — sparse) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.variance_context | `variance_context IS NOT NULL` | enriched CoAs (INFO — jsonb) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_parcel_count | `zoning_parcel_count IS NOT NULL` | enriched CoAs (INFO — write provenance) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_dominant_parcel_id | `zoning_dominant_parcel_id IS NOT NULL` | enriched CoAs (INFO — write provenance) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_dominant_parcel_method | `zoning_dominant_parcel_method IS NOT NULL` | enriched CoAs (INFO — CHECK-pinned `'max_area'`) |

#### WF2 #415 — ravine propagation coverage (enrich_permits / enrich_coa_zoning, migration 169)

Added 2026-06-03 (WF2 #415) so the global profile reports the Spec 59 §8e ravine feed propagated from parcels. Both rows are **INFO** (`infoRow`), under the same `Step 9b` / `CoA Step 4b` labels as the #406 zoning rows (enrich-permits.js writes ravine in the same step it writes zoning). Both are **pure counts with no denominator** (no coverage %). `is_in_ravine_protection_area` is `BOOLEAN NOT NULL DEFAULT false` — vacuously 100% under an `IS NOT NULL` coverage test, so it is emitted as a **count of the TRUE subset** (`FILTER (WHERE is_in_ravine_protection_area)`, never `IS NOT NULL`), mirroring the `lifecycle_stalled` count-only pattern. `ravine_distance_m` is non-null only for parcel-linked leads (orphans → NULL by design, Spec 59 §11.2); it is emitted as a count of the populated subset **without a denominator** — the parcel-linked set is distinct from (and can exceed) the zoning-enriched set, so passing `zoning_enriched`-count as a denominator context would risk a `>100%` display (#415 review fold). Neither is gated: ravine affects a small geographic subset with no stable population floor, so a coverage threshold would yield false FAILs; the per-run enrichment signal lives in enrich-permits.js's own `${prefix}_in_ravine_count` audit rows. INFO rows are excluded from the verdict cascade (Spec 48 §3.6).

| Step | Field | Numerator | Denominator |
| :--- | :--- | :--- | :--- |
| Step 9b — enrich_permits | permits.is_in_ravine_protection_area | `FILTER (WHERE is_in_ravine_protection_area)` | none (INFO — count of TRUE subset, not coverage) |
| Step 9b — enrich_permits | permits.ravine_distance_m | `ravine_distance_m IS NOT NULL` | none (INFO — count of populated subset; parcel-linked ⊄ zoning-enriched) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.is_in_ravine_protection_area | `FILTER (WHERE is_in_ravine_protection_area)` | none (INFO — count of TRUE subset, not coverage) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.ravine_distance_m | `ravine_distance_m IS NOT NULL` | none (INFO — count of populated subset; parcel-linked ⊄ zoning-enriched) |

#### WF3 #428 — heritage propagation coverage (enrich_permits / enrich_coa_zoning, migration 172)

Added 2026-06-05 (WF3 #428) so the global profile reports the Spec 61 §8e heritage feed propagated from parcels onto permits + coa_applications. All rows are **INFO** (`infoRow`), under the same `Step 9b` / `CoA Step 4b` labels as the #415 ravine + #406 zoning rows (enrich-permits.js writes heritage in the same step). `is_heritage_designated` is `BOOLEAN NOT NULL DEFAULT false` — vacuously 100% under `IS NOT NULL`, so it is a **count of the TRUE subset** (`FILTER (WHERE is_heritage_designated)`, never `IS NOT NULL`). `heritage_designation_type`/`heritage_designation_date` are non-null only for the designated subset (a small geographic set, distinct from zoning-enriched), so they are **pure counts with no denominator** (a denominator would risk a `>100%` display — the #415 fold). Not gated: heritage affects a small subset with no stable population floor. INFO rows are cascade-neutral (Spec 48 §3.6).

| Step | Field | Numerator | Denominator |
| :--- | :--- | :--- | :--- |
| Step 9b — enrich_permits | permits.is_heritage_designated | `FILTER (WHERE is_heritage_designated)` | none (INFO — count of TRUE subset, not coverage) |
| Step 9b — enrich_permits | permits.heritage_designation_type | `heritage_designation_type IS NOT NULL` | none (INFO — count of designated subset) |
| Step 9b — enrich_permits | permits.heritage_designation_date | `heritage_designation_date IS NOT NULL` | none (INFO — count of designated subset) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.is_heritage_designated | `FILTER (WHERE is_heritage_designated)` | none (INFO — count of TRUE subset, not coverage) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.heritage_designation_type | `heritage_designation_type IS NOT NULL` | none (INFO — count of designated subset) |
| CoA Step 4b — enrich_coa_zoning | coa_applications.heritage_designation_date | `heritage_designation_date IS NOT NULL` | none (INFO — count of designated subset) |

### 4.x Vocabulary-Coverage Matrix (value/vocabulary dimension)

`VOCAB_COVERAGE` (in `assert-global-coverage.js`) — distinct values PRESENT vs DEFINED. camelCase keys (the banned-keys lock is a whole-file regex on `step_target:`/`populated:`/`denominator:`/`coverage_pct:`). `present = COUNT(DISTINCT dataColumn) [WHERE dataFilter]`; `vocab_size = COUNT(DISTINCT vocabColumn) [WHERE vocabFilter]`; status from `vocab_coverage_pass_pct`/`warn_pct`.

| stepTarget | dataTable.dataColumn (dataFilter) | vocabTable.vocabColumn | Catches |
|---|---|---|---|
| Step 13 — classify_permits | `permit_trades.trade_id` | `trades.id` | the classifier emitting only 22/38 trades (the gap that motivated this) |
| CoA Step 7 — classify_coa_trades | `lead_trades.trade_id` (`lead_id LIKE 'coa:%'`) | `trades.id` | coa classifier emitting 19/38 |
| Step 10 — link_neighbourhoods | `permits.neighbourhood_id` (`<> -1`) | `neighbourhoods.id` | **healthy control** → 158/158 PASS (green == verified, not "ran") |

Unresolved triple (missing table/column) or data/vocab type-family mismatch → a **WARN** row (never silent INFO-skip). `vocab_size=0` → INFO. Adding a triple = one matrix entry; no new step, no new display. *(Deferred: per-triple threshold overrides; the per-step SDK `cov_*` auto-injection; the Step-Output row Inspector — see `docs/reports/transparency-step-output-observability-design-brief.md`.)*

---

## 5. Mobile & Responsive Behavior

This script emits **no `audit_table.columns`**, so FreshnessTimeline renders its output via the **legacy metric-row renderer** (the columnar `<table>` path is for scripts that DO emit `columns[]`):
- Each row renders as a `{ metric, value, threshold, status }` line (metric label + value + traffic-light status dot: PASS green / WARN amber / FAIL red / INFO blue).
- Step attribution is read from the metric label suffix (e.g. `… (Step 13 — classify_permits)`), not a separate column.
- Standard mobile sizing (`text-[10px]` base, `md:text-xs`) applies to the metric-row list.
- *(The columnar render path remains available for other audit scripts that opt into `audit_table.columns`; assert-global-coverage deliberately does not — see §3 "P3 fix".)*

---

## 6. Operating Boundaries

### Target Files
- `scripts/quality/assert-global-coverage.js` (new)
- `migrations/101_logic_variables_coverage_thresholds.sql` (new — seed data only)
- `scripts/manifest.json` (register + wire into permits + coa chains)
- `docs/specs/pipeline/41_chain_permits.md` (add step 27)
- `docs/specs/pipeline/42_chain_coa.md` (add step 12)
- `src/tests/assert-global-coverage.infra.test.ts` (new)
- `src/components/FreshnessTimeline.tsx` (metric-row render path — no change needed; rows are `{metric,value,threshold,status}`)

### Out-of-Scope Files
- Any script being PROFILED — this script only reads their output, never modifies them
- `src/lib/` TypeScript modules — pipeline-only scope

### Cross-Spec Dependencies
- **Relies on:** `47_pipeline_script_protocol.md` (advisory lock, SDK skeleton, Zod validation)
- **Relies on:** `40_pipeline_system.md` (emitSummary contract, records_total semantics)
- **Relies on:** `41_chain_permits.md` + `42_chain_coa.md` (step ordering)
- **Consumed by:** FreshnessTimeline via the metric-row renderer (`{metric,value,threshold,status}`) — this script emits no `columns[]`
- **Consumed by:** Spec 79 §6.1 as the chain-end validation cap — every Spec 79 run finishes with this profile per chain, and the profile output becomes the final coverage gate.
