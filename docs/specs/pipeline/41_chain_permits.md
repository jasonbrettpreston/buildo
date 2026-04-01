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
| 14 | `link_coa` | `link-coa.js` | Link CoA to permits via `street_name_normalized` + confidence matrix | coa_applications |
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
- **Shared steps:** See `60_shared_steps.md` for geocode_permits, link_parcels, link_neighbourhoods, link_massing, link_wsib, link_coa, create_pre_permits, refresh_snapshot
</constraints>

---

## Step Details (Single-Chain Steps)

### Step 5: Classify Scope (`classify-scope.js`)

**Dual Code Path (§7.2):** Both `src/lib/classification/scope.ts` (TS API) and `scripts/classify-scope.js` (batch) MUST produce identical output.

**Logic:**
1. Determine `project_type` from `work` field → `permit_type` → description keywords (first match wins)
2. Extract `scope_tags[]` via TAG_PATTERNS regex array against description + other fields
3. Add mandatory `useType` tag (residential/commercial/mixed-use) from `structure_type` + `permit_type`
4. For demolition permits, add `demolition` tag
5. BLD propagation: scope tags propagate to companion permits (HVA, PLB) at same address via `DISTINCT ON (base_num) ORDER BY revision_num DESC`

**Outputs:** `permits.project_type` (new_build/demolition/renovation/addition/repair/mechanical/other), `permits.scope_tags` (TEXT[]), `permits.scope_classified_at`

**Edge Cases:** "Demolition of shed for new addition" → `project_type = 'demolition'` (first match). Multiple BLD revisions → DISTINCT ON picks latest.

**Testing:** `scope.logic.test.ts` (255 tests), `classify-sync.logic.test.ts` (dual-path sync)

---

### Step 6: Extract Builder Entities (`extract-builders.js`)

**Logic:**
1. Query distinct `builder_name` values from `permits`
2. Normalize: trim, uppercase, remove noise ("DO NOT USE", "TBD", "N/A")
3. Group variant spellings into canonical entities
4. Upsert to `entities` via `ON CONFLICT (normalized_name) DO UPDATE`

**Edge Cases:** Noise strings filtered out. Numbered companies ("1234567 ONTARIO INC") kept as-is.

**Testing:** `builders.logic.test.ts`, `entities.logic.test.ts`

---

### Step 12: Link Similar Permits (`link-similar.js`)

**Logic:**
1. Find BLD permits with scope_tags. Propagate `scope_tags` + `project_type` to companion permits (HVA, PLB, DRN) sharing the same base number (`YY NNNNNN`)
2. Uses `DISTINCT ON (base_num) ORDER BY revision_num DESC` for latest BLD revision
3. DM permits without `demolition` tag get it added via `array_append`

**Edge Cases:** Multiple BLD revisions → deterministic pick. DM already has tag → guard prevents duplicates.

---

### Step 13: Trade Classification (`classify-permits.js`)

**Dual Code Path (§7.1):** Both `src/lib/classification/classifier.ts` (TS API) and `scripts/classify-permits.js` (batch) MUST stay in sync.

**32 trades** (IDs 1-32). Classification tiers:

| Tier | Method | Confidence |
|------|--------|------------|
| 1 | `trade_mapping_rules` DB rules | 0.90-1.00 |
| 2 | Tag-trade matrix (58 keys + 16 aliases) | 0.50-0.90 |
| 3 | Work-field fallback | 0.80 |
| 4 | Narrow-scope code fallback (PLB→plumbing, HVA→hvac, etc.) | 0.80 |

**Logic:**
1. Load active rules from `trade_mapping_rules` (fall back to ALL_RULES)
2. For each permit: Tier 1 → tag-trade matrix → work-field → narrow-scope
3. Determine construction phase per match (early_construction/structural/finishing/landscaping)
4. DELETE existing `permit_trades`, INSERT new matches with sub-batch at 4000 rows (§9.2)

**PHASE_TRADES:** early_construction (excavation, shoring, demolition, concrete, waterproofing, drain-plumbing, temporary-fencing), structural (framing, structural-steel, masonry, roofing, plumbing, hvac, electrical, elevator, fire-protection), finishing (insulation, drywall, painting, flooring, glazing, trim-work, millwork-cabinetry, tiling, stone-countertops, caulking, solar, security), landscaping (landscaping, painting, decking-fences, eavestrough-siding, pool-installation)

**Testing:** `classification.logic.test.ts` (104 tests), `classify-sync.logic.test.ts`, `pipeline-sdk.logic.test.ts` (32 trades present)
