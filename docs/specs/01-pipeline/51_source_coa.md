# Source: Committee of Adjustment (CoA) Applications

<requirements>
## 1. Goal & User Story
As a lead generator, I need Committee of Adjustment variance hearing records ingested from two CKAN resources (active + closed) so the system can link them to permits and identify pre-construction opportunities months before building permits are filed.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **API** | CKAN Datastore SQL API |
| **Hostname** | `ckan0.cf.opendata.inter.prod-toronto.ca` |
| **Active Resource** | `51fd09cd-99d6-430a-9d42-c24a937b0cb0` |
| **Closed Resource** | `9c97254e-5460-4799-896f-c7823413c81c` (since 2017) |
| **Format** | JSON via SQL endpoint |
| **Schedule** | Daily (via `chain_coa`) |
| **Script** | `scripts/load-coa.js` |
| **Modes** | Incremental (default, last 90 days) / Full (`--full`, both resources) |

### Target Table: `coa_applications`
| Column | Type | CKAN Source Field | Notes |
|--------|------|-------------------|-------|
| `application_number` | TEXT | `REFERENCE_FILE#` | PK |
| `decision` | TEXT | `C_OF_A_DESCISION` | Typo is in CKAN source |
| `ward` | TEXT | `WARD_NUMBER` (closed) / `WARD` (active) | Normalized |
| `street_num` | TEXT | `STREET_NUM` | |
| `street_name` | TEXT | `STREET_NAME` | |
| `decision_date` | DATE | `DECISION_DATE` | |
| `linked_permit_num` | TEXT | — | Populated by `link_coa` step |
| `linked_confidence` | NUMERIC | — | 0.30–0.95 |

**PK:** `(application_number)`
**Upsert:** `ON CONFLICT (application_number) DO UPDATE`
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- Incremental: CKAN SQL query filtering last 90 days from active resource
- Full: All records from both active + closed resources

### Core Logic
1. Query CKAN SQL endpoint with appropriate date filter
2. Map CKAN fields (handle column name differences between active/closed resources)
3. Compose address from `STREET_NUM + STREET_NAME + STREET_TYPE + STREET_DIRECTION`
4. Batch upsert to `coa_applications`
5. Emit PIPELINE_SUMMARY with record counts

### Outputs
- `coa_applications` table: 32,625+ rows
- Stats logged: total, new, updated

### Cardinality + temporal patterns (snapshot 2026-05-11)

The CoA stream parallels the permits stream — neither is a foreign key of the other; the `link-coa` shared step (Spec 60) reconciles them via fuzzy address + description matching.

**Cardinality:**

| Metric | Count | Notes |
|---|---|---|
| Total CoA applications | 33,052 | All-time |
| Linked to a permit (`linked_permit_num IS NOT NULL`) | 32,845 | **99.4%** of CoAs eventually link |
| Distinct permits with a CoA antecedent | 16,285 | **6.6%** of the 247K permits |
| In-flight (no decision, last 12mo) | 1,690 | Operationally significant — see Spec 84 §5 |

**Decision distribution** (top values):

| Decision | Count | % |
|---|---|---|
| `Approved` (canonical + 5 string variants) | ~27,219 | 82.4% |
| `Refused` | 2,802 | 8.5% |
| (null, decision pending) | 1,690 | 5.1% |
| `Withdrawn` | 711 | 2.2% |
| `Deferred` | 492 | 1.5% |

**Approval-like variants observed in CKAN:** `Approved`, `approved` (lowercase), `Approved with Conditions`, `Approved on Condition`, `Approved on condition`, `conditional approval`. Any downstream classifier of "approved-ness" must handle ≥5 string variants (or normalize at ingestion); the lifecycle classifier per Spec 84 §3.1 P3 trigger ("Decision: Approved or Approved with Conditions") needs to match all of them.

**Hearing → decision timing:** median 23 days, mean 90 days across 30,828 decided CoAs.

**Known data gap — `submission_date` does NOT exist:** the schema captures `decision_date` and `hearing_date` but not the city's intake/filing date. Buildo's `first_seen_at` is the ingestion timestamp, not the city's filing timestamp. Intake-to-hearing duration is therefore unmeasurable from current data. This blocks computing a full variance-decision-time metric beyond the hearing→decision portion.

### Edge Cases
- `WARD_NUMBER` column exists in closed but not active resource → field mapper handles both
- `C_OF_A_DESCISION` typo in CKAN → mapped as-is to `decision` column
- Empty records on incremental → `process.exit(0)` after logging "no new records"
- CKAN SQL endpoint returns 500 → treated as error, chain halts

### Lifecycle status history `event_date` population (WF3 Pass-2.5 Finding C Phase 3 — shipped 2026-05-22)

`load-coa.js` writes status-change rows to `lifecycle_status_history` (per Spec 42 step 2 + Spec 84 §2 schema). **Phase 3 of WF3 Finding C** populates the nullable `event_date DATE` column added in Phase 1 (mig 160) from CKAN source date columns when the `to_status` is one of 8 milestone CoA statuses.

**Concrete `STATUS_TO_DATE_COLUMN_COA` mapping** (frozen const at top of `scripts/load-coa.js`):

| `to_status` (raw CKAN per Spec 84 §3.7) | Source column | Spec 84 §2.5.c row |
|------------|---------------|---------------------|
| `'Tentatively Scheduled'` | `hearing_date` | 74 (118 CoAs) |
| `'Hearing Scheduled'` | `hearing_date` | 75 (317 CoAs) |
| `'Hearing Rescheduled'` | `hearing_date` | 76 (1 CoA) |
| `'Conditional Consent'` | `decision_date` | 79 (326 CoAs) |
| `'Approved'` | `decision_date` | 80 (246 CoAs) |
| `'Approved with Conditions'` | `decision_date` | 81 (554 CoAs) |
| `'Refused'` | `decision_date` | 82 (59 CoAs) |
| `'Await Expiry Date'` | `decision_date` | 84 (24 CoAs) |

**All other statuses → `event_date = NULL`** — this includes the 14 unmapped CoA statuses out of 22 enumerated in Spec 84 §2.5.c:
- **Intake states** (Application Received, Accepted, Prepare Notice, Notice Prepared) — no CKAN source date
- **Procedural pauses** (Postponed, Deferred) — no source date
- **Post-decision states** (Final and Binding, Appealed, TLAB Appeal, OMB Appeal) — no source date for the transition itself
- **Terminal/administrative** (Application Withdrawn, Cancelled, Complete, Closed) — `decision_date` represents the original decision (if any), not when the administrative close happened. Mapping them would conflate two events. **Notably 'Closed' is 87.6% of all CoA rows (28,948 of 33,052)** — by design they get the 'detected' badge from `transitioned_at` fallback in the Inspector.

**Whitespace defense:** writer applies `(b.status ?? '').trim()` before `STATUS_TO_DATE_COLUMN_COA` lookup. Spec 84 §2.5.a row 8 documents that the permit-side CKAN feed has at least one status with trailing whitespace ('Under Review') — defensive trim guards against the same risk on the CoA-side feed.

**`ON CONFLICT` semantic:** the existing `uniq_lifecycle_status_history_natural_key` unique index covers `(lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC'))`. The writer switches from `DO NOTHING` to `DO UPDATE SET event_date = EXCLUDED.event_date WHERE EXCLUDED.event_date IS DISTINCT FROM lifecycle_status_history.event_date AND EXCLUDED.event_date IS NOT NULL`. Preserves WAL discipline; prevents NULL overwriting non-null; captures non-null event_date on intra-batch retries.

**Accepted limitation (Option B, 2026-05-22):** the ledger does **NOT** propagate CKAN date corrections to existing rows where status is unchanged. The writer's loop only emits when status changes (`prevStatus !== b.status`); a CKAN clerk correcting an already-recorded `decision_date` (e.g., typo fix 5 days off) does NOT trigger a re-emit. Rationale:
- CKAN retroactive date corrections are rare in practice (typically a handful per year for Toronto's open data).
- The magnitude of staleness is small (days, not months).
- vs. the pre-Phase-3 state, the Inspector showed `transitioned_at` (off by 1-3 YEARS); event_date with possible 5-day correction lag is ~99% improvement.
- The append-only event log model — "the ledger records what we knew when" — is industry standard.
- Operators needing live source dates read `coa_applications.decision_date` / `hearing_date` directly (always current via the main UPSERT).
- The Inspector renders the 'detected' badge to clearly signal observation-time provenance.

Tracked in `docs/reports/review_followups.md` row 160 as candidate for future "emit-on-any-change" hardening WF if/when operator complaints surface.

**No historical backfill** — pre-Phase-3 rows retain `event_date = NULL`. Inspector falls back to `transitioned_at` with 'detected' badge.
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `coa.logic.test.ts` (field mapping, address composition, ward normalization)
- **Logic:** `pipeline-sdk.logic.test.ts` (load-coa uses Pipeline SDK)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/load-coa.js`

### Out-of-Scope
- `scripts/link-coa.js` — governed by step spec
- `src/lib/coa/linker.ts` — TypeScript API path

### Cross-Spec Dependencies
- **Consumed by:** `chain_coa.md` (step 2)
- **Relies on:** `pipeline_system.md` (SDK)
</constraints>
