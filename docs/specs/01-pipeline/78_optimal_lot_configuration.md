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
| `citywide_all_backstop_written` | `== 1` | **FAIL** if not (P2) |
| `citywide_family_rows` / `pocket_family_rows` / `detached_pocket_rows` | — | INFO (P2) |
| `citywide_detached_fsi_p90` | — | INFO (P2 — the R2 grounding value) |
| `low_sample_neighbourhoods` | — | INFO |
| `build_ratio_null_rate_pct` | `< 50%` (`BUILD_RATIO_NULL_RATE_WARN`; numerator + denominator both per-pocket-family, P2) | WARN above |
| `citywide_existing_build_ratio_p50` / `citywide_fsi_p50` | — | INFO (read from the `(NULL,'all')` backstop) |

> **P2 (family-aware):** the single citywide row became one row PER `structure_family` + a `(NULL,'all')` rollup. The old `citywide_fallback_written` INFO metric is now `citywide_all_backstop_written` (the `(NULL,'all')` backstop is the load-bearing fallback every read falls through to, so it is **FAIL**-gated, not INFO). Storey norms stay UNIFIED (not family-split).

### P1.4 — Cross-layer contracts (`docs/specs/_contracts.json` → `build_norms`)

`window_years` (5), `min_sample_default` (5), `over_capture_clamp` (1.1), `build_ratio_null_rate_warn`
(0.5) are pinned to `scripts/lib/build-norms.js` by `contracts.infra.test.ts`.

---

## §Phase-2 — Optimal-Config Engine (Behavioral Contract)

`scripts/lib/optimal-config.js` (NEW, pure — IO-free, never throws; mirrors `max-build.js`). The
budget-allocation engine that turns a lot's reliable inputs into the two build configurations. **DB
Impact: NONE** — Phase 2 is the engine + logic tests + by-law constants only; the parcel columns,
JSONB blobs, the enrich pass, position geometry, and comps all land in **Phase 3**.

### P2.1 — By-law constants (Toronto Zoning By-law 569-2013, Ch.150.7 in-force consolidation)

Verified 2026-06-26 against `toronto.ca/zoning/.../ZBL_NewProvision_Chapter150_7.htm`. Pinned to
`scripts/lib/optimal-config.js` via `_contracts.json` (`optimal_config` group) + `contracts.infra.test.ts`.

| Rule | Value | Citation |
|---|---|---|
| Garden footprint | **min(40% rear-yard, 60 m²)** | 150.7.60.70(1)(C) |
| All-ancillary lot coverage | **≤ 20% lot** | 150.7.60.70(1)(B) |
| Garden height by separation | **4.0 m** @ 5.0–7.5 m / **6.0 m** @ ≥ 7.5 m | 150.7.60.40(1) |
| Min separation from main | **5.0 m** (≤ 4.0 m suite) / **7.5 m** (> 4.0 m) | 150.7.60.30(1) |
| Soft landscaping (rear yard) | **≥ 50%** (frontage > 6.0 m) / **≥ 25%** (≤ 6.0 m) | 150.7.50.10(1) |
| Side setback | max(floor, 10% frontage) cap 3.0 m; floor 1.5 (openings) / 0.6 | 150.7.60.20(5) |
| Rear setback | 1.5 m (deep lot > 45 m → max(½ h, 1.5); through-lot → adjacent front) | 150.7.60.20(2)(3) |
| Garden GFA | **< main-house GFA** | 150.7.60.50(2) |
| Laneway footprint / abutment | ≤ 60 m² / `abuts_laneway ≥ 3.5 m` | (Changing Lanes) |
| Garage | one-car floor **18.5 m²** (never 0-car — Phase-0 fix); cap 60 m² | — |

> **`BYLAW_VERSION = '569-2013_consolidation_2025'`** stamped on every result. NB: a **2025 DRAFT**
> amendment (PH bg 256978) proposes removing the 40% rear-yard footprint term (keeping the 20% cap) +
> the angular plane — **NOT enacted**, so the 40% term is the baseline; the flag marks the consolidation
> in force so a future re-pin is a one-line constant + `bylaw_version` change.

### P2.2 — Engine outputs (`computeOptimalConfig(parcel)`)

- **as-of-right tier:** main build (footprint = coverage cap; storeys = nbhd `storeys_p50` **CAPPED at the
  parcel's own `max_build_stories` envelope**; GFA under the coverage **and** FSI caps — **NULL-FSI guard:**
  absent FSI → GFA = footprint × storeys, never unbounded) + **suite-if-fits** + garage. **WF3 envelope cap:**
  as-of-right cannot exceed the lot-validated max-build envelope (you cannot build MORE than the legal max
  as-of-right — that overshoot belongs to the CoA tier). The cap = `max_build_stories`, or for a HERITAGE
  freeze (where that column is NULL) the derived frozen storeys `round(max_buildable_gfa ÷ footprint)` —
  guarded on `max_buildable_gfa_basis='heritage_existing'` so it never mis-caps an FSI-bound parcel. Counted
  `opt_aor_envelope_capped_count`.
- **CoA-upside tier:** **storeys = nbhd `storeys_p90`** at the SAME footprint (CoA = up, not out —
  validated); `opt_coa_gfa_uplift_sqm` = the storey-driven GFA delta.
- **Suite fit is conservative (field-spec §P):** evaluated against the CURRENT building's rear-yard
  envelope, not a hypothetical max-rebuild. A depth-constrained yard **shrinks** the suite (a smaller
  suite is always permitted) rather than failing; only a yard too shallow for the minimum-separation
  suite fails. Laneway preferred where a lane abuts (separate access, no rear-yard consumption) — the
  abutment gate prefers a metres signal (`abuts_laneway_m ≥ 3.5`) but accepts the boolean
  `parcels.abuts_laneway` (Spec 62 #431-FU2 emits only the boolean today).
- **The 20% all-ancillary cap is SHARED** across the suite, the garage, and any existing ancillary —
  the garage is allocated the headroom REMAINING after the chosen suite, never the full cap twice. The
  60 m² garden cap is a **footprint** (lot-coverage) limit (verified — a 2-storey suite reaches ≤ 120 m²
  GFA), distinct from the GFA `< main-house` rule.
- `opt_binding_constraint` ∈ {coverage, fsi, depth, soft_landscaping, holding, heritage, ravine,
  through_lot}; `opt_config_confidence` ∈ {high, medium, low} (lot-size confidence, FSI presence,
  suspected existing accessory — comp-count joins it in Phase 3).
- **Trade-off resolver:** `opt_suite_adds_value` records whether main+suite beats main-only total GFA.
- **Gates:** holding zone → as-of-right suite suppressed (`binding=holding`); CoA tier may relieve a
  heritage-massing freeze but never a holding zone.

### P2.3 — Tests
`src/tests/optimal-config.logic.test.ts` pins every by-law branch + the orchestration (garden footprint
cap, soft-landscape 50/25 boundary at 6.0 m, height-by-separation, side/rear setback, NULL-FSI guard,
suite-fit-vs-current-building + depth-shrink, CoA storeys-not-footprint, through-lot → no suite, holding
→ gated, laneway preference, confidence degradation). Generated-SQL dual-path: the engine is the single
JS source the Phase-3 `enrich-parcels.js` pass calls (no TS twin).

## §Phase-3A — Optimal-Config Enrich Pass (Behavioral Contract)

The 4th `enrich-parcels.js` pass writes the §I headline columns + §J `nearby_builds_summary` per
residential parcel by calling the Phase-2 engine. **(3B = imagery rename + §G/§H/§L/§M degrade; 3C =
comparable-builds kNN — separate commits.)**

### P3A.1 — Architecture: a JS-streaming pass
Unlike the SQL-generated passes (zoning / max-build / existing-structure, all in one `withTransaction`),
the optimal-config pass consumes the **per-row** pure engine `optimal-config.js#computeOptimalConfig`.
It therefore **streams** eligible parcels (`pipeline.streamQuery`), maps each row → engine input, and
**batch-UPDATEs** (`UPDATE … FROM (VALUES …)`, ~500/batch). It runs **AFTER the SQL passes COMMIT** —
`streamQuery` uses a separate connection, so it reads the just-committed max-build envelope (a same-txn
read would be invisible). Eligibility: `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm > 0`;
`--full` recomputes all, incremental does only `opt_config_confidence IS NULL`.

### P3A.2 — Inputs (parcels + neighbourhood_build_norms, citywide fallback)
The streaming SELECT joins `neighbourhood_build_norms` on `neighbourhood_id` with a **citywide-fallback
CROSS JOIN** (`COALESCE(nbn.*, cw.*)`, `used_citywide = nbn.id IS NULL`). Maps: coverage % → fraction;
`bylaw_max_fsi` → `fsiCap` (NULL guarded by the engine); storeys = nbhd p50/p90 falling back to the
parcel's own `max_build_stories`; `abuts_laneway` (boolean → the engine's boolean gate); `zoning_holding
= 'H'` → `isHolding`; `is_heritage_designated` → `isHeritageFreeze` (heritage suite → CoA, conservative);
`is_through_lot`, `is_in_ravine_protection_area`; `existing_greenspace_sqm` → `rearYardAreaSqm` (open-yard
proxy); **`rearBehindMaxM = null` → engine area-only suite fit** (precise ST_Difference position geometry
is a Phase-3 refinement). `exception_number` present → confidence never claims `high` (unparsed provision).

### P3A.3 — Outputs (§I + §J)
`opt_aor_storeys/gfa_sqm/units` (units = 1 + suite), `opt_coa_storeys/gfa_sqm` (p90 storeys, same
footprint), `opt_suite_type` (garden/laneway/none), `opt_suite_fits_full`, `opt_binding_constraint`,
`opt_config_confidence`, `optimal_config` (full engine result JSONB), `nearby_builds_summary` (frozen
`neighbourhood_build_norms` snapshot + a human headline). Disjoint column set (own pass — the
max-build/existing-structure columns are untouched). Idempotent.

### P3A.4 — Observability
INFO audit rows: `optimal_config_enriched_count`, `opt_suite_fits_full_count`,
`opt_config_confidence_high/medium/low_count`, `opt_config_citywide_fallback_count`; **gated**
`opt_config_engine_errors` (`== 0`, else FAIL — a per-row engine throw is caught, counted, and never
aborts the stream). Spec 48 §3.6 row-derived cascade.

## §Phase-3B — Imagery-Roof Honesty Rename (Behavioral Contract)

`existing_footprint_sqm` / `existing_gfa_sqm` (massing/imagery roof footprint + footprint×2) are
unreliable per-parcel (±20–38%, tree-contaminated — the massing-footprint-reliability investigation).
Their `existing_*` names falsely presented them as authoritative existing-structure sizes. **Migration
201 renames them to `imagery_roof_footprint_sqm` / `imagery_roof_gfa_sqm` across parcels + permits +
coa_applications** — the column NAME now tells the truth (transparency initiative).

- **Array-driven:** `EXISTING_COLS` (`max-build.js`) is the single source for the existing-structure
  UPDATE + the permits/coa propagation + orphan-nullify + emitMeta — renaming its two entries (plus the
  `buildExistingStructureSql` CTE aliases that feed it) flows the rename through every surface.
- **Cost-model SAFETY (the load-bearing fence):** the cost-model `geom_basis` does **NOT** read these
  columns — WF3-A remapped `ARCHETYPE_GEOM_BASIS` ADD/BAS→`cur_floor_gfa_sqm`, INT→`cur_pot_2story_gfa_sqm`.
  `imagery-roof-rename.regression.test.ts` locks that decoupling (JS↔TS) so a future re-coupling — which
  would null ADD/BAS/INT cost estimates across 486K parcels — fails the test first.
- **Untouched:** the max-build heritage fallback's `existing_footprint_sqm` is a query-LOCAL CTE alias
  recomputed from massing (not the persisted column) — intentionally not renamed.
- **(§G/§H neighbourhood-calibrated cur-GFA range = deferred — blocked on the residential_sqm backfill.)**

## §Phase-3C — Comparable-Builds kNN (Behavioral Contract)

`comparable_builds` (mig 202) is the parcel-level NAMED evidence of what nearby *comparable* lots
actually built — the complement to §J `nearby_builds_summary` (neighbourhood aggregate). A 4th SQL pass
in `enrich-parcels.js` (inside the main txn — reads the same-txn max-build envelope + imagery-roof
footprint + committed permits/coa).

### P3C.1 — The kNN (not a 486K cross-join)
1. **Materialize the candidate set ONCE** into an `ON COMMIT DROP` temp table (`comp_cand`) with a GiST
   geom index: parcels with a recent (5-yr) new-build/addition permit (~9.6K). It starts FROM the
   filtered permit set + pre-aggregates the principal permit + CoA decision (DISTINCT ON) THEN joins
   parcels — a parcels-driven scan with a per-row CoA LATERAL was a >90s plan; this is ~11s.
2. **Per subject** (residential parcel with a max-build envelope, scoped at SOURCE + incremental on
   `comp_count IS NULL`): a LATERAL **GiST kNN over-fetch** of the 50 nearest candidates → **post-filter**
   same `zoning_class` + lot/frontage within **±20%** → keep the **10 most similar** (`|Δlot| +
   |Δfrontage|·10`) → `jsonb_agg` nearest-first.

### P3C.2 — Columns (§K)
`comparable_builds` (jsonb array of `{address, lot_sqm, frontage_m, distance_m, work_type,
permit_gfa_sqm, permit_fsi, storeys, coa_decision, build_ratio}`), `comp_count`, `comp_dominant_build`
(modal work_type), `comp_build_ratio_p50`, `comp_fsi_p50`. **Over-capture exclusion:** a comp's
`build_ratio` (imagery roof footprint ÷ max-build) **> 1.1** (physically impossible — massing noise) is
kept in the evidence array but **EXCLUDED from `comp_build_ratio_p50`**. **`comp_fsi_p50` is NEW-BUILD comps
ONLY (WF3):** an addition's `residential_sqm` is the INCREMENT, not a whole building, so its FSI (~0.13) is
incommensurable with a new-build FSI (~0.7) — mixing them dragged the scalar to ~0.19 (~3× understated).
The scalar is the median `permit_fsi` over comps where `work_type='new_build'` AND `permit_fsi ∈ [0.05, 8]`
(two-sided plausibility band: > 8 = a data-entry outlier; < 0.05 = a mislabeled minor permit typed new_build).
The `comparable_builds` ARRAY still lists additions as renovation-activity evidence, and `comp_dominant_build`
is still modal over all comps. A subject with no in-band new-build comp → `comp_fsi_p50 = NULL` (honest — no
comparable *build*). Post-fix median = 0.695 ≈ the independent `neighbourhood_build_norms.realized_fsi_p50`
(0.696). Idempotent: full re-run resets the scope first; subjects with no match get `comp_count = 0`.

### P3C.3 — Deferred
- The `(zoning_class, lot_size_sqm)` CONCURRENTLY index (impl-plan §4.6) is **not needed** with the
  materialized-candidate kNN (the temp-table GiST index serves the kNN; the post-filter runs on the
  cheap 50-nearest set) — add only if a non-materialized shape is ever used.
- `permit_gfa_sqm`/`permit_fsi` are NULL until the `residential_sqm` backfill (next load-permits run).
- Feeding `comp_count` back into `opt_config_confidence` (§9) — comp runs after the optconfig pass; a
  small follow-up can reorder or re-read.

## §4D — Optimal-config + comp propagation to permits/CoA (Spec 49 completeness)

The lot-driven outputs are computed on `parcels`, but the lead surfaces are `permits` + `coa_applications`.
§4D propagates the **flat optimal-config + comp headline scalars** from the dominant parcel onto both lead
tables (via the existing `enrich-permits.js` dominant-parcel propagation), so a lead is directly
filterable/sortable on the optimal config — closing the Spec-49 completeness gap (the older
lot/max-build/existing/scenario scalars already propagate; the new `opt_*`/`comp_*` did not).

- **13 flat scalars** (migration 204, nullable on permits + coa): `opt_aor_storeys`, `opt_aor_gfa_sqm`,
  `opt_aor_units`, `opt_coa_storeys`, `opt_coa_gfa_sqm`, `opt_suite_type`, `opt_suite_fits_full`,
  `opt_binding_constraint`, `opt_config_confidence`, `comp_count`, `comp_dominant_build`,
  `comp_build_ratio_p50`, `comp_fsi_p50`. **`opt_suite_fits_full` is NULLABLE** (plain `BOOLEAN`) — an
  orphan lead (no dominant parcel) resets it to **NULL** (= "no parcel match"), via the generic
  orphan-nullify path, NOT the `= false` reset used for the NOT-NULL max-build bools.
- **Single source:** `OPT_COMP_PROP_COLS` in `scripts/lib/optimal-config-cols.js` (a neutral leaf module —
  avoids a `max-build.js` domain-mismatch and an `enrich-parcels.js` import cycle). A regression test pins
  it to `(OPTCFG_WRITE_COLS ∪ COMP_WRITE_COLS) − the 3 JSONB`.
- **JSONB excluded:** `optimal_config`, `comparable_builds`, `nearby_builds_summary` stay parcel-scoped
  (heavy; reachable via `zoning_dominant_parcel_id`) — §4D delivers the queryable scalars to the leads.
- **Wiring:** `OPT_COMP_PROP_COLS` flows into `allWriteCols` (→ the `IS DISTINCT FROM` SET-guard +
  emitMeta writes), the `par.col`/`dom.col AS col` propagation CTE, the generic orphan-nullify, the
  emitMeta `parcels` reads, an `assertOptConfigColumns` precondition, per-run `enrich-permits` audit rows,
  and per-column `assert-global-coverage` INFO rows (both surfaces). Idempotent; dominant-pick + no-ping-pong
  fences preserved.
- NB: `opt_config_confidence` is computed before the comp pass, so it does not yet incorporate `comp_count`
  (the deferred §P3C feedback) — propagated as-is.

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
