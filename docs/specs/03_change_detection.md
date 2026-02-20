# Spec 03 -- Change Detection

## 1. User Story

> As a system, I need to detect which permits changed since the last sync so I
> only process updates and new records, minimizing database writes and preserving
> a field-level audit trail of every change.

## 2. Technical Logic

### Hash Computation (`computePermitHash`)

- Computes a **SHA-256** hex digest of the raw permit record.
- **Deterministic ordering**: Object keys are sorted alphabetically before
  serialization to ensure identical input always produces the identical hash,
  regardless of JavaScript property insertion order.
- Algorithm:
  1. Extract all keys from the `RawPermitRecord`.
  2. Sort keys alphabetically.
  3. Build a new object with keys in sorted order and their string values.
  4. `JSON.stringify()` the sorted object.
  5. Compute `createHash('sha256').update(payload).digest('hex')`.
- The resulting 64-character hex string is stored in `permits.data_hash`.

### Change Detection Flow (in `processBatch`)

For each incoming raw record:

```
1. computePermitHash(raw)  ->  newHash
2. findExistingPermit(permitNum, revisionNum)  ->  existing | null
3. if (!existing)           ->  INSERT new permit  (stats.new_count++)
4. if (existing.data_hash !== newHash)  ->  UPDATE permit + log changes  (stats.updated++)
5. if (existing.data_hash === newHash)  ->  touch last_seen_at only  (stats.unchanged++)
```

### Field-by-Field Diff Engine (`diffPermitFields`)

When a hash mismatch is detected (step 4 above), the diff engine compares the
old and new `Permit` objects field by field:

- **Skip set**: `data_hash`, `first_seen_at`, `last_seen_at` are excluded from
  comparison because they are bookkeeping values, not permit data.
- **Key union**: Collects all keys from both old and new objects (handles cases
  where one object has a key the other lacks).
- **Value normalization** (`toComparable`):
  - `null` / `undefined` -> string `"null"`
  - `Date` instances -> `date.toISOString()`
  - Everything else -> `String(value)`
- **Change detection**: If `toComparable(oldVal) !== toComparable(newVal)`, a
  `PermitChange` record is created with the field name, old value, and new value.
- Output: An array of `PermitChange` objects.

### History Logging

Each `PermitChange` from the diff is inserted into the `permit_history` table:

```sql
INSERT INTO permit_history (
  permit_num, revision_num, field_name, old_value, new_value,
  sync_run_id, changed_at
) VALUES ($1, $2, $3, $4, $5, $6, NOW())
```

This creates a complete audit trail showing which field changed, what the old
value was, what the new value is, which sync run triggered it, and when.

### Re-classification on Change

When a permit is updated (hash mismatch), the system also re-classifies it:

1. `DELETE FROM permit_trades WHERE permit_num = $1 AND revision_num = $2`
2. `classifyPermit(mappedPermit, rules)` -- runs the 3-tier classifier.
3. INSERT new `permit_trades` rows for each match.

This ensures trade assignments stay current when permit data changes.

## 3. Associated Files

| File | Role |
|------|------|
| `src/lib/permits/hash.ts` | `computePermitHash(raw)` -- SHA-256 with sorted keys |
| `src/lib/permits/diff.ts` | `diffPermitFields(old, new)` -- field-by-field comparison, `SKIP_FIELDS` set, `toComparable()` helper |
| `src/lib/sync/process.ts` | `processBatch()` -- orchestrates hash check, diff, DB update, history insert, and re-classification |
| `src/lib/permits/types.ts` | `PermitChange` interface (`permit_num`, `revision_num`, `field_name`, `old_value`, `new_value`) |
| `migrations/002_permit_history.sql` | `permit_history` table DDL with indexes on `(permit_num, revision_num)` and `sync_run_id` |
| `src/tests/permits.logic.test.ts` | Unit tests for hash and diff logic |
| `src/tests/factories.ts` | `createMockRawPermit()`, `createMockPermit()`, `createMockPermitChange()` |

## 4. Constraints & Edge Cases

- **Property order independence**: The hash sorts keys alphabetically before
  hashing. Two `RawPermitRecord` objects with the same values but different
  JavaScript property order produce the same hash.
- **All fields are strings in `RawPermitRecord`**: The hash operates on the raw
  string values, not the cleaned/parsed values. This means the hash detects
  changes in the raw data even if the parsed result is identical (e.g., `"150000"`
  vs. `"150000.00"` would produce different hashes).
- **Metadata fields excluded from diff**: `data_hash`, `first_seen_at`, and
  `last_seen_at` always differ between old and new records (by definition) so
  they are excluded from the diff to avoid noise in the history table.
- **Null handling in diff**: `toComparable()` converts both `null` and
  `undefined` to the string `"null"`. When recording the change, if the
  comparable value is `"null"`, the actual stored `old_value` / `new_value` is
  set to SQL `NULL` (not the string `"null"`).
- **Date serialization**: Dates are compared as ISO strings. A Date that differs
  only in time component will be detected as a change.
- **Empty change set**: If the hash is different but `diffPermitFields` returns
  zero changes (theoretically possible due to rounding/serialization differences),
  the permit is still UPDATEd (new hash stored) but no history rows are inserted.
- **Transaction isolation**: Each record's hash-check-diff-update sequence runs
  inside its own `BEGIN`/`COMMIT` block. If the diff or history insert fails, the
  entire record is rolled back without affecting other records in the batch.
- **Re-classification**: On change, all existing `permit_trades` rows are
  deleted and re-created. This is a DELETE+INSERT pattern (not an UPDATE) to
  handle cases where the number of matched trades changes.

## 5. Data Schema

### PermitChange (runtime type)

```typescript
interface PermitChange {
  permit_num: string;
  revision_num: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
}
```

### permit_history (database table)

```
id              SERIAL          PRIMARY KEY
permit_num      VARCHAR(30)     NOT NULL
revision_num    VARCHAR(10)     NOT NULL
sync_run_id     INTEGER
field_name      VARCHAR(100)    NOT NULL
old_value       TEXT
new_value       TEXT
changed_at      TIMESTAMP       NOT NULL DEFAULT NOW()
```

### Indexes

- `idx_permit_history_permit` on `(permit_num, revision_num)` -- query all changes for a specific permit.
- `idx_permit_history_sync_run` on `(sync_run_id)` -- query all changes from a specific sync run.

## 6. Integrations

| System | Direction | Detail |
|--------|-----------|--------|
| Node.js `crypto` | Compute | `createHash('sha256')` for hash generation |
| PostgreSQL | Read | `SELECT * FROM permits WHERE permit_num = $1 AND revision_num = $2` to fetch existing record and its `data_hash` |
| PostgreSQL | Write | `UPDATE permits SET ... data_hash = $29 ...` on change; `INSERT INTO permit_history` for each changed field |
| Classification engine | Trigger | `classifyPermit()` is re-invoked on every changed permit; `permit_trades` rows are deleted and re-created |
| Sync orchestrator | Consumer | `processBatch()` aggregates `SyncStats.updated` count which is written to `sync_runs` |

## 7. Triad Test Criteria

### A. Logic Layer

| ID | Test | Assertion |
|----|------|-----------|
| L01 | `computePermitHash` is deterministic | Calling it twice on the same `RawPermitRecord` produces the identical hex string |
| L02 | Hash is independent of property order | Two objects with same values but keys inserted in different order produce the same hash |
| L03 | Hash changes when any field changes | Modifying `STATUS` from `"Issued"` to `"Completed"` produces a different hash |
| L04 | Hash output is 64-character hex string | Length is 64, matches regex `/^[0-9a-f]{64}$/` |
| L05 | `diffPermitFields` detects changed field | Old `status = "Issued"`, new `status = "Completed"` -> returns change with `field_name: "status"` |
| L06 | `diffPermitFields` detects multiple changes | Changing both `status` and `est_const_cost` -> returns 2 `PermitChange` objects |
| L07 | `diffPermitFields` skips `data_hash` | Even though `data_hash` differs between old and new, it does not appear in changes |
| L08 | `diffPermitFields` skips `first_seen_at` | Excluded metadata field not in output |
| L09 | `diffPermitFields` skips `last_seen_at` | Excluded metadata field not in output |
| L10 | `diffPermitFields` returns empty array for identical records | Same values (excluding skip fields) -> zero changes |
| L11 | `diffPermitFields` handles null-to-value transition | Old has `completed_date: null`, new has `completed_date: Date` -> change recorded with `old_value: null`, `new_value: ISO string` |
| L12 | `diffPermitFields` handles value-to-null transition | Old has `est_const_cost: 150000`, new has `est_const_cost: null` -> change recorded |
| L13 | `toComparable` serializes Date as ISO string | `toComparable(new Date("2024-01-15"))` -> `"2024-01-15T00:00:00.000Z"` |
| L14 | `toComparable` serializes null as `"null"` | `toComparable(null)` -> `"null"` |

### B. UI Layer

N/A -- change detection is a backend process. The permit detail API endpoint (`GET /api/permits/[id]`) surfaces the history data (see Spec 06).

### C. Infra Layer

| ID | Test | Assertion |
|----|------|-----------|
| I01 | New permit creates no history rows | `permit_history` count for that `(permit_num, revision_num)` is 0 |
| I02 | Changed permit creates history rows | After re-syncing with changed `status`, `permit_history` contains a row with `field_name = 'status'` |
| I03 | History row links to sync run | `permit_history.sync_run_id` matches the active `sync_runs.id` |
| I04 | Unchanged permit creates no history rows | Re-syncing identical data produces 0 new `permit_history` rows |
| I05 | `data_hash` is updated on change | After processing a changed record, `permits.data_hash` matches the new hash |
| I06 | `last_seen_at` is touched on unchanged permit | Timestamp is updated even when no fields changed |
| I07 | Re-classification fires on change | `permit_trades` rows reflect the new permit data after an update |
| I08 | Transaction rollback on error | If the diff or history insert throws, the permit row is not updated (data_hash unchanged) |
