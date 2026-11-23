# Review context for task-439 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 2)

## Task
task-439 FINAL.4 Front-end reviews stop sending the four surface specs once the handbook holds their rules (after task-430)
status: RUNNING · milestone: m-1 · assignee: @lane-BL-SURF439 · labels: McFix, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim (RR-0376): "Just send the handbook rules for the task"; (RR-0380) "once the handbook has been updated iwth the critical items"; (RR-0383) tasks that edit the surface specs keep them attached. THIS TASK: one table edit after task-430 lands: Specs 126, 127, 128 and 135 leave the front-end and phone rows; the specs-web-admin row keeps them. Measured by the task-431 plan grounder: a front-end review goes from about 558,000 to about 83,000 characters. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: scripts/analysis/rule-lists.json, src/tests/backlog/rule-lists-table.logic.test.ts, docs/specs/00-architecture/08_agents.md, docs/specs/00-architecture/137_mcqueue.md, docs/reports/generated/rule-lists-by-kind.md

## Acceptance criteria

## Implementation Plan
PLAN-439-v1: front-end reviews send the handbook, not the four surface specs

Planner and builder: Opus (RR-0385 items 1 and 8, MORNING-DECISIONS.md:1917, :1924). Domain: Backend/Pipeline tooling (engineering standards 10.2 does not bind). Board ~/Buildo-wt-board, read at 06e0e542c, figures re-measured at abaee3190. Every figure was computed in memory with the table's own functions (resolveTask, validateTable, renderPage, listBlocks, checkTasks); no file was written and no test was run. Every red and green below is a PREDICTION from those resolves; the lane records each test's first red in red.out before any green (08_agents.md:489).

#### BASIS (the rulings, quoted from ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md)
- :1853, recorded in the RR-0378 entry (decision-163), not the RR-0376 entry the card cites (:1834-1843); the record does not say when in the day he said it. Its infrastructure exception is untouched. "Just send the handbook rules for the task except for infastructure rules (spec 08 and the Mclane) and then the relevant sections of the engineering protocols."
- RR-0378 step 3, as put to him (:1851): "Specs 126, 127, 128 and 135 are no longer sent whole." He approved it (:1852).
- RR-0380 Q1 (:1865-1866, decision-165): "Pushing 1 transition once the handbook has been updated iwth the critical items", ruled "the surface specs stop being sent once the handbook has been updated with the critical items".
- RR-0383 (:1895-1896, decision-168): "1. what is your recommendation. I approve it", ruled "the specs-web-admin row keep[s] Specs 126, 127, 128 and 135 attached".
- RR-0384 (:1901-1904, decision-169): task-430 adds "these 13 lines". RR-0379 (:1859): "we will add to the rules overtime".
- RR-0385 (:1921-1922): item 5 no new gate work, item 6 tests are the focus. RR-0392 (:1976): "no other infrastructure is needed beyond this".
- RR-0393 (:1982) rules only that McFixReborn follows the McFix Final tasks; the order 430, 445, 439, 440 is the orchestrator's reading (:1983), kept because it costs nothing.
- Earlier ruling this partly reverses: :1297-1298, "1,2,3 yes as recommended" (Specs 126, 127, 128 and the full 135 rows into the path table; Spec 08:229, Spec 137:134).
- Search: `grep -n "surface spec|126, 127, 128|front-end task"` over the file and backlog/decisions finds only the entries above (decisions 161, 163, 165, 168): no other ruling on which documents a front-end review gets. RR-0376 item 1 (:1836) is not in the way: :1840 says it replaces the Spec 137 and Spec 08 part of step 2 of RR-0374 (the task-427 re-scope). The notes below are additive, owed by 00_engineering_standards.md:465 and Spec 137 rule 10 (:125); task-438 and task-431 put the same kind of note in 08_agents.md (:352-353), in the push he approved (RR-0392, :1975).

#### PRECONDITION (checked; ruled by the plan grounder)
- The condition is RR-0380 Q1 (:1865-1866): "once the handbook has been updated iwth the critical items". He named them: "these 13 lines" (RR-0384, :1901, decision-169; item 9 a pointer). They are in Spec 136 section 2: fe.45 to fe.57 (136:166-202), fe.53 the pointer (136:190). task-430 is BUILT and folded (06e0e542c), not pushed. Met in the record.
- 136:28 at 06e0e542c: "57 in force (21 OWED, whose lock is still to land)" (58 and 22 since task-446 added fe.58 for R-22, 2fe7fa150): the 8 older lines (fe.04, 12, 17, 21, 25, 26, 39, 44) plus the 13. OWED lines are sent; their locks are task-367 (RR-0385 item 6). His condition names the handbook update, not the locks (a reading).
- ORDER. The work commit waits for neither task-430's push nor the renumber of FE-45..FE-57 against task-388: N1 and N2 pin no fe id or size, and :211-222 computes its range from the register. Only this card's push follows task-430's, as the branch carries it (his own y, RR-0385 item 4). A later renumber re-runs `page --write` (card 430, landing checklist).
- NO LONGER RECEIVED: the text of Specs 126, 127, 128 and 135 (496,038 characters); the reviewer gets the rule lines of Spec 136 section 2. A rule in those specs with no handbook line reaches no front-end review until one is added (RR-0379, :1859). Known (REPORT-429, ungrounded): about 15 lower-rank rules (R-16, R-22, R-23, ASK-10, ASK-19, others; R-22 got fe.58 in task-446, 2fe7fa150) and the per-page rows of Spec 126 section 11b.3 and 11b.7 (fe.53 is a pointer). On three open tasks, 374 and 395 lose nothing and 390 lost R-22 until task-446 gave it fe.58 (2fe7fa150), so it now loses nothing. Both notes say it in one sentence.

#### THE TABLE EDIT (scripts/analysis/rule-lists.json, protected)
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

#### MEASURE (resolveTask, letter S; totals include the every_task, increment and milestone lists)
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

#### CUT-OVER
- Running lanes (10 RUNNING: 354, 373, 374, 378, 381, 384, 389, 390, 395, 411). The close takes the table from the merge-base (check-lane-close.mjs:766) and only on a commit that finishes a task (:748): a lane that does not merge the board owes what it was launched with; one that merges owes a compliance output per list left (:456 proves only the resolved lists). Outputs for the dropped lists are not refused (read, not run: :565). A joined `out-compliance-rules` set from the old list set is refused (the join is recomputed, :452-453), as is a stage holding both forms (:441): such a lane re-makes the joined output or keeps one form. This card is judged by its own branch table (:840-842), the same ten lists.
- Prepped tasks. The launch gate compares each rebuilt list, whitespace squashed, with the committed plan input (:413). Of the 16 changed tasks, 13 have no review folder and 354, 378, 384 hold one context file and no plan output (checked); only task-445 has committed plan evidence.
- ORDER AGAINST task-445 (ruled). The 08 note grows agents-s7-s11 and the 137 note grows queue-137, two of the nine lists of 445's evidence (72d721e94; equal to the lists today); 445's own note goes in section 5.7, which no list selects. RULING: 445 launches (gate passed) before this card's work commit reaches the board head; this card may launch and be built meanwhile. The second lander, this card, owes: the 08 note placed by text, not line (445's note moves lines after :261 down by two), `page --check` and `page --write` on the merged head, the ACCEPTANCE figures re-derived. If this card must land first, 445 owes before launch: both inputs regenerated with `lens-input --material-from context-r1.md`, the two DeepSeek compliance reviews re-run (the prompt hash binds the old input), a grounder verdict for any new finding, FINDINGS-PLAN, GROUNDER-PLAN and FOLD-CHECK refreshed, a plan-prep recommit: two model calls and a grounder pass against none. Others naming a file of this card (384, 403, 404, 413, 420, 440): no unmerged lane changes it (checked).
- No gate, lens or code change.

#### TESTS (rule-lists-table.logic.test.ts only; the lane writes them first and records each first red in red.out before any green; 08_agents.md:489 "Every lock is proven in BOTH directions ... Red must land at the DESIGNED assertion")
N1 and N2 are two `it` blocks at the end of the task-431 describe (:258-), which has `withRow(id, edit)` and `resolveIn(rows, files)` (the task-412 temp-tree pattern, :267-276): no fourth copy. FOUR = surface-126, 127, 128, 135. MOBILE = mobile-90, 98, 99, 100, 96, surface-136, eng-front, eng-shared.
- N1, the front-end rows send the handbook only. `src/components/report/ReportPage.tsx`, `scripts/surfaces/x.mjs` and `mobile/x.ts` each contain surface-136 and `not.toContain` each FOUR id; the rows surfaces and mobile hold surface-136 and no FOUR id; `lists('mobile/x.ts')` is `arrayContaining(MOBILE)` (guards the hand edit of the 12-element array; green today, survive-the-fix). Predicted red today at the first `not.toContain('surface-126')`. Planted defects, shown in the same test with `resolveIn(withRow(...), file)`: FOUR back on the surfaces row makes `scripts/surfaces/x.mjs` resolve FOUR; on the mobile row, `mobile/x.ts`; `mobile-99` dropped from the mobile row makes `mobile/x.ts` fail `arrayContaining(MOBILE)`.
- N2, RR-0383 (SURVIVE-THE-FIX: green before and after). The four spec files 126, 127, 128 and 135 in docs/specs/02-web-admin, and `mobile/x.ts, docs/specs/02-web-admin/128_surface_standard_policy.md`, each contain FOUR plus surface-136; the specs-web-admin row is `arrayContaining` those five (not an exact array). Planted defect: specs-web-admin set to ["surface-136"] gives the 128 spec without surface-128.
Changed in the same commit (red after the table edit if left): :165, the golden path, becomes `['surface-136','eng-all','five-words','plan-protocol','inc-S','ms-S']` (red today); :183 SURFACE becomes `['surface-136']`, the it-title at :198 reads "...resolves Spec 136 section 2 (task-439: Specs 126, 127, 128 and 135 no longer, RR-0380 Q1)", and the comment at :179-180 is edited in place ("attaches Spec 136 section 2, 126, 127, 128 and 135" becomes "attaches Spec 136 section 2 (task-439: no longer 126, 127, 128 and 135)"); :200 and :204 go red otherwise, :206-207 are unchanged. This loosens the old lock on purpose; the not-four lock moves to N1.
Unchanged (re-simulated): all other assertions on the four ids, the mobile lists and the page (listed in QUESTIONS-RULED.md Q-B).

#### SPEC NOTES (owed: engineering standards :465 "updates ALL cited specs ... in the SAME commit"; Spec 137 Rule 10 :125)
Both notes carry the calendar date of the work commit, written once; they name no fe id or rule-line count and are inserted by their text, never by line number.
1. Spec 08, one line directly after the task-431 dated note (last line of section 7 rule 4, :353 today; the next begins "5. **Panel sizing scales to stakes.**"), indented three spaces:
   Dated note <date of the work commit> (M-246, prior text kept; task-439 FINAL.4, McFix Final; RR-0380 Q1, decision-165, and RR-0383, decision-168; operator, verbatim, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1853 "Just send the handbook rules for the task except for infastructure rules (spec 08 and the Mclane) and then the relevant sections of the engineering protocols.", :1865 "once the handbook has been updated iwth the critical items" and :1895 "1. what is your recommendation. I approve it"): the McFrontend handbook (Spec 136 section 2) now holds the 13 lines he approved for task-430 (RR-0384, decision-169), so the surfaces and mobile rows of `scripts/analysis/rule-lists.json` no longer attach `surface-126`, `surface-127`, `surface-128` and `surface-135`; they attach `surface-136` with their engineering lists, and the mobile row keeps its five mobile lists. A front-end review therefore no longer receives the text of those four specs and receives the handbook rule lines instead; a rule of those specs with no handbook line yet reaches no front-end review until a line is added (RR-0379, :1859: "we will add to the rules overtime"). The specs-web-admin row keeps all five surface lists, so a task that edits a spec under `docs/specs/02-web-admin/` is reviewed with that spec. Every other row is unchanged. The words "the surface specs 126, 127, 128 and the full Spec 135 rows go into the path table" in the task-366 note of section 5.3 above now hold for those rows only.
2. Spec 137, a blank line and one paragraph directly after the task-366 note of Rule 12 (:134 today; :135 stays the separator):
   Dated note <date of the work commit> (M-246, prior text kept; task-439 FINAL.4, McFix Final; RR-0380 Q1, decision-165; operator, verbatim, `~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md`, :1865 "once the handbook has been updated iwth the critical items"): the surfaces and mobile rows of `scripts/analysis/rule-lists.json` no longer attach Specs 126, 127, 128 and 135 and send the handbook (Spec 136 section 2) instead; the specs-web-admin row and the importer, census-route, panel-record and generated-127 rows keep them (the Spec 08 section 7 rule 4 note of task-439 has the whole account). The words "the surface specs 126, 127, 128 and the full Spec 135 rows go into the path table" in the task-366 note above (Rule 12) now hold for those rows only.
- README: no line names the surface lists (README:141, the fe-126 packs, is untouched).

#### GENERATED FILE
- docs/reports/generated/rule-lists-by-kind.md changes in four kinds (web, phone, tooling, spec-only; the notes grow agents-s7-s11 by about 1500 characters and queue-137 by about 800); `page --write` covers all of them (rendered in memory with stand-in note text).
- So the notes are written first and `node scripts/analysis/rule-lists.mjs page --write` runs last. .husky/pre-commit:44 runs `page --check`.

#### COMMITS
1. Work commit: the table, the test file, both notes, the generated page and the task file (same diff: check-backlog-task.mjs). Subject `feat(08_agents): task-439 FINAL.4 front-end reviews send the handbook, not the four surface specs`. Trailers: `Task: task-439` and the Co-Authored-By line the session is given. No Spec-diff trailer (check-spec-diff.mjs:37-41 fires only on scripts/steps/, scripts/lib/compute/ and descriptor paths), no Lesson-routing (no body line starts with CRITICAL or HIGH), no Operator-Ruling (no ledger row added).
2. Record commits of the output review may sit between. Close commit: the status line and the lane report only (docs/reports/lanes/<date>/BL-SURF439/: REPORT.md, one compliance output per resolved list, GROUNDER.md, TRIAGE.md, review outputs); rule-lists.json is protected (:22), so the close stages no protected path (check-lane-close.mjs:753).

#### ACCEPTANCE (read-only)
- `rule-lists.mjs validate` reports ok, 58 lists, 23 rows. `page --check` reports current.
- `resolve --type build --letter S`:
  - `--files src/components/report/ReportPage.tsx` gives eng-all, surface-136, five-words, plan-protocol, inc-S, ms-S;
  - `--files mobile/src/app/x.tsx` gives 12 lists, none of the four;
  - `--files docs/specs/02-web-admin/128_surface_standard_policy.md` includes all five surface lists;
  - `--files src/lib/parcels/lot-size-entry.ts` still includes surface-126 and surface-128.
- `check-tasks` exits 0 and none FAILED (at abaee3190 it read 308 open, 106 resolve; the counts move with the board and the lane reports what it reads).
- Page figures at abaee3190: web kind 11 lists, 226,468; phone kind 12 lists, 307,531. Not pins: they move a few characters if Spec 136 changes first (the renumber).
- N1, N2 and the two changed tests: red.out holds N1's first red at its designed assertion and each planted defect red; then the lane's own run is green.

#### NOT IN SCOPE
- No new gate, tool, lens, list or row.
- No change to lensSet or rule-lists.mjs.
- No change to the handbook text or its generator.
- The 21 OWED locks (task-367 / task-434).
- surface-136 on ui-app: not on this card; REPORT-429 is ungrounded and calls it "deliberate as a split, but leaky".
- Repointing surface-importers, contract-routes, panel-records or generated-127 (no ruling moves them).
- The drop of the full engineering for the surfaces row (task-431 kept eng-all there).
- A mobile handbook.
- Renaming the page.

#### OPERATOR
None. RR-0380 Q1 and RR-0384 settle the precondition (his condition is the 13 lines he approved, and they are in) and RR-0383 the web-admin row; no earlier answer of his reads two ways or rests on a wrong fact here. What reviewers no longer receive is told to him in plain words in the report. The card cites RR-0376 for "Just send the handbook rules"; it is in the RR-0378 entry (:1853).

#### UNVERIFIED
- That each test is red, then green (nothing was run; the resolves behind each prediction were executed).
- That the close accepts extra per-list outputs after a board merge (code read, not run).
- The cause of the card's 558,000 and 83,000 figures.

#### ESTIMATE (GUESS)
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

## Implementation Notes
2026-11-23 (orchestrator, at launch, a note not a plan edit): task-446 is folded on the board at 2fe7fa150, so the handbook now holds one more line than the plan counted (fe.58 for R-22): where the plan's figures read 57 handbook rules or 21 OWED rows, the tree reads 58 and 22. The lane measures at its own head and reports the figure it finds; if a planned test pins the old figure, stop and report.

2026-11-23 taken on the board at lane launch (lane BL-SURF439, worktree /Users/brettpreston_macmini/Buildo-wt-surf439, branch wf1/inc1b-surf439), RR-0240

## References
- docs/reports/reviews/task-439/GROUNDER-PLAN.md
- docs/reports/reviews/task-439/TRIAGE-PLAN.md
- docs/reports/reviews/task-439/seat-integration-1.md
- docs/reports/reviews/task-439/seat-reality-check-1.md
- docs/reports/reviews/task-439/seat-regression-1.md
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
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2) — "Apprvoe step 1 and step 2 - when it arrives" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1823)
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
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386 — "yes we move on to the McfixReborn.  Continue this after 424 and 386 as we agreed" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1981)
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
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
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2) (names RR-0374) — "Apprvoe step 1 and step 2 - when it arrives" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1823)
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136 (names RR-0376) — "Exactly 1. Leave Spec 137 and Spec 08 as they are, and drop that part of task 427." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1836)
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed (names RR-0378) — "Plan approved. We are running right now on this? Add the tasks? This is the final changes to McSix step? Provide how this impacts the tasks as a plan and you can remove step 7 right now" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1852)
- RR-0379 Step 1 runs in parallel; handbook rules are added over time (names RR-0379) — "We can run step 1 in parellel - we will add to the rules overtime" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1859)
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules (names RR-0380) — "Pushing 1 transition once the handbook has been updated iwth the critical items and drop the full engineering when arts can be sent  2. y 3 4 N" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1865)
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached (names RR-0383) — "1. what is your recommendation. I approve it" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1895)
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer) (names RR-0384) — "These look great - teh 13 are perfect. Task 430 becomes three small things: stop the clipping, make each line reflect its notes, and add these 13 lines. Item 9 stays a pointer, so the page does not grow by copying tables." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1901)
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386 (names RR-0393) — "yes we move on to the McfixReborn.  Continue this after 424 and 386 as we agreed" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1981)
- RR-0395 one small task adds the missing handbook lines before task-439 lands (names task-439) — "Agreed. Plan approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1993)

## Prior reviews and lane reports
### task-439 (this task)
- docs/reports/reviews/task-439/FINDINGS-PLAN.md
- docs/reports/reviews/task-439/FOLD-CHECK.md
- docs/reports/reviews/task-439/GROUNDER-PLAN.md
- docs/reports/reviews/task-439/QUESTIONS-RULED.md
- docs/reports/reviews/task-439/TRIAGE-PLAN.md
- docs/reports/reviews/task-439/seat-integration-1.md
- docs/reports/reviews/task-439/seat-reality-check-1.md
- docs/reports/reviews/task-439/seat-regression-1.md

## Dependencies
- (none)
