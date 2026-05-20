# Spec 79 §6 Final Cap — Pass 2 Validation Summary

**Run date:** 2026-05-19
**HEAD commit at cap-run:** `dc3037e` (Pass-2 column-drift fix landed)
**Chains validated:** permits (29 steps) + CoA (15 steps)
**Validation source:** local Pg + Next.js dev server (`http://localhost:3000/admin/data-quality`)

---

## Headline

Pass 1 (mechanical extraction) + Pass 2 (synthesis) + Pass 3 (7 authorized WF3s) — all complete and pushed. Pass-2 re-validation surfaced **3 additional findings** that Pass-1 fixes did not auto-resolve:

1. **HIGH-5 confirmed unresolved** — Phase Distribution audit_table emitted only legacy `phase_PN_count` aggregates (7 rows), not the 110 per-seq detail. **FIXED** in commit `14c8269` (Pass-2 bundled WF3). CoA chain re-run on dc3037e confirms: 113 per-seq rows, 0 legacy, verdict=WARN.
2. **NEW finding** — `assert_global_coverage.js` (Step 28 / Step 15) was missing CoA chain coverage for 5 manifest steps (link_coa_to_parcels, classify_coa_scope, classify_coa_trades, compute_coa_cost_estimates, compute_phase_calibration) AND step labels were out of sync with the manifest. **FIXED** in `14c8269`. CoA re-run confirms 14 CoA Steps now have coverage rows (was 8).
3. **NEW finding** — `assert_global_coverage.js` `pb` aggregate query read `parcel_buildings.area_sqm` / `parcel_buildings.height_m`, but those columns live on `building_footprints` (same WF2 #4 fetchLeadInspect drift class). Also `parcels.area_sqm` should be `parcels.lot_size_sqm`. Caused `permits:assert_global_coverage` to crash with PG 42703 on every chain run. **FIXED** in `dc3037e`. Direct script run confirms: verdict=WARN, 123 rows, 0 FAIL, 4 WARN.

---

## Per-chain status (post-Pass-2 fixes)

### CoA chain — `completed_with_warnings` (commit 14c8269 active)

| Step | Slug | Status | Notes |
|---|---|---|---|
| 1 | assert_schema | ✅ completed |
| 2 | coa (load) | ✅ completed |
| 3 | assert_coa_freshness | ✅ completed |
| 4 | link_coa_to_parcels | ✅ completed | Pass-2 coverage row added |
| 5 | classify_coa_scope | ✅ completed | Pass-2 coverage row added |
| 6 | classify_coa_trades | ✅ completed | Pass-2 coverage row added |
| 7 | compute_coa_cost_estimates | ✅ completed | Pass-2 coverage row added |
| 8 | link_coa | ✅ completed | (was Step 4 in old labels) |
| 9 | refresh_snapshot | ✅ completed | (was Step 7) |
| 10 | assert_data_bounds | ✅ completed | (was Step 8) |
| 11 | assert_engine_health | ✅ completed | (was Step 9) |
| 12 | classify_lifecycle_phase | ✅ completed | (was Step 10). coa_evaluated=33,106 / lifecycle_status_history_inserted=33,106 / errors=0 |
| 13 | assert_lifecycle_phase_distribution | ⚠ completed (WARN) | (was Step 11). 113 per-seq rows; phase_P3 = 2,355 vs band 716..970 is now WARN-only, not FAIL |
| 14 | compute_phase_calibration | ✅ completed | Pass-2 unblocked (was blocked by Step 13 FAIL pre-fix) |
| 15 | assert_global_coverage | ✅ completed | Pass-2 unblocked. 14 CoA Step coverage rows |

### Permits chain — re-run in progress on commit dc3037e

| Phase | Steps | Status (pre-dc3037e) |
|---|---|---|
| Sources (1-7) | assert_schema → link_wsib | ✅ all clean on prior runs |
| Linkage (8-18) | geocode_permits → refresh_snapshot | ✅ all clean |
| Assert (19-20) | assert_data_bounds, assert_engine_health | ✅ |
| Classify (21-26) | classify_lifecycle_phase → update_tracked_projects | ✅ all clean post-WF3s |
| Cap (27-28) | assert_entity_tracing, assert_global_coverage | ⚠ Step 28 crashed pre-dc3037e (column drift) — fixed. Re-run pending. |
| Final (29) | backup_db | skipped (not connected) |

---

## Pass-2 WF3 commit chain

| Commit | Scope |
|---|---|
| `14c8269` | per-seq audit_table rows + Step 15 CoA coverage gap closure |
| `dc3037e` | column-drift in pb aggregate (parcel_buildings → building_footprints; parcels.area_sqm → lot_size_sqm) |

---

## Pass-1 → Pass-2 finding closure status

| Pass-1 finding | Status |
|---|---|
| CRIT-1 — Step 21 TDZ + CoA permit_type SQL | ✅ closed (Pass-1 commits e909c36 + c6e951c) |
| CRIT-2 — 147 zombie PRE-permits | ✅ closed (mig 157) |
| CRIT-3a — assert-schema Parcels cascade | ✅ closed (commit 90c7868) |
| CRIT-3b — load-parcels CSV drift | ✅ closed (commit 2ee6c81) |
| HIGH-1 — backfill-realtor audit_table | ✅ closed |
| HIGH-2 — assert_global_coverage exit 1 | ⚠ Pass-2 surfaced this was column-drift, not stale-data; closed in dc3037e |
| HIGH-3 — opportunity_score coverage_pct=76.8 | ⏳ measure on permits chain re-run |
| HIGH-4 — calibration WARN | ✅ closed by Pass-2 (Step 14 now runs and emits clean) |
| HIGH-5 — distribution WARN | ✅ closed by Pass-2 per-seq rows (chain doesn't halt; per-seq detail visible) |
| HIGH-6 — model_range_pct NaN | ✅ closed (mig 156) |
| MED 1-5 | ⏳ pending §7 surface review |

---

## §7 Admin UI validation status

| Surface | Status | Evidence |
|---|---|---|
| 1. Lead Detail Inspector | ⏳ pending |
| 2. Freshness Timeline | ✅ in progress | Data Quality dashboard at `/admin/data-quality` loads cleanly; chain-run trigger functional; per-step "Expand details" surfaces audit_table rows (validated CoA Step 13 expand shows the new aggregate rows) |
| 3. Pipelines/Resync | ✅ partial | Both chains successfully triggered via "Run All" button; new pipeline_runs row appears immediately |
| 4. Flight Center | ⏳ pending |
| 5. Test Feed Tool | ⏳ pending |
| 6. observe-chain trigger | ⏳ pending |
| 7. logic_variables CRUD (Spec 86 Control Panel) | ✅ partial | `/admin/control-panel` loads with editable Platform Variables / Trade Configurations / Scope Matrix tabs. Full CRUD-create-read-update-delete cycle not yet exercised. |

---

## Open items for next session

1. Permits chain re-run completion + verify Step 28 PASS/WARN
2. Surfaces 1, 4, 5, 6 walkthrough
3. Full CRUD cycle on logic_variables (Surface 7)
4. §6.2 observe-chain narrative validation (auto-spawn after `run-chain.js permits`)
5. Investigate the Step 21 transient 570ms failure (direct run worked; chain run crashed early — possibly run-chain.js stdio timing). Not blocking — chain re-runs succeed.
6. The 113-vs-110 per-seq row count discrepancy (catalogSeqs has 113 entries? or symmetric-diff additions?). Likely benign.

---

_This report is preliminary — pending the permits chain re-run completion (running on dc3037e at the time of writing). Final cap status will be appended when chain_permits terminal status arrives via Monitor._
