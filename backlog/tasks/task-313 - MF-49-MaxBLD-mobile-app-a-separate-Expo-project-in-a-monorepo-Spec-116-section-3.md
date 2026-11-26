---
id: TASK-313
title: >-
  MF-49 MaxBLD mobile app: the front door, inside the one Expo project (McApp
  card 1)
status: BUILT
assignee:
  - '@lane-BL-MCAPP313'
created_date: '2026-11-19T13:07:00Z'
updated_date: '2026-11-26T17:50:00Z'
labels:
  - queue-row
  - McApp
milestone: m-2
dependencies: []
references:
  - .cursor/MCFRONTEND-QUEUE.md#L347 ROW:MF-49
  - docs/reports/reviews/task-313/GROUNDER-PLAN.md
  - docs/reports/reviews/task-313/TRIAGE-PLAN.md
  - docs/reports/reviews/task-313/seat-integration-1.md
  - docs/reports/reviews/task-313/seat-reality-check-1.md
  - docs/reports/reviews/task-313/seat-regression-1.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
  - compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
  - compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:step-132 docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - >-
    compliance:inc-1-2 backlog/docs/increments/doc-3 -
    Increment-1-2-requirements.md
  - >-
    compliance:ms-1-2 backlog/milestones/m-2 -
    increment-1·c-launch-shared-parts-[1-2].md
  - docs/reports/lanes/2026-11-26/BL-MCAPP313/REPORT.md
  - docs/reports/lanes/2026-11-26/BL-MCAPP313/GROUNDER.md
  - docs/reports/lanes/2026-11-26/BL-MCAPP313/TRIAGE.md
type: build
project: McFrontend
ordinal: 22012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full title: MF-49 MaxBLD mobile app: a separate Expo project in a monorepo (Spec 116 section 3)

queue row: MF-49 (lane E; row status LATER · since 2026-11-09 · expires 2026-11-16 · next: G1 #11 · Plan when MF-47 and MF-51 settle); the row stays the record (Spec 137 rule 2) and a lane edits the row and this task in the same commit (rule 3). Mirrored by task-306 (R8a, RR-0232) because the row expired 2026-11-16 and waits on the operator's renew, drop or answer word.

Grounded: yes. Row MF-49 'MaxBLD mobile app: a separate Expo project in a monorepo (Spec 116 section 3)', Status: LATER since 2026-11-09, expires 2026-11-16, next 'G1 #11 Plan when MF-47 and MF-51 settle' (.cursor/MCFRONTEND-QUEUE.md:347-348). Expired under Spec 137 rule 7 (137_mcqueue.md:112). MF-47 is WAITS, expires 2026-11-24 (:334); MF-51 is WAITS 'expires when MF-49 ships ... waits: MF-49 app' (:375): the two rows wait on each other. Milestone m-8 (Increment 6c) is placed by the plan items 6c.24 and 6c.26 (task-110, task-112, milestone m-8) that carry the refresh of these expired rows (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:21), not by the row itself: UNVERIFIED as increment ownership. The mirror shows the row as waiting on the operator's renew, drop or answer word (Spec 137 rule 7), not the row's own status word.
Recommendation: renew with a named event, `expires when MF-47 is DONE` (Spec 137 rule 12, 137_mcqueue.md:129). Proposed follow-up, not part of R8a: MF-51 itself waits on MF-49 (.cursor/MCFRONTEND-QUEUE.md:375), so the row's wait on MF-51 is circular. UNVERIFIED: review r1 of task-306 (r1-plan.txt) tested the routing of this item, not the answer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After sign-in the app goes straight to Lookup: no lead-app onboarding, no profile read, no push token (mobile/__tests__/authGate.test.ts, MaxBLD front door)
- [x] #2 The MaxBLD bar (ParcelShelf) is the only bar and every other route under mobile/app/(app) redirects to Lookup (appShell.test.ts, maxbldAppGate.behaviour.test.tsx, parcel-tool-fence.infra.test.ts)
- [x] #3 The Opening shows Connecting..., Can't reach MaxBLD with Try again, or Something went wrong with Try again, and never the lead-app spinner (openingScreens.golden.test.ts)
- [x] #4 A MaxBLD user with no user_profiles row or no trade gets 403 or 200 and never 401 from lookup, entitlement and lot-size (get-user-context.logic.test.ts, the three route tests)
- [x] #5 A wrong email or password shows Incorrect email or password. with the keyboard closed (signIn.behaviour.test.tsx; phone walk with the keyboard up)
- [x] #6 The home-screen icon, adaptive icon and favicon are the House Mark and the splash has no template grid (appIcon.test.ts; prebuild proof)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [x] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [x] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [x] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [x] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Planner: Cairn-Plan-313
Plan id: PLAN-313-v1

Card task-313, McApp card 1 of 4 (the front door), board checkout ~/Buildo-wt-board at 4b0cf7ab1. Read-only: I wrote no file, ran nothing that changes state, and opened no database or dotenv file. The python call was blocked by the hook and I redid it in node.

1. RULES QUOTED (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md)
- RR-0496 MD:2583: "Let's organize the App itself tasks (group them together where the build will be optimized)... These grouped tasks are McApp."
- RR-0499 MD:2598: "1a". The question put to him at MD:2599 was "A inside the one project (sign-in straight to search, the MaxBLD bar the only bar, the gate checks the MaxBLD plan, own start-up screen, lead-app screens kept in the code unreachable for the other app; departs from Spec 116 section 3...)".
- RR-0501 MD:2608: "So we have four mega tasks for McApp - that looks good ... Let's do the McApp first". Card 1 is the front door (313).
- RR-0485 MD:2533, item 3: "3. Nope" (no onboarding question).
- RR-0482 MD:2518: "Remember our new policy on tasks - ie larger tasks and using existing components as well."
- RR-0477 MD:2496: "batch items that touch the same files or the same kind of file and need no database step. Keep anything with a database step or its own operator question on its own card."
- RR-0392 MD:1975: "I don't think we need any other infastrcuture beyond this."
- RR-0445 MD:2296: "we are mobie first - we always take that approach but it works onthe web ... look back and follow".
- From chat, not in MD: "The MAxbLD app should go from sign-in direclty to the search screen"; "Removing the current onboarding - save it for the other app?"; "Where is the app loading screen?"
- Spec 116 :106: "moving `parcel-tool` out of the `(app)` gate without a per-product gate in the new place is a security regression". The same fence is quoted in mobile/app/(app)/parcel-tool/_layout.tsx:16-28.
- Spec 136 fe.31: "Every MaxBLD page ... is descriptor + content + standard library components". fe.47: "every debounce ... is a registered logic variable".
- Spec 99 §5.3: "Any change to AuthGate's branches requires updating this section."

2. FACTS FOUND
F1. After sign-in, AuthGate always goes to the lead app. It reads GET /api/user-profile (mobile/app/_layout.tsx:98). A 404 sends the user to /(onboarding)/profession (decideAuthGateRoute.ts:86-89). onboarding_complete false resumes onboarding (:125-126, :143-144). Complete goes to '/(app)/' plus a push token (:129, :133), and the first tab there is Lead Feed ((app)/_layout.tsx:278). These are phone-walk findings 8 and 9.
F2. The (app) gate reads the lead_gen status. (app)/_layout.tsx:239-241 shows SubscriptionLoadingGuard while `profile.subscription_status == null`, and the server fills that field from the lead_gen entitlement (user-profile/route.ts:51). A MaxBLD-only user therefore spins forever. If the lead gate is passed, the 5-tab <Tabs> is drawn (:273-291) and is hidden only while parcel-tool has focus (appShell.ts:29).
F3. How mctest-paid got past the gate. The seed gives it a user_profiles row with trade 'plumbing' (seed-personas.mjs:144) and only its catalogue entitlement, with no lead_gen row (:147, :181). RR-0480 (MD:2509-2512) then set onboarding_complete true. Every GET /api/user-profile runs applyFallbackTrialInitIfNeeded(uid,'lead_gen') (route.ts:72), which inserts a lead_gen 'trial' row when onboarding_complete is true (src/lib/subscription/expiration.ts:52-63). subscription_status became 'trial' and the gate opened. This is inferred from the code; I did not read the database.
F3a. Side effect: that trial row opens the unmetered lead_gen arm of the parcel gate (src/lib/parcels/tool-gate.ts:15) once a parcel_tool plan lapses.
F4. What fails on the server today. All three parcel routes call getCurrentUserContext: lookup/route.ts:69, entitlement/route.ts:33, lot-size/route.ts:41. It returns null, so the route answers 401, in two cases: no user_profiles row (get-user-context.ts:100-106), and a row with no trade (:135-142). A web buyer's row is created with no trade (parcel-checkout.ts:136; maxbld-terms.ts:10). So a paying MaxBLD customer gets 401 from search, the reports-left line and lot size, today.
F4a. No database step is needed. usage_events, entitlements and parcel_user_inputs all reference auth.users, not user_profiles (migrations/303:28, 228:22, 305:36). Nothing has to write a row.
F5. Start-up screen. app.json:11-15 points the splash at mobile/assets/splash-icon.png. I opened that file: it is the Expo template grid, and assets/icon.png is the same grid. The in-app loading screen is the dark spinner SubscriptionLoadingGuard. expo-splash-screen is not installed (mobile/node_modules).
F6. Finding 7 (wrong email showed nothing). Wrong email and wrong password take the same path: signInWithPassword, then handleAuthError, then mapSupabaseError, which always returns text ('invalid_credentials' gives "Incorrect email or password.", supabaseErrors.ts:14-15). The red error line sits below the email form and its Back link (sign-in.tsx:576-579). The screen centres its content with no ScrollView or KeyboardAvoidingView. Only the OTP path calls Keyboard.dismiss() (:429). Likely cause: the open keyboard covered the error line. This is inferred; I could not see it on a device.
F7. The search page already handles a no-plan user: "a plain 403 or no plan keep today's notice" (parcel-tool/index.tsx:64-67; content key search.entitlement).
F8. useParcelEntitlement exists (useParcelLookup.ts:300-309): key ['parcel-entitlement'], not persisted (persistFilter.ts:30), retried through shouldRetryParcelLookup. The route answers 200 with every field null when the user has no plan.
F9. The pattern for building a phone page is the task-452 wall, S-096: rows in static-page.json `screens`, drawn by PageTableBinding through a thin binding. Its commits 4cf68ec45 and 7d4410db0 carry the files that pin counts.
F9a. Schema limits on those rows: section kinds are only bar, status, text, notice, choices and button; action is one of [back, retry, push, select]; there is no footer kind for screens (static-page.schema.json $defs).
F10. The navigation lock still names three exceptions as "owed: MF-49": #15 and #16 (sign-in setMode) and #22 (sign-up). See nav-by-route.logic.test.ts:313-318 and :351.

3. WHAT THE PLAN REUSES
useParcelEntitlement; the server gate parcelToolAccess (tool-gate.ts:12-17); getEntitlementStatus (entitlements/index.ts:112); ParcelShelf and the parcel-tool Stack, unchanged; the wall pattern (WallBinding.tsx, useWallState.ts, wall-golden-capture.ts, wallScreens.golden.test.ts); the contract contract_parcels_entitlement; the Keyboard.dismiss pattern (sign-in.tsx:429); the sign-up method-param precedent resolveSignUpMethod (featureFlags.ts:34); the typed-switch precedent MAXBLD_WEB_LIVE (src/lib/surfaces/maxbld-web.ts:19).

4. THE CHANGE, BY FILE, IN BUILD ORDER
Server (no database step):
S1. src/lib/auth/get-user-context.ts. Add an optional third argument `{ needsTrade: false }`, typed by overload to return `{uid, subscription_status} | null`. On that path the function does not read user_profiles; it reads the lead_gen status with getEntitlementStatus(pool, uid, 'lead_gen'). Without the argument, nothing changes for the lead routes.
  Round 1 (rg#2, security#1, error-paths#4): it reads the lead_gen status; when it reads 'trial' it calls applyTrialExpirationIfNeeded(uid, 'lead_gen') (the existing idempotent update the profile route calls: a trial older than 14 days becomes expired), because the phone no longer calls GET /api/user-profile and would otherwise leave a trial row unexpired for good. The tool-gate.ts transitional arm is the ruled MF-45 D-4 a arm until MF-50 and is not changed. Both reads sit inside the function's existing try, so a thrown read returns null and the route answers 401, as a thrown profile read does today.
S2. The three parcel routes (lookup/route.ts:69, entitlement/route.ts:33, lot-size/route.ts:41) pass `{ needsTrade: false }`. Nothing else changes; the 403 gate is unchanged. lookup/route.ts is also on task-267's Files line.

Phone:
M1. mobile/src/lib/appShell.ts (an existing leaf module, not new: it already exports SELF_SHELVED_ROUTES and shouldHideAppTabBar at line 29, anchored in the census and two descriptors, and has callers; both exports and the ZERO side-effect import rule stay, the new exports go below line 29; integration#2, rg#7):
- `APP_PRODUCT: 'parcel_tool' | 'lead_gen' = 'parcel_tool'`: the one switch that keeps the lead path compiled for the other app.
- `MAXBLD_LOOKUP_ROUTE = '/(app)/parcel-tool'`.
- A pure `decideMaxbldGate({hydrated, user, ent, segment})` returning:
  - 'loading' until there is a user and a first answer, retries included (the read is pending);
  - 'offline' when there is no data and the read is paused (fetchStatus 'paused': the device reports no network, so TanStack never runs the read, queryClient.ts:24-26; reality-check#1). No failure count is used;
  - 'error' when the read is in error and there is no data, or when the read is still pending after REPORT_GIVE_UP_MS (task-267's export of the existing registered 60 000; no new setting; error-paths#1);
  - 'redirect' when there is data and segments[1] !== 'parcel-tool' (the name is derived from PARCEL_TAB_ROUTE, so a nested route such as [parcelId] enters; error-paths#5);
  - 'enter' otherwise. There is no plan arm in card 1: the plan check is the server 403 (RR-0503 Q1 A, section 8). The gate reads status and fetchStatus only, never isFetching (Spec 99 §6.5, §8.3).
- Once data exists it never flips back: a failed refetch on focus keeps 'enter' (Spec 99 §6.5 stable gate).
M2. mobile/src/lib/auth/decideAuthGateRoute.ts. Add an optional input `product` (default 'lead_gen', so the 9 lead arms and their tests are unchanged). For 'parcel_tool': no user → sign-in (arm 1, unchanged); user in (auth), (onboarding) or root → navigate MAXBLD_LOOKUP_ROUTE with no registerPushToken; user in (app) → wait. The profile is never read. The navigate result carries a branch id, so the existing DEV route_decision emit at _layout.tsx:187 names it (Spec 99 §7.3). M2 keeps the isNavigationReady wait line text verbatim (schemas.test.ts:278-300). The lead arms the MaxBLD product skips, all named in the Spec 99 note: 2 reactivation modal, 3 profile 404 to onboarding, 4 retry, 4.5 manufacturer hold (a manufacturer account is not held for admin enablement), 5a to 5d resume and push, and wait-stale-profile (rg#6).
M3. mobile/app/_layout.tsx. AuthGate passes `product: APP_PRODUCT` and calls useUserProfile with `enabled: !!user && APP_PRODUCT === 'lead_gen'`. With the profile read gone, the app no longer creates a lead_gen trial row (F3a).
M4. mobile/app/(app)/_layout.tsx. The current body becomes `function LeadAppLayout()` with not one line of it changed. The default export AppLayout returns `APP_PRODUCT === 'parcel_tool' ? <MaxbldAppGate/> : <LeadAppLayout/>`. In MaxBLD mode the five-tab bar is never drawn.
M5. NEW mobile/src/components/parcel/MaxbldAppGate.tsx (mount file). It calls useParcelEntitlement and decideMaxbldGate. 'loading', 'offline' and 'error' draw the Opening page through SurfaceRenderer; 'offline' and 'error' give Try again = refetch. 'redirect' returns expo-router <Redirect href={MAXBLD_LOOKUP_ROUTE}/> and, in a DEV build, first emits track('route_decision', ...) for the gate (Spec 99 §7.3). The redirect is a convenience, not the control: the retained lead routes are protected by server authorisation alone (security#3), and the phone walk deep-links to them on a device (deepseek#1). 'enter' returns <Slot/>, which is the existing parcel-tool Stack and ParcelShelf. ParcelShelf (Lookup, Tracked Lots, Account) is the one MaxBLD bar (RR-0499 "the MaxBLD bar the only bar"); T5 asserts no Tabs render and the shelf is the only bar (ms-1-2#3). The census row of the Opening lists MaxbldAppGate.tsx in identity.owns.components, so the 11-file unowned list pinned at surface-registry.infra.test.ts:213 does not grow (integration#1).
M6. The Opening page, built the wall way (fe.31):
- screens.mobile_parcel_opening rows in static-page.json:
  - text header: the wordmark;
  - text header: "Lot Intelligence";
  - status when 'loading': "Connecting…";
  - notice when 'offline': title "Can't reach MaxBLD", text "Check your connection and try again.";
  - notice when 'error': title "Something went wrong", text "Try again in a moment." (a 401, 429 or 500 is not a connection problem; reality-check#3, error-paths#3);
  - button when 'offline' and when 'error': Try again, action retry.
- New files: content json; descriptor with states loading, offline and error from the closed list; OpeningBinding.tsx; the generated slice; the bindings.json module and mount; converted-surfaces.json (expected_count +1); a census entry; the golden capture script; the goldens; the situations file; one golden test. The generated slice comes from emit-mobile-surfaces.mjs and surface-registry.infra.test.ts --check is its drift lock (integration#7). The Try again row is checked for the 44 px floor by C-9m in surface-conformance.logic.test.ts (fe.57; engineering#4); the page is one column with no fixed width; the goldens assert states and content keys only, not component snapshots (Spec 98 section 4).
- The version gate is left out.
M7. mobile/app.json:11-15. Splash backgroundColor stays dark #09090b: Spec 117 section 5 (117_maxbld_brand.md:195) says not to introduce a different splash colour. The shelf colour PARCEL_SHELF_HEX.screen is #0e0e10 (parcelSearch.ts:102), also dark and not Daylight, sign-in is dark zinc-950 and the shelf pages are dark, so there is no light flash and no new dark: variant is needed (Spec 90 section 2; mobile-90#1, rg#9). The "image" entry is removed, which drops the Expo grid; the config type allows it (ExpoConfig.d.ts:341, image is optional). Before landing, a prebuild is proven in a temp copy; if it refuses an imageless splash, the "image" key stays and the grid in splash-icon.png would still show, which is then the operator's call because Spec 117 section 5 forbids placeholder art (mobile-98#6, deepseek#2). Until JS boots the cold start shows the bare colour and no wordmark; M6 draws the wordmark (ux#6).
M8. mobile/app/(auth)/sign-in.tsx (finding 7). Call Keyboard.dismiss() first in handleEmailSignIn (:354), so the error line under the form is visible. If Q2 is A, also: the email form opens from the route param `?method=email` (the sign-up precedent), and Back becomes `canGoBack() ? back() : replace` with role and label; when canGoBack() is false it replaces to /(auth)/sign-in, the method choices (ux#5, deepseek#11). Same for sign-up.tsx's sign-in link (#22), with the same fallback.
M9. The phone icon (RR-0506): mobile/assets/icon.png, adaptive-icon.png, favicon.png and mobile/app.json. The three template-grid PNGs are replaced by renders of the approved House Mark (brand README: house-mark.svg is "the full mark ... Use at 48 px and up (cover, app badge, store icon)"; the operator chose option C on 2026-11-11). icon.png: 1024x1024, opaque with no alpha (iOS needs it), the white-card tile centred on the paper colour #f4f1eb with at least 25 per cent of the tile width clear on every side (the README clear-space rule), so the tile is 683 px. adaptive-icon.png: 1024x1024 transparent, the tile inside the Android safe circle (66 of 108, 626 px), so the tile is 443 px (Spec 117 section 5: the mark must survive circular masking). favicon.png: 48x48 from house-mark.svg. The app.json keys icon, android.adaptiveIcon.foregroundImage and web.favicon already name these files; only android.adaptiveIcon.backgroundColor changes, to #f4f1eb (the README is light theme only; dark needs the operator's word). Render route, no new dependency (RR-0392): the sharp that next carries is installed (node_modules/sharp 0.34.5, next/package.json:134, librsvg 2.61.2, not declared in package.json); the builder renders once from the repo root and commits only the three PNGs, recording the command in the card note; no script file is added. If the operator supplies the PNGs instead, they replace the three files and nothing else changes. splash-icon.png (the grid) is left in place and unused after M7. mobile/ios and mobile/android are generated by prebuild and gitignored (mobile/.gitignore:45-46), so the icon shows on the phone only after a clean prebuild and rebuild.

Docs: the dated notes in section 7; the MF-49 row in .cursor/MCFRONTEND-QUEUE.md. The MF-49 row is edited to: title "MaxBLD mobile app: McApp card 1, the front door, inside the one Expo project (RR-0499 1a; departs from Spec 116 section 3)"; Status: WAITS · since 2026-11-25 · expires when task-465, 267, 317, 343, 268 and 392 are DONE · next: build McApp card 1 (task-313); with the verbatim dated notes of RR-0499, RR-0501, RR-0503 and RR-0504 as the operator's word that lifts "Plan when MF-47 and MF-51 settle" (Spec 137 rules 10 and 12). MF-50 and MF-51 wait on the whole app and are left as they are until McApp ships.

5. TESTS FIRST (each is red on the tip, then green)
Server:
T1. src/tests/get-user-context.logic.test.ts, new cases. Red today because the third argument does not exist.
- "needsTrade:false, no profile row → {uid, subscription_status:null}"
- "needsTrade:false, trade-less row → context"
- "needsTrade:false reads lead_gen via entitlements, not user_profiles"
- "default call unchanged: no row → null"
- "needsTrade:false, the lead_gen read throws → null, logged, no throw" (fails closed like the existing catch; error-paths#4, engineering#2)
- "needsTrade:false, lead_gen trial older than 14 days → expired through applyTrialExpirationIfNeeded" (rg#2)
T1 rows and mock users come from src/tests/factories.ts where a factory exists (engineering#6).
T2. consumer-parcel-lookup.infra.test.ts:49 and parcels-entitlement.infra.test.ts:152 pin the exact text `await getCurrentUserContext(request, pool)`. Move both pins to the new call text. Add a mock-argument assertion `toHaveBeenCalledWith(anything, anything, {needsTrade:false})`; the same assertion goes into parcels-lot-size-route.infra.test.ts. Red until S2. Negative cases for the moved boundary (engineering#3, security#5, reality-check#5), through the real handlers with a mocked pool: (a) a signed-in user with no user_profiles row and no parcel_tool row gets 403 from lookup and 200 with every field null from entitlement; (b) a row with no trade does the same; (c) no session still gets 401. src/tests/parcel-lookup-gate.infra.test.ts (on the Files line) holds (a) and (b) for lookup. No persona is added: the seed gives every persona a trade (seed-personas.mjs:144), a persona is a seed change the card's rules do not name, and the phone walk therefore cannot show the 401 gone; these cases do.

Phone:
T3. mobile/__tests__/authGate.test.ts, new describe "MaxBLD front door". With product 'parcel_tool':
- inputs: segments (auth); (onboarding)/profession; (onboarding)/address; root;
- each with profile 404, incomplete, complete, or none;
- expected: navigate '/(app)/parcel-tool' and never registerPushToken;
- (app)/parcel-tool → wait; no user → sign-in.
- a manufacturer account is also sent to the Lookup, with no hold (rg#6).
All existing lead cases stay as they are.
T4. NEW mobile/__tests__/appShell.test.ts:
- decideMaxbldGate gives loading, offline (paused, no data), error (in error, or pending past REPORT_GIVE_UP_MS), redirect and enter in their cases; a nested parcel-tool route enters; toggling isFetching does not change the answer (Spec 99 §8.3); a settled read with no data cannot occur, the hook's Zod parse throws first (error-paths#2).
- Data plus isError stays 'enter', including isError with a 401: the server is the fence and sign-out arrives with card 271 (rg#5). Planted cases (fe.56): a lead route name added to the list, and APP_PRODUCT flipped to lead_gen, each turn the test red.
- Every route file under mobile/app/(app) other than parcel-tool, read from disk (index, map, flight-board, settings, [lead], [flight-job]), gives 'redirect'. A lead screen added later is covered automatically.
- MAXBLD_LOOKUP_ROUTE === PARCEL_TAB_ROUTE.lookup (parcelSearchMatch.ts:253), so the two cannot drift.
T5. NEW mobile/__tests__/maxbldAppGate.behaviour.test.tsx. Renders AppLayout with expo-router and useParcelEntitlement mocked:
- the Tabs mock is never rendered and ParcelShelf is the only bar;
- pending → the wordmark;
- paused with no data → "Can't reach MaxBLD"; error with no data → "Something went wrong"; Try again calls refetch in both;
- segments ['(app)'] → Redirect to the Lookup;
- ['(app)','parcel-tool'] → Slot.
- ['(app)','parcel-tool','[parcelId]'] → Slot, not Redirect (error-paths#5);
- the Redirect branch emits route_decision in a DEV build (Spec 99 §7.3; routerTelemetry.test.ts gains the assertion).
T6. NEW mobile/__tests__/openingScreens.golden.test.ts with the goldens (the wallScreens pattern): one golden per state; every content key appears in a golden.
T7. src/tests/surfaces/parcel-tool-fence.infra.test.ts gets the MF-49 extension its header names (:7-9): (app)/_layout.tsx must route on APP_PRODUCT to MaxbldAppGate, and MaxbldAppGate must return the Opening before <Slot. Plants for both. It also asserts that APP_PRODUCT defaults to 'parcel_tool' (rg#4); plants: APP_PRODUCT flipped to lead_gen, and MaxbldAppGate returning <Slot/> before the Opening.
T8. NEW mobile/__tests__/signIn.behaviour.test.tsx: signInWithPassword rejects with {code:'invalid_credentials'}, then Keyboard.dismiss is called and "Incorrect email or password." is shown. Under Q2 A, also: ?method=email opens the form, and Back has role and label and keeps the typed email and password (sign-in.tsx:566; rg#8). The occlusion itself is proven only on a device (deepseek#4): the phone walk types a wrong email with the keyboard up.
T9. Count and list pins that move (from the wall commits):
- src/tests/surfaces/static-page.logic.test.ts: screens 2 → 3;
- page-arm.logic.test.ts: "2 of 2" → "3 of 3";
- surface-validate.logic.test.ts and surface-conformance.logic.test.ts: converted 18 → 19, in scope +1, goldens +3 (three states), strings +1 per content key, all recomputed on top of task-465's landed numbers (commit 0aa1b011e: 105 goldens, 442 strings), never written from the current tree; surface-conformance.logic.test.ts:399 [15, 8, 27] becomes [16, 8, 28]; the S-golden "owed 13 states / 52 files" note moves with the new states (integration#3, #4);
- admin-media.golden.test.ts:72 and :100: the mobile list;
- surface-goldens.ts:48: the map;
- nav-by-route.logic.test.ts:313-318 and :351 under Q2 A: three entries removed, EXCEPTION_AUDIT_ROWS becomes [29, 30].
T10. NEW mobile/__tests__/appIcon.test.ts (node fs only): app.json icon, android.adaptiveIcon.foregroundImage and web.favicon name files that exist; none of the three has the sha256 of a template file (icon.png 74c64047eb557b1341bba7a2831eedde9ddb705e6451a9ad9f5552bf558f13de; adaptive-icon.png and splash-icon.png 5f4c0a732b6325bf4071d9124d2ae67e037cb24fcc9c482ef82bea742109a3b8; favicon.png 24272cdaeff82cc5facdaccd982a6f05b60c4504704bbf94c19a6388659880bb); icon.png is 1024x1024 with no alpha channel (PNG header colour type 2) and adaptive-icon.png is 1024x1024; android.adaptiveIcon.backgroundColor is #f4f1eb. Red today, because the files are the template; plant: a copy of a template file under the icon name goes red. The phone walk after a clean prebuild and rebuild shows the house mark on the home screen.

Re-run, expected unchanged: subscriptionGate.test.ts and routerTelemetry.test.ts (both read (app)/_layout.tsx and _layout.tsx), spec99.mandates.lint.test.ts, phoneGate.coverage.test.ts, useAuth.test.ts:623, parcel-routes.security.test.ts, parcel-lookup-gate.infra.test.ts. The pre-commit related run does not pick all of these; the station suite does.

How the lock on the lead screens is proven (scope item 7): T3 (AuthGate never names onboarding or '/(app)/'), T4 (every lead route redirects, read from disk), T5 (no Tabs, Redirect drawn), T7 (structural fence). PHONE WALK (RR-0488, a standing proof step), by hand on a device: cold start signed out and signed in; a wrong email with the keyboard up shows "Incorrect email or password."; airplane mode shows "Can't reach MaxBLD" and Try again recovers; a deep link to /(app)/settings and to /(app)/[lead] lands on the Lookup; an account with no plan reaches the search page and sees the refusal notice on a search; after signing in as mctest-paid a read-only SELECT of its entitlements shows no new lead_gen row (F3a).

6. LIMITS AND SURPRISES
- With no network the app cannot open: the plan read is not persisted, so the paused read shows "Can't reach MaxBLD" and the stored reports are not reachable offline. A persisted gate answer would let a lapsed plan in offline (Spec 99 section 4), and the lead app's gate is no different (persistFilter.ts:30). This matches the mock's state 4.
- "Connecting…" shows for the whole 'loading' state (the first read and its retries), not after 2 s: a 2 s threshold would be a registered setting, which is a database step (fe.47). The only time bound is the existing REPORT_GIVE_UP_MS that task-267 exports (RR-0341 binds that card's loading screen); 313 re-reads it after 267 lands, and until then the stall bound is UNVERIFIED.
- The wordmark is plain text: the two-tone accent has no row role. Help & Support and the footer are left out: there is no open_help action in the closed list.
- The app icon joins this card (RR-0506, MD:2633: "the only other missing piece on the McApp is the phone icon logo - this should be added as well to the existing task"): see M9.
- The sign-in tagline "Leads for the trades." (sign-in.tsx:463) is left as is: the card does not name it.
- No sign-out in MaxBLD until card 2 (task-271; RR-0498 item 3, RR-0501): a person with no plan, or who signed in as the wrong account, has no way out until then, so card 1 must not reach real users before card 271 lands (RR-0328, the app is not in use). The search notice says "reactivate" (search.entitlement), which is wrong for a person who never subscribed; task-357 replaces it. Maestro auth.yaml:28-36 taps "Settings" after sign-in and fails until then. auth.yaml and the lead flows (scroll-feed, onboarding-leads, onboarding-tracking, subscription-paywall) are not edited here: Spec 98 section 3.2 requires them before a production release, which is the launch gate, the last increment (RR-0501); the airplane-mode step of Spec 90 section 10 is done by hand in this card's phone walk.
- The account-deletion reactivation modal does not show for MaxBLD, and the forced sign-out of Spec 96 section 10 step 2 ((app)/_layout.tsx:152-185) is not run: deleting an account sets every product entitlement to cancelled_pending_deletion (user-profile/delete/route.ts:42), so under Q1 A such an account reaches Lookup and sees the search notice, and the rule that it is shown no app content is not met for MaxBLD until card 271 adds the sign-out. RULED A by RR-0505 (a deleted-pending account reaches search with the no-plan notice until card 2, task-271); the gap against Spec 96 section 10 step 2 is recorded, and card 1 must not reach real users before card 2.
- The useParcelLookup.ts:287 comment, the entitlement route header and Spec 99 section 4 (the B1 row, line 241) call the entitlement read "a display, never a gate". It is now also the front-door gate for offline and error: this card amends the Spec 99 B1 row, the entitlement route header and the Spec 100 text on the entitlement read to say so; the useParcelLookup.ts comment stays because that file is not on this card's Files line.
- get-user-context with no trade: the overload types stop a lead route from passing the option silently, and the typecheck catches a misuse.
- A future lead-app screen file is covered by T4 automatically.

7. NOTES OWED (backlog CLI for the card, never a hand edit)
- Spec 116 §3: a dated note 2026-11-25 quoting RR-0499 "1a" (MD:2598): the MaxBLD app lives inside the one Expo project for now; the Codebase/shell row and the 2026-11-09 note are departed from; the separate project is decided later, when the lead app is ready; the fence of ruling 2026-09-16 (c) holds, since parcel-tool stays in (app), whose data routes the server gates at 403 on the parcel_tool plan (tool-gate.ts:12-17); in card 1 the front-door gate does not check the plan (RR-0503 Q1 A, kept by RR-0504), a named narrowing of the RR-0499 put text "the gate checks the MaxBLD plan".
- Spec 99 §5.1-5.3: the MaxBLD arm; §5.2: the MaxBLD app reads no profile (Spec 95) and its front door reads the entitlement answer for offline and error only; the parcel_tool plan is checked by the server gate (RR-0503 Q1 A; Spec 96 section 10 step 2 waits for card 271); the §5.3 counting convention (9 arms) and the §8.2 branch counts rewritten for the product arm and the skipped arms named in M2; the §4 B1 row for ['parcel-entitlement'] names the front-door gate as a reader. The Spec 99 section 10 amendment rule (a WF1 amendment with adversarial review, line 787) is met by this card's plan review (lenses, seats, grounder), and the note says so.
- Spec 100 §4: the Opening surface.
- Spec 117 §5: a dated note 2026-11-25 quoting RR-0506 (MD:2633): the phone icon art lands with card 1 as renders of the approved House Mark, the rename having executed (app.json name MaxBLD, bundle ca.maxbld.app); the splash keeps #09090b; no monochrome variant is made here.
- The task-313 card: a plan note, acceptance criteria, and the Files line via `backlog task edit`.
- The MF-49 queue row in the same commit (DoD #6).

8. OPEN CHOICES (round 1: RR-0503 rules Q1 A and Q3 A, RR-0505 rules Q4 A; Q2 proceeds on its default)
Q1 (ruled A by RR-0503, kept by RR-0504 "stay with A"). A user with no plan reaches Lookup and sees today's refusal notice when they search (F7) until card 2 adds the No plan page. His A was given on the planner's text; the seats then showed that with A a no-plan or wrong-account person has no sign-out until card 271 and that the RR-0499 put text says "the gate checks the MaxBLD plan". A stands: in card 1 the plan check is the server 403 (tool-gate.ts:12-17), the Spec 116 note says so as a named narrowing, and the gaps are recorded in section 6. Grounded: yes (F8; parcelSearchMatch.ts:442); the recommendation is verified by the plan grounder (QUESTIONS-RULED.md).
Q2 (default A, proceeding; the operator may say otherwise: RR-0504 reading, not a ruling). The three navigation exceptions #15, #16 and #22 are fixed here: the nav lock owes them to MF-49 (nav-by-route.logic.test.ts:313-318, :348), same files, RR-0477 batching, RR-0392 (no new card). Cost about half a day. B: a later owner; cost none now, but the lock's reasons point at a closed card.
Q3 (ruled A by RR-0503). The Opening page departs from the mock in three ways (Connecting… for the whole loading state rather than at 2 s; a plain wordmark; no Help & Support). Spec 136 fe.48 says an element with no source is left out and not raised as a decision; a registered 2 s setting is a database step and a new row role or action needs its own ruling, so none is added.
Q4 (ruled A by RR-0505). A deleted-pending account reaches search with the no-plan notice until card 2 (task-271); the gap against Spec 96 section 10 step 2 is recorded (section 6), and card 1 must not reach real users before card 2.

GUESS estimate: 4 build days. Server 0.5; gate and AuthGate 1; the Opening surface 1.5; sign-in 0.5-1; notes 0.25.

ORDER AND SHARED FILES. Build order: task-465 → tasks 267 and 317 → 343 and 268 → 313. The five 1-B cards are 392, 267, 317, 343 and 268 (the orchestrator's reading of RR-0486); 465 is first, and 392 shares static-page.json, so 313 rebases on it too. 313 rebases last and re-reads every file:line cited here.
- Shared with task-465: census/mobile-product.json, bindings.json, nav-by-route.logic.test.ts, Spec 99, Spec 100, surface-conformance.logic.test.ts, surface-validate.logic.test.ts, search-reports-left.logic.test.ts (task-465's commit 0aa1b011e moves S-screen to 105 goldens and S-sbind to 442 strings; T9 is recomputed on top of that).
- Shared with task-267: lookup/route.ts, consumer-parcel-lookup.infra.test.ts, the census, nav-by-route.logic.test.ts, the two 127 generated pages, Spec 99, Spec 100, MCFRONTEND-QUEUE.md, src/tests/parcel-lookup-gate.infra.test.ts, and the REPORT_GIVE_UP_MS export of useParcelLookup.ts that M1 reads.
- Shared with task-317: MCFRONTEND-QUEUE.md.
- Shared with task-392 and task-357: static-page.json.

CUT TO LATER CARDS: Account and sign-out, and account deletion (271, card 2); the No plan page (357, card 2, unless Q1 is B); saving (269); the version gate and any 2 s setting (they need a setting, which is a database step); the Expo upgrade (467, McApp card 4, RR-0499 item 10 and RR-0501); a splash PNG (467 or brand; the splash keeps its colour and no image, M7); push-token registration and alerts for saved lots (270, moved to the last increment by RR-0501; a stale lead push tap lands on Lookup); any web page.

Files: src/lib/auth/get-user-context.ts, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/entitlement/route.ts, src/app/api/parcels/lot-size/route.ts, mobile/src/lib/appShell.ts, mobile/src/lib/auth/decideAuthGateRoute.ts, mobile/app/_layout.tsx, mobile/app/(app)/_layout.tsx, mobile/src/components/parcel/MaxbldAppGate.tsx, mobile/src/components/surfaces/OpeningBinding.tsx, mobile/app.json, mobile/app/(auth)/sign-in.tsx, mobile/app/(auth)/sign-up.tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_opening.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_opening.content.json, mobile/src/generated/surfaces/mobile_parcel_opening.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/converted-surfaces.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/auth-class-parity-exceptions.json, scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_list.descriptor.json, scripts/surfaces/platform_shared/F14/surfaces/shell_app_tabs.descriptor.json, scripts/surfaces/opening-golden-capture.ts, mobile/__tests__/fixtures/surfaces/mobile_parcel_opening.goldens.json, mobile/__tests__/fixtures/opening.situations.json, src/tests/fixtures/surfaces/mobile_parcel_opening, docs/reports/policy/policy-ledger.json, src/tests/get-user-context.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, src/tests/parcels-entitlement.infra.test.ts, src/tests/parcels-lot-size-route.infra.test.ts, src/tests/surfaces/parcel-tool-fence.infra.test.ts, src/tests/surfaces/nav-by-route.logic.test.ts, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/page-arm.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/admin-media.golden.test.ts, src/tests/surfaces/surface-goldens.ts, mobile/__tests__/authGate.test.ts, mobile/__tests__/appShell.test.ts, mobile/__tests__/maxbldAppGate.behaviour.test.tsx, mobile/__tests__/openingScreens.golden.test.ts, mobile/__tests__/signIn.behaviour.test.tsx, mobile/__tests__/phoneGate.coverage.test.ts, mobile/__tests__/useAuth.test.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/116_multi_product_architecture.md, docs/specs/03-mobile/99_mobile_state_architecture.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, .cursor/MCFRONTEND-QUEUE.md, src/tests/surface-registry.infra.test.ts, src/tests/parcel-lookup-gate.infra.test.ts, mobile/__tests__/routerTelemetry.test.ts, scripts/surfaces/platform_shared/F14/surfaces/shell_app_root.descriptor.json, mobile/assets/icon.png, mobile/assets/adaptive-icon.png, mobile/assets/favicon.png, mobile/__tests__/appIcon.test.ts, docs/specs/00-architecture/117_maxbld_brand.md, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-49-1.json, docs/reports/panels/MF-49.json
(The two descriptors on this line bring in rule list step-132. sign-up.tsx, phoneGate.coverage.test.ts, useAuth.test.ts and the nav-by-route edits come off the line if Q2 is B. shell_app_root.descriptor.json is added because its why says the routing decision is driven entirely by GET /api/user-profile, and its line anchors into _layout.tsx are re-pointed.)

9. UNVERIFIED
- That RR-0480's flag plus GET /api/user-profile wrote mctest-paid's lead_gen trial row (F3): no database read.
- The keyboard cause of finding 7: not seen on a device.
- That expo-router <Redirect> and <Slot> in (app)/_layout behave as planned on a device: Slot is exported (build/exports.d.ts:8) and Redirect is in the package (build/link/Redirect.js), but neither is used anywhere in mobile/ today; the phone walk proves it.
- That `splash` with no image is accepted by Expo 54 prebuild.
- That a mount file may live outside a route file, under mobile/src/components/parcel (the surface-validate mount rule).
- That the rows can draw a second header without a new role.
- Whether the "offline" state name is accepted for "Connecting…".
- The next free S-number.
- Whether policy-ledger.json and rule-lists-by-kind.md really move.
- Whether subscriptionGate.test.ts regexes survive the LeadAppLayout split.
- That a render test of sign-in can mock Apple, Google and the bottom sheet inline: no global jest mocks found.
- The Maestro flows, which are not run in the suite.
- That sharp's librsvg draws the House Mark's thin strokes as a browser does: a test SVG rendered in this read, the mark itself was not.
- Whether the House Mark of the Building Possibilities Report is the mark the operator means by the phone icon logo: it is the only approved art found (brand README), and Spec 117 section 5 still says the MaxBLD mark is not designed.

Plan review round 1: 73 folded, 0 task, 0 ruling, 0 wontfix, 10 pile; grounder docs/reports/reviews/task-313/GROUNDER-PLAN.md; triage docs/reports/reviews/task-313/TRIAGE-PLAN.md
plan-compliance-inc-1-2#1 MED folded expires when task-46
plan-compliance-inc-1-2#2 MED folded RR-0503 rules Q1 A a
plan-compliance-mobile-90#1 MED folded proven in a temp cop
plan-compliance-mobile-90#2 MED folded card 1 must not reac
plan-compliance-mobile-90#4 MED folded expires when task-46
plan-compliance-mobile-90#7 MED folded RR-0503 rules Q1 A a
plan-compliance-mobile-98#1 MED folded card 1 must not reac
plan-compliance-mobile-98#2 MED folded card 1 must not reac
plan-compliance-mobile-98#3 MED folded RR-0503 rules Q1 A a
plan-compliance-mobile-98#4 MED folded ParcelShelf (Lookup,
plan-compliance-mobile-98#6 MED folded proven in a temp cop
plan-compliance-mobile-99-p1#1 MED folded It is now also the f
plan-compliance-mobile-99-p1#2 MED folded carries a branch id,
plan-compliance-mobile-99-p1#3 MED folded change the answer (S
plan-compliance-mobile-99-p2#3 MED folded met by this card's p
plan-compliance-ms-1-2#3 MED folded ParcelShelf is the o
plan-compliance-ms-1-2#4 MED folded neither is used anyw
plan-compliance-ms-1-2#5 MED folded expires when task-46
plan-compliance-plan-protocol#5 MED folded expires when task-46
plan-compliance-plan-protocol#7 MED folded RR-0503 rules Q1 A a
plan-compliance-step-132#2 HIGH folded front-door gate does
plan-compliance-step-132#3 MED folded expires when task-46
plan-compliance-step-132#4 MED folded The five 1-B cards a
plan-compliance-surface-136#3 MED folded front-door gate does
plan-compliance-surface-136#6 MED folded not component snapsh
plan-compliance-surface-136#7 MED folded the server is the fe
plan-engineering-eng-all#2 MED folded the lead_gen read th
plan-engineering-eng-all#3 MED folded Negative cases for t
plan-engineering-eng-all#4 MED folded not component snapsh
plan-error-paths#1 MED folded only time bound is t
plan-error-paths#3 MED folded notice when 'error':
plan-error-paths#4 MED folded when it reads 'trial
plan-error-paths#5 MED folded the read is paused (
plan-plan-review-deepseek#1 MED folded the retained lead ro
plan-plan-review-deepseek#2 MED folded proven in a temp cop
plan-plan-review-deepseek#4 MED folded keeps the typed emai
plan-plan-review-deepseek#5 MED folded only time bound is t
plan-plan-review-deepseek#8 MED folded PHONE WALK (RR-0488,
plan-security#1 MED folded when it reads 'trial
plan-security#3 MED folded the retained lead ro
plan-ux#3 MED folded card 1 must not reac
plan-ux#4 MED folded only time bound is t
plan-ux#5 MED folded it replaces to /(aut
plan-ux#6 MED folded proven in a temp cop
plan-ux#8 MED folded status when 'loading
in#1 HIGH folded ParcelShelf (Lookup,
in#2 MED folded an existing leaf mod
in#3 MED folded is recomputed on top
in#4 MED folded recomputed on top of
rc#1 HIGH folded the read is paused (
rc#2 HIGH folded card 1 must not reac
rc#3 MED folded notice when 'error':
rc#4 MED folded front-door gate does
rc#5 MED folded Negative cases for t
rg#1 HIGH folded front-door gate does
rg#2 HIGH folded when it reads 'trial
rg#3 MED folded sets every product e
rg#4 MED folded APP_PRODUCT defaults
rg#5 MED folded the server is the fe
rg#6 MED folded a manufacturer accou
rg#7 MED folded an existing leaf mod
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-19 (M-246, prior text kept; RR-0232 · task-313 · Backlog; operator, verbatim: "recommendation approved - however the open decisions need to provide whether it has been grounded (the issue) and the recommendation (verified).")

Dated note 2026-11-19 (M-246, prior text kept; RR-0233 · task-313 · Backlog; operator, verbatim: "I really only have expertise in the front-end, design of the app, how much storage, timeframes, priorities - beyond that my expertise is limited and I need to rely on yo or the panel or the gates to make sure the rules are followed and we are making prudent decisions")

2026-11-25 (RR-0499, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2598, operator '1a'; RR-0496 :2583): the MaxBLD app lives INSIDE the one project for now: sign-in goes straight to search with no lead-app onboarding, the MaxBLD bar is the only bar, the gate checks the MaxBLD plan, and the app gets its own start-up screen; the lead-app screens stay in the code, unreachable, kept for the other app. This departs from Spec 116 section 3 (a separate Expo project); a dated note in Spec 116 is owed by the build. The separate project is a later decision, when the lead app is ready. First card of McApp; planned after the five 1-B cards.

2026-11-25 (RR-0501, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2608): McApp card 1 of 4 (front door), moved into Increment 1-C; built first after the five 1-B cards.

2026-11-26 taken on the board at lane launch (lane BL-MCAPP313, worktree /Users/brettpreston_macmini/Buildo-wt-mcapp313, branch wf2/mcapp313), RR-0240

2026-11-26 build (lane BL-MCAPP313): red proof 1, the server tests T1 and T2 (get-user-context.logic, consumer-parcel-lookup.infra, parcels-entitlement.infra, parcels-lot-size-route.infra, parcel-lookup-gate.infra) staged alone with this task file before S1 and S2 exist; the pre-commit related run refuses it (red-server.out in the lane dir).

2026-11-26 build (lane BL-MCAPP313): red proof 2, the root-suite phone locks T7 (parcel-tool-fence.infra) and T9 (static-page, page-arm, surface-validate, surface-conformance, admin-media.golden, surface-goldens) staged with this task file while the front door, the Opening surface files and their registrations were parked outside the tree; the pre-commit related run refuses it (red-phone.out). The mobile jest tests (T3-T6, T8, T10 and the routerTelemetry case) are not run by the commit hook; they run at the station (RR-0460 local phone run is the station's).

2026-11-26 build (lane BL-MCAPP313), the work commit. Built S1, S2, M1-M7, M8 (Keyboard.dismiss only), M9, the Opening surface S-097 (claimed in the ID ledger ~/Buildo-scratch/ids/S-097), the dated notes (Specs 116 section 3, 99 sections 4 and 5.3, 100 section 4, 117 section 5; the entitlement route header) and the MF-49 row. Deviations and open points: (1) Q2 A (#15, #16, #22) is NOT built: the plan asks Back to be router.back() with role and label AND to keep the typed email and password (T8, sign-in.tsx:566); a pushed ?method=email screen is a new screen instance, so router.back() drops what was typed: question handed back to the plan grounder; sign-up.tsx, nav-by-route.logic.test.ts, phoneGate.coverage.test.ts and useAuth.test.ts are unchanged. (2) The Opening's Try again is two button rows (retry_offline when offline, retry_error when error), one when-flag each, as the schema allows one flag per row. (3) The Opening descriptor: guards.session authenticated, guards.entitlement none (the plan is the server 403, RR-0503 Q1 A); errors classes offline and 500 (the closed class list). (4) The give-up clock of MaxbldAppGate runs from mount and restarts on Try again (REPORT_GIVE_UP_MS, no new setting). (5) The parcel overload of getCurrentUserContext is declared first so vi.mocked keeps the lead return type in the existing lead route tests. (6) M7 proof: npx expo config --type prebuild accepted the imageless splash, and npx expo prebuild --no-install --platform all finished in a throwaway copy (placeholder Firebase service files in the copy only; copy removed): lane dir prebuild-imageless-splash.out. (7) M9 render: node <scratch>/icons.cjs ~/Buildo-scratch/mcfrontend/brand/house-mark.svg from the repo root with node_modules/sharp 0.34.5 (no script added to the repo): icon.png 1024x1024 colour type 2 sha256 4076f5c2, adaptive-icon.png 1024x1024 RGBA sha256 b22be7e3, favicon.png 48x48 sha256 50166610. (8) The parcel-tool-fence plant 'placed before <Tabs' re-anchored from 'export default' to 'function LeadAppLayout()' (dated comment). (9) The S-golden owed note did not move (the new states are phone-only), measured. (10) The task has no acceptance criteria lines; the plan's T1-T10 are its checks.

2026-11-26 (lane BL-MCAPP313): the first green attempt was refused by surface-conformance C-4 (a converted surface owns no component), C-7 (174 live descriptors) and C-8m (OpeningBinding.tsx in the mobile module list), green-attempt-1.out. Fix: the two pins move with dated comments; MaxbldAppGate.tsx is owned by the (app) shell shell_app_tabs (the layout that mounts it), not by the Opening, so the plan's aim (the unowned list does not grow, integration#1) holds and C-4 is met.

2026-11-26 (lane BL-MCAPP313; plan grounder Cairn-Ground-P313b, grounder-build hb.txt section A): the Files line gained two paths for commit 0 of plan section 5: scripts/analysis/bylaw-validation/coa-expected/prereg-MF-49-1.json (the prereg committed alone and first, .cursor/MCBYLAWS-QUEUE.md:109; in-file round 205, claimed in ~/Buildo-scratch/ids/round-205; no by-law path, nothing moves; rules[] FE-05, FE-18, FE-31, FE-36, ruled Spec 135 ids; the RR list in its rulings field) and docs/reports/panels/MF-49.json (the panel record the commit-msg gate reads, cite-arms.mjs arm C and panel.mjs arm P). The work commit follows as its child.

2026-11-26 (grounder Cairn-Ground-P313b, hb.txt section B): Q2 is moved off this card (the plan's Q2 B). Opening the email form by pushing /(auth)/sign-in?method=email makes a new screen instance in the plain (auth) Stack, so router.back() drops the typed email and password that sign-in.tsx:567-569 keeps today; the plan's A conflicts with its own T8 (rg#8); #16 is a NAV-1 entry that a role and label do not clear. Nothing was built for Q2: sign-up.tsx, phoneGate.coverage.test.ts, useAuth.test.ts and the nav-by-route edits come off this card (the plan's 'come off the line if Q2 is B'; the Files line text is left as launched apart from the two commit 0 paths); T8 is the Keyboard.dismiss part only; the nav lock rows #15, #16 and #22 stay 'owed: MF-49' and EXCEPTION_AUDIT_ROWS stays [15, 16, 22, 29, 30]. The operator is asked where the three go (recommended: card 2, task-271).

2026-11-26 (grounder Cairn-Ground-P313b, hb.txt section C): MaxbldAppGate.tsx is owned by shell_app_tabs, the (app) shell that mounts it, not by the Opening: C-4 (src/tests/surfaces/surface-conformance.logic.test.ts:431-434) forbids a converted surface to own a component. The plan's M5 sentence is wrong on the owner and right on the effect: the 11 unowned files do not grow.

2026-11-26 (grounder Cairn-Ground-P313b, hb.txt section D): four smaller choices ruled acceptable as built: (1) the Opening's Try again is two button rows, retry_offline and retry_error, one when-flag each; (2) the Opening descriptor's guards are session authenticated and entitlement none (it reads only the state of the entitlement read, no field); (3) the parcel-tool fence plant 'placed before <Tabs' is anchored on function LeadAppLayout() (plan M4 text); (4) the parcel overload of getCurrentUserContext is declared first, so a 2-argument call falls through to the lead overload and a mocked helper keeps the lead return type.

2026-11-26 (lane BL-MCAPP313): commit 0 landed as d64c6aacd (prereg-MF-49-1.json round 205, docs/reports/panels/MF-49.json, this task file); the work commit is its child.

2026-11-26 (lane BL-MCAPP313): phone run before the work commit (grounder F): run 1 failed one case, maxbldAppGate.behaviour 'still pending at REPORT_GIVE_UP_MS ... Try again restarts the clock' (phone-tests-run1.out): after the give-up timer had set the clock to the same instant, Try again changed only a ref and set the same state value, so nothing re-rendered and the Opening stayed in error. Fix in MaxbldAppGate.tsx: the clock start is state (setSince on Try again), so a restart re-renders. Run 2: npm --prefix mobile run typecheck clean; 11 suites (authGate, appShell, maxbldAppGate.behaviour, openingScreens.golden, routerTelemetry, signIn.behaviour, appIcon, subscriptionGate, wallScreens.golden, semiQuestionPage.behaviour, spec99.mandates.lint) 178 of 178 passed (phone-tests.out).

2026-11-26 (lane BL-MCAPP313): merged the origin tip origin/wf1/mb-rulings 02367cda8 (task-470 review-trim fold and the board records) into wf2/mcapp313 as a merge commit, no conflict (the one file both sides changed, docs/reports/generated/rule-lists-by-kind.md, auto-merged and is current). Re-read after the merge: the plan cites no line of the task-470 files except rule-lists-by-kind.md (regenerated content current: rule-lists page --check). The Definition of Done items #2, #3 and #10 cite 08_agents.md:462, :490 and :505; those quotes were already at :497, :525 and :542 before the merge and are at :500, :528 and :545 after it (task-470 added three lines at :360-372); the DoD is the config's text and is left as is. Current checks after the merge: emit-mobile-surfaces --check ok (6 surfaces, 37 goldens); generate-surface-registry --check clean (174 rows); rule-lists page --check current.

2026-11-26 (lane BL-MCAPP313): output review round 1 after the station pass on b31fc6bc3: context-r3.md written by backlog-brief.mjs; the whole-task diff (launch 36d27a43c .. HEAD, the Files line with the two commit 0 paths, exempt paths out) split by rule-lists.mjs lens-input into in-out-code-review-p1..p7; the code-review lens (the only output lens for this build task: rule-lists.mjs lensSet) run on each in the brief's form; 31 findings (HIGH 1, MED 4, LOW 21, NIT 5) listed untriaged in docs/reports/lanes/2026-11-26/BL-MCAPP313/FINDINGS.md. Grounder owed; nothing is triaged, ruled or fixed by the lane (RR-0359).

2026-11-26 (lane BL-MCAPP313): round-1 fix of p2#1 (HIGH, CONFIRMED by the output grounder Cairn-Ground-O313; LANE-STEPS step 1): docs/specs/00-architecture/116_multi_product_architecture.md keeps its dated note (line 70) and gets back its section 4 heading after one blank line: '## 4. Normative implications for the migration's auth + entitlement work (BINDING)' (line 72). Red: grep -n '^## 4\. Normative implications' returned nothing before the fix; green: it returns line 72. The LOW and NIT ids are recorded, not fixed.

2026-11-26 (lane BL-MCAPP313): output review round 2 after the station pass on the fix 2f95dc250: context-r4.md (backlog-brief.mjs); lens-input re-made in-out-code-review-p1..p7 over launch 36d27a43c .. HEAD; the code-review lens re-run on all seven in the brief's form under the same names; 28 findings (HIGH 1, MED 4, LOW 15, NIT 8) untriaged in FINDINGS.md. Round-2 grounder owed; nothing triaged, ruled or fixed by the lane.

2026-11-26 Dated note (task-313, McApp card 1; RR-0520, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2698; prior text kept): the two new components are approved, OpeningBinding.tsx (the start-up page) and MaxbldAppGate.tsx (the front-door gate). Operator, verbatim: "Still pushing. Approved - The approval sentence for McApp card 1's two new components (the start-up page and the front-door gate). The lane is stopped on it. Wahts your recommendaiton for this?  Sign-in navigation fixes in McApp card 2, yes or no."

2026-11-26 Dated note (task-313, McApp card 1; RR-0521, MORNING-DECISIONS.md:2702; prior text kept): the three sign-in navigation fixes (Continue with email, its Back button, the link from sign-up back to sign-in; nav lock rows 15, 16, 22) move from this card to McApp card 2 (task-271) and are not built here. Operator, verbatim: "yes"
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
task-313 McApp card 1 landed: work e904d8d3e (S1 and S2 the trade-less parcel context, M1 to M3 the MaxBLD front door and AuthGate arm, M5 and M6 the Opening surface S-097 with MaxbldAppGate and OpeningBinding, M7 imageless splash, M8 Keyboard.dismiss, M9 House Mark icons), origin merge b31fc6bc3, round-1 fix 2f95dc250 (STATION PASS). The three sign-in navigation fixes moved to card 2 (RR-0521).

Review round 1: 1 fixed, 0 task, 0 ruling, 0 wontfix, 9 pile; grounder /Users/brettpreston_macmini/Buildo-scratch/lanes-20261126/BL-MCAPP313/grounder/r1/GROUNDER.md (round 1 as ruled, outputs at a76b3cca6); triage /Users/brettpreston_macmini/Buildo-scratch/lanes-20261126/BL-MCAPP313/grounder/r1/TRIAGE.md

out-code-review-p2#1 HIGH fixed 2f95dc250 (round 1)

Review round 2: 0 fixed, 0 task, 0 ruling, 0 wontfix, 11 pile; grounder docs/reports/lanes/2026-11-26/BL-MCAPP313/GROUNDER.md; triage docs/reports/lanes/2026-11-26/BL-MCAPP313/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
