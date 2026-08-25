# Improving CoA Cost Coverage + the Opportunity-Score Gate

**Date:** 2026-07-17
**Trigger:** the 2026-07-17 CoA→permits pipeline run surfaced two FAIL verdicts — CoA `estimated_cost` coverage **61.2%** (< 90% gate) and `opportunity_score_coverage_pct` **79.95%** (< 80% gate).
**Method:** 3-agent investigation (cost mechanism + empirical trace; spec/prior-work synthesis; opportunity-score diagnosis) against the live dev DB + the specs. Every number below is a real query; every claim is file:line-cited.

---

## Executive summary

**Neither FAIL is a broken cost tier or a new regression.** They are two different animals:

1. **CoA cost 61.2%** — a mix of a *legitimate un-priceable ceiling* (~65% of the `none` rows: severance, demolition, non-low-rise, permission-only variances) and **two genuinely closable levers**:
   - **The routing semantic is right, but the input is missing (Lever B — the primary lever).** A CoA *is a building application* — an applicant seeking a variance to build more/differently than as-of-right — so a **new build or addition should price off the build lines: `max_build` (`cost_fb_total`, as-of-right envelope) or `coa_build` (`cost_coa_total`, the CoA "up-not-out" envelope)**, per Spec 88's "the cost is the parcel's opportunity menu, not the declared scope" semantic (Spec 83:88). NewConstruction already routes to `coa_build` correctly. **They fall through because the parcel's build cost was never computed** — of the 1,069 new-build/addition `none` rows, only 73 carry a build cost; 811 have no parcel at all; and where `cost_coa_total` is NULL, `cost_fb_total` is **also** NULL in **100%** of cases (they compute together), so no fallback between the two lines helps. **The fix is to compute + propagate the `max_build`/`coa_build` cost (the `opt_aor`/`opt_coa` optimal-config coverage), and route additions onto the build lines too.** This is the filed `wf2-p5-coa-cost-propagation-coverage` lever, sharpened.
   - **Lever A (secondary — a smaller reno mapper gap):** ~800+ *interior/alteration* CoAs whose parcel already carries a reno cost (`cost_gut_total`) go unpriced because the scope→line mapper can't route CoA variance-descriptor tags and has **no `project_type` fallback for `Alteration`** (the permit path has `renovation → gut`). This recovers the genuine-renovation subset (not new builds — those are Lever B).

2. **Opportunity-score 79.95%** — **a metric-calibration artifact, not a data-health failure.** It's 100% permit-side (CoA is excluded from its denominator), and P16's inference layer inflated the denominator ~45% with rows whose leads legitimately can't price. **Evidence-only coverage is 81.61% — a clean PASS.** It's an already-filed known boundary (`review_followups.md:2554`); the fix is a one-line metric change.

**Recommendation:** ship **Lever A** (a ~few-line mapper fix that recovers the largest bucket of *fully-costed* rows) and the **opportunity-score metric fix** now — both are small, high-confidence, and both are the honest fixes. Treat **Lever B** as the standing data-coverage effort it's already filed as. Do **not** chase 100% CoA coverage — the severance/demolition/commercial/variance tail is *correctly* `none`.

---

## Part 1 — CoA cost coverage (61.2%)

### 1.1 How a CoA gets priced (mechanism)

Two engines, kept straight:

- **Spec 88** (`88_parcel_cost_model.md`) — the **parcel cost menu**: for each residential parcel it prices 13 renovation lines (`max_build`, `coa_build`, gut, addition, garden/laneway suite, kitchen, bath, garage, basement…) from external industry $/ft² × escalation × area × neighbourhood premium. Buildo's declared `est_const_cost` is never a source (§1). Totals are premium-inclusive/final.
- **Spec 83 §3-ARCHETYPE** (`83_lead_cost_model.md:79-142`) — the **lead cost model** the CoA step runs. It maps a CoA's classified scope → a Spec 88 line (`archetype-cost-map.js`), then reads the **propagated parcel cost** for that line.

Per CoA (`compute-coa-cost-estimates.js:549-551`): `tryArchetypeCost(archRow)` is the **only** path that can price a CoA; anything it returns `null` for falls to the legacy geometric T4 — which is a **dead end for CoA** (no `permit_type`/`structure_type` → matrix key `"::"` misses `scope_intensity_matrix` → `areaEff=null` → `none`, `cost-model-shared.js:878-899`). CoA carries no applicant-declared area, so tiers **T1 and T3 never fire** — **the CoA ladder is T2-or-nothing** (`archetype_parcel`, the propagated line total). Every CoA `none` therefore means *"the mapped line had no usable propagated total."*

**Input dependency chain** (Spec 42 CoA chain): `link_coa_to_parcels` → `enrich_coa_zoning` (propagates the Spec 88 `cost_*` scalars onto `coa_applications` via the dominant-parcel §4D join, `enrich-permits.js:68/124/284…`) → `classify_coa_scope` (derives `structure_type`/`project_type`/`scope_tags` from the description) → `classify_coa_trades` → `compute_coa_cost_estimates`. A break anywhere upstream silently yields `none`.

### 1.2 The exact `none` paths (`cost-model-shared.js` / `archetype-cost-map.js`)

| Path | Condition | Verdict |
|---|---|---|
| A | `project_type` = Severance / Demolition → mapper returns null | **by design** |
| B | No line collected — CoA variance tags unmapped **and** no `project_type` fallback | **CLOSABLE (Lever A)** |
| C | `structure_type` not low-rise residential (apartment/office/mixed-use) | **by design** (out of archetype scope) |
| D | Mapped line's propagated scalar ≤ 0 | edge / by design |
| E | Fit-gated line (garage/laneway/garden) with scalar NULL = `fits:false` | **by design** (permissioning result) |
| **F** | Non-fit line, **propagated `lineTotal` is NULL** (no parcel, or parcel line uncomputed) | **CLOSABLE (Lever B)** — *dominant for new-construction* |
| G | `lineTotal` present but outside the T2 band (e.g. < $200K build floor) | by design (rejects data-poison slivers) |

### 1.3 Empirical decomposition (live DB, 33,400 CoAs)

**20,442 priced (61.2%) · 12,958 `none` (38.8%)** — of the `none`, **10,316 residential · 2,642 non-residential** (correctly skipped, path C).

Residential `none` by `project_type` + the dominant missing input:

| project_type | none | has parcel | has `cost_coa_total` | has `cost_gut_total` | dominant cause |
|---|--:|--:|--:|--:|---|
| **NewConstruction** | 1,827 | 624 | 104 | 295 | **`cost_coa_total` NULL, 94%** → path F (**Lever B**) |
| Severance | 2,183 | 1,534 | 1,197 | 1,196 | by design (path A) — 1,197 have full cost, still none |
| (null) | 2,790 | 2,378 | 1,643 | 1,655 | mapper null, no project_type (path B, **Lever A**) |
| **Alteration** | 1,287 | 1,130 | 922 | **832** | **mapper null despite cost ready** (path B, **Lever A**) |
| Mixed | 1,572 | 1,007 | 707 | 242 | split: path F + path B |
| Addition | 607 | 398 | 145 | 150 | `cost_addition_total` NULL (path F) |
| Demolition | 50 | 36 | 32 | 35 | by design (path A) |

**Pricing works where inputs exist:** NewConstruction 9,404 priced vs 1,827 none; Addition 4,234 vs 607; Mixed 6,259 vs 1,572. The `none` rows are input/mapper gaps, not a broken tier.

### 1.4 Lever A (secondary) — the Alteration / null-`project_type` reno mapper gap

*(This lever is about genuine interior/renovation Alterations — NOT new builds/additions, which are Lever B's build-line story.)* **~832 Alteration `none` rows already have `cost_gut_total` on their parcel** but go unpriced. Simulating the real `mapToLines` over Alteration `none` rows: **85% map to `null → T4 → none`.** Their top scope_tags — `residential`, `dwelling`, `two-storey`, `third-storey`, `parking`, `minor-variance`, `setback` — are the **variance descriptors** the CoA classifier emits (what relief is *sought*), which are deliberately absent from `TAG_LINE` (`archetype-cost-map.js:49-53`). And **`Alteration` has no `project_type` fallback** in the mapper (only NewConstruction/Mixed/Addition/renovation/laneway do). So a fully-costed parcel goes unpriced.

> Example — **`A0031/18TEY`** SFD-Semi Alteration, *"enclosing a portion of the existing front porch"*: parcel fully costed (`cost_gut_total=$1.87M`), `scope_tags=["dwelling","residential"]` → mapper null → none.

**The nuance that makes this correct, not a blind fix:** the Alteration bucket is **heterogeneous**. `third-storey`/addition-signal tags (82 rows) are *substantial* renovations that **should** price; `parking`/`minor-variance`/`setback`/`lot-coverage` are *permission-only* variances that are **legitimately `none`** (pricing a porch-enclosure as a $1.87M gut would be wrong). So the fix is **not** a blind `Alteration → gut` fallback — it's a **substance-aware mapper rule**: route Alterations carrying a real construction-scope tag (`*-storey`, `addition`, `rear-addition`, gut/convert signals) to the `gut`/`addition` line; leave pure-variance tags `none`. This recovers the *substantial* slice of the ~832+832(null-pt) rows that already carry the cost, without over-pricing variances.

**Effort:** small — a mapper enrichment in `archetype-cost-map.js:207-291` (mirroring the permit `renovation → gut` fallback at ~:243, but gated on a construction-signal tag) + possibly a few new construction-scope tags in `classify-coa-scope`. **ROI:** the largest bucket of *already-costed* rows. Route through the pipeline WF2/WF3 output panel + Reality-Check (it changes a cost VALUE on ~hundreds of leads).

### 1.5 Lever B (PRIMARY) — the build-line cost is missing, not the routing

**The routing is semantically correct: a CoA is a building application, so a new build/addition should price off the BUILD lines.** `LINE_DEFS` (`archetype-cost-map.js:35-36`): `max_build` → `cost_fb_total` (area `opt_aor_gfa_sqm`, the as-of-right envelope) and `coa_build` → `cost_coa_total` (area `opt_coa_gfa_sqm`, the CoA "up-not-out" envelope). NewConstruction routes to `coa_build` (`:217`). This matches Spec 88's semantic pin (Spec 83:88): *"the archetype cost is the parcel's opportunity menu (max build the lot supports), not the applicant's declared CoA scope."*

**They fall through because the parcel's build cost was never computed** (not because of routing). Empirically, of the 1,069 residential new-build/addition `none` (SFD):
- **811 (76%) have no `zoning_dominant_parcel_id`** — no parcel link, so no cost of any kind to propagate.
- **185 (17%) link a parcel but it has NO build cost** — only **73 (7%) carry `cost_coa_total`.** And crucially: **of the 996 rows lacking `cost_coa_total`, exactly 0 have `cost_fb_total`** — the two build costs are computed *together or not at all* (both derive from the parcel's `opt_aor`/`opt_coa` optimal config). **So a `coa_build → max_build` fallback recovers NOTHING** — the parcel simply has no build cost.
- The parcel's *reno* lines (`cost_gut_total`, `cost_addition_total`) are sometimes populated where the *build* lines are not — because the reno lines derive from `cur_*` (existing-structure) geometry while the build lines derive from the `opt_aor`/`opt_coa` **optimal-config** computation, which has lower coverage.

> Example — **`A0628/17TEY`** SFD-Detached NewConstruction, *"new two-storey detached dwelling with integral garage"*: parcel 414673, `cost_coa_total`/`cost_fb_total`/`opt_coa_gfa` all NULL, while `cost_gut_total=$4.70M` — the reno geometry computed, the build optimal-config didn't.

**The fix has two parts:**
1. **Compute + propagate the build cost** — raise the CoA→dominant-parcel **link rate** (`link_coa_to_parcels`) AND ensure the **`opt_aor`/`opt_coa` optimal config + `max_build`/`coa_build` cost computes** for the linked parents (Spec 78 opt-config coverage + Spec 88 build lines — the deferred §G/§H work folded into the cost-model epic). This is the filed `wf2-p5-coa-cost-propagation-coverage` lever, now pinned to the *build-line* computation specifically.
2. **Route additions onto the build lines too** (semantic correction — your call): currently `Addition → cost_addition_total` (a reno line). A CoA addition is a build-envelope question → it should consider `coa_build`/`max_build`. **Coverage tradeoff to note:** empirically the addition line (`cost_addition_total`, 156 populated) currently has *more* coverage than the build line (73) — so switching additions to the build line is semantically cleaner but, until part (1) lands, would *reduce* addition coverage. The two are complementary: fix the build-cost computation first, then move additions onto it.

**Effort:** medium-large, data-coverage (parcel link + optimal-config compute), not a cost-tier change. The below-floor slivers (e.g. `opt_coa_gfa = 21.75 m²` → a sub-$200K "new three-storey dwelling") are a *separate* data-poison concern (path G) — correctly rejected, but a signal that some `opt_coa` computations are mislinked.

### 1.6 The honest ceiling — what is *correctly* `none`

The prior taxonomy (`2026-07-07-priceable-none-taxonomy.md`) established that **acceptance is the taxonomy, not a percentage** (Spec 83:296). ~65% of CoA `none` is *by design* and should not be chased:
- **Severance (2,183) + Demolition (50)** — no construction scope (path A).
- **Non-low-rise (2,642)** — apartments/office/mixed-use, out of the archetype's scope (path C).
- **Fit-blocked** garage/laneway/garden lines — a permissioning result (`fits:false`), never a fallback (path E).
- **Pure-variance Alterations** (parking / setback / minor-variance) — permission relief, no build cost.

The 90% gate is therefore **mis-calibrated for CoA** — it can never pass while a legitimate un-priceable tail exists. Consider re-baselining the CoA `estimated_cost` gate to the taxonomy (every `none` has a reason) rather than a flat ≥90%, mirroring how Spec 83 already re-derived its acceptance.

---

## Part 2 — Opportunity-score coverage (79.95%)

**This is a metric-calibration artifact, and it is NOT connected to the CoA cost gap.**

- **The metric is 100% permit-side.** All 45,801 CoA forecast rows have `permit_num IS NULL`, so they never join `permits` and are entirely absent from the denominator (`assert-entity-tracing.js:202-203`). The CoA cost gap has **zero** influence here.
- **A forecast row is unscored iff its lead's `estimated_cost IS NULL`** (`compute-opportunity-scores.js:332-339`). Of the 209,714 gap rows: **185,574 NULL-score** (all have a `cost_estimates` row but `estimated_cost` NULL; **81% are `cost_source='none'`** — no derivable cost, a genuine floor) + **24,140 genuine zeros** (a real score — a tiny trade slice of a project, e.g. `trim-work` $2,248 of a $212K job → rounds to 0; can't be lifted).
- **Root cause = P16 denominator inflation.** P16's inference layer grew the forecast denominator ~45% with inference-attached rows whose leads legitimately can't price. **Evidence-only coverage = 81.61% (PASS)** vs all-basis 79.95% (FAIL).

This is an **already-filed known boundary** (`review_followups.md:2554`, P16 16F residuals), **non-halting**. **Fix (small):**
1. **Make the `>0` gate basis-aware** — exclude `attachment_basis='inference'` from the denominator in `assert-entity-tracing.js:197-210`, mirroring the *existing* expired-row exclusion. Honestly restores ~81.6% PASS (measures evidence-grounded leads).
2. *or* re-baseline the 0.80 floor with a Spec 79 §3.7 pre-ack.

Do **not** chase "cost for every lead" — 81% of the NULL bulk is legitimately `none` and the zeros can't be lifted.

---

## Prioritized recommendations

| # | Lever | Effect | Effort | Status | Spec |
|---|---|---|---|--:|---|
| 1 | **Opportunity-score: basis-aware denominator** (exclude inference rows) | 79.95% FAIL → ~81.6% PASS, honestly | **S** | filed `rf:2554` | 81 / 79 |
| 2 | **Re-baseline the CoA `estimated_cost` gate** to the taxonomy (every `none` has a reason) not flat ≥90% | the 90% gate stops false-failing on the legitimate tail | **S** | new | 79 / 83 |
| 3 | **CoA cost Lever A: substance-aware Alteration/tagless mapper rule** → route real-*reno* Alterations to `gut`; keep variances `none` | recovers ~800+ already-*reno*-costed CoAs | **S–M** | **new (this report)** | 83 §3-ARCHETYPE / 42 |
| 4 | **CoA cost Lever B (PRIMARY for CoA): compute + propagate the build-line cost** — raise CoA→parcel link rate + compute `opt_aor`/`opt_coa` optimal-config so `max_build`/`coa_build` price; then **route additions onto the build lines** | lifts the new-build + addition buckets (the ~1,069+ semantic core: a CoA *is* a build application) | **M–L** (data) | filed `wf2-p5-coa-cost-propagation-coverage`, sharpened here | 78 / 88 / 65 |

**Sequence:** #1 and #2 are metric/gate corrections (make the dashboards honest) — do first, cheap. #3 is a focused code fix for the genuine-reno Alteration subset (with Reality-Check on the resulting cost values). **#4 is the real substance** — the semantic you flagged: a CoA is a building application, so its cost *is* the max-build / max-build-COA opportunity, and the gap is that those build-line costs (`cost_fb_total`/`cost_coa_total`) aren't reliably computed (missing parcel link + missing `opt_aor`/`opt_coa` optimal config). It's the biggest lift, belongs with the Spec 78/88 cost-model epic, and a `coa_build↔max_build` fallback alone won't help (both are null together) — the parcel build cost must actually be computed.

**Do not** target the severance / demolition / non-low-rise / pure-variance tail — that is correctly `none`, and pricing it would inject noise.

---

## Evidence appendix

- **Cost mechanism:** `compute-coa-cost-estimates.js:549-551` (dispatch), `:520-521` (T4 `::` dead-end); `coa-cost-model.js:182-237` (no own-area → T2-only); `cost-model-shared.js:601-676` (`priceLine`), `:734-796` (`tryArchetypeCost`), `:878-899` (matrix-miss none); `archetype-cost-map.js:207-291` (`mapToLines`, paths A/B/C), `:49-53` (`TAG_LINE`), `:243` (permit `renovation→gut` fallback to mirror).
- **Specs:** Spec 83 §3-ARCHETYPE (`83_lead_cost_model.md:79-142`, taxonomy 128-142, acceptance 296); Spec 88 (`88_parcel_cost_model.md`, 13 lines §2.3); Spec 42 CoA chain (`42_chain_coa.md`, `enrich_coa_zoning` step); Spec 65 (max-build GFA), Spec 78 (opt_coa / §4D propagation), Spec 81 (`81_opportunity_score_engine.md:99`).
- **Opportunity score:** `compute-opportunity-scores.js:332-339` (NULL path), `assert-entity-tracing.js:197-227` (metric + permit-only join), `review_followups.md:2554` (filed boundary).
- **Prior work / commits:** `4442fb75` (archetype cost permits+CoA, the 0%→62% pivot), `8a3a3644` (Spec 88 P1), `efe10876` (§4D propagation), `d46aad58` (R2 detached opt_coa), `0b390b76` (matrix production-vocab re-key). Prior reports: `2026-07-07-priceable-none-taxonomy.md`, `wf3-cost-model-none.md`, `wf1-parcel-renovation-cost-model.md`.
