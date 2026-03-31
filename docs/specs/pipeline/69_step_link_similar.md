# Step: Link Similar Permits

<requirements>
## 1. Goal & User Story
As a user viewing project history, I need related permits at the same address chained together — so sequential permits (BLD, HVA, PLB) for one property appear as a unified project rather than isolated records.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/link-similar.js` |
| **Reads** | `permits` (permit_num, scope_tags, project_type) |
| **Writes** | `permits` (scope_tags, project_type, scope_classified_at) |
| **Chain** | `chain_permits` (step 12) |
| **Method** | Base permit number matching + scope tag propagation |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. **BLD Propagation:** Find BLD permits with scope_tags. For each, propagate scope_tags and project_type to companion permits (HVA, PLB, DRN, etc.) sharing the same base number (`YY NNNNNN`).
2. Uses `DISTINCT ON (base_num) ORDER BY revision_num DESC` to pick the latest BLD revision when multiple exist.
3. **Demolition tagging:** DM permits without `demolition` in scope_tags get it added via `array_append`.

### Edge Cases
- Multiple BLD revisions → `DISTINCT ON` picks latest (deterministic)
- DM permit already has `demolition` tag → `NOT ('demolition' = ANY(scope_tags))` guard prevents duplicates
- Companion permit has no BLD at same address → not modified
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/link-similar.js`
- **Consumed by:** `chain_permits.md` (step 12)
- **Testing:** `pipeline-sdk.logic.test.ts` (SDK compliance)
</constraints>
