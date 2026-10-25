# Runbook: Roll back the WF2 archetype cost derivation (Spec 83 §3-ARCHETYPE)

**Risk:** MEDIUM — reverts the primary residential permit/CoA cost derivation to the legacy
Spec-83 trade-buildup + Liar's Gate. The old path is **code-preserved** (it is the T4 fallthrough),
so rollback needs no code revert — one switch per cost step (an env flag for permits, a logic variable for CoA; below) turns the ladder OFF and a re-run reproduces
the legacy derivation end-to-end.

## When to roll back

Trigger on any of:
- Post-run audit shows T1/T2 prices **outside** the per-line plausibility bounds that the guards were
  supposed to reject (a bounds-guard regression).
- `archetype_map_nofit_residential_pct` FAILs (mapper quality collapse — mass mis-mapping).
- Reality-Check finds archetype magnitudes physically implausible on clean parcels
  (e.g. the $105M gut menu poisoning ≥15 permits recurs).
- Downstream consumers (forecasts / opportunity scores / snapshot) break on the new `cost_source`
  provenance values or the archetype-basis `modeled_gfa_sqm`.

## What the rollback flag does

The two cost steps take the switch from different places (corrected 2026-10-25, defect CCCE-D3 / Q-CE1):
- **Permits** — `scripts/compute-cost-estimates.js` §5 config build: `ARCHETYPE_COST_DISABLED=1` (env) flips `archetypeEnabled` OFF.
- **CoA** — the converted `compute_coa_cost_estimates` step no longer reads the environment: set the logic variable
  `archetype_cost_enabled` to `0` (its `logic_variables` row, e.g. from the admin control panel; declared in
  `scripts/compute-coa-cost-estimates.descriptor.json`, read at `scripts/lib/compute/compute-coa-cost-estimates.js:167`).
  `ARCHETYPE_COST_DISABLED=1` alone does **not** turn CoA archetype costing off.
To roll back both, do both.

With the ladder OFF, every row falls straight through to the legacy Steps A–D (the byte-identical
T4 path). Permits reproduce their pre-WF2 estimates; CoA reproduces the pre-WF2 baseline (0.0% cost
coverage — the legacy geometric CoA path matrix-missed every application, the `::` key bug).

Both switches are pure config changes — **no code revert, no redeploy.**

## Rollback steps (NEVER skip an order)

### Step 1 — Pause the pipeline
- Disable the scheduler/cron for the `permits` + `coa` chains.
- Confirm no chain run is in flight:
  ```sql
  SELECT pipeline, started_at, status FROM pipeline_runs
   WHERE completed_at IS NULL ORDER BY started_at DESC LIMIT 20;
  ```

### Step 2 — Re-run the legacy derivation end-to-end
Set the kill-switch and re-run the cost Muscles + everything downstream that consumes cost.
PowerShell (this box):
```powershell
$env:ARCHETYPE_COST_DISABLED = "1"   # permits step
# CoA step: set logic variable archetype_cost_enabled = 0 first (admin control panel / its logic_variables row)
node -r dotenv/config scripts/compute-cost-estimates.js
node -r dotenv/config scripts/compute-coa-cost-estimates.js
node -r dotenv/config scripts/compute-trade-forecasts.js
node -r dotenv/config scripts/compute-opportunity-scores.js
node -r dotenv/config scripts/update-tracked-projects.js
node -r dotenv/config scripts/refresh-snapshot.js
```
After this run, `cost_estimates.cost_source` carries only the legacy 4-value set again
(`permit` / `model` / `none` / `geometric`); no row should carry an `archetype_*` provenance.
Verify:
```sql
SELECT cost_source, COUNT(*) FROM cost_estimates GROUP BY cost_source ORDER BY 2 DESC;
-- expect: NO archetype_declared_area / archetype_parcel / archetype_rate rows
```

### Step 3 — Restore the `cost_source` CHECK constraint (mig 209 DOWN)
Only after Step 2 confirms zero `archetype_*` rows remain (the CHECK would otherwise reject nothing,
but the intent is to re-narrow the enum so a stray archetype write fails loudly):
```sql
ALTER TABLE cost_estimates DROP CONSTRAINT cost_estimates_cost_source_check;
ALTER TABLE cost_estimates ADD CONSTRAINT cost_estimates_cost_source_check
    CHECK (cost_source IN ('permit', 'model', 'none', 'geometric'));
```
> This DOWN block is also recorded in the trailer of `migrations/209_cost_source_archetype_values.sql`.
> `coa_applications` has **no** `cost_source` CHECK — nothing to revert there (Integration-verified).

### Step 4 — Downstream reconciliation notes
- **Zod enum / admin API:** `src/lib/admin/lead-schemas.ts` still lists the archetype values in the
  `cost_source` enum. Leaving them is HARMLESS (a superset) — the API validates DB reads, and no row
  will carry those values after Step 2. Do **not** narrow the enum before Step 2 completes, or an
  in-flight archetype row would 500 the lead-inspect endpoint.
- **Snapshot columns:** `data_quality_snapshots.cost_estimates_from_*` and the Liar's-Gate columns are
  unchanged by rollback (no second migration was ever added). The `from_model` bucket simply stops
  counting archetype rows because none exist.
- **CoA panel:** the `COA_EXPECTED_COST_SOURCES` set still accepts `geometric` — legacy CoA rows do not
  false-warn.

### Step 5 — Resume
- Re-enable the scheduler. Leave `ARCHETYPE_COST_DISABLED=1` set in the runtime env and `archetype_cost_enabled = 0` until the root
  cause is fixed; unset the env flag (or set `0`), set `archetype_cost_enabled` back to `1`, then re-run Step 2 to roll **forward** again.

## Roll-forward (undo the rollback)
```powershell
Remove-Item Env:\ARCHETYPE_COST_DISABLED   # or: $env:ARCHETYPE_COST_DISABLED = "0"   (permits)
# CoA: set logic variable archetype_cost_enabled back to 1
# re-apply mig 209 (widen the CHECK) if Step 3 was run, then re-run Step 2's scripts.
```

## SPEC LINK
- `docs/specs/01-pipeline/83_lead_cost_model.md` §3-ARCHETYPE
- `migrations/209_cost_source_archetype_values.sql` (UP + DOWN)
