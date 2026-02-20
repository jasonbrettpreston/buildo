# 09 - Construction Phase Model

**Status:** In Progress
**Last Updated:** 2026-02-14
**Depends On:** `07_trade_taxonomy.md`, `08_trade_classification.md`
**Blocks:** `10_lead_scoring.md`, `15_dashboard_tradesperson.md`

---

## 1. User Story

> "As a tradesperson, I want to see permits that are in the right construction phase for my trade, so I'm not chasing leads too early or too late."

**Acceptance Criteria:**
- Every permit is assigned a construction phase based on time elapsed since issuance
- Each trade is mapped to the phase(s) where it is actively needed
- Trades see permits highlighted when the phase matches their trade
- Permit status overrides time-based phase determination in specific cases
- Phase transitions happen automatically as time passes

---

## 2. Technical Logic

### Phase Definitions

Four sequential construction phases based on months since `issued_date`:

| Phase | Slug | Time Range | Description |
|-------|------|------------|-------------|
| Early Construction | `early_construction` | 0 - 3 months | Site preparation, foundation, underground work |
| Structural | `structural` | 3 - 9 months | Building frame, core mechanical/electrical rough-in |
| Finishing | `finishing` | 9 - 18 months | Interior buildout, finishes, specialty systems |
| Landscaping | `landscaping` | 18+ months | Exterior completion, final grading, occupancy prep |

### Phase-Trade Mapping (PHASE_TRADE_MAP)

```
PHASE_TRADE_MAP = {
  early_construction: [
    'excavation',
    'shoring',
    'demolition',
    'concrete'
  ],
  structural: [
    'framing',
    'masonry',
    'structural-steel',
    'plumbing',
    'hvac',
    'electrical',
    'fire-protection'
  ],
  finishing: [
    'insulation',
    'drywall',
    'painting',
    'flooring',
    'glazing',
    'elevator'
  ],
  landscaping: [
    'landscaping',
    'waterproofing',
    'roofing'
  ]
}
```

### Phase Determination

```
determinePhase(permit: Permit): ConstructionPhase
  1. Check status overrides first:
     - If permit.status == "Completed" -> return 'landscaping'
     - If permit.status == "Application" -> return 'early_construction'
     - If permit.status == "Cancelled" or "Revoked" -> return 'early_construction'
       (these are flagged separately by scoring, but phase defaults to early)
  2. If issued_date is null -> return 'early_construction'
     (not yet issued, treat as pre-construction)
  3. Calculate months_since_issued = monthsDiff(now(), permit.issued_date)
  4. Determine phase by time range:
     - months_since_issued < 3  -> 'early_construction'
     - months_since_issued < 9  -> 'structural'
     - months_since_issued < 18 -> 'finishing'
     - months_since_issued >= 18 -> 'landscaping'
```

### Trade-Phase Activity Check

```
isTradeActiveInPhase(tradeSlug: string, phase: ConstructionPhase): boolean
  - Lookup tradeSlug in PHASE_TRADE_MAP[phase]
  - Return true if trade is listed in that phase
  - Return false otherwise
```

### Helper: Get Active Trades for Phase

```
getActiveTradesForPhase(phase: ConstructionPhase): string[]
  - Return PHASE_TRADE_MAP[phase]
  - Returns array of trade slugs active during the given phase
```

### Helper: Get Phases for Trade

```
getPhasesForTrade(tradeSlug: string): ConstructionPhase[]
  - Scan all phases in PHASE_TRADE_MAP
  - Return array of phases where the trade appears
  - Most trades appear in exactly 1 phase
```

### Month Difference Calculation

```
monthsDiff(now: Date, issuedDate: Date): number
  - Calculate calendar months between dates
  - Partial months round down (floor)
  - Future issued_date returns 0
```

### ConstructionPhase Type

```typescript
type ConstructionPhase = 'early_construction' | 'structural' | 'finishing' | 'landscaping';

interface PhaseInfo {
  slug: ConstructionPhase;
  name: string;
  monthStart: number;
  monthEnd: number | null;  // null for landscaping (open-ended)
  color: string;
  trades: string[];
}
```

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/classification/phases.ts` | Phase definitions, PHASE_TRADE_MAP, determinePhase(), isTradeActiveInPhase() | In Progress |
| `src/lib/classification/trades.ts` | Trade taxonomy (from spec `07`) | In Progress |
| `src/tests/classification.logic.test.ts` | Unit tests for phase determination and mapping | Planned |

---

## 4. Constraints & Edge Cases

- **No issued_date:** Some permits are in "Application" status with no issued_date. These default to `early_construction` phase.
- **Very old permits:** Permits issued 5+ years ago are still in `landscaping` phase. This is intentional -- they may represent long-running or stalled projects.
- **Status overrides vs. time:** Status overrides always take priority over time-based calculation. A "Completed" permit is always in `landscaping` phase regardless of when it was issued.
- **Trade in multiple phases:** Currently each trade maps to exactly one phase. If a trade spans phases (e.g., plumbing rough-in in structural, plumbing finish in finishing), the primary phase is used and the classification rules handle sub-trade specificity.
- **Phase boundaries:** Phase boundaries are inclusive on the lower bound and exclusive on the upper bound. A permit at exactly 3.0 months transitions to `structural`.
- **Timezone handling:** All date comparisons use UTC. The `issued_date` from Toronto Open Data is interpreted as Eastern Time and converted to UTC during ingestion.
- **Cancelled/Revoked permits:** These are assigned `early_construction` phase but are penalized heavily in lead scoring. The phase assignment is for display consistency, not lead relevance.
- **Future issued_date:** Data quality issue. Treated as 0 months elapsed (early_construction).
- **Phase display colors:**
  - `early_construction`: `#F59E0B` (amber)
  - `structural`: `#3B82F6` (blue)
  - `finishing`: `#8B5CF6` (purple)
  - `landscaping`: `#10B981` (green)

---

## 5. Data Schema

The phase model is computed at query time, not stored. No dedicated database table is required.

Phase is derived from:
- `permits.issued_date` (from spec `01`)
- `permits.status` (from spec `01`)

The computed phase is used as input to:
- `permit_trades.lead_score` (from spec `10`)
- API responses (computed on read)

### TypeScript Interfaces

```typescript
type ConstructionPhase = 'early_construction' | 'structural' | 'finishing' | 'landscaping';

interface PhaseInfo {
  slug: ConstructionPhase;
  name: string;
  monthStart: number;
  monthEnd: number | null;
  color: string;
  trades: string[];
}

const PHASES: PhaseInfo[] = [
  { slug: 'early_construction', name: 'Early Construction', monthStart: 0, monthEnd: 3, color: '#F59E0B', trades: ['excavation', 'shoring', 'demolition', 'concrete'] },
  { slug: 'structural', name: 'Structural', monthStart: 3, monthEnd: 9, color: '#3B82F6', trades: ['framing', 'masonry', 'structural-steel', 'plumbing', 'hvac', 'electrical', 'fire-protection'] },
  { slug: 'finishing', name: 'Finishing', monthStart: 9, monthEnd: 18, color: '#8B5CF6', trades: ['insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator'] },
  { slug: 'landscaping', name: 'Landscaping', monthStart: 18, monthEnd: null, color: '#10B981', trades: ['landscaping', 'waterproofing', 'roofing'] },
];
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Trade Taxonomy (`07`) | Upstream | Provides trade slugs for phase mapping |
| Classification Engine (`08`) | Upstream | Provides classified trades per permit |
| Database Schema (`01`) | Upstream | Provides `issued_date` and `status` fields |
| Lead Scoring (`10`) | Downstream | Phase match contributes to lead score |
| Tradesperson Dashboard (`15`) | Downstream | Phase badge display on permit cards |
| Search & Filter (`19`) | Downstream | Phase-based filtering of permits |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Early construction by time | Permit issued 1 month ago | Phase: `early_construction` |
| Structural by time | Permit issued 5 months ago | Phase: `structural` |
| Finishing by time | Permit issued 12 months ago | Phase: `finishing` |
| Landscaping by time | Permit issued 24 months ago | Phase: `landscaping` |
| Boundary: 0 months | Permit issued today | Phase: `early_construction` |
| Boundary: exactly 3 months | Permit issued 3 months ago | Phase: `structural` |
| Boundary: exactly 9 months | Permit issued 9 months ago | Phase: `finishing` |
| Boundary: exactly 18 months | Permit issued 18 months ago | Phase: `landscaping` |
| Status override: Completed | Permit status "Completed", issued 1 month ago | Phase: `landscaping` |
| Status override: Application | Permit status "Application", no issued_date | Phase: `early_construction` |
| Null issued_date | Permit with `issued_date: null` | Phase: `early_construction` |
| Future issued_date | Permit with issued_date in the future | Phase: `early_construction` (0 months) |
| Trade active in phase | `isTradeActiveInPhase('plumbing', 'structural')` | `true` |
| Trade not active in phase | `isTradeActiveInPhase('plumbing', 'finishing')` | `false` |
| All trades covered | Union of all PHASE_TRADE_MAP values | Contains all 20 trade slugs |
| No duplicate assignments | Each trade in PHASE_TRADE_MAP | Appears in exactly one phase |
| Get phases for trade | `getPhasesForTrade('excavation')` | `['early_construction']` |
| Get trades for phase | `getActiveTradesForPhase('structural')` | 7 trade slugs |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Phase badge on permit card | Each permit displays a colored phase badge (amber/blue/purple/green) |
| Phase badge label | Badge shows human-readable phase name (e.g., "Early Construction") |
| Phase-trade highlight | When user's trade matches permit phase, visual emphasis is applied |
| Phase filter | User can filter permits by construction phase |
| Phase tooltip | Hovering phase badge shows time range and active trades |
| Phase transition | Phase badge updates when permit crosses time boundary (no stale cache) |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| No dedicated table | Phase is computed, not stored -- no migration required |
| Query performance | Phase computation in SQL/application layer adds < 5ms per query |
| Timezone consistency | `issued_date` comparisons use UTC throughout |
| Cache invalidation | Phase computation reflects current date, not cached stale date |
