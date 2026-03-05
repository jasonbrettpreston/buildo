# Corporate Identity Hub Strategy

## 1. The Current State: Fragmented Identities
Currently, Buildo manages contact data and corporate identities across three fragmented silos:
1. **The `builders` Table:** Created initially to track the `builder_name` found on Building Permits. Enriched via Google Places.
2. **The `project_stakeholders` Table:** Created recently to track Owners, Applicants, and Architects parsed from CoA applications and Permits. Enriched via Web Search / LinkedIn.
3. **The `wsib_registry` Table:** Created to hold the raw provincial licensing data, acting as a standalone lookup pool.

### The Problem
If "XYZ Construction Ltd." applies for a Committee of Adjustment variance as an *Applicant*, pulls a Building Permit as a *Builder*, and is registered with the province as a *WSIB Class G Trade*, they currently exist in our system as **three separate database rows** across **three separate tables**.

Because they are fragmented, the enrichment process (scraping emails and phones) fires three separate times, wasting money and api limits. More importantly, the sales team cannot easily see the combined value ("portfolio") of this entity.

---

## 2. Evaluation via Enterprise Pipeline Rubric

If we measure this fragmented reality against our standard Enterprise Database Rubric:

*   **Normalization & Types (Score: D):** Highly denormalized. The concept of an "Email Address" or "Phone Number" exists in both `builders` and `project_stakeholders`, creating massive redundancy and schema drift if we want to add a `secondary_email` column.
*   **Indexing & Query Performance (Score: F):** If a user searches for "Smith", the backend must execute three separate queries across three distinct tables, merge them in memory, and sort them.
*   **Referential Integrity (Score: C):** While tables link back to Permits, they do not inherently link to *each other*, meaning an Architect who is also a Builder exists in parallel universes.
*   **Observability & Metadata (Score: C):** Each table manages its own `enriched_at` status, meaning the background workers might attempt to enrich the exact same company twice simultaneously.

---

## 3. The New Architecture: The Corporate Identity Hub (`entities`)

To achieve a **Score of A+** across the rubric, we must transition to a centralized master data management architecture. 

We will deprecate the standalone `builders` and `project_stakeholders` tables in favor of a singular `entities` table that acts as the absolute source of truth for *every* human or corporation the system interacts with.

### The Core Schema: `entities`
```sql
CREATE TYPE entity_type_enum AS ENUM ('Corporation', 'Individual');

CREATE TABLE IF NOT EXISTS entities (
    id                      SERIAL PRIMARY KEY,
    legal_name              VARCHAR(500) NOT NULL,
    trade_name              VARCHAR(500),
    name_normalized         VARCHAR(750) NOT NULL UNIQUE, -- For universal deduplication
    entity_type             entity_type_enum,
    
    -- Universal Contact Data (One source of truth)
    primary_phone           VARCHAR(50),
    primary_email           VARCHAR(200),
    website                 VARCHAR(500),
    linkedin_url            VARCHAR(500),
    
    -- Regulatory Flags (Inherited from linkages)
    is_wsib_registered      BOOLEAN DEFAULT false,
    is_hcra_licensed        BOOLEAN DEFAULT false,

    -- System Metadata
    first_seen_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    last_enriched_at        TIMESTAMP
);

CREATE INDEX idx_entities_name_norm ON entities(name_normalized);
```

---

## 4. The Junction Tables (The Portfolio Architecture)

Instead of the `entities` table declaring "I am a Builder", it simply exists. Its "Role" is defined by its relationship to the project via heavily-audited junction tables.

### A. The Project Lifecycle Junction (`entity_projects`)
This replaces `permit_stakeholders` and the `builder_id` column on permits.
```sql
CREATE TYPE project_role_enum AS ENUM ('Builder', 'Architect', 'Applicant', 'Owner', 'Agent', 'Engineer', 'Contractor');

CREATE TABLE IF NOT EXISTS entity_projects (
    entity_id               INTEGER REFERENCES entities(id),
    permit_num              VARCHAR(50),      -- The Building Permit
    coa_file_num            VARCHAR(50),      -- The CoA Application
    role                    project_role_enum NOT NULL,
    
    -- Metadata
    observed_at             TIMESTAMP DEFAULT NOW(),
    
    -- Constraint: An entity can only have one defining role per permit (but can be multiple things across different permits)
    UNIQUE(entity_id, permit_num, role),
    UNIQUE(entity_id, coa_file_num, role)
);
```
**Why this is Best in Class (A+):** "XYZ Construction Ltd" (ID 5) now has one single row in `entities`. But in `entity_projects`, it has 14 rows where `role = Builder` and 2 rows where `role = Applicant`. The database naturally computes their entire portfolio without redundancy!

### B. The Regulatory Junctions
Instead of copying WSIB data into the `builders` table, the `entities` table simply links directly to the raw, immutable datasets.
```sql
-- Link to the raw WSIB open dataset
ALTER TABLE wsib_registry ADD COLUMN linked_entity_id INTEGER REFERENCES entities(id);

-- Link to the raw HCRA/Tarion scraper results
CREATE TABLE hcra_licenses (
    license_number          VARCHAR(50) PRIMARY KEY,
    linked_entity_id        INTEGER REFERENCES entities(id),
    ...
);
```

---

## 5. Proactive Marketing & "Untethered" Contractors

The second massive benefit of the Identity Hub is that it natively supports our **Outreach & Lead Generation Pipeline**.

Currently, Buildo identifies sales leads via `wsib_registry` (Class G Target Pool). In the legacy fragmented architecture, these companies sat in a silo separate from `builders` until they eventually won a permit.

### The New Lead Workflow: Stacking the `entities` Table
If the sales team wants to target 5,000 WSIB Electricians *before* they ever appear on a building permit:

1. **Ingestion (The Seed):** We run a script to `INSERT INTO entities` natively pulling from the `wsib_registry` target pool. 
2. **Untethered State:** These 5,000 Electricians now exist in `entities` (with their official name), but they have **zero rows** in the `entity_projects` junction table. They are "untethered" leads.
3. **The Enrichment Waterfall:** Exactly like a Builder or Architect, the Asynchronous Queue sees 5,000 new `entities` with `last_enriched_at IS NULL`. It systematically scrapes the web, extracts their emails and phones, and saves it to the row.
4. **Marketing Activation:** The sales team queries `SELECT * FROM entities WHERE id NOT IN (SELECT entity_id FROM entity_projects)` to instantly pull a crisp, fully enriched list of contractors who have *not yet* pulled a permit through Buildo, ready for an email campaign.

If that Contractor responds to a marketing email, buys Buildo, and pulls a permit the next week? The permit parser detects their name, simply inserts a row into `entity_projects` linking them to the permit as `role: Contractor`, and their entity flawlessly transitions from an "untethered lead" to an "active project stakeholder" without duplicating a single byte of data.

---

## 6. Centralized Enrichment (The "Once and Done" Worker)

Because all contact logic is centralized in `entities`, the Asynchronous Background Worker architecture becomes infinitely more efficient. Furthermore, to support the new **Data Quality Enrichment Funnel Dashboard**, this unified worker must explicitly track its multi-step execution yield.

1. **The Trigger:** The worker selects an un-enriched batch: `SELECT id, name_normalized FROM entities WHERE last_enriched_at IS NULL LIMIT 500`.
2. **The Waterfall:**
   * It checks if `wsib_registry.linked_entity_id = entities.id` to instantly inherit a verified mailing address and NAICS code.
   * It checks OBR for Directors.
   * It executes the Triangulated HCRA/Web search.
3. **The Result:** It saves the Phone, Email, and LinkedIn directly back to `entities`. 

### The `records_meta` Analytics Requirement
Crucially, as the worker executes to completion, it must aggregate a JSON payload summarizing the exact drop-offs of its multi-step waterfall and write that payload to the `pipeline_runs` table. 

This is what ultimately powers the `[View Last Run]` toggle on the Data Quality Dashboard:

```json
{
  "processed": 500,
  "step_1_wsib_instant_matches": 150,
  "step_2_obr_directors_found": 80,
  "step_3_serp_websites_found": 310,
  "extracted_fields": {
    "phone": 405,      // Yielded from any step
    "email": 280,      // Yielded from any step
    "linkedin": 190
  }
}
```

**The Enterprise Benefit:** 
1. The company is enriched exactly *once*, completely agnostic of whether it was discovered initially as a Builder or an Architect. That data immediately becomes available across their entire portfolio inside `entity_projects`.
2. The Dashboard instantly visualizes the funnel health: If `step_3_serp_websites_found` hits 0, the engineer knows the Google Custom Search API failed, independent of the email-scraping regex.

## 6. The WSIB Interaction (How the Hub uses external Registries)

It is crucial to understand the architectural difference between `entities` and the `wsib_registry` table. They do *not* serve the same purpose and are not redundant.

*   **`wsib_registry` (The Reference Library):** This table holds all 121,000 WSIB records exactly as the province published them. It is a read-only, authoritative baseline.
*   **`entities` (Our CRM Hub):** This table only holds the companies *we actually care about* (i.e., those that have pulled permits or applied for CoAs).

### The Interaction Flow:
1.  **Ingestion & Local Search:** Tomorrow, "ABC Roofing" pulls a permit. The ingestion script inserts `ABC Roofing` into our `entities` table immediately (so they exist in our Hub).
2.  **The Enrichment Waterfall (Step 1):** That night, our worker looks at the new `ABC Roofing` entity. The very first question it asks is: *"Is this entity in our WSIB reference library?"*
3.  **The Database Link:** It executes a fast local SQL match between `entities.name_normalized` and `wsib_registry.name_normalized`. 
4.  **The Inheritance:** If it matches, the worker simply updates the `wsib_registry` row by setting `linked_entity_id = [ABC Roofing's Hub ID]`.
    *   Instantly, "ABC Roofing" in our Hub inherits the WSIB mailing address, NAICS class, and verification badge without making a single external web request.
    *   If it does *not* match the local WSIB library, the worker then proceeds to scrape the internet.

This architecture treats WSIB like a massive, free, offline encyclopedia that our Hub consults before spending money searching the live internet.

---

## 7. Pipeline Impact Analysis

Moving from a fragmented multi-table structure (`builders`, `project_stakeholders`) to a unified `entities` and `entity_projects` architecture fundamentally recycles how the Buildo data pipelines operate. 

The following systems will require refactoring during implementation:

### 1. The Ingestion Pipelines (`load-permits.ts` & `load-coa.ts`)
*   **Current State:** `load-permits` does a simple `INSERT INTO builders (name)` if it sees a builder name, and then writes the permit row with that string.
*   **New State:** When ingesting a permit or a CoA, the script must first `UPSERT` the recognized entity name into the master `entities` table (retrieving the `entity_id`). It then creates the linkage in the `entity_projects` junction table (e.g., `role: Builder` for permits, `role: Applicant` for CoAs).
*   **Impact:** This adds a minor transactional complexity during parsing, but ensures 100% referential integrity at the moment of ingestion.

### 2. The Enrichment Worker Queue
*   **Current State:** Two separate scraping/enrichment scripts exist (one iterating over `builders`, another theoretically needed for `project_stakeholders`).
*   **New State:** The worker becomes entirely agnostic of the entity's "source". It simply runs: `SELECT * FROM entities WHERE last_enriched_at IS NULL`. 
*   **Impact:** Massive efficiency gain. We drop the duplicate logic and create a single robust "Waterfall Engine" in `/scripts/enrich/entities.ts`. API costs (Google Places/SERP) will plummet because we only scrape an entity once, regardless of how many permits or CoAs they appear on.

### 3. Data Quality Snapshots (`metrics.ts`)
*   **Current State:** `metrics.ts` queries `SELECT COUNT(*) FROM builders WHERE email IS NOT NULL` to track completion.
*   **New State:** The snapshot scripts will need to pivot their logic. To find "How many builders have emails?", the query becomes: 
    *   `SELECT COUNT(DISTINCT e.id) FROM entities e JOIN entity_projects ep ON e.id = ep.entity_id WHERE ep.role = 'Builder' AND e.primary_email IS NOT NULL;`
*   **Impact:** The queries are slightly more complex (requiring JOINs), but the mathematical accuracy is perfect. We can also now easily generate new CQA metrics like "How many Architects are missing website data?" instantly.

### 4. Application UI & API (`/api/permits/`)
*   **Current State:** The backend API `SELECT` returns `permits.builder_name`. Or it returns `coa.applicant_name`.
*   **New State:** The backend must aggregate the `entity_projects` array and attach it to the DTO payload. 
    *   Example Response: `stakeholders: [{ name: "XYZ Corp", role: "Builder", phone: "..." }, { name: "Jane Doe", role: "Applicant", phone: "..." }]`.
*   **Impact:** UI components (like `PermitDetail.tsx`) must be updated to iterate over a generic `stakeholders` array rather than looking for a hardcoded `builder_name` scalar property.

### 5. Data Quality Dashboard (The "Enrichment Funnel" Integration)
*   **Current State:** The Data Quality Dashboard has a row specifically called "Builder Profiles" that measures how many *Permits* have an attached Builder.
*   **New State:** The Funnel UI must adapt to the unified Identity Hub concept. It will transition from tracking just "Builder Profiles" to tracking **"Project Stakeholders"** globally.
*   **Impact on the Funnel Row (Zone 3 & 4):**
    *   **Zone 2 (Target Pool):** Changes from `Total Permits` to `Total Distinct Entities` (e.g., "We have 15,000 unique human/corporate identities across all permits and CoAs").
    *   **Zone 3 (Intersection):** Instead of showing "Match Rate against Permits", it shows the true enrichment success of the `entities` table: e.g., "We successfully scraped 14,200 out of 15,000 Entities."
    *   **Sub-Tiers by Role:** The dropdown explicitly breaks down the entities by their `entity_projects` roles (e.g., `4,000 Builders`, `3,500 Architects`, `7,500 Applicants`).
    *   **The Increment Toggle:** When the user clicks `[View Last Run]`, they will see exactly how many *Entities* the centralized worker processed today, and the multi-step yield of contact data (Emails, Phones, LinkedIn URLs) generated for that unified subset.

---

## 7. Migration Path
To transition Buildo to this architecture without breaking the live app:
1. **Execute DDL:** Create `entities` and `entity_projects`.
2. **Data Migration Pipeline:** 
   * `INSERT INTO entities SELECT ... FROM builders`.
   * `INSERT INTO entities SELECT ... FROM project_stakeholders ON CONFLICT DO UPDATE...`
   * Backfill the `entity_projects` linking table by iterating through all historical permits and CoAs.
3. **Deprecate Legacy Columns:** Once the APIs are repointed to query the new Hub via `JOIN`, gracefully drop the `builders` table, the `project_stakeholders` table, and the hardcoded `builder_name`/`builder_id` columns from the `permits` table.
