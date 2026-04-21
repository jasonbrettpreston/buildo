# Active Task: Cross-Domain — WF3 ColumnarAuditTable rowKey Fix + WF2 z.coerce.number() Sweep
**Status:** Implementation
**Workflow:** WF3 (Frontend) + WF2 (Backend)
**Rollback Anchor:** `b0ef6fe17b4ad3bc33dd8c3b1611115c273ad9a0`
**Domain Mode:** Cross-Domain (Frontend + Backend/Pipeline)

## Context
* **Goal (Part 1 / WF3):** Fix React key collision crash in `src/components/FreshnessTimeline.tsx` `ColumnarAuditTable` — rows keyed on `{ step_target, field }` but Score Engine rows use `{ metric, value }` → key evaluates to `"-"` for every row.
* **Goal (Part 2 / WF2):** Replace remaining 35 bare `z.number()` with `z.coerce.number()` across 19 pipeline scripts (pg DECIMAL-as-string coercion sweep).
* **Target Specs:**
  - `docs/specs/product/admin/26_admin_dashboard.md`
  - `docs/specs/pipeline/47_pipeline_script_protocol.md` §4
  - `docs/specs/00_engineering_standards.md`

## Execution Plan

### Phase A — WF3 Frontend
- [x] Rollback Anchor: `b0ef6fe`
- [ ] State Verification: Confirm `row.metric` is the discriminator for Score Engine rows
- [ ] Spec Review: 26_admin_dashboard.md ColumnarAuditTable section
- [ ] Reproduction: Author failing UI test
- [ ] Red Light: Must fail with duplicate-key error
- [ ] Fix: Apply 3-line change to FreshnessTimeline.tsx lines 321-324
- [ ] UI Regression Check: Run all *.ui.test.tsx
- [ ] Pre-Review Self-Checklist (sibling-bugs)
- [ ] Multi-Agent Adversarial Validation (DeepSeek + Gemini + Independent Review)
- [ ] Green Light: npm run test && npm run lint -- --fix
- [ ] Atomic Commit: fix(26_admin_dashboard): WF3 — unique rowKey for multi-schema ColumnarAuditTable

### Phase B — WF2 Backend
- [ ] State Verification: Re-confirm 35 instances / 19 files
- [ ] Guardrail Test: pipeline_logic_vars_coercion.infra.test.ts
- [ ] Red Light: Must fail on unpatched scripts
- [ ] Implementation: Sweep all 19 files
- [ ] Post-Edit Verification: 0 bare z.number() remaining in LOGIC_VARS_SCHEMA
- [ ] Pre-Review Self-Checklist (spec-section)
- [ ] Multi-Agent Adversarial Validation (DeepSeek + Gemini + Independent Review)
- [ ] Green Light: npm run test && npm run lint -- --fix
- [ ] Atomic Commit: chore(47_pipeline_script_protocol): WF2 — z.coerce.number() sweep across 19 pipeline scripts
