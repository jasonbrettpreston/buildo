# Permits Chain — Validation Records

Per Spec 79 §4. Each `step_<NN>_<slug>.md` is one record from one execution of the permits chain.

29 steps per `scripts/manifest.json` `chains.permits`. Record naming uses the manifest's authoritative step number.

| # | Slug | Agent (per Spec 79 §3a) | Record |
|---|------|--------------------------|--------|
| 1 | assert_schema | none | step_01_assert_schema.md |
| 2 | permits | Observability | step_02_permits.md |
| 3 | close_stale_permits | Calculations | step_03_close_stale_permits.md |
| 4 | classify_permit_phase | Compliance | step_04_classify_permit_phase.md |
| 5 | classify_scope | Compliance | step_05_classify_scope.md |
| 6 | builders | Compliance | step_06_builders.md |
| 7 | link_wsib | Compliance | step_07_link_wsib.md |
| 8 | geocode_permits | Compliance | step_08_geocode_permits.md |
| 9 | link_parcels | Compliance | step_09_link_parcels.md |
| 10 | link_neighbourhoods | Compliance | step_10_link_neighbourhoods.md |
| 11 | link_massing | Compliance | step_11_link_massing.md |
| 12 | link_similar | Compliance | step_12_link_similar.md |
| 13 | classify_permits | Compliance | step_13_classify_permits.md |
| 14 | backfill_realtor_permit_trades | Compliance | step_14_backfill_realtor_permit_trades.md |
| 15 | compute_cost_estimates | Calculations | step_15_compute_cost_estimates.md |
| 16 | compute_timing_calibration_v2 | Calculations | step_16_compute_timing_calibration_v2.md |
| 17 | link_coa | Compliance | step_17_link_coa.md |
| 18 | refresh_snapshot | Compliance | step_18_refresh_snapshot.md |
| 19 | assert_data_bounds | Compliance | step_19_assert_data_bounds.md |
| 20 | assert_engine_health | Compliance | step_20_assert_engine_health.md |
| 21 | classify_lifecycle_phase | Multi-domain | step_21_classify_lifecycle_phase.md (covers CoA step 12) |
| 22 | assert_lifecycle_phase_distribution | Calculations | step_22_assert_lifecycle_phase_distribution.md |
| 23 | compute_phase_calibration | Calculations | step_23_compute_phase_calibration.md |
| 24 | compute_trade_forecasts | Calculations | step_24_compute_trade_forecasts.md |
| 25 | compute_opportunity_scores | Calculations | step_25_compute_opportunity_scores.md |
| 26 | update_tracked_projects | Calculations | step_26_update_tracked_projects.md |
| 27 | assert_entity_tracing | Compliance | step_27_assert_entity_tracing.md |
| 28 | assert_global_coverage | Compliance | step_28_assert_global_coverage.md |
| 29 | backup_db | none | step_29_backup_db.md |

Status: empty (no records yet). Records land progressively as execution proceeds.
