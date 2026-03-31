# Spec 08 -- Classification Engine

## 1. Goal & User Story
The system automatically determines which of the 32 trades are needed for each permit using a hybrid classification approach, producing confidence-scored trade matches that feed phase mapping and lead scoring.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend engine, triggered by pipelines and ingestion) |

## 3. Behavioral Contract
- **Inputs:** A permit record (permit_type, permit_num, work, scope_tags) plus Tier 1 rules from DB
- **Core Logic:** Two classification paths determined by permit code scope. **Path A (narrow-scope):** Permits with codes like PLB, HVA, DEM, SHO, FND, TPS, PCL are restricted to Tier 1 rule matches filtered to that code's allowed trades; if no Tier 1 match, the code's allowed trades are assigned at 0.80 confidence. **Path B (broad-scope):** Tier 1 rules (permit_type direct match at 0.95 confidence) are merged with tag-trade matrix lookups on scope_tags. Tags are normalized by stripping prefixes (`new:`, `alter:`, etc.), collapsing variants, and applying 16 aliases. De-duplication keeps the highest confidence per trade slug. If no matches from either path, a work-field fallback assigns trades based on the `work` field value (0.55-0.85 confidence). Work-scope exclusions filter irrelevant trades post-merge (e.g., "Interior Alterations" excludes excavation, roofing). See `classifyPermit()` in `src/lib/classification/classifier.ts`, tag-trade matrix in `src/lib/classification/tag-trade-matrix.ts`, rules in `src/lib/classification/rules.ts`. See `TradeMatch` interface in `src/lib/classification/classifier.ts`.
- **Outputs:** Array of `TradeMatch` objects, each with permit reference, trade slug/ID/name, tier (1 or 2), confidence (0.0-1.0), phase, is_active, and lead_score
- **Edge Cases:**
  - Null/empty permit_num, work, or scope_tags: corresponding path is skipped gracefully
  - Multi-trade permits (e.g., new buildings) correctly produce 10+ matches
  - Tags not in the matrix after normalization produce no matches for that tag
  - Unrecognized permit codes follow Path B (broad-scope)
  - Performance: 1,000 permits classified in under 10 seconds (matrix is in-memory constant)

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`classification.logic.test.ts`): Trade Taxonomy; Tag-Trade Matrix; classifyPermit - Tag Matrix Integration; Tier 3 Deprecation - all fallback matches must be tier 1; Tier 1 Work-Field Fallback; Tier 1 Classification - Permit Type Direct Match; Construction Phases; Product Groups; Permit Code Extraction; Permit Code Scope Limiting; Narrow-Scope Code-Based Fallback; ALL_RULES
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/classification/classifier.ts`
- `src/lib/classification/rules.ts`
- `src/lib/classification/tag-trade-matrix.ts`
- `scripts/classify-permits.js`
- `scripts/reclassify-all.js`
- `src/tests/classification.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/scoring.ts`**: Governed by Spec 10. Do not modify lead scoring.
- **`src/lib/classification/phases.ts`**: Governed by Spec 09. Do not modify phase model.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.
- **`src/lib/classification/trades.ts`**: Governed by Spec 07. Do not add/remove trade slugs.

### Cross-Spec Dependencies
- Relies on **Spec 07 (Trade Taxonomy)**: Reads trade slugs and IDs from `trades.ts`.
- Relies on **Spec 01 (Database Schema)**: Writes to `permit_trades` table.
- Relies on **Spec 30 (Scope Classification)**: Uses scope tags from `permits.scope_tags` for tag-trade matrix lookup.
