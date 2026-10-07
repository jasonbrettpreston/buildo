# Spec 78 — Optimal Lot Configuration

**Status:** Built — Phases 0-3 + 4A + 4D shipped/PUSHED; only forecast/cost reconciliation moved to Spec 88.
**Phase 3 amendment (McBylaw):** §6 + Known Failure Modes + Appendix R — PROPOSED 2026-10-07 (Spec 69 M-61..M-71), not ratified.
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

## §6 — McBylaw Phase 3: the by-law-driven report (PROPOSED 2026-10-07)

> **PROPOSED.** The operator approved the approach on 2026-10-07. The rulings are Spec 69 M-61..M-71 (PROPOSED); the standard is Spec 68 §11.1. Ratification follows a grounded matrix and a red-team. Nothing here changes Phases 1–4D behaviour until the Phase 3 plan is authorized and its shadow columns pass (M-71). Inputs: `.cursor/mcbylaw/phase3-prework/` (`field-inventory.md`, `generator-design.md`, `scenario-scan.md`, `scenario-clauses.json`, `coa-scenario-counts.json`). Evidence tags: *[measured]* a query or script ran · *[read]* code or clause text · *[inferred]* not executed.

### 6.1 What the report delivers

For each residential parcel in scope: **report fields × permitted scenarios × {as-of-right, CoA}**. There is no user choice (M-63). Per scenario × tier, ≈ 20 fields (scenario scan §5.1):

| Group | Fields |
|---|---|
| Identity | `scenario_id` (P / A / K code), `principal_type`, `dwelling_units` |
| Principal | `main_footprint_sqm`, `main_storeys`, `main_height_m`, `main_gfa_sqm`, `main_binding` ∈ {fsi, coverage, height, depth, length, setback} |
| Law applied | `coverage_pct_applied` + clause; `fsi_applied`, or `not_applicable` + clause |
| Suite | `suite_type`, `suite_gfa_sqm`, `suite_height_m`, `suite_binding` |
| Parking | `garage_type`, `garage_sqm`, `garage_gfa_deduction_sqm` |
| Totals | `total_gfa_sqm`, `avg_unit_gfa_sqm`, `max_bedrooms` |
| CoA tier only | `coa_gfa_sqm`, `coa_uplift_sqm`, `coa_form` (single · multiplex), `coa_factor` (the k logic-variable id and value) (§6.4) |
| Every value | status (M-64) and lineage: formula id, scenario id, tier, the Layer 2 rows read, `table_version`, `evaluator_version` |

**Headline per parcel** (persisted, §6.8): the permitted scenario with the largest `total_gfa_sqm` per tier, its id, and the counters. The headline takes over the display role of `max_buildable_gfa_sqm` / `opt_aor_*` / `opt_coa_*` only after its shadow passes. Which live columns are retired, kept as headline aliases or superseded is a Phase 3 plan item, listed from Appendix R.

### 6.2 The scenario catalogue (Spec 69 M-63)

Closed data, pinned. Each axis value cites the clause that defines or permits it (scenario scan §1.1, §2.1 *[read]*).

| Axis | Values | Permission source |
|---|---|---|
| **P** principal form | detached · detached + secondary suite · detached houseplex 2–4 · detached houseplex 5–6 (inside 600.60 only) · semi · semi + suite · semi houseplex · townhouse · townhouse + suite | zone permitted-types lists 10.x.20.40; `u` label 10.x.40.1; houseplex definitions 800.50(181)/(746), 600.60.20; one suite per unit 150.10.20.1(2); provincial floor M-55 |
| **A** ancillary suite | none · garden · laneway | 150.7.20.1(2) = 150.8.20.1(2) (not both); laneway needs a lane 800.50(402) |
| **K** parking | none · integral garage · detached garage (M-66) | parking never required: 200.5.10.1 R3/R5 |
| **T** tier | as-of-right · CoA (M-65) | — |

**Collapse rules** — declared equalities with their evidence, each a metamorphic fixture run both ways:

| # | Equality | Holds when | Evidence |
|---|---|---|---|
| C1 | houseplex 2 = 3 = 4 (one envelope; units, average unit size, bedrooms are fields) | always | no envelope clause names a count *[measured, scan §2.2]* |
| C2 | houseplex 5 = 6 | always (600.60 only) | 600.60.30(3), 600.60.40(1)(B), (2)(A) |
| C3 | detached = detached + suite (envelope) | no `d` applies and LC ≥ 45 % or unmapped | 10.x.40.40(1)(C), 10.x.30.40(1)(D) |
| C4 | pad = none | always | no size rule reads a pad (10.5.80.10 is location only) |
| C5 | integral = none | FSI does not bind or is disapplied | 10.5.40.40(3)(C)/(D) is a deduction inside FSI |
| C6 | detached garage = none | neither coverage nor an ancillary cap binds | 10.5.60.70(1), 10.5.60.50(2) |
| C7 | semi / townhouse scenarios on a single detached lot → `not_permitted` | lot is not a semi half / per-unit frontage or `au` not met | 800.50(746)(B); 10.x.30.10(1)(B); `au` (open: Q2) |

House + suite ≠ houseplex (height max(HT, 10.0), no storey cap and 19 m depth apply to the houseplex only) — **separate envelopes** *[read, scan §2.2 item 3]*.

**Grid size** *[inferred]*: typical RD detached lot 14 envelopes × 2 tiers = 28 computations; worst case (R zone, lane, 600.60, FSI binding) 81 × 2 = 162. Suite size is computed **per principal scenario** (GFA < principal GFA; the 150.7.60.70(1) (A)-or-(B) coverage regimes; the rear soft-landscaping area; height vs separation) *[read, scan §3]*.

### 6.3 Formula registry and the one step (M-61, M-62, M-68, M-69)

**Registry row** (data, double-keyed; ⧉ = keyed): `formula_id` · `field` · `tier` · `kind` ∈ {`formula`, `empirical_ref`, `cost_ref`, `input`} (M-69) · ⧉ `applies_to_scenarios` · ⧉ `expression` (Spec 68 §7.4 DSL) · ⧉ `inputs[]` — each a Layer 2 `dsl_target` × structure, or a declared geometry input from a closed list (`lot_size_sqm`, `frontage_m`, `depth_m`, existing primary footprint, `storeys_p50`; the CoA factor k is a logic variable, not an input) · `literals[]` — each a Layer 1 clause id or a `logic_variables.json` id · ⧉ `status_map` (which input status yields `not_permitted` / `not_evaluated`) · `vectors[]` (Spec 67 worked examples × scenario, each expected value cited).

**Handlers:** one per Spec 68 §7.1 archetype that reaches a report field (≤ 10; keys equal `vocab.archetype`, both directions, Spec 68 §8 rule 2) — e.g. LIMIT caps an input, PERMIT / PROHIBIT set a scenario's status, DISAPPLY yields `not_applicable`. No handler branches on a zone, a scenario or a regulation id.

**The step** (one, converted under Specs 122/124; proposed slug `compute_maxbld_scenarios`): reads the Layer 2 resolution rows, lot inputs and norms; runs the registry through `evaluate.mjs`; writes the headline, the counters and the shadow columns. `records_meta` counters: `scenarios_computed`, `scenarios_permitted`, `scenarios_not_permitted` (by clause), `scenarios_collapsed` (by rule), `scenarios_not_evaluated` (by closed reason). Chain placement after `resolve_bylaws` and before `compute_parcel_cost_estimates` *[inferred; plan item]*.

### 6.4 The CoA axis (Spec 69 M-65)

**One method** (operator ruling 2026-10-07; grounded in `.cursor/mcbylaw/phase3-prework/coa-analysis.md`): **CoA(s) = AOR(s) × k_form(s)**.
- **Form.** k is chosen by the scenario's building form (the analysis's option C), not by the zone. The P → form map is catalogue data: detached and semi → `single`; houseplex 2–4 and 5–6 → `multiplex`.
- **Fitting.** Each k is citywide: the median of realized post-CoA new-build GFA ÷ model as-of-right GFA for that form.
- **Storage.** The k values are admin logic variables (M-68). Each carries its fit n, its window and its real/predicted on the held-out half.
- **No local cohort.** No per-neighbourhood cohort, no storey-p90 switch and no `realized_fsi_p90` cap. The neighbourhood still enters through AOR(s).

| Form | k today | Fit basis | Held-out real / predicted · median APE |
|---|---|---|---|
| single | ≈ 1.11 | 1,579 post-CoA single new builds | **1.003** · 0.210 (n 811) |
| multiplex | ≈ 1.42 | 279 post-CoA multiplex new builds (121 since 2025-06-26) | **1.013** · 0.286 (n 147) |

All figures *[measured, coa-analysis §2.4]*. No figure gets below a median APE of ≈ 0.20 per lot: that floor is the spread of what owners choose to build.

**Re-fit.**
- k is re-fitted from permits on a schedule, writing an audit row (n, window, real/predicted).
- **A re-fit is mandatory after the E2 label-FSI fix.** Today `bylaw_max_fsi` is NULL on ≈ 99 % of residential parcels *[measured]*, so AOR runs ≈ 1.2× the legal cap (permitted GFA in the 2017 notices = 0.83× our AOR, n 36 *[measured]*), and k absorbs that gap.
- Once E2 lowers AOR to the law, an un-refitted k under-states CoA. A k older than the AOR basis it was fitted against FAILS the step's check.
- A form with no fitted k (e.g. townhouse) is `not_evaluated:coa_factor_unfitted`, never borrowed from another form.

**Both live CoA columns retire from the report**, each as `superseded_by:coa_gfa_sqm` (M-69):
- **`max_newbuild_coa_gfa_sqm`** (×1.05, Spec 65 SC-1) was the better-validated of the two on single dwellings: median APE 0.204 vs 0.253; 48.7 % vs 43.0 % within ±20 % *[measured]*. It retires because it cannot price multiplexes (≈ 25 % under) and has no form semantics, not because it is wrong.
- **`opt_coa_gfa_sqm`** is in effect a 0 / +50 % storey switch. It equals AOR on 52 % of parcels and over-predicts by 17 % where it fires *[measured]*.

**Why no neighbourhood cohort or fallback.**
- Only 10 neighbourhoods have ≥ 5 decided multiplex CoAs since 2025-06-26, and `neighbourhood_build_norms` has 0 of 25 multiplex rows above the low-sample bar *[measured]*.
- A same-neighbourhood detached fallback would bias multiplex CoA GFA ≈ 24 % low, because multiplex builds realize 1.32× the FSI of single CoA builds on matched lots *[measured ratio; bias inferred]*.
- A CoA adds ≈ 0 % floor area to a multiplex (1.014 [0.93, 1.09]) but +12.7 % to a single dwelling. Approval rates no longer differ by form after 2025-06-26 (0.836 vs 0.830) *[measured]*.

CoA applications remain validation data (oracle C, M-71), never inputs.

### 6.5 Parking (Spec 69 M-66)

| K | Rules applied (change size) | Not evaluated in Layer 3 (compliance only, disclosed) |
|---|---|---|
| none (pad folds in, C4) | — | front soft landscaping 75 % without a driveway (10.5.50.10(1)(D)) |
| integral garage | 10.5.40.40(3)(C)/(D): 1 space per dwelling unit (+1 for a detached house, frontage > 12.0 m) deducted from FSI GFA, only where FSI binds | entrance width ≤ 6.0 m (10.5.80.40(1)); lane access first (10.5.80.40(3)) |
| detached garage | in overall coverage (10.5.60.70(1)(A)); ancillary ≤ 10 % (1)(B) (R: 10.10.60.70(1)(B) parking exemption); ancillary floor area 60 / 40 m² (10.5.60.50(2)); shares the garden-suite 45 % / 20 % and laneway 30 % caps | rear-yard parking count (10.5.80.10(7)) |

The as-built `garageFit` (18.5 m² one-car floor, 20 % shared cap) is replaced by these rows (KFM-78-2).

### 6.6 Presentation rules

1. Shown: `computed` values of **permitted** scenarios only. `not_permitted`, `collapsed_into` and `not_evaluated` are counted, never displayed (M-64).
2. Order: headline first; then catalogue order (P, A, K); as-of-right before CoA.
3. Houseplex 2–4 (and 5–6) appear as unit rows inside one scenario: units, average unit size, maximum bedrooms.
4. Every number carries its citation and amendment status (Spec 69 P-1). CoA values say "calibrated from citywide CoA builds of this form, not law" and show the form (`coa_form`).
5. A parcel with no permitted computed scenario shows its closed reason (e.g. `not_evaluated:ambiguous_zone`), never a blank.
6. Formats are unchanged (`mobile/src/lib/parcelCostFormat.ts`); cost lines are unchanged (M-67).
7. Surfaces S-001 / S-072 follow Spec 126; the screen change is an Admin-domain item of the Phase 3 plan.

### 6.7 Assumptions are admin logic variables (Spec 69 M-68)

Non-law numbers on today's report path, each to be (or stay) a `logic_variables.json` row cited by id: `storey_height_m` 3 · `max_build_lot_min/max_sqm` 50 / 2000 · `max_build_min_dimension_m` 3 · `LOT_TOLERANCE` 0.15 · `BUILD_NORM_MIN_SAMPLE_DEFAULT` 5 · `FSI_PLAUSIBILITY_MAX` 10 · `OVER_CAPTURE_CLAMP` 1.1 · the pocket-storeys fallback literal `2` (`optimal-config.js:260`) *[read, field inventory]* · new: the CoA form factors `k_single` ≈ 1.11 and `k_multiplex` ≈ 1.42 (§6.4) *[measured, coa-analysis]*; `reno_coa_uplift_pct` retires with its column. Law-reading constants (suite, garage, setback and coverage values) do **not** become logic variables: they come from Layer 1 rows through Layer 2.

### 6.8 Storage (Spec 69 M-70) — every number *[inferred]* until the Phase 3 trial measures it

- Layer 2 b2 rows are **not** keyed by scenario: ≈ 5.6 M rows ≈ 2.9 GB fails the K5 10 % disk line.
- Differing scenario classes ride inside the existing (cell × target) rows, with `collapsed_into` for the rest: ≈ 380 MB → ≈ 0.6 GB.
- Per parcel, persist only the headline per tier and the counters. The grid is computed on read from the b2 rows and lot metrics (24-row read 3.9 / 13.9 ms p50 / p95 *[measured, Phase 2 trial]*). Persisting the full grid ≈ 387 M values ≈ 1–3 GB fails or crowds K5.
- The trial also measures per-parcel compute (28–162 evaluations), the full run time and WAL.

### 6.9 Gates and validation

| Item | Closed answer | Gate (Spec 68 §11.1 arm or step check) |
|---|---|---|
| Report-field totality | inventory ⇄ registry, both ways; retirement reason closed | G-UNIVERSE report-field arm |
| Formula shape | inputs resolve; literals licensed (clause or logic variable); ⧉ present | G-SHAPE formula arm |
| Formula execution | every row evaluates on every applicable vector; expected values match or an `eval_mismatch` adjudication | G-EVAL formula arm |
| Formula keying | agree / adjudicated / pending | G-AGREE, G-PROV |
| Status set | `computed` · `not_permitted` · `collapsed_into` · `not_evaluated` + closed reason | G-SHAPE status arm; step check |
| Scenario totality | one status per parcel × scenario × tier | G-UNIVERSE scenario arm; step check |
| Drift | inventory, catalogue, registry regenerate byte-identically or match their pin | G-DRIFT |
| Lineage | every `computed` value has formula, scenario, tier, Layer 2 rows, versions | step check (FAIL) |
| Plausibility | per field a zone-aware bound; invariants: `suite_gfa < main_gfa`; CoA(s) ≥ AOR(s); `total_gfa ≥ main_gfa`; `main_gfa ≤ fsi × lot` where FSI applies; footprint ≤ coverage × lot where regulated | Reality-Check bounds (existing plausibility executor); step checks |
| Shadow before switch | each difference in a closed class; `unexplained` = 0, `layer3_defect` = 0 | `step-validate` G8 explained diffs (M-71) |
| Oracles | C CoA notices (planned Spec 129 `load_coa_notices`), metamorphic (C1–C7, monotonicity), D expert sample, held-out lots | Phase 2 round runner, reused unchanged |

### 6.10 Out of scope

Builder cost and the cost menu (Spec 88, M-67) · compliance-only parking rules (§6.5) · conversions of existing buildings (10.5.20.40, 600.60.40(3)) · apartment buildings (a 5–6 unit building outside 600.60 is `not_permitted`) · Ch.970 transition parking (scan F3).

### 6.11 Open questions for ratification

1. 150.7.60.70(1): compute both the (A) and (B) coverage regimes per scenario and take the more permissive *[read: the text gives alternatives]*.
2. Semi / townhouse scenarios on a single detached lot: `not_permitted` (severance needed) or `not_evaluated`.
3. 600.60 overlay membership source (R-10; `not_evaluated:map_area_not_held` until then).
4. The M-55 provincial 4 m separation read as `max_requirement`: it changes the suite height tier.
5. ~~CoA cohort family: zone or scenario form.~~ **Answered 2026-10-07 (operator, M-65 rewrite):** from the scenario's building form, through a citywide factor per form; no neighbourhood cohort. Still open: whether "house + secondary suite" maps to `single` or `multiplex` (the analysis's multiplex class includes "2 Unit" permits, which may be house + suite).
6. Inventory generator: SQL source (recorded trace vs rendered builders) and home (Spec 126 tooling or Spec 68) — `generator-design.md` §4.
7. Which live columns retire, alias or stay (Appendix R).

## Known Failure Modes (Phase 3 inputs; traced at `bfaad556`, 2026-10-07)

- **KFM-78-1 — two disagreeing CoA GFA figures, neither form-aware.** The two figures are `max_newbuild_coa_gfa_sqm` = `max_buildable_gfa_sqm × (1 + reno_coa_uplift_pct)` (`enrich-parcels.js:929`) and `opt_coa_gfa_sqm` (the §P2.2 storey-p90 / realized-p90 tier).
  - **They disagree on almost every parcel:** opt_coa is lower on 258,181 and higher on 191,491 of 449,673 *[measured]*. The Tracked screen shows the first; the detail cost line prices the second.
  - **Against realized post-CoA single builds, ×1.05 is the better predictor:** median APE 0.204 vs 0.253 on held-out parcels *[measured, coa-analysis §2.4]*.
  - **opt_coa is a 0 / +50 % storey switch.** It equals AOR on 235,359 parcels (52 %) — 43.8 % because pocket p90 = p50 storeys, 8.0 % from the `realized_fsi_floor` — and over-predicts by 17 % where it fires *[measured]*.
  - **Neither prices multiplexes:** ×1.05 is ≈ 25 % under.
  - **Stale comment:** migration 206 says `coa_fsi = realized_fsi_p90`, but the code computes `opt_coa_gfa_sqm / lot` *[read]*.
  - **Phase 3:** one method, CoA(s) = AOR(s) × k_form; both columns retire (M-65).
- **KFM-78-2 — uncited suite and garage constants; two models.** The priced garden / laneway suite and garage lines use max-build-pass constants classed by-law-claimed-unsourced or heuristic (`GARDEN_SUITE_MAX_GFA_SQM` 60, `GARDEN_SUITE_MIN_LOT_SQM` 270, `LANEWAY_SUITE_MAX_GFA_SQM` 120, `GARAGE_MAX_GFA_SQM` 60, `ACCESSORY_MAX_COVERAGE_PCT` 0.30, `CAR_FOOTPRINT_SQM` 18.5, …; `enrich-parcels.js:631-654`). The by-law-cited `optimal-config.js` `BYLAW` set drives only `opt_suite_*`, which the report does not show *[read]*. Phase 3: both models are replaced by formula rows over Layer 2.
- **KFM-78-3 — the front setback reads a banned reference.** `buildMaxBuildSql` uses `COALESCE(bylaw_standard_setback_m, zone default)` as the front setback (`enrich-parcels.js:502`); STAND_SET-as-setback is in `vocab.banned_code_refs` (Spec 67 KFM-14), to be removed for residential parcels by E1 (Spec 68 §11). Side, rear and flankage come from 65 zone-default proxies, coverage from 13 statistical medians *[read]*. This is the largest Layer 2 replacement surface.
- **KFM-78-4 — `parcels.realized_fsi_p90` has no producer.** Its only writer is `compute_parcel_cost_estimates` copying the column's own prior value back (`parcel-cost.js:377` ← `compute-parcel-cost-estimates.js:150`); 0 parcels have it non-NULL *[measured]*. It is a dead field in the consumer contract (retire under M-69). The Phase 3 CoA method reads no `realized_fsi_p90` at all (M-65).
- **KFM-78-5 — the garden-suite `BYLAW` constants predate 849-2025.** `optimal-config.js` cites "150.7.60.70(1)(C)" for a 40 % rear-yard / 60 m² footprint; the adopted page has no (1)(C) and no "40 percent" *[measured]*. It has (A) 45 % shared or (B) LC + 20 % all-ancillary (150.7.60.70(1)), GFA 120 / 60 m² (150.7.60.50(4)), height 4.0 / 6.3 m (150.7.60.40(1)) and separation 4.0 / 7.5 m (150.7.60.30(1)); the code has 4.0 / 6.0 m and 5.0 / 7.5 m *[read, scan §8 F1]*. §P2.1 repeats the old values (§5.2 S9). Held until Phase 3 (Spec 69 M-25 F-1).
- **KFM-78-6 — as-of-right runs above the legal FSI cap.** `bylaw_max_fsi` is NULL on 100 % of RS/RT/RM/R and 99.4 % of RD parcels *[measured]*. As a result:
  - the as-of-right envelope is ≈ 1.2× the legal cap (permitted GFA in the 2017 decision notices = 0.83× our AOR, n 36 *[measured]*);
  - the fitted CoA factors k absorb that gap.
  - E2 (label FSI, Spec 69 M-25 / Spec 68 §11) fixes AOR. **k must be re-fitted after E2** (M-65), or CoA will be under-stated.

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
  - consumers: none
<!-- /generated:target-files -->
- `scripts/load-permits.js` (occupancy ingest), `scripts/lib/build-norms.js` (NEW, pure),
  `scripts/compute-build-norms.js` (NEW, Mutator), `scripts/manifest.json` (chain wiring),
  `migrations/198_permits_occupancy_columns.sql`, `migrations/199_neighbourhood_build_norms.sql`,
  `docs/specs/_contracts.json` (`build_norms` group), `docs/runbook/permit_occupancy_first_deploy.md`.
- `scripts/enrich-permits.js` — §4D wires `OPT_COMP_PROP_COLS`, `assertOptConfigColumns`, and the per-run propagation audit rows into this script (otherwise Spec 66)
- Tests this spec governs beyond its generated step suites (Amendment 6 of the generated-Target-Files WF2: the block's step tests switched off the system map's whole-spec test fallback, so these are now named here): `src/tests/optimal-config.logic.test.ts`
- **PLANNED — McBylaw Phase 3 (§6; PROPOSED, not created):** the formula registry and scenario catalogue under `scripts/seeds/bylaw/` (data, Spec 68 §10 layout); the report-field generator `scripts/analysis/report-fields.mjs` and its outputs `docs/reference/maxbld-report-fields.md` / `.json`; one converted step (proposed slug `compute_maxbld_scenarios`: step file, descriptor, compute module and its step test directory); `src/tests/report-fields.infra.test.ts`. Paths are fixed by the Phase 3 plan after the trial (Spec 69 M-70).

### Out-of-Scope Files
- `scripts/enrich-parcels.js` and the parcel new-fields / degrade-retire pass — **Phase 3**.
- Any optimal-config engine or comps kNN — **Phases 2–3**.
- `cost_estimates` / `trade_forecasts` reconciliation — **Phase 4**.
- *(2026-09-29)* The two bullets above that name Phases 2–3 are historical — those phases are built; see §5.2 S8.
- *(Phase 3, PROPOSED 2026-10-07)* Builder cost — `scripts/lib/parcel-cost.js`, `scripts/lib/compute/compute-parcel-cost-estimates.js`, the rate tables — owned by Spec 88 and untouched (Spec 69 M-67). The by-law table and evaluator (`scripts/analysis/bylaw/`, `scripts/generate-bylaw-provisions.mjs`) are Spec 68's; Phase 3 reads them, never forks them.

### Cross-Spec Dependencies
- **Relies on:** Spec 65 §4 (max-build envelope: `max_buildable_gfa_sqm`, `lot_size_sqm`), Spec 65 §8
  (`neighbourhood_storey_norms`), Spec 47 (script protocol), Spec 48 §3.6/§3.7 (cascade + first-deploy
  runbook), Spec 30 (Mutator archetype), Spec 41/55 (lifecycle/CoA linkage of `coa_applications`).
- **Consumed by:** Phases 2–3 (optimal-config engine + parcel calibration), Phase 4 (forecast/cost).
- `load-parcels.js` — upstream loader for the `parcels` rows this spec's lot-driven outputs are computed on
- `compute-storey-norms.js` — `storeys_p50/p90` joined from its `neighbourhood_storey_norms` output (Spec 65 §8); `compute_build_norms` runs after it in-chain
- **Spec 67** (`67_maxbuild_bylaw_derivation.md`) — MaxBuild derivation methodology, field universe and scenarios for the envelope this spec consumes (§5)
- **Phase 3 (§6, PROPOSED):** relies on Specs 68/69 (Layer 1 table, evaluator, Layer 2 resolution; rulings M-61..M-71), Specs 122/124 (the converted step), Spec 126 (report surfaces), planned Spec 129 `load_coa_notices` (oracle C); consumed by Spec 88 (reads the area columns only) and the MaxBLD report surfaces.

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
| 1a | `max_newbuild_coa_gfa_sqm` | coa (×1.05) | `enrich_parcels` pass 3 | none (empirical) | retire: `superseded_by:coa_gfa_sqm` (M-65; the better-validated of the two, KFM-78-1) |
| 2 | `opt_aor_gfa_sqm` | aor tier | `enrich_parcels` pass 5 (optimal-config) | as row 1 + dwelling_units_max | formula |
| 2a | `opt_coa_gfa_sqm` | coa tier | pass 5 | none (empirical) | retire: `superseded_by:coa_gfa_sqm` (M-65, KFM-78-1) |
| 3 | `max_build_stories` | aor | max-build pass | height_storeys, height_m, main_wall_height_m | formula |
| 3b | `opt_aor_storeys` / `opt_coa_storeys` | aor / coa | pass 5 | height_storeys | formula |
| 4 | `max_build_fsi` | aor envelope | `compute_parcel_cost_estimates` | fsi (parity) | formula |
| 4a | `coa_fsi` | coa | `compute_parcel_cost_estimates` | none (empirical) | formula |
| 5 | `envelope_constrained` + `envelope_constraint_reason` | — | max-build pass | required_lot_area_m2, required_lot_frontage_m | formula (status) |
| 6 | `lot_size_sqm` | — | `load_parcels` | — | input |
| C1–C13 | the 13 cost lines | aor / coa | `compute_parcel_cost_estimates` | via their area columns | cost_ref (Spec 88, M-67) |
| C5–C7 areas | `max_garden_suite_gfa_sqm`, `max_laneway_suite_gfa_sqm`, `max_garage_gfa_sqm` | aor | max-build pass | suite / ancillary envelope, landscaping, parking_access | formula |
| N1–N5 | `nearby_builds_summary`, `comp_count`, `comp_fsi_p50`, `comp_dominant_build`, comp examples | — | pass 4 / norms | none (empirical) | empirical_ref |
| N6 | Tracked "New Nearby CoA Ruling" | — | nothing computes it | — | open (no producer) |
| — | `realized_fsi_p90` (payload only) | — | self-loop | — | retire: `dead_field` (KFM-78-4) |

Payload-only (whitelisted, not rendered): `opt_aor_storeys`, `opt_coa_gfa_sqm`, `opt_coa_storeys`, `max_buildable_footprint_sqm`, `cur_floor_gfa_sqm`, `lot_size_sqft`, the 12 cost scalars, `comp_build_ratio_p50`, `neighbourhood_cost_premium` *[read, `consumer-lookup.ts:33-41` vs `[parcelId].tsx`]*.
