---
id: TASK-352
title: >-
  A.6 reports-left line: three design questions (zero left, no plan,
  outside-Toronto order)
status: DONE
assignee: []
created_date: '2026-11-19T21:32:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - plan:SRCH.A6
  - operator
  - McFixReborn
milestone: m-1
dependencies: []
references:
  - docs/reports/lanes/2026-11-19/BL-A6/REPORT.md
  - ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md#L1155
type: decision
ordinal: 52012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: three design questions about the A.6 reports-left line on the app search page ("6 of 10 reports left until 9 Dec 2026", small-pages-v8 search.html:267). Built by lane BL-A6 (task-320, report docs/reports/lanes/2026-11-19/BL-A6/REPORT.md). Sorted from its eight questions by lane BL-R17 (task-350): the reset-date time zone is ANSWERED (RR-0310, "your recommendation is approved", MORNING-DECISIONS.md:1207; build task task-351); the derived-name question falls away with that build; the web twin, the stale descriptor sentence and the three-settings question are loose ends on task-343 (no decision). Nothing waits on these three: the line works as built. Operator scope: front end and design (MORNING-DECISIONS.md:925, RR-0233). Review: round r1 of task-350 (docs/reports/lanes/2026-11-19/BL-R17/r1-review.txt, TRIAGE.md) read the pasted grounding only and opened no cited file, so no recommendation below is marked verified.

1. When a customer has used every report, should the line still show?
In plain words: a customer with 0 reports left sees "0 of 10 reports left until 9 Dec 2026" under the search box (A, as built) or sees no line at all (B). Under B they learn of the limit only when they tap a lot and get a notice, and today that notice is the subscription notice, not the limit message.
Grounded: yes. v8 draws only the 6-of-10 line (search.html:267) and draws the limit wall for the refusal, not the search page (report-limit.html:286, :298, :310); the server serves left = max(0, limit - used) (src/lib/entitlements/index.ts:655); built shows 0 (BL-A6 REPORT.md binding row 2); every 403 maps to the subscription notice (mobile/src/lib/parcelSearchMatch.ts:295-300) and the limit wall screen is not built (loose end on task-343, tied up by NONE).
Options: A show it (as built, no change). B hide at zero (one more rule in reportsLeftShown, mobile/src/lib/parcelSearchCore.ts:98-100, a new state and golden; size not measured, GUESS a handful of files).
Recommendation: A. The number is true and served; hiding it removes the only warning before the refusal. UNVERIFIED: review r1 saw the grounding as pasted text and raised no objection, but did not open the cited files.

2. What does the line show for a person with no reports plan?
In plain words: nothing (A, as built): no line appears, the page looks as v8 draws a person without a count. Or (B) a new sentence for that person, which the design does not draw and would need your wording.
Grounded: yes for the app: v8 draws no such state (search.html states 1 to 5 carry the line only for an entitled person); the app search page sits behind sign-in and the subscription gate (mobile/app/(app)/_layout.tsx:4-11); a lead_gen-only holder is unmetered, so has no count (docs/specs/02-web-admin/126_maxbld_surface_standard.md:1109, D-4 a); lapsed plan, a failed read and loading also draw no line (BL-A6 REPORT.md binding rows 3-4). Web: the page is disabled by the live switch (src/app/(maxbld)/parcel-tool/SearchPageClient.tsx:17) and no web file reads the entitlement, so the line is absent on web today for everyone; its gating after the switch flips is UNVERIFIED. This was the open design question left by task-340 (its description).
Options: A no line (as built, no new copy). B new wording for no plan (new content key, golden and wording: size not measured).
Recommendation: A, because the design draws none and a sentence not drawn would be invented. UNVERIFIED: review r1 read pasted text only.

3. In the "Lots are only available in Toronto" state, which comes first, the notice or the line?
In plain words: v8 draws the red notice first and the reports-left line under it, in that one state; the app puts the line straight under the search box in every state (so it sits above the notice). The choice is whether to match v8 in this one state or keep one fixed place.
Grounded: yes. v8 search.html:305-306 (notice, then line); states 2 and 3 have no notice (:280, :293); built order is box, line, legal, chips, notices (mobile/src/components/surfaces/SearchBinding.tsx:232-238). This is a deviation from the approved design (Daylight v8 is the product standard), so the choice is yours.
Options: A keep the one fixed slot (deviates from v8 in this state only; no change; the line never jumps). B follow v8: the line moves below the notice when the outcome is outside Toronto (mobile and web bindings and the outside-Toronto golden; FE-07 needs both; size not measured).
Recommendation: A, as a stated deviation: small effect, one slot in every state. UNVERIFIED: review r1 read pasted text only; the on-device look is unchecked.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-19 (M-246, prior text kept; RR-0311 · task-352 · Backlog; operator, verbatim: "a. show zero left")

Dated note 2026-11-19 (M-246, prior text kept; RR-0312 · task-352 · Backlog; operator, verbatim: "b. with no plan - it needs to an error page that inludes a way to sign up")

Dated note 2026-11-19 (M-246, prior text kept; RR-0313 · task-352 · Backlog; operator, verbatim: "c. can't we put in the search box. Enter a Toronto address")

Dated note 2026-11-19 (M-246, prior text kept; RR-0314 · task-352 · Backlog; operator, verbatim: "yes.")
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Answered by the operator 2026-11-19 (MORNING-DECISIONS.md:1216, :1223). (1) zero left is shown, as built: RR-0311 decision-96. (2) no plan: an error page that includes a way to sign up: RR-0312 decision-97. (3) the search box reads 'Enter a Toronto address': RR-0313 decision-98; the outside-Toronto notice stays: RR-0314 decision-99. Build tasks for (2) and (3) are created by task-355.
<!-- SECTION:FINAL_SUMMARY:END -->
