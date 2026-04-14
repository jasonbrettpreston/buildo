# 86 Master Configuration List: The "Control Panel" Schema

> **Status:** IMPLEMENTED — Migrations 092+093 + Shared Config Loader (April 2026).
> **Purpose:** Centralize hardcoded variables into a database-driven Control Panel, allowing operators to tune system "Gravity" via the Admin UI.

These variables will be managed via the Admin UI and stored in the database to drive the four core scripts.

---

## 1. Global Platform Logic (`logic_variables`)
These are universal "Gravity" constants. They do not change by trade.

| Variable Key | Script | Impact of Adjustment |
|---|---|---|
| `los_base_unit` | Score | Change from 10k to 5k to double the importance of contract size. |
| `los_penalty_tracking` | Score | Increase to 70 to "cool down" leads that are being claimed too fast. |
| `los_penalty_saving` | Score | Increase to 20 to penalize leads that everyone is watching but no one is taking. |
| `lead_expiry_days` | Forecast | Change to 60 to "clean" the feed of old data faster. |
| `coa_stall_threshold` | Lifecycle | Change to 45 to be more patient with the City's CoA approval process. |
| `stall_penalty_precon` | Forecast | Adjust the "Snowplow" push for zoning/permit delays. |
| `stall_penalty_active` | Forecast | Adjust the "Snowplow" push for failed site inspections. |

---

## 2. Trade Matrix Logic (`trade_configurations`)
This is your Per-Trade Control Panel. You can now adjust the multipliers here.

| Field | Consumed By | Your Manual Control Ability |
|---|---|---|
| `multiplier_bid` | Score | **NEW:** Set the Early Bid weight per trade (e.g., 2.5 for Plumbing, 3.5 for Framing). |
| `multiplier_work` | Score | **NEW:** Set the Rescue weight per trade (e.g., 1.5 for Plumbing, 1.2 for Painting). |
| `allocation_pct` | Cost | Slices the total construction $ into trade estimates. |
| `bid_phase_cutoff` | Forecast | The phase (P1-P18) where the `multiplier_bid` drops to `multiplier_work`. |
| `work_phase_target` | Forecast | The physical phase the pro is physically aiming for. |
| `imminent_window` | CRM | Days of notice before "Starting Soon" alert fires. |

---

## 3. How this looks in your Admin UI
When you open your Admin page to manage trades, you will see a 32-row table that looks like this:

| Trade Slug | % Alloc | Bid Cutoff | Early Bid Mult | Rescue Mult |
|---|---|---|---|---|
| `plumbing` | `0.0800` | P6 | `2.5` | `1.5` |
| `framing` | `0.1500` | P9 | `3.5` | `1.8` |
| `painting` | `0.0200` | P13 | `2.0` | `1.1` |

### Why this change is necessary:
- **Granular Value:** You can acknowledge that a Framing "Early Bid" is more strategically valuable to the platform than a Painting "Early Bid" and reward it with a higher score.
- **Market Balancing:** If you have too many plumbers fighting over "Rescue" leads, you can drop the `multiplier_work` for plumbing to `1.1` to deprioritize them in the feed without affecting other trades.
- **Total Manual Control:** You have moved the final "hardcoded" piece of the Opportunity Score into the database.

**Script Refactor (DONE — migration 093 + config-loader.js):**
- `compute-opportunity-scores.js`: Now JOINs `trade_configurations` for per-trade `multiplier_bid` / `multiplier_work`. Falls back to global `logic_variables` if trade config is missing.
- All 4 scripts (`compute-opportunity-scores`, `compute-trade-forecasts`, `compute-cost-estimates`, `update-tracked-projects`) use the shared `loadMarketplaceConfigs(pool)` loader in `scripts/lib/config-loader.js`.

---

## 4. Implementation Plan: The "Bridge" Strategy

### Step 1: Infrastructure (Migration 091/092)
Run a single SQL migration to create the three infrastructure tables: `trade_configurations`, `logic_variables`, and `lead_analytics`.

### Step 2: The Master Seed
Execute a 32-row `INSERT` that populates every trade with calibrated values including the new per-trade multipliers and windows.

### Step 3: Script "Dynamic Wiring"
Refactor the four scripts to perform a "Config Load" at the start of their run via the shared `loadMarketplaceConfigs(pool)` helper in `scripts/lib/config-loader.js`.

| Script | Permits Chain Step | Role |
|---|---|---|
| `compute-cost-estimates.js` | **14** | Fetches the 32 percentages from `trade_configurations` + Liar's Gate threshold from `logic_variables`. |
| `classify-lifecycle-phase.js` | **21** | Fetches `coa_stall_threshold` from `logic_variables` to flag stuck CoAs as `lifecycle_stalled=TRUE` (WF3 2026-04-13). |
| `compute-trade-forecasts.js` | **22** | Fetches bimodal targets (`bid_phase_cutoff`, `work_phase_target`) + stall penalties + `expired_threshold_days` from `logic_variables`. |
| `compute-opportunity-scores.js` | **23** | JOINs `trade_configurations` for per-trade `multiplier_bid`/`multiplier_work`. Fetches `los_penalty_tracking`/`los_penalty_saving` from `logic_variables`. |
| `update-tracked-projects.js` | **24** | JOINs `trade_configurations` for per-trade `imminent_window_days`. Auto-archives claimed leads where `urgency='expired'` (WF3 2026-04-13 — enforces `lead_expiry_days` TTL). |

The 3 marketplace scripts (22-24) run AFTER `classify_lifecycle_phase` (step 21) because they depend on fresh lifecycle_phase + phase_started_at anchors from the classifier.

### Step 4: Admin UI (The Control Page)
Create a single React page in the Admin dashboard with:
- **Marketplace Constants Card:** A list of the global variables.
- **Trade Configuration Table:** A searchable 32-row table for cost, timing, and multipliers.
- **Global Apply Button:** A button that clears the cache and triggers a re-score of all leads.
