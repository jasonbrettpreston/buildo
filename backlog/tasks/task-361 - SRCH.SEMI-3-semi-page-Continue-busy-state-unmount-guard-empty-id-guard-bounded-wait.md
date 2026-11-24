---
id: TASK-361
title: >-
  SRCH.SEMI-3 semi page Continue: busy state, unmount guard, empty-id guard,
  bounded wait
status: BUILT
assignee:
  - '@lane-BL-SEMI3'
created_date: '2026-11-19T22:30:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - S
  - plan:SRCH.SEMI
  - McFixReborn
  - dead
milestone: m-1
dependencies:
  - TASK-319
references:
  - docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md
  - docs/reports/lanes/2026-11-19/BL-SEMI3/REPORT.md
type: build
project: McIncrement
ordinal: 61012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scope now: the semi page Continue: a busy state while the answered lookup runs, the unmount guard set again in the effect body, an empty-id guard, and a bounded wait so the submit latch cannot stick. Findings UX-4, CR-1, LX-U1, LX-E1, LX-R2 of docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md. UX-3 (what a person sees after a failed Continue) waits on the operator's answer to draft D-1 and is NOT in this task.

In plain words: today a person who taps Continue sees no sign that anything is happening for a second or two, and in a development build (hot reload) Continue can fetch and count the report and then never open it. After this task Continue looks busy while it runs, and still navigates after a hot reload.

Cause (opened on head f65b64674): (1) mobile/src/components/surfaces/SemiQuestionBinding.tsx continueButton (:89-100) has no busy state (grep busy: 0 hits in the binding and semiQuestion.ts) although the approved mock draws it (~/Buildo-scratch/lanes-20261119/inc1b/semi2/semi-question.html:130 `.btn.p[aria-busy="true"]`, and v8 choose-lot.html:132). (2) mobile/app/(app)/parcel-tool/semi-question.tsx:32-33 `const mountedRef = useRef(true); useEffect(() => () => { mountedRef.current = false; }, []);` never sets the ref true in the effect body, so an effect cleanup followed by a re-run (Fast Refresh, or StrictMode if ever turned on; grep StrictMode over mobile: 0 hits, so production is not hit) leaves it false and Continue never navigates (:62 `if (!mountedRef.current) return;`).
Rule or design line it breaks: the approved semi mock (RR-0308, RR-0309) draws the busy style; task-319 stage 2 "Continue ... then opens the report".

Files: mobile/src/components/surfaces/SemiQuestionBinding.tsx, mobile/src/lib/semiQuestion.ts, mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/semiQuestionScreens.golden.test.ts, mobile/__tests__/fixtures/semiQuestion.situations.json, scripts/surfaces/parcel_product/, docs/reports/lanes/

Added after the lens run (BL-LENSES, DeepSeek lenses on 9fea46277; grounded on head f65b64674): (3) semi-question.tsx continueToReport calls fetchParcelLookup({ parcelId: id, semi: 'answered' }) with `id` possibly '' (the sibling hook is guarded, useParcelLookup(id || undefined)) (LX-R2, LX-E4); (4) the same call has no timeout or AbortController, so a request that never settles leaves submittingRef true and every later Continue tap silently ignored (LX-E1; whether fetchWithAuth bounds the wait is UNVERIFIED, no timeout found in mobile/src/lib by grep).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While Continue is pending the Continue Button node carries accessibilityState busy true (and the approved busy look); a case in mobile/__tests__/semiQuestionPage.behaviour.test.tsx written first
- [x] #2 mountedRef is set true inside the effect body; a case that remounts the screen (cleanup then re-run) and still sees Continue navigate after the lookup resolves
- [x] #3 Semi goldens are regenerated only by the repo script: node_modules/.bin/tsx --tsconfig mobile/tsconfig.json scripts/surfaces/semi-question-golden-capture.ts --check is clean after any new state, and node scripts/surfaces/surface-validate.mjs --check prints no new finding
- [x] #4 npm run typecheck is clean; mobile jest is not run by the hook (task-343 line 10): the close-out says UNVERIFIED unless run on CI or device
- [x] #5 continueToReport returns early when id is empty and never calls fetchParcelLookup with an empty parcelId (case written first)
- [x] #6 A Continue whose lookup never settles ends in the error state after a bounded wait and the next Continue tap works (fake-timer case written first); submittingRef is reset on that path
- [x] #7 Fidelity pin quotes the mock: the busy case names semi-question.html:130 `.btn.p[aria-busy="true"]`
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
1. Confirm on head 0eaa22fc0: UX-4 no busy (grep busy 0), CR-1 mountedRef never set true in effect body, LX-R2 id may be empty, LX-E1 no bound on the wait. 2. Red tests first in semiQuestionPage.behaviour.test.tsx (busy node state, StrictMode remount still navigates, empty id never fetches, never-settling fetch ends in error and next Continue works) and a golden case for the busy state. 3. Fix: semi-question.tsx (submitting state, effect-body mountedRef, empty-id guard, bounded wait helper in semiQuestion.ts); SemiQuestionBinding.tsx busy node state and the v8 .btn.p[aria-busy] opacity .85 class in lotMap.ts. 4. Regenerate the semi golden by its script, then emit-mobile-surfaces --write; surface-validate and all checks clean. 5. typecheck; mobile jest UNVERIFIED locally. 6. Lenses at plan and output, adjudicated in TRIAGE.md. 7. Rebase on wf2/board, land with Task: task-361.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-19 taken on the board at lane launch (lane BL-SEMI3, worktree /Users/brettpreston_macmini/Buildo-wt-semi3, branch wf1/inc1b-semi3), RR-0240

BL-SEMI3 2026-11-19: all four defects confirmed on head 0eaa22fc0 and fixed. Busy = accessibilityState busy plus the mock rule opacity .85 (semi-question.html:130; the mock draws no busy section). Wait bound SEMI_CONTINUE_WAIT_MS = 60000 is a timeframe: operator item in the lane report. Not built: failed-Continue state (D-1), abort of the abandoned request, logging, answer change mid-flight (loose ends on task-343).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Four defects confirmed on 0eaa22fc0 and fixed: busy Continue (accessibilityState busy + mock rule opacity .85, semi-question.html:130), mountedRef set true in the effect body, empty-id guard, 60 s bounded wait ending in the built error state. Commits 9b43c7e7d (red cases) and 033bf0cbf (fix). Hooks: GATE OK, POLICY CHECKS OK, typecheck clean, all 9 generated/golden checks clean. Mobile jest cases written but NOT run (UNVERIFIED); busy look on device UNVERIFIED; 60 s value is an operator item. D-1 failed-Continue state untouched.
<!-- SECTION:FINAL_SUMMARY:END -->
