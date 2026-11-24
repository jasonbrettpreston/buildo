---
id: TASK-431
title: >-
  INPUTS.3 The review table sends product tasks their handbook plus the relevant
  engineering sections; infrastructure tasks unchanged
status: BUILT
assignee:
  - '@lane-BL-TBL431'
created_date: '2026-11-22T16:25:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-431/GROUNDER-PLAN.md
  - docs/reports/reviews/task-431/TRIAGE-PLAN.md
  - docs/reports/reviews/task-431/seat-integration-1.md
  - docs/reports/reviews/task-431/seat-reality-check-1.md
  - docs/reports/reviews/task-431/seat-regression-1.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - >-
    compliance:policy-124-s2-s5
    docs/specs/01-pipeline/124_step_standard_policy.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-23/BL-TBL431/REPORT.md
  - docs/reports/lanes/2026-11-23/BL-TBL431/GROUNDER.md
  - docs/reports/lanes/2026-11-23/BL-TBL431/TRIAGE.md
type: build
ordinal: 131012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. THIS TASK (steps 3 and 4): in scripts/analysis/rule-lists.json: the engineering standards entry split by section into front-end, back-end and shared lists (sections 1, 8, 10, 12 front end; 3, 9 back end; 2, 4, 5, 6, 7, 13 shared; 11 and 14 placed at plan review); front-end kinds get surface-136 plus front-end and shared; pipeline and by-law kinds get their handbook plus back-end and shared; Specs 126, 127, 128, 135 no longer sent whole to front-end kinds once INPUTS.2 has landed; the lane-tools and other infrastructure rows unchanged (Spec 08, Spec 137); ui-app attaches surface-136 if INPUTS.1 confirms the oversight. Proof before the switch at plan review.

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md, docs/reports/generated/rule-lists-by-kind.md
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
# PLAN-431-v4: the engineering seat gets the right sections, front end and back end (a table edit plus the de-dup line)

Planner: Opus, read-only, board head 3a77bf98d (task-438 folded). Every file:line below was re-read at this head. The measurements were made in memory with the table's own functions (resolveTask, validateTable, buildLensInputs). No file was written and no test was run. This plan supersedes PLAN-431-v3. The plan grounder (Cairn-Ground-P431, head 79f79322f) re-ran the figures in memory; round 1 corrected the API row, the tests and the cut-over.

## BASIS
- RR-0385 item 7 (MORNING-DECISIONS.md:1923; his message (e) at :1913): "Task 431 - this now serves teh engineering seat with the right sections for the task - front-end vs backend".
- RR-0380 (:1865-1868). His words: "drop the full engineering when arts can be sent".
  - Q1 was ruled as "the whole engineering document is dropped when its parts can be sent (option b)".
  - Q2 (his question: "Sections 8, 10 and 12 to both sides, as the planner sorted them?"): "2. y", ruled yes (:1867). So sections 8, 10 and 12 sit in eng-shared, not in the front list the card named.
  - Q4 (his question: "By-law tasks gain the engineering rules. Today they get none; this adds about 42,000 characters. Wanted?"): "N", ruled no (:1868). The bylaw row gains no engineering list; that answer overrides the card's by-law clause.
- The task-438 plan ruling Q3 (docs/reports/reviews/task-438/QUESTIONS-RULED.md:11-12) and the card note of 2026-11-22 give the de-dup line, and the ruling on its direction, to 431.
- rule-lists.json:4 allows a sections list "only where the file itself separates rules from history or narrative"; the standards file is a rules document, so the three lists rest on his words above, and test P1 puts every section in exactly one list (nothing is hand-picked).
- Sections 11 and 14 (card: "placed at plan review") are placed here, in eng-shared. A table list attaches to a task, not to a stage, so plan review and output get the same lists; a plan-only list would be new code (RR-0385 item 5). Section 11 (4,382 characters) is the plan checklist, section 14 (2,555) the same-commit rule; both apply to front and back work.
- Conditional card clauses, not met: surface-136 on ui-app "if INPUTS.1 confirms the oversight": INPUTS.1 has not run (task-429 is LATER); mobile and surfaces already carry surface-136. Specs 126, 127, 128, 135 dropped "once INPUTS.2 has landed": task-430 is RUNNING, and the RR-0385 note on this card gives that drop to task-439 (LATER, after task-430).

## FACTS (head 3a77bf98d)
1. **seatOf compares the file exactly** (rule-lists.mjs:112-113, ENG_FILE = docs/specs/00_engineering_standards.md), and resolveTask copies the table's `file` onto every resolved list (:246). So a sections list cut from the standards file goes to the engineering seat wherever seatOf is read: plan-prep (:654), the lane brief (backlog-lane.mjs:183-184), the close (check-lane-close.mjs:519-522) and the launch gate (:649-650). The close and the gate pass the seat in explicitly (:432-435), so `out-engineering-rules` joins that seat's own lists. rule-lists.logic.test.ts:1044-1051 already pins it; no routing code changes.
2. **The standards file.**
   - Front = section 1 (3,214). Back = sections 3 and 9 (5,377). Shared = sections 2, 4-8 and 10-14 (37,472). The 550 characters left over are the title block.
   - On the edited copy, validateTable returns [], so each selector matches exactly one heading.
3. **Server code sits in "front" rows**, so ui-app (outside src/app/api) and surfaces keep eng-all (front + back + shared is the whole file): parts there would save sections 3 and 9, 5,377 of 46,613 characters, and take them from 6 to 8 of the 153 files under ui-app that touch the database. No open task resolves eng-all through ui-app alone.
   - Examples: src/features/leads/lib/get-lead-feed.ts:32 imports pg (ui-app); the surfaces row holds the protected-paths.json frontend paths, among them src/app/(maxbld)/** (parcel-tool/(static)/home/page.tsx:10 imports pool).
4. **mobile and src/lib.**
   - mobile/src makes no database call: grep for `pool.query` and `.from(` finds only `Array.from`.
   - src/lib and src/app/api hold 0 .tsx files.
5. No other file has both a whole list and a sections list (rule-lists.json:23-78), so the de-dup line acts only on the engineering file today.
6. Measured on the final table: of the 106 open tasks that resolve (309 open), 45 get engineering text; without the line 20 would get eng-all plus a sections list, with it none. 4 get parts (task-372, 380, 381, 383) and 41 keep eng-all, through the tests, lane-tools, surfaces, specs and generated-report rows.
7. **By-law.** The bylaw row stays `["bylaw-133"]` (:91). Of the 2,378 tracked layer23 files, 478 keep eng-all and 1,900 get eng-back + eng-shared through other rows; none gains a list.

## DIRECTION OF THE DE-DUP (ruled here, against RR-0380 Q1)
**Ruling: whole wins.** When a whole list and a sections list of the same file both resolve, the whole list is kept and the sections list is dropped.
- On a task that matches an eng-all row and a side row, the parts that resolve may not cover what the eng-all row named: ui-app names section 1 (rule-lists.json:104), so src/components/x.tsx with src/lib/x.ts would lose section 1 under parts-win; specs-docs names section 9 (:203), so mobile/x.ts with a spec would lose section 9. Over the 20 open mixed tasks parts-win would drop section 1 on 7 and sections 3 and 9 on 7.
- Dropping the whole list would lose rules that a matched row asked for. Keeping it sends each rule once.
- Authority: RR-0380 Q1 drops the whole document "when its parts can be sent", and on these tasks they cannot; the 438 ruling Q3 gave the direction to this panel; RR-0385 item 4 sends nothing to him that the rules settle. Q1 is carried out by the row edit: every row whose paths sit on one side now sends parts, API routes included.
- Cost: on a mixed task, at most 5,927 characters more than the parts would be.
- The card's line is kept word for word, unscoped: fact 5 shows it acts on nothing else today, and D1 runs it on a non-engineering file.

## CODE AND TABLE
**rule-lists.mjs** (protected). One line before `return result` (:281):
`result.lists = result.lists.filter((l) => l.whole || !result.lists.some((w) => w.whole && w.file === l.file));`
It gets a one-line comment citing task-431, RR-0385 item 7 and RR-0380 Q1.

**rule-lists.json** (protected):
1. After `eng-all` (:31), add three lists, each with "generated_by": "hand-written" (validate refuses a list without it):
   - `"eng-front": { "file": "docs/specs/00_engineering_standards.md", "sections": ["1. Architecture & UI Standards"], "generated_by": "hand-written" }`
   - `"eng-back"`: same file, `["3. Database Management & Scaling", "9. Pipeline & Script Safety"]`
   - `"eng-shared"`: same file, `["2. Error Handling & Stability", "4. Security & API Contracts", "5. Testing Standards", "6. Centralized Logging", "7. Dual Code Path Safety", "8. Next.js & TypeScript Constraints", "10. Frontend/Backend Boundary", "11. Plan Compliance Checklist", "12. Frontend Foundation Tooling", "13. Observability Standards", "14. The Prevention Loop"]`
2. Change four rows. `eng-all` is replaced in place, and each `why` gains one sentence naming task-431, RR-0385 item 7 and the lists:
   - step-pipeline (:85) gets eng-back and eng-shared. Its closing words "the engineering standards are attached whole (eng-all)" become "sections 3 and 9 and the shared sections (eng-back, eng-shared)".
   - api-lib (:97) gets eng-back and eng-shared.
   - mobile (:147) gets eng-front and eng-shared.
   - ui-app (:102) gains "not": ["src/app/api/**"] (the field step-pipeline and generated-reports already use): its src/app glob also matched the API routes that api-lib claims, so all 82 tracked API files kept eng-all. With it they resolve eng-back + eng-shared and none loses another list (ui-app carries only eng-all). The rest of ui-app keeps eng-all.
   - Every other row is unchanged, bylaw included.
3. Run `node scripts/analysis/rule-lists.mjs page --write`.
   - The pipeline step, phone, storage, tooling and spec-only sections change (the last two by the Spec 08 note characters in section 7), so the note is written first and page --write last; the pre-commit runs page --check (.husky/pre-commit:44).

## WHAT THE ENGINEERING SEAT IS SENT (measured; material 30,000; lens-engineering.md)
| Files line | today | after |
|---|---|---|
| `mobile/src/app/x.tsx` | eng-all, 46,613 | eng-front + eng-shared, 40,686 |
| pipeline kind; `src/lib/parcels/report-compute.ts` | eng-all | eng-back + eng-shared, 42,849 |
| `src/app/api/parcels/search/route.ts` | eng-all | eng-back + eng-shared, 42,849 (the `not` on ui-app) |
| `mobile/src/app/x.tsx, src/lib/x.ts` | eng-all | all three lists, 46,063 |
| `mobile/x.ts, src/tests/x.test.ts` | eng-all | eng-all (de-dup) |
| web, tooling, spec kinds; src/components, src/features, src/app outside api; scripts/hooks | eng-all | unchanged |

- The default is one call per list (backlog-lane.mjs:186), so a split task makes 2 or 3 engineering calls where it made 1. The joined form `out-engineering-rules`, already accepted (check-lane-close.mjs:434), makes 1.

## TESTS (written first; each to be seen red at its designed assertion, recorded in the lane's red.out, before the table and the line are edited; 08_agents.md:488 both directions)
**In rule-lists.logic.test.ts.** fixture() (:74) already holds `first` (docs/a.md, sections, :95) and `whole` (docs/a.md, whole, :96). It is reused; no new fixture.
- **D1, the de-dup** (the one temp-table resolveTask test). The existing test :122-127 changes:
  - src/one.ts now expects `['inc-F','whole']` and `not.toContain('first')`.
  - Red now at the `not.toContain('first')` assertion.
  - Planted defect: with the line removed, D1 is red again; restored, it is green.
- **D2, the real table** (a new test beside :31-40, through the resolve CLI): `mobile/x.ts, src/tests/x.test.ts` gives exactly `['eng-all']` among the lists on ENG_FILE (read from the table).
  - Survive-the-fix, stated. Planted defect: with the line removed it gives eng-all, eng-front and eng-shared, and fails.
  - The existing :31-40 test is unchanged and green: the mobile-plus-route line now resolves eng-front, eng-back and eng-shared, so every list of the mobile, api-lib and storage rows is still present.

**In rule-lists-table.logic.test.ts**, a new describe "task-431". Its resolveIn helper is the task-412 pattern (:219-228), taking rows and a Files line.
- **S1, the side rows.**
  - `mobile/x.ts` resolves exactly eng-front and eng-shared on ENG_FILE.
  - `scripts/steps/x.json`, `src/lib/x.ts` and `src/app/api/parcels/search/route.ts` resolve exactly eng-back and eng-shared.
  - The bylaw row equals `['bylaw-133']` (green both ways: a control, not part of the red).
  - Red now (today these resolve eng-all).
  - Planted defects (temp table), each failing with the row named: mobile with eng-all restored gives `['eng-all']`; api-lib on eng-all does the same for src/lib/x.ts; ui-app without its `not` gives the route `['eng-all']`.
- **K1, the rows that keep eng-all.** These files resolve exactly `['eng-all']`: src/components/x.tsx, src/features/leads/lib/get-lead-feed.ts, `src/app/(maxbld)/x/page.tsx`, scripts/surfaces/x.mjs, scripts/hooks/x.mjs and src/tests/x.test.ts.
  - It passes before and after the change (survive-the-fix, stated).
  - Planted defect: a temp table with ui-app on eng-front + eng-shared leaves get-lead-feed.ts without section 3.
- **P1, the partition.**
  - Every level-2 heading of the standards file (headings, rule-lists.mjs:71) matches a selector of exactly one of the three lists, using sectionText's prefix rule (:90).
  - Joined, the three lists' text equals the sections' text, with whitespace squashed.
  - Its first assertion (the three lists exist) is red now only by the missing-list branch; the lock is the planted defect below, red at the unassigned assertion.
  - Planted defect: the text with `## 15. New` appended reports "15. New" as unassigned. This is the task-406 gap (181e0e344): a new section would otherwise reach no side row.
- **X1, the text.** `lens-input --list eng-front` holds "1.1 Mobile-First UI Mandate" (:11) and not "9.1 Transaction Boundaries" (:177); eng-back is the reverse. An unknown list exits non-zero today, which proves nothing; the lock is a planted temp table (--table) whose eng-front selects "9. Pipeline & Script Safety" and fails the not half, the real table being the control.

**Changed in the same commit:** rule-lists-table.logic.test.ts:20-24 (mobile gets eng-front and eng-shared; the surfaces path keeps eng-all) and backlog-lane.logic.test.ts:405-407 (the mobile-plus-route brief names out-engineering-eng-front, -eng-back and -eng-shared, not out-engineering-eng-all; red now at the first; planted defect: ui-app without its `not` brings eng-all back). Its twin at :386-397 stays green.

**Unchanged** (measured with the edit simulated): rule-lists-table :156-161, :194-203; rule-lists.logic :31-40 (see D2), :56-64, :332-340, :931-958, :1041-1059; backlog-lane.logic :386-397 (every list of the three rows is still named) and :690-745; check-lane-close.logic (its fixture tables hold whole lists only).

## SPEC 08 NOTE (owed)
Owed by engineering standards :465 ("A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit") and Spec 137 Rule 10 (:125): the 438 note at 08_agents.md:352 says "today `eng-all`". Exact text, one new line directly after :352, indented three spaces:

   Dated note 2026-11-22 (M-246, prior text kept; task-431 INPUTS.3, McFix Final; RR-0385 item 7, decision-170, and RR-0380 Q1, decision-165; operator, verbatim, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1913 "Task 431 - this now serves teh engineering seat with the right sections for the task - front-end vs backend" and :1865 "drop the full engineering when arts can be sent"): the engineering seat of the note above is sent the sections of the engineering standards that fit the task. Three section lists join `eng-all` in `scripts/analysis/rule-lists.json`: `eng-front` (section 1), `eng-back` (sections 3 and 9) and `eng-shared` (sections 2, 4 to 8 and 10 to 14: 8, 10 and 12 by RR-0380 Q2, 11 and 14 placed here by the plan review). The phone row gets `eng-front` and `eng-shared`; the pipeline-step and library rows and the API routes (ui-app no longer matches src/app/api) get `eng-back` and `eng-shared`; every other row that had `eng-all` keeps it. Each of them is an engineering list (`seatOf`), so "today `eng-all`" in the note above now reads "today `eng-all`, `eng-front`, `eng-back` and `eng-shared`", and the per-list rule asks for one `out-engineering-<id>` per resolved engineering list, or the joined `out-engineering-rules`. When a task resolves a whole list and a sections list of the same file, the whole list is kept and the sections list is dropped (`resolveTask`), so each rule is sent once and no rule that a matched row asked for is lost.

Also change .claude/review-templates/README.md:101 from "today `eng-all`" to "today `eng-all`, `eng-front`, `eng-back` and `eng-shared`".

## GENERATED FILES
- docs/reports/generated/rule-lists-by-kind.md: made by `page --write`, on the Files line. The system map does not change: it names no rule-lists file (task-438's work commit 8745ee6dc changed the same scripts without it).

## CUT-OVER
- **Running lanes.** The close judges a lane by the table at its range base, the merge-base with the board (check-lane-close.mjs:761-767, :840-842), with the lane's own hook copy; a lane that merges the board takes both together. Three running tasks change set: task-372 and task-383 (to eng-back + eng-shared) and task-381 (to eng-front + eng-shared); only if they merge the board before they close do they owe `out-engineering-<id>` for the new lists, or the joined set. The orchestrator tells them. task-431 itself is judged by its own branch table (:840), with the same 10 lists.
- **Prepped tasks.** task-380 (LATER) changes to eng-back + eng-shared. There is no plan folder for 372, 380, 381 or 383, so no prepped evidence goes stale. Check-tasks prints the `compliance:` reference commands for all four; that is a report, not a gate (rule-lists.mjs:490).
- **task-431 itself.** The round-1 outputs were moved to round1- names; this round's plan files are in docs/reports/reviews/task-431/. Task-430 (RUNNING) and task-439 (LATER) share the page, the table test and the mobile and ui-app rows with this plan: no hard order; whichever lands second merges the board and re-runs page --write and the table test before its close, and task-439 rewrites those rows as they stand after this plan.
- No gate is added. seatOf, the per-seat close and the launch gate are reused unchanged.

## LANDING
rule-lists.mjs and rule-lists.json are protected paths (rule-lists.json:22). So the close takes two commits (check-lane-close.mjs:751-753; 137_mcqueue.md:100):
1. **Work commit:** the code line, the table, the tests, the Spec 08 note, the README line, the regenerated page and the task notes; `Task: task-431`.
2. **Close commit:** the lane records and the status change only.

## ACCEPTANCE (real inputs)
- `rule-lists.mjs validate` is ok, and `page --check` is current.
- `resolve --type build --letter S`:
  - `--files mobile/src/app/x.tsx` gives eng-front and eng-shared;
  - the pipeline kind gives eng-back and eng-shared;
  - `--files src/app/api/parcels/search/route.ts` gives eng-back and eng-shared; `--files "mobile/x.ts, src/tests/x.test.ts"` gives eng-all and no sections list.
- `check-tasks` prints only counts and the compliance: reference commands (exit 0): its add lines show tasks 372, 380, 381 and 383; "no open task with both eng-all and a sections list" is the in-memory count of fact 6, re-run at the build head.
- D1, D2, S1, K1, P1, X1 and the two changed tests are green, and red.out holds each red.

## NOT IN SCOPE
- Dropping the four surface specs: task-439, after task-430 (INPUTS.2).
- surface-136 on ui-app: only if INPUTS.1 (task-429, LATER) confirms the oversight; then a one-line row edit later (task-439 edits the same rows).
- Tests that mirror the rules (tasks 367, 441, 442).
- Renaming the generated page.

## OPERATOR
Nothing needs his word. The plan grounder ruled the de-dup direction (whole wins) and the API routes (back end, so parts) from his words and the record (QUESTIONS-RULED.md). After this edit 4 of the 45 open tasks that get engineering text get parts (task-372, 380, 381, 383) and 41 keep eng-all through the tests, lane-tools, surfaces and specs rows; front-end web files keep eng-all (parts would save 5,377 of 46,613 characters and take sections 3 and 9 from the files there that touch the database).

## UNVERIFIED
- Whether each test is actually red and then green (nothing was run).
- That mobile/ never gains database code.
- Call counts at real diff sizes (measured only at 30,000 characters).

## ESTIMATE (GUESS)
One code line, about 20 table lines, about 70 test lines, one note and one README edit: about two hours.

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md, docs/reports/generated/rule-lists-by-kind.md

Plan review round 1: 49 folded, 0 task, 0 ruling, 0 wontfix, 11 pile; grounder docs/reports/reviews/task-431/GROUNDER-PLAN.md; triage docs/reports/reviews/task-431/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#2 MED folded INPUTS.1 has not run
plan-compliance-agents-s5-1to3#3 MED folded task-430 is RUNNING,
plan-compliance-agents-s5-1to3#4 MED folded A table list attache
plan-compliance-agents-s7-s11#2 MED folded be seen red at its d
plan-compliance-agents-s7-s11#3 MED folded ruled yes (:1867). S
plan-compliance-agents-s7-s11#4 MED folded A table list attache
plan-compliance-agents-s7-s11#5 MED folded ruled no (:1868). Th
plan-compliance-five-words#1 MED folded so all 82 tracked AP
plan-compliance-five-words#2 MED folded task-430 is RUNNING,
plan-compliance-five-words#3 MED folded INPUTS.1 has not run
plan-compliance-five-words#4 MED folded A table list attache
plan-compliance-five-words#5 MED folded rule-lists.json:4 al
plan-compliance-inc-S#1 MED folded INPUTS.1 has not run
plan-compliance-inc-S#3 MED folded A table list attache
plan-compliance-ms-S#1 MED folded ruled no (:1868). Th
plan-compliance-ms-S#2 MED folded so all 82 tracked AP
plan-compliance-ms-S#3 MED folded task-430 is RUNNING,
plan-compliance-ms-S#4 MED folded INPUTS.1 has not run
plan-compliance-ms-S#5 MED folded A table list attache
plan-compliance-orchestrator-doc17#3 MED folded INPUTS.1 has not run
plan-compliance-orchestrator-doc17#4 MED folded task-430 is RUNNING,
plan-compliance-orchestrator-doc17#6 MED folded be seen red at its d
plan-compliance-plan-protocol#1 MED folded A table list attache
plan-compliance-plan-protocol#2 MED folded ruled no (:1868). Th
plan-compliance-plan-protocol#4 MED folded task-430 is RUNNING,
plan-compliance-policy-124-s2-s5#2 MED folded INPUTS.1 has not run
plan-compliance-policy-124-s2-s5#3 MED folded task-430 is RUNNING,
plan-compliance-queue-137#1 MED folded INPUTS.1 has not run
plan-compliance-queue-137#2 MED folded ruled no (:1868). Th
plan-compliance-queue-137#3 MED folded A table list attache
plan-compliance-queue-137#6 MED folded Nothing needs his wo
rc#1 HIGH folded so all 82 tracked AP
rc#2 MED folded ui-app names section
ig#1 MED folded no hard order; which
rg#1 HIGH folded backlog-lane.logic.t
rg#2 MED folded the lock is the plan
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-22 (M-246, prior text kept; RR-0379 · task-431 · Backlog; operator, verbatim: "We can run step 1 in parellel - we will add to the rules overtime")

Dated note 2026-11-22 (M-246, prior text kept; RR-0380 · task-431 · Backlog; operator, verbatim: "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N")

Dated note 2026-11-22 (M-246, prior text kept; RR-0383 · task-431 · Backlog; operator, verbatim: "1. what is your recommendation. I approve it")

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "Task 431 - this now serves teh engineering seat with the right sections for the task - front-end vs backend"): re-scoped. The plan on this card (PLAN-431-v2) and its round 1 records are superseded; a new plan follows the engineering seat task. The A, B or C question of the plan grounder is closed by this ruling. The four surface specs are dropped by a separate card after task-430.

2026-11-22 (orchestrator, from the task-438 plan ruling by Cairn-Ground-P438, docs/reports/reviews/task-438/QUESTIONS-RULED.md; word for word): Task-431 carries the de-dup line moved out of task-438 (438 plan ruling, RR-0380 and RR-0385 item 7): add scripts/analysis/rule-lists.mjs and src/tests/backlog/rule-lists.logic.test.ts to its Files line; in resolveTask, before `return result` (:278), add `result.lists = result.lists.filter((l) => l.whole || !result.lists.some((w) => w.whole && w.file === l.file));` so a file's text goes once when its whole list and a sections list both resolve; rule in its plan the direction against RR-0380 Q1 ('the whole engineering document is dropped when its parts can be sent'), with one resolveTask temp-table test (whole plus sections on one file, planted defect: the line removed); change the line of PLAN-431-v3 that says it relies on 438's de-dup; re-prep it after 438 lands.

2026-11-23 taken on the board at lane launch (lane BL-TBL431, worktree /Users/brettpreston_macmini/Buildo-wt-tbl431, branch wf1/inc1b-tbl431), RR-0240

2026-11-23 lane BL-TBL431: tests written first (D1, D2, S1, K1, P1, X1 and the two changed tests); red attempt follows with only the tests and this file staged.

2026-11-23 lane BL-TBL431: red seen (red.out): D1 at not.toContain('first'), S1 at the mobile assertion, the table test :22, backlog-lane :407 out-engineering-eng-front; P1 and X1 red by the missing list; K1 planted part red by the missing list; D2 and K1 green (survive-the-fix). Planted-defect attempt follows: the de-dup line removed.

2026-11-23 lane BL-TBL431: planted defect, de-dup line removed (commit attempt refused, planted-dedup.out in the lane dir): D1 red at not.toContain('first') (rule-lists.logic.test.ts:136), D2 red (:47, three engineering lists), S1 planted ui-app part red (needs the line too); every other test green. Line restored; work commit follows.

2026-11-23 lane BL-TBL431: the work commit was refused by rule-lists.logic.test.ts:152 (expected [whole, queue, inc-F] to include first), a test the plan listed neither as changed nor unchanged; ruled by Cairn-Ground-P431, Q-H (docs/reports/reviews/task-431/QUESTIONS-RULED-APPEND.md, board 79631b139): the line now expects 'whole'. Finding post-build#1 MED.

2026-11-23 lane BL-TBL431 ACCEPTANCE (real inputs, at the work commit a870bdf41; hook tail: 'Tests  361 passed (361)', commit.out):
(a) validate and page:
rule-lists: ok 58 lists, 23 rows
rule-lists: docs/reports/generated/rule-lists-by-kind.md is current
(b) resolve --type build --letter S, the lists on docs/specs/00_engineering_standards.md:
  --files "mobile/src/app/x.tsx" => eng-front, eng-shared
  --files "src/lib/parcels/report-compute.ts" => eng-back, eng-shared
  --files "scripts/steps/x.json" => eng-back, eng-shared
  --files "src/app/api/parcels/search/route.ts" => eng-back, eng-shared
  --files "mobile/x.ts, src/tests/x.test.ts" => eng-all
(c) check-tasks: exit 0; check-tasks: open 309: resolve 106, not yet resolvable 203
  add lines (counted from its output): resolving tasks with add lines: 104 | eng-all only: 39 | parts: task-372:eng-back+eng-shared task-380:eng-back+eng-shared task-381:eng-front+eng-shared task-383:eng-back+eng-shared | both eng-all and a sections list: none
(d) tests: red.out (7 failed at the designed assertions or the missing-list branch, as the plan says), planted-dedup.out (line removed: D1, D2, S1 planted ui-app red), commit.out (361 passed): D1, D2, S1, K1, P1, X1 and the changed tests green.

2026-11-23 lane BL-TBL431: output review round 1 run (13 DeepSeek outputs, fresh context context-r4.md) in docs/reports/lanes/2026-11-23/BL-TBL431/, findings listed untriaged in FINDINGS.md there (post-build#1 MED, ruled Q-H, fixed in a870bdf41). RUNNING: grounder owed (RR-0359).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed in a870bdf41: the engineering seat gets the sections of the engineering standards that fit the task. Three section lists (eng-front section 1; eng-back sections 3 and 9; eng-shared the rest); the phone row gets front + shared; step-pipeline, api-lib and the API routes (ui-app not src/app/api/**) get back + shared; every other eng-all row keeps it; resolveTask keeps a whole list over a sections list of the same file; Spec 08 dated note, README line and regenerated page. Hooks green at the work commit (361 related tests). post-build#1 MED was ruled Q-H by the plan grounder and fixed in a870bdf41; the full suite is unverified until the push station.
Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 5 pile; grounder docs/reports/lanes/2026-11-23/BL-TBL431/GROUNDER.md; triage docs/reports/lanes/2026-11-23/BL-TBL431/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
