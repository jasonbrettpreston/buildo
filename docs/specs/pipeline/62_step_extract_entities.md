# Step: Extract Builder Entities

<requirements>
## 1. Goal & User Story
As a user browsing leads, I need raw builder/applicant strings normalized into deduplicated corporate entities — so "Smith & Co" and "SMITH COMPANY INC" appear as one builder with consolidated permit history.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/extract-builders.js` |
| **Reads** | `permits` (builder_name, owner) |
| **Writes** | `entities` (name, normalized_name, permit_count, last_seen_at) |
| **Chain** | `chain_permits` (step 6) |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Query distinct `builder_name` values from `permits`
2. Normalize: trim, uppercase, remove noise ("DO NOT USE", "TBD", "N/A")
3. Group variant spellings into canonical entities
4. Upsert to `entities` with `ON CONFLICT (normalized_name) DO UPDATE`
5. Update `permit_count` from live permit counts

### Edge Cases
- Noise strings ("DO NOT USE", blank, "TBD") → filtered out, not created as entities
- Numbered companies ("1234567 ONTARIO INC") → kept as-is (valid legal names)
- Same builder with different permit appearances → deduplicated via normalized_name
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/extract-builders.js`, `src/lib/builders/enrichment.ts`, `src/lib/builders/normalize.ts`
- **Consumed by:** `chain_permits.md` (step 6)
- **Testing:** `builders.logic.test.ts`, `entities.logic.test.ts`
</constraints>
