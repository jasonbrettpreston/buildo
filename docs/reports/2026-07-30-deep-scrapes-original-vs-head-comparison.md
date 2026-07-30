# Deep-Scrapes Scraper — `de3ff6dd` (pre-cloud original) vs HEAD: Comparison & Cloud-Minimum Classification
**Recovered 2026-07-30 from the crashed 2026-07-29 session (transcript `1ace4c0b`); produced by its comparison agent + final adjudication. Input to the WF2 rewrite plan.**

## Session's final adjudication (verbatim)

The report is in, and it's a clear indictment. Here's the honest accounting.

**Your capture logic was never touched.** Verified mechanically, function by function: `fetch_permit_chain`, `scrape_year_sequence`, `scrape_with_retry`, `safe_json_parse`, the status normalisation, the upserts, the queue SQL — all byte-identical. The only insertion is two logging calls that can't affect control flow.

**What the cloud actually required was about 20 lines of Python and 5 workflow lines.** I added 927, and roughly **620 of them fall outside that minimum**. The genuine requirements were: pin nodriver to 0.48.1 (one line — CI was silently running 0.50.3, so cloud never ran your code); delete the profile-cache step (one line); fix the Decodo auth — `user-` prefix, alphanumeric session, https scheme (~10 lines); install Chrome for Testing so the MV3 extension still loads (~4 workflow lines, zero Python); and give the DevTools handshake more than 2.25 seconds.

**Two architectural choices of mine generated ~400 of the excess lines, and both had far cheaper alternatives.** Instead of installing Chrome for Testing — which is exempt from the `--load-extension` removal and would have kept your extension *and* headed mode — I built a 137-line relay plus 90 lines of plumbing plus a new npm dependency. Instead of a ~5-line monkeypatch of nodriver's retry loop, I built ~200 lines of attach-mode machinery, which then forced another ~200 lines of process-ownership code because nodriver can't kill a browser it didn't spawn. Each choice cascaded: the relay dropped the extension, which forced headless, which made the egress tripwire feel necessary — another 190 lines.

**The single biggest unintended change:** your local run went from **unproxied and headed** to **proxied and headless**. At the old commit the extension was silently dropped by branded Chrome, so you scraped direct from your own IP — which is exactly why it worked. Now your local traffic genuinely leaves through metered Decodo, headless.

**One change is actively harmful and I'd revert it first:** `WAF_TRAP_THRESHOLD` from 20 to 3. `accumulate()` counts *legitimate* not-founds toward `consecutive_empty`, so three genuine misses now trigger a full browser and IP rotation — and each rotation counts against the launch ceiling of 12. That would wreck a healthy run anywhere. There's also a live bug: the "relay start moved inside the try" fix is unreachable dead code, so a relay failure still escapes uncaught.

**To get your proven local behaviour back right now**, set `PROXY_HOST=` empty and `SCRAPER_WAF_TRAP_THRESHOLD=20`, `SCRAPER_RETRY_BASE_MS=2000`, `SCRAPER_MAX_RETRIES=3`, `SCRAPER_MAX_BROWSER_LAUNCHES=9999`. That covers most of it; the bandwidth flags, attach mode and `--enable-logging` have no env switch and need code changes.

**My recommendation is a targeted revert of about 60 lines** rather than wholesale — restore the original launch path and the three constants, put the tripwire, ceiling and bandwidth guard behind flags defaulting off, and keep the four things genuinely worth having: the Decodo auth fix, the profile-lock clearing, the step-1 body logging, and the per-worker sticky ports. A wholesale revert to `de3ff6dd` is also safe — your empty-string env fix predates it — but it would break the four pytest files, which import functions that only exist now.

Say the word and I'll do the targeted revert as a proper WF3 with a plan lock and review before any code.

---

## Full agent classification report (verbatim)

I have everything I need. Here is the report.

---

# Deep-Scrapes Scraper: `de3ff6dd` → `HEAD` Difference Report

**Scope:** 28 commits, `scripts/aic-scraper-nodriver.py` **+927 / −54** (1267 → 2140 lines).
**`scripts/aic-orchestrator.py`: UNCHANGED. `.github/workflows/chain-deep-scrapes.yml`: UNCHANGED.**
New: `scripts/proxy-relay.mjs` (137 lines). `scripts/requirements.txt`: 1 functional line. Also touched: `scripts/check-chain-running.js` (+11, observability), pytest harness (new files), `package.json` (+`proxy-chain`).

---

## ⚠️ Read this first — it changes how you read every row below

**Your local `.env` has `PROXY_HOST`, `PROXY_PORT`, `PROXY_USER` and `PROXY_PASS` all set.** Every `if PROXY_HOST:` branch is therefore **live on your machine**, not just in CI.

What that means concretely:

- **At `de3ff6dd`, your local run was proxy-*configured* but accidentally proxy-*free*.** The code built the MV3 extension and passed `--load-extension`; branded Chrome ≥137 **silently drops that flag**, so the extension never loaded, `chrome.proxy.settings` was never set, and traffic went **direct from your own IP**. It also ran **headed** (`use_headless = False` whenever `proxy_ext_dir` was set). That is exactly the "worked locally through my own Chrome, unproxied" behaviour — it worked *because the proxy silently failed*.
- **At `HEAD`, your local run is genuinely proxied.** `start_proxy_relay` spawns `node scripts/proxy-relay.mjs`, Chrome gets `--proxy-server=http://127.0.0.1:PORT`, and **all** browser traffic — including your AIC scraping — leaves through the metered Decodo residential exit. It also runs **headless** now.

So the single largest behavioural difference is not in any one row: **your local scraper changed from unproxied-headed to proxied-headless.** Setting `PROXY_HOST=` (empty) locally removes about half the rows below; it does not remove the rest.

---

## HEADLINE — Four-bucket classification of every difference

| ID | Difference | Bucket | Cloud property that forces it (bucket 1 only) | Commit |
|---|---|---|---|---|
| A1 | `_log_step1_body()` calls in `fetch_permit_chain` | **4 Pure diagnostic** | — | `4124a0f7` |
| B1/B2 | Relay-readiness + 30 s timeout `raise` | **1 Cloud-required** *(conditional on the proxy being required)* | Runner has a datacenter IP AIC/Akamai will flag; creds live only in env | `19869fc4` |
| B3/B4/B6 | Proxied-egress tripwire (3 `raise`s) | **2 Cloud-motivated, optional** | — | `0e32cc84`,`1b52f03a`,`0b7dcfa0`,`733e67c4` |
| B5 | Dead duplicate `host_ip` `raise` (unreachable) | **2** (dead code) | — | `0e32cc84` |
| B7/B8 | Chrome-exited + DevTools-60 s `raise` | **1 Cloud-required** — *but see the cheaper alternative* | Cold CI profile exceeds nodriver's hardcoded 2.25 s handshake budget | `7055ce89` |
| B9 | `MAX_BROWSER_LAUNCHES=12` hard ceiling | **2 Cloud-motivated, optional** | — | `68a2f55e` |
| B10 | DISPLAY guard — **now unreachable dead code** | **3 Not cloud-related** | — | pre-existing `c60e453e` |
| B11 | Pre-`try` relay start still escapes `main()` — the "inside the try" fix is **dead code** | **bug** | — | `b1bc91e9` |
| C1 | We spawn Chrome; nodriver attaches | **1 Cloud-required** — *contestable, see §C* | Same as B7/B8 | `7055ce89` |
| C2/C3 | `NODRIVER_DEFAULT_ARGS` + `IsolateOrigins,site-per-process` reproduced | **1** (mechanical consequence of C1) | — | `7055ce89` |
| C4/C5 | `BANDWIDTH_GUARD_ARGS` (8 flags) + `BANDWIDTH_GUARD_FEATURES` (7 features) | **3 Not cloud-related** (cost guard, applies wherever the proxy runs) | — | `25df503a` |
| C6/C7 | `--proxy-server=<relay>`, `--proxy-bypass-list=<-loopback>` | **1 Cloud-required** *(if proxying)* | — | `19869fc4` |
| C8/C9 | `--remote-debugging-port/host`, `--user-data-dir` | **no change** — nodriver already passed these | — | `7055ce89` |
| C10 | **Headed → headless** whenever `PROXY_HOST` is set | **3 Not cloud-related** (side-effect of dropping the extension) | — | `19869fc4` |
| C11 | `--enable-logging --log-file=…` | **4 Pure diagnostic** (but is a real launch flag) | — | `1271bf17` |
| C12 | Extension flags now **dead code** | **3** | — | `19869fc4` |
| D1 | MV3 extension → local `proxy-chain` relay | **1 Cloud-required** *(if proxying)* — *see §D for the simpler alternative* | Branded Chrome ≥137 dropped `--load-extension`; runner ships branded Chrome | `61705719`,`19869fc4` |
| D2 | Decodo username reformat (`user-…-sessionduration-N`) | **3 Not cloud-related** — a provider protocol fact, true everywhere | — | `3583d824` |
| D3 | Session ID `buildo-worker-1-<ts>` → `w1t<ts>` | **3** | — | `3583d824` |
| D4 | Per-worker sticky ports (`base + N − 1`) | **3** | — | `c3dff232` |
| D5 | `PROXY_SCHEME` default `https` | **3** | — | `ef9bbab2` |
| D6 | `PROXY_SESSION_DURATION_MIN=30` | **3** | — | `3583d824` |
| D7 | Relay host **block**list (16 Google hosts) | **2 Cloud-motivated, optional** | — | `25df503a`,`539468b5` |
| D8 | Relay port reuse across rotations | **1** (mechanical consequence of D1) | — | `19869fc4` |
| E1 | `MAX_RETRIES` **3 → 2** | **3 Not cloud-related** | — | `ae5f7c26` |
| E2 | `RETRY_BASE_MS` **2 000 → 90 000** | **3 Not cloud-related** | — | `ae5f7c26` |
| E3 | `WAF_TRAP_THRESHOLD` **20 → 3** | **3 Not cloud-related** | — | `ae5f7c26` |
| E5 | Per-batch browser recycling in proxy mode **removed** | **3 Not cloud-related** | — | `15c7417b` |
| E7 | `DEVTOOLS_READY_TIMEOUT_S=60` | **1** (with B7/B8) | — | `7055ce89` |
| E8 | `HOST_EGRESS_IP_TTL_S=900` | **2** | — | `0b7dcfa0` |
| F2 | `log_chrome_diagnostics()` — resolves + runs `chrome --version` | **4 Pure diagnostic** | — | `20dbcd6c` |
| F3 | `dump_chrome_launch_log()` | **4** | — | `20dbcd6c` |
| F4 | `log_browser_targets()` | **4** | — | `733e67c4` |
| F6/F7 | DevTools-ready, port-drift, lock-removed logs | **4** | — | `7055ce89`,`8c3dd193` |
| G1 | `clear_stale_profile_locks()` | **1 Cloud-required** — *or one deleted workflow line* | `actions/cache` restores `~/.buildo-scraper` from another run/host; the `SingletonLock` symlink names a dead host/PID and Chrome refuses to start | `8c3dd193` |
| G2/G3/G4 | `stop_and_terminate`, `terminate_spawned_*`, `atexit` | **1** (mechanical consequence of C1/D1) | nodriver's `stop()` cannot kill a browser it did not spawn | `7055ce89`,`733e67c4`,`19869fc4` |
| G5 | `nodriver>=0.48` → `==0.48.1` | **1 Cloud-required** | Fresh `pip install` on a runner resolved **0.50.3** — cloud was never running the code you tested | `7055ce89` |
| G7 | pytest harness (`scripts/tests/`, `pytest.ini`) | **4** | — | `1271bf17` |
| G9 | `check-chain-running.js` guard observability | **4** | — | `27e39948` |

**Bucket totals:** 1 = 9 items (~340 lines, and 2 of the 3 largest are contestable) · 2 = 6 items (~250 lines) · 3 = 11 items (~120 lines) · 4 = 9 items (~200 lines).

---

## A. Data capture logic — **VERIFIED UNCHANGED**

This is your main worry, so I compared it mechanically rather than by eye. I extracted each function from both revisions and ran a unified diff:

```
normalize_status / compute_enriched_status / parse_inspection_date : IDENTICAL
safe_json_parse                                                     : IDENTICAL
fetch_permit_chain                                                  : +7 lines, all logging (below)
scrape_year_sequence                                                : IDENTICAL
scrape_with_retry                                                   : IDENTICAL
claim_batch_from_queue / complete_batch_in_queue                    : IDENTICAL
make_telemetry / compute_summary                                    : IDENTICAL
sanitize_js_value / emit_summary / emit_meta / log                  : IDENTICAL
```

| # | Original | Now | **Alters a local unproxied run?** | Cloud-needed? | Commit |
|---|---|---|---|---|---|
| A0 | All four `/jaxrs/` calls: `search/properties`, `search/folders`, `search/detail/{rsn}`, `search/status/{folder}/{process}` — URLs, methods, headers (`Content-Type`/`Accept`), the 13-field POST body, `AbortController` at 15 000 ms, `r.text()`, error sentinel | **Byte-identical** (orig 509–635 → HEAD 1350–1483) | **No** | — | — |
| A0b | `TARGET_SECTIONS=['BLD']`, folder filter, `showStatus`/`inspectionProcesses` handling, `permit_num` composition | Identical | **No** | — | — |
| A0c | Status normalisation from `scripts/lib/status_mapping.json`, `compute_enriched_status` precedence, date parsing (ISO/US/named-month) | Identical | **No** | — | — |
| A0d | All upserts: `permit_inspections` `ON CONFLICT … WHERE IS DISTINCT FROM`, `scraped_at` touch by `stage_name = ANY()`, `permits.enriched_status` + `last_scraped_at`, the `no_processes`/`no_status_link` → `'Permit Issued'` path, commit/rollback | Identical | **No** | — | — |
| A0e | Standalone eligibility SQL and queue claim/complete SQL | Identical | **No** | — | — |
| A1 | — | `_log_step1_body(step1, 'parse_failed', …)` at **1377**, `_log_step1_body(step1, 'empty_result', …)` at **1383** | **No** — returns `None`, increments a counter, prints; capped at 8 samples; no branch depends on it | No (bucket 4) | `4124a0f7` |

**Statement, explicitly: the request chain, the search body, the response parsing, the upserts and the status normalisation are unchanged. Nothing in the data path was touched. The only insertion is two logging calls that cannot affect control flow.**

---

## B. New bootstrap-fatal gates

| # | Trigger | HEAD line | **Can fire on a LOCAL unproxied run?** | Cloud-needed? | Commit |
|---|---|---|---|---|---|
| B1 | Relay process exits before printing its listen URL (e.g. `node` missing, `proxy-chain` not installed, port taken) | 373 | **Yes, while `PROXY_HOST` is set in your `.env`.** No if you blank it | Bucket 1 (if proxying) | `19869fc4` |
| B2 | Relay does not report a URL within **30 s** | 375 | **Yes**, same condition | Bucket 1/2 | `19869fc4` |
| B3 | `host_egress_ip()` cannot reach `api.ipify.org` — refuses to scrape "unverified" | 729 | **Yes**, same condition. A transient ipify outage kills the run | Bucket 2 | `0e32cc84` |
| B4 | Browser navigates to ipify but the body yields no IP and does not look like a Chrome error page | 753 | **Yes**, same condition | Bucket 2 | `0e32cc84` |
| B5 | Duplicate `if not host_ip:` — **unreachable**, B3 already returned | 757–762 | No (dead) | Bucket 2 | `0e32cc84` |
| B6 | **Browser egress IP == host IP → "traffic is UNPROXIED"** | 763–770 | **Yes**, same condition. Note the error text still blames the MV3 extension, which no longer exists | Bucket 2 | `0e32cc84` |
| B7 | Chrome process exits during startup before DevTools answers | 1006 | **Yes, always** — this is on the unconditional attach path | Bucket 1 | `7055ce89` |
| B8 | DevTools endpoint silent for **60 s** (`SCRAPER_DEVTOOLS_TIMEOUT_S`) | 1017 | **Yes, always** | Bucket 1 | `7055ce89` |
| B9 | **13th** Chrome launch in one process (`SCRAPER_MAX_BROWSER_LAUNCHES=12`) | 1044–1050 | **Yes, always.** With `WAF_TRAP_THRESHOLD=3` (E3) each trap rotates the browser, so 12 traps ends a long local run | Bucket 2 | `68a2f55e` |
| B10 | DISPLAY guard — **now unreachable**: it sits inside `if proxy_ext_dir:`, and `build_proxy_extension()` is **never called** at HEAD | 920–924 | **No** — dead code | Bucket 3 | pre-existing |

**B11 — a live bug.** `b1bc91e9` added a "relay start lives INSIDE this try" block at **1918–1920**, but did **not** remove the pre-`try` calls at **1900** and **1905**. Lines 1898/1903 (`if PROXY_HOST and worker_id:` / `elif PROXY_HOST:`) already cover every `PROXY_HOST` case, so **1918–1920 is unreachable** and a relay failure still escapes `main()` uncaught — no `PIPELINE_SUMMARY`, `preflight_passed` left at its default `True`, orchestrator undercounts the dead worker. The stated fix does not work.

---

## C. Browser launch

Original: `uc.start(headless=…, browser_args=[2 flags], user_data_dir=…)` (orig 374–378). nodriver then contributed its own 12 default args, `--user-data-dir`, `--disable-features=IsolateOrigins,site-per-process`, `--headless=new`, `--remote-debugging-host=127.0.0.1` and `--remote-debugging-port=<free>`.

Now: `launch_chrome()` (1034) spawns Chrome directly; `uc.start(host=…, port=…)` takes nodriver's `connect_existing` path (`browser.py:370–372`), where nodriver adds **nothing** to the command line.

I verified the reproduction against the installed `nodriver 0.48.1` (`core/config.py:116–128`): **`NODRIVER_DEFAULT_ARGS` at 848–861 is byte-exact.** The only nodriver arg not reproduced is a *duplicate* `--disable-session-crashed-bubble` (harmless).

| # | Flag / behaviour | Original | Now | **Alters the browser's observable fingerprint vs the original?** | **Alters a local run?** | Commit |
|---|---|---|---|---|---|---|
| C2 | 12 nodriver defaults | added by nodriver | reproduced at 848–861 | **No** — identical set | No | `7055ce89` |
| C3 | `--disable-features=IsolateOrigins,site-per-process` | nodriver | 817, merged | **No** | No | `7055ce89` |
| C4 | `--disable-background-networking`, `--disable-component-update`, `--disable-sync`, `--disable-default-apps`, `--disable-client-side-phishing-detection`, `--disable-domain-reliability`, `--safebrowsing-disable-auto-update`, `--metrics-recording-only` | **absent** | 829–838, **always applied** | **Yes** — 8 new switches; suppresses background traffic a real Chrome emits | **Yes, always** | `25df503a` |
| C5 | `--disable-features` gains `Translate, OptimizationHints, OptimizationGuideModelDownloading, MediaRouter, AutofillServerCommunication, InterestFeedContentSuggestions, CalculateNativeWinOcclusion` | absent | 842–846 | **Yes** — 7 features off | **Yes, always** | `25df503a` |
| C6 | `--proxy-server=http://127.0.0.1:PORT` | absent (proxy came from `chrome.proxy` in the extension) | 899 | **Yes** — all traffic now actually routes | **Yes** while `PROXY_HOST` set | `19869fc4` |
| C7 | `--proxy-bypass-list=<-loopback>` | absent | 902 | **Yes** | **Yes** while `PROXY_HOST` set | `19869fc4` |
| C8 | `--remote-debugging-port/host` | nodriver already passed both | 935–936 | **No** | No | `7055ce89` |
| C9 | `--user-data-dir` | nodriver | 928 | **No** | No | `7055ce89` |
| **C10** | **Headless vs headed** | `use_headless=False` whenever `PROXY_HOST` set → **headed Chrome** | relay path leaves `use_headless=True` → **`--headless=new`** | **Yes — the biggest fingerprint change in this table.** Headless-vs-headed is a first-order bot signal; `inject_screen_overrides` only patches `screen.*`/`navigator.platform` | **Yes** while `PROXY_HOST` set | `19869fc4` |
| C11 | `--enable-logging --log-file=…` | absent | 942 | Marginal — Chrome writes a log file | **Yes, always** | `1271bf17` |
| C12 | `--load-extension`, `--enable-unsafe-extension-debugging`, `DisableLoadExtensionCommandLineSwitch` | present when proxying | **unreachable** (`proxy_ext_dir` is always `None`) | Removes 3 flags | **Yes** while `PROXY_HOST` set | `19869fc4` |
| C13 | `--no-sandbox` | never (nodriver adds it only when running as root) | never | No | No | — |

**Is attach-mode really cloud-required?** Partly. The genuine cloud fact is that a cold profile on a CI runner outlasts nodriver's hardcoded handshake budget — `browser.py:426–437` is `sleep(0.25)` + 5 × `sleep(0.5)`, with no configuration knob. But **a ~5-line monkeypatch of that retry loop would have addressed it**, versus the ~200 lines of `find_free_port` / `read_devtools_active_port` / `wait_for_devtools` / `launch_chrome` / `stop_and_terminate` / `terminate_spawned_chrome` / `atexit` machinery that attach mode then forced (nodriver's `stop()` cannot kill a process it did not spawn — `_process_pid` is `None` on `connect_existing`, and its last-resort branch tests `browser_process_pid`, a typo). The stated secondary reasons (nodriver PIPEs stdio it never drains; it raises from inside `start()` leaving an orphan holding the profile) are real, but the orphan problem is also solved by `clear_stale_profile_locks` + the existing 3× bootstrap retry.

---

## D. Proxy mechanism

| # | Original | Now | **What a LOCAL run does now vs before** | Cloud-needed? | Commit |
|---|---|---|---|---|---|
| D1 | MV3 extension written to `.proxy_ext/decodo_<id>/` with creds in `background.js`; `chrome.proxy.settings.set` + `onAuthRequired` | `node scripts/proxy-relay.mjs <credentialed-upstream> <port>`, prints `{"url":"http://127.0.0.1:PORT"}`; Chrome gets a plain `--proxy-server` | **Before: extension silently dropped by branded Chrome ≥137 → traffic went direct from your IP. Now: traffic genuinely leaves via Decodo, metered.** Requires `node` + `proxy-chain` on PATH (both present here) | Bucket 1 *if* proxying — but see below | `61705719`, `19869fc4` |
| D2 | `f'{PROXY_USER}-session-{session_id}'` | `f'user-{acct}-session-{alnum}-sessionduration-{30}'` (403–425) | Before: 407 (silently, as "site can't be reached"). Now: authenticates | **Bucket 3** — a Decodo protocol fact, equally true on your desktop | `3583d824` |
| D3 | `buildo-worker-{id}-{ts}` (hyphens broke Decodo's parser) | `w{id}t{ts}`, alnum-only (269–279) | Same as D2 | Bucket 3 | `3583d824` |
| D4 | Every worker used the same `PROXY_PORT` | `resolve_proxy_port()` = `base + N − 1`, wrapped inside 20001–29999 (282–304) | With `SCRAPER_WORKERS>1`, your workers now get **distinct exit IPs**; before they shared one | Bucket 3 | `c3dff232` |
| D5 | extension hardcoded `scheme: "http"` | `PROXY_SCHEME` env, **default `https`** (119) | Plain-HTTP `CONNECT` tunnels were reset; HTTPS-to-proxy works | Bucket 3 | `ef9bbab2` |
| D6 | none | `PROXY_SESSION_DURATION_MIN=30` (121) | Sticky sessions live 30 min instead of Decodo's 10 | Bucket 3 | `3583d824` |
| D7 | none | Relay refuses 16 Google hosts (`gvt1.com`, bare `google.com`, `dl.google.com`, …); override via `SCRAPER_PROXY_BLOCKLIST` | Locally, Chrome's background chatter to those hosts now fails with a local 500 instead of succeeding | Bucket 2 | `25df503a`, `539468b5` |
| D8 | n/a | `_relay_ports` pins one local port per worker so rotation reuses it | Enables E5 (rotate the IP without restarting Chrome) | Bucket 1 (consequence of D1) | `19869fc4` |

**Is the relay cloud-required?** **No — it is required by branded Chrome ≥137, which is equally true on your desktop.** The runner just happens to ship branded Chrome. **The simpler alternative the code's own comments name: install Chrome for Testing (or unbranded Chromium) on the runner** — both are explicitly exempt from the `--load-extension` removal. That is ~4 workflow lines (`npx @puppeteer/browsers install chrome@stable` + point `find_chrome_executable` at it) and **zero** Python change, versus 137 lines of `.mjs` + ~90 lines of relay plumbing + `proxy-chain` as a new production dependency. It would also have preserved headed mode (C10).

---

## E. Timing / retry / rotation constants

| # | Constant | Original | Now | Practical effect on throughput | **Alters a local run?** | Commit |
|---|---|---|---|---|---|---|
| E1 | `MAX_RETRIES` (76) | `3` | `2` | One fewer attempt per permit | **Yes, always** | `ae5f7c26` |
| E2 | `RETRY_BASE_MS` (77) | `2000` | `90000` | Backoff `2 s + 4 s` → **a single 90 s sleep**. A permit that hits one WAF block costs ~90 s instead of ~6 s. At 10 permits/batch a bad batch goes from seconds to **~15 min** | **Yes, always** | `ae5f7c26` |
| E3 | `WAF_TRAP_THRESHOLD` (78) | `20` | `3` | **The most consequential local change in this section.** `accumulate()` increments `consecutive_empty` on every *legitimately-absent* permit too (1731–1734), so **3 consecutive genuine not-founds now trigger a full browser + IP rotation** where 20 were needed before. On a queue with normal miss density this rotates constantly — and each rotation counts against `MAX_BROWSER_LAUNCHES=12` (B9) | **Yes, always** | `ae5f7c26` |
| E4 | `SESSION_REFRESH_INTERVAL` | `200` | `200` | unchanged | No | — |
| E5 | Per-batch recycle (2028) | `if browser and (PROXY_HOST or batch_num % BROWSER_MAX_BATCHES == 0)` — **killed Chrome after every batch in proxy mode** ("1 batch = 1 IP") | `if browser and batch_num % BROWSER_MAX_BATCHES == 0` — proxy mode no longer forces it; the relay restarts with a new Decodo session on the *same* local port, so the IP rotates while Chrome lives | Far fewer cold starts; the browser now carries cookies/state across IP changes, which is a **coherence change** the WAF can see | **Yes** while `PROXY_HOST` set | `15c7417b` |
| E6 | `BROWSER_MAX_BATCHES` | `50` | `50` (default unchanged) | only the condition changed (E5) | via E5 | — |
| E7 | `DEVTOOLS_READY_TIMEOUT_S` (867) | n/a (nodriver's 2.25 s) | `60` | 26× longer startup grace | **Yes, always** | `7055ce89` |
| E8 | `HOST_EGRESS_IP_TTL_S` (664) | n/a | `900` | Re-probes ipify at most every 15 min | Yes while `PROXY_HOST` set | `0b7dcfa0` |
| E9 | Bootstrap retry | 3 × 10 s | 3 × 10 s | unchanged | No | — |

Blunt note on E1–E3: these were retuned from live recon (`eceaac4c`) performed against an Akamai edge that was **already in a rate-reputation block, reached through the Decodo proxy from a runner**. They are a global, unconditional change to the artifact, derived from a context that is not your local one. Nothing measured them against a working local run.

---

## F. Diagnostics added

| # | What | HEAD lines | Pure logging, or does it gate? | **Alters a local run?** | Commit |
|---|---|---|---|---|---|
| F1 | `_log_step1_body` / `STEP1_BODY_SAMPLES=8` | 1306–1323, called 1377/1383 | **Pure** — capped, no branch reads it | No (log volume only) | `4124a0f7` |
| F2 | `log_chrome_diagnostics()` — resolves the executable, `realpath`, runs `chrome --version` (20 s timeout) | 548–583, called 1171 | **Pure**, but spawns a subprocess once per process | Marginal (one extra process) | `20dbcd6c` |
| F3 | `dump_chrome_launch_log()` — tails Chrome's own log on bootstrap failure | 586–606, called 1289 | **Pure** | No | `20dbcd6c` |
| F4 | `log_browser_targets()` | 779–793, called 1189 | **Pure** — the docstring is explicit that target visibility must never gate (it produced a false negative in run 30496893882) | Only when proxying | `733e67c4` |
| F5 | `proxy_relay_ready` / `proxy_relay_terminated` | 363–369, 398–399 | **Pure** | Only when proxying | `19869fc4` |
| F6 | `devtools_ready`, `devtools_port_drift` | 1002–1003, 1175–1179 | **Pure** | No | `7055ce89` |
| F7 | `stale_profile_lock_removed` | 1143–1147 | **Pure** (the removal itself is G1) | No | `8c3dd193` |
| **F8** | `proxied_egress_verified` / `proxied_egress_indirect` | 747–751, 771–775 | **GATES** — this is the tripwire, not a log. See B3/B4/B6 | **Yes** while `PROXY_HOST` set | `0e32cc84` |

---

## G. Everything else

| # | Original | Now | **Alters a local run?** | Cloud-needed? | Commit |
|---|---|---|---|---|---|
| G1 | No lock handling | `clear_stale_profile_locks()` removes `SingletonLock`/`Socket`/`Cookie` at every bootstrap (510–536, called 1141) | Marginal — locally the locks are usually genuine and absent. **Small risk:** if a real Chrome already holds that profile, removing the lock permits a second Chrome on the same profile (SQLite corruption) | Bucket 1, *or* delete the `actions/cache` step | `8c3dd193` |
| G2 | `browser.stop()` (worked — nodriver owned the pid) | `stop_and_terminate()` + `terminate_spawned_chrome()` with `killpg`/`SIGKILL` (1067–1119) | Only meaningful because of attach mode; correctly pid-scoped, never `pkill chrome` | Bucket 1 (consequence of C1) | `7055ce89`, `733e67c4` |
| G3 | n/a | `terminate_spawned_relay()` (378–400), called in `finally` at 2085 | Only when proxying | Bucket 1 (consequence of D1) | `19869fc4` |
| G4 | one `atexit` for the ext dir | plus two `atexit` lambdas killing Chrome and the relay (1122–1124) | Harmless | Bucket 1 | `7055ce89`,`19869fc4` |
| G5 | `nodriver>=0.48` | `nodriver==0.48.1` | **No** — you already have 0.48.1 installed | **Bucket 1**, and the cheapest fix in the whole batch | `7055ce89` |
| G6 | — | `proxy-chain ^3.0.0` in `package.json:85` | New production dependency | Bucket 1 (consequence of D1) | `61705719` |
| G7 | — | `scripts/tests/` (5 files, ~1 000 lines), `pytest.ini`, `requirements-dev.txt`, `pipeline-lint.yml` | No runtime effect — **but these tests import functions that only exist at HEAD** | Bucket 4 | `1271bf17` |
| G8 | — | `check-chain-running.js` +11 (guard decision made observable) | No | Bucket 4 | `27e39948` |
| G9 | — | `build_browser_args()` extracted as a pure, unit-testable function | Refactor only | Bucket 4 | `1271bf17` |
| G10 | — | `terminate_spawned_chrome()` added to the bootstrap failure path (1294) | Prevents an orphan holding the profile across retries | Bucket 1 | `7055ce89` |
| G11 | — | Stale comment at **914** references `verify_proxy_extension_loaded`, a function that no longer exists | Cosmetic | — | `7055ce89` |

---

## LIST 1 — Would break or alter a local run

**Unconditional (fire regardless of `PROXY_HOST`):**

1. **E3 `WAF_TRAP_THRESHOLD` 20 → 3** (line 78) — 3 legitimate not-founds now force a browser+IP rotation. *Highest-impact single value.*
2. **E2 `RETRY_BASE_MS` 2 000 → 90 000** (line 77) — one blocked permit costs 90 s.
3. **E1 `MAX_RETRIES` 3 → 2** (line 76).
4. **B9 `MAX_BROWSER_LAUNCHES=12`** (line 1030) — combined with E3, a hard stop mid-run.
5. **C4/C5 `BANDWIDTH_GUARD_ARGS` + `BANDWIDTH_GUARD_FEATURES`** (829–846) — 15 new launch switches, applied unconditionally.
6. **C1/B7/B8 attach mode** (1166–1180) — two new fatal `raise`s on the startup path, plus C11's `--enable-logging`.
7. **G1 `clear_stale_profile_locks`** (1141) — small corruption risk if a real Chrome holds the profile.
8. **G5 `nodriver==0.48.1`** — matches what you have; listed for completeness only.

**Conditional on `PROXY_HOST` being set — which it is, in your `.env`:**

9. **D1 the relay** — your local traffic now genuinely leaves through metered Decodo instead of your own IP. *This is the change.*
10. **C10 headed → headless** — the largest fingerprint delta.
11. **B1/B2 relay-readiness raises**, **B3/B4/B6 the egress tripwire**, **B11 the uncaught pre-`try` relay failure**.
12. **C6/C7 `--proxy-server` / `--proxy-bypass-list`**, **D7 the host blocklist**.
13. **E5 no per-batch browser recycle** — Chrome now persists across IP rotations.

> **To recover your proven local behaviour exactly:** set `PROXY_HOST=` (empty) in `.env`, and set `SCRAPER_WORKERS=1`, `SCRAPER_MAX_RETRIES=3`, `SCRAPER_RETRY_BASE_MS=2000`, `SCRAPER_WAF_TRAP_THRESHOLD=20`, `SCRAPER_MAX_BROWSER_LAUNCHES=9999`. That reverts items 1–4 and 9–13. **Items 5, 6, 7 and C11 have no env switch** — they are unconditional code and would need editing or a revert.

---

## LIST 2 — Cloud-only, safely gateable (env flag, default OFF)

Every one of these could sit behind a flag with the original as the default path:

| Change | Suggested gate | Default |
|---|---|---|
| B3/B4/B6 proxied-egress tripwire + E8 TTL | `SCRAPER_VERIFY_EGRESS=1` | off |
| B9 launch ceiling | already `SCRAPER_MAX_BROWSER_LAUNCHES` — **change the default from 12 to unlimited**, set 12 in the workflow | off |
| C4/C5 bandwidth guard flags | `SCRAPER_BANDWIDTH_GUARD=1` | off |
| D7 relay blocklist | already `SCRAPER_PROXY_BLOCKLIST` — make an empty value mean "no blocking" | off |
| F2/F3/F4 chrome diagnostics, launch-log dump, target logging + C11 `--enable-logging` | `SCRAPER_CHROME_DIAGNOSTICS=1` | off |
| F1 step-1 body sampling | already `SCRAPER_STEP1_BODY_SAMPLES` (set 0 to disable) | keep on — it is free |
| C1 attach mode + B7/B8/E7 + G2/G4/G10 | `SCRAPER_ATTACH_MODE=1`, else `uc.start(headless=…, browser_args=…, user_data_dir=…)` | off |
| G1 profile-lock clearing | `SCRAPER_CLEAR_PROFILE_LOCKS=1` | off (or drop the cache step instead) |
| E1/E2/E3 constants | already env-overridable — **restore the defaults to `3` / `2000` / `20`** and set the new values in the workflow | original |
| E5 recycling condition | `SCRAPER_RECYCLE_PER_BATCH=1` | on (= original) |
| D1 relay | `SCRAPER_PROXY_MODE=relay|extension|none` | `none` when `PROXY_HOST` is empty |

---

## The minimum set to run your proven scraper on a GitHub Actions runner

The mandate was "adapt it to the cloud". Here is what that actually required, in order:

| # | Change | Cost | Why the runner forces it |
|---|---|---|---|
| **0** | AppArmor sysctl `kernel.apparmor_restrict_unprivileged_userns=0` | **already done at `de3ff6dd`**, workflow-only | Ubuntu 24 kills Chrome's sandboxed launch |
| **1** | `nodriver==0.48.1` in `requirements.txt` | **1 line** | A fresh `pip install` resolved 0.50.3 — cloud was never running your code |
| **2** | Don't restore a stale profile — **delete the `actions/cache` step** for `~/.buildo-scraper` | **1 workflow line deleted** *(the alternative taken was 28 Python lines)* | A cached `SingletonLock` names a dead host/PID and bricks Chrome |
| **3** | Fix Decodo auth: `user-` prefix, alnum session ID, `PROXY_SCHEME=https` | **~10 functional lines** | The proxy 407s without them; a 407 is invisible (renders as "site can't be reached") |
| **4** | Make a *branded* Chrome able to use the proxy — **install Chrome for Testing** and point `find_chrome_executable` at it, keeping the existing MV3 extension | **~4 workflow lines, 0 Python** *(the alternative taken was 137 `.mjs` lines + ~90 Python lines + a new npm dependency)* | Runner ships branded Chrome ≥137, which drops `--load-extension`. Also preserves headed mode and the extension-based fingerprint you proved |
| **5** | Give the DevTools handshake more than 2.25 s — **monkeypatch nodriver's retry loop** (`browser.py:426–437`) | **~5 lines** *(the alternative taken was ~200 lines of attach-mode machinery)* | A cold profile on a CI runner is still creating its databases when nodriver gives up |
| **6** | Keep xvfb + `xvfb-run` (already in the workflow) | **0** | Only if you keep the extension (step 4), which forces headed mode |

**That is roughly 20 lines of Python plus 5 workflow lines.**

**Of the 927 added lines, approximately 620 fall outside this minimum:**

- ~190 — the proxied-egress tripwire (`host_egress_ip`, `_extract_ip`, `_looks_unreachable`, `verify_proxied_egress`, TTL cache)
- ~200 — attach-mode machinery beyond the 5-line alternative (`find_free_port`, `read_devtools_active_port`, `wait_for_devtools`, `launch_chrome`, `stop_and_terminate`, `terminate_spawned_chrome`, `atexit`)
- ~90 — relay plumbing beyond the Chrome-for-Testing alternative (`start_proxy_relay`, `terminate_spawned_relay`, `build_upstream_proxy_url`, `_relay_ports`) + 137 lines of `proxy-relay.mjs`
- ~70 — `log_chrome_diagnostics`, `dump_chrome_launch_log`, `chrome_launch_log_path`
- ~40 — `BANDWIDTH_GUARD_ARGS` / `BANDWIDTH_GUARD_FEATURES` / `NODRIVER_DEFAULT_ARGS` reproduction
- ~25 — `resolve_proxy_port` per-worker sticky ports
- ~22 — `MAX_BROWSER_LAUNCHES`
- ~20 — step-1 body sampling
- ~15 — `log_browser_targets`
- ~15 — the E1/E2/E3 retune

Note the compounding: item 4's relay forced headless (C10) and no-extension, which made the egress tripwire feel necessary (nothing else proved proxying), which is 190 lines. Item 5's attach mode forced ~200 lines of process ownership because nodriver's `stop()` cannot kill a browser it did not spawn. **Two contestable architectural choices generated roughly 400 of the 620 non-minimum lines.**

---

## Would a wholesale revert of `scripts/aic-scraper-nodriver.py` to `de3ff6dd` lose anything valuable?

**The empty-string env-var crash fix from `86868387` is NOT at risk.** `86868387` **predates** `de3ff6dd` (it is the commit immediately before it). `git blame` confirms hash `868683875` still owns HEAD lines 99–100, and the same `int(os.environ.get('X') or 'N')` guards are present in the `de3ff6dd` file at lines **84, 85, 130 and 229**. **A revert to `de3ff6dd` retains it in full.**

**What a wholesale revert WOULD lose, ranked:**

| Genuinely valuable — re-apply by hand (~40 lines total) |
|---|
| **D2/D3/D5 — Decodo auth (`user-` prefix, alnum session ID, `https` scheme).** Without these the proxy 407s *anywhere*, silently. If you ever want proxying — cloud or local — you need these three. |
| **G1 — `clear_stale_profile_locks`.** ~28 lines, no local downside worth mentioning. Keep it if you keep the profile cache. |
| **F1 — step-1 body sampling.** ~25 lines, pure logging, capped at 8. It is the only thing that distinguishes "AIC has no such permit" from "the session is shadow-banned" — the ambiguity that cost the diagnostic day. |
| **D4 — per-worker sticky ports.** ~25 lines. Only matters if `SCRAPER_WORKERS > 1`, which your `.env` sets. |

| Valuable only in the cloud / only while proxied |
|---|
| C1/B7/B8/E7 attach mode; D1 relay; B3–B6 egress tripwire; B9 launch ceiling; C4/C5 bandwidth guard; D7 blocklist. All useless on an unproxied local run. |

| Loses nothing |
|---|
| **G2/G3/G4 teardown machinery** — needed *only because of* attach mode. Reverting removes both the need and the fix. Neutral. |
| **B10 DISPLAY guard** — already dead code at HEAD; the revert restores it to being live and correct. |
| **B11** — a bug; reverting removes it. |

| One real cost of a wholesale revert |
|---|
| **The pytest harness (`scripts/tests/test_scraper_bootstrap.py`, `test_scraper_config.py`, `test_scraper_egress.py`, `test_scraper_launch_attach.py`) imports functions that exist only at HEAD** — `build_browser_args`, `wait_for_devtools`, `verify_proxied_egress`, `resolve_proxy_port`, `build_proxy_username`. A wholesale revert breaks all four files and the `pipeline-lint.yml` job that runs them. You would need to delete or rewrite them in the same commit. |
| Also orphaned but harmless: `scripts/proxy-relay.mjs`, `proxy-chain` in `package.json`. Keep `nodriver==0.48.1`. |

**Recommendation.** A wholesale revert is defensible and loses little of substance, but the cleaner move is a **targeted revert**: restore the original `bootstrap_session` launch path, the original three constants, and drop the egress tripwire + launch ceiling + bandwidth guard behind flags — while keeping D2/D3/D5, G1, F1, D4 and `nodriver==0.48.1`. That gets your proven artifact back as the default path in ~60 lines of edits instead of throwing away the four things worth keeping and breaking the test suite.
