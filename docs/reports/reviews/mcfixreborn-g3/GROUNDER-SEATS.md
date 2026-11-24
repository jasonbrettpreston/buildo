Grounder: Cairn-Ground-Seats

Scope: read-only. Ten rulings (A to J). I made 7 read-only SELECTs on the local test stack, counts and ids only. I wrote no file and ran no test.

| Letter | Seat severity | Verdict | My severity | Live or latent | Reason |
|---|---|---|---|---|---|
| A | MED | CONFIRMED | MED | LIVE (wrong lot shown; meter off) | parcel-lookup.ts:301 guard runs on a truncated 10-row street-only window; the stack has a trigger: street GERRARD, typed W |
| B | MED | CONFIRMED | MED | latent (meter off) | apiClient.ts:63 drops the 403 code; parcelSearchMatch.ts:297 turns every 403 into the lapsed-subscription copy |
| C | MED | REFUTED-BY-RULING | none | n/a | MD:1434 "the meter stays where it is (in the lookup route, counting only when a report is produced)"; MD:1082 |
| D | MED | REFUTED-BY-RULING (registration), plus a LOW wording residual | LOW | live in the admin panel; no harm | MD:1494 "yes follow the rules register them"; emitter bakes values at generate time |
| E | LOW | DUPLICATE: part of the known L1/D1 | LOW | latent | GROUNDER-B.md:98 already says closed enums are "same family as D1 ... raise to the D1 fix task" |
| F | HIGH | CONFIRMED, down-rated; the seat's line numbers and its "area line removed" premise are wrong | LOW | LIVE but tiny | consumer-lookup.ts:227 feeds an area that LotMapBinding.tsx:194 still draws; 19,707 outside-range lots, 2 placeholders |
| G | HIGH / MED / MED | F1 building links and F4 semi: REFUTED-BY-RULING for use; link quality is NOT-G3-CODE. F3: not a defect. The 'NONE' keys are NOT-G3-CODE | n/a | n/a | MD:1117; link-massing step; migration 323 not applied on the stack |
| H | MED | REFUTED-BY-RULING | none | latent (switch off) | Spec 126:903 D-2/D-3 "46.45 and 4,645.15 m²", operator "all as recommmended" |
| I | MED | PARTLY CONFIRMED: backlog-lib.mjs yes, paths.mjs no | LOW | latent | rule-lists.json:22 omits backlog-lib.mjs; paths.mjs is under mcbylaws/protected-paths.json:45 |
| J | MED | CONFIRMED | LOW | latent (tool output only) | policy-checks.mjs:70 passes empty changes in --all, so chk3-nothing-new.mjs:20-26 finds nothing; row still prints PASS |

CONFIRMED ITEMS, most serious first

A. Street-only typeahead window narrowed to a "unique" lot (G2, src/lib/admin/parcel-lookup.ts)
- Code: the typeahead (:279-293) is `ORDER BY address LIMIT 10` with no overflow probe, and :301 calls `guardByDirection(typeahead, typed)` unconditionally.
- Exact path: :260-261 skips the guard when its window is full (`exactTruncated ? null : typed`). The :299 comment ("0 (street, number) keys reach more than 10") only covers street plus number. With no number, `$2` is NULL and the window is just the first 10 addresses on the street.
- Reachable from the consumer route: lookup-flow.ts:43 calls resolveAddress with q. A single hit returns resolution 'unique' with matchType 'typeahead' (:303-309), and lookup-flow.ts:73 then fetches the lot and builds the page.
- Stack proof (I did not run the resolver itself). I replayed the typeahead SQL for every street name that has directional addresses (67 names). 28 of them have a first-10 window where every row carries a direction.
  - Typed W against GERRARD gives 9 E rows and 1 W row, so the guard leaves exactly one row and the answer is "unique".
  - Gerrard has hundreds of lots. The user typed only "Gerrard St W", and the phone opens one arbitrary lot.
  - Not unique (more than one row survives): DUNDAS, SHEPPARD, WELLINGTON, MERRILL and others.
- What happens: the person is shown a report for a lot they did not choose. Today billing is off (MD:1105), so there is no charge. Once metering is on, the same wrong lot counts as a report (see C).
- Smallest fix: parcel-lookup.ts:301 `guardByDirection(typeahead, typed)` → `guardByDirection(typeahead, typeahead.length >= 10 ? null : typed)`. Reword the :299 comment to say street-only windows are covered. Add one 10-row case beside src/tests/search-parser-guard.logic.test.ts:201 (that test uses 3 rows).
- Owning task: task-69 (1.4 direction guard, RR-0166 "ONE-12 a").
- Size: line-size. No decision needed.
- Side effect: a legitimate street+number with exactly 10 lots loses its narrowing and shows a list instead. That is harmless and matches the exact path.

B. REPORT_LIMIT_REACHED shown as the lapsed-subscription message (G3, mobile)
- Server: route.ts:109-114 returns 403 REPORT_LIMIT_REACHED with reportsLimit and resetsOn.
- Phone: apiClient.ts:49-63 keeps only ACCOUNT_DELETED and throws `new ApiError(403, 'Forbidden')` for every other 403. That drops the code, the limit and the reset date.
- parcelSearchMatch.ts:297 sets `entitlement` on any 403. The search page then prints `search.entitlement`, from scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json:13: "Your subscription doesn't include the parcel tool right now. This isn't a missing address — reactivate to search lots again."
- So a paying user at 10 of 10 is told to reactivate.
- Report screen: a 403 on the parcelId path gives isError, which shows "Could not load this report. Try again." (content line 8; mobile/app/(app)/parcel-tool/[parcelId].tsx:30). The retry guard stops auto-retry on 403 (useParcelLookup.ts:62-68), but the Try again button just fails again. This is the generic copy, not the lapsed copy.
- Mitigation: the search page already draws "{left} of {allowance} reports left until {reset}" from the entitlement read (content :23), so the person sees "0 left" beside the wrong sentence.
- Live or latent: latent. The meter counts only a produced report, with "1 b 2 a" and the evaluated-option rule, so a limit cannot be hit today.
- Smallest fix: carry the error code on ApiError. That is the :63 throw plus mobile/src/lib/errors.ts. Then parcelSearchMatch.ts:297 splits REPORT_LIMIT_REACHED from a plain 403 into a new content key.
- Owning task: task-320 (SRCH.A6, the reports-left line). I could not confirm this from trailers.
- Size: small, but it NEEDS A DECISION on wording and on showing the reset date (Q1).

F. Lot area served with no confidence flag (G3, src/lib/parcels/consumer-lookup.ts)
- Seat line numbers :81 and :152 are stale. The real sites are :104-111 (headline `areas`, which includes lot_size_sqm and lot_size_sqft) and :227 (`area: areaSqftM2Dot(l.lot_size_sqm)` in assembleLotMap).
- Counts re-run on the stack:
  - lot_size_basis 'oob': 28,590 (seat 28,588).
  - Value 123456789: 2 lots. More than 1,000,000 m²: 7. Null: 7. Exactly 0: 1.
  - Outside 46.45 to 4,645.15 m²: 19,707 (the seat's 7,845 plus 11,862), and all 19,707 are 'oob'.
- Which screens show the area:
  - Choose-your-lot card (multi_parcel only). It still draws the area as visible text (LotMapBinding.tsx:194, style cardArea in mobile/src/constants/lotMap.ts:36). It is also in the accessibility label (:189, content "lot.label" "Lot {letter}, {area}, ..."). The golden multi_parcel_3plus.mobile.json:461 has "card-area". So the seat's claim that the visible line was removed is wrong for this card. Task-322 and Spec 100:144 removed the area line only under the candidate list.
  - The headline `areas` (consumer-lookup.ts:104-111) has no phone renderer. I found none, and ParcelDetailScreen is retired.
- Existing flag: project.ts:267 `lot_size_implausible` uses window 50 to 5,000 m² (seed :8192-8203). It is not consumed by the lookup response, the lot-map assembler or anything under mobile/src or scripts/surfaces/parcel_product. It covers the report projection and the admin preview only. It does not reach the choose-lot card. Whether the phone report shows it is UNVERIFIED.
- Who is exposed: one of the two 123,456,789 m² lots shares a printed address with another lot (stack count 1). That lot would show "…sq ft · 123,456,789 m²" on a Lot A/B card. The other 28,000+ oob lots are exposed only if they sit on a multi-lot address.
- No data or money harm. The metric is shown unflagged. The window 50 to 5,000 m² would flag 19,432 lots.
- Smallest fix: consumer-lookup.ts:227 `area: areaSqftM2Dot(l.lot_size_sqm)` → return null when `l.lot_size_sqm` is outside `LOT_SIZE_PLAUSIBLE_M2` (exported from project.ts:79). The content null value already handles a null. This reuses the existing setting and builds no new mechanism.
- Owning task: task-336 (SRCH.LOTCARD).
- Size: line-size once Q3 is answered.

I. Close check imports helpers the self-edit rule does not protect (G4)
- Rule: check-lane-close.mjs:44 imports `parseFM` and `asList` from scripts/analysis/backlog-lib.mjs. rule-lists.json:22 `protected_paths` lists five paths and not backlog-lib.mjs. The self-edit rule (:752) only blocks changing a protected path in the same commit that closes a task.
- backlog-lib.mjs is not protected by another route. mcbylaws/protected-paths.json has no entry for it. scripts/analysis/mcbylaws/** (protected-paths.json:45, key "protected") does not match scripts/analysis/backlog-lib.mjs.
- REFUTED for paths.mjs: it sits under that glob. The push gate (gate.mjs:568 isProtected, then :580-584) asks for the owner "y" on any change to it.
- Effect: a lane that names backlog-lib.mjs in its Files line could change how status and assignee are parsed in an earlier commit, then close later. It needs a task that declares the file. A design gap, not live harm.
- Smallest fix: rule-lists.json:22 add `"scripts/analysis/backlog-lib.mjs"` to the array.
- Owning task: task-448 (the rule-lists.json owner, per G4 GROUNDER-A.md:86); COMPLY.2 is task-366.
- Size: line-size. The file is itself protected, so it needs a lane. RR-0392 says no new card without the operator (Q4).

J. Proof row CHK.3 prints PASS with nothing checked (G4)
- proof-slices.json:9 runs `policy-checks.mjs --all` with expect "POLICY CHECKS OK". policy-checks.mjs:70 passes `changes: staged ? changes : []` and empty package text in --all mode. chk3-nothing-new.mjs:20-26 reads only `changes` and the package diff, and always returns `waits: []`. The WAITS CHK.3 hook (proof-slice.mjs:88) therefore never fires.
- Only the orphan sweep (`goneRows`) runs. The CHK.5 row (line 10) shows NOT BUILT only because chk5 prints its own WAITS line.
- Effect: a green row for a check that was not exercised. No data or money is touched.
- Smallest fix: proof-slices.json:9 change the row to `notbuilt` with a reason ("CHK.3 reads the staged diff; --all gives it no input"). Or reword `proof` to "orphan ledger rows only".
- Owning task: task-268 (PROOF.S).
- Size: line-size.

OTHER RULINGS, SHORT

C. REFUTED-BY-RULING.
- Operator ruling quoted: MD:1082 "it shouldn't count the report unless the report is produced. I should only be charged a report if I find the address and lot I'm looking for and a report is produced". Then MD:1431-1432 puts "Where the report meter counts ... leaving it where it is", answered "2. y 1 a", and MD:1434: "the meter stays where it is (in the lookup route, counting only when a report is produced)".
- The Spec 100 §3.2 note (3) "the map is not metered; the chosen lot opens through the metered parcelId path" is about the multi_parcel map only (note 103). route.ts:105-115 is the ruled location.
- The phone's "unique opens the lot" is ruled in the 2026-11-10 MF-35 note (Spec 100:144). The person lands on and sees the report, so the count matches "a report is produced".
- Residual: the charge on a wrong lot is made by finding A, not by the meter rule. Fixing A closes it.
- A narrower ruling ("only exact matches count") is not on record and is not needed.

D. Registration is settled by the operator and the card.
- Operator: MD:1494 "yes follow the rules register them." The card, task-395 line 79 (notes), records it as superseding the earlier option.
- The earlier grounder had warned that "a database-registered variable would be a control with no effect" (the card, line 79). The question put to the operator (MD:1492) did not state that consequence. That is the residual.
- Facts: emit-mobile-surfaces.mjs:34-47 `PAGE_SETTINGS`, and pageSettingBounds requires the descriptor value to equal the seed default. The phone reads only the slice (sliceConfig.ts). The seed text says "resolves the slice number from this row at generate time ... Only the phone applies it". It does not warn that a panel edit has no effect.
- Not a defect against any ruling. LOW wording gap (Q2).
- Not a G3 code defect, owner task-395.

E. Same family as the known D1/L1.
- GROUNDER-B.md:86 (D1) fixes the `.strict()` at schemas.ts:428 and says "closed enums are a design call".
- GROUNDER-B.md:98 already puts p5#3 ("closed `resolution` enum on additive_only contract, same family as D1") and :99 (closed `kind` enum) into the D1 fix task.
- The seat's lotForm basis, detected, resolution and matchType enums (schemas.ts:426-431, :442, :370) are the same class. Part of D1, not a new defect. Owner task-319. No live fault today (views 320 and 323 emit exactly 3 bases and 2 forms).

G. Building links, semi detection and address keys.
- Counts re-run:
  - 22,271 unsure lots and 124,737 semi_half lots (in a 496,536-row view).
  - 107,750 parcel_buildings rows have match_type 'nearest', all primary.
  - 107,750 lots have only nearest links. Every one of them gets has_footprint true.
  - 69,112 buildings are linked to more than one lot.
  - 26,535 parcels have the address key ('NONE','NONE').
- hasFootprint is a bare EXISTS (lot-map.ts:105). The operator ruled presence only, MD:1117 (RR-0289): "if the mass data determines there is a house or structure we should use it. its not reliable for determining the size or the height but should be reliable to say something is there". The card says only "has the house" or "no building". REFUTED-BY-RULING for G3 code.
- Whether a 0.60-confidence nearest link counts as "a structure there" is not stated by the operator (Q5). The link quality itself is pipeline data owned by the link-massing step: scripts/link-massing.js, scripts/lib/compute/link-massing.js (B-9 nearest fallback), and scripts/link-massing.descriptor.json (settings link_massing_nearest_confidence, massing_nearest_max_distance_m).
- The permit-detail coverage over 100 percent (seat F1, src/app/api/permits/[id]/route.ts:232-262) is not a G3 file, so I did not rule it. It reads the same shared links, so its owner is the same step plus the permit-detail card.
- Semi detection (migrations 320 and 323) is built on exactly these links by design. Spec 78 O-4 says "primary footprint is primary-linked to exactly 2 parcels". The operator ruled "semi all y" and "semi ask a" (Spec 100:104). The 706 strict lots under 5 m is migration 320's own measured text, so it is not a new finding.
- The 14,205 wide semi_half lots are a stack lag. Migration 323 (residential-zone filter, semi_auto_max_shared_len_m = 60, RD ask) is "WRITTEN, NOT APPLIED" (323 header), and the stack view is the older shape. I cannot say what the branch removes.
- Finding 3 (shared addresses): by design. Spec 100:103 (1) says different printed addresses give text_candidates and 2+ identical printed addresses give multi_parcel. The 'NONE' keys are source-load data from the parcel seeding step (scripts/seed-parcels.js, owner not confirmed).

H. REFUTED-BY-RULING.
- Spec 126_maxbld_surface_standard.md:903 (FE-19/20 note, MF-19): "D-2/D-3: the range is two logic variables (46.45 and 4,645.15 m², '500 and 50,000 sq ft') ... an entry more than 3 times, or under a third of, the City record is refused". The operator's words in the same note: "all as recommmended" (MF-19 D-1..D-8, 2026-11-11). Cited in Spec 135 register FE-19, line 41. The seed describes it as editable in the Admin Control Panel.
- FE-19/FE-20 themselves state shared inputs and "newest wins", not the range.
- The switch is off (user_lot_size_entry_enabled bounds 0 to 0) and parcel_user_inputs is empty, so nobody is affected. Re-open the range before the switch goes on, since all 19,707 outside-range lots are oob (Q3 covers this too).

Operator questions
1. What sentence should a person see at the monthly limit, and should the reset date show?
2. Should the six maxbld_page_* panel rows be hidden or labelled "takes effect at the next app build", given a panel edit changes nothing?
3. On the choose-your-lot cards, should a lot area outside the 50 to 5,000 m² implausible window (19,432 lots, including the 123456789 placeholders) show "not available", and should the owner-entry range be widened before its switch goes on?
4. May backlog-lib.mjs be added to protected_paths (needs a lane, RR-0392)?
5. Should a nearest-match (0.60) building link count as "has the house" on the lot card?

UNVERIFIED
- A used a replay of the typeahead SQL, not the resolver. I replicated its filters and `ORDER BY address LIMIT 10` on the stack and read the direction with a regex like trailingCompass. The stack lags the branch, but no change is known in this query. I did not print a lot id for the Gerrard case.
- Whether the phone navigates on a street-only query: isIntersectionQuery was not read, though "Gerrard St W" has no intersection words.
- B. The reset-date/limit wording and the errors.ts shape.
- F. Whether the phone report page shows lot area or any implausible-size notice. No renderer found.
- G. Owner of the 'NONE' address keys, and what migration 323 removes on the branch.
- I. Whether the McBylaws push "y" prompt applies to lane pushes.
