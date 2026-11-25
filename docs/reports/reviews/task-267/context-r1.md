# Review context for task-267 (no plan id) written 2026-11-25 by backlog-brief.mjs (round 1)

## Task
task-267 LOAD.2 Loading screen (MF-62 Checking your lot): the animation keeps its set length...
status: WAITS · milestone: m-1 · assignee: @lane-BL-LOAD2 · labels: McFixV2

## Description
Full title: LOAD.2 Loading screen (MF-62 Checking your lot): the animation keeps its set length (23 s today) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap)

snapshot: docs/reports/plan-import/raw/2026-11-19/ (sequence.json sha256 12b1774a3bf4)
Estimate: UNMEASURED

Plan text at the snapshot: RULED; panel + build pass owed; edge case owed: the screen when a load fails; waits LOAD.1
slicePart: page and binding
planNote: storage-policy: dependsOn LOAD.1,LOAD.3 (the 35 s seed max (LOAD.3); the updating state is the existing lifecycle loading, no new task needed here (seat K))
planNote: storage-policy: title + ; where the numbers are not ready at the maximum the report opens with the "updating" state, never an old number (A-MF62) (screen is not a gate for Skip and re-open edges)
planNote: loading-r2: title Loading screen (MF-62 Checking your lot): the animation keeps its set length (23 s today) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap) (operator 2026-11-18 MORNING-DECISIONS.md ("so right now the animation takes 23 seconds ... the report and the details should be loaded" + "yes that is correct"))
planNote: loading-r2: status RULED; panel + build pass owed; edge case owed: the screen when a load fails; waits LOAD.1 (operator 2026-11-18 MORNING-DECISIONS.md ("so right now the animation takes 23 seconds ... the report and the details should be loaded" + "yes that is correct"))
who (plan text): McFrontend lane (MF-62 follow-up)

## Acceptance criteria
- #1 Pre-register the expected moves, committed alone — "Pre-register the task's `rules[]` and expected moves" (.cursor/MCBYLAWS-QUEUE.md:109)
- #2 Failing tests are written into the plan and reviewed at plan altitude — "are written INTO the plan and reviewed at PLAN altitude" (docs/specs/00-architecture/08_agents.md:465)
- #3 `write_scope` declared in the brief — "The brief file opens with a front-matter block" (docs/specs/00-architecture/08_agents.md:144)
- #4 PLAN panel run with the lens set, never one generic pass — "NEVER run one generic pass" (docs/specs/00-architecture/08_agents.md:334)
- #5 Fold validated by a grounder that re-executes every claim — "one grounder re-executes every claim in the fold" (docs/specs/00-architecture/08_agents.md:458)
- #6 Built red first, then green, on the tip — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- #7 OUTPUT panel record committed with the work — "is committed with the work (R-KM)." (.cursor/MCBYLAWS-QUEUE.md:116)
- #8 McFrontend build only: queue row first — "No McFrontend work starts without its row in" (docs/specs/02-web-admin/126_maxbld_surface_standard.md:72)

## Implementation Plan
Planner: Cairn-Plan-267
Plan id: PLAN-267-v2
Head read: 2fd2f6042 (wf2/board). Since v1 (4c22af6e8) only docs and backlog files changed, so every code line cited in v1 still holds. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. Mock = ~/Buildo-scratch/lanes-20261125/mcfixv2-267/MOCK-LOADING-ENDINGS-approved.html, read whole including its table and foot. This version replaces v1 and builds task-317 in the same lane, by RR-0477 (MD:2496) and RR-0488 (MD:2547).

#### 1. Rules quoted first
- RR-0176, MD:783/786: "the animation takes 23 seconds - this goes to completion - the buttononly appears when the load is done". Ruled: "always runs to completion", "no 35 s cap".
- MD:695: "from the search page". The reading at :696: the calculation "starts when the user picks the address".
- RR-0485, MD:2533:
  - "4. We should not send a report without pricing" (task-343).
  - "5. Always - except for a tracked/stored lot or one that has previously been opened".
- RR-0486, MD:2538: "it may not be the users lot they are checking - just a note to clarify".
- RR-0490, MD:2559:
  - "1 a": keep "Could not load this report. Try again."
  - "3 b - let the animation finish and then say the report failed (same screen as 2a for a failure after 60 seconds)".
  - "4 B - no report screen".
- RR-0491, MD:2563: "Teh mock looks great! 1 Change (1) Still building - Loading the report shuld be centered horizontally as opposed to left justified. Approved".
  - The orchestrator's reading at :2564-2565: the give-up is 60 s from the pick; the lines stay on the failure and no-report screens; a no-report lot plays the lines to the end first.
- RR-0477, MD:2496 (batching). RR-0482, MD:2518 ("larger tasks and using existing components").
- RR-0278, MD:1082: "I should only be charged a report if I find the address and lot Im looking for and a report is produced".
- MD:1409: "Phone retires yes" (keep the 3 retries).
- MD:699: "Once somebody opens a lot or tracks a lot - we have this lot data saved".
- Spec 126:869: "it doesnt need a title... it should be processing". The coordinator's relay on that line: remove the title "and any section labels".
- Spec 136 fe.35 (:136): no "live-progress word". The lock report-checked.logic.test.ts:279 refuses 'Checking your lot'.
- Spec 136 fe.31 (:124): existing components.
- Spec 128 Rule 3 and the FIX.TUNE precedent (semiQuestion.ts:17, config.continue_wait_ms): a timeframe is surface config backed by a registered logic variable, never a typed number.
- The "already discussed" skip rule: FOUND for opened lots only. MF-62/plan.md:44 says "Re-opened lot (already counted this period, MF-45 D-3 a): screen skipped". That plan was approved with "Mf-62 - yes" (phase1/open-questions.md:963) and is built as showsWhatWeChecked (what-we-checked.ts:49-51). No earlier line says to skip for a tracked or stored lot; the nearest is MD:699. The mock's table row "Lot opened before, or stored: No check lines. The report opens directly" now draws it, approved by RR-0491.

#### 2. What exists and is reused
- Server:
  - lookup-flow.ts:79-90 (the stored read at :83, the compute at :87).
  - The meter at route.ts:114-123.
  - openReport (entitlements/index.ts:590-614; already_counted at :606; usageFor is private at :559).
  - readWhatWeChecked (what-we-checked.ts:167), which returns null on any error.
  - The core's checked tree and view: buildChecked (core.ts:130); a loading tree that carries checked (:239-243).
  - The view adds checked with paced=true on collapsed rows. With no href it draws no Skip (:397-403).
- Phone:
  - The persisted ['parcel-lookup', id] cache (useParcelLookup.ts:107-116; _layout.tsx:490; queryClient.ts:41).
  - reportScreenState (ReportBinding.tsx:399-403), lifecycleProps (:369-381), backProps (:383-389), the key lists (:392-394).
  - The host state (ReportPageHost.tsx:40-41) and the wall (useWallState, [parcelId].tsx:26).
  - The Back action (useGoBack).
- The existing 60 s:
  - setting maxbld_page_continue_wait_ms, read as SEMI_CONTINUE_WAIT_MS (semiQuestion.ts:17);
  - the timer boundedWait (:26-35).
- Words that already exist:
  - states.lifecycle.loading "Loading the report…", .error "Could not load this report. Try again.", .miss "No report for this lot yet." (report-presentation.json:87-89);
  - retry.text "Try again" (mobile_parcel_detail.content.json);
  - states.checked.ready / open "View report" / summary (report-presentation.json:139-142).
- The precedent for a request flag: semi=answered (useParcelLookup.ts:40-44; route.ts:81).
- Generators:
  - generate-surface-registry.mjs (--emit-descriptors :1596, default run, --check);
  - emit-mobile-surfaces.mjs --write;
  - report-page-capture.ts (MOBILE_LIFECYCLE_STATES :78).

#### 3. What the rulings and the mock settle, and the answers to v1 (a)-(f)
- (a) The hand-off is unchanged from v1. The stored read and the compute run only on the parcelId form; a q hit sends page null and logs not_produced. The usage rows are identical before and after:
  - new lot: 1;
  - already counted: 0;
  - tracked lot (a stub today, useTrackedLots.ts:52): same as the two rows above;
  - at-limit new lot: 0, but the 403 wall moves from the search page to the report screen.
  - The seam with 343 is route.ts:114-116 and consumer-lookup.ts:66 (343's) against lookup-flow.ts:83-90 (267's). 267 lands first.
- O4 is now RULED (RR-0490 3 b). A failure or a miss that arrives while the lines play waits until they end. Then comes screen 4 (failure) or screen 5 (no report).
- Give-up is RULED: 60 s from the pick (RR-0491, LD-2 A).
  - How it meets RR-0176: RR-0176 removed the 35 s cap on a report that is still arriving. Between 23 and 60 s that still holds: screen 3, and the button appears the moment the page lands.
  - RR-0491 adds a failure bound at 60 s; that bound is new, not the 35 s cap coming back.
  - Owed: a dated note in Spec 126 §11a.7 and Spec 100 §4 saying that RR-0491 bounds RR-0176's "however long that takes" at 60 s from the pick. Also a card note on 267, whose title says "however long".
  - The pick mark is the report screen's mount, milliseconds after the push. 465's push is the pick.
- O3 Skip: the mock draws none. RR-0176 says the animation "always runs to completion", and the core draws no Skip when it is given no href (core.ts:399-403). Settled: no Skip, and none is passed.
- O2 picture: the mock draws lines only. Settled: no scene, no new component kind.
- O6 bar title: the mock draws the lot's address in the bar, taken from the checked view's address (what-we-checked.ts:45). Settled.
- The label "Checks for this lot" is drawn VISIBLE in the mock. It conflicts with Spec 126:869 ("any section labels"). Left open as O8.
- Words per screen:
  - Screen 1: verbs and lines, server-built.
  - Screen 2: states.checked.ready plus states.checked.open "View report".
  - Screen 3: states.lifecycle.loading, centred (RR-0491's one change).
  - Screen 4: states.lifecycle.error plus retry.text.
  - Screen 5: states.lifecycle.miss plus NEW back_to_search.text "Back to search". The key lives in mobile_parcel_detail.content.json; its action is the existing `back` (useGoBack). It moves: the content file, ReportBinding.tsx:394 SCREEN_CONTENT_KEYS, the generated slice mobile/src/generated/surfaces/mobile_parcel_detail.json, reportPage.behaviour.test.tsx:156, reportScreens.golden.test.ts:285, props/miss.mobile.json, and reportScreen.mount.behaviour.test.tsx.
- (b) When the lines show (RR-0485 item 5 and the mock's table). They are skipped when:
  - the persisted cache holds a page (opened on this phone); or
  - the parcelId answer brings a page with no checked view (a stored lot, or already counted: showsWhatWeChecked); or
  - the checked view is null for an unknown lot or unusable pace (the producer's promise).
  - Tracked lots: tracking is not built. A tracked lot is stored (MD:699), so the stored rule covers it once task-269 and task-265 land. No field now.
- (d) The wait today: 11-23 s per compute, and M1 computed the same lot twice (21.7 s plus 21.0 s). After this plan: one compute behind the lines; screen 3 from 23 to 60 s; screen 4 at 60 s or on a failure.
  - Timing: screen 4 comes after the 3 retries (MD:1409), or at 60 s if that comes first.
  - 683 Danforth (compute null in 108 ms): lines to 23 s, then screen 5.

#### 4. The change, file by file, in build order (one lane; 267 then 317 in the same commits)
1. src/lib/parcels/lookup-flow.ts:79-90: `findOnly = parcelId === undefined`. The stored read and the compute are skipped when held or findOnly. Header note :5-6.
2. src/app/api/parcels/lookup/route.ts:
   - comments :13-19, :26-27;
   - O1-A2: parse the fast flag like semi (:78-84);
   - on the fast read, return the stored page if present; else, unless held, the checked view: buildTree({lifecycle:'loading', what_we_checked}) then viewOf on target mobile with no href. If O1-A2 is ruled, the fast read also skips the lines for an already-counted lot (a usageFor export, one read). The meter code is unchanged.
   - OUTSIDE FILES LINE: src/app/api/parcels/lookup/types.ts (the response field `checked`, the X-4 a field, and the flag) and src/lib/entitlements/index.ts:559 (export usageFor), both needed only under A2.
3. mobile/src/lib/schemas.ts:432-441: `checked` nullable and optional (the core's checked view shape).
4. mobile/src/hooks/useParcelLookup.ts:107-116:
   - the fast-read query (key ['parcel-checking', id], under A2);
   - O5: no refetch on mount when the cache holds a page.
5. mobile/src/components/surfaces/ReportBinding.tsx:
   - reportScreenState (:399-403) becomes total over (data, checked, isFetching, isError, elapsedMs, gaveUp). Its outputs: view | checking | ready | holding | error | miss. Data with no page while a fetch is running is checking or loading, never miss (finding 23).
   - checkedProps renders screens 1-5 from existing kinds only (View, Text, Button, ActivityIndicator); screen 3's spinner and words are centred.
   - backProps gains the address title. With no address there is no title node at all.
   - LifecycleState stays loading | miss | error. The ending is a separate field, so no new states.lifecycle.* key is invented.
   - SCREEN_CONTENT_KEYS gains back_to_search.text (and checks.label if O8 is visible).
6. mobile/src/components/surfaces/ReportPageHost.tsx:64-74:
   - the clock starts at mount;
   - the give-up timer at 60 s from mount, or never once a page is shown;
   - Reduce Motion: all lines at once, one announcement of summary;
   - no auto-open; no Skip.
   - A late page that lands after the give-up stays in the cache. Try again shows it at once without a new compute, otherwise it refetches.
7. mobile/app/(app)/parcel-tool/[parcelId].tsx:23-37: pass the fast read, isFetching, error and the cache skip. The wall stays the first branch when there is no view.
8. mobile/src/constants/reportPage.ts: the line, tick, end and centred-hold classes.
9. The 60 s give-up: per O7, either config.give_up_ms or a direct read of the existing slice value.
10. Content:
    - mobile_parcel_detail.content.json gains back_to_search.text (and checks.label per O8);
    - report-presentation.json is unchanged.
    - OUTSIDE FILES LINE: scripts/surfaces/emit-mobile-surfaces.mjs:120-127, only if O7 picks config.give_up_ms (the report slice writes config {} today).
11. Census first, then emit, then registry. OUTSIDE FILES LINE for each:
    1. scripts/surfaces/_schema/census/mobile-product.json, row mobile_parcel_detail (:6151): states :299-325 gain checking, ready, holding; dated notes; the evidence cites move (gate route.ts, states [parcelId].tsx).
    2. scripts/surfaces/_schema/census/contracts.json, row contract_parcels_lookup (:22081):
       - metering.why: a q hit sends no page; under A2 the fast read counts only a stored page it serves;
       - the field whitelist gains `checked`; evidence cites move.
    3. `node scripts/violations/generate-surface-registry.mjs --emit-descriptors`, which writes:
       - mobile_parcel_detail.descriptor.json;
       - contract_parcels_lookup.descriptor.json;
       - src/lib/surfaces/generated/surface-descriptor.d.ts and validate-descriptor.mjs (expected byte-unchanged; if not, add them).
       Never edit a descriptor by hand (surface-registry.infra.test.ts:277-281).
    4. emit-mobile-surfaces.mjs --write, which writes mobile/src/generated/surfaces/mobile_parcel_detail.json.
    5. report-page-capture.ts: MOBILE_LIFECYCLE_STATES (:78) gains checking, ready, holding, error_after, miss_after. It writes src/tests/fixtures/report-page/props/*.mobile.json (5 new; loading, miss and error move).
    6. generate-surface-registry.mjs default run, which writes docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md; its --check must be clean.
- Parity: the report detail is mobile only (identity.platforms ["mobile"]). There is no web/phone parity lock for its lifecycle; parity.golden.test.ts compares reading trees only. The pins that move are report-mobile.logic.test.ts:32 (the golden names), reportPage.behaviour.test.tsx:156 (the slice keys), reportScreens.golden.test.ts:285 (lifecycle refs) and report-checked.logic.test.ts (words; unchanged unless O8).
12. Specs and queue:
    - Spec 100 §3.2 note (the q path sends no page) and §4 note (the endings, 60 s, the skip rule).
    - Spec 126 §11a.7 note (the app render; RR-0491 bounds RR-0176; Skip not drawn; O8 if visible).
    - .cursor/MCFRONTEND-QUEUE.md: one follow-up row to MF-62 for both cards, the next free id at claim (MF-99 at this head, :5, unless 465 took it).

FILES (both cards):
- src/lib/parcels/lookup-flow.ts, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/lookup/types.ts, src/lib/entitlements/index.ts
- mobile/src/lib/schemas.ts, mobile/src/hooks/useParcelLookup.ts, mobile/src/components/surfaces/ReportBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/constants/reportPage.ts
- scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.content.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/census/contracts.json, scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json
- mobile/src/generated/surfaces/mobile_parcel_detail.json, src/tests/fixtures/report-page/props, scripts/surfaces/report-page-capture.ts, scripts/surfaces/emit-mobile-surfaces.mjs (O7), docs/reports/generated/127-surface-registry.md, docs/reports/generated/127-surface-review-queue.md
- src/tests/parcel-lookup-gate.infra.test.ts, src/tests/surfaces/report-mobile.logic.test.ts, src/tests/surfaces/report-failure.logic.test.ts (new)
- mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreens.golden.test.ts, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, mobile/__tests__/useParcelLookup.test.ts, mobile/__tests__/reportChecked.behaviour.test.tsx (new)
- docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, docs/specs/02-web-admin/126_maxbld_surface_standard.md, .cursor/MCFRONTEND-QUEUE.md

#### 5. Tests first (red, then green)
Both cards' acceptance lines are the process lines AC1-AC8. These tests serve AC2 (written into the plan) and AC6 (red first). Each is also tied to a scope item below.

Server, src/tests/parcel-lookup-gate.infra.test.ts:
- G1 "a q hit never runs the stored read or the compute": page null, meter not_produced, no insert (267 hand-off).
- G2 "compute once per opened lot": q then parcelId=P-45 with a stored miss. Expect computeCustomerPageResponse called once and 1 insert.
- G3 "meter counts unchanged" (it.each on parcelId): new lot counted 1; already counted 0; at limit 403 with 0; at limit with a counted lot 200 with 0. Each case's q call before it inserts 0.
- Rewrite :234, :245 and :369 (q-path counting) with a dated note that keeps their titles.
- G4 "683 Danforth": parcelId=5361889 with the compute mocked null. Expect 200, page null, meter not_produced (317, finding 31).
- G5 (A2): the fast flag returns the checked view and no compute. A stored page is returned and counted. A held lot gets no checked view. An already-counted lot gets checked null.

src/tests/surfaces/report-failure.logic.test.ts (new; a table over reportScreenState, total, 317 R2). Rows:
- page, then view;
- lines playing with no page, then checking;
- lines done with a page, then ready;
- lines done with no page and under 60 s, then holding;
- an error during the lines, then checking until the end, then error (RR-0490 3 b);
- 60 s passed, then error;
- a miss during the lines, then miss at the end;
- no checked view with a miss, then miss at once;
- a cached page, then view with no lines.

src/tests/surfaces/report-mobile.logic.test.ts: the golden names include the 5 new endings; the capture writes them byte for byte (317 R1).

mobile/__tests__/reportChecked.behaviour.test.tsx (new, fake timers):
- C1: verbs at delay_ms, facts at done_ms.
- C2: page at 5 s, no "View report" until 23000; no auto-open; no Skip.
- C3: no page at 30 s gives the centred spinner and "Loading the report…".
- C4: no page at 60000 ms gives "Could not load this report. Try again." with the lines kept.
- C5: a 500 at 8 s gives the failure only at 23000.
- C6: a miss at 0.1 s gives "No report for this lot yet." and "Back to search" at 23000; a press calls back.
- C7: a late page after the give-up, then Try again shows it with no fetch.
- C8: Reduce Motion gives all lines and one announcement.

mobile/__tests__/reportScreen.mount.behaviour.test.tsx:
- M1: a cached miss while refetching shows no miss text.
- M2: a cached page opens at once with no lines and no fetch (O5).
- M3: the address is the bar title; with no address there is no title node.

reportScreens.golden.test.ts: the miss refs are [states.lifecycle.miss, back_to_search.text]; components only from mapping.mobile.REPORT. reportPage.behaviour.test.tsx:156: the slice keys.

The mobile jest files are run by no hook. Run them by hand or in Mobile CI and keep the output.

#### 6. Limits, and how failure is caught
- Not done:
  - no change to the search box, index.tsx or lotMap.ts (465);
  - no change to the meter rule (343);
  - no change to the report page content;
  - no migration and no new seed row (see O7);
  - MAXBLD_WEB_LIVE stays false;
  - no web failure page, because the web report render is not built (task-285, task-287);
  - no scene picture.
- Risks, and how the build catches each:
  - A compute that ends after the give-up is still counted on the server. C7 keeps the counted report reachable with no second compute, and G3 shows no double count.
  - The at-limit wall now shows after the compute (G3).
  - A failing compute runs up to 4 times, per the ruled retries.
  - Census and descriptor drift is caught by --check and surface-registry.infra.test.ts:277.
  - Cite drift is caught by check-cites.
  - Missing paths are caught by the close check.

#### 7. Notes owed (backlog CLI only)
- task-267: PLAN-267-v2; the new title (the address replaces "Checking your lot"); the Files line above; a note on "however long" against the 60 s give-up.
- task-317: built in lane 267 (RR-0477, RR-0488); its Files line is folded into 267's.
- task-343: the seam in section 3 (a).
- task-465: the hand-off removes its O1 risk.
- doc-16 A-MF62 (35 s, "updating"): a dated note through `backlog doc edit` that it is superseded by RR-0176 and RR-0491.
- Spec dated notes and the queue row as in step 12.

#### 8. Open choices (not decided)
- O1, the source of the lines (L2-1, MD:1276):
  - A1: the lines arrive with the page, so the lines start after the compute. This breaks "always to the end" timing and the 23 s overlap.
  - A2: a fast parcelId read with one optional flag, the semi=answered precedent. It returns the stored page or the checked view and runs no compute. The flag and the response field `checked` (X-4 a, ruled) need his word under RR-0392.
  - Rec A2. The mock's timeline (lines from 0 s while the report builds) needs it.
- O5: no refetch-on-mount for a cached page (one compute per open), versus today's 60 s stale refetch. Rec no refetch.
- O7, the 60 s value:
  - (a) Read the existing registered 60 000 (maxbld_page_continue_wait_ms, via the semi slice). No database step; one value serves both waits; dated note.
  - (b) A new seed row and config.give_up_ms. That is a database step, so its own card by RR-0477.
  - (c) A typed number. Breaks Spec 128 Rule 3.
  - Rec (a), with (b) as a later card if he wants the two waits apart.
- O8, the "Checks for this lot" label:
  - visible as drawn: a new key checks.label, plus a Spec 126 note that RR-0491 replaces :869 for this one label;
  - or a screen-reader label only (the v8 aria-label, build.mjs:801).
  - Rec visible as drawn, flagged to him with the :869 conflict named.
- Settled since v1: O2, O3, O4, O6, O7-batch (task-317 is now in this lane).

What this plan assumes of 465 (final for round 1; lane BL-MCFIX465 is building now):
- A pick (Enter, a row tap, or a chip tap that submits) pushes /(app)/parcel-tool/<id> through parcelSearchRoute.
- No search code reads `page`.
- The web search mirrors the phone and the web report stays off.
- The four new semi keys in lotMap.ts, and WallBinding, are not touched here.
- On return the box clears (465's focus effect), so "Back to search" lands on an empty box.
- Files both cards touch:
  - census/mobile-product.json (different rows: 465 has :7154 and :7578, 267 has :6151);
  - the --emit-descriptors run and the default registry run, with 127-surface-registry.md and 127-surface-review-queue.md;
  - the emit-mobile-surfaces.mjs run (different slices);
  - Spec 100 and Spec 126 (separate dated notes);
  - the queue.
- 267 rebases on 465's tip and reruns every generator.

#### 9. UNVERIFIED
- Whether the checked view (viewOf with no href) passes the mobile Zod schema without a core change.
- Whether report_check_* and the citywide snapshot row exist on the test stack.
- Whether surface-descriptor.d.ts moves on the emit.
- Whether report-checked.logic.test.ts pins the states.checked key list.
- The platform request timeout.
- Nothing was run; this was read only.

## Implementation Notes
2026-11-19 1·B validation (R10, RR-0257, task-316): KEPT (dep task-266; LOAD.3 dropped, label dep-dropped is right): RR-0176 the animation keeps its length and the button waits for report AND See details. Elements G.2 G.3 G.4 (MF-62 row DONE, queue :467; follow-up row to MF-62 claimed by the build lane). The failure screen the plan text owes is task-317 LOAD.4. Panel and build pass owed.

Dated note 2026-11-19 (M-246, prior text kept; RR-0300 · task-267 · Backlog; operator, verbatim: "Those dependencies are not listed as operator tasks with incra 1b")

2026-11-19 (R13, RR-0300, task-339): this task waits on the OPERATOR task task-341 (the LOAD chain and the two 6c tasks); recommendation there, verified by review r1 of task-339. Status and dependencies unchanged.

Dated note 2026-11-19 (M-246, prior text kept; RR-0301 · task-267 · Backlog; operator, verbatim: "task 341 approved")

2026-11-19 (R16, task-347, RR-0300): What-we-checked wiring (gap Q9, D04) is ALREADY RULED, no OPERATOR task: operator verbatim 'x-4 a' (2026-11-11), X-4 (a): readWhatWeChecked is wired into GET /api/parcels/lookup as a nullable whatWeChecked (.cursor/MCFRONTEND-QUEUE.md:363); ONE-5 'y' (MORNING-DECISIONS.md:738) covered the bundle naming gap Q9 (a reading). The BL-W plan proposes this task as its carrier; today the title of this task does not name it and task-123's title keeps it conditional on Q9. Carrier choice goes to the orchestrator by dated note (loose end on task-343). OPERATOR task-348 (D1) also bears on this screen: before launch a phone tester sees the miss page, not the lot loading lines' report. Status unchanged.

2026-11-19 taken on the board at lane launch (lane BL-LOAD2, worktree /Users/brettpreston_macmini/Buildo-wt-load2, branch wf1/inc1b-load2), RR-0240

Dated note 2026-11-19 (lane BL-LOAD2, stage 1; prior text kept): the measured plan and impact map are in docs/reports/lanes/2026-11-19/BL-LOAD2/ (PLAN.md, IMPACT.md, TRIAGE.md, REPORT.md, checks.out, r1-*.txt). LOAD.2 at its smallest: the app shows the ruled sequence (the checked lines, ready line, button) for the set 23 s and shows the button only when the lookup has returned a page. BUILT today: a spinner and "Loading the report…" (mobile/src/components/surfaces/ReportBinding.tsx:369-380); the core, producer and web ReportView for the checked tree (MF-62 DONE). NOT built: the producer is wired to no route (no whatWeChecked in src/app/api/parcels/lookup/route.ts or mobile/src/lib/schemas.ts:429-438), the app has no render of it. It cannot be built whole now: (a) the lines never reach the app, the smallest missing piece is a fast read at the pick (D-1; no task carries it, loose end noted on task-343); (b) the picture behind the lines has no existing component (D-2). Six operator decisions drafted D-1 to D-6 (PLAN.md section 4), none decided. Seam with task-317 (LOAD.4): LOAD.2 owns lifecycle loading and the give-up timer, LOAD.4 renders lifecycle error. Measured: 9 --check scripts all exit 0 on head 2e127dffa. Lens set: compliance, ux, error-paths, code-review, 30 findings, 21 kept, 4 rejected, 3 agreed rejects, 4 duplicates (TRIAGE.md). stage 1 plan done; stage 2 build waits on the orchestrator. Files: src/app/api/parcels/lookup/route.ts, mobile/src/lib/schemas.ts, mobile/src/hooks/useParcelLookup.ts, mobile/src/components/surfaces/ReportBinding.tsx, mobile/src/components/surfaces/ReportPageHost.tsx, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/generated/surfaces/mobile_parcel_detail.json, scripts/surfaces/_schema/report-presentation.json, scripts/surfaces/_schema/census/contracts.json, mobile/__tests__/reportScreen.mount.behaviour.test.tsx, mobile/__tests__/reportPage.behaviour.test.tsx, mobile/__tests__/reportScreens.golden.test.ts, mobile/__tests__/reportChecked.behaviour.test.tsx, src/tests/fixtures/report-page/props/loading.mobile.json, docs/specs/02-web-admin/126_maxbld_surface_standard.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, .cursor/MCFRONTEND-QUEUE.md

Dated note 2026-11-19 (lane BL-LOAD2; prior text kept): seam answers for LOAD.4 folded into PLAN.md section 1.5a (S1 order, S2 address source before the lookup answers, S3 no still asset in the repo, S4 the host planned for either LD-3 answer, D-5 and LD-2 are one question). Stage 2 file list gains tests T14, T15 and T12a/T12b. stage 1 plan done; stage 2 build waits on the orchestrator.

HELD (operator 2026-11-20 "4. Hold the three unbuilt pages until the pilot result"): build as rows of the page table once the PAGE.TABLE pilot passes.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder, 2026-11-20 (the lane verifies each cited fact before building): these are lifecycle states of the report screen: rows in the existing report lifecycle data (report-presentation.json) drawn by the existing ReportBinding; no new builder function and no move into the page-table builder (approved item 3 "Leave the reports as components"). Still required for 1·B (RR-0176 MD:785; RR-0179 MD:789). After the pilot folds; 317 after 267 stage 2 and LD-1, 2, 3, 5.

Dated note 2026-11-20 (M-246, prior text kept; RR-0341 · task-267 · Backlog; operator, verbatim: "approved")

McFixV2 addition 2026-11-25 (operator phone walk; rulings RR-0483, RR-0485, RR-0486 in ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2523, :2533, :2538). Not yet planned. (a) Operator: "Task 267 - why does it say Checking Your Lot - it may not be the users lot they are checking - just a note to clarify": the title wording is to be clarified. (b) Operator, on whether the animation always runs: "5. Always - except for a tracked/stored lot or one that has previously been opened - we have already discussed this". (c) From the walk (findings 22, 23, 30 and measured M1): the search box today waits 11 to 23 s because the lookup computes the report before answering, the same lot is computed 2 to 4 times, and a no-report screen shows during the wait. This card takes the hand-off: the search only finds the lot, the calculation starts on the pick and runs once behind the loading screen (task-266 built the start; task-465 is the search box).

2026-11-25: plan PLAN-267-v1 by Cairn-Plan-267 set on the card (hand-back saved at ~/Buildo-scratch/lanes-20261125/mcfixv2-267/PLAN.md). Not yet reviewed; built after task-465 lands.

2026-11-25 (RR-0491, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2563, operator verbatim on that line): the loading endings mock is APPROVED with one change made (the still-building spinner and words centred). Approved mock: ~/Buildo-scratch/lanes-20261125/mcfixv2-267/MOCK-LOADING-ENDINGS-approved.html sha256 f8e9c7da68f9 (https://claude.ai/artifact/575VKBneBnsMszXVvRkTVm version 2). As drawn: lines play to the end; View report button only when the lines are done and the report is in; still building keeps the lines with a centred spinner and Loading the report…; failure (build failed or 60 seconds from the pick) keeps the lines and shows the built sentence with Try again; no report keeps the lines and shows No report for this lot yet. with Back to search (new words). Orchestrator reading: Approved answers the 60 seconds, lines-stay and play-to-the-end points as drawn.

2026-11-25: plan PLAN-267-v2 by Cairn-Plan-267 replaces v1 on the card (saved at ~/Buildo-scratch/lanes-20261125/mcfixv2-267/PLAN-v2.md); it builds task-317 in the same lane (RR-0477, RR-0488, RR-0490, RR-0491). Not yet reviewed. Built after task-465 lands.

## References
- docs/reports/plan-import/raw/2026-11-19/sequence.json#S/LOAD.2
- ~/Buildo-scratch/mcfrontend/MF-62/followup-1111/plan.md#L69 sha256=483316abe7e1
- ~/Buildo-scratch/mcfrontend/MF-62/plan.md#L44 sha256=e682e4a9d59c
- /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/inc-briefs/BRIEFS.md
- /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/holistic-audit/AUDIT.md
- /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/readiness/READINESS.md
- /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md
- /Users/brettpreston_macmini/Buildo-scratch/lanes-20261117/search-1b-adj/REPORT.md
- .cursor/MCFRONTEND-QUEUE.md#L467
- docs/reports/lanes/2026-11-19/BL-LOAD2/REPORT.md
- docs/reports/lanes/2026-11-19/BL-LOAD2/PLAN.md
- compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
- compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
- compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
- compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

## Documents
- backlog/docs/increments/doc-2 - Increment-S-requirements.md

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
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
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
- RR-0480 phone test: onboarding flag for one test user on the local test database
- RR-0481 phone test: report switch on locally, onboarding flag for the at-limit test user
- RR-0482 phone walk findings: sort, rule, batch into larger cards; fold 454 and seed the test stack — "Agreed. Remember our new policy on tasks - ie larger tasks and using existing components as well." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2518)
- RR-0483 search box the Google way, Enter wired, a card for the report counter — "your typed search does not execute until you press enter or select an address" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2523)
- RR-0484 dev GO for the six task-454 settings rows
- RR-0485 phone walk rulings: semi inside the search card, range check 1.C, no onboarding question, no report without pricing, loading animation always, Enter opens the lot — "We should not send a report without pricing - the report needs to be complete." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2533)
- RR-0486 McFixV2: phone walk fixes go into five existing cards, relabelled; go given — "relablet these fixes as McFixV2 - and remove all other labels - 5 tasks in total." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2538)
- RR-0487 task-465 search box mock approved
- RR-0154 Work pulling
- RR-0488 dead label only for absorbed cards; pushed cards move on to done; phone walk a standing proof step; search proof split — "But tasks that finish and are pushed then move through as normal as done." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2547)
- RR-0489 search proof reduced to four steps: phone walk, one database read, pointer to passing tests, known gaps list
- RR-0490 load failure: keep the built sentence; animation finishes before a failure shows; no-report screen with the address; give-up time pending a mock — "3 b - let the animation finish and then say the report failed (same screen as 2a for a failure after 60 seconds)  4 B - no report screen" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2559)
- RR-0491 loading screen endings mock approved, loading line centred — "Teh mock looks great! 1 Change (1) Still building - Loading the report shuld be centered horizontally as opposed to left justified. Approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2563)
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
- RR-0176 Loading screen — "yes that is correct" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785)
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page — "2. Add it as a task using the othr mini pages as a template" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789)
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
- RR-0278 Report meter counts on report production only — "I should only be charged a report if I find the address and lot I'm looking for and a report is produced" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1082)
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks — "Those dependencies are not listed as operator tasks with incra 1b" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1155)
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4 — "task 341 approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1160)
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

### backlog/docs/increments/doc-2 - Increment-S-requirements.md lines 1-92 of 176 (cut at 12 KB)
~~~
---
id: doc-2
title: Increment S requirements
type: specification
created_date: '2026-11-19T04:56:00Z'
updated_date: '2026-11-24T20:58:00Z'
---
# Increment S requirements

Source: elements-by-inc.json, built.json (as of origin 154e7b13f), matrix-verified.json, current.json of the snapshot docs/reports/plan-import/raw/2026-11-19.

## Built state
The search pages are built on mobile (search page, choose-your-lot map page, semi question page) and in part on web (the web search page is built but sends no lookup while the live switch is false). The lookup route, resolver, meter and the report hand-off contract are on origin. Not built: direction and unit parsing (plan 1.4), the reports-left line, the candidate locality line, the clear button, the intersection map, web choose-your-parcel, the web footer, building footprints and street names on the map, the help link on the map page. All of it is the old dark look (zinc and #0e0e10), not Daylight.
counts: {"BUILT":42,"BUILT-NO-DATA":7,"NOT BUILT":16}

- F-SEARCH-MOBILE Mobile parcel search page: SEARCH binding (props), search screen, recent searches, match logic: ON ORIGIN (origin/wf1/mb-rulings); queue: phone check and device run OWED, UNVERIFIED on device
- F-SEARCH-WEB Web search page (W4): the one web SEARCH binding, SearchPageClient mount, live switch: PARTLY: page built, controls disabled and no lookup request while MAXBLD_WEB_LIVE is false
- F-LOTMAP Choose-your-lot map page (S-071): LIST binding with map projection, lot cards, states: ON ORIGIN (origin/wf1/mb-rulings); queue Status DONE
- F-LOOKUP-RESOLVER Lookup resolver: address parse, exact match on parcels normalized keys, typeahead on address_points, classification: ON ORIGIN (origin/wf1/mb-rulings)
- F-SHELL Product shelf and parcel-tool screens: ParcelShelf (Lookup, Tracked Lots, Account), tracked.tsx and account.tsx (example rows): PARTLY: shelf built; tracked and account are stubs
- F-LANDING MaxBLD web landing (web_landing) with the footer legal line, and the MaxBLD post-login target: ON ORIGIN (origin/wf1/mb-rulings)
- F-ADMIN-LOOKUP Admin Parcel Cost Model Tool (admin search over the same resolver) and SearchPermitsSheet (lead-gen permit search): ON ORIGIN (origin/wf1/mb-rulings)

## Scenario
Search first: the current search pages = latest rendering small-pages-v8 ("MaxBLD Small Pages" https://claude.ai/artifact/8KLUsAtd4JN6r2j8CxZSU7, 2026-11-12) + later rulings; built status from the 2026-11-17 sweep (search-delta/CURRENT-SEARCH.md, 176 quotes PASS)

## Elements
| id | element | where | status | deliverers | built |
|---|---|---|---|---|---|
| A.1 | A Search page · Brand block: MaxBLD wordmark with the tagline Lot Intelligence, centred; hidden h1 Search a Toronto lot (no Lookup title) | details | AVAILABLE | GAP.13 | BUILT |
| A.2 | A Search page · Search box: one pill, placeholder Enter lot address, search icon | main | AVAILABLE |  | BUILT |
| A.3 | A Search page · Typeahead resolution of the typed text (street-prefix, up to 10) | main | AVAILABLE |  | BUILT |
| A.4 | A Search page · Typed street direction (E/W/N/S) kept in the match | details | NOT-BUILT (parser) | 1.4 | NOT BUILT |
| A.5 | A Search page · Unit number typed after the address | details | NOT-BUILT | 1.4 | NOT BUILT |
| A.6 | A Search page · Reports-left line under the box: 6 of 10 reports left until 9 Dec 2026 | details | NOT-BOUND · MISSED by the sweep | SRCH.A6 LS.12 LS.3 | NOT BUILT |
| A.7 | A Search page · Recent searches: up to 3 chips under the box (label Recent), each routes to /lookup?q= | details | AVAILABLE |  | BUILT |
| A.8 | A Search page · Searching state: query in the box, the word Searching, clear button | details | AVAILABLE |  | BUILT |
| A.9 | A Search page · Outside Toronto state: Lots are only available in Toronto. | details | AVAILABLE |  | BUILT |
| A.10 | A Search page · Legal line: This is an estimate, not 100% accurate. Not legal advice. Confirm with a lot survey and the City. | details | AVAILABLE | LS.6 | BUILT |
| A.11 | A Search page · Clear (x) button inside the box | details | NOT TRACED · MISSED by the sweep | GAP.13 | NOT BUILT |
| A.12 | A Search page · Bottom tab bar: Lookup, Tracked Lots, Account (app) | details | AVAILABLE · MISSED by the sweep | MF-49 | BUILT |
| A.13 | A Search page · In-bar Account button (MF-35 builds it amber) | details | AVAILABLE · REMOVED by the design |  | BUILT |
| B.1 | B Address confusion · Candidate list (text_candidates): radio cards, the differing word amber, nothing pre-checked, Select disabled until a pick | main | AVAILABLE |  | BUILT |
| B.2 | B Address confusion · Select button after the pick (Select, Open the selected lot) | main | AVAILABLE |  | BUILT |
| B.3 | B Address confusion · Candidate row area line (locality, e.g. Downtown Toronto) | details | NOT-BOUND · REMOVED by the design |  | NOT BUILT |
| B.4 | B Address confusion · Needs-more-info notice: That looks like an intersection. Type a house number to see the lots. | main | AVAILABLE |  | BUILT |
| B.5 | B Address confusion · Needs-more-info notice: Many lots at this address. This address has many lots. Add a unit number or pick a nearby address. | main | AVAILABLE |  | BUILT |
| B.6 | B Address confusion · Gentle error: No lot linked yet. We found {address}, but the City data does not link it to a lot yet. Try a nearby address or report it. | main | AVAILABLE |  | BUILT |
| B.7 | B Address confusion · Link: Get help with an address (to /help?topic=wrong-lot) under every notice; report it inside the no-lot message | details | SERVED-NOT-POPULATED | SRCH.C12 LS.12 LS.6 | BUILT-NO-DATA |
| B.8 | B Address confusion · Faint tappable neighbour outlines on the unlinked state | details | AVAILABLE · REMOVED by the design |  | BUILT |
| B.9 | B Address confusion · No-match state: No parcel found for that address. | details | AVAILABLE |  | BUILT |
| B.10 | B Address confusion · Intersection on the map (corner lots at the centreline node) | details | NOT-BUILT · REMOVED by the design | LS.11 | NOT BUILT |
| C.1 | C Lot confusion (lot map) · Heading: This address covers 2 lots. Which one do you mean? | main | NOT TRACED · MISSED by the sweep | GAP.13 | NOT BUILT |
| C.2 | C Lot confusion (lot map) · Search pill on top (clear returns to search); hidden h1 Choose your lot | details | NOT TRACED · MISSED by the sweep | MF-53 | BUILT |
| C.3 | C Lot confusion (lot map) · Map: each matched lot outlined (amber), neighbours in zinc | main | AVAILABLE |  | BUILT |
| C.4 | C Lot confusion (lot map) · Lettered lot markers (A, B) at the lot centroid; chosen lot filled amber | main | AVAILABLE |  | BUILT |
| C.5 | C Lot confusion (lot map) · Building footprint on each lot (or none), drawn on the map | main | NOT TRACED · MISSED by the sweep | GAP.13 | NOT BUILT |
| C.6 | C Lot confusion (lot map) · Address pin and the street name drawn on the road (Dunmore Lane) | details | AVAILABLE · MISSED by the sweep | GAP.13 | BUILT |
| C.7 | C Lot confusion (lot map) · Lot card line: Lot A · has the house · faces Dunmore Lane; Lot B · no building · at the back | main | UNDESIGNED-DATA · MISSED by the sweep | GAP.13 | NOT BUILT |
| C.8 | C Lot confusion (lot map) · Lot card size line: 1,614 sq ft · 150 m² | main | AVAILABLE |  | BUILT |
| C.9 | C Lot confusion (lot map) · Lot card frontage and zoning string (7.6m • CR 2.5 style) | details | AVAILABLE · REMOVED by the design |  | BUILT |
| C.10 | C Lot confusion (lot map) · Selection shared by map tap and card (radiogroup Choose a lot) | main | NOT TRACED · MISSED by the sweep | GAP.13 | BUILT |
| C.11 | C Lot confusion (lot map) · Button: Choose a lot (disabled) then Continue with Lot A; hint Pick a lot on the map or in the list. | main | AVAILABLE |  | BUILT |
| C.12 | C Lot confusion (lot map) · Link: Not sure which lot? Get help with an address | details | NOT-BOUND | SRCH.C12 LS.12 LS.6 | NOT BUILT |
| C.13 | C Lot confusion (lot map) · Loading, error, rate-limit, entitlement, schema-drift states of the map page | details | AVAILABLE |  | BUILT |
| C.14 | C Lot confusion (lot map) · Routing: one printed address over two or more lots opens this page (shown only then) | main | AVAILABLE |  | BUILT |
| D.1 | D Semi question page · Page shown only when the lot is unsure (before the report) | main | AVAILABLE |  | BUILT |
| D.2 | D Semi question page · Lot form on the lookup hit (detected, basis, unsure) | details | AVAILABLE |  | BUILT |
| D.3 | D Semi question page · Question: Is this house one half of a semi-detached pair? | main | AVAILABLE |  | BUILT |
| D.4 | D Semi question page · Three answers: Yes, it is one half of a semi; No, it is detached; Not sure | main | AVAILABLE |  | BUILT |
| D.5 | D Semi question page · Continue button (Choose an answer when none picked; Open the report with this answer) | main | AVAILABLE |  | BUILT |
| D.6 | D Semi question page · Back to search link | details | AVAILABLE |  | BUILT |
| D.7 | D Semi question page · Question-page states: loading, error, rate limit, entitlement, schema drift | details | AVAILABLE |  | BUILT |
| D.8 | D Semi question page · Owner answer stored (a reopened lot does not ask again) | main | BOUND-NOT-STORED | GAP.12 | BUILT-NO-DATA |
| D.9 | D Semi question page · Input: distance from your wall to the shared line, with an assumed default and an assumption line | main | NOT-BUILT | SRCH.SEMI MF-89 7.25 GAP.12 | NOT BUILT |
| D.10 | D Semi question page · Semi override applied in the report | main | NOT-BUILT | SRCH.SEMI 7.25 | NOT BUILT |
| D.11 | D Semi question page · Evidence columns linked_parcel_count, best_shared_len_m | details | STORED-NOT-SERVED |  | BUILT-NO-DATA |
| E.1 | E Web search pages · W4 web search page: the same parts under the web top bar (Lookup, Tracked Lots, Account) | main | SERVED-NOT-POPULATED | LS.12 1.3 | BUILT-NO-DATA |
| E.2 | E Web search pages · Web footer: legal line, Terms of Service, Privacy Policy, Help and Support, copyright | details | AVAILABLE · MISSED by the sweep | MF-44 MF-46 | NOT BUILT |
| E.3 | E Web search pages · W5 choose your parcel on the web, address list (text_candidates) | main | SERVED-NOT-POPULATED | LS.12 | NOT BUILT |
| E.4 | E Web search pages · W5 on the web for several lots, no lot linked and intersection (map) | main | NOT-BUILT | LS.11 | NOT BUILT |
| E.5 | E Web search pages · W6 web report route /parcel-tool/{lot} | main | NOT-BUILT | LS.12 1.3 MB-44 | BUILT-NO-DATA |
| E.6 | E Web search pages · Recent-search chips on the web frame | details | NOT TRACED · MISSED by the sweep | LS.11 | NOT BUILT |
| F.1 | F Landing (search entry and sample) · Hero call to action: Start free trial (to /signup); no search box on the landing page | main | NOT-BUILT | MF-76 | BUILT |
| F.2 | F Landing (search entry and sample) · How it works step 1: Enter a Toronto address (Just the street address), a search-pill picture with a sample address | details | NOT TRACED · MISSED by the sweep | MF-76 | BUILT |
| F.3 | F Landing (search entry and sample) · Sample frame: the processing demo ends in the sample report inside the frame; no View report button, nothing navigates | main | NOT TRACED · MISSED by the sweep | LS.7 | BUILT |
| F.4 | F Landing (search entry and sample) · Landing legal line | details | AVAILABLE | LS.6 | BUILT |
| F.5 | F Landing (search entry and sample) · After login the user lands on the search page (never the dashboard) | details | AVAILABLE |  | BUILT |
| G.1 | G Hand-off to the report · Unique match goes straight to the report (no extra page) | main | AVAILABLE |  | BUILT |
| G.2 | G Hand-off to the report · Processing screen after the lot is known: address in the bar, lot outline draws, each check resolves into its ruled fact (What we checked) | main | NOT TRACED · MISSED by the sweep | 1.3 MF-62 | BUILT-NO-DATA |
| G.3 | G Hand-off to the report · Ready line: The Building Possibilities Report for {address} is ready., then the report opens (app by itself; web View report button) | main | NOT TRACED · MISSED by the sweep | MF-62 | BUILT |
| G.4 | G Hand-off to the report · Skip control during the animation | details | NOT TRACED · MISSED by the sweep | MF-62 | BUILT |
~~~
(read the rest at backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0341 Loading screen gives up after 60 seconds (names task-267, RR-0341) — "approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1610)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0477 phone test now; batching rule adopted (names RR-0477) — "batch items that touch the same files or the same kind of file and need no database step. Keep anything with a database step or its own operator question on its own card." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2496)
- RR-0482 phone walk findings: sort, rule, batch into larger cards; fold 454 and seed the test stack (names RR-0482) — "Agreed. Remember our new policy on tasks - ie larger tasks and using existing components as well." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2518)
- RR-0483 search box the Google way, Enter wired, a card for the report counter (names RR-0483) — "your typed search does not execute until you press enter or select an address" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2523)
- RR-0485 phone walk rulings: semi inside the search card, range check 1.C, no onboarding question, no report without pricing, loading animation always, Enter opens the lot (names RR-0485) — "We should not send a report without pricing - the report needs to be complete." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2533)
- RR-0486 McFixV2: phone walk fixes go into five existing cards, relabelled; go given (names RR-0486) — "relablet these fixes as McFixV2 - and remove all other labels - 5 tasks in total." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2538)
- RR-0488 dead label only for absorbed cards; pushed cards move on to done; phone walk a standing proof step; search proof split (names RR-0488) — "But tasks that finish and are pushed then move through as normal as done." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2547)
- RR-0490 load failure: keep the built sentence; animation finishes before a failure shows; no-report screen with the address; give-up time pending a mock (names RR-0490) — "3 b - let the animation finish and then say the report failed (same screen as 2a for a failure after 60 seconds)  4 B - no report screen" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2559)
- RR-0491 loading screen endings mock approved, loading line centred (names RR-0491) — "Teh mock looks great! 1 Change (1) Still building - Loading the report shuld be centered horizontally as opposed to left justified. Approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2563)
- RR-0176 Loading screen (names RR-0176) — "yes that is correct" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785)
- RR-0179 Load-failure page (names RR-0179) — "2. Add it as a task using the othr mini pages as a template" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789)
- RR-0278 Report meter counts on report production only (names RR-0278) — "I should only be charged a report if I find the address and lot I'm looking for and a report is produced" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1082)
- RR-0300 1·B blockers as OPERATOR tasks (names task-267, RR-0300) — "Those dependencies are not listed as operator tasks with incra 1b" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1155)
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4 (names task-267, RR-0301) — "task 341 approved" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1160)

## Prior reviews and lane reports
### task-267 (this task)
- docs/reports/lanes/2026-11-19/BL-LOAD2/REPORT.md (lane report naming task-267)
- docs/reports/lanes/2026-11-19/BL-LOAD4/REPORT.md (lane report naming task-267)
- docs/reports/lanes/2026-11-19/BL-R10/REPORT.md (lane report naming task-267)
- docs/reports/lanes/2026-11-19/BL-R16/REPORT.md (lane report naming task-267)
- docs/reports/lanes/2026-11-19/BL-W/REPORT.md (lane report naming task-267)
- docs/reports/lanes/2026-11-20/BL-STN1/REPORT.md (lane report naming task-267)
- docs/reports/lanes/2026-11-21/BL-GATE375/REPORT.md (lane report naming task-267)
- docs/reports/lanes/2026-11-22/BL-ENG438/REPORT.md (lane report naming task-267)
### task-266 (dependency)
- docs/reports/lanes/2026-11-19/BL-LOAD1/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-LOAD1B/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-R10/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-R11/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-R12/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-R13/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-R16/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-TRIAGE/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-W/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-19/BL-W2/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-20/BL-COMPLY3/REPORT.md (lane report naming task-266)
- docs/reports/lanes/2026-11-20/BL-STN1/REPORT.md (lane report naming task-266)

## Dependencies
- task-266 LOAD.1 Start the one-lot report calculation the moment the user picks an address on... · status: BUILT
  final summary: LOAD.1 built behind the existing web live switch only (dark code at landing, as W is; D-1 task-348 not ruled). Commits 7134366c2 (prereg-MB-44-2 alone, round 198) and b5d77c14b (code and tests; hook: 19 test files, 485 tests passed, GATE OK); report commit follows. Tests C1 to C9, T7 and T10 re-pinned, red first (red.out: typecheck refusal). Output review: lenses compliance, code-review, error-paths, security (TRIAGE.md). AC4 (plan lens set) and AC5 (separate grounder) NOT met and left unchecked: stage 1 ran one generic round; this lane grounded the output round itself. Deviations flagged: readLotFacts extraction, src SQL ledger closed set 29 to 30 (needs operator review), T10 two importers, no rebase onto wf2/board (denied). Launch preconditions on task-343.
