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

### Pre-issuance permit visibility (snapshot 2026-05-11)

The CKAN Active Building Permits feed is a **full-lifecycle feed** — it contains permits in every state from application through completion, not just issued permits. Reading this spec without that context would suggest `permits` is an "issued permits" table; in reality ~6.5% of rows (16,142 of 247,030 today) have an `application_date` but no `issued_date`.

Pre-issuance status values observed in the feed (2026-05-11):

| Status | Approx count | Stage |
|---|---|---|
| `Examiner's Notice Sent` | 2,757 | Examination |
| `Issuance Pending` | 2,974 | Pre-issuance approval |
| `Under Review` | 2,100 | Application review |
| `Application On Hold` | 1,655 | Stalled application |
| `Work Not Started` / `Not Started` | 1,093 / 1,063 | Issued, no construction |
| `Refusal Notice` | 958 | Pre-refusal |
| `Open` | 519 | Generic open state |
| `Pending Cancellation` | 488 | Pre-cancellation |

**Why this matters downstream:** the `link-coa` shared step (Spec 60) relies on permits appearing in this feed **before** issuance so an in-flight CoA can match them via fuzzy address. The 22.2% concurrent-flow pattern in Spec 84 §5 (permit application filed while CoA decision still pending) is only possible because of pre-issuance feed visibility.

**Caveat (R0 DeepSeek MED, 2026-05-11):** the 7-value status set above is a snapshot. CKAN may add new pre-issuance statuses as Toronto's permit workflow evolves; reconcile periodically with live data via `SELECT status, COUNT(*) FROM permits WHERE issued_date IS NULL GROUP BY status`.

### Edge Cases
- CKAN returns HTML instead of JSON (server error) → `safe_json_parse` returns null, treated as empty page
- CKAN adds/removes columns → `assert_schema` (Tier 1) catches this before `load-permits` runs
- Duplicate `(permit_num, revision_num)` within a batch → deduped before INSERT
- `est_const_cost` as string → parsed to numeric, NULL on failure

### Lifecycle status history `event_date` population (WF3 Pass-2.5 Finding C Phase 2 — planned 2026-05-21)

`load-permits.js` writes status-change rows to `lifecycle_status_history` (per Spec 41 step 2 + Spec 84 §2 schema). **Phase 2 of WF3 Finding C** will populate the nullable `event_date DATE` column added in Phase 1 (mig 160).

**Intent (exact `to_status` → source-date mapping deferred to Phase 2 implementation):**
`event_date` will be populated from one of `permits.issued_date` / `permits.completed_date` / `permits.application_date` based on the `to_status` value emitted by the writer. The exact mapping table is determined at Phase 2 implementation time by reading the actual normalized status strings emitted by `load-permits.js` against Spec 84 §2.5.a's enumerated 53-status list — this avoids Phase 1 documentation pre-committing to status strings that Phase 2 may need to refine.

**Status transitions without a CKAN source date column** (most pre-issuance Notice / Review / Application-On-Hold states, intermediate inspection states, post-issuance non-milestone states) leave `event_date = NULL`. The Inspector (Spec 76 §3.5, Phase 5) renders `COALESCE(event_date, transitioned_at)` with a 'detected' badge when `event_date IS NULL`.

**No historical backfill.** Pre-Phase-2 rows retain `event_date = NULL` permanently — honest representation that we don't know the exact event date for those rows, only when the pipeline observed the transition.
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
