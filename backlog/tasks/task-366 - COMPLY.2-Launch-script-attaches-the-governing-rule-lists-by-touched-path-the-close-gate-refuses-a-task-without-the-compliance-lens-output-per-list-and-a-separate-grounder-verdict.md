---
id: TASK-366
title: >-
  COMPLY.2 Launch script attaches the governing rule lists by touched path; the
  close gate refuses a task without the compliance lens output per list and a
  separate grounder verdict
status: RUNNING
assignee:
  - '@lane-BL-COMPLY2'
created_date: '2026-11-20T13:04:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix D
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-COMPLY2/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-COMPLY2/FINDINGS.md
type: build
ordinal: 66012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "Add the tasks to incr 1b - the infa freeze needs to be lifted again - what is the point of building a mess - wasted effort." Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: compliance tooling tasks into 1·B". Scope now: (1) a data table mapping path globs to rule lists, used whole: pipeline steps, compute and migrations -> Spec 132 handbook, the Airtight V1 to V3 sources, Spec 133 for by-law rows, engineering standards; src/app/api and src/lib -> engineering standards sections 2, 4, 10, 11, McStorage policy when a report is computed or stored, fe.38 and fe.39 on the lookup; scripts/surfaces, content, bindings -> Spec 136 (all 44 rules) and Spec 128; mobile/ -> Specs 90, 98, 99, 100, 96 and Spec 136; queue and records -> Spec 137 and Spec 08. (2) scripts/analysis/backlog-lane.mjs reads the task Files line, attaches the lists to the brief and the lens line; (3) the close refuses BUILT unless a compliance lens output exists per attached list and a grounder verdict file written by an agent that is not the lane; (4) reuse the existing rule maps where they already map file to rule (task-365 reports which do). No hand-picked clauses anywhere. Waits on: task-365 report.

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, scripts/hooks/check-lane-close.mjs, scripts/hooks/check-task-files.mjs, scripts/lib/review-template.js, scripts/deepseek-review.js, .husky/commit-msg, src/tests/backlog/, src/tests/review-template.logic.test.ts, src/tests/hooks-composition.infra.test.ts, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, .claude/review-templates/README.md, .claude/review-templates/lens-compliance.md, src/tests/review-lens-template.infra.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The path to rule-list table is data, with a test that every listed rule file exists
- [ ] #2 A brief for a task touching mobile/ and src/app/api names every list in the table for those paths (test, red first)
- [ ] #3 Close is refused without one lens output per attached list (test, red first)
- [ ] #4 Close is refused without a grounder verdict file from a different agent (test, red first)
- [ ] #5 Spec 08 and Spec 137 carry the dated note with the operator words
<!-- AC:END -->

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
## Build (one step per acceptance criterion)
1. scripts/analysis/rule-lists.json (data): `lists` {id: file, whole | sections[], generated_by, status?}, `rows` [{id, globs | globs_from, imports_from?, lists[], why}], `exempt` globs (docs/reports/lanes, docs/reports/reviews), `increment_docs` (milestone group letter to doc), `no_files_default` (record-only type to a row). Added to the starting rows, named: a lane-tools row (scripts/analysis, scripts/hooks, .husky, .claude) and a tests row (src/tests), else this lane's own Files line is refused. Spec 124 R-BA lives in 124a_step_standard_policy_appendix.md (section B10, V3 rows B12), not Spec 124: starting row corrected. Test 1: every list file exists, every section selector resolves to exactly one heading, every row glob matches at least one tracked path.
2. scripts/analysis/rule-lists.mjs: loader/validator, `filesLine(body)`, `resolve(table, entries, root, type, milestone)` returning lists with their rows and why, unmatched entries, a refusal reason; `listText` (whole file or sections, fence aware); `lens-input` CLI (list part first, then the material, split by the list own headings when list + material would pass the review tool bound, bound measured on the exact prompt through scripts/lib/review-template.js, never trims). scripts/analysis/backlog-lane.mjs: refuse at launch (exit 3, path named) a task with no Files line (record-only type gets the queue row lists) or a Files entry no row matches; put into the brief inputs the block "Rule lists that govern this task" (each list: file, selection, why, status; READ WHOLE before planning) and change the lens line to one compliance run per list through the helper; the session rule "a separate grounder rules on every finding" is written into the same generated text. Test 2 (red first): mobile file + API route brief names every list of both rows; an unmatched path and a missing Files line are refused.
3. scripts/hooks/check-lane-close.mjs, one line in .husky/commit-msg after check-task-files: a commit with `Task: task-N` whose task file in the index moves status to BUILT or DONE (task has an @lane-* assignee) must find docs/reports/lanes/<date>/<lane>/ holding, per attached list, a compliance lens output (out-compliance-<list id>.txt or plan-compliance-<list id>.txt, with -pN parts contiguous, each ending in a VERDICT line), and GROUNDER.md with `Grounder:` and `Lane:` headers that differ (and differ from the task lane) and one verdict line `<finding id> CONFIRMED|REJECTED <file:line>` per finding (a BUG or DEFER line of any plan-*.txt or out-*.txt file; id = <file stem>#<n>). Build and fix tasks always need GROUNDER.md; other types only when a finding exists. Form and presence only. Exempt: no Task trailer, no lane assignee, not a status move, merge commit. Test 3 (red first): refuses missing lens output, missing grounder file, Grounder equal to Lane, finding id without a verdict line; passes when all present.
4. Records: dated note with the operator words in 08_agents.md (section 7 rule 4 area and 5.3) and 137_mcqueue.md; .claude/review-templates/README.md section "Rule lists"; task notes through the backlog CLI.
5. Enabling fix named: scripts/lib/review-template.js substitutePlaceholders uses String.replace with the text as replacement (expands `$&` `$'` and re-substitutes placeholder tokens inside the pasted list): single pass with a function replacer, one test. Without it "pasted whole" is not true for specs containing `$`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-COMPLY2, worktree /Users/brettpreston_macmini/Buildo-wt-comply2, branch wf1/inc1b-comply2), RR-0240

2026-11-20 BL-COMPLY2: plan lenses (compliance, code-review, error-paths) run and folded (TRIAGE.md in the lane report); red proven by a refused commit (40 failing tests, red.out); green commit carries rule-lists.json (the table), rule-lists.mjs, backlog-lane.mjs attach, check-lane-close.mjs (commit-msg), the notes in 08_agents.md and 137_mcqueue.md, the README Rule lists section. Reused: mcbylaws/protected-paths.json layer23 and frontend (globs_from). Task stays RUNNING: grounder owed.

2026-11-20 BL-COMPLY2 round 1: output lenses run (compliance per list, code-review, error-paths); coordinator's grounder found the first close check satisfiable by shortcuts; hook rebuilt red-first (red3.out): lens set by type, Ruled sha256 and count per output, quote checked against the repo, grounder not the lane or any assignee, no exemption for code. Task stays RUNNING: grounder owed.

2026-11-20 BL-COMPLY2 report in the repo: docs/reports/lanes/2026-11-20/BL-COMPLY2/ (REPORT.md, FINDINGS.md 128 findings by id, TRIAGE.md, plan and output lens outputs). Dogfood: closeErrors on this dir refuses only for the missing GROUNDER.md. STATUS ready, task RUNNING, grounder owed.

2026-11-20 BL-COMPLY2 round 2 (grounder attacks, 13 got through): close check now runs for every staged task file that moves to a finished status (any trailer or none, the board job included); REVIEW header from the review tool bound to the committed input and the whole-list hash; TASK-scoped lane dir; Files against the diff; no-assignee and dropped-assignee refused; self-edit rule; grounder name clash, quote and reason minimums, loose finding count; launch: table override refused, exempt-only Files refused, rows for components, app, middleware, package.json, .github and surface importers. Red: red4.out. Task stays RUNNING: grounder owed.

2026-11-20 BL-COMPLY2: table rows may exclude paths (not): scripts/deepseek-review.js and scripts/gemini-review.js are lane tools, not step shells (red5.out, then green). Task stays RUNNING: grounder owed.

2026-11-20 BL-COMPLY2 round 3 report in the repo (docs/reports/lanes/2026-11-20/BL-COMPLY2/): attack table, 178 findings by id, round-3 lens outputs with REVIEW headers and committed inputs, TASK file. Dogfood: only GROUNDER.md missing. Task stays RUNNING: grounder owed.

2026-11-20 BL-COMPLY2: three rows (specs-docs, specs-mobile, specs-web-admin) so a task that edits spec files resolves (task-376); red6.out then green.

2026-11-20 BL-COMPLY2: defect fixed: a --spec launch dropped the generated rule-list block (the given spec replaced the generated one); now a merged copy task.merged.json goes to brief.mjs. One Files reading (rule-lists.mjs filesEntries) used by the launch and check-task-files (inline form accepted). red7.out then green.

McFix V2 review 2026-11-20 (orchestrator recommendation, not a ruling; status not changed by hand): Built; extended by McFix V2 (the same check asked at the fold). Closes with its grounder file under task-405.
<!-- SECTION:NOTES:END -->
