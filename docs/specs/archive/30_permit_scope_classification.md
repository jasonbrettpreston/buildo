# Spec 30 -- Permit Work Scope Classification

## 1. Goal & User Story
As a contractor, I want to filter permits by project scope (e.g. "new deck", "basement reno", "2nd floor addition") so I can find leads that match the type of work my crew does, beyond just the trade category.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend script) |

## 3. Behavioral Contract
- **Inputs:** Permit fields: `work`, `permit_type`, `structure_type`, `description`, `storeys`, `proposed_use`, `current_use`, `housing_units`. Triggered by batch script `scripts/classify-scope.js` or real-time Cloud Function.
- **Core Logic:**
  - **Dimension 1 -- Project Type** (mutually exclusive, stored in `permits.project_type`): 7 values (new_build, addition, renovation, demolition, mechanical, repair, other). Classified via 4-tier cascade: work field direct mapping, permit_type fallback, description regex, then default "other".
  - **Dimension 2 -- Scope Tags** (multi-value array, stored in `permits.scope_tags` as TEXT[] with GIN index). Branching by permit type:
    - "Small Residential" permits: `extractResidentialTags()` -- 35 fixed tags with `new:` prefix (29 value-driving) and `alter:` prefix (6 repair). Default is `new:`; classify as `alter:` only with repair signal nearby; override back to `new:` if also has new/construct signal. Deduplication rules collapse overlapping tags (e.g. basement+underpinning keeps underpinning only). "Addition of [feature]" disambiguated via negative lookahead to avoid false structural addition tags.
    - "New House" permits: `extractNewHouseTags()` -- exactly one building type tag (sfd, semi-detached, townhouse, stacked-townhouse, houseplex-2..6-unit) via cascade on proposed_use/structure_type/housing_units, plus feature tags (garage, deck, porch, walkout, balcony, laneway-suite, finished-basement). Unit counts clamped [2, 6].
    - "Building Additions" + residential structure: routes through `extractResidentialTags()` (same 35-tag set). Residential gate check via `isResidentialStructure()` on structure_type and proposed_use.
    - All other permits: `extractScopeTags()` -- general tags across structural, exterior, interior, building, systems, scale, and experimental categories.
  - **Universal tiers** applied to every permit after extractor: demolition tag if `project_type === 'demolition'`; exactly one use-type tag (`residential`, `commercial`, or `mixed-use`).
  - **BLD-to-companion propagation:** BLD permits get rich tags; companion permits (PLB/HVA/DRN/etc.) copy BLD sibling's tags via base permit number extraction. Companions get `scope_source = 'propagated'`; BLD keeps `scope_source = 'classified'`. See `src/lib/classification/scope.ts`.
  - **Party Wall Admin Permits** return empty tags (exclusion).
  - Storage: `project_type VARCHAR(20)`, `scope_tags TEXT[]`, `scope_classified_at TIMESTAMPTZ`, `scope_source VARCHAR(20)` on permits table (migrations 019, 021). GIN index on scope_tags enables `@>` containment queries.
- **Outputs:** Each permit receives a project_type value and 1-5 scope_tags. API supports `?project_type=addition` and `?scope_tags=deck,garage` filters. Tags displayed as coloured badges on permit detail (green for `new:`, orange for `alter:`, gray for unprefixed). PermitCard shows up to 5 tags with "+N more" overflow.
- **Edge Cases:**
  - Narrow-scope permits (plumbing-only) get minimal tags; system trades delegated to companion permits by design.
  - "Addition of washroom" is NOT a structural addition (negative lookahead blacklist).
  - Houseplex unit counts clamped to [2, 6].
  - Laneway/garden suite/rear yard suite all map to single `new:laneway-suite` tag.
  - Permits with no extractable scope get only the universal use-type tag.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`scope.logic.test.ts`): classifyProjectType; extractScopeTags; extractResidentialTags; parseTagPrefix; isResidentialStructure; extractNewHouseTags; extractResidentialTags — laneway/garden suite; formatScopeTag; getScopeTagColor; classifyScope; extractBasePermitNum; isBLDPermit; Fix 1: Regex blacklisting — addition-of false positives; Fix 2: Zero-tag coverage — station and storage tags; Fix 5: Use-type classification — universal tier; Demolition tag — all DM permits
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/classification/scope.ts`
- `scripts/classify-scope.js`
- `migrations/019_permit_scope.sql`
- `migrations/020_quality_scope.sql`
- `migrations/021_scope_source.sql`
- `migrations/035_scope_tags_snapshot.sql`
- `migrations/036_detailed_tags_snapshot.sql`
- `src/tests/scope.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Trade classification is separate from scope classification.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.
- **`src/lib/classification/trades.ts`**: Governed by Spec 07. Do not modify trade taxonomy.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `permits.work`, `permits.permit_type`, `permits.description` fields.
- Consumed by **Spec 08 (Classification)**: Scope tags feed the tag-trade matrix for classification.
- Consumed by **Spec 34 (Market Metrics)**: Scope breakdown used in market metrics analysis.
