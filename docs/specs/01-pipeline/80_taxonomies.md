# Pipeline Taxonomies

<requirements>
## 1. Goal & User Story
These static classification models define the business vocabulary that the pipeline uses to categorize permits — the 32 construction trades, 4 lifecycle phases, and product groups that tradespeople and suppliers filter by.
</requirements>

---

<architecture>
## 2. Trades (32 categories)

**Files:** `src/lib/classification/trades.ts` + `scripts/classify-permits.js` TRADES array (§7.1 dual-path)
**Consumers:** classifier.ts, tag-trade-matrix.ts, PermitCard.tsx, FilterPanel.tsx

| ID | Slug | Phase(s) |
|----|------|----------|
| 1 | excavation | early_construction |
| 2 | shoring | early_construction |
| 3 | concrete | early_construction, structural |
| 4 | structural-steel | structural |
| 5 | framing | structural |
| 6 | masonry | structural |
| 7 | roofing | structural |
| 8 | plumbing | structural, finishing |
| 9 | hvac | structural, finishing |
| 10 | electrical | structural, finishing |
| 11 | fire-protection | structural, finishing |
| 12 | insulation | finishing |
| 13 | drywall | finishing |
| 14 | painting | finishing, landscaping |
| 15 | flooring | finishing |
| 16 | glazing | finishing |
| 17 | elevator | structural |
| 18 | demolition | early_construction |
| 19 | landscaping | landscaping |
| 20 | waterproofing | early_construction |
| 21 | trim-work | finishing |
| 22 | millwork-cabinetry | finishing |
| 23 | tiling | finishing |
| 24 | stone-countertops | finishing |
| 25 | decking-fences | landscaping |
| 26 | eavestrough-siding | landscaping |
| 27 | pool-installation | landscaping |
| 28 | solar | finishing |
| 29 | security | finishing |
| 30 | temporary-fencing | early_construction |
| 31 | caulking | finishing |
| 32 | drain-plumbing | early_construction |
| 33 | realtor | n/a (Real-Estate-Agent persona — Spec 91 §1.3, no construction phase) |

**Tag-Trade Matrix:** 58 tag keys + 16 aliases → trade arrays with confidence scores. Defined in `src/lib/classification/tag-trade-matrix.ts`.

**Narrow-Scope Codes:** PLB/PSA→plumbing, HVA/MSA→hvac, DRN/STS→drain-plumbing, FSU→fire-protection, DEM→demolition

**Invariants:** Trade IDs 1-32 are stable, never renumbered (realtor=33 likewise). Trades are referenced by **`trade_id` → `trades.id`** in `permit_trades`, `lead_trades`, and `trade_mapping_rules`; the slug-FK (`trade_slug → trades.slug`) is on `universal_stream_trade_signals` only — `permit_trades` has no `trade_slug` column. TRADES array in JS script MUST match TS module.
</architecture>

---

<behavior>
## 3. Construction Phases (4-phase lifecycle)

**Files:** `src/lib/classification/phases.ts` + `scripts/classify-permit-phase.js`

```
early_construction → structural → finishing → landscaping
```

| Phase | Timing | Key Trades |
|-------|--------|------------|
| early_construction | 0-3 months | excavation, shoring, demolition, concrete, waterproofing, drain-plumbing, temporary-fencing |
| structural | 3-9 months | framing, structural-steel, masonry, roofing, plumbing, hvac, electrical, elevator, fire-protection |
| finishing | 9-15 months | insulation, drywall, painting, flooring, glazing, trim-work, millwork-cabinetry, tiling, stone-countertops, caulking, solar, security |
| landscaping | 15+ months / completed | landscaping, painting, decking-fences, eavestrough-siding, pool-installation |

**Phase Determination:** Status "completed"/"closed" → landscaping. Status "application"/"not started" → early_construction. No `issued_date` → early_construction. Otherwise: months since issuance maps to phase.

**Lead scoring** includes `phase_match` bonus when a trade's phase aligns with the permit's current phase.

## 4. Product Groups

**Files:** `src/lib/classification/groups.ts` + `scripts/reclassify-all.js`
**Tables:** `permit_products` (permit_num, revision_num, product_id, product_slug, product_name, confidence) — the permit-side link table.
`lead_products` (lead_id, product_id, confidence, classified_at — mig 184) — the **CoA-side** product link table, written by `classify-coa-trades.js` (`coa:` lead_ids) via `classifyCoaProducts` (tag hits @0.75 + the same `deriveArchetypesForCoa` bundle the trade path uses @0.45). NORMALIZED (product_id only — consumers JOIN `product_groups` for slug/name; the denormalized slug/name on `permit_products` is the legacy anti-pattern). Mirrors the `lead_trades` vs `permit_trades` coexistence — a new LINK table, not a new `products` entity table, so the §5.B.3 "no new products table" fence holds. CoA product-vocab coverage = a gated cov_ row via `manifest.classify_coa_trades.telemetry_vocab_cols.product_vocab` (live 27/27 PASS); existing CoA leads were one-time backfilled by `scripts/one-time/backfill-coa-products.js`.

Maps building materials to the trades that consume them:
- Lumber → framing, decking-fences
- Concrete mix → concrete
- Windows/glass → glazing
- HVAC equipment → hvac
- Plumbing fixtures → plumbing
- Electrical wire → electrical
- Roofing materials → roofing
- Insulation → insulation
- Drywall → drywall

---

## 5. permit_type Class (WF2 #1 2026-05-08, migration 120)

A 5-value taxonomy that classifies every permit_type into a behavioral bucket. WF2 #2 (classifier gating) and WF2 #3 (cost-model gating) read this to decide whether the full tag-trade matrix and Surgical Triangle apply.

| Class | Behavior | Example permit_types |
|---|---|---|
| `construction` | Full tag-trade matrix; Surgical Triangle cost slicing applies | New Building, Building Additions/Alterations, Plumbing(PS), Demolition Folder (DM) |
| `signage` | RESERVED — only `electrical` + `structural-steel` trades. No rows seeded today; reserved for future WF3 description-level subtype detection inside `Designated Structures` (1,081 of 1,781 rows are signs, but the same permit_type also covers solar/retaining walls/telecom). | (none yet) |
| `administrative` | Zero trades, zero cost slicing. Fee deferrals, zoning paperwork, certificates of occupancy. | DCs DeferredFees, AS Alternative Solution, Pre-Permit, Multiple Use Permit |
| `safety_upgrade` | Limited trades: `electrical` + `fire-protection` only. | Fire/Security Upgrade |
| `unclassified` | DEFAULT. Downstream MUST treat as safe-skip (same behavior as `administrative` — no trades, no cost slicing). New permit_types ingested before classification go here. | Designated Structures, Partial Permit, Conditional Permit, Temporary Structures |

**Single source of truth:** `migrations/120_permit_type_classifications.sql` seeds the `permit_type_classifications` lookup table (PK on `permit_type`). Operators tune via the admin Control Panel (Spec 86 §1, follow-up WF) — no code deploys needed to reclassify.

**Dual-path mirrors** (Spec 7 §7.1):
- TS: `src/lib/classification/permit-type-class.ts` exports `PermitTypeClass` type + named constants
- JS: `scripts/lib/permit-type-classifier.js` exports `loadPermitTypeClassMap(pool)` + same named constants
- Parity test (`src/tests/permit-type-class.logic.test.ts`) regression-locks all three surfaces against the SQL CREATE TYPE.

**Coverage today (247,030 dev-DB permits):** construction 95.5% / administrative 0.5% / safety_upgrade 2.8% / unclassified 1.5%.

### Consumer behaviors (WF2 #2, 2026-05-08)

`scripts/classify-permits.js` step 13 + `src/lib/classification/classifier.ts` (Spec 7 §7.1 dual-path) gate the tag-trade matrix on the class. Both surfaces import `filterTradesByClass` and `shouldAppendRealtor` from the dual-path mirror modules.

| Class | Trade matrix output | Realtor TradeMatch appended? |
|---|---|---|
| `construction` | **Full** Tier 1 + Tier 2 + narrow-scope (current behavior, unchanged) | **YES** |
| `signage` | RESERVED — `electrical` + `structural-steel` only (no rows seeded today) | NO |
| `administrative` | **EMPTY** — return `[]` (no `permit_trades` rows written) | NO |
| `safety_upgrade` | `electrical` + `fire-protection` only (filter-out, not extend) | NO |
| `unclassified` | **EMPTY** — safe-skip default | NO |

Realtor's "home will be sold" signal applies only to construction-class permits. A sign permit, fee deferral, or fire-upgrade permit does NOT generate a listing opportunity → `shouldAppendRealtor(class) === false` for non-construction classes. Branches on `permit_type_class` (DB-derived, NOT `account_preset` per Spec 95 §2.5.1).

**Behavioral expectation** post-WF2 #2: a re-run of `classify-permits.js` produces a different `permit_trades` row set for the 4.5% non-construction permit_types. Existing wrong rows for these permits become orphans; an explicit one-shot DELETE pass is filed as a follow-up WF3 (orphan cleanup is not part of WF2 #2 to keep the rollback boundary clean).

#### Realtor sub-gating within the construction class (WF3 2026-05-09)

The construction class (mig 120) bundles too much for the realtor signal alone. A live audit against the dev DB found 219K realtor rows on construction-class permits — but 50K were on `Plumbing(PS)`, 42K on `Mechanical(MS)`, 16K on `Drain and Site Service`, 2.5K on `Demolition Folder (DM)`, and 75K on permits with `'commercial' = ANY(scope_tags)`. None of those signal "home will be sold."

`shouldAppendRealtor` is therefore a 3-axis gate within the construction class:

| Axis | Pass condition | Rationale |
|---|---|---|
| 1. Class | `permitClass === 'construction'` | Existing class-level gate (kept). |
| 2. permit_type | `permit_type ∈ REALTOR_RELEVANT_TYPES` | The 5 residential structural building permit types: `New Building`, `Building Additions/Alterations`, `New Houses`, `Small Residential Projects`, `Residential Building Permit`. Excludes trade-only permits (PLB, MS, DSS), demolition (DM), non-residential. |
| 3. scope_tags | `'commercial' ∉ scope_tags` | Catches mixed-use permits where the residential building type carries a commercial scope tag. Mixed `[residential, commercial]` is fail-closed. `null`/`undefined`/empty scope_tags is permissive (no commercial evidence). |

`REALTOR_RELEVANT_TYPES` is a code constant mirrored TS↔JS via Spec 7 §7.1 dual-path (`src/lib/classification/permit-type-class.ts` + `scripts/lib/permit-type-classifier.js`). Parity regression-locked by `src/tests/permit-type-class.logic.test.ts` and live-DB regression-locked by `src/tests/db/realtor-gating.db.test.ts`. Contract null/undefined edge cases:
- `permit_type === null/undefined` → fail-closed
- `permit_type` not in `REALTOR_RELEVANT_TYPES` → fail-closed
- `scope_tags === null/undefined/[]` → permissive

**Behavioral expectation** post-WF3 (2026-05-09): a re-run of `classify-permits.js` produces a different `permit_trades` row set for ~125K wrong realtor rows (the trade-only / DM / commercial / non-residential rows). The classifier uses an **UPSERT + ghost-DELETE pattern** — `INSERT ... ON CONFLICT DO UPDATE` for every trade the classifier emits, then a targeted ghost-DELETE removes rows that the classifier no longer emits for each permit (the wrong realtor rows fall in this bucket post-fix). The two phases are separate `withTransaction` calls per batch; ~95K correct realtor rows on residential additions/new builds without commercial scope are preserved. Operator runbook: re-run `node scripts/classify-permits.js` post-merge.

> **Future operator-tunable variant (deferred WF):** add `permit_type_classifications.realtor_eligible BOOLEAN` so the residential-types list lives in the DB and is editable via Spec 86 §1 admin Control Panel without a code deploy. Filed in `docs/reports/review_followups.md` as Option B.

### Cost-model behaviors (WF2 #3, 2026-05-08)

`scripts/compute-cost-estimates.js` (the Muscle) and `src/features/leads/lib/cost-model-shared.js` (the Brain — single source of truth) gate the Surgical Triangle (Spec 83 §3) on `permit_type_class`. The Brain inlines the check (`row.permit_type_class === 'construction'`); both dual-path surfaces export a `shouldApplyCostSlicing(permitClass)` helper for downstream consumers and the parity test.

| Class | Surgical Triangle applied? | `cost_source` | `estimated_cost` | `trade_contract_values` |
|---|---|---|---|---|
| `construction` | **YES** — full Spec 83 §3 path (GFA → Area_Eff → Liar's Gate) | `'permit'` / `'model'` / `'none'` (per existing branches) | per existing branches | per existing branches |
| `signage` | NO — short-circuits BEFORE GFA | `'none'` | `null` | `{}` |
| `administrative` | NO — short-circuits BEFORE GFA | `'none'` | `null` | `{}` |
| `safety_upgrade` | NO — short-circuits BEFORE GFA | `'none'` | `null` | `{}` |
| `unclassified` | NO — safe-skip default | `'none'` | `null` | `{}` |

The short-circuit reuses the canonical Zero-Total-Bypass shape so downstream consumers don't need a new variant. `complexity_score` is still computed (preserves Spec 81 score-distribution telemetry); GFA / Area_Eff / Liar's Gate / trade valuation are skipped entirely.

Eliminates the $29M-for-2-signs / $1.96B WESTON GOLF CLUB bug class where sign permits inherited host-building GFA through the Surgical Triangle. The reserved `signage` class will be unlocked once a future WF3 adds description-level subtype detection inside `Designated Structures` (1,081 of 1,781 rows are signs, but the same permit_type also covers solar/retaining walls/telecom).

**SOURCE_SQL contract (the Muscle):** `compute-cost-estimates.js` adds `LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type` with `COALESCE(ptc.class, 'unclassified') AS permit_type_class`. A startup guard refuses to run when the table is empty (Spec 47 §R5). `audit_table` gains a `permit_type_class_skipped` row reporting the count per run; `emitMeta` declares `permit_type_classifications` as a read dependency.

**Behavioral expectation** post-WF2 #3: ~4.5% of permits (the non-construction tail) emit `cost_source='none'` on the next `compute-cost-estimates.js` run. Pre-existing wrong rows in `cost_estimates` become orphans (~10K rows); the orphan cleanup is filed as a separate WF3 (mirrors WF2 #2's clean rollback boundary).

## 5.A CoA Taxonomy (WF1 #coa-pipeline-parity-phase-a, 2026-05-13)

Parallel taxonomy for `coa_applications` mirroring the §5 `permit_type_class` work. CoA filings carry no `permit_type` field (variance applications are not permit applications), so the taxonomy uses a `coa_type_class` column populated by the description-keyword classifier.

### `coa_type_class` value set

| Class | Definition | Surgical Triangle (Spec 83) applied? | Trade matrix (Spec 13) applied? |
|---|---|---|---|
| `residential` | Single-family dwelling, semi-detached, townhouse, apartment, duplex, triplex, ADU | YES — geometric path only (no Liar's Gate; no applicant cost) | YES — Tier 3 description rules only; realtor included per `shouldAppendRealtor` |
| `commercial` | Retail, restaurant, office, warehouse, industrial, hotel, business | YES — geometric path | YES — Tier 3 only; realtor EXCLUDED per existing 3-axis gate |
| `institutional` | School, church, hospital, library, municipal, community centre | YES — geometric path | YES — Tier 3 only; realtor EXCLUDED |
| `mixed` | Description matches BOTH residential AND commercial keyword sets | YES — geometric path with mixed-use intensity | YES — Tier 3 only; realtor INCLUDED only if residential subset dominant |
| `unclassified` | Description matches no rule | NO — safe-skip default; `cost_source='none'`, `estimated_cost=null` | NO — safe-skip; emit default fallback trade only |

### Description-keyword decision tree (Phase D `classify-coa-scope.js`)

Single pass over `coa_applications.description`. First-match wins per class:

**Residential keywords** (ILIKE `%<term>%`):
- `dwelling`, `single family`, `single-family`, `semi-detached`, `semi detached`, `townhouse`, `apartment`, `duplex`, `triplex`, `accessory dwelling`, `ADU`, `secondary suite`, `garden suite`, `laneway`, `rooftop addition`, `basement apartment`

**Commercial keywords:**
- `retail`, `restaurant`, `cafe`, `office`, `warehouse`, `industrial`, `commercial`, `hotel`, `motel`, `storefront`, `mixed-use building`, `mixed use building`, `mixed-use development`, `business`, `bar`, `nightclub`

**Institutional keywords:**
- `school`, `church`, `synagogue`, `mosque`, `temple`, `hospital`, `clinic`, `library`, `community centre`, `community center`, `municipal`, `daycare`, `recreation`, `arena`, `pool` (when context = community pool, not residential)

**Mixed-use detection:** description matches at least one residential AND one commercial keyword → `mixed`.

**Fallback to parcel-derived class:** if description-only classification yields `unclassified` AND `lead_parcels` JOIN to `parcel_buildings.structure_type` resolves, derive `coa_type_class` from structure_type (e.g., `single_family_detached` → `residential`, `commercial_retail` → `commercial`). Audit_table tracks `coa_type_class_source IN ('description', 'parcel_fallback', 'unclassified')`.

### `project_type` value set

Separate column from `coa_type_class`. Captures WHAT is being built/changed (analogous to `permits.work`):

| Class | Definition |
|---|---|
| `Addition` | New floor area added to existing structure (rear/side addition, second-storey addition, basement addition) |
| `NewConstruction` | New building on a vacant lot OR demolition + new build (replaces existing structure) |
| `Alteration` | Interior or exterior modification without floor-area addition (renovation, exterior facade, kitchen/bathroom refit) |
| `Demolition` | Tear-down without new build (standalone demolition variance) |
| `Severance` | Lot subdivision request — NOT a building variance, no construction follows |
| `Mixed` | Description signals multiple project types (e.g., "demolish garage + new addition") |

### Phase-code namespace disambiguation (84-W11 resolution cross-ref)

CoA P3/P4 and Permit P3/P4 are string-identical phase codes (legacy artifact). Per Spec 84 §3 Phase-Code Namespace Deprecation:
- New consumers should query `lifecycle_seq` (1–110, granular) for unambiguous phase identity.
- Legacy P-code consumers can disambiguate via `lifecycle_group` (C1–C4 for CoA, BP1–BP7 for Permit) or `lead_type` discrimination.
- `coa_type_class` is the CoA-side analog of `permit_type_class` — both serve as cohort dimensions for the granular `phase_stay_calibration` cohort key `(permit_type, project_type, coa_type_class, from_seq, to_seq)`.

### Acceptance criteria (Phase D)

- `coa_applications.coa_type_class IS NOT NULL ≥ 95%` of active CoAs (per Spec 49 coverage matrix).
- `coa_applications.project_type IS NOT NULL ≥ 90%`.
- Description-only classification accuracy ≥ 80% on a sample of 100 manually-classified CoAs (audit_table tracks ambiguity).
- If accuracy < 80%, escalate to LLM-per-row v2 path per Spec 42 §6.13 Open Decision #1.

---

## 5.B Unified Taxonomy v-next (PROPOSED — WF2 #trade-product-taxonomy, 2026-06-17)

**Status:** Proposed model, settled with product owner; implemented via the WF2 (phased — see active task). On completion this SUPERSEDES §2 (trades) + §4 (product groups) and reconciles the granular 38-trade forecast vocab (Spec 84/85) by folding 5 split trades. The 22/38 `cov_trade_vocab` gap (Spec 49/30 §3) is what this resolves; target becomes 35/35.

### 5.B.1 Model (trade-primary)
- **`trades`** — the PRIMARY entity. Columns: `id` (stable identity, never renumbered), `slug`, `kind` (`construction` | `service` | `persona`), `seq` (build **stage band 1–12** = `work_band`; concurrent trades SHARE a band; `spans`/`lifecycle` for site-maintenance/realtor), `phase` (§3 4-phase membership — MANY-to-many; bands roll up into phases). Forecast/cost knobs surfaced here as design-of-record, runtime in Spec 85 `trade_configurations` / Spec 83 `trade_sqft_rates`: `bimodal` (§5.B.2), `cost_basis` (§5.B.2), and `bid_phase`/`work_phase` P-stage timing (§5.B.9 — the existing `trade_configurations` knobs; the `seq`-band is build-order, not timing).
- **`products`** — materials/rentals/services procured on a project. Columns: `id`, `slug`, `type` (`material` | `rental` | `service`). Manufacturer/supplier/rental/service audiences match here.
- **`trade_products`** — link table (trade → products it installs/procures). Product-lead **timing = the installing trade's forecast stage** (Spec 84/85; no separate product-forecast model).
- **archetype** — a SECONDARY, derived rollup over §5.A `project_type` × `scope_tags` (NOT a new classifier). Used as (a) a named project label, (b) a `{trades, products}` **bundle prior** that boosts classification recall (a "kitchen-reno" implies its trades even when tags don't name each), and (c) a **`geom_basis`** (Spec 65 §6 SC-5 / `ARCHETYPE_GEOM_BASIS` in `archetypes.js`+`.ts`) mapping each archetype to the parcel scenario field that supplies its floor area for the cost model (Spec 83 Step B) — `null` for non-floor-area archetypes (ENV/MEC/SITE). Phase 3 (Spec 65 §7) added the last two: `GAR→max_garage_gfa_sqm` and `LANE→max_rear_suite_gfa_sqm` (the unified laneway⊕garden rear suite). Additive map; does NOT widen the bundle objects, so the locked bundle/parity tests are unaffected. (The broader trade-differentiated archetype set — basement-underpinned / interior-gut / envelope-cladding / site / FB+COA — is a deferred Spec-80 WF.)

### 5.B.2 Master trades (35)

Legend: FB full-build · ADD addition · BAS basement-reno · KIT kitchen-reno · BTH bathroom-reno · INT interior-reno · ENV envelope-exterior · MEC mechanical-upgrade · SITE site-landscape · LANE laneway/garden-suite · GAR garage/accessory

`band` = build **stage band** (concurrent trades share a band; shown number + name). **The 4 phases ORGANIZE the bands — each band maps to exactly ONE phase (1:1), and a trade's `phase` = its band's phase** (this supersedes Spec 80 §3's many-to-many membership for the v-next model): **early_construction = bands 1–5 · structural = bands 6–10 (shell + systems + close-in: rough-in/insulate/drywall are NOT finishing) · finishing = band 11 (interior finishes) · landscaping = band 12**. `bimodal`: Y = staged bid→work routing (`trade_configurations.bid_phase_cutoff`/`work_phase_target`, Spec 85); N = single window. `cost_basis`: `per_sqft` (default, Spec 83 `trade_sqft_rates`) · `per_unit` (windows/elevator/cabinets/doors/solar) · `fixed` (lump-sum/fixed-fee) · `rental` (monthly) · `commission` (realtor). Per-trade **timing** (`bid_phase`/`work_phase` P-stages) is §5.B.9 — NOT in this table.

| band | id | trade | kind | phase | bimodal | cost_basis | products (id) | archetypes |
|---|---|---|---|---|---|---|---|---|
| 1 site-setup | 36 | site-preparation | service | early_construction | N | fixed | portable-toilet (22), temp-fencing-rental (24), surveying (25), tree-removal (26) | FB, ADD, BAS, LANE, GAR, SITE |
| 2 teardown | 18 | demolition | construction | early_construction | Y | per_sqft | — | FB, ADD, BAS, INT, GAR, LANE |
| 3 earthwork | 1 | excavation | construction | early_construction | Y | per_sqft | — | FB, ADD, BAS, SITE, LANE, GAR |
| 3 earthwork | 2 | shoring | construction | early_construction | Y | per_sqft | — | FB, ADD, BAS, LANE |
| 4 foundation | 3 | concrete | construction | early_construction | Y | per_sqft | — | FB, ADD, BAS, SITE, LANE, GAR |
| 5 seal+drainage | 20 | waterproofing | construction | early_construction | Y | per_sqft | — | FB, ADD, BAS, LANE |
| 5 seal+drainage | 32 | drain-plumbing | construction | early_construction | Y | per_sqft | — | FB, ADD, BAS, SITE, MEC, LANE |
| 6 structure | 4 | structural-steel | construction | structural | Y | per_sqft | — | FB, ADD |
| 6 structure | 5 | framing | construction | structural | Y | per_sqft | lumber (11) | FB, ADD, BAS, INT, SITE, LANE, GAR |
| 7 dry-in | 7 | roofing | construction | structural | Y | per_sqft | roofing-materials (13) | FB, ADD, ENV, LANE, GAR |
| 7 dry-in | 6 | masonry | construction | structural | Y | per_sqft | exterior-cladding (20), scaffolding-lifts (23) | FB, ADD, ENV, LANE, GAR |
| 7 dry-in | 26 | eavestrough-siding | construction | structural | Y | per_sqft | eavestroughs (14), exterior-cladding (20), scaffolding-lifts (23) | FB, ADD, ENV, LANE, GAR |
| 7 dry-in | 16 | glazing | construction | structural | Y | per_unit | windows (6), mirrors-glass (16) | FB, ADD, ENV, INT, LANE, GAR |
| 7 dry-in | 28 | solar | construction | structural | Y | per_unit | — | ENV, FB, LANE |
| 7 dry-in | 31 | caulking | construction | structural | Y | per_sqft | — | FB, ADD, ENV, BTH, INT, LANE |
| 8 rough-in | 8 | plumbing | construction | structural | Y | per_sqft | plumbing-fixtures (4) | FB, ADD, BAS, KIT, BTH, MEC, LANE |
| 8 rough-in | 9 | hvac | construction | structural | Y | per_sqft | hvac-equipment (18) | FB, ADD, BAS, MEC, LANE |
| 8 rough-in | 10 | electrical | construction | structural | Y | per_sqft | lighting (10) | FB, ADD, BAS, KIT, BTH, INT, MEC, LANE, GAR |
| 8 rough-in | 11 | fire-protection | construction | structural | Y | per_sqft | — | FB, ADD, MEC |
| 9 insulate | 12 | insulation | construction | structural | Y | per_sqft | insulation-materials (19) | FB, ADD, BAS, ENV, LANE |
| 10 drywall | 13 | drywall | construction | structural | Y | per_sqft | drywall-board (12) | FB, ADD, BAS, KIT, BTH, INT, LANE |
| 11 interior-finishes | 23 | tiling | construction | finishing | Y | per_sqft | tiling (5) | FB, KIT, BTH, BAS, INT, LANE |
| 11 interior-finishes | 15 | flooring | construction | finishing | Y | per_sqft | flooring (8) | FB, ADD, BAS, KIT, BTH, INT, LANE |
| 11 interior-finishes | 14 | painting | construction | finishing | Y | per_sqft | paint (9) | FB, ADD, BAS, KIT, BTH, INT, LANE |
| 11 interior-finishes | 21 | trim-work | construction | finishing | Y | per_sqft | doors (7), staircases (15) | FB, ADD, BAS, KIT, BTH, INT, LANE |
| 11 interior-finishes | 22 | millwork-cabinetry | construction | finishing | Y | per_unit | kitchen-cabinets (1), countertops (3), appliances (2), staircases (15) | FB, KIT, BTH, INT, LANE |
| 11 interior-finishes | 24 | stone-countertops | construction | finishing | Y | per_unit | countertops (3) | FB, KIT, BTH, LANE |
| 11 interior-finishes | 17 | elevator | construction | finishing | Y | per_unit | — | FB, ADD |
| 11 interior-finishes | 34 | overhead-doors | construction | finishing | Y | per_unit | garage-doors (17) | FB, ADD, SITE, GAR, LANE |
| 11 interior-finishes | 29 | security | construction | finishing | Y | fixed | — | FB, INT, MEC |
| 12 landscaping | 19 | landscaping | construction | landscaping | Y | fixed | — | FB, SITE, LANE |
| 12 landscaping | 25 | decking-fences | construction | landscaping | Y | per_sqft | lumber (11) | SITE, ADD |
| 12 landscaping | 27 | pool-installation | construction | landscaping | Y | fixed | — | SITE |
| spans | 37 | site-maintenance | service | spans all | N | fixed | bin-rental (21), site-security (27) | FB, ADD, BAS, KIT, BTH, INT, LANE, GAR |
| lifecycle | 33 | realtor | persona | near-completion | N | commission | — | ALL |
| — deprecated | 30 | temporary-fencing | deprecated | — | — | — | folded → site-preparation + temp-fencing-rental (24) | — |

### 5.B.3 Products (27 — 20 material / 4 rental / 3 service)

> **Physical table = `product_groups`** (mig 031; TS module exports `PRODUCT_GROUPS`; link table `permit_products`). "Products" is the conceptual hub name; this WF adds a `type` column to the existing `product_groups` table **in place** — it does NOT create a new `products` table or rename `product_groups` (rename = `permit_products` FK blast radius, out of scope). The new 27-row layout (incl. the `lumber-drywall`→`lumber`(11)+`drywall-board`(12) split) is applied by a **guarded whole-table re-seed** (abort if `permit_products` non-empty → `TRUNCATE RESTART IDENTITY` → INSERT 1–27) rather than a by-id cascade re-key — safe because the table is dormant (`permit_products`=0). `tag-product-matrix.ts` references products by **slug** — the ~10 `lumber-drywall` refs must be repointed (per-reference) to `lumber`/`drywall-board`.

| id | slug | type | id | slug | type |
|---|---|---|---|---|---|
| 1 | kitchen-cabinets | material | 15 | staircases | material |
| 2 | appliances | material | 16 | mirrors-glass | material |
| 3 | countertops | material | 17 | garage-doors | material |
| 4 | plumbing-fixtures | material | 18 | hvac-equipment | material |
| 5 | tiling | material | 19 | insulation-materials | material |
| 6 | windows | material | 20 | exterior-cladding | material |
| 7 | doors | material | 21 | bin-rental | rental |
| 8 | flooring | material | 22 | portable-toilet | rental |
| 9 | paint | material | 23 | scaffolding-lifts | rental |
| 10 | lighting | material | 24 | temp-fencing-rental | rental |
| 11 | lumber | material | 25 | surveying | service |
| 12 | drywall-board | material | 26 | tree-removal | service |
| 13 | roofing-materials | material | 27 | site-security | service |
| 14 | eavestroughs | material | | | |

### 5.B.4 `trade_products` links (32)

`(5,11) (6,20) (6,23) (7,13) (8,4) (9,18) (10,10) (12,19) (13,12) (14,9) (15,8) (16,6) (16,16) (21,7) (21,15) (22,1) (22,3) (22,2) (22,15) (23,5) (24,3) (25,11) (26,14) (26,20) (26,23) (36,22) (36,24) (36,25) (36,26) (34,17) (37,21) (37,27)`

> Trade ids: `36`=site-preparation (installs the 4 site-setup products), `37`=site-maintenance (bin-rental + site-security), `34`=overhead-doors (garage-doors). The 4 pairs formerly keyed to the retired `temporary-fencing`/legacy `site-preparation`(30) now key to **36** (the new site-preparation), not 30.

### 5.B.5 Archetype bundle classifier (the prior `archetype → {trades, products}`)

Derived from §5.A `project_type` × `scope_tags`; the classifier uses each archetype's bundle to boost recall on implied trades/products. `realtor` (persona) fires across ALL at near-completion; `site-maintenance` spans all build types.

| archetype | trades (bundle) | products |
|---|---|---|
| **FB** full-build | all trades EXCEPT pool-installation, decking-fences | ≈ all 27 |
| **LANE** laneway/garden-suite | ≈ full-build set (a small dwelling — all structural + interior-finish trades) | ≈ all material + site-prep/maintenance |
| **ADD** addition | site-prep, excavation, shoring, concrete, structural-steel, framing, masonry, roofing, glazing, eavestrough-siding, plumbing, hvac, electrical, fire-protection, insulation, drywall, flooring, painting, trim-work, demolition, waterproofing, decking-fences, caulking, drain-plumbing, overhead-doors, site-maintenance | lumber, exterior-cladding, scaffolding-lifts, roofing-materials, windows, eavestroughs, plumbing-fixtures, hvac-equipment, lighting, insulation-materials, drywall-board, paint, doors, garage-doors |
| **BAS** basement-reno | site-prep, excavation, shoring, concrete, waterproofing, framing, drain-plumbing, plumbing, hvac, electrical, insulation, drywall, tiling, flooring, painting, trim-work, demolition, site-maintenance | lumber, plumbing-fixtures, hvac-equipment, lighting, insulation-materials, drywall-board, tiling, flooring, paint, doors, staircases, bin-rental |
| **KIT** kitchen-reno | plumbing, electrical, drywall, tiling, flooring, painting, trim-work, millwork-cabinetry, stone-countertops, site-maintenance | kitchen-cabinets, countertops, appliances, plumbing-fixtures, lighting, tiling, flooring, paint, doors, staircases, drywall-board, bin-rental |
| **BTH** bathroom-reno | plumbing, electrical, drywall, tiling, flooring, painting, trim-work, millwork-cabinetry, stone-countertops, caulking, site-maintenance | plumbing-fixtures, tiling, lighting, flooring, paint, countertops, kitchen-cabinets(vanity), drywall-board, bin-rental |
| **INT** interior-reno | demolition, framing, electrical, drywall, glazing, tiling, flooring, painting, trim-work, millwork-cabinetry, security, caulking, site-maintenance | lumber, lighting, drywall-board, windows, mirrors-glass, tiling, flooring, paint, doors, staircases, kitchen-cabinets, countertops, bin-rental |
| **ENV** envelope-exterior | masonry, roofing, glazing, insulation, eavestrough-siding, solar, caulking | exterior-cladding, scaffolding-lifts, roofing-materials, windows, mirrors-glass, eavestroughs, insulation-materials |
| **MEC** mechanical-upgrade | plumbing, hvac, electrical, fire-protection, security, drain-plumbing | plumbing-fixtures, hvac-equipment, lighting |
| **SITE** site-landscape | site-prep, excavation, concrete, framing, drain-plumbing, landscaping, decking-fences, pool-installation, overhead-doors | lumber, garage-doors, surveying, tree-removal, temp-fencing-rental, portable-toilet |
| **GAR** garage/accessory | site-prep, excavation, concrete, framing, masonry, roofing, glazing, electrical, eavestrough-siding, demolition, overhead-doors, site-maintenance | lumber, exterior-cladding, scaffolding-lifts, roofing-materials, windows, lighting, eavestroughs, garage-doors |

### 5.B.6 Reconciliation with the current model
- **Trades 33 → 35 (active):** +`overhead-doors` (id **34**), +`site-preparation` (id **36**), +`site-maintenance` (id **37**). **IDs 1–32 are the invariant — never renumbered.** `temporary-fencing` KEEPS id **30** but is marked **deprecated** (its function absorbed by `site-preparation` + the `temp-fencing-rental` product 24 — the row is NOT deleted and NOT re-slotted). realtor stays 33. So the physical `trades` table holds **36 rows = 35 active + 1 deprecated**.
- **The 5 granular forecast trades FOLD (they are not trades):** `windows` → product (installed by `glazing`); `paving`/`outdoor-patio` → `landscaping`; `decks`/`back-yard-fences` → `decking-fences`. These were SERIAL-seeded (mig 131) and carry **slug-FK children in `universal_stream_trade_signals`** (mig 130, no CASCADE) — the fold migration must **DELETE those signal rows before deleting the trade rows, keyed on slug (not id)**.
- **cov_trade_vocab denominator:** the gate counts `COUNT(DISTINCT id) FROM trades`, which is **36** (incl. the deprecated row) unless filtered. The denominator MUST exclude deprecated rows via `vocabFilter: "kind != 'deprecated'"` (the new `kind` column) → honest **/35**. Without the filter the gate caps at 35/36 (perpetual WARN). Phase 1 makes the denominator honest (classifier still emits ~22 → reports worse-but-truer); the gate goes GREEN (35/35) in Phase 2.
- **Products: dormant 16 → 27 wired.** Split `lumber-drywall` → `lumber` + `drywall-board`; add `hvac-equipment`, `insulation-materials`, `exterior-cladding`, 4 rentals, 3 services. The dormant tag-product classifier (`permit_products` = 0) is activated.
- **archetype** is derived from §5.A `project_type` + `scope_tags` — NO new classification pass; the new artifact is the bundle prior (5.B.5).
- **Open §5 decisions still to confirm:** (1) `windows` as product-only vs a distinct `window-installer` trade; (2) deferred material products (`concrete`/rebar, `structural-steel`, `solar-panels`, `pool-equipment`); (3) the `cost_basis` direction — how far past `per_sqft` the cost engine goes given data availability (Phase 4, see active task).

### 5.B.7 Sell-side audience — `suppliers` + `supplier_products` → **see Spec 87**

The sell-side mirror of `trade_products` — who *sells* each product (a single-line window maker; a big-box like Home Depot spanning many categories). Because `suppliers` are **real marketplace accounts onboarded over time** (not a fixed seeded vocabulary), this lives in its **own spec: Spec 87 (Supplier & Sell-Side Audience Model)** — NOT in the Spec-80 taxonomy and **out of WF2 Phase-1 scope**. Products (this spec) are the hub: `trades` install them (`trade_products`); `suppliers` (Spec 87) sell them (`supplier_products`); a supplier lead inherits the product's installing-trade forecast stage. Home Depot = 21 timed streams (broad `supplier_products`); a lighting maker = 1 (timed by `electrical`).

### 5.B.8 How the tables connect (entity relationships)

```
 suppliers ──< supplier_products >── PRODUCTS ──< trade_products >── TRADES
                                        │                              │
                                  permit_products                permit_trades
                                        └──────── LEAD (permit / coa_application) ──────┘
                                                       │  classified into archetype (project_type × scope_tags)
                                                       ├── trade_forecasts (lead × trade → predicted_start, urgency)   ← timing
                                                       └── cost_estimates (lead → per-trade $ via trades.cost_basis + trade_sqft_rates)  ← cost
```

**Two lead flows:**
1. **Tradesperson lead:** LEAD → `permit_trades` (emitted trade) → `trade_forecasts` (timing) → matched to that trade's tradespeople.
2. **Supplier/manufacturer lead:** LEAD → its trades → `trade_products` → product → `supplier_products` → suppliers carrying it; **timing inherited** from the product's installing trade's `trade_forecasts` row. (Acme Lighting fires when `electrical` sources; Home Depot fires across all 21 of its categories.)

**`archetype`** is derived (`project_type × scope_tags`) and is the classification *prior* that boosts which trades/products get emitted onto the LEAD. **`cost`** rides `trades.cost_basis` + `trade_sqft_rates` → `cost_estimates`. Taxonomy tables (`trades`, `products`, `trade_products`) are Spec-80/WF2-Phase-1; the sell-side (`suppliers`, `supplier_products`) is the separate accounts layer (§5.B.7 caveat).

### 5.B.9 Trade timing — `bid_phase` / `work_phase` (P-stages, NOT bands)

Timing is **two P-stage points per trade** — the **existing** Spec 85 knobs `trade_configurations.bid_phase_cutoff` / `work_phase_target` (P-codes P1–P20). **The `seq`-band is build-ORDER only** (display + archetype grouping) — it is deliberately NOT the timing knob, because **bidding starts pre-construction** (when the permit is filed/issued — P3/P7a), which has **no construction-band equivalent**. (This corrects an earlier draft that proposed a band-based `bid_band`; reusing the bands for timing introduced a third vocabulary and couldn't express pre-construction bids.)

- **`work_phase`** = the P-stage the trade is on-site (≈ where its `seq`-band falls in the lifecycle: bands 1–5→P9–P10, 6–7→P11, 8→P12, 9→P13, 10→P14, 11→P15, 12→P17).
- **`bid_phase`** = the P-stage to START bidding — usually **pre-construction** (P3 permit-application / P7a issued), earlier than `work_phase`.
- `bimodal=Y` → `bid_phase < work_phase` (shortlist → rescue); `bimodal=N` → `bid_phase = work_phase` (degenerate single window).

Examples (real values from `trade_configurations` / Spec 85 `TRADE_TARGET_PHASE`):

| trade | bid_phase | work_phase | note |
|---|---|---|---|
| excavation | P3 | P9 | bid at permit application; on-site at site prep |
| decking-fences | P12 | P17 | |
| realtor | P1 | P19 | wide listing-signal window (NOT band-11; from earliest intake) |
| site-preparation (`bimodal=N`) | P3 | P3 | single window |

**How it connects (Spec 85 forecast routing):** for a lead at current lifecycle phase `P` and trade `T` — `ordinal(P) ≤ ordinal(bid_phase)` → too early; `bid_phase < P < work_phase` → **bid/shortlist**; `P ≥ work_phase` → **work/rescue**. **Product/supplier leads (Spec 87)** inherit the installing trade's `bid_phase`/`work_phase` via `trade_products`. **Runtime/layer:** these are the EXISTING Spec 85 `trade_configurations` columns (control panel = Spec 86) — **Phase 4** only adds rows for the 3 new trades + retires the 5 folded. The dormant `universal_stream_trade_signals` (110-seq matrix) stays superseded (delete folded-trade rows; candidate for removal). **No new timing column is added to `trades`.**

---

## 5.C Trade Attachment — FINAL model (P16, 2026-07-10): evidence + lean scope-mapped inference

> **Status:** CANONICAL (P14-D executed as P16; the panel-converged D1-D8 decision record).
> The P14-A "before" snapshot is retained below as §5.C.6 (SUPERSEDED) so the CURRENT→FINAL
> delta stays explicit. Gate evidence: `docs/reports/pipeline-validation/2026-07-09-p16-lean-complement-eval.md`
> (16B GO: hold-out recall 61.4% / prec(insp) 70.5% / mean 10.2 — PROVISIONAL, 122-permit corpus;
> deep_scrapes re-measure is a standing obligation). Rule inventory (pre-P16 file:lines):
> `2026-07-09-p14-trade-attachment-rule-inventory.md`.

**The model (D1):** `attached = evidence ∪ lean_inference`. The EVIDENCE layer (direct
tag/rule/narrow/work-fallback hits) is preserved byte-for-byte as the precision posture; the
INFERENCE layer attaches the lean, inspection-calibrated `LINE_TRADE_COMPLEMENT` of each
`mapToLines`-detected cost line. Provenance is the FIRST-CLASS column
`attachment_basis IN ('evidence','inference')` on `permit_trades` + `lead_trades` (mig 216 +
the mig-143 mirror), NOT a tier value (D4). Both bases SERVE (`is_active=true`); consumers
rank/weight by BASIS, never by the descriptive 0.50 inference confidence ([FAB4]/D5).

### 5.C.1 Attachment rules (FINAL — firing condition × tier × basis)

Order of operations in `classifyPermit` (`scripts/classify-permits.js`):

| # | Rule | Fires when | Tier | is_active / basis | WHY |
|---|---|---|---|---|---|
| 1 | Tier-1 DB rules | `work` matches an active `trade_mapping_rules` row (6 live) | 1 | true / evidence | strongest direct signal |
| 2 | **Narrow-scope early-return** | `permit_num` code ∈ NARROW_SCOPE_CODES | 1 | true / evidence | code-carrying companion permits carry ONE narrow scope; **skips 3-5 — a narrow permit gains NO inference** [GRD-2 lock] |
| 3 | Tier-2 tag-trade matrix | `scope_tags` hits a matrix key | 2 | true / evidence | the primary evidence path |
| 4 | Work-field fallback | rules 1+3 emitted 0 trades | 1 | true / evidence (`fromFallback`) | never leave a construction permit trade-less |
| 5 | **Lean inference layer (P16)** | gate ON ∧ `mapToLines(permit)` ≠ null | 2 | **true / 'inference'**, conf 0.50 | the retired bundle prior's slot; complement of the DETECTED cost line(s), UNIONed under `merged.has` (evidence keeps its slot); no line → evidence-only |
| 6 | applyScopeLimit | always (post-merge) | filter | — | WORK_SCOPE_EXCLUSIONS subtract by `work` |
| 6b | **Permit-type ceiling (P16 D2)** | broad-scope ∧ permit_type ∈ {Plumbing(PS)→plumbing, Mechanical(MS)→hvac, Drain and Site Service→drain-plumbing} | filter | — | the `permit_type`-STRING complement to the `permit_num`-CODE gate (the code-less residual) |
| 7 | Class gate | always | filter | — | `permit_type_class` allowlist (mig 120) |
| 8 | Realtor append | class=construction ∧ permit_type gate ∧ 'commercial'∉tags | 1 | true / evidence, conf 1.0 | Spec 91 persona |

**Gate [BUG-6]:** rule 5 is HARD-gated on `logic_variables.p16_inference_layer_enabled`
(OFF → evidence-only, the P13-3 posture byte-preserved; flipped ON at 16F). Dual-path mirror:
`src/lib/classification/classifier.ts` (`options.inferenceEnabled`).

**CoA twin (16D):** `classifyCoaTrades(row, { inferenceEnabled })` — direct tag-matrix =
evidence; lean complement of the CoA-aware `mapToLines` lines = inference; the 2-state
`fromBundle` boolean is RETIRED. Severance/Demolition → 0 rows (P6.6 fence preserved). The
realtor append is evidence. Writers persist `attachment_basis` (9-col INSERT, both scripts).

**Consumer contract (16E, D5):** feed — inference admitted by the is_active+conf≥0.5 predicate,
ranked below equal-pillar evidence via a deterministic 1-point relevance nudge + badged via the
projected `attachment_basis`; supplier — permit-arm guard `(tier ≤ 1 OR confidence > 0.55 OR
attachment_basis = 'inference')` (confidence-band route FORBIDDEN); forecasts — basis projected
in both SOURCE_SQL branches, inference banded at `inference_weight` (0.5×) of the calibration
sample; scores — transitive only (no direct lead_trades read; locked).

### 5.C.2 Cost line × LEAN trade complement (FINAL — `LINE_TRADE_COMPLEMENT`)

Source of truth: `src/features/leads/lib/archetype-cost-map.js`. One entry per EXISTING
`LINE_DEFS` cost line (D6 — no new archetype codes). Calibration: whole-corpus per-inspectable-
trade TP/FP (service trades hvac/plumbing/drain-plumbing/demolition/shoring/site-preparation
DROPPED at 0-9% precision as inference adds — the evidence layer owns them); the un-starve
finishing trades are the deliberate D7 re-attachments. `temporary-fencing` excluded (D8d).

| line | n | complement |
|---|--:|---|
| max_build / coa_build | 16 | excavation, concrete, framing, insulation, roofing, masonry, electrical, drywall, painting, flooring, waterproofing, trim-work, tiling, millwork-cabinetry, stone-countertops, eavestrough-siding |
| addition | 12 | excavation, concrete, framing, insulation, roofing, masonry, electrical, drywall, painting, flooring, trim-work, eavestrough-siding |
| gut | 9 | framing, insulation, electrical, drywall, painting, flooring, trim-work, tiling, millwork-cabinetry |
| underpin | 4 | excavation, concrete, waterproofing, framing |
| basement | 9 | framing, insulation, electrical, drywall, painting, flooring, tiling, waterproofing, trim-work |
| garage | 9 | excavation, concrete, framing, roofing, masonry, electrical, eavestrough-siding, overhead-doors, glazing |
| laneway_suite / garden_suite | 11 | excavation, concrete, framing, insulation, roofing, electrical, drywall, painting, flooring, trim-work, eavestrough-siding |
| kitchen | 8 | electrical, drywall, painting, flooring, tiling, millwork-cabinetry, stone-countertops, trim-work |
| bath | 9 | electrical, drywall, painting, flooring, tiling, millwork-cabinetry, stone-countertops, waterproofing, caulking |
| solar | 3 | electrical, roofing, solar |

**Union-vs-dominance contract (D7e, test-locked):** trade attachment = the UNION of ALL
detected lines' complements; COST aggregation (`mapToLines`) stays DOMINANCE — trades never
follow cost's dominance (a garden-suite line dominating price does not drop the co-scope
garage line's framers). Lock: `p16-line-trade-complement.logic.test.ts`.

### 5.C.3 Bounds + observability contract (D7 / [FAB2] / [FAB1v2])

- `inference_mean_trades_per_permit` — corpus-wide mean active/permit-with-trades; **GLOBAL
  band WARN > 11 / FAIL > 13** (`_contracts.json p16_gate.mean_warn/mean_fail`; the per-archetype
  FAIL>13 was retired — the honest build complements are 16 by design); p95/max companion rows.
- `starved_trades_recovered_fail_band` — the 8 complement-covered starved trades (caulking,
  eavestrough-siding, millwork-cabinetry, overhead-doors, solar, stone-countertops, tiling,
  trim-work) must each be >0 active post-re-run, else FAIL. **Derived FROM the complement
  table at runtime**, never hand-maintained (anti-Goodhart).
- `starved_trades_uncovered_band` — decking-fences, pool-installation, security,
  site-maintenance, site-preparation: enumerated + ACCEPTED (no line honestly implies them), INFO.
- `evidence_mean_trades_per_permit` — the D1 precision-posture proxy (baseline 5.06; WARN > 7).
- `attachment_basis_null_count == 0` — hard FAIL (a NULL basis = a missed writer) [FAB1v2].
- `fb_line_inference_rows` — WARN > 40% of inference emission (the new-build stratum the
  122-permit corpus could not validate — watched until the deep_scrapes re-measure).
- CoA: `avg_active_trades_per_lead` gated by `coa_active_trades_warn_max` (18 — above the
  16-trade coa_build complement; the permit D7 band does not govern the build-line-heavy CoA
  corpus) + evidence-scoped mean/median honesty rows [GRD-3] + `coa_trades_inference`.
- All band statuses are INFO while the gate is OFF (no false FAIL in the designed pre-flip state).

### 5.C.6 SUPERSEDED — P14-A pre-P16 snapshot (the "before"; retired 2026-07-10)

> Everything below describes the RETIRED coarse-bundle model (code truth as of 2026-07-09,
> pre-16C). Kept so the CURRENT→FINAL delta is explicit. The bundle prior itself was retired
> in 16C/16D ([GRD-1]); `ARCHETYPE_BUNDLES` remains LIVE for the PRODUCTS path only (§5.B).

**(superseded) Live classifier reality:** the trade classifier was the inline `TAG_TRADE_MATRIX`
+ archetype bundle prior — NOT the DB `trade_mapping_rules` (only 6 active tier-1 rows).

**(superseded) Attachment rules:** rules 1-4/6-8 as in the FINAL table above, plus the retired
rule 5: archetype bundle prior (`deriveArchetypes ≠ []` → bundle @conf 0.55, tier 2,
**is_active FALSE since P13-3**, `merged.has` guard). CoA twin: `is_active = !fromBundle` (P6.6).

### (superseded) 5.C.2-old Archetype × trade complement (code truth, `archetypes.js:31-119`)

`deriveArchetypes` unions the codes implied by `project_type` (new_build→FB, addition→ADD,
renovation→INT, mechanical→MEC; demolition/repair/other→null, `repair`→[] early-return) and each
`scope_tag` (`TAG_ARCHETYPE`). `bundleSlugsFor` unions the complements below (deprecated
`temporary-fencing` never emitted).

| code | # trades | trade complement |
|---|--:|---|
| **FB** full-build | 32 | excavation, shoring, concrete, structural-steel, framing, masonry, roofing, plumbing, hvac, electrical, fire-protection, insulation, drywall, painting, flooring, glazing, elevator, demolition, landscaping, waterproofing, trim-work, millwork-cabinetry, tiling, stone-countertops, eavestrough-siding, solar, security, caulking, drain-plumbing, overhead-doors, site-preparation, site-maintenance |
| **LANE** laneway/garden | 32 | = FB complement |
| **ADD** addition | 26 | site-preparation, excavation, shoring, concrete, structural-steel, framing, masonry, roofing, glazing, eavestrough-siding, plumbing, hvac, electrical, fire-protection, insulation, drywall, flooring, painting, trim-work, demolition, waterproofing, decking-fences, caulking, drain-plumbing, overhead-doors, site-maintenance |
| **BAS** basement | 18 | site-preparation, excavation, shoring, concrete, waterproofing, framing, drain-plumbing, plumbing, hvac, electrical, insulation, drywall, tiling, flooring, painting, trim-work, demolition, site-maintenance |
| **INT** interior-reno | 13 | demolition, framing, electrical, drywall, glazing, tiling, flooring, painting, trim-work, millwork-cabinetry, security, caulking, site-maintenance |
| **GAR** garage/accessory | 12 | site-preparation, excavation, concrete, framing, masonry, roofing, glazing, electrical, eavestrough-siding, demolition, overhead-doors, site-maintenance |
| **BTH** bathroom-reno | 11 | plumbing, electrical, drywall, tiling, flooring, painting, trim-work, millwork-cabinetry, stone-countertops, caulking, site-maintenance |
| **KIT** kitchen-reno | 10 | plumbing, electrical, drywall, tiling, flooring, painting, trim-work, millwork-cabinetry, stone-countertops, site-maintenance |
| **SITE** site-landscape | 9 | site-preparation, excavation, concrete, framing, drain-plumbing, landscaping, decking-fences, pool-installation, overhead-doors |
| **ENV** envelope | 7 | masonry, roofing, glazing, insulation, eavestrough-siding, solar, caulking |
| **MEC** mechanical | 6 | plumbing, hvac, electrical, fire-protection, security, drain-plumbing |

### (superseded) 5.C.3-old Measured consequence (what motivated P16)

- Post-P13-3 the bundle prior was `is_active=false`, so **13 trades had 0 active leads corpus-wide**
  (bundle-only, never emitted by the live JS matrix): caulking, decking-fences, eavestrough-siding,
  millwork-cabinetry, overhead-doors, pool-installation, security, site-maintenance, site-preparation,
  solar, stone-countertops, tiling, trim-work.
- On the 122-permit inspection ground-truth corpus (PARTIAL — deep_scrapes paused): evidence-only
  recall 38.2% / prec(insp) 65.8%; pre-P13-3 recall 62.6% / prec 37.8%; the **scope-mapped UNION of
  full archetype complements did NOT beat the baseline** (recall 54.9%, prec 31.2%) because each
  cost-line's complement IS the coarse bundle above. The lever was bundle LEANNESS, not selection —
  exactly what the P16 FINAL model above implements (scenario 6: recall 61.4% / prec 70.5% hold-out).

---

<testing>
## 6. Testing Mandate
- **Logic:** `classification.logic.test.ts` (trade completeness, slug-to-ID mapping, tier routing; P16 gated-inference behavior locks — gate-OFF evidence-only, KIT complement union, PLB-no-inference, coincidental-0.55 value lock, D1 superset)
- **Logic:** `pipeline-sdk.logic.test.ts` (32 trades present in TRADES array)
- **Logic:** `classify-sync.logic.test.ts` (dual-path sync for trades + scope)
- **Logic (P16):** `p16-line-trade-complement.logic.test.ts` (complement shape/leanness + the union-vs-dominance invariant D7e); `coa-trade-classifier.logic.test.ts` (JS↔TS parity over both gate states + the attachment_basis partition)
- **Infra (P16):** `classify-permits.infra.test.ts` (ceiling, gated emission, §R10 bands, row-derived verdict); `classify-coa-trades.infra.test.ts` (9-col [A2] + [GRD-3] counters); `compute-trade-forecasts.infra.test.ts` (inference_weight extern + both-branch basis); `supplier-leads.logic.test.ts` + `get-lead-feed.logic.test.ts` (D5 serving-by-basis); `contracts.infra.test.ts` (p16_gate thresholds + D7 band)
- **DB (P16):** `216_attachment_basis.db.test.ts` (CHECK + mirror-trigger propagation)
</testing>

---

<constraints>
## 7. Operating Boundaries
- **Target Files:** `src/lib/classification/trades.ts`, `src/lib/classification/phases.ts`, `src/lib/classification/groups.ts`, `src/lib/classification/tag-trade-matrix.ts`, `src/lib/classification/permit-type-class.ts`
- **Dual-path scripts:** `scripts/classify-permits.js`, `scripts/classify-permit-phase.js`, `scripts/reclassify-all.js`; **P16 dual paths:** `classify-permits.js` ↔ `classifier.ts`, `scripts/lib/coa-trade-classifier.js` ↔ `src/lib/classification/coa-trade-classifier.ts` (both consume `LINE_TRADE_COMPLEMENT`/`mapToLines` from `src/features/leads/lib/archetype-cost-map.js` — the single source of truth; the mig-143 trigger mirrors `attachment_basis` permit_trades→lead_trades)
- **Consumed by:** `chain_permits.md` (steps 4, 5, 13), `60_shared_steps.md`
- **Operator-facing rendering (WF2 #4 2026-05-08):** the admin Lead Detail Inspector (Spec 76 §3.5 Cycle 7) renders the trade vocabulary defined in §2 in its Trades panel — every `permit_trades` row with `confidence`, plus an `is_default_fallback` flag (true when `confidence === 0.55`, signaling tag-trade-matrix default with no permit-specific signal). The construction-phase vocabulary (§3) renders in the Lifecycle panel.
</constraints>
