# Step: Link WSIB Registry

<requirements>
## 1. Goal & User Story
As a user evaluating contractor credibility, I need builder entities matched against the Ontario WSIB registry — so the system can flag verified, insured contractors and provide a trust signal on lead cards.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/link-wsib.js` |
| **Reads** | `entities` (normalized_name), `wsib_registry` (legal_name_normalized) |
| **Writes** | `entities` (wsib_match, wsib_status, wsib_matched_at) |
| **Chain** | `chain_permits` (step 7), `chain_sources` (step 12) |
| **Method** | Fuzzy string matching (Levenshtein distance) |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Query entities without WSIB match (or stale match)
2. For each entity: compare `normalized_name` against `wsib_registry.legal_name_normalized`
3. Exact match → high confidence link
4. Fuzzy match (Levenshtein within threshold) → lower confidence link
5. Update entity with WSIB status, match details, and timestamp

### Edge Cases
- Generic company names ("JOHN SMITH CONSTRUCTION") → may match wrong WSIB entry
- Multiple WSIB entries for same company → closest match wins
- WSIB registry refresh → `chain_sources` re-runs linking against fresh data
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/link-wsib.js`
- **Out-of-Scope:** `scripts/load-wsib.js` (ingestion)
- **Consumed by:** `chain_permits.md` (step 7), `chain_sources.md` (step 12)
- **Testing:** `wsib.logic.test.ts`
</constraints>
