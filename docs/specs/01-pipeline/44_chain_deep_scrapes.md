# Chain: Deep Scrapes (AIC Inspection Portal)

<requirements>
## 1. Goal & User Story
As a tradesperson, I want real-time inspection statuses (Pass/Fail/Outstanding) scraped from the City of Toronto's walled-garden AIC portal — so I can identify exactly where a project stands and time my outreach to the right construction phase.
</requirements>

---

<architecture>
## 2. Chain Definition

**Trigger:** `node scripts/run-chain.js deep_scrapes` or `POST /api/admin/pipelines/chain_deep_scrapes`
**Schedule:** `0 15,18,21 * * 1-5` UTC — 3×/day, weekdays only, via `.github/workflows/chain-deep-scrapes.yml` — **currently DISABLED (the `schedule:` block is committed commented-out; was live 2026-07-29 `f7993025`, re-disabled pending the throughput WF — re-enablement is Pipeline Rehab P7's entry-gated change; Spec 115 §2 + §2.4 own the cadence).** On-demand via `workflow_dispatch` / the admin trigger remains live.
**Steps:** 7 (sequential, stop-on-failure)
**Gate:** None

```
inspections → classify_inspection_status → assert_network_health →
refresh_snapshot → assert_data_bounds → assert_engine_health →
assert_staleness
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `inspections` | `aic-orchestrator.py` | Scrape inspection stages from AIC portal via nodriver CDP | permit_inspections, permits, scraper_queue |
| 2 | `classify_inspection_status` | `classify-inspection-status.js` | Derive `enriched_status` from scraped stages | permits |
| 3 | `assert_network_health` | `quality/assert-network-health.js` | Verify scraper connectivity and proxy health | — |
| 4 | `refresh_snapshot` | `refresh-snapshot.js` | Update dashboard metrics with inspection coverage | data_quality_snapshots |
| 5 | `assert_data_bounds` | `quality/assert-data-bounds.js` | Inspection-scoped: NULL rates, ancient dates, ghost records | pipeline_runs |
| 6 | `assert_engine_health` | `quality/assert-engine-health.js` | Dead tuple ratio + auto-vacuum (maintenance — runs before quality gates) | engine_health_snapshots |
| 7 | `assert_staleness` | `quality/assert-staleness.js` | Monitor scrape freshness and stale permit detection | — |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- AIC Portal: `https://secure.toronto.ca/ApplicationStatus` (session-gated, JS-rendered)
- Permits with `status = 'Inspection'` and `permit_type` in target types
- `scraper_queue` table for db-queue worker mode

### Scraper Architecture (nodriver CDP)
The scraper uses Python `nodriver` (Chrome DevTools Protocol) — not Selenium/Playwright — because the AIC WAF blocks WebDriver automation. All data requests use `page.evaluate(fetch(...))` which executes native browser `fetch()` calls from Chrome's network stack.

**Browser launch: we spawn Chrome, nodriver only ATTACHES (2026-07-30, `7055ce89`).** `launch_chrome()` spawns the browser with our own flag set (stdio to `DEVNULL`, its own process group), `wait_for_devtools()` polls `http://127.0.0.1:<port>/json/version` until it answers, and only then does `uc.start(host, port)` attach via nodriver's `connect_existing` path. nodriver is **not** allowed to launch because its DevTools connect budget is a hardcoded ~2.25 s with no config knob (`core/browser.py`), which a cold profile on a CI runner exceeds just creating its databases; it never reads `DevToolsActivePort`; it `PIPE`s Chrome's stdio and never drains it; and it raises from inside `start()`, orphaning the browser it spawned so the orphan holds the profile and every retry fails identically. Consequences that are now contract, not incidental: readiness budget is `SCRAPER_DEVTOOLS_TIMEOUT_S` (default 60 s) and its timeout error NAMES the port, elapsed time and process return code; teardown always goes through `stop_and_terminate()` because `browser.stop()` cannot kill the process in attach mode (nodriver's attach path never populates `_process_pid`); termination kills a pid **we own**, by process group, never `pkill`/`pgrep` (this scraper also runs on the operator's desktop); and because attach mode means nodriver contributes no flags, `NODRIVER_DEFAULT_ARGS` reproduces nodriver 0.48.1's own defaults verbatim — dropping any of them changes the fingerprint relative to the proven runs. **`nodriver` is exact-pinned `==0.48.1`** in `scripts/requirements.txt`; the previous `>=0.48` meant CI silently resolved 0.50.3, i.e. cloud runs were never the code that was tested.

**Proxy: a local unauthenticated relay, no browser extension (2026-07-30, `19869fc4`).** `scripts/proxy-relay.mjs` (Apify `proxy-chain`) holds the Decodo credentials and listens on `127.0.0.1`; Chrome gets a plain `--proxy-server=http://127.0.0.1:PORT` plus `--proxy-bypass-list=<-loopback>` (Chrome bypasses proxies for loopback by default) and **no extension**. The MV3 proxy-auth extension is retired: branded Chrome removed `--load-extension` in 137 and its opt-out in 142 (unbranded Chromium is exempt today — one base-image bump from breaking), and an idle MV3 service worker is EVICTED, taking `onAuthRequired` with it while `chrome.proxy` settings persist, so the browser keeps routing through the proxy while unable to authenticate — intermittently and invisibly. On CONNECT the relay pipes raw bytes rather than terminating TLS, so the browser's JA3/ALPN fingerprint reaches the origin intact (this is why mitmproxy, which re-originates TLS, must never be substituted). `ignoreProxyCertificate` is required for an `https://` upstream. The relay is owned like the browser (own pid, process group, idempotent kill, `atexit`) because its argv carries live credentials, and both mid-run rotation paths terminate the old relay before starting the new one. `build_proxy_extension()` remains in the file as unreferenced legacy pending a deletion review.

**Decodo credential contract (`3583d824`, `ef9bbab2`, `c3dff232`).** The username is `user-<account>-session-<alnum>-sessionduration-N`: Decodo parses it as a hyphen-delimited key-value list, and **only when it begins with the literal token `user-`**. Verified live — bare `<account>` → 200, `<account>-session-<alnum>` → **407**, `user-<account>-session-<alnum>` → 200. **Session IDs must be alphanumeric** (`buildo-worker-1-<ts>` made the parser read `session=buildo` then choke on `worker`). `PROXY_SCHEME` defaults to **https**: plain-http-to-proxy CONNECT tunnels are RESET, and socks5 — though it works via curl — is unusable because **Chrome cannot authenticate to a SOCKS proxy at all**. Ports select the mode on `ca.decodo.com`: 20000 rotating, 20001-29999 sticky with ONE exit IP pinned per port, so `resolve_proxy_port()` gives worker N `base+N-1` inside the sticky band (all workers previously shared port 20001, and hence one exit IP — a per-worker `-session-` suffix cannot override a port-level pin).

**Proxied-egress tripwire (`0e32cc84`).** `verify_proxied_egress()` navigates the browser to an IP echo service (`SCRAPER_EGRESS_ECHO_URL`) and refuses to scrape unless the browser's egress IP differs from this host's own (memoized with a TTL, `SCRAPER_HOST_IP_TTL_S`, default 900 s). An echo the browser cannot reach while the host just did is treated as evidence **OF** proxying, not grounds to refuse; a browser reporting THIS HOST's IP is fatal. This tripwire, not any launch flag, is what guarantees the scraper never runs unproxied.

> **Historical (`43496bcb`):** until 2026-07-30 the proxy had **never** actually been in this scraper's path. The MV3 extension was its only proxy mechanism, and the operator's branded Chrome 150 cannot load it — so local runs scraped DIRECT from a residential IP while telemetry recorded `proxy_configured=true`. The only demonstrably proxied runs were the Playwright scraper deleted 2026-04-16. **Status 2026-07-30: verified LOCALLY end-to-end (relay → headless Chrome, no extension → distinct browser egress IP → clean teardown). The CI validation run is still PENDING** — nothing here may be cited as CI-confirmed yet.

**4-Step API Chain per permit:**
1. `POST /jaxrs/search/properties` — find property by year+sequence
2. `POST /jaxrs/search/folders` — get all permit folders at address
3. `GET /jaxrs/search/detail/{folderRsn}` — permit detail + inspection processes
4. `GET /jaxrs/search/status/{folderRsn}/{processRsn}` — inspection stage table

**Anti-Detection (6 layers):**
1. Screen dimension overrides (fix headless 800x600 leak)
2. `--disable-blink-features=AutomationControlled` (suppress `cdc_` variables)
3. Persistent `user_data_dir` per worker (cookie reuse across runs)
4. Coherent fingerprint profiles (viewport + platform + UA paired)
5. WAF-triggered proxy rotation (residential IPs, 1 batch = 1 IP; a rotation restarts the relay with a fresh Decodo session, it does not reload an extension)
6. Shuffled batch order + randomized batch sizes (5-15)
7. Proxied-egress tripwire — refuse to scrape at all unless the browser's egress IP is provably not this host's

**Execution model (db-queue mode):**
- Claims batch from `scraper_queue` via `FOR UPDATE SKIP LOCKED`
- Each batch gets a fresh Decodo sticky session (new relay, new session id) on that worker's own sticky port
- Chrome killed after each batch (`stop_and_terminate()` — CDP disconnect **plus** a real process-group kill; `browser.stop()` alone cannot kill an attached browser) — no IP sees more than 5-15 permits
- WAF detection: 20+ consecutive empty results → immediate proxy rotation

### Core Logic
1. **Inspection scraping** — for each permit in queue, execute 4-step API chain. Parse inspection stages: stage name, status (Outstanding/Passed/Not Passed/Partial), date, inspector.
2. **DB upsert** — `INSERT INTO permit_inspections ON CONFLICT (permit_num, stage_name) DO UPDATE` with `IS DISTINCT FROM` guards. Only updates when status or date actually changes.
3. **Enriched status derivation** — the scraper computes `enriched_status` from stages:
   - Any Not Passed → `'Not Passed'`
   - All Outstanding → `'Permit Issued'` (unreachable under passed-only listings; retained for robustness)
   - Otherwise (stages present) → `'Active Inspection'`
   - **`'Inspections Complete'` is deliberately NOT derivable from stages** (operator-ruled
     2026-07-30). The portal lists only stages already passed — *"this list reflects applicable
     mandatory inspection stages that have been passed"* — so an all-passed list means only
     "inspection activity observed". Ground truth (operator-pulled, 2026-07-30): permits
     `23 183037`, `17 172425` and `23 132404` all have **Occupancy passed yet AIC status still
     'Inspection'**; applicable stages vary per project (`23 183037` has no Excavation/Shoring
     row). Lifecycle completion truth is the FEED's own status (`permits.status`, e.g.
     `'Pending Closed'`) — deriving a completion state from it belongs to the permits chain
     (filed follow-up: lifecycle-engine update).
4. **Network health** — verifies proxy connectivity, checks for WAF blocks in recent pipeline_runs
5. **Staleness** — flags permits with stale `scraped_at` (> `scrape_stale_days`); operator-tunable 3-tier gate (`staleness_max_stale_over_30d` mig 121); monitors consecutive empty streaks

### Outputs
- `permit_inspections` table: stage-level status records per permit
- `permits.enriched_status`: derived lifecycle status
- `scraper_queue` table: batch status tracking (pending/claimed/completed/failed)
- `permit_scrape_outcomes` table: per-permit outcome ledger (see the persistence contract below)
- Telemetry in `records_meta`: permits_attempted, permits_found, latency p50/p95, proxy errors,
  outcome_write_failures / outcome_resolution_failures (ledger health)

### Scrape-Outcome Persistence Contract (WF2 2026-07-31, migrations 236/237)

**Operator goal:** *"understand why the inspections data failed for a permit — so we could take
corrective action — we need to hold the data in the database."* Aggregate telemetry answers "how
did the RUN go"; this ledger answers "why did THIS permit yield nothing" after the run ends.

**Shape:** `permit_scrape_outcomes` — append-only, permit_num-grain (revision-grain ambiguity
accepted knowingly), identical rows from both transports per terminal branch. Every row carries
`outcome`, sanitized `detail`, `transport` (http|browser, NOT NULL), `run_id`
(`SCRAPER_RUN_ID` = `GITHUB_RUN_ID` or a generated uuid; standalone runs stamp their own) and
`observed_at`. The vocabulary is the 8-value contract in `docs/specs/_contracts.json`
`schema.scrape_outcomes`, triple-pinned (contract ↔ migration CHECK ↔ scraper frozenset) by
`contracts.infra.test.ts` + the live-DB test.

**Taxonomy (threading semantics — the classification SURVIVES to the ledger):**

| Outcome | Grain | Meaning | Stamps `last_scraped_at`? |
|---|---|---|---|
| `scraped` | permit | Real stages upserted (row flushed only AFTER the stage commit) | YES (existing stamping, untouched) |
| `no_stages` | permit | Portal answered honestly: no stage passed yet | YES (the DB must remember the portal answered) |
| `no_inspection_link` | permit | `no_processes` / `showStatus=false` → Permit Issued path | YES (existing behavior) |
| `no_target_folders` | year_seq | Address exists, no BLD folder | NO |
| `address_not_found` | year_seq | Our feed believes in a permit the portal does not — a data defect worth chasing | **NO** (a permit deleted from source must stay visible to staleness monitoring) |
| `waf_blocked` | year_seq (per attempt) | The portal answered with the block signature: 403/HTML body, or the Akamai-hollow family (`unparseable`, `html_or_empty`, `json_decode_error`, `non_string_result:*` as `detail`) | **NO** |
| `transport_error` | year_seq (per attempt) | The request never completed — curl transport error, browser `fetch_error:<Class>` (kept as `detail`). **Never collapsed into `waf_blocked`** — the chain-result-layer lock pins this | **NO** |
| `retry_exhausted` | year_seq | All `SCRAPER_MAX_RETRIES` attempts failed; `detail` carries the last classified detail (or the exception class for unclassified errors — a DB error is never laundered into a portal outcome) | **NO** |

The no-stamp rule is load-bearing: `last_scraped_at` is the 7-day queue cooldown, and stamping
failures would empty the pending queue during a total outage — a week of green zero-work runs.

**Batch-grain resolution (C9):** year_seq-grain outcomes resolve to `DISTINCT permit_num`s once
per claimed batch via the `populate_queue` SUBSTRING derivation restricted to the eligible
TARGET_TYPES population. A year_seq resolving to ZERO permits still writes the row —
`permit_num NULL` + the raw `year_seq` — and counts `outcome_resolution_failures`; the anomalous
outcome this feature exists for must never vanish.

**Writer isolation (operator ruling D2):** dedicated per-worker autocommit connection, lazily
opened, closed at teardown; on failure it closes + lazily reopens through a bounded backoff
ladder whose first rung is zero (recovery on the next insert). It can NEVER raise into or roll
back the scrape path (the reproduced v1 defect: a swallowed ledger INSERT error on the shared
connection silently rolled back real stage upserts while telemetry reported them committed).
Every swallow increments `outcome_write_failures` and logs once per failure kind. `detail` is
allowlist-sanitized (classifier tokens + `fetch_error:*`; anything else reduced to a class-name
token; hard 500-char cap) — defense-in-depth over the `d295188b` relay redaction.

**Observability:** the orchestrator aggregate carries both counters and gates on them —
`FAIL` iff `permits_attempted > 0 AND outcome_write_failures >= permits_attempted`, `WARN` iff
`>= 1`, zero-attempted its own non-FAIL case — plus a per-outcome breakdown INFO row. All three
`emit_meta` sites declare `permit_scrape_outcomes` (and the previously-omitted `permits` /
`scraper_queue` writes).

**Retention (operator ruling D1):** 90-day raw horizon; the daily `permit_scrape_outcomes_prune`
pg_cron job (migration 237, Spec 115 §5) atomically folds expired rows into
`permit_scrape_outcome_rollup` keyed `(permit_num, outcome, transport)` with
`occurrences`/`first_at`/`last_at`; permit_num-NULL rows fold under their `year_seq`. Retention
length is re-evaluated when the `populate_queue` re-queue-forever defect is fixed (filed in
`docs/reports/review_followups.md`).

### Edge Cases
- **Portal lists only PASSED stages (observed 2026-07-30)** — `stages: []` is the NORMAL
  answer for any permit that has not yet passed a stage (probe #7: two Inspection-status
  permits, both legitimately empty). An empty list is not a miss, a WAF block, or an error.
  **Empty outcomes are therefore a TAXONOMY, not one counter** (WF3 2026-07-30):
  `address_not_found` / `no_target_folders` are queue-anomalous (our own feed said the permit
  exists); `no_stages` / `no_inspection_link` are the portal answering honestly. The audit
  gate is `anomalous_miss_rate < 20%` — computed over the anomalous class only — with
  `not_found_count` + the benign counts emitted as INFO rows and the full
  `not_found_breakdown` in `scraper_telemetry`. **Small-n statistics (Pipeline Rehab P6,
  2026-08-03 — `classify_miss_rate`, mirrored byte-identically in `aic-orchestrator.py`
  and `aic-scraper-nodriver.py`, parity pytest-locked):** the gate is FAIL-eligible only
  at `permits_attempted >= 30`; at the ASSUMED 10% anomalous baseline (a pre-ledger
  assumption — re-measure from the outcome ledger once P7 accumulates real runs) the
  binomial false-FAIL probability is 27.1% at n=3 (the probe dispatch default) vs 7.3% at
  n=30, so a small capped probe over the threshold emits **WARN**, not FAIL. The WIPEOUT
  class stays FAIL at ANY n (the `de3ff6dd` false-PASS must not reopen): the 90%-anomalous
  early abort fired (`early_abort` rides telemetry across the worker→orchestrator
  boundary), the run was UNCAPPED (production-shaped), the absolute anomalous count is
  ≥ 10, or the rate itself is ≥ 90%. The row's threshold string self-documents this whole
  regime. Only anomalous misses feed the `consecutive_empty` WAF-trap counter and the 90%
  early-abort. A `no_stages` permit gets `last_scraped_at` stamped (the DB must remember
  the portal answered, or the staleness monitor counts it never-scraped forever and the
  queue re-buys the same empty answer)
- AIC returns HTML instead of JSON → WAF block detected, proxy rotated
- Permit has `status = 'Revision Issued'` on AIC → no inspections data (only rev 00 has them)
- `showStatus = false` on permit detail → no inspection link available, set `enriched_status = 'Permit Issued'`
- All retries exhausted for a permit → skip and continue, mark as failed in queue
- Portal DOM restructure → scraper breaks immediately (relies on REST API, not DOM selectors)
- **Proxy auth failure (407) is INVISIBLE in the browser** — Chrome renders "This site can't be reached" for every page, identical to a network outage. Diagnose by probing the proxy directly (curl through the same username/scheme/port), never by reading the browser's error page
- Relay dies mid-run → NOT silent unproxied scraping: `--proxy-server` is a hard route with no direct fallback, so the failure surfaces as WAF-trap rotations that spin up a fresh relay
</behavior>

---

<quality>
## 4. Data Quality Assertions

### Network health (assert_network_health)
| Check | Threshold | Level |
|-------|-----------|-------|
| Last successful scrape | within 24h | WARN |
| Proxy error rate | > 50% | FAIL |

> **Known gap (2026-07-30, open):** this check reads `proxy_configured` nowhere and has no notion of *"was egress actually proxied"* — a fully DIRECT run reports `proxy_errors = 0` and PASSES. That is precisely why four months of unproxied scraping went unnoticed (see the historical note in §3). The fix is to feed the `verify_proxied_egress()` result into `scraper_telemetry` and gate on it; filed in `docs/reports/review_followups.md`.

### Staleness (assert_staleness)
| Check | Threshold | Level |
|-------|-----------|-------|
| Permits with stale `scraped_at` (>`scrape_stale_days`) | > `staleness_max_stale_over_30d` | FAIL |
| Permits with stale `scraped_at` (>`scrape_stale_days`) | 1..`staleness_max_stale_over_30d` (inclusive) | WARN |
| Coverage (scraped/total) | < `staleness_min_coverage_pct` | WARN (informational) |
| Single-permit `max_days_stale` | > `staleness_max_days_stale` | WARN (informational) |
| Consecutive empty max | > WAF_TRAP_THRESHOLD (20) | WARN |

> **Operator-tunable (mig 121, WF3 2026-05-08):** all three `staleness_*` thresholds are operator-tunable via `/admin/control-panel` per Spec 86 §1. Defaults absorb the 2026-05-08 snapshot (6,514 stale → WARN, not FAIL); tighten to <2000 once scrape coverage ≥50% per Spec 38.

### Data bounds (assert_data_bounds, deep_scrapes scope)
| Check | Threshold | Level |
|-------|-----------|-------|
| permit_inspections NULL status | > 0 | FAIL |
| Ancient inspection dates (>5 years) | > 0 | WARN |
| Ghost permits (not seen in 30+ days) | > 0 | WARN |
</quality>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `inspections.logic.test.ts` (status normalization, enriched_status derivation, date parsing, API chain mocking)
- **Logic:** `chain.logic.test.ts` (deep_scrapes chain definition)
- **Infra:** `quality.infra.test.ts` (assert-network-health, assert-staleness scripts exist)
<!-- TEST_INJECT_END -->

**Python (`scripts/tests/`, pytest — added 2026-07-29, `1271bf17`).** `scripts/` had zero Python coverage (vitest is JS/TS-only, eslint ignores `scripts/`), so every scraper logic defect was discoverable only by dispatching a ~6-minute GitHub Actions run — four in a row proved the gap. Run with `npm run test:py`; CI runs it as the Pytest job in `.github/workflows/pipeline-lint.yml`. The chains install `requirements.txt` only, so the harness (`requirements-dev.txt`) can never reach a production run. Covers the pure seams: `clear_stale_profile_locks`, `build_browser_args` (extracted as a pure function precisely so launch flags are testable without a browser), the launch/readiness/teardown path, `build_proxy_username` / `resolve_proxy_port`, the egress tripwire's parsing and fail-loud branches, module-level env parsing, `safe_json_parse`, and the orchestrator's `preflight_failures` aggregation. Any new scraper logic must land with locks here rather than be validated by dispatch.

**Outcome-persistence locks (WF2 2026-07-31):** `scripts/tests/test_scrape_outcome_persistence.py`
— classification threading (all 8 chain failure sites, both transports), the chain-result-layer
lock that a `transport_error` kind must NOT surface as `waf_blocked` (the lock `5dc577f2` never
got), `retry_exhausted` explicit end-to-end, the WAF-trap `+THRESHOLD` forcing as a separate
top-level `if` (mutation-style), writer recovery/swallow-and-count/teardown, detail-sanitizer
allowlist + cap, DISTINCT batch resolution + `year_seq` zero-resolution fallback, no-stamp rules,
transport-identical rows, vocabulary agreement with `_contracts.json`, and the orchestrator
counter merge + guarded audit row. Live-DB proof: `src/tests/db/236_permit_scrape_outcomes.db.test.ts`
(CHECKs, RLS, contract equality) + `src/tests/db/237_scrape_outcome_prune.db.test.ts`
(prune atomicity/idempotency/LEAST-GREATEST/rollup keys).

**Miss-rate gate statistics locks (Pipeline Rehab P6, 2026-08-03):**
`scripts/tests/test_scraper_outcomes.py::TestMissRateGate` — small-n capped probe over
threshold → WARN not FAIL (n=3, 1 anomalous); n=30 at 23.3% → FAIL; sub-threshold PASS at
any n; the four wipeout shapes each stay FAIL at small n (early-abort fired / uncapped
run / anomalous ≥ 10 / rate ≥ 90%); orchestrator/scraper `classify_miss_rate` parity;
`early_abort` recorded in `make_telemetry()`; `compute_summary` wiring (row status WARN +
self-documenting threshold string + row-derived WARN verdict on a small probe miss).
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `scripts/manifest.json` (deep_scrapes chain array)
- `scripts/aic-scraper-nodriver.py` — nodriver CDP scraper
- `scripts/aic-orchestrator.py` — multi-worker orchestrator
- `migrations/236_permit_scrape_outcomes.sql` / `migrations/237_scrape_outcome_prune.sql` — the outcome ledger + its retention prune (drift fence: schema changes to the ledger go through this spec)
- `scripts/tests/test_scrape_outcome_persistence.py` — outcome-persistence + classification-threading locks
- `scripts/proxy-relay.mjs` — local unauthenticated proxy relay (shared with Spec 115 §2.4, which owns its runner contract)
- `scripts/requirements.txt` / `scripts/requirements-dev.txt` — runtime + test deps (`nodriver` is EXACT-pinned; see §3)
- `scripts/tests/` — pytest harness for the Python pipeline scripts
- `scripts/classify-inspection-status.js`
- `scripts/quality/assert-network-health.js`, `scripts/quality/assert-staleness.js`

### Out-of-Scope Files
- `scripts/poc-aic-scraper-v2.js` — legacy JS scraper (deprecated)
- `src/app/permits/[id]/page.tsx` — inspection UI rendering
- `.github/workflows/chain-deep-scrapes.yml` — Spec 115 §2.4 owns the workflow, its runner, secrets and Xvfb disposition; this spec owns what the scripts themselves do

### Deployment Notes
- **Proxy mode (AMENDED 2026-07-30 — supersedes the headed-Chrome/Xvfb requirement):** Chrome runs **headless** with a plain `--proxy-server` pointing at the local relay and NO extension, so **no display server is required**. Headed mode + `xvfb-run` existed ONLY because `--load-extension` needs them. The `chain-deep-scrapes.yml` workflow still installs Xvfb and still invokes `xvfb-run -a node scripts/run-chain.js deep_scrapes` **pending a CI run that confirms the headless path**; removing it is a filed follow-up, not a completed change (Spec 115 §2.4). The `RuntimeError` for "proxy mode needs headed Chrome but `DISPLAY` is unset" survives in `build_browser_args`, now reachable only via the unreferenced legacy extension path.
- **Required env:** `PROXY_HOST` / `PROXY_PORT` (the worker-1 sticky base; workers get `base+N-1`) / `PROXY_USER` (bare account — the `user-` prefix is added by `build_proxy_username`, idempotently) / `PROXY_PASS`; optional `PROXY_SCHEME` (default `https`), `PROXY_SESSION_DURATION_MIN` (default 30), `SCRAPER_DEVTOOLS_TIMEOUT_S` (default 60), `SCRAPER_EGRESS_ECHO_URL`, `SCRAPER_HOST_IP_TTL_S` (default 900). The relay needs `node` on `PATH` and the `proxy-chain` dependency installed.
- **Local proxied runs need unbranded Chromium or Chrome for Testing** if the legacy extension path is ever used; on the current relay path any Chrome works, since no extension is loaded.
- **Browser TTL:** Non-proxy mode recycles Chrome every `BROWSER_MAX_BATCHES` batches (default 50) to prevent memory bloat.

### Cross-Spec Dependencies
- **Relies on:** `pipeline_system.md` (SDK, orchestrator)
- **Relies on:** `docs/specs/00-architecture/115_scheduling.md` §2.4 (the GitHub Actions runner contract for this chain — browser launch ownership, relay, Decodo credential/scheme/port contract, egress tripwire, Xvfb disposition)
- **Relies on:** `chain_permits.md` (permits must be loaded first — scraper targets permits with `status = 'Inspection'`)
</constraints>
