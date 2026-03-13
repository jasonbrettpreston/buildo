# WSIB Registry Integration Strategy

## 1. Goal Description
The current live WSIB search functionality is degraded. To ensure robust builder health metrics and create a powerful outreach engine, we will ingest the **WSIB Businesses Classification Details** Open Dataset locally. 

This dataset (available monthly/annually) provides comprehensive business profiling, including Legal names, Trade names, NAICS codes, and Class/Subclass descriptors. By focusing on **Class G (Construction/Trades)**, we can:
1. Directly match "Trade names" against our existing `builders` table.
2. Accurately update the `wsib_status` for known builders without relying on real-time external scraping.
3. Use the unmapped Class G entries as a structured **Lead Generation & Outreach** database to contact trade contractors who could utilize the Buildo service.

---

## 2. Database Structure

We need a new table to hold the raw registry data and serve as the source of truth for WSIB compliance and outreach.

### New Table: `wsib_registry`
```sql
CREATE TABLE IF NOT EXISTS wsib_registry (
    id                      SERIAL PRIMARY KEY,
    legal_name              VARCHAR(500) NOT NULL,
    trade_name              VARCHAR(500),
    trade_name_normalized   VARCHAR(500), -- Stripped of punctuation/casing for matching
    legal_name_normalized   VARCHAR(500),
    mailing_address         VARCHAR(500),
    predominant_class       VARCHAR(10),  -- e.g., 'G'
    naics_code              VARCHAR(20),
    naics_description       VARCHAR(500),
    subclass                VARCHAR(50),  -- e.g., 'G1', 'G2'
    detailed_description    TEXT,
    business_size           VARCHAR(100), -- 'Small Business', 'Medium', etc.
    
    -- Link back to our established builders table
    linked_builder_id       INTEGER REFERENCES builders(id) ON DELETE SET NULL,
    matched_at              TIMESTAMP,
    
    -- Sync Metadata
    first_seen_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Essential indexes for the matching algorithm
CREATE INDEX idx_wsib_trade_norm ON wsib_registry(trade_name_normalized);
CREATE INDEX idx_wsib_legal_norm ON wsib_registry(legal_name_normalized);
CREATE INDEX idx_wsib_class ON wsib_registry(predominant_class);
```

### Modified Table: `builders`
The `builders` table currently has `wsib_status VARCHAR(50)`. This should be left as is, but populated via the matching algorithm (e.g., `'Active (Class G1)'` or `'Unregistered'`).

---

## 3. Data Pipeline Integration

The ingestion architecture is split into two distinct phases to handle historical data capture and ongoing, automated rolling updates.

### Phase 1: Initial Bulk Seeding (2025 Dataset)
* **Action:** Manually download the comprehensive 2025 "Businesses by classification" dataset from the WSIB portal.
* **Process:** Run a one-time script (`scripts/sync/wsib-bulk-seed.js`) to parse this massive CSV, immediately discarding any row not matching `Class: G`. Parse and upsert the remaining rows into the `wsib_registry`.

### Phase 2: Automated Monthly Rolling Updates
Moving forward, we will automate the extraction of new contractor registrations to keep the dataset fresh and continually feed the lead generation engine.
* **WSIB Data Portal URL Engine:** The WSIB Open Data portal exposes direct download URLs for its reports dynamically based on selected parameters (e.g., "Recently registered businesses" in the "last month" or specific extracts grouped by NAICS/Class).
* **Ingestion Step (`scripts/sync/wsib-monthly.js`):**
   * A CRON job (or API trigger) executes a programmatic `GET` request to the specific WSIB CSV Data URL structured to pull *only* new monthly registrations or specific NAICS classifications relevant to Class G trades.
   * Parse the downloaded stream in memory.
* **Upsert Step:**
   * Insert new rows into `wsib_registry`. 
   * Normalize the `Trade name` and `Legal name` upon insertion (lowercase, remove "inc", "ltd", punctuation, and whitespace padding).
   * If a record with the exact `legal_name` and `mailing_address` already exists, safely update `last_seen_at`.

---

## 4. The Matching & Validation Algorithm

Once the registry is populated, a secondary classification script (`scripts/classify/match-wsib.js`) runs to link the datasets. Because generic builder names (like "Smith Construction") exist across Ontario, we must validate that the WSIB entity is actually the same builder pulling permits in Toronto.

### Step 1: Initial Name Matching (The Shortlist)
* Query `wsib_registry` where `linked_builder_id IS NULL AND predominant_class = 'G'`.
* Attempt an inner join against `builders.name_normalized` using **both** `wsib_registry.trade_name_normalized` and `wsib_registry.legal_name_normalized`.
* **Action:** Do *not* instantly commit the link yet. Mark this as a `pending_link`.

### Step 2: Triangulated Corporate Validation (The New Approach)
To validate the `pending_link`, we execute the new triangulation strategy to ensure this entity actually operates in Toronto and is a legitimate construction firm.
1. **Corporate De-Anonymization (OBR):** Query the Ontario Business Registry (Corporate Search) using the WSIB Legal Name to extract the verified Principal/Director names.
2. **Triangulated Validation Search:** Execute a highly specific validation search utilizing the extracted director and the City of Toronto.
   * **HCRA Validation:** Query the Home Construction Regulatory Authority Directory searching combinations of the `Builder Name (try both Legal and Trade)` AND `"Toronto"` AND the `Principal/Director names`. 
   * **Web Search Extrapolation:** Execute a programmatic web query: `("{Trade Name}" OR "{Legal Name}") AND "Toronto" AND "{Director Name}"`.
3. **The Proof Decision:** If the Triangulated Search confirms the entity operates in Toronto (or matches contact info known to the platform), the link is validated!
   * **Action:** `UPDATE wsib_registry SET linked_builder_id = builders.id` and `UPDATE builders SET wsib_status = 'Registered (Class ' || subclass || ')'`.

### Step 3: Shift in Builder Enrichment Strategy (Web Search Primary)
Historically, when a new builder was identified, the system immediately queried Google Places to find their phone number, website, and rating. **This architecture must now change.** 

When a builder is successfully matched to the WSIB registry and validated via Step 2, we inherit highly accurate, government-verified data: their **Legal Name**, **Trade Name**, exact **Mailing Address**, and the newly extracted **Director Names**.

**The new enrichment pipeline for Validated Builders:**
1. **Direct Data Extraction:** Because Step 2 (Triangulated Validation Search) already executed the HCRA and Web Searches to validate the entity, we simply parse the resulting HTTP responses from those exact validation queries to extract their contact profiles.
   
   **Target Extraction Data Points:**
   *   **Core Contact:** Corporate Email, Phone Number, and Website.
   *   **Social & Portfolios:** Instagram, Facebook, or Houzz profiles (many modern trades use IG as their primary portfolio over a website).
   *   **Professional Network:** LinkedIn profiles (Company page or Founder page).
   *   **Service Area / Geography:** Specific cities or regions they claim to serve on their website (e.g., "Serving the GTA").
   *   **Granular Specializations:** Extracting specific services mentioned on their site to augment the broad WSIB subclass.

2. **Tertiary Enrichment (Google Places Fallback):** Only if the direct web search fails to confidently extract a phone number and website, or if we still require Google Review Ratings, will the system fall back to the existing Google Places API lookup.

### Step 4: The Outreach Engine (Lead Generation)
Any row remaining in `wsib_registry` where `predominant_class = 'G'` and `linked_builder_id IS NULL` represents a licensed trade contractor operating in Ontario who **has not appeared on a permit in our immediate dataset**. 
* These are premium leads. 
* We have their Mailing Address, Business Size, and exact Subclass (e.g., HVAC vs Framing). 
* These can be surfaced in a new internal "Outreach" dashboard for the sales team to contact.
* **Proactive Enrichment:** The same direct web search strategy (Step 3) will be applied to these unlinked leads to autonomously harvest their emails and phone numbers *before* sales outreach begins.

---

## 5. UI Updates: Data Quality Dashboard

The new dataset must be integrated into the Enterprise Data Quality Dashboard (`/admin/data-quality`) to ensure full observability.

**1. The Hub and Spoke Architecture:**
* Add a new visual Spoke pointing into the `Builders` circle, originating from a new `WSIB Open Data` circle.
* This represents that WSIB data feeds *into* the enrichment of Builders.

**2. DataSourceCircle Metrics:**
* The WSIB node will display:
  * **Total Records:** (Count of Class G entries).
  * **Linked:** (Count where `linked_builder_id IS NOT NULL`).
  * **Unmapped/Lead Pool:** (Count where `linked_builder_id IS NULL`). This explicit naming transforms a "Data Failure" metric into a "Sales Opportunity" metric.

**3. Freshness Timeline:**
* Add the `WSIB Registry Sync` as a distinct node on the execution timeline alongside Open Data and CoA.
* Track its `duration_ms` and `started_at` to monitor if the parsing of the massive CSV slows down the Next.js server.

---

## 6. Data Quality & Schema Protocols

To ensure the new `wsib_registry` aligns with the platform's "Best in Class" Enterprise Data Architecture, we must enforce the Continuous Quality Assurance (CQA) strategy throughout its lifecycle.

### Tier 1: Schema & Drift Validation (Pre-Ingestion)
Before the monthly CSV parser (`wsib-monthly.js`) merges data, it must defensively assert the incoming file structure:
* **Column Validation:** If the Open Data portal suddenly drops or renames the `Trade name` or `Mailing Address` columns, the script must throw an error and abort the sync, flagging a "Schema Drift Alert" on the admin dashboard rather than blindly inserting nulls.
* **Type Coercion:** Assert that `naics_code` strictly contains numeric strings to prevent anomalous text from poisoning the registry.

### Tier 2: Chemical Data Quality Testing (Post-Ingestion)
After the monthly sync, the pipeline orchestrator must run `assert-data-bounds` queries to verify the health of the new data before unleashing the matching algorithm:
* **Completeness Thresholds:** Assert that `SELECT count(*) FROM wsib_registry WHERE trade_name IS NULL AND legal_name IS NULL` is strictly 0. A business must have at least one name to be legally actionable.
* **Class Constraints:** Assert that `SELECT count(*) FROM wsib_registry WHERE predominant_class != 'G'` is strictly 0. If this fails, our pre-ingestion filter logic is broken and non-construction businesses are leaking into the database.
* **Referential Audits:** Assert that `linked_builder_id` only points to active builder profiles.

### Tier 3: Architecture Constraints
* **Indexing:** The schema specifically mandates `CREATE INDEX idx_wsib_trade_norm` and `idx_wsib_legal_norm`. These are not optional; attempting to run the exact string-matching `INNER JOIN` algorithm across hundreds of thousands of rows without them will cause massive database locks.
* **Enum Safety:** Long-term, the `subclass` and `business_size` strings should be evaluated for conversion to strict PostgreSQL `ENUM` types to prevent unstructured data fragmentation.
