# TRIAGE: r1-plan.txt (deepseek-reasoner, plan review of docs/reports/reviews/task-319/context-2026-11-19.md), lane BL-SEMI2
Every finding KEPT or REJECTED with an opened file:line. r1-plan.txt has no line numbers; findings are numbered here in its order.
Grounded by the lane (reads on this head 36bb28d4d): mobile/app/(app)/parcel-tool/[parcelId].tsx:21-31, src/lib/parcels/report-page.ts:23-26, src/lib/entitlements/index.ts:589-612, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json:2, MORNING-DECISIONS.md:1042.

| # | Sev | Finding (short) | Verdict | Reason (file:line) |
|---|---|---|---|---|
| 1 | CRITICAL | meter is client-attested; persist the answer instead | REJECTED | The brief fixes this design (BRIEF.md Goal (d); DELTA.md section 5: "A client that sends the flag early only gets itself counted"). The count still needs a PRODUCED report for the user's own lot (route.ts:164, :167). The owner-answer store stays at its later home (MORNING-DECISIONS.md:1042, RR-0264 "1 y"). |
| 2 | CRITICAL | D.9, D.10, owner store, report reads answer are dropped | REJECTED | Out of scope by operator ruling: "page, mock and link only in 1·B; the owner-input store stays at its later increment home" (MORNING-DECISIONS.md:1042); DELTA.md:15 names D.8 to D.10 as later homes (task-213, task-209). The brief limits stage 2 to the mock, the one change and the meter call (BRIEF.md Goal). |
| 3 | HIGH | `&semi=answered` vs "refuses semi with q": contradiction | REJECTED | The semi page reads the lookup by parcelId (semi-question.tsx:25 `useParcelLookup(id)`; useParcelLookup.ts:28-31 builds `parcelId=...`), so the call is `parcelId=P&semi=answered`; the `&` follows parcelId, not q. The test URL will be written exactly so. |
| 4 | HIGH | a failed Continue fetch gates the journey | REJECTED | The brief orders it: "a failed fetch at Continue shows the built error state and does not navigate" (BRIEF.md Goal (d)). |
| 5 | HIGH | setQueryData then a redirect loop back to the question | REJECTED | The report mount never re-asks when the route carries `semi` (`[parcelId].tsx:21-31`; `needsSemiQuestion(data, semi)`; the existing test "a `semi` param (answered) never asks again", semiQuestionPage.behaviour.test.tsx). The route string carries `semi=answered` (lotForm.ts:38-41). No marker on the payload is needed. |
| 6 | HIGH | route computed before the fetch; a null page in the fresh payload | REJECTED | The report screen owns its own null-page and error states from the cache entry; the route is the same report route either way (`[parcelId].tsx`). The count itself already ignores a null page (route.ts:164 not_produced). |
| 7 | HIGH | month boundary has no timezone | REJECTED | Not changed here: the window is the entitlement billing period read under the row lock (entitlements/index.ts:597-612, current_period_end and now() from the DB), BL-METER's existing rule. |
| 8 | HIGH | only one lens run | REJECTED | The brief orders one plan round in review mode and one output lens (BRIEF.md Inputs REVIEW; standing rule 12). |
| 9 | HIGH | mobile jest suites not run red then green | KEPT (partly) | The node-unit-test side (route cases and the design test on the committed props goldens) goes red then green through the real hook. The mobile jest files are written too, and the lane tries them by hand, targeted, once; if the guard refuses, they stay UNVERIFIED in the report. |
| 10 | HIGH | the word `answered` collides across route param and query | REJECTED | They are two namespaces of the same word by design: the report route param (lotForm.ts:38-41) and the API query to /api/parcels/lookup. The server never builds the app route. The existing test pins the route string. |
| 11 | HIGH | nothing tests the report reads the answer | REJECTED | D.10 is a later home (DELTA.md:15; MORNING-DECISIONS.md:1042). |
| 12 | MED | Not sure counts like Yes and No | REJECTED | RR-0278 counts a PRODUCED report for the lot, not an answer (MORNING-DECISIONS.md:1082-1084; route.ts:164-167). |
| 13 | MED | back label would say Close | REJECTED | The label is the content key back.label "Back to search" (content.json:2); the icon changes, the label already says Back. |
| 14 | MED | no accessibility state on the cards | KEPT (assertion only) | role radio and accessibilityState checked stay on the card Button (SemiQuestionBinding.tsx:77-80); the design test asserts both stay. The ring look is the approved mock. |
| 15 | MED | heading test is string theatre | KEPT | The main assertion is that the heading and the three cards are children of the same column node, which has no px and no max width of its own; the class check is secondary. |
| 16 | MED | dot geometry unasserted | KEPT | The classes carry the mock numbers (h-[22px] w-[22px] rounded-full border-2 border-report-field; checked border-[7px] border-report-ink) and the design test asserts them. |
| 17 | MED | 44 or 48 relaxation covers the search page | REJECTED | The rule lives in semiQuestionScreens.golden.test.ts (the semi page only); the search page has its own test file and keeps 44. |
| 18 | MED | semi golden never regenerated or checked | REJECTED | It is: semi-question-golden-capture --write then emit-mobile-surfaces --write, and --check in checks.out BEFORE and AFTER (BRIEF.md Known gates). The report will say which files moved. |
| 19 | MED | double press untested | KEPT | A behaviour case: two presses, one fetch, one replace. |
| 20 | MED | header out of the scroll view and the safe area | KEPT (assertion) | The screen View keeps `edges: { top: 'additive' }` and the header is its first child; the design test asserts both. Device behaviour stays UNVERIFIED (no device check, BRIEF.md limits). |
| 21 | MED | the error state loses the selection | REJECTED | The selection is page state (`useState`, semi-question.tsx:23) and survives an error; the case "failed Continue, Try again, the same card still checked" is added as a test. |
| 22 | MED | 403 shows the entitlement copy | REJECTED | No string changes (brief); the existing classes and copy stay; carried as UNVERIFIED in the report. |
| 23 | MED | descriptor blast radius unchecked | REJECTED | The generator checks run before and after (checks.out) and the report lists each moved file. |
| 24 | MED | built on an orchestrator reading | REJECTED | The brief says so and orders it flagged in the report (BRIEF.md Goal (b)). Written in the context file and will be in REPORT.md and the panel record. |
| 25 | MED | not_evaluated vs the semi lot | REJECTED | A semi lot with no evaluated option is uncounted by the operator's "1 b" (route.ts:161-162); the semi option's report line is D.10, later. |
| 26 | MED | replace removes the way back | REJECTED | By design (semi-question.tsx header comment: Continue REPLACES so Back never returns here). |
| 27 | MED | no rollback or detection for a false count | REJECTED | Observability is the log line (route.ts:177-196 `meter`, plus the new `semi_answered`); no DB work is in scope. |
| 28 | LOW | id claims not in write scope | REJECTED | The ids ledger is in the claimed scope (BRIEF.md Write scope). |
| 29 | LOW | shared harness file | REJECTED | DELTA.md section 3 puts the answered-semi case in parcel-lookup-gate.infra.test.ts. |
| 30 | LOW | the producer-null premise expires | KEPT | Read on this head: report-page.ts:23-26 returns null; recorded in the report with the head sha. |
| 31 | LOW | cache key and shape unasserted | KEPT | The behaviour test asserts setQueryData is called with ['parcel-lookup','PCL-S1'] and the parsed result. |
| 32 | LOW | gap-[14px] arbitrary | REJECTED | It is the mock's number: v8 `.card[role=radio]` padding-left 52 px, dot left 16 px, width 22 px (choose-lot.html CSS), so the text starts 14 px after the dot. |
| 33 | LOW | async push must never throw | KEPT | The action catches everything; the failed-fetch case tests the rejection. |
| 34 | LOW | flag on a clear lot silently accepted | REJECTED | A no-op is correct; refusing it would turn a lot whose data changed between mount and Continue into a 400. |
| 35 | NIT | step numbering, estimate | REJECTED | No effect. |

# TRIAGE r2: r2-output.txt (one lens: the meter counts exactly once and only for a produced report), on meter.diff
| # | Sev | Finding (short) | Verdict | Reason (file:line) |
|---|---|---|---|---|
| 1 | HIGH | Continue navigates on any 200, not only a produced report | REJECTED | Until 1.3 W lands the producer returns null (src/lib/parcels/report-page.ts:23-26), so `page` is always null today: a guard on `result.page` would block every Continue. The report screen owns its non-report states (`[parcelId].tsx`); the count itself needs a produced page (route.ts:164). |
| 2 | HIGH | no check that an answer is selected | REJECTED | Continue's onPress is null with nothing selected (SemiQuestionBinding.tsx continueButton; locked by 'Continue is enabled with nothing selected', semiQuestionScreens.golden.test.ts), so `push` cannot be emitted without an answer. |
| 3 | MED | no cancellation: Back during the fetch, then replace | KEPT | Fixed: a mounted ref; after the await the page returns without setQueryData or replace if it was left (semi-question.tsx continueToReport). |
| 4 | MED | the flag is a client claim | REJECTED | Accepted trust boundary by the brief (DELTA.md section 5: "A client that sends the flag early only gets itself counted"); keyed on the authenticated uid (route.ts:84, openReport uid), the reviewer confirms no cross-user effect. |
| 5 | MED | cache key may differ from the hook's | REJECTED | The hook's key is exactly ['parcel-lookup', parcelId] (useParcelLookup.ts:78); the behaviour test asserts the setQueryData key. |
| 6 | MED | setQueryData cosmetic: report refetches | REJECTED | staleTime is 60 s (useParcelLookup.ts:80), so the report mount reads the cache; the report never re-asks on a `semi` route (`[parcelId].tsx:21-31`). |
| 7 | MED | second hit on the detail bucket | REJECTED | Rate 30 per minute on parcelId (route.ts:LOOKUP_LIMIT_PER_MIN); the brief orders one more fetch and no new endpoint (rejected alternative, DELTA.md section 5). A 429 shows the built rate-limit notice. |
| 8 | LOW | no loading affordance during Continue; guard reset in finally | REJECTED | Adding a state would add a situation field and goldens beyond the mock; the guard resets only after the await and the page then navigates. |
| 9 | LOW | submitError sticky | REJECTED | Cleared by Try again, which is the only exit from the error state; the page navigates on success. |
| 10 | LOW | background refetch race | REJECTED | staleTime 60 s and no focus refetch inside the one-second window. |
| 11 | LOW | replace inside the try | KEPT | Fixed with finding 3: the try now wraps only the fetch. |
| 12 | LOW | no client tests | REJECTED | They exist (semiQuestionPage.behaviour.test.tsx: failed fetch, double press, cache key); UNVERIFIED because mobile jest was not run. |
| 13 | LOW | route test gaps (non-unsure, concurrent, dangling) | REJECTED | Non-unsure is an unchanged path; concurrency is the existing row lock locked by parcel-tool-meter.logic.test.ts T13; a dangling id is covered by the existing case (parcel null never reaches the meter). |
| 14-17 | NIT | log naming, one source, id guard, trim | REJECTED | No defect: redirect state covers an empty id; `semi=%20answered` refused is fine; log field is observability only. |
