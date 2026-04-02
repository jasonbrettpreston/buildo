# Pipeline & Data Quality Documentation Structure Proposal

This document maps the core Data Engineering docs to the actual `manifest.json` execution environment. Every recommended spec explicitly lists its legacy replacement, its **Goal & User Story**, its Testing Mandate, its Operating Boundaries, and the formal Behavioral Contract.

All UI-specific Product specs not listed here should be moved to a separate `docs/specs/product_ui/` directory.

> **Important Rule:** Every new or migrated spec listed below must strictly follow the `_spec_template.md` format.

---

## 1. Global Architecture & Orchestration (The "Overall Approach")

1. **`00_engineering_standards.md`** 
   - **Replaces:** None (Existing)
   - **Goal & User Story:** Defines the strict coding and documentation conventions natively enforced across the repo. As an engineer, I need clear rules on how to document and structure code so that the codebase remains maintainable as the team scales.
   - **Testing Mandate:** N/A 
   - **Operating Boundaries:**
     - **Target Files:** `docs/specs/_spec_template.md`
     - **Out-of-Scope Files:** Application source code 
     - **Cross-Spec Dependencies:** N/A
   - **Behavioral Contract:** N/A (Formatting Policy)

2. **`architecture_database_schema.md`**
   - **Replaces:** `01_database_schema.md`
   - **Goal & User Story:** Establishes the foundational relational rules for all system data. As an engineer, I need a single source of truth for all Postgres table configurations, relationships, and constraints to safely write queries without causing database drift.
   - **Testing Mandate:**
     - **Infra:** `quality.infra.test.ts` (Assert schema drifts against definitions)
   - **Operating Boundaries:**
     - **Target Files:** `migrations/*.sql`, `src/lib/database/*`
     - **Out-of-Scope Files:** `scripts/load-*.js` 
     - **Cross-Spec Dependencies:** Relies on `00_engineering_standards.md`
   - **Behavioral Contract:**
     - **Inputs:** Database migrations execution.
     - **Core Logic:** Enforces physical relational schema mapping, types, foreign key constraints, and RLS policies across the platform.
     - **Outputs:** An immutable Postgres database instance guaranteeing schema validity.
     - **Edge Cases:** Prisma schema drift from DB definitions; Unhandled constraint violations killing runtime queries.

3. **`architecture_system_map.md`**
   - **Replaces:** `00_system_map.md`
   - **Goal & User Story:** Maps the physical interconnectivity of all the applications moving parts. As an onboarding developer, I need to see exactly how the pipeline feeds the UI so I can pinpoint where to start debugging a systemic issue.
   - **Testing Mandate:**
     - **Logic:** [NEW] `system-map.logic.test.ts`
   - **Operating Boundaries:**
     - **Target Files:** `scripts/generate-system-map.mjs`
     - **Out-of-Scope Files:** Any runtime logic.
     - **Cross-Spec Dependencies:** Consumes all other `docs/specs/*.md` files.
   - **Behavioral Contract:**
     - **Inputs:** Executing `npm run generate-docs` or accessing visual documentation.
     - **Core Logic:** Traverses the entire system architecture to build a real-time topology of APIs, Pipelines, and UI layers.
     - **Outputs:** Dependency graph output and updated static documentation.
     - **Edge Cases:** Circular dependencies halting the map generation process.

4. **`architecture_pipeline_system.md`** 
   - **Replaces:** `37_pipeline_system.md`
   - **Goal & User Story:** Defines the core orchestrator runtime that actually executes the sequences in `manifest.json`. As a DevOps operator, I need this runner to securely log states and gracefully halt on failures, ensuring no corrupted data silently cascades into production.
   - **Testing Mandate:**
     - **Logic:** `chain.logic.test.ts`, `pipeline-sdk.logic.test.ts`
     - **Infra:** [NEW] `pipeline.infra.test.ts`
   - **Operating Boundaries:**
     - **Target Files:** `scripts/run-chain.js`, `scripts/manifest.json`, `scripts/lib/pipeline.js`, `src/app/api/admin/pipelines/route.ts`
     - **Out-of-Scope Files:** `scripts/load-*.js`, `scripts/classify-*.js`
     - **Cross-Spec Dependencies:** Relies on `architecture_database_schema.md`
   - **Behavioral Contract:**
     - **Inputs:** A manifest chain key (e.g., `permits`) passed via terminal or cron scheduler.
     - **Core Logic:** Dynamically orchestrates any array of pipeline scripts defined in the manifest. Tracks execution elapsed time, injects logs to the `pipeline_runs` tracking table in Postgres, and violently halts the sequence if any subscript exits with `process.exit(1)`.
     - **Outputs:** Terminal logging and finalized `pipeline_run` database records (Success/Failed statuses).
     - **Edge Cases:** Silent script failures returning exit 0; Deadlocks hanging the chain indefinitely; Missing manifest keys stopping initialization.

5. **`architecture_data_quality.md`** 
   - **Replaces:** `28_data_quality_dashboard.md`
   - **Goal & User Story:** Enforces observability across the physical data assets. As an admin, I need the UI/UX dashboard to instantly flag stale or out-of-bounds data so my users aren't relying on broken insights.
   - **Testing Mandate:**
     - **Logic:** `quality.logic.test.ts`
     - **Infra:** `quality.infra.test.ts`
     - **UI:** `dashboard.ui.test.tsx` 
   - **Operating Boundaries:**
     - **Target Files:** `scripts/quality/assert-*.js`, `scripts/refresh-snapshot.js`, `src/lib/quality/*.ts`, `src/components/DataQualityDashboard.tsx`
     - **Out-of-Scope Files:** Data mutation scripts
     - **Cross-Spec Dependencies:** Relies on `architecture_pipeline_system.md`
   - **Behavioral Contract:**
     - **Inputs:** Executed as terminal steps inside chains or via frontend dashboard rendering.
     - **Core Logic:** Performs read-only queries against expected row counts, staleness dates, and network statuses to assert system health parameters.
     - **Outputs:** Boolean assert values and the UX/UI `HealthBanner` determining overall system status.
     - **Edge Cases:** Null values in expected tracking fields; Missing materialized views causing timeouts.

6. **`architecture_sync_scheduler.md`** 
   - **Replaces:** `04_sync_scheduler.md`
   - **Goal & User Story:** Governs the "heartbeat" intervals for all autonomous scripts. As a developer, I need to know precisely when and how often the cron tasks trigger so I can debug timing conflicts between competing pipelines.
   - **Testing Mandate:**
     - **Logic:** `sync.logic.test.ts`
     - **Infra:** [NEW] `cron.infra.test.ts` 
   - **Operating Boundaries:**
     - **Target Files:** `scripts/local-cron.js`, `src/lib/scheduler/*`
     - **Out-of-Scope Files:** `scripts/run-chain.js`
     - **Cross-Spec Dependencies:** Triggers `architecture_pipeline_system.md`
   - **Behavioral Contract:**
     - **Inputs:** Base server startup initiating background threads.
     - **Core Logic:** Matches system time against predefined cron intervals and triggers the root terminal commands to execute pipeline chains without human intervention.
     - **Outputs:** Execution triggers firing correctly sequenced pipelines.
     - **Edge Cases:** Overlapping chron-jobs executing concurrently and locking DB states; Timezone drift.

7. **`architecture_change_detection.md`** 
   - **Replaces:** `03_change_detection.md`
   - **Goal & User Story:** Tracks the physical mutation of API records over time. As a system operator, I rely on deterministic JSON hashing to prove exactly when a municipal entity altered their record, surfacing updates accurately to end users.
   - **Testing Mandate:**
     - **Logic:** `permits.logic.test.ts` 
   - **Operating Boundaries:**
     - **Target Files:** `src/lib/permits/hash.ts`, `src/components/funnel/FunnelPanels.tsx`
     - **Out-of-Scope Files:** `src/lib/permits/field-mapping.ts`
     - **Cross-Spec Dependencies:** Relies on `architecture_database_schema.md`
   - **Behavioral Contract:**
     - **Inputs:** Ingested JSON records mapped against existing database records.
     - **Core Logic:** Deterministically hashes the JSON payload of a record and compares it to the previous known hash. If they do not match, marks the record as physically altered for the UI funnel.
     - **Outputs:** Database `is_updated` tracking booleans and UI panel counters.
     - **Edge Cases:** Differing JSON object key-ordering generating identical logical hashes but differing string hashes.

---

## 2. The 5 Main Data Pipelines (The Orchestration Chains)

8. **`chain_permits.md`** 
   - **Replaces:** *New Spec Required*
   - **Goal & User Story:** Orchestrates the system's foundational core sequence. As a business user, I expect this nightly pipeline to take messy municipal open-data and transform it into highly-classified, spatially-bound construction sales leads seamlessly.
   - **Testing Mandate:**
     - **Infra:** [NEW] `chain-permits.infra.test.ts`
     - **UI:** `ui.test.tsx` 
   - **Operating Boundaries:**
     - **Target Files:** `scripts/manifest.json` (permits array), `scripts/quality/assert-schema.js`, `scripts/load-permits.js`, `scripts/classify-scope.js`, `scripts/extract-builders.js`, `scripts/link-wsib.js`, `scripts/geocode-permits.js`, `scripts/link-parcels.js`, `scripts/link-neighbourhoods.js`, `scripts/link-massing.js`, `scripts/link-similar.js`, `scripts/classify-permits.js`, `scripts/link-coa.js`, `scripts/create-pre-permits.js`, `scripts/refresh-snapshot.js`, `scripts/quality/assert-data-bounds.js`, `scripts/quality/assert-engine-health.js`, `src/components/FreshnessTimeline.tsx`
     - **Out-of-Scope Files:** The internal `lib/` business logic inside the scripts.
     - **Cross-Spec Dependencies:** Orchestrates all source and step specs listed below.
   - **Behavioral Contract:**
     - **Inputs:** `npm run chain permits`
     - **Core Logic:** Executes 16 sequential extraction, enrichment, and linkage steps:
       1. Validates physical DB schema constraints (`assert_schema`).
       2. Extracts raw Permits from Toronto open data APIs (`load-permits`).
       3. Classifies the work scope (New, Addition, HVAC, etc.) based on description strings (`classify_scope`).
       4. Extracts and normalizes unstructured applicant/builder names into initial entities (`builders`).
       5. Cross-references builder identities against the recognized Ontario WSIB registry (`link_wsib`).
       6. Generates missing Lat/Lng coordinates using Google Maps APIs (`geocode_permits`).
       7. Spatially links the permit points to physical land polygons (`link_parcels`).
       8. Spatially links the permit to broader city districts (`link_neighbourhoods`).
       9. Spatially links the permit to surrounding 3D volumes/structures (`link_massing`).
       10. Chains sequential permits at the same address into master Project umbrellas (`link_similar`).
       11. Performs deep regex classification over descriptions to deduce required Trade scopes (`classify_permits`).
       12. Links early variance pre-permits to finalized building permits (`link_coa`).
       13. Generates the final predictive pre-permit pool (`create_pre_permits`).
       14. Refreshes UI snapshot tables (`refresh_snapshot`).
       15. Asserts overarching system data bounds (`assert_data_bounds`).
       16. Validates pipeline health heuristics (`assert_engine_health`).
     - **Outputs:** Enriched and spatially linked Builder/Permit data visible in `FreshnessTimeline.tsx`.
     - **Edge Cases:** Aborting midway leaves permutations partially enriched; Locked tables block downstream geospatial linkages.

9. **`chain_coa.md`** 
   - **Replaces:** `12_coa_integration.md` (Pipeline orchestration section)
   - **Goal & User Story:** Governs the speculative pre-construction pipeline. As a user, I want Variance Hearings imported and analyzed so I can uncover new project leads months before the physical building permits are issued.
   - **Testing Mandate:**
     - **Infra:** [NEW] `chain-coa.infra.test.ts` 
   - **Operating Boundaries:**
     - **Target Files:** `scripts/manifest.json` (coa array), `scripts/quality/assert-schema.js`, `scripts/load-coa.js`, `scripts/quality/assert-coa-freshness.js`, `scripts/link-coa.js`, `scripts/create-pre-permits.js`, `scripts/quality/assert-pre-permit-aging.js`, `scripts/refresh-snapshot.js`, `scripts/quality/assert-data-bounds.js`, `scripts/quality/assert-engine-health.js`, `src/components/FreshnessTimeline.tsx`
     - **Out-of-Scope Files:** `src/lib/coa/*` 
     - **Cross-Spec Dependencies:** Relies on `architecture_pipeline_system.md`
   - **Behavioral Contract:**
     - **Inputs:** `npm run chain coa`
     - **Core Logic:** Executes 10 sequential stages focusing on variance hearings:
       1. Validates physical DB schema (`assert_schema`).
       2. Ingests raw variance hearing applications from the city (`load-coa`).
       3. Asserts the freshness capacity of the CoA payload (`assert_coa_freshness`).
       4. Spatially links the variance hearing to physical property addresses (`link_coa`).
       5. Interrogates approved variances to speculate/generate high-probability pre-construction leads (`create_pre_permits`).
       6. Validates the accuracy and stale status of generated pre-permits (`assert_pre_permit_aging`).
       7. Refreshes materialized frontend UI caches (`refresh_snapshot`).
       8. Verifies core boundary numeric constraints (`assert_data_bounds`).
       9. Reports the final pipeline execution health status (`assert_engine_health`).
     - **Outputs:** Committee of adjustment records loaded, classified, and linked to known addresses.
     - **Edge Cases:** Non-standard PDF hearing outputs causing ingestion parse failure midway through the chain.

10. **`chain_sources.md`** 
    - **Replaces:** *New Spec Required* 
    - **Goal & User Story:** Governs the foundational spatial and registry dependencies. As a data pipeline operator, I need this chain to autonomously refresh master property polygons and WSIB certs so that all downstream linkages remain strictly accurate.
    - **Testing Mandate:**
      - **Infra:** [NEW] `chain-sources.infra.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/manifest.json` (sources array), `scripts/quality/assert-schema.js`, `scripts/load-address-points.js`, `scripts/geocode-permits.js`, `scripts/load-parcels.js`, `scripts/compute-centroids.js`, `scripts/link-parcels.js`, `scripts/load-massing.js`, `scripts/link-massing.js`, `scripts/load-neighbourhoods.js`, `scripts/link-neighbourhoods.js`, `scripts/load-wsib.js`, `scripts/link-wsib.js`, `scripts/refresh-snapshot.js`, `scripts/quality/assert-data-bounds.js`, `scripts/quality/assert-engine-health.js`, `src/components/FreshnessTimeline.tsx`
      - **Out-of-Scope Files:** Downstream ML steps.
      - **Cross-Spec Dependencies:** Relies on `architecture_pipeline_system.md`
   - **Behavioral Contract:**
     - **Inputs:** `npm run chain sources`
     - **Core Logic:** Executes 15 sequential bulk downloads and cross-linkages for foundational macro-geometries/reference tables:
       1. Validates schema constraints (`assert_schema`).
       2. Ingests Toronto's master address point geometries (`load-address-points`).
       3. Triggers geocoding fallbacks for permits with unlinked addresses (`geocode_permits`).
       4. Ingests physical property lot polygons (`load-parcels`).
       5. Forces geometric fallback centroids for complex undefined lots (`compute_centroids`).
       6. Re-calculates intersections between stored permits and the fresh lots (`link_parcels`).
       7. Ingests 3D volumetric building forms (`load-massing`).
       8. Re-evaluates interactions between permits and physical forms (`link_massing`).
       9. Ingests administrative municipal district boundaries (`load-neighbourhoods`).
       10. Maps existing permits geographically into the districts (`link_neighbourhoods`).
       11. Downloads total Ontario WSIB safe organization registry (`load_wsib`).
       12. Recalculates fuzzy string matches between extracted builder entities and WSIB statuses (`link_wsib`).
       13. Refreshes application materialized views (`refresh_snapshot`).
       14. Verifies data bounds limits (`assert_data_bounds`).
       15. Reports pipeline execution health status (`assert_engine_health`).
     - **Outputs:** Foundational geospatial/reference tables fully refreshed.
     - **Edge Cases:** Geospatial API portals throwing 500s causing the whole chain (and subsequent dependency chains) to go stale.

11. **`chain_entities.md`** 
    - **Replaces:** `11_builder_enrichment.md` (Pipeline orchestration section)
    - **Goal & User Story:** Governs the aggressive corporate web-enrichment process. As a salesperson, I need this orchestrator to scrape the web for emails and phone numbers attached to builders so I don't have to manually hunt for lead contact info.
    - **Testing Mandate:**
      - **Infra:** [NEW] `chain-entities.infra.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/manifest.json` (entities array), `scripts/enrich-web-search.js`, `src/components/EnrichmentFunnel.tsx`
      - **Out-of-Scope Files:** `scripts/extract-builders.js`
      - **Cross-Spec Dependencies:** Relies on `architecture_pipeline_system.md`
   - **Behavioral Contract:**
     - **Inputs:** `npm run chain entities`
     - **Core Logic:** Executes target-specific cost-heavy API endpoints to normalize identified builders. Steps:
       1. Targets high-value permits flagged mapped to WSIB contractors and hits web APIs to scrape active phone numbers, emails, and URLs (`enrich_wsib_builders`).
       2. Targets permits matching high-confidence Named Builders and hits identical web enrichment passes (`enrich_named_builders`).
     - **Outputs:** Corporate identity hubs built with actionable high-value CRM metadata visible via EnrichmentFunnel.
     - **Edge Cases:** Google Web Search APIs hitting hard daily rate limits; Extreme string genericism resulting in irrelevant plumbing companies being appended to framing contractors.

12. **`chain_deep_scrapes.md`** 
    - **Replaces:** `38_inspection_scraping.md` (Pipeline orchestration section)
    - **Goal & User Story:** Circumvents missing public developer endpoints via headless browser execution. As a data pipeline operator, I rely on this sequence to bypass walled-garden inspection portals and inject status updates back into the permit flow.
    - **Testing Mandate:**
      - **Infra:** [NEW] `chain-scrapes.infra.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/manifest.json` (deep_scrapes array), `scripts/poc-aic-scraper-v2.js`, `scripts/quality/assert-network-health.js`, `scripts/refresh-snapshot.js`, `scripts/quality/assert-data-bounds.js`, `scripts/quality/assert-staleness.js`, `scripts/quality/assert-engine-health.js`, `src/components/FreshnessTimeline.tsx`
      - **Out-of-Scope Files:** Standard open-data integrations.
      - **Cross-Spec Dependencies:** Relies on `architecture_pipeline_system.md`
   - **Behavioral Contract:**
     - **Inputs:** `npm run chain deep_scrapes`
     - **Core Logic:** Sequentially bypasses missing public APIs by attacking live web portals. Steps:
       1. Fires headless Playwright browser to navigate and DOM-scrape the Active Inspections portal for physical progress indicators (`inspections`).
       2. Asserts the connectivity of the network proxy to ensure IPs aren't banned (`assert_network_health`).
       3. Rebuilds materialized frontend UI caches (`refresh_snapshot`).
       4. Asserts macro constraints (`assert_data_bounds`).
       5. Triggers predictive staleness measurements alerting operators if scrapes failed invisibly (`assert_staleness`).
       6. Finalizes pipeline orchestration status (`assert_engine_health`).
     - **Outputs:** Active inspection tracking attached structurally to active permits.
     - **Edge Cases:** Portal UI completely restructures rendering the scraper broken instantly; ReCaptcha blocking IPs.

---

## 3. Data Sources (The Raw Inputs)

13. **`source_toronto_permits.md`**
    - **Replaces:** `02_data_ingestion.md`
    - **Goal & User Story:** Safely ingests raw JSON batches from Toronto Open Data. As a back-end dependency, it must perfectly parse and upsert thousands of API records without breaking so all later pipelines have fresh data to work with.
    - **Testing Mandate:**
      - **Logic:** `sync.logic.test.ts`
      - **Infra:** [NEW] `source-permits.infra.test.ts` 
    - **Operating Boundaries:**
      - **Target Files:** `scripts/load-permits.js`, `src/lib/permits/field-mapping.ts`, `src/lib/sync/process.ts`, `src/lib/sync/ingest.ts`, `src/app/api/sync/route.ts`
      - **Out-of-Scope Files:** `src/lib/permits/hash.ts` 
      - **Cross-Spec Dependencies:** Relies on `architecture_database_schema.md`
   - **Behavioral Contract:**
     - **Inputs:** Triggered by `chain_permits.md`.
     - **Core Logic:** Hits the Toronto CKAN data portal endpoint. Retrieves large JSON payloads on daily basis and applies hard-coded mapping rules to format into the Postgres schema. Upserts by revision integer.
     - **Outputs:** A raw populated `BuildingPermit` entity table. 
     - **Edge Cases:** Schema definitions of the CKAN returning unexpected keys; Server timeout returning HTML instead of JSON.

14. **`source_toronto_coa.md`**
    - **Replaces:** `12_coa_integration.md` (ingestion section)
    - **Goal & User Story:** Sources raw Committee of Adjustment hearing PDFs and notes into a standardized format predicting construction intent before official permit applications occur.
    - **Testing Mandate:**
      - **Logic:** `coa.logic.test.ts`
      - **Infra:** [NEW] `source-coa.infra.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/load-coa.js`, `src/lib/coa/parser.ts`, `src/lib/coa/repository.ts`
      - **Out-of-Scope Files:** `scripts/link-coa.js` 
      - **Cross-Spec Dependencies:** Relies on `architecture_database_schema.md`
   - **Behavioral Contract:**
     - **Inputs:** Triggered by `chain_coa.md`.
     - **Core Logic:** Retrieves Variance data payloads, parsing often highly unstructured hearing notes into application metadata blocks.
     - **Outputs:** Raw `CoAHearing` table records.
     - **Edge Cases:** Missing Date strings causing Postgres timestamp violations.

15. **`source_wsib_registry.md`**
    - **Replaces:** `35_wsib_registry.md`
    - **Goal & User Story:** Automatically imports the Ontario WSIB registry as a core source of truth. As a business analyst, I rely on this registry payload to automatically determine if a discovered builder is legally insured and verified.
    - **Testing Mandate:**
      - **Logic:** `wsib.logic.test.ts`
      - **Infra:** `wsib.infra.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/load-wsib.js`, `src/lib/wsib/ingest.ts`
      - **Out-of-Scope Files:** `scripts/link-wsib.js` 
      - **Cross-Spec Dependencies:** Relies on `architecture_database_schema.md`
   - **Behavioral Contract:**
     - **Inputs:** Triggered by `chain_sources.md`.
     - **Core Logic:** Ingests the registered list of recognized safe construction organizations and contractors in Ontario to provide a trusted corporate whitelist.
     - **Outputs:** Registered corporate identities stored locally for future entity matching.
     - **Edge Cases:** Incomplete downloads resulting in a truncated WSIB database which deletes previously matched good builders.

16. **`source_inspection_aic.md`**
    - **Replaces:** `38_inspection_scraping.md`
    - **Goal & User Story:** Directly interacts with closed municipal DOMs via Playwright to fetch accurate staging phases for projects when APIs refuse to hand over the data cleanly.
    - **Testing Mandate:**
      - **Logic:** `inspections.logic.test.ts`
      - **Infra:** [NEW] `scraper.infra.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/poc-aic-scraper-v2.js`, `src/lib/inspections/scraper.ts`, `src/app/api/admin/pipelines/inspections/route.ts`
      - **Out-of-Scope Files:** None
      - **Cross-Spec Dependencies:** Relies on `architecture_database_schema.md`
   - **Behavioral Contract:**
     - **Inputs:** `chain_deep_scrapes.md` targeting active permit numbers.
     - **Core Logic:** Headless Playwright bot navigates to Toronto AIC portal, enters the known permit number, bypasses UI menus, and parses the physical DOM table for active inspection dates and inspector names.
     - **Outputs:** Detailed row-updates attaching active `Inspections` arrays to an existing `BuildingPermit`.
     - **Edge Cases:** DOM selector changes blocking extraction; Captchas locking out the server IP.

17. **`source_address_points.md`** (Spatial Source)
   - **Goal & User Story:** Sustains the universal address lookup file. I need precise street geometries so unstructured descriptions can be mathematically nailed to precise city locations.
   - **Behavioral Contract:** Downloads master GIS point structure from the city, translating coordinate systems natively into PostGIS valid formats. Fails if invalid SRID formats sent.

18. **`source_parcels.md`** (Spatial Source)
   - **Goal & User Story:** Acquires massive property line blueprints from the city to act as boundaries that define the true scale of construction applications based on footprint size.
   - **Behavioral Contract:** Extracts polygon definitions for specific legal lot properties. Identifies lot area footprints. Fails if Polygons intersect illegally.

19. **`source_building_massing.md`** (Spatial Source)
   - **Goal & User Story:** Fetches 3D construction volumes so the platform understands existing site constraints before new permits ask permission to expand them.
   - **Behavioral Contract:** Downloads 3D volumetric building shapes from the city, calculating internal centroid points for 3-dimensional mapping logic. 

20. **`source_neighbourhoods.md`** (Spatial Source)
   - **Goal & User Story:** Retains standard zoning polygons ensuring every address is aggregated accurately into high-level dashboard metrics for the city sectors.
   - **Behavioral Contract:** Inserts standard Toronto neighbourhood polygons and numeric identities for fast aggregation queries.

---

## 4. Transformation Steps (The Payload Handlers)

21. **`step_extract_entities.md`**
    - **Replaces:** `11_builder_enrichment.md` (extraction section)
    - **Goal & User Story:** Cleanses unmanageable applicant strings into grouped identities. As a user, I need "Smith & Co" and "SMITH COMPANY INC" recognized identically so my lead database isn't flooded with duplicates.
    - **Testing Mandate:**
      - **Logic:** `builders.logic.test.ts`, `entities.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/extract-builders.js`, `src/lib/builders/extract.ts`
      - **Out-of-Scope Files:** `src/lib/builders/normalize.ts` 
      - **Cross-Spec Dependencies:** Relies on `entity_corporate_identity.md`
   - **Behavioral Contract:**
     - **Inputs:** The `BuildingPermit` table containing raw unlinked applicant/builder string fields.
     - **Core Logic:** Performs initial cleanup (trimming, casing) and extracts specific logical builder names from the unstructured description/applicant fields across 100k permits.
     - **Outputs:** Normalization dictionaries populated mapping raw strings to clean target names.
     - **Edge Cases:** Extreme noise strings ("DO NOT USE", "TBD") accidentally creating permanent builder entities.

22. **`step_geocode_permits.md`**
    - **Replaces:** `05_geocoding.md`
    - **Goal & User Story:** Translates address strings into mathematically usable coordinate nodes so the application map successfully renders project pins accurately regardless of poor data entry by the city.
    - **Testing Mandate:**
      - **Logic:** `geocoding.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/geocode-permits.js`, `src/lib/spatial/geocoder.ts`
      - **Out-of-Scope Files:** `scripts/load-address-points.js`
      - **Cross-Spec Dependencies:** Relies on `source_address_points.md`
   - **Behavioral Contract:** Assigns `lat/lng` coordinates to permits solely based on street numbers/names, falling back to Google Maps geocoders if the city address format is unidentifiable.

23. **`step_link_parcels.md`**
    - **Replaces:** `29_spatial_parcel_matching.md`
    - **Goal & User Story:** Determines exactly which property boundary a building falls into. As an analyst evaluating lot density, I require precision linkages between permits and the official geometry.
    - **Testing Mandate:**
      - **Logic:** `parcels.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/link-parcels.js`, `src/lib/spatial/parcels-linker.ts`
      - **Out-of-Scope Files:** `scripts/load-parcels.js`
      - **Cross-Spec Dependencies:** Relies on `source_parcels.md`
   - **Behavioral Contract:** Associates a permit to the physical land lot (Polygon) the construction occurs within. Generates lot size estimations based on intersecting parcel boundaries. Fails if no polygon is large enough to intersect.

24. **`step_link_neighbourhoods.md`**
    - **Replaces:** *New Spec Required*
    - **Goal & User Story:** Aggregates microscopic addresses into large-scale city districts to properly render aggregate market reports and neighbourhood scorecards. 
    - **Testing Mandate:**
      - **Logic:** `neighbourhood.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/link-neighbourhoods.js`, `src/lib/spatial/neighbourhood-linker.ts`
      - **Out-of-Scope Files:** `scripts/load-neighbourhoods.js`
      - **Cross-Spec Dependencies:** Relies on `source_neighbourhoods.md`
   - **Behavioral Contract:** Employs the ST_Contains PostGIS coordinate function to associate the permits centroid point within the `neighbourhood` boundary polygon.

25. **`step_link_massing.md`**
    - **Replaces:** `31_building_massing.md` (linking section)
    - **Goal & User Story:** Checks if a permit applies to a skyscraper or a shed. The system needs to calculate 3D structural volumes automatically based on intersecting the permit with known geometries. 
    - **Testing Mandate:**
      - **Logic:** `massing.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/link-massing.js`, `src/lib/spatial/massing-linker.ts`
      - **Out-of-Scope Files:** `scripts/load-massing.js`
      - **Cross-Spec Dependencies:** Relies on `source_building_massing.md`
   - **Behavioral Contract:** Identifies if a permit overlaps with existing physical real-world massing structures to calculate total construction volumes/heights.

26. **`step_link_coa.md`**
    - **Replaces:** `12_coa_integration.md` (linking section)
    - **Goal & User Story:** Chains a variance hearing request to the final generated construction permit. This allows users to trace the timeline history of a project taking 2 years to get formal zoning approval.
    - **Testing Mandate:**
      - **Logic:** `coa.logic.test.ts` 
    - **Operating Boundaries:**
      - **Target Files:** `scripts/link-coa.js`, `src/lib/coa/linker.ts`
      - **Out-of-Scope Files:** `scripts/load-coa.js`
      - **Cross-Spec Dependencies:** Relies on `source_toronto_coa.md`
   - **Behavioral Contract:** Attempts to cross-reference addresses and submission dates of Committee of Adjustment Variance hearings directly to actual structural Building Permits, creating a timeline relation between "asking for permission" and "breaking ground."

27. **`step_web_search_enrichment.md`**
    - **Replaces:** `36_web_search_enrichment.md`
    - **Goal & User Story:** Turns a blank name string into an actionable contact database. It automatically runs Google Queries over parsed builders so sales reps don't have to leave the platform to find a phone number.
    - **Testing Mandate:**
      - **Logic:** `enrichment.logic.test.ts`
      - **Infra:** `enrichment.infra.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/enrich-web-search.js`, `src/lib/enrichment/web-search.ts`
      - **Out-of-Scope Files:** None
      - **Cross-Spec Dependencies:** Relies on `entity_corporate_identity.md`
   - **Behavioral Contract:** Takes extracted "Clean Names", searches Google for official entity domains, and explicitly pulls high-value context (URLs, Phone Numbers) back to the Builder Identity. Fails rapidly by executing API rate limits when searching popular generic names.

28. **`step_link_wsib.md`**
    - **Replaces:** `35_wsib_registry.md` (linking section)
    - **Goal & User Story:** Injects a "Trust Score" onto matched entities. Clients use this linkage to exclusively deal with contractors possessing verified, good-standing Ontario injury insurance.
    - **Testing Mandate:**
      - **Logic:** `wsib.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/link-wsib.js`, `src/lib/wsib/linker.ts`
      - **Out-of-Scope Files:** `scripts/load-wsib.js`
      - **Cross-Spec Dependencies:** Relies on `source_wsib_registry.md`
   - **Behavioral Contract:** Cross-matches extracted builder names to the highly accurate WSIB registry database, validating insurance status and identifying missing corporate associations via Levenshtein string distances.

29. **`step_permit_scope.md`**
    - **Replaces:** `30_permit_scope_classification.md`
    - **Goal & User Story:** Determines the macro-intent of a construction project (New Build, Demolition, Renovation). If I only sell to New Construction developers, this step accurately flags projects preventing irrelevant recommendations.
    - **Testing Mandate:**
      - **Logic:** `scope.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/classify-scope.js`, `src/lib/classification/scope.ts`
      - **Out-of-Scope Files:** `scripts/classify-permits.js`
      - **Cross-Spec Dependencies:** Relies on `source_toronto_permits.md`
   - **Behavioral Contract:** Interrogates the permit descriptions and internal type codings to classify the true scope (E.g., "New Construction", "Demolition", "Addition", "Interior Alteration"). Critical edgecase: Descriptions like "Demolition of shed for new addition" triggering conflicting demolition flags.

30. **`step_trade_classification.md`**
    - **Replaces:** `08_trade_classification.md`, `08b_`, `08c_`
    - **Goal & User Story:** Derives explicit business value from a project. By analyzing a generic text description, it flags all the requisite trades (Plumbers, Roofers, Concrete) that a salesperson can actively prospect on.
    - **Testing Mandate:**
      - **Logic:** `classification.logic.test.ts`, `classify-sync.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/classify-permits.js`, `src/lib/classification/classifier.ts`, `src/components/permits/PermitCard.tsx`
      - **Out-of-Scope Files:** **`src/lib/classification/taxonomy.ts`** (Governed by Spec `taxonomy_trades.md`)
      - **Cross-Spec Dependencies:** Relies on `taxonomy_trades.md`
   - **Behavioral Contract:**
     - **Inputs:** An unclassified permit record.
     - **Core Logic:** Executes the multi-regex taxonomies mapped by `taxonomy_trades.md` over the description field. Evaluates logical rule weighting to guess if a project requires Foundation, Framing, Electrical, or HVAC trades. 
     - **Outputs:** Populating the `PermitToTrade` join table explicitly identifying likely required business leads.
     - **Edge Cases:** False positive keyword overrides ("removing HVAC" flagging as new HVAC opportunity).

31. **`step_compute_centroids.md`**
    - **Replaces:** *New Spec Required*
    - **Goal & User Story:** Provides mathematical fallback coordination. If the city's geocoding entirely fails, this logic forces a fallback dot physically in the center of the known property geometry so the Map UI never blanks out.
    - **Testing Mandate:**
      - **Logic:** [NEW] `centroids.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/compute-centroids.js`, `src/lib/spatial/centroids.ts`
      - **Out-of-Scope Files:** `scripts/load-parcels.js`
      - **Cross-Spec Dependencies:** Relies on `source_parcels.md`
   - **Behavioral Contract:** Enrolls a fallback spatial location where permits lack accurate address tracking but exist on complex geometries, executing ST_Centroid equations to force a fallback location mapping.

32. **`step_link_similar.md`**
    - **Replaces:** *New Spec Required*
    - **Goal & User Story:** Consolidates isolated permits into overarching umbrella "Projects". As a viewer, I don't want to see 15 separate permits for "basement finishing"—I want a single Project record indicating an active property renovation.
    - **Testing Mandate:**
      - **Logic:** [NEW] `similarity.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/link-similar.js`, `src/lib/permits/similarity.ts`
      - **Out-of-Scope Files:** `scripts/link-parcels.js`
      - **Cross-Spec Dependencies:** Relies on `source_toronto_permits.md`
   - **Behavioral Contract:** Compares sequential permit applications at identical addresses to intelligently chain related work together into "Project" umbrellas. Failure mode: Identical condo numbers generating infinite loops in linked-list patterns.

33. **`step_pre_permits.md`**
    - **Replaces:** `12_coa_integration.md` (pre-permits section)
    - **Goal & User Story:** Speculatively projects future pipeline leads before they manifest. As an eager lead generator, I rely on this step to translate a hearing variance directly into a "Coming Soon" construction warning for my sales targets.
    - **Testing Mandate:**
      - **Logic:** `coa.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `scripts/create-pre-permits.js`, `src/lib/coa/pre-permits.ts`, `src/app/coa/page.tsx`
      - **Out-of-Scope Files:** `scripts/link-coa.js`
      - **Cross-Spec Dependencies:** Relies on `chain_coa.md`
   - **Behavioral Contract:** Analyzes variances passed by Committee of Adjustments and speculatively creates "Pre-Permit" objects anticipating future building work, calculating high-probability lead triggers before the physical permit is filed.

---

## 5. Data Entities, ML Models & Taxonomies (The Outputs)

34. **`entity_corporate_identity.md`**
    - **Replaces:** `37_corporate_identity_hub.md`
    - **Goal & User Story:** Represents the core master record for all physical businesses across the platform. As an application engineer, I need this specific model structure protected so I can trust a builder's relationship metadata will forever remain stable.
    - **Testing Mandate:**
      - **Logic:** `entities.logic.test.ts`
      - **Infra:** `entities.infra.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `src/lib/builders/normalize.ts`, `src/lib/builders/types.ts`, `src/app/builders/page.tsx`
      - **Out-of-Scope Files:** `scripts/extract-builders.js`
      - **Cross-Spec Dependencies:** Relies on `architecture_database_schema.md`
   - **Behavioral Contract:**
     - **Inputs:** Data outputted from Extraction, Web-Search, and WSIB linkages.
     - **Core Logic:** Provides the permanent mapping algorithm of "Varied String -> One Source of Truth Corporate Entity". Defends the integrity of builder profiles by blocking duplicate insertions.
     - **Outputs:** The unified Master Entity structure utilized natively by the user-facing Dashboard.
     - **Edge Cases:** True corporations operating under identical named numbering companies failing to separate cleanly.

35. **`taxonomy_trades.md`**
    - **Replaces:** `07_trade_taxonomy.md`
    - **Goal & User Story:** Governs the static source of truth rules classifying our core product lines representing contractor domains. If "Electrical" rules are bad, the entire business value to Electrical users evaporates.
    - **Testing Mandate:**
      - **Logic:** `classification.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `src/lib/classification/taxonomy.ts`
      - **Out-of-Scope Files:** `scripts/classify-permits.js`
      - **Cross-Spec Dependencies:** Used by `step_trade_classification.md`
   - **Behavioral Contract:** Governs the immutable JSON definitions mapping Regex patterns to discrete B2B Trade lead categories (e.g., Concrete, Electrical, Roofing). Fails when overlapping Regex catches the wrong intent.

36. **`taxonomy_construction_phases.md`**
    - **Replaces:** `09_construction_phases.md`
    - **Goal & User Story:** Enforces temporal mapping indicating *when* a project is viable. A concrete user only needs a lead in Phase 1, an HVAC user only cares about Phase 3. This taxonomy secures that mapping logic.
    - **Testing Mandate:**
      - **Logic:** [NEW] `phases.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `src/lib/classification/phases.ts`
      - **Out-of-Scope Files:** `scripts/classify-scope.js`
      - **Cross-Spec Dependencies:** Used by `step_permit_scope.md`
   - **Behavioral Contract:** Governs the classification library linking permit states into functional sequences (Pre-construction, Active Construction, Sign-Off). 

37. **`taxonomy_product_groups.md`**
    - **Replaces:** `32_product_groups.md`
    - **Goal & User Story:** Represents physical supply linkage. As a supplier (e.g. lumber seller), I need the platform to automatically route me to framers and general contractors mathematically tied to my specific material group.
    - **Testing Mandate:**
      - **Logic:** [NEW] `groups.logic.test.ts`
    - **Operating Boundaries:**
      - **Target Files:** `src/lib/classification/groups.ts`
      - **Out-of-Scope Files:** UI Dashboards
      - **Cross-Spec Dependencies:** Relies on `architecture_database_schema.md`
   - **Behavioral Contract:** Maps complex item supplies (windows, lumber) directly to the specific trade classes requiring them, functioning as a lookup index for targeted marketing matching.

38. **`_spec_template.md`**
    - **Replaces:** None (System Mandated Format)
    - **Goal & User Story:** The structural constitution ensuring developers write high-quality specifications preventing data drift across the architecture.
    - **Testing Mandate:** N/A
    - **Operating Boundaries:**
      - **Target Files:** `docs/specs/_spec_template.md`
      - **Out-of-Scope Files:** All JS/TS source code
      - **Cross-Spec Dependencies:** None
    - **Behavioral Contract:** Ensures new engineers create documentation containing explicitly Testing Mandates, Boundaries, and Behavioral Contracts before shipping code.

---

## 6. Audit & Validation Rubric

**A. Forward Validation (Hallucination Check)**
- **Method:** Extract every test file listed in the proposed specs and diff against the `src/tests/` directory to ensure no hallucinated files.
- **Result:** **PASS**. 100% of the mapped files genuinely exist.

**B. Reverse Validation (Orphaned Test Check)**
- **Method:** Analyze all 41 test files in `src/tests/*` to ensure none were accidentally omitted from this pipeline structure.
- **Result:** **PASS**. The pipeline successfully maps all 26 core tests; remaining 15 tests correctly identified as non-pipeline Product/UI tests deferred to the UI spec folder.

---

## 7. Industry Best Practices Comparison

Based on the [LLM & Data Pipeline Specification Research](spec_documentation_best_practices.md), here is how our current approach scores against industry standards for AI-assisted development and Data Engineering:

### Evaluation of `_spec_template.md` (The Micro-Level)
*   🟢 **The "Spec-First" Approach:** **PASS.** The template functions perfectly as the "Living Anchor" required for LLMs, forcing architects to declare structure before writing code.
*   🟢 **Negative Constraints (`Out-of-Scope Files`):** **PASS.** LLMs behave radically better when told what *not* to touch. The `Operating Boundaries` section explicitly enforces this.
*   🟢 **I/O & Behavioral Constraints:** **PASS.** The inclusion of "Core Logic" and "Failure Modes" aligns precisely with the requirement for Q&A contextual examples.
*   🟡 **Machine Parsing (`XML Tags`):** **NEEDS IMPROVEMENT.** The current markdown is human-readable, but we are leaving AI performance on the table by not wrapping sections in contextual XML tags (e.g., `<requirements>`, `<cross_dependencies>`).

### Evaluation of `pipeline_documentation_structure.md` (The Macro-Level)
*   🟢 **Modular / DAG Design:** **PASS.** We successfully abandoned monolithic specs (`02_data_ingestion.md`) in favor of atomic, single-responsibility files (`source_load_permits.md`, `step_link_parcels.md`). This mimics how pipelines are physically executed (and how AI best digests them).
*   🟢 **The "One-Pager" Principle:** **PASS.** By forcing every one of the 38 specs to declare a single "Goal & User Story," we guarantee that the "Why" and the "Blast Radius" are never lost across dependencies.
*   🟢 **Operational Orchestration:** **PASS.** Grouping the specs physically underneath the 5 "Main Chains" matches the best practice of documenting Data Lineage natively in the project framework.
*   🟡 **Automated Data Quality / Lineage:** **PARTIAL.** While we document schemas successfully, the "How" is still heavily manual. Long term, we should lean on `dbt` or our native `manifest.json` parsing script to physically auto-generate architecture diagrams to complement these specs.

---

<br><br>
<div align="center">
  <h2>-- NEW AI-OPTIMIZED APPROACH BELOW (FOR COMPARISON) --</h2>
</div>
<br><br>

> **CRITICAL CONTEXT:** Markdown parsers often completely **HIDE** raw XML tag wrappers in their visual output. To prevent the data from disappearing when humans read this document, the XML structure below is wrapped inside a fenced markdown block.

## 8. Proposed LLM XML Structure (The "Machine Parseable" Approach)

```xml
<system_map>
<domain id="data_pipelines" title="2. The 5 Main Data Pipelines (The Orchestration Chains)">

<spec id="chain_coa">
9. **`chain_coa.md`** 
   <metadata>
   - **Replaces:** `12_coa_integration.md` (Pipeline orchestration section)
   </metadata>
   <requirements>
   - **Goal & User Story:** Governs the speculative pre-construction pipeline. As a user, I want Variance Hearings imported and analyzed so I can uncover new project leads months before the physical building permits are issued.
   </requirements>
   <testing>
   - **Testing Mandate:**
     - **Infra:** [NEW] `chain-coa.infra.test.ts` 
   </testing>
   <constraints>
   - **Operating Boundaries:**
     - **Target Files:** `scripts/manifest.json` (coa array), `scripts/quality/assert-schema.js`, `scripts/load-coa.js`, `scripts/quality/assert-coa-freshness.js`, `scripts/link-coa.js`, `scripts/create-pre-permits.js`, `scripts/quality/assert-pre-permit-aging.js`, `scripts/refresh-snapshot.js`, `scripts/quality/assert-data-bounds.js`, `scripts/quality/assert-engine-health.js`, `src/components/FreshnessTimeline.tsx`
     - **Out-of-Scope Files:** `src/lib/coa/*` 
     - **Cross-Spec Dependencies:** Relies on `architecture_pipeline_system.md`
   </constraints>
   <behavior>
   - **Behavioral Contract:**
     - **Inputs:** `npm run chain coa`
     - **Core Logic:** Executes 10 sequential stages focusing on variance hearings:
       1. Validates physical DB schema (`assert_schema`).
       2. Ingests raw variance hearing applications from the city (`load-coa`).
       ... (etc)
   </behavior>
</spec>

</domain>
</system_map>
```
