# Queued: WF1 Phase E.2 — Consumer Wiring + Persisted Columns + Downstream `lead_id` Guards

**Status:** Queued (awaiting Phase E.1 commit)
**Workflow:** WF1 (consumer wiring + DB migration + downstream guard hardening)
**Parent:** Spec 42 §6.11 Phase E — E.2 sub-deliverable
**Scope expansion source:** Gemini v3 plan-review CRITs 1 + 2, user-authorized 2026-05-14
**Predecessor:** Phase E.1 (substrate — `scripts/lib/lifecycle-phase.js` + `src/lib/classification/lifecycle-phase.ts` + 14 spec amendments) — see commit `[E.1-ANCHOR-TBD]`

## Why this file exists

Phase E.1 ships pure-function substrate (`classifyCoaPhase` 9-rule rewrite, `mapToUniversalStream` with post-lookup phase validation, `classifyCoaPhaseLegacy` adapter). The consumer (`scripts/classify-lifecycle-phase.js`) is wrapped in the Legacy adapter to preserve 0.6% non-NULL coverage in the E.1↔E.2 gap window. E.2 is where the real coverage jump (0.6% → ≥95%) happens.

This task locks the E.2 scope so a future planner inherits the user-authorized v4 expansions (NOT a separate plan decision).

## E.2 in-scope work

1. **`scripts/classify-lifecycle-phase.js` consumer rewrite**: switch back from `classifyCoaPhaseLegacy` to full `classifyCoaPhase`. Extend the CoA UPDATE branch to write all granular columns (`lifecycle_seq` / `lifecycle_group` / `lifecycle_block` / `lifecycle_stage` / `bid_value`) + new persisted columns (`matched_status` / `matched_rule` / `unmapped_status` / `unmapped_decision`) alongside legacy `lifecycle_phase`. Write to `lifecycle_transitions` ledger with both legacy phase codes AND `from_seq` / `to_seq`. JOIN `coa_applications.coa_type_class` + `project_type` into `lifecycle_transitions` so E.3's cohort key is populated.

2. **`coa_applications` migration** (per v4 scope expansion #1 — Gemini v3 CRIT 1): `ALTER TABLE coa_applications ADD COLUMN matched_status TEXT, ADD COLUMN matched_rule SMALLINT, ADD COLUMN unmapped_status BOOLEAN NOT NULL DEFAULT false, ADD COLUMN unmapped_decision BOOLEAN NOT NULL DEFAULT false;`. UPDATE strategy: row-by-row backfill via `classifyCoaPhase` during E.2 first production run (~30,000+ rows, transaction-batched per Spec 47 §R8). Rationale: improves diagnosability — direct queries like `SELECT matched_status, COUNT(*) FROM coa_applications WHERE lifecycle_phase='P3' GROUP BY matched_status` replace audit-log archaeology.

3. **Downstream `lead_id LIKE 'coa:%'` guards** (per v4 scope expansion #2 — Gemini v3 CRIT 2 — MOVED FROM Phase F):
   - `scripts/compute-trade-forecasts.js` line 45-50: add guard BEFORE `PRE_CONSTRUCTION_PHASES.has(lifecycle_phase)` lookup. CoA-P3/P4 rows must skip the ISSUED calibration path (CoA-P3 = post-approval, ~1,000+ days before permit filing; permit-P3 = pre-issuance).
   - `scripts/update-tracked-projects.js` line 189: add guard BEFORE `PHASE_ORDINAL[lifecycle_phase]` lookup. CoA rows route through a separate ordinal map keyed on decision status, OR skip ordinal comparison entirely.
   - Rationale: shipping a producer of CoA-P3/P4 rows (E.2) without guarding the consumers would introduce a multi-sprint data-corruption window. Same-sprint shipping eliminates this.

4. **`audit_table` contract** (per v4 fold #50 — Observability v3 H6): emit 7 minimum metrics per pipeline run:
   - `unmapped_status_count: int` — count of CoA rows where `unmappedStatus: true`
   - `unmapped_decision_count: int` — count of CoA rows where `unmappedDecision: true`
   - `rule_distribution: Map<int, int>` (fire count per rule 1-9 — CoA-side classifier)
   - `phase_distribution: Map<string, int>` (count per phase ∈ {P1, P2, P3, P4, P19, P20} — CoA-side)
   - `matchedStatus_distribution: Map<string, int>` (top-20 by count + `__other__` bucket — CoA-side)
   - `coa_stalled_count: int` (CoA-side stall — separate from existing permit-side `stalled_count` to disambiguate per Observability v4 diff Finding C; permit-side `stalled_count` continues to be emitted as today)
   - `catalog_invalid_phase_count: int` — non-zero only if `universal_stream_catalog` drifts with multi-value / sentinel / NULL `.phase` rows

   **Critical write-target invariant** (per Observability v4 diff Finding A): E.2's UPDATE branch MUST use `classifyCoaPhase().phase` as the `lifecycle_phase` write target — NEVER `mapToUniversalStream().phase`. The catalog `.phase` field is descriptive (may contain multi-value strings, sentinels, or SQL NULL); the JSDoc on `mapToUniversalStream` documents this but the E.2 plan-lock checklist must treat it as a compliance gate item.

5. **First-run baseline mitigation** (per v4 fold #51 — Observability v3 H3): manual operator pre-acknowledgement of the expected first-classified-run anomaly (~30K reclassification spike). Spec 48 Improvement C (`pipeline_baselines` pinned-baseline) is queued-not-authorized; if it ships first, use the pin. Otherwise: manual annotation of first E.2 observer report as `[expected first-classified-run batch — not a regression]` + plan-lock requires operator pre-ack.

6. **`unmapped_decision_count` threshold setting** (per v4 fold #18 — Observability v3 concern A clarification): replace the `[PLACEHOLDER — TBD E.2]` text in Spec 42 §6.7 with empirically-derived threshold (preliminary estimate ≤ 3 from §2.5.b rows 52-54 data-quality outliers).

## E.2 out-of-scope (deferred)

- **`scripts/compute-trade-forecasts.js` CoA UNION source extension** — Phase F.
- **`scripts/update-tracked-projects.js` CoA branch logic** (hearing-date imminent window, decision-keyed auto-archive) — Phase F.
- **Band recalibration** (`logic_variables.lifecycle_band_*_min/max`) — Phase E.4 + E.5.
- **`compute-phase-calibration.js` cohort key extension** — Phase E.3 (depends on E.2 writing `coa_type_class` + `project_type` into `lifecycle_transitions`).
- **`assert-lifecycle-phase-distribution.js` per-seq bands** — Phase E.4.

## Gates

- E.1 commit lands and is verified (typecheck + lint + 200 tests green).
- This queued task picked up by next WF1 plan-lock cycle.
- E.2 plan-review: 4 reviewers (Gemini + DeepSeek + Independent worktree + Observability worktree) at BOTH plan stage AND diff stage per `00_engineering_standards.md` Multi-Agent Review cadence.

## Exit criteria

- `bug-84-w12-regression.infra.test.ts` green on staging.
- First E.2 production run: ~30,000+ CoAs reclassified; CoA `lifecycle_phase IS NOT NULL` rate ≥ 95%.
- 7-metric audit_table emits non-NULL counts for all 7 metrics on first production run.
- No CoA-P3/P4 row enters `PRE_CONSTRUCTION_PHASES.has()` or `PHASE_ORDINAL[]` lookups (guard verified by unit + integration tests).
- Operator pre-ack of first-classified-run anomaly logged in E.2 plan-lock.

## Spec amendments needed in E.2 plan

- Spec 42 §6.11 Phase E row: update "E.2 (consumer wiring + persisted columns + downstream guards — v4 scope expansion)" delivery note to point to E.2 commit anchor.
- Spec 42 §6.9 modified-scripts table: update `scripts/classify-lifecycle-phase.js` / `scripts/compute-trade-forecasts.js` / `scripts/update-tracked-projects.js` rows to point to E.2 commit anchor.
- Spec 42 §6.7 threshold: replace `[PLACEHOLDER — TBD E.2]` with empirical `unmapped_decision_count` threshold.
- Spec 84 84-W12 entry: append "Closed at consumer-wiring level in Phase E.2 commit [E.2-ANCHOR]; coverage gate verified ≥ 95% non-NULL."
- Spec 84 84-W11 entry: append "Consumer guards landed in Phase E.2 commit [E.2-ANCHOR]; transitional collision risk eliminated for `compute-trade-forecasts.js` + `update-tracked-projects.js`."
