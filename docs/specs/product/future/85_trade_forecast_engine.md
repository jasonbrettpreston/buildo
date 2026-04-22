# 85 Trade Forecast Engine — The Flight Tracker

> **Status:** ARCHITECTURE LOCKED — Bimodal Routing & Instant Stall Recalibration (April 2026).
> **Purpose:** Predict actionable work dates for all 32 trades by marrying current lifecycle stages with historical velocity data.

## 1. Goal & User Story

Predict actionable work dates for all 32 trades by marrying current lifecycle stages with historical velocity data.

**User Story:** A landscaper looks at a project currently in the "Framing" stage and sees a predicted start date for their work in 6 months, allowing them to bid early and secure the contract.

---

## 2. Technical Architecture

### Database Schema

#### `trade_forecasts` (Primary Output)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `predicted_start` | DATE | | The core predicted date. |
| `urgency` | VARCHAR | | `expired`, `overdue`, `delayed`, `imminent`, `upcoming`, `on_time`. |
| `target_window` | VARCHAR | | `bid` (Relationship) or `work` (Operational). |
| `confidence` | VARCHAR | | `high`, `medium`, `low` based on sample size. |
| `calibration_method` | VARCHAR | | `exact`, `fallback_all_types`, `fallback_issued`, `default`. |

### Implementation
- **Script:** `scripts/compute-trade-forecasts.js`
- **Logic:** Combines `phase_started_at` anchors with `phase_calibration` medians and `TRADE_TARGET_PHASE` mappings.
- **Pipeline Wiring:** Permits Chain step 22 of 24. Runs after `classify_lifecycle_phase` (21) so lifecycle_phase + phase_started_at anchors are fresh. Consumes `phase_calibration` written by `compute_timing_calibration_v2` (step 15). Precedes `compute_opportunity_scores` (23) which reads the `target_window` and `urgency` stamps this script produces. `expired` urgency threshold is loaded from `logic_variables.expired_threshold_days` (WF3 2026-04-13).

---

## 3. Behavioral Contract

### Inputs
Active `permit_trades`, `permits` with lifecycle data, and `phase_calibration` results.

### Core Logic
- **Bimodal Routing:**
  - If current stage `<= bid_phase`: Target the "Shortlist" window.
  - If current stage `> bid_phase`: Target the "Work" window (Rescue Mission).
- **Anchor Selection:** Uses `phase_started_at` as the primary "T-Zero" point. When `phase_started_at` is NULL the engine applies the **Fallback Anchor Hierarchy** (see below) so no forecast is silently dropped.

#### Fallback Anchor Hierarchy
Priority order when `phase_started_at` is NULL:
1. `phase_started_at` — immutable phase-transition anchor (preferred)
2. Latest passed inspection date (`permit_inspections WHERE status='Passed'` — aggregated via CTE in SOURCE_SQL)
3. `permits.issued_date`
4. `permits.application_date`

When any fallback is used, `calibration_method` is stamped `'fallback_issued'` to signal a lower-confidence estimate. If no date is available at all the row is silently skipped and counted in `skipped_terminal_orphan`.
- **Historic Snowplow (WF3 April 2026):** Applied immediately after the initial `predictedStart = anchor + cal.median` calculation. If `anchorIsFallback` is `true` AND `predictedStart < today` (the calculated date landed in the past), snap `predictedStart` forward to `today + logic_variables.snowplow_buffer_days` (default 7, DB-driven per spec 47 §4.1). This converts rescued fallback-anchor leads from `expired` urgency to `imminent/upcoming` — treating them as Rescue Missions rather than dead leads. Only fires for fallback anchors; real `phase_started_at` anchors are never touched. Tracked via `snowplow_applied` in `records_meta`.
- ~~**Instant Stall Recalibration:**~~ *(Removed WF3 2026-04-22)* The per-row stall penalty block was deleted as dead code after the Stalled Gate was added to SOURCE_SQL. Since `AND p.lifecycle_stalled = false` is now in the WHERE clause, every row reaching the stream has `lifecycle_stalled = false`; the `if (lifecycle_stalled)` branch was permanently unreachable. **Product trade-off:** this means ALL stalled permits are excluded — including recently-stalled ones that would have produced a non-expired `predictedStart` after penalty adjustment. This is an accepted product simplification: a stalled permit's lead disappears from the feed while stalled, rather than showing a penalty-adjusted future date. `stall_penalty_precon` and `stall_penalty_active` remain in `logic_variables` and `LOGIC_VARS_SCHEMA` for potential future use.
- **Calibration Fallback:** Exact Match -> Permit Type Fallback -> Issued Date Fallback -> Default (30 days).

### Inputs Filter — Stalled Gate (WF3 2026-04-22)
`SOURCE_SQL` includes `AND p.lifecycle_stalled = false` in the top-level WHERE clause (applies to both Branch A P1/P2 and Branch B active construction). Stalled permits have ancient `phase_started_at` anchors that produce `predictedStart` deep in the past → expired urgency → grace_purge deletes → stream regenerates (zombie loop). Excluding them at SQL level breaks the loop at source. `lifecycle_stalled` is `BOOLEAN NOT NULL DEFAULT false` (migration 085).

The stale-purge NOT EXISTS subquery also includes `AND p.lifecycle_stalled = false` so that forecasts for newly-stalled permits are purged on the next run (without this mirror, stalled permits still pass the NOT EXISTS subquery and their forecasts persist indefinitely).

### Outputs
Upserts rows to `trade_forecasts`. Runs two purge passes in Step 2 (atomic `withTransaction`):
- **Stale Purge:** Deletes forecasts for permits where the trade is deactivated or the permit is in `SKIP_PHASES` or is stalled. Uses `NOT EXISTS` against active `permit_trades` outside `SKIP_PHASES` with `lifecycle_stalled = false`.
- **Grace-Purge (WF2 2026-04-21):** Deletes forecasts where `urgency = 'expired' AND predicted_start < runAt - GRACE_PURGE_DAYS days` (180 days, sourced from `_contracts.json retention.grace_purge_days`). Prevents zombie accumulation of expired rows that the snowplow cannot rescue. Tracked via `grace_purged` in `records_meta`.
- **In-Memory Grace Cutoff (WF3 2026-04-22):** Before UPSERTing, each row's final `predictedStart` (after all recalibration) is compared against `graceCutoffMs = runAt - GRACE_PURGE_DAYS days`. If it falls before the cutoff, the row is silently dropped (`skippedTooOld++`) and never written to the database. This eliminates the zombie write+delete cycle where rows are UPSERTed and immediately grace_purge-deleted on the same run. `GRACE_PURGE_DAYS` is a named constant that drives both the SQL template literal and the JS cutoff math — any change propagates to both consumers automatically and is enforced by `contracts.infra.test.ts`.

### Urgency Classification
- **`expired`:** > `logic_variables.expired_threshold_days` (default 90) days in the past (dead lead).
- **`overdue`:** Physically passed the target phase OR > 30 days past predicted start.
- **`imminent`:** ≤ `trade_configurations.imminent_window_days` (per-trade; fallback 14) until predicted start. **This script is the authoritative consumer of the per-trade knob** — `update-tracked-projects.js` routes on the resulting `urgency` value and uses the same config only for alert message text (WF3-05 / H-W13). Setting `imminent_window_days = 0` disables the imminent tier for that trade — permits flow directly from `delayed` to `upcoming` because the `daysUntil <= 0` branch (delayed) fires first.
- **`upcoming`:** `imminent_window_days` < daysUntil ≤ 30 days until predicted start.

---

## 4. Testing Mandate

- **Logic:** `trade-forecasts.logic.test.ts` — Tests the "Rolling Snowplow" math, bimodal target switching, and UTC midnight normalization.
- **Infra:** `trade-forecasts.infra.test.ts` — Verifies:
  - Ironclad Ghost Purge (deleting forecasts when trades are deactivated)
  - Grace-purge: DELETE WHERE urgency='expired' AND predicted_start older than 180 days inside `withTransaction` (not bare pool.query)
  - `grace_purged` in `records_meta`
  - `SKIP_PHASES_SQL` constant + `lifecycle_phase NOT IN` in SOURCE_SQL (SQL pushdown — not JS loop)
  - `SKIP_PHASES.size === 0` startup guard
  - `skipped_no_anchor` counter (not `skipped_terminal_orphan`)

---

## 5. Operating Boundaries & Context

### Target Files
- **`scripts/compute-trade-forecasts.js`**
- **`scripts/lib/lifecycle-phase.js`** (Shared constants)

### Out-of-Scope Files
- `scripts/classify-lifecycle-phase.js` — Timing only reads from the lifecycle; it never modifies it.

### Cross-Spec Dependencies
- **Relies on:** Lifecycle Phase Engine (for anchors), `72_lead_cost_model` (for allocation).
- **Consumed by:** `70_lead_feed` (to sort by timing) and Opportunity Score Engine (for the urgency multiplier).

### Control Panel (migrations 092 + 093)
- `trade_configurations.bid_phase_cutoff` + `work_phase_target` define the bimodal routing per trade
- `trade_configurations.imminent_window_days` defines the per-trade alert threshold for the CRM assistant
- `trade_configurations.multiplier_bid` + `multiplier_work` (migration 093) — per-trade urgency multipliers consumed by the Opportunity Score Engine
- `logic_variables.stall_penalty_precon` (45) + `stall_penalty_active` (14) drive the stall recalibration math (now loaded via shared `loadMarketplaceConfigs()`)
- `logic_variables.expired_threshold_days` (-90) drives the expired urgency classification
- `target_window` column on `trade_forecasts` stamps 'bid' or 'work' at the bimodal routing decision point

### Shared Config Loader
All config is loaded via `scripts/lib/config-loader.js` `loadMarketplaceConfigs(pool)` which returns `{ tradeConfigs, logicVars }` with hardcoded fallbacks on DB failure.

---

## 6. Engineering Requirements (Spec 47 & Bimodal Parity)

When refactoring `scripts/compute-trade-forecasts.js`, the following structural and logistical defenses must be implemented:

1. **Stream Execution (Spec 47 §6.1):** Prevent OOM errors by querying massive historical permit batches through `pipeline.streamQuery()`, processing via in-loop backpressure array limits.
2. **Graceful Locks (Spec 47 §5.5):** Acquire an advisory lock on a dedicated client and attach a `process.on('SIGTERM')` listener to ensure lock unbinding during forced shutdown.
3. **Bimodal Data Path:** The database join must retrieve `bid_phase_cutoff` and `work_phase_target` from the `trade_configurations` table, routing "Rescue Mission" states dynamically instead of hardcoding target dates.
4. **Zod Defense:** Extract the raw JSON definitions of `logic_variables.stall_penalty_active` and `logic_variables.expired_threshold_days`, filtering them strictly via `Zod` prior to running math calculations so `NaN` propagation is impossible.
5. **Atomic Commit (Spec 47 §6.3):** Ensure `ON CONFLICT DO UPDATE` upserts for forecasts occur exclusively within ephemeral `pipeline.withTransaction()` wrappers.
