# Active Task: WF2 — Bug Prevention Strategy Phase 7 "The Gauntlet"
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `5ecda56`

## Context
* **Goal:** Execute `docs/reports/bug_prevention_strategy.md` — build structural tooling that physically prevents the repeating bug classes found in the WF5 pipeline audit (RUN_AT violations, N+1 queries, bare mutations, unbounded memory accumulation, raw integer parsing).
* **Target Spec:** `docs/specs/pipeline/47_pipeline_script_protocol.md`, `docs/specs/00_engineering_standards.md`

## Technical Implementation

### Phase A — Tooling Foundation
* **New files:** `scripts/lib/safe-math.js`, `scripts/lib/safe-math.d.ts`, `src/lib/safe-math.ts`, `src/lib/api/with-api-envelope.ts`, `scripts/ast-grep-rules/loop-query.yml`, `scripts/ast-grep-rules/unbounded-push-in-stream.yml`, `scripts/amnesty.json`, `scripts/generate-script.mjs`, `migrations/100_updated_at_triggers.sql`, `src/tests/safe-math.logic.test.ts`, `src/tests/with-api-envelope.logic.test.ts`
* **Modified files:** `scripts/lib/pipeline.js` (getDbTimestamp), `scripts/hooks/ast-grep-leads.sh` (checks 7-9), `eslint.config.mjs` (parseInt/new Date bans), `package.json` (generate:script), `docs/specs/pipeline/47_pipeline_script_protocol.md`
* **Database Impact:** YES — migration 100 adds `trigger_set_timestamp()` function + BEFORE UPDATE triggers on 9 tables (trade_mapping_rules, user_profiles, pipeline_schedules, lead_claims, lead_analytics, logic_variables, marketplace_trade_configs, trade_sqft_rates, scope_intensity_matrix)

### Phase B — Mop-Up (after Phase A merged)
* B1: parseInt → safeParsePositiveInt across ~35 pipeline scripts
* B2: Fix N+1 loop queries (load-neighbourhoods, update-tracked-projects, load-coa, link-parcels, link-massing)
* B3: SQL NOW() remediation in mutation queries
* B4: Wrap 4 API routes with withApiEnvelope
* B5: Shrink amnesty list to permanent-only

## Standards Compliance
* **Try-Catch Boundary:** `withApiEnvelope` HOF catches all uncaught exceptions. `logError` in all catch blocks.
* **Unhappy Path Tests:** `safe-math.logic.test.ts` tests NaN/Infinity/negative/non-integer. `with-api-envelope.logic.test.ts` tests PG error sanitization + generic 500.
* **logError Mandate:** `withApiEnvelope` uses `logError('[api/envelope]', cause, context)`.
* **Mobile-First:** N/A — backend only.

## Execution Plan
- [x] **State Verification:** Violation counts documented. 9 tables need triggers, ~250 parseInt in pipeline scripts, 5 N+1 scripts, 4 routes without try-catch.
- [ ] **Contract Definition:** N/A — no API route signature changes.
- [ ] **Spec Update:** Update `docs/specs/pipeline/47_pipeline_script_protocol.md` (getDbTimestamp, OOM rule).
- [ ] **Schema Evolution:** Write `migrations/100_updated_at_triggers.sql`, run migrate, db:generate, typecheck.
- [ ] **Guardrail Test:** Write failing tests (safe-math + with-api-envelope).
- [ ] **Red Light:** Run `npm run test` — must see failures.
- [ ] **Implementation:**
  - [ ] A1: `scripts/lib/safe-math.js` + `.d.ts` + `src/lib/safe-math.ts`
  - [ ] A2: `getDbTimestamp` in `scripts/lib/pipeline.js`
  - [ ] A3: `loop-query.yml` + bare-mutation/multi-transaction grep checks
  - [ ] A4: Time Cop ESLint + sql-now grep check
  - [ ] A5: `src/lib/api/with-api-envelope.ts`
  - [ ] A6: `migrations/100_updated_at_triggers.sql`
  - [ ] A7: `unbounded-push-in-stream.yml`
  - [ ] A8: `scripts/generate-script.mjs`
  - [ ] A9: `scripts/amnesty.json` + hook + eslint + package.json
- [ ] **Pre-Review Self-Checklist:** Walk §47 + §9 against diff before Green Light.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
