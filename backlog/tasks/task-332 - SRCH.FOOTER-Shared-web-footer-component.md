---
id: TASK-332
title: >-
  SRCH.FOOTER Shared web footer component: the static-page footer extracted and
  exported, used by the web search pages (E.2, five v8 items, the legal sentence
  once, the under-input duplicate removed on the web page) and the web report
  page (lines G3-G5 bind to it; G2 sources-and-data-date stays GAP.4 task-127
  inside it)
status: BUILT
assignee:
  - '@lane-BL-FOOTER'
created_date: '2026-11-19T15:44:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - plan:SRCH.FOOTER
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - .cursor/MCFRONTEND-QUEUE.md#L310
  - .cursor/MCFRONTEND-QUEUE.md#L319
  - .cursor/MCFRONTEND-QUEUE.md#L438
  - scripts/surfaces/_schema/static-page.json#L52
  - src/components/surfaces/web/StaticBinding.tsx#L175
  - src/components/report/ReportPage.tsx#L319
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1061
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1066
  - docs/reports/lanes/2026-11-19/BL-R11/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-R11/TRIAGE.md
  - docs/reports/lanes/2026-11-19/BL-FOOTER/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-FOOTER/TRIAGE.md
  - docs/reports/lanes/2026-11-19/BL-FOOTER/commit2.out
documentation:
  - backlog/docs/increments/doc-4 - Increment-1-requirements.md
modified_files:
  - src/tests/surfaces/surface-validate.logic.test.ts
  - src/tests/surfaces/surface-conformance.logic.test.ts
type: build
ordinal: 30012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-19, verbatim: "1. once  -approved" (MORNING-DECISIONS.md:1061, RR-0270, task-324) and "this is a shared component" (MORNING-DECISIONS.md:1066, RR-0273, in the question "the same footer will be used on the other search pages and the reports pages? this is a shared component - validate this isnt in incr-1c"). Created by task-327 (R12), record-only.

Grounded (the R11 findings, review r1 of task-326, docs/reports/lanes/2026-11-19/BL-R11/REPORT.md sections 2 and 3, TRIAGE.md there):
- The static-page footer is a schema section: scripts/surfaces/_schema/static-page.json:52-75 (kind footer, three link parts /terms /privacy /help and one legal part); it is built by footerNode in src/components/surfaces/web/StaticBinding.tsx:175, which is not exported (no export is named for it; the file exports types, STATIC_KINDS, WEB_STATIC_LAYOUT, staticWebTree and StaticBinding, :42-:444).
- The v8 web search design ends with a footer holding the legal sentence, Terms of Service, Privacy Policy, Help and Support and the copyright (~/Buildo-scratch/lanes-20261117/search-delta/src/search.txt:323).
- The web search tree has no footer node (src/components/surfaces/web/SearchBinding.tsx, tree at :219) and has the legal sentence under the input at :123-124 (content key search.legal; MF-58 row .cursor/MCFRONTEND-QUEUE.md:438, the web placement is the MF-44 note N8 at .cursor/MCFRONTEND-QUEUE.md:314).
- The web search page renders for a signed-in plan holder with its controls disabled while MAXBLD_WEB_LIVE is false (src/app/(maxbld)/parcel-tool/SearchPageClient.tsx:17, src/lib/surfaces/maxbld-web.ts:19), so the footer is visible and needs no data, store or switch.
- MF-44 (.cursor/MCFRONTEND-QUEUE.md:310) and MF-46 (:319) are DONE rows and name no search footer; neither has a mirrored task on the board (searched backlog/tasks for MF-44 and MF-46: only task-271, task-324 and task-326 mention them), so they are dependencies by queue-row reference.
- The report page footer: schema section scripts/surfaces/_schema/report-page.json:1900-1917 (parts G2 sources, G3 change, G4 copyright; no G5 link part today), rendered by src/components/report/ReportPage.tsx:319-323; doc-4 (backlog/docs/increments/doc-4 - Increment-1-requirements.md:94-96, :121): G2 footer sources and data date (NOT-BUILT, GAP.4 task-127), G3 by-laws change line (BUILT), G4 copyright (BUILT-NO-DATA), G5 footer links. Increment 1·C (m-2, LS.1 to LS.12) holds no footer build item (LS.12, task-287, only depends on this task) (validated by the operator's question at MORNING-DECISIONS.md:1066).

Rulings (operator words only):
- RR-0270 (decision recorded by task-327, MORNING-DECISIONS.md:1061): the web search footer is its own McFrontend task with its own MF row; the legal sentence shows once on the web search page, in the footer as v8 draws it; the duplicate under the input goes on the web page; the mobile page keeps its A.10 line under the box (no footer there); LS.12 (task-287) depends on this task.
- RR-0273 (MORNING-DECISIONS.md:1066): the footer is one shared component for the web search pages, the web report page and the static pages; this task builds it (the static-page footer extracted and exported); the report lines G3-G5 bind to it; G2 sources and data date stays GAP.4 (task-127) inside it; not in Increment 1·C; the mobile report keeps its own binding until a mobile footer is ruled.

Build (what the rulings name, nothing more): extract the static-page footer (StaticBinding.tsx:175) into one exported component; the static pages use it unchanged; a footer node in the web SearchBinding tree with the five items, with their content keys added to scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json (the legal sentence once, Terms of Service /terms, Privacy Policy /privacy, Help and Support /help, copyright); the web search page drops the legal sentence under the input; ReportPage.tsx:319-323 binds G3-G5 to it (G5 footer links has no schema part today; the ruling names G3-G5). G2 element ids: G2 sources and data date, G3 by-laws change line, G4 copyright, G5 footer links.
Queue row: MF-91 in .cursor/MCFRONTEND-QUEUE.md (id claimed in ~/Buildo-scratch/ids/MF-91); this task is its Backlog home (Process 11 note of 2026-11-19: task-N beside MF-nn). Depends on: MF-44 and MF-46 (DONE queue rows, no mirrored tasks), the new row MF-91 (the queue row of this same task), GAP.4 task-127 (for G2 inside the component).
UNVERIFIED (not run, from task-324): the web search goldens, and whether the F01 descriptor needs a footer section as well (no footer in scripts/surfaces/parcel_product/F01/surfaces/*.json today); content keys for the search footer (footer.copyright exists only in scripts/surfaces/platform_shared/F16/surfaces/web_login.content.json:61).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The shared footer component is extracted from the static-page footer (StaticBinding.tsx:175) and exported from one place; the static pages use it unchanged
- [x] #2 The footer node is in the web SearchBinding tree with the five items (the legal sentence, Terms of Service, Privacy Policy, Help and Support, copyright), their content keys added to the F01 search content file
- [x] #3 The legal sentence is shown once on the web search page, in the footer; the line under the input is removed on the web page only
- [x] #4 The web report page binds footer lines G3-G5 to the shared component (ReportPage.tsx:319-323, report-page.json:1900-1917); G2 sources and data date stays GAP.4 task-127
- [x] #5 The mobile search page and the mobile report are unchanged
- [x] #6 Goldens regenerated by the repo scripts; red tests first, then the code, through the real hooks
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
1. AC1 new pure module footerNode.ts holds the one footer tree builder moved from StaticBinding.tsx:175; static pages use it, goldens unmoved. 2. AC2 footer node last in the web SearchBinding tree: legal (search.legal), Terms /terms, Privacy /privacy, Help /help, copyright, v8 order; four new footer.* keys in the F01 content file; render half maps Stack component and Button href. 3. AC3 remove the legal node under the input on the web tree only; parity lock amended as named data. 4. AC4 ReportPage footer renders G2 as today then the shared tree: G3 line, three links (G5), copyright (G4); new required footer text prop; no schema part added, mobile report binding untouched. 5. AC5 no mobile source edited; mobile search goldens fingerprint and slice copy move by script only. 6. AC6 red tests first through the hook, then code, web goldens by buildGoldens, pins as data if a count moves, prereg MF-91 docs commit first. Review r1 on the context file before code.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-19 (M-246, prior text kept; RR-0270 · task-332 · Backlog; operator, verbatim: "1. once  -approved")

Dated note 2026-11-19 (M-246, prior text kept; RR-0273 · task-332 · Backlog; operator, verbatim: "this is a shared component")

2026-11-19 dependency corrected: the footer does not wait on GAP.4 data; task-127 depends on this task (RR-0273)

2026-11-19 taken on the board at lane launch (lane BL-FOOTER, worktree /Users/brettpreston_macmini/Buildo-wt-footer, branch wf1/inc1b-footer), RR-0240

Build commit (lane BL-FOOTER): footerNode.ts is the one shared footer tree builder; static, web search and web report use it; web goldens by buildGoldens, mobile fingerprints by search-golden-capture.ts and emit-mobile-surfaces.mjs; S-sbind pin 414 -> 422.

S-sbind pins moved 418 -> 422 (four footer.* keys, F01 content lines 2-5) after BL-LOTFIX cleared the lot-card finding.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built on wf1/inc1b-footer: footerNode.ts is the one footer tree builder used by the static pages, the web search page (five v8 items, legal sentence once, line under the input removed on web only) and the web report page (G2 pending inside, G3, three links, copyright); build commit 7788ecc92 green through the real hooks (13 files, 171 tests), typecheck rc=0, goldens by repo scripts, mobile props unchanged. Pin move for S-sbind (414 -> 422) left to the commit that clears the LOTCARD surface-validate finding (see REPORT).
<!-- SECTION:FINAL_SUMMARY:END -->
