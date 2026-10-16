# Active Task: WF3 — parcels skip_rate_pct reports 0 when nothing was read
**Status:** Implementation (lane D1b, 2026-10-14; operator directive: execute directly)
**Domain Mode:** Backend/Pipeline
**Workflow:** WF3
**Branch / worktree:** `wf3/null-address-number-pct` @ 2d7b0d84, `C:/Users/User/Buildo-wt-addrnum` (shared; this WF3's hunks are unstaged, patch `d1b/wf3b-skip-rate-parcels.patch`, applies after wf3a)

## Context
* **Goal:** `skip_rate_pct` (`scripts/lib/compute/load-parcels.js`) reports `{ value: 0, detail: null }` when `rows_read`/`feature_count` is absent or `<= 0` ⇒ PASS on a run that read nothing.
* **Target Spec:** `docs/specs/01-pipeline/55_source_parcels.md` (checks[]); Spec 124 §7 Step 2 (LM-D14) + Rule 10; Spec 122 §5.5, §8. 68/69: N/A.
* **Precedent:** `null_address_number_pct` WF3 (same worktree).
* **Execution Provider:** claude — Spec 08 §B downgrade, logged: operator directive 2026-10-14.

## Premise (MEASURED, dev DB, SELECT only)
Every `parcels` / `sources:parcels` run with a `skip_rate_pct` row (1984..2714) reads 495,495..498,479 rows and renders a measured value (0.598..0.602), PASS. No run hit the guard. Premise: **latent, no observed run**; the code path exists (compute :533-534).

## Fix
Unmeasured branch reports `{ value: null, detail: { reason: 'no_input' } }` ⇒ `unevaluable` at the declared severity, **FAIL** (`blocking: false`). Behaviour change to note: parcels' `rows_read_floor` is WARN, so a 0-row parcels run moves from audit WARN to audit FAIL (non-blocking; the chain continues). Taken provisionally as the precedent's rule (declared severity); see the report question. Replaces: the silent-0 branch. Compute stays pure.

## Red-first test (`src/tests/steps/pct-checks-evaluate.logic.test.ts`)
* `['parcels','skip_rate_pct']` leaves the PASS-SAFE `it.each` (retired knowingly).
* New `it.each` over `{}` and `{rows_read:0, records_skipped:0}` ⇒ null / no_input, status FAIL.
* Red measured: 2 failed / 34 passed. Green: 9 files, 197/197.

## Regression Guardian (self-pass)
`git blame`: 1414cb73 (2026-09-24 parcels conversion, `violations: 0, detail: null`), reshaped by 004ae733 (2026-09-28, `value: 0`). Fence: safe no-op, no throw. Kept: no throw, no `violations` key. Retired knowingly: the PASS.

## Capture impact (Spec 122 §8)
None on a normal run: goldens `parcels/post/{sources,standalone}.json` carry `0.598` PASS (measured branch). Compute fingerprint moves (shared with the null_address_pct WF3).

## Execution Plan
- [x] Premise SELECT · [x] Red · [x] Fix · [x] Green (one fork) · [x] Guardian self-pass
