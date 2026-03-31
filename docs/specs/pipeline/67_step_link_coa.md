# Step: Link CoA Applications to Permits

<requirements>
## 1. Goal & User Story
As a lead generator, I need Committee of Adjustment variance hearings linked to building permits — so users can trace the full timeline from "asking for zoning permission" to "breaking ground."
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/link-coa.js` |
| **TS Module** | `src/lib/coa/linker.ts` |
| **Reads** | `coa_applications`, `permits` |
| **Writes** | `coa_applications` (linked_permit_num, linked_confidence, last_seen_at) |
| **Chain** | `chain_permits` (step 14), `chain_coa` (step 4) |

### 3-Tier Cascade Matching
| Tier | Method | Confidence | Criteria |
|------|--------|------------|----------|
| 1 | Exact address + ward | 0.95 | street_num + street_name + ward match |
| 2 | Fuzzy address + ward | 0.60 | Stripped street name LIKE + ward match |
| 3 | Description FTS | 0.30-0.50 | Full-text search (not yet implemented) |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Query unlinked CoA applications (`linked_permit_num IS NULL`)
2. Tier 1: exact match on `UPPER(street_num) + UPPER(street_name) + ward` with `DISTINCT ON` per application
3. Tier 2: fuzzy match using `LIKE '%' || stripped_name || '%'` with ward filter
4. LIKE wildcards (`%`, `_`) in street names escaped via `REPLACE()` in SQL
5. Update `linked_confidence` based on tier

### Edge Cases
- Street name containing `%` or `_` → escaped before LIKE pattern
- Multiple permits at same address → `DISTINCT ON (ca.id) ORDER BY issued_date DESC` picks most recent
- CoA application with no street info → skipped (WHERE clauses filter NULLs)
- Division by zero on empty unlinked set → guarded
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/link-coa.js`, `src/lib/coa/linker.ts`
- **Out-of-Scope:** `scripts/load-coa.js` (ingestion)
- **Consumed by:** `chain_permits.md` (step 14), `chain_coa.md` (step 4)
- **Testing:** `coa.logic.test.ts`
</constraints>
