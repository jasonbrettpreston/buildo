# 12 - Committee of Adjustments Integration

**Status:** Planned
**Last Updated:** 2026-02-14
**Depends On:** `01_database_schema.md`, `02_data_ingestion.md`, `05_geocoding.md`
**Blocks:** `15_dashboard_tradesperson.md`

---

## 1. User Story

> "As a tradesperson, I want to know about Committee of Adjustment approvals because they signal imminent permit issuance."

**Acceptance Criteria:**
- Committee of Adjustment (CoA) application data is synced from Toronto Open Data daily
- CoA applications are linked to building permits by address matching
- Approved CoA applications serve as leading indicators that a permit will be issued soon
- Tradespeople can see linked CoA decisions on permit detail pages
- Linking confidence is scored to distinguish strong matches from weak ones

---

## 2. Technical Logic

### Data Source

- **Provider:** Toronto Open Data (CKAN)
- **Package ID:** `260e1356-dce6-48e2-afa0-e71d70cd6406`
- **Format:** JSON via CKAN API
- **Update frequency:** Daily (synced alongside permit data)
- **Content:** Committee of Adjustment applications including variances, consents, and minor variance decisions

### Sync Process

```
syncCoaApplications(): SyncResult
  1. Fetch data from CKAN API:
     GET https://ckan0.cf.opendata.inter.prod-p.toronto.ca/api/3/action/package_show?id=260e1356-dce6-48e2-afa0-e71d70cd6406
     - Extract resource URLs from package metadata
     - Fetch resource data (JSON format)
  2. Parse each record into CoaApplication shape
  3. Upsert by application_number (unique key)
  4. After upsert, run linkCoaToPermits() for new/updated records
  5. Return sync statistics (inserted, updated, linked, errors)
```

### Address Parsing

CoA applications contain address strings that must be parsed into components for matching.

```
parseCoaAddress(rawAddress: string): ParsedAddress
  - Extract street_num: leading numeric portion (e.g., "123" from "123 MAIN ST")
  - Extract street_name: remainder after street_num, normalized
    - Uppercase
    - Expand abbreviations: ST->STREET, AVE->AVENUE, DR->DRIVE, RD->ROAD,
      BLVD->BOULEVARD, CRES->CRESCENT, CT->COURT, PL->PLACE
    - Strip directional suffixes: N, S, E, W, NORTH, SOUTH, EAST, WEST
    - Strip unit/suite numbers: UNIT, SUITE, APT, #
  - Return { street_num, street_name, unit, raw }
```

### Permit Linking Algorithm

CoA applications are linked to building permits using a multi-factor matching approach.

```
linkCoaToPermits(coaApp: CoaApplication): LinkResult
  1. Address Match (required):
     - Parse CoA address into street_num + street_name
     - Query permits where:
       permits.street_num = coaApp.street_num AND
       permits.street_name ILIKE coaApp.street_name
     - If no address match: return { linked: false, reason: 'no_address_match' }

  2. Date Proximity Score (0.0 - 0.4):
     - Calculate days between CoA decision_date and permit issued_date
     - If within 90 days: 0.4
     - If within 180 days: 0.3
     - If within 365 days: 0.2
     - If within 730 days: 0.1
     - If > 730 days or no dates: 0.0

  3. Description Similarity Score (0.0 - 0.3):
     - Tokenize both CoA description and permit description
     - Calculate Jaccard similarity of token sets
     - Multiply by 0.3 to get score component
     - If either description is null: 0.0

  4. Decision Status Bonus (0.0 - 0.3):
     - If CoA decision = "Approved": 0.3
     - If CoA decision = "Approved with Conditions": 0.25
     - If CoA decision = "Partially Approved": 0.15
     - If CoA decision = "Refused" or "Withdrawn": 0.0

  5. Total Confidence = date_proximity + description_similarity + decision_bonus
     - Range: 0.0 to 1.0
     - Threshold for auto-link: >= 0.5
     - Below threshold: store as candidate link for manual review

  6. If multiple permits match at same address:
     - Link to permit with highest total confidence
     - Store runner-up matches as candidates
```

### Leading Indicator Logic

CoA approvals are valuable because they precede permit issuance in the Toronto development process:

1. Developer applies for CoA variance/consent
2. CoA hearing and decision
3. If approved: developer applies for building permit
4. Permit is issued

A recent CoA approval at an address where no permit exists yet signals an upcoming permit application -- this is early intelligence for tradespeople.

```
getUpcomingLeads(tradeSlug: string): CoaLead[]
  - Query CoA applications where:
    - decision = 'Approved' or 'Approved with Conditions'
    - decision_date within last 180 days
    - linked_permit_num IS NULL (no permit yet)
  - Return as "upcoming leads" -- projects likely to need permits soon
  - Flag with trade relevance based on CoA description classification
```

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/coa/sync.ts` | CKAN data fetch, parsing, upsert logic | Planned |
| `src/lib/coa/link.ts` | Address matching, confidence scoring, permit linking | Planned |
| `migrations/009_coa_applications.sql` | Create coa_applications table | Planned |
| `src/tests/coa.logic.test.ts` | Unit tests for address parsing, linking, confidence | Planned |

---

## 4. Constraints & Edge Cases

- **Address format inconsistency:** CoA addresses and permit addresses use different formats. Normalization is critical. E.g., "123 Main St W" vs "123 MAIN STREET WEST".
- **Multiple permits at same address:** Large development sites may have multiple permits. The linking algorithm scores all candidates and links to the best match.
- **No permit exists yet:** Approved CoA applications without matching permits are the most valuable -- they represent upcoming opportunities. These should be surfaced as "upcoming leads."
- **Stale CoA data:** CoA decisions older than 2 years with no linked permit are likely abandoned projects. Reduce their visibility but do not delete.
- **Ward boundaries:** CoA applications include ward numbers. This can be used as a secondary filter but is not part of the primary matching algorithm.
- **Decision types:** Not all CoA applications are approvals. "Refused" and "Withdrawn" decisions should still be stored but not surfaced as leads.
- **Duplicate applications:** The same property may have multiple CoA applications over time. Each is stored separately and linked independently.
- **CKAN API reliability:** The Toronto Open Data CKAN API may be temporarily unavailable. Sync should retry with exponential backoff (max 3 retries). Failed syncs should not overwrite existing data.
- **Address abbreviation edge cases:** "ST" could be "STREET" or "SAINT." Context-based disambiguation is needed (e.g., "ST CLAIR" is a name, "MAIN ST" is an abbreviation).
- **Null fields:** Many CoA records have incomplete data. Null decision_date, description, or applicant should be handled gracefully without breaking the linking algorithm.

---

## 5. Data Schema

### `coa_applications` Table

```sql
CREATE TABLE coa_applications (
  id                  SERIAL PRIMARY KEY,
  application_number  VARCHAR(50) NOT NULL UNIQUE,
  address             VARCHAR(500),
  street_num          VARCHAR(20),
  street_name         VARCHAR(255),
  ward                VARCHAR(50),
  status              VARCHAR(100),
  decision            VARCHAR(100),         -- 'Approved', 'Refused', 'Withdrawn', etc.
  decision_date       DATE,
  hearing_date        DATE,
  description         TEXT,
  applicant           VARCHAR(500),
  linked_permit_num   VARCHAR(50),          -- building permit number if linked
  linked_confidence   DECIMAL(3,2),         -- 0.00 to 1.00
  linked_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_coa_application_number ON coa_applications(application_number);
CREATE INDEX idx_coa_street ON coa_applications(street_num, street_name);
CREATE INDEX idx_coa_decision ON coa_applications(decision) WHERE decision IN ('Approved', 'Approved with Conditions');
CREATE INDEX idx_coa_linked_permit ON coa_applications(linked_permit_num) WHERE linked_permit_num IS NOT NULL;
CREATE INDEX idx_coa_decision_date ON coa_applications(decision_date DESC);
```

### TypeScript Interface

```typescript
interface CoaApplication {
  id: number;
  applicationNumber: string;
  address: string | null;
  streetNum: string | null;
  streetName: string | null;
  ward: string | null;
  status: string | null;
  decision: string | null;
  decisionDate: Date | null;
  hearingDate: Date | null;
  description: string | null;
  applicant: string | null;
  linkedPermitNum: string | null;
  linkedConfidence: number | null;
  linkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CoaLead {
  coaApplication: CoaApplication;
  tradeRelevance: string[];    // trade slugs relevant based on description
  estimatedPermitDate: Date;   // projected based on typical CoA-to-permit timeline
}

interface LinkResult {
  linked: boolean;
  permitNum: string | null;
  confidence: number;
  reason: string;
  candidates: Array<{ permitNum: string; confidence: number }>;
}

interface ParsedAddress {
  streetNum: string;
  streetName: string;
  unit: string | null;
  raw: string;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Toronto Open Data CKAN | External | Source data for CoA applications |
| Database Schema (`01`) | Upstream | Permits table for address-based linking |
| Data Ingestion (`02`) | Parallel | CoA sync runs alongside permit sync |
| Geocoding (`05`) | Upstream | Address normalization and geocoding for spatial matching |
| Classification Engine (`08`) | Downstream | CoA descriptions classified for trade relevance |
| Permit Detail View (`18`) | Downstream | Display linked CoA decisions on permit pages |
| Tradesperson Dashboard (`15`) | Downstream | Surface "upcoming leads" from approved CoA applications |
| Sync Scheduler (`04`) | Upstream | Daily schedule triggers CoA sync |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Address parse: standard | `"123 MAIN ST"` | `{ streetNum: "123", streetName: "MAIN STREET" }` |
| Address parse: with unit | `"456 OAK AVE UNIT 7"` | `{ streetNum: "456", streetName: "OAK AVENUE", unit: "7" }` |
| Address parse: directional | `"789 QUEEN ST W"` | `{ streetNum: "789", streetName: "QUEEN STREET" }` |
| Address parse: saint vs street | `"100 ST CLAIR AVE"` | `{ streetNum: "100", streetName: "ST CLAIR AVENUE" }` |
| Permit link: exact match | CoA at "123 MAIN ST", permit at "123 MAIN STREET" | Linked with high confidence |
| Permit link: no match | CoA at "999 NONEXISTENT RD" | `{ linked: false, reason: 'no_address_match' }` |
| Date proximity: close | CoA decision 30 days before permit issued | Date component = 0.4 |
| Date proximity: far | CoA decision 500 days before permit | Date component = 0.1 |
| Description similarity | Overlapping keywords in CoA and permit descriptions | Positive similarity score |
| Decision bonus: approved | CoA decision = "Approved" | Decision component = 0.3 |
| Decision bonus: refused | CoA decision = "Refused" | Decision component = 0.0 |
| Auto-link threshold | Total confidence >= 0.5 | Automatically linked |
| Below threshold | Total confidence < 0.5 | Stored as candidate, not auto-linked |
| Multiple permits at address | 3 permits at same address | Links to highest confidence match |
| Upcoming leads | Approved CoA, no linked permit, recent | Returned in upcoming leads query |
| Stale CoA | Approved 3 years ago, no permit | Low priority, still stored |
| Null decision_date | CoA with no decision_date | Date proximity = 0.0, no error |
| Null description | CoA with no description | Description similarity = 0.0, no error |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| CoA badge on permit | Linked permits show "CoA Approved" badge |
| CoA detail panel | Permit detail page shows linked CoA application number, decision, date |
| Upcoming leads section | Dashboard shows approved CoA applications without permits as "upcoming" |
| Confidence indicator | Link confidence shown as strong/moderate/weak visual indicator |
| CoA timeline | CoA decision date shown relative to permit issuance on timeline view |
| No CoA link | Permits without CoA links show no CoA section (not an empty state) |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| CKAN API fetch | Successful data retrieval from package `260e1356-dce6-48e2-afa0-e71d70cd6406` |
| Upsert by application_number | Duplicate application_number updates existing record |
| Address matching query | SQL query joins CoA and permits on street_num + street_name efficiently |
| Index performance | Address-based queries use `idx_coa_street` index |
| Decision index | Approved CoA queries use partial index on decision |
| Sync retry | CKAN API failure triggers retry with exponential backoff |
| Daily sync schedule | CoA sync runs daily alongside permit sync |
| Data integrity | Foreign key to permits (via linked_permit_num) is validated |
