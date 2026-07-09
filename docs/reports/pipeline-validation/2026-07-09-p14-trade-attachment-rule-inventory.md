# P14-A — Trade-Attachment Rule Inventory (current state)

_The complete catalogue of every mechanism that attaches or gates a trade onto a permit or CoA
lead today, with file:line + the WHY. Feeds the Spec 80 §5.C CURRENT-state table (P14-A baseline).
The P14-D decision finalizes §5.C; this document is the "before"._

**Scope note:** The LIVE trade classifier is the **inline `TAG_TRADE_MATRIX` + archetype bundle
prior**, NOT the DB `trade_mapping_rules` table. Verified 2026-07-09: `trade_mapping_rules` carries
only **6 active tier-1 rows** (all `match_field='work'`); the 20 tier-2 + 73 tier-3 rows are
`is_active=false`. The inline matrix superseded them (memory: "0 Tier-3 description rules in
production").

---

## 1. The permit-side attachment pipeline — order of operations

`classifyPermit(permit, rules, runAt, realtorAvailable, permitClass, bundleConf)` —
`scripts/classify-permits.js:487-633`. Runs these steps in order:

| # | Mechanism | File:line | Tier / is_active | Why (blame / spec) |
|---|---|---|---|---|
| 0 | **Phase determination** `determinePhase` | `classify-permits.js:118-133` | — | status/issued_date → `early_construction/structural/finishing/landscaping`. Feeds `lead_score` phase-match boost (`:174-177`) + written to `permit_trades.phase`. NOT an attachment gate on the permit side. |
| 1 | **Tier-1 DB rules** (`trade_mapping_rules`, `is_active AND tier=1`) | loaded `:688-692`; matched `:494-521` | tier 1, active=true | 6 live rows, all `match_field='work'`. `fieldMatches` includes-match (`:348-372`). |
| 2 | **NARROW_SCOPE early-return** | codes `:377-390`; branch `:524-548`; `extractPermitCode` `:408-412` | tier 1, active=true | Permit_num embedded code (PLB/HVA/DRN/…) → the permit is that trade family BY DEFINITION. If tier-1 hits, `applyScopeLimit` filters to the allowed set; else fallback = the code's allowed trades @0.80. **Bypasses steps 3-5 entirely** (bundle prior never runs for narrow-scope permits). WF2 #2 precision fix. |
| 3 | **Tier-2 tag-trade matrix** `lookupTradesForTags` | matrix `:227-288`; lookup `:293-305`; merge `:550-576` | tier 2, active=true | `scope_tags` → trades w/ confidence (MAX-dedup). The primary EVIDENCE path. |
| 4 | **Work-field fallback** (only if steps 1+3 = 0) | `WORK_TRADE_FALLBACK:310-333`; `DEFAULT_FALLBACK:334`; apply `:579-597` | tier 1, active=true, `fromFallback:true` | Coarse `work`→trade set so an unmatchable permit still emits SOMETHING. `fromFallback` marks it WEAK (excluded from `trades_strong_signal`). |
| 5 | **Archetype bundle prior** `deriveArchetypes`→`bundleSlugsFor` | derive `archetypes.js:191-205`; emit `classify-permits.js:600-629` | tier 2, **active=FALSE (P13-3)**, `bundleConf` (0.55) | Recall boost: lights up implied trades the tag/rule path misses (the low-signal finish + service trades). **P13-3 (`804d90f`) demoted these to `is_active=false`** — they persist for vocab coverage but no longer inflate forecast/score. `merged.has(slug)` guard: a direct hit already won the slot stays active. |
| 6 | **applyScopeLimit** (WORK_SCOPE_EXCLUSIONS) | codes `:377-406`; apply `:414-432` | — (filter) | Post-merge: subtracts implausible trades by `work` string (e.g. `interior alterations` → drop excavation/roofing). Runs AFTER the bundle merge so it gates bundle emissions too. |
| 7 | **applyClassGating** = `filterTradesByClass` + realtor append | `classify-permits.js:477-485` | — (filter + append) | Per `permit_type_class` (mig 120): construction=all, administrative/unclassified=none, safety_upgrade=[electrical,fire-protection], signage=[electrical,structural-steel]. Then conditional realtor append. |
| 8 | **Realtor append** `appendRealtorMatch` + `shouldAppendRealtor` | append `:447-467`; gate `permit-type-classifier.js:167-172` | tier 1, active=true, conf 1.0 | trade_id 33. 3-axis gate: class=construction ∧ permit_type∈REALTOR_RELEVANT_TYPES ∧ 'commercial'∉scope_tags. Spec 91 §1.2. |

**Dedup:** `(permit_num, revision_num, trade_id)` keep-highest-confidence (`:794-803`).
**Precision telemetry:** `trades_strong_signal` (conf > bundle tier ∧ !fromFallback) vs
`trades_bundle_or_fallback_only` (`:724-728`, `:809-813`).

---

## 2. The matrices + tables (the vocabularies)

| Artifact | File:line | Shape | Why |
|---|---|---|---|
| `TAG_TRADE_MATRIX` (permit, LIVE) | `classify-permits.js:227-288` | 58 tag keys → `[slug,conf]` | The real Tier-2 classifier. **Live JS twin OMITS `pool-installation` + `temporary-fencing` that the TS twin (`tag-trade-matrix.ts:18-463`) carries** — so several trades are bundle-only on the live path (see §4 starvation). |
| `TAG_ALIASES` (permit) | `classify-permits.js:202-219` | 16 aliases | Normalize scope_tag spellings → matrix keys (`roofing→roof`, `2nd-floor→addition`). |
| `WORK_TRADE_FALLBACK` | `classify-permits.js:310-333` | 22 `work` patterns → slugs | Coarse fallback when tag/rule path empty. |
| `NARROW_SCOPE_CODES` | `classify-permits.js:377-390` | 12 permit_num codes → allowed slugs | The permit-type-prefix ceiling (see §3). |
| `WORK_SCOPE_EXCLUSIONS` | `classify-permits.js:392-406` | 15 `work` patterns → excluded slugs | Post-merge subtractive gate. |
| `ARCHETYPE_BUNDLES` | `archetypes.js:31-119` | 11 codes → `{trades,products}` | The bundle-prior complement per archetype. FB=32, LANE=32, ADD=26, BAS=18, INT=13, KIT=10, BTH=11, ENV=7, MEC=6, SITE=9, GAR=12. |
| `TAG_ARCHETYPE` | `archetypes.js:121-171` | scope_tag → archetype code | Which archetype a tag implies. |
| `PROJECT_TYPE_ARCHETYPE` | `archetypes.js:173-181` | project_type → code | new_build→FB, addition→ADD, renovation→INT, mechanical→MEC, demolition/repair/other→null. `repair`→[] early-return (`deriveArchetypes:195`, WF3 precision fix). |
| `permit_type_class` allowlist | `permit-type-classifier.js:110-116` | 5 classes → policy | mig 120; construction=all, admin/unclassified=none, safety_upgrade/signage=narrow. |
| `REALTOR_RELEVANT_TYPES` | `permit-type-classifier.js:145-151` | 5 permit_types | Realtor axis-2 gate. |

---

## 3. permit_type-prefix / permit_type semantics (two DISTINCT signals)

There are **two** independent "type" signals, often conflated:

- **`permit_num` embedded code** (`extractPermitCode`, `\s[A-Z]{2,4}\s`) → `NARROW_SCOPE_CODES`.
  Live corpus counts (2026-07-09): **BLD 109,561** (full building — NOT narrow, reads full matrix),
  **PLB 45,942** (→plumbing), **HVA 41,010** (→hvac), **DRN 14,194** (→drain-plumbing),
  **PSA 7,354** (→plumbing), **FSU 6,895** (→fire-protection), **DEM 3,139** (→demolition),
  **STS 2,573** (→drain-plumbing), **MSA 2,533** (→hvac), **TPS 635** (→framing,electrical),
  **PCL 311** (→electrical,plumbing,hvac). Also `SHO`→shoring-family, `FND`→foundation-family.
  A narrow code **early-returns before the bundle prior** — the strongest, cleanest attachment gate.
- **`permit_type` string** (e.g. `Plumbing(PS)`, `New Building`) → `permit_type_class` (mig 120).
  Gates the whole matrix (construction vs none/narrow) + realtor eligibility. Coarser; a
  `Plumbing(PS)` permit_type does NOT guarantee a PLB permit_num code.

**Consequence measured in P14-C scenario 5:** the "permit-type plumbing ceiling" is already
implemented for code-carrying permits via NARROW_SCOPE early-return (they are identical pre/post
P13-3 — they never received bundles). The explicit ceiling adds value only for plumbing/mechanical
*permit_types* whose permit_num lacks the code — a small residual.

**`structure_type`:** selected into the classifier (`:764`) but the permit-side trade logic does
**not** branch on it. It matters only in the COST path — `isLowRiseResidential`
(`archetype-cost-map.js:110-113`) gates the archetype cost ladder, and the laneway/rear-yard-suite
structure override forces the `laneway_suite` line (`mapToLines:162-165`).

---

## 4. tier / confidence / is_active semantics (post-P13-3 / P6.6)

- **tier 1** = DB rules, narrow-code fallback, work-fallback, realtor. **tier 2** = tag-matrix +
  bundle prior. (Tier 3 DB rules are inactive.)
- **confidence** = per-matrix value (0.55–0.95); bundle-tier default 0.55 (`archetype_bundle_confidence`
  logic_var). A "strong" signal = conf > bundle tier ∧ not fallback.
- **is_active** — the P13-3/P6.6 precision contract:
  - Permit side (`classify-permits.js:624`, P13-3 `804d90f`): **bundle-prior emissions = `is_active=false`**;
    direct tag/rule/fallback/narrow/realtor = `is_active=true`.
  - CoA side (`coa-trade-classifier.js:304`, P6.6): `is_active = !fromBundle` — identical contract
    (`fromBundle` = archetype bundle is the slug's SOLE source).
  - Downstream: forecasts + scores + the served feed read `is_active=true` only; the trade-vocab
    coverage gate has NO is_active predicate (bundle rows still count for coverage).

**Starvation consequence (P14-C, measured corpus-wide):** 13 trades have **0 active rows** post-P13-3
— every trade the live JS `TAG_TRADE_MATRIX` never emits directly (bundle-only): `caulking`,
`decking-fences`, `eavestrough-siding`, `millwork-cabinetry`, `overhead-doors`, `pool-installation`,
`security`, `site-maintenance`, `site-preparation`, `solar`, `stone-countertops`, `tiling`,
`trim-work`. A contractor in any of these receives zero leads today.

---

## 5. The CoA side (parallel machinery)

| Mechanism | File:line | Note |
|---|---|---|
| `classifyCoaTrades` = tag-matrix path + bundle prior | `coa-trade-classifier.js:292-306` | MAX-dedup; `fromBundle` = sole-source flag. |
| `TAG_TRADE_MATRIX` (CoA) | `coa-trade-classifier.js:111-171` | Twin of the permit matrix. |
| `TAG_ALIASES` (CoA) | `coa-trade-classifier.js:57-97` | Superset — adds CoA vocab (`dwelling→build-sfd`, `renovation→interior`). |
| `COA_PROJECT_TYPE_MAP` | `:215-222` | PascalCase → permit key. NewConstruction→new_build(FB), Addition→ADD, Alteration→renovation(INT). **Demolition/Severance/Mixed → null** (no construction). |
| `COA_TAG_TO_ARCHETYPE_TAG` | `:235-249` | CoA scope_tag → TAG_ARCHETYPE key. |
| `deriveArchetypesForCoa` | `:266-278` | Translates CoA vocab → shared `deriveArchetypes`. |
| `shouldAppendRealtor` (CoA) | `:376-379` | `coa_type_class==='residential'`. |
| `determineCoaPhase` | `:365-367` | Returns null → `isTradeActiveInPhase(slug,null)` passes through (no construction stage at CoA time). |

**Root cause history (P6.6):** CoA `is_active` was hardcoded `true` for every emitted trade, so
NewConstruction→FB=32-trade bundles landed all-active (median 33/35 active). `is_active=!fromBundle`
(`804d90f` era) fixed it — the CoA twin of P13-3.

---

## 6. The candidate scope detector — `mapToLines` (the cost mapper)

`src/features/leads/lib/archetype-cost-map.js:132-216`. The cost model ALREADY decides "this project
= these archetype lines" from the SAME inputs (project_type + scope_tags + structure_type) — the
P14 hypothesis is that trades should flow from this same detection.

| Artifact | File:line | Note |
|---|---|---|
| `mapToLines(lead)` | `:132-216` | Returns `{lines[], mapKind}` or null (T4). |
| `TAG_LINE` | `:55-90` | scope_tag → cost line (leaner + different vocab than TAG_ARCHETYPE). |
| `FB_TAGS` + FB-gate | `:54`, `:148-152` | Building-type tag maps to `max_build` ONLY when project_type=new_build (the ~7K mechanical-permit trap). |
| `DOMINANCE` | `:94-95` | Higher line prices the whole project (avoid double-count). **Cost aggregates by dominance.** |
| `ADDITIVE_PAIRS` | `:98-102` | underpin+basement, kitchen+bath, gut+addition → BOTH lines. |
| `RENO_BUILD_TRADE_THRESHOLD` | `:104` | ≥9 active trades + build scope → escalate to max_build. |
| `LINE_DEFS` | `:34-47` | 12 lines. line→archetype for the P14-C union: max_build/coa_build→FB, addition→ADD, gut→INT, underpin/basement→BAS, garage→GAR, laneway/garden→LANE, kitchen→KIT, bath→BTH, solar→ENV. |

**The union-vs-dominance nuance (user 2026-07-09):** cost aggregates by DOMINANCE (one line prices
the project, avoids double-counting dollars); trades should aggregate by UNION of detected lines
(the addition's framers are real even when the garden suite dominates the price). P14-C scenario 3
implements the union — and finds it does NOT beat the baseline because each line's "complement" IS
the coarse `ARCHETYPE_BUNDLES` set (see the evaluation report §Synthesis).
