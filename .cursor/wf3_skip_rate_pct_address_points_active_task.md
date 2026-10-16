# Active Task: WF3 — address_points skip_rate_pct reports 0 when nothing was read
**Status:** Implementation (lane D1b, 2026-10-14; operator directive: execute directly)
**Domain Mode:** Backend/Pipeline
**Workflow:** WF3
**Branch / worktree:** `wf3/null-address-number-pct` @ 2d7b0d84, `C:/Users/User/Buildo-wt-addrnum` (shared with the null_address_number_pct WF3; this WF3's hunks are unstaged, patch `d1b/wf3a-skip-rate-address-points.patch`)

## Context
* **Goal:** `skip_rate_pct` (`scripts/lib/compute/load-address-points.js`) reports `{ value: 0, detail: null }` when `rows_read`/`feature_count` is absent or `<= 0`. `verdict.js`'s `pct <=` arm compares 0 to the bound and renders PASS: green because it never looked.
* **Target Spec:** `docs/specs/01-pipeline/54_source_address_points.md` (checks[]); Spec 124 §7 Step 2 NEVER list (LM-D14) + §2 Rule 10; Spec 122 §5.5, §8. 68/69: N/A.
* **Precedent:** `null_address_number_pct` WF3 (same worktree, staged): `{ value: null, detail: { reason: 'no_input' } }`.
* **Execution Provider:** claude — Spec 08 §B downgrade, logged: operator directive 2026-10-14.

## Premise (MEASURED, dev DB, SELECT only)
Every `address_points` / `sources:address_points` run with a `skip_rate_pct` audit row (38 + 2 runs, 1978..2706) has `rows_read` 525,343..525,436 and `records_skipped` 0, value `0`, PASS: the MEASURED branch (the no-input branch would render `value: null`). No run hit the guard. Premise: **latent, no observed run**; the code path exists (compute :246-247) and is reachable whenever `acquired.rows_read` and `feature_count` are both absent or 0.

## Fix
Unmeasured branch reports `{ value: null, detail: { reason: 'no_input' } }`. `verdict.js` (unchanged) returns `unevaluable: check reported no numeric ratio` at the declared severity: **FAIL** (`blocking: false`, D-8). On the same input `rows_read_floor` already FAILs (0 < 500,000, or `value_min` unevaluable on null), so the run's verdict does not change; the skip row stops claiming PASS. Replaces: the silent-0 branch. Compute stays pure.

## Red-first test (`src/tests/steps/pct-checks-evaluate.logic.test.ts`)
* `['address_points','skip_rate_pct']` leaves the PASS-SAFE `it.each` (that lock pinned `{value:0,detail:null}` + PASS; retired knowingly).
* New `it.each` over `{}` and `{rows_read:0, records_skipped:0}` ⇒ `{value:null, detail:{reason:'no_input'}}`, status = declared severity = FAIL.
* Red measured: 2 failed / 33 passed (`expected { value: +0, detail: null } to deeply equal { value: null, … }`). Green: 9 files, 125/125.

## Regression Guardian (self-pass)
`git blame`: branch from a8c1a42f (2026-09-23 conversion, as `violations: 0, detail: null`), reshaped by 004ae733 (2026-09-28 WF3 pct-reports-value, `value: 0`). Fence: a safe no-op on missing counters (no throw, no fabricated flag). New code keeps no-throw and no `violations` key; it knowingly retires the PASS. No lesson / KFM / followup names the 0 as intended (grep).

## Capture impact (Spec 122 §8)
None on a normal run: goldens `address_points/post/{sources,standalone}.json` carry `value 0` PASS from the measured branch. The compute fingerprint moves (source changed): the orchestrator decides the recapture per the fingerprint gate.

## Execution Plan
- [x] Premise SELECT · [x] Red · [x] Fix · [x] Green (one fork) · [x] Guardian self-pass
