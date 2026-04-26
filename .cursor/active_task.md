# Active Task: WF3 — Spec 07 Relevance Scoping + V11 API Readiness + O4/SC1/M3 Fixes
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `87af0776fc4e5dc4e1d5c8cadf31636e654d3fdc`

## Context
* **Goal:** Fix 4 bugs surfaced by the 2026-04-25 WF5 prod backend run and extend the evaluation spec with a new V11 vector:
  - **B1 (Spec relevance):** Checks R1/R2/R4/O1/O2/SC2/T4/M3 in `07_backend_prod_eval.md` include tooling/CLI scripts (`deepseek-review`, `diff-narrator`, `extract-stryker-survivors`, `gemini-review`, `local-cron`, `migrate`, `run-chain`, `validate-migration`) that are explicitly exempt from pipeline SDK protocol. Their `process.exit()` calls and absence of `pipeline.run`/`emitSummary`/`emitMeta` are design-correct — penalising them inflates FAIL counts unfairly.
  - **B2 (M3):** `reclassify-all.js` is on disk and operational but absent from `scripts/manifest.json` scripts registry.
  - **B3 (SC1):** 5 test helper files missing `// SPEC LINK:` header: `factories.ts`, `fixtures/sample-permits.ts`, `market-metrics.logic.test.ts`, `scope.logic.test.ts`, `setup.ts`.
  - **B4 (O4):** Two empty catch blocks in `src/app/api/admin/pipelines/[slug]/route.ts` (lines 255, 265) swallow malformed JSON with only a comment — no log emission, making silent parse failures invisible in observability.
  - **Enhancement (V11):** Add "API Frontend Readiness" vector to spec 07 to assess Expo-consumed routes (`src/app/api/leads/`) for contract safety, input validation, and auth boundary compliance.

* **Target Spec:** `docs/specs/00-architecture/07_backend_prod_eval.md`
* **Key Files:**
  - `docs/specs/00-architecture/07_backend_prod_eval.md` — primary: add exclusions + V11 + recompute scores
  - `src/app/api/admin/pipelines/[slug]/route.ts` — B4: add logWarn at lines 255, 265
  - `src/tests/factories.ts` — B3: add SPEC LINK header
  - `src/tests/fixtures/sample-permits.ts` — B3: add SPEC LINK header
  - `src/tests/market-metrics.logic.test.ts` — B3: add SPEC LINK header
  - `src/tests/scope.logic.test.ts` — B3: add SPEC LINK header
  - `src/tests/setup.ts` — B3: add SPEC LINK header
  - `scripts/manifest.json` — B2: add `reclassify_all` entry
  - `src/app/api/leads/feed/route.ts`, `flight-board/route.ts`, `search/route.ts`, `view/route.ts` — V11 evidence gather (read-only)

## Technical Implementation
* **New/Modified Components:** N/A — backend-only
* **Data Hooks/Libs:** N/A
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** B4 fix adds `log.warn(...)` inside two existing catch blocks; no new try-catch added.
* **Unhappy Path Tests:** N/A — spec doc + config changes; existing test suite confirms no regressions.
* **logError Mandate:** B4 uses `log.warn` (not logError) because malformed JSON in stdout is non-fatal and does not involve an external error — appropriate severity. All other catch blocks in the file already use `logError`.
* **UI Layout:** N/A — backend-only.

## Execution Plan

- [ ] **Rollback Anchor:** `87af0776fc4e5dc4e1d5c8cadf31636e654d3fdc`

- [ ] **State Verification:**
  - B1: R1/R2/R4/O1/O2 grep commands lack exclusions for tooling scripts — confirmed by WF5 evidence (deepseek-review, diff-narrator, extract-stryker-survivors, gemini-review, local-cron, migrate all appear in FAIL output).
  - B2: `node -e "require('./scripts/manifest.json').scripts['reclassify_all']"` → `undefined`. File `scripts/reclassify-all.js` exists on disk.
  - B3: `grep -rL "SPEC LINK\|spec link" src/tests/ --include="*.ts"` → 5 files listed.
  - B4: `[slug]/route.ts` lines 255, 265 have `catch { /* malformed summary/meta — ignore */ }` with no logging.

- [ ] **Spec Review:** `docs/specs/00-architecture/07_backend_prod_eval.md` (spec under fix) + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (pipeline SDK protocol — confirms tooling scripts are not governed by §R1-R12) + `docs/specs/01-pipeline/30_pipeline_architecture.md` §2.1 (Observer archetype list confirms which scripts are mainline vs. tooling).

- [ ] **Reproduction (static — no new vitest test required):**
  - B1: Run WF5 SC2 command → `grep -rn "process\.exit" scripts/*.js | grep -v "lib/"` → 24 matches, all in tooling scripts.
  - B2: `node -e "require('./scripts/manifest.json').scripts['reclassify_all']"` → `undefined`.
  - B3: `grep -rL "SPEC LINK\|spec link" src/tests/ --include="*.ts"` → 5 files.
  - B4: Read `[slug]/route.ts` lines 249-266 — empty catch bodies confirmed.
  - V11: `find src/app/api/leads -name "route.ts"` → 4 routes; run each FR check to gather evidence.

- [ ] **Red Light:** All reproduction commands produce non-empty output (confirming bugs exist). `npm run test` passes 4485 — no regressions from prior session.

- [ ] **Fix (6 items, in order):**

  **Fix 1 — B4: logWarn in two empty catch blocks** (`[slug]/route.ts` lines 255, 265)
  Replace both empty-body catches. Use the pipeline SDK `log.warn` (already imported in this file) or `logWarn` from logger — check which is available at top of file and use consistently.

  **Fix 2 — B3: SPEC LINK headers** (5 test helper files)
  Add `// SPEC LINK: <path>` as the first comment in each file:
  - `factories.ts` → `docs/specs/00-architecture/01_database_schema.md`
  - `fixtures/sample-permits.ts` → `docs/specs/01-pipeline/50_source_permits.md`
  - `market-metrics.logic.test.ts` → `docs/specs/02-web-admin/26_admin_dashboard.md`
  - `scope.logic.test.ts` → `docs/specs/00-architecture/01_database_schema.md`
  - `setup.ts` → `docs/specs/00_engineering_standards.md`

  **Fix 3 — B2: Add reclassify-all to manifest.json**
  Add slug `reclassify_all` to the `scripts` object in `scripts/manifest.json` with fields: `file: "scripts/reclassify-all.js"`, `telemetry_tables: ["permits", "permit_trades"]`, `supports_full: false`, `deprecated: false`.

  **Fix 4 — B1: Update spec 07 relevance exclusions (8 check commands)**
  For each of R1, R2, R4, O1, O2: append `| grep -v "deepseek-review\|diff-narrator\|extract-stryker-survivors\|gemini-review\|local-cron\|migrate"` to the grep pipeline. Add a **Note:** "Exclusion list = tooling/CLI scripts not governed by pipeline SDK protocol §R1-R12."
  For SC2: update command to also exclude `run-chain`, `validate-migration`, `seed-` files. Add Note.
  For T4: update pass criteria note to allow `diff-narrator.logic.test.ts` skips (pre-existing tooling). Append `| grep -v "diff-narrator"` to command.
  For M3: update ls command to also filter `deepseek-review|diff-narrator|extract-stryker-survivors|gemini-review|local-cron|migrate`. Add Note.

  **Fix 5 — V11: Add API Frontend Readiness vector** (new section in spec 07, after V10)
  4 checks against `src/app/api/leads/` routes (feed, flight-board, search, view):
  - **FR1:** All 4 routes use `withApiEnvelope` — `find src/app/api/leads -name "route.ts" | xargs grep -L "withApiEnvelope"` — Pass: 0 files.
  - **FR2:** All 4 routes validate inputs with Zod — `find src/app/api/leads -name "route.ts" | xargs grep -L "z\.\|ZodObject\|zod"` — Pass: 0 files.
  - **FR3:** No unexpected env vars in leads routes — `grep -rn "process\.env\." src/app/api/leads/ | grep -v "DATABASE_URL\|NODE_ENV\|CKAN\|API_KEY\|SERPER\|GOOGLE"` — Pass: 0 matches (no secrets beyond known service vars).
  - **FR4:** Leads routes are correctly classified as non-admin in route-guard — `grep -n "leads" src/lib/auth/route-guard.ts` — Pass: routes are present and not marked as admin-only (Expo app uses user auth, not admin key).
  Walk each check, record Evidence + PASS/FAIL, compute V11 score using same `floor(PASS/4 × 3)` formula.

  **Fix 6 — Recompute and record corrected scoring in spec 07**
  Update the Scoring Summary table with post-fix scores. Add a new comparison table row for 2026-04-25 corrected and 2026-04-26 post-fix (with V11). Bump spec version to V1.1 — 2026-04-26. Update total checks count from 46 to 50 (46 + 4 for V11).

- [ ] **Pre-Review Self-Checklist (3-5 sibling bugs):**
  1. **S1 (Scalability)** — does the `pool.query` large-result check accidentally include tooling scripts? Verify S1 grep scope remains correct after edits.
  2. **T5 (Testing)** — now that reclassify-all is in the manifest, does it have a guardrail test? Verify chain.logic.test.ts or pipeline-sdk.logic.test.ts covers it, or flag as DEFER.
  3. **O4 siblings** — are there other empty catch blocks in `src/app/api/`? Run `grep -rn "catch\s*{[^}]*}" src/app/api/ --include="*.ts"` and verify no other bare swallows.
  4. **SC1 scope** — `mobile/__tests__/` files: do they need SPEC LINK too? Confirm whether SC1 grep covers mobile test dir, and scope appropriately.
  5. **FR1 coverage** — if a new `src/app/api/leads/[permitNum]/route.ts` is added later, V11 FR1-FR4 self-includes via `find src/app/api/leads`. Confirm no routes exist outside the `leads/` tree that the Expo app currently hits.

- [ ] **Independent Review:** Spawn `feature-dev:code-reviewer` (`isolation: "worktree"`). Inputs: spec path `docs/specs/00-architecture/07_backend_prod_eval.md`, modified files list above, one-sentence summary: "WF3 — fix spec 07 relevance scoping (8 check updates), add V11 API frontend readiness vector (4 checks), fix O4 empty-catch logWarn, SC1 SPEC LINK headers, M3 manifest entry." Agent generates its own checklist from the spec. BUG items → fix before Green Light. DEFER → `docs/reports/review_followups.md`.

- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. Paste final test summary line and typecheck result. Both must show 0 failures. List each prior step as DONE or N/A. → WF6.
