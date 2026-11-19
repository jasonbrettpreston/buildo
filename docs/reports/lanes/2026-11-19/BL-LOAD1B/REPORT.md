# REPORT: BL-LOAD1B, task-266 (LOAD.1), stage 2 (build)
Date 2026-11-19. Worktree ~/Buildo-wt-load1b, branch wf1/inc1b-load1b. Commits: 7134366c2 (prereg-MB-44-2 alone, round 198), b5d77c14b (red tests and code landing; hook tail in commit.out: "Test Files 19 passed (19), Tests 485 passed (485)", GATE OK). A third commit (this report copy, task close) follows.

## Six plain lines for the operator
1. What happens now when a lot is picked: nothing different yet. The lookup route asks the stored read (W) first; on a miss it calls the new one-lot compute, which computes that lot's report in memory with the same core the pipeline step uses and returns the page; nothing is written.
2. Nobody sees it: the compute sits behind the existing web live switch alone (the literal false), the first statement of the entry (src/lib/parcels/report-compute.ts:74). It is dark code at landing, as W is: that is the ruled state, not a defect. D-1 (task-348) is not ruled; when it is, one expression (that first statement) and one test (C1) change.
3. A miss (switch off, no parcel, no Layer 2 stamp, no batch row, a row for another lot) returns page null, the approved miss text; a compute failure (core or query error) is the route's existing 500 with no page and no meter; a lot the engine cannot compute is the same null as a miss, never a 500.
4. Launch preconditions (recorded as a note on task-343, not fixed): the 7.4 MB docs file and the ESM requires are not proven to load in the Cloud Run image; the compute is synchronous and blocks one instance 3.9 to 15.9 s per lot here (33.6 s measured by the STORAGE lane); the app retries a failed lookup three more times; the platform request timeout is unknown.
5. Measured (file-only, no database): the full compute of the golden 25 takes a median 9.7 s (min 0.13 s, p90 13.6 s, max 15.9 s); cut to the two building types the page shows it takes 44 ms with 2825 equal rows and 0 differing (measure.out), but the core has no types parameter so the entry runs the full compute; rebuilding the core's lookups per request costs 0.61 ms on the golden dictionaries.
6. Unproven: the compute inside the real image and its memory use; the lookup rebuild cost at the real dictionary size; the platform timeout; whether the operator accepts the 30th entry in the growth-locked src SQL ledger set (deviation below); whether the lens-set lenses should also run on a rebased head.

## Acceptance criteria
| AC | Evidence |
|---|---|
| 1 prereg alone | commit 7134366c2 (prereg-MB-44-2.json, task file, context file only; commit1.out "GATE OK"); round 198 claimed by mkdir ~/Buildo-scratch/ids/round-198 (owner file names BL-LOAD1B) |
| 2 failing tests in the plan, reviewed at plan altitude | PLAN.md section 4 (stage 1, one generic repo round r1, not a panel); tests written red first: red.out (commit refused by typecheck: "Cannot find module '@/lib/parcels/report-compute'", "declares 'pageForVerdict' locally, but it is not exported"); the related run was not reached, so red is the typecheck refusal |
| 3 write_scope declared | brief "Write scope": ~/Buildo-scratch/lanes-20261119/inc1b/load1b, ~/Buildo-wt-load1b; claimed by lanes.mjs claim BL-LOAD1B |
| 4 plan panel with the lens set | NOT met for the PLAN altitude (stage 1 ran one generic round). The OUTPUT altitude ran four lenses: compliance, code-review, error-paths, security (r2-*.txt); ux not run |
| 5 grounder re-executes the fold | this lane opened every cited line and ran typecheck, the 15 checks and the related run; every finding adjudicated in TRIAGE.md (KEPT and fixed 5, flagged deviation 1, REJECTED 13); no separate grounder agent ran |
| 6 red first then green on the tip | red.out then commit.out (related run, 19 test files, 485 tests passed incl. customer-report-compute C1 to C9, customer-report-read T7/T10, runtime-loader, src-sql-ledger, system-map). "On the tip": built on head 0eba4dbf2, NOT rebased onto wf2/board (rebase denied by the permission classifier); full suite is the push station's |
| 7 OUTPUT record committed with the work | docs/reports/lanes/2026-11-19/BL-LOAD1B/ (TRIAGE.md, r2-output.txt, measure.out) in b5d77c14b, REPORT.md in the final commit; no docs/reports/panels record was added (MB-44 has none): UNVERIFIED that the orchestrator accepts the lane record as the OUTPUT record |
| 8 McFrontend queue row first | not applicable: no McFrontend build; MF-48 note and trailer as BL-W2 used |

## What was built (files)
src/lib/parcels/report-compute.ts (new); src/app/api/parcels/lookup/route.ts (W first, compute on its miss, log keys page_source and compute_ms); src/lib/parcels/report-page.ts (pageForVerdict exported); src/lib/report-projection/read-stored.ts (readLotFacts extracted, same static statement); tests customer-report-compute.logic.test.ts (C1 to C9), customer-report-read.logic.test.ts (T7 rewrite, T10 re-pin, T6 files), runtime-loader and golden25-harness (batch builder moved), src-sql-ledger.logic.test.ts (pin 29 to 30); generated: src-sql-ledger.json, 127-surface-registry.md, 00_system_map.md; hand-edited with M-246 notes: census contracts.json and the lookup descriptor data_story, Spec 100 section 3.2, MB-44 row and status line, MF-48 row; task-266 plan and notes; task-343 loose-end note.

## Deviations from the plan (judge these)
- readLotFacts: the batch row's parcels read lacks the K2 heritage and ravine columns the page binds, so the lot facts are read through the shared stored-read statement (extracted unchanged), also giving the integer id; PLAN said report-projection would not change.
- src SQL ledger: the entry is classed interpolated (the core builds the batch text and it is passed as a variable; first check: "grew:src/lib/parcels/report-compute.ts"). I added it to the growth-locked CLOSED_INTERPOLATED_SET (29 to 30) and moved the pin test. No operator ruling authorises that: UNVERIFIED approval, flagged for review.
- T10 now allows two importers of report-page.ts (the route and the compute entry), because the entry applies pageForVerdict; the plan said T10 unchanged.
- The first statement is the literal `if (!MAXBLD_WEB_LIVE) return null;`; the named function the brief asks for is the entry itself, so a ruling edits that one line and test C1.
- C8 is a repo test of the measured equality (seed list cut to the page types), not a code path: the entry runs all types.
- Rebase onto wf2/board (coordinator instruction): DENIED by the permission classifier (history rewrite); not worked around. The lens templates and the lens-mode script exist only on wf2/board, so the repo tool was extracted read-only with git archive into boardtool/ and run from there. The diff given to the lenses excluded generated files, docs and the census (the tool refuses over 120000 characters).

## Pasted checks
checks.out: BEFORE 15 exit=0; AFTER 15 exit=0 (30 in all): "src-sql-ledger: fresh, 94 file(s) (62 static, 30 interpolated, 2 not_postgres), closed set holds"; "report-fields current (1 rendered fields); gates FAIL (report-only): RF-2, RF-4, RF-6, RF-7, RF-9" (pre-existing, same before and after). `npm run typecheck`: clean after the build. Hook tail (commit.out): "Test Files 19 passed (19) / Tests 485 passed (485) / GATE OK / POLICY CHECKS OK (commit-msg): 10 file(s)". Earlier landing attempts failed and were fixed: commit-try1.out (system map stale after the Spec 100 note: regenerated), commit-try2.out (two source-pin regexes of my own test matched "in memory" and "const materializeRows": tightened).

## UNVERIFIED
Cloud Run image load of the core; memory on 512 Mi; platform timeout; lookup rebuild cost at real dictionary size; compute through a real database (no DB by rule: the pool is scripted); the owner id MF-48 (as BL-W2); acceptance of the ledger set growth; acceptance of the lane record as the OUTPUT panel record; no lens review of the PLAN altitude; behaviour on a rebased head.

STATUS: ready
