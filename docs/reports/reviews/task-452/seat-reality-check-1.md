# Seat: reality-check: task-452 plan (PLAN-452-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head 98d934382 (the plan cites 9b709f475; the diff between them is docs only). Task-450 read through `git diff 9b709f475...wf2/inc1b-sfx2` and `git show wf2/inc1b-sfx2:<file>` (head de6d89d6f). Task-451's plan was only grepped for its +9 and the 427 to 436 move. Files read:
- Task-452 file, whole, and its FINDINGS-PLAN.md headline.
- src/features/leads/api/error-mapping.ts, src/features/leads/api/envelope.ts, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/entitlement/route.ts, src/lib/parcels/tool-gate.ts, src/lib/entitlements/index.ts.
- scripts/seeds/logic_variables.json, scripts/surfaces/screen-checks.mjs, the contract_parcels_lookup descriptor, the search content file.
- mobile: apiClient.ts, errors.ts, useParcelLookup.ts, parcelSearchMatch.ts, SearchBinding.tsx, SurfaceRenderer.tsx, parcel-tool/index.tsx, schemas.ts, and three test files (apiClient.test.ts, parcelSearchScreen.behaviour.test.tsx, parcelScreens.golden.test.ts).
- The v8 mocks report-limit.html and no-plan.html.
- Local test stack: 3 read-only aggregate SELECTs inside BEGIN READ ONLY … ROLLBACK, counts only.
- Not run: the S-sbind generator and the orphan-key check.

## Checked and clean
- **17 new strings.** I counted the plan's list: limit 4, shared 3, no-plan 10, which is 17. S-sbind counts `Object.keys(content).length` per converted surface (screen-checks.mjs:392), so +17 keys in one content file is +17.
- **Search content baseline.** It has 29 keys on the board and on the 450 branch. The wordmark.max key is at line 30, and "footer.help" exists ("Help & Support").
- **Pin chain.**
  - The board pins read 426 (surface-validate.logic.test.ts:91, surface-conformance.logic.test.ts:261).
  - The 450 branch reads 427, with the dated comment "426 -> 427 ... web_help.content.json".
  - The 451 plan says "427 becomes 436" (+8 nav, +1 map).
  - So 436 + 17 = 453 holds, if 451 lands as planned.
  - I could not re-measure the absolute totals. Summing every content.json gives 488 across 19 files, which is not the in-scope count.
- **What the server sends on a 403.** The body is `{data:null, error:{code,message[,details]}, meta:null}` (envelope.ts:56-80).
  - SUBSCRIPTION_REQUIRED is sent with no details (error-mapping.ts:28), from route.ts:73 and from the meter's not_entitled arm at :113.
  - REPORT_LIMIT_REACHED is sent with `details:{reportsLimit:number, resetsOn:ISO string}` (error-mapping.ts:37, route.ts:112).
  - The plan's test input matches the real shape.
  - The contract descriptor already declares a 403 class with fields ["reportsLimit","resetsOn"], so `contract('errors.403.reportsLimit')` passes contractRefProblems (screen-checks.mjs:349-355).
- **Subscription statuses.**
  - The entitlement read returns null (no parcel_tool row), or one of trial, active, past_due, expired, cancelled_pending_deletion, admin_managed (ENTITLEMENT_STATUSES, entitlements/index.ts:59-66).
  - For a non-active status, every count is null (index.ts:~648).
  - So the plan's "null = no plan; expired = lapsed" is right.
  - The read can also fail (500 or 429); the screen turns that into null at index.tsx:51-58.
- **The apiClient catch.** It does swallow a new subclass today (it only rethrows AccountDeletedError, apiClient.ts:60-61), so the widening is needed.
- **Today's 403 tests.** The existing 403 tests (apiClient.test.ts:113-150) keep passing with subclasses.
- **Callers that stay unchanged.** classifyParcelSearchError is unchanged and is called at parcelSearchMatch.ts:348, lotMap.ts:87 and semiQuestion.ts:68. The retry guard at useParcelLookup.ts:66 still holds for subclasses.
- **Other plan cites.** The "billing" topic is in the static-page.schema.json enum. Haptics has lightImpact, success and error. authStore declares signOut at :76. The T7 lock is 70 at src/tests/surfaces/admin-media.golden.test.ts:38. The S-screen count is 100 at surface-conformance.logic.test.ts:261.
- **Mock copy.** All 17 strings match the v8 mocks, including the curly apostrophes. The mock's web state also has "Upgrade to Pro", which the plan drops under choice 8.4, an open choice.

## rc#1 HIGH: the new situations are not in NAMED_CASES, so a golden test goes red
Plan: §3 step 12 ("New situations limit_wall, no_plan_wall, no_plan_checking and no_plan_none, used by the tests only") and §4. parcelScreens.golden.test.ts is not on the Files line and is not named as an edit.
Evidence: mobile/__tests__/parcelScreens.golden.test.ts:98-103, "every situation is used by a golden or a named case ... both directions": `expect(Object.keys(situations).filter((k) => k !== '$comment' && !used.has(k))).toEqual([])`. `used` is the golden situations plus the exported `NAMED_CASES` (:27-30). The same list also drives `refs(...,'derived')` at :106 and `layoutProblems` at :129.
Fix: add the four keys to NAMED_CASES in that file, and put the file on the Files line. Note that the wall trees will then also face the layout and touch-target checks at :129, so expect the new Buttons and links to be judged there.

## rc#2 MED: "the 403 wall is unreachable today (the meter is off)" is not true by the code or the data
Plan: §9 UNVERIFIED, last line, and §5 ("No ... server change"). The plan leans on GROUNDER-SEATS B "latent".
Evidence:
- There is no meter-off setting. route.ts:104-113 meters whenever `access === 'parcel_tool'` and a report is produced. The seeds default the allowances to 10, 10 and 25 (logic_variables.json parcel_tool_report_limit_plan/_trial/_pro).
- What the grounder actually says is "The meter counts only a produced report ... so a limit cannot be hit today" (GROUNDER-SEATS.md:41). It depends on the report page being produced, and lookup-flow.ts:73-74 shows the compute path answers null "while the web live switch is off". I did not verify that switch's value.
- Local stack: entitlements has parcel_tool rows (556 active, plus 1 each of trial, past_due, admin_managed, expired, cancelled_pending_deletion). 44 parcel_tool usage events exist. 2 users have 10 or more counted lots, with a maximum of 23. The local limits are 20 and 20 (plan and trial). The stack is old: there is no plan_key column and no pro limit.
- So the wall is reachable wherever a parcel_tool holder opens a produced report past their allowance, and some stack data is already past 10.
Fix: replace the line with "the limit 403 needs a produced report and a parcel_tool holder at their allowance; the lane forces it with the in-memory test and a stack user at the limit". Do not call the meter "off". The red-first behaviour tests do not rely on the claim.

## rc#3 MED: the press haptic misses the Buttons that carry no `variant`
Plan: §3 step 6 ("a Button with variant 'default' wraps its onPress ... lightImpact()") and §4 AC6; AC6 says "Primary buttons spring".
Evidence: variant is set only in some bindings (SearchBinding.tsx:143 and :190 'default'; LotMapBinding.tsx:78 and :212 'default'). ReportBinding.tsx builds every Button with className and accessibilityRole and no `variant` (:140, :150, :188, :267, :342, :374 report-retry, :385 report-back). A test that presses a 'default' Button passes while the report page's primary buttons get nothing.
Fix: say whether an absent variant counts as 'default' (the vendored Button default) and test one ReportBinding Button, or state that the report page is out of AC6 and record it as a pile item.

## rc#4 LOW: "Red today: every case" for the apiClient tests is wrong
Plan: §4 AC1, last line ("Red today: every case is ApiError(403,'Forbidden')"), while the list also holds "ACCOUNT_DELETED is unchanged" and "A generic 403 is ApiError".
Evidence: apiClient.test.ts:113 (ACCOUNT_DELETED) and :132 (generic 403) already pass.
Fix: say that only the REPORT_LIMIT, SUBSCRIPTION_REQUIRED and bad-details cases are red; the other two are kept locks (green both before and after).

## rc#5 LOW: the 'no_plan' choice for a plain 403 is wider than the server's causes
Plan: §3 step 3 ("A plain ApiError 403 with null gives no_plan") and the test "A plain ApiError 403 with null gives no_plan".
Evidence:
- The lookup route's only 403 codes are SUBSCRIPTION_REQUIRED and REPORT_LIMIT_REACHED (route.ts:73, :112-113; ACCOUNT_DELETED is handled earlier, apiClient.ts:54).
- So a plain ApiError 403 can only be a non-JSON or foreign 403, such as a proxy.
- Separately, the read covers only the parcel_tool product (index.ts: readParcelToolUsage reads `product = 'parcel_tool'`). A user with an expired lead_gen plan and no parcel_tool row gets 403 SUBSCRIPTION_REQUIRED with status null, so they see "Welcome back, no active plan yet".
- Plan text §5 says "No lead-gen concepts", so this is an edge, not a defect.
Fix: add a sentence to §5 stating both edges. Optionally send a plain ApiError 403 to 'reactivate' and only SubscriptionRequiredError plus null to 'no_plan'.

## rc#6 LOW: the plan's own wording about the 403 and the new classes, plus a mock detail
Plan: §3 step 2 ("A lead-gen route's SUBSCRIPTION_REQUIRED becomes the subclass").
Evidence: SUBSCRIPTION_REQUIRED appears only in error-mapping.ts and is used only by src/app/api/parcels/lookup/route.ts and lot-size/route.ts (grep over src/app, src/lib, src/features). No lead-gen route sends it. lot-size also sends `ENTRY_OFF` as a 403, which stays plain ApiError.
Fix: reword to "the lot-size route's SUBSCRIPTION_REQUIRED also becomes the subclass" and add one lot-size test line.
Also: the existing search behaviour test mocks authStore as a bare function with no getState (parcelSearchScreen.behaviour.test.tsx:25). The plan's `useAuthStore.getState().signOut()` (§3 step 7) needs the mock changed to an object with getState. "authStore :25 gains signOut" is not enough. The same test's useParcelEntitlement mock returns no isFetching and a refetch that returns undefined, so the "Checking your plan…" test needs a real promise.

## UNVERIFIED
- The orphan-key check for the 17 wall.* keys. `usedKeys` (screen-checks.mjs:306-326) only reads form and list descriptors, so how the keys of a SCREEN surface count as used was not traced. The census edit in step 11 is probably what carries them. I did not run the validator.
- Whether the web live switch is on in any real environment. This was not checked.
- That signOut ends on sign-in (the plan flags this too).

STATUS: 6 findings (0 CRITICAL, 1 HIGH, 2 MED, 3 LOW); the counts and the server facts hold, but the golden situations test and the "meter off" claim need fixing before build.
