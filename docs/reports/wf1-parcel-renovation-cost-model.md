# Parcel-Wide Renovation Cost Model — Design Report

**Date:** 2026-06-29
**Author:** Lead Software Engineer (Buildo)
**Status:** Investigation / design brief — NOT an implementation task
**Governing specs:** Spec 65 (enrich-parcels), Spec 80 (taxonomies / trade index), Spec 83 (lead cost model), Spec 85 (trade forecast), Spec 87 (supplier audience)
**Prior art (must not contradict):** `docs/reports/wf1-cost-estimate-master-approach.md`, `wf1-cost-implementation-plan.md`, `wf1-trade-product-taxonomy-design-brief.md`, `wf1-cost-matrix-rekey-*`, `wf3-cost-model-none.md`

---

## 1. Purpose & Scope

Apply **renovation cost estimates to every parcel, for every possible renovation type**, using the trade index. This is a *menu of priced scenarios per lot* — not tied to any permit. The future **lead cost model (Spec 83)** will pick the relevant archetype option(s) for a given lead from this pre-computed parcel menu.

**Three explicit constraints from the request:**

1. **No neighbourhood premium yet.** All costs in this model are computed *before* `neighbourhood_cost_premium` (the 1.00–1.85 income-tier multiplier). The premium is a later multiplicative stage. → This is trivially satisfied: set `premium = 1.0` in the trade-value formula.
2. **This is NOT the permit/CoA cost model.** It attaches to **parcels**, not leads. It has no applicant-declared cost, therefore **no Liar's Gate**, and **no `scope_intensity_matrix` allocation %** (see §2 for why).
3. **Cadence asymmetry.** The data-sources pipeline (which enriches parcels) does **not** run daily, unlike the permits/CoA chains. Parcel costs are therefore *stable between sources runs* and only need recompute when (a) the sources chain re-enriches a parcel, or (b) the trade rates change. See §8.7.

---

## 2. How this differs from the existing permit/CoA cost model

The existing engine (`compute-cost-estimates.js` for permits, `compute-coa-cost-estimates.js` for CoA, shared brain `src/features/leads/lib/cost-model-shared.js`) computes:

```
GFA      = footprint_area_sqm × stories            (massing) | lot×coverage×floors (fallback)
Area_Eff = GFA × scope_intensity_matrix[(permit_type, structure_type)]   ← the allocation %
Cost     = Σ active_trade_slugs [ Area_Eff × base_rate_sqft × complexity × premium × shell? ]
Cost     = Liar's Gate( model_cost, applicant_declared_cost )            ← reconcile vs declared
```

Two of those steps **do not apply to a parcel model**, and dropping them is what makes the parcel model simpler and more honest:

| Permit-model step | Why it exists for permits | Why the parcel model drops it |
|---|---|---|
| **`scope_intensity_matrix` allocation %** | A permit only tells us `(permit_type, structure_type)` — the matrix infers "what fraction of GFA is in scope" (e.g. `Small Residential × SFD → 0.25`). | The parcel model knows the *exact* renovation archetype, so scope is defined two ways already: the **archetype's trade subset** (which trades) **and** the **archetype's `geom_basis` field** (which area). No inference needed — allocation = 1.0 of the chosen scenario area. |
| **Liar's Gate** | Reconciles the model against the applicant's declared construction value. | Parcels have no declared cost. The model value *is* the estimate. (Same as `compute-coa-cost-estimates.js`, which already emits `cost_source='geometric'` with no Liar's Gate.) |

**This is the key architectural insight:** the parcel model is the *pure* form of the cost engine — `area × trade-index`, where the archetype picks both the area field and the trade set. The permit model's matrix/Liar's-Gate machinery is compensating for *not knowing* the scope; on parcels we know it.

---

## 3. The cost formula (parcel model)

For a given parcel `P` and renovation archetype `A`:

```
area_A        = P[ ARCHETYPE_GEOM_BASIS[A] ]          (a scenario GFA field, in m²)
trades_A      = ARCHETYPE_BUNDLES[A].trades           (the trade subset for this archetype)
rate(t)       = trade_sqft_rates[t].base_rate_sqft × trade_sqft_rates[t].structure_complexity_factor

per_sqm_A     = Σ_{t ∈ trades_A} rate(t)              ← the "$/m² for this reno type" (premium-free)
total_A       = area_A × per_sqm_A                    ← total cost (premium-free)
```

- **`trade_sqft_rates`** (migration 096, 32 trades) is the **trade index**. Columns: `base_rate_sqft`, `structure_complexity_factor`. Tunable via the Spec 86 control panel — **not** code constants.
- **`ARCHETYPE_BUNDLES`** and **`ARCHETYPE_GEOM_BASIS`** live in `scripts/lib/archetypes.js` (already shipped — Spec 65 §6 Phase 2 B1).
- **Premium excluded:** `premium = 1.0`. `neighbourhood_cost_premium` is applied at the lead stage later.

### ⚠️ Unit caveat (must resolve before building)
`computeTradeValue` (`cost-model-shared.js:312`) multiplies an area documented as **m²** (`areaEff` … "effective work area (sqm)") by a column **named** `base_rate_sqft`. Despite the `_sqft` name, the rate is applied per-**m²** in production (the seed comment in mig 096 says it was "derived from existing BASE_RATES / avg allocation_pct", and the master-approach rate table quotes CAD/**m²** values — framing $290, plumbing $195…). The parcel model must use the **same convention** (rate × m² area) so it stays in dual-path parity with the permit model. The `_sqft` suffix is a misnomer to flag, not a conversion to apply.

---

## 4. Current parcel fields (the inventory)

Every parcel field that can feed a renovation cost, grouped by role. Reliability flags matter: the model should emit a **confidence band** per cost line driven by the weakest input.

### 4.1 Lot geometry (gate)
| Field | Unit | Role | Reliability |
|---|---|---|---|
| `lot_size_sqm` | m² | Lot area (3-way cross-checked) | Baseline; ~96.5% coverage |
| `frontage_m`, `depth_m` | m | Lot dims | Cadastral ±10% |
| `lot_size_confidence` | high/med/low | **Gate** — `low` NULLs all envelope outputs | — |

### 4.2 Max-build envelope → feeds **full builds**
| Field | Unit | Role | Reliability |
|---|---|---|---|
| `max_buildable_gfa_sqm` | m² | **FB area** (`LEAST(footprint×storeys, lot×FSI)`) | Sparse where FSI present (~5%); else coverage-box fallback. ±20–38% |
| `max_buildable_footprint_sqm` | m² | Buildable footprint (roof-area proxy for solar) | Load-bearing box term; ±20–38% |
| `max_build_stories` | int | Storey count (bylaw / pocket-p50 / derived) | NULL → GFA NULL |
| `max_build_confidence` | high/med/low | **Trust band for the number** | Use as the cost-line confidence seed |
| `envelope_constrained` + `_reason` | bool/enum | Binding constraint (ravine/heritage/narrow…) | Drives "not permitted" cases |

### 4.3 CoA-upside → feeds **CoA builds**
| Field | Unit | Role | Notes |
|---|---|---|---|
| `max_newbuild_coa_gfa_sqm` | m² | `max_buildable_gfa × (1 + reno_coa_uplift_pct)` | **Conservative** (~+5% uplift). Spec 65. |
| `opt_coa_gfa_sqm` | m² | Main build at neighbourhood **p90** storeys (market ceiling) | **Aggressive** (real CoA upside). Spec 78. |
| `max_build_stories_aggressive`, `market_exceeds_bylaw` | int/bool | Pocket-p90 ceiling; variance-hotspot flag | Signal for *whether* CoA upside is realistic |

→ **Decision needed (§8.2):** which field is "CoA Max Build" — the +5% uplift or the p90-market figure.

### 4.4 Accessory structures → feeds **suites + garage**
| Field | Unit | Role | Notes |
|---|---|---|---|
| `max_garden_suite_gfa_sqm` | m² | Garden suite GFA (single-storey) | Only when `abuts_laneway=false` |
| `max_laneway_suite_gfa_sqm` | m² | Laneway suite GFA (2-storey) | Only when `abuts_laneway=true` |
| `max_rear_suite_gfa_sqm` | m² | **Chosen** suite (laneway XOR garden) — `LANE` geom_basis | The unified field the archetype reads |
| `rear_suite_type` | laneway/garden/NULL | Which suite (mutually exclusive) | NULL = neither fits |
| `max_garage_gfa_sqm` | m² | Detached garage footprint — `GAR` geom_basis | NULL when heritage/ravine/no-yard |
| `garage_capacity_cars`, `*_permission` | int/enum | Stalls; as_of_right/coa_required/not_permitted | Greenspace-driven only |

### 4.5 Current-building GFA range menu → feeds **kitchen / bath / basement / gut / addition**
*(WF3-A replaced the tree-contaminated `existing_gfa_sqm` with this trustworthy footprint-derived menu.)*
| Field | Unit | Role | Reliability |
|---|---|---|---|
| `cur_floor_gfa_sqm` | m² | Known single-floor = footprint — `ADD`/`BAS` geom_basis | **Highest** (footprint-derived, no storey guess) |
| `cur_pot_2story_gfa_sqm` | m² | footprint × 2 — `INT` (gut) geom_basis | Always emitted when footprint known |
| `cur_pot_3story_gfa_sqm` | m² | footprint × 3 | Only when `max_build_stories ≥ 3` |
| `cur_est_kitchen_gfa_sqm` | m² | footprint × `reno_kitchen_gfa_pct` (15%) — `KIT` | Externalized %; NULL if footprint unknown |
| `cur_est_bath_gfa_sqm` | m² | footprint × `reno_bath_gfa_pct` (7%) — `BTH` | Externalized % |

### 4.6 Deprecated / unreliable (do NOT use as a cost input)
- `existing_stories`, `existing_height_m` — tree-canopy contaminated (bungalows reported at 18–95 m); **NULLed on re-enrich** (WF3-A).
- `imagery_roof_footprint_sqm`, `imagery_roof_gfa_sqm` — ±20–38%; renamed precisely to signal "do not trust as authoritative."
- `cur_basement_gfa_sqm`, `cur_storey_gfa_sqm`, `cur_interior_reno_gfa_sqm` — superseded by the menu above; NULL-cleared but kept in schema.

### 4.7 Modifiers (held back / applied later)
- `neighbourhood_cost_premium` (1.00–1.85) — **excluded** from this model per the request; applied at the lead stage.
- `zoning_class`, `bylaw_max_*` — feed the envelope fields upstream; also the natural source for **structure-complexity** selection (§8.4).

### 4.8 Solar — driven by footprint (roof area), no dedicated field
There is **no** solar-potential/irradiance field on `parcels`, but solar is roof-mounted so its area driver is the **building footprint** (= roof area), for which `max_buildable_footprint_sqm` is the natural source. Solar is currently a **trade** (`solar`, id 28, `per_unit`) inside FB/ENV bundles; per the decision below it becomes its **own archetype** (`SOLAR`). See §8.1.

### 4.9 ⚠️ No CoA footprint field — CoA is modeled as vertical-only
**Confirmed against source** (`optimal-config.js:242`): *"CoA = up, not out — footprint unchanged between tiers."* The as-of-right and CoA tiers **share one footprint** (`max_buildable_footprint_sqm`); CoA adds **storeys**, not footprint. Consequences:
- **GFA lines (#1 vs #2) ARE separable** — `max_buildable_gfa_sqm` vs `opt_coa_gfa_sqm` differ because CoA adds storeys. ✅
- **Footprint-driven lines (solar) are NOT separable** — same roof → Solar-Max == Solar-CoA under today's model. A distinct `max_coa_buildable_footprint_sqm` would require modeling **reduced-setback (horizontal) variances** — new work, see §8.1.

---

## 5. Archetype → geom_basis → trade-bundle reference

Authoritative, read from `scripts/lib/archetypes.js`:

| Archetype | geom_basis (parcel field) | Trade set | Trade count |
|---|---|---|---|
| **FB** (full build) | `max_buildable_gfa_sqm` | all-trades (incl. solar, elevator) | 32 |
| **LANE** (rear suite) | `max_rear_suite_gfa_sqm` | = FB set | 32 |
| **ADD** (addition+storey) | `cur_floor_gfa_sqm` | structural+envelope+MEP+finish (no elevator) | 26 |
| **BAS** (basement reno) | `cur_floor_gfa_sqm` | excavation/shoring/waterproof/MEP/finish | 18 |
| **INT** (gut job) | `cur_pot_2story_gfa_sqm` | demo/framing/finish/glazing | 13 |
| **KIT** (kitchen) | `cur_est_kitchen_gfa_sqm` | plumbing/elec/drywall/tile/floor/paint/trim/millwork/stone | 10 |
| **BTH** (bathroom) | `cur_est_bath_gfa_sqm` | KIT set + caulking | 11 |
| **GAR** (garage) | `max_garage_gfa_sqm` | site/excav/concrete/framing/masonry/roof/glaze/elec/siding/demo/doors | 12 |
| **ENV** (envelope) | `null` (not area-proportional) | masonry/roof/glazing/insul/siding/**solar**/caulk | 7 |
| **MEC** (mechanical) | `null` | plumbing/hvac/elec/fire/security/drain | 6 |
| **SITE** (site/landscape) | `null` | site/excav/concrete/framing/drain/landscape/deck/pool/doors | 9 |
| **SOLAR** *(NEW — to add)* | `max_buildable_footprint_sqm` (roof area) | `solar` (+ `electrical` tie-in) | 1–2 |
| **BAS-UNDERPIN** *(NEW — to add)* | `cur_floor_gfa_sqm` | BAS set + heavy {excavation, shoring, structural-steel, waterproofing, concrete} | ~20 |

---

## 6. The 13 renovation cost lines

For each requested line: the archetype, the parcel area field, the trade set, output shape (total vs $/m²), and whether it's **computable today** or has a **gap**.

| # | Requested line | Archetype | Parcel area field | Trades | Output | Status |
|---|---|---|---|---|---|---|
| 1 | **Max build** (all trades, no premium) | FB | `max_buildable_gfa_sqm` | all 32 | **Total** | ✅ Computable |
| 2 | **CoA max build** (all trades) | FB | `opt_coa_gfa_sqm` (CoA, decided) | all 32 | **Total** | ✅ Computable |
| 3 | **Solar — max build** | **SOLAR** (new) | `max_buildable_footprint_sqm` (roof) | `solar` (+elec) | **Total** | ⚠️ Needs SOLAR archetype + solar rate (§8.1) |
| 4 | **Solar — CoA build** | **SOLAR** (new) | *(no CoA footprint — = #3 today)* | `solar` (+elec) | **Total** | ❌ = #3 unless CoA-footprint modeled (§4.9, §8.1) |
| 5 | **Garden suite** (all trades) | LANE | `max_garden_suite_gfa_sqm` | all 32 | **Total** | ✅ Computable (when garden fits) |
| 6 | **Laneway suite** (all trades) | LANE | `max_laneway_suite_gfa_sqm` | all 32 | **Total** | ✅ Computable (when lane fits) |
| 7 | **Kitchen reno** — $/sq ft | KIT | `cur_est_kitchen_gfa_sqm` | 10 | **$/m²** (+ optional total) | ✅ Computable |
| 8 | **Bathroom reno** — $/sq ft | BTH | `cur_est_bath_gfa_sqm` | 11 | **$/m²** (+ optional total) | ✅ Computable |
| 9 | **Separate garage** — total | GAR | `max_garage_gfa_sqm` | 12 | **Total** | ✅ Computable (when garage fits) |
| 10 | **Basement underpinning** — $/sq ft | **BAS-UNDERPIN** (new) | `cur_floor_gfa_sqm` | BAS + heavy structural | **$/m²** | ⚠️ Add archetype (§8.3, decided) |
| 11 | **Basement reno, no underpinning** — $/sq ft | BAS | `cur_floor_gfa_sqm` | 18 | **$/m²** (+ optional total) | ✅ Computable |
| 12 | **Gut job** — $/sq ft | INT | `cur_pot_2story_gfa_sqm` | 13 | **$/m²** (+ optional total) | ✅ Computable |
| 13 | **Addition + storey** | ADD | `cur_floor_gfa_sqm` (one storey) — **see §7** | 26 | **Total** | ✅ Computable — but NOT "max build" |

**Score after decisions: 12 of 13 fully specified.** 9 computable with shipped primitives; **#2** decided (`opt_coa_gfa_sqm`); **#3** + **#10** need a small new archetype each (`SOLAR`, `BAS-UNDERPIN`) + a solar rate. The **only genuinely open** item is **#4 Solar-CoA**, which equals #3 unless we build a `max_coa_buildable_footprint_sqm` (reduced-setback variance modeling — §4.9).

### Notes on output shape
- **Total** lines (full builds, suites, garage, addition) have a *reliable area* → emit total cost.
- **$/m²** lines (kitchen, bath, basement, gut, underpinning) are reno types where the area is small/uncertain and the **rate is the stable, transferable number**. Emit `per_sqm` always; emit the total too when the area field is present (it's cheap and the lead model may want it).
- **All "$/sq ft" requests** → store as **$/m²** internally for dual-path parity with the permit model (§3 unit caveat), and convert to $/ft² (× 0.0929) only at the presentation layer.

---

## 7. #13 "Addition + Storey" — confirmation (you asked to confirm)

**Short answer: not quite — as the system is wired today, `ADD` uses `cur_floor_gfa_sqm`, NOT the max-build GFA.**

The shipped `ARCHETYPE_GEOM_BASIS` (archetypes.js:228) maps:
```
ADD: 'cur_floor_gfa_sqm'   // WF3-A: "one added storey = one footprint"
```
The rationale (in the code comment): an addition/storey adds **one footprint's worth of floor area** on top of what exists — so the costed area is one floor (`cur_floor_gfa_sqm`), priced with the 26-trade ADD bundle.

Using `max_buildable_gfa_sqm` (the full envelope) for an addition would **double-count the existing structure** and make line #13 numerically identical to line #1 (full new build) — which is wrong for an addition.

**Two coherent interpretations — pick per product intent:**

- **(A) Single storey-addition (current wiring):** area = `cur_floor_gfa_sqm` (one new floor on the existing footprint). ✅ Already supported. Best match for "addition + a storey."
- **(B) "Build out to the maximum envelope" (your instinct):** the *added* area = `max_buildable_gfa_sqm − existing_GFA`. The max-build envelope is the **end state**, but the **cost basis is the delta**, not the whole envelope. The blocker: a reliable "existing GFA" doesn't exist (that's exactly why the GFA-range menu was created). A defensible proxy: `max_buildable_gfa_sqm − cur_floor_gfa_sqm` (envelope minus known main floor), ADD trades, with confidence downgraded.

**Recommendation:** keep **(A)** as the canonical "Addition + Storey" line (reliable, already wired). Optionally add a separate **"Build-to-max addition"** line using the (B) delta if the lead model wants a "maximize the lot" scenario — but label it clearly as a delta-to-envelope, not a second full build.

---

## 8. Gaps & open decisions

### 8.1 Solar (lines #3, #4) — DECIDED: solar is its own archetype
**Decision (user):** make solar a first-class **`SOLAR` archetype**, driven by `max_buildable_footprint_sqm` (the roof = footprint).
- `SOLAR` bundle = `solar` (+ `electrical` for inverter/grid tie-in). geom_basis = `max_buildable_footprint_sqm`.
- Solar's `cost_basis` is `per_unit` today; for a footprint-driven estimate either (a) add a **solar $/m²** rate, or (b) derive panels = roof_area ÷ panel_area × per-panel cost. Recommend **(a)** (a `solar` $/m² entry), revisit (b) for precision.
- **`Solar CoA Build` (#4) == `Solar Max Build` (#3) under the current model** — same footprint → same roof (see §4.9). A genuinely separate solar-CoA needs a **`max_coa_buildable_footprint_sqm`** field that models reduced-setback (horizontal) variances. That field **does not exist** and is **new modeling work**, not a data backfill. → **Open decision for the user** (see response).

### 8.2 "CoA Max Build" field (line #2) — DECIDED
- **Use `opt_coa_gfa_sqm`** (neighbourhood p90 storeys at the same footprint — the real, market-validated CoA upside; Spec 78, ~448K parcels). `max_newbuild_coa_gfa_sqm` (+5% uplift) is the conservative alternative.
- Both the **no-CoA** (`max_buildable_gfa_sqm`) and **CoA** (`opt_coa_gfa_sqm`) GFA fields **exist and are distinct** — the two full-build lines are cleanly separable. ✅ Gate on `market_exceeds_bylaw` for realism.

### 8.3 Basement underpinning (line #10) — new archetype
- Explicitly **deferred** in Spec 80 §5.B.2 ("basement-underpinned … deferred to its own Spec-80 WF"). No bundle today.
- Underpinning is *materially* more expensive than a finish-only basement (deep excavation, shoring, sequential underpinning concrete, structural). A `BAS-UNDERPIN` bundle ≈ BAS + heavy {excavation, shoring, concrete, structural-steel, waterproofing} weighting on `cur_floor_gfa_sqm`.
- **Decision:** create a new archetype + geom_basis entry, or fold as a multiplier on BAS. Recommend a distinct archetype (the trade mix genuinely differs).

### 8.4 Structure complexity — DECIDED: build up bottom-up by trade (+ product), validate against industry
**User's direction (correct):** don't lean on a `structure_complexity_factor` knob — **build each archetype's cost up from its trades (and products)** and sanity-check the archetype total against real-world per-sqft industry costs for that reno type.

What `structure_complexity_factor` actually is: the permit model's multiplier to scale a base $/m² by *building type* — a high-rise tower's framing/MEP genuinely costs more per m² than a detached house's (cranes, fire-rating, structural steel). It matters when costing **towers vs houses**. For a parcel reno model that is overwhelmingly **low-rise residential**, it is ~1.0 and adds little — so it's right to set it aside.

**The model this implies:**
- **`archetype_cost_per_sqm = Σ_{t ∈ trades} trade_rate(t)`** — pure bottom-up sum of the trade index over the archetype's bundle. Optionally add **`Σ_{p ∈ products} product_rate(p)`** (materials) for a labor+materials total.
- **Emit a per-trade AND per-product breakdown** per archetype (the "cool" thing) — e.g. `{ kitchen: { total, per_sqm, trades: { plumbing: …, electrical: …, tiling: … }, products: { cabinets: …, countertops: … } } }`. This is what lets the lead model and suppliers see *where* the money is.
- **`underpinning > basement` falls out naturally** — BAS-UNDERPIN carries the heavy {excavation, shoring, structural-steel, waterproofing} trades that plain BAS doesn't, so its per-sqm sum is simply larger. No special-case multiplier needed; the trade composition *is* the differentiator.
- **Industry benchmark = top-down calibration check**, not an input: hold each archetype's built-up per-sqft against published Toronto reno costs (kitchen $X–Y/ft², bath, basement, gut, new build). Where the bottom-up sum drifts from the benchmark, tune the underlying **trade rates** (control-panel), not a fudge factor — so every archetype stays consistent.
- Keep `structure_complexity_factor` available but **default 1.0** for residential; only engage it if the model is ever extended to multi-storey/commercial parcels.

> **Implication:** this needs a `products` rate dimension. Today `trade_sqft_rates` covers labor (trades); a per-product cost requires a `product_rates` table (the 27-product model from Spec 80). If a labor-only first pass is acceptable, ship trades-only and add products later — but the per-trade/per-product breakdown is the right end-state.

### 8.5 Per-unit / fixed / rental trades
- The current engine treats *every* trade as per-area, but `cost_basis` for `solar`, `elevator`, `stone-countertops`, `millwork-cabinetry`, `overhead-doors`, `windows` is `per_unit`, and `site-preparation`/`landscaping`/`security` is `fixed` (Spec 80 §5.B.2). This is a **known deferred item** (master-approach Phase 4). The parcel model inherits the same simplification for now; flag full-build totals as "per-area approximation" until cost_basis variants land.

### 8.6 Confidence bands
- Each cost line should carry a confidence derived from its weakest input: `max_build_confidence` (lines 1–6, 9, 13), footprint reliability (lines 7–8, 10–12), and `comp_count` (the comps can sanity-check the full-build numbers). Emit a band (±15/±25/±50%) per the master-approach convention.

### 8.7 Cadence & storage (the asymmetry you raised)
- Parcels are enriched by the **non-daily** sources chain; permits/CoA run daily. Parcel costs are therefore **stable between sources runs**.
- **Recommendation:** a new pipeline step **`compute-parcel-cost-estimates.js`** (Mutator) that runs **at the end of the sources chain** (after enrich-parcels) and writes a per-parcel cost menu. Because the trade index can change *without* a sources run (control-panel edit), make the step **independently re-runnable** (idempotent, reads `trade_sqft_rates` live) so a rate change triggers a cheap recompute without re-enriching parcels.
- **Storage options:** (a) flat columns on `parcels` (`cost_fb`, `cost_coa`, `cost_garden_suite`, `per_sqm_kitchen`, …) — simple, but ~13 × {total, per_sqm, confidence} ≈ 30+ columns; (b) a single `parcel_cost_menu` JSONB column — flexible, fewer columns, matches the `optimal_config` precedent; (c) a dedicated `parcel_cost_estimates` table keyed by `parcel_id` + `archetype`. **Recommend (b) JSONB** for the menu + a few flat headline scalars (e.g. `cost_fb_total`, `cost_coa_total`) for cheap filtering — mirrors how Spec 78 shipped `optimal_config` JSONB + `opt_*` scalars.

---

## 9. Recommended approach (summary)

1. **New Mutator** `compute-parcel-cost-estimates.js`, lock ID = its spec number, runs at the tail of the sources chain; idempotent + independently re-runnable on a rate change.
2. **Bottom-up by trade (+ product)** — `archetype_cost_per_sqm = Σ trade rates` (× area for total), `premium = 1.0`; emit a **per-trade and per-product breakdown** per archetype (§8.4). Reuse `ARCHETYPE_BUNDLES` / `ARCHETYPE_GEOM_BASIS`.
3. **Add two archetypes** — `SOLAR` (roof = `max_buildable_footprint_sqm`, solar+elec) and `BAS-UNDERPIN` (BAS + heavy structural). Add a `solar` $/m² rate. `BAS-UNDERPIN > BAS` falls out of trade composition, no fudge factor.
4. **Add a product rate dimension** — a `product_rates` table (Spec 80's 27 products) for the materials half of the breakdown. Labor-only first pass acceptable; products are the right end-state.
5. **Emit per parcel:** for each computable archetype, `{ total, per_sqm, confidence, trades:{…}, products:{…} }` as a `parcel_cost_menu` JSONB + headline scalars (`cost_max_build`, `cost_coa_build`, …).
6. **Calibrate against industry per-sqft benchmarks** (top-down check) — tune trade rates, not a per-archetype fudge.
7. **Honesty:** carry a confidence band (seed from `max_build_confidence` / footprint reliability); safe-skip NULL geom_basis and not-permitted accessory cases; flag `per_unit`/`fixed` trades as approximations until cost_basis variants land.
8. **Dual-path parity:** keep the rate × m² convention identical to `cost-model-shared.js`.

### Open decision for the user
- **Solar-CoA (#4):** accept it **equals Solar-Max** (CoA is vertical-only, same roof — ship one solar number) **OR** build a `max_coa_buildable_footprint_sqm` that models reduced-setback variances (new modeling work; validate against whether local CoA variances actually expand footprint). Everything else is decided.

**This stays distinct from the permit/CoA cost model**: no permit, no declared cost, no Liar's Gate, no allocation matrix — just the pure trade-index applied to lot-driven scenario areas, ready for the lead cost model to select from.

---

## 10. Phase B-0 update (2026-06-29) — `opt_coa` input status + family-aware read folded INTO this epic

A norms-layer investigation (full writeup: `docs/reports/norms-layer-data-quality-audit.md` §"Phase B-0") settled three things that change this epic's scope:

1. **`opt_coa_gfa` (the #2 CoA-build input) is good-enough but under-counts the detached upside ~14%.** Head-to-head on 255,039 detached parcels: current median 359 m² vs realized-detached-FSI-p90 448 m² (0.86×); **39% are >25% under**. So the CoA-build cost line is conservative today — usable, but improvable.

2. **The data killed the elaborate models** we'd circled: 3-way per-pocket family segmentation is **not viable** (only `detached` has per-pocket data; townhouse marginal, multiplex garbage); per-pocket "build OUT vs UP" is a **lot-size artifact**, not real; the CoA density increment is **not extractable** (CoA builds are *smaller*, not bigger); `permits.storeys` is dead (all 0). → **Solar-CoA == Solar-Max stands** (CoA does not expand footprint — confirmed, not just assumed). The §4.9 / §8.1 "open" solar-CoA question is now **closed: no `max_coa_buildable_footprint_sqm`; Solar-CoA = Solar-Max.**

3. **Two refinements are folded INTO this epic** (built once, against their real consumer = the cost model, validated against cost/build ground-truth, and required anyway for the type-specific reno menu):
   - **(R1) Family-aware READ** — each parcel reads its OWN type's norm: `detached` parcels → the detached norm (per-pocket where ≥5 sample, citywide detached fallback); `townhouse` → citywide townhouse norm; multiplex/other → citywide-or-out-of-scope. This is what makes the per-parcel reno menu type-specific (a detached lot gets house renos, not townhouse-stack renos — the user's requirement). **Plumbing cost is real**: it needs `structure_family` on the norm tables + ONE shared family-aware accessor + updating the ~9 hand-rolled consumers (the consumer map: `enrich-parcels` max-build LATERAL + opt-config CROSS-JOIN, `compute-build-norms` storey join, the `_citywide_singleton` partial indexes, the `UNIQUE(neighbourhood_id)` constraints, 4 DB tests). The data makes the *model* simple (one rich family + citywide others); it does NOT make the plumbing cheap.
   - **(R2) Detached-grounded `opt_coa`** — ground the CoA tier in the clean realized **detached** FSI (p90 for CoA, p50 for as-of-right), **bounded by the coverage cap** so the lot-size confound (constant-ish ~380 m² house size means naïve `FSI×lot` over-states big lots) doesn't re-appear. Validate against realized detached GFA, not just FSI percentiles.

**Why fold rather than do now:** `opt_coa` post apartment-fix (`4243076`) + the 2.5-storey parse fix (`11abc7d`) is clean enough to use as the FB-ceiling input today. R1/R2 are a real-but-modest refinement whose value is only *realized* through this cost model + reno menu, and whose family-aware read this epic needs regardless. Doing it here = "design once, against the consumer" (the same principle that correctly deferred the standalone "A2" segmentation, which a 4-reviewer panel showed breaks ~8 consumers for a signal the data doesn't support).

**→ The cost-model epic plan MUST include R1 (family-aware norm read + the single accessor + the ~9-consumer migration) and R2 (detached-grounded `opt_coa`, coverage-bounded).** These are not optional add-ons; the type-specific reno menu depends on R1.

---

## 11. Tier-1 cost calibration (2026-06-29) — the rates are NOT trustworthy for renos

Compared the model's bottom-up $/ft² (`Σ(base_rate × structure_complexity)` over each archetype's trades) against (a) internal permit **declared** cost (`est_const_cost ÷ residential_sqm`, 110K permits — a *floor*, understated ~2× by Liar's-Gate effect) and (b) **external Toronto industry benchmarks** (2025-26 contractor/cost-guide data).

| Archetype | model $/ft² | Toronto industry $/ft² | declared $/ft² | correction | direction |
|---|---|---|---|---|---|
| **FB** new build | 327 | **400–650** | 153 (low) | ×1.3–1.5 | under |
| **ADD** addition | 287 | 300–500 | 208 (low) | ×1.1–1.5 | slightly under |
| **LANE** suite | 327 | **450–600** | — | ×1.5–1.8 | under |
| **INT** gut reno | 117 | **200–400** | 274 | **×2–3** | under (big) |
| **BAS** basement finish | 209 | **45–95** | — | **×0.35** | **OVER (big)** |
| **GAR** garage (Toronto) | 132 | **150–208** | — | ×1.3–1.5 | under |
| **KIT** kitchen | 93 | **250–400** /ft² of kitchen | — | **×3–4** | under (huge, product-driven) |
| **BTH** bath | 95 | 100–200 /ft² of bath | — | ×1.5–2 | under |
| **BAS-UNDERPIN** (new) | — | **80–200** (~105 finished shell) | — | new archetype | — |

**Verdict — the single new-construction rate set cannot serve the 13 reno types.** Corrections range from **×0.35** (basement finish over-counted ~3×) to **×3–4** (kitchen under-counted, because product-heavy trades are grossly under-rated: `millwork-cabinetry` $5.5/ft², `stone-countertops` $2.5/ft², when cabinets+stone alone are $100–200/ft² of a kitchen). The new-construction archetypes (FB/ADD/LANE) are closest (model slightly low vs the $400–650 industry range; declared understates, confirming the model isn't over-stated). Renos are the problem.

**What the cost-model plan MUST therefore include (Tier-1 requirements):**
1. **Per-archetype calibration** — a reno-intensity factor (or recalibrated rate set) per archetype, anchored to these benchmarks. NOT one rate applied to all.
2. **Product-cost integration for KIT/BTH** — the kitchen/bath under-count is *product*-driven (cabinets/appliances/stone). The fix is real product economics (R3, Tier 2), not a blanket multiplier — products dominate those archetypes. (The product taxonomy exists via `trade_products`; product *costs* are net-new — no `products` table, Spec 87 is supplier-side only.)
3. **Detached → `structure_complexity_factor = 1.0`** — the seeded ×1.3–1.4 bakes in *multi-unit* complexity; applied to a detached house it over-counts ~20% (confirms the user's structure-complexity instinct).
4. **New `BAS-UNDERPIN` archetype** (~$105–150/ft² finished shell) — distinct from the over-counted plain `BAS`.
5. **Fill the missing trade rates** — `site-preparation`, `site-maintenance`, `overhead-doors` have no row → silently $0.

**Calibration sources (Toronto, 2025-26):** kitchen [905reno](https://905reno.ca/kitchen-renovation-cost-in-2025-toronto-gta-homeowners-guide/), [Rocpal](https://www.rocpal.com/real-cost-kitchen-renovations-toronto); bath [EasyRenovation](https://easyrenovation.ca/bathroom-renovation-cost-toronto/), [HomeStars](https://www.homestars.com/bathroom-sanitary/price-guides/bathroom-renovation-cost-toronto); basement finish [TrueForm](https://www.trueformreno.com/basement-renovations-costs-in-toronto-2025-a-comprehensive-guide/), [Harmony](https://harmonybasements.ca/basement-finishing-cost/); underpinning [StrongBasements](https://strongbasements.com/basement-underpinning-cost-toronto-calculator/), [NuSite](https://nusitegroup.com/how-much-does-basement-lowering-cost/); gut [Rocpal](https://www.rocpal.com/cost-gut-renovate-house-toronto), [Habitual Homes](https://habitualhomes.ca/full-gut-renovation-toronto/how-much-does-a-full-house-renovation-cost-in-toronto/); suite [DavidReno](https://davidreno.ca/2025-cost-guide-building-a-legal-laneway-or-garden-suite-in-toronto-david-reno/), [BVM](https://www.bvmcontracting.com/blog/garden-suite-cost-calculator); garage [TGC](https://torontogeneralcontractors.com/blog/cost-to-build-garage-addition-toronto), [Trusscore](https://trusscore.com/blog/how-much-does-it-cost-to-build-a-garage.html); new build [Xavieras](https://xavieras.ca/2025-custom-home-building-costs/), [Woodcastle](https://woodcastlehomes.ca/how-much-does-it-cost-to-build-a-custom-home-in-toronto-in-2025/).

---

## 12. DECIDED DESIGN (2026-06-29) — top-down industry $/ft², allocated to trades/products (supersedes §3 build-up)

**The model is flipped to top-down** (user-decided, and it dissolves the Tier-11 miscalibration at the root):

```
total_cost(archetype) = INDUSTRY_$/ft²(archetype)  ×  area(geom_basis)  ×  neighbourhood_cost_premium
trade/product breakdown = ALLOCATE total_cost across the archetype's trades (+ products) by a % split
```

- **One decent EXTERNAL industry $/ft² per reno type** is the cost anchor — NOT a sum of 32 guessed trade rates. The per-trade/per-product numbers become a **transparent allocation of a real total** (still feeds the breakdown + the Spec 87 supplier-audience model).
- **EXTERNAL DATA ONLY — Buildo permit data (`est_const_cost`) is NEVER a cost source** (it's declared/understated ~2×; used once as a floor sanity-check, never as input).
- **Neighbourhood premium IS included** — `parcels.neighbourhood_cost_premium` (1.00–1.85, census-income-based, already computed, external). Final multiplier.

### The per-archetype industry $/ft² table (Toronto 2025-26; lock with 1-2 more sources before build)
| # | Reno line | archetype | area field (`geom_basis`) | industry $/ft² | basis |
|---|---|---|---|---|---|
| 1 | Max build | FB | `max_buildable_gfa_sqm` | **$450** (400–650) | new custom home |
| 2 | **CoA max build** | FB | **`opt_coa_gfa_sqm` (R2-refined)** | **$450** | new build, larger area |
| 3 | Solar — max build | SOLAR | `max_buildable_footprint_sqm` (roof) | **~$35/ft² roof** (from $3/W × ~12 W/ft² eff.; rebate ≤$5k) | per-watt |
| 4 | Solar — CoA build | SOLAR | = #3 (same roof) | **= Solar-Max** | confirmed |
| 5 | Garden suite | LANE | `max_garden_suite_gfa_sqm` | **$500** (450–600) | suite |
| 6 | Laneway suite | LANE | `max_laneway_suite_gfa_sqm` | **$525** (450–600) | suite |
| 7 | Kitchen reno | KIT | `cur_est_kitchen_gfa_sqm` | **$325** (250–400) | kitchen |
| 8 | Bathroom reno | BTH | `cur_est_bath_gfa_sqm` | **$400** (300–600; total $15–40k) | bath |
| 9 | Separate garage | GAR | `max_garage_gfa_sqm` | **$180** (150–208) | Toronto garage |
| 10 | Basement underpinning | **BAS-UNDERPIN** (new) | `cur_floor_gfa_sqm` | **$150** (105–200) | underpinning = finish + structural lowering |
| 11 | Basement reno (no underpin) | BAS | `cur_floor_gfa_sqm` | **$70** (45–95) | **= a regular interior finish** |
| 12 | Gut job | INT | `cur_pot_2story_gfa_sqm` | **$300** (200–400) | gut (keeps shell) |
| 13 | Addition + storey | ADD | `cur_floor_gfa_sqm` (one added storey) | **$400** (300–500) | ≈ new build for the added area |

(Units: store $/m² internally for parity; the table is $/ft² for readability — × 10.764 for $/m².)

### Rate freshness — keeping industry $/ft² current over time (DECIDED)
The per-archetype $/ft² rates are **external** and drift, so:
- Store in a **tunable `archetype_cost_rates` table** (row per archetype) with `source` + `as_of_date` — control-panel editable (Spec 86), no deploy.
- **Annual manual recalibration** from the benchmark sources (Altus Cost Guide + contractor guides).
- **Quarterly auto-escalation** between recalibrations via **StatCan Building Construction Price Index (Toronto CMA)**: `effective = base × (index_now ÷ index_at_calibration)`.
- **Staleness audit row (WARN)** when rates older than N months.
- Neighbourhood premium = census-income-based → refreshes on census cadence (separate).

### LOCKED — CoA-max-build changes (R1 + R2) + type-aware comparables (R4)
These are **decided epic scope**, not open:
- **R2 — CoA-build area (`opt_coa_gfa_sqm`) is refined to be detached-grounded.** Current `opt_coa_gfa` under-counts the detached CoA upside ~14% (median 359 vs realized 448 m²; 39% >25% under — §10/audit). Refine it to the clean realized **detached** FSI (p90 for CoA / p50 for as-of-right), **bounded by the coverage cap** (so the constant-house-size lot confound doesn't over-state big lots). Validated vs realized detached GFA, not FSI percentiles. → CoA-build cost = **$450/ft² × `opt_coa_gfa`(R2) × premium**.
- **R1 — family-aware READ** (each parcel reads its own type's norm: detached per-pocket, townhouse/others citywide) — required so the reno menu + `opt_coa` are type-specific (a detached lot gets house renos/norms). Needs `structure_family` + the ONE shared accessor + the ~9-consumer migration (consumer map in §"Phase B-0" of the audit).
- **Solar-CoA == Solar-Max** (no CoA footprint expansion — data-confirmed). Closed.
- **R4 — type-aware comparables (NEW scope item).** The `nearby_builds_summary` becomes type-specific via R1. But the named `comparable_builds` kNN currently filters on **`zoning_class` + lot/frontage ±20%**, NOT the built structure family (`enrich-parcels.js` `buildCompCandidatesSql` — candidate carries `work_type`/`storeys`/`gfa` but not `structure_type`). Zoning is a strong proxy, but to **guarantee** "a detached lot shows detached examples" (excluding semis/duplexes/stacked on the same zoning), add `structure_type` to the comp candidate set + filter the kNN by the subject parcel's family. Small, focused extension of the family-aware work.

### Tier 3 — coverage (DONE 2026-06-30): the menu is deliverable
Across 379,905 residential parcels (RD/RS/RT/R): Max build 97.2%, CoA build 96.5%, Solar 97.2%; the five current-home lines (kitchen/bath/basement/gut/addition, all from the `cur_*` footprint-derived fields) 91.2%; premium 100%. Fit-gated lines are correctly lower — garden suite 64.5% (usable rear yard), laneway 4.8% (lane-abutting only), garage 43.2% (rear-yard room). **No line is NULL from a data gap**; the fit-gated lines are honest "doesn't fit here" cases; the ~9% missing on current-home lines = parcels with no linked building (vacant/mislinked → no current home to reno).
- **Confidence-band requirement:** the 5 current-home lines take *area* from the **imagery roof footprint (±20–38%)** → **medium/low** band; the lot-driven lines (max/CoA build, suite, garage) take area from the validated lot envelope → **high** band. The cost menu must carry this per-line.

### Still open (before the WF1 plan)
- **Tier 2 — the allocation % split** per archetype (trades + products), product-aware for KIT/BTH (cabinets/stone/appliances dominate); needs the net-new **product-cost dimension** (prices on the product hub, joined via `trade_products`).
- Lock the $/ft² table with 1–2 more sources (e.g. Altus Cost Guide) per archetype.

---

## 13. Final design refinements (2026-06-30, user-confirmed)

**Footprint capped → CoA upside goes to stories (GFA is the key).** The footprint is capped at the max-build as-of-right coverage. The CoA build uses that *same* capped footprint, so realized-FSI density above as-of-right is achieved by **more storeys**, not a bigger footprint ("up, not out" — now a hard mechanism, not just an observation). Therefore for the CoA build:
- **GFA = `realized_fsi_p90 × lot`** — the SOLID, priced quantity (CoA-build cost = GFA × $/ft² × premium).
- **footprint = `max_buildable_footprint`** — capped/known (shared with max-build).
- **stories = DERIVED** (`GFA ÷ footprint`) — illustrative, low-confidence (can exceed `storeys_p90`).
- **Authoritative CoA output = GFA + `coa_fsi`**; footprint/stories are reference-only.
- This **well-founds Solar-CoA = Solar-Max** (footprint genuinely capped → same roof). **Known limitation:** the model does NOT capture footprint-*expanding* CoAs (reduced-setback/coverage variances) — a future investigation (parse CoA decisions for coverage/setback relief) could, but needs clean variance data we don't have.

**FSI fields exposed + propagated** (symmetric, per "propagate all enrich fields"): `max_build_fsi` (= `max_buildable_gfa_sqm ÷ lot` — the by-law/geometry envelope density), `coa_fsi` (= `realized_fsi_p90` — the realized market density), `realized_fsi_p90` — all flat parcel scalars propagated to permits/coa via `COST_PROP_COLS`/§4D. Gives a lead a legible "by-law max FSI → realized CoA FSI" density story.

**`area_confidence` (renamed from `confidence`):** the band represents **floor-AREA certainty** (driven by the imagery-footprint reliability ±20–38%), **NOT a price range.** Report/menu wording must state this so an outsider reads "low" as "we're unsure of the square footage," not "the price is volatile." Lot-driven lines (max/CoA build, suite, garage, solar) = high; `cur_floor`/kitchen/bath = medium; gut (footprint ×2 fixed-storey assumption) = low.

---

### Appendix — confirmations against source
- `scripts/lib/archetypes.js:226–238` — `ARCHETYPE_GEOM_BASIS` (FB→max_buildable_gfa_sqm, ADD/BAS→cur_floor_gfa_sqm, INT→cur_pot_2story_gfa_sqm, KIT/BTH→cur_est_*, LANE→max_rear_suite_gfa_sqm, GAR→max_garage_gfa_sqm, ENV/MEC/SITE→null).
- `scripts/lib/archetypes.js:31–119` — `ARCHETYPE_BUNDLES` trade sets (FB=32 incl. solar+elevator; ADD=26; BAS=18; INT=13; KIT=10; BTH=11; GAR=12).
- `src/features/leads/lib/cost-model-shared.js:299, 312–322` — `Trade Value = areaEff(m²) × base_rate_sqft × structure_complexity_factor × premium` (unit-name caveat §3).
- migration 096 — `trade_sqft_rates` (32 trades) + `scope_intensity_matrix` (permit-only).
- Spec 80 §5.B.2 — `solar` id 28 `per_unit`, basement-underpinning deferred; `cost_basis` variants Phase 4.
- Spec 78 / `opt_coa_gfa_sqm`, `max_newbuild_coa_gfa_sqm` — CoA-upside fields.
