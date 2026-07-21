# Active Task: Supabase Migration — Phase 4 (Cloud Data + Vercel Deploy + Cron Activation)
**Status:** Planning — WF1 sub-phase plan-lock for `.cursor/active_task.md` Phase 4 (steps 4.0–4.4). AWAITING PLAN LOCKED.
**Domain Mode:** Cross-Domain (data plane `scripts/`+`migrations/`; Vercel deploy of `src/app`/`src/lib`; auth spans admin web). `scripts/CLAUDE.md` read; `.claude/domain-crossdomain.md` applies at implementation.
**Workflow:** WF1 sub-phase plan-lock. Program authority: `.cursor/active_task.md` v2.2 Phase 4 (4.0–4.4) + binds D9/D13/G7/G10. Governing specs: Spec 113 §3/§4/§5/§8/§9/§12, Spec 112 §4.3/§5/§6, Spec 115 §3.
**Abort (program):** Vercel rollback to previous deployment; cloud data load is re-runnable (truncate-first, idempotent); DNS (`maxbld.ca`) unattached until smoke passes.

> **WRITE-ONLY plan.** No git ops, no DB writes, `scripts/migrate.js` NEVER run by the planner. Every cloud-touching command below is authored FOR THE ORCHESTRATOR to run personally.

> **Fold state:** the adjudicated 5-reviewer panel (2026-07-21) is applied below — see the **## Panel Adjudication** appendix for per-item disposition. Confirmed-good items are baked in (hedges dropped); OD-B and OD-E are resolved and removed.

---

## ⛳ FINAL OPERATOR BALLOT (human rulings required before / during Phase 4)
These are the decisions that need a human — the planner does not decide them. Everything else below is settled.

1. **OD-A — connection-string gap (blocks first deploy).** Adopt the `src/lib/db/client.ts` alias `process.env.POSTGRES_URL ?? process.env.DATABASE_URL` (recommended — the integration injects `POSTGRES_URL`, not `DATABASE_URL`; `client.ts:41` reads `DATABASE_URL`), **OR** set a manual Vercel `DATABASE_URL` env = the 6543 transaction-pooler URL. (P4-G7; Spec 113 §3 amended this fold.)
2. **Session-pooler URL pin (fold #14).** Pin `SUPABASE_DATABASE_URL` to the **session-pooler `:5432` form**, NOT the IPv6-only direct host `db.<ref>.supabase.co` (which intermittently `ENOENT`'d live). Applies to the `DATABASE_URL=` override for `migrate.js`, to `restore-db.js`'s `--target=cloud`, AND to the `SUPABASE_DATABASE_URL` GitHub secret. Confirm the operator box's IPv6 egress before choosing direct.
3. **DECODO proxy GH-secret names (fold #9).** Confirm the GitHub secrets the operator added are named `DECODO_PROXY_HOST` / `DECODO_PROXY_PORT` / `DECODO_PROXY_USER` / `DECODO_PROXY_PASS` — the workflows read `secrets.DECODO_PROXY_*` (verified in `chain-deep-scrapes.yml:179-182`), **not** `PROXY_*`. Empty/mis-named = the scraper routes via the runner's datacenter IP, defeating WAF-invisibility.
4. **CI root-credential blast radius + PITR-off re-confirm (fold #10).** Re-confirm the Spec 113 §8.2-option-3 risk acceptance now that F0 loads **real production data**: the `SUPABASE_DATABASE_URL` GitHub secret is the `rolbypassrls` `postgres` role — a poisoned workflow dependency = total prod compromise **plus** backup tampering, with **PITR OFF (D9)** meaning no continuous-recovery fallback. Gemini's standing PITR-off CRITICAL objection is surfaced alongside this; both go to the operator, neither is decided here.
5. **Cloud signup posture (fold #8).** Set `disable_signup=true` on the cloud project until launch (OR provision the admin email before ANY public exposure) to prevent admin-email squatting and shrink pre-launch surface.
6. **OD-D — migration-branch → `main` merge timing.** Merging to `main` is required before 4.3 cron `workflow_dispatch`/`schedule` (P4-G9) AND it **arms the 3 pg_cron jobs' code path on `main`** — the operator picks when.
7. **OD-C — `PG_POOL_MAX` Vercel value.** Recommend **1–2** at launch, tune at 4.4. (P4-G7)
8. **OD-F — `.vercelignore` scope beyond `docs/`.** Recommend +`mobile/`, +`.cursor/`.

_Resolved & removed this fold:_ **OD-B** (G10 gate-(f) re-pin — empirically moot, zero drift confirmed; see CG1), **OD-E** (transfer size — measured/estimated, see CG2). **PITR** posture is not re-opened as a standalone item; it rides ballot #4.

---

## Confirmed-good (baked in this fold — hedges dropped)

**CG1 — G10 zero-drift (drops the OD-B / P4-D1 re-pin step entirely).** The grounder live-verified all 4 baseline tables + the invalid-geom id-sets + the sequences EXACTLY match the 2026-07-18 constants — **zero drift**. Therefore gate **(f) `g10_baseline` passes as-is** against the hardcoded constants; **no re-pin, no constant edit, no commit in F0.** Gate **(d) matview self-baselines** against the live SOURCE defining query by design (`supabase-load-gates.js:465-474`: source snapshot 4,190 vs live 4,239 = **+49**, target refreshed post-load matches LIVE) — this +49 is expected and documented, not a failure. The earlier "re-pin gate-(f)" ruling is empirically moot and struck.

**CG2 — transfer size (resolves OD-E).** Data-only custom-format dump ≈ **1.5–1.8 GB**; expected window ≈ **4–21 min upload + ~10–20 min dump CPU + cloud restore/index rebuild**. Baked into F0 as the expected duration. A one-line pre-flight size check is kept as **confirmation, not a blocker**: `pg_dump --format=custom --data-only "$PG_SOURCE" | wc -c` (or measure `pg_database_size` on `:54322`).

**CG3 — restore-db combined mode is the CODE's documented shape (DeepSeek objection REFUTED).** `restore-db.js:18-30` documents mode 1 = **combined dump+restore, no `--dump`, `PG_*` source → TARGET** as "the Phase 0.5/4.0 data-load shape." F0's invocation is correct as written. **Drift note (spec fix deferred):** Spec 112 §4.3's Usage line (`--dump=<path-or-uri>`) and its manifest-baseline model are **STALE** vs the shipped combined-mode + live-source-gating code (gates compare live SOURCE vs live TARGET, not a `.manifest.json` sidecar, for the migration load). Flagged here; the Spec 112 §4.3 amendment is out of scope for this fold and deferred to the Spec 112 backup-tooling follow-up.

---

## Orchestrator-established current state (2026-07-21 — cited as given, not re-derived)
- **Local Supabase** (`DATABASE_URL` → `127.0.0.1:54322`) = authoritative dev DB, **migrations through 235**, FULL data (G10-scale, 486K parcels), 3 pg_cron jobs live. This is the Phase 4.0 data SOURCE.
- **Cloud** `gcnatfpacuhsytcbaszi`: schema at **migration 225 (STALE)** — 226–235 never applied; auth-internal FKs only; `pipeline_schedules` 27 pre-seed rows; `cron.job` EMPTY; no app data beyond schema+seeds (~1.2 MB); PG17.6; Vault 0.3.1; `extensions` schema present.
- CA cert committed (`scripts/certs/supabase-ca.pem` — **P4-G9 verified**), live `verify-full` to cloud PASSED. **B2 backup-db creds EXIST and `backup-db.js` ran live end-to-end vs cloud** (⇒ fold #4: the real-scale backup is a HARD F0 gate, not deferrable). `pg_dump` client v18.2 on PATH (≥ PG17, satisfies Spec 112 §5 / restore-db `MIN_CLIENT_MAJOR=17`).
- Vercel: account + `maxbld.ca` purchased + native Vercel↔Supabase integration installed (linked EXISTING project, NOT marketplace-provisioned) + GitHub connected. **NO deploys** — repo-side `vercel.json` `ignoreCommand:"exit 0"` blocks every build (**P4-G6 verified**).
- GH repo secrets NOT yet added (operator will add `SUPABASE_DATABASE_URL`, `BACKUP_S3_*`×4, **`DECODO_PROXY_*`×4** — fold #9, NOT `PROXY_*`). Cron `schedule:` blocks committed COMMENTED OUT (**P4-G9 verified**).
- Phase 2 (mobile) remaining items HUMAN-gated → **4.2 EAS build DEPENDS on Phase 2 closure; 4.0/4.1 do NOT.**

---

## Ground truth (scout-verified this session; reviewers audit AGAINST this)

**P4-G1 — `migrate.js` reads `process.env.DATABASE_URL`** (`scripts/migrate.js:88`), never a `SUPABASE_*` var. Cloud catch-up therefore runs migrate.js **with an explicit `DATABASE_URL=<cloud>` override**. Per Spec 113 §5 the override MUST be the **direct (5432 IPv6) or session-pooler (5432) form, NEVER 6543** (migrate.js uses transactions + `schema_migrations` session state). Ballot #2 pins this to the session-pooler `:5432` form (IPv6-direct `ENOENT`'d live). `resolveSslConfig({connectionString})` (L91) requires `SUPABASE_CA_CERT_PATH` for a non-loopback host or it throws. `--verify` is checksum-only, mutates nothing (L133-152); logic-var seed reapply runs on a real (non-verify/dry) run (L256-259, `ON CONFLICT DO NOTHING` — operator-tuned values preserved).

**P4-G2 — enumeration of 226→235 on the EMPTY-auth cloud** (each is idempotent / re-runnable; migrate.js applies forward-only by checksum):
- **226 profiles bootstrap** (`226_profiles_admin_bootstrap.sql`): plain DDL — creates `profiles` (uuid PK → `auth.users` ON DELETE CASCADE), `handle_new_user` trigger, RLS Class C, `prevent_is_admin_self_escalation` trigger. **CORRECTS the program-plan premise "226 seeds by email match":** 226 seeds NO admin. The bootstrap was REDESIGNED into the separate `scripts/bootstrap-first-admin.js` (L14-20 header; ADR-007) to close an email-squatting race — so on a zero-user cloud 226 is a no-op-safe table create, needs no NOTICE-skip, and leaves cloud admin-less until the P4-F1 bootstrap step (P4-G8) runs.
- **227 RLS Class-B default-deny · 228 `entitlements` · 230 RLS Class-A entitlements · 231 admin backup codes:** DDL / policy on empty tables — trivial.
- **229 uid→uuid FK conversion** (10-table D6 inventory): all 10 tables **0 rows on cloud** → conversion is a pure type/constraint change, no data rewrite, no HALT risk (already replayed locally through 235).
- **232 pg_cron/pg_net schema-determinism:** asserts live layout + adds `SCHEMA extensions` to the pg_net `CREATE EXTENSION` **guarded on `extensions` schema existing** — cloud HAS it. (pg_cron/pg_net themselves were enabled by mig 224, already on cloud at ≤225.)
- **233 pg_cron maintenance catalog** (`233_...:74-111`): guarded `IF NOT EXISTS (pg_extension pg_cron) → RAISE NOTICE; RETURN`. **Cloud HAS pg_cron** → schedules 3 jobs (`mv_monthly_permit_stats_refresh` 14:30, `lead_views_retention_purge` 09:00, `offboarding_sweep_30day` 10:00 UTC), idempotent unschedule-then-schedule (job names at `233_...:84`). **⚠ These 3 jobs go LIVE on cloud the instant 233 applies** (NOT gated to 4.3 like the GH-Actions chains). All no-op on fresh/zero-user data, BUT `mv_monthly_permit_stats_refresh` at **14:30 UTC** can `ACCESS EXCLUSIVE`-lock-conflict with a concurrent restore → **fold #5: unschedule the 3 jobs BEFORE the data load, re-schedule AFTER (F0 steps 2b/4b).**
- **234 vault write-RPC** (`234_...:60-116`): guarded on `vault` schema (cloud has Vault 0.3.1) → creates `public.vault_upsert_secret`, REVOKE from PUBLIC/anon/authenticated, GRANT service_role. `SET LOCAL log_statement='none'` was **live-verified against this cloud project** (mig header L25-38).
- **235 offboarding sweep hardening.**
- **Availability check (cite for the orchestrator to run before 4.0):** `psql "$DATABASE_URL_CLOUD" -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_cron','pg_net'); SELECT name FROM pg_available_extensions WHERE name IN ('pg_cron','pg_net');"` — expect both installed (pg_cron in `cron`, pg_net in `net`/`extensions`).

**P4-G3 — `restore-db.js --target=cloud` is fully supported.** `validateArgs` accepts `cloud` (L135); TLS on a non-loopback target sets `PGSSLMODE=verify-full`+`PGSSLROOTCERT=$SUPABASE_CA_CERT_PATH` and THROWS if the CA path is unset (L530-537); `--mode=fresh` REQUIRED and the only mode implemented (L139-152). Mode 1 (no `--dump`) = combined dump+restore, the documented Phase-4.0 shape (restore-db.js:18-30, CG3). TARGET conn = `SUPABASE_DATABASE_URL` (gates `resolveTargetConnectionString`, L383-385). Truncate precondition: **TRUNCATE runs BEFORE pg_restore, OUTSIDE the `--single-transaction` scope** (header L47-59) — a mid-run infra failure leaves the target truncated, not rolled back; **cloud is empty/derived pre-launch so the truncate is a no-op-safe reset** and the operator safety-dump caveat (header L57-59) does not bite. Resume = re-run (idempotent). Client-version guard passes (v18.2 ≥ 17). **Fold #3 hardening — see F0 step 0.** 

**P4-G4 — restore-db/gates SOURCE defaults to the DECOMMISSIONED Docker DB.** `resolveSourcePool()` (gates L363-373) and restore-db's dump source (L465-470) read `PG_*`, **defaulting to `localhost:5432/buildo` = the old Docker dev DB (D13 cold-spare, may be down/stale)**. Post-cutover the authoritative source is **local Supabase `:54322`**. → **The orchestrator MUST set `PG_HOST=127.0.0.1 PG_PORT=54322 PG_USER=postgres PG_PASSWORD=postgres PG_DATABASE=postgres` for every 4.0 restore/gate command.** `127.0.0.1` is loopback → `isLocalMode({host})` passes (restore-db L476, gates L371 no-TLS source), satisfying the "loopback SOURCE only" guard (restore-db L476-478). Omitting this override silently dumps stale/absent Docker data — **the single highest-risk execution error in Phase 4.0.**

**P4-G5 — G10 gate baseline mechanics** (`scripts/validation/supabase-load-gates.js runAllGates`): gates **(a) row_count, (b) invalid-geom id-set, (c) sequence last_value, (d) matview (live defining-query count), (g) ravine epsilon** all compare **LIVE source vs LIVE target at gate-run time** (L412-413, 505, 528-529) → self-baselining against the local-Supabase source-of-truth. Gate **(f) `g10_baseline` compares TARGET vs HARDCODED constants** (`G10_ROW_COUNT_BASELINE` L54-59: permits 254082 / parcels 486530 / coa 33400 / footprints 427077, 2026-07-18 snapshot). **CG1 (this fold): the grounder live-verified ZERO drift from those constants — gate (f) passes as-is; NO re-pin.** Verdict rollup excludes INFO/SKIP (L548); postgis-version delta is INFO, never fails.

**P4-G6 — `vercel.json` = `{"ignoreCommand":"exit 0"}`** (L2, sole key) skips every Vercel build. **`.vercelignore` does NOT exist** (glob confirmed). Both are 4.1 work.

**P4-G7 — `DATABASE_URL` vs Vercel-injected `POSTGRES_URL` naming gap.** `src/lib/db/client.ts:41` reads `process.env.DATABASE_URL`; nothing in-repo reads `POSTGRES_URL` (grep). The native integration injects `POSTGRES_URL` (pooled **6543**) + `POSTGRES_URL_NON_POOLING` (direct **5432**) + `SUPABASE_URL` + keys — **not `DATABASE_URL`**. Left unresolved, the deployed app's raw-pg pool has no connection string. Pinned pool max IS wired: `client.ts:31` reads `PG_POOL_MAX` (default 20) → set a low Vercel env value (D3/G7 Fluid-Compute). → **Ballot #1 (OD-A).** Spec 113 §3 Vercel row **amended this fold** to name `POSTGRES_URL`/`POSTGRES_URL_NON_POOLING` (fold #1).

**P4-G8 — cloud auth is user-less post-4.0; `scripts/bootstrap-first-admin.js` provisions it.** Script exists; refuses a non-local `SUPABASE_URL` unless `BOOTSTRAP_ALLOW_REMOTE=1` (L104). Its "LOCAL-ONLY" header (L53-60) is a Phase-1 scoping note; **Phase 4 is where cloud provisioning legitimately happens** via the sanctioned `BOOTSTRAP_ALLOW_REMOTE=1` escape. Flow: `createUser` (service-role Admin API) → mig-226 `handle_new_user` trigger auto-creates the `profiles` row → `UPDATE profiles SET is_admin=true WHERE id=<returned uuid>` (by id, never email) → `generateLink({type:'recovery'})` prints an `action_link` (does **NOT** send email — L224-235; deliver out-of-band; single-use admin bearer — fold #12). Requires mig 226 present on cloud (true after 4.0). Non-idempotent by design (re-run fails at `createUser`; recovery SQL documented in F1f).

**P4-G9 — the 5 workflow files exist, inert.** `.github/workflows/chain-{coa-permits,sources,entities,deep-scrapes}.yml` + `pipeline-watchdog.yml`, each with `schedule:` COMMENTED OUT + `workflow_dispatch:{}` active (grep verified). `chain-deep-scrapes.yml` has an `env_guard` step (L105-131) reading `secrets.SUPABASE_DATABASE_URL` and proxy env `PROXY_HOST/PORT/USER/PASS` ← `secrets.DECODO_PROXY_*` (L179-182). CA committed at `scripts/certs/supabase-ca.pem`. Per P3-G9: `schedule:` fires **only from the default branch (`main`)**, and `workflow_dispatch` requires the workflow to exist on `main` too → **4.3 cron activation/testing requires the migration branch merged to `main` first** (ballot #6 / OD-D).

**P4-G10 — the Vercel env-verification script is NET-NEW** (no `verify-vercel-env` exists — grep). Designed in P4-F1c below.

---

## Key Decisions (this plan)

**P4-D1 — STRUCK (CG1).** The prior gate-(f) re-pin decision is empirically moot: zero drift confirmed, gate (f) passes against the pinned constants unchanged. Gate **(a)** live-source-vs-live-target remains authoritative; a gate-(a) FAIL is always a real load failure and HALTs. There is no F0 constant edit.

**P4-D2 (pg_cron live-at-4.0 acceptance).** The 3 pg_cron maintenance jobs (mig 233) activate on cloud when 233 applies — accepted (P4-G2: all no-op on fresh/zero-user data; non-must-succeed by Spec 113 §8.4). **Fold #5 refinement:** they are *unscheduled* across the data-load window (lock-conflict avoidance) and *re-scheduled* after. Post-load verification: `cron.job` populated with exactly 3 rows.

**P4-D3 (cloud DB connection form).** The `DATABASE_URL`-override for migrate.js AND the `SUPABASE_DATABASE_URL` for restore-db must be a **5432 session-pooler or direct form** (Spec 113 §5; 6543 banned for both). **Pinned to the session-pooler `:5432` form** (ballot #2 — IPv6-only direct `ENOENT`'d live). Same value as `.env`'s `SUPABASE_DATABASE_URL` (B2 backup proofs); for migrate.js pass it as `DATABASE_URL=$SUPABASE_DATABASE_URL`.

---

## Execution Plan

### P4-F0 (= program 4.0) — Cloud schema catch-up + production data load
**Owner: ORCHESTRATOR runs every command personally.** Pre-req: `SUPABASE_CA_CERT_PATH` set, `.env` `SUPABASE_DATABASE_URL` present (session-pooler `:5432` form, P4-D3/ballot #2), local Supabase `:54322` up with full data. **Expected window ≈ 4–21 min upload + ~10–20 min dump CPU + cloud restore/index rebuild (CG2).**

0. **(hardening, fold #3 — restore-db truncate guard.)** Add a destructive-truncate guard to `scripts/restore-db.js` so this one-off tool is not a post-launch landmine: **refuse to TRUNCATE a `--target` that holds `auth.users` rows OR more than a small `N` data rows without an explicit `--i-really-mean-to-truncate` flag.** The current Phase-4.0 invocation keeps working because **cloud is empty → the guard passes with no flag.** *(Decision: implemented as a small F0 code edit to `restore-db.js` — it is the only code change in F0 and is cheap Backend/Pipeline hardening. If the operator prefers zero F0 code churn, file it as a follow-up and note the landmine remains until then.)*
1. **(pre) Availability + size confirmation.** Run the P4-G2 extension check against cloud. Confirm dump size (CG2, confirmation only): `PG_HOST=127.0.0.1 PG_PORT=54322 ... pg_dump --format=custom --data-only "$PG_SOURCE" | wc -c` OR `psql "$DATABASE_URL_54322" -c "SELECT pg_size_pretty(pg_database_size(current_database()))"`. **No baseline re-pin (CG1) — gate (f) uses the pinned constants as-is.**
2. **Cloud schema catch-up (226→235):**
   `DATABASE_URL="$SUPABASE_DATABASE_URL" SUPABASE_CA_CERT_PATH=... node scripts/migrate.js --dry-run` → review the 10-file plan → then without `--dry-run`. Confirm `Done: 10 applied`. Then `--verify` → expect `0 missing, 0 drift`. Verify enumerated effects (P4-G2): `profiles`/`entitlements` exist; `cron.job` now has 3 rows; `public.vault_upsert_secret` exists with service_role-only EXECUTE.
   **2b. (fold #5) Unschedule the 3 pg_cron jobs BEFORE the load** so `mv_monthly_permit_stats_refresh` (14:30 UTC) cannot `ACCESS EXCLUSIVE`-lock-conflict with the restore:
   `psql "$SUPABASE_DATABASE_URL" -c "SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('mv_monthly_permit_stats_refresh','lead_views_retention_purge','offboarding_sweep_30day');"` → confirm `cron.job` now 0 rows.
3. **Data load** (P4-G3/P4-G4/CG3 — note the mandatory `PG_*` source override; combined mode, no `--dump`):
   `PG_HOST=127.0.0.1 PG_PORT=54322 PG_USER=postgres PG_PASSWORD=postgres PG_DATABASE=postgres SUPABASE_CA_CERT_PATH=... node scripts/restore-db.js --target=cloud --mode=fresh`
   Combined dump(from `:54322`)+restore(to cloud), TOC preflight before TRUNCATE, `--single-transaction --exit-on-error`, stderr-gated. Resume = re-run.
4. **Post-load G10 gate suite** (auto-run at end of step 3; or re-run standalone `... node scripts/restore-db.js --target=cloud --verify-only`). **PASS condition: gate (a)+(b)+(c)+(d)+(f)+(g) verdict = PASS** vs the live `:54322` source. Gate (f) passes against the pinned constants (CG1, zero drift); gate (d) self-baselines +49 by design (CG1). Record `postgis_full_version()` both sides (INFO) + invalid-geom id-set match (16/17).
   **4b. (fold #5) Re-schedule the 3 pg_cron jobs AFTER the load completes** — re-run 233's idempotent scheduling:
   `DATABASE_URL="$SUPABASE_DATABASE_URL" SUPABASE_CA_CERT_PATH=... node scripts/migrate.js` is a no-op (233 already applied, checksum-clean) → instead re-run the schedule explicitly by re-applying 233's `cron.schedule` calls (or `psql -f` the 3 `cron.schedule(...)` statements from `migrations/233_*.sql:89-111`). Confirm `cron.job` back to exactly 3 rows.
5. **Post-load wiring against the now-full cloud:**
   (a) `DATABASE_URL="$SUPABASE_DATABASE_URL" node scripts/seed-pipeline-schedules.js` → 5 rows (coa/permits/sources/entities/deep_scrapes) upserted; **verify `cron.job` still = 3** (seed touches `pipeline_schedules`, not cron).
   (b) **(fold #4 — HARD gate, NON-deferrable.) Real-scale backup proof:** `SUPABASE_DATABASE_URL=... SUPABASE_CA_CERT_PATH=... BACKUP_S3_*=... node scripts/backup-db.js` against the NOW-FULL cloud → proves the backup + `.manifest.json` sidecar at production size. **B2 creds EXIST and backup-db already ran live (current state)** — so the earlier "defer if creds unavailable" clause is REMOVED; this is a **HARD F0 Go/No-Go gate.**
6. **Data API re-verify (fold #7 — SEC-1 gate).** Do NOT carry the "disabled at 0.7" premise unverified: `curl -i https://gcnatfpacuhsytcbaszi.supabase.co/rest/v1/` per Spec 113 §10, expect disabled/404. **Live probe found PostgREST RESPONDING (503 PGRST002 / 401), NOT cleanly disabled** → flag for operator dashboard action (**Settings → Data API → disable/verify**) before any public exposure. Record the endpoint response in the load report.
7. **OUTPUT review** (Backend/Pipeline panel + Regression Guardian on the restore-db guard edit + Reality-Check on the loaded cloud numbers).

**Go/No-Go → F1:** gate-(a)+(f) PASS + 226–235 applied (`--verify` clean) + `cron.job`=3 (re-scheduled) + `pipeline_schedules` seed=5 + **real-scale backup proof green (5b, HARD)** + Data API posture recorded (6). Any gate-(a) FAIL = HALT (re-run is safe; cloud is truncate-first).

---

### P4-F1 (= program 4.1) — Vercel activation
**Cross-Domain. Deltas from the early-done human setup (account/domain/integration/GitHub).** Order matters; **fold #6 restructures the deploy ordering** — Deployment Protection is verified ON *before* the first build that yields a deployment, and preview builds before production.

- **P4-F1a — Resolve the connection-string gap (OD-A / ballot #1, blocks first deploy).** Adopt **client.ts alias** `process.env.POSTGRES_URL ?? process.env.DATABASE_URL` (Admin domain edit, unit-testable) OR set a manual Vercel `DATABASE_URL` env = the 6543 transaction-pooler URL. **Recommend the alias.** Migration/tooling paths (never on Vercel runtime) keep `POSTGRES_URL_NON_POOLING`/`SUPABASE_DATABASE_URL` (session-pooler/direct 5432, D3). Set Vercel env `PG_POOL_MAX` low (**start 1–2**, monitored at 4.4; `client.ts:31`).
- **P4-F1b — Spec 113 §3 amendment: DONE THIS FOLD (fold #1).** The Vercel row now names `POSTGRES_URL` (6543 app runtime) + `POSTGRES_URL_NON_POOLING` (5432 migration/tooling) and states the integration does NOT inject `DATABASE_URL`; new **§3.2** enumerates the operator-set non-injected vars (`ADMIN_MFA_ENFORCED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`, `DEV_MODE`). No mid-execution F1b spec edit remains.
- **P4-F1c — Env-verification script (NET-NEW, `scripts/verify-vercel-env.js`; fold #2 — Ground-truth + SEC-3).**
  (a) **ASSERT PRESENCE** of the integration-injected runtime set (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_URL`, publishable/anon key — incl. the **G7 asymmetric-JWT** publishable-key check) **AND of the six operator-set criticals** (§3.2): `ADMIN_MFA_ENFORCED=true`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, a Sentry DSN, `CRON_SECRET` — so prod cannot ship green with MFA inert or the Stripe webhook dead. **ASSERT `DEV_MODE` ABSENT** (or explicitly false).
  (b) **NEGATIVE check upgraded to an ALLOWLIST:** known-public values permitted (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SENTRY_DSN`); flag ANY OTHER value appearing in a `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` var. Catch `postgres://` / DB-password shapes, **legacy `eyJ…` service-role JWTs**, AND `sb_secret_*`-prefixed keys — not just the `sb_secret_` prefix.
  (c) **Run across `production` + `preview` + `development` environments**, not one.
  (d) **Env-only build-step** — reads `process.env` as a CI/build pre-step; **the local `vercel env pull` dual-mode is DROPPED** (SEC-3/Gemini MED — one code path, no pulled-secret file on disk). Exit non-zero on any missing-required, DEV_MODE-present, or leaked-secret finding.
- **P4-F1d — `.vercelignore` (NEW).** Create with `docs/` (specs live in-repo, not shipped). Recommend +`.cursor/`, +`mobile/` (ballot #8 / OD-F — never part of the Next.js build); keep minimal and reviewed.
- **P4-F1e — Cloud dashboard checklist (HUMAN) — fold #6/#7/#8/#11 land here.**
  - **(fold #6, HARD gate) Deployment Protection + Vercel Authentication ON for ALL environments, then POSITIVELY VERIFY:** hit a preview URL **unauthenticated** and confirm an SSO redirect / 401 BEFORE any build that yields a deployment. Previews are public-by-default; "Deployment Protection confirmed ON before the first deployment-yielding build" is a HARD gate.
  - **(fold #8) Signup posture:** set `disable_signup=true` on the cloud project until launch (or provision the admin email before ANY exposure); confirm email confirmations ON. Add `disable_signup` + confirmations-ON to the verification checklist.
  - **(fold #7) Data API:** confirm the F0-step-6 finding is actioned — Data API disabled/verified in the dashboard (probe returned 503/401, not clean-disabled).
  - **(fold #11, SEC-6 LOW) Redirect allowlist:** add web `https://maxbld.ca` + the **narrowest wildcard Supabase permits** for `https://*-<project>.vercel.app` previews (mobile `com.buildo://` already added Phase 1.2 — **fold #15 NOTE: this scheme goes stale when the Spec 117 OD-B4 mobile-scheme rename ships at 4.2; the allowlist must add the renamed scheme then**). Confirm **Vercel Git settings do NOT build fork-PR previews** (fork-trigger fence).
  - Configure Supabase Auth SMTP → Resend (`smtp.resend.com`, `RESEND_API_KEY` — Phase 1.2 note); DISABLE the integration's preview DB-branching (D12 — migrate.js incompatible). **Do NOT attach `maxbld.ca`** (that is 4.2, post Phase-2 EAS).
- **P4-F1f — Cloud first-admin bootstrap (HUMAN, P4-G8; fold #12 hygiene).** Export secrets in-shell, run, then unset — do NOT inline literals; run in a **private/unlogged terminal** (the printed `action_link` is a single-use admin bearer). Security CONFIRMED the var-reference command shape does not leak literals — keep it:
  `BOOTSTRAP_ALLOW_REMOTE=1 SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SECRET_KEY" DATABASE_URL="$SUPABASE_DATABASE_URL" BOOTSTRAP_ADMIN_EMAIL=<operator> node -r dotenv/config scripts/bootstrap-first-admin.js` → operator opens the printed `action_link`, sets password, then **enrolls TOTP MFA** (Spec 13 D7); then `unset` the exported secrets.
  **Recovery SQL for a failed/partial bootstrap (non-idempotent — re-run fails at `createUser`):** delete the half-provisioned user before retry —
  `psql "$SUPABASE_DATABASE_URL" -c "DELETE FROM auth.users WHERE email = '<operator>';"` (CASCADEs through the D6 FKs incl. `profiles`), then re-run the bootstrap.
- **P4-F1g — First deploy smoke (PREVIEW only; fold #6 ordering + #13 SMTP smoke).** Deployment Protection already confirmed ON (F1e). Relax `ignoreCommand` **just enough to build a PREVIEW** (scoped scratch commit / preview-only trigger), then: run `verify-vercel-env.js` (F1c); confirm the **protected preview** gates unauthenticated access (SSO/401); **admin login against the CLOUD project** using the F1f account + MFA; hit an admin route that uses raw-pg (proves the F1a connection string + 6543 pooler). **(fold #13) SMTP recovery-link smoke:** generate a recovery link and confirm generation SUCCEEDS (delivery need not be verified) — so a broken auth SMTP config is not hidden until later.
- **P4-F1h — Enable the production build (LAST).** Only after Deployment Protection confirmed on all envs AND F1g green: remove the remaining `ignoreCommand` guard so the first real **production** build runs. **Still do NOT attach `maxbld.ca`** until 4.2 (post Phase-2 EAS) per program.

**Go/No-Go → F2/4.3:** F1g preview smoke green + `verify-vercel-env.js` clean (presence of the 6 criticals, DEV_MODE absent, no leaked-secret) + **Deployment Protection positively verified ON before any deployment-yielding build** + Data API + signup posture actioned.

---

### P4-F2 (= program 4.3 partial) — Cron activation gate
**Blocked on GH secrets (HUMAN adds `SUPABASE_DATABASE_URL`, `BACKUP_S3_*`×4, `DECODO_PROXY_*`×4 as repo/environment encrypted secrets) AND on the migration branch being on `main` (P4-G9 / ballot #6 / OD-D).**
- **(fold #9, ballot #3) Proxy secret NAMING:** the GH secrets MUST be `DECODO_PROXY_HOST` / `DECODO_PROXY_PORT` / `DECODO_PROXY_USER` / `DECODO_PROXY_PASS` — the workflows read `secrets.DECODO_PROXY_*` (`chain-deep-scrapes.yml:179-182`), NOT `PROXY_*`. **Add a proxy-presence assertion to `chain-deep-scrapes.yml`'s `env_guard`** (mirroring the existing `SUPABASE_DATABASE_URL` empty check at L112) — empty proxy creds = the scraper routes via the runner's datacenter IP, defeating WAF-invisibility (Spec 113 §8.2 / Spec 115 §2.4). Operator confirms the secret names.
- **(fold #10, ballot #4) CI root-cred blast radius:** the `SUPABASE_DATABASE_URL` secret is the `rolbypassrls` `postgres` role. Re-confirm the §8.2-option-3 risk acceptance now that F0 has loaded REAL data (poisoned workflow dep = total prod compromise + backup tampering; PITR OFF). Operator ruling, not decided here.
- Activation PR: uncomment the `schedule:` block in all 5 workflows (`chain-coa-permits`, `chain-sources`, `chain-entities`, `chain-deep-scrapes`, `pipeline-watchdog`).
- Before uncommenting: **supervised `workflow_dispatch` run of each chain + the watchdog against cloud** (workflow_dispatch is live once on `main`, pre-uncomment) — verify: `check-chain-running.js` guard passes, `run-chain.js --verify` pre-flight green against cloud, the deep-scrapes `pipeline_runs` verdict-read red-flip works, watchdog freshness queries return sane rows, `backup_db` writes under `permits:backup_db`, **and the new proxy-presence guard passes.**
- Then merge the uncomment PR; confirm the first real scheduled ticks land + the watchdog's 25h freshness passes.

**P4 EAS build (program 4.2): EXPLICITLY BLOCKED — not planned here.** Depends on Phase 2 (mobile) closure (device smoke, EAS init/FCM, dashboard redirect swap), all HUMAN-gated. Sequence after Phase 2 closes; it also flips the `maxbld.ca` attach + Pro-tier $25/mo (PITR OFF per D9) AND the Spec 117 OD-B4 `com.buildo://`→renamed-scheme redirect swap (fold #15). Stated per program gate 6.

### P4-F3 (= program 4.4) — Post-launch monitoring (referenced, opens after 4.2)
Supavisor client-connection count under Fluid Compute (G7 open bug); alert threshold documented per Spec 113 §5/§13. Out of this plan's build scope; named for completeness.

---

## Go/No-Go gates (consolidated)
1. **F0:** G10 gate-(a)+(f) PASS vs live `:54322` source; 226–235 applied (`--verify` clean); `cron.job`=3 (unschedule-during-load, re-schedule after — fold #5); `pipeline_schedules` seed=5; **real-scale backup proof green (5b — HARD, fold #4)**; Data API posture probed & flagged (fold #7).
2. **F1:** preview smoke green (admin login vs cloud + MFA + raw-pg route + SMTP recovery-link smoke); `verify-vercel-env.js` clean incl. the 6-critical presence, DEV_MODE-absent, and allowlist no-leaked-secret checks across prod+preview+dev; **Deployment Protection positively verified ON (unauth → SSO/401) BEFORE any deployment-yielding build (fold #6, HARD)**; signup posture + Data API actioned.
3. **F2 (4.3):** GH secrets present (incl. `DECODO_PROXY_*` correctly named + proxy-presence guard) + branch on `main`; CI-root-cred/PITR-off risk re-confirmed; supervised `workflow_dispatch` of all 5 workflows green BEFORE the uncomment PR.

## Abort clauses
- **Vercel:** roll back to the previous deployment (Vercel dashboard); re-add `ignoreCommand:"exit 0"` if a hard stop is needed; `maxbld.ca` never attached until 4.2 → DNS abort is a no-op.
- **Cloud data load:** re-runnable — truncate-first, idempotent, `--single-transaction` restore. A partial/failed restore leaves the derived cloud truncated (safe pre-launch); re-run to recover. Cloud is regenerable from `:54322` at will, so no operator safety-dump needed (P4-G3). The new truncate guard (fold #3) passes on an empty cloud.
- **Cloud auth state:** `DELETE FROM auth.users` CASCADEs through the D6 FKs (mig 229) — the operator bootstrap account is removable/re-creatable; bootstrap is non-idempotent (recovery SQL in F1f).

---

## Panel Adjudication (5-reviewer, 2026-07-21)

Panel: Gemini + DeepSeek (4-lens) + Ground-truth + Integration + Security, grounder-adjudicated. Disposition of every raised item:

**Confirmed-good (baked in; hedges dropped):**
- **CG1 — G10 zero-drift (grounder).** ACCEPTED. Dropped the P4-D1/OD-B re-pin step entirely; gate (f) passes against the pinned 2026-07-18 constants as-is; gate (d) +49 self-baseline documented (`supabase-load-gates.js:465-474`). OD-B removed from the ballot.
- **CG2 — transfer size (grounder).** ACCEPTED. ≈1.5–1.8 GB; expected window 4–21 min upload + ~10–20 min dump CPU + cloud restore/index rebuild baked into F0. OD-E resolved & removed; one-line `pg_dump | wc -c` kept as confirmation only.
- **CG3 — restore-db combined mode (Integration vs DeepSeek).** DeepSeek's contract objection **REFUTED** — `restore-db.js:18-30` documents mode 1 (no `--dump`, `PG_*` source) as the Phase-0.5/4.0 shape. Drift note added: Spec 112 §4.3 Usage line + manifest-baseline model are STALE vs the shipped code; **Spec 112 fix DEFERRED** (out of this fold), flagged in CG3.

**Folded (process/sequencing):**
1. **Spec-first / Spec 113 §3 (Gemini CRITICAL + Ground-truth).** APPLIED this fold — §3 Vercel row corrected `DATABASE_URL`→`POSTGRES_URL`(6543)/`POSTGRES_URL_NON_POOLING`(5432); new **§3.2** adds the 7 non-injected operator-set rows (`ADMIN_MFA_ENFORCED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`, `DEV_MODE`). Plan F1 env inventory (F1c) updated to match. No mid-execution F1b remains.
2. **verify-vercel-env.js scope (Ground-truth + SEC-3).** APPLIED — F1c now asserts presence of the 6 criticals + DEV_MODE-absent; negative check upgraded to an allowlist catching `postgres://`/DB-password/legacy `eyJ…` service-role JWT/`sb_secret_*`; runs across prod+preview+dev; env-only build-step (local `vercel env pull` dual-mode dropped).
3. **restore-db production guard (Gemini CRITICAL).** APPLIED as **F0 step 0** — truncate guard requiring `--i-really-mean-to-truncate` when the target holds `auth.users`/>N rows; passes on the empty cloud. Noted: implemented as the single F0 code edit (may be filed as a follow-up at operator preference, landmine noted).
4. **Backup proof NON-deferrable (Gemini CRITICAL).** APPLIED — F0 5b "defer if creds unavailable" clause REMOVED; real-scale post-load backup is a HARD F0 Go/No-Go gate (B2 creds exist, backup-db already ran live).
5. **pg_cron during restore (DeepSeek+Gemini HIGH).** APPLIED — F0 step 2b unschedules the 3 jobs (`cron.unschedule(jobid) … WHERE jobname IN (…)`) before the load; step 4b re-schedules via 233's `cron.schedule` statements after. Avoids the 14:30-UTC `mv_monthly_permit_stats_refresh` lock conflict.
6. **F1g/F1h deploy ordering (DeepSeek+Security SEC-5).** APPLIED — F1e now puts Deployment Protection + Vercel Auth ON all envs and POSITIVELY VERIFIES (unauth → SSO/401) BEFORE any deployment-yielding build; F1g builds a PREVIEW only; F1h enables production last; maxbld.ca deferred to 4.2. "DP confirmed ON before first deployment-yielding build" = HARD gate.
7. **Data API re-verify (Security SEC-1).** APPLIED — F0 step 6 curls the cloud REST endpoint expecting disabled/404; **live probe found PostgREST RESPONDING (503 PGRST002 / 401)** → flagged for operator dashboard action (Settings → Data API), added to F1e checklist.
8. **Cloud signup posture (Security SEC-2).** APPLIED — F1e sets `disable_signup=true` until launch (or provision admin email first); signup-posture + confirmations-ON added to the verification checklist. Ballot #5.
9. **Proxy secret naming (Security SEC-7).** APPLIED — F2/GH-secret list renamed `PROXY_*`→`DECODO_PROXY_*` (workflows read `secrets.DECODO_PROXY_*`, `chain-deep-scrapes.yml:179-182`); proxy-presence assertion added to the `env_guard`. Ballot #3 (operator confirms secret names).
10. **CI root-cred blast radius (Security SEC-4).** SURFACED, not decided — ballot #4; re-confirm §8.2-option-3 acceptance now that real data is loaded; tied to Gemini's standing PITR-off CRITICAL. Both go to the operator.
11. **Redirect wildcard (Security SEC-6, LOW).** APPLIED — F1e uses the narrowest wildcard Supabase permits + confirms Vercel does NOT build fork-PR previews (fork-trigger fence).
12. **Bootstrap secret hygiene (Gemini HIGH + SEC-1).** APPLIED — F1f exports-then-unsets in a private/unlogged terminal; documented recovery SQL (`DELETE FROM auth.users WHERE email=…`) for the non-idempotent partial-bootstrap; action_link single-use-bearer warning. Security confirmed the var-reference shape does not leak literals — kept.
13. **SMTP smoke (DeepSeek MED).** APPLIED — F1g adds a recovery-link generation test (generation succeeds even if delivery unverified).
14. **Session-pooler pin (grounder SEC-op-note).** SURFACED — ballot #2; pin `SUPABASE_DATABASE_URL` to session-pooler `:5432` (IPv6-only direct `ENOENT`'d) for migrate.js, restore-db, and the GH secret. D3 recommendation updated.
15. **com.buildo:// scheme coupling (Ground-truth NOTE).** APPLIED as a one-line callout in F1e + F2 — the reused `com.buildo://` redirect URI goes stale at the Spec 117 OD-B4 mobile-scheme rename (4.2); the allowlist needs the renamed scheme then.

**Ballot compiled** at the top (## FINAL OPERATOR BALLOT): OD-A (#1), session-pooler pin (#2), DECODO_ secret-name confirm (#3), CI-root-cred + PITR-off re-confirm (#4), disable_signup (#5), merge-to-main timing / OD-D (#6), PG_POOL_MAX / OD-C (#7), `.vercelignore` scope / OD-F (#8). Dropped: OD-B, OD-E.
