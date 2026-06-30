# Spec 88 — Parcel Renovation Cost Model

**Status:** ACTIVE (P1 in build, 2026-06-30). Design-of-record: `docs/reports/wf1-parcel-renovation-cost-model.md`.
**Domain:** Backend/Pipeline. **Advisory lock:** 117 (owning-spec lock 88 is taken by classify-permits.js — predates the spec-number convention; 117 assigned from the post-Wave-7 free range per the compute-phase-calibration precedent). The audit `phase` still carries the spec number 88.

## 1. Goal & User Story
> As the future **lead cost model** (Spec 83) and the parcel/lead UI, I want **every residential parcel to carry a menu of priced renovation scenarios** — grounded in external industry costs, lot-type-aware — so a lead can be presented as a set of costed options (max build, CoA build, kitchen, bath, basement, gut, addition, suites, garage, solar) rather than an undifferentiated "house."

This is a **pure parcel model**, distinct from the permit/CoA cost model (Spec 83): **no permit, no applicant-declared cost, no Liar's Gate, no `scope_intensity_matrix` allocation.** **External industry cost is the ONLY cost basis — Buildo permit data (`est_const_cost`) is NEVER a cost source.**

## 2. Behavioral Contract

### 2.1 The model (top-down)
For each residential parcel × each of the 13 reno lines:
```
cost(line) = industry_rate_per_sqm(archetype)
             × MAX(1, cost_escalation_index ÷ escalation_index_base)   -- never deflate fresh rates
             × cost_adjustment_factor(archetype)                       -- 1.0 default; SOLAR = 0.75 (usable roof)
             × area(line)                                              -- the line→field map (§2.3)
             × neighbourhood_cost_premium                              -- 1.00–1.85, census-income (parcels col)
```
The **total** is the anchor (external-industry-grounded). The per-trade/per-product **breakdown is deferred to P3** — P1 emits `trades:null`/`products:null` (a documented not-yet-calibrated sentinel; the total is unaffected).

### 2.2 GFA is the key; footprint is capped; CoA goes to stories
The buildable **footprint is capped** at the max-build as-of-right coverage. The CoA build uses that *same* capped footprint, so realized-FSI density above as-of-right is achieved by **more storeys** ("up, not out" — hard mechanism). Therefore:
- **CoA build authoritative output = GFA + `coa_fsi`** (the SOLID priced quantity is the CoA GFA: `opt_coa_gfa_sqm` in P1 / `realized_fsi_p90 × lot` post-R2; `coa_fsi = opt_coa_gfa_sqm ÷ lot` accordingly — see §2.5). Footprint (= `max_buildable_footprint`, capped/shared) + stories (derived `GFA ÷ footprint`) are **reference-only, low-confidence**.
- This well-founds **Solar-CoA = Solar-Max** (footprint capped → same roof).
- **Known limitation:** the model does NOT capture footprint-*expanding* CoAs (reduced-setback/coverage variances) — a future investigation (parse CoA decisions for coverage relief) could, but needs clean variance data not available today.

### 2.3 The 13 lines → area field (cost-local map; NOT the shared `ARCHETYPE_GEOM_BASIS`)
`parcel-cost.js` carries its OWN line→field map (the shared `ARCHETYPE_GEOM_BASIS` + its JS=TS parity tests are UNTOUCHED):

| # | Line | area field | rate $/ft² | notes |
|---|---|---|---|---|
| 1 | Max build | `max_buildable_gfa_sqm` | 450 | |
| 2 | CoA build | `opt_coa_gfa_sqm` (R2 detached-grounded) | 450 | GFA-driven |
| 3 | Solar — max | `max_buildable_footprint_sqm` (roof) | ~35/ft²·roof | ×0.75 adj |
| 4 | Solar — CoA | = #3 | = #3 | footprint capped |
| 5 | Garden suite | `max_garden_suite_gfa_sqm` | 500 | fit-gated |
| 6 | Laneway suite | `max_laneway_suite_gfa_sqm` | 525 | fit-gated |
| 7 | Kitchen | `cur_est_kitchen_gfa_sqm` (=footprint×`reno_kitchen_gfa_pct`) | 325 | |
| 8 | Bath | `cur_est_bath_gfa_sqm` (=footprint×`reno_bath_gfa_pct`) | 400 | |
| 9 | Garage | `max_garage_gfa_sqm` | 180 | fit-gated |
| 10 | Basement underpinning | `cur_floor_gfa_sqm` | 150 | same area as #11, higher rate (structural) |
| 11 | Basement reno | `cur_floor_gfa_sqm` (= footprint) | 70 | |
| 12 | Gut | `cur_pot_2story_gfa_sqm` (= footprint×2, **fixed-storey assumption** — no live existing-storey source) | 300 | |
| 13 | Addition + storey | `cur_floor_gfa_sqm` (one added storey) | 400 | |

New archetypes **`SOLAR`** + **`BAS_UNDERPIN`** live ONLY in `parcel-cost.js`'s local map — NOT added to `ARCHETYPE_BUNDLES`/`TAG_ARCHETYPE`/`deriveArchetypes`/the shared `ARCHETYPE_GEOM_BASIS` (would break the classifier parity tests + the closed `ArchetypeCode` union).

**Rate-key contract:** the `archetype` value in each `PARCEL_COST_LINES` entry is the **PK into `archetype_cost_rates`** (admin-tunable, Spec 86). The two rear-suite lines use **distinct** keys — **`LANE_GARDEN`** (#5) and **`LANE_LANEWAY`** (#6) — NOT a single `LANE`, so garden ($500/ft²) and laneway ($525/ft²) carry independent rows/rates. Full key set: `FB`, `CoA`, `SOLAR`, `LANE_GARDEN`, `LANE_LANEWAY`, `KIT`, `BTH`, `GAR`, `BAS_UNDERPIN`, `BAS`, `INT`, `ADD` (12 rate rows, §3). The 12 cost scalars are pinned to migration 205's seed literals by the `parcel_cost_model` block in `_contracts.json` (`contracts.infra.test.ts`).

### 2.4 `parcel_cost_menu` JSONB schema (parcel-scoped, like `optimal_config`)
Root: `{ "_schema_version": 1, "<line_id>": {…}, … }`. Per line:
- `total` (numeric, premium-inclusive — see §2.6), `per_sqm`, `area` (the geom_basis value used)
- `area_confidence` ∈ `high|medium|low` (§2.7) — **floor-AREA certainty, NOT a price range**
- `fits` (boolean) — present ONLY for fit-gated lines (LANE garden/laneway, GAR); driven by `rear_suite_permission`/`garage_permission ∈ {as_of_right, coa_required}` (NOT area-presence)
- `norm_basis` — **CoA-line-scoped only** (`pre_r2|r2_refined`; `n/a` for non-CoA lines; always `pre_r2` in P1 until R2 ships)
- absent line key = geom_basis NULL (not computable); `fits:false` = fit-gated (doesn't fit here) — these are DISTINCT.

### 2.5 New parcel scalar columns (headline + FSI), all propagated (§2.8)
Headline totals/per-sqm: `cost_fb_total`, `cost_coa_total`, `cost_garden_suite_total`, `cost_laneway_suite_total`, `cost_garage_total`, `cost_gut_total`, `cost_addition_total`, `cost_solar_total`, `cost_kitchen_per_sqm`, `cost_bath_per_sqm`, `cost_basement_per_sqm`, `cost_basement_underpin_per_sqm`. FSI: **`max_build_fsi`** (= `max_buildable_gfa_sqm ÷ lot`), **`coa_fsi`** (= `opt_coa_gfa_sqm ÷ lot` — the density of the CoA build line actually being priced; non-NULL in P1. Post-R2 this **equals** `realized_fsi_p90`, because R2 grounds `opt_coa_gfa` in the realized detached FSI p90 — so the two converge but are distinct scalars: `coa_fsi` is always the priced-build FSI, `realized_fsi_p90` is the neighbourhood density basis), **`realized_fsi_p90`** (the density basis — **NULL in P1**, populated by the P2 family-aware norm read; legible "by-law max FSI → realized CoA FSI").

### 2.6 Premium contract (CROSS-LAYER — lock with Spec 83)
`parcel_cost_menu` totals are **premium-INCLUSIVE / FINAL**. The lead cost model (Spec 83) **MUST NOT re-apply** `neighbourhood_cost_premium`. Enforced by an integration test. (`neighbourhood_cost_premium` NULL → 1.0 fallback; never NULL in practice — income-tier default.) Behavioral flag — lives HERE, not `_contracts.json`.

### 2.7 `area_confidence` bands
Lot-driven envelope (max/CoA build, suite, garage) + SOLAR = **high**. `cur_floor`/`cur_est_kitchen`/`cur_est_bath`-derived (basement/addition/kitchen/bath) = **medium**. Storey-multiplied gut (footprint×2 fixed-storey) = **low**. `max_build_confidence=low` with non-NULL GFA → emit at **low** (never skip, never $0). Report/menu wording must state the band = *floor-area certainty driven by imagery-footprint reliability (±20–38%)*, not price range.

### 2.8 Externalization (Spec 26/35/86 — ALL variables admin-tunable, none hard-coded)
- **`archetype_cost_rates`** table (control-panel rows, Spec 86): `archetype` PK, `cost_per_sqm`, `cost_adjustment_factor`, `escalation_index_base`, `source`, `as_of_date`. **NOT NULL + CHECK (`cost_per_sqm>0`, `escalation_index_base>0`, `cost_adjustment_factor>0`)**.
- **`logic_variables`** (all NUMERIC — `variable_value` is DECIMAL): `cost_escalation_index`, `cost_rates_stale_months` (3), `cost_index_stale_months` (4), `reno_kitchen_gfa_pct`, `reno_bath_gfa_pct`, `min_comp_count` (3, R4). Surfaced in the Admin Dashboard (Spec 26), state per Spec 35. The index's as-of date is NOT a separate var (logic_variables holds numbers, not dates) — the index staleness clock reads the `cost_escalation_index` row's own **`updated_at`**, which refreshes automatically when an operator edits the index.

### 2.9 Rate freshness
`cost_escalation_index` updated quarterly (manual, from StatCan BCPI Toronto CMA — NOT a live fetch). Escalation `MAX(1, index_now ÷ base)` (never deflate). Missing/invalid index → default 1.0 + WARN (not crash). Rate `as_of_date > now()` → FAIL row. Two staleness clocks: `cost_rates_stale` (rate `as_of_date` vs `cost_rates_stale_months`) + `cost_index_stale` (the `cost_escalation_index` row's `updated_at` vs `cost_index_stale_months`; **undatable** — no index row — → WARN, never silent PASS, per review fold OBS-12).

### 2.10 Propagation to permits/coa (Spec 48 → Spec 49)
The `cost_*` + FSI scalars join the dominant-parcel propagation in `enrich-permits.js` via a new **`COST_PROP_COLS`** set (the §4D mechanism — like `OPT_COMP_PROP_COLS`). The `parcel_cost_menu` JSONB stays **parcel-scoped**. Propagation emits **Spec 48** per-column audit rows (enrich-permits step) → **Spec 49** `assert-global-coverage.js` rows on THREE surfaces: `parcels` (GATED ≥85% of residential-with-building — the ~9% building-less are an exclusion *filter*, not a numerator note), `permits` (Step 9b), `coa_applications` (CoA Step 4b — INFO, sparse where parcel-unlinked). Migrations add the `cost_*`/FSI cols to permits + coa (guarded ADD COLUMN, like mig 204).

### 2.11 Observability (`compute-parcel-cost-estimates.js`, Spec 47 §8 / Spec 48 §3.6)
Audit rows (ALWAYS emitted incl. value:0): per-line coverage (13, INFO at zero = cold-start), `area_confidence` distribution (high/medium/low), `fit_gated_suite_count`/`fit_gated_garage_count`, `null_geom_basis_count`, `engine_error_count` (threshold `== 0` → FAIL, deliberately strict), `cost_rates_stale` (WARN-row) + companion `cost_rates_age_months` (INFO, always), `as_of_date` + `cost_escalation_index` (INFO domain counters), `unmapped_residential_family_fallback_count` (WARN). **Verdict = `rows.some(FAIL)?'FAIL':rows.some(WARN)?'WARN':'PASS'` — NO parallel boolean.** **Counter scoping: `records_total` = residential parcels examined (NOT 13×); `records_updated` = parcels with an `IS DISTINCT FROM` change.** Per-parcel `try/catch` → log `{parcel_id, err}` + `engine_error_count`++ + `error` sentinel in that parcel's JSONB, **continue** (one bad row must not crash the 380K run). `emitMeta` enumerates reads (`archetype_cost_rates` cols by name; `parcels` geom_basis cols + `neighbourhood_cost_premium`; `logic_variables` index) + writes (`parcel_cost_menu` + each headline/FSI scalar).

## 3. Rate derivation & source confidence
Every rate is an **external industry $/ft²** (Toronto, 2025–26), stored as $/m² in `archetype_cost_rates` (admin-tunable §2.8, index-escalated §2.9, re-calibrated annually). $/m² = $/ft² × 10.764.

| Line (archetype) | $/ft² | $/m² | Industry range $/ft² | Primary sources (2025–26) | Source confidence |
|---|---|---|---|---|---|
| Max build (FB) | 450 | 4,844 | 400–650 | Xavieras, Woodcastle, Stonebrooke, Village Park | **High** — many concordant Toronto custom-home guides; $450 = conservative-mid |
| CoA build (FB rate) | 450 | 4,844 | 400–650 | (same basis — it's a new build, larger GFA) | **High** |
| Solar — max & CoA (SOLAR) | ~35 /roof-ft² | ~377 | *derived* | GreenBuildingCanada, Solar-X, Xolar (per-watt) | **Medium** — solid $2.40–3.50/W data, but per-ft² conversion + 0.75 usable-fraction add modeling |
| Garden suite (LANE_GARDEN) | 500 | 5,382 | 450–600 | DavidReno, BVM, Oriel, TGC | **Med-High** — concordant suite guides |
| Laneway suite (LANE_LANEWAY) | 525 | 5,651 | 450–600 | + Maserat, Heracon, Elevate | **Med-High** |
| Kitchen (KIT) | 325 | 3,498 | 250–400 (lux 500+) | 905reno, Rocpal, Sosna, KarReno | **Medium** — wide range; product-driven so $/ft² varies a lot |
| Bath (BTH) | 400 | 4,306 | 300–600 (total $15–40k) | EasyRenovation, HomeStars, Dupont, PAB | **Medium** — high per-ft² variance (small area); the *total* is the more stable figure |
| Garage (GAR) | 180 | 1,938 | 150–208 (Toronto) | TGC, Trusscore, HomeStars | **Medium** — Toronto rates notably above the generic $40–70 |
| Basement underpinning (BAS-UNDERPIN) | 150 | 1,615 | 105–200 finished (80–450 by scope) | StrongBasements, NuSite, DRV, CSG | **Medium** — wide scope-dependent range; $150 = mid finished-shell |
| Basement reno (BAS) | 70 | 753 | 45–95 (avg 55–75) | TrueForm, Harmony, MagicWindow, Lifetime | **Med-High** — concordant finish-cost range |
| Gut (INT) | 300 | 3,229 | 200–400 (lux 450–550) | Rocpal, Habitual, TorontoToday, Lighthaus | **Medium** — strongly finish-level-dependent |
| Addition (ADD) | 400 | 4,306 | 300–500 (≈ new build) | TGC; additions ≈ new-construction | **Medium** — fewer addition-specific $/ft² cites |

**Internal cross-check (floor only, NOT a calibration input):** permit-declared `est_const_cost ÷ residential_sqm` (110K permits) gives new-build $153/ft², addition $208, reno $274 — but declared values **understate ~2×** (the Liar's-Gate effect). They serve only as a *floor* and confirm the model is not over-stated (the new-build rate $450 sits in the actual $400–650 range, well above the understated declared $153). **To tighten before P1 Green Light:** add 1–2 authoritative sources per line (e.g. Altus Canadian Cost Guide, RSMeans) and record them in the `archetype_cost_rates.source` column.

## 4. Archetypes & their relationship to cost
The **archetype is the unit that binds (area field, rate, trade set, `area_confidence`)** — 11 archetypes cover the 13 lines (FB serves max + CoA build; LANE serves garden + laneway; SOLAR serves both solar lines). Unlike the permit cost model (Spec 83), which *infers* the archetype from `(permit_type × structure_type)` via the `scope_intensity_matrix`, here **the archetype IS the reno line** — we know exactly which renovation, so there's no inference: `cost = rate(archetype) × area(archetype) × premium`.

Archetypes group into four cost-character families:
- **New-construction (FB, ADD, LANE):** area from the lot-validated envelope → **high `area_confidence`**; rates from custom-home/suite guides ($400–650/$450–600).
- **Current-home reno (KIT, BTH, BAS, BAS-UNDERPIN, INT):** area from the *existing footprint* (imagery, ±20–38%) → **medium/low**; reno-specific rates; product-heavy lines (KIT/BTH) get the P3 product breakdown.
- **Accessory (GAR, LANE):** **fit-gated** by the permission field (`garage_permission`/`rear_suite_permission`) — `fits:false` where not permitted.
- **SOLAR:** roof-area (footprint × 0.75 usable); per-watt-derived rate.

Each archetype's **trade set** (`ARCHETYPE_BUNDLES`) is *not* used to compute the P1 total (top-down) — it becomes the **P3 allocation basis** (split the total into trades + products). The archetype's `area_confidence` (§2.7) reflects its area driver (§5).

## 5. Square-footage drivers per archetype
The cost is `rate × AREA`, so the **area driver is half the model**. Two driver classes: the **lot-validated envelope** (`max_build_*` / `opt_coa_*` — geometry + by-law, reliable) vs the **existing-structure imagery footprint** (`imagery_roof_footprint`, ±20–38%, the source of the lower confidence bands).

| Archetype (line) | area field | how the sq footage is derived | driver class | `area_confidence` |
|---|---|---|---|---|
| FB (max build) | `max_buildable_gfa_sqm` | `LEAST(footprint × stories, lot × bylaw_fsi)` — lot-validated envelope | lot envelope | **high** |
| CoA build | `opt_coa_gfa_sqm` | `realized_fsi_p90 × lot` (coverage-bounded, floored at as-of-right) | realized FSI × lot | **high** (GFA; footprint/stories reference-only) |
| SOLAR (max & CoA) | `max_buildable_footprint_sqm` | × `cost_adjustment_factor` 0.75 (usable roof) | lot envelope (roof) | **high** |
| Garden suite | `max_garden_suite_gfa_sqm` | by-law: `min(40% rear-yard, 60 m²)` footprint, single-storey | by-law + rear yard | **high** |
| Laneway suite | `max_laneway_suite_gfa_sqm` | by-law laneway cap (requires abutting lane) | by-law + lane | **high** |
| Garage (GAR) | `max_garage_gfa_sqm` | by-law-capped garage footprint that fits the rear yard | by-law + rear yard | **high** |
| Kitchen (KIT) | `cur_est_kitchen_gfa_sqm` | `imagery_roof_footprint × reno_kitchen_gfa_pct` (15%, tunable) | imagery footprint × % | **medium** |
| Bath (BTH) | `cur_est_bath_gfa_sqm` | `imagery_roof_footprint × reno_bath_gfa_pct` (7%, tunable) | imagery footprint × % | **medium** |
| Basement reno (BAS) | `cur_floor_gfa_sqm` | `= imagery_roof_footprint` (single floor) | imagery footprint | **medium** |
| Basement underpinning | `cur_floor_gfa_sqm` | same area as BAS (the structural premium is in the *rate*, not the area) | imagery footprint | **medium** |
| Addition (ADD) | `cur_floor_gfa_sqm` | one added storey = one footprint | imagery footprint | **medium** |
| Gut (INT) | `cur_pot_2story_gfa_sqm` | `imagery_roof_footprint × 2` — **FIXED storey assumption** (no live existing-storey source: `existing_stories` retired, `permits.storeys`=0, the storey norm is a *new-build* norm) | imagery footprint × 2 | **low** |

**Two uncertainty sources drive the band:** (1) the **footprint** — lot-envelope (`max_build_*`, validated) is reliable; the imagery footprint (±20–38%, tree-contaminated) is not; (2) the **multipliers** — the reno-% (kitchen 15% / bath 7%) and especially the gut's fixed ×2 storey assumption. The lot-envelope/by-law-driven lines are `high`; imagery-footprint lines are `medium`; the imagery-footprint-×-fixed-storey gut is `low`. This is exactly what `area_confidence` (§2.7) communicates — *certainty of the square footage, not a price range.*

## 6. Operating Boundaries

### Target Files (P1)
- `scripts/lib/parcel-cost.js` (NEW, pure — engine + local line→field map + `area_confidence` + SOLAR/BAS-UNDERPIN), `scripts/compute-parcel-cost-estimates.js` (NEW, Mutator, lock 88), `scripts/manifest.json` (sources chain, after `enrich_parcels` before `refresh_snapshot`), `scripts/enrich-permits.js` (`COST_PROP_COLS` propagation), `scripts/quality/assert-global-coverage.js` (Spec 49 rows × 3 surfaces).
- `migrations/NNN` — `archetype_cost_rates` table + seed; `parcels` cost/FSI cols; `permits`+`coa_applications` cost/FSI cols.
- `docs/specs/_contracts.json` (`parcel_cost_model` group — non-tunable constants + seed-migration literal lock), `contracts.infra.test.ts`, `scripts/seeds/logic_variables.json`.

### Out-of-Scope Files
- **P2 (separate phase):** `neighbourhood_*_norms` `structure_family` schema + the shared family-aware accessor + the 5 norm read-sites + R2 (`optimal-config.js` realized-FSI wiring) + R4 (comp family filter). This spec's P1 uses *current* `opt_coa_gfa`.
- **P3:** the product-cost dimension + the per-trade/product breakdown (`trades`/`products` JSONB sub-objects).
- The permit/CoA cost model (`compute-cost-estimates.js`, `cost-model-shared.js`, `trade_sqft_rates`) — **untouched**; this is an additive parcel model.

### Cross-Spec Dependencies
- **Relies on:** Spec 65 §4 (`max_buildable_gfa/footprint_sqm`, the `cur_*` scenario fields, `neighbourhood_cost_premium`), Spec 78 (`opt_coa_gfa_sqm` + the §4D `OPT_COMP_PROP_COLS` propagation pattern), Spec 47 (Mutator skeleton), Spec 48 §3.6 (verdict cascade), Spec 49 (completeness matrix), Spec 86 (Control Panel — rate/logic-var tuning), Spec 26/35 (admin surfacing).
- **Consumed by:** Spec 83 (lead cost model — selects an archetype + reads the propagated cost; MUST honor §2.6 premium-inclusive), Spec 87 (supplier audience — P3 product breakdown).

## 7. Phasing
**P1** cost engine + rates + propagation (this spec) → **P2** family-aware reads + R2 detached `opt_coa` + R4 type-aware comparables → **P3** products + breakdown. See `.cursor/active_task.md` for the phase execution plans.

## 8. Known limitations / future work
- Footprint-expanding (coverage-variance) CoAs not modeled (§2.2) — needs clean variance data.
- Per-trade/product breakdown deferred to P3 (`trades:null` until then) — requires a `product_rates` dimension; the top-down *total* is unaffected.
- Solar is build-roof-tied (max/CoA); a "solar on the *existing* roof" line (using `imagery_roof_footprint`) is a possible future addition.
- The `$/ft²` rate table to be tightened with 1–2 more sources (e.g. Altus Cost Guide) before P1 Green Light.
