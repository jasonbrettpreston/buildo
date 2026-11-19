# REPORT: BL-W2, task-123 (1.3 MB-44 W, the customer-scoped report read module), stage 2 build
Date 2026-11-19. Worktree ~/Buildo-wt-w2, branch wf1/inc1b-w2. No push, no DB, no history rewrite.

## Six plain lines for the operator
1. W (`readCustomerPageResponse`, src/lib/parcels/report-page.ts) now reads a lot's stored results and hands the lookup route the page, or answers null (a miss) when there is no current stored result.
2. With the web live switch (MAXBLD_WEB_LIVE) off, which it is, W reads no lot data and returns null, so every customer still sees the same miss as before; with it on, a current or gated lot gets its page and a missing or stale record is a miss (a thrown query is a 500, never a miss).
3. It reads `parcels`, `bylaw_resolution_lot_stamps` and `parcel_maxbld_scenarios` through one shared read (src/lib/report-projection/read-stored.ts), the same SQL and projection as the admin preview, shared out so the admin preview is not imported (lock L1 unchanged).
4. The lookup route (route.ts:133) is the one caller, the mobile report reaches it through the route, and LOAD.1 will read the null as "compute"; proof per consumer row below.
5. Not built: the record write (ST.P1), the stamp check on the record (ST.P2: the verdict does not look at the settings sha), the web report render, the tester gate (MB-94 part f), What-we-checked wiring, any new switch, table, migration or DB job.
6. Unproven: nothing was run against a database; the four live read-only checks of PLAN.md 4a are owed (cohort rows carry the current seed shas, the stamp table is populated, the gate values, the compute writes what CURRENT_SEED_SHAS expects), and the customer problem "report returns nothing" stays open until LS.12 flips the switch.

## Commits (all through the real hooks, none bypassed)
- a3a625fbb prereg-MB-44-1.json alone (round 197), plus the task file and context file.
- a5c0f1946 share-out, green to green: 3 git mv to src/lib/report-projection/, new read-stored.ts, stored-page.ts calls it; admin preview goldens did not move (report-capture and report-page-capture --check clean in checks.out, AFTER-COMMIT-2).
- Red attempt (no landed commit, RR-0225): customer-report-read test plus the parcels-lookup-page pin edit, refused by the related run: red.out ("Tests 16 failed | 37 passed"; first attempt red-attempt1.out, 17 failed).
- 25dbc7581 green landing: W, tests T1 to T10 plus T5b (118 related tests passed in the hook, commit4.out), descriptor data_story (census contracts.json, then emitted), Spec 100 dated note, MB-44 and MF-48 dated notes, MB-44 status line renewed, MF-48 panel record addendum, OUTPUT review r2 and TRIAGE.
- The plan's commit 3 (red) cannot land red, so the tests land in 25dbc7581; one further docs commit copies this report into the repo (rule 19).

## Ids and owners (no id invented)
- Prereg: round 197 claimed by mkdir ~/Buildo-scratch/ids/round-197 (owner file names this lane). prereg k = 1 for MB-44 (no earlier prereg-MB-44-*).
- MB-44 row (.cursor/MCBYLAWS-QUEUE.md:777-778) owns W; trailer for it not needed (the prereg commit cites no id; the other commits touch no layer 2/3 path).
- Surface paths (src/tests/surfaces/*, the lookup descriptor census): owner MF-48 (row text: "the lookup's nullable `page` ... null for every lot until MB-44"; its panel record docs/reports/panels/MF-48.json and prereg-MF-48-3 exist). First attempt without a trailer gave the exact lines: `FAIL:C:no-mf-task` and `FAIL:P:no-record` (commit2-try2.out). Candidates considered: MF-48 (used), MF-45 (lookup route, DONE), MF-73 (admin preview wiring, LATER, owns the producer dir), MF-74 (lot route mount). If the operator prefers another owner, only the trailer and the two dated notes move.
- The lane claim of ~/Buildo-scratch/ids was refused (lane BL-SEMI2 holds it); the round was taken by atomic mkdir as the ledger README says: UNVERIFIED whether the orchestrator wants that claim re-registered.

## Proof per consumer row (PLAN.md section 2)
| Caller | Proof |
|---|---|
| Lookup route | route.ts:133 unchanged; T7 runs the real route over the real W: current lot sends a page equal to mobilePageView(expected), stale lot sends `page: null`, switch off sends null with no lot-table read, a thrown read is a 500 (customer-report-read.logic.test.ts, 118 passed in commit4.out) |
| Mobile report page | no mobile file changed; parcels-lookup-page and parcel-lookup-gate suites green in the hook run (related) |
| Web report page | NOT built (D3); maxbld-web-pages tripwire untouched (MAXBLD_WEB_LIVE still the literal false, maxbld-web.ts:19) |
| LOAD.1 (task-266) | W's null is the compute signal; T2 and T3 pin it for no record and stale |
| Meter openReport | T7 source pin: route meters only when `body.page === null` is not true |
| Footer, load-failure page, loading screen | follow LOAD.1, no W work |
| Admin preview | stored-page.ts edited once; 88 admin tests green after the share-out (commit2-try3.out); T9 shows W and the admin preview return the same page for the same scripted lot |

## Checks (file-only, before and after; checks.out has every line)
BEFORE: all 15 exit 0 (report-fields shows the pre-existing "gates FAIL (report-only): RF-2, RF-4, RF-6, RF-7, RF-9", unchanged after). AFTER commit 2 and after commit 4: all 15 exit 0 including surface-validate, emit-mobile-surfaces, generate-surface-registry, consumer-registry, generate-target-files, system map, src-sql-ledger, report-schema, seed-report-v2, report-capture ("checked 72 goldens; 0 stale"), report-page-capture ("page goldens current"). `npm run typecheck` clean.
Regenerated by their own scripts: src-sql-ledger.json, consumer-registry.json, six spec consumer lines (target-files), surface census then descriptor then 127-surface-registry.md.
Hook tails: commit.out.

## Review (one lens, DeepSeek r2): r2-output.txt, TRIAGE.md
No defect KEPT for a code fix; T5b added. Carried limits: settings sha and evaluator version are not in the freshness verdict (MB-93 logic moved unchanged; ST.P2 task-272); the read is four statements (ST.P1/ST.P2); live checks 1 to 4.

## Shared files touched (for the orchestrator's fold order)
scripts/steps/_schema/consumer-registry.json, src-sql-ledger.json; scripts/surfaces/_schema/census/contracts.json and the lookup descriptor (BL-SEMI2 may also move the consumer registry and the lookup flag in route.ts: route.ts NOT touched by this lane); docs/reports/generated/127-surface-registry.md; docs/specs/01-pipeline 55, 59, 61, 62, 65, 67, 78 (consumer lines); docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (one dated note); .cursor/MCBYLAWS-QUEUE.md (MB-44 status and note), .cursor/MCFRONTEND-QUEUE.md (MF-48 note); docs/reports/panels/MF-48.json; the task-123 file and its context file. A rebase conflict with BL-R16 in the task file: keep both sides.

## Where the D2 branch is
src/lib/parcels/report-page.ts, function `pageForVerdict`, case `'not_stored'` (marked `// D2`): `return null` today; to show the "Not yet evaluated" page for a lot with no record, change that one branch to `return stored.response as unknown as Json`.

## UNVERIFIED
- Live checks (1) to (4) of PLAN.md 4a (no DB).
- Whether the hex stamp table_version equals what the compute writes into layer2_table_version (migrations/295:98 vs migrations/309:38): same text type, same format is not proven.
- Whether the orchestrator accepts MF-48 as the MF owner and the ids lane-claim note above.
- (gate.mjs: PASSED, line below.)

STATUS: ready

GATE PASS (BL-W2): outputs exist (REPORT.md, red.out, checks.out, commit.out, r2-output.txt, TRIAGE.md); scope: 63 changed since snapshot; 63 in scope; 0 attributed to other lanes; 0 unexplained
