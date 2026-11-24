# Seat: integration: task-452 plan (PLAN-452-v2)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head e192b5e3e (wf2/board). The plan cites 9fdbe4ac1. `git log 9fdbe4ac1..HEAD` shows only docs and board commits, so no code line moved since the plan was written. Read: the whole task-452 file and the v1 records (seat-integration-1, QUESTIONS-RULED, GROUNDER-PLAN). Read every cited line in error-mapping.ts, the lookup, lot-size and entitlement routes, apiClient.ts, errors.ts, useParcelLookup.ts, parcelSearchMatch.ts, index.tsx and [parcelId].tsx. Also read static-page.json and its schema, PageTableBinding, SemiQuestionBinding, SurfaceRenderer, ReportPageHost, bindings.json, the census, screen-checks.mjs, the conformance/validate/static-page/page-arm/nav tests, and the mobile tests that mock the hooks. Cards 357, 457, 458 and branches proc460 and proc462 were read by diff. Nothing was run. The "58 files, 866 tests" count is UNVERIFIED, though 58 test files do exist.

Checked and clean:
- Every file:line cite in sections 2, 4 and 5 matches. This covers error-mapping :29 and :38, the senders (lookup :73, :112, :113; lot-size :58), apiClient :49-63, errors :14-22, useParcelEntitlement :162-170, index.tsx :52, PARCEL_TAB_ROUTE :253-257, classifyParcelSearchError :298-301, file end :366, static-page.json :1291 and :1293, the schema enum :531-538, PageTableBinding :99-100, SemiQuestionBinding :28-37 and semi-question.tsx :77-78. It also covers bindings.json :20 and :10, census :15095, ReportPageHost :34-35 and :60-65, MOBILE_HOSTS :752 and MOBILE_PARTS :748.
- T9 (static-page.logic.test.ts :101-118) pins `Object.keys(SCREENS)` to `[ID]` at :107, with BINDING at :103 and the no-JSX check at :114-118. A second row turns it red, so the claim stands and widening is needed.
- No schema edit is needed. The action enum at schema :531 already lists back, retry, push, select.
- The entitlement shape fits the plan. ParcelToolEntitlementSchema has `status`, `reportsLimit` and `resetsOnDisplay`, and 'expired' is a real status. The server 403 carries `error.details.{reportsLimit,resetsOn}`.
- Nothing named ReportLimitError, SubscriptionRequiredError, searchWall, useWallState or WallBinding exists yet, so there is no clash.
- A ReportLimitError that extends ApiError keeps `classifyParcelSearchError.entitlement` true, so today's notice stays for the other cases.
- Vars resolve in notice parts only (PageTableBinding :99-100), and the renderer interpolates numbers. S-id S-096 is free.
- Projected pins check out against the pinned lines: S-desc 33 to 34 and 17 to 18, S-screen 100 to 102, S-sbind 436 to 443 (+7 keys), and "1 of 1" to "2 of 2" (validate :93 and :95, conformance :245 and :263).
- S-golden's "18 states x 4; owed 13 / 52" is printed from `m.states.length` and `owed_*` (surface-validate.mjs:87-88). The plan's "measured, not projected" is right.
- Phone test files: 58 now, 59 with wallScreens.golden.
- SurfaceActions the rows do not name: `action()` in SurfaceRenderer.tsx:113 throws only for an action a tree names (the `in` guard). The TS type SurfaceActions (:34-45) requires change_input, set_input, retry, select, push and back (only open_help is optional). So the semi no-op pattern is correct for a wall host, and the rows name only push.
- Nothing a STAYING step needs left with a LEAVING part. The rows use only `push`, the 7 keys are each used by one of the two goldens, and the authStore mock already exists in parcelSearchScreen. The ReportLimitError/SubscriptionRequiredError classes, `route` and `wall.plan` all stay in 452.
- nav-by-route NAV-3 holds (the page-table button carries accessibilityRole). Using `router.navigate` for the tab route is consistent with FE-51 and nav-tab-switch.
- Open work: wf2/inc1b-proc462 touches only .husky/pre-push-checks.sh, CLAUDE.md, the 98 spec, hooks-composition test, the 462 task file and rule-lists-by-kind.md. None of those is on 452's Files line. proc460 touches review tooling only.

## in#1 HIGH: page-arm.logic.test.ts reads the real table through a one-surface context, so the new screens row turns it red and the file is not listed
Plan: sections 5 step 13 and the Files line (the pins list names T9 and the validate/conformance pins only).
Evidence: src/tests/surfaces/page-arm.logic.test.ts:98 "the real table is the passing control: one screen expected, one found, no finding" runs pageArm over `read(TABLE_PATH)` with `ctxOf` (:94), where `manifest: { converted: [ID] }` and `inScope` holds only the semi surface. pageArm (screen-checks.mjs) emits `SV-PAGE ${id}: not a converted surface` for every table id missing from that context, so mobile_parcel_wall produces a finding. The test at :118 expects exactly one finding string, and the :103 RED cases reuse the real table the same way. Also :11 says "expects one screen per binding module", and WallBinding calls pageProps.
Fix: add src/tests/surfaces/page-arm.logic.test.ts to the Files line (33 entries). Widen its context to both surfaces, or build the table in memory with only the semi row. Keep the "second caller, 2 expected" case red.

## in#2 HIGH: two bindings pins in surface-conformance.logic.test.ts move and are not in the pin list
Plan: section 4 pins and section 5 step 13 (only :245 and :263 and validate :93, :95 are named).
Evidence: surface-conformance.logic.test.ts:394 `expect([B.modules.length, B.promoted_entries.length, B.mounts.length]).toEqual([14, 8, 25])`. bindings.json has 14 modules and 25 mounts, and the plan adds 1 module and 2 mounts, giving 15 and 27. Line 810 pins the exact mobile module path list, ending `…PageTableBinding.tsx', …ReportBinding.tsx', …ReportPageHost.tsx']`, and WallBinding must be appended there (C-8m).
Fix: add both pins to section 4 with projected values (modules 14 to 15, mounts 25 to 27, a mobile list that includes WallBinding.tsx) and write them red first.

## in#3 HIGH: the owner census entry must list WallBinding.tsx, and the regenerated F14 descriptor is not on the Files line
Plan: section 5 steps 4, 6 and 11 (census "append mobile_parcel_wall"; bindings.json "module entry beside :20").
Evidence: bindingsProblems in surface-conformance.logic.test.ts (about :177) fails with "owner binding_mobile_list does not own it" unless `descriptor(owner).identity.owns.components` includes the module path. Today mobile-product.json:14922 lists LotMapBinding, SemiQuestionBinding and PageTableBinding, and the generated scripts/surfaces/platform_shared/F14/surfaces/binding_mobile_list.descriptor.json lists the same files at :11-12 and :33-35. Precedent: commit 782425428 ("the builder owner is census-listed").
Fix: add to step 11 "add WallBinding.tsx to binding_mobile_list's owns.components (and evidence) in mobile-product.json, around :14900-14925". Add binding_mobile_list.descriptor.json to the Files line, since --emit-descriptors rewrites it.

## in#4 MED: parcelScreens.golden.test.ts locks index.tsx imports and is not named
Plan: section 5 steps 7 and 8 (index.tsx calls useWallState; "a wall replaces the search tree").
Evidence: mobile/__tests__/parcelScreens.golden.test.ts:222-231 "the screen imports only react, expo-router, the binding modules, @/lib, @/hooks and @/store", with the regex `@\/components\/surfaces\/(SurfaceRenderer|SearchBinding)`. An import of `@/components/surfaces/WallBinding` in index.tsx (for WALL_SLICE.content) fails it. The plan says only that useWallState "builds the wall props".
Fix: say that useWallState returns tree, content and actions, so index.tsx imports only SurfaceRenderer and @/hooks/useWallState. Or list the lock as widened. Keep [parcelId].tsx on the same rule.

## in#5 LOW: the ReportPageHost `wall` prop does not say what content and actions the wall Renderer gets
Plan: section 5 step 9.
Evidence: ReportPageHost.tsx:34-35 takes `content` (REPORT_SLICE.content from [parcelId].tsx:33), and its `actions` is typed ReportActions (:44), which has no `push`. A wall tree drawn with the report content throws an unresolved-ref error, and its Go to Tracked Lots push needs a SurfaceActions object.
Fix: define the prop as `wall?: { tree, content, actions }` and supply all of it from useWallState, with the semi no-ops for change_input, set_input, select and back. Add a test line that the wall button calls navigate on the report screen.

## in#6 LOW: card 457 will edit the same files and has no dependency on 452
Plan: section 3 ("Nothing leaves to task-457").
Evidence: the task-457 file has `dependencies: []` and status LATER, and says "(2) ... a rate limit answer of zero seconds ... retry the search once automatically" (the search page and parcelSearchMatch classification) and "(1) the semi question page". 452 appends after parcelSearchMatch.ts:366, edits index.tsx and stubs the semiQuestionPage mocks. No clash today, since 457 is not planned or built.
Fix: add one line to section 8: "457 edits parcelSearchMatch.ts, index.tsx and semi tests in other hunks; whoever lands second re-reads the pins." Add task-452 to 457's notes.

## in#7 NIT: cite drift
Plan: section 2, "mounts :28-44".
Evidence: bindings.json "mounts": [ starts at :28 and the last entry (web_landing) is :53.
Fix: write ":28-53".

STATUS: 7 findings (3 HIGH, 1 MED, 2 LOW, 1 NIT); the split itself breaks nothing, but three pinned tests and one census entry the plan does not list fail when the wall surface is added.
