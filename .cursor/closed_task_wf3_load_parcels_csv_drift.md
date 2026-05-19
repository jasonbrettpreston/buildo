# Active Task: WF3 — load-parcels.js resilience to CKAN address-column drift
**Status:** Implementation
**Workflow:** WF3 — per-finding fix from Spec 79 SUMMARY.md (CRIT-3b; user authorized 2026-05-19; + Independent + DeepSeek)
**Domain Mode:** Backend/Pipeline

---

## Context

* **Goal:** Make `scripts/load-parcels.js` surface CKAN Parcels CSV column drift in its audit_table (currently silent) so the chain stops swallowing the loss of address data.
* **Surfaced by:** Spec 79 permits chain Step 1 (2026-05-19) — `assert-schema.js` detected the CKAN Parcels CSV is missing 3 columns: `ADDRESS_NUMBER`, `LINEAR_NAME_FULL`, `DATE_EFFECTIVE`. assert-schema correctly fails. **But `load-parcels.js`, the consumer, never sees the drift** — its `(record.ADDRESS_NUMBER || '').trim()` fallback inserts empty strings → nulls, populating ~600 K parcels with NULL address data **invisibly**.
* **Target Spec:** Spec 55 (Source: Parcels) + Spec 48 §3.6 (audit_table cascade contract).

## Reproduction (verified via Step 1 evidence)

CKAN URL ([Toronto Open Data](https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/property-boundaries)) returns Parcels CSV with these columns:

```
expected: PARCELID, FEATURE_TYPE, ADDRESS_NUMBER, LINEAR_NAME_FULL, STATEDAREA,
          geometry, DATE_EFFECTIVE, DATE_EXPIRY    [8 required]
actual  : PARCELID, FEATURE_TYPE, STATEDAREA, geometry, DATE_EXPIRY [+ others]
missing : ADDRESS_NUMBER, LINEAR_NAME_FULL, DATE_EFFECTIVE
```

`scripts/load-parcels.js:431-432` + `:461`:
```js
const addressNumber  = (record.ADDRESS_NUMBER  || '').trim();   // → ''
const linearNameFull = (record.LINEAR_NAME_FULL || '').trim();  // → ''
...
date_effective: parseDate(record.DATE_EFFECTIVE),               // → null
```

`scripts/load-parcels.js:445-462`:
```js
batch.push({
  ...
  address_number:  addressNumber  || null,
  linear_name_full: linearNameFull || null,
  ...
  date_effective: parseDate(record.DATE_EFFECTIVE),
});
```

Result: the load completes without error. The audit_table only emits row counts (`rows_read`, `records_inserted`, ...) — there is no `parcels_csv_schema_drift` row. The chain proceeds. Downstream consumers (permit ↔ parcel address matching in `scripts/link-parcels.js`, lead-detail address rendering) silently degrade.

## Root cause

The script trusts that the CSV's column set matches `emitMeta`'s declaration:
```js
pipeline.emitMeta(
  { "Toronto Open Data CSV": ["PARCELID", "FEATURE_TYPE", "ADDRESS_NUMBER",
    "LINEAR_NAME_FULL", "STATEDAREA", "geometry", "DATE_EFFECTIVE"] },
  ...
);
```

But `emitMeta` is documentation — it never reads the CSV header. The `(x || '')` fallback was correct defensive coding for **occasional missing values within rows**, not for **entire columns disappearing from the source**.

## Proposed fix — startup header detection + audit_table cascade

Add ~30 LOC to `scripts/load-parcels.js`:

### 1. Header capture + drift detection (after stream pipe, before processing)

```js
// CSV header drift detection — Spec 79 CRIT-3b
//
// load-parcels.js is the consumer-side of assert-schema's Parcels check. When
// CKAN drops an expected column the `|| ''` fallback below silently null-fills
// every loaded row, invisibly degrading address matching. Detect the drift at
// the first record so the audit_table surfaces the loss.
const REQUIRED_CSV_COLUMNS = Object.freeze([
  'PARCELID', 'FEATURE_TYPE',
  'ADDRESS_NUMBER', 'LINEAR_NAME_FULL',
  'STATEDAREA', 'geometry', 'DATE_EFFECTIVE',
]);
let csvColumns = null;          // populated on first record (parser yields parsed obj keys)
let missingCsvColumns = [];     // recorded for audit_table
```

Then in the `for await` loop, on the **first** record:
```js
if (csvColumns === null) {
  csvColumns = Object.keys(record);
  missingCsvColumns = REQUIRED_CSV_COLUMNS.filter((c) => !csvColumns.includes(c));
  if (missingCsvColumns.length > 0) {
    pipeline.log.warn(
      '[load-parcels]',
      `CKAN Parcels CSV missing ${missingCsvColumns.length} expected column(s): ${missingCsvColumns.join(', ')}. ` +
      `Rows will be loaded with NULL address/date data. Run assert-schema.js to diagnose CKAN drift.`,
    );
  }
}
```

### 2. Two new audit_table rows in `emitFinal()`

```js
{ metric: 'parcels_csv_schema_drift',
  value: missingCsvColumns.length === 0 ? 'none' : missingCsvColumns.join(','),
  threshold: 'no missing required columns',
  status: missingCsvColumns.length === 0 ? 'PASS' : 'WARN' },

{ metric: 'parcels_null_address_pct',
  value: inserted > 0
    ? `${((nullAddressCount / inserted) * 100).toFixed(1)}%`
    : '0.0%',
  threshold: '< 10%',
  status: inserted === 0 ? 'INFO'
        : (nullAddressCount / inserted) >= 0.10 ? 'WARN' : 'PASS' },
```

Where `nullAddressCount` is incremented on each batch row whose `address_number` is null (computed in the in-loop block above).

### 3. Verdict cascade (Spec 48 §3.6)

The existing verdict computation:
```js
verdict: rows.some(r => r.status === 'FAIL') ? 'FAIL'
       : rows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS'
```
naturally cascades the new WARN to the overall verdict — operator gets a visible signal in `pipeline_runs.audit_table`.

### Why WARN not FAIL?

The 3-column drift loses address data but does **not** corrupt the parcels table (geometry, lot_size, neighbourhood join, all still work). A FAIL would block the chain on what is a degraded-data condition, not a corruption. WARN is the correct severity: surface to operator, don't break the chain. This matches the original Step 1 design intent — assert-schema is the gate; load-parcels is the loader.

## Test plan

1. **Unit test** (`load-parcels.csv-drift.logic.test.ts`):
   - Given a record set whose first record is missing 3 expected columns, the audit emit includes `parcels_csv_schema_drift` row with `status='WARN'` and value listing the 3 columns
   - Given a record set with all expected columns, the row has `status='PASS'` and value `'none'`
   - The `parcels_null_address_pct` row tracks the null-fraction correctly
2. **No DB infra test** — no DB writes change; tests are pure compute via mocked emit

## Standards Compliance

* **Spec 48 §3.6 audit_table cascade:** verdict cascade rule already follows the spec; new rows participate in it correctly via status field
* **Spec 47 §R10 PIPELINE_SUMMARY:** audit_table.rows additive; no schema-shape change
* **§2 Error Handling:** no new catch blocks; the warn-log path uses existing `pipeline.log.warn`
* **§6 Logging:** structured log with the missing-column list — auditable
* **Operating Boundaries:** see below

## Execution Plan

- [x] Spec touchpoint: Spec 55 + Spec 48 §3.6 + Spec 47 §R10
- [x] Reproduction: confirmed via Step 1 record + code trace at lines 431-432, 461
- [ ] **Red Light:** unit test asserting the 2 new audit rows + their values
- [ ] **Implementation:** add ~30 LOC to `scripts/load-parcels.js` per the design above
- [ ] Multi-Agent Review: Independent + DeepSeek
- [ ] **Verify:** invoke load-parcels.js with a mocked-CKAN fixture; observe new audit rows in PIPELINE_SUMMARY
- [ ] Green Light: typecheck + tests
- [ ] WF6 close-out: commit + archive

## Operating Boundaries

* **Target files:**
  - `scripts/load-parcels.js` (~30 LOC added)
  - `src/tests/load-parcels.csv-drift.logic.test.ts` (new, ~60 LOC)
* **Out-of-scope:**
  - **Source-swap to address_points** (SUMMARY's Option B) — separate WF1; design conversation deferred per per-finding WF3 scope
  - Re-sourcing missing date_effective from elsewhere
  - Updating `pipeline.emitMeta` declaration to reflect actual columns — would conflict with the "intended" columns
  - Modifying assert-schema.js (separate WF3 #3 already addressed cascade gap)
  - Updating Spec 55 documentation for CKAN's new layout — separate doc-WF
