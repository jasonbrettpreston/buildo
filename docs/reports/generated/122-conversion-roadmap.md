# Spec 122 conversion roadmap — every remaining step, generated

> **GENERATED — do not hand-edit.** Sources: `scripts/manifest.json`, `scripts/steps/_schema/{converted,step-archetype-census,programme-items}.json`, `docs/reports/generated/122-churn-complexity.md`.
> Regenerate: `npm run conversion-roadmap`. Drift-guarded by `src/tests/conversion-roadmap.infra.test.ts`.
> SPEC LINK: `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §1.7, §1.10, §8.2, §10.3 (R-T)
> Sequence source of record: `.cursor/c4_batching_entry_active_task.md` (C4/C5 batch membership) — this report does not re-sequence it, only renders it alongside declared risk/gate data.

## Counts

Remaining files: **22** (+ **14** pending) · remaining slugs: **23** (+ **14** pending)

| Batch | Files | Slots |
|---|---:|---:|
| C4 | 0 | 0 |
| C5 | 14 | 15 |
| C6 | 22 | 26 |

## C4 — archetype-grouped, risk-ascending

| Archetype | File | Slug(s) | Chains (slots) | Quadrant | Write hints | Open cutover_prereq |
|---|---|---|---|---|---|---|

<details><summary>C4 — why each archetype (census <code>reason</code>)</summary>


</details>

## C5 — archetype-grouped, risk-ascending

| Archetype | File | Slug(s) | Chains (slots) | Quadrant | Write hints | Open cutover_prereq |
|---|---|---|---|---|---|---|
| ASSERT | `scripts/quality/assert-coa-freshness.js` | assert_coa_freshness [pending: red_suite] | coa (1) | — | — | LDG-10 (assert_coa_freshness); CHAIN-TOOLING (assert_coa_freshness); EP-PIN-D17 (assert_coa_freshness) |
| ASSERT | `scripts/quality/assert-entity-tracing.js` | assert_entity_tracing [pending: red_suite] | permits (1) | — | — | LDG-10 (assert_entity_tracing); CHAIN-TOOLING (assert_entity_tracing); EP-PIN-D17 (assert_entity_tracing) |
| ASSERT | `scripts/quality/assert-lifecycle-phase-distribution.js` | assert_lifecycle_phase_distribution [pending: red_suite] | coa+permits (2) | — | — | LDG-10 (assert_lifecycle_phase_distribution); CHAIN-TOOLING (assert_lifecycle_phase_distribution); EP-PIN-D17 (assert_lifecycle_phase_distribution) |
| ASSERT | `scripts/quality/assert-network-health.js` | assert_network_health [pending: red_suite] | deep_scrapes (1) | — | — | LDG-10 (assert_network_health); CHAIN-TOOLING (assert_network_health); EP-PIN-D17 (assert_network_health) |
| ASSERT | `scripts/quality/assert-staleness.js` | assert_staleness [pending: red_suite] | deep_scrapes (1) | — | — | LDG-10 (assert_staleness); CHAIN-TOOLING (assert_staleness); EP-PIN-D17 (assert_staleness) |
| ENRICHER | `scripts/classify-coa-scope.js` | classify_coa_scope [pending: red_suite] | coa (1) | — | supports_full | LDG-10 (classify_coa_scope); CHAIN-TOOLING (classify_coa_scope); EP-PIN-D17 (classify_coa_scope) |
| ENRICHER | `scripts/enrich-coa-zoning.js` | enrich_coa_zoning [pending: compute_ported] | coa (1) | — | — | LDG-10 (enrich_coa_zoning); CHAIN-TOOLING (enrich_coa_zoning); EP-PIN-D17 (enrich_coa_zoning) |
| ENRICHER | `scripts/enrich-permits.js` | enrich_permits [pending: compute_ported] | permits (1) | — | — | LDG-10 (enrich_permits); CHAIN-TOOLING (enrich_permits); EP-PIN-D17 (enrich_permits) |
| INGESTOR | `scripts/load-coa-notices.js` | load_coa_notices [pending: shape_clean_pending_recapture] | coa_notices (1) | — | — | — |
| INGESTOR | `scripts/load-coa.js` | coa [pending: red_suite] | coa (1) | — | supports_full | LDG-10 (coa); CHAIN-TOOLING (coa); EP-PIN-D17 (coa) |
| INGESTOR | `scripts/load-permits.js` | permits [pending: red_suite] | permits (1) | — | — | LDG-10 (permits); CHAIN-TOOLING (permits); EP-PIN-D17 (permits) |
| LINK | `scripts/link-coa-to-parcels.js` | link_coa_to_parcels [pending: red_suite] | coa (1) | — | supports_full | LDG-10 (link_coa_to_parcels); CHAIN-TOOLING (link_coa_to_parcels); EP-PIN-D17 (link_coa_to_parcels) |
| MATERIALIZER | `scripts/classify-coa-trades.js` | classify_coa_trades [pending: red_suite] | coa (1) | — | supports_full | LDG-10 (classify_coa_trades); CHAIN-TOOLING (classify_coa_trades); EP-PIN-D17 (classify_coa_trades) |
| MATERIALIZER | `scripts/compute-coa-cost-estimates.js` | compute_coa_cost_estimates [pending: red_suite] | coa (1) | — | supports_full, supports_dry_run | LDG-10 (compute_coa_cost_estimates); CHAIN-TOOLING (compute_coa_cost_estimates); EP-PIN-D17 (compute_coa_cost_estimates) |

<details><summary>C5 — why each archetype (census <code>reason</code>)</summary>

- `scripts/classify-coa-scope.js` (ENRICHER): ARCH-CENSUS key-step scope (wave-4 plan .cursor/v3-wave4-coa-and-dispatch-2026-10-18.md, operator y 2026-10-18 recommendation 8; McDonald's Airtight V3) declared ENRICHER; phase-4 wave-4 conversion IN FLIGHT (commit ①, 2026-10-18) — archetype re-derived from the code at PH-0 (R-AO), confirmed ENRICHER: a per-row JS classifier (scripts/lib/coa-scope-classifier.js, scripts/classify-coa-scope.js:177) over its own input table's pending cursor (:165-173) writing six derived columns back onto coa_applications (:134-145). Precedent compute_parcel_cost_estimates (JS per-row compute, one post_commit phase).
- `scripts/classify-coa-trades.js` (MATERIALIZER): ARCH-CENSUS wave-4 row (operator y 2026-10-18, plan .cursor/v3-wave4-coa-and-dispatch-2026-10-18.md Q8; McDonald's Airtight V3): MATERIALIZER. Phase-4 wave-4 conversion IN FLIGHT (commit ①, 2026-10-18) — archetype derived from the legacy script at PH-0 (R-AO), never from a descriptor: derived per-lead rows from coa_applications(scope_tags) into lead_trades (INSERT … ON CONFLICT (lead_id, trade_id) DO UPDATE, scripts/classify-coa-trades.js:203-215) and lead_products (per-lead DELETE + INSERT, :228, :241), plus the trade_classified_at watermark (:252). Not an ENRICHER: its outputs are rows of other tables keyed by lead, not columns of the rows it reads (the watermark is the cursor). Twin of compute_trade_forecasts (census MATERIALIZER).
- `scripts/compute-coa-cost-estimates.js` (MATERIALIZER): ARCH-CENSUS wave-4 row (operator y 2026-10-18, plan .cursor/v3-wave4-coa-and-dispatch-2026-10-18.md Q8; McDonald's Airtight V3): MATERIALIZER, the archetype of its twin compute_cost_estimates so both writers of cost_estimates share one. Phase-4 wave-4 conversion IN FLIGHT (commit ①, 2026-10-18) — archetype derived from the legacy script at PH-0 (R-AO): one derived row per priced CoA into cost_estimates (INSERT … ON CONFLICT (lead_id) DO UPDATE … WHERE … IS DISTINCT FROM, scripts/compute-coa-cost-estimates.js:359-397) plus a second target, the coa_applications cost columns and cost_classified_at watermark (:421-427).
- `scripts/enrich-coa-zoning.js` (ENRICHER): ARCH-CENSUS wave-4 scope (operator y 2026-10-18, wave-4 plan questions 8-9; McDonald's Airtight V3) declared ENRICHER. Identity split at commit ① (2026-10-18, operator-approved): this slug's file is now scripts/enrich-coa-zoning.js, a legacy pass-through shell over scripts/enrich-permits.js main() with ENRICH_TARGET=coa, so the slug has its own descriptor, converted.json entry and census row. Phase-4 wave-4 conversion IN FLIGHT — archetype re-derived from the code at PH-0 (R-AO), confirmed ENRICHER: the coa target of the same materialize / guarded UPDATE / orphan nullify onto coa_applications through lead_parcels on the stored lead_id (scripts/enrich-permits.js CFG.coa :97-112). Precedent geocode_permits.
- `scripts/enrich-permits.js` (ENRICHER): ARCH-CENSUS wave-4 scope (operator y 2026-10-18, wave-4 plan questions 8-9; McDonald's Airtight V3) declared ENRICHER; converts in the same series as its twin enrich_coa_zoning (one shared legacy module). Phase-4 wave-4 conversion IN FLIGHT (commit ①, 2026-10-18) — archetype re-derived from the code at PH-0 (R-AO), confirmed ENRICHER: copies the dominant linked parcel's feed onto its own input table permits through permit_parcels — a temp-table materialize (scripts/enrich-permits.js:372, :488-489), a guarded set-based UPDATE (:470, :500) and an orphan nullify (:546, :506). Always full (:5-6). Precedent geocode_permits (set_based_join_update + set_based_null_retract).
- `scripts/link-coa-to-parcels.js` (LINK): ARCH-CENSUS wave-4 scope (operator y 2026-10-18, wave-4 plan question 8; McDonald's Airtight V3) declared LINK; phase-4 wave-4 conversion IN FLIGHT (commit ①, 2026-10-18) — archetype re-derived from the code at PH-0 (R-AO), confirmed LINK: an address-tier cascade (address-points bridge, parcels exact, name-only; scripts/link-coa-to-parcels.js:366-470) that writes lead_parcels (guarded upsert ON CONFLICT (lead_id, parcel_id), :458) with retraction (the coa-scoped ghost DELETE, :587-595) and back-fills coa_applications lat/lng/neighbourhood_id/parcel_linked_at (:532, :551, pre-pass :322). Same shape as link_parcels (link_keyed + link_full_retraction + the parcel_linked_at marker); the bundled neighbourhood pass follows link_neighbourhoods.
- `scripts/load-coa-notices.js` (INGESTOR): NET-NEW step, converted from day one (WF1 load_coa_notices, Spec 129; plan .cursor/wf1_load_coa_notices_active_task.md v3, authorized 2026-10-07). Classified INGESTOR from the plan before any code existed (an external document set acquired and written to one table); there is no legacy script to classify. The one file in converted.json pending[] until its cutover.
- `scripts/load-coa.js` (INGESTOR): ARCH-CENSUS key-step scope (operator y 2026-10-17, phase-4 decision 1; McDonald's Airtight V3) declared INGESTOR provisionally; phase-4 wave-1 conversion IN FLIGHT (commit ①, 2026-10-17) — archetype re-derived from the code at PH-0 (R-AO), confirmed INGESTOR multi-target (two CKAN DataStore resources -> coa_applications upsert + lifecycle_status_history ledger rows; scripts/load-coa.js:105, :293, :390)
- `scripts/load-permits.js` (INGESTOR): ARCH-CENSUS key-step scope (operator y 2026-10-17, phase-4 decision 1; McDonald's Airtight V3). Phase-4 wave 1 conversion IN FLIGHT (commit ①, 2026-10-17) — archetype re-derived from the code at PH-0 (R-AO), confirmed INGESTOR (one CKAN DataStore primary, scripts/load-permits.js:33 CKAN_BASE; two write targets: the permits class-B guarded upsert :338-390 and the lifecycle_status_history append ledger :458; the legacy sync_runs run row :725 retires at cutover, CP-PERMITS D-P1). Multi-target INGESTOR, precedent load_zoning.
- `scripts/quality/assert-coa-freshness.js` (ASSERT): ARCH-CENSUS key-step scope (wave-4 plan .cursor/v3-wave4-coa-and-dispatch-2026-10-18.md, operator y 2026-10-18 recommendation 8; McDonald's Airtight V3) declared ASSERT; phase-4 wave-4 conversion IN FLIGHT (commit ①, 2026-10-18) — archetype re-derived from the code at PH-0 (R-AO), confirmed ASSERT: read-only (scripts/quality/assert-coa-freshness.js:9), one aggregate SELECT over coa_applications (:53-60), a WARN/FAIL portal-rot verdict on two logic variables (:92-94), no write (emitMeta writes {} :133-136). Precedent assert_data_bounds.
- `scripts/quality/assert-entity-tracing.js` (ASSERT): ARCH-CENSUS C6 (2026-10-19) declared ASSERT; C6-1 conversion IN FLIGHT (commit ①, 2026-10-19) — archetype re-derived from the code at PH-0 (R-AO), confirmed ASSERT: seven read-only SELECTs over permits/permit_trades/cost_estimates/trade_forecasts (scripts/quality/assert-entity-tracing.js:71-208), a row-derived non-halting verdict (:264, :298), no write (emitMeta writes {} :288-296). Precedent assert_global_coverage.
- `scripts/quality/assert-lifecycle-phase-distribution.js` (ASSERT): ARCH-CENSUS key-step row (operator y 2026-10-17), RE-DERIVED at PH-0 on 2026-10-19 (R-AO) and confirmed ASSERT; C6-1 conversion IN FLIGHT (commit ①, 2026-10-19): fifteen read-only SELECTs over permits/coa_applications/universal_stream_catalog (scripts/quality/assert-lifecycle-phase-distribution.js:203-708), per-seq bands + unclassified hard limit + cross checks, halting only on the two C1 classes (:898-908), no write (emitMeta writes {} :879-886; the only DELETE text :286 is recovery advice in a message string). Runs in two chains (permits, coa); owner spec 84 (the domain spec, the enrich_permits precedent). Precedent assert_parcel_sanity (halting ASSERT).
- `scripts/quality/assert-network-health.js` (ASSERT): ARCH-CENSUS C6 (2026-10-19) declared ASSERT; C6-1 conversion IN FLIGHT (commit ①, 2026-10-19) — archetype re-derived from the code at PH-0 (R-AO), confirmed ASSERT: one read-only SELECT of the latest inspections pipeline_runs row (scripts/quality/assert-network-health.js:54-58), five graded checks over its scraper_telemetry (:80-152), non-halting (:179-183), no write (emitMeta writes {} :174-177). Precedent assert_data_bounds.
- `scripts/quality/assert-staleness.js` (ASSERT): ARCH-CENSUS C6 (2026-10-19) declared ASSERT; C6-1 conversion IN FLIGHT (commit ①, 2026-10-19) — archetype re-derived from the code at PH-0 (R-AO), confirmed ASSERT: two read-only SELECTs over permits x permit_inspections (scripts/quality/assert-staleness.js:66-75, :106-122), a three-tier stale-count gate that halts on FAIL (:142-154, :174; the mig-121 fence kept by 4d5df9e7), no write (emitMeta writes {} :169-172). Precedent assert_parcel_sanity (halting ASSERT).

</details>

## C6 — archetype declared by ARCH-CENSUS C6, no PH-2 risk data yet (ordered by chain, not risk)

| Chain bucket | Archetype | File | Slug(s) | Chains (slots) |
|---|---|---|---|---|
| permits | BACKFILL | `scripts/backfill-realtor-permit-trades.js` | backfill_realtor_permit_trades | permits (1) |
| permits | EFFECTOR | `scripts/backup-db.js` | backup_db | permits (1) |
| permits | ENRICHER | `scripts/classify-lifecycle-phase.js` | classify_lifecycle_phase | coa+permits (2) |
| permits | ENRICHER | `scripts/classify-permit-phase.js` | classify_permit_phase | permits (1) |
| permits | MATERIALIZER | `scripts/classify-permits.js` | classify_permits | permits (1) |
| permits | ENRICHER | `scripts/classify-scope.js` | classify_scope | permits (1) |
| permits | ENRICHER | `scripts/close-stale-permits.js` | close_stale_permits | permits (1) |
| permits | MATERIALIZER | `scripts/compute-build-norms.js` | compute_build_norms | permits (1) |
| permits | MATERIALIZER | `scripts/compute-cost-estimates.js` | compute_cost_estimates | permits (1) |
| permits | ENRICHER | `scripts/compute-opportunity-scores.js` | compute_opportunity_scores | permits (1) |
| permits | MATERIALIZER | `scripts/compute-phase-calibration.js` | compute_phase_calibration | coa+permits (2) |
| permits | MATERIALIZER | `scripts/compute-storey-norms.js` | compute_storey_norms | permits (1) |
| permits | MATERIALIZER | `scripts/compute-timing-calibration-v2.js` | compute_timing_calibration_v2 | permits (1) |
| permits | MATERIALIZER | `scripts/compute-trade-forecasts.js` | compute_trade_forecasts | permits (1) |
| permits | EFFECTOR | `scripts/dispatch-notifications.js` | dispatch_notifications | permits (1) |
| permits | MATERIALIZER | `scripts/extract-builders.js` | builders | permits (1) |
| permits | LINK | `scripts/link-coa.js` | link_coa | coa+permits (2) |
| permits | ENRICHER | `scripts/link-similar.js` | link_similar | permits (1) |
| permits | ENRICHER | `scripts/update-tracked-projects.js` | update_tracked_projects | permits (1) |
| deep_scrapes | ENRICHER | `scripts/classify-inspection-status.js` | classify_inspection_status | deep_scrapes (1) |
| entities_wsib | ENRICHER | `scripts/enrich-web-search.js` | enrich_wsib_builders, enrich_named_builders | entities (2) |
| entities_wsib | ENRICHER | `scripts/enrich-wsib.js` | enrich_wsib_registry | wsib (1) |

*C6 chain-bucket counts (files):* permits=19 · coa=0 · deep_scrapes=1 · entities_wsib=2 · orphan=0

## Declared exemptions (Ask A2 + Spec 124 R-AP, R-EK) — manifest slugs with NO JS file, RUNNER-owned concerns, and retired steps, excluded by ruling, never silently dropped

| Slug | File | Reason | Ruling | Scope |
|---|---|---|---|---|
| coa_documents | `null` | no_file | n/a — no exemption WF was needed | manifest.scripts.coa_documents.coming_soon=true, file:null; nothing exists yet to convert |
| inspections | `scripts/aic-orchestrator.py` | python_step_excluded | operator 2026-09-10 | out of the JS step standard; stays on its own runner — EXCLUDED from the conversion programme entirely, not deferred to the deep_scrapes batch or any future WF |
| observe_chain | `scripts/observe-chain.js` | runner_owned | Spec 124 §5 R-EJ (operator y 2026-10-19), applying R-AP: post-chain observation is a RUNNER concern — scripts/run-chain.js:1353 spawns it after every chain; it is in no manifest chain and no step can opt out of it | Not converted and not counted in C6. Spawned detached by run-chain.js after the chain lock is released (scripts/run-chain.js:1353); reads pipeline_runs, calls DeepSeek (scripts/observe-chain.js:256-263) and appends docs/reports/pipeline-observability/{chain}-followup.md (:16, :308); header :4 "no business table mutations". Its standard is the runner's (Spec 48), not the step descriptor. |
| reclassify_all | `scripts/reclassify-all.js` | retired | Spec 124 §5 R-EK (operator y 2026-10-19): retired, not converted | Not converted and not counted in C6. One-off maintenance (eslint.config.mjs:222; scripts/amnesty.json) in no manifest chain. It re-runs scope + trade + product classification for every permit (scripts/reclassify-all.js:134-181), which classify_scope and classify_permits already do with --full. The script stays in the tree until both covering steps are converted; deleting it is its own later step (PIN C6-RETIRE-1). |
| reconcile | `scripts/reconcile-runs.js` | runner_owned | Spec 124 §5 R-AP (batch-2 Phase 0.8, 2026-09-15) — grounded in Spec 122 §4 (RUNNER owns reconcile), §7.3 concern row 4 ("Reconcile the previous run | RUNNER | nothing declared") and §7.4 A3 (a reconcile step at the head of manifest.chains.sources) | THIRD exemption class: the slug HAS a real JS file, but the concern it implements is RUNNER-owned — Spec 122 §4 says of RUNNER concerns "nothing is declared per step, and a step cannot opt out", so there is no per-step descriptor to write, no identity.archetype in step.schema.json's 8-value enum to pick, and no x-profile/required-field set. Excluded from the PH-2 population, the 8-archetype dispatch and the C5 conversion count (C5 = 13 conversions, not 14). NOT gate_exempt data (that is scripts/refresh-snapshot.descriptor.json's declared run-chain skip, 9a667a06) and NOT a no_file/python exemption — a distinct, named class. STD-4 tracks its manifest-position promise separately, not this census. |

---

*Totality (both directions, proven by `src/tests/conversion-roadmap.infra.test.ts`; slug-grain, IDENTITY HOLDS): **71** manifest.scripts slugs = **29** converted + **14** pending + **5** declared exemptions (Ask A2, excluded from the conversion programme entirely — never silently dropped, see the table above) + **23** remaining, each counted exactly once, in exactly one of C4/C5/C6/pending/exempted.*
