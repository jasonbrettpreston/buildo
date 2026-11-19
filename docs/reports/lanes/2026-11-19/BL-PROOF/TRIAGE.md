# TRIAGE.md: BL-PROOF task-68 stage 1, review round r1 (r1-plan.txt, deepseek-reasoner, plan review template)

Method: one round; each finding opened against the file or measured output named; KEPT = folded into PLAN.md; REJECTED = reason with file:line. Findings about the generated context wrapper (backlog-brief.mjs output, not this plan) are REJECTED for this lane and listed for the orchestrator at the end.

| # | Finding (short) | Verdict | Reason and evidence |
|---|---|---|---|
| 1 | CRITICAL: data-file `cmd` is a code-execution primitive | KEPT in part | Fold: rows hold an argv array, never a shell string; run with spawnSync, no shell (surface-validate.mjs:31 uses spawnSync with argv). REJECTED: closed enum resolved in code: the data file is committed and reviewed like the script; an enum adds a second table to keep in step (scope creep) |
| 2 | CRITICAL: GAP/NOT BUILT only run exits 0 | KEPT | task-268 text "GAP not accepted by the operator means not DONE". Fold: exit 0 only when every row PASS; 1 any FAIL; 2 usage or bad data; 3 no FAIL but at least one NOT BUILT or GAP |
| 3 | CRITICAL: wrapper ACs are process ACs, not (a)-(e) | REJECTED | The ACs are the task file's own (task-68 AC #1-#8, Spec 08 process). The tool's acceptance is PLAN section 5; (a)-(e) belong to task-268. Noted for the orchestrator: AC #8 (McFrontend row) is inapplicable to this task |
| 4 | HIGH: minimum tool omits the four title proofs; file tasks now; retitle | KEPT in part | Already stated in PLAN sections 3-4 and D1. REJECTED: file tasks now (brief: "do NOT create tasks"; operator principle: minimum first). Folded: PLAN notes that at stage-2 close task-68 is BUILT (minimum for slice S) and that stages 3-5 have no task of their own yet: the orchestrator decides (D1 note) |
| 5 | HIGH: PLAN contradicts itself on .husky/pre-commit | KEPT (wording) | Not a contradiction: row 1 says surface-validate.mjs is not in the hook (grep of .husky/* for it: no match), row 9 names the chain. Folded: row 1 reworded to say exactly that |
| 6 | HIGH: pass file outside the repo, mutable | REJECTED | The station is the ruled route (PG-1 d; station.sh:3 "The ONLY route to a full suite and to a push"), and its pass file format is the CHK.8 status-evidence (station.sh:5). The tool takes the file as an optional argument and never runs the suite |
| 7 | HIGH: bootstrap deadlock, own commit moves HEAD | KEPT | Folded: acceptance check 1 expects row 8 = GAP and rc 3 on the tool's own commit until the operator runs the station on it; a later station run flips it |
| 8 | HIGH: "S-golden ok ... owed 13 states / 52 files" read as complete | KEPT | Opened src/tests/fixtures/surfaces/report/states.json: owed_states 13, owed_files 52, 18 states: that is the REPORT manifest, not the three search surfaces. The search pages' coverage is the S-screen arm (screen-checks.mjs:409: every state covered, nothing stray). Folded: row 1 says so |
| 9 | HIGH: task-66 DONE with empty chk5_tables | REJECTED | WAITS is CHK.5's designed state (chk5-mcstorage.mjs:7, :16; policy-config.json:2 note). Not this task's scope; the tool prints it as NOT BUILT, which is the honest reading |
| 10 | HIGH: wrapper dependency block lists two, plan lists ten | REJECTED | Generator issue. The ten are task-268's (its 1·B validation note); this task depends on 62, 66, 67 per the task file |
| 11 | HIGH: status RUNNING vs planNote PLANNED | REJECTED | The take is by the launch script (task-68 note "taken on the board at lane launch ... RR-0240"); planNote is the snapshot text |
| 12 | HIGH: slice key S vs S3 | KEPT (small) | task-68 slicePart "SUPPORT S3" is a plan-part label; the slice id is S (task-268 title). Folded: the data file declares the slice key `S` |
| 13 | HIGH: wrapper Requirements/McStorage blocks ENOENT | REJECTED | Generator path bug (the files exist: backlog/docs/increments/doc-2 and backlog/docs/doc-16 - McStorage-policy-v2.md, ls). I read doc-2 directly. For the orchestrator |
| 14 | HIGH: no mechanism chosen for (b) element extraction | REJECTED | It needs a live lot read that returns null (report-page.ts:23-26) and a browser tool the repo does not have (task-68: no new library). Picking one now is speculation; stage 3 names it. Stated in PLAN |
| 15 | MED: --out default not ignored, not lane-stamped, report-schema scope | KEPT | Folded: no default; `--out <dir>` is required, so no shared "latest" and no unexamined docs/reports path |
| 16 | MED: row id path traversal | KEPT | Folded: id must match ^[a-z0-9-]{1,40}$ (test T1); the file name is the id only |
| 17 | MED: spawnSync without timeout hangs | KEPT | Folded: per-row timeout, default 120000 ms (as surface-validate.mjs:31), expiry = FAIL, partial output kept; test asserts it |
| 18 | MED: T7 grep is not a capability check | KEPT (wording) | It is a tripwire, not a sandbox; renamed "tripwire". REJECTED: AST allowlist (over-engineering for a 110-line runner) |
| 19 | MED: unmeasured jest row inside a measured 1-day GUESS | KEPT | Folded: stage 2 measures the jest row first; over 120 s it becomes opt-in (`--with-mobile`), not default |
| 20 | MED: WAITS text vs exit code | KEPT in part | Folded: the match is anchored to a line starting "WAITS CHK.5" (T3 plants a CHK.3 WAITS line that must not flip it). REJECTED: new `--json` flag on policy-checks (changes another script: scope creep) |
| 21 | MED: notbuilt task file existence rots | KEPT | Folded: resolve by `backlog/tasks/task-N - *`, and fail T1 if that task's status is DONE (the row should then flip) |
| 22 | MED: red is a module-resolution error | REJECTED | That is what the repo's red is (lane rule 18; PLAN section 5 red = refused commit attempt) |
| 23 | MED: measurements carry no HEAD/dirty state | KEPT | PLAN header already names head 8e0742142; folded: worktree clean apart from the untracked review dir and the node_modules link (git status, measured) |
| 24 | MED: suite-covered rows silently unproven when row 8 is GAP | KEPT | Folded: row 8 prints the covered test files (data field `suite_files`, T1 checks each exists) and the row is GAP when the pass file is missing |
| 25 | MED: RR-0005 duplicate titles in wrapper | REJECTED | Generator. For the orchestrator |
| 26 | MED: wrapper quote fields read `undefined` | REJECTED | Generator. For the orchestrator |
| 27 | MED: stale 35 s text above RR-0176 | REJECTED | Generator; the plan does not use it |
| 28 | MED: home-absolute paths in docs | REJECTED | House style: the repo's own task files cite ~/Buildo-scratch paths (task-68 References) |
| 29 | MED: missing tsx gives FAIL | KEPT | Folded: a spawn error (ENOENT) is GAP (environment), not FAIL; still rc 3 |
| 30 | MED: decisions dump in wrapper | REJECTED | Generator. For the orchestrator |
| 31 | MED: report-schema scope on docs/reports evidence | KEPT | Covered by #15 (required --out; the lane chooses the place) |
| 32 | LOW: ID check after, not before | KEPT | Folded: stage 2 step 0 runs ids check.mjs before the first write; no claim is needed because no id kind is introduced |
| 33 | LOW: Spec 127 note not in write scope | KEPT | Folded: listed as a conditional file in the stage-2 scope |
| 34 | LOW: tool has no caller, repeating the search-golden-capture defect | KEPT in part | Folded: PLAN names the caller: the PROOF.S lane (task-268) runs it as its acceptance command. REJECTED: adding a station step or nightly job now (infra freeze, MEMORY infra-freeze-project-first; minimum first) |
| 35 | LOW: single "unblocked by" field | KEPT | Folded: `blockedBy: [task ids]` array |
| 36 | LOW: --suite-pass default undefined | KEPT | Folded: no default; omitted = GAP "no pass file given" (T6 branch) |
| 37 | NIT: 1-day size asserted | NOTED | Labelled GUESS already |
| 38 | NIT: truncated titles | REJECTED | Generator |

For the orchestrator (generator and process, not this plan): backlog-brief.mjs context file prints the three ENOENT document blocks (#13), duplicate or truncated decision titles and `undefined` quote fields (#25, #26), a milestone-wide decisions dump (#30), and a two-item dependency block that omits task-67 (#10).
Answer to the ticket's question (is anything in the minimum tool not needed for slice S, is anything slice S needs missing): the review found nothing in the minimum tool that slice S does not need except the unmeasured mobile jest row (made conditional, #19); it found nothing missing for the search pages, and said the four report-page proofs are deferred, which the plan states (D1).
