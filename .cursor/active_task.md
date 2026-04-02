# Active Task: WF3 — Low-Severity Assessment Bugs (4 Fixes)
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `ff71782`

## Context
* **Goal:** Fix 4 remaining lower-severity bugs from `docs/reports/independent_scripts_assessment.md`.

## Bug Validation

| # | Script | Severity | Bug | Verdict |
|---|--------|----------|-----|---------|
| 1 | ai-env-check.mjs | 3/10 | `.env` strips `#` inside quoted values — `SECRET="my #1 password"` truncated to `SECRET="my` | **CONFIRMED** — line 30: `val.replace(/\s+#.*$/, '')` runs BEFORE quote stripping on line 32. Fix: strip comments only on unquoted values (after checking if value starts with a quote). |
| 2 | aic-scraper-nodriver.py | 4/10 | Windows PowerShell 5.1 `Get-Process` lacks `CommandLine` property — zombie Chrome cleanup fails silently | **CONFIRMED** — line 1229: `Get-Process chrome | Where-Object {$_.CommandLine -match ...}` silently passes (no error, no match). Fix: use `Get-CimInstance Win32_Process`. |
| 3 | audit_all_specs.mjs | 2/10 | Regex only matches `.js` pipeline files — misses `.py` and `.mjs` | **CONFIRMED** — line 90: `/(scripts\/[a-zA-Z0-9_\-\.\/]+\.js)/g`. Fix: broaden to `\.(js|py|mjs)`. |
| 4 | assert-data-bounds.js | 5/10 | Ghost record warning never added to `permitsAuditTable.rows` — dashboard stays green | **CONFIRMED** — lines 596-617: ghost check pushes to `warnings` array and logs, but `permitsAuditTable` was sealed at line 176. Fix: push ghost row into `permitsAuditTable.rows` and re-evaluate verdict. |

## Execution Plan
- [x] **Rollback Anchor:** `ff71782`
- [ ] **Fix 1:** ai-env-check.mjs — strip comments only for unquoted values
- [ ] **Fix 2:** aic-scraper-nodriver.py — `Get-CimInstance Win32_Process`
- [ ] **Fix 3:** audit_all_specs.mjs — regex includes `.py` and `.mjs`
- [ ] **Fix 4:** assert-data-bounds.js — push ghost rows into audit table
- [ ] **Green Light:** `npm run test && npm run typecheck`
- [ ] **Commit**
