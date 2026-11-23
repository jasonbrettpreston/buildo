---
id: TASK-384
title: >-
  STD.REPORT-OWN The web report renderer gets a census owner and comes under the
  existing text, component and 44 px checks
status: RUNNING
assignee:
  - '@lane-BL-REPORTOWN2'
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - McFix
  - McFix B
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-REPORTOWN/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-REPORTOWN/FINDINGS.md
  - docs/reports/lanes/2026-11-20/BL-REPORTOWN2/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-REPORTOWN2/FINDINGS.md
type: build
ordinal: 84012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section B4. Page-by-page check: src/components/report/ReportPage.tsx, ReportView.tsx, ReportPageToggles.tsx are owned by no surface (docs/reports/generated/127-surface-registry.md section 5; src/tests/surface-registry.infra.test.ts:198 it.fails) and are in no bindings.json list, so C-2b, C-8 and C-9 never run on them (defect D8 sat there). Census owner entry plus listing; findings the checks then raise are fixed or brought to the operator. The landing embed exception (C-8 SHARED_REPORT_RENDERERS) is put to the operator as its own decision. Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: src/components/report/ReportPage.tsx, src/components/report/ReportView.tsx, src/components/report/ReportPageToggles.tsx, scripts/surfaces/_schema/bindings.json, src/tests/surfaces/surface-conformance.logic.test.ts, scripts/surfaces/_schema/census/web-product.json, scripts/surfaces/platform_shared/F14/surfaces/binding_web_report.descriptor.json, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, src/tests/surface-registry.infra.test.ts, mcbylaws/protected-paths.json, src/tests/backlog/rule-lists-table.logic.test.ts, scripts/surfaces/_schema/seed-report-v2.mjs, scripts/surfaces/_schema/report-presentation.json, docs/reports/generated/rule-lists-by-kind.md, src/tests/fixtures/surfaces/report/**, src/tests/fixtures/report-page/**, scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 node scripts/analysis/rule-lists.mjs resolve --files src/components/report/ReportPage.tsx --type build --letter S lists surface-136, surface-126, surface-127, surface-128 and surface-135 (also for ReportView.tsx and ReportPageToggles.tsx); pinned by src/tests/backlog/rule-lists-table.logic.test.ts (planted: glob removed, lists vanish)
- [ ] #2 The three report files are listed web REPORT modules in bindings.json and C-2b and C-8 judge them: display text 0, structural findings pinned per file and kind in both directions (src/tests/surfaces/surface-conformance.logic.test.ts C-12, planted cases red)
- [ ] #3 The three display strings of ReportView.tsx are content (report-presentation.json states.view); the 105 goldens that carry the presentation fingerprint moved by that one line
- [ ] #4 The push gate asks the operator y on the protected paths mcbylaws/protected-paths.json and scripts/surfaces/_schema/bindings.json
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
## Lane plan (BL-REPORTOWN2, task-384, STD.REPORT-OWN part two)

Goal: the three web report renderer files (src/components/report/ReportPage.tsx, ReportView.tsx, ReportPageToggles.tsx) come under the existing surface checks C-2b (no display text) and C-8 (closed component table), with the structural findings pinned as a shrink-only baseline, and the McFrontend handbook reaches their reviewers. They stay a component; nothing is converted (Spec 126 :925 "REPORT keeps the landed renderer", :926 "the landed web REPORT renderer" is on the list of our code).

Rule the task rests on: the approved item 3 at ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1421 "3. Leave the reports as components, and bring them under the existing checks (task 384)." with the operator's word at :1422 "approved [the five items pasted] - remember the app is not beign used - we are in development"; resolution by a separate grounder under the delegation at :1476 "Let the grounder resolve them all as long as the result is compliant" (task notes: option 2, strings fixed).

Facts the resolution rests on, each opened before building:
1. mcbylaws/protected-paths.json `frontend` has no src/components/report glob (file read); scripts/analysis/rule-lists.json:123-124 row `surfaces` reads that list (globs_from), so the surface lists attach to a path only when it is in `frontend`. Before: `rule-lists.mjs resolve` on ReportPage.tsx lists eng-all five-words plan-protocol inc-S ms-S only (resolve-before.txt).
2. bindings.json lists none of the three files; census binding_web_report (web-product.json:5411) owns them (part one). C-3 (surface-conformance.logic.test.ts:164-168) needs module_roots to be under COMPONENT_ROOTS and frontend globs in the policy, so the glob must come first.
3. Treated as web REPORT modules the real functions raise C-2b 108 (ReportPage 92, ReportView 16, ReportPageToggles 0) and C-8 213 (171, 41, 1) (measure/measure-before.txt, reproduced). Display text is exactly three findings: ReportView.tsx:19 "confidence:" and "· provenance:", :121 "Details". ReportPage.tsx string children are the blank spacer " " (5) and `label=` values are key names, not text: structural.
4. FE-05 (report-no-maths.logic.test.ts DIRS) already scans src/components/report, so the listing adds no new no-maths exposure.
5. Content home: scripts/surfaces/_schema/report-presentation.json (generated by scripts/surfaces/_schema/seed-report-v2.mjs, `states` block) is the registry of report strings; StaticBinding.tsx:41 imports it directly (precedent for a binding module).

Changes (smallest, existing mechanisms only):
1. mcbylaws/protected-paths.json: frontend += "src/components/report/**"; a dated note in $comment in the form of the earlier notes (MB-67 owner commit; the approved item quoted from MORNING-DECISIONS.md:1421-1422). The note says the report files join frontend so the surface checks and handbook reach them; it does not say the operator ruled an exemption. Protected path: the push gate asks the operator y.
2. scripts/surfaces/_schema/bindings.json: module_roots += src/components/report/; modules += the three files (web, REPORT, owner binding_web_report, exports); promoted_entries += binding_web_report; a dated note in $comment. mapping.web gets no REPORT list (the renderer is not a library binding).
3. Move the three display strings of ReportView.tsx to content: seed-report-v2.mjs `states.view` (details, meta line template), regenerated into report-presentation.json by the generator; ReportView reads them by import as StaticBinding does. No view type or golden changes.
4. surface-conformance.logic.test.ts: C-2b and C-8 real-tree cases judge every listed module; the three report files are judged with a pin REPORT_RENDERER_PIN per file and per kind (C-2b structural, C-8): exact counts, both directions (a new finding or a fixed one turns it red), shrink-only (lowered by editing the pin with the fix); display text in the three files has no pin and must be 0. C-3 count lock [10,7,25] becomes [13,8,25]. C-12 gains: listed set is exactly the three, owner binding_web_report, bindingsProblems clean, plus planted defects (a file dropped from modules, a wrong owner, the pin one up and one down) and a passing control.
5. rule-lists-table.logic.test.ts: for the three files, resolve lists surface-136, surface-126, surface-127, surface-128, surface-135; planted defect: a temp copy of protected-paths without the glob, the lists vanish; passing control; and the real lens-input for surface-136 holds fe.01 to fe.44 (44 distinct ids).
6. Census binding_web_report entry and its descriptor: limitations say the files are judged by C-2b and C-8 with the baseline, and are outside C-9 (it judges golden nodes, not files); checks.why, notes, sharing.evidence now true (bindings.json modules lists the three); reduced_motion honoured (globals.css:182-185, report-checked.logic.test.ts C5); stale Spec 126 line cites fixed (:925-926). Regenerate the two 127 registry docs and descriptor with generate-surface-registry.mjs; regenerate the rule-lists page if it drifts.
7. Task file through the backlog CLI: Files line extended (protected-paths.json, rule-lists-table test, seed-report-v2.mjs, report-presentation.json, and whatever the checks force), acceptance criteria added, notes.

Order: plan lenses (plan review before any code); red (tests only + task file, red.out); build; checks before and after; green through the real hooks (commit.out); output lenses on the whole diff; FINDINGS.md untriaged; lane report; task left RUNNING, grounder owed.

Not done (named): the landing embed exception (C-8 SHARED_REPORT_RENDERERS) is its own operator decision; C-9 reach (needs a rule on what to judge in a hand-built renderer); fixing the structural attributes (renderer is hand-built by design).
Rules served: Spec 126 section 0a principle 1 and 11b.2; 08_agents.md section 7 rules 3 and 4 and 11.1; PLAN-PROTOCOL.md:3 simple, no scope creep; standardized, understandable, simple.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-REPORTOWN, worktree /Users/brettpreston_macmini/Buildo-wt-reportown, branch wf1/inc1b-reportown), RR-0240

2026-11-20 grounder follow-up (BL-REPORTOWN): binding_web_report limitations/deviations/a11y corrected to say the three files are outside C-2b, C-8, C-9 (UNRESEARCHED where unmeasured); measure output saved in the lane report; trailer MF-57.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder, 2026-11-20 (the lane verifies each cited fact before building): option 2 with the strings fixed: add src/components/report/** to the frontend list of mcbylaws/protected-paths.json (dated note quoting the approved item 3 "Leave the reports as components, and bring them under the existing checks" at MD:1421-1422; the note may not say the operator ruled an exemption; the push gate still asks the operator y), list the three files (they are in src/components/report/, not surfaces/) in bindings.json, move the 3 display strings (ReportView.tsx:19 and :121) to content per FE-31, pin only the structural C-2b and C-8 findings per file and kind as a shrink-only two-direction baseline, state outside C-9 in the census entry. No policy-ledger row is involved. Rejected: option 1 leaves the files outside the checks; option 3 breaks Spec 126:924 "REPORT keeps the landed renderer".

Retro review by a separate grounder 2026-11-20 (task-405), work as on the board: GROUNDER.md at ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-REPORTOWN/GROUNDER.md (sha256 ddb7e1f659f5…, 194 findings: 65 CONFIRMED, 126 REJECTED, 3 CONFLICT). DEFECTS: (1) commit ec063fd58 says the renderer is 'owned and under the surface checks'; it is owned only: no check judges the three files (part two unbuilt). (2) the out lens outputs judged a different diff (diff-task-384.patch with a bindings.json listing that is not on the board): no output lens saw the board change. (3) red.out does not match the committed tests; C-12 has no planted-defect case. (4) the descriptor cites 'bindings.json modules' as sharing evidence, which lists none of the three files; Spec 126 cites :923-924 stale (now 925-926); reduced_motion 'none' against globals.css:138. (5) trailers disagree (MF-83 a LATER row, MF-57 a DONE row); the governing approval, item 3 at MORNING-DECISIONS.md:1421-1422, is cited nowhere. (6) the card has no acceptance criteria. (7) 14 of 17 resolved lists have no valid output. Three display strings still at ReportView.tsx:19 and :121 (part two). Part two also puts the files under the FE-05 no-maths lock, never measured.

2026-11-20 released by the launch script's own undo command (backlog-lane.mjs:87) on the operator's word (MORNING-DECISIONS.md entry 'Operator ALLOWS the release and relaunch of tasks 384 and 375'): the BL-REPORTOWN lane ended with part two unbuilt; relaunched as BL-REPORTOWN2.

2026-11-20 taken on the board at lane launch (lane BL-REPORTOWN2, worktree /Users/brettpreston_macmini/Buildo-wt-reportown2, branch wf1/inc1b-reportown2), RR-0240

2026-11-20 BL-REPORTOWN2 part two built, commit b1fff68cd (STD.REPORT-OWN): src/components/report/** in the frontend list (dated note quoting MORNING-DECISIONS.md:1421-1422), the three files listed as web REPORT modules, C-2b and C-8 judge them with a shrink-only two-direction pin (C-2b 92/13/0, C-8 171/41/1; display text 0), 3 display strings moved to content (report-presentation.json states.view), census entry and descriptor corrected, outside C-9 stated. Before: resolve lists eng-all five-words plan-protocol inc-S ms-S; after: plus surface-136, 126, 127, 128, 135 for all three files; surface-136 lens input holds fe.01 to fe.44 (44 ids). 105 goldens moved by one fingerprint line. Output lens inputs: the whole diff was refused by lens-input (175,357 characters), so the outputs judge a diff without those 105 golden lines; 5 lists (surface-126, surface-128, surface-135, airtight-124a, policy-124-s2-s5) still refuse: no out compliance output for them. Operator y owed at the push gate on mcbylaws/protected-paths.json and bindings.json. Grounder owed; findings untriaged: docs/reports/lanes/2026-11-20/BL-REPORTOWN2/FINDINGS.md.

Grounder read of part two 2026-11-20 (branch wf1/inc1b-reportown2, b1fff68cd; read check before a fold, not a ruling): purpose HOLDS by the grounder's own runs (the three report files resolve to surface-136, 126, 127, 128, 135; 44 fe ids in a real input); three strings render byte-identical; 105 goldens differ only in the fingerprint line. NOT COMPLETE, owed before a close: (1) the shrink-only pin has three holes: it compares counts, so removing one attribute and adding aria-label words passes; text inside a ternary or template literal is not seen; a library component also counts, so the pin can shrink only by deleting elements (total 318, not 317); (2) five lists have no output review because the list itself exceeds the room: surface-126, surface-128, surface-135, airtight-124a, policy-124-s2-s5; the output lenses ran on a hand-reduced diff; (3) trailer MF-57 chosen under RR-0332 (MORNING-DECISIONS.md:1432) though ReportView.tsx was built under MF-14: orchestrator reading, not ruled; (4) no test asserts the Details text; (5) wf1/inc1b-areafactor restamped the same 105 goldens: the second branch to land rebases and regenerates with the capture tools, no hand merge. Fold HELD by the orchestrator until the task-410 grounder rules how a folded task closes.

2026-11-20 dated note (BL-REPORTOWN2, after the rebase onto wf2/board): the commit trailer McFrontend-Task: MF-57 was the lane's choice under RR-0332, the operator ruling at ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1431-1432 on the McFrontend row for a fix, Operator, verbatim: "2. y 1 a" (1 (a): a McFix task may file its commits under the McFrontend row that built what it fixes). ReportView.tsx was built under MF-14 (MF-14, the one REPORT renderer, DONE 2026-11-09). The choice of MF-57 is the lane's own and is not an operator ruling.

2026-11-21 dated note (BL-REPORTOWN2): the push-station suite at board head d9f2143a7 failed src/tests/surfaces/auth-class-parity.infra.test.ts (2 failures: R-18 P-1 SURFACE binding_web_report: declares no auth_class_parity check). Cause: the descriptor created by ec063fd58 held only a components_owned check; Spec 128 R-18 (128_surface_standard_policy.md:220) needs an auth_class_parity check at FAIL for a scope A-C descriptor, and the exceptions list may only shrink. Fix: the check binding_web_report_auth_class_parity (FAIL, blocking, when pre) added to the census entry and the descriptor (same form as binding_web_static); registry doc regenerated. Not shown red by this lane through the hook (the related run selects src and scripts code files only, not a descriptor json): the suite log is the red.
<!-- SECTION:NOTES:END -->
