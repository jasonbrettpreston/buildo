# Seat: integration: task-313 plan (PLAN-313-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board branch wf2/board, head bb735a4ad. The plan cites 4b0cf7ab1. `git diff --stat 4b0cf7ab1 HEAD -- mobile src/lib src/app/api/parcels scripts/surfaces src/tests` printed nothing, so the plan's citations are not stale. I read the whole card, docs/reports/reviews/task-313/FINDINGS-PLAN.md (headers only) and MD:2496, 2518, 2533, 2583, 2598, 2608. I also read these:
- bindings.json
- static-page.schema.json
- surface.schema.json:1995-2060
- surface-conformance.logic.test.ts
- surface-registry.infra.test.ts
- parcel-tool-fence.infra.test.ts
- scope-fence, nav-tab-switch and nav-by-route tests
- subscriptionGate, routerTelemetry, routerHygiene, spec99.mandates, schemas, animation and offline tests
- `(app)/_layout.tsx`, `_layout.tsx`, decideAuthGateRoute.ts, appShell.ts, parcel-tool/_layout.tsx and account.tsx
- get-user-context.ts, the three parcel routes, tool-gate.ts and entitlements/index.ts
- task-465 commit 0aa1b011e (`git show` in ~/Buildo-wt-mcfix465) and the Files lines of 267, 317 and 465.

Checked and clean:
- UNVERIFIED "mount file under mobile/src/components/parcel" is settled. C-2/C-3 have no location rule (surface-conformance.logic.test.ts:104-125, :186-188). The mount may import only framework, `mount_internal` (`@/lib/`, `@/hooks/`, `@/components/surfaces/`, `@/store/`) or a binding module, and not `react-native`. MaxbldAppGate as planned meets that. The ownership problem is in#1.
- UNVERIFIED "rows can draw the Opening page" is settled. `screen_text` is `role: const "header"`, so a second header row needs no new role. `screen_status`, `screen_notice` (tone, `icon` AlertTriangle, parts title/text/small) and `screen_button` (`action` enum back/retry/push/select, retry allowed) cover every row in M6. `binding` must match `^mobile/src/components/surfaces/[A-Za-z0-9]+\.tsx$`, which OpeningBinding.tsx does. The plan's F9a is right: there is no footer kind.
- UNVERIFIED "state names loading/offline/error" is settled. All three are in the closed `oneOf` at surface.schema.json:1999-2055 ("Waiting on the first response.", "No network; the cached projection or the offline state.", "An unrecoverable failure with a declared UI.").
- UNVERIFIED "subscriptionGate.test.ts and routerTelemetry.test.ts survive" is settled for the split as described.
  - Every regex is anchored on comment text or call text inside the body that stays: "Loading guard:", "Deletion-confirmed accounts" and "Sign-out fast path for cancelled_pending_deletion".
  - The count of `if (...isFetching...)` stays at 1, because the new gate is in another file.
  - No test matches the name `AppLayout` as a declaration.
  - spec99.mandates.lint.test.ts:174-194 still finds track(...) in both layout files.
- parcel-tool-fence.infra.test.ts stays green on the split. `<SubscriptionLoadingGuard` and `<PaywallMount` still precede `<Tabs` inside LeadAppLayout.
- The fence also keeps `name="parcel-tool"`, which MaxbldAppGate does not remove.
- I checked every file:line the plan cites. These match the plan's text:
  - `_layout.tsx:98`
  - `(app)/_layout.tsx:239-241` and `:278`
  - decideAuthGateRoute `:125-144`
  - user-profile `route.ts:51` and `:72`
  - expiration.ts `:52-63`
  - get-user-context `:100-106` and `:135-142`
  - lookup `:65`, entitlement `:33`, lot-size `:41`
  - parcelSearchMatch.ts `:253`, useParcelLookup `:168-177`
  - `featureFlags.ts:34`, `maxbld-web.ts:19`
  - sign-in `:354`, `:429`, `:576-579`
  - nav-by-route `:313-318` and `:350`
  - app.json `:11-15`
- getCurrentUserContext callers on the parcel routes use only `ctx.uid` (lot-size `:45`, `:77`, `:85`, `:96`; entitlement `:45`, `:52`; lookup `:96`, `:119`). The overload `{uid, subscription_status}` therefore type-checks for the three routes. The other seven callers are lead routes and stay on the default path.
- The Files line has 13 non-resolving paths. All are new files the plan creates (MaxbldAppGate, OpeningBinding, the opening descriptor, content, slice, capture script, goldens, situations, fixture dir, and four new tests). No existing path is mistyped. `mobile/src/lib/appShell.ts` does resolve, which is in#2.
- The wall-pattern fixture and golden paths exist (`scripts/surfaces/wall-golden-capture.ts`, `mobile/__tests__/wallScreens.golden.test.ts`, `src/tests/fixtures/surfaces/mobile_parcel_wall/`). The `(app)` route files T4 expects exist: index, map, flight-board, settings, [lead], [flight-job].
- No mobile/app/index.tsx exists, so "/" resolves to (app)/index. The plan's `redirect` arm is what stops the lead feed mounting at launch.

## in#1 HIGH: MaxbldAppGate.tsx and OpeningBinding.tsx have no named owner, and a pinned test on the unowned-component list is not on the Files line
Plan: section 4 M5 "NEW mobile/src/components/parcel/MaxbldAppGate.tsx (mount file)" and M6 "a census entry"; the Files line has no src/tests/surface-registry.infra.test.ts.
Evidence: src/tests/surface-registry.infra.test.ts:213 `expect(allComponentFiles().filter((f) => !owner.has(f))).toEqual([` followed by exactly 11 named files. Lines 198-206 (`it.fails`) and :231 add that every component file under `mobile/src/components` is owned by a census row's `owns.components`. Lines 150-160 add that no file is claimed twice. Today MaxbldAppGate would be an unowned file outside the 11, which turns the pin red. The wall had no such file because its mounts are route files under mobile/app (bindings.json mounts). ParcelShelf is owned this way at shell_parcel_tool_stack.descriptor.json:41. The generated 127 registry also renders section 5 "Unowned components" (:230-238).
Fix: M5/M6 say the new opening census row lists MaxbldAppGate.tsx in `identity.owns.components` (OpeningBinding.tsx is owned through binding_mobile_list's module entry, as WallBinding is). Add src/tests/surface-registry.infra.test.ts to the re-run list. Alternatively mount from a route file under mobile/app like the wall does, which avoids the question.

## in#2 MED: mobile/src/lib/appShell.ts is called "new" but already exists, with callers and anchors
Plan: M1 "mobile/src/lib/appShell.ts (a leaf module), new".
Evidence: appShell.ts:29 `export function shouldHideAppTabBar(focusedRouteName: string | undefined)`. It is imported by `(app)/_layout.tsx`, parcel-tool/_layout.tsx, ParcelShelf.tsx and mobile/__tests__/parcelSearchMatch.test.ts:34. `appShell.ts:29` is cited as an anchor in census/mobile-product.json (lines 13871, 14567, 14650), shell_parcel_tool_stack.descriptor.json:170 and :253, and shell_app_tabs.descriptor.json:398. The header says "ZERO side-effect imports".
Fix: reword M1 to "add to the existing appShell.ts, below shouldHideAppTabBar, which stays at line 29". Add parcelSearchMatch.test.ts to the re-run list.

## in#3 MED: the shared-file list against task-465 omits three test files and the same numeric pins move in both
Plan: "ORDER AND SHARED FILES ... Shared with task-465: census/mobile-product.json, bindings.json, nav-by-route.logic.test.ts, Spec 99, Spec 100."
Evidence: commit 0aa1b011e (465, about to land) edits src/tests/surfaces/surface-conformance.logic.test.ts, surface-validate.logic.test.ts and search-reports-left.logic.test.ts as well. It moves `S-screen ok (18 surfaces, 103 goldens)` to `105 goldens` and `S-sbind ok (18 surfaces, 444 strings)` to `442 strings`. It also edits `bindings.json` ($comment and non_display_keys). T9 of 313 moves the same two sentences ("goldens +3"). 267's Files line holds consumer-parcel-lookup.infra.test.ts and parcel-lookup-gate.infra.test.ts. 313 pins the call text in the first (T2) and re-runs the second. Both are shared with 267, and parcel-lookup-gate is missing from the plan's 267 share (it names only consumer-parcel-lookup).
Fix: add surface-conformance.logic.test.ts, surface-validate.logic.test.ts, search-reports-left.logic.test.ts (465) and parcel-lookup-gate.infra.test.ts (267) to the shared list. Say T9's numbers are recomputed on top of 465's 105 goldens and 442 strings, not written from the current tree.

## in#4 MED: T9's list of moved pins is incomplete
Plan: T9 "converted 18 -> 19, in scope +1, goldens +3".
Evidence: three pins that move are not named.
- surface-conformance.logic.test.ts:398 `expect([B.modules.length, B.promoted_entries.length, B.mounts.length]).toEqual([15, 8, 27])`. OpeningBinding adds a module and the new mount adds a mount, so it becomes `[16, 8, 28]`.
- `S-sbind ok (N strings)`: the new content file adds a string for each content key (wordmark, tagline, connecting, notice title, notice text, button label).
- surface-validate's `S-golden ok (18 states x 4; owed 13 states / 52 files)` changes with 3 new states.
Fix: add these three to T9 so the red-first step names the real failing assertions.

## in#5 LOW: shell_app_root.descriptor.json records the AuthGate and is not on the Files line
Plan: M2/M3 and section 7 "Spec 99 §5.1-5.3: the MaxBLD arm".
Evidence: scripts/surfaces/platform_shared/F14/surfaces/shell_app_root.descriptor.json:71 `"Its routing decision is driven entirely by GET /api/user-profile (plus the Supabase session)`. M3 turns that read off for the MaxBLD app. The descriptor has about 24 line anchors into `_layout.tsx` and decideAuthGateRoute.ts.
Fix: add shell_app_root.descriptor.json to the Files line, or note that its `why` is left as the lead-app statement.

## in#6 LOW: "Re-run, expected unchanged" misses four existing tests that read the two layout files
Plan: T9 tail lists subscriptionGate, routerTelemetry, spec99.mandates, phoneGate, useAuth:623, parcel-routes.security and parcel-lookup-gate.
Evidence: mobile/__tests__/routerHygiene.lint.test.ts:27-28 (ROUTER_EFFECT_FILES = both layouts), animation.test.ts:61 (reads `(app)/_layout.tsx`), offline.test.ts:278 and schemas.test.ts:270 (read `app/_layout.tsx`; schemas.test.ts:278-300 pins `useRootNavigationState`, `setNavigationReady(true)`, `[rootNavigationState?.key]`, the lazy `getState().currentStep` and the `if (!input.isNavigationReady) return { kind: 'wait' }` text in decideAuthGateRoute). I read them and expect all to pass as M2-M4 are written. M2 must keep that exact `wait` line.
Fix: add these four to the re-run list and say "M2 keeps the isNavigationReady line verbatim".

## in#7 LOW: no generator or regenerate command is named for the generated files
Plan: Files line lists mobile/src/generated/surfaces/mobile_parcel_opening.json, docs/reports/generated/127-*.md and rule-lists-by-kind.md; the plan names no command.
Evidence: surface-registry.infra.test.ts:132-135 is a byte-identity lock (`tryGenerator(['--check'])`, "DRIFT"). Slices come from scripts/surfaces/emit-mobile-surfaces.mjs. Rule lists come from scripts/analysis/rule-lists.mjs (its glob at rule-lists.json:87 matches every *.descriptor.json). The wall commit 4cf68ec45 moved policy-ledger.json but not rule-lists-by-kind.md. The plan's UNVERIFIED "whether policy-ledger.json and rule-lists-by-kind.md really move" is only half settled: policy-ledger moved for the wall, rule-lists did not. I did not run the generator.
Fix: name the generator commands per file in section 4, and drop rule-lists-by-kind.md from the Files line unless the generator output shows a change.

Not settled, and unchanged from the plan's section 9 list: the Expo 54 `splash` with no image (app.json:11-15; expo-splash-screen is not a direct dependency in mobile/package.json), the `<Redirect>`/`<Slot>` behaviour, and the keyboard cause. These need a device or a build.

STATUS: 7 findings (1 HIGH, 3 MED, 3 LOW); the plan's citations hold, but the new mount file has no census owner and a pinned test is not on the Files line.
