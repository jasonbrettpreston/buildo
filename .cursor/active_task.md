# Active Task: WF3-E1 — externalize inspection_stall_days
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `529671d`

## Context
* **Goal:** Replace the hardcoded `STALE_DAYS = 300` (and the two inline
  `INTERVAL '300 days'` SQL literals) in scripts/classify-inspection-status.js
  with a `logic_variables`-backed `inspection_stall_days` key so Ops can tune
  the Active Inspection → Stalled SLA without a code deploy.
* **Target Spec:** docs/specs/pipeline/47_pipeline_script_protocol.md §6.4
* **Key Files:**
  - scripts/seeds/logic_variables.json              (add inspection_stall_days)
  - scripts/classify-inspection-status.js           (add LOGIC_VARS_SCHEMA, load logicVars, parameterize SQL)
  - src/tests/classify-inspection-status.infra.test.ts (NEW — source-scan assertions)

## Technical Implementation
* **New/Modified Components:**
  - scripts/seeds/logic_variables.json — add `inspection_stall_days: { default:300, type:"number", min:30, max:730 }`
  - scripts/classify-inspection-status.js — add zod + config-loader imports; define LOGIC_VARS_SCHEMA;
    load logicVars before withTransaction; replace STALE_DAYS constant and both SQL INTERVAL literals
    with `$1 * INTERVAL '1 day'` parameterized form
  - src/tests/classify-inspection-status.infra.test.ts — source-scan: key consumed, no hardcode,
    LOGIC_VARS_SCHEMA present with correct type
* **Database Impact:** NO — no schema change. The JSON seed loader idempotently inserts the new key
  on next `npm run migrate`.
* **Backwards compatibility:** Default 300 preserves current behaviour exactly.

## Execution Plan
- [x] **Rollback Anchor:** `529671d`
- [x] **State Verification:** `STALE_DAYS = 300` at line 17 defined but NOT used in SQL;
      both queries hard-code `INTERVAL '300 days'` at lines 39 and 61. No logicVars wiring.
- [x] **Spec Review:** §6.4 — business-logic constants must be externalized to logic_variables.
- [ ] **Seed Edit:** Add `inspection_stall_days` to logic_variables.json.
- [ ] **Reproduction:** Infra test asserts (a) `logicVars.inspection_stall_days` consumed,
      (b) LOGIC_VARS_SCHEMA includes the key, (c) no hardcoded `INTERVAL '300 days'`.
- [ ] **Red Light:** Must fail.
- [ ] **Fix:** Wire logicVars; parameterize both SQL INTERVALs.
- [ ] **Pre-Review Self-Checklist (6 items):**
      1. Seed-schema parity — seed JSON entry and Zod schema agree on type + default
      2. SQL duplication — all 3 occurrences replaced (lines 17, 39, 61)
      3. Range plausibility — min=30, max=730, default=300 sane
      4. Cross-script consumption — only this script uses this concept; no siblings
      5. Verdict-table churn — none; no threshold-based verdicts in this script
      6. Dual-path API latency — N/A; pipeline-only consumer, no src/lib/ read path
- [ ] **Green Light:** npm run test && npm run lint -- --fix && npm run typecheck
