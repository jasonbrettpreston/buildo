# Active Task: WF3 #2 — Finding J — CoA forecast gate grace bypass (Spec 79 §7a)
**Status:** Implementation
**Workflow:** WF3 — Pass-2.5 finding from §7a Inspector spot-check; K split to separate WF3
**Domain Mode:** Backend/Pipeline
**Tracked in:** `docs/reports/pipeline-validation/wf3-queue.md` row J

## Context
- `trade_forecasts` has 0 CoA-side rows in DB (12-permit sample CRIT finding).
- Root cause: chicken-and-egg. `compute-trade-forecasts.js` audit-verdict gate (lines 218-247) reads `permits:compute_phase_calibration` most-recent verdict; current verdict is `WARN` because `coa_cohort_presence=0`. Calibration needs CoA cohorts → cohorts need CoA forecasts → forecasts blocked by gate. The script reports `coa_skipped_audit_blocked: 34290`.
- Finding K (lead-feed CoA UNION arm) split to a separate WF3 per plan-review on the bundled scope (3 schema surfaces, cursor versioning, mobile feature-flag — too large to bundle safely with J).

## Proposed fix — v3 (post-plan-review-v2: 7 additional folds applied)

### Primary change — single-override pattern, with reviewer-mandated order
Override order (least to most authoritative): **branches → grace bypass → force-active**. Force-active LAST so it decisively overrides any prior state (Independent v2 #1).

```js
// (a) Branches — existing PASS / blocked_by_* logic, slightly refactored
let coaGateActive = false;
if (gateRows.length === 0) {
  coaGateStatus = 'no_prior_run';
} else {
  coaGateLastRunId = gateRows[0].id;
  coaGateLastVerdict = gateRows[0].verdict;
  const lastStatus = gateRows[0].status;
  if (lastStatus !== 'completed') {
    coaGateStatus = `blocked_by_failed_run_${lastStatus}`;
  } else if (coaGateLastVerdict === 'PASS') {
    coaGateActive = true;
    coaGateStatus = 'pass';
  } else {
    coaGateStatus = `blocked_by_${(coaGateLastVerdict || 'null').toLowerCase()}`;
  }
}

// (b) Grace bypass — cold-start override. Breaks chicken-and-egg cleanly.
// `coaFirstDeployGrace` is computed once at startup (line 272) from
// `prior_runs_7d === 0`. Auto-transitions to false on the NEXT script
// invocation once 7 days of prior runs exist — NOT a runtime timer.
const coaGraceBypassActive = coaFirstDeployGrace && !coaGateActive;
if (coaGraceBypassActive) {
  coaGateActive = true;
  coaGateStatus = `grace_bypass_${coaGateStatus}`;
}

// (c) Force-active — operator safety valve. Last so it always wins.
const coaGateForceActive = logicVars.coa_gate_force_active === 1;
if (coaGateForceActive) {
  coaGateActive = true;
  coaGateStatus = `forced_active_${coaGateStatus}`;
}
```

### Fold A (Indep v2 #7 — CRIT) — Zod schema needs `.default(0)`
Without `.default(0)`, runs before mig 159 applies will get `undefined` → `z.coerce.number()` yields NaN → `.int()` throws → script crashes. Add:
```js
coa_gate_force_active: z.coerce.number().int().min(0).max(1).default(0),
```

### Fold B (Indep v2 #5 + DS v2 HIGH-2) — separate audit row for force-active
Two distinct audit rows so operators can distinguish what's overriding:
```js
auditRows.push({
  metric: 'coa_audit_gate_grace_bypass',
  value: coaGraceBypassActive ? 1 : 0,
  threshold: '== 0; if 1, calibration unhealthy and grace is allowing writes — verify by re-running compute_phase_calibration after 7d',
  status: coaGraceBypassActive ? 'WARN' : 'INFO',
});
auditRows.push({
  metric: 'coa_audit_gate_force_active',
  value: coaGateForceActive ? 1 : 0,
  threshold: '== 0; if 1, operator has manually overridden the gate — set coa_gate_force_active=0 once root cause is resolved',
  status: coaGateForceActive ? 'WARN' : 'INFO',
});
```

### Fold C (DS v2 LOW + HIGH-1 wording) — accurate log message
```js
if (coaGraceBypassActive || coaGateForceActive) {
  pipeline.log.warn('[trade-forecasts]',
    `CoA gate overridden — calibration verdict was ${coaGateLastVerdict || 'no_prior_run'}. ` +
    `grace_bypass=${coaGraceBypassActive} force_active=${coaGateForceActive}. ` +
    `Grace bypass deactivates on next script run once pipeline_runs has rows ≥7d old. ` +
    `Force-active deactivates when coa_gate_force_active is set to 0.`);
}
```

### Migration for new logic_variable
New migration `159_coa_gate_force_active_logic_variable.sql`:
```sql
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES ('coa_gate_force_active', 0,
        'Operator override for compute-trade-forecasts CoA audit-verdict gate. ' ||
        'Set to 1 to force CoA writes regardless of calibration verdict (safety valve ' ||
        'for post-grace-period deadlocks). Default 0 = normal gate behavior.')
ON CONFLICT (variable_key) DO NOTHING;
```

Plus `scripts/seeds/logic_variables.json` entry.

Plus Zod schema in compute-trade-forecasts.js — add `coa_gate_force_active` to the config schema.

## Spec adherence verification

| Spec | Section | Check |
|---|---|---|
| **41 §C+F** | compute_trade_forecasts rekeys on lead_id, UNION-extends | ✓ J doesn't touch the UNION; only changes the write-gate decision |
| **47 §31** | lead_id discriminator | ✓ Unchanged |
| **47 §R9** | Atomic writes inside withTransaction | ✓ Gate logic is BEFORE the transaction; bypass decision is computed once at startup |
| **47 §R5** | Zod config schema validates all logic_variables | ✓ New `coa_gate_force_active` added to schema |
| **47 §R10** | PIPELINE_SUMMARY audit_table.rows additive | ✓ New audit row appended; no shape change |
| **48 §3.6** | Row-derived verdict cascade | ✓ New row participates via its `status` field |
| **48 §3.8** | Per-step observability validation | ✓ Bypass-active state is auditable via the new WARN row |
| **51** | CoA stream parallel to permits | ✓ J makes CoA stream actually flow; respects co-equal stream design |
| **35** | Inspector queryKey unchanged | ✓ Not touched |
| **33 §5/§8** | Auth FIRST line | ✓ Script-only change; no route handler touched |

## Test plan

### Red Light
`src/tests/compute-trade-forecasts.infra.test.ts` — 6 new source-shape assertions:
1. Gate uses single-override pattern (`coaFirstDeployGrace` check appears AFTER branch logic, not inside)
2. `coa_gate_force_active` is read from logicVars and used as an override
3. **Override ORDER** (Indep v2 #8 fold): force-active check appears AFTER grace bypass (line-number assertion: force-active line > grace bypass line)
4. Two distinct audit rows exist: `coa_audit_gate_grace_bypass` AND `coa_audit_gate_force_active`, both WARN-when-active
5. Explicit `pipeline.log.warn` fires when either override is active, with both flags reported
6. Zod schema entry for `coa_gate_force_active` uses `.default(0)` (Indep v2 #7 CRIT — prevents crash if mig not yet applied)

`src/tests/migration-159-coa-gate-force-active.infra.test.ts` (new) — SQL-shape lock for the new migration.

### Green Light
- 5 + 1 new tests pass
- `npm run typecheck` clean
- Re-run `node scripts/migrate.js` (apply mig 159)
- Trigger `compute_trade_forecasts` via admin UI; verify:
  - `coa_audit_gate_grace_bypass = 1, status=WARN`
  - `coa_skipped_audit_blocked = 0` (was 34,290)
  - `trade_forecasts` table now has `coa:*` rows
  - `pipeline.log.warn` emitted with calibration verdict

## Execution Plan
- [ ] **Adversarial PLAN review v2** (Independent + DeepSeek) — validate the 3 folds I applied + check for new issues introduced
- [ ] **User authorization gate**
- [ ] Red Light tests
- [ ] Implementation: gate refactor + mig 159 + Zod schema + audit row + log warn
- [ ] **Adversarial IMPL review** (Independent + DeepSeek)
- [ ] Green Light + live verification
- [ ] Commit + push; update wf3-queue.md row J → closed

## Operating Boundaries
- Target: `scripts/compute-trade-forecasts.js` (~15 LOC gate refactor + new logic_variable + audit row)
- Target: `migrations/159_coa_gate_force_active_logic_variable.sql` (new file)
- Target: `scripts/seeds/logic_variables.json` (1 entry)
- Target: 2 test files (~30 LOC new assertions)
- Out of scope: K (separate WF3 #3), calibration WARN root cause, CoA cohort seeding, other findings (B/C/D/E/F/G/H/I/L)
