# Massing Footprint Reliability Investigation — and a Proposed Path Forward

**Date:** 2026-06-25
**Status:** Findings + direction. **No spec or code changes made** (per decision to settle on a path forward first).
**Scope:** Reliability of the 3D-Massing-derived `existing_*` footprint fields on `parcels` (Spec 65 §5), validated against architectural plans, the by-law coverage cap, and the lot-driven max-build envelope. Concludes with an examination of pivoting the parcels product to an **optimal lot configuration** model.
**Source data:** live dev DB rebuilt 2026-06-10 (486,530 parcels; 437,281 residential). All figures below are from that DB.

---

## 1. Executive summary

- **Max-build is reliable; the massing footprint is not.** On a clean cohort of built new homes, the median ratio `max_buildable_footprint ÷ legal coverage cap = 1.00` — max-build is exactly the lot × coverage ceiling and is lot-driven (and the lot is accurate). The massing-derived `existing_footprint_sqm` is ~40% noisier (coverage-ratio CV 0.359 vs 0.253) and **33% of new-build massing footprints exceed the legal coverage cap** — physically impossible for a compliant build, i.e. over-capture.
- **Per-parcel footprint error is roughly ±20%, in both directions**, driven by roof/eave overhang, tree canopy, and occlusion — *not* by dataset vintage.
- **Height/storeys is severely tree-contaminated** (47% of detached houses tagged ≥4 storeys; heights to 121.9 m) — already correctly retired (`existing_stories`/`existing_height_m` NULL).
- **The 3D Massing dataset models principal building masses only** — it omits accessory structures (garden suites, sheds, detached garages), so the rear-yard "greenspace" is overstated and garden/laneway/garage "fits" are systematic false positives.
- **Permit/CoA data cannot supply a footprint number** (no footprint/GFA field; `storeys` is all 0; CoA coverage figures appear in ~1% of records, almost all towers). It is useful as a **classifier** (build type/recency, CoA-variance) and for **accessory-structure detection**, but reaches only ~10–15% of residential parcels.
- **Four concrete defects** were found (detailed in §6): a phantom sub-one-car garage, a width/length projection bug (+7% citywide), the invisible-accessory greenspace overstatement, and no stored massing capture-date.
- **Recommended direction (§8):** pivot the headline parcels product from "measure the existing structure" to **"optimal build configuration for the lot"** — a purely lot-driven (reliable) model that sidesteps the massing-accuracy problem entirely, demoting existing-structure/reno scenarios to a clearly-flagged soft secondary track.

---

## 2. How the footprint is computed (current behaviour)

Per `scripts/enrich-parcels.js` (Spec 65 §5 existing-structure pass):

- `existing_footprint_sqm = SUM(building_footprints.footprint_area_sqm) FILTER (WHERE pb.is_primary)` (lines 422 / 705 / 734) — i.e. the **pre-stored polygon area** of the primary linked building, *not* recomputed at enrich time. Verified equal to `ST_Area` of the polygon (geodesic).
- `existing_width_m` / `existing_length_m` = the short/long sides of `ST_OrientedEnvelope(primary_geom)` (lines 717–741), measured geodesically **but computed on the SRID-4326 (lat/long degree) geometry** — see the projection bug in §6.
- `max_buildable_footprint_sqm = LEAST(buffer_area, setback_box_area, coverage_cap)`. For the Derwyn lots the **coverage cap is binding** (114.5 m² = 327 m² × 35%).
- Source dataset: Toronto Open Data **3D Massing**, `3dmassingshapefile_2025_wgs84.zip` (Spec 56; `scripts/load-massing.js`).

---

## 3. Ground-truth check — Derwyn Road (architectural plans supplied by owner)

All five lots are identical 327 m² RD lots (9.8 m × 33.6 m = 32 × 110 ft, **matching plans exactly**), max-build 114.5 m², neighbourhood 98/111, premium 1.35×, no ravine, no heritage.

| Address | Type | Plan footprint | Massing footprint | Error | Likely cause |
|---|---|---|---|---|---|
| 37 Derwyn | 2-storey new build | — (owner: accurate) | 93.0 m² (1,001 sq ft) | ~0% ✅ | — |
| 41 Derwyn | 2-storey new build (2015, via CoA) | 22.2 × 47 ft ≈ 96.9 m² | 84.3 m² (907 sq ft) | **−13%** | occlusion / under-capture |
| 43 Derwyn | bungalow | 22 × 35 ft = 71.5 m² | 85.4 m² (919 sq ft) | **+19%** | canopy / eave over-capture |
| 45 Derwyn | bungalow (+ deck) | — | 101.2 m² (1,089 sq ft) | likely over | canopy / eave / deck |

**Direction of error is not consistent** (41 under, 43 over) — the signature of photogrammetry occlusion + canopy noise, not a single correctable bias.

Notes:
- 41 Derwyn's existing **garden suite is absent** from `building_footprints` (only 1 polygon in the lot = the primary house). 41 also has **no permit and no CoA record** in our data — so neither massing nor permit/CoA can see its rear suite.
- 41's `existing_width_m × existing_length_m` stored as 7.35 × 12.68 m; projection-corrected (EPSG:2952) = 7.28 × 11.71 m — the stored **length is ~1 m (8%) inflated** (projection bug, §6).

---

## 4. Scale validation

### 4.1 Footprint vs the legal coverage cap (new-build detached, n = 20,457)
- Median footprint/lot coverage = **0.251** (sane in aggregate).
- **29.0%** of massing footprints **exceed the by-law coverage cap** — impossible for a compliant new build → over-capture.

### 4.2 Height/storey contamination (new-build detached, n = 32,267 — real, code-compliant houses)
| Metric | Value |
|---|---|
| `max_height_m` median / p90 / p99 / max | 10.2 / 17.9 / 25.8 / **121.9 m** |
| > 12 m (implausible for a detached house) | **34.8%** |
| massing `estimated_stories` ≥ 4 | **47.2%** |
| permit-declared `storeys` | **0 for all rows** (field never populated) |

Conclusion: height is badly tree-contaminated; correctly retired already.

### 4.3 Max-build calibration (clean cohort: built [status=Inspection], issued < 2023, high-confidence RD detached, not mislinked, n = 7,998)
| Measure | Result | Interpretation |
|---|---|---|
| median `max_build ÷ legal coverage cap` | **1.00** | max-build *is* the lot × coverage ceiling — reliable |
| median `massing ÷ legal coverage cap` | **0.84** | people build *below* the footprint ceiling (go up, not out) |
| massing footprint over legal cap | **33.4%** | over-capture bad data |
| coverage-ratio variability (same lots) | massing **CV 0.359** vs max-build **CV 0.253** | massing ~40% noisier |
| ratio `massing ÷ max_build`: p25 / median / p75 | 0.64 / 0.91 / 1.19 | wide; bimodal |
| built within 10% of max (≥0.90) | 50.8% (only **17.5%** legally) | ~26% truly maxed, ~74% built below (of believable rows) |

The unfiltered new-build cohort (n = 24,734, pollution included) was wider still (ratio p10/p50/p90 = 0.43/0.82/1.89). Restricting to genuinely-built permits helped at the margin (median 0.82 → 0.88, worst tail 1.89 → 1.54), confirming unbuilt-permit pollution was real but **not** the main driver — the residual spread is massing noise + build-up-not-out behaviour.

---

## 5. Dataset vintage

- We use the **2025 annual snapshot** (`3DMassingShapefile_2025`), last refreshed by Toronto **2025-12-02 / 12-05** (CKAN `package_show`).
- **Toronto does not publish the underlying aerial capture/flight date** — resources are labelled only by release year (annual snapshots exist 2016 → 2025). The true "photo date" is unknowable from the source.
- **We store no capture date either** — `building_footprints` has no vintage column; `created_at` is the dev-rebuild ingest timestamp. Traceability gap (§6 ④).
- Implication: the 2025 snapshot should contain every new build we tested (issued < 2023), so **vintage is not the explanation** for the footprint disagreement.
- Opportunity: Toronto's annual snapshots (2016→2025) could be diffed to date when each building appeared (catching demolish-rebuilds and possibly accessory structures) — a future signal source.

---

## 6. Concrete defects found (recorded, not yet fixed)

1. **🔴 Phantom sub-one-car garage.** The garage fit floor `GARAGE_MIN_FOOTPRINT_SQM = 18` sits below the per-car footprint `CAR_FOOTPRINT_SQM = 18.5`, so an 18.0–18.5 m² garage passes the gate but yields `garage_capacity_cars = 0`. **46,598 parcels have a 0-car garage marked `as_of_right`** (44,837 below 18 m²). Live examples: 39 Derwyn (18.4 m² → 0 cars), 45 Derwyn (17.5 m² → 0 cars). Fix: raise the fit floor to ≥ one-car footprint.
2. **🔴 Oriented-envelope projection bug.** `existing_width_m`/`existing_length_m` are derived from `ST_OrientedEnvelope` on the **un-projected SRID-4326 (degree) geometry**, distorting the rectangle at Toronto's latitude. Systematic across a 272-parcel sample: **length +1.16 m (+7.3%)**, width +0.32 m. Area is unaffected (it uses the stored polygon area). Fix: `ST_OrientedEnvelope(ST_Transform(geom, 2952))`.
3. **🔴 Invisible accessory structures → greenspace overstatement.** 3D Massing captures principal masses only, so `existing_other_structures_count` is structurally ~0 for accessory buildings; `existing_greenspace` treats the full rear yard as empty → garden/laneway/garage "fits" are systematic false positives (41 Derwyn: offered a garden suite though it already has one). Not a math bug — incomplete inputs. Mitigations: permit/CoA accessory detection (§7) for the covered minority; otherwise downgrade these from `as_of_right` to "potential — requires site verification."
4. **⚠️ No massing capture-date stored** — traceability gap (§5).

Severity/lessons routing to be decided alongside the path-forward decision.

---

## 7. Can permit/CoA data give us the footprint?

**A direct number — No.** No footprint/GFA field; `storeys` all 0; CoA coverage/GFA in only ~1% of descriptions (330/33,280, almost all towers — house figures live in external staff reports we don't ingest). `est_const_cost` (40% of new builds, median $411K) → GFA is too noisy and circular for cost work.

**Indirect / approximate — Yes, but as a classifier and only for the permit-covered minority:**

| Permit/CoA signal | Parcels | % of residential | Use |
|---|---|---|---|
| new_build permit | 9,678 | 2.2% | apply new-build build-ratio (better than massing) |
| addition | 22,080 | 5.0% | footprint grew (original + addition) |
| renovation | 20,444 | 4.7% | scope signal |
| garage in permit text | 12,111 | 2.8% | existing garage → fix greenspace/fits |
| deck in permit text | 10,064 | 2.3% | existing deck |
| rear/laneway-suite permit (native `structure_type`) | ~4,900 | ~1% | existing rear suite → suppress suite offer |

(A broader `rear_suite_type IS NOT NULL` match returned 39,268 parcels but likely includes our own enriched field — **provenance to verify** before use.)

Three usable functions: (1) build recency/type → which footprint estimate to trust; (2) CoA presence → build maximized (near/over as-of-right); (3) accessory detection → repair the false-positive suite/garage offers (highest value). **Caveat:** ~85–90% of houses have no permit at all, and the parcels that most need correction (older/unpermitted, like 41 Derwyn) often have no permit trail — so permit/CoA is a refinement for the covered minority, **not a universal footprint source.**

### 7.1 Experiment — estimate footprint from `max_build × build-ratio`
Using the clean-cohort ratio on 41 Derwyn (max-build 114.5; plan ≈ 96.9):
- × 0.91 (raw median) = **103.9 m²** (+7% vs plan) — closer than massing's 84.3 (−13%)
- × 0.73 (de-noised) = 83.5 m²
- **Blend (massing 84.3 + max-build×0.91 103.9)/2 = ≈ 94 m² (−3% vs plan)** — the two independent errors partly cancel.

Promising as a **de-noiser toward a typical value**, but (a) the ratio is calibrated *on* noisy massing so it inherits the over-capture bias — it should be re-calibrated against **plan/survey ground truth**; and (b) build behaviour is bimodal (~26% max out, ~74% build modestly), so per-parcel uncertainty stays ±30%. Not a precise per-house number; useful only as a banded estimate or blended with massing.

---

## 8. Proposed path forward — "Optimal Lot Configuration" (examination, not yet a spec)

**Reframe:** stop trying to measure the existing structure as the headline; instead model **the optimal build for the lot, clean-slate.** This rests entirely on the reliable, lot-driven inputs (lot size, zoning, coverage, FSI, setbacks → max-build, validated at median 1.00) and removes the massing dependency from the main product. Existing-structure/reno scenarios demote to a clearly-flagged soft secondary track.

### 8.1 The model: a budget-allocation problem
Each lot provides budgets; each component spends from them:

| Component | Coverage | FSI/GFA | Rear-yard depth | Soft-landscaping floor | Roof |
|---|---|---|---|---|---|
| Main build (incl. **integral** garage) | ✔ primary | ✔ primary | ✔ (length) | — | — |
| Garden/laneway suite (ARU) | ✔ separate cap | ✔ | ✔✔ competes | spends | — |
| Deck | mostly exempt | — | ✔ | spends | — |
| Pool | exempt | — | ✔ | spends | — |
| Detached garage (lane lots only) | ✔ | ✔ | ✔ competes | spends | — |
| Solar | — | — | — | — | ✔ only |

The product question becomes: **how to allocate rear-yard depth + coverage/FSI across components to maximize value (units / GFA / $)**, output as (a) the optimal as-of-right configuration and (b) a CoA-upside configuration (≈21% of lots are already "market-exceeds-bylaw" hotspots).

### 8.2 Answers to the design questions
- **Garden suite + max build:** coexist, but **compete for rear-yard depth** — a max-length main house can eliminate the suite. The optimal is often a *shorter main house + garden suite* (more total GFA + an extra unit). This trade-off is the core optimization.
- **Deck + max build:** almost always compatible (uncovered/low decks are typically coverage-exempt; spend soft-landscaping, not building coverage).
- **Solar + max build:** always compatible — a roof overlay, orthogonal to every footprint/yard budget.
- **Garage:** **integral to the new build** (inside coverage/FSI), not a separate accessory. Drop the detached-garage-accessory frame except for laneway-access lots (39 Derwyn's own CoA: "new two-storey detached dwelling with an integral garage").

### 8.3 What must be verified before any spec/code (spec-first)
The combination rules are by-law specifics and **must not be hardcoded from assumption** — pull from **Toronto Zoning By-law 569-2013** and reconcile with current Spec 65 constants (several of which are placeholders):
- ARU (garden/laneway suite) max sizes — current flat 60/120 m² caps are placeholders.
- Main-house-to-suite **separation distance** and rear-yard setbacks.
- **Soft-landscaping minimum %** — current 30% floor is a placeholder.
- Deck/pool **coverage carve-outs**; solar **height-projection** allowances.
- Whether detached garage + suite are mutually exclusive on a given lot.

### 8.4 Nearby builds as a reference (development comparables)
The theoretical by-law max-build says "you *could* build X." Comparable nearby builds say "your neighbours *actually* built Y, and got CoA for Z" — grounding the optimal config in **realized outcomes**, not just the legal ceiling. Two functions:

1. **Localised build-ratio calibration.** The citywide RD build-ratio (massing ÷ max-build) is 0.84–0.91; for neighbourhood 98 it is **0.81** — tighter and lower. Going finer (street/block) sharpens the "what people actually build here" prior far better than a citywide constant, and it sidesteps the per-parcel massing noise by aggregating.
2. **Feasibility / demand signal.** Teardown-rebuild rate, suite-adoption rate, and CoA approval rate (with the *variance types* granted — coverage, FSI, height) tell us which optimal-config tier is realistic on this block, and de-risk the CoA-upside tier.

**Existing infrastructure to build on:** `neighbourhood_storey_norms` (p50/p90 storeys from nearby new-build permits, WF3-C1) and `market_exceeds_bylaw` already encode part of this — they are the seed of a comps engine.

**Worked example — Derwyn Road / Neighbourhood 98:**
- *Street comp set:* 24 additions + 6 new builds; CoA 6 approved / 1 refused / 1 pending, typed `NewConstruction|Mixed / SFD - Detached`. → an active bungalow-to-2/3-storey redevelopment street, mostly CoA-approved.
- *Neighbourhood 98:* 2,868 residential parcels; storey norm p50 = 2 / p90 = 3; 61 parcels with a new-build permit, 11 with a rear-suite permit, 438 with any permit; new-build footprint/max-build median **0.81** (n = 229).
- *For 41 Derwyn,* the comp story — *"this block is being rebuilt as 2–3 storey detached homes with integral garages, frequently via CoA; nearby new builds use ~81% of the footprint ceiling"* — is far more actionable (and reliable) than its noisy individual footprint.

**5-year activity window (validated, surfaced on every enriched parcel).** A rolling 5-year window of nearby permits + CoA decisions is fully available and summarizable per neighbourhood — e.g. **nbhd 98 (last 5 yrs): 135 new-build permits, 179 additions, 109 renovations; CoA 143 approved / 7 refused / 3 deferred = ~95% approval rate.** Coverage is near-complete: **157 of 158 neighbourhoods** have ≥1 new-build permit in the window. This is the headline grounding written onto the parcel: *what is being built nearby, and how reliably the CoA grants variances* — the latter directly de-risks the CoA-upside tier.

**Design sketch:** per lot, aggregate nearby permits/CoA (5-year window; street → block → neighbourhood fallback) into: realized storeys, footprint-ratio, GFA, unit counts, suite-adoption rate, build-type mix, and **CoA decision counts + approval rate**. Feed both the as-of-right and CoA-upside tiers, localise the build-ratio prior, and surface the summary on the enriched parcel.

**Caveats:** comps are thin in low-activity pockets (fall back neighbourhood → citywide); permit/CoA coverage limits apply (~10–15% of parcels); the peer-group radius (street vs block vs neighbourhood) needs care; and CoA records over-represent maximizers (selection bias — they skew the ratio upward).

### 8.5 CoA-upside — what changes (storeys, not footprint)
The CoA-upside tier increases **storeys/GFA**, **not the footprint**. Realized data (new-build detached, built, split by whether the lot went to CoA; footprint ÷ as-of-right coverage cap):

| Went to CoA? | n | median fp/cap | p90 | over cap |
|---|---|---|---|---|
| No | 7,882 | 0.86 | 1.34 | 37% |
| Yes | 4,841 | **0.73** | 1.08 | 17% |

CoA builds use a **smaller** footprint, not a larger one — people who go to CoA build **up (storeys/FSI), not out**. So:
- **CoA-upside footprint = the as-of-right coverage cap** (the reliable default — matches realized behaviour and is already the by-law footprint ceiling).
- **CoA-upside grows via storeys** (neighbourhood p90, permit-derived → reliable) and the rear suite.
- A footprint/coverage variance is legally possible but is the *less common* lever and **cannot be measured from our data** (the "over cap" figures are dominated by massing over-capture noise, not genuine coverage variances). It belongs as a separate **low-confidence "possible"** flag, not in the headline number — unless we parse CoA *decision* documents (external) for the granted coverage %.

Caveat: the CoA↔parcel link (`zoning_dominant_parcel_id`) is imperfect and many CoAs are non-coverage; the exact 0.73 is indicative, but the direction (CoA ≠ bigger footprint) is unambiguous.

---

## 9. Open decisions

1. **Adopt the optimal-config pivot?** If yes → a WF1 (Genesis) for an "Optimal Lot Configuration" spec, beginning with by-law rule extraction.
2. **Fix the two clean defects now** (garage one-car floor; oriented-envelope projection) regardless of direction? Both are small, isolated, and improve correctness independent of the pivot.
3. **Accessory detection from permits** — build it as the mitigation for the false-positive suite/garage offers on the covered minority?
4. **Plan-calibrated footprint estimator** — seed a ground-truth set (the Derwyn plans + more) to re-calibrate the build-ratio off survey truth rather than massing?
5. **Existing-structure honesty in the interim** — downgrade massing-derived suite/garage from `as_of_right` to "potential — requires verification" until the above lands?
6. **Development comparables (§8.4)** — build the nearby-builds reference engine on top of `neighbourhood_storey_norms`, and use it to localise the build-ratio and de-risk the CoA-upside tier?

---

## 10. Follow-up findings — external sources & permit data as ground truth (2026-06-25)

### 10.1 External footprint sources evaluated — none beat permit FSI/coverage
Tested against the Derwyn ground-truth plans (41 plan 96.9 m²; 39 actual 150 m² via permit coverage 46%):

| Source | 41 Derwyn | 39 Derwyn | Verdict |
|---|---|---|---|
| Massing (City 3D) | 84.3 (−13%) | 98 (−35%) | unreliable |
| OpenStreetMap | 84.4 | 98 | = City data (Toronto import) — no independent value |
| Google Geocoding "Building Outlines" | 116 | 134 | coarse 5-point *display* rectangle; over-states |
| Google Solar `groundArea` | 101 (+5%) | 93 (−38%) | good on simple builds, badly under-captures maximized/stepped |
| Google Solar `boundingBox` | 176 (+82%) | 161 (+7%) | axis-aligned rectangle; unreliable |
| **Permit coverage% / FSI** | **97 (FSI 0.59)** | **150 (cov 46%)** | **authoritative** |

Mechanism: rooftop-derived models capture the main pitched mass but miss lower/rear/walk-out sections + flat roofs → systematic under-capture on maximized builds (no overhang involved — Solar misses by 38% *with* no overhang). Bonus: Solar returns `imageryDate` (the capture date the City massing never published; Derwyn = 2021-09, HIGH). **Decision: don't adopt external imagery; keep massing as flagged fallback (position only).**

### 10.2 Permit data carries authoritative GFA — already in our feed, unused
Toronto "Building Permits – Active Permits" (CKAN `6d0229af-…`, `load-permits.js`, Spec 50/41) has occupancy floor-area columns we don't map: **`RESIDENTIAL` = residential GFA (m²)**, `INTERIOR_ALTERATIONS`, etc.
- `RESIDENTIAL` = new/added residential GFA: **new build = total; addition = the expansion delta; interior reno = empty.**
- **FSI derivable = `RESIDENTIAL ÷ lot_size`.** Footprint ≈ GFA ÷ storeys.
- Validated: 587 Northcliffe 225.5 m², laneway suite 70.9 m²; matches Derwyn MLS+plan FSI.
- Caveats: values only on the *principal* building row (trade rows blank → dedup); sparse + junk (`"DO NOT UPDATE…"` placeholders); Active window = recent builds only (39 has aged out).

### 10.3 Scale calibration (381 matched SFD-detached permits) — confirms the thesis
Permit FSI median **0.53** · permit GFA ÷ max-build GFA median **0.80** (**28%** exceed via variance) · permit-implied footprint ÷ massing median **1.08**, with **44%** under-captured by >15%. → max-build is a sound ceiling; massing under-captures the maximized builds; permit GFA is bulk ground truth.

### 10.4 FSI/coverage are NOT in any open dataset
CoA (30 fields) and Permits (32 fields) carry neither FSI nor coverage% — they exist only in building plans / CoA decision PDFs, reachable per-application via the City AIC portal (JS, blocks bots) → **on-inquiry scrape, not bulk.** Mostly unneeded: GFA+FSI come from `RESIDENTIAL`; only precise coverage%/footprint needs the plan.

### 10.5 `EST_CONST_COST` is unusable for value
Applicant-declared for permit fees → systematically understated (implied new-build ~$204/sqft, roughly half of real) and sparse/junk. **Renovation value must come from a market-rate $/m² model by work type × neighbourhood premium, cross-checked vs industry $/sqft — never declared cost.**

### 10.7 Addition-delta signal — existing reno homes sit far below max-build (massing-free)
186 matched SFD-detached **addition** permits: the addition delta is a *lower bound* on the pre-existing gap to max-build.
- **Addition delta ÷ max-build GFA: median 0.38** → reno-candidate homes sat **≥38% below max-build** (vs the ~20% gap for new builds).
- **Massing says existing = 82% of max-build** (only 18% below) — inconsistent; **only 30%** of these parcels had massing-room for the delta (`max-build − massing ≥ delta`).
- → **massing over-states existing GFA** (the `footprint × 2` storey assumption on 1–1.5-storey homes + footprint noise). Confirms: range the current structure *well* below max-build; don't trust massing size. (Pre-/post-addition timing muddies the exact reconciliation; the 38%-of-envelope figure is robust regardless.)

### 10.6 Existing footprint only gates interior-reno options
Envelope-changing options (new build, addition, laneway/garden suite, garage, deck, pool, solar) size off max-build / by-law → **no existing-footprint dependency.** Only interior-reno options (basement ± underpinning, 1-/2-floor gut, kitchen, bath) price off existing GFA = `footprint × storeys` (storeys known; footprint ±20%) → present as a **range**, flagged "refine on inquiry." So the footprint unreliability is a confidence band on one option-class, not a blocker.

---

*No specs or code have been changed. This report is the record pending the path-forward decision.*
