# Supabase Migration Investigation — Buildo

**Date:** 2026-07-18
**Author:** Multi-agent investigation (6 parallel agents: Firebase/auth surface, DB/migration layer, storage/backup/crons, spec inventory, Supabase target architecture, web+app integration)
**Status:** Investigation / planning only — **no `src/` code written**. Implementation is a downstream WF1/WF2 sequence (see §10).

---

## 0. TL;DR

Buildo's data layer is **already PostgreSQL/PostGIS** (self-hosted Docker `buildo_pgdata` in dev, Google Cloud SQL in prod). Supabase **is** managed Postgres, so the database is a **host move, not a rewrite**. The genuine "Google SDK" coupling is in five surfaces:

| Surface | Today | Supabase target | Lift |
|---|---|---|---|
| **Database** | Postgres (Cloud SQL / Docker) | Supabase Postgres + PostGIS | Low — repoint `DATABASE_URL`, add SSL to pipeline pools |
| **Auth** | Firebase Auth + `firebase-admin` JWT verify | Supabase Auth (GoTrue) + `getClaims()` | Medium (backend) / High (mobile) |
| **User store** | Firestore (legacy) + Postgres `user_profiles` | Postgres `public.profiles` + RLS | Low — Firestore is nearly dead code |
| **Backups** | `pg_dump` → GCS + Cloud SQL PITR | Supabase PITR + nightly `db dump` | Low |
| **Crons** | `node-cron` / `local-cron.js` + Cloud Scheduler | External scheduler + pg_cron | Medium |
| **Gemini AI** (`@google/genai`) | — | **unrelated, stays** | none |

**Recommended architecture: keep Next.js as the single API gateway.** The pipeline keeps its raw `pg` Pool (pointed at Supabase); `supabase-js` replaces Firebase **for auth only**; clients keep the existing `{ data, error, meta }` contract. This touches ~4 auth files instead of every route + RLS on every table. **Do NOT route the pipeline through PostgREST/RLS.**

**Status update (2026-07-18):** this is **pre-launch** — nothing runs in the cloud, **zero users**, web admin + DB ready, mobile app built but **untested**, Supabase account **already created**, web deploying to **Vercel**. That makes it a **direct greenfield cutover**, not a live migration: no user import, no UID→UUID backfill, no SCRYPT→bcrypt rehash, no dual-issuer bridge. Develop against **local `supabase start` ($0)**, launch on **Pro $25/mo (no PITR)**. See §0.5.1 and the revised §10 sequence. *(A live-system migration would instead use the dual-issuer bridge in §10 — retained for reference.)*

---

## 0.5 Why Supabase, cost vs staying on Google, and when NOT to migrate

**Why Supabase is a good fit (advantages specific to Buildo):**
- **It's just Postgres.** You're already on Postgres/PostGIS with 220 raw-SQL migrations — Supabase is a *host move*, not a data-model rewrite, with near-zero lock-in (`pg_dump` out anytime). Moving *off* Firestore (proprietary) *onto* Postgres is a strict architectural improvement.
- **Auth lives in the same DB as data** → a real FK from `user_profiles` → `auth.users(id)` with cascade delete, which **deletes `purge-lead-views.js`** and retires the ADR-006 "external identity, no FK" workaround. `auth.uid()` usable directly in SQL/RLS.
- **Consolidation:** one platform replaces Firebase Auth + Firestore + Cloud SQL + GCS + Cloud Scheduler + reconciliation scripts.

**Tightly integrated ecosystem pieces that reduce effort:**
- **Web hosting → Vercel (NOT Supabase).** Supabase does not host the Next.js frontend. But its official Vercel integration auto-syncs env vars (incl. `SERVICE_ROLE_KEY`), auto-updates Auth redirect URIs for prod + every preview deploy, and can spin up a **preview DB branch per PR** to validate the 220 migrations before `main`. ("Hosting" = Vercel + Supabase, or keep the API on Cloud Run.)
- **Stripe → first-party Stripe Sync Engine (one-click) + Stripe FDW** (query live Stripe as Postgres foreign tables). Optional — the existing webhook integration works; this is a nice-to-have for reconciliation.
- **Firebase Wrapper (FDW) → a migration accelerator.** Read Firestore collections + Firebase Auth users as Postgres foreign tables (creds via Vault) + an official "Migrate from Firestore" guide, turning the UID→UUID backfill into an in-DB SQL exercise. (Read-only, loads into memory — fine for one-time migration, not hot paths.)
- **Stays unchanged (Supabase does not replace these):** Upstash Redis rate-limiting, Sentry, PostHog, and the AI SDKs (Anthropic/OpenAI/Gemini) all coexist.

**Cost comparison — the $150 was PITR-inflated; the real numbers are a wash:**

| Component | Google (today) | Supabase (equivalent) |
|---|---|---|
| Database | Cloud SQL `db-n1-standard-1` **~$50/mo** (or standard-2 **~$100** for heavier spatial) + storage/backups | **Pro $25/mo** (8 GB, 7-day daily backups, $10 compute credit) + Small **$15** / Medium **$60** compute if PostGIS needs it |
| Auth | Firebase Auth **$0** (<50K MAU) | included **$0** |
| User store | Firestore **~$0** | included (Postgres) **$0** |
| Backups | bundled + PITR (+20–40% storage) | daily 7-day **included**; PITR **~$100 OPTIONAL** |
| Storage / Cron | GCS ~$1–5 / Scheduler $0 | included / pg_cron $0 |
| Web hosting | Cloud Run ~$0–40 | **Vercel** Hobby $0 / Pro $20 (chosen host) |
| **Realistic total** | **~$60–130/mo** | **~$25–85/mo without PITR** ($140+ with PITR) |

**Conclusion: cost is essentially a wash — Supabase is likely slightly cheaper without PITR** (rely on daily 7-day backups + the existing nightly `pg_dump`). Cost should **not** drive this decision in either direction.

### 0.5.1 Pre-launch status makes this a clear "switch now" (updated 2026-07-18)

Current reality: **nothing runs in the cloud, there are zero users, the web admin + DB are ready, the mobile app is built but untested (just entering testing), the Supabase account is already created, and the web will deploy to Vercel.** This flips the earlier "maybe stay on Google" balance decisively toward switching **now**, because every item that made migration risky assumed a *running system with users* — none of which applies:

- **No users** → no user import, no UID→UUID backfill, no SCRYPT→bcrypt password problem, no dual-issuer bridge. Real FKs to `auth.users` can be added immediately.
- **Mobile built-but-untested** → swap its auth to Supabase *before* spending test cycles, so you validate the final stack once instead of testing Firebase then re-testing Supabase. This is an auth swap in existing code, not a rewrite of *working* code.
- **Switching before launch avoids writing/finishing more Google-coupled code you'd later unwind.**
- **Cheapest on-ramp:** develop against **local `supabase start`** (full stack in Docker, **$0**) → promote to the cloud project (already created) → launch on **Pro $25/mo, no PITR**. $0 through development; ~$25/mo at launch. (Free cloud tier's 500 MB won't hold the PostGIS pipeline data, so Pro is the production floor.)

**Recommendation: adopt Supabase now, local-first, no PITR, web on Vercel — per the pre-launch sequence in §10.** The "when to stay on Google" caveat below applied only to a live, users-in-production migration and is retained for the record.

**(Historical) When staying on Google would have been valid:** if this were a *live* system and cost was the sole driver — the marginal savings wouldn't justify a live auth migration's risk (user backfill, password rehash, re-testing a working mobile app). That scenario does not apply pre-launch.

---

## 1. Update the specs with the right architecture

26 specs encode Google/Firebase assumptions. The migration splits into two independent clusters:

**Auth cluster (larger, higher-risk, gated on the RLS decision):**

| Rank | Spec | Change |
|---|---|---|
| 1 | `00-architecture/13_authentication.md` | **Keystone full rewrite** — GoTrue, JWT verify via `getClaims`/JWKS (not `verifyIdToken`), service-role vs anon boundary, DEV_MODE re-anchor |
| 2 | `03-mobile/93_mobile_auth.md` | Rewrite off `@react-native-firebase/auth` → `supabase-js` (email/Google/Apple/phone-OTP) |
| 4 | `00_engineering_standards.md` | §4.4 token model, §401 refresh path, "Firebase UID" → `auth.uid()` |
| 5 | `00-architecture/two_client_architecture.md` | §3/§4 Firebase session/Bearer → Supabase JWT |
| 6 | `adr/006-firebase-uid-not-fk.md` | **Supersede** — identity now lives in the same Postgres; real FK to `auth.users(id uuid)` becomes possible |
| 7–14 | Mobile 95/99/97/90/94/96, admin 21/33 | uid string→uuid, admin CRUD → Supabase Admin API, offboarding sweep → pg_cron |
| 15–24 | 76, 20, 35, 101, 34, 07, 98, `_contracts.json`, `01_database_schema.md` | Cloud SQL/PostGIS wording, `firebase_uid_max:128` contract, `user_id VARCHAR(128)` docs |

**Data/ops cluster (independently migratable, mostly mechanical):**

| Rank | Spec | Change |
|---|---|---|
| 3 | `00-architecture/112_backup_recovery.md` | Full rewrite — PITR as a project setting, dump → Supabase Storage, Cloud Scheduler → external scheduler/pg_cron, creds → Vault |
| 15 | `02-web-admin/76_lead_feed_health_dashboard.md` | "Cloud SQL has PostGIS" → Supabase PostGIS extension |

**New specs / ADRs needed (7):**
1. Rewrite of Spec 13 — *Authentication on Supabase* (keystone)
2. New **Supabase Infrastructure** spec (project/env layout, Supavisor pooling decision, extensions, hosting model — replaces the implicit Cloud SQL + Docker model)
3. New **RLS Policy catalog** spec (mandatory *if* the Data API is exposed; best practice even if not)
4. Rewrite of Spec 112 — *Backup/Recovery on Supabase*
5. New **pg_cron / scheduling** spec (replaces Cloud Scheduler + the deferred Cloud Function 30-day account-deletion sweep in Spec 97)
6. New **Vault / secrets** section (replaces `GOOGLE_APPLICATION_CREDENTIALS`, ADC, `FIREBASE_SERVICE_ACCOUNT_KEY`, `secrets/firebase-admin-sdk.json`)
7. **Supersede ADR 006** — decide `user_id` → real FK to `auth.users(id)` (uuid); touches `_contracts.json` and `01_database_schema.md`

**Operating-model guardrail (must update first):** `00_claude_code_operating_model.md` L329 Approved-Stack table says *"Firebase Auth… Never swap for Clerk or other providers without architectural approval."* **This migration is the architectural-approval event that line demands** — update it to bless Supabase Auth before implementing. Also: `.claude/domain-admin.md` (L56/L65 Firebase Admin SDK), `.claude/workflows.md` (WF12 native-module list), and runbooks (`db_rebuild_2026-06-10.md` `buildo_pgdata`, `stripe_webhook_smoke.md` seeded Firebase uid). Root `CLAUDE.md` and `scripts/CLAUDE.md` are clean.

---

## 2. Code review — what's coupled

**Auth is a chokepoint, in a good way.** ~32 API routes authenticate through just **5 helper files + middleware**, so swapping auth touches ~6 files and leaves the routes unchanged (only the `uid` type changes, string → uuid string):

- `src/lib/firebase-admin.ts` (330 lines) — **delete**; Supabase verifies JWTs with no service-account file
- `src/lib/auth/get-user.ts` — swap `admin.auth().verifyIdToken()` → `supabase.auth.getClaims()` (local JWKS verify). Keep the 8KB guard, 3-segment shape check, Bearer-vs-cookie precedence **verbatim** — they're transport-agnostic and load-bearing
- `src/lib/auth/verify-admin.ts` — swap session verify; `ADMIN_USER_IDS` allowlist → `profiles.is_admin` + RLS. `X-Admin-Key` CI bypass + CSRF checks unaffected
- `src/lib/auth/get-user-context.ts` — the one data concern: `user_profiles.user_id` (Firebase string) → Supabase uuid
- `src/lib/auth/config.ts` — Firebase client/admin init → Supabase client factory
- `src/middleware.ts` — optional `@supabase/ssr` session refresh; edge shape-check stays
- `src/instrumentation.ts` — remove `getFirebaseAdmin()` boot

**Firestore is nearly a no-op** — one legacy file (`src/lib/auth/session.ts`) writes a `users` doc + `preferences` subdoc that **already duplicates** Postgres `user_profiles`. Likely deletable rather than migratable.

**Mobile is the largest lift** — ~13 files on the native `@react-native-firebase` API (a *different* SDK from the web JS SDK), including a rich multi-provider sign-in UI (email/Google/Apple/phone-OTP + account linking): `mobile/src/lib/firebase.ts`, `authStore.ts` (`onAuthStateChanged` listener), `apiClient.ts` (401-refresh), `sign-in.tsx`/`sign-up.tsx`, `firebaseErrors.ts`, plus removal of native config files (`google-services.json`, `GoogleService-Info.plist`) and their EAS secrets.

**Cloud Functions surface (`functions/`)** — a separate `functions/src/index.ts` uses `firebase-admin` + `@google-cloud/storage` for a Toronto Open Data snapshot sync and two `new pg.Pool({connectionString})` (no SSL). Migrates to a scheduled Edge Function or folds into the pipeline.

**Total direct-coupling: ~35 source files** (3 web-client, ~8 web backend, 1 Firestore, ~13 mobile, plus `functions/`). The riskiest piece is **data, not code** — see §7.

---

## 3. Scripts that need to change

**~20+ independent `pg.Pool` constructions** exist in 4 config styles (`DATABASE_URL`; `PG_*` with SSL; `PG_*` *without* SSL; hardcoded `localhost`). The critical gaps:

1. **SSL — the #1 pipeline blocker.** `scripts/lib/pipeline.js` `createPool()` (the canonical pool every compliant pipeline script uses), `scripts/migrate.js`, `scripts/validation/run-step.mjs`, and `functions/src/index.ts` set **no `ssl` key** and don't read `DATABASE_URL`. **Supabase mandates TLS.** Fix: enable TLS **with verification** — download Supabase's CA cert (Dashboard → Database → SSL) and set `ssl: { ca: <supabase-ca-pem>, rejectUnauthorized: true }`, or `PGSSLMODE=verify-full` + `PGSSLROOTCERT=<path>`. **Do not use `rejectUnauthorized: false`** — it disables cert verification and exposes the pipeline to MITM. ⚠ Note: `src/lib/db/client.ts` currently ships `ssl: { rejectUnauthorized: false }` in prod — this migration is the right moment to harden that to CA-pinned verification too, not to copy the weak setting into the pipeline pools.
2. **Pooler routing (architectural).** Migrations, seeds, all `scripts/` pipeline work, `pg_advisory_xact_lock` (whole-step transactions run for minutes), and `pg-query-stream` cursors **must use the direct connection or session-mode pooler (5432)** — the transaction-mode pooler (6543) breaks session state, advisory locks, cursors, and prepared statements. Only the web app's short queries may use 6543.
3. **Hardcoded-localhost analysis scripts** (`scripts/analysis/parcel-field-dump.js`, `parcel-sanity-audit.js`, `wf3-*`, etc.) — edit or ignore (diagnostics only).
4. **`scripts/backup-db.js`** — replace GCS (`new Storage`, `bucket`, `createWriteStream`, prune) with Supabase Storage, or retire (see §5).
5. **`scripts/local-cron.js`** — migrate 3 schedules off `node-cron` (see §6).
6. **`scripts/purge-lead-views.js`** — the (unimplemented) Firebase reconciliation of orphaned `lead_views` is **replaced by a real FK + `ON DELETE CASCADE`** once `auth.users` is in the same Postgres. Delete it.

**Migrations port cleanly.** `scripts/migrate.js` (raw SQL, `schema_migrations` checksum tracking, forward-only, 220 files) runs as-is against Supabase. All four extensions are supported: `postgis`, `pg_trgm`, `fuzzystrmatch` via `CREATE EXTENSION`; `pg_stat_statements` is pre-enabled (migration 110 no-ops). **Verify `search_path` includes Supabase's `extensions` schema** so `ST_*`/`similarity()`/`soundex()` resolve — the migrations currently assume `public`.

---

## 4. What to install on Supabase for best results

- **Extensions:** `postgis` (**install into `extensions` or a dedicated `gis` schema — it's non-relocatable after install**, add GiST indexes on geometry), `pg_trgm`, `pg_cron`, `pg_net`. `pg_stat_statements` pre-enabled. `pgvector` only if you add embeddings later.
- **Connection pooling — Supavisor (the single most important decision):** pipeline → **direct / session-mode (5432)**; serverless API routes → transaction mode (6543). Pro+ can add a co-located **Dedicated Pooler** for lower latency.
- **Data API (PostgREST):** enabled, but use it only for the mobile app / lightweight reads under RLS — **not** the pipeline. Adopt the **explicit-grant + dedicated `api` schema** model now (auto-exposure of new tables ends: new-project default 2026-05-30, enforced 2026-10-30). You may even disable the Data API entirely if only the pipeline writes and the app goes through your own API routes.
- **Vault (already enabled):** hold pipeline secrets; read via a `service_role`-restricted RPC. **Write secrets with statement logging off** (INSERTs otherwise log plaintext).
- **Storage:** private buckets + RLS policies (replaces GCS).

---

## 5. Backups

**Two layers, same shape as today:**

- **Layer 1 (managed):** Supabase **PITR add-on** (7/14/28-day, second-level granularity) replaces Cloud SQL PITR — a project setting, no `gcloud`, no code. ⚠ Enabling PITR **replaces** daily backups, **requires ≥ Small compute** ($15/mo), and restore = **full downtime scaling with DB size**; custom-role passwords aren't restored.
- **Layer 2 (portable):** keep a nightly logical **`supabase db dump`** to **off-Supabase** storage — Supabase itself recommends this for portability, selective/table-level restore, and provider independence (valuable having just left one provider). This re-homes `scripts/backup-db.js`: repoint the stream at Supabase Storage or external S3, or run the dump from the external scheduler.
- Re-home the OP4 "backup within 25h" check and the `backup_db` manifest step (`manifest.json:91`) accordingly.

**Recommendation: PITR 7–14d + nightly external `db dump`.**

---

## 6. Nightly crons

Three current schedules live in `scripts/local-cron.js` (a dev-oriented long-lived `node-cron` process — **there is no committed production scheduler today**):

| Job | Cadence | Chains |
|---|---|---|
| CoA → Permits (serialized) | Weekdays 6 AM ET | `coa` then `permits` (freshness contract), ends with `backup_db` |
| Sources | Quarterly, 8 AM ET | `sources` |
| Entities enrichment | Daily 3 AM ET | `entities` |

**Recommendation — split by criticality (Supabase's own guidance):**
- **Nightly pipeline chains + backup → external scheduler (GitHub Actions cron preferred)** hitting a secured API route that runs `run-chain.js`. Reason: **retry + alerting + failure visibility**, which pg_cron/pg_net do **not** provide (fire-and-forget, no retry, silently skips when the DB is unhealthy). ⚠ Vercel Cron has max-duration limits a 237K-row chain will exceed — trigger a worker, don't run the chain inside the function. Preserve the serialized coa→permits contract, 90-min timeout, and 12h concurrency guard.
- **In-DB SQL maintenance (VACUUM, matview refresh `034_mv_monthly_permit_stats`, expired-row cleanup, the deferred 30-day account-deletion sweep) → pg_cron.**
- Wire the existing (currently inert) `pipeline_schedules.cron_expression` admin table into whichever scheduler becomes real.

---

## 7. Security issues

- **Three keys / two connection paths:** mobile → **anon/publishable key + user JWT (RLS enforced)**; pipeline → **direct connection + service_role (RLS bypassed)** for bulk work. **Never put `service_role`/`sb_secret_*` in `NEXT_PUBLIC_*` or the Expo bundle** — it's root access. The new `sb_secret_*` format is gateway-rejected from browsers, but don't rely on that.
- **RLS becomes a first-class surface.** Today authorization lives **only in API route handlers** (`leads/feed` trade-membership 403s, rate limits, PII truncation). Under the recommended gateway architecture that logic stays server-side and needs **no RLS re-derivation**. But `auth.users` + any table reachable via the Data API needs explicit RLS policies (`auth.uid() = user_id`) — this is genuinely new (new spec #3).
- **Custom claims / admin roles:** Firebase custom claims → a **Custom Access Token Auth Hook** (Postgres function injecting a role claim) + a roles table + an `authorize()` function called inside RLS. `ADMIN_USER_IDS` → `profiles.is_admin`.
- **Network hardening:** enable **Network Restrictions** (IP allowlist to pipeline host / CI egress), enforce SSL, keep secrets in Vault.
- **Data API exposure risk:** dedicated `api` schema + explicit grants; consider disabling the Data API if unused.
- **Data-migration integrity (the riskiest piece):** no `users` table and **no FKs** today (ADR 006) — Firebase UID strings are scattered as `VARCHAR(128)` across ~8 tables (`user_profiles`, `lead_views`, `lead_view_events`, `subscribe_nonces`, `device_tokens`, notification/admin tables). Importing users into `auth.users` **reissues UUIDs**, so a **UID→UUID translation table must be applied everywhere** before FKs/RLS can be added. ⚠ **Firebase SCRYPT ≠ Supabase bcrypt** — passwords can't be imported directly; use lazy re-hash-on-first-login middleware.

---

## 8. How to maximize Supabase

- **Realtime** (opt-in per table) for live notifications/lead updates — enable only on subscribed tables.
- **Storage policies** keyed to `auth.uid()` instead of signed-URL sprawl.
- **Branching / preview environments** — per-PR ephemeral schema branches to validate the 220 migrations end-to-end before `main`. Strong fit for gating pipeline migrations.
- **Declarative schema** (Supabase CLI) is available — **but don't rip out `migrate.js`.** Either keep `migrate.js` as source of truth and use Supabase purely as a host (lowest risk), or let `supabase db` run your existing SQL files as steps. **Never run two migration engines against one schema.**
- **Observability:** Logs Explorer + `pg_stat_statements`; page on job failure via the external scheduler.
- **Vault + RPC** for clean secret handling.

---

## 9. Best practices (summary)

1. Pipeline uses **direct/session-mode (5432)**, never the transaction pooler.
2. **service_role server-only**, always; mobile is anon + RLS.
3. **PostGIS in its own schema**, decided up front (non-relocatable).
4. **RLS on everything exposed**, `auth.uid()`-based.
5. **External scheduler for must-succeed jobs** (retry/alert), pg_cron for SQL maintenance.
6. **PITR + off-site logical dumps** — don't rely on a single backup mechanism.
7. **One migration engine.** Keep the mature `migrate.js`.
8. **Lazy password re-hash** on first login (SCRYPT→bcrypt).
9. **Verify JWTs locally** with `getClaims()` (asymmetric keys) on hot paths; `getUser()` only for revocation-sensitive mutations.
10. Adopt **explicit Data API grants** ahead of the 2026 enforcement.

---

## 10. Integration with web + app — the easiest approach

**RECOMMENDED: Philosophy A — Next.js stays the single API gateway; `supabase-js` swaps in for auth only.**

- Keep the raw `pg` Pool as the data path for the entire pipeline + admin (repoint `DATABASE_URL` at Supabase). Do **not** route pipeline/admin through PostGREST/RLS.
- Clients keep talking only to Next.js with the `{ data, error, meta }` envelope and `Authorization: Bearer <token>`. The only change is *which token* and *how the server verifies it*.
- Verify server-side with `supabase.auth.getClaims()` (local JWKS, no per-request round-trip) inside the existing `src/lib/auth/` helpers.

*Why not Philosophy B (clients → Supabase directly via RLS):* Buildo's value is server-side derivation over 237K+ rows via raw SQL/transactions — none of it maps onto PostgREST, and B would force RLS on every table + a rewrite of every mobile hook and admin route + a broken API contract. A touches ~4 auth files.

**Expo specifics:** `react-native-url-polyfill/auto`; `supabase-js` with an MMKV/SecureStore storage adapter (`autoRefreshToken`, `persistSession`, **`detectSessionInUrl: false`** — mandatory on native); `processLock` to serialize refreshes; wire `startAutoRefresh`/`stopAutoRefresh` to `AppState`; Google via native `signInWithIdToken` (preferred — watch the raw-vs-SHA256 nonce rule) or `signInWithOAuth` + `com.buildo://` deep link.

**Next.js server:** keep the pg Pool for data; adopt `@supabase/ssr` `createServerClient` (current **`getAll`/`setAll`** cookie interface — the old `get`/`set`/`remove` is deprecated) only for admin *session* cookies. **Web deploys to Vercel** — use the official Supabase–Vercel integration (auto-syncs env vars incl. `SERVICE_ROLE_KEY`, auto-updates Auth redirect URIs for prod + preview deploys, and can create a preview DB branch per PR).

### Phased **pre-launch adoption** sequence (revised — see §10.1)

Because there are **no users**, the mobile app is **built but untested**, and nothing runs in the cloud yet, the original live-migration machinery is unnecessary: **no dual-issuer bridge, no user import, no UID→UUID backfill, no SCRYPT→bcrypt rehash, no zero-downtime bridge.** This is a direct greenfield cutover.

| Phase | What | Who |
|---|---|---|
| **0. Local Supabase + data plane** | `supabase start` (full stack in Docker, **$0**). Fix pipeline SSL + pooler + `search_path` (`pipeline.js`, `migrate.js`). Run the 220 migrations + load data into Supabase. Point web-admin `DATABASE_URL` at it. Validate the pipeline + admin run green. | Claude |
| **1. Auth — web admin** | Replace the 5 auth helpers + `middleware.ts` with Supabase (`getClaims` + `@supabase/ssr`); delete `firebase-admin.ts` + `instrumentation.ts` boot. Configure email + Google OAuth in the Supabase dashboard. **Direct cutover — no bridge** (no users to preserve). | Claude + you (OAuth dashboard) |
| **2. Auth — mobile (BEFORE test cycles)** | Swap the built RN-Firebase auth (~13 files) to `supabase-js` **now**, so your first real device tests validate the *Supabase* path instead of Firebase you'd discard. Remove `google-services.json` / `GoogleService-Info.plist`. | Claude + you (device smoke) |
| **3. Backups / crons / storage** | **PITR OFF.** Daily 7-day backups + nightly `db dump`. External scheduler (GitHub Actions) for pipeline chains; pg_cron for SQL maintenance. GCS → Supabase Storage (or retire `backup-db.js`). | Claude |
| **4. Deploy** | Web → **Vercel** + Supabase integration. Mobile → EAS build. Point the cloud Supabase project (**already created**) as prod; wire Vercel env vars. Launch on **Pro $25/mo, no PITR**. | Claude + you (Vercel/EAS/billing) |
| **5. Delete Google** | Remove `firebase`, `firebase-admin`, `@react-native-firebase/*`, `@google-cloud/storage`; add real FKs to `auth.users` (trivial — no data to reconcile). | Claude |

### 10.1 What the pre-launch status changes vs the live-migration plan
- **Supabase account:** already created → Phase 0 can target the cloud project directly, but develop against **local `supabase start`** first ($0) and promote schema to the cloud project.
- **No users:** the riskiest original items — user import, UID→UUID mapping, SCRYPT→bcrypt — are **all deleted**. Real FKs to `auth.users` can be added immediately (supersede ADR 006 outright).
- **Mobile built-but-untested:** swap auth to Supabase **before** spending test cycles, so you test the final stack once (not Firebase then Supabase). This is the main mobile work — an auth swap in existing code, not a from-scratch build.
- **Vercel for web:** the Supabase–Vercel integration replaces manual env/redirect wiring and gives per-PR preview DB branches to validate migrations.

---

## 11. Cost

**Pro ($25/mo) + Small compute ($15, also the PITR prerequisite) + PITR 7–14d (~$100–200/mo) + nightly external `db dump`.** 237K rows is small by *volume*; the cost driver is **PostGIS query CPU/RAM** (spatial joins on the pipeline) and PITR's Small-compute floor. Team ($599/mo) only if you need SOC2/ISO/SLA. *(Re-verify exact PITR pricing and the 2026 Data-API enforcement dates against supabase.com at implementation time — usage-based line items shift.)*

---

## 12. Consolidated gotcha register

1. Transaction pooler (6543) + `pg.Pool` prepared statements → use direct/session (5432) for the pipeline.
2. Direct connection is **IPv6-only by default** → verify pipeline-host IPv6 or use session pooler / IPv4 add-on.
3. **PostGIS install into `extensions`/`gis` schema; non-relocatable after install** — decide up front; fix `search_path`.
4. **Firebase SCRYPT ≠ Supabase bcrypt** → lazy re-hash-on-first-login.
5. Enabling PITR disables daily backups, needs ≥ Small compute; restore = full downtime; custom-role passwords not restored.
6. pg_net/pg_cron give **no retry/alert** and skip silently when the DB is unhealthy → external scheduler for must-succeed nightly chains + backups.
7. **Never expose service_role client-side.**
8. Data API auto-exposure ends (2026-05-30 default / 2026-10-30 enforced) → explicit grants + `api` schema now.
9. Vault INSERTs leak into statement logs → write via `service_role` RPC / logging off.
10. `detectSessionInUrl: false` mandatory on Expo/native.
11. Don't run two migration engines against one schema.
12. Pipeline SDK (`pipeline.js` `createPool`) sets no SSL — the top code fix.
13. UID→UUID backfill must precede any FK/RLS work (ADR 006 legacy: no FKs today).

---

## 13. Recommended next steps

1. **Update the operating-model guardrail** (`00_claude_code_operating_model.md` L329) to bless Supabase Auth — this is the architectural-approval gate.
2. **WF1 (Genesis)** for the two foundational new specs: **Supabase Infrastructure** (§4, pooling/extensions/env) and the **Spec 13 auth rewrite** (§2/§10). Author the RLS Policy catalog and pg_cron specs alongside.
3. **Execute Phase 0** (data plane) as a self-contained, reversible WF2 — highest value, lowest risk, unblocks everything and validates PostGIS + the SSL/pooler fixes against real Supabase before any auth work.
4. Sequence auth (Phases 1–4) and backups/crons/storage (independent) per §10.

*Implementation is a Cross-Domain WF1/WF2 effort (admin API + Expo client) requiring Domain Mode declaration, governing specs, and locked Active Tasks before any `src/` code — per CLAUDE.md.*

---

## 14. Platform preparation — connection status + extensions/wrappers/integrations (decided 2026-07-18)

### 14.1 Connection milestone — CONFIRMED
Supabase project `gcnatfpacuhsytcbaszi` is reachable and verified via a scratchpad connectivity test:
- **Direct connection over IPv6**, **PostgreSQL 17.6**, `postgres` role, DB empty (**0 public tables** — expected pre-migration).
- Extensions already present: `pg_stat_statements`, `pgcrypto`, `plpgsql`, **`supabase_vault 0.3.1`**, `uuid-ossp`. **PostGIS not yet installed.**
- **TLS:** verified TLS failed (`self-signed certificate in certificate chain` — normal for Supabase); unverified worked. → **WF1 must pin the Supabase CA cert** (`verify-full`); no `rejectUnauthorized:false` in production code.
- Creds live in gitignored **`.env`** as `SUPABASE_DATABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` (new-format keys). Existing local `DATABASE_URL` left untouched.
- **Version note:** target is PG17 while dev=PG15 / CI=PG16 → use version-aware `pg_dump`/`pg_restore` for the data load.

### 14.2 Extensions / wrappers / integrations — what to enable, defer, or skip

**Key principle: extension enablement flows through migrations, not ad-hoc dashboard toggles** (keeps local dev + cloud + preview branches identical; avoids drift).

| Item | Decision | Mechanism | Phase |
|---|---|---|---|
| **PostGIS** | ✅ Required | **Automatic** — migration `039` already `CREATE EXTENSION postgis` (into `public`, matching current Cloud SQL) | 0 (migrate.js) |
| **pg_trgm** | ✅ Required | Automatic — migration `053` | 0 |
| **fuzzystrmatch** | ✅ Required | Automatic — migration `170` | 0 |
| **pg_cron** | ✅ (in-DB SQL maintenance) | **New tracked migration** | WF1 |
| **pg_net** | ✅ (DB webhooks / pg_cron→HTTP) | **New tracked migration** | WF1 |
| **Stripe Sync Engine** | ❌ **Skip** — working webhook flow already (`stripe_webhook_events`); no pre-launch payoff | — | (revisit post-launch only for SQL access to Stripe) |
| **Firebase Wrapper (FDW)** | ❌ **Skip** — zero users, Firestore near-empty; nothing to pull | — | never |
| **Database Webhooks** | 🟡 Per-feature decision (e.g. notifications), not a platform prereq | pg_net + row triggers | later, per feature |
| **Vercel** | ✅ web host, but **defer** — connecting now would auto-deploy the still-Firebase-coupled app | GitHub→Vercel + Supabase–Vercel integration | 4 (deploy) |
| **Auth providers (email + Google)** | ✅ but **defer** — meaningless until the auth swap; needs your Google OAuth client ID/secret | Dashboard | 1 (auth) |

**PostGIS schema decision:** install into **`public`** to match the existing 220 migrations and current Cloud SQL layout (the migrations' `ST_*` calls assume `public`). The `extensions`/`gis`-schema best practice would require rewriting migrations for marginal security gain — **not worth it for a lift-and-shift**. (This overrides gotcha #3 for *this* migration; document the rationale in the infra spec.)

---

## 15. WF1 outline & draft Active Task (foundation)

**WF1 objective:** author the foundational Supabase specs + update the operating-model guardrail, then lock the Active Task for Phase 0.
**Domain Mode:** **Backend/Pipeline** (Phase 0 touches `scripts/`, `migrations/`, `src/lib/db/`) — read `scripts/CLAUDE.md` + `docs/specs/00_engineering_standards.md` before generating the task. (Auth work later is Cross-Domain.)

**Specs WF1 authors / updates (per §1):**
1. **NEW** `00-architecture/<supabase_infrastructure>.md` — pooling (pipeline → session/direct **5432**; Vercel serverless app → transaction **6543**), extensions policy (§14.2), **PostGIS in `public`** + `search_path`, **CA-pinned TLS**, env-var contract, Data API posture (explicit grants), Vault usage, backup (PITR-off + nightly dump), pg_cron scheduling.
2. **UPDATE** `00_claude_code_operating_model.md` L329 — bless Supabase Auth (this migration is the architectural approval it requires).
3. *(sequenced after)* Spec 13 auth rewrite, RLS policy catalog, pg_cron spec, ADR 006 supersession.

### Draft Active Task (Master Template)

```markdown
# Active Task: Supabase Phase 0 — Data Plane & Connection Foundation
**Status:** Planning
**Domain Mode:** Backend/Pipeline

## Context
* **Goal:** Stand up Supabase as the Postgres host (local-first via `supabase start`),
  with the pipeline connecting over CA-pinned TLS on the correct pooler, the 220
  migrations applied, data loaded, and pipeline + admin validated green. No auth changes.
* **Target Spec:** docs/specs/00-architecture/<supabase_infrastructure>.md (authored in this WF1)
* **Key Files:** scripts/lib/pipeline.js (createPool SSL), scripts/migrate.js (SSL),
  src/lib/db/client.ts (CA pinning), migrations/<new>_enable_pg_cron_pg_net.sql,
  supabase/config.toml (new), .env

## Technical Implementation
* **New/Modified:** pipeline.js `createPool` (CA-pinned ssl), migrate.js (ssl),
  client.ts (harden prod ssl to verify-full), new migration enabling pg_cron + pg_net,
  supabase CLI local config, PG_* Supabase env contract.
* **Database Impact:** YES — full schema build (220 migrations) + data load into Supabase;
  new migration enabling pg_cron/pg_net. Version-aware dump/restore (PG15/16 → PG17).

## Standards Compliance
* **Try-Catch Boundary:** pool connection + migration error handling; logError on failure.
* **Unhappy Path Tests:** TLS-verify failure, wrong-pooler (transaction mode) advisory-lock
  failure, missing/empty PG_* env, search_path missing extensions schema.
* **logError Mandate:** yes — all new catch blocks use logError(tag, err, context).
* **UI Layout:** N/A.

## Execution Plan
- [ ] Author Supabase Infrastructure spec + update operating-model L329 (WF1 gate)
- [ ] Add supabase/ CLI config; bring up local stack (`supabase start`)
- [ ] Download Supabase CA cert; wire verify-full CA-pinned SSL into pipeline.js / migrate.js / client.ts
- [ ] Set pooler routing (pipeline → session/direct 5432); document app → 6543 for Phase 4
- [ ] Add Supabase PG_* env + verify search_path resolves postgis/pg_trgm/fuzzystrmatch
- [ ] Run migrate.js against local Supabase → 220 migrations green (extensions auto-install into public)
- [ ] New migration: enable pg_cron + pg_net
- [ ] Load data (version-aware pg_dump → pg_restore, or COPY per table); verify row counts (permits ~237K, footprints ~428K)
- [ ] Run permits/coa chain + admin dashboards against Supabase → validate green
- [ ] Multi-agent OUTPUT review: Backend/Pipeline 5-panel + Regression Guardian + Reality-Check (parcel sanity on Supabase data)
```

> **PLAN LOCK gate:** on WF1 kickoff, the plan is presented and halted for authorization before any `src/` code, per CLAUDE.md Execution Order Constraint.
