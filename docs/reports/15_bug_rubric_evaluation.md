# 25-Bug Evaluation Report — Phase 0: Triaged & Pruned
> **Last updated:** 2026-04-02
> **Methodology:** Archetype taxonomy + exemption rules applied to eliminate false positives.
> WF5 spot-check validation incorporated. Session fixes reflected.

---

## Archetype Taxonomy

### 1. Observers (Read-Only / Admin / Orchestration)
> Do not mutate business data. Immune to mutation, pagination, and spatial bugs.

`ai-env-check.mjs`, `audit_all_specs.mjs`, `generate-db-docs.mjs`, `generate-system-map.mjs`, `harvest-tests.mjs`, `local-cron.js`, `migrate.js`, `refresh-snapshot.js`, `run-chain.js`, `task-init.mjs`

### 2. Scrapers (External Network)
> Reach out to the internet. Vulnerable to rate limits, WAF blocks, async deadlocks.

`aic-orchestrator.py`, `aic-scraper-nodriver.py`, `enrich-web-search.js`, `geocode-permits.js`, `poc-aic-scraper-v2.js`, `spike-nodriver.py`

### 3. Ingestors (Bulk Loaders)
> Load raw data into initial DB tables. Vulnerable to memory overflows and idempotency failures.

`load-address-points.js`, `load-coa.js`, `load-massing.js`, `load-neighbourhoods.js`, `load-parcels.js`, `load-permits.js`, `load-wsib.js`, `seed-coa.js`, `seed-parcels.js`, `seed-trades.ts`

### 4. Mutators (Linkers / Classifiers)
> Read existing tables, apply business logic, update/link records. Vulnerable to state corruption.

`classify-inspection-status.js`, `classify-permit-phase.js`, `classify-permits.js`, `classify-scope.js`, `close-stale-permits.js`, `compute-centroids.js`, `create-pre-permits.js`, `enrich-wsib.js`, `extract-builders.js`, `link-coa.js`, `link-massing.js`, `link-neighbourhoods.js`, `link-parcels.js`, `link-similar.js`, `link-wsib.js`, `reclassify-all.js`

---

## Exemption Rules

| Rule | Bugs | Applies To | Exempt |
|------|------|-----------|--------|
| **A (Spatial)** | B10, B11, B12 | GIS scripts only: link-massing, link-parcels, link-neighbourhoods, compute-centroids, load-massing, load-parcels, load-neighbourhoods | All others |
| **B (Mutation)** | B13, B16, B18 | Ingestors + Mutators | Observers |
| **C (Pagination)** | B1, B3 | Mutators + Incremental Ingestors | Scrapers, Observers |
| **D (Rate Limit)** | B17 | Scrapers | All internal scripts |
| **E (Deep Metrics)** | B19–B23 | Ingestors, Mutators, Scrapers | Observers |

### WF5 Validation Overrides
These bugs were verified against source code and override the original rubric:

| Bug | Original Claims | Verified Real | Override Reason |
|-----|----------------|---------------|-----------------|
| B1 (OFFSET) | 8 FAIL | 1 (`reclassify-all.js`) | 7 were variable name coincidences or HTTP API pagination |
| B6 (Orphaned DB) | 9 FAIL | 0 | All scripts have proper pool cleanup (pipeline.run finally, or manual finally) |
| B11 (Bounding Box) | 25+ FAIL | 3 spatial scripts | Non-spatial scripts falsely flagged |
| B13 (rowCount) | ~15 FAIL | 4 remaining | 3 fixed this session, ~8 were plain UPDATE (not upsert) |
| B18 (Transactions) | ~30 FAIL | 0 real gaps | Scripts use pipeline.withTransaction(); classify-permit-phase intentionally atomic |

---

## Category 1: Pagination & Cursors
| Script | Type | B1: OFFSET | B2: Array Mutation | B3: Loop State |
|--------|------|-----------|-------------------|----------------|
| `ai-env-check.mjs` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `aic-orchestrator.py` | Scraper | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `aic-scraper-nodriver.py` | Scraper | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `audit_all_specs.mjs` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `classify-inspection-status.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-permit-phase.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-scope.js` | Mutator | ✅ PASS | ❌ FAIL | ❌ FAIL |
| `close-stale-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `compute-centroids.js` | Mutator | ✅ PASS | ✅ PASS | ❌ FAIL |
| `create-pre-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `enrich-web-search.js` | Scraper | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `enrich-wsib.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `extract-builders.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `generate-db-docs.mjs` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `generate-system-map.mjs` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `geocode-permits.js` | Scraper | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `harvest-tests.mjs` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `link-coa.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-massing.js` | Mutator | ✅ PASS | ✅ PASS | ❌ FAIL |
| `link-neighbourhoods.js` | Mutator | ✅ PASS | ✅ PASS | ❌ FAIL |
| `link-parcels.js` | Mutator | ✅ PASS | ✅ PASS | ❌ FAIL |
| `link-similar.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-wsib.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-address-points.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-coa.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-massing.js` | Ingestor | ✅ PASS | ✅ PASS | ❌ FAIL |
| `load-neighbourhoods.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-parcels.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-permits.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-wsib.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `local-cron.js` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `migrate.js` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `poc-aic-scraper-v2.js` | Scraper | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `reclassify-all.js` | Mutator | ❌ FAIL | ✅ PASS | ❌ FAIL |
| `refresh-snapshot.js` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `run-chain.js` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `seed-coa.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `seed-parcels.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `seed-trades.ts` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `spike-nodriver.py` | Scraper | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |
| `task-init.mjs` | Observer | ⬜ EXEMPT | ✅ PASS | ⬜ EXEMPT |

## Category 2: Memory & Orchestration
| Script | Type | B4: Memory Overflow | B5: Unhandled JSON | B6: Orphaned DB |
|--------|------|--------------------|--------------------|-----------------|
| `ai-env-check.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `aic-orchestrator.py` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `aic-scraper-nodriver.py` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `audit_all_specs.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-inspection-status.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-permit-phase.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-scope.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `close-stale-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `compute-centroids.js` | Mutator | ❌ FAIL | ❌ FAIL | ✅ PASS |
| `create-pre-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `enrich-web-search.js` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `enrich-wsib.js` | Mutator | ❌ FAIL | ✅ PASS | ✅ PASS |
| `extract-builders.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `generate-db-docs.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `generate-system-map.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `geocode-permits.js` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `harvest-tests.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-coa.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-massing.js` | Mutator | ❌ FAIL | ✅ PASS | ✅ PASS |
| `link-neighbourhoods.js` | Mutator | ✅ PASS | ❌ FAIL | ✅ PASS |
| `link-parcels.js` | Mutator | ✅ PASS | ❌ FAIL | ✅ PASS |
| `link-similar.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-wsib.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-address-points.js` | Ingestor | ✅ PASS | ❌ FAIL | ✅ PASS |
| `load-coa.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-massing.js` | Ingestor | ❌ FAIL | ✅ PASS | ✅ PASS |
| `load-neighbourhoods.js` | Ingestor | ✅ PASS | ❌ FAIL | ✅ PASS |
| `load-parcels.js` | Ingestor | ❌ FAIL | ❌ FAIL | ✅ PASS |
| `load-permits.js` | Ingestor | ✅ PASS | ❌ FAIL | ✅ PASS |
| `load-wsib.js` | Ingestor | ❌ FAIL | ✅ PASS | ✅ PASS |
| `local-cron.js` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `migrate.js` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `poc-aic-scraper-v2.js` | Scraper | ✅ PASS | ❌ FAIL | ✅ PASS |
| `reclassify-all.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `refresh-snapshot.js` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `run-chain.js` | Observer | ✅ PASS | ❌ FAIL | ✅ PASS |
| `seed-coa.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `seed-parcels.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `seed-trades.ts` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `spike-nodriver.py` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `task-init.mjs` | Observer | ✅ PASS | ❌ FAIL | ✅ PASS |

## Category 3: DB Performance & Querying
| Script | Type | B7: Substring CPU Scan | B8: Dynamic FTS | B9: Connection Starvation |
|--------|------|----------------------|-----------------|--------------------------|
| `ai-env-check.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `aic-orchestrator.py` | Scraper | ❌ FAIL | ✅ PASS | ✅ PASS |
| `aic-scraper-nodriver.py` | Scraper | ❌ FAIL | ✅ PASS | ✅ PASS |
| `audit_all_specs.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-inspection-status.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-permit-phase.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-scope.js` | Mutator | ❌ FAIL | ✅ PASS | ✅ PASS |
| `close-stale-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `compute-centroids.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `create-pre-permits.js` | Mutator | ❌ FAIL | ✅ PASS | ✅ PASS |
| `enrich-web-search.js` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `enrich-wsib.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `extract-builders.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `generate-db-docs.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `generate-system-map.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `geocode-permits.js` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `harvest-tests.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-coa.js` | Mutator | ✅ PASS | ❌ FAIL | ✅ PASS |
| `link-massing.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-neighbourhoods.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-parcels.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-similar.js` | Mutator | ❌ FAIL | ✅ PASS | ✅ PASS |
| `link-wsib.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-address-points.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-coa.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-massing.js` | Ingestor | ❌ FAIL | ✅ PASS | ✅ PASS |
| `load-neighbourhoods.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-parcels.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-permits.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-wsib.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `local-cron.js` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `migrate.js` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `poc-aic-scraper-v2.js` | Scraper | ❌ FAIL | ✅ PASS | ✅ PASS |
| `reclassify-all.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `refresh-snapshot.js` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `run-chain.js` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |
| `seed-coa.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `seed-parcels.js` | Ingestor | ❌ FAIL | ✅ PASS | ✅ PASS |
| `seed-trades.ts` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `spike-nodriver.py` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `task-init.mjs` | Observer | ✅ PASS | ✅ PASS | ✅ PASS |

## Category 4: GIS & Spatial Logic
> **Rule A applied:** Only GIS scripts evaluated. All others EXEMPT.

| Script | Type | B10: GeoJSON Output | B11: Bounding Box | B12: Turf.js Offload |
|--------|------|--------------------|--------------------|---------------------|
| `compute-centroids.js` | Mutator | ❌ FAIL | ❌ FAIL | ⬜ EXEMPT |
| `link-massing.js` | Mutator | ❌ FAIL | ❌ FAIL | ❌ FAIL |
| `link-neighbourhoods.js` | Mutator | ❌ FAIL | ❌ FAIL | ❌ FAIL |
| `link-parcels.js` | Mutator | ❌ FAIL | ❌ FAIL | ✅ PASS |
| `load-address-points.js` | Ingestor | ❌ FAIL | ⬜ EXEMPT | ⬜ EXEMPT |
| `load-massing.js` | Ingestor | ❌ FAIL | ❌ FAIL | ⬜ EXEMPT |
| `load-neighbourhoods.js` | Ingestor | ❌ FAIL | ❌ FAIL | ⬜ EXEMPT |
| `load-parcels.js` | Ingestor | ❌ FAIL | ❌ FAIL | ⬜ EXEMPT |
| *All other 36 scripts* | — | ⬜ EXEMPT | ⬜ EXEMPT | ⬜ EXEMPT |

## Category 5: Telemetry & Quality
> **Rule B applied:** Observers EXEMPT from B13. Session fixes reflected.

| Script | Type | B13: rowCount Trap | B14: Dry-Run Phantom | B15: Timezone Cast |
|--------|------|-------------------|---------------------|-------------------|
| `classify-inspection-status.js` | Mutator | ✅ PASS (fixed) | ✅ PASS | ✅ PASS |
| `classify-permit-phase.js` | Mutator | ✅ PASS (fixed) | ✅ PASS | ✅ PASS |
| `classify-permits.js` | Mutator | ✅ PASS (fixed) | ✅ PASS | ✅ PASS |
| `classify-scope.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `close-stale-permits.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `compute-centroids.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `create-pre-permits.js` | Mutator | ❌ FAIL | ✅ PASS | ✅ PASS |
| `enrich-wsib.js` | Mutator | ✅ PASS | ❌ FAIL | ✅ PASS |
| `extract-builders.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `geocode-permits.js` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-coa.js` | Mutator | ✅ PASS | ❌ FAIL | ✅ PASS |
| `link-massing.js` | Mutator | ❌ FAIL | ✅ PASS | ✅ PASS |
| `link-parcels.js` | Mutator | ❌ FAIL | ✅ PASS | ✅ PASS |
| `link-similar.js` | Mutator | ✅ PASS | ✅ PASS | ✅ PASS |
| `link-wsib.js` | Mutator | ✅ PASS | ❌ FAIL | ✅ PASS |
| `load-permits.js` | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |
| `load-wsib.js` | Ingestor | ❌ FAIL | ✅ PASS | ✅ PASS |
| `local-cron.js` | Observer | ⬜ EXEMPT | ✅ PASS | ❌ FAIL |
| *All other Observers* | Observer | ⬜ EXEMPT | ✅ PASS | ✅ PASS |
| *All other Ingestors* | Ingestor | ✅ PASS | ✅ PASS | ✅ PASS |

## Category 6: Script Resiliency & Mutational Safety
> **Rule B applied:** Observers EXEMPT from B16/B18. **Rule D:** Only Scrapers evaluated for B17.
> **B18 override:** All pipeline.run() scripts use withTransaction() — verified PASS.

| Script | Type | B16: Idempotency | B17: Rate Limit | B18: Transactions |
|--------|------|-----------------|-----------------|-------------------|
| `aic-orchestrator.py` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `aic-scraper-nodriver.py` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `enrich-web-search.js` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `geocode-permits.js` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `poc-aic-scraper-v2.js` | Scraper | ✅ PASS | ✅ PASS | ✅ PASS |
| `classify-inspection-status.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `classify-permit-phase.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `classify-permits.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `classify-scope.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `close-stale-permits.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `compute-centroids.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `create-pre-permits.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `enrich-wsib.js` | Mutator | ❌ FAIL | ⬜ EXEMPT | ✅ PASS |
| `extract-builders.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `link-coa.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `link-massing.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `link-neighbourhoods.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `link-parcels.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `link-similar.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `link-wsib.js` | Mutator | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `reclassify-all.js` | Mutator | ❌ FAIL | ⬜ EXEMPT | ✅ PASS |
| `load-permits.js` | Ingestor | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `load-coa.js` | Ingestor | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `load-massing.js` | Ingestor | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `load-parcels.js` | Ingestor | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| `load-wsib.js` | Ingestor | ✅ PASS | ⬜ EXEMPT | ✅ PASS |
| *All Observers* | Observer | ⬜ EXEMPT | ⬜ EXEMPT | ⬜ EXEMPT |
| *Remaining Ingestors/Seeds* | Ingestor | ✅ PASS | ⬜ EXEMPT | ✅ PASS |

## Category 7: Deep Observability Metrics
> **Rule E applied:** Observers EXEMPT. These are SDK-level feature requests, not per-script bugs.
> Recommend: WF1 epic to add velocity, queue age, null rates, bounds, and error taxonomy to pipeline SDK.

| Type | B19: Velocity | B20: Queue Age | B21: Null Rates | B22: Bounds | B23: Error Taxonomy |
|------|-------------|---------------|----------------|------------|---------------------|
| Observers (10) | ⬜ EXEMPT | ⬜ EXEMPT | ⬜ EXEMPT | ⬜ EXEMPT | ⬜ EXEMPT |
| Scrapers (6) | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS (2/6) | ❌ FAIL |
| Ingestors (10) | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS (4/10) | ❌ FAIL |
| Mutators (16) | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS (5/16) | ❌ FAIL |

**Note:** B19-B23 are aspirational SDK features. Fix in pipeline SDK `run()` to auto-instrument, then all 32 non-Observer scripts inherit the fix.

## Category 8: Infrastructure Defense
> These are orchestrator-level features, not per-script bugs.

| Script | Type | B24: Bloat Monitoring | B25: Pre-Flight Gate |
|--------|------|----------------------|---------------------|
| `run-chain.js` | Observer | ❌ FAIL | ❌ FAIL |
| `local-cron.js` | Observer | ❌ FAIL | ❌ FAIL |
| *All other 42 scripts* | — | ⬜ EXEMPT | ⬜ EXEMPT |

**Note:** B24/B25 belong in the chain orchestrator (`run-chain.js`), not individual scripts. Single WF1 epic.

---

## True Debt Summary (Post-Pruning)

### Scorecard
| Metric | Before Pruning | After Pruning |
|--------|---------------|---------------|
| Total cells (44 scripts × 25 bugs) | 1,100 | 1,100 |
| ❌ FAIL | ~450 | **~65** |
| ⬜ EXEMPT | 0 | **~380** |
| ✅ PASS | ~650 | **~655** |
| False positive rate | — | **~85%** of original FAILs were noise |

### Priority 1: HIGH — Will crash or corrupt
| Bug | Scripts | Fix |
|-----|---------|-----|
| B1: OFFSET pagination | `reclassify-all.js` | Rewrite to keyset WHERE |
| B4: Memory overflow | `compute-centroids`, `enrich-wsib`, `link-massing`, `load-massing`, `load-parcels`, `load-wsib` | pg-query-stream |
| B3: Loop state | `classify-scope`, `compute-centroids`, `link-massing`, `link-neighbourhoods`, `link-parcels`, `load-massing`, `reclassify-all` | Tombstone/max-iteration guards |

### Priority 2: MEDIUM — Observability gaps
| Bug | Scripts | Fix |
|-----|---------|-----|
| B5: Unhandled JSON | `compute-centroids`, `link-neighbourhoods`, `link-parcels`, `load-address-points`, `load-neighbourhoods`, `load-parcels`, `load-permits`, `run-chain`, `task-init`, `poc-aic-scraper-v2` | try/catch wrappers |
| B7: Substring CPU | `classify-scope`, `create-pre-permits`, `link-similar`, `seed-parcels`, `load-massing`, `aic-orchestrator`, `aic-scraper-nodriver`, `poc-aic-scraper-v2` | Functional indexes |
| B13: rowCount | `create-pre-permits`, `link-massing`, `link-parcels`, `load-wsib` | RETURNING + rows.length |

### Priority 3: LOW — Aspirational / SDK epics
| Bug | Scope | Fix |
|-----|-------|-----|
| B10/B11/B12: GIS | 8 spatial scripts | PostGIS offloading (WF1 epic) |
| B19-B23: Deep metrics | SDK-level | Instrument pipeline.run() (WF1 epic) |
| B24/B25: Infra defense | run-chain.js | Pre-flight bloat gate (WF1 epic) |
