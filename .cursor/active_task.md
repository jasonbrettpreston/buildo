# Active Task: WF2 #coa-spec-amendments — Document the two-stream CoA-and-permits architecture (Phase 1 of 3)
**Status:** Done (committed 2026-05-11 — R0 plan review caught 6 items, all folded; 4 specs amended doc-only; 5223/5223 tests pass; Phase 3 design notes appended to queue)
**Workflow:** WF2 (Enhancement — doc-only spec amendments; no code, no migrations, no chain changes)
**Domain Mode:** Backend/Pipeline (per Domain Rules table: doc-only on pipeline specs → "follow whichever domain the documented work belongs to" — these are 01-pipeline specs). Standards: `docs/specs/00_engineering_standards.md` §10 Plan Compliance applies; Spec 47 §R1–R12 does NOT (no scripts/ code touched).
**Rollback Anchor:** `9795227` (current HEAD on `main` — WF2 #review-templates + queued CoA fixes)
**Multi-Agent Review:** OPT-IN — first WF to use the new R0 template cadence from `9795227`. Run BOTH Gemini (compliance / tests / contracts) and DeepSeek (failure modes / data reality / edges) at R0 with the new templates, BEFORE locking the spec text. R8 post-implementation review SKIPPED — pure doc changes, no implementation surface to review.

---

## Context

* **Goal:** Make Specs 50, 51, 60, and 84 accurately reflect the two-stream CoA-and-permits data flow + the known broken-state of the CoA classifier, BEFORE Fix A (the script fix) lands. Once the specs are correct, Fix A has a clear contract to validate against.

* **Why now:** Phase 1 of 3 per the queued CoA lifecycle fixes (`.cursor/queued_task_coa_lifecycle_fixes.md`). The 2026-05-11 investigation surfaced that the live data reality (99.4% NULL `coa_applications.lifecycle_phase`, Pattern 1 vs Pattern 2 temporal split, `create-pre-permits.js` mutating despite spec saying read-only, etc.) is undocumented or actively misdocumented across four specs.

* **Target Specs (all 01-pipeline):**
  - **Spec 50** (`50_source_permits.md`) — pre-issuance permit feed semantics
  - **Spec 51** (`51_source_coa.md`) — CoA cardinality + temporal patterns
  - **Spec 60** (`60_shared_steps.md`) — fix WRONG description of `create-pre-permits.js`; verify Tier 3 FTS status
  - **Spec 84** (`84_lifecycle_phase_engine.md`) — three additions: new §6 bug 84-W12, §5 cross-stream commentary, §3 ledger-key inline note

* **Key Files (all doc):**
  - **MODIFY `docs/specs/01-pipeline/50_source_permits.md`** — add "Pre-issuance permits" sub-section in §3 documenting the 7 pre-issuance status values + the 16,142-row scale (6.5% of permits)
  - **MODIFY `docs/specs/01-pipeline/51_source_coa.md`** — extend §3 with: cardinality (33,052 / 99.4% linked / 82.4% approved), decision distribution, in-flight count (1,690), hearing→decision median (23 days), note about missing `submission_date` column (intake→hearing time unknown)
  - **MODIFY `docs/specs/01-pipeline/60_shared_steps.md`** — rewrite the `create-pre-permits.js` section to reflect actual behavior (INSERTs PRE- rows + 18-month expiry); verify and update Tier 3 FTS status note for `link-coa.js`
  - **MODIFY `docs/specs/01-pipeline/84_lifecycle_phase_engine.md`** — add §6 entry 84-W12 with symptom + resolution; add §5 cross-stream subsection covering Pattern 1 vs Pattern 2 + the 171 blocked permits; add inline note in §3 that `permit_phase_transitions` is permit-keyed only (cross-references future Fix B)

* **NO** new files, tests, or migrations. NO code changes. NO script changes. NO chain manifest changes. Pure markdown.

## Technical Implementation

* **New/Modified Components:** N/A (doc-only).
* **Data Hooks/Libs:** N/A.
* **Database Impact:** NO.

* **Verification approach (since no tests exist for spec text):**
  - **R5 verification:** the existing `src/tests/assert-global-coverage.infra.test.ts` includes spec step-count assertions (e.g. line 444 "29 steps"). My spec amendments must NOT touch step counts, table row counts, or other spec invariants that have regression-lock tests. Verify by grepping the test for any references to the section numbers / step counts I'm touching.
  - **Spec-link grep:** search for incoming references to the modified sections; if downstream specs reference a section I rename, fix those too.

* **Verification queries to ground each amendment (already run at investigation 2026-05-11):**

| Amendment | Verification query | Live result |
|---|---|---|
| Spec 50 — pre-issuance scale | `SELECT COUNT(*) FROM permits WHERE issued_date IS NULL` | 16,142 |
| Spec 50 — status distribution | `SELECT status, COUNT(*) FROM permits GROUP BY status` | 7 pre-issuance statuses listed in queued task |
| Spec 51 — CoA cardinality | `SELECT COUNT(*), COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) FROM coa_applications` | 33,052 / 32,845 (99.4%) |
| Spec 51 — decision split | `SELECT decision, COUNT(*) FROM coa_applications GROUP BY decision` | 82.4% / 8.5% / 5.1% / 3.6% |
| Spec 51 — in-flight CoAs | `SELECT COUNT(*) FROM coa_applications WHERE decision IS NULL AND last_seen_at > NOW() - INTERVAL '12 months'` | 1,690 |
| Spec 51 — hearing→decision | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY decision_date - hearing_date)` | 23 days median |
| Spec 84 §6 84-W12 — NULL phase scale | `SELECT lifecycle_phase, COUNT(*) FROM coa_applications GROUP BY lifecycle_phase` | NULL=32,865, P2=147, P1=40 |
| Spec 84 §5 Pattern split | `SELECT … application_date vs decision_date` | 77.8% Pattern 1, 22.2% Pattern 2 |
| Spec 84 §5 blocked permits | `SELECT COUNT(*) FROM permits p JOIN coa ca ON ca.linked=p.permit_num WHERE p.issued_date IS NULL AND ca.decision IS NULL` | 171 |

All numbers above are cited verbatim in the spec amendments (R3) — operators reading the spec can trust the numbers are live-DB-grounded.

## Standards Compliance

* **Try-Catch Boundary:** N/A — no API routes.
* **Unhappy Path Tests:** N/A — no automated tests for spec markdown. R0 reviewers + manual section-grep at R5.
* **logError Mandate:** N/A.
* **UI Layout:** N/A.

## Execution Plan

- [ ] **R0 — Multi-Agent Plan Review (NEW template cadence from `9795227`).**
  This WF is the first real consumer of the R0 templates from WF2 #review-templates. Run BOTH reviewers in parallel, single message:
  1. **Gemini (spec/test/contract compliance):**
     ```
     npm run review:gemini -- plan \
       --template .claude/review-templates/plan-review-gemini.md \
       --specs docs/specs/01-pipeline/50_source_permits.md,docs/specs/01-pipeline/51_source_coa.md,docs/specs/01-pipeline/60_shared_steps.md,docs/specs/01-pipeline/84_lifecycle_phase_engine.md
     ```
  2. **DeepSeek (failure modes / data reality / edges):**
     ```
     npm run review:deepseek -- plan \
       --template .claude/review-templates/plan-review-deepseek.md \
       --specs docs/specs/01-pipeline/50_source_permits.md,docs/specs/01-pipeline/51_source_coa.md,docs/specs/01-pipeline/60_shared_steps.md,docs/specs/01-pipeline/84_lifecycle_phase_engine.md \
       --data-context .review-data-context-coa.md
     ```
     Write `.review-data-context-coa.md` first — content is the 9-row verification table from "Technical Implementation" above, formatted as markdown.
  3. **Triage R0 findings:** BUG items → fold into the plan + re-lock; DEFER items → catalogue in commit message; REJECT items → document rationale.

- [ ] **R1 — Apply R0 fixes to this plan + re-present for authorization.** If R0 produced any BUG findings, revise the plan above and present "PLAN LOCKED (revised post-R0)" for re-auth. If only DEFERrals: proceed.

- [ ] **R2 — Read each spec in full before editing.**
  - `docs/specs/01-pipeline/50_source_permits.md` (96 lines)
  - `docs/specs/01-pipeline/51_source_coa.md` (92 lines)
  - `docs/specs/01-pipeline/60_shared_steps.md` (163 lines)
  - `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` (258 lines)
  Total ~609 lines; do this in parallel reads.

- [ ] **R3 — Apply amendments (4 specs).** Every amended section gets a "(snapshot 2026-05-11)" timestamp anchor (R0 DeepSeek LOW).
  1. **Spec 50** — add "Pre-issuance permits" sub-section in §3 (or §2 Data Source) with the 7 status values + 16,142 row count. **Caveat** (R0 DeepSeek MED): "Snapshot as of 2026-05-11; status set may drift as CKAN evolves — reconcile periodically with live data." Reference the link-coa step's dependence on pre-issuance permit visibility (Spec 60).
  2. **Spec 51** — extend §3 Behavioral Contract / Outputs with cardinality + decision distribution + in-flight count + hearing→decision median + missing-`submission_date` known limitation.
  3. **Spec 60** — **two amendments per R0 Gemini HIGH-1:**
     - **§2 Step Registry table** — update the `create_pre_permits` row's `Writes` column from `—` to `permits` (the actual mutation target). Also re-verify `Tier 3 FTS` status for `link_coa.js` (the §3 description currently says "not yet implemented" but the script source may have it now).
     - **§3 Step Details** — rewrite "Create Pre-Permits" subsection. **Pre-write verification** (R0 DeepSeek MED): grep `scripts/create-pre-permits.js` for `ON CONFLICT` / `DELETE + INSERT` idempotency pattern; quote the actual behavior in the spec text. If not idempotent, flag as a §-warning.
  4. **Spec 84** — three additions:
     - §6 table: new row "84-W12: CoA Classifier Silent No-Op — 99.4% of CoA records have NULL `lifecycle_phase` despite the classifier code path existing in `classify-lifecycle-phase.js`. Resolution: Fix A WF3 (`scripts/classify-lifecycle-phase.js` CoA branch investigation)."
     - §5 Front-end Preparation: insert new subsection "CoA ↔ Permit Cross-Stream Patterns" with Pattern 1 (78% sequential, median 1,078-day lag) + Pattern 2 (22% concurrent, 171 permits currently blocked). Reference Fix B WF1 for the inspector timeline integration.
     - §3 Behavioral Contract: inline note that `permit_phase_transitions` ledger is keyed on `(permit_num, revision_num)` only — therefore the `lifecycle.timeline[]` panel structurally cannot render for CoA-only leads. Cross-reference Fix B WF1.

- [ ] **R4 — Verify no spec invariants broken + test-coverage check (R0 Gemini HIGH-2).**
  - `Grep` `src/tests/` for any tests that reference the specific spec section numbers / step counts / row-count assertions I touched. If any exist, verify the assertion still holds post-amendment (the amendments shouldn't change any counted invariants).
  - **`Grep` `src/tests/coa*` + `src/tests/*pre-permit*` + `src/tests/*create-pre-permits*`** — find any test that exercises `create-pre-permits.js`'s INSERT behavior. If a test exists and asserts on the write, great; if not, file as a deferral for a follow-up WF (we're documenting REALITY, not creating a contract that needs immediate test coverage — the missing test is pre-existing, not introduced by this WF).
  - `npm run test` — full suite green (5,223 baseline at `9795227`). Spec markdown doesn't normally affect tests, but `assert-global-coverage.infra.test.ts` line 444 has a step-count assertion that I must not break.

- [ ] **R5 — Pre-Review Self-Checklist (Spec 33 §11 / WF2 mandate).**
  Walk against each spec amendment. PASS/FAIL each before R6:
  - Spec 50: pre-issuance section added; cites live-DB row count
  - Spec 51: cardinality + decision distribution + in-flight count + hearing→decision median documented; missing `submission_date` flagged
  - Spec 60: `create-pre-permits.js` description rewritten; Tier 3 FTS status confirmed (one way or the other)
  - Spec 84: §6 84-W12 added; §5 cross-stream subsection added; §3 ledger-key note added
  - All live-DB numbers cited verbatim from the verification queries — no rounding or estimation
  - No existing §-references in other specs broken by my section additions

- [ ] **R6 — Atomic commit + push.**
  - **Pre-commit cleanup (R0 DeepSeek MED):** add `.review-*` glob to `.gitignore` so this WF's `.review-data-context-coa.md` and future review-context files don't accidentally get committed.
  - Single commit: `docs(84_lifecycle_phase_engine): WF2 — amend Specs 50/51/60/84 to document two-stream CoA architecture + add bug 84-W12`
  - Operator runbook footer: none required (no migration, no script change).
  - `git push origin main` after Husky pre-commit gate.

- [ ] **R7 — Close active task + restore queued task for Phase 2 (Fix A).**
  Mark this active_task Done. Append a "Phase 3 design considerations" section to `.cursor/queued_task_coa_lifecycle_fixes.md` noting the 37 same-day Pattern-0 edge cases (R0 DeepSeek LOW deferral) so Fix B's design phase has the context. Copy Phase 2 content into a new active_task at next user signal.

---

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
>
> §10 note: doc-only WF2. No `src/`, `scripts/`, or `migrations/` touched. The §11 Plan Compliance Checklist items overwhelmingly N/A (no DB / API / pipeline / classification / UI changes). The only test-related concern is `assert-global-coverage.infra.test.ts` line 444's step-count assertion on Spec 41 — but this WF doesn't touch Spec 41 (chain step count) so that assertion is untouched. R0 multi-agent plan review is opt-in for this WF as a first real use of the templates from `9795227`; R8 post-implementation review is SKIPPED because the implementation surface is just markdown.
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
