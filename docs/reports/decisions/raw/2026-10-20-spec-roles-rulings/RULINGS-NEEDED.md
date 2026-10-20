# Rulings needed: roles of Specs 120, 121 and 123

Prepared by lane spec132-move on branch `wf2/spec-132`, 2026-10-20. Nothing below has been applied. Specs 120, 121 and 123 are unedited. All three are on `role_banner_pending` in `docs/specs/01-pipeline/122_split_manifest.json`, so arm (vii) of the role lock (Spec 124 R-GX) stays green until you rule. All three are still listed in `rule-map.json` `meta.historical_design_records`. Spec 119 is out of scope, as you ruled.

Banner vocabulary (R-GW): authority register / standard / design / historical / generated handbook.

Once you rule, the follow-up for each spec is small: add one `> **Role: <role>.**` banner line, drop the spec from `role_banner_pending`, and give a historical spec a `historical_rule_ids` baseline (R-GX). It also needs a Spec 124 §5 row recording your ruling.

---

## Spec 120: Pipeline Step Runner & Step Validator (1,211 lines)

**Current header and governance lines (quoted):**
- 120:3: "## ⛔ NOT RATIFIED — the line that stood here was false"
- 120:5: "A prior automated pass wrote *"✅ RATIFIED 2026-08-22 — registered by operator authorization"* into this file … **No operator authorized it. No human has approved this document at any point.**"
- 120:7 (same banner block): "**The operator reviewed both specs and authorized registration ("the specs are good ratify"). `npm run system-map` is therefore correct to run, and the prohibition below is DISCHARGED**"
- 120:9: "**Two conditions ride with ratification:** ① the design is still **unproven** … ② Spec 121's header records a **measured ~60% citation-error rate on hand-written detail**"
- 120:31: "**Status:** UNRATIFIED DRAFT · **Scope:** `sources` chain (27 steps) first". The system map prints this status.
- Spec 122:5–6 (the standard): "The Specs 120/121 false-ratification incident this banner used to guard …"

**The problem.** The banner block contradicts itself. Line 3 says no human approved the spec. Line 7 says the operator authorized registration and talks about "ratification". The Status line says UNRATIFIED DRAFT. A reader can't tell from the file which of these is true.

**What is still live.** The design was built as Spec 122: the descriptor, the library and the generated validator. Parts of Spec 120 are marked superseded in place. For example, 120:452 says "SUPERSEDED, not built (Spec 122 programme item `VAL-1`…)". The code still points at it: 133 `Spec 120 §` citations in `scripts/` and `src/`, and the system map lists `step-conformance.infra`, `step-parity.db` and other tests under Spec 120.

**Recommendation.** Make Spec 120 **historical**. Replace the contradictory banner block with one historical banner, worded roughly: "Role: historical. The design record for the step runner; built and superseded by Spec 122 (standard) and Spec 124 (policy). Registered 2026-08-22 on 'the specs are good ratify'; never ratified as a standard." Keep the false-ratification incident as a dated note under the banner, not as the header. The Status line becomes `HISTORICAL`. Code citations to `Spec 120 §x` stay valid as history. The historical-spec rule then stops any new rule id from landing in Spec 120.

---

## Spec 121: Assessment & Verification Methodology (2,689 lines)

**Current header and governance lines (quoted):**
- 121:3–5: the same "⛔ NOT RATIFIED — the line that stood here was false" banner and explanation as Spec 120.
- 121:20: "**`npm run system-map` has deliberately NOT been run**, so neither this file nor 120 appears in the system map and neither has governance force. ~~**Do not run it to "fix" that**~~ — ✅ **superseded 2026-08-22: the human approved.**"
- 121:28: "**Status:** UNRATIFIED DRAFT · **Scope:** reusable — pipeline chains first, but the method is domain-independent"
- `rule-map.json` `meta.spec121_m_items`: "Spec 121 M1–M14 are retired as a set (decision 4); still-true items map to live handbook lines; Spec 121 text is unchanged."
- Spec 123:12: "**Spec 121 is the method and GOVERNS this document.** … Where they differ, 121 wins and 123 is wrong."

**What is still live.**
- Spec 123:12 still gives Spec 121 authority over Spec 123. Spec 123 is ACTIVE and its §6 gates run through step-validate.
- Spec 123 §6 is headed "Gates — Spec 121 §6.1, per conversion" (123:298).
- Spec 121 §3's PH-0…PH-8 phases are the vocabulary Spec 123 uses (123:15).
- There are 101 `Spec 121 §` citations in `scripts/` and `src/`.
- Decision 4 already retired M1–M14, and the still-true items now live in Spec 132's lines.

**Recommendation.** Make Spec 121 **historical**, with the same banner clean-up as Spec 120. This needs the Spec 123 ruling below in the same change. Otherwise a historical spec would still "govern" an active one, and that contradicts R-GW ("a historical spec decides nothing"). Any Spec 121 content that is still true and still enforced already lives in Spec 123 §6 (the gates) or in Spec 132 lines (the M-items). Nothing needs to move first.

---

## Spec 123: Step Optimization: Assessment & Validation (431 lines)

**Current header and governance lines (quoted):**
- 123:3: "## ✅ Status: ACTIVE — ratified by operator 2026-08-29 after pilots 1–5"
- 123:6–8: "§6's gate scorecard is now GENERATED and ENFORCED by `scripts/analysis/step-validate.mjs` … the operator's own words — *"it should be standard and enforced"* — are the ratification."
- 123:11: "**Status:** ACTIVE · **Scope:** the procedure applied to each of the 27 `sources` steps, then the estate's 64 …"
- 123:12: "**Spec 121 is the method and GOVERNS this document.** 123 does not restate 121; it **instantiates** it for one job — converting a pipeline step in place. Where they differ, 121 wins and 123 is wrong."
- 123:13: "**Spec 122** is the target architecture. **Spec 119** owns backend verification doctrine and governs over both."
- Spec 124:12–13: "**Relationship to Spec 123:** 123 is the *procedure* for getting an existing step to comply; 124 does not restate it."
- `rule-map.json` `meta.historical_design_records` lists Spec 123. That decision 2 listing contradicts its ACTIVE status and live gates.

**What is still live.**
- The G0–G9 gate table in §6 (123:298–312) is computed every run. `scripts/analysis/step-validate.mjs`:18 says "computes the Spec 123 SS6 SCORECARD G0-G9 from ARTIFACTS". R-R (124a:132) says "`step-validate.mjs` is the ONE command generating the Spec 123 §6 G0–G9 scorecard".
- Hard stops G6/G7/G8 and G9 set the exit code (step-validate.mjs:170).
- There are 156 files in `scripts/` and `src/` that cite Spec 123, 59 of them as `Spec 123 §6`.
- The nine-commit conversion procedure is how every pending step gets converted.

**Recommendation.** Spec 123 can't be historical while its G0–G9 gates are enforced. Choose one:
- **(a) Recommended: make Spec 123 a standard**, the procedure half of the step family, and take it off `historical_design_records`. Its role banner would read roughly: "Role: standard. The conversion procedure and the G0–G9 gates step-validate computes; on policy the Spec 124 register governs (R-GV)." Line 12 changes from "Spec 121 is the method and GOVERNS this document" to "Spec 121 is the historical method record this procedure instantiates; on policy the Spec 124 register governs, on the schema and behaviour Spec 122." Spec 123 has a hand-written budget (423 lines / 49,705 B measured, +10%), so this costs about one line.
- **(b) Move §6 (the G0–G9 table) into Spec 124 or 122 through a spec-split register move, then make Spec 123 historical.** This costs more: 59 code citations to `Spec 123 §6` would need re-pointing or a stub.

Under (a), the steps family has three live specs: Spec 122 (standard: schema and behaviour), Spec 123 (standard: conversion procedure) and Spec 124 (register: policy). Spec 132 is generated from them. Under (b) the family stays a pair.

---

## Summary of asks

| Spec | Today | Recommendation | Must go with |
|---|---|---|---|
| 120 | Contradictory banner (NOT RATIFIED, plus "authorized registration"); Status UNRATIFIED DRAFT | historical; one banner; dated incident note | none |
| 121 | Same contradictory banner; still GOVERNS Spec 123 (123:12) | historical | the Spec 123 ruling (123:12 rewritten) |
| 123 | ACTIVE; G0–G9 enforced by step-validate; listed as a historical record in rule-map meta | (a) standard (procedure), 123:12 rewritten, removed from `historical_design_records`; or (b) move §6, then historical | Spec 121 ruling |
