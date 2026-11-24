# Review context for task-452 (no plan id) written 2026-11-24 by backlog-brief.mjs (round 1)

## Task
task-452 SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room) and reactivate screen for an expired subscription, phone first
status: LATER · milestone: m-1 · assignee: none · labels: SEARCHFIX-PRIORITY

## Description
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 5 (BUILD.REPORT-LIMIT) and 7 (FIX.PRESS-FEEDBACK) with amendment A2; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: a customer at their report limit sees a screen offering a subscription upgrade with more report room (objective G.6, doc-2:94; RR-0443, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283; RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290). A customer whose subscription has expired sees a reactivate screen (RR-0444). A signed-in customer with no plan sees the no-plan page (task-357, absorbed here by RR-0446, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302). One wall layout serves the three states, built phone first and also on the web, following how the other pages were built (RR-0445, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296). Last on the phone, primary buttons on the parcel pages get the haptic feedback the engineering standard asks for; the spring waits on the operator (RR-0454 item 5: is it a shared part of Increment 1·C?).

Findings folded: ST2, 2b, the O1 slot, Q14. Starts from the approved mocks (report-limit.html, small-pages-v8 no-plan.html) and existing components (the existing PaywallScreen is checked first for the reactivate state).

Orchestrator reading, to be grounded at the plan stage: the purchase itself happens on the web; the phone wall carries the line or link, not a checkout.

Must not: build a new plan or checkout flow; call expo-haptics directly; move the report goldens (wall copy lives in the wall surface's own content file, mobile_parcel_wall.content.json; the search content is not edited).

Runs after SEARCHFIX.2 and SEARCHFIX.3 (shared match file and the string pins). Corrects the BUILT mark on objective G.6 by a dated note. Dated note owed: task-320.

Split by RR-0455 (MD:2357-2358): the no-plan page returns to task-357, the haptic is task-458, the spring is task-459; the web waits for its switch-on. Where the text above still names the no-plan page, the haptic or the web, the split governs.

Files: mobile/src/lib/apiClient.ts, mobile/src/lib/errors.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/hooks/useWallState.ts, mobile/src/components/surfaces/WallBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/index.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/converted-surfaces.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.content.json, mobile/src/generated/surfaces/mobile_parcel_wall.json, scripts/surfaces/wall-golden-capture.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, mobile/__tests__/apiClient.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/wallScreens.golden.test.ts, mobile/__tests__/fixtures/wall.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_wall.goldens.json, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/static-page.logic.test.ts, src/tests/fixtures/surfaces/mobile_parcel_wall/

## Acceptance criteria
- #1 A 403 keeps its code, limit and reset date; limit reached and subscription required are two error classes
- #2 At the limit, the search page and the report screen show the wall with the count, the reset date and the plan line (no top-up or upgrade control until the buying work, RR-0454 item 3); never the reactivate copy
- #3 An expired subscription shows the reactivate state; a subscription-required 403 with no plan, an active status or a failed read keeps today's notice (the no-plan page is task-357, RR-0455 item 2)
- #4 The web is unchanged by this card: it keeps its one not-entitled notice and gets the limit and reactivate screens with the web switch-on (RR-0455 item 1)

## Implementation Plan
Planner: Cairn-Plan-452b
Plan id: PLAN-452-v2

Read-only. I ran no tests, hooks or generators and wrote no file. Cites were read at board head 9fdbe4ac1, branch wf2/board. v1 was read at 9b709f475 and grounded at 0f8eca7a9. MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. v2 is not a new design. It is PLAN-452-v1 as folded (docs/reports/reviews/task-452/QUESTIONS-RULED.md and GROUNDER-PLAN.md), cut down to the limit and reactivate screens. Every ruled choice is kept.

#### 1. Rules quoted first
- RR-0455, MD:2357-2358. Operator: "1 y 2 y 3 y 4 I dont understand this question 5. is this after a search - provide context". Ruled: "(1) yes, the web waits for its switch-on. (2) yes, task 452 is split: limit and reactivate screens stay; the no-plan page returns to task 357; the haptic change is its own card. (3) yes, the spring is one shared-part card in Increment 1·C. (4) and (5) NOT ruled".
- RR-0454, MD:2353: "(3) The limit screen says the plan is managed on the web for now; the top-up or upgrade offer of RR-0443 waits for the buying work." Item (4) (the way to sign up) now travels with task-357.
- RR-0443, MD:2283: "yes, they need a screen with a top up or a higher subscription". RR-0444, MD:2290: "a subscription upgrade with more report room"; "a user with an expired subscription gets a reactivate screen".
- RR-0445, MD:2296: "we are mobie first ... but it works onthe web". RR-0455 item 1 now governs the web.
- RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this". RR-0429, MD:2202: "Keep notes short."
- RR-0450, MD:2326: queue rules and the orchestrator note are "not reviewed against code"; the step handbook is for compute only. RR-0452, MD:2337: the five-principles list is off.
- RR-0460, MD:2381-2383: phone tests run "local first, then push"; "a full local run passing before the push, then the Mobile CI run after it". Approved.
- MD:1476: "Let the grounder resolve them all as long as the result is compliant". That gave the page-table design (QUESTIONS-RULED.md:15).

#### 2. What exists and is reused (re-read at 9fdbe4ac1)
- The server 403s: error-mapping.ts:38 REPORT_LIMIT_REACHED {reportsLimit, resetsOn} and :29 SUBSCRIPTION_REQUIRED. Their senders: lookup route.ts:73, :112, :113 and lot-size route.ts:58. All unchanged.
- apiClient.ts:49-63 is the 403 block (ACCOUNT_DELETED :54, catch :60-61, generic throw :63, re-export :12). errors.ts:14-22 is ApiError.
- useParcelEntitlement is at useParcelLookup.ts:162-170. The search page reads it at index.tsx:52. The tracked route is PARCEL_TAB_ROUTE at parcelSearchMatch.ts:253-257. classifyParcelSearchError is at :298-301. The file ends at :366.
- The page table: static-page.json `screens` (:1291, semi row prefix parcel-semi at :1293). static-page.schema.json `action` enum :531-538 already holds push, so no schema edit is needed. PageTableBinding.tsx notice vars are at :99-100. SemiQuestionBinding.tsx closed lists are at :28-37. The semi host's no-op actions are at semi-question.tsx:77-78.
- Registrations: bindings.json modules :20 (owner binding_mobile_list), mounts :28-44 (a surface may have several mounts; mount_internal :10 allows @/hooks/). The capture precedent is scripts/surfaces/semi-question-golden-capture.ts. Goldens live in src/tests/fixtures/surfaces/<id>/<state>.mobile.json and mobile/__tests__/fixtures/surfaces/<id>.goldens.json. The census deviations precedent is mobile-product.json:15095 (S-093).
- ReportPageHost.tsx:34-35 (props) and :60-65 (top plus the lifecycle Renderer).
- PaywallScreen is not reused. It is lead-gen and the parcel product may not use it (v1 section 2, kept).

#### 3. Split map: v1 item to v2 or to its card
Steps:
- STAY: 1 (errors.ts), 2 (apiClient.ts), 6 (WallBinding, cut down), 8 (useWallState, cut down), 9 (both hosts), 10 (ReportPageHost wall prop), 11 (web unchanged, now ruled), 12 (census and registry), 14 (pins, re-derived).
- STAY, cut down:
  - 3 (searchWall): the no_plan return goes to 357.
  - 4 (surface): 2 states now; 3 states go to 357; the `sign_out` schema edit goes to 357.
  - 5 (keys): 7 keys now; 8 go to 357.
  - 13 (fixtures and goldens): 2 goldens now; 3 go to 357.
- LEAVE, step 7:
  - The `sign_out` action goes to task-357.
  - The press haptic and the Std 1.3 note go to task-458.
  - "No spring" goes to task-459.
- From step 8: the recheck, the `asked` flag, sign_out and the settle haptics go to task-357.

Acceptance lines:
- STAY: AC1 and AC2 verbatim, AC3 widened by one clause, AC5 reworded by RR-0455 item 1 and renumbered #4.
- LEAVE: AC4 goes to task-357; AC6 goes to task-458.

Tests:
- STAY:
  - apiClient (all).
  - searchWall (limit and reactivate cases).
  - Search behaviour: limit, expired, and the active-keeps-notice case.
  - reportPage.behaviour (wall prop) and the three report-mount mocks.
  - wallScreens.golden (2 goldens, report-limit.html state 3 literals).
  - The pins.
  - The Std 11 checklist.
- LEAVE to task-357:
  - The no_plan searchWall cases.
  - The null-status behaviour case, the recheck, checking and none cases.
  - The success and error haptics.
  - Log out and the store-level signOut test.
  - The authStore getState mock.
  - The no-plan.html literals (:264, :265, :276, :287).
  - The http, www, $ and maxbld.ca grep plant (357 AC4).
  - "A host without sign_out cannot render the wall".
- LEAVE to task-458: the smoke "press feedback" describe.

Notes:
- STAY: doc-2 G.6, task-320 ST2, task-452's own notes, the piled semi and map notice.
- LEAVE to task-357: the task-357 kept-or-changed list, the Spec 126 note, the MF-49 note.
- LEAVE to task-458: the Std 1.3 note (it was not on the v1 Files line; 458 must list docs/specs/00_engineering_standards.md).

Moved v1 hunks and cites:
- Fold A2 (FOLD-PLAN.md:226), "one layout, three states", becomes one layout, two states here. 357 adds the third state to the same surface.
- Fold-plan findings: ST2, 2b and the O1 slot (wall.plan) STAY. Q14 LEAVES (haptic half to 458, spring half to 459).
- Nothing leaves to task-457. Its items (RR-0456, the semi page wait and the zero-second retry) were never part of the 452 plan.

#### 4. Shared between staying and leaving parts, and where it now lives
- The surface mobile_parcel_wall (descriptor, content, slice, screens row, capture script, census entry, bindings entries) is built by 452 with states rate_limited (limit) and unauthorized (reactivate). task-357 adds static, loading and error to the same surface. That is the ruled design (QUESTIONS-RULED.md:15-20); 357's old mobile_parcel_no_plan surface is superseded.
- Content key wall.plan "Your plan is managed on the web." lives in 452's content. 357's static golden reuses it and adds no copy.
- WallBinding closed lists:
  - In 452: WALL_FLAG_NAMES [limit, reactivate]; WALL_VALUE_NAMES [route]; WALL_VAR_PATHS [reportsLimit, resetsOnDisplay]; WALL_CHOICES {}; WALL_CONTRACT contract_parcels_entitlement.
  - 357 appends the flags no_plan, checking and none, and the value recheck.
- searchWall returns 'limit' | 'reactivate' | 'wait' | null in 452. 357 adds the 'no_plan' branch (status null). The census deviations row lists limit and reactivate. 357 extends that row by a dated note.
- useWallState:
  - In 452: entitlement read, searchWall, push through router.navigate (FE-51). The rows do not name the other SurfaceActions, so they follow the semi host's no-op pattern (semi-question.tsx:77-78).
  - 357 adds recheck, `asked`, sign_out and the settle haptics.
- Pins re-derived from the measured board (451 landed: 436 strings at surface-conformance.logic.test.ts:263). Projected; the lane measures before and after:
  - 452: S-sbind 17 to 18 surfaces, 436 to 443 strings (+7). S-screen 17 to 18 surfaces, 100 to 102 goldens.
  - 452: S-desc "examined 33 ... converted 17" to 34 and 18 (conformance :245; validate :93, :95). converted-surfaces.json expected_count :5, 33 to 34. S-page "(1 of 1 screens)" to "(2 of 2 screens)" (validate :93). S-golden "(18 states x 4 ...)" is measured, not projected.
  - 357 later: 443 to 451 strings, 102 to 105 goldens, no new surface.
  - Web T7 lock 70 (admin-media.golden.test.ts:38) does not move.
- Phone suite: 58 files, 866 tests at a12d535f5. wallScreens.golden.test.ts makes 59 files; the lane records the test total.

#### 5. The change, file by file, in build order (v1 numbers in brackets)
1. [1] errors.ts after :22. ReportLimitError and SubscriptionRequiredError extend ApiError: status 403, message 'Forbidden', a code member. ReportLimitError adds reportsLimit (number or null) and resetsOn (string or null). As v1.
2. [2] apiClient.ts:49-63. Read errObj.code and throw the matching class. Details are taken only when typed right. The catch at :60-61 also rethrows `e instanceof ApiError`. Re-export at :12. Every other 403 stays ApiError(403). As v1.
3. [3] parcelSearchMatch.ts, append `searchWall(error, read)` after :366:
   - ReportLimitError: 'wait' while pending; 'limit' once the read answered with a number for reportsLimit and a resetsOnDisplay; else null.
   - SubscriptionRequiredError: 'wait' while pending; 'reactivate' only for status 'expired'; null for any other status (including null, until 357) and for a failed read.
   - Anything else: null.
   - No existing line is edited.
4. [4] New surface mobile_parcel_wall (S id claimed in the ledger; census refs go up to S-095 today):
   - Descriptor: archetype LIST and identity.platforms [mobile], which T9 requires (static-page.logic.test.ts:109). Content file. Slice via emit-mobile-surfaces.mjs.
   - Row screens.mobile_parcel_wall in static-page.json (contract contract_parcels_entitlement, binding WallBinding.tsx, platforms [mobile]).
   - bindings.json: module entry beside :20, mounts for index.tsx and [parcelId].tsx.
   - converted-surfaces.json: +1, expected_count 34.
   - No static-page.schema.json edit.
5. [5] 7 keys: wall.limit.title "You’ve used all {limit} reports"; wall.limit.reset "Your count resets on {date}."; wall.limit.opened; wall.limit.stay; wall.plan; wall.tracked "Go to Tracked Lots"; wall.reactivate (today's search.entitlement sentence, copied; the search content is not edited). "How are reports counted?" stays out.
6. [6] WallBinding.tsx (new, SemiQuestionBinding shape). Lists as in section 4. Classes from the semi class table (lotMap.ts, min-h-[44px]). Count and date come from the read; the 403's own values are never drawn.
7. [8] useWallState.ts (new): reads useParcelEntitlement, calls searchWall, builds the wall props, push uses router.navigate to the tracked route (never index.tsx:81-86 navigate, which records a recent search).
8. [9] index.tsx and [parcelId].tsx call useWallState(error). 'wait' draws the existing loading state. A wall replaces the search tree, or goes to ReportPageHost's wall prop.
9. [10] ReportPageHost.tsx:34-35 gets an optional `wall` prop. When it is set, :60-65 render `top` then the wall Renderer in place of the lifecycle. Existing tags only, so C-8m (MOBILE_HOSTS, surface-conformance.logic.test.ts:752) holds.
10. [11] The web is unchanged (RR-0455 item 1). No web file is edited; it keeps its one not-entitled notice.
11. [12] Census: append mobile_parcel_wall with the dated deviations row. Then generate-surface-registry --emit-descriptors, the plain run (the two 127 files), --check, and consumer-registry --check. 449, 450 and 451 have all landed, so 452 regenerates them itself.
12. [13] Fixtures and goldens:
    - wall.situations.json (two situations).
    - Goldens src/tests/fixtures/surfaces/mobile_parcel_wall/{rate_limited,unauthorized}.mobile.json and mobile/__tests__/fixtures/surfaces/mobile_parcel_wall.goldens.json.
    - Run order: wall-golden-capture.ts --write, then emit --write, then surface-validate --check.
13. [14] Pins as in section 4. NEW, not in v1: T9 static-page.logic.test.ts:107 pins `Object.keys(SCREENS)` to the semi id alone, so adding the row turns it red. T9 :101-118 is widened to both ids, and each id is checked against its own binding (:103 is BINDING, :114-118 is the no-JSX check).

#### 6. Tests first (red, then green); each maps to an acceptance line
Phone tests run in the full local run before the push (RR-0460), then Mobile CI after it.

AC1, mobile/__tests__/apiClient.test.ts beside :132:
- REPORT_LIMIT_REACHED gives ReportLimitError with code, 10 and the ISO date, instanceof ApiError, status 403.
- SUBSCRIPTION_REQUIRED (lookup and lot-size) gives SubscriptionRequiredError.
- Bad details give reportsLimit null.
- These three are red. Kept locks :113 and :132 stay green both ways; ENTRY_OFF stays ApiError.

AC2:
- parcelSearchMatch.test.ts, new describe "searchWall": pending gives wait; numeric count plus date gives limit; a failed or incomplete read gives null (red: the function is missing).
- parcelSearchScreen.behaviour.test.tsx:
  - The entitlement mock (:34-41) gains data and a pending state.
  - The expo-router mock (:21-24) gains navigate (correction: v1 omitted it).
  - Case "limit wall": {reportsLimit:10, resetsOnDisplay:'9 Dec 2026', status:'active'} shows "You’ve used all 10 reports", "Your count resets on 9 Dec 2026.", "Your plan is managed on the web.", and no parcel-search-entitlement. Go to Tracked Lots calls navigate with '/(app)/parcel-tool/tracked'; recents stay empty.
- reportPage.behaviour.test.tsx: a host with a wall prop renders the wall and Back, not the lifecycle error (red: no prop). The limit wall shows the read's count and date.
- wallScreens.golden.test.ts (new): the rate_limited golden equals wallProps; every key is used; the 44 px and layout walkers pass; strings equal report-limit.html state 3.
- The pins and T9 (section 5 step 13) are written first with the new numbers: red until the surface exists.

AC3:
- searchWall: SubscriptionRequiredError with 'expired' gives reactivate; with null, 'active' or a failed read gives null; a plain 403, 500, 429 and no error give null.
- Behaviour "expired": the reactivate words appear inside the wall.
- Watch: the reactivate words equal today's notice word for word, so the test must assert the wall itself: the wall's prefix testIDs and "Go to Tracked Lots", and parcel-search-entitlement absent. Otherwise the test is green before the change.
- Behaviour "no plan yet": status null keeps today's notice (a lock until task-357).
- unauthorized golden.

Report-mount stubs: reportScreen.gateStability (:22), reportScreen.mount (:33) and semiQuestionPage (:35) give their useParcelLookup mock a useParcelEntitlement stub; gateStability is re-run.

AC4 (web unchanged):
- check-task-files: no web path in the diff.
- admin-media T7 stays 70.
- Smoke :88 (plain 403 keeps the notice) stays green.

Before the suite runs, the lane writes the Std 11 checklist (00_engineering_standards.md:288).

#### 7. New card text, word for word
Title: SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room) and reactivate screen for an expired subscription, phone first

Description edits:
- "What changes": drop the no-plan sentence and the haptic sentence. Add: "Split by RR-0455 (MD:2357-2358): the no-plan page returns to task-357, the haptic is task-458, the spring is task-459; the web waits for its switch-on."
- "Findings folded: ST2, 2b, the O1 slot."
- "Must not:" drop "call expo-haptics directly".

Files: mobile/src/lib/apiClient.ts, mobile/src/lib/errors.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/hooks/useWallState.ts, mobile/src/components/surfaces/WallBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/index.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/converted-surfaces.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.content.json, mobile/src/generated/surfaces/mobile_parcel_wall.json, scripts/surfaces/wall-golden-capture.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, mobile/__tests__/apiClient.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/wallScreens.golden.test.ts, mobile/__tests__/fixtures/wall.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_wall.goldens.json, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/static-page.logic.test.ts, src/tests/fixtures/surfaces/mobile_parcel_wall/
(32 entries. Off the line: SurfaceRenderer.tsx, static-page.schema.json, Spec 126, MCFRONTEND-QUEUE.md, surfaceRenderer.smoke.test.tsx. The broad src/tests/fixtures/surfaces/ is narrowed to the wall folder.)

Acceptance:
- #1 A 403 keeps its code, limit and reset date; limit reached and subscription required are two error classes
- #2 At the limit, the search page and the report screen show the wall with the count, the reset date and the plan line (no top-up or upgrade control until the buying work, RR-0454 item 3); never the reactivate copy
- #3 An expired subscription shows the reactivate state; a subscription-required 403 with no plan, an active status or a failed read keeps today's notice (the no-plan page is task-357, RR-0455 item 2)
- #4 The web is unchanged by this card: it keeps its one not-entitled notice and gets the limit and reactivate screens with the web switch-on (RR-0455 item 1)

#### 8. Board changes since v1, taken in
- 450 (ee3634771) was already in the grounder's read. 449 (fe88ecf71: server parcel-lookup, contracts census, doc-2 notes) edits no file on this line except the two 127 files.
- 451 (04c181564, fold 5af0f7be2) edited static-page.json (header rows and the :2 note), census mobile-product.json (the map entry), static-page.logic.test.ts, the validate pin :93 and the conformance pin :262-263 (427 to 436). 452 appends in other hunks.
- 461 (acc1affa0) touched lotForm.test.ts only. 453 changed review tooling only: for v2's review the five-principles list is off and queue rules are not reviewed against code.
- 460 (wf2/inc1b-proc460, not landed) touches no file of this line. The output review follows whatever shape is landed when 452 reaches output.
- Cites corrected:
  - Conformance pin :262 to :263.
  - Validate pin :92 to :93.
  - MOBILE_HOSTS :751 to :752; MOBILE_PARTS :747 to :748.
  - useParcelEntitlement :161 to :162.
  - Hunk ownership: 450 and 451 have landed, and the "last landing regenerates" note is now 452's own run.
- doc-2:94 G.6 still reads BUILT. Read it fresh before the note (449 and 451 added notes).

#### 9. Review findings (TRIAGE-PLAN.md ids)
Stay folded in v2:
- Web: five-words#1, inc-S#2, mobile-90#2, mobile-98#2, 99-p1#2, 99-p2#2, 99-p2#3, ms-S#2, plan-protocol#2, surface-136#2, deepseek#6, ux#1, in#5.
- Read-gated: five-words#3, mobile-90#3, mobile-98#3, 99-p1#3, 99-p2#4, ms-S#3, plan-protocol#4, surface-136#3, error-paths#2, #7, deepseek#4, #10, ux#3, #6.
- Pins: five-words#6, 99-p2#6, deepseek#7.
- Code member: inc-S#3, ms-S#6.
- Count source: inc-S#4, surface-136#8, in#2, error-paths#6.
- Classes: mobile-90#6, eng-all#2, in#6.
- Reactivate only for expired: mobile-98#6, plan-protocol#5, error-paths#4, rc#5, rg#7.
- Other: 99-p1#5, 99-p2#7, ms-S#8, surface-136#4, #6, in#1, in#3, in#8, in#10, eng-all#4, deepseek#1 (the shared hook), deepseek#8, ux#8, in#7, ux#4, rg#5, rc#2, rc#4, rc#6, rg#9, rg#10 (rewritten).
- Piles stay: mobile-98#7, eng-all#5.

Travel with task-357:
- five-words#4, inc-S#5, mobile-90#4, mobile-98#4, 99-p1#7, 99-p2#5, ms-S#4, plan-protocol#7, ux#2 (AC4 state 2).
- five-words#5, inc-S#6, ux#7 (Log out kept, Account dropped).
- deepseek#5, deepseek#11, in#9, rg#3, rg#6.
- surface-136#5 (its three goldens).
- rg#4 is shared: the design stays here and 357 follows it.

Travel with task-458: rc#3, rg#8 (press part; its settle part goes to 357).

Travel with task-459, moot here: five-words#2, inc-S#1, mobile-90#1, mobile-98#1, 99-p1#1, 99-p2#1, ms-S#1, plan-protocol#1, surface-136#1, eng-all#1.

Moot: ms-S#7, spring half only (task-459 exists). Its semi and map notice half stays as the pile.

#### 10. Limits, and what could fail or surprise
Limits:
- No purchase or upgrade control (RR-0454 item 3).
- No no-plan page: status null keeps today's notice until 357.
- No haptic and no spring.
- No web.
- The semi and map notices are piled.
- No new route, setting or schema value.

Risks:
1. If the catch is not widened, the new classes are swallowed (AC1 catches it).
2. A failed read keeps today's notice (accepted).
3. T9 :107 goes red on purpose. A lane that "fixes" it by deleting the check weakens a lock; the diff review checks for that.
4. A no-plan or expired person sees the loading state briefly while the read is pending (the 'wait' state). This is the v1 behaviour.
5. Whether a notice part carries the title and date: if it cannot, stop and bring it back (v1 UNVERIFIED).
6. 357 and 458 both edit SurfaceRenderer.tsx (different hunks); 457 (not planned) may touch index.tsx. Re-read by anchor at each merge.

#### 11. Dated notes owed (backlog CLI, short notes per RR-0429)
- doc-2 G.6 (`backlog doc update doc-2 --content`, fresh read, prior text kept): the limit and reactivate walls are built on the phone only; no top-up until the buying work; the no-plan page is task-357; the web waits (RR-0455 item 1).
- task-320 `--append-notes`: ST2 closed.
- task-452: `--plan` (this v2), the acceptance lines and title, then `--append-notes` with RR-0455 verbatim and the evidence.
- task-357 `--append-notes` at land: what 452 built for it (surface id, sha).

#### 12. Open choices forced by the split (ruled ones are not re-opened)
O1. A SubscriptionRequiredError with status null, in 452.
- (a) searchWall returns null (today's notice) and 357 adds 'no_plan'.
- (b) Return 'no_plan' now and have the hosts ignore it.
- RR-0392 and "do it right" point to (a). Recommend (a): no unused branch, and AC3 says so.

O2. The recheck settle haptics (successNotification and errorNotification once per press, deepseek#11).
- (a) With 357: the settle only exists with the recheck.
- (b) With 458.
- Recommend (a). 458 keeps only the renderer press.

O3. Order.
- 452 lands before 357, because 357 extends 452's surface, hook, searchWall and classes. Record a TASK-452 dependency on task-357.
- 458 is independent of 452.
- 459 after 458 (it wraps the same press).
- Recommend as stated.

#### 13. UNVERIFIED
- One `ls` of the fixture folders was denied because I added a /dev/null redirect against the brief. I read the same facts with git ls-files.
- Nothing was run. The pin numbers and the S-golden count are projections.
- Whether the descriptor or SV-DESC attach any rule to rate_limited and unauthorized beyond the closed list.
- The identity.route of the wall.
- Whether a notice part can carry the title and date.
- The next free S id.
- The test total after the change.

## Implementation Notes
(none)

## References
- docs/reports/reviews/task-452/GROUNDER-PLAN.md
- docs/reports/reviews/task-452/TRIAGE-PLAN.md
- docs/reports/reviews/task-452/seat-integration-1.md
- docs/reports/reviews/task-452/seat-reality-check-1.md
- docs/reports/reviews/task-452/seat-regression-1.md

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
- RR-0429 Dated notes are kept short — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
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
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0444 fold the McFixReborn findings — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task — "04  leave it as it is 02 Agrred add to the plan." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles — "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325)
- RR-0452 tooling plan approved; the three questions are not added — "Plan approved with one change - do not add the addiitonal 3 questions" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2336)
- RR-0453 Real addresses stay in the task 449 test rows
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work — "1 no switch 2 yes 3 yes 4 yes 5 please explain - isnt this a shared component for the nxt 1c" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2352)
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C — "1 y 2 y 3 y 4 I dont understand this question 5. is this after a search - provide context" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2357)
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once — "Q4 add a limit Q5 retry once auto at zero" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2362)
- RR-0149 Increment 1·A tooling location
- RR-0457 Output review shape agreed: code review, mechanical checks, one validating grounder; plan to follow
- RR-0458 Output review shape applies to all cards; plan shown against the agreed actions as one small task
- RR-0459 Smaller output review: no error-paths review at output; task created with label ProcessImprovement
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests — "Approved. Can you also send out an explorer agent so we can improve the quality of the phone checks for ios and andriod in a fast and efficient manner? Let's make sure we are doing this right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2382)
- RR-0461 Card 461 clean seat report: run a fresh integration seat
- RR-0462 Phone checks quick plan approved; a dead card carries only the label dead
- RR-0463 Task 458 haptic feedback moves to Increment 1C
- RR-0464 Task 460: no separate security review at output; the validating grounder reads the sensitive files
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
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
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
- RR-0429 Dated notes are kept short (names RR-0429) — "Keep notes short." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2202)
- RR-0443 report limit: top-up or higher-subscription screen; questions grounded before they reach the operator; partial address = pick from close addresses (names RR-0443) — "4) Nbr 2- why is this a defect? yes, they need a screen with a top up or a higher subscription" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283)
- RR-0444 fold the McFixReborn findings (names RR-0444) — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process (names RR-0445) — "01 - we are mobie first - we always take that approach but it works onthe web.  We follow the same process with all the development - look back and follow" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296)
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task (names RR-0446) — "04  leave it as it is 02 Agrred add to the plan." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2302)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks (names RR-0447) — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks (names RR-0448) — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0450 queue rules and orchestrator note off for code reviews; step handbook for compute only; three questions replace the five principles (names RR-0450) — "I just dont see how queue rules and orchestrator notes are valuable to anything from a code persepctive." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2325)
- RR-0452 tooling plan approved; the three questions are not added (names RR-0452) — "Plan approved with one change - do not add the addiitonal 3 questions" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2336)
- RR-0454 No switch on exact match; task 14 after launch; limit and no-plan screens wait for the buying work (names RR-0454) — "1 no switch 2 yes 3 yes 4 yes 5 please explain - isnt this a shared component for the nxt 1c" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2352)
- RR-0455 Task 452: web waits for switch-on; card split; spring is one card in Increment 1·C (names RR-0455) — "1 y 2 y 3 y 4 I dont understand this question 5. is this after a search - provide context" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2357)
- RR-0456 Semi question page gets a time limit; a zero-second rate limit retries once (names RR-0456) — "Q4 add a limit Q5 retry once auto at zero" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2362)
- RR-0460 Phone tests local first; inline report it link accepted; proof for new phone tests (names RR-0460) — "Approved. Can you also send out an explorer agent so we can improve the quality of the phone checks for ios and andriod in a fast and efficient manner? Let's make sure we are doing this right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2382)

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
- docs/reports/lanes/2026-11-24/BL-SFX2/REPORT.md (lane report naming task-450)
- docs/reports/lanes/2026-11-24/BL-SFX6/REPORT.md (lane report naming task-450)
### task-451 (dependency)
- docs/reports/reviews/task-451/FINDINGS-PLAN.md
- docs/reports/reviews/task-451/FOLD-CHECK.md
- docs/reports/reviews/task-451/GROUNDER-PLAN.md
- docs/reports/reviews/task-451/QUESTIONS-RULED.md
- docs/reports/reviews/task-451/TRIAGE-PLAN.md
- docs/reports/reviews/task-451/seat-integration-1.md
- docs/reports/reviews/task-451/seat-reality-check-1.md
- docs/reports/reviews/task-451/seat-regression-1.md
- docs/reports/lanes/2026-11-24/BL-SFX3/REPORT.md (lane report naming task-451)

## Dependencies
- task-450 SEARCHFIX.2 Search page: a street with no number asks for a house number; no-match flicker, strict lot-form check, typed "3", double retry message and the wrong-lot help topic corrected · status: BUILT
  final summary: Landed in ee3634771 (work, through the real hooks): the six search page fixes of task-450: (1) a street typed with no house number shows the refine line 'Add a house number to narrow it down.' and keeps the candidate list (ruled B); (2) a settled miss fetched again keeps the no-match line; (3) the lot form parses one extra field, the closed enums stay; (4) the minimum-length copy is filled from config.min_query_len on phone and web, not a typed 3; (5) the semi page opened cold and offline shows loading and does not redirect before the lookup settles; (6) the help page has the topic wrong-lot ('Wrong address or lot') and both search links point at it. Also L3 (a retry-after of 0 shows one message, MF35-DF1 closed), Q19 (client shim deleted), Q8, R2, R4, R5. The Spec 99 section 6.5 dated note is in ee3634771 and the task-319 dated note in 3f4f616fe. The census scripts/surfaces/_schema/census/mobile-product.json and three generated pages (127-surface-registry.md, 127-surface-review-queue.md, rule-lists-by-kind.md) were added to the Files line because the hooks regenerate them from this change. NOT PROVEN BY THE COMMIT HOOK: the mobile jest tests (red and green for AC1, AC2, AC3, AC4, AC5) are not reached by the pre-commit related run; they are owed at the push station, and the task is not complete until they pass there (operator rule: a task is not complete until it actually works). The push station also owes the full suite and the fold with sfx1 and sfx5 (regenerate the three generated pages, re-run surface-validate --check, re-check the 426 to 427 count locks). One later sweep for the 14 piled LOW ids: out-code-review-p1#1, out-code-review-p1#2, out-code-review-p2#3, out-compliance-inc-S-p1#2, out-compliance-mobile-90-p1#4, out-compliance-mobile-98-p1#3, out-compliance-mobile-99-p3#3, out-compliance-plan-protocol-p1#3, out-compliance-plan-protocol-p1#5, out-compliance-step-132-p2#4, out-compliance-surface-136-p1#1, out-compliance-surface-136-p3#3, out-error-paths-p1#1, out-ux-p1#7 (TRIAGE.md).

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 14 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX2/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX2/TRIAGE.md
- task-451 SEARCHFIX.3 Lot card: "Not available" for an implausible lot size, "at the back", "or report it", screen-reader labels, plain-page header links · status: BUILT
  final summary: SEARCHFIX.3 landed in 04c181564 (work; hooks GATE OK, POLICY CHECKS OK; pre-commit related run Test Files 17 passed | 1 skipped (18), Tests 419 passed | 7 skipped (426); red refused first with Test Files 7 failed, Tests 22 failed), 0e491221e (doc-2 dated notes incl. C.3 no neighbour lots, AC6 at doc-2 line 170), dd40a13d5 (task-336 dated note), merge 182a28053 of wf2/board, review records 63c96df49. Lot card: Not available for a size outside LOT_SIZE_PLAUSIBLE_M2, at the back for a lot with no fronting street, the no-lot line ends or report it linking the wrong-lot topic, the screen-reader label is the visible card text; plain pages get the header links; surface strings 427 to 436. Phone tests never run: AC4, AC5 and the phone halves of AC1 to AC3 are UNPROVEN until the Mobile CI job on the pushed tip shows lotMapPage.behaviour.test.tsx and lotMapScreens.golden.test.ts green and one device tap of report it is recorded. The card is not DONE and not called working. (The phone tests run only in the GitHub Mobile CI job after a push, not at the push station.)

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX3/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX3/TRIAGE.md
