# Active Task: WF1 #coa-pipeline-parity-phase-d — CoA Classification Scripts (Twin Extraction)

**Status:** Implementation (R5.1 in progress — authorized 2026-05-13 after second 3-reviewer triage pass)
**Workflow:** WF1 (Genesis — fourth phase of the larger WF2 #coa-pipeline-parity work)
**Domain Mode:** Backend/Pipeline
**Rollback Anchor:** `4605a6e` (current HEAD on main — Phase C complete)
**Parent WF:** WF2 #coa-pipeline-parity (Phase A spec amendments → Phase B schema → Phase C `lead_id` substrate → Phase D CoA classifiers → Phase E lifecycle engine → Phase F forecast extensions → Phase G PRE-permit retirement → Phase H legacy drops + R5.4-R5.6 rekeys)
**Predecessor:** WF1 #coa-pipeline-parity-phase-c (COMPLETE 2026-05-13; 4 commits + 0 CI hotfixes)

---

## Context

* **Goal:** Bring CoA (Committee of Adjustment) leads to **classification parity with permits**. After Phase D ships, every active CoA application has: a `lead_id` (already populated by Phase B trigger), spatial `lead_parcels` linkage, scope classification (`coa_type_class`, `project_type`, `scope_tags`), trade-tag assignments (via Tier-3 `trade_mapping_rules`), and a `cost_estimates` row keyed on the CoA lead_id. The downstream forecast/opportunity/CRM consumers (Phase F) can then consume CoA-stage leads end-to-end.
* **Why now:** Phase A spec amendments + Phase B schema + Phase C substrate are in place. The Phase B mirror trigger on `permit_trades` populates `lead_trades` for permits automatically — but CoA leads have no analogous classifier writing to `lead_trades`/`lead_parcels`/`cost_estimates`. Phase D fills that gap. Phase E (lifecycle engine) can't ship until CoA classification produces real data to validate distribution gates against.
* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.6 (canonical schema), §6.7 (granular lifecycle wiring — read-only here; Phase E writes), §6.8 (NEW script catalog — definitive contract), §6.9 (modified script registry), §6.11 Phase D (gate criteria), §6.11.1 Phase D (Per-Phase Execution References).
* **Standards referenced:**
  - `docs/specs/00_engineering_standards.md` — §2 Error Handling (logError mandate, unhappy-path tests), §3 Database (DECIMAL not float, IS DISTINCT FROM guards, parameterization), §5 Testing (typed factories, logic/infra/db.test.ts triad), §6 Centralized Logging
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` — §R1-R12 mandatory skeleton (advisory lock, getDbTimestamp, withTransaction, Zod validation, streamQuery, audit_table, emitMeta, idempotency); §12 §10 Self-Review Checklist (concurrency, atomicity, NULL safety, observability, spec compliance) MUST be walked item-by-item before every WF3-style fix and every Green Light
  - `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §7 — TS↔JS dual-path mirroring (applicable to any new shared lib that has both pipeline-script + admin-UI consumers)
  - `docs/specs/01-pipeline/42_chain_coa.md` §6.11.2 — **Template Extraction Pattern** (the canonical playbook for this phase: copy the existing twin, change source/key/target, inherit Spec 47 scaffolding for free)

---

## Phase D Scope — Twin Extraction Per Spec 42 §6.11.2 (R2.v2 revision after worktree + Gemini + DeepSeek + R0 audit)

**The user-explicit directive:** *"scripts for this phase should emulate the existing scripts — with almost identical functionality except for the source CoA. Building something new is crazy when we have a proven template."*

Per Spec 42 §6.11.2 + R0 audit findings: every new Phase D script has an existing twin in the codebase, and the twins encode the **production** design (not the aspirational tier-cascade in some spec text). Copy and parametrize — do not re-derive. The R0.8 audit confirmed: `trade_mapping_rules` has 0 Tier-2/Tier-3 rules; the actual production classifier is `classify-permits.js`'s inline `TAG_PATTERNS` scope-tag→trade matrix. Twin extraction of that matrix is the correct path.

### Twin pairings + advisory lock IDs (Spec 42 §6.8 — R2.v3 final after parcels audit)

**R2.v3 simplification (2026-05-13):** R0 audit of `parcels` table revealed it already has `addr_num_normalized`, `street_name_normalized`, AND `centroid_lat`/`centroid_lng`. Every parcel has a derived centroid. `link-coa-to-parcels.js` can do Tier 1 address match (no lat/lng required — mirrors `link-parcels.js` Tier 1a exactly), then back-fill `coa_applications.latitude` / `longitude` from the matched parcel's centroid as a final pass. **No separate `geocode-coa.js` script needed** — geocoding happens as a byproduct of parcel linking per Spec 42 §6.5 step 8 "or extension" option. Phase D scope collapses to 4 NEW scripts + 1 extension.

| New Phase D script | Existing twin | Advisory lock | Risk tier |
|---|---|---|---|
| `scripts/link-coa-to-parcels.js` (NEW — bundles neighbourhood lookup AND lat/lng back-fill from parcel centroid) | `scripts/link-parcels.js` (577 lines, lock 90) | 4201 | **HIGH** (biggest delta — key collapse + neighbourhood bundle + centroid back-fill; writes `lead_parcels` + `coa_applications.neighbourhood_id` + `coa_applications.latitude/longitude` + `coa_applications.parcel_linked_at`) |
| `scripts/classify-coa-scope.js` (NEW) | `scripts/classify-scope.js` (634 lines, lock 87) | 4202 | MED (stripped twin — drop residential branch + BLD-propagation; description-only input) |
| `scripts/classify-coa-trades.js` (NEW — twin uses `TAG_PATTERNS` matrix) | `scripts/classify-permits.js` (905 lines, lock 88) | 4203 | **HIGH** (twin the proven scope-tag→trade matrix; conditional realtor inclusion for residential CoA per Spec 42 §6.4; writes `lead_trades`) |
| `scripts/compute-coa-cost-estimates.js` (NEW) | `scripts/compute-cost-estimates.js` (491 lines, lock 83) | 4204 | **HIGH** (depends on R5.1-R5.3 outputs; explicit 6-table JOIN for lot_size + massing + neighbourhood demographics) |

Lock 4200 is freed (was tentatively reserved for the separate `geocode-coa.js`; now unused).

### R2.v3 design corrections (R0 audit + worktree + Gemini + DeepSeek findings)

**F1 fix — geocoding bundled into `link-coa-to-parcels.js` (drop separate `geocode-coa.js`).** R0.10b audit revealed `address_points` table has ONLY (address_point_id, latitude, longitude) — NO street columns. A street-address twin-extract of `geocode-permits.js` is impossible. R0.10c showed `parcels` has both address columns AND centroid_lat/lng — so a single Tier 1 address-match in `link-coa-to-parcels.js` finds the parcel AND yields the geocoded lat/lng (centroid) in one pass. Spec 42 §6.5 step 8 "or extension" option authorizes this consolidation. Lock 4200 is freed.

**F2 fix — `classify-coa-trades.js` twin-extracts the `TAG_PATTERNS` matrix, NOT a Tier-3 lookup.** R0.8 audit returned `0` rows for `trade_mapping_rules WHERE tier=3 AND match_field='description'`. The production reality: `classify-permits.js` does NOT use Tier-3 rules (the table only has 198 Tier-1 `permit_type` rules). Its actual classifier is an inline `TAG_PATTERNS` matrix that maps `scope_tags` → trade IDs. The CoA twin inherits this matrix verbatim, sourced from `coa_applications.scope_tags` (written by `classify-coa-scope.js` in the prior chain step). Realtor inclusion gate per Spec 42 §6.4: conditional on `coa_type_class='residential'` (mirror of permits-side `shouldAppendRealtor(permit_type_class)`).

**F3 fix — migration 145 includes `cost_classified_at` partial index.** R0.13 audit must verify Phase B migration 133 added this column to `coa_applications` (it did, per spec §6.6.D). Migration 145 adds the partial index `WHERE cost_classified_at IS NOT NULL` for the incremental streaming guard in `compute-coa-cost-estimates.js`.

**F4 fix — `cost_estimates.permit_num`/`revision_num` NOT NULL relaxation pulled forward to migration 145.** R0.15 confirmed both columns are NOT NULL (legacy). CoA-side cost_estimates rows can't supply them. **Decision:** migration 145 DROPs the NOT NULL constraints (metadata-only ALTER, no rewrite). Phase H eventually DROPs the columns entirely; this just unblocks Phase D's INSERTs in the interim window.

**F5 fix — R5.2 explicit `coa_applications.neighbourhood_id` write contract.** `link-coa-to-parcels.js` bundles the neighbourhood lookup; its final pass writes `coa_applications.neighbourhood_id` (column added by Phase B migration 133). IS DISTINCT FROM guard. This is documented in R5.2 below.

**F6 fix — realtor inclusion gate IS present in `classify-coa-trades.js` for residential CoA** (per Spec 42 §6.4 test plan `realtor inclusion gate fires for residential CoAs only`). Twin-extract `shouldAppendRealtor()` from `scripts/lib/permit-type-classifier.js` adapted to use `coa_type_class='residential'` predicate instead of `permit_type_class='residential'`. NOT entirely absent as the v1 plan claimed.

**F7 fix — R0 sub-step pre-verifies Brain handles `est_const_cost=null`.** Add R0.14: run `estimateCostShared({ est_const_cost: null, ... })` with a representative CoA row shape; assert it returns a non-NaN cost OR documents the null-passthrough behavior. If it throws/returns NaN, `coa-cost-model.js` adds null-safe defaults before passing to the Brain.

### Required permit-pipeline inputs that flow to CoA via lead_parcels + lead_trades

The user-flagged concern: the permit pipeline includes **lot size, massing, neighbourhood demographics** as cost-model inputs. Per Spec 42 §6.5 step 11 (`link_massing`), no new CoA script is needed — `parcel_buildings` is shared, and CoA → parcel → buildings is a 2-hop JOIN through `lead_parcels` (filtered to `lead_id LIKE 'coa:%'`). **`compute-coa-cost-estimates.js` source SQL must explicitly include this 3-hop JOIN** identical to its twin:

```
coa_applications ca
  LEFT JOIN lead_parcels lp ON lp.lead_id = 'coa:' || ca.application_number  -- spatial linkage from R5.2
  LEFT JOIN parcels p ON p.id = lp.parcel_id                                  -- lot_size_sqm, frontage_m
  LEFT JOIN parcel_buildings pb ON pb.parcel_id = p.id                        -- massing link (no script needed; the JOIN IS the link)
  LEFT JOIN building_footprints bf ON bf.id = pb.building_footprint_id        -- footprint_area_sqm, estimated_stories
  LEFT JOIN neighbourhoods n ON n.id = ca.neighbourhood_id                    -- avg_household_income, tenure_renter_pct
  LEFT JOIN lead_trades lt ON lt.lead_id = 'coa:' || ca.application_number    -- active_trade_slugs ARRAY_AGG
```

This 6-table JOIN mirrors the permit twin's source SQL exactly. The Surgical Triangle Brain in `src/features/leads/lib/cost-model-shared.js` consumes the same columns whether the lead is permit or CoA — no Brain changes needed, only the input row mapping.

### Modified existing scripts (R2.v3 final — load-coa.js untouched; geocoding bundled into link-coa-to-parcels)

| Existing script | Change | Risk |
|---|---|---|
| `scripts/load-coa.js` (544 lines, lock 95) | **NO CHANGE.** Continues ingesting CKAN records as today; lat/lng population happens downstream in `link-coa-to-parcels.js` (parcel-centroid back-fill). | — |
| `scripts/link-coa.js` (550 lines, lock 12) | EXTEND with `permits.linked_coa_application_number` back-ref write. Single post-pass UPDATE after the existing Tier 3 pass writes `coa_applications.linked_permit_num`. IS DISTINCT FROM guard prevents WAL bloat. | MED |

### NEW shared libs (no existing twins — both are new domain libs)

| New lib | Purpose | Reused by |
|---|---|---|
| `scripts/lib/coa-scope-classifier.js` | Stripped description-only scope-tag classifier. Mirrors the `TAG_PATTERNS` + `extractScopeTags` machinery from `classify-scope.js` but drops the residential branch, BLD-propagation pass, structure_type / work / use_type inputs. Exports: `classifyCoaScope({ description, sub_type }) → { coa_type_class, project_type, scope_tags }`. | `classify-coa-scope.js` only (no admin UI consumer in Phase D — no Spec 84 §7 dual-path requirement) |
| `scripts/lib/coa-cost-model.js` | Phase D config builder for the existing Brain (`src/features/leads/lib/cost-model-shared.js`'s `estimateCostShared`). Sets CoA-specific defaults: `est_const_cost: null` (no Liar's Gate), `cost_source: 'geometric'` always, permit-type-class gating bypassed (or fixed to 'construction'). Exports: `buildCoaConfig({ tradeRates, scopeMatrix, logicVars }) → config`. | `compute-coa-cost-estimates.js` only |

### Phase D migration (R2.v4 final — after 3-reviewer triage on 2026-05-13)

`migrations/145_phase_d_classifier_substrate.sql` — single migration with 5 components:

1. **`coa_applications` incremental-classifier timestamp columns (2 additive):**
   - `parcel_linked_at TIMESTAMPTZ` (used by `link-coa-to-parcels.js`)
   - `trade_classified_at TIMESTAMPTZ` (used by `classify-coa-trades.js`)
   - Note: `scope_classified_at`, `cost_classified_at` already exist (Phase B migration 133 confirmed)

2. **Partial indexes on the 4 classifier-state columns** `WHERE <col> IS NOT NULL` (one per: `parcel_linked_at`, `scope_classified_at`, `trade_classified_at`, `cost_classified_at`). Supports the streaming filter pattern.

3. **`cost_estimates` PRIMARY KEY swap** (triage #4 — refined R2.v5):
   - **Combined into ONE statement** (R2.v5 fix A — Worktree CRITICAL): `ALTER TABLE cost_estimates DROP CONSTRAINT cost_estimates_pkey, ADD CONSTRAINT cost_estimates_pkey PRIMARY KEY (lead_id);` — atomic; no window of no-PK state.
   - Then separately: `ALTER COLUMN permit_num DROP NOT NULL` + `ALTER COLUMN revision_num DROP NOT NULL`.
   - **The composite FK to `permits(permit_num, revision_num)` is KEPT** (with `MATCH SIMPLE` — Postgres default; CoA rows with NULL pair vacuously satisfy). Documented inline with COMMENT (R2.v5 fix M — Gemini MED): `COMMENT ON CONSTRAINT cost_estimates_permit_fk ON cost_estimates IS 'KEPT after Phase D PK swap to support Phase G PRE-permit DELETE CASCADE. NULL composite FK (MATCH SIMPLE) vacuously satisfied for CoA rows. DO NOT DROP until Phase H legacy column removal.';`
   - DROP INDEX `uniq_cost_estimates_lead_id` (added by migration 138). The new PK on `lead_id` makes it redundant.
   - **R2.v5 fix C — Production safety guards** (Gemini CRITICAL + DeepSeek CRITICAL):
     - `SET LOCAL lock_timeout = '500ms';` at the start of the migration — fails fast if `ACCESS EXCLUSIVE` cannot be acquired (avoids blocking pile-up).
     - `SET LOCAL statement_timeout = '5min';` — cap total migration runtime.
     - Pre-migration check: `SELECT COUNT(*) FROM cost_estimates` — if >1M rows, abort and require split-migration redesign.
     - Schedule for low-traffic maintenance window (documented in R10 push-gate checklist). Coordinate with daily 03:00 ET pipeline.
     - Retry envelope in the deploy harness: on `lock_timeout` error, wait 60s and retry (max 3 attempts).

4. **`cost_estimates.cost_source` CHECK constraint extension** (triage #1 — refined R2.v5 fix A — Worktree CRITICAL 100%):
   - Migration 096 already replaced the migration 071 CHECK with `cost_estimates_cost_source_check` allowing `('permit', 'model', 'none')`. The R2.v4 plan dropped `'none'` from the new CHECK, which would break permit-side `compute-cost-estimates.js` (writes `'none'` for zero-trade permits).
   - **R2.v5 corrected statement:** `ALTER TABLE cost_estimates DROP CONSTRAINT cost_estimates_cost_source_check; ALTER TABLE cost_estimates ADD CONSTRAINT cost_estimates_cost_source_check CHECK (cost_source IN ('permit', 'model', 'none', 'geometric'));`
   - Pre-DROP guard: `SELECT COUNT(*) FROM cost_estimates WHERE cost_source NOT IN ('permit', 'model', 'none')` — must return 0 before the ADD (sanity check that no rogue values exist).

5. **`lead_id_orphan_audit` view update** (R2.v5 fix D — Worktree HIGH 88%):
   - Migration 142's view at line 56 concatenates `ce.permit_num || ':' || ce.revision_num::TEXT AS source_row_id` — produces NULL for CoA rows after Phase D makes those columns nullable.
   - Migration 145 must `CREATE OR REPLACE VIEW lead_id_orphan_audit AS …` with the `source_row_id` expression changed to `COALESCE(ce.lead_id, ce.permit_num || ':' || ce.revision_num::TEXT)` in the cost_estimates branch — uses `lead_id` directly (always non-NULL after migration 138/this PK swap).

6. **(Conditional) Telemetry assertion on Phase G readiness:** an `assert_no_orphan_pre_permit_cost_estimates` audit query for the `data_quality_snapshots` table — fires WARN if any `cost_estimates` row exists with `permit_num LIKE 'PRE-%'` after Phase G runs. Out of Phase D scope to populate this, but documents the Phase D→G interlock.

All ALTERs are metadata-only (no table rewrite). The PK swap is the structurally biggest change — it requires a brief `ACCESS EXCLUSIVE` lock on `cost_estimates`. Estimated runtime: <2s on staging; production runtime depends on lock-acquisition wait (lock_timeout=500ms cap).

**Phase D → Phase G interlock note:** This migration unlocks Phase G's clean `DELETE FROM permits WHERE permit_type='Pre-Permit'` execution path. Legacy PRE-permit `cost_estimates` rows CASCADE-delete via the preserved composite FK. New CoA `cost_estimates` rows (permit_num=NULL) are unaffected (the DELETE's WHERE clause doesn't match NULL permit_num).

### `scripts/manifest.json` registration (R2.v3 final — 4 NEW chain steps)

Phase D adds 4 new chain steps to the `"coa"` chain. Insertion order (each step's source-set depends on the prior step's output):

```
assert_schema → coa → assert_coa_freshness → 
  [NEW] link_coa_to_parcels (4201)        ← Tier 1 address-match; bundles neighbourhood lookup + lat/lng back-fill from parcel centroid
  [NEW] classify_coa_scope (4202)         ← description-only input
  [NEW] classify_coa_trades (4203)        ← needs scope_tags from classify_coa_scope
  [NEW] compute_coa_cost_estimates (4204) ← needs lead_parcels + lead_trades; 6-table JOIN for lot_size + massing
  → link_coa → create_pre_permits → … (existing tail; pre_permits retires in Phase G)
```

Each manifest entry: `"slug"`, `"script_path"`, `"supports_full": true`, `"telemetry_tables"`. Lock-ID uniqueness verified by the existing `pipeline-advisory-lock.infra.test.ts`. Spec 42 §6.8 lock allocation 4201-4204 covers the 4 new scripts.

---

## Twin Extraction Mechanics — Per Script

For each twin, the same 8-step recipe (Spec 42 §6.11.2):

1. **Copy** the existing twin as the skeleton
2. **Rename** the slug + advisory lock ID + SPEC LINK header
3. **Swap source** SQL: `permits` → `coa_applications`; collapse `(permit_num, revision_num)` to `application_number`; derive `lead_id` inline as `'coa:' || application_number`
4. **Swap output** table: `permit_parcels` → `lead_parcels`; `permit_trades` → `lead_trades`; `cost_estimates` keyed on `lead_id`
5. **Adapt Zod schema** for any CoA-specific logic_variables
6. **Inherit observability**: audit_table, emitSummary, emitMeta, IS DISTINCT FROM guards, batched UPSERT — all carry over unchanged
7. **Add CoA-specific branch** per Spec 42 §6.11.2 column:
   - `link-coa-to-parcels.js`: bundle neighbourhood lookup (the permit twin runs `link-neighbourhoods` separately; for CoA we bundle into one script per spec) AND bundle parcel-centroid lat/lng back-fill into `coa_applications.latitude`/`longitude` (replaces a separate `geocode-coa.js` step)
   - `classify-coa-scope.js`: drop residential/BLD-propagation branches; description-only input
   - `classify-coa-trades.js`: twin-extract the `TAG_PATTERNS` matrix; conditional realtor inclusion gated on `coa_type_class='residential'`
   - `compute-coa-cost-estimates.js`: pass `est_const_cost: null` so Liar's Gate is vacuous; `cost_source='geometric'` always
8. **Inherit tests** — copy each twin's `.logic.test.ts` + `.infra.test.ts` and adapt fixtures. Add a NEW `.db.test.ts` for the live-DB smoke per Phase B lesson

### Specific deltas worth highlighting (from recon)

| Script | Non-trivial delta |
|---|---|
| `link-coa-to-parcels.js` | Twin uses 2-key keyset pagination `(permit_num, revision_num) > ($2, $3)`; CoA collapses to single-key `application_number > $2`. Twin's ghost-cleanup DELETE block (lines 470-489) rewrites for `lead_id`. The neighbourhood lookup currently lives in `link-neighbourhoods.js` (not in `link-parcels.js`) — Phase D bundles it into this script per Spec 42 §6.11.1. **NEW final pass:** parcel-centroid lat/lng back-fill into `coa_applications.latitude`/`longitude` (replaces a standalone geocode-coa step per R0.10c). |
| `classify-coa-scope.js` | Twin's BLD-to-companion propagation pass (lines 526-574) is permits-only — DROP it from the CoA twin. Same for the DM-tag restoration fix (lines 563-574). Twin's input has 10 columns (permit_type, structure_type, work, description, current_use, proposed_use, storeys, housing_units, dwelling_units_created, scope_classified_at); CoA twin has only `description` + `sub_type`. The classifier collapses to one branch: `extractScopeTags(description)`. |
| `classify-coa-trades.js` | Twin's actual classifier is the inline `TAG_PATTERNS` scope-tag→trade matrix (R0.8 confirmed `trade_mapping_rules` has 0 Tier-3 rules). CoA twin extracts that matrix verbatim, sourced from `coa_applications.scope_tags`. Twin's realtor fan-out (`appendRealtorMatch`, lines 413-451) is preserved but conditionally gated on `coa_type_class='residential'` per Spec 42 §6.4. Twin's ghost-cleanup `unnest` DELETE pattern + 65535-param sub-batching MUST be preserved. Write target: `lead_trades` (not `permit_trades`). |
| `compute-coa-cost-estimates.js` | Twin's source SQL is a complex 7-way LEFT JOIN (`permits` × `permit_parcels` LATERAL × `parcels` × `parcel_buildings` LATERAL × `building_footprints` × `neighbourhoods` × `permit_trades` LATERAL ARRAY_AGG × `permit_type_classifications`). CoA twin replaces `permits → permit_parcels` with `coa_applications → lead_parcels` (single-key JOIN — simpler) and `permit_trades → lead_trades` (filtered by `lead_id LIKE 'coa:%'`); inlines `coa_type_class` instead of joining `permit_type_classifications`. `ON CONFLICT (permit_num, revision_num) → ON CONFLICT (lead_id)`. CoA INSERTs supply `permit_num=NULL`/`revision_num=NULL` (enabled by migration 145 DROP NOT NULL). The `estimateCostShared` Brain call is unchanged — only the `config` builder differs (via `scripts/lib/coa-cost-model.js`). |

---

## Twin-vs-CoA Gap Audit (per user request 2026-05-13)

For each NEW Phase D script, this section enumerates **every section of the twin** and states explicitly whether it is `PRESERVED`, `ADAPTED` (functionally equivalent with parameterization), `DROPPED` (and why), or `ADDED` (CoA-only). Reviewers should challenge each DROPPED row with "is this delta safe?" and each ADDED row with "is the new contract specified to twin-quality?"

### Script 1: `link-coa-to-parcels.js` (twin: `link-parcels.js`, 578 lines)

| Twin section | Disposition in CoA twin | Justification |
|---|---|---|
| `pointInPolygon`, `pointInGeoJSON`, `haversineDistance` helpers (lines 42-93) | PRESERVED — copy verbatim | Pure geometry; spec-agnostic |
| Tier 1a address-exact match (`addr_num_normalized` + `street_name_normalized` equality, no lat/lng needed) | PRESERVED | Mirrors R0.10c finding: parcels has both address columns; CoA leads have street_num + street_name fields |
| Tier 1b address-fuzzy match | PRESERVED | Same |
| Tier 2 spatial match (centroid-distance using lat/lng) | DROPPED entirely (R2.v4 triage #14 fix — removed misleading "optional second pass") | CoA records have NO lat/lng pre-link. The lat/lng back-fill happens AFTER Tier 1 match (from parcel centroid), so by definition any CoA that fails Tier 1 also has no lat/lng — Tier 2 spatial fallback is unreachable for unmatched CoAs. Out-of-scope for Phase D; defer to a future Phase if Tier 1 coverage <75% (would require an external geocode-coa pass first to populate pre-link lat/lng). |
| Keyset pagination `(permit_num, revision_num) > ($2, $3)` (2-key) | ADAPTED → single-key `application_number > $2` | CoA key is single-column |
| Ghost-cleanup DELETE block (lines 470-489) | ADAPTED | Filter on `lead_id LIKE 'coa:%'` instead of `permit_num` set membership |
| `linked_at` write to permit_parcels | ADAPTED | Writes `matched_at` to `lead_parcels` (column name differs per Phase B schema) |
| Neighbourhood lookup (in twin: NOT present — runs as separate `link-neighbourhoods.js` step) | ADDED — bundled into this script | Spec 42 §6.11.1 explicitly bundles for CoA. Twin extracted from `link-neighbourhoods.js` |
| Lat/lng back-fill from `parcels.centroid_lat`/`centroid_lng` | ADDED — final pass | Replaces a separate `geocode-coa.js` per R0.10c. Authorized by Spec 42 §6.5 step 8 "or extension" |
| Advisory lock 90 | ADAPTED → 4201 | Phase D lock-ID allocation |
| audit_table emit, emitMeta, withTransaction, withAdvisoryLock | PRESERVED | Spec 47 §R-protocol baseline |

**Net delta:** ~+3% lines for added passes, ~-2% for dropped Tier 2 default. Same protocol shape.

### Script 2: `classify-coa-scope.js` (twin: `classify-scope.js`, 635 lines)

| Twin section | Disposition in CoA twin | Justification |
|---|---|---|
| `classifyProjectType(permit)` (lines 31-58) | ADAPTED | Inputs collapse: `permit_type`/`structure_type`/`work` → just `description` + `sub_type` |
| `TAG_PATTERNS` matrix (lines 64-113) | PRESERVED verbatim | The production scope-tag dictionary; CoA-applicable as-is |
| `extractScopeTags(permit)` (lines 115-141) | ADAPTED | Reads `description` only (twin reads description + work + use_type) |
| `hasRepairSignalNear` (lines 149-164) | PRESERVED | Pure-function tag detector |
| `extractResidentialTags(permit)` (lines 166-269) — 100 lines | ADAPTED (R2.v4 triage #15 fix — was wholly DROPPED) | Full twin relies on `housing_units`/`dwelling_units_created`/`storeys` which CoA lacks. **But** many CoAs are genuinely residential (deck/garage/pool/single-family-dwelling) with description-keyword signal. New `extractCoaResidentialKeywords(description) → string[]` (~30 lines, not 100) extracts description-only keyword tags. Realtor fan-out remains gated by `coa_type_class='residential'` in classify-coa-trades.js, BUT the residential tags also feed scope classification |
| `isResidentialStructure` (lines 272-279) | DROPPED | Permit-structure-specific; coa has no structure_type at scope-classify time |
| `extractNewHouseTags` (lines 281-344) | DROPPED | Permit-specific NEW HOUSE detection |
| `classifyUseType(permit)` (lines 346-364) | DROPPED | Permit-specific use_type field not on CoA |
| `classifyScopeTags(permit)` (lines 366-378) | ADAPTED | Top-level orchestrator simplified to: `extractScopeTags(description) → return tags` |
| `isBLDPermit(permitNum)` (lines 384-386) | DROPPED | Permit-num shape detector; no equivalent for CoA |
| BLD-to-companion propagation pass (lines 526-574) — 50 lines | DROPPED | Permits-only — propagates BLD tags to non-BLD companion permits. CoA has no companion-row relationship |
| DM-tag restoration fix (lines 563-574) | DROPPED | Tied to permit revision_num shape; not applicable |
| audit_table, emitMeta, batched UPSERT envelope | PRESERVED | Protocol baseline |
| Advisory lock 87 | ADAPTED → 4202 | Phase D allocation |

**Net delta:** twin shrinks from 635 → ~300 lines. All drops are permit-substrate-only (housing_units, BLD propagation, structure_type) — none apply to CoA records. **Risk:** the TAG_PATTERNS matrix may have entries that depend on permit-only context. Verify each PRESERVED tag pattern is meaningful when matched against only `description`.

### Script 3: `classify-coa-trades.js` (twin: `classify-permits.js`, 906 lines)

| Twin section | Disposition in CoA twin | Justification |
|---|---|---|
| Phase-aware utilities `determinePhase`, `isTradeActiveInPhase` (lines 84-103) | ADAPTED (R2.v4 triage #7 → R2.v5 fix E correction — Worktree HIGH 82%) | Twin's `determinePhase` reads `permit.status` + `permit.issued_date` — neither exists on CoA rows. CoA twin's `determinePhase` returns `null` sentinel. **R2.v5 math correction:** `isTradeActiveInPhase(slug, phase)` in the twin returns `(PHASE_TRADES[phase] \|\| []).includes(slug)`; with `phase=null`, `PHASE_TRADES[null] === undefined` → `[].includes(slug)` → **false for every trade** (gates out ALL trades — the OPPOSITE of a pass-through). The CoA twin's `isTradeActiveInPhase` MUST have an explicit early-return: `if (phase === null) return true;` as the first line. Without this, `classify-coa-trades.js` produces zero `lead_trades` rows. Documented in R5.4 self-checklist + tested explicitly. |
| `statusBaseScore(status)`, `calculateLeadScore` (lines 108-163) | ADAPTED | Status values differ: CoA uses `decision_status` (approved/refused/deferred) vs permit `status` (ISS/PER/CMP). Score scale preserved |
| `normalizeTag(tag)` (lines 187-258) — incl. tag-alias resolution | PRESERVED | Cross-domain tag dictionary; CoA tags drawn from same TAG_PATTERNS |
| `lookupTradesForTags(scopeTags)` (lines 259-271) — **the TAG_PATTERNS scope-tag→trade matrix** | **PRESERVED — this is THE classifier** | Per R0.8: trade_mapping_rules has 0 Tier-3 rules. The production trade classifier is this in-memory matrix. CoA uses it verbatim |
| `getWorkFallback(work)` (lines 302-309) | DROPPED | CoA has no `work` field; the work-fallback path doesn't apply |
| `fieldMatches`, `extractPermitCode`, `applyScopeLimit`, `getFieldValue` (lines 314-411) | DROPPED | These power the Tier-1/Tier-2 `permit_type`/`structure_type` rule lookup against `trade_mapping_rules`. R0.8 confirmed Tier-3 has 0 rows — the CoA twin skips this whole cascade |
| `appendRealtorMatch` (lines 413-441) | PRESERVED — gated | Conditional on `coa_type_class='residential'` (mirror of permits-side `permit_type_class='residential'` gate). Per Spec 42 §6.4 test plan |
| `applyClassGating` (lines 443-451) | ADAPTED | Gate field: `permit_type_class` → `coa_type_class` |
| `classifyPermit` orchestrator (lines 453-565) | ADAPTED | Renamed `classifyCoa`. Skips Tier-1/Tier-2 fallthrough; directly calls `lookupTradesForTags(coa.scope_tags)` + `appendRealtorMatch` (conditional) |
| Ghost-cleanup `unnest` DELETE pattern | PRESERVED verbatim | Critical for orphan cleanup; pattern is lead_id-shape-agnostic with the right WHERE clause |
| 65535-param sub-batching | PRESERVED verbatim | Postgres parameter limit — must keep |
| Write target: `permit_trades` | ADAPTED → `lead_trades` | Phase B schema directly takes lead_id |
| Advisory lock 88 | ADAPTED → 4203 | Phase D allocation |

**Net delta:** twin shrinks from 906 → ~400 lines. All drops are the Tier-1/Tier-2 cascade against `trade_mapping_rules` (which R0.8 proved is empty for description matching). **Risk:** if the empty Tier-3 state changes in the future (e.g. someone seeds Tier-3 rules), the CoA twin won't automatically pick them up. Documented as Spec 42 §6.4 amendment for Phase E or H to reconsider.

### Script 4: `compute-coa-cost-estimates.js` (twin: `compute-cost-estimates.js`, 492 lines)

| Twin section | Disposition in CoA twin | Justification |
|---|---|---|
| Zod config schema (lines 40-52) | PRESERVED | Same control panel knobs |
| Source SQL — 7-way LEFT JOIN (lines 54-117) | ADAPTED | `permits → permit_parcels → parcels → parcel_buildings → building_footprints → neighbourhoods → permit_trades (LATERAL ARRAY_AGG) → permit_type_classifications` → CoA: `coa_applications → lead_parcels → parcels → parcel_buildings → building_footprints → neighbourhoods → lead_trades (LATERAL ARRAY_AGG filtered LIKE 'coa:%')`. `permit_type_classifications` JOIN dropped — CoA uses inline `coa_type_class` column directly |
| `buildBulkUpsertSQL` (lines 121-158) | ADAPTED | `ON CONFLICT (permit_num, revision_num)` → `ON CONFLICT (lead_id)`. CoA rows write `permit_num=NULL`, `revision_num=NULL` (enabled by migration 145 DROP NOT NULL) |
| `flushBatch` (lines 164-195) | PRESERVED | Batching logic is lead-key-agnostic |
| Pre-fetch surgical rate tables (lines 225-263) | PRESERVED | Trade-rate matrix is permit/CoA-shared |
| Build Brain config (lines 265-272) | ADAPTED via `scripts/lib/coa-cost-model.js` | CoA-specific defaults: `est_const_cost: null` always (no Liar's Gate); `cost_source='geometric'` always |
| RUN_AT capture (lines 274-280) | PRESERVED | getDbTimestamp protocol |
| Stream + batch (lines 281-361) | PRESERVED | Pipeline-streamQuery shape unchanged |
| data_quality_snapshots emit (lines 362-388) | PRESERVED | Observability baseline |
| Emit summary (lines 389-487) | PRESERVED | Spec 47 §R11 baseline |
| `estimateCostShared(row, config)` call (Brain — `src/features/leads/lib/cost-model-shared.js`) | PRESERVED unchanged | R0.14 confirmed: `Number.isFinite(row.est_const_cost) ? row.est_const_cost : null` (line 512) is null-safe. CoA rows pass `est_const_cost: null` cleanly |
| Advisory lock 83 | ADAPTED → 4204 | Phase D allocation |

**Net delta:** twin and CoA twin are size-parity (~400 lines). The Brain itself is untouched. **Risk:** the 6-table JOIN must filter `lead_trades.lead_id LIKE 'coa:%'` in the LATERAL — without that, permit-side trades contaminate the ARRAY_AGG and inflate CoA cost estimates. Critical test scaffolding requirement.

### Modified Script: `link-coa.js` extension (back-ref)

| Existing function | Disposition | Justification |
|---|---|---|
| Tier 1/2/3 CoA→permit matching | PRESERVED unchanged | Existing 550-line script |
| `coa_applications.linked_permit_num` write | PRESERVED | Existing |
| **NEW post-pass: `permits.linked_coa_application_number` back-ref** | ADDED | Bidirectional linkage for Phase E lifecycle JOINs. Single UPDATE inside the existing transaction, IS DISTINCT FROM guard to prevent WAL bloat |

---

## R0 Audit Results — Verified 2026-05-13

| Audit | Source | Finding | Disposition |
|---|---|---|---|
| R0.6 | `migrations/133_extend_coa_applications_lead_id.sql` | All 18 Phase B/C columns present: `lead_id`, `coa_type_class`, `project_type`, `scope_tags`, `scope_classified_at`, `scope_source`, `structure_type`, `neighbourhood_id`, `latitude`, `longitude`, `modeled_gfa_sqm`, `estimated_cost`, `cost_source`, `cost_classified_at`, `lifecycle_seq`, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage`, `bid_value` | PASS — substrate ready |
| R0.7 | `migrations/133` | `parcel_linked_at`, `trade_classified_at` NOT in migration 133 — confirmed Phase D migration 145 deliverable | PASS — gap real |
| R0.8 | live DB query (Phase D R2.v1) | `trade_mapping_rules` has 0 Tier-3 description rules; production classifier is inline `TAG_PATTERNS` | PASS — design pivot landed (R2.v2/v3) |
| R0.9 | live DB query | 32,419 / 33,052 CoA rows have description (98.1%) | PASS — coverage adequate |
| R0.10 | `scripts/geocode-permits.js` | Internal `address_points` JOIN, NOT external HTTP geocoder | PASS — informed pivot |
| R0.10b | `address_points` schema | Has only (address_point_id, latitude, longitude) — NO street columns | CRITICAL — drove drop-geocode-coa pivot |
| R0.10c | `parcels` schema | Has `addr_num_normalized` + `street_name_normalized` AND `centroid_lat` + `centroid_lng` | PASS — enabled centroid back-fill design |
| R0.11 | `scripts/manifest.json` | "coa" chain has 12 steps; locks 4200-4204 free | PASS — lock allocation safe (4201-4204 used, 4200 freed) |
| R0.12 | migrations 138-144 | mirror triggers, lead_id NOT NULL promotions, Phase C R5.3 deliverables all merged | PASS — Phase C complete |
| R0.13 | `migrations/133` line 34 | `cost_classified_at TIMESTAMPTZ` exists | PASS — index-only addition needed in 145 |
| R0.14 | `src/features/leads/lib/cost-model-shared.js:512` | `Number.isFinite(row.est_const_cost) ? row.est_const_cost : null` — null-safe by construction | PASS — Brain unchanged for CoA |
| R0.15 | live DB query | `cost_estimates.permit_num` + `revision_num` are NOT NULL | CRITICAL — drove migration 145 DROP NOT NULL pull-forward from Phase H |

All R0 audits resolved. Plan is informed by the actual codebase + database state.

---

## R0 Audit Plan (executed BEFORE drafting code)

Per Phase B lesson — unverified premises caused 3 CI hotfixes. Phase D R0 audits:

- **R0.6 — coa_applications columns**: confirm Phase B migration 133 added `latitude`, `longitude`, `scope_tags`, `scope_classified_at`, `scope_source`, `coa_type_class`, `project_type`, `structure_type`, `neighbourhood_id`. Verify each via `\d coa_applications`.
- **R0.7 — Phase D timestamp columns NOT yet present**: confirm `geocoded_at`, `parcel_linked_at`, `trade_classified_at` are NOT yet on `coa_applications` (these are the migration 145 deliverable).
- **R0.8 — trade_mapping_rules Tier 3 coverage**: `SELECT COUNT(*) FROM trade_mapping_rules WHERE is_active = true AND tier = 3 AND match_field = 'description'` — confirm there are enough Tier-3 description rules to give CoA classifications meaningful coverage. Hit threshold ≥ 30 rules.
- **R0.9 — coa_applications row count + classification readiness**: `SELECT COUNT(*) FROM coa_applications WHERE description IS NOT NULL` — confirm description coverage. Without description we can't classify; budget for the gap.
- **R0.10 — Geocoding strategy**: check if `scripts/geocode-permits.js` exists and what address-to-lat/lng strategy it uses (CKAN reverse geocoder? Nominatim? Google?). The CoA geocoding extension borrows that strategy.
- **R0.11 — manifest.json shape**: read the current "coa" chain definition + the next free advisory lock ID range (per Spec 42 §6.8 the Phase D allocation is 4201-4204; verify those aren't taken).

R0 audit outputs feed into the active task before R1 commits.

---

## Technical Implementation

* **New Components:** 4 new pipeline scripts + 2 new shared libs + 1 new migration + manifest.json updates.
* **Modified Components:** `scripts/link-coa.js` (back-ref extension), `scripts/manifest.json` (4 new chain steps). `scripts/load-coa.js` unchanged (lat/lng populated downstream by `link-coa-to-parcels.js`).
* **Data Hooks/Libs:**
  - `scripts/lib/coa-scope-classifier.js` (NEW; description-only scope classifier; no TS dual-path since no admin UI consumer in Phase D)
  - `scripts/lib/coa-cost-model.js` (NEW; Brain config builder; delegates math to existing `src/features/leads/lib/cost-model-shared.js`)
* **Database Impact:** YES — 1 new migration (145) adds 2 nullable timestamp columns + 4 partial indexes to `coa_applications`, AND drops the legacy NOT NULL on `cost_estimates.permit_num` + `revision_num` (R0.15 pull-forward from Phase H). All metadata-only ALTERs — no data rewrite, no backfill.
* **External API:** None. All geocoding is internal (parcel-centroid back-fill via `link-coa-to-parcels.js`); R0.10 confirmed no external HTTP geocoder is involved in the permit twin either.
* **Estimated runtime:**
  - Migration 145: <1s (metadata-only ALTERs)
  - link-coa-to-parcels.js (NEW): Tier 1 address match + centroid back-fill on 33K rows (~30s-2 min)
  - classify-coa-scope.js (NEW): ~20s on 33K rows (pure-function classifier)
  - classify-coa-trades.js (NEW): ~30s on 33K rows × TAG_PATTERNS matrix
  - compute-coa-cost-estimates.js (NEW): ~1-2 min on 33K rows
  - Total Phase D pipeline addition: ~5-7 min added to the daily CoA chain
* **Twin extraction line-count estimates:**
  - link-coa-to-parcels.js: ~500 lines (slightly smaller than 577-line twin due to key simplification)
  - classify-coa-scope.js: ~300 lines (less than half the 634-line twin — stripped branches)
  - classify-coa-trades.js: ~400 lines (less than half the 905-line twin — Tier 3 only, no realtor)
  - compute-coa-cost-estimates.js: ~400 lines (similar to 491-line twin)
  - 2 shared libs: ~100 lines each
  - Total new code: ~1,800 lines plus tests

## Standards Compliance

* **WF1 sequence per group (R5.X):** Test Scaffolding → Red Light (tests MUST fail) → Implementation → Group Green Light (tests + typecheck + lint + db.test.ts against fresh staging) → Self-Checklist (walk Spec 47 §12 Self-Review Checklist item-by-item per saved memory `feedback_review_protocol.md`) → Multi-Agent Review → Triage → Commit.
* **§2.1 Unhappy Path Test Mandate:** every new script has at least one infra test exercising failure modes: missing description → classifier returns empty tags; missing parcel match → cost estimator emits null estimate; FK violation on lead_id → loud abort.
* **§2.2 Try-Catch Boundary Rule:** classifier scripts use Spec 47 §R9 `withTransaction` envelope; errors propagate to `pipeline.run` which logs + exits non-zero. No silent swallowing.
* **§2.3 Assumption Documentation:** every twin-extraction script header documents the R0 audit findings the script depends on (e.g., "R0.8 confirmed Tier-3 description rules ≥ 30").
* **§3.2 Pagination Enforcement:** all source-set streaming uses `pipeline.streamQuery` for >10K rows (compute-coa-cost-estimates) OR explicit keyset pagination (link-coa-to-parcels, classify-coa-trades).
* **§3 Database — DECIMAL not float:** confidence/score columns are DECIMAL(3,2) matching existing schema. Parameterized queries throughout.
* **§5.1 Typed Factories:** new test fixtures use `src/tests/factories.ts` typed factory functions (no manual SQL fixture strings).
* **§5.2 Test File Pattern:** every new script has `{name}.logic.test.ts` (pure functions), `{name}.infra.test.ts` (SQL-string regression-lock), AND `{name}.db.test.ts` (live testcontainer) — the triad per Phase B lesson.
* **§6 logError Mandate:** every catch block in the new scripts uses `pipeline.log.error(TAG, err, context)`.
* **Spec 47 §R1-R12:** every new script's skeleton walked at R5.X.e Self-Checklist. The 12 mandatory items: §R1 SDK imports, §R2 advisory lock, §R3 pipeline.run, §R3.5 getDbTimestamp, §R4 Zod schema (if loadMarketplaceConfigs), §R5 startup guards, §R6 withAdvisoryLock, §R7 streamQuery or pool.query (size-appropriate), §R8 pure functions in lib/, §R9 withTransaction, §R10 audit_table emit, §R11 emitMeta, §R12 lockResult.acquired guard.
* **Spec 47 §12 Self-Review Checklist (saved memory feedback_review_protocol.md):** walked per R5.X.e for each new/modified script: Concurrency, Config & Validation, Atomicity, Writes, Time & Date, NULL Safety, Streams, Observability, Constants, Spec compliance.
* **Multi-Agent Review:** R2 (this plan) + per-group R5.X.f (full 3-reviewer for HIGH; full 3-reviewer for MED per saved memory — WF1/WF2 always uses adversarial) + final R8 cross-cutting.
* **DB integration tests:** every R5.X.d Group Green Light runs `BUILDO_TEST_DB=1 npx vitest run src/tests/db` against fresh local Postgres. Per Phase B lesson — live-DB application is the ground truth for schema correctness.

---

## Execution Plan

- [ ] **R0 — Read prerequisite specs.** Spec 47 §R1-R12 (full skeleton); Spec 47 §12 Self-Review Checklist; Spec 00 engineering standards (§2 errors, §3 DB, §5 tests, §6 logging); Spec 42 §6.6 + §6.8 + §6.11 + §6.11.2; Spec 84 §7 (dual-path — applies only if a shared lib gets a TS consumer).
- [ ] **R0.5 — Confirm migration number = 145.** Last applied: 144 (mirror permit_parcels). Phase D claims 145 (single migration).
- [ ] **R0.6 — coa_applications column audit.** Verify Phase B migration 133 added: `latitude`, `longitude`, `scope_tags`, `scope_classified_at`, `scope_source`, `coa_type_class`, `project_type`, `structure_type`, `neighbourhood_id`. Run `\d coa_applications` against dev DB.
- [ ] **R0.7 — Verify timestamp columns absent.** Confirm `parcel_linked_at`, `trade_classified_at` are NOT yet on coa_applications (these are the migration 145 deliverable). Confirm `scope_classified_at`, `cost_classified_at` ARE present (added by Phase B migration 133).
- [ ] **R0.8 — trade_mapping_rules Tier 3 coverage.** `SELECT COUNT(*) FROM trade_mapping_rules WHERE is_active = true AND tier = 3 AND match_field = 'description'`. Expected ≥ 30.
- [ ] **R0.9 — coa_applications description coverage.** `SELECT COUNT(*) FROM coa_applications WHERE description IS NOT NULL`. Expected ≥ 90% of 33K rows.
- [x] **R0.10 — Geocoding strategy audit (EXECUTED 2026-05-13).** `scripts/geocode-permits.js` exists; uses internal `address_points` JOIN via `geo_id = ADDRESS_POINT_ID`. NOT an external HTTP geocoder. **R0.10b discovery:** `address_points` table has ONLY (address_point_id, latitude, longitude) — NO street columns. Street-address twin-extract is impossible. **R0.10c discovery:** `parcels` table has BOTH `addr_num_normalized` + `street_name_normalized` AND `centroid_lat` + `centroid_lng`. Every parcel has a derived centroid. **PLAN PIVOT:** drop the separate `geocode-coa.js` script entirely; bundle parcel-centroid lat/lng back-fill into `link-coa-to-parcels.js`'s final pass. The Tier 1 address match (which mirrors `link-parcels.js` Tier 1a exactly) finds the parcel; the centroid IS the geocoded location. Spec 42 §6.5 step 8 "or extension" option authorizes this.
- [x] **R0.11 — manifest.json shape (EXECUTED).** "coa" chain has 12 steps; advisory locks 4200-4204 verified free via grep.
- [x] **R0.8 — trade_mapping_rules Tier-3 coverage (EXECUTED).** Returned **0 rows**. Production has only 198 Tier-1 `permit_type` rules. **PLAN PIVOT:** `classify-coa-trades.js` does NOT use Tier-3 rules. It twin-extracts the `TAG_PATTERNS` scope-tag→trade matrix from `classify-permits.js` (the actual production classifier). Sourced from `coa_applications.scope_tags` (written by `classify-coa-scope.js`).
- [x] **R0.9 — CoA description coverage (EXECUTED).** 32,419 / 33,052 = **98.1%** have description. Plenty.
- [ ] **R0.12 — Phase B/C tables exist on the target DB.** Verify `lead_parcels`, `lead_trades`, `cost_estimates.lead_id NOT NULL`, mirror triggers `trg_mirror_permit_trades_to_lead_trades` + `trg_mirror_permit_parcels_to_lead_parcels` are installed before Phase D runs.
- [ ] **R0.13 — `coa_applications.cost_classified_at` column exists (Phase B migration 133).** Per Spec 42 §6.6.D this should already be there. Migration 145 adds the partial index `WHERE cost_classified_at IS NOT NULL` for the streaming guard.
- [ ] **R0.14 — Brain null-safe `est_const_cost` pre-verification.** Run `estimateCostShared({ est_const_cost: null, scope_tags: ['addition'], ... })` against a representative CoA row shape. Assert non-NaN output OR document the null-passthrough behavior. If unsafe, `coa-cost-model.js` adds defaults.
- [x] **R0.15 — `cost_estimates.permit_num` / `revision_num` nullability (EXECUTED 2026-05-13).** Both columns are currently NOT NULL (legacy from before Phase H). CoA rows cannot supply these. **DECISION:** pull forward the Phase H "DROP NOT NULL" relaxation into migration 145 (Phase D). Metadata-only ALTER, no rewrite. Phase H eventually DROPs the columns entirely; this just makes them nullable in the interim window. Documented in R5.5 below.
- [ ] **R1 — Write this active task.** _In progress (this file)._
- [ ] **R2 — Multi-Agent Review of this plan.** Spawn in ONE message: Gemini + DeepSeek (plan-review templates with Spec 42, Spec 47, Spec 00 contexts) + worktree feature-dev:code-reviewer. Reviewers should especially scrutinize:
  - Twin-extraction completeness — does the plan cover every CoA-specific delta per Spec 42 §6.11.2?
  - R0 audit gaps — are there other unverified premises that should be R0 items?
  - Migration 145 column shape — types, nullability, indexing
  - Chain-step ordering in manifest.json — write/read dependencies satisfied
  - Geocoding strategy — external API or internal cache?
  - The `coa-scope-classifier.js` + `coa-cost-model.js` shared lib boundaries — too thin? too fat?
  - Risk tier assignments for the 4 NEW scripts + 2 extensions
- [ ] **R3 — Triage R2 findings.** BUG → fix in plan before authorization. DEFER → `docs/reports/review_followups.md`.
- [ ] **R4 — Authorization gate. PLAN LOCKED ask.** Halt for user authorization.
- [ ] **R5 — Per-group TDD cycle.** 6 groups, each with full TDD + 3-reviewer Multi-Agent Review:

  **R5.1 — Foundations (HIGH — risk rises with the PK swap): migration 145 + 2 shared libs + 1 script extension**
  - **Migration 145 (5 components per R2.v4):**
    1. Add `parcel_linked_at` + `trade_classified_at` to `coa_applications` (2 nullable additive cols)
    2. 4 partial indexes on classifier-state columns (`WHERE col IS NOT NULL`)
    3. **`cost_estimates` PK swap:** DROP composite PK `(permit_num, revision_num)` → ADD PK on `lead_id` → DROP NOT NULL on permit_num + revision_num → DROP redundant `uniq_cost_estimates_lead_id` index (PK supersedes it). Composite FK to `permits` is KEPT (Postgres NULL-FK semantics: vacuously satisfied for CoA rows; load-bearing for Phase G PRE-permit DELETE CASCADE)
    4. Extend `cost_estimates.cost_source` CHECK constraint: `IN ('permit', 'model')` → `IN ('permit', 'model', 'geometric')` (adds CoA's geometric cost path)
    5. (Documentation only) `data_quality_snapshots` audit query for Phase G readiness
  - NEW `scripts/lib/coa-scope-classifier.js` (description-only scope tagger; mirrors `classify-scope.js`'s TAG_PATTERNS extraction)
  - NEW `scripts/lib/coa-trade-classifier.js` (per R2.v4 triage #3 — extracts the inline TAG_PATTERNS scope-tag→trade matrix from `classify-permits.js`'s `lookupTradesForTags`)
  - NEW `scripts/lib/coa-cost-model.js` (Brain config builder for CoA: est_const_cost: null, cost_source='geometric')
  - EXTEND `scripts/link-coa.js` — `permits.linked_coa_application_number` back-ref post-pass with IS DISTINCT FROM guard
  - **R5.1.d Green Light db.test.ts assertions (per R2.v4 triage #9):**
    - CoA `cost_estimates` insert with `permit_num=NULL, revision_num=NULL, lead_id='coa:TEST-001'` succeeds (vacuously satisfies composite FK via NULL semantics)
    - `DELETE FROM permits WHERE permit_num='TEST-PRE'` CASCADEs to permit-keyed `cost_estimates` rows BUT does NOT touch CoA-keyed rows (WHERE clause doesn't match NULL permit_num)
    - PK swap: `cost_estimates` PK is now `lead_id` (queried via `pg_constraint` / `pg_index`)
    - CHECK constraint accepts `cost_source='geometric'` (was rejected pre-migration)
  - TDD cycle + 3-reviewer review + commit
  - **R5.1 is now HIGH risk (was MED)** — the PK swap is structurally non-trivial and ACCESS EXCLUSIVE locks `cost_estimates` briefly. Test against fresh staging before applying to any non-local DB.

  **R5.2 — `link-coa-to-parcels.js` (HIGH): biggest twin delta — twin of `link-parcels.js` (577 lines, lock 90)**
  - Copy `scripts/link-parcels.js` as skeleton
  - Bundle neighbourhood lookup (the permit twin runs `link-neighbourhoods` separately — for CoA, combined per Spec 42 §6.11.1)
  - **NEW final pass: parcel-centroid lat/lng back-fill** — **R2.v5 fix F (Gemini HIGH): batched UPDATEs**, not a single UPDATE on 33K rows. Process in chunks of 1000 lead_ids per transaction (mirrors `compute-cost-estimates.js`'s `flushBatch` pattern). WAL impact bounded; lock window per-batch sub-second.
  - **R2.v5 fix H (DeepSeek HIGH): stable pagination.** `application_number` is VARCHAR with mixed formats ("A0123-24", "B-001", etc.) — lexicographic ordering may not be strictly monotonic. Use `ORDER BY application_number ASC, id ASC` with `id` as tiebreaker (`coa_applications.id` is the row's surrogate PK). Add `CREATE INDEX IF NOT EXISTS idx_coa_app_num_id ON coa_applications (application_number, id)` if not present (Phase B/C audit will verify).
  - Adapt ghost-cleanup DELETE for `lead_id` shape
  - Writes (all inside ONE `withTransaction` per batch): `lead_parcels` (lead_id = `ca.lead_id` directly, NOT re-derived) + `coa_applications.neighbourhood_id` + `coa_applications.latitude/longitude` + `coa_applications.parcel_linked_at`
  - Advisory lock 4201
  - **R5.2.d Green Light db.test.ts assertions:** batched-update verifies WAL impact stays bounded; pagination test feeds 1000 rows with deliberately non-monotonic application_numbers and asserts every row visited exactly once.
  - TDD + 3-reviewer review + commit

  **R5.3 — `classify-coa-scope.js` (MED): stripped twin of `classify-scope.js` (634 lines, lock 87)**
  - Copy `scripts/classify-scope.js` as skeleton
  - DROP residential branch, BLD-propagation pass, structure_type/work/use_type inputs
  - Source: description + sub_type only
  - Output: writes `coa_type_class`, `project_type`, `scope_tags`, `scope_classified_at`, `scope_source` on `coa_applications`
  - Uses `scripts/lib/coa-scope-classifier.js`
  - Advisory lock 4202
  - TDD + 3-reviewer review + commit

  **R5.4 pre-flight (R2.v5 fix G — DeepSeek HIGH): mirror trigger 143 UPDATE-path integration test.**
  Before R5.4 starts, add `src/tests/db/mirror-trigger-classify-permits-update.db.test.ts`:
  - Insert a known permit + run `classify-permits.js` end-to-end
  - Capture initial `lead_trades` state for the permit
  - Modify the permit's `description` (force re-classification with different tags)
  - Re-run `classify-permits.js`
  - Assert `permit_trades.is_active` flipped correctly for at least one trade
  - Assert `lead_trades.is_active` mirrors the flip (via the AFTER UPDATE branch of `trg_mirror_permit_trades_to_lead_trades`)
  - This validates the trigger's `ON CONFLICT DO UPDATE SET … is_active = EXCLUDED.is_active` path, which Phase C R5.3 unit-tested via SQL structure but never end-to-end verified.

  **R5.4 — `classify-coa-trades.js` (HIGH): twin of `classify-permits.js` (905 lines, lock 88)**
  - **R5.4.0 BLOCKING GATE (R2.v5 fix I — Gemini CRITICAL + DeepSeek HIGH escalated triage #10):** Before writing a single line of `classify-coa-trades.js`, run a TAG_PATTERNS fitness analysis:
    - Sample 200 random CoA descriptions from `coa_applications` (stratified across residential / commercial / institutional `coa_type_class` if classified, else uniform)
    - Run `lookupTradesForTags(extractScopeTags(description))` from the existing `classify-permits.js` machinery
    - Measure: `% of descriptions with at least one trade match`, `% with realtor-only match`, `% with zero matches`, distribution of matched trades by frequency
    - **Pass threshold:** ≥80% have at least one non-realtor trade match. If <80%, extend `coa-trade-classifier.js` with CoA-specific TAG_PATTERNS entries (severance, easement, minor variance, setback, consent, etc.) before R5.4 implementation
    - Outcome of this gate is committed to `docs/reports/spec_42_phase_d_tag_patterns_audit.md` with the % numbers + trade frequency histogram. **Without this gate, R5.4 cannot proceed.**
  - Copy `scripts/classify-permits.js` as skeleton
  - **Twin-extract the inline `TAG_PATTERNS` scope-tag→trade matrix** into `scripts/lib/coa-trade-classifier.js` (per R0.8 — this is the actual production classifier; `trade_mapping_rules` has 0 Tier-3 rules)
  - Source: `coa_applications.scope_tags` (written by R5.3)
  - **R2.v5 fix E (Worktree HIGH 82%):** the CoA twin's adapted `isTradeActiveInPhase` MUST have `if (phase === null) return true;` as the first line. Without this guard, `PHASE_TRADES[null]` is undefined and ALL trades get gated out. Test explicitly: `expect(isTradeActiveInPhase('electrician', null)).toBe(true)`.
  - **Conditional realtor inclusion** per Spec 42 §6.4: `coa_type_class='residential'` fires `shouldAppendRealtor()` (mirror of permits-side gate)
  - Write target: `lead_trades` (NOT `permit_trades`)
  - Preserve ghost-cleanup `unnest` DELETE + 65535-param sub-batching
  - Advisory lock 4203
  - TDD + 3-reviewer review + commit

  **R5.5 — `compute-coa-cost-estimates.js` (HIGH): twin of `compute-cost-estimates.js` (491 lines, lock 83)**
  - Copy `scripts/compute-cost-estimates.js` as skeleton
  - Source SQL: 6-table LEFT JOIN — `coa_applications ca → lead_parcels lp → parcels p → parcel_buildings pb → building_footprints bf → neighbourhoods n`. The `lead_trades` JOIN MUST be a **LATERAL subquery with `ARRAY_AGG`** (R2.v5 fix DeepSeek MED #15) — `LATERAL (SELECT ARRAY_AGG(trade_slug) AS active_trade_slugs FROM lead_trades lt WHERE lt.lead_id = ca.lead_id AND lt.is_active = true) lt_agg`. Mirrors the twin's pattern exactly. A plain `LEFT JOIN lead_trades` would multiply rows per CoA and inflate cost estimates. All JOINs use `ca.lead_id` directly (Gemini HIGH #10 v3 fix).
  - `ON CONFLICT (permit_num, revision_num)` → `ON CONFLICT (lead_id)` (Phase C `cost_estimates.lead_id` is UNIQUE NOT NULL per migration 138)
  - CoA rows write `permit_num = NULL` and `revision_num = NULL` (now permitted by R5.1 migration 145 DROP NOT NULL)
  - Uses `scripts/lib/coa-cost-model.js` for Brain config (est_const_cost: null; cost_source='geometric')
  - Pre-flight R0.14: verify `estimateCostShared` handles est_const_cost=null cleanly
  - Advisory lock 4204
  - TDD + 3-reviewer review + commit

  **R5.6 — manifest.json registration + chain smoke test (MED): glue**
  - Add 4 new chain entries with correct ordering: `link_coa_to_parcels` → `classify_coa_scope` → `classify_coa_trades` → `compute_coa_cost_estimates`
  - Verify advisory-lock uniqueness (4201-4204) via existing `pipeline-advisory-lock.infra.test.ts`
  - End-to-end smoke: run the full CoA chain on fresh staging; assert each step produces rows
  - TDD + 3-reviewer review + commit

- [ ] **R6 — Cross-cutting integration test on fresh staging.** Drop staging DB; re-apply migrations 001-145; run the CoA chain end-to-end; assert: lead_parcels populated for ≥75% of active CoAs (per Spec 42 §6.3 target); lead_trades populated for ≥90%; coa_type_class non-NULL for ≥95%; estimated_cost non-NULL for ≥80%.
- [ ] **R7 — Full test pass.** `npm run test` (5,600+ tests) + `BUILDO_TEST_DB=1 npx vitest run src/tests/db`.
- [ ] **R8 — Final cross-cutting Multi-Agent Review.** 3-reviewer on cumulative diff.
- [ ] **R9 — Triage R8 findings + apply BUG fixes.**
- [ ] **Final Green Light.** `npm run test && npm run lint -- --fix && npm run typecheck`.
- [ ] **R10 — Push gate.** User confirmation before push.

---

## Plan Compliance Notes

* **WF1 sequence:** all 13 contract items present (Contract Definition = N/A no API; Spec & Registry Sync = manifest.json + Spec 42 (no spec amendment needed — Phase A locked the contract); Schema Evolution = migration 145; Test Scaffolding → Red Light → Implementation → Green Light → Self-Checklist → Multi-Agent Review per group).
* **Spec 47 §R1-R12:** every new script gets full skeleton; every modified script preserves existing skeleton.
* **Spec 47 §12 Self-Review Checklist:** walked at R5.X.e for each script per saved memory feedback_review_protocol.md ("Before committing any WF3 that modifies a scripts/*.js pipeline script: walk every section item by item").
* **Spec 84 §7 dual-path:** N/A in Phase D — the 2 new shared libs (`coa-scope-classifier.js`, `coa-cost-model.js`) have no admin-UI consumers yet (those land in Phase F). If Phase F adds a TS consumer, dual-path is established then.
* **Multi-Agent Review cadence:** R2 (this plan) + per-group reviews (R5.1.f through R5.6.f — full 3-reviewer for all groups; WF1/WF2 always adversarial per saved memory) + final R8 cross-cutting.
* **DB integration tests:** every Green Light runs the live db.test.ts suite against fresh local Postgres. Phase B's 3 CI hotfixes taught this discipline; Phase C cost zero hotfixes by holding it.
* **Domain mode:** Backend/Pipeline. All work in `scripts/` + 1 migration + `manifest.json`.
* **Template extraction emphasis:** the user explicitly requested twin-extraction. Every new script has a documented twin (Spec 42 §6.11.2 table). The 8-step mechanics are the canonical playbook.

---

## Out of Scope (Explicitly Deferred to Phases E-H)

- **Lifecycle engine bug 84-W12 fix** (CoA `lifecycle_phase` mostly NULL) — Phase E
- **Granular Universal Stream emission** (writes `lifecycle_seq`/group/block/stage/bid_value on CoA rows) — Phase E
- **CoA UNION extension** to `compute-trade-forecasts.js`, `compute-opportunity-scores.js`, `update-tracked-projects.js` — Phase F
- **Admin Lead Inspector CoA panel** (UI) — Phase F
- **PRE-permit retirement** — Phase G
- **Phase C R5.4-R5.6 read-source rekeys** + legacy column drops — Phase H

---

## R2.v5 Triage Log (3-reviewer Multi-Agent Review #2, 2026-05-13 — same day, second pass)

After the R2.v4 revisions, the same 3-reviewer ensemble (Worktree + Gemini + DeepSeek) reviewed the revised plan. 22 findings (with overlaps); 8 distinct must-fix bugs identified, all applied to R2.v5:

| # | Sev | Conf | Source | Finding | Fix |
|---|---|---|---|---|---|
| A | **CRITICAL** | 100 | Worktree | Migration 096 already extended `cost_estimates_cost_source_check` to allow `'none'`. R2.v4's new CHECK `IN ('permit', 'model', 'geometric')` would BREAK production `compute-cost-estimates.js` (writes `'none'` for zero-trade permits). | Migration 145 corrected: `IN ('permit', 'model', 'none', 'geometric')`. Pre-DROP sanity guard added. Applied. |
| B | **CRITICAL** | 85 | Worktree | PK swap as 3 sequential ALTERs leaves a window with no PK. | Combined: `ALTER TABLE … DROP CONSTRAINT cost_estimates_pkey, ADD CONSTRAINT cost_estimates_pkey PRIMARY KEY (lead_id)` as single statement. Applied. |
| C | **CRITICAL** | 90 | Gemini + DeepSeek | PK swap `ACCESS EXCLUSIVE` lock can pile-up production. `<2s` claim is staging-only. | Migration 145 now sets `SET LOCAL lock_timeout='500ms'` + retry envelope + maintenance-window scheduling guidance + row-count pre-check (<1M). Applied. |
| D | HIGH | 88 | Worktree | `lead_id_orphan_audit` view (migration 142) concatenates `permit_num \|\| ':' \|\| revision_num` → NULL for CoA rows after migration 145. | Migration 145 also `CREATE OR REPLACE VIEW lead_id_orphan_audit` with `COALESCE(ce.lead_id, …)` for `source_row_id`. Applied. |
| E | HIGH | 82 | Worktree | R2.v4 triage #7 claim that `isTradeActiveInPhase(slug, null)` is pass-through is **mathematically wrong**. `PHASE_TRADES[null]` = undefined → `[].includes(slug)` = false → ALL trades gated out → 0 lead_trades for every CoA. | CoA twin's `isTradeActiveInPhase` MUST have `if (phase === null) return true;` first line. Documented in R5.4 + explicit logic test. Applied. |
| F | HIGH | 80 | Gemini | Lat/lng back-fill UPDATE on 33K rows = WAL burst + lock contention. | R5.2 plan now batches in chunks of 1000 (mirrors `flushBatch` pattern). Applied. |
| G | HIGH | 75 | DeepSeek | Mirror trigger 143's `ON CONFLICT DO UPDATE` path was SQL-tested but never end-to-end verified for `is_active` flips (classify-permits re-runs). | New `mirror-trigger-classify-permits-update.db.test.ts` added as R5.4 pre-flight. Validates the UPDATE branch end-to-end. Applied. |
| H | HIGH | 75 | DeepSeek | `application_number` VARCHAR pagination may skip/duplicate with mixed formats. | R5.2 plan: `ORDER BY application_number ASC, id ASC` with id tiebreaker; verify `idx_coa_app_num_id` exists. Pagination logic test feeds non-monotonic dataset. Applied. |
| I | CRITICAL | 95 (escalated) | Gemini + DeepSeek | TAG_PATTERNS matrix CoA-fitness (R2.v4 triage #10 deferral) escalated to BLOCKING. Both reviewers refuse to authorize without pre-implementation sampling. CoA descriptions describe *variances*, not *work*. | New R5.4.0 BLOCKING GATE: sample 200 CoA descriptions, measure coverage; commit `spec_42_phase_d_tag_patterns_audit.md` with %. <80% triggers TAG_PATTERNS extension before R5.4 implementation. Applied. |
| J | MED | 70 | Gemini | Composite FK kept on `cost_estimates` is non-standard; future devs may be confused. | Migration 145 adds explicit `COMMENT ON CONSTRAINT cost_estimates_permit_fk` explaining the Phase G interlock rationale. Applied. |
| K | MED | 75 | DeepSeek | 6-table JOIN with `lead_trades` would multiply rows without `ARRAY_AGG`. v4 example SQL showed plain LEFT JOIN. | R5.5 plan now explicitly requires LATERAL subquery with ARRAY_AGG (mirrors twin pattern). Applied. |
| L | LOW | 50 | Gemini | `coa-classifier.js` + `coa-trade-classifier.js` naming too similar. | Renamed: `coa-scope-classifier.js` + `coa-trade-classifier.js`. Applied. |
| M | MED | 65 | Gemini | Parcel-centroid geocoding introduces precision regression vs address-point. | DEFER — add to `docs/reports/review_followups.md`. Out of Phase D scope; document as known limitation. |
| N | HIGH | 60 | Gemini | Tier 2 spatial drop creates unmitigated low-coverage risk. | DEFER — Pre-R5.2 dry-run will measure Tier 1 baseline; if <75% coverage in audit_table, file follow-up WF1. Added to R5.2.0 sub-step. |
| O | MED | 55 | DeepSeek | Self-checklist reference (feedback_review_protocol.md) may be stale. | NOTE — Will read & verify at R5.X.e self-checklist time. No plan change. |
| P | LOW | 50 | Gemini | `lifecycle_status_history` idempotency key may have race on flicker. | OUT OF SCOPE — file separate WF3 if observed. Logged. |
| Q | LOW | 40 | DeepSeek | Migration 145 runtime cite is staging-only. | Already covered by R2.v5 fix C (lock_timeout + maintenance window). |
| R | NIT | 35 | DeepSeek | Realtor inclusion gate needs explicit logic test. | Add to R5.4 test plan: residential CoA + non-realtor scope_tags → realtor row inserted. Applied. |

**R2.v5 net delta from v4:**
- 3 CRITICAL bugs fixed (CHECK constraint, PK atomicity, PK production safety)
- 5 HIGH bugs fixed (orphan view, isTradeActiveInPhase math, lat/lng batching, mirror UPDATE test, pagination)
- 1 CRITICAL escalation (TAG_PATTERNS BLOCKING gate)
- 4 MED/LOW improvements applied (FK COMMENT, LATERAL ARRAY_AGG, rename, realtor test)
- 3 items deferred to follow-ups (centroid precision, Tier 2 fallback, lifecycle race)

---

## R2 Triage Log (3-reviewer Multi-Agent Review, 2026-05-13)

Worktree (feature-dev:code-reviewer with isolation=worktree) + Gemini + DeepSeek, all spawned in parallel against the R2.v3 plan.

| # | Sev | Conf | Source | Finding | Decision |
|---|---|---|---|---|---|
| 1 | **CRITICAL** | 100 | Worktree | `cost_estimates.cost_source` has CHECK constraint `IN ('permit', 'model')` (migration 071 line 13). Plan writes `'geometric'` → constraint violation on every CoA insert. | **BUG** — Migration 145 must extend CHECK to `IN ('permit', 'model', 'geometric')`. Applied. |
| 2 | **CRITICAL** | 95 | Worktree | Spec 42 §6.8 line 665 streaming filter for `link-coa-to-parcels.js` says `latitude IS NOT NULL` — 0-row no-op on first run (CoA records have no lat/lng pre-link). | **BUG** — Spec 42 §6.8 amended. New filter: `parcel_linked_at IS NULL AND street_name IS NOT NULL`. Applied. |
| 3 | **CRITICAL** | 95 | Worktree+Gemini | Spec 42 §6.5 step 13 + §6.8 line 667 say `classify-coa-trades.js` JOINs `trade_mapping_rules tier=3` — contradicts R0.8 audit + R2.v3 design (uses inline TAG_PATTERNS matrix). | **BUG** — Spec 42 §6.5 step 13 + §6.8 line 667 amended to reflect TAG_PATTERNS design. Applied. |
| 4 | **CRITICAL** | 90 | (Self-audit during triage) | Migration 138 did NOT drop the composite PRIMARY KEY `(permit_num, revision_num)` from migration 071. DROP NOT NULL is structurally blocked — PK columns enforce NOT NULL. | **BUG** — Migration 145 expanded (R2.v4): drop composite PK + add PK on `lead_id` + **KEEP composite FK** (Postgres NULL-FK semantics make it vacuously satisfied for CoA rows; load-bearing for Phase G's PRE-permit DELETE CASCADE) + then DROP NOT NULL on permit_num/revision_num. Applied. Phase D→G interlock documented. |
| 5 | **CRITICAL** | 50 | DeepSeek | R0.14 Brain null-safety marked pending. | **FALSE POSITIVE** — R0.14 was executed during triage (cost-model-shared.js:512 is null-safe via `Number.isFinite`). Active task's R0 audit results table reflects this. |
| 6 | HIGH | 90 | Worktree+Gemini | Spec 42 §6.9 line 687 says `classify-permits.js` REKEYs writes from `permit_trades` to `lead_trades` — but Phase D defers this to Phase H. | **BUG** — Spec 42 §6.9 amended: `classify-permits.js` entry now reads "Phase H REKEY (deferred). Phase D: NO CHANGE — mirror trigger 143 auto-mirrors to `lead_trades`." Applied. |
| 7 | HIGH | 88 | Worktree | Gap audit (Script 3, row 1) marks `determinePhase` as PRESERVED but `classify-permits.js:84-99` reads `permit.status` + `permit.issued_date` — neither exists on CoA. Will always return `'early_construction'`, potentially gating out CoA-applicable trades via `isTradeActiveInPhase`. | **BUG** — Gap audit corrected to ADAPTED. CoA twin returns `null` sentinel; `isTradeActiveInPhase(slug, null)` treated as pass-through (every TAG_PATTERNS match active). Documented in R5.4 self-checklist. Applied. |
| 8 | HIGH | 85 | Gemini | Source SQL example `lp.lead_id = 'coa:' || ca.application_number` re-derives lead_id per row → defeats index. Should use `ca.lead_id` directly (migration 133 added `coa_applications.lead_id`). | **BUG** — All Phase D source SQL revised to use `ca.lead_id` directly. Migration 133 confirmed it added the column + trigger backfills it. Applied. |
| 9 | HIGH | 85 | Worktree+DeepSeek | Migration 145's NULL composite FK to `permits` is Postgres-safe (NULL-FK semantics: any NULL in composite = vacuously satisfied) but undocumented. R5.5 db.test.ts has no coverage. | **BUG** — Migration 145 keeps the composite FK intentionally (load-bearing for Phase G PRE-permit DELETE CASCADE — see triage #4). Documented explicitly in migration 145 header + active task. R5.5 db.test.ts adds two assertions: (a) CoA insert with (NULL, NULL) succeeds (vacuously satisfies FK), (b) DELETE on permits CASCADES to permit-keyed cost_estimates rows but does NOT touch CoA rows. Applied. |
| 10 | HIGH | 80 | Gemini | TAG_PATTERNS matrix is permit-description-tuned. CoA descriptions describe *variances from by-laws*, not *work*. Matrix may lack keywords like "severance", "easement", "minor variance", "setback". Mere "verification" is insufficient. | **DEFER + SCOPE ADD** — Add R5.4.0 sub-step: "Sample 200 CoA descriptions, run against TAG_PATTERNS, measure unmapped_scope_count. If >20%, extend matrix with CoA-specific entries in a NEW `scripts/lib/coa-tag-patterns.js` (additive to the imported permits-side TAG_PATTERNS)." Logged in followups. |
| 11 | HIGH | 75 | DeepSeek | `link-coa-to-parcels.js` bundles 3 writes (parcel link + neighbourhood + lat/lng back-fill) without explicit atomicity contract. | **PARTIAL BUG** — Active task R5.2 plan now explicitly states: all 3 writes inside ONE `withTransaction`. Failure rolls back all 3 (avoiding orphan `lead_parcels` rows without `coa_applications.parcel_linked_at`). Applied. |
| 12 | MED | 82 | Worktree | TAG_PATTERNS matrix has work-field-shaped patterns. Low-risk on CoA. | **DEFER** — Note in `classify-coa-scope.js` code comment at R5.3 implementation time. Logged. |
| 13 | MED | 80 | Worktree | R0.6/R0.7/R0.12/R0.13 still listed as pending. | **FALSE POSITIVE** — All resolved against migration source-of-truth during triage; R0 audit results table updated. R0.12 live-DB verification deferred to R6 staging replay. |
| 14 | MED | 70 | Gemini | Tier 2 spatial matching is dead-end for CoA: spatial requires lat/lng, but CoAs only get lat/lng AFTER Tier 1 match. CoAs that fail Tier 1 can never Tier 2. | **BUG (wording)** — Gap audit "Tier 2 spatial match" row updated: removed misleading "optional second pass" language. Tier 1 only; spatial fallback marked OUT OF SCOPE. Applied. |
| 15 | MED | 65 | Gemini | Don't drop residential branch entirely — many CoAs ARE residential (deck/garage/pool/SFD); description keywords carry signal. | **PARTIAL BUG** — Gap audit row for `extractResidentialTags` changed: instead of full DROP, copy + strip to description-only `extractCoaResidentialKeywords` (~30 lines, not 100). Applied. |
| 16 | MED | 60 | Gemini | SRP violation: bundling parcel + neighbourhood + geocode in one script creates monolithic high-risk component. | **REJECT** — Spec 42 §6.11.1 explicitly bundles for CoA chain (deliberate scoping decision to minimize advisory-lock contention and reduce chain step count). Worktree finding #11 covered the atomicity contract concern, which is the real risk. Decision logged. |
| 17 | MED | 60 | DeepSeek | Pagination edge cases (duplicate app_numbers, NULL app_numbers, empty table) untested. | **DEFER** — Add to R5.2 logic.test.ts test plan: "paginate full CoA dataset and verify every row visited exactly once". Logged. |
| 18 | LOW | 70 | Gemini | Lat/lng back-fill UPDATE scans all linked CoAs on every run. Should scope to current-run lead_ids. | **DEFER** — Performance optimization; IS DISTINCT FROM guard prevents WAL bloat which is the bigger concern. Will revisit in R5.2 if benchmark shows pain. Logged. |
| 19 | LOW | 50 | Gemini | Parcel-centroid vs address-point precision disparity is a silent data quality issue. | **DEFER** — Document as known limitation in Spec 42 §6.5 step 8 description after Phase D ships. Logged. |
| 20 | NIT | 40 | DeepSeek | Twin-extraction creates copy-paste drift risk over time. No sync strategy. | **DEFER** — Out of Phase D scope. Logged for Phase F or later: TWIN_MAINTENANCE.md sibling checklist. |
| | | | | | |

---

> **PLAN LOCKED. Do you authorize this WF1 Phase D plan? (y/n)**
>
> **Scope (R2.v5 final — after second 3-reviewer triage pass):**
> - 4 NEW pipeline scripts (twin-extracted per Spec 42 §6.11.2)
> - 3 NEW shared libs (`coa-scope-classifier.js`, `coa-trade-classifier.js`, `coa-cost-model.js`)
> - 1 NEW migration (145 — **R2.v5 6 components**: 2 timestamp cols + 4 partial indexes + `cost_estimates` PK swap (atomic combined ALTER + lock_timeout safety) + `cost_source` CHECK extension (now correctly includes `'none'`) + `lead_id_orphan_audit` view update + FK COMMENT documentation)
> - 1 EXTENDED script (`link-coa.js` back-ref). `load-coa.js` UNCHANGED — geocoding bundled into `link-coa-to-parcels.js` as a parcel-centroid back-fill.
> - `scripts/manifest.json` 4-step CoA chain registration (locks 4201-4204)
> - 4 Spec 42 amendments (§6.5 step 13, §6.8 link-coa filter, §6.8 classify-coa-trades Read, §6.9 classify-permits.js entry)
> - NEW `src/tests/db/mirror-trigger-classify-permits-update.db.test.ts` (R5.4 pre-flight)
> - NEW R5.4.0 **BLOCKING GATE**: 200-CoA-description TAG_PATTERNS coverage audit + report
> - ~1,800 lines of new code + matching test triads
>
> **Phase D → Phase G interlock:** Phase D enables Phase G's PRE-permit retirement. Migration 145's PK swap is structured to KEEP the composite FK so Phase G's `DELETE FROM permits WHERE permit_type='Pre-Permit'` CASCADEs cleanly to legacy PRE-permit `cost_estimates` rows while leaving CoA-keyed rows untouched.
>
> **Execution sequence (6 commit groups):**
> 1. R5.1 — Foundations (migration 145 + 2 shared libs + link-coa.js extension)
> 2. R5.2 — `link-coa-to-parcels.js` (NEW, HIGH — includes parcel-centroid lat/lng back-fill)
> 3. R5.3 — `classify-coa-scope.js` (NEW, MED)
> 4. R5.4 — `classify-coa-trades.js` (NEW, HIGH — TAG_PATTERNS twin)
> 5. R5.5 — `compute-coa-cost-estimates.js` (NEW, HIGH — 6-table JOIN)
> 6. R5.6 — manifest.json + chain smoke test
>
> **Review cadence:** full 3-reviewer (Worktree + Gemini + DeepSeek) per group + final R8 on cumulative diff. BUG findings block next group.
>
> **DB integration test gating:** every Green Light runs `BUILDO_TEST_DB=1 npx vitest run src/tests/db` against fresh local Postgres before commit. Per Phase B lesson.
>
> **R0 audit status (R2.v5):** ALL R0 audits resolved against migration source-of-truth. Live-DB verification deferred to R6 staging replay. R0.6, R0.7, R0.13 verified against `migrations/133_extend_coa_applications_lead_id.sql`. R0.12 verified against migrations 138-144. R0.14 verified against `cost-model-shared.js:512`. R0.15 verified against `migrations/071_cost_estimates.sql` + `migrations/096_surgical_valuation.sql` (Worktree CRITICAL caught: 096 already extended CHECK to allow `'none'`).
>
> Phase C substrate is stable. Phase D delivers CoA classification parity via twin extraction. DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE awaiting authorization.
