# Step: Classify Scope

<requirements>
## 1. Goal & User Story
As a user filtering by project type, I need every permit classified into a project type (new_build, demolition, renovation, addition, repair, mechanical, other) and tagged with detailed scope tags (basement, deck, pool, 2nd-floor, etc.) — so I can find exactly the type of construction work I sell into.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/classify-scope.js` |
| **TS Module** | `src/lib/classification/scope.ts` (dual-path §7.2) |
| **Reads** | `permits` (description, work, permit_type, structure_type, proposed_use, current_use, storeys) |
| **Writes** | `permits` (project_type, scope_tags, scope_classified_at, scope_source) |
| **Chain** | `chain_permits` (step 5) |

### Dual Code Path (§7.2)
Both implementations MUST produce identical output for the same input:
- `classifyScope()` in `src/lib/classification/scope.ts` — TypeScript API for web app
- `classify-scope.js` — standalone batch script for DB processing

Changes to scope classification logic MUST be mirrored in both files.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. For each permit, determine `project_type` from `work` field first, then `permit_type`, then description keywords
2. Extract `scope_tags[]` from description + other fields via TAG_PATTERNS regex array
3. Add mandatory `useType` tag (residential/commercial/mixed-use) based on `structure_type` + `permit_type`
4. For demolition permits, add `demolition` tag
5. BLD permit propagation: scope tags from BLD permits propagate to companion permits (HVA, PLB, etc.) at same address via `DISTINCT ON` latest revision
6. Batch update using `unnest` arrays for efficiency

### Outputs
- `permits.project_type`: one of `new_build`, `demolition`, `renovation`, `addition`, `repair`, `mechanical`, `other`
- `permits.scope_tags`: TEXT[] array of detailed tags
- `permits.scope_classified_at`: timestamp
- `permits.scope_source`: 'script' or 'reclassified'

### Edge Cases
- "Demolition of shed for new addition" → `project_type = 'demolition'` (first match wins)
- Multiple Projects work field → falls through to description analysis
- BLD propagation with multiple revisions → `DISTINCT ON (base_num) ORDER BY revision_num DESC` picks latest
</behavior>

---

<testing>
## 4. Testing Mandate
- **Logic:** `scope.logic.test.ts` (255 tests — project types, tag extraction, use-type classification, BLD propagation)
- **Logic:** `classify-sync.logic.test.ts` (TS/JS dual-path sync verification)
</testing>

---

<constraints>
## 5. Operating Boundaries
- **Target Files:** `scripts/classify-scope.js`, `src/lib/classification/scope.ts`
- **Out-of-Scope:** `scripts/classify-permits.js` (trade classification)
- **Consumed by:** `chain_permits.md` (step 5)
</constraints>
