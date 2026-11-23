# Review context for task-431 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 3)

## Task
task-431 INPUTS.3 The review table sends product tasks their handbook plus the relevant engineering sections; infrastructure tasks unchanged
status: RUNNING · milestone: m-1 · assignee: @lane-BL-TBL431 · labels: McFix, McFix V2, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. THIS TASK (steps 3 and 4): in scripts/analysis/rule-lists.json: the engineering standards entry split by section into front-end, back-end and shared lists (sections 1, 8, 10, 12 front end; 3, 9 back end; 2, 4, 5, 6, 7, 13 shared; 11 and 14 placed at plan review); front-end kinds get surface-136 plus front-end and shared; pipeline and by-law kinds get their handbook plus back-end and shared; Specs 126, 127, 128, 135 no longer sent whole to front-end kinds once INPUTS.2 has landed; the lane-tools and other infrastructure rows unchanged (Spec 08, Spec 137); ui-app attaches surface-136 if INPUTS.1 confirms the oversight. Proof before the switch at plan review.

Files: scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, docs/specs/00-architecture/08_agents.md, .claude/review-templates/README.md, docs/reports/generated/rule-lists-by-kind.md

## Acceptance criteria

## Implementation Plan
#### PLAN-431-v4: the engineering seat gets the right sections, front end and back end (a table edit plus the de-dup line)

Planner: Opus, read-only, board head 3a77bf98d (task-438 folded). Every file:line below was re-read at this head. The measurements were made in memory with the table's own functions (resolveTask, validateTable, buildLensInputs). No file was written and no test was run. This plan supersedes PLAN-431-v3. The plan grounder (Cairn-Ground-P431, head 79f79322f) re-ran the figures in memory; round 1 corrected the API row, the tests and the cut-over.

#### BASIS
- RR-0385 item 7 (MORNING-DECISIONS.md:1923; his message (e) at :1913): "Task 431 - this now serves teh engineering seat with the right sections for the task - front-end vs backend".
- RR-0380 (:1865-1868). His words: "drop the full engineering when arts can be sent".
  - Q1 was ruled as "the whole engineering document is dropped when its parts can be sent (option b)".
  - Q2 (his question: "Sections 8, 10 and 12 to both sides, as the planner sorted them?"): "2. y", ruled yes (:1867). So sections 8, 10 and 12 sit in eng-shared, not in the front list the card named.
  - Q4 (his question: "By-law tasks gain the engineering rules. Today they get none; this adds about 42,000 characters. Wanted?"): "N", ruled no (:1868). The bylaw row gains no engineering list; that answer overrides the card's by-law clause.
- The task-438 plan ruling Q3 (docs/reports/reviews/task-438/QUESTIONS-RULED.md:11-12) and the card note of 2026-11-22 give the de-dup line, and the ruling on its direction, to 431.
- rule-lists.json:4 allows a sections list "only where the file itself separates rules from history or narrative"; the standards file is a rules document, so the three lists rest on his words above, and test P1 puts every section in exactly one list (nothing is hand-picked).
- Sections 11 and 14 (card: "placed at plan review") are placed here, in eng-shared. A table list attaches to a task, not to a stage, so plan review and output get the same lists; a plan-only list would be new code (RR-0385 item 5). Section 11 (4,382 characters) is the plan checklist, section 14 (2,555) the same-commit rule; both apply to front and back work.
- Conditional card clauses, not met: surface-136 on ui-app "if INPUTS.1 confirms the oversight": INPUTS.1 has not run (task-429 is LATER); mobile and surfaces already carry surface-136. Specs 126, 127, 128, 135 dropped "once INPUTS.2 has landed": task-430 is RUNNING, and the RR-0385 note on this card gives that drop to task-439 (LATER, after task-430).

#### FACTS (head 3a77bf98d)
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

#### DIRECTION OF THE DE-DUP (ruled here, against RR-0380 Q1)
**Ruling: whole wins.** When a whole list and a sections list of the same file both resolve, the whole list is kept and the sections list is dropped.
- On a task that matches an eng-all row and a side row, the parts that resolve may not cover what the eng-all row named: ui-app names section 1 (rule-lists.json:104), so src/components/x.tsx with src/lib/x.ts would lose section 1 under parts-win; specs-docs names section 9 (:203), so mobile/x.ts with a spec would lose section 9. Over the 20 open mixed tasks parts-win would drop section 1 on 7 and sections 3 and 9 on 7.
- Dropping the whole list would lose rules that a matched row asked for. Keeping it sends each rule once.
- Authority: RR-0380 Q1 drops the whole document "when its parts can be sent", and on these tasks they cannot; the 438 ruling Q3 gave the direction to this panel; RR-0385 item 4 sends nothing to him that the rules settle. Q1 is carried out by the row edit: every row whose paths sit on one side now sends parts, API routes included.
- Cost: on a mixed task, at most 5,927 characters more than the parts would be.
- The card's line is kept word for word, unscoped: fact 5 shows it acts on nothing else today, and D1 runs it on a non-engineering file.

#### CODE AND TABLE
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

#### WHAT THE ENGINEERING SEAT IS SENT (measured; material 30,000; lens-engineering.md)
| Files line | today | after |
|---|---|---|
| `mobile/src/app/x.tsx` | eng-all, 46,613 | eng-front + eng-shared, 40,686 |
| pipeline kind; `src/lib/parcels/report-compute.ts` | eng-all | eng-back + eng-shared, 42,849 |
| `src/app/api/parcels/search/route.ts` | eng-all | eng-back + eng-shared, 42,849 (the `not` on ui-app) |
| `mobile/src/app/x.tsx, src/lib/x.ts` | eng-all | all three lists, 46,063 |
| `mobile/x.ts, src/tests/x.test.ts` | eng-all | eng-all (de-dup) |
| web, tooling, spec kinds; src/components, src/features, src/app outside api; scripts/hooks | eng-all | unchanged |

- The default is one call per list (backlog-lane.mjs:186), so a split task makes 2 or 3 engineering calls where it made 1. The joined form `out-engineering-rules`, already accepted (check-lane-close.mjs:434), makes 1.

#### TESTS (written first; each to be seen red at its designed assertion, recorded in the lane's red.out, before the table and the line are edited; 08_agents.md:488 both directions)
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

#### SPEC 08 NOTE (owed)
Owed by engineering standards :465 ("A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit") and Spec 137 Rule 10 (:125): the 438 note at 08_agents.md:352 says "today `eng-all`". Exact text, one new line directly after :352, indented three spaces:

   Dated note 2026-11-22 (M-246, prior text kept; task-431 INPUTS.3, McFix Final; RR-0385 item 7, decision-170, and RR-0380 Q1, decision-165; operator, verbatim, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1913 "Task 431 - this now serves teh engineering seat with the right sections for the task - front-end vs backend" and :1865 "drop the full engineering when arts can be sent"): the engineering seat of the note above is sent the sections of the engineering standards that fit the task. Three section lists join `eng-all` in `scripts/analysis/rule-lists.json`: `eng-front` (section 1), `eng-back` (sections 3 and 9) and `eng-shared` (sections 2, 4 to 8 and 10 to 14: 8, 10 and 12 by RR-0380 Q2, 11 and 14 placed here by the plan review). The phone row gets `eng-front` and `eng-shared`; the pipeline-step and library rows and the API routes (ui-app no longer matches src/app/api) get `eng-back` and `eng-shared`; every other row that had `eng-all` keeps it. Each of them is an engineering list (`seatOf`), so "today `eng-all`" in the note above now reads "today `eng-all`, `eng-front`, `eng-back` and `eng-shared`", and the per-list rule asks for one `out-engineering-<id>` per resolved engineering list, or the joined `out-engineering-rules`. When a task resolves a whole list and a sections list of the same file, the whole list is kept and the sections list is dropped (`resolveTask`), so each rule is sent once and no rule that a matched row asked for is lost.

Also change .claude/review-templates/README.md:101 from "today `eng-all`" to "today `eng-all`, `eng-front`, `eng-back` and `eng-shared`".

#### GENERATED FILES
- docs/reports/generated/rule-lists-by-kind.md: made by `page --write`, on the Files line. The system map does not change: it names no rule-lists file (task-438's work commit 8745ee6dc changed the same scripts without it).

#### CUT-OVER
- **Running lanes.** The close judges a lane by the table at its range base, the merge-base with the board (check-lane-close.mjs:761-767, :840-842), with the lane's own hook copy; a lane that merges the board takes both together. Three running tasks change set: task-372 and task-383 (to eng-back + eng-shared) and task-381 (to eng-front + eng-shared); only if they merge the board before they close do they owe `out-engineering-<id>` for the new lists, or the joined set. The orchestrator tells them. task-431 itself is judged by its own branch table (:840), with the same 10 lists.
- **Prepped tasks.** task-380 (LATER) changes to eng-back + eng-shared. There is no plan folder for 372, 380, 381 or 383, so no prepped evidence goes stale. Check-tasks prints the `compliance:` reference commands for all four; that is a report, not a gate (rule-lists.mjs:490).
- **task-431 itself.** The round-1 outputs were moved to round1- names; this round's plan files are in docs/reports/reviews/task-431/. Task-430 (RUNNING) and task-439 (LATER) share the page, the table test and the mobile and ui-app rows with this plan: no hard order; whichever lands second merges the board and re-runs page --write and the table test before its close, and task-439 rewrites those rows as they stand after this plan.
- No gate is added. seatOf, the per-seat close and the launch gate are reused unchanged.

#### LANDING
rule-lists.mjs and rule-lists.json are protected paths (rule-lists.json:22). So the close takes two commits (check-lane-close.mjs:751-753; 137_mcqueue.md:100):
1. **Work commit:** the code line, the table, the tests, the Spec 08 note, the README line, the regenerated page and the task notes; `Task: task-431`.
2. **Close commit:** the lane records and the status change only.

#### ACCEPTANCE (real inputs)
- `rule-lists.mjs validate` is ok, and `page --check` is current.
- `resolve --type build --letter S`:
  - `--files mobile/src/app/x.tsx` gives eng-front and eng-shared;
  - the pipeline kind gives eng-back and eng-shared;
  - `--files src/app/api/parcels/search/route.ts` gives eng-back and eng-shared; `--files "mobile/x.ts, src/tests/x.test.ts"` gives eng-all and no sections list.
- `check-tasks` prints only counts and the compliance: reference commands (exit 0): its add lines show tasks 372, 380, 381 and 383; "no open task with both eng-all and a sections list" is the in-memory count of fact 6, re-run at the build head.
- D1, D2, S1, K1, P1, X1 and the two changed tests are green, and red.out holds each red.

#### NOT IN SCOPE
- Dropping the four surface specs: task-439, after task-430 (INPUTS.2).
- surface-136 on ui-app: only if INPUTS.1 (task-429, LATER) confirms the oversight; then a one-line row edit later (task-439 edits the same rows).
- Tests that mirror the rules (tasks 367, 441, 442).
- Renaming the generated page.

#### OPERATOR
Nothing needs his word. The plan grounder ruled the de-dup direction (whole wins) and the API routes (back end, so parts) from his words and the record (QUESTIONS-RULED.md). After this edit 4 of the 45 open tasks that get engineering text get parts (task-372, 380, 381, 383) and 41 keep eng-all through the tests, lane-tools, surfaces and specs rows; front-end web files keep eng-all (parts would save 5,377 of 46,613 characters and take sections 3 and 9 from the files there that touch the database).

#### UNVERIFIED
- Whether each test is actually red and then green (nothing was run).
- That mobile/ never gains database code.
- Call counts at real diff sizes (measured only at 30,000 characters).

#### ESTIMATE (GUESS)
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

## Implementation Notes
Dated note 2026-11-22 (M-246, prior text kept; RR-0379 · task-431 · Backlog; operator, verbatim: "We can run step 1 in parellel - we will add to the rules overtime")

Dated note 2026-11-22 (M-246, prior text kept; RR-0380 · task-431 · Backlog; operator, verbatim: "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N")

Dated note 2026-11-22 (M-246, prior text kept; RR-0383 · task-431 · Backlog; operator, verbatim: "1. what is your recommendation. I approve it")

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "Task 431 - this now serves teh engineering seat with the right sections for the task - front-end vs backend"): re-scoped. The plan on this card (PLAN-431-v2) and its round 1 records are superseded; a new plan follows the engineering seat task. The A, B or C question of the plan grounder is closed by this ruling. The four surface specs are dropped by a separate card after task-430.

2026-11-22 (orchestrator, from the task-438 plan ruling by Cairn-Ground-P438, docs/reports/reviews/task-438/QUESTIONS-RULED.md; word for word): Task-431 carries the de-dup line moved out of task-438 (438 plan ruling, RR-0380 and RR-0385 item 7): add scripts/analysis/rule-lists.mjs and src/tests/backlog/rule-lists.logic.test.ts to its Files line; in resolveTask, before `return result` (:278), add `result.lists = result.lists.filter((l) => l.whole || !result.lists.some((w) => w.whole && w.file === l.file));` so a file's text goes once when its whole list and a sections list both resolve; rule in its plan the direction against RR-0380 Q1 ('the whole engineering document is dropped when its parts can be sent'), with one resolveTask temp-table test (whole plus sections on one file, planted defect: the line removed); change the line of PLAN-431-v3 that says it relies on 438's de-dup; re-prep it after 438 lands.

2026-11-23 taken on the board at lane launch (lane BL-TBL431, worktree /Users/brettpreston_macmini/Buildo-wt-tbl431, branch wf1/inc1b-tbl431), RR-0240

## References
- docs/reports/reviews/task-431/GROUNDER-PLAN.md
- docs/reports/reviews/task-431/TRIAGE-PLAN.md
- docs/reports/reviews/task-431/seat-integration-1.md
- docs/reports/reviews/task-431/seat-reality-check-1.md
- docs/reports/reviews/task-431/seat-regression-1.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:orchestrator-doc17 backlog/docs/doc-17 - Orchestrator-readings-not-rulings.md
- compliance:policy-124-s2-s5 docs/specs/01-pipeline/124_step_standard_policy.md
- compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed — "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1852)
- RR-0379 Step 1 runs in parallel; handbook rules are added over time — "We can run step 1 in parellel - we will add to the rules overtime" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1859)
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules — "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1865)
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached — "1. what is your recommendation. I approve it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1895)
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0141 Operator: Q-LT-1
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0147 Operator answer NAME-1
- RR-0149 Increment 1·A tooling location
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed (names RR-0378) — "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1852)
- RR-0379 Step 1 runs in parallel; handbook rules are added over time (names task-431, RR-0379) — "We can run step 1 in parellel - we will add to the rules overtime" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1859)
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules (names task-431, RR-0380) — "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1865)
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached (names task-431, RR-0383) — "1. what is your recommendation. I approve it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1895)
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)

## Prior reviews and lane reports
### task-431 (this task)
- docs/reports/reviews/task-431/FINDINGS-PLAN.md
- docs/reports/reviews/task-431/FOLD-CHECK.md
- docs/reports/reviews/task-431/GROUNDER-PLAN.md
- docs/reports/reviews/task-431/QUESTIONS-RULED.md
- docs/reports/reviews/task-431/TRIAGE-PLAN.md
- docs/reports/reviews/task-431/seat-integration-1.md
- docs/reports/reviews/task-431/seat-reality-check-1.md
- docs/reports/reviews/task-431/seat-regression-1.md
- docs/reports/lanes/2026-11-22/BL-ENG438/REPORT.md (lane report naming task-431)

## Dependencies
- (none)
