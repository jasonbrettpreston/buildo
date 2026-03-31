# Spec 32 -- Product Groups

## 1. Goal & User Story
As a material supplier, I want permits classified by the products needed so I can target leads for my specific product category (e.g., kitchen cabinets, windows, roofing materials).

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend script) |

## 3. Behavioral Contract
- **Inputs:** Permit `scope_tags` array (from Spec 30); 16 fixed product group definitions; tag-product matrix mapping normalized scope tags to product slug arrays.
- **Core Logic:**
  - Exactly 16 product groups defined as a closed taxonomy with slug, name, and sort_order. See `src/lib/classification/products.ts`. Stored in `product_groups` table (migration 030) with unique slug constraint.
  - Tag-product matrix in `src/lib/classification/tag-product-matrix.ts` maps normalized scope tags (prefix-stripped: `new:`, `alter:`, `sys:`, `scale:`, `exp:` removed) to arrays of product group slugs. Key mappings: kitchen -> 7 products, bathroom -> 5, sfd -> all 16, roof -> 2. Tags with no product relevance (pool, fence, solar, etc.) map to empty arrays.
  - `lookupProductsForTags(tags)` normalizes tags, looks up each in matrix, returns de-duplicated product slug union.
  - `classifyProducts(permit, scopeTags)` returns `ProductMatch[]` with flat confidence 0.75 for each matched product. Empty scope_tags returns empty array (no fallback).
  - `getProductGroupBySlug()` and `getProductGroupById()` provide O(n) lookups returning undefined for misses.
  - Junction table `permit_products` (migration 031) stores permit-to-product links with composite PK `(permit_num, revision_num, product_id)`.
  - `GET /api/products` returns all 16 product groups (public, CDN-cacheable).
- **Outputs:** Each broad-scope residential permit receives 1-16 product matches at 0.75 confidence. Product badges displayed on permit cards in sort_order sequence. API returns product group list.
- **Edge Cases:**
  - Narrow-scope permits (plumbing-only) typically get no products due to no scope_tags driving the matrix. This is intentional.
  - Empty scope_tags returns empty array; no fallback product set applied.
  - Unknown tags return empty array (no error thrown).
  - Slugs are immutable once referenced by permit_products records.
  - Sort order must remain stable for UI consistency.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`classification.logic.test.ts`): Trade Taxonomy; Tag-Trade Matrix; classifyPermit - Tag Matrix Integration; Tier 3 Deprecation - all fallback matches must be tier 1; Tier 1 Work-Field Fallback; Tier 1 Classification - Permit Type Direct Match; Construction Phases; Product Groups; Permit Code Extraction; Permit Code Scope Limiting; Narrow-Scope Code-Based Fallback; ALL_RULES
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/classification/products.ts`
- `src/lib/classification/tag-product-matrix.ts`
- `src/app/api/products/route.ts`
- `migrations/031_product_groups.sql`
- `src/tests/classification.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Trade classification is separate.
- **`src/lib/classification/trades.ts`**: Governed by Spec 07. Trade taxonomy is read-only.
- **`src/lib/classification/tag-trade-matrix.ts`**: Governed by Spec 08. Trade matrix is separate from product matrix.

### Cross-Spec Dependencies
- Relies on **Spec 07 (Trade Taxonomy)**: Product groups map to trades.
- Relies on **Spec 08 (Classification)**: Product classification uses scope tags from classification engine.
- Relies on **Spec 30 (Scope Classification)**: Scope tags feed the tag-product matrix.
