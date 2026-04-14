# 83 Lead Cost Model — Valuation & Trade Slicing Engine

> **Status:** ARCHITECTURE LOCKED — Logic updated to support Geometric Validation (April 2026).
> **Purpose:** Provide trade-specific contract estimates by auditing municipal data against building massing.

## 1. Goal & User Story

Provide trade-specific contract estimates by auditing municipal data against building massing to eliminate "lowball" reported costs and slicing total project values into 32 actionable trade contracts.

**User Story:** A plumber sees a lead not just as a "house," but as a "$15,000 Rough-in Opportunity" validated by geometric massing, allowing for better bidding decisions.

---

## 2. Technical Architecture

### Database Schema

#### `cost_estimates` (Updated)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `trade_contract_values` | JSONB | | Stores estimated $ value for all 32 trades. |
| `is_geometric_override` | BOOLEAN | | `TRUE` if model discarded GC reported cost for being too low. |
| `modeled_gfa_sqm` | DECIMAL | | The "Geometric Truth" area (Footprint Area × Stories). |
| `estimated_cost` | DECIMAL | | Final total construction value (validated). |
| `cost_source` | VARCHAR | | `'permit'` (verified) or `'model'` (overridden). |

#### `trade_configurations` (NEW - Manual Variable Table)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `trade_slug` | VARCHAR | PRIMARY KEY | |
| `allocation_pct` | DECIMAL | | Portion of total hard cost (e.g., 0.15 for 15%). |

### Implementation
- **Files:** `scripts/compute-cost-estimates.js` (Pipeline Script), `src/features/leads/lib/cost-model.ts` (API Logic).
- **Core Strategy:** Uses Geometric Truth to validate reported permit values. If a permit cost is missing or suspicious, the model calculates value using `GFA * Base Rate * Premium`.

---

## 3. Behavioral Contract

### Inputs
Permit records (reported cost, scope tags), Parcel data (lot size), Building Footprints (area, stories), Neighbourhood data (avg income).

### Core Logic
- **Establish Geometric Truth:** Calculate `modeled_cost = (Footprint × Stories) × Base Rate × Scope Modifier × Premium`.
- **The Liar's Gate (Audit):** If `reported_cost < (modeled_cost * 0.25)`, discard reported cost and use `modeled_cost`. Set `is_geometric_override = TRUE`.
- **Trade Slicing:** Fetch `allocation_pct` from `trade_configurations` and multiply by the validated total cost to populate `trade_contract_values`.
- **Cost Tiers:** Categorize the final cost (Small to Mega).

### Outputs
Updated `cost_estimates` table with trade-level dollar values.

### Edge Cases
- **Placeholder Costs:** If reported cost is `<= $1,000`, it is treated as missing.
- **Commercial Shells:** If the permit is for a "Shell," a `0.60x` multiplier is applied to interior trade slices.
- **Massing Fallback:** If footprint data is missing, use lot size multiplied by urban (`0.7`) or suburban (`0.4`) coverage ratios.

---

## 4. Testing Mandate

- **Logic:** `cost-model.logic.test.ts` — Tests Liar's Gate thresholds, trade slicing percentages, and GFA calculation accuracy.
- **Infra:** `cost-estimates.infra.test.ts` — Asserts DB write/read speed for large JSONB objects and FK integrity with permits.

---

## 5. Operating Boundaries

**Target Files:**
- `scripts/compute-cost-estimates.js`
- `src/features/leads/lib/cost-model.ts`
- `migrations/091_signal_evolution.sql`
- `migrations/092_control_panel.sql` (trade_configurations + logic_variables)

**Pipeline Wiring:**
Permits Chain step 14 of 24. Runs after `classify_permits` (13) so trade assignments exist before the slicer generates `trade_contract_values`. Precedes `compute_timing_calibration_v2` (step 15) — cost modeling is independent of timing but keeping it first means timing failures don't block cost telemetry. The downstream marketplace tail (`compute_opportunity_scores` at 23) reads this table for per-trade dollar values.

**Control Panel (migrations 092 + 093):**
`allocation_pct` is now loaded from `trade_configurations` at runtime via the shared `loadMarketplaceConfigs(pool)` loader in `scripts/lib/config-loader.js`. The Liar's Gate threshold (`liar_gate_threshold`) is loaded from `logic_variables`. Both fall back to hardcoded defaults if the DB query fails. Operators can tune per-trade allocation percentages without code deployments.

**Out-of-Scope Files:**
- `src/lib/classification/scoring.ts` — This script handles project stage, not project value.

**Cross-Spec Dependencies:**
- Relies on: `56_source_massing.md` (for footprints), `57_source_neighbourhoods.md` (for income).

---

## 6. Trade Allocation Matrix — Hard Cost Percentages

**Status:** Draft Configuration (April 2026)
**Usage:** Used by `compute-cost-estimates.js` to populate the `trade_contract_values` JSONB.

### 1. Structural & Envelope (The Big Slices)
These trades consume the bulk of the early-stage budget.

| Trade Slug | % Allocation | Logic / Notes |
|---|---|---|
| framing | 15.0% | The largest single hard cost in SFD. |
| foundation | 10.0% | Includes excavation, forms, and footings. |
| roofing | 4.0% | Standard shingle/flat roof allocation. |
| masonry | 6.0% | Brickwork, stone veneers, and exterior block. |
| structural-steel | 3.0% | Beams and posts (high-end SFD / Multi-res). |
| waterproofing | 1.5% | Foundation wrap and damp proofing. |

### 2. Systems (MEP)
High-intensity trades with high "Rescue Mission" value.

| Trade Slug | % Allocation | Logic / Notes |
|---|---|---|
| electrical | 9.0% | Rough-in, panel, and fixtures. |
| plumbing | 8.0% | Drains, vents, and finish fixtures. |
| hvac | 7.0% | Ductwork, furnace, and AC system. |
| fire-protection | 1.5% | Sprinklers (mostly Multi-res/Commercial). |
| solar | 2.0% | Specialty add-on. |

### 3. Interior Finishes
These represent the "Peak 2" opportunities.

| Trade Slug | % Allocation | Logic / Notes |
|---|---|---|
| drywall | 5.0% | Boarding, taping, and sanding. |
| insulation | 2.5% | Batting, spray foam, and vapor barrier. |
| flooring | 4.0% | Hardwood, laminate, and sub-floor prep. |
| tiling | 3.0% | Kitchen and bathroom wet areas. |
| painting | 2.0% | Interior and exterior coating. |
| millwork-cabinetry | 6.0% | Kitchens, vanities, and built-ins. |
| trim-work | 2.5% | Baseboards, casing, and crown. |
| stone-countertops | 2.0% | Quartz/Granite fabrication and install. |

### 4. Exterior & Site Work
Often the "Early Bid" pipeline signals.

| Trade Slug | % Allocation | Logic / Notes |
|---|---|---|
| landscaping | 3.0% | Softscape, grading, and sod. |
| decking-fences | 2.0% | Exterior wood/composite structures. |
| concrete | 2.0% | Driveways, walkways, and curbs. |
| demolition | 2.0% | Site clearing and prep. |

### 5. Specialized & Misc

| Trade Slug | % Allocation | Logic / Notes |
|---|---|---|
| glass-glazing | 2.0% | Windows and shower enclosures. |
| elevator | 3.0% | High-end luxury add-on. |
| pool | 4.0% | High-value specialty lead. |
| general-contracting | (N/A) | Covered by the total project cost. |
| other | 1.0% | Miscellaneous / Unclassified. |
