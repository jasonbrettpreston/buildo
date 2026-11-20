---
id: TASK-384
title: >-
  STD.REPORT-OWN The web report renderer gets a census owner and comes under the
  existing text, component and 44 px checks
status: RUNNING
assignee:
  - '@lane-BL-REPORTOWN'
created_date: '2026-11-20T15:08:00Z'
updated_date: '2026-11-20T19:13:00Z'
labels:
  - McFix
  - McFix B
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-20/BL-REPORTOWN/REPORT.md
  - docs/reports/lanes/2026-11-20/BL-REPORTOWN/FINDINGS.md
type: build
ordinal: 84012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan section B4. Page-by-page check: src/components/report/ReportPage.tsx, ReportView.tsx, ReportPageToggles.tsx are owned by no surface (docs/reports/generated/127-surface-registry.md section 5; src/tests/surface-registry.infra.test.ts:198 it.fails) and are in no bindings.json list, so C-2b, C-8 and C-9 never run on them (defect D8 sat there). Census owner entry plus listing; findings the checks then raise are fixed or brought to the operator. The landing embed exception (C-8 SHARED_REPORT_RENDERERS) is put to the operator as its own decision. Operator 2026-11-20 (verbatim): "1. yes. add the tasks to incr 1b and remove the ones we dont need 2. fold ... d. just add the review enforcement not the others. e. fine". Plan: ~/Buildo-scratch/lanes-20261119/inc1b/enforce/PLAN-3-ONE-PLAN.md; reviewer evidence in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md entries of 2026-11-20 (plan grounder; page-runner measurement; page-by-page schema check). Each gate or scan: a committed planted-defect test, red first through the real hooks; a separate agent attacks it, results reported as refused or STILL OPEN. Lens set with the rule lists whole and the rulings pasted; grounder launched by the orchestrator, never the lane. Files: src/components/report/ReportPage.tsx, src/components/report/ReportView.tsx, src/components/report/ReportPageToggles.tsx, scripts/surfaces/_schema/bindings.json, src/tests/surfaces/surface-conformance.logic.test.ts, scripts/surfaces/_schema/census/web-product.json, scripts/surfaces/platform_shared/F14/surfaces/binding_web_report.descriptor.json, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, src/tests/surface-registry.infra.test.ts
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
## Lane plan (BL-REPORTOWN, task-384, STD.REPORT-OWN)

Goal: the three web report renderer files (src/components/report/ReportPage.tsx, ReportView.tsx, ReportPageToggles.tsx) get a census owner and join the checked set, in the same form as the phone REPORT modules. They stay a component; nothing is converted (Spec 126 section 11b.1, docs/specs/02-web-admin/126_maxbld_surface_standard.md:923: "REPORT keeps the landed renderer (§11a; Spec 135 FE-24)"; :924 "the landed web REPORT renderer" is on the list of our code).

Measured before any edit (lane measure script, a transpile of the real test file functions; ~/Buildo-scratch/lanes-20261119/inc1b/reportown/measure/measure-before.txt): with the three files treated as web REPORT modules, C-2b raises 108 findings (ReportPage 92, ReportView 16, ReportPageToggles 0) and C-8 raises 213 (171, 41, 1). Only 3 of the C-2b findings are display text (ReportView.tsx:19 twice, :121); the rest are structural attributes (as, data-*, aria-*). C-8 findings are intrinsic elements and local components: the renderer is hand-built by design. C-9 judges golden nodes (component + props.size), not source files, so no data edit puts the three files under it.

Smallest data edit, following the phone form (bindings.json modules[] + one promoted platform_shared census entry that owns them, as binding_mobile_report does, scripts/surfaces/_schema/census/mobile-product.json:15071-15267 and bindings.json:21-22):
1. census web-product.json: one new entry binding_web_report (archetype REPORT, platform web, scope platform_shared) with identity.owns.components = the three files; its descriptor file emitted beside it (same text as the census entry, as binding_web_static).
2. bindings.json: module_roots += src/components/report/; modules += the three files (platform web, archetypes REPORT, owner binding_web_report); promoted_entries += binding_web_report. mapping.web gets NO REPORT list (the renderer is not a library binding).
3. Regenerate the two generated registry docs; the registry section 5 falls from 14 to 11 unowned files; the it.fails at src/tests/surface-registry.infra.test.ts:198 stays (red for the other 11).

Tests (red first through the real hooks; commit attempt with only tests + task file staged):
- C-12 (new, surface-conformance.logic.test.ts): the three files are listed web REPORT modules owned by binding_web_report in the census; listed set equals exactly the three; bindingsProblems clean.
- The real-tree C-2b and C-8 cases judge the three files with the measured findings PINNED per file and per check (exact count, both directions: a new finding or a fixed one turns it red). This pin is a baseline: it is the one exemption, listed for the operator with each count and the reason (no one-line fix exists; renderer kept by 11b.1). No existing check is weakened for any other file.
- surface-registry.infra.test.ts: the three files are not in the unowned set, and the unowned set is exactly the other 11 (so the it.fails stays honest: it cannot pass or be dropped silently).
- Count lock in the conformance test [10,7,25] becomes [13,8,25].

Not done, left for the operator: the landing embed exception (C-8 SHARED_REPORT_RENDERERS, surface-conformance.logic.test.ts:532) stays as is, written up as a question; C-9 reach (needs a rule on what to judge in a hand-built renderer); the 3 display-text findings and the structural attributes.
Files beyond the task Files line that must be touched: census/web-product.json, the descriptor file, docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md, src/tests/surface-registry.infra.test.ts, and any test count lock the new entry moves; the Files line is extended through the backlog CLI.
Rules served: Spec 126 section 0a principle 1 and 11b.2; 128 R-13; standardized, understandable, simple.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-REPORTOWN, worktree /Users/brettpreston_macmini/Buildo-wt-reportown, branch wf1/inc1b-reportown), RR-0240

2026-11-20 grounder follow-up (BL-REPORTOWN): binding_web_report limitations/deviations/a11y corrected to say the three files are outside C-2b, C-8, C-9 (UNRESEARCHED where unmeasured); measure output saved in the lane report; trailer MF-57.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder, 2026-11-20 (the lane verifies each cited fact before building): option 2 with the strings fixed: add src/components/report/** to the frontend list of mcbylaws/protected-paths.json (dated note quoting the approved item 3 "Leave the reports as components, and bring them under the existing checks" at MD:1421-1422; the note may not say the operator ruled an exemption; the push gate still asks the operator y), list the three files (they are in src/components/report/, not surfaces/) in bindings.json, move the 3 display strings (ReportView.tsx:19 and :121) to content per FE-31, pin only the structural C-2b and C-8 findings per file and kind as a shrink-only two-direction baseline, state outside C-9 in the census entry. No policy-ledger row is involved. Rejected: option 1 leaves the files outside the checks; option 3 breaks Spec 126:924 "REPORT keeps the landed renderer".

Retro review by a separate grounder 2026-11-20 (task-405), work as on the board: GROUNDER.md at ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-REPORTOWN/GROUNDER.md (sha256 ddb7e1f659f5…, 194 findings: 65 CONFIRMED, 126 REJECTED, 3 CONFLICT). DEFECTS: (1) commit ec063fd58 says the renderer is 'owned and under the surface checks'; it is owned only: no check judges the three files (part two unbuilt). (2) the out lens outputs judged a different diff (diff-task-384.patch with a bindings.json listing that is not on the board): no output lens saw the board change. (3) red.out does not match the committed tests; C-12 has no planted-defect case. (4) the descriptor cites 'bindings.json modules' as sharing evidence, which lists none of the three files; Spec 126 cites :923-924 stale (now 925-926); reduced_motion 'none' against globals.css:138. (5) trailers disagree (MF-83 a LATER row, MF-57 a DONE row); the governing approval, item 3 at MORNING-DECISIONS.md:1421-1422, is cited nowhere. (6) the card has no acceptance criteria. (7) 14 of 17 resolved lists have no valid output. Three display strings still at ReportView.tsx:19 and :121 (part two). Part two also puts the files under the FE-05 no-maths lock, never measured.
<!-- SECTION:NOTES:END -->
