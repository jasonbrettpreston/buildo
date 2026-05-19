# Active Task: WF3 #coa-classifier-coverage — Fix A: investigate + fix CoA `lifecycle_phase` 99.4%-NULL gap (Phase 2 of 3)
**Status:** Planning (re-locked post-R2 investigation 2026-05-11 — scope expanded; original "small classifier fix" became "pure-function rewrite + dual-path mirror + 6 new bands + 2 spec amendments")
**Workflow:** WF3 (Bug fix — single-script change to `classify-lifecycle-phase.js` CoA branch + downstream re-band of `logic_variables` thresholds). Bundled override OFF — this is genuinely one root cause (classifier UPDATE branch broken). Scope is contained but touches a chain-running script + a pipeline-gating CQA, so adversarial review is warranted.
**Domain Mode:** Backend/Pipeline (`scripts/classify-lifecycle-phase.js` is a chain step, lock 84). Spec 47 §R1-R12 applies. Read `scripts/CLAUDE.md` ✓ + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` ✓ + `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` (just amended in WF2 §6 84-W12) ✓ + `docs/specs/01-pipeline/51_source_coa.md` (just amended in WF2 §3 with CoA cardinality) ✓.
**Rollback Anchor:** `7b17373` (current HEAD on `main` — WF2 #coa-spec-amendments)
**Multi-Agent Review:** REQUIRED — user-directed at Phase 2 authorization. R0 (pre-implementation Gemini + DeepSeek plan review via the templates from `9795227`) + R8 (post-implementation Gemini + DeepSeek + worktree code-reviewer).

---

## Context

* **Goal:** Get `coa_applications.lifecycle_phase` populated for the 1,690 currently-in-flight CoAs (P1 or P2) and the ~30,000 historically-decided CoAs (P3 or P4 — or a new "decided/closed" terminal phase; this is an open design question — see R3 below). Today 99.4% of CoAs have NULL — the classifier code path exists but is silently a no-op. Documented in Spec 84 §6 as bug **84-W12** by WF2 #coa-spec-amendments.

* **Why now:** Spec 84 §6 84-W12 (just-shipped) makes this the next item in the CoA Lifecycle Fixes queue. Once Fix A ships:
  - Spec 91 §3.5 CoA-as-lead leads will show meaningful phase context (today they render with no phase signal)
  - `assert-lifecycle-phase-distribution.js` §3.8 bands `lifecycle_band_coa_p1/p2_min/max` become meaningful (today they're tuned around the broken 40/147 baseline; post-fix they need re-banding against the real ~1,000-2,000 each)
  - Fix B (Phase 3) can build the cross-stream lifecycle.timeline[] panel on a working data layer

* **Target Specs (read-only context; Spec 84 will get a small amendment at R5):**
  - **`docs/specs/01-pipeline/84_lifecycle_phase_engine.md`** §3.1 (P1/P2 trigger logic), §3.8 (distribution bands), §6 (bug 84-W12)
  - **`docs/specs/01-pipeline/51_source_coa.md`** §3 (Cardinality + temporal patterns, just added)
  - **`docs/specs/01-pipeline/47_pipeline_script_protocol.md`** §R1–R12 (skeleton compliance for the script change)

* **Key Files (anticipated; refined at R2 investigation):**
  - **MODIFY `scripts/classify-lifecycle-phase.js`** — fix the CoA UPDATE branch (lines ~855–906 per audit). Likely fix is one of: (a) loosen the incremental watermark / filter predicate that's leaving rows unclassified, (b) fix `classifyLifecyclePhase()` in the shared lib to return P1/P2 for CoA inputs where it currently returns null, OR (c) backfill all historical NULLs in a one-time pass + add a watermark that doesn't get stuck. R2 will determine which.
  - **MODIFY `scripts/lib/lifecycle-phase.js`** (only if the bug is in the pure function — Spec 7 §7.1 dual-path mirror at `src/lib/classification/` may also need parity update).
  - **MODIFY `src/tests/classify-lifecycle-phase.infra.test.ts`** (or new file `src/tests/classify-lifecycle-phase-coa.infra.test.ts`) — add regression-lock tests for the CoA branch: P1/P2/P3/P4 trigger logic, watermark progression, expected row count.
  - **MODIFY `scripts/seeds/logic_variables.json`** — re-band `lifecycle_band_coa_p1_min/max` + `lifecycle_band_coa_p2_min/max` against post-fix reality. May need to make this a separate R-step that runs AFTER the live backfill so the empirical numbers ground the bands.
  - **AMEND `docs/specs/01-pipeline/84_lifecycle_phase_engine.md`** — §6 row 84-W12 → mark Resolved (commit hash); §3.1 — clarify P3/P4 terminal-phase semantics (design question — see R3).

## R2 INVESTIGATION OUTCOME (2026-05-11) — scope expansion

**Diagnosis:** `classifyCoaPhase()` in `scripts/lib/lifecycle-phase.js:371-401` is structurally inconsistent with Spec 84 §3.1 in four ways:

1. **Linked-permit short-circuit (line 372-374):** returns `phase: null` for any CoA with `linked_permit_num IS NOT NULL`. Silently drops phase for **1,659 linked-but-in-flight CoAs** (Pattern 2 from Spec 84 §5). Live data: 32,845 NULL-phase CoAs are linked; only 20 are unlinked. Original architectural assumption "linked = moved on" doesn't hold for in-flight CoAs.
2. **Approved → P2 (line 382-384):** approved decisions map to P2 instead of P3. Spec 84 §3.1 says P3 = "CoA Approved."
3. **`status` ignored:** Spec 84 §3.1 P2 trigger uses status; function ignores `input.status` (passed but unread). Live data shows 15+ status values needing distinct mapping.
4. **No P3 / P4 / P19 outputs:** function emits only P1, P2, or null. Spec 84 §3.1 P3/P4 and §3.6 P19 unreachable.

**Items already correct (R0 verifications):**
- ✅ `RUN_AT` capture at line 901-908 (Spec 47 §R3.5 compliant)
- ✅ `IS DISTINCT FROM` guards at line 449-450 (Spec 47 §6.4 compliant) — **R0 DeepSeek HIGH-1 is REJECT (already in place)**
- ✅ Whitespace/case normalization in `normalizeCoaDecision()` line 154-158 (TRIM + lowercase + `\s+` collapse) — **R0 DeepSeek NIT-7 is REJECT (already in place)**
- ✅ Watermark predicate correct at line 907-908

## Open design decisions (D1–D7) — added D5/D6/D7 post-R2

* **D1:** Decided CoAs stay at P3/P4 forever, or transition to terminal? Default: stay forever (matches §3.1 spec text).
* **D2:** Approval-string normalization via TRIM+ILIKE in classifier (not at ingestion).
* **D3:** One-time backfill via next chain run (script already idempotent + bounded volume).
* **D4 (R0 DeepSeek MED-3):** Refused/Withdrawn → P19; Deferred → P2. Avoids ~4K silent misclassifications.
* **D5 (R2 NEW):** **Drop the unconditional `linked_permit_num` short-circuit.** Phase is set per spec triggers regardless of linkage. Linked-and-approved CoAs end up at P3 (preserved indefinitely per D1); linked-and-pending CoAs end up at P1/P2 so Pattern 2 cases (1,659 today) become visible to the inspector. The 32,845 linked-decided CoAs that today have NULL phase will get P3/P4/P19 on the next post-fix chain run.
* **D6 (R2 NEW):** **Status → phase trigger table** for `coa_applications.status` (when `decision IS NULL`):

  | Status value(s) | Phase |
  |---|---|
  | `Application Received`, `Accepted` | P1 (intake) |
  | `Notice Prepared`, `Prepare Notice`, `Hearing Scheduled`, `Hearing Rescheduled`, `Tentatively Scheduled` | P2 (review/hearing) |
  | `Postponed`, `Deferred` | P2 (paused review) |
  | `Application Withdrawn`, `Closed`, `Cancelled` | **P19** (status-driven terminal — currently misclassified to P1) |
  | `Conditional Consent` | **P3** (approval signaled via status, no decision text) |
  | `TLAB Appeal`, `OMB Appeal` | **(open)** — post-decision appeals: stay at P3/P4 since the underlying decision exists? Or return to P2? **Recommend P3 — the underlying decision stands until the appeal succeeds.** |
  | (NULL, decision IS NULL, no recognized status) | P1 (intake — safest default) |

* **D7 (R2 NEW):** **Spec 84 §3.1 P4 trigger is unreachable.** Live data probe (`SELECT decision FROM coa_applications WHERE decision ILIKE '%final%|%bind%|%appeal%'`) returns only 1 outlier — no CoA has `decision = 'Final and Binding'`. Two options:
  - **D7a (recommended):** redefine P4 trigger in Spec 84 §3.1 as "decision = Approved AND `decision_date < NOW() - INTERVAL '20 days'`" (the Toronto CoA appeal window — once cleared, the decision is "Final and Binding" in fact). Empirically would map ~25,000 historical approvals to P4 and ~2,000 recent approvals to P3.
  - **D7b:** deprecate P4 from §3.1, fold its row into the P3 description as "CoA Approved (Final once appeal window clears)."
  - The user picks at re-authorization. My recommendation is D7a — gives operators a meaningful "appeal-window-cleared" signal in the inspector.

## Cycle 7 — Previous-WF audit (R2 — read-only verification before main work)

| # | Requirement | Verification target | Expected state |
|---|---|---|---|
| A | `coa_applications.lifecycle_phase` NULL rate is still ~99.4% | `SELECT COUNT(*) FROM coa_applications WHERE lifecycle_phase IS NULL` | ~32,865 (verify hasn't drifted since 2026-05-11) |
| B | Spec 84 §6 84-W12 entry exists | `Grep` the spec | ✅ shipped in `7b17373` |
| C | `classify-lifecycle-phase.js` has a CoA branch | `Grep` script for `coa_applications` UPDATE | Audit confirmed lines 855-906 exist |
| D | The pure function `classifyLifecyclePhase` accepts CoA inputs | `Grep` `scripts/lib/lifecycle-phase.js` | TBD at R2 |
| E | Existing test `classify-lifecycle-phase.infra.test.ts` covers CoA branch (or not) | `Grep` test file | TBD at R2 — likely NOT covered if the branch has been silently broken |

## Technical Implementation

* **New/Modified Components:** N/A (no UI).

* **Data Hooks/Libs:** Possibly `scripts/lib/lifecycle-phase.js` (the pure function) — Spec 7 §7.1 dual-path mirror at `src/lib/classification/` may also need parity update. R2 investigation determines.

* **Database Impact:** NO migration. The fix updates rows in `coa_applications.lifecycle_phase` (existing column) via the existing UPDATE branch in the existing script. **One-time backfill consideration:** when the fix lands, the next chain run will classify ~1,690 in-flight CoAs + ~31,000 historical decided CoAs (or a subset, depending on the watermark fix). This is bounded write volume; no `streamQuery` needed (these are not 237K rows).

* **§R3.5 RUN_AT capture:** the existing script already uses this — preserve.

* **§R6 advisory lock:** lock 84 already in use — no change.

* **§R9 atomic write:** existing `withTransaction` wraps the CoA UPDATE — preserve.

* **Operator runbook (commit message footer):** after deploy, the next `permits` or `coa` chain run will classify the backfill automatically (no manual step). Verify post-deploy with `SELECT lifecycle_phase, COUNT(*) FROM coa_applications GROUP BY lifecycle_phase`. Expected: NULL drops from 32,865 to <1,000; P1/P2/P3/P4 distribute to the new live counts.

## Standards Compliance

* **Try-Catch Boundary:** N/A (pipeline script; `pipeline.run` wrapper catches per Spec 47 §R12).
* **Unhappy Path Tests:** must add — empty `coa_applications` table, all-NULL `decision` column, watermark-stuck case (rows with `lifecycle_classified_at > last_seen_at`), 5-variant approval strings ("Approved", "approved", "Approved with Conditions", "Approved on Condition", "conditional approval") all map to P3.
* **logError Mandate:** existing script uses `pipeline.log.error` — preserve.
* **UI Layout:** N/A.

## Execution Plan

- [ ] **R0 — Multi-Agent Plan Review (REQUIRED per user direction at Phase 2 authorization).**
  Run both reviewers in parallel with the templates from commit `9795227`. Single message, two background invocations.

  1. **Gemini (spec/test/contract compliance):**
     ```
     npm run review:gemini -- plan \
       --template .claude/review-templates/plan-review-gemini.md \
       --specs docs/specs/01-pipeline/84_lifecycle_phase_engine.md,docs/specs/01-pipeline/51_source_coa.md,docs/specs/01-pipeline/47_pipeline_script_protocol.md
     ```

  2. **DeepSeek (failure modes / data reality / edges):**
     ```
     npm run review:deepseek -- plan \
       --template .claude/review-templates/plan-review-deepseek.md \
       --specs docs/specs/01-pipeline/84_lifecycle_phase_engine.md,docs/specs/01-pipeline/51_source_coa.md,docs/specs/01-pipeline/47_pipeline_script_protocol.md \
       --data-context .review-data-context-coa.md
     ```
     `.review-data-context-coa.md` already exists from WF2 (gitignored); regenerate by re-running the queries if it's been deleted.

  **Triage:** BUG → fold into plan + re-present "PLAN LOCKED (revised post-R0)" for re-auth. DEFER → catalogue in followups. REJECT → document rationale.

- [ ] **R1 — Apply R0 fixes (if any) and re-lock OR proceed.**

- [ ] **R2 — Investigate the broken CoA branch (read-only, no writes).**
  - Read `scripts/classify-lifecycle-phase.js` lines ~855-906 (the `coa_applications` UPDATE branch).
  - Read `scripts/lib/lifecycle-phase.js` to find the pure function's CoA handling.
  - Read `src/tests/classify-lifecycle-phase.infra.test.ts` to see what's currently locked.
  - Run a probe query: `SELECT COUNT(*) FROM coa_applications WHERE lifecycle_phase IS NULL AND last_seen_at > NOW() - INTERVAL '12 months'` — confirm the in-flight subset is in the NULL set and not skipped by some other filter.
  - **R0 DeepSeek HIGH-1 (verify):** does the existing CoA UPDATE branch use `IS DISTINCT FROM` guards per Spec 47 §6.4? If absent, fold into R5 scope (phantom writes break idempotency + inflate `records_updated`).
  - **R0 DeepSeek MED-5 (verify):** does the script capture `RUN_AT` at startup per Spec 47 §R3.5, or does it use inline `NOW()`? If inline, fold a §R3.5 fix into R5 scope.
  - **R0 DeepSeek LOW-6 baseline check:** run `node scripts/quality/assert-lifecycle-phase-distribution.js` against current state. Confirm it PASSes (validates the "bands tuned around broken baseline" theory). If it FAILs, the root cause is simpler (bands too tight) and the plan re-scopes.
  - **R0 DeepSeek NIT-7 probe:** `SELECT decision, COUNT(*) FROM coa_applications WHERE lifecycle_phase IS NULL AND decision IS NOT NULL GROUP BY decision`. Count rows that don't match any expected ILIKE variant — TRIM/whitespace handling may be needed.
  - **Output of R2:** a one-paragraph diagnosis naming the root cause + the specific lines to edit. Possible diagnoses:
    - **(a) Watermark stuck** — `lifecycle_classified_at` already set on rows but `lifecycle_phase` is NULL, so the incremental predicate `last_seen_at > lifecycle_classified_at` skips them forever.
    - **(b) Filter predicate too narrow** — the UPDATE only fires when `lifecycle_phase IS NOT NULL` (intending to refresh existing phases) but never sets it for the first time.
    - **(c) Pure function returns null for CoA inputs** — `classifyLifecyclePhase({ table: 'coa_applications', ... })` returns null because the CoA branch in the function has a bug.
    - **(d) Approval-string variants** — the P3 trigger checks `decision === 'Approved'` but the data has 5+ variants; everything except canonical "Approved" stays at P2 indefinitely.

- [ ] **R3 — Confirm 7 design decisions (D1–D7) before R4.**
  All 7 decisions are documented above (see "Open design decisions" section). R3 is the gate where the user explicitly confirms each before tests + code lock the behavior. The decision needing the most explicit user signal is **D7 (P4 trigger redefinition)**, because it requires a Spec 84 §3.1 amendment in this WF (not deferred).

- [ ] **R4 — Red Light tests (write failing tests FIRST).**
  Test files: `src/tests/lifecycle-phase.logic.test.ts` (existing — extend the CoA section + REVIEW existing assertions for current-behavior locks that need updating post-fix) AND `src/tests/classify-lifecycle-phase-coa.infra.test.ts` (NEW).

  **Phase-trigger logic tests (~21 cases — expanded from 13 per D5/D6/D7):**

  *Decision-driven (D2 ILIKE-on-normalized + D4):*
  1. `decision = 'Approved'` → **P3** (NOT P2 — current buggy behavior)
  2. `decision = 'Approved with Conditions'` → P3
  3. `decision = 'approved'` (lowercase) → P3
  4. `decision = 'Approved on Condition'` → P3
  5. `decision = 'conditional approval'` → P3
  6. `decision = 'Refused'` → **P19** (NOT null — current buggy behavior)
  7. `decision = 'Withdrawn'` (decision variant) → P19
  8. `decision = 'Approved' AND decision_date > NOW() - 20 days` → P3 (still in appeal window)
  9. `decision = 'Approved' AND decision_date < NOW() - 20 days` → **P4** (D7a — appeal-window-cleared)

  *Status-driven when decision IS NULL (D6 NEW):*
  10. `status = 'Application Received'` → P1
  11. `status = 'Accepted'` → P1
  12. `status = 'Hearing Scheduled'` → P2
  13. `status = 'Tentatively Scheduled'` → P2
  14. `status = 'Postponed'` → P2
  15. `status = 'Application Withdrawn'` → **P19** (status-driven terminal, currently misclassified to P1)
  16. `status = 'Conditional Consent'` (decision NULL but status approval) → **P3**
  17. `status = NULL, decision = NULL` → P1 (safest intake default)

  *Linked-but-pending Pattern 2 cases (D5 NEW — the operational signal):*
  18. `linked_permit_num = '24-101234', decision = NULL, status = 'Hearing Scheduled'` → **P2** (NOT null — current buggy behavior drops phase). Locks D5 decision.
  19. `linked_permit_num = '24-101234', decision = 'Approved'` → P3 (preserves phase for cross-stream rendering per Spec 84 §5 Pattern 1).

  *Edge cases:*
  20. Empty `coa_applications` table → no-op, no errors
  21. Watermark-stuck: `lifecycle_phase IS NULL, lifecycle_classified_at = '2024-01-01', last_seen_at = '2026-05-11'` → phase set (proves watermark predicate doesn't skip pre-classified rows). (Verified PRESENT in current script, but lock anyway.)

  **Existing test re-locks (R4-bis — flag in commit message):**
  - `src/tests/lifecycle-phase.logic.test.ts` has assertions locking the current (buggy) `classifyCoaPhase()` behavior — e.g., assertions that "approved decisions → P2" or "linked CoAs → null phase". These FAIL after the fix and must be updated to reflect post-fix behavior. R5 includes auditing and updating those assertions; document each change in the commit message footer.
  - `src/tests/classify-lifecycle-phase.infra.test.ts` may have script-level CoA assertions to update.

  Verify all 21 NEW cases FAIL against pre-fix code before R5.

- [ ] **R5 — Implementation (scope expanded post-R2).**
  Pure-function rewrite of `classifyCoaPhase()` in `scripts/lib/lifecycle-phase.js:371-401` PLUS the dual-path mirror at `src/lib/classification/lifecycle-phase.ts` (Spec 7 §7.1). New function shape per D5/D6/D7:
  ```js
  function classifyCoaPhase(input) {
    const normalizedDecision = normalizeCoaDecision(input.decision);

    // Terminal phase from decision (D4): Refused/Withdrawn/Dead → P19
    if (normalizedDecision != null && NORMALIZED_DEAD_DECISIONS.has(normalizedDecision)) {
      return { phase: 'P19', stalled: false };
    }

    // Approved → P3 or P4 (D7a — 20-day appeal-window cutoff)
    if (normalizedDecision != null && NORMALIZED_APPROVED_DECISIONS.has(normalizedDecision)) {
      const appealCleared = input.decisionDate != null
        && (Date.now() - new Date(input.decisionDate).getTime()) > APPEAL_WINDOW_MS;
      return { phase: appealCleared ? 'P4' : 'P3', stalled: false };
    }

    // Terminal phase from status (D6): Withdrawn/Closed/Cancelled → P19
    if (STATUS_TERMINAL_P19.has(input.status)) {
      return { phase: 'P19', stalled: false };
    }

    // Approval-from-status (D6): Conditional Consent → P3
    if (STATUS_APPROVAL_P3.has(input.status)) {
      return { phase: 'P3', stalled: false };
    }

    // In-review phase (D6): hearing/postponed/deferred → P2
    if (STATUS_REVIEW_P2.has(input.status)) {
      return { phase: 'P2', stalled: computeStalled(input) };
    }

    // Intake phase (D6 default): Application Received / Accepted / unknown → P1
    return { phase: 'P1', stalled: computeStalled(input) };
  }
  ```
  Three new constants: `STATUS_TERMINAL_P19`, `STATUS_APPROVAL_P3`, `STATUS_REVIEW_P2` (frozen sets, exported alongside `NORMALIZED_DEAD_DECISIONS`). `APPEAL_WINDOW_MS = 20 * 24 * 60 * 60 * 1000` (D7a — 20 days).

  Other changes:
  - Update `NORMALIZED_DEAD_DECISIONS` consumers — the set is now P19-mapped, not null-mapped (was correct in this fix).
  - Update `src/tests/lifecycle-phase.logic.test.ts` — audit + update assertions that lock CURRENT (buggy) behavior.
  - The streaming query in `classify-lifecycle-phase.js:901-908` already passes `decision, linked_permit_num, status` — must also pass `decision_date` for the D7a appeal-window cutoff. Update the SELECT projection + the function input shape.
  - `linked_permit_num` is no longer consumed by `classifyCoaPhase` (D5 — short-circuit dropped). Remove from input shape OR retain but unused (preserve script's existing query for minimal diff).

  `npm run typecheck` after each file lands.

  **R0 DeepSeek HIGH-1 + MED-5 + NIT-7 — all REJECT** (verified at R2 — `IS DISTINCT FROM` guards present at line 449-450, `RUN_AT` captured at line 901, `normalizeCoaDecision` already handles whitespace/case).

- [ ] **R6 — Green Light verification (re-banding expanded post-R2).**
  - `npm run test` — full suite green (5,223 baseline at `7b17373` + 21 new CoA tests = ~5,244, minus N existing-test updates from R5 audit). Existing-test churn count documented in commit footer.
  - `npm run lint -- --fix`
  - **Live run:** `node scripts/classify-lifecycle-phase.js` against dev DB. Capture PIPELINE_SUMMARY's `coa_phase_changes` metric (line 1100). Expected: ~32,000 phase changes on the first post-fix run (covers historical NULLs, including the 32,845 linked-decided CoAs now getting P3/P4/P19); ~0-200 on the second invocation (idempotent via existing `IS DISTINCT FROM` guard).
  - **Re-band exercise (post-fix data — 6 new bands):**
    ```sql
    SELECT lifecycle_phase, COUNT(*) FROM coa_applications GROUP BY lifecycle_phase ORDER BY n DESC;
    ```
    Expected post-fix distribution (with D7a 20-day appeal cutoff):
    - P1 ≈ 320 (intake — Application Received/Accepted + null status/decision defaults)
    - P2 ≈ 1,260 (review — Hearing Scheduled/Postponed/Deferred/etc.)
    - P3 ≈ 2,000 (Approved within 20-day appeal window)
    - P4 ≈ 25,000 (Approved past appeal window — Final and Binding by elapsed time)
    - P19 ≈ 4,500 (Refused 2,802 + Withdrawn 711 + status-driven Application Withdrawn 686 + closures)

    Add to `scripts/seeds/logic_variables.json` (single-source-of-truth per Spec 86 §1):
    - `lifecycle_band_coa_p3_min/max` (NEW — ~1,400 / ~2,800)
    - `lifecycle_band_coa_p4_min/max` (NEW — ~21,000 / ~29,000)
    - `lifecycle_band_coa_p19_min/max` (NEW — ~3,800 / ~5,200)
    - Update `lifecycle_band_coa_p1_min/max` + `lifecycle_band_coa_p2_min/max` against live counts ± 30% tolerance per Spec 84 §3.8.
  - **`assert-lifecycle-phase-distribution.js` update:** add P3/P4/P19 to the CoA bands checked. Today it only checks `coa_p1` + `coa_p2`. Without this update the CQA gate would PASS regardless of P3/P4/P19 counts — defeating the purpose.
  - **R0 DeepSeek MED-2 cross-env caveat:** dev-DB counts may differ from prod (more in-flight + fewer historical decided in prod due to ingestion timing). Default: ship dev-banded values with ± 30% tolerance + add a post-deploy verification step in the R10 operator runbook.
  - **R0 Gemini MED-5 downstream verify:** confirm Spec 91 §3.5 CoA-as-lead leads render the now-non-NULL `lifecycle_phase`. Hit `GET /api/leads/feed?trade_slug=realtor` (or admin equivalent) for a CoA lead. Spec 84 §5 cross-stream subsection (shipped in `7b17373`) is the rendering contract.
  - **CQA gate verification:** run `node scripts/quality/assert-lifecycle-phase-distribution.js`. Expected: PASS for all 5 CoA bands (P1/P2/P3/P4/P19).

- [ ] **R7 — Spec 84 amendments + Pre-Review Self-Checklist (expanded post-R2).**
  - **Spec 84 §3.1** — P4 trigger redefinition (D7a): change row from "Decision: 'Final and Binding' (Appeal period cleared)" to "Decision: 'Approved' AND decision_date > 20 days ago (Toronto CoA appeal window cleared)". Cite the live-data probe finding (0 decisions match the original trigger text).
  - **Spec 84 §3.1** — extend P1/P2 trigger descriptions to reflect D6 status-driven branching. Add P19 status-driven triggers (Application Withdrawn / Closed / Cancelled).
  - **Spec 84 §3.6** — add CoA status-driven P19 row.
  - **Spec 84 §3.8** — add `coa_p3`, `coa_p4`, `coa_p19` to the band namespace.
  - **Spec 84 §6 row 84-W12** — mark Resolved (commit hash placeholder until R10). Refine the symptom text to match R2's actual diagnosis (4 structural issues, not just "silent no-op").
  - Self-checklist (12 items — expanded per R0 findings):
    1. Pure function `classifyLifecyclePhase` returns non-null P1/P2/P3/P4 for CoA inputs per §3.1 trigger table
    2. Dual-path mirror at `src/lib/classification/` (if touched) stays in sync (Spec 7 §7.1)
    3. All 5+ approval-string variants map to P3 (R3-D2 resolution), with TRIM applied for whitespace variants
    4. **R3-D4** Refused + Withdrawn map to P19; Deferred stays at P2 (no silent misclassification of ~4K CoAs)
    5. Idempotency preserved — second invocation of the script is a no-op (`records_updated = 0`)
    6. **R0 DeepSeek HIGH-1** CoA UPDATE uses `IS DISTINCT FROM` guards per Spec 47 §6.4
    7. CoA branch transaction is atomic (existing `withTransaction` preserved)
    8. **R0 DeepSeek MED-5** Spec 47 §R3.5 RUN_AT capture is preserved (no inline NOW() introduced)
    9. **R0 Gemini HIGH-1** PIPELINE_SUMMARY structure: `coa_phase_changes` metric present per Spec 47 §R10; `records_total` / `records_new` / `records_updated` accurate
    10. **R0 Gemini HIGH-1** PIPELINE_META emissions present per Spec 47 §R11 (`coa_applications` listed in reads + writes)
    11. `assert-lifecycle-phase-distribution.js` PASSes against post-fix data with re-banded thresholds
    12. **R0 Gemini MED-5** Spec 91 §3.5 CoA-as-lead leads render the now-non-NULL `lifecycle_phase` without UI changes

- [ ] **R8 — Multi-Agent Review (3 reviewers post-implementation).**
  1. **Gemini** on `scripts/classify-lifecycle-phase.js` diff vs `docs/specs/01-pipeline/47_pipeline_script_protocol.md`
  2. **DeepSeek** on the diff vs `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` (Spec 84 §3.1 / §3.8 contract)
  3. **Worktree code-reviewer** (Agent + isolation:worktree) — full diff vs Spec 47 §R1-R12 + Spec 84 §3 + the dual-path Spec 7 §7.1 invariant.

  Triage: BUG → fix in-loop; DEFER → `docs/reports/review_followups.md`.

- [ ] **R9 — Apply review fixes + re-verify.**

- [ ] **R10 — Atomic commit + push + close active task.**
  Commit message: `fix(84_lifecycle_phase_engine): WF3 #coa-classifier-coverage — Fix A: close 84-W12 (99.4% NULL coa.lifecycle_phase)`.

  **R0 Gemini HIGH-3 operator runbook footer** (data rollback for the ~32K row backfill):
  ```
  Operator runbook (post-deploy):
  1. Next chain run will classify the backfill automatically (no manual step).
  2. Verify post-deploy:
     SELECT lifecycle_phase, COUNT(*) FROM coa_applications GROUP BY lifecycle_phase
     Expected: NULL drops from 32,865 to <500; P1+P2 ≈ in-flight count;
     P3 ≈ approved historical; P19 ≈ refused/withdrawn historical.
  3. Re-band confirmation: node scripts/quality/assert-lifecycle-phase-distribution.js
     should PASS for all coa_p1 / coa_p2 / coa_p19 bands.

  Data rollback (emergency only, if classification produces wrong phases):
  - The fix updates lifecycle_phase from NULL to a P-value. To roll back,
    clear the affected rows in coa_applications back to NULL:
      UPDATE coa_applications
      SET lifecycle_phase = NULL, lifecycle_classified_at = NULL
      WHERE lifecycle_classified_at > '<commit-deploy-timestamp>';
  - This is reversible — the next chain run after redeploying the prior
    version would re-establish the broken-baseline (~99.4% NULL).
  - Bounded blast radius: only the rows the broken classifier WOULD have
    left NULL get touched (the watermark predicate's contrapositive).
  ```

  `git push origin main` after Husky pre-commit gate. Mark this active_task Done. Restore Phase 3 (Fix B cross-stream timeline) from `.cursor/queued_task_coa_lifecycle_fixes.md` on next user signal.

---

> **PLAN LOCKED (revised post-R2 investigation — scope expanded materially). Do you authorize this revised WF3 plan? (y/n)**
>
> **R2 outcome:** the original "small classifier fix" became a "pure-function rewrite + dual-path mirror + 6 new bands + 4 Spec 84 amendments + ~21 new tests + audit of existing test assertions." Three new design decisions (D5/D6/D7) added — D7 in particular needs explicit user signal because it requires a Spec 84 §3.1 amendment in this WF (P4 trigger redefinition).
>
> **R0 findings status:** 12 originally folded; 3 of those are now REJECT because R2 verified them already in place (`IS DISTINCT FROM` guard, `RUN_AT` capture, whitespace TRIM). 9 still apply. All 21 R4 test cases reflect the post-R2 scope.
>
> **Material plan changes since first lock:**
> - **R2** expanded with 4 new verification probes: `IS DISTINCT FROM` guard check, `RUN_AT` capture check, pre-fix CQA-gate baseline check, variant TRIM probe
> - **R3-D4 (NEW)**: Refused/Withdrawn → P19; Deferred → P2. Prevents ~4K silent misclassifications.
> - **R4 13 tests** (was 6): added P4 "Final and Binding", 3 more approval variants, Refused→P19, Withdrawn→P19, watermark-stuck regression, idempotency
> - **R5** explicitly requires `IS DISTINCT FROM` (Spec 47 §6.4) + `RUN_AT` (§R3.5) fixes if R2 finds them absent
> - **R6** added downstream Spec 91 §3.5 verification + cross-env re-banding caveat (dev vs prod)
> - **R7 12-item checklist** (was 8): + PIPELINE_SUMMARY / META coverage (§R10/§R11), + IS DISTINCT FROM, + D4 terminal classification, + downstream UI verify
> - **R10 footer** now includes concrete data-rollback SQL for the ~32K row backfill
>
> **Open meta-observation:** R0 plan review surfaced significantly more risk than the WF2 spec-amendments R0 did. Validates the "use plan reviewers" question — bug fixes touching gating CQA + classifiers need this depth.
>
> §10 note: WF3 bug fix with bundled scope. All §11 Plan Compliance items addressed inline (Spec 47 §R skeleton, §6.4 IS DISTINCT FROM, §R3.5 RUN_AT, §7.1 dual-path, §5.1 typed factories, §2.1 unhappy-path covering 4 R2 diagnosis branches). Multi-agent review at BOTH R0 (done — above) and R8 (post-implementation).
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
