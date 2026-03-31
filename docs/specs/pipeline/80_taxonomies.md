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
</behavior>

---

<testing>
## 5. Testing Mandate
- **Logic:** `classification.logic.test.ts` (trade completeness, slug-to-ID mapping, tier routing)
- **Logic:** `pipeline-sdk.logic.test.ts` (32 trades present in TRADES array)
- **Logic:** `classify-sync.logic.test.ts` (dual-path sync for trades + scope)
</testing>

---

<constraints>
## 6. Operating Boundaries
- **Target Files:** `src/lib/classification/trades.ts`, `src/lib/classification/phases.ts`, `src/lib/classification/groups.ts`, `src/lib/classification/tag-trade-matrix.ts`
- **Dual-path scripts:** `scripts/classify-permits.js`, `scripts/classify-permit-phase.js`, `scripts/reclassify-all.js`
- **Consumed by:** `chain_permits.md` (steps 4, 5, 13), `60_shared_steps.md`
</constraints>
