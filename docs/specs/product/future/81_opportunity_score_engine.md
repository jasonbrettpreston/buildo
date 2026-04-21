# 81 Opportunity Score Engine

> **Status:** ARCHITECTURE LOCKED — Script-based pre-compute (April 2026).
> **Purpose:** Intrinsic Value Logic.

## 1. Goal & User Story

Calculate a stable "Intrinsic Value" (0-100) for every trade opportunity based on revenue density, strategic timing, and market saturation.

**User Story:** A tradesperson sees a ranked list where high-value, uncrowded leads appear first, allowing them to prioritize high-probability wins over "noisy" or saturated leads.

---

## 2. Technical Architecture

### Database Schema

#### `trade_forecasts` (Updated)
| Column | Type | Constraints |
|---|---|---|
| `opportunity_score` | INTEGER | nullable, DEFAULT NULL, CHECK (0-100) — NULL means no cost data (see §3 Edge Cases) |
| `target_window` | VARCHAR(20) | CHECK ('bid', 'work') |

#### `logic_variables` (NEW - Manual Adjustments)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `variable_key` | VARCHAR(100) | PRIMARY KEY | |
| `variable_value` | DECIMAL | | Value used in scoring |
| `description` | TEXT | | Rationale for the variable |

**Used Variables in `logic_variables`:**
- `los_base_divisor`: 10000 (Normalization denominator)
- `los_multiplier_bid`: 2.5 (Early window weight)
- `los_multiplier_work`: 1.5 (Rescue window weight)
- `los_penalty_tracking`: 50 (Penalty per high-intensity tracker)
- `los_penalty_saving`: 10 (Penalty per low-intensity watcher)
- `los_decay_divisor`: 25 (Asymptotic decay curve steepness — `rawPenalty / this` = decayFactor; higher = gentler decay)

### Implementation
- **Script:** `scripts/compute-opportunity-scores.js`
- **Data Flow:** Marries `trade_forecasts` with `cost_estimates` (for trade-specific $) and `lead_analytics` (for competition counts).
- **Pipeline Wiring:** Permits Chain step 23 of 24. Runs after `classify_lifecycle_phase` (21) → `compute_trade_forecasts` (22). Depends on `compute_cost_estimates` (step 14) for trade_contract_values in `cost_estimates`. Precedes `update_tracked_projects` (24) so CRM alerts see fresh scores.

---

## 3. Behavioral Contract

### Inputs
Nightly run processing all active `trade_forecasts` where `(urgency IS NULL OR urgency <> 'expired')`.

### Core Logic
- **Financial Base:** Extract `trade_contract_values[row.trade_slug]`.
- **Math:** `MIN(trade_value / logic_variables['los_base_divisor'], 30)`.
- **Strategic Multiplier (Per-Trade):**
  - Performs a `LEFT JOIN` on `trade_configurations` for per-trade `multiplier_bid` / `multiplier_work`.
  - If `target_window === 'bid'` use `tc.multiplier_bid` (e.g., 3.0 for excavation, 2.0 for painting).
  - If `target_window === 'work'` use `tc.multiplier_work` (e.g., 1.8 for structural-steel, 1.2 for caulking).
  - Falls back to global `los_multiplier_bid` / `los_multiplier_work` from `logic_variables` if trade row is missing.
- **Competition Discount (Asymptotic Decay — WF1 April 2026):**
  - `rawPenalty = (tracking_count × los_penalty_tracking) + (saving_count × los_penalty_saving)`
  - `decayFactor = rawPenalty / los_decay_divisor`
  - **Final LOS:** `Clamp((Base × Multiplier) / (1 + decayFactor), 0, 100)`
  - At `decayFactor = 0` (no competition): score = Base × Multiplier unchanged.
  - At `decayFactor = 1` (`rawPenalty = los_decay_divisor`): score halved.
  - As competition → ∞: score → 0 asymptotically, never negative.
  - `Math.max(0, ...)` clamp is a final safety boundary (unreachable under normal inputs).

### Outputs
Mutates `trade_forecasts.opportunity_score`. All `UPDATE` queries must include `AND opportunity_score IS DISTINCT FROM v.score` to prevent unnecessary "dead tuple" bloat. Score is `NULL` when cost data is absent (see Edge Cases).

### Edge Cases
- **Integrity Audit:** Flags leads where `tracking_count > 0` but `modeled_gfa_sqm` is null (users following unverified geometry).
- **Missing Cost → NULL (WF1 April 2026):** If `estimated_cost IS NULL` OR `trade_contract_values IS NULL` OR `trade_contract_values = {}`, `opportunity_score` is set to `NULL` (not 0). A score of 0 definitively means "real value, fully competed." Missing data is surfaced as `NULL` so downstream consumers can distinguish the two states.
- **Heavy Competition → Low (not Zero):** The asymptotic decay formula ensures heavily competed leads produce low non-negative scores. The old zero-clamp data-loss pattern (negative raw → clamped to 0) is eliminated.

---

## 4. Testing Mandate

- **Logic (Asymptotic Decay):** `compute-opportunity-scores.infra.test.ts` — verify the script uses `/ (1 + decayFactor)` not `- competitionPenalty`; verify `los_decay_divisor` is in the Zod schema.
- **Logic (NULL Guard):** Verify that `estimated_cost == null` OR empty `trade_contract_values` produces `score = null`, not `0`. Verify `nullInputScores` counter is tracked and surfaced in `records_meta`.
- **Legacy Example (now incorrect):** ~~$150k framing job (15 pts × 2.5 = 37.5) with 1 tracker (37.5 - 50) = 0~~ → With asymptotic decay: score = (15 × 2.5) / (1 + 50/25) = 37.5 / 3 = 12.5 → 13 (not 0).
- **Infra:** `compute-opportunity-scores.infra.test.ts` — verify `los_decay_divisor` in LOGIC_VARS_SCHEMA, `null_scores` audit status is INFO, `null_input_scores` in records_meta.

---

## 5. Operating Boundaries

**Target Files:**
- `scripts/compute-opportunity-scores.js`
- `migrations/091_signal_evolution.sql`
- `migrations/092_control_panel.sql` (trade_configurations + logic_variables + seed data)
- `migrations/102_los_decay_divisor.sql` (inserts `los_decay_divisor = 25` into `logic_variables`)

**Control Panel (migrations 092 + 093):**
All scoring constants are now DB-driven. Global constants (`los_penalty_tracking`, `los_base_divisor`, etc.) come from `logic_variables`. Per-trade urgency multipliers (`multiplier_bid`, `multiplier_work`) come from `trade_configurations` via a LEFT JOIN. The script loads all config via the shared `loadMarketplaceConfigs()` loader in `scripts/lib/config-loader.js` with hardcoded fallback. Operators can tune multipliers per-trade (e.g., framing bid=2.8 vs painting bid=2.0) without code deployments.

**Out-of-Scope Files:**
- `src/lib/classification/scoring.ts` — Original `lead_score` is a static property of the permit; `opportunity_score` is a dynamic property of the marketplace.

---

## 6. Front-end Preparation (Admin & Pro App)

### A. Admin Panel (Marketplace Control)
- **The Bimodal Switch:** Dropdowns for every trade to set the `bid_phase_cutoff` (P1-P18).
- **The Re-Sync Trigger:** A button that executes the script chain: Cost Engine → Forecast Engine → Score Engine.

### B. Pro App (Lead Feed & Flight Schedule)
The Front-end utilizes these fields to explain the score and trigger alerts.

| Available Field | Purpose | Front-end Implementation Logic |
|---|---|---|
| `opportunity_score` | Ranking | Primary Sort Key. Combine with user lat/lng to surface "Key Leads." |
| `target_window` | Context | Explains the score: Badge as "💎 Strategic" if bid or "🚨 Urgent" if work. |
| `tracking_count` | Transparency | Explains saturation. Shows why a high-value lead might have a lower score due to competition. |
| `predicted_start` | Calendar | Plots the lead on the Pro's "Flight Schedule" timeline. |
| `imminent_window` | Alerting | Triggers an Amber "Get Ready" alert if the project enters this trade-specific notice period. |

---

## 7. Temporary: Bug Fixes (The "WF3" Critical List)

These eight items must be resolved in the `scripts/compute-opportunity-scores.js` refactor to ensure production stability and Spec 47 compliance.

1. **Multi-Batch Transaction Boundary (Spec 47 §6.3):** Wrap the scoring loop in `pipeline.withTransaction`. This ensures that if the script crashes mid-run, the database rolls back, preventing a "split-score" marketplace where some leads use old logic and others use new logic.
2. **Unbounded SELECT (OOM Guard) (Spec 47 §6.1):** Replace `pool.query` with `pipeline.streamQuery`. This processes the ~2.5M rows in memory-efficient chunks. Must include `flushBatch()` inside the loop and clear the array to prevent Node Heap crashes.
3. **NaN Propagation Guard & Zod Coercion:** The node-postgres (`pg`) driver returns `DECIMAL`/`NUMERIC` columns as **strings** to prevent float64 precision loss. You MUST validate the global `logic_variables` using Zod's coercion methods (e.g., `z.coerce.number().finite()`) upon load — `z.number()` rejects strings and causes an instant validation crash. Implement `Number.isFinite()` checks on all per-trade multipliers.
4. **Advisory Locking:** Delegate to `pipeline.withAdvisoryLock(pool, 81, ...)` — the SDK helper acquires the lock, runs the callback, and releases on exit. No hand-rolled `lockClient` or direct `pg_try_advisory_lock` call.
5. **Graceful Shutdown (Spec 47 §5.5):** Handled by `pipeline.withAdvisoryLock` — no manual `process.on('SIGTERM', ...)` in the script. The SDK helper guarantees lock release on SIGTERM/SIGINT.
6. **Telemetry Accuracy:** Update `records_updated` using the actual `result.rowCount` from the `UPDATE` call rather than the batch size.
7. **NULL Urgency Support:** Change the filter to `WHERE (tf.urgency IS NULL OR tf.urgency <> 'expired')`.
8. **Bimodal Sourcing:** Ensure logic properly executes a LEFT JOIN on `trade_configurations` to source `multiplier_bid` and `multiplier_work` dynamically based on the current target window.

---

## 8. Implementation Plan

### Phase 1: Infrastructure
- **Migration 093:** Run SQL to add `multiplier_bid` and `multiplier_work` columns to the `trade_configurations` table.
- **Master Seed:** Populates the 32 trades with tiered multipliers (Heavy: 3.0, Structural: 2.8, Commodity: 2.0).

### Phase 2: Script Refactor
- Deploy the refactored `compute-opportunity-scores.js` with the 6 Bug Fixes (Streaming, Transactions, and Locks).
- Integrate the `scripts/lib/config-loader.js` to ensure all 13 variables (7 Global, 6 Trade) are loaded before the scoring loop begins.

### Phase 3: UI Integration
- Build the Admin "Trade Matrix" for real-time adjustments.
- Update the Pro App Lead Feed to consume the new `target_window` and `imminent_window` fields for enhanced sorting and alerting.
