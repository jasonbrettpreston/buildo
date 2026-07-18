# Spec 115 — Pipeline Scheduling (GitHub Actions + pg_cron)

**Status:** ACTIVE
**SPEC LINK:** `docs/specs/00-architecture/115_scheduling.md`

<requirements>
## 1. Goal & Scope

This spec is the **detailed implementation spec** for Decision D8 (`.cursor/active_task.md`
v2.1, Phase 3.2) — replacing `scripts/local-cron.js` as Buildo's production pipeline
scheduler with GitHub Actions (must-succeed chain triggers) + pg_cron (in-DB SQL
maintenance). `docs/specs/00-architecture/113_supabase_infrastructure.md` §8 is the
**normative policy layer**: compute-backend choice, the `isChainRunning` correctness
contract, the pg_cron scope boundary, and the `pipeline_schedules` wording fix are all
decided there and are NOT re-litigated here. This spec exists to encode those decisions
as buildable artifacts — exact workflow YAML shape, exact job/script contracts, an exact
pg_cron job catalog — without duplicating Spec 113 §8's prose. Where this spec repeats a
fact from Spec 113, it is citing it, not re-deciding it.

**In scope:** the 3 GitHub Actions workflow definitions; workflow anatomy (checkout, env,
secrets, invocation, timeout, alerting); the `isChainRunning` re-implementation contract;
the pg_cron job catalog; `pipeline_schedules` wiring; `scripts/local-cron.js` disposition;
the Network Restrictions decision placeholder.

**Out of scope:** Vault RPC internals (Spec 113 §11), TLS/CA mechanics beyond citing where
the workflow reads them (Spec 113 §4), `backup-db.js` script internals (Spec 112 rewrite),
RLS policy content (the RLS Policy Catalog spec), application-level auth (Spec 13).
</requirements>

---

<architecture>
## 2. GitHub Actions Workflow Definitions

**Three workflows**, one per `scripts/local-cron.js` schedule entry (`local-cron.js`
L40-73, current production cadences — preserved exactly, including the coa→permits
freshness contract and its serialization requirement, L41-53). All three invoke
`scripts/run-chain.js` directly on the GitHub Actions runner (Spec 113 §8.1 — no Vercel
function ever hosts a chain).

| # | File | Chain(s) | Cadence (ET, as today) | Cadence (UTC cron — see §2.1 DST note) |
|---|---|---|---|---|
| 1 | `.github/workflows/chain-coa-permits.yml` | `coa` → `permits`, **serialized in one workflow** | 6 AM ET weekdays | `0 11 * * 1-5` |
| 2 | `.github/workflows/chain-sources.yml` | `sources` | 8 AM ET, 1st of quarter | `0 13 1 1,4,7,10 *` |
| 3 | `.github/workflows/chain-entities.yml` | `entities` | 3 AM ET daily | `0 8 * * *` |

### 2.1 UTC / DST note

GitHub Actions' `schedule.cron` trigger is **UTC-only** — it has no timezone concept,
unlike `node-cron`'s `{ timezone: 'America/Toronto' }` (`local-cron.js` L201), which
auto-adjusts for DST. A single fixed UTC cron expression therefore does **not** track 6 AM
ET year-round: it tracks 6 AM **EST** in winter and drifts to **7 AM EDT** in summer (a
1-hour-later run, never earlier — the UTC offsets above are all computed as ET+5, the EST
value, so summer runs land later than nominal, never earlier). This is a **deliberate,
accepted drift**, not a bug to fix in this cutover:

- The coa→permits freshness contract's real constraint is Spec 07 §OP4's "backup within
  25h" SLA (Spec 113 §9.3) — a 1-hour-later summer run has ~24h of slack before that SLA
  is threatened.
- Landing later is the safe direction: it never makes data staler than the ET-nominal
  target, only fresher-by-less-than-expected once per DST transition window.
- A DST-exact schedule would require two cron lines per workflow (one for each DST regime)
  each gated by an in-job date check to skip the wrong half of the year — real complexity
  for a cosmetic 1-hour wobble twice a year. **Deferred hardening**, not built now (see
  §7 Known Failure Modes).

### 2.2 `chain-coa-permits.yml` job shape (serialization + failure isolation)

The freshness contract (`local-cron.js` L41-53, `chain.logic.test.ts` "serialized daily
job runs coa strictly before permits") and the failure-isolation guarantee
(`chain.logic.test.ts` "serialized job continues to the next chain when one chain fails")
are **both preserved**, translated from `local-cron.js`'s JS `try/catch`-around-`await`
loop into GitHub Actions step semantics:

```yaml
jobs:
  coa-then-permits:
    runs-on: ubuntu-latest   # TODO Phase 3.2: confirm against Spec 113 §8.2 decision
    timeout-minutes: 210     # 90 (coa) + 90 (permits) + checkout/setup/report headroom
    concurrency:
      group: chain-coa-permits
      cancel-in-progress: false   # queue, never cancel a run mid-flight
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci

      - name: Guard — coa concurrency check
        id: coa_guard
        run: node scripts/check-chain-running.js coa >> "$GITHUB_OUTPUT"
        env: *pipeline-env   # §3

      - name: Run coa chain
        id: coa
        if: steps.coa_guard.outputs.skip != 'true'
        continue-on-error: true      # isolation: a coa failure must not skip permits
        timeout-minutes: 90
        run: node scripts/run-chain.js coa
        env: *pipeline-env

      - name: Guard — permits concurrency check
        id: permits_guard
        if: always()
        run: node scripts/check-chain-running.js permits >> "$GITHUB_OUTPUT"
        env: *pipeline-env

      - name: Run permits chain
        id: permits
        if: always() && steps.permits_guard.outputs.skip != 'true'
        timeout-minutes: 90            # NOT continue-on-error — this is the primary
        run: node scripts/run-chain.js permits   # pipeline; its failure MUST redden the job
        env: *pipeline-env

      - name: Surface coa failure for alerting
        if: always() && steps.coa.outcome == 'failure'
        run: |
          echo "::error::coa chain failed — permits ran regardless (isolation preserved), but this run must be marked failed for GH notification alerting."
          exit 1
```

**Why `continue-on-error` on `coa` but not `permits`:** GitHub Actions marks a workflow
run's overall conclusion as `success` if every non-`continue-on-error` step succeeds, even
when a `continue-on-error` step failed. Left as-is, a coa crash would run permits (correct
isolation) but the workflow would show green (wrong — silent failure, exactly the "missed
run visibility" failure mode this migration is meant to close, §7). The final
`if: steps.coa.outcome == 'failure'` step exits 1 specifically to flip the run red and fire
GitHub's failure-notification path (§3) **after** permits has already had its chance to run
— isolation and alerting are both satisfied, not traded off against each other. `permits` —
the chain the whole freshness contract exists to serve — gets no such override: its natural
failure reddens the job immediately, which is the correct, most direct alert path for the
primary pipeline.

**Why `concurrency:` in addition to `check-chain-running.js`:** GitHub Actions' native
`concurrency` group prevents a second `chain-coa-permits.yml` run from even being scheduled
while one is queued/in-flight — a free optimization that avoids burning runner-minutes on a
run that `check-chain-running.js` would immediately skip anyway. It is **not** a substitute
for the DB-row check: `concurrency` only knows about runs of *this* workflow file. A
manually-invoked `node scripts/run-chain.js coa` from a developer machine, or (while it
still exists per §6) a `local-cron.js`-triggered run, is invisible to it. The DB-row check
in `check-chain-running.js` (§4) — mirroring `run-chain.js`'s own chain-level advisory lock
(`run-chain.js` L67-116, `pg_try_advisory_lock(2, hashtext('chain_'||...))`) — remains the
actual cross-trigger-source correctness guarantee; `concurrency:` is defense-in-depth on
top of it, not a replacement.

`chain-sources.yml` and `chain-entities.yml` are single-chain, single-step workflows (no
serialization, no `continue-on-error` split needed) using the same `check-chain-running.js`
guard + `timeout-minutes: 90` + `env: *pipeline-env` pattern as the `permits` step above.

### 2.3 `backup_db` — no extra workflow step

`backup_db` is already the last element of `manifest.chains.permits`
(`scripts/manifest.json` L91). The `permits` step above invokes `run-chain.js permits`
unmodified — it runs `backup_db` as its final step exactly as it does today, satisfying
Decision D9 (Spec 113 §9.3: "the trigger mechanism does not change") with **zero** new
workflow surface. Do not add a separate "backup" step to this workflow; doing so would
double-run the backup and desynchronize it from the chain-completion signal
`backup_db` currently depends on.
</architecture>

---

<architecture>
## 3. Workflow Anatomy — Env, Secrets, Timeout, Alerting

Every workflow in §2 shares this anatomy (the `*pipeline-env` anchor referenced above):

```yaml
env:
  PIPELINE_CHAIN: ${{ github.workflow }}          # observability tag, not a chain selector
  SUPABASE_DATABASE_URL: ${{ secrets.SUPABASE_DATABASE_URL }}   # GH encrypted secret
  SUPABASE_CA_CERT_PATH: ${{ github.workspace }}/scripts/certs/supabase-ca.pem
```

- **`SUPABASE_DATABASE_URL`** — the Cloud-project connection var per Spec 113 §3's env
  contract table, stored as a GitHub Actions **encrypted secret** (repo or environment
  scope — never printed to logs; `run-chain.js`/`pipeline.js` never echo connection
  strings). This is the credential whose exposure risk is explicitly accepted (narrow-scope,
  Vault-adjacent posture) if Network Restrictions end up off per Spec 113 §8.2 option 3.
- **`SUPABASE_CA_CERT_PATH`** — **not a secret**. Per Spec 113 §4.3 ("the cert itself is
  public, not a secret, but its path is part of the environment contract"), the CA PEM is
  **committed to the repo** at `scripts/certs/supabase-ca.pem` and the env var is a plain
  path into the just-checked-out workspace (`${{ github.workspace }}/...`) — available
  immediately after `actions/checkout@v4`, no secret round-trip, no extra fetch step. CA
  rotation (Spec 113 §4.3 runbook) updates this committed file via a normal PR.
- **`CRON_SECRET`** is NOT part of this env block — it guards an HTTP-triggered manual
  endpoint (Spec 113 §8.1), not the scheduled GitHub Actions path, which authenticates via
  the `SUPABASE_DATABASE_URL` secret itself (Postgres auth), not an application-level
  shared secret.
- **`timeout-minutes: 90`** per chain-invocation step is GitHub Actions' **native** step
  timeout, replacing `local-cron.js`'s manual `setTimeout` + `child.kill('SIGKILL')`
  (`local-cron.js` L28-34, L127-138). GitHub Actions sends `SIGTERM` first, then force-kills
  after a short grace period — this is *more* forgiving than `local-cron.js`'s immediate
  `SIGKILL`, and is why `run-chain.js` needs a `SIGTERM` handler (§4) it did not
  strictly need for the local-cron path.
- **Failure alerting via GitHub notifications** — a workflow run whose conclusion is
  `failure` triggers GitHub's built-in run-failure notification (email/web, per the
  repo watcher's notification settings) automatically, with no Buildo-side code. This is
  the retry/alert visibility pg_cron structurally cannot provide (§5) — **the reason
  must-succeed chains live in GitHub Actions, not pg_cron**, restated from Spec 113 §8.4.
  No custom alerting integration is required for this cutover; if paging/Slack alerting is
  wanted later, it hooks the same run-conclusion event and is out of scope here.
</architecture>

---

<architecture>
## 4. `isChainRunning` Re-implementation Contract

`scripts/check-chain-running.js <chain_id>` (**new** file) is the GitHub-Actions-invoked
re-implementation of `local-cron.js`'s `isChainRunning` (`local-cron.js` L80-96). It MUST
reproduce the **exact query**, not a semantically-similar one (Spec 113 §8.3 / G8: "Any
scheduler replacement... MUST re-implement this exact query — substituting a different
concurrency primitive silently changes the correctness guarantee"):

```sql
SELECT id, started_at FROM pipeline_runs
 WHERE pipeline = $1 AND status = 'running'
   AND started_at > NOW() - INTERVAL '12 hours'
 LIMIT 1
```

(`$1` = `chain_${chainId}`, matching `run-chain.js`'s `chainSlug` convention, L61.)

**Contract:**

1. **Not running** (no row) → write `skip=false` to `$GITHUB_OUTPUT`, exit 0. The calling
   workflow step's `if: steps.<guard>.outputs.skip != 'true'` then runs `run-chain.js`.
2. **Running** (row found, `started_at` within 12h) → write `skip=true`, exit 0 (this is a
   legitimate skip, not a script failure — mirrors `local-cron.js`'s `continue` on a
   positive `isChainRunning` result, L184-190).
3. **DB check itself errors** (connection failure, etc.) → **fail-safe skip**: write
   `skip=true`, exit 0, log the error via `console.error` (visible in the Actions log).
   This preserves `local-cron.js`'s explicit fail-safe posture (L91-95: "If we can't check,
   skip to be safe") — an unreachable DB is not a green light to double-fire a chain.
4. **12-hour TTL self-expiry** is inherited automatically from the query's own
   `started_at > NOW() - INTERVAL '12 hours'` clause — a crashed run older than 12h simply
   stops matching, unblocking new runs with no separate cleanup step (Spec 113 §8.3).
5. **Stale-`running`-row alert (new, Round-2 fold, D8):** in the SAME query pass, additionally
   check for a `pipeline_runs` row with `status = 'running' AND started_at <= NOW() -
   INTERVAL '12 hours'` (i.e., a row the 12h clause just excluded from blocking). If found,
   emit a GitHub Actions **warning annotation** —
   `echo "::warning title=Stale pipeline_runs row::chain_${chainId} run id=${row.id} still 'running' since ${row.started_at} (>12h) — investigate; it is no longer blocking new runs but its status is a dashboard lie."` —
   surfaced in the Actions run summary UI. This does **not** rewrite the stale row's status;
   it is visibility only, distinct from item 6.
6. **Explicit terminal status on abnormal exit (new, D8):** `scripts/run-chain.js` MUST
   install a `SIGTERM` handler that, on receipt, immediately issues
   `UPDATE pipeline_runs SET status = 'failed', completed_at = NOW(), error_message = 'Terminated (SIGTERM — likely GH Actions timeout-minutes)' WHERE id = ANY($1)` for the
   current `chainRunId` and any still-`running` `stepRunId`, before exiting. This closes
   the actual gap the 12h-TTL/alert pair (items 4-5) only detects after the fact: a
   `timeout-minutes`-triggered kill (or, previously, `local-cron.js`'s own `SIGKILL` of the
   `run-chain.js` child, L133 — which had **no equivalent handler and shares this exact
   gap today**) currently leaves the row `running` until the 12h TTL, not immediately
   `failed`. `SIGKILL`-class deaths (OOM, host failure) cannot be caught by any handler —
   those still rely on items 4-5, which is why both mechanisms are required, not either
   alone.

`check-chain-running.js` and `run-chain.js`'s chain-level advisory lock (`run-chain.js`
L67-116) are **complementary, not redundant**: the DB-row check runs *before* spawning
`run-chain.js` at all, avoiding a wasted process start and (for a pre-created external run)
an immediate cancelled-row write; the advisory lock is the hard backstop inside
`run-chain.js` itself for any invocation that reaches that point regardless of what
triggered it. Do not remove either on the grounds that the other "already covers it."
</architecture>

---

<architecture>
## 5. pg_cron Job Catalog

Scope per Spec 113 §8.4: **in-DB SQL maintenance only** — `pg_cron`/`pg_net` give no
retry and no alert, and silently skip execution when the database is unhealthy. **No
job in this table may be a must-succeed job** (a chain, `backup_db`, or anything whose
silent skip would be a correctness incident rather than a next-cycle no-op). Each entry is
authored as a **tracked migration** (`cron.schedule(...)` calls are infrastructure, not
application data — they go through `migrate.js` like any other schema-adjacent change, per
Decision D5) at the next available migration number at implementation time (`223` is
current HEAD as of this spec).

| Job name | Schedule | Action | Silent-skip is safe because… |
|---|---|---|---|
| `mv_monthly_permit_stats_refresh` | Nightly, off-peak (e.g. `30 9 * * *` UTC — after the coa→permits workflow) | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_permit_stats;` | **Net-new** — no automated refresh exists in the codebase today (`034_mv_monthly_permit_stats.sql` created it; nothing schedules its refresh). A missed refresh leaves yesterday's snapshot visible one more day; the dashboard consuming it (`docs/specs/02-web-admin/26_admin_dashboard.md`) already tolerates staleness by design. `CONCURRENTLY` requires the matview's existing unique index (verify at implementation — Reality-Check plan-altitude concern, not resolved here). |
| `lead_views_retention_purge` | Daily, `0 9 * * *` UTC | `DELETE FROM lead_views WHERE viewed_at < NOW() - (SELECT COALESCE(variable_value::int, 90) FROM logic_variables WHERE variable_key = 'lead_view_retention_days') * INTERVAL '1 day';` | Pure retention housekeeping (Spec 70 §Database Schema, PIPEDA 90-day SLA). A day's delay in purging past-window rows is not a data-integrity incident — it is the *same* risk profile the old `purge-lead-views.js` "task 1" half already carried as a manually-scheduled script (§6). Reads the tunable retention window from `logic_variables` rather than hardcoding 90, preserving the admin-configurable behavior the JS script had. |
| `offboarding_sweep_30day` | Daily, `0 10 * * *` UTC | `DELETE FROM auth.users WHERE raw_user_meta_data->>'account_deleted_at' IS NOT NULL AND (raw_user_meta_data->>'account_deleted_at')::timestamptz < NOW() - INTERVAL '30 days';` *(exact predicate depends on where `account_deleted_at` lives post-migration — see caveat below)* | **Net-new** — Spec 97 §3.2/L502 documents this sweep as a "TODO: Phase 2" Cloud Function that was **never built** (mobile settings spec, offboarding flow). Zero regression risk: today, nothing purges past-30-day self-deleted accounts at all. Under D6's `auth.users(id)` FK + CASCADE (10-table inventory, Spec 113/ADR-007), deleting the `auth.users` row is now sufficient — the CASCADE network removes every dependent row (`lead_views`, `lead_view_events`, `device_tokens`, `subscribe_nonces`, `tracked_projects`, `notifications`, `notification_dispatches`, `user_profiles`) in one statement; `admin_watchlist`/`admin_audit_log` intentionally do **not** cascade (SET NULL/RESTRICT, ADR-007) and are unaffected. **Caveat (flagged for Phase 3.2, not resolved here):** whether `account_deleted_at` lives on `user_profiles` (current shape, migration 502-referenced) or gets mirrored into `auth.users` metadata is a Spec 13/Spec 97-rewrite decision this scheduling spec does not own — the job's exact `WHERE` predicate MUST be finalized against whichever spec lands that column, not assumed here. |

This table is **extensible without a spec amendment**: a new pg_cron job may be added
directly as a migration provided it satisfies the must-not-be-must-succeed constraint
above; it does not need to be enumerated here first. VACUUM/ANALYZE tuning beyond
Postgres's own autovacuum is deliberately not itemized — add an entry if and when a
specific table's autovacuum settings prove insufficient, rather than pre-guessing one now.
</architecture>

---

<architecture>
## 6. `pipeline_schedules` Wiring

Per Spec 113 §8.5 / G8: `pipeline_schedules.cron_expression` is currently **decorative,
not inert** — read by `GET /api/admin/pipelines/schedules` (`src/app/api/admin/pipelines/
schedules/route.ts` L9-19) and by `GET /api/admin/stats` (`src/app/api/admin/stats/
route.ts` L294-309, feeding `src/components/DataQualityDashboard.tsx` L79/426/468/503), but
never written with a real value and never consulted by any scheduler (`run-chain.js` reads
this table only for the unrelated `enabled` disable-flag, L144-154 — never `cron_expression`).

**Phase 3.2 MUST write real values** — one `UPDATE`/seed per row, keyed by the `pipeline`
slug already used for the `enabled` toggle (`chain_${chainId}` per §4, or the bare
`chainId` — match whatever `run-chain.js`'s existing `disabledSlugs` lookup expects,
verified at implementation, not re-derived here):

| `pipeline` | `cadence` | `cron_expression` |
|---|---|---|
| `coa` | `Daily` | `0 11 * * 1-5` (§2 table) |
| `permits` | `Daily` | `0 11 * * 1-5` |
| `sources` | `Quarterly` | `0 13 1 1,4,7,10 *` |
| `entities` | `Daily` | `0 8 * * *` |

Writing these values is the entire scope of this wiring step — it does **not** make
`pipeline_schedules` authoritative over scheduling (GitHub Actions' own workflow YAML
remains authoritative; this table is display-only, now truthfully so instead of
half-truthfully so). A future drift-guard (CI check that `cron_expression` matches the
workflow YAML) is a reasonable post-launch hardening item, not built in this cutover.
</architecture>

---

<architecture>
## 7. `scripts/local-cron.js` Disposition

**Decision (this spec, Phase 3.2 scope): DEMOTED to dev-only convenience, not retired.**

Rationale: `local-cron.js`'s own header already frames it as running "alongside the
Next.js dev server" for local triggering — it has never been the sole production trigger
path once GitHub Actions lands, and nothing in Phases 0-2 removes the value of a
developer being able to exercise the same 3 schedules locally without waiting for a real
cron tick (e.g., to smoke-test a manifest change before pushing). Full retirement would
regress that local dev-loop capability for no correctness gain — the file is not a
security or correctness liability once GitHub Actions is the authoritative scheduler; it
is redundant only in the "who actually triggers production" sense, not in the
"is it useful" sense.

**Required changes at Phase 3.2 (not deferred — a demoted-but-drifted file is worse than
no file):**

1. Header comment updated: *"Local development convenience only — NOT the production
   scheduler. Production scheduling is GitHub Actions (`docs/specs/00-architecture/
   115_scheduling.md`). This file exists so a developer can exercise the same 3 chain
   schedules locally without waiting for a cron tick."*
2. `isChainRunning` (`local-cron.js` L80-96) MUST be refactored to **call the same query
   logic as `scripts/check-chain-running.js`** (§4) — e.g. both import a shared
   `scripts/lib/chain-concurrency.js` helper — rather than maintaining two independently-
   evolving copies of the "exact query" Spec 113 §8.3 requires to stay exact. A future edit
   to the concurrency query that only touches one of the two files is exactly the kind of
   drift this rule exists to prevent.
3. `npm run local-cron` stays as the invocation entrypoint; no rename required by this
   spec.

`local-cron.js` is explicitly **out of scope for the GitHub Actions workflows in §2** —
it is never invoked by CI/CD and holds no production credential it doesn't already hold
today (developer's own `.env`).
</architecture>

---

<architecture>
## 8. Network Restrictions — Amendment Placeholder

Spec 113 §8.2 already documents the 3 candidate options (allowlist GitHub's published
Actions IP ranges / self-hosted runner / restrictions off + strong auth) and states the
decision is made explicitly at Phase 3.2 implementation time. **This spec does not
duplicate or pre-select among them.** When Phase 3.2 makes the call:

- The chosen option MUST be recorded as an **amendment to Spec 113 §8.2** (not to this
  spec) — that section is the durable policy record for the decision.
- This spec's workflow YAML (§2.2) carries a `# TODO Phase 3.2` marker on `runs-on:` for
  exactly this reason: `runs-on: ubuntu-latest` (GitHub-hosted) only holds if option 1 or 3
  is chosen; option 2 (self-hosted runner) changes that line to `runs-on: self-hosted`
  (plus label(s) per whatever runner-host provisioning Phase 3.2 sets up) across all three
  workflow files in §2.
- If option 1 (allowlist rotation) is chosen, the periodic sync job it requires is itself a
  pg_cron-**inappropriate** must-succeed-adjacent concern (a missed sync silently starts
  rejecting legitimate runner IPs) — it should run as its own GitHub Actions scheduled
  workflow, not a §5 pg_cron entry, when/if built.
</architecture>

---

<failure_modes>
## 9. Known Failure Modes

- **pg_cron silent-skip on unhealthy DB** — `pg_cron` jobs simply do not fire (no retry,
  no alert) if the database is unreachable or under enough load that the cron worker
  itself can't connect. Guard: §5's catalog is scoped exclusively to jobs where a missed
  cycle is a no-op, never a must-succeed job (Spec 113 §8.4) — this failure mode is
  *accepted*, not mitigated, for every job in the catalog by construction.
- **GitHub-hosted runner IP rotation vs. Network Restrictions allowlist** — if §8's Phase
  3.2 decision lands on option 1, GitHub's published Actions IP ranges rotate over time; a
  stale allowlist silently starts rejecting legitimate scheduled runs (connection refused,
  visible as a `run-chain.js` startup failure, not a silent no-op — at least it's loud).
  Guard: the periodic allowlist-sync job noted in §8, or pick option 2/3 instead.
- **Concurrent workflow runs racing `isChainRunning`** — a manual `workflow_dispatch`
  trigger overlapping a scheduled run creates a narrow TOCTOU window between
  `check-chain-running.js`'s read and `run-chain.js`'s own advisory-lock acquisition (§4).
  This is the same race `local-cron.js` always had (a manual `node scripts/run-chain.js`
  invocation was always possible alongside the cron daemon) — `run-chain.js`'s chain-level
  advisory lock (L67-116) is the actual guarantee that closes it; `check-chain-running.js`
  only reduces how often the race is *hit*, it does not need to *close* it (§4's
  "complementary, not redundant" note).
- **Stale `running` row surviving past 12h with no alert wired** — if §4 item 5's
  warning-annotation logic is skipped at implementation (e.g., only items 1-4 are built),
  the row still stops blocking (correctness intact) but an operator has no signal that a
  run died abnormally short of noticing a gap in `pipeline_runs` history manually. This is
  the exact "missed run visibility" gap D8 named as motivating this whole migration —
  treat §4 item 5 as non-optional, not a nice-to-have.
- **`SIGTERM` handler omitted from `run-chain.js`** — if §4 item 6 is skipped, a
  `timeout-minutes`-triggered kill (or, on the demoted `local-cron.js` path, its existing
  `SIGKILL`, §7) leaves the row `running` for up to 12h before it merely *stops blocking* —
  it is never marked `failed`, so a dashboard reading `pipeline_runs` directly (rather than
  through the 12h-aware `check-chain-running.js` query) shows a phantom in-progress run for
  up to half a day. This is a real, currently-unfixed gap in the codebase as of this spec
  (§4 item 6) — not a hypothetical regression risk.
- **DST cron drift (§2.1)** — accepted, not a bug; documented so a future reviewer doesn't
  "fix" it into a two-cron-line date-gated scheme without re-reading this rationale.
</failure_modes>

---

<constraints>
## 10. Operating Boundaries

### Target Files
- `.github/workflows/chain-coa-permits.yml` (new — §2.2)
- `.github/workflows/chain-sources.yml` (new — §2.2)
- `.github/workflows/chain-entities.yml` (new — §2.2)
- `scripts/check-chain-running.js` (new — the `isChainRunning` re-implementation, §4)
- `scripts/lib/chain-concurrency.js` (new — shared query helper imported by both
  `check-chain-running.js` and the demoted `local-cron.js`, §4/§7)
- `scripts/run-chain.js` (`SIGTERM` handler addition, §4 item 6 — the only behavioral
  change to this file; all other `run-chain.js` behavior is unmodified)
- `scripts/local-cron.js` (header + `isChainRunning` refactor to shared helper — demoted,
  not deleted, §7)
- `scripts/certs/supabase-ca.pem` (new — committed CA cert, §3; governed by Spec 113 §4.3's
  rotation runbook, not re-specified here)
- `migrations/` (new — pg_cron job registrations per §5's catalog, next available number)
- `src/app/api/admin/pipelines/schedules/route.ts`, `src/app/api/admin/stats/route.ts`,
  `src/components/DataQualityDashboard.tsx` — **read-only consumers**, not modified by this
  spec; §6's `pipeline_schedules` writes are a data change (seed/UPDATE), not a code change
  to these files.

### Out-of-Scope Files
- `scripts/backup-db.js` internals — Spec 112's rewrite; §2.3 only states that
  `backup_db`'s trigger position (last step of `manifest.chains.permits`) does not change.
- `scripts/lib/ssl-config.js`, TLS/CA mechanics beyond the env-var wiring in §3 — Spec 113
  §4 owns this; this spec only consumes `SUPABASE_CA_CERT_PATH` as an already-decided
  contract.
- Vault / `CRON_SECRET` RPC internals — Spec 113 §11; this spec only notes (§3) that
  `CRON_SECRET` guards a different (HTTP-manual-trigger) surface than the scheduled
  workflows this spec defines.
- `docs/specs/03-mobile/97_mobile_settings_notifications_offboarding.md` rewrite — the
  `offboarding_sweep_30day` job (§5) implements the SQL action Spec 97 already describes as
  a deferred TODO; finalizing Spec 97's own text (and the exact column the sweep predicate
  reads, §5 caveat) is that spec's rewrite, not this one's.
- RLS policy definitions, Network Restrictions' *chosen* option (§8) — explicitly deferred
  to Phase 3.2 and Spec 113 §8.2 respectively.

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/00-architecture/113_supabase_infrastructure.md` §3 (env/key
  contract), §4 (TLS/CA), §8 (scheduling policy this spec implements), §9.3 (`backup_db`
  re-homing); `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (§R1-R12 skeleton —
  `check-chain-running.js` is a new script and follows it where applicable, adapted for its
  non-`pipeline.run()` GH Actions invocation shape); `scripts/manifest.json` (`chains.*`,
  `backup_db` position).
- **Consumed by:** none yet — this is a leaf spec in the current dependency graph. A future
  Network-Restrictions-allowlist-sync spec (§8, §9) would depend on this one's `runs-on:`
  contract if built.
</constraints>
</content>
