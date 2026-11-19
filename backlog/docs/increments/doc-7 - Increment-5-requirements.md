---
id: doc-7
title: Increment 5 requirements
type: specification
created_date: '2026-11-19T04:56:00Z'
updated_date: '2026-11-19T04:56:00Z'
---
# Increment 5 requirements

Source: elements-by-inc.json, built.json (as of origin 154e7b13f), matrix-verified.json, current.json of the snapshot docs/reports/plan-import/raw/2026-11-19.

## Built state
Nothing is built for the garden-suite or rear-suite cards: report-page.json has no section for them.
counts: {"BUILT":0,"BUILT-NO-DATA":0,"NOT BUILT":36}


## Scenario
Garden suite add-on (Option 5 of the current report: the ruled face of four tiles, MORNING-DECISIONS.md:235)

## Elements
| id | element | where | status | deliverers | built |
|---|---|---|---|---|---|
| SUM | Summary item at the top, one per option: smaller photo + option name + Max build estimate | main | NOT-BUILT | MF-83 GAP.1 | NOT BUILT |
| GS-HS | House: Max Build Size | main | NOT-BUILT | 5.3 5.5 | NOT BUILT |
| GS-HC | House: Cost to Build | main | NOT-BUILT | 5.6 | NOT BUILT |
| GS-SS | Garden suite: Max Build Size | main | NOT-BUILT | 5.3 5.5 | NOT BUILT |
| GS-SC | Garden suite: Cost to Build | main | NOT-BUILT | 5.6 | NOT BUILT |
| RULING | Garden-suite card face: House Max Build Size + Cost to Build; Garden suite Max Build Size + Cost to Build (gain not on the face) | main | NOT-BOUND, NOT-BUILT | 1.3 MB-44 MB-38 L.5b 5.1 5.3 5.5 | NOT BUILT |
| PIC | Main picture (fixed image chosen by scenario and lot type) | main | NOT-BUILT (GAP.2 READY) | MF-38 GAP.1 GAP.2 | NOT BUILT |
| GAL | Concept photo gallery behind the main picture | main | NOT-BUILT (GAP.2 READY) | MF-83 MF-38 GAP.1 GAP.2 | NOT BUILT |
| VIEW-A | From above (drawn from the real lot) | main | NOT-BOUND, NOT-BUILT, STORED-NOT-SERVED, CONTENT-STATIC | 5.3 L.12 MB-109 X:MB109-rehearse MB-88 MF-83 GAP.3 | NOT BUILT |
| VIEW-S | From the side (fixed image per scenario, labels from data) | main | NOT-BUILT (GAP.2 READY) | MB-88 MF-83 GAP.1 GAP.2 GAP.3 | NOT BUILT |
| R+22 | See details sentence on a lower option: "Adds a home, X m2 less floor area in total" | details | ruled after the brief | 5.5 | NOT BUILT |
| R+23 | Laneway suite as its own scenario card (title, one line, low confidence, no numbers) | main | ruled after the brief | MF-85 | NOT BUILT |
| B1 | Option label on the picture (Option 5 card) | main | NOT-BUILT | GAP.4 |  |
| B2 | Option title on the picture (Option 5 card) | main | NOT-BOUND | MB-94 GAP.4 |  |
| B11 | BY-LAW VARIANCES label (Option 5 card) | main | text |  |  |
| B12 | "Can you build bigger?" question (Option 5 card) | main | NOT-BUILT | 1.3 MB-44 MB-38 CO.S123 CO.2 CO.3 CO.6 MB-94 |  |
| B14 | "Did the neighbours build bigger?" question (Option 5 card) | main | NOT-BUILT | 1.3 7.2a MF-71 GAP.7 |  |
| B15 | MOST RECENT row and the project mini cards (Option 5 card) | main | NOT-BOUND | 1.3 GAP.7 |  |
| FALL | Lot view fallback line for Options 5-7 | main | NOT-BUILT | MF-83 |  |

## Scenarios (matrix-verified.json)
- Garden suite / rear-suite add-on on detached house and detached houseplex (laneway disclosed only): cards detached_house_garden_suite detached_houseplex_garden_suite; rows per category 0_lot=51 1_maxbuild=8 2_cost=13 3_images_side_above=16 4_coa_project=12 5_facts_header_image=20 6_details=34 7_search=38 suite_extra=45
