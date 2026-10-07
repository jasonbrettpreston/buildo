# McBylaw Phase 1 — S0.5 spike report

**Status:** DONE 2026-10-06/07 (kill criteria declared in §0 BEFORE any measurement; results in §1–§3)
**Date:** 2026-10-06 · **Plan:** `docs/reports/mcbylaw-phase1-plan.md` §S0.5 (drafted from `.cursor/mcbylaw/wf1_mcbylaw_phase1_active_task.md` v0.5 — working artifact, not committed) · **Ruling:** Spec 69 M-44
**Worktree:** `C:/Users/User/Buildo-wt-mcbylaw-spike` (branch `wf1/mcbylaw-spike` from `origin/wf2/deep-scrapes-restore-l0` 2422bac9) · artifacts in its `.cursor/mcbylaw-spike/` (working artifacts, not committed). Every `item1/…`, `item4/…`, `item5_7/…`, `item6/…` path below is relative to that directory.
**Committed copy (S1, 2026-10-07):** copied as-is except for these path notes. The operator's S1 rulings on §3 are Spec 69 M-47..M-51 and the dated notes on M-17, M-36 and M-44.
**Execution provider:** keyer A = claude; keyer B = deepseek (direct API, no tools); evaluator prototype, adjudication timing, research = claude (verification seats / citations — plan §Context downgrade list).

## 0. Kill criteria — declared before measuring (copied verbatim from plan S0.5 + Spec 69 M-44)

| # | Item | Measure | Criterion → remedy |
|---|---|---|---|
| K1a | Blind A/B double-key, 25 regulations (≈ 60 clause units) | agreement per ⧉ field | `numeric_expression` **or** `bound` agreement **< 80 %** → grammar / vocabulary redesign + re-spike before S6 |
| K1b | same | operator minutes per disagreement (timed) | mean adjudication **> 2 min per unit** → narrow the ⧉ set to `archetype` / `target` / `bound` / `numeric_expression` (a Spec 69 row + the Spec 68 §6 edit) |
| K1c | same | measured rate | a rate **between 70 % and 90 %** (inside the ≈ ±10-point interval at n ≈ 60) → extend to 50 regulations before deciding |
| K2 | Off-vocabulary targets | keyer proposals outside the draft `dsl_target` | **> 5 %** → redesign the vocabulary before S5 |
| K3 | True UNUSUAL share on the keyed units | share | **> 8 %** → revisit the archetype set before A1 |
| K4 | DSL + evaluator prototype on the 14 §7.3 fixture clauses + RD 1462 FSI bands + 600.60.40(2)(A) (+ 10.20.40.70 bands); six Spec 67 worked examples + V1–V25 with a `vector_status` each | expressibility + numeric match | **any inexpressible `by_law_expected` vector** → grammar change before S6; **any numeric mismatch** → explained (which side is wrong, citing the clause) or fixed |
| K5 | G-UNIVERSE TOC prototype over all pinned pages (chapter-level for unpinned chapters) | unmapped residential TOC entries | **any unmapped residential entry** → a page-set ruling at S1, before S3 |
| K6 | In-force desk research, 10 largest amending by-laws by tagged clauses | status + citation | **≥ 1 under appeal** → the `not_verified` notice is mandatory in P-1; recorded, **no kill** |
| K7 | INCLUDE-chain closure / cycle check over the `phase0b/` edges | cycles, depth | **a cycle or depth > 3** → Phase 2 note (no kill) |

Applied mechanically: each criterion's outcome is PROCEED / REDESIGN (what) / EXTEND.

## 1. Outcome per criterion (applied mechanically)

| # | Measured | Criterion | Outcome |
|---|---|---|---|
| K1a | `numeric_expression` **49/51 = 96.1 %** (50/51 if bare `0.45` ≡ `0.45 ratio`); `bound` **51/51 = 100 %** | < 80 % | **PROCEED** |
| K1b | proxy: 10 packets adjudicated in 76 s wall-clock = 7.6 s/unit (model time — NOT operator time); reading proxy: mean packet 61 words (max 170) ≈ 1 min/unit for a person | > 2 min/unit | **PROCEED** (proxy only; operator time is measured at A1) |
| K1c | the K1a fields are at 96–100 %, outside 70–90 % | rate in 70–90 % | **PROCEED** for the kill fields. Caveat: read per ⧉ field, `calculation_handling.status` 82.9 % and `user_inputs` 74.3 % sit in the band, and six fields are < 70 % (§2.2) — see §3 rec. 1 |
| K2 | off-vocabulary targets **0/51 (A) and 0/51 (B) = 0 %**; other off-vocab tokens 0 | > 5 % | **PROCEED** (caveat: the vocab was drafted by the orchestrator after reading the sample texts; one semantic misfit — RD 1462 "FSI" valued in m² — split A `gfa_m2` / B `fsi`) |
| K3 | UNUSUAL **0/70 = 0 %** (both keyers) | > 8 % | **PROCEED** (caveat: A logged 9 units where it forced a LIMIT/DISAPPLY although a sub-condition was inexpressible) |
| K4 | fixtures: 15/16 expressible but only 10/16 in the published grammar; 600.60.40(2)(A) inexpressible. Vectors: 109 (100 `by_law_expected`, 7 `model_composite`, 2 `no_expected`); of the 100: **52 match · 5 mismatch · 34 not_evaluated · 9 inexpressible** | any inexpressible `by_law_expected` vector → grammar change; any mismatch explained or fixed | **REDESIGN (grammar, before S6)**: 9 inexpressible (7 explicit "not limited / no coverage applies" arms; 2 RT front-landscaping 10.5.50.10(1)(A) "front yard excluding driveway"). The 5 mismatches are all **explained — the vector side is wrong** (KFM-4: V1–V4 + V25 side supply measured frontage; 10.20.40.70(3) keys on required minimum lot frontage = label f; with f = frontage the DSL reproduces 0.6/0.9/1.8/3.0/1.8) |
| K5 | 419 TOC entries over 31 pages, 0 pages with 0 entries; **23 residential-touching entries MISSED** + 1 undetermined (Ch.500 heritage districts) | any unmapped residential entry | **REDESIGN (page-set ruling at S1, before S3)** |
| K6 | top 10 by tagged clauses: 9 status-verified, 848-2025 `not_verified`; **849-2025 `partially_in_force`** (one property-specific appeal) | ≥ 1 under appeal | **RECORDED (no kill): the `not_verified` notice is mandatory in P-1** |
| K7 | **0 cycles**, 0 self-refs, max depth **2**, 1,076 edges, 0 unresolved targets; ≥ 100 INCLUDE-closed = **519** | cycle or depth > 3 | **PROCEED** (no Phase 2 note) |

## 2. Detail

### 2.1 Item 1 — sample and blindness
- **Sample rule (declared before keying):** purposive-stratified per plan S0.5: the plan's named sets (RD side bands 10.20.40.70(3), R zone rows, 150.7, 600.60.40, 10.20.40.70) + RS/RT/RM side and height + 10.5 + the 900.1.10(3) precedence unit + 5 exceptions from the §7.3 fixture list. Covers tiered (bands), formula (max), branch (by_type), conditional, map_lookup, DISAPPLY, PREVAILING, PROHIBIT, PROCEDURAL. **25 regulations, 70 clause units** (20 standard → 55, 5 exceptions → 15): 10.20.40.70(2)(3)(6), 10.20.40.20(1), 10.20.40.40(1), 10.10.40.70(3), 10.10.40.40(1), 10.40.40.70(3), 10.40.40.10(1), 10.60.40.70(3), 10.80.40.70(3), 10.80.40.10(1), 10.5.50.10(3), 150.7.60.40(1), 150.7.60.30(1), 150.7.60.40(7), 900.1.10(3), 600.60.40(1)(2)(3), RD 5, RD 1462, RD 1463, RM 18, R 604.
- **Unit rule (declared):** a unit = a top-level lettered clause with its stem; romans stay in the parent unless one lettered clause holds two independent rules (RD 5 (C)(i)/(ii)); a regulation whose lettered items are only the arguments/conditions of one stem value is one unit (`#whole`). **Finding:** this needed judgment on 4 regulations — Spec 68's "leaf clause unit" is not mechanical for list-of-types and conditions-as-items clauses; S4 must state the rule.
- **Keyer A** = a fresh-context Claude agent that read only the 3 brief files. **Seal** (`seal.json`, id 1, 2026-10-07T01:30:17Z) before B: A shas `5706031c…200a` / `d21ab0aa…14b1` / `257da66d…2928`; brief shas `d22e2b84…ce05` / `80cd6b75…e978` / `25393235…f7ec`.
- **Keyer B** = DeepSeek `deepseek-reasoner` via a no-tool chat completion (`item1/keyer-b.cjs`; refuses without the seal). Its only input is the brief (public text + brief + vocab; Spec 68 §10 data boundary). Neither `deepseek-review.js` (fixed adversarial system prompt) nor `deepseek-exec.js` (tool loop) has a prompt-only mode; this API call is the no-tool route. 3 shards, 99–167 s, 32.9K/50.9K/41.7K tokens, 70/70 units, 0 parse errors. Per-shard `.prov.json` records brief sha, A seal, model, read paths.

### 2.2 Agreement per ⧉ field (canonical projections; evidence phrases and free text not compared) [measured]
"Applicable" = either keyer gave a non-none value (strict denominator).

| Field | Applicable agree | % | | Field | Applicable agree | % |
|---|---|---|---|---|---|---|
| archetype | 70/70 | 100 | | application.zones | 67/69 | 97.1 |
| target | 50/51 | 98.0 | | application.building_types | 70/70 | 100 |
| bound | 51/51 | 100 | | application.lot_conditions | 32/50 | 64.0 |
| numeric_expression | 49/51 | 96.1 | | application.uses | 8/12 | 66.7 |
| condition | 29/47 | 61.7 | | calc_handling.status | 58/70 | 82.9 |
| applies_to_part | 68/70 | 97.1 | | calc_handling.not_modelled_reason | 10/23 | 43.5 |
| literals_not_expressed | 4/9 | 44.4 | | calc_handling.user_inputs | 26/35 | 74.3 |
| instrument | 2/5 | 40.0 | | requirement / evaluated_by_us / ranks_layers | 1/1 · 5/5 · 1/1 | 100 |

- Units with every field agreeing: **34/70**; units with ≥ 1 disagreement: 36 (89 field disagreements). After three convention fixes (no keying of the generated `exception_area` layer — 14 units; bare number ≡ ratio; instrument compared by kind + by-law number) **26 units / 59 fields** remain.
- Off-vocab: A 0, B 0. Archetype distributions identical (LIMIT 51, DISAPPLY 7, PREVAILING 5, PERMIT 2, PROHIBIT 2, PROCEDURAL 1, REQUIRE 1, DEFINE 1).
- **Parseability:** 99/104 keyer statements parse in the item 4 parser; all 5 failures are bare FSI numbers (my brief said "ratio = bare number" but the parser requires the `ratio` token) → 104/104 once one convention is fixed.
- **Agreement ≠ correctness (Known limit 2, observed):** both keyers keyed 900.1.10(3) `ranks_layers` = exception > **[base]**, omitting overlay — but "Chapters 5 to 800" includes Ch.600, so Spec 68 §6's `exception > base, overlay` is right. **Cause: my brief defined base as "Chapters 5–800"** (orchestrator error, recorded). Both also left 10.x.40.10(1)(B) ("if no HT value, 10.0 m") with no evaluable condition, and both dropped 10.20.40.70(6)(B) "adjacent lot fronting on the street".

### 2.3 Adjudication packet and timing proxy
`item1/packet.json` (36 units) and `item1/adjudication-timing.log` (10 adjudicated, decisions + reasons). Main causes: the `exception_area` convention; literal tokenization ("1.0 to 1.5", repeated "80 percent", number words five/six); evidence scope (zones inherited from a sibling clause); `calculation_handling` keyed blind by B with no code knowledge (the spike redefined it as "evaluable from the lot vector" — **finding: as specified the status needs code knowledge B must not have**); missing scenario inputs (garden-suite distance, lowest-level design facts). **Cost re-estimate (inferred):** 26–36 packets per 70 units ≈ 37–51 %; ≈ 607 rows × 2.09 units (Phase 0b clause ratio) ≈ 1,270 units → ≈ 470–650 packets ≈ 8–11 operator-hours at ≈ 1 min each, unless the conventions below are fixed first.

### 2.4 Item 4 — DSL + evaluator (prototype `item4/dsl.cjs`, selfTest 31/31 PASS, re-run by me)
- RD 1462 bands fit only target `gfa_m2` ("FSI … is the lesser of 0.6 times the lot area or 204 square metres" is an area). 10.20.40.70(3) as one `band()` unit = 7 conditional units on 75/75 frontages. M-38 fixture: 600.60.40(1)(B) through `permitted()` → permitted; ablation → prohibited.
- Not evaluated (34): 18 building type unknown; 6 front setback (10.5.40.70(1) averaging); 6 secondary-suite branches; 4 driveway/parking inputs.
- Code/spec findings: (a) "Despite 10.20.40.70(3)" in (6) makes rule 2 drop every (3) unit (interior side → not_evaluated) → limit `displaces[]` to the displacer's own target; (b) §7.5 rule 3 tie wording; (c) building_type NULL — evaluate all types, return a value only when all agree (matches V12) → needs an M-row.
- **Grammar changes before S6** (each tied to a clause): an `unlimited` value distinct from not_evaluated (10.x.40.10(3)(B), 10.x.40.40(1)(B), 10.x.30.40(1)(B)); presence tests `mapped(HT)`/`labelled(f)`/`not` (10.x.40.10(1)(B), 600.60.40(1)(A)); max/min with an absent map argument (10.x.40.10(1)(C)/(D)); `other` key in `by_type` (10.80.40.10(1)(B)(ii)); multi-token conditions (10.20.40.70(6)); argument-level displacement (600.60.40(2)(A) → (1)(C)(ii)); a "percent of a stated base" form (10.5.50.10(1)(A)); a named enactment-date token for `existing()` (RD 587); per-building-type conditions in `application` (10.10.40.70(3), 10.60.40.70(3)(B)(vi)); `ratio` literal unit (bare numbers); vocab additions (`all_units_front_street`, `has_secondary_suite`, scenario inputs for suite distance and lowest-level design, Sixplex-overlay membership in the lot vector).
- Artifacts: `item4/fixtures.dsl.json` (136 units), `item4/eval-vectors.draft.json` (109 vectors, the S6b draft), `results.json`, `run-output.txt`.

### 2.5 Item 5 — TOC (G-UNIVERSE prototype)
- Every page lists the same 26 chapters; sections only for its own chapter (0 foreign rows) [measured]. 419 entries: 333 section-level, 11 chapter-level, 10 by draft M-37 rule, 41 not residential, 1 undetermined, **23 missed**: 1.20, 1.40; 150.15, 150.20, 150.22, 150.25, 150.30, 150.45, 150.48, 150.50; 200.10, 200.15, 200.20, 200.25; Ch.220, Ch.230; 970.30; Ch.990 (zone map — needs an external/map rule); 995.20, 995.30, 995.41, 995.50, 995.60.
- Chapter-level "other zone → out" rules are not clean: residential exceptions cite 40.10.40.10, 40.10.20.10, 80.5.40.40, 80.10.40.40, 15.10.40.50 → clause-level carve-ins.
- **Phase 0 page-set defect:** each chapter-URL page holds only its first section (ch1 = 1.5, ch200 = 200.5, ch995 = 995.10 …); `ch150_13` and `ch970` are pinned but not sliced by `universe.js`; ch1_5/ch5_10/ch150_5/ch900_1 duplicate ch1/ch5/ch150/ch900; ch200_5 differs only by a stray prefix.

### 2.6 Item 6 — in force (`item6/status.json`, PDFs + pages saved)
Ranking (standard pages, tagged clauses): 648-2025 120 · 1062-2025(OLT) 92 · 608-2024 92 · 89-2022 44 · 101-2022 38 · 1509-2025 36 · 474-2023 29 · 848-2025 23 · 1508-2025 23 · 849-2025 18 (654-2025: 6 on the unpinned 600.60 page). Status: in_force (verified_primary) 648, 1062(OLT), 608, 89 (date unreconciled), 101, 1509, 474, 1508; **849-2025 partially_in_force**; **848-2025 not_verified** (also 847-2025, 559-2014; Council/notice pages returned 403). **R-10 answered:** 654-2025 s.4 ties force to 648-2025, and the City states both in force (verified_primary). "(OLT)" = made by Tribunal order. Under-appeal provisions are shown in the consolidation with shading (9 bright-yellow 2013-original blocks on standard pages; R 101 "391-2021 Under Appeal" on ch900_2), so a tag alone says nothing about status.

### 2.7 Item 7 — INCLUDE closure (`item5_7/item7_include.json`)
3,019 exceptions sliced; 1,076 strict edges (1,081 broad), 13 targets; 0 cycles; depth histogram 966 × 1, 109 × 2. Panel figures all reproduced: 519 / 515 / 300,616 / 339,125 / RD 1462 rank 2 (38,512) / RS 336 rank 5 (8,249) / RT 352 rank 19 (2,323). The fourth closure-added exception is **RM 473** (0 direct, 395 closed). Side findings: `phase0b/census.js` closure is non-transitive (membership unaffected); `slice.js` misses 4 oddly cased headings (all < 100 lots).

## 3. Recommendations (for the operator at S1)
1. Before A1, fix the conventions that produced most disagreements (no keying of `exception_area`; literal tokenization rule; evidence scope; instrument compare rule; `ratio`) and re-measure the low fields at A1; if they stay < 70 %, apply K1b's narrowing remedy (⧉ set → archetype / target / bound / numeric_expression) even though K1b did not trip on time.
2. Redefine `calculation_handling.status` as evaluability (keyable blind) or make it single-drafted by A — B cannot see code.
3. Grammar change set §2.4 before S6 (K4).
4. Page-set ruling at S1 for the 23 missed entries, the Phase 0 first-section-only pages, `ch150_13`/`ch970`, and clause-level carve-ins for Ch.15/40/80 (K5).
5. Fix the brief's layer definition (Ch.600 is inside "Chapters 5 to 800") and add an expert check on 900.1.10(3) `ranks_layers` — both keyers agreed on the wrong answer.

**Provenance / limits:** all numbers [measured] by scripts in `C:/Users/User/Buildo-wt-mcbylaw-spike/.cursor/mcbylaw-spike/{item1,item4,item5_7,item6}/` (working artifacts, not committed) unless marked; adjudication time is a proxy; agreement measured on n = 70 units by two language models (correlated keyers). Paths deviate from plan text (`.cursor/mcbylaw/spike/`, `docs/reports/mcbylaw-s05-spike.md`) per the orchestrator's instruction; nothing committed, no DB access, no tracked file edited (this report was committed later, at S1, at the plan's path).
