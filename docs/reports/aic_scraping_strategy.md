# Building Permit Inspection Scraping Strategy

## Overview
This document outlines the architecture for automatically retrieving building permit inspection statuses from the older City of Toronto Building Application Status portal (`secure.toronto.ca/ApplicationStatus`).

The objective is to continuously pull high-volume inspection data for all active residential permits, track their stages (e.g., Framing, Plumbing, Final), and seamlessly integrate this data into the Buildo pipeline and Permit Detail UI.

## The Strategy: DIY Playwright + Rotating Proxies

Given that the City of Toronto’s older portal layout changes very rarely, the most cost-effective and controllable approach is building a custom Node.js Playwright crawler.

### 1. Navigating the Portal
The Application Status portal explicitly blocks direct requests to the data endpoints. Every check must emulate a real user session:
1. Initialize session at `setup.do?action=init`
2. Input the Application Number and execute search.
3. Click through the "Address" and "Application Number" accordions.
4. Click the "Status" button beside Inspections to trigger the final pop-up.
5. Parse the HTML table containing stages (Excavation, Structural Framing), status (Outstanding, Pass, Fail), and the associated date.

### 2. Bypassing Bot Detection
To pull thousands of permits without being banned by the City's firewalls, the crawler must use:
- **playwright-extra & puppeteer-extra-plugin-stealth:** These plugins strip away Playwright's default `webdriver=true` flags and spoof canvas/WebGL fingerprints to mimic a real human browser.
- **Rotating Residential Proxies (Smartproxy):** Passing the headless browser traffic through a pool of residential IPs ensures the city sees thousands of different "Toronto home internet users" rather than a single DigitalOcean server. Expected cost: ~$14/month for 2GB of bandwidth.

### 3. Concurrency and JavaScript Rendering
A major advantage of the DIY Playwright approach is that you maintain full control over execution speed and rendering:
- **JavaScript Rendering is Default:** Because Playwright runs a real headless Chromium browser, all client-side JavaScript, accordions, and dynamic table loading (including the `setup.do?action=init` session generation) are inherently executed just like they are for a human user. You do not pay extra "API Multipliers" for JS rendering like you do with third-party managed scrapers.
- **Scaling Concurrent Requests:** Concurrency is achieved simply by spinning up multiple asynchronous background workers parsing the BullMQ queue simultaneously. 
  - *Note on Limits:* Every concurrent request boots a headless Chromium instance, which consumes about 150-300MB of RAM. A standard 2GB/1-vCPU DigitalOcean droplet can safely run **3 to 5 concurrent Playwright workers**. If you need faster throughput, you simply upgrade the server RAM to support 10+ concurrent workers pulling from the queue.

### 4. Local Development vs. Production
It is perfectly acceptable—and highly recommended—to build, test, and run this entire scraping architecture from your **local development environment** (especially the initial Proof of Concept script). 
- **Local Playwright:** Node.js will smoothly launch a local, hidden Chromium instance on your machine using your local CPU/RAM. 
- **Local Proxy Use:** Even when running locally, you still inject the Smartproxy gateway credentials into the Playwright script. This is crucial because if you don't, the City will quickly block your home/office router's IP address.
- **Separate Execution:** Whether running locally or in production, the scraping queue runs completely independently of your main Buildo application server, ensuring it never slows down your web app.

## Pipeline Integration (Data Flow)

To ensure stability, scraping will be handled entirely outside the core ingestion scripts (`load-permits.js`) using an asynchronous queue system.

### Phase 1: Queueing
1. **Nightly Trigger:** A cron job runs a new script (e.g., `scripts/queue-inspections.js`).
2. **The Query:** It selects `permit_num` from the `permits` table where:
   - The permit is for a residential property.
   - The permit status is "Active" (not closed/voided).
   - The inspection data hasn't been refreshed in the last X days (e.g., 7 days).
3. **The Queue:** These permit numbers are pushed into a Redis-backed queue (e.g., BullMQ).

### Phase 2: Execution & Handling Dynamic Stages
1. **The Workers:** 2 to 3 concurrent Playwright workers process the queue.
2. **Extraction:** The worker parses the inspection table into a structured JSON payload.
   
   **CRITICAL REQUIREMENT: Handling Dynamic Inspection Stages**
   It is important to note that **the specific type of permit dictates the required inspection stages**. 
   - A **Building Permit (BLD)** might have stages for: *Excavation/Shoring, Footings/Foundations, Structural Framing, Insulation/Vapour Barrier, Interior Final Inspection, Occupancy.*
   - A **Plumbing Permit (PLB)** will have trade-specific stages: *Underground Plumbing, Rough-in Plumbing, Final Plumbing.*
   - A **Demolition Permit (DEM)** or **Drain Permit (DRAIN)** will have entirely different milestones based on the City's requirements.
   
   Because we cannot hardcode the stages, the scraper must read the exact `Inspection Stage` text dynamically from the HTML table's first column and the Status (Outstanding, Pass, Fail) from the second column.

3. **Database Upsert:** The worker upserts records into the `permit_inspections` table. To accommodate the dynamic stages above, the table schema will look like this:
   - `permit_num` (Foreign Key)
   - `stage_name` (Text - exactly as scraped, e.g., "Structural Framing")
   - `status` (Enum/Text: "Outstanding", "Pass", "Fail", "Partial")
   - `inspection_date` (Date)
   - *Constraint:* Unique constraint on `(permit_num, stage_name)` so that future scrapes update existing stages rather than creating duplicates.
4. **Retry Logic:** If a proxy IP is blocked or the page times out, the worker throws an error. BullMQ catches this and automatically retries the job later with a fresh proxy IP.

### Phase 3: UI & API Surfacing
1. **Schema Update:** The `permit_inspections` table will link back to the `permits` table via `permit_num`.
2. **API Update:** The existing `GET /api/permits/[id]` route will be updated to `JOIN` or include the `permit_inspections` relations.
3. **Permit Detail Panel:** Because the inspection stages are dynamic per permit, the Buildo Admin UI will render a dynamic list or timeline on the Permit Detail page. It will iterate through whatever records exist for that specific permit, rendering them chronologically to indicate which stages have passed and which remain outstanding.

## Next Steps
1. **Database Schema:** Create the Drizzle migrations for `permit_inspections`.
2. **PoC Scraper:** Write `scripts/poc-aic-scraper.ts` to prove we can pass the session checks and parse a single inspection table using Playwright and standard proxies.
3. **Queue Setup:** Implement BullMQ to manage the scraping jobs.
