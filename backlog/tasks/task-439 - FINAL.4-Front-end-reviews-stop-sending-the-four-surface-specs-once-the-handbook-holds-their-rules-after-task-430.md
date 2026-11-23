---
id: TASK-439
title: >-
  FINAL.4 Front-end reviews stop sending the four surface specs once the
  handbook holds their rules (after task-430)
status: LATER
assignee: []
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-23T02:55:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
type: build
ordinal: 139012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim (RR-0376): "Just send the handbook rules for the task"; (RR-0380) "once the handbook has been updated iwth the critical items"; (RR-0383) tasks that edit the surface specs keep them attached. THIS TASK: one table edit after task-430 lands: Specs 126, 127, 128 and 135 leave the front-end and phone rows; the specs-web-admin row keeps them. Measured by the task-431 plan grounder: a front-end review goes from about 558,000 to about 83,000 characters. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, docs/reports/generated/rule-lists-by-kind.md
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
PLAN-439-v1: front-end reviews send the handbook, not the four surface specs

Planner: Opus, read-only, board ~/Buildo-wt-board at 06e0e542c (task-430 folded, BUILT). Every figure below was computed in memory with the table's own functions (resolveTask, validateTable, renderPage, listBlocks) on a copy of the table. No file was written and nothing was run under the test runner.

## BASIS (the rulings, quoted from ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md)
- :1853, recorded in the RR-0378 entry (decision-163). The card attributes this quote to RR-0376, but RR-0376 is :1836. "Just send the handbook rules for the task except for infastructure rules (spec 08 and the Mclane) and then the relevant sections of the engineering protocols."
- RR-0378 step 3, as put to him (:1851): "Specs 126, 127, 128 and 135 are no longer sent whole." He approved it (:1852).
- RR-0380 Q1 (:1865-1866, decision-165): "Pushing 1 transition once the handbook has been updated iwth the critical items", ruled "the surface specs stop being sent once the handbook has been updated with the critical items".
- RR-0383 (:1895-1896, decision-168): "1. what is your recommendation. I approve it", ruled "the specs-web-admin row keep[s] Specs 126, 127, 128 and 135 attached".
- RR-0384 (:1901-1904, decision-169): task-430 adds "these 13 lines". RR-0379 (:1859): "we will add to the rules overtime".
- RR-0385 (:1916-1925): item 5 says no new gate work; item 6 says tests are the focus.
- RR-0392 (:1976): "no other infrastructure is needed beyond this".
- RR-0393 (:1983): order 430, 445, 439, 440.
- Earlier ruling this partly reverses: :1297-1298 (2026-11-20), "1,2,3 yes as recommended", meaning Specs 126, 127, 128 and the full 135 rows go into the path table. It is stated in Spec 08:229 and Spec 137:134.
- Search: `grep -n "surface spec|126, 127, 128|front-end task"` over the file and backlog/decisions. It finds only the entries above (decisions 161, 163, 165 and 168). There is no other ruling on which documents a front-end review gets.

## PRECONDITION (checked)
- task-430 is BUILT and folded (06e0e542c).
- Spec 136 section 2 now holds 57 lines. fe.45 to fe.57 are the 13 approved items, and fe.53 is the item-9 pointer (136:191).
- 21 lines are OWED (136:28): the 8 older ones (fe.04, 12, 17, 21, 25, 26, 39, 44) plus the 13 new ones. OWED means the rule line is in the handbook and is sent to the reviewer, but its test (lock) has not been written yet.
- RR-0380 makes the switch wait on the handbook text, not on the locks. The locks belong to task-434, which RR-0385 item 6 merges into task-367.
- Nothing in the record holds this card for anything beyond task-430 landing. RR-0379 says rules are added over time.

## THE TABLE EDIT (scripts/analysis/rule-lists.json, protected)
Two rows change, and only their `lists` and `why`:
- surfaces (:145)
  - before: ["surface-136","surface-126","surface-127","surface-128","surface-135","eng-all"]
  - after: ["surface-136","eng-all"]
- mobile (:151)
  - before: ["mobile-90","mobile-98","mobile-99","mobile-100","mobile-96","surface-136","surface-126","surface-127","surface-128","surface-135","eng-front","eng-shared"]
  - after: ["mobile-90","mobile-98","mobile-99","mobile-100","mobile-96","surface-136","eng-front","eng-shared"]

Three `why` texts gain one sentence each:
- surfaces and mobile: "task-439 (RR-0380 Q1, decision-165; RR-0378 step 3): the handbook holds the critical items (task-430), so Specs 126, 127, 128 and 135 are no longer attached here; Spec 136 section 2 is."
- specs-web-admin (:218): its why says "the same lists as the surfaces row", which would become untrue. It gains: "task-439 (RR-0383, decision-168): this row keeps all five surface lists, so an edit to a surface spec is reviewed with that spec."

Unchanged rows, on purpose:
- specs-web-admin, surface-importers (126, 128), surface-contract-routes (126, 128, 135, 136; ruled at :1520 and pinned by a drift test), panel-records (128, 126; Spec 128:182), generated-127 (127).
- These are back-end producers, records and the procedure's own reports, not front-end rows: task-431 Q-A ruled API routes and src/lib back end.

Each affected row now attaches:
- surfaces: Spec 136 section 2 (28,690) plus eng-all (46,613), which is 75,303 against 571,341 before.
- mobile: the five mobile specs (200,585) plus Spec 136 plus eng-front and eng-shared (40,686), which is 269,961 against 765,999 before.
- The four specs together are 496,038 characters: 126 is 256,412; 127 is 50,606; 128 is 77,169; 135 is 111,851.

`validate` on the edited copy returns []. It still has 58 lists and 23 rows.

## MEASURE (resolveTask, letter S; totals include the every_task, increment and milestone lists)
| Files line | before | after |
|---|---|---|
| web kind (page) | 15 lists, 722,506, 20 parts | 11 lists, 226,468, 11 parts |
| phone kind (page) | 16 lists, 803,569, 21 parts | 12 lists, 307,531, 12 parts |
| task-374 RUNNING | 608,911 | 112,873 |
| task-381 RUNNING | 803,569 | 307,531 |
| task-390 RUNNING | 809,496 | 313,458 |
| task-378 RUNNING | 1,310,093 | 864,661 |

- The card's "558,000 to 83,000" is replaced by these figures. Its likely gap is the growth of Spec 135 and Spec 136 in task-430 (UNVERIFIED).
- Of 308 open tasks, 105 resolve. 16 change their set; all lose the four specs, except 378 and 384, which keep surface-127 through generated-127:
  - RUNNING (10): 354, 373, 374, 378, 381, 384, 389, 390, 395, 411.
  - LATER (6): 345, 382, 391, 392, 393, 394.
- Tasks 267, 317 and 357 change list order only. The set is the same because they edit web-admin specs.

## RR-0383 SHOWN BY RESOLVE (after the edit)
- These all still carry 126, 127, 128, 135 and 136 through specs-web-admin:
  - docs/specs/02-web-admin/126_maxbld_surface_standard.md, and the 127, 128 and 135 files;
  - `mobile/src/app/x.tsx, docs/specs/02-web-admin/126_maxbld_surface_standard.md`.
- These carry surface-136 and none of the four:
  - src/components/report/ReportPage.tsx (eng-all, surface-136, five-words, plan-protocol, inc-S, ms-S);
  - mobile/src/app/x.tsx;
  - scripts/surfaces/x.mjs.

## CUT-OVER
- Running lanes. The close takes the table from the merge-base (check-lane-close.mjs:765, :842) and runs only on a commit that finishes a task (:748). So the 10 RUNNING lanes are judged by their base copy and owe nothing new.
  - A lane that merges the board before it closes resolves fewer lists. It then owes per-list outputs only for the lists left.
  - A joined `out-compliance-rules` set made from the old set would not match the new join. The orchestrator tells such a lane to keep its per-list outputs.
  - That extra per-list outputs are accepted: I found no refusal of them in the close-check code (grep), but did not run it (UNVERIFIED).
- Prepped tasks. The launch gate rebuilds each list from the board and compares it to the committed input (check-lane-close.mjs:413). None of the 16 tasks has a plan folder holding plan-compliance outputs, so none is refused for the table edit.
  - The only LATER task with plan evidence is task-445 (agents-s7-s11, queue-137 and others). My two notes change agents-s7-s11 and queue-137 text.
  - RR-0393 launches 445 before 439. If 439's work commit lands first, 445 owes a fresh plan review of those two lists before launch.
  - Likewise, if task-445 lands before 439 launches: 445's note goes in §5.7, which is in no list (task-445 plan), so 439's evidence is unaffected.
- No gate, lens or code change; lensSet is untouched.

## TESTS (rule-lists-table.logic.test.ts only; written first, red seen at the designed assertion in red.out; 08_agents.md:489 "Every lock is proven in BOTH directions ... Red must land at the DESIGNED assertion")
New describe "task-439". FOUR = surface-126, 127, 128 and 135. resolveIn is the task-412 temp-tree pattern (:226-235), a local copy.

- N1, the front-end rows send the handbook only.
  - Assertion: `src/components/report/ReportPage.tsx`, `scripts/surfaces/x.mjs` and `mobile/x.ts` each contain surface-136 and `not.toContain` each FOUR id. The table rows surfaces and mobile contain surface-136 and no FOUR id.
  - Red today at the first `not.toContain('surface-126')` (measured: all three resolve the four).
  - Planted defect: a temp table with FOUR put back on the surfaces row makes `scripts/surfaces/x.mjs` resolve FOUR, and on the mobile row `mobile/x.ts` does too. The assertion fails on each.
- N2, RR-0383 (SURVIVE-THE-FIX, labelled: green before and after).
  - Assertion: the four spec paths above and `mobile/x.ts, docs/specs/02-web-admin/128_surface_standard_policy.md` each contain FOUR plus surface-136. The specs-web-admin row equals exactly ["surface-136","surface-126","surface-127","surface-128","surface-135"].
  - Planted defect: specs-web-admin set to ["surface-136"] gives the 128 spec without surface-128, so N2 fails.

Changed in the same commit (red after the table edit if left):
- :165. The golden path resolves `['surface-136','eng-all','five-words','plan-protocol','inc-S','ms-S']` (measured). The new value is red today.
- :183. SURFACE becomes `['surface-136']`.
  - The it-title at :198 becomes "...resolves Spec 136 section 2 (task-439: Specs 126, 127, 128 and 135 no longer, RR-0380 Q1)". One comment line is added at :180.
  - :200 and :204 would go red without this change. :206-207 are unchanged (`without` is still eng-all and the every_task lists).
  - This loosens the old lock on purpose. The not-four lock moves to N1.

Unchanged, measured with the edit simulated:
- rule-lists-table.logic.test.ts:
  - :20-28 and :276-300 (engineering lists only);
  - :29-31 (panel-records not edited);
  - :32-38 (generated-127 not edited);
  - :101-120 (contract routes not edited);
  - :211-222 (surface-136 lens input).
- rule-lists.logic.test.ts:
  - :31-40 and backlog-lane.logic.test.ts:386-397 read the mobile row's lists from the table, and all of them still resolve;
  - :41-48 D2 (engineering only);
  - :56-62 (surface-importers keeps 126 and 128);
  - :65-73 (specs-web-admin and specs-mobile keep their lists);
  - :451-455 check-tasks (exit 0);
  - :459-470 page test (green after page --write).
- backlog-lane.logic.test.ts:398-420 and :560-575 (mobile-98, the engineering lists).
- check-lane-close.logic.test.ts: its fixture tables only (:21, :94).
- hooks-composition.infra.test.ts:335 (a command list).
- grep of src/tests for surface-12x, surface-135, surface-136, mobile-9x, mobile-100, "58 lists" and the page name found no other hit.

## SPEC NOTES (owed: engineering standards :465 "updates ALL cited specs ... in the SAME commit"; Spec 137 Rule 10 :125)
1. Spec 08, one new line directly after :353, indented three spaces:
   Dated note <date of the work commit> (M-246, prior text kept; task-439 FINAL.4, McFix Final; RR-0380 Q1, decision-165, and RR-0383, decision-168; operator, verbatim, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1853 "Just send the handbook rules for the task", :1865 "once the handbook has been updated iwth the critical items" and :1895 "1. what is your recommendation. I approve it"): the McFrontend handbook holds the critical items (task-430, RR-0384, decision-169), so the surfaces row and the mobile row of `scripts/analysis/rule-lists.json` no longer attach `surface-126`, `surface-127`, `surface-128` and `surface-135`; they attach `surface-136` (Spec 136 section 2) with their engineering lists, and the mobile row keeps the five mobile specs. The specs-web-admin row keeps all five surface lists, so a task that edits a spec under `docs/specs/02-web-admin/` is reviewed with that spec in front of the reviewer. The surface-importers, surface-contract-routes, panel-records and generated-127 rows are unchanged. The words "the surface specs 126, 127, 128 and the full Spec 135 rows go into the path table" in the task-366 note of section 5.3 above now hold for those rows only.
2. Spec 137, a blank line and one paragraph directly after :134:
   Dated note <date of the work commit> (M-246, prior text kept; task-439 FINAL.4, McFix Final; RR-0380 Q1, decision-165; operator, verbatim, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1865 "once the handbook has been updated iwth the critical items"): the surfaces and mobile rows of `scripts/analysis/rule-lists.json` no longer attach Specs 126, 127, 128 and 135 and send the handbook (Spec 136 section 2) instead; the other rows that attached them keep them, among them the specs-web-admin row for tasks that edit those specs (Spec 08 section 7 rule 4, the task-439 note).
- README: no line names the surface lists. README:141 is the separate fe-126 packs and is untouched.

## GENERATED FILE
- docs/reports/generated/rule-lists-by-kind.md changes in four places:
  - the web kind;
  - the phone kind;
  - the tooling and spec-only kinds, because the notes change agents-s7-s11 and queue-137.
- So the notes are written first and `node scripts/analysis/rule-lists.mjs page --write` runs last. .husky/pre-commit:44 runs `page --check`.

## COMMITS
1. Work commit: the table, the test file, both notes, the page and the task notes, with `Task: task-439`.
   - No Spec-diff trailer is needed: check-spec-diff.mjs triggers only on steps, compute or descriptor paths.
2. Close commit: the lane records and the status line only. rule-lists.json is a protected path (rule-lists.json:22; check-lane-close.mjs:751).

## ACCEPTANCE (read-only)
- `rule-lists.mjs validate` reports ok, 58 lists, 23 rows. `page --check` reports current.
- `resolve --type build --letter S`:
  - `--files src/components/report/ReportPage.tsx` gives eng-all, surface-136, five-words, plan-protocol, inc-S, ms-S;
  - `--files mobile/src/app/x.tsx` gives 12 lists, none of the four;
  - `--files docs/specs/02-web-admin/128_surface_standard_policy.md` includes all five surface lists;
  - `--files src/lib/parcels/lot-size-entry.ts` still includes surface-126 and surface-128.
- `check-tasks` exits 0.
- The page web kind reads 11 lists, 226,468; the phone kind reads 12 lists, 307,531 (at 06e0e542c; they move if Spec 136 changes first).
- N1, N2 and the two changed tests are green, and red.out holds N1 red and each planted defect red.

## NOT IN SCOPE
- No new gate, tool, lens, list or row.
- No change to lensSet or rule-lists.mjs.
- No change to the handbook text or its generator.
- The 21 OWED locks (task-367 / task-434).
- surface-136 on ui-app: not on this card; REPORT-429 is ungrounded and calls it "deliberate as a split, but leaky".
- Repointing surface-importers, contract-routes or panel-records (back-end and records rows, their own rulings).
- A mobile handbook.
- Renaming the page.

## OPERATOR
None. The rulings above settle every choice, and no earlier answer reads two ways. One fact is corrected for the record: the card's RR-0376 attribution for "Just send the handbook rules" belongs to the RR-0378 entry (:1853).

## UNVERIFIED
- That each test is red, then green (nothing was run).
- That the close accepts extra per-list outputs after a board merge (code read, not run).
- The cause of the card's 558,000 figure.

## ESTIMATE (GUESS)
Two table lines, three why sentences, about 40 test lines, two notes and a page regeneration: about 1.5 hours.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, docs/reports/generated/rule-lists-by-kind.md
<!-- SECTION:PLAN:END -->
