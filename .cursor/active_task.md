# Active Task: Global Data Completeness Profile
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis
**Rollback Anchor:** `cdc6ea5`

---

## Context
* **Goal:** Build `assert-global-coverage.js` — a chain-aware, non-halting CQA script that runs at the end of both the permits chain (new step 27) and the CoA chain (new step 12). It queries field-level coverage for every table/column written by every upstream step, building a single columnar audit_table with PASS/WARN/FAIL thresholds sourced from logic_variables. Eliminates the confusion between "what did this run do" vs. "what does the database currently contain" by providing an authoritative completeness view after every run.
* **Target Spec:** `docs/specs/pipeline/49_data_completeness_profiling.md` (to be created in Step 1)
* **Key Files:**
  - `scripts/quality/assert-global-coverage.js` — new coverage script
  - `migrations/101_logic_variables_coverage_thresholds.sql` — seed coverage threshold vars
  - `src/tests/assert-global-coverage.infra.test.ts` — denominator enforcement + shape tests
  - `scripts/manifest.json` — register script + wire into both chains
  - `docs/specs/pipeline/41_chain_permits.md` — add step 27
  - `docs/specs/pipeline/42_chain_coa.md` — add step 12
  - `src/components/FreshnessTimeline.tsx` — add columnar audit_table render path

---

## Technical Implementation

### Advisory Lock
`ADVISORY_LOCK_ID = 111` — next available after 110 (assert-entity-tracing) and 109 (assert-lifecycle-phase-distribution). Registered in spec 47 §A.5.

### Chain Placement
- Permits chain: step 27 (after assert_entity_tracing, step 26). Non-halting.
- CoA chain: step 12 (after assert_lifecycle_phase_distribution, step 11). Non-halting.
- Chain-aware via `process.env.PIPELINE_CHAIN`: `permits` → full profile (all 27 steps); `coa` → CoA-scoped subset only.

### Logic Variables (thresholds — externalized per spec 47)
Two new rows seeded in migration 101:
- `profiling_coverage_pass_pct`: 90 — coverage ≥ 90% → PASS
- `profiling_coverage_warn_pct`: 70 — coverage 70–89% → WARN; < 70% → FAIL

Zod schema validates both are integers 0–100 and warn < pass.

### emitSummary Contract (anti-pattern enforcement)
```js
pipeline.emitSummary({
  records_total: 1,       // 1 audit pass, not a DB entity count
  records_new: 0,
  records_updated: 0,
  records_meta: {
    audit_table: {
      name: 'Global Data Completeness Profile',
      verdict: 'PASS|WARN|FAIL',          // worst row status
      columns: ['step_target','field','populated','denominator','coverage_pct','status'],
      rows: [{ step_target, field, populated, denominator, coverage_pct, status }]
    }
  }
});
```
`records_total: 1` is mandatory — never a DB total. `verdict` is the worst status across all rows.

### SKIP_PHASES constant
`('P19','P20','O1','O2','O3','P1','P2')` — must stay in sync with compute-trade-forecasts.js.

---

## Comprehensive Denominator Matrix

All permit-based denominators exclude PRE-% synthetic permits unless otherwise noted.
"All real permits" = `permit_num NOT LIKE 'PRE-%'`.
Status computed per row using `profiling_coverage_pass_pct` / `profiling_coverage_warn_pct` from logic_variables.
Count-only rows (quality/assert steps) use `status: 'INFO'` and `coverage_pct: null`.

### Permits Chain — Full Profile (Steps 1–26 + Step 27 self)

| Step | step_target | field | populated condition | denominator |
|------|------------|-------|---------------------|-------------|
| P1 | Step 1 — assert_schema | permits_columns_validated | columns present in information_schema for permits table | COUNT of expected permits columns |
| P2 | Step 2 — load_permits | permits.description | `description IS NOT NULL` | all real permits |
| P2 | Step 2 — load_permits | permits.builder_name | `builder_name IS NOT NULL` | all real permits |
| P2 | Step 2 — load_permits | permits.est_const_cost | `est_const_cost IS NOT NULL` | all real permits |
| P2 | Step 2 — load_permits | permits.issued_date | `issued_date IS NOT NULL` | all real permits |
| P2 | Step 2 — load_permits | permits.geo_id | `geo_id IS NOT NULL AND geo_id != ''` | all real permits |
| P3 | Step 3 — close_stale_permits | permits.enriched_status (stale) | `enriched_status = 'Complete'` | permits with `last_seen_at < NOW() - INTERVAL '30 days'` |
| P4 | Step 4 — classify_permit_phase | permits.enriched_status (phase) | `enriched_status IS NOT NULL` | all real permits |
| P5 | Step 5 — classify_scope | permits.project_type | `project_type IS NOT NULL` | all real permits |
| P5 | Step 5 — classify_scope | permits.scope_tags | `array_length(scope_tags, 1) > 0` | all real permits |
| P5 | Step 5 — classify_scope | permits.scope_classified_at | `scope_classified_at IS NOT NULL` | all real permits |
| P5 | Step 5 — classify_scope | permits.scope_source | `scope_source IS NOT NULL` | all real permits |
| P6 | Step 6 — extract_builders | entities.name_normalized | `name_normalized IS NOT NULL` (all entities have it) | `COUNT(DISTINCT builder_name) FROM permits WHERE builder_name IS NOT NULL AND permit_num NOT LIKE 'PRE-%'` |
| P6 | Step 6 — extract_builders | entities.primary_phone | `primary_phone IS NOT NULL` | `COUNT(*) FROM entities` |
| P6 | Step 6 — extract_builders | entities.primary_email | `primary_email IS NOT NULL` | `COUNT(*) FROM entities` |
| P7 | Step 7 — link_wsib | entities.is_wsib_registered | `is_wsib_registered = true` | `COUNT(*) FROM entities` |
| P7 | Step 7 — link_wsib | wsib_registry.linked_entity_id | `linked_entity_id IS NOT NULL` | `COUNT(*) FROM wsib_registry` |
| P7 | Step 7 — link_wsib | wsib_registry.match_confidence | `match_confidence IS NOT NULL` | `COUNT(*) FROM wsib_registry WHERE linked_entity_id IS NOT NULL` |
| P8 | Step 8 — geocode_permits | permits.latitude | `latitude IS NOT NULL` | `geo_id IS NOT NULL AND geo_id != '' AND permit_num NOT LIKE 'PRE-%'` (geocode-permits.js WHERE clause) |
| P8 | Step 8 — geocode_permits | permits.longitude | `longitude IS NOT NULL` | same as latitude |
| P9 | Step 9 — link_parcels | permit_parcels.parcel_id (linked permits) | `COUNT(DISTINCT permit_num\|\|revision_num) FROM permit_parcels` | real permits with `latitude IS NOT NULL AND longitude IS NOT NULL` |
| P10 | Step 10 — link_neighbourhoods | permits.neighbourhood_id | `neighbourhood_id IS NOT NULL AND neighbourhood_id != -1` | all real permits |
| P11 | Step 11 — link_massing | parcel_buildings (linked parcels) | `COUNT(DISTINCT parcel_id) FROM parcel_buildings` | `COUNT(*) FROM parcels WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL` (link-massing.js processes parcels, not permits) |
| P12 | Step 12 — link_similar | permits.scope_tags (BLD-propagated companion count) | companion permits `(HVA,PLB,DRN)` with scope_tags populated | BLD permits with scope_tags at addresses that also have companion permits |
| P13 | Step 13 — classify_permits | permit_trades (active trade per permit) | `COUNT(DISTINCT permit_num\|\|revision_num) FROM permit_trades WHERE is_active = true` | all real permits |
| P14 | Step 14 — compute_cost_estimates | cost_estimates.estimated_cost | `estimated_cost IS NOT NULL` | all real permits (compute-cost-estimates.js SOURCE_SQL has no eligibility gate) |
| P15 | Step 15 — compute_timing_calibration_v2 | phase_calibration rows | `COUNT(*) FROM phase_calibration WHERE median_days IS NOT NULL` | `COUNT(DISTINCT from_phase, to_phase, permit_type) FROM phase_calibration` |
| P16 | Step 16 — link_coa (permits chain) | coa_applications.linked_permit_num | `linked_permit_num IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| P16 | Step 16 — link_coa (permits chain) | coa_applications.linked_confidence | `linked_confidence IS NOT NULL` | `COUNT(*) FROM coa_applications WHERE linked_permit_num IS NOT NULL` |
| P17 | Step 17 — create_pre_permits | permits PRE-% leads | `COUNT(*) FROM permits WHERE permit_num LIKE 'PRE-%'` | `COUNT(*) FROM coa_applications WHERE decision = 'Approved' AND linked_permit_num IS NULL` |
| P18 | Step 18 — refresh_snapshot | data_quality_snapshots.snapshot_date | `COUNT(*) FROM data_quality_snapshots WHERE snapshot_date = CURRENT_DATE` | 1 (one snapshot expected per run day) |
| P19 | Step 19 — assert_data_bounds | duplicate_permit_pks (should be 0) | `COUNT(*) FROM (SELECT permit_num, revision_num, COUNT(*) FROM permits GROUP BY 1,2 HAVING COUNT(*) > 1) sub` | 0 expected (INFO row — non-zero = FAIL) |
| P20 | Step 20 — assert_engine_health | engine_health_snapshots rows (today) | `COUNT(*) FROM engine_health_snapshots WHERE recorded_at > NOW() - INTERVAL '25 hours'` | expected ≥ 1 row per run (INFO) |
| P21 | Step 21 — classify_lifecycle_phase | permits.lifecycle_phase | `lifecycle_phase IS NOT NULL` | all real permits |
| P21 | Step 21 — classify_lifecycle_phase | permits.phase_started_at | `phase_started_at IS NOT NULL` | real permits with `lifecycle_phase IS NOT NULL` |
| P21 | Step 21 — classify_lifecycle_phase | permits.lifecycle_classified_at | `lifecycle_classified_at IS NOT NULL` | all real permits |
| P21 | Step 21 — classify_lifecycle_phase | coa_applications.lifecycle_phase | `lifecycle_phase IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| P21 | Step 21 — classify_lifecycle_phase | permit_phase_transitions (recent) | `COUNT(*) FROM permit_phase_transitions WHERE transitioned_at > NOW() - INTERVAL '25 hours'` | INFO: transitions logged today |
| P22 | Step 22 — assert_lifecycle_phase_distribution | permits.lifecycle_phase (unclassified rate) | `lifecycle_phase IS NULL AND permit_num NOT LIKE 'PRE-%'` | all real permits (unclassified count — INFO, target = 0) |
| P23 | Step 23 — compute_trade_forecasts | trade_forecasts.predicted_start | `predicted_start IS NOT NULL` | `JOIN permit_trades pt ON pt.is_active = true JOIN permits p ON lifecycle_phase IS NOT NULL AND phase_started_at IS NOT NULL AND lifecycle_phase NOT IN ('P19','P20','O1','O2','O3','P1','P2')` — compute-trade-forecasts.js SOURCE_SQL exactly |
| P23 | Step 23 — compute_trade_forecasts | trade_forecasts.urgency | `urgency IS NOT NULL` | `COUNT(*) FROM trade_forecasts` |
| P23 | Step 23 — compute_trade_forecasts | trade_forecasts.calibration_method | `calibration_method IS NOT NULL` | `COUNT(*) FROM trade_forecasts` |
| P24 | Step 24 — compute_opportunity_scores | trade_forecasts.opportunity_score | `opportunity_score > 0` | `COUNT(*) FROM trade_forecasts WHERE urgency IS NULL OR urgency <> 'expired'` — compute-opportunity-scores.js WHERE clause exactly |
| P25 | Step 25 — update_tracked_projects | tracked_projects (non-archived) | `COUNT(*) FROM tracked_projects WHERE status != 'archived'` | `COUNT(*) FROM tracked_projects` (INFO: active vs total) |
| P25 | Step 25 — update_tracked_projects | lead_analytics rows | `COUNT(*) FROM lead_analytics` | `COUNT(*) FROM tracked_projects` (INFO: analytics coverage per tracked project) |
| P26 | Step 26 — assert_entity_tracing | entity_trace last_verdict | most recent assert_entity_tracing pipeline_run verdict | 1 check (INFO: PASS/WARN/FAIL summary) |

### CoA Chain — Scoped Subset (chain-aware, PIPELINE_CHAIN=coa)

| Step | step_target | field | populated condition | denominator |
|------|------------|-------|---------------------|-------------|
| C1 | CoA Step 1 — assert_schema | coa_columns_validated | CoA columns present in information_schema | COUNT of expected CoA CKAN columns |
| C2 | CoA Step 2 — load_coa | coa_applications.address | `address IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| C2 | CoA Step 2 — load_coa | coa_applications.ward | `ward IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| C2 | CoA Step 2 — load_coa | coa_applications.decision | `decision IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| C2 | CoA Step 2 — load_coa | coa_applications.application_number | `application_number IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| C3 | CoA Step 3 — assert_coa_freshness | days_since_latest_coa | `EXTRACT(days FROM NOW() - MAX(created_at)) FROM coa_applications` | threshold = 45 days (INFO: > 45 = WARN) |
| C4 | CoA Step 4 — link_coa | coa_applications.linked_permit_num | `linked_permit_num IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| C4 | CoA Step 4 — link_coa | coa_applications.linked_confidence | `linked_confidence IS NOT NULL` | `COUNT(*) FROM coa_applications WHERE linked_permit_num IS NOT NULL` |
| C5 | CoA Step 5 — create_pre_permits | permits PRE-% leads | `COUNT(*) FROM permits WHERE permit_num LIKE 'PRE-%'` | `COUNT(*) FROM coa_applications WHERE decision = 'Approved' AND linked_permit_num IS NULL` |
| C6 | CoA Step 6 — assert_pre_permit_aging | aged_pre_permits (>18 months) | `COUNT(*) FROM permits WHERE permit_num LIKE 'PRE-%' AND issued_date < NOW() - INTERVAL '18 months'` | `COUNT(*) FROM permits WHERE permit_num LIKE 'PRE-%'` (INFO: high aged count = WARN) |
| C7 | CoA Step 7 — refresh_snapshot | data_quality_snapshots.snapshot_date | same as P18 | 1 |
| C8 | CoA Step 8 — assert_data_bounds | duplicate_coa_pks | `COUNT(*) FROM (SELECT application_number, COUNT(*) FROM coa_applications GROUP BY 1 HAVING COUNT(*) > 1) sub` | 0 expected (INFO) |
| C9 | CoA Step 9 — assert_engine_health | engine_health_snapshots rows (today) | same as P20 | ≥ 1 expected |
| C10 | CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_phase | `lifecycle_phase IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| C10 | CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_stalled | `lifecycle_stalled IS NOT NULL` | `COUNT(*) FROM coa_applications WHERE lifecycle_phase IS NOT NULL` |
| C10 | CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_classified_at | `lifecycle_classified_at IS NOT NULL` | `COUNT(*) FROM coa_applications` |
| C11 | CoA Step 11 — assert_lifecycle_phase_distribution | coa_unclassified_count | `lifecycle_phase IS NULL` | `COUNT(*) FROM coa_applications` (INFO: unclassified target = 0) |

---

## Implementation Architecture

### Query Consolidation Strategy
Group all per-table metrics into a single SQL SELECT with `COUNT(*) FILTER (WHERE ...)` expressions to minimize round trips:

```sql
-- Permits coverage block (one query, many metrics)
SELECT
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%') AS permits_total,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND description IS NOT NULL) AS description_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND builder_name IS NOT NULL) AS builder_name_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND est_const_cost IS NOT NULL) AS est_cost_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND issued_date IS NOT NULL) AS issued_date_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND geo_id IS NOT NULL AND geo_id != '') AS geo_id_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND enriched_status IS NOT NULL) AS enriched_status_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND project_type IS NOT NULL) AS project_type_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND scope_classified_at IS NOT NULL) AS scope_classified_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND scope_source IS NOT NULL) AS scope_source_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND latitude IS NOT NULL) AS lat_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND geo_id IS NOT NULL AND geo_id != '' AND latitude IS NULL) AS lat_ungeocodeable_denominator_gap,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND geo_id IS NOT NULL AND geo_id != '') AS geocodeable_total,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND neighbourhood_id IS NOT NULL AND neighbourhood_id != -1) AS neighbourhood_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND lifecycle_phase IS NOT NULL) AS lifecycle_phase_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND lifecycle_phase IS NOT NULL AND phase_started_at IS NOT NULL) AS phase_started_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND lifecycle_classified_at IS NOT NULL) AS lifecycle_classified_populated,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND lifecycle_phase IS NULL) AS unclassified_count,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND last_seen_at < NOW() - INTERVAL '30 days') AS stale_denominator,
  COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND last_seen_at < NOW() - INTERVAL '30 days' AND enriched_status = 'Complete') AS stale_closed
FROM permits
```

Estimated query count: ~8-10 queries total across all tables for full permits profile.
CoA subset: ~3-4 queries.

### Row Builder Design
```js
function coverageRow(stepTarget, field, populated, denominator, passPct, warnPct) {
  const coveragePct = denominator > 0 ? Math.round((populated / denominator) * 1000) / 10 : null;
  const status = coveragePct === null ? 'INFO'
    : coveragePct >= passPct ? 'PASS'
    : coveragePct >= warnPct ? 'WARN'
    : 'FAIL';
  return { step_target: stepTarget, field, populated, denominator, coverage_pct: coveragePct, status };
}

function infoRow(stepTarget, field, value, note) {
  return { step_target: stepTarget, field, populated: value, denominator: null, coverage_pct: null, status: 'INFO' };
}
```

### FreshnessTimeline Enhancement (frontend phase)
Detect `audit_table.columns` array → render as HTML `<table>` with `<thead>` from `columns` and `<tbody>` from `rows`. Status cell gets traffic-light icon: PASS=green, WARN=amber, FAIL=red, INFO=blue. `overflow-x-auto` wrapper for mobile. Sticky `step_target` column on mobile (375px). Falls back to existing metric-row renderer when `columns` is absent (zero regression risk).

### Database Impact
YES — migration 101 seeds two new `logic_variables` rows. No schema change (logic_variables table already exists). No backfill needed.

---

## Standards Compliance
* **Try-Catch Boundary:** N/A — `pipeline.run()` wraps the entire script; no new API routes
* **Unhappy Path Tests:** lock_held → skip; logic_variables missing → Zod throws; zero permits → emits empty rows; PIPELINE_CHAIN unset → defaults to full profile
* **logError Mandate:** N/A — no API catch blocks; pipeline.log used throughout
* **Mobile-First:** FreshnessTimeline columnar table: `overflow-x-auto`, `text-[10px]`, sticky first column on mobile

---

## Execution Plan
- [ ] **Contract Definition:** Define `CoverageRow` TypeScript shape in script header comment; define `infoRow()` vs `coverageRow()` builder functions. Document chain-aware branching contract.
- [ ] **Spec & Registry Sync:** Create `docs/specs/pipeline/49_data_completeness_profiling.md`. Update 41 + 42 chain specs (add step 27 / step 12). Register advisory lock 111 in spec 47 §A.5.
- [ ] **Schema Evolution:** Write `migrations/101_logic_variables_coverage_thresholds.sql` (UP: INSERT two logic_variable rows; DOWN: DELETE them). Run `npm run migrate`. `npm run db:generate`. `npm run typecheck`.
- [ ] **Manifest Wiring:** Add `assert_global_coverage` to `scripts/manifest.json` scripts registry AND append to both `permits` and `coa` chain arrays.
- [ ] **Test Scaffolding:** Create `src/tests/assert-global-coverage.infra.test.ts` with: (a) denominator enforcement regex tests — assert SQL contains SKIP_PHASES exclusion `('P19','P20','O1','O2','O3','P1','P2')`, `PRE-%` filter, `is_active = true` join for forecasts denominator, `urgency IS NULL OR urgency <> 'expired'` for opportunity score denominator, `centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL` for massing denominator; (b) payload shape tests — audit_table has `columns` array with all 6 keys, all rows have required keys, `records_total = 1`, verdict is one of PASS/WARN/FAIL.
- [ ] **Red Light:** Run `npx vitest run src/tests/assert-global-coverage.infra.test.ts` — MUST fail (file doesn't exist yet / SQL patterns absent).
- [ ] **Backend Implementation:** Write `scripts/quality/assert-global-coverage.js` — advisory lock 111, logic_variables load + Zod validation, all denominator queries per matrix above (consolidate with FILTER expressions), row builder, emitSummary with columnar audit_table. Chain-aware CoA subset via `process.env.PIPELINE_CHAIN`.
- [ ] **Frontend Implementation:** Update `FreshnessTimeline.tsx` — detect `at.columns`, render tabular grid for `columns`/`rows` format, status traffic-light icons, `overflow-x-auto`, `text-[10px]` for mobile, sticky `step_target` column. Falls back to existing renderer when `columns` absent.
- [ ] **Auth Boundary & Secrets:** N/A — no new API routes; no client components read pipeline secrets.
- [ ] **Pre-Review Self-Checklist:** For each denominator row in the matrix, verify the SQL gate condition in assert-global-coverage.js matches the source script's WHERE clause. Walk: SKIP_PHASES set, PRE-% exclusion, geocode gate, massing centroid gate, forecast eligibility gate, opportunity score urgency gate. Also verify FreshnessTimeline fallback path is intact and existing tests still pass.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
- [ ] **Adversarial Review:** Spawn adversarial agent with directive: "Your PRIMARY objective is to attack the denominator logic. Cross-reference denominators in assert-global-coverage.js against SOURCE_SQL of each originating script. If coverage script divides by a broader population than the originating script queried (e.g., using all permits instead of geocodeable permits for lat/lng), FAIL the review." Also spawn independent worktree review agent.
- [ ] **WF3 Triage:** Fix all CRITICAL/HIGH issues inline. Defer MEDIUM/LOW to `docs/reports/review_followups.md`.
- [ ] **Atomic Commit:** `feat(49_data_completeness_profiling): WF1 — global field-level coverage profile for permits + CoA chains`
