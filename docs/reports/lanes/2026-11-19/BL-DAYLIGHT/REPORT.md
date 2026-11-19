# REPORT BL-DAYLIGHT (task-322 SRCH.DAYLIGHT, Increment 1·B)

STATUS: ready (BUILT; update below supersedes the blocked wording)

## UPDATE after the unblock (2026-11-19)
- Id claimed: mkdir ~/Buildo-scratch/ids/MF-92 (MF-91 was already taken by BL-R12); ls of the two highest: MF-91 MF-92. Next free id line now MF-93.
- Commit A d28288dd8 (queue row MF-92, dated notes on MF-35 and MF-53, prereg-MF-92-1.json): hook tail "GATE OK ... POLICY CHECKS OK (commit-msg): 0 file(s)".
- Build commit 95b40c076 (McFrontend-Task: MF-92 trailer and docs/reports/panels/MF-92.json were what the gate asked for after the first refusals FAIL:C:no-mf-task, FAIL:P:no-record): hook tail "Test Files 4 passed (4) / Tests 77 passed (77)", "GATE OK", "POLICY CHECKS OK (commit-msg): 14 file(s)". It also tracked the mobile/node_modules symlink by mistake; the docs commit untracks it (git rm --cached).
- Red commit 7f281e6e0.

## Where it stood before the unblock
- Landed: red commit 7f281e6e0 (tests + fixture only, task file, context file). The hook did NOT refuse it: "pre-commit: no staged src/ or scripts/ source files — skipping the related-tests run" (red.out), because mobile jest tests are not reached by the hook's root related-tests run. So red is NOT proven through the hook; the mobile jest suites were not run by me (rule 18) and are UNVERIFIED until the push station.
- Staged, not committed: the full build (58+ files). Green attempt (commit.out): the root related run passed ("Test Files 4 passed (4) / Tests 77 passed (77)": maxbld-web-pages.logic, admin-media.golden, search-web-binding.ui, nav-by-route.logic), typecheck passed (`npm run typecheck` exit 0), then:
  `FAIL:C:no-mf-task` / `FAIL:P:no-record` / `GATE FAIL` (scripts/analysis/mcbylaws/cite-arms.mjs:150: a commit touching frontend surface paths must name an MF task whose prereg record sits in the parent commit).
- To finish (orchestrator or a lane with scope): (1) claim the next MF id in ~/Buildo-scratch/ids (MF-90 is the highest present); (2) add the queue row in .cursor/MCFRONTEND-QUEUE.md with dated notes on MF-35 and MF-53 (prior text kept) and the prereg record (scripts/analysis/bylaw-validation/coa-expected/prereg-MF-NN-1.json, form of prereg-MF-58-1.json) in a commit BEFORE; (3) re-run the same commit with `MF-NN` in the message (the staged tree is ready); (4) docs commit of this REPORT, TRIAGE.md, r1-plan.txt, r2-output.txt to docs/reports/lanes/2026-11-19/BL-DAYLIGHT/ and `--add-ref`; (5) `--check-ac` 2-5 with the evidence below, `--final-summary`, `-s BUILT`.

## Token table (v8 token, value, existing Daylight token, files)
| v8 | value | existing token | files |
|---|---|---|---|
| --page | #f4f1eb | report-page | parcelSearch.ts screen; lotMap.ts (S.screen) |
| --card | #ffffff | report-card, report-button | pill, card, chip, marker chip, map frame |
| --ink | #1d1b18 | report-ink | text, checked-card edge, on-amber text and icons, pin, check |
| --t2 | #4d4841 | report-muted | secondary text, icons |
| --t3 | #655f55 | report-soft | rail, refine, prompt, placeholder class |
| --amber | #f59e0b | report-amber (RNR bg-primary unchanged) | primary buttons, spinner, lot fill, selected marker |
| --amber-t | #9a4a07 | report-amber-ink | badge, differing word, entitlement icon, map stroke, marker letter |
| --field-b | #8a8172 | report-field | pill border |
| --btn-b | #d9d0c1 | report-button-border | chip and neutral notice border |
| --s-outer-b | #e9e3d8 | report-line | card border |
| --err | #b3261e | report-no | error text and icon |
| banner error | #fbeceb / rgba(179,38,30,.35) | report-no-fill / report-no-ring | noticeError (one added class string in PARCEL_SEARCH_LAYOUT and LOT_MAP_LAYOUT) |
| --sh-2 | warm shadow | shadow-report-card | map frame |
Hex twins for props live in mobile/src/constants/lotMap.ts (LOT_MAP_HEX) and SearchBinding.tsx (REPORT_HEX from reportPage.ts); a test pins them to the tailwind report-* values.

## OPERATOR items (no token invented)
1. v8 amber-wm #b45309 (BLD wordmark, map outline) has no report token: built as report-amber-ink #9a4a07 (visible shift).
2. v8 map tile palette (#ede8de, #e4ded3, #f7f4ee) has no token: the map is the platform light map with a structure-only style (poi and label icons off), userInterfaceStyle 'light'.
3. v8 --sh-1 small shadow has no token: omitted.

## ACs
- AC#1 BLOCKED (see above; also needs a write to ~/Buildo-scratch/ids outside scope).
- AC#2 restyle: PARCEL_SEARCH_LAYOUT (mobile/src/constants/parcelSearch.ts) and LOT_MAP_LAYOUT/LOT_MAP_HEX/LOT_MAP_STYLE (mobile/src/constants/lotMap.ts) re-valued; the dark state before: parcelSearch.ts:58 `screenBg: 'bg-[#0e0e10]'` (kept: the Account screen reads it) and PARCEL_SEARCH_LAYOUT.screen 'flex-1 bg-[#0e0e10]'. Goldens by repo scripts: "wrote 10 goldens" (search-golden-capture.ts, new, modelled on lotmap-golden-capture.ts), "wrote 11 goldens", "wrote 8 goldens", "wrote 7 files" (emit-mobile-surfaces.mjs), then --check lines: "search goldens ok (10)", "lotmap goldens ok (11)", "semi-question goldens ok (8)", "surfaces ok (4 surfaces, 29 goldens)"; web goldens (10, fingerprint + the A.13 node) rewritten by buildGoldens (surface-goldens.ts).
- AC#3 A.13: removed from the app (SearchBinding.tsx, SurfaceRenderer.tsx, 3 mounts, content key search.account.label, PARCEL_SEARCH_LAYOUT.account) AND from the web binding (src/components/surfaces/web/SearchBinding.tsx, nav-by-route NAV-6 entry audit 45) because the content file is shared: a mobile-only removal fails the "every content key used" test. Grep `open_account|parcel-search-account|search\.account` over mobile src scripts/surfaces src (non-test): no hit; hits remain only in the new/edited tests asserting absence.
- AC#4 B.8: removed from LotMapBinding.tsx, lib/lotMap.ts (situation, pick, derived pattern), constants, fixture inputs unlinked_neighbour_picked/unlinked_stale_pick. Grep neighbour (not neighbourhood) in mobile/src, mobile/app, goldens: none. RESIDUE (b), not touched, server/DB scope: mobile/src/lib/schemas.ts:390 `neighbours:` zod field, the contract descriptor and the map descriptor reads and notes (mobile_parcel_disambiguation_map.descriptor.json:90-91, logic variables parcel_map_neighbour_radius_m/limit), the server query. The unlinked state still draws the pin map (v8 shows a banner only: delta).
- AC#5 C.9: card-facts Text, class cardFacts and content key lot.facts removed. RESIDUE (b), left to GAP.13 as briefed: content key lot.label (`"Lot {letter}, {area}, frontage {frontage}, zoning {zoning}"`, content.json:7) and the frontage/zoning vars in LotMapBinding.tsx cards(); after this the card shows title and area only until GAP.13-f lands the card line (order the stack GAP.13 with or after this).

## Files touched (and shared with BL-GAP13)
Mine: mobile/src/constants/parcelSearch.ts, mobile/src/constants/lotMap.ts, mobile/src/components/surfaces/{SearchBinding,LotMapBinding,SemiQuestionBinding,SurfaceRenderer}.tsx, mobile/src/lib/lotMap.ts, mobile/app/(app)/parcel-tool/{index,semi-question,disambiguate}.tsx, mobile/src/generated/surfaces/*.json, scripts/surfaces/search-golden-capture.ts (new), scripts/surfaces/parcel_product/F01/surfaces/{mobile_parcel_search,mobile_parcel_disambiguation_map}.content.json (one line removed each), src/components/surfaces/web/SearchBinding.tsx, src/tests/surfaces/{search-web-binding.ui,nav-by-route.logic}.test.ts(x), src/tests/fixtures/surfaces/** and mobile/__tests__/fixtures/surfaces/** (generated), mobile tests (red commit).
Both lanes may touch: the two content.json files (GAP.13 edits strings, I removed one key line each: line-adjacent merge), LotMapBinding.tsx cards() (C.9/lot.label), SearchBinding.tsx (tagline/copy refs), the regenerated slices and goldens (re-run the capture scripts and emit after any merge; generated, never hand-merged), mobile/__tests__/*golden* tests.

## Structural deltas left for later tasks (not built)
Wordmark and tagline centring/weight; reports-left line; tab bar (the shelf stays dark, as do Account and Tracked Lots: they read PARCEL_SEARCH_TOKENS/TRACKED_LOTS_HEX/PARCEL_SHELF_HEX, kept); radio dot on cards; v8 drawn map picture; unlinked state as banner only; banner info icon; v8 lot card text hierarchy (shared with the semi page cards); the web search page itself is still the dark zinc layout (only its Account button went); the semi-question page has no v8 mock (SRCH.SEMI), it follows the lot-card classes.

## Review
r1 plan round: r1-plan.txt, TRIAGE.md (KEPT: test scoping, grep-scope split, --check runs, search capture script named, rollback line). r2 output round (one lens): r2-output.txt, TRIAGE.md r2 (no defect KEPT). Rollback: git revert the build commit, then the three capture scripts --write, emit-mobile-surfaces.mjs --write, the web golden rewrite, then --check.

## Orchestrator flags
- Generated context pack: ENOENT notices, literal "undefined" in quote slots, an absolute home path (rule 8) (r1 findings 5-7, 22).
- Commit gate cite-arms.mjs:150 needs an MF id: any restyle lane on surface paths hits it.

## UNVERIFIED
Mobile jest suites (daylightSearchPages.golden, parcelScreens.golden, lotMapScreens.golden, semi golden, behaviour and smoke tests) not run by this lane; NativeWind honouring rounded-[20px], shadow-report-card, the light map style and Android map clipping (runtime); red proven through the hook (it was not).
