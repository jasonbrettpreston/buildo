# PLAN task-372 FIX.PROJ (lane BL-FIXPROJ)

Files under change: src/lib/report-projection/format.ts, src/lib/report-projection/project.ts, scripts/seeds/logic_variables.json (two new variables), generated registries, tests.

D2 (format.ts:14 and :35). Defect: SQFT_PER_M2 = 10.7639 typed in code. Fix: the registered, pinned variable parcels_sqm_to_sqft already exists (scripts/seeds/logic_variables.json:8182, default 10.7639, min = max = 10.7639, "a unit definition, not a tunable"). format.ts imports the seed JSON (the lot-view.ts and placements/contract.ts pattern: seedJson import), reads parcels_sqm_to_sqft, throws at load if it is not a finite pinned number (min equal to max equal to default). Same value, so no output moves. The two phone files (mobile/src/lib/leadDetailFormat.ts:15 and mobile/src/lib/parcelCostFormat.ts:11) and src/lib/parcels/geometry.ts:3 carry the same typed factor and are NOT in this task: listed only.

D9 (project.ts:76). Defect: LOT_SIZE_PLAUSIBLE_M2 = { min: 50, max: 5000 } typed. Fix: two new pinned logic variables in scripts/seeds/logic_variables.json (min = max = value, a definitional window per core.8), group "MaxBLD Lot Size", read by project.ts from the seed with the same pinned check. Values unchanged (50 and 5000, ONE-13 a). The DB mirror row of a new variable is a migration; a migration number must be claimed in the ID ledger outside this lane write scope, so the migration is NOT written here (operator or orchestrator claim owed); readers use the pinned seed value so nothing depends on the row.

D6 (format.ts:35). One fast-check property test over formatPageRule area_sqft: for any non-negative finite metre value the digits equal Math.round(n * factor) grouped, the value is monotone in n, and within 1 sq ft of the exact product.

D1 (project.ts:179-184 and read-stored.ts). STOPPED, no code. Reasons: the stored Layer 3 row has no evaluator_version column (ROWS_SQL, read-stored.ts:31-34; descriptor columns), so P3 evaluator_version on the record cannot be compared without a migration and a writer change (ST.P1, push 12); the current settings sha is a hash over DB-resolved config (compute core lookupsFor, resolveConfig), needing several DB reads per stored read inside a pure compare. Written as an operator decision draft.

Tests first: red via a commit attempt with only the new tests and the task file staged.
No stored value and no golden moves: factor and window values are identical.
