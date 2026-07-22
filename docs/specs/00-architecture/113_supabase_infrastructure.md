# Spec 113 — Supabase Infrastructure

**Status:** ACTIVE
**SPEC LINK:** `docs/specs/00-architecture/113_supabase_infrastructure.md`

<requirements>
## 1. Goal & Scope

Buildo is migrating its data plane and platform services off Google (Cloud SQL, GCS, Cloud
Scheduler) onto Supabase (managed PostgreSQL/PostGIS, GoTrue Auth, Storage, pg_cron/Vault),
per the authorized 2026-07-18 program plan (`.cursor/active_task.md`, v2.1). This spec is the
**keystone infrastructure spec**: it is the single normative source for how Buildo connects to,
authenticates against, secures, schedules on, backs up, and extends its Supabase Postgres host.
It does not define application-level auth logic (Spec 13), RLS policy content (the RLS Policy
Catalog spec, Phase S4), or backup *script* behavior in detail (Spec 112 rewrite) — those specs
depend on the rules established here.

Every rule below is either a **Decision D<n> (2026-07-18 program plan)** — binding, not
re-litigated by this spec — or a **Ground truth G<n>** fact the program plan verified against
the live system. Where this spec adds operational detail beyond what D<n>/G<n> state outright,
that detail is presented as the normative encoding of the decision, not a new decision.
</requirements>

---

<architecture>
## 2. Project Topology

Buildo runs on **two Supabase project instances**, used at different phases of the migration
program (Phase references are to `.cursor/active_task.md` §Execution Plan):

| Instance | Identity | Used by | Phase |
|---|---|---|---|
| **Local stack** | `supabase start` (Docker Compose stack: Postgres, GoTrue, PostgREST, Storage, Studio) | All Backend/Pipeline development, `migrate.js` schema builds, chain validation, local admin dev | Phase 0 (0.1–0.6), then permanently for local dev after cutover (Phase 0.8) |
| **Cloud project** `gcnatfpacuhsytcbaszi` | Supabase-hosted, PG17.6, connection-verified 2026-07-18 (IPv6 direct, Vault 0.3.1, PostGIS not yet installed at verification time) | Schema promotion target (0.7), production data + auth + deploy target (Phase 4+) | Phase 0.7 onward |

The local stack and the cloud project are **schema-identical but not data-identical during
Phases 0–3** — see §12 for the coexistence and cutover rules governing when each is
authoritative. There is no third (staging/preview) Supabase project: **DB-branch-per-PR was
evaluated and dropped** (Decision D12 — Supabase branching requires timestamp-named
`supabase/migrations/` files, incompatible with `migrate.js`'s `migrations/NNN_*.sql`
convention; running two migration engines against one schema is forbidden, §7).

Web (Next.js admin) deploys to **Vercel**, not Supabase — Supabase hosts only the Postgres
project + auth + storage. Mobile (Expo) never opens a direct Postgres connection; it talks to
the Next.js API gateway and to Supabase Auth/Storage directly via `supabase-js`.
</architecture>

---

<architecture>
## 3. Environment & Key Contract (Decision D14)

**No environment reads an ambiguous, single `SUPABASE_DATABASE_URL`-style variable across
contexts.** Each environment has its own named variables; the table below is the contract every
script/config MUST follow. Introducing a new connection surface without adding a row here is a
spec violation.

| Environment | DB connection var | Public/anon key var(s) | Secret key var | Provisioned by | Read by |
|---|---|---|---|---|---|
| **Local stack** (`supabase start`) | `DATABASE_URL` — ephemeral, CLI-printed (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) | `NEXT_PUBLIC_SUPABASE_URL` (`http://127.0.0.1:54321`) + CLI-generated demo anon key | CLI-generated demo `service_role` key (safe only because it never leaves localhost — MUST NOT be reused for any non-local project) | `supabase start` / `supabase status` | `.env.local` (gitignored, developer-managed); pipeline scripts during Phase 0 local dev |
| **Cloud project** `gcnatfpacuhsytcbaszi` (dev use pre-launch, then production) | `SUPABASE_DATABASE_URL` (`.env`, gitignored) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) | `SUPABASE_SECRET_KEY` (`sb_secret_...`) | Supabase dashboard → API settings, pasted into `.env` by operator | `scripts/lib/pipeline.js`, `scripts/migrate.js`, `scripts/validation/run-step.mjs`, `src/lib/db/client.ts`, `src/lib/supabase/` server factory |
| **Vercel** (prod + preview deploys) | **`POSTGRES_URL`** (transaction-pooler **6543**, §5) for app runtime + **`POSTGRES_URL_NON_POOLING`** (direct/session **5432**, §5) for migration/tooling — both auto-injected by the Supabase–Vercel integration. The app's raw-`pg` pool reads `POSTGRES_URL` via the `src/lib/db/client.ts` alias `env.POSTGRES_URL?.trim() || env.DATABASE_URL?.trim() || undefined` (OD-A; empty/whitespace values fall through — P4-F0 fold C3, `resolveRuntimeConnectionString` at `client.ts:52-56`; do NOT reintroduce `??`, whose empty-string shadowing is the exact bug C3 fixed). **The integration does NOT inject `DATABASE_URL`** — the prior spec text naming `DATABASE_URL` in this cell was factually wrong (corrected P4 fold 2026-07-21). | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — auto-synced | `SUPABASE_SECRET_KEY` — auto-synced, **server-only Vercel env, never `NEXT_PUBLIC_*`** | Supabase–Vercel integration (Phase 4.1) | Next.js server code only (API routes, server components, `src/lib/supabase/` server factory) |
| **EAS build profiles** (mobile) | n/a — mobile never opens a raw DB connection | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **NEVER present in any mobile build profile or bundle** — the secret key is root-equivalent and Expo bundles are fully extractable | `eas.json` per-profile `env` blocks (development/preview/production) | `mobile/src/lib/supabase.ts` client factory only |

**Rule:** a secret key (`sb_secret_*`, `service_role`, or the local CLI's `service_role` demo
key) MUST NEVER appear in a `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variable, in client bundle code,
or in any variable read outside `src/lib/db/`, `src/lib/supabase/` server factory, or
`scripts/`. The new `sb_secret_*` key format is gateway-rejected from browser origins, but this
MUST NOT be relied upon as the control — the naming/placement rule above is the control.

### 3.1 Retired Firebase variables

The 6 `NEXT_PUBLIC_FIREBASE_*` vars read by `src/lib/auth/config.ts` (`API_KEY`,
`AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`) are retired in
Phase 5.1. They do not map 1:1 onto Supabase equivalents:

| Retired var | Disposition |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Replaced by `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | No replacement — Supabase Auth is same-project; `NEXT_PUBLIC_SUPABASE_URL` is the only host needed |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | No replacement — the project ref is embedded in `NEXT_PUBLIC_SUPABASE_URL`'s host |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | No replacement — Supabase Storage bucket names are referenced per-call, not a global env var |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Retired outright — push is 100% Expo push (G6), unrelated to Supabase or FCM sender IDs |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Retired outright, no Supabase equivalent |

`auth/config.ts` also boots Firestore — deleted, not ported (Firestore has no Supabase
equivalent and G3/G2 already establish it as dead weight).

### 3.2 Non-injected Vercel environment variables (operator-set — added P4 fold 2026-07-21)

The Supabase–Vercel integration injects ONLY the Postgres/Supabase connection surface (§3 Vercel
row). Every other secret the deployed app depends on is **operator-set in the Vercel dashboard
per environment** — the integration does not provide them, so a build can go green with any of
these silently absent/inert. `scripts/verify-vercel-env.js` (Phase 4.1) MUST assert their
presence (and DEV_MODE's absence) across production+preview+development so prod cannot ship with
MFA off, Stripe webhooks dead, or DEV_MODE auth-bypass live.

| Var | Injected by integration? | Purpose | Prod requirement |
|---|---|---|---|
| `ADMIN_MFA_ENFORCED` | No — operator-set | Spec 13 gate that forces TOTP MFA enrollment/challenge on admin auth; inert/false = admins can sign in without a second factor | MUST be present and `=true` in prod |
| `STRIPE_SECRET_KEY` | No — operator-set | Server-side Stripe API key for payment/subscription operations | MUST be present (server-only, never `NEXT_PUBLIC_*`) |
| `STRIPE_WEBHOOK_SECRET` | No — operator-set | Verifies Stripe webhook signatures; absent = webhook handler cannot authenticate events (silently dead billing) | MUST be present (server-only) |
| `RESEND_API_KEY` | No — operator-set | Transactional email via Resend; also backs Supabase Auth SMTP (`smtp.resend.com`, §Phase 4.1e) for recovery/confirmation links | MUST be present |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | No — operator-set | Error/exception monitoring (server DSN + client-visible DSN); absent = production errors go unobserved | SHOULD be present; `verify-vercel-env.js` enforces stricter-than-SHOULD: hard-fail on **production**, WARN on preview/development (P4-F0 fold C4). `NEXT_PUBLIC_SENTRY_DSN` is a known-public value (allowlisted, §verify-vercel-env) |
| `CRON_SECRET` | No — operator-set | Guards any HTTP-triggered cron/trigger surface, compared constant-time (§8.1); absent = an unauthenticated trigger endpoint | MUST be present (server-only) |
| `DEV_MODE` | No — operator-set | Local/dev auth-bypass + relaxed-guard flag; if truthy in prod the app runs with development auth posture | MUST be **absent or false** in prod — `verify-vercel-env.js` asserts absence |

The three `NEXT_PUBLIC_*`-eligible values here (`NEXT_PUBLIC_SENTRY_DSN`) plus the Supabase
publishable key and URL are the **only** values permitted to appear in a `NEXT_PUBLIC_*`/
`EXPO_PUBLIC_*` var — §verify-vercel-env's negative check is an allowlist: any OTHER value in a
public-prefixed var (especially a `postgres://`/DB-password shape, a legacy `eyJ…` service-role
JWT, or an `sb_secret_*` key) is a leak finding.
</architecture>

---

<architecture>
## 4. TLS (Decision D2)

All Postgres connections outside the local stack MUST use CA-pinned `verify-full` TLS.
**`ssl: { rejectUnauthorized: false }` is BANNED repo-wide** — this is the exact weak setting
`src/lib/db/client.ts` ships in production today (G4) and is the thing this migration hardens,
not a pattern to extend into the pipeline pools.

### 4.1 Shared helper

`scripts/lib/ssl-config.js` (new) is the **only** place an SSL config object is constructed
for `scripts/`-side code: `scripts/lib/pipeline.js` (`createPool`), `scripts/migrate.js`, and
`scripts/validation/run-step.mjs` MUST import it rather than construct their own `ssl` key.
**Recorded exception (Round-3 truth-up):** `src/lib/db/client.ts` imports the ADR-001 TS twin
`src/lib/db/ssl-config.ts` — a second, manually-synced constructor with identical logic (same
LOOPBACK_HOSTS, same fail-fast branches; the sync obligation is documented in both files'
headers). Any new Postgres pool anywhere in the codebase MUST go through the helper for its
side (§0.2b pool sweep) or carry an explicit `// LOCAL-ONLY` annotation for
hardcoded-localhost diagnostic scripts.

### 4.2 Environment-aware behavior

- **Local `supabase start` + CI containers:** local no-TLS / own-cert mode — the local stack's
  Postgres does not present the Supabase production CA. Detected via the target host (loopback)
  or an explicit local-mode flag, not inferred from `NODE_ENV` alone.
- **Cloud (any Supabase project):** `verify-full`, CA pinned via `SUPABASE_CA_CERT_PATH` (env
  var pointing at the downloaded CA PEM). Verified-but-unpinned TLS fails against Supabase by
  design (`self-signed certificate in certificate chain` — confirmed 2026-07-18 connectivity
  test, G-prerequisite); pinning the actual Supabase CA is mandatory, not optional hardening.

### 4.3 CA rotation runbook

The CA cert is fetchable from the Supabase dashboard or API at any time. `ai-env-check.mjs`
MUST include a certificate-expiry check against the file at `SUPABASE_CA_CERT_PATH` and fail
(or WARN inside a defined lead window) before the pinned cert expires. Rotation procedure:
re-download from the dashboard, overwrite the file at `SUPABASE_CA_CERT_PATH`, re-run
`ai-env-check.mjs` to confirm the new expiry, commit the updated cert path/file per the
project's secrets-handling convention (the cert itself is public, not a secret, but its path is
part of the environment contract in §3).

### 4.4 CI TLS-required test

CI runs a **dedicated container test exercising `ssl-config.js`'s `verify-full` path** against
a self-signed/CA-issued test certificate — not only the local no-TLS mode. This is a Round-2
panel fold (D2): local-mode coverage alone would never exercise the CA-pinning code path that
production actually depends on.
</architecture>

---

<architecture>
## 5. Connection Routing & Pooling (Decision D3 + Ground truth G7)

| Surface | Port / mode | Why |
|---|---|---|
| Pipeline scripts, `migrate.js`, seeds | **Direct connection (IPv6)** or **session-mode pooler, port 5432** | Advisory locks (`pg_advisory_xact_lock`, Spec 47 §R6), `pg-query-stream` cursors, prepared statements, and minutes-long transactions all depend on session state that a transaction-mode pooler does not preserve. Routing any of these through 6543 is a routing bug, not a performance question. |
| Vercel serverless (Next.js API routes) | **Transaction pooler, port 6543**, with a **pinned low pool `max`** | Short, stateless per-request queries. A high per-instance pool `max` compounds badly under Fluid Compute's elastic concurrency (§13). |

**Supavisor session-mode fact (G7):** session mode is available **only on port 5432 on the
pooler host** — port 6543 has been transaction-mode-only since 2025-02-28. There is no way to
get session-mode semantics on 6543; any script needing session state MUST target 5432 (direct
or session pooler), full stop.

**IPv6 fact:** Supabase's direct connection (non-pooled, 5432 on the project host) is
**IPv6-only by default**. A pipeline host without IPv6 egress cannot reach it and MUST fall back
to the session-mode pooler (also 5432, on the pooler host) or provision the IPv4 add-on.

**Fluid Compute open bug + monitoring stance (G7):** Vercel Fluid Compute's elastic concurrency
model can grow Supavisor client-connection counts under load — an open platform-level issue, not
a Buildo bug. Mitigation: the pinned low pool `max` above, plus a **Phase 4.4 post-launch
monitoring window** watching Supavisor's client-connection count. The specific alert threshold
is set at Phase 4.4 implementation time against observed production connection patterns — this
spec establishes the requirement (a monitored, alerting threshold MUST exist before Phase 4.4 is
considered closed) without pre-committing a number that would be a guess today.
</architecture>

---

<architecture>
## 6. Extensions (Decision D4)

| Extension | Schema | Mechanism | Migration |
|---|---|---|---|
| `postgis` | **`public`** | Automatic via `migrate.js` | `039` |
| `pg_trgm` | `public` | Automatic | `053` |
| `fuzzystrmatch` | `public` | Automatic | `170` |
| `pg_cron` | extension default | **New tracked migration** | Phase 0.4 |
| `pg_net` | extension default | **New tracked migration** | Phase 0.4 |

`pg_stat_statements`, `pgcrypto`, `uuid-ossp` are pre-enabled on the cloud project
(confirmed 2026-07-18 connectivity check) and require no migration.

**PostGIS-into-`public` rationale (Decision D4 — overrides the generic `extensions`/`gis`-schema
best practice for this migration specifically):** PostGIS is non-relocatable after install, and
all 220 existing migrations issue unqualified `ST_*` calls assuming `public`. Rewriting 220
migrations to install into a dedicated schema for a marginal security gain is not worth it for a
lift-and-shift. This is a deliberate, documented exception — do not "fix" it in a later cleanup
without re-opening this decision.

**Version pinning:** the PostGIS/GEOS version is **pinned** and MUST be recorded via
`postgis_full_version()` on **both sides** of any data load (source and target) — see §13
(GEOS-version geometry drift) for why a version mismatch is a correctness risk, not cosmetic.

**`search_path` smoke query** (run as part of Phase 0.3's full 220-migration replay, not a
separate step):

```sql
SELECT ST_AsText(ST_MakePoint(1,2)), similarity('a','a'), soundex('test');
```

A failure here means `search_path` does not resolve one of `postgis`/`pg_trgm`/`fuzzystrmatch`
on the target — Phase 0.3 IS the PG17-compatibility test this query gates.
</architecture>

---

<architecture>
## 7. Migration Engine (Decision D5)

`scripts/migrate.js` is the **only** schema authority for every Buildo Postgres instance — local
stack, cloud project, and (historically) Cloud SQL. It tracks applied migrations via
`schema_migrations` checksums, is forward-only, and runs unmodified against Supabase.

**The Supabase CLI's schema-mutating commands are FORBIDDEN against any Buildo-managed schema:**
`supabase db push`, `supabase db reset`, `supabase db remote commit`. The Supabase CLI's role is
limited to **local stack lifecycle only** (`supabase start`/`stop`/`status`) — never schema
authorship or synchronization.

**Guard:** `ai-env-check.mjs` and the pre-commit hook MUST fail if `supabase/migrations/`
contains any files. Its presence is a leading indicator of CLI-driven schema drift bypassing
`migrate.js` — the guard fires on the file's mere existence, not on its content, because by the
time content exists the drift has already happened.

**Deferred hardening (recorded, not built in this program):** a dedicated `migration_runner`
Postgres role holding DDL privileges, with day-to-day application/developer roles restricted to
DML only. This is a post-launch hardening item — deferred while solo-dev, per Decision D5's
explicit scope note. Do not build it as part of this cutover.
</architecture>

---

<architecture>
## 8. Scheduling (Decision D8 + Ground truth G8)

### 8.1 Compute backend

**Nightly/must-succeed pipeline chains run on the GitHub Actions runner, executing
`scripts/run-chain.js` directly** against Supabase — not inside a Vercel function. GitHub
Actions jobs allow up to 6 hours; Buildo's chains run up to ~90 minutes with headroom to spare.
Vercel serverless functions cap at 800s (Fluid Compute GA) / 1800s (beta) — insufficient for a
90-minute chain regardless of plan tier, and hosting a long chain inside a request-scoped
function is architecturally unsound independent of the cap. **No pipeline chain may run inside a
Vercel API route.**

Any HTTP-triggered surface that does exist (e.g., a manually invoked trigger endpoint) MUST be
guarded by `CRON_SECRET`, stored in Vault, compared with a constant-time comparison — never a
plain `===` check.

### 8.2 Network Restrictions vs. GitHub-hosted runner IPs

GitHub-hosted runners do not have static IPs, which is in tension with Supabase Network
Restrictions (an IP-allowlist feature). Three options were identified:

1. **Allowlist GitHub's published Actions IP ranges** — these ranges rotate; requires either a
   periodic sync job to keep the allowlist current or accepting rotation lag as a risk.
2. **Self-hosted runner** with a static IP, allowlisted once — removes rotation risk, adds
   runner-host maintenance burden (solo-dev cost).
3. **Leave Network Restrictions off; rely on strong auth alone** — CA-pinned TLS (§4) + a
   narrow-scope, Vault-stored credential treated as fully sensitive. An accepted risk model for
   a solo-dev, pre-launch project.

**RESOLVED 2026-07-20 (Phase 3.2 operator ruling — mandated amendment) — option 3 chosen:**
Network Restrictions stay OFF; security rests on CA-pinned `verify-full` TLS (§4) plus the
`SUPABASE_DATABASE_URL` credential treated as fully sensitive (GitHub encrypted secret, never
logged — Spec 115 §3). This applies to **every** GitHub Actions workflow in the scheduling
migration, **including `deep_scrapes`** (Spec 115 §2.4) — the one workflow whose runner choice
was genuinely contested, because its WAF-sensitive scraping traffic is the exact class of
concern a self-hosted runner's static IP might otherwise argue for.

`deep_scrapes` is GitHub-hosted for the same option-3 reasoning, reinforced by two
scraping-specific facts: the Decodo residential proxy carries ALL of `aic-orchestrator.py`'s
AIC traffic, so the runner's own datacenter IP is never WAF-visible to AIC in the first place —
removing the strongest argument for a self-hosted runner's static, reputation-managed IP; and
the proxy-forced headed-Chrome requirement is handled mechanically via `xvfb-run` on the
GitHub-hosted Linux runner, with `actions/cache` persisting `~/.buildo-scraper/` stealth
profiles between runs to approximate the profile continuity a persistent self-hosted box would
give for free. Decodo proxy credentials join `SUPABASE_DATABASE_URL` in GitHub encrypted
secrets per §11's CI-runner carve-out.

**Operator's decisive factor (2026-07-20):** a self-hosted runner on the operator's own
machine would mean headed Chrome windows opening multiple times per weekday business-hours
day (Spec 115 §2's `0 15,18,21 * * 1-5` cadence) — disrupting the local workday every run.
With the proxy already neutralizing the WAF-visibility argument for self-hosting, there was no
remaining reason to accept that disruption. Gemini's standing objection (self-hosted runners
on a public repo carry fork-PR code-execution risk per GitHub's own guidance, so GitHub-hosted
+ proxy is "the solvable engineering problem" rather than the risk to accept) is satisfied by
this ruling — the self-hosted-public-repo risk it warned against never materializes, because
no self-hosted runner is used anywhere in this migration.

### 8.3 `isChainRunning` concurrency semantics

Concurrency is enforced by a **DB-row check against `pipeline_runs`** written by
`run-chain.js` — **not** an advisory lock or OS-level lock. A run is "in progress" if a row
exists with `status = 'running' AND started_at > NOW() - INTERVAL '12 hours'`. Any scheduler
replacement (including the GitHub Actions migration) MUST re-implement this **exact query** —
substituting a different concurrency primitive silently changes the correctness guarantee.

The 12-hour TTL means a crashed run **self-expires** without manual intervention — a stale
`running` row older than 12 hours stops blocking new runs on its own. On top of that
self-expiry (Round-2 fold, D8): a **stale-`running`-row alert** MUST fire when a row crosses the
TTL boundary still marked `running` (an operator-visibility gap even though it's
correctness-harmless), and `run-chain.js` MUST set an explicit terminal status on abnormal exit
rather than leaving a `running` row to be discovered only by the alert.

### 8.4 pg_cron scope

`pg_cron` is scoped to **in-DB SQL maintenance only**: matview refresh
(`034_mv_monthly_permit_stats`), VACUUM/cleanup jobs, and the deferred 30-day
account-deletion sweep (Spec 97 — never built, so this is net-new with zero regression risk).
`pg_cron`/`pg_net` give **no retry and no alert**, and silently skip execution when the database
is unhealthy. **A must-succeed job (any of the `permits`/`coa`/`sources`/`entities`/
`deep_scrapes` chains, `backup_db`) MUST NEVER be scheduled via `pg_cron`** — must-succeed jobs
are GitHub-Actions-only (§8.1).

**AMENDED 2026-07-20 — `deep_scrapes` explicitly joins the never-pg_cron set,** argued rather
than merely asserted: `pg_cron` executes SQL inside the Postgres backend process — it has no
mechanism to spawn or supervise an external Python process at all, let alone one that drives a
proxy-routed, `xvfb`-hosted, headed-Chrome browser session (`aic-orchestrator.py`, Spec 115
§2.4). This is a **structural incapability**, not a policy choice weighed against
`permits`/`coa`/`sources`/`entities` (which at least COULD theoretically run as `pg_net`-invoked
HTTP triggers, however inadvisable) — `pg_cron` cannot run `deep_scrapes` under any
configuration, so its must-succeed classification above is a belt-and-suspenders restatement
of an impossibility, not the load-bearing reason `deep_scrapes` is GitHub-Actions-only.

### 8.5 `pipeline_schedules` wiring

`pipeline_schedules.cron_expression` is currently **decorative, not inert** (G8): read by 2
admin routes and `DataQualityDashboard.tsx` for display, but never written with real values and
never consulted by any scheduler. Phase 3.2 MUST wire it to reflect the actual GitHub Actions
cron schedules — writing real values, closing the decorative gap rather than leaving it
half-true.
</architecture>

---

<architecture>
## 9. Backups (Decision D9)

**PITR is OFF at launch.** This is an explicit human decision recorded at program
authorization (2026-07-18) — not a default arrived at by omission. Rationale: zero users at
cutover means no catastrophic-loss blast radius yet; daily 7-day managed backups plus a nightly
off-Supabase logical dump cover the realistic recovery need at this stage. **Standing
objection on record:** the Gemini adversarial review rated PITR-off CRITICAL for RTO; the
operator's explicit ruling stands regardless. **Revisit trigger: first paying user** — not a
calendar date, not "before launch." Whoever re-opens this decision MUST update this section
when PITR is turned on.

### 9.1 Two layers

- **Layer 1 (managed):** Supabase's built-in daily backups, 7-day retention (included at the
  Pro tier, no PITR add-on).
- **Layer 2 (portable):** nightly `supabase db dump` to **off-Supabase** storage — provider
  independence (meaningful, having just left one provider), table-level restore, and a format
  restorable to any PostgreSQL instance, not just Supabase.

### 9.2 Restore tooling requirement

Restore tooling MUST use `pg_restore --single-transaction --exit-on-error`, or, where that
combination is not viable for a given restore path, a **stderr-gated wrapper** that treats any
stderr output as failure rather than assuming partial success is success. This tooling does not
exist yet in the codebase (identified gap) and MUST be built as part of the Phase 0.5/4.0 gates,
not assumed to already work.

### 9.3 OP4 re-homing

Spec 07 §OP4 ("backup within 25h", a manual checklist item, not code) is updated to describe the
Supabase-hosted flow. `backup_db` remains the final step of `chains.permits`
(`scripts/manifest.json` L90) — the trigger mechanism does not change, only what it backs up
and where the dump lands.
</architecture>

---

<architecture>
## 10. Data API (Decision D10)

**The Data API (PostgREST) is DISABLED** on both the local stack and the cloud project. Nothing
in the current architecture needs it through Phase 5 (Philosophy A, Decision D1: Next.js is the
single API gateway; `supabase-js` is for auth only; the pipeline and admin keep raw `pg`).

**Verification method (S2 correction, P4-F0 fold 2026-07-22 — proven live):** an UNKEYED curl
of the REST endpoint (`curl -i https://<project>.supabase.co/rest/v1/`) **cannot distinguish
enabled from disabled** — the API gateway rejects a key-less request identically (401) either
way, so the originally-prescribed unkeyed-curl check is unsound. The sound verification is
BOTH of:
1. the dashboard toggle observed OFF (Project Settings → Data API), AND
2. a **KEYED probe** — the same curl carrying a valid publishable/anon key
   (`-H "apikey: <publishable-key>"`): a DISABLED Data API returns a no-schema response —
   the observed status code varies by gateway path (503 observed 2026-07-22 morning; 401
   `"Secret API key required"` observed same day by a later re-probe) — while an ENABLED one
   returns PostgREST's OpenAPI/schema response. **The discriminator is the ABSENCE of a
   PostgREST schema payload, not a specific status code** — do not pin an expected code.

Local-stack disable+verify is **Phase 0.6b**;
cloud disable+verify is **Phase 0.7** (the cloud project has no schema to expose before then, so
verifying earlier would be meaningless). Network Restrictions (§8.2) gate Postgres connections
only — they do **not** gate the Data API's HTTPS surface, so disabling the Data API is a
separate, required control, not redundant with network restrictions.

**Future re-enable model (documented now for whenever this changes, not built now):**
explicit-grant + a dedicated `api` schema — no table is exposed by default; each exposed
view/table is deliberately `GRANT`-ed into `api`. This gets ahead of Supabase's own enforcement
timeline: auto-exposure is already off-by-default for new projects since 2026-05-30 and is
enforced platform-wide 2026-10-30. Buildo is compliant by having the Data API fully disabled;
this model is the posture to adopt if it's ever turned back on, not a migration step.
</architecture>

---

<architecture>
## 11. Vault & Secrets Management

Pipeline secrets (third-party API keys, credentials consumed by `scripts/`) live in **Supabase
Vault**, not plaintext columns. Access is via a **`service_role`-restricted RPC function** —
never a raw `INSERT`/`UPDATE` against a Vault-backed table from application or pipeline code.

**Statement logging:** the write path MUST run with statement logging disabled (or the written
value redacted from the log record) — a raw `INSERT` of a secret value logs the plaintext into
Postgres statement logs if `log_statement` is enabled anywhere in the connection path, which
defeats the purpose of using Vault at all (see §13, Vault statement-log leak).

**Access scope:** only `service_role` (server-side pipeline/admin environments) may invoke the
RPC. `anon`/`authenticated` roles have no path to Vault-backed secrets, directly or via the RPC.
Concretely: the write-RPC migration includes an explicit `REVOKE EXECUTE ... FROM anon,
authenticated, public` alongside `GRANT EXECUTE ... TO service_role` — the access-scope rule
above is enforced at the grant level, not left as a convention the RPC's `SECURITY DEFINER`
body alone is trusted to honor.

**AMENDED 2026-07-20 — CI-runner credential carve-out (Spec 115 / Phase 3.2).** The rule above
governs **pipeline secrets accessed at runtime by application/pipeline code** (third-party API
keys, credentials `scripts/` reads while running). It does **not** extend to the credentials a
GitHub Actions **workflow-execution environment** itself needs merely to start running:
`SUPABASE_DATABASE_URL` (the Postgres connection string every chain workflow needs before it
can even query Vault) and the Decodo residential-proxy credentials `deep_scrapes` needs to route
its scraping traffic (Spec 115 §2.4). These live in **GitHub encrypted secrets**, injected into
the workflow's `env:` block (Spec 115 §3) — Vault has no mechanism to hand a secret to a
workflow that hasn't connected to the database yet, so this class of credential is structurally
outside Vault's reach regardless of policy preference. **Vault remains the DB-side secret
store** for everything a *running* script subsequently needs once it has its DB connection —
this carve-out narrows to exactly the bootstrap credentials, not a general escape hatch for
pipeline secrets that could otherwise live in Vault.
</architecture>

---

<architecture>
## 12. Dev-Workflow Coexistence & Cutover (Decision D13)

During Phases 0–3, **Docker `buildo_pgdata` remains the authoritative dev database for schema
AND data.** All non-migration WF work (feature work unrelated to this migration) continues
running against it; pipeline chains keep mutating it. This is a deliberate coexistence window,
not a background inconsistency to tolerate.

**Rules during coexistence:**
- Every migration authored during Phases 0–3 MUST be replayed to **both** Docker
  `buildo_pgdata` and local Supabase before being considered landed.
- `ai-env-check.mjs` runs `migrate.js --verify` against **both** instances during this window —
  drift between them is an **automated failure**, not a process-discipline reminder left to the
  developer to remember.
- The 0.5 data load into local Supabase is schema-plus-data at that moment, but Docker keeps
  mutating afterward (chains run against it during 0.6–0.7) — so the data load is **re-run
  fresh from Docker immediately before cutover** (Phase 0.8), not assumed still current.
- CI **stays on ephemeral `postgis/postgis:16-3.4-alpine` containers** throughout and after this
  window. These are **schema-fidelity tests** (do migrations apply, do constraints hold) — they
  are explicitly **not** Supabase-integration tests, and are not expected to catch
  Supabase-specific behavior. `ssl-config.js`'s local no-TLS mode covers them, plus the one
  dedicated TLS-required container test (§4.4).

**Cutover moment:** Phase 0.8 PASS (full G10 data-integrity gate suite green against the
freshly re-loaded local Supabase instance) flips the canonical dev `.env` `DATABASE_URL` to
local Supabase. `docker-compose.yml` / `buildo_pgdata` are kept as an **offline emergency
restore target** through Phase 5.2, then decommissioned in the final documentation sweep — they
are not deleted at cutover, only demoted from "authoritative" to "cold spare."
</architecture>

---

<failure_modes>
## 13. Known Failure Modes

- **Transaction-pooler advisory-lock failure** — routing pipeline/migration work through port
  6543 loses session state; `pg_advisory_xact_lock` and `pg-query-stream` cursors break, often
  silently or with an opaque error rather than an obvious one. Guard: §5 routing table is
  normative, not advisory — a pool built for pipeline use MUST target 5432 (direct or session
  pooler), never 6543.
- **IPv6-only direct connection** — Supabase's direct (non-pooled) connection is IPv6-only by
  default; a pipeline host without IPv6 egress silently cannot reach it. Guard: verify host
  IPv6 connectivity before depending on direct mode, or route through the session-mode pooler
  (also 5432) / provision the IPv4 add-on.
- **Vault statement-log leak** — a raw `INSERT` of a secret value logs plaintext into Postgres
  statement logs if `log_statement` is enabled anywhere in the write path. Guard: §11's
  `service_role`-restricted RPC with statement logging disabled for the write.
- **Fluid Compute connection growth** — Vercel Fluid Compute's elastic concurrency can grow
  Supavisor client-connection counts under load faster than a fixed pool `max` per instance
  would suggest (open platform-level issue, not a Buildo bug). Guard: pinned low pool `max`
  (§5) + the Phase 4.4 post-launch Supavisor connection-count monitoring window.
- **Env-sync asymmetric-JWT bug** — the Vercel↔Supabase integration may fail to provision the
  publishable key correctly on asymmetric-JWT (new-format `sb_*` key) projects, which Buildo
  is on. Guard: Phase 4.1's automated env-verification script comparing actual Vercel env
  values against the Supabase dashboard's keys — a manual-only check is explicitly insufficient
  here because the failure mode is silent.
- **GEOS-version geometry drift** — PostGIS/GEOS version differences between source and target
  change `ST_IsValid` results on borderline geometries; this is a real data-integrity risk, not
  a cosmetic version mismatch. Ground truth G10 pins the baseline invalid-geometry sets exactly:
  16 invalid `parcels` geometries, 17 invalid `building_footprints` geometries, with their ids
  recorded in the Reality-Check output. A load onto a different GEOS version producing a
  **different id set** (not just a different count) is a genuine drift signal requiring
  investigation — a matching count with different ids is not a pass. Guard: §6's
  `postgis_full_version()` recorded on both sides of every load + G10's exact id-set diff gate.
</failure_modes>

---

<constraints>
## 14. Operating Boundaries

### Target Files
- `scripts/lib/ssl-config.js` (new — shared TLS config helper, §4)
- `scripts/lib/pipeline.js` (`createPool` — SSL + pooler routing)
- `scripts/migrate.js` (SSL, migration-engine authority, §7)
- `scripts/validation/run-step.mjs` (SSL)
- `src/lib/db/client.ts` (SSL hardening — retiring `rejectUnauthorized: false`)
- `src/lib/supabase/` (new — server client factory, key contract §3)
- `mobile/src/lib/supabase.ts` (new — mobile client factory, key contract §3)
- `supabase/config.toml`, `supabase/migrations/` (CLI local-stack scaffolding only — MUST stay
  empty of schema-owning files per the §7 guard)
- `scripts/ai-env-check.mjs` (CA-expiry check §4.3, dual-DB `migrate.js --verify` §12,
  `supabase/migrations/` emptiness guard §7)
- `.github/workflows/` (new — chain-runner workflows, §8)
- `migrations/` (new: pg_cron + pg_net enablement, §6)
- `scripts/manifest.json` (`backup_db` step, §9.3 — re-homing only, not re-ordering)
- `scripts/restore-db.js` (new — the §9.2 restore tooling: `pg_restore --single-transaction --exit-on-error` or stderr-gated wrapper; counterpart to `backup-db.js`)

### Out-of-Scope Files
- `docs/specs/00-architecture/13_authentication.md` — application-level auth verification logic
  (`getClaims`/`getUser` criteria, DEV_MODE preservation, MFA/break-glass) is Spec 13's domain;
  this spec covers only the platform/connection layer auth rides on top of (§3 key contract).
- RLS policy definitions — owned by the new RLS Policy Catalog spec (Phase S4); this spec states
  only that the Data API is disabled and the future re-enable posture (§10).
- `src/app/api/` route handlers — no route-level behavior is defined here.
- `mobile/src/lib/authStore.ts`, `sign-in.tsx`, `sign-up.tsx`, and other mobile auth-flow files —
  Spec 93 (mobile auth) domain; this spec covers only the mobile Supabase client factory's
  connection/key contract (§3), not sign-in UX.
- `scripts/backup-db.js` internal behavior — Spec 112's rewrite owns the script contract; this
  spec establishes the backup *policy* (§9) it must implement.

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/00-architecture/01_database_schema.md` (the schema being hosted);
  `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (pool/advisory-lock/streamQuery
  conventions this spec's routing rules, §5, apply within); `docs/specs/00-architecture/00_system_map.md`.
- **Consumed by:** `docs/specs/00-architecture/13_authentication.md` (Phase S3 rewrite — reads
  §3 for how JWKS/`getClaims()` obtain keys); the new RLS Policy Catalog spec (Phase S4 — reads
  §10 for Data API posture); `docs/specs/00-architecture/112_backup_recovery.md` rewrite (Phase
  S3 — reads §9); the new pg_cron/scheduling spec (Phase S4 — reads §8); `03-mobile/93_mobile_auth.md`
  rewrite (reads §3 EAS key contract).
</constraints>
