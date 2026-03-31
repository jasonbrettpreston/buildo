# Taxonomy: Construction Trades

<requirements>
## 1. Goal & User Story
As the system's core business classification, this taxonomy defines the 32 construction trade categories that permits are classified into — representing the discrete contractor domains (plumbing, electrical, roofing, etc.) that tradespeople search and filter by.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **TS Module** | `src/lib/classification/trades.ts` |
| **DB Script** | `scripts/classify-permits.js` (TRADES array, §7.1 dual-path) |
| **Consumers** | classifier.ts, tag-trade-matrix.ts, PermitCard.tsx, FilterPanel.tsx |

### 32 Trade Slugs (IDs 1-32)
| ID | Slug | Name | Phase |
|----|------|------|-------|
| 1 | excavation | Excavation | early_construction |
| 2 | shoring | Shoring | early_construction |
| 3 | concrete | Concrete | early_construction, structural |
| 4 | structural-steel | Structural Steel | structural |
| 5 | framing | Framing | structural |
| 6 | masonry | Masonry & Brickwork | structural |
| 7 | roofing | Roofing | structural |
| 8 | plumbing | Plumbing | structural, finishing |
| 9 | hvac | HVAC & Sheet Metal | structural, finishing |
| 10 | electrical | Electrical | structural, finishing |
| 11 | fire-protection | Fire Protection | structural, finishing |
| 12 | insulation | Insulation | finishing |
| 13 | drywall | Drywall & Taping | finishing |
| 14 | painting | Painting | finishing, landscaping |
| 15 | flooring | Flooring | finishing |
| 16 | glazing | Glazing | finishing |
| 17 | elevator | Elevator | structural |
| 18 | demolition | Demolition | early_construction |
| 19 | landscaping | Landscaping & Hardscaping | landscaping |
| 20 | waterproofing | Waterproofing | early_construction |
| 21 | trim-work | Trim Work | finishing |
| 22 | millwork-cabinetry | Millwork & Cabinetry | finishing |
| 23 | tiling | Tiling | finishing |
| 24 | stone-countertops | Stone & Countertops | finishing |
| 25 | decking-fences | Decking & Fences | landscaping |
| 26 | eavestrough-siding | Eavestrough & Siding | landscaping |
| 27 | pool-installation | Pool Installation | landscaping |
| 28 | solar | Solar | finishing |
| 29 | security | Security | finishing |
| 30 | temporary-fencing | Temporary Fencing | early_construction |
| 31 | caulking | Caulking | finishing |
| 32 | drain-plumbing | Drain & Plumbing | early_construction |

### Tag-Trade Matrix
58 tag keys + 16 aliases map description keywords to trade arrays with confidence scores. Defined in `src/lib/classification/tag-trade-matrix.ts`.

### Narrow-Scope Codes
| Code | Trades |
|------|--------|
| PLB, PSA | plumbing |
| HVA, MSA | hvac |
| DRN, STS | drain-plumbing |
| FSU | fire-protection |
| DEM | demolition |
</architecture>

---

<behavior>
## 3. Behavioral Contract

This is a **static taxonomy** — the trade list does not change at runtime. Changes require updating both the TS module and the DB script (§7.1 dual-code-path rule).

### Invariants
- Trade IDs 1-32 are stable and must never be renumbered
- Trade slugs are used as foreign keys in `permit_trades.trade_slug`
- The `TRADES` array in `classify-permits.js` MUST match `src/lib/classification/trades.ts`
</behavior>

---

<testing>
## 4. Testing Mandate
- **Logic:** `classification.logic.test.ts` (trade list completeness, slug-to-ID mapping)
- **Logic:** `pipeline-sdk.logic.test.ts` (TRADES array has all 32 entries)
</testing>

---

<constraints>
## 5. Operating Boundaries
- **Target Files:** `src/lib/classification/trades.ts`, `src/lib/classification/tag-trade-matrix.ts`
- **Dual-path:** `scripts/classify-permits.js` TRADES array (§7.1)
- **Consumed by:** `step_classify_trades.md`, `step_classify_scope.md`
</constraints>
