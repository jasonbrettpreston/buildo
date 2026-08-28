# Chain: WSIB Registry Enrichment

<requirements>
## 1. Goal & User Story
As a salesperson, I need WSIB-registered contractors automatically enriched with phone numbers, emails, and website URLs — so that when a new permit arrives and links to a WSIB entry, contact data is already available without waiting for a separate enrichment run.
</requirements>

---

<architecture>
## 2. Chain Definition

**Trigger:** `node scripts/run-chain.js wsib` or `POST /api/admin/pipelines/chain_wsib`
**Schedule:** On-demand (admin-triggered after annual WSIB CSV load, cost-sensitive due to API spend)
**Steps:** 1
**Gate:** None

```
enrich_wsib_registry
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `enrich_wsib_registry` | `enrich-wsib.js` | Enrich WSIB entries directly with contact data via Serper | wsib_registry |

### Contact Flow: WSIB → Entity

When `link-wsib.js` matches a WSIB entry to a permit entity (in the permits or sources chain), it copies contacts automatically:
```sql
UPDATE entities SET
  primary_phone = COALESCE(entities.primary_phone, wsib.primary_phone),
  primary_email = COALESCE(entities.primary_email, wsib.primary_email),
  website = COALESCE(entities.website, wsib.website)
```
COALESCE preserves existing entity data — WSIB contacts only fill gaps.

### Reverse Clear on Retraction (added 2026-08-28, C1 pilot 4, G-18)

The forward fill-only flow above says nothing about what happens when a link that fed a
contact field is later **retracted** — A-7's tier-3 repair (`link-wsib.js` Tier 3 only,
`retract_when: full_only`) is the one mechanism that retracts an already-written link, and
it did not exist when this section was first written.

**The reverse-clear contract:** when a `wsib_registry` row's link is retracted, an
entity's contact field is cleared **only when its current value equals a value that
existed on the now-retracted row** (provenance-by-equality) — never a blanket clear of
every contact field on every affected entity. This is deliberately narrower than "undo
the fill": an entity's contact may have come from Serper enrichment (`enrich-wsib.js`) or
a different WSIB row also linked to it, and equality-matching is what keeps those values
untouched.

**Declared limitation:** a contact value that *coincidentally* equals a retracted row's
value is cleared and must be re-copied on relink — a false positive, never a false
negative (a genuinely-retracted-source value is never left dangling). Measured local
exposure is 0 (the local dev `wsib_registry` carries zero contact values, so `link-wsib.js`
has never actually copied a contact locally) — this does **not** bound a cloud database
that has run Serper enrichment against `wsib_registry` itself; re-measure before any cloud
FULL run.

**Audit row:** `contacts_cleared_on_retraction` (link_wsib's own declared check) counts
entities affected per FULL run.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- `wsib_registry` table: 121K+ Class G entries loaded by `load-wsib.js`
- Serper API (Google search) for web lookup
- Prioritization: Large Business > Medium Business > Small Business; trade_name required for search quality

### Core Logic
1. **Pre-flight filters** — Before calling Serper, each WSIB entry is checked:
   - **No search name** — trade_name and legal_name both null/empty or under 4 characters
   - **Generic trade names** — in blocklist (e.g., "Contracting", "General Contracting", "Construction")
   - Skipped entries are marked `last_enriched_at = NOW()` to prevent re-processing.
2. **Search query** — Built from `trade_name` (preferred) or `legal_name` + city from `mailing_address` + "contractor"
3. **Contact extraction** — Serper organic results + knowledge graph parsed for phone (Ontario area codes), email, website
4. **Website scraping fallback** — If no email from snippets, homepage HTML is fetched (5s timeout) for mailto: links and phone numbers
5. **COALESCE update** — `wsib_registry` columns filled only where NULL; existing data preserved
6. **City extraction** — Validates mailing address parts, skipping PO Box, Suite, Unit, province abbreviations, postal codes

### Outputs
- `wsib_registry` table: `primary_phone`, `primary_email`, `website` fields populated
- `records_meta` includes enrichment telemetry (processed, matched, failed, skipped, field counts, size breakdown)

### Edge Cases
- Serper API daily limit reached → script stops gracefully, remaining entries deferred to next run
- Generic trade names (e.g., "Contracting") → skipped to avoid wasting credits
- WSIB CSV reload → enriched contacts preserved (load-wsib.js UPSERT doesn't touch contact columns)
- Same company with multiple WSIB entries (different subclasses) → each enriched independently
- Malformed mailing addresses (PO Box, Suite) → city extraction falls back to subsequent address parts
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `chain.logic.test.ts` (wsib chain definition, step count)
- **Logic:** `quality.logic.test.ts` (registry count, STEP_DESCRIPTIONS coverage)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/enrich-wsib.js` (new)
- `scripts/manifest.json` (wsib chain array, enrich_wsib_registry entry)
- `scripts/link-wsib.js` (contact copy on link)
- `migrations/063_wsib_contacts.sql`

### Out-of-Scope Files
- `scripts/load-wsib.js` — WSIB CSV loading (governed by 52_source_wsib.md)
- `scripts/enrich-web-search.js` — Entity enrichment (governed by 45_chain_entities.md)
- `src/lib/builders/enrichment.ts` — TypeScript API path

### Cross-Spec Dependencies
- **Relies on:** `52_source_wsib.md` (WSIB data must be loaded first)
- **Relies on:** `45_chain_entities.md` (entity enrichment for non-WSIB builders)
- **Modifies:** `link-wsib.js` behavior (contact copy on link, in permits + sources chains)
</constraints>
