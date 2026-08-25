# Active Task: WF3 — compute-cost-estimates permit-side returns cost_source='none' for 100% of permits
**Status:** Planning
**Domain Mode:** Backend/Pipeline
**Trigger:** Spec 79 §7 walkthrough Cycle 3 (post-WF1) revealed `permits:compute_cost_estimates` produces `cost_source='none'` + `estimated_cost=NULL` for 100% of ~248K permits in production. `assert_entity_tracing` step 27 FAIL (opportunity_score 0% coverage) + `assert_global_coverage` step 28 FAIL (6 cost_estimates.* columns at 9.2% coverage threshold <90%). Pre-existing regression NOT caused by today's WF1 #parcel-address-bridge work — the cost wipe predates this session by 4+ hours (cost_computed_at=2026-05-23T01:53:05 UTC).

## Context
* **Goal:** Restore `compute-cost-estimates` writes for the permit cohort so the cost_estimates table actually contains `estimated_cost` values for ≥80% of permits. CoA cohort is unaffected (100% populated).
* **Target Spec:** `docs/specs/01-pipeline/83_lead_cost_model.md` (Surgical Estimation Engine — Brain + Muscle architecture)
* **Supporting Specs:** Spec 80 §5 (permit_type_class taxonomy — 'construction' is the gate), Spec 79 §7 (validation walkthrough)
* **Key Files:**
  - `scripts/compute-cost-estimates.js` — the "Muscle" (data orchestration + UPSERT)
  - `src/features/leads/lib/cost-model-shared.js` — the "Brain" (cost computation logic with 4 short-circuit branches to `cost_source='none'`)
  - `scripts/seeds/scope_intensity_matrix.json` — the rate-table data
  - `scripts/seeds/trade_sqft_rates.json` — per-trade base rates
* **Rollback Anchor:** HEAD `dcaaee9` (Cycle 3 §7a Inspector spot-check post-WF1)

## State Verification (what's known vs assumed)

**Known (verified via direct DB query):**
- `cost_estimates`: 248,429 permit rows, 0 with `estimated_cost` value. 25,288 CoA rows, 100% with value.
- All today's runs (chain run 3348) processed 248,571 permits → 124 inserts, 0 updates, 248,435 skipped-unchanged (IS DISTINCT FROM (NULL, NULL) = no-op).
- Don Mills sample (`permit:99 252008 BLD:00`): `cost_source='none'`, `estimated_cost=null`, but `complexity_score=45` was computed AND inputs are complete (parcel.lot_size_sqm=3004.84, building footprint_area_sqm=769.15, primary_storeys=8, permit_type='Building Additions/Alterations', structure_type='Apartment Building', 9 active trades).
- Historical model_coverage_pct: 88.8% on 2026-05-20 (run 3311), 83-87% on 2026-05-08. Today's run: 0.0%.
- Last run with non-zero writes: id 3151 on 2026-05-09 (8,740 updates). Every run since: 0 updates.
- Cycle 2 commit `56ebce1` (2026-05-22) claimed "243 inserts + 21,749 updates + 0 failed_rows" in its commit message but the pipeline_runs records show 0 updated_at runs between 3151 and 3348.

**Assumed (needs verification):**
- Cost wipe at 2026-05-23T01:53:05 UTC — origin script/cron unknown.
- Which of the 4 `cost_source='none'` short-circuit branches in `cost-model-shared.js` (lines 47, 133, 221, 343) fires for Don Mills. Hypothesis ranking:
  1. **`COST_SLICING_CLASS = 'construction'` gate** (line 133/47) — if `permit_type_class != 'construction'` for the Don Mills permit, the Brain short-circuits IMMEDIATELY. The SQL uses `COALESCE(ptc.class, 'unclassified')` so a missing `permit_type_classifications` row would route to 'unclassified' and trigger this.
  2. **Scope intensity matrix miss** (line 221) — if `(permit_type, structure_type)` isn't in `scope_intensity_matrix`, areaEff=null → `none`.
  3. **`surgicalTotal === 0` Zero-Total Bypass** (line 343) — sum of per-trade values came out to 0.
  4. **Other** (per-trade rates table empty, etc.)

## Technical Implementation

### Phase A — Investigation (READ-ONLY, no code changes; this phase IS reviewed/approved before any fix)

**A.0 [F1, F10, G1 — fold] Wipe-origin forensics (PRIORITY 1):**
   - **[G1 — widened window 01:30-02:00 UTC]** `SELECT pipeline, started_at, completed_at, status, records_total, records_new, records_updated, (records_meta->'audit_table'->>'verdict') AS verdict FROM pipeline_runs WHERE started_at BETWEEN '2026-05-23T01:30:00Z' AND '2026-05-23T02:00:00Z' ORDER BY started_at` — identify which script ran around the 01:53:05 cost_computed_at anchor (30-min window catches long-running scripts that started before 01:50).
   - **[G1 — out-of-band DML check]** `SELECT query, calls, rows, last_exec FROM pg_stat_statements WHERE query ILIKE '%cost_estimates%' AND (query ILIKE '%UPDATE%' OR query ILIKE '%DELETE%' OR query ILIKE '%TRUNCATE%') ORDER BY last_exec DESC LIMIT 20` — covers ad-hoc SQL sessions, migrations, manual scripts. **Note:** if `pg_stat_statements` extension is not installed, document that the out-of-band vector cannot be ruled out — treat as open hypothesis.
   - `git log --after="2026-05-09" --before="2026-05-23" --oneline -- scripts/compute-cost-estimates.js src/features/leads/lib/cost-model-shared.js scripts/seeds/scope_intensity_matrix.json scripts/seeds/trade_sqft_rates.json migrations/` — date-bracket which commits touched relevant files between the last known good run (2026-05-09 run 3151) and now.
   - Git diff commit `56ebce1` (WF3 #16) against the prior version of `compute-cost-estimates.js` and `cost-model-shared.js` — specifically inspect the IS DISTINCT FROM WHERE clause + the SOURCE_SQL CTE structure for changes that could explain "no updates since 2026-05-09 despite claimed 21,749 in commit message."

**A.1 Seed/lookup table state (DB-side):**
   - `permit_type_classifications`: `SELECT class, COUNT(*) FROM permit_type_classifications GROUP BY class` — does the table have rows and what classes exist.
   - `permit_type_classifications` JOIN yield [F4 — fold]: `SELECT COALESCE(ptc.class, 'unclassified') AS resolved_class, COUNT(*) AS permits FROM permits p LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type GROUP BY 1` — what fraction of permits resolve to 'construction' vs 'unclassified' vs other.
   - `scope_intensity_matrix`: `SELECT COUNT(*) FROM scope_intensity_matrix; SELECT permit_type, structure_type FROM scope_intensity_matrix LIMIT 10`.
   - `scope_intensity_matrix` whitespace [F3 — fold; row 432 known deferred bug]: `SELECT permit_type, structure_type FROM scope_intensity_matrix WHERE permit_type != TRIM(permit_type) OR structure_type != TRIM(structure_type)` — if ANY row has trailing whitespace, the Muscle's `.toLowerCase()`-only key (lines 268-272) would mismatch the Brain's `.trim()` normalization (line 243), causing 100% matrix miss.
   - `trade_sqft_rates`: `SELECT COUNT(*) FROM trade_sqft_rates; SELECT trade_slug, base_rate_sqft FROM trade_sqft_rates ORDER BY trade_slug`.

**A.2 Run the actual SOURCE_SQL [F3 — fold]:**
   - Execute the production `SOURCE_SQL` from `compute-cost-estimates.js` lines ~70-130 with `WHERE p.permit_num = '99 252008 BLD' AND p.revision_num = '00'` and inspect the raw row returned to the Brain. Verify all required fields (permit_type, structure_type, permit_type_class, lot_size_sqm, footprint_area_sqm, active_trade_slugs) are populated correctly. **DO NOT bypass the Muscle's SQL** — the bug may be in the JOIN, not in the Brain.
   - **[G2 — fold] Explicit fall-through:** if A.2 returns a row with `permit_type_class='unclassified'` for a permit with a known-construction `permit_type` (e.g., 'Building Additions/Alterations'), **root cause is confirmed as the permit_type_class gate**. Proceed immediately to A.1's JOIN-yield query for calibration data. Phase B fix is a SQL `LOWER()`/`TRIM()` normalization in the `permit_type_classifications` JOIN predicate at Muscle line ~132 OR a DML case-normalization of `permit_type_classifications.permit_type` rows. Serialize the A.2 row as a JSON fixture for the regression test.

**A.3 Direct Brain invocation (only AFTER A.2 confirms inputs):**
   - Build a small Node script that imports `estimateCostShared` from `src/features/leads/lib/cost-model-shared.js` AND **[G4 — fold] loads the same DB configs the Muscle uses via `loadMarketplaceConfigs(pool, 'compute-cost-estimates')`** to get `logicVars` + `tradeConfigs`. Without this, Brain results may diverge from production due to missing config.
   - Call `estimateCostShared` with the row tuple produced by A.2 (live DB row for forensic-only invocation; the regression test below uses the JSON-serialized fixture from A.2 for stability).
   - Add temporary `console.log` at each `cost_source='none'` branch in the Brain to identify exactly which branch fires. **[DeepSeek LOW — fold] Log only branch-decision fields** (`permit_type_class`, `areaEff`, `surgicalTotal`) — NEVER log raw row objects (may contain PII per Spec 47 §8.6).

**A.4 New-permits sub-check [Gemini LOW — fold]:**
   - The chain inserted 124 new permits today. Query `SELECT * FROM cost_estimates WHERE lead_id IN (SELECT 'permit:'||p.permit_num||':'||p.revision_num FROM permits p WHERE p.created_at::date = CURRENT_DATE) LIMIT 5` — confirm whether the 124 NEW permits also got `cost_source='none'` on their first cost computation today (i.e., the regression is not specific to pre-existing rows).

**A.5 Diff today vs 2026-05-09:**
   - For 5 sample permits that were updated in run 3151 (2026-05-09, the last good run), compare today's input row shape vs the historical input row shape (via row_history audit if available, otherwise via permits.last_seen_at trace).

**Phase A HALT — write `docs/reports/wf3-cost-model-none.md` with findings + hypothesis confirmation; user authorizes Phase B before any code changes.**

### Phase A non-Brain escape hatch [F9, F12, G3 — fold]

If Phase A reveals the root cause is OUTSIDE the Brain (e.g., a cron/migration wiped data; a SQL JOIN issue in the Muscle; a schema-level concern), **Phase B is CANCELED in this active_task and a new active_task is created** for the discovered cause. The scope of this WF3's Phase B.1 (root-cause fix) is limited to:
   - (i) Code fix ≤ 5 lines in `cost-model-shared.js` OR `compute-cost-estimates.js`, OR
   - (ii) Re-seed of `scope_intensity_matrix` / `trade_sqft_rates` from existing JSON seed file, OR
   - (iii) DML backfill of `permit_type_classifications.class` from canonical source.

   ANY required new SQL migration is OUT OF SCOPE and becomes a separate active_task.

**[G3 — fold] LOC ceiling clarification:** The ≤5 LOC ceiling applies ONLY to Phase B.1 (root-cause fix). Phase B.2 (observability hardening: OB-1 through OB-5 + matrix_miss/zero_total counters) is SEPARATELY SCOPED at an estimated 20-35 LOC across the same file (`compute-cost-estimates.js`). Combined B.1 + B.2 commit may be 25-40 LOC total. The 5-LOC ceiling exists to prevent B.1 scope creep, not to constrain the observability additions which are correctly scoped to the same diff for review-coherence reasons.

### Phase B — Fix + Observability gates (gated by Phase A; scope narrows once root cause known)

**B.1 Fix the root cause** per scope-boundary rule above.

**B.2 [F6, G5, G6, G7 — fold; OB-1 through OB-5 BLOCKING]** Observability hardening to prevent the next 14-day silent regression:
   - **OB-1:** Replace parallel-boolean verdict at `compute-cost-estimates.js` line 495 with row-derived cascade per Spec 48 §3.6: `rows.some(r => r.status === 'FAIL') ? 'FAIL' : rows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS'`.
   - **OB-2:** Escalate `model_coverage_pct` audit row to FAIL when `modelCoveragePct === 0` (currently WARN-only ceiling). Combined with OB-1, this halts the chain on a complete-zero regression. Use `Number.isFinite(modelCoveragePct)` guard so NaN/undefined evaluates to FAIL, not silently bypass.
   - **OB-3a [G5 — threshold anchored]:** Add new audit row `permit_type_class_skipped_pct` (the existing `permitTypeClassSkipped` counter / processed). FAIL threshold = `MAX(historical_baseline_pct + 10pp, 90%)` — calibrated from A.1 JOIN-yield output, NOT pre-declared. 90% is the floor.
   - **OB-3b [G6 — fold]:** Add `matrix_miss_pct` audit row (existing `matrixMisses` counter / processed) with same calibration pattern as OB-3a — FAIL threshold anchored against A.1 / historical baseline data.
   - **OB-3c [G6 — fold]:** Add `zero_total_bypass_pct` audit row (existing `zeroTotalBypasses` counter / processed) with same calibration pattern.
   - **OB-5 [G7 — extended]:** Add new audit row `table_with_value_count` — `SELECT COUNT(*) FROM cost_estimates WHERE lead_id LIKE 'permit:%' AND estimated_cost IS NOT NULL`. INFO-only with no threshold; allows observe-chain.js's 7-day DeepSeek baseline to detect drops. **[G7 — fold]** Also emit companion `table_with_value_pct` (the ratio with NULLIF guard) for corpus-growth-normalized signal. **Placement:** post-stream, before `pipeline.emitSummary`, in a best-effort `try/catch` wrapper (per the existing data_quality_snapshots pattern at line ~428). **Index check:** verify `cost_estimates.lead_id` btree supports the `LIKE 'permit:%'` prefix range scan — fallback to seqscan acceptable on 273K rows.

**B.3 [F7 — fold; OB-4]** NULL-to-NULL trap mitigation: after the Phase B fix lands and a chain run completes, verify whether any subset of rows remain `estimated_cost=NULL AND cost_source='none'`. Those rows are silently skipped by IS DISTINCT FROM (NULL, NULL)=false. If >0% of permits are stuck, document as a follow-up (the WHERE clause needs a `(EXCLUDED.estimated_cost IS NOT NULL OR cost_estimates.estimated_cost IS NULL AND cost_source IS DISTINCT FROM EXCLUDED.cost_source)` extension OR explicit force-recompute path).

### Database Impact

- READ-only Phase A: NO writes.
- Phase B: TBD by root cause. If a seed table needs re-seeding, that's a controlled DML against ≤2K-row tables (no migration). If the cost_estimates table needs back-population, that's a single `compute-cost-estimates` re-run with the fix applied (idempotent via existing UPSERT). Schema migrations are EXCLUDED — see scope-boundary rule above.

## Standards Compliance

* **Try-Catch Boundary:** N/A (no API routes touched). Pipeline scripts use the existing `pipeline.run` wrapper which has its own boundary.
* **Unhappy Path Tests:** Phase A direct-invocation script must handle the case where `estimateCostShared` itself throws. A new regression test will lock the fix once root-caused: `cost-model-shared.regression.test.ts` asserting that a known-good input row produces a non-null `estimated_cost` (so silent NULL writes are caught).
* **logError Mandate:** N/A.
* **UI Layout:** N/A.
* **Spec 47 §12 self-review:** mandatory pre-Green-Light walk per Backend/Pipeline domain rules.
* **Idempotency:** `compute-cost-estimates` UPSERT pattern unchanged; fix preserves existing IS DISTINCT FROM guards. Re-running the fixed script is safe.

## Execution Plan (WF3)

- [x] **Rollback Anchor:** HEAD `dcaaee9` recorded above. Validation branch `auto-unblock/validation-2026-05-23` already active. **[F12 — fold] Note:** `dcaaee9` post-dates the 2026-05-23T01:53:05 UTC wipe vector. The anchor is AFTER the regression, not before. Used as code-state anchor only; not as data-state anchor.
- [x] **State Verification:** Phase A above documents the verified state.
- [x] **Spec Review:** Spec 83 §3 (Brain logic), §3.A (geometric override path), Spec 80 §5 (permit_type_class taxonomy) — read.
- [x] **Multi-Agent PLAN Review (4 reviewers — COMPLETED 2026-05-23):** Independent + Observability + Gemini Pro + DeepSeek-R1. 12 REAL findings folded (F1-F12 inline above). Mandatory observability fixes (OB-1 through OB-5) added to Phase B.
- [ ] **User Authorization** ("PLAN LOCKED v2 (post-fold). Authorize? y/n") — gated on this revised plan.
- [ ] **Phase A Investigation:** execute A.0 → A.5 above. Document findings in `docs/reports/wf3-cost-model-none.md`. **HALT for user authorization on the discovered root cause + proposed Phase B fix before touching code.**
- [ ] **Phase A escape hatch:** if Phase A reveals non-Brain root cause per scope-boundary rule, Phase B is CANCELED in this WF3 and a new active_task is created. No code changes happen in this WF3.
- [ ] **Reproduction test [F2 — fold; reordered]:** AFTER Phase A reveals which short-circuit branch fires, write a vitest unit test `cost-model-shared.regression.test.ts` constructed with the EXACT input vector that provokes the discovered branch. Use a hardcoded fixture (not live DB row per DeepSeek MED) for stability. Must FAIL on the current main.
- [ ] **Red Light:** Run the new test. MUST fail. Document the failure mode.
- [ ] **Phase B Fix:** narrow-scope per root cause + per scope-boundary rule. NO inline edits without this active_task.md gate.
- [ ] **Phase B Observability gates [F6 — fold]:** OB-1 + OB-2 + OB-3 + OB-5 mandatory in the same diff as the root-cause fix (NOT separate commits). OB-4 verified post-fix.
- [ ] **Idempotency Check:** confirm fix preserves UPSERT + IS DISTINCT FROM contract.
- [ ] **Pre-Review Self-Checklist (5 sibling bugs):**
  1. Does the same Brain short-circuit apply to CoA cost estimates (Spec 83 §3.A geometric path)? CoA shows 100% populated — likely NO, but verify.
  2. Are there other pipeline scripts that depend on `cost_estimates.estimated_cost` being non-NULL? (compute_opportunity_scores already FAILs as cascade — anything else?)
  3. Does the Phase 2d link-parcels Strategy 1a address_points_exact match path interact with cost model inputs? (lot_size still 94.4% populated for bridge matches — likely independent.)
  4. Is there a similar silent-write-zero pattern in other compute scripts (`compute-trade-forecasts`, `compute-phase-calibration`)? The Cycle 2 audit_table.verdict-vs-table-state mismatch is the procedure failure mode — applies broadly.
  5. Does any cron/scheduled job re-run `compute-cost-estimates` separately from the chain orchestrator (could be the 2026-05-23T01:53:05 wipe vector)? [Now A.0 query covers this.]
- [ ] **Independent IMPL Review:** code-reviewer agent (`feature-dev:code-reviewer`, isolation: worktree) reviews the diff against the spec + Phase A findings. Adversarial Gemini + DeepSeek included this time given the procedure history.
- [ ] **Production-Data Verification (mandatory, replaces audit_table.verdict trust) [F8 — fold, threshold tightened]:** AFTER the fix, execute the verification SQL `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL) / COUNT(*), 1) FROM cost_estimates WHERE lead_id LIKE 'permit:%'`. Result MUST be ≥ **83%** (historical floor from 2026-05-08 range, not the soft 80% threshold). If audit_table.verdict says PASS but table state still shows <83%, the fix is rejected.
- [ ] **NULL-to-NULL trap verification [F7 — fold]:** `SELECT COUNT(*) FROM cost_estimates WHERE lead_id LIKE 'permit:%' AND estimated_cost IS NULL AND cost_source = 'none'` — distinguish "legitimately none" (matrix miss for vacant land) from "silently stuck at NULL". Document the ratio.
- [ ] **§7 Walkthrough Re-Pass:** re-run permits chain. `compute_cost_estimates`, `assert_data_bounds`, `assert_entity_tracing`, `assert_global_coverage` must all return PASS (or WARN at worst, no FAIL).
- [ ] **Durability [F11 — fold]:** commit the production-data verification SQL into `docs/runbook/pipeline_step_validation_walkthrough.md` as a step-14 C8 evidence query so it survives this WF3 and runs on every future walkthrough cycle.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. WF6 final commit.

## Risk Acknowledgment (procedure history)

The previous "fix" (commit `56ebce1`, WF3 #16) produced clean audit_table with PASS verdict but zero production effect on cost_estimates table state. The retrospective adversarial review certified it as "no REAL findings introduced" because it accepted audit_table verdict as evidence rather than verifying production data. **This active task's verification criterion is production data, not audit_table.verdict.** The lesson `feedback_db_integration_tests.md` mandates this; the WF3 #16 cycle did not apply it.

> **PLAN LOCKED v3 (post second 4-reviewer fold). Do you authorize this WF3 plan? (y/n)**
> §10 note: 2 rounds of adversarial PLAN review completed. v1→v2 folded 12 findings (F1-F12). v2→v3 folded 4 critical (G1-G4) + 4 high (G5-G8) findings. 11 lower-priority items deferred to `review_followups.md` rows 337-347. The investigation-first split is documented; mandatory observability gates B.2 (OB-1, OB-2, OB-3a/3b/3c, OB-5+ratio) cover all 3 short-circuit paths to prevent next-time silent regression. Verification threshold ≥83% with adjustability clause folded. A.0 forensics now cover 30-min window + out-of-band DML via pg_stat_statements. A.3 loads logicVars + tradeConfigs to avoid false hypothesis. 5-LOC ceiling explicitly applies to B.1 only; B.2 separately scoped at 20-35 LOC.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
