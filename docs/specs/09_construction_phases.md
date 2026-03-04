# Spec 09 -- Construction Phase Model

## 1. Goal & User Story
Tradespersons see permits highlighted when the construction phase matches their trade's active period, so they are not chasing leads too early or too late.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend logic, computed at query time) |

## 3. Behavioral Contract
- **Inputs:** `permit.issued_date`, `permit.status`, trade slug
- **Core Logic:** Four sequential phases based on months since `issued_date`: early_construction (0-3 mo, site prep/foundation), structural (3-9 mo, frame/rough-in), finishing (9-18 mo, interior buildout), landscaping (18+ mo, exterior/occupancy). Status overrides take priority: "Completed" forces landscaping, "Application"/"Cancelled"/"Revoked" force early_construction. Null or future `issued_date` defaults to early_construction (0 months). Phase boundaries are lower-inclusive, upper-exclusive (exactly 3 months = structural). Each trade maps to exactly one primary phase via `PHASE_TRADE_MAP`. `isTradeActiveInPhase()` checks if a trade is active in a given phase. `getPhasesForTrade()` and `getActiveTradesForPhase()` provide reverse lookups. Phase is computed at query time, not stored. Phase display colors: early_construction=#F59E0B, structural=#3B82F6, finishing=#8B5CF6, landscaping=#10B981. All date comparisons use UTC. See `determinePhase()` and `PHASE_TRADE_MAP` in `src/lib/classification/phases.ts`.
- **Outputs:** A `ConstructionPhase` slug per permit, plus boolean `isActive` per trade-phase combination
- **Edge Cases:**
  - No issued_date: defaults to early_construction
  - Permits 5+ years old remain in landscaping (may be stalled projects)
  - Cancelled/Revoked permits get early_construction phase but are penalized in scoring
  - Future issued_date treated as 0 months elapsed
  - Each trade appears in exactly one phase (no duplicates across phases)

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`classification.logic.test.ts`): Trade Taxonomy; Tag-Trade Matrix; classifyPermit - Tag Matrix Integration; Tier 3 Deprecation - all fallback matches must be tier 1; Tier 1 Work-Field Fallback; Tier 1 Classification - Permit Type Direct Match; Construction Phases; Product Groups; Permit Code Extraction; Permit Code Scope Limiting; Narrow-Scope Code-Based Fallback; ALL_RULES
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/classification/phases.ts`
- `src/tests/classification.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/classification/scoring.ts`**: Governed by Spec 10. Do not modify lead scoring.
- **`src/lib/classification/trades.ts`**: Governed by Spec 07. Do not modify trade taxonomy.

### Cross-Spec Dependencies
- Relies on **Spec 07 (Trade Taxonomy)**: Reads trade data for phase-trade mapping.
- Relies on **Spec 08 (Classification)**: Classification runs before phase assignment.
- Consumed by **Spec 10 (Lead Scoring)**: Phase match is a scoring factor.
