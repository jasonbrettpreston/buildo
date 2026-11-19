---
id: doc-5
title: Increment 3 requirements
type: specification
created_date: '2026-11-19T04:56:00Z'
updated_date: '2026-11-19T04:56:00Z'
---
# Increment 3 requirements

Source: elements-by-inc.json, built.json (as of origin 154e7b13f), matrix-verified.json, current.json of the snapshot docs/reports/plan-import/raw/2026-11-19.

## Built state
The houseplex card o3 exists with the Max build tile, the Size per Unit tile and rows bound to gfa_max_m2, unit_area_m2, unit_count, houseplex_bedrooms and units_flat. Basement, roof, pitched roofs, height, cost and CoA parts are pending text. No Most space tag part and no neighbour block on o3.
counts: {"BUILT":13,"BUILT-NO-DATA":19,"NOT BUILT":5}

- F-HOUSEPLEX Houseplex option section o3 (detached_houseplex): Size per Unit tile, unit rows, basement/bedroom/roof rows, unit-size basis line: PARTLY: tiles and rows bound to declared fields; basement, roof, pitched-roof, height, cost and CoA parts pending

## Scenario
Detached houseplex (Option 3)

## Elements
| id | element | where | status | deliverers | built |
|---|---|---|---|---|---|
| SUM | Summary item at the top, one per option: smaller photo + option name + Max build estimate | main | NOT-BUILT | MF-83 GAP.1 | BUILT-NO-DATA |
| B3 | "Most space" tag (every option; a tie goes to the lowest option number) | main | NOT-BUILT | 3.4 GAP.11 | NOT BUILT |
| PIC | Main picture (fixed image chosen by scenario and lot type) | main | NOT-BUILT (GAP.2 READY) | MF-38 GAP.1 GAP.2 | BUILT-NO-DATA |
| GAL | Concept photo gallery behind the main picture | main | NOT-BUILT (GAP.2 READY) | MF-83 MF-38 GAP.1 GAP.2 | NOT BUILT |
| VIEW-A | From above (drawn from the real lot) | main | NOT-BUILT, STORED-NOT-SERVED, CONTENT-STATIC | L.12 MB-109 X:MB109-rehearse MB-88 MF-83 | BUILT-NO-DATA |
| VIEW-S | From the side (fixed image per scenario, labels from data) | main | NOT-BUILT (GAP.2 READY) | MB-88 MF-83 3.4 GAP.1 GAP.2 | NOT BUILT |
| B0 | Option card frame (one per visible option, fixed order) | main | text |  | BUILT |
| B1 | Option label on the picture | main | NOT-BUILT | GAP.4 | BUILT-NO-DATA |
| B2 | Option title on the picture | main | NOT-BOUND | MB-94 GAP.4 | BUILT-NO-DATA |
| B4 | Picture and its caption | main | not traced | MF-38 GAP.1 | BUILT-NO-DATA |
| B5 | BY-LAW SPECIFICATIONS label | main | text |  | BUILT |
| B6 | Max build size tile | main | STORED-NOT-SERVED, NOT-BUILT | 1.3 MB-44 MB-38 L.5b 3.4 GAP.4 | BUILT |
| B7 | Cost to build tile | main | NOT-BUILT | 1.3 MB-44 MB-86 MB-94 MB-38 | BUILT-NO-DATA |
| B8 | Av. size per unit (incl. basement) tile (houseplex only) | main | STORED-NOT-SERVED, NOT-BUILT | 1.3 MB-44 MB-38 L.5b 3.4 | BUILT |
| B9 | Max build size details panel (opens from B6 "See details") | details | NOT-BUILT, STORED-NOT-SERVED, NOT-BOUND | 1.3 MB-44 6c.8a 3.4 GAP.4 | BUILT |
| B9.1 | Max build size | details | STORED-NOT-SERVED | 1.3 MB-44 3.4 | BUILT |
| B9.2 | Storeys | details | STORED-NOT-SERVED | 1.3 MB-44 3.4 | BUILT |
| B9.3 | Height | details | NOT-BOUND | 1.3 MB-44 | BUILT-NO-DATA |
| B9.4 | Units (houseplex) | details | STORED-NOT-SERVED | 1.3 MB-44 3.4 | BUILT |
| B9.5 | Size per unit (houseplex) | details | STORED-NOT-SERVED | 1.3 MB-44 3.4 | BUILT |
| B9.6 | Basement (houseplex) | details | NOT-BOUND | 1.3 MB-44 3.4 | BUILT-NO-DATA |
| B9.7 | Bedrooms (houseplex) | details | STORED-NOT-SERVED | 1.3 MB-44 3.4 | BUILT |
| B9.8 | Roof (houseplex) | details | NOT-BUILT | 1.3 MB-44 3.4 3.2 | BUILT-NO-DATA |
| B9.9 | Units with a flat roof (houseplex) | details | STORED-NOT-SERVED | 1.3 MB-44 3.4 3.2 | BUILT |
| B9.10 | Units with a pitched roof (houseplex) | details | NOT-BOUND | 1.3 MB-44 3.4 3.2 | BUILT-NO-DATA |
| B10 | Cost to build details panel (opens from B7 "See details") | details | NOT-BUILT | 1.3 MB-44 MB-86 GAP.4 | BUILT-NO-DATA |
| B10.1 | Cost to build | details | NOT-BUILT | 1.3 MB-44 MB-86 MB-94 | BUILT-NO-DATA |
| B10.2 | Cost per sq ft | details | NOT-BUILT | 1.3 MB-44 MB-86 MB-94 | BUILT-NO-DATA |
| B10.3 | Area priced | details | NOT-BUILT | 1.3 MB-44 MB-86 MB-94 | BUILT-NO-DATA |
| B10.4 | Area based on | details | NOT-BUILT | 1.3 MB-44 MB-86 MB-94 | BUILT-NO-DATA |
| B10.5 | Confidence | details | NOT-BUILT | 1.3 MB-44 MB-86 MB-94 | BUILT-NO-DATA |
| B10.6 | Not included | details | text |  | BUILT-NO-DATA |
| B11 | BY-LAW VARIANCES label | main | text |  | BUILT |
| B12 | "Can you build bigger?" question | main | NOT-BUILT | 1.3 MB-44 MB-38 CO.S123 CO.2 CO.3 CO.6 MB-94 | BUILT-NO-DATA |
| R+19 | Houseplex See details line: size per unit includes the basement and the circulation share | details | ruled after the brief | MF-85 | BUILT |
| R+20 | Did the neighbours build bigger? for the houseplex (reach farther) with project cards | main | ruled after the brief | MF-71 7.2a GAP.7 | NOT BUILT |
| R+21 | Houseplex uncapped figure in Build bigger ("would need an FSI variance") | main | ruled after the brief | GAP.7 | NOT BUILT |
| B9.20 | Storeys below the main walls | details | NOT-BUILT | 1.3 MB-44 |  |
| B9.21 | Buildable width | details | NOT-BUILT | 1.3 MB-44 |  |
| B9.22 | By-laws that apply (29): chips and clause rows | details | NOT-BUILT | 1.3 MB-44 |  |
| B9.23 | Calculated date and by-law data version line (and Back to the report) | details | NOT-BUILT | GAP.4 |  |

## Scenarios (matrix-verified.json)
- Detached houseplex (2-4 units): cards o3; rows per category 0_lot=51 1_maxbuild=46 2_cost=30 3_images_side_above=30 4_coa_project=15 5_facts_header_image=22 6_details=93 7_search=38 suite_extra=0
