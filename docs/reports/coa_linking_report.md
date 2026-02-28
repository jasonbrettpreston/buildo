# Committee of Adjustment (CoA) Data & Permit Linking Strategy

## 1. Overview
This report outlines the strategy for linking City of Toronto building permits to Committee of Adjustment (CoA) applications, and details the data fields available from the City's open data versus what must be sourced elsewhere.

Linking CoA data to permits is highly valuable: an approved CoA application (for a minor variance or consent) is a strong leading indicator that a building permit application will follow shortly.

---

## 2. Available Fields in Toronto CoA Open Data
The City of Toronto provides a daily-updated dataset for CoA applications via its Open Data portal. 

### What IS Included in the Open Data:
* **Application Number** (e.g., `A0123/24TEY`)
* **Address Data:** `STREET_NUM`, `STREET_NAME`, `STREET_TYPE`, `STREET_DIRECTION`
* **Ward:** The city ward the property belongs to.
* **Application Type:** Minor Variance, Consent, etc.
* **Status / Decision:** e.g., "Approved", "Approved with Conditions", "Refused".
* **Dates:** `HEARING_DATE` (date of the meeting) and `DECISION_DATE`.
* **Description / Purpose:** A text block describing what is being built and what variances are requested (e.g., *"To construct a two-storey rear addition. Variances requested for floor space index and rear yard setback."*).
* **Applicant:** Sometimes provided, but often lists the planning consultant or zoning agent rather than the actual owner or builder.

### What is NOT Included (The limitations):
* ❌ **Designer or Architect Name:** Not structured in the open dataset.
* ❌ **Builder or Homeowner Name:** Privacy policies often prevent the homeowner's name from being published in the bulk open data. The "Applicant" might be the builder, but it is just as often a generic numbered company or an urban planning consultant.
* ❌ **The Plans Presented (Drawings):** The actual architectural drawings, site plans, and surveyor documents are **not** present in the Open Data JSON/CSV.

### How to get the missing data (Plans and Architect Names):
To get the actual building plans and explicit designer names, one must retrieve the PDF documents attached to the specific application on the City of Toronto's **Application Information Centre (AIC) web portal**. 
Because the open data API does not provide these PDFs, acquiring them requires a web-scraping script (using Puppeteer/Playwright) to search the AIC portal by the Application Number, simulate clicking on the "Supporting Documentation" tab, and downloading the PDFs.

---

## 3. Strategy for Linking CoA Applications to Permits
Since there is no "Permit Number" field on a CoA application (as the CoA process happens *before* the permit is applied for), we must use a probabilistic matching algorithm to link them.

### Step 1: Address Matching (The Gateway)
The foundational link is the property address.
* Parse both the CoA address and Permit address into normalized `street_num` and `street_name`.
* *Challenge:* Address string variations (e.g., "Main St W" vs "MAIN STREET WEST"). Normalization is required before joining the tables.
* If addresses match exactly, proceed to scoring.

### Step 2: Date Proximity Scoring (Weight: 40%)
Permits are usually applied for shortly after a CoA approval, though the subsequent permit review process takes time.
* Calculate the days elapsed between the CoA `DECISION_DATE` and the Permit `APPLICATION_DATE` (or `ISSUED_DATE`).
* E.g., If the permit is issued within 90 days of the CoA decision, give a high score. If it's over 2 years apart, the score drops to zero.

### Step 3: Description Similarity Scoring (Weight: 30%)
Ensure the permit is actually for the work approved in the CoA.
* Tokenize the CoA `DESCRIPTION` and the Permit `DESCRIPTION`.
* Calculate a similarity score (e.g., Jaccard index). If both descriptions mention "rear addition" and "second storey", the confidence is high.

### Step 4: Decision Status Bonus (Weight: 30%)
* We only care strongly about linking to permits if the CoA was actually approved. 
* Add a bonus to the confidence score if the CoA `DECISION` is "Approved" or "Approved with Conditions".

### Resolution Rule
* **High Confidence (Score > 80%):** Automatically link the CoA application to the Building Permit in the database.
* **Medium Confidence (Score 50% - 80%):** Flag as a "Candidate Link" for human-in-the-loop manual review.
* **Multiple Matches:** If a large site has multiple permits, the algorithm assigns the CoA to the permit with the highest description similarity.

---

## 4. Workflows & Implementation Next Steps
1. **Database Migration:** Create a `coa_applications` table in Postgres to store the daily sync from Toronto Open Data. Include a `linked_permit_num` and `linked_confidence` column.
2. **Sync Script:** Write `scripts/sync-coa.js` to hit the Toronto Open Data API, normalize addresses, and upsert records.
3. **Matching Engine:** Implement the address and keyword scoring logic described above.
4. **(Optional) PDF Scraper:** If retrieving the actual site plans and architect names is a hard requirement, build a supplementary Playwright scraper targeting the Toronto AIC portal.
