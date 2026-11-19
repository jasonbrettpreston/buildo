---
id: doc-10
title: Increment 7 requirements
type: specification
created_date: '2026-11-19T04:56:00Z'
updated_date: '2026-11-19T04:56:00Z'
---
# Increment 7 requirements

Source: elements-by-inc.json, built.json (as of origin 154e7b13f), matrix-verified.json, current.json of the snapshot docs/reports/plan-import/raw/2026-11-19.

## Built state
The semi question page (R+26) is built on mobile; the semi renovation cards, the wall-distance input, and the semi-half disclosure are not built.
counts: {"BUILT":1,"BUILT-NO-DATA":0,"NOT BUILT":4}

- F-SEMI Semi question page (S-093): one-question LIST binding, lot-form read, route param carry: ON ORIGIN (origin/wf1/mb-rulings)

## Scenario
Semi-detached: renovation only (uses the renovation cards of increment 6; the "Semi-detached houseplex" future block belongs to no increment)

## Elements
| id | element | where | status | deliverers | built |
|---|---|---|---|---|---|
| R+26 | Semi question page: is this house one half of a semi-detached pair | main | ruled after the brief | MF-84 | BUILT |
| R+27 | Renovation cards on a semi half, with costs, on the semi envelope | main | ruled after the brief | 7.25 | NOT BUILT |
| R+28 | Wall-distance input, override control and assumption line (semi) | main | ruled after the brief | MF-89 7.25 | NOT BUILT |
| R+29 | Semi-half disclosure: sixplex possible under the by-law but not practical (no card, no cost) | details | ruled after the brief | 8.15a MF-90 | NOT BUILT |
| R+30 | Semi houseplex and garden-suite add-on on a semi | main | ruled after the brief |  | NOT BUILT |

## Scenarios (matrix-verified.json)
- Semi-detached renovation only (the renovation cards on a semi-detached lot): cards renovation_* with renovation class semi_detached_house; rows per category 0_lot=51 1_maxbuild=4 2_cost=1 3_images_side_above=15 4_coa_project=1 5_facts_header_image=16 6_details=2 7_search=46 suite_extra=0
