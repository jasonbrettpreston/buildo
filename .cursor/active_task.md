# Active Task: WF3 — P1: backup_db never runs (OP4), P2: C4 SQL grep false positives
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `f128180c19d17bc3853a5626aef6af3ff656784a`

## Context
* **Goal:** Fix two bugs surfaced by the WF5 prod backend evaluation (2026-04-25):
  - **P1 (OP4 — HIGH):** `backup_db` has never been triggered. `pipeline_runs` shows 0 rows for `backup_db`. `scripts/backup-db.js` is fully spec-47 compliant and registered in `scripts/manifest.json`, but it is not wired into any automated chain, so it never runs. OP4 check requires a completed run within the last 25h.
  - **P2 (C4 — FAIL):** `runs/route.ts` builds a dynamic SQL WHERE clause using `conditions.push()`/`conditions.join(' AND ')`. Values remain parameterized ($N) but the WHERE structure is a template literal — the spec 07 C4 grep flags it. Additionally, the C4 grep pattern is overly broad: it catches non-SQL template literals (Zod error messages, logError calls) across six other routes. After fixing `runs/route.ts`, the spec 07 C4 grep also needs narrowing to avoid these false positives.

* **Target Spec:**
  - `docs/specs/00-architecture/07_backend_prod_eval.md` (OP4 check, C4 check)
  - `docs/specs/00-architecture/112_backup_recovery.md` (backup trigger mechanism)

* **Key Files:**
  - `scripts/manifest.json` — P1: add backup_db to permits chain
  - `docs/specs/00-architecture/112_backup_recovery.md` — P1: update trigger docs
  - `src/app/api/admin/pipelines/runs/route.ts` — P2: refactor WHERE construction
  - `docs/specs/00-architecture/07_backend_prod_eval.md` — P2: update C4 grep
  - `src/tests/chain.logic.test.ts` — P1: regression test
  - `.env.example` — P1: document BACKUP_GCS_BUCKET

## Technical Implementation

* **P1 (OP4):** Add `"backup_db"` as the final step of `manifest.chains.permits` in `scripts/manifest.json`. Spec 112 §5 says "no API trigger" and "on-demand or Cloud Scheduler" — this is outdated guidance written before OP4 was added to spec 07. Wiring it to the permits chain ensures a daily run. The script already handles missing `BACKUP_GCS_BUCKET` gracefully (throws before lock acquisition; pipeline.run records `status='failed'`). Update spec 112 §3 to document the permits-chain trigger as primary mechanism.

* **P2 (C4 code fix):** Refactor `runs/route.ts` lines 34-61 to use nullable-parameter pattern instead of `conditions.join()`:
  ```sql
  WHERE ($1::text IS NULL OR pipeline = $1)
    AND ($2::text IS NULL OR status = $2)
  ```
  This makes the WHERE clause static, eliminating the template interpolation.

* **P2 (C4 spec fix):** Update spec 07 C4 grep to only flag `${}` interpolations that appear after SQL structural keywords on the same line:
  ```bash
  grep -rn 'FROM.*\${[^}]\|WHERE.*\${[^}]\|INTO.*\${[^}]\|VALUES.*\${[^}]' \
    src/app/api/ src/lib/db/ --include="*.ts" | grep -v ".test."
  ```
  This eliminates false positives for error message template literals across six routes.

* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — `runs/route.ts` is wrapped by `withApiEnvelope`; no new catch blocks.
* **Unhappy Path Tests:** P1: chain test asserts `backup_db` is last step in permits chain. P2: `runs/route.ts` test asserts null params produce no WHERE clause; filters combine correctly.
* **logError Mandate:** N/A — no catch blocks added.
* **UI Layout:** N/A — backend/pipeline and spec changes only.

## Execution Plan
- [ ] **Rollback Anchor:** `f128180c19d17bc3853a5626aef6af3ff656784a`
- [ ] **State Verification:** `pipeline_runs` has 0 rows for backup_db. C4 grep returns 17+ matches across 6 routes.
- [ ] **Spec Review:** Confirm spec 112 §3/§5 backup trigger intent; confirm spec 07 C4 pass criterion.
- [ ] **Reproduction (P1):** Add failing test to `chain.logic.test.ts` — assert `backup_db` is in `manifest.chains.permits`. Must fail before fix.
- [ ] **Reproduction (P2):** Add failing test asserting `runs/route.ts` uses no `conditions.join` or template WHERE. Must fail before fix.
- [ ] **Red Light:** Run both tests — MUST fail to confirm reproduction.
- [ ] **Fix P1:** Add `"backup_db"` to end of `manifest.chains.permits` in `scripts/manifest.json`. Update spec 112 §3 trigger documentation. Add `BACKUP_GCS_BUCKET` to `.env.example`.
- [ ] **Fix P2 code:** Refactor `runs/route.ts` lines 34-61 to nullable-parameter static WHERE. Keep `Promise.all` structure — only the WHERE construction changes.
- [ ] **Fix P2 spec:** Update spec 07 C4 grep to the SQL-specific pattern. Verify C4 now passes with 0 matches.
- [ ] **Pre-Review Self-Checklist:** 3-5 sibling bugs sharing same root causes.
- [ ] **Independent Review:** Spawn code reviewer agent (`isolation: "worktree"`).
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. Paste final test count + typecheck result. → WF6.
