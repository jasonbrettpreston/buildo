# Spec 49 — Global Data Completeness Profile

**Status:** Active  
**Script:** `scripts/quality/assert-global-coverage.js`  
**Advisory Lock ID:** 111  

---

## 1. Goal & User Story

As a pipeline operator, I want a single authoritative field-level coverage report at the end of every chain run — so I can tell at a glance what fraction of permits, CoA applications, and enrichment records have been fully processed by each step, without manually cross-referencing multiple assert scripts.

---

## 2. Architecture

**Placement:**
- Permits chain: step 27 (last step, after assert_entity_tracing)
- CoA chain: step 12 (last step, after assert_lifecycle_phase_distribution)

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
2. Load and Zod-validate both threshold variables.
3. Run coverage queries (grouped by table using `COUNT(*) FILTER (WHERE ...)` expressions).
4. Build `CoverageRow[]` — one row per step/field combination.
5. INFO rows (quality steps, count-only metrics) always get `status: 'INFO'`, `coverage_pct: null`.
6. Compute `verdict` = worst non-INFO status across all rows (PASS if no WARN/FAIL).
7. `emitSummary({ records_total: 1, ... })` — `records_total` is ALWAYS 1 (one audit pass).

### Zod Schema
```js
const LOGIC_VARS_SCHEMA = z.object({
  profiling_coverage_pass_pct: z.number().int().min(0).max(100),
  profiling_coverage_warn_pct: z.number().int().min(0).max(100),
}).refine(d => d.profiling_coverage_warn_pct < d.profiling_coverage_pass_pct, {
  message: 'warn_pct must be strictly less than pass_pct',
});
```

### Output: columnar audit_table
```js
{
  records_total: 1,
  records_new: 0,
  records_updated: 0,
  records_meta: {
    audit_table: {
      name: 'Global Data Completeness Profile',
      verdict: 'PASS' | 'WARN' | 'FAIL',
      columns: ['step_target', 'field', 'populated', 'denominator', 'coverage_pct', 'status'],
      rows: [
        { step_target: 'Step 2 — load_permits', field: 'permits.description',
          populated: 231000, denominator: 237000, coverage_pct: 97.5, status: 'PASS' },
        // ... one row per step/field in matrix
      ]
    }
  }
}
```

### Edge Cases
- `denominator = 0` → `coverage_pct = null`, `status = 'INFO'` (nothing to measure)
- Advisory lock held → emit skip payload, `records_total: 0`, `reason: 'lock_held'`
- `profiling_coverage_warn_pct` missing from logic_variables → Zod throws (halting)
- Zero real permits in DB → all rows emit `populated: 0`, `coverage_pct: 0`, `status: 'FAIL'`

---

## 4. Denominator Matrix

All permit-based denominators exclude PRE-% synthetic permits: `permit_num NOT LIKE 'PRE-%'`.  
"All real permits" = the count above.

**Step 17 pre_permit_leads denominator (F2):** Uses `coa_approved_unlinked` (`decision='Approved' AND linked_permit_num IS NULL`) — the actionable population that `create_pre_permits` actually processes. The prior denominator `coa_approved_total` caused a persistent false-FAIL (~0.5%) because it included CoAs already linked to real permits (not eligible for pre-permit creation). The ratio can theoretically exceed 100% if pre-permits were created for CoAs that were subsequently linked, but `create_pre_permits` deactivates pre-permits on linking, so counts converge in practice.

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
| Step 17 — create_pre_permits | permits.pre_permit_leads | `COUNT(*) FROM permits WHERE permit_num LIKE 'PRE-%'` | `COUNT(*) FROM coa_applications WHERE decision='Approved' AND linked_permit_num IS NULL` |
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
| CoA Step 5 — create_pre_permits | permits.pre_permit_leads | `COUNT(DISTINCT permit_num) WHERE permit_num LIKE 'PRE-%'` | `COUNT(*) FROM coa_applications WHERE decision='Approved' AND linked_permit_num IS NULL` (F2: unlinked = actionable denominator) |
| CoA Step 6 — assert_pre_permit_aging | permits.aged_pre_permits | `permit_num LIKE 'PRE-%' AND issued_date < NOW() - INTERVAL '18 months'` | `COUNT(*) FROM permits WHERE permit_num LIKE 'PRE-%'` (INFO) |
| CoA Step 7 — refresh_snapshot | data_quality_snapshots.today | same as P18 | 1 (INFO) |
| CoA Step 8 — assert_data_bounds | coa_applications.duplicate_pks | duplicate `application_number` pairs | 0 expected (INFO) |
| CoA Step 9 — assert_engine_health | engine_health_snapshots.today | same as P20 | ≥ 1 expected (INFO) |
| CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_phase | `lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL` | `COUNT(*) FROM coa_applications WHERE linked_permit_num IS NULL` (unlinked only — classifier assigns P1/P2 only to unlinked apps) |
| CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_stalled | `lifecycle_stalled = true AND linked_permit_num IS NULL` | `COUNT(*) WHERE lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL` (INFO — `BOOLEAN NOT NULL DEFAULT false`; shows count of stalled classified apps) |
| CoA Step 10 — classify_lifecycle_phase | coa_applications.lifecycle_classified_at | `lifecycle_classified_at IS NOT NULL AND linked_permit_num IS NULL` | `COUNT(*) FROM coa_applications WHERE linked_permit_num IS NULL` (unlinked only) |
| CoA Step 11 — assert_lifecycle_phase_distribution | coa_applications.unclassified_count | `lifecycle_phase IS NULL` | `COUNT(*) FROM coa_applications` (INFO: target = 0) |

---

## 5. Mobile & Responsive Behavior

FreshnessTimeline renders this script's output using the new columnar audit_table render path:
- Detects `audit_table.columns` array → renders `<table>` with `<thead>` from columns, `<tbody>` from rows
- `overflow-x-auto` wrapper on mobile (375px), `text-[10px]` base size, `md:text-xs` desktop
- Sticky `step_target` column at 375px (`sticky left-0 bg-white`)
- Status cell: PASS = green dot, WARN = amber dot, FAIL = red dot, INFO = blue dot
- Falls back to existing metric-row renderer when `audit_table.columns` is absent

---

## 6. Operating Boundaries

### Target Files
- `scripts/quality/assert-global-coverage.js` (new)
- `migrations/101_logic_variables_coverage_thresholds.sql` (new — seed data only)
- `scripts/manifest.json` (register + wire into permits + coa chains)
- `docs/specs/pipeline/41_chain_permits.md` (add step 27)
- `docs/specs/pipeline/42_chain_coa.md` (add step 12)
- `src/tests/assert-global-coverage.infra.test.ts` (new)
- `src/components/FreshnessTimeline.tsx` (columnar render path)

### Out-of-Scope Files
- Any script being PROFILED — this script only reads their output, never modifies them
- `src/lib/` TypeScript modules — pipeline-only scope

### Cross-Spec Dependencies
- **Relies on:** `47_pipeline_script_protocol.md` (advisory lock, SDK skeleton, Zod validation)
- **Relies on:** `40_pipeline_system.md` (emitSummary contract, records_total semantics)
- **Relies on:** `41_chain_permits.md` + `42_chain_coa.md` (step ordering)
- **Consumed by:** FreshnessTimeline via columnar audit_table render path (Spec 28)
