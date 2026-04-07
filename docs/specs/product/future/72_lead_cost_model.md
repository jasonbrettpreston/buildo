# Lead Cost Model — Job Size & Difficulty Estimation

> **Status: FUTURE BUILD** — Architecture locked, not yet implemented.

<requirements>
## 1. Goal & User Story
Estimate job cost and complexity for permits where `est_const_cost` is missing (55% of permits), using building massing, neighbourhood demographics, and scope tags. Helps tradespeople assess whether a job is worth pursuing: "High-value — $1.2M–$1.8M estimated, premium neighbourhood, complex scope."
</requirements>

---

<architecture>
## 2. Technical Architecture

### Database Schema

**`cost_estimates`** — cached cost model output per permit
| Column | Type | Constraints |
|--------|------|-------------|
| permit_num | VARCHAR(30) | PK (composite), FK → permits ON DELETE CASCADE |
| revision_num | VARCHAR(10) | PK (composite) |
| estimated_cost | DECIMAL(15,2) | nullable — null if insufficient data |
| cost_source | VARCHAR(20) | NOT NULL — 'permit' (actual) or 'model' (estimated) |
| cost_tier | VARCHAR(20) | 'small', 'medium', 'large', 'major', 'mega' |
| cost_range_low | DECIMAL(15,2) | low end of estimate range |
| cost_range_high | DECIMAL(15,2) | high end of estimate range |
| premium_factor | DECIMAL(3,2) | neighbourhood premium multiplier (1.0–2.0) |
| complexity_score | INTEGER | 0-100 from scope tags + massing |
| model_version | INTEGER | DEFAULT 1 |
| computed_at | TIMESTAMPTZ | DEFAULT NOW() |

**Migration pattern:** UP creates table + FK + index. DOWN drops table cascade. Example:
```sql
-- UP (migration 068)
CREATE TABLE cost_estimates (
  permit_num VARCHAR(30) NOT NULL,
  revision_num VARCHAR(10) NOT NULL,
  -- ... columns as above
  PRIMARY KEY (permit_num, revision_num),
  FOREIGN KEY (permit_num, revision_num) 
    REFERENCES permits(permit_num, revision_num) 
    ON DELETE CASCADE
);
CREATE INDEX idx_cost_estimates_tier ON cost_estimates(cost_tier);

-- DOWN
DROP TABLE IF EXISTS cost_estimates CASCADE;
```

### API Endpoints
None — this is a library consumed by the lead feed API and pre-computed by a pipeline step.

### Implementation

**Cost model:** `src/lib/leads/cost-model.ts`
- `estimateCost(permit, parcel, massing, neighbourhood): CostEstimate`

**Model logic:**

1. **If `est_const_cost` exists and > $1,000:** Use directly. Source = 'permit'. The `> 1000` threshold filters out placeholder values like `$1` that are not real cost data — earlier draft used `> 0` which incorrectly accepted placeholders. For permit-reported costs: `cost_range_low = cost_range_high = estimated_cost` (no range).

2. **If no cost, build estimate from:**

   **Base rate per sqm (by structure type + work type):**
   | Category | Base Rate $/sqm | Midpoint used |
   |----------|----------------|---------------|
   | New residential (SFD) | $2,500–$3,500 | $3,000 |
   | New residential (semi/town) | $2,200–$3,000 | $2,600 |
   | New multi-residential | $2,800–$4,000 | $3,400 |
   | Addition/alteration | $1,500–$2,500 | $2,000 |
   | Commercial new build | $3,000–$5,000 | $4,000 |
   | Interior renovation | $800–$1,500 | $1,150 |

   **Range derivation:** Calculations use the midpoint. The min/max bounds in the table become the ±25% range applied to the final estimate.

   **Building area:** `building_footprints.footprint_area_sqm × estimated_stories`
   - **Story height note:** `stories` is included once in the area calculation. The earlier draft formula `area × rate × premium × stories` was a copy-paste error that double-counted stories.
   - **Urban-aware fallback if no massing:** Detect urban context via `neighbourhoods.tenure_renter_pct > 50%`. Urban lots have higher coverage ratios (row houses, condos):
     - Urban (`tenure_renter_pct > 50%`): `parcels.lot_size_sqm × 0.7` × `floors_estimate`
     - Suburban (`tenure_renter_pct ≤ 50%`): `parcels.lot_size_sqm × 0.4` × `floors_estimate`
     - `floors_estimate` defaults to 2 for residential, 1 for commercial
     - Both fallbacks lower confidence to 'low' and add ±50% range instead of ±25%

   **Neighbourhood premium factor (single signal, no double-counting):**
   - `neighbourhoods.avg_household_income` mapped to multiplier:
   - <$60K → 1.0
   - $60K–$100K → 1.15
   - $100K–$150K → 1.35
   - $150K–$200K → 1.60
   - >$200K → 1.85
   - **Removed the `tenure_owner_pct` bonus.** It correlates strongly with `avg_household_income` and was double-counting the same signal. If we want a tenure-based adjustment in the future, it should REPLACE the income factor, not stack with it.

   **Scope complexity additions (additive, not multiplicative):**
   - pool: +$80K
   - elevator: +$60K
   - underpinning: +$40K
   - solar: +$25K
   - These are added AFTER the area × rate × premium calculation, never multiplied

3. **Cost tiers (boundaries are inclusive on the lower bound):**
   | Tier | Range | Display |
   |------|-------|---------|
   | small | $0–$99,999 | "Small Job" |
   | medium | $100,000–$499,999 | "Medium Job" |
   | large | $500,000–$1,999,999 | "Large Job" |
   | major | $2,000,000–$9,999,999 | "Major Project" |
   | mega | $10,000,000+ | "Mega Project" |

4. **Output range:** ±25% for model estimates with full data, ±50% for fallback estimates (urban-aware, no massing). For permit-reported costs (`source='permit'`), `cost_range_low = cost_range_high = estimated_cost` exactly.

**Complexity score (0-100, capped):** Independent of cost, measures job difficulty for the tradesperson.
- High-rise (estimated_stories > 6): +30
- Multi-unit (dwelling_units > 4): +20
- Large footprint (>300sqm): +15
- Premium neighbourhood (income > $150K): +15
- Complex scope (underpinning, elevator, pool): +10 each
- New build (vs. renovation): +10
- **Cap with `LEAST(100, sum)`:** The maximum theoretical sum is 30+20+15+15+10+10+10+10 = 120. Without capping, the schema's 0-100 range would be violated. The cap is applied in the model code AND enforced by a CHECK constraint on the column.

**Display strings:**
- With actual cost: "$1,200,000 · Large Job · Premium neighbourhood"
- With model estimate: "$1.2M–$1.8M estimated · Large Job · Premium neighbourhood · Complex scope"
- Without sufficient data: "Large lot, premium neighbourhood — cost estimate unavailable"

**Pipeline step (REQUIRED — not optional):** `scripts/compute-cost-estimates.js`
- Pre-computes cost_estimates for all permits using the model. **The lead feed API depends on this — it reads from `cost_estimates` cache, never computes on the fly.** Earlier draft labeled this "optional" which was misleading.
- Runs after parcel linkage and massing linkage in the sources chain
- Updates cost_estimates table; feed API reads from cache
- **Concurrency safety:** Uses a PostgreSQL advisory lock (`pg_try_advisory_lock(74)`) to prevent two instances of the script from running concurrently with permit ingestion. If the lock can't be acquired, the script logs and exits cleanly.
- **Idempotency:** Each run uses an UPSERT pattern keyed on `(permit_num, revision_num)`. Re-running is safe.
- **Batched processing:** 5,000 permits per transaction to avoid long-running transactions and lock escalation.
- **Failure recovery:** If a batch fails, the script logs the failure and continues with the next batch. The next nightly run picks up any permits that failed previously.

**Calibration:**
- 110K permits with actual `est_const_cost` serve as ground truth
- Compare model estimates against actuals to tune base rates and multipliers
- Track `model_version` to re-compute when rates are adjusted

</architecture>

---

<behavior>
## 4. Behavioral Contract

### Inputs
- Permit record (est_const_cost, permit_type, structure_type, work, scope_tags, dwelling_units_created)
- Parcel record (lot_size_sqm, frontage_m)
- Building footprint (footprint_area_sqm, max_height_m, estimated_stories)
- Neighbourhood (avg_household_income, tenure_owner_pct)

### Core Logic
1. Check if `est_const_cost` is available → use as source of truth
2. If not, collect massing + neighbourhood + scope signals
3. Calculate base estimate from area × rate × premium × stories
4. Add scope premiums (pool, elevator, etc.)
5. Apply ±25% range for model estimates
6. Compute cost_tier and complexity_score independently
7. Return CostEstimate with display strings

### Outputs
```typescript
interface CostEstimate {
  estimated_cost: number | null;
  cost_source: 'permit' | 'model';
  cost_tier: 'small' | 'medium' | 'large' | 'major' | 'mega';
  cost_range_low: number | null;
  cost_range_high: number | null;
  premium_factor: number;
  complexity_score: number;
  display: string;
  premium_neighbourhood: boolean;
}
```

### Edge Cases
1. **No massing AND no parcel data:** Cannot estimate cost. Return cost_tier based on permit_type heuristic only ("New Houses" → likely medium-large, "Small Residential" → likely small-medium).
2. **Massing but no neighbourhood:** Estimate without premium factor (premium_factor = 1.0).
3. **est_const_cost = 0 or $1:** Treat as missing — some permits use placeholder values.
4. **Commercial/industrial permits:** Different base rates; flag as "Commercial — cost model less precise."
</behavior>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `leads-cost.logic.test.ts` — model calculation for each structure type, premium factor tiers, scope premium additions, cost tier assignment, range calculation, fallback when data missing, calibration against known permits
- **Infra:** `leads-cost.infra.test.ts` — cost_estimates table read/write, pipeline step idempotency
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `src/lib/leads/cost-model.ts`
- `scripts/compute-cost-estimates.js` (optional pipeline step)
- `migrations/068_cost_estimates.sql`

### Out-of-Scope Files
- `src/lib/classification/scoring.ts` — existing lead_score unchanged; cost model is separate
- `scripts/load-permits.js` — permit ingestion untouched

### Cross-Spec Dependencies
- **Relies on:** `55_source_parcels.md` (lot size), `56_source_massing.md` (building footprint), `57_source_neighbourhoods.md` (demographics), `60_shared_steps.md` (parcel/massing linkage)
- **Consumed by:** `70_lead_feed.md` (value pillar in feed scoring)
</constraints>
