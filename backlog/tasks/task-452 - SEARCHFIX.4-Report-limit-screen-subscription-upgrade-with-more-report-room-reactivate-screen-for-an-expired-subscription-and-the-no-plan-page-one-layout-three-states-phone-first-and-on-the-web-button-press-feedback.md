---
id: TASK-452
title: >-
  SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room)
  and reactivate screen for an expired subscription, phone first
status: RUNNING
assignee:
  - '@lane-BL-SFX4'
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-24T20:41:00Z'
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
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:step-132 docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
  - compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
  - compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
type: build
ordinal: 150050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 5 (BUILD.REPORT-LIMIT; task 7, FIX.PRESS-FEEDBACK, left with task-458) with amendment A2; every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 6 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: a customer at their report limit sees a screen offering a subscription upgrade with more report room (objective G.6, doc-2:94; RR-0443, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2283; RR-0444, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290). A customer whose subscription has expired sees a reactivate screen (RR-0444). One wall layout serves the two states, built on the phone first, following how the other pages were built (RR-0445, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2296); the web waits for its switch-on (RR-0455 item 1). The no-plan page, the haptic and the spring are not in this card (the split line below).

Findings folded: ST2, 2b, the O1 slot. Q14 left with the split (the haptic half is task-458, the spring half task-459); the semi and map notices stay as they are, piled. Starts from the approved mock report-limit.html (the no-plan mock goes with task-357) and existing components (PaywallScreen was checked first and is not reused, plan section 2).

Orchestrator reading, to be grounded at the plan stage: the purchase itself happens on the web; the phone wall carries the line or link, not a checkout.

Must not: build a new plan or checkout flow; move the report goldens (wall copy lives in the wall surface's own content file, mobile_parcel_wall.content.json; the search content is not edited).

Runs after SEARCHFIX.2 and SEARCHFIX.3 (shared match file and the string pins). Corrects the BUILT mark on objective G.6 by a dated note. Dated note owed: task-320.

Split by RR-0455 (MD:2357-2358): the no-plan page returns to task-357, the haptic is task-458, the spring is task-459; the web waits for its switch-on. Where the text above still names the no-plan page, the haptic or the web, the split governs.

Files: src/tests/surfaces/page-arm.logic.test.ts, mobile/src/components/surfaces/PageTableBinding.tsx, scripts/surfaces/_schema/static-page.schema.json, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_list.descriptor.json, mobile/src/lib/apiClient.ts, mobile/src/lib/errors.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/hooks/useWallState.ts, mobile/src/components/surfaces/WallBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/index.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/converted-surfaces.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.content.json, mobile/src/generated/surfaces/mobile_parcel_wall.json, scripts/surfaces/wall-golden-capture.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, mobile/__tests__/apiClient.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/wallScreens.golden.test.ts, mobile/__tests__/fixtures/wall.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_wall.goldens.json, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/static-page.logic.test.ts, src/tests/fixtures/surfaces/mobile_parcel_wall/
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A limit-reached or subscription-required 403 keeps its code, as two error classes (the limit one also keeps its limit and reset date); every other 403 stays today's ApiError, and ACCOUNT_DELETED still gives AccountDeletedError
- [ ] #2 At the limit, once the entitlement read has answered, the search page and the report screen show the wall with the count, the reset date and the plan line (no top-up or upgrade control until the buying work, RR-0454 item 3); never the reactivate copy; a failed read keeps today's notice (the count and date are the read's, not the 403's)
- [ ] #3 An expired subscription shows the reactivate state (the reactivate sentence, the plan line and Go to Tracked Lots); a subscription-required 403 with no plan, an active status or a failed read keeps today's notice (the no-plan page is task-357, RR-0455 item 2)
- [ ] #4 The web is unchanged by this card: it keeps its one not-entitled notice and gets the limit and reactivate screens with the web switch-on (MB-44, task-123, MAXBLD_WEB_LIVE pinned false; RR-0455 item 1)
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
Planner: Cairn-Plan-452b
Plan id: PLAN-452-v2

Read-only. I ran no tests, hooks or generators and wrote no file. Cites were read at board head 9fdbe4ac1, branch wf2/board. v1 was read at 9b709f475 and grounded at 0f8eca7a9. MD means ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. v2 is not a new design. It is PLAN-452-v1 as folded (docs/reports/reviews/task-452/v1/QUESTIONS-RULED.md and v1/GROUNDER-PLAN.md), cut down to the limit and reactivate screens. Round 1 of v2 (97 ids) is ruled in docs/reports/reviews/task-452/GROUNDER-PLAN.md, TRIAGE-PLAN.md and QUESTIONS-RULED.md, read at board head 1e3976ddc. Every ruled choice is kept.

## 1. Rules quoted first
- RR-0455, MD:2357-2358. Operator: "1 y 2 y 3 y 4 I dont understand this question 5. is this after a search - provide context". Ruled: "(1) yes, the web waits for its switch-on. (2) yes, task 452 is split: limit and reactivate screens stay; the no-plan page returns to task 357; the haptic change is its own card. (3) yes, the spring is one shared-part card in Increment 1·C. (4) and (5) NOT ruled".
- RR-0454, ruled line MD:2353 (operator, MD:2352: "1 no switch 2 yes 3 yes 4 yes 5 please explain - isnt this a shared component for the nxt 1c"; the put is MD:2351): "(3) The limit screen says the plan is managed on the web for now; the top-up or upgrade offer of RR-0443 waits for the buying work." Item (4) (the way to sign up) now travels with task-357.
- RR-0443, MD:2283: "yes, they need a screen with a top up or a higher subscription". RR-0444, MD:2290: "a subscription upgrade with more report room"; "a user with an expired subscription gets a reactivate screen".
- RR-0445, MD:2296: "we are mobie first ... but it works onthe web". RR-0455 item 1 now governs the web.
- RR-0392, MD:1975: "I don't think we need any other infastrcuture beyond this". RR-0429, MD:2202: "Keep notes short."
- RR-0450, MD:2326: queue rules and the orchestrator note are "not reviewed against code"; the step handbook is for compute only. RR-0452, MD:2337: the five-principles list is off.
- RR-0460, MD:2381-2383: phone tests run "local first, then push"; "a full local run passing before the push, then the Mobile CI run after it". Approved.
- MD:1476: "Let the grounder resolve them all as long as the result is compliant". That gave the page-table design (v1/QUESTIONS-RULED.md:15-20).
- Pilot (task-390): MD:1414-1423 held the unbuilt pages until the pilot result, and the grounder note on task-357 resolved them as a screens row of the page table, after the pilot is folded. The pilot is folded (cf3f0bf5a, S-page pins 8dba70e8e): 8 goldens ok, 180 situations and 0 differ (the BL-PAGETABLE lane proof), and its tests are in the suite (static-page.logic.test.ts T9, pageTable.logic.test.ts, semiQuestionScreens.golden.test.ts). The wall is that same screens row, a second one: T9 is widened per id, never removed. MD:1476 covers it; no operator question.

## 2. What exists and is reused (re-read at 9fdbe4ac1)
- The server 403s: error-mapping.ts:38 REPORT_LIMIT_REACHED {reportsLimit, resetsOn} and :29 SUBSCRIPTION_REQUIRED. Their senders: lookup route.ts:73, :112, :113 and lot-size route.ts:58. All unchanged.
- apiClient.ts:49-63 is the 403 block (ACCOUNT_DELETED :54, catch :60-61, generic throw :63, re-export :12). errors.ts:14-22 is ApiError.
- useParcelEntitlement is at useParcelLookup.ts:168-176. The search page reads it at index.tsx:52. The tracked route is PARCEL_TAB_ROUTE at parcelSearchMatch.ts:253-257. classifyParcelSearchError is at :298-301. The file ends at :366.
- The page table: static-page.json `screens` (:1291, semi row prefix parcel-semi at :1293). static-page.schema.json `action` enum :531-538 already holds push, so no schema edit is needed. PageTableBinding.tsx notice vars are at :99-100. SemiQuestionBinding.tsx closed lists are at :28-37. The semi host's no-op actions are at semi-question.tsx:87-88.
- Registrations: bindings.json modules :20 (owner binding_mobile_list), mounts :28-53 (a surface may have several mounts; mount_internal :10 allows @/hooks/). The capture precedent is scripts/surfaces/semi-question-golden-capture.ts. Goldens live in src/tests/fixtures/surfaces/<id>/<state>.mobile.json and mobile/__tests__/fixtures/surfaces/<id>.goldens.json. The census deviations precedent is mobile-product.json:15095 (S-093).
- ReportPageHost.tsx:34-35 (props) and :60-65 (top plus the lifecycle Renderer).
- The entitlement read (useParcelEntitlement) parses ParcelToolEntitlementSchema (schemas.ts:448-455): status, reportsLimit (a positive whole number or null) and resetsOnDisplay (a label such as 9 Dec 2026, or null). Its contract contract_parcels_entitlement declares both fields. The counts are null unless the status is in the active set (entitlements/index.ts:650), so an expired person gets null counts and a limit holder gets both. The search page and useWallState share one query key (useParcelLookup.ts:171): one fetch.
- SEARCHFIX.2 is task-450 (ee3634771) and SEARCHFIX.3 is task-451 (04c181564): both landed (section 8).
- PaywallScreen is not reused. It is lead-gen and the parcel product may not use it (v1 section 2, kept).

## 3. Split map: v1 item to v2 or to its card
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

## 4. Shared between staying and leaving parts, and where it now lives
- The surface mobile_parcel_wall (descriptor, content, slice, screens row, capture script, census entry, bindings entries) is built by 452 with states rate_limited (limit) and unauthorized (reactivate). task-357 adds static, loading and error to the same surface. That is the ruled design (v1/QUESTIONS-RULED.md:15-20); 357's old mobile_parcel_no_plan surface is superseded, and 357's card is corrected by the notes owed in section 11.
- Content key wall.plan "Your plan is managed on the web for changes." (RR-0466, MD:2410-2413; was "Your plan is managed on the web.") lives in 452's content. 357's static golden may reuse it; 357's own mock line is longer, so 357 decides whether it keeps its own key.
- WallBinding closed lists:
  - In 452: WALL_FLAG_NAMES [limit, reactivate]; WALL_VALUE_NAMES [route]; WALL_VAR_PATHS [reportsLimit, resetsOnDisplay]; WALL_CHOICES {}; WALL_CONTRACT contract_parcels_entitlement.
  - 357 appends the flags no_plan, checking and none, and the value recheck.
- searchWall returns 'limit' | 'reactivate' | 'wait' | null in 452. 357 adds the 'no_plan' branch (status null). The census deviations row lists limit and reactivate. 357 extends that row by a dated note.
- useWallState:
  - In 452: entitlement read, searchWall, push through router.navigate (FE-51). The rows do not name the other SurfaceActions, so they follow the semi host's no-op pattern (semi-question.tsx:87-88). useWallState returns the wall kind with its tree, content and actions, so index.tsx imports only SurfaceRenderer and @/hooks/useWallState (the import lock at parcelScreens.golden.test.ts:229-232 stays untouched) and [parcelId].tsx hands the same three to ReportPageHost.
  - 357 adds recheck, `asked`, sign_out and the settle haptics.
- Pins re-derived from the measured board (451 landed: 436 strings at surface-conformance.logic.test.ts:263). Projected; the lane measures before and after:
  - 452: S-sbind 17 to 18 surfaces, 436 to 443 strings (+7). S-screen 17 to 18 surfaces, 100 to 102 goldens.
  - 452: S-desc "examined 33 ... converted 17" to 34 and 18 (conformance :245; validate :93, :95). converted-surfaces.json expected_count :5, 33 to 34. S-page "(1 of 1 screens)" to "(2 of 2 screens)" (validate :93). S-golden "(18 states x 4 ...)" is measured, not projected.
  - 357 later: 443 to 451 strings, 102 to 105 goldens, no new surface.
  - Bindings pins (surface-conformance.logic.test.ts): :394 [14, 8, 25] to [15, 8, 27] (+1 module WallBinding.tsx, +2 mounts); :810 the mobile module list gains mobile/src/components/surfaces/WallBinding.tsx after PageTableBinding.tsx (inserted there in bindings.json). Written red first.
  - page-arm.logic.test.ts (:94-:118) builds the real table through a one-surface context: its control, its RED cases that reuse the real table and its second-caller case are widened to the semi and the wall surface (manifest.converted, inScope, contracts with contract_parcels_entitlement, bindings.modules, copied files). The control then reads 2 of 2, the expected counts move from 1 to 2, and the second-caller case reads 2 read, 3 expected; it stays red for a real second caller.
  - Web T7 lock 70 (admin-media.golden.test.ts:38) does not move.
- Phone suite: 58 files, 866 tests at a12d535f5. wallScreens.golden.test.ts makes 59 files; the lane records the test total.

## 5. The change, file by file, in build order (v1 numbers in brackets)
1. [1] errors.ts after :22. ReportLimitError and SubscriptionRequiredError extend ApiError: status 403, message 'Forbidden', a code member. ReportLimitError adds reportsLimit (number or null) and resetsOn (string or null). As v1.
2. [2] apiClient.ts:49-63. Read errObj.code and throw the matching class. Details are taken only when typed right. The catch at :60-61 also rethrows `e instanceof ApiError`. Re-export at :12. ACCOUNT_DELETED still throws AccountDeletedError first (:54, lock :113). Every other 403 stays ApiError(403). As v1.
3. [3] parcelSearchMatch.ts, append `searchWall(error, read)` after :366:
   - ReportLimitError: 'wait' while pending (fetching with no data, and not failed; a disabled read, no token, is not pending); 'limit' once the read answered with a number for reportsLimit and a resetsOnDisplay; else null.
   - SubscriptionRequiredError: 'wait' while pending; 'reactivate' only for status 'expired'; null for any other status (including null, until 357) and for a failed read.
   - Anything else: null.
   - No existing line is edited.
4. [4] New surface mobile_parcel_wall (S id claimed in the ledger; census refs go up to S-095 today):
   - Descriptor: archetype LIST and identity.platforms [mobile], which T9 requires (static-page.logic.test.ts:109). Content file. Slice via emit-mobile-surfaces.mjs.
   - Row screens.mobile_parcel_wall in static-page.json (contract contract_parcels_entitlement, binding WallBinding.tsx, platforms [mobile]).
   - bindings.json: module entry beside :20, mounts for index.tsx and [parcelId].tsx.
   - converted-surfaces.json: +1, expected_count 34.
   - One static-page.schema.json edit (RR-0466): the notice text part role grows to text, title, small; no new kind.
5. [5] 7 keys: wall.limit.title "You’ve used all {limit} reports"; wall.limit.reset "Your count resets on {date}."; wall.limit.opened "Lot reports you’ve opened this month stay available." (RR-0466; was "Lots you’ve opened this period still open."; the operator confirms the wording against the metering rule); wall.limit.stay "Your Tracked Lots remain." (was "Your Tracked Lots stay."); wall.plan "Your plan is managed on the web for changes."; wall.tracked "Go to Tracked Lots"; wall.reactivate (today's search.entitlement sentence, copied; the search content is not edited). "How are reports counted?" stays out.
6. [6] WallBinding.tsx (new, SemiQuestionBinding shape). Lists as in section 4. Classes from the semi class table (lotMap.ts, min-h-[44px]). Count and date come from the read; the 403's own values are never drawn (v1 in#2: the date label is the server's, RR-0310; a failed read keeps today's notice). Both states carry wall.plan and wall.tracked, which have no when; the limit state adds the title, reset and the two lead lines (text, not controls); the reactivate state adds wall.reactivate. Emphasis (RR-0466): the title part takes the new notice role title (the existing heading look, text-base font-semibold text-report-ink with its dark twin) and the reset part the new role small (smaller muted text), both drawn by the same AlertDescription node, so no new component and C-8m is untouched. The notice text part role in static-page.schema.json grows from text to text, title, small (a dated note in its comment); PageTableBinding.tsx picks the class by role, PageStyles.notice gets optional title and small, the wall style table in WallBinding supplies them, and the semi styles leave them unset, so every semi golden stays byte-identical.
7. [8] useWallState.ts (new): reads useParcelEntitlement, calls searchWall, builds the wall props and returns the wall kind with its tree, content and actions; push uses router.navigate to PARCEL_TAB_ROUTE.tracked (never index.tsx:81-86 navigate, which records a recent search). Both hosts call it unconditionally at the top, with the error as an argument. Spec 99: it reads the existing B1 key, so no new store, field or bridge, and no §3, §4 or §5 rule changes (navigate is FE-51; the registry row stays a display and the server 403 is the gate, v1 mobile-99-p1#4).
8. [9] index.tsx and [parcelId].tsx call useWallState(error); [parcelId].tsx adds error to its destructure at :22 and keeps its two pinned lines byte-identical (search-routing.logic.test.ts:146-147). 'wait' draws the loading state: on the search page the existing one, on the report screen the loading lifecycle (never the error one, so no error flash comes before the wall). A wall replaces the search tree, or goes to ReportPageHost's wall prop; only for 'limit' and 'reactivate', never on a generic error.
9. [10] ReportPageHost.tsx:34-35 gets an optional `wall` prop { tree, content, actions }, all three from useWallState (the host's own content lacks the wall keys and its ReportActions lack push, so a wall drawn with them would throw). When it is set and view is null, :60-65 render `top` then the wall Renderer in place of the lifecycle; a shown report is never replaced. Existing tags only, so C-8m (MOBILE_HOSTS, surface-conformance.logic.test.ts:752) holds.
10. [11] The web is unchanged (RR-0455 item 1). No web file is edited; it keeps its one not-entitled notice.
11. [12] Census: append mobile_parcel_wall with the dated deviations row, and add WallBinding.tsx to binding_mobile_list's owns.components (mobile-product.json, about :14920; C-3 refuses a module its owner does not own; precedent 782425428). The emit run rewrites binding_mobile_list.descriptor.json (on the Files line). First commit of the lane: the three cites of useParcelEntitlement in census/contracts.json (:23203, :23207, :23243) go from useParcelLookup.ts:162 to :168 (task-457's fold moved the line; fix-tune.logic.test.ts D15 reads it and is red now); the emit run then rewrites the F02 entitlement descriptor and 127-surface-registry.md, and D15 goes green. 452 does not edit the hook, so the line stays 168; D15 reads it, so any later move shows at once. Then generate-surface-registry --emit-descriptors, the plain run (the two 127 files), --check, and consumer-registry --check. 449, 450 and 451 have all landed, so 452 regenerates them itself.
12. [13] Fixtures and goldens:
    - wall.situations.json (two situations).
    - Goldens src/tests/fixtures/surfaces/mobile_parcel_wall/{rate_limited,unauthorized}.mobile.json and mobile/__tests__/fixtures/surfaces/mobile_parcel_wall.goldens.json.
    - Run order: wall-golden-capture.ts --write, then emit --write, then surface-validate --check.
13. [14] Pins as in section 4. NEW, not in v1: T9 static-page.logic.test.ts:107 pins `Object.keys(SCREENS)` to the semi id alone, so adding the row turns it red. T9 :101-118 is widened to both ids, and each id is checked against its own binding (:103 is BINDING, :114-118 is the no-JSX check). Also red until the surface exists: page-arm.logic.test.ts and the two bindings pins (section 4). Also a static-page.logic.test.ts T1 planted defect: a notice text part with a role outside text, title, small is refused (red before the schema edit).

## 6. Tests first (red, then green); each maps to an acceptance line
Phone tests run in the full local run before the push (RR-0460), then Mobile CI after it.

AC1, mobile/__tests__/apiClient.test.ts beside :132:
- REPORT_LIMIT_REACHED gives ReportLimitError with code, 10 and the ISO date, instanceof ApiError, status 403.
- SUBSCRIPTION_REQUIRED (lookup and lot-size) gives SubscriptionRequiredError.
- Bad details give reportsLimit null.
- These three are red. Kept locks :113 and :132 stay green both ways. One new case: an ENTRY_OFF 403 (lot-size route.ts:52) stays ApiError(403); it is green before the change, since no mobile test covers it today.

AC2:
- parcelSearchMatch.test.ts, new describe "searchWall": pending gives wait; numeric count plus date gives limit; a failed or incomplete read gives null (red: the function is missing).
- parcelSearchScreen.behaviour.test.tsx:
  - The entitlement mock (:34-41) gains data and a pending state.
  - The expo-router mock (:21-24) gains navigate (correction: v1 omitted it).
  - Case "limit wall": {reportsLimit:10, resetsOnDisplay:'9 Dec 2026', status:'active'} shows "You’ve used all 10 reports", "Your count resets on 9 Dec 2026.", "Lot reports you’ve opened this month stay available.", "Your Tracked Lots remain.", "Your plan is managed on the web for changes.", no parcel-search-entitlement, no parcel-search-empty and not the reactivate sentence. Go to Tracked Lots calls navigate with PARCEL_TAB_ROUTE.tracked ('/(app)/parcel-tool/tracked'); recents stay empty.
  - Gate stability (Spec 99 §8.3): the wall, and the wait state, render the same JSX with isFetching true and false once data exists (in this file and in reportPage.behaviour). The wait case shows the loading state, and neither the notice nor the miss copy.
- reportPage.behaviour.test.tsx: a host with a wall prop { tree, content, actions } and no view renders the wall and Back, not the lifecycle error (red: no prop); with a view the report stays. The limit wall shows the read's count, date and plan line. Pressing Go to Tracked Lots calls navigate; a host whose wall actions lack push throws on the wall tree (the existing fence, SurfaceRenderer.tsx:113). On wait the loading lifecycle shows, not the error one.
- wallScreens.golden.test.ts (new): the rate_limited golden equals wallProps; every key is used; the 44 px and layout walkers pass; the six wall literals of report-limit.html state 3 (:286-287), three of them as RR-0466 reworded them (MD:2410-2413: wall.limit.opened, wall.limit.stay, wall.plan; the ruling, not the mock, is their pin), equal the content, and the reactivate sentence equals search.entitlement in the search content. The title part carries the title class and the reset part the small class. A walker asserts that no two siblings of any wall golden props tree share a key (red first on the limit golden: its five text lines), and the semi capture --check stays green.
- The pins and T9 (section 5 step 13) are written first with the new numbers: red until the surface exists.

AC3:
- searchWall: SubscriptionRequiredError with 'expired' gives reactivate; with null, 'active' or a failed read gives null; a plain 403, 500, 429 and no error give null.
- Behaviour "expired": the reactivate words appear inside the wall, with the plan line and Go to Tracked Lots.
- Watch: the reactivate words equal today's notice word for word, so the test must assert the wall itself: the wall's prefix testIDs and "Go to Tracked Lots", and parcel-search-entitlement and parcel-search-empty absent. Otherwise the test is green before the change.
- Behaviour "no plan yet": status null keeps today's notice (a lock until task-357: the test carries a comment naming task-357, whose card says to flip it).
- unauthorized golden.

Report-mount stubs: reportScreen.gateStability (:22), reportScreen.mount (:33) and semiQuestionPage (:35) give their useParcelLookup mock a useParcelEntitlement stub; gateStability is re-run. reportScreen.mount also gets two cases that mount the real route (the wiring of [parcelId].tsx): a ReportLimitError with a limit read shows the wall (red first, as the route passes no error today), and the same error with the read pending shows the loading lifecycle, not the error one.

AC4 (web unchanged):
- check-task-files: no web path in the diff.
- admin-media T7 stays 70.
- Smoke :88 (plain 403 keeps the notice) stays green.

Before the suite runs, the lane writes the Std 11 checklist (00_engineering_standards.md:288).

## 7. New card text, word for word
Title: SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room) and reactivate screen for an expired subscription, phone first

Description edits:
- "What changes": drop the no-plan sentence and the haptic sentence. Add: "Split by RR-0455 (MD:2357-2358): the no-plan page returns to task-357, the haptic is task-458, the spring is task-459; the web waits for its switch-on."
- "Findings folded: ST2, 2b, the O1 slot."
- "Must not:" drop "call expo-haptics directly".

Files: mobile/src/lib/apiClient.ts, mobile/src/lib/errors.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/hooks/useWallState.ts, mobile/src/components/surfaces/WallBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/index.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/bindings.json, scripts/surfaces/_schema/converted-surfaces.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.content.json, mobile/src/generated/surfaces/mobile_parcel_wall.json, scripts/surfaces/wall-golden-capture.ts, docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md, mobile/__tests__/apiClient.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/wallScreens.golden.test.ts, mobile/__tests__/fixtures/wall.situations.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_wall.goldens.json, src/tests/surfaces/surface-validate.logic.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/surfaces/static-page.logic.test.ts, src/tests/fixtures/surfaces/mobile_parcel_wall/
(32 entries here; the Description's Files line is the one that counts and holds 38: these plus scripts/surfaces/_schema/static-page.schema.json (RR-0466) and src/tests/surfaces/page-arm.logic.test.ts, scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_list.descriptor.json, mobile/src/components/surfaces/PageTableBinding.tsx, scripts/surfaces/_schema/census/contracts.json and scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json. Off the line: SurfaceRenderer.tsx, Spec 126, MCFRONTEND-QUEUE.md, surfaceRenderer.smoke.test.tsx, parcelScreens.golden.test.ts (its import lock stays true) and search-routing.logic.test.ts (read only). The broad src/tests/fixtures/surfaces/ is narrowed to the wall folder.)

Acceptance (as put in v2; the folded wording is in the Acceptance Criteria section, which governs):
- #1 A 403 keeps its code, limit and reset date; limit reached and subscription required are two error classes
- #2 At the limit, the search page and the report screen show the wall with the count, the reset date and the plan line (no top-up or upgrade control until the buying work, RR-0454 item 3); never the reactivate copy
- #3 An expired subscription shows the reactivate state; a subscription-required 403 with no plan, an active status or a failed read keeps today's notice (the no-plan page is task-357, RR-0455 item 2)
- #4 The web is unchanged by this card: it keeps its one not-entitled notice and gets the limit and reactivate screens with the web switch-on (RR-0455 item 1)

## 8. Board changes since v1, taken in
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

## 9. Review findings (the v1 ids, docs/reports/reviews/task-452/v1/TRIAGE-PLAN.md)
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

## 10. Limits, and what could fail or surprise
Limits:
- Size: GUESS 34 Files-line entries, one lane, not measured (plan-protocol 5.5); three entries were added at the lane stop, so 38 now (the schema file added by RR-0466).
- Home: milestone m-1, label SEARCHFIX-PRIORITY (RR-0447); source: doc-2 G.6 (doc-2:94) and the fold plan, task 5 (plan-protocol 5.2).
- No purchase or upgrade control (RR-0454 item 3).
- No no-plan page: status null keeps today's notice until 357.
- No haptic and no spring.
- No web.
- The semi and map notices are piled.
- No new route or setting; the one schema value added is the notice text roles title and small (RR-0466).

Risks:
1. If the catch is not widened, the new classes are swallowed (AC1 catches it).
2. A failed read keeps today's notice (accepted: ruled in v1, in#2; the date label is the server's, RR-0310; AC2 says so).
3. T9 :107 goes red on purpose. A lane that "fixes" it by deleting the check weakens a lock; the diff review checks for that.
4. A no-plan or expired person sees the loading state briefly while the read is pending (the 'wait' state). This is the v1 behaviour.
5. RULED at the lane stop (round 2): a notice part carries the title and the date (vars), but the builder gave every text part of one notice the same React key (PageTableBinding.tsx:101). Fix: the first text part keeps today's key exactly, later text parts get a counter, so every semi golden stays byte-identical (semi capture --check); PageTableBinding.tsx is on the Files line. All wall lines sit in one neutral notice per state (the look of the semi notices, not the plain heading of report-limit.html state 3); one schema edit for the emphasis roles (RR-0466), no new kind (v1/QUESTIONS-RULED.md:15-20, RR-0392).
6. 357 and 458 both edit SurfaceRenderer.tsx (different hunks). 457 shares only semiQuestionPage.behaviour.test.tsx (452 edits the mock at :35, 457 adds cases after :248: docs/reports/reviews/task-457/QUESTIONS-RULED.md:37); it touches neither index.tsx nor parcelSearchMatch.ts and has no dependency on 452 (none is owed). 392 (the phone search page from table rows) rewrites index.tsx and the search binding, and 394 scans every binding module for content-key and testID literals, so WallBinding keeps none. 454 and 456 depend on 452 and run after it. Whoever lands second re-reads by anchor and re-measures the pins.
7. The limit 403 needs a produced report and a parcel_tool holder at the allowance (lookup route.ts:97-112): a test that never forces limit_reached proves nothing. A semi Continue at the limit still says reactivate (known gap, piled). New behaviour fixtures carry resolution (450 Q19 reads a missing one as a miss). The search goldens stay byte-identical: no search golden, content or census entry is in the diff (task-357 AC5).

## 11. Dated notes owed (backlog CLI, short notes per RR-0429)
- doc-2 G.6 (`backlog doc update doc-2 --content`, fresh read, prior text kept): the limit and reactivate walls are built on the phone only; no top-up until the buying work; the no-plan page is task-357; the web waits (RR-0455 item 1).
- task-320 `--append-notes`: ST2 closed.
- task-452: `--plan` (this v2), the acceptance lines and title, then `--append-notes` with RR-0455 verbatim and the evidence.
- task-357 notes, owed now (not at land) and again at land: now, the dependency on TASK-452, the surface mobile_parcel_wall, a Files line re-derived from 452's, a size re-measured, and the label (dead comes off: the card is live again); at land, what 452 built for it (surface id, sha).
- task-458 and task-459 notes: they cite docs/reports/reviews/task-452/QUESTIONS-RULED.md, which is now docs/reports/reviews/task-452/v1/QUESTIONS-RULED.md.

## 12. Choices forced by the split (ruled in round 1 of v2: docs/reports/reviews/task-452/QUESTIONS-RULED.md)
O1. RULED (a): a SubscriptionRequiredError with status null returns null (today's notice) and 357 adds 'no_plan'. AC3 says so; RR-0392 forbids an unused branch.

O2. RULED (a): the recheck settle haptics (successNotification and errorNotification once per press, deepseek#11) go with task-357, where the recheck lives; 458 keeps only the renderer press and sits in 1·C (RR-0463), so a 1·B card cannot wait on it.

O3. RULED, order: 452 lands before 357, because 357 extends 452's surface, hook, searchWall and classes, so task-357 takes a dependency on TASK-452 and its ordinal moves after 452's (452 depends on 450 and 451 only, as its front matter says).
- 458 is independent of 452 and sits in 1·C.
- 459 comes after 458 (it wraps the same press).
- 454 and 456 already depend on 452.

## 13. UNVERIFIED
- One `ls` of the fixture folders was denied because I added a /dev/null redirect against the brief. I read the same facts with git ls-files.
- Nothing was run. The pin numbers and the S-golden count are projections.
- Whether the descriptor or SV-DESC attach any rule to rate_limited and unauthorized beyond the closed list.
- The identity.route of the wall.
- Settled by reading: notice parts carry content and vars (PageTableBinding.tsx:99-100); how the title reads as a notice part is the lane's first look (risk 5).
- The next free S id.
- The test total after the change.

Plan review round 1: 60 folded, 0 task, 0 ruling, 0 wontfix, 6 pile; grounder docs/reports/reviews/task-452/GROUNDER-PLAN.md; triage docs/reports/reviews/task-452/TRIAGE-PLAN.md
plan-compliance-inc-S#1 MED folded once the entitlement
plan-compliance-mobile-90#1 HIGH folded ACCOUNT_DELETED stil
plan-compliance-mobile-90#2 HIGH folded it reads the existin
plan-compliance-mobile-90#5 MED folded SEARCHFIX.2 is task-
plan-compliance-mobile-98#2 HIGH folded once the entitlement
plan-compliance-mobile-98#3 MED folded task-357 takes a dep
plan-compliance-mobile-98#4 MED folded Gate stability (Spec
plan-compliance-mobile-98#5 MED folded mount the real route
plan-compliance-mobile-99-p1#1 HIGH folded Gate stability (Spec
plan-compliance-mobile-99-p1#2 MED folded ACCOUNT_DELETED stil
plan-compliance-mobile-99-p1#4 MED folded task-357 takes a dep
plan-compliance-mobile-99-p2#1 MED folded no §3, §4 or §5 rule
plan-compliance-ms-S#2 HIGH folded The entitlement read
plan-compliance-plan-protocol#1 HIGH folded Size: GUESS 34 Files
plan-compliance-plan-protocol#2 HIGH folded task-357 takes a dep
plan-compliance-plan-protocol#4 HIGH folded MB-44, task-123, MAX
plan-compliance-plan-protocol#5 MED folded not the reactivate s
plan-compliance-plan-protocol#6 MED folded O2. RULED (a): the r
plan-compliance-plan-protocol#7 MED folded Home: milestone m-1,
plan-compliance-step-132#1 HIGH folded task-357 takes a dep
plan-compliance-step-132#2 MED folded once the entitlement
plan-compliance-step-132#3 MED folded not the reactivate s
plan-compliance-step-132#5 MED folded ruled line MD:2353 (
plan-compliance-step-132#6 MED folded SEARCHFIX.2 is task-
plan-compliance-surface-136#1 HIGH folded once the entitlement
plan-compliance-surface-136#3 MED folded The entitlement read
plan-compliance-surface-136#5 MED folded not the reactivate s
plan-error-paths#1 HIGH folded the loading lifecycl
plan-plan-review-deepseek#1 HIGH folded The entitlement read
plan-plan-review-deepseek#2 HIGH folded once the entitlement
plan-plan-review-deepseek#4 MED folded never on a generic e
plan-plan-review-deepseek#6 MED folded whose card says to f
plan-plan-review-deepseek#7 MED folded Both hosts call it u
plan-plan-review-deepseek#9 MED folded task-357 takes a dep
plan-ux#1 HIGH folded (the reactivate sent
plan-ux#2 MED folded once the entitlement
in#1 HIGH folded page-arm.logic.test.
in#2 HIGH folded Bindings pins (surfa
in#3 HIGH folded owns.components (mob
in#4 MED folded import lock at parce
rg#1 MED folded Pilot (task-390): MD
rg#2 MED folded a host whose wall ac
rg#3 MED folded no parcel-search-emp
rg#4 MED folded owed now (not at lan
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24 taken on the board at lane launch (lane BL-SFX4, worktree /Users/brettpreston_macmini/Buildo-wt-sfx4, branch wf2/inc1b-sfx4), RR-0240
<!-- SECTION:NOTES:END -->
