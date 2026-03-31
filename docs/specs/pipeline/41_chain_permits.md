# Chain: Permits

<requirements>
## 1. Goal & User Story
As a business user, I expect this daily pipeline to ingest 237K+ raw Toronto building permits from CKAN open data, classify them by scope and trade, spatially link them to parcels/neighbourhoods/massing, extract builder entities, and produce scored leads — all without manual intervention.
</requirements>

---

<architecture>
## 2. Chain Definition

**Trigger:** `node scripts/run-chain.js permits` or `POST /api/admin/pipelines/chain_permits`
**Schedule:** Daily
**Steps:** 18 (sequential, stop-on-failure)
**Gate:** `permits` — if `records_new = 0`, downstream enrichment steps are skipped (infra steps still run)

```
assert_schema → permits → close_stale_permits → classify_permit_phase →
classify_scope → builders → link_wsib → geocode_permits → link_parcels →
link_neighbourhoods → link_massing → link_similar → classify_permits →
link_coa → create_pre_permits → refresh_snapshot → assert_data_bounds →
assert_engine_health
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `assert_schema` | `quality/assert-schema.js` | Pre-ingestion: validate CKAN metadata columns exist | pipeline_runs |
| 2 | `permits` | `load-permits.js` | Fetch permits from CKAN API (paginated 10K/page), upsert to DB | permits |
| 3 | `close_stale_permits` | `close-stale-permits.js` | Mark permits not seen in 30+ days as stale | permits |
| 4 | `classify_permit_phase` | `classify-permit-phase.js` | Assign construction phase (early/structural/finishing/landscaping) | permits |
| 5 | `classify_scope` | `classify-scope.js` | Classify project type + scope tags from descriptions | permits |
| 6 | `builders` | `extract-builders.js` | Extract/normalize builder names from applicant fields | entities |
| 7 | `link_wsib` | `link-wsib.js` | Match builders against Ontario WSIB registry | entities |
| 8 | `geocode_permits` | `geocode-permits.js` | Assign lat/lng via address point lookup or Google fallback | permits |
| 9 | `link_parcels` | `link-parcels.js` | Spatially link permits to property lot polygons | permit_parcels |
| 10 | `link_neighbourhoods` | `link-neighbourhoods.js` | Assign neighbourhood_id via point-in-polygon | permits |
| 11 | `link_massing` | `link-massing.js` | Link parcels to 3D building footprint volumes | parcel_buildings |
| 12 | `link_similar` | `link-similar.js` | Propagate scope tags between related permits at same address | permits |
| 13 | `classify_permits` | `classify-permits.js` | Deep trade classification via tag-trade matrix (32 trades) | permit_trades |
| 14 | `link_coa` | `link-coa.js` | Link Committee of Adjustment applications to permits | coa_applications |
| 15 | `create_pre_permits` | `create-pre-permits.js` | Generate pre-permit leads from approved CoA applications | — |
| 16 | `refresh_snapshot` | `refresh-snapshot.js` | Update data_quality_snapshots for dashboard metrics | data_quality_snapshots |
| 17 | `assert_data_bounds` | `quality/assert-data-bounds.js` | Post-ingestion: cost outliers, null rates, duplicate PKs | pipeline_runs |
| 18 | `assert_engine_health` | `quality/assert-engine-health.js` | Dead tuples, seq scan ratio, update ping-pong | engine_health_snapshots |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- CKAN API: `https://ckan0.cf.opendata.inter.prod-toronto.ca` (permits resource)
- Google Maps Geocoding API (fallback for unmatched addresses)
- WSIB registry (pre-loaded in `wsib_registry` table)
- Existing spatial reference tables: `address_points`, `parcels`, `building_footprints`, `neighbourhoods`

### Core Logic
1. **Schema validation** — CKAN metadata is checked for expected columns before fetching data. If columns are missing, the chain halts to prevent silent corruption of 237K+ rows.
2. **Permit ingestion** — Streaming JSON parser fetches from CKAN in 10K-row pages. Upserts via `ON CONFLICT (permit_num, revision_num) DO UPDATE` with SHA-256 hash-based change detection.
3. **Stale permit closure** — Permits not seen in 30+ days get `enriched_status` updated.
4. **Phase classification** — Assigns construction phase based on status + months since issued.
5. **Scope classification** — Dual-path (§7.2): `classifyScope()` in both `scope.ts` (TS API) and `classify-scope.js` (batch script). Produces `project_type` + `scope_tags[]`.
6. **Entity extraction** — Parses `builder_name` field into normalized entities. Groups "Smith & Co" / "SMITH COMPANY INC" into one entity.
7. **WSIB linking** — Fuzzy string match (Levenshtein) against Ontario WSIB registry for insurance verification.
8. **Geocoding** — Matches addresses against `address_points` table first (free, fast). Falls back to Google Maps API for unresolved addresses.
9. **Spatial linking** — Point-in-polygon for parcels, neighbourhoods. Nearest-neighbour for massing.
10. **Similar linking** — BLD permits propagate scope tags to companion permits (HVA, PLB, etc.) at same address.
11. **Trade classification** — Dual-path (§7.1): 32 trades via Tier 1 rules + tag-trade matrix + narrow-scope fallback. Produces `permit_trades` join table.
12. **CoA linking** — 3-tier cascade: exact address (0.95), fuzzy address+ward (0.60), description FTS (0.30-0.50).
13. **Pre-permits** — Approved CoA applications without linked permits become predictive leads.
14. **Snapshot refresh** — Aggregates all metrics into `data_quality_snapshots` for dashboard.
15. **Quality assertions** — Data bounds + engine health checks. Any FAIL verdict is logged but does not halt (CQA is observational, not blocking).

### Outputs
- `permits` table: 237K+ rows with scope, phase, coordinates, neighbourhood, enriched_status
- `permit_trades` table: trade classifications with confidence scores
- `entities` table: normalized builders with WSIB linkage
- `permit_parcels` table: spatial permit-to-parcel associations
- `coa_applications` table: linked_permit_num populated
- `data_quality_snapshots` table: daily snapshot row

### Edge Cases
- CKAN returns HTML instead of JSON (server error) → `assert_schema` catches drift, chain halts
- 0 new permits (no upstream changes) → gate-skip skips enrichment steps, infra steps still run
- Geocoding API quota exhausted → permits without coords get `NULL` lat/lng, downstream spatial linking skips them
- Mid-chain failure → partial enrichment state; re-running the full chain is idempotent (all scripts use `ON CONFLICT` upserts)
- Concurrent chain runs → `pipeline_runs` rows accumulate; `FOR UPDATE SKIP LOCKED` prevents queue conflicts
</behavior>

---

<quality>
## 4. Data Quality Assertions

### Pre-ingestion (assert_schema)
| Check | Source | Threshold |
|-------|--------|-----------|
| CKAN permit columns | CKAN datastore metadata | All expected columns present |

### Post-ingestion (assert_data_bounds)
| Check | Source | Threshold | Level |
|-------|--------|-----------|-------|
| `permits.est_const_cost` outliers | SQL | cost > $500M | FAIL |
| NULL rate: `description` | SQL | > 5% | WARN |
| NULL rate: `builder_name` | SQL | > 30% | WARN |
| Duplicate PKs | SQL | > 0 | FAIL |
| Referential: `permit_trades.trade_id` | SQL | orphans > 0 | FAIL |

### Engine health (assert_engine_health)
| Check | Source | Threshold | Level |
|-------|--------|-----------|-------|
| Dead tuple ratio | `pg_stat_user_tables` | > 10% | FAIL |
| Sequential scan dominance | `pg_stat_user_tables` | > 80% on 10K+ tables | WARN |
| Update ping-pong | `n_tup_upd / n_tup_ins` | > 2x | WARN |
</quality>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `chain.logic.test.ts` (permits chain definition, step count, ordering)
- **Logic:** `pipeline-sdk.logic.test.ts` (all 18 scripts use Pipeline SDK pattern)
- **Infra:** `quality.infra.test.ts` (CQA scripts exist, emit correct PIPELINE_SUMMARY)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `scripts/manifest.json` (permits chain array)
- All 18 scripts listed in the step breakdown above

### Out-of-Scope Files
- `src/lib/classification/classifier.ts` — governed by trade classification step spec
- `src/lib/classification/scope.ts` — governed by scope classification step spec
- `src/components/FreshnessTimeline.tsx` — governed by Spec 28

### Cross-Spec Dependencies
- **Relies on:** `pipeline_system.md` (SDK, orchestrator)
- **Relies on:** `chain_sources.md` (spatial reference tables must be populated first)
- **Consumed by:** `chain_coa.md` (shares `link_coa`, `create_pre_permits`, `refresh_snapshot`)
</constraints>
