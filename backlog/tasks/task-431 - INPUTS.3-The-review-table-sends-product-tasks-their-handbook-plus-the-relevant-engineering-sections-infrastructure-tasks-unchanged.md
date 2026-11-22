---
id: TASK-431
title: >-
  INPUTS.3 The review table sends product tasks their handbook plus the relevant
  engineering sections; infrastructure tasks unchanged
status: LATER
assignee: []
created_date: '2026-11-22T16:25:00Z'
updated_date: '2026-11-22T20:33:00Z'
labels:
  - McFix
  - McFix V2
  - McFix Final
milestone: m-1
dependencies: []
type: build
ordinal: 131012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. THIS TASK (steps 3 and 4): in scripts/analysis/rule-lists.json: the engineering standards entry split by section into front-end, back-end and shared lists (sections 1, 8, 10, 12 front end; 3, 9 back end; 2, 4, 5, 6, 7, 13 shared; 11 and 14 placed at plan review); front-end kinds get surface-136 plus front-end and shared; pipeline and by-law kinds get their handbook plus back-end and shared; Specs 126, 127, 128, 135 no longer sent whole to front-end kinds once INPUTS.2 has landed; the lane-tools and other infrastructure rows unchanged (Spec 08, Spec 137); ui-app attaches surface-136 if INPUTS.1 confirms the oversight. Proof before the switch at plan review.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md
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
# PLAN-431-v3: the engineering seat gets the right sections: front end, back end (a data edit on top of 438)

Planner: Opus, read-only, board head 0c4a0d2fb. Measurements were taken in memory with the table's functions and 438's de-dup simulated. Supersedes PLAN-431-v2.

## BASIS
- RR-0385 item 7, verbatim: "Task 431 - this now serves teh engineering seat with the right sections for the task - front-end vs backend".
- RR-0376: "the relevant sections of the engineering protocols".
- RR-0380: "drop the full engineering when arts can be sent". 438's de-dup implements this.
- Whole-section cut, and "Never a hand-picked clause" (rule-lists.json line 1 `$comment`).
- The round-1 review (docs/reports/reviews/task-431/QUESTIONS-RULED.md, GROUNDER-PLAN.md) is used as verified evidence: sort, sizes, task-406 gap, by-law.

## FACTS (file:line)
1. Sections of docs/specs/00_engineering_standards.md are at lines 9, 35, 51, 71, 97, 136, 144, 160, 175, 218, 235, 304, 412, 454. The sort (grounder Q1, Q7):
 - front = 1 (3,214)
 - back = 3, 9 (5,377)
 - shared = 2, 4-8, 10-14 (37,472)
 - The file is 46,613; the three lists hold 46,063, and the 550-character difference is the title block.
2. Server code sits inside "front" folders:
 - ui-app (src/features/leads/lib/get-lead-feed.ts, record-lead-view.ts, timing.ts import the database).
 - surfaces: its `frontend` key holds `src/app/(maxbld)/**`, and `src/app/(maxbld)/parcel-tool/(static)/home/page.tsx:10` imports `pool`. It also holds `scripts/surfaces/*.mjs`.
 - For these rows front + back + shared is the whole file, so **ui-app and surfaces keep eng-all**: the same text in one call instead of three.
3. mobile/ runs no database query (grep for `pool.query`/`.from(` finds none in app code).
4. src/lib and src/app/api hold no .tsx (0 files), so api-lib is back end (grounder Q4).
5. task-406 (181e0e344) retired five section lists because sections 6, 7, 8, 12, 13 reached no row. T4 guards that gap.
6. By-law paths: of the 2,378 tracked files under the layer23 globs, all get engineering text through other rows today. After this edit 478 keep eng-all and 1,900 get eng-back + eng-shared (measured, matching grounder Q5). The bylaw row stays `["bylaw-133"]`.
7. Without 438's de-dup, 21 open tasks would get the text twice. With it, none do.

## WHAT, AND THE EXACT TABLE EDITS (scripts/analysis/rule-lists.json)
1. Under `lists`, after `eng-all` (:31), add these (validated in memory, `validateTable` returns []):
 - `"eng-front": { "file": "docs/specs/00_engineering_standards.md", "sections": ["1. Architecture & UI Standards"], "generated_by": "hand-written" }`
 - `"eng-back": { …same file, "sections": ["3. Database Management & Scaling", "9. Pipeline & Script Safety"] … }`
 - `"eng-shared": { …same file, "sections": ["2. Error Handling & Stability", "4. Security & API Contracts", "5. Testing Standards", "6. Centralized Logging", "7. Dual Code Path Safety", "8. Next.js & TypeScript Constraints", "10. Frontend/Backend Boundary", "11. Plan Compliance Checklist", "12. Frontend Foundation Tooling", "13. Observability Standards", "14. The Prevention Loop"] … }`
2. Rows. In each changed row, `eng-all` is replaced in place and the `why` names RR-0385 and the lists:
 - `step-pipeline` (:82) gets `eng-back`, `eng-shared`. Fix its "attached whole (eng-all)" sentence.
 - `api-lib` (:95) gets `["eng-back","eng-shared"]`.
 - `mobile` (:145) gets `eng-front`, `eng-shared`.
 - Kept on eng-all: ui-app and surfaces (fact 2), middleware-config, lane-tools, generated-reports, generated-127, policy-reports, reference-docs, specs-docs, tests.
 - bylaw is unchanged.
3. Run `rule-lists.mjs page --write`. The phone, pipeline and storage kinds change.

## WHAT THE ENGINEERING SEAT IS SENT
Per review, measured at 30,000 characters of material, the page's measure (rule-lists.mjs:529):

| Files line | today | after 431 |
|---|---|---|
| front-end web `src/components/report/X.tsx` | eng-all, 46,613 chars, 1 call | unchanged |
| phone `mobile/src/app/x.tsx` | 46,613 chars, 1 call | front + shared, 40,686 chars, 2 calls |
| pipeline `scripts/steps/_schema/converted.json, scripts/load-permits.js` | 46,613 chars, 1 call | back + shared, 42,849 chars, 2 calls |
| API `src/app/api/parcels/search/route.ts` | 46,613 chars, 1 call | eng-all, 46,613 chars, 1 call (it matches ui-app too; the de-dup keeps it from becoming 89,462 / 3) |
| mixed `mobile/src/app/x.tsx, src/lib/x.ts` | 46,613 chars, 1 call | three lists, 46,063 chars, 3 calls |
| mixed `src/components/report/X.tsx, src/tests/x.test.ts` | 46,613 chars, 1 call | unchanged |

Compliance is unchanged by 431. For example the web task's compliance seat gets 519,755 characters in 12 calls.

Plainly: the split saves 3,764 to 5,927 characters and costs one extra call on phone, pipeline and src/lib-only tasks. That is what the ruling orders.

Open tasks whose engineering set changes: 3 of 327 (372 RUNNING to back+shared, 380 LATER to back+shared, 381 RUNNING to front+shared). RUNNING lanes read the table at their range base (check-lane-close.mjs:751-754), so they change only if they merge the board.

## TESTS (red first)
New describe "task-431" in src/tests/backlog/rule-lists-table.logic.test.ts, using the resolveIn temp-table pattern (:181-192):
- **T1 front:** `mobile/x.ts` resolves eng-front and eng-shared, with no eng-back and no eng-all. Planted defect: a copy with eng-all restored on mobile resolves eng-all only (de-dup), so the test fails naming the row.
- **T2 back:**
- `scripts/steps/x.json` and `src/lib/x.ts` resolve eng-back and eng-shared, with no eng-front and no eng-all.
- The bylaw row is exactly `["bylaw-133"]`.
- The truthful by-law clause: a layer23 path that hits only step-pipeline resolves eng-back and eng-shared, and one that hits lane-tools or tests resolves eng-all.
- Planted defect: a copy with api-lib on eng-all fails.
- **T3 kept rows:**
- `src/features/x.ts`, `src/app/(maxbld)/x/page.tsx`, `scripts/hooks/x.mjs` and `src/tests/x.test.ts` resolve eng-all and none of the three.
- A mixed `mobile/x.ts, src/tests/x.test.ts` resolves eng-all only (no double sending).
- Planted defect: a copy with ui-app on front+shared drops section 3 for get-lead-feed.ts.
- **T4 partition:** every level-2 heading of the file (exported `headings`, rule-lists.mjs:71) is in exactly one of the three lists, and together they hold every `## ` section's text (whitespace squashed). No code is needed. Planted defect: a temp copy with `## 15. X` fails with "unassigned". Control: the real file passes.
- **T5 text:** `lens-input --list eng-front` holds "1.1 Mobile-First UI Mandate" and not "9.1"; `eng-back` the reverse.

Existing tests changed in the same commit: rule-lists-table.logic.test.ts:21 and :23. The mobile row now holds eng-front and eng-shared, and `mobile/x.ts` expects them; surfaces keeps eng-all. Lines :161 and :194-203, rule-lists.logic.test.ts:58-63 and backlog-lane.logic.test.ts:343 are unchanged, because their resolves keep eng-all (measured).

## ORDER
438 lands first. This edit relies on its de-dup and its routing; without the de-dup, 21 tasks double.

## LANDING
rule-lists.json is a protected path, so a two-commit close (check-lane-close.mjs:740). Follow task-412's shape (52a49566e).

## ACCEPTANCE
- `validate` is ok.
- `page --check` is current.
- T1 to T5 are green.
- The three tasks above show their new set in `rule-lists.mjs resolve`.

## NOT IN SCOPE
- Dropping the four surface specs (task-439).
- surface-136 on ui-app.
- The tests that mirror the rules (tasks 367, 441, 442).

## ENGINEERING SEAT AND task-441
The engineering seat reads a change once and judges it against the pasted rules. It can miss a rule and it never runs code. A task-441 test checks one rule mechanically every time. A confirmed seat finding that recurs is the candidate for such a test, by the section 14 prevention loop (00_engineering_standards.md:454). The seat's finding ids and `Rules met:` lines are the record to choose from. Nothing here builds that.

## UNVERIFIED
- The call counts use the compliance template's size.
- That mobile/ never gains database code.

## ESTIMATE (GUESS)
About 15 table lines plus about 60 test lines; two hours.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-22 (M-246, prior text kept; RR-0379 · task-431 · Backlog; operator, verbatim: "We can run step 1 in parellel - we will add to the rules overtime")

Dated note 2026-11-22 (M-246, prior text kept; RR-0380 · task-431 · Backlog; operator, verbatim: "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N")

Dated note 2026-11-22 (M-246, prior text kept; RR-0383 · task-431 · Backlog; operator, verbatim: "1. what is your recommendation. I approve it")

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "Task 431 - this now serves teh engineering seat with the right sections for the task - front-end vs backend"): re-scoped. The plan on this card (PLAN-431-v2) and its round 1 records are superseded; a new plan follows the engineering seat task. The A, B or C question of the plan grounder is closed by this ruling. The four surface specs are dropped by a separate card after task-430.
<!-- SECTION:NOTES:END -->
