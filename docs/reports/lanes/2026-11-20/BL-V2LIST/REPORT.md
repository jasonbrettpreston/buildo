# REPORT: BL-V2LIST, task-406 (V2.LIST parts 2 to 4), 2026-11-20

1. What changes for a person: every compliance review of every task now also receives the five words statement (Spec 132 Glossary), the plan protocol (now a repo document) and the objectives sections of the task's own milestone, in both the plan and the output run; paths that matched no row (task 376, 378, 384, 372, 401, 408 and others) now resolve, and the engineering standards go in whole (eng-all) in place of five section lists.
2. Goldens moved: none (no step golden is touched); one generated page is new (docs/reports/generated/rule-lists-by-kind.md) and the system map gained one row for the plan protocol (docs/specs/00-architecture/00_system_map.md).
3. What stays code and why: the resolver rule "every task gets the every_task lists and its milestone list" and the check-tasks and page commands stay code in scripts/analysis/rule-lists.mjs (data decides WHICH lists; code only attaches and verifies); the close check gained a fail-closed arm in scripts/hooks/check-lane-close.mjs (own commit).
4. Unverified: phone-test green is unproven until Mobile CI (no phone test was touched or run); the page --check runs in the suite test and at no pre-commit hook (hooks-composition pins an exact generator count; wiring it is a choice, see the question); the diff proof material is one landed commit per kind, not each task's whole diff; the whole-change rule is not built (cost measured below).
5. Operator or orchestrator items: (a) the plan protocol copy is NOT byte-for-byte at file level: Spec 124 R-GW (spec-split-check arm vii) refuses a spec without a role banner, so the file is the banner line `> **Role: standard.**` plus a blank line followed by the source bytes unchanged (the last 7,502 bytes hash to the source sha256); (b) the close check reads `out-code-review.txt` and `out-error-paths.txt` only, but the diff is over the bound for those two lenses (the template holds the material twice), so they were run in two parts (-p1, -p2) and the close check will refuse them until it accepts parts for the non-compliance lenses (a small check edit, not made here).

## Evidence (every line pasted or cited)

### Commits (real hooks, none bypassed; hook tails in commit.out)
- f9c638c93 feat(08_agents): every compliance review receives the five words, ... (V2.LIST): table, helper, check-tasks, page, plan protocol, gate J row, tests. Hook tail: "Test Files  3 passed (3) / Tests  92 passed (92)", "POLICY CHECKS OK (commit-msg): 5 file(s)" (commit.out).
- 0d25c5e46 feat(08_agents): the close check requires the every_task lists and refuses a table with none (V2.LIST): scripts/hooks/check-lane-close.mjs in its own commit with its test (33 passed in the hook run).
- First attempt of the table commit was refused by the real hooks twice (spec-split-check: no role banner; system-map drift lock: regenerate), each fixed and re-run; the red attempt is red.out (tests only staged, exit 1, 17 failed of 104).

### Red first (red.out)
- red.out is the refused commit attempt with only the three test files and the task file staged: `Tests  17 failed | 87 passed (104)`; failing names include "V2.LIST: the generated page ...", "close check: the every_task lists (V2.LIST) > a table with no every_task ... is refused at close". Green = the two commits above.
- Planted defect plus passing control (check-lane-close.logic.test.ts, describe "close check: the every_task lists (V2.LIST)"): control `scenario()` passes (exit 0); PLANTED DEFECT removes out-compliance-ev.txt and is refused naming list ev and out-compliance-ev.txt; a table with no or an empty every_task is refused at close.
- rule-lists.logic.test.ts: validate refuses a table with no every_task, an empty one, one naming an undefined list, and an increment letter with no milestone_docs entry; verifyResolved names a planted set lacking five-words and ms-S; an unmatched path is still refused (a vacuous resolve cannot happen).

### The two sha256 of the plan protocol
- source ~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md: d92940f479c51d30b0622b2b6236a0286cb5c9124add4c778d3c173e27d9942a
- repo docs/specs/00-architecture/plan-protocol.md: 99765ef39c307fdac4cd5cf7fdeb77d706822171ee8fddcbcbf69f383d715646 (banner line + blank line + the source; `tail -c 7502` of it hashes to d92940f4...e9942a, the source hash)

### Tasks 376, 378, 384, 372, 401, 408 resolve (RESOLVE.txt: before the change refused, after resolves)
```
task-345 LATER resolves 14 lists, every_task 0 missing
task-372 RUNNING resolves 13 lists, every_task 0 missing
task-376 RUNNING resolves 24 lists, every_task 0 missing
task-378 RUNNING resolves 26 lists, every_task 0 missing
task-379 LATER resolves 17 lists, every_task 0 missing
task-384 RUNNING resolves 19 lists, every_task 0 missing
task-401 LATER resolves 9 lists, every_task 0 missing
task-408 LATER resolves 9 lists, every_task 0 missing
BEFORE task-372 REFUSED refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: scripts/seeds/logic_variables.js
BEFORE task-376 REFUSED refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: docs/reports/generated/127-surfa
BEFORE task-378 REFUSED refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: docs/reports/generated/127-surfa
BEFORE task-384 REFUSED refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: docs/reports/generated/127-surfa
BEFORE task-401 REFUSED refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: scripts/board/fold.mjs (add a ro
BEFORE task-408 REFUSED refused: Files path(s) matched by no row of scripts/analysis/rule-lists.json: scripts/board/fold.mjs, scripts/
```

### All open tasks (CHECK-TASKS.txt; command: node scripts/analysis/rule-lists.mjs check-tasks)
```
check-tasks: open 297: resolve 99, not yet resolvable 198
not yet resolvable, other reason: 3
  task-371: the Files line of a build task resolves to no rule list (only exempt paths: docs/reports/lanes/2026-11-20/BL-ENFORCE/PLAN.md); a build or fix task must touch 
  task-377: the Files line of a build task resolves to no rule list (only exempt paths: docs/reports/lanes/2026-11-20/BL-VERIFYC/VERIFY.md); a build or fix task must touc
  task-405: the Files line of a build task resolves to no rule list (only exempt paths: docs/reports/lanes/2026-11-20/BL-LEGAL/GROUNDER.md); a build or fix task must touc
not yet resolvable, no Files line (the author adds one before launch): 195
```
Before the change the coverage review counted 297 open, 91 resolve, 195 no Files line, 8 unmatched, 3 exempt-only. Now: 99 resolve (the 8 unmatched resolve), 195 no Files line (listed by id, with the reason, in CHECK-TASKS.txt; their authors owe a Files line), 3 exempt-only (371, 377, 405, listed with the reason). No open task that resolves lacks the every_task lists (the command exits 1 if one does).

### Proof on the real inputs: one real task per kind, both phases (PROOF-TABLE.md)
Tasks used: pipeline step task-338 (names scripts/steps/_schema/consumer-registry.json; no open task is purely a pipeline step), McFrontend web task-384, phone task-373, storage task-372, tooling task-375, spec-only task-388. For each, `rule-lists.mjs lens-input` was run for every resolved list at the plan phase (material: the task's context file, else its task file) and the out phase (material: one landed commit patch of the task; task-388 has none, so the docs/specs part of f9c638c93). The grep looked in the input file of the list that must carry the document (five-words, plan-protocol, ms-S). 60 of 60 cells are YES; no NO.

| kind | task | phase | document | result |
| --- | --- | --- | --- | --- |
| pipeline step | task-338 | plan | five words statement (Spec 132 Glossary) | YES in-plan-compliance-five-words.txt:20 |
| pipeline step | task-338 | plan | plan protocol text | YES in-plan-compliance-plan-protocol.txt:6 |
| pipeline step | task-338 | plan | plan protocol five principles line | YES in-plan-compliance-plan-protocol.txt:8 |
| pipeline step | task-338 | plan | milestone objectives: Project objectives | YES in-plan-compliance-ms-S.txt:4 |
| pipeline step | task-338 | plan | milestone objectives: Increment objectives | YES in-plan-compliance-ms-S.txt:11 |
| pipeline step | task-338 | out | five words statement (Spec 132 Glossary) | YES in-out-compliance-five-words.txt:20 |
| pipeline step | task-338 | out | plan protocol text | YES in-out-compliance-plan-protocol.txt:6 |
| pipeline step | task-338 | out | plan protocol five principles line | YES in-out-compliance-plan-protocol.txt:8 |
| pipeline step | task-338 | out | milestone objectives: Project objectives | YES in-out-compliance-ms-S.txt:4 |
| pipeline step | task-338 | out | milestone objectives: Increment objectives | YES in-out-compliance-ms-S.txt:11 |
| McFrontend web | task-384 | plan | five words statement (Spec 132 Glossary) | YES in-plan-compliance-five-words.txt:20 |
| McFrontend web | task-384 | plan | plan protocol text | YES in-plan-compliance-plan-protocol.txt:6 |
| McFrontend web | task-384 | plan | plan protocol five principles line | YES in-plan-compliance-plan-protocol.txt:8 |
| McFrontend web | task-384 | plan | milestone objectives: Project objectives | YES in-plan-compliance-ms-S.txt:4 |
| McFrontend web | task-384 | plan | milestone objectives: Increment objectives | YES in-plan-compliance-ms-S.txt:11 |
| McFrontend web | task-384 | out | five words statement (Spec 132 Glossary) | YES in-out-compliance-five-words.txt:20 |
| McFrontend web | task-384 | out | plan protocol text | YES in-out-compliance-plan-protocol.txt:6 |
| McFrontend web | task-384 | out | plan protocol five principles line | YES in-out-compliance-plan-protocol.txt:8 |
| McFrontend web | task-384 | out | milestone objectives: Project objectives | YES in-out-compliance-ms-S.txt:4 |
| McFrontend web | task-384 | out | milestone objectives: Increment objectives | YES in-out-compliance-ms-S.txt:11 |
| phone | task-373 | plan | five words statement (Spec 132 Glossary) | YES in-plan-compliance-five-words.txt:20 |
| phone | task-373 | plan | plan protocol text | YES in-plan-compliance-plan-protocol.txt:6 |
| phone | task-373 | plan | plan protocol five principles line | YES in-plan-compliance-plan-protocol.txt:8 |
| phone | task-373 | plan | milestone objectives: Project objectives | YES in-plan-compliance-ms-S.txt:4 |
| phone | task-373 | plan | milestone objectives: Increment objectives | YES in-plan-compliance-ms-S.txt:11 |
| phone | task-373 | out | five words statement (Spec 132 Glossary) | YES in-out-compliance-five-words.txt:20 |
| phone | task-373 | out | plan protocol text | YES in-out-compliance-plan-protocol.txt:6 |
| phone | task-373 | out | plan protocol five principles line | YES in-out-compliance-plan-protocol.txt:8 |
| phone | task-373 | out | milestone objectives: Project objectives | YES in-out-compliance-ms-S.txt:4 |
| phone | task-373 | out | milestone objectives: Increment objectives | YES in-out-compliance-ms-S.txt:11 |
| storage | task-372 | plan | five words statement (Spec 132 Glossary) | YES in-plan-compliance-five-words.txt:20 |
| storage | task-372 | plan | plan protocol text | YES in-plan-compliance-plan-protocol.txt:6 |
| storage | task-372 | plan | plan protocol five principles line | YES in-plan-compliance-plan-protocol.txt:8 |
| storage | task-372 | plan | milestone objectives: Project objectives | YES in-plan-compliance-ms-S.txt:4 |
| storage | task-372 | plan | milestone objectives: Increment objectives | YES in-plan-compliance-ms-S.txt:11 |
| storage | task-372 | out | five words statement (Spec 132 Glossary) | YES in-out-compliance-five-words.txt:20 |
| storage | task-372 | out | plan protocol text | YES in-out-compliance-plan-protocol.txt:6 |
| storage | task-372 | out | plan protocol five principles line | YES in-out-compliance-plan-protocol.txt:8 |
| storage | task-372 | out | milestone objectives: Project objectives | YES in-out-compliance-ms-S.txt:4 |
| storage | task-372 | out | milestone objectives: Increment objectives | YES in-out-compliance-ms-S.txt:11 |
| tooling | task-375 | plan | five words statement (Spec 132 Glossary) | YES in-plan-compliance-five-words.txt:20 |
| tooling | task-375 | plan | plan protocol text | YES in-plan-compliance-plan-protocol.txt:6 |
| tooling | task-375 | plan | plan protocol five principles line | YES in-plan-compliance-plan-protocol.txt:8 |
| tooling | task-375 | plan | milestone objectives: Project objectives | YES in-plan-compliance-ms-S.txt:4 |
| tooling | task-375 | plan | milestone objectives: Increment objectives | YES in-plan-compliance-ms-S.txt:11 |
| tooling | task-375 | out | five words statement (Spec 132 Glossary) | YES in-out-compliance-five-words.txt:20 |
| tooling | task-375 | out | plan protocol text | YES in-out-compliance-plan-protocol.txt:6 |
| tooling | task-375 | out | plan protocol five principles line | YES in-out-compliance-plan-protocol.txt:8 |
| tooling | task-375 | out | milestone objectives: Project objectives | YES in-out-compliance-ms-S.txt:4 |
| tooling | task-375 | out | milestone objectives: Increment objectives | YES in-out-compliance-ms-S.txt:11 |
| spec-only | task-388 | plan | five words statement (Spec 132 Glossary) | YES in-plan-compliance-five-words.txt:20 |
| spec-only | task-388 | plan | plan protocol text | YES in-plan-compliance-plan-protocol.txt:6 |
| spec-only | task-388 | plan | plan protocol five principles line | YES in-plan-compliance-plan-protocol.txt:8 |
| spec-only | task-388 | plan | milestone objectives: Project objectives | YES in-plan-compliance-ms-S.txt:4 |
| spec-only | task-388 | plan | milestone objectives: Increment objectives | YES in-plan-compliance-ms-S.txt:11 |
| spec-only | task-388 | out | five words statement (Spec 132 Glossary) | YES in-out-compliance-five-words.txt:20 |
| spec-only | task-388 | out | plan protocol text | YES in-out-compliance-plan-protocol.txt:6 |
| spec-only | task-388 | out | plan protocol five principles line | YES in-out-compliance-plan-protocol.txt:8 |
| spec-only | task-388 | out | milestone objectives: Project objectives | YES in-out-compliance-ms-S.txt:4 |
| spec-only | task-388 | out | milestone objectives: Increment objectives | YES in-out-compliance-ms-S.txt:11 |

### The generated page (docs/reports/generated/rule-lists-by-kind.md; `node scripts/analysis/rule-lists.mjs page --check`: "is current"; gate J: "PASS — 14 live doc(s)")
Per kind of work, list count, total characters and lens-input parts at a 30,000-character material: pipeline step 10 lists, 195,941 chars, 10 parts; McFrontend web 15, 678,126, 18; phone 14, 719,040, 17; storage 13, 568,370, 16; tooling 9, 173,691, 9; spec-only 7, 137,394, 7.

### Lens set (findings untriaged; NO verdicts; NO grounder file; ids in FINDINGS.md, 159 findings in 27 outputs)
- Plan stage (before any code): plan-review-deepseek, error-paths, and compliance on the 7 lists of the launch brief (the table then had no every_task); eng-s5 failed once ("terminated") and was re-run. Plan-stage outputs for eng-s5-s9-s14 and eng-s5 are for lists that no longer exist in the table.
- Output stage: compliance once per list of the final table, all whole: agents-s5-1to3, agents-s7-s11, queue-137, orchestrator-doc17 (2 parts), eng-all (2 parts), surface-127 (3 parts), five-words, plan-protocol, inc-S, ms-S; material = the whole change since b43a72c29 (12 paths, 85,642 characters, `diff-out.patch`; docs/reports/lanes excluded), every path in every run. code-review and error-paths on the same change in two parts (p1: the helper, table, hooks, gate rows; p2: tests, page, plan protocol, task file; 12 of 12 paths covered). The first runs of code-review and error-paths on the whole diff were refused by the review tool (181,810 characters, the template holds the material twice) and re-run in parts.
- Plan-stage finding that bears on this report, untriaged: the plan review listed "backlog-lane.mjs not wired" (it is: launch refuses a resolved set lacking the lists, verifyResolved in scripts/analysis/backlog-lane.mjs).

### Whole-change rule: NOT built; measured cost only
- This lane's change is 85,642 characters (-U2) over 12 paths: compliance fits one material part per list part (14 runs for 10 lists); code-review and error-paths needed 2 parts each (material counted twice by the template, about 55,000 characters of material per run).
- A larger change measured: task-375's commit 440cac070 shown whole is 396,943 characters; at about 55,000 to 90,000 characters of material per run that is 5 to 8 material parts, each against every list part (14 for a tooling task): roughly 70 to 110 compliance runs instead of 14 (estimate, UNVERIFIED), and the close check has no name for a material part (-pN means a list part).
- The coverage review's finding stands: nothing today refuses a compliance run whose material misses a changed path.

### Checks run before and after (every --check the hooks run for the touched files)
- before (HEAD b43a72c29) and after: `rule-lists.mjs validate` ok (41 lists, 16 rows before; 54 lists, 17 rows after); `page --check` current; gate J `PASS — 14 live doc(s)`; spec-split-check clean ("every spec has a role"); system-map drift lock green after regeneration; step-handbook and bylaw-handbook --check up to date (pre-commit hook run, commit.out). `backlog doctor`: "No duplicate IDs, self-referential dependencies, or dependency cycles found."
- Phone tests: none touched; phone-test green is unproven until Mobile CI.
- gate.mjs: see the STATUS line below.

### Other notes for the grounder and the orchestrator (readings, not rulings)
- The system map row for the plan protocol shows spec number 99 and status Done (derived by the generator from the file name; cosmetic).
- The new row generated-reports attaches the lane-tools lists to docs/reports/policy/** as the nearest governing spec (the coverage review said "to verify"); surface-127 for docs/reports/generated/**.
- eng-all replaces eng-s1, eng-s2-s4-s10-s11, eng-s3-s9, eng-s5-s9-s14, eng-s5 in every row; none of the five ids is left in the table (test pins it).
- Not built (NOT DECIDED HERE in the coverage review): Spec 137 and eng-all to every task; Specs 124, 47, 123, 33/34/35; a default row for tasks with no Files line.
- Files line extended through the backlog CLI: docs/specs/00-architecture/plan-protocol.md, docs/reports/generated/rule-lists-by-kind.md, scripts/analysis/gates/generated-docs.mjs, scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/specs/00-architecture/00_system_map.md.
- The task is left RUNNING; grounder owed; no push; no DB.

Question (one): wire `rule-lists.mjs page --check` into .husky/pre-commit (one line plus the pinned count 18 to 19 in hooks-composition.infra.test.ts), so a stale page is caught at commit and not only by the suite?

Gate: `gate.mjs gate --lane BL-V2LIST ... --allow-ref-move` printed "GATE PASS (BL-V2LIST)"; without --allow-ref-move it fails only on "ref moved since the snapshot" lines (this lane's own two commits and other lanes' worktrees), scope line "335 changed since snapshot; 335 in scope; 0 attributed to other lanes; 0 unexplained".

STATUS: BL-V2LIST task-406 READY, task RUNNING, grounder owed; commits f9c638c93 and 0d25c5e46 (not pushed); findings 159 untriaged in FINDINGS.md; open item: close check reads only unsplit out-code-review.txt and out-error-paths.txt.

# ROUND 2 (coordinator message after the grounder: 9 fixes)

Rebased onto wf2/board first (git rebase; no checkout). Commits (real hooks, each protected path in its own commit, no task status move): a55976216 (templates), 8b0f3f994 (rule-lists.mjs milestone guard + launch), 1e67bda61 (rule-lists.json rows + page + plan-protocol pin test), 6285effe0 (check-lane-close.mjs). Red: red2.out (all new tests staged, refused, exit 1, 16 failed of 177). Green tails: commit2.out.

- (1) DONE: eng-all on the mobile and surfaces rows.
- (2) DONE: resolveTask refuses a build or fix task with no milestone; verifyResolved treats a missing milestone_docs key or entry as missing lists (and names a build task with no milestone); check-lane-close calls verifyResolved; launch (backlog-lane.mjs) passes the task type. Planted defects plus controls in rule-lists, backlog-lane and check-lane-close tests.
- (3) DONE: rule-lists-table.logic.test.ts pins the bytes after the banner to d92940f4...e9942a.
- (4) HALTED: wiring `page --check` into .husky/pre-commit makes hooks-composition R-EC refuse: the pre-commit budget evidence is keyed to the hook text, and a fresh `precommit-budget.mjs --measure` (run with an empty temporary index, GIT_INDEX_FILE outside the repo) gives registry_s 32.12 s and 31.84 s against the pinned tooling_precommit_budget_registry_s 27.5 s (the new stage itself costs 0.08 s; docs_only 21.83 s is inside 25.3). The earlier evidence (27.36 s, 2026-10-30) was already 0.14 s under the pin. Raising the pinned budget is an operator ruling (R-EB (b)); hook, test and evidence were restored to HEAD (nothing of the wiring landed). The CHAIN_ERA entry and 18 to 19 are ready to apply.
- (5) DONE: launch refusal test of an incomplete resolved set (empty every_task table, build task with no milestone; control launches).
- (6) DONE: row panel-records (docs/reports/panels/**): surface-128, surface-126, agents-s7-s11, queue-137 (Spec 128:182).
- (7) DONE: list policy-124-s2-s5 = Spec 124 sections "2. The rules" (holds Rule 13) and "5. Register of rulings" (holds R-GW), the smallest sections that hold both (Rule 13 and R-GW are in different sections; section 2 has no deeper heading). generated-reports (not 127-*) gets it in place of surface-127; row generated-127 keeps surface-127 for 127-* files and adds it.
- (8) DONE: row policy-reports says "nearest lists, no governing spec: operator ruling owed"; not presented as governing.
- (9) DONE: the four lens templates fixed as lens-compliance.md; a test pins one placeholder per template.

## Proof lines (resolve --type build --letter S)
== resolve mobile/x.ts
mobile-90 mobile-98 mobile-99 mobile-100 mobile-96 surface-136 surface-126 surface-127 surface-128 surface-135 eng-all five-words plan-protocol inc-S ms-S
== resolve scripts/surfaces/_schema/static-page.json
surface-136 surface-126 surface-127 surface-128 surface-135 eng-all five-words plan-protocol inc-S ms-S
== resolve docs/reports/panels/MF-94.json
surface-128 surface-126 agents-s7-s11 queue-137 five-words plan-protocol inc-S ms-S
== resolve docs/reports/generated/x.md
policy-124-s2-s5 agents-s5-1to3 agents-s7-s11 queue-137 eng-all orchestrator-doc17 five-words plan-protocol inc-S ms-S
docs/reports/generated/127-surface-registry.md: policy-124-s2-s5 ... surface-127 (kept for 127-* files).

## Re-run of the outputs (whole final diff: git diff -U0 wf2/board HEAD excluding docs/reports/lanes, docs/reports/reviews and backlog: 17 paths, 84,160 characters)
- Including docs/reports/reviews (the generated context file, 34 KB) the diff is 118,162 characters (-U0): lens-input refuses ("material is 118112 characters; ... at most 115767 characters fit one file ... split the material"), so that file is left out of the material (it is review input, not a change under review); nothing else trimmed.
- lens-input REFUSED for list policy-124-s2-s5: "section "2. The rules" is 34244 characters and has no deeper heading to split at (room for list text in one file: 30833)". The new Spec 124 list therefore has NO compliance output this round. To fix: a deeper heading in that section, a smaller section, or material parts (the close check has no name for a material part). Operator or orchestrator item; the close check will refuse until resolved.
- 13 DeepSeek calls (11 compliance + code-review + error-paths, both unsplit now), all with VERDICT, no failure. Old round 1 out-* and in-out-* files (32) removed in the same commit, listed in SUPERSEDED.txt; plan-* files stay.
- out-code-review.txt sha256:6ed508197eb8 findings:6
- out-compliance-agents-s5-1to3.txt sha256:b86fd60d0f15 findings:5
- out-compliance-agents-s7-s11.txt sha256:073020afd53a findings:5
- out-compliance-eng-all-p1.txt sha256:6772bba6589e findings:4
- out-compliance-eng-all-p2.txt sha256:0ab5775870a3 findings:4
- out-compliance-five-words.txt sha256:dc8a87c87328 findings:5
- out-compliance-inc-S.txt sha256:6ea0f696d2ba findings:3
- out-compliance-ms-S.txt sha256:a4681afc2571 findings:5
- out-compliance-orchestrator-doc17-p1.txt sha256:fefd1b60bff4 findings:4
- out-compliance-orchestrator-doc17-p2.txt sha256:58cb9eeb9489 findings:5
- out-compliance-plan-protocol.txt sha256:c143d5040e5d findings:6
- out-compliance-queue-137.txt sha256:7f33376dfda9 findings:5
- out-error-paths.txt sha256:cfd515547ab2 findings:6
(sha256 are the first 12 hex of each file; counts are BUG and DEFER lines; 63 findings in the 13 outputs, FINDINGS.md refreshed, untriaged.)

STATUS: BL-V2LIST task-406 round 2 READY, task RUNNING, grounder owed again; commits a55976216, 8b0f3f994, 1e67bda61, 6285effe0 (+ reports commit); fix 4 halted (budget pin), policy-124-s2-s5 has no output (lens-input size refusal).

## Fold note (after the round 2 grounder: 42 CONFIRMED, 78 REJECTED, 4 CONFLICT)
The branch folds with task-406 left RUNNING because list policy-124-s2-s5 cannot be reviewed until task-410's material-split mode exists (lens-input refuses for size: section "2. The rules" is 34,244 characters with no deeper heading). The pre-commit wiring of `page --check` is a recorded deviation from Spec 124 R-DJ, pending a budget ruling (the pre-commit budget evidence re-measures registry_s 31.84 s to 32.12 s against the pinned 27.5 s; the new stage itself costs 0.08 s).
