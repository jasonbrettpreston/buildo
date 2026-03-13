# Corporate Identity Pipeline Evaluation

**Date:** March 2026
**Target:** Pipeline Separation (Permits vs. Corporate Entities Enrichment)

## Executive Summary
You are **100% correct** in your intuition. Currently, the system mixes fast, local database ingestion with slow, fragile, expensive external API web scraping. 

By separating the fast ingestion from the slow web scraping, we achieve a much faster, more resilient architecture. Based on your added feedback regarding Inspections and CoA documents, we need to move to a **4-Pillar Pipeline Architecture**.

---

## 🏗️ 1. The Current State (Why it needs to change)
If we look at `scripts/run-chain.js`, the current `permits` chain executes the following steps in order:
1. `permits` (Ingest CSV)
2. `classify_permits` (Fast local algorithm)
3. `builders` (`extract-builders.js` - Inserts entities)
4. `link_wsib` (Fast local SQL matching)
5. **`enrich_wsib_builders` (Heavy web scraping via Serper API)**
6. **`enrich_named_builders` (Heavy web scraping via Serper API)**
7. `geocode` / `link_parcels`

**The Problem:** Steps 5 and 6 take a huge amount of time, are subject to external API rate limits, and can fail due to network timeouts. If Serper API goes down, the entire `permits` pipeline halts, meaning you fail to link parcels or CoA data simply because a web scraper failed.

## 🚀 2. The Solution: The 4-Pillar Pipeline Architecture

We must split the monolithic chains into **Fast Ingestion Pipelines** and **Slow Scraping/Enrichment Pipelines**. 

### Pillar 1: The Fast Permits & CoA Pipelines (Local)
*Goal: Ingest raw government CSVs and map them to identities instantly using only data we already have.*

1. **Ingest Raw Data:** `load-permits` and `load-coa`.
2. **Extract Entities:** Extract names from the data, `UPSERT` into the `entities` table, and create a linkage in `entity_projects` (so the permit/CoA is tethered to the identity).
3. **Link Local Identity Libraries:** Run `link-wsib` instantly. Since the massive WSIB library sits in our own Postgres database, this is an instantaneous local SQL match. High-confidence WSIB entities instantly inherit their NAICS classes and verified addresses.

*Result:* The core ingestion pipeline completes in seconds. The permit/CoA is fully loaded, classified, and attached to a corporate identity.

### Pillar 2: Corporate Entities Enrichment (Slow Serper Scraping)
*Goal: Systematically enrich identities that are missing contact data.*

A totally separate, scheduled chain in `run-chain.js` (e.g., `chain_entities_enrich`).
1. **Web Scrape Entities:** Runs `SELECT * FROM entities WHERE last_enriched_at IS NULL`. Makes explicit, expensive Serper API calls to find emails, phones, and websites for new builders/applicants without blocking the core system.

### Pillar 3: Permit Inspections Scraping (Slow Playwright Scraping)
*Goal: Retrieve dynamic inspection stages (Framing, Plumbing) for active residential permits.*

A completely separate asynchronous worker queue (e.g., BullMQ) or scheduled chain (`chain_inspections`).
1. **The Target Pool:** Grabs all active residential permits from the database that haven't had their inspections checked recently (e.g., in the last 7 days).
2. **Execution:** Uses residential proxies and headless Playwright to crawl the City's Application Status portal.
3. **Linkage:** Parses the HTML table and inserts the stages into a `permit_inspections` table, natively linking back to the permit via `permit_num`.

### Pillar 4: CoA Document Retrieval (Slow Playwright Scraping)
*Goal: Download Committee of Adjustment plans, letters, and decisions.*

A separate asynchronous worker queue (`chain_coa_docs`).
1. **The Target Pool:** Grabs all recently ingested CoA applications that are missing document payloads.
2. **Execution:** Uses proxies/Playwright to crawl the AIC portal for architectural plans and decision PDFs.
3. **Extraction & Linkage:** Links the external document URLs to the CoA `file_num`. 
   * *(Future state: We can run OCR on these downloaded PDFs to extract even more Corporate Entities—like Architects, Planners, and Agents—and feed them back into the `entities` Hub from Pillar 1!)*

## 🤝 3. Addressing Your Question on "Fallback" Logic
You asked: *"we just want to link the existing corporate identities and or the WSIB - link as a second step if the corporate identies fail. Is this correct?"*

Yes, the logic flow handles this elegantly:
1. **Permit Ingestion:** Sees "ABC Roofing" on a permit.
2. **Local Hub Match:** Does "ABC Roofing" already exist in our `entities` table? 
   - *If YES:* Instantly link the permit to that existing ID. (It already has contact info from past enrichment).
   - *If NO:* Insert "ABC Roofing" into `entities` as a new row.
3. **WSIB Fallback:** For the newly created `ABC Roofing` row, ask: Can we find this exact name in our offline `wsib_registry` table?
   - *If YES:* Instantly link them. We get their verified address.
4. **The Scraping Backstop:** Finally, the nightly Corporate Entities pipeline wakes up, sees the new unenriched `ABC Roofing` row, and scrapes Google to find their phone number.

## ⏱️ 4. Orchestration & Execution Schedule

You asked: *"When and how should they run? The source data updates should run last - but the inspections, COA basic, COA deep are ongoing."*

Here is the exact dependency graph and recommended chronological schedule. 

### A Note on "Source Data"
You mentioned Source Data should run last. From a *frequency* perspective, this is true: `chain_sources` (Parcels, Massing, Address Points, raw WSIB dataset) changes extremely rarely. It should only run **Quarterly**. 
However, from a *dependency* perspective, Source Data is the foundation. A permit cannot successfully link to a Parcel if the Parcel doesn't exist yet. Therefore, the foundational reference data must exist in the database *before* the daily pipelines run.

### The Recommended Daily Pipeline Sequence

**1. The Trigger Phase (Fast Core - 2:00 AM)**
*   **Pipeline:** Core Permits (`chain_permits`) & Core CoA (`chain_coa`).
*   **Frequency:** Daily (or Hourly, if the City updates that often).
*   **Action:** Ingests the raw CSVs, extracts the minimal entity names into the Hub, and attempts local `link-wsib` matches. 
*   **Why here?:** We do this first because the presence of *new* permits or CoAs is what triggers the need for all the downstream scraping tasks.

**2. The Enrichment Phase (Serper API - 3:00 AM)**
*   **Pipeline:** Corporate Entities Enrichment.
*   **Frequency:** Daily (Running immediately after the Fast Core).
*   **Action:** Now that the fast core has safely ingested all the new data and created the bare `entities` rows, this queue wakes up, isolates only the *newly added* builders/applicants, and hits the Serper API for contact info.

**3. The Ongoing Deep Scrape Phase (Playwright - Continuous)**
*   **Pipelines:** Inspections Scraping & CoA Document Retrieval.
*   **Frequency:** Continuous Asynchronous Queue (BullMQ) running 24/7, or a massive batch job at 4:00 AM.
*   **Action:** 
    *   **Inspections:** The system looks at *all* Open/Active building permits (not just the ones ingested today) and queues them if they haven't been checked in 7 days. Playwright workers slowly crawl the portal all day long.
    *   **CoA Deep:** The system looks at all CoA applications that are missing documents or have an upcoming hearing date, and queues them up for Playwright to download the PDFs.
*   **Why Continuous?:** Because these are "headless browser" scrapers, they must run slowly to avoid IP bans. By decoupling them onto an asynchronous queue, 2 or 3 worker proxies can just slowly churn through the backlog all day long without blocking your Buildo UI or core database processes.

**4. The Foundational Data Sources Updates (FTP/API - Periodic)**
*   **Pipeline:** Core Sources (`chain_sources`).
*   **Frequency:** Quarterly / Annually.
*   **Action:** Downloads the massive, slow-moving external datasets: Toronto Address Points, Toronto Parcels, 3D Massing models, Neighbourhood Boundaries, and the full WSIB Ontario registry snapshot. 
*   **Why Here?:** These datasets are the foundational bedrock. While they execute the least frequently, nothing upstream works without them.

## 🗂️ 5. Admin Panel UI & Pipeline Layout
To reflect this architecture properly in the Admin Panel (`src/app/admin/page.tsx` and `FreshnessTimeline.tsx`), the pipelines should be laid out visually to reflect this **Dependency Hierarchy**, rather than alphabetically.

Here is the exact visual order you should render the UI blocks, mapping directly to the specific execution steps in `run-chain.js` and expanding on the current UI:

### Group 1: Foundation (Periodic Updates)
*UI Block: **SOURCE DATA UPDATES** (Quarterly/Annual - reference data refreshes)*
This chain must run first as it provides the bedrock for all spatial and identity linking.
1. `assert_schema` (Schema Validation)
2. `address_points` (Address Points)
3. `geocode_permits` (Geocode Permits)
4. `parcels` (Parcels)
5. `compute_centroids` (Compute Centroids)
6. `link_parcels` (Link Parcels)
7. `massing` (3D Massing)
8. `link_massing` (Link Massing)
9. `neighbourhoods` (Neighbourhoods)
10. `link_neighbourhoods` (Link Neighbourhoods)
11. `load_wsib` (Load WSIB Registry)
12. `link_wsib` (Link WSIB)
13. `refresh_snapshot` (Refresh Snapshot)
14. `assert_data_bounds` (Data Quality Checks)

### Group 2: Core Ingestion (Fast Daily Updates)
*UI Block: **PERMITS PIPELINE** (Daily - when building permits are loaded)*
*(Note: Only two changes from the current architecture. The two slow enrichment scripts are removed.)*
1. `assert_schema` (Schema Validation)
2. `permits` (Building Permits)
3. `classify_scope_class` (Scope Class)
4. `classify_scope_tags` (Scope Tags)
5. `classify_permits` (Classify Trades)
6. `builders` (Extract Corporate Entities)
    - `link_wsib` (Link WSIB — *Runs ONLY if the raw name isn't already linked to a Corporate Entity in Step 6*)
7. `geocode_permits` (Geocode Permits)
8. `link_parcels` (Link Parcels)
9. `link_neighbourhoods` (Link Neighbourhoods)
10. `link_massing` (Link Massing)
11. `link_similar` (Link Similar Permits)
12. `link_coa` (Link CoA)
13. `refresh_snapshot` (Refresh Snapshot)
14. `assert_data_bounds` (Data Quality Checks)

*UI Block: **COA PIPELINE** (Daily - when Committee of Adjustment data is loaded)*
*(Note: Zero changes required to this existing pipeline.)*
1. `assert_schema` (Schema Validation)
2. `coa` (CoA Applications)
3. `link_coa` (Link CoA)
4. `create_pre_permits` (Create Pre-Permits)
5. `refresh_snapshot` (Refresh Snapshot)
6. `assert_data_bounds` (Data Quality Checks)

### Group 3: Corporate Entities Enrichment (Slow Daily Scrapes)
*UI Block: **CORPORATE ENTITIES PIPELINE** (Daily - missing contact enrichment)*
*(This is the newly extracted, isolated scraping chain)*
1. `enrich_wsib_builders` (Enrich WSIB-Matched)
2. `enrich_named_builders` (Enrich Web Entities)

### Group 4: Deep Scrapes & Documents (Continuous)
*UI Block: **DEEP SCRAPES PIPELINE** (Continuous Asynchronous Workers)*
*(These run in the background via BullMQ/cron and update specific records)*
1. `permit_inspections` (Crawl Permit Application Status)
2. `coa_documents` (Download AIC Documents)

## 🛠️ Recommended Action Items
The beauty of this 4-Pillar architecture is that it relies almost entirely on your existing stable code. To execute this, we only need to make very specific changes:

1. **Update `run-chain.js` (The Permits Pipeline):** 
   - We only make **two** changes here: Remove `enrich_wsib_builders` and `enrich_named_builders` from the `permits` chain array entirely.
   - We leave the CoA chain and the Sources chain completely untouched. They are already perfect.
2. **Update `run-chain.js` (The New Chains):** 
   - Create the new `entities` chain in the orchestrator containing the removed enrichment scripts. 
   - Register the conceptual `chain_inspections` and `chain_coa_docs` triggers.
3. **Update Admin Specs & UI:** Update `docs/specs/26_admin.md` and the `FreshnessTimeline.tsx` UI to group the pipeline cards into these 4 robust pillars based on dependencies. Ensure the `link_wsib` toggle renders as an indented child toggle under Extract Entities.

## 📊 6. Evaluating the Enrichment Funnel Integration

### The Concept
You asked: *"I'm wondering whether we should move them [Enrichment Funnel metrics] under each pipeline and also each step in the pipeline should have this information."*

Currently, the system treats **Pipeline Status** (Did the script run and not crash?) and the **Enrichment Funnel** (What was the data yield and match rate?) as two separate UI concepts on different pages. Your intuition to merge them is a massive upgrade to the administrative UX. 

### The Benefits
By injecting the funnel metrics directly into the pipeline steps, we achieve:
1. **Immediate Feedback Loop:** Instead of running the `builders` step and then navigating to a separate Data Quality page to see if it actually extracted anything, the admin sees the yield directly beneath the green "Success" dot of the pipeline step itself.
2. **Contextual Debugging:** If the `link_wsib` step passes successfully (green dot) but the visual yield says "0% Matched", the admin instantly knows the data relationship is broken, even though the Node.js script technically "succeeded."

### Proposed UI Strategy
To achieve this, we can take the Zone 1-4 metrics currently built for the funnel, and render them as an expandable **Accordion / Drawer** beneath the pipeline step toggle. 

A high-level summary chip will be visible by default, and if an admin wants to investigate a drop-off, they simply expand the row to see the full, rich Funnel data exactly as it looks today.

Expanding on your Group 2 UI Layout, it would look like this:

**PERMITS PIPELINE**
* `1. Schema Validation` [ Run ] [ Toggle ]
  * ↳ *Status:* 🟢 Success (3 mins ago)
  * ↳ *Summary:* 10,400 Records Validated
  * `[+] Deep Dive (Expandable Accordion)` 
    * *(When clicked, this expands to show the full Data Quality Funnel row for schema logic, including null violation thresholds and tier data).*
* *(...)*
* `6. Extract Corporate Entities` [ Run ] [ Toggle ]
  * ↳ *Status:* 🟢 Success (2 mins ago)
  * ↳ *Summary:* 1,204 Entities Extracted | 40 Null Values
  * `[+] Deep Dive (Expandable Accordion)`
    * *(When clicked, this expands to show the full 4-Zone Enrichment Funnel row for the `builders` process, showing raw dataset size, intersection logic, and exact extracted field distributions).*
    * `link_wsib` [ Run ] [ Toggle ]
      * ↳ *Status:* 🟢 Success (1 min ago)
      * ↳ *Summary:* 850 WSIB Matched (70% Yield) | 354 Unmatched
      * `[+] Deep Dive (Expandable Accordion)`

### New Funnel Metrics Required
To achieve a perfect 1:1 mapping where *every* pipeline step has an expandable deep dive, we will need to build net-new funnel configurations for the steps that currently lack them. 

The existing 13 funnel rows cover extraction and linking. We need to add the following new funnel item types:
1. **`assert_schema`:** A funnel showing "Total Columns Checked", "Missing Required Headers", and "Type Mismatches".
2. **`link_similar`:** A funnel showing "Total Permits Checked", "Clusters Formed", and "Duplicate/Alias Links Established".
3. **`create_pre_permits`:** A funnel showing "Eligible CoA Records", "Pre-Permits Generated", and "Excluded Configurations".
4. **`assert_data_bounds`:** A funnel showing "Total Assertions Run", "Cost Outliers Detected", and "Null Rate Violations".
*(Infrastructure steps like `refresh_snapshot` will only show the top-level green status/timestamp and won't need a deep-dive accordion).*

### Deprecating Data Source Relationships
With this new paradigm, the current **"Data Source Relationships" (Hub-and-Spoke Circle Diagram)** on the Data Quality dashboard becomes conceptually redundant. 

Instead of an abstract radial graph trying to show how address points, parcels, and trades connect to building permits, the **Freshness Timeline Pipeline UI** now linearly and chronologically proves exactly how those relationships are built step-by-step. 

**Recommendation:** Delete the Hub-and-Spoke Data Source Relationships section entirely. Admin cognitive load drops to zero when we merge Operational Health (The Pipeline) and Data Effectiveness (The Funnel Accordions) into one single, master linear view.
