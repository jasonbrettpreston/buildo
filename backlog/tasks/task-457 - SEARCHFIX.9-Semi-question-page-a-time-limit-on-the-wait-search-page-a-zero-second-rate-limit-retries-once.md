---
id: TASK-457
title: >-
  SEARCHFIX.9 Semi question page: a time limit on the wait; search page: a
  zero-second rate limit retries once
status: RUNNING
assignee:
  - '@lane-BL-SFX7'
created_date: '2026-11-24T17:29:00Z'
updated_date: '2026-11-24T19:43:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-457/GROUNDER-PLAN.md
  - docs/reports/reviews/task-457/TRIAGE-PLAN.md
  - docs/reports/reviews/task-457/seat-integration-1.md
  - docs/reports/reviews/task-457/seat-reality-check-1.md
  - docs/reports/reviews/task-457/seat-regression-1.md
  - compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
  - compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
  - compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:eng-front docs/specs/00_engineering_standards.md
  - compliance:eng-shared docs/specs/00_engineering_standards.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
type: fix
ordinal: 151210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0456 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2362), operator, verbatim: "Q4 add a limit Q5 retry once auto at zero". (1) The semi question page opened with no connection waits on Searching with no end (task-450 V5, mobile/src/lib/semiQuestion.ts:74): add a time limit, then a could-not-load message with Try again. (2) After a search, a rate limit answer of zero seconds reads Try again in 0s and nothing retries (task-450 L3): retry the search once automatically at zero. Not planned yet; the length of the limit is for the plan grounder to rule from existing settings.

Files: mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/src/hooks/useParcelLookup.ts, mobile/src/lib/semiQuestion.ts, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/useParcelLookup.test.ts, mobile/__tests__/useAnswerParcelLookup.hook.test.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The semi question page stops waiting after the limit and shows a message with Try again
- [ ] #2 A zero-second rate limit retries the search once, and only once
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
Planner: Cairn-Plan-457
Plan id: PLAN-457-v1

Read at board head e192b5e3e (wf2/board). Nothing was run. The only change in the tree is task-452's card, which is staged.

## 1. Rules quoted first
- RR-0456, MD:2362, verbatim: "Q4 add a limit Q5 retry once auto at zero". MD:2363 ruled "(Q4) the semi question page gets a time limit on its wait. (Q5) a zero-second rate limit retries the search once automatically." The sentence after it, "both go on one new search card, since task 450 is closed", is the orchestrator's reading, not his words.
- Card task-457, Description: "the length of the limit is for the plan grounder to rule from existing settings". AC1 "stops waiting after the limit and shows a message with Try again". AC2 "retries the search once, and only once".
- RR-0392, MD:1976: "no other infrastructure is needed beyond this". So: no new setting, content key, surface or golden.
- RR-0456 replaces two task-450 rejections that rested on RR-0392: BL-SFX2/GROUNDER.md:200 "a timed auto-retry is new infrastructure (RR-0392)" and :217 "a bounded wait is a new timer beyond RR-0392". Both are now ruled for.
- RR-0429, MD:2203: "dated notes are kept short".
- RR-0460, MD:2380-2383: the phone tests run locally before a push. The full local run was 58 suites and 866 tests at a12d535f5.
- RR-0455 (1), MD:2358: "the web waits for its switch-on". The web search makes no requests today (SearchPageClient.tsx:7 "No fetch, no query cache"), so no web change is due.
- Plan protocol 3, plan-protocol.md:28-30: no new research, and the task count does not grow.

## 2. What exists and is reused
- The limit length: SEMI_CONTINUE_WAIT_MS, semiQuestion.ts:18. It reads slice config continue_wait_ms = 60000 (mobile_parcel_semi_question.json:5, bounds 1000-600000 at :8-11). That is the registered logic variable maxbld_page_continue_wait_ms (descriptor :326-334). It is already this page's wait limit for the same lookup.
- The could-not-load message and Try again are reused as they are. The flag is unexpected and plain_error (SemiQuestionBinding.tsx:61-73). The notice row "error" is in the generated slice at :86-113: text state.error "Couldn’t reach the lot service. Check your connection and try again." (:24) and the button retry.text "Try again" (:29), testID parcel-semi-retry. This is the same end as Continue's bounded wait, pinned at semiQuestionPage.behaviour.test.tsx:163-185. **No new content key.**
- The error class: NetworkError (errors.ts:41-47). classifyParcelSearchError marks it unexpected and not schema drift (parcelSearchMatch.ts:298-302), so it draws plain_error.
- Retry rules: shouldRetryParcelLookup (useParcelLookup.ts:62-70) and TanStack 5.100.6. In that version the retry gets the failures counted before this one (query-core retryer.ts:80, :176-179, :187), and the first retry waits retryDelay(0) = 1000 ms (:49-50).
- The search page's fetching state is the spinner (SearchBinding.tsx:86-87). The 429 text is SearchBinding.tsx:131-132.
- Mount imports: bindings.json:10 mount_internal allows "@/lib/".

## Settled by reading
**(1) Today's semi wait.**
- semi-question.tsx:28 reads useParcelLookup(id). useParcelLookup.ts:101-110 uses the default networkMode 'online', so offline the first fetch is paused (retryer.ts:53-54). It then reports no data, no error and isFetching false, and that never changes while offline.
- The retry setting (3 attempts) only applies after a failed attempt. fetchWithAuth (apiClient.ts:34) has no timeout.
- With a disabled query (no access token, :106) the result is the same.
- semiQuestion.ts:76 reads "no data with an id" as loading, so the page shows "Searching" with no end.
- This is a rare case, not the usual one: the report route opens this page only after the same query key has settled data (mobile/app/(app)/parcel-tool/[parcelId].tsx:27; gcTime is 24 h, mobile/src/lib/queryClient.ts:41), so the page normally opens with the question showing. The endless wait is a cold open with no cached lookup (a deep link or a restored route), an offline start or a hung request (fetchWithAuth has no timeout). The limit is a backstop for those cases (plan grounder, rc#1).
- What the page shows per state:
  - loading: "Searching"
  - ask: the question, three answers, Continue
  - error, rate limit: "Too many searches. Try again in {seconds}s.", no button
  - error, entitlement: the neutral notice, no button
  - error, unexpected: state.error with Try again (schema drift shows its own text, no button)
  - redirect: the route is replaced

**Candidates for the limit length:**
- (a) continue_wait_ms 60 s, semiQuestion.ts:18. Same page, same lookup, same error end. RECOMMENDED. Ruled (plan grounder, round 1): (a). It is already a registered variable with bounds 1000 to 600000 (scripts/seeds/logic_variables.json:10887); the others are a stale time, a typing delay and a count. The longest wait is 60 s and then a notice; only the person pressing Try again starts another.
- (b) lookup_stale_ms 60 s, useParcelLookup.ts:56. This is a staleness time on the search surface, not a wait.
- (c) debounce_ms 400 ms. A typing delay.
- (d) lookup_retry_max 3. A count, not a time.
- No new setting is needed.

**(2) The zero-second rate limit.**
- The wait comes from the Retry-After header, never the body (apiClient.ts:43-44). A missing or unreadable header becomes 60.
- Our server always sends 60: src/features/leads/api/error-mapping.ts:46-48, used by src/app/api/parcels/lookup/route.ts:90 (ADR 005). A zero only comes from another sender in between or from a future change.
- "Try again in 0s." is built from the content key search.ratelimit with seconds taken from errors.429.retryAfterSeconds (SearchBinding.tsx:131-132, :252). That value comes from parcelSearchMatch.ts:299.
- At zero today, :65 refuses every RateLimitError, so there is one attempt, then the notice with no button. Nothing fetches again until the query changes, the page remounts or the app regains focus.
- The smallest fix and its once-flag are in section 3, step 2.

## 3. The change, file by file, in build order
**1. mobile/src/hooks/useParcelLookup.ts**
- After :70, add:
  ```ts
  /** task-457 (RR-0456 Q5): the search retries a zero-second rate limit once, on the first failure only; everything else is shouldRetryParcelLookup. A zero-second wait is not a throttle the person must sit out, so the 429 guard at :60-61 stays for every other wait. Once is the ruling and not a setting (RR-0392). */
  export function shouldRetryParcelSearch(failureCount: number, err: unknown): boolean {
    if (err instanceof RateLimitError && err.retryAfterSeconds === 0) return failureCount === 0;
    return shouldRetryParcelLookup(failureCount, err);
  }
  ```
- At :84 (useParcelSearch), change `retry: shouldRetryParcelLookup` to `retry: shouldRetryParcelSearch`.
- The lookup (:108) and the entitlement read (:169) are unchanged.
- To turn it off, put the one word at :84 back.

**2. How the once-flag works**
- The flag is TanStack's failure count for one fetch. No state of our own is added.
- It resets with every new fetch: a new query, a remount or a refocus.
- During the retry, about 1 s, the query's error stays null and isFetching is true. While online the person sees the spinner and no "0s" notice (offline in that second the retry pauses and the page shows neither, as a 500 retry does today).
- If the retry is refused again (failure count 1), the hook returns false, the query errors with RateLimitError(0), and today's "Too many searches. Try again in 0s." shows. There is no further automatic retry.

**3. mobile/app/(app)/parcel-tool/semi-question.tsx**
- :21: also import SEMI_CONTINUE_WAIT_MS. Add `import { NetworkError } from '@/lib/errors';`.
- After :31: `const [waitError, setWaitError] = useState<unknown>(null);`
- :41-44: build the situation from `const shown = submitError ?? error ?? (data ? null : waitError);`. Pass `error: shown` and `schemaDrift: shown instanceof ParcelLookupSchemaError`, and add waitError to the dependencies.
- After :47: `useEffect(() => { if (situation.state !== 'loading') return; const t = setTimeout(() => setWaitError(new NetworkError('task-457: the semi page wait limit')), SEMI_CONTINUE_WAIT_MS); return () => clearTimeout(t); }, [situation.state]);`
- :79 retry: `if (submitError != null) setSubmitError(null); else { setWaitError(null); void refetch(); }`
- Old behaviour: "Searching" forever. New: after 60 s, the could-not-load notice with Try again. Try again clears the error, fetches again and starts a new 60 s.
- Data that arrives later replaces the error, because of the `data ? null :` part.

**4. mobile/src/lib/semiQuestion.ts:17.** Comment only: SEMI_CONTINUE_WAIT_MS "also bounds the page's opening wait (task-457, RR-0456)". The code at :74-77 is unchanged: the pure situation still reads no data as loading, and the page adds the limit.

**Not edited:** apiClient.ts, parcelSearchMatch.ts, index.tsx, SemiQuestionBinding.tsx, PageTableBinding.tsx, the content and descriptor files, the census, the goldens and the web files.

## 4. Tests first: red, then green
**AC1, semiQuestionPage.behaviour.test.tsx.** Add the cases inside the first describe, after :248. The mock line :35 is not touched.
- **T1** "task-457 AC1: opened with no connection, the page stops waiting after the limit and shows the could-not-load message with Try again; Try again fetches again and waits again".
  - Setup: fake timers, the mock with no data, not fetching and no error, parcel PCL-S1.
  - Advance SEMI_CONTINUE_WAIT_MS-1: "Searching" is shown and the error text is absent.
  - Advance 1 more: "Couldn’t reach the lot service. Check your connection and try again." and parcel-semi-retry are shown, "Searching" is absent, and mockReplace was not called.
  - Press retry: refetch is called once and "Searching" is back.
  - Red today because nothing ends the wait.
- **T2 (guard)** "task-457: data arriving after the limit opens the question".
  - After the limit, rerender with data(form(true)): the question title is shown and the error text is absent.
  - Green before and after. It turns red only if the `data ? null :` part is dropped.
- The existing :223 and :242 cases stay green: no timer is advanced in them, and an existing error still refetches.

**AC2, useParcelLookup.test.ts.** Add a new describe after :188.
- **T3** "task-457 AC2: shouldRetryParcelSearch":
  - (0, RateLimitError(0)) is true
  - (1, RateLimitError(0)) is false
  - (0, RateLimitError(30)) is false
  - (0, ApiError(500)) is true
  - (3, ApiError(500)) is false
  - Red: the export does not exist yet.
- **T4 (guard)** shouldRetryParcelLookup(0, RateLimitError(0)) stays false: the lookup and the entitlement read are unchanged.

**AC2, useAnswerParcelLookup.hook.test.tsx.** Add a describe "task-457 useParcelSearch under a real QueryClient", with fake timers and the query "26 Hurlingham Cres".
- **T5** The first fetch rejects RateLimitError(0) and the second resolves the empty payload.
  - Before advancing: the error is null and isFetching is true (no "0s" while retrying).
  - Advance 1000 ms: 2 fetches, data is set, the error is null.
  - Red today: 1 fetch, and the error is set.
- **T6** Every fetch rejects RateLimitError(0). Advance 60000 ms: exactly 2 fetches, and the error is a RateLimitError with retryAfterSeconds 0. Red today: 1 fetch.
- **T7 (guard)** RateLimitError(7): one fetch only.

**Counts.** No new test file: 58 suites, 866 + 7 = 873 tests at the a12d535f5 base. The lane records the measured totals. Proof follows RR-0460: a full local phone run before the push. The commit hook's related run does not reach phone tests (BL-SFX2/REPORT.md:21), so the red runs are kept as lane files.

## 5. Files line (proposed, word for word)
Files: mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/src/hooks/useParcelLookup.ts, mobile/src/lib/semiQuestion.ts, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/useParcelLookup.test.ts, mobile/__tests__/useAnswerParcelLookup.hook.test.tsx

**Goldens, strings and pins.** None move. No content key, surface, state or golden is added.
- S-sbind "17 surfaces, 436 strings" and S-screen "17 surfaces, 100 goldens" stay (surface-conformance.logic.test.ts:263).
- S-desc "examined 33 ... converted 17" stays (surface-validate.logic.test.ts:93).
- If 452 lands first, its moves stand alone: S-sbind 436 to 443, S-screen 100 to 102, S-desc 33/17 to 34/18, and 59 phone suites. 457 adds nothing to any of them in either order.

**Order against task-452.** Neither order is required.
- The only shared file is semiQuestionPage.behaviour.test.tsx: 452 edits the mock at :35, and 457 adds cases after :248, in a different hunk.
- 452's cite "semi-question.tsx:77-78" (no-op actions) shifts by about 10 lines if 457 lands first. It is a pattern cite in 452's plan text, not code.
- 452's files that 457 does not touch: index.tsx, parcelSearchMatch.ts, apiClient.ts, the 127 pages and the pins.
- task-462 shares no file.

## 6. Limits and failure modes
**Limits**
- Phone only.
- useParcelSearch serves two pages: the search page (index.tsx:61) and the lot-map page (disambiguate.tsx:27), which is the pick step of the same search under the same key. Both get the zero retry. That is the ruled search (RR-0456), not an extension. The lot-map page has its own 0s notice, and its tests mock the hook, so none of them sees the retry (plan grounder, rg#1).
- The semi page's own "Try again in 0s" (rate_limited, no button) is unchanged. RR-0456 named the search.
- The report lookup and the entitlement read keep "no retry on 429".
- No button is added to the 429 notice.
- The 1 s gap before the retry is TanStack's default. No setting is added.

**Failure modes, and how the build catches them**
- If the first failure is a 500 and the second is a zero 429, the 429 is not retried, because the failure count is already 1. "Once" still holds. T3 covers this.
- If the limit fires while a slow fetch is still running and the data then arrives, the page moves on (T2).
- With StrictMode or a remount, the cleanup clears the timer, so a stray error cannot appear after leaving the page.
- Try again while still offline: the query stays paused and the 60 s starts again. It is honest and costs nothing.
- If continue_wait_ms is retuned, both waits change together. That is intended, but see choice 1.
- Typecheck: NetworkError(cause) takes an argument, which is passed.

## 7. Dated notes owed (backlog CLI only; check `backlog task edit --help` for the append-notes option)
- task-450: "2026-11-24: V5 (open-ended semi wait) and L3 (0s, no retry) taken up by task-457 under RR-0456."
- task-457: implementation notes with the red and green evidence and the shas.
- No spec note is owed. The Spec 99 note at :555 stays true: the situation still reads no data as loading, and the limit is a timer, not a check on isFetching.

## 8. Open choices
1. **Descriptor and census text for continue_wait_ms.** Its why text (descriptor :280 and the census twin at mobile-product.json:7398) says "how long Continue waits for the answered lookup".
   - (a) Leave it. The value, bounds and name do not change, and the code comment says it.
   - (b) Add one dated sentence to both, then rerun --emit-descriptors and the three generated pages. That shares the 127 pages with 452, so 457 would go after 452.
   - Recommend (a): smallest change and no clash. Ruled (a) by the plan grounder: RR-0429 and RR-0450 (short notes, text only) and 124a :992 (nothing added that the card did not name); the descriptor and the generated pages stay untouched.
2. **Scope of the zero retry.** RR-0456 MD:2363 says "retries the search".
   - (a) Search only, meaning the one search hook, so the search page and the lot-map pick step both retry (this plan).
   - (b) Inside shouldRetryParcelLookup, so the report, the semi page and the entitlement read are covered too.
   - Recommend (a). It is what was ruled and is a one-word revert. Ruled (a) by the plan grounder, with no operator question: see the lot-map line in the Limits.
3. **The error used for the limit.**
   - (a) NetworkError.
   - (b) Export SemiContinueTimeoutError (semiQuestion.ts:20).
   - Both draw the same notice. Recommend (a): no new export. Ruled (a) by the plan grounder.

## 9. UNVERIFIED
- No tests or typecheck were run (brief rules). The test totals and pin stability are projections.
- That RN onlineManager reads online under jest (T5 and T6 need it) is from reading, not running.
- The backlog CLI's flag name for appending notes was not checked.
- I accidentally ran one read-only command with a `2>/dev/null` redirect (a grep for mount_internal). It wrote no file. One earlier `ls` was refused by the classifier and was re-run in a simpler form.

Plan review round 1: 7 folded, 0 task, 0 ruling, 0 wontfix, 10 pile; grounder docs/reports/reviews/task-457/GROUNDER-PLAN.md; triage docs/reports/reviews/task-457/TRIAGE-PLAN.md
rc#1 MED folded This is a rare case,
rg#1 MED folded useParcelSearch serv
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24 taken on the board at lane launch (lane BL-SFX7, worktree /Users/brettpreston_macmini/Buildo-wt-sfx7, branch wf2/inc1b-sfx7), RR-0240

2026-11-24 built per PLAN-457-v1 steps 1-4 (no deviation in code). Tests written first: T1, T2 (semiQuestionPage.behaviour), T3, T4 (useParcelLookup.test), T5-T7 (useAnswerParcelLookup.hook.test). Red (lane file red.out, npx jest on the three files from mobile/, RR-0460 local phone run; the pre-commit related run does not reach phone tests): 5 failed, 40 passed of 45; T5 red on error not null, T6 red on 1 fetch not 2, T3 red on the missing export, T1 and T2 red on no notice after the limit. Deviation in test only: T2 also asserts the notice after the limit before data lands, so it is red before the change, not green before and after as the plan said. Green (green.out): 3 suites, 45 of 45. Mobile typecheck (tsc --noEmit in mobile/) exit 0. Full local phone run owed before the push (RR-0460).
<!-- SECTION:NOTES:END -->
