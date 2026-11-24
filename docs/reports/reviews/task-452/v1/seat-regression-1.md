# Seat: regression: task-452 plan (PLAN-452-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head 98d934382. The plan cites 9b709f475, and the diff stat tail between the two showed only docs/reports/reviews files (UNVERIFIED for the whole diff). Read: the whole task-452 file; task-357 (whole file); the Files lines and grep hits of tasks 450 and 451; FINDINGS-PLAN.md titles; MD:1214-1218 and MD:2283-2310; mobile/src/lib/apiClient.ts, errors.ts, haptics.ts and SurfaceRenderer.tsx; parcelSearchMatch.ts; SearchBinding.tsx (mobile); maxbld-web.ts; mobile tests smoke, parcelScreens.golden, daylightSearchPages.golden, apiClient and parcelSearchMatch; src search-web-binding.ui.test and maxbld-web-pages tests; the descriptor and census at :298; report-limit.html; `git diff HEAD...wf2/inc1b-sfx2` (de6d89d6f) for code files. Not read: the full git blame of every test.

## Checked and clean
- apiClient 403 block (apiClient.ts:49-64): the plan's widening of the catch is needed. AccountDeletedError does NOT extend ApiError (errors.ts:24-31), so ACCOUNT_DELETED must stay first.
- The existing 403 tests (apiClient.test.ts:132-147, a generic 403 and a non-JSON 403) assert status 403 and `instanceof ApiError` only. Subclasses keep them green.
- 403 consumers that only check `instanceof ApiError && status===403` still hold with subclasses: useParcelLookup.ts:66 and parcelSearchMatch.ts:297. `shouldRetryParcelLookup(0, new ApiError(403,...))` at useParcelLookup.test.ts:178 is unaffected.
- jest-expo already mocks ExpoHaptics (node_modules/jest-expo/src/preset/moduleMocks/expoModules.js:270-274). The renderer haptic will not break the tests that press default Buttons. This resolves most of plan §9's first UNVERIFIED.
- The haptics wrapper (haptics.ts:6-27) has lightImpact, successNotification and errorNotification as the plan says.
- The 403 body shape: error-mapping.ts:29 and :38 emit SUBSCRIPTION_REQUIRED and REPORT_LIMIT_REACHED with details {reportsLimit,resetsOn}.
- The App Store rule is quoted correctly. The operator's "a" is at open-questions.md:1056 ("Reading: web-only buying for launch (App Store 3.1.1)"). MD:2298 is labelled "Orchestrator reading (mine, not his)". The plan states this in its §1.
- The mock's app wall (report-limit.html:281-290) matches the plan's wall keys and carries no upgrade button. The mock web wall (:299) does carry "Raise your limit" and "Upgrade to Pro".
- Task-357 AC4 (grep plant) and AC6 (close-out wording) are kept (plan §4 and §7). The G.6 correction note and the task-320 note are owed in §7.

## rg#1 HIGH: the pinned "403 shows the entitlement block, never the miss copy" locks are inverted but not listed
Plan: §3.5 (notices draw the entitlement notice only when `!s.wall`), §3.11 (census checks :298 "the wall replaces the entitlement block"), §3.12 ('unauthorized' gains wall "reactivate"), §4 (the AC3 test is new).
Evidence: mobile/__tests__/surfaceRenderer.smoke.test.tsx:88-90 reads `show('unauthorized'); expect(screen.getByTestId('parcel-search-entitlement')).toBeTruthy(); expect(screen.queryByTestId('parcel-search-empty')).toBeNull();`. It came from MF-35 (b51bdead0). scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json:298 says "A 403 from the subscription gate renders the testID-tagged parcel-search-entitlement block, NOT the miss copy." The plan's §4 adds a describe but never says it rewrites smoke :83-90. The plan's AC3 test checks only that the text sits inside parcel-search-wall-reactivate. It does not carry the "never the miss copy" half.
Fix: list smoke :83-90 as rewritten. Keep `queryByTestId('parcel-search-empty')` null for the wall (all three states). Reword census :298 so it still locks "never the miss copy", with the prior text kept. Do not delete the check.

## rg#2 HIGH: the new fixture situations break a pinned closed-list test, and its layout walkers apply to them
Plan: §3.12 "New situations limit_wall, no_plan_wall, no_plan_checking and no_plan_none, used by the tests only"; §3.12 and §6 never mention parcelScreens.golden.test.ts.
Evidence: mobile/__tests__/parcelScreens.golden.test.ts:101-103 asserts `Object.keys(situations).filter((k) => k !== '$comment' && !used.has(k))` equals `[]`, where used = golden situations plus NAMED_CASES (the export at :27). Four unnamed keys go red. Once named, the walkers at :129 (`layoutProblems`: Button needs exactly one min-h-[44px], dark twins) and :246-251 (legal is the last column child, drawn once; reports-left only in reports_left) run on the wall trees. daylightSearchPages.golden.test.ts:26-27 builds `searchTrees` from EVERY fixture key and bans legacy dark classes. Task-450 also edits parcelScreens.golden.test.ts (+18 lines on its branch), so this is a collision too.
Fix: add parcelScreens.golden.test.ts and its NAMED_CASES to the Files line. Add the four keys to NAMED_CASES. State that the wall's Buttons carry the 44 px class tokens and the legal footer stays last. Add parcelScreens.golden.test.ts to the §6 hunk-ownership list.

## rg#3 HIGH: task-357 acceptance lines are dropped by the absorption with no record
Plan: §3.12, §4 and §7. The card says the plan's section 2 lines are the acceptance tests. RR-0446 (MD:2302) only says "add to the plan". Absorbing 357 whole is the ruling. Nothing says any line is dropped.
Evidence: task-357 AC2 requires three goldens (No plan, Checking, Still no plan), each string equal to the v8 literal at no-plan.html:264, :265, :276, :287, with a test reading both. Plan §3.12 and choice 8.2(a) draw no goldens for the no-plan states (tests only), and §4 has no literal-versus-mock test. 357 AC5 requires the other search goldens "byte-identical" and consumer-registry clean. Plan §5 risk 4 says every search golden moves, and consumer-registry is never run in §3.11. 357 AC3 says Log out "ends on sign-in" and "test it". Plan §5 risk 5 and §4 assert only that signOut is called, and defer the rest to one device check. 357 declaration site 5 owes a dated note on Spec 126 and on the owning MF row (MF-49). Plan §7 owes only doc-2, task-320, task-357 and task-452.
Fix: add a plan line "Task-357 AC2, AC3 (ends on sign-in), AC5 and its Spec 126 and MF-49 notes: kept as X / changed to Y because Z", and put each change in a dated note on task-357. Add a test that reads the mock literals (the no-plan.html strings). Add the Spec 126 and MF-49 notes to §7. Or take the decision to the operator.

## rg#4 MED: the 2026-11-20 grounder ruling for 357 (page-table rows, not the search binding) is overridden without a note
Plan: §8.1 recommends (a) SearchBinding and the search content. §3.4 and §3.5 already build it.
Evidence: task-357 Implementation Notes: "build as a screens row of the page table (static-page.json) drawn by PageTableBinding.tsx ... Required for 1·B by RR-0312". It was resolved under the operator's "Let the grounder resolve them all" (MD:1476). The plan's reason is that the card is later and RR-0446 folds 357 into it. The card Files line and the "wall copy lives in the search content" must-not line also support (a). The cost is the contradiction with 357's "search goldens do not move".
Fix: keep (a), but record the reversal as a dated note on task-357 that quotes MD:1476. Mark §3.4 and §3.5 as built-on-(a), not as "open".

## rg#5 MED: the operator's words "top up or a higher subscription" are delivered nowhere
Plan: §3.4 limit keys, §8.3(a) and §8.4(a). The web drops wall.plan. There is no buy button.
Evidence: RR-0443 at MD:2285: "(a) at the report limit the person gets a screen offering a top-up or a higher subscription". RR-0444 (2b): "a subscription upgrade with more report room". The card's AC2 names "the upgrade line". The plan's limit wall holds only "Your plan is managed on the web." The mock's web wall (report-limit.html:299) has "Raise your limit" and "Upgrade to Pro". The phone-only reading comes from MD:2298, which the orchestrator labels "mine, not his". The operator's RR-0445 answer was "mobile first ... but it works on the web". The plan still ships (a) text in §3.4 before 8.3 or 8.4 is decided.
Fix: do not call AC2's "upgrade line" met by wall.plan. Record in the G.6 dated note (§7) and the task-452 notes that no top-up or upgrade control exists on either surface until MF-86, and put that gap to the operator as a one-line question. Or draw the web buttons from the mock.

## rg#6 MED: the operator's "way to sign up" (RR-0312, MD:1216) is not carried forward
Plan: §5 Limits "The sign-up way is NOT delivered", §7 task-357 note.
Evidence: MD:1216 is "b. with no plan - it needs to an error page that inludes a way to sign up". Task-357 Implementation Notes: "Open for the operator later, not blocking: the designed page has no sign-up link while his words ask for 'a way to sign up'." The plan's §7 note names what waits (MF-86, price ids, MF-70/MF-49) but does not carry the "open for the operator" line into task-452's notes or any queue row. Absorbing 357 would let the standing word drop off the board.
Fix: add one line to §7 that task-452's close-out and notes quote RR-0312 and the open point, and that task-357's AC6 close-out text is carried onto 452.

## rg#7 LOW: every 403 now becomes "reactivate" unless a null plan status says otherwise (357 AC1 changes)
Plan: §3.3 "Any other 403 gives 'reactivate': an expired or cancelled status, a failed read, or no read yet."
Evidence: 357 AC1 says 403 + active status → "notice", and 403 + failed read → "notice" (today's text). Plan gives "reactivate" for both, which also adds the tracked button and the plan line. An active customer is told to "reactivate" more strongly than today. The plan's §3.3 test list has no case for an active status with an untyped 403.
Fix: add the test case. Either return null for an active status (keeping today's notice) or state that this changes 357 AC1.

## rg#8 LOW: the renderer haptic reaches every default Button on all parcel pages, and the rule text is not updated
Plan: §3.6 "a Button with variant 'default' wraps its onPress as `() => { lightImpact(); fn(); }`", §5 risk 6.
Evidence: variant 'default' Buttons are Retry (SearchBinding.tsx:143), Select (:190) and the map's two (LotMapBinding.tsx:78, :212). Standards 1.3 (00_engineering_standards.md:24) reserves haptics for "critical state transitions", with lightImpact for neutral actions. The card says "primary buttons on the parcel pages", so the scope is within it. The change is silent: no dated note on the standard or on task-320/450/451 (451 edits LotMapBinding and lotMapPage tests). The no-plan check press also fires lightImpact and then successNotification or errorNotification on settle (two haptics per press, §3.7).
Fix: add a dated note where the rule lives (the surfaces standard or Std 1.3) naming the scope. Pin in the AC6 test which Buttons get it. Decide on the double haptic.

## rg#9 LOW: the apiClient 403 claim about lead-gen routes is wrong, and the subclass message is unspecified
Plan: §3.2 "A lead-gen route's SUBSCRIPTION_REQUIRED becomes the subclass, which changes nothing for its callers".
Evidence: forbiddenSubscription is called only in src/app/api/parcels/lookup/route.ts:73 and :113 and src/app/api/parcels/lot-size/route.ts:58. No lead-gen route emits it. The lot-size 403 (a task-451 consumer) does become the subclass. Existing 403 callers read only `status`; the plan does not say whether the subclasses keep the message 'Forbidden' (apiClient.test.ts does not assert it).
Fix: replace the sentence with "parcel lookup and lot-size 403s become the subclass". Say the subclasses keep message 'Forbidden' and status 403.

## rg#10 MED: collisions with tasks 450 and 451 the plan's §6 does not list
Plan: §6 hunk ownership.
Evidence (git diff HEAD...wf2/inc1b-sfx2): 450 also changes mobile/__tests__/parcelScreens.golden.test.ts (+18), daylightSearchPages.golden.test.ts, schemas.test.ts, and the fixtures hit and list in parcelSearchScreen.behaviour.test.tsx. Those payloads now carry `resolution: 'text_candidates'`, because a payload without it reads as no_match under 450's Q19. 452's new behaviour tests at "mocks :34-39" must build data the same way or they fall into the miss path. 450's smoke edits sit at :41 and :76-82, directly above 452's :83-90 hunk, so the hunks are adjacent. Task 451 edits mobile-product.json (the map entry), the two 127 generated .md files (regenerated, so both lands conflict), lotMapPage.behaviour.test.tsx and LotMapBinding.tsx, all outside 452's lines but in the same generated files. 451's string pin text is 427 to 436, and 450's is 426 to 427, as plan §6 says.
Fix: add to §6: parcelScreens.golden.test.ts, daylightSearchPages.golden.test.ts, the smoke :83-90 adjacency, and "452's search mocks use `resolution`". Regenerate the 127 files on the last landing only.

STATUS: 10 findings (3 HIGH, 4 MED, 3 LOW); the plan needs the locked 403 assertions, the NAMED_CASES list and the dropped 357 lines recorded before it is built.
