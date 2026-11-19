# TRIAGE of r2-output.txt (output review, one lens: a hit never becomes a miss; join key unchanged)
1. HIGH unit strip unconditional changes bind param without a typed direction: REJECTED. That is element A.5 as ruled (strip before the parse, independent of any direction); the join key code is unchanged (git diff HEAD~1 HEAD on address.ts, address-normalizers.js, parity test: empty). Parity test passed in commit.out ("parcel-cost-tool.logic.test.ts (15 tests)").
2. HIGH narrowed truncated window gives a false exact unique: KEPT, fixed. src/lib/admin/parcel-lookup.ts: guard skipped when exactTruncated; test 'a truncated exact window ... false unique'.
3. MED several wrong-side rows unchanged: REJECTED: brief DESIGN LIMITS (no row on the typed side -> existing result unchanged) and label 1 names the one-lot case only.
4. MED window may hold zero typed-side rows: REJECTED: exact is keyed on (number, street), 11-row window; typeahead street-only browse is a prefix list; brief forbids a new query. Recorded UNVERIFIED (live data).
5. MED row text may not carry the direction: REJECTED as a code defect (address.ts:36-38 documents LINEAR_NAME_FULL values such as "Queen Street West"); live shape UNVERIFIED (no DB).
6. LOW conflictList omits truncated: REJECTED: a conflict needs exactly one row.
7. LOW null-direction row disables guard for the set: REJECTED: ruled in r1 TRIAGE #2.
8. NIT two parses; NIT trim inside strip; LOW French O: REJECTED (cosmetic / out of scope; callers pre-trim).
