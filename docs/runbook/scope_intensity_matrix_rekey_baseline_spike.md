# Runbook — `scope_intensity_matrix` Production-Vocabulary Re-key Baseline Spike

**WF:** WF1 — Spec 83 §3.A re-key
**Migration:** `migrations/163_scope_intensity_matrix_production_vocab.sql`
**Date:** 2026-05-24
**Type:** Ops documentation for a one-time post-migration spike (NOT a Spec 48 §3.7 new-ledger-writer pattern per G7 fold — §3.7 is the template, this is a one-shot recovery spike)
**Owner:** chain operators / Brett

---

## Background

Migration 163 re-keys `scope_intensity_matrix` from normalized lowercase vocabulary (`'sfd'`, `'townhouse'`, `'commercial'`) to Toronto's CKAN production vocabulary (`'SFD - Detached'`, `'Apartment Building'`, etc.) and adds 32 production-vocabulary rows.

For the past ~14 days, **100% of permit cost_estimates rows have `estimated_cost=NULL` and `cost_source='none'`** due to the matrix vocabulary mismatch (see `docs/reports/wf3-cost-model-none.md`).

After migration 163 lands and the first `compute-cost-estimates` chain run completes, the IS DISTINCT FROM guard in the UPSERT will fire for every previously-NULL row whose computed estimate is now non-NULL — producing a one-time **records_updated** spike from ~0 to ~150K rows.

`observe-chain.js` will flag this as CRITICAL unless pre-acknowledged.

---

## Pre-deploy estimate query (calibration — G16 fold)

Run BEFORE applying migration 163 to capture the exact expected `records_updated` count:

```sql
SELECT COUNT(*) FROM cost_estimates
WHERE lead_id LIKE 'permit:%' AND estimated_cost IS NULL;
```

Record the result here when ready to deploy:

- **Pre-deploy NULL-cost permit count:** `__________` (fill in)
- **Pre-ack date/operator:** `__________`

The first post-migration `compute-cost-estimates` run is expected to emit `records_updated ≈ (count above) × (PI-1 predicted coverage / 100)` = approximately `count × 0.52`. The remainder will stay NULL (intentional safe-skip per §3.A(d)).

---

## Three mandatory artifacts (Spec 48 §3.7 template)

### 1. Spike shape

- **Metric:** `records_updated` in `compute-cost-estimates` pipeline_run
- **Pre-deploy baseline:** ~0 (typical incremental run updates few rows)
- **Expected spike:** ~80,000–130,000 (per pre-deploy calibration × 0.52 PI-1-predicted coverage)
- **Steady-state target:** returns to <5,000 per incremental run within 1–2 runs
- **Duration:** single chain run

### 2. Pre-ack instrument

Operator who applies migration 163 MUST add a row to `docs/reports/observe-chain-acknowledgements.md` (or equivalent) BEFORE the first post-migration chain run:

```
2026-MM-DD compute-cost-estimates expected records_updated spike to ~XXX,XXX
           per migration 163 (scope_intensity_matrix production-vocab re-key).
           See docs/runbook/scope_intensity_matrix_rekey_baseline_spike.md.
```

`observe-chain.js` checks this acknowledgement-log and suppresses CRITICAL flagging for the matching run.

### 3. Exit criteria

The spike is "complete" when:
- (a) **Post-migration coverage check** — embedded D2 acceptance band (47-57%, per PI-1 ± 5pp):
  ```sql
  WITH cov AS (
    SELECT
      ROUND(100.0 * COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL) / COUNT(*), 1) AS coverage_pct
    FROM cost_estimates ce
    -- Note: cost_estimates.lead_id uses zero-padded revision (LPAD width 2),
    -- so join on the columns directly instead of the synthetic lead_id string.
    JOIN permits p ON p.permit_num = ce.permit_num AND p.revision_num = ce.revision_num
    LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
    WHERE COALESCE(ptc.class, 'unclassified') = 'construction'
      AND ce.lead_id LIKE 'permit:%'
  )
  SELECT
    coverage_pct,
    CASE
      WHEN coverage_pct BETWEEN 47 AND 57 THEN 'IN-BAND (PASS)'
      WHEN coverage_pct > 57                THEN 'OVER-BAND — matrix over-seeded? add safe-skip rows'
      WHEN coverage_pct >= 25 AND coverage_pct < 47 THEN 'UNDER-BAND (WARN) — partial fix; check matrix completeness'
      WHEN coverage_pct < 25                THEN 'CLEARLY BROKEN (FAIL) — OB-2 should be firing; investigate'
    END AS d2_verdict
  FROM cov;
  ```
  Result is within `PI-1 predicted (52%) ± 5pp` → **47–57%**. Above: matrix may be over-seeded. Below 47: matrix may be under-seeded or another path is blocking. Below 25: clearly broken (also triggers OB-2 FAIL gate).
- (b) **Two subsequent incremental runs** show `records_updated < 5,000` (back to steady-state).
- (c) `audit_table.verdict` returns to PASS for two consecutive runs.

---

## Rollback (G20 fold)

If the migration must be reverted (e.g., D2 verification fails badly or downstream consumers are unexpectedly broken):

```sql
BEGIN;

-- Restore the 18 old lowercase-vocabulary rows
INSERT INTO scope_intensity_matrix (permit_type, structure_type, gfa_allocation_percentage) VALUES
  ('addition', 'commercial', 0.2000),
  ('addition', 'multi-residential', 0.1500),
  ('addition', 'semi-detached', 0.2500),
  ('addition', 'sfd', 0.2500),
  ('addition', 'townhouse', 0.2500),
  ('alteration', 'commercial', 0.1500),
  ('alteration', 'multi-residential', 0.1000),
  ('alteration', 'semi-detached', 0.1500),
  ('alteration', 'sfd', 0.1500),
  ('alteration', 'townhouse', 0.1500),
  ('interior alteration', 'commercial', 0.2500),
  ('interior alteration', 'sfd', 0.2000),
  ('new building', 'commercial', 1.0000),
  ('new building', 'garden suite', 1.0000),
  ('new building', 'multi-residential', 1.0000),
  ('new building', 'semi-detached', 1.0000),
  ('new building', 'sfd', 1.0000),
  ('new building', 'townhouse', 1.0000)
ON CONFLICT (permit_type, structure_type) DO UPDATE
  SET gfa_allocation_percentage = EXCLUDED.gfa_allocation_percentage;

-- Delete the production-vocabulary rows added by migration 163.
-- Note: the 32 pairs below are the exact set inserted by migration 163; if
-- the operator added any rows manually post-migration, they will NOT be
-- removed (correct — only this WF1's seed set is reverted).
DELETE FROM scope_intensity_matrix WHERE (permit_type, structure_type) IN (
  ('Small Residential Projects',     'SFD - Detached'),
  ('Small Residential Projects',     'SFD - Semi-Detached'),
  ('New Houses',                     'SFD - Detached'),
  ('Building Additions/Alterations', 'Office'),
  ('Building Additions/Alterations', 'Apartment Building'),
  ('Building Additions/Alterations', 'Retail Store'),
  ('Building Additions/Alterations', 'Multiple Unit Building'),
  ('New Houses',                     'SFD - Townhouse'),
  ('Small Residential Projects',     '2 Unit - Detached'),
  ('Small Residential Projects',     'SFD - Townhouse'),
  ('Building Additions/Alterations', 'Multiple Use/Non Residential'),
  ('Small Residential Projects',     'Laneway / Rear Yard Suite'),
  ('Building Additions/Alterations', 'Other'),
  ('Building Additions/Alterations', 'Restaurant 30 Seats or Less'),
  ('Building Additions/Alterations', 'Industrial'),
  ('New Houses',                     'Stacked Townhouses'),
  ('Residential Building Permit',    'SFD - Detached'),
  ('Building Additions/Alterations', 'Restaurant Greater Than 30 Seats'),
  ('Small Residential Projects',     'Unknown'),
  ('Small Residential Projects',     '2 Unit - Semi-detached'),
  ('Small Residential Projects',     'Converted House'),
  ('Building Additions/Alterations', 'Medical/Dental Office'),
  ('Small Residential Projects',     '3+ Unit - Detached'),
  ('Building Additions/Alterations', 'Hospital'),
  ('New Building',                   'Apartment Building'),
  ('New Building',                   'Mixed Use/Res w Non Res'),
  ('Residential Building Permit',    'SFD - Townhouse'),
  ('Building Additions/Alterations', 'Place of Worship'),
  ('New Houses',                     'SFD - Semi-Detached'),
  ('Building Additions/Alterations', 'Elementary School'),
  ('New Houses',                     '3+ Unit - Detached'),
  ('Building Additions/Alterations', 'University')
);

COMMIT;
```

Then revert the code-side changes by `git revert <commit>` of the WF1 implementation commits, and re-run `compute-cost-estimates`.

---

## Cross-references

- Plan: `.cursor/active_task.md` (WF1 v3)
- PI outputs: `docs/reports/wf1-cost-matrix-rekey-pis.md`
- PI-3 allocation mapping: `docs/reports/wf1-cost-matrix-rekey-allocation-mapping.md`
- Spec change: `docs/specs/01-pipeline/83_lead_cost_model.md` §3.A
- Migration: `migrations/163_scope_intensity_matrix_production_vocab.sql`
