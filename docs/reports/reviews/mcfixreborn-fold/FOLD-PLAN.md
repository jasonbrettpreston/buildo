Planner: Cairn-Plan-Fold

I only read files. I wrote nothing, ran no tests and used no database. File:line references below were read at the current board tree, and every path in the Files lines exists unless it is marked (new). MD means MORNING-DECISIONS.md, ST means the STATUS.md file, GQ means GROUNDER-QUESTIONS.md and GS means GROUNDER-SEATS.md.

## 1. The tasks (12): 10 fixes and 2 builds
| # | Name | Type | Folds (ST ids) | Files line | Size | DB GO | Protected file | Runs at the same time as |
|---|---|---|---|---|---|---|---|---|
| 1 | FIX.SEARCH-EXACT | fix | ST1, 2a (server side), G2 D1, G2 D6, G3 R1 | src/lib/admin/parcel-lookup.ts, src/tests/search-parser-guard.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/_schema/census/contracts.json, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md | S | no | no | 2, 8, 9, 10/11, 12, 6 |
| 2 | FIX.SEARCH-PAGE | fix | 2a (phone side), V4, V5, L1, L3, L5, N4, R2, R4, R5 (golden header), B.7 (topic and the two search-page links), GQ Q4, Q8 (apostrophe), Q19 (the shim) | mobile/src/lib/parcelSearchMatch.ts, mobile/src/lib/semiQuestion.ts, mobile/src/lib/schemas.ts, mobile/src/components/surfaces/SearchBinding.tsx, src/components/surfaces/web/SearchBinding.tsx, scripts/surfaces/_schema/static-page.json, scripts/surfaces/_schema/static-page.schema.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/src/generated/surfaces/mobile_parcel_semi_question.json, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, mobile/__tests__/semiQuestionPage.behaviour.test.tsx, mobile/__tests__/schemas.test.ts, mobile/__tests__/daylightSearchPages.golden.test.ts, src/tests/surfaces/search-web-binding.ui.test.tsx, docs/specs/03-mobile/99_mobile_state_architecture.md, src/tests/fixtures/surfaces/ | M | no | no | 1, 8, 9, 6, 10/11, 12 |
| 3 | FIX.LOT-CARD | fix | ST3/2c, V1, V2, V3 (with C.9), L2, L7, R3, X1, X6 (static-page half), R5 (static-page.json:2), B.7 (map links), GQ H Q2, H Q4 | src/lib/parcels/consumer-lookup.ts, mobile/src/components/surfaces/LotMapBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json, scripts/surfaces/_schema/static-page.json, src/components/surfaces/web/StaticBinding.tsx, src/tests/surfaces/static-page.logic.test.ts, src/tests/surfaces/static-web-binding.ui.test.tsx, src/tests/surfaces/lot-map-help-link.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, mobile/__tests__/lotMapPage.behaviour.test.tsx, mobile/__tests__/lotMapScreens.golden.test.ts, scripts/analysis/lot-map-data-check.mjs, src/tests/fixtures/surfaces/ | M | no | no | 6, 8, 9, 10/11, 12 |
| 4 | FIX.SEARCH-SETTINGS | fix | N1 and GQ Q1, L4, L6, L8, X3, G2 D3, G2 K3 (the MD:738 cite), seat S2 (panel wording) | scripts/seeds/logic_variables.json, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/entitlement/route.ts, src/lib/admin/parcel-lookup.ts, mobile/src/constants/parcelSearch.ts, mobile/src/store/recentSearchesStore.ts, scripts/surfaces/emit-mobile-surfaces.mjs, mobile/src/lib/sliceConfig.ts, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_search.json, docs/reference/logic-variables-registry.md, src/tests/control-panel.logic.test.ts, src/tests/parcel-lookup-gate.infra.test.ts, src/tests/parcels-entitlement.infra.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts | M | YES: own task | no | 6, 9, 10/11, 12 |
| 5 | BUILD.REPORT-LIMIT | build | ST2, 2b (G.6, RR-0443 a, RR-0444 2b), the O1 slot | mobile/src/lib/apiClient.ts, mobile/src/lib/errors.ts, mobile/src/lib/parcelSearchMatch.ts, mobile/src/components/surfaces/SearchBinding.tsx, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json, mobile/src/generated/surfaces/mobile_parcel_search.json, mobile/app/(app)/parcel-tool/[parcelId].tsx, mobile/src/components/surfaces/ReportPageHost.tsx, src/app/(maxbld)/parcel-tool/SearchPageClient.tsx, src/app/(maxbld)/parcel-tool/[parcelId]/page.tsx, mobile/__tests__/apiClient.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelSearchScreen.behaviour.test.tsx, src/tests/fixtures/surfaces/ | L | no | no | 9, 10/11, 12 |
| 6 | FIX.REPORT-CONFIDENCE | fix | G2 Q1 (GQ: Spec 126:816; M-481, Spec 69a:629) | src/lib/report-projection/project.ts, src/lib/report-projection/format.ts, src/tests/customer-report-compute.logic.test.ts, src/tests/fixtures/report-page/ | M (moves goldens) | no | no | 1, 2, 3, 4, 8, 9, 10/11, 12 |
| 7 | FIX.PRESS-FEEDBACK | fix | GQ Q14 (Std 1.3, 00_engineering_standards.md:24) | mobile/src/components/surfaces/SurfaceRenderer.tsx, mobile/__tests__/surfaceRenderer.smoke.test.tsx, src/tests/fixtures/surfaces/ | S | no | no | 9, 10/11, 12; goes LAST on the phone, after 5 (goldens) |
| 8 | FIX.SEARCH-TESTS | fix | X2, X4, X5, X6 (nav half), N3, R5 (follow-ups and nav headers), G2 D4, G2 D2 | mobile/__tests__/surfaceRenderer.smoke.test.tsx, mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx, src/tests/surfaces/nav-by-route.logic.test.ts, src/tests/surfaces/search-follow-ups.logic.test.ts, src/tests/property/massing.property.test.ts (new), src/tests/property/slice-number.property.test.ts (new), src/tests/parcel-routes.security.test.ts (new), src/tests/customer-report-read.logic.test.ts, src/tests/src-sql-ledger.logic.test.ts, src/tests/factories.ts, scripts/analysis/src-sql-ledger.mjs | M (tests) | no | no | 1, 2, 3, 6, 9, 10/11, 12; must finish before 7 (same smoke test) |
| 9 | FIX.MIG309-DBTEST | fix | G2 D5 (Std 5.2, :108) | src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts (new) | S | YES, to run the database test (UNVERIFIED whether the local test stack needs a GO) | no | all |
| 10 | FIX.LISTS-OFF | fix | RR-0440 (section 6) | scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/hooks/check-lane-close.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/specs/00-architecture/08_agents.md | S | no | YES (3 files) | 1 to 9 and 12; not 11 |
| 11 | FIX.CLOSE-CHECK | fix | G4 S1, S2, S3, S4, S5, S9, T2, T9, T10, T11 (close-check, lane and rule-lists tests), T12 (messages and SPEC LINK lines), ST4/2d | scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.json, scripts/analysis/rule-lists.mjs, scripts/analysis/backlog-lane.mjs, src/tests/backlog/check-lane-close.logic.test.ts, src/tests/backlog/backlog-lane.logic.test.ts, src/tests/backlog/rule-lists.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts | M | no | YES (3 files) | 1 to 9 and 12; not 10 |
| 12 | FIX.REVIEW-TOOLS | fix | G4 T1, T3, T4 (the git stack part), T6 (note), T7, T8, T11 (brief and template tests), T12 (the migration 334 note), ST5/2d | scripts/analysis/backlog-brief.mjs, scripts/lib/review-template.js, scripts/analysis/proof-slice.mjs, scripts/analysis/proof-slices.json, .claude/review-templates/README.md, src/tests/backlog/backlog-brief.logic.test.ts, src/tests/backlog/review-templates.logic.test.ts, migrations/334_precommit_budget_registry_repin.sql | S-M | no (comment only) | no | all except 10 (both write 08_agents.md if T6's note goes there: run 12 after 10, or put T6's note in the README) |

Why the boundaries fall where they do:
- **1 and 2 are split server and phone** so they can run side by side. The server fix alone already stops a one-row typeahead from opening a lot, because the phone then shows a list of one.
- **2 owns the help topic and the search-page links.** That keeps 3 off both SearchBinding files.
- **3 follows 2** because they share static-page.json.
- **4 follows 1 and 2.** It shares parcel-lookup.ts with 1, and the search slice and descriptor with 2. It is kept apart because it needs the DB GO.
- **5 follows 2, 3 and 4.** It shares parcelSearchMatch.ts, SearchBinding and the search content. It also waits on the operator's answer to O1.
- **The tools are split in two.** 10 and 11 are the protected cards and must run one after the other. 12 has no protected file and runs beside them.
- **The proof row (ST5) sits in 12.** It is proofs data and is not protected.

## 2. Acceptance criteria: red test first, one line each
**1 FIX.SEARCH-EXACT**
- (ST1, GS A; RR-0442 MD:2277) "Gerrard St W" with a 10-row window of 9 E rows and 1 W row returns a list, not unique. The fix is :301 `guardByDirection(typeahead, typeahead.length >= 10 ? null : typed)`, with a 10-row case beside search-parser-guard.logic.test.ts:201.
- (2a; RR-0443 c MD:2285; GQ section 2 b) A typeahead that leaves exactly one row resolves to `text_candidates`, never `unique`, at :303-311. Only the exact path (:252-261) may return `unique`.
- (D1) "100 %" binds the escaped value `\%` and returns no unrelated lots. The escape goes at :299 and :330 and needs no SQL text change.
- (D6) Every `!` in parcel-lookup.ts carries a why-comment. The cap in non-null-assertion-comment.logic.test.ts:67 is not raised.
- (R1) The lookup contract text says "exact match opens, a typeahead lists", and its stale counts and cites are corrected. The census is regenerated by its own generator.
- Dated notes: Spec 100 §3.2 (:103) and the MF-35 note (:144). The lane also adds a dated note on G.1 and A.3 of doc-2 through the backlog CLI (`backlog doc edit`), never by a hand edit.
- Reuses the exact path's own truncation rule (:260-261).
- Must NOT: add a new resolution value (the phone's closed list would refuse it, which is the L1 family), or touch the meter in route.ts.

**2 FIX.SEARCH-PAGE**
- (2a; 2026-09-16 rule at parcelSearchMatch.ts:12-13) A query with no house number shows the existing `list.refine` line, whatever the number of rows. Whether the list also shows is question 7.2.
- (V4) A settled miss that is fetched again keeps the "no match" line (:351).
- (L3) A RateLimitError(0) shows one message (:301). Close MF35-DF1 and its pin.
- (L5) The minimum-length copy fills `{min}` from the slice's min_query_len, not a typed "3" (content :15, :21).
- (V5, N4; Spec 99 §6.5, :525-548) The semi page opened cold and offline does not redirect before the lookup settles: no gating on isFetching. A dated note in Spec 99 names the redirect-once pattern.
- (L1) A lot form with one extra field parses. Delete `.strict()` at schemas.ts:428. The closed enum lists stay as they are (a design call, GROUNDER-B:98).
- (B.7; doc-2:49; mock help.html:366) The help page has the topic "wrong-lot" ("Wrong address or lot"), and both search links go to /help?topic=wrong-lot. The old topics stay until 3 moves the map links.
- (Q19) Delete the shim at parcelSearchMatch.ts:199-201, as its own comment orders.
- (Q8) The semi answer uses a curly apostrophe.
- (R2, R4, and R5 for daylightSearchPages.golden.test.ts:7, :43) Text only.
- Reuses the existing content keys, the sliceNumber reader and the existing redirect hook.

**3 FIX.LOT-CARD**
- (ST3/2c; RR-0444 "Not available"; GS F) At consumer-lookup.ts:227 the area is null when lot_size_sqm is outside `LOT_SIZE_PLAUSIBLE_M2` (project.ts:79). The card and its screen-reader label read "Not available". The test uses the 123456789 placeholder and a value of 49.
- (L2) num('') returns null (:81).
- (V1; doc-2:59; choose-lot.html:306) A lot with no fronting street reads "… · at the back" (LotMapBinding.tsx:180-181).
- (V2; doc-2:48) The no-lot line ends "Try a nearby address or report it." and "report it" links to /help?topic=wrong-lot. The map links :97, :115, :238 and :240 move to wrong-lot.
- (V3, C.9) The screen-reader label contains the visible card text and no longer reads frontage or zoning. The button's name is its visible label.
- (X1) The lot-map smoke test renders the four error states as errors, copying errorOf from lotMapScreens.golden.test.ts:33-36.
- (H Q2, H Q4; help.html:366, terms-privacy.html:262) The plain pages carry a header with "MaxBLD home → /" and "Log in → /login", built from the existing static-page kinds.
- (X6 static half) The T5 check matches wrapped imports (static-page.logic.test.ts:151).
- (L7) A missing argument value is refused (lot-map-data-check.mjs:33).
- (R3) Text only.
- Must NOT: draw neighbour lots (O4 is out of scope), or add a new size setting.

**4 FIX.SEARCH-SETTINGS**
- (N1; MD:1494 "register them"; FE-47) The 60, 30 and 30 per minute limits, the 500 ms slow query, the cap of 10 and the 3 recent searches are seed rows with bounds. The routes and the parcel-lookup.ts cap read them, and a test fails when the code types the number. Phone keys use the PAGE_SETTINGS map (emit-mobile-surfaces.mjs:32-40, the task-395 pattern). Server keys use the existing logic_variables reader (lot-map.ts:55-80).
- (L4) A setting of 0 that the schema allows is emitted (:51).
- (L8) --write removes a stray slice, and the two comments are made true.
- (L6; GROUNDER-F D4) The entitlement route logs success with uid and duration_ms.
- (X3; Std 2.1 :39) The 500 bodies do not contain 'db down' (gate test :168, :464, :530; entitlement test :95).
- (D3, K3) Seed :8197 and :8207 say no DB mirror row is owed, the MD:738 cite is corrected, and control-panel test :268 is fixed.
- (Seat S2) The six maxbld_page_* descriptions say "takes effect at the next app build".
- DB: no migration file. Per the task-372 notes the seed loader inserts the rows at the next `npm run migrate`. Running that on dev is the operator's typed GO.

**5 BUILD.REPORT-LIMIT**
- (ST2, GS B) A 403 keeps its code, reportsLimit and resetsOn on ApiError (apiClient.ts:63, errors.ts). REPORT_LIMIT_REACHED and SUBSCRIPTION_REQUIRED become two error classes (parcelSearchMatch.ts:297).
- (G.6; report-limit.html state 3) At the limit, the search page and the report screen show the wall. It holds "You've used all {limit} reports", "Your count resets on {date}", "Go to Tracked Lots" (parcel-tool/tracked) and "How are reports counted?". It never shows the "reactivate" copy.
- (RR-0444 2b, expired) SUBSCRIPTION_REQUIRED shows the reactivate state. First check whether the existing PaywallScreen (mobile/app/(app)/_layout.tsx:9, PaywallScreen.tsx:4) already serves this user. Otherwise reuse the existing `search.entitlement` copy in the same wall layout.
- (O1 slot) One content key and one node give the wall's action row: the line "Your plan is managed on the web." (mock A) or an upgrade button. The operator's O1 answer picks one, with no other change. The same slot serves the reactivate state.
- Web (report-limit.html states 4 and 5): the web lookup shows the wall with "Upgrade to Pro" pointing at the existing subscribe route. Add a top-up link only if an extra-report-limit target exists; the lane checks this.
- Wall copy lives in the search content, not the report registry, so about 105 report goldens do not move.
- Must NOT: build a new plan or checkout flow, or show buy buttons on the phone before O1 is answered.

**6 FIX.REPORT-CONFIDENCE**
- (G2 Q1; Spec 126:816; M-481 at 69a:629 "beside each reading") Each reading carries its own confidence word, instead of the one weakest word per option (project.ts:150-151, :232). Goldens are regenerated with the --check generators.
- Must NOT: change the confidence values themselves.

**7 FIX.PRESS-FEEDBACK**
- (Q14) Primary buttons on the parcel pages spring with withSpring, the SaveButton.tsx:40-41 pattern. Critical actions call the existing wrapper mobile/src/lib/haptics.ts.
- Must NOT: call expo-haptics directly.

**8 FIX.SEARCH-TESTS**
- (X2) The "reports left" state renders.
- (X5) The held unsure-lot row is added.
- (X6) The navigation lock catches && and ||.
- (X4; Std 12.12 :380) Property tests: coverage ≤ 100 and the ft rounding, and sliceNumber stays in bounds or throws.
- (N3; Std 5.2 :108) parcel-routes.security.test.ts: 401 with no session, and a uid parameter is ignored.
- (D4; Std 5.1 :100) Typed builders in factories.ts are used by the two test files.
- (D2) `--confirm` on an empty folder exits 1 (src-sql-ledger.mjs:810).
- (R5) Text only.

**9 FIX.MIG309-DBTEST**
- (D5) Both CHECK constraints of migration 309 are refused in a real database.
- Must NOT: edit the migration.

**10 FIX.LISTS-OFF**: see section 6.

**11 FIX.CLOSE-CHECK**
- (S2) A branch with no rule table still reads the board (:720-725).
- (S3; GQ "narrow the skip, fail closed") During a merge, only merge-only staging is skipped (:720-721).
- (S1) A seat finding needs a quote, a cited line and a reason (:171-181, :359-376).
- (S4, S5, S9) Hyphenated seat ids are read. "NIT" lowers severity only as the verdict word. Subtask and archive paths are checked (:147, :144, :735).
- (ST4) backlog-lib.mjs is added to protected_paths (rule-lists.json:22), with a test that a lane closing after an edit to it is refused.
- (T2) A row for scripts/gemini-review.js (:163).
- (T9) The undo line names the worktree and the branch (backlog-lane.mjs:109).
- (T10) rule-lists.mjs :134, :558, :582, :600, :753.
- (T11, T12) Tighten the loose asserts and correct the citations.

**12 FIX.REVIEW-TOOLS**
- (T1; Spec 137 Rule 3 note) The ticket says two commits (backlog-brief.mjs:176, :187).
- (T8) An empty acceptance block warns (:172).
- (T7) The next round number is the highest + 1 (review-template.js:138).
- (T4) A git failure gives a refusal line, not a stack (proof-slice.mjs:79).
- (ST5, GS J) Row CHK.3 becomes `notbuilt`, with its reason (proof-slices.json:9).
- (T3) The README fixes.
- (T6) A short exemption note.
- (T12) The rollback note on migration 334 is a comment only. If the migration guard refuses the edit, the note goes in the runbook instead (UNVERIFIED).

Every card:
- Is opened through the backlog CLI, uses the type and Files line above, and has a milestone. Cards 10 and 11 must name their protected files (RR-0419, MD:2150).
- Goes through plan, plan review, launch by backlog-lane.mjs, output review, and a separate grounder before any fold (RR-0359, MD:1687). The build runs on Opus (RR-0385).
- Gets a dated note on the task that owns the code: task-69 (ST1), task-320 (ST2), task-336 (ST3), task-268 (ST5), task-448 (ST4), task-372 (D3), task-319 (L1).

## 3. Run order
- **Wave 1, side by side:** 1, 2, 6, 8, 9 (once its GO is given) on the product side. On the tools side, 10 if the operator approves its size, otherwise 11 first; 12 runs beside them.
- **Wave 2:** 3, after 1 and 2. On the tools side, 11 after 10, or the other way round.
- **Wave 3:** 4, after 1, 2 and 3, because the emitter may touch the map slice (UNVERIFIED). It needs the DB GO to apply.
- **Wave 4:** 5, after 4, 6 and the O1 answer. Then 7 last on the phone.

Tasks that never run together:
- 10 and 11 (the same protected files).
- 2, 3 and 5 (SearchBinding, static-page.json and the search content).
- 1 and 4 (parcel-lookup.ts).

## 4. Every in-scope item accounted for
- **G2:** D1 is in 1. D2 is in 8. D3 and K3 are in 4. D4 is in 8. D5 is in 9. D6 is in 1. Q1 is in 6.
- **G3, items on screen:** V1, V2 and V3 are in 3. V4 and V5 are in 2.
- **G3, latent code:** L1 and L3 are in 2. L2 and L7 are in 3. L4, L6 and L8 are in 4. L5 is in 2.
- **G3, card or ruling items:** N1 is in 4. N3 is in 8. N4 is in 2. N2 is out of scope (operator).
- **G3, test gaps:** X1 is in 3. X2, X4 and X5 are in 8. X3 is in 4. X6 is split between 8 and 3.
- **G3, stale records:** R1 is in 1. R2 and R4 are in 2. R3 is in 3. R5 is split between 8, 2 and 3.
- **G4, folded:** S1, S2, S3, S4, S5 and S9 are in 11. T1, T3, T6, T7 and T8 are in 12. T2, T9 and T10 are in 11. T4 is in 12 for the git stack part only. T11 and T12 are split between 11 and 12.
- **G4, left out:** T5 is owned by task-375 (it waits on a DB GO). The exit code half of T4 is owned by task-343.
- **Reading seats:** ST1 is in 1. ST2 is in 5. ST3 is in 3. ST4 is in 11. ST5 is in 12.
- **Seat questions:** S1 is O1, slotted into 5. S2 is in 4. S3 is answered by RR-0444 2c, in 3. S4 is in 11. S5 is answered at MD:1116; no change, since link quality is pipeline data.
- **Seat "not defects" rows:** The meter was refuted by ruling (MD:1434). The closed enum lists are part of L1. Wide semis are a stack lag (migration 323 is not applied there). The lot-size range was ruled at Spec 126:903 and is off.
- **Questions answered or not for him:**
  - Q4 is in 2.
  - Q6 (B.7) is split between 2 and 3.
  - Q8 is in 2.
  - Q14 is in 7.
  - Q19: the shim is in 2. The re-wording of Spec 90 and 117 and the decision logs are left out (documents only, at the re-freeze).
  - H Q2 and H Q4 are in 3.
  - Already built as answered, no change: Q9, Q15, Q17, H Q1.
  - Left out for the orchestrator to decide under RR-0192, with no default given: Q11 (Stripe, billing off), Q16 and Q18 (test strictness, deviation entry).
  - Accepted as built: Q12, Q13, H Q3, H Q6, H Q7.
  - Q7 is owned by task-393.
  - Outside 1·B: Q10, H Q8, H Q9.
  - Out of scope today: O2 and O4.
- **Objectives in GQ section 5:**
  - G.6 is in 5.
  - G.1 is in 1.
  - B.6 is in 3.
  - B.7 is split between 2 and 3.
  - C.9 is in 3.
  - C.3 is O4 (out of scope).
  - Street with no number is in 2.
  - The wrong doc-2 status marks for C.7 and C.12 get dated notes from 3 through the CLI.
- **G1:** only "sound" (no work). Everything else in G1 is out of scope (operator).

## 6. Turning the planning lists off for output reviews (RR-0440)
**Today:** rule-lists.json:236 `"every_task": ["five-words","plan-protocol"]`. resolveTask attaches both lists to every task (rule-lists.mjs:270). Both are then required:
- at launch, by the plan gate (check-lane-close.mjs:649-651, build tasks);
- at close, by the close check (check-lane-close.mjs:516-522, phases `['out']` for build and `['plan','out']` for fix).

**Recommended: output only, plan reviews keep them.** Resolution, the plan gate and the fail-closed guards stay as they are.

| File | Change | Lines |
|---|---|---|
| rule-lists.json | after :236 add `"output_off": ["five-words","plan-protocol"]`, plus one $comment line quoting RR-0440 and the operator's approval. Turning them back on means emptying the array. | +2 |
| rule-lists.mjs | validate (after :157): every output_off id is a defined every_task list. Export `outputLists(table, lists)`. Reword the comments at :270 and :543. | +4, ~2 edited |
| check-lane-close.mjs | at :519-522, a build task's compliance set uses outputLists. For a fix task the output_off lists are still checked with phases `['plan']`, so plan altitude keeps them. Update the header comment at :12. | +3, ~2 edited |
| backlog-lane.mjs | at :183-186, the output ids are filtered through outputLists, and the brief line says these two lists are plan-stage only. | ~3 |
| tests (src/tests/backlog) | check-lane-close.logic.test.ts :403-414: the control case becomes a build task closing without out-compliance-five-words, which passes. New planted defects: a fix task with no plan-stage output for the two lists is refused, and output_off naming an undefined list is refused. backlog-lane.logic.test.ts: brief text. rule-lists.logic.test.ts :344-347: the key. rule-lists-table tests: no change. | ~40 |
| documents | regenerate docs/reports/generated/rule-lists-by-kind.md if its counts move. Dated note in Spec 08 §7 rule 4. | 2 notes |

- **Total size:** about 15 lines of code, about 40 lines of tests and two dated notes. That is size S. The lane review is about the size of task-448's: about 25 to 40 calls, one session (RR-0419's estimate).
- **If the operator wants them off for plan reviews too:** set every_task to `[]` and remove the three fail-closed guards (rule-lists.mjs:156-157 and :293-294, check-lane-close.mjs:489). That also changes about 30 test lines: backlog-lane test :585-595, close-check test :412-414 and :531-532, rule-lists test :72 and :346, and about 8 expectation arrays in rule-lists-table.logic.test.ts. Still size S-M, but it removes a lock that was deliberately made to fail closed.
- **Note:** by F10 (check-lane-close.mjs:839-842), the switch-off task itself is still judged with the board's every_task when it closes.

**My recommendation:** make it its own card now, run it first on the tools side once the operator approves this size. Every later fold task then saves the two lists' output calls. Plan reviews keep both lists: plan-protocol is a rule about plans, and at the plan stage the lists run in one joined call.

## 7. Questions that block a task
1. **O1 (blocks part of task 5):** does the phone wall show "Your plan is managed on the web." or upgrade buttons? UNVERIFIED.
2. **Street with no number (blocks one criterion of task 2):** show the close list plus the "add a house number" line (RR-0443 c), or the line alone with no list (the 2026-09-16 rule, whose verbatim operator words were not found)? UNVERIFIED.
3. **Reactivate screen (blocks part of task 5):** there is no approved mock for it. May it reuse the existing PaywallScreen or the existing `search.entitlement` copy? UNVERIFIED.
4. **Task 10:** does the operator approve the size in section 6, and should plan reviews keep the two lists? UNVERIFIED.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/admin/parcel-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/lib/parcelSearchMatch.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/components/surfaces/LotMapBinding.tsx
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/hooks/check-lane-close.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.json


---
# Amendments by the orchestrator (2026-11-24), after the planner returned. The planner's text above is unchanged.

A1. Task 1 FIX.SEARCH-EXACT gains, from the typed-address seat (docs/reports/reviews/mcfixreborn-g3/SEAT-typed-addresses.md):
- a full correct address opens: when the exact read returns 2+ rows and the typed text carries a street type, narrow by street type as the direction guard does ("32 Fulham Dr", "123 Yonge St"); 5,006 keys affected;
- a leading unit ("Unit 4, 123 Yonge St"), a dash unit ("2760-4 Yonge St") and a period ("St.") are stripped before the parse; a letter suffix with no lot falls back to the close addresses;
- the seat's 29 typed-address cases, with their real addresses and expected results, are the task's tests.
A2. Task 5 BUILD.REPORT-LIMIT gains the in-app no-plan page (task 357, small-pages-v8 no-plan.html), by RR-0446. The three states (limit reached, subscription expired, no plan) share one wall layout. The purchase is on the web (orchestrator reading of RR-0445 with the 2026-11-11 ruling "a"); the reactivate state reuses the existing PaywallScreen where it fits (build with existing components).
A3. O4 is closed by RR-0446: no neighbour lots. Task 3 adds a dated note correcting objective C.3 in doc-2 through the backlog CLI.
A4. Minimal core, if the operator wants the smallest first step: tasks 1, 2, 3, 5 (what a customer meets), 11 (the close check's two fail-open paths) and 10 (planning lists off, saves review calls on every later task). Deferrable without customer effect today: 4 (needs a DB GO; billing and rate limits work as typed), 6 (confidence word per reading; moves report goldens), 7 (spring and haptics), 8 and 9 (tests only), 12 (tool wording).
A5. Open before cards are written: (i) street with no number: the "add a house number" line alone, or with a list; (ii) planning lists off for output reviews only, or plan reviews too; (iii) the semi seat's three questions go to a grounder first (RR-0443 b).
