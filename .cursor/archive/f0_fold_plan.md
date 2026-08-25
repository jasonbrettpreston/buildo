# Active Task: P4-F0 Output-Panel Fold (WF3 batch) + Spec-Truth Batch
**Status:** Planning
**Domain Mode:** Backend/Pipeline (scripts/ + src/lib/db + src/tests) — `scripts/CLAUDE.md` applies. Doc batch is doc-only.
**Workflow:** WF3 (fix batch from the adjudicated P4-F0 output panel, 2026-07-22). Round-2 adjudication done by orchestrator-as-grounder (premises verified against live code/DB; convergence counts noted). Program authority: `.cursor/active_task.md` v2.2 Phase 4 + `.cursor/phase4_plan.md` step 7 (OUTPUT review).

## Context
* **Goal:** Fold the surviving findings from the full 8-reviewer P4-F0 output panel (Guardian, Reality-Check, Integration, Code Reviewer, Observability, Schema-Fidelity, Ground-truth, Gemini/DeepSeek CLIs). The load itself verified SANE/exact — these are tooling/spec hardening, not data fixes.
* **Target Specs:** Spec 112 (`docs/specs/00-architecture/112_backup_recovery.md`), Spec 113 (`.../113_supabase_infrastructure.md`), Spec 48 (audit rows).
* **Key Files:** `scripts/restore-db.js`, `scripts/backup-db.js`, `scripts/validation/supabase-load-gates.js`, `scripts/verify-vercel-env.js`, `src/lib/db/client.ts`, `scripts/analysis/parcel-sanity-audit.js`, `scripts/analysis/parcel-field-dump.js`, tests.

## Adjudication result (Round-2)
**FOLD — code (6 items, 3 commits proposed):**
- **C1 (CRITICAL, 4-reviewer converge: CR+Guardian+DeepSeek+Observability):** truncate-guard probe is blind to `--tables` scope AND fails open. Fix: probe counts the ACTUAL tables being truncated (union `auth.users`+`parcels` retained as belt), and `countTableRowsSafe` fails CLOSED (probe error ⇒ guard trips, override required). Correct the `--skip-truncate` comment+log overclaim (Guardian) in the same edit. + regression tests incl. the loopback-gate lock (Guardian MED-1: no test pins that `--target=local` bypasses the guard).
- **C2 (MED, Integration, live-reproduced):** codify the 13-table auth-linked exclusion — `supabase-load-gates.js` derives excluded tables dynamically from `pg_constraint` FKs into `auth.users` (with log line naming them) so unscoped `--verify-only` vs cloud stops false-FAILing. Test on the pure derivation.
- **C3 (Important, CR):** `client.ts` — treat empty-string `POSTGRES_URL` as absent (`?.trim() || undefined`) + regression test for the `""` edge.
- **C4 (Important, CR + GT-7):** `verify-vercel-env.js` — scope `ADMIN_MFA_ENFORCED` hard-fail to `production` (pattern already exists for DEV_MODE); demote missing-Sentry to WARN on non-prod per Spec 113 §3.2 "SHOULD". Tests updated.
- **C5 (Important ×2, Observability):** `backup-db.js` — (a) retention-prune catch emits a `retention_prune_status` WARN audit row (distinct from healthy-0); (b) manifest upload made non-fatal like prune: try/catch → WARN row, `auditRows` built incrementally so `dest_path`/`backup_size_bytes` always reach the summary once the dump landed.
- **C6 (Tooling, Reality-Check):** `parcel-sanity-audit.js` + `parcel-field-dump.js` CLI entrypoints honor `DATABASE_URL` (via `resolveSslConfig`) instead of hardcoded localhost:5432; add `, id` tiebreaker to the distribution sample picker.

**FOLD — docs (1 commit):**
- **S1 (GT CRITICAL/HIGH):** Spec 112 §4.3 rewrite to the shipped reality: live-source-vs-target gates (not manifest-baseline); runnable usage line (`--mode=fresh`); document all 10 flags incl. truncate guard + `--skip-truncate`; drop the never-built "sanity-audit triple" + `NO-BASELINE` clauses; mark the manifest sidecar "produced for future consumption — no consumer yet".
- **S2 (GT-6, proven live):** Spec 113 §10 — Data API verification = dashboard toggle + KEYED probe (expect no-schema 503/401), replacing the unsound unkeyed-curl method.
- **S3 (GT-8/9):** fix the `run-chain.js:362` citation (real sites :375-383/:506-513) in Spec 112 §6, Spec 115 §2.5, and the uncommitted 07_backend_prod_eval.md edit; manifest.json L90 nit.

**DEFER → review_followups.md ("P4-F0 output panel" section):** DeepSeek backup stream-error handlers (MED robustness); pg_dump child not killed on upload-failure abort (CR low-conf); host-empty conn-string parse; `--verify-only`+`--mode` notice; dotenv-CWD convention note; Gemini quoteIdent robustness (validation-as-quoting is deliberate injection defense — CR confirmed); PGPASSWORD → optional PGPASSFILE hygiene note; DataQualityDashboard hardcoded 'Quarterly' cadence (pre-existing static drift); Spec 112 manifest-consumer build-out (ties to S1 "future consumption").

**REJECT (with reasons, filed in followups):** DeepSeek "isLocalMode TLS false-negative" (false premise — host-based LOOPBACK_HOSTS check, verified `ssl-config.js:64-70`); Gemini PGPASSWORD CRITICAL (premise overstated — `/proc/<pid>/environ` is owner-only; standard libpq mechanism; hygiene note deferred instead); SF "row 1595 arrived via bulk restore" (false — the dump predates the row by 12h; manual copy documented in-session).

## Standards Compliance
* **Try-Catch Boundary:** C5 adds catch blocks → both use `pipeline.log.warn` + WARN audit rows (no swallow). N/A for API routes (none touched).
* **Unhappy Path Tests:** C1 probe-error⇒fail-closed test; C3 empty-string test; C4 non-prod env matrix; C5 prune-fail/manifest-fail audit-row tests.
* **logError Mandate:** scripts use the `pipeline.log` idiom (matches existing convention); client.ts untouched on error paths.
* **UI Layout:** N/A.
* **Database Impact:** NO (code + docs only; C2 reads pg_constraint at runtime).

## Execution Plan
- [ ] Commit 1 (guard): C1 + C2 + tests (restore-db.js, supabase-load-gates.js)
- [ ] Commit 2 (env/client): C3 + C4 + tests (client.ts, verify-vercel-env.js)
- [ ] Commit 3 (observability+tooling): C5 + C6 + tests (backup-db.js, analysis scripts)
- [ ] Commit 4 (docs): S1 + S2 + S3 + review_followups DEFER/REJECT entries
- [ ] Full `npm run test` green per commit (husky)
- [ ] **Round-3 FULL-SCOPE re-verification** (see below) → adjudicate → fold/commit any surviving findings
- [ ] Push after batch + Round-3 close

## Round-3 Full-Scope Re-Verification (USER DIRECTIVE 2026-07-22)
> Because these changes are significant, re-run **Ground-truth, Integration, Reality-Check** AFTER the fold lands — each with the **same document/DB scope as its Round-1 run**, NOT a narrow view of the diff. Purpose: confirm the changes actually landed AND that nothing regressed elsewhere in their original scope.
- **Ground-truth (re-run, full scope):** re-derive Spec 112 (ENTIRE spec, not just §4.3) + Spec 113 (entire, incl. §3.2/§10) + the Spec 115/48 citation sites vs the post-fold live code. Verdict per section: TRUE / DRIFT. Must confirm S1/S2/S3 amendments are now truthful AND find any drift the rewrite introduced.
- **Integration (re-run, full scope):** verify the post-fold state against the REAL codebase + live DBs, same terrain as Round 1: restore-db guard behavior (scoped probe + fail-closed) exercised for real (loopback + `--tables` subset dry paths), gates' dynamic auth-exclusion derived live vs cloud — the previously-reproduced unscoped `--verify-only` false-FAIL must now PASS, verify-vercel-env env matrix, backup-db audit-row shape, cron=3/seed=5 state untouched.
- **Reality-Check (re-run, full scope):** re-run `parcel-sanity-audit.js` + `parcel-field-dump.js` — now via the C6 `DATABASE_URL` fix — **pointed at CLOUD**, proving the tools genuinely grade the cloud DB (closing RC's own Round-1 blind-spot finding) and that cloud values remain SANE; plus local for parity.
- All three spawn per Spec 08 §10 templates; Integration + Reality-Check in MAIN tree (live DB/uncommitted view), Ground-truth per its standard substrate. Round-3 adjudication by orchestrator-as-grounder; new findings → fold or file per WF cadence.
