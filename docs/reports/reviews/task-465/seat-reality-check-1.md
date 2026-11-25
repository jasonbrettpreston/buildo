# Seat: reality-check: task-465 plan (PLAN-465-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 4c22af6e8 (plan names 320b47a02; no mobile or scripts/surfaces change since, and the card file is the only modified file). Files read: the PLAN, the findings file, the mock, the card, SearchBinding.tsx, parcelSearchMatch.ts, parcel-tool/index.tsx, useParcelLookup.ts, lookup-flow.ts, the lookup route.ts, parcel-lookup.ts, lotMap.ts, parcelSearch.ts, WallBinding.tsx, SurfaceRenderer.tsx, bindings.json, parcelScreens.golden.test.ts, the semi tests, phone-next-3101.log. In-memory node: `isOutsideToronto` extracted and evaluated. Local test stack (read-only, counts and ids only): `parcels`, `address_points`, `parcel_address_points`, `parcel_lot_form`, `logic_variables`.

## Checked and clean
- Stack answers match the plan's expected results for these queries:
  - 41 Derwyn Rd: one lot, 5293897 (exact read), so unique.
  - 679 Queen St W: 5476455 is the only 679 Queen lot, printed "Queen St W", so unique.
  - 383 El: exactly 3 lots, 5106944, 5191692, 5461541 (typeahead), so text_candidates.
  - 12 Elm: exact read 0, typeahead 13 lots against cap 10 (`maxbld_page_candidate_cap` = 10), so 10 rows.
  - 78 Robert St: 5259138 and 5438421, same printed address, so multi_parcel. (5215638 is Roberta Dr and is not in the exact read.)
  - 14 Norwood Ter: 5334051 exists, one lot.
  - Gerrard St: 1302 lots, no number, so a capped list plus refine.
  - 108: `linear_name_normalized LIKE '108%'` has 0 points, so no_match. This is why Enter on 108 shows the miss.
  - King and Bay: 0 parcels, so no_match, then the intersection shape.
- `isOutsideToronto`, run now: "123 Main St, Mississauga" is true. "100 City Centre Dr Mississauga" is false today, so the O5(b) test is correctly red first. "26 Markham St", "1000 Markham Rd" and "5 King St, Scarborough" are false and stay false. "41 Derwyn Rd, East York" is false.
- Cites hold: SurfaceRenderer.tsx:148 ACTION_PROPS is `{onPress, onChangeText}`. bindings.json non_display_keys is at line 95. touch_targets.mobile is at line 80. onSubmitEditing is at address.tsx:174. The semi test lines :35, :54, :68, :280 exist. The "four list.* keys" growth is right: rail, badge, select, select.label.
- The 11-23 s compute is real (findings M1 and the final measured line: 11.3 to 23.2 s). It runs inside the q lookup (lookup-flow.ts:79-90). The meter runs on the q path (route.ts, no q/parcelId split), so 3(a)'s cost and "could be counted" claims hold.
- Rem arithmetic: `text-base` 14 px, `text-lg` 15.75 px (the comment in parcelSearch.ts says rem is 14).

## rc#1 MED: the box and spinner wait for the report compute, but mock state 6 says it never does
Plan: 3(a) names only the suggestion row waiting 11-23 s. §4 step 5 and T2/T3 make Enter on a not-yet-fetched text a spinner "in the box". Mock state 6 says "A brief spinner ... the box never waits for the report."
Evidence: lookup-flow.ts:79-90 runs `computeCustomerPageResponse` before the q response returns. `[parcelId].tsx:23` then calls `useParcelLookup(parcelId, ...)`, which computes again. Findings M1: "41 Derwyn ... computed twice, 21.7 s and 21.0 s".
So with the switch on, Enter on a typed lot spins about 21 s, then the loading screen waits about 21 s more. The plan's page does not match state 6 on that path, and the plan does not say so.
Fix: add to 3(a) and §6 that state 6 is brief only with the switch off or a cached key. Name the double compute, and put the card note on 267/343.

## rc#2 MED: step 7 silently restyles the Wall page
Plan: §4 step 7 edits `semiHeading`, `semiCard`, `semiCardChecked` and `semiCardText`. "Unchanged" (§4 end) lists neither the wall nor the map.
Evidence: WallBinding.tsx:38 and :44 take the same constants (`heading: L.semiHeading`, `text: L.semiCardText`, `idle: L.semiCard`). No wall golden or test pins the classes (grep of "text-lg font-bold leading-6" hits only the semi goldens), so nothing catches it.
The report-limit and reactivate screens would get a 26 px heading and 48 px cards with no mock and no ruling.
Fix: either fork `semiHeading26` and the semi card constants for the semi page, or list the wall as changed with a dated note and a device look.

## rc#3 MED: finding 19's cause is unexplained, and the planned class test cannot lock it
Plan: AC4 and §5: "a new case proves the heading px is larger than the answer px"; §3(e) says rem classes shrink.
Evidence: lotMap.ts:48 has `text-lg` (15.75 px) for the heading and lotMap.ts:56 has `text-base` (14 px) for the answers. The heading is already larger by class, yet the operator saw the answers larger (finding 19). A class-level "heading > answer" assertion would have passed before this card.
Fix: mark the cause UNVERIFIED in §9. Make the device-walk measurement of rendered heading against answer sizes an explicit gate. Do not call the class test a lock for finding 19.

## rc#4 MED: T5 is under-determined, because '12 Elm' hits the cap and gets the refine line
Plan: T5 "'12 Elm' (10 rows) plus submit. Expect parcel-search-hint"; hint kinds `'several'|'refine'`, a single value.
Evidence: 12 Elm returns exactly 10 rows (verified). `overCap = noNumber || isOverCandidateCap(candidates, cap)` is therefore true, so `list.refine` ("Add a house number to narrow it down.") shows to a user who typed a number. The plan does not say whether 'several' or 'refine' wins, or whether both draw.
Fix: state the precedence. For a capped numbered list, give the wording (not "Add a house number") and the testID T5 expects.

## rc#5 LOW: "67 Northbridge Cres" does not exist on the stack
Plan: T8 and AC3 use rows "for '67 Northbridge Cres'".
Evidence: `parcels` and `address_points` have 0 rows matching `%northbridge%`. The stack's near-match read (threshold 2, parcel-lookup.ts:530) gives "67 Northbridge Cres" → Forthbridge Cres + Northridge Ave. It gives "67 northbrdi" → North Heights Rd, 1 row. These are fuzzy rows and do not start with the typed text.
T8 is mocked, so it passes. But the device repeat of findings 11-14 shows non-prefix "did you mean" rows in the drop-down, unlike the mock's prefix list. Enter can never open a lot for this address.
Fix: in the walk script use 383 El and 12 Elm for the list cases. Note that near-match rows draw in the drop-down.

## rc#6 LOW: 3(a) names the wrong meter value with the switch off
Plan: "the compute answers null, so the meter reads not_produced".
Evidence: route.ts tests `!hasEvaluatedOption` first, so a lot with no cost reads `not_evaluated`. phone-next-3101.log has 38 `"meter":"not_evaluated"`, 42 `"meter":"none"` and 0 `not_produced`. (Findings M3 and item 24 say the same.)
Fix: say not_evaluated.

## rc#7 LOW: Input `h-[44px]` must not replace `min-h-[44px]`
Plan: §3(e) "the Input drops py-3 and gets h-[44px]".
Evidence: parcelScreens.golden.test.ts:60-61 requires exactly one `min-h-` token, `min-h-[44px]`, on every Input. bindings.json:80 reads `"Input": ["min-h-[44px]"]` (Input stays 44 only).
Fix: say "keeps min-h-[44px], adds h-[44px]". A row Button needs one `min-h-[48px]` and no other `min-h-` token.

## rc#8 LOW: mock differences the plan does not list
Evidence: the mock's `.rowi.first{background:var(--hover)}` highlights the first suggestion row. No plan step or O-item draws it. Districts (O3), "for {query}" (O10), the short semi labels (O11) and the bold typed part (O12) are declared.
By state, the built page against the approved mock:
- State 1 matches.
- State 2 matches, minus the district line, the first-row highlight and the bold typed part.
- State 3 matches only for text_candidates. A multi_parcel gets one row and then the map (O6).
- State 4 matches except for the "for {query}" wording.
- State 5 matches.
- State 6 matches only when the lookup is fast (rc#1).
- State 7 matches, with the real labels instead of Yes/No/Not sure.
Fix: add the first-row highlight as an O-item or declare it dropped.

## rc#9 LOW: finding 4 is only half placed
Plan: §1 "Items 4 and 5 belong to tasks 343 and 267".
Evidence: the card file lists item 4. Its words "the enter button doesnt do anything" are fixed by this card (Enter submits). Its "no report" screen and the 21 s wait stay with the compute cards (M1).
Fix: say item 4 is split. Enter is covered here (T2/T3). The no-report screen and the compute wait are left to 343/267 until those cards land.

Finding coverage:
- Fixed by the plan: 1 (device-only), 2, 3, 6, 11, 12, 13 (Enter keeps the list and shows a hint; it does not open the lot), 14, 15, 17, 18, 21, 22 (device-only), 25, 27, 28, 29 (comma form only unless O5(b)), 32, 36.
- Not fully fixed or lockable: 4 (rc#9), 19 (rc#3).

UNVERIFIED: iOS onSubmitEditing, on-device centring and sizes, the Button ghost variant under the layout rules, and any wall-page look after rc#2.

STATUS: 9 findings (0 CRITICAL, 0 HIGH, 4 MED, 5 LOW); every test address resolves on the stack as the plan says (67 Northbridge Cres is not on the stack and the plan mocks it), but the Enter-time wait, the shared wall constants and finding 19's lock need plan edits.
