# Active Task: WF1 #lifecycle-phase-engine-migration-F.3 — `compute-opportunity-scores.js` lead_id rekey + CoA consumer

**Status:** Complete (delivered 2026-05-17). v4 PLAN LOCK direct → Step 0 (test #145 update) → spec sync → 38 tests scaffolded → Red Light at 31 failing → implementation (~+260 lines) → Green Light at 76/76 F.3 tests pass → 4-reviewer diff-stage round → 6 inline folds applied (4 real bugs: test path/dir, hermetic seeding, stdio inherit, mig-134 attribution + Observability count comment + records_meta regression test) → 6 deferrals filed (4 false positives + 5 pre-existing patterns + 1 cosmetic — #200-#209) → Green Light at 6182/6182 → WF6 single feat commit + tiny docs close-out for `[F.3-COMMIT]` placeholders.

**Status historical:** Implementation (v4 — folded 23 v3 findings per user PLAN LOCK-direct authorization; v3 round did NOT decrease — v1=30 → v2=31 → v3=33 — same plateau pattern as F.2 v3 at 28 findings. v3 surfaced 3 new CRITs all in CRIT-v2-A's integration-test scaffolding; core script logic well-reviewed across 3 rounds × 4 reviewers. No further plan-stage reviewer round; diff-stage 4-reviewer round runs after Green Light per user mandate.)
**Workflow:** WF1 (script extension only — NO new migrations; substrate ready)
**Domain Mode:** Backend/Pipeline
**Rollback Anchor:** `ef6d111` (F.2 close-out; F.2 ship at `66884af`)
**Parent WF:** Phase F — Forecast / opportunity / CRM CoA extensions (Spec 42 §6.11)
**Sub-deliverable position:** F.1 (`4d58444`) → F.2 (`66884af`) → **F.3 (THIS task)** → F.4
**Adversarial review:** USER-MANDATED 4 reviewers (Gemini + DeepSeek + Independent worktree + Observability worktree) at plan + diff stages.
**Standards adherence:** `00_engineering_standards.md` §2/§3/§6/§9; Spec 47 §R1-R12 + §11.1; Spec 48 §3.1-3.5 + §4; Spec 81 §2.1 + §3 + §7 (all 9 Bug Fixes preserved); TDD Red Light gate.

---

## v3 → v4 Revision Summary

v3 round surfaced **33 findings** across 4 reviewers (Gemini 7 + DeepSeek 8 + Independent 10 + Observability 9 — some convergent). Trajectory v1=30 → v2=31 → v3=33 = NOT decreasing; matches F.2's v3 plateau pattern. v4 applies all 23 real folds; 10 are cosmetic/cascade-scrub.

### NEW CRITICAL (3 — Independent worktree caught what previous rounds missed)

- **CRIT-v3-X — Test file in WRONG directory** (Independent CRIT-v3-1, 100% conf). `npm run test:db` runs `src/tests/db/**` not `src/tests/**`. v3's `src/tests/compute-opportunity-scores.db.infra.test.ts` would NEVER be executed. **v4 fold (user-authorized):** rename to `src/tests/db/compute-opportunity-scores.db.test.ts` (matches existing convention: `lead-feed-saved-state.db.test.ts`, `phase-calibration.db.test.ts`, `migration-145-phase-d-substrate.db.test.ts`). Imports `./setup-testcontainer` correctly. `BUILDO_TEST_DB=1 npm run test:db` picks it up.

- **CRIT-v3-Y — Circular integration test** (Independent CRIT-v3-2, 100% conf). v3's `computeExpectedScore` helper re-implements the formula it tests — bugs in the formula would be undetectable. **v4 fold:** inline pen-and-paper expected value as a constant. Seeded inputs: `estimated_cost=200000, trade_contract_values={framing:30000}, tracking=1, saving=0, target_window='bid'`. Derivation: `base = min(30000/10000, 30) = 3`; `multiplier = los_multiplier_bid (global fallback) = 2.5`; `rawPenalty = 1×50 + 0×10 = 50`; `decayFactor = 50/25 = 2`; `raw = 3×2.5/(1+2) = 2.5`; `round(2.5) = 3` (JS Math.round rounds half-away-from-zero → `Math.round(2.5) === 3`). Assert `expect(rows[0].opportunity_score).toBe(3)` directly. Test seeds `logic_variables` rows to ensure constants match; documents trade_configurations exclusion for global-fallback path.

- **CRIT-v3-Z — records_meta count cascade fault** (Independent CRIT-v3-3, 95% conf — same class as CRIT-v2-D). v3 said "16 records_meta" but excluded 3 preserved booleans (`coa_first_deploy_grace`, `in_quiet_period`, `run_at`) that ARE in records_meta. Plus Revision Summary MED-v2-R names `permit_orphaned_cost_count_sample` (wrong) vs Part 1.10's `permit_orphaned_cost_sample_capped` (correct per NIT-v2-DD). **v4 fold:** records_meta count → **19** in all 7 cascade sites (Part 1.10 heading, Pre-Review item jj, test #22, Standards Compliance §3.2, Spec 48 Adherence, Runbook authorship, Risk Register). Naming consistency scrub.

### HIGH (6 — folded)

- **HIGH-v3-A** (Independent — 90% conf): Test seeds `target_window='bid'` explicitly + `beforeAll` clears `trade_configurations` for `'framing'` slug to guarantee global-fallback path; comment derivation.
- **HIGH-v3-B** (Gemini HIGH): db test extended with second test case for per-trade `trade_configurations` JOIN path — seed a `framing` row with `multiplier_bid=3.0`, expect different score. Closes the "end-to-end" gap.
- **HIGH-v3-C** (Gemini HIGH): log gating fix — change `if (!inQuietPeriod) warn(...)` to `inQuietPeriod ? log.info(...) : log.warn(...)`. Never silent. Applies to all 4 probe + orphan log sites + the pre-existing integrity log site (Observability F2 below).
- **HIGH-v3-D** (Independent — 88% conf): `beforeAll` deletes `pipeline_runs WHERE pipeline = 'permits:compute_opportunity_scores'` for hermeticity. Documented in test comment.
- **HIGH-v3-E** (Independent — 85% conf): Part 1.9 audit row table adds an explicit "note" column for `total_rows_coa` clarifying stream-time vs post-UPDATE divergence. Runbook FAQ Q5 added.
- **Observability F2** (70% conf): Pre-existing `integrity_flags > 0` log at script:267 added to HIGH-v3-C's gating scope (5th log site).

### MEDIUM (4 — folded)

- **MED-v3-D** (Gemini + DeepSeek convergent): `records_scored = totalRowsPermit + totalRowsCoa` (NOT + totalRowsOther — malformed rows are `continue`'d and never scored). `records_total = totalRowsPermit + totalRowsCoa + totalRowsOther` (kept full sum for §11.1).
- **MED-v3-F** (DeepSeek + Observability + Gemini convergent): `failed_sample` proportional cap. Take `slice(0, 7)` from each of 3 arrays before final concat+slice(0, 20). Guarantees each error type's visibility.
- **MED-v3-G** (DeepSeek + Independent F1 convergent): `malformed_lead_ids` quiet-period gating — DOCUMENT as intentional (mig-139 CHECK makes it corruption-class; not operationally-tunable). Add Spec 48 Adherence note + Pre-Review item.
- **MED-v3-H** (Independent MED-v3-F): `null_input_rate` aggregate kept (pre-existing semantic; per-branch split is scope creep). Document the intentional exception in Part 1.9 + Pre-Review item.

### LOW + NIT (10 — all folded for completeness)

- LOW-v3-H (DeepSeek): `let batchCount = 0;` declared explicitly in Part 1.3.
- Gemini LOW: Progress log says "rows processed" not "rows scored" (clarifies that malformed are not scored).
- Gemini NIT: Probe log message → "at least N (sample capped at 50)" — explicit truncation indicator.
- HIGH-v3-E doc cascade: `total_rows_coa` threshold string → `'=== 0 (post-quiet)'` for operator narrative clarity.
- Observability F7: Day-31 FAQ Q4 hardcoded "5 WARN-gated metrics" with enumeration.
- Observability F8: New Runbook FAQ Q5 — records_total vs 2-term sum (off by total_rows_other).
- Observability F9: Revision Summary cross-refs scrubbed.
- DeepSeek LOW 5: 1-line comment "is_geometric_override unused in scoring — accounted in trade_contract_values upstream".
- DeepSeek NIT: rawBid/rawWork parsing — leave as-is (parsing both is cheap; conditional adds branching).
- DeepSeek LOW 8: Helper comment explaining regex anchor necessity.

### Verified false positives or pre-existing defers (4)

- Gemini CRIT-v3-A (flushBatch error handling) — VERIFIED MITIGATED: `pipeline.withTransaction` SDK contract propagates errors → transaction rolls back → SDK's pipeline.run error handler emits failed summary. No silent data loss; behavior is documented in `scripts/lib/pipeline.js` `withTransaction` JSDoc. Risk Register documents.
- Observability F5 (CoA-side probe redundancy) — keep for symmetric observability per HIGH-v2-J fold spirit.
- v3 Risk Register #9 slug fragility — pre-existing F.1/F.2 pattern.
- Gemini LOW (regex overkill reverting v1 HIGH-G) — false positive against own v1 fold; regex preserved.

---

## Why this task exists

F.1 (`4d58444`) wired CoA-stage forecasts into `trade_forecasts` keyed by `lead_id`. F.2 (`66884af`) wired CRM alerts AND extended `lead_analytics` UNION-style for CoA leads. But `compute_opportunity_scores` (between them in the permits chain) is still permit-only by construction: SOURCE_SQL reads on permit_num/revision_num (CoA NULL); JOINs miss; UPDATEs never match. Per Spec 81 §2.1 + Spec 42 §6.11 row 264: F.3 is the lead_id rekey + CoA UNION consumption.

**Scope discipline.** F.3 = lead_id rekey + per-branch observability per F.1/F.2 baseline-quiet-period precedent. NOT a refactor. The 9 Spec 81 §7 Bug Fixes are preserved.

---

## Context

### Goal

Enable `compute-opportunity-scores.js` to produce `opportunity_score` for both permit-side AND CoA-side `trade_forecasts` rows by re-keying every read, JOIN, and UPDATE on `lead_id`. A tradesperson saving a CoA variance lead in P3 (Approved) sees a real `opportunity_score` driving lead-feed ranking via the same asymptotic-decay math as permit leads.

### Target Specs

- `docs/specs/00_engineering_standards.md` §2/§3/§6/§9
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12 + §11.1 + §14
- `docs/specs/01-pipeline/48_pipeline_observability.md` §3.1-3.5 + §4
- `docs/specs/01-pipeline/81_opportunity_score_engine.md` §2.1 + §3 + §7
- `docs/specs/01-pipeline/42_chain_coa.md` §6.11 row 264
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §7
- `docs/specs/01-pipeline/85_trade_forecast_engine.md` §3
- `docs/specs/01-pipeline/82_crm_assistant_alerts.md` §4

### Key Files

- **`scripts/compute-opportunity-scores.js`** (EXTEND — currently 370 lines; ~+230 lines)
- **`src/tests/compute-opportunity-scores.infra.test.ts`** (EXTEND — Phase F.3 describe block, ~30 tests; Step 0 updates existing test #145 to `maxRowsPerInsert(3)`)
- **`src/tests/compute-opportunity-scores.logic.test.ts`** (NEW — ~6 logic tests via vm sandbox)
- **`src/tests/db/compute-opportunity-scores.db.test.ts`** (NEW — CRIT-v3-X correct path — 2 integration tests: global-fallback path + per-trade JOIN path; ~120 lines including seed helpers)
- **`src/tests/chain.logic.test.ts`** (NO MODIFICATION; documented in Target Files for transparency)
- **`docs/runbook/F1_baseline_quiet_period.md`** (AMEND — `## Phase F.3 additions` section with 10 new audit rows + 19 new records_meta entries + 5 Operator FAQ entries)
- **`docs/specs/01-pipeline/81_opportunity_score_engine.md`** §2.1 (AMEND — F.3 DELIVERED note)
- **`docs/specs/01-pipeline/42_chain_coa.md`** §6.11 (AMEND — F.3 sub-deliverable row)
- **`docs/specs/01-pipeline/84_lifecycle_phase_engine.md`** §7 (AMEND — F.3 consumer wiring note)

**No migrations.**

### Operating Boundaries

**Target Files:** `scripts/compute-opportunity-scores.js`; 4 test files (1 EXTEND + 3 NEW including the corrected-path db test) + 1 untouched-but-listed; 1 runbook; 3 spec amendments.

**Out-of-Scope:** `compute-coa-cost-estimates.js`; `compute-trade-forecasts.js`; `update-tracked-projects.js`; Lead Inspector CoA panel; new migrations; pipeline manifest; Spec 95 cost-slicer extension.

**Cross-Spec Dependencies:** Relies on F.1 + F.2 + mig 145 + mig 132 + mig 139 + R5.5. Consumed by F.4 + mobile lead-feed sort.

---

## Technical Implementation

### Part 1.1 — SOURCE_SQL re-key

```sql
-- F.3 SOURCE_SQL — lead_id-keyed. ALIGNMENT (CRIT-v1-A): mig 132 trigger guarantees
--   permits.lead_id format = 'permit:'||permit_num||':'||LPAD(revision_num,2,'0');
--   F.2 lead_analytics permit shape is identical; F.1 writes tf.lead_id = p.lead_id.
-- DISCRIMINANT (CRIT-v1-F + HIGH-v2-J): ce.lead_id AS ce_lead_id for orphan detection —
--   mig 145 makes cost_estimates.lead_id NOT NULL + PK → NULL = LEFT JOIN miss.
SELECT
  tf.lead_id,
  tf.permit_num,
  tf.revision_num,
  tf.trade_slug,
  tf.target_window,
  tf.urgency,
  ce.lead_id AS ce_lead_id,
  ce.estimated_cost,
  ce.trade_contract_values,
  ce.is_geometric_override,                                    -- not used in scoring (accounted upstream in compute-cost-estimates.js)
  ce.modeled_gfa_sqm,
  COALESCE(la.tracking_count, 0) AS tracking_count,
  COALESCE(la.saving_count,   0) AS saving_count,
  tc.multiplier_bid,
  tc.multiplier_work
FROM trade_forecasts tf
LEFT JOIN cost_estimates ce         ON ce.lead_id  = tf.lead_id
LEFT JOIN lead_analytics la         ON la.lead_key = tf.lead_id
LEFT JOIN trade_configurations tc   ON tc.trade_slug = tf.trade_slug
WHERE (tf.urgency IS NULL OR tf.urgency <> 'expired')
```

**CRIT-A defensive integrity probe (HIGH-v2-H EXISTS+sample form; CRIT-v2-E inside-lock placement; HIGH-v3-C INFO-during-quiet gating):**

```js
// CRIT-v2-E: probe runs INSIDE withAdvisoryLock callback, AFTER final flushBatch(batch),
//   BEFORE pipeline.emitSummary.
// HIGH-v2-H: EXISTS+sample form — avoid full COUNT(*) over millions of rows.
// HIGH-v2-J: symmetric across permit + CoA branches.
// HIGH-v3-C: log at INFO during inQuietPeriod, WARN after — NEVER silent.
const probeBranches = [
  { branch: 'permit', filter: `tf.lead_id LIKE 'permit:%'` },
  { branch: 'coa',    filter: `tf.lead_id LIKE 'coa:%'` },
];
let permitDriftSampleCount = 0;
let coaDriftSampleCount = 0;

for (const { branch, filter } of probeBranches) {
  const { rows: [existsRow] } = await pool.query(`
    SELECT EXISTS(
      SELECT 1 FROM trade_forecasts tf
      LEFT JOIN lead_analytics la ON la.lead_key = tf.lead_id
      WHERE ${filter}
        AND (tf.urgency IS NULL OR tf.urgency <> 'expired')
        AND la.lead_key IS NULL
      LIMIT 1
    ) AS has_drift
  `);
  if (existsRow.has_drift) {
    const { rows: [countRow] } = await pool.query(`
      SELECT COUNT(*)::int AS drift_sample_count
        FROM (
          SELECT 1
            FROM trade_forecasts tf
            LEFT JOIN lead_analytics la ON la.lead_key = tf.lead_id
           WHERE ${filter}
             AND (tf.urgency IS NULL OR tf.urgency <> 'expired')
             AND la.lead_key IS NULL
           LIMIT 50
        ) AS bounded
    `);
    if (branch === 'permit') permitDriftSampleCount = countRow.drift_sample_count;
    else coaDriftSampleCount = countRow.drift_sample_count;

    // HIGH-v3-C: INFO during quiet, WARN after — never silent.
    const msg = `CRIT-A integrity probe: ${branch} forecasts have at least ${countRow.drift_sample_count} rows with no matching lead_analytics row (sample capped at 50; possible upstream format drift)`;
    if (inQuietPeriod) pipeline.log.info('[opportunity-scores]', msg);
    else               pipeline.log.warn('[opportunity-scores]', msg);
  }
}
```

### Part 1.2 — UPDATE re-key + BATCH_SIZE margin

```js
// HIGH-v2-I: cap at 21000 (3% margin from 65535 ceiling) — defensive against future driver overhead.
const BATCH_SIZE = Math.min(pipeline.maxRowsPerInsert(3), 21000);
```

### Part 1.3 — Counter declarations (LOW-v3-H batchCount + CRIT-v2-B totalRowsOther)

```js
let totalRowsPermit = 0;
let totalRowsCoa    = 0;
let totalRowsOther  = 0;
let nullInputScoresPermit = 0;
let nullInputScoresCoa    = 0;
let integrityFlagsPermit  = 0;
let integrityFlagsCoa     = 0;
let updatedPermit = 0;   // accumulated AFTER withTransaction resolves (HIGH-I)
let updatedCoa    = 0;
let orphanedPermitCost = 0;
let orphanedCoaCost    = 0;
let malformedLeadIds   = 0;
let batchCount = 0;      // LOW-v3-H: explicit declaration
let batch = [];

const orphanedPermitCostSample = [];
const orphanedCoaCostSample    = [];
const malformedLeadIdsSample   = [];
```

### Part 1.4 — Per-branch UPDATE split (HIGH-J + HIGH-I retry safety)

```js
const flushBatch = async (currentBatch) => {
  if (currentBatch.length === 0) return;
  const permitBatch = currentBatch.filter(u => u.branch === 'permit');
  const coaBatch    = currentBatch.filter(u => u.branch === 'coa');

  let pRowCount = 0, cRowCount = 0;

  // Gemini v3 CRIT-A note (verified mitigated): pipeline.withTransaction propagates errors,
  //   rolls back BOTH per-branch UPDATEs atomically, then bubbles to pipeline.run's error
  //   handler which emits failed summary. NO silent data loss.
  await pipeline.withTransaction(pool, async (client) => {
    if (permitBatch.length > 0) {
      const pVals = [], pParams = [];
      for (let j = 0; j < permitBatch.length; j++) {
        const u = permitBatch[j];
        const base = j * 3;
        pVals.push(`($${base + 1}, $${base + 2}, $${base + 3}::int)`);
        pParams.push(u.lead_id, u.trade_slug, u.score);
      }
      const r = await client.query(
        `UPDATE trade_forecasts tf
            SET opportunity_score = v.score
          FROM (VALUES ${pVals.join(', ')}) AS v(lead_id, trade_slug, score)
          WHERE tf.lead_id    = v.lead_id
            AND tf.trade_slug = v.trade_slug
            AND tf.opportunity_score IS DISTINCT FROM v.score`,
        pParams,
      );
      pRowCount = r.rowCount ?? 0;
    }
    if (coaBatch.length > 0) {
      const cVals = [], cParams = [];
      for (let j = 0; j < coaBatch.length; j++) {
        const u = coaBatch[j];
        const base = j * 3;
        cVals.push(`($${base + 1}, $${base + 2}, $${base + 3}::int)`);
        cParams.push(u.lead_id, u.trade_slug, u.score);
      }
      const r = await client.query(
        `UPDATE trade_forecasts tf
            SET opportunity_score = v.score
          FROM (VALUES ${cVals.join(', ')}) AS v(lead_id, trade_slug, score)
          WHERE tf.lead_id    = v.lead_id
            AND tf.trade_slug = v.trade_slug
            AND tf.opportunity_score IS DISTINCT FROM v.score`,
        cParams,
      );
      cRowCount = r.rowCount ?? 0;
    }
  });
  updatedPermit += pRowCount;
  updatedCoa    += cRowCount;
};
```

### Part 1.5 — Score-tier distribution per-branch + 3-way CASE

```sql
SELECT
  CASE
    WHEN lead_id LIKE 'coa:%'    THEN 'coa'
    WHEN lead_id LIKE 'permit:%' THEN 'permit'
    ELSE 'other'
  END AS branch,
  CASE
    WHEN opportunity_score IS NULL   THEN 'no_cost_data'
    WHEN opportunity_score >= $1     THEN 'elite'
    WHEN opportunity_score >= $2     THEN 'strong'
    WHEN opportunity_score >= $3     THEN 'moderate'
    ELSE 'low'
  END AS tier,
  COUNT(*)::int AS n
FROM trade_forecasts
WHERE (urgency IS NULL OR urgency <> 'expired')
GROUP BY 1, 2
```

### Part 1.6 — Post-UPDATE audit per-branch + legacy dual-emit

```sql
-- MED-v3-H note: null_input_rate / null_scores remain AGGREGATE (not per-branch split) —
--   pre-existing semantic; per-branch is scope creep. Documented in Pre-Review (mm).
SELECT
  CASE
    WHEN lead_id LIKE 'coa:%'    THEN 'coa'
    WHEN lead_id LIKE 'permit:%' THEN 'permit'
    ELSE 'other'
  END AS branch,
  SUM(CASE WHEN opportunity_score IS NULL THEN 1 ELSE 0 END)::int               AS null_scores,
  SUM(CASE WHEN opportunity_score NOT BETWEEN 0 AND 100 THEN 1 ELSE 0 END)::int AS out_of_range,
  COUNT(*)::int                                                                  AS forecasts_in_scope,
  COUNT(DISTINCT permit_num) FILTER (WHERE permit_num IS NOT NULL)::int          AS distinct_permits_in_scope
FROM trade_forecasts
WHERE (urgency IS NULL OR urgency <> 'expired')
GROUP BY 1
```

### Part 1.7 — `coaFirstDeployGrace` + `inQuietPeriod` startup query

```js
// MED-v2-T: SQL aliases describe COUNT direction explicitly.
const { rows: deployAgeRows } = await pool.query(
  `SELECT
     COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int  AS runs_older_than_7d,
     COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 days')::int AS runs_older_than_30d
   FROM pipeline_runs
   WHERE pipeline = 'permits:compute_opportunity_scores'`,
);
const coaFirstDeployGrace = deployAgeRows[0].runs_older_than_7d === 0;
const inQuietPeriod       = deployAgeRows[0].runs_older_than_30d === 0;
```

### Part 1.8 — Stream loop pseudocode (CRIT-v2-C — full §3 logic preserved)

```js
for await (const row of pipeline.streamQuery(pool, SQL, [])) {
  const branch = parseBranchFromLeadId(row.lead_id);

  // Branch dispatch + counter increment
  if (branch === 'permit') {
    totalRowsPermit++;
  } else if (branch === 'coa') {
    totalRowsCoa++;
  } else {
    // CRIT-v2-B + MED-M: malformed rows (unreachable post-mig-139 CHECK) counted defensively.
    // MED-v3-D: NOT added to records_scored (these rows are NOT scored — continue below).
    totalRowsOther++;
    malformedLeadIds++;
    if (malformedLeadIdsSample.length < 20) {
      malformedLeadIdsSample.push(`[malformed] lead_id=${JSON.stringify(row.lead_id)} trade=${row.trade_slug}`);
    }
    continue;
  }

  // CRIT-v1-F + HIGH-v2-J: orphan check via ce_lead_id NOT-NULL guarantee (mig 145).
  if (row.ce_lead_id == null) {
    if (branch === 'permit') {
      orphanedPermitCost++;
      if (orphanedPermitCostSample.length < 20) {
        orphanedPermitCostSample.push(`[orphan-permit] lead_id=${row.lead_id} trade=${row.trade_slug}`);
      }
    } else {
      orphanedCoaCost++;
      if (orphanedCoaCostSample.length < 20) {
        orphanedCoaCostSample.push(`[orphan-coa] lead_id=${row.lead_id} trade=${row.trade_slug}`);
      }
    }
    // Continue processing — hasNoCostData below produces NULL score; orphan counter is observability-only.
  }

  // §3 Spec 81 scoring logic — UNCHANGED post-rekey.
  // Integrity audit (HIGH-v3-C + Obs F2: gated log site at the end of stream — line 267 equivalent).
  if (row.tracking_count > 0 && row.modeled_gfa_sqm == null) {
    if (branch === 'permit') integrityFlagsPermit++;
    else                     integrityFlagsCoa++;
  }

  // NULL guard + realtor carve-out — UNCHANGED.
  const tradeValues = row.trade_contract_values;
  const isRealtor = row.trade_slug === REALTOR_TRADE_SLUG;
  const hasNoCostData = row.estimated_cost == null
    || (!isRealtor && (!tradeValues || Object.keys(tradeValues).length === 0));

  let score;
  if (hasNoCostData) {
    score = null;
    if (branch === 'permit') nullInputScoresPermit++;
    else                     nullInputScoresCoa++;
  } else {
    const tradeValue = isRealtor ? row.estimated_cost : (tradeValues[row.trade_slug] ?? 0);
    const base = Math.min(tradeValue / vars.los_base_divisor, vars.los_base_cap);
    const rawBid  = parseFloat(row.multiplier_bid);
    const rawWork = parseFloat(row.multiplier_work);
    if (row.multiplier_bid != null && !Number.isFinite(rawBid)) {
      pipeline.log.warn('[opportunity-scores]',
        `Non-finite multiplier_bid for trade ${row.trade_slug} — using global fallback`, { raw: row.multiplier_bid });
    }
    if (row.multiplier_work != null && !Number.isFinite(rawWork)) {
      pipeline.log.warn('[opportunity-scores]',
        `Non-finite multiplier_work for trade ${row.trade_slug} — using global fallback`, { raw: row.multiplier_work });
    }
    const urgencyMultiplier = row.target_window === 'bid'
      ? (row.multiplier_bid != null && Number.isFinite(rawBid) ? rawBid : vars.los_multiplier_bid)
      : (row.multiplier_work != null && Number.isFinite(rawWork) ? rawWork : vars.los_multiplier_work);

    const rawPenalty = (row.tracking_count * vars.los_penalty_tracking) + (row.saving_count * vars.los_penalty_saving);
    const decayFactor = rawPenalty / vars.los_decay_divisor;
    const raw = (base * urgencyMultiplier) / (1 + decayFactor);
    score = Math.max(0, Math.min(100, Math.round(raw)));
  }

  batch.push({ lead_id: row.lead_id, trade_slug: row.trade_slug, score, branch });

  if (batch.length >= BATCH_SIZE) {
    await flushBatch(batch);
    batch = [];
    batchCount++;
    if (batchCount % 50 === 0) {
      // Gemini LOW: "processed" not "scored" — malformed are processed but not scored.
      pipeline.log.info('[opportunity-scores]',
        `Progress: ${(totalRowsPermit + totalRowsCoa).toLocaleString()} rows scored / ${(totalRowsPermit + totalRowsCoa + totalRowsOther).toLocaleString()} processed, ${updatedPermit + updatedCoa} updated (batch ${batchCount})`);
    }
  }
}
await flushBatch(batch);
batch = [];

// HIGH-v3-C + Obs F2: pre-existing integrity_flags warn site gated INFO during quiet.
const totalIntegrityFlags = integrityFlagsPermit + integrityFlagsCoa;
if (totalIntegrityFlags > 0) {
  const msg = `Integrity audit: ${totalIntegrityFlags} tracked leads have no modeled_gfa_sqm (permit=${integrityFlagsPermit}, coa=${integrityFlagsCoa})`;
  if (inQuietPeriod) pipeline.log.info('[opportunity-scores]', msg);
  else               pipeline.log.warn('[opportunity-scores]', msg);
}
```

### Part 1.9 — Audit table emission (17 rows = 7 preserved + 10 new)

| metric | status | threshold | value-source |
|---|---|---|---|
| `records_scored` | INFO | null | `totalRowsPermit + totalRowsCoa` (MED-v3-D — exclude `totalRowsOther`) |
| `permits_in_scope_legacy_distinct_count` | INFO | null | `distinct_permits_in_scope` (legacy COUNT(DISTINCT)) per MED-v2-P |
| `records_unchanged` | INFO | null | `(totalRowsPermit + totalRowsCoa) − (updatedPermit + updatedCoa)` |
| `null_input_rate` | PASS/WARN | `== 0` | `integrityFlagsPermit + integrityFlagsCoa` (AGGREGATE intentionally — MED-v3-H pre-existing semantic) |
| `null_scores` | INFO | null | post-UPDATE SQL aggregate |
| `null_input_scores` | INFO | null | `nullInputScoresPermit + nullInputScoresCoa` |
| `out_of_range` | PASS/FAIL | `== 0` | post-UPDATE SQL aggregate |
| `forecasts_in_scope_permit` | INFO | null | SQL per-branch |
| `forecasts_in_scope_coa` | INFO | null | SQL per-branch |
| `total_rows_coa` | inQuietPeriod ? INFO : (totalRowsCoa === 0 ? WARN : INFO) | `=== 0 (post-quiet)` | streamed counter (HIGH-v3-E: note vs SQL count) |
| `coa_orphaned_cost_count` | inQuietPeriod ? INFO : (val > 0 ? WARN : PASS) | `> 0` | `orphanedCoaCost` |
| `permit_orphaned_cost_count` | inQuietPeriod ? INFO : (val > 0 ? WARN : PASS) | `> 0` | `orphanedPermitCost` |
| `lead_analytics_unmatched_permit_count` | inQuietPeriod ? INFO : (val > 0 ? WARN : PASS) | `> 0` | `permitDriftSampleCount` |
| `lead_analytics_unmatched_coa_count` | inQuietPeriod ? INFO : (val > 0 ? WARN : PASS) | `> 0` | `coaDriftSampleCount` |
| `coa_first_deploy_grace` | INFO | null | `coaFirstDeployGrace ? 1 : 0` |
| `in_quiet_period` | INFO | null | `inQuietPeriod ? 1 : 0` |
| `malformed_lead_ids` | INFO/WARN (NOT quiet-gated per MED-v3-G — mig-139 corruption-class) | `> 0` | `malformedLeadIds` |

**Total: 17 audit rows = 7 preserved + 10 new.**

### Part 1.10 — records_meta entries (19 total per CRIT-v3-Z)

**F.3-new (16 entries):**
1. `total_rows_permit`
2. `total_rows_coa`
3. `total_rows_other` (CRIT-v2-B)
4. `records_updated_permit`
5. `records_updated_coa`
6. `null_input_scores_permit`
7. `null_input_scores_coa`
8. `integrity_flags_permit`
9. `integrity_flags_coa`
10. `score_distribution_permit` (object)
11. `score_distribution_coa` (object)
12. `score_distribution_other` (object — defensive; expected empty)
13. `coa_orphaned_cost_sample_capped` (boolean)
14. `permit_orphaned_cost_sample_capped` (boolean — HIGH-J)
15. `lead_analytics_unmatched_permit_sample_capped` (boolean)
16. `lead_analytics_unmatched_coa_sample_capped` (boolean — HIGH-J extension)

**Preserved from existing skeleton (3 entries):**
17. `coa_first_deploy_grace` (boolean — mirrors audit row)
18. `in_quiet_period` (boolean — mirrors audit row)
19. `run_at` (timestamp)

**Total: 19 records_meta entries** (per Independent CRIT-v3-3 cascade fix).

### Part 1.11 — `failed_sample` (MED-v3-F proportional cap)

```js
// MED-v3-F: per-type cap before final concat ensures each error type has guaranteed visibility.
const allFailedSamples = [
  ...orphanedPermitCostSample.slice(0, 7),
  ...orphanedCoaCostSample.slice(0, 7),
  ...malformedLeadIdsSample.slice(0, 6),
].slice(0, 20);   // 7+7+6 = 20 max; safe under Spec 48 §4 cap.
const failedSample = allFailedSamples.length > 0 ? allFailedSamples : undefined;

pipeline.emitSummary({
  records_total: totalRowsPermit + totalRowsCoa + totalRowsOther,   // CRIT-v2-B §11.1
  records_new: 0,
  records_updated: updatedPermit + updatedCoa,
  ...(failedSample && { failed_sample: failedSample }),
  records_meta: { /* 19 entries */ },
});
```

### Part 1.12 — emitMeta declarations

```js
pipeline.emitMeta(
  {
    trade_forecasts:      ['lead_id', 'permit_num', 'revision_num', 'trade_slug', 'target_window', 'urgency'],
    cost_estimates:       ['lead_id', 'estimated_cost', 'trade_contract_values', 'is_geometric_override', 'modeled_gfa_sqm'],
    lead_analytics:       ['lead_key', 'tracking_count', 'saving_count'],
    trade_configurations: ['trade_slug', 'multiplier_bid', 'multiplier_work'],
    pipeline_runs:        ['pipeline', 'started_at'],
  },
  {
    trade_forecasts:      ['opportunity_score'],
  },
);
```

### Part 2 — Module-local pure helper

```js
// MODULE scope (vm sandbox requirement). Regex anchored prefix per HIGH-v1-G — handles
//   ambiguous values like 'coa:permit:123' correctly (yields 'coa').
//   Unreachable post-mig-139 CHECK '^(permit|coa):.+' on tf.lead_id; defensive null propagates.
function parseBranchFromLeadId(leadId) {
  if (typeof leadId !== 'string') return null;
  const match = leadId.match(/^(coa|permit):/);
  return match ? match[1] : null;
}
```

### Part 3 — Test scaffolding (TDD Red Light)

**Step 0 (CRIT-v2-F):** `src/tests/compute-opportunity-scores.infra.test.ts:145` — update from `maxRowsPerInsert(4)` to `(3)` as single-file diff. Standalone Execution Plan step BEFORE all other test work.

**`src/tests/compute-opportunity-scores.infra.test.ts` EXTEND** — Phase F.3 describe block (~30 tests). Key new tests:
- T01-T07: SOURCE_SQL shape (lead_id projections, ce_lead_id, JOIN keys, NULL-safe filter, no LPAD construction)
- T08-T10: parseBranchFromLeadId module-scope + regex form + 9-counter declaration block
- T11-T14: flushBatch dual-UPDATE with separate $1..$3N loops; HIGH-I post-resolve accumulation; HIGH-v3-C log gating; CRIT-v2-E probe inside lock
- T15-T18: CRIT-A probe EXISTS+sample form (symmetric branches) + `at least N (sample capped at 50)` log wording
- T19: malformed_lead_ids WARN status NOT quiet-gated (MED-v3-G corruption-class doc test)
- T20: 17 audit rows present
- T21: LEGACY `permits_in_scope_legacy_distinct_count` present
- T22: 19 records_meta entries (CRIT-v3-Z count)
- T23: `records_total = Permit + Coa + Other`; `records_scored = Permit + Coa` only (MED-v3-D)
- T24-T27: emitMeta declarations; conditional spread for failed_sample; per-type proportional cap (MED-v3-F)
- T28-T29: empty-batch guard + integrity log gating site
- T30: Negative grep: zero `permit_lead_id`, zero `LPAD(tf.revision_num`

**`src/tests/compute-opportunity-scores.logic.test.ts` NEW** — ~6 tests via vm sandbox for `parseBranchFromLeadId` edge cases (permit, coa, null, '', garbage, `coa:permit:123` ambiguity-safety).

**`src/tests/db/compute-opportunity-scores.db.test.ts` NEW (CRIT-v3-X correct path; CRIT-v3-Y inline constant; HIGH-v3-A complete seeds; HIGH-v3-B per-trade + global-fallback paths; HIGH-v3-D pipeline_runs hermeticity):**

```ts
// SPEC LINK: docs/specs/01-pipeline/81_opportunity_score_engine.md §3
// Run: BUILDO_TEST_DB=1 npm run test:db
import { dbAvailable, getTestPool } from './setup-testcontainer';

describe.runIf(dbAvailable)('compute-opportunity-scores — CoA end-to-end (CRIT-v2-A)', () => {
  let pool;
  beforeAll(async () => {
    pool = await getTestPool();
    // HIGH-v3-D: clear pipeline_runs for hermeticity
    await pool.query(`DELETE FROM pipeline_runs WHERE pipeline = 'permits:compute_opportunity_scores'`);
    // HIGH-v3-A: clear trade_configurations for 'framing' to force global fallback (test 1)
    await pool.query(`DELETE FROM trade_configurations WHERE trade_slug = 'framing'`);
    // Seed logic_variables (some may already be migration-seeded; UPSERT for safety)
    await pool.query(`
      INSERT INTO logic_variables (variable_key, variable_value) VALUES
        ('los_base_divisor', 10000),
        ('los_base_cap', 30),
        ('los_multiplier_bid', 2.5),
        ('los_multiplier_work', 1.5),
        ('los_penalty_tracking', 50),
        ('los_penalty_saving', 10),
        ('los_decay_divisor', 25),
        ('score_tier_elite', 80),
        ('score_tier_strong', 50),
        ('score_tier_moderate', 20)
      ON CONFLICT (variable_key) DO UPDATE SET variable_value = EXCLUDED.variable_value
    `);
  });

  it('CRIT-v2-A — CoA lead w/ global multiplier fallback produces score=3 per asymptotic decay', async () => {
    // Seed: CoA forecast + cost_estimates + lead_analytics (1 tracker, 0 savers)
    // target_window='bid' explicit (HIGH-v3-A); trade_configurations.framing absent → global fallback
    const leadId = 'coa:F3TEST001';
    await pool.query(`INSERT INTO coa_applications (application_number, lead_id, status) VALUES ('F3TEST001', $1, 'Approved') ON CONFLICT DO NOTHING`, [leadId]);
    await pool.query(`
      INSERT INTO trade_forecasts (lead_id, trade_slug, target_window, urgency, opportunity_score)
      VALUES ($1, 'framing', 'bid', NULL, NULL) ON CONFLICT (lead_id, trade_slug) DO NOTHING
    `, [leadId]);
    await pool.query(`
      INSERT INTO cost_estimates (lead_id, estimated_cost, trade_contract_values)
      VALUES ($1, 200000, '{"framing": 30000}') ON CONFLICT (lead_id) DO NOTHING
    `, [leadId]);
    await pool.query(`
      INSERT INTO lead_analytics (lead_key, tracking_count, saving_count)
      VALUES ($1, 1, 0) ON CONFLICT (lead_key) DO NOTHING
    `, [leadId]);

    // Run script via direct require + invocation (lighter than spawn — established pattern in setup-testcontainer.ts)
    // Or: execSync('node scripts/compute-opportunity-scores.js') with DATABASE_URL pointing at testcontainer.
    await runScriptInline('compute-opportunity-scores');

    // CRIT-v3-Y: inline pen-and-paper expected.
    // base = min(30000/10000, 30) = 3; multiplier = los_multiplier_bid = 2.5 (global fallback);
    // rawPenalty = 1*50 + 0*10 = 50; decayFactor = 50/25 = 2; raw = 3*2.5/(1+2) = 2.5;
    // Math.round(2.5) === 3 (half-away-from-zero); clamp(0..100) = 3.
    const { rows } = await pool.query(
      `SELECT opportunity_score FROM trade_forecasts WHERE lead_id = $1`, [leadId],
    );
    expect(rows[0].opportunity_score).toBe(3);
  });

  it('HIGH-v3-B — Per-trade multiplier path: trade_configurations override produces score=4', async () => {
    // Seed a trade_configurations override for 'framing'
    await pool.query(`
      INSERT INTO trade_configurations (trade_slug, multiplier_bid, multiplier_work)
      VALUES ('framing', 3.0, 1.5) ON CONFLICT (trade_slug) DO UPDATE SET multiplier_bid = 3.0
    `);
    const leadId = 'coa:F3TEST002';
    // Same seed pattern as test 1
    await seedCoaForecast(pool, leadId, 'framing', 200000, { framing: 30000 }, 1, 0, 'bid');
    await runScriptInline('compute-opportunity-scores');

    // base = 3; multiplier = 3.0 (per-trade override); rawPenalty = 50; decayFactor = 2;
    // raw = 3*3.0/3 = 3.0; round(3.0) = 3. (Different inputs would yield different scores;
    //  this asserts the JOIN path was exercised — multiplier 3.0 not 2.5.)
    // Stronger assertion: spy on the actual multiplier used via INFO log inspection
    //  OR compute with different inputs producing a distinct value.

    // For this test, use higher cost to produce distinct outcome:
    await pool.query(`UPDATE cost_estimates SET trade_contract_values = '{"framing": 50000}' WHERE lead_id = $1`, [leadId]);
    await runScriptInline('compute-opportunity-scores');
    // base = min(50000/10000, 30) = 5; multiplier = 3.0; raw = 5*3.0/3 = 5; score = 5.
    // If global fallback had fired: raw = 5*2.5/3 = 4.17, score = 4.
    const { rows } = await pool.query(`SELECT opportunity_score FROM trade_forecasts WHERE lead_id = $1`, [leadId]);
    expect(rows[0].opportunity_score).toBe(5);   // Per-trade path: 5. Global-fallback path would be: 4.
  });
});
```

(Helper functions `runScriptInline()` + `seedCoaForecast()` defined inline at file top.)

### Part 4 — Spec amendments + Runbook

(Spec text — F.3 DELIVERED notes with `[F.3-COMMIT]` placeholders.)

**Runbook `## Phase F.3 additions`** — 10 new audit rows + 19 records_meta entries + 5 Operator FAQ entries:
- Q1: `permits_in_scope_legacy_distinct_count` vs `forecasts_in_scope_permit` semantic
- Q2: Day-0 `total_rows_coa = 0` interpretation
- Q3: Quiet-period `coa_orphaned_cost_count > 0` (R5.5 ramp normal)
- Q4: Day-31 simultaneous WARN-flip — **5 metrics** (Obs F7): `coa_orphaned_cost_count`, `permit_orphaned_cost_count`, `lead_analytics_unmatched_permit_count`, `lead_analytics_unmatched_coa_count`, `total_rows_coa`
- Q5: `records_total ≠ total_rows_permit + total_rows_coa` (Obs F8 — off by `total_rows_other`)
- Q6: `total_rows_coa` audit row vs `forecasts_in_scope_coa` divergence (HIGH-v3-E)

---

## Standards Compliance

§2 try-catch / unhappy-path ✓ | §3 Add-Backfill-Drop N/A | §3.2 pagination ✓ | §6 logError N/A | §9.1 transactions ✓ | §9.2 BATCH_SIZE 21000 (3% margin) | §9.3 idempotent ✓

---

## Spec 47 §R1-R12 Compliance

§R2 lock 81 ✓ | §R3.5 RUN_AT ✓ | §R4 Zod unchanged ✓ | §R5 startup ✓ | §R6 lock ✓ | §R7 streamQuery ✓ | §R8 pure helper ✓ | §R9 atomic dual-UPDATE ✓ | §R10 verdict cascade ✓ | §R11 emitMeta ✓ | §R12 skip ✓ | §11.1 records_total = `totalRowsPermit + totalRowsCoa + totalRowsOther` ✓ | §14 INTEGER score; probe observational ✓

---

## Spec 48 Pipeline Observability Adherence

§3.1 audit_table: **17 rows = 7 preserved + 10 new**
§3.2 records_meta: **19 entries = 16 F.3-new + 3 preserved from skeleton** (CRIT-v3-Z)
§3.4 baseline-quiet-period: 5 WARN-gated metrics on `!inQuietPeriod`; `malformed_lead_ids` NOT gated (mig-139 corruption-class per MED-v3-G)
§3.5 emitSummary: single emit on success
§4 failed_sample: per-type proportional cap (7+7+6 → 20) per MED-v3-F

---

## Pre-Review Self-Checklist (35 items)

(a)-(h) SOURCE_SQL shape + helper at module scope + BATCH_SIZE 21000 margin
(i)-(l) flushBatch dual-UPDATE; per-branch counters; HIGH-I post-resolve accumulation; deploy-age slug
(m)-(p) `!inQuietPeriod` gating: `coa_orphaned_cost`, `permit_orphaned_cost`, both `lead_analytics_unmatched_*`, AND `pipeline.log.warn` symmetric (HIGH-v3-C) including pre-existing integrity_flags site (Obs F2)
(q) `total_rows_coa` threshold + WARN-when-zero post-quiet (HIGH-v2-N functional CRIT-C)
(r) `malformed_lead_ids` WARN immediately, NOT quiet-gated (MED-v3-G corruption-class doc)
(s) `failed_sample` per-type proportional cap (7+7+6 then 20) — MED-v3-F
(t) `records_total = Permit + Coa + Other` (CRIT-v2-B); `records_scored = Permit + Coa` only (MED-v3-D)
(u) emit-site arithmetic (no aliased `totalRows` local) — HIGH-K
(v) emitMeta reads include `pipeline_runs`; cost_estimates lists lead_id; opportunity_score NOT in trade_forecasts reads
(w)-(x) writes unchanged; realtor carve-out + NULL guard + asymptotic decay UNCHANGED
(y) `IS DISTINCT FROM v.score` on BOTH per-branch UPDATEs
(z) Zero `permit_lead_id` references
(aa) LEGACY `permits_in_scope_legacy_distinct_count` row emitted; chain.logic.test.ts:1367 `toContain('permits_in_scope')` PASSES via substring match
(bb) New `forecasts_in_scope_permit/_coa` rows have COUNT(*) semantic
(cc) CRIT-A probe reads only declared tables
(dd) CRIT-A probe INSIDE lock callback, AFTER final flushBatch, BEFORE emitSummary
(ee) `records_scored` emit-site uses inline sum
(ff) Stream-loop scoring logic matches Spec 81 §3 (asymptotic decay + realtor carve-out + NULL guard)
(gg) **17 audit rows = 7 preserved + 10 new** (CRIT-v2-D recount)
(hh) **19 records_meta entries = 16 F.3-new + 3 preserved** (CRIT-v3-Z recount)
(ii) `let batchCount = 0` declared (LOW-v3-H)
(jj) `null_input_rate` aggregate intentionally (MED-v3-H — pre-existing scope)
(kk) Progress log says "scored / processed" (Gemini LOW)
(ll) Probe log "at least N (capped at 50)" wording (Gemini NIT)
(mm) Day-31 FAQ Q4 enumerates exactly 5 metrics (Obs F7)
(nn) DB test in correct directory `src/tests/db/` (CRIT-v3-X); imports `./setup-testcontainer`
(oo) DB test asserts inline pen-and-paper constants, NOT formula-recomputation (CRIT-v3-Y)
(pp) DB test seeds `target_window='bid'` + clears `trade_configurations.framing` for fallback (HIGH-v3-A)
(qq) DB test has both global-fallback AND per-trade-override variants (HIGH-v3-B)
(rr) DB test `beforeAll` clears `pipeline_runs` for hermeticity (HIGH-v3-D)
(ss) Naming consistency: `permit_orphaned_cost_sample_capped` (NIT-v2-DD, NOT `_count_sample`)
(tt) Operator FAQ Q5 records_total ≠ 2-term sum (Obs F8)

---

## Execution Plan

- [ ] **Step 0 (CRIT-v2-F):** Update `src/tests/compute-opportunity-scores.infra.test.ts:145` from `maxRowsPerInsert(4)` to `(3)` as single-file diff. Standalone commit.
- [ ] **Contract Definition:** N/A
- [ ] **Spec & Registry Sync:** Update Spec 81 §2.1, Spec 42 §6.11, Spec 84 §7. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A
- [ ] **Test Scaffolding:** Author 3 NEW + extend 1 file (~30 infra + 6 logic + 2 db-infra calc tests). Confirm failures.
- [ ] **Red Light:** `npx vitest run` + `BUILDO_TEST_DB=1 npm run test:db`. Confirm.
- [ ] **Implementation:** Implement per Part 1 + Part 2.
- [ ] **Auth Boundary & Secrets:** N/A
- [ ] **Pre-Review Self-Checklist:** Walk 35 items. PASS/FAIL.
- [ ] **Runbook authorship:** `## Phase F.3 additions` with 5 Operator FAQ entries.
- [ ] **Multi-Agent Review (4 reviewers — diff stage):** Gemini + DeepSeek + Independent + Observability worktrees.
- [ ] **Triage:** BUG → fix; DEFER → `review_followups.md`.
- [ ] **Green Light:** `npm run verify` + `BUILDO_TEST_DB=1 npm run test:db`.
- [ ] **chain.logic.test.ts verification:** `npx vitest run src/tests/chain.logic.test.ts`.
- [ ] **WF6 close-out:** `feat(81_opportunity_score_engine): WF1 Phase F.3 — compute-opportunity-scores.js lead_id rekey + CoA consumer + per-branch records_meta + 10 new audit rows + dual-emit legacy permits_in_scope_legacy_distinct_count`. Tiny docs follow-up `docs(81_opportunity_score_engine): WF1 Phase F.3 close-out`.

---

## Risk Register

1. **Single SOURCE_SQL** — F.3 reads from already-UNIONed trade_forecasts.
2. **Per-branch UPDATE split + retry safety** — HIGH-I + HIGH-J pattern; tested.
3. **No new logic_variables** — Decay constants apply to both branches identically.
4. **Orphan WARN on 30-day quiet** — HIGH-v2-H + R5.5 ramp dependency.
5. **Chain coverage (HIGH-K verified)** — compute_opportunity_scores in permits chain step 26; F.1 writes CoA forecasts to same table.
6. **Realtor carve-out untouched** — Spec 81 §3.
7. **Dual-emit `permits_in_scope_legacy_distinct_count` for 1 cycle** — CRIT-B + MED-P.
8. **CRIT-F + HIGH-J orphan via `ce.lead_id`** — F.2 lesson pre-emptive; symmetric.
9. **HIGH-v2-O slug hardcoding** — DEFERRED to separate hardening WF.
10. **Gemini LOW (regex vs startsWith)** — false-positive against own v1 fold; regex preserved.
11. **CRIT-v2-A real DB integration test scope addition** — adds 2 tests + setup-testcontainer dependency. CRIT-v3-X + Y + HIGH-A + D folds make it functional.
12. **CRIT-v3-Z records_meta count cascade** — 19 (NOT 16) per Independent CRIT-v3-3.
13. **flushBatch error contract (Gemini v3 CRIT-A — verified mitigated)** — withTransaction propagates errors → rollback → pipeline.run emits failed summary. NO silent loss.

---

> **PLAN LOCKED v4 — AUTHORIZED FOR IMPLEMENTATION.**
> §10 note: v4 applies all 23 v3 real folds per user PLAN LOCK direct authorization. Trajectory: v1=30 → v2=31 → v3=33 (plateaued same pattern as F.2 v3 at 28 findings — most v3 findings were 2nd-order effects of v2/v3 folds in the integration-test scaffolding, not core script logic). NO further plan-stage reviewer round; diff-stage 4-reviewer round runs after Green Light per user mandate.
