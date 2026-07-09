# P13 — Permits Trust-Assessment Fixes: validation + before/after

**Date:** 2026-07-09 · **Branch:** auto-unblock/validation-2026-05-23 · **DB:** postgres@localhost:5432/buildo
**Commits:** `e99ae61` (P13-1/P13-2) · `804d90f` (P13-3, gated) · `<P13-5/6/7>` · this report.
All numbers live-measured. Full test suite green each commit (7,644 passed / 272 skipped).

---

## P13-1 — magnitude gates on modeled cost + GFA (headline)

**Taxonomy of the model-source tail (before fix), model `estimated_cost > $50M = 2,442`:**

| GFA band | rows | min cost | max cost | max GFA |
|---|---|---|---|---|
| GFA > 100K m² | 2,024 | $50.0M | **$1.07B** | 1,885,730 m² |
| 50–100K m² | 189 | $50.1M | $412M | 99,782 |
| 20–50K m² | 165 | $50.5M | $309M | 49,300 |
| 10–20K m² | 64 | $52.4M | $93.5M | 19,743 |

Every sampled row is **mislinked whole-campus / whole-block massing GFA** attributed to a single
permit — e.g. Sunnybrook Health Sciences Centre's **792,439 m²** campus footprint priced at **$985M**
on an *"elevator cab replacement"* / *"demolish existing corridor ceiling"* permit; 264K–303K m² block
massing on a single condo *"fire-rating revision"*. Even genuine mid/high-rise buildings ("9-storey 112
units", "116-unit apartment") carry the whole-block massing GFA AND share it with trivial sub-permits
("Pool and whirlpool", "stairwell door" at $87–92M). **None are trustworthy per-row** — the GFA input
is corrupt.

**Exception list (accepted-by-id, ported `<> ALL(ARRAY[...])` from parcel-sanity-audit's P12-A2 convention, keyed on permit_num):**
the ONLY genuinely-large rows are 3 `archetype_rate` (lot-validated ladder) multi-unit developments —
`04 202812 BLD` (8-block/222-unit rowhousing, $104M) · `07 129713 BLD` (187 stacked townhomes, $99.9M)
· `06 196930 BLD` (72 stacked townhomes, $53.4M). Archetype sources max out at $104M and are exempt
(the archetype caps already bound them). The mislinked-massing model/permit tail is NOT accepted — it is
exactly what the gate must flag.

**Gates added** (`assert-data-bounds.js` cost block): `cost_estimate_over_ceiling` (estimated_cost >
`cost_est_legacy_cost_ceiling_cad` $50M, minus accepted) + `modeled_gfa_over_ceiling` (modeled_gfa_sqm >
`cost_est_legacy_gfa_ceiling_sqm` 50K m², scoped to `estimated_cost IS NOT NULL` so a nulled row drops out).

| gate | BEFORE | AFTER (post-clamp/one-off) |
|---|---|---|
| cost_estimate_over_ceiling | 2,822 | **0 (PASS)** |
| modeled_gfa_over_ceiling | 3,886 | **0 (PASS)** |

---

## P13-2 — the stale legacy tail: DECISION = null-and-flag (not cap)

**Verified nuance:** the June-stamped rows re-derive to identical values every run (the UPSERT writes
`computed_at` only on value change, IS-DISTINCT-FROM-guarded; SOURCE_SQL streams every permit). Staleness
≠ not-recomputed — the values ARE reproduced each run from the mislinked GFA. So capping is dishonest (a
wrong number stays wrong at $50M); **null-and-flag is the honest "we cannot price this" outcome.**

**Implementation (durable, not a transient one-off):**
- **Clamp** in `compute-cost-estimates.js`: a legacy (`model`/`permit`) row breaching either ceiling has
  `estimated_cost/cost_tier/cost_range_* → NULL` (cost_source PRESERVED, recording the legacy path was
  tried) + `legacy_bound_exceeded` audit row. Runs every compute → a one-off DB null can't be re-inflated.
- **One-off** `scripts/one-time/wf2-p13-null-legacy-cost-tail.js` applies it to the live corpus NOW (no
  full recompute): **4,474 legacy rows nulled** (model 4,065 + permit 409; backed up to
  `_backup_p13_legacy_cost_tail` with a one-UPDATE restore). Null rate **38.1% → 39.8%** (far below the 80% WARN).
- **Upper-sentinel guard** on the Liar's Gate permit-passthrough: declared `>= permit_declared_cost_ceiling`
  ($500M) → treated as placeholder (mirror of the $1K lower floor), model takes over. Catches the exact-$1e9
  round-number filings (2 rows on 38–39 storey towers; the permit-source tail was 380 > $50M / 213 ≥ $100M).
  Zod-validated + 3 unit tests + default-Infinity keeps legacy callers unchanged.

**Massing mislinks are OUT of scope** — filed as a HIGH follow-up with the top offenders (parcel ids
373902 @ 1.89M m², 373904 @ 897K/170 permits, 478447 @ Sunnybrook 792K/65 permits, …). Root fix =
massing→permit attribution per-BUILDING not per-PARCEL-sum.

---

## P13-3 — permit-side bundle-prior demotion: **GATED — HALTED for USER sign-off**

**Code landed** (`804d90f`): `classify-permits.js:618` + the `classifier.ts` dual-path mirror set the
archetype bundle-prior tier-2 emission to `is_active: false` (the permit twin of P6.6's CoA fix). Direct
tag/rule/fallback/realtor hits stay active (`merged.has(slug)` dedup guard); `applyScopeLimit` /
`NARROW_SCOPE_CODES` untouched; cost LATERAL reads all trades regardless of is_active (insulated).
Regression locks added (bundle→inactive, direct→active, scope-limit preserved, dual-path mirror).
**Fence check PASS:** the `is_active:true` literal was introduced by feature commit `f7a604a` (the bundle-prior
feature itself) — no `fix()`/Severity/Lesson-routing footer.

**PROJECTION (measured live):**

| axis | count | share of active permit trades |
|---|---|---|
| total active permit trades | 3,018,864 | 100% |
| tier-2 (all bundle) active | 2,751,954 | 91.2% |
| **tier-2 conf-0.55 (pure bundle prior) active** | **1,889,516** | **62.6%** |

The `!fromBundle`-style demotion flips **~1.89M rows inactive** → a **forecast-input shrink of ~62.6%**,
which **exceeds the 50% GO/NO-GO threshold**.

> **⛔ HALT — awaiting the USER's own sign-off.** Per the plan (step iv) and my standing instruction, the
> corpus RESET + RE-RUN is gated on user confirmation. A coordinator-relayed "GO" was received but carries
> no user authority, so I did **not** run any reset or re-run. The DB still holds the pre-fix
> (bundle-active) state. On sign-off, realize with the P6.6 discipline: back up permit_trades state →
> null the classify-permits incremental key scoped to affected permits → `node scripts/classify-permits.js`
> standalone → verify the flip → let the nightly chain re-derive forecasts/scores (do NOT run the engines
> directly; note the expected next-run urgency/score delta, Spec 48 §3.7 pre-ack).

---

## P13-4 — opportunity-score price-gap breakdown

**Score coverage re-measured: 82.6%** (1,514,155 / 1,832,103 forecast rows have a priced parent).
Down from the pre-P13 ~85.4% — the honest reduction from P13-2 nulling the mislinked legacy tail.
**Still above the 80% floor** (the gate now PASSES).

**Uncovered 317,948 rows (17.4%) — by parent cost_source:**

| bucket | rows | leads | disposition |
|---|---|---|---|
| `none` — construction | 254,074 | 46,579 | see split below |
| `none` — non-construction (safety/admin) | 1,743 | 943 | correctly-none by-design (permit_type_class gate) |
| `model` (P13-2 nulled) | 41,215 | 2,974 | honest mislinked-massing discard |
| `permit` (P13-2 nulled) | 9,173 | 391 | honest mislinked-massing discard |
| NO_COST_ROW (orphan) | 11,743 | 1,099 | forecast with no cost_estimates row |

**The construction-`none` split (by permit_type):**

| permit_type | rows | leads | class |
|---|---|---|---|
| Small Residential Projects | 78,021 | 4,058 | **priceable-but-none residue** |
| Building Additions/Alterations | 76,779 | 5,845 | **priceable-but-none residue** |
| New Building | 40,475 | 1,560 | **priceable-but-none residue** |
| New Houses | 8,378 | 293 | priceable-but-none residue |
| Non-Residential Building Permit | 8,198 | 602 | priceable-but-none residue |
| Residential Building Permit | 8,164 | 602 | priceable-but-none residue |
| Mechanical(MS) | 15,292 | 15,013 | **permanently unscoreable-by-design** |
| Plumbing(PS) | 14,759 | 14,681 | **permanently unscoreable-by-design** |
| Drain and Site Service | 3,729 | 3,661 | **permanently unscoreable-by-design** |
| Demolition Folder (DM) | 264 | 259 | **permanently unscoreable-by-design** |

- **Permanently unscoreable-by-design (~34,044 rows / ~33,614 leads):** Mechanical/Plumbing/Drain/Demolition
  — trade-specific permits with NO floor-area-proportional cost semantic (Spec 83 §3(d): the safe-skip IS
  the permanent correct behavior). These are ALREADY suppressed (cost_source='none' → no score cost) — no
  new code needed; documenting is the deliverable.
- **Priceable-but-none residue (~220K rows):** genuine construction on buildings the archetype ladder/T4
  couldn't price = the **§4D cost-menu propagation-COVERAGE gap** (Spec 83 :134, "the single biggest lever")
  — already tracked as a follow-up, not a P13 code change.
- **P12-A1 recovery:** A1's NULL-lot backfill already ran (`49dfd93`); 9,555 none-leads sit on
  geom-backfilled parcels yet stay none (they got a lot but hit the non-lowrise/propagation gap). No
  further recovery is pending from A1 — its lift is already in the 82.6%.

**Score-or-suppress decision:** no CLEAN new bucket emerges that isn't already suppressed (trade-specific)
or already filed (propagation gap). Outcome documented; no new code.

---

## P13-5/6/7 — visibility + docs

- **P13-5** synthetic-share provenance (`synthetic_share_*` INFO rows in compute-trade-forecasts): live —
  imminent **97.9%** synthetic, upcoming 85.6%, overdue 27.1%, **delayed 0%** (delayed rows carry real
  calibration). The imminent bucket (58%+ of forecasts) is 97.9% manufactured — now labelled at source.
- **P13-6** `bid_value` honest coverage INFO row (permits 0% / coa 100%) in assert-lifecycle-phase-distribution.
  Traced: bid_value is a universal_stream_catalog 0–1 lead-value weight; the coa path writes it, the permits
  path never does — though the catalog carries bid_values for 30/53 permit statuses. A populate GAP (not
  link_wsib/Spec 46), filed as a follow-up.
- **P13-7** Spec 83 §3 Step D documents the P13-2 upper sentinel + the legacy magnitude clamp (was
  lower-guard-only); the archetype opportunity-menu consumer note (:88) already covers P12-C4/P13-7 coherently.

---

## P14 evidence note (observation only — no scope change)

The construction-`none` split is direct evidence for the P14 trade-attachment redesign: **Mechanical(MS)
15,013 leads, Plumbing(PS) 14,681, Drain 3,661** are trade-specific permits with NO valid archetype-bundle
semantic, yet the bundle prior derives from `project_type` + `scope_tags` and can still attach a full
building archetype (a mechanical permit potentially inheriting a 32-trade FB bundle). **Bundles should be
conditioned on `permit_type`** — a trade-specific permit's bundle should be its own trade, not the whole
building's archetype. Inspection ground-truth for these permit_types (do MS/PS leads ever involve the
bundle's other trades?) would let P14 separate informative bundles (New Building / Additions) from pure
noise (trade-specific).
