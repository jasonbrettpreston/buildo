# Review context for task-454 (no plan id) written 2026-11-25 by backlog-brief.mjs (round 3)

## Task
task-454 SEARCHFIX.6 Search settings: the typed-in limits become registered settings; emitter, log and test fixes (needs the operator's typed GO to apply on dev)
status: RUNNING · milestone: m-1 · assignee: @lane-BL-SFX6B · labels: SEARCHFIX-LATER

## Description
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 4 (FIX.SEARCH-SETTINGS); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the limits typed into the code (60, 30 and 30 a minute; the 500 ms slow-query mark; the cap of 10; 3 recent searches) become registered settings with bounds (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1494 "register them"). The generator emits a setting of 0; the entitlement route logs success; the error tests check that no database text leaks; stale wording corrected. No customer effect once the rows are on the database: the limits keep today's values as their defaults. Before that, search, the entitlement read and the admin lookup return an error, so the dev apply comes before the push (plan, behaviour before the rows exist).

Findings folded: N1, Q1, L4, L6, L8, X3, G2 D3, G2 K3, seat S2.

DB: no migration file; the seed loader inserts the rows at the next migrate. Rehearsed on the test stack first; running on dev is the operator's own typed GO.

Runs after SEARCHFIX.1 to .4 (shared lookup file, search slice and descriptor). Dated note owed: task-372.

Files: scripts/seeds/logic_variables.json, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/entitlement/route.ts, src/app/api/admin/parcels/lookup/route.ts, src/lib/admin/parcel-lookup.ts, src/lib/parcels/lookup-flow.ts, mobile/src/constants/parcelSearch.ts, mobile/src/store/recentSearchesStore.ts, mobile/src/components/surfaces/SearchBinding.tsx, scripts/surfaces/emit-mobile-surfaces.mjs, mobile/src/lib/sliceConfig.ts, scripts/surfaces/_schema/surface.schema.json, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json, scripts/surfaces/parcel_admin/F08/contracts/contract_admin_parcels_lookup.descriptor.json, scripts/surfaces/_schema/census/mobile-product.json, scripts/surfaces/_schema/census/contracts.json, src/lib/surfaces/generated/surface-descriptor.d.ts, mobile/src/generated/surfaces/mobile_parcel_search.json, docs/reports/generated/127-surface-registry.md, docs/reference/logic-variables-registry.md, docs/reference/maxbld-report-field-inventory.md, docs/reference/maxbld-report-field-inventory.json, scripts/generate-logic-variable-groups.mjs, src/features/admin-controls/generated/logic-variable-groups.json, scripts/steps/_schema/programme-items.json, scripts/steps/_schema/src-sql-ledger.json, src/tests/fixtures/surfaces/mobile_parcel_search/*.json, mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json, docs/specs/03-mobile/99_mobile_state_architecture.md, docs/specs/03-mobile/100_mobile_parcel_cost_tool.md, backlog/tasks/task-372*, src/tests/control-panel.logic.test.ts, src/tests/parcel-lookup-gate.infra.test.ts, src/tests/parcels-entitlement.infra.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts, src/tests/report-projection-settings.logic.test.ts, src/tests/customer-report-read.logic.test.ts, src/tests/parcels-lookup-page.logic.test.ts, src/tests/search-routing.logic.test.ts, src/tests/search-parser-guard.logic.test.ts, src/tests/parcel-lookup-resolution.logic.test.ts, src/tests/consumer-parcel-lookup.infra.test.ts, src/tests/db/parcel-lookup.db.test.ts, src/tests/db/consumer-parcel-lookup.db.test.ts, mobile/__tests__/recentSearchesStore.test.ts, mobile/__tests__/parcelSearchMatch.test.ts, mobile/__tests__/parcelScreens.golden.test.ts, docs/reports/generated/rule-lists-by-kind.md, docs/reports/generated/127-surface-review-queue.md

## Acceptance criteria
- #1 The six limits are seed rows with bounds, the code reads them, and a test fails when the code types the number
- #2 A setting of 0 that the schema allows is emitted
- #3 The entitlement route logs success with uid and duration
- #4 The 500 bodies contain no database text

## Implementation Plan
Planner: Cairn-Plan-454
Plan id: PLAN-454-v1

Read at the board head (wf2/board), after tasks 449 to 452 were pushed at 9fedd48cb. The planner wrote nothing, ran no test and used no database.

I only read files. Nothing was written, no tests were run and no database was touched.

**Answer to item 4 first.** The new reader throws when a row is missing, not a whole number or outside its seed bounds (the lot-map.ts:78-86 form; lot-size-entry.ts:91-96 throws only when its switch is on). Behaviour before the rows exist, read from the code (rc#3, rc#4, plan-ux#2): the lookup route returns the generic 500 on both the q and the parcelId path (the read comes after the 401, 403 and parse steps and before the limiter), the admin parcel lookup returns it, and the entitlement route, which today shows null counts when the report-limit rows are missing (entitlements/index.ts:655-657), now returns it too. The body is the fixed text 'An unexpected error occurred' (error-mapping.ts:84). The phone is unaffected until the server is: its numbers come from the built slice. Pushing alone deploys nothing: test.yml:34-38 runs on pull requests to main and pushes to main, and apply-migrations.yml:36-38 on manual dispatch only. The order is fixed: Stage (i) builds and commits, Stage (ii) rehearses on the test stack, Stage (iii) is the dev apply on the operator's typed GO, and only then the push, which is his own y (MORNING-DECISIONS.md:1975-1976). An earlier push is possible only if he says no dev app runs this branch (question 1).

#### (A) FACTS

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

#### (B) PLAN

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

#### (C) FILES (the complete list is the Files line of the Description, rewritten in round 1; these groups say why each entry is there)

- **Production code:** src/app/api/parcels/lookup/route.ts, entitlement/route.ts, src/lib/admin/parcel-lookup.ts, mobile/src/components/surfaces/SearchBinding.tsx (the cap read), recentSearchesStore.ts, scripts/surfaces/_schema/surface.schema.json (config is closed, :2512).
- **Generated:** src/lib/surfaces/generated/surface-descriptor.d.ts, scripts/surfaces/_schema/census/mobile-product.json, census/contracts.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, docs/reports/generated/127-surface-registry.md, docs/reference/maxbld-report-field-inventory.{md,json} (the seed sha), scripts/generate-logic-variable-groups.mjs, src/features/admin-controls/generated/logic-variable-groups.json, scripts/steps/_schema/programme-items.json (1091 to 1097), scripts/steps/_schema/src-sql-ledger.json, src/tests/fixtures/surfaces/mobile_parcel_search/*.json (22), mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json.
- **Tests:** src/tests/report-projection-settings.logic.test.ts (K3), customer-report-read.logic.test.ts, parcels-lookup-page.logic.test.ts, search-routing.logic.test.ts, search-parser-guard.logic.test.ts, parcel-lookup-resolution.logic.test.ts (mocks and call indexes), mobile/__tests__/recentSearchesStore.test.ts, parcelSearchMatch.test.ts, parcelScreens.golden.test.ts.
- **Added in round 1:** src/app/api/admin/parcels/lookup/route.ts and src/lib/parcels/lookup-flow.ts (the cap argument), the entitlement and admin contract descriptors, consumer-parcel-lookup.infra.test.ts and the two db tests that call resolveAddress, Spec 99 and Spec 100 (dated notes) and the task-372 file (the dated note). Red evidence goes in the lane report folder, not on the Files line.

#### Collisions with task-456

- **customer-report-read.logic.test.ts is in both Files lines.** task-454 edits its db/client mock at :31-34; task-456 edits its builders at :77-78.
- **The new parcel-routes.security test reaches the changed routes.** Its "ignores a uid" cases go past auth and will hit `readSearchSettings`.
- **Recommendation: task-454 lands first, then task-456** (or task-456 rebases onto it). Low risk: the src-sql-ledger.mjs change (exit code only) and sliceConfig.ts (task-454 changes a comment only). Ruled in round 1: 454 lands first, as task-456's own file says (its order line and its dependency on TASK-454). With the one reader shape, readSearchSettings(pool) with the cap passed in, task-456's step 7 pool mocks answer the settings query by its text, as the three 454 test files do; they copy those mocks as 454 leaves them.

#### (D) OPERATOR QUESTIONS

1. **Push before the dev apply?** Recommended: hold the push until Stage (iii) has run, unless he confirms no dev app runs this branch; the routes return 500 without the rows, the detail path included (rc#4). Rule: "simple and easy turning stuff off" and no exception paths, so there is no seed fallback.
2. **The rule table has no row for generator scripts.** scripts/generate-logic-variable-groups.mjs must change (its GROUP_ORDER throws on an unlisted key) but matches no row of scripts/analysis/rule-lists.json (the table covers scripts/*.js, not .mjs), so the launch gate refuses a Files line that names it (rule-lists.mjs:267). Recommended: one small card adds scripts/generate-*.mjs to a row before this card launches; the alternative, rows hidden from the panel, defeats the point of the settings. Default while unanswered: this card waits for that card. The 11-row window of the unlinked read is ruled in Step 3 and is no question; the dev description wording is settled in Stage (iii).
3. **The panel range check.** The control panel does not check a typed value against the range, so a value outside it makes search return an error until corrected: leave the check to a later card (recommended) or add it here? Default while unanswered: not in this card (RR-0392). The planner's old item 3 (the apply inserting every missing seed key) is settled in Stage (ii) c2: only the six rows are inserted.

#### (E) UNVERIFIED

- Whether the dev database already has the task-395 and task-372 rows. No database connection was made.
- Whether any dev app runs wf2/board.
- Settled in round 1, no longer open: the golden restamp command (search-golden-capture.ts:11), Spec 99:175 (a dated note), the rate_bucket prose (it states the default and stays), the entitlement contract (declares its key) and :426 (a probe window, not the cap). The variable-effect gate lists only unread keys and the new keys are read, so no badge change is expected; the pre-commit --check proves it.
- The exact index shifts in search-routing.logic.test.ts:186-190.
- The exact backlog CLI command for the task-372 note.
- Settled: the board head read in round 1 is ece69a003, then f7876ca80 (a task-463 file only).

#### Critical Files for Implementation
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

## Implementation Notes
2026-11-25 taken on the board at lane launch (lane BL-SFX6B, worktree /Users/brettpreston_macmini/Buildo-wt-sfx6b, branch wf2/sfx6b), RR-0240

2026-11-25 stage (i) build, lane BL-SFX6B: tests written first (Step 2 of PLAN-454-v1); the red proof is a commit attempt with only the test files and this task file staged, the code still at the board head (red.out in the lane report folder).

2026-11-25 stage (i) work commit, lane BL-SFX6B (no database connection). Built PLAN-454-v1 Steps 1-7. Deviations, each named: (1) the lookup route imports readSearchSettings through src/lib/parcels/lookup-flow.ts (a re-export), because consumer-parcel-lookup.infra.test.ts:36 locks that the route imports nothing from @/lib/admin/parcel-lookup (Standard 10.3); the entitlement and admin routes import it from parcel-lookup.ts. (2) The test pool mocks tell the settings read by its bound keys, not by its statement text: the ANY statement text is shared with lot-map.ts, entitlements and lot-size-entry. (3) The admin contract declares its two keys in config only; its inputs.tables does not add logic_variables, because that moves docs/reports/generated/127-surface-review-queue.md, which is not on the Files line (reported to the orchestrator; nothing added silently). (4) Red for the no-database-text checks (X3): internalError planted to echo cause.message, the gate and entitlement tests failed on it (red-x3-plant.out), then reverted; the thrown gate read case fails at the envelope, not internalError, so that one assertion was not turned red by the plant. The strict-parse 500 case checks the parse key 'leaked' (its error text), not 'db down'. (5) Mobile jest red and green are UNVERIFIED here: the pre-commit related run reaches src/ and scripts/ only; mobile typecheck is clean. (6) The task-372 dated note is its own commit (one task file per code commit). (7) Each route catches the settings throw with internalError before its main try (the read sits before the limiter); the admin route reads inside its try as planned. Golden restamp: 12 files, fingerprint-only (restamp-fingerprint-only.txt).

2026-11-25 Files-line amendment (plan grounder Cairn-Ground-P454, ruling of 2026-11-25, ~/Buildo-scratch/lanes-20261125/BL-SFX6B/pg-ruling2/RULING-FILES-LINE.md; relayed by the orchestrator): the first work commit was refused by 'rule-lists: docs/reports/generated/rule-lists-by-kind.md is out of date' (Spec 99 is the rule list mobile-99). Ruling 1: the Files line gains docs/reports/generated/rule-lists-by-kind.md, regenerated in the work commit, and the Spec 99 dated note is replaced by the grounder's 96-character note so mobile-99 stays 1 part (page after --write: mobile-99 84,550 | 1; total 216,647 | 9). Ruling 2: the admin contract's inputs.tables names logic_variables (the sibling contracts' shape; Spec 127:33), inputs.why and data_story now say 6 tables, census mirror byte-equal; the Files line gains docs/reports/generated/127-surface-review-queue.md, which that edit regenerates. The Files line was changed through backlog task edit --description (whole Description, only the two paths appended). The four deviations above were ruled compliant.

2026-11-25 second work-commit attempt refused by the related run (green.out kept as green-attempt2.out): (a) the gate value test used cap 4, outside the cap's own bounds 10 to 50 (PLAN Step 1), so the route answered 500 before the limiter; the route value test now uses cap 12 (the resolver test keeps cap 4, which it passes directly); (b) SV-SCREEN found the 11 web goldens of mobile_parcel_search fingerprint-stale (the plan named 22 fixture files; the phone capture rewrote only the 11 mobile ones): restamped with the golden builder src/tests/surfaces/surface-goldens.ts (its header: a one-line tsx caller rewrites them), written only for those 11; 23 golden files changed in all, every one fingerprint-only (restamp-fingerprint-only.txt).

2026-11-25 push station on e8043789e (run ~/Buildo-scratch/push-station/runs/e8043789e-20261125-090023/): one failing assertion of 28,379, src/tests/step-conformance.infra.test.ts '§1.2a P4 — every tunable is externalized ... scripts/load-parcels.js': seed parcel_lookup_search_per_min is annotated CONSUMED by parcels (its clause named src/app/api/parcels/lookup/route.ts, and the clause matcher reads the path segment parcels as the step parcels). Plan grounder Cairn-Ground-P454 ruling of 2026-11-25 (~/Buildo-scratch/lanes-20261125/BL-SFX6B/pg-ruling3/RULING-STATION-FAIL.md): reword only the consumer clause of the four server rows (search, detail, entitlement read, slow query), the route path moved inside the parenthesis and the consumer named in words; no descriptor, config or Files-line change. Done in the fix commit with logic-variables-registry.md and the report-field inventory regenerated (the logic-variable groups file is unchanged, --check up to date). Also, from the work commit: the commit-msg McFrontend gate required the trailer McFrontend-Task: MF-35, the one the earlier commits on this surface carry (task-395, task-450).

2026-11-25 push station: FAIL on e8043789e (~/Buildo-scratch/push-station/fail/e8043789edb81e3e3e85cadef2dd00dcc4afe6a6.fail; one failing assertion, step-conformance §1.2a P4, fixed in a6315e3d8); PASS on a6315e3d8 (~/Buildo-scratch/push-station/pass/a6315e3d82cc688ec09df5f9b20af161919364be.pass; output ~/Buildo-scratch/lanes-20261125/station-a6315e3d8.out; 28,379 passed, 0 failed; phone tests, phone typecheck and web typecheck rc=0). The phone jest red/green previously UNVERIFIED is now green at the station.

## References
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

## Documents
- (none)

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
- RR-0341 Loading screen gives up after 60 seconds
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
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
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
- RR-0444 fold the McFixReborn findings — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0147 Operator answer NAME-1
- RR-0445 limit and reactivate screens: mobile first, also on the web, follow the earlier process
- RR-0446 several-lots map stays as built; no-plan page joins the limit-screen task
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
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
- RR-0477 phone test now; batching rule adopted
- RR-0152 Increment 1·A re-use and drops
- RR-0478 sign-up allow-list entry confirmed (task-456)
- RR-0479 brief lines and the batching line, without the lane process
- RR-0154 Work pulling
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
- RR-0167 Answer ONE-13 — "ONE-13 a" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738)
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope — "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819)
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
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
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

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped (names RR-0387) — "Approved. You run it.  Let's call this the McFixReborn" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0444 fold the McFixReborn findings (names RR-0444) — "Now we need to fold the findings (1) Valid Compliance finds (2) The reality-check and integration - a) resolve the one gap case b) This was my mistake - we need this built either - maybe call it a subscription upgrade with more report room (this was a gap)." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290)
- RR-0447 clean the board (label dead), review all tasks, then add the search-fix tasks (names RR-0447) — "(1) all tasks that are no longer needed or merged are given the label dead - this should be all McFix labels" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308)
- RR-0448 the search-fix cards are created as 8 merged tasks (names RR-0448) — "8" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2314)
- RR-0475 answers to the six morning questions (names task-454) — "1. y 2.y 3. y but which increment 4. y 5. please explain 6. y" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2481)
- RR-0167 Answer ONE-13 (names RR-0167) — "ONE-13 a" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738)
- RR-0192 Operator oversight scope (names RR-0192) — "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819)

## Prior reviews and lane reports
### task-454 (this task)
- docs/reports/reviews/task-454/FINDINGS-PLAN.md
- docs/reports/reviews/task-454/FOLD-CHECK.md
- docs/reports/reviews/task-454/GROUNDER-PLAN.md
- docs/reports/reviews/task-454/QUESTIONS-RULED.md
- docs/reports/reviews/task-454/TRIAGE-PLAN.md
- docs/reports/reviews/task-454/seat-integration-1.md
- docs/reports/reviews/task-454/seat-reality-check-1.md
- docs/reports/reviews/task-454/seat-regression-1.md
- docs/reports/lanes/2026-11-25/BL-GENROW/REPORT.md (lane report naming task-454)
### task-449 (dependency)
- docs/reports/reviews/task-449/FINDINGS-PLAN.md
- docs/reports/reviews/task-449/FOLD-CHECK.md
- docs/reports/reviews/task-449/GROUNDER-PLAN.md
- docs/reports/reviews/task-449/QUESTIONS-RULED.md
- docs/reports/reviews/task-449/TRIAGE-PLAN.md
- docs/reports/reviews/task-449/seat-integration-1.md
- docs/reports/reviews/task-449/seat-reality-check-1.md
- docs/reports/reviews/task-449/seat-regression-1.md
- docs/reports/lanes/2026-11-24/BL-SFX1/REPORT.md (lane report naming task-449)
- docs/reports/lanes/2026-11-24/BL-SFX3/REPORT.md (lane report naming task-449)
### task-450 (dependency)
- docs/reports/reviews/task-450/FINDINGS-PLAN.md
- docs/reports/reviews/task-450/FOLD-CHECK.md
- docs/reports/reviews/task-450/GROUNDER-PLAN.md
- docs/reports/reviews/task-450/QUESTIONS-RULED.md
- docs/reports/reviews/task-450/TRIAGE-PLAN.md
- docs/reports/reviews/task-450/seat-integration-1.md
- docs/reports/reviews/task-450/seat-reality-check-1.md
- docs/reports/reviews/task-450/seat-regression-1.md
- docs/reports/lanes/2026-11-24/BL-SFX2/REPORT.md (lane report naming task-450)
- docs/reports/lanes/2026-11-24/BL-SFX6/REPORT.md (lane report naming task-450)
- docs/reports/lanes/2026-11-24/BL-SFX7/REPORT.md (lane report naming task-450)
### task-451 (dependency)
- docs/reports/reviews/task-451/FINDINGS-PLAN.md
- docs/reports/reviews/task-451/FOLD-CHECK.md
- docs/reports/reviews/task-451/GROUNDER-PLAN.md
- docs/reports/reviews/task-451/QUESTIONS-RULED.md
- docs/reports/reviews/task-451/TRIAGE-PLAN.md
- docs/reports/reviews/task-451/seat-integration-1.md
- docs/reports/reviews/task-451/seat-reality-check-1.md
- docs/reports/reviews/task-451/seat-regression-1.md
- docs/reports/lanes/2026-11-24/BL-SFX3/REPORT.md (lane report naming task-451)
### task-452 (dependency)
- docs/reports/reviews/task-452/FINDINGS-PLAN.md
- docs/reports/reviews/task-452/FOLD-CHECK.md
- docs/reports/reviews/task-452/GROUNDER-PLAN.md
- docs/reports/reviews/task-452/QUESTIONS-RULED.md
- docs/reports/reviews/task-452/TRIAGE-PLAN.md
- docs/reports/reviews/task-452/seat-integration-1.md
- docs/reports/reviews/task-452/seat-reality-check-1.md
- docs/reports/reviews/task-452/seat-regression-1.md
- docs/reports/lanes/2026-11-24/BL-SFX4/REPORT.md (lane report naming task-452)

## Dependencies
- task-449 SEARCHFIX.1 Search opens a lot only on an exact match: a partial address or a one-row leftover gives a list; a full correct address opens; unit and period forms no longer dead-end · status: BUILT
  final summary: Landed (lane BL-SFX1, branch wf2/inc1b-sfx1, not pushed): the work 079f76c30 (resolver, tests, census row, emitted descriptor, Spec 100 and Spec 89 dated notes); the docs-only a997f8fb7 (generated registry, review queue, rule-lists page, system map; doc-2 G.1/A.3 and task-69 notes); the round 1 fix ddc9e8a24 (direction re-checked after the street-type narrowing, out-compliance-ms-S#1) with the real fixture rows for cases 15 and 21 (decision-236, RR-0453); the round 2 re-run of the empty step-132-p3 lens 4e64e3bc4; the board merge 3b45d5580 (Files-line diff from ff3838a04 unchanged, sha256 6547697da3e9); the mobile-99 lens re-made 5c974f80f.

Hook evidence (lane dir ~/Buildo-scratch/lanes-20261124/BL-SFX1/): red.out 25 failed / 144 passed before the code; green.out 332 passed, 14 skipped at 079f76c30; red-r2.out 1 of 95 failed (32 Fulham Dr E) before the fix; green-r2.out 334 passed, 14 skipped at ddc9e8a24. typecheck clean; generate-surface-registry --check clean.

AC evidence: #1 T2, T5 cases 12, 13, extra 7 Oak and 383 Elm St, parcel-lookup-resolution one-row partial; #2 T1 and its 9-row boundary; #3 T5 cases 10 and 11, extra 32 Fulham Dr E/W; #4 T5 27a, 27b, 27c, 2e, St. Clair, St. Gaspar; #5 T3; #6 T5 (cases 24, 29 and the phone half of 23 are the existing phone tests, cited). T6-T8 in consumer-parcel-lookup.infra.test.ts.

Rule quoted: RR-0442 (MORNING-DECISIONS.md:2276) and RR-0443 c (:2284), with RR-0166 for the unit and direction rules. Principles served: accuracy (a lot opens only on an exact match), understandability (a partial address gives the list), standardization (the street-type guard reuses the direction guard shape). No resolution value, option or tool added; route.ts, address.ts and mobile/ unchanged.

History: round 1 had 91 ids, 17 CONFIRMED (1 MED fixed in ddc9e8a24, 15 LOW and 1 NIT piled), 74 REJECTED; grounder ~/Buildo-scratch/lanes-20261124/BL-SFX1/round1/GROUNDER.md; triage ~/Buildo-scratch/lanes-20261124/BL-SFX1/round1/TRIAGE.md.

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 11 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX1/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX1/TRIAGE.md
- task-450 SEARCHFIX.2 Search page: a street with no number asks for a house number; no-match flicker, strict lot-form check, typed "3", double retry message and the wrong-lot help topic corrected · status: BUILT
  final summary: Landed in ee3634771 (work, through the real hooks): the six search page fixes of task-450: (1) a street typed with no house number shows the refine line 'Add a house number to narrow it down.' and keeps the candidate list (ruled B); (2) a settled miss fetched again keeps the no-match line; (3) the lot form parses one extra field, the closed enums stay; (4) the minimum-length copy is filled from config.min_query_len on phone and web, not a typed 3; (5) the semi page opened cold and offline shows loading and does not redirect before the lookup settles; (6) the help page has the topic wrong-lot ('Wrong address or lot') and both search links point at it. Also L3 (a retry-after of 0 shows one message, MF35-DF1 closed), Q19 (client shim deleted), Q8, R2, R4, R5. The Spec 99 section 6.5 dated note is in ee3634771 and the task-319 dated note in 3f4f616fe. The census scripts/surfaces/_schema/census/mobile-product.json and three generated pages (127-surface-registry.md, 127-surface-review-queue.md, rule-lists-by-kind.md) were added to the Files line because the hooks regenerate them from this change. NOT PROVEN BY THE COMMIT HOOK: the mobile jest tests (red and green for AC1, AC2, AC3, AC4, AC5) are not reached by the pre-commit related run; they are owed at the push station, and the task is not complete until they pass there (operator rule: a task is not complete until it actually works). The push station also owes the full suite and the fold with sfx1 and sfx5 (regenerate the three generated pages, re-run surface-validate --check, re-check the 426 to 427 count locks). One later sweep for the 14 piled LOW ids: out-code-review-p1#1, out-code-review-p1#2, out-code-review-p2#3, out-compliance-inc-S-p1#2, out-compliance-mobile-90-p1#4, out-compliance-mobile-98-p1#3, out-compliance-mobile-99-p3#3, out-compliance-plan-protocol-p1#3, out-compliance-plan-protocol-p1#5, out-compliance-step-132-p2#4, out-compliance-surface-136-p1#1, out-compliance-surface-136-p3#3, out-error-paths-p1#1, out-ux-p1#7 (TRIAGE.md).

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 14 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX2/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX2/TRIAGE.md
- task-451 SEARCHFIX.3 Lot card: "Not available" for an implausible lot size, "at the back", "or report it", screen-reader labels, plain-page header links · status: BUILT
  final summary: SEARCHFIX.3 landed in 04c181564 (work; hooks GATE OK, POLICY CHECKS OK; pre-commit related run Test Files 17 passed | 1 skipped (18), Tests 419 passed | 7 skipped (426); red refused first with Test Files 7 failed, Tests 22 failed), 0e491221e (doc-2 dated notes incl. C.3 no neighbour lots, AC6 at doc-2 line 170), dd40a13d5 (task-336 dated note), merge 182a28053 of wf2/board, review records 63c96df49. Lot card: Not available for a size outside LOT_SIZE_PLAUSIBLE_M2, at the back for a lot with no fronting street, the no-lot line ends or report it linking the wrong-lot topic, the screen-reader label is the visible card text; plain pages get the header links; surface strings 427 to 436. Phone tests never run: AC4, AC5 and the phone halves of AC1 to AC3 are UNPROVEN until the Mobile CI job on the pushed tip shows lotMapPage.behaviour.test.tsx and lotMapScreens.golden.test.ts green and one device tap of report it is recorded. The card is not DONE and not called working. (The phone tests run only in the GitHub Mobile CI job after a push, not at the push station.)

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX3/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX3/TRIAGE.md
- task-452 SEARCHFIX.4 Report-limit screen (subscription upgrade with more report room) and reactivate screen for an expired subscription, phone first · status: BUILT
  final summary: SEARCHFIX.4 built on the phone: work commit 4cf68ec45 (hooks: related run Test Files 4 passed, Tests 147 passed; GATE OK; POLICY CHECKS OK), D15 cite e4a9eea86, dated notes 1ce7b88ae, review records aa6de17b3. AC1 errors.ts/apiClient.ts classes (apiClient.test.ts); AC2 limit wall on search and report (parcelSearchScreen.behaviour, reportPage.behaviour, reportScreen.mount, wallScreens.golden); AC3 reactivate only for expired, status null keeps the notice (parcelSearchMatch.test.ts searchWall); AC4 no web file in the diff. Phone: full local run 59 suites 905/905. Web files outside the related run unverified until the push station.

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 2 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX4/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX4/TRIAGE.md

Review round 2: 0 fixed, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/lanes/2026-11-24/BL-SFX4/GROUNDER.md; triage docs/reports/lanes/2026-11-24/BL-SFX4/TRIAGE.md
