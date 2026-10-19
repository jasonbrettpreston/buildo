# Spec 78 — Optimal Lot Configuration

**Status:** Built — Phases 0-3 + 4A + 4D shipped/PUSHED; only forecast/cost reconciliation moved to Spec 88.
**Phase 3 amendment (McBylaw):** §6 + Known Failure Modes + Appendix R — RATIFIED 2026-10-07 (operator; Spec 69 M-61..M-72; folded with the matrix + red-team, §6.12). Trial quantities stay to be measured (M-70); nothing is built. **Pre-lock fixes 2026-10-07** from the Phase 3 trial: §6.13 (Spec 69 dated notes on M-63, M-64, M-70, M-72).
**Domain:** Backend / Pipeline. **Advisory lock / spec number:** 78.
**Policy pair (2026-10-18):** this spec is the behavioural contract (what is computed and how); **Spec 131 — Lot Configuration Policy** (`131_lot_configuration_policy.md`) registers every rule and decision that governs it (rows LC-n), as Spec 69 does for Spec 68 and Spec 124 for Spec 122. On a policy question Spec 131 governs; on behaviour, this spec.
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
| 2 | Optimal-config engine — per-parcel optimal new-build + accessory + greenspace/solar fit. | **Built.** |
| 3 | Parcel new-fields pass + degrade/retire unreliable existing-structure fields + nearby-builds & comps summary. | **Built.** |
| 4 | Chain validation + forecast/cost reconciliation. | **4A + 4D built (shipped/PUSHED);** forecast/cost reconciliation moved to Spec 88. |
| 5 | **Max-build scenarios (McBylaws Airtight)** — net-new step `compute_maxbld_scenarios`: per-form max build, roof forms, houseplex units, jointly optimized rear suite, three user-input-first renovations (§Phase-5). Policy: Spec 131. | **PROPOSED 2026-10-18** (docs only). |

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

> **WF3 (per-neighbourhood `all` rollup):** P2 wrote per-pocket rows ONLY for typed families (detached/townhouse/multiplex) — a generic-R / non-family parcel (`norm_family='all'`) had no per-pocket `all` row to resolve, so the P3A join's `nbn` tier missed and it fell straight to the CITYWIDE narrative (36% of parcels; 78% of them family=`all`). Now `compute-build-norms.js` ALSO writes a per-neighbourhood `(neighbourhood_id,'all')` rollup (family-agnostic aggregate over ALL builds in the boundary — mirrors the `(NULL,'all')` citywide rollup, `GROUP BY neighbourhood_id`; `sample_n ≥ 1`, real builds, invents nothing). Recovers ~126,670 parcels to their OWN pocket (`basis='neighbourhood'` share 64%→~92%). **No read-side change**: the existing `nbn` join already binds `structure_family = parcelFamilyFromZoningCaseSql(...)` (literal `'all'` for generic-R), so those parcels auto-resolve the new row and `used_citywide` self-corrects. New INFO metric `pocket_all_rollup_rows`; `pocket_family_rows` / `build_ratio_null_rate` stay family-only (exclude `'all'`).

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

> **Superseded in part (2026-09-29):** "footprint = coverage cap" and the `'coverage'` binding label — see §5.2 S1/S2 (Spec 67 is the MaxBuild source).

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
`--full` recomputes all. **D4' recovery bound (WF3 EP-D14 amendment, 2026-09-09; F6-corrected, output
panel, same day — the original "superset of the stream's scope" framing had the argument backwards):**
under `--full`, stamping a pending row `consumed_at` WITHOUT recompute is BYTE-IDENTICAL to the legacy
per-parcel loop's own output for both populations the pending set can contain. A pending parcel that is
no longer eligible (`max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm > 0` now excludes it) —
the legacy per-parcel query already returned zero rows for it and stamped `consumed_at` ANYWAY; the new
set-based stamp reproduces that outcome with no query needed to discover it. A pending parcel that IS
still eligible — the `--full` stream itself scans every currently-eligible parcel in this SAME
invocation, so it has already recomputed and flushed that exact parcel; recovering it again would
write nothing new. Excepting only parcels that threw an engine error in THIS run's own stream, which stay
unconsumed for a future recovery to genuinely retry. Under incremental the pending set CAN fall
genuinely outside the stream's own staleness predicate (a stale parcel from a run whose own pass 5
never got to recompute it), so it IS recovered there — batched (`ANY($1::int[])`,
`enrich_parcels_scope_recovery_batch_size` at a time), never per-parcel; a per-parcel loop is an
unindexed full scan (no index leads on `parcel_id`) and does not scale past a few thousand rows.
**Incremental (WF3 D-D staleness amendment):** selects `opt_config_confidence
IS NULL` **OR** stored `optimal_config→'as_of_right'→'main_footprint_sqm' IS DISTINCT FROM
`max_buildable_footprint_sqm` — a parcel whose envelope moved after configuration is stale and MUST
recompute (the engine always writes `main_footprint_sqm` = the streamed footprint, `NUMERIC(12,2)`/
round2 identity, so the comparison is byte-level convergent: steady-state re-runs select 0 rows; a
NULL `optimal_config` with non-NULL confidence also fires). **Ineligibility reset (extended):** before
streaming, `opt_*` are NULLed for in-scope rows with `opt_config_confidence IS NOT NULL` that the
stream can never select — `max_buildable_footprint_sqm IS NULL` **OR `(lot_size_sqm > 0) IS NOT TRUE`**
(three-valued logic: `NOT (lot > 0)` silently drops NULL lots; `IS NOT TRUE` catches NULL and ≤ 0,
exactly complementing the stream's `lot_size_sqm > 0`). **Engine-side twin:** `buildTier` never falls
back to the ravine-blind `coverageCapFrac × lotSizeSqm` footprint for a ravine parcel with a NULL
envelope footprint (the D-C constrained class had its envelope deliberately withheld) — it emits a
NULL tier; non-ravine NULL-footprint callers keep the fallback.

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

**WF3 (owner-report FSI fallback):** `nearby_builds_summary` carries a `typical_fsi` = `comp_fsi_p50 ?? realized_fsi_p50` + a `comp_fsi_basis` ∈ {`comp`, `pocket_realized`, `none`}. `comp_fsi_p50` (§P3C, new-build comps only) is honestly NULL on addition-dominated pockets (~63% of parcels) — so the narrative falls back to the pocket's realized new-build FSI (same units, also new-build-only) and the headline always shows a `~X.XX FSI` figure instead of a blank. The raw `comp_fsi_p50` column is unchanged.

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
   *Standing limitation (WF3 D-D note): the `comp_count IS NULL` incremental predicate never revisits a
   parcel whose envelope later changed — comp evidence can go stale between `--full` runs. The
   operational heal is the full comps pass every `--full` re-run; a staleness predicate here is out of
   scope (filed in `docs/reports/review_followups.md`).*
   same `zoning_class` + lot/frontage within **±20%** → keep the **10 most similar** (`|Δlot| +
   |Δfrontage|·10`) → `jsonb_agg` nearest-first.

**Amendment (pilot 9 commit 8 P4, peel 8y, 2026-09-08 — EP-D8, `docs/reports/defect-ledger.md`):
comp-match family/zone compatibility invariant.** This section's own text above predates the R4
dwelling-family match (`scripts/lib/compute/enrich-parcels.js`'s `buildCompCandidatesSql`/
`buildComparableBuildsUpdateSql`): a subject with a SPECIFIC dwelling family (detached/townhouse/
multiplex, derived from `zoning_class`) matches comps of the SAME built family; a subject with the
generic `'all'` family (non-RD/RS/RT/RM zoning, e.g. `R`/`RA`/`RAC`) falls back to an EXACT
`zoning_class` match. **Neither the pre-R4 text above nor R4 itself ever stated a structure-scale/
type compatibility rule for that generic `'all'` fallback** — a genuine spec-silent gap, not a
regression against prior text (confirmed: grepped, zero `structure_family`/scale-compatibility
clause anywhere in §Phase-3C before this amendment). Consequence, measured live: a subject zoned
generically `R` (dwelling family `'all'`) could match a comp whose OWN permit was apartment/
high-density-scaled — the comp's own `comp_family` also fell back to `'all'` via the SAME
zoning-derived rule (its own permit `structure_type` unclassifiable as detached/townhouse/
multiplex) — because the fallback branch checked `zoning_class` equality only, never the comp's
built scale or classifiability. Parcel 8244 (`R` zoning, physically detached, 290 m² lot) carried
`comp_fsi_p50 = 6.615` sourced from a comp permit with `1,695 m²` GFA. **Rule, stated now:** the
generic `'all'`-family fallback additionally requires the comp's own permit `structure_type` to be
genuinely classifiable as one of the three recognized low-density families (detached/townhouse/
multiplex) — an unclassified or high-density permit (the same test `structureFamilyCaseSql` already
applies to derive `comp_family` itself) may never satisfy the fallback match, even when its
`zoning_class` happens to equal the subject's. The specific-family branch (`near.comp_family =
s.subj_family`) is UNCHANGED — it was never the defect (a specific family already requires the
comp's own built form to match, by construction).

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

## §5 — MaxBuild source: Spec 67 (added 2026-09-29)

The envelope this spec consumes is **computed** by Spec 65 §4 and **derived / explained** by Spec 67 (`docs/specs/01-pipeline/67_maxbuild_bylaw_derivation.md`): the as-built field table with generated formulas, the by-law claim ledger, and scenario walk-throughs with worked numbers. Spec 67 keeps AS-BUILT separate from the QUEUED, not-implemented by-law WF2 (`.cursor/wf2_bylaw_formula_fixes_active_task.md`, mirrored in Spec 58 §13). Nothing in this section changes Phases 1–4D behaviour.

### §5.1 — MaxBuild fields this spec needs (gap list generated by `spec67-gen/gap.js` against the Spec 67 field universe)

| Field | Status | Spec 67 reference | Spec 78 use | Named in Spec 78 before this section |
|---|---|---|---|---|
| `max_buildable_footprint_sqm` | as-built (value moves under EF-2) | Spec 67 §3.1 (writer `buildMaxBuildSql`) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | yes |
| `max_buildable_gfa_sqm` | as-built (value moves under EF-8) | Spec 67 §3.1 (writer `buildMaxBuildSql`) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | yes |
| `max_buildable_gfa_basis` | as-built (value moves under EF-11) | Spec 67 §3.1 (writer `buildMaxBuildSql`) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | **no (added here)** |
| `bylaw_max_fsi` | as-built | Spec 67 §3.1 (zoning pass ← Spec 58) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | yes |
| `bylaw_max_coverage_pct` | as-built | Spec 67 §3.1 (zoning pass ← Spec 58) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | **no (added here)** |
| `max_build_stories` | as-built (value moves under EF-6) | Spec 67 §3.1 (writer `buildMaxBuildSql`) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | yes |
| `zoning_holding` | as-built | Spec 67 §3.1 (zoning pass ← Spec 58) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | **no (added here)** |
| `exception_number` | as-built | Spec 67 §3.1 (zoning pass ← Spec 58) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | yes |
| `lot_size_confidence` | as-built | Spec 67 §3.1 (writer `buildMaxBuildSql`) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | **no (added here)** |
| `neighbourhood_id` | as-built | Spec 67 §3.1 (writer `buildMaxBuildSql`) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | yes |
| `zoning_class` | as-built | Spec 67 §3.1 (zoning pass ← Spec 58) | read by `buildOptConfigSelectSql` → `mapRowToEngineInput` | yes |
| `max_footprint_setback_sqm` | planned | Spec 67 §3.4 NF-17 | candidate input once landed (see notes) | **no (added here)** |
| `max_footprint_coverage_sqm` | planned | Spec 67 §3.4 NF-18 | candidate input once landed (see notes) | **no (added here)** |
| `max_footprint_binding` | planned | Spec 67 §3.4 NF-19 | candidate input once landed (see notes) | **no (added here)** |
| `building_type` | user-input (planned) | Spec 67 §3.4 NF-15 | candidate input once landed (see notes) | **no (added here)** |
| `bylaw_max_coverage_basis` | planned | Spec 67 §3.4 NF-8 | candidate input once landed (see notes) | **no (added here)** |
| `bylaw_max_fsi_basis` | planned | Spec 67 §3.4 NF-9 | candidate input once landed (see notes) | **no (added here)** |
| `bylaw_max_height_basis` | planned | Spec 67 §3.4 NF-7 | candidate input once landed (see notes) | **no (added here)** |
| `bylaw_min_rear_soft_landscaping_pct` | planned | Spec 67 §3.4 NF-13 | candidate input once landed (see notes) | **no (added here)** |
| `bylaw_min_soft_garden_suite_pct` | planned | Spec 67 §3.4 NF-24 | candidate input once landed (see notes) | **no (added here)** |
| `bylaw_min_soft_laneway_suite_pct` | planned | Spec 67 §3.4 NF-25 | candidate input once landed (see notes) | **no (added here)** |
| `opt_aor_gfa_sqm` | as-built Spec 78 output (value moves under EF-19) | Spec 67 §3.5 EF-19 | written by the optimal-config pass | yes |
| `opt_aor_storeys` | as-built Spec 78 output (value moves under EF-19) | Spec 67 §3.5 EF-19 | written by the optimal-config pass | yes |
| `opt_aor_units` | as-built Spec 78 output (value moves under EF-19) | Spec 67 §3.5 EF-19 | written by the optimal-config pass | yes |
| `opt_coa_gfa_sqm` | as-built Spec 78 output (value moves under EF-20) | Spec 67 §3.5 EF-20 | written by the optimal-config pass | yes |
| `opt_coa_storeys` | as-built Spec 78 output (value moves under EF-20) | Spec 67 §3.5 EF-20 | written by the optimal-config pass | yes |

*Planned* rows are candidates only: nothing reads them until the by-law WF2 (and, for `building_type`, the separate viewer-input WF1) lands.

### §5.2 — Stale references, marked superseded (original text above is kept)

- **S1 — §P2.2 "footprint = coverage cap".** *Superseded:* the as-of-right main footprint is `max_buildable_footprint_sqm` (`scripts/lib/optimal-config.js#buildTier`: `coverageFootprint = p.maxBuildableFootprintSqm ?? coverageCapFrac × lotSizeSqm`), i.e. Spec 65's `LEAST(buffer_area, box_area, coverage_cap)` (Spec 67 §5.1 step 7). The `coverageCapFrac × lot` term is a fallback reached only when the envelope footprint is NULL on a non-ravine parcel; the Phase-3A stream selects only `max_buildable_footprint_sqm IS NOT NULL`, so the enrich pass does not reach it.
- **S2 — §P2.2 `opt_binding_constraint = 'coverage'`.** `bindingConstraint` returns `'coverage'` as its default after the site gates, FSI and suite misses — including where the setback box or buffer, not coverage, set the footprint. Read it as "footprint-bound (setback or coverage)". The planned NF-19 `max_footprint_binding` (Spec 67 §3.4) is the field that separates the two.
- **S3 — §P3A.2 coverage mapping.** A NULL `bylaw_max_coverage_pct` means the by-law applies **no** lot-coverage limit (Spec 67 Appendix C G7; planned NF-8 `'unregulated'`), not "unknown". The envelope footprint the engine reads still includes Spec 65's zone-median coverage default on those lots (Spec 67 KFM-2; plan R1).
- **S4 — §P2.2 storey cap.** The as-of-right cap `max_build_stories` inherits Spec 65's height handling: with no height overlay, `max_build_height_m` and `height_implied` are NULL and `max_build_stories` is the uncapped pocket p50 (Spec 67 KFM-3; planned EF-5/EF-6).
- **S5 — §P3A.2 dwelling family.** The norm family is derived from `zoning_class` (`parcelFamilyFromZoningCaseSql`). The by-law's RT/RM branches key on the building type, which the plan models as the user-input NF-15 `building_type` (NULL default) — Spec 67 §6.12. No change until that field exists.
- **S6 — §P2.1 soft landscaping (150.7.50.10(1)).** Consistent with Spec 67 Appendix B ledger L20 (verbatim-verified: garden suite, 50 % for frontage > 6.0 m, 25 % for ≤ 6.0 m). The Spec 65 greenspace permission uses a different 30 %-of-lot heuristic (Spec 67 KFM-9).
- **S7 — planned value moves.** When the by-law WF2 lands, EF-19 / EF-20 move `opt_aor_*` / `opt_coa_*` (down in the common case; up where front-yard averaging applies — plan EF-4).
- **S8 — §2 Out-of-Scope bullets.** The bullets that place `scripts/enrich-parcels.js` and the optimal-config engine / comps out of scope date from Phase 1; Phases 2–3 are built (header Status). They are historical, not current scope.
- **S9 — §P2.1 suite constants are stale (2026-10-07).** The garden-suite footprint, height and separation values predate 849-2025 (KFM-78-5). Phase 3 replaces the whole §P2.1 table with Layer 1 rows read through Layer 2 (§6, Spec 69 P-8); until then the table records the as-built code, not the law.
- **S10 — the max-build pass is building-type-blind (2026-10-18; Spec 69 M-176, M-182..M-189; triage PIN-2).** Row 1 (`max_buildable_gfa_sqm`) and row 3 (`max_build_stories`) take one FSI and one storey value for every form, and storeys are height ÷ storey height. Corrected statements: (a) **main walls:** main-wall height limits the storey above `max(7.0 m; height − 2.5 m)` for one pair of walls, the side walls for 70 % of their width or the front and rear walls for 60 / 50 / 40 % by frontage tier (x.40.10(2); RT has none, M-186), so it changes GFA, not only massing (M-176(2)); (b) **attic:** the storey above the wall line counts either as a flat-roof storey set back 1.4 m from the front and rear walls (RD 10.20.40.10(4)(B), RS 10.40.40.10(6)(A), RM 10.80.40.10(6)(A)) or as attic floor area under 10.5.40.40(1) (clearance > 1.4 m, counted if 80 % has > 2.0 m and ≥ 10.0 m²) with dormers ≤ 40 % (M-184, M-185); (c) **houseplex:** FSI does not apply and storeys are not capped (x.40.40(1)(C), x.40.10(3)(C); M-183), nor FSI for a house with a secondary suite (M-182(4)). Per-form answers are the net-new step `compute_maxbld_scenarios`, **§Phase-5** (the §6.3 step; policy Spec 131); this pass is unchanged until its shadow passes (§Phase-5 O-11); the M-176(3) enrich_parcels change keeps its own night.

## §6 — McBylaw Phase 3: the by-law-driven report (RATIFIED 2026-10-07)

> **RATIFIED 2026-10-07 (operator).** The rulings are Spec 69 M-61..M-72; the standard is Spec 68 §11.1 and the §7.4 Layer 3 block. **Folded 2026-10-07** with the grounded matrix and the red-team (`.cursor/mcbylaw/phase3-check/MATRIX.md`, `REDTEAM.md`, evidence beside them) and the operator rulings of 2026-10-07; disposition per finding in §6.12. The CoA method (§6.4) follows the second look (`coa-second-look.md`). Quantities the trial measures (storage, runtime, the fitted CoA uplifts) stay "to be measured (M-70)". Nothing here changes Phases 1–4D behaviour until the Phase 3 plan is authorized and its shadow columns pass (M-71). Inputs: `.cursor/mcbylaw/phase3-prework/` (`field-inventory.md`, `generator-design.md`, `scenario-scan.md`, `scenario-clauses.json`, `coa-scenario-counts.json`, `coa-analysis.md`). Evidence tags: *[measured]* a query or script ran · *[read]* code or clause text · *[inferred]* not executed.

### 6.1 What the report delivers

For each residential parcel in scope: **report fields × permitted scenarios × {as-of-right, CoA}**. There is no user choice (M-63). Per scenario × tier, ≈ 20 fields (scenario scan §5.1):

| Group | Fields |
|---|---|
| Identity | `scenario_id` (P / A / K code), `principal_type`, `dwelling_units` |
| Principal | `main_footprint_sqm`, `main_storeys`, `main_height_m`, `main_gfa_sqm`, `main_binding` ∈ {fsi, coverage, height, depth, length, setback} |
| Law applied | `coverage_pct_applied` + clause, or "no limit" + clause (`unregulated`); `fsi_applied`, or "no limit" (`unlimited`) / `not_applicable` + clause |
| Suite | `suite_type`, `suite_gfa_sqm`, `suite_height_m`, `suite_binding` |
| Parking | `garage_type`, `garage_sqm`, `garage_gfa_deduction_sqm` |
| Totals | `total_gfa_sqm`, `avg_unit_gfa_sqm`, `max_bedrooms` |
| CoA tier only | `coa_gfa_sqm`, `coa_increment_sqm` (calibrated, not law, M-65 (5)), `coa_form` (single · single_suite · multiplex), `coa_factor` (the u logic-variable id, value, `fit_basis`) (§6.4) |
| Observed (both tiers) | `nearby_coa_builds_gfa_sqm` — "nearby CoA builds of this form", kind `empirical_ref`, never a multiplier on AOR(s) nor the CoA headline (§6.4) |
| Every value | scenario status + field status (M-64, two closed levels) and lineage from the evaluator trace: formula id, scenario id, tier, the Layer 2 rows read with `table_version`, each `lv()` id + value + version, `evaluator_version` |

Every new field above is a registry row with `introduced_by` (M-69), so totality covers it before the inventory generator sees a screen.

**Headline per parcel** (persisted, §6.8): the permitted scenario with the largest `total_gfa_sqm` per tier, its id, and the counters, derived from the same read as the grid (M-64). It takes over the display role of `max_buildable_gfa_sqm` / `opt_aor_*` / `opt_coa_*` only after its shadow passes. Column fates are in Appendix R; `opt_coa_gfa_sqm` leaves the report but stays a DB column for the Spec 88 cost line (M-65, M-67).

### 6.2 The scenario catalogue (Spec 69 M-63)

Closed data, pinned. Each axis value cites the clause that defines or permits it (scenario scan §1.1, §2.1 *[read]*); the catalogue ⇄ the permission clauses of `scenario-clauses.json`, both ways.

| Axis | Values | Permission source |
|---|---|---|
| **P** principal form | detached · detached + secondary suite · detached houseplex 2–4 · detached houseplex 5–6 (inside 600.60 only) · semi · semi + suite · semi houseplex · townhouse · townhouse + suite · **townhouse, a unit not fronting a street** (pre-lock fix) | zone permitted-types lists 10.x.20.40; `u` label 10.x.40.1 (10.10.40.1(3)(A), 10.20.40.1(5)(A)); houseplex definitions 800.50(181)/(746), 600.60.20; one suite per unit 150.10.20.1(2); provincial floor M-55; houseplex lot requirements on an excepted lot 10.x.30.1(1)–(2); the non-fronting townhouse 30.0 m frontage 10.10.30.20(1)(D), 10.20.30.20(1)(D), 10.40.30.20(1)(E), 10.60.30.20(1)(D)(i), 10.80.30.20(1)(E) |
| **A** ancillary suite | none · garden · laneway | 150.7.20.1(2) = 150.8.20.1(2) (not both); laneway needs a lane 800.50(402) **and a rear or side lot line abutting it for ≥ 3.5 m, or 3.5 m cumulative along the side and rear lot lines** (150.8.30.20(1); strict test, KFM-78-9) |
| **K** parking | none · integral garage · detached garage (M-66) | parking never required: 200.5.10.1 R3/R5; integral garage GFA deduction 10.5.40.40(3)(C) (one space per dwelling unit) + (3)(D) (one more, detached house, frontage > 12.0 m) |
| **T** tier | as-of-right · CoA (M-65) | — |

**Collapse rules** — declared, tier-qualified equalities with their evidence; each is a metamorphic fixture run both ways **and** a per-parcel equality check on the trial population (both sides computed, never inferred from the condition). A collapsed permitted scenario is listed as "same as <scenario>" (M-64): a collapse removes a duplicate computation, never a permission.

| # | Equality | Tier | Holds when | Evidence |
|---|---|---|---|---|
| C1 | houseplex 3 = 4; houseplex 2 = 3 = 4 | both | 2 = 3 = 4 when A = none, or when the M-55 separation is not read as `max_requirement` (Q4). With A = garden / laneway under Q4, the provincial 4 m separation is scoped by unit count (`external.json` EXT-prov-1 `unit_configurations`: house 2 + anc 0–1; house 3 + anc 0; house 1–2 + anc 1), so houseplex 2 + suite ≠ houseplex 3–4 + suite | 10.x.40.40(1)(C), 10.x.30.40(1)(D) (no count in the envelope) *[read]*; scope *[executed, matrix C1]* |
| C2 | houseplex 5 = 6 | both | 600.60 only (vacuous until the 600.60 map is held, R-10) | 600.60.30(3), 600.60.40(1)(B), (2)(A) |
| C3 | detached = detached + suite (envelope) | as-of-right only (different CoA forms, M-65 (2)) | no `d` applies and LC ≥ 45 % or unmapped; never in R (10.10.40.40(1)(B) default 0.6) | 10.x.40.40(1)(C), 10.x.30.40(1)(D) |
| C5 | integral garage = none | both | no GFA-keyed limit binds: FSI does not bind or is disapplied, and no suite reads principal GFA (150.7.60.50(2), 150.8.60.50(2)); expressible only with M-72 var-vs-var | 10.5.40.40(3)(C)/(D) is a deduction from GFA |
| C6 | detached garage = none | both | neither coverage nor an ancillary cap binds | 10.5.60.70(1), 10.5.60.50(2) |

A front pad is not a K value (no size rule reads a pad; 10.5.80.10(3) is location only); it is disclosed under K = none (§6.5). The former C4 rule is dropped.

**Permission rules** (not collapses): semi / townhouse scenarios on a single detached lot → `not_permitted:requires_severance` where the lot is not a semi half or per-unit frontage / `au` is not met (800.50(746)(B); 10.40.30.10(1)(B); `au`) — counted, hidden from the report (Q2, decided).

**Catalogue homes for the Stage 1 reverse gaps (pre-lock fix 2026-10-07)** *[measured, `.cursor/mcbylaw/phase3-trial/STAGE1-REPORT.md`: of 297 permission-tagged clauses, 2 had no catalogue home; 31 others were envelope or out-of-scope rules that the pattern pass mis-tagged]*:
- **10.x.30.1(1)** (9 units: a houseplex inherits the Ch.900 exception's lot requirements). It is not a new scenario. It is an application rule on the houseplex P values: on an excepted lot, a detached houseplex (semi houseplex: the semi half) takes the exception's lot requirements for a detached (semi-detached) house, and 10.x.30.1(2) keeps a more permissive coverage. Layer 2 applies it, and an unauthored exception stays `not_evaluated:exception_not_authored`.
- **Townhouse units not fronting a street** (5 units). This is the new P value "townhouse, a unit not fronting a street". It is permitted only where the lot frontage is ≥ 30.0 m (in RD, RS and RM also only on a lot abutting a major street), else `not_permitted:<clause>`. Its setbacks come from the zone's townhouse rows through Layer 2. Example: RD 10.20.40.70(7)(C)(ii), a 7.5 m side yard where the units do not front a street *[read]*.
- **Forward miss:** the integral-garage clause 10.5.40.40(3)(C) is in the K row above. The pre-work `scenario-clauses.json` held only (3)(D). The Phase 3 generator regenerates that list, and the catalogue ⇄ clauses check must find (3)(C).

House + suite ≠ houseplex (height max(HT, 10.0), no storey cap and 19 m depth apply to the houseplex only) — **separate envelopes** *[read, scan §2.2 item 3]*, and a separate CoA form (`single_suite`, M-65 (2)).

**Grid size** *[inferred]*: typical RD detached lot 14 envelopes × 2 tiers = 28 computations; worst case (R zone, lane, 600.60, FSI binding) 81 × 2 = 162. Suite size is computed **per principal scenario**, reading that scenario's own principal values (inputs are scenario-scoped, `main_footprint_sqm@<scenario>`): GFA < principal GFA; the 150.7.60.70(1) (A)-or-(B) coverage regimes as one `max` (M-72); principal + suite + garage ≤ the shared cap of the same scenario; the rear soft-landscaping area; height vs separation *[read, scan §3]*.

### 6.3 Formula registry and the one step (M-61, M-62, M-68, M-69, M-72)

**Registry row** (data, generated from the agreed keyer shards, drift-locked, never hand-edited; ⧉ = keyed): `formula_id` · `field` (a declared report target, M-72) · `tier` · `kind` ∈ {`formula`, `empirical_ref`, `cost_ref`, `input`} (M-69) · `introduced_by` (new fields) · ⧉ `applies_to_scenarios` · ⧉ `expression` (Spec 68 §7.4 + M-72) · ⧉ `inputs[]` — each `l2(<dsl_target>)` × structure, an `lv(<id>)`, or a declared geometry input from the closed `vocab.json` list (`lot_area_m2`, `lot_frontage_m`, `lot_depth_m`; PLANNED `existing_footprint_m2`, `storeys_p50` — a declared non-law norm, Spec 69 M-53 note); geometry names are disjoint from `dsl_target` names; the closure check covers every node kind · ⧉ `literals[]` — each a Layer 1 clause id or an `lv()` id · ⧉ `status_map` (which input status yields which scenario / field status) · `vectors[]` (Spec 67 worked examples × scenario plus the PLANNED houseplex, suite house, R zone, garden / laneway suite, integral / detached garage and 600.60 vectors, each expected value cited; ≥ 1 per formula × scenario × branch).

**Geometry inputs bind to declared-unit columns** (`lot_size_sqm`, never `lot_size_sqft`; red-team T9).

**Handlers:** one per Spec 68 §7.1 archetype that reaches a report field (≤ 10; keys equal `vocab.archetype`, both directions, Spec 68 §8 rule 2 — the red test is PLANNED: a handler key outside `vocab.archetype` fails) — e.g. LIMIT caps an input, PERMIT / PROHIBIT set a scenario's status, DISAPPLY yields `not_applicable`. No handler branches on a zone, a scenario or a regulation id.

**The step** — `compute_maxbld_scenarios`, a net-new MATERIALIZER born V3. It is specified once, in **§Phase-5** (identity and chain placement in its header, outputs in P5.10, shape and counters in P5.11), with its policy in Spec 131. The paragraph that stood here (2026-10-07) proposed the slug and chain placement after `resolve_bylaws` and before `compute_parcel_cost_estimates`; §Phase-5 supersedes it. The first release is as-of-right with the P5.1 forms **plus the CoA tier** (operator 2026-10-18; P5.10a, O-18); this section's registry, townhouse forms and K axis join it by a catalogue pin change. Population: declared as a query (Spec 124 R-AY); R-AS is N/A (no legacy step; R-DK net-new).

### 6.4 The CoA axis (Spec 69 M-65)

**Method** (operator ruling 2026-10-07 on `.cursor/mcbylaw/phase3-prework/coa-second-look.md`): **CoA(s) = AOR(s) × u_form(s)** — a citywide pure CoA uplift per building form, fitted against the AOR of the **same** form. No storey-p90 switch, no `realized_fsi_p90` cap, no per-neighbourhood factor.

| Form | u (second-look estimate; to be measured on AOR(s), M-70) | Basis *[measured, second look §2]* |
|---|---|---|
| single | ≈ 1.14 | lot-matched realized FSI, CoA ÷ as-of-right single builds: 1.136 [1.115, 1.198] |
| multiplex | 1.00 | the same for multiplex builds: 0.997 [0.937, 1.07] |
| single_suite | fitted in the Phase 3 trial | — (until then `not_evaluated:coa_factor_unfitted:single_suite`) |

**Rules:**
1. **No double counting.** The old k_multiplex 1.428 = form effect 1.376 × CoA effect 1.037 *[measured]*; a houseplex AOR(s) already holds the form effect, so u is the CoA effect alone, fitted against AOR(s) of the same form (formula id + evaluator + table version), never today's `opt_aor`. Kill test pre-registered in the trial (M-70): CoA(s) ÷ realized CoA builds of the form ∈ [0.9, 1.1] on held-out lots.
2. **A total P → form map.** single ← detached, semi · **single_suite** ← detached / semi / townhouse + suite (own form; "2 Unit - Detached" permits are ≈ 31 % house + suite by description and realize 1.244× `opt_aor` vs 1.392 for duplexes *[measured, n 46 / 70, `two-unit-split.txt`]*) · multiplex ← detached / semi houseplex 2–4, 5–6. A form with no fitted u (townhouse; `single_suite` until the trial) is `not_evaluated:coa_factor_unfitted:<form>`, never borrowed. The fit cohort is classed by permit description by the same map.
3. **Logic variables backed by a pinned audit.** Each u is a `logic_variables.json` row bounded **[1.0, 1.5]**, backed by a generated, pinned re-fit audit (`fit_basis`: formula id, evaluator + table version of AOR(s), form, window, n, estimate, CI, held-out real/predicted). The drift gate FAILs when a logic variable differs from its audit estimate or the audit's AOR(s) version is stale. **A re-fit is mandatory after E2** (KFM-78-6); a re-fit is the `coa_factor_refit` shadow-diff class (M-71), and the u id + version is in lineage.
4. **Neighbourhood term only if reliable.** A per-neighbourhood uplift enters only if its split-half reliability r > 0.3; measured **r = −0.07** today (build level r = 0.46) *[measured, second look §0]*. Re-measured at each re-fit.
5. **The increment is not law.** `coa_increment_sqm` = CoA(s) − AOR(s), labelled "calibrated from realized CoA builds of this form, not law".

**"Nearby CoA builds" — a separate, labelled observed figure** (`nearby_coa_builds_gfa_sqm`, kind `empirical_ref`): the median realized FSI of ≥ 5 nearby same-form CoA builds (≤ 3 km, lot area ± 30 %) × this lot's area (second look option c2: the best held-out predictor, median APE 0.191 single / 0.217 multiplex *[measured]*). Count, radius and lot band are logic variables; fewer comps → `not_evaluated:insufficient_comps`. It is a declared non-law empirical input: **never a multiplier on AOR(s), never the CoA headline**. It carries the local build-level signal the old `opt_coa` pocket captured (where the pocket's storey step fires, as-of-right builds are also 13–24 % bigger *[measured]*).

**Columns** (operator ruling 2026-10-07; Spec 88 untouched): `max_newbuild_coa_gfa_sqm` (×1.05) and `opt_coa_gfa_sqm` leave the **report** (`report_only_retired`, shown as `coa_gfa_sqm`). `opt_coa_gfa_sqm` **stays a DB column** feeding the Spec 88 CoA cost line until the cost epic migrates it (KFM-78-8).

CoA applications remain validation data (oracle C, M-71), never inputs to u beyond the re-fit cohort.

### 6.5 Parking (Spec 69 M-66)

| K | Rules applied (change size) | Not evaluated in Layer 3 (compliance only, disclosed) |
|---|---|---|
| none (a front pad is disclosed here; not a K value) | — | front soft landscaping 75 % without a driveway (10.5.50.10(1)(D)); front-yard parking location (10.5.80.10(3)) |
| integral garage | 10.5.40.40(3)(C)/(D): 1 space per dwelling unit (+1 for a detached house, frontage > 12.0 m) deducted from GFA, where a GFA-keyed limit binds (FSI, or suite GFA < principal GFA) | entrance width ≤ 6.0 m (10.5.80.40(1)); lane access first (10.5.80.40(3)) |
| detached garage | in overall coverage (10.5.60.70(1)(A)); ancillary ≤ 10 % (1)(B) (R: 10.10.60.70(1)(B) parking exemption); ancillary floor area 60 / 40 m² (10.5.60.50(2)); shares the garden-suite 45 % / 20 % and laneway 30 % caps of the same scenario | rear-yard parking count (10.5.80.10(7)) |

The as-built `garageFit` (18.5 m² one-car floor, 20 % shared cap) is replaced by these rows (KFM-78-2).

### 6.6 Presentation rules

1. Shown: values whose scenario is `permitted` and whose field is `computed`, or `unregulated` / `unlimited` ("no limit" + clause). A collapsed permitted scenario shows "same as <scenario>". `not_permitted`, `not_evaluated` and `not_applicable` are counted, never displayed (M-64); the step check `displayed ∧ ¬permitted` = 0.
2. Order: headline first; then catalogue order (P, A, K); as-of-right before CoA.
3. Houseplex 2–4 (and 5–6) appear as unit rows inside one scenario: units, average unit size, maximum bedrooms (split where C1 does not hold).
4. Every number carries its citation and amendment status (Spec 69 P-1). CoA values say "calibrated from realized CoA builds of this form, not law" and show the form (`coa_form`); "nearby CoA builds" is labelled as observed nearby builds, not law and not the CoA figure.
5. A parcel with no permitted computed scenario shows its closed reason (e.g. `not_evaluated:ambiguous_zone`, `not_evaluated:layer2_conflict:fsi`), never a blank.
6. Formats are unchanged (`mobile/src/lib/parcelCostFormat.ts`); cost lines are unchanged (M-67). A CoA cost line whose priced area (`opt_coa_gfa_sqm`) differs from the shown `coa_gfa_sqm` states the area it priced.
7. Surfaces S-001 / S-072 follow Spec 126; the screen change is an Admin-domain item of the Phase 3 plan.
8. **`not_buildable`** (pre-lock fix, trial K2): a permitted scenario whose principal envelope field is `not_buildable:<clauses>` (e.g. a lot narrower than its two side setbacks) is **not shown as a scenario**. It is counted (`scenarios_not_buildable`) and never shown as a negative or zero size. If no permitted scenario is buildable, the parcel shows "not buildable as of right" with the binding clauses (rule 5).

### 6.7 Assumptions are admin logic variables (Spec 69 M-68)

Non-law numbers on today's report path, each to be (or stay) a `logic_variables.json` row read by `lv()`: present — `storey_height_m` 3 · `max_build_lot_min/max_sqm` 50 / 2000 · `max_build_min_dimension_m` 3 · `reno_coa_uplift_pct` 0.05 (a fraction) *[measured]*; absent today, to be added — `LOT_TOLERANCE` 0.15 · `BUILD_NORM_MIN_SAMPLE_DEFAULT` 5 · `FSI_PLAUSIBILITY_MAX` 10 · `OVER_CAPTURE_CLAMP` 1.1 · the pocket-storeys fallback literal `2` (`optimal-config.js:260`) *[read, field inventory]* · the CoA uplifts u_single / u_multiplex / u_single_suite, bounded [1.0, 1.5], backed by the pinned re-fit audit (§6.4; values to be measured) · the nearby-CoA-builds count, radius and lot band (5, 3 km, ± 30 %). `reno_coa_uplift_pct` stays while `max_newbuild_coa_gfa_sqm` has a DB consumer (`enrich-permits.js:738`). Every `*_pct` variable declares `scale` ∈ {percent, fraction}: `accessory_max_coverage_pct` 0.3, `min_soft_landscaping_pct` 0.3 and `reno_coa_uplift_pct` 0.05 are fractions while other `*_pct` keys are percents *[measured, red-team T9]*. **The admin PUT enforces the seed bounds server-side, rejects unknown keys and writes old and new values per key** (today it accepts any finite value and audits keys only *[executed, red-team T10]*). Law-reading constants (suite, garage, setback and coverage values) do **not** become logic variables: they come from Layer 1 rows through Layer 2.

### 6.8 Storage (Spec 69 M-70) — the trial measures before lock

- **Baseline:** the Phase 2 trial's 3-structure projection, b2 ≈ **1.03 GB** (8.4 %), risk **1.84 GB** (fails K5) *[measured, Phase 2 TRIAL-REPORT:56]*. Suites are structures, so the S = 1 figure (≈ 380 MB) is not the base.
- Layer 2 b2 rows are **not** keyed by scenario: 625,992 × 9 ≈ 5.6 M rows ≈ 2.9 GB fails the K5 10 % disk line *[arithmetic re-executed; per-row size from the trial]*.
- Per parcel, persist only the headline per tier and the counters. The grid is computed on read from the b2 rows and lot metrics (a 24-target read 3.9 / 13.9 ms p50 / p95 *[measured, Phase 2 trial]*; a 28–162-evaluation grid read is not measured). Persisting the full grid ≈ 387 M values *[arithmetic re-executed]* fails or crowds K5.
- The trial also measures per-parcel compute, the full run time, WAL, and whether the headline and the on-read grid can differ in `evaluator_version` (M-64: same read).
- **Measured by the Phase 3 trial (2026-10-07, `.cursor/mcbylaw/phase3-trial/TRIAL-REPORT.md` K4/K5/K6):**
  - L3-a (headline + counters) is chosen: 880,188 rows, 282 MB. A local full run takes ≈ 12.8 min (compute 0.76 ms/parcel; compiled formula 1.8 µs/eval). A no-change re-run writes 0 rows and 0 WAL. On-read grid p95 is 76 ms on the worst parcel, and headline = grid on the same read. Small cloud is ≈ 31 min *[inferred]*.
  - L3-b (persisted grid) is rejected: ≈ 1.28 GB lower bound and ≈ 14 % WAL *[inferred, linear from 20 K / 100 K]*.
  - The persisted headline columns are `numeric` / `double`, never `real`: one K6 miss was float4 rounding (1,350.288 vs 1,350.29).
- **Layer 2 is the blocker, so the Phase 2 plan locks a LEAN structure row** (pre-lock fix, K4). The trial stored the full trace + `scenarios` + `by_class` once per structure: **1,877,976 rows, 1,167 B/row (`by_class` 702 B) = 2,465 MB, + link 52 MB = 2.52 GB ≈ 20 % of the DB**. That is 2.4× the Phase 2 projection of 1.03 GB. Stripping winners from `by_class` saves only 7 % (649 vs 702 B) *[measured]*. The design:
  - **(a)** One **signature row** per rule signature holds the trace once: candidates, winner, why the others lost, inputs, `table_version`.
  - **(b)** A **structure row** per parcel × target × structure holds only the signature pointer, the structure, the value, the status / reason, and the **deltas** where that structure differs from the shared trace (its own winner or condition values).
  - **(c)** Layer 3 lineage names the signature row plus the structure row.
- **The re-measure is a Phase 2 trial item** (P2-0 round 0, not yet run). Kill line: L2 + L3-a ≤ 10 % of the DB (≈ 1.2 GB on the measured 12 GB local DB). The Phase 3 plan does not lock on storage until it passes.
- *Dated note 2026-10-18 (Spec 69 M-189):* for the §Phase-5 catalogue the per-scenario rows are persisted (P5.10; about 2.6 M rows, §Phase-5 O-6), which reopens L3-b for that narrower grid. The same kill line applies, measured at the step's first capture; O-6 is still OPEN.

### 6.9 Gates and validation

| Item | Closed answer | Gate | State |
|---|---|---|---|
| Report-field totality | output ⇄ registry ⇄ rendered; denominator = inventory ∪ registry-introduced fields; retirement reason closed | G-UNIVERSE report-field arm | PLANNED (host built) |
| Formula shape | inputs resolve (every node kind); literals licensed (clause or `lv()`); ⧉ present; geometry names ∩ `dsl_target` = ∅ | G-SHAPE formula arm | PLANNED (host built) |
| Formula execution | every row evaluates on every applicable vector; ≥ 1 vector per formula × scenario × branch; expected values match or an `eval_mismatch` adjudication | G-EVAL formula arm | PLANNED (host built) |
| Grammar | M-72 fixtures green; red on today's grammar | `bylaw-p3-dsl.logic.test.ts` | PLANNED (new code) |
| Formula keying | agree / adjudicated / pending; registry = generated from agreed shards | G-AGREE (⧉ incl. `literals[]`), G-PROV | PLANNED (host built) |
| Status sets | two closed levels (M-64); reasons in `vocab.json` | G-SHAPE status arm; step check | PLANNED |
| Scenario totality | one scenario status per parcel × scenario × tier; catalogue ⇄ `scenario-clauses.json` | G-UNIVERSE scenario arm; step check | PLANNED |
| Collapses | fixtures both ways + per-parcel equality on the trial population | step check | PLANNED |
| Drift | inventory, catalogue, registry regenerate byte-identically or match their pin | G-DRIFT `--check` | **entry condition** — S8 (built on `wf1/mcbylaw-s7`, uncommitted 2026-10-07) + a Phase 3 arm |
| Executable literals | no regulation id / exception number as a literal | G-EXC-LIT | **entry condition** — Phase 2, unbuilt |
| Hidden constants | 0 unmapped over the Phase 3 modules, inline JS literals and every SQL numeral included | G-CODE (iv) blocking + inline arm | PLANNED (new arm; red: `codelink-probe.mjs`) |
| Lineage | from the trace; complete and current (`table_version` in force); headline = grid read | step check (FAIL) | PLANNED |
| Logic variables | value within seed bounds; u ∈ [1.0, 1.5] = its pinned audit estimate; audit AOR(s) version current; `fit_basis` match | G-DRIFT (u ⇄ audit); step checks; admin PUT schema | PLANNED (red: `lv-schema.test.ts`) |
| Plausibility | per field a zone-aware bound; invariants: `suite_gfa < main_gfa`; CoA(s) ≥ AOR(s); `total_gfa ≥ main_gfa`; `main_gfa ≤ fsi × lot` where FSI applies; footprint ≤ coverage × lot where regulated; principal + suite + garage ≤ shared cap | Reality-Check bounds (existing plausibility executor); step checks | PLANNED |
| Shadow before switch | each parcel × field difference in a closed predicate class; `unexplained` = 0, `layer3_defect` = 0 | per-parcel shadow-diff classifier (new `step-validate` arm, M-71) | PLANNED (red: `g8-probe.mjs` generic `why` must FAIL) |
| Oracles | C CoA notices (planned Spec 129 `load_coa_notices`), metamorphic, D expert sample, held-out lots | Phase 2 round runner | **entry condition** — Phase 2 draft, not in tree |

### 6.10 Out of scope

Builder cost and the cost menu (Spec 88, M-67) · compliance-only parking rules (§6.5) · conversions of existing buildings (10.5.20.40, 600.60.40(3)) · apartment buildings (a 5–6 unit building outside 600.60 is `not_permitted`) · Ch.970 transition parking (scan F3).

### 6.11 Questions decided at ratification (operator, 2026-10-07)

1. **150.7.60.70(1) (A)-or-(B):** one `max` of the in-unit alternatives (M-72); §7.5 rule 4a is not engaged.
2. **Semi / townhouse on a single detached lot:** `not_permitted:requires_severance` (with the clause: 800.50(746)(B); 10.40.30.10(1)(B); `au`), counted, hidden from the report.
3. **600.60 membership:** the City overlay map is ingested in Phase 2 (R-10); until then `not_evaluated:map_area_not_held`.
4. **M-55 provincial 4 m separation:** keep the inferred `max_requirement` reading, flagged for the M-29 expert sample. Under it C1 splits (houseplex 2 + suite ≠ houseplex 3–4 + suite, §6.2).
5. **House + secondary suite:** its own CoA form `single_suite`, fitted in the trial (M-65).
6. **Inventory generator:** recorded SQL traces **only** — no in-process execution of the SQL builders (Spec 68 §6.4 rule 8: code is parsed, never executed); home Spec 126 tooling (`generator-design.md` §4).
7. **Column fates:** Appendix R kinds; `opt_coa_gfa_sqm` is `report_only_retired` and stays a DB column (M-65, M-67).
8. **CoA method:** citywide per-form uplift u on AOR(s) of the same form, plus the separate "nearby CoA builds" figure (M-65, §6.4).
9. **No-legacy step (Spec 124):** the population is declared as a query (R-AY: residential parcels with a Layer 2 resolution row, the step's own predicate, with its reset arm); the R-AS cohort-vs-legacy rule is N/A with a recorded reason (no legacy step to compare; the shadow diff against the live columns, M-71, replaces it). **The Spec 124 row is OWED at the P1-C9 register move**; Spec 124 is not edited here.
10. **Layer 2 conflicts** (wording aligned 2026-10-07 with the operator ruling **PROHIBIT wins at the same rank**, Spec 69 M-60 dated note (a)). A value conflict on a target is field-level `not_evaluated:layer2_conflict:<target>`. A permission conflict (PERMIT vs PROHIBIT at the same rank) makes the scenario **`not_permitted:<prohibiting clause>`**: the overruled PERMIT clause is named in the trace (`overruled_permits`), the row carries `expert_sample: true`, and it is counted and never shown (Spec 68 §11.1). It is not `not_evaluated`. Ambiguous-zone lots are a separate reason, `not_evaluated:ambiguous_zone` (operator ruling 2026-10-07), not a Layer 2 conflict.

### 6.12 Fold record (2026-10-07)

Sources: `.cursor/mcbylaw/phase3-check/MATRIX.md` (H = high, row ids §2–§8) and `REDTEAM.md` (T). The DSL and attack probes were **re-run on the merged tree** (`wf1/mcbylaw-p3spec` after merging the evaluator hardening, M-60): output identical. Dispositions: **fixed** in text · **PLANNED** with its red test · **refuted** with executed evidence · **held**.

| Finding | Disposition | Where |
|---|---|---|
| H1 / T5 / B1–B4, B6–B8 — core formulas inexpressible | PLANNED: M-72 grammar; red = `dsl-try.mjs` 8 probes + R2/R2b/R7/R10 in `bylaw-p3-dsl.logic.test.ts` | Spec 68 §7.4 block; M-72 |
| H2 / A6 / A7 / A11 — hosts absent (G-DRIFT `--check`, G-EXC-LIT, round runner) | fixed: entry conditions, not arms. G-DRIFT `--check` is built by S7/S8 on `wf1/mcbylaw-s7` (uncommitted; `validate.mjs` G-DRIFT render arm, `bylaw-s8-check.infra.test.ts`); G-EXC-LIT is not built there (not in its 13 `GATES`) — Phase 2 owner; the runner is Phase 2 | Spec 68 §11.1; M-61; §6.9 |
| H3 / A10 / T14 — G8 cannot carry closed per-parcel classes | PLANNED: per-parcel predicate classifier (new `step-validate` arm); red = `g8-probe.mjs` generic `why` must FAIL; R-AS for a no-legacy step → Q9 | M-71; §6.9 |
| H4 / D6 / T1 — k double-counts form size; wrong denominator | fixed (operator ruling 2026-10-07): pure uplift u on AOR(s) of the same form (u_multiplex = 1.00); also the hard requirement: fit against AOR(s) of the same form, `fit_basis` FAIL, kill test in M-70 | M-65 (1); §6.4 |
| H5 / D7 / T2 — P → form map not total; house + suite | fixed: total map, `single_suite` form (operator ruling 2), `coa_factor_unfitted`, C3 as-of-right only | M-65 (2); §6.2, §6.4 |
| H6 / D8 / T3 — retirement vs Spec 88 | fixed (operator ruling 3): `opt_coa_gfa_sqm` leaves the report, stays a DB column for the cost line; cost line states its priced area; Specs 83/66 added | M-65, M-67; §6.6 r6; KFM-78-8; §2 deps |
| H7 — status / reason sets not closed (`ambiguous_zone`, `coa_factor_unfitted`, `not_applicable`, `conflict`, N6 `open`, row 5) | fixed: two closed levels; reasons `layer2_conflict`, `coa_factor_unfitted`, `no_producer` to `vocab.json` (PLANNED; red: G-SHAPE rejects an undeclared reason); `ambiguous_zone` dropped (**reversed 2026-10-07:** restored by operator ruling, §6.13); N6 `no_producer`; row 5 `formula` | Spec 68 §11.1; M-64; App. R |
| H8 / F1 / T13 — totality denominator | fixed (ruling 4): inventory ∪ registry-introduced fields, output ⇄ registry ⇄ rendered; 3a, payload fields given kinds | M-69; App. R |
| H9 / T20 / T4 — vector coverage | PLANNED vectors (houseplex, suite house, R zone, garden / laneway, garages, 600.60); ≥ 1 per branch; red = a branch with no vector fails G-EVAL | M-62; §6.3 |
| A2 / T21 — ⧉ omits `literals[]`; hand edits | fixed: `literals[]` ⧉; registry generated from agreed shards | M-62; §6.3 |
| A9 / T12 — G-CODE (iv) blind to inline / SQL literals, report-only | PLANNED: blocking + inline arm; red = `codelink-probe.mjs` | M-68; §6.9 |
| A13 — handler-key test unnamed | PLANNED red test (handler key ∉ `vocab.archetype` fails) | §6.3 |
| A14 — M-63 vs M-64 cardinality | fixed: scenario-level vs field-level status | M-64 |
| B5 — bare literal k | fixed by `lv()` (M-72) | M-68 |
| B9 — input names | fixed: vocab names; PLANNED `existing_footprint_m2`, `storeys_p50` | M-61; §6.3 |
| C1 / G4 — houseplex 2 = 3 = 4 not always | fixed: amended for garden / laneway combinations under Q4 | §6.2 C1; M-63 |
| C3 — suite option vanishes | fixed: collapsed permitted scenario shown "same as" | §6.2; §6.6 r1 |
| C4 — pad has no subject | fixed: rule dropped; pad disclosed under K = none | §6.2; §6.5 |
| C5 — integral = none wrong when a suite binds on GFA | fixed: condition widened; needs M-72 var-vs-var | §6.2; M-66 |
| C7 — not an equality; vs Q2 | fixed: moved to permission rules | §6.2 |
| D5 — holdout figures transcribed | fixed: tagged transcribed | §6.4 |
| D9 — "retire from the report" wording | fixed: `report_only_retired` | M-69; App. R |
| D10 — k re-fit has no diff class; no k in lineage | fixed: `coa_factor_refit` class; `lv()` id + version in lineage | M-64, M-71 |
| D11 — `opt_coa_storeys` kind | fixed: `report_only_retired` (payload-only; no CoA storeys under any M-65 method; DB readers remain: sanity audit, `parcel-lookup.ts`) | App. R |
| D12 — k variables absent | PLANNED (logic variables) | §6.7 |
| E2 — storage baseline | fixed (ruling 4): 1.03 GB / 1.84 GB risk | M-70; §6.8 |
| F4 — absent logic variables | fixed: listed present vs to add | §6.7 |
| F5 — map lists non-existent paths; `scripts/seeds/bylaw/` owned twice | fixed: planned paths no longer parsed as Target Files; Spec 68 owns the seeds | §2 Target Files; system map |
| G1 — `held_F` launders | fixed: only an F this plan lands, with its predicate | M-71 |
| G3 — M-53 "only from Layer 2" | fixed: dated note on M-53 (law values only; declared non-law inputs) | Spec 69 M-53 |
| G6 — R-AS / R-AY | fixed (operator ruling): population query; R-AS N/A with reason; Spec 124 row owed at P1-C9 (Q9) | §6.3; §6.11 |
| G8 — Q1 vs rule 4a | fixed: one `max` of in-unit alternatives (M-72) | §6.11 Q1 |
| T6 — `unregulated` poisons arithmetic | PLANNED: M-72 propagation table + `regulated()`; red = R5 | Spec 68 §7.4 |
| T7 / T19 — `lot.vars` shadows the winner; flat namespace | PLANNED: Layer 2 winner beats lot vector (ruling 1); scenario-scoped inputs; lineage from trace; red = R6 | M-72; §6.2 |
| T8 — absent label dropped in `min` | PLANNED: no map nodes in Layer 3; closure covers every node; red = R4, R11 | M-72 |
| T9 / T4 — fraction vs percent; sqft vs m² | PLANNED: typed `pct`, `scale`, declared-unit binding; red = R1, R1b, R8, R9 | M-72; §6.3, §6.7 |
| T10 — admin PUT unbounded; keys-only audit | PLANNED (ruling 4): server bounds, unknown keys rejected, full-value audit; red = `lv-schema.test.ts` | M-68; §6.7 |
| T11 — seed default edit passes pre-commit | PLANNED: related report tests on seed staging; red = `precommit-lv.log` case | M-68 |
| T15 / T16 — silent collapse; dropped scenario | PLANNED: per-parcel collapse equality; catalogue ⇄ `scenario-clauses.json` | M-63; §6.9 |
| T17 — non-permitted scenario leaks | PLANNED: `displayed ∧ ¬permitted` = 0 | M-64; §6.6 |
| T18 — stale lineage; headline vs grid | PLANNED: lineage current; same read | M-64; §6.8 |
| DeepSeek: `u` label 10.x.40.1 bad citation | refuted: 10.10.40.1(3)(A), 10.20.40.1(5)(A) carry the `u` text *[executed, matrix §8]* | — |
| DeepSeek: generated block in Spec 78 is a new hazard | refuted: `scripts/analysis/gates/generated-blocks.mjs` is the established pattern | — |
| DeepSeek: k ≥ 1 contradicted by [0.93, 1.09] | refuted for the old k (that CI is CoA vs no-CoA, not k). Under the ruled method u *is* that effect: u_multiplex = 1.00 sits on the [1.0, 1.5] floor (a CoA never shrinks the envelope; metamorphic CoA(s) ≥ AOR(s), M-71) | §6.4 |
| DeepSeek: monotonicity false under shared caps | refuted: the invariant is on permission status, not size | — |
| DeepSeek: C2 evidence displacement-only | refuted: 600.60.30(3), (2)(A) treat 5–6 as one class | — |
| DeepSeek: KFM-78-1 arithmetic | refuted: 258,181 + 191,491 + 1 equal = 449,673 *[re-executed]* | — |
| DeepSeek: ambiguous zone is a Layer 2 `conflict` | fixed (operator ruling, conservative): permission conflict → scenario `not_evaluated:layer2_conflict`; value conflict field-level (Q10). **Superseded 2026-10-07:** ambiguous zone → `not_evaluated:ambiguous_zone`; permission conflict → PROHIBIT wins (`not_permitted`) (§6.13) | §6.11 |
| CoA method (M-65) | fixed (operator ruling 2026-10-07): citywide u per form on AOR(s); neighbourhood term only if split-half r > 0.3 (−0.07 measured); separate "nearby CoA builds" figure | §6.4 |
| Open questions Q2, Q3, Q4, Q6 | fixed (operator rulings 2026-10-07) | §6.11 |
| Ratification | M-61..M-72 RATIFIED 2026-10-07 (operator); trial quantities to be measured (M-70) | Spec 69 |

### 6.13 Pre-lock fixes from the Phase 3 trial (2026-10-07; the operator approved the approach)

Evidence: `.cursor/mcbylaw/phase3-trial/TRIAL-REPORT.md` (Stages 2–3) and `STAGE1-REPORT.md` (Stage 1). Pre-registration: `phase3-trial-design.md` sha256 `088b87d5…c544e6`.

| # | Trial finding | Fix | Where |
|---|---|---|---|
| 1 | K1: 3/36 formulas inexpressible (`units × m2`, `m2 ÷ units`); `max_bedrooms` has no producer | count-by-area unit rules; `max_bedrooms` = Layer 1 LIMIT `bedrooms` from 10.x.40.1(8)/(7)/(6) (648-2025), houseplex scenarios only | Spec 68 §7.4; M-72 note |
| 2 | K2: 54 invariant cells on 2 lots from negative `buildable_width` | field status `not_buildable:<clauses>`, never a negative or a clamp; not shown as a scenario | Spec 68 §7.4, §11.1; §6.6 r8 |
| 3 | K4: L2 full trace per structure ≈ 2.5 GB (20 %) | lean L2 structure row (shared trace per signature + per-structure deltas); re-measured in the Phase 2 trial | §6.8; M-70 note |
| 4 | K3: reason set not built; `ambiguous_zone` (73,062 rows) outside it | closed `vocab.json` `layer3` block = Spec 68 §11.1, both directions; `ambiguous_zone` restored | Spec 68 §11.1; M-64 note |
| 5 | Stage 1: 1 forward miss and 2 reverse catalogue gaps | 10.5.40.40(3)(C) in the K row; 10.x.30.1(1) as a houseplex application rule; new P value for a non-fronting townhouse (30.0 m) | §6.2; M-63 note |
| 6 | Q10 wording contradicted the PROHIBIT-wins ruling | Q10 aligned: `not_permitted` with both clauses | §6.11 Q10; Spec 68 §11.1 |
| 7 | Stage 1 Reality-Check: `abuts_laneway` over-flags ≈ 20 % | the laneway scenario uses the strict ≥ 3.5 m test; WF3 moved into Phase 3 | §6.2 A row; KFM-78-9 |

## §Phase-5 — Max-build scenarios (McBylaws Airtight) (Behavioral Contract)

> **PROPOSED 2026-10-18 (docs only; nothing is built).** Operator: "first we need to update the specs to support this"; "it's spec 78, the lot configuration, the key spec". This section is the behavioural contract of the net-new step `compute_maxbld_scenarios`. The rules it applies are registered in **Spec 131 — Lot Configuration Policy** (`131_lot_configuration_policy.md`, rows LC-n); the by-law readings are Spec 69 M-180..M-225 (M-199..M-225 fold the 2026-10-18 reality-check and DeepSeek reviews, P5.16). Phase 4 is taken (chain validation, §Phase map), so this is Phase 5. It is also the step §6.3 names (one statement: §6.3 points here). Evidence tags as in §6: *[read]* by-law text in `docs/reference/bylaw-provisions.json` or code; *[measured]* a read-only query (2026-10-18, local DB, `BEGIN TRANSACTION READ ONLY`); *[inferred]* not executed.

**Step identity.**
- Slug `compute_maxbld_scenarios`; archetype MATERIALIZER (Spec 122 §1.10).
- Born V3 (Spec 124 R-DF; P5.11).
- Census `legacy: "none"` (R-DK), **owner_specs `[78]`**, written at commit ①.
- Admin-registered (R-DL) at ①.
- Advisory lock: a Spec 47 §A.5 entry is owed at ①.
- Chain `sources`, after `link_parcel_abutments` (phase 24) and after the Layer 2 resolution step (D-1); its phase number is assigned at ①.
- Writes `parcel_maxbld_scenarios` (migration number assigned at ①).
- First release: as-of-right **and the CoA tier** (operator 2026-10-18: *"we do [need] CoA fields for the report — CoA recent projects etc, max build CoA for each of the new scenarios"*). The CoA tier is the ratified §6.4 method reused unchanged (M-65), mapped onto these scenarios in P5.10a (O-18). The townhouse forms and the K axis (§6.2) still join later, by a catalogue pin change.

### P5.0 Step decisions — RULED 2026-10-18 (operator)

By-law readings behind these decisions are Spec 69 M-rows; Spec 131 indexes all of them.

| Id | Decision | Status |
|---|---|---|
| **D-1** | **The step reads only Layer 2 resolution rows, never the provisions.** Spec 68 §11 says *"calculated outputs (Layer 3) read **only** the resolution layer"*. Commit ① waits for Layer 2 rows for the P5.3 targets, per class. There is no in-process `effective()` shortcut. | RULED 2026-10-18 |
| **O-1** | The main-wall family is mapped by provision, not by number (Spec 69 M-190). An RM houseplex has no main-wall cap; it is shown only after the M-29 expert sample. | RULED 2026-10-18 (by-law reading M-190) |
| **O-2** | Garden-suite coverage: option (A) counts the suite's footprint and (B) excludes it; x.30.40(1)(D) applies under both; the option that builds more is taken (Spec 69 M-191). | RULED 2026-10-18 (M-191) |
| **O-3** | Lawfully existing reliefs: **10.5.40.71(3) APPLIES**. An up-addition on a lot of ≤ 12.2 m frontage keeps the existing setbacks. Every other relief is disclosed (Spec 69 M-192). | RULED 2026-10-18 (M-192) |
| **O-4** | `semi_half` (half of a semi) is a declared input, derived on read: the primary footprint is primary-linked to exactly two parcels, and the other parcel abuts this one in `parcel_abutments`. Fidelity is `differs` until a 50-parcel sample is checked, and it is disclosed. *[measured]* 94,532 residential parcels match (R 37,744 · RD 12,430 · RM 25,847 · RS 16,614 · RT 1,897). | RULED 2026-10-18 |
| **O-5** | Coxwell area (150.7.60.30(1)(C)): it is digitized as a `bylaw_map_areas` row (Spec 69 M-193). **Amended 2026-10-18 by M-224 (operator "Generous reading now"):** inside the area a garden suite over 4.0 m needs only 5.0 m and may be 6.3 m at ≥ 5.0 m (coupled rule in P5.5), with the mandatory `coxwell_area` disclosure; outside, 4.0 m below 7.5 m and 6.3 m at ≥ 7.5 m. Until the polygon is held every lot takes the literal reading, and lots inside the coarse street filter get `coxwell_may_qualify`. The switch is the logic variable `coxwell_generous_reading`. | RULED 2026-10-18 (M-193, amended by M-224) |
| **O-6** | Storage: one row per parcel × scenario, about **2.6 M rows** *[inferred: 440,093 residential parcels × detached/houseplex/suite + 82 K semi + 3 renovation rows on ≈ 400 K parcels with a linked house; the earlier 1.8 M figure predates the three-renovation split]*. It is measured against the §6.8 kill line at the first capture. If it fails, only the headline and per-scenario totals are persisted. | RULED 2026-10-18 (operator: measure at first capture against the §6.8 kill line) |
| **O-7** | The unkeyed law numbers (flat-roof 1.4 m, attic test, R roof slope, dormer 40 %, main-wall share tiers, Coxwell 5.0 m) are keyed by the keying lane before ①. Until a number is keyed, its arm is `not_evaluated:target_not_keyed:<target>`, never a literal (Spec 68 §5a part 4). | RULED 2026-10-18 |
| **O-8** | Houseplex cap: 4 units, or 6 iff `sixplex_membership_basis = 'gis_in'`. A disputed basis gives `not_evaluated:map_area_disputed` (Spec 69 M-194). *[measured]* `gis_in` 151,882; out 287,090; disputed 1,121. **Corrected 2026-10-18 by M-202:** a semi-detached houseplex is capped at 4 everywhere; the 600.60.40(1)(A) lift of a 'u' below 6 applies only in R, RT and RM; no 'u' label means no 'u' cap. | RULED 2026-10-18 (M-194, corrected by M-202) |
| **O-9** | A house with a secondary suite reports 2 units. Whether the suite counts toward 'u' is disclosed until M-177(4) rules (Spec 69 M-195). | RULED 2026-10-18 (M-195) |
| **O-10** | The joint objective is `main_gfa + w × suite_gfa` with **w = 1** (maximize total GFA). A tie goes to the larger main GFA. | RULED 2026-10-18 |
| **O-11** | enrich_parcels' max-build columns are **kept** unchanged (they feed `parcel-cost.js`, `enrich-permits.js` and the opt engine). After the §6.9 shadow classifier passes, they are derived or retired under Appendix R, in their own WF. M-176(3) and EP-D21 keep their own enrich_parcels night. **Consumer gate (operator 2026-10-18: "make sure the new by-law fields don't harm the CoA chain"):** this step writes only its new table, so nothing changes now. **Before any enrich_parcels max-build column is derived from, switched to, or retired in favour of `parcel_maxbld_scenarios`, every consumer below is migrated or confirmed** (list measured 2026-10-18 by grep; the effective ledger / `consumer-registry.json` re-derives it at that WF): **coa chain** — `enrich_coa_zoning` (`scripts/enrich-permits.js`, a shared file: `SCALARS` bylaw_max_* `:24`, `LOT_MAXBUILD_COLS` `:46-48`, `OPT_COMP_PROP_COLS` `:63`, the `variance_context` base `:107`, propagation `:211`, `:266`); `compute_coa_cost_estimates` (`scripts/compute-coa-cost-estimates.js:478-482` reads `max_laneway_suite_gfa_sqm`, `max_garden_suite_gfa_sqm`, `max_buildable_footprint_sqm`; `:865-866`); **permits chain** — `enrich_permits` (the same `enrich-permits.js`) and `compute_cost_estimates` (`scripts/compute-cost-estimates.js:148-152`, `:867-868`); **sources chain** — `compute_parcel_cost_estimates` (`scripts/lib/compute/compute-parcel-cost-estimates.js:161`; `scripts/lib/parcel-cost.js:101-105`), `assert_global_coverage` (`scripts/lib/compute/assert-global-coverage.js:161`, `:241-264`, `:382`), `assert_parcel_sanity`; **src readers** — `src/features/leads/lib/archetype-cost-map.js:35-46` (`opt_aor_gfa_sqm`, `opt_coa_gfa_sqm`, suite GFA, footprint), `src/features/leads/lib/cost-model.ts:85-94`, `:553-558`, `src/lib/classification/archetypes.ts:63-69` (`max_buildable_gfa_sqm`, `max_rear_suite_gfa_sqm`), `src/lib/parcels/consumer-lookup.ts:35-39`, `src/lib/admin/parcel-lookup.ts:42-44`, `:64-65`, `:89-91`, and the types in `src/lib/parcels/types.ts`, `src/lib/permits/types.ts`. **Value changes propagate:** any enrich_parcels VALUE change (e.g. the separate M-176(3) / EP-D21 enrich_parcels night) changes the values these coa / permits steps propagate; their POST captures go stale and they recapture in that night's replay-all (R-CZ / R-DQ). | RULED 2026-10-18; consumer gate added 2026-10-18 (operator) |
| **O-12** | **The pipeline never reads user entries.** Pipeline rows are estimate-based. A user's entry replaces the estimate only for that user, in the app, through the shared pure function (P5.7). | RULED 2026-10-18 (operator) |
| **O-13** | ~~Estimated storeys take the upper value of `cur_storeys_range`.~~ **AMENDED 2026-10-18 (operator: "Why do you need this field? This will be a user input for the existing house. Hopefully it's not required for something else."):** `existing_storeys` is **user input only**. `cur_storeys_range` is a neighbourhood range (migration 203:26, *"realized storey range from nbhd storey-norms p50/p90 … falls back to max_build_stories"*), not this house, so it is never read. The pipeline writes `existing_storeys` NULL; the renovation fields that need it are NULL with `not_evaluated:needs_user_input:existing_storeys` until the user enters it in the app (P5.6, P5.7). **Dependency check (2026-10-18):** no non-renovation field reads existing storeys (P5.16 F-53). | RULED 2026-10-18 (operator); amended 2026-10-18 |
| **O-14** | **`existing_basement` is unknown (NULL) in the estimate** (a site fact, M-169). `renovation_basement` reads "new or underpinned". | RULED 2026-10-18 (operator) |
| **O-15** | **The confidence seeds are uncalibrated logic variables:** `existing_shared_footprint_penalty` 0.5 and `existing_confidence_min` 0.6 (P5.9). They are re-set from the P5.8 oracle (LC-30). | RULED 2026-10-18 (operator) |
| **O-16** | **On the RI / RB rows the rear suite is sized against the existing house:** its footprint and GFA are the main building's in P5.5, so the suite's GFA must be less than the existing house's. (With O-13 amended, the existing GFA needs the user's storeys, so these suite fields wait for the entry too.) | RULED 2026-10-18 (operator) |
| **O-17** | **Trust model** (operator 2026-10-18, max-build trust, AGREED): the new-build scenarios are **high trust by design** (by-law + lot geometry only); the **only low-trust input is the existing house** (user input; renovation scenarios). A lawfully-existing effect on a new-build scenario is always a **disclosure**, never an input. Every field carries a trust tier (`bylaw_derived` · `estimate` · `user_input` · `precedent_estimate` for the CoA tier) from the lineage registry, and each row's trust level is **computed from the validation checks, never asserted** (P5.14, P5.15). | RULED 2026-10-18 (operator) |
| **O-18** | **The CoA tier is in the first release** (operator 2026-10-18), by the ratified §6.4 method (M-65) reused unchanged: `coa_gfa_sqm = AOR(s) × u_form` over the M-65 P → form map (P5.10a). Its fields carry trust tier `precedent_estimate` (never `bylaw_derived`), so the tracker and the trust computation keep it apart from the as-of-right numbers. The rear-suite add-on and the three renovations have no M-65 form: CoA is not applicable to them (LC-49). The per-lot CoA list is the existing `comparable_builds` + `nearby_coa_builds_gfa_sqm` (LC-51). | RULED 2026-10-18 (operator, both arms) |

### P5.1 Scenarios (closed set)

There is one row per `(parcel_id, scenario)`.

| `scenario` | Layer 2 class | Produced when | Governing text |
|---|---|---|---|
| `detached_house` | `detached_house` | every in-scope residential parcel | base case |
| `detached_houseplex` | `detached_houseplex` | where `permitted()` says permitted | height *"the greater of … HT … or 10.0 metres"* (x.40.10(1)(C)); storeys not capped (x.40.10(3)(C), RT 10.60.40.10(2)(C)); FSI does not apply (x.40.40(1)(C)): field status `not_applicable` (M-183) |
| `semi_detached_houseplex` | `semi_detached_houseplex` | only where `semi_half` holds (O-4, M-181(4)) and the zone permits it. RD does not: 10.20.20.40(1) permits *"(A) Detached House; (B) Detached Houseplex"* only | 50 % lot area/frontage (M-181); party wall disclosed |
| `house_with_secondary_suite` | `detached_house` + `secondary_suite` (M-182) | every in-scope parcel | FSI does not apply (x.40.40(1)(C); RD names *"a residential building with a secondary suite"*); coverage raised to 45 % **only where the Lot Coverage Overlay value is mapped and below 45 %** (RD/RS/RT/RM x.30.40(1)(D), *"Despite (A) above, if the numerical value on the Lot Coverage Overlay Map is less than 45 percent and the lot contains … a residential building with a secondary suite, the maximum lot coverage for all buildings and structures on the lot is 45 percent"*). An unmapped lot has no coverage cap either way ((B)), so there is no coverage gain. **R has no x.30.40** (ABS-1): 10.10.60.70(1)(C) only lifts the 5 % ancillary cap where all buildings ≤ 45 %, which helps the suite add-on, not the house (corrected 2026-10-18; P5.2 item 11); suite ≤ 45 % of the interior floor area of the **whole house** it sits in (150.10.40.40(1), *"of the dwelling unit within which it is located"*; M-199, operator 2026-10-18; the stricter main-unit-only reading is disclosed `secondary_suite_share_reading`), or the whole basement of a one-storey house (150.10.40.40(2)) |
| `renovation_addition` | renovation class¹ | an existing-house input exists (P5.6) | **expanded envelope**: addition room up and back = scenario envelope − existing house; 10.5.40.71(3) applies (O-3) |
| `renovation_interior` | renovation class¹ | an existing-house input exists | **current envelope**: what fits inside the existing box (attic conversion, 10.5.40.40(1); houseplex or secondary-suite conversion, FSI `not_applicable`, M-182/M-183; 10.5.20.40(1)) |
| `renovation_basement` | renovation class¹ | an existing-house input exists | **underpinning**: basement floor area is excluded from GFA (10.5.40.40(3)(A)), so the basement adds livable area and a possible basement unit without by-law GFA |

¹ The renovation class is `semi_detached_house` where `semi_half` holds, else `detached_house`. An RD semi half is at most lawfully existing (10.20.20.40(1)), so it carries the M-158 disclosure.

**Forms not modelled, disclosed (M-214, operator 2026-10-18 "DISCLOSE BOTH, not modelled"; Spec 131 LC-45).**
- **Major-street apartment building and townhouse** (608-2024 / 1062-2025: apartment ≤ 60 units with no FSI cap, height max(HT, 19.0 m), storeys max(ST, 6), coverage 50 %): every row on a lot abutting a major street carries `major_street_forms_not_modelled`. The lot fact is the existing `major_street` token.
- **A new semi-detached house, with or without a secondary suite, on an existing-semi lot** (R, RS, RT, RM): every row where `semi_half` holds carries `semi_detached_house_not_modelled`. The `detached_house` row on such a lot needs the attached half severed, which the disclosure says.
- Deferred and disclosed `forms_deferred` (M-214(3), ratified 2026-10-18): townhouse; apartment building (R outright, RM with no 'u' or u ≥ 5); a secondary suite in a semi or townhouse. A lawfully existing 5–6-unit apartment building (600.60.30(2)) is never routed as a houseplex.

**Gates (M-213, M-207).** Applied before any envelope, in this order, each a closed status or code:
1. `zoning_holding` set → new-build rows `not_permitted:holding_zone` (LC-12); renovation rows computed and disclosed `holding_zone`.
2. Lot viability: front lot line < 3.5 m → `not_buildable:10.5.30.20(2)` (the 6.0 m-lane exception is a site fact taken as not holding, disclosed); frontage < 6.0 m on a lawfully existing lot below the zone minimum → `not_permitted:10.5.30.21(3)` on the rows the clause names, a detached house or detached houseplex (D, 2, H; M-207). Within `lot_viability_margin_m` of either threshold the row is computed and disclosed `irregular_lot_approximation` (frontage is a rectangle approximation, P5.14 ML-6).
3. Chapter 900 exception not authored → Layer 2's per-target `not_evaluated:exception_not_authored` propagates (M-180); disclosed `exception_not_authored`.
4. Heritage designation, ravine protection → computed, disclosed `heritage_designated` / `ravine_protection` (+ `shoreline_hazard`, M-212(3)); the row's trust level is capped at `disclosed` (P5.14).

**Rear-suite add-on (every row).**
- `suite_type` is one of `none`, `garden`, `laneway`.
- At most one suite per lot: *"A lot may not contain both a garden suite and a laneway suite"* (150.7.20.1(2) = 150.8.20.1(2)).
- A laneway suite needs the strict 150.8.30.20(1) test (§6.2, KFM-78-9).
- Where both suites are eligible, the larger objective is kept and the other is disclosed.
- On `renovation_interior` and `renovation_basement` rows the suite is sized against the existing house (O-16).

**Scenario status** (closed, Spec 68 §11.1): `permitted` · `not_permitted:<clause>` · `not_buildable:<clauses>` · `not_evaluated:<reason>`. (`vocab.layer3.scenario_status` lacks the `not_buildable` and prefixed forms today: M-223(1), OWED.)
- A Layer 2 `not_evaluated` reason propagates unchanged.
- An ambiguous zone gives `not_evaluated:ambiguous_zone`.
- A renovation with no existing-house input gives `not_evaluated:no_existing_house`.

### P5.2 The main building, per class (pure)

1. **Plate `F`.** The smallest of:
   - the setback box: buildable width × length, under the `building_depth_m` / `building_length_m` caps;
   - the coverage cap: `lot_coverage_pct × lot` where it applies; `unregulated` or `not_applicable` gives no cap;
   - the buffered polygon.

   This is the enrich_parcels geometry with Layer 2 setbacks instead of zone defaults. A dimension under `min_dimension_m` makes the row `not_buildable`.

   **The setbacks are explicit fields** (M-205; P5.10 `main_*_setback_m`):
   - *Front:* 10.5.40.70(1) averaging wherever `parcel_abutments` holds the abutting buildings within 15.0 m on the same street (one neighbour → its setback; two → their average), else x.40.70(1)'s 6.0 m (*"If regulation 10.5.40.70(1) does not apply"*). The neighbour setbacks are estimates (`front_setback_est_m`, Q-B1), so `main_front_setback_basis` and `front_yard_averaging` disclose it and the field's tier is `estimate`. *Reliability (operator 2026-10-19, LC-57):* the average is used only when `fya_estimates_accepted` = 1; otherwise a lot where averaging would apply takes the zone default, `main_front_setback_basis` = `zone_default_needs_survey`, and `front_yard_needs_survey` is disclosed (resolved on read by `scripts/analysis/bylaw/front-averaging.mjs`).
   - *Sides:* the zone side yard by Layer 2; in R the 0.45 m blank-wall reduction (10.10.40.70(4)) is taken by default, the analogue of LC-35 (`blank_side_wall` discloses 0.9 m with windows); RD 10.20.40.70(5) adds 7.5 m only to the part of the building beyond the lesser of 17.0 m from the front main wall or 19.0 m from the required front yard (lots with required frontage > 18.0 m), never to the whole lot; the semi party-wall side is 0.
   - *Rear:* the greater of 7.5 m and 25 % of lot depth (RD/RS/RM, M-174(5)); R/RT 7.5 m; a triangular lot measures it as a radius from where the side lines meet (5.10.40.70(5), M-212(2)).
   - *Depth / length:* Layer 2 caps; RD/RS/RM depth is measured from the required front yard setback (x.40.30(1)). **Houseplex releases (M-204):** 19.0 m on a lot ≥ 36.0 m deep with frontage < 10.0 m, or ≥ 40.0 m deep with frontage ≥ 10.0 m (R 10.10.40.30(1)(B); RD 10.20.40.20(3), 10.20.40.30(2); RS 10.40.40.20(3), 10.40.40.30(2)); an RM houseplex has no depth or length cap (`not_applicable`); RT has no depth or length rule off a major street (`unregulated`).
   - *One-storey extension (M-206): renovations only (operator 2026-10-18).* Not applied to the new-build rows; their length cap is the Layer 2 cap. See `renovation_addition` (P5.6).
   - *Lane centreline:* no part closer than 2.5 m to the lane centreline (10.5.40.70(2)); the current centreline stands in for the *original* one (`lane_centreline_original`).
2. **Height and wall limit.** Height `H` = `height_m`. On an unlabelled RM lot a houseplex takes 12.0 m (10.80.40.10(1)(B)(ii), *"for any other building or structure"*; M-201), not max(HT, 10). Main-wall limit `Hw` = `main_wall_height_m`: *"the higher of 7.0 metres above established grade or 2.5 metres less than the permitted maximum height"*. `not_applicable` gives `Hw = H`; that covers RT (M-186), an RM houseplex or townhouse (M-190) and a townhouse on a major street (x.40.10(2)(C)).
3. **The limited pair** (x.40.10(2)). One pair of walls is held to `Hw`:
   - (A) the side walls, for ≥ 70 % of their width; or
   - (B) the front and rear walls, for ≥ 60 % of the width at frontage ≥ 12.0 m, 50 % at > 7.5 m and < 12.0 m, 40 % at ≤ 7.5 m.

   The rest of the pair (the free share) may rise to `H`. The pair is chosen to build more, and the choice is disclosed (M-176).
4. **Wall storeys:** `n_w = floor((Hw − first_floor_elevation_m) / storey_height_m)` full plates. Height is measured from established grade (10.5.40.10(1)), so the first floor's height above grade is a logic variable (`first_floor_elevation_m`, P5.9), bounded above by the 1.2 m main-entrance clause where it applies (R/RM detached and semi only, RD/RS every residential building; M-215(2)). Example: H 12 → Hw 9.5 gives 3 storeys at elevation 0 and 2 at 1.0 m. Established grade itself is not held (`established_grade`, M-212(1)).
5. **Form (a): flat roof + set-back storey** (M-184 (a)).
   - In a flat-roof zone (**R 10.10.40.10(11)/(12)** (M-200, corrected 2026-10-18), RD 10.20.40.10(4), RS 10.40.40.10(6), RM 10.80.40.10(6) for detached/semi), each storey above `Hw` has plate `F − 2 × upper_storey_setback_m × W`. That is the M-184 setback: *"additional front main walls and rear main walls … set back a minimum of 1.4 metres"*. In RD, `Hw` for this form is `max(7.2 m; H − 2.5 m)`, because 10.20.40.10(4)(A) sets it for *"all main walls"*.
   - **Keyed (operator 2026-10-19, Q-M218: *"this only impacts the top storey"*; M-218 dated note, Spec 131 LC-54).** `upper_storey_setback_m` = 1.4 m is a Layer 2 target, keyed on the five step-back units (R 10.10.40.10(11)(A)/(12)(A), RD 10.20.40.10(4)(B), RS 10.40.40.10(6)(A), RM 10.80.40.10(6)(A)). Only the storey above `Hw` is set back; the storeys below keep `Hw` unchanged, and the façade answers `main_wall_height_m` as in form (b).
   - ~~Elsewhere (R), the plate above `Hw` is `F × free share`.~~ (Withdrawn 2026-10-18: R has the flat-roof clause, M-200. No flat-roof zone remains outside RT, which has no main-wall rule.) Where the pair rule binds below `Hw`, the free-share part and the set-back part form a union (an M-29 sample item).
6. **Form (b): pitched roof with an attic** (M-184 (b)).
   - The roof rises from `Hw` at the limited pair at `roof_pitch`, capped by `roof_slope_max` where it is keyed (R 10.10.40.10(4): 5:3).
   - Clearance at distance `x` from the limited wall is `(Hw − n_w × storey_height_m) + roof_pitch × x − roof_assembly_depth_m`.
   - Attic GFA is the floor area with clearance **> 1.4 m**, counted only *"if at least 80% of the area has (A) a vertical clearance of more than 2.0 metres; and (B) an area of at least 10.0 square metres"* (10.5.40.40(1)). **The test decides inclusion in GFA, not existence (M-203, corrected 2026-10-18):** an attic that fails it still has floor area, reported as `attic_outside_gfa_sqm` (livable, not counted toward FSI; disclosed `attic_outside_gfa`). Where FSI binds, a failing attic is livable area outside the cap.
   - The R 5:3 slope cap (10.10.40.10(4)) applies *"above the second storey or higher on a detached house"* only (DeepSeek a8: scoped per class, so a houseplex is not capped by it).
   - Dormers lift up to `element_width_pct` (40 %, M-185) of the limited wall width, and the free share rises as a full wall.
   - The attic is a storey (800.50(820)) unless a clause excludes it (RD 10.20.40.10(8)).
7. **Storey cap:** total storeys ≤ `height_storeys` where it applies. `not_applicable` (houseplex) or `unregulated` gives no cap.
8. **GFA per form** = Σ plates (+ counted attic).
   - Capped at `fsi × lot` only where `fsi` applies. FSI is measured above grade; the basement is excluded (10.5.40.40(3)(A)).
   - `not_applicable` (houseplex; house with a suite) or `unlimited` gives no cap.
9. **Headline form:** the larger GFA. A tie goes to (a). Both forms are kept and the other is disclosed (M-184).
   - **Owed rows (P5.15(B) tracker):** the tracker row 10.20.40.10(4)(A) is green with M-184 owed here (operator 2026-10-19, Spec 131 LC-54).
10. **Binding constraint** (closed set): `fsi` · `coverage` · `setback` · `front_averaging` · `lane_centreline` · `depth` · `length` · `height` · `storeys` · `main_wall` · `lot_dimension` · `lot_viability` · `unit_cap` · `existing_structure`.
11. **With vs without: the gain over the detached house** (operator 2026-10-18: *"we need the house with and without — more space or envelope is allotted to house with secondary suite"*; Spec 131 LC-33; M-182).
    - The `house_with_secondary_suite` row's envelope is recomputed under its own class, with FSI released (x.40.40(1)(C) `not_applicable`) and coverage raised per x.30.40(1)(D) where that applies.
    - The gain is this row minus the same parcel's `detached_house` row, on the same roof-form basis (headline form vs headline form). So: `gain_vs_detached_gfa_sqm` = `main_gfa_without_suite_sqm`(this) − `main_gfa_without_suite_sqm`(detached); likewise footprint and storeys.
    - `gain_reasons` (closed, sorted) names each released limit that actually bound the detached row:
      - `fsi_not_applicable` (x.40.40(1)(C));
      - `coverage_45` (x.30.40(1)(D); never in R, never on an unmapped lot);
      - and, for houseplex rows, `storeys_not_applicable` (x.40.10(3)(C); RT (2)(C)), `height_houseplex` (x.40.10(1)(C); RM unlabelled 12.0 m, M-201), `main_wall_not_applicable` (RM, M-190), `depth_length_19m` (M-204(1)), `depth_length_not_applicable` (RM, M-204(2));
      - or `none` when no released limit was binding (e.g. an RD/RS/RT/RM lot with no 'd' whose FSI is already `unlimited` and whose coverage is unmapped). **In R a lot with no 'd' has FSI 0.6** (10.10.40.40(1)(B), M-215(1)), so `fsi_not_applicable` arises there whenever 0.6 binds; the former example ("an unlabelled lot whose FSI is already unlimited") is wrong for R.
    - **The same pattern applies to `detached_houseplex` and `semi_detached_houseplex` rows** (a one-line extension: same fields, same subtraction).
    - When the `detached_house` row is not `permitted`, or this row is not, every gain field is NULL.

### P5.3 Inputs

- **Layer 2, per class,** each with its McBylaws Airtight status (applies · not_applicable · undecided · not_evaluated, Spec 68 §5a part 3):
  - principal targets: `height_m`, `height_storeys`, `main_wall_height_m`, `fsi`, `lot_coverage_pct`, `ancillary_coverage_pct` (M-179(1)), `front_setback_m`, `rear_setback_m`, `side_setback_m`, `side_setback_street_m`, `building_depth_m`, `building_length_m`, `dwelling_units_max`, `bedrooms`, `element_width_pct`, `interior_floor_area_m2`, `entrance_height_m`, `upper_storey_setback_m` (form (a), keyed 2026-10-19, Q-M218);
  - for the suite structures: `separation_m`, `height_m`, `height_storeys`, `gfa_m2`, `building_length_m`, `building_width_m`, and the suite setbacks;
  - owed targets (O-7): `roof_slope_max`, the share tiers, the attic test (`upper_storey_setback_m` keyed 2026-10-19, Q-M218).
- **Lot:** from `parcels`: `lot_size_sqm`, `frontage_m`, `depth_m`, `geom`, `is_corner_lot`, `is_through_lot`, `abuts_laneway` (never the laneway test, M-209), `in_sixplex_area`, `sixplex_membership_basis`, `zoning_is_ambiguous`, `lot_size_confidence`, `zoning_holding`, `exception_number`, `is_heritage_designated`, `heritage_designation_type`, `is_in_ravine_protection_area`, `ravine_distance_m`, `primary_frontage_street_name`. Also `bylaw_map_areas`, `parcel_abutments` (Spec 130: `same_frontage_street`, `bldg_to_subject_m`, `front_setback_est_m`, `neighbour_residential`) and `toronto_centreline` (lane edges, M-209; the Coxwell coarse filter, M-224). The field-by-field list, with migrations, is the lineage registry (P5.15).
- **Estimated existing house** (P5.6): from `parcel_buildings` / `building_footprints` (primary), `parcels.existing_width_m`, `existing_length_m`, `imagery_roof_footprint_sqm` and `existing_data_quality_flag` (Spec 65 §5). **Not `cur_storeys_range`** (a neighbourhood range; O-13 amended): storeys are user input only.
- **Logic variables:** P5.9.

### P5.4 Houseplex units

- `floors` = the headline form's storeys + 1 basement level when `basement_livable_share` > 0.
- **Count** = min of:
  - `dwelling_units_max` (the 'u' label; **no 'u' = no 'u' cap**, M-202(3); a 'u' below 6 is lifted to 6 inside 600.60 **only in R, RT and RM**, M-202(2));
  - the houseplex cap: **4 for a semi-detached houseplex always** (800.50(746)(A), M-202(1)); 4, or 6 per O-8, for a detached houseplex;
  - `floors`.
- A houseplex needs at least 2 units, one *"entirely or partially above another"* (800.50(181)(D)). Fewer makes the row `not_buildable:800.50(181)`.
- **Per-unit interior area** = the floor's area × (1 − `circulation_share`).
- **Basement** = `F × basement_livable_share` (a design choice, not an evaluated deduction: M-171 dated note 2026-10-18). It is shown as livable with `in_gfa: false`: GFA *"may be reduced by: (A) the floor area of the basement"* (10.5.40.40(3)(A)).
- A basement unit may not be *"entirely below … established grade"* (5.10.1.30(3); keyed PROHIBIT, `not_modelled`, so it is disclosed).
- If the per-unit area falls below `unit_min_interior_sqm` (a heuristic; a Spec 68 §6.3 row is owed), the count drops and the drop is disclosed.
- **Bedrooms** = Layer 2 `bedrooms`: *"four times the number of dwelling units … with two dwelling units; or … three times … three or more"*. The clause is R/RD 40.1(8), RS 40.1(7), RT/RM 40.1(6).

### P5.5 The rear suite, jointly optimized (O-10)

**The search.** For each scenario, the main building's depth `d` steps by `depth_search_step_m`. For each `d`, both suite height arms are tried (4.0 m and up to 6.3 m). Rear setback, height and separation are coupled, so each arm is evaluated with its own separation and its own rear setback:

- **Main:** P5.2 with length `d`.
- **Suite region:**
  - depth = lot depth − front setback − `d` − separation − `suite_rear_setback_m`;
  - width = lot width − the two side setbacks (`suite_side_setbacks_m`).

  The setbacks apply *"to all parts of an ancillary building … above-ground and below-ground, excluding footings"* (150.7.60.20(1), 150.8.60.20(1)).
- **Separation and height** (150.7.60.30(1) / 150.8.60.30(1), 150.7.60.40(1) / 150.8.60.40(1)):
  - more than 4.0 m and up to 6.3 m needs ≥ 7.5 m from the house (*"no less than 7.5 metres … if the height of the ancillary building is greater than 4.0 metres"*);
  - otherwise 4.0 m tall at 4.0 m;
  - **Coxwell area, garden suite only (M-224, the generous reading; O-5):** the height steps by the actual separation: 6.3 m at ≥ 5.0 m, 4.0 m below 5.0 m. The depth search therefore tries a third arm in the area (separation 5.0–7.5 m at 6.3 m). It runs only when the lot is in the held polygon and `coxwell_generous_reading` = 1; the row then carries the mandatory `coxwell_area` disclosure. Without the polygon every lot takes the literal arms above, and lots inside the coarse street filter carry `coxwell_may_qualify`.
  - No suite separation is read from Layer 2 until the 10.5.80.1(2)(A) leak is fixed (M-225, being fixed in a separate keying lane) and INV-18 passes.
- **Storeys** ≤ 2 (150.7.60.40(2), 150.8.60.40(2)).

**Suite setbacks** (verbatim; operator ruling 2026-10-18, LC-35 / M-197: *"assume they will not put windows in doors — default is the smallest setback — rest is disclosure"*).

- **The openings choice is a design choice.** It defaults to **no openings on any wall where a blank wall earns a smaller setback**. The with-openings setback is a disclosure, never the headline (M-176).
- **A lot fact is a site fact.** When it is unknown, the larger setback applies, with a disclosure (M-176, M-169).

Garden suite, rear:
- 150.7.60.20(2): *"(A) if on a lot with a lot depth greater than 45.0 metres, equal to the greater of 1.5 metres or half the height of the ancillary building containing a garden suite; (B) in all other cases, 1.5 metres"*. On a deep lot, a 6.3 m suite therefore needs 3.15 m; this enters the depth search.
- (C) *"if the rear lot line abuts a lot in the Residential Zone category and the ancillary building … has openings such as windows in the rear main wall located above 4.0 metres above average grade, the required minimum rear yard setback in (B) above shall be increased by 1.5 metres"*. **Default: not applied** (no openings). Disclosed: "with windows above 4.0 m in the rear wall: 3.0 m".

Garden suite, through lot:
- 150.7.60.20(3): *"(A) if it is on a through lot, and a residential building on an adjacent lot fronts on the street that abuts the rear lot line of the through lot, the required minimum rear yard setback … is equal to the required minimum front yard setback for the residential building on the adjacent lot; and (B) In all other cases, 1.5 metres"*.
- The adjacent-lot fact is not held, so the larger applies: (A), using the subject's own Layer 2 `front_setback_m` as the proxy for the neighbour's required front yard. Disclosed.
- (4) applies only with a parking space in the suite, which is not modelled (M-177(3)); disclosed.

Garden suite, side:
- 150.7.60.20(5): *"(A) if the side lot line does not abut a street, and there are openings such as doors or windows in the side main wall …, the greater of 1.5 metres or the amount that is 10 percent of the lot frontage, to a maximum of 3.0 metres; and (B) in all other cases, the greater of 0.6 metres or the amount that is 10 percent of the lot frontage, to a maximum of 3.0 metres"*.
- **Default (B)** (no openings); (A) is disclosed.

Garden suite, corner lot:
- 150.7.60.20(6): *"(A) if it is on a corner lot, and a residential building on an adjacent lot fronts on the street that abuts the side lot line of the corner lot, … the average of the front yard setback of the residential building on the adjacent lot and the minimum required side yard setback of the principal residential building on the lot, but in no cases should be less than 1.5 metres; … (C) in all other cases, … the greater of the required minimum side yard setback for the residential building on the lot or 1.5 metres"*. It applies on the street side; (C) is the corner-lot arm (M-179(2)).
- The adjacent-lot fact is not held, so the larger of (A) (front-setback proxy as above) and (C) applies. Disclosed.
- (B) applies only with a parking space; not modelled.

Laneway suite, rear:
- 150.8.60.20(2): *"(A) if the rear lot line does not abut a street or lane and there are no openings such as vehicle access, doors or windows in the rear main wall …, 0.0 metres; and (B) in all other cases, 1.0 metres"*.
- No openings by default, so 0.0 m **only** where the rear lot line abuts neither a street nor a lane. A laneway suite usually backs onto the lane, which gives 1.0 m whatever the openings.
- Which lot line abuts the lane is not held, so 1.0 m applies, disclosed.

Laneway suite, side:
- 150.8.60.20(3): *"(A) if the side lot line does not abut a street or lane and there are no openings …, 0.0 metres; (B) if the side lot line abuts a street, the required minimum side yard setback for the residential building on the lot; (C) if the side lot line abuts a lot in the R, RD, RS, RT or RM Zone and the rear lot line abuts a lane, beginning from a height of 4.0 metres, an ancillary building must be set back 1.5 metres from the side lot line that abuts the rear lot line of another lot; and (D) in all other cases, 1.0 metres"*.
- **Default (A) 0.0 m** on an interior side with no openings.
- On a corner lot's street side, (B) applies.
- **(C) is applied (MANDATORY; M-198 RATIFIED 2026-10-18, amends M-177(3)).** Above 4.0 m the suite plate is set back 1.5 m from each side lot line that abuts another lot's rear lot line, when the side line abuts an R/RD/RS/RT/RM lot and the rear line abuts a lane. The rear-abuts-lane trigger is derived from the centreline edge classification (M-209) where it can be; where it cannot, the trigger is taken to hold (the larger setback, M-176), disclosed `suite_lot_fact_unknown`. It enters the depth search as a smaller upper plate and `suite_binding` gains `upper_side_stepback`.

Laneway eligibility (M-209):
- 150.8.30.20(1): *"A laneway suite must be on a lot with a rear lot line or side lot line abutting a lane for at least 3.5 metres; or on a lot with a cumulative total of at least 3.5 metres along a side lot line and rear lot line"*.
- **All three arms:** `lane_rear_length_m` ≥ 3.5, or `lane_side_length_m` ≥ 3.5, or their sum ≥ 3.5. Each is the parcel boundary within `lane_buffer_m` of a `toronto_centreline` Laneway segment, summed per edge class (rear / side by the edge's nearest centreline; front by `primary_frontage_street_name`). The 20 m `abuts_laneway` flag overstates eligibility by ≈ 25 % *[measured, reality check §3.C: 2,249 / 3,000 pass]* and is never the test. With no lane width, the buffer is assumed: fidelity `differs`, disclosed. Until the edge lengths exist the laneway arm is `not_evaluated:missing_input:lane_abutting_length_m` (KFM-78-9).
- `suite_lane_arm` records which arm passed.
- 150.8.20.1(2): one suite per lot.

Lane centreline (both suites): no part of the suite closer than 2.5 m to the lane centreline (10.5.60.20(4), *"Despite regulations 10.5.60.20(2), (3) and (5) to (11)"*). 150.7.60.20 and 150.8.60.20 displace 10.5.60.20(2),(3),(5),(6) only, so (4) still binds; on a lane narrower than 3.0 m it beats the 1.0 m laneway rear setback. `suite_binding` value `lane_centreline`.

Soft landscaping (M-208; **disclosed, not binding**, operator 2026-10-18):
- Garden, 150.7.50.10(1): ≥ 50 % (25 % at frontage ≤ 6.0 m) of the area between the house's rear main walls and the rear lot line, across the lot's width, is soft landscaping. The suite footprint sits in that area; the required area is computed and disclosed, not used to size the suite.
- Laneway, 150.8.50.10(1): ≥ 85 % (60 % at ≤ 6.0 m) of the area between the house and the suite (a 1.5 m walkway excluded), and (C) the area between the suite and the lane line. The required area is computed and disclosed; it does not size the house or the suite.
- Disclosure `suite_soft_landscaping` states the required area (`suite_soft_landscaping_sqm`). `suite_binding` has no soft-landscaping value.

**`suite_openings_loss_sqm`** is the suite GFA lost if openings are added on every wall that has an openings arm. It is recomputed through the same joint search and disclosed per wall: "if the suite has windows/doors in this wall: setback X m, suite reduced by Y m²".

**Lot facts the setbacks read.**

| Fact | Clause | Data today | State |
|---|---|---|---|
| lot depth > 45.0 m | 150.7.60.20(2)(A) | `parcels.depth_m` (rectangle approximation; fidelity `differs`, Spec 68 §7.6) | EXISTS; disclosed |
| corner lot | 150.7.60.20(6), 150.8.60.20(3)(B) | `parcels.is_corner_lot` | EXISTS |
| through lot | 150.7.60.20(3) | `parcels.is_through_lot` | EXISTS |
| lot abuts a lane ≥ 3.5 m (rear, side or cumulative) | 150.8.30.20(1), 150.8.60.20(2)/(3) | `parcels.abuts_laneway` (20 m proximity boolean; not the test) | **PARTLY derivable now** from `toronto_centreline` (4,146 Laneway segments, no width column): per-edge `lane_abutting_length_m`, M-209. **OWED:** the derivation (Spec 130 / enrich_centreline WF3, KFM-78-9) |
| **which** lot line (rear / side) abuts the lane or the street | 150.8.60.20(2)/(3); 150.7.60.20(5)/(6) | not held | **PARTLY derivable** (reality check §3.C sample: 75 % rear, 18 % side, 7 % oblique/ambiguous) by classing each `ST_DumpSegments(ST_Boundary(geom))` edge by its nearest centreline. **OWED:** the lot-line classification (Spec 130 lane; P5.14 ML-1); until then the larger setback |
| rear / side lot line abuts a Residential-zone lot | 150.7.60.20(2)(C), 150.8.60.20(3)(C) | `parcel_abutments.neighbour_residential` (Spec 130), without a rear/side split | partly EXISTS; the line split is OWED (as above) |
| adjacent lot fronts the rear/flanking street, and its front yard setback | 150.7.60.20(3)(A), (6)(A) | `parcel_abutments.front_setback_est_m` is advisory (Q-B1 open) | **OWED** (Q-B1); proxy = the subject's Layer 2 `front_setback_m`, larger-of, disclosed |

**Suite GFA** (after the 10.5.40.40(1), (2), (3)(A)/(B) reductions that 150.7.60.50(5) / 150.8.60.50(4) allow: attic, mechanical, basement, void; M-210, disclosed `suite_gfa_reductions`) ≤ every one of:
- garden: 120 m², or 60 m² for one storey (150.7.60.50(4));
- laneway: 10.0 m length × 8.0 m width (150.8.60.30(5)/(6));
- the plates;
- **strictly less than the main**: *"must be less than the gross floor area of the residential building on a lot"* (150.7.60.50(2) / 150.8.60.50(2)), applied as `≤ main_gfa(d) − suite_gfa_strict_margin_sqm`.

The suite is outside the lot's FSI (150.7.60.50(1), 150.8.60.50(1)).

**Coverage:**
- Garden (150.7.60.70(1)), the larger of: (A) all buildings ≤ 45 %; or (B) the suite is excluded, ancillary ≤ 20 % and the main ≤ the LC overlay value (no cap where unmapped). x.30.40(1)(D) applies under both (M-191).
- Laneway (150.8.60.70(1)): the suite is excluded, ancillary ≤ 30 %, and the main keeps its zone coverage.
- Other ancillary buildings are taken as absent (M-177(3)).

**Objective:** `main_gfa(d) + 1 × suite_gfa(d)`. A deeper main can shrink the suite through every term above, including the half-height rear setback.

**`suite_binding`** (closed): `suite_rear_setback` · `suite_side_setback` · `upper_side_stepback` · `lane_centreline` · `lane_frontage` · `suite_separation` · `suite_height_arm` · `suite_gfa_lt_main` · `suite_gfa_cap` · `suite_footprint_cap` · `ancillary_coverage` · `lot_coverage` · `suite_region_depth`.

### P5.6 Renovation: user input first, one shared existing-house input

The massing footprint is not reliable per parcel (§1: ±20–38 %; Spec 65 ES-6 retired existing heights). So renovation is **user-input-first** (LC rows, Spec 131).

**The existing-house input** is shared by all three renovation scenarios:

| Field | Meaning | Estimate (pipeline) | User input (app) |
|---|---|---|---|
| `existing_width_m` × `existing_depth_m` | footprint box | `parcels.existing_width_m` / `existing_length_m` (`ST_OrientedEnvelope` of the primary footprint, Spec 65 ES-2) | the owner's dimensions |
| `existing_storeys` | storeys above grade | **none: NULL** (O-13 amended 2026-10-18; `cur_storeys_range` is a neighbourhood range, not this house). Fields that need it are `not_evaluated:needs_user_input:existing_storeys` (`existing_storeys_needed`). | entered (required for those fields) |
| `existing_basement` | basement present | unknown (NULL; a site fact, M-169). `renovation_basement` then reads "new or underpinned". | entered |

**Provenance and confidence.**
- *Precedence:* user input > pipeline estimate. Every existing-house field carries `*_source` ∈ `estimated` · `user_entered`.
- *Confidence value.* The pipeline writes `existing_confidence` ∈ [0, 1], built on the existing mislink checks:
  - It is 0 when `existing_data_quality_flag` is set: the Spec 65 ES-6 mislink guard, `imagery_roof_footprint_sqm > lot_size_sqm × (1 + mislink_footprint_lot_tol)`.
  - It is also 0 when no primary building is linked.
  - Otherwise it is `parcel_buildings.confidence × (1 − existing_shared_footprint_penalty)` where the primary footprint is primary-linked to ≥ 2 parcels, and `parcel_buildings.confidence` alone where it is not.
- *Threshold.* Below `compute_maxbld_scenarios_existing_confidence_min`, the report shows **"low confidence in existing footprint — enter your dimensions"**.
- *Recompute on entry.* Entering dimensions recomputes the three results through the same pure function (P5.7) and labels the fields `user_entered`.
- *Storeys.* Storeys are never estimated; they are `user_entered` or NULL. **Which fields wait for them:** `existing_gfa`-based ones only — `addition_up_gfa_sqm`, `addition_back_gfa_sqm` (R: floors capped at the existing top floor), `interior_attic_gfa_sqm`, `interior_units_gain`, `dwelling_units` on RI, the RI/RB suite (O-16) and RI/RB `total_gfa_sqm`. Computable without them: the renovation envelope, `addition_back_footprint_sqm`, `basement_livable_gain_sqm`, `existing_footprint_sqm` and its confidence.

**`renovation_addition`** (expanded envelope). The envelope is P5.2 for the renovation class, computed as new build. Then:
- **Back room:** `max(0, F − existing footprint)`, still bound by the rear setback, depth and coverage terms of `F`. It is an area difference, because the house's position on the lot is unknown, and that is disclosed. **In R, rear-addition floors are no higher than the existing top floor (10.10.40.10(7)), APPLIED** (M-211(2), moved from the disclosed list): back-room storeys ≤ `existing_storeys`.
- **Up room:** the GFA above `existing_storeys`. Its plate is the existing footprint on frontage ≤ 12.2 m (**10.5.40.71(3) applies**, O-3: *"the required minimum building setback for any addition or extension above a lawfully existing building … is the minimum building setback … permitted by regulation 10.5.40.71(1)"*), else `min(existing footprint, F)`. **10.5.40.71(3) relieves setbacks only (M-211(1)):** the up plate still meets the depth and length caps (10.5.40.21(2), 10.5.40.31(2)), and where FSI applies the up room is also capped at `fsi × lot − existing GFA`; the smaller cap binds.
- **One-storey extension (M-206; renovations only, operator 2026-10-18):** the back room may extend 2.0 m beyond the length cap, one storey ≤ 5.0 m, ≥ 3.0 m from each side lot line. RD 10.20.40.20(2): a detached house, required frontage > 12.0 m to 18.0 m, ≤ 50 % of the building width; excluded from depth (10.20.40.30(1)). RS 10.40.40.20(2) / RM 10.80.40.20(2): a detached or semi-detached house, required frontage > 12.0 m, ≤ 50 % of the dwelling unit's width, the party-wall line not counted as a side line. Applied, disclosed `one_storey_extension`.
- **Addition GFA** = up + back.
- Every other lawfully-existing relief is disclosed, never applied (M-192, M-211): 10.5.40.11(1)–(7) height, main walls, first floor; 10.10.40.11 / 10.20.40.11 roof alterations (`existing_roof_alteration`); 10.5.40.71(1)/(2)/(4)–(6) setbacks; 10.5.30.41 coverage; 10.5.40.21 length; 10.5.40.31 depth; 10.5.40.41 FSI; x.40.81 separation; **R pre-1953 rear addition to FSI 0.69** (10.10.40.40(2), `r_pre1953_fsi_relief`; the build year is a site fact); **150.8.60.21 lawfully existing ancillary setbacks** (`existing_ancillary_setbacks`).

**`renovation_interior`** (current envelope). What fits in the existing box:
- **Attic conversion:** the P5.2 item 6 test inside the existing roof. The existing roof geometry is unknown, so the result uses the logic-variable pitch over the existing box and is disclosed.
- **Unit conversion within the building:** 10.5.20.40(1) (*"a detached house may be converted to a detached houseplex … provided the additional dwelling units are contained entirely within the building as it lawfully existed"*). In a 600.60 area, 600.60.40(3) allows up to six units.
  - Units are counted as in P5.4 over the existing floors + basement.
  - FSI is `not_applicable` (M-183); a secondary-suite conversion is likewise `not_applicable` (M-182), at ≤ 45 % of the whole house's interior (150.10.40.40(1), M-199).
  - No conversion of a semi-detached house or townhouse to a fiveplex or sixplex (600.60.40(3)(D)). No secondary suite in a converted semi or townhouse portion (10.5.20.40(6)).
- **Interior gain** = attic GFA + unit rows. There is no footprint change.

**`renovation_basement`** (underpinning).
- **Livable gain** = existing footprint × `basement_livable_share`. It is excluded from GFA (10.5.40.40(3)(A)), so it is not bound by FSI.
- A basement unit is possible: a houseplex unit (P5.4) or a secondary suite. A one-storey detached house's suite may take the whole basement (150.10.40.40(2)).
- **By-law limits that touch it,** cited and disclosed:
  - *"A dwelling unit may not be entirely below … established grade"* (5.10.1.30(3)).
  - The main pedestrian entrance is ≤ 1.2 m above established grade: R 10.10.40.10(6), RD 10.20.40.10(6), RS 10.40.40.10(4), RM 10.80.40.10(4) (keyed `entrance_height_m`); RT has no such clause. This governs the main entrance, not a basement-unit door.
  - The basement stays a basement only while the midpoint of its floor-to-joist height is below established grade (800.50(80)). Raising it past that makes it a storey that counts in GFA.
  - In 600.60, the 10.5 m houseplex height needs the lowest level raised 1.0–1.5 m (600.60.40(2)(A)).
- **Headroom is a Building Code matter, not a by-law one,** and is disclosed as such.

### P5.7 One pure calculation, shared by the step and the app

- **Module:** `src/features/leads/lib/renovation-shared.js`.
  - Precedent: `src/features/leads/lib/cost-model-shared.js` (Spec 83 §7.2), one module used by the pipeline and the app.
  - It holds every renovation formula of P5.6: `renovationResults(envelope, existingHouse, config)` returns `{addition, interior, basement, disclosures}`.
  - `envelope` is the renovation class's by-law + geometry envelope from P5.2 (the row's envelope fields). `existingHouse` is the P5.6 input with its source labels. `config` holds the P5.9 values.
- **Callers:** the step's compute module `compute-maxbld-scenarios.js` calls it with the estimate. The app (PIN **APP-RENO**) calls it with user input through a TS shim, as `cost-model.ts` does for the cost model.
- **Purity contract (Spec 124 R-BZ / R-CA):** no query, no network, no clock, no randomness, no process or module state, no locale APIs. Every number comes from its arguments: law numbers from the envelope, everything else from `config`. It is deterministic and re-entrant.
- **Enforcement.** The module is in the step's compute closure, so G0–G13 and gate E #32 scan it (`compute-closure.mjs`, `compute-purity.mjs`, `compute-literals.mjs`). A parity test runs the same vectors through the JS module and the TS shim.

### P5.8 Ground-truth comparison store (accuracy oracle for the existing footprint)

With the owner's consent, user-entered dimensions are stored beside the pipeline estimate, so footprint accuracy can be measured over time.

**Contract shape** (the app owns the table; its migration is owed with APP-RENO): `existing_house_reports`.

| Group | Columns |
|---|---|
| Keys | `id` (PK); `parcel_id` (FK `parcels`); `reporter_ref` (a pseudonymous reference to the account, never the email) |
| User entry | `width_m`, `depth_m`, `storeys`, `basement_present` |
| Estimate snapshot at entry | `est_width_m`, `est_depth_m`, `est_storeys` (always NULL since O-13 was amended: storeys are never estimated), `est_confidence`, `estimate_version` (the step's `code_version` + `layer2_table_version`) |
| Consent | `consent_version`, `consent_at` |
| Lifecycle | `entered_at`, `withdrawn_at` |

**Privacy and consent requirement.**
- Storage is explicit **opt-in**, recorded per entry with the consent text version.
- *Purpose limitation:* the data is used for accuracy measurement and for the owner's own recompute.
- *Withdrawal:* withdrawing consent deletes the entry's user fields.
- *Access:* RLS default deny (Spec 114 Class B); never sent to a third-party engine (Spec 68 §10 keyer-B rule).
- The governing privacy law is Canadian (PIPEDA). The app spec owns the consent text and its review.

**The oracle.**
- Measure: per confidence band, the median absolute % error of `est_width_m × est_depth_m` against `width_m × depth_m`.
- When the "low confidence" label may drop for a band is a future ruling, set from this measure: n ≥ a sample logic variable and error ≤ a bound logic variable (OWED; Spec 131).
- The step does **not** read user entries. Pipeline rows stay estimate-based; precedence is applied per user at display (P5.7).

**OWED to a separate app spec (PIN APP-RENO):**
- the input UI;
- the storage write path and the migration;
- the consent flow;
- the TS shim and API route.

### P5.9 Logic variables

Every variable is `compute_maxbld_scenarios_<name>` (R-DE (v)), seeded by migration in R-CV form with bounds and `scale`. Law numbers are never logic variables (§6.7).

| Suffix | Default | Bounds | Meaning |
|---|---|---|---|
| `storey_height_m` | 3.0 | [2.4, 4.0] | wall-storey floor-to-floor |
| `roof_pitch` | 1.0 | [0.25, 1.667]; capped by `roof_slope_max` | pitch of form (b) (M-184) |
| `roof_assembly_depth_m` | 0.30 | [0, 0.6] | rafter depth off attic clearance |
| `basement_livable_share` | 1.0 (fraction) | [0, 1] | livable share of the plate below grade |
| `circulation_share` | 0.10 (fraction) | [0, 0.30] | stairs/halls per houseplex floor |
| `unit_min_interior_sqm` | 30 | [15, 60] | heuristic unit floor |
| `suite_weight` | 1.0 | [1, 1] (pinned, O-10) | `w` |
| `depth_search_step_m` | 0.5 | [0.1, 2.0] | rear-wall search step |
| `suite_gfa_strict_margin_sqm` | 0.01 | [0.01, 1.0] | makes "less than" strict |
| `min_dimension_m` | 3.0 | [1.0, 6.0] | plate viability floor |
| `lot_min_sqm` / `lot_max_sqm` | 50 / 2000 | [10, 500] / [500, 10000] | modelled lot band |
| `existing_confidence_min` | 0.6 (fraction) | [0, 1] | "low confidence — enter your dimensions" threshold (P5.6) |
| `existing_shared_footprint_penalty` | 0.5 (fraction) | [0, 1] | confidence penalty for a footprint primary-linked to ≥ 2 parcels |
| `batch_size` | 500 | [50, 5000] | executed batch (R-DE (i)) |
| `not_evaluated_max_pct` | 25 (percent) | [0, 100] | WARN bound |
| `first_floor_elevation_m` | 0.6 | [0, 1.2]; capped by `entrance_height_m` where it applies | first floor above established grade (P5.2 item 4) |
| `lane_buffer_m` | 4.0 | [1.5, 6.0] | boundary-to-lane-centreline tolerance for `lane_abutting_length_m` (M-209; replaces the 5 m KFM-78-9 placeholder) |
| `triangle_simplify_tol_m` | 0.75 | [0.1, 2.0] | ring simplification for the triangular-lot detector (M-212(2)) |
| `lot_viability_margin_m` | 0.5 | [0, 2.0] | frontage band within which a lot-viability failure is disclosed, not failed (M-207) |
| `coxwell_generous_reading` | 1 | [0, 1] (integer) | M-224 switch: 1 = the generous reading of 150.7.60.30(1)(C), 0 = the literal one |
| `trust_high_min_pass_pct` | 100 (percent) | [90, 100] | share of a row's applicable invariants that must pass for `row_trust_level = high` (P5.14) |

### P5.10 Outputs: `parcel_maxbld_scenarios` — the calculated scenario fields

- **PRIMARY KEY `(parcel_id, scenario)`.** `parcel_id` is an FK to `parcels(id) ON DELETE CASCADE`; there is no inbound FK.
- Numerics are `numeric`, never `real` (§6.8 K6). RLS is enabled (Spec 114 Class B).
- **Rows:** about 2.6 M (O-6).
- Scenario abbreviations used in the table: **D** detached · **H** houseplex · **S** semi houseplex · **2** house + secondary suite · **RA** renovation_addition · **RI** renovation_interior · **RB** renovation_basement · **suite** = the rear-suite add-on columns (every row).

**The fields table is generated** from the field-lineage registry `docs/reference/maxbld-field-lineage.json` by `scripts/analysis/bylaw/generate-maxbld-lineage.mjs` (P5.15; Spec 124 R-BF: never hand-kept). Each row names its scenarios, the by-law clauses, the keyed units / Layer 2 targets it reads (or what is OWED and by whom), its input columns with their migration, its logic variables, its **trust tier** (O-17: `bylaw_derived` high · `estimate` low · `user_input` · `precedent_estimate` CoA · `observed` · `metadata`) and the invariants that check it. Edit the registry, then `--write`; `--check` fails on drift or a dangling reference. Rows marked "reference, not persisted" are joined by the report from their own tables (P5.10a).

<!-- generated:maxbld-lineage-fields -->
<!-- do not hand-edit: node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --write renders this block from docs/reference/maxbld-field-lineage.json -->

| Field | Type / unit | Scenarios | How it is computed (clause) | Trust tier | Keyed: units · Layer 2 targets · OWED | Inputs (migration) | Logic variables | Invariants | NULL when |
|---|---|---|---|---|---|---|---|---|---|
| `parcel_id` | integer | D, H, S, 2, RA, RI, RB | the parcel | metadata | — | `parcels.id` (011) | — | — | never |
| `scenario` | text, closed | D, H, S, 2, RA, RI, RB | P5.1 closed set | metadata | — | — | — | — | never |
| `scenario_status` | text, closed prefix | D, H, S, 2, RA, RI, RB | `permitted` / `not_permitted:<clause>` / `not_buildable:<clauses>` / `not_evaluated:<reason>` (Spec 68 §11.1); gates first (P5.1: holding, lot viability, exception) *[gates added 2026-10-18 (M-207, M-213)]* | bylaw_derived | **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** `vocab.layer3.scenario_status` forms (M-223(1)) (by-law keying/evaluator lane) | `parcels.zoning_holding` (165), `parcels.exception_number` (165), `parcels.zoning_is_ambiguous` (165), `parcels.frontage_m` (011) | `lot_viability_margin_m` | INV-21 | never |
| `building_class` | text | D, H, S, 2, RA, RI, RB | Layer 2 class (P5.1) | bylaw_derived | **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** house + secondary suite class; detached_houseplex_5_6 mapping (M-223(4)) (by-law keying/evaluator lane) | — | — | — | never |
| `is_headline` | boolean | D, H, S, 2 | largest `total_gfa_sqm` among permitted, buildable new-build rows; tie → catalogue order | bylaw_derived | — | — | — | — | never (false on renovations) |
| `gate_flags` | text[], closed | D, H, S, 2, RA, RI, RB | the P5.1 gates that hold: `holding_zone` · `exception_not_authored` · `heritage_designated` · `ravine_protection` · `shoreline_hazard` · `triangular_lot` · `irregular_lot_approximation` (M-207, M-212, M-213) *[new 2026-10-18 (M-212, M-213)]* | bylaw_derived | **OWED** the field, its computation and its check (step commit ① (Spec 78 §Phase-5)) | `parcels.zoning_holding` (165), `parcels.exception_number` (165), `parcels.is_heritage_designated` (171), `parcels.heritage_designation_type` (171), `parcels.is_in_ravine_protection_area` (168), `parcels.ravine_distance_m` (168), `parcels.geom` (039) | `triangle_simplify_tol_m`, `lot_viability_margin_m` | INV-21 | never (may be empty) |
| `main_gfa_sqm` | numeric m² | D, H, S, 2, RA | headline-form GFA (P5.2 items 8–9); FSI cap only where `fsi` applies (R no-d 0.6, M-215(1)); RA: the renovation envelope | bylaw_derived | `10.10.40.40(1)#(1)(B)`; `10.20.40.40(1)#(1)(C)`; l2:`fsi`; l2:`height_m`; l2:`height_storeys`; l2:`main_wall_height_m`; l2:`lot_coverage_pct`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** M-217 zone-category scope (houseplex FSI leak) (by-law keying/evaluator lane) | `parcels.geom` (039), `parcels.lot_size_sqm` (011) | `storey_height_m`, `roof_pitch`, `roof_assembly_depth_m`, `first_floor_elevation_m` | INV-5, INV-7, INV-17 | status ≠ permitted |
| `main_footprint_sqm` | numeric m² | D, H, S, 2, RA | plate `F` (P5.2 item 1): the smallest of the setback box (explicit setbacks below), the coverage cap and the buffered polygon; one-storey extension (M-206) added on RA only (renovations only, operator 2026-10-18) | bylaw_derived | l2:`lot_coverage_pct`; l2:`building_depth_m`; l2:`building_length_m`; l2:`front_setback_m`; l2:`rear_setback_m`; l2:`side_setback_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)) | `parcels.geom` (039), `parcels.frontage_m` (011), `parcels.depth_m` (011) | `min_dimension_m` | INV-8, INV-9 | status ≠ permitted |
| `main_front_setback_m` | numeric m | D, H, S, 2, RA | 10.5.40.70(1) averaging (one neighbour → its setback; two → their average; buildings ≤ 15.0 m on the same street) only when fya_estimates_accepted = 1 and every qualifying neighbour is est_status estimated; else x.40.70(1)'s zone default (M-205(1), LC-57) *[new 2026-10-18 (M-205); reliability switch 2026-10-19 (LC-57)]* | estimate | l2:`front_setback_m`; l2:`averaging_distance_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** wiring of the on-read front-averaging resolution (scripts/analysis/bylaw/front-averaging.mjs) into the Layer 2 lot flags (Layer 2 step) | `parcel_abutments.same_frontage_street` (255), `parcel_abutments.bldg_to_subject_m` (255), `parcel_abutments.front_setback_est_m` (255), `parcel_abutments.est_status` (255), `parcel_abutments.neighbour_residential` (255) | — | INV-9 | status ≠ permitted |
| `main_front_setback_basis` | text `averaged_two` / `averaged_one` / `zone_default` / `zone_default_needs_survey` | D, H, S, 2, RA | which arm of 10.5.40.70(1) / x.40.70(1) decided, with the neighbour estimate status; zone_default_needs_survey where averaging would apply but the estimate is not accepted (LC-57) *[new 2026-10-18 (M-205); zone_default_needs_survey 2026-10-19 (LC-57)]* | estimate | — | `parcel_abutments.est_status` (255) | — | — | status ≠ permitted |
| `main_side_setbacks_m` | jsonb `{side_1, side_2, street_side, beyond_17m}` m | D, H, S, 2, RA | zone side yards; R 0.45 m blank wall by default (10.10.40.70(4)); RD 10.20.40.70(5) 7.5 m beyond the lesser of 17.0 m / 19.0 m (required frontage > 18.0 m); RD (6) corner 3.0 m; party wall 0 (M-205(2)) *[new 2026-10-18 (M-205)]* | bylaw_derived | l2:`side_setback_m`; l2:`side_setback_street_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)) | `parcels.frontage_m` (011), `parcels.is_corner_lot` (174), `parcels.zoning_zn_string` (165) | — | INV-9 | status ≠ permitted |
| `main_rear_setback_m` | numeric m | D, H, S, 2, RA | greater of 7.5 m and 25 % of lot depth (RD/RS/RM, M-174(5)); R/RT 7.5 m; triangular lot: radius from the side-line meeting point (5.10.40.70(5)) *[new 2026-10-18 (M-205, M-212)]* | bylaw_derived | l2:`rear_setback_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)) | `parcels.depth_m` (011), `parcels.geom` (039) | `triangle_simplify_tol_m` | INV-9 | status ≠ permitted |
| `main_depth_cap_m` | numeric m | D, H, S, 2, RA | Layer 2 depth from the required front yard; houseplex 19.0 m on large lots; RM houseplex `not_applicable`; RT `unregulated` (M-204) *[new 2026-10-18 (M-204, M-205)]* | bylaw_derived | l2:`building_depth_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)) | `parcels.depth_m` (011), `parcels.frontage_m` (011) | — | INV-5, INV-19 | unregulated / not_applicable (status in `binding_constraint`) |
| `main_length_cap_m` | numeric m | D, H, S, 2, RA | Layer 2 length; RD/RS houseplex 19.0 m on large lots; one-storey +2.0 m extension on RA only (M-206); RM houseplex `not_applicable`; R/RT off a major street `unregulated` *[new 2026-10-18 (M-204, M-206)]* | bylaw_derived | l2:`building_length_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)) | `parcels.depth_m` (011), `parcels.frontage_m` (011) | — | INV-5, INV-19 | unregulated / not_applicable |
| `main_lane_centreline_setback_m` | numeric m | D, H, S, 2, RA | distance kept from the lane centreline, ≥ 2.5 m (10.5.40.70(2)); NULL where no lane edge *[new 2026-10-18 (M-205(5))]* | bylaw_derived | l2:`lane_centreline_setback_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** lot-line classification + per-edge lane_abutting_length_m (M-209; P5.14 ML-1) (Spec 130 lane / enrich_centreline WF3) | `toronto_centreline.feature_code_desc` (173), `toronto_centreline.geom` (173) | `lane_buffer_m` | INV-9 | no lane edge |
| `main_height_m` | numeric m | D, H, S, 2, RA | `height_m` (x.40.10(1)); houseplex (1)(C) max(HT, 10.0); RM unlabelled houseplex 12.0 m (M-201) | bylaw_derived | `10.80.40.10(1)#(1)(B)`; `10.80.40.10(1)#(1)(C)`; l2:`height_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** M-217 Chapter 40 map-gate leak on RD houseplex height (by-law keying/evaluator lane) | `parcels.zoning_overlays` (165) | — | INV-10 | status ≠ permitted |
| `main_storeys` | integer | D, H, S, 2, RA | headline-form storeys incl. the set-back or attic storey (800.50(820)); houseplex storeys `not_applicable` | bylaw_derived | l2:`height_storeys`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** M-217 storeys leak (40.10.40.10(7)) (by-law keying/evaluator lane) | `parcels.zoning_overlays` (165) | `storey_height_m`, `first_floor_elevation_m` | INV-10 | status ≠ permitted |
| `first_floor_elevation_m` | numeric m | D, H, S, 2, RA | the logic-variable first-floor height above established grade used in `n_w`; ≤ the 1.2 m entrance limit where it applies (R/RM detached and semi; RD/RS all) *[new 2026-10-18 (M-215(2))]* | bylaw_derived | l2:`entrance_height_m`; **OWED** the field, its computation and its check (step commit ① (Spec 78 §Phase-5)) | — | `first_floor_elevation_m` | — | status ≠ permitted |
| `main_wall_limit_m` | numeric m | D, H, S, 2, RA | `Hw` = max(7.0, H − 2.5) (x.40.10(2)); flat-roof form RD max(7.2, H − 2.5) ((4)(A)) | bylaw_derived | l2:`main_wall_height_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)) | — | — | INV-19 | `main_wall_status` not applies |
| `main_wall_pair` | text `side` / `front_rear` / `none` | D, H, S, 2, RA | P5.2 item 3 (70 % sides, or 60 / 50 / 40 % front-rear by frontage tier) | bylaw_derived | **OWED** keying of the share tiers (O-7; vocab target owed, M-223(3)) (by-law keying/evaluator lane) | `parcels.frontage_m` (011) | — | — | status ≠ permitted |
| `gfa_flat_sqm` | numeric m² | D, H, S, 2, RA | form (a): storeys above `Hw` at `F − 2 × 1.4 m × W` (R (11)/(12) M-200, RD (4)(B), RS/RM (6)(A)) *[R added 2026-10-18 (M-200); upper_storey_setback_m keyed 2026-10-19 (Q-M218, M-223(3))]* | bylaw_derived | `10.10.40.10(11)#(11)(A)`; `10.10.40.10(12)#(12)(A)`; `10.20.40.10(4)#(4)(B)`; `10.40.40.10(6)#(6)(A)`; `10.80.40.10(6)#(6)(A)`; l2:`upper_storey_setback_m` | — | `storey_height_m`, `first_floor_elevation_m` | — | status ≠ permitted |
| `storeys_flat` | integer | D, H, S, 2, RA | form (a) storeys *[upper_storey_setback_m keyed 2026-10-19 (Q-M218, M-223(3))]* | bylaw_derived | `10.10.40.10(11)#(11)(A)`; `10.10.40.10(12)#(12)(A)`; `10.20.40.10(4)#(4)(B)`; `10.40.40.10(6)#(6)(A)`; `10.80.40.10(6)#(6)(A)`; l2:`upper_storey_setback_m` | — | `storey_height_m` | — | status ≠ permitted |
| `gfa_pitched_sqm` | numeric m² | D, H, S, 2, RA | form (b): plates + attic counted by the 10.5.40.40(1) test + dormers ≤ 40 % (x.40.10(5)/(7)); R 5:3 above the 2nd storey of a detached house only | bylaw_derived | l2:`element_width_pct`; **OWED** keying of roof_slope_max, the attic test (O-7; vocab target owed, M-223(3)) (by-law keying/evaluator lane) | — | `roof_pitch`, `roof_assembly_depth_m`, `storey_height_m` | — | status ≠ permitted |
| `attic_outside_gfa_sqm` | numeric m² | D, H, S, 2, RA | attic floor area with clearance > 1.4 m that the 10.5.40.40(1) test leaves out of GFA: livable, outside FSI (M-203) *[new 2026-10-18 (M-203)]* | bylaw_derived | **OWED** keying of the attic test (O-7; vocab target owed, M-223(3)) (by-law keying/evaluator lane) | — | `roof_pitch`, `roof_assembly_depth_m` | — | form (b) not computed or the attic passes |
| `storeys_pitched` | integer | D, H, S, 2, RA | form (b) storeys (the attic is a storey, 800.50(820)) | bylaw_derived | — | — | `storey_height_m` | — | status ≠ permitted |
| `roof_form_headline` | text `flat_setback` / `pitched_attic` | D, H, S, 2, RA | larger of the two forms (M-184); tie → (a) | bylaw_derived | — | — | — | — | status ≠ permitted |
| `roof_pitch` | numeric ratio | D, H, S, 2, RA, RI | the logic-variable value used | bylaw_derived | — | — | `roof_pitch` | — | form (b) not computed |
| `fsi_status` | text | D, H, S, 2, RA, RI, RB | `applies:<value>` / `not_applicable:<clause>` / `undecided` / `not_evaluated:<reason>` (Spec 68 §5a part 3) | bylaw_derived | l2:`fsi`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** one closed field-status set (vocab `layer3.field_status` ≠ §5a part 3, M-223(2)); `not_applicable` seat (M-183) (by-law keying/evaluator lane) | — | — | INV-7, INV-18 | never |
| `coverage_status` | text | D, H, S, 2, RA, RI, RB | `applies:<value>` / `not_applicable:<clause>` / `undecided` / `not_evaluated:<reason>` (Spec 68 §5a part 3) | bylaw_derived | l2:`lot_coverage_pct`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** one closed field-status set (vocab `layer3.field_status` ≠ §5a part 3, M-223(2)); `not_applicable` seat (M-183) (by-law keying/evaluator lane) | — | — | INV-8, INV-19 | never |
| `storeys_status` | text | D, H, S, 2, RA, RI, RB | `applies:<value>` / `not_applicable:<clause>` / `undecided` / `not_evaluated:<reason>` (Spec 68 §5a part 3) | bylaw_derived | l2:`height_storeys`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** one closed field-status set (vocab `layer3.field_status` ≠ §5a part 3, M-223(2)); `not_applicable` seat (M-183) (by-law keying/evaluator lane) | — | — | INV-10, INV-18 | never |
| `main_wall_status` | text | D, H, S, 2, RA, RI, RB | `applies:<value>` / `not_applicable:<clause>` / `undecided` / `not_evaluated:<reason>` (Spec 68 §5a part 3) | bylaw_derived | l2:`main_wall_height_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** one closed field-status set (vocab `layer3.field_status` ≠ §5a part 3, M-223(2)); `not_applicable` seat (M-183) (by-law keying/evaluator lane) | — | — | INV-19 | never |
| `height_status` | text | D, H, S, 2, RA, RI, RB | `applies:<value>` / `not_applicable:<clause>` / `undecided` / `not_evaluated:<reason>` (Spec 68 §5a part 3) | bylaw_derived | l2:`height_m`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** one closed field-status set (vocab `layer3.field_status` ≠ §5a part 3, M-223(2)); `not_applicable` seat (M-183) (by-law keying/evaluator lane) | — | — | INV-10, INV-18 | never |
| `dwelling_units` | integer | D, H, S, 2, RA, RI, RB | D 1; H/S P5.4 = min(u [no u = no cap; lift to 6 only R/RT/RM in 600.60], 4 for S, 4/6 for H, floors); 2: 2 (O-9); RI conversion count (needs existing storeys); RA/RB incl. a basement unit | bylaw_derived | l2:`dwelling_units_max`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)); **OWED** M-220 no-u → not_evaluated (by-law keying/evaluator lane) | `parcels.zoning_zn_string` (165), `parcels.sixplex_membership_basis` (254) | `circulation_share`, `unit_min_interior_sqm` | INV-11 | status ≠ permitted; RI without user storeys |
| `unit_breakdown` | jsonb `[{floor, interior_area_sqm, in_gfa}]` | H, S, 2, RI, RB | P5.4 per-floor split | bylaw_derived | — | — | `circulation_share`, `basement_livable_share`, `unit_min_interior_sqm` | INV-12 | D or units = 1 |
| `basement_livable_sqm` | numeric m² | D, H, S, 2, RA, RI, RB | plate × `basement_livable_share`; a design choice, not in GFA (10.5.40.40(3)(A); M-171 note) | bylaw_derived | — | — | `basement_livable_share` | — | share = 0 |
| `max_bedrooms` | integer | H, S, RI | Layer 2 `bedrooms`: 4 × units at 2 units, 3 × units at 3+ (R/RD 40.1(8), RS (7), RT/RM (6)) | bylaw_derived | `10.20.40.1(8)#(8)(B)`; l2:`bedrooms`; **OWED** Layer 2 resolution rows for the P5.3 targets, per class (D-1) (Layer 2 step (Spec 68 §11 Phase 2)) | — | — | INV-14 | not a houseplex |
| `host_interior_sqm` | numeric m² | 2 | the whole house's interior area (the 150.10.40.40(1) denominator, M-199); the main unit is this − `suite_interior_sqm` *[redefined 2026-10-18 (M-199)]* | bylaw_derived | **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane) | — | — | INV-13 | no secondary suite |
| `suite_interior_sqm` | numeric m² | 2, RI, RB | ≤ 45 % of the whole house's interior (M-199; stricter reading disclosed); a one-storey detached house's suite may take the whole basement (150.10.40.40(2)); RI/RB need the user's storeys *[reading changed 2026-10-18 (M-199)]* | bylaw_derived | l2:`interior_floor_area_m2`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane); **OWED** M-221 secondary-suite release unkeyed; M-217 interior_floor_area_m2 leak (150.50.20.1(1)) (by-law keying/evaluator lane) | — | — | INV-13 | no secondary suite |
| `gain_vs_detached_gfa_sqm` | numeric m² | 2, H, S | this row − the `detached_house` row, same roof-form basis (P5.2 item 11) | bylaw_derived | — | — | — | INV-4, INV-5, INV-6 | either row not permitted |
| `gain_vs_detached_footprint_sqm` | numeric m² | 2, H, S | as above, footprint | bylaw_derived | — | — | — | INV-4 | either row not permitted |
| `gain_vs_detached_storeys` | integer | 2, H, S | as above, storeys | bylaw_derived | — | — | — | INV-4 | either row not permitted |
| `gain_reasons` | text[], closed | 2, H, S | `fsi_not_applicable` · `coverage_45` · `storeys_not_applicable` · `height_houseplex` · `main_wall_not_applicable` · `depth_length_19m` · `depth_length_not_applicable` · `none` (M-204 added two) *[two values added 2026-10-18 (M-204)]* | bylaw_derived | — | — | — | INV-6 | either row not permitted |
| `suite_type` | text `none` / `garden` / `laneway` | suite | P5.5; laneway needs one of the three 150.8.30.20(1) arms (M-209), never the 20 m flag | bylaw_derived | **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane); **OWED** lot-line classification + per-edge lane_abutting_length_m (M-209; P5.14 ML-1) (Spec 130 lane / enrich_centreline WF3) | `toronto_centreline.feature_code_desc` (173), `toronto_centreline.geom` (173), `parcels.geom` (039), `parcels.primary_frontage_street_name` (174) | `lane_buffer_m` | INV-15 | never |
| `suite_lane_arm` | text `rear` / `side` / `cumulative` | suite | which 150.8.30.20(1) arm passed, with `lane_rear_length_m` / `lane_side_length_m` (M-209) *[new 2026-10-18 (M-209)]* | estimate | **OWED** lot-line classification + per-edge lane_abutting_length_m (M-209; P5.14 ML-1) (Spec 130 lane / enrich_centreline WF3) | `toronto_centreline.feature_code_desc` (173), `toronto_centreline.geom` (173), `parcels.geom` (039) | `lane_buffer_m` | INV-15 | `suite_type` ≠ laneway |
| `suite_gfa_sqm` | numeric m² | suite | P5.5 caps after the 10.5.40.40 reductions (M-210) and `< main` (150.7.60.50(2)/(4), 150.8.60.50(2)) | bylaw_derived | l2:`gfa_m2`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane) | — | `depth_search_step_m`, `suite_gfa_strict_margin_sqm` | INV-1, INV-2 | `suite_type = none` |
| `suite_footprint_sqm` | numeric m² | suite | P5.5 region ∩ caps (150.8.60.30(5)/(6)); soft landscaping is disclosed, not a cap (M-208) | bylaw_derived | l2:`building_length_m`; l2:`building_width_m`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane) | — | — | INV-8 | `suite_type = none` |
| `suite_height_m` | numeric m | suite | 4.0 or 6.3 by actual separation (150.7.60.40(1), 150.8.60.40(1)); Coxwell area 6.3 at ≥ 5.0 m (M-224) *[Coxwell coupling 2026-10-18 (M-224)]* | bylaw_derived | l2:`height_m`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane) | — | `coxwell_generous_reading` | INV-10 | `suite_type = none` |
| `suite_separation_m` | numeric m | suite | 4.0 / 7.5; Coxwell in the held polygon 5.0 (M-224); never from Layer 2 until M-225 is fixed | bylaw_derived | l2:`separation_m`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane); **OWED** M-222 Coxwell map gate; M-225 10.5.80.1(2)(A) leak (being fixed) (by-law keying/evaluator lane); **OWED** Coxwell polygon in bylaw_map_areas (M-193, M-224) (Spec 58 lane) | `bylaw_map_areas.map_code` (254), `bylaw_map_areas.geom` (254) | `coxwell_generous_reading` | INV-10 | `suite_type = none` |
| `suite_rear_setback_m` | numeric m | suite | garden 150.7.60.20(2)(A)/(B) (half-height on lots > 45.0 m), through lot (3); laneway 150.8.60.20(2); ≥ 2.5 m from the lane centreline (10.5.60.20(4)); no openings by default (LC-35) | bylaw_derived | l2:`rear_setback_m`; l2:`lane_centreline_setback_m`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane); **OWED** M-219 principal setbacks applied to the suite (by-law keying/evaluator lane); **OWED** lot-line classification + per-edge lane_abutting_length_m (M-209; P5.14 ML-1) (Spec 130 lane / enrich_centreline WF3) | `parcels.depth_m` (011), `parcels.is_through_lot` (174) | — | INV-9 | `suite_type = none` |
| `suite_side_setbacks_m` | jsonb `{side_1, side_2, street_side, upper_stepback}` m | suite | garden (5)(B) default, corner (6) larger-of; laneway (3)(A) 0.0 m, street side (3)(B), **(3)(C) 1.5 m above 4.0 m applied** (M-198) *[(3)(C) applied 2026-10-18 (M-198)]* | bylaw_derived | `150.8.60.20(3)#(3)(C)`; l2:`side_setback_m`; l2:`side_setback_street_m`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane); **OWED** lot-line classification + per-edge lane_abutting_length_m (M-209; P5.14 ML-1) (Spec 130 lane / enrich_centreline WF3) | `parcels.is_corner_lot` (174), `parcels.frontage_m` (011), `parcel_abutments.neighbour_residential` (255) | — | INV-9 | `suite_type = none` |
| `suite_setback_basis` | jsonb | suite | `{openings: none, lot_depth_gt_45, corner_lot, through_lot, lane_line, street_line, rear_abuts_residential, coxwell: in/may_qualify/out, unknown_facts_taken_larger}` | metadata | — | `parcels.depth_m` (011), `parcels.is_corner_lot` (174), `parcels.is_through_lot` (174) | — | — | `suite_type = none` |
| `suite_openings_loss_sqm` | numeric m² | suite | suite GFA lost if openings are added on every wall with an openings arm (150.7.60.20(2)(C), (5)(A); 150.8.60.20(2)(B), (3)(D)) | bylaw_derived | — | — | — | — | `suite_type = none` or no openings arm |
| `suite_coverage_option` | text `A` / `B` / `laneway` | suite | 150.7.60.70(1) / 150.8.60.70(1) (M-191) | bylaw_derived | l2:`lot_coverage_pct`; l2:`ancillary_coverage_pct`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane) | — | — | INV-8 | `suite_type = none` |
| `suite_soft_landscaping_sqm` | numeric m² | suite | the soft-landscaping area 150.7.50.10(1) / 150.8.50.10(1) require; disclosed (`suite_soft_landscaping`), never sizes the suite (M-208, operator 2026-10-18) *[new 2026-10-18 (M-208)]* | bylaw_derived | l2:`rear_soft_landscaping_pct`; **OWED** suite classes and the applies() suite match (M-182, M-177) (P2-10 / by-law keying/evaluator lane) | `parcels.frontage_m` (011), `parcels.geom` (039) | — | — | `suite_type = none` |
| `main_depth_chosen_m` | numeric m | suite | the optimal `d` (P5.5) | bylaw_derived | — | — | `depth_search_step_m`, `suite_weight` | — | `suite_type = none` |
| `main_gfa_without_suite_sqm` | numeric m² | suite | P5.2 with no suite | bylaw_derived | — | — | — | INV-3 | status ≠ permitted |
| `main_gfa_with_suite_sqm` | numeric m² | suite | P5.2 at `d` | bylaw_derived | — | — | — | INV-1, INV-3 | `suite_type = none` |
| `total_gfa_sqm` | numeric m² | D, H, S, 2, RA, RI, RB | main (with suite) + suite; RA: existing + up + back; RI: existing + attic (needs user storeys) | bylaw_derived | — | — | — | INV-1 | status ≠ permitted; renovation rows without user storeys |
| `binding_constraint` | text, closed | D, H, S, 2, RA, RI, RB | P5.2 item 10 (adds `front_averaging`, `lane_centreline`, `lot_viability`) *[three values added 2026-10-18]* | bylaw_derived | — | — | — | — | status ≠ permitted |
| `suite_binding` | text, closed | suite | P5.5 (adds `upper_side_stepback`, `lane_centreline`, `lane_frontage`; no soft-landscaping value, M-208 disclosed) *[three values added 2026-10-18]* | bylaw_derived | — | — | — | — | `suite_type = none` |
| `cited_clauses` | text[] | D, H, S, 2, RA, RI, RB | Layer 1 unit ids applied, sorted (incl. the suite setback units that decided) | bylaw_derived | **OWED** Layer 3 lineage (Spec 68 §5a part 6) (step commit ①) | — | — | INV-16, INV-17 | never (may be empty only when not_evaluated) |
| `disclosures` | text[] | D, H, S, 2, RA, RI, RB | P5.12 codes + carried Layer 2 disclosures, sorted | bylaw_derived | **OWED** P5.12 codes in vocab.json (step commit ①) | — | — | INV-21 | never (may be empty) |
| `existing_width_m` | numeric m | RA, RI, RB | shorter side of the oriented envelope of the primary footprint (not width along the street; P5.14 ML-5) | estimate | — | `parcels.existing_width_m` (187), `parcel_buildings.is_primary` (024) | — | — | no primary building linked |
| `existing_depth_m` | numeric m | RA, RI, RB | longer side of the oriented envelope (as above) | estimate | — | `parcels.existing_length_m` (187), `parcel_buildings.is_primary` (024) | — | — | no primary building linked |
| `existing_storeys` | integer | RA, RI, RB | **user input only** (O-13 amended 2026-10-18); NULL in the pipeline *[source removed 2026-10-18 (cur_storeys_range is a neighbourhood range)]* | user_input | — | — | — | INV-20 | always in the pipeline |
| `existing_basement` | boolean | RA, RI, RB | unknown in the pipeline (O-14); user input | user_input | — | — | — | — | always in the pipeline |
| `existing_footprint_sqm` | numeric m² | RA, RI, RB | width × depth (envelope ≥ true footprint on L-shapes) | estimate | — | `parcels.existing_width_m` (187), `parcels.existing_length_m` (187) | — | — | width or depth NULL |
| `existing_confidence` | numeric [0, 1] | RA, RI, RB | P5.6 (mislink flag, link confidence, shared-footprint penalty) | estimate | — | `parcels.existing_data_quality_flag` (193), `parcel_buildings.confidence` (026), `parcel_buildings.is_primary` (024) | `existing_shared_footprint_penalty` | — | no primary building linked |
| `existing_source` | text `estimated` | RA, RI, RB | provenance; the app overlays `user_entered` (P5.7) | metadata | — | — | — | — | never on renovation rows |
| `existing_low_confidence` | boolean | RA, RI, RB | `existing_confidence < existing_confidence_min` | estimate | — | — | `existing_confidence_min` | — | confidence NULL |
| `renovation_envelope_gfa_sqm` | numeric m² | RA, RI, RB | P5.2 for the renovation class | bylaw_derived | — | — | — | — | status ≠ permitted |
| `renovation_envelope_footprint_sqm` | numeric m² | RA, RI, RB | P5.2 plate for the renovation class | bylaw_derived | — | — | — | — | status ≠ permitted |
| `addition_up_gfa_sqm` | numeric m² | RA | up room: 10.5.40.71(3) on ≤ 12.2 m frontage (setbacks only), still within depth / length caps and `fsi × lot − existing GFA` (M-211(1)); needs user storeys *[caps added 2026-10-18 (M-211)]* | user_input | **OWED** keying of 10.5.40.71(3) (12.2 m) (by-law keying/evaluator lane) | `parcels.frontage_m` (011) | — | INV-1 | existing input NULL (storeys always NULL in the pipeline) |
| `addition_back_footprint_sqm` | numeric m² | RA | `max(0, F − existing footprint)` | estimate | — | — | — | — | existing input NULL |
| `addition_back_gfa_sqm` | numeric m² | RA | back footprint × storeys allowed; R: storeys ≤ existing storeys (10.10.40.10(7), APPLIED, M-211(2)); needs user storeys in R *[R floor cap applied 2026-10-18 (M-211)]* | user_input | — | — | — | INV-1 | existing input NULL; R without user storeys |
| `interior_attic_gfa_sqm` | numeric m² | RI | attic test inside the existing box (10.5.40.40(1)); needs user storeys | user_input | — | — | `roof_pitch` | — | existing input NULL |
| `interior_units_gain` | integer | RI | conversion units − 1 (10.5.20.40(1); 600.60.40(3)); needs user storeys | user_input | — | — | — | — | existing input NULL |
| `basement_livable_gain_sqm` | numeric m² | RB | existing footprint × share; not GFA (10.5.40.40(3)(A)) | estimate | — | — | `basement_livable_share` | — | existing input NULL |
| `row_trust_level` | text `high` / `disclosed` / `low` / `not_evaluated` | D, H, S, 2, RA, RI, RB | COMPUTED from `trust_checks` and the field tiers (P5.14), never asserted *[new 2026-10-18 (O-17)]* | metadata | **OWED** the field, its computation and its check (step commit ① (Spec 78 §Phase-5)) | — | `trust_high_min_pass_pct` | INV-22 | never |
| `trust_checks` | jsonb `[{check, result}]` | D, H, S, 2, RA, RI, RB | every applicable P5.15 invariant id with pass / fail / n/a for this row, plus the ML-n register items that touch it *[new 2026-10-18 (O-17)]* | metadata | **OWED** the field, its computation and its check (step commit ① (Spec 78 §Phase-5)) | — | — | INV-22 | never |
| `coa_form` | text `single` / `single_suite` / `multiplex` | D, H, S, 2 | M-65 P → form map: D → single; 2 → single_suite; H/S → multiplex (§6.4 rule 2); RA/RI/RB and the suite add-on have no form (LC-49, P5.10a) *[new 2026-10-18 (O-18)]* | precedent_estimate | — | — | — | INV-23 | renovation rows; no form |
| `coa_factor` | jsonb `{lv_id, value, version, fit_basis}` | D, H, S, 2 | the u logic variable of the form, bounded [1.0, 1.5], backed by the pinned re-fit audit (§6.4 rule 3) *[new 2026-10-18 (O-18)]* | precedent_estimate | — | — | — | INV-23 | no form; unfitted form |
| `coa_gfa_sqm` | numeric m² | D, H, S, 2 | AOR(s) × u_form, AOR(s) = this row's `main_gfa_sqm` (§6.4); `not_evaluated:coa_factor_unfitted:single_suite` until the trial fits it *[new 2026-10-18 (O-18)]* | precedent_estimate | — | — | — | INV-23 | no form; unfitted; status ≠ permitted |
| `coa_increment_sqm` | numeric m² | D, H, S, 2 | `coa_gfa_sqm − main_gfa_sqm`, labelled "calibrated from realized CoA builds of this form, not law" (M-65(5)) *[new 2026-10-18 (O-18)]* | precedent_estimate | — | — | — | INV-23 | as `coa_gfa_sqm` |
| `coa_status` | text | D, H, S, 2, RA, RI, RB | `applies` · `not_evaluated:coa_factor_unfitted:<form>` · `not_applicable:no_coa_form` (renovation rows; LC-49). The suite add-on has no CoA figure; `coa_gfa_sqm` covers the main building only *[new 2026-10-18 (O-18)]* | precedent_estimate | — | — | — | INV-23 | never |
| `nearby_coa_builds_gfa_sqm` | numeric m² | D, H, S, 2 | median realized FSI of ≥ 5 nearby same-form CoA builds (≤ 3 km, lot area ± 30 %) × this lot's area; kind `empirical_ref`, never a multiplier (§6.4) *[new 2026-10-18 (O-18)]* | observed | — | `parcels.lot_size_sqm` (011) | — | — | fewer comps → `not_evaluated:insufficient_comps` |
| `nbhd_coa_approval_rate` (reference, not persisted) | numeric (reference) | D, H, S, 2, RA, RI, RB | by reference: `neighbourhood_build_norms.coa_approved / coa_refused / coa_total / coa_approval_rate` (§Phase-1 P1.2) via `parcels.neighbourhood_id`; no new computation *[reference 2026-10-18]* | observed | — | `neighbourhood_build_norms.coa_approved` (199), `neighbourhood_build_norms.coa_refused` (199), `neighbourhood_build_norms.coa_total` (199), `neighbourhood_build_norms.coa_approval_rate` (199), `parcels.neighbourhood_id` (196) | — | — | no neighbourhood |
| `comparable_builds_ref` (reference, not persisted) | jsonb (reference) | D, H, S, 2, RA, RI, RB | by reference: `parcels.comparable_builds` (§P3C.2, incl. `coa_decision`) and `comp_count`; with `nearby_coa_builds_gfa_sqm` this is the per-lot CoA list (LC-51); no new computation *[reference 2026-10-18]* | observed | — | `parcels.comparable_builds` (202), `parcels.comp_count` (202) | — | — | no comps |
| `layer2_table_version` | text | D, H, S, 2, RA, RI, RB | run lineage (§6.1 "Every value") | metadata | — | — | — | — | never |
| `evaluator_version` | text | D, H, S, 2, RA, RI, RB | run lineage | metadata | — | — | — | — | never |
| `code_version` | text | D, H, S, 2, RA, RI, RB | run lineage | metadata | — | — | — | — | never |
| `computed_at` | timestamptz | D, H, S, 2, RA, RI, RB | the run clock; never a guard term | metadata | — | — | — | — | never |
<!-- /generated:maxbld-lineage-fields -->

CHECKs:
- `renovation_*`, `addition_*`, `interior_*`, `basement_livable_gain_sqm` and `existing_*` are NULL unless `scenario` is a renovation.
- `existing_storeys` and `existing_basement` are NULL on every pipeline row (user input only; O-13, O-14).
- `coa_*` are NULL on renovation rows (P5.10a, LC-49) and `row_trust_level` is NOT NULL.
- `suite_*` is NULL iff `suite_type = 'none'`.
- `is_headline` is false on renovation rows.

### P5.10a The CoA tier and the recent-CoA context (O-18; reuses §6.4, M-65)

Operator 2026-10-18: *"we do [need] CoA fields for the report — CoA recent projects etc, max build CoA for each of the new scenarios"*. **Nothing here is redesigned:** the method, the form map, the bounds, the re-fit audit and the drift gate are §6.4 (Spec 69 M-65, ratified 2026-10-07). This section only maps them onto the §Phase-5 scenarios.

**The CoA fields** (registry rows `coa_form`, `coa_factor`, `coa_gfa_sqm`, `coa_increment_sqm`, `coa_status`, `nearby_coa_builds_gfa_sqm`; trust tier `precedent_estimate`, never `bylaw_derived`):

| Scenario | M-65 form | `coa_gfa_sqm` |
|---|---|---|
| `detached_house` | `single` | `main_gfa_sqm × u_single` |
| `house_with_secondary_suite` | `single_suite` | `not_evaluated:coa_factor_unfitted:single_suite` until the Phase 3 trial fits it (§6.4 rule 2; never borrowed) |
| `detached_houseplex`, `semi_detached_houseplex` | `multiplex` (2–4, 5–6) | `main_gfa_sqm × u_multiplex` |
| rear-suite add-on | none | no CoA figure: `coa_gfa_sqm` covers the main building only; the suite columns carry none (RULED, LC-49) |
| `renovation_addition`, `renovation_interior`, `renovation_basement` | none | NULL, `coa_status = not_applicable:no_coa_form` (RULED, LC-49) |

- AOR(s) is the row's own as-of-right `main_gfa_sqm` (headline form), the AOR of the **same** form that u is fitted against (§6.4 rule 1). `coa_increment_sqm = coa_gfa_sqm − main_gfa_sqm`, labelled "calibrated from realized CoA builds of this form, not law" (`coa_calibrated_not_law`).
- The u values are the §6.4 `logic_variables.json` rows bounded [1.0, 1.5]; their ids and versions are in `coa_factor` and in lineage. **A re-fit is mandatory after E2** (KFM-78-6).
- `nearby_coa_builds_gfa_sqm` is the §6.4 observed figure (kind `empirical_ref`): never a multiplier on AOR(s), never the CoA headline.
- **Apart from the high-trust numbers (INV-23):** no `coa_*` field feeds `total_gfa_sqm`, `is_headline` or any as-of-right field, and `row_trust_level` (P5.14) is computed without them. The CoA tier has its own label: "precedent estimate".

**RULED (operator 2026-10-18; LC-49): CoA is not applicable to the rear suite and the renovations.** M-65's map covers principal forms only, and no fit cohort exists for 150.7 / 150.8 suites or for additions, so no factor is invented. Renovation rows: `coa_gfa_sqm` NULL, `coa_status = not_applicable:no_coa_form`. Suite add-on: no CoA figure; the row's `coa_gfa_sqm` covers the main building only, and the `coa_calibrated_not_law` disclosure says so.

**Recent-CoA context, by reference (no new computation; the report joins them):**
- neighbourhood CoA approved / refused / total / approval rate: `neighbourhood_build_norms.coa_approved`, `coa_refused`, `coa_total`, `coa_approval_rate` (§Phase-1 P1.2), through `parcels.neighbourhood_id` (registry row `nbhd_coa_approval_rate`);
- comparable builds with their CoA decision: `parcels.comparable_builds` (`coa_decision` per comp) and `comp_count` (§P3C.2; registry row `comparable_builds_ref`).

**The per-lot CoA list is the one the governing spec already decided (operator 2026-10-18; LC-51).** No new field. Per lot the report shows (1) `comparable_builds` (§P3C.2): the 10 nearest comparable builds, each with its `coa_decision`; (2) `nearby_coa_builds_gfa_sqm` (§6.4, M-65(6)): the nearby same-form CoA builds figure with its comp count; (3) the neighbourhood CoA counts and approval rate. The drafted `nearby_coa_applications` field (applications with their variances) is withdrawn: §6.4 and §P3C did not decide it, and adding it would widen scope.

**Interplay with the existing CoA columns (unchanged):** KFM-78-1 (two disagreeing CoA figures) and KFM-78-7 (no double counting: u is the CoA effect alone, fitted on the same form) are why §6.4 exists; KFM-78-6 (AOR above the legal FSI) forces the re-fit after E2; **KFM-78-8: `opt_coa_gfa_sqm` stays a DB column feeding the Spec 88 CoA cost line** until the cost epic migrates it. The coa chain's `compute_coa_cost_estimates` reads cost and area columns of `enrich_parcels` (O-11 consumer list), never this table, so the CoA tier here changes nothing it reads.

### P5.11 Step shape, checks and the V3 compliance plan

**Write discipline and staleness.**
- Guarded upsert keyed `(parcel_id, scenario)`, `IS DISTINCT FROM` over every value column; `computed_at` is excluded.
- A keyed per-batch delete removes scenarios no longer produced.
- A re-run with no change writes 0 rows.
- `outputs.replay`; `recovery.reset` (TRUNCATE).
- Full rescan: `mode_select: "none"`, the Spec 130 posture.

**Guards:**
- the Layer 2 table is present at the current `table_version`;
- every P5.9 variable is present (`declared_logic_variables_present`, Spec 122 R-D).

**Checks** (each bound is `limit_from_config` or an exact zero):
- `scenario_totality`: 0 missing;
- `headline_unique`;
- `suite_lt_main`: 0;
- `fsi_consistent`: 0;
- `coverage_consistent`: 0;
- `units_within_cap`: 0;
- `renovation_columns_scoped`: 0;
- **the P5.15 invariants** whose "runs at" is *step check*: each a hard 0 (INV-1..INV-15, INV-20..INV-22);
- `trust_level_computed`: 0 rows whose `row_trust_level` differs from the P5.14 computation over its own `trust_checks` (never asserted);
- `not_evaluated_share` (WARN);
- `rows_written` / `rows_unchanged` (INFO).

**Terminals:** `computed`, `computed_with_warnings`, `no_eligible_parcels`, `failed_missing_precondition`, `failed_config_out_of_bounds`, `lock_held_elsewhere`.

**`records_meta` counters:**
- `scenarios_computed`, `scenarios_permitted`;
- `scenarios_not_permitted` (by clause), `scenarios_not_buildable`, `scenarios_not_evaluated` (by reason);
- `roof_form_flat_headline`, `roof_form_pitched_headline`;
- `suite_option_a`, `suite_option_b`, `suite_laneway`;
- `existing_low_confidence_count`;
- `row_trust_high`, `row_trust_disclosed`, `row_trust_low` (P5.14);
- `coa_not_evaluated` (by reason).

**V3 compliance plan** (Spec 124 R-DF / R-DT, six parts):

| Part | How | Lock / file |
|---|---|---|
| (1) Standardized gates | gates A–K + fast invariants hard from ①; no ledger allowance (R-BC (b)) | `scripts/analysis/step-validate.mjs`; `step-validate-standard-label.logic` |
| (2) Registry | descriptor-generated registries; R-DJ `--check`s (target-files block generated at ①); census `legacy: "none"`, owner_specs 78 (R-DK evidence set); R-DL admin entries | `admin-step-registration.logic`; `step-validate-net-new.logic` |
| (3) Cross-step truth | every read table declared; LDG-10 (#50); #44 arms a/b/c/e/h/i | `scripts/analysis/gates/ldg10.mjs`, `witness.mjs`; `witness-i.logic` |
| (4) Compute purity | compute module + `renovation-shared.js` pure; G0–G13 zero; gate E #32 zero; G-EXC-LIT clean | `compute-purity.mjs`, `compute-literals.mjs`, `scripts/analysis/bylaw/exc-lit.mjs` |
| (5) Externalized | law numbers only from Layer 2; P5.9 variables seeded by migration; check bounds from config | `closed-bounds.mjs`; `r-de-vocabulary.logic` |
| (6) Reproducible captures | net-new: no PRE, G8 vs the committed POST (R-DK); bracket `--op=delete_reinsert` keyed `parcel_id` (R-DP); rerun-zero; red evidence (gate K); replay order R-DQ | `cohort-delete-reinsert.logic`, `replay-order.logic`, `scripts/analysis/gates/net-new.mjs` |

**Runner dependencies.** The step uses only existing library forms: `pipeline.step()`, the guarded upsert, `batch_size_from_config`, `delete_reinsert`. The 18 runner rulings approved 2026-10-18 (`.cursor/v3-runner-lane-rulings-2026-10-18.md`; register ids from Spec 124 **R-DV**, built by the runner lane) bind it the way they bind every V3 step:
- the template-freeze / §8 re-freeze after M26;
- EXT-1, the runner literal scan including the `index.js` `: 4` concurrency fallback.

Its commit ① lands after them. If a runner form it needs changes shape, the change is the runner lane's, not this step's.

### P5.12 Disclosures (closed codes; registered in `vocab.json` at ①)

| Code | Template | Source |
|---|---|---|
| `roof_form_alternate` | "A {flat roof with a set-back top storey / pitched roof with an attic} gives {X} m²." | M-184 |
| `main_wall_pair` | "Maximum main-wall height {Hw} m applies to the {side / front and rear} walls for {p} % of their width." | x.40.10(2) |
| `dormers_at_max` | "Dormers are taken at the 40 % maximum." | M-185 |
| `flat_roof_setback` | "The top storey is set back {s} m from the front and rear walls." | R (11)(A)/(12)(A), RD (4)(B), RS/RM (6)(A); `upper_storey_setback_m` (Q-M218, LC-54) |
| `basement_excluded` | "The basement ({A} m²) is livable but not counted in the City's floor-area total (GFA)." | 10.5.40.40(3)(A) |
| `basement_unit_grade` | "A basement unit may not be entirely below the ground level the City measures from (established grade)." | 5.10.1.30(3) |
| `basement_headroom_code` | "Basement headroom is set by the Building Code, not the zoning by-law." | P5.6 |
| `basement_becomes_storey` | "If the lowest level is raised so its midpoint is above the ground level the City measures from (established grade), it becomes a storey and counts in the floor-area total (GFA)." | 800.50(80) |
| `semi_party_wall` | "This assumes the lot holds half of a semi-detached building; the party wall stays." | M-181(4) |
| `sixplex_height_conditions` | "10.5 m is achieved if the lowest level is raised 1.0–1.5 m and holds a dwelling unit." | 600.60.40(2)(A) |
| `suite_openings_setback` | "If the suite has windows/doors in its {rear / side} wall: setback {X} m, suite reduced by {Y} m². This applies only if the {rear lot line abuts a residential lot / side lot line does not abut a street}." | 150.7.60.20(2)(C), (5)(A); 150.8.60.20(2)(B), (3)(D); LC-35; M-197 (no windows assumed; the two lot facts are disclosed, never read: operator 2026-10-19, Q-M197, LC-54) |
| `suite_lot_fact_unknown` | "{Fact} is not known for this lot; the larger setback ({X} m) is used." | M-176; P5.5 lot facts |
| `laneway_upper_side_stepback` | "Above 4.0 m the laneway suite steps back 1.5 m from the side line that abuts another lot's rear line (applied)." | 150.8.60.20(3)(C); M-198 (mandatory, amends M-177(3)) |
| `suite_parking_variants` | "A suite containing a parking space has larger rear / side setbacks." | 150.7.60.20(4), (6)(B); M-177(3) |
| `suite_separation_arm` | "A 6.3 m suite needs 7.5 m from the house; at 4.0 m from the house the suite is limited to 4.0 m." | M-177(2) |
| `suite_coverage_option` | "Coverage uses option {A/B}; the other gives {X} m²." | M-191 |
| `coxwell_area` | "This suite takes the Coxwell–Victoria Park reading of 150.7.60.30(1)(C): over 4.0 m tall at 5.0 m from the house. The City may read the 4.0 m height cap as applying below 7.5 m from the house; a written City interpretation is pending." (mandatory on every lot that takes the reading) | M-224 (amends M-193) |
| `coxwell_may_qualify` | "This lot may be in the Coxwell–Victoria Park area, where a suite over 4.0 m may sit 5.0 m from the house." (coarse street filter; until the polygon is held) | M-224 |
| `ancillary_coverage_all_buildings` | "If all buildings on the lot together cover no more than 45 % of it, the limit on ancillary building coverage does not apply to a lot with a houseplex or a secondary suite." | 10.5.60.70(1)(C), 10.10.60.70(1)(C); M-177(1); until the two-building step (P2-10); operator 2026-10-19 (Q-other-building, LC-54) |
| `other_ancillary_buildings` | "If the lot has other ancillary buildings, they count toward the {20 / 30} % ancillary coverage." | M-177(3) |
| `suite_counts_toward_u` | "If the 'u' label counts the suite, the lot's unit cap applies to both units." | M-195 |
| `unit_count_reduced` | "Units reduced to {n} so each has at least {m} m²." | P5.4 |
| `existing_low_confidence` | "Low confidence in existing footprint — enter your dimensions." | P5.6 |
| `existing_estimated` | "Existing-house dimensions are estimated from aerial massing; storeys are estimated." | P5.6 |
| `renovation_position_unknown` | "The addition is an area difference; the existing building's position on the lot is not known." | P5.6 |
| `addition_above_existing` | "On a lot of 12.2 m or less, an addition above the house keeps its setbacks (achieved if the house is lawfully existing)." | 10.5.40.71(3); M-192 |
| `existing_walls_site_fact` | "If the existing walls are taller or closer to the lot lines than allowed, their lawful height and setbacks stand for them." | 10.5.40.11(4), 10.5.40.71(1); M-192 |
| `rear_addition_floor_levels` | "In the R zone a rear addition's floors may not rise above the existing top floor." | 10.10.40.10(7) |
| `conversion_within_building` | "Added units must fit inside the building as it lawfully existed." | 10.5.20.40(1); 600.60.40(3)(A) |
| `attic_outside_gfa` | "The attic ({A} m²) is livable but not counted in the City's floor-area total (GFA): it does not meet the headroom and size test." | M-203; 10.5.40.40(1) |
| `existing_roof_alteration` | "Changing the existing roof line is limited (roof slope rules for altered roofs)." | 10.10.40.11, 10.20.40.11; M-192 |
| `decks_platforms_not_modelled` | "Decks, porches, balconies and platforms are not modelled; they have their own size and setback rules." | x.40.50; 150.7.60.60; 150.8.60.60 |
| `lawfully_existing_relief` | "If the existing building or suite is lawfully existing, {clause} lets it keep its {height / setback / separation / size}." | M-158, M-178, M-192 |
| `existing_ancillary_setbacks` | "If the existing ancillary building is lawfully existing, a laneway suite in it may keep its setbacks." | 150.8.60.21; M-211(4) |
| `semi_house_two_lots` | "If the semi-detached house is divided onto two lots, each lot's minimums are 50 %." | M-174(1), M-181 |
| `main_entrance_height` | "The main front entrance may be no more than 1.2 m above the ground level the City measures from (established grade)." (where the clause applies) | M-174(2), M-215(2) |
| `suite_soft_landscaping` | "Soft landscaping (grass or planting) of {X} m² is required {behind the house / between the house and the suite}; a suite of this size must still leave that area." | M-208 |
| `rooftop_elements_exempt` | "Rooftop equipment, skylights, solar devices and similar elements may exceed the suite height within limits." | 150.7.60.40(3)–(6), 150.7.75.1, 150.8.60.40(3)–(6), 150.8.75.1 |
| `suite_parking_bicycle` | "No parking is required with the suite; it must provide two bicycle parking spaces." | M-216 |
| `gfa_deductions_not_applied` | "The City's floor-area total (GFA) may also leave out garage, void and similar areas; these depend on the design and are not applied." | M-171; 10.5.40.40(3)(B)–(D); 970.10.15.10 |
| `shoreline_hazard` | "If a shoreline hazard limit or stable top-of-bank crosses the lot, the land below it does not count toward the allowed floor area (FSI)." | 5.10.40.40(1); M-212(3) |
| `triangular_lot` | "The lot has no rear lot line; the rear setback is measured as a radius from where the side lot lines meet." | 5.10.40.70(5); M-212(2) |
| `established_grade` | "Heights are measured from the ground level the City measures from (established grade), which is not known for this lot; on a sloped lot the usable height may differ." | 10.5.40.10(1); M-212(1) |
| `front_yard_averaging` | "The front setback ({X} m) averages the neighbouring houses' estimated setbacks; a survey may differ." | 10.5.40.70(1); M-205 |
| `front_yard_needs_survey` | "The by-law sets this lot's front setback as the average of the neighbouring houses' setbacks (10.5.40.70(1)). We could not measure those reliably, so the zone's standard front setback ({X} m) is shown. A survey is needed to confirm it." (mandatory, high importance, on every lot where averaging would apply and the estimate is not accepted) | 10.5.40.70(1); M-205(1); LC-57 |
| `irregular_lot_approximation` | "Lot frontage and depth are approximated from the lot shape; this lot is close to a threshold." | M-207; P5.14 ML-6 |
| `heritage_designated` | "The property is heritage-designated; changes need heritage approval beyond zoning." | M-213 |
| `ravine_protection` | "The property is in a ravine protection area; a separate ravine permit may limit the building area." | M-213 |
| `holding_zone` | "The zoning has a holding symbol (H): new building must wait until the City lifts it." | M-213; LC-12 |
| `exception_not_authored` | "A site-specific exception applies to this lot and is not yet evaluated; affected values are marked not evaluated." | M-180; M-213 |
| `major_street_forms_not_modelled` | "On a major street an apartment building (up to 60 units) or a townhouse may be permitted with larger limits; not modelled here." | M-214(1) |
| `semi_detached_house_not_modelled` | "A new semi-detached house (with or without a secondary suite) may be built on this half-semi lot; not modelled here." | M-214(2) |
| `forms_deferred` | "Townhouse and apartment forms, and a secondary suite in a semi or townhouse, are not modelled in this release." | M-214(3) |
| `secondary_suite_share_reading` | "If the City reads 45 % against the main unit only, the suite is limited to {X} m²." | M-199 |
| `bedroom_cap` | "Bedrooms are capped at {n} for {u} units." | R/RD 40.1(8), RS (7), RT/RM (6) |
| `suite_gfa_reductions` | "The suite's attic, mechanical, basement and void areas are not counted in its floor-area total (GFA)." | M-210 |
| `r_pre1953_fsi_relief` | "If the house was built before 15 October 1953, a rear addition may bring the total floor area to 0.69 times the lot area (FSI 0.69)." | 10.10.40.40(2); M-211(3) |
| `lane_centreline_original` | "The 2.5 m lane setback is measured from today's lane centreline; the by-law uses the original one." | 10.5.40.70(2), 10.5.60.20(4); M-205(5) |
| `one_storey_extension` | "The addition includes a one-storey rear extension of up to 2.0 m beyond the length limit." | x.40.20(2); M-206 |
| `blank_side_wall` | "Side walls are taken without windows or doors (0.45 m side yard); with them the side yard is {X} m." | 10.10.40.70(4); M-205(2) |
| `buildings_on_same_lot` | "Rules for two or more residential buildings on one lot do not apply to the house and its suite." | x.40.80(2); M-187 Q12 |
| `townhouse_driveway_width` | "Townhouse unit width/frontage is 5.0 m per unit without a private driveway, 6.0 m with one." | M-176(1), M-187 Q4 |
| `existing_storeys_needed` | "Enter the number of storeys of your house to see this result." | O-13 (amended) |
| `coa_calibrated_not_law` | "The Committee of Adjustment (CoA) figure is estimated from past approved builds of this form; it is not a by-law limit. It covers the main building only; a rear suite has no CoA figure." | M-65(5); P5.10a |

### P5.13 Tests (PLANNED; red first)

- **Logic:** `steps/compute_maxbld_scenarios/violations.test.ts` (under `src/tests/`). Cases:
  - RD HT 10.0, frontage 9 m: flat vs pitched;
  - RS houseplex at d 0.6: FSI `not_applicable`;
  - RD house + suite at d 0.45: no FSI cap;
  - RM semi houseplex: 7.5 m per lot;
  - garden suite on a deep vs a shallow lot (6.3 / 7.5 vs 4.0 / 4.0), including the half-height rear setback on a 46 m lot (3.15 m);
  - suite setbacks: garden side (5)(B) default vs (5)(A) disclosed; laneway interior side 0.0 m; laneway rear 1.0 m when the lane line is unknown; corner and through-lot larger-of; `suite_openings_loss_sqm` > 0;
  - coverage option A vs B;
  - laneway: 30 % and 10 × 8 m;
  - RT walls = height;
  - R slope 5:3;
  - houseplex: 6 units in 600.60, 4 outside, disputed basis → `not_evaluated`;
  - bedrooms 3 × units;
  - renovation_addition at frontage 12.0 vs 13.0 m (10.5.40.71(3));
  - renovation_interior: attic + conversion;
  - renovation_basement: GFA unchanged;
  - low confidence → label;
  - headline uniqueness; rerun 0;
  - **added 2026-10-18 (P5.16 folds):** R flat roof form (a) with the 1.4 m set-back storey (M-200); RM unmapped houseplex 12.0 m (M-201); RS semi houseplex capped at 4, RD 'u' 3 not lifted in 600.60, R 'u' 3 lifted to 6, no 'u' = no cap (M-202); failing attic reported outside GFA (M-203); RD houseplex 19.0 m on a 40 m × 12 m lot, RM houseplex no depth cap (M-204); front averaging with two neighbours, R 0.45 m blank wall, RD 10.20.40.70(5) partial 7.5 m (M-205); RD renovation addition takes the one-storey extension and the RD new build does not (M-206); front lot line 3.0 m → not_buildable (M-207); garden suite in a shallow yard: soft-landscaping area disclosed, suite not reduced (M-208); laneway side-only 4.0 m and cumulative 2.0 + 2.0 m (M-209); suite basement excluded from the 120 m² cap (M-210); RA up room capped by depth and by FSI residual, R back room capped at existing storeys (M-211); triangular lot radius rear setback (M-212); holding zone → not_permitted (M-213); laneway 6.3 m suite with the (3)(C) step-back (M-198); Coxwell in-area 5.0 m → 6.3 m vs outside 5.0 m → 4.0 m (M-224); suite 45 % of the whole house (M-199); renovation with NULL storeys → needs_user_input (O-13); CoA single / multiplex / single_suite not_evaluated (P5.10a); row trust level recomputed from its checks (P5.14).
- **Owed rows (P5.15(B) tracker; operator 2026-10-19, Spec 131 LC-54):** M-198 is owed here on the tracker rows 150.7.60.20(1) and 150.7.60.20(6)(C). Both are green for their own fix and show "owed M-198 → P5.13"; the M-198 vectors above (through / corner proxies, the unknown lane line, the laneway 1.5 m step-back above 4.0 m) close them.
- **Shared module:** `renovation-shared.logic.test.ts`: purity (no I/O imports), JS/TS parity on one vector set.
- **Infra:** the table migration (key, FK, CHECKs, RLS) and the logic-variable seed (R-CV form).

### P5.14 Trust model, row trust level and the missing-data register (O-17; operator 2026-10-18)

**The model.** The new-build scenarios (D, H, S, 2 and their suite) are high trust **by design**: they read only the by-law (through Layer 2), the lot's geometry and declared logic variables. The **only low-trust input is the existing house** (user input; the renovation rows). A lawfully-existing effect on a new-build scenario is always a **disclosure** (M-158, M-192), never an input. The CoA tier (P5.10a) is a precedent estimate, labelled apart.

**Trust tier per field** — from the lineage registry (P5.15), rendered in the P5.10 table: `bylaw_derived` (high) · `estimate` (low, user-correctable) · `user_input` (needs the owner's entry) · `precedent_estimate` (CoA) · `observed` (context) · `metadata`.

**Row trust level — COMPUTED, never asserted** (`row_trust_level`, `trust_checks`; INV-22). Per row, from its own checks:
1. `not_evaluated` — `scenario_status` is `not_evaluated:*`.
2. `low` — any applicable P5.15 invariant fails for the row; or a figure in `total_gfa_sqm` reads an `estimate` / `user_input` field (renovation rows on the massing estimate); or a Layer 2 input is not at the current `table_version`.
3. `disclosed` — every applicable invariant passes, but a figure that decided the answer reads an `estimate`-tier input (front averaging, lane edges, the irregular-lot band), or a `gate_flags` value holds (heritage, ravine, exception, shoreline, triangular), or a missing-data item below touches the row.
4. `high` — every applicable invariant passes (`trust_high_min_pass_pct` = 100 %), every figure in `total_gfa_sqm` is `bylaw_derived`, and no gate or register item touches the row.

`trust_checks` lists each applicable invariant id with pass / fail / n/a and each register id that touches the row, so a reader can re-derive the level; the step check `trust_level_computed` recomputes it (0 mismatches). The CoA fields never raise or lower the row's level.

**Missing-data register** (accepted by the operator 2026-10-18; each item names its handling and owner):

| Id | Missing or approximate datum | Effect on the answer | Handling now | Owner |
|---|---|---|---|---|
| ML-1 | Lot-line classification (front / rear / side per edge) and lane abutment ≥ 3.5 m | laneway eligibility (M-209), suite setbacks, the (3)(C) trigger | the larger setback (M-176); the centreline gives a partial classification (75 % rear / 18 % side / 7 % ambiguous in the sample); `suite_lot_fact_unknown` | Spec 130 lane; enrich_centreline WF3 (KFM-78-9) |
| ML-2 | Coxwell polygon | the M-224 generous reading | literal reading everywhere; `coxwell_may_qualify` on the coarse street filter | Spec 58 lane (M-193) |
| ML-3 | 1,121 disputed sixplex lots (`gis_hole_ward_in` 877, `gis_edge_ward_in` 244) | the houseplex cap 4 vs 6 | `not_evaluated:map_area_disputed` (M-194) | Spec 58 lane (600.60 map) |
| ML-4 | Half-semi proxy (`semi_half`, 94,532 lots) | which rows exist (S, the renovation class) | fidelity `differs`; `semi_party_wall`; a 50-parcel sample validates it | step lane (O-4 sample) |
| ML-5 | The existing house: footprint (envelope ±20–38 %; width/depth are the shorter/longer envelope sides, not street axes), storeys (none), basement (none) | the renovation rows only | footprint estimated with `existing_confidence`; storeys and basement user input only (O-13, O-14) | app spec (PIN APP-RENO) |
| ML-6 | Irregular-lot depth / frontage (rectangle approximation) | thresholds (45 m garden depth, 12.2 m, 19 m houseplex bands, lot viability, frontage tiers) | `irregular_lot_approximation` within `lot_viability_margin_m`; validated on the M-29 golden lots | step lane; M-29 sample |
| ML-7 | Triangular lots (no rear lot line; ≈ 2,027 residential parcels by the 3-vertex test) | the rear setback | radius rear setback, `triangular_lot` (M-212(2)) | step lane |
| ML-8 | Shoreline hazard limit / stable top-of-bank (TRCA) | FSI on the part below the line | whole-lot FSI, `shoreline_hazard` where the ravine flag holds (M-212(3)) | — (not held; disclosed) |
| ML-9 | Established grade | height datum on sloped lots | `established_grade` (M-212(1)) | — (not held; disclosed) |
| ML-10 | Neighbour front setbacks (Q-B1 advisory estimates) | front averaging (M-205(1)); the through / corner suite proxies (M-198) | tier `estimate`, `front_yard_averaging` | Spec 130 lane (Q-B1) |
| ML-11 | Lane width; the *original* lane centreline | the 6.0 m-lane lot-viability exception; the 2.5 m lane setback | exception taken as not holding (M-169); current centreline, `lane_centreline_original` | — (not held; disclosed) |
| ML-12 | Chapter 900 exceptions not yet authored (≈ 77 % of residential lots carry one) | any target the exception touches | per-target `not_evaluated:exception_not_authored`, `exception_not_authored` | keying lane (M-180) |
| ML-13 | Build year (pre-1953) and lawful status | the R 0.69 rear-addition relief; lawfully-existing reliefs | disclosed (`r_pre1953_fsi_relief`, `lawfully_existing_relief`) | — (site facts, M-158) |

### P5.15 Validation plan and the trace tooling

**The question it answers** (operator 2026-10-18): *"how will I know if everything got incorporated and correctly, first into the bylaw table and then the calculated fields"*. Two generators answer it, and the invariants and oracles below check the calculated fields.

**(A) Field lineage** — `docs/reference/maxbld-field-lineage.json`, validated and rendered by `scripts/analysis/bylaw/generate-maxbld-lineage.mjs --write | --check` (INV-24). It proves, per P5.10 field: which clauses it rests on (each resolved in `bylaw-provisions.json`), which keyed units / Layer 2 targets it reads (each an agreed unit or a vocab target) or what is OWED and by whom, which input columns it reads (each found in its migration), which logic variables (each in P5.9, seeded or OWED), its trust tier and its invariants. It renders the P5.10 table and the invariant table below, so neither is hand-kept.

**(B) Answer reconciliation** — `docs/reference/envelope-answers.json` (the operator's 511 envelope-review answers, a committed snapshot) joined to `docs/reference/envelope-answer-dispositions.json` by `scripts/analysis/bylaw/generate-answer-tracker.mjs --write | --check` (INV-25). Each answer is: **matches** → the keyed unit is agreed (checked); **wrong** → the fixing M-row ids and corrected value; green only when **every** cited M-row is satisfied, by a keyed correction in `adjudications.json` citing it or by a verified **named lock** (a partial fix stays UNFIXED; a reading owed to P5.13 / Layer 2 / Layer 3 is listed `owed`, never a fix id; LC-53, operator 2026-10-19). A named lock: the disposition names a test file, its exact `describe` / `it` titles as written in the source and assert tokens, and the generator finds that test in the tree, finds an `expect(` naming the unit, and finds every M-row the lock `satisfies` in the titles (no free-text green; a lock whose file is not yet in the tree stays UNFIXED with its `pin`); **disclose** → a P5.12 code (checked); **no_application** → excluded; **unsure / null** → OPEN with the question, unless a ruling resolved it. Each answer is also joined to the lineage fields its provision feeds. Outputs: `docs/reports/generated/envelope-answer-tracker.md` (counts first, open items first) and `.json` (for a page). `--check` fails when an answer lacks a disposition, a "wrong" has no fix id, a disclose has no P5.12 code, a referenced M-row / code / unit / clause / field is missing, or the report drifts. OPEN and UNFIXED rows are expected today and shown, never hidden.

**Invariants** (each with where it runs; the step checks are hard 0s in P5.11):

<!-- generated:maxbld-invariants -->
<!-- do not hand-edit: node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --write renders this block from docs/reference/maxbld-field-lineage.json -->

| Id | Invariant | Runs at | Fields it checks |
|---|---|---|---|
| INV-1 | Identity: `total_gfa = main_gfa_with_suite + suite_gfa` (new build); RA `existing + addition_up + addition_back`. | step check + P5.13 test | `suite_gfa_sqm`, `main_gfa_with_suite_sqm`, `total_gfa_sqm`, `addition_up_gfa_sqm`, `addition_back_gfa_sqm` |
| INV-2 | `suite_gfa ≤ main_gfa_with_suite − suite_gfa_strict_margin` (exists as `suite_lt_main`). | step check | `suite_gfa_sqm` |
| INV-3 | `main_gfa_with_suite ≤ main_gfa_without_suite` (a suite never enlarges the main). | step check | `main_gfa_without_suite_sqm`, `main_gfa_with_suite_sqm` |
| INV-4 | `gain_vs_detached_* ≥ 0` whenever both rows are permitted (release only removes limits). | step check | `gain_vs_detached_gfa_sqm`, `gain_vs_detached_footprint_sqm`, `gain_vs_detached_storeys` |
| INV-5 | Houseplex GFA ≥ detached GFA on the same lot when both are permitted. | step check | `main_gfa_sqm`, `main_depth_cap_m`, `main_length_cap_m`, `gain_vs_detached_gfa_sqm` |
| INV-6 | `gain_reasons = none` ⇒ `gain_vs_detached_gfa = 0`. | step check | `gain_vs_detached_gfa_sqm`, `gain_reasons` |
| INV-7 | `fsi_status = applies:v` ⇒ `main_gfa ≤ v × lot_size_sqm` above grade (exists as `fsi_consistent`). | step check | `main_gfa_sqm`, `fsi_status` |
| INV-8 | Footprint ≤ coverage × lot where coverage applies; garden option A total ≤ 45 %, option B ancillary ≤ 20 %; laneway ancillary ≤ 30 % (`coverage_consistent`). | step check | `main_footprint_sqm`, `coverage_status`, `suite_footprint_sqm`, `suite_coverage_option` |
| INV-9 | Every setback used ≥ the Layer 2 minimum for that class; front ≥ the averaged value; ≥ 2.5 m from a lane centreline. | step check | `main_footprint_sqm`, `main_front_setback_m`, `main_side_setbacks_m`, `main_rear_setback_m`, `main_lane_centreline_setback_m`, `suite_rear_setback_m`, `suite_side_setbacks_m` |
| INV-10 | `main_height ≤ height_m`; `main_storeys ≤ height_storeys` unless not_applicable; `suite_height ∈ {4.0, 6.3}`; outside the Coxwell polygon `suite_separation ≥ 7.5 ⇔ suite_height > 4.0`, inside it `≥ 5.0`. | step check + P5.13 test | `main_height_m`, `main_storeys`, `storeys_status`, `height_status`, `suite_height_m`, `suite_separation_m` |
| INV-11 | `dwelling_units ≤ min(u [no 'u' = no cap; lifted to 6 only in R/RT/RM inside 600.60], 4 [S always], 6 iff gis_in and detached, floors)` (M-202); `dwelling_units ≥ 2` on H/S (`units_within_cap`). | step check | `dwelling_units` |
| INV-12 | `Σ unit_breakdown.interior_area ≤ (Σ plates + basement_livable) × (1 − circulation_share)`. | step check | `unit_breakdown` |
| INV-13 | `suite_interior ≤ 0.45 × house_interior` (M-199), or the whole basement of a one-storey house. | step check | `host_interior_sqm`, `suite_interior_sqm` |
| INV-14 | `max_bedrooms = 4 × units` at 2 units, `3 × units` at ≥ 3. | step check | `max_bedrooms` |
| INV-15 | `suite_type = laneway` ⇒ a 150.8.30.20(1) arm passed (rear, side or cumulative ≥ 3.5 m). | step check | `suite_type`, `suite_lane_arm` |
| INV-16 | Every `cited_clauses` entry exists in `bylaw-provisions.json`. | step check + generator check (lineage) | `cited_clauses` |
| INV-17 | Every numeric output traces to an applied Layer 2 unit id or a P5.9 logic variable (the lineage registry names one for every field; G-EXC-LIT / compute-literals scan the code). | generator check (lineage) + gate E #32 | `main_gfa_sqm`, `cited_clauses` |
| INV-18 | No applied unit comes from a non-residential chapter (M-159(1); would have caught M-217) and no excluded-use unit (M-225) enters a suite target. | test (by-law evaluator lane) + step guard on the Layer 2 rows | `fsi_status`, `storeys_status`, `height_status` |
| INV-19 | No `not_evaluated:no_candidate` on a target whose article does not exist in that zone (R coverage, R/RT length, RT/RM-houseplex depth, main walls with the roof-slope condition) — those are `unregulated` / `not_applicable` (M-218, M-220). | test (by-law evaluator lane) + step check | `main_depth_cap_m`, `main_length_cap_m`, `main_wall_limit_m`, `coverage_status`, `main_wall_status` |
| INV-20 | Renovation columns NULL unless the scenario is a renovation; `existing_storeys` NULL on every pipeline row (user input only, O-13). | step check (`renovation_columns_scoped`) | `existing_storeys` |
| INV-21 | Gates: `zoning_holding` ⇒ new-build `not_permitted:holding_zone`; every `gate_flags` value has its disclosure code; front lot line < 3.5 m ⇒ `not_buildable:10.5.30.20(2)`. | step check | `scenario_status`, `gate_flags`, `disclosures` |
| INV-22 | `row_trust_level` equals the P5.14 computation over the row's own `trust_checks` (never asserted). | step check (`trust_level_computed`) | `row_trust_level`, `trust_checks` |
| INV-23 | CoA tier apart: `coa_*` fields never feed `total_gfa_sqm`, `is_headline` or any as-of-right field; `coa_gfa_sqm = main_gfa_sqm × u` or NULL with a `coa_status` reason. | step check | `coa_form`, `coa_factor`, `coa_gfa_sqm`, `coa_increment_sqm`, `coa_status` |
| INV-24 | Every P5.10 field is in the lineage registry with resolvable regulation ids, migration columns and logic variables (seeded or OWED); the P5.10 table is generated from it. | generator check (`generate-maxbld-lineage.mjs --check`) | whole row / generator |
| INV-25 | Every operator envelope answer has a disposition (matches → unit exists; wrong → every fix id cited by a keyed correction, or a verified named lock (LC-53); disclose → P5.12 code; unsure/null → OPEN with its question). | generator check (`generate-answer-tracker.mjs --check`) | whole row / generator |
<!-- /generated:maxbld-invariants -->

**Oracles** (Spec 68 §5a part 7; each a measured round, not a claim):
1. **Oracle C — CoA decisions** (Spec 129 `coa_notice_variances`, `oracle-c.mjs`): a variance requested *above* our maximum on the same metric must not fall inside our as-of-right envelope; a variance *refused* below our maximum flags our maximum as too high. Metric by metric (GFA / FSI, height, storeys, coverage, setbacks).
2. **No-CoA new-build permits — a lower bound:** recent new-build permits issued without a CoA must have permitted GFA, height and storeys ≤ our maximum on that lot. Every exceedance is classified: our maximum too low, a site-specific exception, or a data error.
3. **Expert golden lots (M-29)**, hand-calculated, one per zone × form (R / RD / RS / RT / RM × detached / houseplex / house + suite / garden / laneway), plus: RD HT 10.0 at 9 m frontage (flat vs pitched); an R flat roof (M-200); an RM unmapped houseplex (12.0 m, M-201); an RS semi houseplex (7.5 m per lot, cap 4); a 46 m-deep garden lot (3.15 m rear); a corner lot; a through lot; a lane-side vs lane-rear laneway lot; a triangular lot; frontage 12.0 vs 13.0 m for 10.5.40.71(3); a Coxwell-area lot at 5.0 m (M-224); a front-averaging lot with two neighbours. Pass = every field within the stated tolerance (exact for law numbers; ± one `depth_search_step_m` for searched depths).
4. **Neighbourhood p90 sanity ceiling** (`neighbourhood_build_norms`, migration 199): the realized p90 GFA / storeys should rarely exceed the legal maximum (LC-1); a neighbourhood where it often does flags a missing release or an exception.
5. **Shadow vs enrich_parcels max-build** (O-11, §6.9): every difference classified before any column switches.

**"High trust" gates — the output may be labelled high trust only when all hold** (Spec 131 LC-44):
- G-HT-1 Layer 2 resolution rows exist at the current `table_version` for every P5.3 target (D-1).
- G-HT-2 the evaluator / keying defects M-217..M-223 and M-225 are closed: INV-18 and INV-19 green.
- G-HT-3 the O-7 numbers are keyed: no headline row carries `not_evaluated:target_not_keyed:*`.
- G-HT-4 lineage `--check` green and no `bylaw_derived` field still lists an OWED keyed entry.
- G-HT-5 answer tracker `--check` green with 0 OPEN and 0 UNFIXED answers on provisions that feed a headline field; the R chapter (10.10) reviewed by the operator (0 R verdicts today).
- G-HT-6 oracle round 0 on the golden lots: every lot passes.
- G-HT-7 oracle 2: every no-CoA permit exceedance classified, none unexplained.
- G-HT-8 oracle 1: no refused variance below our maximum left unexplained.
- G-HT-9 `not_evaluated_share` ≤ `not_evaluated_max_pct` on the new-build rows.
Until then the label is **"by-law-derived where the status is `applies`, with disclosed estimates"**, and each row shows its computed `row_trust_level`.

**Build-work list** (what must exist before the proofs can run): the Layer 2 step (D-1); the keying of the O-7 numbers and the M-223 vocab; the evaluator status seat (`not_applicable` / `undecided`, M-183); the suite class (P2-10, M-182); the fixes M-217..M-222, M-225; `lane_abutting_length_m` and the lot-line classification (ML-1); the Coxwell polygon (ML-2). **Proof list:** round 0 on the golden lots; the permit lower bound; oracle C; the built-envelope check against `neighbourhood_build_norms`; the shadow classifier.

### P5.16 Review fold record (2026-10-18)

Reviews folded: the reality check (`.cursor/maxbld-review-rc-2026-10-18.md`: 70 fields, 14 verified, 39 failing, 17 unverifiable) and the verified DeepSeek review (`.cursor/maxbld-review-deepseek-2026-10-18.md`: 14 confirmed, 6 unsure). Disposition of each confirmed finding:

| # | Finding | Disposition | Where |
|---|---|---|---|
| F-1 | Layer 2 cannot produce the inputs today (no resolution table; leaks) | OWED: Layer 2 step; evaluator defects M-217..M-221 | D-1; 69a M-217..M-221; G-HT-1/2 |
| F-2 | R has a flat-roof set-back storey (10.10.40.10(11)/(12)) | **fixed** (M-184(a)/M-190/P5.2 item 5/P5.10 corrected) | 69a M-200; P5.2 item 5; `gfa_flat_sqm` |
| F-3 | Flat-roof PERMITs displace the main-wall LIMITs unconditionally (roof-slope condition unkeyed) | OWED (by-law keying/evaluator lane) | 69a M-218; INV-19 |
| F-4 | Coxwell 5.0 m unreachable under 150.7.60.40(1)(A) | **ruled** (operator: generous reading) | 69a M-224 (amends M-193); O-5; P5.5 |
| F-5 | Semi houseplex capped at 4; 'u' lift R/RT/RM only; no 'u' = no cap | **fixed** | 69a M-202; O-8; P5.4 |
| F-6 | `existing_storeys` reads a neighbourhood norm | **fixed**: user input only, NULL in the pipeline | O-13 amended; P5.6; INV-20 |
| F-7 | Secondary suite 45 % denominator | **ruled** (operator: the whole house; stricter reading disclosed) | 69a M-199; `suite_interior_sqm` |
| F-8 | Houseplex depth/length releases missing | **fixed** (new `gain_reasons`) | 69a M-204; P5.2 item 1 |
| F-9 | Main setbacks not explicit; front averaging; R 0.45 m; RD (5); one-storey extension; laneway (3)(C) | **new fields** + applied (the extension in renovations only, operator 2026-10-18) | 69a M-205, M-206, M-198; `main_*_setback_m` |
| F-10 | No heritage / ravine / holding / Ch.900 gating | **fixed** (gates + codes) | 69a M-213; P5.1 gates; `gate_flags` |
| F-11 | RM unlabelled height 12.0 m for a houseplex | **fixed** | 69a M-201 |
| F-12 | Attic test misapplied (failing attic = free floor area) | **fixed** (`attic_outside_gfa_sqm`) | 69a M-203 |
| F-13 | Wall storeys ignore the first-floor elevation | **new logic variable** `first_floor_elevation_m` | P5.2 item 4; P5.9 |
| F-14 | Lot viability (10.5.30.21(3), 10.5.30.20(2)) | **fixed** (gate) | 69a M-207 |
| F-15 | Suite soft landscaping binds | **ruled: disclosed, not binding** (operator 2026-10-18) | 69a M-208; P5.5 |
| F-16 | Laneway eligibility: three arms; the 20 m flag overstates ≈ 25 % | **fixed** (centreline-derived; derivation OWED) | 69a M-209; ML-1 |
| F-17 | Suite GFA reductions 150.7.60.50(5) / 150.8.60.50(4) | **fixed** | 69a M-210 |
| F-18 | Renovation: up-room caps + FSI residual; R 10.10.40.10(7) applied; R pre-1953 0.69 | **fixed** | 69a M-211; P5.6 |
| F-19 | Established grade; triangular lots; shoreline | **disclosed** (+ triangular detector) | 69a M-212; ML-7..ML-9 |
| F-20 | Parking / bicycle; 150.8.60.21 existing ancillary setbacks | **disclosed** | 69a M-216, M-211(4) |
| F-21 | R FSI 0.6 default; P5.2 item 11's example wrong for R; entrance scope R/RM | **fixed** | 69a M-215 |
| F-22 | RT 10.60.40.1(2)(A) is the 'u' cap | **fixed** (reading recorded) | 69a M-202(4) |
| F-23 | Lane centreline 2.5 m (10.5.40.70(2), 10.5.60.20(4)) | **fixed** | 69a M-205(5); P5.5 |
| F-24 | Missing scenarios: major-street apartment/townhouse; new semi-detached house on a semi lot | **ruled: disclose both, not modelled** | 69a M-214(1)(2); P5.1 |
| F-25 | Missing scenarios: townhouse; apartment R/RM; suite in semi/townhouse; existing 5–6-unit apartment | **disclosed, deferred** (ratified 2026-10-18) | 69a M-214(3) |
| F-26 | Status vocabularies and O-7 targets absent from vocab; no suite / house+suite class | OWED (by-law keying/evaluator lane) | 69a M-223 |
| F-27 | M-171 vs `basement_livable_sqm` | **noted** (design choice) | 69a M-171 dated note |
| F-28 | Garden suite inherits principal setbacks; Coxwell gate everywhere; 10.5.80.1(2)(A) leak | OWED / being fixed | 69a M-219, M-222, M-225 |
| F-29 | `binding_constraint` / `suite_binding` sets incomplete | **fixed** (values added) | P5.2 item 10; P5.5 |
| F-30 | P5.10 fields have no lineage; numbers not traceable | **new tooling** (lineage registry + generator; answer tracker) | P5.15 |
| F-31 | `existing_width/depth` are envelope sides, not street axes | **disclosed** | ML-5 |
| F-32 | Main-entrance clause scope (DeepSeek a26) | **fixed** | 69a M-215(2) |
| F-33 | R 5:3 slope scoped to the detached house (DeepSeek a8, unsure) | **recorded**: scoped per class | P5.2 item 6 |
| F-53 | Dependency check: does any non-renovation field read existing storeys? | **none** (renovation fields only; listed in P5.6) | O-13 |

Unsure DeepSeek items left open for the keying lane: a3 (status for "clause exists, subject does not match" → M-223(2)); b1 front averaging disclosure (now M-205); b6 lot minimums as P5.3 targets (Layer 2 `required_lot_*` targets exist); b12 heritage / ravine (now M-213); c4b existing 5–6-unit apartment (M-214(3)).

## Known Failure Modes (Phase 3 inputs; traced at `bfaad556`, 2026-10-07)

- **KFM-78-1 — two disagreeing CoA GFA figures, neither form-aware.** The two figures are `max_newbuild_coa_gfa_sqm` = `max_buildable_gfa_sqm × (1 + reno_coa_uplift_pct)` (`enrich-parcels.js:929`) and `opt_coa_gfa_sqm` (the §P2.2 storey-p90 / realized-p90 tier).
  - **They disagree on almost every parcel:** opt_coa is lower on 258,181 and higher on 191,491 of 449,673 *[measured]*. The Tracked screen shows the first; the detail cost line prices the second.
  - **Against realized post-CoA single builds, ×1.05 is the better predictor:** median APE 0.204 vs 0.253 on held-out parcels *[measured, coa-analysis §2.4]*.
  - **opt_coa is a 0 / +50 % storey switch.** It equals AOR on 235,359 parcels (52 %) — 43.8 % because pocket p90 = p50 storeys, 8.0 % from the `realized_fsi_floor` — and over-predicts by 17 % where it fires *[measured]*.
  - **Neither prices multiplexes:** ×1.05 is ≈ 25 % under.
  - **Stale comment:** migration 206 says `coa_fsi = realized_fsi_p90`, but the code computes `opt_coa_gfa_sqm / lot` *[read]*.
  - **Phase 3:** one CoA method, CoA(s) = AOR(s) × u_form (M-65); both columns leave the report; `opt_coa_gfa_sqm` stays a DB column for the cost line (KFM-78-8).
- **KFM-78-2 — uncited suite and garage constants; two models.** The priced garden / laneway suite and garage lines use max-build-pass constants classed by-law-claimed-unsourced or heuristic (`GARDEN_SUITE_MAX_GFA_SQM` 60, `GARDEN_SUITE_MIN_LOT_SQM` 270, `LANEWAY_SUITE_MAX_GFA_SQM` 120, `GARAGE_MAX_GFA_SQM` 60, `ACCESSORY_MAX_COVERAGE_PCT` 0.30, `CAR_FOOTPRINT_SQM` 18.5, …; `enrich-parcels.js:631-654`). The by-law-cited `optimal-config.js` `BYLAW` set drives only `opt_suite_*`, which the report does not show *[read]*. Phase 3: both models are replaced by formula rows over Layer 2.
- **KFM-78-3 — the front setback reads a banned reference.** `buildMaxBuildSql` uses `COALESCE(bylaw_standard_setback_m, zone default)` as the front setback (`enrich-parcels.js:502`); STAND_SET-as-setback is in `vocab.banned_code_refs` (Spec 67 KFM-14), to be removed for residential parcels by E1 (Spec 68 §11). Side, rear and flankage come from 65 zone-default proxies, coverage from 13 statistical medians *[read]*. This is the largest Layer 2 replacement surface.
- **KFM-78-4 — `parcels.realized_fsi_p90` has no producer.** Its only writer is `compute_parcel_cost_estimates` copying the column's own prior value back (`parcel-cost.js:377` ← `compute-parcel-cost-estimates.js:150`); 0 parcels have it non-NULL *[measured]*. It is a dead field in the consumer contract (retire under M-69). The Phase 3 CoA method reads no `realized_fsi_p90` at all (M-65).
- **KFM-78-5 — the garden-suite `BYLAW` constants predate 849-2025.** `optimal-config.js` cites "150.7.60.70(1)(C)" for a 40 % rear-yard / 60 m² footprint; the adopted page has no (1)(C) and no "40 percent" *[measured]*. It has (A) 45 % shared or (B) LC + 20 % all-ancillary (150.7.60.70(1)), GFA 120 / 60 m² (150.7.60.50(4)), height 4.0 / 6.3 m (150.7.60.40(1)) and separation 4.0 / 7.5 m (150.7.60.30(1)); the code has 4.0 / 6.0 m and 5.0 / 7.5 m *[read, scan §8 F1]*. §P2.1 repeats the old values (§5.2 S9). Held until Phase 3 (Spec 69 M-25 F-1).
- **KFM-78-6 — as-of-right runs above the legal FSI cap.** `bylaw_max_fsi` is NULL on 100 % of RS/RT/RM/R and 99.4 % of RD parcels *[measured]*. As a result:
  - the as-of-right envelope is ≈ 1.2× the legal cap (permitted GFA in the 2017 decision notices = 0.83× our AOR, n 36 *[measured]*);
  - today's fitted CoA factors k absorb that gap.
  - E2 (label FSI, Spec 69 M-25 / Spec 68 §11) fixes AOR. **the CoA uplifts u must be re-fitted after E2** (M-65 (3)), or CoA will be mis-stated.
- **KFM-78-7 — the fitted CoA factors would double-count form size.** k_multiplex ≈ 1.42 is realized multiplex GFA ÷ today's detached-shaped `opt_aor`; a CoA itself adds 1.014 [0.93, 1.09] to a multiplex *[measured, coa-analysis §3]*. A Phase 3 houseplex AOR(s) (FSI-exempt, max(HT, 10 m), no storey cap) already holds most of that size, so AOR(s) × 1.42 counts it twice, and the headline (largest permitted `total_gfa_sqm`) would pick it on most lots (red-team T1, CRITICAL *[inferred]*). Phase 3 (operator ruling 2026-10-07): the factor is the pure CoA uplift u fitted against AOR(s) of the same form (multiplex 0.997 → u = 1.00 *[measured, second look]*), with a `fit_basis` FAIL (M-65 (1)).
- **KFM-78-8 — `opt_coa_gfa_sqm` has live cost and lead consumers.** `parcel-cost.js:100` (the `coa_build` area) and `:374` (`coa_fsi`), `archetype-cost-map.js:36` and `cost-model.ts:86/554` (Spec 83 leads via §4D) read it, and `enrich-permits.js:738` reads `max_newbuild_coa_gfa_sqm` *[read, matrix H6]*. Phase 3 (operator ruling 2026-10-07): the columns leave the report only; `opt_coa_gfa_sqm` keeps feeding the CoA cost line until the cost epic migrates it, and the cost line states the area it priced (§6.6 rule 6). Until then the shown `coa_gfa_sqm` and the priced CoA area can differ.
- **KFM-78-9 — `abuts_laneway` is a 20 m proximity flag, not the by-law's 3.5 m lane frontage** (added 2026-10-07, Phase 3 trial Stage 1).
  - **Current code:** `enrich-centreline.js:118-123` computes `bool_or(seg_is_lane)` over every centreline segment within 20 m (`enrich_centreline_proximity_m`) of the parcel. It has no length test and no rear / side lot-line test (Spec 65:260 records the limit).
  - **The law:** 150.8.30.20(1) needs a rear or side lot line abutting a lane for ≥ 3.5 m, or 3.5 m cumulative along the side and rear lot lines.
  - **Measured:** 60,624 lots flagged, of which 12,194 (20 %) fail the 3.5 m test (RD 37 %). In the R zone, 50,643 are flagged and 41,313 pass. In a sample of 20 flagged lots, 3 are false (the lane is 13–15 m away, with 0 m shared).
  - **Phase 3 impact** *[measured, strict run]*: laneway-permitted rows −87 K; envelope p50 unchanged.
  - **Phase 3 (operator, 2026-10-07):** the laneway scenario uses the **strict ≥ 3.5 m test**, never the 20 m flag. The `abuts_laneway` WF3 is **moved into Phase 3**: derive `lane_abutting_length_m` (lot boundary within a lane tolerance, a logic variable, 5 m, of a Laneway segment), and read ≥ 3.5 m from the 150.8.30.20(1) law row. The red test is the 3 sample false positives. Until it lands, the laneway scenario is `not_evaluated:missing_input:lane_abutting_length_m`, never permitted on the 20 m flag.

## 2. Operating Boundaries

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `enrich_parcels` — ENRICHER · converted · owner specs: 65 · 67 · 78
  - `scripts/enrich-parcels.js`
  - `scripts/enrich-parcels.descriptor.json`
  - `scripts/enrich-parcels.notes.json`
  - `scripts/lib/compute/enrich-parcels.js`
  - `src/tests/steps/enrich_parcels/pending-scope-when.logic.test.ts`
  - `src/tests/steps/enrich_parcels/sixplex.logic.test.ts`
  - `src/tests/steps/enrich_parcels/sql-verbatim.logic.test.ts`
  - `src/tests/steps/enrich_parcels/violations.test.ts`
  - data (descriptor): `building_footprints` reads (migrations/023_building_footprints.sql); `bylaw_map_areas` reads (migrations/254_bylaw_map_areas_sixplex.sql); `coa_applications` reads (migrations/009_coa_applications.sql); `enrich_parcels_pass3_scope` writes (migrations/240_phase_b_massing_watermark_and_pass3_scope.sql); `neighbourhood_build_norms` reads (migrations/199_neighbourhood_build_norms.sql); `neighbourhood_storey_norms` reads (migrations/195_neighbourhood_storey_norms.sql); `neighbourhoods` reads (migrations/013_neighbourhoods.sql); `parcel_buildings` reads (migrations/024_parcel_buildings.sql); `parcels` reads+writes (migrations/011_parcels.sql); `permits` reads (migrations/001_permits.sql); `zoning_building_setback_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_bylaw_areas` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_height_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_lot_coverage_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_parking_zone_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_policy_area_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_policy_road_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_priority_retail_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_queenstw_eat_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_rooming_house_overlay` reads (migrations/164_zoning_bylaw_tables.sql)
  - upstream: enrich_centreline · enrich_heritage · enrich_ravines · link_massing · load_zoning · massing · neighbourhoods · parcels
  - downstream: assert_global_coverage · assert_parcel_sanity · compute_parcel_cost_estimates · link_massing · link_parcel_abutments
  - consumers: scripts/run-chain.js (records_meta deferred)
<!-- /generated:target-files -->
- `scripts/load-permits.js` (occupancy ingest), `scripts/lib/build-norms.js` (NEW, pure),
  `scripts/compute-build-norms.js` (NEW, Mutator), `scripts/manifest.json` (chain wiring),
  `migrations/198_permits_occupancy_columns.sql`, `migrations/199_neighbourhood_build_norms.sql`,
  `docs/specs/_contracts.json` (`build_norms` group), `docs/runbook/permit_occupancy_first_deploy.md`.
- `scripts/enrich-permits.js` — §4D wires `OPT_COMP_PROP_COLS`, `assertOptConfigColumns`, and the per-run propagation audit rows into this script (otherwise Spec 66)
- Tests this spec governs beyond its generated step suites (Amendment 6 of the generated-Target-Files WF2: the block's step tests switched off the system map's whole-spec test fallback, so these are now named here): `src/tests/optimal-config.logic.test.ts`
- **§Phase-5 trace tooling (P5.15; created 2026-10-18):** `scripts/analysis/bylaw/generate-maxbld-lineage.mjs`, `scripts/analysis/bylaw/generate-answer-tracker.mjs`, their shared resolver `scripts/analysis/bylaw/maxbld-trace-lib.mjs`; data `docs/reference/maxbld-field-lineage.json`, `docs/reference/envelope-answers.json`, `docs/reference/envelope-answer-dispositions.json`; generated `docs/reports/generated/envelope-answer-tracker.md` / `.json`; lock `src/tests/bylaw-maxbld-trace.infra.test.ts` (runs both `--check`s).
- **PLANNED — §Phase-5 (2026-10-18; not created; paths written without their root, as below):** the step `compute-maxbld-scenarios.js` with its descriptor and notes, compute module `lib/compute/compute-maxbld-scenarios.js`, the shared pure module `features/leads/lib/renovation-shared.js`, two migrations (`parcel_maxbld_scenarios`; the P5.9 logic-variable seed) and the tests of P5.13. The census owner row (owner_specs `[78]`) and the generated target-files entry are written at commit ①.
- **PLANNED — McBylaw Phase 3 (§6; ratified, not created; paths written without their root so the system map does not list files that do not exist):** the formula registry and scenario catalogue as Spec 68 seed data (Spec 68 owns the seed directory, §10 layout); the report-field generator (proposed `analysis/report-fields.mjs`) and its outputs `docs/reference/maxbld-report-fields.md` / `.json`; one converted step (proposed slug `compute_maxbld_scenarios`: step file, descriptor, compute module and its step test directory); the drift lock `report-fields.infra.test.ts` and the grammar fixtures `bylaw-p3-dsl.logic.test.ts`. Paths are fixed by the Phase 3 plan after the trial (Spec 69 M-70).

### Out-of-Scope Files
- `scripts/enrich-parcels.js` and the parcel new-fields / degrade-retire pass — **Phase 3**.
- Any optimal-config engine or comps kNN — **Phases 2–3**.
- `cost_estimates` / `trade_forecasts` reconciliation — **Phase 4**.
- *(2026-09-29)* The two bullets above that name Phases 2–3 are historical — those phases are built; see §5.2 S8.
- *(Phase 3, ratified 2026-10-07)* Builder cost — `scripts/lib/parcel-cost.js`, `scripts/lib/compute/compute-parcel-cost-estimates.js`, the rate tables — owned by Spec 88 and untouched (Spec 69 M-67). The by-law table and evaluator (`scripts/analysis/bylaw/`, `scripts/generate-bylaw-provisions.mjs`) are Spec 68's; Phase 3 reads them, never forks them.

### Cross-Spec Dependencies
- **Relies on:** Spec 65 §4 (max-build envelope: `max_buildable_gfa_sqm`, `lot_size_sqm`), Spec 65 §8
  (`neighbourhood_storey_norms`), Spec 47 (script protocol), Spec 48 §3.6/§3.7 (cascade + first-deploy
  runbook), Spec 30 (Mutator archetype), Spec 41/55 (lifecycle/CoA linkage of `coa_applications`).
- **Consumed by:** Phases 2–3 (optimal-config engine + parcel calibration), Phase 4 (forecast/cost).
- `load-parcels.js` — upstream loader for the `parcels` rows this spec's lot-driven outputs are computed on
- `compute-storey-norms.js` — `storeys_p50/p90` joined from its `neighbourhood_storey_norms` output (Spec 65 §8); `compute_build_norms` runs after it in-chain
- `enrich-centreline.js` (`enrich_centreline`, Specs 62/65) — produces `abuts_laneway` (KFM-78-9); the Phase 3 strict lane-frontage WF3 changes it under its owner spec
- **O-11 consumer gate (operator 2026-10-18):** these steps read the enrich_parcels max-build columns and are owned by their own specs — `enrich-permits.js` (`enrich_permits` / `enrich_coa_zoning`, Spec 66), `compute-coa-cost-estimates.js` (`compute_coa_cost_estimates`, Specs 42/88), `compute-cost-estimates.js` (`compute_cost_estimates`, Specs 41/88), `assert-global-coverage.js` (`assert_global_coverage`). None reads `parcel_maxbld_scenarios`; each is migrated or confirmed before any column switches (§Phase-5 O-11)
- **Spec 67** (`67_maxbuild_bylaw_derivation.md`) — MaxBuild derivation methodology, field universe and scenarios for the envelope this spec consumes (§5)
- **Spec 131** (`131_lot_configuration_policy.md`) — the Lot Configuration Policy: every rule this spec applies, as register rows LC-n (2026-10-18). **§Phase-5** relies on Specs 68 (§5a McBylaws Airtight, §11 Layer 2), 69/69a (M-154, M-158, M-169, M-172, M-176..M-195), 65 (§4, §5, §9), 130 (`parcel_abutments`), 58 (`bylaw_map_areas`), 83 §7.2 (the shared-module precedent), 114 (RLS), 122/124 (V3) and the app spec owed under PIN APP-RENO.
- **Phase 3 (§6, ratified 2026-10-07):** relies on Specs 68/69 (Layer 1 table, evaluator, Layer 2 resolution; rulings M-61..M-72), Specs 122/124 (the converted step), Spec 126 (report surfaces), planned Spec 129 `load_coa_notices` (oracle C); consumed by Spec 88 (reads the area columns only, incl. `opt_coa_gfa_sqm`, KFM-78-8), Spec 83 (permit-lead cost model: `archetype-cost-map.js`, `cost-model.ts` via §4D) and Spec 66 (`enrich-permits.js` CoA propagation) and the MaxBLD report surfaces.

---

## 3. Cross-references
- **Spec 65** — enrich-parcels; max-build envelope + storey norms this calibrates against; Phase 3 degrades several of its existing-structure fields.
- **Spec 67** — MaxBuild derivation from By-law 569-2013 (as-built vs planned, claim ledger, scenarios); see §5.
- **Spec 47** §R1–R12 — `compute-build-norms.js` skeleton (lock 78, `getDbTimestamp`, `withTransaction`, `emitSummary/emitMeta`).
- **Spec 48** §3.6 row-derived verdict cascade + §3.7 first-deploy runbook.
- **Spec 30** — Mutator archetype (recomputed summary table).
- Design reports listed in the header are authoritative for Phases 2–4.

---

## Appendix R — MaxBLD report-field inventory (generated; PLANNED)

**The generated block lands with the generator** (Spec 69 M-69): `scripts/analysis/report-fields.mjs --write | --check` (proposed name) renders `docs/reference/maxbld-report-fields.{md,json}` and this appendix, one row per user-visible calculated field: surface, render site, label, format, column, producer step, formula chain (file:line nodes), constants with their class, variant (aor · coa · heritage · ravine · fallback), Layer 2 targets, evidence class. Stages reuse existing tools: surface descriptors and the TypeScript compiler API (display), the lineage snapshot and consumer registry (producer), the sql-witness resolver (SQL chain), code-link `classifyConstants` (constants), `vocab.json` `dsl_target` (targets). Drift lock: `src/tests/report-fields.infra.test.ts` runs `--check`. Design: `.cursor/mcbylaw/phase3-prework/generator-design.md`.

**Hand first edition (2026-10-07, `field-inventory.md`; replaced by the generator, never hand-maintained):**

| # | Field (column) | Variant | Producer | Layer 2 targets | Phase 3 kind (M-69) |
|---|---|---|---|---|---|
| 1 | `max_buildable_gfa_sqm` | aor envelope | `enrich_parcels` max-build pass | fsi, lot_coverage_pct, gfa_m2, height_m, height_storeys, front/rear/side/side_street setbacks, building_depth_m, building_length_m, required_lot_area_m2, required_lot_frontage_m | formula |
| 1a | `max_newbuild_coa_gfa_sqm` | coa (×1.05) | `enrich_parcels` pass 3 | none (empirical) | `report_only_retired` → shown as `coa_gfa_sqm` (M-65; the better-validated of the two, KFM-78-1); the column stays while `enrich-permits.js:738` reads it |
| 2 | `opt_aor_gfa_sqm` | aor tier | `enrich_parcels` pass 5 (optimal-config) | as row 1 + dwelling_units_max | formula |
| 2a | `opt_coa_gfa_sqm` | coa tier | pass 5 | none (empirical) | `report_only_retired` → `coa_gfa_sqm` (M-65); **stays a DB column** priced by the Spec 88 CoA cost line (KFM-78-8, operator ruling 2026-10-07) |
| 3 | `max_build_stories` | aor | max-build pass | height_storeys, height_m, main_wall_height_m | formula |
| 3a | `max_build_stories_aggressive` + `market_exceeds_bylaw` | coa / market (admin only, not a report field today) | max-build pass (`enrich-parcels.js:678-679`) | none (empirical: storey norms p90) | `empirical_ref` (admin); not a Phase 3 report field |
| 3b | `opt_aor_storeys` | aor | pass 5 | height_storeys | formula (→ `main_storeys`) |
| 3c | `opt_coa_storeys` | coa | pass 5 | none | `report_only_retired` (payload-only; no CoA storeys under any M-65 method; DB readers remain) |
| 4 | `max_build_fsi` | aor envelope | `compute_parcel_cost_estimates` | fsi (parity) | formula |
| 4a | `coa_fsi` | coa | `compute_parcel_cost_estimates` (from `opt_coa_gfa_sqm`) | none (empirical) | the Spec 88 column is `report_only_retired`; the report shows a Layer 3 formula `coa_gfa_sqm ÷ lot_area_m2` |
| 5 | `envelope_constrained` + `envelope_constraint_reason` | — | max-build pass | required_lot_area_m2, required_lot_frontage_m | formula (its output is a scenario status, M-64) |
| 6 | `lot_size_sqm` | — | `load_parcels` | — | input |
| C1–C13 | the 13 cost lines | aor / coa | `compute_parcel_cost_estimates` | via their area columns | cost_ref (Spec 88, M-67; each names the area column it prices) |
| C5–C7 areas | `max_garden_suite_gfa_sqm`, `max_laneway_suite_gfa_sqm`, `max_garage_gfa_sqm` | aor | max-build pass | suite / ancillary envelope, landscaping, parking_access | formula |
| N1–N5 | `nearby_builds_summary`, `comp_count`, `comp_fsi_p50`, `comp_dominant_build`, comp examples | — | pass 4 / norms | none (empirical) | empirical_ref |
| N7 | `nearby_coa_builds_gfa_sqm` (new) | both tiers | `compute_maxbld_scenarios` (proposed; kNN same-form CoA builds) | none (empirical) | empirical_ref, `introduced_by: M-65` — observed, never a multiplier |
| N6 | Tracked "New Nearby CoA Ruling" | — | nothing computes it | — | empirical_ref → planned Spec 129 `load_coa_notices`; `not_evaluated:no_producer` until it lands |
| — | `realized_fsi_p90` (payload only) | — | self-loop | — | retire: `dead_field` (KFM-78-4) |
| P1 | payload-only (whitelisted, not rendered): `max_buildable_footprint_sqm` | aor | max-build pass | as row 1 | formula (→ `main_footprint_sqm`) |
| P2 | `cur_floor_gfa_sqm`, `lot_size_sqft` | — | `enrich_parcels` / `load_parcels` | — | input (`lot_size_sqft` never binds a formula input, §6.3) |
| P3 | the 12 cost scalars, `neighbourhood_cost_premium` | — | `compute_parcel_cost_estimates` | — | cost_ref (Spec 88) |
| P4 | `comp_build_ratio_p50` | — | pass 4 / norms | — | empirical_ref |
| new | every §6.1 field not above (`main_*`, `suite_*`, `garage_*`, `total_gfa_sqm`, `coa_gfa_sqm`, `coa_increment_sqm`, …) | per scenario × tier | `compute_maxbld_scenarios` (proposed) | per formula row | formula, `introduced_by: M-61` (M-69 denominator) |

Payload-only source: `consumer-lookup.ts:33-41` vs `[parcelId].tsx` *[read]*.
