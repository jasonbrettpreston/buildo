# Active Task: WF3-E2+E3 — externalize close-stale-permits thresholds
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `7e4b55c`

## Context
* **Goal:** Replace two hardcoded constants in scripts/close-stale-permits.js:
  - E2 (line 63): `pendingClosedRate >= 10` — 10% safety abort gate
  - E3 (line 115): `INTERVAL '30 days'` — Pending Closed → Closed grace period
  Both are Ops-tunable thresholds that should be externalized to logic_variables.
* **Target Spec:** docs/specs/pipeline/47_pipeline_script_protocol.md §6.4
* **Key Files:**
  - scripts/seeds/logic_variables.json              (add stale_closure_abort_pct + pending_closed_grace_days)
  - scripts/close-stale-permits.js                  (add LOGIC_VARS_SCHEMA + logicVars load; replace both constants)
  - src/tests/close-stale-permits.infra.test.ts     (NEW — source-scan assertions)

## Technical Implementation
* **New/Modified Components:**
  - scripts/seeds/logic_variables.json — add two keys:
      `stale_closure_abort_pct` (default:10, type:"number", min:1, max:50)
      `pending_closed_grace_days` (default:30, type:"number", min:1, max:365)
  - scripts/close-stale-permits.js — add zod + config-loader; LOGIC_VARS_SCHEMA;
    load logicVars before queries; replace >= 10 and INTERVAL '30 days'
  - src/tests/close-stale-permits.infra.test.ts — source-scan: both keys consumed, no hardcodes
* **Database Impact:** NO — seed loader idempotently inserts new keys on npm run migrate.
* **Backwards compatibility:** Both defaults preserve current behaviour exactly.

## Execution Plan
- [x] **Rollback Anchor:** `7e4b55c`
- [x] **State Verification:** Line 63 `>= 10` and line 115 `INTERVAL '30 days'`. No logicVars.
- [x] **Spec Review:** §6.4 — Ops-tunable constants externalized to logic_variables.
- [ ] **Seed Edit:** Add both keys to logic_variables.json.
- [ ] **Reproduction + Red Light:** Infra test fails on both assertions.
- [ ] **Fix:** Wire logicVars; replace constants.
- [ ] **Pre-Review Self-Checklist (6 items per finding):**
      E2: 1. Parity ✓  2. No other >= 10 sites  3. min=1,max=50,default=10 sane  4. No siblings  5. Audit threshold strings updated  6. N/A pipeline-only
      E3: 1. Parity ✓  2. One INTERVAL site  3. min=1,max=365,default=30 sane  4. No siblings  5. No verdict churn  6. N/A pipeline-only
- [ ] **Green Light:** npm run test && npm run lint -- --fix && npm run typecheck
