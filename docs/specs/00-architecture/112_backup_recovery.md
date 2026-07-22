# Spec 112 — Database Backup & Recovery

**Status:** ACTIVE
**SPEC LINK:** `docs/specs/00-architecture/112_backup_recovery.md`

<requirements>
## 1. Goal & User Story

Provide a reliable backup **and restore** layer for Buildo's Supabase-hosted PostgreSQL database
so data can be recovered following accidental deletion, migration failure, or infrastructure
corruption. Without this, the Data Safety production readiness vector is blocked (scored 1 in
2026-04-24 WF5 audit; the underlying gap re-opens with every provider change until restore
tooling actually exists).

This is a **rewrite for Supabase**, replacing the Cloud SQL/GCS design, per the authorized
2026-07-18 Supabase + Vercel migration program (`.cursor/active_task.md` v2.1, Decision D9) and
`docs/specs/00-architecture/113_supabase_infrastructure.md` §9. **Spec 113 §9 is the POLICY
layer** (PITR posture, the two-layer split, the restore-tooling requirement, OP4 re-homing
scope) — **this spec is the SCRIPT/PROCEDURE layer** that implements that policy. Where the two
disagree, Spec 113 governs (see §12 Cross-Spec Dependencies).

The two-layer strategy itself (managed backups + a portable logical dump) carries over unchanged
in shape from the original Cloud SQL/GCS design — only the provider underneath, the destination
of the portable layer, and the presence of actual restore tooling change. Restore tooling did
**not** exist before this rewrite (a real gap, not a doc omission) — Decision D9 identifies
building it as in-scope work (`.cursor/active_task.md` Phase 3.3; Spec 113 §9.2).
</requirements>

---

<architecture>
## 2. Two-Layer Strategy (Decision D9, 2026-07-18 program plan)

| Layer | Mechanism | Frequency | Retention | Recovery Time |
|-------|-----------|-----------|-----------|---------------|
| **Layer 1 — Supabase managed backups** | Built-in daily backup, included at Pro tier | Daily | 7 days | Minutes, via Supabase dashboard or Management API |
| **Layer 2 — Portable logical dump** | `scripts/backup-db.js` → off-Supabase destination | Nightly (chain-triggered, §6) | `BACKUP_RETAIN_DAYS` (default 30) | Minutes, via `scripts/restore-db.js` (§4.3, NEW) |

Layer 1 is infrastructure configuration — no code, no `gcloud`-equivalent CLI (Supabase's daily
backup is enabled by tier, not a flag Buildo's repo sets). Layer 2 is a portable logical backup
restorable to **any** PostgreSQL instance, not just Supabase — the property that matters most
right after leaving one managed-Postgres provider for another: Layer 2 must not silently become
provider-locked again.

**PITR (Point-in-Time Recovery) is a third, separate Supabase capability** — a paid add-on on
every tier, giving continuous WAL-based recovery to any second rather than the daily-granularity
snapshot Layer 1 provides. §3 is the decision record for why it is off at launch.

### 2.1 Portable-layer destination (decision deferred to Phase 3.3)

**Supabase Storage is explicitly NOT an acceptable destination for Layer 2.** Landing the
nightly dump in Supabase Storage keeps the "portable" layer on the same provider as Layer 1 and
the primary database — an outage or account-level incident affecting Supabase would affect both
layers simultaneously, which is the exact scenario Layer 2 exists to guard against (see §9,
"Dump landing on-provider defeating portability"). The destination MUST be off-Supabase.

Two off-Supabase options were identified; **the choice between them is a Phase 3.3
implementation decision, not made by this spec**:

| Option | Description | Trade-offs |
|---|---|---|
| **A — External object storage** (e.g. S3, Cloudflare R2, Backblaze B2) | Same operational shape as the retired GCS destination — credentialed API upload, lifecycle-rule pruning, retrievable from anywhere | Recurring cost (small, dump-sized); a new third-party credential to manage in Vault (§11 of Spec 113); genuinely off-provider |
| **B — Operator local/NAS target** | `backup-db.js` writes the dump to a filesystem path reachable from the runner (operator's machine, home NAS, mapped network drive) | Zero recurring cost; **interim-grade** — no automated offsite copy unless the operator layers one on, single point of failure if that machine/drive fails, availability depends on the runner having filesystem access to it (GitHub Actions runners do NOT have this by default, so Option B implies either a self-hosted runner or a separate sync step) |

Whoever implements Phase 3.3 MUST record the choice as an amendment to this section (mirroring
how Spec 113 §8.2 handles its own deferred Network Restrictions decision) — the decision is
deferred, not the documentation of it. Until then, the env var name for the destination is a
placeholder (§4.2).

**RESOLVED 2026-07-20 (Phase 3.2 operator ruling, folded ahead of Phase 3.3 implementation) —
Option A chosen:** an S3-compatible external object-storage bucket. The specific vendor
(Backblaze B2 vs. Cloudflare R2) is **finalized at bucket-creation time**, not by this
amendment — both are S3-compatible, so the choice between them requires no code fork and no
further spec amendment once made. The env var names are fixed as:

- `BACKUP_S3_ENDPOINT`
- `BACKUP_S3_BUCKET`
- `BACKUP_S3_ACCESS_KEY_ID`
- `BACKUP_S3_SECRET_ACCESS_KEY`

These resolve §4.2's `BACKUP_DEST_*` placeholder — see §4.2's env table, updated to match.
</architecture>

---

<architecture>
## 3. PITR Decision Record (Decision D9, 2026-07-18 program plan)

**PITR is OFF at launch.** This is an explicit human decision made at program authorization, not
a default arrived at by omission or cost-avoidance alone.

**Rationale:** zero users exist at cutover, so there is no catastrophic-loss blast radius yet.
Daily 7-day managed backups (Layer 1) plus a nightly off-Supabase logical dump (Layer 2) cover
the realistic recovery need at this stage — the marginal RTO/RPO improvement PITR buys over
daily+nightly is not worth its cost and operational overhead before there is anyone to lose data
for.

**Standing objection on record:** the Gemini adversarial review (S6 panel, 2026-07-18) rated
PITR-off **CRITICAL for RTO** and re-raised the objection in the Round-2 panel. The operator's
explicit ruling stands regardless — see `.cursor/active_task.md` §Panel Adjudication Log,
"HUMAN DECISION at authorization." This section is that decision's system-of-record; it is not
re-litigated by implementation work.

**Revisit trigger: first paying user** — not a calendar date, not "before launch," not a review
cadence. Whoever re-opens this decision at that trigger MUST update this section (and §2's
strategy table) in the same change that enables PITR, per Spec 113 §9's identical instruction —
the two specs must never describe different PITR postures.

**What "turning PITR on" actually costs later — see §9** (Known Failure Modes): it is not a free
toggle, budget for it before the trigger fires rather than at the moment it does.
</architecture>

---

<behavior>
## 4. Behavioral Contract

### 4.1 Layer 1 — Supabase Managed Daily Backups

No code. Configured via the Supabase dashboard (Database → Backups) at the Pro tier
(`.cursor/active_task.md` G7: PITR/backup posture is per-tier). Verification is a dashboard
check or the Supabase Management API — there is no repo-side script analogous to the old
`gcloud sql instances describe --format="json(settings.backupConfiguration)"` command, because
this layer is not repo-managed configuration.

### 4.2 Layer 2 — `scripts/backup-db.js` (rewrite contract)

**Script path and Advisory Lock ID are unchanged: `scripts/backup-db.js`, lock ID `112`**
(Spec 47 §A.5 registry — the spec-number default remains globally unique; no reassignment
needed).

**Retired:**
- `BACKUP_GCS_BUCKET` env var
- `GOOGLE_APPLICATION_CREDENTIALS` env var
- `@google-cloud/storage` dependency and all GCS-specific stream/prune logic

**New inputs, per Spec 113 §3's environment contract:**

| Var | Environment | Purpose |
|---|---|---|
| `DATABASE_URL` | Local stack | `pg_dump` target connection string (ephemeral local Supabase) |
| `SUPABASE_DATABASE_URL` | Cloud project | `pg_dump` target connection string |
| `SUPABASE_CA_CERT_PATH` | Cloud project | CA-pinned TLS, appended to the connection string as libpq params (see below) |
| `BACKUP_S3_ENDPOINT` | Both — **RESOLVED 2026-07-20, §2.1** | S3-compatible endpoint (B2 or R2; vendor finalized at bucket creation) |
| `BACKUP_S3_BUCKET` | Both | Destination bucket name |
| `BACKUP_S3_ACCESS_KEY_ID` | Both | S3-compatible access key id |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Both | S3-compatible secret access key |
| `BACKUP_RETAIN_DAYS` | Both | Unchanged — structural constant, default 30, Zod-validated, not in `logic_variables` (same rationale as before: retention-policy changes require engineering review) |

**TLS note — `pg_dump`/`pg_restore` do NOT go through `scripts/lib/ssl-config.js`.** That
helper (Spec 113 §4.1) constructs a `ssl` config object for the `pg` npm module's connection
pools; `pg_dump`/`pg_restore` are separate binaries that negotiate TLS via libpq directly, not
through node-postgres. To get the equivalent CA-pinned `verify-full` behavior Spec 113 §4
mandates, cloud invocations MUST supply `sslmode=verify-full` and `sslrootcert=$SUPABASE_CA_CERT_PATH`
either as connection-string query params or as the `PGSSLMODE`/`PGSSLROOTCERT` environment
variables passed to the spawned `pg_dump`/`pg_restore` process. Local-stack invocations use the
local no-TLS mode per Spec 113 §4.2 — no CA params needed.

**Object naming:** unchanged pattern (`pg_dump/${YYYY-MM-DD}/${ISO_TIMESTAMP}.dump`), now under
whatever path/prefix convention the Phase 3.3 destination uses.

**NEW — baseline manifest sidecar.** Alongside the `.dump` object, `backup-db.js` writes a
`.manifest.json` sidecar (same path, `.manifest.json` suffix instead of `.dump`) capturing the
gate-baseline metrics `restore-db.js` needs to validate against (§4.3):
- per-table row counts (all tables, not a sample)
- invalid-geometry id sets for `parcels` and `building_footprints` (not just counts — Spec 113
  §13's GEOS-drift failure mode requires an id-set diff, and a count alone cannot express that)
- sequence `last_value` for every sequence
- `mv_monthly_permit_stats` row count
- `postgis_full_version()` output, recorded at backup time
- `RUN_AT` (DB-clock timestamp, §R3.5)

Without this sidecar, "exact row count match" at restore time has nothing to diff against —
restoring a dump and comparing it to itself proves nothing. The sidecar generalizes the
one-time G10 gate baseline (`.cursor/active_task.md` G10, captured for the Phase 0.5/4.0
migration load) into a **standing, every-backup** artifact so any future restore — not just the
migration-era one — has a real baseline.

> **Consumption status (S1 truth-up, 2026-07-22):** the sidecar is **produced for future
> consumption — nothing in the repo reads it yet.** The shipped restore gates (§4.3) validate
> against the LIVE source DB instead; the manifest-consumer build-out (restore-only validation
> of a historical dump without a live source) is filed in `review_followups.md`. Sidecar
> generation/upload is **non-fatal** (P4-F0 fold C5b): a failure emits a WARN
> `manifest_status` audit row and the dump itself still counts as a successful backup.

**Outputs (renamed/generalized from the GCS-specific shape):**
- `records_meta.backup_size_bytes` — unchanged
- `records_meta.dest_path` — replaces `gcs_path` (destination-agnostic; the Phase 3.3 value is a
  URI or filesystem path depending on the chosen option)
- `records_meta.blobs_pruned` — unchanged in meaning, generalized in mechanism (destination
  lifecycle rule for object storage; explicit prune loop for a local/NAS path)
- `records_meta.retain_days` — unchanged
- `records_meta.manifest_path` — NEW, the sidecar's location (`null` when sidecar
  generation/upload failed — see the non-fatal note above)
- `audit_table` — phase 112, PASS/WARN/FAIL rows, built incrementally so
  `dest_path`/`backup_size_bytes` always reach the summary once the dump lands (C5b); includes
  a `manifest_status` row (PASS with path / WARN on failure) and a `retention_prune_status`
  row (PASS `ok` / WARN on prune failure — distinct from a healthy `blobs_pruned=0`, C5a)

### 4.3 `scripts/restore-db.js` (SHIPPED — rewritten to as-built truth, P4-F0 fold S1, 2026-07-22)

> **Amendment note (Ground-truth CRITICAL, 2026-07-22).** This section originally documented a
> **manifest-baseline** validation architecture — gates diffing the restored target against the
> backup-time `.manifest.json` sidecar — that was **never built**. The shipped gates compare the
> **LIVE SOURCE database** (the Docker dev DB) against the TARGET instead: a stronger guarantee
> for the migration-era loads this tooling serves (both sides queried at validation time), but a
> *different* one — it requires the source DB to still exist and cannot validate a restore of a
> historical dump on its own. The `.manifest.json` sidecar (§4.2) is **produced for future
> consumption — no consumer exists in the repo yet**; the manifest-consumer build-out is filed
> in `docs/reports/review_followups.md` ("P4-F0 output panel").

**Not a manifest/chain step.** `restore-db.js` is a **standalone, operator-invoked CLI**, in the
same category as `scripts/migrate.js` — not wrapped in `pipeline.run`/the Spec 47 §R1–R12
skeleton, and not registered in `scripts/manifest.json`. Rationale: restore is inherently
destructive, human-gated, and not a step that should ever be safely auto-re-runnable inside an
unattended chain — the same reasoning that already keeps `migrate.js` outside the pipeline
skeleton.

**Two modes:**
1. **Combined dump+restore** (no `--dump=`): `pg_dump`s the SOURCE (PG_* env vars — the Docker
   dev DB, loopback-only) straight into a temp file, then restores it into TARGET. The Phase
   0.5/4.0 data-load shape.
2. **Restore-only** (`--dump=<path>`): restores an existing dump file — the disaster-recovery
   shape (e.g. a nightly `backup-db.js` artifact).

**Usage (runnable examples):**
```
node scripts/restore-db.js --target=local --mode=fresh
node scripts/restore-db.js --target=local --mode=fresh --tables=trades,logic_variables
node scripts/restore-db.js --dump=./pg_dump/2026-07-18.dump --target=local --mode=fresh
node scripts/restore-db.js --target=cloud --verify-only        # gates only, no dump/restore
```

**Flags (all ten):**

| Flag | Meaning |
|---|---|
| `--target=local\|cloud` | Which env-contract connection to restore into (D14). Default `local`. |
| `--mode=fresh` | **REQUIRED for any actual restore.** The operator explicitly states the target is expected-empty/idempotently reloadable (§8 edge case — never inferred from DB state). `--mode=dr` (in-place `--clean`/DROP SCHEMA restore) is NOT implemented — refuses. |
| `--tables=t1,t2` | Restrict the load to an explicit table subset (validated against the source∩target eligible list). |
| `--dump=<path>` | Restore this existing dump instead of dumping SOURCE fresh. Never deleted by cleanup. |
| `--dump-out=<path>` | Where to write the fresh dump. An explicit `--dump-out` path is never auto-cleaned; the default (a private mkdtemp file) is deleted on EVERY exit path — success or failure — unless `--keep-dump`. |
| `--keep-dump` | Don't delete the auto-generated dump after a successful restore. |
| `--skip-gates` | Don't run the G10 gate suite after a successful restore. |
| `--verify-only` | Run the G10 gate suite only — no dump, no restore, no truncate; `--mode` not required. |
| `--i-really-mean-to-truncate` | Override the destructive-truncate guard (below). |
| `--skip-truncate` | Skip the pre-restore TRUNCATE entirely — correct ONLY for a greenfield-empty target subset load (a partial `--tables` scope truncates non-CASCADE, which out-of-scope FKs into in-scope tables would block; an empty target needs no truncation). |

**Destructive-truncate guard (P4-F0 folds: scope-aware + fail-closed).** For any NON-LOOPBACK
target (a loopback target is the D13 truncate-first local re-run flow and is deliberately
ungated), the CLI probes — before any TRUNCATE — the **actual tables about to be truncated**
plus two fixed belt probes (`auth.users`, `public.parcels`). Any registered human in
`auth.users` or any data row in a probed table refuses the run unless
`--i-really-mean-to-truncate` is passed. A probe that ERRORS (network/auth/permission) **fails
closed** — the target is treated as populated, never as empty; only a genuinely absent
relation/schema (SQLSTATE 42P01/3F000) counts as zero.

**Auth-linked auto-exclusion (P4-F0 fold C2).** On a remote target, an UNSCOPED run
auto-excludes every public table carrying an FK into `auth.users` — derived at runtime from the
target's `pg_constraint` (13 tables as of 2026-07-22), logged by name, never a hand-typed list.
Rationale: those tables are greenfield-empty at load time (dev rows reference dev `auth.users`
uuids absent on cloud) and hold real, source-divergent user rows after launch — never
source-comparable. Local targets and explicit `--tables` scopes are untouched.

**TOC preflight (the CRITICAL truncate gate).** Before any TRUNCATE, `pg_restore --list` is
parsed and every table about to be truncated must have a `TABLE DATA` entry in the dump's TOC —
a dump that cannot restore a table must never be allowed to wipe it. Runs for both fresh and
operator-supplied dumps.

**Core contract (Spec 113 §9.2, verbatim rule):** `pg_restore --single-transaction
--exit-on-error` is the primary restore path (note: NOT `--disable-triggers` — Supabase's
`postgres` role is not superuser; pg_dump's FK-ordered TOC makes trigger-enforced restore safe).
On top of that, a **stderr-gated wrapper** treats **any** stderr output as failure for both
`pg_dump` and `pg_restore` — "no stderr output" is the pass condition, never "exit code 0"
(§9). Never assume partial success is success.

**Restore-validation = the G10 gate suite** (`scripts/validation/supabase-load-gates.js`), a
reusable library both `restore-db.js` and the standalone CLI invoke — never a bespoke one-off
comparison. **All gates compare LIVE SOURCE vs TARGET** (see the amendment note above); gates
whose table is outside a `--tables` scope report SKIP, not a false PASS/FAIL:
- **(a) Per-table exact row counts** — every in-scope table, both sides.
- **(b) Invalid-geom id-set diff** — `parcels`/`building_footprints`: a matching COUNT with a
  different **id set** is a genuine GEOS-drift signal, not a pass (Spec 113 §13). Also asserted
  against the pinned G10 expected counts (16/17).
- **(c) Sequence `last_value` sync** — ownership derived via `pg_depend` (not a naming-convention
  guess), scoped to in-scope tables; exact match expected (a lagging sequence risks PK collisions).
- **(d) Matview verify-or-refresh** — the target `mv_monthly_permit_stats` is ALWAYS refreshed
  before comparison, and ground truth is the SOURCE's **live defining query** (its stored
  snapshot may itself be stale), with the delta logged explicitly.
- **(e) `postgis_full_version()` both sides** — recorded as INFO; a version delta is a flagged
  finding, not a failure (gate (b) is the actual drift detector).
- **(f) G10 pinned-baseline assertions** — exact row counts for permits/parcels/coa/footprints.
- **(g) `ravine_distance_m` epsilon check** — 1000-row keyed sample, relative epsilon 1e-9, with
  source-populated/target-null XOR reported as an explicit `nullMismatch`.

**Output:** a restore-validation report (console table, plus an `emitSummary`-shaped JSON for
anyone scripting around it) with PASS/FAIL/SKIP per gate and a row-derived verdict. A restore is
not "done" until every gate reports PASS, or a human explicitly acknowledges a WARN — mirroring
the operator sign-off pattern D6 already established for the 0-row HALT check.
</behavior>

---

<architecture>
## 5. Version-Aware Dump/Restore

Three PostgreSQL versions coexist across environments during Phases 0–3 (Spec 113 §12
coexistence window): dev Docker `buildo_pgdata` = **PG15**, CI ephemeral containers =
**PG16** (`postgis/postgis:16-3.4-alpine`), Supabase (local stack and cloud project) = **PG17**
(17.6 confirmed 2026-07-18).

**Client-version rule:** the `pg_dump`/`pg_restore` **client binary** used by `backup-db.js` and
`restore-db.js` MUST be at least as new as the highest PostgreSQL server version touched in
either direction of the operation — in practice, pin the PG17-line client toolchain, not
whatever `pg_dump` happens to ship alongside the local PG15 Docker image or CI's PG16 container.
An older client dumping or restoring a newer server can fail on catalog/object features it does
not recognize; this is silent or opaquely-worded far more often than it is an obvious version
error. This is a live, not theoretical, risk here specifically because three server versions are
simultaneously in play during the coexistence window (Spec 113 §12), not a generic caveat.

Guard: CI/operator tooling installs (or the workflow container provides) the PG17-line
`pg_dump`/`pg_restore` binaries explicitly, rather than relying on whatever version is bundled
with the local dev or CI Postgres image.
</architecture>

---

<architecture>
## 6. Backup Cadence Trigger (mechanism unchanged + Decision D8 addition)

**Primary trigger — unchanged.** `backup_db` remains the final step of `chains.permits`
(`scripts/manifest.json` L90) — it runs whenever the permits chain runs. What changes is *how*
the permits chain itself gets scheduled: per Decision D8, nightly/must-succeed chains now run on
a **GitHub Actions runner executing `scripts/run-chain.js` directly** (Spec 113 §8.1), not via
Cloud Scheduler → Cloud Run, which is retired along with the rest of the Google stack.

**Secondary/safety-net trigger — also GitHub Actions, not `pg_cron`.** The original design used
Cloud Scheduler as a secondary trigger when the permits chain was skipped. That role is now
filled by a **dedicated nightly GitHub Actions workflow invoking `backup-db.js` directly** (not
the full chain) when `pipeline_runs` has no `completed` `backup_db` row within the last 25
hours — the same OP4 threshold (§7). `pg_cron` is explicitly **forbidden** for this role: Spec
113 §8.4 states plainly that a must-succeed job — `backup_db` is named as one of the four
examples — must never be scheduled via `pg_cron`, because `pg_cron`/`pg_net` give no retry and
no alert and silently skip execution when the database is unhealthy.

**RESOLVED 2026-07-20 — the safety-net trigger is `pipeline-watchdog.yml` (Spec 115 §2.5).**
Rather than a standalone backup-only workflow, the secondary trigger described above is
implemented as one check inside a single freshness-watchdog workflow that also checks
permits/coa chain freshness (Spec 115 §2.5's item 1 and item 2 respectively). It matches BOTH
row shapes `backup_db` can be written under: the scoped-slug `permits:backup_db` step row
(the scoped-slug INSERT at `run-chain.js:379` and its completion UPDATE at `:508` — S3 fold
2026-07-22, corrected from a stale `:362` citation which is a closing brace; written when
the permits chain runs its final step normally) and a
standalone `backup_db` slug row (written when the watchdog itself invokes `backup-db.js`
directly). The watchdog additionally guards against invoking the safety net while a permits
chain is currently running (a race — that in-flight chain may complete its own `backup_db` step
moments later, and a concurrent direct invocation would double-run it), a refinement beyond
this section's original design.
</architecture>

---

<behavior>
## 7. OP4 Re-homing (Spec 07 §OP4 — description only; NOT applied by this spec)

Spec 07 §OP4 (`docs/specs/00-architecture/07_backend_prod_eval.md` L482-489) currently reads:

```
psql $DATABASE_URL -c \
  "SELECT verdict, run_at FROM pipeline_runs \
   WHERE step_name = 'backup_db' ORDER BY run_at DESC LIMIT 1;"
```
Pass: `verdict = completed`, `run_at` within last 25h (daily schedule).

**CORRECTED 2026-07-20 — this query does NOT match the live schema and cannot run as
written.** A live-verified check of `pipeline_runs` found **no `step_name` column at all** —
the table's columns are `pipeline`, `status`, `started_at`, `completed_at`, `error_message`,
etc., never `step_name`/`verdict`/`run_at`. The quoted block above was always aspirational
prose, not a query anyone could actually paste into `psql` against this schema. The corrected
query, reflecting both the real column names AND §6's scoped-slug shape (P3-G6 — `backup_db`
is written under `permits:backup_db` when it runs as the permits chain's final step, or under
a bare `backup_db` slug when the §6 safety-net watchdog invokes it directly):

```
psql "$SUPABASE_DATABASE_URL" -c \
  "SELECT pipeline, status, completed_at FROM pipeline_runs \
   WHERE pipeline IN ('permits:backup_db', 'backup_db') AND status = 'completed' \
   ORDER BY completed_at DESC LIMIT 1;"
```
Pass: a row exists, `completed_at` within the last 25h.

The required Spec 07 text update — a **separate task, not performed by this spec-authoring
work** — is prose-only: replace the surrounding GCS/Cloud-Console references with the
Supabase-managed-backup + off-Supabase-portable-dump language of §2 above, replace the
non-existent-column query above with the corrected one, and update the `$DATABASE_URL` framing
that currently implies a Cloud SQL connection string to Spec 113 §3's `SUPABASE_DATABASE_URL`
naming. **Spec 07's own §OP4 text carries the identical `step_name`/non-existent-column error**
and needs the same fix applied at that separate task's F6-equivalent step — flagged here so
the fix isn't independently rediscovered as a second bug. No file under
`docs/specs/00-architecture/07_backend_prod_eval.md` is modified as part of this rewrite (see
§12 Out-of-Scope Files).
</behavior>

---

<behavior>
## 8. Edge Cases

- **Missing destination env var (`BACKUP_S3_*`, resolved §2.1/§4.2):** same shape as the
  original `BACKUP_GCS_BUCKET`-missing case — `backup-db.js` emits a SKIP summary
  (`records_meta.skipped: true`), exits 0, acquires no advisory lock, chain continues. Correct
  behavior for local dev where the destination is not configured.
- **`pg_dump` non-zero exit:** error re-thrown inside the advisory-lock scope, `pipeline.run`
  records `status='failed'`. Note (Round-3 truth-up): in the shipped streaming design the S3
  multipart upload starts CONCURRENTLY with `pg_dump` and is **aborted** on failure — the
  outcome is the same (no completed object), but "upload never initiated" was wrong.
- **Upload/write failure mid-stream to the destination:** generalized from the original
  GCS-specific stream handling — the partially written object/file is abandoned (not deleted);
  the next successful run overwrites via a new timestamped name. Orphan cleanup is
  destination-specific: a bucket lifecycle rule for Option A (external object storage), or an
  explicit find-and-prune step for Option B (local/NAS) — decided alongside the Phase 3.3
  destination choice (§2.1).
- **Retention prune failure:** unchanged — caught separately, logged WARN, backup still
  considered successful.
- **Concurrent `backup-db.js` runs:** unchanged — advisory lock 112 serializes them; the second
  invocation emits a SKIP summary and exits 0.
- **Non-integer `BACKUP_RETAIN_DAYS`:** unchanged — Zod validation throws at startup.
- **NEW — restore invoked against a non-empty target database:** `pg_restore`'s default behavior
  against a target that already has conflicting objects can silently skip or error per-object.
  `restore-db.js` MUST require the operator to state (via a flag, not inference) whether the
  target is expected empty — the Phase 0.5/4.0 fresh-load pattern — or an in-place
  disaster-recovery restore, which needs `--clean` or an explicit pre-restore `DROP SCHEMA` as a
  separate, confirmed destructive step. Never inferred from the target's current state.
- **Baseline manifest missing or stale (Round-3 truth-up — the §4.3 amendment applies here
  too):** the shipped gates never read the manifest sidecar at all — they compare LIVE SOURCE
  vs TARGET (§4.3 amendment note), so there is no `NO-BASELINE` mode and none is needed for
  the migration-era loads this tooling serves. A restore-only validation of a HISTORICAL dump
  (no live source) is exactly the manifest-consumer build-out filed in `review_followups.md`;
  when built, its no-sidecar behavior MUST be refuse-to-PASS (never silently upgraded), which
  is what the original `NO-BASELINE` clause here intended.
</behavior>

---

<failure_modes>
## 9. Known Failure Modes

- **`pg_restore` exit-0-past-errors default.** Plain `pg_restore`, invoked without
  `--exit-on-error`, can complete with exit code 0 while individual statements inside the dump
  failed (permission errors, already-exists conflicts, etc.), surfacing only stderr warnings a
  naive caller ignores — a restore that "succeeded" by exit code while silently dropping data.
  Guard: §4.3's mandatory `--single-transaction --exit-on-error`, or the stderr-gated wrapper
  where that combination is not viable — either way, "no stderr output" is the pass condition,
  not "exit code 0."
- **Enabling PITR is not a free toggle.** Turning PITR on at the §3 revisit trigger is not a
  superset upgrade of the daily-backup layer: on Supabase, enabling PITR can require bumping off
  the smallest ("Small") compute tier, and a PITR-based restore is a **full-downtime** operation
  (the project is unavailable during the restore), unlike a lightweight clone/snapshot flow.
  Whoever flips D9 to ON at the revisit trigger must budget for both the compute-floor cost
  increase and an announced maintenance window — not assume it is a same-day config change.
- **Dump landing on-provider defeats the point of Layer 2.** If Phase 3.3 defaults the portable
  destination to Supabase Storage — the path of least resistance, same dashboard, same billing —
  the "portable" layer stops being portable: a Supabase-side outage or account incident then
  affects Layer 1 and Layer 2 simultaneously, which is precisely the scenario Layer 2 exists to
  guard against. Guard: §2.1 explicitly excludes Supabase Storage from the destination options;
  this section exists so the Phase 3.3 implementer re-reads the constraint before optimizing for
  convenience over the stated goal.
- **Backup freshness silently stale past 25h.** If both the primary (permits chain) and
  secondary (dedicated nightly workflow) GitHub Actions triggers fail silently — a GitHub
  Actions platform outage, a rotated secret breaking auth to Supabase, or a runner IP falling off
  an allowlist under whichever Network Restrictions option Phase 3.2 picks (Spec 113 §8.2) — the
  only thing that surfaces the gap is OP4 (§7), which is a **manual** checklist item, not an
  automated alert. Nothing pages anyone on a stale backup. This gap is carried over unchanged
  from the original Cloud SQL/GCS design, not introduced here — flagged because the GitHub
  Actions migration adds a new class of silent-failure cause (IP-allowlist drift, GH-side
  secret/auth breakage) that Cloud Scheduler's failure surface did not have, without changing
  the (still manual) detection story.
</failure_modes>

---

<testing>
## 10. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `src/tests/backup-db.logic.test.ts` — retire GCS-specific mocks, keep the same
  behavioral coverage against the new destination abstraction: SKIP-on-missing-destination-env,
  retention-prune-failure-is-WARN-not-FAIL, advisory-lock skip-on-concurrent-run, non-integer
  `BACKUP_RETAIN_DAYS` Zod throw, baseline-manifest sidecar written alongside the dump. MUST be
  rewritten in the same commit as `backup-db.js` itself (Phase 3.3) — not a follow-up.
- **Infra:** `src/tests/restore-db.infra.test.ts` (needs a live target DB —
  `BUILDO_TEST_DB=1`) — `--single-transaction --exit-on-error` failure propagation; stderr-gated
  wrapper's "any stderr = fail" behavior against real binary output; TOC-preflight parse of real
  `pg_restore --list` output; the C1 fail-closed probe (`countTableRowsSafe` null on non-42P01/
  3F000) and the C2 `getAuthLinkedTables` live FK derivation. Gate diff logic (row-count,
  id-set-vs-count, sequence lag, ravine nullMismatch) is covered synthetically in
  `restore-db.logic.test.ts`. (Round-3 truth-up: the previously-listed "sanity-audit-triple
  new-FAIL detection" and "`NO-BASELINE` fallback" tests described the never-built
  manifest-baseline architecture — see the §4.3 amendment note.)
<!-- TEST_INJECT_END -->
</testing>

---

<behavior>
## 11. Producer / Consumer Contracts

`backup-db.js` remains an **Observer archetype** (Spec 47 §12) — it reads the DB via `pg_dump`
(not `SELECT` queries) and writes only to the destination + the baseline manifest sidecar. It
has no downstream in-pipeline consumers.

`emitSummary` fields (Layer 2, `backup-db.js`):
| Field | Type | Meaning |
|-------|------|---------|
| `records_total` | null | Observer pattern — no row-level processing |
| `records_new` | null | Observer pattern |
| `records_updated` | null | Observer pattern |
| `records_meta.backup_size_bytes` | number | Compressed dump file size |
| `records_meta.dest_path` | string | Full destination URI/path of the backup object (replaces `gcs_path`) |
| `records_meta.manifest_path` | string \| null | Location of the `.manifest.json` gate-baseline sidecar (§4.2); `null` when sidecar generation/upload failed (non-fatal, C5b) |
| `records_meta.blobs_pruned` | number | Objects/files deleted by retention pruning |
| `records_meta.retain_days` | number | Effective retention window used |
| `records_meta.duration_ms` | number | Wall-clock run duration |
| `records_meta.audit_table` | object | Phase 112, verdict PASS/FAIL/WARN (incl. `manifest_status` + `retention_prune_status` rows, §4.2) |

`restore-db.js` is **not** a Spec 47 pipeline step (§4.3) and does not emit `emitSummary`/
`emitMeta` in the pipeline sense; its restore-validation report (§4.3 Output) is the analogous
artifact for a standalone operator CLI.
</behavior>

---

<constraints>
## 12. Operating Boundaries

### Target Files
- `scripts/backup-db.js` — rewrite: destination + connection-string changes, GCS retirement,
  baseline manifest sidecar (§4.2)
- `scripts/restore-db.js` — **NEW** (§4.3)
- `scripts/manifest.json` — `backup_db` step entry, L90 position (re-homing only — `step_name`
  and chain position unchanged, per Spec 113 §9.3)
- `src/tests/backup-db.logic.test.ts` — rewrite, same commit as `scripts/backup-db.js`
- `src/tests/restore-db.infra.test.ts` — **NEW**, same commit as `scripts/restore-db.js`
- `.github/workflows/` — new nightly permits-chain workflow + secondary backup-only safety-net
  workflow (Spec 113 §8.1/§8.2; this spec does not own the workflow YAML content, only the
  trigger semantics described in §6)
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §A.5 — lock ID 112 registration
  (unchanged — still the spec-number default, still globally unique)

### Out-of-Scope Files
- `docs/specs/00-architecture/07_backend_prod_eval.md` §OP4 — the text update described in §7 was
  planned as **a separate task**, out of scope for this spec-authoring work. **CORRECTED (F8
  fold, 2026-07-20 — Regression Guardian): that claim did not hold.** Spec 07 §OP4 WAS in fact
  edited at P3-F6 (see the `<!-- CORRECTED 2026-07-20 (P3-F6, Spec 112 §7) -->` comment directly
  above the corrected query in `07_backend_prod_eval.md`'s own OP4 section) — the non-existent
  `step_name` column bug §7 above documents is identical in both specs, and fixing it only here
  while leaving Spec 07's copy broken would have left the two documents disagreeing about a query
  an operator might actually run. This out-of-scope line is retained as a record of the ORIGINAL
  intent, not as a currently-true boundary claim.
- `docs/specs/00-architecture/113_supabase_infrastructure.md` — this spec implements §9's
  policy; it does not restate or amend the policy layer itself. Any apparent conflict resolves
  in favor of Spec 113.
- `src/app/api/` — no API trigger for backup or restore; both remain script-level,
  operator/chain-triggered.
- `migrations/` — no schema changes.
- Cloud Scheduler / `gcloud` configuration — retired outright, not migrated. Supabase-side
  configuration is dashboard/Management-API driven (§4.1) plus GitHub Actions (§6), not a
  repo-tracked infra-as-code surface this spec owns.

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/00-architecture/113_supabase_infrastructure.md` §9 (the backup
  policy this spec implements: PITR-off decision, two-layer split, restore-tooling requirement,
  OP4 re-homing scope), §3 (env/key contract), §4 (TLS/CA-pinning rules applied here in libpq
  terms), §8 (scheduling — GitHub Actions compute backend, `pg_cron` prohibition for must-succeed
  jobs), §12 (dev-workflow coexistence — the three-PostgreSQL-version window §5 depends on), §13
  (GEOS-version geometry drift — the invalid-geom id-set diff gate in §4.3 exists because of it).
- **Relies on:** `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (script protocol —
  `backup-db.js` keeps its §R1–R12 skeleton; `restore-db.js` is deliberately outside that
  skeleton, per §4.3's `migrate.js`-precedent rationale).
- **Relies on:** `docs/specs/00-architecture/01_database_schema.md` (the schema being backed up
  and restored).
- **Relies on:** `.cursor/active_task.md` (Decision D9, Ground truth G8/G10 — the program-plan
  authority this rewrite executes against).
- **Consumed by:** `docs/specs/00-architecture/07_backend_prod_eval.md` §OP4 (reads
  `pipeline_runs.step_name = 'backup_db'`, unchanged query, §7).
</constraints>
