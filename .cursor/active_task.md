# Active Task: Fix FAIL verdict showing green in FreshnessTimeline
**Status:** Planning
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Pipeline steps with `status=completed` but `audit_table.verdict=FAIL` show green tiles instead of red. The `getStatusDot()` function only checks `info.status`, ignoring the audit verdict entirely.
* **Target Spec:** `docs/specs/37_pipeline_system.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` — `getStatusDot()` function (line ~255) and `tileFlash` border logic (line ~665)

## Technical Implementation
* **Root Cause:** `getStatusDot()` returns `bg-green-50` for all `status=completed` steps regardless of `audit_table.verdict`.
* **Fix:** When `status=completed`, check `records_meta.audit_table.verdict`:
  - `FAIL` → red bg + red border flash
  - `WARN` → amber bg (keep existing green border, just tint the bg)
  - `PASS` or missing → green bg (current behavior)
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** N/A — UI component
* **logError Mandate:** N/A
* **Mobile-First:** No layout changes, only color changes

## Execution Plan
- [ ] **Rollback Anchor:** `fa20106`
- [ ] **State Verification:** Confirmed `getStatusDot()` ignores verdict
- [ ] **Spec Review:** Pipeline system spec — audit_table verdict semantics
- [ ] **Reproduction:** link_massing FAIL verdict renders green tile
- [ ] **Fix:** Modify `getStatusDot()` to accept verdict param; update callers; update `tileFlash` border logic
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
