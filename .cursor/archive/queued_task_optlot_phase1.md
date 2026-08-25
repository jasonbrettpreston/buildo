# QUEUED: Optimal Lot Configuration — Phase 1 (Permit-Data Foundation)
**Status:** Queued (promote after Phase 0) · **Workflow:** WF1 · **Domain:** Backend/Pipeline
**Design:** `docs/reports/enriched-parcels-field-spec.md` + `optimal-lot-configuration-implementation-plan.md`. **Revised post round-1 plan review** (Integration + Observability) — fixes folded below.

## Goal
Ingest the unused permit occupancy columns (`RESIDENTIAL`=GFA etc.) + fix the `STOREYS` schema drift; build `neighbourhood_build_norms` + `compute-build-norms.js`. Foundation every later phase calibrates against.

## Resolved review findings (folded)
- **A-1 lock ID:** spec/lock = **78** (81 collides with compute-opportunity-scores). Register in `pipeline-advisory-lock.infra.test.ts` before the script.
- **A-2 archetype:** **Mutator** (Spec 30 §2.1 — there is no "Enricher"; reads `permits`/`coa_applications`, writes a summary table). Confirm all Mutator rules apply.
- **A-3/A-9 audit + emitMeta:** `compute-build-norms.js` MUST emit `audit_table` rows: `neighbourhoods_computed` (>0), `low_sample_neighbourhoods` (INFO, emit at 0), `citywide_fallback_written` (==1), `build_ratio_null_rate` (WARN-gated) — row-derived cascade (Spec 47 §8.2 / 48 §3.6), INFO emits even at 0. `emitMeta`: inputs `permits`(permit_num,revision_num,neighbourhood_id,RESIDENTIAL,INTERIOR_ALTERATIONS,structure_type,project_type,issued_date) + `coa_applications`(decision,zoning_dominant_parcel_id); output `neighbourhood_build_norms`(all cols).
- **A-4 sparse:** `BUILD_NORM_MIN_SAMPLE` structural constant in `build-norms.js`; sparse nbhd → INFO (never FAIL); citywide fallback covers them.
- **A-5 records_total:** = deduped permit observations (one per `zoning_dominant_parcel_id` per window) — mirror `compute-storey-norms` (NOT neighbourhood rows written).
- **A-8 CRITICAL_FIELDS:** add `RESIDENTIAL` (+ keep `STOREYS` monitored) to `load-permits.js` `CRITICAL_FIELDS` so re-drift is caught, not silent-0-filled; update the `emitMeta` reads-array (L666) with the new occupancy cols.
- **A-10 empty-DB:** write the citywide NULL row even when `obs.length === 0` (avoid the NULL-norm cliff that nulls every parcel's `cur_gfa` range).
- **B-9 dedup:** select the **principal building row** (max `RESIDENTIAL`) per project — NOT the highest-CKAN-id row (which can be the blank MEP companion). Reuse `compute-storey-norms`'s `zoning_dominant_parcel_id` dedup key, not a new address normalizer.
- **B-1 build-ratio (CORRECTNESS):** compute a **separate old-stock ratio** for the current-home estimate — `existing_build_ratio_p25/p50` = median of `(1 − addition_delta_gfa ÷ max_build_gfa)` across addition permits per nbhd (≈0.62), DISTINCT from the new-build `build_ratio` (≈0.80). §G reads the old-stock ratio. (Resolves §N-#4.)
- **B-2 reno-%:** `nbhd_reno_kitchen/bath_pct` filtered on **scope-classified KIT/BTH permits** (via `classify-scope`/archetypes), not raw `INTERIOR_ALTERATIONS`; min-sample → citywide fallback.
- **B-7 schema:** `neighbourhood_build_norms` MUST include all §J columns (see migration below) — not the abbreviated blueprint §3.2 list.
- **Integration #2 manifest.steps:** add a `manifest.steps.compute_build_norms` def (`{file, supports_full, supports_dry_run, telemetry_tables:["neighbourhood_build_norms"]}`) AND the `chains.permits` array entry (after `classify_permits`, beside `compute_storey_norms`). `enrich_parcels` is a SEPARATE chain (cross-chain consume).
- **§3.6 fence (Guardian):** `load-permits.js` is the canonical §3.6 row-derived cascade — PRESERVE; new occupancy audit rows use the cascade.

## Key files
`scripts/load-permits.js` (occupancy map + CRITICAL_FIELDS + emitMeta array + principal-row dedup + **preserve §3.6 cascade**), `scripts/lib/build-norms.js` (NEW pure — norm SQL + constants + parity), `scripts/compute-build-norms.js` (NEW, **Mutator**, lock 78, Spec 47 skeleton, permits chain), `scripts/manifest.json` (steps def + chains.permits), `migrations/NNN_permits_occupancy_columns.sql`, `migrations/NNN_neighbourhood_build_norms.sql`, `src/tests/factories.ts`, `docs/specs/_contracts.json` (+ `contracts.infra.test.ts`).

## `neighbourhood_build_norms` columns (complete — §J)
`neighbourhood_id`(FK, +NULL citywide singleton via partial-unique idx), `window_start/end`, `new_builds_5yr`/`additions_5yr`/`renos_5yr`/`suites_5yr`/`demos_5yr`, `realized_fsi_p50`/`_p90`, `realized_coverage_p50`/`_p90`, `build_ratio_p50` (new-build), **`existing_build_ratio_p25`/`_p50`** (old-stock), `reno_kitchen_pct`/`reno_bath_pct`, `storeys_p50`/`_p90`, `coa_approved`/`_refused`/`_total`/`_approval_rate`, `reno_mix`(jsonb), `sample_n`, `data_provenance`.

## Round-3 protocol resolutions (folded)
- **Spec 78 file is a PRECONDITION** (Spec 47 §3/§5.2): create `docs/specs/01-pipeline/78_optimal_lot_configuration.md` AND register `'scripts/compute-build-norms.js': 78` in `src/tests/pipeline-advisory-lock.infra.test.ts` `LOCK_ID_REGISTRY` **before** committing the script (else the lock-registry test fails on merge).
- **`parcels.neighbourhood_id` EXISTS** (mig 196 / WF3-C2 — false-positive in review §4.2); cite it. `is_corner_lot`/`is_through_lot` exist (mig 176 / Spec 62).
- **Thresholds → `_contracts.json`** + `contracts.infra.test.ts` rows (eng-std §12.10): `BUILD_NORM_MIN_SAMPLE`, `build_ratio_null_rate` WARN cutoff (0.50), comp tolerances (±20% lot/frontage, 1.5 km), over-capture clamp 1.1. **Classify each (Spec 47 §4.1/§R4):** operator-tunable (`min_sample`, null-rate cutoff, comp tolerances → `logic_variables` + Zod) vs structural (percentile choice, 1.1 clamp → shared-lib constant in `build-norms.js`).
- **First-deploy runbook (Spec 48 §3.7):** the one-time `permit_gfa`/occupancy spike on ~237K permits needs `docs/runbook/permit_occupancy_first_deploy.md` + pre-ack + exit criteria.
- **Protocol details:** `getDbTimestamp` once **inside** `withAdvisoryLock` (§6.1); `records_total` = mirror `compute-storey-norms`'s primary-entity choice (§11.1); INFO rows emit **at value 0** (§48 §3.6); §R5 startup guards for any SQL `ANY(...)` arrays.
- **FK:** `neighbourhood_build_norms.neighbourhood_id REFERENCES neighbourhoods(id) ON DELETE CASCADE` (§18.2).
- **load-permits cascade:** ALREADY the canonical row-derived cascade (round-2 verified L628-636) — preserve; new occupancy WARN rows ride it (no parallel-boolean upgrade needed).
- **Cross-chain first-deploy:** `enrich_parcels` (sources chain) reads `neighbourhood_build_norms` written by the permits chain → on first deploy run permits chain first; `enrich_parcels` already NULL-falls-back to the citywide row (which `compute-build-norms` writes even on empty, A-10).

## Spec refs
Spec 30 (Mutator), 47 (§R/§8/§11/§4.1/§6.1/§18), 48 (§3.6/§3.7), 41/43 (permits chain), 55 (`idx_parcels_geom_gist`). NEW spec **78**.

## DB Impact YES — metadata-only `permits` ALTER (nullable, no rewrite) + new norms table + FK + partial-unique citywide singleton. UP+DOWN, db:generate, factories, typecheck.
*(Full WF1 step list promoted into active_task on activation.)*
