---
id: doc-2
title: Increment S requirements
type: specification
created_date: '2026-11-19T04:56:00Z'
updated_date: '2026-11-24T16:58:00Z'
---
# Increment S requirements

Source: elements-by-inc.json, built.json (as of origin 154e7b13f), matrix-verified.json, current.json of the snapshot docs/reports/plan-import/raw/2026-11-19.

## Built state
The search pages are built on mobile (search page, choose-your-lot map page, semi question page) and in part on web (the web search page is built but sends no lookup while the live switch is false). The lookup route, resolver, meter and the report hand-off contract are on origin. Not built: direction and unit parsing (plan 1.4), the reports-left line, the candidate locality line, the clear button, the intersection map, web choose-your-parcel, the web footer, building footprints and street names on the map, the help link on the map page. All of it is the old dark look (zinc and #0e0e10), not Daylight.
counts: {"BUILT":42,"BUILT-NO-DATA":7,"NOT BUILT":16}

- F-SEARCH-MOBILE Mobile parcel search page: SEARCH binding (props), search screen, recent searches, match logic: ON ORIGIN (origin/wf1/mb-rulings); queue: phone check and device run OWED, UNVERIFIED on device
- F-SEARCH-WEB Web search page (W4): the one web SEARCH binding, SearchPageClient mount, live switch: PARTLY: page built, controls disabled and no lookup request while MAXBLD_WEB_LIVE is false
- F-LOTMAP Choose-your-lot map page (S-071): LIST binding with map projection, lot cards, states: ON ORIGIN (origin/wf1/mb-rulings); queue Status DONE
- F-LOOKUP-RESOLVER Lookup resolver: address parse, exact match on parcels normalized keys, typeahead on address_points, classification: ON ORIGIN (origin/wf1/mb-rulings)
- F-SHELL Product shelf and parcel-tool screens: ParcelShelf (Lookup, Tracked Lots, Account), tracked.tsx and account.tsx (example rows): PARTLY: shelf built; tracked and account are stubs
- F-LANDING MaxBLD web landing (web_landing) with the footer legal line, and the MaxBLD post-login target: ON ORIGIN (origin/wf1/mb-rulings)
- F-ADMIN-LOOKUP Admin Parcel Cost Model Tool (admin search over the same resolver) and SearchPermitsSheet (lead-gen permit search): ON ORIGIN (origin/wf1/mb-rulings)

## Scenario
Search first: the current search pages = latest rendering small-pages-v8 ("MaxBLD Small Pages" https://claude.ai/artifact/8KLUsAtd4JN6r2j8CxZSU7, 2026-11-12) + later rulings; built status from the 2026-11-17 sweep (search-delta/CURRENT-SEARCH.md, 176 quotes PASS)

## Elements
| id | element | where | status | deliverers | built |
|---|---|---|---|---|---|
| A.1 | A Search page · Brand block: MaxBLD wordmark with the tagline Lot Intelligence, centred; hidden h1 Search a Toronto lot (no Lookup title) | details | AVAILABLE | GAP.13 | BUILT |
| A.2 | A Search page · Search box: one pill, placeholder Enter lot address, search icon | main | AVAILABLE |  | BUILT |
| A.3 | A Search page · Typeahead resolution of the typed text (street-prefix, up to 10) | main | AVAILABLE |  | BUILT |
| A.4 | A Search page · Typed street direction (E/W/N/S) kept in the match | details | NOT-BUILT (parser) | 1.4 | NOT BUILT |
| A.5 | A Search page · Unit number typed after the address | details | NOT-BUILT | 1.4 | NOT BUILT |
| A.6 | A Search page · Reports-left line under the box: 6 of 10 reports left until 9 Dec 2026 | details | NOT-BOUND · MISSED by the sweep | SRCH.A6 LS.12 LS.3 | NOT BUILT |
| A.7 | A Search page · Recent searches: up to 3 chips under the box (label Recent), each routes to /lookup?q= | details | AVAILABLE |  | BUILT |
| A.8 | A Search page · Searching state: query in the box, the word Searching, clear button | details | AVAILABLE |  | BUILT |
| A.9 | A Search page · Outside Toronto state: Lots are only available in Toronto. | details | AVAILABLE |  | BUILT |
| A.10 | A Search page · Legal line: This is an estimate, not 100% accurate. Not legal advice. Confirm with a lot survey and the City. | details | AVAILABLE | LS.6 | BUILT |
| A.11 | A Search page · Clear (x) button inside the box | details | NOT TRACED · MISSED by the sweep | GAP.13 | NOT BUILT |
| A.12 | A Search page · Bottom tab bar: Lookup, Tracked Lots, Account (app) | details | AVAILABLE · MISSED by the sweep | MF-49 | BUILT |
| A.13 | A Search page · In-bar Account button (MF-35 builds it amber) | details | AVAILABLE · REMOVED by the design |  | BUILT |
| B.1 | B Address confusion · Candidate list (text_candidates): radio cards, the differing word amber, nothing pre-checked, Select disabled until a pick | main | AVAILABLE |  | BUILT |
| B.2 | B Address confusion · Select button after the pick (Select, Open the selected lot) | main | AVAILABLE |  | BUILT |
| B.3 | B Address confusion · Candidate row area line (locality, e.g. Downtown Toronto) | details | NOT-BOUND · REMOVED by the design |  | NOT BUILT |
| B.4 | B Address confusion · Needs-more-info notice: That looks like an intersection. Type a house number to see the lots. | main | AVAILABLE |  | BUILT |
| B.5 | B Address confusion · Needs-more-info notice: Many lots at this address. This address has many lots. Add a unit number or pick a nearby address. | main | AVAILABLE |  | BUILT |
| B.6 | B Address confusion · Gentle error: No lot linked yet. We found {address}, but the City data does not link it to a lot yet. Try a nearby address or report it. | main | AVAILABLE |  | BUILT |
| B.7 | B Address confusion · Link: Get help with an address (to /help?topic=wrong-lot) under every notice; report it inside the no-lot message | details | SERVED-NOT-POPULATED | SRCH.C12 LS.12 LS.6 | BUILT-NO-DATA |
| B.8 | B Address confusion · Faint tappable neighbour outlines on the unlinked state | details | AVAILABLE · REMOVED by the design |  | BUILT |
| B.9 | B Address confusion · No-match state: No parcel found for that address. | details | AVAILABLE |  | BUILT |
| B.10 | B Address confusion · Intersection on the map (corner lots at the centreline node) | details | NOT-BUILT · REMOVED by the design | LS.11 | NOT BUILT |
| C.1 | C Lot confusion (lot map) · Heading: This address covers 2 lots. Which one do you mean? | main | NOT TRACED · MISSED by the sweep | GAP.13 | NOT BUILT |
| C.2 | C Lot confusion (lot map) · Search pill on top (clear returns to search); hidden h1 Choose your lot | details | NOT TRACED · MISSED by the sweep | MF-53 | BUILT |
| C.3 | C Lot confusion (lot map) · Map: each matched lot outlined (amber), neighbours in zinc | main | AVAILABLE |  | BUILT |
| C.4 | C Lot confusion (lot map) · Lettered lot markers (A, B) at the lot centroid; chosen lot filled amber | main | AVAILABLE |  | BUILT |
| C.5 | C Lot confusion (lot map) · Building footprint on each lot (or none), drawn on the map | main | NOT TRACED · MISSED by the sweep | GAP.13 | NOT BUILT |
| C.6 | C Lot confusion (lot map) · Address pin and the street name drawn on the road (Dunmore Lane) | details | AVAILABLE · MISSED by the sweep | GAP.13 | BUILT |
| C.7 | C Lot confusion (lot map) · Lot card line: Lot A · has the house · faces Dunmore Lane; Lot B · no building · at the back | main | UNDESIGNED-DATA · MISSED by the sweep | GAP.13 | NOT BUILT |
| C.8 | C Lot confusion (lot map) · Lot card size line: 1,614 sq ft · 150 m² | main | AVAILABLE |  | BUILT |
| C.9 | C Lot confusion (lot map) · Lot card frontage and zoning string (7.6m • CR 2.5 style) | details | AVAILABLE · REMOVED by the design |  | BUILT |
| C.10 | C Lot confusion (lot map) · Selection shared by map tap and card (radiogroup Choose a lot) | main | NOT TRACED · MISSED by the sweep | GAP.13 | BUILT |
| C.11 | C Lot confusion (lot map) · Button: Choose a lot (disabled) then Continue with Lot A; hint Pick a lot on the map or in the list. | main | AVAILABLE |  | BUILT |
| C.12 | C Lot confusion (lot map) · Link: Not sure which lot? Get help with an address | details | NOT-BOUND | SRCH.C12 LS.12 LS.6 | NOT BUILT |
| C.13 | C Lot confusion (lot map) · Loading, error, rate-limit, entitlement, schema-drift states of the map page | details | AVAILABLE |  | BUILT |
| C.14 | C Lot confusion (lot map) · Routing: one printed address over two or more lots opens this page (shown only then) | main | AVAILABLE |  | BUILT |
| D.1 | D Semi question page · Page shown only when the lot is unsure (before the report) | main | AVAILABLE |  | BUILT |
| D.2 | D Semi question page · Lot form on the lookup hit (detected, basis, unsure) | details | AVAILABLE |  | BUILT |
| D.3 | D Semi question page · Question: Is this house one half of a semi-detached pair? | main | AVAILABLE |  | BUILT |
| D.4 | D Semi question page · Three answers: Yes, it is one half of a semi; No, it is detached; Not sure | main | AVAILABLE |  | BUILT |
| D.5 | D Semi question page · Continue button (Choose an answer when none picked; Open the report with this answer) | main | AVAILABLE |  | BUILT |
| D.6 | D Semi question page · Back to search link | details | AVAILABLE |  | BUILT |
| D.7 | D Semi question page · Question-page states: loading, error, rate limit, entitlement, schema drift | details | AVAILABLE |  | BUILT |
| D.8 | D Semi question page · Owner answer stored (a reopened lot does not ask again) | main | BOUND-NOT-STORED | GAP.12 | BUILT-NO-DATA |
| D.9 | D Semi question page · Input: distance from your wall to the shared line, with an assumed default and an assumption line | main | NOT-BUILT | SRCH.SEMI MF-89 7.25 GAP.12 | NOT BUILT |
| D.10 | D Semi question page · Semi override applied in the report | main | NOT-BUILT | SRCH.SEMI 7.25 | NOT BUILT |
| D.11 | D Semi question page · Evidence columns linked_parcel_count, best_shared_len_m | details | STORED-NOT-SERVED |  | BUILT-NO-DATA |
| E.1 | E Web search pages · W4 web search page: the same parts under the web top bar (Lookup, Tracked Lots, Account) | main | SERVED-NOT-POPULATED | LS.12 1.3 | BUILT-NO-DATA |
| E.2 | E Web search pages · Web footer: legal line, Terms of Service, Privacy Policy, Help and Support, copyright | details | AVAILABLE · MISSED by the sweep | MF-44 MF-46 | NOT BUILT |
| E.3 | E Web search pages · W5 choose your parcel on the web, address list (text_candidates) | main | SERVED-NOT-POPULATED | LS.12 | NOT BUILT |
| E.4 | E Web search pages · W5 on the web for several lots, no lot linked and intersection (map) | main | NOT-BUILT | LS.11 | NOT BUILT |
| E.5 | E Web search pages · W6 web report route /parcel-tool/{lot} | main | NOT-BUILT | LS.12 1.3 MB-44 | BUILT-NO-DATA |
| E.6 | E Web search pages · Recent-search chips on the web frame | details | NOT TRACED · MISSED by the sweep | LS.11 | NOT BUILT |
| F.1 | F Landing (search entry and sample) · Hero call to action: Start free trial (to /signup); no search box on the landing page | main | NOT-BUILT | MF-76 | BUILT |
| F.2 | F Landing (search entry and sample) · How it works step 1: Enter a Toronto address (Just the street address), a search-pill picture with a sample address | details | NOT TRACED · MISSED by the sweep | MF-76 | BUILT |
| F.3 | F Landing (search entry and sample) · Sample frame: the processing demo ends in the sample report inside the frame; no View report button, nothing navigates | main | NOT TRACED · MISSED by the sweep | LS.7 | BUILT |
| F.4 | F Landing (search entry and sample) · Landing legal line | details | AVAILABLE | LS.6 | BUILT |
| F.5 | F Landing (search entry and sample) · After login the user lands on the search page (never the dashboard) | details | AVAILABLE |  | BUILT |
| G.1 | G Hand-off to the report · Unique match goes straight to the report (no extra page) | main | AVAILABLE |  | BUILT |
| G.2 | G Hand-off to the report · Processing screen after the lot is known: address in the bar, lot outline draws, each check resolves into its ruled fact (What we checked) | main | NOT TRACED · MISSED by the sweep | 1.3 MF-62 | BUILT-NO-DATA |
| G.3 | G Hand-off to the report · Ready line: The Building Possibilities Report for {address} is ready., then the report opens (app by itself; web View report button) | main | NOT TRACED · MISSED by the sweep | MF-62 | BUILT |
| G.4 | G Hand-off to the report · Skip control during the animation | details | NOT TRACED · MISSED by the sweep | MF-62 | BUILT |
| G.5 | G Hand-off to the report · Report page for the lot on a hit | main | NOT-BUILT | MB-44 1.3 | BUILT-NO-DATA |
| G.6 | G Hand-off to the report · Report meter: a hit counts one report; report limit page when exhausted | details | AVAILABLE | LS.12 | BUILT |

## Search pages today (search-delta/current.json)
| page | id | element | status | tasks |
|---|---|---|---|---|
| A Search page | A.1 | Brand block: MaxBLD wordmark with the tagline Lot Intelligence, centred; hidden h1 Search a Toronto lot (no Lookup title) | AVAILABLE | NO TASK |
| A Search page | A.2 | Search box: one pill, placeholder Enter lot address, search icon | AVAILABLE | NO TASK |
| A Search page | A.3 | Typeahead resolution of the typed text (street-prefix, up to 10) | AVAILABLE | NO TASK |
| A Search page | A.4 | Typed street direction (E/W/N/S) kept in the match | AVAILABLE | 1.4 |
| A Search page | A.5 | Unit number typed after the address | NOT-BUILT | 1.4 |
| A Search page | A.6 | Reports-left line under the box: 6 of 10 reports left until 9 Dec 2026 | NOT-BOUND | SRCH.A6 |
| A Search page | A.7 | Recent searches: up to 3 chips under the box (label Recent), each routes to /lookup?q= | AVAILABLE | NO TASK |
| A Search page | A.8 | Searching state: query in the box, the word Searching, clear button | AVAILABLE | NO TASK |
| A Search page | A.9 | Outside Toronto state: Lots are only available in Toronto. | AVAILABLE | NO TASK |
| A Search page | A.10 | Legal line: This is an estimate, not 100% accurate. Not legal advice. Confirm with a lot survey and the City. | AVAILABLE | LS.6 |
| A Search page | A.11 | Clear (x) button inside the box | NOT TRACED | NO TASK |
| A Search page | A.12 | Bottom tab bar: Lookup, Tracked Lots, Account (app) | AVAILABLE | NO TASK |
| A Search page | A.13 | In-bar Account button (MF-35 builds it amber) | AVAILABLE | NO TASK |
| B Address confusion | B.1 | Candidate list (text_candidates): radio cards, the differing word amber, nothing pre-checked, Select disabled until a pick | AVAILABLE | NO TASK |
| B Address confusion | B.2 | Select button after the pick (Select, Open the selected lot) | AVAILABLE | NO TASK |
| B Address confusion | B.3 | Candidate row area line (locality, e.g. Downtown Toronto) | NOT-BOUND | NO TASK |
| B Address confusion | B.4 | Needs-more-info notice: That looks like an intersection. Type a house number to see the lots. | AVAILABLE | NO TASK |
| B Address confusion | B.5 | Needs-more-info notice: Many lots at this address. This address has many lots. Add a unit number or pick a nearby address. | AVAILABLE | NO TASK |
| B Address confusion | B.6 | Gentle error: No lot linked yet. We found {address}, but the City data does not link it to a lot yet. Try a nearby address or report it. | AVAILABLE | NO TASK |
| B Address confusion | B.7 | Link: Get help with an address (to /help?topic=wrong-lot) under every notice; report it inside the no-lot message | SERVED-NOT-POPULATED | SRCH.C12 |
| B Address confusion | B.8 | Faint tappable neighbour outlines on the unlinked state | AVAILABLE | NO TASK |
| B Address confusion | B.9 | No-match state: No parcel found for that address. | AVAILABLE | NO TASK |
| B Address confusion | B.10 | Intersection on the map (corner lots at the centreline node) | NOT-BUILT | LS.11 |
| C Lot confusion (lot map) | C.1 | Heading: This address covers 2 lots. Which one do you mean? | NOT TRACED | NO TASK |
| C Lot confusion (lot map) | C.2 | Search pill on top (clear returns to search); hidden h1 Choose your lot | NOT TRACED | NO TASK |
| C Lot confusion (lot map) | C.3 | Map: each matched lot outlined (amber), neighbours in zinc | AVAILABLE | NO TASK |
| C Lot confusion (lot map) | C.4 | Lettered lot markers (A, B) at the lot centroid; chosen lot filled amber | AVAILABLE | NO TASK |
| C Lot confusion (lot map) | C.5 | Building footprint on each lot (or none), drawn on the map | NOT TRACED | NO TASK |
| C Lot confusion (lot map) | C.6 | Address pin and the street name drawn on the road (Dunmore Lane) | AVAILABLE | NO TASK |
| C Lot confusion (lot map) | C.7 | Lot card line: Lot A · has the house · faces Dunmore Lane; Lot B · no building · at the back | UNDESIGNED-DATA | NO TASK |
| C Lot confusion (lot map) | C.8 | Lot card size line: 1,614 sq ft · 150 m² | AVAILABLE | NO TASK |
| C Lot confusion (lot map) | C.9 | Lot card frontage and zoning string (7.6m • CR 2.5 style) | AVAILABLE | NO TASK |
| C Lot confusion (lot map) | C.10 | Selection shared by map tap and card (radiogroup Choose a lot) | NOT TRACED | NO TASK |
| C Lot confusion (lot map) | C.11 | Button: Choose a lot (disabled) then Continue with Lot A; hint Pick a lot on the map or in the list. | AVAILABLE | NO TASK |
| C Lot confusion (lot map) | C.12 | Link: Not sure which lot? Get help with an address | NOT-BOUND | SRCH.C12 |
| C Lot confusion (lot map) | C.13 | Loading, error, rate-limit, entitlement, schema-drift states of the map page | AVAILABLE | NO TASK |
| C Lot confusion (lot map) | C.14 | Routing: one printed address over two or more lots opens this page (shown only then) | AVAILABLE | NO TASK |
| D Semi question page | D.1 | Page shown only when the lot is unsure (before the report) | AVAILABLE | NO TASK |
| D Semi question page | D.2 | Lot form on the lookup hit (detected, basis, unsure) | AVAILABLE | NO TASK |
| D Semi question page | D.3 | Question: Is this house one half of a semi-detached pair? | AVAILABLE | NO TASK |
| D Semi question page | D.4 | Three answers: Yes, it is one half of a semi; No, it is detached; Not sure | AVAILABLE | NO TASK |
| D Semi question page | D.5 | Continue button (Choose an answer when none picked; Open the report with this answer) | AVAILABLE | NO TASK |
| D Semi question page | D.6 | Back to search link | AVAILABLE | NO TASK |
| D Semi question page | D.7 | Question-page states: loading, error, rate limit, entitlement, schema drift | AVAILABLE | NO TASK |
| D Semi question page | D.8 | Owner answer stored (a reopened lot does not ask again) | BOUND-NOT-STORED | NO TASK |
| D Semi question page | D.9 | Input: distance from your wall to the shared line, with an assumed default and an assumption line | NOT-BUILT | SRCH.SEMI |
| D Semi question page | D.10 | Semi override applied in the report | NOT-BUILT | SRCH.SEMI 7.25 |
| D Semi question page | D.11 | Evidence columns linked_parcel_count, best_shared_len_m | STORED-NOT-SERVED | NO TASK |
| E Web search pages | E.1 | W4 web search page: the same parts under the web top bar (Lookup, Tracked Lots, Account) | SERVED-NOT-POPULATED | LS.12 |
| E Web search pages | E.2 | Web footer: legal line, Terms of Service, Privacy Policy, Help and Support, copyright | AVAILABLE | NO TASK |
| E Web search pages | E.3 | W5 choose your parcel on the web, address list (text_candidates) | SERVED-NOT-POPULATED | LS.12 |
| E Web search pages | E.4 | W5 on the web for several lots, no lot linked and intersection (map) | NOT-BUILT | LS.11 |
| E Web search pages | E.5 | W6 web report route /parcel-tool/{lot} | NOT-BUILT | LS.12 1.3 |
| E Web search pages | E.6 | Recent-search chips on the web frame | NOT TRACED | NO TASK |
| F Landing (search entry and sample) | F.1 | Hero call to action: Start free trial (to /signup); no search box on the landing page | NOT-BUILT | NO TASK |
| F Landing (search entry and sample) | F.2 | How it works step 1: Enter a Toronto address (Just the street address), a search-pill picture with a sample address | NOT TRACED | NO TASK |
| F Landing (search entry and sample) | F.3 | Sample frame: the processing demo ends in the sample report inside the frame; no View report button, nothing navigates | NOT TRACED | LS.7 |
| F Landing (search entry and sample) | F.4 | Landing legal line | AVAILABLE | LS.6 |
| F Landing (search entry and sample) | F.5 | After login the user lands on the search page (never the dashboard) | AVAILABLE | NO TASK |
| G Hand-off to the report | G.1 | Unique match goes straight to the report (no extra page) | AVAILABLE | NO TASK |
| G Hand-off to the report | G.2 | Processing screen after the lot is known: address in the bar, lot outline draws, each check resolves into its ruled fact (What we checked) | NOT TRACED | 1.3 |
| G Hand-off to the report | G.3 | Ready line: The Building Possibilities Report for {address} is ready., then the report opens (app by itself; web View report button) | NOT TRACED | NO TASK |
| G Hand-off to the report | G.4 | Skip control during the animation | NOT TRACED | NO TASK |
| G Hand-off to the report | G.5 | Report page for the lot on a hit | NOT-BUILT | MB-44 1.3 |
| G Hand-off to the report | G.6 | Report meter: a hit counts one report; report limit page when exhausted | AVAILABLE | LS.12 |

## Dated notes

Dated notes 2026-11-24 (M-246, prior text kept; task-451 SEARCHFIX.3, lane BL-SFX3; the table rows above are unchanged):
- C.3: the map draws no neighbour lots. Operator RR-0446, verbatim: "04  leave it as it is" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302); ruled at MORNING-DECISIONS.md:2303: "the several-lots map stays as built (no neighbour lots); objective C.3's text is corrected". The C.3 words "neighbours in zinc" no longer describe the page.
- C.7: the status NOT BUILT is wrong. The card lead was built by task-336 (SRCH.LOTCARD); task-451 adds "at the back" for a lot with no fronting street (FOLD-PLAN.md:57), so the card reads "Lot A · has the house · faces Dunmore Lane" and "Lot B · no building · at the back" as the row says. Status: BUILT.
- C.12: the status NOT BUILT is wrong. The link "Not sure which lot? Get help with an address" was built by task-321 (SRCH.C12; mobile/src/components/surfaces/LotMapBinding.tsx, the help row under the cards). Status: BUILT; task-451 points it at the topic wrong-lot.
- B.6 and B.7: the no-lot message now ends "Try a nearby address or report it.", with "report it" an inline link to Help & Support, topic wrong-lot; every "Get help with an address" link takes the topic wrong-lot (the Help page has it since task-450).
- C.9: the card's screen-reader label no longer reads the facts. Frontage and zoning are still sent by the lookup (the map field whitelist) but are no longer shown or spoken; the label is the card's visible text (lead line and area). An implausible lot size (outside LOT_SIZE_PLAUSIBLE_M2) is sent as a null area and reads "Not available" (RR-0444, MORNING-DECISIONS.md:2290-2291).
