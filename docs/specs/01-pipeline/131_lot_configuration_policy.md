# SPEC 131 — Lot Configuration Policy

**Status:** ACTIVE (register; the status cell of each row is authoritative)

> **The POLICY half of a standard + policy pair (operator 2026-10-18).** **Spec 78 — Optimal Lot Configuration** (`78_optimal_lot_configuration.md`) is the behavioural contract: what is computed for a lot and how. This spec holds **every rule and decision that governs lot configuration and max-build**, one row each: id · rule · source · amends · enforced by · status. It mirrors Spec 68 ↔ Spec 69 and Spec 122 ↔ Spec 124.
>
> **Protocol.** Amended only by adding rows, or a dated note row. A superseded row is struck through and names its successor; **an id is never reused**. On a policy question this spec governs; on behaviour, Spec 78.
>
> **One statement of each thing.** A row whose substance is already a ruling elsewhere cites that id instead of restating it:
> - Spec 69 M-n (by-law readings);
> - Spec 78 §Phase-5 D-1 / O-n (step decisions);
> - Spec 124 R-xx (step standard; the runner rulings from R-DV are built by the runner lane).
>
> **Admission test — the seven questions** (Spec 124 R-DF, applied to lot configuration). A row is admitted only when it answers all seven:
> - **STANDARDIZED:** one form, the majority form or a cited precedent (e.g. M-176 "build more, disclose how").
> - **OBSERVABLE:** a `step-validate` line, a test or a step check names it.
> - **RECORDED:** this row, dated, with the operator's decision.
> - **SCALABLE:** it applies by provision family to every residential zone (Spec 68 §5a part 2) and to every parcel. Exceptions are a closed list.
> - **ACCURATE:** measured, with file:line or verbatim clause evidence and a red-first lock.
> - **SIMPLE:** the smallest change; anything wider is a PIN.
> - **EXTERNALIZED:** law numbers come from keyed provision data through Layer 2 (Spec 68 §5a part 4); every other number is a registered `<slug>_<name>` logic variable; there are no code literals.
>
> **Status key.**
> - **RULED** — the operator decided; with a date, and "as-built" where it is in code.
> - **OWED** — the decision stands, but its lock is not built; the owner is named.
> - **PROPOSED** — awaiting the operator.
> - **SUPERSEDED** — struck through.
>
> **Byte budget:** registered in `122_split_manifest.json` `budgets["131"]` (`headroom_pct` 10), the Spec 69 / Spec 124 policy precedent. Growth beyond it is a reviewed manifest edit or a sanctioned split move.

---

## 1. The register

### 1.1 Rules carried from the as-built Spec 78 (Phases 1–3, §6)

| Id | Rule | Source | Amends | Enforced by | Status |
|---|---|---|---|---|---|
| **LC-1** | **Market-realized, not legal.** Every neighbourhood norm (realized FSI, build ratios, storey p50/p90, CoA approval) is an empirical prior, never a by-law ceiling. | Spec 78 §1 | — | `src/tests/build-norms.logic.test.ts` | RULED (as-built) |
| **LC-2** | **Norm window and sample floor.** Norms use a 5-year permit window (`BUILD_NORM_WINDOW_YEARS`). `low_sample` holds below 5 (`BUILD_NORM_MIN_SAMPLE_DEFAULT`). A citywide fallback row is written unconditionally. | Spec 78 P1.2 | — | `build-norms.logic`; migration 199 partial-unique index | RULED (as-built). **OWED:** both numbers to logic variables (§6.7) |
| **LC-3** | **One observation per (dominant parcel, kind),** with every ratio guarded `residential_sqm > 0`; over-capture above 1.1 (`OVER_CAPTURE_CLAMP`) is excluded. | Spec 78 P1.2 | — | `build-norms.logic`; `compute-build-norms.db` | RULED (as-built). **OWED:** clamp to a logic variable (§6.7) |
| **LC-4** | **The existing-ratio method.** The pre-reno current-home fraction is `clamp(1 − addition_delta ÷ max_build_gfa, 0, 1)` (p25/p50), distinct from the new-build `build_ratio_p50`. It drives the current-GFA range. | Spec 78 P1.2 | — | `build-norms.logic` | RULED (as-built) |
| **LC-5** | **Measuring the existing structure from massing is abandoned for headline answers** (±20–38 %, canopy-contaminated heights). The lot-driven envelope is the anchor. | Spec 78 §1; Spec 65 ES-6 | — | Spec 65 ES-6 locks (`enrich-parcels-existing-dq.db`) | RULED (as-built); applied by LC-29 |
| **LC-6** | **As-of-right never exceeds the max-build envelope.** Storeys are capped at `max_build_stories`; there is a NULL-FSI guard; any overshoot belongs to the CoA tier. | Spec 78 P2.2 | — | `optimal-config.logic` | RULED (as-built) |
| **LC-7** | **CoA is up, not out:** `storeys_p90` at the same footprint. Replaced for the report by M-65 (per-form uplift u). | Spec 78 P2.2; M-65 | — | `optimal-config.logic` | RULED (as-built); report form per M-65 |
| **LC-8** | **Garden/laneway constants (P2.1, consolidation 2025).** Garden footprint min(40 % rear yard, 60 m²); separation 5.0 / 7.5 m; height 4.0 / 6.0 m; soft landscaping 50 / 25 %; suite GFA < main. | Spec 78 P2.1 (verified 2026-06-26) | — | `contracts.infra` (`optimal_config` group); `optimal-config.logic` | ~~RULED~~ **SUPERSEDED in part:** stale against 849-2025 (Spec 78 §5.2 S9, KFM-78-5). For §Phase-5, the law comes from Layer 2 (LC-15, M-177) |
| **LC-9** | **The 20 % all-ancillary cap is shared** by the suite, the garage and existing ancillaries. The garage gets the remaining headroom. | Spec 78 P2.2; 150.7.60.70(1)(B) | — | `optimal-config.logic` | RULED (as-built); §Phase-5 reads `ancillary_coverage_pct` (M-179(1)) |
| **LC-10** | **Suite fit is conservative.** It is measured against the current building's rear yard; a shallow yard shrinks the suite rather than failing it. A laneway is preferred where a lane abuts (≥ 3.5 m). | Spec 78 P2.2; 150.8.30.20(1) | — | `optimal-config.logic` | RULED (as-built); §Phase-5 replaces it with the joint optimization (LC-22) |
| **LC-11** | **Confidence degradation.** `opt_config_confidence` falls with lot-size confidence, FSI absence, a suspected existing accessory and comp count. An exception lot never claims `high`. | Spec 78 P2.2, P3A.2 | — | `optimal-config.logic` (confidence degradation) | RULED (as-built) |
| **LC-12** | **Holding zone gates the as-of-right suite;** the CoA tier never relieves a holding zone. | Spec 78 P2.2 | — | `optimal-config.logic` | RULED (as-built) |
| **LC-13** | **`comp_fsi_p50` uses new-build comps only,** in [0.05, 8], excluding additions. | Spec 78 P3C.2 | — | `enrich-parcels-comps.logic` | RULED (as-built) |
| **LC-14** | **The McBylaw Phase 3 report** (§6): report fields as declared formulas over Layer 2; the scenario catalogue; two closed status levels; PROHIBIT wins at the same rank; the CoA axis; parking never a size constraint. | M-61..M-72, M-60 (a) | — | Spec 78 §6.9 gate table (PLANNED) | RULED 2026-10-07. **OWED:** §6.9 locks (Phase 3 plan) |

### 1.2 Max-build scenarios (§Phase-5), ruled 2026-10-18

| Id | Rule | Source | Amends | Enforced by | Status |
|---|---|---|---|---|---|
| **LC-15** | **The step is born V3, with McBylaws Airtight inputs.** `compute_maxbld_scenarios` is a net-new MATERIALIZER: census `legacy: "none"`, owner_specs `[78]`, admin-registered. It reads only Layer 2 (D-1). Every law number comes from Layer 2, under Spec 68 §5a. | operator 2026-10-18 ("I like 3"); M-188, M-189; D-1; Spec 124 R-DF, R-DK, R-DL | Spec 78 §6.3 (slug and chain), §6.8 (storage, O-6) | Spec 78 P5.11 V3 plan: `step-validate` V3, `admin-step-registration.logic`, `step-validate-net-new.logic` | RULED. **OWED:** the step commit ① (after Layer 2 and the runner lane) |
| **LC-16** | **The scenario set** (closed): detached house; detached houseplex; semi-detached houseplex; house with a secondary suite; `renovation_addition`; `renovation_interior`; `renovation_basement`; a rear-suite add-on on every row. | M-189; operator 2026-10-18 (renovation redesign) | §6.2 catalogue (first release, as-of-right) | P5.11 `scenario_totality` | RULED. **OWED:** check at ① |
| **LC-17** | **Semi-detached houseplex only on half of an existing semi**, with the party wall disclosed. Detection follows O-4. RD permits no semi (10.20.20.40(1)). | M-181(4); O-4 | M-174(1) note | P5.13 vector; O-4 sample | RULED. **OWED:** sample (step lane) |
| **LC-18** | **Houseplex unit split.** Count = min('u', the cap of 4 / 6, floors including the basement); per-unit area = floor area − circulation share; the basement is livable but outside GFA; bedrooms are capped per 40.1(8)/(7)/(6). | M-189; M-194 (cap); 10.5.40.40(3)(A); 800.50(181) | — | P5.11 `units_within_cap`; P5.13 | RULED. **OWED:** ① |
| **LC-19** | **Both roof forms are computed and the larger is headlined:** (a) flat roof + set-back storey; (b) pitched roof with an attic. The pitch is a logic variable. | M-184 (Q-MW1) | M-176(3) | P5.13 vectors | RULED. **OWED:** keying (O-7) and ① |
| **LC-20** | **The main-wall envelope.** Walls ≤ max(7.0 m, H − 2.5 m) on one pair: the side walls for 70 %, or front and rear for 60 / 50 / 40 % by frontage tier. Dormers ≤ 40 %. RT has no rule. An RM houseplex has no cap. | M-176(2), M-185, M-186, M-190 | enrich_parcels as-built (PIN-2) | P5.13; M-29 sample | RULED. **OWED:** keying and ① |
| **LC-21** | **Houseplex: no FSI cap and no storey cap; house with a secondary suite: no FSI cap.** These are `not_applicable` answers, never "not evaluated". | M-182, M-183 | Spec 68 §7.5 rule 7 (by M-183) | M-183 red vectors (P2-0 seat) | RULED. **OWED:** P2-0 seat (evaluator), P2-10 (suite class) |
| **LC-22** | **The rear suite is jointly optimized with the main building:** maximize `main_gfa + w × suite_gfa` with **w = 1**, a tie to the larger main. Separation 150.7.60.30(1); suite GFA < main (150.7.60.50(2)); coverage option A/B (M-191). | O-10; M-177; M-191 | LC-10 | P5.11 `suite_lt_main`, `coverage_consistent` | RULED. **OWED:** ① |
| **LC-23** | **Step decisions D-1, O-1..O-11** are recorded once, in Spec 78 P5.0. All are RULED 2026-10-18, O-6 as "measure at first capture against the §6.8 kill line". O-12..O-16 were added the same day (LC-34). | operator 2026-10-18 | — | Spec 78 P5.0 | RULED |
| **LC-24** | **Renovation `.71(3)` rule.** An up-addition on a lot of ≤ 12.2 m frontage keeps the existing setbacks; every other lawfully-existing relief is disclosed. | M-192 (O-3); 10.5.40.71(3) | — | P5.13 vector at 12.0 vs 13.0 m | RULED. **OWED:** ① |
| **LC-25** | **User-input-first renovation.** The three renovations share one existing-house input (footprint box, storeys, basement). The pipeline computes them from its estimate; the user's entry replaces the estimate. | operator 2026-10-18 | LC-5 (applies it) | P5.6; P5.13 | RULED. **OWED:** ①; app half PIN APP-RENO |
| **LC-26** | **Provenance precedence:** user input > pipeline estimate. Every existing-house field carries `*_source` (`estimated` / `user_entered`). | operator 2026-10-18 | — | P5.10 CHECKs; app spec (APP-RENO) | RULED. **OWED:** ①; APP-RENO |
| **LC-27** | **The low-confidence threshold.** `existing_confidence` is built on the Spec 65 ES-6 mislink checks, the link confidence and a shared-footprint penalty. Below `compute_maxbld_scenarios_existing_confidence_min`, the report says "low confidence in existing footprint — enter your dimensions". | operator 2026-10-18; Spec 65 ES-6 | — | P5.9 variable (R-CV seed); P5.13 | RULED. **OWED:** ① |
| **LC-28** | **One shared pure calculation.** All renovation math lives in `src/features/leads/lib/renovation-shared.js`, which the step and the app both call (precedent `cost-model-shared.js`, Spec 83 §7.2). It is pure under R-BZ / R-CA: no query, no clock. | operator 2026-10-18 | — | compute-closure purity scan (G0–G13, gate E #32); JS/TS parity test | RULED. **OWED:** ①; TS shim APP-RENO |
| **LC-29** | **The ground-truth store.** With consent, user-entered dimensions are stored beside the estimate snapshot (`existing_house_reports`) as an accuracy oracle. Opt-in consent, purpose limitation, deletion on withdrawal, RLS default deny, never to a third-party engine. The step does not read user entries. | operator 2026-10-18 | LC-5 | Spec 78 P5.8 | RULED. **OWED:** table, write path and consent flow (PIN APP-RENO) |
| **LC-30** | **When the low-confidence label may drop** is set from LC-29's measured error per confidence band (n ≥ a logic variable, error ≤ a logic variable). | operator 2026-10-18 | LC-27 | — | **OWED:** a future ruling, once data exists |
| **LC-31** | **The enrich_parcels max-build columns are kept** until the §6.9 shadow passes, then derived or retired (Appendix R). M-176(3) and EP-D21 keep their own night. | O-11; QUEUE 2026-10-16 | — | §6.9 shadow classifier (PLANNED) | RULED. **OWED:** shadow classifier |
| **LC-32** | **Renovation readings:** conversion within the building, and the by-law limits that touch a basement (5.10.1.30(3), the entrance ≤ 1.2 m, 800.50(80), headroom being a Building Code matter). | M-196 | — | P5.12 disclosure codes | RULED 2026-10-18 (operator y) |
| **LC-33** | **With vs without.** The `house_with_secondary_suite` row (and the houseplex rows) carry their gain over the same parcel's `detached_house` row on the same roof-form basis: GFA, footprint, storeys, and closed `gain_reasons` (`fsi_not_applicable`, `coverage_45`, `storeys_not_applicable`, `height_houseplex`, `main_wall_not_applicable`, `none`). The host/suite interior split follows 150.10.40.40. The gain is NULL when either row is not permitted. `coverage_45` arises only on a mapped LC overlay below 45 % in RD/RS/RT/RM (69a dated note on M-182). | operator 2026-10-18 ("we need the house with and without"); M-182, M-183, M-191 | — | Spec 78 P5.2 item 11, P5.10; P5.13 vectors | RULED. **OWED:** ① |
| **LC-34** | **Estimate design choices:** the pipeline never reads user entries (O-12); ~~storeys take the upper value (O-13)~~ (superseded by LC-40); basement unknown (O-14); confidence seeds 0.5 / 0.6 are uncalibrated logic variables (O-15). On RI / RB rows the rear suite is sized against the existing house (O-16). | operator 2026-10-18 | LC-25..LC-27 | Spec 78 P5.0, P5.9 | RULED. **OWED:** ① |
| **LC-35** | **Suite openings default: none.** The smallest lawful setback leads: garden side 150.7.60.20(5)(B); no (2)(C) rear increase; laneway rear 150.8.60.20(2)(A) and side (3)(A) at 0.0 m where the line abuts no street or lane. The with-openings setbacks are disclosures (`suite_openings_loss_sqm`, `suite_openings_setback`), never the headline. This is a design choice, not a site fact. | operator 2026-10-18 ("assume they will not put windows in doors — default is the smallest setback — rest is disclosure"); M-176; M-197 | reverses the coordinator recommendation of the same day | Spec 78 P5.5, P5.10; P5.13 vectors | RULED. **OWED:** ① |
| **LC-36** | **Suite setbacks read lot facts from data; an unknown fact takes the larger setback, disclosed.** Facts: depth > 45 m, corner, through lot, lane abutment (all held); which lot line abuts the lane or street, rear/side residential abutment and the adjacent lot's front yard (not held). The 150.8.60.20(3)(C) upper-storey step-back is MANDATORY (M-198, amends M-177(3)). | M-176; M-198 | — | Spec 78 P5.5 lot-fact table; INV-9 | RULED; M-198 RATIFIED 2026-10-18 ((3)(C) mandatory). **OWED:** a lot-line classification (Spec 130 lane), the strict lane metres (KFM-78-9 WF3), Q-B1 |

### 1.3 Review fold, trust and validation (2026-10-18)

| Id | Rule | Source | Amends | Enforced by | Status |
|---|---|---|---|---|---|
| **LC-37** | **Trust model.** New-build rows are high trust by design (by-law + geometry); the existing house is the only low-trust input; a lawfully-existing effect on a new build is a disclosure. | O-17; operator 2026-10-18 | — | INV-22; P5.14 | RULED |
| **LC-38** | **Trust tier per field; row trust computed, never asserted.** Tiers come from the lineage registry; `row_trust_level` is recomputed from `trust_checks`. | O-17 | — | INV-22 (`trust_level_computed`); INV-24 | RULED. **OWED:** ① |
| **LC-39** | **Missing-data register** ML-1..ML-13: each item has its handling (larger setback, disclosure, not_evaluated) and owner. | Spec 78 P5.14; operator 2026-10-18 | — | `trust_checks` register ids; P5.13 | RULED |
| **LC-40** | **`existing_storeys` is user input only**, NULL in the pipeline; no non-renovation field reads it. | O-13 amended (operator 2026-10-18) | LC-34 (O-13) | INV-20 | RULED. **OWED:** ①; APP-RENO |
| **LC-41** | **The P5.10 table is generated** from `docs/reference/maxbld-field-lineage.json`; every clause, unit, column and logic variable resolves. | operator 2026-10-18 ("how will I know …"); Spec 124 R-BF | — | INV-24: `generate-maxbld-lineage.mjs --check`; `bylaw-maxbld-trace.infra` | RULED (built, uncommitted) |
| **LC-42** | **Every operator envelope answer has a verified disposition** (matches / excluded / fix id / P5.12 code / resolved / open question); OPEN and UNFIXED are reported, never hidden. | operator 2026-10-18 | — | INV-25: `generate-answer-tracker.mjs --check`; `bylaw-maxbld-trace.infra` | RULED (built, uncommitted) |
| **LC-43** | **Invariants INV-1..INV-25 are enforced** where Spec 78 P5.15 says (step check, generator check or test). | Spec 78 P5.15; reality check §7 | — | P5.11 checks; the two generators; evaluator-lane tests (INV-18, INV-19) | RULED. **OWED:** ① (step checks); keying lane (INV-18/19) |
| **LC-44** | **"High trust" only when G-HT-1..G-HT-9 all hold** (Layer 2 current; M-217..M-225 closed; O-7 keyed; lineage and tracker clean with 0 open on headline provisions; oracle round 0, permit lower bound, oracle C). Until then: "by-law-derived where status = applies, with disclosed estimates". | Spec 78 P5.15; Spec 68 §5a part 7 | — | the G-HT gates | RULED. **OWED:** each gate's owner |
| **LC-45** | **Forms not modelled are disclosed:** major-street apartment / townhouse (608-2024 / 1062-2025) and a new semi-detached house (± suite) on an existing-semi lot. | M-214 (operator "DISCLOSE BOTH") | — | P5.12 codes; P5.1 | RULED (M-214(3) ratified 2026-10-18) |
| **LC-46** | **Gates:** holding → not_permitted; lot viability (10.5.30.20(2), 10.5.30.21(3)); unauthored exception, heritage, ravine, shoreline, triangular → disclosed and the row's trust capped. | M-207, M-212, M-213 | LC-12 (applies it) | INV-21 | FOLDED. **OWED:** ① |
| **LC-47** | **Review corrections** (R flat roof, RM 12.0 m, semi cap 4, attic GFA, houseplex 19 m, explicit setbacks, extension, landscaping, laneway arms, suite GFA reductions, renovation caps, R FSI 0.6). | M-199..M-216; Spec 78 P5.16 | LC-18..LC-20, LC-24 | P5.13 vectors; INV-5, INV-9, INV-11 | RULED 2026-10-18 (operator item 5: compliance proven per row, `.cursor/maxbld-fold5-compliance-2026-10-18.md`; M-206 renovations only; M-208 disclosed). **OWED:** ① |
| **LC-48** | **Coxwell generous reading** with the mandatory disclosure and a logic-variable switch. | M-224 (operator) | O-5 | INV-10; P5.13 | RULED. **OWED:** polygon (Spec 58), City question |
| **LC-49** | **CoA tier in the first release** by M-65 unchanged, tier `precedent_estimate`. **CoA is not applicable to the rear suite and the three renovations** (no M-65 form, no fit cohort): renovation rows `coa_status = not_applicable:no_coa_form`; the suite has no CoA figure and `coa_gfa_sqm` covers the main building only (disclosed `coa_calibrated_not_law`). | O-18; M-65; operator 2026-10-18 | §6.3 deferral | INV-23; lineage `coa_status` | RULED 2026-10-18 (operator) |
| **LC-50** | **enrich_parcels consumer gate:** no max-build column switches or retires until every listed coa / permits / sources / src consumer is migrated or confirmed; value changes recapture in replay-all. | O-11 (operator 2026-10-18) | LC-31 | Spec 78 O-11 list; R-CZ / R-DQ | RULED |
| **LC-51** | **The per-lot CoA list is the one already decided; no new field.** Per lot: `comparable_builds` (Spec 78 §P3C.2, each comp with its `coa_decision`), `nearby_coa_builds_gfa_sqm` with its comp count (§6.4, M-65(6)), and the neighbourhood CoA counts and approval rate (§Phase-1 P1.2). The drafted `nearby_coa_applications` (applications with variances) is withdrawn: no governing spec decided it. | M-65(6); Spec 78 §P3C.2, P5.10a; operator 2026-10-18 ("must correspond to the governing spec") | withdraws the P5.10a draft | lineage `comparable_builds_ref`, `nearby_coa_builds_gfa_sqm`; `generate-maxbld-lineage.mjs --check` | RULED 2026-10-18 (operator) |
| **LC-52** | **Disclosure wording is plain.** Each P5.12 code has one template of at most 45 words in a homeowner's words. The by-law terms on the closed list carry their plain meaning in the same sentence, in these exact words: "floor-area total (GFA)", "allowed floor area (FSI)", "the ground level the City measures from (established grade)", "Committee of Adjustment (CoA)". A new term joins by a row amendment and a `PLAIN_TERMS` entry in `maxbld-trace-lib.mjs`. | operator 2026-10-18 ("understandable and simple"); M-176 | — | `bylaw-maxbld-trace.infra.test.ts` (template lint) | RULED 2026-10-18 (operator item 5) |

## 2. Glossary of cross-referenced ids

| Id | Where |
|---|---|
| M-n | Spec 69 register, rows in `69a_mcbylaw_register.md` |
| D-1, O-1..O-18 | Spec 78 §Phase-5 P5.0 |
| INV-n, ML-n, G-HT-n | Spec 78 P5.15 / P5.14 |
| Q-MW1/2/3 | M-184 / M-185 / M-186 |
| MF-1..MF-4, Q1–Q15 | M-180..M-183, M-187 |
| R-xx | Spec 124 §5 / 124a; runner rulings from R-DV (`.cursor/v3-runner-lane-rulings-2026-10-18.md`) |
| PIN APP-RENO | the separate app spec owed for the renovation input UI, storage write path, consent flow and TS shim |

---

## Operating Boundaries

### Target Files
- `docs/specs/01-pipeline/131_lot_configuration_policy.md` (this policy). The files the rules govern are listed in Spec 78's Operating Boundaries.

### Out-of-Scope Files
- Everything under `src/`, `scripts/`, `migrations/`: this spec rules; Spec 78's phases build.

### Cross-Spec Dependencies
- **Relies on:** Spec 78 (the behaviour it rules on); Spec 124 (R-DF admission test, §4 protocol); Specs 68/69 (McBylaws Airtight, by-law readings).
- **Consumed by:** Spec 78; the step `compute_maxbld_scenarios`; the app spec owed under PIN APP-RENO.
