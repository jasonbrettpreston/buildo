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
