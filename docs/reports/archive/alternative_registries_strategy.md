# Strategic Data Enrichment: Alternative Registries

Beyond the WSIB Open Data integration and generalized Web Search, connecting Buildo to hyper-specific professional registries in Ontario creates an elite, structured dataset for B2B outreach.

Here is an evaluation of the top professional registries and how they can be integrated into the enrichment pipeline.

---

## 1. HCRA / Tarion (The Home Builders Registry)
In Ontario, it is legally required for anyone building new residential homes to be registered with the Home Construction Regulatory Authority (HCRA) and enrolled in the Tarion Warranty Corporation.

* **The Data Payload:** Exact Legal Name, Trade Name, Authorized Principals (Owners/Directors), Corporate Address, Phone Number, and explicitly the number of homes they have built legally in Ontario.
* **The Strategy (Reverse Lookup):** 
  * The HCRA Directory is highly structured but not offered as a clean open data CSV. It must be scraped programmatically.
  * **Pipeline Trigger:** When a new `builder` or `project_stakeholder` is identified, if the permit involves "New Construction" or "Single Family Dwelling", the background queue executes a programmatic search against the HCRA Directory (`https://obd.hcraontario.ca/`).
  * **Value Prop:** If they are listed, you instantly gain the precise names of the decision-makers and their direct phone numbers. If they are *building new homes* but *not listed*, they are operating illegally (a massive insight for risk-scoring).

## 2. Ontario Association of Architects (OAA)
Architects are a highly regulated profession in Ontario. To call oneself an "Architect", the individual or firm must be registered with the OAA.

* **The Data Payload:** Verified Principal Architect Names, Firm Name, Corporate Email Addresses, Direct Office Phone Numbers, and Practice Addresses.
* **The Strategy (Reverse Lookup):**
  * The OAA maintains a public "Discover an Architect" directory.
  * **Pipeline Trigger:** When our system extracts a stakeholder and classifies them as `Architect/Designer`, the async worker should first query the OAA practice directory before falling back to Google.
  * **Value Prop:** OAA directory data is heavily vetted and almost guaranteed to provide the correct B2B outreach email without SEO spam interference.

## 3. Professional Engineers Ontario (PEO)
Similar to Architects, structural, mechanical, and civil engineers stamping drawings on your permits must be licensed.

* **The Strategy:** The PEO directory can be queried to verify the credentials of Engineering firms found in the CoA descriptions (e.g., "M.E.P. Design by Smith Engineering").
* **Value Prop:** Excellent for sourcing highly technical leads or providing a "Verified Professional" badge on the Buildo dashboard.

## 4. Better Business Bureau (BBB)
While not legally required like HCRA or WSIB, the BBB is a massive aggregator of consumer-facing trades.

* **The Strategy:** The BBB API/Directory is incredibly rich with exact phone numbers, websites, CEO names, and most importantly, consumer complaints.
* **Pipeline Trigger:** Use BBB as the immediate secondary fallback after WSIB for standard trades (plumbers, HVAC, roofers). 
* **Value Prop:** A builder with an A+ BBB rating and zero recent complaints is a prime candidate for a "Premium Partner" outreach campaign. Conversely, surfacing BBB complaint frequency in Buildo acts as a massive risk-mitigation feature for your end users.

## 5. Specialized Trade Associations
To go beyond generic trades and identify elite contractors, reverse-lookup against voluntary master associations:
* **BILD (Building Industry and Land Development Association):** Captures the top-tier developers and renovators in the GTA.
* **Renomark:** An association of professional renovators who agree to a strict code of conduct.
* **HRAI (Heating, Refrigeration and Air Conditioning Institute of Canada):** The gold standard for HVAC contractors.

---

## 6. Implementation Architecture Update

To accommodate these new sources efficiently, the **Async Background Worker** (`scripts/enrich/stakeholders.js`) from our previous plan should be designed using an **Enrichment Waterfall pattern**:

When a new stakeholder is found, the worker executes steps in this exact priority:

1. **The Internal Fast-Path:** Query the `wsib_registry` (0s, $0 cost).
2. **The Regulatory Path:** Query HCRA/Tarion (for builders) or OAA (for architects). This requires a structured scraper (Pupeteer/Playwright) but yields 100% verified regulatory data.
3. **The Association Path:** Query BBB or Renomark (Standard API/Scrape).
4. **The Web Search Fallback:** If all structured directories fail, execute the targeted Google search (`"{Name}" AND "{Address}" contact email`). 
5. **The Corporate Fallback:** Search the Ontario Business Registry to find the Directors of a numbered company.

By structuring the code as a "Waterfall", you minimize expensive/messy Google searches, prioritize verified government/association data, and build an impossibly rich profile of exactly who the target is, what their phone number is, and if they are legally allowed to be building.
