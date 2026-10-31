# CARD 2026-10-29 (operator decision needed): answering the by-law rules that have no number on the notice
Plan: ~/Buildo-scratch/p2close/PLAN-no-number-rules.md. Builds on CHAT-197.FS-Q1 (build, do not reclassify).

## NN-Q1 Score class for a row we answer but the notice gives no number to compare
- Current rule (~/Buildo-wt-b10fix/scripts/analysis/bylaw-validation/coa-scorecard.mjs:339): a keyed row with a target and no City figure becomes NOT MODELLED "notice states no numeric requirement", which leaves the denominator. FS-Q1 text: "the scorer never reclassifies it to leave the denominator".
- Example: A0457/25EYK#1, 150.7.60.50(2): the notice prints the suite (99.22 m2) and the house (86.02 m2) but the parser keeps required = null. With the house figure read as the comparator it scores MATCH against plan facts (86.02). A0071/26SC#1 (at most 6 dwelling rooms) prints no figure at all.
- Recommendation: (a) the parser takes the figure the notice prints for the other building as the City figure when the clause compares two buildings; (b) a row with no figure anywhere, once answered, gets a new class ANSWERED (no City figure): counts in the answered numerator and denominator, left out of accuracy, listed by name.
- Alternative: after we answer, such rows stay NOT MODELLED (honest, but they never lift a line).
- Cost: one class in the scorer and the floors formula (coa-round.mjs:46-60); pooled needs it to reach 68.
- Rule-text line: "A row the evaluator answers but the notice gives no figure for counts as answered and is left out of accuracy; where the notice prints the other building's figure, that figure is the comparator."

## NN-Q2 Suite height and separation in the scorer
- Current rule (Spec 69a M-286, ~/Buildo/docs/specs/01-pipeline/69a_mcbylaw_register.md:428): proposed_height_m and distance_to_residential_m "are derived scenario values ... neither is a user input", so the scorer leaves 14 rows OWED.
- Example: A0428/26TEY#7: plan facts give separation 7.0 m, so 150.7.60.40(1)(A) gives 4.0 m = City 4. A0486/26TEY#6: height 4.9 m gives 7.5 m = City 7.5.
- Recommendation: in the scorer only, take the applicant's height and separation from the plan facts when held; otherwise stay OWED. Product behaviour (max build) is unchanged.
- Alternative: use the max-build values (6.3 m, 7.5 m) for every row; the two 40(1)(A) rows (City 4.0 m) would DIFFER.
- Cost: scorer reads two plan-fact fields; lifts 150.7.60 from 61.0 to 70.7 and pooled to 63.5.
- Rule-text line: "For validation against a notice the suite height and separation are the applicant's plan figures when held; the product still derives them from the maximum build (M-286)."

## NN-Q3 New vocabulary for the house floor area and dwelling rooms
- Current rule (Spec 68 6.5, P4, M-82 Q5): a new concept is a new dsl_input or dsl_target ruled by the operator.
- Example: 150.7.60.50(2) needs the floor area of the house on the lot; 150.25.20.1(3)(B) needs a dwelling-rooms target (limit 6).
- Recommendation: add dsl_input residential_building_gfa_m2 (Ch.800 gross floor area, 800.50(320)); value order: plan facts existing_gfa_m2, then existing_footprint_sqm x current_stories (already user inputs), then the max-build GFA for a new house. Add dsl_target dwelling_rooms.
- Alternative: leave these rows NO ANSWER (3 rows: A0457#1, A0071#1, A0265#2).
- Cost: two vocab rows, one 69a row, G-READ entries; no grammar change (a LIMIT valued by an input, like 0.6 ratio x lot_area_m2).
- Rule-text line: "A rule that compares two buildings on the lot reads the other building's floor area from a declared input, filled from plan facts, then the user's footprint and storeys, then the maximum build."

## NN-Q4 Neighbour front setbacks (the "density data or the individual" question)
- Current rule (M-205, M-256, Spec 130): the estimate from parcel_abutments, flagged "needs survey"; "density data" is not a repo name, I read it as parcel_abutments built from building footprints (Spec 56). Measured: within 0.5 m on 26.9 %, median error 1.10 m, none within the scorer's 0.01 m on the failing lines.
- Example: A0096/26SC plan prints neighbours 13.44 and 13.39 (average 13.415, City 13.42, MATCH); the estimate for 10.80.40 notices is 0.32 to 0.87 m off.
- Recommendation: add a user input (neighbour front setbacks, one or two values, metres) that overrides the estimate; keep the estimate as the fallback; the scorer reads plan facts neighbour_front_setbacks_m. Do the product input in Phase 3. Optionally re-read the site plans of the 5 notices behind 10.80.40 front-yard rows (A0129, A0201, A0226, A0254, A0289) for neighbour setbacks.
- Alternative: no user input; neighbour rows stay OWED (35 rows, 2 lines cannot lift).
- Cost: one vocab.user_input entry and a Spec 78 field (Phase 3); a 5-document re-read; 10.80.40 needs 2 more answered rows to reach 89.
- Rule-text line: "Where the user supplies the neighbours' front setbacks they replace the footprint estimate; the estimate remains the fallback and is flagged needs survey."

## NN-Q5 Phase and the two lines that cannot lift
- Current rule (QUEUE.md McBylaws section; Spec 68 5a row 7; M-322): Phase 2 closes with the floors met; a floor moves only by --accept --ruling.
- Example: after A1/A2 only 150.7.60 is sure to pass; 10.5.40 needs 3 DIFFERs fixed (platform target, existing side setback), 10.80.40 needs neighbour data.
- Recommendation: A1, A2 and scorer wiring close in Phase 2; neighbour input, A3 (canopy vs platform) and B2 go to Phase 3; the 10.5.40 platform and existing-side-setback fixes are a separate (C) round.
- Alternative: close Phase 2 with 10.5.40 and 10.80.40 recorded as owed to Phase 3 by a RATIFIED row and --accept --ruling.
- Cost: Phase 2 stays open until the (C) round, or carries two owed floors.
- Rule-text line: "Rules that need the neighbours' buildings are Phase 3 work; a floor line that depends on them is owed to Phase 3 by a ratified row, not reclassified."

---
# ANSWERS 2026-10-29 (operator, in chat: "1. y 2. y 3. we shouldn't use dwelling rooms because this input never got filled in - suite floor area vs. the house or semi floor area 4. yes our building footprint data 5. seperate round")
Operator context: "our model needs to use them": the goal is the product model applying these rules; the scorer is the check.
- NN-Q1: A (as recommended).
- NN-Q2: A (as recommended).
- NN-Q3: PARTLY. Add the dsl_input for the main building's floor area (house or semi-detached house), as recommended, for the suite-floor-area-vs-main-building rule. Do NOT add dsl_target dwelling_rooms (the input is never filled in); those rows stay NO ANSWER.
  Rule-text line: "A rule that compares a suite with the main building (house or semi-detached house) reads the main building's floor area from a declared input, filled from plan facts, then the user's footprint and storeys, then the maximum build."
- NN-Q4: A. "Density data" means the building footprint data (parcel_abutments, Spec 56). User-supplied neighbour front setbacks override the footprint estimate; the estimate stays the flagged fallback.
- NN-Q5: separate round for the 10.5.40 measurement mismatches and the 5 site-plan re-reads, so Phase 2 closes on real fixes (recommendation).
