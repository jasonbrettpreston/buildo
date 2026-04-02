# Active Task: WF3 — Boy Scout Rule Enforcer
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `46807fc`

## Context
* **Goal:** Programmatically enforce the Boy Scout Rule — if a developer touches a grandfathered script, CI blocks the PR until the lint warnings are fixed.
* **Key Files:** `scripts/.grandfather.txt` (new), `scripts/enforce-boy-scout.sh` (new), `.github/workflows/pipeline-lint.yml`

## Grandfather List (9 scripts)
1. scripts/audit_all_specs.mjs — process.exit()
2. scripts/generate-db-docs.mjs — new Pool(), process.exit()
3. scripts/local-cron.js — process.exit()
4. scripts/poc-aic-scraper-v2.js — empty catch block
5. scripts/quality/assert-data-bounds.js — process.exit()
6. scripts/quality/assert-engine-health.js — process.exit()
7. scripts/quality/assert-schema.js — process.exit()
8. scripts/run-chain.js — process.exit()
9. scripts/task-init.mjs — process.exit()

## Execution Plan
- [ ] Create `scripts/.grandfather.txt` with the 9 scripts
- [ ] Create `scripts/enforce-boy-scout.sh`
- [ ] Wire into CI workflow
- [ ] Add regression test
- [ ] Green Light
