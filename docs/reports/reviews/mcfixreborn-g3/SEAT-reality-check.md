Seat: Cairn-Reality-G3

Scope: reality check of the G3 parcel product against the local test stack only (127.0.0.1:55322). Every query was a single SELECT inside BEGIN READ ONLY ... ROLLBACK. No file was written. No personal data was printed; parcel ids and counts only.

1. WHAT I READ AND QUERIED
Code read (branch wf2/board): src/lib/parcels/consumer-lookup.ts, lot-map.ts, lot-form.ts, display-rules.ts; src/lib/admin/parcel-lookup.ts:154-390 (resolveAddress and classifyRows); src/lib/massing/geometry.ts:174-202 (resolveStories); src/app/api/permits/[id]/route.ts:220-290 (massing block); src/lib/entitlements/index.ts:560-669; the seed bounds for parcels_sqm_to_sqft, parcels_m_to_ft and user_lot_size_*; GROUNDER-H.md (Q9) and the G3 section of STATUS.md.

Queries and row counts:
- parcels (496,536 rows): lot area, frontage, zero/null/blank/extreme counts, sqm-to-sqft cross-check against 10.7639, lot_size_basis and confidence.
- parcels text columns (zoning_zn_string, primary_frontage_street_name, comp_dominant_build): blank-string counts.
- parcels.comparable_builds JSONB: type counts over the whole table, and per-field checks on a 5% sample (id%20=0, about 133k array elements) and a 2% sample (id%50=0, 52,828 elements).
- parcel_buildings (535,039 rows over 494,958 lots) joined to building_footprints: coverage before the cap, shared buildings, match types, heights.
- Address keys: parcels (addr_num_normalized, street_name_normalized) groups. parcel_address_points: 526,603 links.
- parcel_lot_form (496,536 rows): detected, basis and unsure, with frontage and area cross-checks. I also read the stack's view definition.
- usage_events (44 rows) and entitlements. logic_variables for semi_*, user_lot_size_*, report limits. parcel_user_inputs (0 rows).

Not on the stack, so not a defect: entitlements.plan_key; the semi zone-list settings (semi_detect_zone_classes, semi_ask_two_parcel_zone_classes) and semi_auto_max_shared_len_m. The stack's parcel_lot_form view is the older shape without the zone lists. user_lot_size_entry_enabled is 0 on the stack.

2. FINDINGS (most serious first)

1. HIGH, NEW. Building coverage and the accessory list are wrong for shared buildings. They fail across hundreds of thousands of lots.
 - Code: src/app/api/permits/[id]/route.ts:232-262 sums footprint_area_sqft over every parcel_buildings row for the lot and divides by the lot's sqft. It caps the result at 100 (:248).
 - Data: 177,307 of the 535,039 parcel_buildings rows point at a building that is linked to more than one lot. One building is linked to as many as 114 lots (648 buildings are linked to more than 10). 68,265 lots (13.8% of lots with a footprint) have summed footprint greater than the lot area. 41,726 are above 200%, 9,719 above 1,000%, and the maximum is 334,110%. The median lot is 36.5% and the 90th percentile is 147%.
 - Cause: 66,152 of the 68,265 involve a shared building, and 53,428 involve a "nearest" match (match_type nearest, confidence 0.60). Only 2,108 over-100% lots have neither. Of the lots with 1 building linked, 66,419 are over 100%. A "nearest" match covers 107,750 primary rows (21.8% of all primary links). All 107,750 are is_primary, so the nearest building is called the lot's primary house.
 - Examples: 5122917 (lot 81 sq ft, footprint 14,791 sq ft, building shared by 2), 5124058 (lot 2,379 sq ft, footprint 8,672 sq ft, shared by 6), 5128422 (lot 654 sq ft, footprint 12,393 sq ft, shared by 3).
 - A person sees a Building Massing card showing "100%" coverage and a primary footprint several times the lot. That is the whole shared building, not the part on this lot. Over 100% is capped to a clean-looking 100, which hides the problem. The same card lists the neighbours' structures as accessories.
 - Smallest fix: when the raw ratio is above 100 (or the building is linked to more than one lot), return coverage as null and hide the footprint. The cap should not hide a broken number. This is data-shaped, so a note to the owner of the building-link step is also needed.

2. HIGH, NEW. Lot area is served with no flag for 28,596 low-confidence lots, including a placeholder.
 - Code: src/lib/parcels/consumer-lookup.ts:81 (headline areas) and :152 (lot map area through areaSqftM2Dot). The consumer payload never carries lot_size_basis or lot_size_confidence (grep shows only src/lib/admin/parcel-lookup.ts reads them).
 - Data: lot_size_basis = 'oob' on 28,588 lots (stated 27,653, geom_backfill 935), plus 2 more with a blank source (28,596 low in all). That covers all 11,862 lots over 4,645.15 m² and all 7,845 lots under 46.45 m². Another 8,880 'oob' lots sit inside that range.
 - Placeholders: two lots hold the value 123456789 m²: parcels 10625775 and 10548890 (basis oob, confidence low). Others above 1,000,000 m²: 5003436 (2,024,398), 10616747, 10585397, 5502849, 5498686. One lot has area 0.00 (5089991, no frontage). Seven lots have null area; 6 of them have a frontage (10654866, 10654927, 10654865).
 - A person sees "1,328,935,... sq ft · 123,456,789 m²" for the two placeholder lots, and a plain area with full-confidence formatting for the 28,596 others. A null area shows the content null value, never 0 (display-rules.ts:21 and :29 return null for null or blank), so the 7 null lots are handled.
 - Smallest fix: send the area as null, or send a flag, when the basis is 'oob' and the value is outside the owner-entry range. At minimum null the 123456789 and 0 rows.

3. MED, NEW. Several parcels share one address, so the "Lot A / Lot B" cards are rare. Most multi-lot addresses fall to the text list.
 - Data: 7,713 address keys (house number plus street) match more than one parcel: 7,335 with 2 lots, 378 with 3 to 10. Only 1,402 of them print an identical display address, which is what classifyRows (parcel-lookup.ts:155-161) needs for resolution 'multi_parcel' and the lot map. The other 6,311 become a plain text-candidates list.
 - Of the 1,402 lot-map addresses, 69 include a lot with no frontage street, and 3 have more than 2 lots. None has a null area or null geometry.
 - Separate: the key ('NONE','NONE') matches 26,535 parcels (5.3% of all lots). Their stored house number and street are the literal word NONE. It is not reachable by a normal typed address (the lookup needs a number and street) and the exact branch would hit LIMIT 11, so it is truncated. These lots are reachable only by parcelId.
 - Null address keys: 10,006 parcels have no house number, 10,456 have no street name.
 - Address points per lot: 15,902 lots have more than one point (max 346; 1,885 have more than 5). 1,166 points link to 2 or 3 lots. The map pin takes ORDER BY address_point_id LIMIT 1 (lot-map.ts:104-112), so a lot with many points gets an arbitrary first pin. I found no lot with two different printed addresses on the same number and street.
 - What a person sees: for 6,311 addresses a plain text list, for 1,402 a map choice, otherwise a direct match.

4. MED, NEW. The semi-detached detection is asking about a large share of lots, and uses the same shared-building links as finding 1.
 - parcel_lot_form (one row per lot, 496,536): detached 371,799 (basis o4_not_met, unsure false); semi_half 124,737 = o4_two_parcel_abut 102,466 sure + 706 unsure, and doubt_multi_parcel_abut 21,565 (all unsure).
 - 22,271 lots (4.5%) are marked unsure, so each is asked the semi question. 20,847 of those have a zone string and 1,424 have none. 20,191 of the unsure lots are inside the lot-size entry range.
 - Frontage check: 14,205 'semi_half' lots have a frontage above 15 m (3,019 + 11,019 + 167). 7,594 have an area above 1,000 m². Median frontage of a semi_half-sure lot is 7.8 m; the 99th percentile is 92 m, so some semi calls are wide commercial or block-shaped lots. 2,529 semi_half lots are under 46.45 m².
 - This is "data not re-run" in part: the stack view lacks the zone list, which on the branch is meant to restrict the detect zones. I cannot say how many of the 14,205 the branch's zone filter removes.
 - The 706 unsure two-parcel rows share under 5 m of wall (semi_doubt_min_shared_len_m = 5). Basis names reach the app as detected/basis/unsure with no value-range check.

5. MED, NEW. The owner lot-size range excludes the lot sizes it would most need to correct.
 - Seed: user_lot_size_min_sqm 46.45 to user_lot_size_max_sqm 4,645.15 (stack values equal the seed defaults). City values below the minimum: 7,845 lots; above the maximum: 11,862 lots. A City value that is itself wrong in either direction cannot be replaced by a correct one, because a correct one would also fall outside. 8,875 lots have a City value where the 3x ratio rule (user_lot_size_city_ratio_max = 3) leaves no valid entry at all.
 - Mitigation: the switch (user_lot_size_entry_enabled) is 0, so nobody sees this today. parcel_user_inputs is empty (0 rows). Record the number before the switch is turned on.

6. LOW, NEW. Comparable builds carry a storeys of 0 in every sampled example.
 - Data: in the 2% sample (52,828 comparable-build elements) the storeys value is 0 for all of them. In the 5% sample 132,717 of 132,717 are 0 or less; the maximum is 0. consumer-lookup.ts:120-130 passes it through as a real number (num(0) = 0, not null).
 - Frontage_m and lot_sqm in the same examples are never 0 or blank. No blank strings were found in any sampled field (line 81 reads a blank as 0, but there is none to read).
 - Nothing renders comparableBuilds today (mobile/src/lib/schemas.ts:354 is the only mobile reference), so no person sees it yet.
 - 345,075 lots have an array, 151,461 have none. permit_gfa_sqm exceeds 8x the example lot area in 47 sampled examples.
 - Smallest fix: send null instead of 0 for storeys when the source is 0, or drop the field from the whitelist.

7. LOW, NEW. 12,894 primary buildings have a max_height_m of 0 (17,797 buildings in all, 0.00 is a stored zero, not null).
 - resolveStories (src/lib/massing/geometry.ts:174-202) treats height 0 correctly: returns stories null, source null unless the permit declares storeys. So the card shows no storeys line for those lots, not "0 storeys". 193 buildings are above 100 m (max 251.92 m); 70 have more than 40 storeys (max 84). One building has min_height_m above max_height_m. Footprint area in sqft agrees with sqm x 10.7639 except 2 rows. Stored footprint max is 1,449,844.85 sq ft and 321 primary footprints are over 200,000 sq ft.

8. LOW, NEW. 16,047 lots (3.2%) have no frontage street.
 - Data: 15,516 of them still have a frontage_m, 15,003 have a footprint (parcel_buildings row), and 6,736 have a real house number. 69 sit inside a lot-map choice (finding 3).
 - Code: lot-map.ts assembly (consumer-lookup.ts:176-180) returns frontageStreet null for null or blank, never a blank "faces"; a blank string count is 0 on the stack, so only nulls occur. The "at the back" wording is not used (RR-0289, search-follow-ups.logic.test.ts:149-151). A person sees a lot card with no street line.

9. LOW, NEW. 1,578 lots have no building link at all (for example 10571495, 10535478, 10535482). The permit-detail massing block is then null (no card). has_footprint is false, and the lot card says nothing about a house. Working as coded.

10. LOW, NEW (data, not a bug). comp_build_ratio_p50 is above 1 on 23,757 lots (max 1.1). comp_count is null on 59,293 lots and 0 on 92,168. The consumer passes it through as-is. Whether a build ratio above 1 is meaningful is a question (see Q3).

3. WHAT I CHECKED AND FOUND SOUND
- Q9 (GROUNDER-H, H:Q9): no lot has footprints but no primary row. 494,958 lots have a link, all 494,958 have exactly one primary row (0 lots with none, 0 with two or more). Largest lot has 143 buildings. So the BuildingMassing.tsx hide rule is never hit by a lot with accessory buildings but no primary on this stack.
- Unit conversions: the pinned seed values (10.7639, 3.28084) equal the stack's logic_variables; stored lot_size_sqft differs from sqm x 10.7639 by more than 0.5 on 0 of the rows that have both. 7 lots have a null sqft (the same 7 null-area lots).
- Blanks in the columns consumer-lookup.ts:81 reads: no blank strings. The numeric columns cannot hold one; zoning_zn_string, primary_frontage_street_name and comp_dominant_build have 0 empty or whitespace-only values. The sampled comparable_builds JSONB fields have no blank strings (so blank-as-0 is a latent risk only).
- Lot area: no negatives, 1 zero, 7 nulls, p1/p50/p99 of 19.96 / 392.48 / 13,045.67 m². Frontage: no zeros or negatives, 2,824 null, min 0.44, p50 11.22, max 9,410.31. 3,799 lots have frontage above 100 m (44 above 500 m). 4,967 lots have frontage squared above 4x area; none are non-'oob'.
- Geometry and coordinates: 1 lot has no geom and no centroid; all centroids fall inside the Toronto box.
- Usage meter: 44 usage_events rows, all parcel_tool / property_view / parcel_ref, none duplicated per (user, lot) (max 1). All were stamped on 2026-11-16 at one instant per user, session_id is null on all, and meta.extra is false on all. Counts per user are 23, 20 and 1 (3 users). All 44 subject_keys are numeric strings but none match a real parcels.parcel_id: they look like test fixtures, not live use. One user has 23 distinct lots against the limit of 20 (parcel_tool_report_limit_plan and _trial are both 20 on the stack). The meter could not have written the 21st to 23rd, so those rows came from a seed, not the route. readParcelToolUsage clamps reportsLeft at 0 (index.ts:661), so a person would see 0 left, not a negative.
- Entitlements on the stack: parcel_tool rows are admin_managed 1, active 556, trial 1, past_due 1, expired 1, cancelled_pending_deletion 1; lead_gen active 1. None has a period end in the past.
- Fit box and pin: the pin and fit code pads to FIT_MIN_SPAN_DEG, no division by zero found. Outline cap: OUTLINE_MAX_BYTES 65,536 against measured max 61,910 in the comments (not re-measured; geometry sizes not queried).

4. QUESTIONS FOR THE OPERATOR
Q1. Should the massing card hide coverage and the footprint when the building is shared by several lots or the match is "nearest"? (finding 1)
Q2. Should the 123456789 m² placeholders, and every low-confidence 'oob' lot, show "not available" instead of a number? (finding 2)
Q3. Is a comparable build ratio above 1 (23,757 lots, max 1.1) expected, and should it be shown? (finding 10)
Q4. Is the 'NONE' house number and street on 26,535 parcels known and intended, or should those lots carry null? (finding 3)
Q5. Before the lot-size entry switch goes on, should the 46.45 to 4,645.15 m² range be widened for the 7,845 + 11,862 lots outside it? (finding 5)

5. UNVERIFIED
- Production data and the live route: I ran no request through the route, so what a person sees is derived from the code reading plus the rows, not a screenshot.
- The stack lags the branch (entitlements.plan_key, the semi zone-list settings and view shape are missing), so the semi counts in finding 4 are for the older view.
- comparable_builds blank-string checks used 2% and 5% samples, not the whole table (full-table scan would be heavy).
- Whether the building links (parcel_buildings match_type and sharing) are re-run or final is not known; findings 1 and 4 may change after a re-run.
- Outline geometry sizes and the permit-detail route's output for a real permit were not queried or called.
- The per-user monthly window logic was read but not exercised against live entitlements (the 44 events are all from one day and fixtures).
