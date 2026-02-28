# 32 - Product Groups

**Status:** In Progress
**Last Updated:** 2026-02-27
**Depends On:** `07_trade_taxonomy.md`, `08_trade_classification.md`
**Blocks:** None

---

## 1. User Story

> "As a material supplier, I want permits classified by the products needed so I can target leads for my specific product category (e.g., kitchen cabinets, windows, roofing materials)."

**Acceptance Criteria:**
- The system defines exactly 16 product group categories covering residential construction materials
- Each product group has a unique slug, display name, and sort order
- Permits are classified into product groups using scope_tags via the tag-product matrix
- Product classification runs alongside trade classification during permit ingestion
- Product groups are queryable via API for supplier-facing lead views

---

## 2. Technical Logic

### Product Groups (16 total)

| # | Slug | Name | Sort Order |
|---|------|------|------------|
| 1 | `kitchen-cabinets` | Kitchen Cabinets | 1 |
| 2 | `appliances` | Appliances | 2 |
| 3 | `countertops` | Countertops | 3 |
| 4 | `plumbing-fixtures` | Plumbing Fixtures | 4 |
| 5 | `tiling` | Tiling | 5 |
| 6 | `windows` | Windows | 6 |
| 7 | `doors` | Doors | 7 |
| 8 | `flooring` | Flooring | 8 |
| 9 | `paint` | Paint | 9 |
| 10 | `lighting` | Lighting | 10 |
| 11 | `lumber-drywall` | Lumber & Drywall | 11 |
| 12 | `roofing-materials` | Roofing Materials | 12 |
| 13 | `eavestroughs` | Eavestroughs | 13 |
| 14 | `staircases` | Staircases | 14 |
| 15 | `mirrors-glass` | Mirrors & Glass | 15 |
| 16 | `garage-doors` | Garage Doors | 16 |

### Tag-to-Product Matrix

Product classification uses the same scope_tags as trade classification. The tag-product matrix (`tag-product-matrix.ts`) maps normalized scope tags to arrays of product group slugs. Unlike the tag-trade matrix, product matches use a flat confidence of 0.75.

**Key tag-product mappings:**

| Scope Tag | Product Groups |
|-----------|---------------|
| `kitchen` | kitchen-cabinets, appliances, countertops, plumbing-fixtures, tiling, lighting, flooring |
| `bathroom` | plumbing-fixtures, tiling, mirrors-glass, lighting, paint |
| `basement` | lumber-drywall, flooring, paint, lighting, doors, staircases |
| `garage` | lumber-drywall, garage-doors, lighting |
| `garden_suite` | windows, doors, flooring, lighting, plumbing-fixtures, lumber-drywall, roofing-materials, paint |
| `laneway` | windows, doors, flooring, lighting, plumbing-fixtures, lumber-drywall, roofing-materials, paint |
| `sfd` | All 16 product groups |
| `semi` | kitchen-cabinets, appliances, countertops, plumbing-fixtures, tiling, windows, doors, flooring, paint, lighting, lumber-drywall, roofing-materials, eavestroughs, staircases |
| `townhouse` | kitchen-cabinets, appliances, countertops, plumbing-fixtures, tiling, windows, doors, flooring, paint, lighting, lumber-drywall, roofing-materials, eavestroughs, staircases |
| `houseplex` | kitchen-cabinets, appliances, countertops, plumbing-fixtures, tiling, windows, doors, flooring, paint, lighting, lumber-drywall, roofing-materials, staircases |
| `roof` | roofing-materials, eavestroughs |
| `cladding` | eavestroughs |
| `windows` | windows, mirrors-glass |
| `interior` | paint, flooring, doors, lighting |
| `addition` | windows, doors, flooring, lumber-drywall, roofing-materials, paint, lighting |
| `deck` | lumber-drywall |
| `porch` | lumber-drywall, paint |

Tags with no product relevance (`pool`, `fence`, `fireplace`, `solar`, `elevator`, `demolition`, `security`) map to empty arrays.

### Lookup Functions

```
getProductGroupBySlug(slug: string): ProductGroup | undefined
  - O(n) lookup from product groups array
  - Returns undefined for unknown slugs (does not throw)

getProductGroupById(id: number): ProductGroup | undefined
  - O(n) lookup from product groups array
  - Returns undefined for unknown ids (does not throw)

lookupProductsForTags(tags: string[]): string[]
  - Normalizes tags by stripping prefixes
  - Looks up each tag in TAG_PRODUCT_MATRIX
  - Returns de-duplicated list of product group slugs
```

### Product Classifier

```
classifyProducts(permit: Permit, scopeTags?: string[]): ProductMatch[]
  - If no scope tags, returns empty array
  - Looks up product slugs via lookupProductsForTags()
  - Returns ProductMatch[] with confidence 0.75 for each matched product
```

### API Endpoint

```
GET /api/products
  Response: { products: ProductGroup[], count: number }
  Cache: CDN cacheable, stale-while-revalidate
  Auth: Public (no authentication required)
```

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/classification/products.ts` | Product group definitions (16 groups), lookup functions | In Progress |
| `src/lib/classification/tag-product-matrix.ts` | Tag-to-product matrix, `lookupProductsForTags()` | In Progress |
| `src/lib/classification/classifier.ts` | `classifyProducts()` function (alongside `classifyPermit()`) | In Progress |
| `migrations/030_product_groups.sql` | Create `product_groups` table and seed 16 rows | In Progress |
| `migrations/031_permit_products.sql` | Create `permit_products` junction table | In Progress |
| `src/app/api/products/route.ts` | REST endpoint for product group list | Planned |
| `src/tests/classification.logic.test.ts` | Unit tests for product classification | In Progress |

---

## 4. Constraints & Edge Cases

- **Exactly 16 product groups:** The product taxonomy is a closed set. Adding a product group requires a migration and code update.
- **Slug uniqueness:** Slugs must be unique across all product groups. Enforced by DB unique constraint.
- **No products for narrow-scope permits:** Narrow-scope permits (e.g., plumbing-only) typically do not receive product classification because they have no scope tags driving the tag-product matrix. This is intentional -- product leads are most relevant for broad-scope residential permits.
- **Empty scope tags:** If a permit has no scope tags, `classifyProducts()` returns an empty array. No fallback product set is applied (unlike trade classification).
- **Flat confidence:** All product matches use 0.75 confidence. This may be refined in future iterations to vary by tag specificity.
- **Tag normalization:** Same prefix-stripping logic as trade classification (`new:`, `alter:`, `sys:`, `scale:`, `exp:` removed before lookup).
- **Sort order stability:** Sort order determines display sequence in UI. Must remain stable.
- **Immutable slugs:** Once assigned and referenced by `permit_products` records, slugs must not change without a migration.

---

## 5. Data Schema

### `product_groups` Table

```sql
CREATE TABLE product_groups (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(50) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_product_groups_slug ON product_groups(slug);
CREATE INDEX idx_product_groups_sort_order ON product_groups(sort_order);
```

### `permit_products` Junction Table

```sql
CREATE TABLE permit_products (
  permit_num    VARCHAR(30) NOT NULL,
  revision_num  VARCHAR(10) NOT NULL,
  product_id    INTEGER NOT NULL REFERENCES product_groups(id),
  confidence    DECIMAL(3,2) NOT NULL DEFAULT 0.75,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (permit_num, revision_num, product_id),
  FOREIGN KEY (permit_num, revision_num) REFERENCES permits(permit_num, revision_num)
);

CREATE INDEX idx_permit_products_product ON permit_products(product_id);
```

### TypeScript Interfaces

```typescript
interface ProductGroup {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

interface ProductMatch {
  permit_num: string;
  revision_num: string;
  product_id: number;
  product_slug: string;
  product_name: string;
  confidence: number;      // 0.75 flat
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Trade Taxonomy (`07`) | Upstream | Product groups complement trade classification for material suppliers |
| Classification Engine (`08`) | Upstream | `classifyProducts()` runs alongside `classifyPermit()` using same scope_tags |
| Scope Classification | Upstream | Provides `scope_tags` for tag-product matrix lookup |
| Data Ingestion (`02`) | Upstream | Triggers product classification after permit upsert |
| Permit Data API (`06`) | Downstream | Exposes classified products per permit |
| Search & Filter (`19`) | Downstream | Enables product-based permit filtering for suppliers |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| All product groups present | `PRODUCT_GROUPS` | Array of exactly 16 ProductGroup objects |
| Unique slugs | `PRODUCT_GROUPS.map(p => p.slug)` | 16 unique strings, no duplicates |
| Slug lookup hit | `getProductGroupBySlug('windows')` | ProductGroup with slug `windows` |
| Slug lookup miss | `getProductGroupBySlug('unknown')` | `undefined` |
| ID lookup hit | `getProductGroupById(1)` | ProductGroup with id `1` |
| ID lookup miss | `getProductGroupById(999)` | `undefined` |
| Kitchen tag products | `lookupProductsForTags(['new:kitchen'])` | 7 product slugs including kitchen-cabinets, appliances, countertops |
| Bathroom tag products | `lookupProductsForTags(['new:bathroom'])` | 5 product slugs including plumbing-fixtures, tiling, mirrors-glass |
| SFD tag products | `lookupProductsForTags(['new:sfd'])` | All 16 product group slugs |
| Empty tags | `lookupProductsForTags([])` | Empty array |
| Unknown tag | `lookupProductsForTags(['new:unknown'])` | Empty array |
| No-product tag | `lookupProductsForTags(['new:pool'])` | Empty array |
| Tag prefix stripping | `lookupProductsForTags(['alter:kitchen'])` vs `['new:kitchen']` | Same product slugs |
| Multi-tag dedup | `lookupProductsForTags(['new:kitchen', 'new:bathroom'])` | De-duplicated union of both tag product sets |
| classifyProducts | Permit with scope tags `['new:kitchen']` | ProductMatch[] with 7 entries, confidence 0.75 |
| classifyProducts no tags | Permit with no scope tags | Empty ProductMatch[] |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Product badge rendering | Each classified product appears as a badge on the permit card |
| Product list order | Products appear in sort_order sequence |
| No-product display | Permits with no products show no product section |
| Responsive layout | Product badges wrap correctly on mobile viewports |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Product groups table exists | Migration `030_product_groups.sql` creates `product_groups` table |
| Seed data complete | After migration, `SELECT COUNT(*) FROM product_groups` returns 16 |
| Unique constraint | Inserting duplicate slug raises unique violation error |
| Junction table exists | Migration `031_permit_products.sql` creates `permit_products` table |
| Foreign key integrity | All `product_id` values reference valid product groups |
| API response | `GET /api/products` returns 200 with `{ products: [...], count: 16 }` |
| Tag-matrix coverage | All product slugs in tag-product matrix exist in `products.ts` |
