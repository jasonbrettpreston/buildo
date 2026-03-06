# Spec 11 -- Entity Enrichment

## 1. Goal & User Story
Tradespeople need contact information for builders and other project stakeholders so they can reach out about projects. Entity names are extracted from permits, normalized, de-duplicated into the `entities` table (see Spec 37), and enriched with phone/website/rating via external APIs.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend scripts and admin API trigger) |

## 3. Behavioral Contract
- **Inputs:** Raw builder names from ingested permits; admin trigger via `POST /api/admin/builders`
- **Core Logic:**
  - Name normalization: uppercase, collapse whitespace, strip trailing punctuation, strip business suffixes (INC, LTD, CORP, LLC, CO, LIMITED, INCORPORATED, CORPORATION, COMPANY), trim. See `src/lib/builders/normalize.ts`
  - De-duplication by `name_normalized` unique key in `entities` table (Spec 37); new permits link to existing entity or create new record via `entity_projects` junction
  - Enrichment cascade (priority order): (1) Google Places API text search with Levenshtein similarity > 0.7 validation, (2) WSIB Registry matching (Spec 35), (3) Web search enrichment for email/phone/website (Spec 36), (4) User-contributed contacts (planned)
  - Batch processing: 50 entities per batch, 1,500ms delay between batches. See `scripts/enrich-web-search.js`
  - Entity API routes: list with search/pagination, single detail, admin stats/trigger. See `src/app/api/builders/` and `src/app/api/admin/builders/`
- **Outputs:** Entity records in `entities` table with primary_phone, primary_email, website, google_rating, last_enriched_at
- **Edge Cases:**
  - Name collisions after normalization (e.g., "Smith Construction Inc" and "Smith Construction Ltd") require manual review
  - Google Places false matches below 0.7 similarity threshold are rejected
  - Builders with no online presence remain un-enriched (null contact fields)
  - Empty or null builder names on permits are skipped entirely
  - Personal names (e.g., "JOHN SMITH") are normalized but may have lower match rates

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`builders.logic.test.ts`): Builder Name Normalization; Entity Factory (formerly Builder); Builder Link & Display
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/builders/enrichment.ts`
- `src/lib/builders/normalize.ts`
- `src/lib/builders/repository.ts`
- `src/app/api/builders/route.ts`
- `src/app/api/builders/[id]/route.ts`
- `src/app/api/admin/builders/route.ts`
- `scripts/enrich-builders.js`
- `scripts/extract-builders.js`
- `src/tests/builders.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.
- **`migrations/`**: Governed by Spec 01. Raise a query if schema must change.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `entities` and `entity_projects` tables.
- Relies on **Spec 02 (Data Ingestion)**: Builder names are extracted from ingested `permits.builder_name`.
- Relies on **Spec 37 (Corporate Identity Hub)**: Entity extraction and project linking.
- Relies on **Spec 35 (WSIB Registry)**: WSIB matching for enrichment.
- Relies on **Spec 36 (Web Search Enrichment)**: Web scraping for contact details.
- Consumed by **Spec 18 (Permit Detail)**: Permit detail page displays entity info.
