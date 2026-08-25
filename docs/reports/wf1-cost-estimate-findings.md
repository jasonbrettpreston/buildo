# WF1 Cost Estimate — Consolidated Findings Report

**Date:** 2026-05-24
**Scope:** End-to-end accuracy analysis of `cost_estimates` after the WF1 Spec 83 §3.A re-key
**Source investigations:**
- `docs/reports/wf1-cost-accuracy-investigation.md` (per-combo cost distributions, MAPE, outliers, Liar's Gate, trade-mix)
- `docs/reports/wf1-gfa-accuracy-investigation.md` (GFA + massing + stories accuracy)
- `docs/reports/wf1-toronto-bylaw-investigation.md` (Toronto Zoning By-law 569-2013 mapping for cost model defaults)
- `docs/reports/wf1-reno-build-pattern-investigation.md` (substantial-renovation-disguised-as-new-build pattern)
- `docs/reports/wf1-bylaw-heuristic-validation.md` (lot × coverage × floors heuristic vs declared cost)

---

## Executive summary

The WF1 §3.A matrix re-key **resolved the 14-day silent cost regression** (100% `cost_source='none'` → 39.9% non-null coverage). The pipeline is now producing cost estimates. **However, accuracy of those estimates is poor, and FOUR independent root causes have been identified.**

| Category | Severity | Source of error | Affected permits |
|---|---|---|---|
| Cost over-prediction (additions/alterations) | HIGH | Wrong GFA (massing footprint too large) | ~80% of construction permits |
| Cost under-prediction (New Building megaprojects) | CRITICAL | Wrong GFA (link-massing finds existing small buildings, not the new megaproject) + storeys=0 always | New Building × Apartment / Mixed-Use |
| Stories data 100% missing | CRITICAL | `permits.storeys = 0` for every permit; massing-side `estimated_stories` truncated | ALL permits |
| **Reno-build pattern misclassified as small reno** | **HIGH** | **38% of `Small Residential Projects × SFD` permits have 9+ active trades = new-build scope, but get 0.25 allocation** | **~12K SFD permits** |

**Net assessment:** the pipeline is FUNCTIONAL but the numerical outputs are **not yet trustworthy for downstream decision-making**. Operator-tunable calibration via the Spec 86 Control Panel can address Bias #1 in the short term. Bias #2 and the stories issue require code changes to `link-massing.js` and the Brain's GFA computation. The reno-build bias has a clean detection rule (trade count) that can be deployed without external data.

---

## Finding 1 — Model over-predicts additions/alterations by 2-30x

Source: `wf1-cost-accuracy-investigation.md` Lens #3 (model-vs-declared MAPE).

| Combo | Model p50 | Declared p50 | Ratio | Liar's Gate override % |
|---|---|---|---|---|
| Residential Bldg Permit × SFD Townhouse | $6.35M | $200K | **31.7x** | 71.6% |
| Bldg Add/Alt × Hospital | $15.99M | $855K | **18.7x** | 44.3% |
| New Houses × SFD Townhouse | $4.97M | $310K | **16.0x** | 51.3% |
| Bldg Add/Alt × Restaurant <30 | $928K | $100K | 9.3x | 58.4% |
| Bldg Add/Alt × Office | $2.48M | $295K | 8.4x | 53.0% |
| Bldg Add/Alt × Industrial | $2.94M | $350K | 8.4x | 51.5% |
| Bldg Add/Alt × Apartment Building | $2.63M | $372K | 7.0x | 53.4% |
| Bldg Add/Alt × Retail Store | $1.54M | $200K | 7.7x | 55.9% |
| Small Resid Proj × SFD Townhouse | $549K | $125K | 4.4x | 54.2% |
| Small Resid Proj × Unknown | $255K | $70K | 3.6x | **85.0%** |

**Liar's Gate override rates of 50-85%** in these combos confirm the model is consistently MUCH higher than declared. The Liar's Gate is "rescuing" us from over-prediction by trusting declared costs for 60% of construction permits.

**Drivers of this bias:**
1. **GFA over-estimate** (Finding 4): for additions/alterations, modeled GFA is the entire existing building's GFA, not just the area being altered. The matrix allocation `0.25` for `addition` semantic is meant to reduce this down to "25% of building area" — but the underlying GFA itself is already inflated.
2. **Sum-of-trades exceeds 100% of total** (Finding 5).

---

## Finding 2 — Model under-predicts New Building megaprojects by 10-30x

Source: `wf1-cost-accuracy-investigation.md` Lens #3 + `wf1-gfa-accuracy-investigation.md` Lens D + Lens J.

| Combo | Model p50 | Declared p50 | Ratio |
|---|---|---|---|
| New Building × Mixed Use/Res | $2.13M | **$64.75M** | 0.03x |
| New Building × Apartment Building | $2.54M | **$31.52M** | 0.08x |

**Sample of high-declared-cost New Building permits and what GFA they got:**

| permit | declared cost | dwelling units | modeled_gfa | footprint_sqm | massing_stories | lot_size_sqm |
|---|---|---|---|---|---|---|
| 25 111279 BLD:00 | **$1.00B** | 498 units | 469 m² | 156 m² | 3 | 261 m² |
| 23 120705 BLD:00 | **$1.00B** | 405 units | 443 m² | 111 m² | 4 | 287 m² |
| 18 192535 BLD:00 | **$938M** | 867 units | 67 m² | 67 m² | N/A | 5,786 m² |
| 24 114597 BLD:00 | **$700M** | 194 units | N/A | 759 m² | 21 | 3,735 m² |
| 26 143188 BLD:00 | **$500M** | 508 units | 1,119 m² | 70 m² | 16 | 2,067 m² |

A 498-unit apartment building has a true GFA somewhere between **40,000–80,000 m²**. Our model is computing GFA of **469 m²** — off by **100-170x**.

**Root cause** (confirmed by Lens J — see Finding 4 below): for New Building permits, by definition there's no existing building to measure. The `link-massing.js` spatial-join picks the nearest existing building on the parcel (often a shed, garage, or the pre-demolition structure), and uses that as the "primary" building for GFA. **The massing data is fundamentally unsuitable for new construction permits.**

---

## Finding 3 — `permits.storeys` is 100% zero (no declared story data)

Source: `wf1-gfa-accuracy-investigation.md` Lens K.

```
permits.storeys distribution (all 248,571 permits):
  zero:     248,571  (100%)
  NULL:     0
  positive: 0
```

**Implications:**

The Brain's GFA formula (`cost-model-shared.js:193`) is:
```js
const stories = row.estimated_stories !== null ? row.estimated_stories : (row.storeys || 1);
```
Since `row.storeys = 0` for every permit, the Brain falls back to `building_footprints.estimated_stories`. If that's also missing, defaults to **1 story**.

**Massing-side `estimated_stories` distribution:**

| bucket | count | avg footprint |
|---|---|---|
| NULL | 17,797 | 437 m² |
| 1-3 stories (low-rise) | 255,084 | 193 m² |
| 4-12 stories (mid-rise) | 149,812 | 362 m² |
| 13+ stories (high-rise) | **4,384** | 1,077 m² |

Toronto has thousands of high-rise buildings — but the massing data only labels 4,384 buildings as 13+ stories. The other multi-story towers are bucketed into low-rise or mid-rise, leading to under-counted stories on massing for many real high-rises.

**Consequence:** for a permit on a 20-story apartment building where massing says 4 stories, the modeled GFA is 5x too small. Combined with Finding 2 (wrong building linked entirely), this compounds the under-prediction for megaprojects.

---

## Finding 4 — Massing data quality is mixed; spatial join fails for new construction

Source: `wf1-gfa-accuracy-investigation.md` Lens F, G, H, I, J.

### 4a. Spatial-join completeness varies by permit type

| permit_type × structure | parcel% | primary-building% | full-path% (with footprint AND stories) |
|---|---|---|---|
| Small Residential Projects × SFD Detached | 99.8% | 99.8% | **99.0%** |
| New Houses × SFD Townhouse | 74.6% | 70.8% | **43.7%** |
| Bldg Add/Alt × Office | 93.7% | 91.9% | **64.3%** |
| Mechanical(MS) × Retail Store | 92.1% | 91.3% | **63.6%** |

For SFD additions, massing data is essentially complete (99%). For commercial additions and new construction, 30-40% of permits FAIL the primary GFA path and fall through to the lot-size-based fallback.

### 4b. m²/unit sanity check exposes the magnitude of error

Typical residential dwelling unit = **50–150 m²**. Lens G computed median m²/unit per combo:

| Combo | n | median units | median GFA | median m²/unit | Verdict |
|---|---|---|---|---|---|
| New Building × Apartment Building | 441 | 143 | 837 m² | **10 m²/unit** | 60% suspiciously low — wrong building linked |
| New Building × Mixed Use/Res | 391 | 210 | 936 m² | **7 m²/unit** | 66% suspiciously low |
| New Houses × SFD Detached | 5,667 | 1 | 439 m² | **438 m²/unit** | 49% suspiciously high — too large (whole site treated as building) |
| Residential Bldg Permit × SFD Townhouse | 458 | 1 | 2,078 m² | **2,017 m²/unit** | 88% suspiciously high |
| Small Resid Proj × 2 Unit - Semi-detached | 557 | 1 | 674 m² | **664 m²/unit** | 83% too large |

**Two failure modes are clearly visible:**
- **New Building / Apartment / Mixed-Use**: GFA is ~10 m²/unit — physically impossible. Confirms wrong building is linked (shed/garage, not the megaproject).
- **New Houses / Residential / Small Resid Proj on detached + semi-detached**: GFA is 400-2,000 m²/unit — way too high. Suggests the entire lot is being treated as building (fallback path used incorrectly, OR primary building includes outbuildings/coverage area).

### 4c. Building-link confidence inversely correlates with footprint size

| confidence | n primary links | median footprint | median GFA used | median estimated_cost |
|---|---|---|---|---|
| `0.95+` high-confidence | 381,605 | 148 m² | 562 m² | $326K |
| `0.60-0.79` low-confidence | 99,589 | **202 m² (larger)** | **810 m² (larger)** | **$400K (higher)** |
| `null` (no link) | 338 | — | 4,332 m² | $150K |

Low-confidence links produce **larger** footprints and **higher** cost estimates. The spatial-join's confidence scoring is correctly identifying weak matches, but those weak matches are being USED ANYWAY in the cost model. **Low-confidence links may grab adjacent larger buildings (e.g., a tower on a different lot).**

### 4d. Multi-building parcels distort the "primary" pick

Lens I shows median modeled GFA by parcel building count:

| parcel buildings | n permits | median modeled GFA |
|---|---|---|
| 1 building | 80,447 | 551 m² |
| 2-3 buildings | 8,455 | **2,474 m²** |
| 4-10 buildings | 6,727 | 1,510 m² |
| >10 buildings | 3,214 | 634 m² |

Multi-building parcels (2-3 buildings) produce **4.5x higher** GFAs on average. The "is_primary" flag is likely picking the LARGEST building on multi-building parcels, regardless of which building the permit actually concerns.

### 4e. New Building megaprojects: the smoking gun

Lens J — for `New Building × Apartment Building` and `New Building × Mixed Use/Res` permits, the linked footprint distribution is:

| linked footprint bucket | n permits | median declared units | median declared cost |
|---|---|---|---|
| 0 (no footprint) | 331 | 49 | $16M |
| < 100 m² (shed/garage) | 258 | 37 | $14M |
| 100-500 m² (single-family-sized) | 410 | 28 | $8M |
| 500-2,000 m² (small commercial) | 431 | 87 | $18M |
| 2-10K m² (mid-rise tower) | 99 | 128 | $20M |
| > 10K m² (true megaproject) | **1** | 341 | $195M |

Out of ~1,530 New Building Apt/Mixed-Use permits, **only ONE** has a linked footprint > 10K m². The rest are matched to existing small structures that bear no relation to the new building being built. **This is the load-bearing bug for megaproject under-prediction.**

---

## Finding 5 — Trade contract values sum to > 100% of total

Source: `wf1-cost-accuracy-investigation.md` Lens #5.

For `Small Residential Projects / SFD - Detached` (n=20,341), summed trade allocations across all rows = ~$5.31B, while total estimated_cost across the same rows ≈ $4.2B. **Trades over-sum by ~25%.**

Per-trade averages:
- framing 30.4%, structural-steel 23.2%, electrical 21.8%, hvac 20.6%, concrete 19.9%, plumbing 18.1%, masonry 13.0%, roofing 10.0%, flooring 8.9%, drywall 8.4% = ~175% sum

Industry expectation for new residential:
- framing 15-20%, plumbing 5-10%, electrical 5-10%, drywall 8-12%, roofing 3-7%, hvac 5-10%, concrete 8-15%

**Multiple trades are independently computed at full $/m² rate without normalization.** Either (a) this is intentional (trade contracts overlap and exceed 100% by design — the Brain emits trade-level full prices for each, and downstream cost is the city-declared one), or (b) it's a defect in `computeSurgicalTotal` (`cost-model-shared.js`). Needs investigation against Spec 83 §3 Step C semantics.

For comparison, `New Houses × SFD Detached` is well-behaved: framing 16%, hvac 13%, plumbing 11.5%, electrical 11.5%, summed ≈ 95%. So the trade-sum issue is **not universal** — only specific permit_types (those using `Small Residential Projects` semantic) have the problem.

---

## Finding 6 — Liar's Gate is masking the over-prediction at production

Source: `wf1-cost-accuracy-investigation.md` Lens #4.

The Spec 83 Liar's Gate decides per-permit whether to use the model or the declared cost:
- declared ≤ $1K placeholder → use Surgical_Total (model)
- declared < (Surgical × 0.25) → use Surgical_Total (model — declared was too low)
- else → use declared, sliced by trade weights

When the model is 4x+ higher than declared, the Liar's Gate fires (`is_geometric_override = true`) and the model's value is shipped. Override rates:

| Combo | Override % | Implication |
|---|---|---|
| Small Resid Proj × Unknown | **85.0%** | model rejected 85% of declared values |
| Residential Bldg Permit × SFD Detached | **76.7%** | |
| Residential Bldg Permit × SFD Townhouse | **71.6%** | |
| New Houses × Stacked Townhouses | 67.1% | |
| Bldg Add/Alt × Restaurant <30 | 58.4% | |
| Bldg Add/Alt × Retail Store | 55.9% | |

**Net effect**: for these combos, our `cost_source='model'` outputs are reflecting the model's bias, not the declared truth. **The over-prediction shows up in production data, not just in audit comparisons.**

---

## Finding 7 — Reno-build pattern misclassified as small renovation

Source: `wf1-reno-build-pattern-investigation.md`.

A material fraction of permits classified as `Small Residential Projects × SFD` are economically new builds — builders retain a wall or two (or just the foundation) to avoid full-demolition classification and preserve grandfathered FSI/setbacks. The matrix allocation of `0.25` (treating as addition) under-allocates these by 3-4x because they're actually full-build scope.

### Prevalence (SFD-Detached, 33,356 small-reno permits)

| Trade count band | n permits | % of category | Likely scope |
|---|---|---|---|
| 0-2 trades | 1,877 | 6% | Genuinely small reno (~0.05-0.15 of GFA) |
| 3-5 trades | 7,151 | 21% | Medium reno (~0.15-0.30) |
| 6-8 trades | 11,749 | 35% | Major reno (~0.30-0.60) |
| **9+ trades** | **12,579** | **38%** | **Reno-build scope (~0.85-1.00)** ← currently treated as 0.25 |

**38% of "Small Residential Projects × SFD - Detached" permits have 9+ active trades** — that's foundation + framing + plumbing + electrical + HVAC + drywall + flooring + roofing + finishing. That's new-build trade composition with a wall (or three) retained for regulatory reasons.

### Sample of misclassified high-cost permits

Selected from declared cost > $1M (n=148 in this band):

| permit | declared $ | description excerpt |
|---|---|---|
| 23 113407 BLD:00 | $5.0M | *"Demolition of existing detached garage, rear/side addition, new 2nd floor addition, interior alterations, rear deck"* — essentially a new house |
| 24 122048 BLD:00 | $4.0M | *"Alter the existing one-storey detached dwelling by constructing a partial rear one-storey addition with rear deck and complete second storey addition"* |
| 22 218716 BLD:00 | $3.0M | *"3 storey rear and side addition, interior alterations"* |
| 23 190222 BLD:00 | $3.0M | *"Two and a half storey addition with attached garage, interior alterations throughout, new basement walkout, underpinning"* |

### Why this matters

The `0.25` allocation is a **blended average over a bimodal distribution**:
- Truly small reno (6%): 0.25 over-allocates by 2-3x → contributes to Finding 1 over-prediction
- Reno-build (38%): 0.25 under-allocates by 3-4x → silent under-prediction

The average masks both errors. A single matrix value can't capture a category that spans $20K kitchen renos and $5M rebuilds.

### Detection rule (no external data needed)

Use **trade count** as the primary fingerprint — available on every permit via `active_trade_slugs`, doesn't require parsing description text or trusting declared cost:

```js
function effectivePermitScope(row, baseAllocation) {
  const activeTrades = (row.active_trade_slugs || []).length;

  // Reno-build pattern: 9+ trades OR very high declared cost → economic new build.
  // Use full-build allocation (1.0) AND switch to new-build GFA path.
  if (activeTrades >= 9 || (row.est_const_cost && row.est_const_cost > 750000)) {
    return { allocation: 1.0, useNewBuildGfa: true };
  }
  // Major reno: 6-8 trades → bump 2x.
  if (activeTrades >= 6) {
    return { allocation: Math.min(0.60, baseAllocation * 2.0), useNewBuildGfa: false };
  }
  // Truly small: 0-2 trades → reduce 50%.
  if (activeTrades <= 2) {
    return { allocation: baseAllocation * 0.5, useNewBuildGfa: false };
  }
  return { allocation: baseAllocation, useNewBuildGfa: false };
}
```

All thresholds (9, 6, 2, 750K) operator-tunable via `logic_variables`. Description-text parsing (the `permits.description` WF) refines this further.

---

## Root cause synthesis

Four independent causal chains feed into "inaccurate cost estimates":

```
1. permits.storeys = 0 for every permit
        ↓
   Brain falls back to massing.estimated_stories
        ↓
   But massing severely under-counts high-rises (only 4,384 buildings labeled 13+ stories)
        ↓
   GFA under-counted for tall buildings → cost under-predicted

2. link-massing.js can't link new construction to massing
        ↓
   For New Building permits, the nearest existing structure is linked as "primary"
        ↓
   Often a shed/garage/teardown (60-150 m²) is used in place of the actual megaproject footprint
        ↓
   GFA off by 50-100x → cost under-predicted by 10-30x

3. Trade rates × structure_complexity × neighborhood_premium produce per-trade values
   that aren't normalized to sum ≤ 100% of the total
        ↓
   Surgical_Total over-counts trade overlap
        ↓
   When Liar's Gate fires (declared < Surgical × 0.25), the over-counted model is shipped
        ↓
   Result: model cost is 2-10x declared for additions/alterations

4. Permit classification ≠ economic scope (Toronto's 3-wall reno-build pattern)
        ↓
   Builders retain ≥1 existing wall to keep "small residential project" classification
   (preserves grandfathered FSI, avoids demolition permit, retains zoning non-conformities)
        ↓
   Permit-type-based allocation of 0.25 assumes addition-sized scope (~0.05-0.30 GFA fraction)
        ↓
   Actual scope is full new-build (~0.85-1.00 GFA fraction)
        ↓
   Cost under-predicted by 3-4x for ~12K SFD-detached permits (38% of category)
```

These **four causes are independent and additive**. The cost model can be partially trusted when:
- It's an existing building (massing reflects reality)
- Liar's Gate trusts the declared value (model is sliced, not anchored)
- Storeys happen to align between low-rise massing and reality
- The permit's stated classification matches its economic scope (i.e., not a hidden reno-build)

These conditions hold for ~30% of permits. For the other 70%, the estimate is materially wrong.

---

## Recommended remediation paths

### Short-term (no code change — operator-driven via Spec 86 Control Panel)

1. **Tune matrix allocations DOWN** for over-predicting combos (Finding 1). Effective immediately. Lowers cost estimates 30-70% for additions/alterations. Operator action via `IntensityMatrix` Control Panel.
2. **Add safe-skip rows** for ambiguous combos where the cost model is most unreliable (e.g., "Unknown" structure types). Setting the matrix value to 0 will safe-skip (per Brain logic `pct > 0` gate).

### Medium-term (separate WF3s — code changes)

3. **Fix `permits.storeys` data source** — currently 100% zero. Either (a) backfill from CKAN if available, (b) drop the field entirely and rely on massing, or (c) derive from `dwelling_units_created` + `structure_type` heuristics. **High-impact fix.**
4. **Fix `link-massing.js` for New Building permits**: detect when `permit_type = 'New Building'` and skip the spatial-join → use a derived GFA from `dwelling_units_created × typical_unit_size`. This is the only way to fix the megaproject under-prediction without ground-truth massing of unbuilt structures.
5. **Audit `building_footprints.estimated_stories` ingestion**: only 4,384 of 427K buildings labeled as 13+ stories is implausibly low for Toronto. Investigate the source (CKAN city-supplied vs computed from LIDAR) and validate against known high-rise inventory.
6. **Investigate trade-sum > 100%**: read Spec 83 §3 Step C semantics + `computeSurgicalTotal` in the Brain to determine whether overlapping per-trade values are intentional or a defect.

### Long-term (architectural)

7. **External ground-truth calibration**: pull final-cost data from completed projects (Toronto Star, project websites, FOIPP) and tune matrix + trade rates to minimize MAPE.
8. **Per-permit-type cost models**: a single matrix × trade-rate system can't capture the structural differences between SFD additions (small surgical work) and new high-rise construction (full envelope build). Consider distinct model paths.

---

## Action items, severity-ranked

| # | Action | Severity | Effort | Owner |
|---|---|---|---|---|
| 1 | Tune matrix allocations DOWN for the 20 worst-calibrated combos | HIGH | 30 min (Control Panel) | Operator |
| 2 | Investigate `permits.storeys = 0` data ingestion (load-permits or CKAN) | CRITICAL | 1-2 days | Backend/Pipeline |
| 3 | Fix link-massing for New Building permits — bypass spatial-join, use derived GFA | CRITICAL | 2-3 days | Backend/Pipeline |
| 4 | Audit `building_footprints.estimated_stories` for high-rise under-counting | HIGH | 1-2 days | Backend/Pipeline |
| 5 | Investigate trade-sum > 100% in Surgical_Total | MEDIUM | 0.5-1 day | Backend/Pipeline |
| 6 | Add cost estimate accuracy monitoring (MAPE per combo as audit row) | MEDIUM | 0.5 day | Pipeline observability |
| 7 | External ground-truth calibration via FOIPP/news data | LOW | 2-4 weeks | Product + Data |
| 8 | Replace heuristic-guessed defaults with Toronto bylaw-sourced values (per `wf1-toronto-bylaw-investigation.md`) — RD/RS/RT coverage + laneway/garden suite caps | HIGH | 0.5 day | Backend/Pipeline + Operator validation |
| **9** | **Add trade-count + declared-cost reno-build detection rule** to Brain `effectivePermitScope()`; thresholds externalized to `logic_variables`. Affects ~12K SFD permits (Finding 7) | **HIGH** | **1-2 days** | **Backend/Pipeline** |
| 10 | Ingest Toronto Open Data `zoning-by-law` → `parcels.zoning_class` to enable true per-zone bylaw lookup (replaces structure_type-based zone proxy) | MEDIUM | 2-4 days | Backend/Pipeline |
| 11 | Per-unit lot divisor for townhouse/semi-detached on shared parcels (footprint ÷ unit_count) | HIGH | 1-2 days | Backend/Pipeline |
| 12 | Parse `permits.description` text for proposed dimensions + reno-build keywords (refinement on Action #9) | MEDIUM | 1-2 weeks | Backend/Pipeline |

---

## What we should NOT do yet

- Don't propagate cost estimates to user-facing surfaces (lead detail UI, opportunity scoring with $ amounts) until at least Action #2, #3, and #9 land. The current estimates will mislead operators.
- Don't tune trade_sqft_rates yet (Finding 5 needs to be understood first — could be intentional design).
- Don't recalibrate the OB-3a/OB-3b/cost_model_coverage thresholds until we know what the realistic post-fix coverage will be after Actions 2-3 land.
- Don't ship the bylaw-sourced defaults from Action #8 without an operator with Toronto bylaw domain knowledge cross-checking key numbers (35% RD, 60% RT, 100 m² laneway, 60 m² garden suite). The third-party citations are consistent but not authoritative.

---

## Where to find the source data

- **Investigation reports** (all under `docs/reports/`):
  - `wf1-cost-accuracy-investigation.md` — per-combo cost distributions, MAPE, outliers, Liar's Gate, trade mix
  - `wf1-gfa-accuracy-investigation.md` — GFA, massing, stories, residential coverage by combo
  - `wf1-bylaw-heuristic-validation.md` — lot × coverage × floors heuristic vs declared cost
  - `wf1-toronto-bylaw-investigation.md` — Toronto Zoning By-law 569-2013 mapping
  - `wf1-reno-build-pattern-investigation.md` — Finding 7 prevalence + detection signals
- **Analysis scripts** (all under `scripts/analysis/`):
  - `wf1-cost-accuracy-investigation.js`
  - `wf1-gfa-accuracy-investigation.js`
  - `wf1-bylaw-heuristic-validation.js`
  - `wf1-reno-build-pattern-investigation.js`
- **PI outputs**: `docs/reports/wf1-cost-matrix-rekey-pis.md`
- **PI-3 allocation mapping**: `docs/reports/wf1-cost-matrix-rekey-allocation-mapping.md`
- **WF1 plan**: `.cursor/active_task.md` v3
- **Spec**: `docs/specs/01-pipeline/83_lead_cost_model.md`
