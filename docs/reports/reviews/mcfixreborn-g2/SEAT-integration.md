Seat: Cairn-Integration-G2

1. WHAT I READ (read-only; no database, no test run, no write)
- GROUNDER-A.md, GROUNDER-B.md, context.md, files.txt, and SEAT-BRIEF.md. I did not find a G2 section in STATUS.md with the grep I tried.
- src/lib/admin/parcel-lookup.ts lines 130-370 (the resolver).
- Its callers: src/lib/parcels/lookup-flow.ts, src/app/api/admin/parcels/lookup/route.ts, and src/app/api/parcels/lookup/types.ts (the RESOLUTIONS enum).
- src/lib/report-projection/read-stored.ts, seed-shas.ts, pinned-settings.ts, and project.ts lines 70-90 and 175-200.
- src/lib/parcels/report-compute.ts and report-page.ts, in full.
- migrations/309 (full), the stamp view in 295, the ravine columns in 168 and the heritage columns in 171, normalize_address and fuzzystrmatch in 170, and the pin in 225.
- The ledger diff for src-sql-ledger.mjs, its entry for report-compute.ts in scripts/steps/_schema/src-sql-ledger.json, and .husky/pre-commit:23.
- The settings seed rows for parcels_sqm_to_sqft, the two lot-size window keys, and enrich_heritage_address_levenshtein_threshold.
- The generated groups file src/features/admin-controls/generated/logic-variable-groups.json, and the control-panel and report-projection-settings tests.

2. FINDINGS (most serious first)

1. MED, NEW. A typed street direction can turn a truncated 10-row typeahead window into a "unique" lot.
- Typeahead side: src/lib/admin/parcel-lookup.ts:279-286 reads the typeahead with `ORDER BY address LIMIT 10` and no overflow probe. Line 288 then runs `guardByDirection(typeahead, typed)`, and :294 returns `resolution: 'unique'` when one row is left.
- Exact side: the exact path at :255-258 deliberately skips the guard when its window is full (`exactTruncated ? null : typed`), with the comment "a truncated window cannot prove a narrowed row is the only one". The typeahead path never got that rule.
- The comment at :299 says "measured 0 (street, number) keys reach more than 10 lots". That covers a street plus a number. It does not cover a street-only query, where `num` is '' and `$2` is NULL, so the window is the first 10 addresses on the street.
- The test at src/tests/search-parser-guard.logic.test.ts:201-202 uses a 3-row window, so it cannot see this.
- Example: "Queen St E" matches many lots. If exactly one of the first 10 printed addresses ends in E, the guard keeps that row. `match` is then that one lot with `matchType: 'typeahead'`, and the consumer route (lookup-flow.ts:73) fetches it and builds a report and meter charge for an arbitrary lot.
- Without the guard the same query would return a list of 10 candidates.
- Not covered by GROUNDER-B error-paths-p2#2 (refuted for "never empties a set") or inc3#1 (other-side lots). I could not run it against data, so the frequency is unknown.
- Smallest fix: at :288 use `typeahead.length >= 10 ? null : typed`. This is the same rule as the exact path. Add one 10-row case to the guard test.

2. LOW, ALREADY-KNOWN (GROUNDER-B D3, GROUNDER-A K1). The settings seed comments still say "The DB mirror row (a migration, number to be claimed) is owed".
- Seed text: scripts/seeds/logic_variables.json:8197 and :8207. Test comment: src/tests/control-panel.logic.test.ts:268.
- I followed it to both ends. The keys are in src/features/admin-controls/generated/logic-variable-groups.json:1278-1279 under the group "MaxBLD Lot Size", matching the seed `admin.group` at both rows. Nothing else is owed by code.
- I add only that no migration in migrations/ names either key, which agrees with the card ruling that the seed loader inserts them.

3. LOW, NEW, a seam the ledger cannot see. report-compute.ts:86-90 runs the step core's batch statement (`plan.batch_sql`) from src/.
- The ledger entry (scripts/steps/_schema/src-sql-ledger.json:2693-2716) records only the two lookup statements and lists reads of bylaw_resolution_texts and bylaw_resolution_units. It lists no read of parcels or the stamps, because the batch text is a variable.
- That is declared (src-sql-ledger.mjs:111 comment) and the closed set holds. But a column rename in the core's statement will not make the ledger or its tests go red. Only the runtime check at report-compute.ts:88 (the binds) and the descriptor-comparison test the grounder cited would catch part of it.
- This is a stated limit, not a defect. I report it so the reader knows what the green ledger does not cover.

4. Not a fault, a wiring note. Seam checked field by field: read-stored.ts and migration 309 agree.
- ROWS_SQL (read-stored.ts:44-46) selects building_type, field_id, increment, status, value, unit, reason, flags, content_sha, catalogue_sha, switchboard_sha, settings_sha, layer2_table_version and switches. All exist in migrations/309:21-35.
- STAMP_SQL columns lot_gate, table_version and evaluator_version exist in the view from 295:96-99 (hex-encoded).
- PARCEL_SQL columns exist: the ravine lineage column in 168:18, and the heritage columns in 171.

3. CHECKED AND SOUND
- Every caller of resolveAddress agrees on its shape. The admin route (route.ts:59) passes no options, so it keeps two reads. The consumer flow (lookup-flow.ts:43) passes classifyUnlinked and matchMistyped. The RESOLUTIONS enum (types.ts:143) equals the ParcelResolution union (parcel-lookup.ts:136).
- Wiring: readStoredPage is reached from report-page.ts:58 and admin stored-page.ts:70. readLotFacts is reached from report-compute.ts:76. computeCustomerPageResponse is reached from lookup-flow.ts:16 and :90. pageForVerdict has one place, shared by both producers.
- The fuzzy read (parcel-lookup.ts:340-352) relies on levenshtein and normalize_address. fuzzystrmatch comes from migration 170:13 and normalize_address from 170:21, and 225 keeps both on the pinned path. Its setting enrich_heritage_address_levenshtein_threshold exists in the seed (:6656, number 0-10, default 2).
- Pinned settings: parcels_sqm_to_sqft (:8182) and the two lot-size window keys (:8192, :8202) are type number with min = max = default. This matches the pinnedSetting and pinnedWindow checks (pinned-settings.ts:12-22). The key names match project.ts:79-81 and report-projection-settings.logic.test.ts:21-23.
- Migration 309 has a manual DOWN section, tables created with IF NOT EXISTS, and RLS enabled. Migration 311 reads a view that exists from 295, so the order holds.
- The ledger is read at pre-commit (.husky/pre-commit:23). Its closed-set diff is one added file with a comment, and the grounder's --check run was fresh.
- The unlinked read skips a street with a LIKE wildcard (:318). The typeahead's own escape (D1) is already known.

4. QUESTIONS FOR THE OPERATOR
- Should finding 1 be a fix task? It sends an arbitrary lot to a paying user, which in turn charges the meter. Shall I name it as MED for the round rule?
- Is a street-only query ("Queen St E", no number) meant to reach "unique" at all, or only the candidate list?

5. UNVERIFIED
- The Layer 3 core seam of report-compute.ts could not be checked. A guard hook (lane-guard B1) blocked my one command that named the core and its descriptor. I did not work around it. So I did not confirm four things:
  - the core exports materializeRows and buildSourceSql;
  - the descriptor path and `resolveConfig` in scripts/lib/step/config.js match the imports at report-compute.ts:77-79;
  - the setting `compute_maxbld_scenarios_population_parcel_ids` and the binds `last_key,batch_size` exist;
  - the core stamps `catalogue_sha` and `layer2_table_version` in the same form as CURRENT_SEED_SHAS and the stamp view. If they differ, every computed lot reads as out_of_date and shows no page. The grounder's note says a src/tests compute test covers the descriptor lookups, not this.
- I did not run any test, so the frequency of finding 1 on real data is unknown (no database seat in this role).
- I did not read the sections of src/lib/admin/parcel-lookup.ts outside lines 130-370, or the other G2 tests and golden harness files.
- I did not find a G2 section in STATUS.md, so I used only the GROUNDER files for the known list.
