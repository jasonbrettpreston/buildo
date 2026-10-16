# Active Task: WF3 — parcels null_address_pct reports 0 when unexamined
**Status:** Implementation (lane D1b, 2026-10-14; operator directive: execute directly)
**Domain Mode:** Backend/Pipeline
**Workflow:** WF3
**Branch / worktree:** `wf3/null-address-number-pct` @ 2d7b0d84, `C:/Users/User/Buildo-wt-addrnum` (shared; this WF3's hunks are unstaged, patch `d1b/wf3c-null-address-pct-parcels.patch`, applies after wf3b)

## Context
* **Goal:** `null_address_pct` (`scripts/lib/compute/load-parcels.js`) reports `{ value: 0, detail: null }` when `acquired.rows_shaped` / `column_nulls.address_number` is absent or `rows_shaped <= 0` ⇒ PASS on a check that examined nothing.
* **Target Spec:** `docs/specs/01-pipeline/55_source_parcels.md` (checks[], PR-D2); Spec 124 §7 Step 2 (LM-D14) + Rule 10; Spec 122 §8. 68/69: N/A.
* **Precedent:** `null_address_number_pct` WF3 (same worktree), its exact twin.
* **Execution Provider:** claude — Spec 08 §B downgrade, logged: operator directive 2026-10-14.

## Premise (MEASURED, dev DB, SELECT only)
`parcels` run **1984** (2026-09-24, completed, `rows_read` 495,495) rendered `{"value": null, "metric": "null_address_pct", "status": "PASS", "threshold": "pct <= 0.1"}`: it examined 0 rows and PASSed. That run predates the 0o re-point (657221ea); every later run reads `"100.0%"` WARN (PR-D2, measured branch). Premise: TRUE on the code path, 1 measured historical instance.

## Fix
Unmeasured branch reports `{ value: null, detail: { reason: 'no_input' } }` ⇒ `unevaluable` at the declared severity, WARN. Replaces: the silent-0 branch. Compute stays pure.

## Red-first test
* `pct-checks-evaluate.logic.test.ts`: the last PASS-SAFE row leaves; the block is renamed "empty acquired is never PASS"; new `it.each` over `{}` and `{rows_shaped:0, column_nulls:{address_number:0}}` ⇒ null / no_input, WARN.
* `parcels/violations.test.ts` (the "null_address_pct is silent" lock, ~:974): retargeted to null / no_input; its no-throw half is kept.
* Red measured: 3 failed / 97 passed. Green: 16 files, 285/285 (all three D1b WF3s + precedent).

## Regression Guardian (self-pass)
`git blame`: 657221ea (2026-09-24, re-point onto 0o counters, `violations: 0`), reshaped by 004ae733 (2026-09-28, `value: 0`). Fence (the lock's own words): "the pre-0o short-circuit stays a safe no-op, never a crash". Kept: no crash. Retired knowingly: "silent". review_followups.md:4113 names this exact silent-PASS as the defect.

## Capture impact (Spec 122 §8)
None on a normal run: goldens carry `"100.0%"` WARN (measured branch). Compute fingerprint moves (shared with the parcels skip_rate_pct WF3).

## Execution Plan
- [x] Premise SELECT · [x] Red · [x] Fix · [x] Green (one fork) · [x] Guardian self-pass
