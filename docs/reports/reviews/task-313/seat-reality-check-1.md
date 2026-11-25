# Seat: reality-check: task-313 plan (PLAN-313-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board, branch wf2/board, head bb735a4ad (the plan names 4b0cf7ab1; the head has moved on). I read the whole task-313 card, the brief, MD:2583, 2598, 2608, 2533, 2518, 2496, 1975, 2296, and phone-walk findings 7, 8, 9, 34, 35. Code read: get-user-context.ts, user-profile/route.ts, expiration.ts:30-80, tool-gate.ts, entitlements/index.ts:75 and :640-669, the entitlement and lookup routes, useParcelLookup.ts:56-70 and :160-177, useWallState.ts, parcelSearchMatch.ts:253 and :379-392, persistFilter.ts, queryClient.ts, _layout.tsx:85-130, (app)/_layout.tsx:225-262, sign-in.tsx, supabaseErrors.ts, parcel-tool/account.tsx, seed-personas.mjs, tests/e2e/scenarios.json. Test stack (127.0.0.1:55322) was read with SELECTs inside BEGIN READ ONLY; ROLLBACK, counts only.

Checked and clean:
- F3 holds on the stack. mctest-paid has a lead_gen 'trial' row with trial_started_at set and onboarding_complete true. The row was created 00:04:18 after that user's user_profiles.updated_at. mctest-atlimit also has onboarding true but no lead_gen row. That fits "the profile read wrote it" (the 4 minutes mean a later GET, not the DB edit). One caveat: PATCH /api/user-profile also calls initTrialEntitlement, so the stack cannot rule out another writer. The plan already labels F3 as inferred.
- F4 holds in code. All three parcel routes use getCurrentUserContext. It returns null for no row and for a trade-less row (get-user-context.ts:100-142). The web buyer row is created without a trade (parcel-checkout.ts:136, maxbld-terms.ts:10). user_profiles.trade_slug is nullable on the stack.
- F4a is true for the tables it names. FKs on the stack: usage_events, entitlements and parcel_user_inputs (entered_by, reverted_by) reference auth.users. Only subscribe_nonces and lead_view_events reference user_profiles (lead-side). device_tokens and tracked_projects have no FK to user_profiles. user-profile/delete/route.ts:37 inserts the row when it is missing.
- Offline is not a change for the lead app. 'user-profile' and 'parcel-entitlement' are both excluded from persistence (persistFilter.ts:28 NOT_PERSISTED), so the lead gate cannot open offline today either. Tracked Lots is a stub ("tracked_lots table DO NOT EXIST YET"), so nothing stored is reachable offline today. See rc#1 for the real offline defect.
- Wall states and routes are consistent. The wall's push targets stay under parcel-tool (PARCEL_TAB_ROUTE, parcelSearchMatch.ts:253), so the planned 'redirect' does not catch the Account or Tracked tabs.
- past_due is in ACTIVE_SUBSCRIPTION_STATUSES (entitlements/index.ts:75). A past-due user searches normally, metered.

## rc#1 HIGH: the "Can't reach MaxBLD" state never appears with no network
Plan: M1, decideMaxbldGate: 'offline' while "no data and failureCount ≥ 1 and the read is not yet in error". Section 6: "With no network the app cannot open ... user gets 'Can't reach MaxBLD'".
Evidence: mobile/src/lib/queryClient.ts:24-26 wires onlineManager to NetInfo: "NetInfo.fetch() ... setOnline(!!state.isConnected)". useParcelEntitlement (useParcelLookup.ts:168-177) sets no networkMode, so TanStack's default 'online' applies. With the device offline the query is paused: queryFn never runs, failureCount stays 0, isError stays false. The gate stays 'loading' and shows "Connecting…" for ever. The notice only shows when the network is reported up but the server is unreachable. T5 mocks useParcelEntitlement, so it cannot see this.
Fix: decideMaxbldGate takes fetchStatus. 'paused' with no data means 'offline'. Or set networkMode 'always' on the gate's read. Add a T4 case for fetchStatus 'paused'.

## rc#2 HIGH: several real users get in with no way forward, and there is no sign-out until card 2
Plan: Q1 A, "no plan → in to Lookup, today's refusal notice shows"; Section 6, "No sign-out in MaxBLD until card 2".
Evidence: AuthGate for 'parcel_tool' sends everyone to Lookup and the entitlement route answers 200 (all null) for no plan, so decideMaxbldGate gives 'enter' for every user (route header: "It reports the entitlement, including its absence"). The lead settings screen, which has sign-out, becomes unreachable ('redirect'). parcel-tool/account.tsx has no sign-out ("Your MaxBLD account settings will live here."). The session is persisted. Outcomes by kind (statuses from the stack: parcel_tool past_due 1, expired 1, cancelled_pending_deletion 1, admin_managed 1, trial 1, active 556):
- no plan: search page opens. The notice appears only after typing an address, and the generated text (mobile_parcel_search.json:62 search.entitlement) is "Your subscription doesn't include the parcel tool right now ... reactivate to search lots again." That wording is wrong for someone who never subscribed. It has no link or action, so the person is stuck.
- cancelled_pending_deletion: not 'expired', so searchWall returns null (parcelSearchMatch.ts:391) and the same notice shows. The reactivation modal needed the profile read, which is now off. The plan lists it as cut to card 2.
- expired: gets the reactivate wall (a way forward only if that wall has an action; not checked). At-limit gets the limit wall. Past-due and admin_managed search normally.
- someone signed in with the wrong account has no way to switch except reinstalling.
Fix: either put task-357 (No plan page) and a minimal sign-out in this card (Q1 B for sign-out only), or state in the plan that card 1 must not reach real users before card 2. Record the wrong "reactivate" text for a never-subscribed user as a known gap.

## rc#3 MED: the entitlement read becomes a hard gate, but it is documented as "a display, never a gate" and its failures are mislabelled
Plan: M5, 'error' draws "Can't reach MaxBLD / Check your connection". F8 reuses useParcelEntitlement. Section 6 leaves the useParcelLookup.ts:155 comment alone.
Evidence: the route header says "A display, never a gate: the lookup's 403 REPORT_LIMIT_REACHED is the gate". The route returns a generic 500 when readSearchSettings fails (entitlement/route.ts:36-40) and a 429 at 30 per minute (shouldRetryParcelLookup does not retry 429, 403 or schema drift). Any of these with no data gives 'error', and the whole app front door is down although search itself might work. A 401 or a 429 reads as "check your connection". The page and the gate share the 30/min bucket (same key), and the focus refetch adds calls.
Fix: let 'error' carry a cause: network gives the connection text, anything else gives a neutral "Something went wrong". Edit the route header and Spec 100 §2.6, not just a gate comment. Consider entering on a non-network error with no data, since the server 403 is the real fence.

## rc#4 MED: the gate does not check the plan, but the plan and the note say it does
Plan: Section 7 note: "parcel-tool stays in (app), whose gate now reads parcel_tool"; RR-0499 put to him "the gate checks the MaxBLD plan" (MD:2599).
Evidence: decideMaxbldGate returns 'enter' for any answered read, including status null, expired and cancelled_pending_deletion. Only the server 403 (tool-gate.ts:12-17) refuses anyone. The Spec 116:106 fence ("per-product gate") is met by the server alone.
Fix: reword the note to say the gate reads the plan and the server enforces it. Say plainly that the plan-checking gate with a no-plan screen is card 2 (357).

## rc#5 MED: no test-stack user and no persona has the shape this card fixes
Evidence (SELECT with a left join of auth.users to user_profiles on the stack): users 564, no user_profiles row 0, row with no trade 0, row with a trade 564, onboarding_complete true 2 (paid, atlimit). seed-personas.mjs:144 gives every persona the trade 'plumbing'. Entitlements: lead_gen active 1 and trial 1; parcel_tool active 556, trial 1, past_due 1, expired 1, cancelled_pending_deletion 1, admin_managed 1. No account_deleted_at rows.
After the change at sign-in, gate and search:
- every persona goes to Lookup. The profile is never read, so none sees the onboarding loop (findings 8 and 9 fixed) and none gets a new lead trial row.
- noplan, admin and anonymous (no sign-in): 200 with nulls, 'enter', notice on search (rc#2).
- trial, paid, basic, pro and the pools: 'enter', metered search.
- atlimit, proatlimit and overcap: 'enter'. The limit wall shows once a report is opened. Their onboarding flags no longer matter.
- pastdue: 'enter', searches normally.
- cancelled (expired): the reactivate wall. deleted: the notice (rc#2).
- leadgen (lead_gen only): 'enter' and the transitional arm applies.
Today (before the change) all of them already get 200, so the phone walk and every persona test exercise the old path only. The 401 cases (web buyer, in-app signup with no profile row) have no persona and no test-stack user.
Fix: add a persona for each (no row, row with no trade) to the catalogue and seed (a seed change, not a schema step). Add T-tests that call the real routes for them. Pure-mock T1 alone cannot show the 401 gone.

## rc#6 LOW: F3a covers only half of the trial-row side effect
Evidence: tool-gate.ts:15 uses ctx.subscription_status. After M3, the stack's existing mctest-paid lead_gen trial row stays until the persona is re-seeded (the seed deletes then re-writes entitlements). The seed's own guard comment says that row would hide the meter once the parcel_tool plan lapses.
Fix: add "re-run the persona seed on go" to the card's checks, and drop F3's claim of certainty ("inferred" is correct; the stack is consistent with it).

## rc#7 LOW: finding 7's keyboard cause is plausible but other text paths exist and T8 cannot prove it
Plan: F6, M8, "Call Keyboard.dismiss() first in handleEmailSignIn"; T8 asserts dismiss is called and the text shown.
Evidence: sign-in.tsx:462 "<View className="flex-1 items-center justify-center px-6">" has no ScrollView or KeyboardAvoidingView, and the error Text is at :577-579 below the form, so the keyboard covering it is credible. But supabaseErrors.ts maps 'validation_failed' to "That phone number is not valid." (wrong text for a malformed email), and any non-listed code gives the generic text. A render test with Keyboard mocked cannot show the error is visible. Whether the Supabase email sign-in returns invalid_credentials for an unknown email: UNVERIFIED (the plan assumes it).
Fix: the real check is a phone run with a wrong email. Make T8 also assert the error renders above the keyboard region (or inside a scroll view). Add the validation_failed text case.

## rc#8 LOW: the plan's no-plan user arriving via in-app sign-up has no profile row, and the plan never checks sign-up
Evidence: the phone sign-up path writes no user_profiles row until the old onboarding PATCH, which is now skipped. Sign-up becomes a route to a user with no row, no plan and no trade, which is exactly the case S1 serves but with no test. See rc#5 and rc#2.
Fix: T-test the sign-up user through to a 200 from entitlement.

STATUS: 8 findings (0 CRITICAL, 2 HIGH, 3 MED, 3 LOW); F3, F4 and F4a are true, but the offline state, the lock-out cases and the missing 401-kind personas make the built thing unsafe for real users as written.
