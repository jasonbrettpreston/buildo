---
id: TASK-439
title: >-
  FINAL.4 Front-end reviews stop sending the four surface specs once the
  handbook holds their rules (after task-430)
status: LATER
assignee: []
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-23T15:51:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-439/GROUNDER-PLAN.md
  - docs/reports/reviews/task-439/TRIAGE-PLAN.md
  - docs/reports/reviews/task-439/seat-integration-1.md
  - docs/reports/reviews/task-439/seat-reality-check-1.md
  - docs/reports/reviews/task-439/seat-regression-1.md
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

Planner and builder: Opus (RR-0385 items 1 and 8, MORNING-DECISIONS.md:1917, :1924). Domain: Backend/Pipeline tooling (engineering standards 10.2 does not bind). Board ~/Buildo-wt-board, read at 06e0e542c, figures re-measured at abaee3190. Every figure was computed in memory with the table's own functions (resolveTask, validateTable, renderPage, listBlocks, checkTasks); no file was written and no test was run. Every red and green below is a PREDICTION from those resolves; the lane records each test's first red in red.out before any green (08_agents.md:489).

## BASIS (the rulings, quoted from ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md)
- :1853, recorded in the RR-0378 entry (decision-163), not the RR-0376 entry the card cites (:1834-1843); the record does not say when in the day he said it. Its infrastructure exception is untouched. "Just send the handbook rules for the task except for infastructure rules (spec 08 and the Mclane) and then the relevant sections of the engineering protocols."
- RR-0378 step 3, as put to him (:1851): "Specs 126, 127, 128 and 135 are no longer sent whole." He approved it (:1852).
- RR-0380 Q1 (:1865-1866, decision-165): "Pushing 1 transition once the handbook has been updated iwth the critical items", ruled "the surface specs stop being sent once the handbook has been updated with the critical items".
- RR-0383 (:1895-1896, decision-168): "1. what is your recommendation. I approve it", ruled "the specs-web-admin row keep[s] Specs 126, 127, 128 and 135 attached".
- RR-0384 (:1901-1904, decision-169): task-430 adds "these 13 lines". RR-0379 (:1859): "we will add to the rules overtime".
- RR-0385 (:1921-1922): item 5 no new gate work, item 6 tests are the focus. RR-0392 (:1976): "no other infrastructure is needed beyond this".
- RR-0393 (:1982) rules only that McFixReborn follows the McFix Final tasks; the order 430, 445, 439, 440 is the orchestrator's reading (:1983), kept because it costs nothing.
- Earlier ruling this partly reverses: :1297-1298, "1,2,3 yes as recommended" (Specs 126, 127, 128 and the full 135 rows into the path table; Spec 08:229, Spec 137:134).
- Search: `grep -n "surface spec|126, 127, 128|front-end task"` over the file and backlog/decisions finds only the entries above (decisions 161, 163, 165, 168): no other ruling on which documents a front-end review gets. RR-0376 item 1 (:1836) is not in the way: :1840 says it replaces the Spec 137 and Spec 08 part of step 2 of RR-0374 (the task-427 re-scope). The notes below are additive, owed by 00_engineering_standards.md:465 and Spec 137 rule 10 (:125); task-438 and task-431 put the same kind of note in 08_agents.md (:352-353), in the push he approved (RR-0392, :1975).

## PRECONDITION (checked; ruled by the plan grounder)
- The condition is RR-0380 Q1 (:1865-1866): "once the handbook has been updated iwth the critical items". He named them: "these 13 lines" (RR-0384, :1901, decision-169; item 9 a pointer). They are in Spec 136 section 2: fe.45 to fe.57 (136:166-202), fe.53 the pointer (136:190). task-430 is BUILT and folded (06e0e542c), not pushed. Met in the record.
- 136:28: "57 in force (21 OWED, whose lock is still to land)": the 8 older lines (fe.04, 12, 17, 21, 25, 26, 39, 44) plus the 13. OWED lines are sent; their locks are task-367 (RR-0385 item 6). His condition names the handbook update, not the locks (a reading).
- ORDER. The work commit waits for neither task-430's push nor the renumber of FE-45..FE-57 against task-388: N1 and N2 pin no fe id or size, and :211-222 computes its range from the register. Only this card's push follows task-430's, as the branch carries it (his own y, RR-0385 item 4). A later renumber re-runs `page --write` (card 430, landing checklist).
- NO LONGER RECEIVED: the text of Specs 126, 127, 128 and 135 (496,038 characters); the reviewer gets the rule lines of Spec 136 section 2. A rule in those specs with no handbook line reaches no front-end review until one is added (RR-0379, :1859). Known (REPORT-429, ungrounded): about 15 lower-rank rules (R-16, R-22, R-23, ASK-10, ASK-19, others) and the per-page rows of Spec 126 section 11b.3 and 11b.7 (fe.53 is a pointer). On three open tasks, 374 and 395 lose nothing and 390 loses R-22. Both notes say it in one sentence.

## THE TABLE EDIT (scripts/analysis/rule-lists.json, protected)
Three rows change, only their `lists` and `why` (specs-web-admin: `why` only):
- surfaces (:145)
  - after: ["surface-136","eng-all"]
- mobile (:151)
  - after: ["mobile-90","mobile-98","mobile-99","mobile-100","mobile-96","surface-136","eng-front","eng-shared"]

The `why` edits (full final texts: QUESTIONS-RULED.md Q-D). The old clause naming the four specs becomes history, so the text a lane brief prints stays true.
- surfaces (:146): replace ", the contract Spec 126," with "; until task-439 they were also governed by the contract Spec 126,"; append T439.
- mobile (:152): replace ", plus the surface contract and register" with "; until task-439 it was also governed by the surface contract and register"; append T439.
- specs-web-admin (:219): replace "(the same lists as the surfaces row)" with "(at that time the same lists as the surfaces row). task-439 (RR-0383, decision-168): this row keeps all five surface lists after the surfaces and mobile rows drop the four specs, so an edit to a surface spec is reviewed with that spec".
- T439 = ". task-439 (RR-0380 Q1, decision-165; RR-0378 step 3, decision-163): the handbook holds the critical items (task-430), so Specs 126, 127, 128 and 135 are no longer attached to this row; Spec 136 section 2 is. A task that edits one of those specs gets them through the specs-web-admin row (RR-0383, decision-168)", after the last existing sentence. No test pins a `why` text.

Unchanged rows: specs-web-admin (RR-0383), surface-importers (126, 128), surface-contract-routes (126, 128, 135, 136; "1-5 y" :1522; drift test), panel-records (128, 126; Spec 128:182; test :29-31), generated-127 (127; test :32-38): importer, route, record and report rows that the card and RR-0378 step 3 do not move; no ruling moves them (the task-431 Q-A is about engineering sections). The surfaces row keeps eng-all (task-431 Q-A, docs/reports/reviews/task-431/QUESTIONS-RULED.md:6, pinned by K1): dropping the full engineering is task-431's.

`validate` on the edited copy returns []. It still has 58 lists and 23 rows.

## MEASURE (resolveTask, letter S; totals include the every_task, increment and milestone lists)
| Files line | before | after |
|---|---|---|
| web kind (page) | 15 lists, 722,506, 20 parts | 11 lists, 226,468, 11 parts |
| phone kind (page) | 16 lists, 803,569, 21 parts | 12 lists, 307,531, 12 parts |
| task-374 RUNNING | 608,911 | 112,873 |
| task-378 RUNNING | 1,310,093 | 864,661 |

- The card's "558,000 to 83,000" (said measured by the task-431 plan grounder; no record found) is not an acceptance bar; the table above is. At 62b2ffed6, before task-430, the ReportPage Files line measured 566,368 before and 97,966 after: neither figure reproduces. Cause: UNVERIFIED.
- Of 308 open tasks, 106 resolve (105 before this card's own Files line; same after the edit). 16 change their set; all lose the four specs, except 378 and 384, which keep surface-127 through generated-127:
  - RUNNING (10): 354, 373, 374, 378, 381, 384, 389, 390, 395, 411.
  - LATER (6): 345, 382, 391, 392, 393, 394.
- Tasks 267, 317 and 357 change list order only. The set is the same because they edit web-admin specs.

## CUT-OVER
- Running lanes (10 RUNNING: 354, 373, 374, 378, 381, 384, 389, 390, 395, 411). The close takes the table from the merge-base (check-lane-close.mjs:766) and only on a commit that finishes a task (:748): a lane that does not merge the board owes what it was launched with; one that merges owes a compliance output per list left (:456 proves only the resolved lists). Outputs for the dropped lists are not refused (read, not run: :565). A joined `out-compliance-rules` set from the old list set is refused (the join is recomputed, :452-453), as is a stage holding both forms (:441): such a lane re-makes the joined output or keeps one form. This card is judged by its own branch table (:840-842), the same ten lists.
- Prepped tasks. The launch gate compares each rebuilt list, whitespace squashed, with the committed plan input (:413). Of the 16 changed tasks, 13 have no review folder and 354, 378, 384 hold one context file and no plan output (checked); only task-445 has committed plan evidence.
- ORDER AGAINST task-445 (ruled). The 08 note grows agents-s7-s11 and the 137 note grows queue-137, two of the nine lists of 445's evidence (72d721e94; equal to the lists today); 445's own note goes in section 5.7, which no list selects. RULING: 445 launches (gate passed) before this card's work commit reaches the board head; this card may launch and be built meanwhile. The second lander, this card, owes: the 08 note placed by text, not line (445's note moves lines after :261 down by two), `page --check` and `page --write` on the merged head, the ACCEPTANCE figures re-derived. If this card must land first, 445 owes before launch: both inputs regenerated with `lens-input --material-from context-r1.md`, the two DeepSeek compliance reviews re-run (the prompt hash binds the old input), a grounder verdict for any new finding, FINDINGS-PLAN, GROUNDER-PLAN and FOLD-CHECK refreshed, a plan-prep recommit: two model calls and a grounder pass against none. Others naming a file of this card (384, 403, 404, 413, 420, 440): no unmerged lane changes it (checked).
- No gate, lens or code change.

## TESTS (rule-lists-table.logic.test.ts only; the lane writes them first and records each first red in red.out before any green; 08_agents.md:489 "Every lock is proven in BOTH directions ... Red must land at the DESIGNED assertion")
N1 and N2 are two `it` blocks at the end of the task-431 describe (:258-), which has `withRow(id, edit)` and `resolveIn(rows, files)` (the task-412 temp-tree pattern, :267-276): no fourth copy. FOUR = surface-126, 127, 128, 135. MOBILE = mobile-90, 98, 99, 100, 96, surface-136, eng-front, eng-shared.
- N1, the front-end rows send the handbook only. `src/components/report/ReportPage.tsx`, `scripts/surfaces/x.mjs` and `mobile/x.ts` each contain surface-136 and `not.toContain` each FOUR id; the rows surfaces and mobile hold surface-136 and no FOUR id; `lists('mobile/x.ts')` is `arrayContaining(MOBILE)` (guards the hand edit of the 12-element array; green today, survive-the-fix). Predicted red today at the first `not.toContain('surface-126')`. Planted defects, shown in the same test with `resolveIn(withRow(...), file)`: FOUR back on the surfaces row makes `scripts/surfaces/x.mjs` resolve FOUR; on the mobile row, `mobile/x.ts`; `mobile-99` dropped from the mobile row makes `mobile/x.ts` fail `arrayContaining(MOBILE)`.
- N2, RR-0383 (SURVIVE-THE-FIX: green before and after). The four spec files 126, 127, 128 and 135 in docs/specs/02-web-admin, and `mobile/x.ts, docs/specs/02-web-admin/128_surface_standard_policy.md`, each contain FOUR plus surface-136; the specs-web-admin row is `arrayContaining` those five (not an exact array). Planted defect: specs-web-admin set to ["surface-136"] gives the 128 spec without surface-128.
Changed in the same commit (red after the table edit if left): :165, the golden path, becomes `['surface-136','eng-all','five-words','plan-protocol','inc-S','ms-S']` (red today); :183 SURFACE becomes `['surface-136']`, the it-title at :198 reads "...resolves Spec 136 section 2 (task-439: Specs 126, 127, 128 and 135 no longer, RR-0380 Q1)", and the comment at :179-180 is edited in place ("attaches Spec 136 section 2, 126, 127, 128 and 135" becomes "attaches Spec 136 section 2 (task-439: no longer 126, 127, 128 and 135)"); :200 and :204 go red otherwise, :206-207 are unchanged. This loosens the old lock on purpose; the not-four lock moves to N1.
Unchanged (re-simulated): all other assertions on the four ids, the mobile lists and the page (listed in QUESTIONS-RULED.md Q-B).

## SPEC NOTES (owed: engineering standards :465 "updates ALL cited specs ... in the SAME commit"; Spec 137 Rule 10 :125)
Both notes carry the calendar date of the work commit, written once; they name no fe id or rule-line count and are inserted by their text, never by line number.
1. Spec 08, one line directly after the task-431 dated note (last line of section 7 rule 4, :353 today; the next begins "5. **Panel sizing scales to stakes.**"), indented three spaces:
   Dated note <date of the work commit> (M-246, prior text kept; task-439 FINAL.4, McFix Final; RR-0380 Q1, decision-165, and RR-0383, decision-168; operator, verbatim, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1853 "Just send the handbook rules for the task except for infastructure rules (spec 08 and the Mclane) and then the relevant sections of the engineering protocols.", :1865 "once the handbook has been updated iwth the critical items" and :1895 "1. what is your recommendation. I approve it"): the McFrontend handbook (Spec 136 section 2) now holds the 13 lines he approved for task-430 (RR-0384, decision-169), so the surfaces and mobile rows of `scripts/analysis/rule-lists.json` no longer attach `surface-126`, `surface-127`, `surface-128` and `surface-135`; they attach `surface-136` with their engineering lists, and the mobile row keeps its five mobile lists. A front-end review therefore no longer receives the text of those four specs and receives the handbook rule lines instead; a rule of those specs with no handbook line yet reaches no front-end review until a line is added (RR-0379, :1859: "we will add to the rules overtime"). The specs-web-admin row keeps all five surface lists, so a task that edits a spec under `docs/specs/02-web-admin/` is reviewed with that spec. Every other row is unchanged. The words "the surface specs 126, 127, 128 and the full Spec 135 rows go into the path table" in the task-366 note of section 5.3 above now hold for those rows only.
2. Spec 137, a blank line and one paragraph directly after the task-366 note of Rule 12 (:134 today; :135 stays the separator):
   Dated note <date of the work commit> (M-246, prior text kept; task-439 FINAL.4, McFix Final; RR-0380 Q1, decision-165; operator, verbatim, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1865 "once the handbook has been updated iwth the critical items"): the surfaces and mobile rows of `scripts/analysis/rule-lists.json` no longer attach Specs 126, 127, 128 and 135 and send the handbook (Spec 136 section 2) instead; the specs-web-admin row and the importer, census-route, panel-record and generated-127 rows keep them (the Spec 08 section 7 rule 4 note of task-439 has the whole account). The words "the surface specs 126, 127, 128 and the full Spec 135 rows go into the path table" in the task-366 note above (Rule 12) now hold for those rows only.
- README: no line names the surface lists (README:141, the fe-126 packs, is untouched).

## GENERATED FILE
- docs/reports/generated/rule-lists-by-kind.md changes in four kinds (web, phone, tooling, spec-only; the notes grow agents-s7-s11 by about 1500 characters and queue-137 by about 800); `page --write` covers all of them (rendered in memory with stand-in note text).
- So the notes are written first and `node scripts/analysis/rule-lists.mjs page --write` runs last. .husky/pre-commit:44 runs `page --check`.

## COMMITS
1. Work commit: the table, the test file, both notes, the generated page and the task file (same diff: check-backlog-task.mjs). Subject `feat(08_agents): task-439 FINAL.4 front-end reviews send the handbook, not the four surface specs`. Trailers: `Task: task-439` and the Co-Authored-By line the session is given. No Spec-diff trailer (check-spec-diff.mjs:37-41 fires only on scripts/steps/, scripts/lib/compute/ and descriptor paths), no Lesson-routing (no body line starts with CRITICAL or HIGH), no Operator-Ruling (no ledger row added).
2. Record commits of the output review may sit between. Close commit: the status line and the lane report only (docs/reports/lanes/<date>/BL-SURF439/: REPORT.md, one compliance output per resolved list, GROUNDER.md, TRIAGE.md, review outputs); rule-lists.json is protected (:22), so the close stages no protected path (check-lane-close.mjs:753).

## ACCEPTANCE (read-only)
- `rule-lists.mjs validate` reports ok, 58 lists, 23 rows. `page --check` reports current.
- `resolve --type build --letter S`:
  - `--files src/components/report/ReportPage.tsx` gives eng-all, surface-136, five-words, plan-protocol, inc-S, ms-S;
  - `--files mobile/src/app/x.tsx` gives 12 lists, none of the four;
  - `--files docs/specs/02-web-admin/128_surface_standard_policy.md` includes all five surface lists;
  - `--files src/lib/parcels/lot-size-entry.ts` still includes surface-126 and surface-128.
- `check-tasks` exits 0 and reads 308 open, 106 resolve, none FAILED.
- Page figures at abaee3190: web kind 11 lists, 226,468; phone kind 12 lists, 307,531. Not pins: they move a few characters if Spec 136 changes first (the renumber).
- N1, N2 and the two changed tests: red.out holds N1's first red at its designed assertion and each planted defect red; then the lane's own run is green.

## NOT IN SCOPE
- No new gate, tool, lens, list or row.
- No change to lensSet or rule-lists.mjs.
- No change to the handbook text or its generator.
- The 21 OWED locks (task-367 / task-434).
- surface-136 on ui-app: not on this card; REPORT-429 is ungrounded and calls it "deliberate as a split, but leaky".
- Repointing surface-importers, contract-routes, panel-records or generated-127 (no ruling moves them).
- The drop of the full engineering for the surfaces row (task-431 kept eng-all there).
- A mobile handbook.
- Renaming the page.

## OPERATOR
None. RR-0380 Q1 and RR-0384 settle the precondition (his condition is the 13 lines he approved, and they are in) and RR-0383 the web-admin row; no earlier answer of his reads two ways or rests on a wrong fact here. What reviewers no longer receive is told to him in plain words in the report. The card cites RR-0376 for "Just send the handbook rules"; it is in the RR-0378 entry (:1853).

## UNVERIFIED
- That each test is red, then green (nothing was run; the resolves behind each prediction were executed).
- That the close accepts extra per-list outputs after a board merge (code read, not run).
- The cause of the card's 558,000 and 83,000 figures.

## ESTIMATE (GUESS)
Two table lines, three why sentences, about 40 test lines, two notes and a page regeneration: about 1.5 hours.

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, docs/reports/generated/rule-lists-by-kind.md

Plan review round 1: 59 folded, 0 task, 0 ruling, 0 wontfix, 5 pile; grounder docs/reports/reviews/task-439/GROUNDER-PLAN.md; triage docs/reports/reviews/task-439/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 MED folded such a lane re-makes
plan-compliance-agents-s5-1to3#3 MED folded RR-0376 item 1 (:183
plan-compliance-agents-s5-1to3#5 MED folded a PREDICTION from th
plan-compliance-agents-s7-s11#1 MED folded a PREDICTION from th
plan-compliance-agents-s7-s11#2 MED folded such a lane re-makes
plan-compliance-five-words#1 MED folded RR-0376 item 1 (:183
plan-compliance-five-words#4 MED folded a PREDICTION from th
plan-compliance-five-words#5 MED folded is not an acceptance
plan-compliance-inc-S#1 MED folded RR-0376 item 1 (:183
plan-compliance-ms-S#1 MED folded is not an acceptance
plan-compliance-orchestrator-doc17#1 MED folded RR-0376 item 1 (:183
plan-compliance-orchestrator-doc17#2 MED folded The surfaces row kee
plan-compliance-plan-protocol#1 MED folded is not an acceptance
plan-compliance-plan-protocol#3 MED folded OWED lines are sent;
plan-compliance-policy-124-s2-s5#2 MED folded RULING: 445 launches
plan-compliance-policy-124-s2-s5#3 MED folded :456 proves only the
plan-compliance-queue-137#3 MED folded RR-0376 item 1 (:183
plan-compliance-queue-137#4 MED folded no ruling moves them
plan-compliance-queue-137#5 MED folded now hold for those r
plan-engineering-eng-all#2 MED folded a PREDICTION from th
plan-error-paths#1 MED folded :456 proves only the
plan-error-paths#3 MED folded If this card must la
plan-plan-review-deepseek#2 MED folded is not an acceptance
plan-plan-review-deepseek#5 MED folded RULING: 445 launches
rc#1 MED folded the reviewer gets th
ig#1 MED folded If this card must la
rg#1 MED folded (guards the hand edi
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-23 (orchestrator, at launch, a note not a plan edit): task-446 is folded on the board at 2fe7fa150, so the handbook now holds one more line than the plan counted (fe.58 for R-22): where the plan's figures read 57 handbook rules or 21 OWED rows, the tree reads 58 and 22. The lane measures at its own head and reports the figure it finds; if a planned test pins the old figure, stop and report.
<!-- SECTION:NOTES:END -->
