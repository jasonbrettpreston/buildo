# Active Task: Opportunity Score — Asymptotic Decay + NULL Guard + los_decay_divisor
**Status:** Planning
**Workflow:** WF1 — New Feature / Enhancement
**Rollback Anchor:** `1b0db0b`

---

## Context

* **Goal:** Three surgical changes to `compute-opportunity-scores.js`:
  1. **Asymptotic Decay** — replace linear `(base × M) - penalty` with `(base × M) / (1 + rawPenalty / los_decay_divisor)`. Score now asymptotically approaches 0 under heavy competition but never goes negative, eliminating the zero-clamp data-loss problem.
  2. **NULL Guard** — if `estimated_cost == null` OR `trade_contract_values == null/{}`, set `score = null` (not 0). A score of 0 now definitively means "real value, fully competed." Missing data produces NULL.
  3. **Externalize `los_decay_divisor`** — new `logic_variables` row (default 25) controls the decay curve steepness from the Admin Control Panel without code deploys.

* **Target Specs:**
  - `docs/specs/product/future/81_opportunity_score_engine.md` (primary)
  - `docs/specs/product/future/86_control_panel.md` (add los_decay_divisor to §1 table)
  - `docs/specs/pipeline/47_pipeline_script_protocol.md` (compliance — infrastructure unchanged)

* **Key Files:**
  - `scripts/compute-opportunity-scores.js` — math refactor + NULL guard
  - `migrations/102_los_decay_divisor.sql` — new migration for logic_variables row
  - `docs/specs/product/future/81_opportunity_score_engine.md` — spec update
  - `docs/specs/product/future/86_control_panel.md` — add los_decay_divisor row
  - `src/tests/compute-opportunity-scores.infra.test.ts` — new infra tests

---

## Technical Implementation

### Part 1 — Asymptotic Decay (lines 189–197)

**Current (linear subtraction):**
```js
const competitionPenalty =
  (row.tracking_count * vars.los_penalty_tracking) + (row.saving_count * vars.los_penalty_saving);
const raw = (base * urgencyMultiplier) - competitionPenalty;
const score = Math.max(0, Math.min(100, Math.round(raw)));
```

**New (asymptotic decay):**
```js
const rawPenalty =
  (row.tracking_count * vars.los_penalty_tracking) + (row.saving_count * vars.los_penalty_saving);
const decayFactor = rawPenalty / vars.los_decay_divisor;
const raw = (base * urgencyMultiplier) / (1 + decayFactor);
const score = Math.max(0, Math.min(100, Math.round(raw)));
```

`decayFactor = 0` (no competition) → score = base × M unchanged.
`decayFactor = 1` (rawPenalty = los_decay_divisor) → score halved.
`decayFactor → ∞` (heavy competition) → score → 0 but never negative.
`Math.max(0, ...)` clamp stays as a final safety boundary (unreachable in practice).

### Part 2 — NULL Guard (before math, after SKIP_PHASES)

Insert before the math block:
```js
// NULL guard: missing cost data → explicit null (not 0)
const tradeValues = row.trade_contract_values;
const hasNoCostData = row.estimated_cost == null
  || tradeValues == null
  || Object.keys(tradeValues).length === 0;

let score;
if (hasNoCostData) {
  score = null;
  nullInputScores++;
} else {
  const tradeValue = tradeValues[row.trade_slug] ?? 0;
  // ... base, multiplier, asymptotic decay ...
}
```

Also add `let nullInputScores = 0;` to the counter block at line 122.

Move the integrity audit check (`integrityFlags++`) BEFORE the NULL guard so it runs regardless of cost data availability.

### Part 3 — Zod Schema

Add to LOGIC_VARS_SCHEMA (line 34):
```js
los_decay_divisor: z.number().finite().positive(),
```

### Part 4 — Audit Table Changes

- `null_scores` status: change from `nullScores > 0 ? 'WARN' : 'PASS'` → `'INFO'` (nulls are now intentional)
- Add new row after `null_scores`:
  ```js
  { metric: 'null_input_scores', value: nullInputScores, threshold: null, status: 'INFO' },
  ```
- Add to `records_meta`:
  ```js
  null_input_scores: nullInputScores,
  ```

### Part 5 — Migration 102

```sql
-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('los_decay_divisor', 25, 'Scales the asymptotic decay curve for competition penalties (rawPenalty / this)')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
DELETE FROM logic_variables WHERE variable_key = 'los_decay_divisor';
```

Note: user requested snippet for 092, but 092 is already applied (latest migration = 101). New migration 102 follows the established pattern (101, 099, etc.) for adding logic_variables rows post-deployment.

### Spec 47 Compliance — Preserved Exactly

The following infrastructure is NOT touched:
- `pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)` — unchanged
- `pipeline.streamQuery(pool, SQL, [])` — unchanged
- `flushBatch()` → `pipeline.withTransaction(pool, ...)` — unchanged
- `pipeline.emitSummary(...)` shape — unchanged (new field added to records_meta)
- `pipeline.emitMeta(...)` — unchanged
- `lockResult.acquired` + skip path — unchanged

The `null` score value is handled by the existing `$${base + 4}::int` parameterized INSERT — PostgreSQL NULL::int stays NULL. The `IS DISTINCT FROM` guard handles null-to-value and value-to-null transitions correctly.

### Dual Code Path

**N/A** — spec 81 §5 explicitly states: "DUAL PATH NOTE: N/A — opportunity_score is a dynamic marketplace property written only by this pipeline script. `src/lib/classification/scoring.ts` computes `lead_score` and MUST NOT be modified alongside this script."

---

## Standards Compliance

* **Try-Catch Boundary:** N/A — no new API routes. Script runs inside `pipeline.run()` which wraps all errors.
* **Unhappy Path Tests:** (a) missing estimated_cost → null score, (b) empty trade_contract_values → null score, (c) heavy competition → score approaches 0 but never goes negative.
* **logError Mandate:** N/A — no new catch blocks.
* **Mobile-First:** N/A — backend only.

---

## Execution Plan

- [ ] **Contract Definition:** N/A — no API route changes.
- [ ] **Spec & Registry Sync:** Update `81_opportunity_score_engine.md` §2 (add los_decay_divisor), §3 (asymptotic decay formula, NULL guard edge case, remove "Negative Values → 0"), §4 (update test examples). Update `86_control_panel.md` §1 table. Run `npm run system-map`.
- [ ] **Schema Evolution:** Create `migrations/102_los_decay_divisor.sql` — INSERT `los_decay_divisor = 25` into `logic_variables` with `ON CONFLICT DO NOTHING`. No DDL changes, no column adds, no backfill needed. No `db:generate` needed (Drizzle schema unchanged — `logic_variables` accessed via raw SQL only).
- [ ] **Test Scaffolding:** Add to `src/tests/compute-opportunity-scores.infra.test.ts`:
  - `los_decay_divisor` present in LOGIC_VARS_SCHEMA
  - NULL guard pattern (`hasNoCostData`, `score = null`, `nullInputScores`)
  - Asymptotic decay pattern (`/ (1 + decayFactor)`, not `- competitionPenalty`)
  - `null_input_scores` in records_meta
  - `null_scores` status is INFO (not WARN)
- [ ] **Red Light:** Run `npm run test` — new tests must fail against current script.
- [ ] **Implementation:** Edit `compute-opportunity-scores.js` per Technical Implementation above.
- [ ] **Auth Boundary & Secrets:** N/A.
- [ ] **Pre-Review Self-Checklist:** Before Green Light, verify:
  1. NULL guard fires for `estimated_cost == null` (not just `trade_contract_values`)
  2. NULL guard fires for empty `{}` as well as null
  3. `decayFactor` uses `vars.los_decay_divisor` (not hardcoded constant)
  4. `rawPenalty` computation is IDENTICAL to old `competitionPenalty` (variables unchanged)
  5. `Math.max(0, Math.min(100, ...))` clamp still present as final safety boundary
  6. `integrityFlags++` runs BEFORE the NULL guard (for all rows)
  7. `flushBatch` handles `score = null` correctly (null passes through ::int cast)
  8. `null_scores` DB audit does NOT count as out_of_range (NULL NOT BETWEEN 0 AND 100 = NULL, not true)
  9. `nullInputScores` counter incremented only in the NULL guard branch (not for zero-scored rows)
  10. All existing spec 47 tests still pass (no regressions)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → Spawn Adversarial + Independent Review agents. → WF6.

---

## Post-Deploy Instructions

After merging, run:
```bash
node scripts/compute-opportunity-scores.js
```
This will: (a) score all previously-null-due-to-0-clamp leads with the asymptotic formula, (b) null out leads that lacked cost data, (c) produce `anchor_fallbacks_used` in the run telemetry.

The `los_decay_divisor` seed row is inserted by migration 102. Operators can tune it via the Admin Control Panel `logic_variables` table without code deploys.
