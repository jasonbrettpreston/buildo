# Seat: integration: task-452 plan (PLAN-452-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 98d934382 on wf2/inc1b-sfx2's merge-base edd9d2f7a (branch wf2/board). Task-450 read with `git diff HEAD...wf2/inc1b-sfx2` (de6d89d6f). Cards read: task-452 (whole file, including the findings in the working tree), task-451 plan (hunks, string pins, census route), task-357 (Files line, trigger rule). FINDINGS-PLAN.md read first. Files read include:
- mobile: apiClient.ts, errors.ts, parcelSearchMatch.ts, parcelSearchCore.ts, SearchBinding.tsx, SurfaceRenderer.tsx, ReportPageHost.tsx, haptics.ts, maxbldHelp.ts, parcel-tool/index.tsx, [parcelId].tsx, useParcelLookup.ts, constants/parcelSearch.ts.
- server and web: lookup and entitlement routes, error-mapping.ts, envelope.ts, entitlements/index.ts, require-parcel-tool-page.ts, web/SearchBinding.tsx (450 branch), SearchPageClient.tsx, page.tsx, maxbld-web.ts.
- generators and locks: screen-checks.mjs, generate-surface-registry.mjs, bindings.json, the surface-conformance, surface-validate and admin-media tests, parcelScreens.golden, surfaceRenderer.smoke and parcelSearchScreen.behaviour tests, the three report-mount tests.
- The v8 mock report-limit.html.
Nothing was run. Where the cited line is not named below, it matched.

## Checked and clean
- Cites that match: apiClient.ts:49-64 (the 403 block, catch at :60-62, re-export :12); errors.ts ApiError :14-21; parcelSearchMatch.ts:254 (tracked), :297 (403 check), :302-358; SearchBinding.tsx notices/searchProps/searchData; SurfaceRenderer.tsx:34-45, :111-146 and the ACTION_PROPS block; index.tsx:52, :105-117; haptics.ts; authStore.ts:76; useParcelLookup.ts:66; the 403 body shape {error:{code,message,details}} (envelope.ts:56-80); route.ts:73 and :112; lotMap.ts:87 and semiQuestion.ts:68 both call classifyParcelSearchError, so they stay untouched.
- Every `instanceof ApiError && status===403` caller survives subclassing. The only such checks are useParcelLookup.ts:66 and parcelSearchMatch.ts:297. apiClient.test.ts:132-148 asserts only instanceof and status, so the existing generic-403 tests stay green.
- The entitlement route answers 200 with status null and null counts for no plan (entitlement/route.ts header; entitlements/index.ts:649). A lapsed status comes back with null counts (:650).
- Task-450 hunks do not collide with 452's. 450 changes deriveMatchType, hasHouseNumber, the `retryAfterSeconds == null` line, overCap, showMiss, DERIVED_NAMES, the prompt and hint templates, and the help topic. 452 anchors on the `...(args.entitlement ?` spread. 450 adds no search content keys.
- String pins: HEAD reads 426 at surface-validate.logic.test.ts:91. The 450 branch reads 427 (+1 web_help). The 451 plan moves 427 to 436. 436+17=453, and the plan's 17 keys do count to 17.
- The generator flags `--emit-descriptors` and `--check` exist (generate-surface-registry.mjs:1596, :1605), and there is no `--write`. The file contains binary bytes, so plain grep misses it; use `grep -a`. The 451 plan confirms the descriptor is rewritten from the census entry.
- Mount import allowlist (bindings.json mount_internal) permits @/lib/, @/store/, @/hooks/ and @/components/surfaces/. ReportPageHost's C-8m host table is unchanged by adding a `<Renderer>` through the existing COMPONENTS entry.
- Help topic 'billing' exists in static-page.schema.json. `reportsLimit` is declared in the lookup contract's 403 fields (census/contracts.json:22722). The task-357 Files line does carry index.tsx.

## in#1 HIGH: 14 of the 17 new content keys are orphans under the existing SV-SBIND and golden locks; plan 8.2(a) cannot hold
Plan: §3.4 (+17 keys), §3.12 and §8.2(a): only the 'unauthorized' golden changes, limit and no-plan are proven by tests, "Golden counts stay: S-screen 100".
Evidence: screen-checks.mjs:404 `for (const k of sorted(Object.keys(content))) if (!used.has(k)) out.push(\`SV-SBIND ${id}: orphan content key ${k}\`)`. `used` fills only from golden props (:39 `used.add(ref)`). The reactivate golden draws only search.entitlement, wall.plan and wall.tracked. The 4 wall.limit.* keys, wall.counted and the 10 wall.noplan.* keys are in no golden. A second lock is mobile/__tests__/parcelScreens.golden.test.ts:122-123: `expect(Object.keys(SEARCH_SLICE.content).filter((k) => !used.has(k))).toEqual([])`, with the mobile-only exception pinned to exactly the four footer keys at :120. The closed state-name list has 3 unused names (partial, degraded, offline), and a state may not repeat (screen-checks.mjs:264), so the 11 states are full. The 'hit' state already carries the reports_left golden (descriptor states).
Fix: 8.2 needs a ruled mechanism that gives the limit and no-plan keys golden coverage. Either a separate surface with its own descriptor (8.1b), or the keys held out of this content file. As written, `surface-validate --check` fails and the string pin cannot reach 453. Remove "golden counts stay".

## in#2 HIGH: nothing carries the 403 count from the error to the tree
Plan: §3.3 (SearchSituation gains only `wall` and `planCheck`; ParcelSearchErrorClass unchanged) and §3.5/§3.5 searchData "adds errors.403.reportsLimit beside 429".
Evidence: SearchBinding.tsx searchData builds `contract` only from `s.candidates`, `s.errors.retryAfterSeconds` and `s.entitlement`. `s.errors` (parcelSearchMatch.ts:290-299) has no limit field, and buildSearchSituation receives only `error`, which it passes to classify. `contract('errors.403.reportsLimit')` therefore resolves against nothing, and SurfaceRenderer.resolveValue throws "unresolved ref". The fixture situations are plain JSON, so the number also has to be a situation field for goldens and tests.
Fix: add `reportsLimit?: number|null` (and `resetsOn`) to SearchSituation, set from `error instanceof ReportLimitError` in buildSearchSituation. State it in §3.3 and add it to the searchWall test list.

## in#3 HIGH: three pinned report-mount tests mock the hooks module without useParcelEntitlement
Plan: §3.8 [parcelId].tsx calls `useParcelEntitlement()`. §4 lists only reportPage.behaviour.test.tsx for the report side.
Evidence: reportScreen.gateStability.behaviour.test.tsx:22 `jest.mock('@/hooks/useParcelLookup', () => ({ useParcelLookup: () => mockHook }))`. reportScreen.mount.behaviour.test.tsx:33 mocks `useParcelLookup` only. semiQuestionPage.behaviour.test.tsx:35 mocks the module with no useParcelEntitlement while mounting the real [parcelId] screen (:49). All three throw "useParcelEntitlement is not a function". The gateStability test also pins render and gate stability of this screen, which a new query hook touches.
Fix: add the three test files to the Files line and to §4, giving each mock a useParcelEntitlement stub. Re-run gateStability, since it pins hook stability.

## in#4 HIGH: existing smoke assertion on the 'unauthorized' notice breaks, and is not listed as rewritten
Plan: §3.12 'unauthorized' gains `"wall":"reactivate"`, and §3.5 notices() draws the entitlement notice only when `!s.wall`. §6 says 450 owns :41 and :76-82 and 452 only adds a describe.
Evidence: surfaceRenderer.smoke.test.tsx:88-89 `show('unauthorized'); expect(screen.getByTestId('parcel-search-entitlement')).toBeTruthy();`. With the guard that testID is gone and the node is parcel-search-wall-reactivate. The test title "403: the entitlement text, never the miss copy" also needs a dated retitle with the prior text kept. A second hit is the web golden and tests built from the same fixture (search-web-binding.ui.test.tsx:80-81 uses WEB_UNAUTHORIZED_SITUATION, so it is unaffected).
Fix: list smoke :87-90 as an edited assertion in §4 and §6 (new testID, same text inside the wall, miss copy still absent).

## in#5 MED: the live web not-entitled page never draws the wall, so AC5 and 8.5(b) are not produced
Plan: §3.14 "[parcelId]/page.tsx and SearchPageClient.tsx: no edit", §8.5(b) "the not-entitled page shows reactivate", §3.10 web binding gains the wall.
Evidence: page.tsx:14 `situation={entitled ? WEB_STATIC_SITUATION : WEB_UNAUTHORIZED_SITUATION}`. maxbld-web.ts:33-35 defines WEB_UNAUTHORIZED_SITUATION as `{...WEB_STATIC_SITUATION, errors: {...NO_ERRORS, entitlement: true}, showPrompt: false}` with no `wall` key. With the `!s.wall` guard unchanged in effect, the real page keeps the plain notice. The web 'unauthorized' golden (built from the fixture, which carries wall) would draw the wall, so the golden and the page diverge. maxbld-web.ts is not on the card or the plan's files. No code path builds a WebSituation for limit or no_plan (only the three constants in maxbld-web.ts).
Fix: add src/lib/surfaces/maxbld-web.ts to the files, set `wall: 'reactivate'` on WEB_UNAUTHORIZED_SITUATION, and keep the maxbld-web-pages.logic.test.ts:128 equality. Or state in §8.5 that web draws the notice and the golden is documentation only.

## in#6 MED: the wall needs layout classes in constants/parcelSearch.ts, which the plan never names
Plan: §3.5 builds a View, header Text, lines, Buttons and a link with no class source. The `L.*` table is not in §3 or §6.
Evidence: SearchBinding.tsx header says "Class strings, sizes and hexes come from the layout table (PARCEL_SEARCH_LAYOUT, mobile/src/constants/parcelSearch.ts)", and FE-05 forbids literals in the binding. bindings.json touch_targets.mobile requires Button classes `min-h-[44px]` or `min-h-[48px]`. parcelScreens.golden.test.ts:129 runs `layoutProblems` (dark chains and 44px) on every NAMED_CASE. The web layout table WEB_SEARCH_LAYOUT is the web equivalent.
Fix: add mobile/src/constants/parcelSearch.ts (and the web table) to the files, with classes for the wall, its title, lines and its buttons. Also add the four new situations to NAMED_CASES (parcelScreens.golden.test.ts:27-30). The test at :101-103 fails on any situation neither a golden nor a named case, and that file is not on the Files line.

## in#7 MED: open_help links have no `q`, and the report-screen data has no value to give them
Plan: §3.5 link "How are reports counted?" (open_help 'billing') and the no-plan "Still stuck?" help link. §3.8 hands the report host `data` unspecified.
Evidence: SurfaceRenderer.tsx `case 'open_help': return () => act.open_help?.(String(a.topic), String(resolveValue(a.q, ctx)))`. With no `q`, the URL gets `q=undefined` (String(undefined)). Existing links use `q: derived('input')` (SearchBinding), and a report-screen data object without derived.input throws "unresolved ref" in resolveValue (a ref resolving to undefined throws).
Fix: give each wall open_help an explicit literal q (or a content ref), and say what `data.derived` the report-screen wall carries. The same data object must also hold errors.403.reportsLimit and the entitlement fields.

## in#8 MED: Go to Tracked Lots and Account use `push`, which records the typed query as a recent search
Plan: §3.5 limit button `push PARCEL_TAB_ROUTE.tracked`; no-plan Account `push PARCEL_TAB_ROUTE.account`.
Evidence: index.tsx `push: (to: string) => navigate(to)` and `navigate` is `addRecent(debounced); router.push(route)`. The comment above it says a search is recorded only when it opens a page (P35-D16 a). Pressing either wall button with a typed query adds that query to the on-device recents although no page opened.
Fix: give the wall its own action (or use a route action that skips addRecent) and add a behaviour assertion that recents stay empty after the press.

## in#9 LOW: test-harness gaps in the planned behaviour cases
Plan: §4 AC2 "authStore :25 gains signOut"; §3.7 `useAuthStore.getState().signOut()`.
Evidence: parcelSearchScreen.behaviour.test.tsx:25 mocks the store as a bare function `(select) => select({accessToken: null})`, with no `.getState`, so the call throws unless the mock is rebuilt as a function with a `getState` property. The `useParcelEntitlement` mock (:34-39) returns `refetch: jest.fn()` (undefined result), so the "when it settles" branch needs a resolved value. authStore.ts:76 `signOut: () => Promise<void>`, while `sign_out?: () => void` implies a floating promise (needs `void`).
Fix: say so in §4, and write `() => void useAuthStore.getState().signOut()`.

## in#10 NIT: cite drift
Plan: §2 "error-mapping.ts:37" (limit) and ":28" (subscription).
Evidence: error-mapping.ts:38 is the `err('REPORT_LIMIT_REACHED', ...)` line and :29 the SUBSCRIPTION_REQUIRED line (task-357 cites the same drifted numbers, :28-29/:37-38 as ranges). The PaywallScreen prop is at :31 (plan :29-31, close enough).
Fix: correct to :38 and :29 when the plan is refreshed.

UNVERIFIED: whether jest-expo stubs expo-haptics for the ~all surface tests that will now fire the renderer haptic (no `__tests__` file mocks haptics; plan §9 already lists this). Whether signOut ends on sign-in (plan §9). The 44px and mock-copy points were raised by the lenses and not rechecked.

STATUS: 10 findings (0 CRITICAL, 4 HIGH, 4 MED, 1 LOW, 1 NIT); the plan's cites and 450/451 hunk split hold, but the golden and orphan-key locks, the missing count carrier, three unlisted report-mount mocks and the smoke assertion on 'unauthorized' need plan edits before build
