# Spec 03 -- Change Detection

<requirements>

## 1. Goal & User Story
Detect which permits changed since the last sync so only updates and new records are processed, minimizing database writes and preserving a field-level audit trail of every change.

</requirements>

---

<security>

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend scripts) |

</security>

---

<behavior>

## 3. Behavioral Contract
- **Inputs:** A `RawPermitRecord` from the ingestion stream and the existing `permits` row (if any) from the database.
- **Core Logic:** `computePermitHash()` in `src/lib/permits/hash.ts` computes a SHA-256 hex digest of the raw record with keys sorted alphabetically before serialization, ensuring property-order independence. During `processBatch()` in `src/lib/sync/process.ts`, each record follows: compute hash, lookup existing permit, then branch -- new record (INSERT, `new_count++`), hash mismatch (UPDATE + diff + history + re-classify, `updated++`), or hash match (touch `last_seen_at` only, `unchanged++`). The diff engine `diffPermitFields()` in `src/lib/permits/diff.ts` compares old and new `Permit` objects field-by-field, skipping metadata fields (`data_hash`, `first_seen_at`, `last_seen_at`). Values are normalized via `toComparable()`: null/undefined become `"null"`, Dates become ISO strings, everything else is stringified. Each detected change is inserted into `permit_history` with the sync run ID. On change, existing `permit_trades` rows are deleted and re-created via the classifier. See `PermitChange` in `src/lib/permits/types.ts`.
- **Outputs:** Updated `permits.data_hash`, new rows in `permit_history` for each changed field, refreshed `permit_trades` rows on change, and incremented `SyncStats` counters.
- **Edge Cases:** Hash operates on raw string values (not cleaned values), so `"150000"` vs `"150000.00"` produce different hashes; empty change set after hash mismatch still updates the hash but writes no history; each record runs in its own transaction (rollback on error does not affect other records); re-classification uses DELETE+INSERT pattern to handle changing trade counts.

</behavior>

---

<testing>

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`permits.logic.test.ts, sync.logic.test.ts`): Field Mapping; Permit Hashing; Permit Diff; Streaming JSON Parser
<!-- TEST_INJECT_END -->

</testing>

---

<constraints>

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/permits/hash.ts`
- `src/lib/permits/diff.ts`
- `src/tests/permits.logic.test.ts`
- `src/tests/sync.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/permits/field-mapping.ts`**: Governed by Spec 02. Do not modify field mapping.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/sync/ingest.ts`**: Governed by Spec 02. Do not modify stream parser.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `permits.data_hash` column and `permit_history` table.
- Consumed by **Spec 02 (Data Ingestion)**: `processBatch()` calls hash/diff functions from this spec.

</constraints>
