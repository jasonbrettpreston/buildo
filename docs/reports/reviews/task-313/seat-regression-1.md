# Seat: regression: task-313 plan (PLAN-313-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board branch wf2/board, head bb735a4ad (the plan cites 4b0cf7ab1). I read the whole card, docs/reports/reviews/task-313/FINDINGS-PLAN.md (the heads), MD:2509-2538 and MD:2583-2612, src/lib/auth/get-user-context.ts, src/lib/parcels/tool-gate.ts, src/lib/entitlements/index.ts, src/lib/subscription/expiration.ts, user-profile/route.ts, the three parcel routes, mobile/app/_layout.tsx, mobile/app/(app)/_layout.tsx, decideAuthGateRoute.ts, appShell.ts, useParcelLookup.ts, the fence test, subscriptionGate.test.ts, the nav-by-route allow-list and app.json. I used read-only git log and blame. UNVERIFIED: sign-in.tsx and sign-up.tsx internals beyond the grep lines, NAV-AUDIT-20261111.md (not found in the tree), unlanded branches (I checked none), real Expo 54 behaviour.

Checked and clean:
- get-user-context demands a trade because of P24-24A (c05c6f87c, 2026-07-11): "an account with neither a single trade nor an override list cannot serve a feed (the algorithm is trade_slug-keyed)". It is a lead-feed rule. No parcel ruling set it, and the parcel routes use only ctx.uid and ctx.subscription_status (lookup:96-129, entitlement:45-52, lot-size:77-96). Dropping it for those routes loses nothing the parcel code reads.
- get-user-context never read account_deleted_at, suspension, cancelled-user state or admin flags; grep finds none in src/lib/auth. The server answer for a deleted or suspended account is the same before and after.
- Join versus getEntitlementStatus: LEAD_GEN_ENTITLEMENT_JOIN (entitlements/index.ts:90) and getEntitlementStatus (:118) read the same stored row, with unique (user_id, product) (expiration.ts uses ON CONFLICT (user_id, product)). The only difference is the isUuid guard, which cannot matter because up.user_id is a uuid. The stored value is identical; the expiry is not (rg#2).
- The parcel-tool 403 gate (tool-gate.ts:12-17) is unchanged and still runs after auth, so no data route is un-gated on the server.
- signOut calls queryClient.clear() (authStore.ts:105), so the non-user-keyed ['parcel-entitlement'] cache does not leak between accounts through an explicit sign-out.
- The lead arms stay frozen: the plan keeps `product` defaulted to lead_gen. The tab-bar hide in (app)/_layout (shouldHideAppTabBar, from the 2026-09-16 (c) fix) stays under LeadAppLayout.

## rg#1 HIGH: the MaxBLD gate admits any signed-in user and does not check the plan, against RR-0499 and the Spec 116 fence
Plan: M1 `decideMaxbldGate` 'enter' once there is data; Q1 A "they go in to Lookup"; Notes 2026-11-25 (RR-0499) "the gate checks the MaxBLD plan".
Evidence: MD:2599 "the gate checks the MaxBLD plan". parcels-entitlement.infra.test.ts:9 says "200 all null with no parcel_tool row (a legal state, never an error)". useParcelLookup.ts:155 says "A display, never a gate". So `data` is present for a user with no plan, and 'enter' fires. Spec 116:106 requires "a per-product gate in the new place". The old gate in (app)/_layout.tsx at least needed a non-null lead_gen status and sent 'expired' users to the paywall.
Fix: in the plan, either make 'enter' require the entitlement's status to be in ACTIVE_SUBSCRIPTION_STATUSES, with a no-plan answer going to the notice. Or write Q1 A as a named narrowing of RR-0499 and put that in the Spec 116 dated note, saying the server 403 is the only plan check in card 1.

## rg#2 HIGH: the plan stops the only code that expires lead_gen trials, which leaves the transitional unmetered arm open for good
Plan: M3 `useUserProfile enabled: ... APP_PRODUCT === 'lead_gen'`; F3a "the app no longer creates a lead_gen trial row"; S1 reads `getEntitlementStatus(pool, uid, 'lead_gen')`.
Evidence: applyTrialExpirationIfNeeded (expiration.ts:88-95, `UPDATE entitlements SET status = 'expired' ... trial_started_at + INTERVAL '14 days' <= NOW()`) is called only from src/app/api/user-profile/route.ts:73 (grep over src and scripts, tests aside). tool-gate.ts:15 `if (ACTIVE_SUBSCRIPTION_STATUSES.has(ctx.subscription_status ?? '')) return 'lead_gen_transitional'`. A user with a lead_gen 'trial' row who now uses only the MaxBLD phone app is never flipped to 'expired' and keeps unmetered, unlimited parcel access past 14 days. The old join returned the same stale 'trial' value too, but the phone then hit the profile GET first and flipped it.
Fix: add to S1 and T1 either a call to applyTrialExpirationIfNeeded(uid,'lead_gen') on the needsTrade:false path, or a note that the transitional arm is accepted as unmetered until MF-50. Say which, with the access change recorded in Spec 100 §5.

## rg#3 MED: the forced sign-out for a deleted account and "no app content" is dropped without a ruling
Plan: §6 "The account-deletion reactivation modal does not show for MaxBLD; it comes with ... card 2 (task-271)"; M3.
Evidence: (app)/_layout.tsx:154-184 `profile?.subscription_status === 'cancelled_pending_deletion'` then signOut and replace('/(auth)/sign-in'), with the comment "must NOT be shown any app content. Spec 96 §10 Step 2". decideAuthGateRoute.ts Branch 2 gives the reactivation modal. _layout.tsx:`track('reactivation_modal_shown')` is "compliance-critical" (Spec 99 §7.3 production event #2). The profile GET returns 403 AccountDeletedError (user-profile/route.ts:86-97). Neither get-user-context nor the parcel routes check account_deleted_at. So a user in the 30-day window keeps using search and lot-size from MaxBLD, which the lead app never allowed.
Fix: the plan names the modal only. Add the forced sign-out and the Spec 96 §10 Step 2 rule to §6 and §7 as an owed dated note and a dependency on card 2. Either keep the guard in card 1 (one account_deleted_at check on the entitlement route) or record that card 1 ships without it.

## rg#4 MED: the existing fence and gate locks stay green but guard dead code; nothing locks the switch value
Plan: M4 "the current body becomes LeadAppLayout with not one line changed"; T7; "Re-run, expected unchanged: subscriptionGate.test.ts".
Evidence: parcel-tool-fence.infra.test.ts:19-21 and :61 check `return <SubscriptionLoadingGuard` and `return <PaywallMount` before `<Tabs` in (app)/_layout.tsx (commit c4acc49dd, MF-43). subscriptionGate.test.ts:26-56 regex-reads the same file. After M4 both pass on LeadAppLayout, which is not mounted when APP_PRODUCT = 'parcel_tool'. The ruling fence ("security regression") is then guarded only by T7's order check on MaxbldAppGate.
Fix: in T7 also assert APP_PRODUCT's default and that the 'enter' arm needs the plan-check from rg#1. Use the plan's own "plants" so a flip to 'lead_gen' or an unconditional <Slot/> goes red.

## rg#5 MED: 'enter' stays on stale data, and the MaxBLD arm drops the 401 and retry arms
Plan: M1 "Once data exists it never flips back"; M2.
Evidence: _layout.tsx:313-330 renders "Could not load your profile." with Retry on any profile error other than 403 or 404. Spec 99 line 412 says a second 401 after refresh "means the refresh token itself is invalid — ... effectively signed out". In the plan, data plus isError stays 'enter'. A lapsed plan or dead session therefore never leaves Lookup. The server fence does hold (401, 403, and the F7 notice), but the user is never signed out and nothing re-asks. Also, ['parcel-entitlement'] has no uid in its key (useParcelLookup.ts:171).
Fix: in T4 pin 'enter' on stale data with isError status 401 as "server is the fence". Add the uid to the query key, or clear it on user change. State that sign-out arrives in card 2.

## rg#6 MED: the Spec 99 §5.3 note must list all the dropped arms, and T3 should pin the stale-profile guard
Plan: §6 names only the reactivation modal and push; §7 "Spec 99 §5.1-5.3: the MaxBLD arm".
Evidence: decideAuthGateRoute.ts holds Branch 2 (reactivation), 3 (404 to /(onboarding)/profession), 4 (retry), 4.5 (manufacturer hold), 5a-5d (resume, push), and wait-stale-profile (commit 5e3f9b453: "no PIPEDA visual leak"). Spec 99 line 705 says each branch needs a Jest test. The plan skips six or seven arms but names two. The manufacturer hold (Spec 94 §7) means a manufacturer account is no longer held for admin enablement in MaxBLD.
Fix: add one line in §6 and §7 listing every skipped arm, and note that manufacturers are not held. T3's `product:'parcel_tool'` cases should include a profile with account_preset 'manufacturer'.

## rg#7 MED: appShell.ts already exists and is locked, but the plan calls it "new"
Plan: M1 "mobile/src/lib/appShell.ts (a leaf module), new"; T4 "NEW mobile/__tests__/appShell.test.ts".
Evidence: appShell.ts:19-37 exports SELF_SHELVED_ROUTES and shouldHideAppTabBar (the 2026-09-16 (c) hide, "ZERO side-effect imports"). It is imported by (app)/_layout.tsx, parcel-tool/_layout.tsx, ParcelShelf.tsx and parcelSearchMatch.test.ts. The parcel-tool/_layout.tsx header cites it as the ruling's mechanism.
Fix: say "extend", keep both exports, and keep the leaf rule (APP_PRODUCT and decideMaxbldGate import nothing with side effects).

## rg#8 LOW: the navigation exceptions #15, #16, #22: the Q2 A fix keeps what they allowed
Plan: Q2 A; M8; T9 "EXCEPTION_AUDIT_ROWS becomes [29, 30]".
Evidence: nav-by-route.logic.test.ts (added in 3f41c8088, MF-75) allowed them as "owed: MF-49 (A1: ...)" under the operator's 2026-11-11 "yes". #15 sign-in setMode('email') becomes a route param. #16 setMode('idle') becomes back with role and label. #22 sign-up replace('/(auth)/sign-in') gets role and label plus canGoBack ? back : replace. The plan's fix matches each A1 text, and "the list only shrinks" holds. The list's own comment says "the operator's ruling names exactly these six", so #22 is within it; the lens's RR-0417 "two" is a separate matter. Residual risk: an email route param changes the sign-in state machine, which is used by the 'Back preserves email and password' behaviour at sign-in.tsx:566.
Fix: T8 should also cover Back keeping the typed email and password, if the form becomes a route.

## rg#9 LOW: the splash goes to a light colour, but the first screen is dark
Plan: M7 "backgroundColor becomes PARCEL_SHELF_HEX.screen" (Daylight).
Evidence: app.json:11-15 is `"backgroundColor": "#09090b"` (dark, set by a7a190a5d and earlier). sign-in.tsx:456 is `bg-zinc-950`, and sign-in is the first screen for every signed-out launch. A light splash into the dark sign-in screen is a flash on exactly the front-door path. No MD ruling on splash colour found (MD grep "splash", "start-up screen": only MD:2584 and 2599, no colour).
Fix: keep #09090b until sign-in itself is Daylight, or name the flash as accepted. "Splash with no image" is UNVERIFIED on Expo 54, as the plan says.

## rg#10 LOW: push-token registration for MaxBLD is dropped, with no record where the rule lives
Plan: M2 "no registerPushToken".
Evidence: _layout.tsx:`void registerPushToken()` runs only after a (auth) to (app) route (Spec 92 §4.1 comment). NotificationHandlers (_layout.tsx:362-380) still routes a tapped push to `/(app)/` or `/(app)/[lead]`, which M5 now redirects to Lookup.
Fix: add a Spec 92 note saying MaxBLD registers no token in card 1, and that a stale lead push tap lands on Lookup.

STATUS: 10 findings (0 CRITICAL, 2 HIGH, 5 MED, 3 LOW); the plan holds the server fence but drops the plan check in the gate (rg#1) and trial expiry (rg#2), and records only two of the skipped arms.
