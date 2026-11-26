# Review context for task-313 (MF-49) written 2026-11-26 by backlog-brief.mjs (round 2)

## Task
task-313 MF-49 MaxBLD mobile app: the front door, inside the one Expo project (McApp card 1)
status: RUNNING · milestone: m-2 · assignee: @lane-BL-MCAPP313 · labels: queue-row, McApp

## Description
Full title: MF-49 MaxBLD mobile app: a separate Expo project in a monorepo (Spec 116 section 3)

queue row: MF-49 (lane E; row status LATER · since 2026-11-09 · expires 2026-11-16 · next: G1 #11 · Plan when MF-47 and MF-51 settle); the row stays the record (Spec 137 rule 2) and a lane edits the row and this task in the same commit (rule 3). Mirrored by task-306 (R8a, RR-0232) because the row expired 2026-11-16 and waits on the operator's renew, drop or answer word.

Grounded: yes. Row MF-49 'MaxBLD mobile app: a separate Expo project in a monorepo (Spec 116 section 3)', Status: LATER since 2026-11-09, expires 2026-11-16, next 'G1 #11 Plan when MF-47 and MF-51 settle' (.cursor/MCFRONTEND-QUEUE.md:347-348). Expired under Spec 137 rule 7 (137_mcqueue.md:112). MF-47 is WAITS, expires 2026-11-24 (:334); MF-51 is WAITS 'expires when MF-49 ships ... waits: MF-49 app' (:375): the two rows wait on each other. Milestone m-8 (Increment 6c) is placed by the plan items 6c.24 and 6c.26 (task-110, task-112, milestone m-8) that carry the refresh of these expired rows (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:21), not by the row itself: UNVERIFIED as increment ownership. The mirror shows the row as waiting on the operator's renew, drop or answer word (Spec 137 rule 7), not the row's own status word.
Recommendation: renew with a named event, `expires when MF-47 is DONE` (Spec 137 rule 12, 137_mcqueue.md:129). Proposed follow-up, not part of R8a: MF-51 itself waits on MF-49 (.cursor/MCFRONTEND-QUEUE.md:375), so the row's wait on MF-51 is circular. UNVERIFIED: review r1 of task-306 (r1-plan.txt) tested the routing of this item, not the answer.

## Acceptance criteria

## Implementation Plan
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

Files: src/lib/auth/get-user-context.ts, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/entitlement/route.ts, src/app/api/parcels/lot-size/route.ts, mobile/src/lib/appShell.ts, mobile/src/lib/auth/decideAuthGateRoute.ts, mobile/app/_layout.tsx, mobile/app/(app)/_layout.tsx, mobile/src/components/parcel/MaxbldAppGate.tsx, mobile/src/components/surfaces/OpeningBinding.tsx, mobile/app.json, mobile/app/(auth)/sign-in.tsx, mobile/app/(auth)/sign-up.tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_opening.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_opening.content.json, mobile/src/generated/surfaces/mobile_parcel_opening.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/converted-surfaces.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/auth-class-parity-exceptions.json, scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_list.descriptor.json, scripts/surfaces/platform_shared/F14/surfaces/shell_app_tabs.descriptor.json, scripts/surfaces/opening-golden-capture.ts, mobile/__tests__/fixtures/surfaces/mobile_parcel_opening.goldens.json, mobile/__tests__/fixtures/opening.situations.json, src/tests/fixtures/surfaces/mobile_parcel_opening, docs/reports/policy/policy-ledger.json, src/tests/get-user-context.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, src/tests/parcels-entitlement.infra.test.ts, src/tests/parcels-lot-size-route.infra.test.ts, src/tests/surfaces/parcel-tool-fence.infra.test.ts, src/tests/surfaces/nav-by-route.logic.test.ts, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/page-arm.logic.test.ts, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/admin-media.golden.test.ts, src/tests/surfaces/surface-goldens.ts, mobile/__tests__/authGate.test.ts, mobile/__tests__/appShell.test.ts, mobile/__tests__/maxbldAppGate.behaviour.test.tsx, mobile/__tests__/openingScreens.golden.test.ts, mobile/__tests__/signIn.behaviour.test.tsx, mobile/__tests__/phoneGate.coverage.test.ts, mobile/__tests__/useAuth.test.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/116_multi_product_architecture.md, docs/specs/03-mobile/99_mobile_state_architecture.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, .cursor/MCFRONTEND-QUEUE.md, src/tests/surface-registry.infra.test.ts, src/tests/parcel-lookup-gate.infra.test.ts, mobile/__tests__/routerTelemetry.test.ts, scripts/surfaces/platform_shared/F14/surfaces/shell_app_root.descriptor.json, mobile/assets/icon.png, mobile/assets/adaptive-icon.png, mobile/assets/favicon.png, mobile/__tests__/appIcon.test.ts, docs/specs/00-architecture/117_maxbld_brand.md
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

## Implementation Notes
Dated note 2026-11-19 (M-246, prior text kept; RR-0232 · task-313 · Backlog; operator, verbatim: "recommendation approved - however the open decisions need to provide whether it has been grounded (the issue) and the recommendation (verified).")

Dated note 2026-11-19 (M-246, prior text kept; RR-0233 · task-313 · Backlog; operator, verbatim: "I really only have expertise in the front-end, design of the app, how much storage, timeframes, priorities - beyond that my expertise is limited and I need to rely on yo or the panel or the gates to make sure the rules are followed and we are making prudent decisions")

2026-11-25 (RR-0499, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2598, operator '1a'; RR-0496 :2583): the MaxBLD app lives INSIDE the one project for now: sign-in goes straight to search with no lead-app onboarding, the MaxBLD bar is the only bar, the gate checks the MaxBLD plan, and the app gets its own start-up screen; the lead-app screens stay in the code, unreachable, kept for the other app. This departs from Spec 116 section 3 (a separate Expo project); a dated note in Spec 116 is owed by the build. The separate project is a later decision, when the lead app is ready. First card of McApp; planned after the five 1-B cards.

2026-11-25 (RR-0501, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2608): McApp card 1 of 4 (front door), moved into Increment 1-C; built first after the five 1-B cards.

2026-11-26 taken on the board at lane launch (lane BL-MCAPP313, worktree /Users/brettpreston_macmini/Buildo-wt-mcapp313, branch wf2/mcapp313), RR-0240

## References
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
- compliance:inc-1-2 backlog/docs/increments/doc-3 - Increment-1-2-requirements.md
- compliance:ms-1-2 backlog/milestones/m-2 - increment-1·c-launch-shared-parts-[1-2].md

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
- RR-0328 The app is not in use, in development — "remember the app is not beign used - we are in development" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1422)
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
- RR-0341 Loading screen gives up after 60 seconds — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610)
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
- RR-0442 the search opens a lot on an exact match
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses
- RR-0444 fold the McFixReborn findings
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks
- RR-0448 the search-fix cards are created as 8 merged tasks
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles
- RR-0452 tooling plan approved; the three questions are not added
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once
- RR-0149 Increment 1·A tooling location
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests
- RR-0461 Card 461 clean seat report: run a fresh integration seat
- RR-0462 Phone checks quick plan approved; a dead card carries only the label dead
- RR-0463 Task 458 haptic feedback moves to Increment 1C
- RR-0464 Task 460: no separate security review at output; the validating grounder reads the sensitive files
- RR-0465 task 455 (a confidence word per reading) moves to Increment 1·D beside task 76
- RR-0466 task 452 limit screen keeps the notice box, first line emphasised, new wording
- RR-0150 Infra freeze named list
- RR-0467 task 452 line three is wording A; station runs on the fix commit before the review
- RR-0468 task 452 failed-read notice on the limit screen: Something went wrong on our side. Please try again.
- RR-0469 task 452 the limit screen's own code file WallBinding.tsx is confirmed
- RR-0471 iPhone run: free Apple account, phone may reach the Mac on the home Wi-Fi, GO for a read-only test database check
- RR-0472 GO: bring the local test database up to the current migrations
- RR-0473 Yes: install CocoaPods and copy the Google settings file, local only
- RR-0474 External drive left alone; tasks 463, 456 and 454 worked overnight
- RR-0475 answers to the six morning questions
- RR-0476 phone test next; two process questions asked
- RR-0477 phone test now; batching rule adopted — "batch items that touch the same files or the same kind of file and need no database step. Keep anything with a database step or its own operator question on its own card." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2496)
- RR-0152 Increment 1·A re-use and drops
- RR-0478 sign-up allow-list entry confirmed (task-456)
- RR-0479 brief lines and the batching line, without the lane process
- RR-0480 phone test: onboarding flag for one test user on the local test database — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2510)
- RR-0481 phone test: report switch on locally, onboarding flag for the at-limit test user
- RR-0482 phone walk findings: sort, rule, batch into larger cards; fold 454 and seed the test stack — "Agreed. Remember our new policy on tasks - ie larger tasks and using existing components as well." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2518)
- RR-0483 search box the Google way, Enter wired, a card for the report counter
- RR-0484 dev GO for the six task-454 settings rows
- RR-0485 phone walk rulings: semi inside the search card, range check 1.C, no onboarding question, no report without pricing, loading animation always, Enter opens the lot — "We should not send a report without pricing - the report needs to be complete." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2533)
- RR-0486 McFixV2: phone walk fixes go into five existing cards, relabelled; go given — "relablet these fixes as McFixV2 - and remove all other labels - 5 tasks in total." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2538)
- RR-0487 task-465 search box mock approved
- RR-0154 Work pulling
- RR-0488 dead label only for absorbed cards; pushed cards move on to done; phone walk a standing proof step; search proof split — "But tasks that finish and are pushed then move through as normal as done." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2547)
- RR-0489 search proof reduced to four steps: phone walk, one database read, pointer to passing tests, known gaps list
- RR-0490 load failure: keep the built sentence; animation finishes before a failure shows; no-report screen with the address; give-up time pending a mock
- RR-0491 loading screen endings mock approved, loading line centred
- RR-0492 loading: a failure shows right away; lines stay on the ending screens for now; changes RR-0490 3 b
- RR-0493 loading: 60 seconds is the failure limit; the label Checks for this lot is shown; no-report shows at once (as read)
- RR-0494 loading: a lot with no report shows the no-report screen at once
- RR-0495 search box: the type-more prompt line is dropped; a too-short entry on Enter shows No lot found
- RR-0496 app first: the app tasks grouped as McApp (incl. saving a lot or report); McWeb pages; McLive and McNightlyTests proposed for later — "These grouped tasks are McApp." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2583)
- RR-0497 loading plan: 1 A, 2 A, 3 A; saving a lot is McApp; no cloud database move until the increments are complete
- RR-0156 Push 6 literal test
- RR-0498 McApp and McWeb: Account first version yes; nightly tests later; card for plans, success and cancel pages; 8 db test failures onto the loose-ends card; paid test user to its limit on the test database — "Obviously, users will need to save lots 3. y 4. yes later 5. y" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2593)
- RR-0499 the MaxBLD app lives inside the one project (A); search page not converted to table rows; Expo upgrade yes — "unlcear why we would convert it - maybe a stale task. 10. upgrade" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2598)
- RR-0500 saving a lot builds now with McApp
- RR-0501 Increment 1-C plan approved: McApp four cards first, then McWeb three with wiring; polish and later items to the last increment — "So we have four mega tasks for McApp - that looks good and three for McWeb." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2608)
- RR-0502 review skip list: add the generated phone picture copies (card 465 blocker)
- RR-0503 card 313 front door: no-plan user reaches search and sees the notice (1 A); start-up screen differences accepted (3 A) — "maybe its faster just to rebuild from scratch clen 3. a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2618)
- RR-0504 stay with A: the MaxBLD app stays inside the one project — "stay with A" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2623)
- RR-0505 card 313: a deleted account reaches search with the no-plan notice until card 2 (A) — "Operator, verbatim: " (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2628)
- RR-0506 McApp: the phone icon logo joins card 313; card 469 order: build, station, review, grounder, fold, close — "the only other missing piece on the McApp is the phone icon logo - this should be added as well to the existing task . add the order." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2633)
- RR-0507 the phone icon is the approved House Mark with the MaxBLD brand name added at the top
- RR-0157 Push 6 R-MD
- RR-0508 phone icon: MaxBLD inside the square just above the house; BLD in the agreed colour
- RR-0509 phone icon: the mark alone, no name inside (replaces RR-0507 and RR-0508)
- RR-0510 card 313 title is stale; retitled to match RR-0499
- RR-0511 Review process trimmed: plan folds critical and high only; round 2 narrowed; generic plan review off; security on security items
- RR-0512 Fable is added as the planner; Opus stays the writer
- RR-0513 Review-trim plan approved, with suggestions A, B and C added
- RR-0514 Review-trim card 470: piece 2 deferred to task-414; mediums still fixed in the plan; contact files not personal data
- RR-0515 Start Increment 1C (McApp card 1) while the second phone walk findings are sorted
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
- RR-0232 Open decisions: grounding and verified recommendation — "recommendation approved - however the open decisions need to provide whether it has been grounded (the issue) and the recommendation (verified)." (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:925)
- RR-0233 Operator expertise scope — "I really only have expertise in the front-end, design of the app, how much storage, timeframes, priorities - beyond that my expertise is limited and I need to rely on yo or the panel or the gates to make sure the rules are followed and we are making prudent decisions" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:925)
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
m-2 Increment 1·C Launch-shared parts [1-2]

### Description

Launch-shared (1-2): report page, search, public route parts

### Problems
- Customer report returns nothing (page:null until MB-44) (~/Buildo-scratch/plan-gen/out/finalplan.json:159) "Customer report returns nothing (page:null until MB-44)"
- All-lot headline fill not built (MB-38); the 1,921 lots are the test cohort by design (~/Buildo-scratch/plan-gen/out/finalplan.json:166) "All-lot headline fill not built (MB-38); the 1,921 lots are the test cohort by design"
- Search defects (E/W wrong lot, units, ranges): search page, not a scenario (~/Buildo-scratch/plan-gen/out/finalplan.json:173) "Search defects (E/W wrong lot, units, ranges): search page, not a scenario"

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Launch-shared work (search fixes, billing, account, tracked lots, landing, lawyer check, McTest harness) has its own home (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:37) "LAUNCH-SHARED home: work that serves the finished product but no single scenario"
- What the customer sees: the report page parts every scenario shares (~/Buildo-scratch/lanes-20261117/req-elements/elements-by-inc.json:3579) "Report page parts shared by every scenario (header, lot facts, lot-size box, ads, footer)"
- The launch list is MCFRONTEND-QUEUE.md line 498 (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:37) "McFrontend launch list MCFRONTEND-QUEUE.md:498"
- Tracked lots (MF-51) and alert delivery (MF-59) are on the launch list (origin:.cursor/MCFRONTEND-QUEUE.md:498) "MF-51 and MF-59 live"

### Deliverable
- Done means the scenario works for a customer on a real lot on the real page (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:11) "An increment is done only when, on a real lot on the real page"
- The nine parts: engine rows, storage as ruled, page section and binding, display text, public route, cost line, CoA per option, search hand-off, measured check (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:11) "(1) engine rows right (answer key); (2) stored as ruled"
- Measured population: the designed element is populated, counted on the admin/tester page (~/Buildo-scratch/lanes-20261117/replan/SCENARIO-SLICES.md:44) "P12 Measured population"
- Measurable check: LS.9: McTest lot sweep: L3a (fields the screen shows) now, L3b (stored headline value or closed not_evalua (~/Buildo-scratch/plan-gen/out/finalplan.json:104) "McTest lot sweep: L3a (fields the screen shows) now, L3b (stored headline value or closed not_evalua"
- Measurable check: LS.12: Web live switch: flip MAXBLD_WEB_LIVE and the W4 live lookup together at launch, after MB-44 (gap S1 (~/Buildo-scratch/plan-gen/out/finalplan.json:144) "Web live switch: flip MAXBLD_WEB_LIVE and the W4 live lookup together at launch, after MB-44 (gap S1"
- Problem closed at the end of this group: Customer report returns nothing (page:null until MB-44) (~/Buildo-scratch/plan-gen/out/finalplan.json:159) "Customer report returns nothing (page:null until MB-44)"
- Problem closed at the end of this group: All-lot headline fill not built (MB-38); the 1,921 lots are the test cohort by design (~/Buildo-scratch/plan-gen/out/finalplan.json:166) "All-lot headline fill not built (MB-38); the 1,921 lots are the test cohort by design"
- Problem closed at the end of this group: Search defects (E/W wrong lot, units, ranges): search page, not a scenario (~/Buildo-scratch/plan-gen/out/finalplan.json:173) "Search defects (E/W wrong lot, units, ranges): search page, not a scenario"

### Specs
- Spec 08 agents (11.8 McIncrement recipe, 11.9 ticket header): origin:docs/specs/00-architecture/08_agents.md (process every increment follows)
- Spec 137 McQueue (status line, rules 1-12): origin:docs/specs/00-architecture/137_mcqueue.md (where each task lives and how its status is kept)
- Spec 122 pipeline step optimization: origin:docs/specs/01-pipeline/122_pipeline_step_optimization.md (step standard (Airtight V3))
- Spec 124 step standard policy and 124a appendix (Airtight V3 register rows): origin:docs/specs/01-pipeline/124_step_standard_policy.md (register rules every step change meets)
- Spec 132 step standard handbook: origin:docs/specs/01-pipeline/132_step_standard_handbook.md (the Airtight V3 handbook)
- Spec 133 by-law handbook: origin:docs/specs/01-pipeline/133_bylaw_handbook.md (by-law step rules)
- PROTOCOL.md research and build protocol: ~/Buildo-scratch/panel-tools/PROTOCOL.md (lenses 1-9, design fit, operating rules)
- PLAN-PROTOCOL.md scenario slices (done-definition, the 9 parts): ~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md (what done means for an increment)
- McSTORAGE-RULINGS.md (ST-1..ST-8): ~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md (storage rulings)
- SCENARIO-SLICES.md (section 0a re-cut, 0c checklist): ~/Buildo-scratch/lanes-20261117/replan/SCENARIO-SLICES.md (the nine slice parts per scenario)
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md (operator rulings, newest at the bottom)
- ONE-SITTING.md (open questions, numbered): ~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md (every open ruling)
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md (report bindings and display text rules)
- Spec 135 McFrontend decisions register: origin:docs/specs/02-web-admin/135_mcfrontend_decisions_register.md (FE rules for report elements)
- Spec 136 McFrontend handbook: origin:docs/specs/02-web-admin/136_mcfrontend_handbook.md (front-end handbook)
- MCFRONTEND-QUEUE.md (launch list at line 498): origin:.cursor/MCFRONTEND-QUEUE.md (front-end rows and launch list)
- McFrontend phase1 open-questions.md (report rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md (dated report rulings)
- REPORT-LAYOUT-BRIEF-v4.md (superseded where CHANGES.md differs): ~/Buildo-scratch/mcfrontend/fields/REPORT-LAYOUT-BRIEF-v4.md (B-sections per element)
- MF-83 plan (Daylight colour ruling D-1): ~/Buildo-scratch/mcfrontend/MF-83/plan.md (colour entry and condition at line 219)
- req-rulings/CHANGES.md (report element rulings after the brief): ~/Buildo-scratch/lanes-20261117/req-rulings/CHANGES.md (later rulings win over the brief)
- elements-by-inc.json (per-scenario report element list): ~/Buildo-scratch/lanes-20261117/req-elements/elements-by-inc.json (what the customer must see)
- LOT-VIEWS-RULE.md: ~/Buildo-scratch/mcfrontend/report-themes/LOT-VIEWS-RULE.md (lot view drawing rule)
- Report Theme B · Daylight model (latest drawn mock; local report-themes/pub/B.html): https://claude.ai/artifact/LRAd9sbNHxyoDWhBcyZpyJ (latest drawn report; the current report = this mock + later rulings, base confirmed by the operator 2026-11-18)
- Daylight B Report Colours: https://claude.ai/artifact/N91HBpVkcX24DRcCMNVX4p (report colour keys)
- Fixed Image Candidates: https://claude.ai/artifact/RyQ7nMKmMXtdkzerixu8gQ (fixed option pictures)
- inc-plan/1-2 (review, sitting, push contents): ~/Buildo-scratch/lanes-20261117/inc-plan/1-2/SITTING.md (the increment plan reviewed under the protocol)
- gap-register REGISTER.md and SITTING.md: ~/Buildo-scratch/lanes-20261117/gap-register/SITTING.md (gap questions Q1-Q12)
- SEARCH-AVAILABILITY.md (search design availability): ~/Buildo-scratch/lanes-20261117/avail-search/SEARCH-AVAILABILITY.md (search surfaces and what they need)
- Spec 89 parcel cost model tool (search): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md (search parser rules)
- Spec 100 mobile parcel cost tool: origin:docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (mobile payload tiers)

### Rulings
- Increment order is 7 semi, 8 sixplex, 9 merged measure, 10 McProof (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:342) "7 is semit detached 8 is sixplex and 9 merger and 10 is McProof"
- Launch means users on the live customer report, not tester preview (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:568) "LAUNCH = users on the live report"
- McStorage ST-1..ST-8 approved as ruled (headline record per lot and option; detail on demand) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:5) "ST- all y"
- Colour ruling D-1 (2026-11-14): the built report must look like the Daylight B mock; this is a colour ruling, not a whole-layout approval (~/Buildo-scratch/mcfrontend/MF-83/plan.md:219) "the built report must look like the Daylight B mock"
- Earlier approval: dark mock v21 (2026-11-10); superseded for colour, summary, gallery, lot views and See details sheets by the later theme and rulings (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:866) "2026-11-10 mock v21: APPROVED (operator, verbatim)"
- Theme ruled: Daylight B (light) with the summary at the top (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1094) "RULING: report theme = B Daylight model (with the options-at-a-glance summary)"
- Report base confirmed by the operator: the published Report Theme B · Daylight model + the later rulings (CHANGES.md); identity of the published page vs pub/B.html being checked (REPORT-DELTA) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:665) "I have the artifact Report Theme b - Daylight  model"
- Page-level rulings after the brief (theme, brand, summary, units switch, one lot-size box, one disclaimer) are in CHANGES.md (~/Buildo-scratch/lanes-20261117/req-rulings/CHANGES.md:1) "Report element rulings after the layout brief"
- Theme: Daylight B (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1094) "RULING: report theme = B Daylight model"
- Status word for a number with no stored row: Not yet estimated (amends the earlier label) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:592) "amend M-367 label to"
- One short disclaimer everywhere (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1073) "2 one disclaimer everywhere: yes"
- Open question 34 (ONE-SITTING.md): Storage D1 and D2 with gap Q12: name the wait a user may have on See details and after typing the house in (only (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:64) "Storage D1 and D2 with gap Q12: name the wait a user may have on See details and after typing the house in (only"
- Open question 35 (ONE-SITTING.md): Gap Q2 (LS.11): W5 (choose your parcel) on the web: (b) defer until the web has a map ruling and keep the web live switc (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:65) "Gap Q2 (LS.11): W5 (choose your parcel) on the web: (b) defer until the web has a map ruling and keep the web live switc"
- Open question 5 (ONE-SITTING.md): MB-44 order and the three dated notes W needs (RESOLVE R10, R11, R12), plus wiring What-we-checked into the route (gap Q (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:15) "MB-44 order and the three dated notes W needs (RESOLVE R10, R11, R12), plus wiring What-we-checked into the route (gap Q"

### Register rulings of this group (operator words)
- RR-0012 2026-11-15: Increment order is 7 semi, 8 sixplex, 9 merged measure, 10 McProof (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:342) "7 is semit detached 8 is sixplex and 9 merger and 10 is McProof"
- RR-0014 undated: McStorage ST-1..ST-8 approved as ruled (headline record per lot and option; detail on demand) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:5) "ST- all y"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
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
- RR-0215 2026-11-19: Images round 4: sets A and D only; every option and the corner/through lot variants; basement seen through the land; one rotation, one plane thickness, one palette across sets and options. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "Set A and Set D were the best overall"
- RR-0217 2026-11-19: Concept photo gallery: three concept photos per scenario, each a different idea; options 1 and 2 add the 1,500 / 3,000 / 5,000 sq ft sizes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:861) "we need three each"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- PAN: Panel lenses on every plan item: compliance, grounding, reality, options, regression, integration, surrounding work, then final check (~/Buildo-scratch/panel-tools/PROTOCOL.md:9)
- FIVE: Five principles: standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3)
- SC: Simplicity guard: a task is added only if it fills one of the nine slice parts or one supporting function, with a source (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:25)
- STAT: One status line per row, replaced in the same commit as the work (Spec 137 rules 1 and 3) (origin:docs/specs/00-architecture/137_mcqueue.md:45)
- BLD: Build on the tip: red tests first, then code, through the real hooks (MCINC-4) (origin:docs/specs/00-architecture/08_agents.md:490)
- HS: Hooks plus the full suite on the current origin tip before anything is called ready (MCINC-4) (origin:docs/specs/00-architecture/08_agents.md:490)
- BYL: McBylaws process: by-law step conversion; queue row first; no code names a zone, scenario or regulation id (M-61) (origin:.cursor/MCBYLAWS-QUEUE.md:100)
- STO: McStorage rulings ST-1..ST-8: headline record per (parcel, option); detail on demand; long form for bounded cohorts only (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:130)
- DN: A ruling enters its row as a verbatim dated note, prior text kept (M-246; Spec 137 rule 10) (origin:docs/specs/00-architecture/137_mcqueue.md:109)
- REN: Relay check: a claim that nothing covers it is checked by a grep of the full record and the search is quoted (~/Buildo-scratch/panel-tools/PROTOCOL.md:48)
- RH: Rehearse every DB job on the local test stack, with the real hooks, before the go (MCINC-7; Spec 137 rule 9) (origin:docs/specs/00-architecture/08_agents.md:495)
- GO: Operator-typed GO on dev, one DB job at a time (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:84)
- ID: Claim every MF, FE, MB, migration, prereg round, D and M number in the ID ledger before use (MCINC-8) (origin:docs/specs/00-architecture/08_agents.md:496)
- AV3: McDonald's Airtight V3: the step standard (Spec 122/124/132 path); no exception paths; calcs as data, switches, tests first (origin:docs/specs/01-pipeline/124_step_standard_policy.md:250)
- FIT: Design-fit gate: every stored or built value maps to a designed McFrontend element or a named supporting function; every designed number bound, served, populated (~/Buildo-scratch/panel-tools/PROTOCOL.md:25)

### Documents
- Requirements: backlog/docs/increments/doc-3 - Increment-1-2-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-3 - Increment-1-2-requirements.md#L20) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#1-2
- McStorage policy for this increment: none in the snapshot (2026-11-19): doc-16 section 5 has no row for group 1-2; docs/reports/plan-import/raw/2026-11-19/storage-by-group.json has no key 1-2: none in the snapshot (2026-11-19)

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-3 - Increment-1-2-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-3 - Increment-1-2-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-3 - Increment-1-2-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-3 - Increment-1-2-requirements.md)

### McStorage policy for this increment: none in the snapshot (2026-11-19): doc-16 section 5 has no row for group 1-2; docs/reports/plan-import/raw/2026-11-19/storage-by-group.json has no key 1-2: none in the snapshot (2026-11-19) (not readable: ENOENT; read it at McStorage policy for this increment: none in the snapshot (2026-11-19): doc-16 section 5 has no row for group 1-2; docs/reports/plan-import/raw/2026-11-19/storage-by-group.json has no key 1-2: none in the snapshot (2026-11-19))

## Decisions naming this task
- RR-0328 The app is not in use, in development (names RR-0328) — "remember the app is not beign used - we are in development" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1422)
- RR-0341 Loading screen gives up after 60 seconds (names RR-0341) — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions (names MF-49) — "yes. worktrees removed" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2134)
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process (names RR-0445) — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0477 phone test now; batching rule adopted (names RR-0477) — "batch items that touch the same files or the same kind of file and need no database step. Keep anything with a database step or its own operator question on its own card." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2496)
- RR-0480 phone test: onboarding flag for one test user on the local test database (names RR-0480) — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2510)
- RR-0482 phone walk findings: sort, rule, batch into larger cards; fold 454 and seed the test stack (names RR-0482) — "Agreed. Remember our new policy on tasks - ie larger tasks and using existing components as well." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2518)
- RR-0485 phone walk rulings: semi inside the search card, range check 1.C, no onboarding question, no report without pricing, loading animation always, Enter opens the lot (names RR-0485) — "We should not send a report without pricing - the report needs to be complete." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2533)
- RR-0486 McFixV2: phone walk fixes go into five existing cards, relabelled; go given (names RR-0486) — "relablet these fixes as McFixV2 - and remove all other labels - 5 tasks in total." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2538)
- RR-0488 dead label only for absorbed cards; pushed cards move on to done; phone walk a standing proof step; search proof split (names RR-0488) — "But tasks that finish and are pushed then move through as normal as done." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2547)
- RR-0496 app first: the app tasks grouped as McApp (incl. saving a lot or report); McWeb pages; McLive and McNightlyTests proposed for later (names RR-0496) — "These grouped tasks are McApp." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2583)
- RR-0498 McApp and McWeb: Account first version yes; nightly tests later; card for plans, success and cancel pages; 8 db test failures onto the loose-ends card; paid test user to its limit on the test database (names RR-0498) — "Obviously, users will need to save lots 3. y 4. yes later 5. y" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2593)
- RR-0499 the MaxBLD app lives inside the one project (A); search page not converted to table rows; Expo upgrade yes (names RR-0499) — "unlcear why we would convert it - maybe a stale task. 10. upgrade" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2598)
- RR-0501 Increment 1-C plan approved: McApp four cards first, then McWeb three with wiring; polish and later items to the last increment (names RR-0501) — "So we have four mega tasks for McApp - that looks good and three for McWeb." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2608)
- RR-0503 card 313 front door: no-plan user reaches search and sees the notice (1 A); start-up screen differences accepted (3 A) (names RR-0503) — "maybe its faster just to rebuild from scratch clen 3. a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2618)
- RR-0504 stay with A: the MaxBLD app stays inside the one project (names RR-0504) — "stay with A" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2623)
- RR-0505 card 313: a deleted account reaches search with the no-plan notice until card 2 (A) (names RR-0505) — "Operator, verbatim: " (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2628)
- RR-0506 McApp: the phone icon logo joins card 313; card 469 order: build, station, review, grounder, fold, close (names task-313, RR-0506) — "the only other missing piece on the McApp is the phone icon logo - this should be added as well to the existing task . add the order." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2633)
- RR-0232 Open decisions: grounding and verified recommendation (names task-313, RR-0232) — "recommendation approved - however the open decisions need to provide whether it has been grounded (the issue) and the recommendation (verified)." (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:925)
- RR-0233 Operator expertise scope (names task-313, RR-0233) — "I really only have expertise in the front-end, design of the app, how much storage, timeframes, priorities - beyond that my expertise is limited and I need to rely on yo or the panel or the gates to make sure the rules are followed and we are making prudent decisions" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:925)

## Prior reviews and lane reports
### task-313 (this task)
- docs/reports/reviews/task-313/FINDINGS-PLAN.md
- docs/reports/reviews/task-313/FOLD-CHECK.md
- docs/reports/reviews/task-313/GROUNDER-PLAN.md
- docs/reports/reviews/task-313/QUESTIONS-RULED.md
- docs/reports/reviews/task-313/TRIAGE-PLAN.md
- docs/reports/reviews/task-313/seat-integration-1.md
- docs/reports/reviews/task-313/seat-reality-check-1.md
- docs/reports/reviews/task-313/seat-regression-1.md
- docs/reports/lanes/2026-11-19/BL-R10/REPORT.md (lane report naming task-313)

## Dependencies
- (none)
