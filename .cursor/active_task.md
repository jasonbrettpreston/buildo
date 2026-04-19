# Active Task: Fix link-coa.js last_seen_at bump — exclude SKIP_PHASES
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `9cd863a`

---

## Context
* **Goal:** `link-coa.js` bumps `permits.last_seen_at` for every CoA-newly-linked permit, including SKIP_PHASES (P1/P2 pre-permit, P19/P20 terminal, O1-O3 orphan). On no-new-records runs these are the only permits in the 26h window, polluting `last_seen_at`'s Open-Data-feed semantic. The previous WF3 mitigated the symptom in `assert-entity-tracing`; this WF3 fixes the root cause.
* **Target Spec:** `docs/specs/pipeline/42_chain_coa.md` §2 (step 4: link_coa)
* **Key Files:**
  - `scripts/link-coa.js` — bump WHERE clause (~line 350)
  - `docs/specs/pipeline/42_chain_coa.md` — update step 4 description
  - `src/tests/chain.logic.test.ts` — reproduction tests

---

## Technical Implementation
* Add `AND (lifecycle_phase IS NULL OR lifecycle_phase NOT IN ('P19','P20','O1','O2','O3','P1','P2'))` to the bump UPDATE WHERE clause in `link-coa.js`
* **Tradeoff:** SKIP_PHASES permits with a newly-changed CoA linkage won't get the trailing `classify_lifecycle_phase` run in the CoA chain. Reclassification happens on the next daily permits chain run (≤24h delay). Acceptable — P19/P20/O1-O3 are terminal/orphan (phase-stable); P1/P2 are synthetic pre-permits whose phase can't advance from CoA linkage alone.
* NULL lifecycle_phase permits still get bumped — unclassified permits need the dirty signal.
* **Database Impact:** NO

---

## Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** NULL lifecycle_phase included in bump; SKIP_PHASES excluded; non-SKIP_PHASES still bumped
* **logError Mandate:** N/A
* **Mobile-First:** N/A

---

## Execution Plan
- [x] **Rollback Anchor:** 9cd863a recorded
- [ ] **State Verification:** Confirm SKIP_PHASES set matches compute-trade-forecasts
- [ ] **Spec Review:** Read 42_chain_coa.md §2 step 4 rationale
- [ ] **Reproduction tests:** chain.logic.test.ts (bump excludes SKIP_PHASES; NULL phase still bumped)
- [ ] **Red Light:** npx vitest run src/tests/chain.logic.test.ts — MUST fail
- [ ] **Fix:** Add SKIP_PHASES filter to bump WHERE clause in link-coa.js
- [ ] **Spec Update:** Update 42_chain_coa.md step 4 documentation
- [ ] **Pre-Review Self-Checklist:** 3-5 sibling bug check
- [ ] **Green Light:** npm run test && npm run lint -- --fix → WF6
- [ ] **Independent worktree agent review**
- [ ] **WF3 Triage:** Fix FAILs in-scope; defer rest to review_followups.md
- [ ] **Atomic Commit:** fix(42_chain_coa): WF3 — exclude SKIP_PHASES from last_seen_at bump
