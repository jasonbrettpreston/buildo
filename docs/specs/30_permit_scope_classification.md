# Spec 30 -- Permit Work Scope Classification

## 1. User Story

> As a contractor, I want to filter permits by project scope (e.g. "new deck",
> "basement reno", "2nd floor addition") so I can find leads that match the type
> of work my crew does, beyond just the trade category.

## 2. Background

The existing trade classification system answers "which trades does this permit
need?" but not "what is being built or renovated?". Contractors need to filter by
project type and specific scope items. Analytics need aggregate breakdowns.

### Data Sources

| Field | Values | Coverage |
|-------|--------|----------|
| `work` | 50+ values (Interior Alterations, Addition(s), New Building, Deck, etc.) | ~70% clean signal |
| `permit_type` | 30 values (Small Residential, New Building, Demolition Folder, etc.) | Fallback tier |
| `structure_type` | 60+ values (SFD, Apartment Building, Office, etc.) | Building type tags |
| `description` | Free-form text, 50-200 chars typical | Specific scope details |
| `storeys` | Integer | Scale tags |

## 3. Taxonomy

### Dimension 1: Project Type (mutually exclusive)

| project_type | Description | Primary Signal |
|---|---|---|
| `new_build` | Entirely new structure | work="New Building" |
| `addition` | Expanding existing structure | work="Addition(s)", "Deck", "Porch", "Garage" |
| `renovation` | Interior changes to existing | work="Interior Alterations" |
| `demolition` | Tearing down structure | work="Demolition", permit_type contains "Demolition" |
| `mechanical` | System install/replace only | permit_type starts with Plumbing/Mechanical/Drain/Electrical |
| `repair` | Fix existing damage | work contains "Repair", "Fire Damage" |
| `other` | Signs, temporary structures, admin | Default fallback |

### Dimension 2a: Residential Scope Tags (Small Residential — 37 fixed tags)

For permits where `permit_type` starts with "Small Residential", a dedicated
37-tag system with work-type prefixes is used.

#### `new:` tags (31 tags — value-driving construction)

| Tag | Label | Primary Pattern |
|-----|-------|-----------------|
| `new:1-storey-addition` | 1 Storey Addition | Default when addition detected with no storey count |
| `new:2-storey-addition` | 2 Storey Addition | "two storey" / "2 storey" in description |
| `new:3-storey-addition` | 3 Storey Addition | "three storey" / "3 storey" in description |
| `new:deck` | Deck | `/\bdeck\b/i` — default new unless repair signal |
| `new:garage` | Garage | `/\bgarage\b/i` — default new unless repair signal |
| `new:porch` | Porch | `/\bporch\b/i` — default new unless repair signal |
| `new:basement` | Basement | `/\bbasement\b/i` — removed if underpinning or second-suite present |
| `new:underpinning` | Underpinning | `/\bunderpinn?ing\b/i` |
| `new:walkout` | Walkout | `/\bwalk[\s-]?out\b/i` |
| `new:balcony` | Balcony | `/\bbalcon(y\|ies)\b/i` |
| `new:dormer` | Dormer | `/\bdormer\b/i` |
| `new:second-suite` | Second Suite | work = "Second Suite (New)" or description regex |
| `new:kitchen` | Kitchen | `/\bkitchen\b/i` |
| `new:open-concept` | Open Concept | `/\bopen\s*concept\b/i` or load-bearing wall removal |
| `new:structural-beam` | Structural Beam | `/\b(beam\|lvl\|steel\s*beam)\b/i` |
| `new:laneway-suite` | Laneway Suite | `/\blaneway\b/i` or work field |
| `new:pool` | Pool | `/\bpool\b/i` |
| `new:carport` | Carport | `/\bcarport\b/i` |
| `new:canopy` | Canopy | `/\bcanopy\b/i` |
| `new:roofing` | Roofing | `/\broof(ing)?\b/i` |
| `new:fence` | Fence | `/\bfenc(e\|ing)\b/i` |
| `new:foundation` | Foundation | `/\bfoundation\b/i` |
| `new:solar` | Solar | `/\bsolar\b/i` |
| `new:accessory-building` | Accessory Building | shed/cabana/ancillary or work field |
| `new:bathroom` | Bathroom | washroom, bathroom, powder room, ensuite, lavatory |
| `new:laundry` | Laundry | `/\blaundry\b/i` |
| `new:fireplace` | Fireplace | fireplace, wood stove, or work field |
| `new:stair` | Stair | stair, staircase, stairway, steps |
| `new:window` | Window | window, fenestration |
| `new:door` | Door | `/\bdoor(s)?\b/i` |
| `new:shoring` | Shoring | shoring, shore |

#### `alter:` tags (6 tags — repair/maintenance)

| Tag | Label | Primary Pattern |
|-----|-------|-----------------|
| `alter:interior-alterations` | Interior Alterations | Absorbs "renovation" — no separate renovation tag |
| `alter:fire-damage` | Fire Damage | Description or work = "Fire Damage" |
| `alter:deck` | Deck (Repair) | deck + repair signal nearby |
| `alter:porch` | Porch (Repair) | porch + repair signal nearby |
| `alter:garage` | Garage (Repair) | garage + repair signal nearby |
| `alter:unit-conversion` | Unit Conversion | convert/conversion or work = "Change of Use" |

#### New vs Alter Logic for Deck/Porch/Garage

Default is `new:`. Classify as `alter:` ONLY when repair signal (repair, replace,
reconstruct, refinish, restore, re-build) is present near the item keyword.
Override back to `new:` if ALSO has new/construct/build signal nearby.

#### Deduplication Rules

| If Both Present | Keep | Remove | Rationale |
|----------------|------|--------|-----------|
| basement + underpinning | underpinning | basement | Underpinning IS basement work |
| basement + second-suite | second-suite | basement | 80% of second suites are in basements |
| second-suite + interior-alterations | second-suite | interior-alterations | Alterations are the mechanism |
| accessory-building + garage | garage | accessory-building | Garage is more specific |
| accessory-building + pool | pool | accessory-building | Pool is more specific |
| unit-conversion + second-suite | second-suite | unit-conversion | Suite creation IS a conversion |

#### Addition Storey Defaulting

1. Parse storey count from description (cardinal words + numeric)
2. If addition detected AND storey count found: `new:N-storey-addition`
3. If addition detected AND no storey count: default to `new:1-storey-addition`
4. No generic addition tag — always 1, 2, or 3 storey

**"Addition of" disambiguation:** Phrases like "addition of washroom" mean
installing a feature, not a structural addition. The negative lookahead
explicitly blacklists non-structural nouns:
```
(?!\s+(of\s+)?(a\s+)?(new\s+)?(washroom|bathroom|laundry|closet|window|door|powder|shower|fireplace|skylight)\b)
```

#### Exclusions

Party Wall Admin Permits (work = "Party Wall Admin Permits") return empty tags.

### Dimension 2b: General Scope Tags (non-residential permits)

For all non-Small Residential permits, the general tag extraction scans
description, work, structure_type, proposed_use, and current_use fields.

**Structural:** `2nd-floor`, `3rd-floor`, `rear-addition`, `side-addition`,
`front-addition`, `storey-addition`, `basement`, `underpinning`, `foundation`

**Exterior:** `deck`, `porch`, `garage`, `carport`, `canopy`, `walkout`,
`balcony`, `laneway-suite`, `pool`, `fence`, `roofing`

**Interior:** `kitchen`, `bathroom`, `basement-finish`, `second-suite`,
`open-concept`, `convert-unit`, `tenant-fitout`

**Building:** `condo`, `apartment`, `townhouse`, `mixed-use`, `retail`, `office`,
`restaurant`, `warehouse`, `school`, `hospital`

**Systems:** `hvac`, `plumbing`, `electrical`, `sprinkler`, `fire-alarm`,
`elevator`, `drain`, `backflow-preventer`, `access-control`

**Scale:** `high-rise` (10+ storeys), `mid-rise` (5-9), `low-rise` (2-4)

**Experimental:** `stair`, `window`, `door`, `shoring`, `demolition`, `station`, `storage`

### Dimension 2c: New Houses Scope Tags

For permits where `permit_type` starts with "New House", a dedicated extractor
produces exactly one building type tag plus zero or more feature tags.

#### Building Type Tags (mutually exclusive — emerald `#059669`)

| Tag | Label | Signal |
|-----|-------|--------|
| `new:sfd` | Single Family Detached | Default; no other match |
| `new:semi-detached` | Semi-Detached | structure_type contains "Semi" |
| `new:townhouse` | Townhouse | structure_type contains "Townhouse" or "Row House" |
| `new:stacked-townhouse` | Stacked Townhouse | structure_type contains "Stacked" |
| `new:houseplex-2-unit` | Houseplex 2 Units | houseplex with 2 units |
| `new:houseplex-3-unit` | Houseplex 3 Units | houseplex with 3 units |
| `new:houseplex-4-unit` | Houseplex 4 Units | houseplex with 4 units |
| `new:houseplex-5-unit` | Houseplex 5 Units | houseplex with 5 units |
| `new:houseplex-6-unit` | Houseplex 6 Units | houseplex with 6 units |

**Classification cascade** (first match wins):
1. `proposed_use` contains "houseplex" → extract unit count from `(N Units)` pattern
2. `structure_type` matches `3+ Unit` → use `housing_units` field (default 3)
3. `housing_units > 1` + description mentions "houseplex" → use housing_units
4. `structure_type` contains "stacked" → stacked-townhouse
5. `structure_type` contains "townhouse" or "row house" → townhouse
6. `structure_type` contains "semi" → semi-detached
7. Default → sfd

Unit counts clamped to range [2, 6].

#### Feature Tags (green `#16A34A` — same slugs as SRP)

| Tag | Label | Pattern |
|-----|-------|---------|
| `new:garage` | Garage | `/\bgarage\b/i` |
| `new:deck` | Deck | `/\bdeck\b/i` |
| `new:porch` | Porch | `/\bporch\b/i` |
| `new:walkout` | Walkout | `/\bwalk[\s-]?out\b/i` |
| `new:balcony` | Balcony | `/\bbalcon(y\|ies)\b/i` |
| `new:laneway-suite` | Laneway/Garden Suite | `/\blaneway\b/i` OR `/\bgarden\s*suite\b/i` OR `/\brear\s*yard\s*suite\b/i` |
| `new:finished-basement` | Finished Basement | `/\bfinish(ed)?\s*basement\b/i` |

#### Houseplex Storey Display

Storeys come from `permit.storeys` at render time — not stored in the tag slug:
- "Houseplex 4 Units · 3 Storeys" on detail page and PermitCard

### Dimension 2d: Residential Building Additions/Alterations

For permits where `permit_type` starts with "Building Additions" AND
`isResidentialStructure()` returns true, the permit routes through the
existing `extractResidentialTags()` system (same 37-tag set as SRP).

**Gate check (`isResidentialStructure`):**
- `structure_type` starts with "SFD" → residential
- `structure_type` contains Detached/Semi/Townhouse/Row House/Stacked → residential
- `proposed_use` contains residential/dwelling/house/duplex/triplex → residential
- Otherwise → non-residential (uses general `extractScopeTags()`)

### Laneway/Garden Suite — Combined Tag

Both `extractResidentialTags()` and `extractNewHouseTags()` trigger the
`new:laneway-suite` tag for any of: laneway, garden suite, rear yard suite.
These are all Additional Residential Units (ARUs) in Toronto zoning.

## 4. Classification Logic

### Project Type Cascade

1. **Tier 1 — `work` field** (most specific): Direct mapping for known values
2. **Tier 2 — `permit_type` field**: Fallback for mechanical-only and demolition
3. **Tier 3 — `description` regex**: For "Multiple Projects" and "Other" categories
4. **Default**: `other`

### Scope Tag Branching

- `permit_type` starts with "Small Residential" → `extractResidentialTags()`
- `permit_type` starts with "New House" → `extractNewHouseTags()`
- `permit_type` starts with "Building Additions" + `isResidentialStructure()` → `extractResidentialTags()`
- All other permits → `extractScopeTags()` (general tag extraction)

After extractor-specific tags, two universal tiers are applied to every permit:

1. **Demolition tier** — if `project_type === 'demolition'`, a `demolition` tag is added (ensures all DM permits are tagged)
2. **Use-type tier** — exactly one of `residential`, `commercial`, or `mixed-use` (see Section 10)

### Storage Format

Prefixed `TEXT[]` in existing `scope_tags` column:
```
["new:3-storey-addition", "new:underpinning", "alter:interior-alterations"]
```

No new migration needed — just re-run the classifier to repopulate.

## 5. Storage

```sql
-- Migration 019
ALTER TABLE permits ADD COLUMN project_type VARCHAR(20);
ALTER TABLE permits ADD COLUMN scope_tags TEXT[];
ALTER TABLE permits ADD COLUMN scope_classified_at TIMESTAMPTZ;

CREATE INDEX idx_permits_project_type ON permits (project_type);
CREATE INDEX idx_permits_scope_tags ON permits USING GIN (scope_tags);
```

Stored directly on permits (not a junction table) because project_type is 1:1,
scope_tags are small arrays (1-5 items), and this avoids JOINs for the most
common query pattern. GIN index enables `@>` containment queries.

## 6. UI Display

Scope tags are displayed directly below the description text in the permit
detail view:

- `new:` tags displayed as green outline badges (`#16A34A`)
- `alter:` tags displayed as orange outline badges (`#EA580C`)
- Unprefixed general tags displayed as gray outline badges (`#6B7280`)

PermitCard shows up to 5 tags with "+N more" overflow.

## 7. API

```
GET /api/permits?project_type=addition
GET /api/permits?scope_tags=deck,garage    (ANY match via && operator)
GET /api/permits?project_type=addition&scope_tags=deck
```

## 8. Scope Tag Propagation (BLD → Companion Permits)

Toronto issues multiple permits per construction project sharing the same base
number (e.g. `21 123456`):

- `21 123456 BLD 00` — building permit (rich scope tags)
- `21 123456 PLB 00` — plumbing permit (minimal description)
- `21 123456 HVA 00` — HVAC permit (minimal description)

BLD permits get rich scope tags from `classifyScope()`. Companion permits
(PLB/HVA/DRN/DEM/etc.) have minimal descriptions and get only generic tags.

### Base Number Extraction

```ts
extractBasePermitNum("21 123456 BLD 00") → "21 123456"
extractBasePermitNum("21 123456 PLB 00") → "21 123456"
extractBasePermitNum("24 101234")         → "24 101234"
```

### Propagation Rules

1. Extract base number from each permit's `permit_num` (first two space-separated parts)
2. Find the BLD permit in the same family (same base number, code = `BLD`)
3. Copy BLD's `scope_tags` and `project_type` to all non-BLD companion permits
4. Only propagate if the BLD permit has non-empty `scope_tags`
5. Companion permits get `scope_source = 'propagated'`; BLD keeps `scope_source = 'classified'`

### New Column: `scope_source`

```sql
-- Migration 021
ALTER TABLE permits ADD COLUMN scope_source VARCHAR(20) DEFAULT 'classified';
-- Values: 'classified' (own tags), 'propagated' (copied from BLD family member)
```

### Where Propagation Runs

1. **`scripts/classify-scope.js`** — Batch propagation pass after classification using a single UPDATE query
2. **`functions/src/index.ts` → `classifyTrades`** — Real-time: if classified permit IS a BLD, propagate to companions; if NOT a BLD, look up BLD sibling and copy tags

## 9. Files

| Action | File |
|--------|------|
| CREATE | `migrations/019_permit_scope.sql` |
| CREATE | `migrations/020_quality_scope.sql` |
| CREATE | `src/lib/classification/scope.ts` |
| CREATE | `scripts/classify-scope.js` |
| CREATE | `src/tests/scope.logic.test.ts` |
| MODIFY | `src/lib/permits/types.ts` (add filter fields) |
| MODIFY | `src/app/api/permits/route.ts` (add scope filters) |
| MODIFY | `src/lib/quality/types.ts` (add scope metrics) |
| MODIFY | `src/lib/quality/metrics.ts` (add scope queries) |
| MODIFY | `functions/src/index.ts` (classify scope in sync) |
| MODIFY | `src/app/permits/[id]/page.tsx` (tags in Description section) |
| MODIFY | `src/components/permits/PermitCard.tsx` (color-coded tags) |
| CREATE | `migrations/021_scope_source.sql` |

## 10. Use-Type Classification (Universal Tier)

Every permit receives exactly one use-type tag as a separate classification tier,
independent of the extractor-specific scope tags:

| Tag | Description | Signal |
|-----|-------------|--------|
| `residential` | Primarily residential work | Small Residential, New Houses, residential structure types, residential proposed_use |
| `commercial` | Primarily commercial/industrial work | Non-Residential, commercial structure types, commercial proposed_use |
| `mixed-use` | Both residential AND commercial signals present | Both signal types detected |

Default: `commercial` (permits without clear residential signal)

Use-type is applied in `classifyScope()` after extractor-specific tags, ensuring
every permit's scope_tags array includes exactly one of these three values.

### Companion Permit Delegation

SRP (Building) permits intentionally exclude system-trade tags (HVAC, plumbing,
electrical). These trades are handled by companion permits (PLB, HVA, DRN) which
receive their own scope tags through direct classification or BLD→companion
propagation. This separation of concerns prevents tag pollution and double-counting
of leads. The residential systems gap (1,158 SRP permits mentioning HVAC/plumbing/
electrical) is resolved by design — system scope is delegated to companion permits.
