# Project Stakeholder Enrichment Strategy

## 1. Goal Description
To expand Buildo's lead-generation capabilities beyond just "Builders" and "Trades", we need to systematically track the people driving the projects: **Owners**, **Applicants**, and **Designers/Architects**. 

These individuals (especially Architects and serial Developers/Owners) are high-value targets. 
1. **Extraction:** We will parse these names from Committee of Adjustment (CoA) applications and Building Permits.
2. **Storage:** We will store them in a dedicated, unified database table rather than leaving them as flat text on individual permits.
3. **Enrichment:** We will use targeted web searches to discover their corporate web footprints, emails, and phone numbers.

---

## 2. Database Architecture

We must normalize this data so that if "Jane Doe Architect Inc." appears on 15 different permits across 3 years, she is represented by a single actionable profile in our system, accumulating a portfolio.

### The Unified Table: `project_stakeholders`
```sql
CREATE TYPE stakeholder_role_enum AS ENUM ('Owner', 'Applicant', 'Agent', 'Designer/Architect');

CREATE TABLE IF NOT EXISTS project_stakeholders (
    id                      SERIAL PRIMARY KEY,
    name                    VARCHAR(500) NOT NULL,
    name_normalized         VARCHAR(500) NOT NULL,
    primary_role            stakeholder_role_enum,

    -- Enriched Data (from Web Search)
    phone                   VARCHAR(50),
    email                   VARCHAR(200),
    website                 VARCHAR(500),
    linkedin_url            VARCHAR(500),
    
    -- Sync Metadata
    project_count           INTEGER NOT NULL DEFAULT 1,
    first_seen_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    enriched_at             TIMESTAMP,

    UNIQUE (name_normalized)
);

CREATE INDEX idx_stakeholders_name ON project_stakeholders (name_normalized);
```

### The Linking Table: `permit_stakeholders`
Because a single permit can have multiple stakeholders (an Owner + an Architect), we need a junction table.

```sql
CREATE TABLE IF NOT EXISTS permit_stakeholders (
    permit_num              VARCHAR(50) NOT NULL,
    revision_num            INTEGER NOT NULL,
    stakeholder_id          INTEGER NOT NULL REFERENCES project_stakeholders(id),
    role_on_project         stakeholder_role_enum NOT NULL,

    PRIMARY KEY (permit_num, revision_num, stakeholder_id)
);
```

---

## 3. Extraction & Ingestion Pipeline

### When does this happen?
This extraction must happen **synchronously** during the daily ingestion of standard permits and CoA applications.

### The Process (e.g., inside `load-coa.js` or `load-permits.js`)
1. While parsing a CoA row, look at the `applicant_name` and `owner_name` columns.
2. **Normalize:** Strip out trailing spaces, convert to a standard case, and handle basic variations.
3. **Upsert Stakeholder:** 
   * `INSERT INTO project_stakeholders (name, name_normalized, primary_role) VALUES (...) ON CONFLICT (name_normalized) DO UPDATE SET project_count = project_count + 1, last_seen_at = NOW();`
4. **Link:** Insert a record into `permit_stakeholders` linking the newly upserted ID to the permit/CoA number.

---

## 4. Web Search Enrichment Strategy (The "When" & "How")

### The "When": Asynchronous Background Queues
**Crucial Architecture Rule:** We must **NOT** perform the Google/Web Search during the daily data ingestion script. 

If we process 500 new permits a day, pausing the script to negotiate 500 web scraping RPC calls will slow the sync from 2 minutes to 30+ minutes, vastly increasing the likelihood of timeouts, memory leaks, or IP bans.

**The Solution:** The daily sync script only *upserts the names*. A separate, asynchronous background worker (e.g., node-cron running at 2:00 AM, or a continuous queue processor like BullMQ) handles the enrichment:

1. The Background Worker queries: `SELECT * FROM project_stakeholders WHERE enriched_at IS NULL LIMIT 50;`
2. It processes the searches in controlled, rate-limited batches.
3. It updates the database with the findings and sets `enriched_at = NOW()`.

### The "How": Targeted Search Queries
Because we are often dealing with individuals rather than branded corporations, the search query must be highly contextualized to avoid false positives.

**For Architects/Designers:**
1.  **Primary Search (Internal WSIB Database):** Query our local `wsib_registry` checking both the legal and trade names (e.g., `SELECT * FROM wsib_registry WHERE predominant_class = 'G' AND (legal_name_normalized = '{Name}' OR trade_name_normalized = '{Name}')`).
    *   *Why:* Many mid-to-large architectural and design firms hold WSIB coverage under the broader construction categories. If matched internally, we instantly acquire their verified corporate details.
2.  **Secondary Search (Web Search):** Query: `"{Name}" AND ("Architect" OR "Designer" OR "Studio") AND "Toronto" contact email`
    *   *Why:* If they are a sole proprietor or boutique studio without WSIB, "John Smith" is too generic. "John Smith Architect Toronto" accurately targets their professional footprint.

**For Corporate Owners/Applicants (Numbered Companies):**
1.  **Primary Search (Internal WSIB Database):** Query our local `wsib_registry` checking both the legal and trade names (e.g., `SELECT * FROM wsib_registry WHERE legal_name_normalized = '{Name}' OR trade_name_normalized = '{Name}'`).
    *   *Why:* If the holding company or developer is registered with WSIB under a trade name while submitting permits under their legal numbered company, we instantly map their verified Mailing Address and NAICS code.
2.  **Corporate De-Anonymization (OBR Extraction):** Query the Ontario Business Registry using the corporate `"{Name}"` to explicitly extract the human Principals or Directors behind the entity.
3.  **Validation & Final Enrichment (HCRA & Web Search):** Now armed with the human decision-makers, execute a triangulated search:
    *   **HCRA Validation:** Query the HCRA Directory (`https://obd.hcraontario.ca/`) using varying combinations: Builder Name (Legal or Trade) + City ("Toronto") + Principal/Director name to validate if they are legally licensed home builders and retrieve their contact info.
    *   **Web Search:** Query: `("{Name}" OR "{Trade Name}") AND "Toronto" AND "{Director Name}"` to unearth precise corporate emails and the Director's LinkedIn profile.

**For Individual Owners (Human Names):**
* Query: `"{Name}" AND ("{Property Address}" OR "Toronto") LinkedIn`
* *Why:* Individual homeowners rarely have generic contact pages. For high-net-worth custom builds (which many CoA variances represent), finding the owner's LinkedIn profile provides enough intelligence for a tailored, hyper-personalized outreach strategy.

---

## 5. Next Steps
1. Execute the DDL migrations (`project_stakeholders` and `permit_stakeholders`).
2. Modify the existing CoA and Permit parsers to extract string names into the relational tables.
3. Build the decoupled asynchronous worker (`scripts/enrich/stakeholders.js`) to process the un-enriched queue using the targeted web search queries.
