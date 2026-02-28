# 08 - Classification Engine

**Status:** In Progress
**Last Updated:** 2026-02-27
**Depends On:** `01_database_schema.md`, `07_trade_taxonomy.md`
**Blocks:** `09_construction_phases.md`, `10_lead_scoring.md`

---

## 1. User Story

> "As a system, I need to automatically determine which trades are needed for each permit using a hybrid classification approach."

**Acceptance Criteria:**
- Every ingested permit is classified against all 31 trades
- Classification uses a hybrid approach: narrow-scope permit codes use Tier 1 rules only; broad-scope permits use tag-trade matrix lookup merged with Tier 1 rules
- Each classification result includes the matched trade, the tier that matched, and a confidence score
- Multi-trade permits produce multiple TradeMatch results
- Duplicate matches (same trade matched at multiple paths) are de-duplicated, keeping the highest confidence
- Permits with no scope tags and no narrow-scope code receive minimal residential trades at 0.40 confidence as a fallback

---

## 2. Technical Logic

### Hybrid Classification Architecture

The classifier uses a hybrid approach with two paths depending on permit scope, plus a fallback:

#### Path A: Narrow-Scope Permit Codes (Tier 1 Rules Only)

If the permit number contains a narrow-scope code (e.g., `PLB`, `HVA`, `DEM`), classification is restricted to Tier 1 rule matches only. This prevents broad-scope trades from being assigned to narrowly-scoped permits.

**Narrow-Scope Codes:**

| Permit Code | Allowed Trade Slugs |
|-------------|---------------------|
| `PLB`, `PSA`, `DRN`, `STS` | `plumbing` |
| `HVA`, `MSA` | `hvac` |
| `FSU` | `fire-protection` |
| `DEM` | `demolition` |
| `SHO` | `excavation`, `shoring`, `concrete`, `waterproofing` |
| `FND` | `excavation`, `concrete`, `waterproofing`, `shoring` |
| `TPS` | `framing`, `electrical` |
| `PCL` | `electrical`, `plumbing`, `hvac` |

#### Tier 1: Permit Type Direct Match (Confidence: 0.95)

Direct mapping from Toronto Open Data `permit_type` codes to trades. Highest confidence because the permit type explicitly identifies the trade. Unchanged from previous architecture.

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
matchTier1Rules(permit: Permit, rules: TradeMappingRule[], phase: string): TradeMatch[]
  - Lookup permit fields against active Tier 1 rules
  - Return match with rule-defined confidence (default 0.95) if found
  - Return empty array if no match
```

#### Path B: Broad-Scope (Tag-Trade Matrix + Tier 1 Merge)

For permits without a narrow-scope code, the classifier uses `scope_tags` (produced by `classifyScope()`) to look up trades from the **tag-trade matrix**, then merges with any Tier 1 rule matches.

The tag-trade matrix (`tag-trade-matrix.ts`) maps scope tags to arrays of `{ tradeSlug, confidence }` entries. Tags are normalized by stripping prefixes (`new:`, `alter:`, `sys:`, `scale:`, `exp:`) before lookup.

**Key tag-trade mappings (representative sample):**

| Scope Tag | Mapped Trades (with confidence) |
|-----------|-------------------------------|
| `kitchen` | plumbing (0.80), electrical (0.80), millwork-cabinetry (0.80), tiling (0.70), stone-countertops (0.70), flooring (0.65), drywall (0.60), painting (0.55) |
| `bathroom` | plumbing (0.85), tiling (0.80), drywall (0.70), electrical (0.65), glazing (0.60), waterproofing (0.60), painting (0.55) |
| `basement` | framing (0.75), drywall (0.75), electrical (0.75), plumbing (0.70), insulation (0.70), flooring (0.65), waterproofing (0.65), painting (0.55) |
| `pool` | pool-installation (0.90), concrete (0.80), excavation (0.75), plumbing (0.75), temporary-fencing (0.70), electrical (0.65), landscaping (0.60) |
| `sfd` | framing (0.85), excavation (0.80), concrete (0.80), roofing (0.80), plumbing (0.80), hvac (0.80), electrical (0.80), + 16 more trades |
| `solar` | solar (0.90), electrical (0.75), roofing (0.55) |
| `demolition` | demolition (0.85), temporary-fencing (0.60), excavation (0.50) |
| `roof` | roofing (0.85), eavestrough-siding (0.55) |

The full matrix contains 30 tag keys covering residential interiors, exteriors, building types, systems, structural, and specialty categories.

```
matchTagMatrix(permit: Permit, scopeTags: string[], phase: string): TradeMatch[]
  - Normalize tags by stripping prefixes and collapsing variants
  - Lookup each tag in PREFIXED_TAG_TRADE_MATRIX
  - De-duplicate by trade slug, keeping max confidence
  - Tag-matrix matches are reported as tier 2
```

#### Fallback: Minimal Residential Trades (Confidence: 0.40)

Permits with no scope tags and no narrow-scope code receive a fallback set of minimal residential trades at 0.40 confidence. These are reported as tier 3.

**Fallback trades:** framing, plumbing, electrical, hvac, drywall, painting

#### Work-Scope Exclusions

Certain `work` field values exclude specific trades that would be irrelevant:

| Work Pattern | Excluded Trades |
|-------------|----------------|
| Interior Alterations | excavation, shoring, roofing, landscaping, waterproofing |
| Underpinning | roofing, glazing, landscaping, elevator, painting, flooring |
| Re-Roofing | excavation, shoring, concrete, elevator, landscaping |
| Fire Alarm | All except electrical, fire-protection |
| Sprinklers | All except plumbing, fire-protection |

### Classification Orchestrator

```
classifyPermit(permit: Permit, rules: TradeMappingRule[], scopeTags?: string[]): TradeMatch[]
  1. Determine phase from permit status/dates
  2. Extract permit code from permit_num
  3. If narrow-scope code:
     a. Run matchTier1Rules() -> tier1Matches
     b. Apply scope limit (filter to allowed trades)
     c. Return filtered matches (Path A)
  4. Else (broad-scope):
     a. Run matchTier1Rules() -> tier1Matches
     b. If scopeTags provided, run matchTagMatrix() -> tagMatches
     c. Merge: de-duplicate by trade_slug, keep highest confidence
     d. If no matches and no tags, apply fallback minimal trades
     e. Apply work-scope exclusions
     f. Return merged matches (Path B)
```

### De-duplication Logic

When the same trade is matched by both Tier 1 rules and tag-trade matrix:
- Group matches by `trade_slug`
- Within each group, keep only the match with the highest `confidence`

### TradeMatch Type

```typescript
interface TradeMatch {
  permit_num: string;
  revision_num: string;
  trade_id: number;
  trade_slug: string;
  trade_name: string;
  tier: 1 | 2 | 3;         // 1 = Tier 1 rule, 2 = tag-matrix, 3 = fallback
  confidence: number;       // 0.0 to 1.0
  is_active: boolean;       // whether trade is active in current phase
  phase: string;            // current construction phase
  lead_score: number;       // computed lead score
}
```

### Deprecated: Tier 2/3 Regex Rules

The previous Tier 2 (work field pattern matching) and Tier 3 (description NLP/regex) have been replaced by the tag-trade matrix approach. The `trade_mapping_rules` table still stores Tier 1 rules and retains its `is_active` flag for enabling/disabling individual rules.

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/classification/classifier.ts` | `classifyPermit()` orchestrator, hybrid path routing, de-duplication, `classifyProducts()` | In Progress |
| `src/lib/classification/rules.ts` | Tier 1 rule definitions, rule loading from DB, pattern compilation | In Progress |
| `src/lib/classification/tag-trade-matrix.ts` | Tag-to-trade matrix, `lookupTradesForTags()` (replaces Tier 2/3) | In Progress |
| `src/lib/classification/tag-product-matrix.ts` | Tag-to-product matrix, `lookupProductsForTags()` | In Progress |
| `src/lib/classification/products.ts` | Product group definitions, lookup functions | In Progress |
| `src/lib/classification/trades.ts` | Trade taxonomy with 31 trades (from spec `07`) | In Progress |
| `migrations/005_trade_mapping_rules.sql` | Create rules table and seed Tier 1 rules | In Progress |
| `src/tests/classification.logic.test.ts` | Unit tests for hybrid classification and de-duplication | In Progress |

---

## 4. Constraints & Edge Cases

- **No match:** Some permits may not match any trade (e.g., administrative permits with no scope tags and no narrow-scope code). These receive the fallback minimal residential trades at 0.40 confidence.
- **Multi-trade permits:** Large construction permits (e.g., new buildings) will match many trades via the tag-trade matrix. This is expected and correct -- they represent leads for multiple trades.
- **Tag-trade matrix coverage:** The matrix contains 30 tag keys. Tags not present in the matrix produce no matches for that tag. New tags require a code update to `tag-trade-matrix.ts`.
- **Permit type codes not in mapping:** New or unusual permit type codes that are not in `NARROW_SCOPE_CODES` follow Path B (broad-scope).
- **Scope exclusions:** Work-scope exclusions filter out irrelevant trades (e.g., "Interior Alterations" excludes excavation, roofing). These are applied after the merge step.
- **Empty fields:** If `permit_num`, `work`, or `scope_tags` is null/empty, the corresponding path/lookup is skipped gracefully. Do not error.
- **Performance:** Classification must process a batch of 1,000 permits in under 10 seconds. Tag-trade matrix is an in-memory constant, no DB lookup required.
- **Rule updates:** Tier 1 rules are stored in the database. Tag-trade matrix changes require a code deploy.

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
| Trade Taxonomy (`07`) | Upstream | Provides 31 trade IDs and slugs for rule foreign keys |
| Data Ingestion (`02`) | Upstream | Triggers classification after permit upsert |
| Scope Classification | Upstream | Provides `scope_tags` for tag-trade matrix lookup |
| Phase Model (`09`) | Downstream | Uses classification results to determine phase relevance |
| Lead Scoring (`10`) | Downstream | Uses confidence scores as scoring input |
| Permit Data API (`06`) | Downstream | Exposes classified trades per permit |
| Search & Filter (`19`) | Downstream | Enables trade-based permit filtering |
| Product Groups (`32`) | Downstream | Product classification uses same scope_tags via tag-product matrix |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Tier 1 plumbing match | Permit with `permit_type: 'PS'` | `TradeMatch` with slug `plumbing`, confidence `0.95`, tier `1` |
| Tier 1 electrical match | Permit with `permit_type: 'ES'` | `TradeMatch` with slug `electrical`, confidence `0.95`, tier `1` |
| Tier 1 no match | Permit with `permit_type: 'BP'` (Building Permit) | Empty array from Tier 1 |
| Narrow-scope Path A | Permit with code `PLB` and scope tags | Only plumbing trade returned, scope tags ignored |
| Tag-matrix kitchen | Scope tags `['new:kitchen']` | Trades: plumbing, electrical, millwork-cabinetry, tiling, stone-countertops, flooring, drywall, painting |
| Tag-matrix pool | Scope tags `['new:pool']` | Trades: pool-installation (0.90), concrete (0.80), excavation, plumbing, temporary-fencing, electrical, landscaping |
| Tag-matrix solar | Scope tags `['new:solar']` | Trades: solar (0.90), electrical (0.75), roofing (0.55) |
| Tag prefix stripping | Scope tags `['alter:bathroom']` vs `['new:bathroom']` | Same trade matches for both |
| Multi-tag merge | Scope tags `['new:kitchen', 'new:bathroom']` | Merged trades, plumbing keeps max confidence (0.85 from bathroom) |
| Tier 1 + tag-matrix merge | Permit with `permit_type: 'PS'` and scope tags `['new:kitchen']` | Plumbing at 0.95 (Tier 1 wins over tag-matrix 0.80) |
| Fallback trades | Permit with no scope tags and no narrow-scope code | 6 minimal residential trades at 0.40 confidence, tier 3 |
| Work-scope exclusion | Permit with `work: 'Interior Alterations'` | Excavation, shoring, roofing, landscaping, waterproofing excluded |
| De-duplication | Same trade from Tier 1 (0.95) and tag-matrix (0.80) | Single TradeMatch with confidence `0.95` |
| No scope tags, has Tier 1 | Permit with `permit_type: 'ES'`, no scope tags | Electrical at 0.95 (no fallback because Tier 1 matched) |
| Confidence range | All TradeMatch results | All confidence values between 0.0 and 1.0 |
| Phase awareness | Each TradeMatch | Contains `is_active` and `phase` fields |

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
| Rules table seeded | `trade_mapping_rules` contains Tier 1 seed rules |
| Rules loaded from DB | Tier 1 rules loaded from database for `classifyPermit()` |
| Tag-trade matrix in memory | Tag-trade matrix is a constant, no DB lookup required |
| Inactive rules skipped | Rules with `is_active = FALSE` are excluded from classification |
| Foreign key integrity | All `trade_id` values in rules reference valid trades (31 trades) |
| Batch performance | 1,000 permits classified in under 10 seconds |
| Tag-matrix coverage | All 30 tag keys map to valid trade slugs present in `trades.ts` |
