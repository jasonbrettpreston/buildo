# 80 Lead Analytics & Opportunity Scoring

> **Status:** ARCHITECTURE LOCKED — Shifted to Two-Layer Discovery Model.
> **Purpose:** Formal specifications for adding intensity signaling, opportunity scoring algorithms, and bimodal prioritization to the Lead Feed pipeline.

## 1. Goal & User Story

Surface high-probability leads using a hybrid approach: Intrinsic Value (computed nightly) and Relative Proximity (computed live).

**User Story:** A plumber on a site in North York opens the app and sees the most profitable, uncrowded leads closest to their current GPS.

---

## 2. Technical Architecture

### Two-Layer Ranking Model

Instead of calculating complex business logic in the API, the feed uses a lightweight SQL sort:

- **Layer 1: Intrinsic (Script-Computed):** The pre-calculated `opportunity_score` stored in `trade_forecasts`.
- **Layer 2: Relative (API-Computed):** A dynamic `proximity_decay` based on live GPS.

**SQL Ranking Clause:**
```sql
ORDER BY (tf.opportunity_score - proximity_decay) DESC
```

**Proximity Decay Matrix:**

| Distance | Penalty | UI Feedback |
|---|---|---|
| `< 5km` | -0 pts | "Immediate Area" |
| `5 - 15km` | -20 pts | "Nearby" |
| `> 15km` | -40 pts | "Regional" |

### Database Schema (The Signal Layer)

#### `lead_analytics`
Tracks high and low intensity competition signals.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `lead_key` | VARCHAR(100) | PRIMARY KEY | Format: `'permit:{permit_num}:{revision_num}'` |
| `tracking_count` | INTEGER | DEFAULT 0 | Pros using Flight Tracker (High Intensity) |
| `saving_count` | INTEGER | DEFAULT 0 | Pros watching/quoting (Low Intensity) |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

#### `trade_forecasts` (Updated Columns)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `opportunity_score` | INTEGER | DEFAULT 0 | Intrinsic Lead Opportunity Score (LOS) (0-100) |
| `target_window` | VARCHAR(20) | CHECK ('early_bid', 'rescue_mission') | |

#### `cost_estimates` (Updated Columns)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `trade_contract_values` | JSONB | | Per-trade dollar slices |
| `is_geometric_override` | BOOLEAN | | `TRUE` if Massing data overrode GC reported cost |
| `modeled_gfa_sqm` | DECIMAL | | Authoritative size from Footprint × Stories |

---

## 3. Implementation: The Pipeline Engine

The feed is powered by four nightly scripts running in the Permits Chain (step numbers below refer to the 25-step chain in `docs/specs/pipeline/40_pipeline_system.md` §4.2):

1. **`compute-cost-estimates.js`** (step **14**): Establishes Geometric Truth. Discards permit costs < 25% of modeled cost. Slices total cost into 32 trade-specific JSONB values.
2. **`compute-trade-forecasts.js`** (step **23**, after `classify_lifecycle_phase`): Stamps the Bimodal Window. Identifies if the trade is in the relationship-building phase (`early_bid`) or the site-active phase (`rescue_mission`).
3. **`compute-opportunity-scores.js`** (step **24**): Calculates the Intrinsic Score.
   - **Base:** (Trade Value / $10k).
   - **Urgency Multiplier:** per-trade `multiplier_bid` / `multiplier_work` from `trade_configurations` (e.g., excavation 3.0/1.8 vs painting 2.0/1.2).
   - **Competition Discount:** `-(tracking_count * 50) - (saving_count * 10)`.
4. **`update-tracked-projects.js`** (step **25**, final): The CRM Assistant. Syncs user behavior back to `lead_analytics` and generates state-change alerts.

Lifecycle anchors come from `classify-lifecycle-phase.js` (step **22**, runs in both permits and coa chains). Flight-tracker timing comes from `compute_timing_calibration_v2` (step **16**) which writes `phase_calibration` medians. The detail-page timing engine (spec 71) uses `compute_timing_calibration` (step **15**) writing the `timing_calibration` table — both calibration scripts run nightly because they feed different engines.

---

## 4. Behavioral Contract

### Social Proof Signals
The Feed UI must display the behavioral data retrieved from `lead_analytics`:
- **"🛰️ X Pros Tracking"**: Signals high competition; triggers the "Rescue Mission" mindset.
- **"📌 Y Saved"**: Signals market interest.

### The "Backup" CTA
If `tracking_count > 0`, the card UI transitions from "Claim Project" to "Join Backup List ($5)". This maintains marketplace fluidity even when a lead is "owned" by another user.

### Core Logic — Opportunity Scoring (0-100)

| Signal | Logic | Impact |
|---|---|---|
| **Early Bid** | Targeting Bid Phase (P3-P6) | **2.5x Value** (Highest Priority) |
| **Rescue Mission** | Targeting Work Phase (P7+) | **1.5x Value** (High Priority) |
| **Stalled Site** | `lifecycle_stalled = true` | **0.5x Value** (Deprioritize) |
| **Active Tracking** | Pro using Flight Tracker | **-50 pts** (Saturation Warning) |
| **Saved** | Pro watching lead | **-10 pts** (Competition Signal) |

### Additional UI & Transparency
- **Liar's Gate Audit:** For overrides, render `⚡ Model verified value`.
- **Contact Utility:** Cards with phone data show `📞 Direct Contact Available` (No score boost, just transparency).

### Edge Cases
- **Dynamic Relocation:** If a tradesperson moves sites, the API `proximity_decay` re-calculates the feed order instantly without needing a script re-run.
- **Inaccurate Permit GFA:** Massing data automatically overrides typos (Metric/Imperial mixups) and fee-dodging lowballs.

---

## 5. Testing Mandate
- **Logic:** `los.logic.test.ts` — verify that one tracking action drops LOS more than five save actions.
- **Accuracy:** `cost-audit.infra.test.ts` — verify that permits with $1 costs are correctly overridden by massing GFA.
- **Performance:** `feed-latency.infra.test.ts` — ensure the radial sort returns in < 100ms under 200k row load.
