# Active Task: Unblock Step 21 (classify_lifecycle_phase) — TDZ ReferenceError
**Status:** Implementation (pre-authorized per Spec 79 §3c auto-unblock budget)
**Workflow:** WF3 (in-budget auto-unblock; Independent reviewer sanity-check below)
**Trigger:** Spec 79 validation Step 21 crashed with `ReferenceError: Cannot access 'lifecycleStatusHistoryErrors' before initialization`

---

## Goal
Unblock `scripts/classify-lifecycle-phase.js` permit-side flushPermitBatch which currently crashes whenever the SAVEPOINT catch path fires (Phase I.1.1b ledger writer).

## Reproduction (Step 21 evidence)

```
[run-step] Pre-snapshot for permits/21 classify_lifecycle_phase
[run-step] Executing: node scripts/classify-lifecycle-phase.js
[run-step] Post-snapshot (exit=1, dur=4441ms)
Final status: FAIL
```

stderr tail:
```
ReferenceError: Cannot access 'lifecycleStatusHistoryErrors' before initialization
  at scripts/classify-lifecycle-phase.js:1019:11
  at flushPermitBatch (scripts/classify-lifecycle-phase.js:928:5)
```

## Root cause analysis

Phase I.1.1b (commit `73b257b`) added the audit counter accumulators:
- `lifecycleStatusHistoryInserted` at line 1176
- `lifecycleStatusHistoryErrors` at line 1177

These are declared with `let` at line 1176-1177 — **inside the CoA-side section** of the script.

The `flushPermitBatch` function at line 890 references them (line 1019 in the SAVEPOINT catch block):
```js
lifecycleStatusHistoryErrors++;
```

`flushPermitBatch` is called from the permits streaming loop which executes BEFORE the CoA section runs. So at call time, the `let`-declared variables are in **temporal dead zone** (TDZ): hoisted but not yet initialized → access throws ReferenceError.

The bug was latent in Phase I.1.1b because:
- Logic-test suite doesn't trigger the SAVEPOINT path (BEFORE INSERT trigger fault injection in `lifecycle-status-history-writers.db.test.ts` is currently `describe.skip` — Phase I.1.1a deferred for fixture work)
- Phase I.1.1b's "happy path" works because flushPermitBatch's other counters (`permitsUpdated`, `transitionsLogged`) ARE declared earlier (line 854-856)
- The TDZ only fires on the catch path — and only triggers if the ledger INSERT fails (rare in tests)

## Proposed fix (4-line move)

Move lines 1176-1177 from the CoA section to right after the existing permit-side counter declarations at line 855.

**Add at line 856** (after existing `let permitsUpdated = 0;`):
```js
// Phase I.1.1b: classifier-side lifecycle_status_history ledger counters
// Shared between flushPermitBatch (permit-side) and flushCoaBatch (CoA-side).
// Declared at script scope here so the permit-side SAVEPOINT catch path
// (line ~1019) can increment lifecycleStatusHistoryErrors without TDZ.
let lifecycleStatusHistoryInserted = 0;
let lifecycleStatusHistoryErrors = 0;
```

**Remove from line 1176-1177:**
```js
let lifecycleStatusHistoryInserted = 0;
let lifecycleStatusHistoryErrors = 0;
```

Net change: -2 +6 = +4 LOC.

## Pre-authorization rationale (Spec 79 §3c in-budget criteria)

- Single file: ✓ (`scripts/classify-lifecycle-phase.js`)
- ≤10 LOC: ✓ (+4 net)
- Non-destructive: ✓ (variable scoping change; no logic, no SQL change)
- Not migration / SDK / config / test: ✓
- Not `OR IS NULL` on non-classifier column: ✓ (no SQL touched)
- Behavior-preserving: ✓ — variables are still declared at script scope; only moved upward in source order. All call sites unchanged. The SAVEPOINT catch path that was crashing now increments the counter correctly.

## Independent reviewer sanity check (pending — to be spawned)

The reviewer must confirm:
1. The fix is genuinely in-scope per §3c (above)
2. The variable move is behavior-preserving (no other declarations of these names; no scoping leak)
3. No other TDZ-equivalent bugs in the same file

If reviewer agrees: apply fix, re-run Step 21, full C1-C12 + idempotency double-run, archive task to `closed_task_*`, record in SUMMARY.md.

If reviewer disagrees: halt; escalate to user.
