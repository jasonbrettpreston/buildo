# Taxonomy: Product Groups

<requirements>
## 1. Goal & User Story
As a building material supplier, I need permits classified by the physical products required (lumber, windows, concrete mix, etc.) — so I can find projects that need my specific materials and route leads to the right trades.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **TS Module** | `src/lib/classification/groups.ts` |
| **DB Script** | `scripts/reclassify-all.js` (batch reclassification includes products) |
| **Table** | `permit_products` (permit_num, revision_num, product_id, product_slug, product_name, confidence) |

### Product-to-Trade Mapping
Product groups are derived from scope tags and trade classifications. Each product maps to specific trades:
- Lumber → framing, decking-fences
- Concrete mix → concrete, foundation
- Windows/glass → glazing
- HVAC equipment → hvac
- Plumbing fixtures → plumbing
- Electrical wire → electrical
- Roofing materials → roofing
- Insulation → insulation
- Drywall → drywall
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. For each classified permit: determine required products from scope_tags + trade matches
2. Map products via product-group definitions
3. Upsert to `permit_products` with confidence scores

### Edge Cases
- Permit with no trade matches → no products assigned
- Generic description → products inferred from permit_type rather than description
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `src/lib/classification/groups.ts`
- **Consumed by:** `step_classify_trades.md`, dashboard supplier views
- **Testing:** `classification.logic.test.ts`
</constraints>
