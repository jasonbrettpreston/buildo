# Active Task: Cloud cron activation end-game (WF3 batch — operator-authorized)
**Status:** Implementation (operator authorized 2026-07-29: "let's knock these off - go for it"; chain-coa-permits dispatch explicitly delegated to orchestrator). Kept separate from `.cursor/active_task.md` (the standing migration program plan) — this batch is its Phase 4.3 tail.

## Context
* **Goal:** Unblock and complete pipeline cron activation on the cloud DB; green the red CI jobs.
* **Target Spec:** `docs/specs/00-architecture/115_scheduling.md` §2–§4 + `docs/specs/00-architecture/113_supabase_infrastructure.md` §3 (D14), §4
* **Domain Mode:** Backend/Pipeline
* **Key Files:** `migrations/203_parcels_cur_gfa_band.sql`, `scripts/lib/pipeline.js`, `scripts/migrate.js`, `src/tests/pipeline-sdk.logic.test.ts`, `.github/workflows/mobile-ci.yml`

## Findings driving the work (verified live 2026-07-29)
1. **db-tests red on main** = `migrations/203_parcels_cur_gfa_band.sql` never committed (untracked; CI applies 202→204, committed code references the 4 cur_gfa cols). Cloud + local DBs already have it applied; `migrate.js --verify` vs cloud WITH the file present: **232 files, 0 missing, 0 drift**.
2. **Spec-vs-code gap (D14):** Spec 113 §3 lists `pipeline.js` + `migrate.js` as readers of `SUPABASE_DATABASE_URL`; neither reads it. Chain workflows set ONLY that var → `migrate.js --verify` pre-flight + `run-chain.js` (`createPool()` PG_*-only) would target localhost on the GH runner → every chain run, incl. the awaited manual dispatch test, fails. Never exercised (0 workflow runs ever).
3. **mobile-ci red** = eas-update job shell-injects `github.event.head_commit.message` into `eas update --message` (backticks/newlines explode bash; unit-tests job is GREEN on main). `EXPO_TOKEN` repo secret appears unset — OPERATOR item.
4. **Mutation weekly red** = real test gap: `4442fb75` cost-model archetype ladder survivors (67.80 < 75 break). Queued as separate WF3 (test authoring; do NOT lower threshold).

## Technical Implementation
* **Database Impact:** NO schema change (mig 203 file-add only — already applied + checksum-recorded in both DBs; commit aligns CI checkout with reality).
* **Fix B (D14 conformance):** `createPool()` — when `PG_HOST` unset and `SUPABASE_DATABASE_URL` set, use connectionString + `resolveSslConfig({connectionString})`. PG_* keeps precedence so local dev (whose `.env` sets both) can never silently target cloud. `migrate.js` — `DATABASE_URL || SUPABASE_DATABASE_URL`.
* **Fix C (mobile-ci):** commit message via `env:` indirection (first line only) + add `workflow_dispatch: {}`.

## Standards Compliance
* **Try-Catch Boundary:** N/A (no new/modified API routes). **Unhappy Path Tests:** createPool precedence tests (PG_HOST wins over SUPABASE_DATABASE_URL; fallback engages when PG_HOST unset; loopback URL → no ssl). **logError Mandate:** N/A (no new catch blocks). **UI Layout:** N/A.

## Execution Plan
- [x] Verify premises live (3-agent sweep + inline code/spec reads + cloud `--verify` dry-run)
- [x] Commit 1 `39d6595d`: mig 203 → pushed → **db-tests GREEN on main** (2 consecutive green runs)
- [x] Commit 2 `e5a6ba42`: SUPABASE_DATABASE_URL fallback + stripSslParams + 3 tests (review PASS-WITH-NOTES, both notes folded)
- [x] Commit 3 `1da4628e`: mobile-ci eas-update env-indirection + workflow_dispatch (EXPO_TOKEN = operator item)
- [x] Dispatch #1 (run 30461153481) — FAILED, two NEW defects found + verified:
  - 28 false DRIFTs: CRLF-worktree checksums vs LF runner checkout → migrate.js sha256 now CRLF→LF-normalized; `scripts/analysis/reconcile-migration-checksums.js` APPLIED to cloud + local (28 rows each, 0 unexpected); verify green in CI-sim + local
  - link_wsib killed at ~120s: cloud session statement_timeout=2min (cluster default; role has none). Supavisor session pooler DROPS startup `options` AND `statement_timeout` params (tested live) → createPool wraps pool.connect with a once-per-client awaited `SET statement_timeout` (default 0 = historical local semantics; PIPELINE_STATEMENT_TIMEOUT_MS override). Verified live: 0 on cloud pool.query/pool.connect + local. NOTE: permits chain DID run 6 steps green on the runner (D14 fix works); the workflow's `if: always()` on permits lets it run despite pre-flight failure — possible follow-up hardening.
- [x] Commit 4 `fa9e984c`: drift normalization + reconcile script + statement_timeout connect-wrapper + 5 tests
- [x] WF3 mutation triage `ce23c99f`: cost-model 63.10→84.07, aggregate 67.80→**85.69** (33 boundary tests; weekly mutation red resolved)
- [x] Dispatch #2 (run 30464478479): pre-flight GREEN, coa chain GREEN incl. verdict, permits ran ALL 33 steps (link_wsib 168s — would have died at 120s pre-fix). Run conclusion "failure" = ONLY the two accepted-baseline verdict gates (coa estimated_cost cov 61.2% vs ≥90; permits opportunity_score 79.9 vs ≥80) — verbatim the operator-accepted Phase 0.6 baseline pair. Machinery proven end-to-end.
- [x] **MERGED `f7993025` — all 5 cron schedules LIVE on main** (coa-permits nightly 11:00 UTC, entities daily, sources weekly, deep-scrapes weekdays×3, watchdog daily); verified active in origin/main workflow files
- [x] Lessons routed (tasks/lessons.md 2026-07-29) + followups register (review_followups.md) — final docs commit
- OPERATOR ITEMS: ① `EXPO_TOKEN` repo secret unset (eas-update auth) ② nightly runs conclude RED until the 2 baseline gates green (Spec 80 Phase 4) — alerting-noise ruling needed
