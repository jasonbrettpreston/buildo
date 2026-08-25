# P12 — Trust-Assessment Fixes (validation)

**Date:** 2026-07-08 · **Branch:** auto-unblock/validation-2026-05-23 · **WF2**

Per-finding results. DB mutations (A1 backfill + re-derive) are DONE on dev; the
permits/coa chain propagation lands on the **next daily run** (chains NOT run here,
per the plan). C1/C3 classifier fixes are code+lock complete; the CoA re-classify
realizes on the next daily CoA chain.

---

## A1 — NULL-lot fix (the headline; value-changing)

**Semantic (RESOLVED, not open):** `lot_size_sqm` = source `STATEDAREA`
(`parseStatedArea`, load-parcels.js:500). NULL = source-absent (deliberate). It
feeds the LIVE cost-model T1 FSI gate (cost-model-shared.js:611-613) + fallback
GFA (:212-219), so the backfill is value-changing. Provenance carrier = **new
`lot_size_source`** (mig 214), NOT the orthogonal `lot_size_basis`.

**Pre-commit quantifications**
- **Stated-vs-geom delta** (`ABS(lot-ST_Area(geom::geography))/lot`, n=1,000 non-NULL):
  p10 0.0002 · p50 **0.0002** · p90 0.0004 · p99 0.0053 · mean 0.0014 · max 0.87
  (single bad-geom outlier). Geom is a near-exact proxy for STATEDAREA — the
  backfill's semantic error is <0.5% for ~99% of parcels.
- **Blast size (propagation):** 15,693 permit rows + 2,324 CoA rows sit on the
  NULL-lot parcels (via `zoning_dominant_parcel_id → parcels.id`). They re-propagate
  on the next daily permits/coa run.

**Backfill:** `UPDATE … lot_size_sqm = ROUND(ST_Area(geom::geography),2),
lot_size_source='geom_backfill'` (IS-DISTINCT guard). 8,924 rows (valid geom) +
6 rows via `ST_MakeValid` (invalid-geom residue) = **8,930**. Backup table
`_backup_null_lot_20260708(id)` created for reversal. **NULL-lot now = 0.**

**Re-derive chain** (script supports only `--full`, no scoped list → ran `--full`
detached, the quarterly-class op):
- `enrich-parcels --full` (≈46 min, PASS): `max_build_enriched_count = 8924` —
  exactly the backfilled parcels re-derived (the now-populated lot activates
  `fsi_cap`/`coverage_cap`; `lot_size_source` + `lot_size_sqm` untouched — not in
  MAX_BUILD_COLS). NB: the 6 ST_MakeValid rows were backfilled AFTER this run, so
  their (2 GFA-bearing) envelopes are lot-stale until the next daily incremental —
  negligible.
- `compute-parcel-cost-estimates` (78 s, PASS): **4,078** cost rows updated,
  0 engine errors, menu coverage 98.5%, fsi_implausible 0.

**Invariant coverage change (the point):** of the 8,924 backfilled parcels,
**6,217 GFA rows are now lot-validatable** (were unvalidatable with NULL lot); only
**7 breach** `max_buildable_gfa > 3×lot` (0.1%). The **$667M `cost_addition_total`**
NULL-lot monster [INT] is **GONE** — once its lot was backfilled the addition line
capped; corpus max `cost_addition_total` is now **$117.7M**.

**Docs:** Spec 55 §schema doc-rot corrected ("derived from geometry" → the
STATEDAREA truth + the `lot_size_source` provenance). (Spec 56's `ST_Area` line is
the massing-area context — correct, untouched.)

---

## A2 — magnitude exception-list watches

**Taxonomy (top offenders, re-measured POST-A1):**

| Offender | Pre-A1 | Post-A1 | Class |
|---|---:|---:|---|
| cost_fb > $5M (corpus) | 9,882 | 9,664 | large-lot legit |
| cost_fb > $5M (lowrise) | 7,951 | 7,795 | large-lot legit |
| cost_fb > $10M | 694 | 611 | large-lot legit |
| lowrise GFA > 1,500 m² | 237 | 183 | **0 mislinks** — big RD lots (FSI ~1.0, footprint ≈33% lot) |
| cost_addition > $50M | ($667M row) | 42 (max $117.7M) | huge-lot artifact (25K–88K m² estates/assemblies) |

Mislink class = **0** (the b16c036 flip + this re-derive cleaned it). The tail is
internally-consistent opportunity-menu maxima, not bugs.

**Watches** (BOUND family, parcel-sanity-audit.js, accepted-by-id exception lists —
count reads 0 until a NEW member crosses; then WARN distinctly):
- `lowrise_cost_fb_gt_15m` — `COST_FB_GT15M_LEGIT` (24 lowrise ids).
- `cost_addition_gt_50m` — `COST_ADDITION_GT50M_LEGIT` (42 huge-lot ids).
- `nulllot_on_gfa_or_cost_bearing` (A1.5) — no accept list; target 0 (now 0).

Sanity audit re-run: all three at **0**, 0 FAIL-GATED.

---

## B — CoA link trust

**Tiers (live):** 33,114 linked · ≥0.85 = 15,272 (46.1%) · 0.60–0.84 = 3,281 ·
<0.60 = 14,561 → **sub-0.85 = 17,842 (53.9%)**.

**B1 (live-bug fix, not verify):** added the **`>= 0.85` identity floor**
(`COA_IDENTITY_LINK_MIN_CONFIDENCE`, new `src/lib/coa/link-confidence.ts`) to every
identity read:
- `lead-inspect-query.ts` (cross-stream panel + linked-permit fetch, :838/:858) —
  a 0.60/0.10 link no longer surfaces the WRONG permit to the inspector.
- `coa/repository.ts` `getCoaByPermit`, `/api/coa`, `/api/permits/[id]` (CoA detail
  — `CASE`-suppresses sub-0.85).
- **Existence-checkers DECISION — floor APPLIED** (`pre-permits.ts` JS + SQL,
  `/api/admin/stats`): a sub-0.85 link is the same wrong-property class, so it must
  NOT suppress pre-permit surfacing. Unlinked-for-existence = `linked_permit_num IS
  NULL OR linked_confidence < 0.85`. **Delta: +131** CoAs (approved, ≤90d) now
  correctly qualify as pre-permits. Field is never cleared (read-time filter only).
- Contracts: Spec 60 §Link-CoA consumer contract + Spec 76 (linked-permit + badge).

**B2:** `coa_forward_link_sub085_pct` audit row (assert-data-bounds, after
orphan_link_count); threshold = new static logic_var
`coa_forward_link_sub085_warn_pct` = **59** (baseline 54 + 5); seed JSON + schema +
parity test added. Live run: **53.9% → PASS**.

**B3 (sample-verify 10 links at exactly 0.85):** all 10 show exact street_num +
street_name agreement (permit ward NULL — precisely why Tier 1b assigns 0.85).
**0.85 HOLDS** — no move to 0.95.

---

## C — CoA coherence

**C1 (consent/severance leak — RE-MEASURED post-P7 first):** NOT self-resolved as
hoped, but taxonomy is precise. Non-realtor active-trade CoAs: 827 severance / 696
B-file. Split: **271 are a clean LEAK** — "lot addition" (a severance land-transfer
term) mis-tagged with the construction `addition` tag → active ADD trades on
no-construction leads; **414 are legit sever+build** (real "construct new dwelling"
— must NOT be suppressed). Fix: negative-lookbehind in `ADDITION_PATTERNS`
(`(?<!\b(?:lot|land|parcel)\s)\baddition\b`) — drops the land sense, keeps building
additions. Applied to BOTH the JS lib AND the TS twin (dual-path parity). Regression
locks added (4 cases). **Realizes on the next CoA re-classify** (removes the 271; the
414 keep trades). Author's fence (COA_PROJECT_TYPE_MAP Severance/Mixed→null bundle)
PRESERVED — untouched.

**C2 (CoA cost tail):** 64 `estimated_cost > $10M` — investigated: all
`cost_source='archetype_parcel'`, avg 1,352 m² modeled GFA @ **$8,741/sqm**
(oversized-opt-envelope, matches hypothesis). Three per-APPLICATION WARN watches
added to the coa assert section (distinct from the parcel-level `coa_fsi_gt_5`):
`coa_estimated_cost_gt10m` (64, ≤80), `coa_app_fsi_gt5` (0; max coa_fsi 3.15, so `==
0` tripwire), `coa_maxbuild_gfa_gt3lot` (29, ≤45). All PASS.

**C3 (`coa_type_class` NULL 23.6%):** 7,864 NULL of 33,331 — 669 empty (unfixable),
7,195 non-empty. Extended the **description** patterns (the true derivation path) for
the material residential-ACCESSORY shapes: garden suite / detached garage / accessory
& ancillary building → residential. Recovers **~1,188** of the 7,195 addressable.
Deliberately left **~1,227 severance/easement/planning-act** descriptions NULL
(genuinely use-class-ambiguous — not chased to 100%). Coverage INFO row
`coa_type_class_null_pct` added to classify-coa-scope. Dual-path (JS+TS) + regression
locks. Realizes on next re-classify.

**C4 (semantic labels, docs-only):** one-sentence "opportunity menu ≠ applicant
scope" consumer note added to Spec 76 (archetype cost badge) + Spec 83 §3-ARCHETYPE.

---

## Validation summary
- Touched cheap steps re-run: parcel-sanity-audit (0 FAIL-GATED, new rows at 0);
  assert-data-bounds coa section (B2 + C2 rows PASS); enrich-parcels --full + cost
  compute (PASS). Migration 214 applied. Typecheck + targeted tests green (163).
- **Full-chain validation (permits/coa propagation + CoA re-classify) lands on the
  next daily run.**
