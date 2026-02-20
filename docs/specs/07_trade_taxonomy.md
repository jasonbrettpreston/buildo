# 07 - Trade Taxonomy

**Status:** In Progress
**Last Updated:** 2026-02-14
**Depends On:** `01_database_schema.md`
**Blocks:** `08_trade_classification.md`, `09_construction_phases.md`, `10_lead_scoring.md`

---

## 1. User Story

> "As a tradesperson, I want permits classified by my specific trade so I only see leads relevant to my business."

**Acceptance Criteria:**
- The system defines exactly 20 trade categories covering Toronto construction trades
- Each trade has a unique slug, display name, icon identifier, brand color, and sort order
- Trades are persisted in the database and queryable via API
- The taxonomy is the single source of truth for all downstream classification, phase mapping, and lead scoring

---

## 2. Technical Logic

### Trade Categories (20 total)

| # | Slug | Name | Icon | Color | Sort Order |
|---|------|------|------|-------|------------|
| 1 | `excavation` | Excavation | `icon-excavation` | `#8B4513` | 1 |
| 2 | `shoring` | Shoring | `icon-shoring` | `#A0522D` | 2 |
| 3 | `concrete` | Concrete | `icon-concrete` | `#708090` | 3 |
| 4 | `structural-steel` | Structural Steel | `icon-structural-steel` | `#4682B4` | 4 |
| 5 | `framing` | Framing | `icon-framing` | `#DEB887` | 5 |
| 6 | `masonry` | Masonry | `icon-masonry` | `#CD853F` | 6 |
| 7 | `roofing` | Roofing | `icon-roofing` | `#B22222` | 7 |
| 8 | `plumbing` | Plumbing | `icon-plumbing` | `#4169E1` | 8 |
| 9 | `hvac` | HVAC | `icon-hvac` | `#2E8B57` | 9 |
| 10 | `electrical` | Electrical | `icon-electrical` | `#FFD700` | 10 |
| 11 | `fire-protection` | Fire Protection | `icon-fire-protection` | `#FF4500` | 11 |
| 12 | `insulation` | Insulation | `icon-insulation` | `#DA70D6` | 12 |
| 13 | `drywall` | Drywall | `icon-drywall` | `#F5F5DC` | 13 |
| 14 | `painting` | Painting | `icon-painting` | `#9370DB` | 14 |
| 15 | `flooring` | Flooring | `icon-flooring` | `#D2691E` | 15 |
| 16 | `glazing` | Glazing | `icon-glazing` | `#87CEEB` | 16 |
| 17 | `elevator` | Elevator | `icon-elevator` | `#696969` | 17 |
| 18 | `demolition` | Demolition | `icon-demolition` | `#DC143C` | 18 |
| 19 | `landscaping` | Landscaping | `icon-landscaping` | `#228B22` | 19 |
| 20 | `waterproofing` | Waterproofing | `icon-waterproofing` | `#1E90FF` | 20 |

### Lookup Functions

```
getTradeBySlug(slug: string): Trade | undefined
  - O(1) lookup from pre-built slug map
  - Returns undefined for unknown slugs (does not throw)

getTradeById(id: number): Trade | undefined
  - O(1) lookup from pre-built id map
  - Returns undefined for unknown ids (does not throw)

getAllTrades(): Trade[]
  - Returns all 20 trades sorted by sort_order ascending
```

### Construction Phase Mapping

Each trade maps to one or more construction phases (defined in `09_construction_phases.md`):

| Phase | Trades |
|-------|--------|
| Early Construction (0-3 mo) | excavation, shoring, demolition, concrete |
| Structural (3-9 mo) | framing, masonry, structural-steel, plumbing, hvac, electrical, fire-protection |
| Finishing (9-18 mo) | insulation, drywall, painting, flooring, glazing, elevator |
| Landscaping (18+ mo) | landscaping, waterproofing, roofing |

### API Endpoint

```
GET /api/trades
  Response: { trades: Trade[], count: number }
  Cache: CDN cacheable, stale-while-revalidate (taxonomy changes rarely)
  Auth: Public (no authentication required)
```

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/classification/trades.ts` | Trade taxonomy data, lookup functions, type definitions | In Progress |
| `migrations/004_trades.sql` | Create trades table and seed all 20 rows | In Progress |
| `src/app/api/trades/route.ts` | REST endpoint for trade list | In Progress |
| `src/tests/classification.logic.test.ts` | Unit tests for trade lookups | Planned |

---

## 4. Constraints & Edge Cases

- **Exactly 20 trades:** The taxonomy is a closed set. Adding a trade requires a migration and code update.
- **Slug uniqueness:** Slugs must be unique across all trades. Enforced by DB unique constraint.
- **Sort order stability:** Sort order determines display sequence in UI dropdowns and filters. Must remain stable to avoid confusing users.
- **Icon/color fallbacks:** If an icon fails to load, the UI must render the trade name as text. If a color is missing, fall back to a neutral gray (`#6B7280`).
- **Case sensitivity:** Slugs are always lowercase. Lookups must be case-insensitive (normalize to lowercase before lookup).
- **Empty state:** If the trades table is empty (migration not run), the API must return an empty array, not an error.
- **Immutable slugs:** Once a slug is assigned and referenced by classification rules and permit_trades records, it must not change. Renaming requires a migration that updates all foreign key references.

---

## 5. Data Schema

### `trades` Table

```sql
CREATE TABLE trades (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(50) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  icon          VARCHAR(100) NOT NULL,
  color         VARCHAR(7) NOT NULL,       -- hex color code e.g. #8B4513
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_trades_slug ON trades(slug);
CREATE INDEX idx_trades_sort_order ON trades(sort_order);
```

### TypeScript Interface

```typescript
interface Trade {
  id: number;
  slug: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  createdAt: Date;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Classification Engine (`08`) | Downstream | Provides trade IDs for classification rules |
| Phase Model (`09`) | Downstream | Maps trades to construction phases |
| Lead Scoring (`10`) | Downstream | Trade context for phase-match scoring |
| Permit Data API (`06`) | Downstream | Exposes trades via `/api/trades` |
| Tradesperson Dashboard (`15`) | Downstream | Trade selection during onboarding, filter controls |
| Search & Filter (`19`) | Downstream | Trade-based permit filtering |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| All trades present | `getAllTrades()` | Array of exactly 20 Trade objects |
| Unique slugs | `getAllTrades().map(t => t.slug)` | 20 unique strings, no duplicates |
| Slug lookup hit | `getTradeBySlug('plumbing')` | Trade object with slug `plumbing` |
| Slug lookup miss | `getTradeBySlug('unknown-trade')` | `undefined` |
| ID lookup hit | `getTradeById(1)` | Trade object with id `1` |
| ID lookup miss | `getTradeById(999)` | `undefined` |
| Sort order | `getAllTrades()` | Sorted ascending by `sort_order` |
| Slug format | All slugs | Lowercase, alphanumeric + hyphens only |
| Color format | All colors | Valid hex codes matching `/^#[0-9A-Fa-f]{6}$/` |
| Case-insensitive lookup | `getTradeBySlug('PLUMBING')` | Trade object with slug `plumbing` |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Trade icon rendering | Each trade renders its designated icon in lists and filters |
| Trade color rendering | Each trade's color is applied as a badge/chip background or accent |
| Icon fallback | Missing icon gracefully falls back to trade name text |
| Color fallback | Missing color falls back to neutral gray `#6B7280` |
| Trade list order | Trades appear in sort_order sequence in dropdown menus |
| Responsive layout | Trade chips/badges wrap correctly on mobile viewports |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Trades table exists | Migration `004_trades.sql` creates `trades` table |
| Seed data complete | After migration, `SELECT COUNT(*) FROM trades` returns 20 |
| Unique constraint | Inserting duplicate slug raises unique violation error |
| API response | `GET /api/trades` returns 200 with `{ trades: [...], count: 20 }` |
| API caching | Response includes appropriate cache headers |
| No auth required | `GET /api/trades` succeeds without authentication token |
