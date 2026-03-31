# Source: Toronto Building Permits

<requirements>
## 1. Goal & User Story
As the system's foundational data source, this script ingests 237K+ raw building permit records daily from Toronto Open Data's CKAN API — providing the core dataset that all downstream classification, spatial linking, and lead scoring pipelines depend on.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **API** | CKAN Datastore API |
| **Hostname** | `ckan0.cf.opendata.inter.prod-toronto.ca` |
| **Resource ID** | `6d0229af-bc54-46de-9c2b-26759b01dd05` (Active Building Permits) |
| **Format** | JSON (paginated, 10K records/page) |
| **Schedule** | Daily (via `chain_permits`) |
| **Script** | `scripts/load-permits.js` |

### Target Table: `permits`
| Column | Type | Notes |
|--------|------|-------|
| `permit_num` | TEXT | PK part 1 — format: `YY NNNNNN TYPE` |
| `revision_num` | TEXT | PK part 2 — `00` = original, `01+` = revisions |
| `permit_type` | TEXT | e.g., "Small Residential Projects" |
| `work` | TEXT | e.g., "New Building", "Interior Alterations" |
| `description` | TEXT | Free-text project description |
| `est_const_cost` | NUMERIC | Estimated construction cost |
| `builder_name` | TEXT | Raw applicant/builder string |
| `status` | TEXT | "Permit Issued", "Inspection", etc. |
| `issued_date` | DATE | When permit was issued |
| `data_hash` | TEXT | SHA-256 of raw JSON for change detection |
| `last_seen_at` | TIMESTAMPTZ | When last seen in CKAN feed |
| ... | | 32 columns total |

**Composite PK:** `(permit_num, revision_num)`
**Upsert:** `ON CONFLICT (permit_num, revision_num) DO UPDATE` — updates all columns except `first_seen_at`.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- CKAN datastore_search API, paginated at 10,000 records per page
- Streams via async generator (§9.5) — peak memory = O(batch_size), not O(total)

### Core Logic
1. Fetch total record count from CKAN
2. Stream pages via `async function*` generator yielding 10K records at a time
3. For each batch: map CKAN fields to DB columns, compute SHA-256 hash, batch INSERT with `ON CONFLICT DO UPDATE`
4. Track `records_new` (hash not seen before) vs `records_updated` (hash changed) vs `records_unchanged`
5. Emit PIPELINE_SUMMARY with counts and PIPELINE_META with I/O schema

### Outputs
- `permits` table: 237K+ rows upserted
- `sync_runs` table: execution log row

### Edge Cases
- CKAN returns HTML instead of JSON (server error) → `safe_json_parse` returns null, treated as empty page
- CKAN adds/removes columns → `assert_schema` (Tier 1) catches this before `load-permits` runs
- Duplicate `(permit_num, revision_num)` within a batch → deduped before INSERT
- `est_const_cost` as string → parsed to numeric, NULL on failure
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `sync.logic.test.ts` (streaming parser, field mapping, hash computation)
- **Logic:** `permits.logic.test.ts` (permit data shape, composite PK)
- **Logic:** `pipeline-sdk.logic.test.ts` (load-permits uses Pipeline SDK, emits PIPELINE_SUMMARY)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/load-permits.js`
- `src/lib/permits/field-mapping.ts`, `src/lib/sync/ingest.ts`, `src/lib/sync/process.ts`

### Out-of-Scope
- `src/lib/permits/hash.ts` — governed by change detection spec
- `scripts/classify-*.js` — governed by step specs

### Cross-Spec Dependencies
- **Consumed by:** `chain_permits.md` (step 2)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
