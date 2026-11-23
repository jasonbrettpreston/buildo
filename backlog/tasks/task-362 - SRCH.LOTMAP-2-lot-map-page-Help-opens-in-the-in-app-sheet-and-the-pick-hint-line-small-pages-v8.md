---
id: TASK-362
title: >-
  SRCH.LOTMAP-2 lot map page: Help opens in the in-app sheet, and the pick hint
  line (small-pages-v8)
status: BUILT
assignee:
  - '@lane-BL-LOTMAP2'
created_date: '2026-11-19T22:30:00Z'
updated_date: '2026-11-23T16:06:00Z'
labels:
  - S
  - plan:SRCH.LOTMAP
  - McFixReborn
milestone: m-1
dependencies:
  - TASK-321
references:
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md
  - docs/reports/lanes/2026-11-19/BL-LOTMAP2/REPORT.md
  - docs/reports/lanes/2026-11-19/BL-LOTMAP2/TRIAGE.md
type: build
project: McIncrement
ordinal: 62012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: two items the approved design (small-pages-v8) draws on the lot map page and the built page lacks: Help opens in the in-app sheet with Done, and the hint line under the disabled Choose a lot button. Findings UX-6, UX-7b of docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md. (UX-7a, the bare help link in the intersection, unlinked and many-lots states, is FALSE: v8 draws it.)

In plain words: tapping "Get help with an address" today throws the person out of the app into the phone browser; the design keeps them in the app with a Done button. And the design shows a small line "Pick a lot on the map or in the list." under the greyed button; the built page shows none.

Cause (opened on head f65b64674): (1) mobile/src/lib/maxbldHelp.ts:19 `void Linking.openURL(helpUrl(topic, q));` against v8 search.html:235 "in-app browser sheet (B10): Help, Terms, Privacy open the web page with Done"; expo-web-browser ~15.0.11 is already a dependency and used the same way by useSubscribeCheckout.ts:61 (WebBrowser.openBrowserAsync). (2) git grep "Pick a lot on the map" over mobile/src, mobile/app, scripts/surfaces: 0 hits; v8 choose-lot.html:278 `<p class="small" id="pick-hint">`; the requirements doc marks C.11 BUILT (backlog/docs/increments/doc-2 - Increment-S-requirements.md:63).
Rule or design line: approved design Daylight v8 (~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md:347 C.11); the help topic names stay as built (lot_match, address_match are an orchestrator reading, task-343 line 7; not in this task).
Reuse: the existing openHelp helper and the existing expo-web-browser use; no new component.

Files: mobile/src/lib/maxbldHelp.ts, mobile/src/components/surfaces/LotMapBinding.tsx, mobile/src/constants/lotMap.ts, mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json, mobile/app/(app)/parcel-tool/index.tsx, mobile/app/(app)/parcel-tool/disambiguate.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json, mobile/__tests__/lotMapPage.behaviour.test.tsx, mobile/__tests__/lotMapScreens.golden.test.ts, mobile/__tests__/maxbldHelp.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/fixtures/surfaces/, src/tests/fixtures/surfaces/mobile_parcel_disambiguation_map/, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/lot-map-help-link.logic.test.ts, docs/reports/lanes/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 openHelp(topic, q) calls WebBrowser.openBrowserAsync(helpUrl(topic, q)) and Linking.openURL is no longer called by maxbldHelp.ts (git grep -n "Linking.openURL" mobile/src/lib/maxbldHelp.ts prints nothing); a mocked expo-web-browser case written first
- [x] #2 The lot map page shows the hint "Pick a lot on the map or in the list." (a content key in the lot map content file, not copy in code) while Choose a lot is disabled and hides it after a pick; a case in mobile/__tests__/lotMapPage.behaviour.test.tsx
- [x] #3 Goldens by repo scripts only: lotmap-golden-capture.ts --check clean, emit-mobile-surfaces.mjs --check prints surfaces ok, surface-validate.mjs --check no new finding
- [x] #4 npm run typecheck is clean; mobile jest is not run by the hook (task-343 line 10): the close-out says UNVERIFIED unless run on CI or device
- [x] #5 git grep -n "openHelp(" mobile/src mobile/app lists every caller; each is checked by the case (search page and lot map); a rejecting openBrowserAsync is caught and logged, not thrown; on Android the Custom Tab has no Done button, so the expectation is the system back (stated in the close-out)
- [x] #6 Fidelity pins quote the mock: the busy/hint asserts name semi-question.html:130 and choose-lot.html:278, not only a --check of regenerated goldens
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
1. (AC1) Red: change mobile/__tests__/maxbldHelp.test.ts to mock expo-web-browser and expect openBrowserAsync(helpUrl) and no Linking.openURL; then maxbldHelp.ts calls WebBrowser.openBrowserAsync (same pattern as useSubscribeCheckout.ts:61), rejection caught and logged not thrown.
2. (AC2) Red: lotMapPage.behaviour case: hint 'Pick a lot on the map or in the list.' shown while Choose a lot is disabled, hidden after a card pick; golden-test pin quoting choose-lot.html:278. Then content key select.hint in mobile_parcel_disambiguation_map.content.json, hint node in LotMapBinding multi_parcel state when route is null.
3. (AC3) Goldens by scripts only: lotmap-golden-capture --write then emit-mobile-surfaces --write; surface-validate S-sbind 425 to 426 as data with dated comment in surface-conformance and surface-validate tests.
4. (AC4) npm run typecheck; mobile jest not run locally, UNVERIFIED unless CI/device.
5. (AC5) git grep openHelp( callers: disambiguate.tsx (lot map) and parcel-tool/index.tsx (search) both pass open_help: openHelp; covered by the maxbldHelp case; Android Custom Tab has no Done button, system back is the expectation (close-out).
6. (AC6) Pins name choose-lot.html:278; semi-question.html:130 busy is a semi page item already pinned at semiQuestionPage.behaviour.test.tsx:102 (not a lot map element).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-LOTMAP2, worktree /Users/brettpreston_macmini/Buildo-wt-lotmap2, branch wf1/inc1b-lotmap2), RR-0240

2026-11-19 station fix: src/tests/surfaces/lot-map-help-link.logic.test.ts pinned the help row right after Continue; brought to the designed order (choose-lot.html:278-279): nothing picked = continue, pick-hint, help-row; picked = continue, help-row. Mobile golden case also asserts both tails.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed aea5883ad: openHelp opens Help via WebBrowser.openBrowserAsync (rejection caught, topic-only log); select.hint 'Pick a lot on the map or in the list.' under the disabled Choose a lot (accessibilityHint + visible line, one predicate awaitingPick); goldens by scripts; S-sbind 425 to 426. Hook: Test Files 2 passed (95 tests), GATE OK, POLICY CHECKS OK. UNVERIFIED: mobile jest cases not run locally (AC2, AC4, AC5 jest part owed to CI), device look. Operator items in REPORT.md: silent help failure, Android no Done, hint-removal layout shift. Evidence: AC1 git grep Linking.openURL maxbldHelp.ts prints nothing; AC3 checks.out AFTER-FINAL 9/9 exit=0; AC4 root typecheck rc=0.
<!-- SECTION:FINAL_SUMMARY:END -->
