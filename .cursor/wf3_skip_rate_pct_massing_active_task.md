# Active Task: WF3 — massing skip_rate_pct reports violations 0 when nothing was read
**Status:** Implementation (lane D1b, 2026-10-14; coordinator-authorized WF3-d)
**Domain Mode:** Backend/Pipeline
**Workflow:** WF3
**Branch / worktree:** `wf3/null-address-number-pct` @ 2d7b0d84, `C:/Users/User/Buildo-wt-addrnum` (shared; hunks unstaged, patch `d1b/wf3d-skip-rate-massing.patch`, applies after wf3c)

## Context
* **Goal:** `skip_rate_pct` (`scripts/lib/compute/load-massing.js`) reports `{ violations: 0, detail: null }` when `rows_read` is absent or `<= 0`. The descriptor limit is `viol == 0` (STRICT legacy boundary, compute-side compare), so the 0 renders PASS: green because it never looked.
* **Target Spec:** the massing source spec (descriptor `load-massing.descriptor.json` checks[5]); Spec 124 §7 Step 2 (LM-D14) + Rule 10. 68/69: N/A.
* **Precedent:** `null_address_number_pct` WF3 (same worktree).
* **Execution Provider:** claude — Spec 08 §B downgrade, logged: operator directive 2026-10-14.

## Premise (MEASURED, dev DB, SELECT only)
42 `massing` / `sources:massing` runs (2046..2710) carry a `skip_rate_pct` row; every one has `features_read_floor` 428,184 and skip value `0` (not null), PASS: the measured branch. No run hit the guard. Premise: **latent, no observed run**; code path exists (compute :200-201).

## Fix
Unmeasured branch reports `{ value: null, detail: { reason: 'no_input' } }` (byte-for-byte the precedent). In `verdict.js` (unchanged) the `viol == 0` arm takes `measured` from `violations` then `value`; both absent/null ⇒ `unevaluable: check reported no violation count` at the declared severity, FAIL (`blocking: false`). Massing's `features_read_floor` is WARN, so a 0-row massing run moves from audit WARN to FAIL, the same posture as parcels (operator Q1, held as built). Replaces: the silent-0 branch. Compute stays pure (the 3 G7 sites in this file, :158/:209/:237, are pre-existing and untouched).

## Red-first test (`src/tests/steps/massing/violations.test.ts`)
* New `it.each` over `{}` and `{rows_read:0, …counters 0}` ⇒ `{value:null, detail:{reason:'no_input'}}`, real `verdict.checkRow` status FAIL.
* Red measured: 2 failed / 49 passed (`expected { violations: +0, detail: null } to deeply equal { value: null, … }`). Green: 25 files passed (2 db files skipped), 1786 tests.

## Regression Guardian (self-pass)
`git blame`: whole function from 98412d53 (2026-09-28, massing conversion), unchanged since. Fence: a safe no-op on missing counters (no throw). Kept: no throw. Retired knowingly: the PASS. No existing lock pinned the empty-input shape (grep).

## Capture impact (Spec 122 §8)
None on a normal run: massing goldens carry `0` PASS from the measured branch. Compute fingerprint moves.

## Execution Plan
- [x] Premise SELECT · [x] Red · [x] Fix · [x] Green (one fork) · [x] Guardian self-pass
