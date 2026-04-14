◇ injected env (18) from .env // tip: ⌘ override existing { override: true }
🔍 Adversarial review of scripts/compute-trade-forecasts.js

**[HIGH]** (line 130-137): Unbounded query loading all active permit-trade pairs violates §3.2 Pagination Enforcement. At scale (millions of rows), this will exhaust memory and crash. Fix: Use `pipeline.streamQuery()` with cursor or implement batch-by-batch processing with `OFFSET/LIMIT`.

**[MEDIUM]** (line 230-243): DELETE of stale forecasts executes outside transaction boundary with subsequent INSERT batches, violating §9.1 Transaction Boundaries. If script crashes between DELETE and INSERT completion, forecasts table will be partially empty. Fix: Wrap entire step 3b + step 4 in explicit `BEGIN`/`COMMIT` with proper rollback handling.

**[MEDIUM]** (line 180-183): No validation that `phase_started_at` is valid Date. If upstream data corruption yields invalid date string (e.g., '0000-00-00'), `new Date()` returns `Invalid Date`, `setUTCHours` silently produces `NaN`, causing `predictedStart` to be invalid and daysUntil to be `NaN`. Fix: Add guard: `if (isNaN(anchorDate.getTime())) { log warning; skip row; }`.

**[MEDIUM]** (line 110-113): Missing null-safety for `PHASE_ORDINAL` lookup. If `lifecycle_phase` contains unexpected value (e.g., due to migration bug), `currentOrdinal` becomes `undefined`, causing `currentOrdinal <= bidOrdinal` comparison to always be false (undefined <= number → false), incorrectly routing all unknown phases to work window. Fix: Use `PHASE_ORDINAL[lifecycle_phase] ?? null` and handle null case (skip or default).

**[LOW]** (line 54): `expiredThreshold` normalization `-Math.abs(expiredThreshold)` assumes threshold is stored as positive integer but used as negative offset. If DB stores `90` (positive) instead of `-90`, normalization flips sign incorrectly. Fix: Document expected sign in `classifyUrgency` JSDoc or assert sign on load.

**[LOW]** (line 199-203): Stall penalty application uses `logicVars.stall_penalty_precon` and `stall_penalty_active` without validation. If DB returns `NULL` or negative value, predictions shift incorrectly. Fix: Add `Math.max(0, penalty)` guard and default fallback values.

**[NIT]** (line 87-89): `classifyConfidence` returns 'low' for `sampleSize === 0`. However, `cal.sample` from lookupCalibration could be `null` (if DB row has NULL), not handled. Fix: Use `(sampleSize ?? 0)`.

**[NIT]** (line 280-281): UPSERT uses `computed_at = NOW()` only on conflict update, not on insert. New rows will have `computed_at` as default (null). Fix: Move `computed_at = NOW()` outside DO UPDATE block or set in both paths.

**[NIT]** (line 34-36): `SKIP_PHASES` includes 'O4' as "architecturally unreachable but defensive". This is dead code that suggests incomplete understanding of lifecycle state machine. If O4 truly unreachable, remove; if reachable, document why.

**[CRITICAL]** (line 164-168): Bimodal routing logic flaw: `currentOrdinal <= bidOrdinal` uses `<=`, meaning when current phase equals bid phase, target remains bid window. However, comment says "being AT the bid phase means the window is OPEN". This creates perpetual bid targeting for permits stuck at bid phase ordinal, preventing transition to work window even when physically past that phase. This contradicts self-healing design. Fix: Use `<` not `<=` for bid window eligibility.

**Overall verdict:** The script contains one critical logic flaw in bimodal routing that undermines the core self-healing mechanism, multiple medium-severity data safety issues (unbounded query, missing transactions, invalid date handling), and several low-severity edge cases. It is not production-ready for scale. Immediate fixes required: correct the bimodal comparison operator, implement streaming or pagination, wrap mutations in transactions, and add data validation guards. The architectural design is sound but implementation robustness is lacking.

---
⏱  109117ms (109.1s)
📊 Tokens — total: 10921, input: 7545, output: 3376, reasoning: 2459
