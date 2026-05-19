# Spec 79 — Pipeline Step Validation Framework

> **Status:** ACTIVE (WF1 2026-05-19)
> **Audience:** developer/engineer post-deploy validation. Not on-call operator monitoring — Spec 48 narrative + Spec 49 profiling are the operator-facing tools.

## 1. Goal

Codify a repeatable, evidence-driven, per-step validation framework for both pipeline chains. Each step gets a written validation record that **proves** its checklist items via SQL output / grep result / actual value — never asserts PASS without evidence. Reviewer agents escalate only when checklist items fail or evidence is missing. Chain-end synthesis produces a severity-ranked execution plan with small-batch fix discipline.

The framework's prime objectives:
- **Observability** — every step's `audit_table.rows` populated correctly per Spec 48 §3.6
- **Accuracy** — data shape matches spec bounds; NULL rates within tolerance
- **Logic** — calculations + joins produce mathematically correct outputs
- **Hidden-failure detection** — SAVEPOINT-swallowed errors, zero-row emissions, silent IS DISTINCT FROM skips, NULL=NULL traps, distribution drift
- **Spec 47 adherence** — §R1–R12 per script + §11 counter semantics
- **Validating recent changes** — Phases C through I.1.1b deliveries actually behave per spec

## 2. Per-Step Evidence-Bearing Checklist

For every step, prove these 12 items with the indicated evidence. **Status (PASS / FAIL / INVESTIGATE / N/A) is derived from the evidence, never asserted independently.** Missing evidence = INVESTIGATE.

| # | Check | Evidence required | Derivation |
|---|-------|-------------------|------------|
| **C1** | Script ran to completion | Bash exit code, duration in ms | exit_code == 0 |
| **C2** | `pipeline_runs` row created | `SELECT id, status, completed_at FROM pipeline_runs WHERE pipeline = '<chain>:<slug>' ORDER BY started_at DESC LIMIT 1` (chain-prefixed when run via `run-chain.js`; bare slug for standalone runs) — paste full row. NEVER use LIKE — it matches both chains. | status = 'completed' AND completed_at IS NOT NULL |
| **C3** | `audit_table.verdict` = PASS | `SELECT records_meta->'audit_table'->>'verdict' FROM pipeline_runs WHERE id=<new-id>` | verdict = 'PASS' (NOT 'WARN', 'FAIL', or 'SKIP'). SKIP means advisory lock not acquired — an execution failure, not a success. |
| **C4** | `audit_table.rows` non-empty + all expected metrics present | Paste full `records_meta->'audit_table'->'rows'` JSON; cross-ref expected-metrics list from spec/script source | every spec-declared metric appears in rows[] |
| **C5** | Verdict cascade is row-derived (Spec 48 §3.6) | Grep script source for `rows.some(r => r.status === 'FAIL') ? 'FAIL' : rows.some(...)`. **Grep is best-effort** — doesn't detect commented code or dead branches. When C3 verdict and C5 grep disagree, C3 is authoritative. | pattern present in live code path AND C3 verdict agrees with rows[].status semantics |
| **C6** | Zero-row preservation for ledger writers (Spec 48 §3.6) | If script writes Tier 3 ledger: grep audit_table push for `*_inserted` INFO row NOT wrapped in `if (count > 0)` guard | INFO row emitted unconditionally; cascade derives verdict from `rows[].status`, not the push gate |
| **C7** | `records_meta` distributions populated | `SELECT records_meta - 'audit_table' FROM pipeline_runs WHERE id=<new-id>` — paste keys + sample values | every emitMeta-declared distribution key present with non-degenerate shape |
| **C8** | Output-table row-count delta matches expectation | `SELECT COUNT(*) FROM <output_table>` pre + post; declared expected delta from spec/audit row | **delta == records_new + records_updated (exact).** Cascading deletes or structurally-explainable discrepancies MUST be enumerated and subtracted to reach equality. ≈ hides silent drops. |
| **C9** | Schema present for every column written | `SELECT column_name FROM information_schema.columns WHERE table_name=<table>` — cross-ref against script's INSERT/UPDATE column list (grep) | every column the script writes exists in schema |
| **C10** | Calculation invariants hold (3 artifacts) | **C10a Universal invariants** — `COUNT(*) FILTER (WHERE NOT P)` queries for every spec-mandated row-level property; all return 0. **C10b Conservation re-derivation** — every claimed count in `audit_table.rows` recomputed from raw tables independently; pasted values must match exactly. **C10c Distribution baseline** — pull last 7 successful runs' `records_meta` distributions; current run's per-bucket Δ vs trailing median; flag any bucket >30% drift. | C10a violation count = 0 for every invariant; C10b mismatches = 0; C10c bucket drifts within ±30% |
| **C11** | Spec 47 §11 counter semantics | `records_total`, `records_new`, `records_updated`; cross-ref §11.1 (primary entity) + §11.2 (no secondary-entity sums) + §11.3 (velocity meaningful) | records_total scoped to primary entity per §11.1 |
| **C12** | Hidden-failure tripwires (per-risk-class profile — see §10) | Each tripwire query in the step's risk-class profile, with actual results | every applicable tripwire returns expected baseline; deviations = INVESTIGATE; N/A on out-of-profile tripwires |

## 3. Execution Rule: Keep Going Except on Catastrophic Failures

The default execution path is **non-stop**:
1. Run step → run checklist + tripwires → write validation record → continue to next step.
2. Do NOT spawn reviewer agents mid-flight. Do NOT file WF3s mid-flight. Do NOT pause for user input.
3. Validation records capture all evidence (passing AND failing items) with the actual query outputs.

### Halt conditions

**A. Execution blocker (script crash):**
- Bash exit code != 0 AND failure blocks downstream steps' inputs
- §3c auto-unblock budget applies; out-of-budget → halt + surface to user

**B. Catastrophic data quality failure (script ran but data is garbage):**
- C8 row-count delta off by >50% from audit_table claim
- C10b conservation re-derivation discrepancy >10% on any check
- C10a universal invariant violation count > 1% of total dataset rows
- C12 T6 stale-read count > 0 (race condition between read and write)
- C4 `audit_table.verdict = 'FAIL'`

When any catastrophic condition fires: record with full evidence, HALT immediately, surface one-paragraph summary to user, wait for skip-and-document OR fix-and-resume.

All other failures (verdict=WARN, audit row missing, distribution drift 30-50%, etc.) are recorded but the chain continues.

## 3a. Per-Step Specialized Agent (narrow scope per step)

After per-step evidence is captured, ONE specialized agent runs against that step's record. Scope is narrow.

| Step risk class | Agent | Scope |
|-----------------|-------|-------|
| Calculation steps | **Calculations** | C10a invariants returned 0; C10b conservation matches; C10c drift within ±30%. Reads §11 invariant pages + step SQL outputs. |
| Ledger writers (lifecycle_status_history, pipeline_runs, engine_health_snapshots) | **Observability** | C2-C6 Spec 48 §3.6 dual-pattern, zero-row preservation, verdict cascade row-derived |
| Multi-domain (math + ledger — e.g., `classify_lifecycle_phase`) | **Multi-domain** | Calc + Observability scopes in one prompt; one finding with both dimensions |
| Pure ingest/linkage/CQA | **Compliance** | C1, C9, C11 — Spec 47 §R1-R12 skeleton, schema present for emitMeta-declared columns, §11 counter semantics |
| Sanity (assert_schema, backup_db with no schema change) | **None** | Compliance checklist evidence is sufficient |

NO Integration agent at per-step level — see §3a' below.

## 3a'. Seam-Validation Pass (runs AFTER all per-step records exist)

Integration checks need both producer + consumer records. Runs as a separate pass after the chain completes per-step validation but before chain-end synthesis (§3b).

**Defined seams:**

| Producer | Consumer | Contract |
|----------|----------|----------|
| 17. link_coa | 24. compute_trade_forecasts | `permits.linked_coa_application_number` populated; CoA→permit back-ref usable in UNION |
| 21. classify_lifecycle_phase | 22. assert_lifecycle_phase_distribution | `lifecycle_phase`/`lifecycle_seq` populated; distribution bands cover all phases in dataset |
| 21. classify_lifecycle_phase | 24. compute_trade_forecasts | `matched_rule` ∈ [0..15]; `matched_status` ∈ catalog OR `unmapped_status = true` |
| 23. compute_phase_calibration | 24. compute_trade_forecasts | `phase_stay_calibration` 5-tuple cohorts cover the cohorts needed by forecasts |
| 24. compute_trade_forecasts | 25. compute_opportunity_scores | `predicted_start_date` / `anchor_date` / `anchor_source` non-NULL on forecast rows score will read |
| 25. compute_opportunity_scores | 26. update_tracked_projects | `opportunity_score` ∈ [0,1]; non-NULL on rows tracked_projects writes notifications for |

Integration agent reads BOTH validation records + runs structured contract checks defined above. Output: `## Seam validation` section appended to consumer record + cross-link in producer record.

Pass output: N additional findings (one per failing seam) added to Pass 1 dataset before §3b synthesis.

## 3b. Chain-End Synthesis with Adversarial Review

After all per-step records + seam validations exist, generate `docs/reports/pipeline-validation/SUMMARY.md`.

**Pass 1 — Mechanical aggregation (CSV-shape, repeatable):**
Walk every per-step record + agent finding + seam finding. Emit a structured table where every row is one finding. Schema:

`finding_id` · `step_number` · `chain` · `step_slug` · `check_id` (C1..C12 or `agent:<name>` or `seam:<n>`) · `category` · `expected_value` · `actual_value` · `status` (FAIL / INVESTIGATE) · `severity` (CRIT / HIGH / MED / LOW per mechanical rules below) · `evidence_link` · `recent_change_flag` · `script_file` · `spec_refs` · `agent_finding` · `suspected_root_cause` (AI-suggested, Pass 2 fills) · `proposed_action_type` (AI-suggested, Pass 2 fills) · `effort` (AI-suggested, Pass 2 fills) · `pattern_id` (AI-suggested, Pass 2 fills) · `ai_confidence` (low/med/high)

**Severity rules (mechanical):**
- CRIT — C10 invariant violation; C11 §11.2 violation; C8 row-count delta doesn't match audit; C9 schema drift on writer column; verdict=FAIL
- HIGH — C12 tripwire firing; C4 missing expected audit metric; C10c >30% drift; integration agent contract-break
- MED — C5 cascade not row-derived; C7 records_meta empty; narrative incoherent
- LOW — C2 metadata gap; C9 drift on non-writer; docs/spec text out of date

**Pass 2 — Synthesis with adversarial review (4 agents):**
Spawn at chain-end against the Pass 1 aggregate:
- **Independent** — synthesizes findings, identifies cross-step patterns
- **Observability** — chain-wide observability gaps
- **Gemini (bash)** + **DeepSeek (bash)** — adversarial against the aggregate

Each agent fills `suspected_root_cause` + `proposed_action_type` + `effort` + `pattern_id` with `ai_confidence`. **AI-SUGGESTED, not facts.** SUMMARY.md presents these as suggestions.

Cross-validation rule: does the `evidence_link` content actually support the claimed root cause? Mismatches → mark INVESTIGATE.

**Pass 2.5 — Human review gate:**
Before Pass 3 generates the execution plan, the user reviews:
1. Pass 1 mechanical findings (factual)
2. Pass 2 AI-suggested columns (suggestions)
3. Cross-validation mismatches

User can accept Pass 2 as-is, override any AI-suggested column, or reclassify severity. Pass 3 reads ONLY user-confirmed `action_type` for batching.

**Pass 3 — Execution plan (small-batch discipline):**

| Batch type | Criteria | Max scope |
|------------|----------|-----------|
| **B-docs** (single commit) | LOW severity, docs/spec text only, no code change | ~5 findings |
| **B-fix-now-<N>** (per-area commits) | XS/S effort, single file or tightly-coupled cluster | 2-4 findings each |
| **WF3 per finding** | HIGH/CRIT, single root cause, single area | 1 finding per WF3 |
| **WF3 bundled** | 2-3 closely-related findings, same file, M effort | 2-3 findings if tightly coupled |
| **WF1 (new spec or sub-spec)** | Cross-cutting pattern affecting ≥4 steps with shared root cause; 3+ agents converging | rare |

**Anti-monster rule:** any proposal touching >6 files OR >300 lines must be decomposed OR documented why it can't split. Default decline.

## 3c. Auto-Unblock Budget (branch-based — NEVER main)

When a script crashes mid-execution with exit != 0 AND blocks downstream steps' inputs, Claude has a bounded autonomous fix budget. **Fixes commit to a dedicated `auto-unblock/validation-<date>` branch.** Main remains untouched throughout validation.

**In-budget:**
- Single-file `.js` / `.ts` edits ≤ 10 LOC
- Missing `await` or null check
- Bumping `BATCH_SIZE` / `LIMIT` constant
- `OR <col> IS NULL` to a SELECT **ONLY where `<col>` is a classifier output column** (matched_rule, lifecycle_phase, matched_status) AND NULL means "not yet classified"

**Out-of-budget (HALT + user authorization):**
- Any migration file
- `DROP`, `TRUNCATE`, `DELETE FROM <production_table>` SQL
- Changes to `scripts/lib/pipeline.js`, `scripts/run-chain.js`
- Changes touching > 1 source file
- Changes > 10 LOC
- Changes to `migrations/`, `.env`, `package.json`, `tsconfig.json`
- Changes to `src/tests/` or `*.test.ts`
- `OR IS NULL` on non-classifier columns
- Re-running destructive script (`backup_db`, `permits` full sync) more than once

**Procedure (in-budget — pre-authorized WF3 ceremony):**

Every in-budget unblock is a WF3 with pre-granted authorization. The ceremony is preserved (matches the project's "always use workflow" discipline) but proceeds without halting for user input when the fix is in-scope.

1. **Capture crash evidence** — stack trace, line number, last log message, exit code.
2. **Create active task** `.cursor/active_task_unblock_<step-slug>_<timestamp>.md` using the standard WF3 template:
   - Status: Implementation (pre-authorized)
   - Goal: unblock `<step-slug>` script crash
   - Reproduction: crash evidence (paste verbatim)
   - Proposed fix: the diff
   - Pre-authorization rationale: "in-budget per Spec 79 §3c — ≤10 LOC, single file, non-destructive, classifier-output-OR-IS-NULL only (if applicable)"
3. **Independent reviewer sanity check** — spawn Independent code-reviewer agent with the active task + diff + crash evidence. Agent's narrow scope: confirm the fix is in-scope per §3c criteria AND behavior-preserving (does not introduce new logic paths or affect untested code). If agent disagrees (out-of-scope OR behavior-changing) → escalate to user.
4. **Apply fix** → commit to unblock branch:
   ```
   fix(validation): unblock <step-slug> — <description> [auto-unblock WF3]
   See: .cursor/closed_task_unblock_<step-slug>_<timestamp>.md
   ```
5. **Re-run the failed step.** Exit code 0 → proceed; non-zero → escalate.
6. **Full C1-C12 + applicable tripwires re-run** for the step. Any item now FAIL/INVESTIGATE that wasn't pre-crash → fix is suspect, escalate.
7. **Idempotency double-run** — run the step a second time. Verify second-run audit matches first-run within tolerance. Non-idempotent → escalate.
8. **Archive task** → rename to `.cursor/closed_task_unblock_<step-slug>_<timestamp>.md`.
9. **Record in `SUMMARY.md` → "Unblock Interventions"**: link to closed task + diff + Independent reviewer summary + audit comparison + verification results.
10. User reviews unblock branch + closed task records at chain-end; cherry-picks approved commits to main.

**Out-of-budget procedure:** same active task creation (step 2), but the Independent reviewer at step 3 will flag out-of-scope. Task halts at that point and surfaces to user with the same one-paragraph summary. User authorizes → resume from step 4. User declines → skip-and-document (task closed without commit; recorded in SUMMARY.md as a known-blocker for end-of-run review).

## 3d. Specialized-Agent Briefing Template

Every specialized-agent invocation (and chain-end adversarial agent) receives a standardized briefing. Project context + recent-change summary + step objective + relevant spec sections + step evidence.

See `docs/runbook/pipeline_step_validation_walkthrough.md` for the canonical briefing template.

## 4. Permits Chain Step Map

`scripts/manifest.json` `chains.permits` is authoritative (29 steps post-Phase G).

| # | Slug | Agent | Notes |
|---|------|-------|-------|
| 1 | assert_schema | none | Sanity unless schema migration since last validation |
| 2 | permits | Observability | Phase I.1 ledger writer — C6 required |
| 3 | close_stale_permits | Calculations | §11.1 invariants (date math) |
| 4 | classify_permit_phase | Compliance | Legacy P-code |
| 5 | classify_scope | Compliance | |
| 6 | builders | Compliance | |
| 7 | link_wsib | Compliance | |
| 8 | geocode_permits | Compliance | C8 expects backlog drainage |
| 9 | link_parcels | Compliance | |
| 10 | link_neighbourhoods | Compliance | |
| 11 | link_massing | Compliance | |
| 12 | link_similar | Compliance | |
| 13 | classify_permits | Compliance | |
| 14 | backfill_realtor_permit_trades | Compliance | Spec 84 §8.5 realtor work_phase |
| 15 | compute_cost_estimates | Calculations | §11.2 invariants |
| 16 | compute_timing_calibration_v2 | Calculations | §11.3 invariants |
| 17 | link_coa | Compliance | Producer for seam pass; Phase D back-ref + Phase G refactor |
| 18 | refresh_snapshot | Compliance | |
| 19 | assert_data_bounds | Compliance | Phase G permits_pre_permit_count gate |
| 20 | assert_engine_health | Compliance | |
| 21 | classify_lifecycle_phase | **Multi-domain** | §11.4 invariants + Phase I.1.1b matchedStatus. Seam validation in §3a'. |
| 22 | assert_lifecycle_phase_distribution | Calculations | §11.5 invariants — Phase E.4/E.5 per-seq bands |
| 23 | compute_phase_calibration | Calculations | §11.6 invariants — Phase E.3 5-tuple cohorts |
| 24 | compute_trade_forecasts | Calculations | §11.7 invariants — Phase F.1 |
| 25 | compute_opportunity_scores | Calculations | §11.8 invariants — Phase F.3 |
| 26 | update_tracked_projects | Calculations | §11.9 invariants — Phase F.2 |
| 27 | assert_entity_tracing | Compliance | |
| 28 | assert_global_coverage | Compliance | |
| 29 | backup_db | none | Sanity; C8 expects delta=0 |

## 5. CoA Chain Step Map

`scripts/manifest.json` `chains.coa` is authoritative (15 steps).

| # | Slug | Agent | Notes |
|---|------|-------|-------|
| 1 | assert_schema | (cross-ref permits #1) | |
| 2 | coa | Observability | Phase I.1 ledger writer — C6 required |
| 3 | assert_coa_freshness | Compliance | |
| 4 | link_coa_to_parcels | Compliance | Phase D §6.6.X lat/long ownership |
| 5 | classify_coa_scope | Compliance | |
| 6 | classify_coa_trades | Compliance | |
| 7 | compute_coa_cost_estimates | Calculations | §11.10 invariants — geometric-only per Spec 83 §3.A |
| 8 | link_coa | (cross-ref permits #17) | |
| 9-11 | refresh_snapshot, assert_data_bounds, assert_engine_health | (cross-ref permits #18-20) | |
| 12 | classify_lifecycle_phase | (cross-ref permits #21 — single record covers both) | |
| 13 | assert_lifecycle_phase_distribution | (cross-ref permits #22) | |
| 14 | compute_phase_calibration | (cross-ref permits #23) | |
| 15 | assert_global_coverage | (cross-ref permits #28) | |

## 6. Final Validation Cap

§6.1 **Spec 49 data completeness profile** — per chain
§6.2 **observe-chain narrative validation** — after per-step standalone runs complete, invoke `node scripts/run-chain.js permits` ONCE (a clean chain run from the unblock branch) — this auto-spawns observe-chain at end. Validate narrative coherence against the chain run's pipeline_runs rows.
§6.3 **Admin UI validation** — 7 surfaces (see §7)

## 7. Admin UI Validation (read-only-default)

| Surface | Concrete checks | Mutation? |
|---------|-----------------|-----------|
| Lead Detail Inspector (Spec 76) | (a) Permit lead URL → 200 + populated envelope; (b) CoA lead → 200 + CoaClassificationPanel renders 12 sub-sections; (c) cross-stream timeline ordered `(transitioned_at ASC, id ASC)`; (d) no double-fetch on transitions | READ-ONLY |
| Freshness Timeline (Spec 30 §2.3) | (a) Every of 29 permits + 15 CoA steps shows recent successful run; (b) verdict color matches `pipeline_runs.records_meta->'audit_table'->>'verdict'`; (c) no "stale" badges on this-session steps | READ-ONLY |
| Pipelines/Resync (Spec 86) | (a) Single-step trigger UI lists all manifest slugs; (b) trigger `assert_schema` (zero-write) → queues + completes; (c) new pipeline_runs row | One trigger — safest step |
| Flight Center | (a) Feed lists ≥1 actionable lead; (b) lead has non-NULL `opportunity_score`, `predicted_start_date`, `cost_estimate`, `trade_slug`; (c) sort-by-score works | READ-ONLY |
| Test Feed Tool | (a) Default fixture → 200 + valid JSON; (b) JSON includes `lead_id` in canonical form | READ-ONLY |
| observe-chain trigger | (a) UI surface exists; (b) trigger → new pipeline_runs row; (c) narrative appended to followup file | One read-only trigger |
| logic_variables CRUD | (a) CREATE `_validation_test_<timestamp>=1`; (b) READ → 1; (c) UPDATE → 2; (d) DELETE; (e) confirm no longer exists. `try/finally` ensures DELETE on assertion failure. | Isolated test variable (created + deleted; zero production impact) |

5 of 7 surfaces read-only. 2 perform isolated bounded mutations.

## 8. Validation Record Format

See `docs/runbook/pipeline_step_validation_walkthrough.md` for the canonical record template with worked example.

## 9. SUMMARY.md Format

See `docs/runbook/pipeline_step_validation_walkthrough.md` for the canonical chain-end synthesis report template.

## 10. Hidden-Failure Tripwires (per-risk-class profile)

| Risk class | Tripwires that apply |
|------------|---------------------|
| Calculation steps | T1, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12 |
| Ledger writers | T1, T2, T6, T12 |
| Pure ingest/linkage | T3, T4, T5, T12 |
| CQA / quality | T3, T9, T12 |
| Sanity | T12 only |
| Multi-domain | union of Calc + Ledger |

Tripwire-not-applicable handling: not in profile → `N/A` (distinct from PASS). In profile but SQL errors → `INVESTIGATE` with captured error.

12 tripwires (T1-T12): SAVEPOINT-swallowed errors, zero-row emission preservation, IS DISTINCT FROM silent skips, NULL=NULL trap, LEFT JOIN drop, stale read/write race, sentinel misclassification, off-by-one time-bucket, distribution drift vs baseline, calibration cohort thinning, catchall firing rate, STDERR `pipeline.log.warn` lines.

See `docs/runbook/pipeline_step_validation_walkthrough.md` for the canonical SQL.

## 11. Per-Step Calculation Invariants (10 calc steps)

Universal invariants + conservation re-derivation + distribution baseline targets, organized per step:

- §11.1 close_stale_permits — date arithmetic invariants
- §11.2 compute_cost_estimates — cost ≥ 0, source enum, GFA requirement, tier enum, NULL rate < 5%
- §11.3 compute_timing_calibration_v2 — gap_days ≥ 0, bucket count threshold
- §11.4 classify_lifecycle_phase — matched_rule range, matched_status null only on rules 0/1, catchall <0.1%, DEAD precedence over orphan
- §11.5 assert_lifecycle_phase_distribution — every phase has band, bands non-degenerate, violation conservation
- §11.6 compute_phase_calibration — median_days > 0, bucket_count threshold, CoA cohort NULL permit_type, from_seq < to_seq
- §11.7 compute_trade_forecasts — predicted_start > anchor, lead_id format, NULL rate < 10%, UNION sum conservation
- §11.8 compute_opportunity_scores — score ∈ [0,1], non-NULL anchor implication, zero-score only on carve-outs
- §11.9 update_tracked_projects — lead_id format, archived_at requires archived_reason, CoA stall only on P1/P2, notification idempotency
- §11.10 compute_coa_cost_estimates — geometric-only, GFA requirement, cost ≥ 0, no `cost_estimates` rows for CoAs

See `docs/runbook/pipeline_step_validation_walkthrough.md` §11 for the full SQL per step.

## 12. Operating Boundaries

* **Target files for this spec:** this spec only. Execution work product (validation records, SUMMARY.md, unblock branch commits) lives under `docs/reports/pipeline-validation/`.
* **Out-of-scope:** code changes to scripts (failures → fix in follow-up WF3 per finding); new migrations; new runner script (existing `node scripts/<file>.js` works); multi-agent review by default (escalation only); reviewer conflict resolution protocol (rely on existing triage); validation-expiry rule (premature).

## 13. Cross-references

- **Spec 41** §classify_lifecycle_phase row — references Spec 79 §4
- **Spec 42** §6.11 Phase I row — references Spec 79 §5
- **Spec 47** §R1-R12 + §11 — validated per Spec 79 §2 C1/C5/C9/C11
- **Spec 48** §3.6 + §3.7 — validated per Spec 79 §2 C2/C3/C4/C6
- **Spec 49** — Spec 79 §6.1 cap
