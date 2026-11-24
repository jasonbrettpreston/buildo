Grounder: Cairn-Ground-Questions

READ-ONLY, UNVERIFIED: read and grepped only. I ran no tests, no database, nothing on a device. Paths are relative to /Users/brettpreston_macmini/Buildo-wt-board unless they start with ~. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. doc-2 = backlog/docs/increments/doc-2 - Increment-S-requirements.md. I numbered the lines in doc-2 myself.

## 2. Partial address (RR-0442 and RR-0443 c)
What the rulings and objectives say:
- RR-0443 c (MD:2285): "A partial address is handled like an address mistake: the person selects from the close addresses."
- RR-0442 (MD:2277): "the search opens a lot on an exact match. Address mistakes go through their own process."
- A.3 (doc-2:32): "Typeahead resolution of the typed text (street-prefix, up to 10)", marked BUILT.
- B.1 (doc-2:43): candidate list as radio cards, "nothing pre-checked, Select disabled until a pick".
- G.1 (doc-2:89): "Unique match goes straight to the report (no extra page)".
- B.5 (doc-2:47) covers several lots at one printed address, which goes to the map.
- Spec 100 §3.2 and the 2026-11-11 and 2026-11-19 notes (lines 103-107) describe only exact, typeahead and mistyped paths. Spec 100:62 says "else typeahead on the indexed normalized address_points columns". None of them says what a partial address that leaves exactly one lot should do.
- Code header mobile/src/lib/parcelSearchMatch.ts:12-13 (2026-09-16 ruling; I found no verbatim operator words): "beyond the cap, ask for a house number instead of listing". mobile/src/constants/parcelSearch.ts:20 repeats it.
- Phone: list.refine reads "More than 10 lots match. Add a house number to narrow it down." (mobile_parcel_search.content.json:8). It shows when 10 or more candidates come back (parcelSearchMatch.ts:212-214, :350).

Answers:
(a) Partial address, several lots:
- Agrees. A partial street with a number goes to the typeahead (src/lib/admin/parcel-lookup.ts:288-299, LIKE street%, number exact). Different printed addresses come back as text_candidates, the pick list (classifyRows :154-162; return at :314). The person picks, which matches RR-0443 c.
- Same printed address over several lots goes to the map (:156). That is the two-parcels rule of RR-0442.
- Differs only at the edge. The typeahead is cut at LIMIT 10 with no overflow check (:299). With a number the code says it measured 0 keys over 10.

(b) Partial address, exactly one lot:
- Differs. The typeahead returns one row and the resolver calls it unique, with matchType 'typeahead' (parcel-lookup.ts:304-311).
- lookup-flow.ts:43 and :62 then fetch the lot and build its page. The phone navigates straight to the lot with no list (parcelSearchMatch.ts:318, the screen's effect).
- The route can count it as a report (route.ts:105-107). Today it is not_produced, because the web switch is off.
- RR-0443 c says the person should select from close addresses, and RR-0442 opens only on an exact match. So this is a defect (seat finding ST1), not a question.
- Worst case: a street with a direction ("Gerrard St W") reads only the first 10 rows, and if one fits it opens that lot.
- On-device behaviour while typing is not verified.

(c) No house number:
- Differs from the 2026-09-16 ruling. parseFreeTextAddress gives num '' (:225-234). The exact path is skipped (:252). The typeahead runs with a NULL number (:294), ordered by address, LIMIT 10.
- One row opens that lot. Several rows come back as a list (classifyRows is called with num '' and returns text_candidates, :156 and :162). That list is the first 10 addresses alphabetically, not the "close" ones.
- The phone prints the refine line only when 10 or more come back. It lists them, where the ruling says "instead of listing".
- The "type a house number" message exists only for intersection-shaped queries ("A and B") on a no_match (parcelSearchMatch.ts:154-164, :189).
- This is already answered by the 2026-09-16 ruling plus RR-0443 c, so it is not a new question.

## 3. Every question
Legend: ANS = ANSWERED, NQ = NOT A QUESTION FOR HIM, OUT = OUTSIDE 1·B. RR-0192 (MD:819-820) means only database, frontend, UX and storage questions go to him; the rest is decided under the six-criteria rule.

| id | verdict | settling quote or reason |
|---|---|---|
| G2 D4 | NQ | Standard 5.1 (docs/specs/00_engineering_standards.md:100): "You MUST always import typed factories". Default is add the builders. Sizing belongs to the orchestrator (RR-0192). |
| G2 D5 | NQ | Std 5.2 (00_engineering_standards.md:108) mandates a real-database test for a migration touching constraints. A card later needs his GO, which is scheduling (RR-0192). |
| G2 Q1 | ANS | Spec 126:816: confidence "Shown beside each reading, never hidden." Built shows one weakest word per option (GROUNDER-B ux-p1#5). Defect against the spec. The report page is G.5, mostly another increment. |
| G4 S3 | NQ | Close-check tooling, not database, frontend, UX or storage (RR-0192). The conventional safe default is to narrow the skip and fail closed. |
| G4 T6 | NQ | Process template wording (RR-0192). The grounder's exemption note stands. |
| G3 V1 | ANS | Approved mock choose-lot.html:306 (operator 2026-11-11 "yes"): "Lot {letter} · {has the house \| no building} · {faces {street} \| at the back}". doc-2:59 C.7 has the same line. MD:776 only repeats it. Built (LotMapBinding.tsx:180-181) prints no "at the back", so it is unbuilt or defect. |
| G3 V2 | ANS | doc-2:48 B.6: "Try a nearby address or report it." Built text ends "Try a nearby address." (content.json:17). B.6 is marked BUILT but the wording differs. |
| G3 V3 | NQ | Conventional default: the screen-reader name contains the visible text. WCAG 2.2 was already audited (Spec 126:867). |
| G3 V5 | NQ | Spec 99:525-548, the section 6.5 rule: never gate on isFetching. An exception needs three stated conditions. Default is fix in code. |
| G3 N1 | ANS | MD:1494: "yes follow the rules register them." Spec 135 FE-47 (:69) and Spec 126:189: "All tunables are data; zero thresholds in src/". Built has the typed numbers (route.ts:58-59, parcelSearch.ts:22, :28). Timing is the orchestrator's. Task 434 is the handbook checks, not a tunables lock. |
| G3 N3 | ANS | Std 5.2 (:108): security tests are "Mandated when: Auth-guarded / externally-reachable surfaces". No parcel security test file exists. Unbuilt. |
| G3 N4 | NQ | Document note. Spec 99 amendments by dated note have precedent (Spec 99:541). |
| G3 Q1 | ANS | Same as N1. |
| G3 Q2 | skipped | Outside 1·B by his ruling. |
| G3 Q3 | ANS | Same as N3. |
| G3 Q4 | NQ | Same as V5 and N4. |
| G3 Q5 | OPEN | See OPEN 4. |
| G3 Q6 | ANS | doc-2:49 B.7: "Get help with an address (to /help?topic=wrong-lot)". Mock help.html:366 lists the topic "Wrong address or lot". Built uses address_match and lot_match (LotMapBinding.tsx:97, :115, :238; SearchBinding.tsx:208). Task 343 item 7 calls that "an orchestrator reading", not his. Unbuilt. |
| G3 Q7 | NQ | Task 393 (PAGE.SEARCH-W, LATER) draws the web search page. The Daylight standard is already ruled (milestone Deliverable; R-D1). Which task is not his call (RR-0192). Web is off (RR-0170). |
| G3 Q8 | ANS | Operator "Mock approved. Looks good!" (task-319 note, RR-0309). The approved mock reads "Yes, it's one half of a semi" (~/Buildo-scratch/lanes-20261119/inc1b/semi2/semi-question.html). Built matches (semi content.json:4). Curly versus straight apostrophe is a cosmetic default (v8 check demands curly). |
| G3 Q9 | ANS | Spec 100:116, "1 b 2 a": a hit with no evaluated option is served free ("meter: not_evaluated"). Spec 100:127 keeps it and adds that the page must be produced. Built matches (route.ts:105). |
| G3 Q10 | OUT | Lot-size entry. Spec 126:903 (8): the flip waits on MB-42 and MB-89, and the switch is off. |
| G3 Q11 | NQ | Stripe detail with billing off. RR-0192. |
| G3 Q12 | NQ | Spec 100:59 chose the 60/min bucket on purpose. Spec 100:132 sets debounce at 400 ms or more. The server already caps q at 120 (types.ts:42). Registering the limits follows FE-47. |
| G3 Q13 | NQ | He ruled "register them" (MD:1494). The bounds are engineering envelopes (RR-0192). |
| G3 Q14 | ANS | Std 1.3 (00_engineering_standards.md:24): primary buttons "must use Reanimated withSpring"; critical transitions need a haptic. Built uses colour only. Defect against the standard. |
| G3 Q15 | ANS | Spec 78:722 O-12 (RULED, operator 2026-10-18): a user's entry replaces the estimate "only for that user". Spec 78:1032: "O-12 unchanged". fe.19 (handbook :88) is the lot-size entry only. Built holds the semi answer as a route param (Spec 100:104). |
| G3 Q16 | NQ | Test strictness, FE-36 and FE-51. RR-0192. |
| G3 Q17 | ANS | Spec 100:125 (C5), "4 a", RR-0322, MD:1399: when the web switch flips, numbers go to every paying user at once. The gate is the entitlement plus MAXBLD_WEB_LIVE, with no PostHog flag (RR-0271). Built matches. |
| G3 Q18 | NQ | Spec 100:62 chose to reuse the resolver. The whitelist plus the .strict() parse is the spec'd design. The deviation entry is a doc detail. |
| G3 Q19 | NQ | All three parts are document housekeeping. The shim says "Delete this block when ... returns a resolution type" (parcelSearchMatch.ts:199-201), and it now does. |
| H Q1 | ANS | Spec 126:995 (2): "A part whose value is absent is left out by the one value rule keepValued". Built matches. |
| H Q2 | ANS | Approved mocks: help.html:366 "MaxBLD home → /; Log in → /login"; terms-privacy.html:262 header. Built is footer-only (GROUNDER-H p11#2). Defect against the mock. |
| H Q3 | NQ | Keep it simple, no scope creep (milestone Project objectives). Default is the as-built silent log. |
| H Q4 | NQ | Conventional default is a link home, as every v8 page has. |
| H Q5 | OPEN | See OPEN 2. |
| H Q6 | NQ | doc-2:65 C.13 lists one error state. A second line is scope creep. |
| H Q7 | NQ | A documented, test-pinned limitation (parcelSearchMatch.ts:62-65). The alternative would refuse real streets such as Markham. Default is accept. |
| H Q8 | OUT | doc-2:76 D.10 "Semi override applied in the report", NOT BUILT, deliverer 7.25. RR-0182 (MD:796): "semi calculation stays in Increment 7". |
| H Q9 | OUT | Old permit detail route. He said "that has nothing to do with what we are doing". |
| Seat S1 | OPEN | See OPEN 1. |
| Seat S2 | NQ | Admin panel wording. Default is label the settings truthfully. RR-0192. |
| Seat S3 | OPEN | See OPEN 3. |
| Seat S4 | NQ | A protected-list edit runs as one card through a lane (RR-0419, MD:2150). Process, so RR-0192. |
| Seat S5 | ANS | MD:1116: "if the mass data determines there is a house or structure we should use it ... reliable to say something is there". The nearest-match link quality is pipeline data. |

## 4. OPEN questions, most important for a customer first

OPEN 1 (S1): the phone screen when someone has used all their reports for the month.
- Question: when a phone user hits the monthly limit, should the screen only say "Your plan is managed on the web" with a Tracked Lots button and the reset date, or also offer top-up and upgrade buttons?
- Options: (A) phone shows the limit, the reset date, "Your plan is managed on the web" and "Go to Tracked Lots", while the web page carries "Raise your limit" and "Upgrade to Pro". (B) phone also shows top-up and upgrade buttons.
- Deciding fact: RR-0443 a (MD:2285) wants "a top-up or a higher subscription" screen. The approved mock report-limit.html:316 gives the web top-up and upgrade and the phone only the managed-on-web line, with no "See plans" and with the reset date. Ruling "a" of 2026-11-11 (no-plan.html:292, App Store 3.1.1) keeps buying web-only on the phone. open-questions.md:945 and :1056 read that ruling in opposite ways. No limit screen exists at all today: the phone gets a generic "Forbidden" (apiClient.ts:49-63).
- Recommend A, citing report-limit.html:316 and no-plan.html:292. It satisfies RR-0443 a on the web, and shows the reset date, which is already served.

OPEN 2 (H-Q5): the "no plan" page and a sign-up link.
- Question: should the signed-in-no-plan page in the app carry a way to sign up, or stay link-free for the App Store?
- Options: (A) as drawn, "Your plan is managed on the web", no link (no-plan.html:292). (B) add a sign-up link, which RR-0312 asked for.
- Deciding fact: MD:1216, "it needs to an error page that inludes a way to sign up". The approved page has no link because of App Store 3.1.1. The orchestrator logged it as undecided (MD:1247). Task 357 waits (LATER). The semi page without a plan has no next step today.
- Recommend A for the app, with sign-up on the web, citing no-plan.html:292 and the "a" ruling. RR-0312 reads as met by the web route. This conflict is on record, not mine to settle.

OPEN 3 (S3): lot cards with an absurd area.
- Question: on the choose-your-lot cards, should a lot area outside 50 m² to 5,000 m² show "Not yet evaluated" instead of the number?
- Deciding fact: ONE-13 a (MD:738) says "lots under 50 m2 or over 5,000 m2 show Not yet evaluated". The setting is described for the report projection (logic_variables.json:8197). Whether it reaches the map card is not stated. Two lots hold 123,456,789 m² (consumer-lookup.ts:227; LotMapBinding.tsx:194).
- Recommend yes, using the same pinned setting and the ruled words "Not yet evaluated" (not "not available"), per ONE-13 a and fe.39 (handbook :148).

OPEN 4 (G3 Q5): neighbour lots on the several-lots map.
- Question: on the choose-your-lot map, should neighbouring lots be drawn faintly, as the approved design shows?
- Deciding fact: the approved mock draws neighbour lots (choose-lot.html:268, :306, "neighbouring lots in zinc") and doc-2:55 C.3 says "neighbours in zinc". But the MF-53 decision, answered "1. yes" (DECISIONS-v3.md:20-37, Spec 100:103), dropped neighbours on the several-lots outcome as Stitch-only. The server sends them only for no-lot-linked (lot-map.ts:7-9). The phone draws none. B.8 removed them from the unlinked state.
- Recommend follow the approved design (draw them), citing doc-2 C.3 and the mock. It needs a server read for several-lots. If he prefers no neighbours, reword C.3.

## 5. Objectives marked BUILT that the code does not have
- G.6 (doc-2:94) "report limit page when exhausted": no limit page on phone or web. Only a 403 REPORT_LIMIT_REACHED from the server, shown as a generic error or lapsed message (apiClient.ts:49-63).
- C.3 (doc-2:55) "neighbours in zinc": the phone draws none.
- B.6 (doc-2:48): the built text lacks "or report it" (content.json:17).
- B.7 (doc-2:49): the link topic wrong-lot is not built; address_match and lot_match are used.
- C.9 (doc-2:61), removed by design: the screen-reader label still reads frontage and zoning (content.json:10 lot.label).
- G.1 (doc-2:89): "unique match" also fires for a partial-address single hit (see section 2 b).
- Reverse case: C.12 (doc-2:64) says NOT BUILT, but a help link exists (LotMapBinding.tsx:115). C.7 (doc-2:59) says NOT BUILT, but is partly built.

## 6. Counts (44 rows judged; G3 Q2 skipped by his ruling; G3 Q20 counted as its nine H rows)
- ANSWERED 16
- NOT A QUESTION FOR HIM 21
- OUTSIDE 1·B 3 (G3 Q10, H Q8, H Q9)
- OPEN 4
- UNVERIFIED: all code behaviour is read from source, not run. The 2026-09-16 ruling's operator words are quoted only from code comments and plan files.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/admin/parcel-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchMatch.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/parcels/lookup-flow.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/LotMapBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/backlog/docs/increments/doc-2 - Increment-S-requirements.md
