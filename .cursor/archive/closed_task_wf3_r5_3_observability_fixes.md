# Active Task: WF3 #r5-3-observability-fixes — fix 4 bugs surfaced by post-commit R8 follow-up review (records_updated rowCount + renovation regex + audit display + BATCH_SIZE formula)

**Status:** COMPLETE 2026-05-14 — Green Light verified. Worktree reviewer GO with one cosmetic deferral. Live re-runs proved idempotency: run 1 wrote 1208 rows + advanced timestamps; run 2 processed 0. Added 5th fix during Green Light (removed IS DISTINCT FROM filter — was causing infinite re-processing of all-NULL classifier outputs because scope_classified_at never advanced).
**Workflow:** WF3 (Bug Fix — bundled 4 fixes per `feedback_wf3_granularity.md` override since all surfaced by the same review pass and target the same script)
**Domain Mode:** Backend/Pipeline
**Rollback Anchor:** `c74619b` (R5.3 classify-coa-scope shipped)
**Parent epic:** R5.3 hardening; clears path to R5.4 classify-coa-trades.

---

## Context

R8 post-commit review of `c74619b` ran 3 reviewers (Gemini + DeepSeek + worktree code-reviewer) against Spec 47 §R1-R12 + observability + scaling + twin parity. 4 BUGs converged across reviewers — all surgical fixes confined to the just-shipped R5.3 surface:

### Bug 1 — CRITICAL: `records_updated` discards `client.query().rowCount`

**Source:** Worktree (95% conf), Gemini CRIT (line 214)
**File:** `scripts/classify-coa-scope.js` flushBatch() — `await client.query(...)` result not captured; emitSummary uses `records_updated: scopeClassified` (JS-side count of non-null classifier outputs).
**Impact:** `IS DISTINCT FROM` guard means on a re-run of an already-classified dataset, JS sees 32K "classified" but DB rowCount = 0. Metric is a proxy, not actual writes. **Spec 47 §8.1 mandate violation** — lessons 81-W5 / 82-W6 / 85-W6 documented this exact failure pattern.
**Fix:** Capture `result.rowCount` in flushBatch, accumulate into a script-level counter, use for `records_updated`.

### Bug 2 — HIGH: `renovation` scope tag regex narrower than ALTERATION_PATTERNS

**Source:** Worktree (92% conf)
**File:** `scripts/lib/coa-scope-classifier.js` TAG_PATTERNS entry for `renovation` uses `/\brenovat(e|ion|ing)\b/i` (3 inflections); `ALTERATION_PATTERNS` uses catch-all `/\brenovat\w*\b/i` (all inflections including `renovated`, `renovates`).
**Impact:** "Permit use of the renovated dwelling" fires `project_type='Alteration'` but does NOT emit `renovation` scope tag. Silent divergence between verb classifier and tag emission.
**Fix:** Use catch-all `\brenovat\w*\b` in TAG_PATTERNS too. Apply identically to JS + TS twin.

### Bug 3 — HIGH: `unmapped_scope_count` audit row value/threshold mismatch

**Source:** DeepSeek HIGH (line 61)
**File:** `scripts/classify-coa-scope.js` audit_table row construction.
**Impact:** Audit row shows raw count as `value` but `<= 10%` as `threshold` — operator-confusing display (e.g. value=1260, threshold='<= 10%'). Status calculation is correct (uses `unmappedPct` internally), only the display is misleading.
**Fix:** Either show percentage in `value` to match threshold semantics, OR split into two metrics (count + percentage). Cleanest: change `value` to `unmappedPct.toFixed(1) + '%'` for that one row.

### Bug 4 — MEDIUM: BATCH_SIZE = 1000 hardcoded; Spec 47 §R3 mandates formula

**Source:** Worktree BUG-3 (82% conf), Gemini MED (line 45)
**File:** `scripts/classify-coa-scope.js:44` (`const UPDATE_BATCH_SIZE = 1000;`).
**Impact:** Spec 47 §6.3 prescribes `BATCH_SIZE = Math.floor(65535 / COL_COUNT)` to prevent silent violations as columns are added. 1000 × 4 + 1 = 4001 params is safe today; not robust against future column additions.
**Fix:** Compute via formula + cap at 1000 for memory bounds: `Math.min(1000, Math.floor(65535 / 4))`.

### Target files
- `scripts/classify-coa-scope.js` — Bugs 1, 3, 4
- `scripts/lib/coa-scope-classifier.js` — Bug 2 (JS side)
- `src/lib/classification/coa-scope-classifier.ts` — Bug 2 (TS twin)
- `src/tests/coa-scope-classifier.logic.test.ts` — extend with renovated/renovates assertions
- `src/tests/classify-coa-scope.infra.test.ts` — extend with rowCount + BATCH_SIZE assertions

### Standards Compliance
- Spec 47 §R3 (BATCH_SIZE formula) — restored
- Spec 47 §R10 + §8.1 (records_updated == actual rowCount) — restored
- Spec 47 §R8 (pure-function classifier consistency between project_type + scope_tags) — restored
- Spec 47 §R10 (audit_table display clarity) — improved

---

## WF3 Execution Plan

- [ ] **Rollback Anchor:** `c74619b` ✓
- [ ] **State Verification:** All 4 bugs verified in committed code via reviewer file:line citations. No mystery; surgical fixes only.
- [ ] **Spec Review:** Spec 47 §R3 / §R10 / §8.1 re-read; lessons 81-W5/82-W6/85-W6 documented in spec.
- [ ] **Reproduction:** Extend infra test (`classify-coa-scope.infra.test.ts`):
  - +assertion: `flushBatch` captures `result.rowCount` into a `totalUpdated` accumulator.
  - +assertion: `records_updated` uses the accumulator, not `scopeClassified`.
  - +assertion: BATCH_SIZE expression uses `Math.floor(65535 / N)` pattern.
  - +assertion: audit_table for `unmapped_scope_count` has matching value+threshold formats.
  Extend logic test (`coa-scope-classifier.logic.test.ts`):
  - +case: "renovated dwelling" should produce both `project_type='Alteration'` AND `scope_tags` containing `'renovation'`.
  - +case: "renovates the office" likewise.
- [ ] **Red Light:** Run tests — must fail on current `c74619b` state.
- [ ] **Fix:**
  1. `scripts/classify-coa-scope.js`:
     - Add `let totalUpdated = 0;` script-level counter
     - Inside flushBatch: `const result = await client.query(...); totalUpdated += result.rowCount ?? 0;`
     - emitSummary: `records_updated: totalUpdated`
     - audit_table[unmapped_scope_count]: `value: unmappedPct.toFixed(1) + '%'`, threshold unchanged
     - BATCH_SIZE constant: `const COA_SCOPE_COL_COUNT = 4; const UPDATE_BATCH_SIZE = Math.min(1000, Math.floor(65535 / COA_SCOPE_COL_COUNT));` (with comment explaining the 1000 cap is memory-bounded, not param-bounded)
  2. `scripts/lib/coa-scope-classifier.js`: TAG_PATTERNS `renovation` regex → `/\brenovat\w*\b/i`
  3. `src/lib/classification/coa-scope-classifier.ts`: same change to TS twin
- [ ] **Idempotency Check:** All fixes preserve existing idempotency contract (`scope_classified_at IS NULL OR scope_classified_at < last_seen_at`). No new state mutations.
- [ ] **Pre-Review Self-Checklist:**
  1. Does `totalUpdated` reset between runs? (Yes — declared inside `pipeline.run` closure.)
  2. Does the BATCH_SIZE formula's `Math.min(1000, ...)` correctly cap at 1000 when params allow more? (Yes — `Math.min(1000, 16383) === 1000`.)
  3. Does the audit row display change break any consumer? (No — admin UI only renders the metric for display.)
  4. Does the renovation regex catch-all match anything unintended? (`renovate`, `renovated`, `renovates`, `renovating`, `renovation`, `renovations`, `renovator` — all are renovation-related. Safe.)
  5. TS↔JS parity preserved? (Yes — identical regex change in both files; parity test will catch drift.)
- [ ] **Independent Review:** worktree feature-dev:code-reviewer on diff. No adversarial (user didn't explicitly request for this fix-up — per `feedback_review_protocol.md` WF3 default).
- [ ] **Green Light:**
  1. `npm run test && npm run lint -- --fix && npm run typecheck` clean
  2. Live re-run: `node scripts/classify-coa-scope.js` against dev DB — should report `records_updated: 0` (idempotent re-run, all rows already classified; this VERIFIES the rowCount fix produces correct metric)
  3. Paste evidence
- [ ] **WF6 Commit:** `fix(42_chain_coa): WF3 #r5-3-observability-fixes — records_updated rowCount + renovation regex consistency + audit display + BATCH_SIZE formula`

---

> **PLAN LOCKED 2026-05-14** — user authorized via "Quick WF3 fix-up commit then R5.4 (Recommended)". Surgical fixes; no design changes; tests in lockstep.
