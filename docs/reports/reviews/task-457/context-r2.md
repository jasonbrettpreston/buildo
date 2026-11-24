# Review context for task-457 (no plan id) written 2026-11-24 by backlog-brief.mjs (round 2)

## Task
task-457 SEARCHFIX.9 Semi question page: a time limit on the wait; search page: a zero-second rate limit retries once
status: RUNNING · milestone: m-1 · assignee: @lane-BL-SFX7 · labels: SEARCHFIX-LATER

## Description
Card opened 2026-11-24 by the orchestrator from RR-0456 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2362), operator, verbatim: "Q4 add a limit Q5 retry once auto at zero". (1) The semi question page opened with no connection waits on Searching with no end (task-450 V5, mobile/src/lib/semiQuestion.ts:74): add a time limit, then a could-not-load message with Try again. (2) After a search, a rate limit answer of zero seconds reads Try again in 0s and nothing retries (task-450 L3): retry the search once automatically at zero. Not planned yet; the length of the limit is for the plan grounder to rule from existing settings.

Files: mobile/app/(app)/parcel-tool/semi-question.tsx, mobile/src/hooks/useParcelLookup.ts, mobile/src/lib/semiQuestion.ts, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/useParcelLookup.test.ts, mobile/__tests__/useAnswerParcelLookup.hook.test.tsx

## Acceptance criteria
- #1 The semi question page stops waiting after the limit and shows a message with Try again
- #2 A zero-second rate limit retries the search once, and only once

## Implementation Plan
Planner: Cairn-Plan-457
Plan id: PLAN-457-v1

Read at board head e192b5e3e (wf2/board). Nothing was run. The only change in the tree is task-452's card, which is staged.

#### 1. Rules quoted first
- RR-0456, MD:2362, verbatim: "Q4 add a limit Q5 retry once auto at zero". MD:2363 ruled "(Q4) the semi question page gets a time limit on its wait. (Q5) a zero-second rate limit retries the search once automatically." The sentence after it, "both go on one new search card, since task 450 is closed", is the orchestrator's reading, not his words.
- Card task-457, Description: "the length of the limit is for the plan grounder to rule from existing settings". AC1 "stops waiting after the limit and shows a message with Try again". AC2 "retries the search once, and only once".
- RR-0392, MD:1976: "no other infrastructure is needed beyond this". So: no new setting, content key, surface or golden.
- RR-0456 replaces two task-450 rejections that rested on RR-0392: BL-SFX2/GROUNDER.md:200 "a timed auto-retry is new infrastructure (RR-0392)" and :217 "a bounded wait is a new timer beyond RR-0392". Both are now ruled for.
- RR-0429, MD:2203: "dated notes are kept short".
- RR-0460, MD:2380-2383: the phone tests run locally before a push. The full local run was 58 suites and 866 tests at a12d535f5.
- RR-0455 (1), MD:2358: "the web waits for its switch-on". The web search makes no requests today (SearchPageClient.tsx:7 "No fetch, no query cache"), so no web change is due.
- Plan protocol 3, plan-protocol.md:28-30: no new research, and the task count does not grow.

#### 2. What exists and is reused
- The limit length: SEMI_CONTINUE_WAIT_MS, semiQuestion.ts:18. It reads slice config continue_wait_ms = 60000 (mobile_parcel_semi_question.json:5, bounds 1000-600000 at :8-11). That is the registered logic variable maxbld_page_continue_wait_ms (descriptor :326-334). It is already this page's wait limit for the same lookup.
- The could-not-load message and Try again are reused as they are. The flag is unexpected and plain_error (SemiQuestionBinding.tsx:61-73). The notice row "error" is in the generated slice at :86-113: text state.error "Couldn’t reach the lot service. Check your connection and try again." (:24) and the button retry.text "Try again" (:29), testID parcel-semi-retry. This is the same end as Continue's bounded wait, pinned at semiQuestionPage.behaviour.test.tsx:163-185. **No new content key.**
- The error class: NetworkError (errors.ts:41-47). classifyParcelSearchError marks it unexpected and not schema drift (parcelSearchMatch.ts:298-302), so it draws plain_error.
- Retry rules: shouldRetryParcelLookup (useParcelLookup.ts:62-70) and TanStack 5.100.6. In that version the retry gets the failures counted before this one (query-core retryer.ts:80, :176-179, :187), and the first retry waits retryDelay(0) = 1000 ms (:49-50).
- The search page's fetching state is the spinner (SearchBinding.tsx:86-87). The 429 text is SearchBinding.tsx:131-132.
- Mount imports: bindings.json:10 mount_internal allows "@/lib/".

#### Settled by reading
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

#### 3. The change, file by file, in build order
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

#### 4. Tests first: red, then green
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

#### 5. Files line (proposed, word for word)
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

#### 6. Limits and failure modes
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

#### 7. Dated notes owed (backlog CLI only; check `backlog task edit --help` for the append-notes option)
- task-450: "2026-11-24: V5 (open-ended semi wait) and L3 (0s, no retry) taken up by task-457 under RR-0456."
- task-457: implementation notes with the red and green evidence and the shas.
- No spec note is owed. The Spec 99 note at :555 stays true: the situation still reads no data as loading, and the limit is a timer, not a check on isFetching.

#### 8. Open choices
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

#### 9. UNVERIFIED
- No tests or typecheck were run (brief rules). The test totals and pin stability are projections.
- That RN onlineManager reads online under jest (T5 and T6 need it) is from reading, not running.
- The backlog CLI's flag name for appending notes was not checked.
- I accidentally ran one read-only command with a `2>/dev/null` redirect (a grep for mount_internal). It wrote no file. One earlier `ls` was refused by the classifier and was re-run in a simpler form.

Plan review round 1: 7 folded, 0 task, 0 ruling, 0 wontfix, 10 pile; grounder docs/reports/reviews/task-457/GROUNDER-PLAN.md; triage docs/reports/reviews/task-457/TRIAGE-PLAN.md
rc#1 MED folded This is a rare case,
rg#1 MED folded useParcelSearch serv

## Implementation Notes
2026-11-24 taken on the board at lane launch (lane BL-SFX7, worktree /Users/brettpreston_macmini/Buildo-wt-sfx7, branch wf2/inc1b-sfx7), RR-0240

## References
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

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
- RR-0406 McFixReborn label on the tasks that process covers
- RR-0407 next push as soon as possible; does not wait for task-442
- RR-0408 McFixReborn in merged groups by shared files; map validated before anything proceeds
- RR-0409 McFixReborn map: the three hand-written schema files are reviewed; a plan is needed for the oversized files
- RR-0410 McFixReborn map: the script with no rule-list row is not reviewed
- RR-0411 McFixReborn label stays on task 349; merged groups move forward
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows
- RR-0414 task 442 re-makes only its three changed lists; five McFixReborn map decisions
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0415 McFixReborn group reviews outside a lane: liked, to be grounded; tasks 442 and 367 to be running
- RR-0416 Operator pre-approves removing lane work folders to free disk space
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions
- RR-0418 Rule lists per task are cut down by turning lists off in the table
- RR-0419 The rule-list table edit is approved as one task
- RR-0421 Rule-list decisions 1 to 4: all four recommendations approved
- RR-0420 Review-cost problems join the rule-list plan: plan, ground, then recommend
- RR-0422 Review-cost task: Minimum package, decision 1 stays at a
- RR-0423 Review-cost task: two small fixes added, plan approved, move forward
- RR-0424 Task 448 also corrects the close check's refusal-message sentence
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0425 Push order: 442 and 367 first, task 448 later
- RR-0426 Task 448: stale launch-script comment fixed; by-law pre-registrations unchanged
- RR-0427 DONE record moves for the pushed tasks, as one batch
- RR-0428 The seven pushed tasks stay BUILT; no review for the DONE word
- RR-0429 Dated notes are kept short — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0430 The six unlabelled running tasks join McFixReborn
- RR-0431 McFixReborn: each set of files reviewed once, output only
- RR-0432 McFixReborn: fold the six first; progress in the orchestrator's table
- RR-0433 The six fold as they are; the group review is their one output review
- RR-0434 McFixReborn proceeds as per the status table
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0435 The orchestrator may do the merge edits and the test fix for the six
- RR-0436 Option 1 confirmed for the remaining folds
- RR-0437 Task 388 left out of the folds; nine paperwork notes approved
- RR-0438 Task 349 D3: the public web report page is wired at launch
- RR-0439 McFixReborn review calls: 120,000 characters; each list reads only its own files
- RR-0440 plan to drop the planning and process lists from reviews
- RR-0441 McFixReborn reading seats: reality check and integration run, code review dropped
- RR-0442 the search opens a lot on an exact match
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses
- RR-0444 fold the McFixReborn findings
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks
- RR-0448 the search-fix cards are created as 8 merged tasks
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles — "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325)
- RR-0452 tooling plan approved; the three questions are not added
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C — "1 y 2 y 3 y 4 I dont understand this question 5. is this after a search - provide context" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2357)
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once — "Q4 add a limit Q5 retry once auto at zero" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2362)
- RR-0149 Increment 1·A tooling location
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests — "Approved. Can you also send out an explorer agent so we can improve the quality of the phone checks for ios and andriod in a fast and efficient manner? Let's make sure we are doing this right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2382)
- RR-0461 Card 461 clean seat report: run a fresh integration seat
- RR-0462 Phone checks quick plan approved; a dead card carries only the label dead
- RR-0463 Task 458 haptic feedback moves to Increment 1C
- RR-0464 Task 460: no separate security review at output; the validating grounder reads the sensitive files
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0429 Dated notes are kept short (names RR-0429) — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles (names RR-0450) — "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325)
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C (names RR-0455) — "1 y 2 y 3 y 4 I dont understand this question 5. is this after a search - provide context" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2357)
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once (names RR-0456) — "Q4 add a limit Q5 retry once auto at zero" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2362)
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests (names RR-0460) — "Approved. Can you also send out an explorer agent so we can improve the quality of the phone checks for ios and andriod in a fast and efficient manner? Let's make sure we are doing this right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2382)

## Prior reviews and lane reports
### task-457 (this task)
- docs/reports/reviews/task-457/FINDINGS-PLAN.md
- docs/reports/reviews/task-457/FOLD-CHECK.md
- docs/reports/reviews/task-457/GROUNDER-PLAN.md
- docs/reports/reviews/task-457/QUESTIONS-RULED.md
- docs/reports/reviews/task-457/TRIAGE-PLAN.md
- docs/reports/reviews/task-457/seat-integration-1.md
- docs/reports/reviews/task-457/seat-reality-check-1.md
- docs/reports/reviews/task-457/seat-regression-1.md

## Dependencies
- (none)
