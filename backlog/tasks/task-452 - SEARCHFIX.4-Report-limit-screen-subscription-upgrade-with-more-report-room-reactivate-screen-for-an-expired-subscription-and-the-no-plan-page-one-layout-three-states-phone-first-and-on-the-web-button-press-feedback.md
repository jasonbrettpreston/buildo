---
id: TASK-452
title: >-
  SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room),
  reactivate screen for an expired subscription, and the no-plan page: one
  layout, three states, phone first and on the web; button press feedback
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-24T17:03:00Z'
labels:
  - SEARCHFIX-PRIORITY
milestone: m-1
dependencies:
  - TASK-450
  - TASK-451
references:
  - docs/reports/reviews/task-452/GROUNDER-PLAN.md
  - docs/reports/reviews/task-452/TRIAGE-PLAN.md
  - docs/reports/reviews/task-452/seat-integration-1.md
  - docs/reports/reviews/task-452/seat-reality-check-1.md
  - docs/reports/reviews/task-452/seat-regression-1.md
type: build
ordinal: 150050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 5 (BUILD.REPORT-LIMIT) and 7 (FIX.PRESS-FEEDBACK) with amendment A2; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: a customer at their report limit sees a screen offering a subscription upgrade with more report room (objective G.6, doc-2:94; RR-0443, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283; RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290). A customer whose subscription has expired sees a reactivate screen (RR-0444). A signed-in customer with no plan sees the no-plan page (task-357, absorbed here by RR-0446, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302). One wall layout serves the three states, built phone first and also on the web, following how the other pages were built (RR-0445, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296). Last on the phone, primary buttons on the parcel pages get the haptic feedback the engineering standard asks for; the spring waits on the operator (RR-0454 item 5: is it a shared part of Increment 1·C?).

Findings folded: ST2, 2b, the O1 slot, Q14. Starts from the approved mocks (report-limit.html, small-pages-v8 no-plan.html) and existing components (the existing PaywallScreen is checked first for the reactivate state).

Orchestrator reading, to be grounded at the plan stage: the purchase itself happens on the web; the phone wall carries the line or link, not a checkout.

Must not: build a new plan or checkout flow; call expo-haptics directly; move the report goldens (wall copy lives in the wall surface's own content file, mobile_parcel_wall.content.json; the search content is not edited).

Runs after SEARCHFIX.2 and SEARCHFIX.3 (shared match file and the string pins). Corrects the BUILT mark on objective G.6 by a dated note. Dated note owed: task-320.

Files: mobile/src/lib/apiClient.ts, mobile/src/lib/errors.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/hooks/useWallState.ts, mobile/src/components/surfaces/WallBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/src/components/surfaces/SurfaceRenderer.tsx, mobile/app/(app)/parcel-tool/index.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/static-page.schema.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/converted-surfaces.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.content.json, mobile/src/generated/surfaces/mobile_parcel_wall.json, scripts/surfaces/wall-golden-capture.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md, .cursor/MCFRONTEND-QUEUE.md, mobile/__tests__/apiClient.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/wallScreens.golden.test.ts, mobile/__tests__/fixtures/wall.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_wall.goldens.json, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/static-page.logic.test.ts, src/tests/fixtures/surfaces/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A 403 keeps its code, limit and reset date; limit reached and subscription required are two error classes
- [ ] #2 At the limit, the search page and the report screen show the wall with the count, the reset date and the plan line (no top-up or upgrade control until the buying work, RR-0454 item 3); never the reactivate copy
- [ ] #3 An expired subscription shows the reactivate state
- [ ] #4 A signed-in customer with no plan sees the no-plan page in the app (narrowed by task-357's own text to user state 2; the person with no plan row at all waits on MF-49)
- [ ] #5 The web shows the same three states (waits on the operator: the web is unchanged by this card, QUESTIONS-RULED.md Q1)
- [ ] #6 Primary buttons give haptic feedback through the existing haptics wrapper (the spring waits on the operator, RR-0454 item 5)
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
Planner: Cairn-Plan-452
Plan id: PLAN-452-v1

Read-only. I ran no tests, hooks or generators and wrote no file. Cites were read at board head 9b709f475. For task-450 I also read its branch wf2/inc1b-sfx2 at de6d89d6f with `git diff`; it is built but not folded. Task-451 is read from its final plan in the working tree. MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. Round 1 (Cairn-Ground-P452, board head 0f8eca7a9; task-450 has since landed on the board): the three walls are one new page-table surface, mobile_parcel_wall, and not the search binding; the text this replaces was removed; every ruling is in docs/reports/reviews/task-452/QUESTIONS-RULED.md.

## 1. Rules quoted first
- RR-0443, MD:2283: "yes, they need a screen with a top up or a higher subscription". MD:2285: "(a) at the report limit the person gets a screen offering a top-up or a higher subscription (this is increment objective G.6 ... doc-2 ...:94)".
- RR-0444, MD:2290-2291: "(2b) The report-limit screen is built: "a subscription upgrade with more report room"; a user with an expired subscription gets a reactivate screen".
- RR-0445, MD:2296-2297: "we are mobie first ... but it works onthe web"; "built mobile first and also work on the web, by the same process". MD:2298 is the orchestrator's reading: ruling "a" (no-plan.html:292, App Store 3.1.1) means the purchase is on the web.
- RR-0446, MD:2302-2303: "02 Agrred add to the plan." This adds task-357, the no-plan page.
- RR-0442, MD:2276: "It should open on an exact match". This card changes no search outcome.
- RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this".
- RR-0454, MD:2352, operator: "1 no switch 2 yes 3 yes 4 yes 5 please explain - isnt this a shared component for the nxt 1c". Ruled: (3) at the report limit "Your plan is managed on the web." is enough for now, so there is no top-up or upgrade control until the buying work, on the phone or the web; (4) the way to sign up of RR-0312 waits for the buying work; (5) NOT ruled, the spring waits on the operator (RR-0454 item 5): he asks whether it is a shared part of Increment 1·C (milestone m-2).
- RR-0312, MD:1216-1217, operator: "b. with no plan - it needs to an error page that inludes a way to sign up"; the designed page is small-pages-v8 no-plan.html (MD:1217). task-357 AC3 reads: "I've set up my plan behaviour test: disabled while checking; active status goes to the search route; none shows the :287 line; Log out ends on sign-in"; the designed page lists Account and Log out (no-plan.html:266).
- MD:1476, operator: "Let the grounder resolve them all as long as the result is compliant"; the 2026-11-20 grounder ruling for task-357 is a screens row of static-page.json drawn by PageTableBinding.tsx, and this follows task-357's 2026-11-20 ruling.
- Std 1.3, docs/specs/00_engineering_standards.md:24: "Primary interactive cards and buttons must use Reanimated `withSpring` ... Critical state transitions ... must trigger a haptic".
- Grounder records:
  - GROUNDER-SEATS.md (g3), B :31-44. Its smallest fix: "carry the error code on ApiError ... :63 throw plus mobile/src/lib/errors.ts. Then parcelSearchMatch.ts:297 splits REPORT_LIMIT_REACHED from a plain 403".
  - GROUNDER-QUESTIONS.md:68, Q14: "Defect against the standard".
- Mocks: report-limit.html (v8), state 3 (app wall) and states 4-5 (web). Mock note A1: "the app says only "Your plan is managed on the web."". no-plan.html (v8), states 1-3.

## 2. What exists and is reused
- The server already sends a structured 403:
  - Limit: `REPORT_LIMIT_REACHED` with details {reportsLimit, resetsOn} (error-mapping.ts:38, route.ts:112); the cites error-mapping.ts:38 and :29 are the corrected lines.
  - No plan: `SUBSCRIPTION_REQUIRED` (error-mapping.ts:29, route.ts:73).
  - The body shape is {error:{code,message,details}} (envelope.ts:56-80).
- apiClient.ts:49-64 already parses the 403 body (for ACCOUNT_DELETED). This card extends that one block.
- The entitlement read useParcelEntitlement (useParcelLookup.ts:161-170) gives status (null = no plan; 'expired' = lapsed; index.ts:59-77) and resetsOnDisplay (the server's Toronto date, RR-0310). The search screen already reads it (index.tsx:51-58). The entitlement contract holds both the count (reportsLimit) and the date (resetsOnDisplay), so the wall binds both from the read.
- The words of the reactivate state are the existing `search.entitlement` sentence (content :13), copied into the wall's own content file; the search content is not edited. The tracked route exists: PARCEL_TAB_ROUTE.tracked (parcelSearchMatch.ts:254).
- Existing parts and actions:
  - Actions push and retry (SurfaceRenderer.tsx:111-146); open_help is not used (no help link on the wall).
  - The optional-action pattern: open_help? at :44 (sign_out follows it).
  - The page table: a `screens` row of static-page.json drawn by PageTableBinding.tsx (task-390); the semi page is its first screen, and SemiQuestionBinding.tsx:32-44 holds the closed lists and the class table the wall copies in shape.
  - The sibling precedent of a surface with its own descriptor, content, goldens and capture script: scripts/surfaces/semi-question-golden-capture.ts.
- authStore.signOut (mobile/src/store/authStore.ts:76). The haptics wrapper lightImpact, successNotification and errorNotification (mobile/src/lib/haptics.ts:6-27).
- PaywallScreen checked first, as the card asks. It does NOT serve this user:
  - It is the lead-gen paywall: prop leadViewsCount (PaywallScreen.tsx:29-31) and the lead-gen checkout useSubscribeCheckout.
  - The parcel product may not reference lead-gen concepts (parcel-tool/_layout.tsx:3-4, Spec 116 OD5).
  - So the reactivate state reuses the words of `search.entitlement` in the wall (FOLD-PLAN.md:80, the fallback).

## 3. The change, file by file, in build order
1. mobile/src/lib/errors.ts, after :22: two classes. `ReportLimitError extends ApiError` (status 403, `reportsLimit: number|null`, `resetsOn: string|null`) and `SubscriptionRequiredError extends ApiError` (403). Each stores its server code (`code`: 'REPORT_LIMIT_REACHED' or 'SUBSCRIPTION_REQUIRED'), status 403 and the message 'Forbidden'. Because both extend ApiError, every `instanceof ApiError && status===403` check still holds: the retry guard useParcelLookup.ts:66, the lot map and the semi page.
2. mobile/src/lib/apiClient.ts:51-63:
   - Read errObj.code. REPORT_LIMIT_REACHED throws ReportLimitError, with the details taken only when typed right (number, string), never coerced. SUBSCRIPTION_REQUIRED throws SubscriptionRequiredError.
   - The catch at :60-61 must rethrow `e instanceof ApiError` too, or the new errors are swallowed.
   - Re-export the two classes at :12.
   - Every other 403 stays ApiError(403,'Forbidden'). The lookup and lot-size 403s become the subclass (they are the only senders of SUBSCRIPTION_REQUIRED, error-mapping.ts:29); callers read only the status, so nothing else changes. lot-size's ENTRY_OFF 403 stays a plain ApiError.
3. mobile/src/lib/parcelSearchMatch.ts, appended after the last export; no existing line is edited, so no hunk of 450 is touched. New pure `searchWall(error, read)`, where read is 'pending', 'failed' or the answered entitlement ({status, reportsLimit, resetsOnDisplay}); it returns 'limit' | 'reactivate' | 'no_plan' | 'wait' | null:
   - Not a ReportLimitError or SubscriptionRequiredError (a plain ApiError 403, a 500, a 429, no error): null, so today's notice or lifecycle error stays.
   - ReportLimitError: 'wait' while the read is pending; 'limit' once the read answered with a numeric reportsLimit and a resetsOnDisplay (the wall shows only after the entitlement read has answered); null for a failed or incomplete read (today's behaviour).
   - SubscriptionRequiredError: 'wait' while pending; status null gives 'no_plan'; status 'expired' gives 'reactivate' (reactivate only for status expired); any other status or a failed read gives null (today's notice, the task-357 fallback).
   - buildSearchSituation, SearchSituation and ParcelSearchErrorClass are not edited: the classifier still says entitlement for any 403, so lotMap.ts:87, semiQuestion.ts:68 and the search goldens are untouched.
4. One new page-table surface, mobile_parcel_wall (its S id is claimed through the id ledger), drawn by a `screens.mobile_parcel_wall` row of scripts/surfaces/_schema/static-page.json through PageTableBinding.tsx, on the semi page precedent. This is the smallest design that passes the locks without weakening one: the orphan-key lock (scripts/surfaces/screen-checks.mjs:404, mobile/__tests__/parcelScreens.golden.test.ts:122-123) refuses content keys no golden uses, and the search surface's state list is full and a state may not repeat (screen-checks.mjs:264), so limit and no-plan strings cannot live in the search content. The surface has its own descriptor, content and five goldens, one per state, each name from the closed list used once: rate_limited = limit, unauthorized = reactivate, static = no plan, loading = checking, error = still no plan. It is mobile only (identity.platforms mobile). Files: the descriptor and content under scripts/surfaces/parcel_product/F01/surfaces/, the slice mobile/src/generated/surfaces/mobile_parcel_wall.json (emit-mobile-surfaces.mjs), the screens row, `sign_out` added to the closed `action` list of static-page.schema.json, scripts/surfaces/wall-golden-capture.ts (beside semi-question-golden-capture.ts), converted-surfaces.json (+1 surface, expected_count 33 to 34), bindings.json (the module and its two mounts, index.tsx and [parcelId].tsx), and the census entry mobile_parcel_wall.
5. 15 keys in mobile_parcel_wall.content.json, the mocks' words with curly apostrophes (report-limit.html state 3, no-plan.html states 1-3) and the reactivate sentence as it reads today:
   - Limit: wall.limit.title "You’ve used all {limit} reports"; wall.limit.reset "Your count resets on {date}."; wall.limit.opened "Lots you’ve opened this period still open."; wall.limit.stay "Your Tracked Lots stay."
   - Shared: wall.plan "Your plan is managed on the web."; wall.tracked "Go to Tracked Lots".
   - Reactivate: wall.reactivate "Your subscription doesn't include the parcel tool right now. This isn't a missing address — reactivate to search lots again."
   - No plan: wall.noplan.title "Welcome back"; .lead "This account has no active plan yet."; .same "It’s the same MaxBLD account."; .check "I’ve set up my plan"; .hint "Tap after your plan is active."; .checking "Checking your plan…"; .none "We couldn’t find a plan yet. Try again in a minute."; .logout "Log out".
   - Left out, each with its reason: "How are reports counted?" (the billing topic is a contact topic, not an answer, so there is no help link on the wall), Account (the Account page shows nothing, account.tsx:15), "Still stuck?" (an open_help link needs an argument the page table cannot carry).
6. mobile/src/components/surfaces/WallBinding.tsx (new, the SemiQuestionBinding shape): the closed lists WALL_FLAG_NAMES (limit, reactivate, no_plan, checking, none), WALL_VALUE_NAMES (route, recheck), WALL_VAR_PATHS (reportsLimit, resetsOnDisplay), WALL_CHOICES (empty) and WALL_CONTRACT (contract_parcels_entitlement); `wallProps(situation)` calls pageProps, and `wallData` supplies the entitlement values. The count and the date both come from the entitlement read, as sent (reportsLimit, and resetsOnDisplay the server's Toronto date, RR-0310); the 403's own limit and resetsOn are kept on ReportLimitError and never drawn. The two lines that carry a value are notice parts, the only row type that takes vars. Buttons: Go to Tracked Lots (action push, value route), I’ve set up my plan (action retry, value recheck, null while checking, busy flag checking) and Log out (action sign_out). Classes: wall Buttons use the semi class table (LOT_MAP_LAYOUT, min-h-[44px]); no new constants file.
7. mobile/src/components/surfaces/SurfaceRenderer.tsx: SurfaceActions (:34-45) gains optional `sign_out?: () => void` with a case in action() (:115-145); the `in` fence covers it as it covers open_help. Haptics: in renderNode (:157-159) a Button whose variant is 'default' or absent (an absent variant counts as default, the vendored default, button.tsx:50) wraps its onPress as `() => { lightImpact(); fn(); }`. fn is always a function (action() throws on an unknown name, :113). Nothing calls expo-haptics directly. The scope is the parcel pages, the only pages this renderer serves (bindings.json); a dated note on Std 1.3 names it. No spring: the spring waits on the operator (RR-0454 item 5).
8. mobile/src/hooks/useWallState.ts (new), used by both hosts so the search page and the report screen behave the same: it reads useParcelEntitlement, calls searchWall(error, read), keeps one `asked` flag (it only discloses the none line, FE-36) and builds the actions. push calls router.navigate for the Tracked tab (FE-51; router.navigate, never the search page's navigate, which records a recent search); retry refetches the read and the host's lookup; sign_out is `() => void useAuthStore.getState().signOut()`. Haptics on a recheck: successNotification when it finds an active plan, errorNotification when it finds none, once per press, from the settle handler and not an effect.
9. mobile/app/(app)/parcel-tool/index.tsx and mobile/app/(app)/parcel-tool/[parcelId].tsx each call useWallState(error) (the report screen reads `error` from useParcelLookup beside `data`); 'wait' draws the existing loading state; a wall replaces the search tree on the search page and goes to the host's wall prop on the report screen (step 10). The search binding, search content, search goldens and the mobile_parcel_search census entry are not edited, so the search goldens stay byte-identical (task-357 AC5).
10. mobile/src/components/surfaces/ReportPageHost.tsx:34-68: an optional `wall` prop. When it is set, the host renders `top` and then `<Renderer tree={wall.tree} content={wall.content} data={wall.data} actions={wall.actions}/>` in place of the lifecycle. These are existing tags only, so C-8m holds (surface-conformance.logic.test.ts:751).
11. The web is unchanged by this card, and waits on the operator (QUESTIONS-RULED.md Q1): no edit to src/components/surfaces/web/SearchBinding.tsx, src/lib/surfaces/maxbld-web.ts, SearchPageClient.tsx or [parcelId]/page.tsx. Reasons: the web search page and the web report route are not live (page.tsx:17-20 fails closed until MB-44), no page-table binding draws a screen on the web, and no buy target exists (RR-0454 item 3). The web keeps its one not-entitled notice, whose golden is unchanged.
12. The census, scripts/surfaces/_schema/census/mobile-product.json: a new entry mobile_parcel_wall appended (the mobile_parcel_search entry stays, so no hunk of 450 or 451 is edited), with a dated deviations row for the flag derivation (Spec 99 applies: derivation stays code, listed as the S-093 entry lists its derived names; the entitlement read picks the words and is never a gate, the server's 403 is). Then the descriptor is rewritten by `node scripts/violations/generate-surface-registry.mjs --emit-descriptors`, then the plain run (which writes docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md), then `--check`; the generator has no --write. consumer-registry --check runs too.
13. Fixtures and goldens: mobile/__tests__/fixtures/wall.situations.json (new) and the five goldens: rate_limited, unauthorized, static, loading and error. Order: wall-golden-capture.ts --write, emit-mobile-surfaces.mjs --write, surface-validate --check. mobile/__tests__/wallScreens.golden.test.ts (new, beside semiQuestionScreens.golden.test.ts) pins: every content key is used by a golden, the layout and 44 px walkers run on all five, and the strings equal the mock literals (no-plan.html:264, :265, :276, :287 and report-limit.html state 3).
14. The string pins, surface-validate.logic.test.ts and surface-conformance.logic.test.ts (projected only; the lane measures before and after, and recomputes after 451 lands: 450 moved 426 to 427, 451 moves 427 to 436): S-sbind 17 to 18 surfaces and 436 to 451 strings (+15); S-screen 17 to 18 surfaces and 100 to 105 goldens; S-desc examined 33 to 34 and converted 17 to 18; S-page one more screen. The web T7 lock of 70 (admin-media.golden.test.ts:38) does not move.

## 4. Tests first (red, then green)
The mobile unit tests are not run by the commit hook; they run in the full suite at the push station. The lane runs them by hand before each commit.
- AC1, fold :78 (ST2), mobile/__tests__/apiClient.test.ts, beside :132:
  - "403 REPORT_LIMIT_REACHED keeps code, limit and reset". Input: body {error:{code:'REPORT_LIMIT_REACHED',details:{reportsLimit:10,resetsOn:'2026-12-09T05:00:00.000Z'}}}. Expected: a ReportLimitError with code 'REPORT_LIMIT_REACHED', 10 and that ISO date, also instanceof ApiError, status 403.
  - "403 SUBSCRIPTION_REQUIRED" gives SubscriptionRequiredError with its code; bad details give reportsLimit null; the lot-size SUBSCRIPTION_REQUIRED is the subclass and its ENTRY_OFF stays ApiError.
  - Red today: only the REPORT_LIMIT, SUBSCRIPTION_REQUIRED and bad-details cases are red; ACCOUNT_DELETED and a generic 403 are kept locks, green before and after (apiClient.test.ts:113, :132).
- AC2 and AC3, mobile/__tests__/parcelSearchMatch.test.ts, a new describe "searchWall" appended: pending gives wait for either class; ReportLimitError with a numeric count and a date gives limit, with a failed or incomplete read gives null; SubscriptionRequiredError with null gives no_plan, with 'expired' gives reactivate, with 'active' or a failed read gives null; a plain ApiError 403, a 500, a 429 and no error give null.
- AC2 to AC4, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx (the search page; its lookup payloads carry `resolution`, as 450's Q19 needs). The mocks at :34-39 gain an error and an entitlement with isFetching and a refetch that returns a promise; the authStore mock at :25 becomes a function with a getState property (authStore mock gets a getState).
  - Limit with {reportsLimit:10, resetsOnDisplay:'9 Dec 2026', status:'active'} shows "You’ve used all 10 reports", "Your count resets on 9 Dec 2026." and "Your plan is managed on the web."; the miss copy and the old notice are absent; Go to Tracked Lots calls router.navigate with the tracked route and the recent searches stay empty.
  - Status 'expired' shows the reactivate words inside the wall, never the miss copy; 'active' with a SubscriptionRequiredError keeps today's notice (task-357 AC1).
  - Status null shows "Welcome back"; a press refetches the read and the lookup, shows "Checking your plan…" with the button disabled and busy while fetching; a settled null shows "We couldn’t find a plan yet. Try again in a minute." and calls errorNotification once; an active status calls successNotification once.
  - Log out calls signOut, and a store-level test shows signOut clears accessToken, the value the gate reads (task-357 AC3 asks that it ends on sign-in); one device check stays before close.
- Report screen: mobile/__tests__/reportPage.behaviour.test.tsx, the host with a wall prop renders the wall and Back and not states.lifecycle.error (red: the prop does not exist), and the limit wall there shows the count and the date from the entitlement read. The three report-mount tests mock useParcelEntitlement: reportScreen.gateStability.behaviour.test.tsx:22, reportScreen.mount.behaviour.test.tsx:33 and semiQuestionPage.behaviour.test.tsx:35 each give the mock a useParcelEntitlement stub, and gateStability is re-run because it pins hook stability.
- mobile/__tests__/wallScreens.golden.test.ts (new): the five goldens equal wallProps, every content key is used, the layout and 44 px walkers pass, the strings equal the mock literals, and a grep plant (task-357 AC4): no content value contains http, www, $ or maxbld.ca.
- AC6, mobile/__tests__/surfaceRenderer.smoke.test.tsx, a new describe "press feedback" (450's hunks at :41 and :76-82 and the 'unauthorized' lines :88-90 stay as they are):
  - With jest.mock('@/lib/haptics'), pressing a Button with variant 'default', and one report Button with no variant (ReportBinding), calls lightImpact once and then its action; a 'link' press calls none.
  - A host without sign_out cannot render the wall (the unknown-action fence).
  - No spring test: the spring waits on the operator (RR-0454 item 5).
- Before the suite runs the lane writes the self-skeptical checklist of Std 11 (docs/specs/00_engineering_standards.md:288) with PASS or FAIL per item.
- Fold A2 (FOLD-PLAN.md:226): one layout, three states is the three behaviour cases above.

## 5. Limits, and what could fail or surprise
Limits:
- No purchase and no checkout: there is no top-up or upgrade control until the buying work (RR-0454 item 3), and the way to sign up of RR-0312 waits for the buying work (RR-0454 item 4). No new route, setting or server change; the one new surface takes its state names from the closed list.
- The lead-detail page and the old permit route are untouched.
- The web is unchanged and waits on the operator (step 11).
- The semi page and the map page keep their own `state.entitlement` notice (semi content :14, map :23); a semi Continue that meters at the limit still says reactivate. That is piled, not built here (the card names the search page and the report screen).
- A person with no plan row at all sees the App A spinner and never reaches the wall (the app layout, _layout.tsx:239); that is MF-49 (task-357, user state 1), and AC4 is narrowed to state 2.
- An expired lead_gen plan with no parcel_tool row reads status null, so that person sees the no-plan page; no lead-gen concept is shown.
Risks:
1. If apiClient's catch block is not widened, the new classes are swallowed and come out as ApiError. The AC1 tests catch it.
2. A failed or late entitlement read: while it is pending the host shows the loading state; after it fails the wall is not drawn and today's notice or lifecycle error stays (a person at the limit then sees the old words; rare, accepted).
3. The recheck has no time bound: apiClient has no timeout for any read, so a hung read keeps the button busy; Log out stays available. Not built here.
4. The limit 403 needs a produced report and a parcel_tool holder at their allowance (route.ts:97-112); the earlier claim that the meter is off was wrong. The lane forces it with the in-memory test.
5. If signOut does not reset the gate's profile status, Log out may not end on sign-in. The store-level test and one device check cover it (UNVERIFIED).
6. The renderer haptic fires once on every default Button press, Select included (Std 1.3's neutral action); the recheck adds a second haptic at the settle, a different moment.

## 6. Who owns which hunk (450, then 451, then 452; re-read at the merge, edit by anchor text, not line)
- Task-450 has landed on the board (fold 0bd5f6004) and task-451 (plan final) lands first; this card edits no hunk either of them owns.
- parcelSearchMatch.ts: 450 owns deriveMatchType, hasHouseNumber, the `retryAfterSeconds == null` line, overCap and showMiss; 452 only appends searchWall after the last export. The search content, both SearchBindings, the web situations and the search fixtures are not edited by 452.
- static-page.json and static-page.schema.json: 450 edits the web_help row and the topic list (mailto wrong-lot); 452 appends a `screens` row and adds `sign_out` to the `action` list. Different hunks.
- Census mobile-product.json: 450 edits mobile_parcel_search, 451 the map entry; 452 appends mobile_parcel_wall. Whoever lands last re-runs the generator, so the two 127 files are regenerated on the last landing only.
- String pins: 450 moved 426 to 427 (landed), 451 moves 427 to 436, and 452 adds one surface (+15 strings, +5 goldens; projected only).
- surfaceRenderer.smoke.test.tsx: 450 owns :41 and :76-82; 452 adds a new describe; task-456 runs later. parcelScreens.golden.test.ts, daylightSearchPages.golden.test.ts and the search fixtures are 450's and are not edited here.
- parcelSearchScreen.behaviour.test.tsx: 450 edits the hit and list fixtures; 452 adds its mocks and cases after them.
- Files line: every path 452 edits is on the Files line above; no path is on two cards' hunks.

## 7. Dated notes and card notes owed (node_modules/.bin/backlog, never a hand edit)
- doc-2, by `backlog doc update doc-2 --content`, built from a fresh read with prior text kept: G.6 (:94) BUILT is corrected. The wall is built by task-452 on the phone only; the web is unchanged; there is no top-up or upgrade control until the buying work (RR-0454 item 3).
- task-320: `backlog task edit 320 --append-notes`, saying ST2 is closed. Read the notes first and append once.
- task-357: --append-notes, saying it was built under task-452, which user states reach the page (state 2 only), and the task-357 lines kept or changed: AC1 trigger kept as searchWall (a null status gives the page; 'expired' now gives the reactivate wall by RR-0444; an active status, a failed read and a plain 403 keep today's notice); AC2 three goldens kept as the static, loading and error goldens of the wall surface, with the Account and Still stuck links left out; AC3 kept, Account left out, Log out tested at the store; AC4 kept; AC5 kept (the search goldens are not edited; consumer-registry is run); AC6 close-out carried. The way to sign up of RR-0312 waits for the buying work (RR-0454 item 4) and stays open for the operator until MF-86, the price ids and MF-70/MF-49 exist.
- Spec 126 and the MF-49 row: a dated note each (the no-plan page built, the trigger rule; task-357 declaration site 5). Std 1.3: a dated note on Std 1.3 naming the haptic scope.
- task-452: --plan, the acceptance checks, and --append-notes with the evidence, RR-0454 and the rulings of QUESTIONS-RULED.md as verbatim dated rows; the spring and the piled semi and map notices are named there as SEARCHFIX-LATER cards to open after the operator's answer.

## 8. Open choices (all ruled in round 1; the words are in QUESTIONS-RULED.md)
8.1 Where the wall is drawn: ruled (b), a new page-table surface (step 4).
8.2 Goldens: ruled, five goldens in the new surface (steps 4 and 13).
8.3 Phone action row: ruled (a), "Your plan is managed on the web." (RR-0454 item 3).
8.4 Web buy button: ruled, none on the phone or the web until the buying work (RR-0454 item 3).
8.5 Web no-plan versus reactivate: ruled, the web is unchanged (step 11); it waits on the operator, QUESTIONS-RULED.md Q1.
8.6 Spring: ruled, haptics now; the spring waits on the operator (RR-0454 item 5), and QUESTIONS-RULED.md says what a shared spring part needs.
8.7 "How are reports counted?": ruled, left out.
8.8 Log out: ruled (a), the sign_out action (step 7).
8.9 Semi and map pages at the limit: ruled (a), left alone and piled.
8.11 The wall's date: ruled (a), the read's resetsOnDisplay; no fallback to the 403's resetsOn.
Waiting on the operator: Q1 (the web and its three screens) and Q2 (whether the no-plan page goes back to its own card), both in QUESTIONS-RULED.md.

## 9. UNVERIFIED
- Nothing was run by the planner or the grounder.
- jest-expo already mocks expo-haptics (node_modules/jest-expo/src/preset/moduleMocks/expoModules.js:270-274); the smoke test mocks the wrapper anyway.
- Whether the descriptor schema and SV-DESC accept the five state names with no other per-name rule, and which identity.route the wall surface names (index.tsx is the fallback); surface-validate --check shows both.
- Whether signOut ends on sign-in (the store test, then one device check).
- The exact string total and golden counts: projected only; the lane measures.
- Whether a notice part can carry the limit title and date; if the page table needs a `vars` key on `text` instead, the lane stops and brings it back (a new section kind needs a named reason and a ruling).

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/apiClient.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchMatch.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/WallBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/ReportPageHost.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/SurfaceRenderer.tsx

Plan review round 1: 97 folded, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/reviews/task-452/GROUNDER-PLAN.md; triage docs/reports/reviews/task-452/TRIAGE-PLAN.md
plan-compliance-five-words#1 HIGH folded is unchanged by this
plan-compliance-five-words#2 HIGH folded No spring: the sprin
plan-compliance-five-words#3 HIGH folded wall shows only afte
plan-compliance-five-words#4 MED folded narrowed by task-357
plan-compliance-five-words#5 MED folded the designed page li
plan-compliance-inc-S#1 HIGH folded No spring: the sprin
plan-compliance-inc-S#2 HIGH folded is unchanged by this
plan-compliance-inc-S#3 HIGH folded Each stores its serv
plan-compliance-inc-S#4 HIGH folded The count and the da
plan-compliance-inc-S#5 MED folded narrowed by task-357
plan-compliance-inc-S#6 MED folded the designed page li
plan-compliance-mobile-90#1 HIGH folded No spring: the sprin
plan-compliance-mobile-90#2 HIGH folded is unchanged by this
plan-compliance-mobile-90#3 HIGH folded wall shows only afte
plan-compliance-mobile-90#4 HIGH folded narrowed by task-357
plan-compliance-mobile-90#6 MED folded wall Buttons use the
plan-compliance-mobile-98#1 HIGH folded No spring: the sprin
plan-compliance-mobile-98#2 HIGH folded is unchanged by this
plan-compliance-mobile-98#3 MED folded wall shows only afte
plan-compliance-mobile-98#4 MED folded narrowed by task-357
plan-compliance-mobile-98#6 MED folded (reactivate only for
plan-compliance-mobile-99-p1#1 HIGH folded No spring: the sprin
plan-compliance-mobile-99-p1#2 HIGH folded is unchanged by this
plan-compliance-mobile-99-p1#3 HIGH folded wall shows only afte
plan-compliance-mobile-99-p1#5 MED folded a dated deviations r
plan-compliance-mobile-99-p1#7 MED folded narrowed by task-357
plan-compliance-mobile-99-p2#1 HIGH folded No spring: the sprin
plan-compliance-mobile-99-p2#2 HIGH folded is unchanged by this
plan-compliance-mobile-99-p2#3 HIGH folded is unchanged by this
plan-compliance-mobile-99-p2#4 MED folded wall shows only afte
plan-compliance-mobile-99-p2#5 MED folded narrowed by task-357
plan-compliance-mobile-99-p2#6 MED folded (projected only; the
plan-compliance-mobile-99-p2#7 MED folded Spec 99 applies: der
plan-compliance-ms-S#1 HIGH folded No spring: the sprin
plan-compliance-ms-S#2 HIGH folded is unchanged by this
plan-compliance-ms-S#3 HIGH folded wall shows only afte
plan-compliance-ms-S#4 MED folded narrowed by task-357
plan-compliance-ms-S#6 MED folded Each stores its serv
plan-compliance-ms-S#7 MED folded SEARCHFIX-LATER card
plan-compliance-plan-protocol#1 HIGH folded No spring: the sprin
plan-compliance-plan-protocol#2 HIGH folded is unchanged by this
plan-compliance-plan-protocol#4 MED folded wall shows only afte
plan-compliance-plan-protocol#5 MED folded (reactivate only for
plan-compliance-plan-protocol#7 MED folded narrowed by task-357
plan-compliance-surface-136#1 HIGH folded No spring: the sprin
plan-compliance-surface-136#2 HIGH folded is unchanged by this
plan-compliance-surface-136#3 HIGH folded wall shows only afte
plan-compliance-surface-136#4 MED folded One new page-table s
plan-compliance-surface-136#5 MED folded five goldens: rate_l
plan-compliance-surface-136#6 MED folded router.navigate, nev
plan-compliance-surface-136#8 MED folded The count and the da
plan-engineering-eng-all#1 HIGH folded No spring: the sprin
plan-engineering-eng-all#2 MED folded wall Buttons use the
plan-engineering-eng-all#4 MED folded self-skeptical check
plan-error-paths#2 HIGH folded wall shows only afte
plan-error-paths#4 MED folded (reactivate only for
plan-error-paths#6 MED folded The count and the da
plan-plan-review-deepseek#1 HIGH folded mobile/src/hooks/use
plan-plan-review-deepseek#4 MED folded wall shows only afte
plan-plan-review-deepseek#5 MED folded a store-level test s
plan-plan-review-deepseek#6 MED folded is unchanged by this
plan-plan-review-deepseek#7 MED folded (projected only; the
plan-plan-review-deepseek#8 MED folded there is no help lin
plan-ux#1 HIGH folded is unchanged by this
plan-ux#2 MED folded narrowed by task-357
plan-ux#3 MED folded wall shows only afte
plan-ux#4 MED folded no top-up or upgrade
plan-ux#6 MED folded wall shows only afte
plan-ux#7 MED folded Account (the Account
plan-ux#8 MED folded there is no help lin
in#1 HIGH folded One new page-table s
in#2 HIGH folded The count and the da
in#3 HIGH folded The three report-mou
in#5 MED folded is unchanged by this
in#6 MED folded wall Buttons use the
in#7 MED folded there is no help lin
in#8 MED folded router.navigate, nev
rc#2 MED folded 4. The limit 403 nee
rc#3 MED folded an absent variant co
rg#3 HIGH folded the task-357 lines k
rg#4 MED folded this follows task-35
rg#5 MED folded no top-up or upgrade
rg#6 MED folded the way to sign up o
rg#10 MED folded this card edits no h
<!-- SECTION:PLAN:END -->
