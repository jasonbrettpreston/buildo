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
- `los_base_unit`: 10000 (Normalization denominator)
- `los_multiplier_bid`: 2.5 (Early window weight)
- `los_multiplier_work`: 1.5 (Rescue window weight)
- `los_penalty_tracking`: 50 (Penalty per high-intensity tracker)
- `los_penalty_saving`: 10 (Penalty per low-intensity watcher)

### Implementation
- **Script:** `scripts/compute-opportunity-scores.js`
- **Data Flow:** Marries `trade_forecasts` with `cost_estimates` (for trade-specific $) and `lead_analytics` (for competition counts).
- **Pipeline Wiring:** Runs nightly in the Permits Chain after `compute-trade-forecasts.js` and `compute-cost-estimates.js`.

---

## 3. Behavioral Contract

### Inputs
Nightly run processing all active `trade_forecasts` where `urgency <> 'expired'`.

### Core Logic
- **Financial Base:** Extract `trade_contract_values[row.trade_slug]`.
- **Math:** `MIN(trade_value / logic_variables['los_base_unit'], 30)`.
- **Strategic Multiplier (Per-Trade):**
  - JOINs `trade_configurations` for per-trade `multiplier_bid` / `multiplier_work`.
  - If `target_window === 'bid'` use `tc.multiplier_bid` (e.g., 3.0 for excavation, 2.0 for painting).
  - If `target_window === 'work'` use `tc.multiplier_work` (e.g., 1.8 for structural-steel, 1.2 for caulking).
  - Falls back to global `los_multiplier_bid` / `los_multiplier_work` from `logic_variables` if trade config is missing.
- **Competition Discount:**
  - Math: `(tracking_count * los_penalty_tracking) + (saving_count * los_penalty_saving)`.
- **Final LOS:** `Clamp((Base * Multiplier) - Discount, 0, 100)`.

### Outputs
Mutates `trade_forecasts.opportunity_score`.

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
