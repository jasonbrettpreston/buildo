# Review context for task-431 (no plan id) written 2026-11-22 by backlog-brief.mjs (round 1)

## Task
task-431 INPUTS.3 The review table sends product tasks their handbook plus the relevant engineering sections; infrastructure tasks unchanged
status: LATER · milestone: m-1 · assignee: none · labels: McFix, McFix V2

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. THIS TASK (steps 3 and 4): in scripts/analysis/rule-lists.json: the engineering standards entry split by section into front-end, back-end and shared lists (sections 1, 8, 10, 12 front end; 3, 9 back end; 2, 4, 5, 6, 7, 13 shared; 11 and 14 placed at plan review); front-end kinds get surface-136 plus front-end and shared; pipeline and by-law kinds get their handbook plus back-end and shared; Specs 126, 127, 128, 135 no longer sent whole to front-end kinds once INPUTS.2 has landed; the lane-tools and other infrastructure rows unchanged (Spec 08, Spec 137); ui-app attaches surface-136 if INPUTS.1 confirms the oversight. Proof before the switch at plan review.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md

## Acceptance criteria

## Implementation Plan
#### PLAN-431-v2: the review table sends product tasks the engineering standards by section (front, back, shared); infrastructure rows unchanged; the four surface specs stay for now

Planner: read-only, against the board worktree (~/Buildo-wt-board) at head 6c3f450c9 (tasks 432 and 433 folded). Every measure below was made in memory with the table's own functions (resolveTask, listBlocks, wholeListText, buildLensInputs, joinLists); nothing was written, no test runner run.

#### RULED (the operator has answered; recorded here as ruled lines, not open)
- RR-0376 to RR-0379 (MORNING-DECISIONS.md:1852 and after), verbatim: "Just send the handbook rules for the task except for infastructure rules (spec 08 and the Mclane) and then the relevant sections of the engineering protocols.  Problem solved."; "Plan approved. We are running right now on this?"; "We can run step 1 in parellel - we will add to the rules overtime".
- RR-0380 (decision-165) and RR-0383 (decision-168), verbatim: "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N" and "1. what is your recommendation. I approve it".
- Q1 = option B: THIS task sends the engineering sections now (eng-front, eng-back, eng-shared; eng-all kept for the infrastructure rows). Specs 126, 127, 128, 135 stay attached to the front-end rows in this task; they are dropped in a later, separate table edit (NOT IN SCOPE) once task-430 has landed (its scope approved RR-0384, decision-169).
- Q2 = yes: sections 8, 10 and 12 are shared, as sorted below.
- Q3 (for the later edit, recorded now): tasks that edit the surface specs themselves (the specs-web-admin row) keep Specs 126, 127, 128, 135 attached.
- Q4 = no: the by-law row gains NO engineering lists; it stays ["bylaw-133"].
- Q5: no surface-136 on ui-app in this task (see NOT IN SCOPE).
- Principles: standardized, observable, scalable, accurate, understandable; simple; no scope creep; "you are probaley rebuilding stuff that already exists you do this all the time" (MORNING-DECISIONS.md:1520).

#### BASIS (rules quoted, re-measured at the new head)
- The table already supports what is needed, so nothing is built: a list may be `sections` picked by heading, matched at the start of the title after leading emoji and punctuation, one heading each, and "a section is allowed only where the file itself separates rules from history or narrative. Never a hand-picked clause" (rule-lists.json line 1 `$comment`; rule-lists.mjs:71-96 `headings`/`sectionText`, which strips leading emoji with `/^[^\p{L}\p{N}]+/u` and throws unless exactly one heading matches; rule-lists.mjs:98-107 `listBlocks`). The same shape is used by `step-132`, `agents-s7-s11`, `bylaw-133`, `surface-136`.
- The close check and plan gate prove a sections list the same way as a whole one: `listProof` recomputes `listBlocks(table.lists[l.id])` per list id and compares (check-lane-close.mjs:410-414). No new proof code.
- Card (task-431), Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md (extended below, item (d)).
- Protected path: rule-lists.json is in the table's `protected_paths`; "a commit that changes a protected path may not also move a task to finished" (check-lane-close.mjs:738-740, self-edit rule COMPLY.2); Spec 137 two-commit close (137_mcqueue.md:138). Reuse task-412's shape (commit 52a49566e: table edit, test, task file, `Task:` trailer; folder docs/reports/reviews/task-412/).

#### FACTS FOUND (with file:line)
1. The 13 rows that attach `eng-all` (whole file, 46,076 chars; rule-lists.json lists.eng-all): step-pipeline, api-lib, ui-app, middleware-config, surfaces, mobile, lane-tools, generated-reports, generated-127, policy-reports, reference-docs, specs-docs, tests.
2. Section titles of docs/specs/00_engineering_standards.md (level 2 headings, "emoji + N. Title", lines 9, 35, 51, 71, 97, 136, 144, 160, 175, 218, 235, 304, 410, 452). Selectors are the FULL title after the emoji ("1." alone also starts "1.1", and "1" starts "10" to "14"; `sectionText` throws on more than one hit, so `validate` catches a bad selector). Sizes (chars): 1:3,214 2:1,468 3:1,221 4:3,667 5:4,527 6:566 7:1,023 8:1,160 9:4,156 10:1,719 11:4,382 12:12,962 13:2,906 14:2,555; sum 45,526; the other 550 chars (title and intro, lines 1-7) are sent to no non-infrastructure kind.
3. SORTING, checked against the text:
 - 1 front end: 1.1 Tailwind mobile-first, 1.2 `src/components/ui/`, 1.3 Expo patterns (lines 11-31).
 - 2 shared: 2.2 try-catch covers routes and UI (line 41). 3 back end: migrations, rollback, pagination (lines 51-69). 4 shared: 4.1 route guard (back), 4.3 "Frontend Security" (line 80), 4.4 API design for multi-app (line 87). 5, 6, 7 shared (tests, logging, dual code path TS and JS).
 - 8 shared: 8.1 is the `route.ts` export rule (API, line 162); 8.2 TypeScript target gotchas for all code (line 166).
 - 9 back end: `scripts/*.js` pipeline safety (line 175-).
 - 10 shared: 10.1 data flow, 10.2 front-end phase limits, 10.3 "API routes must be thin" (lines 220-231); binds both sides.
 - 11 shared: the Plan Compliance Checklist, "Before presenting PLAN LOCKED, the plan MUST address each applicable item" (line 237); CLAUDE.md "PLAN COMPLIANCE GATE: Read section 11 ... Verify the plan addresses every applicable item" applies to every plan; its conditional blocks (lines 245-300) are inside the section and the table's grain is the section.
 - 12 shared: titled "Frontend Foundation Tooling" (line 304) but 12.8 SQL linting and migration safety (line 345), 12.10 real-DB tests (line 355) and 12.11 footgun lint (line 364) are back-end rules that section 11 cites (lines 292, 297-299). Cost: 12,962 chars to back-end kinds. (Ruled, Q2.)
 - 13 shared: 13.1 PostHog (front), 13.3 backend logging (lines 410-433).
 - 14 shared: The Prevention Loop (line 452) is a process rule for review findings; its registry rows (lines 458-465) bind back end (3), admin plus back end (1), cross-cutting (2); no kind is excluded. 2,555 chars.
 Result: eng-front = 1 (3,214); eng-back = 3, 9 (5,377); eng-shared = 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14 (36,935).
4. The step-pipeline row matches `scripts/**/*.descriptor.json` (rule-lists.json row step-pipeline globs), so a front-end task whose Files line holds a surface descriptor also gets every pipeline list; the page's "McFrontend web" example holds one.
5. The ui-app row globs are `src/components/**`, `src/app/**`, `src/features/**`; `src/app/**` includes `src/app/api/**`, so an API route file matches ui-app and api-lib both.
6. specs-web-admin and specs-mobile paths (`docs/specs/**`) also match specs-docs, which keeps `eng-all`.
7. NEW at this head, double sending: a task whose Files line mixes a front-end or back-end row with any row that keeps `eng-all` (tests, specs-docs, lane-tools, generated-reports, and so on; for example `src/components/report/X.tsx, src/tests/x.test.ts` resolves eng-front, eng-shared AND eng-all) receives the engineering text twice: the whole file and the sections. The resolver unions by list id and does not know that eng-all contains the sections (rule-lists.mjs:234-). In-memory count: 22 of the 314 open tasks would resolve to eng-all plus a split list (267, 317, 345, 357, 366, 373, 375, 376, 378, 379, 382, 384, 387, 389, 390, 393, 394, 395, 396, 406, 411, 416). Extra sent per such task: 40,149 chars (front and shared) or 42,312 (back and shared). This task's own Files line (json under scripts/analysis, a test, a generated page) is one of them only through eng-all. See OPEN QUESTION A.
8. Tests that break on this change (line numbers re-measured at the new head; task-433 added tests to rule-lists.logic.test.ts but none of its lines about eng-all or the surface lists moved): rule-lists-table.logic.test.ts:20-23 (mobile and surfaces rows contain eng-all), :161 (the golden-path resolve is an exact list with eng-all once), :194-203 (`without` is exactly eng-all plus four); backlog-lane.logic.test.ts:343 (mobile plus API route Files attach mobile-98, eng-all, storage-doc16, inc-F). Stay green, since the surface specs stay and specs rows keep eng-all: rule-lists.logic.test.ts:53, :59-63, :339 (eng-all still defined whole), rule-lists-table.logic.test.ts:99, :112, :179 and backlog-lane.logic.test.ts:638 (lane-tools keeps eng-all). So rule-lists.logic.test.ts needs no edit, which is stated, not run.
9. Page: `rule-lists.mjs validate` today: "ok 55 lists, 23 rows"; `page --check` current. Regenerated with `node scripts/analysis/rule-lists.mjs page --write` (renderPage rule-lists.mjs:532-). Registered generated doc, `.husky/pre-commit` runs `page --check`.

#### MEASURES (Q1-B shape only: characters sent to the compliance reviewer and calls; "per-list" = lens-input parts at 30,000 characters of material, the page's own measure; "joined" = the task-423 joined form)
| Files line | today | after |
|---|---|---|
| front-end only `src/components/report/X.tsx` | 565,831 chars / 13 per-list / 9 joined | 559,904 / 14 / 8 |
| the page's web example (adds a descriptor) | 679,426 / 18 / 11 | 678,876 / 20 / 10 |
| phone `mobile/src/app/` | 766,416 / 18 / 12 | 760,489 / 19 / 12 |
| pipeline `scripts/steps/_schema/converted.json, scripts/load-permits.js` | 197,241 / 10 / 3 | 193,477 / 11 / 3 |
| API `src/app/api/parcels/search/route.ts` | 122,494 / 6 / 2 | 121,944 / 8 / 2 |
| by-law (first `layer23` glob) | 335,345 / 11 / 5 | unchanged (ruled) |
Plainly: the engineering split saves 5,927 chars for a front-end task (46,076 to 40,149, about 1 percent of its input) and 3,764 for a pipeline task (46,076 to 42,312), and adds one per-list call; the 531,000-character relief the card describes comes only from the later surface-spec drop. The measures were taken without task-435's note; section 12 and eng-all each grow by the note's length when it lands.
Open tasks whose resolved list set changes: 30 of 314 (was 41 in v1, which included the four-spec drop): RUNNING 354, 366, 372, 373, 374, 375, 376, 378, 381, 383, 384, 387, 389, 390, 395, 396, 406, 411; WAITS 267, 317; LATER 345, 357, 379, 380, 382, 391, 392, 393, 394, 416. None became unresolvable.

#### WHAT
One data edit and its tests: three new lists on the existing engineering standards file, five rows pointed at them, page regenerated. Specs 126, 127, 128, 135 are not touched. No code in rule-lists.mjs or check-lane-close.mjs changes.

#### THE EXACT TABLE EDITS (scripts/analysis/rule-lists.json)
1. `lists`: after `eng-all` add
 - `eng-front`: file docs/specs/00_engineering_standards.md, sections ["1. Architecture & UI Standards"], generated_by "hand-written".
 - `eng-back`: same file, sections ["3. Database Management & Scaling", "9. Pipeline & Script Safety"].
 - `eng-shared`: same file, sections ["2. Error Handling & Stability", "4. Security & API Contracts", "5. Testing Standards", "6. Centralized Logging", "7. Dual Code Path Safety", "8. Next.js & TypeScript Constraints", "10. Frontend/Backend Boundary", "11. Plan Compliance Checklist", "12. Frontend Foundation Tooling", "13. Observability Standards", "14. The Prevention Loop"] (the first sorting is not used; titles copied exactly, `validate` fails on a wrong one).
 - `eng-all` stays: eight rows keep it (lane-tools, generated-reports, generated-127, policy-reports, reference-docs, specs-docs, middleware-config, tests) and test :339 pins it.
2. Rows, `lists` field (order kept; each touched row's `why` amended to name RR-0376 and the new lists):
 - step-pipeline: `eng-all` replaced by `eng-back`, `eng-shared` (its why says "attached whole (eng-all)": fix the sentence).
 - api-lib: `["eng-back","eng-shared"]`.
 - ui-app: `["eng-front","eng-shared"]`.
 - surfaces: `eng-all` replaced by `eng-front`, `eng-shared`; the surface specs stay (`["surface-136","surface-126","surface-127","surface-128","surface-135","eng-front","eng-shared"]`).
 - mobile: `eng-all` replaced by `eng-front`, `eng-shared`; mobile and surface lists stay.
 - NOT touched: bylaw (stays ["bylaw-133"], ruled), specs-web-admin, specs-mobile, surface-importers, surface-contract-routes, panel-records, generated-127, storage, compute-import, queue-records, middleware-config, tests, and every infrastructure row. Pinned phrases in the contract-routes `why` are untouched because the row is untouched.
3. Page: `rule-lists.mjs page --write`; commit the result.

#### TESTS (red first; each planted defect with its control). Pattern: temp git repo plus `--root` and `--table` copy (rule-lists-table.logic.test.ts:179-190 `resolveIn`, :217-228 for task-412). New describe block "task-431" in src/tests/backlog/rule-lists-table.logic.test.ts.
- T1 front kinds: `src/components/report/X.tsx` (surfaces), `mobile/src/app/x.tsx` (mobile), `src/features/x.ts` (ui-app) each resolve `eng-front` and `eng-shared` and none of `eng-all` and `eng-back`. (The assertions about Specs 126 to 135 being absent are not in this task.) Red now. PLANTED DEFECT: a copy of the table with `eng-all` restored on the row fails naming the row; the real table is the control.
- T2 back kinds: `scripts/steps/x.json` (step-pipeline) and `src/lib/x.ts` (api-lib) resolve `eng-back` and `eng-shared`, and not `eng-front` or `eng-all`. By-law (ruled Q4): the `bylaw` row lists exactly ["bylaw-133"], and a path from the `layer23` key of mcbylaws/protected-paths.json resolves no eng-* list. PLANTED DEFECT: a copy where api-lib lists `eng-all` fails; a copy where bylaw gains `eng-shared` fails; control the real table.
- T3 infrastructure and the rows not changed: lane-tools (`scripts/hooks/x.mjs`), generated-reports, generated-127, policy-reports, reference-docs, specs-docs, middleware-config, tests each still resolve `eng-all` and none of the three new lists; specs-web-admin and specs-mobile still resolve the lists they have (the specs rows are the ruled Q3 and carry the four specs). PLANTED DEFECT: a copy where lane-tools lists `eng-shared` instead fails.
- T4 partition (the guard that makes the split safe to keep): the level-2 headings of the engineering standards file (exported `headings`) are each in exactly one of eng-front, eng-back, eng-shared, and the three lists together hold every character of every `## ` section (whitespace squashed). PLANTED DEFECT: the same check on a temp copy of the file with a new "## 15. X" heading fails "unassigned"; a temp table with one section in two lists fails "in two lists". Reason: a section added later would otherwise go to no non-infrastructure kind with no sign; `validate` checks only that a named selector exists.
- T5 section text: `lens-input --list eng-front` holds "1.1 Mobile-First UI Mandate" and not "9.1 Transaction Boundaries"; `--list eng-back` the reverse (pattern: rule-lists-table.logic.test.ts:206-213). PLANTED DEFECT: a temp table with the two lists' sections swapped fails both.
Existing tests changed in the same commit: rule-lists-table.logic.test.ts:20-23 (mobile and surfaces rows contain eng-front and eng-shared; the `static-page.json` probe expects them), :161 (the golden path resolves ['surface-136','surface-126','surface-127','surface-128','surface-135','eng-front','eng-shared','eng-all','five-words','plan-protocol','inc-S','ms-S']: eng-all stays through the tests row, fact 7), :194-203 (`without` becomes ['eng-front','eng-shared','five-words','plan-protocol','inc-S','ms-S'], the ui-app row); backlog-lane.logic.test.ts:343 (the list becomes mobile-98, eng-front, eng-back, eng-shared, storage-doc16, inc-F, and `eng-all` is asserted absent). Run before the edit to prove the new and changed tests red (name them), after to prove them green.

#### ORDER
1. task-435 lands FIRST (the dated note in section 12 of the engineering standards, regenerating the page). Reason: its note changes the text of eng-all and of section 12, so any plan-compliance evidence of task-431 that names eng-all (this task's Files line resolves eng-all through lane-tools, tests and generated-reports) would be stale if 435 landed after 431's plan review; run 431's plan-prep review after 435's commit, and regenerate this task's page after it. Check made: task-435's plan puts the note "directly under the Status blockquote at the head of section 12 (after :306, before '### 12.1')". A blockquote is not a heading; `headings()` ignores it, the section runs to "## 13." (a level 2 heading), so the note is inside the text `eng-shared` selects; checked in memory by inserting a blockquote with inline backticks and a "###" inside its text after line 306: sectionText("12. Frontend Foundation Tooling") contains it, and the file still has 14 level-2 headings. T4 compares whole-section characters, so it tolerates it.
2. The orchestrator extends the card's Files line (item (d)).
3. Write T1 to T5 and the changed expectations; run red.
4. Edit the table; `rule-lists.mjs validate`; `page --write`; `page --check`.
5. Run the three test files and `check-tasks`; green.
6. Commit 1 through the real hooks: table, tests, page, task file, `Task: task-431`; the task stays RUNNING (protected path, check-lane-close.mjs:738-740).
7. Commit 2: close with evidence (commit 1 sha, red then green, page check).
8. Land when no other table-editing lane sits between plan review and launch (task-412's note: "the other table-editing tasks land one at a time").

#### LANDING
Two commits as above; protected path rule-lists.json; the board keys base_ref, finished_statuses, protected_paths, exempt are unchanged (check-lane-close.mjs:746). Stale-evidence cost: (1) a task prepped but not launched whose set changes (WAITS 267 and 317 are two of the 30) must re-run plan compliance for the new list ids; launch reads the live board table (backlog-lane.mjs:78); (2) a RUNNING lane keeps its table until its range base passes commit 1 (the close check reads the table at the merge-base, check-lane-close.mjs:752-755); after it merges the board it owes out-compliance files for the new ids in place of eng-all; (3) `check-tasks` (rule-lists.mjs:499-) prints a references add/remove command for each of the 30 tasks. Only task-375's folder on the board holds plan-compliance files; other lanes' evidence is in their worktrees and was not read.

#### ACCEPTANCE
(a) `validate` ok; `page --check` current; T1 to T5 and the changed tests green, each red before the edit.
(b) A front-end Files line gets eng-front and eng-shared and not eng-all through the front rows; the figures above are reproduced (559,904 chars, 8 joined calls for `src/components/report/X.tsx`, plus the note's length from task-435).
(c) Pipeline and API Files lines get eng-back and eng-shared; the by-law Files line is unchanged; eight rows still resolve eng-all.
(d) The three lists partition the 14 sections (T4).
(e) `check-tasks` lists the 30 changed tasks and none unresolvable; the final summary reports the count and the two prepped tasks, and the double-sending count answered under OPEN QUESTION A.
(f) Nothing was added the card or ruling did not name (124a:988 "no change adds a tool, field or rule its card or ruling did not name"): no code, no new field, Specs 126 to 135 untouched.

#### (d) THE CARD'S FILES LINE (exact)
Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md
(Files changed: the table, the two test files named first, the page. rule-lists.logic.test.ts is kept from the original card because new tests may be placed there; the close check refuses paths changed outside the Files line, not paths listed and left alone. The card's Files line today lacks the two other test files.)

#### NOT IN SCOPE
- The later separate table edit: drop Specs 126, 127, 128, 135 from the surfaces, mobile, surface-importers and surface-contract-routes rows (they get surface-136), once task-430 has put the handbook's critical lines in Spec 136, keeping them on the specs-web-admin row (Q3); it needs its own card or a re-open of this one by ruling, and it is not built here. It is the edit that delivers the large saving (about 468,000 chars per front-end task, measured in v1), and task-429's report (REPORT-429.md section 11) asks that `surface-importers` be repointed to 136 in it, since it would otherwise be left with no list.
- ui-app and surface-136: task-429 (REPORT-429.md section 6) finds the ui-app split deliberate (surface membership follows the `frontend` path list) but leaking for three files; no surface-136 is added to ui-app here, and the leak is for the later edit or its own card.
- Adding handbook rules (tasks 429, 430); editing Specs 126 to 135 or the engineering standards file (task-435 does its own note); any change to infrastructure rows, rule-lists.mjs, the close check or lens-input; the descriptor overlap (fact 4); the plan-review input size; moving middleware-config and tests to a side.

#### OPEN QUESTION (new, from this re-measure; the only one left)
A. Double sending (fact 7). A task whose Files line touches a front-end or back-end row and also a row that keeps eng-all (a test file beside a component is the common case; 22 of 314 open tasks) gets the engineering text twice: 40,149 or 42,312 extra chars, which for those tasks is more than today (46,076 once). Options: (1) accept it for this task and report the count (no code; the double text is still the same rules; cost: the reviewer reads the file twice for those tasks, and the card's "infrastructure rows unchanged" is kept); (2) give the `tests` row `eng-shared` instead of `eng-all` (table only; test-only tasks lose sections 1, 3 and 9; the mixed tasks through lane-tools, specs-docs and generated-reports still double); (3) a small resolver rule in rule-lists.mjs (a list whose file is already attached whole is not added again as sections): removes it everywhere, but it is code in a protected path, needs its own test and a ruling, and is not named by the card. Planner reads (1) as the smallest and (3) as the complete fix; not chosen here.

#### UNVERIFIED
- No test was run: which tests break (fact 8) is read from the assertions, and rule-lists.logic.test.ts being unaffected is the same reading.
- Committed plan evidence of lanes outside the board tree; the 30-task count is a dry run on the board's task files, not each lane's own table copy.
- Joined-form call counts use the page's nominal 30,000 characters of material, not a real plan context.
- The length of task-435's note (not yet written) and so the final character counts; task-435's placement is read from its plan, not from a landed commit.
- `middleware-config` and `tests` staying on eng-all is the planner's reading of "infrastructure rows keep what they get today", not a ruling.
- Reviewer behaviour with fewer documents ("one small document per call finds more", card text) is the card's measurement, not repeated.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md

## Implementation Notes
Dated note 2026-11-22 (M-246, prior text kept; RR-0379 · task-431 · Backlog; operator, verbatim: "We can run step 1 in parellel - we will add to the rules overtime")

Dated note 2026-11-22 (M-246, prior text kept; RR-0380 · task-431 · Backlog; operator, verbatim: "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N")

Dated note 2026-11-22 (M-246, prior text kept; RR-0383 · task-431 · Backlog; operator, verbatim: "1. what is your recommendation. I approve it")

## References
- (none)

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
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136 — "Exactly 1. Leave Spec 137 and Spec 08 as they are, and drop that part of task 427." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1836)
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed — "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1852)
- RR-0379 Step 1 runs in parallel; handbook rules are added over time — "We can run step 1 in parellel - we will add to the rules overtime" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1859)
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules — "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1865)
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached — "1. what is your recommendation. I approve it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1895)
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer) — "These look great - teh 13 are perfect. Task 430 becomes three small things: stop the clipping, make each line reflect its notes, and add these 13 lines. Item 9 stays a pointer, so the page does not grow by copying tables." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1901)
- RR-0140 Operator: faster pushes and GOs asked
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
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136 (names RR-0376) — "Exactly 1. Leave Spec 137 and Spec 08 as they are, and drop that part of task 427." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1836)
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed (names RR-0378) — "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1852)
- RR-0379 Step 1 runs in parallel; handbook rules are added over time (names task-431, RR-0379) — "We can run step 1 in parellel - we will add to the rules overtime" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1859)
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules (names task-431, RR-0380) — "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1865)
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached (names task-431, RR-0383) — "1. what is your recommendation. I approve it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1895)
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer) (names RR-0384) — "These look great - teh 13 are perfect. Task 430 becomes three small things: stop the clipping, make each line reflect its notes, and add these 13 lines. Item 9 stays a pointer, so the page does not grow by copying tables." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1901)

## Prior reviews and lane reports
### task-431 (this task)
- (none)

## Dependencies
- (none)
