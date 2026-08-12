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
| 4 | `.github/workflows/chain-deep-scrapes.yml` | `deep_scrapes` (§2.4) | **1×/day, WEEKDAYS ONLY, business hours** (10 AM EST · 11 AM EDT) — LIVE since 2026-08-05 `2fa3b2e7`; was 3×/day on paper while the schedule sat disabled | `0 15 * * 1-5` |

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
    timeout-minutes: 300     # 120 (coa) + 150 (permits) + checkout/setup/report headroom (re-sized 2026-08-09 chain-budget WF3)
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
        timeout-minutes: ${{ fromJSON(env.COA_STEP_TIMEOUT_MINUTES) }}   # 120 (2026-08-09)
        run: |                       # soft budget = ceiling − 10, shell-computed (§2.2)
          BUDGET=$(( ${{ fromJSON(env.COA_STEP_TIMEOUT_MINUTES) }} - 10 ))
          if [ "$BUDGET" -lt 0 ]; then BUDGET=0; fi
          export CHAIN_TIME_BUDGET_MINUTES=$BUDGET
          node scripts/run-chain.js coa
        env: *pipeline-env

      - name: Guard — permits concurrency check
        id: permits_guard
        if: always()
        run: node scripts/check-chain-running.js permits >> "$GITHUB_OUTPUT"
        env: *pipeline-env

      - name: Run permits chain
        id: permits
        if: always() && steps.permits_guard.outputs.skip != 'true'
        timeout-minutes: ${{ fromJSON(env.PERMITS_STEP_TIMEOUT_MINUTES) }}  # 150; NOT continue-on-error —
        run: |                         # the primary pipeline; its failure MUST redden the job
          BUDGET=$(( ${{ fromJSON(env.PERMITS_STEP_TIMEOUT_MINUTES) }} - 10 ))
          if [ "$BUDGET" -lt 0 ]; then BUDGET=0; fi
          export CHAIN_TIME_BUDGET_MINUTES=$BUDGET
          node scripts/run-chain.js permits
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
guard + `env: *pipeline-env` pattern as the `permits` step above. Per-chain step ceilings
(re-reconciled 2026-08-09, chain-budget WF3): `coa` **120** (raised from 90 — the "90
unchanged — deliberate" P1 ruling is re-litigated in place on its own measured-overrun
terms: the 2026-08-08 ungated backlog-recovery run measured 102 min, outran the 90-min GH
step timeout, and the kill never reached the node process, which ran 12 more minutes
CONCURRENTLY with the permits chain; the backlog-recovery case is exactly the run that must
complete), `permits` **150** (raised from 120 — P1's "no completed run >90 min exists yet"
was falsified 2026-08-05 by a CLEAN all-33-step run at 118.5 min; nightlies run UNGATED
6/6 recently, 78–118.5 min, rising trend), `sources` 180 (unchanged here; Phase B owns its
re-size — the pinned `--full` enrich alone measured 112 min on cloud), `entities` 90
(unchanged). Both coa-permits verdict-check steps carry the duration tripwire
(`CHAIN_DURATION_BUDGET_MINUTES` = the SAME job-env ceiling value; coa gained its tripwire
in the 2026-08-09 WF3 — it previously had none).

**Soft time-budget self-stop (2026-08-09 WF3 — generalizes the deep-scrapes `d6eb9f31`
ruling to chain orchestration): the platform timeout is the BACKSTOP, never the
mechanism.** `run-chain.js` reads `CHAIN_TIME_BUDGET_MINUTES` (absent/0 → inert; each
chain step computes ceiling − 10 in its run shell, clamped ≥ 0 — GH expressions have no
arithmetic). Checked BETWEEN steps only (an in-flight step must finalize, not be killed),
at the same trusted poll point as admin cancellation. On breach: remaining steps are
recorded `skipped` with `error_message = 'skipped: chain time budget reached (…)'`
(cause-distinguishable, unlike disabled/gate skips), the chain finalizes through its
NORMAL terminal path as `completed_with_warnings` (an explicit status-ladder branch — FAIL
verdicts still win) with a human-readable `error_message` + `records_meta.budget_stopped =
{elapsed_min, budget_min, steps_skipped}`, and the process exits 0 (the §2.4-class
DB-verdict split remains the failure-detection contract; `completed_with_warnings` is
green-allowlisted). Adopted by `chain-coa-permits.yml` only so far; other chain workflows
adopt with their own measured budgets (the mechanism is generic and inert without the
env). `chain-sources.yml` additionally carries a
`mkdir -p data` step before its chain step (Pipeline Rehab P2, 2026-08-03): the gitignored
`data/` dir is absent on every fresh checkout and four sources loaders download into it —
the loaders' `downloadFile()` helpers now mkdir it themselves (the load-bearing fix, which
also covers local fresh clones); the workflow step is belt-and-suspenders.

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
(a)). **That property was ASPIRATIONAL, not real, until 2026-07-30** — see "Browser launch
+ proxy contract" below: the MV3-extension mechanism that was supposed to deliver it had
never once put the proxy in this scraper's path anywhere. Headed Chrome is no longer
required (the extension that forced it is retired), so the orchestrator no longer needs a
display server; the workflow nonetheless still installs Xvfb and still invokes
`xvfb-run -a node scripts/run-chain.js deep_scrapes` — wrapping the node PARENT so
`$DISPLAY` inherits down to the spawned `python3` child — **pending a CI run that confirms
the headless path on the runner. Dropping Xvfb is a filed follow-up, not a completed
change.** The guarded `RuntimeError` (not a silent hang) that fires when headed Chrome is
requested with no `DISPLAY` remains in `build_browser_args`, now reachable only on the
legacy extension path. Persistent stealth profiles (`~/.buildo-scraper/profile-worker-N`)
are restored between runs via
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
every 3 hours on weekdays (a rationale the headless move below makes moot without changing
the ruling); the proxy already removes the WAF-visibility argument for self-hosting.

**Browser launch + proxy contract (AMENDED 2026-07-30 — WF3 batch `1271bf17`…`27e39948`).**
This supersedes the "proxy forces headed Chrome under `xvfb-run`" mechanism the paragraph
above originally specified. The spec previously named no browser binary, version, or launch
ownership at all; that gap is what the batch closed.

1. **We launch Chrome; nodriver only ATTACHES** (`7055ce89`). `aic-scraper-nodriver.py`
   spawns the browser itself (`launch_chrome()`), polls `http://127.0.0.1:<port>/json/version`
   until it answers (`wait_for_devtools()`), then calls `uc.start(host=..., port=...)`, which
   takes nodriver's `connect_existing` path and spawns nothing. Forced by four defects in
   nodriver's own launch path, all confirmed from its source: its DevTools connect budget is a
   **hardcoded ~2.25 s** (`core/browser.py` — `sleep(0.25)` then five probes 0.5 s apart, with
   no config knob in either 0.48.1 or 0.50.3), which a cold profile on a CI runner exceeds just
   creating its favicon/quota/password-store databases; it never reads `DevToolsActivePort`, so
   a lost port race leaves it blind to a live browser; it `PIPE`s Chrome's stdio and never
   drains it, so a full 64 KB buffer stalls startup; and it raises from *inside* `start()`,
   leaving the caller no handle to kill the browser it just spawned — that orphan then holds
   the profile dir and makes every retry fail identically. Owning the process fixes all four:
   stdio to `DEVNULL`, our own process group, an env-overridable readiness budget
   (`SCRAPER_DEVTOOLS_TIMEOUT_S`, default 60 s) that names the cause on timeout (elapsed, port,
   process return code), a `DevToolsActivePort` fallback when Chrome binds a port other than
   the one requested, and `terminate_spawned_chrome()` killing a pid we OWN by process group —
   **never `pkill`/`pgrep`**, since this also runs on the operator's own desktop. `browser.stop()`
   alone CANNOT kill the process in attach mode (nodriver's `connect_existing` path never
   populates `_process_pid`), so every teardown site goes through `stop_and_terminate()`
   (`733e67c4`). Because attach mode means nodriver contributes no flags, the scraper now
   supplies nodriver's own default argument set verbatim (`NODRIVER_DEFAULT_ARGS`) — dropping
   any of them would change the browser fingerprint relative to the proven local runs.
2. **nodriver is EXACT-pinned** (`nodriver==0.48.1` in `scripts/requirements.txt`, `7055ce89`).
   The previous `>=0.48` meant CI silently resolved 0.50.3 while 0.48.1 is the only version this
   scraper has ever been proven against — cloud runs were never the code that was tested.
   Upgrading is a deliberate, separately validated task, not a resolver outcome.
3. **The proxy is a local unauthenticated relay, not an MV3 extension** (`61705719`,
   `19869fc4`, `b1bc91e9`). `scripts/proxy-relay.mjs` (Apify `proxy-chain`) holds the Decodo
   credentials and listens on `127.0.0.1`; Chrome gets a plain
   `--proxy-server=http://127.0.0.1:PORT` plus `--proxy-bypass-list=<-loopback>` (Chrome
   bypasses proxies for loopback by default, which would otherwise send relay-bound traffic
   straight out) and **no extension**. `ignoreProxyCertificate` is required for an `https://`
   upstream, else proxy-chain's CONNECT fails with 599; it affects only the hop to our own
   provider — on CONNECT the relay pipes raw bytes rather than terminating TLS, so the browser's
   JA3/ALPN fingerprint reaches the origin intact (and this is precisely why mitmproxy, which
   re-originates TLS, must never be substituted here). Why retire the extension: branded Chrome
   removed `--load-extension` in **137** and removed its `DisableLoadExtensionCommandLineSwitch`
   opt-out in **142** (unbranded Chromium and Chrome for Testing are exempt *today* — one
   base-image bump from breaking us), and an idle MV3 service worker is **EVICTED**, taking
   `onAuthRequired` with it while `chrome.proxy` settings persist — the browser keeps routing
   through the proxy while unable to authenticate, intermittently and invisibly. The relay is
   owned with the same discipline as the browser (kill a pid we own, process group on posix,
   idempotent, `atexit`) because its argv carries live credentials; both mid-run rotation paths
   (WAF trap, per-batch session) terminate the old relay before starting the new one.
   `build_proxy_extension()` remains in the file but is now **unreferenced legacy**, retained
   pending its own deletion review.
4. **Decodo credential contract — the `user-` prefix is load-bearing** (`3583d824`). Decodo
   parses the username as a hyphen-delimited key-value list, and only does so when the string
   begins with the LITERAL token `user-`. Verified live against the real endpoint: bare
   `<account>` → 200; `<account>-session-<alnum>` → **407 "Access denied"**;
   `user-<account>-session-<alnum>` → 200, including over HTTPS-to-proxy to an HTTPS target.
   The format is now `user-<account>-session-<alnum>-sessionduration-N`, built idempotently
   (never double-prefixed if the operator stores the prefix). **Session IDs must be
   ALPHANUMERIC** — ours were `buildo-worker-1-<ts>`, and hyphens inside a hyphen-delimited
   parser make it read `session=buildo` and then choke on `worker` as an unknown key. A 407 is
   invisible in the browser: Chrome renders "This site can't be reached" for every page, which
   is exactly what runs 30498062060 / 30499270494 showed while the runner itself reached the
   same hosts fine.
5. **Proxy scheme defaults to `https`** (`PROXY_SCHEME`, `ef9bbab2`). Decodo's endpoint speaks
   http, https and socks5 on the same port, and the three do not behave alike: **https** works
   (verified, residential IP returned over an HTTPS target) and keeps credentials off the wire
   in the clear; **plain http** means every HTTPS target needs a CONNECT tunnel and that tunnel
   is RESET (reproduced with `-k`, so it is the tunnel, not certificate validation) — this was
   the old default; **socks5** works via curl but is unusable here because **Chrome cannot
   authenticate to a SOCKS proxy at all** (it ignores credentials and never fires
   `onAuthRequired`), so it would require provider-side IP allowlisting.
6. **Per-worker sticky ports** (`c3dff232`). On `ca.decodo.com` the PORT selects the mode:
   20000 = rotating, 20001-29999 = sticky with ONE exit IP pinned per port. Every worker
   pointed at 20001, so the multi-worker design's whole premise — distinct residential IPs per
   worker — was silently false, and a per-worker `-session-` suffix cannot override a
   port-level pin. `resolve_proxy_port()` now gives worker N `base+N-1`, wrapped inside the
   sticky band so it can never land on 20000 or past 29999; standalone keeps the base port.
7. **Proxied-egress tripwire — fail-safe-loud per §3/§4** (`0e32cc84`, `733e67c4`, `0b7dcfa0`,
   `1b52f03a`). `verify_proxied_egress()` NAVIGATES the browser to an IP echo service
   (`SCRAPER_EGRESS_ECHO_URL`, default `api.ipify.org`) and asserts the browser's egress IP
   DIFFERS from this host's own; if it cannot prove proxying it refuses to scrape. It navigates
   rather than `fetch()`es because at that point the tab is `about:blank`, whose opaque origin
   makes a cross-origin fetch throw. The host-IP baseline is memoized with a TTL
   (`HOST_EGRESS_IP_TTL_S`, default 900 s, `SCRAPER_HOST_IP_TTL_S` overrides) because bootstrap
   runs per batch and on every WAF rotation — an unbounded memo would let a stale baseline fake
   a proxied verdict. One deliberate asymmetry: an echo service the BROWSER cannot reach while
   the HOST just did is treated as evidence **OF** proxying (loud `proxied_egress_indirect`
   WARN, unverified-but-indirect), not grounds to refuse — an unproxied browser has the host's
   plain direct internet and would have reached it identically. Only an *unrecognized* response,
   an undeterminable host IP, or a browser reporting THIS HOST's IP are fatal. This check, not
   any launch flag, is what guarantees we never scrape unproxied. Note the deliberate trade it
   introduces: bootstrap now depends on an external echo service.
8. **Historical finding (`43496bcb`) — the proxy had NEVER been in this scraper's path.** The
   MV3 extension was its only proxy mechanism (routing AND credentials welded into one
   extension; nothing passed `--proxy-server`), and the operator's local browser is branded
   Chrome 150, which cannot load it — so local runs scraped DIRECT from a residential IP while
   telemetry recorded `proxy_configured=true`. The only demonstrably proxied runs were the
   Playwright scraper deleted 2026-04-16. `scripts/quality/assert-network-health.js` gates
   `proxy_errors` but reads `proxy_configured` nowhere and has no notion of "was egress actually
   proxied", so a fully direct run reports `proxy_errors=0` and PASSES — which is why four
   months of unproxied scraping was invisible. Feeding the `verify_proxied_egress` result into
   `scraper_telemetry` and gating on it is an open follow-up (`docs/reports/review_followups.md`).
9. **Python test coverage** (`1271bf17`). `scripts/` had zero, so every scraper logic defect was
   discoverable only by dispatching a ~6-minute Actions run. `scripts/tests/` (pytest) now runs
   via `npm run test:py` and a Pytest job in `.github/workflows/pipeline-lint.yml`; the chains
   install `requirements.txt` only, so the harness cannot reach a production run.

**10. Metered-bandwidth guard (`43496bcb`… + the 2026-07-30 bandwidth commit).** Making the proxy work exposed a cost defect: ALL of Chrome's background traffic began flowing through metered residential bandwidth. One run billed **1.76 GB to `edgedl.me.gvt1.com`** (Google's Chrome component-update CDN, 62 requests averaging ~28 MB) for **~$6.60**, against **2.7 MB** of actual `secure.toronto.ca` scraping — 99.9% of spend was Chrome talking to Google. This traffic always occurred; it was free only because the proxy had never carried anything (see item 9). Two independent layers now apply, because a launch flag that silently regresses costs money: (a) `BANDWIDTH_GUARD_ARGS` — `--disable-background-networking`, `--disable-component-update`, `--disable-sync`, `--safebrowsing-disable-auto-update`, `--disable-domain-reliability`, `--disable-client-side-phishing-detection`, `--metrics-recording-only`, plus Translate/OptimizationHints/MediaRouter/AutofillServerCommunication merged into the single `--disable-features` switch §2.4's invariant enforces; and (b) a **deny-by-default allowlist inside `proxy-relay.mjs`** (`prepareRequestFunction`) — a host not on it is refused locally and never opens an upstream connection, so it cannot spend money even if (a) regresses. Default allowlist `toronto.ca, api.ipify.org`; `SCRAPER_PROXY_ALLOWLIST` overrides; blocks are logged loudly. Verified live: ipify 200 through the relay, `edgedl.me.gvt1.com` and `update.googleapis.com` refused with zero upstream bytes.

**Verification status (be precise — 2026-07-30):** the full path is proven **LOCALLY,
end-to-end** — relay up on `127.0.0.1` → headless Chrome with no extension → host egress
`67.213.109.188` vs browser egress `23.16.63.103` → PROXIED OK → clean teardown with both the
browser and relay registries empty — plus `npm run test:py` green. **The CI validation run is
still PENDING.** Nothing in this section may be cited as CI-confirmed until a dispatched run
demonstrates it on the runner; in particular the headless/no-Xvfb claim is a local result only.

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
`status`/verdict and exit 0 ONLY on a **green allowlist** (rewritten 2026-08-03, Pipeline
Rehab P3 — previously a `completed_with_errors`-shaped denylist): `status` must be
`completed` or `completed_with_warnings` AND no step verdict in
`records_meta.step_verdicts` may be `FAIL`; every other status — `failed`,
`completed_with_errors`, `cancelled`, `running` (an orphaned row from a killed run), any
novel value, or no row at all — exits 1. `pipeline_runs.status` is unconstrained TEXT
(mig 033), so a denylist is unprovable: the denylist form classified three live orphaned
`running` rows (ids 1756/2045/2097, GH step-timeout kills) as green on 2026-08-03. This
generalizes §2.2's coa red-flip pattern: a step that reads the real DB-recorded outcome
and reddens the job itself, rather than trusting the child process's own exit code.

**Shared anatomy:** the same `check-chain-running.js` guard +
`env: *pipeline-env` (§3) pattern as `chain-sources.yml`/`chain-entities.yml`, plus the
PG17-client and `migrate.js --verify` steps §3 mandates for every workflow reaching
`pg_dump` or `run-chain.js`. Timeouts (reconciled 2026-08-03 to the shipped yml — the
spec's earlier `timeout-minutes: 90` here was pre-existing drift): the JOB carries
`timeout-minutes: 45` (fixed, not derived — GH expressions have no arithmetic) and the
chain STEP carries an input-driven limit (`chain_timeout_minutes` dispatch input,
probe-shaped default). Raising the job ceiling for full-throughput production runs is
P7's entry-scoped change, not a value this section fixes.

### 2.5 `pipeline-watchdog.yml` — freshness watchdog (restores the dropped program mandate, P3-D9)

**Cadence:** daily `30 15 * * *` UTC — after the 11:00 UTC nightly coa→permits window plus
its ~3h worst case, so the same night's permits/backup run has had time to land before the
watchdog checks for it.

> **RAN-status semantics after C1/D1 (2026-08-11) — a deliberate blind spot.** A chain
> whose only failures are non-halting now terminalizes `completed_with_errors`, which is
> in `RAN_STATUSES`. The watchdog therefore reports it as **having run**, because it did:
> every step executed, including `backup_db`. The red lives on the per-chain verdict step
> (`check-chain-verdict.js`, whose `OK_STATUSES` excludes `completed_with_errors`), not
> here. This is the intended division of labour — the watchdog is an ABSENCE check
> ("did anything land at all"), not a quality gate — but it means **the watchdog is
> silent on this condition by design and the verdict step is the single channel for it.**
> Accepted knowingly; recorded so a future "the watchdog was green" is not read as
> "the data was fine". See Spec 84 KFM-1 and Spec 112 §9.

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
     not apply at all on Sat/Sun (no run is expected — not the same as "stale"), **80h on
     Monday** (reaches back through the weekend to Friday's only slot), **30h Tue-Fri**.
     Widened from 72h/26h on 2026-08-05 (`2fa3b2e7`) WITH the cadence change: the old numbers
     were sized for a Friday last slot of ~21:00 UTC, and a single 15:00 slot completes ~17:35,
     which left the Monday window ~6 minutes of margin against a watchdog that fires at 15:30
     UTC and has been observed 1-2h late. **These windows are COUPLED to the cadence — if the
     cadence changes again, they move in the same commit** (a genuinely skipped slice still
     breaches by hours, so the slack costs nothing).
   A "completed" run means `pipeline_runs.status` is one of `completed` /
   `completed_with_warnings` / `completed_with_errors` (F8 fold — this check is
   ABSENCE detection only; pass/fail visibility now comes from
   `scripts/check-chain-verdict.js`'s per-run verdict-check steps in each chain workflow,
   which generalize the exit-0-masking guard §2.4 already required for `deep_scrapes` to
   all 5 chains and, as of 2026-08-03 (Pipeline Rehab P3), pass ONLY on §2.4's green
   allowlist — `completed`/`completed_with_warnings` with no FAIL step verdict; note the
   two lists differ deliberately: `completed_with_errors` counts as "ran" for absence
   detection here but is a FAIL for the per-run verdict check). Missing any applicable chain → `exit 1` (the job goes red, firing GitHub's
   run-failure notification per §3). This closes the gap GitHub's own per-workflow
   notifications structurally cannot: a scheduled workflow that never fires at all (a
   platform outage, a `schedule:` block that silently stopped triggering) produces no run
   to notify about — only an independent daily check that looks for the ABSENCE of a
   completed run catches that.
2. **Backup freshness + safety-net trigger.** A completed backup within the last 25h,
   matching BOTH row shapes `backup_db` can be written under (P3-G6): the scoped-slug
   `permits:backup_db` step row (the scoped-slug INSERT at `run-chain.js:413` + completion
   UPDATE at `:542` — S3 fold 2026-07-22 (re-corrected 2026-08-09, chain-budget WF3 insertion drift), corrected from a stale `:362` citation which lands
   on a closing brace) and a standalone `backup_db` slug row
   (a direct, non-chain invocation). If no such row exists within 25h AND the `permits`
   chain is not CURRENTLY running (a race guard — a permits chain in flight may complete
   its own `backup_db` step moments later; invoking `backup-db.js` concurrently with that
   would double-run it) → invoke `scripts/backup-db.js` directly. This IS Spec 112 §6's
   safety-net role, merged into this single workflow rather than a separate one —
   cross-reference Spec 112 §6, which now points back here for the trigger mechanism. If a
   completed backup still cannot be confirmed after the direct invocation → `exit 1`.
   INCIDENT NOTE (2026-08-03, Pipeline Rehab P5): the shipped yml had additionally gated
   this fallback on `chains_fresh == 'true'` — a term this spec never asked for — which
   suppressed the safety net during the exact outage it exists for (permits step-timeout-
   killed before its `backup_db` final step; backups 50.7h stale vs the 25h SLA while the
   fallback sat disabled). The term is removed; the trigger is backup-staleness + the
   `permits_running` race guard ONLY, restoring conformance with the text above.

**Workflow anatomy:** PG17-client install step (this workflow reaches `pg_dump` via the
direct `backup-db.js` invocation, §3's mandate); `migrate.js --verify` pre-flight
(**AMENDED 2026-07-31 — ADVISORY here, `continue-on-error: true`, unlike the chain
workflows.** §3's mandate is scoped to "every workflow that invokes `run-chain.js`", which
this one does not. As a blocking step it sat AHEAD of the §6 backup fallback, so an
unapplied migration would block every chain — including permits, whose final step is the
primary backup — and then block the safety net that exists to cover exactly that, while
reddening the watchdog for a reason indistinguishable from its own freshness alarm. It also
falsified `1e405bce`'s recorded exit-code choreography, which states `freshness_recheck` is
the ONLY step whose exit code determines the job conclusion; advisory restores that.
**AMENDED 2026-08-09 (chain-budget WF3 — missing-migration ESCALATION):** during the
238 outage the fleet's chain pre-flights failed for 49 h while this advisory posture left
the watchdog GREEN for ~25 h (until freshness breached, unlabeled). The verify step's
POSITION and `continue-on-error: true` are unchanged (the fence above holds byte-for-byte
— backup fallback + freshness choreography always run), its annotation is upgraded
`::warning` → `::error` naming cause + remedy (approve/dispatch `apply-migrations.yml`,
runbook §3 rule 2a), and ONE additive end-of-job gate step — `if: always()` on the verify
outcome, ordered AFTER `freshness_recheck` — reds the job immediately. The choreography
rule is therefore amended: `freshness_recheck`'s exit code is the job's verdict, EXCEPT
that a failed schema pre-flight also fails the job via the trailing gate — never by
blocking earlier steps);
the `SUPABASE_DATABASE_URL` non-empty guard (§3/§8's inertness note). `runs-on: ubuntu-latest`;
`workflow_dispatch` active; `schedule:` block committed commented-out per §8/P3-D6 until
Phase 4.3.

**Dashboard surfacing (implemented at F4, referenced here only):** `GET
/api/admin/stats` and `DataQualityDashboard.tsx` gain a per-chain `last_completed_at`
freshness block reading the same `pipeline_runs` facts this workflow checks — an operator
looking at the dashboard sees the same freshness picture the watchdog alerts on, not a
second, independently-derived one.

### 2.6 `apply-migrations.yml` — operator-dispatched migration apply (WF3 2026-07-31)

`.github/workflows/apply-migrations.yml` is the first **audited cloud migration-apply
path** (runbook §3 rule 2a's preferred vehicle, replacing the laptop-`.env` ad-hoc
command, which remains the documented fallback). It is **not a chain**: it never invokes
`run-chain.js` and writes no `pipeline_runs` row — its audit record is the GitHub run log
itself (dispatched ref + `git log -1 -- migrations/` + actor, echoed at job start).

Contract (shape-locked by `src/tests/apply-migrations-workflow.infra.test.ts`):

- **`workflow_dispatch` ONLY** — never any automated trigger (push/pull_request/schedule);
  the `1e405bce` fence generalizes here because the dispatch + environment approval IS the
  authorization model. `permissions: contents: read`; `timeout-minutes: 15`; the F8
  `${{ github.workflow }}` concurrency group with `cancel-in-progress: false`.
- **Environment-gated:** the single job runs under `environment: production-db`
  (operator-configured: required reviewer + deployment-branch policy "any branch";
  `can_admins_bypass` default true matches the single-operator intent).
- **`dry_run` input defaults `'true'`:** the default run verifies, gates on drift, and
  prints the real `migrate.js --dry-run` would-apply listing — no writes. Only
  `dry_run=false` reaches the apply, post-apply verify, and INVALID-index gate steps.
- **Drift-abort:** the pre-state `migrate.js --verify` is advisory
  (bare-`run:` + `continue-on-error: true`, §2.5's watchdog pattern), and a following
  gate parses its `Verify: N missing, M drift` line — `drift > 0` hard-aborts (apply mode
  silently SKIPS drifted files with a WARN, so applying past drift records a partial
  truth); MISSING-only proceeds, that being the workflow's purpose.
- **Port guard:** refuses a `SUPABASE_DATABASE_URL` targeting `:6543` (Supavisor
  transaction pooler — CONCURRENTLY-unsafe) without echoing the value.
- **Post-apply INVALID-index gate:** `SELECT indexrelid::regclass FROM pg_index WHERE NOT
  indisvalid` fails the run naming any row — the killed-`CREATE INDEX CONCURRENTLY` blind
  spot `--verify` (checksums only) can never see. An `if: failure()` post-mortem re-runs
  `--verify` and prints the `schema_migrations` tail + the same INVALID-index query.
- Shares §3's env anatomy (`SUPABASE_DATABASE_URL` secret, committed CA at
  `scripts/certs/supabase-ca.pem`, empty-secret guard). Note the per-statement 2-min
  cluster `statement_timeout` cap applies to `migrate.js`'s raw Pool (the fa9e984c unbind
  is `pipeline.js`-only) — documented in runbook §3 rule 2a.
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
- **`timeout-minutes`** per chain-invocation step (per-chain values — §2.2's reconciled
  list: coa 120 / permits 150 / sources 180 / entities 90, 2026-08-09) is GitHub Actions' **native** step
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
- **Known-inert paths under the live schedules (2026-07-29).** Two scheduled steps are
  deliberately partial on runners: ① `chain_sources` → `load_wsib` SKIPs with a PASS/SKIPPED
  audit row — the WSIB registry CSV is an annual MANUAL download (Spec 52; runbook §WSIB
  annual refresh); `wsib_registry` refreshes only via the operator-run loader. ② `chain_entities`
  runs daily but its workflow env deliberately omits `SERPER_API_KEY`, so both steps skip —
  the missing key is the Serper SPEND GATE (Spec 45; operator ruling 2026-07-29: keep daily
  inert; annual registry enrichment runs via `chain-wsib.yml` instead). These are knowing
  carve-outs, not bugs — but note both paths look green in GH while doing partial/no work.
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
7. **Stdout is the MACHINE channel; every human log line goes to stderr (AMENDED 2026-07-30,
   `27e39948`).** Each workflow invokes the guard as
   `node scripts/check-chain-running.js <chain> >> "$GITHUB_OUTPUT"`, so *everything* it prints
   to stdout is appended to the outputs file. Its own reasoning therefore (a) never reached the
   Actions log and (b) was parsed by GitHub as bogus `key=value` pairs — the "already running —
   skip=true" line became a key of `[check-chain-running] chain_deep_scrapes is already running
   — skip`. Three validation runs (11, 12, 13) reported the job GREEN while the chain steps were
   silently SKIPPED and the guard's decision could not be read at all. Contract: stdout carries
   the `key=value` pair and nothing else; all logging goes to `console.error`. The "already
   running" message MUST additionally NAME the blocking row's `id` and `started_at`, so the next
   skip is diagnosable in one read rather than another dispatch cycle.

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
| `permit_scrape_outcomes_prune` | Daily, `0 8 * * *` UTC (clear of the 09:00/10:00/14:30 jobs and the 15:00 UTC deep-scrapes window) | `SELECT * FROM public.prune_permit_scrape_outcomes();` (migration 237, 235-hardened shape: SECURITY DEFINER `search_path = pg_catalog`, durable `pipeline_runs` summary row on success AND failure, REVOKE from client roles). One atomic data-modifying CTE: `DELETE FROM permit_scrape_outcomes WHERE observed_at < now() - 90 days RETURNING` folded into `permit_scrape_outcome_rollup` via `ON CONFLICT (permit_num, outcome, transport) DO UPDATE occurrences + excluded, first_at = LEAST, last_at = GREATEST`; permit_num-NULL rows fold under `COALESCE(permit_num, year_seq)`. Idempotent; concurrency-safe vs live inserts (cutoff predicate). Locked by `src/tests/db/237_scrape_outcome_prune.db.test.ts`. | **Never-must-succeed by construction** (Spec 44 §3, WF2 2026-07-31 D1 ruling): a missed prune leaves raw diagnostic rows past their 90-day horizon one more day — a storage nuisance, not a correctness incident; the next run folds the same rows identically (atomic + idempotent, cannot double-count). Steady-state raw volume ~150K rows; rollup bound ~93K (RC-corrected numbers). Retention length re-evaluated when the `populate_queue` re-queue-forever defect (lifecycle epic item 5) lands — filed in `docs/reports/review_followups.md`. |
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
| `deep_scrapes` | `Weekdays (1x Daily)` | `0 15 * * 1-5` |

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
   MED): the existing hard `CHAIN_TIMEOUT_MS` (120 min — raised from 90 with the permits
   step ceiling, Pipeline Rehab P1 2026-08-03) timeout now sends `SIGTERM` first,
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
## 7a. Admin Manual Trigger — GitHub `workflow_dispatch` (WF2, 2026-07-25)

The admin data-quality page "Run" button no longer executes a chain in-process. The
previous implementation `spawn`ed `node scripts/run-chain.js` inside the Next.js API route
(`src/app/api/admin/pipelines/[slug]/route.ts`); on Vercel the serverless sandbox is
terminated the instant the HTTP response returns, so the detached child was killed before
it ran and the `pipeline_runs` row stuck at `'running'` (Spec 113 §8.1 — no Vercel function
ever hosts a chain, manual or scheduled).

**Mechanism.** `POST /api/admin/pipelines/{chain_slug}`:
1. `verifyAdminAuth` (Spec 33 §5) — first line of both POST and DELETE.
2. Pre-dispatch guard: the §4 `isChainRunning` query (`pipeline = ANY(chains) AND
   status='running' AND started_at > NOW() - INTERVAL '12 hours'`) → **409** if the chain
   (or, for the combined workflow, either `chain_coa`/`chain_permits`) is already running,
   so a double-click never queues a duplicate run. Fail-open on a DB error — the workflow's
   own `check-chain-running.js` (§4) is the second guard.
3. GitHub REST `workflow_dispatch` (`POST /repos/{owner}/{repo}/actions/workflows/{file}/
   dispatches`, ref = default branch) via `src/lib/admin/github-dispatch.ts`. The run then
   executes on the GH runner and `run-chain.js` writes `pipeline_runs` **exactly as for a
   scheduled run** — the admin panels poll unchanged (reporting continuity).

**Chain → workflow map.** `chain_coa` and `chain_permits` both dispatch `chain-coa-permits.yml`
(coa→permits combined, §2.2); `chain_sources`/`chain_entities`/`chain_deep_scrapes` dispatch
their own files. **Only chains are dispatchable** — individual-step runs and `chain_wsib` return 400 from
the admin API (as of 2026-07-29 `chain_wsib` DOES have a GitHub Actions workflow —
`chain-wsib.yml`, `workflow_dispatch` only, no cron, `SERPER_API_KEY`-guarded, ENRICH_LIMIT
6000/run with re-dispatch-until-drained semantics per Spec 46 — but it stays
admin-non-dispatchable by design: it is annual, operator-triggered, real-spend). The UI reflects this: CoA = "Run CoA → Permits", Permits = disabled
"Runs with CoA", WSIB = "GitHub Actions only"; the per-step "Run" buttons are removed.

**Cancel.** `DELETE` cancels the whole GitHub run (`cancelWorkflowRun` lists the workflow's
in-progress/queued/waiting run and `POST .../runs/{id}/cancel`, needs `actions:read`), then
marks the workflow's `chain_*` rows and their `<chainId>:%` step rows `'cancelled'`. For the
combined workflow a DB-row-only cancel would leave permits to run after coa is cancelled, so
the whole-run cancel is required; the `'cancelled'` DB flag is itself a cancel signal
`run-chain.js` self-aborts on (§4 poll between steps).

**Env (Vercel).** `GITHUB_DISPATCH_TOKEN` (fine-grained PAT, `actions:read`+`actions:write`,
this repo), `GITHUB_REPO` (`owner/repo`), `GITHUB_DISPATCH_REF` (default `main`). The token is
server-side only — never returned, never logged. All route responses use the §4.4
`{ data, error, meta }` envelope.
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
  after the run and pass ONLY on the green allowlist (`completed`/
  `completed_with_warnings` with no FAIL step verdict — rewritten from the earlier
  `completed_with_errors` denylist, Pipeline Rehab P3 2026-08-03) — this is why the
  workflow cannot simply trust `node scripts/run-chain.js deep_scrapes`'s own exit code.
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
  treat §4 item 5 as non-optional, not a nice-to-have. PARTIALLY MITIGATED 2026-08-03
  (Pipeline Rehab P3): `check-chain-verdict.js`'s green allowlist now reddens the NEXT
  verdict check whose latest row is `running`, so an orphaned row produces a red run
  rather than silence — but only when/where a verdict-check step actually runs.
- **`SIGTERM` handler omitted from `run-chain.js`** — if §4 item 6 is skipped, a
  `timeout-minutes`-triggered kill (or, on the demoted `local-cron.js` path, its existing
  `SIGKILL`, §7) leaves the row `running` for up to 12h before it merely *stops blocking* —
  it is never marked `failed`, so a dashboard reading `pipeline_runs` directly (rather than
  through the 12h-aware `check-chain-running.js` query) shows a phantom in-progress run for
  up to half a day. This is a real, currently-unfixed gap in the codebase as of this spec
  (§4 item 6) — not a hypothetical regression risk.
- **A CANCELLED GitHub run strands a `running` row that blocks its chain for 12h, and nothing
  reaps it AUTOMATICALLY (open as of 2026-07-30; scope corrected 2026-08-05).** §4 item 6's
  `SIGINT`/`SIGTERM` handler covers an orderly
  cancellation, but a `SIGKILL`-class death — a force-cancelled run, a runner eviction, OOM —
  leaves `pipeline_runs.status = 'running'` behind. `check-chain-running.js` then correctly
  reports `skip=true` for every subsequent dispatch until the 12h TTL expires, so the chain
  quietly does not run for up to half a day. There is **no SCHEDULED reaper**. An
  **opportunistic, request-triggered** cleanup does exist and this spec previously denied it:
  `src/app/api/admin/stats/route.ts:188-199` fails any row `running` for more than 2h, but only
  when a human loads the admin dashboard — it fires on no schedule, so it cannot be relied on
  for the blocking window (it last fired 2026-07-28, which is why rows 2158/2179 sat `running`
  for 42h). **It also carries its own defect: the 2h threshold predates the deep-scrapes cadence
  restore, and a `chain_deep_scrapes` slice legitimately runs ~150 min** — a dashboard load
  mid-slice would mark a healthy, actively-scraping run `failed`. Filed in
  `docs/reports/review_followups.md` (2026-08-05, HIGH) for its own WF3.
  Beyond that, item 5 only emits a warning
  annotation *after* the row has already aged past 12h (i.e. after it has stopped blocking), so
  the blocking window itself has no signal at all beyond the guard's own skip line (which is
  only readable at all since `27e39948` — see §4 item 7). Recovery today is a manual
  `UPDATE pipeline_runs SET status='failed' … WHERE id = <the id the guard now names>`.
  Candidate fix: a reaper that marks rows `failed` when their run is no longer live, or an
  age-scaled annotation that fires *inside* the 12h window rather than after it.
  STATUS UPDATE 2026-08-03 (Pipeline Rehab P0/P3): this fired for real — GH step-timeout
  kills stranded THREE `running` rows (ids 1756/2045/2097; `run-chain.js`'s signal handler
  never landed its UPDATE, likely SIGKILL beating the async write — filed as latent), and
  the then-denylist verdict check read them as GREEN. P0 recovered them via the manual
  UPDATE above; P3's allowlist means such rows now redden the next verdict check instead
  of passing it. Still true: no SCHEDULED reaper exists (see the correction above — the
  `admin/stats` cleanup is request-triggered only), and the 12h blocking window itself remains
  signal-free between verdict checks.
  STATUS UPDATE 2026-08-05 (WF3 post-Phase-A residuals, F1): **it fired again, and the §4
  item 6 handler again failed to land.** chain-sources dispatch `30861473506` hit the
  step-level `timeout-minutes: 180` (`chain-sources.yml:72`) after 3h01m and stranded TWO more
  rows — `2158 chain_sources` and `2179 sources:enrich_parcels` — both `completed_at`/
  `error_message` NULL, for 42h. Closed 2026-08-05 by the manual UPDATE above (2 rows,
  `completed_at` = ops time, `error_message` marks them ops-patched — exclude from duration
  trends). Two structural gaps this exposed, both open: (a) the item-6 handler has now failed
  to terminalize on **five** rows across two incidents, so "likely SIGKILL beating the async
  write" is no longer a one-off hypothesis; (b) `findStaleRunningRow` matches
  `pipeline = 'chain_<id>'` EXACTLY, so **step-level rows like `2179` are invisible to item 5's
  alert entirely** — nothing at all observed that row. Both belong with the sources
  incremental-architecture WF (Phase B B9/B9b).
- **`if: … outputs.skip != 'true'` treats an ABSENT output as "proceed".** Every chain workflow
  gates its run step on `steps.<guard>.outputs.skip != 'true'` (e.g.
  `chain-deep-scrapes.yml:172`, `:203`). GitHub evaluates a missing output as the empty string,
  which is `!= 'true'` — so a guard that crashed before writing anything, or whose stdout was
  redirected/malformed (the exact `27e39948` failure shape), is indistinguishable downstream
  from a guard that deliberately said "not running, go ahead". The fail-safe posture §4 item 3
  builds into the guard (`skip=true` on a DB-check error) is therefore only honored when the
  guard survives long enough to emit it. The robust form asserts the POSITIVE
  (`outputs.skip == 'false'`), so an absent output blocks rather than proceeds. Open as of
  2026-07-30 — recorded, not fixed.
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
- `scripts/check-chain-verdict.js` (the §2.4 post-run verdict reader used by every chain
  workflow's verdict-check step — green-allowlist classification + duration tripwire;
  added to Target Files 2026-08-03, Pipeline Rehab P1/P3, having previously been governed
  by this spec without being listed here)
- `scripts/lib/chain-concurrency.js` (new — shared query helper imported by both
  `check-chain-running.js` and the demoted `local-cron.js`, §4/§7)
- `scripts/run-chain.js` (`SIGINT`+`SIGTERM` handler addition, §4 item 6 — the only
  behavioral change to this file; all other `run-chain.js` behavior is unmodified)
- `scripts/local-cron.js` (header + `isChainRunning` refactor to shared helper + SIGTERM-
  then-SIGKILL-after-grace timeout escalation — demoted, not deleted, §7)
- `scripts/certs/supabase-ca.pem` (new — committed CA cert, §3; governed by Spec 113 §4.3's
  rotation runbook, not re-specified here)
- `scripts/proxy-relay.mjs` (new — §2.4's local unauthenticated proxy relay; carries a
  `SPEC LINK` to §2.4, since it exists to serve the deep_scrapes workflow's runner contract)
- `scripts/requirements.txt` — **pin only** (§2.4 item 2: `nodriver==0.48.1`); the file is
  otherwise Spec 44's
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
- `scripts/aic-scraper-nodriver.py` / `scripts/aic-orchestrator.py` **internals** (scrape
  loop, queue claiming, telemetry, anti-detection layers) — Spec 44 owns those. §2.4 specifies
  only the browser-launch and proxy contract those scripts must satisfy *because it is a
  runner-environment concern* (what the GitHub-hosted runner must provide: display server or
  not, credentials, egress proof). A change to either script's scraping behavior is a Spec 44
  change; a change to how it obtains or proves its proxied egress is a §2.4 change.

### Cross-Spec Dependencies
- **Relies on:** `docs/specs/00-architecture/113_supabase_infrastructure.md` §3 (env/key
  contract), §4 (TLS/CA), §8 (scheduling policy this spec implements), §9.3 (`backup_db`
  re-homing); `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (§R1-R12 skeleton —
  `check-chain-running.js` is a new script and follows it where applicable, adapted for its
  non-`pipeline.run()` GH Actions invocation shape); `scripts/manifest.json` (`chains.*`,
  `backup_db` position); `docs/specs/01-pipeline/44_chain_deep_scrapes.md` (the `deep_scrapes`
  chain this spec schedules — §2.4's launch/proxy contract is mirrored in that spec's
  Deployment Notes).
- **Consumed by:** none yet — this is a leaf spec in the current dependency graph. A future
  Network-Restrictions-allowlist-sync spec (§8, §9) would depend on this one's `runs-on:`
  contract if built.
</constraints>
</content>
