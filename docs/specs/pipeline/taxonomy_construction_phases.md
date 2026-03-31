# Taxonomy: Construction Phases

<requirements>
## 1. Goal & User Story
As a tradesperson, I need permits mapped to their construction lifecycle phase — so I can filter leads by timing: concrete contractors want early-stage projects, painters want finishing-stage projects.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **TS Module** | `src/lib/classification/phases.ts` |
| **DB Script** | `scripts/classify-permit-phase.js` |
| **Model** | 4 sequential phases |

### Phase Model
```
early_construction → structural → finishing → landscaping
```

| Phase | Typical Trades | Timing Signal |
|-------|---------------|---------------|
| early_construction | excavation, shoring, demolition, concrete, waterproofing, drain-plumbing, temporary-fencing | 0-3 months after issuance |
| structural | framing, structural-steel, masonry, roofing, plumbing, hvac, electrical, elevator, fire-protection | 3-9 months |
| finishing | insulation, drywall, painting, flooring, glazing, trim-work, millwork-cabinetry, tiling, stone-countertops, caulking, solar, security | 9-15 months |
| landscaping | landscaping, painting, decking-fences, eavestrough-siding, pool-installation | 15+ months or status=completed |

### Phase Determination Logic
1. Status "completed"/"closed" → `landscaping`
2. Status "application"/"not started" → `early_construction`
3. No `issued_date` → `early_construction`
4. Otherwise: months since `issued_date` maps to phase via thresholds
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
- `classify-permit-phase.js` assigns `permits.construction_phase` based on status + time since issuance
- Lead scoring formula includes `phase_match` bonus when a trade's phase aligns with the permit's current phase

### Edge Cases
- Permit issued >2 years ago but still active → stays in `landscaping` (assumed late-stage)
- No `issued_date` → defaults to `early_construction`
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `src/lib/classification/phases.ts`, `scripts/classify-permit-phase.js`
- **Consumed by:** `chain_permits.md` (step 4), `step_classify_trades.md` (PHASE_TRADES mapping)
- **Testing:** `classification.logic.test.ts`
</constraints>
