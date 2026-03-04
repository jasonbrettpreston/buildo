# Spec 12 -- Committee of Adjustments Integration

## 1. Goal & User Story
Tradespeople want early intelligence on upcoming construction projects. Committee of Adjustment (CoA) approvals signal imminent permit issuance, so syncing and linking CoA data to permits creates "pre-permit" leads that give tradespeople a head start.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend pipeline, scripts, admin triggers) |

## 3. Behavioral Contract
- **Inputs:** Toronto Open Data CKAN API (package `260e1356-dce6-48e2-afa0-e71d70cd6406`); two resources: Active (`51fd09cd...`) and Closed since 2017 (`9c97254e...`). See `scripts/load-coa.js`
- **Core Logic:**
  - Sync: fetch JSON from CKAN, parse records, upsert by `application_number` unique key. CKAN field mappings: `REFERENCE_FILE#` to application_number, `C_OF_A_DESCISION` (source typo) to decision, `WARD_NUMBER` (closed) / `WARD` (active) to ward, address composed from STREET_NUM + STREET_NAME + STREET_TYPE + STREET_DIRECTION
  - Linking: 3-tier cascade -- (1) exact address match at 0.95 confidence, (2) fuzzy address + ward match at 0.60, (3) description full-text search at 0.30-0.50. Linker runs on all approved CoAs regardless of age. See `src/lib/coa/linker.ts`
  - Pre-Permit entity: approved CoAs with `decision_date >= NOW() - 90 days` and `linked_permit_num IS NULL` qualify as upcoming leads. Mapped to permit DTO shape with `COA-` prefix on permit_num. Pre-permits live exclusively in `coa_applications` table; API UNIONs them when `source=pre_permits` filter is active. See `src/lib/coa/pre-permits.ts`
  - Detail routing: `COA-` prefix in permit ID triggers the permit detail API to query `coa_applications` instead of `permits`
- **Outputs:** Populated `coa_applications` table with linking metadata; pre-permit leads surfaced in permit feed and detail views; linking confidence scores
- **Edge Cases:**
  - Address format inconsistency between CoA and permits (abbreviations, directionals) handled by normalization
  - "ST" ambiguity: "MAIN ST" = STREET vs "ST CLAIR" = name; context-based disambiguation needed
  - Refused/Withdrawn decisions stored but never surfaced as leads
  - Null decision_date or description handled gracefully (zero-score components, no errors)
  - CKAN API unavailability triggers retry with exponential backoff; failed syncs do not overwrite existing data

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`coa.logic.test.ts`): CoA Address Parsing; CoA Link Confidence; Pre-Permit DTO Mapping; Pre-Permit ID Detection; Pre-Permit Qualifying Criteria; Pre-Permit Badge Logic; Linker No Hard Age Cutoff; Permit Detail CoA Section; Dashboard CoA Stats; Pre-Permit Slash-Safe URLs; Pre-Permit Builder Field Null Handling; Pre-Permit API Route Tilde Decoding; Pre-Permit Query includes sub_type; PermitCard Builder Section Hiding; Pre-Permit Source File Existence
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/coa/linker.ts`
- `src/lib/coa/pre-permits.ts`
- `src/lib/coa/repository.ts`
- `src/lib/coa/types.ts`
- `src/app/api/coa/route.ts`
- `scripts/load-coa.js`
- `scripts/link-coa.js`
- `src/tests/coa.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/permits/field-mapping.ts`**: Governed by Spec 02. Do not modify permit field mapping.
- **`migrations/`**: Governed by Spec 01. Raise a query if schema must change.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `coa_applications` table.
- Relies on **Spec 05 (Geocoding)**: Address matching uses geocoded coordinates for fallback.
- Consumed by **Spec 19 (Search & Filter)**: Pre-permit source toggle uses CoA data.
- Consumed by **Spec 28 (Data Quality)**: CoA linking metrics tracked in quality dashboard.
