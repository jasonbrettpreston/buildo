# Spec 83: Surgical Estimation Engine — Valuation & Trade Slicing

**Status:** ARCHITECTURE LOCKED  
**Purpose:** Provide trade-specific contract estimates by auditing municipal data against building massing and permit-specific classified scope to eliminate "global slicing" errors.

---

## 1. Goal & User Story

**Goal:** Eliminate "stupid" global slicing where every trade gets a budget regardless of the job. This engine provides surgical, trade-specific contract estimates by intersecting building massing (physics) with classified permit scope (intent) to provide a "Geometric Truth" that overrides lowball city reporting.

**User Story:** A plumber sees a lead not just as a "house," but as a "$15,000 Rough-in Opportunity" validated by building volume and the specific plumbing scope identified in the permit, allowing for high-confidence bidding.

---

## 2. Technical Architecture

### Database Schema

To support the surgical approach, the following fields must be present or added via Migration 097:

**`cost_estimates` (The Output)**

| Column | Type | Description |
| :--- | :--- | :--- |
| `permit_num` / `revision_num` | PK | Composite Primary Key. |
| `effective_area_sqm` | DECIMAL | The calculated $Area_{Eff}$ (Work Area). |
| `trade_contract_values` | JSONB | Object storing specific $$ values for active trades. |
| `is_geometric_override` | BOOLEAN | TRUE if city cost was discarded for our model. |
| `model_version` | INT | For tracking formula iterations. |

**`trade_sqft_rates` (The Rate Sheet - NEW)**

| Column | Type | Description |
| :--- | :--- | :--- |
| `trade_slug` | PK | (e.g., 'electrical', 'plumbing'). |
| `base_rate_sqft` | DECIMAL | Standard $/sqft for the trade. |
| `structure_complexity_factor` | DECIMAL | Multiplier for multi-unit vs. SFD builds. |

**`scope_intensity_matrix` (The Triangle - NEW)**

| Column | Type | Description |
| :--- | :--- | :--- |
| `permit_type` | INDEX | (e.g., 'Addition', 'New Build'). |
| `structure_type` | INDEX | (e.g., 'SFD', '4-Unit', 'Garden Suite'). |
| `gfa_allocation_percentage` | DECIMAL | % of total GFA the job touches (e.g., 0.25). |

### Implementation

The engine is split into "Muscle" (Execution) and "Brain" (Logic).

* **The Execution Engine (`scripts/compute-cost-estimates.js`)**: The "Muscle." Performs bulk valuation of 237k+ records by streaming data, joining classification results, and performing batch updates.
* **The Valuation Brain (`src/features/leads/lib/cost-model-shared.js`)**: The "Intelligence." A shared library providing a single source of truth for math used by both the Pipeline and the Mobile API.

#### Details (Avoiding W5, W8, W13)

**The Muscle (`compute-cost-estimates.js`)**:
* **Dual-Connection Model**: Must use a dedicated `const lockClient = await pool.connect()` to hold the Advisory Lock for the entire lifecycle. The DB writes must use `pipeline.withTransaction(pool, ...)` which safely checks out a *second* ephemeral connection for the batch. The lock client must remain isolated and idle.
* **Bulk INSERT**: Replace N+1 queries with multi-row `INSERT ... VALUES (...) ON CONFLICT` limited to ~4,600 rows per batch to stay under PostgreSQL parameter limits (83-W8).
* **The WAL Guard (Spec 47 §6.4)**: The bulk `INSERT ... ON CONFLICT` statement MUST include a `WHERE` clause verifying that the new payload is actually different from the existing DB row: 
  `WHERE EXCLUDED.effective_area_sqm IS DISTINCT FROM cost_estimates.effective_area_sqm OR EXCLUDED.trade_contract_values::text IS DISTINCT FROM cost_estimates.trade_contract_values::text`. 
  This prevents Write-Ahead Log (WAL) bloat on unchanged permits.
* **Stream Guard**: Wrap the `for await` stream in a dedicated `try/catch` to ensure final partial batches are flushed and errors aren't swallowed (83-W13).

**The Brain (`cost-model-shared.js`)**:
* Shared between JS and TS to solve Dual-path Drift (83-W4). The Liar's Gate logic must exist here so the API and Pipeline use the same override rules.

---

## 3. Behavioral Contract

### Inputs

* **Permit Metadata**: `est_const_cost`, `scope_tags`, `project_type`.
* **Classification Ledger**: Results of `classify-permits.js` (Step 13) identifying active trades.
* **Physical Data**: `footprint_area_sqm`, `height_m`, `lot_size_sqm`.
* **Neighborhood Data**: `avg_household_income`.

### Core Logic (Three-Step Valuation)

#### Step A: Establish Geometric Truth (GFA)
Calculate the physical baseline of the structure.
* **Primary (Massing)**: $GFA = Footprint\ Area \times (Stories\ or\ Height\ Factor)$
* **Fallback (Parcel)**: $GFA = Lot\ Size \times Coverage\ Ratio \times Default\ Stories$
  * Urban Coverage: 0.7x
  * Suburban Coverage: 0.4x

#### Step B: Determine Effective Work Area (Area_Eff)
The "Surgical Triangle" lookup using `classify-scope.js` result, Permit Type, and Structure Type.
**Area_Eff** = GFA * Permit Type Allocation %

#### Step C: Trade Valuation (The Constraint Filter)
The engine joins with `permit_trades`. If a trade was not identified during classification, Value = $0. For "Found" trades:
**Trade Value** = (Area_Eff * Base Trade Rate) * Structure Complexity Factor * Neighborhood Premium

*Note: The Structure Complexity Factor is pulled dynamically from `trade_sqft_rates` because multi-unit complexity affects trades disproportionately (e.g., plumbing vs. roofing).*

#### Step D: The "Liar's Gate" Validation
Final audit against city `est_const_cost`:
* **Zero-Total Bypass (CRITICAL)**: If `Surgical_Total === 0` (e.g., no active trades found), immediately return `$0` for all trades and set `cost_source: 'none'`. Do NOT attempt proportional slicing.
* **Default**: If Reported <= $1,000, use Surgical Total exclusively.
* **Override**: If Reported < (Surgical_Total * 0.25), use Surgical Total. Set `is_geometric_override = TRUE`.
* **Trust (Proportional Slicing)**: If Reported > (Surgical_Total * 0.25), use our $/sqft rates to determine Relative Weight:
  * **Benchmark**: Calculate what each trade should cost via Surgical model.
  * **Weight**: Calculate % each trade contributes to our theoretical total.
  * **Slice**: Apply those % weights to the city's reported total.

### Edge Cases
* **Missing Massing**: Fallback to Lot Size $\times$ coverage ratios.
* **Mixed-Use**: Requires multi-variable intensity matching for commercial/residential split.
* **Shell Permits**: Applies an additional `commercial_shell_multiplier` (0.60x) to interior trades.

### Step-by-Step Defense
**Step 1: Input Sanitization (Avoiding W12, W21)**
* **Numeric Guard**: Apply `Number.isFinite(row.est_const_cost)` to prevent NaN values from corrupting Path 2 logic.
* **String Cleaning**: All `scope_tags` and `permit_type` strings must be `.toLowerCase().trim()` before comparison.

**Step 2: Data Deduplication (Avoiding W2, W3)**
* **The Set Rule**: All `scope_tags` must be wrapped in `new Set(tags)` before iteration. This prevents a duplicate "pool" tag from adding $80K twice in the DB while the API only shows it once.

**Step 3: The Surgical Triangle & Shell Multiplier (Avoiding W1)**
* **Shell Detection**: Detect "Shell" permits via `permit_type` or work description keywords.
* **Interior Sub-set**: Define a constant list of `INTERIOR_TRADE_SLUGS` (e.g., drywall, painting, electrical).
* **The 0.60x Rule**: If Permit = Shell AND Trade = Interior, apply a 0.60x multiplier to the trade's $/sqft rate.

**Step 4: The Liar's Gate & Pathing (Avoiding W9, W11)**
* **Path 3 (Null)**: If no estimate is possible, return `cost_source: 'none'` (NOT 'model') to avoid misleading display logic.
* **Float Guard**: Change the gate check to `modelCost >= PLACEHOLDER_COST_THRESHOLD` to prevent near-zero floats from triggering false overrides.

**Step 5: Trade Slicing (The Relative Weight)**
* Only perform "Weighted Slicing" for trades found in the `permit_trades` JOIN.
* **Constraint**: Any trade not in the classification list is hard-coded to $0.

---

## 4. Admin Control Panel

### Tunable Variables

| Variable Group | Variable Name | Description |
| :--- | :--- | :--- |
| GFA Defaults | `urban_coverage_ratio` | 0.7x default for high-density lots. |
| GFA Defaults | `suburban_coverage_ratio` | 0.4x default for low-density lots. |
| Liar's Gate | `trust_threshold_pct` | The 25% window before city data is discarded. |
| Surgical Scope | `effective_area_matrix` | Grid of Permit Type vs. Structure Type percentages. |
| Trade Costs | `base_trade_rates` | The $/sqft for all 32 trades. |
| Geography | `income_premium_tiers` | Multiplier (1.0x to 1.85x) based on neighborhood wealth. |

### Operating Variables (Avoiding W7, W10)

| Variable Group | Variable | Requirement |
| :--- | :--- | :--- |
| Infra | `ADVISORY_LOCK_ID` | Strictly set to 83 to avoid collision with other specs. |
| Logic | `liar_gate_threshold` | Must be added to `ZERO_IS_INVALID` to prevent silent disabling. |
| Telemetry | `liar_gate_overrides` | Counter must be emitted to the `audit_table`. |
| Quality | `snapshots` | Script must populate `data_quality_snapshots` (from Migration 080). |

---

## 5. Testing Mandate

* **Logic**: `cost-model.logic.test.ts` — Asserts GFA precision, Surgical Triangle intensity weights, and Liar's Gate proportional slicing math.
* **Infra**: `cost-estimates.infra.test.ts` — Asserts `permit_trades` JOIN performance, batch-update integrity, and Migration 097 schema constraints.
* **Parity**: `parity-battery.test.ts` — Ensures `compute-cost-estimates.js` and `cost-model-shared.js` return identical values for 100+ permit scenarios.
* **Logic**: `cost-model.logic.test.ts` — Must test with duplicate `scope_tags` and verify 0.60x shell multipliers for interior trades.
* **Parity**: `parity-battery.test.ts` — Mandatory. Asserts that the Pipeline script and the API return the same values for "Liar's Gate" scenarios.
* **Infra**: `lock-integrity.test.ts` — Asserts that the advisory lock is released only at script end and uses a single pinned connection.

---

## 6. Operating Boundaries

**Target Files**
* `scripts/compute-cost-estimates.js` (The Muscle)
* `src/features/leads/lib/cost-model-shared.js` (The Brain)
* `migrations/097_surgical_valuation.sql`

**Out-of-Scope Files**
* `classify-permits.js`: This is an upstream dependency. The Slicer consumes this data but does not perform the classification itself.

**Cross-Spec Dependencies**
* **Relies on**: Spec 13 (Classify Permits) for trade identification and Spec 3 (Classify Scope) for project/structure types.
* **Consumed by**: Opportunity Scoring (Step 23) which uses the trade-specific dollar values for lead ranking.

---

## 7. Engine Mechanics Details

### 7.1 The Execution Engine (`compute-cost-estimates.js`)

**Objective**: This script is the "Muscle." Its goal is to perform bulk valuation of the entire permit database (237k+ records) by streaming data, invoking the valuation math, and performing high-speed database updates.

**How it Works**
1. **Concurrency Check**: It acquires an Advisory Lock to ensure only one instance of the engine is running.
2. **Pre-fetch Matrix (N+1 Guard)**: Before opening the stream, the script queries the entirety of `trade_sqft_rates` and `scope_intensity_matrix` and stores them in a standard JS `Map()` or object in memory.
3. **Streaming Query**: It opens a stream to the database, joining permits with `permit_trades` (Step 13 classification) and `permit_parcels`. (The loop performs synchronous memory lookups against the Map, never querying the DB per-row).
4. **The Loop**: For every permit in the stream, it calls the `cost-model-shared.js` library to calculate the surgical estimate.
5. **In-Loop Backpressure (Batch Flush)**: The script must NOT collect all 237,000 results in memory. The `batch` array must be evaluated *inside* the `for await` stream loop. As soon as `batch.length >= BATCH_SIZE`, the script pauses the stream, awaits `flushBatch()`, clears the array (`batch.length = 0`), and then resumes the stream to prevent Node V8 OOM crashes.

**Key Responsibilities**
* **Database I/O**: Managing the high-volume read/write operations for the valuation chain.
* **Context Gathering**: Providing the "Valuation Brain" with all raw inputs (Massing, Lot Size, Classification Tags).
* **State Management**: Updating `computed_at` timestamps to ensure incremental runs only process new or changed data.

**Required Tables & Fields**

| Table | Required Fields |
| :--- | :--- |
| `permits` | `permit_num`, `revision_num`, `est_const_cost`, `scope_tags`, `project_type`. |
| `permit_trades` | `trade_id`, `trade_slug` (Joined to filter active scope). |
| `permit_parcels` | `neighbourhood_id` (To route the geographic premium). |
| `neighbourhoods` | `avg_household_income` (Joined via permit_parcels to determine the premium tier). |
| `cost_estimates` | `effective_area_sqm`, `trade_contract_values` (JSONB), `is_geometric_override`. |

**Key Inputs & Outputs**
* **Inputs**:
  * `SOURCE_SQL` results: Raw permit data, parcel sizes, massing IDs, and `avg_household_income` (via `neighbourhoods` JOIN).
  * Classification Ledger: The results of `classify-permits.js` (Step 13) to know which trades are actually active.
  * Scope Metadata: The `project_type` and `scope_tags` from `classify-scope.js` (Step 3).
* **Outputs**:
  * `cost_estimates` table: Final values for `effective_area_sqm`, `is_geometric_override`, and the `trade_contract_values` JSONB.
  * Audit Metrics: Telemetry on how many city costs were overridden by the "Liar's Gate."

**Reusable Sections from Current Script**
* **The Pipeline Wrapper**: The `pipeline.run`, `ADVISORY_LOCK_ID`, and `BATCH_SIZE` logic are perfect and should stay.
* **The Database I/O**: The `flushBatch` function and the `SOURCE_SQL` query remain the backbone, though the SQL will need an additional JOIN with `permit_trades`.
* **Telemetry Boilerplate**: The `pipeline.emitSummary` and `audit_table` logic are already set up to handle the reporting we need.

### 7.2 The "Surgical" Logic Flow

To ensure this actually delivers reliable results, the logic inside the Valuation Brain will execute as follows:

**Step 1: Geometry (The Volume)**
We calculate the raw building size using the massing height or the story default:
$$\text{GFA}_{Total} = \text{Footprint Area} \times (\text{Stories or Height Factor})$$

**Step 2: Scope (The Intensity)**
We determine the "Effective Work Area" by applying the intensity multiplier from the Surgical Triangle (Permit Type $\times$ Structure Type $\times$ Use):
$$\text{Area}_{Eff} = \text{GFA}_{Total} \times \text{Intensity Matrix \%}$$

**Step 3: Trade Valuation (The Constraint)**
We check the list of Classified Trades. If a trade was found, we apply the $/sqft rate:
$$\text{Trade Value} = (\text{Area}_{Eff} \times \text{Trade Rate (\$sqft)}) \times \text{Neighborhood Premium}$$
*Note: We are removing the old SCOPE_ADDITIONS (the $80k pool/elevator logic) in favor of this trade-rate approach to ensure the numbers scale naturally with the size of the building.*

### 7.3 Required Database Fields (Migration 097)

To power these scripts, we need to add these fields to support the new surgical variables:
* **`trade_sqft_rates` Table:**
  * `trade_slug` (PK)
  * `base_rate_sqft` (The $/sqft for that trade)
  * `complexity_multiplier` (To account for multi-unit vs. SFD)
* **`scope_intensity_matrix` Table:**
  * `permit_type` + `structure_type` (Unique Index)
  * `gfa_allocation_pct` (e.g., 0.25 for an SFD Addition)
* **`cost_estimates` Table (Updated):**
  * `effective_area_sqm` (The result of Step 2 above)
  * `trade_contract_values` (JSONB)

---

