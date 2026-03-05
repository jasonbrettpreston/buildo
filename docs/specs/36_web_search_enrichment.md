# Spec 36 -- Web Search Enrichment

## 1. Goal & User Story
As an admin, I want WSIB-matched builders to be automatically enriched with contact information (phone, email, website, social profiles) via web search, so that tradespeople have actionable contact data without manual research.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend scripts and admin API trigger) |

## 3. Behavioral Contract
- **Inputs:** Builders with `enriched_at IS NULL`, prioritizing those linked to `wsib_registry` (have trade name, legal name, mailing address). Admin trigger via pipeline dashboard or chain execution.
- **Core Logic:**
  - **Search API:** Serper (`google.serper.dev`) — returns Google search results as structured JSON. API key stored in `SERPER_API_KEY` environment variable (never hardcoded).
  - **Query construction:** `"{Trade Name}" "{City}" contractor` using WSIB data fields. Falls back to `"{Legal Name}" "Toronto" contractor` when no trade name. Falls back to `"{Builder Name}" "Toronto" contractor` for non-WSIB builders.
  - **Contact extraction** from Serper response (pure functions in `src/lib/builders/extract-contacts.ts`):
    - Phone: regex for Ontario area codes (416, 647, 437, 905, 289, etc.) in snippets + knowledge graph
    - Email: regex with reject list (noreply, example.com) from snippets; if no email found, fetches builder website HTML and scrapes for mailto: links and email patterns (5s timeout)
    - Website: first organic result URL that isn't a directory/social site (filtered against 30+ directory domains)
    - Social: Instagram, Facebook, LinkedIn, Houzz URLs from organic results
  - **Storage:** Core contacts (phone, email, website) → `UPDATE builders` with `COALESCE` (don't overwrite existing). Social links → `INSERT INTO builder_contacts` with `source = 'web_search'`.
  - **Idempotent:** Sets `enriched_at = NOW()` regardless of result to prevent retry loops.
  - **Rate limiting:** 500ms between requests (configurable via `ENRICH_RATE_MS`).
  - **Pipeline integration:** Registered as `enrich_web_search` in permits chain, after `enrich_google`.
- **Outputs:** Builders enriched with phone/email/website. Social links stored in `builder_contacts`. Pipeline tracking in `pipeline_runs`.
- **Edge Cases:**
  - `SERPER_API_KEY` not set → script exits silently (no error).
  - Builder has no WSIB match → falls back to name-only search with "Toronto" city.
  - No contacts found in search results → still marks `enriched_at` to avoid retry.
  - API rate limit or error → logs error, marks builder enriched, continues batch.
  - Builder already has phone/email/website → `COALESCE` preserves existing data.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`enrichment.logic.test.ts`): Phone extraction regex with Ontario area codes; email extraction with reject list; HTML email extraction (mailto links, visible text, reject filtering, dedup); website extraction skipping directories; social link extraction (IG, FB, LI, Houzz); full contact extraction from mock Serper response; knowledge graph priority; search query construction; city extraction from WSIB address
- **Infra** (`enrichment.infra.test.ts`): enrich-web-search.js script existence; SERPER_API_KEY env var usage (no hardcoded keys); pipeline registration; chain orchestrator placement; FreshnessTimeline entry; .env.example contains SERPER_API_KEY; extract-contacts.ts module exports
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/builders/extract-contacts.ts` — Pure contact extraction functions
- `scripts/enrich-web-search.js` — Batch enrichment processor
- `src/app/api/admin/pipelines/[slug]/route.ts` — Add enrich_web_search slug
- `scripts/run-chain.js` — Add to permits chain and PIPELINE_SCRIPTS
- `src/components/FreshnessTimeline.tsx` — Add pipeline entry
- `.env.example` — Add SERPER_API_KEY placeholder
- `src/tests/enrichment.logic.test.ts` — Logic tests
- `src/tests/enrichment.infra.test.ts` — Infrastructure tests

### Out-of-Scope Files (DO NOT TOUCH)
- **`scripts/enrich-builders.js`**: Governed by Spec 11. Google Places enrichment is a separate pipeline.
- **`src/lib/classification/`**: Governed by Spec 08.
- **`scripts/load-wsib.js` / `scripts/link-wsib.js`**: Governed by Spec 35.
- **OBR corporate search**: Deferred to future spec. Requires separate scraping infrastructure.
- **HCRA directory validation**: Deferred to future spec. Requires separate scraping infrastructure.
- **Outreach dashboard**: Deferred to future spec. Lead pool is queryable via SQL.

### Cross-Spec Dependencies
- Relies on **Spec 35 (WSIB Registry)**: Uses `wsib_registry` data for search query construction.
- Relies on **Spec 11 (Builder Enrichment)**: Updates `builders` table contact fields.
- Relies on **Spec 01 (Database Schema)**: Uses `builders` and `builder_contacts` tables.
