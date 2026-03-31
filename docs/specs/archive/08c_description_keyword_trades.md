# Spec 08c -- Description Keyword-to-Trade Mapping

## 1. Goal & User Story
Permit descriptions contain keywords that imply specific trades and products. This spec defines the structure and purpose of the keyword-to-trade mapping used by the classification engine to extract trade signals from free-text descriptions.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (reference data that informs the tag-trade matrix) |

## 3. Behavioral Contract
- **Inputs:** Permit description text, matched case-insensitively via regex patterns
- **Core Logic:** The tag-trade matrix maps 58 tag keys plus 16 aliases to arrays of `{ tradeSlug, confidence }` entries covering all 32 trades. Keywords are organized by trade domain: plumbing (drain, sewer, bathroom, backflow), HVAC (furnace, ductwork, ventilation, boiler), electrical (wiring, panel upgrade, solar), fire-protection (fire alarm, sprinkler, standpipe), roofing, concrete/foundation, framing/carpentry, shoring/underpinning, excavation, masonry, insulation, drywall, painting, flooring, glazing, elevator, demolition, structural steel, landscaping, and waterproofing. Confidence ranges from 0.50 to 0.85 depending on keyword specificity. Context-dependent keywords change meaning based on surrounding text (e.g., "roof drain" = plumbing not roofing, "membrane" near foundation = waterproofing vs. near roof = roofing, "door" in glass context = glazing vs. fire-rated = fire-protection). The full matrix is defined in `src/lib/classification/tag-trade-matrix.ts`.
- **Outputs:** Trade matches with confidence scores fed into the classification engine (Spec 08 Path B)
- **Edge Cases:**
  - "roof drain" must NOT trigger roofing trade (plumbing context)
  - "deck" in exterior context = framing + landscaping; in floor context = flooring
  - "basement" with underpinning = shoring/concrete/excavation; without = drywall/painting/flooring
  - Keywords in narrow-scope permits are ignored (scope code takes precedence)
  - New keywords require a code update to the tag-trade matrix

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** N/A (documentation-only spec; keyword behavior is tested through Spec 08 classification tests via tag-matrix lookups and context-dependent keyword resolution)
- **UI:** N/A
- **Infra:** N/A
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- This is a documentation-only spec. No source files are directly governed.
- Informs keyword mappings in `src/lib/classification/tag-trade-matrix.ts` (governed by Spec 08).

### Out-of-Scope Files (DO NOT TOUCH)
- All `src/` code changes must go through **Spec 08** workflows.

### Cross-Spec Dependencies
- Supplements **Spec 08 (Classification Engine)**: Defines keyword-to-trade mappings for the tag-trade matrix.
- Supplements **Spec 08b (Classification Assumptions)**: Builds on the assumption framework.
