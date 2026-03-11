# Active Task: WF5 Subsection System — Manual & Pipeline Assessment
**Status:** Planning

## Context
* **Goal:** Replace WF5's single monolithic audit with a subsection system. Keyword triggers (`WF5 manual`, `WF5 pipeline`, `WF5 code`, `WF5 build`, `WF5 prod`) activate focused checklists. The 1-line "Manual Validation" step becomes a structured spec-driven assessment protocol.
* **Target Spec:** `docs/specs/00_engineering_standards.md`
* **Key Files:**
  - MODIFY: `CLAUDE.md` — restructure WF5 into Core + subsections

## Technical Implementation
* **WF5 Core:** Runs on bare `WF5` trigger. Test suite, typecheck, dead code, supply chain, verdict.
* **WF5 code:** logError enforcement, UI viewport audit, coverage check.
* **WF5 build:** 7-point build health rubric (already exists in CLAUDE.md, just needs subsection trigger).
* **WF5 prod [section]:** 10-vector production readiness rubric (already exists, needs trigger).
* **WF5 pipeline:** 5-point pipeline functional validation — execution, CQA, UI accuracy, failure surfacing, recovery.
* **WF5 manual [feature]:** Spec-driven manual app assessment — read spec, create scenario checklist from behavioral contract, execute each in running app, edge cases, verdict with WF3 filing.
* **Net change:** ~25 lines added. The existing rubric tables stay in place; they get linked from subsection triggers.
* **Database Impact:** NO
* **New/Modified Components:** None
* **Data Hooks/Libs:** None

## Standards Compliance

### §1.1 Mobile-First UI Mandate
- **Applicability:** NOT APPLICABLE — documentation-only change. Zero `.tsx` files touched.

### §1.2 Component Isolation
- **Applicability:** NOT APPLICABLE — no UI components.

### §2.1 The "Unhappy Path" Test Mandate
- **Applicability:** NOT APPLICABLE — no API routes or integration tests.

### §2.2 The Try-Catch Boundary Rule
- **Applicability:** NOT APPLICABLE — no API routes.

### §2.3 Assumption Documentation
- **Applicability:** NOT APPLICABLE — no code changes.

### §3.1 Zero-Downtime Migration Pattern
- **Applicability:** NOT APPLICABLE — no database changes.

### §3.2 Migration Rollback Safety
- **Applicability:** NOT APPLICABLE — no migrations.

### §3.3 Pagination Enforcement
- **Applicability:** NOT APPLICABLE — no API routes.

### §4.1 Route Guarding
- **Applicability:** NOT APPLICABLE — no endpoints.

### §4.2 Parameterization
- **Applicability:** NOT APPLICABLE — no SQL.

### §5.1 Typed Factories Only
- **Applicability:** NOT APPLICABLE — no tests created.

### §5.2 Test File Pattern
- **Applicability:** NOT APPLICABLE — no test files created. This is a documentation enhancement only.

### §5.3 Red-Green Test Cycle
- **Applicability:** NOT APPLICABLE — no code to test. CLAUDE.md is a prompt instruction file.

### §5.4 Test Data Seeding
- **Applicability:** NOT APPLICABLE.

### §6.1 logError Mandate
- **Applicability:** NOT APPLICABLE — no API routes or lib modules.

### §7.1 Classification Sync Rule
- **Applicability:** NOT APPLICABLE — not touching classification.

### §7.2 Scope Classification Sync
- **Applicability:** NOT APPLICABLE.

### §8.1 API Route Export Rule
- **Applicability:** NOT APPLICABLE.

### §8.2 TypeScript Target Gotchas
- **Applicability:** NOT APPLICABLE.

### §9.1–§9.7 Pipeline & Script Safety
- **Applicability:** NOT APPLICABLE — no pipeline scripts created or modified.

## §10 Plan Compliance Checklist

### If Database Impact = YES:
⬜ N/A — Database Impact is NO.

### If API Route Created/Modified:
⬜ N/A — No API routes.

### If UI Component Created/Modified:
⬜ N/A — No UI components. Documentation only.

### If Shared Logic Touched (classification, scoring, scope):
⬜ N/A — Not touching shared logic.

### If Pipeline Script Created/Modified:
⬜ N/A — No pipeline scripts.

### Viewport Mocking:
N/A — Documentation only.

## Execution Plan
- [ ] **State Verification:** Read current WF5 section in CLAUDE.md. Identify the 1-line manual validation step and existing rubric tables.
- [ ] **Implementation:** Restructure WF5 in CLAUDE.md:
  1. Split execution plan into Core steps (always run) + subsection triggers
  2. Add `WF5 code` subsection definition
  3. Add `WF5 build` subsection reference (links existing 7-point rubric)
  4. Add `WF5 prod` subsection reference (links existing 10-vector rubric)
  5. Add `WF5 pipeline` subsection with 5-point checklist
  6. Add `WF5 manual [feature]` subsection with spec-driven assessment protocol
  7. Update Quick Triggers table to show subsection syntax
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass (no code changed, just docs).
- [ ] **Atomic Commit:** `git commit -m "docs(00_engineering_standards): add WF5 subsection system for manual & pipeline assessment"`.
