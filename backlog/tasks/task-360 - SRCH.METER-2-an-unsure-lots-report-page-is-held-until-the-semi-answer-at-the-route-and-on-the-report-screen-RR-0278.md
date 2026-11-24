---
id: TASK-360
title: >-
  SRCH.METER-2 an unsure lot's report page is held until the semi answer, at the
  route and on the report screen (RR-0278)
status: BUILT
assignee:
  - '@lane-BL-METER2'
created_date: '2026-11-19T22:30:00Z'
updated_date: '2026-11-24T18:41:00Z'
labels:
  - dead
milestone: m-1
dependencies:
  - TASK-334
  - TASK-319
references:
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md
  - docs/reports/lanes/2026-11-19/BL-METER2/REPORT.md
type: build
project: McIncrement
ordinal: 60012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: an unsure (possible semi) lot's report page is not sent until the semi question is answered, at the lookup route and on the report screen. Findings RC-2, SE-1, SE-2, UX-2c (also closes RG-2 and the compliance seat's "client-asserted flag" question) of docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md.

In plain words: today, once reports exist, a person (or anyone calling the lookup directly) can read the report of a possible-semi lot without answering the question and without being counted, and the report screen can flash "No report for this lot yet." for a moment before it jumps to the question. After this task the report of such a lot appears only after the answer, and a refresh of an answered lot keeps showing it.

Cause (opened on head f65b64674): (1) src/app/api/parcels/lookup/route.ts:134-147 builds and sends `page` before the meter decision; :164 only labels the hit semi_pending and still returns the page, so a caller that never sends semi=answered gets an unsure lot's page free. (2) mobile/src/hooks/useParcelLookup.ts:86 the report screen's own query sends only parcelId, so a refetch of an answered lot is semi_pending with a page and uncounted; and the route param ?semi=answered (mobile/src/lib/lotForm.ts:28) hides the question without a count. (3) mobile/app/(app)/parcel-tool/[parcelId].tsx:28-34 redirects in a useEffect after the first settled render, which already shows the miss text (reportScreenState, ReportBinding.tsx:400-401).
Rule or design line it breaks: task-334 AC1 "an unsure lot answering the semi question is not counted until its report is produced" and the ruling RR-0278 (MORNING-DECISIONS.md:1082) "I should only be charged a report if ... a report is produced": a page that is sent must be a page that is counted. RR-0278 does not rule the semi flag itself (route.ts:155-157 cites it); the flag is the task-319 stage 2 design, so it can only make a lot count, never skip the count.

Note on the flag (review r1 CRITICAL, REJECTED with reason): treating ?semi=answered as proof is safe today because the answer has no effect on the report (IN-2: nothing reads lotFormOverride; the semi calculation is 7.25, task-209) and the flag can only make the caller's own lot count, never skip a count. When 7.25 lands, the override must be read from a stored answer (GAP.12, task-213), not from this flag; that is on task-209 by dated note.

Design of the fix (minimum): server: when body.lotForm?.unsure === true and semi !== 'answered', send page null (meter stays semi_pending); with semi=answered the existing branch counts once. Client: useParcelLookup passes semi: 'answered' when the report route param is exactly 'answered'; the report screen shows the loading state while needsSemiQuestion is true and data is settled.

Acceptance criteria (also on this task as AC): see AC list.

The post-answer navigation already appends the flag: mobile/src/lib/lotForm.ts:41 reportRouteAfterAnswer builds `?semi=answered`, and semi-question.tsx stores the answered result under the report key; no change there, listed for the end-to-end case.

Files: src/app/api/parcels/lookup/route.ts, src/tests/parcel-lookup-gate.infra.test.ts, src/tests/parcels-lookup-page.logic.test.ts, mobile/src/hooks/useParcelLookup.ts, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/__tests__/useParcelLookup.test.ts, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/src/lib/lotForm.ts (read only), docs/reports/lanes/, mobile/__tests__/reportScreen.mount.behaviour.test.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In src/tests/parcel-lookup-gate.infra.test.ts a red-first case: an unsure lot, no semi flag, producer returns a page, parcel_tool holder: response data.page is null and the log meter is semi_pending and openReport is not called; red before the route change, green after (pre-commit related run)
- [x] #2 Same file: the same lot with semi=answered returns the page and counts once (meter counted; the stub parcel carries a costMenu line with a numeric total so hasEvaluatedOption holds, and a negative case with no evaluated option stays not_evaluated, the ruled 1 b 2 a); a second lookup the same month is already_counted
- [x] #3 src/tests/parcels-lookup-page.logic.test.ts T-B3 cases that served a page for an unsure lot are updated; the file is green through the hook
- [ ] #4 useParcelLookup(parcelId, semi) sends semi=answered only when the route param is exactly 'answered' (case in mobile/__tests__/useParcelLookup.test.ts); mobile jest is not run by the hook (task-343 line 10), so say UNVERIFIED unless run on CI or device
- [ ] #5 The report screen renders the loading state, not the miss text, on the settled render that precedes the semi redirect (case in mobile/__tests__/semiQuestionPage.behaviour.test.tsx or a new report-screen test; same UNVERIFIED rule)
- [x] #6 npm run typecheck is clean; git grep -n "semi_pending" src/app/api/parcels/lookup/route.ts shows the page-null branch
- [x] #7 git grep -n "useParcelLookup(" mobile prints every call site; each passes the semi param only where it has the route param (report screen); no other reader of data.page null (ReportBinding.tsx:400-401 miss text) changes
- [x] #8 End-to-end case: answer then Continue then the report screen renders the page and the lot is counted exactly once (route test with semi=answered plus the lotForm.ts:41 route string pinned)
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
1. Route: read lotForm first; held = unsure and semi !== answered; for a held lot skip the stored read W and the compute, page null, meter semi_pending (AC1, AC6). 2. Tests red first in parcel-lookup-gate.infra.test.ts: held lot no flag page null, no openReport, compute not called; semi=answered returns page and counts once; no evaluated option stays not_evaluated; second lookup already_counted (AC1, AC2, AC8). 3. Update the existing unsure-with-page case in the gate test; check parcels-lookup-page.logic.test.ts T-B3 for any unsure-page case (AC3). 4. Mobile: useParcelLookup(parcelId, semi) sends semi=answered only for the exact route param; report screen passes it; question page unchanged (AC4, AC7). 5. Report screen: loading state while needsSemiQuestion and settled (AC5). 6. Lenses compliance, code-review, ux, error-paths, security at plan and output; typecheck; gates (AC6).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-METER2, worktree /Users/brettpreston_macmini/Buildo-wt-meter2, branch wf1/inc1b-meter2), RR-0240

AC4 and AC5 left unchecked: mobile jest cases written (useParcelLookup.test.ts parcelLookupParams; reportScreen.mount.behaviour.test.tsx held report screen) but not run by the hook (task-343 line 10): UNVERIFIED until CI or device. AC8 route half proven by the hook run, mobile half UNVERIFIED.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed e37346052: route holds an unsure lot's page until semi=answered (stored read and compute both skipped, meter semi_pending); report screen forwards its semi param and shows loading, not the miss text, while the question is owed. Hook result: Test Files 4 passed, Tests 129 passed, GATE OK. RC-1 left, no owner.
<!-- SECTION:FINAL_SUMMARY:END -->
