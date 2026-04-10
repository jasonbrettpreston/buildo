# Active Task: Wire compute-cost-estimates + compute-timing-calibration into permits pipeline chain
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement
**Domain Mode:** **Backend/Pipeline**

## Context
* **Goal:** Register `compute_cost_estimates` and `compute_timing_calibration` as pipeline steps in the daily permits chain. Both scripts already exist and work (Pipeline SDK compliant), but are invisible to the chain orchestrator and admin dashboard — no audit tables, no DB observability, no error reporting, no DataFlowTile integration.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`, `docs/specs/pipeline/41_chain_permits.md`, `docs/specs/pipeline/30_pipeline_architecture.md`, `docs/specs/product/future/71_lead_timing_engine.md`, `docs/specs/product/future/72_lead_cost_model.md`
* **Key Files:**
  - `scripts/manifest.json` — add script entries + chain placement
  - `scripts/run-chain.js` — modify `isInfraStep` to cover `compute_*` slugs
  - `scripts/compute-cost-estimates.js` — add emitSummary on advisory lock early return + fix header comment
  - `scripts/compute-timing-calibration.js` — add defensive try/catch for missing permit_inspections
  - `scripts/refresh-snapshot.js` — add cost/timing queries + fix snapshotPhase 14→18
  - `scripts/quality/assert-data-bounds.js` — add cost/timing checks inside `runPermitChecks` guard
  - `src/components/FreshnessTimeline.tsx` — add to PIPELINE_REGISTRY + PIPELINE_CHAINS
  - `src/lib/admin/funnel.ts` — add to PIPELINE_TABLE_MAP
  - `src/tests/chain.logic.test.ts` — update step counts + add new assertions
  - `src/tests/quality.logic.test.ts` — add PIPELINE_TABLE_MAP assertions
  - `migrations/NNN_cost_timing_snapshot_columns.sql` — new snapshot columns

## Why permits chain (not sources)
The sources chain runs **quarterly** (reference data: address_points, parcels, massing, neighbourhoods). Cost estimates and timing calibration depend on **daily permit data** — new permits arrive daily and need fresh scoring for the lead feed. The permits chain runs daily during the week, making it the correct home.

**Cross-chain data dependency:** `compute_cost_estimates` LEFT JOINs `parcels`, `building_footprints`, `neighbourhoods` — these are loaded by the sources chain. On first-ever deploy before sources has run, all JOINs return NULL and the cost model produces `estimated_cost: null` (fallback path). This is safe but means the sources chain must run at least once before cost estimates produce non-null model values. The `assert_data_bounds` coverage check surfaces this.

## Chain placement rationale
**Proposed permits chain order (20 steps, was 18):**
```
assert_schema → permits → close_stale_permits → classify_permit_phase →
classify_scope → builders → link_wsib → geocode_permits → link_parcels →
link_neighbourhoods → link_massing → link_similar → classify_permits →
+ compute_cost_estimates        ← NEW step 14 (more resilient — row-level error handling)
+ compute_timing_calibration    ← NEW step 15 (aggregate query — if it fails, cost data is safe)
link_coa → create_pre_permits → refresh_snapshot → assert_data_bounds →
assert_engine_health
```

**Why cost before timing:** `compute_cost_estimates` has row-level error handling (continues on batch failure). `compute_timing_calibration` can throw fatally if `permit_inspections` table is missing (fresh deploy). Ordering cost first ensures cost data is saved even if timing crashes the chain. They are otherwise independent — no data dependency between them.

## Technical Implementation

### Reviewer-identified fixes (from code review + adversarial review):

**FIX 1 — BLOCKER: Gate-skip bypass (`scripts/run-chain.js`)**
Line 207: `isInfraStep` predicate must include `compute_*` slugs so they always run even when permits gate-skip triggers (0 new permits). Add `|| slug.startsWith('compute_')`.

**FIX 2 — BLOCKER: Advisory lock early-return telemetry (`scripts/compute-cost-estimates.js`)**
Line 353: early `return` skips `emitSummary()`. Add `pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 })` before the return. Update header comment (line 10) from "inside the sources chain" to "inside the permits chain".

**FIX 3 — HIGH: Defensive catch for missing permit_inspections (`scripts/compute-timing-calibration.js`)**
Lines 67-73: if `permit_inspections` table doesn't exist, the query throws fatally and halts the entire chain. Add try/catch that converts missing-table error to WARN + clean exit (0).

**FIX 4 — HIGH: snapshotPhase renumbering (`scripts/refresh-snapshot.js`)**
Line 418: hardcoded `14` for permits chain → update to `18` (2 new steps shift refresh_snapshot position).

**FIX 5 — HIGH: assert-data-bounds chain scoping (`scripts/quality/assert-data-bounds.js`)**
New cost/timing checks must be placed inside the existing `if (runPermitChecks)` guard (line 66) to prevent running in coa/sources/deep_scrapes chains.

**FIX 6 — MEDIUM: Timing calibration staleness check**
`assert-data-bounds.js` should check `timing_calibration.computed_at` for staleness (>48h when `permit_inspections` is non-empty = WARN), not just row count.

### Registry & UI wiring:

**7. `scripts/manifest.json`**
- Add `compute_cost_estimates` script entry with `telemetry_tables: ["cost_estimates"]`, `telemetry_null_cols: { "cost_estimates": ["estimated_cost"] }`
- Add `compute_timing_calibration` script entry with `telemetry_tables: ["timing_calibration"]`
- Insert both slugs into `chains.permits` array after `classify_permits`, before `link_coa`

**8. `src/components/FreshnessTimeline.tsx`**
- Add both to `PIPELINE_REGISTRY` under group `'classify'`
- Insert both into `PIPELINE_CHAINS` permits chain steps after `classify_permits` (indent: 1)

**9. `src/lib/admin/funnel.ts`**
- Add to `PIPELINE_TABLE_MAP`: `compute_cost_estimates: 'cost_estimates'`, `compute_timing_calibration: 'timing_calibration'`

### Observability (migration + snapshot + CQA):

**10. New migration: `migrations/NNN_cost_timing_snapshot_columns.sql`**
- All columns NULLABLE (DEFAULT NULL) for backward compatibility:
  - `cost_estimates_total INTEGER`
  - `cost_estimates_from_permit INTEGER`
  - `cost_estimates_from_model INTEGER`
  - `cost_estimates_null_cost INTEGER`
  - `timing_calibration_total INTEGER`
  - `timing_calibration_avg_sample INTEGER`
  - `timing_calibration_freshness_hours NUMERIC(6,1)`
- DOWN block: `ALTER TABLE data_quality_snapshots DROP COLUMN ...` for each

**11. `scripts/refresh-snapshot.js`**
- Add cost_estimates + timing_calibration queries
- Extend INSERT columns, VALUES ($62-$68), and ON CONFLICT SET clause — 3 places that must stay in sync
- Fix snapshotPhase as per FIX 4

**12. `scripts/quality/assert-data-bounds.js`**
- Inside `if (runPermitChecks)` guard:
  - cost_estimates: NULL rate on estimated_cost > 80% → WARN, cost_tier distribution (≥2 tiers) → PASS
  - timing_calibration: zero rows → WARN, stale computed_at > 48h (when permit_inspections non-empty) → WARN

### Spec updates:

**13. `docs/specs/pipeline/41_chain_permits.md`**
- Step count 18→20, chain topology diagram, step breakdown table (insert steps 14-15, renumber 14-18→16-20)
- Testing mandate "all 18 scripts"→"all 20 scripts", operating boundaries "All 18"→"All 20"
- Add `permit_inspections` as cross-chain dependency (populated by deep_scrapes chain)

**14. `docs/specs/pipeline/40_pipeline_system.md`**
- §4.2 chain definition (add to permits array), §4.3 script registry table (add 2 rows, count 33→35)

**15. `docs/specs/pipeline/30_pipeline_architecture.md`**
- §2.1 Mutators archetype list: add `compute-cost-estimates`, `compute-timing-calibration`

### Tests:

**16. `src/tests/chain.logic.test.ts`**
- Update permits chain step count: 18 → 20
- Add test: both slugs appear in permits chain
- Add test: `compute_cost_estimates` before `compute_timing_calibration` before `link_coa`
- Add test: `isInfraStep` covers `compute_*` prefix (source-level assertion on run-chain.js)

**17. `src/tests/quality.logic.test.ts`**
- Add `PIPELINE_TABLE_MAP` assertions for both new entries
- Add assertions that refresh-snapshot.js queries cost_estimates and timing_calibration
- Add assertions that assert-data-bounds.js checks cost_estimates and timing_calibration

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified
* **Unhappy Path Tests:** Chain ordering, gate-skip bypass, advisory lock early return, empty permit_inspections, stale calibration, cost NULL rate thresholds
* **logError Mandate:** N/A — scripts already use `pipeline.log.error`
* **Mobile-First:** N/A — backend-only
* **Migration:** UP adds NULLABLE columns (backward-compatible). DOWN drops them. No backfill needed.

## Execution Plan
- [ ] **State Verification:** Done — both scripts exist, use Pipeline SDK. Neither registered in manifest.
- [ ] **Contract Definition:** N/A — no API route changes
- [ ] **Spec Update:** Update 41_chain_permits, 40_pipeline_system, 30_pipeline_architecture. Run `npm run system-map`.
- [ ] **Schema Evolution:** Write migration, `npm run migrate && npm run db:generate && npm run typecheck`.
- [ ] **Guardrail Test:** Add tests for chain membership, step count, ordering, gate-skip, PIPELINE_TABLE_MAP
- [ ] **Red Light:** Verify new tests fail before implementation
- [ ] **Implementation:** All 15 file changes listed above
- [ ] **UI Regression Check:** `npx vitest run src/tests/admin.ui.test.tsx`
- [ ] **Pre-Review Self-Checklist:**
  1. Does `isInfraStep` in run-chain.js now cover `compute_*`?
  2. Does compute-cost-estimates.js emit PIPELINE_SUMMARY on advisory lock early return?
  3. Does compute-timing-calibration.js survive missing `permit_inspections` table?
  4. Is `snapshotPhase` updated to 18 in refresh-snapshot.js?
  5. Are assert-data-bounds checks inside `runPermitChecks` guard?
  6. Do all 3 places in refresh-snapshot.js INSERT stay in sync ($62-$68)?
  7. Are migration columns all NULLABLE?
  8. Is cost ordered before timing in the chain?
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
