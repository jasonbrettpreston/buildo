---
id: TASK-406
title: >-
  V2.LIST The definitive compliance list: every kind of work and every increment
  task resolves to its rule documents
status: RUNNING
assignee:
  - '@lane-BL-V2LIST'
created_date: '2026-11-20T17:12:00Z'
updated_date: '2026-11-24T16:12:00Z'
labels:
  - McFix
  - McFix V2
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-V2LIST/REPORT.md
type: build
ordinal: 106012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator, 2026-11-20, verbatim: "That works. Let;s this - the 10th plan today on the same thing.  Let's review the McFix tasks realted to compliance and either substitue. This is the McFixV2 Plan. Hwo will I know it is actually working on a daily basis and no one has swtiched it off.  I still think you need to create the definitive complianc list McFront-end and all the tasks in the Increments.  Add to the board - review all teh currentMCfix tasks and ensure they are still relevant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator APPROVES McFix V2"). McFix V2 step 1. Replaces task-403 and task-404 (their scope is here). Part 1, a read-only coverage review by a separate grounder BEFORE any row is written: the rule-list table (scripts/analysis/rule-lists.json: 41 lists, 16 rows) against the whole spec estate: which McDonald's specs or sections govern code and are attached to nothing; whether the sectioned handbooks (step handbook 132 sections 2, 3, 4, 6; McFrontend handbook 136 section 2; 124a, 122a) leave out the section that states the five principles; where the plan protocol lives; which paths touched in the last 60 commits match no row or miss an obviously governing spec. Part 2, data: rows so that every compliance review receives (i) the five principles as stated in the governing handbook for that kind of work, (ii) the plan protocol, (iii) the milestone objectives and increment requirements, (iv) every spec governing the touched paths; rows for docs/reports/generated/**, scripts/seeds/logic_variables.json, docs/reports/policy/**. Part 3, the list made visible: one generated page (by a generator with --check, in the form of the existing generated docs) that prints, per kind of work (pipeline step, McFrontend web, phone, storage, tooling, spec-only) the documents its compliance review receives; and a check over EVERY open task in EVERY increment on the board: each has a Files line that resolves, or is listed by id as not yet resolvable with the reason. Part 4: the compliance lens command is given the milestone objectives (today they go only into the ticket). Acceptance: the generated page; the all-increments check with its list; a planted task whose Files line resolves to no principles list is refused at launch. Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, docs/specs/00-architecture/plan-protocol.md, docs/reports/generated/rule-lists-by-kind.md, scripts/analysis/gates/generated-docs.mjs, scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/specs/00-architecture/00_system_map.md, .husky/pre-commit, src/tests/hooks-composition.infra.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts, .claude/review-templates/lens-code-review.md, .claude/review-templates/lens-error-paths.md, .claude/review-templates/lens-ux.md, .claude/review-templates/lens-security.md, migrations/334_precommit_budget_registry_repin.sql, scripts/seeds/logic_variables.json, docs/reference/logic-variables-registry.md, docs/reports/generated/precommit-budget.json, docs/specs/01-pipeline/124a_step_standard_policy_appendix.md, docs/reference/maxbld-report-field-inventory.md, docs/reference/maxbld-report-field-inventory.json
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
PLAN (lane BL-V2LIST, task-406, stage 1; Rule: Spec 126 section 0a principle 1 and section 11b.2; 08_agents.md section 7 rules 3 and 4 and section 11.1; PLAN-PROTOCOL.md:3 "keep it simple; no scope creep"; principles served: standardized, understandable, simple)
Source of every item: COVERAGE-GROUNDER.md RECOMMENDED block (read whole; facts verified by opening the files) and the task text.
1. TABLE (scripts/analysis/rule-lists.json, data): new lists five-words (Spec 132 Glossary), plan-protocol (docs/specs/00-architecture/plan-protocol.md whole), ms-F..ms-AL (15 milestone files; sections Project objectives, Increment objectives, Objectives), eng-all (engineering standards whole, replacing eng-s1, eng-s2-s4-s10-s11, eng-s3-s9, eng-s5-s9-s14, eng-s5 in every row), bylaw-133 gains section 3 (OWED marker rows). New keys every_task ["five-words","plan-protocol"] and milestone_docs {letter: [ms-letter]} beside increment_docs. Rows extended or added as RECOMMENDED (step-pipeline, lane-tools, generated-reports new, ui-app, tests, middleware-config). Nothing under NOT DECIDED HERE is built.
2. PLAN PROTOCOL: byte-for-byte copy of ~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md (sha256 d92940f4...) to docs/specs/00-architecture/plan-protocol.md; both sha256 reported.
3. HELPER (scripts/analysis/rule-lists.mjs; a protected path: the policy refuses only a commit that also closes a task, this task stays RUNNING): resolveTask adds every_task lists to every task and milestone_docs lists for the milestone letter; validate checks the two keys (defined lists, every increment letter covered) and fails a resolved set lacking the every_task lists (verifyResolved); check-tasks lists every open task as resolves or not yet resolvable by id with the reason and fails when a resolving task lacks an every_task list; page [--check] generates docs/reports/generated/rule-lists-by-kind.md (per kind of work: documents, sizes, part counts), registered in gate J (scripts/analysis/gates/generated-docs.mjs). Pre-commit wiring is not done (it pins an exact generator count in hooks-composition test): the page check runs in the suite test. Reported as a choice.
4. CLOSE CHECK (scripts/hooks/check-lane-close.mjs): own commit: refuses a table with no every_task and a task whose resolved lists lack an every_task id; planted defect plus passing control.
5. TESTS FIRST (red through the real pre-commit related run, red.out): rule-lists.logic.test.ts and check-lane-close.logic.test.ts.
6. PROOF ON REAL INPUTS: for one real task per kind (pipeline step, McFrontend web, phone, storage, tooling, spec-only) lens-input at both phases into the lane dir; grep with line numbers for the five words statement, plan protocol, milestone objectives; table kind by document.
7. Tasks 376, 378, 384, 372, 401, 408 resolve (paste). Whole-change rule not built; measured cost reported only.
8. Lens set at plan (this) and at output: compliance once per list whole, plus code-review and error-paths; findings untriaged in FINDINGS.md; no verdicts, no grounder file; task left RUNNING, grounder owed. No push, no DB.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PRIORITY, operator 2026-11-20 verbatim: "I also need certainty within the tasks that a rpiority is getting the right information about compliance to the reviewer.  Put extra stree" (MORNING-DECISIONS.md, entry "Operator APPROVES the McFix V2 launch"). So acceptance adds PROOF ON THE REAL INPUTS, not on the table: (1) for each kind of work (pipeline step, McFrontend web, phone, storage, tooling, spec-only) generate the actual compliance lens input files for a real task of that kind and show, by grep with line numbers, that each contains the five principles in the governing handbook's own words, the plan protocol, the milestone objectives, and each governing spec WHOLE (or the named sections, with the reason a section is left out); (2) the close check refuses a task whose compliance outputs do not include the always-attached list (planted-defect test with a passing control); (3) the lens is given the WHOLE change: where a diff is over the size bound it is split into parts and every part is reviewed against every list, never trimmed to core files (lanes trimmed on 2026-11-20): the check refuses a compliance run whose material does not cover every changed path (the material names the paths; compare with the range). (4) the generated page states, per kind of work, the documents AND their sizes and part counts, so a missing or shrunken document is visible in a diff.

2026-11-20 taken on the board at lane launch (lane BL-V2LIST, worktree /Users/brettpreston_macmini/Buildo-wt-v2list, branch wf1/inc1b-v2list), RR-0240

Operator 2026-11-20, verbatim (MORNING-DECISIONS.md:1494): "Correct this - Phone work gets no engineering standards. The mobile row was missed. - Some surface script paths get none either. - Generated reports are attached to the wrong spec. They are governed by Spec 124 Rule 13, which no list carried." All three are in the fix round sent to the lane.

2026-11-20 BL-V2LIST: build commits: table, helper, check-tasks, generated page and plan protocol copy first; the close check edit in its own commit (protected path). Task left RUNNING, grounder owed.

2026-11-20 BL-V2LIST round 2: review templates fixed (material sent once).

2026-11-20 BL-V2LIST round 2: milestone guard in the helper and the launch.

2026-11-20 BL-V2LIST round 2: table rows (eng-all on mobile and surfaces, panel records, generated 124 list, policy row).

2026-11-20 BL-V2LIST round 2: rule-lists page --check wired into pre-commit (Spec 124 R-DJ).

2026-11-20 BL-V2LIST round 2: the close check calls verifyResolved (milestone guard). Pre-commit wiring of page --check HALTED: the pre-commit budget evidence (R-EC) re-measures registry_s 31.84 s against the pinned 27.5 s, not caused by the new stage (0.08 s); operator item.

2026-11-20 BL-V2LIST round 2 report and re-run outputs committed.

2026-11-20 BL-V2LIST: round 2 report count corrected (63 output findings).

2026-11-20 BL-V2LIST: grounder file added; fold note in the report.

Step 4 audit by a separate grounder 2026-11-20 (file ~/Buildo-scratch/lanes-20261119/inc1b/retro/STEP4-LEDGER.md, sha256 d88e7548d70f…): of this task CONFIRMED and CONFLICT findings, 46: 6 fixed on the branch only, 7 not fixed with a written reason, 2 owned elsewhere, 2 resolved by the operator, 29 UNADDRESSED (code: milestoneLetter outside the try; unwrapped renderPage and listBlocks; a catch that hides the message; the early return at check-lane-close.mjs:85; the resolveTask milestone gap; validate passes a table without kinds; check-tasks exits 0 on an empty board; plus test and spec nits, two CONFLICTs with no answer, and no keep/merge/drop list of McFix tasks). The ledger lists every id. Not complete until each has an outcome.

2026-11-20 BL-V2LIST round 3 (B): two dated notes on plan-protocol.md (operator 'yes to all', MORNING-DECISIONS.md:1504, items 3 and 4).

2026-11-20 BL-V2LIST round 3 (A): budget re-pin (seed + migration 334 + 124a dated note), then the pre-commit wiring.

2026-11-20 BL-V2LIST round 3 (A): page --check wired into pre-commit; budget evidence re-measured (registry_s 33.19 s).

2026-11-20 BL-V2LIST round 3 report.

2026-11-20 BL-V2LIST round 3: row for docs/reference/** (task-406's own Files path matched no row).

2026-11-20 BL-V2LIST round 4: drift test for the surface-contract-routes row (operator MORNING-DECISIONS.md:1517).

2026-11-20 BL-V2LIST round 4 report.

2026-11-20 BL-V2LIST round 5: test extended for Specs 135 and 136 on the contract routes (operator 1-5 y, MORNING-DECISIONS.md:1520).

2026-11-20 BL-V2LIST round 6: skip stated by name in the drift test; pin attribution corrected (operator confirmed 33.2 s, MORNING-DECISIONS.md:1526).

2026-11-20 BL-V2LIST round 6: pin attribution corrected in the seed, migration 334 and a 124a correcting note.

2026-11-20 BL-V2LIST round 7: golden snapshot globs in the table's exempt key; material only, list resolution unchanged (operator 1-5 y, MORNING-DECISIONS.md:1520, item 3).

Dated note 2026-11-21 (M-246, prior text kept; RR-0353 · task-406 · Backlog; operator, verbatim: "let's resolve the scorecard the right way")

Dated note 2026-11-21 (M-246, prior text kept; RR-0355 · task-406 · Backlog; operator, verbatim: "Agreed. Let's push as soon as possible! Also recolve the scorecards issue now. The gaps are closed in parellel.")

Dated note 2026-11-21 (M-246, prior text kept; RR-0362 · task-406 · Backlog; operator, verbatim: "y")

2026-11-24 (task-453 SEARCHFIX.5): finding eng-back#2 (D9, docs/reports/reviews/mcfixreborn-g4/GROUNDER-D.md:117) stays with this task: migration 334 is not edited on task-453 (an applied migration; scripts/migrate.js stores its checksum and --verify fails on a change; no ruling names the edit).
<!-- SECTION:NOTES:END -->
