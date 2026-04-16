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
| `opportunity_score` | INTEGER | DEFAULT 0, CHECK (0-100) |
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

### Implementation
- **Script:** `scripts/compute-opportunity-scores.js`
- **Data Flow:** Marries `trade_forecasts` with `cost_estimates` (for trade-specific $) and `lead_analytics` (for competition counts).
- **Pipeline Wiring:** Permits Chain step 23 of 24. Runs after `classify_lifecycle_phase` (21) → `compute_trade_forecasts` (22). Depends on `compute_cost_estimates` (step 14) for trade_contract_values in `cost_estimates`. Precedes `update_tracked_projects` (24) so CRM alerts see fresh scores.

---

## 3. Behavioral Contract

### Inputs
Nightly run processing all active `trade_forecasts` where `urgency <> 'expired'`.

### Core Logic
- **Financial Base:** Extract `trade_contract_values[row.trade_slug]`.
- **Math:** `MIN(trade_value / logic_variables['los_base_divisor'], 30)`.
- **Strategic Multiplier (Per-Trade):**
  - Performs a `LEFT JOIN` on `trade_configurations` for per-trade `multiplier_bid` / `multiplier_work`.
  - If `target_window === 'bid'` use `tc.multiplier_bid` (e.g., 3.0 for excavation, 2.0 for painting).
  - If `target_window === 'work'` use `tc.multiplier_work` (e.g., 1.8 for structural-steel, 1.2 for caulking).
  - Falls back to global `los_multiplier_bid` / `los_multiplier_work` from `logic_variables` if trade row is missing.
- **Competition Discount:**
  - Math: `(tracking_count * los_penalty_tracking) + (saving_count * los_penalty_saving)`.
- **Final LOS:** `Clamp((Base * Multiplier) - Discount, 0, 100)`.

### Outputs
Mutates `trade_forecasts.opportunity_score`. All `UPDATE` queries must include `AND opportunity_score IS DISTINCT FROM v.score` to prevent unnecessary "dead tuple" bloat.

### Edge Cases
- **Integrity Audit:** Flags leads where `tracking_count > 0` but `modeled_gfa_sqm` is null (users following unverified geometry).
- **Negative Values:** If competition penalty exceeds value, score is set to 0.
- **Missing Cost:** If `trade_contract_values` is missing, Base defaults to 0.

---

## 4. Testing Mandate

- **Logic:** `opportunity-score.logic.test.ts` — verify $150k framing job (15 pts * 2.5 = 37.5) with 1 tracker (37.5 - 50) results in 0 score.
- **Infra:** `opportunity-score.infra.test.ts` — assert `logic_variables` exist in DB and script pulls them correctly; verify `lead_key` composite format (`permit:num:revision`).

---

## 5. Operating Boundaries

**Target Files:**
- `scripts/compute-opportunity-scores.js`
- `migrations/091_signal_evolution.sql`
- `migrations/092_control_panel.sql` (trade_configurations + logic_variables + seed data)

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
3. **NaN Propagation Guard & Zod Validation:** Implement `Number.isFinite()` checks on all multipliers, and strictly validate the global `logic_variables` through `Zod` upon load.
4. **Advisory Locking:** Add `pg_try_advisory_lock(81)` utilizing a dedicated pinned `lockClient` at script entry.
5. **Graceful Shutdown (Spec 47 §5.5):** Implement a `process.on('SIGTERM', ...)` listener to guarantee the lock is released if Kubernetes preempts or scales down the container mid-run.
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
