# Active Task: WF1 #lifecycle-phase-engine-migration-E.2 — Consumer wiring + persisted columns + downstream `lead_id` guards

**Status:** Implementation (authorized 2026-05-14 via "proceed"; v4 plan locked after 3 plan-review rounds; trajectory v1=21 → v2=16 → v3=12 → v4 = all folded)
**Workflow:** WF1 (consumer wiring + DB migration + downstream guard hardening)
**Domain Mode:** Backend/Pipeline (`scripts/`, `migrations/`, `docs/specs/`)
**Rollback Anchor:** `7003683` (Phase E.1 substrate ship)
**Parent WF:** Phase E — Lifecycle engine migration + bug 84-W12 fix + cohort-key extension (Spec 42 §6.11)
**Sub-deliverable position:** E.1 (substrate — DELIVERED `7003683`) → **E.2 (THIS task)** → E.3 → E.4 → E.5
**Scope source:** `.cursor/queued_task_phase_e2_consumer_wiring.md` (locked during E.1 v4 plan-lock).
**Adversarial review:** USER-REQUESTED — 4 reviewers (Gemini + DeepSeek + Independent worktree + Observability worktree using Spec 48 lens) at BOTH plan stage AND diff stage.

## v3 → v4 Revision Summary

v3 plan-review (4 reviewers) surfaced 12 findings. Trajectory: v1=21 → v2=16 → v3=12 → expected v4 ≤4 (all caught at diff-stage). User authorized direct PLAN LOCK at v4 (no v4 reviewer round).

| # | Finding | Reviewers | Severity | v4 Resolution |
|---|---|---|---|---|
| v3-1 | `lifecycle_transitions` INSERT not idempotent (JS filter only) | Gemini + DeepSeek (2-way) | CRITICAL | **FOLD** — mig 146 adds `CREATE UNIQUE INDEX uix_lifecycle_transitions_idempotency ON lifecycle_transitions (lead_id, transitioned_at)`; INSERT adds `ON CONFLICT (lead_id, transitioned_at) DO NOTHING`. Defense-in-depth + JS filter both active. |
| v3-2 | Backfill predicate `OR matched_status IS NULL` creates infinite loop for catchall rows (rule 9 writes NULL → predicate matches forever) | Gemini only | CRITICAL | **FOLD** — predicate changed to `OR matched_rule IS NULL`. Rule 9 catchall writes `matched_rule = 9` (non-null), breaking the loop. Defensive sentinel (rule 0, null input) is unreachable from stream SELECT (always provides valid input object). |
| v3-3 | 3 stale `migrations/146_*_DOWN.sql` references in Key Files / Execution Plan / Operating Boundaries — implementer would create spurious file | Independent only | CRITICAL | **FOLD** — all 3 references removed/corrected to single file `migrations/146_e2_coa_audit_columns.sql` with embedded DOWN comment block. |
| v3-4 | Migration test `migration-146-coa-audit-columns.infra.test.ts` plan says "rolls back via DOWN script" but DOWN is commented-block (project convention) | DeepSeek only | HIGH | **FOLD** — test rewritten to forward-only: applies migration, asserts 4 columns + 2 indices + CHECK + UNIQUE INDEX present. Documents that DOWN is manual-rollback-only. |
| v3-5 | `coaPhaseTransitionsCount` referenced in audit_table but never initialized/incremented in plan body — ReferenceError | Independent only | HIGH | **FOLD** — Part 2 implementation walkthrough now declares `let coaPhaseTransitionsCount = 0;` alongside `dirtyCoAsCount` and increments via `coaPhaseTransitionsCount += phaseChangedBatch.length;` after the INSERT. |
| v3-6 | First-run pre-ack lacks SQL example for manually inspecting distributions (since DeepSeek doesn't receive them) | Observability suggestion | HIGH | **FOLD** — pre-ack text adds the explicit query: `SELECT records_meta->>'coa_rule_distribution', records_meta->>'coa_phase_distribution', records_meta->>'coa_matched_status_top20' FROM pipeline_runs WHERE pipeline LIKE '%classify_lifecycle_phase' ORDER BY started_at DESC LIMIT 1;` |
| v3-7 | First-classification null-phase edge case (defensive sentinel returns) | DeepSeek only | HIGH (low-impact) | **DOCUMENT** — defensive sentinel (rule 0) only fires for `typeof input !== 'object'` per E.1 substrate. The stream SELECT always provides a valid object, so rule 0 is unreachable in practice. No transition row for these — accepted limitation. |
| v3-8 | `computeAuditStatus` helper insufficient genericity (covers only "lower-is-better"); inline ternary used for "equals 0" pattern | Gemini + DeepSeek (2-way) | MEDIUM | **FOLD** — helper renamed `computeWarnableAuditStatus(value, {passAt, warnAt})` to make scope explicit; added inline doc note that `=== 0 ? 'PASS' : 'FAIL'` is the binary pattern for zero-tolerance metrics. |
| v3-9 | `coa_skipped_count` guards inert today (permits.lead_id is always `permit:*`); metric purely decorative | DeepSeek only | MEDIUM | **DOCUMENT** — metric retains `status: 'INFO'`; Part 3 comment updated to note "decorative until Phase F UNION ships; will start counting then." |
| v3-10 | v2-6 triage table entry says "added ON CONFLICT" but the actual SQL pivoted to JS-filter; corrected by v4 v3-1 fold anyway | Independent only | LOW | **MOOT** — v4 fold v3-1 (above) adds ON CONFLICT back per Gemini+DeepSeek convergent CRIT. The v2-6 triage entry now becomes accurate. |
| v3-11 | `parseFloat(bid_value)` documentation around precision tradeoff | Gemini only | LOW | **FOLD** — comment added to catalog Map build: `// NOTE: bid_value DECIMAL parsed as float; 0-1 range non-financial use case` |
| v3-12 | NIT: "one-shot" terminology already removed in v3; int-key string coercion in buildTop20WithOther; minor doc cleanups | Multiple | NIT | **FOLD/N/A** — terminology audit; coercion is acceptable for JSON serialization (operator queries the column as JSONB); no action. |

## v2 → v3 Revision Summary

v2 plan-review (4 reviewers) surfaced 16 new findings — 4 CRITs were real bugs my v2 fold pass introduced or missed. v3 corrects them. The v2 reviewer outputs are at `tasks/b6m81ewer.output` (Gemini), `tasks/boyp1rp7b.output` (DeepSeek), `tasks/a88aea8f46db3b0f7.output` (Independent), `tasks/a9512af70f676540f.output` (Observability).

| # | Finding | Reviewers | Severity | v3 Resolution |
|---|---|---|---|---|
| v2-1 | `coaBatch.push` object missing `old_seq` field — downstream INSERT reads `b.old_seq` → undefined → corrupts `from_seq` for every row | Gemini only | CRITICAL | **FOLD** — added `old_seq: row.old_seq` to coaBatch.push (Part 2) |
| v2-2 | DOWN-file convention fabricated — no `*_DOWN.sql` files exist in project; actual convention is embedded commented-block in same file (Rule 6 / commit 8b1c10b) | Independent only | CRITICAL | **FOLD** — DOWN reverted to embedded commented SQL block in `migrations/146_e2_coa_audit_columns.sql`; separate `*_DOWN.sql` file removed from plan |
| v2-3 | Spec 48 §3.2 claim is architecturally wrong — observer code (`scripts/observe-chain.js` lines 200-230) builds DeepSeek `contextJson` from `stepSummaries` containing only audit_table.rows verdicts + duration metrics + failed_sample, NOT `records_meta` distributions | Observability only | CRITICAL | **FOLD** — Spec 48 §3.2 walkthrough rewritten: distributions are STORED in `pipeline_runs.records_meta` but NOT currently passed to DeepSeek context. Surfacing distributions to DeepSeek is deferred to Spec 48 Improvement D (queued-not-authorized). |
| v2-4 | Spec 48 §3.3 report file wrong — `classify_lifecycle_phase` runs in BOTH `permits` chain (manifest line 70) AND `coa` chain (manifest line 79); observer writes to `{chainId}-followup.md` so coa-chain runs write to `coa-followup.md`, NOT `permits-followup.md` | Observability only | CRITICAL | **FOLD** — Spec 48 §3.3 walkthrough corrected: E.2 audit metrics appear in BOTH `docs/reports/pipeline-observability/permits-followup.md` (permits-chain runs) AND `coa-followup.md` (coa-chain runs). Operator pre-ack must reference both. |
| v2-5 | Catalog Map build + startup assertion run BEFORE `withAdvisoryLock` — contradicts existing code invariant at script line 502: "ALL state-dependent initialization (getDbTimestamp, loadMarketplaceConfigs, validateLogicVars) MUST execute inside the lock callback to ensure absolute isolation" | Independent only | HIGH | **FOLD** — Catalog Map build + startup assertion moved INSIDE `withAdvisoryLock` callback after `getDbTimestamp` + `loadMarketplaceConfigs`. Preserves existing race-condition prevention. |
| v2-6 | `lifecycle_transitions` bare INSERT missing `ON CONFLICT` per Spec 47 §6.5 mandate | Independent only | HIGH | **FOLD** — added `ON CONFLICT DO NOTHING` to the unnest INSERT. Idempotent against legitimate re-runs where phase data hasn't changed in CKAN since last run. |
| v2-7 | `Number()` coercion unsafe for `bid_value` — `Number('')` = 0 (silently coerces empty string to 0 instead of null) | Gemini only | HIGH | **FOLD** — `parseFloat(r.bid_value)` + `Number.isFinite()` guard; non-finite → null |
| v2-8 | `catalog_invalid_phase_count` conflates 2 distinct failure modes (status missing from catalog vs catalog row has non-standard phase) — operators can't triage from single counter | DeepSeek only | HIGH | **FOLD** — split into `catalog_status_missing_count` (status not in catalog Map; threshold `<=3 WARN, <=1 PASS`) + `catalog_invalid_phase_count` (status present but phase non-standard; threshold `0 FAIL`) |
| v2-9 | No migration-existence startup guard — if `classify-lifecycle-phase.js` runs before mig 146 is applied, silent column-doesn't-exist error on UPDATE | DeepSeek only | HIGH | **FOLD** — startup check via `information_schema.columns` for `matched_status` existence on `coa_applications`; throws clear error if mig 146 not applied |
| v2-10 | `phaseChangedBatch` filter only checks phase — misses seq-only catalog updates that the main UPDATE captures (transitions ledger incompleteness) | Gemini MED + DeepSeek MED + Independent (3-way convergent) | HIGH | **FOLD** — filter expanded to detect phase OR seq change: `(b.old_phase ?? null) !== (b.phase ?? null) || (b.old_seq ?? null) !== (b.lifecycle_seq ?? null)`. Ledger now captures both phase-level AND seq-only transitions. |
| v2-11 | `computeAuditStatus` boundary tests missing — no test asserts PASS/WARN/FAIL transitions at exact thresholds | Independent only | HIGH | **FOLD** — added test #7: parametric boundary cases for `value === passAt`, `value === passAt + 1`, `value === warnAt`, `value === warnAt + 1` |
| v2-12 | `coa_phase_changes` metric name misleading — `coasUpdated` counts ALL row updates (including audit-only column changes), not just phase changes | DeepSeek only | MEDIUM | **FOLD** — metric renamed to `coa_rows_updated`. Add separate `coa_phase_transitions_count` for actual phase changes (derived from `phaseChangedBatch.length` accumulator). |
| v2-13 | `buildTop20WithOther` referenced but never defined — runtime crash | DeepSeek only | LOW | **FOLD** — inline definition added in Part 4 |
| v2-14 | Backfill OR predicate scalability concern at million-row scale | Gemini only | MEDIUM | **DOCUMENT** — added scalability comment in Part 1 (current ~33K is fine; future million-row scale may require a dedicated backfill script) |
| v2-15 | Backfill predicate "one-shot" terminology misleading (predicate is structurally permanent but only matches rows on first post-mig run) | Observability only | LOW | **FOLD** — terminology changed to "first-run-effective" in Part 1 |
| v2-16 | §R3.5 RUN_AT-position deviation: existing script runs `getDbTimestamp` INSIDE the lock callback (line 514), not before per the Spec 47 §6.1 skeleton | Independent MEDIUM | LOW | **DOCUMENT** — Spec 47 §R3.5 walkthrough acknowledges the deviation: getDbTimestamp inside the lock is intentional because the lock-acquired transaction's commit timestamp is what the audit metadata should reference. Existing code is correct; the skeleton's pre-lock RUN_AT is for scripts that don't take a transaction-scoped lock. |

## v1 → v2 Revision Summary

v1 plan-review surfaced 21 findings — 4 CRITs are 4-way convergent (Gemini + DeepSeek + Observability + Independent), 3 CRITs are single-reviewer runtime-blockers, plus 5 HIGHs and 9 MEDIUMs. All folded below.

| # | Finding | Reviewers | Severity | v2 Resolution |
|---|---|---|---|---|
| 1 | Batch size formula uses VALUES-form param math on unnest pattern (65535/N is meaningless for unnest) | Gemini + DeepSeek + Observability + Independent (**4-way**) | CRITICAL | **FOLD** — batch size is heap-bounded; replace with `COA_BATCH_SIZE = 5000` constant + per-batch memory budget commentary. With unnest, total bind params = 13 (12 arrays + 1 timestamp) regardless of batch size. |
| 2 | `lifecycle_transitions.from_phase` always NULL on subsequent runs (RETURNING returns POST-update value) | Gemini + DeepSeek + Observability + Independent (**4-way**) | CRITICAL | **FOLD** — adopt permit-side pattern (existing code line 702-751): SELECT `lifecycle_phase AS old_phase` from stream, carry through JS batch, INSERT into `lifecycle_transitions` from batch (not RETURNING). |
| 3 | Catalog SELECT uses non-existent column names (`group`/`block`/`stage` — actual is `lifecycle_group`/`lifecycle_block`/`lifecycle_stage`) | Independent only (conf 95) | CRITICAL | **FOLD** — SQL: `SELECT seq, lifecycle_group AS "group", lifecycle_block AS "block", lifecycle_stage AS "stage", phase, bid_value, source, status FROM universal_stream_catalog`. |
| 4 | DOWN migration commented out (not executable) | Gemini only | CRITICAL | **FOLD** — DOWN block becomes valid SQL in a separate `migrations/146_e2_coa_audit_columns_DOWN.sql` file per project convention. |
| 5 | `catalog_invalid_phase_count` scoping ambiguous (13 non-CoA poisoned rows would false-positive a full scan) | Observability only | CRITICAL | **FOLD** — explicit scoping: counter increments ONLY when `mapToUniversalStream()` returns null due to non-standard `catalogRow.phase` during live CoA classification. No catalog scan. |
| 6 | P19 first-run estimate 4.5K is wrong (actual ~964: 59 Refused + 904 Application Withdrawn + 1 Cancelled); P4 missing from distribution | Observability only | CRITICAL | **FOLD** — observability table corrected: `P20: 28,956; P19: 964; P3: 1,716; P2: 1,126; P1: 289; P4: 1`. Operator pre-ack language updated. |
| 7 | audit_table sample code emits static `status: 'INFO'` — contradicts threshold contract | DeepSeek only | HIGH | **FOLD** — dynamic status computation via helper: `computeWarnableAuditStatus(value, {warnAt, failAt})` returns 'PASS'/'WARN'/'FAIL'. Applied to all 3 thresholded rows. |
| 8 | `unmapped_decision_count` baseline is 2 (not 3) — row 54 (`'decision not made...'`) routes via rule 6 `.includes('decision not made')` to P2 | DeepSeek + Observability | HIGH | **FOLD** — threshold values OK (`≤ 5 WARN, ≤ 3 PASS` still applies, baseline 2 gives 1-step drift headroom). Justification text updated to remove row 54 reference. |
| 9 | `lead_id` populated assertion missing (plan claims Phase B trigger populates `permits.lead_id` but doesn't cite migration or add test) | Observability only | HIGH | **FOLD** — cite `migrations/132_extend_permits_lead_id.sql` (Phase B trigger); add fixture-level assertion in `compute-trade-forecasts.infra.test.ts` + `update-tracked-projects.infra.test.ts`. |
| 10 | Migration 146 CHECK constraint scans the table (no `NOT VALID` pattern) | Independent only | HIGH | **FOLD** — use `ADD CONSTRAINT ... NOT VALID` + `VALIDATE CONSTRAINT` two-step pattern. Practically safe today (all `matched_rule` are NULL on first run) but pattern future-proofs against rollback-and-rerun scenarios. |
| 11 | `ADVISORY_LOCK_ID` typo: plan said 21, actual is 84 | DeepSeek (verified via grep at line 495) | HIGH | **FOLD** — plan reference corrected to lock ID 84 throughout. |
| 12 | `catalog_invalid_phase_count` duplicated in `audit_table` AND `records_meta` (single source of truth violation) | Gemini + DeepSeek | MEDIUM | **FOLD** — `audit_table.rows` only (canonical scalar location per Spec 47 §R10). Removed from `records_meta`. |
| 13 | Inconsistent guard telemetry: `compute-trade-forecasts.js` silently `continue`s; `update-tracked-projects.js` tracks `unknown_phase_skipped` counter | Gemini only | MEDIUM | **FOLD** — both guards emit a `coa_skipped_count` counter + first-occurrence WARN log. |
| 14 | `IS DISTINCT FROM` clause omits 4 catalog-derived columns (`lifecycle_group`/`block`/`stage`/`bid_value`); catalog evolution silent miss | DeepSeek + Independent | MEDIUM | **FOLD** — include all 5 catalog-derived columns in the OR-chain. Documented: small added cost on steady-state runs; pays back on catalog evolution. |
| 15 | Catalog source literal startup assertion missing (`'coa.status'` membership) | DeepSeek only | MEDIUM | **FOLD** — startup check after Map build: `if (!Array.from(catalogByStatusSource.keys()).some(k => k.startsWith('coa.status:'))) throw new Error('universal_stream_catalog has no coa.status rows')`. |
| 16 | No test for subsequent phase changes (from_phase non-null in 2nd run) | DeepSeek + Independent | MEDIUM | **FOLD** — integration test #4 added: run consumer twice, modify input between runs, assert `from_phase` matches previous phase on 2nd batch. |
| 17 | CHECK rule 0-9 over-couples schema to spec rule count | DeepSeek only | MEDIUM | **FOLD** — relaxed to `matched_rule >= 0 AND matched_rule <= 99`. Comment in migration documents current max-rule = 9 in Spec 42 §6.7. |
| 18 | CoA stream SELECT missing `lead_id` (needed for `lifecycle_transitions` INSERT) | Independent only | MEDIUM | **FOLD** — SELECT extended: adds `lead_id` + `lifecycle_phase AS old_phase` + `permit_type` + `project_type` + `coa_type_class` + `neighbourhood_id` (the JOIN dimensions for `lifecycle_transitions`). |
| 19 | Distribution metrics aren't automated (observer reads only `audit_table.rows`; `records_meta` distributions feed DeepSeek narrative only) | Observability only | MEDIUM | **FOLD** — observability table reframed: scalar metrics drive automated WARN/FAIL; distribution metrics are surfaced to DeepSeek for narrative analysis only (automated drift detection deferred to Spec 48 Improvement C/D). |
| 20 | `tracked_projects` JOIN structurally permit-only (no `coa_application_id` FK) — Phase F needs deeper refactor, not just UNION | Observability only | LOW | **DEFER to Phase F handoff** — added explicit note in §6.9 modified-scripts table row for `update-tracked-projects.js`. |
| 21 | Backfill strategy relies on manual operator UPDATE — fragile | Gemini LOW | LOW | **FOLD** — backfill auto-trigger: classifier predicate extended one-shot: `OR matched_status IS NULL` for first-post-mig-146 run. Idempotent (NULL → not-NULL is monotonic). |

## Why this task exists (and why most of its content is pre-reviewed)

E.1 shipped pure-function substrate. The consumer (`scripts/classify-lifecycle-phase.js`) is currently wrapped in the Legacy adapter — preserving pre-E.1 0.6% non-NULL coverage in the E.1↔E.2 gap window. E.2 fires the real coverage jump (0.6% → ≥95%).

The **scope content** is the locked union of 6 E.2 deliverables in `.cursor/queued_task_phase_e2_consumer_wiring.md` + contract invariants from Observability v4 diff review. The **implementation detail** here is novel and was scrutinized by 4 plan-stage reviewers + the user-approved fold of 21 findings.

## Context

### Goal

Land the consumer wiring + DB migration + downstream defensive guards that cash the CoA `lifecycle_phase IS NOT NULL` 0.6% → ≥95% coverage jump promised by E.1.

1. **Migration 146** — ADD 4 audit columns + 2 partial indices + CHECK constraint (NOT VALID + VALIDATE pattern).
2. **`scripts/classify-lifecycle-phase.js` consumer rewrite** — switch back to full `classifyCoaPhase`; build `universal_stream_catalog` Map; write 11 columns per row + `lifecycle_transitions` ledger with old/new phase; emit 7-metric audit_table with dynamic status.
3. **Defensive `lead_id LIKE 'coa:%'` guards** — `compute-trade-forecasts.js` + `update-tracked-projects.js`. Inert until Phase F UNION; both emit consistent telemetry.
4. **First-E.2-run baseline mitigation** — operator pre-ack with corrected first-run distribution estimates (P19 ~964, P4 = 1).
5. **Spec amendments** — anchor placeholders → `7003683` (E.1) + `[E.2-ANCHOR]` (this commit).

### Target Specs

- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` — §R1–R12; `classify-lifecycle-phase.js` already pre-compliant.
- `docs/specs/01-pipeline/42_chain_coa.md` — §6.3 figure, §6.7 threshold strike, §6.9 row updates, §6.11 Phase E row.
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` — §2.5.f row 4, 84-W12 + 84-W11 resolution notes.
- `docs/specs/01-pipeline/48_pipeline_observability.md` — 7-metric audit_table contract; observer reads `audit_table.rows` for automated WARN/FAIL; `records_meta` distributions feed DeepSeek narrative only.
- `docs/specs/00_engineering_standards.md` — §3 IS DISTINCT FROM guards; §6 logError; §9 pipeline safety; §10 boundary.

### Key Files

- `migrations/146_e2_coa_audit_columns.sql` (NEW — UP block + embedded commented DOWN per project convention; v4 fold v3-3)
- `scripts/classify-lifecycle-phase.js` (target — lines 27-40, ~495 lock ID, ~880-940 CoA stream loop, ~1107 audit_table)
- `scripts/compute-trade-forecasts.js` (target — lines 45-50 PRE_CONSTRUCTION_PHASES; lines 278-308 SOURCE_SQL — add `p.lead_id`)
- `scripts/update-tracked-projects.js` (target — line 132-157 SELECT — add `p.lead_id AS permit_lead_id`; line 189 PHASE_ORDINAL lookup — guard insertion)
- `scripts/lib/lifecycle-phase.js` + `src/lib/classification/lifecycle-phase.ts` (E.1 substrate consumed — NO CHANGE)
- `src/tests/classify-lifecycle-phase.infra.test.ts` (NEW or EXTEND)
- `src/tests/compute-trade-forecasts.infra.test.ts` + `src/tests/update-tracked-projects.infra.test.ts` (EXTEND)
- `src/tests/migration-146-coa-audit-columns.infra.test.ts` (NEW)
- `docs/reports/review_followups.md` (E.2 close-out note)
- `.cursor/queued_task_phase_e2_consumer_wiring.md` → move to `.cursor/closed_task_phase_e2_consumer_wiring.md`

## Technical Implementation

### Part 1 — Migration 146: `coa_applications` audit columns

```sql
-- migrations/146_e2_coa_audit_columns.sql
-- Phase E.2 — persist matchedStatus / matchedRule / unmappedStatus / unmappedDecision
-- on coa_applications. Improves diagnosability vs audit-log archaeology.

BEGIN;

ALTER TABLE coa_applications
  ADD COLUMN IF NOT EXISTS matched_status     TEXT,
  ADD COLUMN IF NOT EXISTS matched_rule       SMALLINT,
  ADD COLUMN IF NOT EXISTS unmapped_status    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unmapped_decision  BOOLEAN NOT NULL DEFAULT false;

-- Domain CHECK with NOT VALID + VALIDATE pattern (v1 fold #10).
-- NOT VALID skips the full-table validation pass on ADD; VALIDATE CONSTRAINT
-- (separate statement) does the scan with a SHARE UPDATE EXCLUSIVE lock that
-- does NOT block concurrent reads/writes.
--
-- Range 0..99 (v1 fold #17): allows ~10x rule expansion in Spec 42 §6.7
-- without a follow-up migration. Current spec defines rules 1-9.
ALTER TABLE coa_applications
  DROP CONSTRAINT IF EXISTS chk_coa_matched_rule_range,
  ADD  CONSTRAINT chk_coa_matched_rule_range
       CHECK (matched_rule IS NULL OR (matched_rule >= 0 AND matched_rule <= 99))
       NOT VALID;
ALTER TABLE coa_applications
  VALIDATE CONSTRAINT chk_coa_matched_rule_range;

-- Partial indices on the unmapped flags (predominantly false in steady state).
CREATE INDEX IF NOT EXISTS idx_coa_unmapped_status
  ON coa_applications (unmapped_status)
  WHERE unmapped_status = true;
CREATE INDEX IF NOT EXISTS idx_coa_unmapped_decision
  ON coa_applications (unmapped_decision)
  WHERE unmapped_decision = true;

-- v4 fold v3-1: UNIQUE INDEX on lifecycle_transitions for ON CONFLICT idempotency.
-- (lead_id, transitioned_at) is a sufficient natural key — within a single classify run,
-- transitioned_at = RUN_AT (constant), so a row can only be inserted once per
-- (lead_id, run). Across runs, transitioned_at advances monotonically, so duplicate
-- ledger rows for the same lead in the same run are impossible. Defense-in-depth
-- complements the JS phaseChangedBatch filter (the primary idempotency mechanism).
CREATE UNIQUE INDEX IF NOT EXISTS uix_lifecycle_transitions_idempotency
  ON lifecycle_transitions (lead_id, transitioned_at);

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b — established convention across migrations 128/132/133).
-- The migration runner only processes the UP block above; this DOWN is
-- documentation for operators executing a manual rollback.
-- ─────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_coa_unmapped_status;
-- DROP INDEX IF EXISTS idx_coa_unmapped_decision;
-- DROP INDEX IF EXISTS uix_lifecycle_transitions_idempotency;
-- ALTER TABLE coa_applications DROP CONSTRAINT IF EXISTS chk_coa_matched_rule_range;
-- ALTER TABLE coa_applications
--   DROP COLUMN IF EXISTS matched_status,
--   DROP COLUMN IF EXISTS matched_rule,
--   DROP COLUMN IF EXISTS unmapped_status,
--   DROP COLUMN IF EXISTS unmapped_decision;
```

**DOWN convention (v2 fold #2):** No separate `*_DOWN.sql` files exist anywhere in `migrations/` — every migration (128, 132, 133, 140-144) embeds the DOWN as a commented-out block with manual-rollback note. v3 reverts to that established pattern.

**ADD COLUMN safety on 33K-row table.** PG 11+ optimizes `ADD COLUMN ... DEFAULT false NOT NULL` (constant default) to no rewrite — the default is stored in `pg_attrdef` and materialized lazily. Expected migration time: `<100ms`.

**Backfill strategy** (v4 fold v3-2 — Gemini CRIT): auto-trigger via classifier predicate extension. The CoA stream query gets a first-run-effective predicate addition:

```sql
WHERE lifecycle_classified_at IS NULL
   OR last_seen_at > lifecycle_classified_at
   OR matched_rule IS NULL    -- v4 fold v3-2: USE matched_rule (NOT matched_status)
                              -- matched_status can be null permanently for rule-9 catchall rows;
                              -- matched_rule is null ONLY pre-mig (until first classification),
                              -- breaking the infinite-loop catchall-reprocesses-forever risk.
```

**Why `matched_rule IS NULL` (not `matched_status IS NULL`)** (v3 Gemini CRIT):
- Rule 9 catchall returns `matchedStatus: null` (per E.1 substrate design — drives `lifecycle_seq = NULL` correctly).
- The UPDATE writes that NULL to `coa_applications.matched_status`.
- If the backfill predicate uses `OR matched_status IS NULL`, every catchall row matches the predicate on every subsequent run → reprocessed forever → poison-pill loop.
- All rules (1-9) write a non-NULL `matched_rule` (1-9 respectively); rule 0 (defensive sentinel) is unreachable from the stream SELECT (always provides a valid object). So `matched_rule IS NULL` matches only rows pre-classification — monotonically transitions to non-null after first classification — breaking the loop.

Idempotent: NULL → non-NULL on `matched_rule` is monotonic. On second run, only `last_seen_at > lifecycle_classified_at` predicate matches.

**Scalability note** (v2 fold #14 — Gemini MEDIUM): the `OR` predicate may not optimize well at >1M rows. Current 33K is comfortable. If `coa_applications` grows past ~500K, consider extracting the backfill into a dedicated one-shot script (`scripts/backfill-coa-matched-rule.js`) with explicit LIMIT-based batching.

### Part 2 — `scripts/classify-lifecycle-phase.js` consumer rewrite

**Imports (line 27-40):** revert the v4 Same-Sprint Mitigation Option 2:

```js
const {
  classifyLifecyclePhase,
  classifyCoaPhase,        // v2 fold: revert Legacy adapter wrap (E.1 substrate consumer activated)
  mapToUniversalStream,    // E.1 substrate
  DEAD_STATUS_ARRAY,
  NORMALIZED_DEAD_DECISIONS_ARRAY,
} = require('./lib/lifecycle-phase');
```

**ADVISORY_LOCK_ID** (v1 fold #11): unchanged at **84** (Spec 47 §A.5 registry; line 495 in current script).

**Catalog Map build** (v1 folds #3 + #15; v2 folds #5 + #7 + #9) — runs **INSIDE `pipeline.withAdvisoryLock` callback** per existing code invariant at line 502 ("ALL state-dependent initialization MUST execute inside the lock callback"); column aliasing bridges schema names to `mapToUniversalStream` contract; `bid_value` uses `parseFloat` + `isFinite` guard (not `Number()` which coerces `''` to 0); migration-existence guard ensures mig 146 has been applied before any column reads:

```js
// Inside pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => { ... })
// AFTER getDbTimestamp + loadMarketplaceConfigs + validateLogicVars (existing).

// v2 fold #9: migration-existence guard. Throws cleanly if mig 146 not applied yet.
const { rows: colCheck } = await pool.query(
  `SELECT column_name FROM information_schema.columns
    WHERE table_name = 'coa_applications'
      AND column_name IN ('matched_status','matched_rule','unmapped_status','unmapped_decision')`,
);
const expectedCols = new Set(['matched_status','matched_rule','unmapped_status','unmapped_decision']);
const foundCols = new Set(colCheck.map((r) => r.column_name));
const missing = [...expectedCols].filter((c) => !foundCols.has(c));
if (missing.length > 0) {
  throw new Error(
    `[classify-lifecycle-phase] migration 146 not applied — missing columns on coa_applications: ` +
    `${missing.join(', ')}. Apply migrations/146_e2_coa_audit_columns.sql before running E.2.`,
  );
}

// Build universal_stream_catalog lookup Map (column aliases bridge schema names).
// v2 fold #7: parseFloat + isFinite guard for bid_value avoids Number('') = 0 trap.
const catalogByStatusSource = new Map();
const { rows: catalogRows } = await pool.query(
  `SELECT seq,
          lifecycle_group AS "group",
          lifecycle_block AS "block",
          lifecycle_stage AS "stage",
          phase, bid_value, source, status
     FROM universal_stream_catalog`,
);
for (const r of catalogRows) {
  // v4 fold v3-11: bid_value is DECIMAL(3,2) in DB but parsed as float here.
  // Acceptable: 0-1 range, non-financial use case, used for forecast weighting only.
  // If precision requirements ever increase, migrate to decimal.js or string handling.
  const bvNum = r.bid_value === null ? null : parseFloat(r.bid_value);
  const bidValueSafe = (bvNum === null || !Number.isFinite(bvNum)) ? null : bvNum;
  catalogByStatusSource.set(`${r.source}:${r.status}`, Object.freeze({
    seq: r.seq,
    group: r.group,
    block: r.block,
    stage: r.stage,
    phase: r.phase,
    bid_value: bidValueSafe,
  }));
}

// Startup assertion: catalog has at least one coa.status row.
const hasCoaStatusRows = Array.from(catalogByStatusSource.keys())
  .some((k) => k.startsWith('coa.status:'));
if (!hasCoaStatusRows) {
  throw new Error(
    '[classify-lifecycle-phase] universal_stream_catalog has no coa.status rows — ' +
    'CoA classification cannot proceed. Verify migration 129 seed.',
  );
}
```

**CoA stream SELECT** (v1 fold #18) — extended to carry `lead_id`, old phase, and the cohort-key dimensions for `lifecycle_transitions`:

```js
for await (const row of pipeline.streamQuery(
  pool,
  `SELECT ca.id,
          ca.lead_id,
          ca.decision,
          ca.linked_permit_num,
          ca.status,
          ca.last_seen_at,
          ca.lifecycle_phase  AS old_phase,        -- v2 fold #2: carry old phase for transitions INSERT
          ca.lifecycle_seq    AS old_seq,
          ca.permit_type,
          ca.project_type,
          ca.coa_type_class,
          ca.neighbourhood_id,
          ca.matched_rule,                          -- v4 fold v3-2: backfill predicate (NOT matched_status — see Part 1)
          CASE
            WHEN ca.last_seen_at IS NULL THEN NULL
            ELSE GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - ca.last_seen_at)) / 86400.0)
            -- Note: GREATEST(0, ...) handles clock-skew / future-dated last_seen_at defensively.
          END::float AS days_since_activity
     FROM coa_applications ca
    WHERE ca.lifecycle_classified_at IS NULL
       OR ca.last_seen_at > ca.lifecycle_classified_at
       OR ca.matched_rule IS NULL`,
  [RUN_AT],
)) {
  // ...
}
```

**Classifier call + batch push** (v1 folds #1, #2, #3):

```js
const result = classifyCoaPhase({
  decision: row.decision,
  linked_permit_num: row.linked_permit_num,
  status: row.status,
  daysSinceActivity: row.days_since_activity,
  stallThresholdDays: COA_STALL_THRESHOLD_DAYS,
});
// E.1 substrate authoritative phase (NEVER catalogRow.phase per Observability v4 fold #104).
const catalogRow = mapToUniversalStream(catalogByStatusSource, result.matchedStatus, 'coa.status');

// Telemetry — catalog poisoning detected on a live classification.
// v2 fold #8: split into TWO counters so operators can distinguish triage paths:
//   - catalog_status_missing_count: CKAN status not in catalog (add to seed)
//   - catalog_invalid_phase_count:  status present but catalogRow.phase non-standard (fix seed)
// Discrimination via post-lookup check (re-query the Map directly — cheap).
if (result.matchedStatus != null) {
  const rawCatalogRow = catalogByStatusSource.get(`coa.status:${result.matchedStatus}`);
  if (rawCatalogRow == null) {
    catalogStatusMissingCount++;       // (a) status missing from catalog
  } else if (catalogRow == null) {
    catalogInvalidPhaseCount++;        // (b) catalog row found but phase non-standard
  }
  // (Note: rule 9 catchall returns matchedStatus=null, so this whole block is skipped — correct.)
}

coaBatch.push({
  id: row.id,
  lead_id: row.lead_id,
  old_phase: row.old_phase,                          // v1 fold #2: for transitions INSERT
  old_seq:   row.old_seq,                            // v2 fold #1 (CRIT): missing in v2 → undefined → corrupted from_seq
  permit_type: row.permit_type,
  project_type: row.project_type,
  coa_type_class: row.coa_type_class,
  neighbourhood_id: row.neighbourhood_id,
  // E.1 substrate authoritative — used as lifecycle_phase write target
  phase: result.phase,
  stalled: result.stalled,
  // Granular Universal Stream columns (catalogRow.* — null on catchall or catalog miss)
  lifecycle_seq:   catalogRow?.seq ?? null,
  lifecycle_group: catalogRow?.group ?? null,
  lifecycle_block: catalogRow?.block ?? null,
  lifecycle_stage: catalogRow?.stage ?? null,
  bid_value:       catalogRow?.bid_value ?? null,
  // New persisted audit columns (mig 146)
  matched_status:  result.matchedStatus,
  matched_rule:    result.matchedRule,
  unmapped_status: result.unmappedStatus,
  unmapped_decision: result.unmappedDecision,
});

// Distribution accumulators (NOT passed to DeepSeek — stored in pipeline_runs.records_meta only).
ruleDistribution.set(result.matchedRule, (ruleDistribution.get(result.matchedRule) || 0) + 1);
phaseDistribution.set(result.phase ?? 'null', (phaseDistribution.get(result.phase ?? 'null') || 0) + 1);
if (result.matchedStatus != null) {
  matchedStatusCounts.set(
    result.matchedStatus,
    (matchedStatusCounts.get(result.matchedStatus) || 0) + 1,
  );
}
if (result.stalled) coaStalledCount++;
if (result.unmappedStatus) unmappedStatusCount++;
if (result.unmappedDecision) unmappedDecisionCount++;
```

**Counter declarations** (v4 fold v3-5 — Independent HIGH; `coaPhaseTransitionsCount` was referenced in the audit_table block but never initialized in v3 plan body): the following counters are declared alongside the existing `dirtyCoAsCount` / `coasUpdated` variables (script line ~877-878), and incremented at the points indicated:

```js
// Existing — unchanged
let dirtyCoAsCount = 0;
let coasUpdated = 0;          // RENAMED conceptually to "rows updated" per v2 fold #12; metric emitted as `coa_rows_updated`

// NEW counters introduced by E.2
let coaStalledCount = 0;            // incremented per row in stream loop
let unmappedStatusCount = 0;        // incremented per row
let unmappedDecisionCount = 0;      // incremented per row
let catalogStatusMissingCount = 0;  // incremented per row (status missing from catalog Map)
let catalogInvalidPhaseCount = 0;   // incremented per row (catalog row exists but phase non-standard)
let coaPhaseTransitionsCount = 0;   // v4 fold v3-5: incremented += phaseChangedBatch.length inside withTransaction (after INSERT)
const ruleDistribution = new Map();
const phaseDistribution = new Map();
const matchedStatusCounts = new Map();
```

And inside the `withTransaction` callback, after the `lifecycle_transitions` INSERT block:

```js
coaPhaseTransitionsCount += phaseChangedBatch.length;
```

**Batch size** (v1 fold #1 — 4-way convergent):

```js
// v2 fold #1: with unnest array params, total bind count = 13 (12 arrays + 1 timestamp)
// regardless of batch size. Param limit (65535) does NOT constrain batch size in
// unnest form. Memory budget at 5000 rows × 12 columns × ~50 bytes ≈ 3 MB per batch
// (cold heap allocation), comfortable for Node default heap. Chosen for round-trip
// efficiency: 5K rows per batch = ~7 batches on 33K-row first-run.
const COA_BATCH_SIZE = 5000;
```

**`buildCoaUpdateSQL` rewrite** — combines main UPDATE + `lifecycle_classified_at` UPDATE into ONE statement via single `withTransaction` (v1 fold on `flushCoaBatch` two-statement merge), AND emits `lifecycle_transitions` rows from the batch (NOT from RETURNING — fold #2):

```sql
-- Main UPDATE: 11 data columns + lifecycle_classified_at, with full IS DISTINCT FROM
-- on all catalog-derived columns (v1 fold #14: explicit catalog evolution coverage).
WITH updated AS (
  UPDATE coa_applications ca SET
    lifecycle_phase           = upd.phase,
    lifecycle_stalled         = upd.stalled,
    lifecycle_seq             = upd.lifecycle_seq,
    lifecycle_group           = upd.lifecycle_group,
    lifecycle_block           = upd.lifecycle_block,
    lifecycle_stage           = upd.lifecycle_stage,
    bid_value                 = upd.bid_value,
    matched_status            = upd.matched_status,
    matched_rule              = upd.matched_rule,
    unmapped_status           = upd.unmapped_status,
    unmapped_decision         = upd.unmapped_decision,
    lifecycle_classified_at   = $13::timestamptz
  FROM (
    SELECT * FROM unnest(
      $1::int[],          -- ids
      $2::text[],         -- phases (nullable)
      $3::boolean[],      -- stalleds
      $4::int[],          -- seqs (nullable)
      $5::text[],         -- groups (nullable)
      $6::text[],         -- blocks (nullable)
      $7::text[],         -- stages (nullable)
      $8::decimal[],      -- bid_values (nullable)
      $9::text[],         -- matched_statuses (nullable)
      $10::smallint[],    -- matched_rules
      $11::boolean[],     -- unmapped_status flags
      $12::boolean[]      -- unmapped_decision flags
    ) AS u(id, phase, stalled, lifecycle_seq, lifecycle_group, lifecycle_block,
           lifecycle_stage, bid_value, matched_status, matched_rule,
           unmapped_status, unmapped_decision)
  ) upd
  WHERE ca.id = upd.id
    AND (ca.lifecycle_phase           IS DISTINCT FROM upd.phase
      OR ca.lifecycle_stalled         IS DISTINCT FROM upd.stalled
      OR ca.lifecycle_seq             IS DISTINCT FROM upd.lifecycle_seq
      OR ca.lifecycle_group           IS DISTINCT FROM upd.lifecycle_group
      OR ca.lifecycle_block           IS DISTINCT FROM upd.lifecycle_block
      OR ca.lifecycle_stage           IS DISTINCT FROM upd.lifecycle_stage
      OR ca.bid_value                 IS DISTINCT FROM upd.bid_value
      OR ca.matched_status            IS DISTINCT FROM upd.matched_status
      OR ca.matched_rule              IS DISTINCT FROM upd.matched_rule
      OR ca.unmapped_status           IS DISTINCT FROM upd.unmapped_status
      OR ca.unmapped_decision         IS DISTINCT FROM upd.unmapped_decision)
  RETURNING ca.id
)
SELECT 1 FROM updated;  -- materialize the CTE so PG executes the UPDATE
```

**`lifecycle_transitions` INSERT** — separate SQL statement in the SAME `withTransaction`. Uses old_phase from the JS batch (NOT RETURNING):

```js
await pipeline.withTransaction(pool, async (client) => {
  // Step A: main UPDATE (above)
  const upd = await client.query(MAIN_UPDATE_SQL, [...arrays, RUN_AT]);
  coasUpdated += upd.rowCount || 0;

  // Step B: lifecycle_transitions INSERT for rows where phase OR seq changed.
  // v2 fold #10 (3-way convergent): filter expanded to include seq changes so
  // catalog evolution that updates seq-without-phase still produces ledger rows.
  // Mirrors the IS DISTINCT FROM coverage in the main UPDATE (phase + seq are
  // the two ledger-meaningful columns; group/block/stage/bid_value derive from seq).
  // For first-classification rows, old_phase + old_seq are NULL — that's the
  // correct from_phase per Spec 42 §6.6.B (matches Phase 2c permit-side line 992).
  const phaseChangedBatch = batch.filter((b) => {
    const phaseChanged = (b.old_phase ?? null) !== (b.phase ?? null);
    const seqChanged   = (b.old_seq   ?? null) !== (b.lifecycle_seq ?? null);
    return phaseChanged || seqChanged;
  });
  if (phaseChangedBatch.length > 0) {
    // v4 fold v3-1 (Gemini + DeepSeek CRIT convergent): ON CONFLICT DO NOTHING
    // per Spec 47 §6.5. Idempotency model:
    //   - PRIMARY:   JS phaseChangedBatch filter (only inserts on phase/seq change vs DB snapshot)
    //   - DEFENSE:   DB UNIQUE INDEX uix_lifecycle_transitions_idempotency (lead_id, transitioned_at)
    //                added in mig 146; ON CONFLICT (lead_id, transitioned_at) DO NOTHING
    // Within a single run, transitioned_at = RUN_AT (constant) — only one row per lead can land.
    // Across runs, transitioned_at advances; legit re-classifications still produce new rows.
    // Crash-and-retry: withTransaction rolls back UPDATE + INSERT atomically; on retry, the
    // stream re-reads the unchanged DB state (lifecycle_classified_at still NULL) and reapplies.
    await client.query(
      `INSERT INTO lifecycle_transitions
         (lead_id, from_phase, to_phase, from_seq, to_seq,
          transitioned_at, permit_type, project_type,
          coa_type_class, neighbourhood_id)
       SELECT * FROM unnest(
         $1::text[],     -- lead_ids
         $2::text[],     -- from_phases (nullable, from JS batch.old_phase)
         $3::text[],     -- to_phases
         $4::int[],      -- from_seqs (nullable)
         $5::int[],      -- to_seqs (nullable)
         $6::timestamptz[],
         $7::text[],     -- permit_types
         $8::text[],     -- project_types
         $9::text[],     -- coa_type_classes
         $10::bigint[]   -- neighbourhood_ids
       ) AS t(lead_id, from_phase, to_phase, from_seq, to_seq,
              transitioned_at, permit_type, project_type, coa_type_class, neighbourhood_id)
       ON CONFLICT (lead_id, transitioned_at) DO NOTHING`,
      [
        phaseChangedBatch.map((b) => b.lead_id),
        phaseChangedBatch.map((b) => b.old_phase),
        phaseChangedBatch.map((b) => b.phase),
        phaseChangedBatch.map((b) => b.old_seq),
        phaseChangedBatch.map((b) => b.lifecycle_seq),
        phaseChangedBatch.map(() => RUN_AT),
        phaseChangedBatch.map((b) => b.permit_type),
        phaseChangedBatch.map((b) => b.project_type),
        phaseChangedBatch.map((b) => b.coa_type_class),
        phaseChangedBatch.map((b) => b.neighbourhood_id),
      ],
    );
  }
});
```

The two-statement merge: instead of running a third UPDATE for `lifecycle_classified_at`, the new main UPDATE includes it in the SET clause. Eliminates a round-trip per batch.

### Part 3 — Defensive `lead_id LIKE 'coa:%'` guards (with consistent telemetry)

**`scripts/compute-trade-forecasts.js`:**

SELECT extension (v1 fold #9 — cite Phase B mig 132 trigger): add `p.lead_id` to the SOURCE_SQL. `permits.lead_id` is populated by a `BEFORE INSERT OR UPDATE` trigger installed by `migrations/132_extend_permits_lead_id.sql` (Phase B); guaranteed non-NULL for all permit rows.

Guard (v1 fold #13 — consistent telemetry):

```js
// v2 fold #13: consistent telemetry across both downstream guards.
// E.2 ships the producer of CoA-side P3/P4/P19/P20 on coa_applications.lifecycle_phase
// (via classify-lifecycle-phase.js). compute-trade-forecasts.js doesn't UNION CoA rows
// today, so this guard is inert — but it ships now so Phase F's UNION is a drop-in
// (no consumer code change needed).
let coaSkippedCount = 0;
let coaSkippedFirstWarned = false;

// In per-row loop:
if (typeof row.lead_id === 'string' && row.lead_id.startsWith('coa:')) {
  coaSkippedCount++;
  if (!coaSkippedFirstWarned) {
    pipeline.log.warn('[compute-trade-forecasts]',
      `Skipping CoA row from forecast generation (lead_id=${row.lead_id}, phase=${row.lifecycle_phase}). ` +
      `Inert in E.2 (no CoA UNION source yet) — Phase F replaces this with proper CoA-side logic.`);
    coaSkippedFirstWarned = true;
  }
  continue;
}
```

`coaSkippedCount` is emitted in the audit_table:

```js
{ metric: 'coa_skipped_count', value: coaSkippedCount, threshold: null, status: 'INFO' }
```

**`scripts/update-tracked-projects.js`:**

SELECT extension: add `p.lead_id AS permit_lead_id` (aliased to distinguish from a future `tracked_projects.lead_id` column — flagged in Phase F note for fold #20).

Guard at line 189 (before `PHASE_ORDINAL[row.lifecycle_phase]`):

```js
// v2 fold #13: consistent telemetry pattern (matches compute-trade-forecasts.js).
if (typeof row.permit_lead_id === 'string' && row.permit_lead_id.startsWith('coa:')) {
  coaSkippedCount++;
  if (!coaSkippedFirstWarned) {
    pipeline.log.warn('[tracked-projects]',
      `Skipping CoA row (permit_lead_id=${row.permit_lead_id}, phase=${row.lifecycle_phase}). ` +
      `Inert in E.2; Phase F handoff: tracked_projects JOIN is structurally permit-only today ` +
      `(no coa_application_id FK or lead_id column on tracked_projects) — Phase F needs deeper ` +
      `SELECT refactor to accommodate CoA-side rows, not just a UNION on the source.`);
    coaSkippedFirstWarned = true;
  }
  continue;
}
```

Audit row addition: `{ metric: 'coa_skipped_count', value: coaSkippedCount, threshold: null, status: 'INFO' }`.

### Part 4 — 7-metric audit_table contract (dynamic status + corrected baselines)

**Dynamic status helper** (v1 fold #7 + v4 fold v3-8 — rename for scope clarity):

```js
// v4 fold v3-8 (Gemini + DeepSeek convergent MED): renamed to make scope explicit.
// This helper covers ONLY "lower-is-better" thresholds (e.g., unmapped counts).
// For zero-tolerance metrics (catalog_invalid_phase_count), use inline ternary:
//   status: count === 0 ? 'PASS' : 'FAIL'
// Two patterns coexist intentionally; documented to prevent drift.
function computeWarnableAuditStatus(value, { passAt, warnAt }) {
  if (value <= passAt) return 'PASS';
  if (value <= warnAt) return 'WARN';
  return 'FAIL';
}
```

**Audit rows** — the 7 CoA-side metrics + existing rows:

```js
const auditRows = [
  // Existing permit-side (unchanged from current script)
  { metric: 'permits_dirty',           value: dirtyPermitsCount, threshold: null,       status: 'INFO' },
  { metric: 'permits_updated',         value: permitsUpdated,    threshold: null,       status: 'INFO' },
  // CoA-side existing
  { metric: 'coa_evaluated',           value: dirtyCoAsCount,    threshold: null,       status: 'INFO' },
  // v2 fold #12: rename from coa_phase_changes (misleading — counted ALL column changes,
  // not just phase changes). coa_rows_updated = total row-UPDATEs (audit cols + phase + etc.).
  // coa_phase_transitions_count = actual phase changes (from phaseChangedBatch filter).
  { metric: 'coa_rows_updated',              value: coasUpdated,             threshold: null, status: 'INFO' },
  { metric: 'coa_phase_transitions_count',   value: coaPhaseTransitionsCount, threshold: null, status: 'INFO' },
  // Existing permit-side stall (kept separate per Observability v4 fold #105)
  { metric: 'stalled_count',           value: permitStalledCount, threshold: null,      status: 'INFO' },
  // E.2 NEW — 7 CoA-side observability metrics
  { metric: 'coa_stalled_count',
    value: coaStalledCount, threshold: null, status: 'INFO' },
  { metric: 'unmapped_status_count',
    value: unmappedStatusCount,
    threshold: '<=3 WARN, <=1 PASS',
    status: computeWarnableAuditStatus(unmappedStatusCount, { passAt: 1, warnAt: 3 }) },
  { metric: 'unmapped_decision_count',
    value: unmappedDecisionCount,
    threshold: '<=5 WARN, <=3 PASS',
    status: computeWarnableAuditStatus(unmappedDecisionCount, { passAt: 3, warnAt: 5 }) },
  // v2 fold #8: split into 2 metrics for triage clarity
  { metric: 'catalog_status_missing_count',
    value: catalogStatusMissingCount,
    threshold: '<=3 WARN, <=1 PASS',
    status: computeWarnableAuditStatus(catalogStatusMissingCount, { passAt: 1, warnAt: 3 }) },
  { metric: 'catalog_invalid_phase_count',
    value: catalogInvalidPhaseCount,
    threshold: '=0 PASS, >0 FAIL',
    status: catalogInvalidPhaseCount === 0 ? 'PASS' : 'FAIL' },
  // Existing CQA
  { metric: 'unclassified_count', value: unclassifiedCount, threshold: '<= 100', status: 'PASS' },
  { metric: 'sys_velocity_rows_sec', value: velocity, threshold: null, status: 'INFO' },
  { metric: 'sys_duration_ms', value: durationMs, threshold: null, status: 'INFO' },
];
```

**Threshold justification** (v1 fold #8 corrected):
- `unmapped_status_count` (≤3 WARN, ≤1 PASS): all 22 §2.5.c statuses are mapped → baseline 0; threshold accommodates CKAN drift.
- `unmapped_decision_count` (≤5 WARN, ≤3 PASS): §2.5.b row 52 (`'Postponed'`, 1 row) + row 53 (`'Oct 29, 2019'`, 1 row) = **baseline 2**. Row 54 (`'decision not made - appeal was made due to that'`) is correctly classified by rule 6 via `.includes('decision not made')` → P2 (NOT in catchall). Threshold `≤3 PASS` gives 1-step drift headroom above baseline; `≤5 WARN` gives 3-step drift before FAIL.
- `catalog_invalid_phase_count` (=0 PASS): **scoping (v1 fold #5)**: this metric is incremented ONLY when `mapToUniversalStream()` returns null due to non-standard `catalogRow.phase` during live CoA classification. The 13 non-CoA poisoned catalog rows (seq 35, 47, 50, 77-87, 99-110) are NEVER counted because they're not reachable via `source='coa.status'` lookups. Steady state = 0; any non-zero indicates CKAN added a CoA status whose catalog row has a non-standard `.phase` (catalog seed bug).

**Distribution metrics** (v1 fold #19 — surfaced for DeepSeek narrative; observer-automated drift detection is deferred to Spec 48 Improvement C/D):

```js
records_meta: {
  // ... existing keys
  coa_rule_distribution:        Object.fromEntries(ruleDistribution),
  coa_phase_distribution:       Object.fromEntries(phaseDistribution),
  coa_matched_status_top20:     buildTop20WithOther(matchedStatusCounts),
  // NOTE (v1 fold #19): records_meta distributions feed DeepSeek narrative analysis
  // via `scripts/observe-chain.js` context JSON. The observer does NOT compute
  // automated drift % for these — that's deferred to Spec 48 Improvement D
  // (queued-not-authorized). Operators should treat distribution anomalies as
  // narrative signals from the observer, not as PASS/WARN/FAIL gates.
},
```

`buildTop20WithOther` (v2 fold #13 — inline helper definition):

```js
function buildTop20WithOther(map) {
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 20);
  const tail = sorted.slice(20);
  const result = Object.fromEntries(top);
  if (tail.length > 0) {
    result.__other__ = tail.reduce((sum, [, v]) => sum + v, 0);
  }
  return result;
}
```

**`catalog_invalid_phase_count` is in `audit_table.rows` ONLY** (v1 fold #12 — single source of truth). Not duplicated in `records_meta`.

### Part 5 — Spec amendments (12 — anchor-resolution-heavy)

(Same as v1 — 11 anchor-resolution edits for E.1 placeholders + 1 threshold replacement. Anchors filled post-commit: `7003683` (E.1) + `[E.2-ANCHOR]` (this commit).)

### Database Impact

**YES — migration 146 ships.** All 4 columns + 2 partial indices + CHECK (NOT VALID + VALIDATE pattern). Migration time `<100ms` on 33K rows (no rewrite). Backfill auto-triggered via classifier predicate `OR matched_status IS NULL` (v2 fold #21).

### Audit Observability (Spec 48 lens)

**Corrected first-run distribution estimates** (v1 fold #6 — Observability CRIT):

| Phase | First-run row count (post-E.2) | Source |
|---|---|---|
| `P20` (Closed/Complete) | **28,956** | §2.5.c rows 90+91 (28,948 + 8) |
| `P19` (Refused/Withdrawn/Cancelled) | **964** | §2.5.c rows 82+88+89 (59 + 904 + 1) |
| `P4` (Final and Binding) | **1** | §2.5.c row 83 |
| `P3` (Approved/Conditional Consent/post-decision) | **1,716** | §2.5.c rows 79+80+81+84+85+86+87 (326+246+554+24+1+347+218) |
| `P2` (Review/Deferred) | **1,126** | §2.5.c rows 72-78 (54+74+118+317+1+292+270) |
| `P1` (Intake) | **289** | §2.5.c rows 70+71 (10+279) |

**Sum: 33,052 rows** = total `coa_applications` row count. No row is unmapped under §2.5.c (the catchall fires only on drift).

**First-E.2-run mitigation:** before authorizing the first staging E.2 run, operator pre-ack in commit message / PR description:

> _Expected first-classified-run batch — Phase E.2 introduces ~33,052 CoA reclassification from NULL → P1/P2/P3/P4/P19/P20. Expected distribution: P20: ~28,956; P19: ~964; P3: ~1,716; P2: ~1,126; P1: ~289; P4: 1. Spec 48 observer step-change anomalies on velocity/duration/records_total for `classify-lifecycle-phase` step are expected on first E.2 run and should be manually annotated as "first-classified-run baseline-establish, not a regression." **Annotation must appear in BOTH `docs/reports/pipeline-observability/permits-followup.md` AND `docs/reports/pipeline-observability/coa-followup.md`** since `classify-lifecycle-phase.js` runs in both chains and each chain produces its own observer report. Distribution-level drift (`coa_*_distribution` in records_meta) is NOT currently surfaced to DeepSeek narrative — operators query `pipeline_runs` directly for distribution comparison using:_
>
> ```sql
> -- v4 fold v3-6 — manual distribution inspection (until Spec 48 Improvement D ships).
> -- Surfaces the 3 records_meta distributions for the most-recent classify-lifecycle-phase run.
> SELECT
>   pipeline,
>   started_at,
>   records_meta->'coa_rule_distribution'         AS rule_distribution,
>   records_meta->'coa_phase_distribution'        AS phase_distribution,
>   records_meta->'coa_matched_status_top20'      AS matched_status_top20
> FROM pipeline_runs
> WHERE pipeline LIKE '%:classify_lifecycle_phase'
> ORDER BY started_at DESC
> LIMIT 1;
> ```
>
> _Run this query manually after the first E.2 production run on BOTH chains (`permits:classify_lifecycle_phase` AND `coa:classify_lifecycle_phase`). Spec 48 Improvement C (pinned baseline) + Improvement D (records_meta to DeepSeek) are queued-not-authorized — manual annotation + manual query are the active mitigations._

**Observer integration clarification** (v1 fold #19): the Spec 48 observer (`scripts/observe-chain.js`) reads `audit_table.rows` for automated WARN/FAIL detection. `records_meta` distributions (`coa_rule_distribution` etc.) are surfaced to DeepSeek's narrative context only — no automated drift-percent computation today. Operators should treat distribution anomalies as DeepSeek narrative signals, not gate failures.

### Tests

1. **`src/tests/lifecycle-phase.logic.test.ts`** — NO CHANGE (substrate-only).

2. **`src/tests/classify-lifecycle-phase.infra.test.ts`** (NEW or EXTEND) — integration tests:
   - **First-classification run** (5 fixture rows × representative status+decision producing P1/P2/P3/P4/P19/P20): assert 11 columns populated + `lifecycle_transitions` inserted with `from_phase=NULL` + audit_table emits all 7 new metrics.
   - **Second-classification run with phase change** (v1 fold #16): modify 2 fixture rows' status/decision to drive a different phase; re-run; assert `lifecycle_transitions` 2nd-batch rows have `from_phase` = first-run's phase (NOT NULL).
   - **Catchall regression**: `status='UNKNOWN_XYZ'` → `unmapped_status: true`, `matched_status: null`, `matched_rule: 9`, `lifecycle_seq: null`, audit `unmapped_status_count: 1` with computed `status: 'WARN'`.
   - **Catalog source assertion** (v1 fold #15): mock catalog with 0 `coa.status` rows; assert classifier throws at startup.
   - **Catalog column-name correctness** (v1 fold #3): assert the catalog Map build SQL doesn't reference `group`/`block`/`stage` literally (i.e., the SELECT aliases are present).
   - **IS DISTINCT FROM coverage** (v1 fold #14): run twice with NO input changes — assert 2nd run has 0 UPDATEs (dead-update guard fires).

3. **`src/tests/compute-trade-forecasts.infra.test.ts`** (EXTEND): synthetic CoA-style row in source → no forecast generated; `coa_skipped_count` audit row > 0 with first-row WARN logged.

4. **`src/tests/update-tracked-projects.infra.test.ts`** (EXTEND): same pattern; `coa_skipped_count` audit row > 0.

5. **`src/tests/migration-146-coa-audit-columns.infra.test.ts`** (NEW; v4 fold v3-4): applies migration on a clean schema fixture; asserts 4 new columns on `coa_applications` (`matched_status`, `matched_rule`, `unmapped_status`, `unmapped_decision`) + 2 partial indices (`idx_coa_unmapped_status`, `idx_coa_unmapped_decision`) + CHECK constraint `chk_coa_matched_rule_range` (range 0-99) + UNIQUE INDEX `uix_lifecycle_transitions_idempotency` on `lifecycle_transitions(lead_id, transitioned_at)`. **Forward-only test** — DOWN is documented as manual-rollback-only per project convention (embedded comment block); no automated DOWN test (Spec 47 §10 migration UP/DOWN parity is the operator's responsibility, validated by review of the commented DOWN block).

6. **`lead_id` populated assertion** (v1 fold #9): fixture-level assertion in #3 and #4 that `permits.lead_id IS NOT NULL` (trigger from Phase B mig 132).

7. **`computeAuditStatus` boundary tests** (v2 fold #11 — Independent HIGH): parametric test for boundary conditions:
   - `computeWarnableAuditStatus(0, {passAt: 1, warnAt: 3})` → `'PASS'`
   - `computeWarnableAuditStatus(1, {passAt: 1, warnAt: 3})` → `'PASS'`  (exact passAt boundary)
   - `computeWarnableAuditStatus(2, {passAt: 1, warnAt: 3})` → `'WARN'`  (passAt + 1)
   - `computeWarnableAuditStatus(3, {passAt: 1, warnAt: 3})` → `'WARN'`  (exact warnAt boundary)
   - `computeWarnableAuditStatus(4, {passAt: 1, warnAt: 3})` → `'FAIL'`  (warnAt + 1)
   - Off-by-one in boundary semantics would silently miscategorize all 3 thresholded metrics; explicit test prevents drift.

8. **Catalog Map runtime invariant** (v2 fold via DeepSeek LOW): assert `catalogByStatusSource.get('coa.status:Hearing Scheduled')` returns an object with exactly `{seq, group, block, stage, phase, bid_value}` keys (catches a spelling error in SQL aliases that would pass compilation but break runtime mapping).

9. **Migration-existence guard test** (v2 fold #9): mock the pool to return 0 rows from `information_schema.columns` query; assert classifier throws with the migration-missing error message.

10. **Catalog status-missing vs invalid-phase split** (v2 fold #8): fixture with status `'NEW_CKAN_STATUS_XYZ'` NOT in catalog → assert `catalog_status_missing_count++`, NOT `catalog_invalid_phase_count`. Fixture with status that maps to a catalog row with `phase='UNMAPPED→null'` → assert `catalog_invalid_phase_count++`, NOT `catalog_status_missing_count`.

### Standards Compliance

- **Try-Catch Boundary**: existing `pipeline.withAdvisoryLock` envelope; new `withTransaction` wraps UPDATE + lifecycle_transitions INSERT atomically.
- **Unhappy Path Tests**: catalog source assertion fails → throw before lock acquisition; UPDATE fails mid-batch → transaction rollback covers transitions INSERT; `mapToUniversalStream` returns null on poisoned row → `catalog_invalid_phase_count++`.
- **logError Mandate**: new catch blocks use `pipeline.log.error('[classify-lifecycle-phase]', err, { context })`.
- **UI Layout**: N/A.
- **IS DISTINCT FROM guards on UPDATE** (Engineering Standards §3): all 11 catalog-derived + audit columns in OR-chain (v1 fold #14).

### Spec 47 §R1–R12 Compliance (explicit walkthrough)

`classify-lifecycle-phase.js` is EXTENDED in E.2, not rewritten — every §R1-R12 obligation continues to be satisfied. Explicit per-section adherence:

- **§R1 — SDK imports (MANDATORY):** unchanged. `pipeline = require('./lib/pipeline')`; `loadMarketplaceConfigs`; new addition of `classifyCoaPhase` + `mapToUniversalStream` from `./lib/lifecycle-phase` (E.1 substrate).
- **§R2 — Advisory lock ID:** `ADVISORY_LOCK_ID = 84` (line 495 — Spec 47 §A.5 registry). NO CHANGE.
- **§R3 — Batch size constants:** `COA_BATCH_SIZE = 5000` — heap-bounded (v1 fold #1). Replaces v1's incorrect `Math.floor(65535 / N)` reasoning. With unnest array form, total bind params = 13 (12 arrays + 1 timestamp), regardless of batch size. **§9.2 (max param limit) does NOT constrain unnest** — the formula in §9.2 applies to VALUES (...), ... form.
- **§R3.5 — Startup timestamp (DB clock):** `RUN_AT = await pipeline.getDbTimestamp(pool)` already at line 514. **v2 fold #16 note:** existing script runs `getDbTimestamp` INSIDE the `withAdvisoryLock` callback (line 506 → line 514), not before the lock per the Spec 47 §6.1 generic skeleton. This is INTENTIONAL for transaction-scoped advisory locks: the timestamp must reflect the post-lock-acquired transaction state to keep audit metadata consistent with the writes that the lock protects. Spec 47 skeleton's pre-lock RUN_AT is for scripts that don't take a transaction-scoped lock. All UPDATE/INSERT timestamps in the rewritten flushCoaBatch reference `$13::timestamptz = RUN_AT` — no `NOW()` or `new Date()` in the loop.
- **§R4 — Config load + Zod validation:** `loadMarketplaceConfigs(pool, 'classify-lifecycle-phase')` already in place. E.2 adds NO new logic_variables (thresholds for the 3 new audit metrics are STRUCTURAL constants per Spec 47 §4.1 — operator should NOT tune them via Control Panel; tuning would require coordinated migration + spec amendment).
- **§R5 — Startup guards:** existing guards preserved. **E.2 adds new startup guards INSIDE the `withAdvisoryLock` callback** (v2 fold #5 — preserves the existing invariant at script line 502 that ALL state-dependent initialization runs inside the lock callback for absolute isolation):
  - Migration 146 existence check (v2 fold #9): query `information_schema.columns` for the 4 new columns; throw with clear error if mig 146 not yet applied.
  - Catalog Map build returns 0 rows → throw.
  - Catalog has 0 `coa.status` rows → throw (v1 fold #15).
  Guards execute INSIDE the lock callback after `getDbTimestamp` + `loadMarketplaceConfigs` + `validateLogicVars`. Concurrent script instances serialize on the lock; the second instance gets `acquired: false` and exits via §R12.
- **§R6 — Advisory lock via SDK helper:** `pipeline.withAdvisoryLock(pool, 84, async () => {...})` envelope unchanged. All new code lands inside the callback.
- **§R7 — Data read (streamQuery for >10K rows):** existing CoA stream loop unchanged structurally. SELECT column list expanded (v1 fold #18: +`lead_id`, `lifecycle_phase AS old_phase`, `lifecycle_seq AS old_seq`, `permit_type`, `project_type`, `coa_type_class`, `neighbourhood_id`, `matched_status`). Stream remains `pipeline.streamQuery` — full 33,052-row scan on first run requires streaming (per §6.1: "tables expected to return >10K rows MUST use streamQuery").
- **§R8 — Computation (pure functions in scripts/lib/):** E.1 substrate (`classifyCoaPhase`, `mapToUniversalStream`, `computeStallFromActivity`, `isDeferredDecisionVariant`, `normalizeCoaStatus`) is consumed unchanged. No new pure function added in E.2.
- **§R9 — Atomic write:** the new flushCoaBatch combines the main UPDATE + `lifecycle_transitions` INSERT in a single `pipeline.withTransaction(pool, async (client) => {...})`. If the INSERT fails after the UPDATE, the transaction rollback restores `coa_applications` to pre-batch state — preserves §1's first non-negotiable: "Never leave the DB in partial state."
- **§R10 — PIPELINE_SUMMARY with audit_table:** extended per Part 4. 7 new CoA-side audit rows (4 scalars with thresholds + 3 distribution keys in records_meta). audit_table verdict computed as `'FAIL'` if any row has `status='FAIL'`, else `'WARN'` if any has `status='WARN'`, else `'PASS'` (existing logic preserved).
- **§R11 — PIPELINE_META:** existing `pipeline.emitMeta` already lists permits + coa_applications reads and writes. E.2 expands the `coa_applications` writes list to include `matched_status`, `matched_rule`, `unmapped_status`, `unmapped_decision`, `lifecycle_seq`, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage`, `bid_value`. Adds `lifecycle_transitions` to writes (new table writer). Existing `permit_phase_transitions` writer entry continues unchanged.
- **§R12 — CQA gate:** existing `unclassified_count > 100` gate at end-of-run preserved unchanged. E.2 does NOT add a new throw-to-FAIL gate (the new audit metrics fail via threshold status in the audit_table, not via runtime throw).

**Spec 47 §1 non-negotiables explicit check:**
- "Never leave the DB in partial state" → §R9 atomic write covers the main UPDATE + transitions INSERT. The catalog Map build is read-only.
- "Never let an unknown value silently become a wrong value" → rule 9 catchall returns `matchedStatus: null` (NOT a sentinel); `mapToUniversalStream` returns null on poisoned catalog rows; `unmapped_status`/`unmapped_decision`/`catalog_invalid_phase_count` audit metrics surface every drift signal LOUDLY.

### Spec 48 Pipeline Observability Adherence (explicit alignment)

E.2 is the first pipeline run that produces CoA-side audit metrics. Explicit per-section alignment with Spec 48's observer contract:

**Spec 48 §3.1 — DB reads:** the observer reads `pipeline_runs.records_meta.audit_table.rows` for the completed E.2 run + 7-day historical baseline. E.2's audit_table emits **4 scalar rows** with non-null `threshold` and computed `status`:
1. `unmapped_status_count` (threshold `<=3 WARN, <=1 PASS`, status dynamic)
2. `unmapped_decision_count` (threshold `<=5 WARN, <=3 PASS`, status dynamic)
3. `catalog_invalid_phase_count` (threshold `=0 PASS, >0 FAIL`, status dynamic)
4. `coa_stalled_count` (threshold `null`, status `INFO` — informational, no automated gate)

Plus existing pre-E.2 rows (permits_dirty, permits_updated, coa_evaluated, coa_phase_changes, stalled_count, unclassified_count, sys_velocity_rows_sec, sys_duration_ms) — UNCHANGED.

**Spec 48 §3.2 — DeepSeek narrative context (CORRECTED in v3 per Observability v2 CRIT-1):** the observer's actual code (`scripts/observe-chain.js` lines 200-230) builds the DeepSeek `contextJson` from `stepSummaries` which contain ONLY: `step`, `status`, `verdict` (from `audit_table.verdict`), `duration_ms`, `records_total`, `issues` (WARN/FAIL `audit_table.rows` extracted via `extractIssues()`), `failed_sample`, `vs_baseline`. The raw `records_meta` object — including `coa_rule_distribution`, `coa_phase_distribution`, `coa_matched_status_top20` — is **NOT currently passed to DeepSeek**.

E.2 will write distributions to `pipeline_runs.records_meta` (so the data is queryable post-hoc), but DeepSeek narrative analysis of distributions is **deferred to Spec 48 Improvement D** (queued-not-authorized — see `.cursor/queued_task_spec48_observer_loop_closure.md`). Until Improvement D ships, distribution drift detection is **manual** (operator queries `pipeline_runs` directly or via a one-off SQL).

This invalidates an earlier v2 claim. Operators reading the first-run observer report should NOT expect DeepSeek narrative to discuss `coa_*_distribution` values — those will appear in raw `pipeline_runs.records_meta` only.

**Spec 48 §3.3 — Output format (CORRECTED in v3 per Observability v2 CRIT-2):** `classify-lifecycle-phase.js` runs as a step in BOTH the `permits` chain AND the `coa` chain (per `scripts/manifest.json` lines 70 + 79). The observer derives report path as `${chainId}-followup.md`, so:
- Permits-chain runs of `classify-lifecycle-phase.js` → audit entries appear in `docs/reports/pipeline-observability/permits-followup.md`
- Coa-chain runs of `classify-lifecycle-phase.js` → audit entries appear in `docs/reports/pipeline-observability/coa-followup.md`

**Operator pre-ack and first-run annotation apply to BOTH files.** First E.2 production run will produce step-change anomalies in BOTH chains' followup reports (each chain produces its own observer report). Format and anomaly-detection logic identical across both.

**First-E.2-run baseline mitigation (Spec 48 §3.1 baseline behavior + plan Part 4):**
- Spec 48 Improvement C (`pipeline_baselines` pinned baseline) is queued-not-authorized — see `.cursor/queued_task_spec48_observer_loop_closure.md`.
- Active mitigation: operator pre-ack in commit message (text in Part 4) + manual annotation of first-run observer report as `[expected first-classified-run batch — not a regression]`.
- The pre-ack details the CORRECTED first-run distribution estimates (v1 fold #6): P20: 28,956; P19: 964; P3: 1,716; P2: 1,126; P1: 289; P4: 1 — preventing operator misclassification of expected values as anomalies.

**Spec 48 §3.4 — Error handling:** observer wraps all logic in try-catch and never propagates errors to E.2's chain run. NO CHANGE — E.2 doesn't touch the observer.

**Spec 48 §3.5 — PIPELINE_SUMMARY emission (observer's own):** observer emits its own audit_table per Spec 47 §R10. NO IMPACT — E.2 is the producer of the analyzed data, not the observer.

**Spec 48 §2.4 — Trigger:** observer spawned as detached fire-and-forget by `run-chain.js` after the chain lock is released. E.2's `classify-lifecycle-phase.js` runs as a chain step; observer fires after the chain completes. NO IMPACT on E.2's runtime.

**Observer-readable metric naming convention:**
- Scalar metrics that the observer should threshold-check live in `audit_table.rows[].metric` (CoA-prefixed: `coa_stalled_count`, `unmapped_status_count`, `unmapped_decision_count`, `catalog_invalid_phase_count`).
- Distribution metrics for DeepSeek narrative live in `records_meta` direct keys (`coa_rule_distribution`, `coa_phase_distribution`, `coa_matched_status_top20`). Distinguished from `audit_table.rows` by JSON structural location.

This separation matches Spec 47 §R10 (scalars only in audit_table.rows) AND Spec 48 §3.1 + §3.2 (observer thresholds scalars; DeepSeek narrates everything else).

### Spec 84 §7 + Engineering Standards §7 Dual Code Path

No new pure functions; TS twin already mirrors substrate. NO CHANGE in E.2.

### Pre-Review Self-Checklist (33 items — v3 expansion)

- (a) Migration 146 ADDs 4 columns + CHECK with NOT VALID + VALIDATE pattern (v1 fold #10); CHECK range 0..99 (v1 fold #17)
- (b) Migration 146 idempotent (`IF NOT EXISTS`); **DOWN is embedded commented block** in the same SQL file per project convention (v2 fold #2 — separate `*_DOWN.sql` file convention does not exist in this project)
- (b2) **Migration-existence startup guard** in classify-lifecycle-phase.js checks `information_schema.columns` for the 4 new columns; throws clear error if mig 146 not applied (v2 fold #9)
- (b3) **Catalog Map build + startup assertions run INSIDE `withAdvisoryLock` callback** (v2 fold #5 — preserves existing race-condition prevention)
- (c) `classify-lifecycle-phase.js` import block reverts the Option 2 destructure rename
- (d) Catalog Map built once at startup with **aliased SQL** (`lifecycle_group AS "group"`, etc. — v1 fold #3); **`parseFloat` + `isFinite` guard for `bid_value`** (v2 fold #7 — `Number()` coerces `''` to 0); frozen rows; **catalog source-literal startup assertion** present (v1 fold #15)
- (e) `classifyCoaPhase` (NOT `classifyCoaPhaseLegacy`) consumed; `mapToUniversalStream` called with `'coa.status'` source
- (f) **`mapToUniversalStream().phase` NEVER used as `lifecycle_phase` write target** (Observability v4 fold #104 invariant)
- (g) UPDATE writes 11 columns + `lifecycle_classified_at` **in ONE statement** (v1 fold on `flushCoaBatch` two-statement merge); transitions INSERT in same withTransaction
- (h) IS DISTINCT FROM on **all 11 columns** (v1 fold #14 — catalog evolution coverage)
- (i) `COA_BATCH_SIZE = 5000` (heap-bounded, NOT 65535/N — v1 fold #1); unnest takes 13 fixed params regardless of batch size
- (j) `lifecycle_transitions` INSERT uses **`old_phase` AND `old_seq` from JS batch** (NOT RETURNING — v1 fold #2; **v2 fold #1 CRIT — `old_seq` MUST be in `coaBatch.push`**); first-classification rows have `from_phase=NULL`; subsequent runs have correct `from_phase`
- (j2) **`phaseChangedBatch` filter checks BOTH phase AND seq changes** (v2 fold #10 — 3-way convergent finding; catalog evolution that updates seq-without-phase still produces ledger rows)
- (j3) **`lifecycle_transitions` INSERT uses `ON CONFLICT` for idempotency** OR plan documents that the JS filter is the sole idempotency mechanism (v2 fold #6 — Spec 47 §6.5 mandate)
- (k) Phase 2c initial transitions backfill extended to CoA rows; idempotent
- (l) 7-metric audit_table emitted: 4 scalars in `audit_table.rows` + 3 distributions in `records_meta`
- (m) `coa_stalled_count` is SEPARATE row from permit-side `stalled_count` (Observability v4 fold #105)
- (n) Thresholds with **dynamic status computation** via `computeAuditStatus` helper (v1 fold #7); justification text says baseline=2 not 3 (v1 fold #8)
- (o) `catalog_invalid_phase_count`: scoping **explicit** — live CoA classifications only (v1 fold #5); single-source in `audit_table.rows` (v1 fold #12); **SPLIT into 2 metrics** (v2 fold #8): `catalog_status_missing_count` (status not in Map) + `catalog_invalid_phase_count` (status present but phase non-standard)
- (o2) `coa_phase_changes` metric **renamed to `coa_rows_updated`** + new `coa_phase_transitions_count` (v2 fold #12 — `coasUpdated` counts ALL column changes, not just phase changes)
- (o3) `buildTop20WithOther` helper **defined inline** in Part 4 (v2 fold #13)
- (p) `compute-trade-forecasts.js` guard: SELECT extended with `p.lead_id` citing Phase B mig 132 (v1 fold #9); **consistent telemetry** (`coa_skipped_count` counter + first-occurrence WARN — v1 fold #13)
- (q) `update-tracked-projects.js` guard: SELECT extended with `p.lead_id AS permit_lead_id`; same telemetry pattern
- (r) CoA stream SELECT extended with `lead_id`, `old_phase`, `old_seq`, `permit_type`, `project_type`, `coa_type_class`, `neighbourhood_id`, `matched_status` (v1 folds #18, #21)
- (s) Backfill predicate extended: `OR matched_status IS NULL` for one-shot first-post-mig run (v1 fold #21)
- (t) **First-run distribution estimates corrected**: P20: 28,956; P19: 964; P3: 1,716; P2: 1,126; P1: 289; P4: 1 (v1 fold #6)
- (u) ADVISORY_LOCK_ID = **84** (v1 fold #11, verified at line 495)
- (v) 12 spec amendments + queued task → closed_task move
- (w) Tests cover: 1st-run + 2nd-run phase change (v1 fold #16); catalog source assertion (v1 fold #15); IS DISTINCT FROM dead-update (v1 fold #14); migration parity; `permits.lead_id IS NOT NULL` fixture (v1 fold #9)
- (x) Observer integration framed correctly: scalars drive automated WARN/FAIL via `extractIssues()` reading `audit_table.rows`. **Distributions are STORED in `pipeline_runs.records_meta` but NOT currently passed to DeepSeek `contextJson`** (v2 fold #3 corrects v1 mis-framing). DeepSeek narrative analysis of distributions is deferred to Spec 48 Improvement D (queued-not-authorized).
- (x2) Operator pre-ack references **BOTH `permits-followup.md` AND `coa-followup.md`** (v2 fold #4): `classify-lifecycle-phase.js` runs in both chains → both followup files receive E.2 metrics.
- (y) Operator pre-ack of first-classified-run anomaly in commit message
- (z) Phase F handoff note: `tracked_projects` JOIN is structurally permit-only (v1 fold #20)

### Execution Plan (per WF1 in `.claude/workflows.md`)

- [ ] **Contract Definition:** Migration 146 schema (UP + DOWN); `lifecycle_transitions` row shape (from_phase non-null on subsequent runs).
- [ ] **Spec & Registry Sync:** 12 spec amendments. Move queued task to closed_task. `npm run system-map`.
- [ ] **Schema Evolution:** `migrations/146_e2_coa_audit_columns.sql` (single file, UP + commented DOWN block per project convention). Apply to staging copy + verify forward-only via `migration-146-coa-audit-columns.infra.test.ts`.
- [ ] **Test Scaffolding:** ~7 new/extended tests per Tests section. Red Light: all new tests fail.
- [ ] **Red Light:** New tests fail; existing test suite green; typecheck passes.
- [ ] **Implementation:**
  - Migration 146 (~40 lines, UP + DOWN files)
  - `classify-lifecycle-phase.js` rewrite (~150 lines: catalog Map build + source assertion + stream SELECT extension + classifier call + flushCoaBatch SQL refactor + lifecycle_transitions INSERT + Phase 2c CoA extension + audit_table extension with dynamic status)
  - `compute-trade-forecasts.js` guard + SELECT extension + telemetry (~15 lines)
  - `update-tracked-projects.js` guard + SELECT extension + telemetry (~15 lines)
- [ ] **Auth Boundary & Secrets:** N/A.
- [ ] **Pre-Review Self-Checklist (26 items):** PASS/FAIL per item.
- [ ] **Multi-Agent Review (4 reviewers parallel — diff stage):** Gemini + DeepSeek + Independent worktree + Observability worktree.
- [ ] **Green Light:** `npm run typecheck && npm run lint && npm run test`; pre-commit hook full-suite pass; staging dry-run.
- [ ] **Operator pre-ack:** record in commit message.
- [ ] **WF6 commit:** Single commit. Message: `feat(84_lifecycle_phase_engine): WF1 Phase E.2 — classify-lifecycle-phase consumer rewrite + mig 146 audit columns + 7-metric audit_table + downstream lead_id guards (defensive) + 12 spec amendments`.
- [ ] **Followups append:** `docs/reports/review_followups.md`.

### Operating Boundaries

**Target Files:** (unchanged from v1; v4 fold v3-3 removes the separate `_DOWN.sql` file reference — DOWN is now an embedded commented block in `migrations/146_e2_coa_audit_columns.sql` per project convention)

**Out-of-Scope Files:** (unchanged from v1)

**Cross-Spec Dependencies:** (unchanged from v1)

---

> **PLAN LOCKED (v4)** — convergence trajectory: v1=21 findings → v2=16 → v3=12 → v4 folded all 12 v3 findings (3 CRIT + 4 HIGH + 2 MED + 3 LOW/NIT) per user authorization. No further plan-review rounds — diff-stage 4-reviewer round will catch any residuals.
>
> **Top-3 critical folds applied in v4:**
> 1. `lifecycle_transitions` UNIQUE INDEX `(lead_id, transitioned_at)` + `ON CONFLICT DO NOTHING` (mig 146 + INSERT) — fixes Gemini + DeepSeek 2-way convergent CRIT on non-idempotency.
> 2. Backfill predicate `OR matched_rule IS NULL` (was `OR matched_status IS NULL`) — fixes Gemini CRIT on catchall infinite-loop poison-pill.
> 3. 3 stale `*_DOWN.sql` references cleaned up — fixes Independent CRIT on doc contradiction.
>
> Do you authorize this WF1 Phase E.2 plan? (y/n)
>
> §10 note: §R10 `audit_table` now has 5 thresholded scalar rows (was 3 in v3): `unmapped_status_count`, `unmapped_decision_count`, `catalog_status_missing_count` (NEW), `catalog_invalid_phase_count` (split), `coa_stalled_count`. Plus 2 INFO rows (`coa_rows_updated`, `coa_phase_transitions_count`). Plus 3 distributions in `records_meta` (not in audit_table.rows). Observer (Spec 48) reads only `audit_table.rows` for automated WARN/FAIL; distributions inspected manually via SQL example in operator pre-ack.
>
> DO NOT generate code. DO NOT modify scripts. TERMINATE RESPONSE until authorization.
