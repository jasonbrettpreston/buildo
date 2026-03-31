# Spec 07 -- Trade Taxonomy

## 1. Goal & User Story
Tradespersons see permits classified by their specific trade so they only see relevant leads. The taxonomy defines exactly 32 trade categories as the single source of truth for all classification, phase mapping, and scoring.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Read (public API) |
| Authenticated | Read |
| Admin | Read/Write (manage taxonomy via migrations) |

## 3. Behavioral Contract
- **Inputs:** `GET /api/trades` (no auth required, CDN-cacheable)
- **Core Logic:** 32 trades (IDs 1-20 original, 21-31 added in WF3, 32 drain-plumbing) each with slug, display name, icon, hex color, and sort order. Lookups by slug (`getTradeBySlug`) and ID (`getTradeById`) are O(1) from pre-built maps. `getAllTrades()` returns all 32 sorted by `sort_order`. Slugs are immutable once referenced by classification rules and `permit_trades`. See `Trade` interface in `src/lib/classification/trades.ts`.
- **Outputs:** `{ trades: Trade[], count: number }` -- array of 32 trade objects sorted by sort_order ascending
- **Edge Cases:**
  - Unknown slug/ID lookups return `undefined` (no throw)
  - Slug lookups are case-insensitive (normalized to lowercase)
  - Empty trades table returns empty array, not an error
  - Missing icon falls back to trade name text; missing color falls back to `#6B7280`
  - Adding a trade requires a migration and code update (closed set)

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`classification.logic.test.ts`): Trade Taxonomy; Tag-Trade Matrix; classifyPermit - Tag Matrix Integration; Tier 3 Deprecation - all fallback matches must be tier 1; Tier 1 Work-Field Fallback; Tier 1 Classification - Permit Type Direct Match; Construction Phases; Product Groups; Permit Code Extraction; Permit Code Scope Limiting; Narrow-Scope Code-Based Fallback; ALL_RULES
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/classification/trades.ts`
- `migrations/004_trades.sql`
- `migrations/028_new_trades.sql`
- `migrations/029_rename_trades.sql`
- `src/tests/classification.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/classification/scoring.ts`**: Governed by Spec 10. Do not modify lead scoring.
- **`src/lib/classification/phases.ts`**: Governed by Spec 09. Do not modify phase model.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `trades` table schema.
- Consumed by **Spec 08 (Classification)**: Classification engine reads trade data from this module.
- Consumed by **Spec 09 (Phases)**: Phase model maps trades to construction phases.
- Consumed by **Spec 10 (Scoring)**: Lead scoring uses trade data for score calculation.
