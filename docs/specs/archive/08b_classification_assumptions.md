# Spec 08b -- Classification Assumptions

## 1. Goal & User Story
All trade classifications are inferred from permit metadata without building plans. This reference document defines the assumptions that inform classification rules, so they can be reviewed and refined as data patterns evolve.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (documentation-only reference that informs Spec 08 rules) |

## 3. Behavioral Contract
- **Inputs:** Permit metadata fields: permit_num suffix code, permit_type, work field, structure_type, description
- **Core Logic:** Three layers of assumptions govern classification. **(1) Permit code scope limiting:** Narrow-scope codes (PLB, PSA, HVA, MSA, DRN, STS, FSU, DEM) restrict to specific trades and override all other tiers. Broad-scope codes (BLD, CMB, COM, ALT, SHO, FND, DST, TPS, PCL) allow multi-tier classification. Unknown codes fall back to permit_type-based scope. **(2) Work field assumptions:** Within broad-scope permits, work values like "Interior Alterations", "New Building", "Re-Roofing", "Fire Alarm" narrow or expand the trade scope with specific inclusions and exclusions. **(3) Structure type assumptions:** Only applied to broad-scope permits; structure types (SFD, Apartment, Industrial, Office, etc.) boost or suppress certain trades based on building characteristics. Confidence ranges from 0.95 (narrow-scope code) down to 0.40-0.65 (structure type inference). See rules implementation in `src/lib/classification/rules.ts` and `src/lib/classification/classifier.ts`.
- **Outputs:** Documented rationale for rule confidence levels and scope decisions
- **Edge Cases:**
  - Description quality varies widely ("install new plumbing fixtures" vs. "interior alterations")
  - 95% of permits lack builder_name, so builder specialization cannot inform classification
  - Narrow-scope permits often have companion BLD permits for broader trades
  - Multi-trade permits with 10+ trades are common and correct for new buildings
  - Rules and confidence levels should be refined as user feedback is gathered

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** N/A (documentation-only spec; assumptions are tested through Spec 08 classification tests)
- **UI:** N/A
- **Infra:** N/A
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- This is a documentation-only spec. No source files are directly governed.
- Informs rules in `src/lib/classification/rules.ts` and `src/lib/classification/classifier.ts` (governed by Spec 08).

### Out-of-Scope Files (DO NOT TOUCH)
- All `src/` code changes must go through **Spec 08** workflows.

### Cross-Spec Dependencies
- Supplements **Spec 08 (Classification Engine)**: Defines assumptions that inform classification rules.
