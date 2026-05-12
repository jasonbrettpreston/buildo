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
