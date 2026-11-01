# MB-62 AUDIT of the Phase 3 maximum-building envelopes (25 lots x 3 types)

Auditor: an independent read-only seat. Date 2026-10-30. No code changed, nothing committed, no DB write, no Python. The hand derivation is `~/Buildo-scratch/p2close/mb62/hand.mjs` (it does not import the engine); Layer 2 per-class limits for all 25 lots come from `dumpall.mjs` -> `l2all.json` / `l2all.txt` (same harness as `mb17/dump.mjs`). Clause lines are in `~/Buildo-wt-p3engine/docs/reference/bylaw-provisions.md`; the ruling lines are in `~/Buildo-wt-p3model/docs/specs/01-pipeline/69a_mcbylaw_register.md`. The engine modules are in `~/Buildo-wt-p3engine/scripts/lib/` (`maxbld-main-building.js`, `maxbld-houseplex-units.js`, `maxbld-secondary-suite.js`, `maxbld-layer2-view.js`, `maxbld-scenario-status.js`) and `scripts/lib/compute/compute-maxbld-scenarios.js`, not under `compute/` as the task text says.

## 1. Result

Verdict is on the engine's logic using the engine's own lot facts. Separately, section 4 lists where the engine's lot facts differ from the keyed golden facts (this changes many numbers and is NOT counted in the verdicts except where noted).

| Type | CORRECT | WRONG | CAN'T TELL |
|---|---|---|---|
| detached_house | 13 | 11 | 1 |
| detached_houseplex | 16 | 6 | 3 |
| house_with_secondary_suite | 21 | 4 | 0 |

CORRECT includes about 20 rows that carry a 1.0 to 2.3 percent attic-datum overstatement (D6) which I treat as a model inconsistency, not a failure. The four D1 houseplex rows (A0067 A0094 A0166 A0170) are WRONG under either reading of an open ruling.

Headline answers:

* The very large houseplex envelopes (A0399 1,001.9; A0229 831.5; A0182 697; A0203 659.6; A0277 659; A0193 650.7; A0205 648.8) are what the clauses give. I found no logic error that makes them too large beyond 1.3 to 1.4 percent (D6). The exceptions: A0182 is 13 percent too large if the keyed depth (38.33) is the lot's depth (D4), and A0399 depends on a front yard of 1.63 m from neighbour averaging and on an input lot that is 7 to 16 percent different from the keyed lot.
* The numbers that ARE wrong are mostly the FSI-capped detached houses and some capped houseplexes, which are 5 percent ABOVE the by-law cap (17 rows, D5), the footprint on two corner lots (D3), four rows that were not computed at all (D2), and the houseplex FSI on four exception lots, which is a ruling question with a 2.3 to 2.6 times swing (D1).
* "Houseplex has no FSI and no storey limit" holds for the zone clauses only (section 3, item 5). It does not hold for the engine's output on four lots, and the height limit and the lot caps still bound it.

## 2. Method and what the hand derivation is

For each lot and type I hand-coded the law limits in `hand.mjs` from the clauses quoted below (height, storey cap, main-wall limit, coverage, depth, length, side, rear, FSI, exception effects). Front yard is taken from Layer 2 (neighbour averaging, 10.5.40.70(1), L323; needs survey, not re-derivable here). The tuning constants are the engine's P5.9 values, not law: storey height 3.0 m, first floor 0.6 m, pitch 1.0, assembly depth 0.3 m, circulation 0.1, basement livable share 1.0 (registry `~/Buildo-wt-p3engine/docs/reference/logic-variables-registry.md:376-398`). Geometry convention (engine `maxbld-main-building.js:101-114`): plate = (frontage - 2 sides) x min(depth - front - rear, depth cap, length cap), capped by coverage; GFA = wall storeys x plate + attic (or flat-roof step-back storey). When I feed my model the engine's attic datum it reproduces the engine to the digit on 15 uncapped pitched rows and to within 0.6 percent on the other 5 (A0097 detached and suite, A0193 suite, A0354 suite), so the engine arithmetic is not otherwise at fault.

What is NOT law and cannot be checked from the by-law: the attic geometry (a 45 degree roof rising from the main-wall limit and flat-topped at the height limit, so the third floor of a houseplex is about 95 to 99 percent of the plate: a stylised roof, "drafted ruling Q-G" in the module header `maxbld-main-building.js:9-15`). The by-law bounds are 2 plates (wall storeys) to 3 plates (three full storeys); every houseplex number lies inside that bracket.

Systematic omissions (not scored per row): the 2.0 m one-storey extension for a detached house (10.20.40.20(2), L567, DH and suite only, about 12 to 15 m2 on f13.5/f15 lots); the parking-space exclusion from FSI GFA (10.5.40.40(3)(C),(D), L307) so FSI-capped rows understate by one garage; and the R-zone 0.45 m side yard assumes blank side walls (10.10.40.70(4), L489), a "build more" assumption, not a fact.

## 3. The six suspicions, tested

**1. House with a secondary suite larger than the detached house on 14 lots.** Confirmed as a count (A0097 A0175 A0182 A0193 A0289 A0354 A0375 A0388 A0399 A0457 A0461 A0464 A0561 A0562) but it is the by-law and an operator ruling, not an engine error. Definitions (L1492, L1493, L1612): "(180) Detached House means a building that has one dwelling unit occupying the entire building."; "(181) ... (F) A detached house, semi-detached house or townhouse that has one or more secondary suites is not a detached houseplex."; "(735) Secondary Suite means self-contained living accommodation ... located in and subordinate to a dwelling unit." So the house with a suite is still a detached house. But the 2025 amendment says (RD 10.20.40.40(1)(C), L572): "the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite" (same words R L482, RM L790), and 10.20.30.40(1)(D) (L546) lifts coverage to 45 percent "if the lot contains a detached houseplex or a residential building with a secondary suite". The operator ruled this on 2026-10-18 ("we need the house with and without"; 69a M-182, M-196(1): "FSI is not_applicable for the houseplex and for the house with a suite", register lines 326 and 329). Consequence the operator should know: because every detached house may take a suite (150.10.20.1(1)(A), L976), the "detached_house" row is never the largest detached build; it is a lower bound. Caveat: the amending by-law 848-2025 is marked not_verified in the provisions table (L546, L572).

**2. suite.host_interior_sqm exceeds the building's own GFA.** Explained, not an error. `maxbld-secondary-suite.js:30-32`: host = (main_gfa + footprint x basement_livable_share) x (1 - circulation). With share 1.0 the whole basement plate is added: A0067 (279 + 228.3) x 0.9 = 456.6. I checked all 23 suite rows: the formula holds on 23 of 23, and host exceeds GFA on 23 of 23 because the basement is added. This is consistent with the definition (GFA includes below ground floors, L1522) and with M-199 (45 percent of the whole house interior). The number is correctly labelled interior, not GFA. Two things to know: (a) it assumes 100 percent of the footprint is a livable basement, a P5.9 setting not law; (b) suite_gfa_sqm is the suite share grossed back, so it includes basement area and is not comparable with the above-grade GFA column.

**3. Houseplex FSI-capped on A0067 A0094 A0166 A0170, uncapped on A0182 A0193 A0203 A0205 A0229 A0277.** The split is not by zone. All ten are RD. The four capped lots carry an exception with an FSI arm: x155 and x252 send the lot to x1462 ("(A) The maximum floor space index for a lot with a dwelling unit in a permitted building type is: (ii) the lesser of 0.5 times the lot area or 279 square metres, if the lot area is 408 square metres to 697 square metres", L3572); x21(C) ("The maximum gross floor area on a lot is 135 square metres plus 25% of the lot area, up to a maximum floor space index of 0.5", L2281); x38(A) (L2298, 125 m2 + 25%, max 0.5). The uncapped lots are x5 (L2265, side yard only) or no exception, with no "d" in the label (A0193 has d0.45 in the parcel label but no exception, and it is uncapped for the houseplex because 10.20.40.40(1)(C) applies). Whether an exception FSI arm should bind a houseplex is the open ruling D1.

**4. A0399 (RM) houseplex 1,001.9 m2 on a 521.8 m2 lot (footprint 334).** Re-derived to the digit on the engine's lot (11.58 x 45.07): side 0.6 m (x23(D)(i), L4303, substituted for the houseplex by M-180 and more permissive than the base 1.2 m, 10.80.40.70(3)(A), L795); rear max(7.5, 25 percent of 45.07) = 11.27 (L794); front 1.63 (averaging, L323); plate = (11.58 - 1.2) x (45.07 - 1.63 - 11.27) = 10.38 x 32.17 = 334.0. Coverage: RM has no value on this lot, "(B) if a lot is not in an area with a numerical value on the Lot Coverage Overlay Map, no lot coverage applies" (L771). Depth and length: 10.80.40.30(1) and 10.80.40.20(1) are written for "a detached house or a semi-detached house" only (L789, L786), so a houseplex has none in RM (RD and R do include it: L570, L481). FSI: 10.80.40.40(1)(C) (L790) removes it. Storeys: no ST on the lot and 10.80.40.10(3)(C) (L782) removes the cap anyway; height = greater of HT or 10.0 m (10.80.40.10(1)(C), L780); the main-wall limit 10.80.40.10(2) is for a detached or semi-detached house only (L781), so walls run to 10 m and floor((10 - 0.6)/3) = 3 full storeys, 3 x 334.0 = 1,001.9. So the number is text-literal. It is the largest because RM + unmapped coverage + houseplex is the one combination with no cap at all except setbacks. Fragile inputs: the front yard (with the base 6.0 m, L793, the plate would be 288.6 and GFA 866); the lot (keyed 12.43 x 48.3 gives 1,166); the label (the notice says plain RM, so no d0.6; this changes the detached house, which is FSI-capped only if d0.6 is real). Also 3 storeys inside 10.0 m leaves 0.4 m above the last ceiling for a roof, which is tight but not impossible. The mb17 card ("legitimate by the keyed rules") is right on the text.

**5. "Houseplex has no FSI and no storey limit" in RD/R/RM.** Verbatim clauses:
* RD 10.20.40.40(1) (L572): "(C) the permitted maximum floor space index in regulation (A) and (B) above does not apply to a detached houseplex, or a residential building with a secondary suite; and (D) despite (A) to (B) above, the permitted maximum floor space index regulations do not apply to a townhouse or an apartment building with 60 dwelling units or less located on a lot abutting a major street".
* R 10.10.40.40(1) (L482): "(C) ... does not apply to a detached houseplex, semi-detached houseplex or a residential building with a secondary suite". RM 10.80.40.40(1)(C) (L790): same words.
* RD 10.20.40.10(3) (L559): "(C) the permitted maximum number of storeys in a building on a lot in regulation (A) does not apply to a detached houseplex." R 10.10.40.10(3)(C) (L469) and RM 10.80.40.10(3)(C) (L782): "does not apply to a detached houseplex or semi-detached houseplex".
* Height: RD 10.20.40.10(1)(C) (L557): "the permitted maximum height for a detached houseplex is the greater of: (i) the numerical value, in metres, following the letters "HT" on the Height Overlay Map; or (ii) 10.0 metres". R L467, RM L780 the same. At 3.0 m a storey plus 0.6 m this is 3 storeys at 10 to 11 m and 4 at 13 m, so "no storey limit" is bounded by height.
* Exceptions: 10.20.40.1(6) (L552): "for a detached houseplex that is the only residential building on a lot, if an applicable Chapter 900 Exception contains principal building requirements for: (A) a detached house, then the permitted detached houseplex is subject to the applicable Chapter 900 Exception's building requirements for a detached house." 10.20.40.1(7) (L553): "if a regulation in clauses 10.20.40.10, 10.20.40.20, 10.20.40.30, 10.20.40.40 or 10.20.40.50 for a detached houseplex is more permissive than the regulation that would apply ... under regulation 10.20.40.1(6), then the more permissive regulation prevails." R L462-463 and RM L775-776 (RM names only 10.80.40.10 and 10.80.40.40). Ruling M-180 (register line 295) and the narrowing M-252 (line 405). Result: the zone clauses give the houseplex no FSI and no storey limit, but the engine applies an exception FSI to a houseplex on four lots (D1), and the height, coverage (RD 45 percent; RM only where mapped; R none), RD/R depth and length caps, and setbacks still bound it. The statement in `CARD-mb17-bounds.md` is correct about the zone clauses and incomplete about the exceptions.

**6. Footprint differs between detached and houseplex on the same lot.** Explained by which caps each type carries:
* RD coverage: detached = Lot Coverage Overlay value (30 to 35 percent here); houseplex and suite = 45 percent (10.20.30.40(1)(D), L546).
* RD length: detached and suite 17.0 (10.20.40.20(1), L566); houseplex 19.0 where depth >= 40 and frontage >= 10 (10.20.40.20(3)(B), L568), otherwise 17.0. Depth 19.0 for both (10.20.40.30(1), L570).
* R: depth 17.0 for all, houseplex 19.0 where depth >= 36 (frontage < 10) or >= 40 (frontage >= 10) (10.10.40.30(1)(A),(B), L481); no coverage article.
* RM: detached and suite carry depth 19.0 and length 17.0 (L789, L786); a houseplex carries neither (L786, L789 are for a detached or semi-detached house).
All consistent in the engine except the street side yard on corner lots (D3) and the lot-depth inputs (D4).

## 4. Lot facts: engine input versus keyed golden

Engine inputs come from the parcel and zoning layers (`blind-run-parcels.json`); the keyed facts are `~/Buildo-scratch/golden/keyed-final-20261029/golden_cases/*.json`.

| Lot | Engine (parcel layer): label / area / frontage / depth / corner | Keyed golden: label / area / frontage / depth / corner | Difference that matters |
|---|---|---|---|
| A0067 | RD (f15.0; a557) (x155) / 580.13 / 15.23 / 38.08 / no | RD (f15.0; a557) (x155) / 580.6 / 15.24 / 38.1 / none | within about 2% |
| A0094 | RD (f10.5) (x252) / 508.97 / 22.39 / 22.73 / no | RD (f10.5) (x252) / 512.6 / 22.39 / 22.73 / none | within about 2% |
| A0097 | RD (x310) / 487.66 / 12.82 / 38.05 / no | RD (x310) / 487.68 / 12.8 / 38.1 / none | within about 2% |
| A0166 | RD (f13.5; a510; d0.45) (x21) / 491.04 / 13.14 / 37.36 / corner | RD (f13.5; a510; d0.45) (x21) / 490.29 / 12.35 / 38.16 / corner | keyed frontage 12.35 vs 13.14; both corner |
| A0170 | RD (f13.5; a510; d0.45) (x38) / 486.94 / 14.54 / 33.48 / no | RD / 488 / 14.55 / 33.53 / none | label: notice "RD" (corrected) has no d0.45, no x38; engine ran FSI 0.5 from x38 |
| A0175 | R (f7.5; d0.6) (x604) / 255.42 / 7.61 / 33.57 / no | R (f7.5; d0.6) (x604) / 255.48 / 7.62 / 33.53 / none | within about 2% |
| A0179 | RM (u4) (x22) / 209.75 / 7.65 / 27.41 / no | RM / 211.12 / 7.696 / 27.43 / corner | notice "RM", no exception; engine ran x22 (9.5 m, 0.9 m side); keyed corner, engine not corner |
| A0182 | RD (f15.0; a550) (x5) / 637.49 / 15.88 / 40.15 / no | RD (f15.0; a550) (x5) / 637.51 / curved / 38.33 / none | keyed depth 38.33 < 40: houseplex length cap 17 not 19; frontage keyed "curved" |
| A0193 | RD (f13.5; a510; d0.45) / 587.44 / 15.22 / 38.60 / no | RD / 558.93 / 16.62 / 39.34 / none | notice "RD" has no f/a/d label; area -5%, frontage +9% |
| A0203 | RD (f15.0; a550) (x5) / 649.91 / 15.22 / 42.71 / no | RD (f15.0; a550) (x5) / 647 / 15.24 / 42.47 / none | within about 2% |
| A0205 | RD (f15.0; a600) (x5) / 659.32 / 15.03 / 43.85 / no | RD (f15.0; a600) (x5) / 659.5 / 15.26 / 43.71 / none | within about 2% |
| A0229 | RD (f15.0; a550) (x5) / 947.38 / 18.25 / 51.91 / no | RD (f15.0; a550) (x5) / 947.61 / 18.29 / 51.82 / none | within about 2% |
| A0277 | RD (f15.0; a550) (x5) / 696.73 / 15.21 / 45.80 / no | RD (f15.0; a550) (x5) / 696.01 / 15.24 / 45.67 / none | within about 2% |
| A0289 | RM (f12.0; u4; d0.8) (x252) / 244.54 / 7.62 / 32.07 / no | (f12.0; u4; d0.8) (x252) / - / 7.62 / - / none | keyed area and depth missing |
| A0354 | RD (f9.0; a280; d0.45) / 327.15 / 9.75 / 33.56 / no | RD (f9.0; a280; d0.45) / 327 / 9.754 / 33.528 / none | within about 2% |
| A0375 | R (d1.0) (x848) / 156.63 / 4.99 / 31.38 / corner | R (d1.0) (x848) / 237.88 / 6.1 / 39.01 / corner | engine lot 156.6 m2 / 4.99 m vs keyed 237.9 m2 / 6.1 m (+52% area) |
| A0388 | R (d0.6) (x736) / 211.74 / 5.88 / 36.02 / no | R (d0.6) (x736) / 230.1 / 6.17 / 35.05 / none | keyed depth 35.05 < 36: houseplex depth cap 17 not 19 |
| A0399 | RM (u4; d0.6) (x23) / 521.81 / 11.58 / 45.07 / no | RM / 520.93 / 12.43 / 48.3 / none | notice "RM" (corrected) has no u4/d0.6; keyed 12.43 x 48.3 vs engine 11.58 x 45.07 |
| A0457 | RM (f12.0; u4; d0.8) (x252) / 274.12 / 7.61 / 36.04 / no | RM (f12.0; u4; d0.8) (x252) / 274.09 / 7.62 / 35.97 / none | within about 2% |
| A0461 | RM (f12.0; u4; d0.8) (x252) / 320.43 / 7.63 / 42.00 / no | RM (f12,u4,d 0.8) / 320.5 / 7.63 / 42.06 / none | notice label has no x252 |
| A0464 | R (d0.6) (x809) / 246.63 / 6.83 / 36.09 / no | R (d0.6) (x809) / - / 6.1 / 35.21 / through | keyed depth 35.21 < 36, frontage 6.1 vs 6.83; keyed area missing |
| A0553 | RD (f13.5; d0.6) (x1436) / 255.83 / 13.47 / 18.99 / no | RD (f13.5; d0.6) (x1436) / 255.84 / 11.94 / 21.05 / corner | keyed corner, engine not corner; frontage 11.94 vs 13.47, depth 21.05 vs 18.99 |
| A0561 | R (d1.0) (x804) / 199.33 / 5.37 / 37.15 / no | R (d1.0) (x804) / 204.92 / 5.4 / 37.39 / none | within about 2% |
| A0562 | RM (f12.0; u4; d0.8) (x252) / 304.19 / 10.91 / 27.89 / no | RM (f12.0; u4; d0.8) (x252) / 303.64 / null / null / corner | keyed frontage, depth missing; keyed corner, engine not corner |
| A0578 | RD (f12.0; d0.6) (x1397) / 320.66 / 9.40 / 34.13 / corner | RD (f12.0; d0.6) (x1397) / 345.22 / 9.73 / 35.48 / corner | area 345 vs 321; frontage 9.73 vs 9.40; depth 35.48 vs 34.13 |

Column "Hand on keyed lot facts" in section 5 re-runs the hand derivation with the keyed area, frontage and depth (a * means one keyed figure was missing and the engine figure was used; n/a means two or more were missing). It does not change labels or the corner flag.

## 5. Per-lot, per-type table

Hand GFA applies the FSI cap where the exception or label gives one, with the permitted mechanical-attic exclusion (10.5.40.40(2), L306) done correctly. "Hand" columns use the engine's lot facts. Houseplex FSI on x155, x252, x21, x38 lots is shown capped (reading A of D1).

| Lot | Zone label (engine) | Type | Engine GFA / footprint / storeys / H | Hand GFA / footprint / storeys / H | Hand on keyed lot facts | Verdict | Cause / clause |
|---|---|---|---|---|---|---|---|
| A0067 | RD (f15.0; a557) (x155) | DH | 279 / 191.4 / 2 / 9 | 279 / 191.4 / 2 / 9 | 279 (+0%) | **CORRECT** | 279 = x1462(A)(ii) cap 0.5 x 580.13 (L2413,L3572); 2 storeys (ST2, 10.20.40.10(3)(A)) |
| A0067 | RD (f15.0; a557) (x155) | HP | 293 / 228.3 / 3 / 10 | 279 / 228.3 / 3 / 10 | 279 (+0%) | **WRONG** | Q3 +5% over cap (293 vs 279); and the cap itself is ruling-dependent (D5): uncapped hand = 672 |
| A0067 | RD (f15.0; a557) (x155) | SUITE | 279 / 228.3 / 2 / 9 | 279 / 228.3 / 2 / 9 | 279 (+0%) | **CORRECT** | 279 = x1462 cap (exception governs, 900.1.10(3)); 10.20.40.40(1)(C) exempts only the zone FSI |
| A0094 | RD (f10.5) (x252) | DH | 254.5 / 168 / 2 / 9 | 254.5 / 168 / 2 / 9 | 256.3 (+1%) | **CORRECT** | 254.5 = 0.5 x 508.97 (x252(C)->x1462(A)(ii)); cov 33% -> F 168 |
| A0094 | RD (f10.5) (x252) | HP | 267.2 / 229 / 3 / 10 | 254.5 / 229 / 3 / 10 | 256.3 (+1%) | **WRONG** | Q3 +5% (267.2 vs 254.5); cap ruling-dependent (D5): uncapped hand = 677 |
| A0094 | RD (f10.5) (x252) | SUITE | 254.5 / 229 / 2 / 9 | 254.5 / 229 / 2 / 9 | 256.3 (+1%) | **CORRECT** | 254.5 = x1462 cap |
| A0097 | RD (x310) | DH | 476.2 / 160.9 / 3 / 9 | 465.6 / 160.9 / 3 / 9 | 465.6 (+0%) | **CORRECT** | no d: no FSI; datum +2.3% (D6) |
| A0097 | RD (x310) | HP | 559.4 / 187.3 / 3 / 10 | 551.4 / 187.3 / 3 / 10 | 550.4 (-0%) | **CORRECT** | x310 has no FSI arm; F 187.3 = 45% box; datum +1.4% (D6) |
| A0097 | RD (x310) | SUITE | 555.4 / 187.3 / 3 / 9 | 544.8 / 187.3 / 3 / 9 | 543.8 (-0%) | **CORRECT** | datum +1.9% (D6) |
| A0166 | RD (f13.5; a510; d0.45) (x21) | DH | 257.8 / 162 / 3 / 9.5 | 245.5 / 157.1 / 3 / 9.5 | 245.1 (-0%) | **WRONG** | Q3 +12.3 over 245.5 cap (x21(C): min(135+25%,0.5)); footprint 162 vs 157.1: corner street side ignored (D3) |
| A0166 | RD (f13.5; a510; d0.45) (x21) | HP | 257.8 / 192.8 / 3 / 10 | 245.5 / 157.1 / 3 / 10 | 245.1 (-0%) | **WRONG** | footprint 192.8 vs 157.1 (-18.5%): corner street side 3.0 m ignored (D3); Q3; cap ruling-dependent (D5) |
| A0166 | RD (f13.5; a510; d0.45) (x21) | SUITE | 257.8 / 192.8 / 3 / 9.5 | 245.5 / 157.1 / 3 / 9.5 | 245.1 (-0%) | **WRONG** | footprint 192.8 vs 157.1: street side ignored (D3); Q3 +12.3 |
| A0170 | RD (f13.5; a510; d0.45) (x38) | DH | 255.6 / 160.7 / 3 / 9.5 | 243.5 / 160.7 / 3 / 9.5 | 244 (+0%) | **WRONG** | Q3 +12.1 over 243.5 (x38(A)); also notice label is plain RD (no d, no x38): input conflict |
| A0170 | RD (f13.5; a510; d0.45) (x38) | HP | 255.6 / 200.4 / 3 / 10 | 243.5 / 200.4 / 3 / 10 | 244 (+0%) | **WRONG** | Q3 +5%; cap ruling-dependent (D5): uncapped hand = 590 |
| A0170 | RD (f13.5; a510; d0.45) (x38) | SUITE | 255.6 / 200.4 / 3 / 9.5 | 243.5 / 200.4 / 3 / 9.5 | 244 (+0%) | **WRONG** | Q3 +12.1 over 243.5 |
| A0175 | R (f7.5; d0.6) (x604) | DH | 160.9 / 114.1 / 3 / 11 | 153.3 / 114.1 / 3 / 11 | 153.3 (+0%) | **WRONG** | Q3 +7.6 over 153.3 (R d0.6) |
| A0175 | R (f7.5; d0.6) (x604) | HP | 342.2 / 114.1 / 3 / 11 | 342.2 / 114.1 / 3 / 11 | 342.7 (+0%) | **CORRECT** | R: no FSI (10.10.40.40(1)(C)), no coverage article (ABS-1), 3 storeys at HT 11, depth 17 |
| A0175 | R (f7.5; d0.6) (x604) | SUITE | 342.2 / 114.1 / 3 / 11 | 342.2 / 114.1 / 3 / 11 | 342.7 (+0%) | **CORRECT** | same envelope as houseplex (R has no ST, no coverage); FSI exempt by (C) |
| A0179 | RM (u4) (x22) | DH | 232.5 / 79.2 / 3 / 9.5 | 228.3 / 79.2 / 3 / 9.5 | 230.5 (+1%) | **CORRECT** | datum +1.8%; x22 per parcel label (notice label: plain RM, no x22): input conflict |
| A0179 | RM (u4) (x22) | HP | 237.5 / 79.2 / 3 / 10 | 237.5 / 79.2 / 3 / 10 | 239.7 (+1%) | **CORRECT** | RM: no depth/length cap for a houseplex (10.80.40.20(1),.30(1)); 3 full storeys at 10 m |
| A0179 | RM (u4) (x22) | SUITE | 232.5 / 79.2 / 3 / 9.5 | 228.3 / 79.2 / 3 / 9.5 | 230.5 (+1%) | **CORRECT** | datum +1.8% |
| A0182 | RD (f15.0; a550) (x5) | DH | 382.5 / 191.2 / 2 / 10 | 382.5 / 191.2 / 2 / 10 | 382.5 (+0%) * | **CORRECT** | 2 x 191.2 (ST2; cov 30%) |
| A0182 | RD (f15.0; a550) (x5) | HP | 697 / 233.3 / 3 / 10 | 688.2 / 233.3 / 3 / 10 | 614.5 (-11%) * | **CAN'T TELL** | logic OK (+1.3% datum) but parcel depth 40.15 vs keyed 38.33 straddles the 40.0 m test in 10.20.40.20(3)(B): length 19 vs 17 -> 614 not 697 |
| A0182 | RD (f15.0; a550) (x5) | SUITE | 417.5 / 208.8 / 2 / 10 | 417.5 / 208.8 / 2 / 10 | 417.5 (+0%) * | **CORRECT** | 2 storeys (ST2), cov 45%, length 17 |
| A0193 | RD (f13.5; a510; d0.45) | DH | 277.6 / 193.9 / 3 / 9.5 | 264.3 / 193.9 / 3 / 9.5 | 251.5 (-5%) | **WRONG** | Q3 +13.3 over 264.3; notice label plain RD (no d0.45): input conflict |
| A0193 | RD (f13.5; a510; d0.45) | HP | 650.7 / 217.9 / 3 / 10 | 641.5 / 217.9 / 3 / 10 | 711.6 (+11%) | **CORRECT** | datum +1.4%; length 17 (depth 38.6 < 40) correct; input: keyed frontage 16.62/area 558.9 -> 712 |
| A0193 | RD (f13.5; a510; d0.45) | SUITE | 646.1 / 217.9 / 3 / 9.5 | 633.8 / 217.9 / 3 / 9.5 | 703 (+11%) | **CORRECT** | datum +1.9%; input-divergent |
| A0203 | RD (f15.0; a550) (x5) | DH | 395.1 / 197.5 / 2 / 10 | 395.1 / 197.5 / 2 / 10 | 395.8 (+0%) | **CORRECT** |  |
| A0203 | RD (f15.0; a550) (x5) | HP | 659.6 / 220.8 / 3 / 10 | 651.2 / 220.8 / 3 / 10 | 652.3 (+0%) | **CORRECT** | datum +1.3% |
| A0203 | RD (f15.0; a550) (x5) | SUITE | 395.1 / 197.5 / 2 / 10 | 395.1 / 197.5 / 2 / 10 | 395.8 (+0%) | **CORRECT** |  |
| A0205 | RD (f15.0; a600) (x5) | DH | 388.6 / 194.3 / 2 / 10 | 388.6 / 194.3 / 2 / 10 | 395.7 (+2%) | **CORRECT** |  |
| A0205 | RD (f15.0; a600) (x5) | HP | 648.8 / 217.2 / 3 / 10 | 640.5 / 217.2 / 3 / 10 | 653.4 (+2%) | **CORRECT** | datum +1.3% |
| A0205 | RD (f15.0; a600) (x5) | SUITE | 388.6 / 194.3 / 2 / 10 | 388.6 / 194.3 / 2 / 10 | 396.4 (+2%) | **CORRECT** |  |
| A0229 | RD (f15.0; a550) (x5) | DH | 498.1 / 249.1 / 2 / 10 | 498.1 / 249.1 / 2 / 10 | 499.5 (+0%) | **CORRECT** |  |
| A0229 | RD (f15.0; a550) (x5) | HP | 831.5 / 278.4 / 3 / 10 | 821 / 278.3 / 3 / 10 | 823.2 (+0%) | **CORRECT** | datum +1.3% |
| A0229 | RD (f15.0; a550) (x5) | SUITE | 498.1 / 249.1 / 2 / 10 | 498.1 / 249.1 / 2 / 10 | 499.5 (+0%) | **CORRECT** |  |
| A0277 | RD (f15.0; a550) (x5) | DH | 394.7 / 197.4 / 2 / 10 | 394.7 / 197.4 / 2 / 10 | 395.8 (+0%) | **CORRECT** |  |
| A0277 | RD (f15.0; a550) (x5) | HP | 659 / 220.6 / 3 / 10 | 650.6 / 220.6 / 3 / 10 | 652.3 (+0%) | **CORRECT** | datum +1.3% |
| A0277 | RD (f15.0; a550) (x5) | SUITE | 394.7 / 197.4 / 2 / 10 | 394.7 / 197.4 / 2 / 10 | 395.8 (+0%) | **CORRECT** |  |
| A0289 | RM (f12.0; u4; d0.8) (x252) | DH | 195.6 / 88.7 / 3 / 11 | 195.6 / 88.7 / 3 / 11 | n/a (keyed facts missing) | **CORRECT** | 195.6 = 0.8 x 244.54 exactly |
| A0289 | RM (f12.0; u4; d0.8) (x252) | HP | 305.1 / 101.7 / 3 / 11 | 305.1 / 101.7 / 3 / 11 | n/a (keyed facts missing) | **CORRECT** | RM: no caps; F 101.7 |
| A0289 | RM (f12.0; u4; d0.8) (x252) | SUITE | 266.2 / 88.7 / 3 / 11 | 266.2 / 88.7 / 3 / 11 | n/a (keyed facts missing) | **CORRECT** |  |
| A0354 | RD (f9.0; a280; d0.45) | DH | 154.6 / 114.5 / 3 / 8.5 | 147.2 / 114.5 / 3 / 8.5 | 147.2 (-0%) | **WRONG** | Q3 +7.4 over 147.2 |
| A0354 | RD (f9.0; a280; d0.45) | HP | 403.5 / 135.2 / 3 / 10 | 397.8 / 135.1 / 3 / 10 | 398 (+0%) | **CORRECT** | datum +1.4% |
| A0354 | RD (f9.0; a280; d0.45) | SUITE | 400.7 / 135.2 / 3 / 8.5 | 393 / 135.1 / 3 / 8.5 | 393.2 (+0%) | **CORRECT** | datum +2.0% |
| A0375 | R (d1.0) (x848) | DH | 164.5 / 69.5 / 4 / 13 | 156.6 / 69.5 / 4 / 13 | 237.9 (+52%) | **WRONG** | Q3 +7.9 over 156.6; input: engine lot 156.6 m2 vs keyed 237.9 |
| A0375 | R (d1.0) (x848) | HP | 277.1 / 69.5 / 4 / 13 | 274.2 / 69.5 / 4 / 13 | 390.2 (+42%) | **CORRECT** | datum +1.0%; input-divergent (keyed lot +52% area): 390 |
| A0375 | R (d1.0) (x848) | SUITE | 277.1 / 69.5 / 4 / 13 | 274.2 / 69.5 / 4 / 13 | 348.6 (+27%) | **CORRECT** | datum +1.0%; input-divergent |
| A0388 | R (d0.6) (x736) | DH | 133.4 / 84.7 / 3 / 11 | 127 / 84.7 / 3 / 11 | 138.1 (+9%) | **WRONG** | Q3 +6.4 over 127.0 |
| A0388 | R (d0.6) (x736) | HP | 283.9 / 94.6 / 3 / 11 | 283.9 / 94.6 / 3 / 11 | 268.8 (-5%) | **CAN'T TELL** | depth cap 19 needs lot depth >= 36 (10.10.40.30(1)(B)); parcel 36.02 vs keyed 35.05 -> 17 and 269 not 284 |
| A0388 | R (d0.6) (x736) | SUITE | 254 / 84.7 / 3 / 11 | 254 / 84.7 / 3 / 11 | 268.8 (+6%) | **CORRECT** |  |
| A0399 | RM (u4; d0.6) (x23) | DH | 328.7 / 176.5 / 3 / 9.5 | 313.1 / 176.5 / 3 / 9.5 | 312.6 (-0%) | **WRONG** | Q3 +15.6 over 313.1; notice label plain RM (no d0.6): input conflict |
| A0399 | RM (u4; d0.6) (x23) | HP | 1001.9 / 334 / 3 / 10 | 1001.9 / 334 / 3 / 10 | 1165.5 (+16%) | **CORRECT** | 3 x 334.0: RM unmapped coverage (10.80.30.40(1)(B)), no FSI, no HP length/depth cap; see section on suspicion 4; input-divergent (keyed 12.43 x 48.3): 1,166 |
| A0399 | RM (u4; d0.6) (x23) | SUITE | 520.7 / 176.5 / 3 / 9.5 | 513.2 / 176.5 / 3 / 9.5 | 555.2 (+8%) | **CORRECT** | datum +1.5%; length 17 (DH cap); input-divergent |
| A0457 | RM (f12.0; u4; d0.8) (x252) | DH | 219.3 / 88.6 / 3 / 11 | 219.3 / 88.6 / 3 / 11 | 219.3 (-0%) | **CORRECT** | 219.3 = 0.8 x 274.12 exactly |
| A0457 | RM (f12.0; u4; d0.8) (x252) | HP | 347.5 / 115.8 / 3 / 11 | 347.5 / 115.8 / 3 / 11 | 347.3 (-0%) | **CORRECT** |  |
| A0457 | RM (f12.0; u4; d0.8) (x252) | SUITE | 265.7 / 88.6 / 3 / 11 | 265.7 / 88.6 / 3 / 11 | 266.2 (+0%) | **CORRECT** |  |
| A0461 | RM (f12.0; u4; d0.8) (x252) | DH | 253.9 / 88.9 / 3 / 11 | 253.9 / 88.9 / 3 / 11 | 253.9 (-0%) | **CORRECT** | floor 266.7 - mechanical 12.8 = 253.9 (< cap 256.3) |
| A0461 | RM (f12.0; u4; d0.8) (x252) | HP | 435.9 / 145.3 / 3 / 11 | 435.9 / 145.3 / 3 / 11 | 436.6 (+0%) | **CORRECT** |  |
| A0461 | RM (f12.0; u4; d0.8) (x252) | SUITE | 266.7 / 88.9 / 3 / 11 | 266.7 / 88.9 / 3 / 11 | 266.7 (+0%) | **CORRECT** |  |
| A0464 | R (d0.6) (x809) | DH | 155.4 / 100.8 / 4 / 13 | 148 / 100.8 / 4 / 13 | 148 (+0%) * | **WRONG** | Q3 +7.4 over 148.0 |
| A0464 | R (d0.6) (x809) | HP | 449.3 / 112.7 / 4 / 13 | 445 / 112.7 / 4 / 13 | 348.6 (-22%) * | **CAN'T TELL** | depth cap 19 needs lot depth >= 36; parcel 36.09 vs keyed 35.21 (and frontage 6.83 vs 6.1): keyed lot gives 349 not 449 |
| A0464 | R (d0.6) (x809) | SUITE | 401.8 / 100.8 / 4 / 13 | 397.5 / 100.8 / 4 / 13 | 348.6 (-12%) * | **CORRECT** | datum +1.1% |
| A0553 | RD (f13.5; d0.6) (x1436) | DH | 118.2 / 42 / 3 / 11 | 118.2 / 42 / 3 / 11 | 153.5 (+30%) | **CAN'T TELL** | matches hand 118.2 on engine facts, but the notice keys a CORNER lot (engine corner=false): 10.20.40.70(6) street side 3.0 m would cut width 11.07 -> 9.27 |
| A0553 | RD (f13.5; d0.6) (x1436) | HP | none | 125.9 / 42 / 3 / 11 | 167.4 (+33%) | **WRONG** | NOT COMPUTED (not_evaluated:map_value_absent:LC). Unmapped coverage = (B) no limit, (D) adds nothing (M-182 dated note 2026-10-18). Hand: F 42.0, GFA 125.9 |
| A0553 | RD (f13.5; d0.6) (x1436) | SUITE | none | 125.9 / 42 / 3 / 11 | 167.4 (+33%) | **WRONG** | NOT COMPUTED, same cause. Hand: 125.9 |
| A0561 | R (d1.0) (x804) | DH | 199.3 / 76 / 3 / 11 | 199.3 / 76 / 3 / 11 | 204.9 (+3%) | **CORRECT** | 199.3 = 1.0 x 199.33 exactly |
| A0561 | R (d1.0) (x804) | HP | 254.8 / 84.9 / 3 / 11 | 254.8 / 84.9 / 3 / 11 | 256.5 (+1%) | **CORRECT** |  |
| A0561 | R (d1.0) (x804) | SUITE | 228 / 76 / 3 / 11 | 228 / 76 / 3 / 11 | 229.5 (+1%) | **CORRECT** |  |
| A0562 | RM (f12.0; u4; d0.8) (x252) | DH | 255.5 / 144.7 / 3 / 11 | 243.4 / 144.7 / 3 / 11 | n/a (keyed facts missing) | **WRONG** | Q3 +12.1 over 243.4 |
| A0562 | RM (f12.0; u4; d0.8) (x252) | HP | 485.3 / 161.8 / 3 / 11 | 485.3 / 161.8 / 3 / 11 | n/a (keyed facts missing) | **CORRECT** | RM no caps |
| A0562 | RM (f12.0; u4; d0.8) (x252) | SUITE | 434 / 144.7 / 3 / 11 | 434 / 144.7 / 3 / 11 | n/a (keyed facts missing) | **CORRECT** |  |
| A0578 | RD (f12.0; d0.6) (x1397) | DH | 202 / 119 / 3 / 12 | 192.4 / 88.4 / 3 / 12 | 207.1 (+8%) | **WRONG** | Q3 +9.6 over 192.4; footprint 119 vs 88.4: corner street side 3.0 ignored (D3) |
| A0578 | RD (f12.0; d0.6) (x1397) | HP | none | 265.2 / 88.4 / 3 / 12 | 282 (+6%) | **WRONG** | NOT COMPUTED (map_value_absent:LC). Hand: F 88.4 (street side 3.0), GFA 265.2 |
| A0578 | RD (f12.0; d0.6) (x1397) | SUITE | none | 265.2 / 88.4 / 3 / 12 | 282 (+6%) | **WRONG** | NOT COMPUTED, same cause. Hand: 265.2 |


## 6. Defects, ranked by size of error

**D1. Houseplex FSI on exception lots (ruling needed). Size: 2.3 to 2.6 times. Rows A0067, A0094, A0166, A0170 houseplex.** Layer 2 applies the exception FSI arm to the houseplex (x1462 via x155/x252; x21(C); x38(A)). Under M-180(2) (register line 295, "the more permissive regulation prevails ... build bigger") the zone's "does not apply to a detached houseplex" (10.20.40.40(1)(C)) is more permissive than the exception cap, so the houseplex would be uncapped: A0067 672 (engine 293), A0094 677 (267), A0166 462 (258), A0170 590 (256). M-252 (line 405) narrows M-180(2) to exception arms that do not name the houseplex's own type; x1462 says "a permitted building type", which may count as naming it, in which case the cap stands. The engine behaviour is in the Layer 2 evaluator, `~/Buildo-wt-p3engine/scripts/analysis/bylaw/evaluate.mjs:1215-1260` (the namesOwnType / altKept branch), consumed at `maxbld-main-building.js:85,122-123`. I cannot decide this from the text: it needs an operator ruling. Either way the printed numbers are wrong (the cap reading makes them 279, 254.5, 245.5, 243.5, see D5).

**D2. Four rows not computed: A0553 and A0578 houseplex and house with suite. Size: 100 percent (no number).** Layer 2 returns `not_evaluated:map_value_absent:LC` for lot coverage on those two lots for the houseplex and the suite class (and a plain "unregulated" for the detached house on the same lots). The by-law gives an answer: 10.20.30.40(1)(D) fires only if a mapped value is below 45, and (B) says no coverage applies where there is no value; M-196 dated note 2026-10-18 (register line 329) says the same: "On an unmapped lot (B) already gives no coverage, so (D) adds nothing". Cause: `evaluate.mjs:249` returns map_value_absent for a bare overlay() read in the (D) condition. Hand values on engine facts: A0553 houseplex and suite 125.9 (F 42.0); A0578 houseplex and suite 265.2 (F 88.4 with the street side). The suite house and houseplex are therefore missing, so the headline for these two lots shows only the detached house.

**D3. Corner-lot street-side yard ignored. Size: footprint -18.5 percent (A0166 houseplex, suite), -25.7 percent (A0578 detached), -3 percent (A0166 detached).** Layer 2 returns `side_setback_street_m` = 3.0 (10.20.40.70(6), L581, f >= 12 and an adjacent lot fronting the street) for A0166 and A0578, both corner in the engine and in the keyed data. `maxbld-main-building.js:77` reads only `side_setback_m` and line 102 uses `Wd = lot.frontageM - 2 * sideM`. The rear-suite module does read the target (`maxbld-rear-suite.js:115`). Footprints: A0166 192.8 vs 157.1; A0578 119 vs 88.4. The GFA of those rows is FSI-cap bound so only the footprint column and (under reading B of D1) the houseplex GFA move. Not testable on A0179, A0553, A0562 (keyed corner, engine not corner).

**D4. Engine lot inputs differ from the keyed facts (section 4). Size up to 52 percent.** A0375: engine lot 156.6 m2 vs keyed 237.9: houseplex 277 vs 390. A0464: depth 36.09 vs 35.21 crosses the 36 m test: houseplex 449 vs 349 (-22 percent). A0388: depth 36.02 vs 35.05 crosses the same test: 284 vs 269. A0182: depth 40.15 vs 38.33 crosses the 40 m test (10.20.40.20(3)(B)): 697 vs 614. A0399 houseplex 1,002 vs 1,166; A0193 houseplex 651 vs 712. Labels: the notice label is less specific than the parcel-layer label on A0170, A0193, A0179, A0399, A0461 (d, f, a, u, exception missing), which drives the detached-house FSI cap on A0170, A0193, A0399. This is an input question, not an engine arithmetic fault; the three threshold cases are marked CAN'T TELL.

**D5. Mechanical-attic exclusion lets GFA exceed fsi x lot (MB-17 Q3, confirmed). Size: +5 percent, +6.4 to +15.6 m2, 17 rows.** DH: A0166 A0170 A0175 A0193 A0354 A0375 A0388 A0399 A0464 A0562 A0578; HP: A0067 (+14.0) A0094 (+12.7) A0166 A0170; suite: A0166 A0170. Cause: `~/Buildo-wt-p3engine/src/features/leads/lib/renovation-shared.js:106`, `const used = Math.min(excluded, Math.max(floor - Math.min(grossFloorAreaSqm - attic, floor), 0))`: when the wall floors alone already exceed the cap, floor - min(gross - attic, floor) is 0, nothing is excluded and GFA = cap + excluded; called from `maxbld-main-building.js:149-155`. The fix proposed in the mb17 card (used = min(excluded, max(floor - cap, 0))) gives GFA = cap on all 17 rows. It matches my hand column. I did not find other rows over their cap.

**D6. Attic datum is inconsistent with the wall-storey formula. Size: +1.0 to +2.3 percent, about 20 rows (all uncapped pitched rows with an attic).** The wall-storey count uses `floor((Hw - firstFloorElevation)/storeyHeight)` (`maxbld-main-building.js:118`) but the attic clearance base is `Hw - nw x storeyHeight` (`renovation-shared.js:131`), which drops the 0.6 m first-floor elevation, so the attic floor sits 0.6 m lower than the engine's own storey 3 floor and clearance is overstated. With the datum fixed, A0182 houseplex is 688.2 not 697; A0229 821.0 not 831.5; A0097 detached 465.6 not 476.2.

**D7. Omissions and assumptions (direction in brackets).** 10.20.40.20(2) one-storey extension, 2.0 m x half width (understates detached and suite, about 12 to 15 m2); 10.5.40.40(3)(C),(D) parking exclusion (understates FSI-capped rows by about one garage); R-zone 0.45 m side yard (L489, overstates width by 0.9 m if windows are wanted); front yard averaging uses neighbour figures flagged needs_survey on every lot.

**Not defects:** house with suite larger than detached (suspicion 1); host_interior larger than GFA (suspicion 2); houseplex larger in RM than in RD (suspicion 4 and 6, text-literal); the 0.6 m side yard of A0399 (M-180 substitution, more permissive).

## 7. Reproduction

`cd ~/Buildo-scratch/p2close/mb62 && node dumpall.mjs && node hand.mjs && node gen.mjs && node assemble.mjs` (reads only the files named above; writes only inside mb62/).
