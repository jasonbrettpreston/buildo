# Lead Timing Engine — Stage-Based Trade Timing Estimates

> **Status: FUTURE BUILD** — Architecture locked, not yet implemented.

<requirements>
## 1. Goal & User Story
Estimate when a tradesperson's services will be needed on a specific permit, using real inspection stage progression data when available and calibrated heuristics when not. A plumber sees "Framing complete — plumbing rough-in in 2-4 weeks" instead of a vague phase label.
</requirements>

---

<architecture>
## 2. Technical Architecture

### Database Schema

**`inspection_stage_map`** — reference table mapping inspection stages to trades
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PK |
| stage_name | TEXT | NOT NULL |
| trade_slug | VARCHAR(50) | NOT NULL |
| relationship | VARCHAR(20) | NOT NULL — 'enables', 'concurrent', 'follows' |
| typical_lag_days | INTEGER | days after stage passes before trade starts |

**Unique:** `(stage_name, trade_slug)`

**Seed data (key mappings):**

| Stage | Trade | Relationship | Lag Days |
|-------|-------|-------------|----------|
| Excavation/Shoring | concrete | follows | 7 |
| Excavation/Shoring | waterproofing | follows | 14 |
| Excavation/Shoring | drain-plumbing | concurrent | 0 |
| Footings/Foundations | framing | follows | 14 |
| Footings/Foundations | structural-steel | follows | 14 |
| Footings/Foundations | masonry | follows | 21 |
| Structural Framing | plumbing | follows | 7 |
| Structural Framing | electrical | follows | 7 |
| Structural Framing | hvac | follows | 7 |
| Structural Framing | fire-protection | follows | 14 |
| Structural Framing | roofing | concurrent | 0 |
| Insulation/Vapour Barrier | drywall | follows | 7 |
| Fire Separations | painting | follows | 14 |
| Fire Separations | flooring | follows | 14 |
| Fire Separations | tiling | follows | 14 |
| Fire Separations | trim-work | follows | 21 |
| Fire Separations | millwork-cabinetry | follows | 21 |
| Fire Separations | stone-countertops | follows | 21 |
| Interior Final Inspection | landscaping | follows | 7 |
| Interior Final Inspection | decking-fences | follows | 7 |
| Occupancy | painting | follows | 0 |

### API Endpoints
None — this is a library consumed by the lead feed API (`70_lead_feed.md`).

### Implementation

**Timing engine:** `src/lib/leads/timing.ts`
- `getTradeTimingForPermit(permit_num, trade_slug): TradeTimingEstimate`
- Three-tier confidence model:

**Tier 1 — Stage-Based (high confidence):** When inspection data exists for the permit.
1. Query `permit_inspections` for this permit, ordered by inspection_date
2. Find the latest PASSED stage
3. Look up `inspection_stage_map` to find which stages enable this trade
4. If enabling stage is PASSED: trade needed NOW (lag_days from map)
5. If enabling stage is OUTSTANDING: calculate how many stages remain before this trade
6. Display: "Framing complete — plumbing rough-in in ~2 weeks"

**Tier 2 — Issued Heuristic (medium confidence):** Permit issued but no inspections yet.
1. Calculate months since `permits.issued_date`
2. Median time to first inspection = 105 days (calibrated from 7,732 permit sample)
3. Adjust by permit type: "New Houses" start ~30% faster than "Small Residential"
4. Estimate which phase the permit is likely in based on elapsed time
5. Use `PHASE_TRADE_MAP` from existing phases.ts to determine if trade is in that phase
6. Display: "Permit issued 6 weeks ago — construction likely starting soon (estimated)"

**Tier 3 — Pre-Permit Heuristic (low confidence):** COA approved, no building permit yet.
1. Calculate months since COA decision_date
2. Typical COA→building permit gap: 3-6 months (to be calibrated from linked COA data)
3. Add phase timing on top of estimated permit filing
4. Display: "Pre-permit stage — your trade estimated 8-14 months out"

**Calibration data (from audit — initial seed only):**
- Issued → first inspection: Avg=182d, Median=105d, P25=44d, P75=238d (n=7,732)
- Inspection activity by phase: 0-3mo=3,202 permits, 4-9mo=3,520, 10-18mo=2,738, 18+mo=1,379
- Key stage sequence observed: Excavation → Footings → Framing → Insulation → Fire Separations → Finals

**Dynamic calibration:** Hardcoded values will drift as construction practices change and more inspection data becomes available. A nightly pipeline step (`scripts/compute-timing-calibration.js`) re-computes median/percentile values per `permit_type` and writes to a new `timing_calibration` table:

```sql
CREATE TABLE timing_calibration (
  id SERIAL PRIMARY KEY,
  permit_type VARCHAR(100) NOT NULL,
  median_days_to_first_inspection INTEGER NOT NULL,
  p25_days INTEGER NOT NULL,
  p75_days INTEGER NOT NULL,
  sample_size INTEGER NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(permit_type)
);
```

The timing engine reads the latest row per permit_type at query time. If no data exists for a permit_type (sample < 20), falls back to the global median.

**Parent/child permit linkage:** Sites often have multiple linked permits — Demolition, then New Building, then revisions. The timing engine must check for sibling permits on the same parcel and prefer the permit whose phase matches the target trade.

Logic in `getTradeTimingForPermit`:
1. Query `permit_parcels` for all permits on the same parcel(s) as the target permit
2. For each sibling, determine its current phase
3. If a sibling's phase window matches the target trade better than the target permit's phase, use the sibling's timing
4. Example: Request timing for plumbing on a Demolition permit → find linked New Building permit → return New Building's structural phase timing instead
5. If no better sibling found, use the target permit's timing as-is

</architecture>

---

<behavior>
## 4. Behavioral Contract

### Inputs
- `permit_num` and `trade_slug`
- Optionally: permit's `issued_date`, `status`, `permit_type` for heuristic fallback

### Core Logic

1. Check if permit has inspection data in `permit_inspections`
2. If YES → Tier 1 stage-based timing
3. If NO but has `issued_date` → Tier 2 heuristic
4. If NO issued_date (pre-permit/application) → Tier 3 heuristic
5. Return `TradeTimingEstimate` with display string, confidence level, and numeric estimate

### Outputs
```typescript
interface TradeTimingEstimate {
  confidence: 'high' | 'medium' | 'low';
  current_stage: string | null;          // e.g., 'Structural Framing'
  current_stage_status: string | null;   // 'Passed', 'Outstanding', 'Not Passed'
  current_stage_date: string | null;     // ISO date of stage completion
  enabling_stage: string | null;         // stage that unlocks this trade
  enabling_stage_status: string | null;
  estimated_days_until_needed: number;
  display: string;                       // human-readable timing string
}
```

### Edge Cases
1. **Permit with "Not Passed" on enabling stage:** Delays the timeline. Display: "Framing inspection not passed — timeline delayed, re-inspection pending"
2. **Permit with all stages outstanding:** Treat like no inspection data — fall back to Tier 2.
3. **Trade active in multiple phases:** Use the earliest applicable enabling stage.
4. **Completed/Closed permit:** Return "Project complete — no longer active"
5. **Inspection data with no dates:** Some inspection records have `inspection_date = NULL` (56,455 "Outstanding"). Use stage existence as a signal but not for timing.
6. **Linked parent/child permits:** A Demolition permit with a linked New Building permit on the same parcel — timing engine checks siblings via `permit_parcels` and uses the sibling whose phase best matches the target trade.
7. **Stage names not in `inspection_stage_map`:** 34 distinct stage names exist in DB — if a stage is unmapped, log it and fall back to phase-based timing. Nightly job can surface unmapped stages for manual review.
</behavior>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `leads-timing.logic.test.ts` — Tier 1/2/3 routing, stage→trade mapping lookup, lag day calculation, confidence assignment, all edge cases (not-passed, no dates, completed permits, pre-permits)
- **Infra:** `leads-timing.infra.test.ts` — inspection_stage_map seed data integrity, query correctness against permit_inspections
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `src/lib/leads/timing.ts`
- `migrations/069_inspection_stage_map.sql`

### Out-of-Scope Files
- `src/lib/classification/phases.ts` — existing phase model untouched; timing engine is additive
- `scripts/classify-inspection-status.js` — inspection classification pipeline unchanged

### Cross-Spec Dependencies
- **Relies on:** `53_source_aic_inspections.md` (inspection data), `42_chain_coa.md` (pre-permit linkage)
- **Consumed by:** `70_lead_feed.md` (timing pillar in feed scoring)
</constraints>
