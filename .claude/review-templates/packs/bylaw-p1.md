# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): By-law handbook (Spec 133 section 2, rules by provision family)
Source: docs/specs/01-pipeline/133_bylaw_handbook.md:28-1826
Generator: scripts/generate-bylaw-handbook.mjs --write, from scripts/analysis/bylaw/_schema/bylaw-rule-map.json (Spec 69a M-rows, Spec 131 LC-rows)
Rules in the whole list: 543 (counted by pattern /^- \*\*(m|lc)\.\d+\*\*/) · this is part 1 of 4

<<< Spec 133 section 2 (docs/specs/01-pipeline/133_bylaw_handbook.md:28-1826) >>>
## 2. Rules by provision family

### 20.10 — Permitted Use

First clause cited: 10.20.20.10.

- **m.431** PERM reading: a residential building type is permitted only through 10.20.20.10(1) read with 10.20.20.40(1) (R zone 10.10.20.10 / 10.10.20.40) and its own lot condition.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-31: the step reads the stored permission word with its lot condition; the PERM worked examples…

### 20.20 — Permitted Use - with Conditions

First clause cited: 10.10.20.20.

- **m.81** Operator rulings on the A1–A3 agreed-unit findings R1–R11 (2026-10-08 16:05).
  Status: RATIFIED 2026-10-08 · Enforced by: G-CLAUSE, G-XREF, G-SHAPE, G-TEXT (slicer literals and defects); vocab dsl_target,… · +5 dated notes

### 20.40 — Permitted Building Types

First clause cited: 10.20.20.40.

- **m.369** Four use-scope output findings: split RM 253/475, 600.60 units bind only the Sixplex Overlay, one description corrected, one reason precedence.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.401** Houseplex 5-6 units have a permission route on every relevant lot (SIX-COA, O-18).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-27.L2: A0277 route test; oracle C (MB-27/MB-31); record: chat-rulings-register.logic.test.ts ›…

- **m.394** Routes are Phase 2's and complete (R4-01).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-27.L2: route fixture A0277 coa_required on 10.20.20.40(1) (MB-27/MB-31); record:…

- **m.395** Varied clauses are a list, per option (R4-02).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-27.L2: varied-clause list fixture (MB-27/MB-31); record: chat-rulings-register.logic.test.ts ›…

- **lc.17** Semi-detached houseplex only on half of an existing semi
  Status: RULED · OWED · Enforced by: P5.13 vector; O-4 sample

### 30.1 — General

First clause cited: x.30.1, 10.20.30.1, 10.80.30.1.

- **m.180** Chapter 900 exceptions and houseplexes: the detached-house substitution and "more permissive prevails".
  Status: RATIFIED 2026-10-18 · Enforced by: vocab exception_type_alias; M-75 corrections on the 15 PROCEDURAL units; effective() rule 4 branch + red…

- **m.187** Q1–Q15 dispositions. Each recommendation is adopted as written there: Q1: the three RD null verdicts (10.20.30.1(2), 10.20.40.1(6)(A), 10.20.40.1(7)) are recorded wrong → M-180; the 10.5 ones stay as ruled; the four suite notes ride the M-177 lane.
  Status: RATIFIED 2026-10-18 · Enforced by: M-75 corrections (F06, F08, F10, F22) and the keyer A + B re-keys (Q13) (OWED, keying lane); review-page… · +4 dated notes

- **m.252** An exception clause that names the building type is not displaced by "the more permissive regulation prevails"; duplex / triplex read as a 2- / 3-unit houseplex.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-8 / M-252 — …" (red first: docs/repo…

### 30.10 — Lot Area

First clause cited: 10.80.30.10, 10.60.30.10.

- **m.174** RM review batch (operator 2026-10-15): restrictive design choices are disclosed, not bound (applies M-172 / M-173).
  Status: RATIFIED 2026-10-15 · Enforced by: M-75 corrections (5 applied, 5 held); vocab design_choice_disclosure.unit_sentences · +1 dated note

- **m.181** The semi-detached houseplex's 50 % lot area and frontage apply; a semi-detached house on two lots stays a disclosed site fact.
  Status: RATIFIED 2026-10-18 · Enforced by: M-75 corrections (area: 3 units); keyer A + B re-key (frontage: RS/RM (A)/(B)); G-EVAL red vector, semi… · +2 dated notes

### 30.20 — Lot Frontage

First clause cited: 10.20.30.20, 10.40.30.20.

- **m.145** The 1.0 m-per-unit driveway reduction is a relief arm: the unit is UNUSUAL.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE; G-CLAUSE

- **lc.56** A share of a cited requirement displaces it (2026-10-19).
  Status: RULED 2026-10-19 · Enforced by: bylaw-unfixed-keying.logic.test.ts; G-XREF

### 30.40 — Lot Coverage

First clause cited: x.30.40.

- **m.182** "A residential building with a secondary suite" matches the suite class.
  Status: RATIFIED 2026-10-18 · Enforced by: M-75 corrections (~14 units); applies() suite match + red test (OWED, P2-10 with M-177(1)(b))

- **m.191** Garden-suite coverage: (A) counts the suite's footprint, (B) excludes it, and x.30.40(1)(D) applies under both.
  Status: RATIFIED 2026-10-18 · Enforced by: G-EVAL vector garden lot LC 35 (OWED, P2-10); Spec 78 P5.13 · +1 dated note

- **m.221** Keying defect: the M-182 secondary-suite release is unkeyed (reality check §5.2).
  Status: APPLIED 2026-10-18 · Enforced by: M-182 corrections: bylaw-evaluator-fixes.logic.test.ts › "M-221 / M-182 — …" (green; red at 7a782801^); the…

### 40.1 — General

First clause cited: 10.80.40.1.

- **m.173** Three operator review rulings (2026-10-15).
  Status: RATIFIED 2026-10-15 · Enforced by: vocab scenario_class_units, lot_condition.no_individual_private_driveway,…

- **m.176** MaxBLD answers the maximum-build case.
  Status: RATIFIED 2026-10-15 · Enforced by: M-172 classes (vocab.design_choice_disclosure, vocab.undetermined_condition_disclosure); main-wall model:…

### 40.10 — Height

First clause cited: 10.40.40.10, 10.60.40.10, x.40.10, 10.10.40.10, 10.80.40.10, 10.20.40.10.

- **m.184** Q-MW1: compute both roof forms and headline the larger.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 §Phase-5 roof-form arms + red vectors (RD HT 10.0 flat vs pitched; R 5:3 cap) (OWED, P2-10 / Spec 78…

- **m.185** Q-MW2: the maximum takes dormers at 40 % of the wall width.
  Status: RATIFIED 2026-10-18 · Enforced by: element_width_pct units re-keyed partially_modelled (OWED, keying lane); Spec 78 §Phase-5 red vector (OWED,… · +2 dated notes

- **m.186** Q-MW3: RT has no main-wall rule.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 §Phase-5 RT vector: walls = height (OWED, Spec 78 §Phase-5 commit ①)

- **m.190** The main-wall family is mapped by provision; an RM houseplex has no main-wall cap.
  Status: RATIFIED 2026-10-18 · Enforced by: family map (OWED, keying lane); M-29 sample entries; Spec 78 P5.13 vectors (OWED, step commit ①) · +1 dated note

- **m.200** R has a flat-roof set-back storey: 10.10.40.10(11) and (12).
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.2 item 5; P5.13 (OWED, ①); upper_storey_setback_m target (OWED, keying lane, M-223)

- **m.201** An unlabelled RM lot gives a houseplex 12.0 m.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①); Layer 2 height_m by class (OWED, Layer 2 step)

- **m.217** Evaluator defect: the zone-category scope of M-159(1) is not enforced.
  Status: APPLIED 2026-10-18 · Enforced by: INV-18: bylaw-evaluator-fixes.logic.test.ts › "INV-18 — no applied unit comes from a non-residential chapter…

- **m.218** Evaluator defect: main_wall_height_m is not_evaluated:no_candidate in R/RD/RS/RM (reality check §5.2).
  Status: APPLIED 2026-10-18 · Enforced by: INV-19 (M-218 arm): bylaw-evaluator-fixes.logic.test.ts › "INV-19 — …" › "M-218: …" (green 2026-10-20; red… · +3 dated notes

- **m.237** M-220 absent-article arm (19 cells)
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-2.logic.test.ts › "CHAT-8 / rule 7a / M-186 — …"; bylaw-evaluator-fixes.logic.test.ts › "INV-19…

- **m.260** The by-law handbook is Spec 133 — By-law Handbook, a generated reading spec.
  Status: RULED 2026-10-21 · Enforced by: spec133-bylaw-handbook.logic; generate-bylaw-handbook.mjs --check (pre-commit); spec-split-check --check…

- **m.391** Storeys: Phase 2 decides the cap, S-1 only converts height (R3-08).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: houseplex fixture: storey cap not_applicable stored, S-1 used only where no cap is stored…

- **m.404** S-1: storeys from height use cited logic variables (2.3 m ceiling, 212 mm floor assembly, roof allowance one assembly plus 0.3 m).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: layer3-catalogue.logic: each S-1 variable is seeded with its value and citation (MB-31);…

- **m.457** Increment 2 builds the roof forms: increment 6b's flat set-back storey and pitched roof with attic move into increment 2, with the main-wall share caps; the larger is headlined.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the increment-2 rows tagged "2", locked by src/tests/st…

- **m.459** Storeys under the main-wall limit use the S-1 floor-to-floor, with no parapet deducted.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the wall-storeys row and its examples, locked by layer3-catalogue.logic.test.ts and…

- **m.461** The pitched roof is taken at the steepest pitch the height limit allows, capped in R by the stored roof slope cap.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the pitch row, reading the stored roof_slope_max, locked by layer3-catalogue.logic.test.ts…

- **m.465** Roof form is a labelled design option in Phase 2 (M-400's first option): height_m, main_wall_height_m and upper_storey_setback_m are stored for a flat or shallow roof and for a pitched roof, with the clause's own flat-or-shallow threshold beside them; Layer 3 headlines the larger.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27.L2: the Phase 2 build (red first, prereg), locked by src…

- **m.468** Both x.40.10(2) wall pairs are computed as labelled arms; the larger is headlined and the other shown.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the two arm rows and their labels, locked by layer3-catalogue.logic.test.ts and…

- **m.469** Dormers are taken at 40 % inside the attic test; the free share of the held pair is undecided until its geometry is ruled, so the headline reads "at least X" with headline_lower_bound: free_share.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the dormer closed form inside the attic rows, the four defaults and their disclosures, locked…

- **m.470** The free share of the held pair is modelled in the pitched form as a full-span end block at its maximal share; each arm takes the larger of its with-block and without-block figure; the flat form keeps the plain set-back plate.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the two arm rows with the max(), the flat plate and the disclosure, locked by…

- **m.471** "Despite regulation x.40.10(2)" in the flat-roof main-wall clauses replaces the held-pair route on a flat roof: RD (4)(A) literally, and R (11)/(12), RS (6), RM (6) taken the same way; the union of both routes is not computed.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27.L2: the Phase 2 lock (operator, :294): on the RD flat-roof design-option row…

- **m.473** Increment 2 discloses RD 10.20.40.10(8) (a qualifying attic of 20 m² or less used for mechanical equipment is not a storey) and keeps 382.494 on A0182, A0203, A0205, A0229 and A0277.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the disclosure word and the five golden cells, locked by layer3-catalogue.logic.test.ts and…

- **m.482** Phase 2 stores principal roof_slope_max as unregulated by absence in RD, RS, RM and RT for every class, and in R for detached_houseplex, semi_detached_house and semi_detached_houseplex; R detached_house and house_with_secondary_suite keep 5:3 (10.10.40.10(4)).
  Status: RULED 2026-11-04 · OWED · Enforced by: OWED -> MB-27.L2 (lane E): the red-first lock src/tests/bylaw-mb27l2-roof-slope.logic.test.ts (new,…

- **m.484** The 1:4 roof test of the RD Chapter 900 exceptions is keyed as the design-choice token flat_or_shallow_roof (the 1:4 re-key, its own MB-27.L2 sub-task before the axis night); on those lots the pitched option is taken at a slope of at least 1:4 and the 1:10 to 1:4 band is shown not evaluated.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27.L2 (1:4) (lane E): the red-first lock src/tests/bylaw-mb27l2-1in4.logic.test.ts (new,…

- **lc.59** Review-page rulings, batch 4 (2026-10-19).
  Status: RULED 2026-10-19 · Enforced by: bylaw-evaluator-fixes.logic.test.ts (1); INV-21 (2)

### 40.20 — Building Length

First clause cited: 10.20.40.20, 10.40.40.20, 10.10.40.20.

- **m.206** The one-storey 2.0 m extension is applied to renovations only.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①) · +2 dated notes

- **m.230** RS 10.40.40.20(4): "Despite regulation 10.20.40.20(1)" is read as RS's own 10.40.40.20(1).
  Status: RULED 2026-10-20 · Enforced by: bylaw-evaluator-fixes.logic.test.ts › "M-230 — …" (red first: 2 of 3); bylaw-golden-lots.logic.test.ts…

- **m.240** Rule 7a v2: absence is decided per (zone, building type, target); a definition or another type's limit is not a limit.
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-3.logic.test.ts › "R-7a-v2 / M-240 — …" (red first: docs/rep…

- **m.255** Clauses the City enforces are keyed where the text gives a value.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-13/14 / M-255 — …" (red first: docs/…

### 40.30 — Building Depth

First clause cited: 10.10.40.30.

- **m.204** Houseplex depth and length releases.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.2 item 1, P5.10 gain_reasons (OWED, ①)

### 40.40 — Floor Area

First clause cited: x.40.40, 10.20.40.40, 10.10.40.40.

- **m.183** An exemption that removes every candidate answers "does not apply", never "not evaluated".
  Status: RATIFIED 2026-10-18 · Enforced by: effective() rules 2/7 + regulated(); red vectors houseplex FSI and houseplex storeys (OWED, P2-0 seat)

- **m.189** Max-build scenarios are a net-new V3 step, one row per parcel × scenario.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.11 / P5.13 (red vectors, checks, census row with owner_specs 78 and admin registration, all OWED… · +2 dated notes

- **m.214** Forms not modelled are disclosed.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.12, P5.14 (OWED, ①) · +1 dated note

- **m.215** Two scope statements. (1) R FSI default 0.6: 10.10.40.40(1)(B), *"if the zone label does not include a "d" value … the permitted maximum floor space index is 0.6"*; RD/RS/RT/RM say "not limited".
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①)

- **m.455** MB-80 (2): post-signing edits to the MB-64 increment-1 key from the McProof sign-off, as one ledger row (cases PERM-10, FY-1, FY-3, FY-4, FY-5, FY-14, FY-29, FOOT-14, FOOT-16, FOOT-18, ST-5, ST-9, ST-10, ST-11, ST-12, GFA-5, GFA-8, UN-1, UN-4, LV-1, LV-3, LV-6).
  Status: RULED 2026-11-02 · OWED · Enforced by: OWED -> MB-80 (lane T): the edits of ~/Buildo-scratch/mcbylaws/MB-64/m… · +1 dated note

### 40.50 — Decks and Platforms

First clause cited: 10.20.40.50.

- **m.280** Platform area, platform height and common-wall distance are platform element targets.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-1 / M-280"; red first docs/reports/r…

### 40.70 — Setbacks

First clause cited: 10.20.40.70, 10.10.40.70, 10.80.40.70, x.40.70.

- **m.91** lot_condition token building_length_band.
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE vocab membership; bylaw-s5 token → input check

- **m.107** A LIMIT may be partly modelled when its inexpressible arm is a lot-condition branch.
  Status: RATIFIED 2026-10-14 · Enforced by: vocab literal_not_expressed_reason; G-SHAPE (bylaw-s6g M-107 fixtures); G-CLAUSE; evaluator (Phase 3,… · +1 dated note

- **m.147** "All portions of the main wall exceeding a building length of 25.0 metres" is a portion reading.
  Status: RATIFIED 2026-10-14 · Enforced by: G-SHAPE; G-CLAUSE

- **m.219** Evaluator defect: the garden suite inherits the principal building's setbacks (reality check §5.2).
  Status: APPLIED 2026-10-18 · Enforced by: bylaw-evaluator-fixes.logic.test.ts › "M-219 — Article x.40 …" (the x.40 scope part, green); the…

- **m.248** A dotted range "regulations X(1) to (n)" displaces every regulation in the range.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-3 / M-248 — …" (red first: docs/repo…

- **m.249** RM apartment side yard on a major street is keyed in the parallel form.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-4 / M-249 — …" (red first: docs/repo…

- **m.257** RD side-yard band: the City examiner's actual-frontage reading is followed only where the text supports it.
  Status: RULED 2026-10-21 · Enforced by: none (no code change)

- **m.259** The 0.45 m blank-wall side-yard reduction holds only for a side wall without windows or doors: condition token blank_side_wall, taken as met by default.
  Status: RULED 2026-10-21 · OWED · Enforced by: bylaw-fix-5.logic.test.ts › "F-SC-5 / M-259 — …" (red first: docs/repo…

- **m.283** The apartment primary-windows arm is behind a design token, primary_windows, taken as absent.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-4 / M-283"; docs/reports/red-evidence/bylaw/bylaw-fix-6-4d-b-red.json

- **m.289** The 0.45 m versus 0.9 m side wall is the existing blank_side_wall design input.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-17 / M-289"

- **m.373** OWED to Phase 3: cumulative 10.80.40 answered.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

- **m.435** R-zone main-building side yard: the stored maximum uses 0.9 m; the 0.45 m blank-wall reduction is a disclosure.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-18: item (l), the stored R-zone cell re-keyed 0.45 -> 0.9 with pre-registered moves…

- **m.499** The Layer 2 content of the increment-3 night is settled for five items: the RM houseplex no-candidate cells are re-stored as unregulated by absence (no pitched RM option); the A0399 side yard is keyed red-first; the two frozen oracle tests that Q12-S moves are changed by name; D5 writes class…
  Status: RULED 2026-11-06 · OWED · Enforced by: OWED -> MB-27.L2 (the increment-3 night): the red-first locks for the RM absence re-store, the A0399 keying…

### 40.71 — Setbacks Exemptions

First clause cited: 10.10.40.71.

- **m.244** The Eglinton transportation-use exemption is scoped to its use.
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-3.logic.test.ts › "D-1 / M-244 — …" (red first: docs/reports…

### 40.80 — Separation

First clause cited: 10.10.40.80.

- **m.282** Separation between facing main walls follows the openings to dwelling units: design tokens main_wall_openings and main_wall_openings_each, taken as absent.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-3 / M-282"; docs/reports/red-evidence/bylaw/bylaw-fix-6-4d-b-red.json

### 60.20 — Setbacks

First clause cited: 10.10.60.20.

- **m.241** A private-garage rule binds the ancillary building that is the garage.
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-3.logic.test.ts › "N-2 / M-241 — …" (red first: docs/reports…

### 60.70 — Lot Coverage

First clause cited: 10.10.60.70.

- **m.287** R-zone ancillary lot coverage stays at 5 percent: reading B.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-12 / M-287"

- **lc.54** Review-page rulings (2026-10-19).
  Status: RULED 2026-10-19 · Enforced by: bylaw-evaluator-fixes.logic.test.ts; INV-25; LC-52 lint

### 5.10.1.30

First clause cited: 5.10.1.30.

- **lc.32** Renovation readings: conversion within the building, and the by-law limits that touch a basement (5.10.1.30(3), the entrance ≤ 1.2 m, 800.50(80), headroom being a Building Code matter).
  Status: RULED 2026-10-18 · Enforced by: P5.12 disclosure codes

### 5.10.40.70

First clause cited: 5.10.40.70.

- **m.170** Triangular lots get a lot-condition token; a DEFINE unit's M-169 disclosure is a closed per-unit sentence.
  Status: RATIFIED 2026-10-15 · Enforced by: vocab lot_condition.no_rear_lot_line, undetermined_condition_disclosure.{define_effect, condition_override,…

- **m.376** Phase 3 scope and model values: semis and townhouses are a recorded future build, engine choices are checked against their clause, every model value is a keyed by-law value or an externalized variable.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)" · +1 dated note

### 5.10.175.1

First clause cited: 5.10.175.1.

- **m.88** vocab.requirement members. One member per distinct non-numeric obligation in the R5 card list, with the proposed merges: located_within_building, principal_residence_occupation, occupy_entire_building, regulated_or_supervised, waste_storage_in_building (also the wholly-enclosed form),…
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE shape_required_missing, G-SHAPE vocab membership

- **m.90** An exemption / "unless" arm that cites no regulation is a PERMIT.
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE shape_required_missing

### 10.5.1.10 — Interpretation

First clause cited: 10.5.1.10.

- **m.54** unregulated value and label letter au
  Status: RATIFIED 2026-10-07 · Enforced by: DSL parser fixtures + G-EVAL (bylaw-s6-dsl, bylaw-s6b-eval) · +2 dated notes

- **lc.55** Label letters and the semi-detached houseplex (2026-10-19).
  Status: RULED 2026-10-19 · Enforced by: bylaw-unfixed-keying.logic.test.ts; G-EVAL; INV-25

### 10.5.20.40 — Conversion of Lawfully Existing Buildings

First clause cited: 10.5.20.40.

- **m.94** Disapply to an absent target is a counted disclosure; "will prevent" is a backward trigger.
  Status: RATIFIED 2026-10-13 · Enforced by: G-XREF (displaces_unresolved, refs_target_absent count, trigger_unaccounted), bylaw-rulings.logic

- **m.196** Renovation readings: conversion within the building and the by-law limits that touch a basement.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.13 vectors (OWED, step commit ①) · +3 dated notes

### 10.5.30.20 — Lot Frontage

First clause cited: 10.5.30.20.

- **m.207** Lot viability gates the new-build rows.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①) · +1 dated note

- **m.228** Through lot: the front lot line is the street line the neighbouring lots front on.
  Status: RULED 2026-10-20 · Enforced by: keyed corrections + P5.12 code (applied; bylaw-answers-batch-5.logic.test.ts); Layer 3 lot-line…

### 10.5.30.40 — Lot Coverage

First clause cited: 10.5.30.40.

- **m.169** A condition no data can decide is taken as not holding, and its impact is disclosed.
  Status: RATIFIED 2026-10-15 · Enforced by: vocab undetermined_condition_disclosure (bylaw-rulings M-169 test); M-75 corrections (10.5.40.10(4)(B));… · +4 dated notes

### 10.5.40.10 — Height

First clause cited: 10.5.40.10.

- **m.212** Site-fact disclosures: established grade, triangular lots, shoreline.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.12 codes; triangular detector (OWED, ①)

### 10.5.40.11 — Height Exemptions

First clause cited: 10.5.40.11.

- **m.405** S-2: first floor above established grade is 0 m, disclosed.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: layer3-catalogue.logic: s2_first_floor_above_grade_m is seeded as 0 with the disclosure…

### 10.5.40.40 — Floor Area

First clause cited: 10.5.40.40.

- **m.171** A deduction from a measure that needs building facts is disclosed, never evaluated.
  Status: RATIFIED 2026-10-15 · Enforced by: vocab measure_deduction_disclosure (bylaw-rulings M-171 test); evaluator rendering (P2-0 seat, owed) · +2 dated notes

- **m.203** The attic test decides inclusion in GFA; a failing attic is free floor area, not zero.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①); attic-test keying (OWED, keying lane)

- **m.210** Suite GFA takes the 10.5.40.40 reductions.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①)

- **m.229** Mechanical attic area is left out of GFA by default.
  Status: RULED 2026-10-20 · Enforced by: keyed correction + P5.12 code (applied; bylaw-answers-batch-5.logic.test.ts); keying of 10.5.40.40(2) (OWED,… · +1 dated note

- **m.239** O-7 main-wall share tiers and attic test target shape
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-2.logic.test.ts › "CHAT-9 / O-7 / M-223(3) — …"; bylaw-eval-perf re-pin · +1 dated note

- **m.398** The basement is read, not assumed (R4-05).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: basement read-from-rows fixture (MB-31); record: chat-rulings-register.logic.test.ts ›…

- **m.463** Roof thickness is measured vertically: depth × √(1 + pitch²).
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the vertical-thickness row, locked by layer3-catalogue.logic.test.ts and…

- **m.464** In 10.5.40.40(1)'s "80% of the area", the area is the attic floor with vertical clearance over 1.4 m; test (B) applies to that portion.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27.L2: the reading lock for the Phase 1-2 attic targets (a red-first test naming this row, beside…

- **m.472** M-229 is applied in increment 2: the mechanical-equipment area X is reported outside GFA beside the counted GFA, as three labelled figures; the headline GFA is unchanged.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the X row and the three display fields, locked by layer3-catalogue.logic.test.ts and…

- **m.477** Attic headroom in 10.5.40.40(1) ("between the ceiling joists and the roof rafters") is measured from the top of the attic-floor joists at c0 = Hw − n_w × 2.512; disclosed.
  Status: RULED 2026-11-03 · OWED · Enforced by: OWED -> MB-27: the datum in the attic rows and the disclosure, locked by layer3-catalogue.logic.test.ts and…

### 10.5.40.50 — Decks, Platforms and Amenities

First clause cited: 10.5.40.50.

- **m.290** Platform side setback near a side wall, City 1.1 m versus ours 0.9 m (A0396/26TEY): a scorer reading, not an evaluator fault.
  Status: RULED 2026-10-21 · Enforced by: scorer copy ~/Buildo-scratch/fix-round-4d/B/scorer

- **m.365** Missing rules MR-Q1 to MR-Q4: one verdict per side, both arms for unknown design facts, platform wall input, landscaping share of a base.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

### 10.5.40.60 — Permitted Encroachments

First clause cited: 10.5.40.60.

- **m.128** lot_condition token side_yard_abuts_street.
  Status: RATIFIED 2026-10-14 · Enforced by: vocab lot_condition (bylaw-rulings M-128 test); G-CLAUSE; G-SHAPE · +5 dated notes

- **m.243** Encroachments: one LIMIT may carry a max projection and a min clearance; each projecting element has its own targets.
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-3.logic.test.ts › "D-3 / M-243 — …" (red first: docs/reports…

- **m.254** Platforms meet the zone setbacks; the 10.5.40.60 family takes the declared-bound form.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-4.logic.test.ts › "F-SC-11/12 / M-254 — …" (red first: docs/…

### 10.5.40.70 — Setbacks

First clause cited: 10.5.40.70.

- **m.205** The main building's setbacks are explicit, by-law-derived fields.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.2, P5.10 (OWED, ①); front averaging in Layer 2 (OWED, Layer 2 step) · +2 dated notes

- **m.245** No zone-default floor under the averaged front yard.
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-3.logic.test.ts › "M-205(1)-floor / M-245 — …"; bylaw-front-setback-reliability.logic.test.ts…

- **m.256** Averaging with a missing or excluded neighbour estimate answers "needs survey", never the zone default.
  Status: RULED 2026-10-21 · OWED · Enforced by: bylaw-fix-4.logic.test.ts › "front yard / M-256 — …" (red first: docs/…

- **m.387** Front-yard chain: law stays in Phases 1-2 (R3-03).
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-31: worked examples, one per step of the chain (MB-31); record:…

- **m.414** Front-yard step 2: strict reading of 10.5.40.70(1) for A0553.
  Status: RULED 2026-10-30 · OWED · Enforced by: OWED -> MB-64: front-yard worked example for A0553 (strict reading) (MB-64); record:…

- **m.423** RL-7 (a): the 10.5.40.70(1) 15.0 m is keyed into Phase 2 averaging_distance_m; decided and built with FS-SB2a as one change set.
  Status: RULED 2026-10-31 · OWED · Enforced by: OWED -> MB-18 item (k): the three corrections and the read-as-if-token-held hook, built with M-422 and…

- **m.456** A neighbouring house at exactly 15.0 m qualifies: "15.0 metres or less" is inclusive (10.5.40.70(1)).
  Status: RULED 2026-11-02 · OWED · Enforced by: OWED -> MB-80 (lane T): FY-5 Status and Basis cite this row (the key shows the boundary) and Part A for FY-5…

### 10.5.40.71 — Setbacks Exemptions

First clause cited: 10.5.40.71.

- **m.192** Renovation: 10.5.40.71(3) applies; every other lawfully-existing relief is disclosed.
  Status: RATIFIED 2026-10-18 · Enforced by: Spec 78 P5.13 vector frontage 12.0 vs 13.0 m (OWED, step commit ①); keying of 10.5.40.71(3) (OWED, keying… · +3 dated notes

- **m.211** Renovation corrections. (1) Up room: 10.5.40.71(3) relieves setbacks only; the up-storey plate still meets the depth / length caps (additions must comply, 10.5.40.21(2), 10.5.40.31(2)) and, where FSI applies, also fsi × lot − existing GFA; the smaller cap binds.
  Status: RATIFIED 2026-10-18 · Enforced by: P5.13 (OWED, ①) · +7 dated notes

- **m.372** OWED to Phase 3: cumulative 10.5.40 accuracy.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

### 10.5.50.10 — Landscaping

First clause cited: 10.5.50.10.

- **m.99** dsl_target front_yard_soft_landscaping_pct.
  Status: RATIFIED 2026-10-13 · Enforced by: G-CLAUSE, G-SHAPE

- **m.258** Rear-yard soft landscaping on lots 6.0 m wide or less stays 25 %: the text does not support the City examiner's 50 %.
  Status: RULED 2026-10-21 · Enforced by: none (no code change)

### 10.5.60.20 — Setbacks

First clause cited: 10.5.60.20.

- **m.175** A unit scoped to an accessory-structure use never limits the principal building.
  Status: RATIFIED 2026-10-15 · Enforced by: evaluate.mjs applies() + makeContext().accessoryUses; vocab.mjs evaluatorVocab() carries…

- **m.281** A ground-mounted heating or air-conditioning device has its own targets, energy_device_front_setback_m and energy_device_side_clearance_m.
  Status: RULED 2026-10-21 · Enforced by: bylaw-fix-6.logic.test.ts › "F-4D-1 / M-281"; docs/reports/red-evidence/bylaw/bylaw-fix-6-4d-b-red.json;…

- **m.291** Ancillary-building inputs (parking space, distance to residential) for non-suite buildings are out of scope: disclosure only.
  Status: RULED 2026-10-21 · Enforced by: none (no code change)

### 10.5.60.50 — Floor Area

First clause cited: 10.5.60.50.

- **m.242** "In all other cases" takes the condition of the arm it complements.
  Status: RULED 2026-10-20 · Enforced by: bylaw-fix-3.logic.test.ts › "N-3 / M-242 — …" (red first: docs/reports…

### 10.5.75.1 — General

First clause cited: 10.5.75.1.

- **m.87** Phrasing-variant licence patterns.
  Status: RATIFIED 2026-10-13 · Enforced by: G-CLAUSE variable_unlicensed, G-SHAPE vocab_synonym (no pattern shared)

- **m.92** Citation to a target absent from the pinned City text is a counted source_defect ref_target_absent.
  Status: RATIFIED 2026-10-13 · Enforced by: G-XREF (refs_target_absent count), bylaw-rulings.logic

- **m.102** A LIMIT unit carrying a real limit the DSL cannot express is UNUSUAL.
  Status: RATIFIED 2026-10-13 · Enforced by: G-CLAUSE, G-SHAPE · +1 dated note

### 10.5.80.1 — General

First clause cited: 10.5.80.1.

- **m.95** By-law-wide override is a PERMIT; an INCLUDE of "Chapter 900" is a phase2_exception ref.
  Status: RATIFIED 2026-10-13 · Enforced by: G-XREF trigger_unaccounted, include_unresolved, ref_unresolved; G-READ external arm

- **m.98** A mixed-direction LIMIT is UNUSUAL — M-83 Q6 extended.
  Status: RATIFIED 2026-10-13 · Enforced by: G-SHAPE shape_must_be_none, G-CLAUSE

- **m.225** Keying defect being fixed: 10.5.80.1(2)(A) leaks into the suite separation citywide.
  Status: APPLIED 2026-10-18 · Enforced by: INV-18: bylaw-evaluator-fixes.logic.test.ts › "INV-18 — …" › "M-225: …" (green 2026-10-20; red at a0d5b41e^) · +1 dated note

### 10.5.100.1 — General

First clause cited: 10.5.100.1.

- **m.366** Missing rules MR-Q5 to MR-Q9 and the ancillary floor area target.
  Status: RULED 2026-10-29 · OWED · Enforced by: chat-rulings-register.logic.test.ts › "CHAT-199 (batch 2026-10-29-ab)"

