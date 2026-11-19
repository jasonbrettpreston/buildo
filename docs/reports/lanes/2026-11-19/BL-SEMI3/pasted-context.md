# Review context for task-361 (SRCH.SEMI) written 2026-11-19 by backlog-brief.mjs

## Task
task-361 SRCH.SEMI-3 semi page Continue: busy state, unmount guard, empty-id guard, bounded wait
status: RUNNING · milestone: m-1 · assignee: @lane-BL-SEMI3 · labels: S, plan:SRCH.SEMI

## Description
Scope now: the semi page Continue: a busy state while the answered lookup runs, the unmount guard set again in the effect body, an empty-id guard, and a bounded wait so the submit latch cannot stick. Findings UX-4, CR-1, LX-U1, LX-E1, LX-R2 of docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md. UX-3 (what a person sees after a failed Continue) waits on the operator's answer to draft D-1 and is NOT in this task.

In plain words: today a person who taps Continue sees no sign that anything is happening for a second or two, and in a development build (hot reload) Continue can fetch and count the report and then never open it. After this task Continue looks busy while it runs, and still navigates after a hot reload.

Cause (opened on head f65b64674): (1) mobile/src/components/surfaces/SemiQuestionBinding.tsx continueButton (:89-100) has no busy state (grep busy: 0 hits in the binding and semiQuestion.ts) although the approved mock draws it (~/Buildo-scratch/lanes-20261119/inc1b/semi2/semi-question.html:130 `.btn.p[aria-busy="true"]`, and v8 choose-lot.html:132). (2) mobile/app/(app)/parcel-tool/semi-question.tsx:32-33 `const mountedRef = useRef(true); useEffect(() => () => { mountedRef.current = false; }, []);` never sets the ref true in the effect body, so an effect cleanup followed by a re-run (Fast Refresh, or StrictMode if ever turned on; grep StrictMode over mobile: 0 hits, so production is not hit) leaves it false and Continue never navigates (:62 `if (!mountedRef.current) return;`).
Rule or design line it breaks: the approved semi mock (RR-0308, RR-0309) draws the busy style; task-319 stage 2 "Continue ... then opens the report".

Files: mobile/src/components/surfaces/SemiQuestionBinding.tsx, mobile/src/lib/semiQuestion.ts, mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/semiQuestionScreens.golden.test.ts, scripts/surfaces/parcel_product/, docs/reports/lanes/

Added after the lens run (BL-LENSES, DeepSeek lenses on 9fea46277; grounded on head f65b64674): (3) semi-question.tsx continueToReport calls fetchParcelLookup({ parcelId: id, semi: 'answered' }) with `id` possibly '' (the sibling hook is guarded, useParcelLookup(id || undefined)) (LX-R2, LX-E4); (4) the same call has no timeout or AbortController, so a request that never settles leaves submittingRef true and every later Continue tap silently ignored (LX-E1; whether fetchWithAuth bounds the wait is UNVERIFIED, no timeout found in mobile/src/lib by grep).

## Acceptance criteria
- #1 While Continue is pending the Continue Button node carries accessibilityState busy true (and the approved busy look); a case in mobile/__tests__/semiQuestionPage.behaviour.test.tsx written first
- #2 mountedRef is set true inside the effect body; a case that remounts the screen (cleanup then re-run) and still sees Continue navigate after the lookup resolves
- #3 Semi goldens are regenerated only by the repo script: node_modules/.bin/tsx --tsconfig mobile/tsconfig.json scripts/surfaces/semi-question-golden-capture.ts --check is clean after any new state, and node scripts/surfaces/surface-validate.mjs --check prints no new finding
- #4 npm run typecheck is clean; mobile jest is not run by the hook (task-343 line 10): the close-out says UNVERIFIED unless run on CI or device
- #5 continueToReport returns early when id is empty and never calls fetchParcelLookup with an empty parcelId (case written first)
- #6 A Continue whose lookup never settles ends in the error state after a bounded wait and the next Continue tap works (fake-timer case written first); submittingRef is reset on that path
- #7 Fidelity pin quotes the mock: the busy case names semi-question.html:130 `.btn.p[aria-busy="true"]`

## References
- docs/reports/lanes/2026-11-19/BL-TRIAGE/VERDICTS.md

## Documents
- (none)


## Operator rulings and design lines
- RR-0308/RR-0309: the semi question mock is approved as drawn ("Mock looks good", "Mock approved. Looks good!"). The mock draws the busy look only as the CSS rule semi-question.html:130 `.btn.p[aria-busy="true"] { opacity:.85; cursor:progress }` (same as v8 choose-lot.html:132); it draws no busy section, no spinner and no busy text.
- D-1 (what a person sees after a failed Continue) is NOT ruled and NOT in this task; the failed-Continue state must not change.
- RR-0233: a design choice the task or approved design does not settle is the operator's: reported as an operator item, not built.
- RR-0176: no 35 s cap on the loading screen; that is a different wait from this lookup.
- Brief: fix only what the task names; no new string; no new component kind; the failed state shows the existing built error state with its existing Try again.
- Triage of the plan round already ruled out for this task (do not re-raise): AbortSignal into fetchWithAuth, logging, disabling Continue while busy, spinner, changing the answer mid-flight, load-failure copy (all outside the task or design-silent).
- Mobile jest files are not run locally; the hook runs typecheck and lint.

## Task acceptance criteria are above. The diff below is the change.
