Seat: Cairn-Typed-Addresses

HOW I RAN IT
- I called the real resolver, read-only. I ran resolveAddress(q, {classifyUnlinked:true, matchMistyped:true}) through one `npx tsx -e` call, with DATABASE_URL set inline to the local stack (127.0.0.1:55322). No file was written. All the resolver rows below are the real resolver output.
- I also ran bounded read-only SELECTs for the data hunting, the replays and the counts. These were one SELECT each inside BEGIN READ ONLY, with a statement_timeout where the query was heavy.
- A second tsx call was DENIED by the permission system. It added runLookupFlow for the semi case. I did not retry or work around it. So I have not seen a live search response carrying the semi block. Case 12 rests on SQL reads plus code reading.
- Limits: I replayed the resolver only. I did not run the HTTP route, the page compute or the phone. The phone column comes from reading mobile/src/lib/parcelSearchMatch.ts and mobile/src/lib/parcelSearchCore.ts. The phone sends nothing below 3 typed characters (min_query_len 3). The phone refuses a comma plus non-Toronto city before the network.

KEY MECHANICS (found by reading and by running)
- parseLinearName drops the street TYPE and a trailing direction from the street key. "679 Queen St W", "679 Queen Street West" and "679 Queen" are all num 679, street QUEEN. The direction is applied afterwards by guardByDirection.
- The exact read joins on number and street name only. The street type is not in the key. See case 2d.
- The typeahead is LIKE 'NAME%' on address_points. It has no minimum on the name length and no "typed text is the full street" check.
- A typeahead result of exactly one lot returns resolution 'unique' with matchType 'typeahead'. The phone routes 'unique' straight to the lot (parcelSearchCore.ts:26). This is the root of the biggest gap (cases 4 and 6).

TABLE (real stack data; every row is a resolver run unless marked "replay")
Format: case | typed | rule expects | built search returns | phone | verdict

1a | 679 Queen St W | opens lot | unique, exact, 1 row, "679 Queen St W", parcel 5476455 | opens lot | AGREES
1b | 383 Elm Rd (replay) | opens lot | exact, 1 row, "383 Elm Rd", parcel 5191692 | opens lot | AGREES
2a | 679 queen street west | opens | unique exact 5476455 | opens | AGREES
2b | 679  QUEEN  ST  W (extra spaces) | opens | unique exact 5476455 | opens | AGREES
2c | 679 Queen (no suffix, no direction) | opens | unique exact 5476455 | opens | AGREES
2d | 32 Fulham Dr (a real address; Fulham St also exists at number 32) | opens "32 Fulham Dr" | text_candidates, 2 rows: 5067128 "32 Fulham St", 5514141 "32 Fulham Dr" | list | DIFFERS (a full exact address does not open)
2e | 679 Queen St. W (period after St) | opens | text_candidates, 1 row "679 Queen St W", 5476455. The key becomes "QUEEN ." and it reaches the close-address step. | list of 1 | DIFFERS (small)
2f | 679QUEEN ST (no space) | close addresses | no_match, 0 rows | miss message | DIFFERS (small)
3 | 12 Elm | pick list | text_candidates, 10 rows (cap): 12 Elm Grove Ave 5492668, 12 Elm Ridge Dr 5264433, 12 Elma St 5510910, 12 Elmartin Dr 5017163 ... No truncation flag. | list | AGREES (the cap hides the rest)
4a | 2760 Yon (replay, 2760 Yonge St exists) | list or confirm, NOT open | typeahead, exactly 1 row: unique, matchType typeahead, "2760 Yonge St", 5229356 | OPENS the lot | DIFFERS (serious)
4b | 383 El (replay) | list | 3 rows (383 Ellerslie Ave 5106944, 383 Ellis Park Rd 5461541, 383 Elm Rd 5191692) | list | AGREES
4c | 679 Que (replay) | list | 2 rows (679 Queen St W 5476455, 679 Queens Quay W 5497535) | list | AGREES
4d | 14 Norwood (replay) | list or confirm | typeahead 1 row, "14 Norwood Ter", 5334051 | OPENS the lot (then the semi question page, see 12) | DIFFERS
5a | Gerrard St (no number) | ask for a house number | text_candidates, 10 rows, the first ten sorted by address: 1 Gerrard St W 5440777, 1000 Gerrard St E 10640216, 1001 Gerrard St E 5402856 ... | list of 10 arbitrary lots | DIFFERS (should ask for a number)
5b | Elm | ask for a number | text_candidates, 10 rows starting 1 Elm Ave 5379936, 1 Elm Grove Ave, 1 Elm Ridge Crcl, 1 Elm St | list | DIFFERS (same)
6 | Gerrard St W | ask for a number | unique, typeahead, "1 Gerrard St W", parcel 5440777 | OPENS the lot | DIFFERS (serious)
7a | 100 Queen St W | opens | unique exact 5456212 "100 Queen St W" | opens | AGREES
7b | 100 Queen St (no direction) | opens, or ask the side | unique exact 5456212 "100 Queen St W" | opens | AGREES (fair, only one lot exists)
7c | 100 Queen St E | not the W lot | text_candidates, 1 row "100 Queen St W" 5456212 (the guard turns a unique into a list) | list of 1 | AGREES
7d | 6 Glenaden Ave (both sides exist) | pick | text_candidates, 2 rows: 6 Glenaden Ave E 5484745, 6 Glenaden Ave W 5485663 | list | AGREES
7e | 6 Glenaden Ave E | opens E | unique exact 5484745 | opens | AGREES
7f | 2750 St Clair Ave W | the W point has no lot | text_candidates, 1 row "2750 St Clair Ave E" 5260587. The unlinked W point is never reported, because the conflict list returns before the unlinked read. | list of 1 (the E lot) | DIFFERS (minor)
8a | 123 Yongee St | close addresses | text_candidates, 2 rows: 123 Yonge Blvd 5179889, 123 Yonge St 5464983 (fuzzy threshold 2) | list | AGREES
8b | 2760 Yongee St | close addresses, never open | text_candidates, 1 row "2760 Yonge St" 5229356 (resolution text_candidates, match null) | list of 1; does NOT open | AGREES
8c | can a mistype open one lot? | no | The mistyped read (step 4) never sets match (parcel-lookup.ts:352-361). A mistype opens only if it is by chance a prefix of a real street (the 4a hole) or a real other street. | | AGREES for the fuzzy step; the 4a route is the leak
8d | 123 Yonge St (real address; Yonge Blvd also at 123) | opens or picks | text_candidates, 2 rows (Blvd, St) | list | DIFFERS (same cause as 2d)
9 | 78 Robert St (two parcels, 5259138 and 5438421, both "78 Robert St") | map | multi_parcel, 2 rows, lotMap kind multi_parcel, truncated false | map screen | AGREES. 7,714 number+street keys have 2 or more lots.
10 | 2 Lake Cres (point "2 Lake Cres" has 0 lot links; no parcel at 2 LAKE) | unlinked map | The point is real and unlinked, so by the code this is 'unlinked' with a pin. I did not run it live (see UNVERIFIED). | map | AGREES by code
11a | King and Bay | intersection | no_match, 0 rows, then the phone's isIntersectionQuery gives 'intersection' | corner map | AGREES
11b | 123 Main St, Mississauga | refuse | Phone refuses before the network. (If it were sent, the server returns 3 near addresses: Maria St, Marion St, Nairn Ave.) | message "outside Toronto" | AGREES
11c | 123 Main St Mississauga (no comma) | miss | no_match (no 123 Main St exists) | miss message | AGREES (the stated limit)
11d | 2760 Yonge St Unit 4 | opens the lot | unique exact 5229356 | opens | AGREES
11e | Unit 4, 123 Yonge St | close addresses | no_match, 0 rows (the comma cut leaves "Unit 4") | miss | DIFFERS
11f | 2760-4 Yonge St | close addresses | no_match, 0 rows | miss | DIFFERS
11g | 2760A Yonge St (no such lot; 502A and 5437A Yonge St exist) | close addresses | no_match, 0 rows | miss | DIFFERS
11h | 2760 Yonge St, Toronto | opens | unique exact 5229356 | opens | AGREES
12 | 14 Norwood Ter (unsure lot, view row semi_half, basis doubt_multi_parcel_abut, unsure true) | the question page | By code: lookup-flow.ts holds the page for an unsure lot and returns lotForm {detected, basis, unsure}. The phone's [parcelId] screen redirects to the question (needsSemiQuestion). | opens the lot, then the semi question | AGREES by code; NOT run live (denied) |

DIFFERS IN DETAIL, MOST SERIOUS FIRST
1. A partial street name opens a lot when one lot happens to fit (cases 4a, 4d, 6). Cause: src/lib/admin/parcel-lookup.ts:304-311. A typeahead result of one row returns resolution 'unique' with matchType 'typeahead', and the phone opens a 'unique' (mobile/src/lib/parcelSearchCore.ts:26). Smallest change: on the typeahead path (line 304), never return 'unique'. Return 'text_candidates' with the single row as the candidate, so the person confirms it. Only the exact path at line 264 may return 'unique'. The same change makes case 6 ("Gerrard St W") stop opening a random lot. The same change also stops a guarded result from opening: guardByDirection can narrow a typeahead of 10 rows to 1 (the Gerrard case).
   Size, sampled with 300 real (number, street) keys. For a 3-letter street prefix, 77 of 300 (26%) leave exactly one lot. For the street name minus its last letter, 275 of 300 (92%) leave exactly one lot. The whole-stack count was too heavy to run (451,436 distinct number+street keys), so this is a sample. Sample bias: tablesample 0.1% of parcels, street names of 5 or more letters, numeric house numbers only. Every one of those one-lot results opens a lot today.
2. No house number never asks for one (cases 5a, 5b, 6). Cause: parcel-lookup.ts:285-300. With an empty number, the typeahead runs with $2 NULL and returns the first 10 lots of the street, sorted by printed address. Smallest change: in resolveAddress, when num is empty and streetName is not empty, return a flag for 'needs a house number' (a new resolution, or a warning on no_match). This avoids a new route. The phone then asks for a number. Alternatively, on the phone, if the query has no leading digit and is not an intersection, show the prompt "add a house number" and do not call. 429 streets have exactly one linked lot, so there even a number-less query would open that lot. The change above covers it.
3. A full exact address with the wrong or different street type goes to a list (cases 2d, 8d). Cause: the exact key (parcel-lookup.ts:249-253) has no street type. The type is dropped by parseLinearName (address.ts:48-62). 5,006 number+street keys have two or more street types. Smallest change: when the exact rows are 2 or more and the typed text carries a street type, narrow to the rows whose street_type_normalized equals it, as the direction guard does. Do it only when it leaves a non-empty set. If it leaves one row, that is an exact full match.
4. A unit-before-number, a dash unit and a letter suffix go to a dead-end miss (11e, 11f, 11g). Cause: UNIT_TAIL (parcel-lookup.ts:171) only drops a trailing unit. Smallest change: also strip a leading "Unit N," or "N-" before parse. For a letter suffix, fall back to the bare number when the exact read for the suffixed number is empty, and list the results.
5. "St." with a period and "679QUEEN" with no space (2e, 2f). Cause: parseLinearName leaves the "." in the street key. Smallest change: strip periods before the parse in parseFreeTextAddress. 2e does reach a one-row list through the fuzzy step, so it is low priority.
6. The unlinked W point is hidden behind the E lot (7f). Low priority. The conflict list returns before the unlinked read (parcel-lookup.ts:261).
7. The list cap hides the rest with no flag (case 3). The typeahead has LIMIT 10 and no probe for more (parcel-lookup.ts:297). The phone shows the "refine" line at 10 or more, so this is cosmetic.

PROPOSED TESTS FOR THE SEARCH FIX TASK (text | expected)
1. "679 Queen St W" | unique, exact, 5476455
2. "679 queen street west" | unique, 5476455
3. "679  QUEEN  ST  W" | unique, 5476455
4. "679 Queen" | unique, 5476455
5. "679 Queen St E" | text_candidates, 1 row, 5476455, no match
6. "100 Queen St E" | text_candidates, 1 row, 5456212 (not opened)
7. "100 Queen St W" | unique, 5456212
8. "6 Glenaden Ave" | text_candidates, 2 rows (5484745 and 5485663)
9. "6 Glenaden Ave E" | unique, 5484745
10. "32 Fulham Dr" | unique 5514141 (after fix 3; today a list of 2)
11. "123 Yonge St" | unique 5464983 (after fix 3; today a list of 2)
12. "2760 Yon" | text_candidates with the single row 5229356, NOT unique (after fix 1)
13. "14 Norwood" | text_candidates with one row 5334051, NOT unique
14. "383 El" | text_candidates, 3 rows (5106944, 5461541, 5191692)
15. "12 Elm" | text_candidates, 10 rows
16. "Gerrard St W" | not unique; asks for a house number (after fix 2). Today: unique 5440777, which is the known case.
17. "Gerrard St" | asks for a number, no list
18. "123 Yongee St" | text_candidates 2 rows (5179889, 5464983), match null
19. "2760 Yongee St" | text_candidates 1 row 5229356, match null, never unique
20. "78 Robert St" | multi_parcel, parcels 5259138 and 5438421, lotMap multi_parcel
21. "2 Lake Cres" | unlinked, pin (needs a live run; I could not run this)
22. "2750 St Clair Ave W" | decide: today a list with the E lot 5260587
23. "King and Bay" | no_match on the server; 'intersection' on the phone
24. "123 Main St, Mississauga" | phone outside_toronto, no request sent
25. "123 Main St Mississauga" | no_match
26. "2760 Yonge St Unit 4" | unique 5229356
27. "Unit 4, 123 Yonge St", "2760-4 Yonge St", "2760A Yonge St" | text_candidates with close addresses (after fix 4; today no_match)
28. "14 Norwood Ter" (unsure lot 5334051) | unique exact; lotForm {detected semi_half, basis doubt_multi_parcel_abut, unsure true}; page null until semi=answered
29. Phone: a 2-character query ("12") sends no request (min_query_len 3)

UNVERIFIED
- Case 10 (unlinked) and case 12 (semi block in a live response). The second resolver call and runLookupFlow were denied. Case 10 rests on the data fact (a point with no lot link, no parcel at that number and street) plus the code at parcel-lookup.ts:316-340. Case 12 rests on the view row (unsure t, semi_half, basis doubt_multi_parcel_abut, 14 Norwood Ter) plus lookup-flow.ts (the held page, the lotForm field) and the phone's needsSemiQuestion. 22,271 of the 496,536 lots are unsure.
- The case 4 counts are samples (300 keys, two prefix lengths), not a whole-stack figure. The 3-letter and one-letter-short results are the two ends; real typing falls between them.
- Phone behaviour is read from code, not run on a device. I did not check the disambiguate screens' contents (the map screen for multi_parcel and unlinked, the candidate list rendering).
- The direction guard, the Toronto check and the unit strip behave as the code reads; I did not test other cities' postal codes.

Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/admin/parcel-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/parcels/address.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchMatch.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchCore.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/parcels/lookup-flow.ts
