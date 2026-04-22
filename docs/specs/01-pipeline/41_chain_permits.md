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
**Steps:** 27 (sequential, stop-on-failure)
**Gate:** `permits` — if `records_new = 0`, downstream enrichment steps are skipped (infra steps still run)

```
assert_schema → permits → close_stale_permits → classify_permit_phase →
classify_scope → builders → link_wsib → geocode_permits → link_parcels →
link_neighbourhoods → link_massing → link_similar → classify_permits →
compute_cost_estimates → compute_timing_calibration_v2 →
link_coa → create_pre_permits → refresh_snapshot → assert_data_bounds →
assert_engine_health → classify_lifecycle_phase → assert_lifecycle_phase_distribution →
compute_trade_forecasts → compute_opportunity_scores → update_tracked_projects →
assert_entity_tracing → assert_global_coverage
```

> **WF3 2026-04-13:** v1 `compute_timing_calibration` removed from the chain.
> The detail-page timing engine (spec 71, `src/features/leads/lib/timing.ts`)
> still reads the `timing_calibration` table; that table will go stale until
> a future frontend WF migrates it to read from `phase_calibration`.

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
| 14 | `compute_cost_estimates` | `compute-cost-estimates.js` | Pre-compute cost model estimates + Liar's Gate + 32-trade allocation slicer | cost_estimates |
| 15 | `compute_timing_calibration_v2` | `compute-timing-calibration-v2.js` | Compute phase-to-phase calibration medians from inspection stage pairs (P11→P12, etc.) — feeds the **spec 85 flight tracker** (step 22). Sole calibration step since WF3 2026-04-13 removed v1. | phase_calibration |
| 16 | `link_coa` | `link-coa.js` | Link CoA to permits via `street_name_normalized` + confidence matrix | coa_applications |
| 17 | `create_pre_permits` | `create-pre-permits.js` | Generate pre-permit leads from approved CoA applications | — |
| 18 | `refresh_snapshot` | `refresh-snapshot.js` | Update data_quality_snapshots for dashboard metrics | data_quality_snapshots |
| 19 | `assert_data_bounds` | `quality/assert-data-bounds.js` | Post-ingestion: cost outliers, null rates, duplicate PKs | pipeline_runs |
| 20 | `assert_engine_health` | `quality/assert-engine-health.js` | Dead tuples, seq scan ratio, update ping-pong | engine_health_snapshots |
| 21 | `classify_lifecycle_phase` | `classify-lifecycle-phase.js` | Computes `lifecycle_phase` + `lifecycle_stalled` for dirty permits and CoA applications (CoA stall via `logic_variables.coa_stall_threshold`, migration 094 added `lifecycle_stalled` to `coa_applications`). Uses `pg_try_advisory_lock(84)`. | permits, coa_applications, permit_phase_transitions |
| 22 | `assert_lifecycle_phase_distribution` | `quality/assert-lifecycle-phase-distribution.js` | Tier 3 CQA: verifies every lifecycle phase count is within expected ±10% band and unclassified count ≤ `lifecycle_unclassified_max`. Uses advisory lock 109 to skip gracefully if classifier is mid-write. Throws on failure (halting). | pipeline_runs |
| 23 | `compute_trade_forecasts` | `compute-trade-forecasts.js` | Phase 4 flight tracker: bimodal routing + stall recalibration + urgency classification (expired threshold from `logic_variables.expired_threshold_days`). Needs fresh lifecycle_phase anchors from step 21 and `phase_calibration` from step 15. | trade_forecasts |
| 24 | `compute_opportunity_scores` | `compute-opportunity-scores.js` | Intrinsic Value Engine: `clamp((tradeValue/divisor × perTradeMultiplier) − competitionPenalty, 0, 100)`. JOINs `trade_configurations` for per-trade `multiplier_bid`/`multiplier_work`. | trade_forecasts (opportunity_score) |
| 25 | `update_tracked_projects` | `update-tracked-projects.js` | CRM Assistant: two-path routing, state-change alerts, auto-archive on `urgency='expired'` (WF3 2026-04-13), lead_analytics sync. | tracked_projects, lead_analytics |
| 26 | `assert_entity_tracing` | `quality/assert-entity-tracing.js` | Tier 3 CQA: for permits seen in the last 26 hours, checks coverage rate across 5 downstream tables/columns (permit_trades ≥95%, cost_estimates ≥90%, trade_forecasts ≥90%, lifecycle_phase ≥95%, opportunity_score >0 rate ≥80%). Non-halting (observational). | pipeline_runs |
| 27 | `assert_global_coverage` | `quality/assert-global-coverage.js` | Tier 3 CQA: field-level coverage profile for every step. One row per table.column in the denominator matrix. PASS/WARN/FAIL per configurable thresholds from logic_variables. Non-halting (observational). Uses advisory lock 111. | pipeline_runs |

**Lifecycle classifier (step 21)** runs synchronously. The classifier's
incremental predicate (`last_seen_at > lifecycle_classified_at`) keeps
re-runs cheap (~5-7 seconds when no rows are dirty). First-run backfill
is ~130 seconds across ~240K rows; steady-state runs are incremental
and negligible. If two chains (permits + coa) finish within seconds of
each other, the second classifier invocation finds the advisory lock
(ID 84) held and exits cleanly with `skipped:true` in the records_meta.

**Phase distribution gate (step 22)** runs immediately after the
classifier to validate the output before the marketplace tail reads it.
Uses advisory lock 109 — if the classifier is still writing, the gate
skips with `reason: classifier_running` rather than producing a false-
positive band violation.

**Marketplace tail (steps 23-25)** runs after the classifier and phase
gate because all three scripts depend on fresh `lifecycle_phase` +
`phase_started_at` anchors. The tail is ordered by data dependency:
- Step 23 (`compute_trade_forecasts`) reads lifecycle anchors + phase
  calibration medians (step 15) + trade configurations.
- Step 24 (`compute_opportunity_scores`) reads the fresh forecasts +
  cost estimates (step 14) + lead_analytics (populated by step 25 on
  previous run).
- Step 25 (`update_tracked_projects`) reads the fresh scores + urgency
  stamps to decide which alerts to emit, then UPSERTs `lead_analytics`
  for tomorrow's step 24.

**Entity tracing gate (step 26)** runs last as an end-to-end sanity
check. Observational only — it never halts the chain but surfaces
coverage gaps in the audit_table visible in the admin dashboard.

All 4 marketplace scripts load their config via the shared
`loadMarketplaceConfigs(pool)` helper in `scripts/lib/config-loader.js`.
See `docs/reports/lifecycle_phase_implementation.md` for the full
decision tree and `scripts/quality/lifecycle-phase-sql-reproducer.sql`
for the round-trip correctness gate.
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

### Phase distribution (assert_lifecycle_phase_distribution, step 22)
| Check | Source | Threshold | Level |
|-------|--------|-----------|-------|
| Each phase count vs expected band | `permits.lifecycle_phase`, `coa_applications.lifecycle_phase` | ±10% band (±30% for <1000 rows) | FAIL (halting) |
| `unclassified_count` | live SQL | ≤ `lifecycle_unclassified_max` from logic_variables | FAIL (halting) |
| Cross-check: enriched_status=Stalled vs lifecycle_stalled=false | SQL | < 1000 = WARN, ≥ 1000 = FAIL | FAIL (halting) |

### Entity tracing (assert_entity_tracing, step 26)
| Check | Table/Column | Threshold | Level |
|-------|-------------|-----------|-------|
| permit_trades coverage | `permit_trades` (joined to new permits) | ≥ 95% | FAIL (non-halting) |
| cost_estimates coverage | `cost_estimates` (joined to new permits) | ≥ 90% | FAIL (non-halting) |
| trade_forecasts coverage | `trade_forecasts` (joined to new permits) | ≥ 90% | FAIL (non-halting) |
| lifecycle_phase populated | `permits.lifecycle_phase IS NOT NULL` | ≥ 95% of new permits | FAIL (non-halting) |
| opportunity_score scored | `trade_forecasts.opportunity_score > 0` rate | ≥ 80% of forecast rows | FAIL (non-halting) |

> **New permits window:** permits with `last_seen_at > NOW() - INTERVAL '26 hours'` (consistent with assert_data_bounds). The 26-hour window tolerates timing drift in daily chain scheduling.
</quality>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `chain.logic.test.ts` (permits chain definition, step count, ordering)
- **Logic:** `pipeline-sdk.logic.test.ts` (all 26 scripts use Pipeline SDK pattern)
- **Infra:** `quality.infra.test.ts` (CQA scripts exist, emit correct PIPELINE_SUMMARY)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `scripts/manifest.json` (permits chain array)
- All 26 scripts listed in the step breakdown above
- `scripts/quality/assert-lifecycle-phase-distribution.js` (wired at step 22)
- `scripts/quality/assert-entity-tracing.js` (new, wired at step 26)

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

**`is_active` is ALWAYS `true` (WF1, April 2026):** Phase-based time-gating was removed. Every classified trade match is immediately visible regardless of construction phase — a roofer sees a P3 (intake) permit as soon as it is classified. `PHASE_TRADES` mapping is retained solely for the `calculateLeadScore` +15 phase-match boost.

**PHASE_TRADES (lead-score boost only):** early_construction (excavation, shoring, demolition, concrete, waterproofing, drain-plumbing, temporary-fencing), structural (framing, structural-steel, masonry, roofing, plumbing, hvac, electrical, elevator, fire-protection), finishing (insulation, drywall, painting, flooring, glazing, trim-work, millwork-cabinetry, tiling, stone-countertops, caulking, solar, security), landscaping (landscaping, painting, decking-fences, eavestrough-siding, pool-installation)

**Testing:** `classification.logic.test.ts` (104 tests), `classify-sync.logic.test.ts`, `pipeline-sdk.logic.test.ts` (32 trades present)
