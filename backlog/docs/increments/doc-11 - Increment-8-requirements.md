---
id: doc-11
title: Increment 8 requirements
type: specification
created_date: '2026-11-19T04:56:00Z'
updated_date: '2026-11-19T04:56:00Z'
---
# Increment 8 requirements

Source: elements-by-inc.json, built.json (as of origin 154e7b13f), matrix-verified.json, current.json of the snapshot docs/reports/plan-import/raw/2026-11-19.

## Built state
Nothing is built for the sixplex route badge, the CoA-only card or the off-overlay wording (MF-88 and MF-90 wait for the increment 8 build).
counts: {"BUILT":0,"BUILT-NO-DATA":0,"NOT BUILT":3}


## Scenario
Sixplex: detached houseplex with 5-6 units (uses the houseplex card of increment 3 plus the route field; no own design)

## Elements
| id | element | where | status | deliverers | built |
|---|---|---|---|---|---|
| R+31 | Route badge "CoA approval only" in the card header beside the confidence badge | main | ruled after the brief | 8.35 | NOT BUILT |
| R+32 | CoA-only sixplex card has no as-of-right headline; figure shows in the CoA tier only | main | ruled after the brief | 8.35 | NOT BUILT |
| R+33 | Off-overlay variant wording selected by the permission result | details | ruled after the brief | 8.34 | NOT BUILT |

## Scenarios (matrix-verified.json)
- Sixplex = detached houseplex, 5-6 units (route field): cards o3 (houseplex card at 5-6 units); rows per category 0_lot=51 1_maxbuild=6 2_cost=1 3_images_side_above=16 4_coa_project=1 5_facts_header_image=14 6_details=1 7_search=38 suite_extra=0
