# TRIAGE: BL-FUZZY plan round r1 (r1-plan.txt, 27 findings; grouped)
Opened: migrations/097_control_panel_final.sql:7-19, migrations/011_parcels.sql:27-28, src/lib/admin/parcel-lookup.ts:178-186,193-286, src/app/api/parcels/lookup/route.ts, scripts/lib/compute/enrich-heritage.js:121,174.

| # | finding | verdict | evidence / action |
|---|---|---|---|
| 1 | CRITICAL variable_value type (jsonb/text, lexicographic) | REJECT | migrations/097:7 "existing variable_value column is DECIMAL"; the numeric comparison is correct. A numeric cast is still written explicitly. |
| 2 | CRITICAL second matcher: SQL copied | REJECT (flag) | The shared parts are normalize_address(), levenshtein() and the one logic variable; the predicate is one comparison, as in enrich-heritage.js:121. A named SQL function would be a new migration (a new home): not in this lane's scope. Raised in REPORT as a non-blocking note. |
| 3 | CRITICAL ORDER BY ellipsis | KEEP | ORDER BY distance, address, parcel_id written in the code. |
| 4 | HIGH $2 undefined | KEEP (wording) | $2 = the parsed street token (parcel-lookup.ts:182), both sides normalised by normalize_address; plan text fixed in the code comment. |
| 5 | HIGH two normalizers | REJECT | street_name_normalized is the pipeline-written column and $2 comes from the same-rule TS mirror pinned by parcel-cost-tool.logic.test.ts; normalize_address on both sides only lowercases/expands suffixes. |
| 6 | HIGH selectivity | REJECT | runs on the miss only (after exact, typeahead, unlinked); number-first index idx_parcels_address (011:27). Measured row count UNVERIFIED (no DB). |
| 7 | HIGH row shape too narrow | REJECT | candidates are {parcelId, address} everywhere in this file (parcel-lookup.ts:225,246). |
| 8 | HIGH wrong house number not rescued | REJECT, boundary stated | RR-0277 is one function, the pipeline matcher compares addresses; number stays exact. Stated in REPORT. |
| 9 | HIGH threshold coupling to heritage | REJECT, stated | A new variable would be a new field (AC3, "no new field"); reuse is the ruling's "same approach". Coupling recorded in REPORT. |
| 10 | HIGH try/catch | REJECT | no other read in resolveAddress is wrapped; errors surface like the three before it. |
| 11 | HIGH silent disable if variable absent | REJECT | seeded default 2 (logic_variables.json:6656); an absent row yields no rows by design; no new log (no new field; scope). |
| 12 | HIGH AC3 goldens | KEEP (check) | no field/copy changes; I run the repo hooks and report which parity/golden checks fire. |
| 13 | HIGH test harness | KEEP (state) | the logic test mocks the database by statement text (pattern of the file); the SQL itself is NOT executed: UNVERIFIED against a live DB (no-DB rule). |
| 14 | HIGH input length (levenshtein 255 cap raises) | REJECT | the consumer q is capped at 120 (src/app/api/parcels/lookup/types.ts:42); the matcher is consumer-only (option matchMistyped), so 255 is unreachable; guard and its case dropped (my 300-char case got a 400 in the red run). |
| 15 | HIGH heritage vs permit interpretation | KEEP | marked UNVERIFIED in REPORT with the grep showing the permit/CoA tiers are equality only (60_shared_steps.md:161-165). |
| 16 | MEDIUM normalize_address dependency/IMMUTABLE | REJECT | migration 170:22 declares IMMUTABLE. |
| 17 | MEDIUM boundary test distance 2/3 | PARTLY | cannot execute SQL; the test pins the statement text carries the pipeline predicate and the variable. |
| 18 | MEDIUM single candidate UX | REJECT | AC1 asks for candidates; recorded. |
| 19 | MEDIUM mask exact-matcher defect via logging | REJECT | scope. |
| 20 | MEDIUM false positives at threshold 2 | KEEP (note) | candidates are a pick list of same-number lots, bounded at 10; second output lens covers it. |
| 21 | MEDIUM rollback | REJECT | read-only change, revert-only. |
| 22 | LOW explicit number guard | KEEP | already `if (num && ...)`; boundary case asserts no read without a number. |
| 23 | LOW typeahead already prefix | REJECT | measured SAMPLES.md row 7: typeahead 0. |
| 24-27 | context-generator defects | REJECT | not this task's scope. |

# TRIAGE: output review r2 (r2-output.txt, lens: false candidates and the hot path)
Opened: src/lib/admin/parcel-lookup.ts:286-307 (new read), src/app/api/parcels/lookup/route.ts:100, migrations/092_control_panel.sql:28, migrations/097_control_panel_final.sql:7, migrations/170:12,22.
| finding | verdict | evidence / action |
|---|---|---|
| 1 HIGH short street names collide at threshold 2 (ELM/ELK, OAK/OAKS) | KEEP as a disclosed risk, no code | a relative-distance or prefix rule is a new rule outside RR-0277 ("the same approach"); the variable is the operator's dial; the list is a pick list of same-number lots (max 10). False-candidate rate UNVERIFIED (no DB). In REPORT. |
| 1 MEDIUM suffix-only differences, suburb | REJECT | the pipeline predicate has the same property; parcels is Toronto-only (Spec 54). |
| 2 HIGH truncated not set | REJECT | `truncated` is optional; the typeahead branch sets none either (parcel-lookup.ts:243 comment: no overflow probe). |
| 3 HIGH no error isolation | REJECT | no read in resolveAddress is wrapped; same database, extension and function from migration 170:12,22; a miss the same as the 3 reads before. |
| 4 HIGH untyped threshold | REJECT | variable_value is DECIMAL (097:7); variable_key is the PRIMARY KEY (092:28), so the scalar subquery returns at most one row. |
| 5 MEDIUM unbounded scan | REJECT | runs on the miss only; the route rate-limits the q path (route.ts:~84 SEARCH_LIMIT_PER_MIN); q capped at 120 (types.ts:42); a prefilter is a new rule. |
| 6 MEDIUM normalisation shape | REJECT | the exact read already compares street_name_normalized to the same parsed token (parcel-lookup.ts:202). |
| 7 HIGH tests mock the DB | KEEP as UNVERIFIED | stated in REPORT; no DB allowed. |
| 7 LOW admin regression guard | KEEP | added a case: resolveAddress with no options never runs the matcher (fix commit). |
| other NITs | REJECT | no defect. |
