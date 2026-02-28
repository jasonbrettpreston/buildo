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
3. **Builder Enrichment Log:** A specialized card showing the background queue for builder enrichment (how many builders were extracted from permits today vs how many were enriched with API data).

### Section 3: Data Quality & Linking Metrics (Middle Section)
A dashboard of progress bars and percentages tracking the platform's data enrichment rules:
- **Geocoding Health:** `[ 99% ▓▓▓▓▓▓▓▓▓░ ]`
- **Builder Identification:** `[ 85% ▓▓▓▓▓▓▓▓░░ ]`
- **Builder Contact Enrichment:** `[ 45% ▓▓▓▓░░░░░░ ]`
- **Trade Classification:** `[ 96% ▓▓▓▓▓▓▓▓▓░ ]`
- **Parcel Linking:** `[ 92% ▓▓▓▓▓▓▓▓▓░ ]`

### Section 4: Geographic Data Sets (Bottom Section)
A simpler list view displaying when the heavy, static geospatial tables (Address Points, Parcels, Massing) were last successfully ingested via backend scripts. Includes a button/command copy for admins to run backend updates when quarterly data drops.

---

## 4. Alternative Strategies: Third-Party Data Brokers (Builder Enrichment)

Currently, Buildo uses a simple "Google Places Search" or "WSIB public lookup" approach to enrich the extracted builder names from permits with phone numbers and emails. However, scaling this up effectively often requires partnering with a **B2B Data Broker** in the construction space.

If the Admin Panel shows our **"Builder Contact Enrichment Rate"** is stalling below 50%, we should integrate one of the following APIs as the primary enrichment engine for pipeline #3:

### Option A: Broad B2B Data Brokers
These APIs specialize in company-to-contact mapping. You hand them a Company Name ("XYZ Contracting") and a Location ("Toronto"), and they return the verified business phone, website, and key personnel emails.
1. **Apollo.io API:** Extremely cost-effective for bulk B2B enrichment. High accuracy for mid-to-large general contractors.
2. **Clearbit (via HubSpot):** Premium pricing but excellent at finding company firmographic data (size, revenue, verified general inboxes).
3. **ZoomInfo API:** The gold standard for B2B contact data, but heavily enterprise-priced. Best if targeting specific project managers inside massive GC firms (e.g., EllisDon).

### Option B: Construction-Specific Data Feeds
Instead of generic B2B brokers, these platforms aggregate construction-specific licensing and contact data:
1. **ConstructConnect / CMD Group:** They sell highly enriched construction project data. While usually used as a CRM alternative, their API can sometimes be licensed to enrich raw municipal permit strings with pre-verified GC contacts.
2. **Dodge Construction Network:** Similar to ConstructConnect; massive proprietary database of North American builder/subcontractor relationships and verified contact info.
3. **Provincial/State Licensing APIs:** If available (like a specific Ontario Home Builders' Association or Tarion registry scrape/API), cross-referencing our extracted Builder Names against verified, province-level builder registries often yields the highest quality 1st-party contact data for residential builders.

**Recommendation:** Integrate the **Apollo.io Enrichment API** first. It is easy to test, affordable for our current scale, and will immediately raise the percentage of Builder Profiles carrying valid phone numbers and emails in the Admin Panel without breaking the bank.
