# Seat: reality-check: task-449 plan (PLAN-449-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 9a10561ef (branch wf2/board). I read the whole task file, FINDINGS-PLAN.md, src/lib/admin/parcel-lookup.ts:140-380, src/lib/parcels/address.ts, the census row near contracts.json:22003-22078, and the seat record SEAT-typed-addresses.md:55-61. I read the local test stack (read-only SELECTs) and ran the plan's typedText pattern and the parseLinearName regex in node, in memory. The stack holds 496,536 parcels.

Checked and clean:
- Every test-case parcel id and printed address I looked up is real on the stack: 5464983, 5179889, 5229356, 5334051, 5476455, 5456212, 5484745, 5485663, 5067128, 5514141, 5260587, 5191692, 5259138, 5438421, 5440777, 10640216, 5402856 and 5017163.
- The keys match the plan's fixtures: 679|QUEEN has 1 row, 100|QUEEN has 1, 6|GLENADEN has E and W, 123|YONGE has Blvd and St, 32|FULHAM has St and Dr, 78|ROBERT has 2 St, 2750|"CLAIR AVE" is St Clair Ave E, 14|"NORWOOD TER", and 383|ELM has only Elm Rd.
- I ran the plan's typeahead statement on the stack for these windows:
  - 383 EL% returns 5106944, 5461541 and 5191692, as case 14 says.
  - 12 ELM% returns 10 rows, with the four ids case 15 names.
  - 2760 YON% returns 5229356, and 14 NORWOOD% returns 5334051.
  - 123 YONGEE% returns no typeahead rows. The mistype case 18 therefore rests on the fuzzy read.
- The Gerrard window is real: 1 W row plus 9 E rows, 10 in all. 5440777 is "1 Gerrard St W", 10640216 is "1000 Gerrard St E" and 5402856 is "1001 Gerrard St E". The plan's UNVERIFIED "7 filler rows" can now be filled with real rows (see rc#5).
- The typedText pattern, run in memory, gives what the plan says:
  - "Unit 4, 123 Yonge St", "Apt 4B 12 Elm St", "Unit 4 123 Yonge St" and "#4 2760 Yonge St" are stripped to the address.
  - "Suite 12 Elm St" and "#12 Elm St" stay untouched.
  - "4-2760 Yonge St" is untouched, so only the dash fallback reaches it.
- No printed address in a shared-type window lacks a parsed type. Across the 5,095 number+street keys that carry two or more street types, 0 contain a row whose printed address prints no type the parser reads. So guardByType does act on all of them.
- Census facts match: inputs.tables is 7 and the field whitelist is 80 on the lookup row (.45), "9 tables" is at :22003, "6 table(s)" is at :22078, and 11 `!` in parcel-lookup.ts is the pin's count (the plan lists 11 sites). I found "24 fields" only in the generated registry, :1003. It is in the census data_story at :22003, where my grep missed it.
- The "~/Buildo-wt-board/docs/..." paths and the T5 expectations I could replay (cases 1-15 and 26-28) are consistent with the stored keys.

## rc#1 MED: the period strip regresses the 21 "St. Gaspar Crt" lots from an exact hit to a list or a miss
Plan: §5 "Period strip: if any stored street_name_normalized holds a '.' ... UNVERIFIED without the DB; nothing is built for it", and §3.B.1 "turns every `.` into a space". §8 also lists the period question as UNVERIFIED.
Evidence: the stack answers it.
- `select ... where street_name_normalized like '%.%'` returns one street key, `. GASPAR CRT`, on 21 parcels. Their linear_name_full is `St. Gaspar Crt`.
- address_points holds 54 rows with a period in linear_name_normalized (`. GASPAR CRT` 36, `. ANDRE DR` 17, `. ALAN HUTCHISON LANE` 1).
- In-memory run of parseLinearName's regex:
  - "St. Gaspar Crt" gives ". GASPAR CRT", the stored key. Today "21 St. Gaspar Crt" is an exact hit.
  - After the strip, "St  Gaspar Crt" gives "GASPAR CRT", which does not equal the key.
- The consumer route still reaches a list through the fuzzy read. levenshtein(normalize_address('. GASPAR CRT'), normalize_address('GASPAR CRT')) is 2, and the threshold logic variable is 2.
- The admin tool has no fuzzy read, so it goes from exact open to no_match.
- Today's "St. Clair Ave W" miss is the opposite case: the period is typed but the stored key has none. The plan fixes that case and breaks this one.
Fix: change §5 and §8 from UNVERIFIED to the measured fact: one street key (. GASPAR CRT, 21 lots), and the consumer path degrades to a list at distance 2. Then either accept this in a Spec 100 note, or add one bounded retry: on a full miss, re-run the exact read once with the unstripped typed key. This also answers plan-error-paths#4 and plan-plan-review-deepseek#2, which were deferred.

## rc#2 LOW: the 5,006 count is 5,095 on this stack
Plan: this is not in the plan file. It is the seat record's claim, which the plan relies on for AC #3 (SEAT-typed-addresses.md:60, "5,006 number+street keys have two or more street types").
Evidence: `group by addr_num_normalized, street_name_normalized having count(distinct street_type_normalized)>=2` returns 5,095. Restricting to digit-only numbers gives 5,094. Total distinct keys are 451,675. The seat sampled 451,436, so the stack has moved slightly.
Fix: if the plan or the Spec 100 note quotes 5,006, write "about 5,000 (5,095 on the test stack)" or drop the number.

## rc#3 MED: the plan's dash fallback is aimed at forms the data does not store
Plan: §3.B.6 "`^\d+-\d+[A-Z]?$` (2760-4) ... run the exact statement for each bare number"; §8 "whether any addr_num_normalized holds a dash (ruled: not needed)".
Evidence: the stack holds 1,215 parcels whose number has a dash, and 1,219 including letter forms. All 1,215 are ranges with the left number below the right (`select count(*) ... split_part(...,1)::bigint < split_part(...,2)::bigint` gives 1,215; left greater than right gives 0). The patterns are 9999-9999 (441), 999-999 (428), 99-99 (265) and so on. No unit-first stored form exists, so the plan's typed "2760-4" and "4-2760" never hit as stored. They only reach the bare-number fallback. A typed range such as "1000-1010 Elm" hits on the first exact read, before the fallback runs. Only 40 dash lots have a bare-left-number sibling on the same street.
Fix: add one sentence to §8 recording this, so nobody expects the dash fallback to match stored dash numbers. The "left of the dash is the house number" idea behind plan-plan-review-deepseek#5 is also unsupported: a stored range's right part is a different house number.

## rc#4 LOW: the letter-suffix fallback is mostly beside the point, and "NONE" numbers exist
Plan: §3.B.6 "`^\d+[A-Z]$` (2760A) ... bare numbers".
Evidence: 6,998 parcels store a plain letter suffix (`^\d+[A-Z]$`), so the typed "76A" form usually hits on the first exact read. Only the miss path needs the fallback. The sibling bare number exists for 4,127 of those lots. There are also 26,535 parcels whose addr_num_normalized is the literal "NONE", and 10,006 with an empty one. Those 10,006 are the same rows that print an empty address. Neither group is affected by the plan.
Fix: none needed. Optionally note in §8 that suffix numbers are stored, so the AC #4 "2760A" case lists only when the stored number is absent.

## rc#5 NIT: the real Gerrard window repeats parcel ids
Plan: §4 T1, "plus 7 filler E rows (ids E4 to E10 and their addresses invented)", with "Expected: text_candidates, 10 candidates".
Evidence: the real 10-row window has repeated parcel ids: 10640216 appears as "1000" and "1010 Gerrard St E", and 5400679 as "1012" and "1014". That is 8 distinct parcels in 10 rows. The real rows after the three the plan names, in printed order, are 1005 (5402735), 1007 (5402655), 101 (5436541), 1010 (10640216), 1011 (5402535), 1012 (5400679) and 1014 (5400679).
Fix: fill T1 from these real rows. This also closes plan-ux#4. Say that "10 candidates" means 10 rows, with ids repeated.

## rc#6 NIT: the 'ELM AVE' and 'NORWOOD TER' keys are not the typed street
Plan: §4 T5 case 28 and §5 "a type the parser does not list, such as Ter or Crcl".
Evidence: 12 Elm Grove Ave is stored with street_name_normalized 'ELM AVE', because the parser reads GROVE as the type and leaves AVE. 14 Norwood Ter is stored 'NORWOOD TER', since TER is not in the type list (only TERR is). So a typed "14 Norwood Ter" has no typed type, and the narrowing never acts. Case 28 ("unique") holds because there is one row. 51,353 parcels print no parseable type, 10,006 of them with an empty address.
Fix: none needed. For T5, case 28 only proves the one-row path, not the type guard.

Not on the stack or UNVERIFIED:
- Unit-first and dash cases (27a-c) were checked only against the fixture keys. Those parse paths run on mocks.
- Case 21's pin is a placeholder, as the plan says.
- I ran no test.

STATUS: 6 findings (0 CRITICAL, 0 HIGH, 2 MED, 2 LOW, 2 NIT); the data answers the plan's period and dash UNVERIFIED lines, and rc#1 is the one real change to decide before lock.
