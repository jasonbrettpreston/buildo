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
| stage_sequence | INTEGER | NOT NULL — sort order within construction (10=excavation, 20=footings, 30=framing, 40=insulation, 50=fire separations, 60=interior final, 70=occupancy). Used to determine which stage comes "next" for a given trade. |
| trade_slug | VARCHAR(50) | NOT NULL |
| relationship | VARCHAR(20) | NOT NULL — 'follows' (lag after stage passes) or 'concurrent' (during stage) |
| min_lag_days | INTEGER | NOT NULL — lower bound (P25) of days between stage pass and trade start |
| max_lag_days | INTEGER | NOT NULL — upper bound (P75) of days between stage pass and trade start |
| precedence | INTEGER | DEFAULT 100 — when multiple stages enable the same trade (e.g., painting after Fire Separations AND after Occupancy), lower precedence number wins. This makes the "earliest applicable stage" rule explicit. |

**Unique:** `(stage_name, trade_slug)` — but a single trade can appear under multiple stage_names with different precedence values

**Why min/max lag instead of single value:** The user story in §1 promises ranges ("plumbing rough-in in 2-4 weeks"). A single `typical_lag_days` integer cannot produce that output. The new schema captures the realistic spread.

**Why `stage_sequence`:** The original spec relied on "Tier 1 calculates how many stages remain before this trade" — but the table only described pairs, not a sequence. The `stage_sequence` integer encodes the standard construction order so the engine can compute "this permit's latest passed stage is `Footings/Foundations` (sequence 20), the trade I want needs `Structural Framing` (sequence 30), so we're 1 stage away."

**Seed data (key mappings):**

| Stage | Seq | Trade | Relationship | Min lag | Max lag | Precedence |
|-------|----:|-------|-------------|--------:|--------:|-----------:|
| Excavation/Shoring | 10 | concrete | follows | 5 | 14 | 100 |
| Excavation/Shoring | 10 | waterproofing | follows | 7 | 21 | 100 |
| Excavation/Shoring | 10 | drain-plumbing | concurrent | 0 | 7 | 100 |
| Footings/Foundations | 20 | framing | follows | 7 | 21 | 100 |
| Footings/Foundations | 20 | structural-steel | follows | 7 | 21 | 100 |
| Footings/Foundations | 20 | masonry | follows | 14 | 28 | 100 |
| Structural Framing | 30 | plumbing | follows | 5 | 14 | 100 |
| Structural Framing | 30 | electrical | follows | 5 | 14 | 100 |
| Structural Framing | 30 | hvac | follows | 5 | 14 | 100 |
| Structural Framing | 30 | fire-protection | follows | 7 | 21 | 100 |
| Structural Framing | 30 | roofing | concurrent | 0 | 14 | 100 |
| Insulation/Vapour Barrier | 40 | drywall | follows | 5 | 14 | 100 |
| Fire Separations | 50 | painting | follows | 7 | 21 | **10** |
| Fire Separations | 50 | flooring | follows | 7 | 21 | 100 |
| Fire Separations | 50 | tiling | follows | 7 | 21 | 100 |
| Fire Separations | 50 | trim-work | follows | 14 | 28 | 100 |
| Fire Separations | 50 | millwork-cabinetry | follows | 14 | 28 | 100 |
| Fire Separations | 50 | stone-countertops | follows | 14 | 28 | 100 |
| Interior Final Inspection | 60 | landscaping | follows | 0 | 14 | 100 |
| Interior Final Inspection | 60 | decking-fences | follows | 0 | 14 | 100 |
| Occupancy | 70 | painting | follows | 0 | 7 | **20** |

**Painting precedence note:** Painting appears under both Fire Separations (precedence 10) and Occupancy (precedence 20). The lower number wins, so the engine uses Fire Separations as the enabling stage. The Occupancy entry exists as a fallback if Fire Separations is not yet recorded for a permit.

### API Endpoints
None — this is a library consumed by the lead feed API (`70_lead_feed.md`).

### Implementation

**Timing engine:** `src/lib/leads/timing.ts`
- `getTradeTimingForPermit(permit_num, trade_slug): TradeTimingEstimate`
- Three-tier confidence model:

**Tier 1 — Stage-Based (high confidence):** When inspection data exists for the permit.
1. Query `permit_inspections` for this permit, ordered by inspection_date
2. Find the latest PASSED stage
3. Look up `inspection_stage_map` filtered by trade_slug, ordered by `precedence ASC`. The first matching row is the canonical enabling stage for this trade (lower precedence wins when a trade has multiple enabling stages).
4. **Staleness check:** If the latest passed stage is more than 180 days old AND no newer activity exists, treat the permit as abandoned and return `confidence: 'low'` with display "Project may be stalled — last activity X days ago." This prevents 2-year-old PASSED inspections from generating high-confidence "trade needed NOW" estimates.
5. If enabling stage is PASSED (and not stale): trade needed within `min_lag_days` to `max_lag_days` from map. Output: `{ min_days, max_days, confidence: 'high' }`
6. If enabling stage is OUTSTANDING: use `stage_sequence` to count how many stages remain before the enabling stage. Each stage gap adds the historical median stage-to-stage duration (~30 days) to both min and max bounds.
7. **"Not Passed" delay:** If the enabling stage exists but has status "Not Passed", add a +14 day penalty to both min and max bounds and append " (delayed — re-inspection pending)" to the display.
8. Display: "Framing complete — plumbing rough-in in 2-4 weeks" (uses the min/max range from the map)

**Tier 2 — Issued Heuristic (medium confidence):** Permit issued but no inspections yet.
1. Calculate months since `permits.issued_date`
2. Read median + P25/P75 from `timing_calibration` for this `permit_type` (cached in-memory at process startup, refreshed every 5 minutes — see Calibration caching below)
3. **Phase determination:** Reads from `src/lib/classification/phases.ts` (the existing phase model). spec 71 does NOT modify `phases.ts`; it only consumes the exported `PHASE_TRADE_MAP` constant. This is a read-only dependency, not a scope violation.
4. Estimate which phase the permit is likely in based on elapsed time
5. Use `PHASE_TRADE_MAP` from `phases.ts` to determine if trade is in that phase
6. Output: `{ min_days, max_days, confidence: 'medium' }` with bounds derived from P25/P75
7. Display: "Permit issued 6 weeks ago — your trade estimated in 4-12 weeks"

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

**Calibration caching (hot path optimization):** The timing engine is called for every permit on every feed query. Reading `timing_calibration` from disk per call would be wasteful. Instead, the engine loads all calibration rows into a Map at process startup, refreshes every 5 minutes via a background interval, and reads from the in-memory cache during request handling. The 5-minute staleness window is acceptable since calibration values change daily at most.

**Calibration freshness check:** If the latest `timing_calibration` row for a `permit_type` is more than 30 days old (e.g., the nightly job has been failing), the engine logs a `logWarn` and falls back to the global median. A monitoring alert fires if any calibration is >7 days old in production.

**Insufficient sample fallback:** If `sample_size < 20` for a `permit_type`, the engine falls back to the global median computed across all permit types.

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
  min_days_until_needed: number;         // lower bound (P25 / typical-min)
  max_days_until_needed: number;         // upper bound (P75 / typical-max)
  is_stale: boolean;                     // true if last activity > 180 days ago
  display: string;                       // human-readable timing string with range
}
```

### Edge Cases
1. **Permit with "Not Passed" on enabling stage:** Adds +14d to both min and max bounds. Display: "Framing inspection not passed — timeline delayed by ~2 weeks"
2. **Permit with all stages outstanding:** Fall back to Tier 2.
3. **Trade active in multiple stages (e.g., painting):** Use the row with lowest `precedence` value. The seed data sets Fire Separations precedence=10 and Occupancy precedence=20 for painting, so Fire Separations wins.
4. **Completed/Closed permit:** Return "Project complete — no longer active"
5. **Inspection data with no dates:** Use stage existence as a signal but not for timing. Confidence drops to 'medium'.
6. **Stale/abandoned permit (last activity > 180 days ago):** Mark `is_stale: true`, drop confidence to 'low', display "Project may be stalled — last activity X days ago". Prevents 2-year-old PASSED inspections from generating "trade needed NOW" estimates.
7. **Linked parent/child permits:** A Demolition permit with a linked New Building permit on the same parcel — timing engine checks siblings via `permit_parcels`. "Better match" is defined as: the sibling whose `enabling_stage` for the target trade is closer to the current calendar date than the target permit's. If a sibling has an enabling stage in the future and the target's is in the past, the sibling wins.
8. **Stage names not in `inspection_stage_map`:** 34 distinct stage names exist in DB. If a stage is unmapped, the engine logs `logWarn('[timing]', 'unmapped_stage', { stage_name })` and falls back to Tier 2 (issued heuristic). The nightly calibration job surfaces unmapped stages for manual review and addition to the seed table.
9. **Authorization:** This library does NOT check authorization itself. The caller (`/api/leads/feed`) is responsible for verifying the user has access to query timing for any given permit. The library will return timing for any permit it's asked about, on the assumption the caller has already authorized.
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
