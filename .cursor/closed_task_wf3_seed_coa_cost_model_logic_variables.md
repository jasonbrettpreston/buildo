# Closed Task (Archive): WF3 — seed missing model_range_pct + fallback_range_pct logic_variables

**Status:** Closed — committed in `759d280` on 2026-05-19; mig 156 applied to local DB; downstream script verified PASS.
**Workflow:** WF3 — per-finding fix from Spec 79 SUMMARY.md (HIGH-6).
**Domain Mode:** Backend/Pipeline.

---

## Outcome (verified)

| Check | Result |
|-------|--------|
| `BEFORE` DB state | `logic_variables` query for both keys → `[]` |
| `AFTER` DB state | `model_range_pct = 0.20`, `fallback_range_pct = 0.40` |
| Mig 156 recorded in `schema_migrations` | ✅ at 2026-05-19T20:21:45Z |
| Re-run `compute-coa-cost-estimates.js` | ✅ Zod gate passes; 33,106 CoAs processed in 7.7s |
| Cost estimates written | 25,288 (76.4% coverage — above 70% threshold) |
| Audit `verdict` | `PASS` |
| `npm run typecheck` | ✅ |
| `npx vitest run src/tests/migration-156-*.infra.test.ts` | ✅ 8/8 |
| Pre-commit gate (`typecheck + lint + test`) | ✅ |

## Ceremony record

* Plan: v2 (HIGH fold from DeepSeek — conditional UPSERT for NULL/NaN existing values).
* Independent reviewer: APPROVE. Confirmed Zod gate executes before runtime fallback; no existing seed migration; defaults match `coa-cost-model.js:23-24` constants (Spec 83 §3.A leaves magnitudes to code).
* DeepSeek adversarial: HIGH "ON CONFLICT DO NOTHING leaves NULL/NaN rows broken" → FOLDED into v2 (conditional `DO UPDATE WHERE existing IS NULL OR existing = 'NaN'::numeric`). All other findings were scope-creep into Spec 47 internals — out-of-scope for narrow seed-migration WF3.

## Side finding (filed separately)

`npm run migrate` halts at mig 148 (`null value in column variable_value`) — migrations 148–154 never applied to local DB. Mig 156 was applied directly via `psql` since its keys are independent of 148–154's keyspace. Tracked as Task #114 for future investigation.

## Files

* `migrations/156_seed_coa_cost_model_logic_variables.sql` — new (49 LOC)
* `src/tests/migration-156-seed-coa-cost-model-logic-variables.infra.test.ts` — new (87 LOC, 8 tests)
