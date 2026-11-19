# REPORT.md: BL-W, task-123 (1.3 MB-44 W), stage 1
Head 35ecc0dda, branch wf1/inc1b-w. Full detail: PLAN.md, IMPACT.md, TRIAGE.md, r1-plan.txt (repo copy docs/reports/lanes/2026-11-19/BL-W/).

## Six plain lines for the operator
1. W is one function, readCustomerPageResponse(parcelRef) (src/lib/parcels/report-page.ts:23-26, an empty slot returning null today); stage 2 fills it to read a lot's stored results and give the lookup route the page data, or a miss (null).
2. Today it reads two tables that exist: parcel_maxbld_scenarios (golden 25 plus the 1,921-lot cohort) and bylaw_resolution_lot_stamps; the record table is not built and stays unbuilt.
3. One caller (the lookup route, route.ts:133); the mobile report page gets it through the route; the web report page and LOAD.1 come later.
4. Size: GUESS about 25 files, 2 days; four commits after a prereg (move, red tests, green landing).
5. Not built now: record write, stamp check on the record, web report render, tester gate, What-we-checked wiring (gap Q9 is not ruled), any new switch, table or migration; and no customer sees any number until the web live switch flips.
6. Decisions owed: four drafts D1 to D4 below.

## Definition of W
`readCustomerPageResponse(parcelRef: string): Promise<Json | null>`; first statement `if (!MAXBLD_WEB_LIVE) return null` (no read); else one shared read of parcels, stamp, scenario rows (same SQL and projection as the admin preview, moved to src/lib/report-projection/ so lock L1 stays true), miss (null) on verdict not_stored or out_of_date, page for current or gated; reads no user, writes nothing, meters nothing; scope is enforced by the route (session, plan check, rate limit, meter).

## Consumers
| Caller | State |
|---|---|
| Lookup route route.ts:133 | wired, signature unchanged |
| Mobile report page ([parcelId].tsx) | wired through the route |
| Web report page (page.tsx:15-18) | not built (D3); owner LS.12 / L.7 |
| LOAD.1 (task-266) | reads W first; null means compute |
| Meter openReport route.ts:167 | unchanged, runs only when page is not null |
| Admin preview | uses the shared read after share-out |

## Impact map summary
Nine --check scripts green on the head (one report-only FAIL set already present: report-fields RF-2,4,6,7,9). Moves predicted: 3 files moved, 4 test files edited, 1 pin reversed on purpose (parcels-lookup-page.logic.test.ts:186-191), src-sql-ledger.json, consumer-registry.json (13 rows), 7 spec consumer lines, descriptor data_story 7 to 9 tables with registry and census, system map. No migration, seed, switch row or DB job. Gates: MB-44 status line (WAITS MB-38, expires today), mcbylaws frontend arms H/C/P (an MF id and MF panel record owed), prereg-MB-44-k owed; nothing claimed here.

## Stage-2 plan (size GUESS: about 25 files, 2 days; not measured)
1 prereg alone; 2 share-out (git mv, extract readStoredPage), green to green; 3 red tests T1-T10 (red.out); 4 green landing with W, descriptor, notes, OUTPUT review record, lane report. Rollback section and owed live checks in PLAN.md 4a.

## Decision drafts
D1 who sees numbers before launch (rec: MAXBLD_WEB_LIVE the one gate; part f unchanged). D2 no-record lot: miss vs Not yet evaluated page (rec: miss; R-2 premise changed by policy v2). D3 web render now or at launch (rec: at launch). D4 What-we-checked wiring, gap Q9 (rec: rule yes, give it to LOAD.2 task-267). All Recommendation status UNVERIFIED (review r1 did not rule on them).

## Review
r1 deepseek-reasoner: 26 findings, verdict FAIL on structure; triaged in TRIAGE.md: 15 KEPT/folded or carried, 11 REJECTED with file:line.

## Other
Task milestone moved m-3 to m-1 through the CLI with the dated note (coordinator request). backlog doctor last line: "No duplicate IDs, self-referential dependencies, or dependency cycles found."

## UNVERIFIED
cohort rows current vs CURRENT_SEED_SHAS; stamp table populated; lot_gate value list; CURRENT_SEED_SHAS tied to compute; who renews MB-44 expiry today; RR-0298 text not found; MF id the gate accepts; prereg directory validators; whether Q9 has an answer outside the files searched (orchestrator re-greps); all four decision recommendations; entitlement read route reader (task-320).
