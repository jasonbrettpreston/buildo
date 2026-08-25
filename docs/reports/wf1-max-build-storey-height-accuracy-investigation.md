# Max-Build & Existing-Structure GFA Accuracy — Investigation & Storey-Scenario Design

**Date:** 2026-06-23
**Domain:** Backend/Pipeline (Spec 65 §4 max-build envelope + §5 existing-structure)
**Trigger:** Phase-3 accessory-fit validation (`scripts/analysis/phase3-accessory-validation.sql`) surfaced that **max-build GFA < existing GFA for 62% of parcels** (median ratio 0.79) — backwards for a "maximum buildable" envelope.
**Status:** Diagnosis complete. Design decision recorded (storey-scenario GFA). WF3 fix sequence proposed (not yet implemented).

---

## 1. Executive summary

The "max-build < existing" anomaly is **not primarily a max-build problem**. It is dominated by a **contaminated existing-structure baseline** plus a secondary footprint-model bug. Four separable root causes, all sized below:

| # | Cause | Severity | Affects |
|---|---|---|---|
| 🔴 1 | **Tree-contaminated existing heights** — `max_height_m` is the *max surface height over the footprint*, so it catches overhanging tree canopy, not the roof | ~10–21% of low-rise residential | `existing_height_m` → `existing_stories` → `existing_gfa` → **and the reno cost model (Spec 65 ES-5 → Spec 83)** |
| 🟠 2 | **Mislinked buildings** — low-confidence nearest-fallback links attribute the wrong building → `footprint > lot` (physically impossible) | 4.4% (12,191 parcels); 85% already flagged `existing_structure_confidence='low'` | `existing_footprint_sqm` + `existing_height_m` (both wrong together) |
| 🟡 3 | **Setback-box suppresses max-build footprint** — flat front+rear setback undercuts the by-law coverage cap; side setbacks applied to shared party walls | Detached: −10 pt; attached (RT/RS/RM/R): severe | `max_buildable_footprint_sqm` |
| 🟢 4 | **Storey-conversion ambiguity** — the by-law designates **height, not storeys**; height ÷ 3.0 is a fragile point estimate at the 2/3 boundary | All residential | `max_build_stories` and `existing_stories` |

**Key reframe:** the by-law gives a **height envelope**, and the **massing height data is unreliable** (tree canopy). We cannot trust a single derived storey count on either side. **Design decision (§5): stop committing to one storey count — emit GFA at 1, 2, and 3 storeys (footprint × N) for both existing and max-build, and treat the height-derived storey as a *likelihood*, not a fact.**

---

## 2. The footprint model is sound; the storeys are the gap

Decomposing the residential max-build vs existing, **footprint-only** (storeys removed):

| zone | n | max_fp ≥ existing_fp | median fp ratio | note |
|---|---|---|---|---|
| **RD** (detached) | 228K | **59%** | **1.08** | footprint correct |
| R (generic) | 99K | 35% | 0.67 | attached under-computes |
| RM (multiplex) | 52K | 35% | 0.73 | attached under-computes |
| RS (semi) | 28K | 24% | 0.72 | attached under-computes |
| **RT** (townhouse) | 14K | **7%** | **0.19** | party-wall setback collapse |

- For **detached (RD)** the footprint is right: modeled coverage `fp/lot = 0.319` ≈ existing `0.315` ≈ by-law `33.3%`; coverage-bound 74% of the time.
- For **attached** types the box collapses because the model applies side setbacks (0.9–1.5 m) to **shared party walls** that have zero setback. RT is worst (median ratio 0.19).

### Why detached isn't 100% (and shouldn't be)
Of the 92,834 RD lots where max_fp < existing_fp:
- **72% (67,306) = legitimate non-conformance** — existing covers ~40% of the lot vs a 33% by-law cap (older housing predating modern coverage limits). Max-build *correctly* caps below existing. This is a **useful product signal** (reno / minor-variance / can't-teardown-and-match lots).
- **27% (24,971) = model under-compute** — existing fits within coverage but the setback box still shrinks max below it.
- The coverage-bound cases only reach **26%** coverage when the by-law grants **33%** — the flat front+rear setback drags footprint ~7 pts below what's allowed.

**Achievable ceiling (RD):** current 56% → **67%** if footprint is coverage-governed → remaining **33% legitimately capped**. Fixing the box is worth **+10 pts** for detached and the bulk of the attached gap.

### Clean benchmark: `max_build_gfa ≥ existing_footprint × 2`
Because the **footprint is trustworthy** (§3.4) but `existing_gfa` is not, the honest validation is against `existing_footprint × 2` (a baseline 2-storey on the known footprint), not `existing_gfa`. A normal residential lot should clear this in nearly every case; legit exceptions are heritage freeze, ravine, and existing-already-over-coverage. RD result:

| bucket | % |
|---|---|
| ✅ PASS (mb_gfa ≥ ex_fp×2) | **70.7%** |
| legit — existing over-coverage | 18.7% |
| legit — ravine | 5.8% |
| legit — heritage | 0.0% |
| 🐛 footprint-short (setback box) | **4.4%** |
| 🐛 FSI-capped | 0.4% |
| storey-short (<2) | 0.0% |

**70.7% pass outright, ~95% counting legit exceptions, only ~4.8% real bug** — confirming the "62% max < existing" alarm was the *contaminated `existing_gfa`*, not max-build. `storey-short` is ~0 (RD storeys aren't the problem; the existing-GFA inflation was). **Impact of the coverage-governed footprint fix (WF3-B): 70.7% → 79.4% pass (+8.7 pts)**, remainder dominated by legit over-coverage + ravine. *Adopt `max_build_gfa ≥ existing_footprint × 2` as the standing regression benchmark.*

### Attached vs detached — the fix is NOT uniform
Benchmark on the `existing_footprint × 2` test, ALL vs CLEAN (`fp ≤ lot`) subset:

| zone | type | ALL pass | CLEAN pass | low-conf links | diagnosis |
|---|---|---|---|---|---|
| RD | detached | 71% | 71% | 3% | clean data + model; coverage-fix → 79% |
| R | mixed | 64% | **80%** | 36% | max-build fine; **23% mislinked existing-fp** drags the headline |
| RS | semi | 41% | 42% | 30% | **model — party-wall shared setback** (coverage-fix doesn't help) |
| RM | multiplex | 41% | 41% | 29% | model + partly legit (dense existing; benchmark fits poorly) |
| RT | townhouse | 16% | **31%** | 51% | **both — 47% block-attribution corruption + party-wall under-compute** |

- **Coverage-governed footprint (WF3-B) is a *detached* win** (+9 pt); it barely moves attached.
- **Attached needs two different fixes:** (1) **party-wall side-setback = 0** for semis/townhouses (the real attached footprint lever — *not* simulated above, so still unsized); (2) **mislink/block-attribution guard (WF3-A)** — dominant for R (23% `fp>lot`) and RT (47%). On *clean* R parcels max-build already passes 80%.
- **RM (multiplex)** is partly legitimate — `existing_fp × 2` fits dense multi-unit stock poorly; don't chase it to 95%.
- **Implication:** WF3-A (existing data quality) gates *attached* max-build validation, not just the cost model.

---

## 3. The existing-structure baseline is contaminated (the real headline)

### 3.1 Calibration against known addresses (East York — Hurlingham Cres / Derwyn Rd)
Operator-verified ground truth (a street of bungalows + 2-storeys, **zero** 3-storeys):

| address | ground truth | our `existing_height_m` | our `existing_stories` | verdict |
|---|---|---|---|---|
| 9 Hurlingham | 2-storey | 6.3 m | 2 | ✓ |
| 10 Hurlingham | 2-storey | 10.5 m | 4 | ✗ |
| 11 Hurlingham | **bungalow** | **20.5 m** | **7** | ✗✗✗ |
| 15 Hurlingham | **bungalow** | **18.0 m** | **6** | ✗✗✗ |
| 17 Hurlingham | **bungalow** | **22.1 m** | **7** | ✗✗✗ |
| 34 / 45 Derwyn | bungalow | 7.9 / 7.8 m | 3 / 3 | ✗ |
| 36 / 37 / 41 Derwyn | 2-storey | 8.9 / 8.7 / 9.6 m | 3 / 3 / 3 | ✗ |

A bungalow recorded at **22.1 m / 7 storeys** is the unmistakable signature of **tree canopy**, not building height.

### 3.2 `existing_stories` is not ground truth — it's `round(height / ~3.0)`
Massing `estimated_stories` is a height derivation (implied floor height flat at ~3 m), so it inherits the same roof/canopy inflation:

| estimated_stories | height p50 | range (p10–p90) | implied floor |
|---|---|---|---|
| 1 | 3.6 m | 1.9–4.4 | 3.34 |
| 2 | 6.3 m | 5.4–7.3 | 3.15 |
| 3 | 8.8 m | 7.8–10.1 | 2.96 |
| 4 | 11.7 m | 10.7–13.1 | 2.95 |

A 2-storey + steep pitched roof (~8–9 m to ridge) lands in the "3-storey" band. **The conversion over-counts pitched-roof houses even before tree contamination.**

### 3.3 Contamination prevalence (low-rise RD/RS/RT, 277K with height)
- **>12 m: 21.3%** · **>15 m: 10.5%** (no bungalow/2-storey is 15 m+) · **max = 95.6 m** on a detached lot
- existing_height p50 = 8.6 m (fine) but **p95 = 17.7 m, p99 = 22.2 m** — a fat contaminated tail
- Massing source has **no robust height field**: columns are `max_height_m, min_height_m, elev_z, estimated_stories` — a *max* (catches canopy) and a *min*, no median/percentile.

### 3.4 Trees contaminate height, NOT footprint (mislinks are a separate defect)
- **Median `fp/lot` is 0.31 for clean-height parcels and 0.28 for tree-contaminated (>15 m)** — footprint coverage is unaffected by canopy. `corr(footprint, height) = 0.116` (near-independent). The building *outline polygon* and the *max surface height* come from different places.
- **Separate defect surfaced:** **4.4% of parcels (12,191) have impossible `footprint > lot`**, of which **85% are low-confidence nearest-fallback links** → mislinks (wrong building attributed). 1,082 are doubly broken (`fp>lot` AND height>15 m). These are *already mostly flagged* by `existing_structure_confidence='low'`.

---

## 4. Design decision — storey-scenario GFA (1 / 2 / 3), not a single derived storey

**Rationale:** the by-law specifies a **height envelope**, not a storey count, and the massing **height is unreliable** (canopy). Committing to one storey number on either side produces wrong GFA and biases the max-vs-existing comparison. Instead:

1. **Compute GFA at 1, 2, and 3 storeys** = `footprint × N` for **both** existing and max-build. Footprint is the trustworthy input (§3.4); storeys are the uncertain one — so vary them explicitly.
   - max-build: `max_build_gfa_1s / _2s / _3s = max_buildable_footprint_sqm × {1,2,3}` (capped by `lot × FSI` where FSI present).
   - existing: `existing_gfa_1s / _2s / _3s = existing_footprint_sqm × {1,2,3}`.
2. **Emit a `*_stories_likely` + `*_stories_confidence`** derived from height bands + neighbourhood-modal storeys, **not** a hard storey count. Bands (provisional, to be calibrated §6): `<5 m → 1` (high), `5–7 m → 2` (high), `7.5–10 m → 2-or-3` (low — roof/canopy overlap; **lean to the lower count**), `>10.5 m → 3+` but **clamp/flag** when `height > bylaw_max_height × ~1.5` (contamination guard).
3. **Same storey model on both sides** so "can I build bigger?" is a like-for-like comparison.
4. **Where `bylaw_max_stories` is populated (52% of RD), it is authoritative** for max-build — no scenario guessing needed; emit the single value.

### Why there is no internal per-parcel 1-vs-2 signal (confirmed)
- `min_height_m` is **~0.0 for every parcel** (measured from grade, not the eave) and `elev_z` is absolute ground elevation — so `max − min` just equals the canopy-contaminated `max`. The massing has **exactly one height field, and it's the contaminated one.**
- On the labelled addresses, bungalows and 2-storeys **fully overlap in the 6–10 m band** (34/45 Derwyn bungalows at 7.8–7.9 m vs 36/37/41 Derwyn 2-storeys at 8.7–9.6 m). Height confidently catches only `<5.5 m` (bungalow) and `>13 m` (contaminated). The common case is unresolvable internally.
- **Neighbourhood-modal fails for *existing* storeys** because streets are mixed (bungalows + rebuilt 2-storeys intermixed). It cannot resolve a specific parcel.

### Max-build storeys — build-form-by-pocket (permit-derived)
Modal-by-area **fails for existing** (mixed stock) but **works for max-build**: new-build permits in a pocket converge on the *current effective limit* (homogeneous). So source `max_build_stories` from **new-build permit storeys aggregated by pocket**, not height÷3.0.
- **Data:** the structured `permits.storeys` field is **dead (0 for all 250K)**, but storeys are stated in **new-build descriptions** — ~39.6K of ~77K new-build-ish permits (51%) carry "two storey"/"3 storey" in text → extract via the existing description-classification machinery.
- **Pipeline:** extract storeys → filter to genuine new builds → **dedupe the MEP permits** (one new house emits Building+Plumbing+HVAC+Drain, each repeating the storeys — link by address/project or keep Building only; the #1 correctness risk) → aggregate by pocket (lat/lng, 91% have coords) → neighbourhood (94.8% have `neighbourhood_id`) → citywide, fallback by sample size.
- **Selection bias (load-bearing nuance):** permit data is biased toward **maximizers** (teardown-rebuilds max out the envelope), so it measures the **market-realized ceiling, not the legal ceiling**. Mitigations:
  - Use the **distribution, not the mode**: pocket **p50 ≈ typical realized build** (realistic scenario), **p90 ≈ achievable ceiling** (aggressive scenario). This gives the 1/2/3 scenarios *empirical bounds* — `[pocket p50, max(pocket p90, by-law)]` — instead of arbitrary 2/3.
  - **Never reuse this for existing/typical-stock** (biased high vs the standing bungalow mix). Max-build input only.
  - Where permit-modal **exceeds** the by-law height envelope → flag as a likely **CoA/variance hotspot** (a useful lead signal, not noise).
- **Reconciliation:** `bylaw_max_stories` present → legal max (authoritative), overlay pocket p50/p90 as the realistic range; only height present → pocket p50/p90 **beats height÷3.0**, with by-law height as the hard cap.

**Future enhancement (operator-triggered):** when a lead is **inquired**, capture true storeys via **Google Street View** (human or vision-model read of the façade) — the only per-parcel resolver for the ambiguous band. Caveats: imagery age (1–5 yr; risky for active-construction leads), summer canopy occlusion, and Google ToS (transient on-inquiry use only — **not** a cached citywide table). **MPAC** (Ontario assessment data — authoritative storey counts) is the preferred ground-truth source if licensable, sidestepping the imagery issues. Use Street View as the on-inquiry tiebreaker for high-value leads.

---

## 5. Recommended fix sequence (WF3)

- **WF3-A — Existing-structure data quality (highest leverage).** Tree-height clamp/flag (`height > bylaw_max_height × ~1.5` or absolute low-rise ceiling → low confidence + suppress derived storeys); mislink guard (reject/flag `footprint > lot`, already 85% caught by `confidence='low'`); roof-aware/​neighbourhood-modal storey likelihood. Fixes the corrupted `existing_gfa` that poisons both the comparison and the cost model.
- **WF3-B — Coverage-governed footprint.** Coverage cap is the ceiling; the setback box may refine but never undercut it; zero the party-wall side setback for attached types. Verified +10 pt detached, large attached recovery.
- **WF3-C — Storey-scenario GFA + build-form-by-pocket (§4).** Emit 1/2/3-storey GFA for existing + max-build; source `max_build_stories` from **permit-derived pocket norms (p50/p90)** rather than height÷3.0; `bylaw_max_stories` authoritative where present; flag market-exceeds-bylaw as CoA/variance hotspots. New derivation (extract storeys from new-build descriptions → dedupe MEP → aggregate by pocket).

**Standing regression benchmark:** `max_build_gfa ≥ existing_footprint × 2` for non-heritage/non-ravine/within-coverage residential (RD current 70.7% → 79.4% after WF3-B; should approach ~95% after A+B+C).

Sequencing: A and B are independent and can run in parallel; C depends on the storey-likelihood model from A and the new build-form-by-pocket derivation.

---

## 6. Open items / validation TODO
- **Calibrate the height→storey bands** against a larger labelled set (Hurlingham/Derwyn is the seed; add a few non-leafy and a known 3-storey block).
- ~~Check `min_height_m` / `elev_z`~~ **RESOLVED (no help)** — `min_height_m` is ~0.0 for every parcel (grade, not eave); `elev_z` is absolute ground elevation. `max − min` = the contaminated `max`. No clean building height is recoverable from the massing source.
- **Confirm `bylaw_max_coverage_pct`** (Spec 58 source) is the true cap on a couple of addresses — the 33% "irreducible non-conforming" floor depends on it.
- **RT block-footprint attribution CONFIRMED as a major issue** — 47% of RT (townhouse) parcels have `footprint > lot`, 51% low-confidence links — row-block footprints attributed to single unit-parcels. Gates attached max-build validation; addressed by the WF3-A mislink guard.
- ~~Footprints may include decks~~ **CHECKED — NOT AN ISSUE.** Tested via deck permits: RD parcels *with* a deck permit have **lower** median footprint coverage (0.266) than those without (0.295). If the polygon captured decks, deck parcels would read *higher* — they read lower, so the massing dataset **excludes open decks**. Deck inflation is not a real source of footprint over-statement. (Permits can't de-inflate anyway — only 4.6% of deck permits state dimensions, and those are addition areas, not the deck.)

---

## Appendix — reproducers
- Population/sanity: `scripts/analysis/phase3-accessory-validation.sql`
- Footprint binding-term + coverage-governed ceiling: ad-hoc SQL in this investigation (RD `zoning_class='RD'`, compare `max_build_width_m × max_build_length_m` vs `lot_size_sqm × bylaw_max_coverage_pct/100`).
- Calibration addresses: `parcels WHERE street_name_normalized ILIKE '%hurlingham%' OR '%derwyn%'`.
- Contamination prevalence: `parcels WHERE zoning_class IN ('RD','RS','RT')`, height percentiles + `fp > lot` count by `existing_structure_confidence`.
- Massing source fields: `building_footprints (max_height_m, min_height_m, elev_z, estimated_stories, footprint_area_sqm)`.
