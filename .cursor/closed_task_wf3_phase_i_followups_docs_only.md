# Active Task: WF3 — Spec 42 §6.11/§6.13 reconciliation (docs-only) (v2 — folded reviewer findings)
**Status:** Implementation
**Domain Mode:** Backend/Pipeline (docs-only — no `src/` or `scripts/` changes)
**Workflow:** WF3 — three docs-only findings bundled per user authorization (per `[[feedback_wf3_granularity]]` default is one-finding-per-WF3; bundle authorized 2026-05-19).

---

## Plan revision history

* **v1** — initial draft included a code change to `scripts/classify-lifecycle-phase.js:1718` summing CoA volume into `records_total`. Independent + Observability reviewers converged (100%/95% confidence) that this is a direct **Spec 47 §11.2 violation** — §11.2 names this exact script as the canonical example of a script whose CoA volume *MUST NOT* be summed into permits counters, going in `audit_table` only. The existing `coa_evaluated` audit row at line 1637 already satisfies the Overflow Rule.
* **v2 (this revision)** — drops the code change entirely. Pure docs-only WF3: reconcile Spec 42 §6.11 Phase I row items (2) + (3) markers + §6.13 stale Open Decisions cleanup. Zero behavioral risk before DB testing.

---

## Context

* **Goal:** Close out three docs-only follow-up items surfaced by the Spec 42 §6.11 implementation-plan review. Pure spec-hygiene pass with zero code change.

* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.11 Phase I row (items 2, 3) + §6.13 Open Decisions section.

* **Key files:**
  - `docs/specs/01-pipeline/42_chain_coa.md` — Phase I row marker updates + §6.13 reconciliation

* **Out of scope (verified, not folded):**
  - Phase H — legacy column drop + consumer rekey. No functional blocker; mirror-trigger pattern is functional indefinitely.
  - Phase I item (4) — `matched_rule IS NULL` defensive throw. **LOW VALUE:** matchedRule is set by hardcoded integer literals in every classifier rule branch (rules 0..15 permit-side, 0..9 CoA-side); no branch assigns null; runtime assertion deferred as low-value given the exhaustive branch structure. (Note: the related `finalizePermit()` / `finalize()` helpers in `scripts/lib/lifecycle-phase.js` runtime-assert on `matchedStatus === undefined`, NOT matchedRule — they don't cover this specific defensive case, but the cascade structure makes it unreachable in practice.)
  - Phase I item (5) — `computeWarnableAuditStatus` extraction to shared lib. PREMATURE: only one consumer today (4 uses in `classify-lifecycle-phase.js`); extract when a second appears.
  - Spec 48 §3.7 runbook artifact for Finding 1 — moot now that Finding 1 is docs-only.

## Findings + fixes (all docs-only)

### Finding 1 — Phase I row item (2): `records_total` "discrepancy" is actually §11.2-compliant

**Reviewer convergent finding** (Independent 100% / Observability 95%): the Phase I row item (2) text gave operators a binary choice ("change `records_total` OR document explicitly in operator pre-ack runbook"). The "preferred" branch (the sum) directly violates Spec 47 §11.2, which names `classify-lifecycle-phase` by name:

> §11.2 — *Secondary entity types — e.g., CoA application phase changes in classify-lifecycle-phase. Goes in audit_table as coa_phase_changes. **MUST NOT be summed into permits counters.***

The existing `coa_evaluated: dirtyCoAsCount` audit row at `scripts/classify-lifecycle-phase.js:1637` already satisfies the §11.2 Overflow Rule. The current `records_total: dirtyPermitsCount` is the spec-compliant primary count; per §11.3 Velocity Integrity, inflating it would break the velocity-integrity contract that §11.3 exists to protect.

**Fix (docs-only):** Update Spec 42 §6.11 Phase I row item (2) text to:

> (2) **`records_total` observability "discrepancy" — RESOLVED-as-NOT-APPLICABLE (WF3 2026-05-19):** Spec 47 §11.2 names this exact script as the canonical Overflow Rule example — CoA application phase changes MUST NOT be summed into permits counters. The current `records_total = dirtyPermitsCount` is the spec-compliant primary count; the existing `coa_evaluated: dirtyCoAsCount` audit row at line 1637 satisfies §11.2. Any observe-chain narrative gap (e.g., DeepSeek not surfacing CoA volume) is an observability-surfacing concern, not a counter-contract bug; deferred to a Spec 48 follow-up WF if/when narrative pollution is documented in production.

### Finding 2 — Phase I row item (3): ALREADY RESOLVED in Phase F.2 (strike-and-mark)

**Verification grep results:**
- `scripts/update-tracked-projects.js:265` — comment: *"v2 #118 fold: rename permit_lead_id → lead_id"*
- `scripts/update-tracked-projects.js:274` — `p.lead_id AS lead_id` (Branch A SOURCE_SQL standardization)
- `scripts/update-tracked-projects.js:397` — `row.lead_id` consistently
- `scripts/compute-trade-forecasts.js` — grep for `permit_lead_id` returns ZERO matches; all references use `row.lead_id` (lines 597, 688, 887)

Both scripts now consistently use `row.lead_id`. The #118 standardization landed in Phase F.2 commit `66884af`.

**Fix (docs-only):** Update Spec 42 §6.11 Phase I row item (3) text to:

> (3) **`lead_id` vs `permit_lead_id` guard-anchor naming inconsistency — RESOLVED in Phase F.2 commit `66884af`:** `scripts/update-tracked-projects.js` Branch A SOURCE_SQL standardized to `p.lead_id AS lead_id` (line 274; #118 fold comment at line 265). `scripts/compute-trade-forecasts.js` consistently uses `row.lead_id` (lines 597, 688, 887) with zero `permit_lead_id` references. Both defensive guards verified post-Phase F UNION source SQL.

### Finding 3 — §6.13 Open Decisions is stale (move to Resolved decisions)

**Verification:** all 4 items in §6.13 "Open Decisions (Block WF Plan-Lock)" have corresponding delivery notes elsewhere in the spec body:
- Q1 (classifier method) — resolved heuristic v1 during Phase D (DELIVERED 2026-05-14)
- Q2 (geocoding bundling) — resolved as DEFERRED per §6.6.X during Phase D (CKAN provides no GEO_ID FK; lat/long ownership shifted to link-coa-to-parcels.js + link-coa.js)
- Q3 (lead_analytics.lead_key rename) — resolved as "leave-as-is" (no delivery commit; cited in Phase I row as standing decision)
- Q4 (band recalibration depth) — resolved as 7 consecutive PASS runs during Phase E.5 (DELIVERED 2026-05-16 commit `0d90571`)

The "Resolved decisions (no longer open)" subsection already exists below §6.13's open list. The 4 items just need to be moved up.

**Fix (docs-only):** Move all 4 Q1-Q4 entries from "Open Decisions (Block WF Plan-Lock)" → "Resolved decisions (no longer open)" subsection. Relabel section header to "Decisions Log" since nothing is open. Each moved item should cite its resolving Phase / commit.

## Technical Implementation

* **DB Impact:** NONE.
* **Code Impact:** NONE.
* **Test Impact:** NONE — no new tests needed for docs-only changes.

## Standards Compliance

* **§10 Plan Compliance Checklist:** N/A — docs-only.
* **Try-Catch / Logging / Idempotency:** N/A.

## Execution Plan (WF3 — `.claude/workflows.md`, docs-only variant)

- [ ] **Spec Touchpoint:** Spec 42 §6.11 Phase I row (items 2 + 3) + §6.13 reconciliation.
- [ ] **Reproduction / Verification:** complete — both reviewers + my own grep confirmed.
- [ ] **Test First:** N/A (docs-only).
- [ ] **Red Light:** N/A.
- [ ] **Implementation:**
  1. Edit Spec 42 §6.11 Phase I row item (2) to "RESOLVED-as-NOT-APPLICABLE" per Spec 47 §11.2.
  2. Edit Spec 42 §6.11 Phase I row item (3) to "RESOLVED in Phase F.2 commit `66884af`" with line cites.
  3. Move §6.13 items Q1-Q4 to the existing "Resolved decisions" subsection with per-item resolution citations; relabel section header.
- [ ] **Multi-Agent Review:** PLAN-STAGE Independent + Observability done (2 reviewers per user request, no adversarial per WF3 convention). Findings folded into v2.
- [ ] **Green Light:** `npm run typecheck` (will pass — no code changes). No need to re-run full test suite.
- [ ] **WF6 close-out:** single commit for the spec edits.

## Operating Boundaries

* **Target files** (above).
* **Out-of-scope** (per user direction + reviewer convergence):
  - Phase H — legacy column drop work.
  - Phase I items (4) and (5) — defensive assertion + helper extraction.
  - `records_total` code change (v1 dropped per §11.2 reviewer convergence).
  - Spec 48 §3.7 runbook artifact (moot now that Finding 1 is docs-only).
  - observe-chain `extractIssues()` extension to read CoA-side audit rows — deferred to a Spec 48 follow-up WF.

---

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §10 note: docs-only; no code paths touched.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
