# TRIAGE BL-SEMI3 (task-361) - round 1 plan lenses (DeepSeek: compliance, code-review, ux, error-paths), grounder: lane Claude
Files: r1-compliance.txt, r1-code-review.txt, r1-ux.txt, r1-error-paths.txt. Head 0eaa22fc0. Note: the behaviour and golden tests were drafted in the worktree before this file existed (rule 16 sequence slip, disclosed in REPORT.md); no source file was changed before it.

## code-review
- CR-A HIGH "no abort, thread an AbortSignal into fetchParcelLookup": REJECTED. Task AC #6 asks for a bounded wait, not cancellation; fetchParcelLookup (mobile/src/hooks/useParcelLookup.ts:34-46) and fetchWithAuth (mobile/src/lib/apiClient.ts) are not in the task Files line; changing them is scope creep (PLAN-PROTOCOL.md:3). Loose end noted for task-343.
- CR-A part 2 "clear the timer on both settle branches, no unhandled rejection from the losing promise": KEPT (as designed): boundedWait clears the timer in both handlers and attaches both handlers to the inner promise, so a late rejection is handled.
- CR-B MED "log the timeout": REJECTED. The existing catch (semi-question.tsx:57-60) logs no error of any kind; a log is new behaviour the task does not name. Loose end.
- CR-C MED "log the empty-id return": REJECTED, same reason; and the branch is not reachable from a rendered Continue: with id '' the hook is disabled (semi-question.tsx:30 useParcelLookup(id || undefined)), data is undefined and not fetching, so buildSemiQuestionSituation (semiQuestion.ts:44-47) gives state 'redirect', which renders no Continue (SemiQuestionBinding.tsx:body 'redirect' returns []). The guard is defence in depth, as the task asks (LX-R2).
- CR-D DEFER "busy from submitting only, not tied to ask": REJECTED. Continue exists only in the ask state (binding body), so a busy flag outside ask has no node to show on; busy = submitting && ask keeps stale input from claiming busy elsewhere.
- CR-E LOW "build the busy class from the same base constant": KEPT. semiSelectBusy is built from one SEMI_SELECT const plus the opacity class.
- CR-F REJECT (lens's own): agreed.

## compliance
- C-1 HIGH "pin semi-question.html:130 in the busy case": KEPT, partly already met: the behaviour test title and the golden named case quote `.btn.p[aria-busy="true"]` with :130; the binding comment will quote it too. No descriptor state is added (the mock draws the rule only, no busy section, semi-question.html:130 and :289-293 are the loading line), so the pin sits on a named case.
- C-2 DEFER "second tap re-fires the lookup": KEPT, already in the fake-timer case (fetch called twice, replace once).
- C-3, C-4 DEFER "run both --check commands, typecheck, say mobile jest UNVERIFIED": KEPT, they are the close-out steps (checks.out, REPORT.md).
- RR-0176 REJECT (lens's own). See E-5 for the same point.

## error-paths
- E-1 HIGH abort / idempotency key for a repeat lookup: REJECTED for abort (see CR-A). Repeat counting: RR-0278 says the server counts the lot once its report is produced (semiQuestion binding comment, semi-question.tsx:10-11); whether a repeated answered lookup double-counts is UNVERIFIED here (server not in the task Files). Loose end.
- E-2 MED abort on unmount: REJECTED (CR-A).
- E-3 MED "disable Continue when id is falsy": REJECTED (CR-C: no Continue renders with an empty id).
- E-4 DEFER "error state needs a retry": the built error state already has Try again (SemiQuestionBinding.tsx errorNotices); a case proves the next Continue works. What the person sees after a failed Continue is draft D-1, not this task.
- E-5 DEFER "30 s vs RR-0176 no cap": KEPT in part. RR-0176 (MORNING-DECISIONS.md:785) governs the loading screen, not this lookup; but its own figures (first-open compute p95 well under 35 s, ONE-4) mean a slow success must not read as failure, so the wait is set to 60 000 ms, a named constant SEMI_CONTINUE_WAIT_MS in semiQuestion.ts. The figure is a timeframe: OPERATOR ITEM in REPORT.md (Grounded and Recommendation lines).
- E-6 LOW "guard catch with mountedRef; clear timer": already so (catch guard exists at :58; timer cleared on settle, a pending timer after unmount rejects into the guarded catch).

## ux
- U-1 HIGH "route the timeout to the load-failure copy": REJECTED. The failed-Continue state is D-1 (not ruled, excluded by the brief); RR-0179 is a different page.
- U-2 HIGH empty id to load-failure copy: REJECTED (CR-C, unreachable).
- U-3 DEFER "disabled while busy": REJECTED. The mock draws aria-busy only (semi-question.html:130); the v8 `.btn:disabled` look (choose-lot.html:134) would replace the busy look; the latch already ignores a second tap.
- U-4 DEFER "spinner or elapsed text": REJECTED, no design source, no new string (brief); recorded as part of the operator item.
- U-5 DEFER "answer can change mid-flight and the report opens with the pressed answer": TRUE on head (route is bound to the press, SemiQuestionBinding.tsx continueButton onPress; cards stay live). Not named by task-361; a design choice. Loose end for task-343, not built.
- U-6 REJECT (lens's own): agreed.

# Round 2 (output lenses on the diff: r2-compliance, r2-code-review, r2-ux, r2-error-paths; verdicts PASS x4)
- R2-CR1 LOW/ER2 MED "no cancel handle for the timer, clear on unmount": REJECTED. Both settle paths clear it (semiQuestion.ts boundedWait); a pending timer after unmount rejects into a catch that is guarded by mountedRef (semi-question.tsx catch/finally); a handle is new API the task does not name.
- R2-CR2 NIT "exported SemiContinueTimeoutError unused": KEPT, `export` dropped.
- R2-CR3 NIT "test title promises idle after replace, not asserted": KEPT, assertion added (busy key absent after the report opens).
- R2-CR4 LOW "mockParams = {} leaks": REJECTED. beforeEach resets mockParams = { parcelId: 'PCL-S1' } (semiQuestionPage.behaviour.test.tsx beforeEach).
- R2-C1 MED "no regenerated golden / no --check output": REJECTED as a defect: the capture script writes goldens only for fixture.goldens entries (semi-question-golden-capture.ts goldenText), ask_yes_busy is a named case; checks.out AFTER shows semi-question goldens ok (8), S-sbind 425 strings, S-golden unchanged.
- R2-C2 LOW "operator item only in a comment": KEPT: stated in REPORT.md (Grounded and Recommendation lines).
- R2-E1 HIGH "no idempotency key, answer counted twice after timeout and retry": REJECTED. The server counts the lot once per user: src/app/api/parcels/lookup/route.ts:157 ("counts like any lot, once"), :160 meter value 'already_counted'. A repeat answered lookup for the same lot is a no-second-count by the server, not a client key. Cancelling the abandoned request stays the excluded abort item (loose end).
- R2-U1 MED duration for operator: KEPT (operator item). R2-U2 LOW empty-id silent: REJECTED (unreachable: no Continue renders without an id, semiQuestion.ts:44-47). R2-U3 LOW copy "check your connection" after a timeout: not ours (D-1), carried to loose ends. R2-U4 LOW "verify the busy look on a device": KEPT as UNVERIFIED in the report.
