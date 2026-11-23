# REPORT: task-442 (FINAL.7), lane BL-FEDB442, stage 1 (build)

What changed: three new tests check that numbers on the report come from the database. T1 checks that each option number is a row the engine writes. T2 checks that a lot column the page shows is in the one database read. T3 checks that no number is typed into the page text, except 3 listed texts. The houseplex row now reads "the basement, not shared stairs and halls" (RR-0405) instead of "the basement; 10 % circulation".
Acceptance printed: A1, each red refused at its designed assertion (red-T1.out:740 and :751, red-T2.out:741 and :752, red-T3.out:748-759 and :791-799). A2, the work commit 99be00926 carries Task: task-442, McFrontend-Task: MF-97, Rule: and Red:, and "Tests 137 passed (137)", "GATE OK", "POLICY CHECKS OK (commit-msg): 3 file(s)" (commit.out:740, :744, :746). A3 to A10 belong to the orchestrator and were not run.
Could not be built as the plan says: nothing. One conflict, resolved in the plan's favour: the brief says "NO FE-nn token in any commit message", but the folded plan section 6 (grounded fold plan-compliance-surface-127#1, GROUNDER-PLAN.md:130) puts `Rule: FE-05, FE-18, FE-24, FE-27, FE-29` on the work commit. All five are RULED and in the prereg rules, and the hooks passed it. The orchestrator decides whether this stands.
Unverified: that the output-review grounder accepts the material. The real close check on a throwaway clone refuses only on GROUNDER.md, which is owed (pasted below). The pre-push suite (A7) was not run.
The task stays RUNNING with its grounder owed (RR-0359). 103 findings are listed untriaged in FINDINGS.md: CRIT 2 (both bodies read "none"), HIGH 5, MED 38, LOW 55, NIT 2.

## Commits (branch wf1/inc1b-fedb442, launched on board 8df691b0a; no push, no merge, no rebase)
- 1d3b4e0c7 commit 0, alone and first: MF-97 row (.cursor/MCFRONTEND-QUEUE.md, Next free id MF-98), scripts/analysis/bylaw-validation/coa-expected/prereg-MF-97-1.json (round 202, rules FE-05, FE-18, FE-24, FE-27, FE-29; totals copied from prereg-MF-96-1.json), docs/reports/panels/MF-97.json, the task file. Hook tail: lane commit0.out ("GATE OK", "POLICY CHECKS OK (commit-msg): 0 file(s)").
- 99be00926 work commit: 117 files, 399 insertions, 261 deletions. T1 (describe B1) and T3 (describe B2) are in src/tests/admin-report-preview-live.logic.test.ts. T2 (describe T11) is in src/tests/customer-report-read.logic.test.ts. The commit also holds the K2 change, the page-text.json hand edit and the regenerated copies: report-presentation.json, the report-v2.decl.json hash, web_landing.sample.json, 32 page goldens, 5 props goldens and 72 report goldens. Hook tail: commit.out (= green.out).
- The records commit (this report, the lens inputs and outputs, FINDINGS.md, TASK, red and green evidence, context-r3 and r4, task notes) follows this report. The task stays RUNNING.

## Red evidence (each a refused `git commit` through the real hooks; the runner was never called directly)
- red-T1.out: B1 (a) `expect(findings).toEqual([])` received ["o1 storeys_max detached_house", "o2 storeys_max detached_house"] (planted: the storeys_max rows of detached_house dropped from a local copy). B1 (b) to (d) passed in the same run.
- red-T2.out: T11 (a) "AssertionError: promise resolved ... instead of rejecting" at customer-report-read.logic.test.ts:421:67 (planted: read-stored.ts:29 deleted in the working tree, never staged). Restored with the edit tool; `git diff --quiet -- src/lib/report-projection/read-stored.ts` exit 0. T11 (b) passed.
- red-T3.out: B2 (a) received ["unexplained: row.unit_size_basis (1 digit run)", "unexplained: row.unit_size_basis_value (1 digit run)"], i.e. the planted digit plus the live break. K2: "no digit in the basis text (RR-0402): expected 'the basement; 10 % circulation' not to match /\d/". B2 (b) also failed on the live text before the fix, as expected. B1 passed.
- Self-check before green (plan section 6), 5 items, all PASS (work/selfcheck-after.out). Binding closure: 40 bindings (catalogue 33, parcels 5, user_input 2). The 17 rows: 17 pairs, o3 has 7, 0 misses on KEY[0]. Parcels column set: 4 columns, max_build_fsi absent. No unlisted digit: 90 page keys, 3 digit texts, all listed. Seed reads non-vacuous: catalogue 128 rows, switchboard 3 keys, logic variables 1085.

## Text fix regeneration (plan 7b, the commands it gives, in order; lane regen.out)
seed-report-v2.mjs --write exit 0; report-capture.ts exit 0; report-page-capture.ts exit 0. Checks: seed --check exit 0; "report-capture checked 72 goldens; 0 stale"; "page goldens current (40 and the landing sample)". `git grep -l -F "10 % circulation" -- scripts src` printed nothing. The basement text count is 1 in each of report-presentation.json and page-text.json.

## Small additions inside the plan's stated rules (flagged for the grounder)
- B2 (b) also asserts the stale-entry rule of case (a) (an added entry for a key with no digit gives "stale: row.unit_size_basis (listed 1, found 0)"). The plan states this rule in (a) but plants no case for it.
- The digit count of an entry is counted in digit runs (`/\d+/g`). Each of the three entries holds 1.

## Lines changed in the two shared test files (landing order note: tasks 383 and 411 are not on the board)
- src/tests/admin-report-preview-live.logic.test.ts: header lines 2-3 (SPEC LINK adds FE-18) and new lines 14-16 (the B1 and B2 lines of the lock list). New lines 149-244 sit after describe F, ending at old line 145, and before the twin-parity describe (B1, B2 and their helpers). Describe F itself is unchanged.
- src/tests/customer-report-read.logic.test.ts: lines 3-4 (SPEC LINK adds FE-27), new line 18 (the T11 line of the list) and line 62 (`import { pageBindings, type Binding }`). New lines 405-434 sit at the end of the file (T11, after T10).

## Output review (round 1; context-r4.md written fresh by backlog-brief.mjs before the inputs)
28 outputs in docs/reports/lanes/2026-11-23/BL-FEDB442/, each beside its in- input, plus TASK. Compliance once per list: surface-136, queue-137, agents-s7-s11, surface-128 (p1-p2), surface-126 (p1-p6), bylaw-133 (p1-p6), agents-s5-1to3, orchestrator-doc17, five-words, plan-protocol, inc-S and ms-S. Engineering: eng-all. The diff lenses (code-review, ux, error-paths, security) were not split. Verdict lines: FAIL on agents-s5-1to3, agents-s7-s11, bylaw-133-p1, ms-S, surface-126-p2 and surface-128-p1; every other output PASS, and security NOT APPLICABLE. FINDINGS.md lists the ids and gives no verdicts.

## Close check on a throwaway clone (task staged BUILT, records staged; real scripts/hooks/check-lane-close.mjs)
```
check-lane-close: task-442: the task's references lack the repo copy docs/reports/lanes/2026-11-23/BL-FEDB442/GROUNDER.md: backlog task edit task-442 --add-ref docs/reports/lanes/2026-11-23/BL-FEDB442/GROUNDER.md
check-lane-close: task-442: GROUNDER.md is missing in docs/reports/lanes/<date>/BL-FEDB442/ (a build or fix task always needs a separate grounder verdict)
exit=1
```
This is the second run, with REPORT.md and its ref staged. The first run also named the missing REPORT.md ref. Neither run refused anything about the lens outputs, inputs, chunks, list parts or headers. Only the GROUNDER.md refusals remain, and the orchestrator owes those. The clone was removed after the run.

## Not done by the lane (orchestrator)
A3 to A10, the grounder (GROUNDER.md), round-2 fixes, the closing commit (task BUILT) and the push.

STATUS: built and red-proven through the hooks; work commit 99be00926; task RUNNING, output grounder owed (RR-0359).
Question: does the plan's `Rule: FE-05, FE-18, FE-24, FE-27, FE-29` trailer on 99be00926 stand against the brief's "NO FE-nn token" line?
