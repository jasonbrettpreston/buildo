# Active Task: CLAUDE.md Compliance Hardening (WF2 Audit Findings)
**Status:** Planning

## Context
* **Goal:** Apply the 3 action items from `docs/reports/wf2_compliance_audit.md` to harden CLAUDE.md against the two missed rules: (1) logError mandate not explicitly enforced in planning steps, (2) mobile viewport testing not enforced in audit steps.
* **Target Spec:** `docs/reports/wf2_compliance_audit.md`
* **Key Files:**
  - `CLAUDE.md` — Master Protocol (Standards Verification steps, Standards Compliance template, WF5 Audit checklist)

## Technical Implementation
* **Standards Verification step (WF1 + WF2):** Expand from 1-line to an explicit 3-point checklist that forces the AI to prove compliance with Mobile-First, Try-Catch/Unhappy Path, AND `logError` mandate.
* **Standards Compliance template section:** Add `logError` as a 4th required field alongside Try-Catch, Unhappy Path, and Mobile-First.
* **WF5 Audit checklist:** Add 2 new audit steps: (a) grep `src/app/api/` for bare `console.error` to enforce logError, (b) verify critical shared UI components have narrow-viewport tests.
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — docs-only change.
* **Unhappy Path Tests:** N/A — docs-only change.
* **logError Mandate:** This change is specifically about enforcing this rule.
* **Mobile-First:** N/A — docs-only change.

## Execution Plan
- [ ] **Standards Verification:** This is a docs-only change to CLAUDE.md. No src/ code modified.
- [ ] **Edit CLAUDE.md — Standards Compliance template:** Add `logError` field.
- [ ] **Edit CLAUDE.md — WF1 Standards Verification:** Expand to 3-point checklist.
- [ ] **Edit CLAUDE.md — WF2 Standards Verification:** Expand to 3-point checklist (same as WF1).
- [ ] **Edit CLAUDE.md — WF5 Audit:** Add logError grep + UI viewport audit steps.
- [ ] **Verification:** Run `npm run test` to confirm no regressions.
- [ ] **Atomic Commit:** `git commit -m "docs(CLAUDE): enforce logError mandate + viewport testing in workflows"`
