Seat: Cairn-Reality-G2

2. WHAT I READ / QUERIED (local stack 127.0.0.1:55322 only, each statement in BEGIN READ ONLY ... ROLLBACK, counts and ids only, nothing written)
- Read: SEAT-BRIEF, files.txt, context.md, GROUNDER-A/B, STATUS G2 section, src/lib/admin/parcel-lookup.ts, migration 309 CHECK text, seed header/keys.
- parcels / address_points / parcel_address_points: row counts and blank checks (parcels 496,536; address_points 525,699; links 346 more than one per point, 15,902 parcels with more than one point).
- Lookup replay: the exact-match key groups (LIMIT 11), the typeahead filter (status, maint_stage, retired_at), LIKE wildcard replays, per-parcel multi-address checks.
- logic_variables (888 rows on the stack) compared key by key against scripts/seeds/logic_variables.json (1091 keys) for bounds, type and defaults.
- parcel_maxbld_scenarios (624,325 rows): migration 309's two CHECK expressions run as plain SELECT counts.
- parcels.lot_size_sqm distribution against the projection's 50..5000 window (project.ts:79, :267).

3. FINDINGS
1. LOW, NEW (lookup), parcel-lookup.ts:299 `SELECT DISTINCT p.parcel_id, COALESCE(ap.address_full, ...) ... ORDER BY address LIMIT 10`. DISTINCT is on (parcel_id, address text), not on parcel. 13,480 parcels carry points with more than one house number on the same street. A street-only typed query can therefore list the same lot twice under two different texts and use up two of the 10 slots. Replay: "BAY%" window of 10 rows holds 9 distinct lots; "KING%" gives 10 of 10. With a number typed it cannot happen (0 parcels have two address texts for one street+number). A person sees a duplicate lot in the candidate list and one fewer real candidate. Smallest fix: none needed for correctness. If wanted, collapse by parcel_id in the SQL.

2. MED, ALREADY-KNOWN (D1, STATUS G2 row, parcel-lookup.ts:299 and :330). Real size of the unescaped LIKE: no stack address has a % or _ in linear_name_normalized or parcels street key (0 rows), so only a typed wildcard matters. Replay of the typeahead filter with a typed "100 %" or "100 _": 1,543 distinct lots match number 100 (window shows 10 of them, arbitrary by address order). A bare "%" with no number matches 474,187 lots, so the 10 shown are unrelated. A genuine "100 Queen" matches 6 lots. Adds one detail to D1: the result is one unrelated lot (a confident "unique" match) whenever the guard leaves one row, otherwise 2 to 10 wrong candidates. Fix is the already-ruled one-line escape.

3. LOW, NEW (data): the "unlinked" and street-overflow guards depend on real data shape I could check. Typeahead overflow: 0 (street, number) keys reach more than 10 linked lots; the maximum is 6, so the comment at parcel-lookup.ts:~294 ("measured 0") holds on this stack. Exact path: 1 key exceeds 10 lots, the key NONE/NONE (26,535 parcels, parcels with no usable address). It is reachable only if a person types a number and the street word that normalises to NONE ("5 None"). Result would be a truncated list of 10 unrelated lots flagged truncated, not a match. Rare; no fix needed, optional guard on streetName === 'NONE'.

4. LOW, NEW (stack lag, not a defect): the stack's value for tooling_precommit_budget_registry_s is 27.5, but the seed declares min 33.2 = max 33.2 (default 33.2, operator-confirmed per grounder A pp1#3). This is the only out-of-bounds value of 888 rows. It is "stack behind seed", not a bug; the seed loader would correct it at the next migrate.

5. LOW, NEW (seed vs stack drift, informational): 24 keys exist on the stack with no seed entry (for example lead_expiry_days, income_premium_tiers, notifications_dispatch_enabled, coa_gate_policy, stripe_price_id_default, maxbld_support_inbox, min_comp_count). 227 seed keys are not on the stack (lag). Four stack values differ from the seed default: p16_inference_layer_enabled 1 (default 0, bounds 0..1), parcel_tool_report_limit_plan 20 and parcel_tool_report_limit_trial 20 (default 10, bounds 1..1000), and the budget key above. All four are inside their bounds. The two parcel_tool limits are the settings that gate the admin cost tool; 20 is plausible. 33 stack rows have a NULL variable_value for numeric keys (all lifecycle_seq_band_*_max style keys, seed default null, bounds 0..999999): matches the seed (nullable by design), not a break.

6. Migration 309 CHECK check. The two CHECKs are on parcel_maxbld_scenarios (not logic_variables, so no logic_variables row can break 309). The table and constraints already exist on the stack (parcel_maxbld_scenarios_value_iff_computed, _reason_iff_undecided, _status_check). Running the CHECK expressions as counts over 624,325 rows gives 0 violations for each. Sound.

7. LOW, NEW (seed bounds that look loose, not stored values): coa_notices_req_lot_coverage_pct_min/_max declare max 100000 for a percentage (default 10 and 100); load_zoning_null_count_warn_over_pct max 1000 (default 10); expired_threshold_days default -90, bounds -730..-1. These are bounds an operator could set to nonsense; the stored defaults are plausible. Optional tightening to 100 in the seed.

8. Informational (data the projection flag already catches): parcels.lot_size_sqm has 8,137 under 50 and 11,295 over 5,000 against the pinned window. Extremes: id 6317175 and id 471031 both 123,456,789.00 (a placeholder value), 7 lots above 1,000,000, and one lot (id 128174) at 0 or below. All 19,432 out-of-window lots carry lot_size_basis 'oob', so project.ts:267 (lot_size_implausible) will flag them. 9,155 other 'oob' lots sit inside the window, so the flag is by value, not basis, as coded. The two window keys (maxbld_report_lot_size_implausible_min_sqm 50, _max 5000) and the sq-ft factor in the seed (parcels_sqm_to_sqft 10.7639 on the stack) are plausible. parcels.lot_size_sqft matches sqm times 10.7639 within 1 sq ft on every row (0 mismatches). The two window keys are "not on the stack".

4. CHECKED AND FOUND SOUND
- Blank addresses: 10,006 parcels have a blank address number and blank linear name; 10,456 have a blank street key. The exact path needs a number and a street, so they never match; classifyRows (:111) treats a blank printed address as not "one address". 0 parcels have a number but no street name.
- Duplicate address rows: 7,821 (number, street) keys have more than one lot; 1,403 of them print one identical address text and become multi_parcel (the map). The rest become a candidate list. Both paths behave as written.
- Exact LIMIT 11 truncation probe: the 11th row exists for only the NONE/NONE key.
- Multi address points per lot (15,902 lots, 1,166 points shared by more than one lot): with a number typed, the DISTINCT on (parcel, text) returns one row per lot; 0 parcels have two texts for the same street and number.
- Retired and non-REGULAR points are real (328 retired, 7,533 non-regular or null stage); the filter excludes them.
- The mistyped-street matcher (task-333) is reachable on the stack: fuzzystrmatch is installed (levenshtein text,text), normalize_address(addr text) exists, and enrich_heritage_address_levenshtein_threshold is 2 (seed bounds 0..10, default 2), inside bounds.
- The seed: 1,091 keys, 1,086 number, 1 string, 4 list; no number default outside its own min/max except the null-default keys.
- No stack value is out of bounds except finding 4; no integer-typed setting holds a fraction.
- ledger tool: I did not run it (rule: no generators); nothing in the data relevant.

5. QUESTIONS FOR THE OPERATOR
- Should a typed "NONE" street, or a street-only query, be handled (finding 1 and 3), or is the current behaviour accepted for the admin tool?
- Are the stored parcel_tool_report_limit_plan and _trial of 20 (default 10) intentional for the rehearsal copy?
- Do you want the out-of-range percentage and day bounds in finding 7 tightened in the seed, or left as operator headroom?

6. UNVERIFIED
- Whether stack migrate would raise tooling_precommit_budget_registry_s to 33.2 (I read, did not run the seed loader).
- The seed-only keys (227) and the two lot-size window keys: not on the stack, so not value-checked there.
- Production row counts and production values (stack is a rehearsal copy).
- Data was read only through counts and ids; the grounders' point about the mobile page's dash rendering is not data and untouched.
- The no-number street-only duplicate (finding 1) was replayed for two street prefixes (BAY, KING), not for every street.
