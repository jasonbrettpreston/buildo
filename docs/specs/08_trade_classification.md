# 08 - Classification Engine

**Status:** In Progress
**Last Updated:** 2026-02-14
**Depends On:** `01_database_schema.md`, `07_trade_taxonomy.md`
**Blocks:** `09_construction_phases.md`, `10_lead_scoring.md`

---

## 1. User Story

> "As a system, I need to automatically determine which trades are needed for each permit using a 3-tier classification approach."

**Acceptance Criteria:**
- Every ingested permit is classified against all 20 trades
- Classification uses a tiered approach: direct permit_type match, work field match, then description NLP/regex
- Each classification result includes the matched trade, the tier that matched, and a confidence score
- Multi-trade permits produce multiple TradeMatch results
- Duplicate matches (same trade matched at multiple tiers) are de-duplicated, keeping the highest confidence

---

## 2. Technical Logic

### 3-Tier Classification Architecture

#### Tier 1: Permit Type Direct Match (Confidence: 0.95)

Direct mapping from Toronto Open Data `permit_type` codes to trades. Highest confidence because the permit type explicitly identifies the trade.

| Permit Type Code | Trade Slug |
|-----------------|------------|
| `PS` (Plumbing - Small) | `plumbing` |
| `PL` (Plumbing - Large) | `plumbing` |
| `ES` (Electrical - Small) | `electrical` |
| `EL` (Electrical - Large) | `electrical` |
| `MS` (Mechanical - Small) | `hvac` |
| `ML` (Mechanical - Large) | `hvac` |
| `FP` (Fire Protection) | `fire-protection` |
| `DM` (Demolition) | `demolition` |
| `EV` (Elevator) | `elevator` |
| `SH` (Shoring) | `shoring` |

```
matchTier1(permit: Permit): TradeMatch[]
  - Lookup permit.permit_type against Tier 1 rules
  - Return match with confidence 0.95 if found
  - Return empty array if no match
```

#### Tier 2: Work Field Match (Confidence: 0.80) + Structure Type (0.40-0.65)

Pattern matching against the `work` field for well-known trade keywords (0.80 confidence), plus `structure_type` field to infer likely trades at lower confidence (0.40-0.65).

**Important:** Trade classifications from structure_type are **inferred** from permit metadata in the absence of actual building plans. These are estimates that can be refined as the rule engine improves over time.

##### Structure Type Inference Rules (Implemented)
| Structure Type | Inferred Trades | Confidence |
|---------------|----------------|------------|
| SFD - Detached/Semi/Townhouse | Framing, Roofing, Plumbing, HVAC, Electrical, Insulation, Drywall, Painting, Flooring | 0.40-0.55 |
| Apartment Building | Concrete, Elevator, Fire Protection, Glazing, Structural Steel | 0.50-0.60 |
| Industrial | Structural Steel, Electrical, Concrete | 0.55-0.60 |
| Office | Fire Protection, Glazing, HVAC | 0.50 |
| Retail Store | Glazing, Fire Protection | 0.45-0.50 |
| Restaurant | HVAC, Plumbing, Fire Protection | 0.50-0.55 |
| Laneway / Rear Yard Suite | Framing, Concrete, Excavation | 0.50-0.55 |
| Stacked Townhouses | Concrete, Fire Protection | 0.50-0.55 |

##### Work Field Pattern Matching

| Pattern | Trade Slug |
|---------|------------|
| `Re-Roofing`, `New Roof`, `Roof Replacement` | `roofing` |
| `Foundation`, `Footings`, `Slab` | `concrete` |
| `Steel Erection`, `Structural Steel` | `structural-steel` |
| `Framing`, `Wood Frame` | `framing` |
| `Masonry`, `Brick`, `Block Wall` | `masonry` |
| `Excavat`, `Grading`, `Site Prep` | `excavation` |
| `Waterproof`, `Damp-proof` | `waterproofing` |
| `Landscap`, `Grading`, `Paving` | `landscaping` |
| `Glazing`, `Window`, `Curtain Wall` | `glazing` |
| `Insulation`, `Spray Foam` | `insulation` |
| `Drywall`, `Gypsum`, `Partition` | `drywall` |
| `Paint`, `Coating`, `Finish` | `painting` |
| `Floor`, `Tile`, `Hardwood`, `Carpet` | `flooring` |

```
matchTier2(permit: Permit): TradeMatch[]
  - Scan permit.work against Tier 2 patterns (case-insensitive)
  - Return all matches with confidence 0.80
  - Multiple patterns can match, producing multiple TradeMatch results
```

#### Tier 3: Description NLP/Regex (Confidence: 0.50 - 0.70)

Keyword scanning of the full permit description for trade-related terms. Lowest confidence because description text is ambiguous and may reference trades tangentially.

```
matchTier3(permit: Permit): TradeMatch[]
  - Tokenize permit.description (lowercase, strip punctuation)
  - Scan against keyword dictionaries per trade
  - Confidence varies by keyword specificity:
    - High-specificity keywords (e.g., "backflow preventer"): 0.70
    - Medium-specificity keywords (e.g., "piping"): 0.60
    - Low-specificity keywords (e.g., "water"): 0.50
  - Return all matches with respective confidence
```

### Classification Orchestrator

```
classifyPermit(permit: Permit): TradeMatch[]
  1. Run matchTier1(permit) -> tier1Matches
  2. Run matchTier2(permit) -> tier2Matches
  3. Run matchTier3(permit) -> tier3Matches
  4. Combine: allMatches = [...tier1Matches, ...tier2Matches, ...tier3Matches]
  5. De-duplicate: group by trade_id, keep entry with highest confidence
  6. Return de-duplicated TradeMatch[] sorted by confidence descending
```

### De-duplication Logic

When the same trade is matched at multiple tiers:
- Group matches by `trade_id`
- Within each group, keep only the match with the highest `confidence`
- If confidence is tied, prefer the lower tier number (Tier 1 > Tier 2 > Tier 3)

### TradeMatch Type

```typescript
interface TradeMatch {
  tradeId: number;
  tradeSlug: string;
  tier: 1 | 2 | 3;
  matchField: 'permit_type' | 'work' | 'description';
  matchPattern: string;    // the pattern or keyword that triggered the match
  confidence: number;      // 0.0 to 1.0
  phaseStart: string;      // earliest applicable construction phase
  phaseEnd: string;        // latest applicable construction phase
}
```

### Rule Storage

Classification rules are stored in the `trade_mapping_rules` table so they can be updated without code deploys. Rules have an `is_active` flag to enable/disable individual rules without deletion.

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/classification/classifier.ts` | `classifyPermit()` orchestrator, tier matching, de-duplication | In Progress |
| `src/lib/classification/rules.ts` | Rule definitions, rule loading from DB, pattern compilation | In Progress |
| `migrations/005_trade_mapping_rules.sql` | Create rules table and seed Tier 1/2/3 rules | In Progress |
| `src/lib/classification/trades.ts` | Trade taxonomy (from spec `07`) | In Progress |
| `src/tests/classification.logic.test.ts` | Unit tests for all 3 tiers and de-duplication | Planned |

---

## 4. Constraints & Edge Cases

- **No match:** Some permits may not match any trade (e.g., administrative permits). These produce an empty `TradeMatch[]` and are excluded from trade-specific feeds.
- **Multi-trade permits:** Large construction permits (e.g., new buildings) will match many trades. This is expected and correct -- they represent leads for multiple trades.
- **Ambiguous descriptions:** Tier 3 may produce false positives. Low confidence scores (0.50) flag these for potential user feedback.
- **Permit type codes not in mapping:** New or unusual permit type codes should fall through to Tier 2/3. Log unknown codes for review.
- **Rule conflicts:** If two rules at the same tier match the same trade with different confidence, keep the higher confidence.
- **Empty fields:** If `permit_type`, `work`, or `description` is null/empty, skip that tier gracefully. Do not error.
- **Performance:** Classification must process a batch of 1,000 permits in under 10 seconds. Rules should be loaded once and cached, not queried per-permit.
- **Rule updates:** When rules change in the database, re-classification of existing permits is triggered by the sync process, not automatically.

---

## 5. Data Schema

### `trade_mapping_rules` Table

```sql
CREATE TABLE trade_mapping_rules (
  id            SERIAL PRIMARY KEY,
  trade_id      INTEGER NOT NULL REFERENCES trades(id),
  tier          SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
  match_field   VARCHAR(50) NOT NULL,     -- 'permit_type', 'work', 'description'
  match_pattern VARCHAR(500) NOT NULL,    -- exact value (Tier 1), regex (Tier 2/3)
  confidence    DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  phase_start   VARCHAR(50),              -- earliest applicable phase
  phase_end     VARCHAR(50),              -- latest applicable phase
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trade_mapping_rules_tier ON trade_mapping_rules(tier) WHERE is_active = TRUE;
CREATE INDEX idx_trade_mapping_rules_trade ON trade_mapping_rules(trade_id);
```

### TypeScript Interface

```typescript
interface TradeMappingRule {
  id: number;
  tradeId: number;
  tier: 1 | 2 | 3;
  matchField: 'permit_type' | 'work' | 'description';
  matchPattern: string;
  confidence: number;
  phaseStart: string | null;
  phaseEnd: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Trade Taxonomy (`07`) | Upstream | Provides trade IDs and slugs for rule foreign keys |
| Data Ingestion (`02`) | Upstream | Triggers classification after permit upsert |
| Phase Model (`09`) | Downstream | Uses classification results to determine phase relevance |
| Lead Scoring (`10`) | Downstream | Uses confidence scores as scoring input |
| Permit Data API (`06`) | Downstream | Exposes classified trades per permit |
| Search & Filter (`19`) | Downstream | Enables trade-based permit filtering |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Tier 1 plumbing match | Permit with `permit_type: 'PS'` | `TradeMatch` with slug `plumbing`, confidence `0.95`, tier `1` |
| Tier 1 electrical match | Permit with `permit_type: 'ES'` | `TradeMatch` with slug `electrical`, confidence `0.95`, tier `1` |
| Tier 1 no match | Permit with `permit_type: 'BP'` (Building Permit) | Empty array from Tier 1 |
| Tier 2 roofing match | Permit with `work: 'Re-Roofing of existing structure'` | `TradeMatch` with slug `roofing`, confidence `0.80`, tier `2` |
| Tier 2 multi-match | Permit with `work: 'Foundation and Framing'` | Two TradeMatch entries: `concrete` and `framing` |
| Tier 2 case insensitive | Permit with `work: 'RE-ROOFING'` | `TradeMatch` with slug `roofing` |
| Tier 3 keyword scan | Permit with `description: 'Install backflow preventer in basement'` | `TradeMatch` with slug `plumbing`, confidence `0.70` |
| Tier 3 low specificity | Permit with `description: 'Water service connection'` | `TradeMatch` with slug `plumbing`, confidence `0.50` |
| Multi-trade classification | New building permit with all trades | Multiple TradeMatch entries covering relevant trades |
| De-duplication | Permit matching plumbing at Tier 1 (0.95) and Tier 3 (0.60) | Single TradeMatch for plumbing with confidence `0.95` |
| De-dup tie-breaking | Same confidence at Tier 1 and Tier 2 | Keep Tier 1 match (lower tier number preferred) |
| No match at all | Administrative permit, no trade indicators | Empty `TradeMatch[]` |
| Null work field | Permit with `work: null` | Tier 2 skipped gracefully, no error |
| Null description | Permit with `description: null` | Tier 3 skipped gracefully, no error |
| Confidence range | All TradeMatch results | All confidence values between 0.0 and 1.0 |
| Sort order | `classifyPermit()` output | Sorted by confidence descending |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Trade badges on permit cards | Each classified trade appears as a colored badge on the permit card |
| Confidence indicator | Confidence level shown as visual indicator (high/medium/low) |
| Multi-trade display | Permits with multiple trades show all trade badges |
| No-trade display | Permits with no classification show "Unclassified" state |
| Tier tooltip | Hovering over a trade badge shows classification tier and confidence |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Rules table seeded | `trade_mapping_rules` contains Tier 1, 2, and 3 seed rules |
| Rules loaded from DB | `classifyPermit()` uses rules from database, not hardcoded |
| Inactive rules skipped | Rules with `is_active = FALSE` are excluded from classification |
| Foreign key integrity | All `trade_id` values in rules reference valid trades |
| Batch performance | 1,000 permits classified in under 10 seconds |
| Rule caching | Rules loaded once per batch, not per-permit |
