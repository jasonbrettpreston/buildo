---
id: TASK-454
title: >-
  SEARCHFIX.6 Search settings: the typed-in limits become registered settings;
  emitter, log and test fixes (needs the operator's typed GO to apply on dev)
status: BUILT
assignee:
  - '@lane-BL-SFX6B'
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-25T18:00:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-1
dependencies:
  - TASK-449
  - TASK-450
  - TASK-451
  - TASK-452
references:
  - docs/reports/reviews/task-454/GROUNDER-PLAN.md
  - docs/reports/reviews/task-454/TRIAGE-PLAN.md
  - docs/reports/reviews/task-454/seat-integration-1.md
  - docs/reports/reviews/task-454/seat-reality-check-1.md
  - docs/reports/reviews/task-454/seat-regression-1.md
  - compliance:step-132 docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
  - compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
  - compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-25/BL-SFX6B/GROUNDER.md
  - docs/reports/lanes/2026-11-25/BL-SFX6B/TRIAGE.md
  - docs/reports/lanes/2026-11-25/BL-SFX6B/REPORT.md
type: fix
ordinal: 150110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 4 (FIX.SEARCH-SETTINGS); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the limits typed into the code (60, 30 and 30 a minute; the 500 ms slow-query mark; the cap of 10; 3 recent searches) become registered settings with bounds (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1494 "register them"). The generator emits a setting of 0; the entitlement route logs success; the error tests check that no database text leaks; stale wording corrected. No customer effect once the rows are on the database: the limits keep today's values as their defaults. Before that, search, the entitlement read and the admin lookup return an error, so the dev apply comes before the push (plan, behaviour before the rows exist).

Findings folded: N1, Q1, L4, L6, L8, X3, G2 D3, G2 K3, seat S2.

DB: no migration file; the seed loader inserts the rows at the next migrate. Rehearsed on the test stack first; running on dev is the operator's own typed GO.

Runs after SEARCHFIX.1 to .4 (shared lookup file, search slice and descriptor). Dated note owed: task-372.

Files: scripts/seeds/logic_variables.json, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/entitlement/route.ts, src/app/api/admin/parcels/lookup/route.ts, src/lib/admin/parcel-lookup.ts, src/lib/parcels/lookup-flow.ts, mobile/src/constants/parcelSearch.ts, mobile/src/store/recentSearchesStore.ts, mobile/src/components/surfaces/SearchBinding.tsx, scripts/surfaces/emit-mobile-surfaces.mjs, mobile/src/lib/sliceConfig.ts, scripts/surfaces/_schema/surface.schema.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, scripts/surfaces/parcel_admin/F08/contracts/contract_admin_parcels_lookup.descriptor.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/census/contracts.json, src/lib/surfaces/generated/surface-descriptor.d.ts, mobile/src/generated/surfaces/mobile_parcel_search.json, docs/reports/generated/127-surface-registry.md, docs/reference/logic-variables-registry.md, docs/reference/maxbld-report-field-inventory.md, docs/reference/maxbld-report-field-inventory.json, scripts/generate-logic-variable-groups.mjs, src/features/admin-controls/generated/logic-variable-groups.json, scripts/steps/_schema/programme-items.json, scripts/steps/_schema/src-sql-ledger.json, src/tests/fixtures/surfaces/mobile_parcel_search/*.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json, docs/specs/03-mobile/99_mobile_state_architecture.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, backlog/tasks/task-372*, src/tests/control-panel.logic.test.ts, src/tests/parcel-lookup-gate.infra.test.ts, src/tests/parcels-entitlement.infra.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/report-projection-settings.logic.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/parcels-lookup-page.logic.test.ts, src/tests/search-routing.logic.test.ts, src/tests/search-parser-guard.logic.test.ts, src/tests/parcel-lookup-resolution.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, src/tests/db/parcel-lookup.db.test.ts, src/tests/db/consumer-parcel-lookup.db.test.ts, mobile/__tests__/recentSearchesStore.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelScreens.golden.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/reports/generated/127-surface-review-queue.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The six limits are seed rows with bounds, the code reads them, and a test fails when the code types the number
- [x] #2 A setting of 0 that the schema allows is emitted
- [x] #3 The entitlement route logs success with uid and duration
- [x] #4 The 500 bodies contain no database text
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
Planner: Cairn-Plan-454
Plan id: PLAN-454-v1

Read at the board head (wf2/board), after tasks 449 to 452 were pushed at 9fedd48cb. The planner wrote nothing, ran no test and used no database.

I only read files. Nothing was written, no tests were run and no database was touched.

**Answer to item 4 first.** The new reader throws when a row is missing, not a whole number or outside its seed bounds (the lot-map.ts:78-86 form; lot-size-entry.ts:91-96 throws only when its switch is on). Behaviour before the rows exist, read from the code (rc#3, rc#4, plan-ux#2): the lookup route returns the generic 500 on both the q and the parcelId path (the read comes after the 401, 403 and parse steps and before the limiter), the admin parcel lookup returns it, and the entitlement route, which today shows null counts when the report-limit rows are missing (entitlements/index.ts:655-657), now returns it too. The body is the fixed text 'An unexpected error occurred' (error-mapping.ts:84). The phone is unaffected until the server is: its numbers come from the built slice. Pushing alone deploys nothing: test.yml:34-38 runs on pull requests to main and pushes to main, and apply-migrations.yml:36-38 on manual dispatch only. The order is fixed: Stage (i) builds and commits, Stage (ii) rehearses on the test stack, Stage (iii) is the dev apply on the operator's typed GO, and only then the push, which is his own y (MORNING-DECISIONS.md:1975-1976). An earlier push is possible only if he says no dev app runs this branch (question 1).

### (A) FACTS

| Claim | file:line | Quote |
|---|---|---|
| Lookup limits | src/app/api/parcels/lookup/route.ts:57,59,60 | `SLOW_QUERY_MS = 500` · `SEARCH_LIMIT_PER_MIN = 60` · `LOOKUP_LIMIT_PER_MIN = 30` |
| Entitlement limit | entitlement/route.ts:25 | `ENTITLEMENT_LIMIT_PER_MIN = 30` |
| Server cap | src/lib/admin/parcel-lookup.ts:317,345,365,388,393,426,456,472 | `LIMIT 11`, `> 10`, `slice(0, 10)`, `LIMIT 10`, `>= 10` |
| Phone cap | mobile/src/constants/parcelSearch.ts:22 (read at SearchBinding.tsx:24,39 and index.tsx:79) | `SEARCH_CANDIDATE_LIMIT = 10` |
| Recent searches | parcelSearch.ts:28, recentSearchesStore.ts:11,55 | `SEARCH_RECENT_MAX = 3` |
| Server pattern | lot-size/route.ts:49,77 | `readLotSizeSettings(pool)` … `limit: settings.per_day` |
| Reader shape | lot-map.ts:62-68,71-87 | seed bounds at load; `WHERE variable_key = ANY($1::text[])`; throws |
| Phone pattern, end to end | seed :10867 → descriptor config.lookup_retry_max → emit-mobile-surfaces.mjs:37 PAGE_SETTINGS, :47-64 → slice bounds → useParcelLookup.ts:19,55 | `sliceNumber(searchSlice, 'lookup_retry_max')` |
| Seed row form | logic_variables.json:10867-10877 | `"default": 3, "type": "number", "min": 0, "max": 10, … "admin": {"group": "Parcel Lookup"}` |
| Loader | migrate.js:321-331; apply-logic-variables.js:66-81 | `ON CONFLICT (variable_key) DO NOTHING`; `--only` skips the loader (:23, :326) |
| Ruling | MD:1494 | "yes follow the rules register them." |
| Rule | Spec 128:30 Rule 3 | "every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an `on_invalid` posture" |
| Seed is the one source | scripts/CLAUDE.md:41 | "single source of truth … `scripts/seeds/logic_variables.json`"; Spec 86 (system map :111) |
| N1 ruling | GROUNDER-QUESTIONS.md:52 | "MD:1494 … 'All tunables are data; zero thresholds in src/'" |
| Bounds ruling | GQ :64 (Q13) | "The bounds are engineering envelopes (RR-0192)." |
| L4 | g3 GROUNDER-D.md:100-103 | "emit-mobile-surfaces.mjs:51 requires an entry for any number" |
| L6 | g3 GROUNDER-F.md:103-104 | "`logInfo(TAG, 'parcel entitlement', { uid: ctx.uid, duration_ms })`" |
| L8 | GROUNDER-F.md:114-117 | ":44 '(or on_invalid differs from the row)' … sliceConfig.ts:4 'copied from its seed row' is also wrong" |
| X3 | g3 GROUNDER-E.md:84-88 | "add `expect(JSON.stringify(r.body)).not.toContain('db down')`" |
| D3 | g2 GROUNDER-B.md:69-72 | "replace the sentence with 'No DB mirror row is owed …'" |
| K3 | g2 GROUNDER-A.md:77 | "cite MD:738 … wrong (decision-37, RR-0167)"; also report-projection-settings.logic.test.ts:3 (task-372 note :67) |
| S2 | GQ :84 | "Default is label the settings truthfully." |
| The panel reads descriptions from the DB | control-panel.ts:358-367 | `SELECT variable_key, … description` |
| Existing "types no number" scans | fix-tune.logic.test.ts:51-59, :95-100; surface-conformance.logic.test.ts:1106-1107 | `not.toMatch(/60_?000/)` |
| Key pins | control-panel.logic.test.ts:72-853 (EXPECTED_LOGIC_VAR_KEYS); surface-conformance :1018, :1074-1081 (eight keys from now on); programme-items.json "0 of 1091" | |
| 500 body is fixed | error-mapping.ts:80-85 | `'An unexpected error occurred'` |
| Unlisted mocks break | customer-report-read:31-34,97; parcels-lookup-page:21-24,72; search-routing:31-44,190; search-parser-guard:20-30; parcel-lookup-resolution:12 | `unexpected … query` / mocks with no `query` |

### (B) PLAN

**Stage (i): the lane builds and commits. No database.**

**Step 1. Seed rows** (scripts/seeds/logic_variables.json, all `"type": "number"`, group "Parcel Lookup")

| Key | Default | Bounds | Posture |
|---|---|---|---|
| parcel_lookup_search_per_min | 60 | 1–600 | fail |
| parcel_lookup_detail_per_min | 30 | 1–300 | fail |
| parcel_entitlement_read_per_min | 30 | 1–300 | fail |
| parcel_lookup_slow_query_ms | 500 | 50–10000 | fail |
| maxbld_page_candidate_cap | 10 | 10–50 | fail |
| maxbld_page_recent_max | 3 | 0–10 | clamp |

- Each description follows the :10871 form: "task-454 (MD:1494; Spec 128 Rule 3)", the source of the value, then "NO SOURCE for the range", the posture and CONSUMED-by.
- The cap's max of 50 is the response-size envelope of parcel_map_neighbour_limit. The min is 10, not 2 (plan-ux#4): the typeahead and mistyped-street reads have no overflow probe, measured safe for 10 only (parcel-lookup.ts:410), so a lower cap would cut a list with no warning.
- recent_max 0 turns the chips off: the store keeps none, because its write path slices at the setting (recentSearchesStore.ts:55). Posture: the five server keys are read by the reader, which throws on a bad value, and their contract entries say fail; candidate_cap is also read by the phone and is fail there too (the generator refuses a descriptor value outside the row, so no throw can arise); recent_max is phone-only and clamps like the six existing page settings. The control panel does not check a typed value against the range (GlobalConfigCard.tsx:67-69), so a value outside it makes the lookup routes return 500 until corrected; each description says so (question 3).
- The candidate cap says: "the server reads it at every lookup; the phone takes it at the next app build".
- S2: the six existing maxbld_page_* descriptions and recent_max add "Takes effect at the next app build".
- D3/K3: replace the sentences at :8197 and :8207. The MD:738 cite becomes "ONE-13 a (MD:738); the 50 and 5,000 words: backlog/decisions/decision-37 (RR-0167)". Make the same cite fix in report-projection-settings.logic.test.ts:3. Remove the "owed" text at control-panel.logic.test.ts:268.

**Step 2. Tests first, each proven red:**
- control-panel: add the six keys to EXPECTED_LOGIC_VAR_KEYS (red: the keys are missing).
- surface-conformance C-10:
  - KEYS becomes eight; the seed rows and bounds are pinned.
  - New `it`, copying :1106: the comment-stripped lookup route, entitlement route, admin lookup route, parcel-lookup.ts, SearchBinding.tsx, parcelSearch.ts and the store match none of `/LIMIT_PER_MIN|SLOW_QUERY_MS|limit:\s*\d|LIMIT 1[01]\b|slice\(0, 10\)|[>=]=? 10\b|SEARCH_CANDIDATE_LIMIT\s*=\s*\d|SEARCH_RECENT_MAX/`, and each contains what it must: the three routes `readSearchSettings(pool)`, parcel-lookup.ts `readSearchSettings` and `UNLINKED_PROBE_ROWS`, SearchBinding.tsx `sliceNumber(SEARCH_SLICE, 'candidate_cap')`, the store `sliceNumber(searchSlice, 'recent_max')` (red today). No identifier may hold LIMIT_PER_MIN or SLOW_QUERY_MS (the setting fields are search_per_min and so on). This scan sees named forms only; the lock for AC#1 'the code types the number' is the non-default value tests below. A literal scan of 60, 30 or 500 is not used because RATE_WINDOW_SEC = 60 stays typed (route.ts:58).
  - L4: `pageSettingBounds({debounce_ms:0,min_query_len:0},[],{})` gives no problems; an `entitlement_stale_ms` of 0 with no entry is still a problem. AC#2 says emitted: buildOutputs on the L8 tmp copy with debounce_ms 0 in its descriptor writes a slice with config.debounce_ms 0 and no bounds.debounce_ms (emit :90 keeps any defined value). A 0 with no bounds entry suits a descriptor no phone binding reads, since sliceNumber throws for it (sliceConfig.ts:18).
  - L8: in a tmp copy of the slice dir, `writeOutputs(root)` removes a stray `x.json` and leaves a README.md in that dir, a golden copy and every owned slice (the unlink takes only what checkOutputs lists as GEN-STRAY, emit :125-128).
  - S2: the descriptions match /next app build/.
- gate test: add `.not.toContain('db down')` / `'insert failed'` after :168, :286, :462 and :530; entitlement test after :95. These pass on arrival. Red proof: mutate internalError to echo `cause.message`, run, then revert. Record it in the lane report folder (docs/reports/lanes/ is always allowed by the Files check; docs/reports/red-evidence/ matches no row of the rule table, so the Files line cannot name it).
- entitlement test L6: capture logInfo. Expect `('[api/parcel-entitlement]', 'parcel entitlement', {uid: UID, duration_ms: any(Number)})` (red).
- Lookup and entitlement tests: a missing settings row, or one outside its bounds, gives 500 with no data and no database text (red). The gate, page, customer-report-read and entitlement pool scripts answer the settings query by its text (one new case each; their mocks export no `query`).
- Value tests with non-default rows (rg#2): the gate test's pool answers search 7, detail 8, slow query 50, cap 4. It expects withRateLimit called with key parcels-search:UID, limit 7, windowSec 60 for a q request and parcels-lookup:UID, limit 8 for a parcelId request, resolveAddress called with candidateCap 4, and, with Date.now stepped 60 ms, the slow_query warning logged. The entitlement test answers 9 and expects limit 9, windowSec 60. All red today. consumer-parcel-lookup.infra.test.ts:76-81 keeps the two bucket keys and drops the two number regexes (rg#1; a control, green before and after).
- Resolver tests (in#2, rg#4): every resolveAddress call passes { candidateCap: 10 } (a local wrapper is fine), the two db tests too; parcel-lookup-resolution:140 `/LIMIT 11/` becomes a check that the bound parameter is cap+1; search-routing:190 `toContain('LIMIT 10')` becomes `LIMIT $` plus the cap parameter; a new case with cap 4 reads 5 rows, lists 4 and sets truncated; search-parser-guard:181, :187 and :254 keep their rows at cap 10. Each is red today (the SQL text still says LIMIT 10 or 11).
- Mobile and conformance (in#4, rc#7, deepseek#6): git grep of SEARCH_CANDIDATE_LIMIT and SEARCH_RECENT_MAX over mobile, src, docs/specs and scripts at the head finds only these readers: SearchBinding.tsx:24,39, index.tsx:79 (through SearchBinding), the store :11,:55, parcelScreens.golden.test.ts:15,:200, parcelSearchMatch.test.ts:36,:67,:343-346, recentSearchesStore.test.ts:36-37, Spec 99:175, and the test-owned string at src/tests/surfaces/parcel-legacy-oracle.logic.test.ts:22 (no import). Both mobile test files import the cap from '@/constants/parcelSearch' today and move to SearchBinding; parcelSearchMatch.test.ts:67 toBe(10) and recentSearchesStore.test.ts:37 toBe(3) read the slice; parcelScreens.golden.test.ts:212 (SEARCH_SLICE.config toEqual) gains candidate_cap 10 and recent_max 3; surface-conformance:1103-1104 (the config and bounds toEqual, titled 'unchanged') gain the two keys with bounds 10-50 fail and 0-10 clamp and the title is renamed (red today). A phone value test (slice mocked with recent_max 2) expects the store to keep 2 (red today).

**Step 3. Server code:**
- One reader shape (in#3, rc#5): in parcel-lookup.ts add `SEARCH_SETTING_KEYS` (the five server keys) and `readSearchSettings(db: Queryable)` in the readLotSizeSettings shape (lot-size-entry.ts:73), not the lot-map.ts global `query` helper. It reads through db.query, so the routes pass pool and the existing pool-only test mocks work. One ANY statement; seed bounds from a boundsOf that throws and uses no non-null bang (lot-size-entry.ts:62-67; non-null-assertion-comment.logic.test.ts:67 pins 11 in this file); an integer inside its bounds, else throw `SearchSettingsError` naming the keys. One read per request; every caller below passes its result in.
- `resolveAddress` takes candidateCap as a required member of its opts object (the `= {}` default goes; no default number) and reads nothing itself, so the dotted-query re-entry (:334) adds no read and the queue-style resolver mocks keep their order. Callers: lookup-flow.ts:43 (its input gains the cap) and the admin route (:59). `readExact(num, streetName, cap)` binds `LIMIT $3` to cap+1 (it also serves the letter and dash fallback); the typeahead (:388) and mistyped-street (:456) reads bind `LIMIT $3` to cap; the `> 10` (:345), `>= 10` (:393) and `slice(0, 10)` (:365, :472) checks use the cap. Bound parameters only, never `${cap}` text: src-sql-ledger parses these statements. The unlinked read (:426) is not the cap (in#5, rc#1): its rows only decide whether one address is printed (:429-431), so it becomes the named constant `UNLINKED_PROBE_ROWS = 11`, bound as `LIMIT $3`, with a comment that it is a probe window and not a setting: no new setting without a ruling (RR-0392, MORNING-DECISIONS.md:1975), Spec 128:30 names debounce, page size, stale time and rate limit, and MD:1476 lets the grounder resolve it compliantly. The scan above does not match the constant.
- The lookup route calls `readSearchSettings(pool)` once, after the parse and before the rate limit (401 and 403 stay first), replacing :57, :59 and :60, and passes settings.candidate_cap to `runLookupFlow`. It sits before the limiter because the limiter's number comes from it; two pool reads already precede the limiter (getCurrentUserContext :64, parcelToolAccess :72), so the limiter never bounded database work and no cache or second path is added (error-paths#1, security#1; RR-0392). RATE_WINDOW_SEC 60 stays, as lot-size's "a day" was ruled (GROUNDER-A D1 "Not included"). The admin route (admin/parcels/lookup/route.ts) reads the same settings once, inside its try: the cap into resolveAddress and slow_query_ms for its mark (:33, :96), so the typed 500 does not live twice (in#9); its contract descriptor (answer none today) and census entry then declare candidate_cap and slow_query_ms.
- The entitlement route does the same for its limit (after auth, before the limiter). It adds `TAG`, `t0` and the success logInfo (lot-size/route.ts:43-45 shape). contract_parcels_entitlement declares parcel_entitlement_read_per_min beside its two report limits and its census entry is copied to match (search-reports-left.logic.test.ts:140 pins them byte-equal).
- Fix the header comments: lookup :21, entitlement :11, parcelSearch.ts:30-35.

**Step 4. Phone code:**
- surface.schema.json gains `candidate_cap` and `recent_max`. Each gets an allOf rule with the continue_wait_ms form (:2762).
- PAGE_SETTINGS gains `candidate_cap: 'maxbld_page_candidate_cap'` and `recent_max: 'maxbld_page_recent_max'`.
- The search descriptor gains the config values and the logic_variables entries.
- SearchBinding: `export const SEARCH_CANDIDATE_LIMIT = sliceNumber(SEARCH_SLICE, 'candidate_cap')`.
- The store: `sliceNumber(searchSlice, 'recent_max')`, as at useParcelLookup.ts:19,55.
- Delete parcelSearch.ts:17-28 as the last edit of this step, after every reader above has moved. The constants file must stay import-free (surface-conformance :735).

**Step 5. Generator:**
- L4: the entry check (now at emit :55; the :51 moved) skips `v < ENTRY_FROM[k]`. ENTRY_FROM is read once from the schema's allOf `if.properties[k].minimum`, giving 1 for debounce and min length and 0 for the others. The skip comes from schema data, not a list of key names; a key whose rule has no minimum gets 0, so its entry stays required for every number, 0 included (error-paths#6).
- L8: export `writeOutputs(root)`, which writes and then unlinks GEN-STRAY files (fs.rmSync with force, so a file already gone is not an error: error-paths#4). Fix the comments at :11, :44 and sliceConfig.ts:4: min and max come from the seed row, on_invalid from the descriptor entry (emit :61).
- Contract: contract_parcels_lookup config.why and logic_variables gain its four server keys (search, detail, slow query, cap; on_invalid fail) and its why drops 'not yet registered'; the entitlement and admin contracts declare theirs (Step 3). The census entries (census/contracts.json, census/mobile-product.json) are hand-kept mirrors, byte-equal to their descriptors (surface-conformance :972, search-reports-left :140): copy each descriptor edit by hand. The search descriptor's guards.rate_bucket prose '60/min' states the default and stays.

**Step 6. Regenerate with the existing --write tools, then run --check:**
- `npm run logic-var-groups`: add the keys to GROUP_ORDER in the generator, as task-395 did at :1318, appended at the end of the Parcel Lookup list (migration-307-parcel-map.infra.test.ts:36 reads its first keys). The generator throws on an unlisted key, so this edit cannot be skipped; scripts/generate-logic-variable-groups.mjs matches no row of the rule table, so the launch gate refuses it on the Files line until the row exists (question 2).
- `npm run logic-vars-docs`.
- emit-mobile-surfaces --write.
- src-sql-ledger --write.
- The census by hand (Step 5); the .d.ts by `node scripts/violations/generate-surface-registry.mjs --emit-descriptors` (the schema changed); then the registry page and report-fields through their pre-commit --check lines.
- Restamp with `node_modules/.bin/tsx --tsconfig mobile/tsconfig.json scripts/surfaces/search-golden-capture.ts --write`, then emit-mobile-surfaces --write (search-golden-capture.ts:11-12). Then compare every golden against the board base in the task-395 form (red-evidence/task-395/restamp-fingerprint-only.txt) and write the same file in the lane report folder: the lane commits only if every change is fingerprint-only; any other golden change stops it.
- Then every pre-commit check (.husky/pre-commit:20-45), both suites, and the mobile jest. If a --check names a generated file that is not on the Files line, the lane stops and tells the orchestrator to amend the line; it adds nothing silently. The unmerged branch wf1/inc1b-gates (76fab5e70) adds one seed row, gate_unit_factor_tolerance, to the same seed file and edits logic-variables-registry.md and maxbld-report-field-inventory.json: if it lands first, rebase and rerun this step (the 1091 and 1097 counts move by one).

**Step 7. Commit:** one commit with `Task: task-454` and `Spec-diff:` trailers, the task file and queue row in the same commit, and a dated note on task-372 through the backlog CLI. The Files line of the card was rewritten in round 1 (it is the planner's reading of the card, in#1; DoD 8 is met by naming each addition in (C)) and this commit changes no path outside it. Spec 99:175 and Spec 100:47 each get a dated note, prior text kept: the cap and the recent-search count are registered settings (defaults 10 and 3, the range is the registered one), and the phone takes a change at the next app build (in#7, rg#3).

**Stage (ii): test-stack rehearsal.** Spec 08:530 MCINC-7. The orchestrator's DB lane runs it; a build lane never does. It runs on the lane's committed tree, pinned by sha first: a seed that lacks the six keys makes c2 insert nothing (deepseek#14).
- Copy dbjobs/MF19-324: c1-c4, r-restore, seedcheck.cjs, rehearse.zsh, with `JOB_TARGET=teststack`.
- c1 prints, for the six new keys and the eight older rows (the six maxbld_page_* and the two task-372 rows), present or absent with the value, and refuses a present new row outside its bounds (deepseek#4). Before c2, git show of the pinned seed must hold all six keys (a grep count of 6).
- c2 inserts only the six new rows: the loader's exported function called with a six-key seeds argument and the same ON CONFLICT DO NOTHING (apply-logic-variables.js:55 signature, :96-107 standalone form), from the pinned tree. It is not `migrate.js --only`, which skips the loader (:23), and not the whole-seed run, which would insert every other missing seed key on the target (this settles the planner's question 3).
- c3 runs `seedcheck.cjs` on the six keys and compares each row's value with the intended default and the seed min and max, stopping on any mismatch before the operator's GO: DO NOTHING keeps a wrong row silently (apply-logic-variables.js:13; error-paths#3).
- r-restore deletes only the keys c1 found absent. Run it once on the stack after c3 to prove the undo. The stack then lacks the rows again, so any run of the new routes against it (McTest, the phone) needs them seeded first.
- Set `RG_BRANCH=origin/wf2/board`; the gate defaults to mb-rulings (:9).
- Run the hooks on the captures, then write REHEARSAL.pass.
- No seed-only job exists yet: c2 above is the one changed block, the rest is the existing form.

**Stage (iii): the dev apply.** It waits for the operator's own typed GO naming the six keys: `export JOB_TARGET=dev GO='OPERATOR-GO SEARCH-454'`, then c1 to c4. The undo is r-restore under the same GO, after a STOP (deepseek#1). The apply never edits an existing row: if c1 finds the eight older rows already on dev, their descriptions keep the old text there (the card rules out a migration file, RR-0392) and the dev panel wording is owed to a later card (plan-ux#3).

**Stage (iv): the push.** The operator's own y, after Stage (iii).

### (C) FILES (the complete list is the Files line of the Description, rewritten in round 1; these groups say why each entry is there)

- **Production code:** src/app/api/parcels/lookup/route.ts, entitlement/route.ts, src/lib/admin/parcel-lookup.ts, mobile/src/components/surfaces/SearchBinding.tsx (the cap read), recentSearchesStore.ts, scripts/surfaces/_schema/surface.schema.json (config is closed, :2512).
- **Generated:** src/lib/surfaces/generated/surface-descriptor.d.ts, scripts/surfaces/_schema/census/mobile-product.json, census/contracts.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, docs/reports/generated/127-surface-registry.md, docs/reference/maxbld-report-field-inventory.{md,json} (the seed sha), scripts/generate-logic-variable-groups.mjs, src/features/admin-controls/generated/logic-variable-groups.json, scripts/steps/_schema/programme-items.json (1091 to 1097), scripts/steps/_schema/src-sql-ledger.json, src/tests/fixtures/surfaces/mobile_parcel_search/*.json (22), mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json.
- **Tests:** src/tests/report-projection-settings.logic.test.ts (K3), customer-report-read.logic.test.ts, parcels-lookup-page.logic.test.ts, search-routing.logic.test.ts, search-parser-guard.logic.test.ts, parcel-lookup-resolution.logic.test.ts (mocks and call indexes), mobile/__tests__/recentSearchesStore.test.ts, parcelSearchMatch.test.ts, parcelScreens.golden.test.ts.
- **Added in round 1:** src/app/api/admin/parcels/lookup/route.ts and src/lib/parcels/lookup-flow.ts (the cap argument), the entitlement and admin contract descriptors, consumer-parcel-lookup.infra.test.ts and the two db tests that call resolveAddress, Spec 99 and Spec 100 (dated notes) and the task-372 file (the dated note). Red evidence goes in the lane report folder, not on the Files line.

### Collisions with task-456

- **customer-report-read.logic.test.ts is in both Files lines.** task-454 edits its db/client mock at :31-34; task-456 edits its builders at :77-78.
- **The new parcel-routes.security test reaches the changed routes.** Its "ignores a uid" cases go past auth and will hit `readSearchSettings`.
- **Recommendation: task-454 lands first, then task-456** (or task-456 rebases onto it). Low risk: the src-sql-ledger.mjs change (exit code only) and sliceConfig.ts (task-454 changes a comment only). Ruled in round 1: 454 lands first, as task-456's own file says (its order line and its dependency on TASK-454). With the one reader shape, readSearchSettings(pool) with the cap passed in, task-456's step 7 pool mocks answer the settings query by its text, as the three 454 test files do; they copy those mocks as 454 leaves them.

### (D) OPERATOR QUESTIONS

1. **Push before the dev apply?** Recommended: hold the push until Stage (iii) has run, unless he confirms no dev app runs this branch; the routes return 500 without the rows, the detail path included (rc#4). Rule: "simple and easy turning stuff off" and no exception paths, so there is no seed fallback.
2. **The rule table has no row for generator scripts.** scripts/generate-logic-variable-groups.mjs must change (its GROUP_ORDER throws on an unlisted key) but matches no row of scripts/analysis/rule-lists.json (the table covers scripts/*.js, not .mjs), so the launch gate refuses a Files line that names it (rule-lists.mjs:267). Recommended: one small card adds scripts/generate-*.mjs to a row before this card launches; the alternative, rows hidden from the panel, defeats the point of the settings. Default while unanswered: this card waits for that card. The 11-row window of the unlinked read is ruled in Step 3 and is no question; the dev description wording is settled in Stage (iii).
3. **The panel range check.** The control panel does not check a typed value against the range, so a value outside it makes search return an error until corrected: leave the check to a later card (recommended) or add it here? Default while unanswered: not in this card (RR-0392). The planner's old item 3 (the apply inserting every missing seed key) is settled in Stage (ii) c2: only the six rows are inserted.

### (E) UNVERIFIED

- Whether the dev database already has the task-395 and task-372 rows. No database connection was made.
- Whether any dev app runs wf2/board.
- Settled in round 1, no longer open: the golden restamp command (search-golden-capture.ts:11), Spec 99:175 (a dated note), the rate_bucket prose (it states the default and stays), the entitlement contract (declares its key) and :426 (a probe window, not the cap). The variable-effect gate lists only unread keys and the new keys are read, so no badge change is expected; the pre-commit --check proves it.
- The exact index shifts in search-routing.logic.test.ts:186-190.
- The exact backlog CLI command for the task-372 note.
- Settled: the board head read in round 1 is ece69a003, then f7876ca80 (a task-463 file only).

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/admin/parcel-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/app/api/parcels/lookup/route.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/emit-mobile-surfaces.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/seeds/logic_variables.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/surfaces/surface-conformance.logic.test.ts

Plan review round 1: 39 folded, 0 task, 0 ruling, 0 wontfix, 0 pile; grounder docs/reports/reviews/task-454/GROUNDER-PLAN.md; triage docs/reports/reviews/task-454/TRIAGE-PLAN.md
plan-error-paths#3 MED folded each row's value wit
plan-error-paths#4 MED folded so a file already go
plan-error-paths#5 MED folded its rows only decide
plan-plan-review-deepseek#1 MED folded The undo is r-restor
plan-plan-review-deepseek#2 MED folded order is fixed: Stag
plan-plan-review-deepseek#3 MED folded leaves a README.md i
plan-plan-review-deepseek#4 MED folded refuses a present ne
plan-plan-review-deepseek#6 MED folded finds only these rea
plan-plan-review-deepseek#8 MED folded a slice with config.
plan-plan-review-deepseek#9 MED folded This scan sees named
plan-plan-review-deepseek#12 MED folded makes the lookup rou
plan-plan-review-deepseek#13 MED folded the lane commits onl
plan-plan-review-deepseek#14 MED folded a seed that lacks th
plan-ux#2 MED folded Behaviour before the
plan-ux#3 MED folded the dev panel wordin
in#1 HIGH folded docs/specs/03-mobile
in#2 HIGH folded takes candidateCap a
in#3 HIGH folded so the routes pass p
in#4 HIGH folded the title is renamed
in#5 MED folded its rows only decide
in#6 MED folded copy each descriptor
in#7 MED folded Spec 99:175 and Spec
rc#1 MED folded its rows only decide
rc#2 MED folded SearchBinding.tsx, p
rc#3 MED folded which today shows nu
rc#4 MED folded on both the q and th
rg#1 HIGH folded keeps the two bucket
rg#2 MED folded Value tests with non
rg#3 MED folded the phone takes a ch
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25 taken on the board at lane launch (lane BL-SFX6B, worktree /Users/brettpreston_macmini/Buildo-wt-sfx6b, branch wf2/sfx6b), RR-0240

2026-11-25 stage (i) build, lane BL-SFX6B: tests written first (Step 2 of PLAN-454-v1); the red proof is a commit attempt with only the test files and this task file staged, the code still at the board head (red.out in the lane report folder).

2026-11-25 stage (i) work commit, lane BL-SFX6B (no database connection). Built PLAN-454-v1 Steps 1-7. Deviations, each named: (1) the lookup route imports readSearchSettings through src/lib/parcels/lookup-flow.ts (a re-export), because consumer-parcel-lookup.infra.test.ts:36 locks that the route imports nothing from @/lib/admin/parcel-lookup (Standard 10.3); the entitlement and admin routes import it from parcel-lookup.ts. (2) The test pool mocks tell the settings read by its bound keys, not by its statement text: the ANY statement text is shared with lot-map.ts, entitlements and lot-size-entry. (3) The admin contract declares its two keys in config only; its inputs.tables does not add logic_variables, because that moves docs/reports/generated/127-surface-review-queue.md, which is not on the Files line (reported to the orchestrator; nothing added silently). (4) Red for the no-database-text checks (X3): internalError planted to echo cause.message, the gate and entitlement tests failed on it (red-x3-plant.out), then reverted; the thrown gate read case fails at the envelope, not internalError, so that one assertion was not turned red by the plant. The strict-parse 500 case checks the parse key 'leaked' (its error text), not 'db down'. (5) Mobile jest red and green are UNVERIFIED here: the pre-commit related run reaches src/ and scripts/ only; mobile typecheck is clean. (6) The task-372 dated note is its own commit (one task file per code commit). (7) Each route catches the settings throw with internalError before its main try (the read sits before the limiter); the admin route reads inside its try as planned. Golden restamp: 12 files, fingerprint-only (restamp-fingerprint-only.txt).

2026-11-25 Files-line amendment (plan grounder Cairn-Ground-P454, ruling of 2026-11-25, ~/Buildo-scratch/lanes-20261125/BL-SFX6B/pg-ruling2/RULING-FILES-LINE.md; relayed by the orchestrator): the first work commit was refused by 'rule-lists: docs/reports/generated/rule-lists-by-kind.md is out of date' (Spec 99 is the rule list mobile-99). Ruling 1: the Files line gains docs/reports/generated/rule-lists-by-kind.md, regenerated in the work commit, and the Spec 99 dated note is replaced by the grounder's 96-character note so mobile-99 stays 1 part (page after --write: mobile-99 84,550 | 1; total 216,647 | 9). Ruling 2: the admin contract's inputs.tables names logic_variables (the sibling contracts' shape; Spec 127:33), inputs.why and data_story now say 6 tables, census mirror byte-equal; the Files line gains docs/reports/generated/127-surface-review-queue.md, which that edit regenerates. The Files line was changed through backlog task edit --description (whole Description, only the two paths appended). The four deviations above were ruled compliant.

2026-11-25 second work-commit attempt refused by the related run (green.out kept as green-attempt2.out): (a) the gate value test used cap 4, outside the cap's own bounds 10 to 50 (PLAN Step 1), so the route answered 500 before the limiter; the route value test now uses cap 12 (the resolver test keeps cap 4, which it passes directly); (b) SV-SCREEN found the 11 web goldens of mobile_parcel_search fingerprint-stale (the plan named 22 fixture files; the phone capture rewrote only the 11 mobile ones): restamped with the golden builder src/tests/surfaces/surface-goldens.ts (its header: a one-line tsx caller rewrites them), written only for those 11; 23 golden files changed in all, every one fingerprint-only (restamp-fingerprint-only.txt).

2026-11-25 push station on e8043789e (run ~/Buildo-scratch/push-station/runs/e8043789e-20261125-090023/): one failing assertion of 28,379, src/tests/step-conformance.infra.test.ts '§1.2a P4 — every tunable is externalized ... scripts/load-parcels.js': seed parcel_lookup_search_per_min is annotated CONSUMED by parcels (its clause named src/app/api/parcels/lookup/route.ts, and the clause matcher reads the path segment parcels as the step parcels). Plan grounder Cairn-Ground-P454 ruling of 2026-11-25 (~/Buildo-scratch/lanes-20261125/BL-SFX6B/pg-ruling3/RULING-STATION-FAIL.md): reword only the consumer clause of the four server rows (search, detail, entitlement read, slow query), the route path moved inside the parenthesis and the consumer named in words; no descriptor, config or Files-line change. Done in the fix commit with logic-variables-registry.md and the report-field inventory regenerated (the logic-variable groups file is unchanged, --check up to date). Also, from the work commit: the commit-msg McFrontend gate required the trailer McFrontend-Task: MF-35, the one the earlier commits on this surface carry (task-395, task-450).

2026-11-25 push station: FAIL on e8043789e (~/Buildo-scratch/push-station/fail/e8043789edb81e3e3e85cadef2dd00dcc4afe6a6.fail; one failing assertion, step-conformance §1.2a P4, fixed in a6315e3d8); PASS on a6315e3d8 (~/Buildo-scratch/push-station/pass/a6315e3d82cc688ec09df5f9b20af161919364be.pass; output ~/Buildo-scratch/lanes-20261125/station-a6315e3d8.out; 28,379 passed, 0 failed; phone tests, phone typecheck and web typecheck rc=0). The phone jest red/green previously UNVERIFIED is now green at the station.

2026-11-25 output review round 1 (the one code-review lens, DeepSeek, on the whole change 1faff1554..a6315e3d8, split by lens-input into 4 parts; context docs/reports/reviews/task-454/context-r3.md): 17 lines listed in docs/reports/lanes/2026-11-25/BL-SFX6B/FINDINGS.md (as the lens rated them: 1 MED, 11 LOW, 4 NIT, and one line, out-code-review-p1#1, that rates nothing and says the chunk is documentation only). The lane rules none of them: grounder owed.

2026-11-25 close of stage (i), BUILT: the separate output grounder Cairn-Ground-O454 ruled round 1 (17 ids: 8 CONFIRMED, 4 LOW and 4 NIT, all pile; 9 REJECTED; no CRITICAL, HIGH or MED). Still open, not this lane: stage (ii) the test-stack rehearsal, stage (iii) the dev apply on the operator's typed GO, stage (iv) the push; the push is held until the six rows are on dev (RR-0475 item 2).

Implementation Note (3) of the work commit (the admin contract names no logic_variables table in inputs.tables) is superseded by the plan grounder's ruling 2 (pg-ruling2/RULING-FILES-LINE.md): the diff does name it (contract_admin_parcels_lookup inputs.tables, 6 tables, census mirror byte-equal).

2026-11-25 landing: fold 908b0252e on wf2/board (station PASS ~/Buildo-scratch/push-station/pass/908b0252ea1001cb547ef7a77680f9af60726ae2.pass); six rows applied to the local test stack (teststack-seed-454-20261125.out); dev rows applied by the operator (RR-0484, MORNING-DECISIONS.md:2529; operator 'I ran it', :2533); pushed by the operator, origin wf1/mb-rulings = 908b0252e; Mobile CI run 45663102940 result as printed by gh run view on this date.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Stage (i) landed on wf2/sfx6b: work commit 42b4b7932 (73 files; pre-commit related run 474 passed), the task-372 dated note e8043789e, the station fix a6315e3d8 (the consumer clause of four seed descriptions names the route in words). What landed: six seed rows with bounds (parcel_lookup_search_per_min 60, parcel_lookup_detail_per_min 30, parcel_entitlement_read_per_min 30, parcel_lookup_slow_query_ms 500, maxbld_page_candidate_cap 10, maxbld_page_recent_max 3; values unchanged); one server reader readSearchSettings (src/lib/admin/parcel-lookup.ts) read once per request by the lookup, entitlement and admin routes, failing closed with the generic 500; resolveAddress takes the cap as bound parameters; the phone slice keys candidate_cap and recent_max (SearchBinding.tsx, recentSearchesStore.ts through sliceNumber); the generator emits a schema-allowed 0 and --write removes stray files; the entitlement route logs success with uid and duration; the 500 bodies are tested free of database text. Push station PASS on a6315e3d8: 28,379 passed, 0 failed (phone tests and both typechecks rc 0). Evidence: docs/reports/lanes/2026-11-25/BL-SFX6B/ (red.out, red-x3-plant.out, restamp-fingerprint-only.txt, green.out). Open: stages (ii) rehearsal, (iii) dev apply on the operator typed GO, (iv) push, held until the rows are on dev (RR-0475 item 2).

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 8 pile; grounder docs/reports/lanes/2026-11-25/BL-SFX6B/GROUNDER.md; triage docs/reports/lanes/2026-11-25/BL-SFX6B/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
