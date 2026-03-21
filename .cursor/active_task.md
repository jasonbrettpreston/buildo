# Active Task: Fix assert-data-bounds.js — WSIB metrics missing from audit_table
**Status:** Implementation
**Rollback Anchor:** `8c9e64d`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** WSIB registry checks (legal names, G-class, NAICS codes, orphaned links) push to errors/warnings arrays but are NOT included in any audit_table. When WSIB fails, the dashboard shows red but the accordion table only shows permit/source metrics — admin can't see WHY it failed without checking server logs.
* **Target Spec:** `docs/specs/35_wsib_registry.md`
* **Key Files:**
  - `scripts/quality/assert-data-bounds.js` — hoist WSIB variables, append to active audit_table

## Technical Implementation
* **Bug:** WSIB check variables (`wsibNoName`, `wsibNonG`, `wsibBadNaics`, `wsibOrphan`) are scoped inside a `try` block (lines 382-445). They're not accessible when building the audit_table. WSIB errors show in logs and fail the script, but the UI audit_table has no WSIB rows.
* **Fix:** Hoist `let wsibNoName = 0, wsibNonG = 0, wsibBadNaics = 0, wsibOrphan = 0` before the try block. After the WSIB checks, build WSIB audit rows and append to whichever audit_table is active (permits or sources). Re-evaluate verdict if WSIB rows have FAILs.
* **Database Impact:** NO

## §10 Plan Compliance Checklist
### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK (§9.4)
- [x] No streaming changes (§9.5)
### Other: ⬜ All N/A

## Execution Plan
- [ ] **Rollback Anchor:** `8c9e64d`
- [ ] **State Verification:** Confirmed WSIB metrics not in any audit_table
- [ ] **Fix:** Hoist variables + build WSIB rows + append to active audit_table
- [ ] **Green Light:** typecheck + test pass → WF6
