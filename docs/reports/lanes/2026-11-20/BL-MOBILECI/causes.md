# causes.md - BL-MOBILECI (task-354, MOBILE.CI-1) - Mobile CI run 44741125636 on 3a36e8b26: 6 files, 18 of 786 tests

Class: (a) the test is wrong against the code and the approved design; (b) the code is wrong; (c) a stale pin or golden moved as data.
Result: no case is (b). No file under mobile/src or mobile/app changes. Line numbers are the test files' lines BEFORE the fix (the log's own).
Log: run-44741125636.log (ANSI stripped copy clean.log).

| # | file : case | assertion (from the log) | class | cause (file:line, commit) | fix |
|---|---|---|---|---|---|
| 1 | parcelScreens.golden : 10 committed goldens | :91 names toEqual 10 names; received adds reports_left | c | ace05ccee (2026-11-19, SRCH.A6) added the reports_left golden (mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json); pin still 10 | exact list of 11; title 11 |
| 2 | parcelScreens.golden : every content key used by a golden (CR3-2) | :109 unused: footer.copyright, footer.help, footer.privacy, footer.terms | a | d2cd0d5a2 (2026-11-19, SRCH.FOOTER, MF-91) put the 4 keys in scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json (shared by the web and mobile targets) for the WEB page; RR-0270: the mobile page has no footer; the test counted mobile goldens only | used = mobile goldens + committed web goldens of the same surface; a key used by no golden still fails |
| 3 | parcelScreens.golden : RED planted | :127-130 expected '(need exactly one of min-h-[44px])', got '...min-h-[44px]\|min-h-[48px])' | a | 8a5387194 (2026-11-19, SUITE.FIX-2) changed the helper message (list from bindings.json:73) but not the literal at :130 | literal names the list |
| 4 | parcelScreens.golden : MF-58 legal line | :232 ['reports_left','reports-left'] vs ['reports_left','legal'] | a | ace05ccee draws reports-left between input and legal; small-pages-v8 search.html:267-269 order is input, reports-left, legal (SearchBinding.tsx:232-235) | after pill: ['reports-left','legal'] where drawn, ['legal'] where not |
| 5 | lotMapScreens.golden : nothing selected at open in every state | :135 TypeError children of undefined | a | fdb6cd266 (2026-11-19, MF-92 SRCH.DAYLIGHT) removed B.8: unlinked draws no Continue (LotMapBinding.tsx:239); the test at :177 already pins it; the loop at :131 lists 'unlinked' | unlinked must have NO Continue; others show select.none |
| 6 | reportScreens.golden : T1 | :110 toStrictEqual, Expected -18 Received +65 (the Add-lot-size sheet) | c | 08c3cc0c9 (2026-11-16, MF-19 plan v3) changed the sheet in ReportBinding.tsx (width, depth, ft/m, link); views re-captured, the props member of src/tests/fixtures/report-page/props/page_*.mobile.json not (report-page-capture.ts:14 carries props over; no script writes it) | props members of the 5 page goldens rewritten with reportProps(view) (regen-props.mts); 177 lines each, all inside the sheet tree; lifecycle goldens unchanged |
| 7 | reportScreens.golden : T3 | :156 unresolved ref {"part":"sheet.6.unit.sqft"} | c | same as 6: stale props name sheet.6.unit.sqft, the view has 6 = input.label | cleared by the same rewrite (verify-props.mts: 0 unresolved) |
| 8 | reportScreens.golden : T4 RED planted | :204 same literal as row 3 | a | 8a5387194 as row 3 | literal names the list |
| 9 | semiQuestionPage.behaviour : semi-question.html:130 busy | :108 not.toHaveProperty('busy'), Received value: undefined | a | test from 0cb9f9470 (2026-11-19) for dc21bb069; RN Pressable.js:220-226 always builds accessibilityState with busy (value undefined when idle); binding sends no busy key idle (SemiQuestionBinding.tsx:99, pinned semiQuestionScreens.golden.test.ts:151) | idle = accessibilityState.busy toBeUndefined (3 sites) |
| 10 | semiQuestionPage.behaviour : never-settling lookup, bounded wait | :159 same | a | as row 9; lines after :159 never ran on CI, traced by reading | same |
| 11 | lotMapPage.behaviour : smoke multi_parcel_2 | unknown action "open_help" (SurfaceRenderer.tsx:113) | a | d20ddec5e (2026-11-19, SRCH.C12): lot map help link is the action open_help; test actions() (:57) lacks it; disambiguate.tsx:51 lists it | actions() gains open_help |
| 12 | lotMapPage.behaviour : smoke multi_parcel_3plus | same | a | same | same |
| 13 | lotMapPage.behaviour : smoke unlinked | same | a | same | same |
| 14 | lotMapPage.behaviour : smoke too_many_lots | same | a | same | same |
| 15 | lotMapPage.behaviour : smoke intersection | same | a | same | same |
| 16 | lotMapPage.behaviour : 2 lots ... dark props | open_help, then 3 stale pins behind it | a, c | fdb6cd266: map userInterfaceStyle 'light', card facts line C.9 removed; 56e96eed5 (SRCH.LOTCARD): card title is the lead line | 'light'; card titles from the fixture; frontage and zoning read from each card accessibilityLabel (LotMapBinding.tsx:189), null zoning dash included; title "light props" |
| 17 | lotMapPage.behaviour : polygon and card call select | same open_help | a | same as 11 | same |
| 18 | lotMapPage.behaviour : real mount unlinked | :129 Unable to find parcel-lotmap-continue | a | fdb6cd266 removed the unlinked Continue | asserts no Continue and the Help link present |
| file | parcelSearchScreen.behaviour : suite failed to run (the 6th file; no test counted) | AsyncStorage native module null; chain parcel-tool/index.tsx:30 -> authStore.ts:8 -> supabase.ts:4 | a | ace05ccee added useAuthStore (index.tsx:54), useParcelEntitlement (:55), useFocusEffect (:56); the test mocks none | mocks for useFocusEffect, authStore (signed out), useParcelEntitlement (pattern of useParcelLookup.test.ts:13) |

Count: rows 1-18 are the 18 failing tests.

## Branch check
The lane head 772c72c52 is 9 board-only commits ahead of 3a36e8b26 (git diff --stat 3a36e8b26 HEAD -- mobile is empty). The unpushed lanes in the older text (semi page, reports-left, suite repair) are all inside 3a36e8b26 and are the causes above. The suite repair 8a5387194 ADDED two failures (rows 3 and 8: it changed the helper message in two mobile test files and not the literals) and removed none.
