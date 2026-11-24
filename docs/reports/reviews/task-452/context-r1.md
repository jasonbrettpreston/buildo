# Review context for task-452 (no plan id) written 2026-11-24 by backlog-brief.mjs (round 1)

## Task
task-452 SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room), reactivate screen for an expired subscription, and the no-plan page: one layout, three states, phone first and on the web; button press feedback
status: LATER · milestone: m-1 · assignee: none · labels: SEARCHFIX-PRIORITY

## Description
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 5 (BUILD.REPORT-LIMIT) and 7 (FIX.PRESS-FEEDBACK) with amendment A2; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: a customer at their report limit sees a screen offering a subscription upgrade with more report room (objective G.6, doc-2:94; RR-0443, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283; RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290). A customer whose subscription has expired sees a reactivate screen (RR-0444). A signed-in customer with no plan sees the no-plan page (task-357, absorbed here by RR-0446, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302). One wall layout serves the three states, built phone first and also on the web, following how the other pages were built (RR-0445, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296). Last on the phone, primary buttons on the parcel pages get the spring and haptic feedback the engineering standard asks for.

Findings folded: ST2, 2b, the O1 slot, Q14. Starts from the approved mocks (report-limit.html, small-pages-v8 no-plan.html) and existing components (the existing PaywallScreen is checked first for the reactivate state).

Orchestrator reading, to be grounded at the plan stage: the purchase itself happens on the web; the phone wall carries the line or link, not a checkout.

Must not: build a new plan or checkout flow; call expo-haptics directly; move the report goldens (wall copy lives in the search content).

Runs after SEARCHFIX.2 and SEARCHFIX.3 (shared search binding, match file and content). Corrects the BUILT mark on objective G.6 by a dated note. Dated note owed: task-320.

Files: mobile/src/lib/apiClient.ts, mobile/src/lib/errors.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/components/surfaces/SearchBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/components/surfaces/ReportPageHost.tsx, src/app/(maxbld)/parcel-tool/SearchPageClient.tsx, src/app/(maxbld)/parcel-tool/[parcelId]/page.tsx, mobile/src/components/surfaces/SurfaceRenderer.tsx, mobile/__tests__/apiClient.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/surfaceRenderer.smoke.test.tsx, src/tests/fixtures/surfaces/

## Acceptance criteria
- #1 A 403 keeps its code, limit and reset date; limit reached and subscription required are two error classes
- #2 At the limit, the search page and the report screen show the wall with the count, the reset date and the upgrade line; never the reactivate copy
- #3 An expired subscription shows the reactivate state
- #4 A signed-in customer with no plan sees the no-plan page in the app
- #5 The web shows the same three states
- #6 Primary buttons spring and critical actions call the existing haptics wrapper

## Implementation Plan
Planner: Cairn-Plan-452
Plan id: PLAN-452-v1

Read-only. I ran no tests, hooks or generators and wrote no file. Cites were read at board head 9b709f475. For task-450 I also read its branch wf2/inc1b-sfx2 at de6d89d6f with `git diff`; it is built but not folded. Task-451 is read from its final plan in the working tree. MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

#### 1. Rules quoted first
- RR-0443, MD:2283: "yes, they need a screen with a top up or a higher subscription". MD:2285: "(a) at the report limit the person gets a screen offering a top-up or a higher subscription (this is increment objective G.6 ... doc-2 ...:94)".
- RR-0444, MD:2290-2291: "(2b) The report-limit screen is built: "a subscription upgrade with more report room"; a user with an expired subscription gets a reactivate screen".
- RR-0445, MD:2296-2297: "we are mobie first ... but it works onthe web"; "built mobile first and also work on the web, by the same process". MD:2298 is the orchestrator's reading: ruling "a" (no-plan.html:292, App Store 3.1.1) means the purchase is on the web.
- RR-0446, MD:2302-2303: "02 Agrred add to the plan." This adds task-357, the no-plan page.
- RR-0442, MD:2276: "It should open on an exact match". This card changes no search outcome.
- RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this".
- Std 1.3, docs/specs/00_engineering_standards.md:24: "Primary interactive cards and buttons must use Reanimated `withSpring` ... Critical state transitions ... must trigger a haptic".
- Grounder records:
  - GROUNDER-SEATS.md (g3), B :31-44. Its smallest fix: "carry the error code on ApiError ... :63 throw plus mobile/src/lib/errors.ts. Then parcelSearchMatch.ts:297 splits REPORT_LIMIT_REACHED from a plain 403".
  - GROUNDER-QUESTIONS.md:68, Q14: "Defect against the standard".
- Mocks: report-limit.html (v8), state 3 (app wall) and states 4-5 (web). Mock note A1: "the app says only "Your plan is managed on the web."". no-plan.html (v8), states 1-3.

#### 2. What exists and is reused
- The server already sends a structured 403:
  - Limit: `REPORT_LIMIT_REACHED` with details {reportsLimit, resetsOn} (error-mapping.ts:37, route.ts:112).
  - No plan: `SUBSCRIPTION_REQUIRED` (error-mapping.ts:28, route.ts:73).
  - The body shape is {error:{code,message,details}} (envelope.ts:56-80).
- apiClient.ts:49-64 already parses the 403 body (for ACCOUNT_DELETED). This card extends that one block.
- The entitlement read useParcelEntitlement (useParcelLookup.ts:161-170) gives status (null = no plan; 'expired' = lapsed; index.ts:59-77) and resetsOnDisplay (the server's Toronto date, RR-0310). The search screen already reads it (index.tsx:51-58).
- The copy for the reactivate state is the existing `search.entitlement` (content :13). The tracked route exists: PARCEL_TAB_ROUTE.tracked (parcelSearchMatch.ts:254).
- Existing parts and actions:
  - Actions push, open_help (topic 'billing' exists, static-page.schema.json:179-187) and retry (SurfaceRenderer.tsx:111-146).
  - The optional-action pattern: open_help? at :44.
  - The notice and template builders: SearchBinding.tsx:120-124, :99-105.
  - The conditional-key pattern of the situation, `...(args.entitlement ? ...)`, at parcelSearchMatch.ts:356-357.
- authStore.signOut (mobile/src/store/authStore.ts:76). The haptics wrapper lightImpact, successNotification and errorNotification (mobile/src/lib/haptics.ts:6-27).
- PaywallScreen checked first, as the card asks. It does NOT serve this user:
  - It is the lead-gen paywall: prop leadViewsCount (PaywallScreen.tsx:29-31) and the lead-gen checkout useSubscribeCheckout.
  - The parcel product may not reference lead-gen concepts (parcel-tool/_layout.tsx:3-4, Spec 116 OD5).
  - So the reactivate state reuses `search.entitlement` inside the wall (FOLD-PLAN.md:80, the fallback).

#### 3. The change, file by file, in build order
1. mobile/src/lib/errors.ts, after :22: two classes. `ReportLimitError extends ApiError` (status 403, `reportsLimit: number|null`, `resetsOn: string|null`) and `SubscriptionRequiredError extends ApiError` (403). Because both extend ApiError, every `instanceof ApiError && status===403` check still holds: the retry guard useParcelLookup.ts:66, the lot map and the semi page.
2. mobile/src/lib/apiClient.ts:51-63:
   - Read errObj.code. REPORT_LIMIT_REACHED throws ReportLimitError, with the details taken only when typed right (number, string), never coerced. SUBSCRIPTION_REQUIRED throws SubscriptionRequiredError.
   - The catch at :60-61 must rethrow `e instanceof ApiError` too, or the new errors are swallowed.
   - Re-export the two classes at :12.
   - Every other 403 stays ApiError(403,'Forbidden'). A lead-gen route's SUBSCRIPTION_REQUIRED becomes the subclass, which changes nothing for its callers.
3. mobile/src/lib/parcelSearchMatch.ts. All new code; 452 does not touch the hunks 450 owns (§6).
   - New pure `searchWall(error, planStatus)`, which returns 'limit' | 'reactivate' | 'no_plan' | null:
     - ReportLimitError gives 'limit'.
     - Any other 403 with planStatus === null (a read that answered "no plan") gives 'no_plan'.
     - Any other 403 gives 'reactivate': an expired or cancelled status, a failed read, or no read yet.
   - buildSearchSituation (:325-358) gains `planStatus?: string|null` and `planCheck?: 'idle'|'checking'|'none'`. After the entitlement spread it adds `...(wall ? { wall, planCheck } : {})`, so every existing situation and fixture is unchanged.
   - SearchSituation (:302-322) gains the optional `wall` and `planCheck` keys.
   - ParcelSearchErrorClass is unchanged: entitlement still means "a 403", so lotMap.ts:87 and semiQuestion.ts:68 are untouched.
4. scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json: +17 keys, appended after "search.wordmark.max". The words are the mocks', with curly apostrophes:
   - Limit:
     - wall.limit.title "You’ve used all {limit} reports"
     - wall.limit.reset "Your count resets on {date}."
     - wall.limit.opened "Lots you’ve opened this period still open."
     - wall.limit.stay "Your Tracked Lots stay."
   - Shared:
     - wall.plan "Your plan is managed on the web." (the O1 slot, shared by all three states)
     - wall.tracked "Go to Tracked Lots"
     - wall.counted "How are reports counted?"
   - No plan:
     - wall.noplan.title "Welcome back"
     - .lead "This account has no active plan yet."
     - .same "It’s the same MaxBLD account."
     - .check "I’ve set up my plan"
     - .hint "Tap after your plan is active."
     - .checking "Checking your plan…"
     - .none "We couldn’t find a plan yet. Try again in a minute."
     - .account "Account"
     - .logout "Log out"
     - .stuck "Still stuck?" (its link reuses footer.help)
5. mobile/src/components/surfaces/SearchBinding.tsx:
   - A new `wall(s)` builder: a View with testID parcel-search-wall-<kind>, a role-header Text, AlertDescription-style lines, then one action row. Each part per kind:
     - limit: title {limit: contract('errors.403.reportsLimit')}; the reset line {date: entitlement('resetsOnDisplay')}, drawn only when the read answered; opened; stay; wall.plan; a default Button "Go to Tracked Lots" (push PARCEL_TAB_ROUTE.tracked); a link "How are reports counted?" (open_help 'billing', choice 8.7).
     - reactivate: search.entitlement and wall.plan, then the tracked button.
     - no_plan: title, lead, wall.plan, same; then the button "I’ve set up my plan" (retry; disabled and busy, text wall.noplan.checking, when planCheck is 'checking'); then the hint, or `none` plus stuck and the help link when 'none'; then Account (push PARCEL_TAB_ROUTE.account) and Log out (sign_out).
   - notices() :134-136 draws the entitlement notice only when `!s.wall`. searchProps (:233-240) puts `...wall(s)` after notices.
   - Export `wallTree(kind, planCheck)` for the report screen.
   - searchData (:250-253) adds `errors.403.reportsLimit` beside 429 when the wall is limit.
6. mobile/src/components/surfaces/SurfaceRenderer.tsx:
   - SurfaceActions (:34-45) gains optional `sign_out?: () => void`, with a case in action() (:115-145). The `in` fence covers it, as it covers open_help.
   - Haptics, ruled in choice 8.6: in renderNode (:157-159), a Button with variant 'default' wraps its onPress as `() => { lightImpact(); fn(); }`. Nothing calls expo-haptics directly.
   - The spring: see choice 8.6.
7. OUTSIDE FILES LINE, mobile/app/(app)/parcel-tool/index.tsx. It is on task-357's absorbed Files line, and it is the only place the read and the recheck live.
   - :53 passes `planStatus` (undefined until the read answers; data.status otherwise) and a local `planCheck` state.
   - :109 retry also calls refetchEntitlement. A press with wall 'no_plan' sets planCheck 'checking'.
   - When it settles: a still-null status sets 'none' and calls errorNotification(). An active status calls successNotification(), and the lookup refetch clears the wall.
   - :105-117 actions gain sign_out, which calls useAuthStore.getState().signOut().
8. mobile/app/(app)/parcel-tool/[parcelId].tsx:22-33:
   - Read `error`, call useParcelEntitlement(), and compute `wall = searchWall(error, status)`.
   - Pass the host one optional prop: `wall={{ tree: wallTree(...), content: SEARCH_SLICE.content, data, actions: {push, open_help, back, retry, sign_out} }}`, or null.
   - The report goldens and REPORT content do not move (FOLD-PLAN.md:83).
9. mobile/src/components/surfaces/ReportPageHost.tsx:34-68: an optional `wall` prop. When it is set, the host renders `top` and then `<Renderer tree={wall.tree} content={wall.content} data={wall.data} actions={wall.actions}/>` in place of the lifecycle. These are existing tags only, so C-8m holds (surface-conformance.logic.test.ts:751).
10. OUTSIDE FILES LINE, src/components/surfaces/web/SearchBinding.tsx (450's file; AC5). It mirrors the mobile wall with its notice idiom (:175-180), and the entitlement notice is guarded by `!s.wall`. WebSituation (:33-48) gains the optional wall and planCheck. Web buttons are disabled while the site is not live (runtime.disabled). The web action row is choice 8.4.
11. The census, scripts/surfaces/_schema/census/mobile-product.json, entry mobile_parcel_search. Two edits, as dated prior-text-kept sentences:
    - errors.classes 403 ui: three wall states replace the one locked line (descriptor :377).
    - checks :298: the wall replaces the entitlement block.
    The descriptor is then rewritten by `node scripts/violations/generate-surface-registry.mjs --emit-descriptors`, then the plain run (which writes docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md), then `--check`. The generator has no --write.
12. Fixtures and goldens. mobile/__tests__/fixtures/parcelSearch.situations.json is OUTSIDE FILES LINE (450 also edits it):
    - 'unauthorized' gains `"wall":"reactivate"`, so its golden draws the reactivate wall (choice 8.2).
    - New situations limit_wall, no_plan_wall, no_plan_checking and no_plan_none, used by the tests only.
    - Regenerate in order: emit-mobile-surfaces.mjs --write, search-golden-capture.ts --write, emit --write again, the one-off in-memory buildGoldens call for *.web.json (the 450/451 method), surface-validate --check.
    - Golden counts stay: S-screen 100, and the T7 lock of 70 at admin-media.golden.test.ts:38.
13. OUTSIDE FILES LINE, the string-count pins (§6): surface-validate.logic.test.ts:91 and surface-conformance.logic.test.ts:261 go from 436 to 453, with a dated comment, measured before and after.
14. src/app/(maxbld)/parcel-tool/SearchPageClient.tsx and [parcelId]/page.tsx: no edit.
    - The client already passes the situation through.
    - The web report route fails closed until MB-44 (page.tsx:17-20). Making it reachable is the live switch's row, not this card's.
    - The web gate wiring is choice 8.5.

#### 4. Tests first (red, then green)
The mobile unit tests are not run by the commit hook; they run in the full suite at the push station. The lane runs them by hand before each commit.
- AC1, fold :78 (ST2), mobile/__tests__/apiClient.test.ts, beside :132:
  - "403 REPORT_LIMIT_REACHED keeps code, limit and reset". Input: body {error:{code:'REPORT_LIMIT_REACHED',details:{reportsLimit:10,resetsOn:'2026-12-09T05:00:00.000Z'}}}. Expected: a ReportLimitError with 10 and that ISO date, also instanceof ApiError, status 403.
  - "403 SUBSCRIPTION_REQUIRED" gives SubscriptionRequiredError.
  - ACCOUNT_DELETED is unchanged.
  - A generic 403 is ApiError and neither subclass.
  - Bad details give reportsLimit null.
  - Red today: every case is ApiError(403,'Forbidden').
- AC2 and AC3, fold :79-80, mobile/__tests__/parcelSearchMatch.test.ts, describe "searchWall":
  - ReportLimitError with any status gives limit.
  - SubscriptionRequiredError with null gives no_plan; with 'expired' gives reactivate; with undefined (a failed read) gives reactivate.
  - A plain ApiError 403 with null gives no_plan.
  - A 500, a 429 and no error give null.
  - buildSearchSituation leaves out the wall key when there is no 403, so the existing truth table is unchanged.
- AC2, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx. The mocks at :34-39 gain an error and an entitlement data, and authStore :25 gains signOut.
  - Limit with {reportsLimit:10, resetsOnDisplay:'9 Dec 2026', status:'active'} shows "You’ve used all 10 reports", "Your count resets on 9 Dec 2026." and "Your plan is managed on the web.".
  - The search.entitlement text is absent (queryByText null).
  - Pressing Go to Tracked Lots pushes '/(app)/parcel-tool/tracked'.
- AC3: SubscriptionRequiredError with status 'expired' shows the search.entitlement text inside parcel-search-wall-reactivate.
- AC4, from task-357 AC1 and AC3:
  - Status null shows "Welcome back".
  - A press refetches the read and the lookup. While the read is fetching, "Checking your plan…" shows with the button disabled and busy.
  - A settled null shows "We couldn’t find a plan yet. Try again in a minute.".
  - Log out calls signOut.
- Report screen, OUTSIDE FILES LINE, mobile/__tests__/reportPage.behaviour.test.tsx: the host with a limit wall prop renders the wall and Back, and not states.lifecycle.error. Red: the prop does not exist.
- AC5, OUTSIDE FILES LINE, src/tests/surfaces/search-web-binding.ui.test.tsx: the three wall situations render server-side with the same texts, and none holds search.entitlement for limit.
- AC6, fold :91-92, mobile/__tests__/surfaceRenderer.smoke.test.tsx, a new describe "press feedback":
  - With jest.mock('@/lib/haptics'), pressing a variant 'default' Button calls lightImpact once and then its action. A 'link' press calls none.
  - A host without sign_out cannot render the no-plan wall (the unknown-action fence).
  - The spring test depends on choice 8.6.
- Grep plant, task-357 AC4: no new content value contains http, www, $ or maxbld.ca.
- Fold A2 (FOLD-PLAN.md:226): one layout, three states is the three behaviour cases above.

#### 5. Limits, and what could fail or surprise
Limits:
- No purchase and no checkout. No new route, setting, state name or server change.
- The lead-detail page and the old permit route are untouched.
- The semi page and the map page keep their own `state.entitlement` notice (semi content :14, map :23). A semi Continue that meters at the limit still says "reactivate" (choice 8.9).
- A person with no plan row at all sees the App A spinner and never reaches the wall. That is MF-49 (task-357, user state 1).
- The sign-up way is NOT delivered. It waits on MF-86, the Stripe price ids, and MF-70/MF-49 (task-357 AC6 close-out).
Risks:
1. If apiClient's catch block is not widened, the new classes are swallowed and come out as ApiError. The AC1 tests catch it.
2. A failed or late entitlement read draws reactivate, not no-plan. Its words are today's notice, the task-357 fallback.
3. The reset line binds resetsOnDisplay. If the read has not answered, that line is left out (choice 8.11).
4. Every search golden moves, because the content fingerprint moves; 'unauthorized' also changes its tree. surface-validate --check and parcelScreens.golden.test.ts detect it. The golden count is unchanged.
5. If signOut does not reset the gate's profile status, Log out may not end on sign-in. This is UNVERIFIED (task-357). The behaviour test asserts the call, and a device check happens once before close.
6. The renderer haptic fires on every primary press, including Select. That is Std 1.3's "neutral action".

#### 6. Who owns which hunk (450, then 451, then 452; re-read at the merge, edit by anchor text, not line)
- parcelSearchMatch.ts:
  - 450 owns deriveMatchType, hasHouseNumber, the `retryAfterSeconds == null` line, overCap and showMiss.
  - 452 adds searchWall, the two args and the `wall` spread after "...(args.entitlement ?".
- The search content:
  - 450 owns list.refine, search.input.hint and search.prompt.
  - 452 appends the wall.* keys.
- Mobile SearchBinding:
  - 450 owns DERIVED_NAMES, the pill hint, the report topic, the prompt template and the derived min_query_len.
  - 452 adds wall(), the `!s.wall` guard, the searchProps line and the 403 data.
- Web SearchBinding: 450 owns the sliceNumber import, the hint, the topic and the prompt. 452 adds the wall and the type keys.
- static-page.json and web_help: 450 and 451 only. 452 does not touch them (choice 8.1).
- Census mobile-product.json:
  - 450 edits mobile_parcel_search purpose, metering, flag and notes; 451 edits the map entry.
  - 452 edits mobile_parcel_search errors and checks :298.
  - Whoever lands second re-runs the generator.
- String pins: 450 moves 426 to 427, 451 moves 427 to 436, and 452 moves 436 to 453.
- parcelSearch.situations.json: 450 owns rate_limited_zero; 452 owns 'unauthorized' and the new keys.
- surfaceRenderer.smoke.test.tsx: 450 owns :41 and :76-82; 452 adds a new describe; task-456 runs later.
- Files line to add: the census, the two 127 files, the descriptor, the slice, the mobile goldens copy, the five OUTSIDE files above, and reportPage.behaviour.test.tsx.

#### 7. Dated notes and card notes owed (node_modules/.bin/backlog, never a hand edit)
- doc-2, by `backlog doc update doc-2 --content`, built from a fresh read with prior text kept: G.6 (:94) BUILT is corrected. The wall is built by task-452, the web is drawn but not live, and there is no purchase.
- task-320: `backlog task edit 320 --append-notes`, saying ST2 is closed. Read the notes first and append once.
- task-357: --append-notes, saying it was built under task-452. It names which user states reach the page (state 2 only) and that the sign-up way waits on MF-86, the price ids and MF-70/MF-49 (its AC6).
- task-452: --plan, the acceptance checks, and --append-notes with the evidence and any rulings on the choices below as verbatim dated rows.

#### 8. Open choices (not decided)
8.1 Where the wall is drawn:
- (a) SearchBinding and the search content. This is the card's Files line and FOLD-PLAN.md:83.
- (b) A screens row of static-page.json drawn by PageTableBinding.tsx. This was task-357's 2026-11-20 grounder note, and it needs its own surface, route and descriptor.
- Recommend (a): the card is later and RR-0446 folds 357 into it.
8.2 Goldens. SV-SCREEN refuses a state "declared twice" (screen-checks.mjs:264), and the state names are a closed list (surface.schema.json:2003-2056) with no limit or no-plan value.
- (a) The 'unauthorized' golden shows reactivate, and limit and no-plan are proven by tests.
- (b) New state names, which is a schema change and a new mechanism.
- Recommend (a).
8.3 O1 phone action row:
- (a) "Your plan is managed on the web.": mock A1, ruling "a", and the reading of RR-0445 at MD:2298.
- (b) An upgrade button.
- Recommend (a). Switching later is one key.
8.4 Web buy button. No target exists on maxbld.ca: MAXBLD_ROUTES (host-policy.ts:41-60) has no /subscribe, /plans or /account, and subscribe/actions.ts:7-9 says "No page imports them yet".
- (a) No buy button until MF-86, and the web drops wall.plan.
- (b) Draw "Upgrade to Pro" pointing at a route that does not exist yet.
- Recommend (a), because the card says "Must not: build a new plan or checkout flow".
8.5 Web no-plan versus reactivate:
- (a) requireParcelToolPage returns the status it already reads (:54-61), and page.tsx and maxbld-web.ts pick the wall. These are three files OUTSIDE FILES LINE, and they bring the security lens in.
- (b) Binding parity only; the not-entitled page shows reactivate.
- Recommend (b). Task-357 put the web no-plan page out of scope ("Sign in -> Checkout", Spec 126:1080).
8.6 Spring. SurfaceRenderer may render only COMPONENTS parts imported from the vendored parts, the React Native parts or the host list (surface-conformance.logic.test.ts:746, :781, :789). The vendored Button is sha-pinned (C-5), and withSpring needs a per-button hook. So meeting AC6's spring changes the C-8m lock and the bindings.json mapping.
- (A) One spring part plus the lock edit (the MF-53 and MF-83 part-source precedent, :744-745).
- (B) Haptics now and the spring on its own card.
- Recommend (B): RR-0392, and task-357's line that a new component kind "needs a named reason and a ruling".
8.7 "How are reports counted?":
- (a) open_help 'billing', an existing topic.
- (b) Leave the link out (there is no help answer).
- Recommend (a).
8.8 Log out on the no-plan wall:
- (a) Add the sign_out action. That is task-357 AC3, and account.tsx:15-18 shows nothing, so there is no other Log out.
- (b) Leave it out.
- Recommend (a).
8.9 Semi and map pages at the limit:
- (a) Leave them; the card does not name them.
- (b) Extend searchWall to them.
- Recommend (a), and pile it.
8.11 The wall's date:
- (a) The read's resetsOnDisplay (RR-0310).
- (b) Format the 403's resetsOn on the phone.
- Recommend (a).

#### 9. UNVERIFIED
- Nothing was run.
- Whether jest-expo mocks expo-haptics. The smoke test mocks the wrapper anyway.
- The search-golden-capture.ts header (:6-7) says it reads each golden's situation from the committed golden; a changed situation is handled as task-320 did (read its commit).
- That signOut ends on sign-in.
- The exact string total. The lane measures it.
- The 403 wall is unreachable today (the meter is off: GROUNDER-SEATS B "latent").

#### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/apiClient.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchMatch.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/SearchBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/ReportPageHost.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/SurfaceRenderer.tsx

## Implementation Notes
(none)

## References
- (none)

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
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
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
- RR-0429 Dated notes are kept short
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
- RR-0442 the search opens a lot on an exact match — "It should open on an exact match and we have a different process for address mistakes, if the lot is shared by two parcels - you need to pick one - if its a semi potentially - you need to state that?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276)
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0444 fold the McFixReborn findings — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task — "04  leave it as it is 02 Agrred add to the plan." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles
- RR-0452 tooling plan approved; the three questions are not added
- RR-0149 Increment 1·A tooling location
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
- RR-0310 A.6 reset date served as a Toronto-time label (task-320) — "your recommendation is approved" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1207)
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
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped (names RR-0387) — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0442 the search opens a lot on an exact match (names RR-0442) — "It should open on an exact match and we have a different process for address mistakes, if the lot is shared by two parcels - you need to pick one - if its a semi potentially - you need to state that?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2276)
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses (names RR-0443) — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0444 fold the McFixReborn findings (names RR-0444) — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process (names RR-0445) — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task (names RR-0446) — "04  leave it as it is 02 Agrred add to the plan." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks (names RR-0447) — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks (names RR-0448) — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320) (names RR-0310) — "your recommendation is approved" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1207)

## Prior reviews and lane reports
### task-452 (this task)
- (none)
### task-450 (dependency)
- docs/reports/reviews/task-450/FINDINGS-PLAN.md
- docs/reports/reviews/task-450/FOLD-CHECK.md
- docs/reports/reviews/task-450/GROUNDER-PLAN.md
- docs/reports/reviews/task-450/QUESTIONS-RULED.md
- docs/reports/reviews/task-450/TRIAGE-PLAN.md
- docs/reports/reviews/task-450/seat-integration-1.md
- docs/reports/reviews/task-450/seat-reality-check-1.md
- docs/reports/reviews/task-450/seat-regression-1.md
### task-451 (dependency)
- docs/reports/reviews/task-451/FINDINGS-PLAN.md
- docs/reports/reviews/task-451/FOLD-CHECK.md
- docs/reports/reviews/task-451/GROUNDER-PLAN.md
- docs/reports/reviews/task-451/QUESTIONS-RULED.md
- docs/reports/reviews/task-451/TRIAGE-PLAN.md
- docs/reports/reviews/task-451/seat-integration-1.md
- docs/reports/reviews/task-451/seat-reality-check-1.md
- docs/reports/reviews/task-451/seat-regression-1.md

## Dependencies
- task-450 SEARCHFIX.2 Search page: a street with no number asks for a house number; no-match flicker, strict lot-form check, typed "3", double retry message and the wrong-lot help topic corrected · status: RUNNING
  final summary: (none yet)
- task-451 SEARCHFIX.3 Lot card: "Not available" for an implausible lot size, "at the back", "or report it", screen-reader labels, plain-page header links · status: LATER
  final summary: (none yet)
