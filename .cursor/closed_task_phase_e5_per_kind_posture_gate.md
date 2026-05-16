# Active Task: WF1 #lifecycle-phase-engine-migration-E.5 — band recalibration operational gate (posture flag promotion path)

**Status:** Complete (2026-05-16; TDD Red→Green, diff-stage 4-reviewer round complete with PASS from Independent + Observability and zero E.5-introduced defects from Gemini + DeepSeek; 12 deferrals filed to `docs/reports/review_followups.md` #146-#157 per user defer-all authorization; WF6 commit). Phase E COMPLETE (E.1+E.2+E.3+E.4+E.5).
**Workflow:** WF1 (script extension — assert script gains posture-aware WARN→FAIL routing; mig 150 adds 1 new logic_variable; no business-table schema change)
**Domain Mode:** Backend/Pipeline (`scripts/quality/`, `scripts/seeds/`, `migrations/`, `src/tests/`, `docs/specs/`)
**Rollback Anchor:** `85c10ac` (Phase E.4 SHIP — per-seq distribution band assertion + mig 148 + mig 149)
**Parent WF:** Phase E — Lifecycle engine migration + bug 84-W12 fix + cohort-key extension (Spec 42 §6.11)
**Sub-deliverable position:** E.1 (substrate `7003683`) → E.2 (consumer wiring `ad0c178`) → E.3 (CoA-side granular cohorts `9902860`) → E.4 (per-seq bands `85c10ac`) → **E.5 (band recalibration operational gate — THIS task)**
**Adversarial review:** USER-REQUESTED — 4 reviewers (Gemini + DeepSeek + Independent + Observability) at BOTH plan + diff stages.
**Standards adherence (user-mandated):** `00_engineering_standards.md` §2 (try-catch), §3 (database — mig 150 logic-variables only), §6 (logError), §9 (pipeline safety); Spec 47 §R1-R12; Spec 48 §3.1 (audit_table) + §3.2 (records_meta); TDD cadence per WF1 Red Light/Green Light gate (**user-mandated: failed test first**).

## v2 → v3 Revision Summary

v2 plan-review (4 reviewers — Gemini + DeepSeek + Independent + Observability) **unanimously diagnosed the same root cause:** v2's revision summary header was updated to describe the per-kind 3-flag design (per v1 fold v1-conv-HIGH), but Parts 2-5 + compliance sections + spec amendments + commit message + Operating Boundaries + audit row counts were NOT updated. The plan was internally inconsistent — an implementer following Part 2 code blocks would have built v1 (single flag) not v2 (3 per-kind flags). v3 fully rewrites the body. Honest assessment: my v2 fold cut corners; v2 reviewers correctly caught this.

Plus 2 genuinely new bugs caught in v2 round:

| # | Finding | Reviewer(s) | Severity | v3 Resolution |
|---|---|---|---|---|
| v2-conv-CRIT-body | v2 revision summary header described per-kind 3-flag design but body of Parts 2-5 + compliance + spec amendments + commit message still referenced v1 single-flag (`promoteToFail` boolean, 1 Zod key, 1 audit row, 30-row total, single UPDATE in rollback). | All 4 reviewers unanimous | CRITICAL | **FULL BODY REWRITE** — Part 2 Zod schema now adds 3 keys; `anyPromotePostureActive` computed as OR of 3 flags; 3 separate audit rows (one per kind) with INFO↔WARN transition; branch routing reads kind-specific flag at each push site; warnings array gets per-violation prefix (not run-level); Part 3 seed JSON has 3 entries; Part 4 EXPECTED_LOGIC_VAR_KEYS gets 3 entries; Part 5 tests assert 32 rows + 3 INSERTs; Spec 42/84/48 amendments + commit message all reference 3 per-kind keys. |
| v2-G-CRIT-sql | Pre-promotion checklist Step 1 SQL: `SELECT verdict FROM pipeline_runs WHERE ... LIMIT 7` checking for `verdict='completed'`. **REAL BUG** — `pipeline_runs.status` is `'completed'` even when `audit_table.verdict='WARN'` or `'FAIL'`. The query misleads operators into believing WARN/FAIL runs are PASS runs, causing premature promotion. | Gemini CRIT | CRITICAL | **FIX** — Step 1 SQL rewritten to: `SELECT id, started_at, records_meta->'audit_table'->>'verdict' AS verdict FROM pipeline_runs WHERE pipeline LIKE '%:assert-lifecycle-phase-distribution' AND status = 'completed' ORDER BY started_at DESC LIMIT 7;` — operator visually inspects the verdict column for all 7 rows to be `'PASS'`. The `status='completed'` filter just excludes failed/skipped runs from the 7-run sample. |
| v2-Obs-J-prefix | Per-violation prefix selection in mixed-posture state — when `flag_band_violation=1` but a `no_band_configured` violation fires (routes to WARN since `flag_no_band_configured=0`), the warning incorrectly receives the `[E.5 FAIL POSTURE]` prefix because `anyPromotePostureActive` is true. **REAL BUG** — prefix must be per-violation-kind, not per-run. | Observability HIGH (FAIL verdict) | HIGH | **FIX** — replace single run-level `posturePrefix` with a `renderPrefix(kind)` helper that returns `[E.5 FAIL POSTURE]` only if THAT kind's flag is 1; otherwise `[E.4 WARN-ONLY POSTURE]`. Each violation in the preview gets its own prefix. The bulk-summary header keeps a "[E.5 FAIL POSTURE — N violations halt the pipeline]" only when seqBandsFailing > 0. |
| v2-Obs-E-seq | `emitSummary` sequencing under throw — if `throw new Error(...)` in the FAIL path fires before `emitSummary` is called, observer sees the step FAILED with no PIPELINE_SUMMARY (no audit rows to extract). Plan didn't specify the ordering. | Observability HIGH | HIGH | **FIX** — Part 2 explicit sequencing requirement: `emitSummary(...)` is called BEFORE the `if (failures.length > 0) throw new Error(...)` check (matches existing E.4 implementation at script line 612 ↔ line 646). Documented as load-bearing in Part 2. |
| v2-G-MED-warn-fatigue | WARN-status posture rows always appearing in narrative could cause alert fatigue. **CLARIFICATION** — verdict cascade uses `failures[]`/`warnings[]` arrays NOT `auditRows.some(r => r.status === 'WARN')` (this script's pattern, verified against E.4 line 587). PASS verdict is still possible with WARN-status posture rows; the narrative-only visibility is the design intent. | Gemini MED | MED (doc) | **FOLD as doc** — Spec 84 §3.4 + Spec 48 §3.1 amendment notes: "WARN-status posture rows surface in observer narrative for operator visibility but do NOT cascade to verdict WARN (verdict derives from `failures[]`/`warnings[]` arrays per Spec 47 §R10). PASS verdict remains achievable with armed posture; the audit_table.verdict reflects RUN health, not POSTURE state." |
| v2-G-MED-rollback | Rollback complexity — manual SQL edits across 4 file types is brittle under pressure. | Gemini MED | MED (doc) | **FOLD as doc** — Spec 84 §3.4 rollback section adds: "SAFEST rollback: `git revert` of the WF1 Phase E.5 commit + redeploy. The DB-level UPDATE is for IMMEDIATE incident response (operator can demote a flag in seconds via Control Panel) but does NOT remove the audit row entries from subsequent runs — only operator-driven flag demotion + revert removes the structural visibility." |
| v2-DS-MED-filename | Mig filename `150_lifecycle_seq_band_promote_to_fail.sql` singular vs 3-key insert. | DeepSeek MED | MED (doc) | **DEFER** — accept singular name as readable shorthand; would otherwise require migration renumbering. Note: `150_lifecycle_seq_band_promote_to_fail_flags.sql` is the cleaner name; deferring to a follow-up rename if needed. |

**v3 load-bearing changes (correcting v2's incomplete fold):**

1. **Full body rewrite for per-kind 3-flag design** (CRIT) — Parts 2-5 + compliance + spec amendments + commit message all reference 3 keys, 32 audit rows, 3 separate posture rows, branch routing per-kind, per-violation prefix selection.

2. **Step 1 SQL fix** (CRIT — Gemini) — checklist references `audit_table.verdict` not `pipeline_runs.status`. Operator can correctly identify 7 consecutive PASS runs.

3. **Step 3 SQL explicit JSONB query** (HIGH — Observability) — `EXISTS (SELECT 1 FROM jsonb_array_elements(records_meta->'seq_violations') AS v WHERE v->>'kind' = 'expected_data_missing')` wrapped in the full query template.

4. **Per-violation prefix selection** (HIGH — Observability) — `renderPrefix(kind)` helper consults the kind-specific flag. Mixed-posture state renders correctly.

5. **`emitSummary` before `throw`** (HIGH — Observability) — explicit sequencing requirement; matches existing E.4 pattern.

6. **Verdict-cascade clarification** (MED — Gemini) — Spec 84 §3.4 + Spec 48 §3.1 amendments note that WARN-status posture rows DON'T cascade to verdict WARN (script uses arrays-based cascade per E.4).

7. **`git revert` as safer rollback** (MED — Gemini) — Spec 84 §3.4 documents the safer recovery path.

8. **All 32-row references corrected** throughout body — was inconsistent 30/32 in v2.

9. **`posture` field on violation objects** with per-kind lookup at write time — Phase F forward-compat.

## v1 → v2 Revision Summary

v1 plan-review (4 reviewers — Gemini + DeepSeek + Independent + Observability) surfaced 12 actionable findings. All folded in v2. The biggest v2 design change: **per-kind posture flags** (3 keys) replacing the v1 all-or-nothing global flag.

| # | Finding | Reviewer(s) | Severity | v2 Resolution |
|---|---|---|---|---|
| v1-conv-CRIT | Posture invisible under FAIL: the emit guard `if (seqBandsWarn > 0)` never fires when violations route to `seqBandsFailing`. INFO-status posture row is filtered by `extractIssues()` (Spec 48 §3.1). Net effect: after promotion + PASS run, the followup file has NO record that posture is FAIL-armed; on first FAIL run, the `[E.5 FAIL POSTURE]` prefix is suppressed. | Independent CRIT-1 + Observability H1 (2/4 convergent) | CRITICAL | **FOLD** — two changes: (a) expand emit guard to `(seqBandsWarn > 0 \|\| anyPromotePostureActive && seqBandsFailing > 0)`; (b) when ANY of the 3 per-kind posture flags is 1, set posture audit row(s) to WARN status (not INFO) so `extractIssues()` surfaces them in every post-promotion run's narrative. |
| v1-G-CRIT | Plan stated `lifecycle_seq_unclassified_max` tightening as a goal but the implementation has zero work for it. Either implement OR explicitly defer. | Gemini CRIT | CRITICAL (doc-only) | **FOLD as explicit deferral** — "Why this task exists" + Goal sections updated: unclassified_max tightening is OPERATOR-DRIVEN via Spec 86 Control Panel after Phase D ramps (no code change needed; the key already exists with default 5000 from mig 148). Spec 84 §3.4 pre-promotion checklist Step 2 documents the tightening recommendation. No migration to "shrink" the default — that's the operator's call once they observe stable convergence. |
| v1-I-CRIT-2 | Test plan describes "seed completeness" as a NEW test, but the existing `control-panel.logic.test.ts` bidirectional parity test (added 2026-05-15 for E.4) already enforces it. Adding to seed without adding to `EXPECTED_LOGIC_VAR_KEYS` causes the existing test to FAIL — not a "new test failing" but an "existing test regressed." | Independent CRIT-2 | CRITICAL (workflow sequencing) | **FOLD** — test plan restructured: (a) extending `EXPECTED_LOGIC_VAR_KEYS` is described as a CODE CHANGE that lands in the same commit as the seed addition (not as a new test); (b) no "seed completeness" test added (relies on existing parity test); (c) commit sequencing note added: seed JSON + EXPECTED_LOGIC_VAR_KEYS extension are atomic. |
| v1-conv-HIGH | All-or-nothing global posture flag is operationally too coarse — a single structural `expected_data_missing` seq (e.g., seq 22 'Closed' with NULL rows_count) would block promotion for ALL bands. Different violation kinds have different operational semantics: `band_violation` (data shifted, legitimate alert), `no_band_configured` (operator config gap; new seq appeared), `expected_data_missing` (data deletion / classifier-skip suggestion). | Gemini HIGH + DeepSeek HIGH (2/4 convergent) | HIGH | **FOLD — per-kind flag split.** Replace 1 global flag with 3 per-kind flags: `lifecycle_seq_band_promote_to_fail_band_violation` (most aggressive operational gate), `lifecycle_seq_band_promote_to_fail_no_band_configured` (config-gap; default WARN through Phase F), `lifecycle_seq_band_promote_to_fail_expected_data_missing` (data-gap; usually promoted alongside band_violation but kept separate for ops). All 3 default to 0 (E.4 WARN-only posture). Operator promotes incrementally. Each branch reads its own flag at the per-seq violation push site. |
| v1-DS-HIGH-msg | Distinct failure messages per violation kind — v1 used a single `outside expected band` template for all 3 kinds. For `no_band_configured` this is wrong (no band to reference); for `expected_data_missing` it's semantically wrong (the issue is "no rows" not "outside band"). | DeepSeek HIGH | HIGH | **FOLD** — 3 distinct failure-message templates: `'seq ${seq}: ${actual} outside expected band [${band.min}, ${band.max ?? "∞"}]'` (band_violation); `'seq ${seq}: ${actual} rows but NO BAND configured'` (no_band_configured); `'seq ${seq}: 0 rows observed (band expects min=${band.min}) — verify classifier coverage, source freshness, or catalog vs production data drift'` (expected_data_missing, same as the warnings-array preview rendering for consistency). |
| v1-DS-HIGH-check | No DB CHECK constraint on `variable_value IN (0,1)` for posture flags. Operator typo (e.g., set to 2) crashes pipeline at Zod startup; recovery requires manual SQL fix. | DeepSeek HIGH | HIGH | **FOLD** — mig 150 adds DB-level CHECK constraints for each of the 3 new keys: `CONSTRAINT lifecycle_seq_band_promote_to_fail_band_violation_check CHECK (variable_value IN (0, 1))` etc. PostgreSQL constraints on `logic_variables` are per-row (already there for some keys via mig 092's variable_value range). The CHECKs are scoped to ONLY these 3 keys via `WHERE variable_key = '...'` — actually PostgreSQL CHECK constraints can't be conditional on the same row's data. **REVISED:** use a TRIGGER or accept Zod-only enforcement. Decision: **Zod is the source of truth** (per Spec 47 §R4); add operator-recovery doc instead of DB CHECK (constraint complexity not worth the implementation cost). |
| v1-conv-HIGH-SQL | Pre-promotion checklist Steps 1/2/3 need explicit SQL queries — operator can't execute the checklist from the followup file alone (Spec 48 §3.2 puts distributions in records_meta, not audit_table.rows where the observer surfaces them). | Independent HIGH + Observability M3 (2/4 convergent) | HIGH | **FOLD** — Spec 84 §3.4 pre-promotion checklist append 3 explicit SQL queries: Step 1 (7 consecutive PASS via `pipeline_runs` verdict query); Step 2 (seq_unclassified_count via `records_meta->'audit_table'->'rows'` JSONB path); Step 3 (`expected_data_missing` violation absence over 24h via `records_meta->'seq_violations'` filter). Operator copy-pastes the queries. |
| v1-I-HIGH-1 | Pre-promotion checklist needs explicit "if a seq has confirmed-structural `expected_data_missing` (classifier never produces it by design), reset its band.min to 0 before promoting `expected_data_missing` flag" clause. | Independent HIGH-1 | HIGH (subsumed by per-kind split) | **PARTIALLY ADDRESSED by per-kind split + explicit clause added** — operator can keep `_expected_data_missing` at WARN if a single seq is structurally absent. Spec 84 §3.4 checklist also documents the band.min=0 reset path for structural absences. |
| v1-I-HIGH-2 | Dual-gate cascade documentation — when phase-keyed `unclassified_count` is FAILing AND per-seq bands are also failing, operators may not realize they need to resolve unclassified_count first. | Independent HIGH-2 | HIGH (doc-only) | **FOLD as doc** — Spec 84 §3.4 amendment adds note: "If both `unclassified_count` and per-seq band gates FAIL on the same run, resolve `unclassified_count` first (phase-keyed coarse gate). Per-seq band gates are only diagnosable once classifier coverage is stable." |
| v1-DS-MED-warn | Warning count semantics under FAIL posture (`seqBandsWarn + seqBandsFailing` math) — when posture=1, all violations route to seqBandsFailing so seqBandsWarn stays 0; the sum is correct but the operator-narrative wording could be sharper. | DeepSeek MED | MED | **FOLD** — warning string under FAIL posture explicitly distinguishes: `${seqBandsFailing} per-seq bands outside expected range — ALL will cause FAIL`. WARN posture wording unchanged. |
| v1-conv-MED-shape | Structured `seq_violations` shape missing `posture` field — downstream Phase F / E.5 consumers can't distinguish WARN-only violations from FAIL-triggering violations from the data alone. | DeepSeek MED + Observability M2 (2/4 convergent) | MED | **FOLD** — extend structured shape from `{seq, actual, band_min, band_max, kind}` to `{seq, actual, band_min, band_max, kind, posture: 'warn'\|'fail'}`. Per-kind posture lookup at write time (matches the per-kind flag for the violation's kind). |
| v1-conv-MED-descriptor | `seq_bands_failing` audit row threshold descriptor in E.4 says "always 0 in E.4 v1" — stale after E.5 promotion. | Observability M1 + Independent (2/4 convergent) | MED | **FOLD** — descriptor updated to: `'== 0 PASS, > 0 FAIL (E.5 posture-gated — fires when any of the 3 lifecycle_seq_band_promote_to_fail_* flags is 1 and a matching violation occurs)'`. Removes the stale "always 0 in E.4 v1" historical clause. |

**v2 load-bearing changes:**

1. **Per-kind flag split (HIGH 2/4 convergent)** — 3 logic_variables (one per violation kind) instead of 1 global flag. Operator promotes incrementally. Branch routing reads the relevant flag at each violation push site.
2. **Posture visibility under FAIL (CRIT 2/4 convergent)** — emit guard expanded + posture audit rows become WARN-status when ANY of the 3 flags is 1.
3. **Distinct per-kind failure messages (HIGH)** — band_violation / no_band_configured / expected_data_missing each render with kind-appropriate text.
4. **Pre-promotion checklist with explicit SQL queries (HIGH 2/4)** — 3 SQL queries appended to Spec 84 §3.4 so checklist is self-contained.
5. **Atomic seed + EXPECTED_LOGIC_VAR_KEYS landing (CRIT)** — workflow sequencing note added; no new "seed completeness" test (existing parity test covers it).
6. **`unclassified_max` tightening explicitly deferred (CRIT-doc)** — operator-driven via Control Panel after Phase D ramps; no code change in E.5.
7. **`seq_violations` shape gains `posture` field (MED 2/4)** — forward-compat for Phase F consumers.
8. **`seq_bands_failing` descriptor updated (MED 2/4)** — removes stale "always 0 in E.4 v1" clause.
9. **DB CHECK constraint deferred (HIGH — design decision)** — Zod-only enforcement per Spec 47 §R4; operator-recovery doc added.
10. **Dual-gate cascade doc (HIGH)** — Spec 84 §3.4 explicit note: resolve unclassified_count before diagnosing per-seq bands.
11. **Warning count semantics under FAIL (MED)** — wording sharpened.
12. **`expected_data_missing` structural-absence checklist clause (HIGH subsumed)** — operator can keep `_expected_data_missing` flag at WARN if a single seq is structurally absent.

v2 total `audit_table.rows` count: 29 (E.4) + 3 per-kind posture rows = 32 rows (vs v1's 30). Each per-kind posture row reads `INFO` when its flag is 0, `WARN` when 1.

## Why this task exists

Phase E.4 (`85c10ac`) shipped the per-seq distribution band assertion with **WARN-only first-deploy posture**. The `seq_bands_failing` audit row is hardwired to 0 — it's a structural promotion hook. The plan explicitly anchored:

> E.5 (operational gate — promotes `seqBandsWarn++` to `seqBandsFailing++` after 7 consecutive PASS runs on staging; tightens `lifecycle_seq_unclassified_max` from default 5000 to a calibrated target) follows next.

Pre-E.5 state (post-E.4 SHIP):

- All seq-keyed band violations route to `seqBandsWarn++` (no FAIL escalation). Operators see WARN audit rows + posture-prefixed warnings in followup files but the pipeline never FAILs on a per-seq band gap. This is intentional for first-deploy / Phase D + E.2 ramp-up where false positives are expected.
- `seqBandsFailing` is declared as `let seqBandsFailing = 0` and NEVER incremented anywhere (E.4 verified: `grep -c "seqBandsFailing\\+\\+"` returns 0). The FAIL status path is live code (`status: seqBandsFailing === 0 ? 'PASS' : 'FAIL'`) but unreachable in E.4 v1.
- E.5 is the operator-driven gate that promotes this routing from WARN to FAIL — flipping the gate from "operator-tunable observability" to "automated pipeline halt on band violations."

Operational consequence of NOT shipping E.5: the per-seq bands remain operator-observable but never block a pipeline run. A real classifier regression that shifts the per-seq distribution outside expected bounds would surface as WARN but the chain would continue. E.5 closes this gap on a per-decision basis — operators choose when to promote.

### E.5 design — posture-flag mechanism

The v3 design (per v1 fold + v2 per-kind split) routes WARN/FAIL increments through **3 per-kind integer logic_variables**: `lifecycle_seq_band_promote_to_fail_band_violation`, `_no_band_configured`, `_expected_data_missing`. Each defaults to `0` (E.4 v1 — WARN routing); after operator promotion of an individual kind, set to `1` (E.5 v2 — FAIL routing for that kind). Per-kind independent promotion is the load-bearing design choice — operators promote `band_violation` first (most aggressive regression detector), then `expected_data_missing` (after confirming structural absences), then `no_band_configured` last (rare; usually kept at WARN as a config-gap signal).

**Why integer 0/1 (not boolean / not enum string):**
- `logic_variables.variable_value` is `DECIMAL NOT NULL` (mig 092). A string posture flag would require the `variable_value_json` JSONB path (mig 097) which adds parsing complexity for a single-bit decision.
- Existing Zod patterns (mig 119, mig 148) use `z.coerce.number().int()` — integer is the project convention.
- Spec 86 Control Panel renders `logic_variables` numerics with delta-guard UI — operators can promote via `/admin/control-panel → marketplace constants → 'lifecycle_seq_band_promote_to_fail' → 1`. Single-click promotion without DB-direct edit.

**Why not auto-promote** (e.g., script reads pipeline_runs and auto-flips after 7 consecutive PASS): operator-driven gates are the project pattern (precedent: Spec 48 Improvement C "pinned baseline" — manual annotation is the active mitigation). Auto-promotion adds a new failure mode (the auto-promoter could fire on a transient post-restart blip). Manual gate with explicit operator decision is safer for v1.

**Per-seq granular posture override** (DEFERRED to a follow-up): a future enhancement could let operators promote individual seqs while leaving others on WARN routing within a given kind. v3's 3 per-kind flags provide kind-level granularity (operator can keep `no_band_configured` at WARN while promoting `band_violation` to FAIL); per-seq overrides WITHIN a kind are deferred. Per-seq overrides are a Phase F or hardening candidate.

This task does NOT modify the classifier, does NOT modify business-table schemas, does NOT modify `compute-phase-calibration.js`, does NOT modify Phase F consumers. It's a **3 per-kind flag** promotion mechanism + audit observability + operator pre-promotion checklist with explicit SQL queries.

## Context

### Goal

1. **Migration 150 — add 3 per-kind posture logic_variables** (v2 fold v1-conv-HIGH per-kind split):
   - `lifecycle_seq_band_promote_to_fail_band_violation` (integer; default 0; values 0 or 1).
   - `lifecycle_seq_band_promote_to_fail_no_band_configured` (integer; default 0; values 0 or 1).
   - `lifecycle_seq_band_promote_to_fail_expected_data_missing` (integer; default 0; values 0 or 1).
   Each idempotent via `ON CONFLICT (variable_key) DO NOTHING` — preserves operator-tuned values on re-apply. Zod-only value-range enforcement (no DB CHECK constraint per v2 fold v1-DS-HIGH-check); Spec 47 §R4 is the source of truth. (`lifecycle_seq_unclassified_max` tightening is operator-driven post-E.5 via Spec 86 Control Panel — NOT a v2 code change per v2 fold v1-G-CRIT explicit deferral.)

2. **Script extension** — `scripts/quality/assert-lifecycle-phase-distribution.js`:
   - **Zod schema extension** (3 new required keys, each `.int().min(0).max(1)`):
     ```js
     const LOGIC_VARS_SCHEMA = z.object({
       // ... existing keys preserved
       lifecycle_seq_band_promote_to_fail_band_violation:        z.coerce.number().int().min(0).max(1),
       lifecycle_seq_band_promote_to_fail_no_band_configured:    z.coerce.number().int().min(0).max(1),
       lifecycle_seq_band_promote_to_fail_expected_data_missing: z.coerce.number().int().min(0).max(1),
       // ...
     }).passthrough().superRefine(...);
     ```
   - **Per-kind flag extraction** + composite `anyPromotePostureActive`:
     ```js
     const promoteToFail_band_violation        = logicVars.lifecycle_seq_band_promote_to_fail_band_violation === 1;
     const promoteToFail_no_band_configured    = logicVars.lifecycle_seq_band_promote_to_fail_no_band_configured === 1;
     const promoteToFail_expected_data_missing = logicVars.lifecycle_seq_band_promote_to_fail_expected_data_missing === 1;
     const anyPromotePostureActive = promoteToFail_band_violation || promoteToFail_no_band_configured || promoteToFail_expected_data_missing;
     ```
   - **Posture-flag-to-kind map** (used by helpers):
     ```js
     const POSTURE_FLAG_BY_KIND = {
       band_violation:        promoteToFail_band_violation,
       no_band_configured:    promoteToFail_no_band_configured,
       expected_data_missing: promoteToFail_expected_data_missing,
     };
     ```
   - **Branch routing per violation kind** — each push site reads ONLY its own flag:
     - **`band_violation`** main loop: push violation object with `posture` field; if `promoteToFail_band_violation` → `seqBandsFailing++` + `failures.push('seq ${seq}: ${actual} outside expected band [${band.min}, ${band.max ?? "∞"}]')`; else `seqBandsWarn++`.
     - **`no_band_configured`** Direction 1: push violation; if `promoteToFail_no_band_configured` → `seqBandsFailing++` + `failures.push('seq ${seq}: ${actual} rows but NO BAND configured')`; else `seqBandsWarn++`.
     - **`expected_data_missing`** Direction 2: push violation; if `promoteToFail_expected_data_missing` → `seqBandsFailing++` + `failures.push('seq ${seq}: 0 rows observed (band expects min=${band.min}) — verify classifier coverage, source freshness, or catalog vs production data drift')`; else `seqBandsWarn++`.
   - **3 separate posture audit rows** (v3 fold v2-conv-CRIT-body) — one per kind, status flips INFO↔WARN per the kind's own flag:
     ```js
     auditRows.push({
       metric: 'lifecycle_seq_band_promote_to_fail_band_violation',
       value:  promoteToFail_band_violation ? 1 : 0,
       threshold: '0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates "band_violation" kind. See Spec 84 §3.4.',
       status: promoteToFail_band_violation ? 'WARN' : 'INFO',  // WARN-status when armed so extractIssues() surfaces it in narrative
     });
     // ... 2 more analogous push() calls for the other 2 flags
     ```
   - **Updated `seq_bands_failing` descriptor** (v3 fold v2-conv-MED-descriptor):
     ```js
     auditRows.push({
       metric: 'seq_bands_failing',
       value: seqBandsFailing,
       threshold: '== 0 PASS, > 0 FAIL (E.5 posture-gated — fires when any of the 3 lifecycle_seq_band_promote_to_fail_* flags is 1 and a matching violation occurs)',
       status: seqBandsFailing === 0 ? 'PASS' : 'FAIL',
     });
     ```
   - **Emit guard expansion** (v3 fold v2-conv-CRIT-body cascading from v1-conv-CRIT):
     ```js
     if (seqBandsWarn > 0 || (anyPromotePostureActive && seqBandsFailing > 0)) {
       // ... preview construction (per-violation prefix renderer below)
     }
     ```
   - **Per-violation prefix renderer** (v3 fold v2-Obs-J-prefix — REAL BUG FIX):
     ```js
     function renderPrefix(kind) {
       // POSTURE_FLAG_BY_KIND lookup tells us THIS violation's posture.
       // Mixed-posture state: flag_band_violation=1 + flag_no_band_configured=0
       // → band_violation violations get [E.5 FAIL POSTURE]; no_band_configured
       // violations get [E.4 WARN-ONLY POSTURE]. Per-violation, not per-run.
       //
       // v4 fold v3-G-MED-prefix-kind: prefix string includes the kind name
       // so operator triage during incident response sees the specific gate
       // that halted the pipeline (e.g. `[E.5 FAIL POSTURE — 'band_violation' kind halts pipeline]`).
       // Unknown kind falls back to WARN-only prefix (defensive default; the
       // `kind` field is structurally constrained to 3 values by the push sites).
       return POSTURE_FLAG_BY_KIND[kind]
         ? `[E.5 FAIL POSTURE — '${kind}' kind halts the pipeline]`
         : '[E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up]';
     }
     ```
     Each violation in the preview rendered with its own kind-specific prefix:
     ```js
     const preview = seqViolationsCapped.slice(0, previewCount).map((v) =>
       `${renderPrefix(v.kind)} ${renderViolation(v)}`
     ).join('; ');
     ```
   - **Structured `seq_violations` shape extension** (v3 fold v2-conv-MED-shape — Phase F forward-compat):
     ```js
     seqViolations.push({
       seq, actual, band_min: band.min, band_max: band.max, kind,
       posture: POSTURE_FLAG_BY_KIND[kind] ? 'fail' : 'warn',  // self-describing for Phase F
     });
     ```
   - **`emitSummary` sequencing** (v3 fold v2-Obs-E-seq — REAL BUG FIX): `pipeline.emitSummary(...)` MUST be called BEFORE `if (failures.length > 0) throw new Error(...)` so the audit_table is persisted to `pipeline_runs` even on FAIL runs. Matches existing E.4 implementation at script line 612 (emit) ↔ line 646 (throw). v3 explicitly documents this load-bearing ordering — the observer relies on the PIPELINE_SUMMARY being written before the throw.

3. **Seed JSON** — add 3 new entries (one per per-kind flag), each with `default: 0`:
   ```json
   "lifecycle_seq_band_promote_to_fail_band_violation":        { "default": 0, "type": "number", "min": 0, "max": 1, "description": "Phase E.5 gate for `band_violation` kind. 0=WARN, 1=FAIL. See Spec 84 §3.4." },
   "lifecycle_seq_band_promote_to_fail_no_band_configured":    { "default": 0, "type": "number", "min": 0, "max": 1, "description": "Phase E.5 gate for `no_band_configured` kind (operator config gap). 0=WARN, 1=FAIL. See Spec 84 §3.4." },
   "lifecycle_seq_band_promote_to_fail_expected_data_missing": { "default": 0, "type": "number", "min": 0, "max": 1, "description": "Phase E.5 gate for `expected_data_missing` kind (data deletion / classifier-skip signal). 0=WARN, 1=FAIL. See Spec 84 §3.4." }
   ```

4. **`control-panel.logic.test.ts`** — extend `EXPECTED_LOGIC_VAR_KEYS` with **3 new entries**:
   ```js
   'lifecycle_seq_band_promote_to_fail_band_violation',
   'lifecycle_seq_band_promote_to_fail_no_band_configured',
   'lifecycle_seq_band_promote_to_fail_expected_data_missing',
   ```
   v3 fold v2-conv-CRIT-body atomicity: this edit lands in the SAME COMMIT as the seed JSON addition; no separate "seed completeness" test added — existing bidirectional parity test already covers this surface.

5. **Spec amendments (3)**:
   - **Spec 42 §6.11 Phase E.5** — anchor with mig 150 + script-extension description + commit SHA placeholder.
   - **Spec 84 §3.4 band design** — extend with: (a) per-kind posture-flag mechanism (3 flags, independent operator promotion path); (b) operator pre-promotion checklist with **explicit SQL queries for Steps 1/2/3** (v2 fold v1-conv-HIGH-SQL); (c) dual-gate cascade note: resolve `unclassified_count` FAIL first before diagnosing per-seq band gates (v2 fold v1-I-HIGH-2); (d) structural `expected_data_missing` clause: if a seq has confirmed-structural absence, keep `_expected_data_missing` flag at WARN OR reset `band.min` to 0 (v2 fold v1-I-HIGH-1).
   - **Spec 48 §3.1** — note 32-row audit_table (3 new posture rows; their status is INFO when flag=0, WARN when flag=1 — v2 fold v1-conv-CRIT visibility fix) + posture-aware warning prefix discrimination.

6. **Operator pre-promotion checklist** (in Spec 84 §3.4): explicit decision criteria with **3 copy-pastable SQL queries** + the per-kind promotion command (or Control Panel click path) + structural-absence resolution path.

### Target Specs (required reading per CLAUDE.md WF1 protocol)

- `docs/specs/00_engineering_standards.md` §2 (try-catch), §3 (database — mig 150 is logic-variables-only, idempotent), §6 (logError), §9 (pipeline safety — no transaction-boundary changes; idempotent re-runs).
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12 (script is pre-compliant; E.5 extends within envelope; §R4 mandates Zod validation for the new key).
- `docs/specs/01-pipeline/48_pipeline_observability.md` §3.1 (audit_table.rows for automated WARN/FAIL gates), §3.2 (records_meta distributions NOT to DeepSeek), §3.3 (observer file routing — assert script runs in both chains).
- `docs/specs/01-pipeline/42_chain_coa.md` §6.11 (Phase E.5 anchor).
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3.4 (band design — posture mechanism extension).

### Key Files

**Targets:**
- `migrations/150_lifecycle_seq_band_promote_to_fail.sql` (NEW — 3 INSERT rows into logic_variables, one per per-kind flag, with ON CONFLICT DO NOTHING). Filename retains singular form for v3 readability; rename to `150_lifecycle_seq_band_promote_to_fail_flags.sql` deferred to a future cleanup.
- `scripts/quality/assert-lifecycle-phase-distribution.js` (EXTEND — Zod schema gains **3 keys** with `.int().min(0).max(1)`; per-kind boolean extraction + `anyPromotePostureActive` OR + `POSTURE_FLAG_BY_KIND` map; main-loop band-violation push reads `promoteToFail_band_violation`; Direction 1 reads `promoteToFail_no_band_configured`; Direction 2 reads `promoteToFail_expected_data_missing`; **3 new posture audit rows** with INFO↔WARN transition per the kind's own flag; `renderPrefix(kind)` per-violation helper; `seq_violations.posture` field; `emitSummary` BEFORE `throw` sequencing).
- `scripts/seeds/logic_variables.json` (ADD — **3 new entries**: `lifecycle_seq_band_promote_to_fail_band_violation`, `_no_band_configured`, `_expected_data_missing`).
- `src/tests/migration-150-lifecycle-seq-band-posture.infra.test.ts` (NEW — mig 150 shape regression; asserts 3 INSERT rows with the 3 per-kind keys).
- `src/tests/assert-lifecycle-phase-distribution.infra.test.ts` (EXTEND — Phase E.5 v3 shape regression: 3-key Zod schema, per-kind branch routing, 3 posture audit rows with INFO/WARN transition, `renderPrefix(kind)` helper, `seq_violations.posture` field, behavioral test for mixed-posture state, 32-row audit_table assertion, `emitSummary` BEFORE `throw` source-order check).
- `src/tests/control-panel.logic.test.ts` (EXTEND — add **3 entries** to `EXPECTED_LOGIC_VAR_KEYS`, one per per-kind flag).
- `docs/specs/01-pipeline/42_chain_coa.md` §6.11 anchor resolution (post-commit).
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3.4 posture-mechanism extension + operator pre-promotion checklist (post-commit).
- `docs/reports/review_followups.md` (E.5 close-out note).

**Out-of-Scope:**
- `scripts/classify-lifecycle-phase.js` (E.2 consumer — UNCHANGED).
- `scripts/lib/lifecycle-phase.js` (E.1 substrate — UNCHANGED).
- `scripts/compute-phase-calibration.js` (E.3 reader — UNCHANGED).
- `universal_stream_catalog` schema (mig 128 — UNCHANGED).
- `permits` / `coa_applications` schema (UNCHANGED — `lifecycle_seq` from mig 132/133 unchanged).
- `migrations/148_lifecycle_seq_bands_logic_variables.sql` + `migrations/149_lifecycle_seq_indices.sql` (E.4 — UNCHANGED).
- `scripts/observe-chain.js` (Spec 48 observer — UNCHANGED; consumes audit_table.rows + warnings transparently).
- Per-seq granular posture overrides WITHIN a kind (DEFERRED to a follow-up; v3 has per-kind global flags providing kind-level granularity but not per-seq granularity).
- Auto-promotion (consecutive PASS run tracker via pipeline_runs query) — DEFERRED; v1 is operator-driven manual gate.

### Operating Boundaries

**Cross-Spec Dependencies:**
- Spec 47 §R4 (Zod config validation; mandates the new key be validated).
- Spec 47 §R10 (audit_table verdict derivation from row statuses; existing cascade unchanged but `seqBandsFailing > 0` now actually reachable).
- Spec 48 §3.1 (29-row audit_table grows to **32 rows** with the 3 new per-kind posture rows — each transitions INFO→WARN when its flag is 1).
- Spec 86 §1 (Control Panel renders the new key as an editable marketplace constant — automatic; no UI code change).
- Pre-promotion checklist requires operator awareness of Phase D + E.2 ramp-up status.

## Technical Implementation

### Part 1 — Migration 150 (single logic_variable INSERT)

```sql
-- migrations/150_lifecycle_seq_band_promote_to_fail.sql
-- Phase E.5 — operator-driven promotion gate for per-seq distribution
-- band violations from WARN (E.4 v1 default) to FAIL.
--
-- Adds 3 per-kind integer logic_variables that the assert script reads at
-- startup. Value semantics:
--   0 — WARN routing (E.4 default; band violations route to seqBandsWarn++)
--   1 — FAIL routing (E.5 v2 promotion; band violations route to seqBandsFailing++
--                     which triggers verdict FAIL + the existing throw cascade)
--
-- Why integer 0/1 not boolean/string:
-- - logic_variables.variable_value is DECIMAL NOT NULL (mig 092). String
--   posture would require variable_value_json (mig 097) — more complexity
--   for a single-bit decision.
-- - Existing Zod patterns (mig 119, mig 148) use z.coerce.number().int().
--   Integer is the project convention for tunable logic variables.
-- - Spec 86 Control Panel renders the key as an editable marketplace
--   constant — single-click promotion without DB-direct edit.
--
-- Operator pre-promotion checklist (full version in Spec 84 §3.4):
--   1. 7 consecutive PASS runs on staging (verify via pipeline_runs query).
--   2. Phase D + E.2 fully ramped: `seq_unclassified_count` < 100 for 3 days.
--   3. No `expected_data_missing` violations for >24h.
--   4. Operator authorizes promotion + runs:
--      UPDATE logic_variables SET variable_value = 1 WHERE variable_key IN (
--        'lifecycle_seq_band_promote_to_fail_band_violation',
--        'lifecycle_seq_band_promote_to_fail_no_band_configured',
--        'lifecycle_seq_band_promote_to_fail_expected_data_missing'
--      );  -- promote all 3, or use single-key UPDATE for incremental per-kind promotion
--      (OR Spec 86 Control Panel: /admin/control-panel → marketplace
--      constants → 'lifecycle_seq_band_promote_to_fail' → 1 → Save).
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves operator-
-- tuned values applied via admin Control Panel after deployment.
--
-- v4 fold (recurring across phases): NO explicit BEGIN/COMMIT (mig 135 R8
-- hotfix convention — migrate.js runner provides outer transaction).
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.5
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
-- SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.1

-- UP

-- v2 fold v1-conv-HIGH per-kind split: 3 separate flags allow operator to
-- promote each violation kind independently. band_violation is the most
-- aggressive gate (data shifted within a configured band — the canonical
-- regression signal). no_band_configured is a config-gap signal (new seq
-- appeared in production without a calibrated band — operator response is to
-- ADD a band, not FAIL the pipeline). expected_data_missing is a data-gap
-- signal (data absence relative to band.min > 0 — could be data deletion,
-- classifier-skip, or structural absence; operator should investigate before
-- promoting). All 3 default to 0 (WARN routing — E.4 v1 posture preserved).
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('lifecycle_seq_band_promote_to_fail_band_violation', 0,
   'Phase E.5 operational gate — per-kind posture for "band_violation" routing. 0=WARN (E.4 v1 default; seqBandsWarn++); 1=FAIL (E.5 v2 promotion; seqBandsFailing++ → verdict FAIL → pipeline halt). The canonical regression-detection gate. Operator-driven per Spec 84 §3.4 pre-promotion checklist.'),
  ('lifecycle_seq_band_promote_to_fail_no_band_configured', 0,
   'Phase E.5 operational gate — per-kind posture for "no_band_configured" routing (seq present in data but no band loaded — config gap). 0=WARN (default; operator config-gap signal); 1=FAIL (rare; reserved for ops teams that treat unconfigured seqs as a halt-worthy regression). Operator-driven per Spec 84 §3.4 pre-promotion checklist.'),
  ('lifecycle_seq_band_promote_to_fail_expected_data_missing', 0,
   'Phase E.5 operational gate — per-kind posture for "expected_data_missing" routing (band has min > 0 but zero observed rows — possible data deletion or classifier-skip). 0=WARN (default; operator investigates); 1=FAIL (after verifying no structurally-absent seqs remain; see Spec 84 §3.4 structural-absence resolution path). Operator-driven per Spec 84 §3.4 pre-promotion checklist.')
ON CONFLICT (variable_key) DO NOTHING;

-- v2 fold v1-DS-HIGH-check decision: Zod validation in the assert script
-- (`.int().min(0).max(1)` for each of the 3 keys) is the source of truth per
-- Spec 47 §R4. PostgreSQL CHECK constraints on logic_variables.variable_value
-- can't be scoped to specific variable_keys without per-row triggers (added
-- complexity not warranted). Operator typo crashes pipeline at Zod startup
-- with a clear error message; recovery is `UPDATE logic_variables SET
-- variable_value = 0 WHERE variable_key = 'lifecycle_seq_band_promote_to_fail_<kind>'`
-- (or Spec 86 Control Panel single-click).

-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b convention; matches mig 119/148 pattern).
--
-- To roll back manually:
--   DELETE FROM logic_variables WHERE variable_key IN (
--     'lifecycle_seq_band_promote_to_fail_band_violation',
--     'lifecycle_seq_band_promote_to_fail_no_band_configured',
--     'lifecycle_seq_band_promote_to_fail_expected_data_missing'
--   );
--
-- Then revert the assert-lifecycle-phase-distribution.js extension + the
-- 3 scripts/seeds/logic_variables.json additions + the 3 EXPECTED_LOGIC_VAR_KEYS
-- entries in src/tests/control-panel.logic.test.ts in one commit (the seed
-- JSON additions and EXPECTED_LOGIC_VAR_KEYS extensions are atomic per v2 fold
-- v1-I-CRIT-2 commit-sequencing constraint).
```

**Migration safety:** single INSERT into a config table; idempotent; sub-millisecond runtime; no business-table impact.

### Part 2 — Script extension: posture-aware routing

The complete v3 specification is in the Goal section (item #2 above, lines ~140-220 of this plan). Key elements summarized for Part 2 cross-reference:

- **3 per-kind Zod keys** with `.int().min(0).max(1)` (replaces v1/v2's single key).
- **3 per-kind booleans** + `anyPromotePostureActive` (OR) + `POSTURE_FLAG_BY_KIND` map.
- **Branch routing per push site** — each violation kind reads ONLY its own flag.
- **3 separate audit rows** with INFO→WARN status transition per kind.
- **`renderPrefix(kind)` helper** for per-violation prefix selection (NOT per-run). Mixed-posture state correctly distinguished.
- **`seq_violations.posture` field** (`'warn'|'fail'`) for Phase F forward-compat.
- **`seq_bands_failing` descriptor updated** — removes stale "always 0 in E.4 v1" clause.
- **`pipeline.emitSummary(...)` MUST be called BEFORE `if (failures.length > 0) throw new Error(...)`** — load-bearing ordering so the audit_table (incl. WARN-status posture rows + FAIL-status `seq_bands_failing`) is persisted to `pipeline_runs` even on FAIL runs (matches existing E.4 implementation at script line 612 ↔ line 646).
- **Verdict cascade clarification:** `failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS'`. WARN-status posture rows surface in observer narrative but do NOT cascade to verdict WARN.

**Audit row total after E.5:** 29 (E.4) + 3 new per-kind posture rows = **32 rows**.

### Part 3 — Seed JSON addition (3 entries)

```json
"lifecycle_seq_band_promote_to_fail_band_violation": {
  "default": 0,
  "type": "number",
  "min": 0,
  "max": 1,
  "description": "Phase E.5 gate for `band_violation` kind. 0=WARN (E.4 default; seqBandsWarn++); 1=FAIL (E.5 promotion; seqBandsFailing++ → verdict FAIL → pipeline halt). Canonical regression-detection gate. See Spec 84 §3.4."
},
"lifecycle_seq_band_promote_to_fail_no_band_configured": {
  "default": 0,
  "type": "number",
  "min": 0,
  "max": 1,
  "description": "Phase E.5 gate for `no_band_configured` kind (seq present in data but no band loaded — config gap). 0=WARN (default); 1=FAIL (rare). See Spec 84 §3.4."
},
"lifecycle_seq_band_promote_to_fail_expected_data_missing": {
  "default": 0,
  "type": "number",
  "min": 0,
  "max": 1,
  "description": "Phase E.5 gate for `expected_data_missing` kind (band has min > 0 but zero observed rows). 0=WARN (default); 1=FAIL (after verifying no structurally-absent seqs remain). See Spec 84 §3.4 structural-absence resolution path."
}
```

### Part 4 — `control-panel.logic.test.ts` extension (3 entries)

Add **3 entries** to `EXPECTED_LOGIC_VAR_KEYS`:

```js
  'lifecycle_seq_band_promote_to_fail_band_violation',
  'lifecycle_seq_band_promote_to_fail_no_band_configured',
  'lifecycle_seq_band_promote_to_fail_expected_data_missing',
```

(Placed near the other Phase E.4/E.5 keys for visual grouping. v4 fold v3-conv-CRIT-body atomicity: this edit MUST land in the SAME COMMIT as the seed JSON addition; no separate "seed completeness" test added — existing bidirectional parity test already covers this surface.)

### Part 5 — Tests (TDD Red Light first, per user-mandated "failed test first")

1. **`src/tests/migration-150-lifecycle-seq-band-posture.infra.test.ts`** (NEW) — mig 150 shape regression:
   - **3 INSERT rows** with keys: `lifecycle_seq_band_promote_to_fail_band_violation`, `_no_band_configured`, `_expected_data_missing` (each with default 0).
   - Each row has `ON CONFLICT (variable_key) DO NOTHING` (3 total occurrences in executable SQL, comments stripped).
   - No explicit BEGIN/COMMIT (mig 135 R8 hotfix convention).
   - `-- UP` marker (project pre-commit hook enforces).
   - Comment-only DOWN block (Rule 6); DOWN comments reference all 3 keys.
   - SPEC LINK headers reference Spec 42 §6.11 + Spec 84 §3.4 + Spec 48 §3.1.

2. **`src/tests/assert-lifecycle-phase-distribution.infra.test.ts`** (EXTEND) — Phase E.5 v3 shape regression:
   - `LOGIC_VARS_SCHEMA` declares **all 3** new per-kind keys, each `.int().min(0).max(1)`.
   - `anyPromotePostureActive` definition present (OR of 3 per-kind booleans).
   - `POSTURE_FLAG_BY_KIND` map present.
   - Branch routing per push site: main loop reads `promoteToFail_band_violation`; Direction 1 reads `promoteToFail_no_band_configured`; Direction 2 reads `promoteToFail_expected_data_missing`. No shared `promoteToFail` boolean.
   - **3 new audit rows** with INFO↔WARN status transitions per the kind's own flag.
   - **Per-violation prefix renderer** (`renderPrefix(kind)`) present + each preview line uses kind-specific prefix.
   - `seq_violations` push includes `posture: 'warn'|'fail'` field derived via `POSTURE_FLAG_BY_KIND[kind]`.
   - `seq_bands_failing` threshold descriptor updated to reference the 3 per-kind flags (NO "always 0 in E.4 v1" clause).
   - Existing 29-row audit_table now **32 rows** (3 new posture rows).
   - Distinct failure-message templates per kind (regex check for 3 specific message templates in `failures.push`).
   - **Behavioral test** (v3 fold v2-Obs-J-prefix): mixed-posture state — `flag_band_violation=1` + `flag_no_band_configured=0`. A `no_band_configured` violation produces a warning preview line with `[E.4 WARN-ONLY POSTURE]` prefix (NOT `[E.5 FAIL POSTURE]`).
   - **Behavioral test** (v3 fold v2-Obs-E-seq): `emitSummary` call appears BEFORE the `if (failures.length > 0) throw` in the source.

3. **`control-panel.logic.test.ts`** — assert `EXPECTED_LOGIC_VAR_KEYS` includes **all 3** new per-kind keys.

(No separate "seed completeness" test — the existing bidirectional parity test in `control-panel.logic.test.ts` ("no extra keys" + "every expected key is present") already enforces seed↔expected parity. The 3 new entries land atomically with the seed JSON addition.)

### Standards Compliance (`00_engineering_standards.md`)

- **§2.1 Unhappy Path Tests:** new test scenarios cover (a) script behavior when posture flag is 0 (existing E.4 WARN routing preserved); (b) script behavior when posture flag is 1 (FAIL routing + throw); (c) Zod throws if posture value is outside `0..1` (e.g., -1 or 2 from operator typo).
- **§2.2 Try-Catch Boundary:** N/A — pipeline script, not API route. Existing `pipeline.run` envelope provides top-level error capture; the `throw new Error('Distribution sanity check FAILED...')` propagates via the SDK.
- **§3.1 Add-Backfill-Drop:** N/A — single logic_variable INSERT, no business-table column.
- **§3.2 Pagination:** N/A — no new queries; existing UNION ALL aggregate unchanged.
- **§6.1 logError Mandate:** existing `pipeline.log.error/warn` paths preserved; no new logging surfaces.
- **§7 Dual Code Path:** N/A — pure backend script.
- **§9.1 Transaction Boundaries:** N/A — read-only script (existing pattern preserved).
- **§9.2 Parameter Limit:** N/A — no new batch INSERTs.
- **§9.3 Idempotency:** mig 150 uses `ON CONFLICT DO NOTHING`. Re-runs are no-ops. Assert script is read-only — fully idempotent.

### Spec 47 §R1-R12 Compliance (existing — extension preserves envelope)

- **§R1 SDK imports:** unchanged.
- **§R2 Advisory lock ID:** unchanged (109).
- **§R3 Batch size:** N/A.
- **§R3.5 RUN_AT:** N/A (read-only script preserved per E.4 precedent).
- **§R4 Zod config validation:** extended with **3 new required keys** (`lifecycle_seq_band_promote_to_fail_band_violation`, `_no_band_configured`, `_expected_data_missing`), each with `.int().min(0).max(1)` constraint. Throws at startup on out-of-range values.
- **§R5 Startup guards:** existing guards preserved; the new key is mandatory in mig 150 so no additional EXISTS check needed.
- **§R6 Advisory lock:** unchanged.
- **§R7 Data read:** unchanged.
- **§R8 Pure-function computation:** branch routing is inline-pure (single boolean predicate `promoteToFail`).
- **§R9 Atomic write:** N/A.
- **§R10 PIPELINE_SUMMARY with audit_table:** **3 new posture rows appended (32 total)**, each transitioning INFO→WARN per the kind's own flag. Verdict cascade unchanged: FAIL when `failures.length > 0` (now reachable for per-seq violations under per-kind E.5 posture when the matching flag is 1). `emitSummary` MUST be called before `throw` so the audit_table is persisted on FAIL runs (load-bearing per v3 fold v2-Obs-E-seq).
- **§R11 emitMeta:** unchanged (no new table reads).
- **§R12 CQA gate:** existing `failures.length > 0 → throw` halt path preserved. E.5 v2 promotion routes per-seq violations into this path; E.4 v1 default leaves it unchanged.

### Spec 48 Pipeline Observability Adherence

- **§3.1 audit_table.rows enumeration:** **29 → 32 rows** after E.5 (3 new per-kind posture rows). Each transitions INFO→WARN when its flag is 1, surfacing the armed posture in `extractIssues()`/DeepSeek narrative for operator visibility. Verdict cascade derives from `failures[]`/`warnings[]` arrays per Spec 47 §R10 — WARN-status posture rows do NOT cascade to verdict WARN. Within Spec 48 budget (well below `assert-global-coverage.js` ceiling of ~138 rows).
- **§3.2 distributions in records_meta:** unchanged (existing `seq_distribution` + `seq_violations` + `seq_violations_truncated_count`).
- **§3.3 observer file routing:** assert script unchanged; observer writes audit_table to both `permits-followup.md` and `coa-followup.md` (current behavior).
- **§3.4 records_total preservation:** unchanged.

### Pre-Review Self-Checklist (10 items)

- (a) Scope is **3 per-kind posture flags** + 3 per-kind audit rows + per-violation warning prefix selection; NO classifier changes, NO business-table schema, NO `compute-phase-calibration.js` changes.
- (b) Posture flag uses integer 0/1 (NOT string enum, NOT boolean) to match the existing `logic_variables.variable_value DECIMAL` schema + existing Zod conventions.
- (c) Branch routing applies per-kind: `band_violation` (main loop) reads `promoteToFail_band_violation`; `no_band_configured` (Direction 1) reads `promoteToFail_no_band_configured`; `expected_data_missing` (Direction 2) reads `promoteToFail_expected_data_missing`. **Operator decision is per-kind (incremental)** — each flag independently promotable. Per-seq granularity WITHIN a kind DEFERRED to follow-up.
- (d) Existing E.4 WARN routing preserved when `promoteToFail === 0` (default). Test asserts both paths.
- (e) `seq_bands_failing` audit row now reachable (was hardwired to 0 in E.4 v1).
- (f) Verdict cascade unchanged; `failures.length > 0 → throw` halt path triggers automatically when posture flag is 1 AND a band violation occurs.
- (g) Posture-aware warning prefix bifurcation: `[E.5 FAIL POSTURE]` vs `[E.4 WARN-ONLY POSTURE]`. Operators see posture in the followup file at glance.
- (h) **3 new per-kind posture audit rows** (`lifecycle_seq_band_promote_to_fail_band_violation`, `_no_band_configured`, `_expected_data_missing`); each transitions INFO↔WARN per the kind's own flag (WARN when flag=1 so `extractIssues()` surfaces it in DeepSeek narrative for operator visibility).
- (i) Mig 150 idempotent via `ON CONFLICT DO NOTHING`; operator-tuned promotion preserved on re-apply.
- (j) Operator pre-promotion checklist in Spec 84 §3.4 with **3 explicit copy-pastable SQL queries** (verdict via `records_meta->'audit_table'->>'verdict'='PASS'`; `seq_unclassified_count<100` via `jsonb_path_query_first(...)::text` with explicit cast; `expected_data_missing` absence via `jsonb_array_elements` filter) + dual-gate cascade note + per-kind UPDATE variants + recommended promotion order (band_violation → expected_data_missing → no_band_configured) + immediate AND safest rollback paths (UPDATE to 0; `git revert` + mig 150 DOWN block to remove orphan rows).

### Execution Plan (per WF1 in `.claude/workflows.md`)

- [ ] **Contract Definition:** **3 per-kind** integer flags (each 0/1); Zod schema extension (3 keys); branch routing per push site (each reads own flag); **3 new audit rows** (INFO↔WARN transition per kind); per-violation prefix renderer (NOT per-run); `seq_violations.posture` field; `emitSummary` BEFORE `throw` sequencing.
- [ ] **Spec & Registry Sync:** apply 3 spec amendments post-commit. `npm run system-map`.
- [ ] **Schema Evolution:** migration 150 (logic_variables-only; no business-table schema change).
- [ ] **Test Scaffolding (TDD Red Light, per user-mandated "failed test first"):** scaffold mig 150 shape test + assert script extension tests + seed completeness test + control-panel keys test. All new tests fail; existing tests green.
- [ ] **Red Light:** confirm failing.
- [ ] **Implementation:**
  - Migration 150 single INSERT (Part 1) ~25 lines.
  - Seed JSON addition (Part 3) 1 entry (~10 lines).
  - Script extension — Zod schema gains **3 keys** + 3 per-kind boolean extractions + `anyPromotePostureActive` OR + `POSTURE_FLAG_BY_KIND` map + 3 branch routing changes (each reads kind-specific flag) + **3 new audit rows** with INFO↔WARN transition + `renderPrefix(kind)` per-violation helper + `seq_violations.posture` field + `emitSummary` BEFORE `throw` sequencing (Part 2) ~80 lines.
  - `control-panel.logic.test.ts` `EXPECTED_LOGIC_VAR_KEYS` extension (Part 4) 1 line.
- [ ] **Auth Boundary & Secrets:** N/A.
- [ ] **Pre-Review Self-Checklist (10 items):** walk against diff.
- [ ] **Multi-Agent Review (4 reviewers parallel — diff stage):**
  - Gemini: `npm run review:gemini -- review scripts/quality/assert-lifecycle-phase-distribution.js --context docs/specs/01-pipeline/47_pipeline_script_protocol.md`
  - DeepSeek: `npm run review:deepseek -- review scripts/quality/assert-lifecycle-phase-distribution.js --context docs/specs/01-pipeline/48_pipeline_observability.md`
  - Independent worktree: Spec 47 §R1-R12 + Spec 84 §3.4 posture mechanism verification + Engineering Standards §2/9 walkthrough + verdict cascade reachability.
  - Observability worktree: Spec 48 lens + **32-row audit_table** + per-kind posture rows INFO↔WARN transition + per-violation prefix selection + operator pre-promotion checklist adequacy (with explicit SQL queries) + `emitSummary` before `throw` sequencing verification.
- [ ] **Green Light:** `npm run typecheck && npm run lint && npm run test`; mig 150 apply verification.
- [ ] **Operator pre-ack:** commit message includes posture-flag mechanism note + Spec 84 §3.4 pre-promotion checklist anchor.
- [ ] **WF6 commit:** Single commit. Message: `feat(84_lifecycle_phase_engine): WF1 Phase E.5 — band recalibration operational gate (3 per-kind posture flags: band_violation, no_band_configured, expected_data_missing) + mig 150 + 3 new posture audit rows (INFO↔WARN per kind) + per-violation prefix selection + Spec 84 §3.4 pre-promotion checklist with explicit SQL queries + 3 spec amendments`.
- [ ] **Followups append:** `docs/reports/review_followups.md`.

### Spec Amendments (3)

1. **Spec 42 §6.11 Phase E.5 row** — fill `[E.5-COMMIT]` post-commit. Append note: "**3 per-kind posture flags** (mig 150) provide operator-driven WARN→FAIL promotion gates: `lifecycle_seq_band_promote_to_fail_band_violation`, `_no_band_configured`, `_expected_data_missing`. Each defaults to 0 (WARN routing, E.4 v1 behavior). Operators promote independently per-kind via Spec 86 Control Panel (`/admin/control-panel → marketplace constants → [key] → 1 → Save`) after the pre-promotion checklist passes (7 consecutive PASS runs verified via `records_meta->'audit_table'->>'verdict' = 'PASS'` query — NOT `pipeline_runs.status = 'completed'` which was the v2 SQL bug). The 3 flags enable incremental promotion: operators typically promote `band_violation` first (most aggressive regression detector) while keeping `no_band_configured` at WARN (config-gap signal). Per-seq granular overrides + auto-promotion (consecutive PASS tracker) deferred to follow-up — operator-driven matches Spec 48 Improvement C 'pinned baseline' manual-mitigation precedent. Per-violation prefix selection ensures mixed-posture state correctly distinguishes `[E.5 FAIL POSTURE]` from `[E.4 WARN-ONLY POSTURE]` per-violation-kind."

2. **Spec 84 §3.4 band design** — extend with the per-kind posture-flag mechanism + operator pre-promotion checklist:

   > **Phase E.5 per-kind posture-flag mechanism (DELIVERED 2026-05-XX commit `[E.5-COMMIT]`):** the assert script reads **3 per-kind flags** from logic_variables (each integer 0/1; seeded by mig 150 with default 0):
   > - `lifecycle_seq_band_promote_to_fail_band_violation` — gates `band_violation` kind (data shifted within configured band).
   > - `lifecycle_seq_band_promote_to_fail_no_band_configured` — gates `no_band_configured` kind (new seq appeared without a calibrated band — config gap).
   > - `lifecycle_seq_band_promote_to_fail_expected_data_missing` — gates `expected_data_missing` kind (zero rows for a band with min > 0 — data deletion/classifier-skip signal).
   >
   > Each flag routes violations of its kind: 0 → `seqBandsWarn++` (E.4 default); 1 → `seqBandsFailing++` + `failures.push(...)` → verdict FAIL → throw halt path. Per-violation prefix selection (NOT per-run): each warning line carries `[E.5 FAIL POSTURE]` ONLY if THAT kind's flag is 1. Mixed-posture state correctly handled.
   >
   > **3 separate posture audit rows** in `audit_table.rows` (one per kind). Each row's status: `INFO` when flag is 0; `WARN` when flag is 1 — surfaces the armed posture in observer's DeepSeek narrative via `extractIssues()` for every post-promotion run.
   >
   > **Verdict-cascade clarification (v3 fold v2-G-MED-warn-fatigue):** WARN-status posture rows surface in observer narrative for operator visibility but do NOT cascade to verdict WARN. The script's verdict is derived from the `failures[]` / `warnings[]` arrays per Spec 47 §R10 (`failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS'`), NOT from `auditRows.some(r => r.status === 'WARN')`. PASS verdict remains achievable on a clean run with armed posture. `audit_table.verdict` reflects RUN health; armed-posture audit rows reflect POSTURE state.
   >
   > **Operator pre-promotion checklist (Spec 84 §3.4.E.5):**
   >
   > 1. **7 consecutive PASS runs on staging** — verify via:
   >    ```sql
   >    SELECT id, started_at, records_meta->'audit_table'->>'verdict' AS verdict
   >      FROM pipeline_runs
   >     WHERE pipeline LIKE '%:assert-lifecycle-phase-distribution'
   >       AND status = 'completed'
   >     ORDER BY started_at DESC LIMIT 7;
   >    ```
   >    All 7 rows must show `verdict = 'PASS'`. (v3 fold v2-G-CRIT-sql — `pipeline_runs.status='completed'` only filters out failed/skipped runs from the sample; the inner `audit_table.verdict` is the actual gate signal. Checking `pipeline_runs.status` alone was the v2 bug — `'completed'` runs can have WARN/FAIL `audit_table.verdict`.)
   >
   > 2. **Phase D + E.2 fully ramped** — `seq_unclassified_count < 100` for 3 consecutive days. Query:
   >    ```sql
   >    SELECT id, started_at,
   >           (records_meta->'audit_table'->'rows') @> '[{"metric":"seq_unclassified_count"}]' AS has_row,
   >           jsonb_path_query_first(
   >             records_meta->'audit_table'->'rows',
   >             '$[*] ? (@.metric == "seq_unclassified_count").value'
   >           )::int AS unclassified_count   -- v4 fold v3-Obs-MED-C: ::int cast on jsonb_path_query_first return
   >      FROM pipeline_runs
   >     WHERE pipeline LIKE '%:assert-lifecycle-phase-distribution'
   >       AND status = 'completed'
   >       AND started_at >= NOW() - INTERVAL '3 days'
   >     ORDER BY started_at DESC;
   >    ```
   >    All values must be < 100. (Note: `jsonb_path_query_first(...)` returns a `jsonb`-typed value; the `::int` cast unwraps it to a scalar integer for operator readability — otherwise the value renders as `"42"` JSON-formatted.)
   >
   > 3. **No `expected_data_missing` violations for >24h** — query:
   >    ```sql
   >    SELECT id, started_at, records_meta->'seq_violations' AS violations
   >      FROM pipeline_runs
   >     WHERE pipeline LIKE '%:assert-lifecycle-phase-distribution'
   >       AND status = 'completed'
   >       AND started_at >= NOW() - INTERVAL '24 hours'
   >       AND records_meta->'seq_violations' IS NOT NULL
   >       AND EXISTS (
   >         SELECT 1 FROM jsonb_array_elements(records_meta->'seq_violations') AS v
   >          WHERE v->>'kind' = 'expected_data_missing'
   >       )
   >     ORDER BY started_at DESC;
   >    ```
   >    Zero rows expected. If rows return AND the absence is **structurally caused** (catalog seq has NULL rows_count by design, classifier never produces it), keep `_expected_data_missing` flag at 0 (WARN) OR reset the affected seq's `band.min` to 0 via Control Panel before promoting that flag.
   >
   > 4. **Dual-gate cascade note** (v3 fold v2-conv-HIGH-cascade): if `unclassified_count` (phase-keyed) is FAILing on the same runs, resolve THAT gate first — per-seq band gates are only diagnosable once classifier coverage is stable. Phase-keyed `unclassified_count` is the coarse safety net; per-seq bands are the fine-grained gate.
   >
   > 5. **Operator authorizes per-kind promotion — recommended sequencing (v4 fold v3-Obs-MED-K):**
   >    1. **`band_violation` FIRST** — most aggressive regression detector; promote after the pre-promotion checklist passes (Steps 1-4 all green).
   >    2. **`expected_data_missing` SECOND** — promote AFTER auditing structural absences (Step 3 query returns zero rows on most-recent 7 runs).
   >    3. **`no_band_configured` LAST** — rare; usually kept at WARN as a config-gap signal. Promote only if your ops team treats unconfigured-seq appearance as a halt-worthy regression.
   >
   >    ```sql
   >    -- Promote band_violation only (recommended first step):
   >    UPDATE logic_variables SET variable_value = 1
   >     WHERE variable_key = 'lifecycle_seq_band_promote_to_fail_band_violation';
   >    -- Later, promote expected_data_missing after structural-absence audit:
   >    UPDATE logic_variables SET variable_value = 1
   >     WHERE variable_key = 'lifecycle_seq_band_promote_to_fail_expected_data_missing';
   >    -- Rarely, promote no_band_configured last:
   >    UPDATE logic_variables SET variable_value = 1
   >     WHERE variable_key = 'lifecycle_seq_band_promote_to_fail_no_band_configured';
   >    -- Or promote all three at once (only if your ops team treats unconfigured-seq as halt-worthy):
   >    UPDATE logic_variables SET variable_value = 1
   >     WHERE variable_key IN (
   >       'lifecycle_seq_band_promote_to_fail_band_violation',
   >       'lifecycle_seq_band_promote_to_fail_no_band_configured',
   >       'lifecycle_seq_band_promote_to_fail_expected_data_missing'
   >     );
   >    ```
   >    OR uses Spec 86 Control Panel (`/admin/control-panel → marketplace constants → [select key] → 1 → Save`) — one click per flag.
   >
   > 6. **Rollback path (spurious FAIL in production):**
   >    - **IMMEDIATE incident response (seconds):** demote the offending flag(s) via Control Panel single-click OR:
   >      ```sql
   >      UPDATE logic_variables SET variable_value = 0
   >       WHERE variable_key IN (
   >         'lifecycle_seq_band_promote_to_fail_band_violation',
   >         'lifecycle_seq_band_promote_to_fail_no_band_configured',
   >         'lifecycle_seq_band_promote_to_fail_expected_data_missing'
   >       );
   >      ```
   >      The next pipeline run reverts to WARN-only routing.
   >    - **SAFEST rollback (v3 fold v2-G-MED-rollback + v4 fold v3-G-LOW-revert-down):** full rollback steps in order:
   >      1. `git revert` of the WF1 Phase E.5 commit.
   >      2. Redeploy the application.
   >      3. **Run mig 150's DOWN block manually** to remove the 3 orphan `logic_variables` rows (the DOWN block is comment-only per project Rule 6; operator runs the `DELETE` statement from the comment block manually). Without step 3, the 3 keys remain in the DB unused — not functionally breaking (the reverted code doesn't read them) but leaves stale config visible in Spec 86 Control Panel.
   >    - The DB-level UPDATE in the IMMEDIATE path handles the incident but does NOT remove the WARN-status posture audit rows from subsequent run narratives; only operator-driven flag demotion + commit revert + DOWN block restores the full pre-E.5 observer surface.

3. **Spec 48 §3.1** — extend the audit_table.rows enumeration: **32 scalar rows total** (29 E.4 + **3 new** per-kind posture rows). Each posture row's status transitions INFO→WARN when its own flag is 1 (so `extractIssues()` surfaces it in every post-promotion run's DeepSeek narrative for operator visibility). **Verdict-cascade clarification:** WARN-status posture rows DO NOT cascade to `audit_table.verdict='WARN'` — the script's verdict derives from `failures[]`/`warnings[]` arrays per Spec 47 §R10 (`failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS'`). PASS verdict remains achievable on clean runs with armed posture. **Per-violation prefix selection:** each warning preview line carries `[E.5 FAIL POSTURE]` ONLY if THAT violation's kind has its flag set to 1; otherwise `[E.4 WARN-ONLY POSTURE]`. Mixed-posture state (e.g., flag_band_violation=1 + flag_no_band_configured=0) renders correctly with per-kind prefixes.

---

> **PLAN LOCKED (v4) — authorized for implementation per user authorization.**
>
> v3 plan-review surfaced same body-inconsistency pattern as v2 (3/4 reviewers caught remaining v1 leftovers in Part 3 + Part 4 + Key Files + Spec 47 §R4 note + Self-Checklist items + Why narrative + Mig 150 header comment). 1/4 (Observability) PASS with 3 MED doc fixes. v4 mechanically scrubs all remaining `lifecycle_seq_band_promote_to_fail` (singular) references throughout the body + applies Observability's 3 MEDs (jsonb cast in Step 2; Self-Checklist (h) singular reference; promotion-order note in Step 5) + Gemini MED (kind-specific prefix string in `renderPrefix`) + Gemini LOW (git revert + mig DOWN block in rollback path). Per user authorization, v4 PLAN LOCKs DIRECTLY without another plan-review round; diff-stage 4-reviewer round runs AFTER implementation to catch any new bugs introduced by v4 folds.
>
> v4 ships with NO new design changes — only mechanical scrubs + documentation fixes folding remaining v3 leftovers and Observability's 3 MEDs.
>
> Convergence trajectory: v1=12 → v2=14 → v3=10 → v4 ships.
>
> v2 plan-review (4 reviewers UNANIMOUS) diagnosed v2's body as incompletely updated: header described per-kind 3-flag design but Parts 2-5 + compliance + spec amendments + commit message + Operating Boundaries + audit row counts still referenced v1 single-flag. Plus 2 genuinely new bugs caught: Gemini's Step 1 SQL `verdict='completed'` bug (real CRITICAL); Observability's per-violation prefix selection in mixed-posture state (real HIGH). v3 fully rewrites the body to match per-kind design + fixes both new bugs.
>
> Honest assessment: my v2 fold cut corners. v2 reviewers correctly caught this. v3 is the full correction.
>
> §10 note: v2 load-bearing changes on top of v1:
> (a) Per-kind flag split (HIGH convergent) — 3 logic_variables (`band_violation`, `no_band_configured`, `expected_data_missing`) instead of 1 global flag. Operator promotes incrementally.
> (b) Posture visibility under FAIL (CRIT convergent) — emit guard + posture audit row status both fixed so `[E.5 FAIL POSTURE]` and the posture audit rows are visible in every post-promotion run's followup file (not just runs with violations).
> (c) Distinct per-kind failure-message templates (HIGH) — `band_violation` / `no_band_configured` / `expected_data_missing` each render kind-appropriate text.
> (d) Pre-promotion checklist with explicit SQL queries (HIGH convergent) — 3 copy-pastable queries in Spec 84 §3.4 so operator can execute the checklist from the followup file alone.
> (e) Atomic seed + EXPECTED_LOGIC_VAR_KEYS landing (CRIT) — workflow sequencing note added; no new test (existing bidirectional parity test already covers).
> (f) `unclassified_max` tightening explicitly DEFERRED (CRIT-doc) — operator-driven via Spec 86 Control Panel after Phase D ramps; no code change in E.5.
> (g) Structured `seq_violations` shape gains `posture` field (MED convergent) — Phase F consumers self-routing.
> (h) `seq_bands_failing` descriptor updated (MED convergent) — stale "always 0 in E.4 v1" clause removed.
> (i) DB CHECK constraint deferred (HIGH design decision) — Zod-only enforcement per Spec 47 §R4; operator-recovery doc added in Spec 84 §3.4.
> (j) Dual-gate cascade doc (HIGH) — resolve `unclassified_count` FAIL before diagnosing per-seq bands.
> (k) Warning count semantics under FAIL (MED) — sharper wording.
> (l) Structural-absence checklist clause (HIGH subsumed) — operator keeps `_expected_data_missing` flag at WARN OR resets `band.min` to 0.
>
> v2 total `audit_table.rows` count: 29 (E.4) + 3 per-kind posture rows = 32 rows.
>
> DO NOT generate code. DO NOT modify scripts. TERMINATE RESPONSE until v2 4-reviewer plan-review round completes + user authorization.

> **PLAN LOCKED (v4) — AUTHORIZED.**
> Proceed to Implementation: scaffold tests (TDD Red Light per user-mandated "failed test first"), confirm failing, then implement mig 150 + script extension + seed JSON + spec amendments. Diff-stage 4-reviewer round runs after Green Light, before WF6 commit.
