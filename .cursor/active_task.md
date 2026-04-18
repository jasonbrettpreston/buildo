# Active Task: §11 counter fix: sources pipeline + review_followups
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `9583ca82` (9583ca829e98103a0af6c06cdc7ee9f51389a0fb)


## Context
* **Goal:** Fix §11 Counter Semantic Contract violations in 4 sources pipeline scripts; log 2 prior §11 fixes as closed items in review_followups.md.
* **Target Spec:** `docs/specs/pipeline/47_pipeline_script_protocol.md` (§11 Counter Semantic Contract)
* **Key Files:**
  - `scripts/link-massing.js` — `records_updated: buildingsUpserted` (JOIN TABLE rows) → `parcelsLinked`
  - `scripts/link-wsib.js` — `records_total: totalLinked` (matched only) → `totalUnlinked`
  - `scripts/link-parcels.js` — `records_updated: dbUpserted` (JOIN TABLE rows) → `totalLinked`
  - `scripts/load-neighbourhoods.js` — `records_new: boundaryCount` (not inserts) + `records_updated: profileUpdates` (wrong entity) → `records_new: 0`, `records_updated: boundaryCount`
  - `docs/reports/review_followups.md` — add 2 closed items for e37eaab + 9583ca8
  - `src/tests/chain.logic.test.ts` — §11 guardrail tests

## Technical Implementation
* **New/Modified Components:** 4 pipeline scripts + 1 test file + 1 report
* **Data Hooks/Libs:** N/A
* **Database Impact:** NO

## Execution Plan
- [ ] **Rollback Anchor:** `9583ca82` (auto-recorded by task-init)
- [ ] **State Verification:** Examine the calling context. Document what data is actually available vs. what the fix assumes.
- [ ] **Spec Review:** Read `docs/specs/[feature].md` to confirm the *intended* behavior.
- [ ] **Reproduction:** Create a failing test case in `src/tests/` that isolates the bug.
- [ ] **Red Light:** Run the new test. It MUST fail to confirm reproduction.
- [ ] **Fix:** Modify the code to resolve the issue.
- [ ] **Schema Evolution:** If the fix requires a DB change: write `migrations/NNN_[fix].sql` (UP + DOWN), run `npm run migrate`, then `npm run db:generate`.
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`. All tests must pass.
- [ ] **Collateral Check:** Run `npx vitest related src/path/to/changed-file.ts --run` to verify no unrelated dependents broke.
- [ ] **Atomic Commit:** Prompt user to commit: `git commit -m "fix(NN_spec): [description]"`. Do not batch.
- [ ] **Spec Audit:** Update `docs/specs/[feature].md` IF AND ONLY IF the fix required a logic change.
