# Step: Web Search Enrichment

<requirements>
## 1. Goal & User Story
As a salesperson, I need builder entities enriched with phone numbers, emails, and website URLs via automated web search — so I can contact leads directly from the platform without manual Google searches.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/enrich-web-search.js` |
| **Reads** | `entities` (name, normalized_name, wsib_match) |
| **Writes** | `entities` (phone, email, website, enriched_at), `records_meta` |
| **Chain** | `chain_entities` (steps 1 + 2, same script, different env) |
| **API** | Serper API (Google search) |

### Two Modes (Same Script)
| Slug | Env Var | Targets |
|------|---------|---------|
| `enrich_wsib_builders` | `ENRICH_WSIB_ONLY=1` | Builders with WSIB match (highest value) |
| `enrich_named_builders` | `ENRICH_UNMATCHED_ONLY=1` | Remaining named builders without WSIB |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Query target entities based on mode (WSIB-matched or unmatched)
2. For each entity: execute Google search via Serper API
3. Parse results: extract phone numbers, emails, website URLs
4. Confidence scoring to filter noise from generic names
5. Write enrichment results to entity record with `enriched_at` timestamp
6. Emit `records_meta` with enrichment telemetry

### Edge Cases
- Serper API daily quota → script stops gracefully, remaining deferred
- Generic names → may return irrelevant results, confidence filtering helps
- Rate limiting → exponential backoff on 429 responses
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/enrich-web-search.js`
- **Out-of-Scope:** `scripts/extract-builders.js` (extraction step)
- **Consumed by:** `chain_entities.md` (steps 1-2)
- **Testing:** `enrichment.logic.test.ts`, `enrichment.infra.test.ts`
</constraints>
