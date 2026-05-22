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

### Lifecycle status history `event_date` population (WF3 Pass-2.5 Finding C Phase 2 — shipped 2026-05-21)

`load-permits.js` writes status-change rows to `lifecycle_status_history` (per Spec 41 step 2 + Spec 84 §2 schema). **Phase 2 of WF3 Finding C** populates the nullable `event_date DATE` column added in Phase 1 (mig 160) from the CKAN source date columns when the `to_status` is one of 7 milestone statuses.

**Concrete `STATUS_TO_DATE_COLUMN` mapping** (defined as a frozen const at the top of `scripts/load-permits.js`):

| `to_status` (raw CKAN string per Spec 84 §3.7) | Source column | Spec 84 §2.5.a row |
|------------|---------------|---------------------|
| `'Permit Issued'` | `permits.issued_date` | 25 (52,403 permits) |
| `'Closed'` | `permits.completed_date` | 39 (10,695 permits) |
| `'File Closed'` | `permits.completed_date` | 40 (6 permits) |
| `'Permit Issued/Close File'` | `permits.completed_date` | 41 (2 permits) |
| `'Request Received'` | `permits.application_date` | 1 (1 permit) |
| `'Application Received'` | `permits.application_date` | 2 (218 permits) |
| `'Application Acceptable'` | `permits.application_date` | 3 (465 permits) |

**All other statuses → `event_date = NULL`.** This includes the 46 statuses outside the mapping (53 enumerated in Spec 84 §2.5.a − 7 mapped above; e.g., 'Open', 'Active', 'Under Review', 'Examiner's Notice Sent', 'Inspection', 'Revision Issued', 'Refused', 'Abandoned'). Justification: the `permits` source schema (§2 above) carries only three date columns — `application_date`, `issued_date`, `completed_date`. Statuses outside the 7 mapped above do not correspond to any of these date columns in a defensible way, so NULL is the honest representation. 'Open' and 'Active' were explicitly excluded per Gemini HIGH plan review (2026-05-21): Spec 84 §2.5.a documents them as "generic IBMS state" — mapping them to `application_date` would invent data.

**`Closed` semantic note:** `completed_date` may be NULL for closed-without-construction permits (administrative close), in which case `event_date = NULL` — the correct semantic ("status changed, but no construction date is knowable"). The Inspector (Spec 76 §3.5, Phase 5) falls back to `transitioned_at` with the 'detected' badge.

**Whitespace defense:** Spec 84 §2.5.a row 8 documents that 'Under Review' has a trailing space in CKAN source data. The writer applies `.trim()` to `b.status` before the `STATUS_TO_DATE_COLUMN` lookup, so future CKAN whitespace anomalies on the 7 mapped statuses don't silently yield NULL event_dates.

**`ON CONFLICT` semantic:** the existing `uniq_lifecycle_status_history_natural_key` unique index covers `(lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC'))`. The writer switches from `DO NOTHING` to `DO UPDATE SET event_date = EXCLUDED.event_date WHERE EXCLUDED.event_date IS DISTINCT FROM lifecycle_status_history.event_date AND EXCLUDED.event_date IS NOT NULL`. This preserves WAL discipline (no column update on identical-data retries), prevents NULL overwriting non-null values, and captures non-null event_date on intra-batch retries (rare but possible when two writes land in the same UTC second). The conflict scope is **intra-batch retries only** — re-runs of the writer over the same data produce different `transitioned_at` values (different second) and never conflict. **Does NOT propagate CKAN date corrections** to existing rows where `status` is unchanged (the writer's loop only emits on status change). Tracked as future hardening in `docs/reports/review_followups.md` under "emit-on-any-change semantics."

**No historical backfill.** Pre-Phase-2 rows retain `event_date = NULL` permanently — honest representation that we observed the transition but don't have a CKAN source date for it. The Inspector (Phase 5) renders these via the `transitioned_at` fallback with the 'detected' badge.
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
