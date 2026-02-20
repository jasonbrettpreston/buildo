# 10 - Lead Scoring

**Status:** In Progress
**Last Updated:** 2026-02-14
**Depends On:** `07_trade_taxonomy.md`, `08_trade_classification.md`, `09_construction_phases.md`
**Blocks:** `15_dashboard_tradesperson.md`, `19_search_filter.md`

---

## 1. User Story

> "As a tradesperson, I want permits ranked by relevance so the best opportunities appear first."

**Acceptance Criteria:**
- Every permit-trade combination receives a lead score from 0 to 100
- Higher scores indicate better lead opportunities
- Scoring accounts for permit status, project cost, recency, phase match, classification confidence, staleness, and revocation
- Scores are recalculated when permit data changes
- Permits are sorted by lead score descending in trade-specific feeds

---

## 2. Technical Logic

### Score Formula

```
lead_score = CLAMP(0, 100,
    base_score
  + cost_boost
  + freshness_boost
  + phase_match
  + confidence_boost
  - staleness_penalty
  - revocation_penalty
)
```

### Component Breakdown

#### Base Score (0 - 50 points)

Determined by permit status. Reflects the likelihood that the project will proceed.

| Status | Base Score | Rationale |
|--------|-----------|-----------|
| `Issued` | 50 | Active permit, highest value |
| `Under Review` | 35 | Likely to be issued |
| `Application` | 20 | Early stage, uncertain |
| `Not Issued` | 10 | Denied or on hold |
| `Completed` | 5 | Work done, limited opportunity |
| `Cancelled` | 0 | No opportunity |
| `Revoked` | 0 | No opportunity (also penalized) |

```
getBaseScore(status: string): number
  - Lookup status in base score table
  - Unknown statuses default to 10
```

#### Cost Boost (0 - 15 points)

Higher estimated project cost indicates larger, more valuable leads.

```
getCostBoost(estimatedCost: number | null): number
  - If null or 0: return 0
  - If < $50,000: return 3
  - If < $250,000: return 7
  - If < $1,000,000: return 11
  - If >= $1,000,000: return 15
```

#### Freshness Boost (0 - 20 points)

Recently issued or updated permits are more valuable because the project is actively progressing.

```
getFreshnessBoost(issuedDate: Date | null): number
  - If null: return 0
  - days = daysSince(issuedDate)
  - If days <= 30: return 20
  - If days <= 90: return 15
  - If days <= 180: return 10
  - If days <= 365: return 5
  - If days > 365: return 0
```

#### Phase Match Boost (0 - 15 points)

Bonus when the permit's current construction phase matches the trade's active phase.

```
getPhaseMatchBoost(permitPhase: ConstructionPhase, tradeSlug: string): number
  - If isTradeActiveInPhase(tradeSlug, permitPhase): return 15
  - If isTradeActiveInAdjacentPhase(tradeSlug, permitPhase): return 5
  - Else: return 0
```

Adjacent phase logic: If a trade is active in the phase immediately before or after the permit's current phase, a reduced boost applies. This accounts for overlapping work timelines.

#### Confidence Boost (0 - 10 points)

Higher classification confidence increases the score, rewarding strong trade matches.

```
getConfidenceBoost(confidence: number): number
  - return Math.round(confidence * 10)
  - Tier 1 match (0.95) -> 10 points
  - Tier 2 match (0.80) -> 8 points
  - Tier 3 match (0.50-0.70) -> 5-7 points
```

#### Staleness Penalty (0 - 20 points)

Permits that have not been updated in a long time are less likely to represent active projects.

```
getStalenessPenalty(lastUpdated: Date): number
  - days = daysSince(lastUpdated)
  - If days <= 90: return 0
  - If days <= 180: return 5
  - If days <= 365: return 10
  - If days <= 730: return 15
  - If days > 730: return 20
```

#### Revocation Penalty (0 - 30 points)

Revoked permits are strongly penalized to push them to the bottom of results.

```
getRevocationPenalty(status: string): number
  - If status == "Revoked": return 30
  - If status == "Cancelled": return 20
  - Else: return 0
```

### Score Calculation

```
calculateLeadScore(
  permit: Permit,
  tradeSlug: string,
  confidence: number,
  permitPhase: ConstructionPhase
): number
  1. base = getBaseScore(permit.status)
  2. cost = getCostBoost(permit.est_cost)
  3. fresh = getFreshnessBoost(permit.issued_date)
  4. phase = getPhaseMatchBoost(permitPhase, tradeSlug)
  5. conf = getConfidenceBoost(confidence)
  6. stale = getStalenessPenalty(permit.last_updated)
  7. revoke = getRevocationPenalty(permit.status)
  8. raw = base + cost + fresh + phase + conf - stale - revoke
  9. return Math.max(0, Math.min(100, raw))
```

### Recalculation Triggers

Lead scores are recalculated when:
- A permit is ingested or updated during sync
- Classification rules change (re-classify then re-score)
- Periodically (daily) to update freshness/staleness components

### Score Storage

The computed score is stored in the `permit_trades` junction table to enable efficient sorting without re-computation on every query.

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/classification/scoring.ts` | Score formula, component functions, calculateLeadScore() | In Progress |
| `migrations/006_permit_trades.sql` | Create permit_trades junction table with lead_score column | In Progress |
| `src/lib/classification/phases.ts` | Phase determination (from spec `09`) | In Progress |
| `src/lib/classification/trades.ts` | Trade taxonomy (from spec `07`) | In Progress |
| `src/tests/scoring.logic.test.ts` | Unit tests for each scoring component and total score | Planned |

---

## 4. Constraints & Edge Cases

- **Score clamping:** Final score is always clamped to [0, 100]. Negative raw scores become 0. Scores exceeding 100 become 100.
- **Null estimated cost:** Many permits have no cost estimate. These receive 0 cost_boost, not a penalty.
- **Null issued_date:** Permits without an issued_date receive 0 freshness_boost. They are not penalized for staleness based on issued_date (staleness uses `last_updated` instead).
- **Unknown status:** Permit statuses not in the base score lookup table default to base_score of 10.
- **Maximum theoretical score:** 50 (base) + 15 (cost) + 20 (fresh) + 15 (phase) + 10 (confidence) = 110. Clamped to 100.
- **Minimum theoretical score:** 0 (base) + 0 - 20 (stale) - 30 (revoke) = -50. Clamped to 0.
- **Revocation double-penalty:** Revoked permits get base_score 0 AND revocation_penalty 30, which is intentional to strongly suppress them.
- **Cancelled vs Revoked:** Cancelled permits are penalized less (20) than revoked (30) because cancellation may be voluntary and the project could restart.
- **Score precision:** Scores are stored as integers (no decimal points). Rounding uses `Math.round()`.
- **Bulk recalculation:** When scores are recalculated in batch (e.g., daily freshness update), the process must handle 50,000+ permit-trade combinations efficiently.

---

## 5. Data Schema

### `permit_trades` Table

```sql
CREATE TABLE permit_trades (
  id              SERIAL PRIMARY KEY,
  permit_id       INTEGER NOT NULL REFERENCES permits(id),
  trade_id        INTEGER NOT NULL REFERENCES trades(id),
  tier            SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
  confidence      DECIMAL(3,2) NOT NULL,
  lead_score      INTEGER NOT NULL DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  phase_at_score  VARCHAR(50),            -- phase when score was calculated
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(permit_id, trade_id)
);

CREATE INDEX idx_permit_trades_trade_score ON permit_trades(trade_id, lead_score DESC);
CREATE INDEX idx_permit_trades_permit ON permit_trades(permit_id);
CREATE INDEX idx_permit_trades_score ON permit_trades(lead_score DESC);
```

### TypeScript Interface

```typescript
interface PermitTrade {
  id: number;
  permitId: number;
  tradeId: number;
  tier: 1 | 2 | 3;
  confidence: number;
  leadScore: number;
  phaseAtScore: ConstructionPhase | null;
  scoredAt: Date;
  createdAt: Date;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Trade Taxonomy (`07`) | Upstream | Trade IDs for permit_trades foreign key |
| Classification Engine (`08`) | Upstream | Trade matches with confidence for scoring input |
| Phase Model (`09`) | Upstream | Phase determination for phase_match boost |
| Database Schema (`01`) | Upstream | Permit status, est_cost, issued_date, last_updated |
| Data Ingestion (`02`) | Upstream | Triggers re-scoring after permit update |
| Tradesperson Dashboard (`15`) | Downstream | Sorted permit feed by lead_score |
| Search & Filter (`19`) | Downstream | Score-based sorting and minimum score filter |
| Notifications (`21`) | Downstream | High-score permits trigger notification alerts |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Base: Issued | status = "Issued" | base_score = 50 |
| Base: Under Review | status = "Under Review" | base_score = 35 |
| Base: Application | status = "Application" | base_score = 20 |
| Base: Completed | status = "Completed" | base_score = 5 |
| Base: Cancelled | status = "Cancelled" | base_score = 0 |
| Base: Unknown | status = "SomeNewStatus" | base_score = 10 |
| Cost: null | est_cost = null | cost_boost = 0 |
| Cost: small | est_cost = 25,000 | cost_boost = 3 |
| Cost: medium | est_cost = 150,000 | cost_boost = 7 |
| Cost: large | est_cost = 500,000 | cost_boost = 11 |
| Cost: mega | est_cost = 5,000,000 | cost_boost = 15 |
| Fresh: very recent | issued 10 days ago | freshness_boost = 20 |
| Fresh: recent | issued 60 days ago | freshness_boost = 15 |
| Fresh: moderate | issued 120 days ago | freshness_boost = 10 |
| Fresh: old | issued 300 days ago | freshness_boost = 5 |
| Fresh: very old | issued 400 days ago | freshness_boost = 0 |
| Fresh: null | issued_date = null | freshness_boost = 0 |
| Phase: match | plumbing + structural phase | phase_match = 15 |
| Phase: adjacent | plumbing + finishing phase | phase_match = 5 |
| Phase: no match | plumbing + landscaping phase | phase_match = 0 |
| Confidence: Tier 1 | confidence = 0.95 | confidence_boost = 10 |
| Confidence: Tier 2 | confidence = 0.80 | confidence_boost = 8 |
| Confidence: Tier 3 low | confidence = 0.50 | confidence_boost = 5 |
| Stale: recent | last_updated 30 days ago | staleness_penalty = 0 |
| Stale: moderate | last_updated 200 days ago | staleness_penalty = 5 |
| Stale: old | last_updated 400 days ago | staleness_penalty = 10 |
| Stale: very old | last_updated 800 days ago | staleness_penalty = 20 |
| Revoke: Revoked | status = "Revoked" | revocation_penalty = 30 |
| Revoke: Cancelled | status = "Cancelled" | revocation_penalty = 20 |
| Revoke: normal | status = "Issued" | revocation_penalty = 0 |
| Clamp: high | All max components | score = 100 (not 110) |
| Clamp: low | Revoked + very stale | score = 0 (not negative) |
| Issued > Under Review | Same permit, both statuses | Issued score > Under Review score |
| High cost > low cost | Same permit, different costs | Higher cost = higher score |
| Recent > old | Same permit, different dates | More recent = higher score |
| Full calculation | Issued, $500K, 30 days, phase match, Tier 1 | 50 + 11 + 20 + 15 + 10 - 0 - 0 = 100 (clamped) |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Score display | Lead score shown as number (0-100) on permit cards |
| Score color coding | High (70+) green, Medium (40-69) yellow, Low (0-39) red |
| Sort by score | Default permit list sorted by lead_score descending |
| Score breakdown tooltip | Hovering score shows component breakdown |
| Score badge | Visual badge indicates score tier (Hot / Warm / Cold) |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| permit_trades table | Migration `006` creates table with all columns |
| Score persisted | `lead_score` stored as integer in permit_trades |
| Unique constraint | Duplicate (permit_id, trade_id) raises error |
| Score range check | DB CHECK constraint enforces 0-100 range |
| Index on score | `idx_permit_trades_trade_score` enables efficient sorted queries |
| Bulk update performance | 50,000 permit_trades scored in under 30 seconds |
| Re-score on change | Permit update triggers lead_score recalculation |
