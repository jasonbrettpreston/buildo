---
id: TASK-324
title: 'Web search page footer (E.2) has no task: where is it built?'
status: DONE
assignee: []
created_date: '2026-11-19T14:56:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - gap
  - plan:E.2
  - operator
  - McFixReborn
  - dead
milestone: m-1
dependencies: []
references:
  - backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
  - .cursor/MCFRONTEND-QUEUE.md#L310
  - .cursor/MCFRONTEND-QUEUE.md#L319
priority: low
type: decision
project: McIncrement
ordinal: 26012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: doc-2 Elements E.2 'Web footer: legal line, Terms of Service, Privacy Policy, Help and Support, copyright' is AVAILABLE per the 2026-11-17 sweep (MISSED by it) and NOT BUILT on the web search page; its plan deliverers are MF-44 and MF-46, both DONE rows (.cursor/MCFRONTEND-QUEUE.md:310 MF-44 web search pair under the (maxbld) layout; :319 MF-46 web front door with the landing footer); neither row text names the search-page footer (the landing footer F-LANDING is built, doc-2 Built state); search-delta/CURRENT-SEARCH.md E.2 'task: NO TASK', design at ~/Buildo-scratch/lanes-20261117/search-delta/src/search.txt:323 'Terms of Service'. The web search page sends no lookup while MAXBLD_WEB_LIVE is false and the web live switch stays off (RR-0170, ONE-35 b); LS.12 (task-287, m-2) flips it. Recommendation (verified by review r1 of task task-326; review output docs/reports/lanes/2026-11-19/BL-R11/r1-review.txt, triage TRIAGE.md there): E.2 is its own one-element McFrontend task in the web search group (E.1 to E.3), not part of LS.12 and not blocked by the live switch, because the footer reads no data, no store and no switch: the web search page renders for a signed-in plan holder with its controls disabled while MAXBLD_WEB_LIVE is false (src/app/(maxbld)/parcel-tool/SearchPageClient.tsx:17, src/lib/surfaces/maxbld-web.ts:19), which corrects the R10 reading that nothing on it is visible; the MF-44 and MF-46 rows are DONE and name no search footer (.cursor/MCFRONTEND-QUEUE.md:310, :319), so the plan's deliverer attribution is wrong and E.2 has no home today. Build: a footer node in the web search tree (src/components/surfaces/web/SearchBinding.tsx, tree at :219) in the shape of the static-page footer (scripts/surfaces/_schema/static-page.json:52-75; StaticBinding.tsx:175 footerNode, not exported, so the same shape, not an import), five items as the v8 design draws it (~/Buildo-scratch/lanes-20261117/search-delta/src/search.txt:323): the legal sentence, Terms of Service, Privacy Policy, Help and Support, copyright; content keys added to scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json (footer.copyright exists only in scripts/surfaces/platform_shared/F16/surfaces/web_login.content.json:61, no cross-surface sharing assumed); the links /terms /privacy /help are public pages that exist (src/lib/auth/host-policy.ts:51-53). Depends on: a new MF queue row first with its id claimed in the ledger (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72), the web search binding (MF-44, DONE), the three pages (MF-46, DONE); a web-search-state golden. Order: any push after 1·B starts; before LS.12 (task-287) flips the switch, so LS.12 depends-on the new task (the one dependency edit, made when the task is created). Front-end point for the operator (RR-0233): v8 draws the legal sentence inside the footer while the built web page already shows it under the input (MF-58, .cursor/MCFRONTEND-QUEUE.md:314); on the web it appears once, in the footer as v8 draws it, or twice. UNVERIFIED (not run): the web search goldens and whether the F01 descriptor needs a footer section as well (no footer in scripts/surfaces/parcel_product/F01/surfaces/*.json today); Spec 126 section 11b.7 W4 names no footer (grep).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operator answer recorded verbatim through scripts/analysis/backlog-decision.mjs with its cite
- [ ] #2 E.2 has a home task (m-2 LS.12 or an m-1 task) and its queue row names it
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 1·B validation (R10, RR-0257, task-316): created by R10: element E.2 web footer has no task (OPERATOR), Grounded and Recommendation in the description.

2026-11-19 R11 (task-326, RR-0233, RR-0232): the operator asked for a recommendation (MORNING-DECISIONS.md:1041); Recommendation line replaced by the one verified by review r1 of task-326; status stays OPERATOR for the operator word.

Dated note 2026-11-19 (M-246, prior text kept; RR-0270 · task-324 · Backlog; operator, verbatim: "1. once  -approved")

Dated note 2026-11-19 (M-246, prior text kept; RR-0273 · task-324 · Backlog; operator, verbatim: "this is a shared component")

2026-11-23 McFixReborn record check (RR-0437): AC1 and AC2 met: decision-77 and decision-78; task-332 is in m-1; row MF-91 at .cursor/MCFRONTEND-QUEUE.md; task-287 depends on task-332.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decided 2026-11-19 (decision-77, RR-0270; operator, verbatim: "1. once  -approved", MORNING-DECISIONS.md:1061): E.2 is its own McFrontend task, task-332 SRCH.FOOTER (row MF-91); the legal sentence shows once on the web search page, in the footer; LS.12 (task-287) depends on task-332. The footer is one shared component (decision-78, RR-0273).
<!-- SECTION:FINAL_SUMMARY:END -->
