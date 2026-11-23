---
id: TASK-448
title: >-
  FINAL.11 Review cost: each task is reviewed against the right rule lists only
  (rule table rows turned off), and the launch brief states the round-2 record
  form
status: LATER
assignee: []
created_date: '2026-11-23T20:11:00Z'
updated_date: '2026-11-23T21:07:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-448/GROUNDER-PLAN.md
  - docs/reports/reviews/task-448/TRIAGE-PLAN.md
  - docs/reports/reviews/task-448/seat-integration-1.md
  - docs/reports/reviews/task-448/seat-reality-check-1.md
  - docs/reports/reviews/task-448/seat-regression-1.md
type: build
ordinal: 148012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-23 by the orchestrator, Spec 137 rule 2, on the operator's rulings. RR-0418 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2140 and :2144, verbatim: "IT was these"): a front-end task is reviewed against the front-end handbook (Spec 136), the engineering standard, the four lenses and the four every-task lists; the back end the same with its own handbook; the queue, agent, policy and orchestrator-note lists and the old source specs are turned off in the existing table; nothing new is built. RR-0419 (:2149, verbatim: "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?"): one task. RR-0420 (:2155): the other review-cost problems join it. RR-0421 (:2161, verbatim: "1-4 recommendations approved"): 1 a old source specs 126, 127, 128, 135 off on every row (reverses RR-0383); 2 a phone rows keep mobile-90, mobile-98, mobile-99 and lose mobile-100, mobile-96; 3 a the four Airtight lists and storage-doc16 off; 4 a the lane-tools row keeps its process lists, every other row loses them. RR-0422 (:2166, verbatim: "Minimum and 1a. Let's add these small fixes to the cost review task."): the Minimum package; scripts/hooks/check-lane-close.mjs is NOT edited, except as RR-0424 says below. RR-0423 (:2171, verbatim: "add teh first two.  Plan approved.  Move forward with the task"). RR-0424 (:2176-2177, verbatim: "add it"): task 448 also changes the one refusal-message clause at scripts/hooks/check-lane-close.mjs:502 (text only; the only edit to that file) with the one test comment at src/tests/backlog/check-lane-close.logic.test.ts:346. WHY, measured: task-367's output review resolved 16 lists (961,597 characters, 78 DeepSeek calls, 285 findings to rule); with the table edit it resolves 6 lists (113,259 characters). THIS TASK, all of it turning things off or correcting text: (1) scripts/analysis/rule-lists.json: the row edits of PLAN-418-v1 section D as restated with RR-0421 in PLAN-418-part2-v2 (16 rows with a lists change; a not on the bylaw and lane-tools rows for prereg-MF files; the panel-records glob gains prereg-MF-*.json), and the why text of each changed row made true again (for example :152 and :140); (2) the tests that pin the table, edited first and seen red: src/tests/backlog/rule-lists.logic.test.ts, rule-lists-table.logic.test.ts, backlog-lane.logic.test.ts (including :552, named by the plan grounder); (3) the regenerated page docs/reports/generated/rule-lists-by-kind.md in the same commit; (4) scripts/analysis/backlog-lane.mjs:188, one sentence: a fix round re-makes every review file under the same names and round 1 is named by a history line (task-446, d04026fe5), with one test line; (5) dated notes in docs/specs/00-architecture/08_agents.md and 137_mcqueue.md for the rulings, including that the plan grounder writes the fold check itself, once, after the last fold (only if the plan grounder rules Spec 08 section 11.2 and the gate allow it). NOT in this task: any edit to rule-lists.mjs, any edit to check-lane-close.mjs other than the one clause at :502 (RR-0424), any new tool, hook, key or role. Inputs (outside the repo, saved verbatim): ~/Buildo-scratch/lanes-20261119/inc1b/lists418/PLAN-418-v1.md, GROUNDER-PLAN-418-v1.md (PASS WITH CORRECTIONS, nine corrections), PLAN-418-part2-v2.md. Known limit, told to the operator: tasks already launched are judged by the table at their own base; this helps every task launched after it lands. Principles served: simple, standardized, understandable.

Files: scripts/analysis/rule-lists.json, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts
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
# PLAN-448-v1

Task: task-448 (FINAL.11, build, milestone m-1). Plan seat: Opus, read-only (RR-0385 item 1, MD:1917).
- Board: ~/Buildo-wt-board, read at a75713110 ("docs(137_mcqueue): board edits 2026-11-23 15:11"). The plan grounder re-read it at ad4caeff5. Since a75713110 the board gained the task file, two decision files (decision-209, RR-0424, and a push-order decision) and the landing of task-367. Every file and line cited below is unchanged, except the Spec 136 handbook and the generated page: surface-136 is now 90 characters longer, so each total of section 0 that holds it is 90 higher (mobile/src/app/ 308,007 and 216,416; the Spec 100 file 395,206 and 222,343; the task-367 and task-442 totals 113,349 after the edit).
- Commands run: git, grep, sed, the backlog viewer, `rule-lists.mjs check-tasks` (it only prints), and in-memory node runs of resolveTask, validateTable, checkTasks, listBlocks and buildLensInputs on a copy of the table with the edits below. No test runner was run and nothing was written.
- Paths are relative to the board. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.
- Inputs: PLAN-418-v1.md; GROUNDER-PLAN-418-v1.md (nine corrections, all applied); PLAN-418-part2-v2; GROUNDER-PLAN-418-part2.md (corrections 1-3, 6 and 7 applied; the C3, P4, C2 and FULL corrections do not apply to MINIMUM). All in ~/Buildo-scratch/lanes-20261119/inc1b/lists418/.
- Principles served: simple (data and text only), standardized (task-439's form), understandable (each changed row says what it now attaches).
- It adds no infrastructure (RR-0392, MD:1975).

## 0. Facts verified

Rulings, with the verbatim words at these MD lines:
- RR-0418: :2140 "TWe only want to run these tings off not rewrite a new feature. This is simple." and :2144 "IT was these". decision-203.
- RR-0419: :2149 "Approved. Are there any other surprises in teh reviews that sonnet or anybody else does?". decision-204.
- RR-0420: :2155. decision-206.
- RR-0421: :2161 "1-4 recommendations approved". decision-205. This is 1a, 2a (keep 90, 98, 99), 3a and 4a.
- RR-0422: :2166 "Minimum and 1a. Let's add these small fixes to the cost review task." decision-207.
- RR-0423: :2171 "add teh first two.  Plan approved.  Move forward with the task". decision-208.
- RR-0424: :2176-2177, operator verbatim "add it". decision-209. Task 448 also changes the one refusal-message clause at scripts/hooks/check-lane-close.mjs:502 (text only) and one test comment at src/tests/backlog/check-lane-close.logic.test.ts:346. It is the only edit to the close check; the rest of RR-0422 stands.

Where each judge reads its table:
- **Launch gate:** the board's table (backlog-lane.mjs:78).
- **Close:** the range base's table (check-lane-close.mjs:766-767, :842).
- **A task whose Files line names the table** is judged by its own branch table, with exempt, base_ref, finished_statuses, protected_paths and every_task pinned (:840-842).
- **Self-edit rule:** a commit that changes a protected path may not also close a task (:753). rule-lists.json is protected (rule-lists.json protected_paths).

Measured in memory (edited table, letter S unless named):

| Files line | before | after |
|---|---|---|
| task-367 | 16 lists, 962k characters | 6 lists, 113k: surface-136, eng-all, five-words, plan-protocol, inc-S, ms-S |
| task-442 | 13 lists, 707k | the same 6, 113k |
| mobile/src/app/ | 12 lists, 307,917 | 10 lists, 216,326 |
| docs/specs/03-mobile/100_mobile_parcel_cost_tool.md | 13 lists, 395,116 | 9 lists, 222,253 |

Other measurements:
- `validate` on the edited table returns [].
- `check-tasks`: 0 bad before and after, and the same resolve count before and after the edit. The count moves with the board: 102 at a75713110, 103 at daf3f7201 and 1058a5b24 (task-448 itself counted), 102 at ad4caeff5 (task-367 closed).
- The record-only default row (queue-records) attaches no list.
- **Task-367 output calls per round: 78 → 18,** measured on the committed kept outputs. It would be 13 only if the context file is smaller. Round-1 findings to rule: 285 → 63.

Known loss under RR-0421 item 1a and 4a (part-2 grounder correction 1):
- **Task-442:** its one fixed finding (the stale `next:` field of the MF-97 status line, out-compliance-orchestrator-doc17#2) came from a list now off. It would no longer be caught.
- **Task-367:**
  - The FE-51 defect was also raised by 24 kept-list findings (counted by the plan grounder on the committed outputs of BL-HB367 at 9f47c3454, any spelling of FE-51; 14 of them write FE-51 exactly), so a fix would still be forced.
  - Its other three wording defects (agents-s7-s11, policy-124 and surface-126/135 findings) would no longer be caught.

## 1. Scope

1. scripts/analysis/rule-lists.json:
   - lists changed on 16 rows;
   - a `not` on the bylaw and lane-tools rows;
   - one glob added on panel-records;
   - the `why` text of each changed row, and of the surfaces row, made true again;
   - one `$comment` phrase corrected.
2. Test edits in three files, written first and seen red.
3. The regenerated page docs/reports/generated/rule-lists-by-kind.md, in the work commit (pre-commit :44 runs `page --check`).
4. One sentence in scripts/analysis/backlog-lane.mjs:188 (the round-2 record form), with one test line.
   - By RR-0424 (decision-209), also one clause of the refusal message at scripts/hooks/check-lane-close.mjs:502 and one comment at src/tests/backlog/check-lane-close.logic.test.ts:346, text only (section 3.3a).
5. Dated notes:
   - one under Spec 08 section 7 rule 4;
   - one under Spec 08 section 11.2 (the fold check);
   - one in Spec 137.

## 2. NOT in scope

- No edit to scripts/analysis/rule-lists.mjs (RR-0422). The only edit to scripts/hooks/check-lane-close.mjs is the one refusal-message clause at :502, text only and no logic (RR-0424, decision-209; section 3.3a).
- No new key, tool, hook, file kind or role.
- No change to `exempt`, `every_task`, `kinds` or any list definition. The lists stay defined; they are only unattached.
- Not fixed, known stale texts:
  - rule-lists.mjs:257 says a record task "defaults to the queue lists" (the file may not be edited);
  - the comment at backlog-lane.mjs:12 says the same (the card names one sentence in that file).
- The refusal clause at check-lane-close.mjs:502 is changed here (RR-0424, section 3.3a); nothing else in the close check is.

## 3. The exact texts

### 3.1 rule-lists.json: lists, `not` and glob

Line numbers are as read at a75713110, before any insert. Edit by the unique old text. Add a `not` key only if the row has none yet, so that a repeated edit adds no second key. Lines :163, :182 and :188 are identical, so those three are anchored with their row's globs line.

| row | line | old | new |
|---|---|---|---|
| step-pipeline | :88 | `"lists": ["step-132", "airtight-124a", "airtight-v3-122", "airtight-v2-122", "airtight-122a", "eng-back", "eng-shared"],` | `"lists": ["step-132", "eng-back", "eng-shared"],` |
| bylaw | after :93 | — | insert `      "not": ["scripts/analysis/bylaw-validation/coa-expected/prereg-MF-**"],` |
| surface-importers | :120 | `"lists": ["surface-126", "surface-128"],` | `"lists": [],` |
| surface-contract-routes | :126 | `"lists": ["surface-126", "surface-128", "surface-135", "surface-136"],` | `"lists": ["surface-136"],` |
| storage | :132 | `"lists": ["storage-doc16"],` | `"lists": [],` |
| compute-import | :139 | `"lists": ["step-132", "airtight-124a", "airtight-v3-122", "airtight-v2-122", "airtight-122a"],` | `"lists": ["step-132"],` |
| mobile | :151 | `"lists": ["mobile-90", "mobile-98", "mobile-99", "mobile-100", "mobile-96", "surface-136", "eng-front", "eng-shared"],` | `"lists": ["mobile-90", "mobile-98", "mobile-99", "surface-136", "eng-front", "eng-shared"],` |
| queue-records | :157 | `"lists": ["queue-137", "agents-s7-s11"],` | `"lists": [],` |
| lane-tools | after :162 | — | insert `      "not": ["scripts/analysis/bylaw-validation/coa-expected/prereg-MF-**"],` (lists :163 unchanged) |
| generated-reports | :170 | `"lists": ["policy-124-s2-s5", "agents-s5-1to3", "agents-s7-s11", "queue-137", "eng-all", "orchestrator-doc17"],` | `"lists": ["eng-all"],` |
| generated-127 | :176 | `"lists": ["surface-127", "policy-124-s2-s5", "agents-s5-1to3", "agents-s7-s11", "queue-137", "eng-all", "orchestrator-doc17"],` | `"lists": ["eng-all"],` |
| policy-reports | :181-182 | `"globs": ["docs/reports/policy/**"],` + next line `"lists": ["agents-s5-1to3", "agents-s7-s11", "queue-137", "eng-all", "orchestrator-doc17"],` | same globs line + `"lists": ["eng-all"],` |
| reference-docs | :187-188 | `"globs": ["docs/reference/**"],` + the same lists line | same globs line + `"lists": ["eng-all"],` |
| panel-records | :193-194 | `"globs": ["docs/reports/panels/**"],` / `"lists": ["surface-128", "surface-126", "agents-s7-s11", "queue-137"],` | `"globs": ["docs/reports/panels/**", "scripts/analysis/bylaw-validation/coa-expected/prereg-MF-*.json"],` / `"lists": [],` |
| review-followups | :200 | `"lists": ["agents-s7-s11", "queue-137"],` | `"lists": [],` |
| specs-docs | :206 | `"lists": ["eng-all", "agents-s7-s11", "queue-137"],` | `"lists": ["eng-all"],` |
| specs-mobile | :212 | `"lists": ["mobile-90", "mobile-98", "mobile-99", "mobile-100", "mobile-96", "surface-136"],` | `"lists": ["mobile-90", "mobile-98", "mobile-99", "surface-136"],` |
| specs-web-admin | :218 | `"lists": ["surface-136", "surface-126", "surface-127", "surface-128", "surface-135"],` | `"lists": ["surface-136"],` |

Why each special edit is needed:
- **The bylaw `not`** is needed under every option (part-1 grounder correction 3).
- **The lane-tools `not` and the panel-records glob** are needed under 4a: without them, a front-end MF pre-registration pulls in the by-law and lane-tools lists.
- **The `**` form is required:** the resolver also probes `<path>/x` (PLAN-418 section B).

### 3.2 rule-lists.json: `why` and `$comment`

RR-0423 item 1 (decision-208): the stale why notes are made true. Where a why says that a list governs a row and the list is now off, the false clause is rewritten in place (old text, then new text, below, both without the closing quote of the JSON string, which stays); it is not left standing beside a sentence that contradicts it. Where the why is still true (:95, :164, :213), the task-448 sentence is appended after the arrow, immediately before the closing `"` of the old anchor. Every old text is unique in the file, except the one replaced on :146 and :152. The test-pinned phrases stay byte for byte, because none of them is inside a replaced text (a grep of src/tests finds no other why phrase pinned): "nearest lists, no governing spec: operator ruling owed" (:183), "no governing spec found: operator ruling owed" (:189), "left out for Increment 1·B", "The client is just glass" and "one API route" (:127).

- **:89, in place:**
  - old: `are governed by the step handbook (Spec 132), the Airtight sources (Spec 124 R-BA, 122 V3 checklist and V2, 122a A26 and A27) and engineering standards sections 3 and 9.`
  - new: `are governed by the step handbook (Spec 132) and engineering standards sections 3 and 9; until task-448 (RR-0421 item 3 a, decision-205) they were also governed by the Airtight sources (Spec 124 R-BA, 122 V3 checklist and V2, 122a A26 and A27), which are off (every Airtight rule id has a line in Spec 132, at the id level only).`
  - old: `which the step handbook and the Airtight sources govern (the paths RUNNING`
  - new: `which the step handbook governs, and until task-448 the Airtight sources did (the paths RUNNING`
- **:95, anchor `Spec 133 R-LD) are governed by the by-law handbook rules"`** → `. task-448 (RR-0418, decision-203): an MF pre-registration (coa-expected/prereg-MF-**, a front-end record) is excluded by not and takes no by-law list`
- **:121, in place:**
  - old: `and is governed by the surface contract (Spec 126) and the surface policy (Spec 128)`
  - new: `and was governed by the surface contract (Spec 126) and the surface policy (Spec 128) until task-448 (RR-0421 item 1 a, decision-205, reverses RR-0383): Specs 126 and 128 are off; this row attaches no list`
- **:127, in place:**
  - old: `are contracts of the programme and get the surface standard (Spec 126) and the surface standard policy (Spec 128).`
  - new: `are contracts of the programme and got the surface standard (Spec 126) and the surface standard policy (Spec 128) until task-448 (see the end of this text).`
  - old: `Specs 135 and 136 are attached to these routes: item 2`
  - new: `Specs 135 and 136 were attached to these routes (Spec 135 until task-448): item 2`
  - old: `a drift test (rule-lists-table.logic.test.ts) fails when they differ`
  - new: `a drift test (rule-lists-table.logic.test.ts) fails when they differ. task-448 (RR-0421 item 1 a, decision-205; it takes off what the operator answer 1-5 y, MORNING-DECISIONS.md:1520 item 2, attached to these routes, and reverses RR-0383): Specs 126, 128 and 135 are off; this row attaches surface-136 only`
- **:133, in place:**
  - old: `is governed by the McStorage policy (doc-16; DRAFT, attached anyway: the operator confirms it binds)`
  - new: `was governed by the McStorage policy (doc-16; DRAFT, attached anyway: the operator confirms it binds) until task-448 (RR-0421 item 3 a, decision-205): doc-16 is off; this row attaches no list`
- **:140, in place:**
  - old: `gets the step standard and Airtight lists, because the compute gates scan scripts/lib/compute by path only`
  - new: `gets the step standard list (Spec 132) because the compute gates scan scripts/lib/compute by path only; until task-448 it also got the four Airtight lists (RR-0421 item 3 a, decision-205: off)`
- **:146 and :152, replace both occurrences:**
  - old: `A task that edits one of those specs gets them through the specs-web-admin row (RR-0383, decision-168)`
  - new: `A task that edited one of those specs got them through the specs-web-admin row until task-448 (RR-0383, decision-168); RR-0421 item 1 a (decision-205) reverses RR-0383, so no row attaches them now`
- **:152, opening:**
  - old: `"why": "the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136;`
  - new: `"why": "the mobile app is governed by Specs 90, 98, 99 and Spec 136 (Specs 100 and 96 were attached until task-448; RR-0421 item 2 a, decision-205, keeps the three protocols);`
- **:158, in place:**
  - old: `queue, board and records are governed by Spec 137 and Spec 08 sections 7 and 11`
  - new: `queue, board and records were governed by Spec 137 and Spec 08 sections 7 and 11 until task-448 (RR-0418, decision-203; RR-0421 item 4 a, decision-205): Spec 137 and Spec 08 are off on this row and on the record-only default; this row attaches no list (the every-task lists still apply)`
- **:164, anchor `coverage review 2026-11-20: unmatched); the engineering standards are attached whole (eng-all)"`** → `. task-448 (RR-0421 item 4 a, decision-205): the only row that keeps these lists; an MF pre-registration under scripts/analysis/** is excluded by not and takes none of them`
- **:171, in place:**
  - old: `and the role banner rule R-GW (list policy-124-s2-s5: sections 2 and 5 of Spec 124), with the lane-tools lists as before`
  - new: `and the role banner rule R-GW; until task-448 (RR-0421 item 4 a, decision-205) the review also got the list policy-124-s2-s5 (sections 2 and 5 of Spec 124) and the lane-tools lists, which are off: this row attaches eng-all only (Rule 13 stays enforced by gate J)`
- **:177, in place:**
  - old: `keep the surface conversion procedure (Spec 127: surface-127) and also get the Spec 124 Rule 13 list and the lane-tools lists`
  - new: `kept the surface conversion procedure (Spec 127: surface-127) and also got the Spec 124 Rule 13 list and the lane-tools lists until task-448 (RR-0421 items 1 a and 4 a, decision-205): surface-127, the Spec 124 list and the lane-tools lists are off; this row attaches eng-all only`
- **:183, in place:**
  - old: `The lane-tools lists are attached as the nearest and are NOT presented as governing`
  - new: `Until task-448 the lane-tools lists were attached as the nearest and were NOT presented as governing (RR-0421 item 4 a, decision-205: they are off; this row attaches eng-all only)`
- **:189, in place:**
  - old: `the lane-tools lists are attached as the nearest and are NOT presented as governing`
  - new: `until task-448 the lane-tools lists were attached as the nearest and were NOT presented as governing (RR-0421 item 4 a, decision-205: they are off; this row attaches eng-all only)`
- **:195, in place:**
  - old: `and Spec 137 govern it`
  - new: `and Spec 137 governed it until task-448 (RR-0421 items 1 a and 4 a, decision-205): they are off; this row attaches no list and also matches the MF pre-registration files (coa-expected/prereg-MF-*.json) so they resolve`
- **:201, in place:**
  - old: `govern it; before this row a lane could not write the file`
  - new: `governed it until task-448 (RR-0421 item 4 a, decision-205): they are off and this row attaches no list; the row still lets a lane write the file (before this row a lane could not write the file)`
- **:207, in place:**
  - old: `(the list the table already names for them), Spec 08 sections 7 and 11 and Spec 137; backlog/docs/** is already matched`
  - new: `(the list the table already names for them); until task-448 (RR-0421 item 4 a, decision-205) it was also governed by Spec 08 sections 7 and 11 and Spec 137, which are off on this row, so it attaches eng-all only; backlog/docs/** is already matched`
- **:213, anchor `checked against the rules it must not contradict)"`** → `. task-448 (RR-0421 item 2 a, decision-205): Specs 100 and 96 are off; this row attaches mobile-90, mobile-98, mobile-99 and surface-136`
- **:219, in place:**
  - old: `this row keeps all five surface lists after the surfaces and mobile rows drop the four specs, so an edit to a surface spec is reviewed with that spec`
  - new: `this row kept all five surface lists after the surfaces and mobile rows dropped the four specs, so an edit to a surface spec was reviewed with that spec until task-448 (RR-0421 item 1 a, decision-205, reverses RR-0383): Specs 126, 127, 128 and 135 are off; this row attaches surface-136 only`
- **:6, `$comment`:**
  - old: `(record-only tasks get the queue lists)`
  - new: `(record-only tasks: the queue-records row, which attaches no list since task-448, RR-0418; such a task gets the every-task, increment and milestone lists only)`

### 3.3 backlog-lane.mjs:188 (one sentence, inside the `layout` template literal; no backtick in the new text)

- **Old:** `the second (fix) round (r2; two output rounds at most, RR-0385) is filed beside them as out-<lens>[-<list id>]-rN.txt with its in-<same name>: the close check reads it for findings like any out- file (each finding needs a verdict) and the round-1 file stays;`
- **New:** `the second (fix) round (r2; two output rounds at most, RR-0385): the fix commit changes the diff, so no round-1 input or output still matches it; round 2 re-makes ALL of them under the SAME names (overwrite out-<lens>[-<list id>][-pN].txt and in-<same name>, then a new GROUNDER.md and TRIAGE.md); the round-1 GROUNDER.md and TRIAGE.md are kept outside the folder and named by one line "Review round 1: <counts>; grounder <path>; triage <path>" added once to the Final Summary, in a commit of its own before the closing commit (task-446, d04026fe5); a file out-<lens>[-<list id>]-rN.txt is read for findings like any out- file but never stands in for a round-1 name;`
- The parity fragment `out-<lens>[-<list id>]-rN.txt` is kept, so backlog-lane.logic.test.ts:290 and :298 stay green.
- The history line matches the round count the close reads (check-lane-close.mjs:274-275: it counts the "Review round N:" lines of the Final Summary at HEAD, so a line written twice, or in the closing commit itself, would count a round too many or too few).

### 3.3a check-lane-close.mjs:502 and its test comment (RR-0424, decision-209; text only)

- **File:** scripts/hooks/check-lane-close.mjs, line 502, the `layout` template literal. Only this clause changes. Edit by the old text; the diff is one line (A9).
- **Old:** `a later round (r2, r3, ...) is out-<lens>[-<list id>]-rN.txt`
- **New:** `a fix round (r2) re-makes every file under the same names, and an out-<lens>[-<list id>]-rN.txt file is read for findings like any out- file but never stands in for a round-1 name`
- The new clause holds no backtick and no dollar-brace, because it sits inside a template literal. It keeps the fragment `out-<lens>[-<list id>]-rN.txt` that backlog-lane.logic.test.ts:290 and :298 need in both sources, and it says what the brief sentence of 3.3 says. The refusal stays one line; no logic changes.
- **Test comment, src/tests/backlog/check-lane-close.logic.test.ts:346.** Old: `  // the form the brief gives for a later round: out-<lens>[-<list id>]-r2.txt beside the round-1 file (green-both: it holds before and after this task's edit; it pins what the brief now promises)`. New: `  // what the close check does with a round file out-<lens>[-<list id>]-r2.txt: it reads it like any out- file and it never stands in for a round-1 name; the brief and the refusal message now say the same (task-448, RR-0424; green-both: it holds before and after this edit)`.
- The title of the test at :347 stays: it is true (its last refusal shows that the round-1 file out-code-review.txt is still required when an -r2 file exists). No assertion changes.
- The red-first pin is the new parity fragment of section 4 (backlog-lane.logic.test.ts:290): red while either text lacks it.

### 3.4 Dated note, Spec 08 section 7 rule 4 (insert after 08_agents.md:356, before :357 "5. **Panel sizing**", with the same 3-space indent)

`   Dated note 2026-11-23 (M-246, prior text kept; task-448 FINAL.11, McFix Final; RR-0418, decision-203; RR-0421, decision-205; RR-0422, decision-207; RR-0423, decision-208; RR-0424, decision-209; operator, verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, :2140 "TWe only want to run these tings off not rewrite a new feature. This is simple.", :2144 "IT was these", :2161 "1-4 recommendations approved", :2166 "Minimum and 1a. Let's add these small fixes to the cost review task.", :2171 "add teh first two.  Plan approved.  Move forward with the task" and :2176 "add it"): rule lists are turned off in scripts/analysis/rule-lists.json; no logic, key or tool changes (one clause of the close check's refusal message is reworded, below). A front-end task is reviewed against Spec 136 section 2, its engineering lists, the four lenses and the four every-task lists (plan protocol, five words, increment requirements, milestone objectives); a back-end task the same with its own handbook. Off on every row: Specs 126, 127, 128 and 135 (RR-0421 item 1 a reverses RR-0383: the specs-web-admin row now attaches surface-136 only), Specs 100 and 96 (the phone rows keep 90, 98 and 99), the four Airtight lists and the McStorage draft policy (doc-16). Spec 08 sections 5.1 to 5.3, 7 and 11, Spec 137 and doc-17 stay on the lane-tools row only. The Spec 124 list (policy-124-s2-s5: Rule 13 and the role banner rule R-GW) is attached to no row, because the generated-reports and generated-127 rows lost it; Rule 13 stays enforced by gate J (scripts/analysis/gates/generated-docs.mjs) and the role banner by scripts/analysis/spec-split-check.mjs. The queue-records row attaches no list, so a record-only task with no Files line gets the every-task, increment and milestone lists only. MF pre-registration files (coa-expected/prereg-MF-*) resolve through the panel-records row and no longer take the by-law or lane-tools lists. This supersedes the words "(a record-only task gets the queue lists)" in the task-366 note of section 5.3 (:229), and in the task-439 note above (:356) the words "the mobile row keeps its five mobile lists" and "The specs-web-admin row keeps all five surface lists" and the clause that follows it there (that a task which edits a spec under docs/specs/02-web-admin/ is reviewed with that spec). Known loss, measured on tasks 367 and 442: findings that only the turned-off lists raised are no longer raised (442's stale next field; three of 367's four wording defects). Two residues follow from the table as ruled: a task whose Files line names only Spec 08, Spec 137 or the queue documents is no longer reviewed against them, because those rules reach a review only through a Files path on the lane-tools row; and a by-law pre-registration record (prereg-MB-*.json) is a file of scripts/analysis, so it keeps bylaw-133 and the five lane-tools lists (RR-0421 item 4 a). A task launched before this landing is judged at close by the table at its own range base, so it keeps its old lists unless it merges the board. The launch brief (scripts/analysis/backlog-lane.mjs) now says that a fix round re-makes every review file under the same names and that round 1 is named by a "Review round 1:" line in the Final Summary (task-446, d04026fe5); the refusal message of the close check (scripts/hooks/check-lane-close.mjs:502) carries the same clause, the only edit to that file (RR-0424, decision-209).`

### 3.5 Dated note, Spec 08 section 11.2 (insert after 08_agents.md:489, with a blank line before and after)

`Dated note 2026-11-23 (M-246, prior text kept; task-448 FINAL.11, McFix Final; RR-0423, decision-208; operator, verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2171 "add teh first two.  Plan approved.  Move forward with the task"): for a plan launch, the plan grounder itself writes FOLD-CHECK.md, once, after the last fold of the plan; no separate fold-check agent is run. Nothing else in this section changes: the check still re-executes every claim in the fold (:486), and the launch gate is unchanged: it reads only the form of FOLD-CHECK.md and that its checker is not the lane or an assignee (scripts/hooks/check-lane-close.mjs:692-712).`

### 3.6 Dated note, Spec 137 (insert a blank line and the note between 137_mcqueue.md:136 and :137, so that the blank line of :137 follows it)

`Dated note 2026-11-23 (M-246, prior text kept; task-448 FINAL.11, McFix Final; RR-0418, RR-0421, RR-0422, RR-0423 (decisions 203, 205, 207, 208); operator, verbatim, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2161 "1-4 recommendations approved" and :2171 "add teh first two.  Plan approved.  Move forward with the task"): the importer, census-route, panel-record, generated-127 and specs-web-admin rows of scripts/analysis/rule-lists.json no longer attach Specs 126, 127, 128 and 135 (RR-0421 item 1 a reverses RR-0383; for the census-route row it also takes off what the operator answer 1-5 y, MORNING-DECISIONS.md:1520 item 2, attached). The queue-records row, and with it a record-only task with no Files line, no longer attaches Spec 137 or Spec 08; only the lane-tools row keeps them (RR-0421 item 4 a). The words of the task-439 note above, "the specs-web-admin row and the importer, census-route, panel-record and generated-127 rows keep them", no longer hold. The Spec 08 section 7 rule 4 note of task-448 has the whole account.`

### 3.7 Spec 08 :361 (the task-437 rounds note): not stale

- Nothing in this plan changes the round cap, the round-2 MED form `ruling:RR-0385`, MEDIUM-LATER-ROUNDS.md, or what the close check counts.
- The new brief sentence names round 1 in the Final Summary. That agrees with :361, where the grounder's verdict line names the round, and with the close's "Review round N" count. No correction is owed.

## 4. TESTS FIRST

The lane writes these edits first. Line numbers below are as read at ad4caeff5, before any insert: edit by the old text. The lane stages only the three test files and the task file, and attempts the commit. The comment of check-lane-close.logic.test.ts and the code edits of 3.3a go in the work commit, not in the red attempt. The pre-commit related run (.husky/pre-commit:56) fails; that output is saved as red.out. Then the lane adds the table, brief, page and notes and commits green.

**src/tests/backlog/rule-lists.logic.test.ts**
- **:38-39**
  - old: `    const doc16 = res.lists.find((l) => l.id === 'storage-doc16');` and `    expect(doc16?.status).toMatch(/draft, operator to confirm it binds/);`
  - new (one line): `    expect(ids(res)).not.toContain('storage-doc16'); // task-448 (RR-0421 item 3 a)`
- **:49, title**
  - old: `'a src file that imports from scripts/lib/compute gets the step and Airtight lists (import row)'`
  - new: `'a src file that imports from scripts/lib/compute gets the step handbook list and no Airtight list (import row; task-448, RR-0421 item 3 a)'`
- **:53**
  - old: `    expect(ids(res)).toContain('airtight-v3-122');`
  - new: `    for (const l of ['airtight-124a', 'airtight-v3-122', 'airtight-v2-122', 'airtight-122a']) expect(ids(res)).not.toContain(l);`
- **:55, title:** `and a surfaces importer gets Specs 126 and 128'` becomes `and a surfaces importer no longer gets Specs 126 and 128 (task-448, RR-0421 item 1 a)'`
- **:61**
  - old: `    expect(ids(imp)).toEqual(expect.arrayContaining(['surface-126', 'surface-128']));`
  - new: `    for (const l of ['surface-126', 'surface-128']) expect(ids(imp)).not.toContain(l);`
- **:67**
  - old: `    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137', 'mobile-100', 'mobile-90', 'surface-136']) expect(mobile).toContain(l);`
  - new, line 1: `    for (const l of ['eng-all', 'mobile-90', 'mobile-98', 'mobile-99', 'surface-136']) expect(mobile).toContain(l);`
  - new, line 2: `    for (const l of ['agents-s7-s11', 'queue-137', 'mobile-100', 'mobile-96']) expect(mobile).not.toContain(l);`
- **:69**
  - old: `    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137', 'surface-128', 'surface-135']) expect(web).toContain(l);`
  - new, line 1: `    for (const l of ['eng-all', 'surface-136']) expect(web).toContain(l);`
  - new, line 2: `    for (const l of ['agents-s7-s11', 'queue-137', 'surface-128', 'surface-135']) expect(web).not.toContain(l);`
- **:71**
  - old: `    for (const l of ['eng-all', 'agents-s7-s11', 'queue-137']) expect(pipe).toContain(l);`
  - new: `    expect(pipe).toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-1', 'ms-1']);` (resolved in memory, this order)
- **:73:** `.toContain('queue-137');` becomes `.not.toContain('queue-137');`
- **Unchanged:** :146, which still resolves agents-s5-1to3 through lane-tools; and FILES_423 at :919, where `toHaveLength(9)` at :934 still holds (resolved in memory).

**src/tests/backlog/rule-lists-table.logic.test.ts**
- **:29, title**
  - old: `'a panel record (docs/reports/panels/**) gets Specs 128, 126, 08 sections 7 and 11, and 137'`
  - new: `'a panel record and an MF pre-registration get the four every-task lists only (task-448, RR-0421 items 1 a and 4 a); a by-law pre-registration keeps bylaw-133'`
- **:30**
  - old: `    expect(lists('docs/reports/panels/MF-94.json')).toEqual(expect.arrayContaining(['surface-128', 'surface-126', 'agents-s7-s11', 'queue-137']));`
  - new:
    - `    const four = ['five-words', 'plan-protocol', 'inc-S', 'ms-S'];`
    - `    expect(lists('docs/reports/panels/MF-94.json')).toEqual(four);`
    - `    expect(lists('scripts/analysis/bylaw-validation/coa-expected/prereg-MF-96-1.json')).toEqual(four);`
    - `    expect(lists('scripts/analysis/bylaw-validation/coa-expected/prereg-MB-18-1.json')).toContain('bylaw-133');`
  - Both pre-registration files are tracked at the head.
- **:32, title**
  - old: `'a generated report gets the Spec 124 list (Rule 13, R-GW) and not surface-127; a 127-* generated file keeps surface-127 and gets it too'`
  - new: `'a generated report and a 127-* generated file get eng-all and the four every-task lists only (task-448, RR-0421 items 1 a and 4 a)'`
- **:34-37**
  - old: `    expect(g).toContain('policy-124-s2-s5');`, `    expect(g).not.toContain('surface-127');`, `    const g127 = lists('docs/reports/generated/127-surface-registry.md');`, `    expect(g127).toEqual(expect.arrayContaining(['surface-127', 'policy-124-s2-s5']));`
  - new: `    expect(g).toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);` and `    expect(lists('docs/reports/generated/127-surface-registry.md')).toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);`
  - :38-40 (the policy list definition) unchanged.
- **:43:** `.toContain('queue-137');` becomes `.toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);`
- **:48:** `.toEqual(expect.arrayContaining(['queue-137', 'eng-all']));` becomes `.toEqual(['eng-all', 'five-words', 'plan-protocol', 'inc-S', 'ms-S']);`
- **:100, title:** `, and attaches Specs 126, 128, 135 and 136 (operator "1-5 y", MORNING-DECISIONS.md:1520, item 2)'` becomes `, and attaches surface-136 only (task-448, RR-0421 item 1 a; the four specs came from the operator's "1-5 y", MORNING-DECISIONS.md:1520, item 2)'`
- **:103:** `toEqual(['surface-126', 'surface-128', 'surface-135', 'surface-136']);` becomes `toEqual(['surface-136']);`
- **:115, title:** `gain all four surface lists;` becomes `get surface-136 and none of Specs 126, 128, 135 (task-448, RR-0421 item 1 a);`
- **:117-118**
  - old: the two lines `    expect(lists('src/app/api/parcels/lookup/route.ts')).toEqual(expect.arrayContaining(four));` and `    expect(lists('src/app/api/admin/media/route.ts')).toEqual(expect.arrayContaining(four));`
  - new:
    - `    for (const p of ['src/app/api/parcels/lookup/route.ts', 'src/app/api/admin/media/route.ts']) {`
    - `      expect(lists(p), p).toContain('surface-136');`
    - `      for (const l of four.slice(0, 3)) expect(lists(p), `${p}: ${l}`).not.toContain(l);`
    - `    }`
  - :116 and :119 unchanged.
- **:239, title:** `'the real table: the file resolves agents-s7-s11 and queue-137 through exactly one row'` becomes `'the real table: the file resolves through exactly one row, which attaches no list since task-448 (RR-0421 item 4 a)'`
- **:240:** `toEqual(expect.arrayContaining(['agents-s7-s11', 'queue-137']));` becomes `toEqual(['five-words', 'plan-protocol', 'inc-S', 'ms-S']);`
- **:243:** `toEqual(expect.arrayContaining(['agents-s7-s11', 'queue-137']));` becomes `toEqual([]);`
- **After :281 (new line, in the S1 test; the step-pipeline row had no pin):** `    for (const f of ['scripts/steps/x.json', 'scripts/lib/compute/x.js']) { expect(lists(f), f).toContain('step-132'); for (const l of ['airtight-124a', 'airtight-v3-122', 'airtight-v2-122', 'airtight-122a']) expect(lists(f), `${f}: ${l}`).not.toContain(l); } // task-448 (RR-0421 item 3 a)`. Evaluated by the plan grounder: red on the old table (the row holds the four), green on the new one.
- **:336**
  - old: `  const MOBILE = ['mobile-90', 'mobile-98', 'mobile-99', 'mobile-100', 'mobile-96', 'surface-136', 'eng-front', 'eng-shared'];`
  - new: `  const MOBILE = ['mobile-90', 'mobile-98', 'mobile-99', 'surface-136', 'eng-front', 'eng-shared']; // task-448 (RR-0421 item 2 a): 100 and 96 off`
- **:344:** the comment `keeps its other eight lists` becomes `keeps its six lists`. After :345, insert `    for (const l of ['mobile-100', 'mobile-96']) expect(lists('mobile/x.ts'), l).not.toContain(l);`
- **:353-354 unchanged:** the planted defect "mobile-99 dropped" still holds.
- **:356, title**
  - old: `'N2 (survive-the-fix, RR-0383): an edit to a surface spec still gets the four specs and Spec 136 through the specs-web-admin row (planted: that row on surface-136 only)'`
  - new: `'N2 (task-448, RR-0421 item 1 a reverses RR-0383): an edit to a surface spec gets Spec 136 and none of the four specs (planted: the four back on the specs-web-admin row)'`
- **:358:** `expect(lists(f), f).toEqual(expect.arrayContaining([...FOUR, 'surface-136']));` becomes `handbookOnly(lists(f), f);`
- **:359:** `.toEqual(expect.arrayContaining([...FOUR, 'surface-136']));` becomes `.toEqual(['surface-136']);`
- **:360:** `(r) => ({ ...r, lists: ['surface-136'] })` becomes `(r) => ({ ...r, lists: [...r.lists, ...FOUR] })`
- **:361**
  - old: `    expect(planted, 'planted: specs-web-admin on surface-136 only').not.toContain('surface-128');`
  - new: `    expect(() => handbookOnly(planted, 'planted: the four back on specs-web-admin')).toThrow();`
  - This is a control, true before and after (the plant adds the four to a row that already holds them): it proves that the lock of :358 and :359 can fail. N2's red comes from :358 and :359.
- **After the N2 test (new test in the same describe, where FOUR is in scope):**
  - `  it('task-448 (RR-0418, RR-0421): no row attaches Specs 126, 127, 128, 135, the four Airtight lists, doc-16, mobile-100, mobile-96 or the Spec 124 list, and only the lane-tools row attaches the queue, agent and doc-17 lists', () => {`
  - `    const OFF = [...FOUR, 'airtight-124a', 'airtight-v3-122', 'airtight-v2-122', 'airtight-122a', 'storage-doc16', 'mobile-100', 'mobile-96', 'policy-124-s2-s5'];`
  - `    for (const r of table().rows) {`
  - `      for (const l of OFF) expect(r.lists, `${r.id}: ${l}`).not.toContain(l);`
  - `      if (r.id !== 'lane-tools') for (const l of ['queue-137', 'agents-s5-1to3', 'agents-s7-s11', 'orchestrator-doc17']) expect(r.lists, `${r.id}: ${l}`).not.toContain(l);`
  - `    }`
  - `  });`
  - Evaluated by the plan grounder on the real rows: 51 offending (row, list) pairs on the old table, none on the new one. It is the check that no row not named above still attaches a turned-off list.

**src/tests/backlog/backlog-lane.logic.test.ts**
- **After :298, insert:** `      expect(e).toContain('under the SAME names'); // task-448 (RR-0422): a fix round re-makes the review files under the same names`
- **:290 (RR-0424; the red-first pin on both texts):**
  - old: `      for (const frag of [LAYOUT_NAMES, '(lens-plan/, lens-out/, stage2/)', 'out-<lens>[-<list id>]-rN.txt', 'fix-*.txt']) expect(src(p), `${p} lacks: ${frag}`).toContain(frag);`
  - new: `      for (const frag of [LAYOUT_NAMES, '(lens-plan/, lens-out/, stage2/)', 'out-<lens>[-<list id>]-rN.txt', 'fix-*.txt', 'never stands in for a round-1 name']) expect(src(p), `${p} lacks: ${frag}`).toContain(frag); // task-448 (RR-0424): the brief and the refusal message say the same`
  - Evaluated by the plan grounder on both sources: the old texts lack the fragment (red), the new texts of 3.3 and 3.3a hold it (green).
- **:400**
  - old: `    expect(inputs).toContain('draft, operator to confirm it binds');`
  - new: `    expect(inputs).not.toContain('storage-doc16'); // task-448 (RR-0421 item 3 a)`
- **:405**
  - old: `    for (const l of ['mobile-98', 'storage-doc16', 'inc-F']) {`
  - new: `    expect(extra).not.toContain('out-compliance-storage-doc16'); // task-448 (RR-0421 item 3 a)` followed by `    for (const l of ['mobile-98', 'inc-F']) {`
- **:548, title:** `but a record-only task gets the queue lists'` becomes `but a record-only task gets the every-task lists (the queue lists are off since task-448, RR-0418)'`
- **:552** (part-1 grounder correction 1)
  - old: `    expect(inputs).toContain('137_mcqueue.md');`
  - new: `    expect(inputs).not.toContain('137_mcqueue.md');` and `    expect(inputs).toContain('plan-protocol.md');`
- **:575:** `    expect(brief).toContain('storage-doc16');` becomes `    expect(brief).not.toContain('storage-doc16');`
- **Unchanged:** :574 and :576 (mobile-98 stays, 2a) and :681-683 (the prep fixture's lane-tools file still gets queue-137, 4a).

**src/tests/backlog/check-lane-close.logic.test.ts** (RR-0424)
- **:346, comment only:** old and new as in 3.3a; the title at :347 and every assertion stay.

**Not pinned:** the table of check-lane-close.logic.test.ts is its own (:94). hooks-composition only runs `page --check`.

**Designed red:** every edited `not.toContain` and `toEqual` line, the inserted mobile-100/96 line, the new `under the SAME names` line, the new parity fragment `never stands in for a round-1 name` (red on the brief and on the refusal message), the step-pipeline line and the new straggler test fail on the unchanged table, brief and close check. The N2 planted-row line (:361) is a control and holds before and after; N2's red is :358 and :359. The lane records which ones failed.

## 5. Ids

None. No FE row, no MF queue row, no prereg and no panel record: no Files path is a frontend, layer23 or protected path of mcbylaws/protected-paths.json. Decisions 203 to 208 already exist.

## 6. Files

**The Files line of the task description (it is already there at daf3f7201; RR-0424 adds the last two paths, and the description line is edited with this plan):**

Files: scripts/analysis/rule-lists.json, scripts/analysis/backlog-lane.mjs, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, scripts/hooks/check-lane-close.mjs, src/tests/backlog/check-lane-close.logic.test.ts

Always allowed: the task file, docs/reports/reviews/task-448/, docs/reports/lanes/.

**Lists this task resolves:**
- Plan stage (board table): 10 lists — agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, policy-124-s2-s5, five-words, plan-protocol, inc, ms.
- Output stage (its own branch table, :840-842): 9 lists, the same without policy-124-s2-s5.
- The two paths RR-0424 adds resolve to lists the line already holds (scripts/hooks/** is the lane-tools row, src/tests/** the tests row), so the lists do not change: 10 at plan stage and 9 at output stage, under the old and under the new table (resolved in memory by the plan grounder). The plan evidence made on the old Files line stays valid: the launch gate resolves the lists live (check-lane-close.mjs:620) and proves one plan output per resolved list (:651), and it checks the stamped material against the committed context file, not against the live task (:642); run in memory on the task text with the new line, only GROUNDER-PLAN.md and FOLD-CHECK.md were missing.

## 7. LANDING

**Commit 1 (work), after the red attempt of section 4.** Before it the lane writes a 5-item PASS or FAIL self-check in its reply (engineering standards section 11), built from Spec 08 section 7 rule 4 and section 11.2 and checked against its own diff. In order:
1. The test edits (already written).
2. The table edits (3.1, 3.2).
3. The brief sentence (3.3), the refusal clause and the test comment (3.3a).
4. The three dated notes (3.4-3.6).
5. `node scripts/analysis/rule-lists.mjs page --write`, then `--check`: the last edit before git add. The page prints the characters of each list as the review receives it, the notes change the counts of agents-s7-s11 (Spec 08 sections 7 and 11) and queue-137 (the whole of Spec 137), and .husky/pre-commit:44 runs `page --check` on the worktree. Any later edit to rule-lists.json, 08_agents.md, 137_mcqueue.md or another list document means `page --write` and `--check` again before git add.
6. The task file with status RUNNING.

- **Subject:** `feat(08_agents): task-448 FINAL.11 each review gets the right rule lists only; the brief states the round-2 record form`
- **Trailers:** `Task: task-448`; `Spec-diff: Spec 08 section 7 rule 4 and section 11.2 and Spec 137 gain one dated note each (M-246, prior text kept); no rule text moves`. This is the task-439 form (48f251d38, b32ea9b4c).
- No hook is bypassed. check-spec-diff is not triggered: no scripts/steps, scripts/lib/compute or descriptor path is staged.

**Output review (lane).**
- DeepSeek, one compliance or engineering output per list, plus code-review and error-paths: about 11-12 calls, about 20 if the diff chunks.
- Then a separate grounder before any fold (RR-0359, MD:1687).
- Two rounds at most (RR-0385 item 3, MD:1919).
- Round 2, if any, uses the form of 3.3.

**Close.** A separate records-only commit: lane report, review context, task file BUILT, GROUNDER.md and TRIAGE.md, and the Final Summary with the round line and one line per CRITICAL, HIGH or MED outcome (the close check prints the block). It must be separate because the work commit touches the protected rule-lists.json and check-lane-close.mjs (check-lane-close.mjs:753). With a second review round, the "Review round 1:" line goes in a commit of its own before the closing commit (check-lane-close.mjs:274-275 numbers the rounds from the Final Summary at HEAD). check-lane-close runs at BUILT. The lane never pushes.

**Other open tasks:**
- No branch holds unlanded edits to rule-lists.json (PLAN-418 F).
- Any task that regenerates the page re-runs `page --write` if it lands second.

## 8. Acceptance

| # | Who | Command | Expected |
|---|---|---|---|
| A1 | lane | read docs/reports/lanes/<date>/<lane>/red.out | the pre-commit related run fails at the edited assertions of the three files, including `under the SAME names`, the parity fragment `never stands in for a round-1 name` and the mobile-100/96 line; each of the three strings is found in red.out, so a failure of another cause does not count as red |
| A2 | lane | `node scripts/analysis/rule-lists.mjs validate` | exit 0, no problem line |
| A3 | lane | `node scripts/analysis/rule-lists.mjs resolve --files "mobile/src/app/" --type build --letter S` | ids mobile-90, mobile-98, mobile-99, surface-136, eng-front, eng-shared, five-words, plan-protocol, inc-S, ms-S |
| A4 | lane | the same with `--files "docs/specs/02-web-admin/128_surface_standard_policy.md"` | eng-all, surface-136, five-words, plan-protocol, inc-S, ms-S |
| A5 | lane | the same with `--files "scripts/analysis/bylaw-validation/coa-expected/prereg-MF-96-1.json"`, then with `prereg-MB-18-1.json` | the four every-task ids only; then a list holding bylaw-133 |
| A6 | lane | `node scripts/analysis/rule-lists.mjs check-tasks` | 0 bad, and the same resolve count as at the launch head (102 at ad4caeff5; re-measure at the work head) |
| A7 | lane | `node scripts/analysis/rule-lists.mjs page --check` | exit 0 |
| A8 | orchestrator | `npx vitest run src/tests/backlog/rule-lists.logic.test.ts src/tests/backlog/rule-lists-table.logic.test.ts src/tests/backlog/backlog-lane.logic.test.ts src/tests/backlog/check-lane-close.logic.test.ts` | all pass |
| A9 | orchestrator | `git diff --numstat <launch>..HEAD -- scripts/hooks scripts/analysis/rule-lists.mjs .claude` | exactly one line: 1 added, 1 deleted, scripts/hooks/check-lane-close.mjs (the one clause of :502, RR-0424); nothing else |
| A10 | orchestrator | `grep -c 'under the SAME names' scripts/analysis/backlog-lane.mjs` | 1 |
| A11 | orchestrator | the pre-push check list at push (.husky/pre-push-checks.sh) | PASS |
| A12 | lane | `node scripts/analysis/rule-lists.mjs resolve --files "scripts/steps/_schema/converted.json" --type build --letter S` | step-132, eng-back, eng-shared, five-words, plan-protocol, inc-S, ms-S, and no airtight id (the back-end half of RR-0418) |
| A13 | orchestrator | `grep -c 'never stands in for a round-1 name' scripts/analysis/backlog-lane.mjs scripts/hooks/check-lane-close.mjs` | 1 for each file |

**Known limits, stated, not fixed:**
- Tasks already launched are judged at close by the table at their own range base (check-lane-close.mjs:766-767, :842). This helps every task launched after the landing. Tasks 367 and 442 gain nothing unless they merge the board, and a fold is a merge that the check skips (:720-721).
- **The brief and the refusal agree from this task (RR-0424):** both say that a fix round re-makes every file under the same names and that an -rN file never stands in for a round-1 name; the refusal carries it in its one clause at :502.
- The record-only message at rule-lists.mjs:257 and the comment at backlog-lane.mjs:12 still say "queue lists".
- The known loss of section 0.
- A task whose Files line names only Spec 08, Spec 137 or the queue documents is no longer reviewed against them; those rules reach a review only through a Files path on the lane-tools row.
- A by-law pre-registration record (scripts/analysis/bylaw-validation/coa-expected/prereg-MB-*.json) is a file of the lane-tools row and keeps bylaw-133 and the five lane-tools lists, as RR-0421 item 4 a reads (A5).

## 9. Questions for the plan grounder

- **Q1.** Is the scope sentence of 3.5 ("the claims the fold added or changed ... are not run again") an acceptable narrowing of "re-executes every claim in the fold" (:486) under RR-0423? Or must it stay "every claim in the fold"? The part-2 grounder found the condition met (08_agents.md:486 and :489; gate :692-712). Ruled by the grounder: no narrowing. RR-0423 names who writes the fold check and when, not its scope; the note of 3.5 says only that, and the scope of :486 stays. The gate allows the plan grounder as the checker (:692-712 reads the form and that the checker is not the lane or an assignee).
- **Q2.** Are the appended `why` suffixes (prior text kept, current state appended) "made true again" in the sense of RR-0423 item 1? Or must the false clauses be rewritten? Rewriting would risk the pinned phrases. Ruled by the grounder: the false clause is rewritten in place on every row whose why it made false (3.2); the append-only form stays only where the why is still true (:95, :164, :213); no pinned phrase is inside a rewritten text.
- **Q3.** Should the comment at backlog-lane.mjs:12 ("a record-only task gets the queue lists") be corrected here, since the file is already edited? The card names one sentence, so I left it. Ruled by the grounder: left, not folded. The comment is a stale text no ruling names; it stays in the lists of sections 2 and 8, and the operator is asked whether to add it.

## 10. UNVERIFIED

- Every red and green above is predicted from in-memory resolves. No test was run.
- The exact set of assertions that go red, and that the fixture boards of backlog-lane.logic.test.ts read the repo table for :400, :405, :552 and :575 (the part-1 grounder read them so).
- The page diff size.
- The call counts of this task's own reviews.
- That `check-tasks` stays at 0 bad, with the resolve count of the launch head, if the board moves before the work commit.
- The plan grounder evaluated the new and changed assertions of section 4 in memory (red on the before-table, green on the after-table); no test runner was run.

## 11. GUESS estimate

About 2 agent-hours of lane time: about 45 test-line edits, 18 table lines, about 20 `why` insertions, one brief sentence, three notes, one regeneration, the red attempt and the work commit. Plus the plan review and the close.

Plan review round 1: 48 folded, 0 task, 0 ruling, 0 wontfix, 3 pile; grounder docs/reports/reviews/task-448/GROUNDER-PLAN.md; triage docs/reports/reviews/task-448/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#2 MED folded RR-0423 item 1 (deci
plan-compliance-agents-s5-1to3#5 MED folded the plan grounder it
plan-compliance-agents-s7-s11#1 MED folded RR-0423 item 1 (deci
plan-compliance-agents-s7-s11#3 MED folded the plan grounder it
plan-compliance-five-words#1 HIGH folded the plan grounder it
plan-compliance-five-words#4 MED folded RR-0423 item 1 (deci
plan-compliance-inc-S#1 HIGH folded the plan grounder it
plan-compliance-inc-S#2 MED folded RR-0423 item 1 (deci
plan-compliance-inc-S#3 MED folded 3.3a check-lane-clos
plan-compliance-ms-S#1 MED folded RR-0423 item 1 (deci
plan-compliance-orchestrator-doc17#1 MED folded RR-0423 item 1 (deci
plan-compliance-orchestrator-doc17#2 MED folded no row attaches Spec
plan-compliance-orchestrator-doc17#3 MED folded the plan grounder it
plan-compliance-plan-protocol#1 MED folded RR-0423 item 1 (deci
plan-compliance-plan-protocol#2 MED folded the plan grounder it
plan-compliance-policy-124-s2-s5-p1#1 MED folded RR-0423 item 1 (deci
plan-compliance-policy-124-s2-s5-p2#1 MED folded RR-0423 item 1 (deci
plan-compliance-queue-137#2 MED folded the plan grounder it
plan-compliance-queue-137#3 MED folded RR-0423 item 1 (deci
plan-engineering-eng-all#1 MED folded a 5-item PASS or FAI
plan-plan-review-deepseek#6 MED folded no row attaches Spec
in#1 HIGH folded the last edit before
rc#1 MED folded is attached to no ro
rg#1 HIGH folded 3.3a check-lane-clos
rg#2 MED folded is attached to no ro
rg#3 MED folded the plan grounder it
rg#4 MED folded RR-0423 item 1 (deci
rg#5 MED folded the step-pipeline ro
<!-- SECTION:PLAN:END -->
