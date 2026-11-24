---
id: TASK-374
title: >-
  FIX.FOOTER Web report footer links use the router and meet the 44 px target
  (D7, D8)
status: RUNNING
assignee:
  - '@lane-BL-FIXFOOT'
created_date: '2026-11-20T13:33:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies: []
type: build
ordinal: 74012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Source: grounder verdicts docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and GROUNDER.md (task-368), on the handbook pass of the pushed 1·B change. Operator 2026-11-20 (verbatim): "essential we have a non compliance build again - the entire reason for this approach". Scope now: D7 src/components/report/ReportPage.tsx:251 the footer links are plain anchors (Spec 136 fe.36 navigation is a route: web Link): render through next/link. D8 :240 the links are under 44 px (engineering standards 1.1): add min-h and padding, UNLESS the approved v8 design draws them small: check the mock first; if it does, stop on D8 and bring it as an operator draft. Files: src/components/report/ReportPage.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each defect is confirmed on the head before fixing, with file:line
- [ ] #2 Tests red first, then green through the real hooks
- [ ] #3 Compliance lens run once per governing rule list with the list whole; a separate grounder verdict on file
- [ ] #4 The shared footer builder and its three users stay in parity (the existing parity tests pass)
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
PLAN task-374 FIX.FOOTER (lane BL-FIXFOOT). Principles: standardized, accurate, simple.
Confirmed on the head (opened): D7 src/components/report/ReportPage.tsx:251 case 'Button' returns a plain <a href> (Spec 136 fe.36, handbook line 139: web navigation is a route, <Link>); SearchBinding.tsx:384 and StaticBinding.tsx:429 already render footer links as Mantine Button component={Link}. D8 ReportPage.tsx:240 REPORT_FOOTER_LAYOUT.link has no min-h (engineering standards 1.1, 00_engineering_standards.md:14, 44px). The approved v8 mock draws the footer link as 44 px (small-pages-v8/search.html:174 ".foot a, .wfoot a { display:inline-flex; align-items:center; min-height:44px }"), and the approved report mock itself draws it at 44 px (~/Buildo-scratch/mcfrontend/report-themes/pub/B.html:222 "footer .ln a { display:inline-flex; align-items:center; min-height:44px; ... }"), so D8 is a code fix, not an operator draft. StaticBinding.tsx:90 (WEB_STATIC_LAYOUT.link) is a Mantine Button size lg (StaticBinding.tsx:141), whose height is 50px (node_modules/@mantine/core/styles/Button.css:5), so it is not below 44 px: no change there.
Change (two lines, one file): (1) ReportPage.tsx imports Link from next/link and renderFooter case 'Button' returns <Link key href className>; (2) REPORT_FOOTER_LAYOUT.link gains "inline-flex min-h-11 items-center" (the class pair already used at ReportPage.tsx:56 and :68). The builder footerNode.ts, the other two users, all goldens and stored values do not move.
Tests red first: new src/tests/surfaces/site-footer-route.ui.test.tsx (jsdom; next/link mocked to mark its anchors): every report footer link is a next/link and carries min-h-11 + items-center; the search and static footers keep their Link anchors (control). Red = commit attempt with only the test and task file staged.
Left alone (operator items, listed): conflicts C1 to C5, the 48 or 44 px question, the 60 s wait value.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20 taken on the board at lane launch (lane BL-FIXFOOT, worktree /Users/brettpreston_macmini/Buildo-wt-fixfoot, branch wf1/inc1b-fixfoot), RR-0240

Grounder verdict 2026-11-20 (separate read-only agent, launched by the orchestrator): FOLD AFTER the width fix; D7 fixed; D8 report link fixed in height and, after commit 205f67424, width (min-w-11); the static footer part of D8 was not a defect (Mantine Button lg, 50 px). Folded onto wf2/board. Open note for the operator: committed under McFrontend row MF-91 using that row earlier prereg and panel records (defensible, disclosed). The lane report copy describes the height-only state: superseded by this note.

2026-11-20 BL-FIXFOOT: D7 confirmed at ReportPage.tsx:251 (plain <a>), D8 confirmed at ReportPage.tsx:240 (no min-h); approved report mock B.html:222 draws the links at min-height:44px so D8 is a code fix. StaticBinding.tsx:90 is a Mantine Button size lg (50px, Button.css:5): not changed. Fix: next/link plus inline-flex min-h-11 items-center on REPORT_FOOTER_LAYOUT.link. Red: red.out (2 failed, 2 passed). Operator items left untouched: C1 to C5, 48 or 44 px, 60 s wait. Lens outputs and untriaged findings in docs/reports/lanes/2026-11-20/BL-FIXFOOT/; grounder owed.

2026-11-20 grounder fold: D8 width. The footer link also gets min-w-11 and justify-center (standards 1.1: 44px x 44px, finding out-compliance-eng-s1#1).

Retro review by a separate grounder 2026-11-20 (task-405), work as on the board: file ~/Buildo-scratch/lanes-20261119/inc1b/retro/BL-FIXFOOT/RETRO-374.md. The code is sound: every web footer link is a router link through the one footerNode.ts builder; 44 px holds for the classes applied; red proved; no golden moved. DEFECTS before a push: (1) Files line omits src/tests/surfaces/site-footer-route.ui.test.tsx. (2) TASK and the 29 lens files sit in lens/. (3) rule-list set stale (now eng-all, five-words, plan-protocol, inc-S, ms-S). (4) no grounder file although a note records a verdict; 129 findings ungrounded (the three fingerprint HIGH findings are false: ReportPage.tsx is not in FP_FILES). (5) three comments contradict the code: ReportPage.tsx:9 and :236, footerNode.ts:7 ('plain tags'; the footer renders next/link). (6) the 44 px test pins class tokens only; the planned static-footer control was not written.
<!-- SECTION:NOTES:END -->
