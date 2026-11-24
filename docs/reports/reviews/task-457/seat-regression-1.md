# Seat: regression: task-457 plan (PLAN-457-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head 43e4d04b6 (the plan cites e192b5e3e as its read head; since then only docs(137_mcqueue) board commits 43e4d04b6 and 0401c0316, no mobile file changed). Read: the task-457 card in full, PLAN-SEAT-BRIEF.md, MD:2360-2363, mobile/src/hooks/useParcelLookup.ts, mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/src/lib/semiQuestion.ts, mobile/__tests__/semiQuestionPage.behaviour.test.tsx (:20-60, :150-260), useParcelLookup.test.ts:175-188 (by grep), docs/adr/005-hardcoded-retry-after-60.md, task-450 QUESTIONS-RULED.md, GROUNDER-PLAN.md, seat-regression-1.md, docs/reports/lanes/2026-11-24/BL-SFX2/GROUNDER.md, git log/blame, commit ee3634771 stat. No docs/reports/reviews/task-457 folder exists, so there are no earlier lens findings to dedupe. I ran no tests, and I could not check the TanStack paused-retry behaviour by running it (UNVERIFIED).

## Checked and clean
- shouldRetryParcelLookup's refusal of RateLimitError dates from the first commit, 628654586 (2026-07-11, P23). Its comment says "429 (burning retries against the rate-limit compounds the throttle)". No ADR or ruling is behind it. ADR 005 is only about the server's fixed `Retry-After: 60`. The plan's step 1 leaves that function untouched and adds a wrapper, so the old guard stays whole.
- The server's limiter is not touched. The phone reads the header at apiClient.ts:43-44. The server sends 60 (ADR 005), and ADR 005's re-evaluation triggers (window under 30 s and similar) are not touched. A retry after a `Retry-After: 0` waits TanStack's 1 s default, which is at or above what the header asked for, so it does not break the limiter.
- The tests that lock "no retry on 429" are useParcelLookup.test.ts:175-186 (shouldRetryParcelLookup, including (0, RateLimitError(30)) false). They call the old function, which is unchanged, so they stay green both ways. The twin locks for flight and lead detail (useFlightJobDetail.test.ts:126, useLeadDetail.test.ts:166) are different functions and are untouched. T4 adds the lock for RateLimitError(0) on the old function.
- The 0s notice pins are pure-function or render pins and never reach the hook's retry option: parcelSearchMatch.test.ts:395 and :406, surfaceRenderer.smoke.test.tsx:77, parcelScreens.golden.test.ts:162. They stay green. Task-450's L3 outcome (0 shows the "0s" notice only, no Retry button) is kept when the retry is refused a second time (plan section 2, step 2).
- Task-450's V5 pins stay green. semiQuestionPage.behaviour.test.tsx:223 (the cold offline page reads "Searching", no redirect) advances no timer. The redirect-once cases (:206-216) have data, so the state is not loading and no timer starts. The Continue bounded-wait case (:176) has data, so state is ask and the new timer never runs.
- Timer safety on the semi page, from the planned effect: the timer exists only while situation.state is 'loading', and the cleanup clears it on any state change. The redirect state is not loading, so the timer is cleared before or when the page replaces itself. The cleanup also runs on unmount, so a timer cannot fire after leaving the page.
- The new limit cannot draw an error over a question the person is answering. The question shows only when data exists, and `data ? null : waitError` hides the error whenever data exists. A late-arriving answer replaces the error (T2). Continue's own submitError path is separate and unchanged.
- Nothing the task-450 grounder rejected is re-opened beyond RR-0456. Both rejection lines the plan cites are real: out-error-paths-p1#4 (BL-SFX2 GROUNDER.md, "a timed auto-retry is new infrastructure (RR-0392)") and p2#2 (QUESTIONS-RULED Q8.4 a, "a bounded wait is a new timer beyond RR-0392"). The "new waiting copy" rejection (out-ux-p1#3) is respected, because the plan reuses the existing could-not-load text and adds no content key.
- ADR 005 needs no edit, and the RR-0456 ruling is quoted at the right lines (MD:2362-2363).

## rg#1 MED: the zero retry also changes the lot-map page, which the plan's Limits section does not say
Plan: section 6 Limits ("Phone only"; "The semi page's own 'Try again in 0s' ... is unchanged. RR-0456 named the search"); section 8 choice 2 ("Search only").
Evidence: mobile/app/(app)/parcel-tool/disambiguate.tsx:27 has `useParcelSearch(searchQueryArg(query))`, next to index.tsx:61. Both pages call the one hook that step 1 changes. The lot-map page has its own rate_limited_zero case (lotMapPage.behaviour.test.tsx:63 and the fixture), which mocks the hook, so no test notices.
Fix: add one line to section 6 and to choice 2(a): "useParcelSearch serves the search page and the lot-map page (disambiguate.tsx:27); both retry a zero once." Say that is intended, or name the split.

## rg#2 LOW: step 1's code comment and the standing 429 comment now disagree
Plan: section 3, step 1 (the new function with its doc comment).
Evidence: useParcelLookup.ts:60-61 reads "429 (burning retries against the rate-limit compounds the throttle)" above shouldRetryParcelLookup, blamed to 628654586. After this change the search hook does retry a 429 (at zero).
Fix: add a half-line to the :60-61 comment ("except a zero-second wait, once, in shouldRetryParcelSearch, task-457"), or state in the plan that the comment stays true because it governs only shouldRetryParcelLookup. The rationale for the carve-out is that a zero wait is not a throttle the person must sit out. Put that in the new doc comment, since RR-0456 gives no reason.

## rg#3 LOW: "no spec note owed" is probably too strong
Plan: section 7 ("No spec note is owed. The Spec 99 note at :555 stays true").
Evidence: docs/specs/03-mobile/99_mobile_state_architecture.md:555 (task-450's dated note) says "the semi question page reads no data with a parcel id as loading, never as a redirect ... states are derived from stable signals, not from isFetching". The note stays literally true. But a loading page now becomes an error after 60 s through a page timer outside buildSemiQuestionSituation. The semiQuestion.ts header table (:5-6, "loading: the lookup is in flight") and the semi-question.tsx header (:12-14, a failed fetch shows the built error) also stop being a complete account.
Fix: add one dated sentence beside :555, in the same dated-note form task-450 used, and extend the semiQuestion.ts header. Task 450's V5 and Q8.4(a) put the loading rule in the pure helper, so say in the note that the limit is the page's timer and not part of the situation.

## rg#4 LOW: the retry-once count is a code literal in a repo where retry counts are slice data
Plan: section 3, step 1 (`return failureCount === 0`).
Evidence: useParcelLookup.ts:54-57 (FIX.TUNE, task-378) reads the retry count and stale times from the slice (`lookup_retry_max: 3` in mobile_parcel_search.json:8). RR-0456 says "once", so the literal 0 is the ruling, not a tunable.
Fix: add a sentence to the plan that "once" is the ruling and is intentionally not a setting, which also answers the RR-0392 "no new setting" line.

## rg#5 LOW: the 1 s gap and a lost connection (UNVERIFIED)
Plan: section 3, step 2 ("During the retry ... isFetching is true. The person sees the spinner").
Evidence: reading only. The default networkMode is 'online' (the plan itself cites retryer.ts:53-54 for the paused first fetch). If the phone goes offline during the 1 s gap, the retry will most likely pause (fetchStatus 'paused', so isFetching false). The search page would then show no error and no data, which is the same dead state task-450 fixed on the semi page. This applies to 500 retries today and is not new, but T5 and T6 do not cover it.
Fix: say in section 6 that this offline-during-retry case is pre-existing and not covered, or drop the claim "the person sees the spinner" to "while online".

## rg#6 NIT: the Try again button can cancel an in-flight slow fetch
Plan: section 3, step 3 (retry: `setWaitError(null); void refetch();`).
Evidence: when the timer fires on a fetch that is slow but running (no offline pause), Try again calls refetch(), which by TanStack default cancels and restarts it. The plan only discusses the offline case ("costs nothing").
Fix: one clause in section 6: "if the first fetch was still running, Try again restarts it".

## Other open work
No unlanded task card touches useParcelLookup.ts. Cards that list semi-question.tsx or semiQuestionPage.behaviour.test.tsx are closed cards (319, 360, 364, 381 and others). The one open overlap is task-452, and the plan's section 5 handles it correctly: 452 edits the mock at :35 and 457 adds cases after :248, so they do not clash. The unmerged branches listed (semi-o4-b2, mf47-checkout and others) were not checked.

STATUS: 6 findings (0 CRITICAL, 0 HIGH, 1 MED, 4 LOW, 1 NIT); the plan keeps the old 429 guard, its locks and the task-450 pins green, and the one real gap is that the lot-map page also gets the zero retry and the plan does not say so.
