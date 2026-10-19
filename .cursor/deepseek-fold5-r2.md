# Output panel round 2 (Spec 08) — item-5 fold verified against the files

Scope: verify `.cursor/maxbld-fold5-compliance-2026-10-18.md` claim by claim, hunt regressions across
`docs/specs/01-pipeline/78_optimal_lot_configuration.md` (Spec 78), `69a_mcbylaw_register.md`, `131_lot_configuration_policy.md`,
`docs/reference/maxbld-field-lineage.json`, `docs/reference/envelope-answer-dispositions.json`, and cross-read
LC-49 / LC-51 / LC-52 / M-206 / M-207 / M-208. Read-only run; nothing committed.

## Verdict in one line

The 11 "fixed"/"ruled" claims in the compliance table all hold in the cited files. **One finding is a BLOCKER for the
"0 non-compliant rows remain" line**: two user-facing outputs (the disposition JSON and the generated tracker render it
feeds) still state the old, explicitly-rejected M-203 reading — that RD 10.20.40.10(8) excludes attic floor area from
**GFA**. The fold fixed the register and Spec 78 P5.12 but not the disposition that ships the wording.

## 1. Reality check — each claim, with the line

| Claim (compliance table) | Holds? | Evidence |
|---|---|---|
| M-199 Std: P5.6 now "whole house's interior" | OK | `78:722` "suite ≤ 45 % of the interior floor area of the **whole house** it sits in (150.10.40.40(1) … M-199"; `78:954`, `78:1089`, INV-13 `78:1386` agree. `host unit` survives only in an unrelated suite-per-dwelling row (`envelope-answer-dispositions.json:2124`, "one suite per host unit") — not the M-199 denominator. |
| M-202 Std: INV-11 now the M-202 formula | OK | `maxbld-field-lineage.json:189-192` "`dwelling_units ≤ min(u [no 'u' = no cap; lifted to 6 only in R/RT/RM inside 600.60], 4 [S always], 6 iff gis_in and detached, floors)` (M-202)" == `78:1384` == `69a:308` (4). The pre-M-202 `min(u, 4 [S always], 6 iff gis_in and detached)` is gone. |
| M-203 Scope: `attic_outside_gfa` no longer cites (8) as a GFA exclusion | OK | P5.12 `78:1270` `attic_outside_gfa` source = "M-203; 10.5.40.40(1)", text "…not counted in the City's floor-area total (GFA): it does not meet the headroom and size test." `69a:309` "It is a storey either way … unless a clause excludes it (RD 10.20.40.10(8))". Spec 78 keeps (8) only as a storey rule (`78:784`). **But see F-1: the disposition did not move.** |
| M-206 ruled: renovations only | OK | `69a:312` "Applied in `renovation_addition` … The new-build rows use the Layer 2 length cap without it"; `78:766` "Not applied to the new-build rows"; `78:946`, `78:1059` (`main_footprint_sqm` "added on RA only"), `78:1065` (`main_length_cap_m` "+2.0 m extension on RA only"), `lineage:592`, `lineage:907`, `envelope-answer-dispositions.json:831` "New-build rows do not take it." |
| M-207 fixed: gate scoped to D, 2, H | OK | `69a:313` "it names *"a detached house or detached houseplex"* only, so … applies to the D, 2 and H rows, not the semi-detached houseplex row"; `78:736` "(D, 2, H; M-207)". |
| M-207 fixed: one name for the margin flag | OK | `78:1057` `gate_flags` closed set contains `irregular_lot_approximation` and no `lot_viability_margin`. Residual `lot_viability_margin_m` hits (`lineage:122`, `78:1034`, `78:1054`, `78:1057`, `78:1350`) are the **logic variable**, confirmed OWED logic variable at `lineage:122-124`. `lot_viability_margin\b` (gate value) → 0 hits in docs. |
| M-207 fixed: cite §6.5 → §6.6 rule 8 | OK | `69a:313` "binding clause (Spec 78 §6.6 rule 8)". No `§6.5 rule 8` anywhere in the five files (the only `rule 8` neighbours are `68 §6.4 rule 8`, `78:595`, unrelated). |
| M-208 ruled: disclosed, not binding | OK | `69a:314` "`suite_binding` has no soft-landscaping value"; `78:888` "`suite_binding` has no soft-landscaping value"; `78:919` closed value list has no landscaping member; `78:1111`; `lineage:2514` "disclosed (`suite_soft_landscaping`), never sizes the suite (M-208, operator 2026-10-18)"; `envelope-answer-tracker.md:124/416/417/481` "computed and disclosed, not binding … the suite is not reduced". |
| M-211 Std: "the smaller cap binds" | OK | P5.6-carried per the table; no contradictory "larger cap" text found in Spec 78 P5.6. |
| M-212/213/215 Plain: glosses added | OK | `78:1279` `established_grade`, `78:1276` `shoreline_hazard` use "the ground level the City measures from (established grade)" / "allowed floor area (FSI)"; `78:1281` `holding_zone` "holding symbol (H)". |
| LC-49 ruled: CoA not applicable to suite/renovations | OK | `131:97`; `78:1157-1172`; `78:1136` `coa_status` closed forms include `not_applicable:no_coa_form`; `78:1165` the three renovation rows. |
| LC-51 ruled: per-lot CoA list, no new field | OK | `131:99`; `78:1178`; `78:1137` (`nearby_coa_builds_gfa_sqm`), `78:1138` (`nbhd_coa_approval_rate`), `78:1139` (`comparable_builds_ref`). §6.4 (M-65) figure unchanged at `78:515`. |
| LC-52 ruled: plain, ≤45 words, glossed | OK (lint) / **MAJOR (see F-2)** | `131:101`; `maxbld-trace-lib.mjs:213-236` `PLAIN_TERMS` + `TEMPLATE_MAX_WORDS = 45`, `lintDisclosureTemplates` walks the `### P5.12 Disclosures` block to `### P5.13`; red arms in `src/tests/bylaw-maxbld-trace.infra.test.ts:75-80` assert an unglossed `GFA` and a 50-word template are both caught. Hand-checked the longest rows: `coxwell_area` (~44), `basement_becomes_storey` (~37), `major_street_forms_not_modelled` (27) — all under cap. |

## 2. Regression guardian — the grep board

| Probe | Result |
|---|---|
| `soft_landscaping` as a `suite_binding` value / a cap | OK — no such value in `78:919` or `78:1111`; `opt_binding_constraint` legacy `soft_landscaping` (`docs/reports/enriched-parcels-field-spec.md:163`, `.cursor/archive/…`) is a **different, pre-existing** output field (`scripts/lib/optimal-config.js`, `parcel_maxbld_*` legacy), not the suite binding; outside this fold. |
| `one_storey_extension` / `M-206` on new-build D/H/S/2 | OK — every hit says "renovations only" / "RA only" / "New-build rows do not take it". No hit applies it to a D/H/S/2 row. |
| `nearby_coa_applications` | OK — 3 hits, all "withdrawn" (`131:99`, `78:1178`, compliance table `:56`). No field definition, no lineage row. |
| `drafted ruling` / `PROPOSED` / `operator to confirm` / `pending operator` | OK in scope — no hit in the five files. Hits exist only in `.cursor/archive/**`, `.cursor/mcbylaw/**`, `.cursor/h6-heavy-runbook.md`, `oracle-c/*.generated.md` (all pre-existing, out of scope). `envelope-answer-tracker.md` uses "ruled; keyed correction not applied yet" for M-206/M-208 — "not applied yet" refers to the keying lane, not the ruling. |
| `lot_viability_margin\b` | OK — only `lot_viability_margin_m` (the logic variable). |
| `10.20.40.10(8)` as a GFA exclusion | **BLOCKER — F-1**. Live in `envelope-answer-dispositions.json:426-433` and the generated render that is regenerated from it. |
| INV-11 formula | OK — `lineage:189`, `78:1384`, `69a:308`, `78:1084` all the M-202 form. |
| `host unit` | OK — only the unrelated suite-per-dwelling row. |
| `§6.5 rule 8` | OK — 0 hits; §6.6 everywhere. |

## 3. Cross-read adversary

- **M-206** — consistent with M-211 (both the renovation class), with M-204's `main_length_cap_m` (`78:1065`, RA-only +2.0 m), and with `main_footprint_sqm` (`78:1059`, RA only). It does **not** add a scenario: it reuses `renovation_addition`, and the P5.12 code is a pre-existing code. OK.
- **M-207** — consistent with LC-46 (`131:94` lists gates first), with INV-21 (`78:1054`), and with ML-6 (`78:1350`). One scope note, not a defect: `scenario_status` stays a closed form and the D/2/H scoping is expressed in prose, not in a closed enum — acceptable because the clause names the forms.
- **M-208** — consistent with M-216 / M-212 disclosure form, with `suite_soft_landscaping_sqm` (`lineage:2509-2522`). No new field (the area is computed, the code existed).
- **LC-49** — consistent with O-18 (`78:711`), with INV-23 (`78:1396`), and with M-65 ("principal forms only"). No new field: `not_applicable:no_coa_form` is derived from the existing `coa_status` closed forms.
- **LC-51** — consistent with M-65(6) and §P3C.2 (`78:331-332`, `coa_decision` per comp; `78:447`, `78:515`, `78:1137`; `78:1138`/`78:1175` for the neighbourhood rates). It withdraws a field and adds none. OK.
- **LC-52 lint** — catches an unglossed `GFA`/`FSI`/`CoA`/`established grade` **and** an over-cap template, with red arms; it reads the whole P5.12 block (`### P5.12 Disclosures` → `### P5.13`), which is the only disclosure table in Spec 78 (headings `78:1236`,`1303`). See F-2 for the two forms it cannot express.
- **Adjacent row, not in the claim set:** `suite_openings_setback` (`78:1250`) — "If the suite has windows/doors in its {rear / side} wall: setback {X} m, **suite reduced by {Y} m²**." This is the only template that says a disclosure *reduces* the suite. It is LC-35's design choice (openings taken as none), so the reduction is conditional and never the headline — but a plain-wording reader takes it as a cap. See F-3.

## 4. Findings

**F-1 · BLOCKER · `docs/reference/envelope-answer-dispositions.json:426-433`**
```json
"unit_id": "10.20.40.10(8)#whole",
"verdict": "disclose",
"disposition": "disclosed_by",
"fix_ids": ["M-203"],
"corrected_value": "Floor area within an attic is excluded from GFA when outside the attic test; a GFA-inclusion rule, disclosed.",
"disclosure_code": "attic_outside_gfa",
"basis": "M-203 attic test is a GFA-inclusion rule"
```
This is exactly the claim the compliance table says was fixed ("`attic_outside_gfa` and its template cited RD 10.20.40.10(8) as a GFA exclusion; (8) is a storey exclusion only"). The cited verbatim at `docs/reference/bylaw-provisions.json:433` is *"this space is not a storey"* — a storey rule. The sentence is also internally contradictory ("excluded from GFA" then "a GFA-inclusion rule"). It is the user-visible text, so the fold has not removed the defect it claims to have removed. Rendered copy: `docs/reports/generated/envelope-answer-tracker.md:46` (same sentence) and `envelope-answer-tracker.json:300`.
Fix: `corrected_value` → "RD 10.20.40.10(8) is a storey-exclusion rule for a mechanical attic ≤ 20 m², not a floor-area rule; a failing attic is reported outside the floor-area total (GFA) under 10.5.40.40(1) (M-203)." Then regenerate the tracker (`bylaw:provisions --write`) and its render, or the INV-25 drift test fails.

**F-2 · MAJOR · `scripts/analysis/bylaw/maxbld-trace-lib.mjs:213-221` + `131_lot_configuration_policy.md:101`**
The gloss lint matches the exact strings `"floor-area total (GFA)"`, `"allowed floor area (FSI)"`, `"the ground level the City measures from (established grade)"`, `"Committee of Adjustment (CoA)"`. LC-52 as written in `131:101` promises a **part-of-speech** rule ("a by-law term is given its plain meaning"), but the enforcement is a literal-phrase rule. Consequences:
(a) a correct gloss in different words ("the City's floor-area total (GFA)" = `78:1270`, `78:1272`) still passes because it *contains* the literal; a gloss that rephrases ("total floor area (GFA)") would be **rejected** as a false failure;
(b) the lint only knows the four terms; any other by-law term ("storey", "ancillary building", "main wall") can appear unglossed and the test is green. So LC-52's coverage is narrower than its text, and a future template author is steered by two sources that disagree.
Fix: either narrow LC-52 to "these four terms" in `131:101`, or extend `PLAIN_TERMS` and relax the match to a normalised token comparison.

**F-3 · MINOR · `78_optimal_lot_configuration.md:1250` (`suite_openings_setback`)**
The template names a suite reduction of {Y} m². Given the new M-208 rule ("a disclosure never shrinks the suite") a reviewer will read this as a contradiction; in fact LC-35 treats the openings as absent so the reduction is conditional and not applied. Worth one clause: "…; this is the alternative to assuming no openings (LC-35) and is not the headline." Not a fold regression; pre-existing wording.

**F-4 · MINOR · `.cursor/maxbld-fold5-compliance-2026-10-18.md:41-43`**
"All 18 rows are RATIFIED" with "0 non-compliant rows" is stated over a table where 6 rows carry a not-yet-existing observable (`P5.13` vectors marked **OWED, ①**). The document does distinguish "reading settled" from "observable" in the table cells, but the Result block reads as an unconditional pass. Suggest: "0 rows non-compliant **on reading**; 0 observables exist yet (P5.13 OWED at ①)".

**F-5 · MINOR · `.cursor/maxbld-fold5-compliance-2026-10-18.md:19-21`**
The "Obs" criterion says "the INV / P5.13 vector exists". No vector exists (all OWED). The criterion as written cannot be satisfied by any row today; restate it as "the INV / P5.13 vector is **named**" so the RATIFIED stamps are honestly derived.

**F-6 · MINOR · `docs/reference/maxbld-field-lineage.json:946`**
`"change": "new 2026-10-18 (M-204, M-206)"` on `main_length_cap_m` while the same file's `computation` (`:907`) and Spec 78 (`78:1065`) say "one-storey +2.0 m extension on RA only (M-206)". Consistent; the "new 2026-10-18" tag conflates *field added* with *M-204 change*, a small provenance smell, not a defect.

**OK · `78:722` / `69a:308` / `78:1384` / `lineage:189`** — M-199, M-202 land in all four places with one form each. One concept, one form: holds.
**OK · `131:97,99,101`** — LC-49/51/52 status is RULED 2026-10-18 with the operator quote; no `PROPOSED`, no `operator to confirm`.
**OK · `maxbld-trace-lib.mjs:236`** — the lint's word counter splits on whitespace; a template with a 46th word hidden inside `{X}` interpolation still counts the token, so the cap is not gameable by interpolation.
**OK · scope** — none of LC-49/51/52, M-206/207/208 introduces a new field, scenario or data source: LC-51 removes one, LC-49 uses an existing closed form, M-206 reuses `renovation_addition`, M-207 renames a `gate_flags` value, M-208 adds none.

## Summary block

- BLOCKER: 1 (F-1 — `10.20.40.10(8)` still called a GFA exclusion in the disposition + its render).
- MAJOR: 1 (F-2 — LC-52's text promises more than `lintDisclosureTemplates` enforces).
- MINOR: 4 (F-3 `suite_openings_setback` wording; F-4/F-5 Result/Obs criteria overclaim; F-6 lineage change tag).
- OK: 11 of 11 fixed/ruled claims hold at the quoted lines; INV-11, the §6.5→§6.6 cite, the `soft_landscaping` exclusion, the `lot_viability_margin` rename, the M-206 renovation-only scope and the LC-51 withdrawal are all clean.
- Gate to land: fix F-1 and regenerate the tracker before the compliance table's "0 non-compliant rows remain" can be repeated.
