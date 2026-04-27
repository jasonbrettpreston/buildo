---
description: WF5 — Audit the codebase. Core always runs. Append a keyword for a focused subsection: code, build, prod, prod backend, pipeline, manual [feature].
---

You are running WF5: Audit.

First, identify which subsection applies based on any keyword the user appended:
- (none) → Core only
- `code` → Core + Code Quality
- `build` → Core + Build Health
- `prod backend` → Core + load `docs/specs/00-architecture/07_backend_prod_eval.md` (46-check rubric)
- `prod [section]` → Core + Production Readiness Vectors
- `pipeline` → Core + Pipeline Validation
- `manual [feature]` → Core + Manual App Assessment

---

## Core (always runs)

- [ ] **Spec Alignment:** Run `node scripts/audit_all_specs.mjs`. Review `docs/reports/full_spec_audit_report.md`. File WF3 for each discrepancy.
- [ ] **Test Suite:** `npm run test` — all must pass.
- [ ] **Type Check:** `npm run typecheck` — 0 errors.
- [ ] **Dead Code Scan:** `npm run dead-code` (knip).
- [ ] **Supply Chain:** `npm audit` — zero High or Critical.
- [ ] **Verdict:** "GO" (Green) or "NO-GO" (Red) with specific blockers.

---

## Code Quality (`WF5 code`)
- [ ] **Coverage Check:** Any untested critical paths (scoring, classification, sync)?
- [ ] **logError Enforcement:** Grep `src/app/api/` for bare `console.error` — zero allowed.
- [ ] **Secrets Scan:** `grep -rn "process\.env\." src/ --include="*.tsx" --include="*.ts"` — any non-`NEXT_PUBLIC_` env var in a file marked `"use client"` is a potential secret exposure. Review each hit.
- [ ] **OFFSET Pagination Scan:** `grep -rn "\bOFFSET\b" src/ --include="*.ts"` — flag any OFFSET on `permits` or `coa_applications`. Large tables require cursor/keyset pagination.
- [ ] **useEffect Fetch Scan:** `grep -rn "useEffect" src/ --include="*.tsx"` — review each hit. Any fetch or data-loading call inside useEffect is banned; use TanStack Query instead.
- [ ] **UI Viewport Audit:** 3 critical components — verify 375px + 44px touch target tests exist.
- [ ] **Verdict:** List gaps. File WF3 for each.

---

## Build Health (`WF5 build`)
- [ ] `npm run build` — measure time.
- [ ] `npx madge --circular --extensions ts,tsx src` — circular deps.
- [ ] Review `next.config.js` for misconfigurations.
- [ ] `ANALYZE=true npm run build` — bundle anatomy.
- [ ] Score against 7-Point Build Health Rubric (in `.claude/workflows.md`).
- [ ] Output `docs/reports/audit_[date].md`.

---

## Production Readiness (`WF5 prod [section]`)
Score each of the 10 Production Readiness Vectors (0–3) from `.claude/workflows.md`.
Threshold: all >= 1, average >= 1.5. Any 0 blocks release.

---

## Pipeline Validation (`WF5 pipeline`)
- [ ] Run each chain (permits, coa, sources) — no crashes.
- [ ] CQA gates pass (assert-schema + assert-data-bounds).
- [ ] Admin panel reflects actual pipeline state.
- [ ] Trigger a pipeline failure → health banner turns yellow/red.
- [ ] Re-run failed pipeline → succeeds, banner returns to green.
- [ ] Verdict: X/5 passed. File WF3 for each failure.

---

## Manual App Assessment (`WF5 manual [feature]`)
- [ ] Load `docs/specs/[feature].md`. Identify Behavioral Contract.
- [ ] One checkbox per spec requirement — each must be atomic.
- [ ] Execute each scenario. Record PASS/FAIL. File WF3 on any FAIL.
- [ ] Edge cases: concurrent triggers, empty states, error responses, 375px viewport.
- [ ] Verdict: X/Y passed. List all WF3s filed.
