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
- **Anchor Selection:** Uses the `phase_started_at` timestamp as the "T-Zero" point for calculation.
- **Instant Stall Recalibration:**
  - If `lifecycle_stalled` is `TRUE`, apply a Stall Penalty (45 days for pre-con, 14 days for active construction).
- **Rolling Snowplow:** The date rolls forward daily if the stall persists, ensuring the prediction never drifts into the past.
- **Calibration Fallback:** Exact Match -> Permit Type Fallback -> Issued Date Fallback -> Default (30 days).

### Outputs
Upserts rows to `trade_forecasts`; purges stale rows for terminal or deactivated permits.

### Urgency Classification
- **`expired`:** > `logic_variables.expired_threshold_days` (default 90) days in the past (dead lead).
- **`overdue`:** Physically passed the target phase OR > 30 days past predicted start.
- **`imminent`:** ≤ `trade_configurations.imminent_window_days` (per-trade; fallback 14) until predicted start. **This script is the authoritative consumer of the per-trade knob** — `update-tracked-projects.js` routes on the resulting `urgency` value and uses the same config only for alert message text (WF3-05 / H-W13). Setting `imminent_window_days = 0` disables the imminent tier for that trade — permits flow directly from `delayed` to `upcoming` because the `daysUntil <= 0` branch (delayed) fires first.
- **`upcoming`:** `imminent_window_days` < daysUntil ≤ 30 days until predicted start.

---

## 4. Testing Mandate

- **Logic:** `trade-forecasts.logic.test.ts` — Tests the "Rolling Snowplow" math, bimodal target switching, and UTC midnight normalization.
- **Infra:** `trade-forecasts.infra.test.ts` — Verifies the "Ironclad Ghost Purge" (deleting forecasts when trades are deactivated) and batch UPSERT performance.

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
