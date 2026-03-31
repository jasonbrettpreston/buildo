# Chain: Entities (Builder Web Enrichment)

<requirements>
## 1. Goal & User Story
As a salesperson, I need builder entities automatically enriched with phone numbers, emails, and website URLs from web search — so I don't have to manually hunt for contact information on every lead.
</requirements>

---

<architecture>
## 2. Chain Definition

**Trigger:** `node scripts/run-chain.js entities` or `POST /api/admin/pipelines/chain_entities`
**Schedule:** On-demand (admin-triggered, cost-sensitive due to API spend)
**Steps:** 2 (sequential)
**Gate:** None

```
enrich_wsib_builders → enrich_named_builders
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `enrich_wsib_builders` | `enrich-web-search.js` | Enrich WSIB-matched builders (highest value) | entities |
| 2 | `enrich_named_builders` | `enrich-web-search.js` | Enrich remaining named builders without WSIB match | entities |

Both steps run the **same script** (`enrich-web-search.js`) with different environment variables:
- Step 1: `ENRICH_WSIB_ONLY=1` — targets builders linked to WSIB registry
- Step 2: `ENRICH_UNMATCHED_ONLY=1` — targets builders without WSIB match
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- `entities` table: builders extracted by `extract-builders.js`
- Serper API (Google search) for web lookup
- Prioritization: WSIB-matched builders first (verified contractors = highest value leads)

### Core Logic
1. **WSIB builders** — query entities where `wsib_match IS NOT NULL` and `(phone IS NULL OR email IS NULL)`. For each, execute Google search via Serper API. Parse results for phone, email, website. Write to entity record with `records_meta` tracking.
2. **Named builders** — query remaining entities where `name IS NOT NULL` and `(phone IS NULL OR email IS NULL)` and `wsib_match IS NULL`. Same enrichment flow.
3. **Rate limiting** — Serper API has daily quota. Script tracks usage and stops when approaching limit.
4. **Deduplication** — normalized name matching prevents re-enriching the same entity across runs.

### Outputs
- `entities` table: `phone`, `email`, `website` fields populated
- `records_meta` includes enrichment telemetry (searched, found, rate_limited)

### Edge Cases
- Serper API daily limit reached → script stops gracefully, remaining builders deferred to next run
- Generic builder names ("John Smith Construction") → may return irrelevant results; confidence scoring filters noise
- Same builder with multiple permit appearances → enriched once via entity deduplication
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `enrichment.logic.test.ts` (search parsing, contact extraction, dedup logic)
- **Infra:** `enrichment.infra.test.ts` (Serper API mock, records_meta shape)
- **Logic:** `chain.logic.test.ts` (entities chain definition, step count)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/manifest.json` (entities chain array)
- `scripts/enrich-web-search.js`

### Out-of-Scope Files
- `scripts/extract-builders.js` — entity extraction (governed by permits chain)
- `scripts/link-wsib.js` — WSIB matching (governed by permits/sources chains)
- `src/lib/builders/enrichment.ts` — TypeScript API path

### Cross-Spec Dependencies
- **Relies on:** `pipeline_system.md` (SDK, orchestrator)
- **Relies on:** `chain_permits.md` (builders must be extracted first)
- **Relies on:** `chain_sources.md` (WSIB registry must be loaded for prioritization)
- **Relies on:** `chain_sources.md` (WSIB registry must be loaded for prioritization)
</constraints>
