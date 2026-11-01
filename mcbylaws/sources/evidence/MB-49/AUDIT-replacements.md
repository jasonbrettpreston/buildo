# AUDIT: can max build and CoA be calculated from keyed + ruled values only (MB-48)
Read-only. Engine: ~/Buildo-wt-p37/scripts/lib/compute/compute-maxbld-scenarios.js + maxbld-main-building.js, maxbld-houseplex-units.js, maxbld-scenario-status.js, maxbld-coa-tier.js, maxbld-layer2-view.js. Spec 78 P5.1/P5.5/P5.9/6.4. Key tables: ~/Buildo/docs/reference/bylaw-layer2-input.json (Layer 1 units + targets), bylaw-provisions.md, ~/Buildo-wt-p37/scripts/analysis/phase3/phase3-literals.json. Method: read; the three lib files and the engine carry no typed tunable (numeric-literal scan clean; engine states "no literal tunable").

## 1. Verdict
- Max build (as of right, new build D/2/H): CAN be calculated from BYLAW-KEYED + ruled ASSUMPTION + site facts. Every law number arrives through the Layer 2 accessor (21 targets) or the literal registry (units cited); every tuning number is a seeded P5.9 variable (migrations 283, 286).
- CoA: CANNOT. coaTier is called with factors `{}` and bounds `null` (engine lines ~290, 323, 326), so every CoA row is `not_evaluated:coa_factor_unfitted:<form>` (LC-60). No u logic variable is seeded; the fit has not run. Blocker B1.
- Not built in the engine: rear suite (P5.5), semi_half producer, front-yard averaging, lane, triangular lot, shoreline/top-of-bank. See section 5 for scenarios.

## 2. Classification of every input (counts: KEYED 43, NOT-KEYED 5, ASSUMPTION 12 read + 9 seeded unread, OLD-NUMBER 9, USER/SITE 12)
### BYLAW-KEYED (43)
- Layer 2 targets, read via view (21): front_setback_m, rear_setback_m, side_setback_m, height_m, main_wall_height_m, height_storeys, fsi, lot_coverage_pct, building_depth_m, building_length_m, roof_slope_max, upper_storey_setback_m, element_width_pct, main_wall_side_share_pct, main_wall_front_rear_share_pct, attic_counted_clearance_m, attic_qualifying_clearance_m, attic_qualifying_share_pct, attic_qualifying_area_m2, dwelling_units_max; plus class permission and lot_gate (not counted). (Only attic_qualifying_area_m2 and the setback/height/fsi/coverage/depth/length/storeys/units/roof/element/upper targets were confirmed in the layer2-input target histogram; the share and clearance targets were not individually re-checked.)
- Literal registry rows tied to unit ids (22): caps.detached 4 (800.50(181)(A)), caps.semi 4 (800.50(746)(A)), 6 (600.60.40(3)(A)), lift 6 (600.60.40(1)(A)), LIFT_ZONES list, reliefFrontageMaxM 12.2 (10.5.40.71(3)), viabilityFrontageMinM 6.0 (10.5.30.21(3)(A)), extension 2 m / 50 % / 5 m / 3 m for 10.20/10.40/10.80.40.20(2) (12 rows), mechanical 5 % and 20 m2 (10.5.40.40(2)). These are clause-keyed literals, not Layer 2 targets: acceptable under MB-48 only if the operator treats unit-id-cited literals as keyed (flag).
### BYLAW-NOT-KEYED (5): clause exists, no numeric Layer 2 target
1. Top-of-bank / shoreline 10 m: 5.10.40.70(6) and 5.10.40.80(1) (bylaw-provisions.md:235, :237); units sit in layer2-input with target "none", literal "10 metres" under literals_not_expressed (reason cross_reference_value), calculation_handling not_modelled / needs_data_we_lack. Detail section 4.
2. FSI exclusion below the line: 5.10.40.40(1) (provisions.md:228); target fsi, DEFINE, not_modelled.
3. Integral-garage GFA deduction 10.5.40.40(3)(C)/(D) (K axis): deduction numbers not read by the engine; K axis is not built.
4. Exception top-of-bank 10.0 m: 900.3.10(4)(B) (:2264), 900.3.10(729)(E) (:2981); Chapter 900 exceptions are `pending`, so `exception_not_authored`.
5. Suite rules (P5.5): garden/laneway size, setback, separation, 4.0/6.3 m height, 2 storeys (150.7/150.8.60.x). 169 Layer 1 units exist for 150.7/150.8, so this is "keyed in Layer 1, not consumed", not "missing clause". Likewise soft/front landscaping and driveway (NF-12..14, 20..23): targets front_landscaping_pct, rear_soft_landscaping_pct, front_soft_landscaping_pct, driveway_width_m, side_street_landscaping_pct, ancillary_coverage_pct exist in Layer 1 but the engine reads none.
### ASSUMPTION (not by-law by nature; all are seeded, all prefixed compute_maxbld_scenarios_)
Read by the engine (12, ruled in P5.9, seeded by 283/286, registry rows present): storey_height_m 3.0, roof_pitch 1.0 (capped by roof_slope_max), roof_assembly_depth_m 0.30, basement_livable_share 1.0, circulation_share 0.10, unit_min_interior_sqm 30, first_floor_elevation_m 0.6 (clause cap 1.2 m), min_dimension_m 3.0, lot_viability_margin_m 0.5, existing_confidence_min 0.6, trust_high_min_pass_pct 100, houseplex_min_units (P3-Q8; "multiple" implied by 800.50(181)(D), no numeral).
Seeded, not read yet (9): lot_min_sqm/lot_max_sqm 50/2000, lane_buffer_m, triangle_simplify_tol_m, depth_search_step_m, suite_weight, suite_gfa_strict_margin_sqm, coxwell_generous_reading, not_evaluated_max_pct, batch_size.
Ruled elsewhere: front placeholder fya_placeholder_* (migration 292 on ~/Buildo-wt-b10fix, 4 vars; its fallback "else 6.0 m, needs survey" is a typed 6.0 inside the ruling text; confirm it is a variable not code). Drafted ruling Q-G: plate geometry, forms (a)/(b) (not a number).
Code-level choices without a ruled variable (flag): "no step-back clause keyed means no storey above Hw" (main-building upper=0); rearAdditionStoreyCap = (zoning_class === 'R') typed zone letter; partyWall = scenario startsWith('semi').
### OLD-NUMBER (9): blockers for removal, none read by the new engine
- RAVINE_SETBACK_M 10 (max-build.js:81, ~/Buildo): clause number but mislabelled Ch.658; real home is 5.10.40.70(6) TRCA lines (findings row 14: "proxy_for_unmodelled_rule"). Replace by NOT-KEYED item 1.
- Garage/garden/laneway GFA and lot minimums (60/120/60, 270/230/230, rear yard 5.0, storeys 1/2): D5 max-build.js:92-109, logic_variables rows. Clause home 150.7/150.8; keyed, unconsumed.
- accessory_max_coverage_pct 0.30, min_soft_landscaping_pct 0.30 (rows) and optimal-config 0.2/0.4/0.5/0.25: clause home ancillary_coverage_pct and 10.5.50.10 targets.
- Old max-build rows storey_height_m (3.0), max_build_lot_min/max_sqm, max_build_min_dimension_m (migration 239): duplicated by the new prefixed variables; retire at MB-43, the new ones are the live ones.
- COVERAGE_DEFAULTS 33/30/35/75/50 and SETBACK_DEFAULTS (max-build.js:120-191): replaced by Layer 2 targets.
- bylaw_max_density, bylaw_min_frontage_m, bylaw_min_area_sqm, bylaw_pct_*: City-layer copies; keyed replacements exist (lot_area_per_unit_min_m2, required_lot_frontage_m, required_lot_area_m2 targets); not read by the new engine.
- Cost-model 0.7/0.4 coverage ratios and floors 2/1 (cost-model-shared.js:125-128,215-220): no clause, not a ruled variable (they are logic_variables urban/suburban_coverage_ratio but market-style): must be ruled as assumptions or removed from modeled GFA.
- reno_coa_uplift_pct 5 % (seed line 42): replaced by u; retire.
- Spec 58 NF-12..14, NF-20..23 (landscaping, driveway) have "no replacement yet" in MB07; Layer 1 targets exist (above), consumer missing.
### USER-INPUT / site data (12)
lot_size_sqm, frontage_m, depth_m, zoning_class (parcel geometry/zoning data); zoning_holding; is_heritage_designated; is_in_ravine_protection_area (Ch.658 polygon flag, spec 59); in_sixplex_area (bylaw_map_areas); existing_width_m/existing_length_m (massing estimate, labelled estimated); existing_storeys and basement (user only, NULL on pipeline rows, O-13/O-14); semi_half (no producer, typed FALSE); existing_confidence (typed NULL).

## 3. CoA (spec 78 6.4 / M-65): CoA = AOR x u_form
Inputs: AOR gfa (keyed chain above), u per form (single, single_suite, multiplex, suite). u is ASSUMPTION-by-fit; spec text gives second-look estimates single about 1.14 and multiplex 1.00, single_suite and suite unfitted; none is seeded (no coa_u logic variable in scripts/seeds/logic_variables.json), bounds [1.0, 1.5] and the pinned fit_basis audit do not exist. Smallest fix: (a) rule + seed four u variables with bounds and the audit file (M-70 trial), or (b) rule the interim values 1.14 / 1.00 as `precedent_estimate` assumptions by operator. Until then CoA is wholly not_evaluated. Renovations have no CoA form (LC-49).

## 4. Ravine / top of bank: "ravine bylaw is key"
- In the table: YES as text and Layer 1 units, NO as a calculable number. 569-2013 Ch.5.10: 5.10.40.1(3) (no building below the line; ancillary in Residential and conservation/utilities excepted), 5.10.40.70(6) and 5.10.40.80(1) (10 metres from a shoreline hazard limit / stable top-of-bank, TRCA-determined, not in the Open Space category), 5.10.40.40(1) (area below the line excluded from FSI). Lawfully-existing relief: 5.10.40.1(4), 70(7), 80(2), 40(2).
- Keyed: unit ids exist; lot_condition token shoreline_or_top_of_bank; zones R/RD/RS/RT/RM for the ancillary carve-out. NOT keyed: no numeric target (the 10 m is a literals_not_expressed entry, cross_reference_value), no exception-level keying for 900.3.10(4), 900.3.10(729).
- Toronto Municipal Code Ch.658 (Ravine and Natural Feature Protection): in scope only as a permit regime. Held: ravine polygons, `is_in_ravine_protection_area` and a signed centroid `ravine_distance_m` (Spec 59). Ch.658 contains no 10 m building setback in our pinned text; M-213(4) rules it "computed and disclosed ravine_protection" and M-212(3) "disclose shoreline_hazard". Ch.658 itself is not in the by-law table (outside 569-2013).
- Data needed and held? The 10 m runs from the TRCA shoreline hazard limit / stable top-of-bank LINE. NOT held (M-212(3), ML-8 "not held; disclosed"). The Ch.658 ravine polygon is a different layer and is not the TRCA line; do not substitute it silently.
- Engine today: bufferedAreaSqm null always, shoreline typed false, ravine only a disclosure and trust cap. This honours M-169 and is not a calculation error, but the 10 m reduction is not applied.
- Smallest fixes: (1) key a numeric target (e.g. top_of_bank_setback_m = 10, lot condition shoreline_or_top_of_bank, ancillary/Residential carve-out as an exemption) on 5.10.40.70(6) and 80(1), plus 5.10.40.40(1) FSI area; (2) get the TRCA top-of-bank / shoreline hazard layer (Open Data or TRCA) to compute the buffered area; until then keep disclosure only; (3) author the two Chapter 900 exceptions; (4) delete RAVINE_SETBACK_M and the Ch.658 mislabel.

## 5. SCENARIO COVERAGE (Spec 78 P5.1, 6.2, M-63, M-214)
Engine scenario set (SCENARIOS table): D, H, S, 2, RA, RI, RB, RE, RF. Suite columns all NULL (REAR_SUITE = 'not_built'); suite_gfa_sqm typed 0.
| Scenario | Engine status | Missing / clauses (keyed?) |
|---|---|---|
| Detached house (D) | COMPUTED end to end (envelope, GFA, storeys, binding) | clauses keyed (setbacks, height, fsi, coverage, depth, attic); owed front averaging (placeholder 292), lane, triangular, RD deep side yard, flat-roof wall limit |
| Detached + secondary suite (2) | PARTIAL: envelope from class house_with_secondary_suite, units 2; no separate suite GFA | FSI disapplied and 45 % coverage via Layer 2 (keyed); suite size rules unmodelled; CoA form single_suite unfitted |
| Detached houseplex 2-4 (H) | COMPUTED (main + unit split, cap 4, min units variable) | 800.50(181) keyed as literal; no 3-vs-4 provincial split (C1/M-55) |
| Sixplex 5-6 (H in 600.60) | PARTIAL: cap 6 when in_sixplex_area true | 600.60.40(1)-(3) literals keyed; height 10.5 raised-level rule 600.60.40(2)(A) in Layer 1 (12 units) but disputed basis (`map_area_disputed`, 1,121 lots) not passed: engine reads only the boolean, basis not selected |
| Semi-detached house / + suite | NOT AT ALL (spec itself discloses semi_detached_house_not_modelled, forms_deferred) | needs severance rules 800.50(746)(B) |
| Semi houseplex (S) | NOT AT ALL in practice: coded, but semi_half is typed FALSE so S is never produced | needs the semi_half producer (ML-4); 800.50(746) keyed |
| Townhouse, + suite, non-fronting | NOT AT ALL (deferred by spec, M-214(3)) | 10.40 units keyed in Layer 1 (120), no module |
| House + garden suite (A) | NOT AT ALL (P5.5 absent) | 150.7.* (separation 4.0/7.5, 4.0/6.3 m, setbacks, 2 storeys, coverage 45 % / 20 %) keyed in Layer 1, not read; Coxwell polygon not held |
| House + laneway suite (A) | NOT AT ALL | 150.8.* keyed in Layer 1; lane test 800.50(402) + 3.5 m abutment (laneway data/abuts test M-209) not computed |
| House + secondary suite + rear suite | NOT AT ALL (suite add-on jointly with main is the P5.5 depth search; round-1 finding stands: suite lots show the house only) | 150.7/150.8 (not both, 150.7.20.1(2)); one suite per unit 150.10.20.1(2) |
| Houseplex + garden/laneway | NOT AT ALL | as above; C1 provincial separation by unit count |
| K axis (integral/detached garage) | NOT AT ALL (K joins later, spec line 686) | 10.5.40.40(3)(C)/(D), 10.5.60.70, 10.5.60.50(2) |
| Renovations RA/RI/RB/RE | COMPUTED on estimated footprint, storeys NULL (owner input); RF not computed | 10.5.40.71(3), 10.20/40/80.40.20(2) literals keyed |

## 6. Blockers and smallest fix
- B1 CoA u: rule and seed the u variables with bounds and audit (or rule interim estimates); wire factors/bounds into coaTier calls.
- B2 Rear suite (P5.5): build the module; clauses already keyed in Layer 1; needed to get house+suite, garden, laneway scenarios and any suite CoA.
- B3 Ravine: key top_of_bank_setback_m and FSI exclusion; obtain the TRCA line layer; until then disclosure only.
- B4 semi_half producer (S scenario); sixplex basis column pass-through.
- B5 Remove OLD-NUMBER rows/constants at MB-43; rule or remove cost-model 0.7/0.4 and floors 2/1.
- B6 Code-level choices (upper storey rule, 'R' letter, partyWall): move to keyed target or ruled variable.
- B7 Confirm operator accepts unit-id-cited literal registry as "keyed".
