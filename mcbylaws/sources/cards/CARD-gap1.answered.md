# CARD 2026-10-29 (operator decision needed): max build for every building type the lot permits, never needing the applicant's height
Plan: ~/Buildo-scratch/p2close/PLAN-gap1-maxbuild.md. Builds on M-168, M-169, M-56 note (2026-10-25), CHAT-194.USO-Q1 (all ruled; the permission part needs no decision, it only needs the use-scope branch merged).

## G1-Q1 A cap target with no rule found: no cap, or still not evaluated
- Current rule (Spec 68 rule 7, ~/Buildo-wt-rulrec3/docs/specs/01-pipeline/68_mcbylaw_standard.md:353): "no candidate remains => not evaluated (never a silent default)". INV-19 (Spec 78:1429) makes absent articles unregulated, but only through a cited absence ruling per zone, type and target (rule 7a, M-240).
- Example: on the 25 blind lots roof_slope_max is no_candidate on 25 (the only unit is R 10.10.40.10(4)), side_setback_street_m on 20 (corner rule, lot not a corner), lane_centreline_setback_m on 21 (no lane), averaging_distance_m on 25 (no unit keyed). Each blocks the main building because the module throws on any not_evaluated cap.
- Recommendation: (a) absent article (roof_slope_max outside R): a cited absence ruling per target, executed against the pinned page, as M-240 does. (b) article exists but its condition is false for this lot (corner, lane): the max-build module treats it as no cap and discloses `cap_not_found:<target>`; Layer 2 is unchanged.
- Alternative: no module rule; every such target gets an absence or not_applicable ruling in Layer 2 (cleaner, needs a Layer 2 night and about four rulings).
- Cost: (a) one ruling row per target plus a pinned-page check; (b) one module rule and one disclosure code.
- Rule-text line: "A cap target whose article exists but whose condition is false for the lot is no cap in the maximum build and is disclosed cap_not_found; a target whose article is absent in the zone is unregulated by a cited absence ruling."

## G1-Q2 Exceptions that fix the frontage or area as the lot "existed" in 2013
- Current rule (M-41 existing(); evaluate.mjs: existing_building_facts): an existing(...) value with no as-built input is not_evaluated.
- Example: A0067 (exception 155) and A0097 (exception 310): required frontage = existing(lot_frontage_m; enacted(569-2013)); depth and length caps read it and stay not_evaluated, so no building.
- Recommendation: for the maximum build take today's lot frontage and area as the 2013 values (a lot not changed since), and disclose "If the lot was severed or merged after 9 May 2013: the frontage and area limits change."
- Alternative: leave both lots not_evaluated until a user enters the 2013 frontage (no building for these exceptions).
- Cost: one keyed default and one disclosure; affects the lots under exceptions 155 and 310 (count owed from the full table).
- Rule-text line: "Where an exception fixes a lot dimension as it existed on an enactment date and no history is held, the maximum build takes the current dimension and discloses the assumption."

## G1-Q3 "Unlimited storeys" compared with a number in an exception condition
- Current rule (Spec 68:317): "A comparison against it: `regulated()` must guard it, else `not_evaluated:condition_unknown`."
- Example: A0166, exception 21, 900.3.10(21)(D)(i): side setback 0.9 m applies when "lot_frontage_m < 15.3 m and height_storeys >= 2 storeys"; the zone gives unlimited storeys, so the side setback is not_evaluated:unlimited_in_arithmetic and the lot gets no building.
- Recommendation: in the maximum build a storey-count condition is tested at the build-more reading: unlimited counts as 2 or more storeys (so (D)(i) applies, 0.9 m), disclosed "If the building has one storey: ...".
- Alternative: evaluate both arms and keep the larger building, disclosing the other.
- Cost: one evaluator rule for comparisons with unlimited, a count of affected units from the table (owed, measured in T0), one pre-registered round.
- Rule-text line: "In the maximum build a comparison of an unlimited measure with a number is decided in the direction that builds more, and the other arm is disclosed."

## G1-Q4 Front setback for the maximum build on a lot with no user input
- Current rule (operator 2026-10-29 for the CoA scorer; Spec 78 O-12 "The pipeline never reads user entries"): neighbour setbacks from the user, then the footprint estimate flagged needs survey, then 6.0 m flagged as a default.
- Example: all 25 blind lots have front_setback_m not_evaluated:condition_unknown:front_averaging_not_applicable in Layer 2; the blind run filled it from parcel_abutments.
- Recommendation: the step uses the same chain without the user step: footprint estimate (flagged needs survey), then 6.0 m (flagged default).
- Alternative: leave the front setback not_evaluated until a user enters it (no building on any lot).
- Cost: the step calls the existing resolver; the front setback error median is 1.10 m (scorer measurement), so the building depth carries that error and is flagged.
- Rule-text line: "The pipeline's maximum build takes the front setback from the neighbour footprint estimate, then the flagged 6.0 m default; a user entry replaces it only in the app."

---
# ANSWERS 2026-10-29 (operator: "approved - add the rulings and we can change if need be")
- Q1: a cap target with no rule found is "no cap, disclosed" only where the by-law has no such article for that zone (INV-19, M-218); otherwise not_evaluated, flagged. Rule-text line: "A max-build cap with no candidate is unregulated only where the zone has no such article (INV-19, M-218); otherwise it is not evaluated and flagged, never a silent default."
- Q2: exceptions referring to the lot as it existed in 2013 (155, 310) read today's parcel frontage and area as the 2013 values, disclosed. Rule-text line: "Where an exception refers to the lot as it existed on a past date, today's parcel frontage and area stand in for it, disclosed."
- Q3: exception 21 "unlimited storeys" is no storey cap; height alone limits the building. Rule-text line: "An exception that sets no storey limit leaves the building limited by height alone."
- Q4: already answered by FS-SB1 and FS-SB2 (front setback order).
