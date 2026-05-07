# Active Task: WF2 — Cycle 7: Realtor backend wire-up (per Spec 91 §3.5)
**Status:** Implementation (authorized 2026-05-06)
**Workflow:** WF2 — Feature Enhancement (extends the realtor persona's backend so a `trade_slug='realtor'` profile gets non-empty feed + flight-board responses end-to-end)
**Domain Mode:** Backend/Pipeline (touches `src/lib/classification/`, `src/features/leads/`, `migrations/`, `scripts/classify-permits.js`, `scripts/reclassify-all.js`, `src/lib/sync/process.ts`)
**Rollback Anchor:** `88c6671` (current HEAD — last Cycle 6 commit)

## Source

Spec 91 §3.5 (just amended in Cycle 6) enumerates the 5 deliverables Cycle 7 must ship before realtors get a non-empty feed. Product calls confirmed in conversation:
- **`predicted_start` semantics:** late stage (≈ P19 winddown / P20 occupancy) — "build complete, ready to list"
- **Visibility timing:** earliest possible — realtor `permit_trades` rows added at the same point construction-trade rows are added (= the moment classify-permits processes the permit)
- **Single trade slug:** `'realtor'` only (NOT `'realtor-listing'` + `'realtor-closing'`); the §1.2 algorithmic invariant is satisfied via DB calibration only
- **`permit_trades` association:** option (a) MANDATED per Spec 91 §3.5 item 4 — every active permit gets a `(permit_id, 'realtor')` row

## State Verification (WF2 step 1)

**Match-everything mechanism:** trade_mapping_rules tier 1 rules (the only tier classify-permits.js applies) use exact-string matching against fields like `permit_type` / `work` / `description`. There's no native "match all permits" pattern at tier 1 — tier 3 has regex but is intentionally excluded from the classifier (`if (rule.tier !== 1) continue` at scripts/classify-permits.js). **Implementation choice:** add an unconditional code branch in classify-permits.js (and the parallel writer in `src/lib/sync/process.ts`) that always inserts a realtor `permit_trades` row alongside any matching construction trade rows. Cleaner than a magic regex in the rules table; easier to reason about.

**`TRADE_TARGET_PHASE_FALLBACK` schema** (`src/lib/classification/lifecycle-phase.ts:218`): `Record<trade_slug, { bid_phase: string, work_phase: string }>`. Used by `getLeadFeed` + flight-board endpoint via `TRADE_TARGET_PHASE` alias. Realtor entry: `bid_phase: 'P1'` (intake — earliest visibility), `work_phase: 'P19'` (winddown — latest stage; predicted_start aligns with project completion).

**`trade_configurations` DB table** is the canonical source loaded via `loadMarketplaceConfigs()` (Spec 47 §4.1); `TRADE_TARGET_PHASE_FALLBACK` is the last-resort fallback. Both must include the realtor entry for the system to honor it under DB-loaded config OR fallback.

**Migration numbering:** latest is `117_notification_prefs_flatten.sql`. Cycle 7 migration is **118**.

**`permit_trades` writers** (verified): `scripts/classify-permits.js:641`, `scripts/reclassify-all.js:127`, `src/lib/sync/process.ts:119`, `src/lib/sync/process.ts:185`. All four sites need realtor coverage.

**Backfill volume:** `permit_trades` row count is on the order of millions today. Adding one realtor row per active permit ~doubles the table size. Spec 91 §3.5 item 4 acknowledges and accepts this cost.

**`competition_count` impact:** the `getLeadFeed` JOIN scopes `competition_count` to `lv2.trade_slug = $X`. Realtors saving a permit increment competition_count ONLY for OTHER realtors viewing the same permit (because their JOIN is scoped to `trade_slug='realtor'`). Tradespeople's competition_count is unaffected. This is correct — it's the algorithmic invariant working as intended. NO change needed.

## Contract Definition (WF2 step 2)

**No public API contract changes.** All endpoint contracts (`/api/leads/feed`, `/api/leads/flight-board`, `/api/leads/detail/:id`, `/api/leads/save` from Cycle 4 P5) remain identical. The change is purely internal:

| Surface | Change |
|---|---|
| `TRADES` array (`src/lib/classification/trades.ts`) | New entry id 33, slug 'realtor', name 'Real Estate Agent', icon TBD, color TBD, sort_order 33 |
| `TRADE_TARGET_PHASE_FALLBACK` (`src/lib/classification/lifecycle-phase.ts`) | New entry `realtor: { bid_phase: 'P1', work_phase: 'P19' }` |
| DB `trades` table | Migration 118 INSERT: id 33, slug 'realtor' |
| DB `trade_configurations` table | Migration 118 INSERT: realtor row mirroring fallback values |
| DB `permit_trades` table | Backfill script inserts `(permit_num, revision_num, realtor_trade_id, ...)` for every active permit |
| `scripts/classify-permits.js` | Unconditional realtor branch alongside trade_mapping_rules application |
| `scripts/reclassify-all.js` | Same unconditional branch (mirrors classify-permits) |
| `src/lib/sync/process.ts` | Same unconditional branch in both INSERT sites (lines 119 + 185) |

**`npm run typecheck` after the TRADES + TRADE_TARGET_PHASE_FALLBACK edits** to confirm no consumer breakage. Both objects are typed `Readonly` and exhaustive — adding a key shouldn't break anything, but typecheck verifies.

## Spec Update (WF2 step 3)

Spec 91 §3.5 already documents the wire-up contract (Cycle 6 lock-in). Cycle 7's spec change is a single line: update the §3.5 preamble from "Cycle 7 — pending" to "Cycle 7 — completed" once shipped. No other spec text needs amendment.

## Schema Evolution (WF2 step 4)

**`migrations/118_realtor_trade.sql` (UP):**
```sql
-- 118_realtor_trade.sql
-- Wires the realtor persona into the data layer per Spec 91 §3.5.
-- Adds the realtor row to `trades` and `trade_configurations`.
-- Backfill of `permit_trades` is handled by a separate runtime script
-- (scripts/backfill-realtor-permit-trades.js) — NOT in this migration
-- because the row count is large enough that a transactional migration
-- would lock the table for too long.

INSERT INTO trades (id, slug, name, icon, color, sort_order)
VALUES (33, 'realtor', 'Real Estate Agent', '<icon>', '<color>', 33)
ON CONFLICT (id) DO NOTHING;

INSERT INTO trade_configurations (trade_slug, bid_phase, work_phase, ...)
VALUES ('realtor', 'P1', 'P19', ...)
ON CONFLICT (trade_slug) DO UPDATE SET
  bid_phase = EXCLUDED.bid_phase,
  work_phase = EXCLUDED.work_phase,
  ...;
```

**Backfill script `scripts/backfill-realtor-permit-trades.js`:**
```sql
INSERT INTO permit_trades (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score, classified_at)
SELECT p.permit_num, p.revision_num, 33, 1, 1.0, true, NULL, NULL, NOW()
FROM permits p
WHERE NOT EXISTS (
  SELECT 1 FROM permit_trades pt2
  WHERE pt2.permit_num = p.permit_num
    AND pt2.revision_num = p.revision_num
    AND pt2.trade_id = 33
);
```
Idempotent (NOT EXISTS). Runs in batches of 10k rows to avoid lock contention. Logs progress + final row count.

**No DOWN migration text** — DOWN would DELETE the realtor row from trades + trade_configurations + cascade to permit_trades; expensive and risky. Document a manual rollback procedure instead (DELETE in reverse order, NOT a transactional migration).

## Compliance Cross-Check Matrix

| Spec | Section | Compliance check |
|---|---|---|
| Spec 91 | §1.2 algorithmic invariant | DB calibration only; NO algorithm branching introduced ✓ |
| Spec 91 | §1.3 persona matrix | Realtor `(account_preset='realtor', trade_slug='realtor')` row becomes operational ✓ |
| Spec 91 | §3.5 wire-up dependencies | All 5 items shipped: TRADES entry, DB seed migration, trade_forecasts/configurations calibration, permit_trades MANDATED option (a), tests |
| Spec 95 | §2.5.1 persona vs trade_slug | `account_preset` axis untouched; `trade_slug` is the algorithm input ✓ |
| Spec 47 §4.1 | trade_configurations canonical | Realtor row added to DB table; fallback constant kept in sync |
| Spec 84 | lifecycle phase engine | P19 / P1 are valid phase codes (P19 = winddown, P1 = intake) ✓ |

## Execution Plan (WF2 protocol)

### Phase 1 — Guardrail Tests (red light, written before implementation)
- [ ] **T1** — Logic test for `TRADES` array: `src/tests/trades-realtor.logic.test.ts` asserts realtor entry exists with correct `id=33`, `slug='realtor'`, `sort_order=33`. Fails today.
- [ ] **T2** — Logic test for `TRADE_TARGET_PHASE_FALLBACK`: same file, asserts `TRADE_TARGET_PHASE.realtor === { bid_phase: 'P1', work_phase: 'P19' }`. Fails today.
- [ ] **T3** — Infra test for `getLeadFeed({trade_slug: 'realtor'})`: `src/tests/get-lead-feed.realtor.infra.test.ts` mocks `permit_trades` to include realtor rows, asserts the SQL returns expected leads. Fails today (no realtor in TRADES).
- [ ] **T4** — Infra test for migration 118: `src/tests/migration-118.infra.test.ts` runs the migration on the test DB, asserts `trades.id=33` exists, asserts `trade_configurations` realtor row exists. Fails today.
- [ ] **T5** — Infra test for backfill script: `src/tests/backfill-realtor-permit-trades.infra.test.ts` seeds 10 permits, runs the backfill, asserts 10 new permit_trades rows with `trade_id=33`, asserts re-running is idempotent (still 10 rows). Fails today.
- [ ] **Verify red light:** `npx vitest run src/tests/trades-realtor.logic.test.ts src/tests/get-lead-feed.realtor.infra.test.ts src/tests/migration-118.infra.test.ts src/tests/backfill-realtor-permit-trades.infra.test.ts` → all fail.

### Phase 2 — Implementation
- [ ] **I1** — `src/lib/classification/trades.ts`: add realtor entry. Pick icon (probably `'Home'` or `'Key'`) + color (e.g., `'#9C27B0'` purple — distinct from construction trades).
- [ ] **I2** — `src/lib/classification/lifecycle-phase.ts`: add `realtor: { bid_phase: 'P1', work_phase: 'P19' }` to `TRADE_TARGET_PHASE_FALLBACK`. Run `npm run typecheck`.
- [ ] **I3** — `migrations/118_realtor_trade.sql`: write the UP migration (idempotent INSERTs; ON CONFLICT clauses).
- [ ] **I4** — `scripts/backfill-realtor-permit-trades.js`: write the backfill script (batched, idempotent, logged).
- [ ] **I5** — `scripts/classify-permits.js`: add unconditional realtor branch — for each permit being classified, always emit a `(permit_num, revision_num, 33)` row alongside any tier-1-matched construction trade rows.
- [ ] **I6** — `scripts/reclassify-all.js`: same branch.
- [ ] **I7** — `src/lib/sync/process.ts`: same branch in both INSERT sites (lines 119 + 185).
- [ ] **I8** — Mirror the dual-code-path requirement: `scripts/lib/lifecycle-phase.js` (per CLAUDE.md §7 dual code path) — verify it has `TRADE_TARGET_PHASE_FALLBACK` + add the realtor entry there too.

### Phase 3 — Green Light
- [ ] **G1** — `npx vitest run src/tests/trades-realtor.logic.test.ts src/tests/get-lead-feed.realtor.infra.test.ts src/tests/migration-118.infra.test.ts src/tests/backfill-realtor-permit-trades.infra.test.ts` → all pass.
- [ ] **G2** — `npx vitest run` (full suite) → no regressions.
- [ ] **G3** — `npm run typecheck && npm run lint -- --fix`.

### Phase 4 — Deployment artifact
- [ ] **D1** — Document the deployment runbook in the commit message: "After merge, run migration 118, then run `node scripts/backfill-realtor-permit-trades.js`. Backfill is idempotent + batched; safe to re-run."
- [ ] **D2** — Note that classify-permits + reclassify-all + sync/process changes are picked up automatically on next pipeline run (no manual trigger needed).

### Phase 5 — Multi-Agent Review (WF2 step 10)
- [ ] **R1** — Three parallel reviews:
  - Gemini on `migrations/118_realtor_trade.sql` with context Spec 91 §3.5 — adversarial check for migration safety (idempotency, ON CONFLICT correctness, missing CASCADE risks).
  - DeepSeek on `scripts/backfill-realtor-permit-trades.js` with context Spec 91 §3.5 — adversarial check for backfill safety (lock contention, batching, race with live classify-permits).
  - Worktree-isolated `feature-dev:code-reviewer` agent over the full diff: TRADES.ts + lifecycle-phase.ts + migration + backfill + 4 classifier-writer changes + tests. Triage: bug → WF3; deferred → `docs/reports/review_followups.md` (Spec 91 P5 section).

### Phase 6 — Commit + Push
- [ ] **C1** — Single commit `feat(91_mobile_lead_feed): WF2 Cycle 7 — wire realtor persona into the data layer`. Pre-commit gauntlet runs the full test suite.
- [ ] **C2** — `git push origin main`.

## Standards Compliance

* **Try-Catch Boundary:** N/A for the migration (SQL); the backfill script wraps each batch's pool.query in try/catch with logError + retry (mirror of existing scripts/sync/process.ts patterns).
* **Unhappy Path Tests:** T5 covers idempotency (re-running the backfill); T3 covers the SQL returning correctly when realtor rows exist; migration test covers ON CONFLICT.
* **logError Mandate:** backfill script uses `logError` on any batch failure with `{stage, batch_start, error}` context.
* **UI Layout:** N/A — backend wire-up only.
* **Spec 47 §4.1 dual config path:** trade_configurations DB row + TRADE_TARGET_PHASE_FALLBACK kept in sync; both updated in this cycle.
* **CLAUDE.md §7 dual code path:** `scripts/lib/lifecycle-phase.js` mirror — verified in I8.

## Out of Scope (queued for follow-up cycles)

- **Mobile UI realtor-specific tweaks.** Spec 94 already covers radius default + always-fixed address; trade picker already has the entry. Any Cycle 7-uncovered UX (e.g., realtor-specific welcome copy, realtor-specific empty-state messaging) is out of scope. File a separate WF if needed after testing the end-to-end flow.
- **Web admin Test Feed Tool realtor smoke test.** Manual verification once Cycle 7 ships: pick `trade_slug='realtor'` in the admin Test Feed Tool, confirm leads return. Not a Cycle 7 deliverable.
- **`trade_forecasts` per-permit row generation for realtor.** The prediction pipeline (compute-timing.js or similar) writes `trade_forecasts` rows. After Cycle 7, the next pipeline run will compute realtor forecasts for every (permit, realtor) pair using the new work_phase calibration. NO Cycle 7 work needed; the existing pipeline handles it once the trade_configurations row exists.
- **Spec 96 (subscription)** — realtor billing is identical to tradesperson per the persona matrix; no Spec 96 amendment needed.

> **PLAN LOCKED. Do you authorize this WF2 Cycle 7 plan? (y/n)**
> §10 note: chose unconditional code-branch realtor classification over a `trade_mapping_rules` regex pattern because tier 1 (the classifier's only applied tier) is exact-string match — no native match-all pattern. The unconditional branch is more transparent and harder to accidentally break than a magic regex.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
