# Active Task: WF3 — Session Gap Audit Fixes
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `0f0d410`

## Context
* **Goal:** Fix 3 bugs found during comprehensive session gap audit
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/classify-permits.js`, `scripts/link-massing.js`

## Bug Inventory
| # | Script | Severity | Bug |
|---|--------|----------|-----|
| 1 | `classify-permits.js:547` | HIGH | `lastRevisionNum = 0` (number) should be `''` (string) — type mismatch in keyset pagination tuple comparison |
| 2 | `link-massing.js:247,253` | HIGH | `totalBuildings` and `grid` re-declared inside else block, shadowing outer declarations — PostGIS path reports 0 for grid_cells metric |
| 3 | `link-massing.js:534` | MEDIUM | `grid.size` metric reports 0 in PostGIS path because outer `grid` is empty Map |

## Execution Plan
- [ ] **Rollback Anchor:** `0f0d410`
- [ ] **Fix 1:** `classify-permits.js:547` — change `let lastRevisionNum = 0` to `''`
- [ ] **Fix 2:** `link-massing.js` — remove inner re-declarations of `totalBuildings` and `grid`, use outer variables
- [ ] **Fix 3:** `link-massing.js` — guard `grid.size` metric with PostGIS-aware conditional
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
