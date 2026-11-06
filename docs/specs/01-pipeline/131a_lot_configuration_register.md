# SPEC 131a — Lot Configuration Policy: register rows (part of Spec 131)

**Status:** ACTIVE (register; the status cell of each row below is authoritative; this file holds Spec 131 register rows moved for Spec 131's byte budget)

> **Role: authority register.** Part of the Spec 131 policy register: its LIVE REGISTER sections hold §1.1 and §1.2 rows moved for the byte budget, in force as Spec 131 rulings. Sibling of `docs/specs/01-pipeline/131_lot_configuration_policy.md` (Spec 131). Each section below arrived ONLY through `node scripts/analysis/spec-split-check.mjs --refresh` (Spec 124 R-AA): its heading names the source, its `moves[]` row in `docs/specs/01-pipeline/122_split_manifest.json` records the content hash, and a stub in Spec 131 points here.

**Governance:** these rows ARE Spec 131's rulings. Cite them as before — `Spec 131 LC-n`. New rows are added to Spec 131, never here.

## Operating Boundaries

- This file carries no rule of its own beyond the moved rows.


---

## Appendix §D1 — Register rows LC-1…LC-14 (moved from Spec 131 §1.1) — LIVE REGISTER, 2026-11-02

Moved from Spec 131 — MB-79 (u), operator 2026-11-02 (CARD-spec131-budget option 1; R-AA; landing CARD-spec131-landing U1). Rows LC-1…LC-14 stay in force as Spec 131 rulings, cited as Spec 131 LC-n; new rows are still added to Spec 131.

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


---

## Appendix §D2 — Register rows LC-28…LC-36 (moved from Spec 131 §1.2) — LIVE REGISTER, 2026-11-02

Moved from Spec 131 — MB-79 (u), operator 2026-11-02 (CARD-spec131-budget option 1; R-AA; landing CARD-spec131-landing U1). Rows LC-28…LC-36 stay in force as Spec 131 rulings, cited as Spec 131 LC-n; new rows are still added to Spec 131.

| **LC-28** | **One shared pure calculation.** All renovation math lives in `src/features/leads/lib/renovation-shared.js`, which the step and the app both call (precedent `cost-model-shared.js`, Spec 83 §7.2). It is pure under R-BZ / R-CA: no query, no clock.<br>**Dated note 2026-10-30 (LC-28; `2026-10-30-batch-aj#CHAT-211.P3-MODEL`, `2026-10-30-batch-aj#CHAT-211.G1`):** superseded for Layer 3: calculations are catalogue rows run by the one evaluator (M-377) and no old code, including renovation-shared.js, is imported (R-KJ, M-384). | operator 2026-10-18 | — | compute-closure purity scan (G0–G13, gate E #32); JS/TS parity test | RULED. **OWED:** ①; TS shim APP-RENO |
| **LC-29** | **The ground-truth store.** With consent, user-entered dimensions are stored beside the estimate snapshot (`existing_house_reports`) as an accuracy oracle. Opt-in consent, purpose limitation, deletion on withdrawal, RLS default deny, never to a third-party engine. The step does not read user entries. | operator 2026-10-18 | LC-5 | Spec 78 P5.8 | RULED. **OWED:** table, write path and consent flow (PIN APP-RENO) |
| **LC-30** | **When the low-confidence label may drop** is set from LC-29's measured error per confidence band (n ≥ a logic variable, error ≤ a logic variable). | operator 2026-10-18 | LC-27 | — | **OWED:** a future ruling, once data exists |
| **LC-31** | **The enrich_parcels max-build columns are kept** until the §6.9 shadow passes, then derived or retired (Appendix R). M-176(3) and EP-D21 keep their own night. | O-11; QUEUE 2026-10-16 | — | §6.9 shadow classifier (PLANNED) | RULED. **OWED:** shadow classifier |
| **LC-32** | **Renovation readings:** conversion within the building, and the by-law limits that touch a basement (5.10.1.30(3), the entrance ≤ 1.2 m, 800.50(80), headroom being a Building Code matter). | M-196 | — | P5.12 disclosure codes | RULED 2026-10-18 (operator y) |
| **LC-33** | **With vs without.** The `house_with_secondary_suite` row (and the houseplex rows) carry their gain over the same parcel's `detached_house` row on the same roof-form basis: GFA, footprint, storeys, and closed `gain_reasons` (`fsi_not_applicable`, `coverage_45`, `storeys_not_applicable`, `height_houseplex`, `main_wall_not_applicable`, `none`). The host/suite interior split follows 150.10.40.40. The gain is NULL when either row is not permitted. `coverage_45` arises only on a mapped LC overlay below 45 % in RD/RS/RT/RM (69a dated note on M-182). | operator 2026-10-18 ("we need the house with and without"); M-182, M-183, M-191 | — | Spec 78 P5.2 item 11, P5.10; P5.13 vectors | RULED. **OWED:** ① |
| **LC-34** | **Estimate design choices:** the pipeline never reads user entries (O-12); ~~storeys take the upper value (O-13)~~ (superseded by LC-40); basement unknown (O-14); confidence seeds 0.5 / 0.6 are uncalibrated logic variables (O-15). On RI / RB rows the rear suite is sized against the existing house (O-16). | operator 2026-10-18 | LC-25..LC-27 | Spec 78 P5.0, P5.9 | RULED. **OWED:** ① |
| **LC-35** | **Suite openings default: none.** The smallest lawful setback leads: garden side 150.7.60.20(5)(B); no (2)(C) rear increase; laneway rear 150.8.60.20(2)(A) and side (3)(A) at 0.0 m where the line abuts no street or lane. The with-openings setbacks are disclosures (`suite_openings_loss_sqm`, `suite_openings_setback`), never the headline. This is a design choice, not a site fact. | operator 2026-10-18 ("assume they will not put windows in doors — default is the smallest setback — rest is disclosure"); M-176; M-197 | reverses the coordinator recommendation of the same day | Spec 78 P5.5, P5.10; P5.13 vectors | RULED. **OWED:** ① |
| **LC-36** | **Suite setbacks read lot facts from data; an unknown fact takes the larger setback, disclosed.** Facts: depth > 45 m, corner, through lot, lane abutment (all held); which lot line abuts the lane or street, rear/side residential abutment and the adjacent lot's front yard (not held). The 150.8.60.20(3)(C) upper-storey step-back is MANDATORY (M-198, amends M-177(3)). | M-176; M-198 | — | Spec 78 P5.5 lot-fact table; INV-9 | RULED; M-198 RATIFIED 2026-10-18 ((3)(C) mandatory). **OWED:** a lot-line classification (Spec 130 lane), the strict lane metres (KFM-78-9 WF3), Q-B1 |
