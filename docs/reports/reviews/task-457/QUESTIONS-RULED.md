# task-457 plan panel, round 1: questions ruled by the plan grounder (Cairn-Ground-P457)

Authority (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md), read at the lines:
- RR-0456 (:2360-2363). Operator (:2362), verbatim: "Q4 add a limit Q5 retry once auto at zero". Ruled (:2363): "(Q4) the semi question page gets a time limit on its wait. (Q5) a zero-second rate limit retries the search once automatically." The sentence after it, "Orchestrator's reading, not his words: both go on one new search card, since task 450 is closed", is not a ruling and is not used. The put-to (:2361) frames Q5 as "after a search the server's rate limit can answer with a wait of zero seconds".
- RR-0455 (:2355-2358): items 4 and 5 "NOT ruled: he asks for context"; the ruled line is :2358.
- RR-0392 (:1975): "I don't think we need any other infastrcuture beyond this". RR-0429 (:2202): "Keep notes short." RR-0450 (:2325): "We just want to turn off or change the text etc?", ruled (:2326): switches or text changes only. RR-0460 (:2380-2383): the phone tests run locally first, then the Mobile CI run after the push.
- His standing words: "yes let keep this simple - but it cant go on forever" (:1811); "you are probaley rebuilding stuff that already exists you do this all the time" (:1522); "this should be simple" (:2372); "It has to be simple and easy turning stuff off if at all possible ... No more mistakes or surprises" (docs/reports/reviews/task-460/QUESTIONS-RULED.md:11).
- 124a_step_standard_policy_appendix.md:992 (R-IZ): "adds no scope its ruling did not name" (the card DoD #8 repeats the sentence "no change adds a tool, field or rule its card or ruling did not name").

Basis: board head 5faead889 (wf2/board); the code read in the board worktree. No test run, nothing written.

## Operator questions: none
The rules settle every matter below.

## (a) The length of the limit: ruled SEMI_CONTINUE_WAIT_MS, continue_wait_ms 60000
- The card (Description): "the length of the limit is for the plan grounder to rule from existing settings". Candidate (a) is a setting that exists, for this same page and this same lookup: semiQuestion.ts:18 reads continue_wait_ms from the generated slice; it is the registered logic variable maxbld_page_continue_wait_ms (scripts/seeds/logic_variables.json:10887), bounds 1000 to 600000, on_invalid clamp. Its description (:10892) says "how long the semi question page Continue waits for the answered lookup before the page ends in its error state" and calls it "an open operator timeframe", so the page already ends in the same notice at the same number.
- The others are not waits: lookup_stale_ms 60 s is a staleness time (useParcelLookup.ts:57 reads it), debounce_ms 400 is a typing delay, lookup_retry_max 3 is a count (mobile_parcel_search.json:5-9).
- A new setting is excluded by RR-0392 and 124a :992 (nothing the card did not name). Retuning the one variable moves both waits together, which is intended.
- "It cant go on forever" (:1811): the wait is 60 s and then a notice; only the person pressing Try again starts another.
- Ruling: (a), no operator question. The plan keeps its RECOMMENDED word and the fold adds the ruling to it.

## (b) The three open choices of the plan
1. Descriptor and census text for continue_wait_ms: ruled (a), leave it. Reasons: RR-0429 (short notes), RR-0450 (text or switches only) and 124a :992. A dated sentence would touch the descriptor, the census twin (mobile-product.json:7398) and the generated pages, files the card does not name, and would put 457 after 452. The code comment at semiQuestion.ts:17 carries the fact.
2. Scope of the zero retry: ruled (a), the search only, meaning the one search hook useParcelSearch. RR-0456 says "retries the search" and the put-to says "after a search". The semi page lookup and the report lookup are a different hook (useParcelLookup) and keep "no retry on 429"; their 0s notice is named in plan section 6 as unchanged, a one-word extension later if he asks. This also rules plan-ux#3 and plan-error-paths#4.
3. The error class: ruled (a), NetworkError. Both draw the same notice and no new export is added (RR-0392). I read semiQuestion.ts:69 and parcelSearchMatch.ts:301: a NetworkError is classified unexpected, not schema drift, so it draws plain_error and Try again.

## (c) rg#1: the lot-map page also gets the zero retry
Ruled: inside "retries the search" of RR-0456, no operator question. useParcelSearch serves index.tsx:61 and disambiguate.tsx:27. The lot-map page is the pick step of the same search, under the same key ['parcel-search', q], so a person who searched and hit a zero reaches the retry whichever page the result is on. Excluding it would need a second function or a flag, which is more than the card names. The lot-map page keeps its own 0s notice for the refused second answer, and its tests mock the hook. The fold adds the sentence to the Limits and to choice 2 (a).

## (d) rc#1: say the endless wait is rare
Folded. parcel-tool/[parcelId].tsx:27 redirects to the semi page only after the same key has settled data, and queryClient.ts:41 keeps it 24 h, so the page normally opens with the question. The endless wait is a cold open with no cached lookup, an offline start or a hung request (fetchWithAuth has no timeout); the limit is a backstop. The seat said the offline banner shows; I checked and it does not on the parcel-tool pages (OfflineBanner is in settings, index, map and flight-board only), so the fold does not say it.

## (e) rg#3: a dated spec note beside Spec 99 :555
Not owed; the code comment suffices. The :555 note says the page reads no data with a parcel id as loading, and that states come from stable signals, not from isFetching. After the card it still does: buildSemiQuestionSituation is unchanged and a page timer is a stable signal. A spec edit would add a file to the Files line that the card did not name (124a :992, the "nothing added" row; RR-0429 keeps notes short). The record is the code comment at semiQuestion.ts:17 (plan step 4) and the one-line note on task-450 (plan section 7). The plan sentence "No spec note is owed" is left as it is.

## (f) Order against task-452, and dependency lines
- No dependency line is owed. The shared file is semiQuestionPage.behaviour.test.tsx; 452 edits the mock at :35 and 457 adds cases after :248, different hunks (the integration seat read both cards). 452 lists no file that 457 edits except that test file. The card keeps dependencies: [] and plan section 5 already says neither order is required and gives the number moves (59 suites if 452 lands first).
- task-462 shares no file with this card (its files are .husky/pre-push-checks.sh, the hooks-composition test, CLAUDE.md and Spec 98). If it lands first, the push gate runs the phone typecheck and tests; nothing changes in this card.
- For 452 (not this card): its risk 6 says 457 "may touch index.tsx"; the 457 plan does not. Re-read by anchor at 452's own grounding.

## The plan's UNVERIFIED items (section 9)
- Not settled by reading: the test totals and the pin stability (projections); that the phone online state reads online under jest (a red run that makes no second fetch shows it at once); the backlog CLI notes flag name.
- The accidental redirect in the plan author's grep wrote no file.
- Settled: the 58 suites and 866 tests are true at a12d535f5 (phone-full-a12d535f5.out); a12d535f5 is on origin (origin/wf1/mb-rulings).

## Files outside the Files line
None needed. The Files line of the card stands as written.
