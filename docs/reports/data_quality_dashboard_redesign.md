# Data Quality Dashboard Redesign Strategy (v2)

## 1. The Core Problem
The current "Hub and Spoke" design using massive `DataSourceCircle` cards fails because it smashes two mathematically distinct concepts into a single UI element:
1. **The Baseline Health:** How big and complete is the raw external dataset? (e.g., *Is the entire WSIB database missing emails?*)
2. **The Incremental Enrichment Yield:** How successfully did our Building Permits link to that baseline, and did *those specific linked permits* inherit complete data?

To provide true business intelligence—and to ensure the UI scales beautifully on mobile without endless horizontal scrolling—we must transition to an **Expandable List View (The Enrichment Funnel)** that explicitly separates these contexts.

---

## 2. The Recommended Architecture: The 4-Column Funnel Row

Each external data source (WSIB, Parcels, Google Places, Trades) will be rendered as a single, wide horizontal row (which stacks gracefully into a dense card on mobile). 

Every row must contain four explicit data zones. **Most importantly, the UI must feature a toggle: `[View All Time] / [View Last Run]`.**

### Zone 1: Metadata & Freshness
*This tells the user if the data ingestion engine is running correctly.*
*   **Source Title:** e.g., "WSIB Registry" (Note: WSIB will be presented independently from "Builder Web Profiles".)
*   **Status Badge:** `Healthy`, `Volume Anomaly`, or `Schema Drift Alert`.
*   **Last Updated:** "Updated `2h ago`"
*   **Next Scheduled Sync:** "Next update: `Tomorrow at 2:00 AM`" (Clickable to edit CRON cadence).
*   **Manual Trigger:** An explicit `[Update Now]` button must be present on every single row to instantaneously fire the background worker for that specific pipeline step.

### Zone 2: The Actionable Baseline (The External World)
*This tells the user how large the potential pool of data is, regardless of our permits.*
*   **The Prime Metric:** E.g., `121,000` Total Trade Records.
*   **The Funnel Cut:** E.g., `54,000` (Class G Target Pool).
*   **Baseline Completeness:** How good is the *raw* data?
    *   *Fields Offered:* `legal_name`, `phone`, `email`
    *   *Baseline Null Rates:* Phone (1% null), Email (42% null) -> *(This tells the user that the provincial WSIB database itself is missing emails 42% of the time, so we shouldn't expect perfect enrichment for our permits).*

### Zone 3: The Intersection (The Buildo Engine)
*How well are permits mapping to the Baseline?*

**When Toggled to [All Time]:** (Cumulative)
*   **Target:** `220,600` (All Active Permits)
*   **Linked:** `218,000` (98.8% Match Rate)
*   *Sub-tiers example (Parcels):* Exact Address vs Fuzzy Name vs Spatial Match.

**When Toggled to [Last Run]:** (Incremental)
*   **Processed Run Size:** `500` Permits (The exact batch size the script handled today).
*   **Successfully Linked:** `480` (96% Run Success Rate). This proves whether today's execution was healthy.

#### Multi-Step Pipeline Tracking
*For complex pipelines (like SERP Enrichment), the Intersection must display sub-step drop-offs to isolate where failures occur:*
*   **Step 1:** Successfully matched base entity (e.g., `500 Builders`).
*   **Step 2:** Found a valid corporate Website via Google/SERP (e.g., `350 Websites Found` - an important leading indicator).
*   **Step 3:** Found contact info on that Website (e.g., `210 Emails Found`).
*   *Why?* If the SERP API breaks, Step 2 hits 0. If the SERP API works but our email regex scraper breaks, Step 3 hits 0. Showing these distinct steps allows instant debugging of complex workflows.

### Zone 4: The Extracted Yield (The Final Output)
*Out of the permits that **were successfully matched**, what data did we actually extract?*

**When Toggled to [All Time]:**
*   **Cumulative Yield:** `195,000` Verified Emails, `217,000` Direct Phones extracted universally.
*   **Cumulative Incremental Completeness:** If we linked 218K permits, and 195K have emails, the null rate is ~10%. Comparing this 10% null rate to Zone 2's raw 42% null rate proves the algorithm indexes better data.

**When Toggled to [Last Run]:** (The "What just happened?" view)
*   **Run Extraction:** `350` Phones found this run. `200` Emails found this run. 
*   **Run Null Rates:** `27%` Email Null Rate for this specific batch. If this spikes to 90%, the user instantly knows the Google API broke or the scraper regex failed during *that exact run*.

---

## 3. Implementation Requirements: The `records_meta` Payload

To support the `[Last Run]` view, the pipeline orchestration layer must be enriched. Currently, `pipeline_runs` stores `records_total` and `records_new`. 

**Backend Requirement:** We must alter `pipeline_runs` to include a `JSONB records_meta` column.

Every enrichment script (e.g., `enrich-web-search.js`, `link-wsib.js`, `classify-trades.js`) must be refactored to aggregate its extraction success during the run and save it to `records_meta`.

**Example `records_meta` payload saved by `link-wsib.js`:**
```json
{
  "processed": 500,
  "matched": 480,
  "unmatched": 20,
  "extracted_fields": {
    "phone": 350,
    "email": 200,
    "naics_code": 480
  }
}
```

---

## 4. UI Mockup / State Example (JSON Representation)

Here is how the React data contract for a single row would support the toggle:

```json
{
  "sourceName": "Builder Web Profiles", // Distinct from WSIB
  "metadata": {...},
  "zone2_baseline": {...},
  
  // The Toggle Data Container
  "metrics": {
    "all_time": {
      "intersection": { "processed": 220000, "linked": 150000 },
      "yield": { "phone": 140000, "email": 90000 }
    },
    "last_run": {
      "intersection": { "processed": 500, "linked": 480 },
      "yield": { "phone": 350, "email": 200 }
    }
  }
}
```

---

## 5. Comprehensive Data Sources Included

The redesign will explicitly render individual rows for every specific ingestion and classification script to prevent hiding functionality.

*   **Ingestion & Linking:**
    *   Building Permits (Hub)
    *   Address Matching (Geocoding)
    *   Lots (Parcels)
    *   3D Massing
    *   Neighbourhoods
    *   CoA Applications
*   **Enrichment Profiles (Explicitly Separated):**
    *   WSIB Registry *(Local Provincial License Matching)*
    *   Builder Web Profiles *(Google Places / Web Search API)*
    *   Architect & Developer Profiles *(LinkedIn/Web Search Hub)*
*   **AI Classifications (New Additions):**
    *   **Scope Class:** (Residential vs Commercial vs Mixed-Use assignment).
    *   **Scope Tags:** (Architectural derivation: Laneway Suites, Detached, Basement).
    *   **Trades (Residential):** Sub-trade classification on smaller files.
    *   **Trades (Commercial):** Sub-trade classification on massive files.

## 6. Mobile Layout Strategy

When viewed on a phone, the wide row collapses into a polished "Accordian Card":

1.  **Header:** Source Name + Status Dot + "Updated 2h ago" + **[Update Now]** icon.
2.  **Hero Element:** The Horizontal Progress Bar (The Intersection Match Rate `98.8%`).
3.  **Visible Summary:** A 2-column micro-grid showing the core yielded fields (`195K Emails` | `217K Phones`).
4.  **Tap to Expand:** A toggle that physically drops down to reveal:
    *   The Next Update schedule edit button.
    *   The specific sub-tiers and multi-step drop-offs (e.g., SERP -> Website -> Email).
    *   The side-by-side **Completeness Comparison Table** (Baseline Nulls vs Incremental Nulls).
