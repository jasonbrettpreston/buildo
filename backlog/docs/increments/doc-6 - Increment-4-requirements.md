---
id: doc-6
title: Increment 4 requirements
type: specification
created_date: '2026-11-19T04:56:00Z'
updated_date: '2026-11-19T04:56:00Z'
---
# Increment 4 requirements

Source: elements-by-inc.json, built.json (as of origin 154e7b13f), matrix-verified.json, current.json of the snapshot docs/reports/plan-import/raw/2026-11-19.

## Built state
Nothing is built for the secondary-suite card: report-page.json has no section for it.
counts: {"BUILT":0,"BUILT-NO-DATA":0,"NOT BUILT":18}


## Scenario
House with a secondary suite (Option 4 of the current report: the standard option card plus the Suite Size (up to) tile)

## Elements
| id | element | where | status | deliverers | built |
|---|---|---|---|---|---|
| SUM | Summary item at the top, one per option: smaller photo + option name + Max build estimate | main | NOT-BUILT | MF-83 GAP.1 | NOT BUILT |
| SUITE | Suite Size (up to) tile | main | NOT-BUILT | GAP.14 4.1 | NOT BUILT |
| PIC | Main picture (fixed image chosen by scenario and lot type) | main | NOT-BUILT (GAP.2 READY) | MF-38 GAP.1 GAP.2 | NOT BUILT |
| GAL | Concept photo gallery behind the main picture | main | NOT-BUILT (GAP.2 READY) | MF-83 MF-38 GAP.1 GAP.2 | NOT BUILT |
| VIEW-A | From above (drawn from the real lot) | main | NOT-BUILT, STORED-NOT-SERVED, CONTENT-STATIC | L.12 MB-109 X:MB109-rehearse MB-88 MF-83 GAP.3 | NOT BUILT |
| VIEW-S | From the side (fixed image per scenario, labels from data) | main | NOT-BUILT (GAP.2 READY) | MB-88 MF-83 GAP.1 GAP.2 GAP.3 | NOT BUILT |
| B1 | Option label on the picture (Option 4 card) | main | NOT-BUILT | GAP.4 |  |
| B2 | Option title on the picture (Option 4 card) | main | NOT-BOUND | MB-94 GAP.4 |  |
| B6 | Max build size tile (Option 4 card) | main | STORED-NOT-SERVED, NOT-BUILT | 1.3 MB-44 MB-38 L.5b GAP.4 |  |
| B7 | Cost to build tile (Option 4 card) | main | NOT-BUILT | 1.3 MB-44 MB-86 MB-94 MB-38 |  |
| B9 | Max build size details panel (opens from B6 "See details") (Option 4 card) | details | NOT-BUILT, STORED-NOT-SERVED, NOT-BOUND | 1.3 MB-44 6c.8a GAP.4 |  |
| B10 | Cost to build details panel (opens from B7 "See details") (Option 4 card) | details | NOT-BUILT | 1.3 MB-44 MB-86 GAP.4 |  |
| B11 | BY-LAW VARIANCES label (Option 4 card) | main | text |  |  |
| B12 | "Can you build bigger?" question (Option 4 card) | main | NOT-BUILT | 1.3 MB-44 MB-38 CO.S123 CO.2 CO.3 CO.6 MB-94 |  |
| B13 | How? panel (Option 4 card) | details | text |  |  |
| B14 | "Did the neighbours build bigger?" question (Option 4 card) | main | NOT-BUILT | 1.3 7.2a MF-71 GAP.7 |  |
| B15 | MOST RECENT row and the project mini cards (Option 4 card) | main | NOT-BOUND | 1.3 GAP.7 |  |
| B9.20 | Storeys below the main walls | details | NOT-BUILT | 1.3 MB-44 |  |
| B9.21 | Buildable width | details | NOT-BUILT | 1.3 MB-44 |  |
| B9.22 | By-laws that apply (29): chips and clause rows | details | NOT-BUILT | 1.3 MB-44 |  |
| B9.23 | Calculated date and by-law data version line (and Back to the report) | details | NOT-BUILT | GAP.4 |  |

## Scenarios (matrix-verified.json)
- House with a secondary suite: cards house_with_secondary_suite; rows per category 0_lot=51 1_maxbuild=31 2_cost=13 3_images_side_above=17 4_coa_project=9 5_facts_header_image=16 6_details=87 7_search=38 suite_extra=12
