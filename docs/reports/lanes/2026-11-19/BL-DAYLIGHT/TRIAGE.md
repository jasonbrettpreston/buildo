# TRIAGE r1 (plan review, review mode, r1-plan.txt) lane BL-DAYLIGHT, task-322

Decision key: KEEP = folded into the plan/report; REJECT = reason with the opened file:line.

| # | finding (short) | verdict | evidence / fold |
|---|---|---|---|
| 1 | CRITICAL "no legacy dark class" test vs retained dark constants | KEEP | The assertion is scoped to the render trees (searchProps, lotMapProps, semiQuestionProps goldens + named cases) and to PARCEL_SEARCH_LAYOUT / LOT_MAP_LAYOUT / LOT_MAP_HEX; PARCEL_SEARCH_TOKENS, TRACKED_LOTS_HEX, PARCEL_SHELF_HEX, PARCEL_SEARCH_HEX are named exemptions (mobile/app/(app)/parcel-tool/account.tsx:24-25, mobile/src/components/parcel/ParcelShelf.tsx:24-26 read them). |
| 2 | CRITICAL AC#4/#5 "no remaining reference by grep" vs left-in-place items | KEEP | REPORT states per AC: (a) grep pattern + dirs where the element is gone, (b) residue deferred: map.neighbours contract field and the two logic variables (server/DB scope, mobile/src/lib/schemas.ts:390, contract_parcels_lookup.descriptor.json:126), and lot.label frontage/zoning template (copy, GAP.13). Verified absent only within the stated scope. |
| 3 | CRITICAL emitter may restore removed keys | REJECT as stated, KEEP the check | scripts/surfaces/emit-mobile-surfaces.mjs:6-9 "One source each: the descriptor, the content file, the goldens": the content.json is the source, the emitter only copies it. A post-emit grep and `emit-mobile-surfaces.mjs --check` are added to the green step. |
| 4 | HIGH task RUNNING while AC#1 blocked; dependencies none | KEEP in part | AC#1 (MF id claim in ~/Buildo-scratch/ids) is outside the lane write scope (brief: write ONLY the lane dir and ~/Buildo-wt-daylight): raised to the orchestrator in REPORT, not worked around. Status stays RUNNING by the McLane take (task note 2026-11-19 "taken on the board at lane launch"); changing it is the orchestrator's. |
| 5 | HIGH grounding docs ENOENT in the context file | REJECT | The docs exist in the repo: `ls backlog/docs/increments/` lists doc-1 ... doc-13 (doc-2 included); the ENOENT is the generator resolving a path outside the worktree. Generator defect, not mine; named in REPORT for the orchestrator. |
| 6 | HIGH "undefined" in operator-quote slots | REJECT (not this lane) | Generated section of the context file (lines before "## Plan steps"); named in REPORT for the orchestrator. |
| 7 | HIGH superseded 35 s text not struck in the Storage block | REJECT (not this lane) | Generated block; irrelevant to a style task. Named in REPORT. |
| 8 | HIGH "no copy change" vs deleting two content keys | KEEP | Scope sentence widened in REPORT: removing the content keys that belong only to a removed element (search.account.label for A.13, lot.facts for C.9) is part of the removal; no retained string is edited. mobile_parcel_*_content tests require every key to be used (parcelScreens.golden.test.ts:107-111). |
| 9 | HIGH token mapping #b45309 / map palette not a gate | REJECT as gate, KEEP as OPERATOR item | Brief: "no new token ... stop as an OPERATOR item rather than inventing". The build uses only existing tokens (nearest: report-amber-ink); both rows are raised as OPERATOR items in REPORT. No token is added. |
| 10 | HIGH userInterfaceStyle is app level | REJECT | node_modules/react-native-maps/lib/MapView.d.ts:516 `userInterfaceStyle?: 'light' \| 'dark';` is a MapView prop (the binding already passes it at LotMapBinding.tsx, 'dark'). |
| 11 | HIGH open_account removal: count asserted, unknown-action fallback | REJECT mostly | Full grep run (terms open_account, search.account, parcel-search-account over the repo excluding node_modules/.git): code sites are SurfaceRenderer.tsx:40,127; SearchBinding.tsx:84-90; mobile/app/(app)/parcel-tool/index.tsx:100, semi-question.tsx:51, disambiguate.tsx:49; tests surfaceRenderer.smoke.test.tsx:26,107, lotMapPage.behaviour.test.tsx:52, parcelSearchScreen.behaviour.test.tsx:138; goldens. Unknown action already throws: SurfaceRenderer.tsx:112 `unknown action`. |
| 12 | HIGH AC#2 vs listed structural deltas | KEEP | AC#2 is met as "Daylight tokens/colours/radii/borders applied"; structural deltas listed in REPORT for later tasks (brief DESIGN LIMITS: "list it as a delta for a later task, do not build it"). |
| 13 | MEDIUM search capture script not described by AC | KEEP | scripts/surfaces/search-golden-capture.ts is added in the repo as a named deliverable, modelled on lotmap-golden-capture.ts (no golden is hand-edited). |
| 14 | MEDIUM add --check runs | KEEP | green step runs each capture script and emit-mobile-surfaces.mjs with --check. |
| 15 | MEDIUM red via refused commit is fragile | REJECT | Brief RR-0225 / standing rule 18 prescribe exactly this. |
| 16 | MEDIUM no replacement entry for Account | REJECT | ParcelShelf keeps the Account tab (ParcelShelf.tsx:6-7,30); A.13 is the redundant in-bar duplicate. |
| 17 | MEDIUM mismatched MD:682 citation; truncated quote | REJECT (not this lane) | Generated pack. |
| 18 | MEDIUM AC#5 depends on GAP.13-f, dependencies none | KEEP | REPORT notes: after C.9 the card shows title and area only until GAP.13-f lands the card line; order the stack GAP.13 after or with this. |
| 19 | MEDIUM padded decisions list / duplicate headings | REJECT (not this lane) | Generator output. |
| 20 | MEDIUM context embeds plan (second source) | REJECT | The brief orders the plan appended to the context file. |
| 21 | MEDIUM no rollback statement | KEEP | REPORT carries: revert = git revert + the three capture scripts --write + emit-mobile-surfaces.mjs --write + --check. |
| 22 | LOW heading malformed; mixed absolute paths; username in committed file | REJECT (not this lane), flagged | Generated; the absolute home path in the generated pack is flagged for the orchestrator (rule 8). |
| 23 | LOW budget accounting | REJECT | Generator. |
| 24 | NIT BL-R10 labelled as review | REJECT | Cosmetic, generator. |
| 25 | NIT cite one line per restyled file | KEEP | REPORT cites mobile/src/constants/parcelSearch.ts:58,95 and lotMap.ts:12-33 as the dark state. |

# TRIAGE r2 (output review, one lens: v8 fidelity and no copy drift; r2-output.txt)

| finding | verdict | evidence |
|---|---|---|
| CRITICAL search-golden-capture.ts pasted twice | REJECT | artefact of how the review patch was built (the file was appended after git diff already held it); `wc -l scripts/surfaces/search-golden-capture.ts` = 58; the script ran: "search goldens ok (10)". |
| HIGH SemiQuestionBinding L.noticeError undefined | REJECT | SemiQuestionBinding.tsx imports `LOT_MAP_LAYOUT as L`; lotMap.ts LOT_MAP_LAYOUT has `noticeError: S.noticeError`; `npm run typecheck` clean. |
| HIGH goldens/descriptors/slices absent from diff | REJECT | excluded from the review patch only; regenerated: "wrote 10/11/8 goldens", "wrote 7 files", all four --check lines ok; web goldens rewritten (fingerprint only, 10 files). Descriptors untouched on purpose (see REPORT). |
| HIGH open_account other call sites; PARCEL_TAB_ROUTE.account unused | REJECT | repo-wide grep before and after: no hit left; PARCEL_TAB_ROUTE.account still used at mobile/app/(app)/parcel-tool/tracked.tsx:99. |
| MEDIUM neighbours consumers, continueButton dead | REJECT | grep neighbour in mobile/src lib, binding, constants: none; continueButton used in the multi_parcel case (LotMapBinding.tsx body). |
| MEDIUM hex twins duplicate REPORT_HEX | REJECT | drift is pinned by daylightSearchPages.golden.test.ts ("the map hexes are the existing Daylight values", parsed from tailwind.config.js). |
| MEDIUM LOT_MAP_HEX.check new field | REJECT | a colour in an existing table (ink, the v8 selected-radio ink), not a field of the contract; noted in REPORT. |
| MEDIUM readonly LOT_MAP_STYLE type | REJECT | typecheck clean; mobile tsc shows no error in the touched files (only the missing-dependency errors present before the change). |
| MEDIUM Android shadow / overflow on map frame | KEEP as UNVERIFIED | runtime only; listed in REPORT UNVERIFIED. |
| MEDIUM report-* keys exist | REJECT | mobile/tailwind.config.js has flat 'report-no-fill', 'report-no-ring', 'report-sky', 'report-button', 'report-button-border', 'report-field', 'report-line', 'report-soft', 'report-amber' (read above). |
| MEDIUM LAYOUT.account other readers | REJECT | grep `LAYOUT\.account` none. |
| LOW stroke #9a4a07 vs v8 #b45309 | KEEP | already an OPERATOR item in REPORT. |
| LOW dead H keys | REJECT | H.textMuted and H.placeholder are read (SearchBinding.tsx:67,75,200). |
| LOW redundant dark: twins | REJECT | required by the existing rule P35-D2 a (parcelScreens.golden.test.ts "each dark: token ... has a twin"). |
| NIT noticeError new layout field | KEEP | disclosed in REPORT (one class string; needed for the v8 error banner). |
| NIT sha16 / readdir | REJECT | same helper and pattern as lotmap-golden-capture.ts; the directory exists. |
