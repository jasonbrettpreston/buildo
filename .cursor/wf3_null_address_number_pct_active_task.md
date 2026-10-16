# Active Task: WF3 — null_address_number_pct reports 0 when unexamined
**Status:** Implementation (lane D1, 2026-10-14; operator directive: execute directly)
**Domain Mode:** Backend/Pipeline
**Workflow:** WF3
**Branch / worktree:** `wf3/null-address-number-pct` @ 2d7b0d84, `C:/Users/User/Buildo-wt-addrnum`

## Context
* **Goal:** `load_address_points`' `null_address_number_pct` check reports `{ value: 0, detail: null }` when it examined nothing (no `acquired.rows_shaped` / `acquired.column_nulls.address_number`, or `rows_shaped <= 0`). `verdict.js`'s `pct <=` arm then compares 0 to the bound and renders PASS: green because it never looked.
* **Target Spec:** `docs/specs/01-pipeline/54_source_address_points.md` (owner: checks[], AP-D8); Spec 124 §7 Step 2 NEVER list (LM-D14, "green because it never looked") + §2 Rule 10; Spec 122 §8 (differential/golden). 68/69: N/A.
* **Precedent:** H4 Option A, `null_street_type_pct` in `C:/Users/User/Buildo-wt-addrtype` (uncommitted): the unmeasured branch reports `{ value: null, detail: { reason: 'no_input' } }`.
* **Key Files:** `scripts/lib/compute/load-address-points.js` (`null_address_number_pct`), `src/tests/steps/address_points/post-conversion-fixes.logic.test.ts` (L5c lock).
* **Execution Provider:** claude — Spec 08 §B downgrade, logged: operator directive 2026-10-14 (lane rules), Claude executes directly.

## Premise (MEASURED, dev DB, SELECT only)
```sql
select id, status, started_at, records_meta->'address_points_load'->>'rows_read', e::text
from pipeline_runs, jsonb_array_elements(records_meta->'audit_table'->'rows') e
where pipeline ilike '%address_points' and e->>'metric'='null_address_number_pct'
  and (e->'value' is null or e->'value'='null'::jsonb) order by id;
```
Result: 4 runs, 1978 / 1979 (failed), 1980 / 1992 (completed), 2026-09-23..24, each `rows_read` ~525,430, each row `{"value": null, "status": "PASS", "threshold": "pct <= 0.1"}`. The check examined 0 rows and rendered PASS. These runs predate AP-D8 (180efe00, 2026-09-24 18:06 EDT; 1992 started 17:44 EDT), when the inputs were dead fields; the AP-D8 fix kept the same `value: 0` branch, so the shape is live code today.
Since AP-D8: every run renders `"0.0%"` with a real detail (e.g. 2706, 2556); the live table has 0 / 525,696 null `address_number` (measured), so those 0.0% rows are genuine. No post-AP-D8 run has hit the guard (measured). Premise: TRUE on the code path, with 4 historical runs as the measured instance.

## Fix
In `null_address_number_pct`, the unmeasured branch reports `{ value: null, detail: { reason: 'no_input' } }` instead of `{ value: 0, detail: null }`, byte-for-byte the precedent. `verdict.js` (`evaluateLimit` pct arm, not changed) then returns `unevaluable: check reported no numeric ratio` and `checkRow` renders the check's declared severity, WARN. Replaces: the silent-0 branch. Compute stays pure (no I/O added).

## Red-first test
`post-conversion-fixes.logic.test.ts`:
- L5c (was the lock pinning `value 0 / detail null`, retired knowingly): `acquired: {}` ⇒ value null, detail `{reason:'no_input'}`, verdict row WARN.
- L5e (new): `rows_shaped 0, column_nulls.address_number 0` ⇒ value null, detail `{reason:'no_input'}`.
- `pct-checks-evaluate.logic.test.ts` "empty acquired is PASS-SAFE": address_points `null_address_number_pct` leaves the PASS-SAFE set (that lock pinned `{value:0, detail:null}` + PASS) and gets its own case, `{value:null, detail:{reason:'no_input'}}` + WARN. The other three rows (address_points/parcels `skip_rate_pct`, parcels `null_address_pct`) are unchanged.
- Red measured: 3 failed / 40 passed (the three cases above); green: 5 files, 120/120 after the fix (one transient frozen-shape failure on the first run, 51/51 on re-run).

## Capture impact (Spec 122 §8)
None on a normal run: the goldens (`docs/reports/golden/address_points/{pre,post}/{standalone,sources}.json`) carry `"0.0%"` from the measured branch, which this fix does not touch. The fingerprint of the compute file moves (compute source changed) — the orchestrator decides whether the address_points recapture is owed per the fingerprint gate.

## Consumers
- Descriptor `checks[]` `null_address_number_pct` (`pct <= 0.1`, `limit_from_config: address_points_null_address_number_max_pct`, WARN). No descriptor change.
- No `plausibility[]` / `invariants[]` entry reads this metric (grep, measured).
- `buildNullAddressNumberAuditRow` (scripts/lib/address-points-csv-drift.js) is only called on the measured branch; unchanged.

## Execution Plan
- [x] Premise SELECT
- [x] Red test (L5c, L5e)
- [x] Fix
- [x] Green: targeted vitest at one fork
- [x] Regression Guardian self-pass (blame + fence)

## Follow-ups (not in scope)
- Same shape in `skip_rate_pct` (this file, `value: 0` on `rowsRead <= 0`) and `load-parcels.js` `null_address_pct` (`value: 0`). Separate WF3s.
