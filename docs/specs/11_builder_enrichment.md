# 11 - Builder Enrichment

**Status:** Planned
**Last Updated:** 2026-02-14
**Depends On:** `01_database_schema.md`, `02_data_ingestion.md`
**Blocks:** `15_dashboard_tradesperson.md`, `18_permit_detail.md`

---

## 1. User Story

> "As a tradesperson, I want contact information for builders so I can reach out about their projects."

**Acceptance Criteria:**
- Builder names extracted from permits are normalized and de-duplicated
- Contact information (phone, website, email) is enriched from external sources
- Enrichment follows a priority pipeline: Google Places -> Ontario Business Registry -> WSIB -> Google Custom Search -> User-contributed
- Each builder record shows enrichment source and verification status
- Estimated cost for initial enrichment of ~3,630 unique builders is ~$116 via Google Places API

---

## 2. Technical Logic

### Name Normalization Pipeline

Builder names from Toronto Open Data are inconsistent. Normalization ensures accurate de-duplication.

```
normalizeBuilderName(rawName: string): string
  1. Convert to uppercase: "ABC Construction Inc." -> "ABC CONSTRUCTION INC."
  2. Collapse whitespace: "ABC  CONSTRUCTION" -> "ABC CONSTRUCTION"
  3. Strip trailing punctuation: "ABC CONSTRUCTION." -> "ABC CONSTRUCTION"
  4. Strip business suffixes: remove INC, LTD, CORP, LLC, CO, LIMITED,
     INCORPORATED, CORPORATION, COMPANY and their punctuated variants
     "ABC CONSTRUCTION INC" -> "ABC CONSTRUCTION"
  5. Trim whitespace: "  ABC CONSTRUCTION  " -> "ABC CONSTRUCTION"
  6. Store as name_normalized for dedup key
```

Suffix stripping regex:
```
/\b(INC\.?|LTD\.?|CORP\.?|LLC\.?|CO\.?|LIMITED|INCORPORATED|CORPORATION|COMPANY)\s*$/i
```

### De-duplication Strategy

- Primary dedup key: `name_normalized`
- On permit ingestion, extract builder name and normalize
- Lookup existing builder by `name_normalized`
- If found: link permit to existing builder record
- If not found: create new builder record, queue for enrichment

### Enrichment Pipeline (Priority Order)

#### Source 1: Google Places API (Primary)

```
enrichFromGooglePlaces(builder: Builder): EnrichmentResult
  - Search query: "{builder.name} contractor Toronto"
  - API: Google Places Text Search
  - Extract: phone, website, google_place_id, google_rating, formatted_address
  - Cost: $0.032 per request (Places API pricing)
  - Estimated total: ~3,630 builders x $0.032 = ~$116
  - Rate limit: 100 requests/second
  - Match validation: Verify returned name similarity > 0.7 (Levenshtein ratio)
```

#### Source 2: Ontario Business Registry (OBR)

```
enrichFromOBR(builder: Builder): EnrichmentResult
  - Only for names containing INC, LTD, CORP (incorporated businesses)
  - Search Ontario Business Registry public records
  - Extract: obr_business_number, registered_address, status
  - Cost: Free (public data)
  - Used for business verification, not primary contact info
```

#### Source 3: WSIB Safety Check

```
enrichFromWSIB(builder: Builder): EnrichmentResult
  - Query WSIB clearance certificate status
  - Extract: wsib_status ('active', 'inactive', 'unknown')
  - Provides safety/compliance signal for tradespeople
  - Cost: Free (public lookup)
```

#### Source 4: Google Custom Search (Fallback)

```
enrichFromGoogleSearch(builder: Builder): EnrichmentResult
  - Fallback when Google Places returns no match
  - Search query: "{builder.name} contractor Toronto contact"
  - Parse top results for phone numbers, email addresses, website URLs
  - Lower confidence than Places API (unstructured data)
  - Cost: $5 per 1,000 queries
```

#### Source 5: User-Contributed Contacts

```
addUserContact(builderId: number, contact: ContactInput): BuilderContact
  - Tradespeople can contribute contact info for builders
  - Stored in builder_contacts with source = 'user'
  - Verified flag set to false until confirmed by another user
  - Community-driven enrichment for gaps in automated pipeline
```

### Enrichment Orchestrator

```
enrichBuilder(builder: Builder): void
  1. Try Google Places API
     - If match found with similarity > 0.7: save results, mark source = 'google_places'
     - If no match: continue to next source
  2. Try Ontario Business Registry (if name suggests incorporated business)
     - Save business number and status if found
  3. Try WSIB safety check
     - Save wsib_status
  4. If still no phone/website: Try Google Custom Search
     - Parse and save any extracted contacts
  5. Mark builder.enriched_at = NOW()
  6. Mark builder.enrichment_source = highest priority source that matched
```

### Enrichment Scheduling

- New builders: queued for enrichment immediately on creation
- Re-enrichment: builders re-enriched every 90 days to catch updated info
- Batch processing: enrichment runs in batches of 50 with 1-second delays to respect rate limits
- Failed enrichment: retry up to 3 times with exponential backoff

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/builders/enrich.ts` | Enrichment pipeline orchestrator, Google Places/OBR/WSIB clients | Planned |
| `src/lib/builders/normalize.ts` | Name normalization, suffix stripping, dedup logic | Planned |
| `migrations/007_builders.sql` | Create builders table | Planned |
| `migrations/008_builder_contacts.sql` | Create builder_contacts table | Planned |
| `src/tests/builders.logic.test.ts` | Unit tests for normalization and enrichment | Planned |

---

## 4. Constraints & Edge Cases

- **Name collisions after normalization:** Two different builders may normalize to the same name (e.g., "Smith Construction Inc" and "Smith Construction Ltd"). Manual review queue for names that merge with conflicting contact info.
- **Google Places false matches:** The Places API may return a business with a similar but wrong name. Levenshtein similarity threshold of 0.7 mitigates this, but edge cases exist.
- **No enrichment result:** Some small builders have no online presence. These remain with null contact fields and are candidates for user-contributed data.
- **Cost management:** Google Places API costs ~$0.032/request. Budget cap of $150/month. If exceeded, queue enrichment for next billing cycle.
- **Rate limits:** Google APIs enforce rate limits. Batch processing with delays ensures compliance.
- **Stale data:** Builder phone numbers and websites change. 90-day re-enrichment cycle keeps data reasonably current.
- **Personal names as builders:** Some permits list individual names (e.g., "JOHN SMITH") rather than company names. These should still be normalized and enriched but may have lower match rates.
- **International characters:** Builder names may contain accented characters. Normalization preserves Unicode; only ASCII business suffixes are stripped.
- **Empty builder name:** Some permits have null or empty builder fields. Skip normalization and enrichment for these records.

---

## 5. Data Schema

### `builders` Table

```sql
CREATE TABLE builders (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(500) NOT NULL,
  name_normalized       VARCHAR(500) NOT NULL,
  phone                 VARCHAR(50),
  email                 VARCHAR(255),
  website               VARCHAR(500),
  google_place_id       VARCHAR(255),
  google_rating         DECIMAL(2,1),
  obr_business_number   VARCHAR(50),
  wsib_status           VARCHAR(20),           -- 'active', 'inactive', 'unknown'
  enriched_at           TIMESTAMPTZ,
  enrichment_source     VARCHAR(50),           -- 'google_places', 'google_search', 'obr', 'user'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_builders_name_normalized ON builders(name_normalized);
CREATE INDEX idx_builders_google_place_id ON builders(google_place_id);
```

### `builder_contacts` Table

```sql
CREATE TABLE builder_contacts (
  id              SERIAL PRIMARY KEY,
  builder_id      INTEGER NOT NULL REFERENCES builders(id),
  contact_type    VARCHAR(20) NOT NULL,      -- 'phone', 'email', 'website', 'address'
  contact_value   VARCHAR(500) NOT NULL,
  source          VARCHAR(50) NOT NULL,      -- 'google_places', 'google_search', 'obr', 'user'
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at     TIMESTAMPTZ,
  verified_by     INTEGER,                   -- user ID who verified
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_builder_contacts_builder ON builder_contacts(builder_id);
CREATE INDEX idx_builder_contacts_type ON builder_contacts(contact_type);
```

### TypeScript Interfaces

```typescript
interface Builder {
  id: number;
  name: string;
  nameNormalized: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  googlePlaceId: string | null;
  googleRating: number | null;
  obrBusinessNumber: string | null;
  wsibStatus: 'active' | 'inactive' | 'unknown' | null;
  enrichedAt: Date | null;
  enrichmentSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface BuilderContact {
  id: number;
  builderId: number;
  contactType: 'phone' | 'email' | 'website' | 'address';
  contactValue: string;
  source: string;
  verified: boolean;
  verifiedAt: Date | null;
  verifiedBy: number | null;
  createdAt: Date;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Data Ingestion (`02`) | Upstream | Extracts builder names from permits during sync |
| Database Schema (`01`) | Upstream | Permits table contains builder name field |
| Google Places API | External | Primary source for phone, website, rating |
| Ontario Business Registry | External | Business number verification for incorporated entities |
| WSIB | External | Safety clearance status lookup |
| Google Custom Search API | External | Fallback contact information extraction |
| Permit Detail View (`18`) | Downstream | Displays builder contact info on permit detail page |
| Tradesperson Dashboard (`15`) | Downstream | Builder info shown in lead cards |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Normalize uppercase | `"abc construction inc."` | `"ABC CONSTRUCTION"` |
| Strip INC | `"SMITH BUILDERS INC"` | `"SMITH BUILDERS"` |
| Strip LTD | `"JONES CONTRACTING LTD."` | `"JONES CONTRACTING"` |
| Strip CORP | `"MEGA BUILD CORP"` | `"MEGA BUILD"` |
| Strip CORPORATION | `"GLOBAL CONSTRUCTION CORPORATION"` | `"GLOBAL CONSTRUCTION"` |
| Strip LIMITED | `"ABC LIMITED"` | `"ABC"` |
| Collapse whitespace | `"ABC   CONSTRUCTION"` | `"ABC CONSTRUCTION"` |
| Preserve Unicode | `"RENE'S CONSTRUCTION INC"` | `"RENE'S CONSTRUCTION"` |
| Empty name | `""` | `""` (skip enrichment) |
| Null name | `null` | Skip entirely |
| Dedup match | Two permits with `"Smith Inc"` and `"SMITH INC."` | Same builder record |
| Dedup no match | `"Smith Construction"` and `"Jones Construction"` | Two separate builder records |
| Enrichment priority | Google Places returns match | Source = `google_places`, not fallback |
| Enrichment fallback | Google Places returns no match | Falls through to Google Custom Search |
| Places similarity check | Returned name similarity < 0.7 | Reject match, try next source |
| Places similarity pass | Returned name similarity > 0.7 | Accept match, save data |
| OBR only for corps | Builder name without INC/LTD/CORP | OBR step skipped |
| WSIB status | Valid builder lookup | wsib_status set to 'active' or 'inactive' |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Builder card | Permit detail shows builder name, phone, website, rating |
| Phone link | Phone number rendered as clickable `tel:` link |
| Website link | Website rendered as clickable external link |
| Google rating | Star rating displayed (e.g., 4.2 out of 5) |
| WSIB badge | Safety status shown as green (active) / red (inactive) / gray (unknown) badge |
| No contact info | Builder without enrichment shows "Contact info unavailable" |
| User contribution | "Add contact info" button available for un-enriched builders |
| Source attribution | Contact info shows source label (e.g., "via Google") |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Builders table | Migration `007` creates `builders` table with all columns |
| Builder contacts table | Migration `008` creates `builder_contacts` table |
| Unique normalized name | Duplicate `name_normalized` raises unique violation |
| Google Places API call | Enrichment sends correct search query and parses response |
| API error handling | Google Places 429/500 errors trigger retry with backoff |
| Rate limiting | Batch enrichment respects 1-second delay between batches |
| Builder-permit link | Permit record references builder by builder_id or name_normalized |
| Re-enrichment | Builders older than 90 days queued for re-enrichment |
