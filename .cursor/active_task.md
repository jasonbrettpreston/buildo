# Active Task: Advisory locks + transaction boundaries — WF3-03 (H-W1+H-W2)
**Status:** Implementation — PR-A SHIPPED `b91d8b2`; PR-B in flight
**Workflow:** WF3 — Bug Fix
**Domain Mode:** Backend/Pipeline
**Finding:** H-W1 + H-W2 (paired) · 81-W1/W4, 82-W13, 83-W5/W6/W7, 84-W3, 85-W2/W3, 86-W1/W2, RC-W7
**Rollback Anchor:** `2be7423` (fix(85_trade_forecast_engine): per-trade imminent_window_days)

---

## Context

Six sub-scopes across the 80-86 marketplace tail + orchestrator. Pairing locks and transactions because each alone is insufficient: locks without transactions still leave crash-partial state; transactions without locks still race under concurrent runs.

- **Goal:** Establish uniform concurrency safety + transactional atomicity across the 80-86 tail. Eliminate the worst-case of two simultaneous chain runs producing compound corruption (RC-W7) — today scripts 81/82/85/86 have no lock, run-chain has no chain-level lock, and 83's lock is broken (acquired+released on different pool connections, lock leaks until pool.end).
- **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md` §9.1 transactions + new §9.4 advisory-lock convention (lock ID = spec number; orchestrator uses `hashtext('chain_'+chainId)`).
- **Key Files:**
  - `scripts/run-chain.js` (chain-level lock at run() entry)
  - `scripts/compute-trade-forecasts.js` (lock 85 + wrap DELETE+UPSERT in withTransaction)
  - `scripts/compute-timing-calibration-v2.js` (lock 86 + replace N+1 UPSERT with multi-row VALUES inside withTransaction)
  - `scripts/compute-opportunity-scores.js` (lock 81 + wrap multi-batch UPDATE in withTransaction)
  - `scripts/update-tracked-projects.js` (lock 82; existing withTransaction blocks already cover atomicity)
  - `scripts/compute-cost-estimates.js` (fix lock pinning to a `pool.connect()` client; change ID 74→83; remove per-row try-catch inside withTransaction)
  - `scripts/classify-lifecycle-phase.js` (chunk Phase 2c backfill INSERT)
  - `scripts/lib/pipeline.js` (no SDK changes — `withTransaction` already has nested rollback guard at L108-125)

## State Verification (complete)

- ✅ **SDK ready:** `withTransaction(pool, fn)` (pipeline.js:108-125) wraps BEGIN/COMMIT, rolls back on error with nested-rollback guard, releases client in finally. No SDK changes needed.
- ✅ **84 (gold standard):** lock 85 on `pool.connect()` client (L161), correct release in finally (L777). Phase 2c backfill at L591-605 is the only gap — single unbatched INSERT outside transaction.
- ❌ **83 (broken lock):** L399 `pool.query('SELECT pg_try_advisory_lock(74)')` checks out an ephemeral connection; L551 `pool.query('SELECT pg_advisory_unlock(74)')` checks out a DIFFERENT connection. Session lock survives until original connection is reaped. ID 74 doesn't match spec 83 convention. Per-row try-catch at L375-381 inside flushBatch swallows row errors — withTransaction COMMITs anyway with missing rows.
- ❌ **82:** withTransaction at L225 + L273 (✅); no advisory lock.
- ❌ **81:** No lock; no transaction wrapping the batch UPDATE loop at L114-137.
- ❌ **85:** No lock; bare `pool.query` for DELETE (L341) + per-batch UPSERT loop (L398) — separate auto-commit transactions; crash between leaves stale rows purged + new rows missing.
- ❌ **86:** No lock; N+1 UPSERT loop (L277) — each row is its own auto-commit transaction.
- ❌ **run-chain.js:** No chain-level lock anywhere in `run()` (L25-).

## Sequencing — 3 PRs (ship one at a time)

Splitting into 3 PRs to keep each reviewable in isolation. Each PR runs its own RED→GREEN cycle + adversarial+independent review + commit.

### PR-A — Orchestrator + 85 + 86 (foundation)
- **run-chain.js:** acquire `pg_try_advisory_lock(hashtext('chain_'+chainId))` on a pinned `pool.connect()` client at top of `run()`; release in finally before pool.end(). On lock-held: log + write a `cancelled` chain row + exit clean.
- **85 (compute-trade-forecasts.js):** add `pg_try_advisory_lock(85)` on pinned client (mirror 84's pattern). Wrap stale-purge DELETE (L341) + the entire batch UPSERT loop (L368-414) in a single `pipeline.withTransaction(pool, async (client) => {...})`. Convert all `pool.query` inside to `client.query`. Move pre/post counts inside the transaction so they reflect the same snapshot as the writes.
- **86 (compute-timing-calibration-v2.js):** add `pg_try_advisory_lock(86)` on pinned client. Replace the for-loop N+1 UPSERT at L274-292 with a single multi-row `INSERT … VALUES (…),(…) ON CONFLICT (pipeline, COALESCE(permit_type, '__ALL__')) DO UPDATE SET …` inside `withTransaction`. At 7 cols × ~200 rows = 1400 params — well under §9.2 limit. Move pre/post counts inside.

### PR-B — 81 + 82 (consumers)
- **81 (compute-opportunity-scores.js):** add `pg_try_advisory_lock(81)` on pinned client. Wrap the multi-batch UPDATE loop at L114-137 in `pipeline.withTransaction`. Convert per-batch `pool.query` to `client.query`.
- **82 (update-tracked-projects.js):** add `pg_try_advisory_lock(82)` on pinned client. The two existing `withTransaction` blocks (L225, L273) already cover atomicity — only the lock is missing. Verify both inner blocks use the `client` parameter (they do).

### PR-C — 83 lock-pin fix + remove row-catch + 84 Phase 2c chunking
- **83 (compute-cost-estimates.js):** restructure to use a pinned `pool.connect()` client for the advisory lock (mirror 84 pattern). Change `ADVISORY_LOCK_ID` from 74 → 83 (convention: lock ID = spec number). The existing `withTransaction(pool, ...)` calls at L331 stay using pool — only the lock acquire+release move to the pinned client. Remove the per-row try-catch at L375-381 inside flushBatch — let the row error propagate, withTransaction rolls back the entire batch, outer catch (L453-460) increments `failedBatches += 1` and `failedRows += batch.length`. This is the H-W6 fix that finally makes `failed_rows` non-zero on real failures.
- **84 (classify-lifecycle-phase.js):** Phase 2c backfill at L591-605 — the unbatched `INSERT INTO permit_phase_transitions … SELECT … FROM permits WHERE NOT EXISTS (...)` runs as a single bare `pool.query`. Wrap in `pipeline.withTransaction`. Single-statement `INSERT…SELECT` is left intact rather than chunked: PostgreSQL writes WAL incrementally during the single statement (no in-memory buffering of the full ~237K-row result), the `NOT EXISTS` predicate ensures idempotency on crash-then-retry, and chunking would require ctid pagination + a loop that complicates the idempotency guard. No new advisory lock needed — script already holds lock 85. (Independent PR-C review confirmed the unchunked approach is correctness-equivalent; original "chunked execution" plan wording was over-spec'd.)

## Technical Implementation Details

### Lock-pin pattern (canonical, copy from 84:154-193)
```js
const ADVISORY_LOCK_ID = NN;  // = spec number
const lockClient = await pool.connect();
try {
  const { rows: lockRows } = await lockClient.query(
    'SELECT pg_try_advisory_lock($1) AS got', [ADVISORY_LOCK_ID]);
  if (!lockRows[0].got) {
    pipeline.log.info('[…]', `Advisory lock ${ADVISORY_LOCK_ID} held — exiting`);
    pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0,
      records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere',
        advisory_lock_id: ADVISORY_LOCK_ID }});
    pipeline.emitMeta({}, {});
    lockClient.release();
    return;
  }
} catch (lockErr) { lockClient.release(); throw lockErr; }

try {
  // ... main body unchanged — uses pool for withTransaction etc ...
} finally {
  try { await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]); }
  catch (unlockErr) { pipeline.log.warn('[…]', 'Lock release failed', { err: unlockErr.message }); }
  finally { lockClient.release(); }
}
```

### Run-chain lock (similar but with hashtext)
```js
const chainLockId = hashtext('chain_' + chainId);  // computed via SQL
// (or compute hashtext deterministically in JS — see below)
```
PostgreSQL `hashtext` returns int4. Compute in SQL via `SELECT hashtext($1)::int4`. Cache the value at the top of `run()` after chainId is validated.

## Standards Compliance

- **Try-Catch Boundary:** N/A (pipeline scripts).
- **Unhappy Path Tests:** per script — (a) two concurrent runs: second exits cleanly with `skipped: advisory_lock_held` summary; (b) injected exception mid-loop: post-rollback row counts equal pre-run snapshot; (c) lock release on early-return path doesn't double-release the client.
- **logError Mandate:** N/A — pipeline.log.warn pattern preserved.
- **Mobile-First:** N/A.

## Execution Plan

- [ ] **Rollback Anchor:** `2be7423`.
- [ ] **State Verification:** complete above.
- [ ] **Spec Review:** Add §9.4 to spec 40 declaring advisory-lock-ID convention (lock ID = spec number, orchestrator uses `hashtext('chain_'+chainId)`). Add cross-link from §9.1.
- [ ] **PR-A Implementation** (run-chain + 85 + 86): file changes per "PR-A" above. Tests per script. RED→GREEN. Adversarial + independent review. Triage. Commit. Mark TaskCreate #10 complete.
- [ ] **PR-B Implementation** (81 + 82): file changes per "PR-B". Tests. RED→GREEN. Review. Commit. Mark TaskCreate #11 complete.
- [ ] **PR-C Implementation** (83 + 84): file changes per "PR-C". Tests. RED→GREEN. Review. Commit. Mark TaskCreate #12 complete.
- [ ] **Pre-Review Self-Checklist** (per PR):
  1. Does every advisory lock acquisition pin the same client for release? (Common bug per 83-W5.)
  2. Does each script's `finally` block release the lock on every exit path including early-return for lock-held?
  3. Does the inner `withTransaction` always use the `client` parameter, never `pool` (which would acquire a second connection that doesn't see the in-flight transaction)?
  4. Does the lock-held early-return emit a valid `PIPELINE_SUMMARY` so run-chain doesn't see "no telemetry" and mark the step as failed?
  5. Are pre/post row-count snapshots captured INSIDE the transaction (where applicable) so telemetry deltas reflect the same atomic state as the writes?
- [ ] **Green Light** (per PR): `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6 + independent worktree review. Defer non-critical to `docs/reports/review_followups.md`.

---

**PLAN COMPLIANCE GATE — §10 summary:**

- ⬜ DB: No migrations
- ⬜ API: N/A (no API routes touched)
- ⬜ UI: N/A (front-end out of scope)
- ✅ Shared Logic: 6 scripts adopt the same lock-pin pattern. SDK `withTransaction` is the single source of truth — no in-script BEGIN/COMMIT/ROLLBACK. The pattern is canonical (gold-standard sibling: classify-lifecycle-phase.js).
- ✅ Pipeline: §9.1 transactions are the primary target. §9.2 verify multi-row INSERT in 86 stays under parameter cap (7 × 200 = 1400, safe). §9.3 idempotency preserved — locks + transactions don't change data semantics; the rollback path leaves the pre-run state intact.

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)** — YES (user /proceed)

---

## PR-A Execution Summary (post-WF6 + reviews)

**Scope landed:**
- `scripts/run-chain.js` — chain-level `pg_try_advisory_lock(2, hashtext('chain_'||$1))` on a pinned `pool.connect()` client; release in finally; lock-held path marks externalRunId as cancelled with logged catch.
- `scripts/compute-trade-forecasts.js` — `ADVISORY_LOCK_ID = 85` on pinned client; entire DELETE+UPSERT pipeline (including pre/post counts) wrapped in single `pipeline.withTransaction`.
- `scripts/compute-timing-calibration-v2.js` — `ADVISORY_LOCK_ID = 86` on pinned client; N+1 UPSERT replaced with chunked multi-row INSERT (`CALIBRATION_BATCH_SIZE = 5000`) inside `withTransaction`; pre/post counts moved inside the transaction.
- `docs/specs/pipeline/40_pipeline_system.md` §3.5 — lock-ID convention (1-arg per-script vs 2-arg chain), keyspace-separation rationale, structural reference to canonical pattern in `classify-lifecycle-phase.js`.
- `src/tests/{chain.logic,compute-trade-forecasts.infra,compute-timing-calibration-v2.infra}.test.ts` — regex assertions for lock acquisition pattern, multi-row VALUES INSERT, withTransaction wrap; negative anchors against the rejected forms.

**Results:** Full suite 3,859/3,859 pass; lint + typecheck clean.

## Adversarial + Independent Review Triage
- **Independent (worktree):** 1 FAIL (86 pre-count outside txn) → **FIXED inline**; 1 cosmetic WARN (spec wording) → **FIXED inline**; 1 WARN (fatal-handler explicit release) → deferred.
- **Gemini:** 1 CRITICAL (param cap) → **FIXED via 5000-row chunking**; 1 MEDIUM (silent catch) → **FIXED with logged catch**; 1 LOW (1-arg/2-arg keyspace collision) → **FIXED switching chain lock to 2-arg**; 1 HIGH (connection leak) → deferred (TCP-close releases lock).
- **DeepSeek (retry):** 1 LOW (spec line-number references) → **FIXED inline** (removed line numbers, structural anchor only); 2 already-addressed; 5 rejected as overstated/false-positive (re-verified vs Independent's earlier rejection of the same class); 2 deferred (pre-existing perf, theoretical hashtext collision).

All deferred + rejected items logged in `docs/reports/review_followups.md`.

**Status: PR-A SHIPPED `b91d8b2`.**

---

## PR-B Execution Summary (post-WF6 + reviews)

**Scope landed:**
- `scripts/compute-opportunity-scores.js` — `ADVISORY_LOCK_ID = 81` on pinned `pool.connect()` client; outer try/finally; multi-batch UPDATE loop wrapped in `pipeline.withTransaction` (`pool.query` → `client.query` inside).
- `scripts/update-tracked-projects.js` — `ADVISORY_LOCK_ID = 82` on pinned client + outer try/finally; existing `withTransaction` blocks unchanged (already covered atomicity).
- `src/tests/{compute-opportunity-scores,update-tracked-projects}.infra.test.ts` — regex assertions for lock acquisition pattern + (81) `withTransaction` wrap; negative anchors against `pool.query`-based lock acquire/release.

**Results:** Full suite 3,862/3,862 pass; lint + typecheck clean.

## Adversarial + Independent Review Triage
- **Independent (worktree):** 9 PASS / 0 FAIL / 2 WARN (both non-blocking) — test-expressiveness gap deferred; 81-W5 IS-DISTINCT-FROM overcount already tracked from holistic triage.
- **DeepSeek:** 8 findings, all rejected as restatements / false positives / premature (1 HIGH "fragile lock release" + 3 MEDIUM same-class as PR-A + 4 LOW/NIT). Independent independently verified the rejection class.
- **Gemini:** API 503'd both attempts during the review window; coverage from DeepSeek + Independent sufficient.

All deferred + rejected items logged in `docs/reports/review_followups.md`.

**Status: PR-B SHIPPED `dc67c4e`. PR-C READY FOR COMMIT.**

---

## PR-C Execution Summary (post-WF6 + reviews)

**Scope landed:**
- `scripts/compute-cost-estimates.js`: `ADVISORY_LOCK_ID` 74 → 83 (lock_id = spec number convention); lock acquired on pinned `pool.connect()` client + outer try/finally with logged-warn on unlock failure (fixes 83-W5/W7); per-row try/catch inside `flushBatch` REMOVED — row error now propagates to withTransaction → ROLLBACK → outer catch increments `failedBatches+failedRows` (fixes 83-W6 false-green).
- `scripts/classify-lifecycle-phase.js`: Phase 2c initial-transition backfill wrapped in `pipeline.withTransaction`; bare `pool.query` INSERT replaced with `client.query` inside the transaction callback. Single-statement `INSERT…SELECT` left unchunked — atomicity provides crash safety, NOT EXISTS guard provides idempotency, WAL is written incrementally so no in-memory buffering of 237K rows (fixes 84-W3).
- `src/tests/{compute-cost-estimates,classify-lifecycle-phase}.infra.test.ts`: regex assertions for new patterns; updated existing 74→83 anchor.

**Results:** Full suite 3,866/3,866 pass; lint + typecheck clean.

## Adversarial + Independent Review Triage
- **Independent (worktree):** 10 PASS / 0 FAIL / 3 WARN. WARN-2 (test anchor) → **FIXED inline**; WARN-3 (plan/code drift on chunking) → **FIXED inline** (active_task wording updated); WARN-1 (cosmetic struct gap) → deferred.
- **Gemini:** 1 HIGH (pre-existing N+1 in flushBatch) → deferred; 1 MEDIUM (let vs const cosmetic) → rejected; 1 NIT (catch-in-catch symmetry) → **FIXED inline**; 1 MEDIUM (regex tests) → rejected (codebase convention).
- **DeepSeek:** 1 CRITICAL (double-release) → REJECTED (same false-positive class as every prior PR; lock-not-acquired path returns BEFORE outer try); 1 HIGH (silent unlock failure) → rejected (pool.end TCP-closes session); 2 MEDIUM (savepoints / rollback metric) → REJECTED as overstated; 2 LOW + 1 NIT → rejected/deferred (pre-existing or invalid).

All deferred + rejected items logged in `docs/reports/review_followups.md`.

**Status: PR-C READY FOR COMMIT — awaiting user authorization. WF3-03 complete after PR-C lands.**
