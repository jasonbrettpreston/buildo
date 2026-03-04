# Admin Panel Improvement Strategy: Multi-Source Tracking

## 1. Overview
Currently, the Admin Panel (`src/app/admin/page.tsx`) only tracks sync metrics and health for the primary **Building Permits** dataset. As the system has grown, we are now ingesting multiple supplementary datasets to enrich leads (e.g., Committee of Adjustment, property parcels, builder profiles).

To maintain long-term system health, the Admin UI must be expanded into a comprehensive **"Data Sources & Health" Dashboard**.

---

## 2. The Data Sources, Frequencies, & Metrics

Below are the 7 core data sources Buildo relies on, how often they should be updated, and the specific metrics the new Admin Panel must track for each.

### A. Active Daily Sources

**1. Building Permits (`scripts/load-permits.js`)**
- **Frequency:** Daily sync from Toronto Open Data.
- **Data Extracted:** Raw permit data, project details, generic builder strings.
- **Admin Panel Metrics to Track:**
  - Last sync timestamp & status (Success/Fail).
  - New vs Updated vs Unchanged records today.
  - **Linking Metric:** Trade Classification Rate (e.g., "96% of permits successfully assigned a trade").

**2. Committee of Adjustment (CoA) (`scripts/load-coa.js`)**
- **Frequency:** Daily sync from Toronto Open Data.
- **Data Extracted:** Minor variances, consents, and detailed zoning descriptions.
- **Admin Panel Metrics to Track:**
  - Last sync timestamp.
  - New applications added today.
  - **Linking Metric:** Permit Link Rate (e.g., "78% of approved CoAs linked to an existing permit").

### B. Enrichment & Background Sources

**3. Builder Data & Profiles (`scripts/extract-builders.js` / API Enrichment)**
- **Frequency:** Continuous/Daily background jobs.
- **Data Extracted:** Normalizing raw permit builder strings into unified `builders` table records, enriching with external API data.
- **Admin Panel Metrics to Track:**
  - **Total Builders:** Unique normalized builder entities in the system.
  - **Enrichment Queue:** Number of builders awaiting third-party API enrichment.
  - **Accuracy/Linking Metric:** Identification Rate (e.g., "85% of issued permits successfully linked to a unique Builder Profile").
  - **Data Health:** % of builders with valid contact info (Phone/Email).

**4. Address Points (`scripts/load-address-points.js`)**
- **Frequency:** Quarterly (static bulk update).
- **Data Extracted:** Base geospatial lat/lng for every civic address in Toronto.
- **Admin Panel Metrics to Track:**
  - Database row count vs expected (~530k).
  - Last update timestamp.
  - **Accuracy Metric:** Geocoding Success Rate for Permits (e.g., "99.2% of permits cleanly matched to an Address Point").

**5. Property Boundaries / Parcels (`scripts/load-parcels.js`)**
- **Frequency:** Quarterly (static bulk update).
- **Data Extracted:** Geospatial polygons defining lot lines.
- **Admin Panel Metrics to Track:**
  - **Linking Metric:** Parcel Coverage (e.g., "92% of active permits fall within known property boundaries").
  - Last Update timestamp.

**6. 3D Massing & Footprints (`scripts/load-massing.js`)**
- **Frequency:** Quarterly.
- **Data Extracted:** Building footprints used to calculate existing structures.
- **Admin Panel Metrics to Track:**
  - Last update timestamp.
  - **Accuracy Metric:** Lot Coverage Linking (e.g., "80% of residential parcels have massing data").

**7. Neighbourhood Profiles (`scripts/load-neighbourhoods.js`)**
- **Frequency:** Annual/Static (Census data & boundaries).
- **Admin Panel Metrics to Track:**
  - Static health check (158 neighbourhoods loaded).
  - **Linking Metric:** "99.9% of permits assigned a neighbourhood".

---

## 3. Recommended UI Plan for the Admin Panel

We will refactor `src/app/admin/page.tsx` into the following layout to ensure scalability:

### Section 1: Data Health Overview (Top Row)
A high-level health check consisting of status indicator cards (Red/Yellow/Green) for all 7 pipelines/data sources. If a pipeline is out-of-date or an API quota fails, it flashes red.

### Section 2: Active Sync Operations (The Core)
A detailed section focusing *only* on the daily automated pipelines:
1. **Permits Sync Log:** The existing table showing `New`, `Updated`, `Errors`, and `Duration`.
2. **CoA Sync Log:** A parallel table showing the daily Committee of Adjustment syncs, explicitly highlighting unlinked logic.
3. **Builder Enrichment Log:** A specialized card showing the background queue for builder enrichment.

### Section 3: Data Quality View - Data Source Relationships (Middle Section)
A dashboard tracking the exact relationships and accuracy of our data enrichment pipelines.

**1. Scope Class (Project Type)**
- **Definition:** The fundamental classification defining the primary use of a building.
- **UI Reporting:** We must separate the unified "Scope Class" to exclusively track **Commercial** vs **Residential** permits as two distinct data buckets, explicitly listing the active total amount of each below the metric.

**2. Scope Tags (Architectural Features)**
- **Definition:** Highly specific extracted features (e.g., `new:kitchen`, `tenant-fitout`).
- **UI Reporting:** 
  - *Exclude* generic terms ("residential", "commercial", "mixed-use") from the tag definitions and UI reporting to keep the data clean.
  - Track the metric: **"Percentage of Permits with at least 1 True Tag"** (excluding use-types).
  - List the **Top 3** most frequently generated *true* architectural tags.

**3. Trade Classification Health (Handling the 44% Bubble)**
- **Tracking:** Real-time percentage of permits assigned to at least one trade. 
- **Recommendation (No Tier 3):** To fix the stalled 44% classification rate without a messy Tier 3 Regex:
  - Officially deprecate all UI references and dashboard logging for Tier 3.
  - Enhance Tier 1 logic to aggressively catch generic/minor permits (e.g., basic HVAC/Plumbing repairs) as a broad fallback.
  - Expand the Tier 2 Tag-to-Trade mapping matrix with new commercial tags (e.g., mapping `tenant-fitout` to `Millwork` and `Drywall`) to capture the massive non-residential backlog dragging down the average.

**4. Overall Enrichment Accuracies**
- **Tracking:** A consolidated dashboard/progress bar section listing all data sources and their exact linking success rates:
  - **Geocoding Support:** `[ 99.2% ▓▓▓▓▓▓▓▓▓░ ]` (Address Points)
  - **Neighbourhood Coverage:** `[ 99.9% ▓▓▓▓▓▓▓▓▓▓ ]` (Census Boundaries)
  - **Parcel Linking:** `[ 92.0% ▓▓▓▓▓▓▓▓▓░ ]` (Property Lines)
  - **CoA Permit Linking:** `[ 78.0% ▓▓▓▓▓▓▓▓░░ ]` (Committee of Adjustment)
  - **Builder Identification:** `[ 85.0% ▓▓▓▓▓▓▓▓░░ ]` (Normalized Builders)
  - **Builder Contact Info:** `[ 45.0% ▓▓▓▓░░░░░░ ]` (API Enrichment)
  - **Trade Classification:** `[ 44.1% ▓▓▓▓░░░░░░ ]` (Tag-Matrix Assignment)

### Section 4: Geographic Data Sets (Bottom Section)
A simpler list view displaying when the heavy, static geospatial tables (Address Points, Parcels, Massing) were last successfully ingested via backend scripts. Includes a button/command copy for admins to run backend updates when quarterly data drops.

---

## 4. Third-Party Data Brokers (Builder Enrichment & Costs)

Extracting a builder name from a permit ("John Doe Contracting") is only half the battle; we must append an actionable phone number, email, and website.

If the Admin Panel shows our "Builder Contact Enrichment Rate" stalling, we must evaluate the following API approaches to clear the queue (Pipeline #3).

### Approach 1: The Google Places API (Current Baseline)
**Is this a valid approach?** Yes. Google Places is the foundational tool for local service enrichment. We pass the extracted builder name + "Toronto", and if a match is confident, we extract the listed public phone number and website.
- **Cost Estimate:** ~$17 to $25 per 1,000 successful lookups.
- **Pros:** Highly accurate for established B2C trades and residential renovators. Cheap.
- **Cons:** Fails entirely for large commercial GC's (who don't manage a public Google Maps pin), holding companies, and generic numbering companies. Rarely provides specific point-of-contact *emails*.

### Approach 2: Broad B2B Data Brokers
For the builders that Google Places fails to enrich, we waterfall down to specialized B2B data brokers.
1. **Apollo.io API:** Extremely cost-effective for bulk B2B enrichment. Provides direct dial numbers and verified emails for key decision-makers.
   - **Cost Estimate:** ~$50 to $100/month for basic API access.
2. **Clearbit (via HubSpot):** Excellent at firmographic data.
   - **Cost Estimate:** Premium pricing. Usually starts around $500 - $1,000+/mo.
3. **ZoomInfo API:** The gold standard for B2B contact data, but heavily enterprise-priced.
   - **Cost Estimate:** Extremely expensive. Starts at >$15,000+ per year.

### Approach 3: Construction-Specific Data Feeds
Platforms that aggregate construction-specific licensing and relationship data:
1. **ConstructConnect / CMD Group / Dodge Construction Network:** 
   - **Cost Estimate:** Opaque enterprise pricing, often $10k–$20k+/yr depending on the regional data package required.

**Data Broker Recommendation:**
Operate a "Waterfall" enrichment strategy: Route every extracted builder name through Google Places first (costing pennies). If that fails, automatically push that specific builder to the Apollo.io API (for a low monthly flat rate) to find the B2B contact info.

---

## 5. Market Metrics Dashboard (Separate Page)

While the main Admin Panel focuses on **System Health** (is the data flowing?), we need a dedicated **Market Metrics Dashboard** (e.g., `/admin/market-metrics`) to track the actual **Business Activity** (what is the data telling us?). 

This page allows admins to understand macroeconomic trends in the construction sector and track the volume of leads being generated by the platform.

### Recommended UI Design for Market Metrics

**1. High-Level KPI Row (Monthly Snapshot)**
- **Total Permits Issued (MTD):** vs previous month trend arrow.
- **Estimated Construction Value (MTD):** Total dollar-value of all approved projects this month.
- **Top Active Builder (MTD):** The contractor with the most approved permits this month (excluding generic homeowners).

**2. Activity by Permit Type (Over Time)**
- **Visualization:** A stacked bar chart or multi-line graph showing permits issued over the trailing 12 months.
- **Categories:** Group the raw permit types into broader business categories for easy consumption:
  - New Residential Houses (SFDs)
  - Residential Additions/Alterations
  - Commercial/Multi-Family Build-outs
  - Demolitions
- **Value:** Instantly shows seasonality (e.g., deck permits spiking in April) and macroeconomic slowdowns (e.g., housing starts dropping due to interest rates).

**3. Project Velocity (City Backlog Monitor)**
- **Visualization:** A line chart or median number tracking the "Average Days from Application to Issuance" over the last 12 months.
- **Value:** Helps understand how bogged down the city's building department is. If this number spikes from 45 days to 120 days, it tells the sales team that builders are stuck waiting for approvals and might be delaying supply orders.

**4. Top Networking Targets (Builders & Applicants)**
- **Visualization:** A ranked top 10 list table of the most active entities this month.
  - *Top Approved Builders*
  - *Top Submitting Applicants (Architects/Designers)*
- **Value:** Instead of just treating Builders as platform users, this shows the most active Architectural and Design firms. Knowing who just pulled 15 permits this month is highly actionable intelligence for B2B networking and sales.

---

## 6. Evaluated Future Data Sources: Toronto Hydro

**Query:** Does Toronto Hydro have an open database that lists when specific properties will be disconnected?

**Findings:** 
Currently, Toronto Hydro **does not** provide an open, structured dataset (like a CSV or API feed on the municipal Open Data Portal) that lists specific property addresses scheduled for disconnection. 

1. **Planned Outages (Construction/Maintenance):** Toronto Hydro publishes an interactive "Outage Map" showing general polygon areas affected by planned maintenance, but they do not publish the raw list of specific civic addresses affected. They notify affected homeowners directly via phone or mail.
2. **Non-Payment Disconnections:** Due to strict privacy regulations, Toronto Hydro legally cannot and does not publish any data regarding properties being disconnected for non-payment or arrears. 
3. **Green Button Program:** Toronto Hydro participates in the Green Button program, but this only allows individual homeowners to securely share their *own* energy data with authorized third-party applications. It is not a bulk public data feed.

**Conclusion:** We cannot programmatically ingest a feed of "upcoming hydro disconnections" to generate leads (e.g., for temporary power or distressed property buyers). Any attempt to scrape the general Outage Map would only yield broad neighborhood polygons, not actionable property-level data that we could accurately link to our permit or parcel tables.
