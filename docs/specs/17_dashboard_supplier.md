# Spec 17 -- Supplier Dashboard

## 1. Goal & User Story
As a material supplier, I want to see which projects need my materials and connect with the builders who are buying, so I can target outreach based on real-time permit demand signals.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read/Write (own data) |
| Admin | None |

## 3. Behavioral Contract
- **Inputs:** Supplier's selected trade slugs (from onboarding Step 2); permit data with trade classifications and construction phases.
- **Core Logic:**
  - Trade-to-material mapping is a static lookup (see `src/lib/supplier/material-mapping.ts`). Each of the 32 trade slugs maps to one or more material categories.
  - Material demand cards aggregate permits by trade and construction phase: active permit count, total `est_const_cost`, volume level (Low < $1M, Medium < $10M, High < $50M, Very High > $50M), top 3 wards by count, and month-over-month trend.
  - Builder directory shows builders working on projects matching the supplier's trades, with enriched contact data from the `builders` table (Spec 11).
  - Geographic demand map uses shared map component (Spec 20) with color-coded markers by material category and ward boundary overlays.
  - Permits with null `est_const_cost` are included in demand counts but excluded from volume calculation.
- **Outputs:** Material demand feed (cards per category), builder directory (paginated, sortable by permit count/cost/rating), embedded demand map.
- **Edge Cases:**
  - No permits match supplier's trades: show "0 active projects" with volume "None".
  - Builder enrichment data unavailable: show name and permit count only; placeholder for contact info.
  - First-month supplier: no trend data; show "New" badge instead of trend arrow.
  - Null cost permits excluded from volume but counted in demand.
  - Ward boundary data unavailable: fall back to postal code FSA grouping.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **UI** (`dashboard.ui.test.tsx`): Dashboard StatCard Logic; Dashboard Navigation Links; Dashboard Filter State; Dashboard Stats Row; Dashboard Account Type Variants
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/dashboard/page.tsx` (supplier view extension)
- `src/tests/dashboard.ui.test.tsx`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/auth/`**: Governed by Spec 13. Do not modify auth logic.
- **`src/components/permits/PermitCard.tsx`**: Governed by Spec 15. Shared component — do not modify without running UI regression tests.

### Cross-Spec Dependencies
- Extends **Spec 15 (Tradesperson Dashboard)**: Builds on the same dashboard page.
- Relies on **Spec 07 (Trade Taxonomy)**: Maps trades to material categories for supplier view.
- Relies on **Spec 13 (Auth)**: Reads supplier profile and preferences.
