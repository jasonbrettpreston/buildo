---
id: doc-8
title: Increment 6 requirements
type: specification
created_date: '2026-11-19T04:56:00Z'
updated_date: '2026-11-19T04:56:00Z'
---
# Increment 6 requirements

Source: elements-by-inc.json, built.json (as of origin 154e7b13f), matrix-verified.json, current.json of the snapshot docs/reports/plan-import/raw/2026-11-19.

## Built state
Nothing is built for the renovation cards: report-page.json has no section for them (plan task R6-CARD is held).
counts: {"BUILT":0,"BUILT-NO-DATA":0,"NOT BUILT":53}


## Scenario
Renovation (Option 7 Renovation (Rear Addition) of the current report; the other renovation scenarios RE, RI, RB, RF have no separate drawing)

## Elements
| id | element | where | status | deliverers | built |
|---|---|---|---|---|---|
| SUM | Summary item at the top, one per option: smaller photo + option name + Max build estimate | main | NOT-BUILT | MF-83 GAP.1 | NOT BUILT |
| ADD | Addition Size (up to) tile | main | NOT-BUILT | R6-CARD | NOT BUILT |
| PIC | Main picture (fixed image chosen by scenario and lot type) | main | NOT-BUILT (GAP.2 READY) | MF-38 GAP.1 GAP.2 | NOT BUILT |
| GAL | Concept photo gallery behind the main picture | main | NOT-BUILT (GAP.2 READY) | MF-83 MF-38 GAP.1 GAP.2 | NOT BUILT |
| VIEW-A | From above (drawn from the real lot) | main | NOT-DESIGNED, NOT-BUILT, STORED-NOT-SERVED, CONTENT-STATIC | L.12 MB-109 X:MB109-rehearse MB-88 MF-83 | NOT BUILT |
| VIEW-S | From the side (fixed image per scenario, labels from data) | main | NOT-BUILT (GAP.2 READY) | MB-88 MF-83 GAP.1 GAP.2 | NOT BUILT |
| R+24 | Existing-house input on the renovation cards | main | ruled after the brief | R6-CARD 6c.7 MF-19 | NOT BUILT |
| R+25 | Owner question "lawfully existing" on the renovation card; unanswered = relief applies with disclosure | main | ruled after the brief | R6-CARD 6c.7 | NOT BUILT |
| REN | Renovation scenarios RA, RE, RI, RB, RF (one renovation option in the current report) | main | NOT-BUILT | R6-CARD R6-TEXT R6-COA 6c.8a R6-COST 6c.7 6c.6 |  |
| B1 | Option label on the picture (renovation card) | main | NOT-BUILT | GAP.4 |  |
| B2 | Option title on the picture (renovation card) | main | NOT-BOUND | MB-94 GAP.4 |  |
| B6 | Max build size tile (renovation card) | main | STORED-NOT-SERVED, NOT-BUILT | 1.3 MB-44 MB-38 L.5b GAP.4 |  |
| B7 | Cost to build tile (renovation card) | main | NOT-BUILT | 1.3 MB-44 MB-86 MB-94 MB-38 |  |
| FALL | Lot view fallback line for Options 5-7 | main | NOT-BUILT | MF-83 |  |

## Scenarios (matrix-verified.json)
- Renovations: addition RA, envelope expansion RE, interior RI, basement underpinning RB, basement finish RF: cards renovation_addition renovation_envelope_expansion renovation_interior renovation_basement renovation_basement_finish; rows per category 0_lot=51 1_maxbuild=14 2_cost=15 3_images_side_above=19 4_coa_project=11 5_facts_header_image=28 6_details=76 7_search=38 suite_extra=7
