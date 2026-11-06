# Golden-25 mode B: McProof derivation of the 7 refreshed cells

MB-31 · golden-25 mode B refresh (MB-31 increment 1 plan 2.2; operator "a" on Q-G25B, 2026-11-04). The 7 cells that waited on MB-18 (i) and (j), named accepted findings until then (queue :85, O-41). Each value is derived here from the by-law text and the case's stored inputs (`inputs.jsonl` of this commit, `phase2`), by hand. No value is copied from the step. The pinned checker `e25-check.mjs` (manifest `mcproof.checker_sha256`) has no step-4 front branch and reads the 2026-11-02 database read-back, so it does not cover these cells; this file is their check.

The Layer 3 formulas are the catalogue rows as committed (`scripts/seeds/bylaw/layer3-catalogue.json`, increment 1):
- `buildable_width_m = lot_frontage_m − l2(side_setback_m) − l2(side_setback_m)` (not a corner lot);
- `depth_room_m = lot_depth_m − front_setback_used_m − l2(rear_setback_m)`;
- `buildable_depth_m = min(depth_room_m; l2(building_depth_m); l2(building_length_m))`;
- `footprint_max_m2 = min(buildable_width_m × buildable_depth_m; l2(lot_coverage_pct) × lot_area_m2) × lv(footprint_shape_factor)`, with the factor 1;
- `storeys_max = floor((l2(height_m) − 0 − (0.212 + 0.3)) ÷ (2.3 + 0.212))` where height_storeys is unregulated (S-1, M-404);
- `gfa_max_m2 = min(footprint_max_m2 × storeys_max; l2(fsi) × lot_area_m2; l2(gfa_m2))`.

Tolerances are the test's: footprint 0.005 m², gfa 0.01 m², front 0.0005 m.

## A0067_26SC, 82 Kelsonia Ave (RD (x155), parcel 205238): moved by MB-18 (i)

Lot: frontage 15.23 m, depth 38.08 m, area 580.13 m², not a corner lot.

| Input | Value | Clause and text |
|---|---|---|
| required minimum lot frontage | 15.23 m (the lot's frontage on 9 May 2013, assumed unchanged and disclosed) | 900.3.10(155)(A): "The minimum lot frontage is that which existed on the day of the enactment of this By-law"; M-406 |
| building_length_m | 17.0 m | 10.20.40.20(1): "In the RD zone with a required minimum lot frontage of 18.0 metres or less, the permitted maximum building length for a permitted residential building is 17.0 metres" (15.23 ≤ 18.0) |
| building_depth_m | 19.0 m | 10.20.40.30(1): "In the RD zone with a required minimum lot frontage of 18.0 metres or less, the rear main wall … may be no more than 19.0 metres from the required front yard setback" |
| front_setback_used_m | 6.735 m (unchanged cell of the key, step 2) | 10.5.40.70(1)(B), averaging, M-245 |
| rear_setback_m | 9.52 m | 10.20.40.70(2)(B): 25 % of the lot depth, 0.25 × 38.08 = 9.52 > 7.5 |
| side_setback_m | 0.9 m | 900.3.10(155)(D): "The minimum building setback from a side lot line is 0.9 metres" |
| lot_coverage_pct | 33 % | 10.20.30.40(1)(A): the Lot Coverage Overlay value (the lot is wholly in a 33 % area) |
| fsi | the lesser of 0.5 × lot area or 279 m² | 900.3.10(1462)(A)(ii) (required by 900.3.10(155)(F)): "the lesser of 0.5 times the lot area or 279 square metres, if the lot area is 408 square metres to 697 square metres" |
| storeys_max | 2 (unchanged cell of the key) | 10.20.40.10(3)(A) |

Arithmetic:
- width = 15.23 − 0.9 − 0.9 = 13.43 m
- room = 38.08 − 6.735 − 9.52 = 21.825 m; inner depth = min(21.825; 19.0; 17.0) = 17.0 m
- space = 13.43 × 17.0 = 228.31 m²; coverage arm = 0.33 × 580.13 = 191.4429 m²
- **footprint = min(228.31; 191.4429) = 191.4429 m²** (coverage binds)
- footprint × storeys = 382.8858 m²; FSI arm = min(0.5 × 580.13 = 290.065; 279) = 279.0 m²
- **gfa = min(382.8858; 279.0) = 279.000 m²** (the 1462 (A)(ii) cap binds)

## A0097_26SC, 131 Treverton Dr (RD (x310), parcel 274216): moved by MB-18 (i)

Lot: frontage 12.82 m, depth 38.05 m, area 487.66 m², not a corner lot.

| Input | Value | Clause and text |
|---|---|---|
| required minimum lot frontage | 12.82 m (as for A0067) | 900.3.10(310)(A), same words; M-406 |
| building_length_m | 17.0 m | 10.20.40.20(1) (12.82 ≤ 18.0) |
| building_depth_m | 19.0 m | 10.20.40.30(1) |
| front_setback_used_m | 9.94 m (unchanged cell of the key, step 2) | 10.5.40.70(1)(B), M-245 |
| rear_setback_m | 9.5125 m | 10.20.40.70(2)(B): 0.25 × 38.05 = 9.5125 > 7.5 |
| side_setback_m | 0.9 m | 900.3.10(310)(C): "The minimum building setback from a side lot line is 0.9 metres" |
| lot_coverage_pct | 33 % | 10.20.30.40(1)(A) for the detached house (overlay polygon 33.00, share 1.0); 10.20.30.40(1)(D)'s 45 % is for a detached houseplex or a building with a secondary suite, not this case's class |
| fsi | unlimited | 10.20.40.40(1)(B) |
| storeys_max | 3 (unchanged cell of the key) | S-1 (M-404): floor((9.0 − 0.512) ÷ 2.512) = floor(3.379) = 3 |

Arithmetic:
- width = 12.82 − 0.9 − 0.9 = 11.02 m
- room = 38.05 − 9.94 − 9.5125 = 18.5975 m; inner depth = min(18.5975; 19.0; 17.0) = 17.0 m
- space = 11.02 × 17.0 = 187.34 m²; coverage arm = 0.33 × 487.66 = 160.9278 m²
- **footprint = min(187.34; 160.9278) = 160.9278 m²** (coverage binds)
- **gfa = min(160.9278 × 3 = 482.7834; FSI unlimited) = 482.783 m²** (storeys × footprint binds)

Real-world check: the City's decision notice for A0097/26SC cites 10.20.40.20(1) "The maximum permitted building length is 17.0 m" and 10.20.40.30(1) "The maximum permitted depth is 19.0 m" (both varied to 21.03 m). The notice has no coverage variance because that application was a 3-unit houseplex, which 10.20.30.40(1)(D) allows 45 %; its 37.83 % (184.49 m², the 2.79 m² porch excluded under 10.5.30.40(2)) complies. Neither address has a consent or severance on record.

## A0553_26TEY, 52A Cluny Dr (RD (f13.5; d0.6) (x1436), parcel 428050): moved by MB-18 (j)

Lot: frontage 13.47 m, depth 18.99 m, area 255.83 m², not a corner lot (the stored parcel; the key's `input_finding: corner_flag` stays recorded).

| Input | Value | Clause and text |
|---|---|---|
| front_setback_used_m | 6.0 m, chain step 4 | M-414: averaging does not apply (one of the two abutting buildings is beyond 15.0 m, so 10.5.40.70(1)(A) and (B) both fail) and "step 4, the zone value Phase 2 stores, answers"; 10.20.40.70(1): "If regulation 10.5.40.70(1) does not apply, the required minimum front yard setback in the RD zone is 6.0 metres" (the stored front_setback_fallback_m, MB-18 (j)) |
| rear_setback_m | 7.5 m | 10.20.40.70(2)(A): the greater of 7.5 m and 0.25 × 18.99 = 4.7475 m |
| side_setback_m | 1.2 m | 10.20.40.70(3)(C): "1.2 metres if the required minimum lot frontage is 12.0 metres to less than 15.0 metres" (label f13.5) |
| building_depth_m / building_length_m | 19.0 m / 17.0 m | 10.20.40.30(1) / 10.20.40.20(1) (13.5 ≤ 18.0) |
| lot_coverage_pct | unregulated | 10.20.30.40(1)(B): not in an area with a value on the Lot Coverage Overlay Map |
| fsi | 0.6 | 10.20.40.40(1)(A) (label d0.6) |
| storeys_max | 4 (unchanged cell of the key) | S-1 (M-404): floor((11.0 − 0.512) ÷ 2.512) = floor(4.175) = 4 |

Exception 1436 has no setback, coverage or density term (its provisions are about semi-detached houses, duplexes and secondary suites).

Arithmetic:
- **front = 6.0 m**
- width = 13.47 − 1.2 − 1.2 = 11.07 m
- room = 18.99 − 6.0 − 7.5 = 5.49 m; inner depth = min(5.49; 19.0; 17.0) = 5.49 m
- **footprint = 11.07 × 5.49 = 60.7743 m²** (coverage unregulated; the depth room binds)
- footprint × storeys = 60.7743 × 4 = 243.0972 m²; FSI arm = 0.6 × 255.83 = 153.498 m²
- **gfa = min(243.0972; 153.498) = 153.498 m²** (FSI binds)

## Flags

Each cell keeps the flag set the key already records (flag-corrections.json): front `front_yard_needs_survey`; footprint `front_yard_needs_survey`, `shape_box_assumed`; gfa the same, plus `storeys_from_minimum_ceiling` where the storeys come from S-1 (A0097, A0553).

**Owed (not in the flags):** the M-406 disclosure that rests A0067's and A0097's building length and depth on today's frontage standing in for the 2013 frontage is produced by Phase 2 and recomputed on read, but Layer 3 carries no Phase 2 base-row disclosure into its flags today (L3-F2 a carries option-row disclosures only). Until that carriage is built and ruled, these four cells do not show it.

## MB-18 (l) refresh (RP-L, 2026-11-06)

The R-zone side yard of five detached-house cases moves from 0.45 m (10.10.40.70(4)#(4)(A)) to 0.9 m (10.10.40.70(3)#(3)(A)) under M-435: 10.10.40.70(3) "In the R zone, the required minimum side yard setback is: (A) 0.9 metres, for: (i) a detached house; ...". The 0.45 m of 10.10.40.70(4) ("may be reduced to 0.45 metres if there are no windows or doors in that side of the building") is a disclosure, not the stored maximum. Building depth (17.0 m, 10.10.40.30(1)(A)) binds the inner depth on all five and coverage is unregulated, so each footprint falls by 2 × (0.9 − 0.45) × 17.0 = 15.30 m² and every GFA is unchanged (FSI binds):

| Case | Width (m) | Footprint (m²) | Footprint × storeys (m²) | GFA (m²) |
|---|---|---|---|---|
| A0175_26NY | 7.61 − 0.9 − 0.9 = 5.81 | 5.81 × 17.0 = 98.77 | 395.08 | 153.252 (unchanged) |
| A0375_26TEY | 4.99 − 0.9 − 0.9 = 3.19 | 3.19 × 17.0 = 54.23 | 216.92 | 156.63 (unchanged) |
| A0388_26TEY | 5.88 − 0.9 − 0.9 = 4.08 | 4.08 × 17.0 = 69.36 | 277.44 | 127.044 (unchanged) |
| A0464_26TEY | 6.83 − 0.9 − 0.9 = 5.03 | 5.03 × 17.0 = 85.51 | 342.04 | 147.978 (unchanged) |
| A0561_26TEY | 5.37 − 0.9 − 0.9 = 3.57 | 3.57 × 17.0 = 60.69 | 242.76 | 199.33 (unchanged) |

The full hand derivation (clauses per case, the exceptions checked, the depth room) is ~/Buildo-scratch/mcbylaws/MB-27L2/r2/rpl/derive/derivation.md; no value is copied from the step. Each cell keeps the flag set the key already records.

**Owed (not in the flags):** the M-435 disclosure that the side yard may be reduced to 0.45 m on a side with no windows or doors (10.10.40.70(4)) is produced by Phase 2, but Layer 3 carries no Phase 2 base-row disclosure into its flags today (L3-F2 a carries option-row disclosures only; card L3-DISC, ~/Buildo-scratch/mcbylaws/inc2/CARD-l3-base-disclosures.md). Until that carriage is built and ruled, these five footprint cells do not show it.
