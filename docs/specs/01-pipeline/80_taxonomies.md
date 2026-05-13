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

**Tag-Trade Matrix:** 58 tag keys + 16 aliases → trade arrays with confidence scores. Defined in `src/lib/classification/tag-trade-matrix.ts`.

**Narrow-Scope Codes:** PLB/PSA→plumbing, HVA/MSA→hvac, DRN/STS→drain-plumbing, FSU→fire-protection, DEM→demolition

**Invariants:** Trade IDs 1-32 are stable, never renumbered. Slugs are FK in `permit_trades.trade_slug`. TRADES array in JS script MUST match TS module.
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
**Table:** `permit_products` (permit_num, revision_num, product_id, product_slug, product_name, confidence)

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

<testing>
## 6. Testing Mandate
- **Logic:** `classification.logic.test.ts` (trade completeness, slug-to-ID mapping, tier routing)
- **Logic:** `pipeline-sdk.logic.test.ts` (32 trades present in TRADES array)
- **Logic:** `classify-sync.logic.test.ts` (dual-path sync for trades + scope)
</testing>

---

<constraints>
## 7. Operating Boundaries
- **Target Files:** `src/lib/classification/trades.ts`, `src/lib/classification/phases.ts`, `src/lib/classification/groups.ts`, `src/lib/classification/tag-trade-matrix.ts`, `src/lib/classification/permit-type-class.ts`
- **Dual-path scripts:** `scripts/classify-permits.js`, `scripts/classify-permit-phase.js`, `scripts/reclassify-all.js`
- **Consumed by:** `chain_permits.md` (steps 4, 5, 13), `60_shared_steps.md`
- **Operator-facing rendering (WF2 #4 2026-05-08):** the admin Lead Detail Inspector (Spec 76 §3.5 Cycle 7) renders the trade vocabulary defined in §2 in its Trades panel — every `permit_trades` row with `confidence`, plus an `is_default_fallback` flag (true when `confidence === 0.55`, signaling tag-trade-matrix default with no permit-specific signal). The construction-phase vocabulary (§3) renders in the Lifecycle panel.
</constraints>
