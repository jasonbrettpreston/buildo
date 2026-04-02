# Scripts Bug Report

Below is an ongoing audit of the scripts in the `scripts/` directory for logical bugs, potential race conditions, edge cases, and missing error handling.

## 1. `scripts/classify-inspection-status.js`
- **Critical Bug (COALESCE vs. GREATEST)**: The calculation for determining stale activity uses `COALESCE(MAX(pi.inspection_date), MAX(pi.scraped_at)::date)`. `COALESCE` simply returns the first non-null value, so if *any* `inspection_date` is on record, it completely ignores `scraped_at`—even if the permit is actively being refreshed by the scraper (e.g. status changes or new un-dated inspections). This causes permits to prematurely enter the `Stalled` state, and prevents them from automatically recovering.
  - **Proposed Fix**: Change `COALESCE` to `GREATEST` so that it accurately captures the most recent date between the two.
- **Edge Case (Zero Inspections)**: The script joins off `permit_inspections`. If a permit has `enriched_status = 'Active Inspection'` but absolutely zero corresponding inspection rows, it will be skipped entirely instead of eventually shifting to `Stalled`.
- **Minor (parseInt)**: Step 3 utilizes `parseInt(r.cnt)` without a radix parameter (`10`). While generally safe with postgres `COUNT` values, it's best practice to include the radix to prevent unintended base interpretations.

## 2. `scripts/classify-permit-phase.js`
- **Brittle Match (Case Sensitivity)**: The query hardcodes `WHERE status = 'Inspection'`. If the upstream CKAN feed alters the casing (e.g. `INSPECTION` or `inspection`), this step will silently fail to classify any Examination permits.
  - **Proposed Fix**: Use `WHERE status ILIKE 'inspection'` or `WHERE LOWER(status) = 'inspection'`.
- **Implicit Data Quality Assumption**: It assumes any permit with `status = 'Inspection'` and `issued_date IS NULL` belongs in the 'Examination' phase. If a valid inspection permit simply had a malformed date dropped by the upstream scraper, it will be forcefully pushed back into the pre-issuance phase.

## 3. `scripts/classify-permits.js`
- **Critical Bug (Infinite Incremental Loop)**: In incremental mode, the script relies on checking `NOT EXISTS (SELECT 1 FROM permit_trades pt ...)`. If a permit is processed and yields *zero* trade matches, no rows are inserted. Consequently, the next time the script runs, `NOT EXISTS` still evaluates to true, and the permit is uselessly re-processed again. This creates a perpetually growing backlog of unclassifiable permits that will bog down the pipeline on every run.
  - **Proposed Fix**: Track classification sync status on the `permits` table itself (e.g. via an `trades_classified_at` timestamp), similar to how `classify-scope.js` does it with `scope_classified_at`.
- **Critical Bug (Orphaned Ghost Trades)**: During ghost trade cleanup, the script builds `validTradeIds` exclusively from `insertValues`. If a permit *used* to have a trade, but its text was updated so that it now matches *zero* trades, it will not be added to `insertValues` and thus omitted from `validTradeIds`. As a result, its orphaned ghost trades will never be deleted from the database.
  - **Proposed Fix**: Build a master set of all `(permit_num, revision_num)` keys processed in the current batch, and run `DELETE FROM permit_trades` against those keys for any `trade_id` not explicitly present in the new matches list (even if the new matches list is empty).

## 4. `scripts/classify-scope.js`
- **Moderate Data Hazard (Regex ReDoS)**: The sheer number of chained regex patterns against the combined text blob (`fields`) can be heavily taxing and susceptible to pathological text loops if very long unstructured text is encountered. It runs synchronously on large strings.
## 5. `scripts/close-stale-permits.js`
- **Generally Solid Architecture**: This script implements a robust safety guard (10% abortion threshold) and effectively prevents race conditions by anchoring off the timestamp in `pipeline_runs`. Timezone parsing is safely delegated to postgres. No major bugs found.

## 6. `scripts/refresh-snapshot.js`
- **Minor Cosmetic Bug (Division by Zero)**: In the logging output `Neighbourhoods: ${r.permits_with_neighbourhood} / ${r.active_permits} = ${(r.permits_with_neighbourhood/r.active_permits*100).toFixed(1)}%`, if `active_permits` is strictly `0`, it will generate `NaN%` in the logs. This won't crash the script, but should ideally be guarded with a ternary operator like in the preceding log lines.

## 7. `scripts/link-parcels.js`
- **Critical Bug (Infinite Incremental Loop)**: Just like `classify-permits.js`, the incremental logic skips permits if they exist in the `permit_parcels` table. If there is NO match (address malformed, no spatial parcel nearby), `noMatch` is incremented and no row is inserted into `permit_parcels`. Therefore, on the next run, the permit still has no rows, and it gets re-processed. All unmatchable permits are trapped in a perpetually processing infinite loop.
  - **Proposed Fix**: Log linking attempts natively on the `permits` table (e.g. `parcels_linked_at`), so failures can be safely skipped on subsequent incremental runs.
- **Data Integrity Bug (Orphaned Parcel Links)**: The upsert query uses `ON CONFLICT (permit_num, revision_num, parcel_id)`. If a permit's address data is updated upstream and it matches a *new* parcel on a subsequent run, the query simply inserts the new `(permit, new_parcel)` record. Because there is no `DELETE` cleanup for stale records, the permit will silently accumulate multiple distinct `parcel_id` associations over time, despite the script internally enforcing a strict 1:1 permit-to-parcel matching resolution.

## 8. `scripts/run-chain.js`
- **Critical Bug (Stdout Buffer Tearing / Missing Telemetry)**: The child process stdout listener receives raw sequential data chunks and immediately calls `chunk.split('\n')`. It does NOT buffer incomplete lines between chunks. Because large telemetry payloads (like `PIPELINE_SUMMARY:` JSONs) will inevitably be cut in half across arbitrary chunk boundaries, the string match `line.includes('PIPELINE_SUMMARY:')` will silently fail for both halves. This leads to the orchestrator randomly losing execution statistics, audit verdicts, and vital telemetry data for scripts with large outputs.
  - **Proposed Fix**: Use the native `readline` module attached to `child.stdout`, or manually maintain a `remainder` buffer that preserves the trailing incomplete line between `data` events.
