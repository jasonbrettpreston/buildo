# CARD answered 2026-10-29 (operator, in chat): floor scorer rules after the cause census (floor-causes.md)

## FS-Q1 Rows where the notice gives no numeric requirement (19 rows, NO ANSWER today)
- Current behaviour: coa-scorecard.mjs:335-336 (clause not keyed / keyed without a target) are checked before :339 (notice states no numeric requirement), so these rows count as NO ANSWER.
- Proposed (not chosen): check :339 first, so the rows become NOT MODELLED and leave the answered denominator.
- Answer: NOT CHOSEN. The rows stay NO ANSWER and keep counting. These by-law rules matter and must be built, not reclassified. Operator's examples: the garden-suite rule that compares the suite with the main building (a relative rule with no number on the notice), and setbacks that depend on the neighbours' buildings (front-yard averaging, abutting setbacks), where the input may come from density data or from the user.
- Rule-text line: "A by-law requirement the notice states without a number stays NO ANSWER until the evaluator answers it; the scorer never reclassifies it to leave the denominator."
- Follow-up: plan the relative-rule evaluation and the neighbour-setback input (density data or user input).

## FS-Q2 10.5.50.10(4) and (5): apartment-only provisions
- Current behaviour: the clauses are out of scope (apartments), no unit exists, the scorer calls them "clause not keyed" (NO ANSWER).
- Answer: AGREED. Mark them NOT MODELLED with the reason "apartment-only provision, out of scope".
- Rule-text line: "A clause that applies only to a building type outside McBylaws scope (apartments) is NOT MODELLED with that reason, never NO ANSWER."

## FS-Q3 490 Arlington (A0562) corner
- Answer: corner lot. The street bends at less than a right angle; 800.50(150)(B). Applied to the golden page 2026-10-29 (v87) and read in round b (b21f5b56).
