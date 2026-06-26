# Spec 78 — Optimal Lot Configuration

**Status:** Phase 1 implemented (Permit-Data Foundation). Phases 2–4 designed, not built.
**Domain:** Backend / Pipeline. **Advisory lock / spec number:** 78.
**Design reports (authoritative for the full epic):**
`docs/reports/optimal-lot-configuration-implementation-plan.md`,
`docs/reports/enriched-parcels-field-spec.md`,
`docs/reports/massing-footprint-reliability-investigation.md`.

---

## 1. Goal

Model the **optimal build configuration available for a lot** — what a parcel *could* reliably support
(new build + accessory suite + garage + greenspace/solar), calibrated against **what neighbours have
actually built and what the Committee of Adjustment has actually approved** over a rolling window.

This replaces the abandoned approach of measuring the *existing* structure from massing/imagery, which
the reliability investigation proved unreliable per-parcel (±20–38%, tree-contaminated heights). The
lot-driven max-build envelope (Spec 65 §4) is the reliable anchor; this spec adds the **market-realized
calibration layer** so per-parcel outputs (current-GFA range, CoA upside, reno scope) are grounded in
real permit/CoA outcomes, not idealized geometry.

> **MARKET-REALIZED, NOT LEGAL.** Permit data skews to maximizers. Every norm here is *realized*
> (what got built/approved), **not** a by-law ceiling. Consumers must treat these as empirical priors.

### Phase map

| Phase | Scope | State |
|------|-------|-------|
| **1** | **Permit-Data Foundation** — ingest unused CKAN occupancy floor-area columns; build `neighbourhood_build_norms` (realized FSI, build-ratios, old-stock ratio, reno-%, storey norms, CoA approval). | **Built (this spec §Phase-1).** |
| 2 | Optimal-config engine — per-parcel optimal new-build + accessory + greenspace/solar fit. | Designed. |
| 3 | Parcel new-fields pass + degrade/retire unreliable existing-structure fields + nearby-builds & comps summary. | Designed. |
| 4 | Chain validation + forecast/cost reconciliation. | Designed. |

---

## §Phase-1 — Permit-Data Foundation (Behavioral Contract)

### P1.1 — Permit occupancy ingest (`scripts/load-permits.js`, migration 198)

The Toronto "Active Permits" CKAN feed carries occupancy floor-area columns the loader never mapped.
Phase 1 maps seven of them to `permits.*_sqm` (all `NUMERIC`, nullable):

| CKAN column | `permits` column | Meaning |
|---|---|---|
| `RESIDENTIAL` | `residential_sqm` | **Authoritative GFA of the permit work** — new-build *total*, addition *delta*. ~37% raw fill. |
| `INTERIOR_ALTERATIONS` | `interior_alterations_sqm` | Interior-reno area. Sparse for residential. |
| `ASSEMBLY` | `assembly_sqm` | Use-class breakdown. |
| `INSTITUTIONAL` | `institutional_sqm` | " |
| `MERCANTILE` | `mercantile_sqm` | " |
| `INDUSTRIAL` | `industrial_sqm` | " |
| `BUSINESS_AND_PERSONAL_SERVICES` | `business_personal_services_sqm` | " |

- **`cleanArea()`** cleans each cell: shares `cleanCost()`'s junk-sentinel guard (`DO NOT UPDATE/DELETE`),
  and additionally maps **`0`, negative, and empty → `null`** (a zero/negative GFA would poison the
  build-norm percentiles; "no residential area" and "unmapped" are treated alike).
- **`RESIDENTIAL` is added to `CRITICAL_FIELDS`** — if Toronto drops the column from the feed, the load
  **aborts** (schema-drift guard) rather than silently losing the GFA that every norm calibrates against.
  `STOREYS` remains *monitored but non-critical* (it has intermittently dropped from the feed).
- **Preserved fences:** the `data_hash IS DISTINCT FROM` change-detection guard (Spec 48 §3.6 cascade)
  and the CKAN-pagination no-ping-pong dedup (`deduplicateRecords`, highest `_ckan_id` wins) are
  unchanged. Adding the new fields to the hashed map causes a **one-time re-hash spike** on first deploy
  (every permit's `data_hash` changes) — see the runbook.

### P1.2 — `neighbourhood_build_norms` (migration 199, `scripts/compute-build-norms.js`)

A **recomputed snapshot** (truncate-replace, Mutator archetype) of realized build/reno activity per
neighbourhood over the `BUILD_NORM_WINDOW_YEARS` (= 5) permit window. One row per neighbourhood + **one
citywide-fallback row** (`neighbourhood_id IS NULL`, a partial-unique index enforces exactly one).

**Row shape** (see migration 199 for column COMMENTs):

- Counts: `new_builds_5yr`, `additions_5yr`, `renos_5yr`, `suites_5yr`, `demos_5yr`; `reno_mix` (jsonb).
- `realized_fsi_p50/p90` — `RESIDENTIAL ÷ lot_size_sqm` among new builds.
- `build_ratio_p50` — **new-build** `RESIDENTIAL ÷ max_buildable_gfa_sqm` (≈0.80). Realized maximizer ratio.
- `existing_build_ratio_p25/p50` — **old-stock** `clamp(1 − addition_delta ÷ max_build_gfa, 0, 1)` (≈0.62).
  The pre-reno current-home fraction of max-build; drives the per-parcel current-GFA range. **Distinct**
  from `build_ratio_p50`.
- `reno_kitchen_pct`, `reno_bath_pct` — scope-classified `INTERIOR_ALTERATIONS ÷ max_build_gfa`.
- `storeys_p50/p90` — joined from `neighbourhood_storey_norms` (Spec 65 §8). `compute_build_norms` runs
  **after** `compute_storey_norms` in the chain.
- `coa_approved/refused/total/approval_rate` — from `coa_applications` over the same window.
- `sample_n`, `low_sample` (`sample_n < BUILD_NORM_MIN_SAMPLE_DEFAULT`, = 5), `data_provenance`
  (`'market_realized_5yr'`), `window_start/end`, `computed_at`.

**Observation derivation (the `obs` CTE):**

- **One observation per `(zoning_dominant_parcel_id, kind)`** via `DISTINCT ON`, principal row = **max
  `residential_sqm`** (deterministic tiebreak on `issued_date DESC, revision_num DESC`). Mirrors the
  storey-norms dominant-parcel dedup; does **not** re-invent address matching.
- **`kind`** classified by `build-norms.js#classifyKind` / `buildKindCaseSql` (single SQL↔JS source,
  parity-tested): `suite > demo > new_build > addition > kitchen > bath > reno > other`.
- Every ratio CASE **guards `residential_sqm > 0`** — Postgres `LEAST/GREATEST` ignore `NULL` args, so a
  NULL-residential permit would otherwise compute `existing_ratio = 0.0` (not `NULL`) and silently
  collapse the percentile toward zero. This guard is the load-bearing correctness invariant of P1.2.
- `build_ratio` percentile excludes ratios `> OVER_CAPTURE_CLAMP` (= 1.1) as massing over-capture.
- Only parcel-linked, neighbourhood-resolved permits in-window are observed.

**Citywide fallback is written UNCONDITIONALLY** (even on empty/sparse observations, `low_sample`
forced `false`) so the per-parcel optimal-config range never NULL-collapses on a thin neighbourhood.

### P1.3 — Audit rows (Spec 47 §8.2 / Spec 48 §3.6 row-derived cascade)

`emitSummary` `records_meta.audit_table` rows (verdict derived from the rows, never a parallel boolean):

| metric | threshold | status |
|---|---|---|
| `neighbourhoods_computed` | `> 0` | WARN if 0 |
| `low_sample_neighbourhoods` | — | INFO |
| `citywide_fallback_written` | `== 1` | INFO |
| `build_ratio_null_rate_pct` | `< 50%` (`BUILD_RATIO_NULL_RATE_WARN`) | WARN above |
| `citywide_existing_build_ratio_p50` | — | INFO |
| `citywide_fsi_p50` | — | INFO |

### P1.4 — Cross-layer contracts (`docs/specs/_contracts.json` → `build_norms`)

`window_years` (5), `min_sample_default` (5), `over_capture_clamp` (1.1), `build_ratio_null_rate_warn`
(0.5) are pinned to `scripts/lib/build-norms.js` by `contracts.infra.test.ts`.

---

## 2. Operating Boundaries

### Target Files
- `scripts/load-permits.js` (occupancy ingest), `scripts/lib/build-norms.js` (NEW, pure),
  `scripts/compute-build-norms.js` (NEW, Mutator), `scripts/manifest.json` (chain wiring),
  `migrations/198_permits_occupancy_columns.sql`, `migrations/199_neighbourhood_build_norms.sql`,
  `docs/specs/_contracts.json` (`build_norms` group), `docs/runbook/permit_occupancy_first_deploy.md`.

### Out-of-Scope Files
- `scripts/enrich-parcels.js` and the parcel new-fields / degrade-retire pass — **Phase 3**.
- Any optimal-config engine or comps kNN — **Phases 2–3**.
- `cost_estimates` / `trade_forecasts` reconciliation — **Phase 4**.

### Cross-Spec Dependencies
- **Relies on:** Spec 65 §4 (max-build envelope: `max_buildable_gfa_sqm`, `lot_size_sqm`), Spec 65 §8
  (`neighbourhood_storey_norms`), Spec 47 (script protocol), Spec 48 §3.6/§3.7 (cascade + first-deploy
  runbook), Spec 30 (Mutator archetype), Spec 41/55 (lifecycle/CoA linkage of `coa_applications`).
- **Consumed by:** Phases 2–3 (optimal-config engine + parcel calibration), Phase 4 (forecast/cost).

---

## 3. Cross-references
- **Spec 65** — enrich-parcels; max-build envelope + storey norms this calibrates against; Phase 3 degrades several of its existing-structure fields.
- **Spec 47** §R1–R12 — `compute-build-norms.js` skeleton (lock 78, `getDbTimestamp`, `withTransaction`, `emitSummary/emitMeta`).
- **Spec 48** §3.6 row-derived verdict cascade + §3.7 first-deploy runbook.
- **Spec 30** — Mutator archetype (recomputed summary table).
- Design reports listed in the header are authoritative for Phases 2–4.
