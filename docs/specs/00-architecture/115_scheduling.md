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

**In scope:** the 5 GitHub Actions workflow definitions (4 chain workflows + the
pipeline-freshness watchdog, §2/§2.4/§2.5); workflow anatomy (checkout, env,
secrets, invocation, timeout, alerting); the `isChainRunning` re-implementation contract;
the pg_cron job catalog; `pipeline_schedules` wiring; `scripts/local-cron.js` disposition;
the Network Restrictions decision record (§8).

**Out of scope:** Vault RPC internals (Spec 113 §11), TLS/CA mechanics beyond citing where
the workflow reads them (Spec 113 §4), `backup-db.js` script internals (Spec 112 rewrite),
RLS policy content (the RLS Policy Catalog spec), application-level auth (Spec 13).
</requirements>

---

<architecture>
## 2. GitHub Actions Workflow Definitions

**Four chain workflows** (AMENDED 2026-07-20 — operator cadence rulings supersede the
original "preserved exactly" stance and `local-cron.js`'s legacy cadences; the coa→permits
freshness contract and its serialization requirement, `local-cron.js` L41-53, are
preserved unchanged). All invoke `scripts/run-chain.js` directly on the GitHub Actions
runner (Spec 113 §8.1 — no Vercel function ever hosts a chain).

| # | File | Chain(s) | Cadence (operator-ruled 2026-07-20) | UTC cron (see §2.1 DST note) |
|---|---|---|---|---|
| 1 | `.github/workflows/chain-coa-permits.yml` | `coa` → `permits`, **serialized in one workflow** | ~6 AM ET, EVERY night (×7) | `0 11 * * *` |
| 2 | `.github/workflows/chain-sources.yml` | `sources` | WEEKLY, ~8 AM ET Sunday | `0 13 * * 0` |
| 3 | `.github/workflows/chain-entities.yml` | `entities` | 3 AM ET daily (unchanged) | `0 8 * * *` |
| 4 | `.github/workflows/chain-deep-scrapes.yml` | `deep_scrapes` (§2.4) | 3×/day, **WEEKDAYS ONLY, business hours** (~10 AM/1 PM/4 PM EST · 11/2/5 EDT) | `0 15,18,21 * * 1-5` |

The deep_scrapes slots deliberately start at 15:00 UTC — clearing the 11:00 UTC nightly
coa→permits window plus its ~3h worst case, because `deep_scrapes` SHARES
`refresh_snapshot`/`assert_data_bounds`/`assert_engine_health` with the nightly chains and
shared-step advisory locks SKIP on contention rather than queue (runbook §3 rule 3).

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
  for a cosmetic 1-hour wobble twice a year.

**AMENDED 2026-07-20 (program-plan panel reconciliation):** the program plan's D8 panel
ruled "single UTC cron + in-job ET check (dual entries rejected as drift-prone)". This
spec's accepted-drift stance and that ruling are reconciled as follows: each workflow keeps
a SINGLE UTC cron entry (no dual lines), and the concurrency-guard step additionally logs
the current America/Toronto time and emits a `::notice` drift annotation (the in-job ET
check, observability-grade — it never skips a run, honoring this section's rationale that
late-not-early drift is safe). The deep_scrapes slots (§2) are chosen to remain inside
business hours under BOTH DST regimes, so drift never pushes them outside the operator's
weekday/business-hours ruling.

### 2.2 `chain-coa-permits.yml` job shape (serialization + failure isolation)

The freshness contract (`local-cron.js` L41-53, `chain.logic.test.ts` "serialized daily
job runs coa strictly before permits") and the failure-isolation guarantee
(`chain.logic.test.ts` "serialized job continues to the next chain when one chain fails")
are **both preserved**, translated from `local-cron.js`'s JS `try/catch`-around-`await`
loop into GitHub Actions step semantics:

```yaml
jobs:
  coa-then-permits:
    runs-on: ubuntu-latest   # RESOLVED Phase 3.2 (2026-07-20): GitHub-hosted for ALL workflows — Spec 113 §8.2 option 3 ruled (restrictions off + strong auth); deep_scrapes also GH-hosted (§2.4)
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

### 2.4 `chain-deep-scrapes.yml` — deep_scrapes workflow

**Runner (operator-ruled 2026-07-20 — Spec 113 §8.2 amendment, option 3): GitHub-hosted**
(`runs-on: ubuntu-latest`), same as the other three chain workflows. The Decodo
residential proxy carries ALL AIC traffic the `inspections` step (`aic-orchestrator.py`)
generates, so the GitHub-hosted runner's own datacenter IP is never WAF-visible to AIC —
the exact property that would otherwise argue for a self-hosted runner (P3-D1's option
(a)). Because the proxy forces headed Chrome (P3-G4), the workflow runs the orchestrator
under `xvfb-run` on the Linux runner (`xvfb-run -a python3 scripts/aic-orchestrator.py
...`, matching whatever invocation the `inspections` step already uses locally, with a
guarded `RuntimeError` — not a silent hang — if `xvfb-run` is unavailable). Persistent
stealth profiles (`~/.buildo-scraper/profile-worker-N`) are restored between runs via
`actions/cache` keyed on the workflow name, because a fresh ephemeral GitHub-hosted runner
otherwise has no profile history between runs — profile continuity is part of what keeps
the browser fingerprint stable across scrapes. A cache miss (first run, or a cache
eviction) degrades to a fresh profile; this is visible only after the fact, via the
scrape-success verdicts in `pipeline_runs` (§9's "ephemeral-profile cache miss" failure
mode) — there is no separate cache-miss alert. Decodo proxy credentials live in GitHub
encrypted secrets per Spec 113 §11's CI-runner carve-out (the workflow-execution
credential class, distinct from the Vault-stored pipeline-secret class §11 otherwise
mandates). A `concurrency:` group (`chain-deep-scrapes`, `cancel-in-progress: false`)
prevents two deep_scrapes runs from overlapping, mirroring §2.2's rationale for the
coa→permits workflow. Operator's decisive factor for GitHub-hosted over self-hosted:
headed Chrome windows running on the operator's own box would disrupt the local workday
every 3 hours on weekdays; the proxy already removes the WAF-visibility argument for
self-hosting.

**Chain shape:** `deep_scrapes` is the 7-step chain at `manifest.json:115-118`
(`inspections`, `classify_inspection_status`, `assert_network_health`,
`refresh_snapshot`, `assert_data_bounds`, `assert_engine_health`, `assert_staleness`) —
not the single-step chain an earlier draft assumed. The last three of those seven steps
(`refresh_snapshot`, `assert_data_bounds`, `assert_engine_health`) are SHARED with the
nightly `coa`/`permits` chains — the §2 table's slot rationale (deep_scrapes slots
starting at 15:00 UTC) exists specifically so this chain's shared-step invocations never
land inside the 11:00 UTC nightly window, where the shared steps' advisory locks SKIP on
contention rather than queue (runbook §3 rule 3) and would silently drop deep_scrapes' own
pass over those steps.

**CRITICAL failure-detection contract (Integration HIGH-2, P3-G4):** `aic-orchestrator.py`
exits 0 on a scrape-level failure BY DESIGN — a verdict-only FAIL surfaces as
`run-chain.js`'s `completed_with_errors` chain status, which is itself a normal (exit 0)
process termination; only a hard orchestrator crash exits non-zero. A workflow that gates
solely on the `run-chain.js` process exit code would therefore report GREEN on a scrape
that fully failed — the opposite of what this whole migration exists to fix (§7's "missed
run visibility" gap). `chain-deep-scrapes.yml` MUST, after invoking `node
scripts/run-chain.js deep_scrapes`, separately query `pipeline_runs` for that run's
`status`/verdict and `exit 1` if the status is `completed_with_errors` (or any step's
`records_meta.audit_table.verdict` is `FAIL`) — generalizing §2.2's coa red-flip pattern: a
step that reads the real DB-recorded outcome and reddens the job itself, rather than
trusting the child process's own exit code.

**Shared anatomy:** the same `check-chain-running.js` guard + `timeout-minutes: 90` +
`env: *pipeline-env` (§3) pattern as `chain-sources.yml`/`chain-entities.yml`, plus the
PG17-client and `migrate.js --verify` steps §3 mandates for every workflow reaching
`pg_dump` or `run-chain.js`.

### 2.5 `pipeline-watchdog.yml` — freshness watchdog (restores the dropped program mandate, P3-D9)

**Cadence:** daily `30 15 * * *` UTC — after the 11:00 UTC nightly coa→permits window plus
its ~3h worst case, so the same night's permits/backup run has had time to land before the
watchdog checks for it.

**Checks against `pipeline_runs` (both required — neither substitutes for the other):**

1. **Chain freshness — ALL FIVE scheduled chains (AMENDED, F8 fold 2026-07-20).** The
   original scope here was `chain_permits` + `chain_coa` only; live review of
   `check-pipeline-freshness.js` found it never grew to cover the other 3 chains this same
   spec's §2 table schedules, leaving `chain_sources`/`chain_entities`/`chain_deep_scrapes`
   with NO absence-detection coverage at all. The check now requires a completed run for
   EVERY applicable chain, each within its own window:
   - `chain_coa`, `chain_permits` — 25h (unchanged, Spec 07 §OP4 SLA).
   - `chain_entities` — 26h (daily cadence + buffer).
   - `chain_sources` — 204h (8 days + 12h slack — weekly Sunday cadence).
   - `chain_deep_scrapes` — weekday-aware, since it never runs Sat/Sun (§2.4): the check does
     not apply at all on Sat/Sun (no run is expected — not the same as "stale"), 72h on
     Monday (reaches back through the weekend to Friday's last slot), 26h Tue-Fri.
   A "completed" run means `pipeline_runs.status` is one of `completed` /
   `completed_with_warnings` / `completed_with_errors` (F8 fold — this check is
   ABSENCE detection only; pass/fail visibility now comes from
   `scripts/check-chain-verdict.js`'s per-run verdict-check steps in each chain workflow,
   which generalize the exit-0-masking guard §2.4 already required for `deep_scrapes` to
   all 5 chains). Missing any applicable chain → `exit 1` (the job goes red, firing GitHub's
   run-failure notification per §3). This closes the gap GitHub's own per-workflow
   notifications structurally cannot: a scheduled workflow that never fires at all (a
   platform outage, a `schedule:` block that silently stopped triggering) produces no run
   to notify about — only an independent daily check that looks for the ABSENCE of a
   completed run catches that.
2. **Backup freshness + safety-net trigger.** A completed backup within the last 25h,
   matching BOTH row shapes `backup_db` can be written under (P3-G6): the scoped-slug
   `permits:backup_db` step row (the scoped-slug INSERT at `run-chain.js:379` + completion
   UPDATE at `:508` — S3 fold 2026-07-22, corrected from a stale `:362` citation which lands
   on a closing brace) and a standalone `backup_db` slug row
   (a direct, non-chain invocation). If no such row exists within 25h AND the `permits`
   chain is not CURRENTLY running (a race guard — a permits chain in flight may complete
   its own `backup_db` step moments later; invoking `backup-db.js` concurrently with that
   would double-run it) → invoke `scripts/backup-db.js` directly. This IS Spec 112 §6's
   safety-net role, merged into this single workflow rather than a separate one —
   cross-reference Spec 112 §6, which now points back here for the trigger mechanism. If a
   completed backup still cannot be confirmed after the direct invocation → `exit 1`.

**Workflow anatomy:** PG17-client install step (this workflow reaches `pg_dump` via the
direct `backup-db.js` invocation, §3's mandate); `migrate.js --verify` pre-flight; the
`SUPABASE_DATABASE_URL` non-empty guard (§3/§8's inertness note). `runs-on: ubuntu-latest`;
`workflow_dispatch` active; `schedule:` block committed commented-out per §8/P3-D6 until
Phase 4.3.

**Dashboard surfacing (implemented at F4, referenced here only):** `GET
/api/admin/stats` and `DataQualityDashboard.tsx` gain a per-chain `last_completed_at`
freshness block reading the same `pipeline_runs` facts this workflow checks — an operator
looking at the dashboard sees the same freshness picture the watchdog alerts on, not a
second, independently-derived one.
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
- **PG17 client provisioning** — every workflow whose steps reach `pg_dump`/`pg_restore`
  (the `backup_db` step inside `chain-coa-permits.yml`'s `permits` invocation, and
  `pipeline-watchdog.yml`'s direct `backup-db.js` safety-net invocation, §2.5) installs the
  PG17-line `postgresql-client-17` package (PGDG apt repo) as an explicit step before that
  invocation — Spec 112 §5's client-version rule (client ≥ highest server version touched,
  PG17 here) is not satisfied by whatever `pg_dump` ships on `ubuntu-latest` by default.
  Workflows that never invoke `pg_dump`/`pg_restore` (`chain-sources.yml`,
  `chain-entities.yml`, `chain-deep-scrapes.yml`) do not need this step.
- **`migrate.js --verify` pre-flight** — every workflow that invokes `run-chain.js` runs
  `node scripts/migrate.js --verify` as a step immediately after `npm ci` and before the
  first chain/guard step. This is the runbook §3 rule-2 deploy-ordering requirement encoded
  as an automated step rather than left to operator discipline: a workflow whose target
  schema has drifted (an unapplied or checksum-mismatched migration) fails loudly here,
  before any pipeline script runs against a schema it wasn't written for.
- **UTC/DST drift** — every workflow's concurrency-guard step additionally logs the current
  America/Toronto time and emits a `::notice` drift annotation; see §2.1 for the full
  reconciliation this implements (single UTC cron entry + observability-grade in-job ET
  check, never a skip).
- **Inertness mechanism (P3-D6).** Every workflow file in §2 is committed with its
  `schedule:` block PRESENT BUT COMMENTED OUT, with `workflow_dispatch:` left active for
  manual testing. This is deliberately NOT gated by secret presence: a missing GitHub
  secret interpolates to an empty string and does not, on its own, fail a workflow — relying
  on that for inertness would be a silent trap the moment the secret is later provisioned
  for an unrelated reason. Phase 4.3 activation is a single PR that uncomments every
  `schedule:` block at once. Independent of activation state, the concurrency-guard step in
  every workflow still verifies `SUPABASE_DATABASE_URL` is non-empty and `exit 1`s loudly if
  it is absent — this protects manual `workflow_dispatch` invocations (which ARE live
  pre-4.3) from silently no-op-ing against an empty connection string.
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
3. **DB check itself errors** (connection failure, etc.) → **fail-safe skip, loudly (P3-D8
   amendment, 2026-07-20 — Spec 115 §4 item 3):** write `skip=true` AND `exit 1`, log the
   error via `console.error` (visible in the Actions log). The `skip=true` half preserves
   `local-cron.js`'s original fail-safe posture (L91-95: "If we can't check, skip to be
   safe") — an unreachable DB is never a green light to double-fire a chain. The `exit 1`
   half is new: the original design (`skip=true`, exit 0) made a DB outage indistinguishable
   from a legitimate "chain already running" skip — both looked like a quiet green no-op.
   An unreachable database is an OUTAGE SIGNAL, not a routine skip, and must redden the
   job and fire GitHub's failure notification (§3) so an operator investigates rather than
   the chain silently not running for however many days the outage lasts.
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
6. **Explicit terminal status on abnormal exit (D8, AMENDED — SIGINT + SIGTERM, P3-D7):**
   `scripts/run-chain.js` MUST install handlers for **both `SIGINT` and `SIGTERM`** — GitHub
   Actions sends `SIGINT` first on a `timeout-minutes` expiry or a cancelled run, then
   `SIGTERM` roughly 7.5s later if the process hasn't exited (Integration LOW-7); a handler
   registered only for `SIGTERM` would miss the first, more common signal entirely. On
   receipt of either, the handler immediately issues
   `UPDATE pipeline_runs SET status = 'failed', completed_at = NOW(), error_message = 'Terminated (SIGINT/SIGTERM — likely GH Actions timeout/cancellation)' WHERE id = ANY($1) AND status = 'running'`
   for the current `chainRunId` and any still-`running` `stepRunId`, before exiting. The
   `error_message` column is live-verified to exist on `pipeline_runs`; there is NO
   `step_name` column (see Spec 112 §7's corresponding correction) — the `UPDATE` targets
   rows by `id`, not by a `step_name` match. This closes the actual gap the 12h-TTL/alert
   pair (items 4-5) only detects after the fact: a `timeout-minutes`-triggered kill (or,
   previously, `local-cron.js`'s own `SIGKILL` of the `run-chain.js` child, L133 — which had
   **no equivalent handler and shares this exact gap today**) currently leaves the row
   `running` until the 12h TTL, not immediately `failed`. `SIGKILL`-class deaths (OOM, host
   failure) cannot be caught by any handler — those still rely on items 4-5, which is why
   both mechanisms are required, not either alone.

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
| `mv_monthly_permit_stats_refresh` | Nightly, `30 14 * * *` UTC — **AMENDED 2026-07-20**: re-timed to land AFTER the amended nightly window (coa→permits now runs `0 11 * * *` UTC every night, §2, plus its ~3h worst case) | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_permit_stats;` | **Net-new** — no automated refresh exists in the codebase today (`034_mv_monthly_permit_stats.sql` created it; nothing schedules its refresh). A missed refresh leaves yesterday's snapshot visible one more day; the dashboard consuming it (`docs/specs/02-web-admin/26_admin_dashboard.md`) already tolerates staleness by design. `CONCURRENTLY` requires the matview's own unique index — **VERIFIED** (`idx_mv_monthly_month_type`, live-checked; the earlier "verify at implementation" hedge is closed). *Pre-existing oddity fixed by this amendment: the original `30 9 * * *` UTC comment claimed to run "after" an `0 11 * * *`-equivalent workflow while actually preceding it by 1.5h — the new `30 14 * * *` slot is genuinely after, not just nominally.* |
| `lead_views_retention_purge` | Daily, `0 9 * * *` UTC | `DELETE FROM lead_views WHERE viewed_at < NOW() - make_interval(days => (SELECT COALESCE(variable_value::int, 90) FROM logic_variables WHERE variable_key = 'lead_view_retention_days'));` — **AMENDED (Schema-Fidelity F5):** `logic_variables.variable_value` is `NUMERIC`, not an interval-multipliable type; `make_interval(days => ...)` is the correct cast, replacing the earlier `... * INTERVAL '1 day'` shape which does not type-check against a `NUMERIC` operand the same way. | Pure retention housekeeping (Spec 70 §Database Schema, PIPEDA 90-day SLA). A day's delay in purging past-window rows is not a data-integrity incident — it is the *same* risk profile the old `purge-lead-views.js` "task 1" half already carried as a manually-scheduled script (§6). Reads the tunable retention window from `logic_variables` rather than hardcoding 90, preserving the admin-configurable behavior the JS script had. |
| `offboarding_sweep_30day` | Daily, `0 10 * * *` UTC | **AMENDED (Schema-Fidelity F3/F4) — predicate + execution shape rewritten to reality:** the sweep no longer targets `auth.users.raw_user_meta_data` (no such mirrored column exists — see caveat resolution below); it reads `user_profiles.account_deleted_at` (mig 114:32, live-verified as the ONLY location this timestamp lives). Because `admin_audit_log.admin_uid` is `ON DELETE RESTRICT` (mig 229:96-106, a **deliberate fence** — an audit trail must survive the account that authored it), a single batch `DELETE FROM auth.users WHERE ...` aborts ENTIRELY the moment it hits any swept user who ever authored an audit-log row, blocking every OTHER eligible user's deletion too. The job therefore runs **PER-USER**, in a `DO` block loop over `user_profiles WHERE account_deleted_at < NOW() - INTERVAL '30 days'`, with **per-row exception handling**: a `DELETE FROM auth.users WHERE id = <row>` wrapped so a `foreign_key_violation` on that specific row is caught, `RAISE WARNING`'d (surfaced in `cron.job_run_details`, visible to an operator without a separate alert channel) and skipped rather than aborting the whole sweep — the skipped, audit-authoring user is left for manual RTBF scrub (the same pattern the P24 work already established). Non-audit-authoring users still delete normally via `auth.users`'s CASCADE network onto the 10-table D6 inventory. A partial index `CREATE INDEX ... ON user_profiles (account_deleted_at) WHERE account_deleted_at IS NOT NULL` rides the same catalog migration (Gemini MED — cheap insurance for what would otherwise be a full-table scan every run). | **Net-new** — Spec 97 §3.2 **(L504, corrected from an earlier L502 mis-cite)** documents this sweep as a "TODO: Phase 2" Cloud Function that was **never built** (mobile settings spec, offboarding flow). Zero regression risk: today, nothing purges past-30-day self-deleted accounts at all. |

This table is **extensible without a spec amendment**: a new pg_cron job may be added
directly as a migration provided it satisfies the must-not-be-must-succeed constraint
above; it does not need to be enumerated here first. VACUUM/ANALYZE tuning beyond
Postgres's own autovacuum is deliberately not itemized — add an entry if and when a
specific table's autovacuum settings prove insufficient, rather than pre-guessing one now.

**All call sites in this catalog are schema-qualified** (`cron.schedule(...)`,
`net.http_post(...)` where applicable) — see §5a for why that is the actual portability
guarantee, not a schema pin.
</architecture>

---

<architecture>
## 5a. Schema Determinism — `pg_cron` / `pg_net` Call-Site Rule

The original program-plan bullet (`.cursor/active_task.md` Phase 3.2, pre-2026-07-20) called
for "pinning pg_cron/pg_net to the `extensions` schema." That mechanism is **impossible as
worded and unnecessary for correctness** (Schema-Fidelity F1 + Integration + DeepSeek,
converged CRITICAL finding, P3-G8):

- **pg_cron 1.6.4** is live-verified `extnamespace = pg_catalog`, `extrelocatable = false` —
  control-file-fixed. It CANNOT be moved to `extensions` or anywhere else, ever. Its entire
  callable surface (`cron.schedule`, `cron.unschedule`, `cron.job`, `cron.job_run_details`,
  …) is hardcoded in the **`cron`** schema regardless of which schema the extension's own
  catalog entry lists.
- **pg_net 0.20.3** is likewise non-relocatable; its functions are hardcoded in the **`net`**
  schema.
- Both are therefore **search_path-independent** from any call site that schema-qualifies
  its calls — pinning an extension's catalog-entry schema buys nothing for callers that
  already write `cron.*`/`net.*` explicitly.

**Migration 224's missing `SCHEMA extensions` clause on its `CREATE EXTENSION` statements is
CORRECT, not a defect** to retroactively "fix." The schema-determinism migration (§5, P3-D4
mechanism ①, authored at implementation) instead:

1. **Asserts/NOTICEs the live layout** — `extnamespace`/`extrelocatable` for both
   extensions, and the schema housing each extension's catalog entry — so a future drift is
   visible in migration output rather than silently assumed.
2. **Adds `SCHEMA extensions` to the pg_net `CREATE EXTENSION IF NOT EXISTS`, for fresh
   installs only**, guarded on the `extensions` schema existing (it does **not** exist on
   Docker/CI images, where pg_net would otherwise fail to install at all if the clause were
   unconditional). This affects only where pg_net's catalog entry is *recorded* — not where
   its functions live, which remain hardcoded `net.*` either way.

**The durable rule, and the actual guarantee:** every call site in this codebase invokes
`cron.schedule(...)`, `cron.unschedule(...)`, `net.http_post(...)`, etc. **schema-qualified —
never bare, never relying on `search_path` to resolve them.** That qualification, not a
schema pin, is what makes these extensions' behavior identical across the three
simultaneously-live Postgres instances of the Phase 0–3 coexistence window (Spec 113 §12).
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

**AMENDED 2026-07-20 (P3-G11) — the seed mechanism, row inventory, and values below all
replace the earlier draft, which used a dead `ON CONFLICT` precedent and omitted rows that
do not yet exist.**

**Row inventory (live-verified):** `pipeline_schedules` currently holds 27 **step-level**
rows, ALL with `chain_id = NULL` and `cron_expression = NULL`. There are **no** `sources`,
`entities`, or `deep_scrapes` rows at all today — a plain `UPDATE ... WHERE pipeline = ...`
silently no-ops for all three, writing nothing. The values below are therefore written via
`INSERT`, not `UPDATE`.

**Seed mechanism:** the seed runs as an **idempotent, re-runnable SCRIPT**
(`scripts/seed-pipeline-schedules.js`, authored at P3-F5, not a one-shot migration), using

```sql
INSERT INTO pipeline_schedules (pipeline, cadence, cron_expression, chain_id, enabled)
VALUES ($1, $2, $3, NULL, TRUE)
ON CONFLICT (pipeline, COALESCE(chain_id, '__ALL__'))
DO UPDATE SET cadence = EXCLUDED.cadence, cron_expression = EXCLUDED.cron_expression
```

matching the expression-index unique constraint migration 095 actually left in place
(`idx_pipeline_schedules_scope (pipeline, COALESCE(chain_id,'__ALL__'))` — the 038-era plain
`PRIMARY KEY (pipeline)` this table's original design assumed is GONE). The admin PATCH
handler (`route.ts:80-86`) already targets this exact `ON CONFLICT` shape successfully — it
is the working precedent this seed script copies; migration 048's `ON CONFLICT (pipeline)`
shape would fail at runtime today (no such constraint exists to infer against) and MUST NOT
be copied. New rows use `chain_id = NULL` (global scope) — migration 095's `chain_id` CHECK
constraint excludes `'deep_scrapes'` from its allowed values, which is fine here since none
of these rows need per-chain scoping; noted for any future per-chain-scoped schedule.

**Values written (per-pipeline, matching §2's amended cadences):**

| `pipeline` | `cadence` | `cron_expression` |
|---|---|---|
| `coa` | `Daily` | `0 11 * * *` |
| `permits` | `Daily` | `0 11 * * *` |
| `sources` | `Weekly` | `0 13 * * 0` |
| `entities` | `Daily` | `0 8 * * *` |
| `deep_scrapes` | `Weekdays (3x Daily)` | `0 15,18,21 * * 1-5` |

**Cadence enum extension (same change as the seed script — P3-G11):** the admin PUT
handler's cadence validator (`src/app/api/admin/pipelines/schedules/route.ts:34`,
`['Daily','Quarterly','Annual']`) is extended to
`['Daily', 'Weekly', 'Weekdays (3x Daily)', 'Quarterly', 'Annual']` in the SAME change as
the seed — an un-extended enum would make the admin UI's own `PUT` silently reject the
`sources`/`deep_scrapes` rows' cadence the moment an operator touches them through the
dashboard.

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
   logic as `scripts/check-chain-running.js`** (§4) — both import the shared
   `scripts/lib/chain-concurrency.js` helper — rather than maintaining two independently-
   evolving copies of the "exact query" Spec 113 §8.3 requires to stay exact. A future edit
   to the concurrency query that only touches one of the two files is exactly the kind of
   drift this rule exists to prevent. **The extraction is LIMITED to `isChainRunning`
   itself** (P3-G3) — `triggerChain` and the scheduler loop STAY in `local-cron.js`
   unchanged. `src/tests/chain.logic.test.ts`'s source-scan locks assert on literal text
   inside `local-cron.js` (the try/catch shape, the `CHAIN_TIMEOUT_MS` constant, the kill
   sequence) — pulling those into the shared helper would break those locks for no benefit,
   since neither `triggerChain` nor the loop is part of the "exact query" duplication risk
   §4/§8.3 are guarding against.
3. `npm run local-cron` stays as the invocation entrypoint; no rename required by this
   spec.
4. **Timeout escalation becomes SIGTERM-then-SIGKILL-after-grace** (prod parity, Gemini
   MED): the existing hard `CHAIN_TIMEOUT_MS` (90 min) timeout now sends `SIGTERM` first,
   logs CRITICAL, and only escalates to `SIGKILL` if the child has not exited after a grace
   period — mirroring §3's note that GitHub Actions itself sends `SIGTERM` before a force
   kill, rather than `local-cron.js`'s previous immediate `SIGKILL`. The pinned test
   literals in `chain.logic.test.ts` are updated in the same commit to match the new
   kill-sequence shape, not deleted (the underlying lock's intent — a hung chain never
   blocks the rest of the serialized job — is unchanged).

`local-cron.js` is explicitly **out of scope for the GitHub Actions workflows in §2** —
it is never invoked by CI/CD and holds no production credential it doesn't already hold
today (developer's own `.env`).
</architecture>

---

<architecture>
## 8. Network Restrictions — RESOLVED 2026-07-20

Spec 113 §8.2 documented 3 candidate options (allowlist GitHub's published Actions IP
ranges / self-hosted runner / restrictions off + strong auth) and deferred the decision to
Phase 3.2 implementation time. **That decision has now landed:** option 3 — Network
Restrictions OFF, strong auth alone (CA-pinned `verify-full` TLS, §4, plus a narrow-scope,
Vault-adjacent credential treated as fully sensitive). The ruling is recorded as the
authoritative amendment to **Spec 113 §8.2** (not duplicated here beyond this pointer) —
that section is the durable policy record for the decision, including the operator's
rationale and deep_scrapes' inclusion in the same ruling.

Consequently `runs-on: ubuntu-latest` (GitHub-hosted) is the final value — not a
placeholder — across **all five** workflow files this spec defines: the four chain
workflows in §2 (`chain-coa-permits.yml`, `chain-sources.yml`, `chain-entities.yml`,
`chain-deep-scrapes.yml`, §2.4) plus `pipeline-watchdog.yml` (§2.5). The `# TODO Phase 3.2`
marker an earlier draft of §2.2 carried on `runs-on:` is resolved, not left open — there is
no self-hosted-runner branch to build for options 1/2, and no periodic allowlist-sync job
is needed (option 1's would-be pg_cron-inappropriate concern is moot).
</architecture>

---

<failure_modes>
## 9. Known Failure Modes

- **pg_cron silent-skip on unhealthy DB** — `pg_cron` jobs simply do not fire (no retry,
  no alert) if the database is unreachable or under enough load that the cron worker
  itself can't connect. Guard: §5's catalog is scoped exclusively to jobs where a missed
  cycle is a no-op, never a must-succeed job (Spec 113 §8.4) — this failure mode is
  *accepted*, not mitigated, for every job in the catalog by construction.
- **GitHub-hosted runner IP rotation vs. Network Restrictions allowlist** — moot as of
  §8's 2026-07-20 resolution: option 3 (restrictions off + strong auth) was chosen
  precisely because it has no IP-allowlist surface to rotate against. Retained here as a
  historical note in case a future revisit reopens the option-1 path.
- **DB-check error was a silent green skip before P3-D8** — the original §4 item 3 design
  (`skip=true`, exit 0 on a DB-check error) made an unreachable database indistinguishable
  from a legitimate "already running" skip in the Actions UI — both looked like a quiet,
  green no-op. §4 item 3's amendment (`skip=true` AND `exit 1`) closes this: the guard step
  itself now reddens and fires GitHub's failure notification on a DB-check error, while
  still refusing to double-fire the chain. If a future edit reverts to exit-0-on-error, this
  exact silent-outage gap reopens.
- **Ephemeral-profile cache miss (deep_scrapes, §2.4)** — a GitHub-hosted runner's
  `actions/cache` restore of `~/.buildo-scraper/profile-worker-N` can miss (first run after
  a cache eviction, or the 10GB-per-repo cache-size limit evicting the stealth-profile
  entries in favor of other workflows' caches) — the run then proceeds with a fresh
  fingerprint instead of the aged one. This degrades scrape reliability but is not a hard
  failure; it surfaces only indirectly, via a lower scrape-success rate in that run's
  `pipeline_runs` verdict, not a distinct alert. Guard: none dedicated — this is an accepted
  limitation of the GitHub-hosted (vs. self-hosted, persistent-disk) runner choice, priced
  into P3-D1's ruling.
- **Orchestrator exit-0 masking (§2.4)** — `aic-orchestrator.py` exits 0 on a scrape-level
  failure by design (verdict-only FAIL → `run-chain.js`'s `completed_with_errors` → exit 0).
  A workflow that gated only on the `run-chain.js` process exit code would show GREEN on a
  fully-failed scrape. Guard: §2.4's failure-detection contract requires
  `chain-deep-scrapes.yml` to separately read the chain's `pipeline_runs` status/verdict
  after the run and `exit 1` on `completed_with_errors`/FAIL — this is why the workflow
  cannot simply trust `node scripts/run-chain.js deep_scrapes`'s own exit code.
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
- **DST cron drift (§2.1) — accepted AND reconciled, not a bug.** The underlying drift (a
  fixed UTC cron tracks EST year-round, landing 1h later than nominal ET during EDT) is
  still accepted, not "fixed" into a two-cron-line date-gated scheme. What changed
  2026-07-20: the program-plan panel's "single UTC cron + in-job ET check" ruling is now
  BUILT, not just documented as a future option — every workflow's guard step logs the
  current America/Toronto time and emits a `::notice` drift annotation (observability-
  grade; it never skips a run). A future reviewer re-reading this bullet should look at
  §2.1's "AMENDED 2026-07-20" paragraph for the reconciliation, not re-propose the
  dual-cron-line scheme the panel already rejected as drift-prone.
</failure_modes>

---

<constraints>
## 10. Operating Boundaries

### Target Files
- `.github/workflows/chain-coa-permits.yml` (new — §2.2)
- `.github/workflows/chain-sources.yml` (new — §2.2)
- `.github/workflows/chain-entities.yml` (new — §2.2)
- `.github/workflows/chain-deep-scrapes.yml` (new — §2.4)
- `.github/workflows/pipeline-watchdog.yml` (new — §2.5; also the file that implements
  Spec 112 §6's backup safety-net role, merged in rather than a separate workflow)
- `scripts/check-chain-running.js` (new — the `isChainRunning` re-implementation, §4)
- `scripts/lib/chain-concurrency.js` (new — shared query helper imported by both
  `check-chain-running.js` and the demoted `local-cron.js`, §4/§7)
- `scripts/run-chain.js` (`SIGINT`+`SIGTERM` handler addition, §4 item 6 — the only
  behavioral change to this file; all other `run-chain.js` behavior is unmodified)
- `scripts/local-cron.js` (header + `isChainRunning` refactor to shared helper + SIGTERM-
  then-SIGKILL-after-grace timeout escalation — demoted, not deleted, §7)
- `scripts/certs/supabase-ca.pem` (new — committed CA cert, §3; governed by Spec 113 §4.3's
  rotation runbook, not re-specified here)
- `migrations/` (new — the schema-determinism migration §5a + pg_cron job registrations
  per §5's catalog, next available number at implementation)
- `scripts/seed-pipeline-schedules.js` (new — the idempotent `pipeline_schedules` seed
  script, §6)
- `src/app/api/admin/pipelines/schedules/route.ts` — **cadence enum edit** (§6, extending
  `['Daily','Quarterly','Annual']` to include `'Weekly'` and the multi-daily display value)
  in the SAME change as the seed script; otherwise a read-only consumer.
- `src/app/api/admin/stats/route.ts`, `src/components/DataQualityDashboard.tsx` — gain the
  per-chain `last_completed_at` freshness block (§2.5, implemented at F4); otherwise
  read-only consumers of §6's `pipeline_schedules` writes, which are a data change
  (seed/`INSERT ... ON CONFLICT`), not a code change to these files beyond the freshness
  block.

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
