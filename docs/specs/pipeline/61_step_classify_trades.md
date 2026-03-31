# Step: Trade Classification

<requirements>
## 1. Goal & User Story
As a tradesperson, I need every permit classified into the specific construction trades required (plumbing, electrical, roofing, concrete, etc.) — so the system surfaces only the leads relevant to my trade with confidence scores.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/classify-permits.js` |
| **TS Module** | `src/lib/classification/classifier.ts` (dual-path §7.1) |
| **Reads** | `permits`, `trade_mapping_rules` |
| **Writes** | `permit_trades` (trade_id, trade_slug, confidence, tier, phase, lead_score) |
| **Chain** | `chain_permits` (step 13) |
| **Trades** | 32 trades (IDs 1-32) |

### Classification Tiers
| Tier | Method | Confidence | Example |
|------|--------|------------|---------|
| 1 | `trade_mapping_rules` DB rules | 0.90-1.00 | permit_type "Plumbing" → plumbing |
| 2 | Tag-trade matrix (58 keys + 16 aliases) | 0.50-0.90 | scope_tag "deck" → decking-fences |
| 3 | Work-field fallback | 0.80 | work "Plumbing" → plumbing |
| 4 | Narrow-scope code fallback | 0.80 | code PLB → plumbing |

### Dual Code Path (§7.1)
- `classifyPermit()` in `src/lib/classification/classifier.ts` — TypeScript API
- `scripts/classify-permits.js` — batch DB script with sub-batch INSERT (MAX_ROWS_PER_INSERT=4000, §9.2)
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Load active rules from `trade_mapping_rules` (fall back to `ALL_RULES` in-memory)
2. For each permit: apply Tier 1 rules → tag-trade matrix → work-field fallback → narrow-scope fallback
3. Determine construction phase per trade match (early_construction/structural/finishing/landscaping)
4. Compute lead_score per match
5. DELETE existing `permit_trades` for permit, INSERT new matches
6. Sub-batch at 4000 rows (4000 × 10 cols = 40K params, under 65,535 limit)

### PHASE_TRADES Mapping
| Phase | Trades |
|-------|--------|
| early_construction | excavation, shoring, demolition, concrete, waterproofing, drain-plumbing, temporary-fencing |
| structural | framing, structural-steel, masonry, concrete, roofing, plumbing, hvac, electrical, elevator, fire-protection |
| finishing | insulation, drywall, painting, flooring, glazing, fire-protection, plumbing, hvac, electrical, trim-work, millwork-cabinetry, tiling, stone-countertops, caulking, solar, security |
| landscaping | landscaping, painting, decking-fences, eavestrough-siding, pool-installation |

### Edge Cases
- "removing HVAC" → false positive (keyword match without intent analysis)
- Permit with 0 trade matches → no `permit_trades` rows, not an error
- Sub-batch boundary → parameter flush ensures no PostgreSQL limit violation
</behavior>

---

<testing>
## 4. Testing Mandate
- **Logic:** `classification.logic.test.ts` (104 tests — tier routing, tag-trade matrix, confidence scores)
- **Logic:** `classify-sync.logic.test.ts` (TS/JS dual-path sync)
- **Logic:** `pipeline-sdk.logic.test.ts` (32 trades present in TRADES array)
</testing>

---

<constraints>
## 5. Operating Boundaries
- **Target Files:** `scripts/classify-permits.js`, `src/lib/classification/classifier.ts`, `src/lib/classification/rules.ts`, `src/lib/classification/tag-trade-matrix.ts`
- **Out-of-Scope:** `src/lib/classification/scope.ts` (scope classification)
- **Consumed by:** `chain_permits.md` (step 13)
</constraints>
