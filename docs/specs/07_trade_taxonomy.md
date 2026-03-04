# 07 - Trade Taxonomy

**Status:** In Progress
**Last Updated:** 2026-02-27
**Depends On:** `01_database_schema.md`
**Blocks:** `08_trade_classification.md`, `09_construction_phases.md`, `10_lead_scoring.md`

---

## 1. User Story

> "As a tradesperson, I want permits classified by my specific trade so I only see leads relevant to my business."

**Acceptance Criteria:**
- The system defines exactly 32 trade categories covering Toronto construction trades
- Each trade has a unique slug, display name, icon identifier, brand color, and sort order
- Trades are persisted in the database and queryable via API
- The taxonomy is the single source of truth for all downstream classification, phase mapping, and lead scoring

---

## 2. Technical Logic

### Trade Categories (32 total)

IDs 1-20 are the original trades (4 display name renames, slugs unchanged). IDs 21-31 are new trades added in WF3. ID 32 is the specialized drain-plumbing trade.

| # | Slug | Name | Icon | Color | Sort Order |
|---|------|------|------|-------|------------|
| 1 | `excavation` | Excavation | `Shovel` | `#795548` | 1 |
| 2 | `shoring` | Shoring | `Layers` | `#8D6E63` | 2 |
| 3 | `concrete` | Concrete | `Square` | `#9E9E9E` | 3 |
| 4 | `structural-steel` | Structural Steel | `Construction` | `#607D8B` | 4 |
| 5 | `framing` | Framing | `Frame` | `#FF9800` | 5 |
| 6 | `masonry` | Masonry & Brickwork | `Brick` | `#BF360C` | 6 |
| 7 | `roofing` | Roofing | `Home` | `#4CAF50` | 7 |
| 8 | `plumbing` | Plumbing | `Droplet` | `#2196F3` | 8 |
| 9 | `hvac` | HVAC & Sheet Metal | `Wind` | `#00BCD4` | 9 |
| 10 | `electrical` | Electrical | `Zap` | `#FFC107` | 10 |
| 11 | `fire-protection` | Fire Protection | `Flame` | `#F44336` | 11 |
| 12 | `insulation` | Insulation | `Thermometer` | `#E91E63` | 12 |
| 13 | `drywall` | Drywall & Taping | `Layout` | `#BDBDBD` | 13 |
| 14 | `painting` | Painting | `Paintbrush` | `#9C27B0` | 14 |
| 15 | `flooring` | Flooring | `Grid3x3` | `#3E2723` | 15 |
| 16 | `glazing` | Glazing | `PanelTop` | `#03A9F4` | 16 |
| 17 | `elevator` | Elevator | `ArrowUpDown` | `#455A64` | 17 |
| 18 | `demolition` | Demolition | `Trash` | `#D32F2F` | 18 |
| 19 | `landscaping` | Landscaping & Hardscaping | `TreePine` | `#388E3C` | 19 |
| 20 | `waterproofing` | Waterproofing | `Shield` | `#0D47A1` | 20 |
| 21 | `trim-work` | Trim Work | `Ruler` | `#A1887F` | 21 |
| 22 | `millwork-cabinetry` | Millwork & Cabinetry | `DoorOpen` | `#6D4C41` | 22 |
| 23 | `tiling` | Tiling | `LayoutGrid` | `#26A69A` | 23 |
| 24 | `stone-countertops` | Stone & Countertops | `Gem` | `#78909C` | 24 |
| 25 | `decking-fences` | Decking & Fences | `Fence` | `#8D6E63` | 25 |
| 26 | `eavestrough-siding` | Eavestrough & Siding | `ArrowDownToLine` | `#546E7A` | 26 |
| 27 | `pool-installation` | Pool Installation | `Waves` | `#0097A7` | 27 |
| 28 | `solar` | Solar | `Sun` | `#F57F17` | 28 |
| 29 | `security` | Security | `ShieldCheck` | `#37474F` | 29 |
| 30 | `temporary-fencing` | Temporary Fencing | `Construction` | `#FF6F00` | 30 |
| 31 | `caulking` | Caulking | `Paintbrush2` | `#B0BEC5` | 31 |
| 32 | `drain-plumbing` | Drain & Plumbing | `Droplet` | `#1565C0` | 32 |

### Lookup Functions

```
getTradeBySlug(slug: string): Trade | undefined
  - O(1) lookup from pre-built slug map
  - Returns undefined for unknown slugs (does not throw)

getTradeById(id: number): Trade | undefined
  - O(1) lookup from pre-built id map
  - Returns undefined for unknown ids (does not throw)

getAllTrades(): Trade[]
  - Returns all 32 trades sorted by sort_order ascending
```

### Construction Phase Mapping

Each trade maps to one or more construction phases (defined in `09_construction_phases.md`):

| Phase | Trades |
|-------|--------|
| Early Construction (0-3 mo) | excavation, shoring, demolition, concrete, waterproofing, temporary-fencing, drain-plumbing |
| Structural (3-9 mo) | framing, structural-steel, masonry, concrete, roofing, plumbing, hvac, electrical, elevator, fire-protection, pool-installation |
| Finishing (9-18 mo) | insulation, drywall, painting, flooring, glazing, fire-protection, plumbing, hvac, electrical, trim-work, millwork-cabinetry, tiling, stone-countertops, caulking, security, solar, eavestrough-siding |
| Landscaping (18+ mo) | landscaping, painting, decking-fences, pool-installation |

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
| `migrations/004_trades.sql` | Create trades table and seed original 20 rows | In Progress |
| `migrations/028_wf3_trades.sql` | Add 11 new trades and update 4 display name renames | In Progress |
| `src/app/api/trades/route.ts` | REST endpoint for trade list | In Progress |
| `src/tests/classification.logic.test.ts` | Unit tests for trade lookups | Planned |

---

## 4. Constraints & Edge Cases

- **Exactly 32 trades:** The taxonomy is a closed set. Adding a trade requires a migration and code update.
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
| Product Groups (`32`) | Downstream | Trade-to-product association for material suppliers |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| All trades present | `getAllTrades()` | Array of exactly 32 Trade objects |
| Unique slugs | `getAllTrades().map(t => t.slug)` | 32 unique strings, no duplicates |
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
| Seed data complete | After migration, `SELECT COUNT(*) FROM trades` returns 32 |
| Unique constraint | Inserting duplicate slug raises unique violation error |
| API response | `GET /api/trades` returns 200 with `{ trades: [...], count: 32 }` |
| API caching | Response includes appropriate cache headers |
| No auth required | `GET /api/trades` succeeds without authentication token |

---

## Operating Boundaries

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
