# Seat: integration: task-457 plan (PLAN-457-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board, branch wf2/board, head 43e4d04b6. The plan says it was read at e192b5e3e; the card text I read is PLAN-457-v1. Code was read in ~/Buildo-wt-gate375 at a12d535f5. Files read:
- Card task-457 and task-452's card (PLAN-452-v2).
- MD:2360-2363 (RR-0456).
- mobile: semi-question.tsx, semiQuestion.ts, useParcelLookup.ts, errors.ts, apiClient.ts, parcelSearchMatch.ts, SemiQuestionBinding.tsx, SearchBinding.tsx, queryClient.ts, useParcelPageHooks.ts.
- Tests: semiQuestionPage.behaviour, useParcelLookup.test, useAnswerParcelLookup.hook, semiQuestionScreens.golden.
- Library: node_modules/@tanstack/query-core 5.100.6 retryer.ts and query.ts.
- scripts/surfaces/_schema/bindings.json, surface-conformance.logic.test.ts:120-126, the semi descriptor, the generated semi slice, error-mapping.ts, the lookup route.
- Nothing was run.

## Checked and clean
- RR-0456 text. MD:2362 is the verbatim "Q4 add a limit Q5 retry once auto at zero". MD:2363 is as the plan quotes it, including the orchestrator-reading sentence.
- Retry count. retryer.ts:170-187 calls `retry(failureCount, error)` before `failureCount++`, so the first failure sees 0 and the second sees 1. `shouldRetryParcelSearch(0, RateLimitError(0))` is true. The second zero 429 gets false and rejects with the error.
- Retry delay. The default is `Math.min(1000 * 2 ** failureCount, 30000)` (retryer.ts:49-51), so 1000 ms on the first retry. queryClient.ts:55-62 sets no retryDelay and no networkMode, and useParcelSearch sets none either.
- During the retry the query error stays null and the fetch status stays 'fetching'. `onFail` only records the failure (retryer.ts:190).
- Paused offline query. `canFetch('online')` reads `onlineManager.isOnline()` (retryer.ts:53-57). query.ts:722 and :641 set fetchStatus 'paused'. isFetching is false, data is undefined and error is null, as the plan says. onlineManager is wired to NetInfo (queryClient.ts:21-25).
- Existing wait behaviour. `semiQuestion.ts:72-76` reads "no data with an id" as loading. The plan's reading of today's page is correct.
- Error path. NetworkError (errors.ts:41-47) takes `cause: unknown`. `classifyParcelSearchError` (parcelSearchMatch.ts:298-302) gives unexpected=true, rateLimited=false, entitlement=false. `flagsOf` (SemiQuestionBinding.tsx:61-73) then gives plain_error=true. The generated slice holds the text "Couldn’t reach the lot service…" at :24 and "Try again" at :29. The existing Continue-timeout pin (semiQuestionPage.behaviour.test.tsx:163-185) draws the same notice.
- Effect and handler against the existing paths.
  - `shown = submitError ?? error ?? (data ? null : waitError)` keeps submitError first, so the Continue error path is untouched.
  - The redirect effect (`useSettledRedirect`, useParcelPageHooks.ts:16-25) needs `target !== null`, and the error state has navigate=null. No replace fires on the timeout.
  - The timer effect is keyed on situation.state. Data arriving moves the state to ask or redirect, which clears the timer.
  - Try again sets waitError to null, the state goes back to loading, and the effect starts a fresh 60 s.
  - The actions memo needs no new dependency, because setWaitError is stable.
- Mount-import rule. bindings.json:10 has `mount_internal: ["@/lib/", "@/components/surfaces/", "@/hooks/", "@/store/"]`. The C-2 check (surface-conformance.logic.test.ts:123) tests `spec.startsWith(p)`, so `@/lib/errors` passes and so does the existing `@/lib/semiQuestion`. No registration edit is needed.
- Cites matched: semi-question.tsx :21, :28, :31, :41-44, :47, :79. semiQuestion.ts :17, :18, :20, :74-77. useParcelLookup.ts :62-70, :84, :101-110, :106, :169. apiClient.ts :34 and :43-44 (the Retry-After parse, missing or NaN becomes 60). Descriptor :280 and :326-334 (continue_wait_ms 60000). Census twin at mobile-product.json:7398. The first describe in the semi test ends at :249, so inserting after :248 is right.
- Search-page cites: SearchBinding.tsx spinner and 429 line, SearchPageClient.tsx:7 "No fetch, no query cache".
- Callers. `shouldRetryParcelLookup` is used by useParcelLookup, useParcelEntitlement and useParcelSearch. Only :84 changes, so the other two are untouched. No source outside the hook calls useParcelSearch. The existing RateLimitError(0) pins (parcelSearchMatch.test.ts:395 and :406, surfaceRenderer.smoke :77, parcelScreens.golden :162) are all pure classify or render tests, so none breaks.
- Hook-test mocks. useAnswerParcelLookup.hook.test.tsx mocks `@/lib/apiClient` with only fetchWithAuth, and RateLimitError comes from `@/lib/errors`, so the `instanceof` in the new retry function is safe there. useParcelLookup.test.ts does not reach the new code unless T3 and T4 import it.
- Goldens. SEMI_CONTINUE_WAIT_MS and NetworkError add no content key, state or golden, so the pins 436 and 100 do not move.
- Clash with task-452 (PLAN-452-v2 card, files line at :43 and :230). The only shared file is semiQuestionPage.behaviour.test.tsx. 452 edits the useParcelLookup mock at :35 to add a useParcelEntitlement stub, and 457 adds cases after :248. T1 and T2 drive `mockHook`, not that stub, so there is no logic clash. If 452 lands first the mock gains a key and 457's cases still work. 452 does not list semi-question.tsx, only cites its :77-78 no-op pattern. 452 edits apiClient.ts :49-63, errors.ts and parcelSearchMatch.ts, none of which 457 edits. 452's classify change cannot alter NetworkError's class. 452's "59 phone suites" and 457's "no new suite" agree.

## in#1 LOW: Try again on a disabled query sends an unauthenticated request, and the plan says nothing about it
Plan: section 2, "With a disabled query (no access token, :106) the result is the same."
Evidence: useParcelLookup.ts:106 reads "enabled: !!parcelId && !!accessToken". TanStack's `refetch()` ignores `enabled`, so the new Try again button calls fetchWithAuth with no Authorization header (apiClient.ts:28-30 only adds it when a token exists). The page then shows the server's 401, or whatever error follows, through the existing error path. The statement is true for the wait but not for Try again.
Fix: add one line to section 6 saying that with no token Try again fires an unauthenticated lookup. This is the existing error-state behaviour, and no code change is needed.

## in#2 NIT: the error-mapping cite has no path, and the RR-0455 cite is vague
Plan: section 2 "error-mapping.ts:46-48, used by lookup route.ts:90"; section 1 "RR-0455 (1), MD:2350-ish".
Evidence:
- The file is src/features/leads/api/error-mapping.ts, where `rateLimited(remaining, retryAfterSec = 60)` sits at :45-48 with `'Retry-After': String(retryAfterSec)`.
- src/app/api/parcels/lookup/route.ts:90 is `if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);`. This is correct.
- MD:2348-2352 holds RR-0454, not RR-0455. I did not locate the RR-0455 line. UNVERIFIED.
Fix: write the full path for error-mapping and give an exact MD line for RR-0455.

## in#3 NIT: the plan's own wording on "the first fetch" should say the limit also covers an in-flight online fetch
Plan: section 6, "If the limit fires while a slow fetch is still running…".
Evidence: with default retries (lookup_retry_max 3, delays 1 s, 2 s and 4 s, no fetch timeout at apiClient.ts:34), an online lookup that keeps failing can pass 60 s. The timer then fires while `isFetching` is true, and the page shows the error. Try again calls `refetch()`, which cancels the in-flight fetch (cancelRefetch defaults to true). The plan's T2 covers late data but not this. It is harmless and matches the ruling "a limit on its wait".
Fix: optional. Add a sentence to section 6 saying so.

UNVERIFIED: the "58 suites / 866 tests" counts and the pin-stability projections (that is the reality-check seat's work). The jest behaviour of fake timers and onlineManager for T5 and T6 was read, not run. By reading, the onlineManager default is online, and focusManager returns true when there is no `document`.

STATUS: 3 findings (0 CRITICAL, 0 HIGH, 0 MED, 1 LOW, 2 NIT); the plan fits the real code. The library's retry-count and paused-query behaviour, the effect and the submitError and redirect paths, the notice that gets drawn and the mount-import rule all hold, and there is no clash with task-452.
