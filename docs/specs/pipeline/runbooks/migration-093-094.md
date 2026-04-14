# Runbook: Apply Migrations 093 + 094 to Production

**Risk:** MEDIUM — pipeline scripts reference columns/tables added by these migrations. If the nightly pipeline runs while the migration is being applied, it can crash with `column "X" does not exist`.

## Migrations in scope

| # | File | Adds |
|---|------|------|
| 093 | `migrations/093_control_panel_gaps.sql` | `trade_configurations.multiplier_bid`, `.multiplier_work` + 2 `logic_variables` keys |
| 094 | `migrations/094_coa_lifecycle_stalled.sql` | `coa_applications.lifecycle_stalled` column |

## Deploy order (NEVER skip)

### Step 1 — Pause the pipeline
- Disable the scheduler/cron for the permits + coa chains.
- Confirm no active chain run is in progress:
  ```sql
  SELECT pipeline, started_at, status FROM pipeline_runs
   WHERE completed_at IS NULL
   ORDER BY started_at DESC LIMIT 20;
  ```
- If there's an in-flight run, wait for it to finish or cancel it cleanly via the admin UI cancel button.

### Step 2 — Apply the migrations
```bash
npm run migrate
```
Confirms:
- `\d trade_configurations` shows `multiplier_bid` and `multiplier_work` columns with `DECIMAL(4,2) NOT NULL DEFAULT`.
- `SELECT variable_key FROM logic_variables WHERE variable_key IN ('lead_expiry_days','coa_stall_threshold');` returns 2 rows.
- `\d coa_applications` shows `lifecycle_stalled` column with `BOOLEAN NOT NULL DEFAULT false`.

### Step 3 — Deploy the refactored JavaScript
Deploy the commit that:
- Refactors the 4 marketplace scripts to use the shared `loadMarketplaceConfigs()` loader
- Wires per-trade multipliers in `compute-opportunity-scores.js`
- Wires `expired_threshold_days` in `compute-trade-forecasts.classifyUrgency`
- Wires `coa_stall_threshold` in `classify-lifecycle-phase.js`
- Wires auto-archive-on-expired in `update-tracked-projects.js`
- Removes v1 `compute_timing_calibration` from the permits chain

The fallbacks in `scripts/lib/config-loader.js` mean scripts won't crash if called before Step 2, but they would skip the new behaviors silently. Always do Step 2 before Step 3 in production.

### Step 4 — Resume the pipeline
- Re-enable scheduler.
- Manually trigger one permits chain run and verify:
  - `compute_cost_estimates` completes without error.
  - `compute_trade_forecasts` uses the new per-trade multipliers (spot-check a few rows in `trade_forecasts`).
  - `update_tracked_projects` archives at least one claimed lead where `urgency='expired'`.
  - `classify_lifecycle_phase` flips `coa_applications.lifecycle_stalled = TRUE` for at least one stuck CoA.

## Rollback

If the pipeline is failing after Step 2+3:
1. Re-deploy the previous JS commit (scripts revert to pre-WF3 behavior).
2. DO NOT drop migrations 093/094 — the columns are additive and the older scripts ignore them.

If for some reason the migrations must be rolled back, the DOWN blocks are commented out in the SQL files. **Mandatory sequence** — do NOT invert these steps, or a live pipeline run will hit `column does not exist` errors mid-batch:

1. Re-deploy the previous JS commit (scripts stop referencing the new columns).
2. Wait for any in-flight pipeline run to complete (`SELECT pipeline FROM pipeline_runs WHERE completed_at IS NULL` returns 0 rows).
3. Pause the scheduler.
4. Uncomment the DOWN block in the migration SQL and run it manually.
5. Re-enable the scheduler.

## Why this procedure
The cross-process race is real: Postgres raises `column does not exist` synchronously when the OLD JS hits the NEW schema query OR the NEW JS hits the OLD schema. Pause → migrate → deploy → resume makes the two transitions atomic from the pipeline's point of view.
