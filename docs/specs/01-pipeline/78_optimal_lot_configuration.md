# Spec 78 — Optimal Lot Configuration

**Status:** Built — Phases 0-3 + 4A + 4D shipped/PUSHED; only forecast/cost reconciliation moved to Spec 88.
**Phase 3 amendment (McBylaw):** §6 + Known Failure Modes + Appendix R — RATIFIED 2026-10-07 (operator; Spec 69 M-61..M-72; folded with the matrix + red-team, §6.12). Trial quantities stay to be measured (M-70); nothing is built. **Pre-lock fixes 2026-10-07** from the Phase 3 trial: §6.13 (Spec 69 dated notes on M-63, M-64, M-70, M-72).
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
| 2 | Optimal-config engine — per-parcel optimal new-build + accessory + greenspace/solar fit. | **Built.** |
| 3 | Parcel new-fields pass + degrade/retire unreliable existing-structure fields + nearby-builds & comps summary. | **Built.** |
| 4 | Chain validation + forecast/cost reconciliation. | **4A + 4D built (shipped/PUSHED);** forecast/cost reconciliation moved to Spec 88. |

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

**The step** (one, converted under Specs 122/124; proposed slug `compute_maxbld_scenarios`): reads the Layer 2 resolution rows, lot inputs, norms and logic variables; runs the registry through `evaluate.mjs`; writes the headline, the counters and the shadow columns. `records_meta` counters: `scenarios_computed`, `scenarios_permitted`, `scenarios_not_permitted` (by clause), `scenarios_collapsed` (by rule), `scenarios_not_evaluated` (by closed reason), and the shadow-diff counts per class (M-71). Chain placement after `resolve_bylaws` and before `compute_parcel_cost_estimates` *[inferred; plan item]*. Population: declared as a query (Spec 124 R-AY); R-AS is N/A with a recorded reason (no legacy step); the Spec 124 row is owed at the P1-C9 register move (Q9).

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
  - `src/tests/steps/enrich_parcels/sql-verbatim.logic.test.ts`
  - `src/tests/steps/enrich_parcels/violations.test.ts`
  - data (descriptor): `building_footprints` reads (migrations/023_building_footprints.sql); `coa_applications` reads (migrations/009_coa_applications.sql); `enrich_parcels_pass3_scope` writes (migrations/240_phase_b_massing_watermark_and_pass3_scope.sql); `neighbourhood_build_norms` reads (migrations/199_neighbourhood_build_norms.sql); `neighbourhood_storey_norms` reads (migrations/195_neighbourhood_storey_norms.sql); `neighbourhoods` reads (migrations/013_neighbourhoods.sql); `parcel_buildings` reads (migrations/024_parcel_buildings.sql); `parcels` reads+writes (migrations/011_parcels.sql); `permits` reads (migrations/001_permits.sql); `zoning_bylaw_areas` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_height_overlay` reads (migrations/164_zoning_bylaw_tables.sql); `zoning_lot_coverage_overlay` reads (migrations/164_zoning_bylaw_tables.sql)
  - upstream: enrich_centreline · enrich_heritage · enrich_ravines · link_massing · massing · neighbourhoods · parcels
  - downstream: assert_global_coverage · assert_parcel_sanity · compute_parcel_cost_estimates · link_massing
  - consumers: scripts/run-chain.js (records_meta deferred)
<!-- /generated:target-files -->
- `scripts/load-permits.js` (occupancy ingest), `scripts/lib/build-norms.js` (NEW, pure),
  `scripts/compute-build-norms.js` (NEW, Mutator), `scripts/manifest.json` (chain wiring),
  `migrations/198_permits_occupancy_columns.sql`, `migrations/199_neighbourhood_build_norms.sql`,
  `docs/specs/_contracts.json` (`build_norms` group), `docs/runbook/permit_occupancy_first_deploy.md`.
- `scripts/enrich-permits.js` — §4D wires `OPT_COMP_PROP_COLS`, `assertOptConfigColumns`, and the per-run propagation audit rows into this script (otherwise Spec 66)
- Tests this spec governs beyond its generated step suites (Amendment 6 of the generated-Target-Files WF2: the block's step tests switched off the system map's whole-spec test fallback, so these are now named here): `src/tests/optimal-config.logic.test.ts`
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
- **Spec 67** (`67_maxbuild_bylaw_derivation.md`) — MaxBuild derivation methodology, field universe and scenarios for the envelope this spec consumes (§5)
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
