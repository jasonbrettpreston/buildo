# Spec 122 conversion roadmap — every remaining step, generated

> **GENERATED — do not hand-edit.** Sources: `scripts/manifest.json`, `scripts/steps/_schema/{converted,step-archetype-census,programme-items}.json`, `docs/reports/generated/122-churn-complexity.md`.
> Regenerate: `npm run conversion-roadmap`. Drift-guarded by `src/tests/conversion-roadmap.infra.test.ts`.
> SPEC LINK: `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §1.7, §1.10, §8.2, §10.3 (R-T)
> Sequence source of record: `.cursor/c4_batching_entry_active_task.md` (C4/C5 batch membership) — this report does not re-sequence it, only renders it alongside declared risk/gate data.

## Counts

Remaining files: **53** (+ **1** pending) · remaining slugs: **55** (+ **1** pending)

| Batch | Files | Slots |
|---|---:|---:|
| C4 | 3 | 8 |
| C5 | 15 | 18 |
| C6 | 36 | 40 |

## C4 — archetype-grouped, risk-ascending

| Archetype | File | Slug(s) | Chains (slots) | Quadrant | Write hints | Open cutover_prereq |
|---|---|---|---|---|---|---|
| ASSERT | `scripts/quality/assert-engine-health.js` | assert_engine_health | coa+deep_scrapes+permits+sources (4) | top-right | — | — |
| ENRICHER | `scripts/geocode-permits.js` | geocode_permits | permits+sources (2) | bottom-left | supports_full | — |
| LINK | `scripts/link-neighbourhoods.js` | link_neighbourhoods | permits+sources (2) | top-right | supports_full | — |

<details><summary>C4 — why each archetype (census <code>reason</code>)</summary>

- `scripts/geocode-permits.js` (ENRICHER): C4 batching-entry §3.2 order 5
- `scripts/link-neighbourhoods.js` (LINK): C4 batching-entry §3.2 order 4 — LINK 3rd/last member
- `scripts/quality/assert-engine-health.js` (ASSERT): C4 batching-entry §3.2 order 3 — Fold A I-1/I-2 (CRITICAL): a genuine domain write (engine_health_snapshots) inside the ASSERT x-profile (outputs:"none" forced); PH-0 must re-derive this, not trust the port

</details>

## C5 — archetype-grouped, risk-ascending

| Archetype | File | Slug(s) | Chains (slots) | Quadrant | Write hints | Open cutover_prereq |
|---|---|---|---|---|---|---|
| ASSERT | `scripts/quality/assert-parcel-sanity.js` | assert_parcel_sanity | sources (1) | bottom-left | — | — |
| ASSERT | `scripts/quality/assert-data-bounds.js` | assert_data_bounds [pending: shape_clean] | coa+deep_scrapes+permits+sources (4) | top-right | — | — |
| ENRICHER | `scripts/enrich-centreline.js` | enrich_centreline | sources (1) | bottom-left | — | EP-PIN-D17 (enrich_centreline) |
| ENRICHER | `scripts/enrich-heritage.js` | enrich_heritage | sources (1) | bottom-left | — | — |
| ENRICHER | `scripts/enrich-ravines.js` | enrich_ravines | sources (1) | bottom-left | — | — |
| ENRICHER | `scripts/compute-parcel-cost-estimates.js` | compute_parcel_cost_estimates | sources (1) | top-left | supports_dry_run | — |
| INGESTOR | `scripts/load-address-points.js` | address_points | sources (1) | top-left | — | — |
| INGESTOR | `scripts/load-centreline.js` | load_centreline | sources (1) | top-left | — | — |
| INGESTOR | `scripts/load-heritage.js` | load_heritage | sources (1) | top-left | — | — |
| INGESTOR | `scripts/load-zoning.js` | load_zoning | sources (1) | top-left | — | — |
| INGESTOR | `scripts/load-massing.js` | massing | sources (1) | top-right | — | — |
| INGESTOR | `scripts/load-neighbourhoods.js` | neighbourhoods | sources (1) | top-right | — | — |
| INGESTOR | `scripts/load-parcels.js` | parcels | sources (1) | top-right | — | — |
| INGESTOR | `scripts/load-wsib.js` | load_wsib | sources (1) | top-right | — | — |
| UNDECLARED | `scripts/reconcile-runs.js` | reconcile | sources (1) | — | — | — |

<details><summary>C5 — why each archetype (census <code>reason</code>)</summary>

- `scripts/compute-parcel-cost-estimates.js` (ENRICHER): Spec 122 §1.10 declared
- `scripts/enrich-centreline.js` (ENRICHER): Spec 122 §1.10 declared
- `scripts/enrich-heritage.js` (ENRICHER): Spec 122 §1.10 declared
- `scripts/enrich-ravines.js` (ENRICHER): Spec 122 §1.10 declared
- `scripts/load-address-points.js` (INGESTOR): Spec 122 §1.10 declared
- `scripts/load-centreline.js` (INGESTOR): Spec 122 §1.10 declared
- `scripts/load-heritage.js` (INGESTOR): Spec 122 §1.10 declared
- `scripts/load-massing.js` (INGESTOR): Spec 122 §1.10 declared
- `scripts/load-neighbourhoods.js` (INGESTOR): Spec 122 §1.10 declared
- `scripts/load-parcels.js` (INGESTOR): Spec 122 §1.10 declared
- `scripts/load-wsib.js` (INGESTOR): Spec 122 §1.10 declared
- `scripts/load-zoning.js` (INGESTOR): Spec 122 §1.10 declared
- `scripts/quality/assert-data-bounds.js` (ASSERT): C4 batching-entry §3.2 order 2. Batch1 I2 commit 6 (2026-09-12): PH-7 red suite landed, converted.json now declares this slug pending (stage red_suite) — batch flips from the pre-registration "C4" label to "pending" per generate-conversion-roadmap.mjs's own invariant (a pending file's census row must read batch:"pending").
- `scripts/quality/assert-parcel-sanity.js` (ASSERT): Ask A1-bis: sources-only 1-slot ASSERT, ruled to join the C4 ASSERT group at conversion time; census still declares its true archetype under C5's own batch tag
- `scripts/reconcile-runs.js` (UNDECLARED): chain-head infrastructure (Spec 122 §7.4 A3) — excluded from the PH-2 population and from the 8-archetype dispatch; STD-4 tracks its manifest-position promise separately, not this census

</details>

## C6 — UNDECLARED (Ask A3: no archetype, no PH-2 risk data — ordered by chain, not risk)

| Chain bucket | File | Slug(s) | Chains (slots) |
|---|---|---|---|
| permits | `scripts/backfill-realtor-permit-trades.js` | backfill_realtor_permit_trades | permits (1) |
| permits | `scripts/backup-db.js` | backup_db | permits (1) |
| permits | `scripts/classify-lifecycle-phase.js` | classify_lifecycle_phase | coa+permits (2) |
| permits | `scripts/classify-permit-phase.js` | classify_permit_phase | permits (1) |
| permits | `scripts/classify-permits.js` | classify_permits | permits (1) |
| permits | `scripts/classify-scope.js` | classify_scope | permits (1) |
| permits | `scripts/close-stale-permits.js` | close_stale_permits | permits (1) |
| permits | `scripts/compute-build-norms.js` | compute_build_norms | permits (1) |
| permits | `scripts/compute-cost-estimates.js` | compute_cost_estimates | permits (1) |
| permits | `scripts/compute-opportunity-scores.js` | compute_opportunity_scores | permits (1) |
| permits | `scripts/compute-phase-calibration.js` | compute_phase_calibration | coa+permits (2) |
| permits | `scripts/compute-storey-norms.js` | compute_storey_norms | permits (1) |
| permits | `scripts/compute-timing-calibration-v2.js` | compute_timing_calibration_v2 | permits (1) |
| permits | `scripts/compute-trade-forecasts.js` | compute_trade_forecasts | permits (1) |
| permits | `scripts/dispatch-notifications.js` | dispatch_notifications | permits (1) |
| permits | `scripts/enrich-permits.js` | enrich_permits, enrich_coa_zoning | coa+permits (2) |
| permits | `scripts/extract-builders.js` | builders | permits (1) |
| permits | `scripts/link-coa.js` | link_coa | coa+permits (2) |
| permits | `scripts/link-similar.js` | link_similar | permits (1) |
| permits | `scripts/load-permits.js` | permits | permits (1) |
| permits | `scripts/quality/assert-entity-tracing.js` | assert_entity_tracing | permits (1) |
| permits | `scripts/quality/assert-lifecycle-phase-distribution.js` | assert_lifecycle_phase_distribution | coa+permits (2) |
| permits | `scripts/update-tracked-projects.js` | update_tracked_projects | permits (1) |
| coa | `scripts/classify-coa-scope.js` | classify_coa_scope | coa (1) |
| coa | `scripts/classify-coa-trades.js` | classify_coa_trades | coa (1) |
| coa | `scripts/compute-coa-cost-estimates.js` | compute_coa_cost_estimates | coa (1) |
| coa | `scripts/link-coa-to-parcels.js` | link_coa_to_parcels | coa (1) |
| coa | `scripts/load-coa.js` | coa | coa (1) |
| coa | `scripts/quality/assert-coa-freshness.js` | assert_coa_freshness | coa (1) |
| deep_scrapes | `scripts/classify-inspection-status.js` | classify_inspection_status | deep_scrapes (1) |
| deep_scrapes | `scripts/quality/assert-network-health.js` | assert_network_health | deep_scrapes (1) |
| deep_scrapes | `scripts/quality/assert-staleness.js` | assert_staleness | deep_scrapes (1) |
| entities_wsib | `scripts/enrich-web-search.js` | enrich_wsib_builders, enrich_named_builders | entities (2) |
| entities_wsib | `scripts/enrich-wsib.js` | enrich_wsib_registry | wsib (1) |
| orphan | `scripts/observe-chain.js` | observe_chain |  (0) |
| orphan | `scripts/reclassify-all.js` | reclassify_all |  (0) |

*C6 chain-bucket counts (files):* permits=23 · coa=6 · deep_scrapes=3 · entities_wsib=2 · orphan=2

## Declared exemptions (Ask A2) — manifest slugs with NO JS file, excluded by ruling, never silently dropped

| Slug | File | Reason | Ruling | Scope |
|---|---|---|---|---|
| coa_documents | `null` | no_file | n/a — no exemption WF was needed | manifest.scripts.coa_documents.coming_soon=true, file:null; nothing exists yet to convert |
| inspections | `scripts/aic-orchestrator.py` | python_step_excluded | operator 2026-09-10 | out of the JS step standard; stays on its own runner — EXCLUDED from the conversion programme entirely, not deferred to the deep_scrapes batch or any future WF |

---

*Totality (both directions, proven by `src/tests/conversion-roadmap.infra.test.ts`; slug-grain, IDENTITY HOLDS): **68** manifest.scripts slugs = **10** converted + **1** pending + **2** declared exemptions (Ask A2, excluded from the conversion programme entirely — never silently dropped, see the table above) + **55** remaining, each counted exactly once, in exactly one of C4/C5/C6/pending/exempted.*
