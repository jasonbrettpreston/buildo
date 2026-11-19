# PLAN.md: BL-PROOF, task-68 (PROOF.TOOL), STAGE 1: the measured minimum plan for slice S (2026-11-19; review round r1 folded, see TRIAGE.md)

Ticket: task-68 (RR-0306, MORNING-DECISIONS.md:1178, operator, verbatim: "I would agree"; RR-0300, RR-0303 recorded on the task). Worktree ~/Buildo-wt-proof, branch wf2/inc1b-proof, head 8e0742142 when measured. Principles served: observable, simple (PLAN-PROTOCOL.md:3: no scope creep).
No tool code was written. Every measured line below was run read-only in this worktree (no DB, no suite runner).

## 1. What PROOF.S asks for (task-268 text, read whole)
task-268 (backlog/tasks/task-268 - PROOF.S ...) says: the search pages and the pick-to-report hand-off on a real lot (typed address, candidate list, lot map, semi question, loading screen from the search pick, the report opens). Pass criteria:
(a) the scenario page rendered for the 25 golden lots on the test stack through the admin/tester route, one screenshot per lot;
(b) every main and See-details element shows a number or the exact word "Not yet evaluated";
(c) every number equals the McProof key;
(d) storage proof: opened once is stored with its stamp, a stale stamp is recomputed, no record for an unopened lot;
(e) compliance rows AUTO-PASS, REVIEWED-PASS or GAP (Airtight V3 / Spec 132, Spec 126/128, McStorage v2, key match, design fit, hooks plus full suite on the current tip). "GAP not accepted by the operator means not DONE."
task-268 depends on 68 (this tool), 12, 69, 267, 317, 318, 319, 320, 321, 322 (its 1·B validation note). Estimate there: GUESS 0.5 day.

## 2. The needs table (measured; file:line)
Runs-today column: "yes" = ran in this worktree on 2026-11-19 with the output shown; "no" = cannot run today, reason given.

| # | Proof (slice S) | Exists already, where | Runs today? | In the minimum tool? |
|---|---|---|---|---|
| 1 | Search page, candidates, lot map, semi page, their states: one golden per state per target are the declared and generated truth | surface-validate.mjs arms (scripts/surfaces/surface-validate.mjs:38-43 GEN, GOLDEN, PARITY, BIND, STATUS; screen-checks.mjs:409 DESC, SCREEN, SBIND). Measured: "S-golden ok (18 states x 4; owed 13 states / 52 files) ... S-screen ok (17 surfaces, 98 goldens) · S-sbind ok (17 surfaces, 424 strings)" in 0.45 s. Run by the suite (src/tests/surfaces/surface-validate.infra.test.ts:16); surface-validate.mjs is in no hook (grep of .husky/* finds no match; .husky/pre-commit:42 runs report-schema.mjs --check only). Reading the S-golden count: "owed 13 states / 52 files" is the REPORT manifest (src/tests/fixtures/surfaces/report/states.json: owed_states 13, owed_files 52), not the three search surfaces; their coverage is the S-screen arm (screen-checks.mjs:409: every state covered, nothing stray), so row 1 proves "no drift, every declared state has its golden", not report completeness | yes | yes: one command row |
| 2 | Search goldens equal what the binding renders (10 states) | scripts/surfaces/search-golden-capture.ts --check. Measured: "search goldens ok (10)". No caller anywhere (WIRING.md, BL-LOOSE: "NOT called by hook/suite/station") | yes (node_modules/.bin/tsx, no DB) | yes |
| 3 | Lot map goldens (11 states) | lotmap-golden-capture.ts --check. Measured: "lotmap goldens ok (11)". No caller | yes | yes |
| 4 | Semi question goldens (8 states) | semi-question-golden-capture.ts --check. Measured: "semi-question goldens ok (8)". No caller | yes | yes |
| 5 | The three pages behave (search miss/ambiguous routes, map choose and continue, semi answer then report) and Daylight look pinned in goldens | mobile/__tests__ parcelScreens.golden, lotMapScreens.golden, semiQuestionScreens.golden, daylightSearchPages.golden, parcelSearchScreen.behaviour, lotMapPage.behaviour, semiQuestionPage.behaviour (7 files, listed by ls). Not run by the hook, not run by the push station (station.sh steps: step-validate, spec-split, typecheck, root suite only; station.sh:43-46); mobile-ci.yml runs `npm run test:ci` in CI (workflow paths/branches filter: UNVERIFIED which pushes trigger it) | UNVERIFIED (the jest runner was not called: lane rule 18); time unmeasured | yes, one row, flagged: the only row whose cost is unmeasured; stage 2 measures it first and, if over 120 s, it becomes opt-in (`--with-mobile`) |
| 6 | Server routing of the address cases (two lots -> map, mis-typed -> candidates, unlinked -> map, possible semi -> report route, plain -> report) | src/tests/search-routing.logic.test.ts (SRCH.ROUTE, 12 cases from :97 on), parcel-lookup-resolution.logic.test.ts, search-parser-guard.logic.test.ts, consumer-parcel-lookup*.test.ts. DB is mocked in these (search-routing header :9-14) | not called by me (suite runner); they run on every push at the station (station.sh:46 root suite) | no: "a check the suite already runs on every push is already proof" (brief). The tool lists these files as evidence of the suite row |
| 7 | Report has no client maths (MF-16) | src/tests/surfaces/report-no-maths.logic.test.ts (AST scan of the projection directories) | suite only | no (suite row names it) |
| 8 | Hooks plus full suite on the current tip | push station pass file ~/Buildo-scratch/push-station/pass/<sha>.pass (station.sh:49 format: RESULT: PASS, tip, sha) | the operator or orchestrator runs the station; I did not | yes: one row that READS the pass file for HEAD (never runs the suite) and prints the covered test files (rows 6, 7, 9, 10) from the data row; no pass file = GAP, so those four are never silently unproven |
| 9 | Airtight V3 / Spec 132 compliance | .husky/pre-commit chain (gate, step-validate --staged --fast, red-evidence, compute-purity, schema-homes, score-floor; build-approach REPORT.md section 5.1 table) on every commit | at commit | no: a landed commit already passed them (row text says so) |
| 10 | Spec 126/128 compliance | rows 1-4, 7 above | see above | covered by rows 1-4 |
| 11 | CHK.3 nothing-new, CHK.5 McStorage | scripts/analysis/policy-checks.mjs --all. Measured: "WAITS CHK.5 chk5_tables is empty ... POLICY CHECKS OK (all): 2976 file(s)" (policy-config.json:10 chk5_tables is []) | yes (0.11 s) | yes: CHK.3 PASS, CHK.5 printed as NOT BUILT (WAITS), per the existing output |
| 12 | Design fit (RS-12) | none: task-67 LATER, task-345 LATER (no design-elements file). RR-0306: "I would agree" | no | yes, as a fixed NOT BUILT row (task-345 then task-67) |
| 13 | The 1.6 harness (C-1 measured check) | NO CODE EXISTS: task-206 is status MERGED, "merged-into: draft-15"; grep of scripts, src/tests, docs/specs for L3b finds only src/tests/src-sql-ledger.logic.test.ts (a mention). draft-15 not opened (UNVERIFIED what it holds) | no | no: nothing to call; listed in later stages |
| 14 | Loading screen from the search pick (LOAD.1 start compute at pick, LOAD.2 button only when report AND See details loaded) | LOAD.1 task-266, LOAD.2 task-267 both LATER; MF-62 animation exists (G.3, G.4 BUILT; G.2 BUILT-NO-DATA, doc-2). The "does the button wait for the load" behaviour is the unbuilt part | no: needs 266, 267 (and 1.3 W task-123), and a device or browser | yes, NOT BUILT row, unblocked by 266, 267 |
| 15 | Load-failure page | LOAD.4 task-317 LATER | no | yes, NOT BUILT row, unblocked by 317 |
| 16 | The report opens for the lot (hand-off ends at the report) | customer read returns null for every lot: src/lib/parcels/report-page.ts:23-26 readCustomerPageResponse; web route notFound() while MAXBLD_WEB_LIVE false (WIRING.md); task-123 (1.3 W) LATER | no | yes, NOT BUILT row, unblocked by 123 |
| 17 | (a) screenshot per lot of the scenario page, 25 golden lots | Admin preview shows 12 synthetic golden states (src/app/admin/report-preview/goldens.ts, page.tsx:5 "Not stored lot data"); the live stored-lot reader exists (src/lib/admin/report-preview-live/stored-page.ts, MB-93, reads parcel_maxbld_scenarios through to_regclass, header :11-13) | no: needs a browser, the test stack DB (operator-GO job, rehearsed per memory rehearse-db-jobs-and-id-ledger) and stored lot rows (1.3 W / ST.P1 task-265) | no: LATER stage 3 |
| 18 | (b) every element is a number or "Not yet evaluated" on a real lot | on synthetic goldens: report-honest*.logic.test.ts (suite). On a live lot: nothing | goldens in suite yes; live no | no: LATER stage 3 (needs 17) |
| 19 | (c) every number equals the McProof key | NOTHING exists (build-approach REPORT.md section 5.1: "no automatic answer-key match"). Slice S pages carry no computed number except the lot size line C.8 | no | no: LATER stage 4 (needs 123 and a key file) |
| 20 | (d) storage probes: opened once, stale stamp, no unopened-lot record | CHK.5 static check is WAITS (row 11); the opened-lot record table is unnamed; ST.P1 task-265 LATER; a measured query needs the test stack | no (DB, and no table) | no: LATER stage 5 (needs 265 and the table's migration) |
| 21 | Semi calculation | task-319 stage 2 WAITS; 7.25 later increment (ruling MORNING-DECISIONS.md:796) | no | no: outside slice S |

Facts measured today, all green: surface-validate (rows 1), the three golden --check runs (2-4), policy-checks --all (11). Also run: report-page-capture.ts --check ("page goldens current (40 and the landing sample)") and report-capture.ts --check ("checked 72 goldens; 0 stale"): REPORT checks, not slice S pages; they stay out of the S table.

## 3. What cannot run today, and why
- Database: proofs 17 (live lots), 20 (storage probes), and the live half of 6 (parcel-lookup against real rows; scripts/analysis/lot-map-data-check.mjs live run is rehearsal-stack only, :9-12). A test-stack run is an operator-GO job and must be rehearsed with the repo's DB-job path (memory rehearse-db-jobs-and-id-ledger; Spec 137 rule 9). The minimum tool needs none.
- Device or browser: screenshots (17), the loading animation timing (14), Daylight look on device (WIRING.md "Unproven: browser/device render of Daylight"). The minimum tool needs none.
- 1.3 W (task-123, LATER): rows 16, 17, 18, 19. report-page.ts:23-26 returns null.
- LOAD.1/LOAD.2 (tasks 266, 267, LATER) and LOAD.4 (317): rows 14, 15.
- Design fit: row 12, printed as not built (RR-0306).
- Mobile jest (row 5): not run by me; unmeasured.

## 4. The minimum tool
One runner, `node scripts/surfaces/proof-slice.mjs --slice S --out <dir> [--suite-pass <file>] [--with-mobile]`, driven by one data file (`scripts/surfaces/proof-slices.json`: slice key `S`, then a list of rows; each row has an id matching ^[a-z0-9-]{1,40}$ and is `argv` (an array, run with spawnSync, no shell), `suite` (a pass-file read plus `suite_files`) or `notbuilt` (with `blockedBy: [task ids]`)). It CALLS what exists (rows 1-5, 8, 11), READS the station pass file (row 8), and prints NOT BUILT rows with the unblocking task (12, 14-16, and the later-stage proofs 17-20 as one line each). Output: one table, columns row | proof | PASS / FAIL / NOT BUILT / GAP | evidence file | unblocked by. Each command row's full output is written to `<out>/<row-id>.txt`; `--out` is required (no shared default, so two runs never overwrite each other and no unexamined docs/reports path is assumed); the tool commits nothing. Each row has a timeout (default 120000 ms, as surface-validate.mjs:31); expiry is FAIL with the partial output kept; a spawn error such as a missing tsx is GAP (environment), not FAIL. Exit codes: 0 only when every row is PASS; 1 any FAIL; 2 usage or a missing or malformed data file (fail closed, like surface-validate.mjs:30-33); 3 no FAIL but at least one NOT BUILT or GAP. So a caller keying on the exit status can never read "nothing proven" as a pass ("GAP not accepted by the operator means not DONE", task-268). The summary line also counts PASS, FAIL, NOT BUILT, GAP. Caller: the PROOF.S lane (task-268) runs it as its acceptance command; no hook, station step or CI job is added now (minimum; infra freeze). No DB code, no browser code, no new library or component kind, no screen written by hand.
Maps to RR-0306: the operator's test, "I the search doesn return results we know there is a problem", is rows 1-6: the search pages, their states and the route cases either pass on the committed truth or fail loudly.

### What I would NOT build now, and why
1. Screenshot per lot, element extraction, McProof key compare, storage probes: every one needs the test stack and a live lot read, and the read returns null (1.3 W not built). Building them now means building against nothing. They are LATER stages with named unblockers below.
2. A browser driver or headless render: no browser tool exists in the repo's checks; adding one is a new library (task-68 says "no new library").
3. A design-fit check or its elements file: RR-0306 (task-345 is a large build per the operator, MORNING-DECISIONS.md:1174).
4. A re-run of the suite's tests (rows 6, 7, 9, 10): the station already runs them on every push; the tool reads the pass file instead.
5. A 1.6 harness: no code exists (row 13); the "check C-1" is merged into draft-15; building it is a different task.
6. Any write to a database, any DB URL parameter.

### Later stages (each with the task that unblocks it)
- Stage 3, page proof on the test stack: screenshot per lot (a), element check (b): unblocked by task-123 (1.3 W), task-265 (ST.P1, stored lots) and a rehearsed test-stack job under operator GO; browser capture tool to be named then.
- Stage 4, McProof key compare (c): unblocked by task-123 and a committed key file for the 25 lots (none found for report numbers: UNVERIFIED location of the inc-1 key).
- Stage 5, storage probes (d): unblocked by task-265 and the opened-lot table's migration (CHK.5 chk5_tables entry, policy-config.json:2 note).
- Loading and load-failure rows flip from NOT BUILT to command rows when tasks 266, 267, 317 land with their goldens.
- Design-fit row flips when task-345 then task-67 land.

### Size (all GUESS unless marked MEASURED)
Files: 3 new (scripts/surfaces/proof-slice.mjs about 110 lines GUESS; scripts/surfaces/proof-slices.json about 70 lines GUESS; src/tests/surfaces/proof-slice.logic.test.ts about 120 lines GUESS) plus the task-68 file edit. Days: 1 day GUESS for the minimum (the task text's 2 days GUESS covered the whole tool). MEASURED: the four node rows together run in under 2 s (surface-validate 0.45 s, policy-checks 0.11 s, three tsx checks "secs 0" by whole-second clock).

## 5. Stage-2 build plan
Files (write scope for stage 2): scripts/surfaces/proof-slice.mjs; scripts/surfaces/proof-slices.json; src/tests/surfaces/proof-slice.logic.test.ts; backlog/tasks/task-68 file (status, AC evidence, `Task: task-68` trailer through scripts/hooks/check-backlog-task.mjs). Design: pure core `runSlice({ spec, run, readFile, head })` with injected `run` (a stub in tests, spawnSync in the CLI), so the tests spawn nothing.
Step 0 (before the first write): `node ~/Buildo-scratch/ids/check.mjs ~/Buildo-wt-proof --lane BL-PROOF`, exit code recorded; a claim by mkdir only if some id kind is introduced (none expected).
Red tests first (the red is a commit attempt with only the test and task files staged; the pre-commit related run refuses it: red.out; lane rule 18):
- T1 data: slice key S; each row id matches ^[a-z0-9-]{1,40}$ and is unique; each row has proof and exactly one of argv | suite | notbuilt; argv is an array of strings; each notbuilt `blockedBy` task resolves by `backlog/tasks/task-N - *` and that task's status is not DONE (a DONE blocker means the row must flip); each `suite_files` path exists.
- T2 spawn results: exit 0 -> PASS; exit 1 -> FAIL and overall exit 1; no exit (timeout, signal) -> FAIL, with the timeout as the cause; a spawn error (ENOENT) -> GAP (environment); the planted failing command is visible in the table with its evidence file.
- T3 a line starting "WAITS CHK.5" in policy-checks output maps the CHK.5 row to NOT BUILT, never PASS; a planted "WAITS CHK.3" line does not flip it.
- T4 NOT BUILT rows never count as PASS; the summary counts are exact; exit 3 when no FAIL but one row is not PASS; exit 0 only when all rows PASS.
- T5 fail closed: unknown slice -> exit 2; missing or malformed data file -> exit 2.
- T6 suite row: no pass file -> GAP; pass file RESULT: PASS with sha equal to HEAD -> PASS; sha different -> GAP.
- T7 tripwire (not a sandbox): proof-slice.mjs contains no `pg` import, no connection string, no `fetch(`.
Conditional file: one dated paragraph on Spec 127 (the S-gate table) only if check-spec-diff.mjs asks.
Gates it will meet: pre-commit chain (.husky/pre-commit:16-52). New files under scripts/: the consumer registry scans scripts/** for metadata reads (consumer-registry.mjs:49) and the Target Files blocks are generated (generate-target-files.mjs): neither should move, because the tool names neither a step output key nor a step; the commit must still run `node scripts/analysis/generate-target-files.mjs --check` and the pre-commit registry checks, and regenerate by their own scripts (`npm run target-files`) only if they report a move (UNVERIFIED until stage 2 runs the hook). Also: report-schema.mjs --check and surface-validate.mjs --check stay green; check-spec-diff.mjs may ask for one dated note on Spec 127 (the S-gate table) naming the new runner: UNVERIFIED; add it only if the hook asks.
ID ledger: the task text says "claim an ID by mkdir before it starts". The ledger kinds are MF, FE, MB, mig, round, D, M (~/Buildo-scratch/ids/README.md); check.mjs:5-17 lists what it counts: MB/MF trailers and queue ids, new FE rows, migrations, prereg rounds, Spec 69a M-rows. This tool adds none of them (no McFrontend row: AC #8 is McFrontend-only; no migration; no register row). So no claim is expected; if the commit adds a Spec 127 note that opens an FE row, the kind would be FE. Stage 2 runs `node ~/Buildo-scratch/ids/check.mjs ~/Buildo-wt-proof --lane BL-PROOF` and claims only if it exits 1. I claimed nothing now.
Acceptance checks as commands (stage 2):
1. `node scripts/surfaces/proof-slice.mjs --slice S --out <dir>`: prints the table; on the tool's own commit rc is 3 (rows 1-4 PASS, CHK.3 PASS, CHK.5 NOT BUILT, row 8 GAP until the operator runs the station on that commit, the NOT BUILT rows printed; row 5 PASS or a named FAIL); no FAIL expected.
2. `node scripts/surfaces/proof-slice.mjs --slice X`: rc 2.
3. A planted failing row (test T2) shows FAIL and rc 1.
4. `node scripts/surfaces/surface-validate.mjs --check`, `node scripts/analysis/policy-checks.mjs --all`, `node scripts/analysis/generate-target-files.mjs --check`, `npm run typecheck`: all rc 0.
5. The commit lands through the real hooks (green.out); the push station suite and the push are the operator's (lane rules).

## 6. Operator list (RR-0233: design, priorities, storage, timeframes only)
D1 (priority and timeframe), draft, not a task. Plain explanation: With the minimum tool, slice S's search pages, their states and the address routing can be proven now, but the four proofs on the report itself (a photo of each lot's page, every element a number or "Not yet evaluated", numbers equal to the answer key, storage kept and refreshed) cannot be done until the report read (task-123) and the stored lots (task-265) exist. When PROOF.S closes, do you accept those four as GAP for Increment 1·B, or hold slice S open until they can run?
Grounded: task-268 text "GAP not accepted by the operator means not DONE" (backlog/tasks/task-268); report-page.ts:23-26 returns null; task-123 LATER, task-265 LATER (backlog task view, measured 2026-11-19). Verified by me against the files; the review round did not check the operator-facing wording.
Recommendation: accept them as GAP for 1·B, and run stages 3 to 5 as the same task chain once 123 and 265 land (they are 1·C and later by the plan). Review round r1 did not contradict it (TRIAGE.md #4); the operator-facing wording was not reviewed.
For the orchestrator, not the operator: at stage-2 close task-68 is BUILT for the minimum only, and stages 3 to 5 have no task of their own yet (I created none); the orchestrator decides whether they become tasks (TRIAGE.md #4).
No other decision is owed: design (none), storage (none new: CHK.5's table name is owned by ST.P1), timeframes (the 1-day GUESS is the lane's estimate, not a ruling). The test-stack run for stage 3 will be an operator GO later, as a rehearsed job; not asked now.

## 7. UNVERIFIED in this plan
- Whether mobile jest runs in under a minute (not run; rule 18).
- Which pushes trigger mobile-ci.yml (workflow filter not traced).
- The content of draft-15 (the 1.6 merge target).
- Whether the new files move the consumer registry or the Target Files blocks, and whether check-spec-diff asks for a Spec 127 note (hooks not run at stage 1).
- Where the McProof key for the 25 lots' report numbers lives (.cursor/MCBYLAWS-QUEUE.md:87 names the cases; no key file located).
