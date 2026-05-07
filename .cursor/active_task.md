# Active Task: WF3 — classify-permits.js crashes with FK violation when migration 118 (realtor trade) not yet deployed
**Status:** Implementation (authorized 2026-05-07 — explicit "proceed")
**Workflow:** WF3 — Bug Fix
**Domain Mode:** Backend/Pipeline (`scripts/classify-permits.js`, `scripts/lib/pipeline-realtor-availability.js`, mirror in `src/lib/sync/process.ts`)
**Rollback Anchor:** `787c0c8` (current HEAD — last WF3 commit)

## Bug

`scripts/classify-permits.js` crashes mid-pipeline with:

```
error: Key (trade_id)=(33) is not present in table "trades".
constraint: 'permit_trades_trade_id_fkey'
```

**Reproduced** by user running step 13 of the permits pipeline (`Spec 41 chain_permits.md`). The classifier ran for some time, then hit the FK violation on the first INSERT batch that included a realtor row.

**Root cause:** Cycle 7 (commit `2901fcd`) added unconditional realtor classification:
- `scripts/classify-permits.js` — `appendRealtorMatch` JS helper (lines ~393-415)
- `src/lib/classification/classifier.ts` — `appendRealtorMatch` TS helper (used by `src/lib/sync/process.ts`)

Both write `permit_trades` rows with `trade_id=33`, `trade_slug='realtor'`. But `trades.id=33` only exists once `migrations/118_realtor_trade.sql` is applied. In dev environments where migration 118 hasn't been run yet, the FK constraint fires and the entire classify-permits pipeline crashes.

**Cycle 7's deployment runbook** documented "Step 1: Run migration 118". But the user doesn't always run migrations before pipeline scripts (and `classify-permits.js` is part of step 13 of `chain_permits.md`, which orchestrates many scripts and shouldn't fail catastrophically on a missing prerequisite migration).

## State Verification (WF3 step 2)

**FK constraint** (verified via the crash output): `permit_trades.trade_id REFERENCES trades.id`. Inserting `trade_id=33` requires `trades.id=33` to exist.

**Affected sites** (verified via grep for the realtor append helpers):
- `scripts/classify-permits.js` line ~411-423 — the `appendRealtorMatch` JS helper writes `trade_id: REALTOR_TRADE_ID_JS` (constant `33`)
- `src/lib/classification/classifier.ts` line ~370-410 — the `appendRealtorMatch` TS helper writes `trade_id: REALTOR_TRADE_ID` (constant `33`)
- `src/lib/sync/process.ts` consumes the TS classifier — same FK risk

**Other pipeline scripts that write permit_trades** (per Cycle 7 changes): `scripts/reclassify-all.js` calls the TS classifier — same risk.

**`scripts/backfill-realtor-permit-trades.js`** has a startup guard (Cycle 7 commit) that explicitly checks for the realtor trade row and throws a clear error message. So the backfill script handles this case correctly today; the classification scripts don't.

## Spec Review (WF3 step 3)

- **Spec 41 (chain_permits)** — orchestrates the permit pipeline. Step 13 = classify-permits. A FK crash here cascades into pipeline-wide failure.
- **Spec 47 §R5** — "Startup guard: validate required env vars / config BEFORE acquiring lock." This rule extends naturally to "validate required DB rows before mutating dependent tables."
- **Spec 91 §1.2 algorithmic invariant** — persona-specific behavior expressed via DB calibration only. Cycle 7's intent: a missing realtor row means realtors don't get classified. Doesn't say "the classifier crashes". A graceful-skip behavior aligns with the invariant.
- **Spec 91 §3.5 wire-up dependencies** — documented Cycle 7 as the migration that adds the trade row. If a deployment runs the code BEFORE the migration, that's a real-world risk we should handle defensively.

## Reproduction (WF3 step 4)

Direct: `node scripts/classify-permits.js` against a DB without migration 118 applied → FK crash. **Reproduced just now**; the dev DB on this machine has the unfixed state, so the bug is reliably reproducible.

Test reproduction (vitest): mock the DB query for the realtor lookup to return zero rows, run the classifier on a permit, assert no realtor TradeMatch is appended (and no FK risk surfaces).

## Fix (WF3 step 5)

**Strategy: startup-guard pattern.** At the start of each affected pipeline script, query the `trades` table for `id=33 AND slug='realtor'`. If found → enable realtor classification (default). If not found → set a module-level flag `REALTOR_AVAILABLE = false`, log a clear warning, and have the `appendRealtorMatch` helpers no-op. The pipeline completes successfully with construction-trade classification; realtor classification is disabled until migration 118 is applied.

Mirrors the pattern already in `scripts/backfill-realtor-permit-trades.js` (which throws on missing realtor row — appropriate there because the script's whole purpose IS realtor backfill; pointless to run if the row is missing). For the classification scripts, graceful-skip is preferred because their primary purpose (construction-trade classification) is unaffected by realtor availability.

**Files:**

1. **NEW** `scripts/lib/pipeline-realtor-availability.js` — pure helper `async checkRealtorAvailable(pool)` returning `boolean`. One DB round-trip; logs warning if missing.
2. **MODIFIED** `scripts/classify-permits.js` — at startup (after `pipeline.run` opens the lock), call the helper. Pass the boolean to `classifyPermit`'s call sites OR set a module-level flag the `appendRealtorMatch` helper reads.
3. **MODIFIED** `src/lib/classification/classifier.ts` — accept a `realtorAvailable: boolean` option in `appendRealtorMatch`. Default `true` (preserves current behavior for tests); call sites in `src/lib/sync/process.ts` and `scripts/reclassify-all.js` pass `false` when the DB lookup says realtor row is missing.
4. **MODIFIED** `src/lib/sync/process.ts` — perform the same startup check; pass `realtorAvailable` to classifier.
5. **MODIFIED** `scripts/reclassify-all.js` — same.
6. **NEW** `src/tests/realtor-availability-guard.logic.test.ts` — vitest covering: helper returns true when row exists, false when row absent, false on query error (defensive); classifier's `appendRealtorMatch` is a no-op when `realtorAvailable=false`.

## Idempotency Check (Backend/Pipeline mandate)

The fix is read-only at the guard level (one SELECT against `trades` per script invocation). Doesn't change write behavior — it just decides whether the realtor INSERT runs. Re-running the script after migration 118 is applied: the guard returns `true` next time → realtor classification re-enabled → classify-permits inserts the realtor rows for any permits processed in that run. Existing permit_trades rows with realtor are unaffected (the script uses `ON CONFLICT DO UPDATE`).

## Pre-Review Self-Checklist

3-5 sibling bugs that could share the same root cause:

1. **Other deployment-time DB seeds.** `trade_configurations` for realtor is also seeded in migration 118. Does any other pipeline script reference `trade_configurations` for the realtor row directly? If yes, same guard pattern needed. (Spot-check: `compute-trade-forecasts.js` reads `trade_configurations` via `loadMarketplaceConfigs` — handles missing rows defensively per existing logic.)
2. **`scripts/lib/lifecycle-phase.js` JS mirror's `TRADE_TARGET_PHASE_FALLBACK.realtor` entry.** Pure constant; no DB FK risk. Fine.
3. **TS `TRADE_TARGET_PHASE_FALLBACK.realtor` in lifecycle-phase.ts.** Same — pure constant. Fine.
4. **`scripts/backfill-realtor-permit-trades.js`** — already has the startup guard (Cycle 7). Reference implementation.
5. **`reclassify-all.js`** — uses the TS classifier. Same FK risk. Must apply the guard.

## Independent Review (WF3 protocol)

Single worktree code-reviewer agent at the end. Inputs: spec paths (41 + 47 + 91), modified files, one-sentence summary. No adversarial agents (WF3 default).

## Execution Plan

- [ ] **R1** — Rollback anchor: `787c0c8`. Confirmed.
- [ ] **R2** — Reproduction (red light): write `src/tests/realtor-availability-guard.logic.test.ts` covering classifier no-op when `realtorAvailable=false`. Test fails today (current code unconditionally appends realtor).
- [ ] **F1** — `scripts/lib/pipeline-realtor-availability.js`: pure helper `checkRealtorAvailable(pool)`.
- [ ] **F2** — `src/lib/classification/classifier.ts`: add `realtorAvailable` option to `appendRealtorMatch`; default true.
- [ ] **F3** — `scripts/classify-permits.js`: at script-startup, call the helper; pass result to the JS `appendRealtorMatch` (mirror the TS option pattern).
- [ ] **F4** — `src/lib/sync/process.ts`: at sync-start, call the helper once; pass `realtorAvailable` to each `classifyPermit` invocation.
- [ ] **F5** — `scripts/reclassify-all.js`: same.
- [ ] **G1** — `npx vitest run src/tests/realtor-availability-guard.logic.test.ts` → green.
- [ ] **G2** — Re-run `node scripts/classify-permits.js` against the live dev DB (which doesn't have migration 118 applied) → completes successfully with realtor disabled.
- [ ] **G3** — Apply migration 118 (`npm run migrate`); re-run classify-permits → completes successfully with realtor enabled.
- [ ] **G4** — `npm run typecheck && npm run lint -- --fix`; full vitest suite for regressions.
- [ ] **G5** — Independent review (worktree code-reviewer agent).
- [ ] **G6** — Triage findings.
- [ ] **G7** — Commit + push.

## Out of Scope (queued)

- Verifying the WF3 orphan fix works against 15 Derwyn — that requires the pipeline to complete first. Once this WF3 lands + migrations apply, run `classify-lifecycle-phase.js` → `compute-trade-forecasts.js` → refresh Flight Center.
- Spec 47 §R5 amendment to formalize the startup-guard pattern for cross-table FK dependencies. Defer to a separate documentation WF.

## Standards Compliance

* **Try-Catch Boundary:** the guard helper wraps the SELECT in try/catch, returning `false` on any error (defensive — better to skip realtor than crash the pipeline).
* **Unhappy Path Tests:** test covers (a) row exists, (b) row missing, (c) query throws.
* **logError Mandate:** guard uses `pipeline.log.warn` for missing-row case (operator visibility on why realtor classification is disabled).
* **UI Layout:** N/A.

> **PLAN LOCKED. Authorize? (y/n)**
