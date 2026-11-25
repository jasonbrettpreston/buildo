---
id: TASK-454
title: >-
  SEARCHFIX.6 Search settings: the typed-in limits become registered settings;
  emitter, log and test fixes (needs the operator's typed GO to apply on dev)
status: LATER
assignee: []
created_date: '2026-11-24T14:47:00Z'
updated_date: '2026-11-25T01:41:00Z'
labels:
  - SEARCHFIX-LATER
milestone: m-1
dependencies:
  - TASK-449
  - TASK-450
  - TASK-451
  - TASK-452
type: fix
ordinal: 150110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator, Spec 137 rule 2, on the operator's rulings: RR-0444 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2290, fold the findings), RR-0447 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2308, add the new tasks with the search-fix labels, dependencies and order) and RR-0448 (the 8 merged cards). Source: the fold plan docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md, task 4 (FIX.SEARCH-SETTINGS); every finding was ruled by a separate grounder (RR-0387, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1943; records under docs/reports/reviews/mcfixreborn-g1 to -g4). The plan's section 2 lines are this card's acceptance tests, each red first. Nothing is added that the plan or a ruling does not name (RR-0392, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975).

What changes, in plain words: the limits typed into the code (60, 30 and 30 a minute; the 500 ms slow-query mark; the cap of 10; 3 recent searches) become registered settings with bounds (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1494 "register them"). The generator emits a setting of 0; the entitlement route logs success; the error tests check that no database text leaks; stale wording corrected. No customer effect today: the limits work as typed.

Findings folded: N1, Q1, L4, L6, L8, X3, G2 D3, G2 K3, seat S2.

DB: no migration file; the seed loader inserts the rows at the next migrate. Rehearsed on the test stack first; running on dev is the operator's own typed GO.

Runs after SEARCHFIX.1 to .4 (shared lookup file, search slice and descriptor). Dated note owed: task-372.

Files: scripts/seeds/logic_variables.json, src/app/api/parcels/lookup/route.ts, src/app/api/parcels/entitlement/route.ts, src/lib/admin/parcel-lookup.ts, mobile/src/constants/parcelSearch.ts, mobile/src/store/recentSearchesStore.ts, scripts/surfaces/emit-mobile-surfaces.mjs, mobile/src/lib/sliceConfig.ts, scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, mobile/src/generated/surfaces/mobile_parcel_search.json, docs/reference/logic-variables-registry.md, src/tests/control-panel.logic.test.ts, src/tests/parcel-lookup-gate.infra.test.ts, src/tests/parcels-entitlement.infra.test.ts, src/tests/surfaces/surface-conformance.logic.test.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The six limits are seed rows with bounds, the code reads them, and a test fails when the code types the number
- [ ] #2 A setting of 0 that the schema allows is emitted
- [ ] #3 The entitlement route logs success with uid and duration
- [ ] #4 The 500 bodies contain no database text
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

**Answer to item 4 first.** Every server reader fails closed when its row is missing: lot-map.ts:78-86 throws, and so do lot-size-entry.ts:91-96 and entitlements readReportLimits. The new server rows copy that shape. So, at this commit, search, the entitlement read and the admin parcel lookup all return 500 until the rows exist. Pushing alone deploys nothing: test.yml:34-38 runs on main only, and apply-migrations.yml:36-37 runs on a manual dispatch only. The push can go tonight only if no dev app runs wf2/board against the dev database before the operator's typed GO apply. Otherwise hold the push until the apply.

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

| Key | Default | Bounds | on_invalid |
|---|---|---|---|
| parcel_lookup_search_per_min | 60 | 1–600 | fail |
| parcel_lookup_detail_per_min | 30 | 1–300 | fail |
| parcel_entitlement_read_per_min | 30 | 1–300 | fail |
| parcel_lookup_slow_query_ms | 500 | 50–10000 | fail |
| maxbld_page_candidate_cap | 10 | 2–50 | fail |
| maxbld_page_recent_max | 3 | 0–10 | clamp |

- Each description follows the :10871 form: "task-454 (MD:1494; Spec 128 Rule 3)", the source of the value, then "NO SOURCE for the range", the posture and CONSUMED-by.
- The cap's max of 50 is the response-size envelope of parcel_map_neighbour_limit.
- recent_max 0 turns the chips off.
- The candidate cap says: "the server reads it at every lookup; the phone takes it at the next app build".
- S2: the six existing maxbld_page_* descriptions and recent_max add "Takes effect at the next app build".
- D3/K3: replace the sentences at :8197 and :8207. The MD:738 cite becomes "ONE-13 a (MD:738); the 50 and 5,000 words: backlog/decisions/decision-37 (RR-0167)". Make the same cite fix in report-projection-settings.logic.test.ts:3. Remove the "owed" text at control-panel.logic.test.ts:268.

**Step 2. Tests first, each proven red:**
- control-panel: add the six keys to EXPECTED_LOGIC_VAR_KEYS (red: the keys are missing).
- surface-conformance C-10:
  - KEYS becomes eight; the seed rows and bounds are pinned.
  - New `it`, copying :1106: the comment-stripped lookup route, entitlement route, parcel-lookup.ts, parcelSearch.ts and the store match none of `/LIMIT_PER_MIN|SLOW_QUERY_MS|limit:\s*\d|LIMIT 1[01]\b|slice\(0, 10\)|[>=]=? 10\b|SEARCH_CANDIDATE_LIMIT = |SEARCH_RECENT_MAX/`, and they contain `readSearchSettings`, `sliceNumber(SEARCH_SLICE, 'candidate_cap')` and `sliceNumber(searchSlice, 'recent_max')` (red today).
  - L4: `pageSettingBounds({debounce_ms:0,min_query_len:0},[],{})` gives no problems; an `entitlement_stale_ms` of 0 with no entry is still a problem.
  - L8: in a tmp copy of the slice dir, `writeOutputs(root)` removes a stray `x.json`.
  - S2: the descriptions match /next app build/.
- gate test: add `.not.toContain('db down')` / `'insert failed'` after :168, :286, :462 and :530; entitlement test after :95. These pass on arrival. Red proof: mutate internalError to echo `cause.message`, run, then revert. Record it in docs/reports/red-evidence/task-454/.
- entitlement test L6: capture logInfo. Expect `('[api/parcel-entitlement]', 'parcel entitlement', {uid: UID, duration_ms: any(Number)})` (red).
- Lookup and entitlement tests: a missing settings row gives 500 with no data (red).
- Mobile: recentSearchesStore.test.ts:36-37 and parcelSearchMatch.test.ts:36,67 read the slice values; parcelScreens.golden.test.ts:15 imports the cap from SearchBinding.

**Step 3. Server code:**
- In parcel-lookup.ts, add `SEARCH_SETTING_KEYS` and `readSearchSettings()`. Copy lot-map.ts:62-87 exactly: the `query` helper, seed bounds at load, one ANY statement, integer and in bounds or throw `SearchSettingsMissingError`.
- resolveAddress reads `candidateCap` once at entry. Every LIMIT 10/11 becomes `LIMIT $n`, bound to cap or cap+1. The `> 10`, `>= 10` and `slice(0, 10)` checks use the cap.
- The lookup route calls `readSearchSettings()` after the parse, before the rate limit (keeps 401 first). It replaces :57,:59,:60. RATE_WINDOW_SEC 60 stays, as lot-size's "a day" was ruled (GROUNDER-A D1 "Not included").
- The entitlement route does the same for its limit. It adds `TAG`, `t0` and the success logInfo (lot-size/route.ts:43-45 shape).
- Fix the header comments: lookup :21, entitlement :11, parcelSearch.ts:30-35.

**Step 4. Phone code:**
- surface.schema.json gains `candidate_cap` and `recent_max`. Each gets an allOf rule with the continue_wait_ms form (:2762).
- PAGE_SETTINGS gains `candidate_cap: 'maxbld_page_candidate_cap'` and `recent_max: 'maxbld_page_recent_max'`.
- The search descriptor gains the config values and the logic_variables entries.
- SearchBinding: `export const SEARCH_CANDIDATE_LIMIT = sliceNumber(SEARCH_SLICE, 'candidate_cap')`.
- The store: `sliceNumber(searchSlice, 'recent_max')`, as at useParcelLookup.ts:19,55.
- Delete parcelSearch.ts:17-28. The constants file must stay import-free (surface-conformance :735).

**Step 5. Generator:**
- L4: the check at :51 skips `v < ENTRY_FROM[k]`. ENTRY_FROM is read once from the schema's allOf `if.properties[k].minimum`, giving 1 for debounce and min length and 0 for the others. The skip comes from schema data, not a list of key names.
- L8: export `writeOutputs(root)`, which writes and then unlinks GEN-STRAY files. Fix the comments at :11, :44 and sliceConfig.ts:4: min and max come from the seed row, on_invalid from the descriptor entry (emit :61).
- Contract: contract_parcels_lookup config.why and logic_variables gain the five server keys (GROUNDER-A D1 "descriptor config.logic_variables filled in").

**Step 6. Regenerate with the existing --write tools, then run --check:**
- `npm run logic-var-groups`: add the keys to GROUP_ORDER in the generator, as task-395 did at :1318.
- `npm run logic-vars-docs`.
- emit-mobile-surfaces --write.
- src-sql-ledger --write.
- census, the surface .d.ts, generate-surface-registry, report-fields.
- Restamp the golden fingerprints only (the task-395 form, red-evidence/task-395/restamp-fingerprint-only.txt).
- Then every pre-commit check (.husky/pre-commit:20-45), both suites, and the mobile jest.

**Step 7. Commit:** one commit with `Task: task-454` and `Spec-diff:` trailers, the task file and queue row in the same commit, and a dated note on task-372 through the backlog CLI.

**Stage (ii): test-stack rehearsal.** Spec 08:530 MCINC-7. The orchestrator's DB lane runs it; a build lane never does.
- Copy dbjobs/MF19-324: c1-c4, r-restore, seedcheck.cjs, rehearse.zsh, with `JOB_TARGET=teststack`.
- c1 lists every seed key missing on the target.
- c2 runs `node -r dotenv/config scripts/seeds/apply-logic-variables.js` from the pinned tree (header :30-33). It is not `migrate.js --only`, which skips the loader (:23).
- c3 runs `seedcheck.cjs` on the six keys.
- r-restore deletes only the keys c1 found absent.
- Set `RG_BRANCH=origin/wf2/board`; the gate defaults to mb-rulings (:9).
- Run the hooks on the captures, then write REHEARSAL.pass.
- No seed-only job exists yet. This is the minimum copy of the existing form.

**Stage (iii): the dev apply.** It waits for the operator's own typed GO: `export JOB_TARGET=dev GO='OPERATOR-GO SEARCH-454'`, then c1 to c4.

### (C) FILES (the card's 15 entries are confirmed; add these)

- **Production code:** src/app/api/parcels/lookup/route.ts, entitlement/route.ts, src/lib/admin/parcel-lookup.ts, mobile/src/components/surfaces/SearchBinding.tsx (the cap read), recentSearchesStore.ts, scripts/surfaces/_schema/surface.schema.json (config is closed, :2512).
- **Generated:** src/lib/surfaces/generated/surface-descriptor.d.ts, scripts/surfaces/_schema/census/mobile-product.json, census/contracts.json, scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json, docs/reports/generated/127-surface-registry.md, docs/reference/maxbld-report-field-inventory.{md,json} (the seed sha), scripts/generate-logic-variable-groups.mjs, src/features/admin-controls/generated/logic-variable-groups.json, scripts/steps/_schema/programme-items.json (1091 to 1097), scripts/steps/_schema/src-sql-ledger.json, src/tests/fixtures/surfaces/mobile_parcel_search/*.json (22), mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json.
- **Tests:** src/tests/report-projection-settings.logic.test.ts (K3), customer-report-read.logic.test.ts, parcels-lookup-page.logic.test.ts, search-routing.logic.test.ts, search-parser-guard.logic.test.ts, parcel-lookup-resolution.logic.test.ts (mocks and call indexes), mobile/__tests__/recentSearchesStore.test.ts, parcelSearchMatch.test.ts, parcelScreens.golden.test.ts.

### Collisions with task-456

- **customer-report-read.logic.test.ts is in both Files lines.** task-454 edits its db/client mock at :31-34; task-456 edits its builders at :77-78.
- **The new parcel-routes.security test reaches the changed routes.** Its "ignores a uid" cases go past auth and will hit `readSearchSettings`.
- **Recommendation: task-454 lands first, then task-456** (or task-456 rebases onto it). Low risk: the src-sql-ledger.mjs change (exit code only) and sliceConfig.ts (task-454 changes a comment only).

### (D) OPERATOR QUESTIONS

1. **Push before the dev apply?** Every server reader fails closed, so search returns 500 on any dev app at this commit until the rows exist. Recommended: hold the push until the GO'd apply, unless he confirms no dev app runs wf2/board. Rule: "simple and easy turning stuff off" and no exception paths, so there is no seed fallback.
2. **Description changes on dev.** If the six maxbld_page_* rows and the task-372 rows are already on dev, the loader keeps their old descriptions (DO NOTHING, apply-logic-variables.js:12-24), and the panel shows the DB text (control-panel.ts:358). Recommended: c1 reports which rows are present. If they are present, S2 and D3 reach dev only through a migration file, which the card rules out. So he decides whether the dev panel wording is owed now or left to a later card. Rule: RR-0392.
3. **The dev apply inserts every missing seed key, not only these six.** Recommended: c1 lists them and the GO names that list. Rule: MCINC-7.

### (E) UNVERIFIED

- Whether the dev database already has the task-395 and task-372 rows. No database connection was made.
- Whether any dev app runs wf2/board.
- The golden restamp command.
- Whether generate-logic-variable-effect, docs/specs/03-mobile/99_mobile_state_architecture.md (which names SEARCH_RECENT_MAX) or the search descriptor's guards.rate_bucket text "60/min" move.
- Whether the entitlement contract must declare its new key.
- Whether the unlinked read's `LIMIT 11` (:426) is the cap or its own window.
- The exact index shifts in search-routing.logic.test.ts:186-190.
- The exact backlog CLI command for the task-372 note.
- Whether the board tip is 9de5c2129 or 8df2315ec: git log and git worktree list disagree.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/admin/parcel-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/app/api/parcels/lookup/route.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/surfaces/emit-mobile-surfaces.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/seeds/logic_variables.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/surfaces/surface-conformance.logic.test.ts
<!-- SECTION:PLAN:END -->
