# Scraper Research Digest — Toronto AIC portal, anti-bot, and cloud execution
**Recovered 2026-07-30. Standalone reference — assumes no prior context.**

---

## 1. Purpose and provenance

On 2026-07-29/30 a long session attempted to make `chain_deep_scrapes` (the AIC building-permit
inspection scraper) run on GitHub Actions. It failed: no run ever wrote a `permit_inspections`
row from the cloud. The **code** from that session is being reverted (see
`docs/reports/2026-07-30-deep-scrapes-original-vs-head-comparison.md` for the line-by-line
accounting — 927 lines added against a genuine cloud requirement of roughly 20 Python + 5
workflow lines). The **research**, however, was bought with real requests against a live
Akamai edge, ~13 CI validation cycles, and ~$6.75 of metered residential bandwidth, and
re-acquiring it costs reputation damage against the very WAF we need to keep tolerating us.
This document distills that research from the session transcripts (session `1ace4c0b`,
extracted to a 22-chunk transcript dump), the commits `de3ff6dd..539468b5`, and the
artifacts the session left in `docs/reports/review_followups.md` and `tasks/lessons.md`.
Every claim below carries a source. Where the sources conflict, both are shown.

**Evidence-grade convention used throughout:**
- **MEASURED** — someone made a request or read a value and recorded the result. The
  measurement method is always named.
- **INFERRED** — derived from code reading, arithmetic, or reasoning over measurements.
- **UNMEASURED** — we do not know; stated as such rather than estimated.

---

## 2. What we now know about the Toronto AIC portal

Target: `https://secure.toronto.ca/ApplicationStatus` (the "Application Status" / AIC portal).
Fronted by **Akamai** (`Akamai-GRN` response header, `errors.edgesuite.net` reference on the
denial page). MEASURED — read off live 403 responses during the 2026-07-30 curl reconnaissance.

### 2.1 The request chain — do not rewrite it

MEASURED by raw `curl` (~35 read-only GET/POST requests, 2026-07-30, transcript
`2026-07-30T03:13:55`), against real permit `25 122754` (24 Northridge Ave):

| # | Method + path | Request shape | Response |
|---|---|---|---|
| 0 | `GET /ApplicationStatus/setup.do?action=init` | — | 200 HTML, **75,885 B**. Sets `JSESSIONID` (HttpOnly) + `WEBTRENDS_ID`. **Optional for step 1** |
| 1 | `POST /jaxrs/search/properties` | JSON: `folderYear:"25"`, `folderSequence:"122754"`, remaining fields empty, `searchType:"0"`, `mapX/mapY:null`, `propX/Y_min/max:"0"` | 200, **147 B** → `[{propertyRsn, house, street, streetType, propX, propY}]` |
| 2 | `POST /jaxrs/search/folders` | same body **+ `propertyRsn`** | 200, **1,070 B** → folders with `folderRsn`, `folderSection` (BLD/PLB/HVA), `folderRevision` |
| 3 | `GET /jaxrs/search/detail/{folderRsn}` | none | 200, **3,796 B** → `showStatus`, `inspectionProcesses[]` |
| 4 | `GET /jaxrs/search/status/{folderRsn}/{processRsn}` | none | 200, **281 B** → `{stages:[…], orders:[…]}` |

The chain in `scripts/aic-scraper-nodriver.py` implements exactly this
(`:1350-1483` at HEAD; `:1304-1341` in the session's numbering) and matches the deleted
Playwright v2 byte-for-byte — same body, headers, order and `setup.do` refresh. It also
matches `docs/specs/01-pipeline/44_chain_deep_scrapes.md` §3. **Do not rewrite it.** Two
independent excavations reached this conclusion (transcript `03:00:07`, `03:13:55`), and the
mechanical function-level diff in the comparison report confirms `fetch_permit_chain`,
`scrape_year_sequence`, `scrape_with_retry`, `safe_json_parse`, status normalisation and all
upserts are unchanged from the pre-cloud original.

### 2.2 Session / cookie / CSRF reality

- **No session or UI state is required for step 1.** MEASURED (curl): `POST
  /jaxrs/search/properties` returns 200 with correct JSON from a **cold client with no
  cookies and no prior `setup.do`**.
- **There is no CSRF, anti-forgery token or nonce anywhere in the chain.** MEASURED — the
  portal's own client library `/ApplicationStatus/app/as-interface.js` (4,307 B, copy
  preserved at `…/1ace4c0b-…/scratchpad/as-interface.js`) is plain `$.ajax` with zero token
  handling. Steps 2–4 need only IDs returned by the previous response.
- **UNMEASURED:** whether steps 3–4 work cookieless. The clean test was contaminated when the
  rate-limit block landed mid-test. Assume a cheap `setup.do` may still be needed for 3–4
  until retested.
- This **refutes** the 2026-03 strategy doc's premise (`…/scratchpad/aic_scraping_strategy.md`
  §1: *"The Application Status portal explicitly blocks direct requests to the data endpoints.
  Every check must emulate a real user session"* + accordion clicking). That was never
  verified and is wrong for steps 1–2.

### 2.3 Akamai cumulative rate-reputation — the actual blocker

MEASURED (curl, 2026-07-30, single reconnaissance session):

| Property | Value | Note |
|---|---|---|
| Requests to first block | **~12 requests in ~10 minutes** | then *every* request 403s, including ones that had just succeeded |
| Independence from headers/cookies | total | correct headers and a warm cookie jar do not help once tripped |
| Recovery | **~5 minutes idle** | clears |
| Stickiness after recovery | **2–3 requests re-trip it** | reputation is not reset, only released |
| Denial response | **HTTP 403, ~420–450 B HTML "Access Denied"** | `Akamai-GRN` header, `errors.edgesuite.net` |

**These are LOWER BOUNDS.** The reconnaissance ran with **curl's TLS/HTTP2 fingerprint**, not
Chrome's, because the Chrome extension was unavailable to the agent (`tabs_context_mcp`
returned "Browser extension is not connected"). Akamai is expected to be *more* aggressive
toward curl than toward a real browser, so real Chrome plausibly gets more headroom.
This directionality was itself the subject of a correction — see §8, C5.

**The scarce resource is requests-per-IP-per-time-window** — not bandwidth, not fingerprint.
INFERRED from the above.

### 2.4 What a block looks like in our telemetry vs a legitimate not-found

This distinction is the single most operationally important fact in this document, because
for the whole 2026-07-29 debugging day the two were **indistinguishable in the logs**.

- **Legitimate not-found:** step 1 returns a valid JSON `[]`. `safe_json_parse`
  (`scripts/aic-scraper-nodriver.py:1326-1341`) parses it successfully; the caller records
  `not_found_count += 1` **and `consecutive_empty += 1`** (`accumulate()`, `:1725-1741`).
- **Akamai block:** the ~430 B HTML page fails `safe_json_parse`'s first test
  (`raw.strip().startswith('<')` → `'html_or_empty'`, `:1328-1329`) → the chain records
  `waf_blocked`. On retry exhaustion `accumulate()` adds `WAF_TRAP_THRESHOLD` to the *same*
  `consecutive_empty` counter (`:1739-1741`).
- **Consequence:** `consecutive_empty` conflates genuine misses with blocks. This is why
  lowering `WAF_TRAP_THRESHOLD` from 20 to 3 (commit `ae5f7c26`) is actively harmful on a
  healthy queue — three genuine not-founds now force a full browser + IP rotation.
- **Until commit `4124a0f7` the response body was never logged at all.** `_log_step1_body` /
  `STEP1_BODY_SAMPLES=8` now samples it. Caveat: the cap is **per worker process**, not
  per run — with `SCRAPER_WORKERS > 1` the real volume is `workers × 8`.
- **Eligibility filter matters:** commit `5450a55e` established that
  `issued_date > NOW() - INTERVAL '3 years'` takes the not-found rate from **60% → 0%**
  (reported in transcript `03:00:07`; the SQL lives in `scripts/aic-orchestrator.py:146-162`).

**The one CI datapoint we have:** GitHub Actions run **30506470111** — **654 requests, 0 rows,
102 WAF traps, 116 Chrome launches** (cited in `scripts/aic-scraper-nodriver.py:1025-1028` and
`docs/reports/review_followups.md:2816`). That signature matches §2.3's model exactly: trip
early, then everything 403s forever. It is the only run that was **genuinely proxied through
a residential exit IP**, and it still produced zero rows.

### 2.5 Header requirements

- **`Accept-Encoding` is mandatory.** MEASURED (curl, same-session A/B **in both directions**):
  a request with a Chrome UA and **no `Accept-Encoding`** 403s instantly; the "burned" cookie
  jar returned 200 the moment `--compressed` was added, and the "good" jar returned 403 the
  moment it was removed. Chrome's own `fetch()` always sends it, so this has never been our
  bug — but it is a landmine for any raw-HTTP port. It also means several early 403s in that
  reconnaissance were misread as session-burning; **no session was ever burned by that cause.**
- **`X-Requested-With: XMLHttpRequest` makes no difference.** MEASURED (same-session A/B,
  both 200). jQuery sends it; our `fetch()` does not. Worth adding for fidelity, not a fix.
- **UNMEASURED:** whether a full Chrome header set (sec-ch-ua, sec-fetch-*) moves the ceiling.

### 2.6 Per-permit byte costs

MEASURED (curl, response `Content-Length`):

| Item | Bytes | Note |
|---|---|---|
| Step 1 | 147 | |
| Step 2 | 1,070 | |
| Step 3 | 3,796 | |
| Step 4 | 281 | |
| **Data chain total** | **≈5,294 B (~5.3 KB)** | pure JSON, **no page navigation required** |
| `setup.do` | **75,885 B** | **14× the entire data chain**, and appears unnecessary |

The real HTML page additionally pulls jQuery, Bootstrap, Handlebars, moment.js and
**ArcGIS 3.18** from third-party CDNs. INFERRED: a raw-HTTP client cuts per-permit cost by
well over 90% and simultaneously deletes Chrome, the relay, xvfb, component downloads and the
entire `--load-extension` problem class.

### 2.7 Step-4 redundancy

MEASURED: `GET /jaxrs/search/detail/{folderRsn}` (step 3) **already embeds**
`inspectionProcesses[].folderProcessAttempts[]` — full attempt history with `attemptDate`,
`resultDesc` ("Passed" / "Inspection Not Passed"), inspector name/phone/email, plus a
`processComment` listing the stages. Step 4 only adds the normalised stage table.
**If attempt-level history satisfies `permit_inspections`, step 4 is skippable** — a 25% cut
in the resource that actually constrains us (requests). UNMEASURED: whether the normalised
stage table carries anything `folderProcessAttempts[]` does not.

### 2.8 Geo signals

- **MEASURED:** exit IPs drawn by the current Decodo configuration included
  **186.225.225.102 (Brazil)**, 23.248.100.13, 66.222.176.87 (`.cursor/wf3_aic_cloud_capture.md:15`).
- **MEASURED (code):** `build_proxy_username` (`scripts/aic-scraper-nodriver.py:403-425`)
  emits `user-<account>-session-<id>-sessionduration-<n>` with **no `country-ca` parameter** —
  we have never geo-targeted.
- **INFERRED (prime suspect, untested):** a Toronto municipal portal being hit from Brazil is a
  strong bot signal and plausibly explains the gap between the operator's local residential
  experience and the measured ceiling.
- **Prior claim, source-of-record commit `aedd4cd1`** (cited at `review_followups.md:2806`):
  `ca.decodo.com` sticky ports are *required*, and `gate.decodo.com:10001` is *"geo-fenced by
  the AIC portal"*. Grade: reported, not re-verified in this session.

### 2.9 Miscellaneous portal facts

- **The `address` field in our step-1 payload is inert dead weight.** MEASURED: passing address
  text returns `[]`. The UI geocodes first (`map.searchAddress` → `bestResult[0].lon/lat` →
  `findApplicationsXY` → properties by `mapX/mapY`, Web Mercator → NAD27).
- **UNMEASURED:** whether a 4-digit `folderYear` is rejected. `"2024"`/`"24"` with an empty
  sequence both returned `[]`, and `"25"+"122754"` returned data, but `"2025"+"122754"` was
  never tried. **Do not treat 2-digit as proven-mandatory.**
- **Unexplained:** static assets (`js/date.js`, `app/mapUtility.js`) 403'd inconsistently even
  with good sessions and correct headers. Irrelevant to the data chain.
- **DISPROVEN — do not chase:** `setup.do` warm-up as a step-1 requirement; `X-Requested-With`;
  CSRF tokens.

---

## 3. Scraper technology landscape

### 3.1 nodriver (current transport)

- **Pinned `nodriver==0.48.1`** (`scripts/requirements.txt:6`). Before commit `7055ce89` it was
  `nodriver>=0.48`, which a fresh CI `pip install` resolved to **0.50.3** — *cloud was never
  running the code that was tested locally*, and the version difference is invisible in logs.
  This is the cheapest single fix in the whole batch.
- **The 2.25 s CDP handshake budget.** MEASURED by reading `nodriver/core/browser.py:425-449`
  (a copy of the 0.50.3 file is preserved at `…/1ace4c0b-…/scratchpad/nodriver_0503_browser.py`):
  `sleep(0.25)` then five probes 0.5 s apart. **Hardcoded, no config knob, identical in 0.48.1
  and 0.50.3.** A cold profile on a CI runner spends longer than that just creating its
  favicon/quota/password-store databases, so the handshake expires while Chrome is booting
  normally — and the raised error names no cause.
- **Three compounding defects in the same path:** it never reads `DevToolsActivePort` (a lost
  port race leaves it blind to a live browser); it `PIPE`s Chrome's stdio and never drains it
  (a full 64 KB buffer stalls startup); and it raises from *inside* `start()`, so the caller
  gets no handle to kill the browser it spawned — the orphan then owns the profile and every
  retry fails identically.
- **Attach vs launch.** The adopted fix: spawn Chrome yourself, poll `/json/version` on your own
  budget, then `uc.start(host, port)` to take nodriver's `connect_existing` path. Verified:
  in attach mode nodriver contributes **zero** command-line args, so you must supply its 12
  defaults yourself (`NODRIVER_DEFAULT_ARGS` reproduced byte-exact against
  `nodriver 0.48.1 core/config.py:116-128`; the only omission is a harmless duplicate
  `--disable-session-crashed-bubble`). **Corollary:** in attach mode `browser.stop()` cannot
  kill the process — the attach path never sets `_process_pid` and its fallback tests a
  typo'd attribute — so pair every stop with a real process-group kill of a pid you own.
- **Cost of attach mode:** ~200 lines of `find_free_port`/`read_devtools_active_port`/
  `wait_for_devtools`/`launch_chrome` plus ~200 more of process-ownership code. The comparison
  report's judgement: **a ~5-line monkeypatch of nodriver's retry loop would have sufficed.**
- **`zendriver` fork** already made the connect budget configurable
  (`browser_connection_timeout` / `browser_connection_max_tries`) — `review_followups.md:2793`.
  Not adopted; attach mode makes us independent of it.

### 3.2 Playwright / Puppeteer history in this repo

- **`scripts/poc-aic-scraper.js` (v1)** — 529-line HTML scraper. Recoverable:
  `git show 3fa259c7^:scripts/poc-aic-scraper.js`. ~1.5 MB/permit; would have needed
  **~93 GB/week**, "impossible on any reasonable plan" (recovered Spec 38 §3.6).
- **`scripts/poc-aic-scraper-v2.js` (v2 hybrid Playwright + REST)** — origin `b2f0e78c`
  (2026-03-14): *"375× bandwidth reduction, 4 KB vs 1.5 MB per permit"*; **deleted `47d82cd5`**
  (2026-04-16). Recoverable: `git show 47d82cd5^:scripts/poc-aic-scraper-v2.js`; working copy
  preserved at `…/1ace4c0b-…/scratchpad/poc-aic-scraper-v2.js`. Design worth knowing:
  - **Two HTML navigations per session only** (`https://www.toronto.ca`, then
    `setup.do?action=init`), then pure `page.evaluate` `fetch()` forever.
  - **CDP/route-level resource blocking:** everything aborted except
    `document | xhr | fetch | script` — deliberately **allowing `script`** so the WAF's JS
    challenge can run.
  - **One session for 200 permits** between `setup.do` refreshes.
  - **~250 MB per full pass.**
  - Native Playwright proxying (`launch({proxy})` + `httpCredentials`).
- **Why Playwright was abandoned:** commit `bee15998` + recovered Spec 38 §3.8 —
  *"CDP-based automation bypasses the WAF completely without even needing a proxy — the
  WebDriver protocol itself was the detection vector"* / *"Proxy: Optional. Direct connection
  works."* See §8 C6 — that claim was established on a residential desktop and does not
  transfer to cloud.
- **Ground truth on what ever worked:** `permit_inspections` holds **792 rows,
  `max(scraped_at) = 2026-03-15T17:35`** — the Playwright v2 era. `pipeline_runs` holds
  **zero** successful nodriver-scraper runs. The 2026-03-22 → 2026-06-09 telemetry window was
  destroyed by the June DB rebuild, so commit `2a532bc3`'s *"626 inspection stages inserted"*
  is unverifiable. (Agent audit, transcript `2026-07-29T23:56`.)
- **Recovered Spec 38** (`git show e59cb8b0^:docs/specs/38_inspection_scraping.md`, §3.1/§3.7/§3.8)
  is the richest surviving document on session-entry rules. **Those rules were never carried
  into Spec 44 and should be restored.**

### 3.3 Raw HTTP + TLS impersonation

- **Discussed, never tested.** `curl_cffi` and `tls-client` were named as the TLS-impersonation
  options (transcript `03:32`, `03:39`; `.cursor/wf3_aic_cloud_capture.md:23` plans a probe).
  **No measurement exists.**
- What we do know: the ~12-req/10-min ceiling was itself measured with **curl's** stack, so it
  is already a raw-HTTP-client number. INFERRED: a Chrome-impersonating client can only match
  or improve on it.
- A raw-HTTP rewrite deletes: `proxy-relay.mjs` entirely, `build_proxy_extension`,
  bootstrap/attach/launch machinery, `clear_stale_profile_locks`, `preflight_stealth_check`,
  `FINGERPRINT_PROFILES`, `inject_screen_overrides`, `ENTRY_URLS`/`NOISE_URLS`,
  `sanitize_js_value`, `MAX_BROWSER_LAUNCHES`, `DEVTOOLS_READY_TIMEOUT_S`. It **keeps**: queue
  claiming (`FOR UPDATE SKIP LOCKED`), all upserts, `compute_enriched_status`,
  `normalize_status`, `parse_inspection_date`, telemetry/`emitSummary`, and the Decodo
  session/port helpers. `verify_proxied_egress` survives as a *concept*, reimplemented as a
  plain HTTP GET.

### 3.4 The local proxy relay (`proxy-chain`)

- **`proxy-chain@3.0.0`** (Apify, Apache-2.0, ESM-only, `engines: node >=20.11`). Read directly
  from `node_modules`: on CONNECT it opens an upstream CONNECT with a `proxy-authorization`
  Basic header and then **pipes raw bytes** — no TLS termination, so the browser's JA3/ALPN
  reach the origin intact.
- **MEASURED live** (transcript `2026-07-30T00:50`): tested against the real Decodo endpoint
  with an HTTPS target and **no credentials given to the client** — both upstream schemes
  returned residential IPs. `ignoreProxyCertificate` is **required** for an `https://` upstream
  (a 599 otherwise); it affects only the hop to our own provider.
- **`pproxy`** — the alternative recommended by SeleniumBase's maintainer
  (`pproxy -l http://127.0.0.1:8080 -r http://ip:port#user:pass`). Last release **2024-01-16**;
  not chosen because Node was already a repo dependency.
- **`mitmproxy` — never use it here.** Default mode terminates and re-originates TLS, replacing
  the browser's fingerprint with Python's and installing a custom CA. Actively harmful for
  WAF-sensitive scraping.

### 3.5 Third-party managed scraping services

**None were evaluated in the 2026-07 session.** The only prior consideration is the 2026-03
strategy doc (`…/scratchpad/aic_scraping_strategy.md` §2–3), which rejected managed scrapers
on cost grounds ("API multipliers" for JS rendering) in favour of DIY Playwright + Smartproxy
residential proxies at *"~$14/month for 2 GB"*. Grade: a 2026-03 quote, not re-priced.

---

## 4. Anti-bot mechanics learned

### 4.1 TLS / JA3 fingerprinting
- A CONNECT tunnel that pipes raw bytes preserves the client's JA3/ALPN/H2 fingerprint;
  anything that re-originates TLS (mitmproxy) destroys it. `scripts/proxy-relay.mjs:27-29`
  documents this as the design's reason for existing.
- Whether AIC's Akamai actually *scores* on JA3 is **UNMEASURED**. It is the standard
  capability of Akamai Bot Manager, but no experiment isolated it.

### 4.2 Headless vs headed
- Headless-vs-headed is a first-order bot signal. The pre-cloud original ran **headed**
  whenever a proxy was configured (because `--load-extension` requires it); the session's HEAD
  runs **headless** with `--proxy-server`. The comparison report calls this
  *"the biggest fingerprint change"* of the whole diff.
- `inject_screen_overrides` only patches `screen.*` / `navigator.platform` — it does not cover
  the behavioural deltas headless introduces.
- Of the 15 bandwidth-guard launch flags added, **`--disable-background-timer-throttling`** is
  the one a reviewer flagged as plausibly JS-detectable (background timers run at full speed
  instead of Chrome's ~1/sec throttle; a page can time its own `setTimeout` drift). Confidence
  ~70, **never confirmed against AIC**. The remaining flags/features are internal plumbing with
  no `navigator`/`window` surface.

### 4.3 Chrome extension eviction and removal
- **Chrome 137 (branded) silently ignores `--load-extension`; Chrome 142 removed the
  `--disable-features=DisableLoadExtensionCommandLineSwitch` opt-out.** Unbranded Chromium and
  Chrome for Testing are **exempt**. Sources: Chromium extensions PSA + RFC threads,
  SeleniumBase issue #4053 (all cited in `review_followups.md`).
- **MV3 service-worker eviction is real (~30 s idle).** `chrome.proxy.settings` **persists**
  after eviction, but the `onAuthRequired` listener **dies with the worker** — the browser
  keeps routing through the proxy while unable to authenticate, and both service-worker targets
  still appear in `Target.getTargets`. Acknowledged Chromium bugs **1371177** and **1392461**.
  This makes extension-based proxy auth fail *intermittently and invisibly*, which is worse than
  a hard failure. Extension-based proxy auth is a dead end.
- **The failure mode when the extension does not load is SILENT UNPROXIED SCRAPING**, not an
  auth error — because the extension carried *both* routing and credentials.

### 4.4 Proxy auth mechanics (Decodo / Smartproxy lineage)
- **Username format:** `user-<account>[-country-xx][-city-xxxx][-session-<VALUE>][-sessionduration-N]`.
  The literal token **`user-` is load-bearing** — the string is only parsed as a hyphen-delimited
  key/value list when it starts with it. MEASURED live 2026-07-29: bare `<account>` → 200;
  `<account>-session-<alnum>` → **407**; `user-<account>-session-<alnum>` → 200, including
  HTTPS-to-proxy against an HTTPS target (`scripts/aic-scraper-nodriver.py:403-418`).
- **Session IDs must be alphanumeric.** A hyphen inside the value makes the parser read
  `session=<firstword>` and choke on the next token. Ours was `buildo-worker-1-<ts>`; it is now
  `w<id>t<ts>` (commit `3583d824`).
- **`sessionduration` is 1–1440 minutes, default 10.** We set 30.
- **A 407 is invisible in a browser** — Chrome renders "This site can't be reached" for every
  page, indistinguishable from a network outage. Always probe a proxy with curl.
- **Ports encode stickiness.** `ca.decodo.com`: **20000 = rotating, 20001–29999 = sticky, one IP
  per port.** `gate.decodo.com`: 7000/10000 rotating, 10001–49999 sticky. All our workers
  pointed at 20001, so the multi-worker design's premise (distinct residential IPs) was silently
  false while every `-session-` suffix looked correct (commit `c3dff232`).
- **SOCKS5 is not viable with Chrome at all** — Chrome ignores SOCKS credentials and never fires
  `onAuthRequired` (crbug 40323993). Also, `ca.decodo.com` does not serve SOCKS5; only
  `gate.decodo.com:7000` does.
- **Scheme matters:** plain-**http**-to-proxy CONNECT tunnels to HTTPS targets were **RESET**
  (reproduced with `-k`, so it is the tunnel, not cert validation); **https**-to-proxy worked
  (commit `ef9bbab2`). Default to `https` and prove it with a live probe.
- **Provider-side IP allowlisting is a non-starter on GitHub-hosted runners** — egress IPs are
  dynamic across large Azure ranges. Viable only on self-hosted runners or a static NAT egress.
- **`Fetch.enable` + `Fetch.continueWithAuth` DOES handle proxy 407.** The folklore that it only
  handles 401 is wrong: `AuthChallenge.source` has allowed values `Server` **or `Proxy`** in the
  CDP spec, Puppeteer's `page.authenticate()` is built on it, and SeleniumBase shipped it. The
  real limitations are different: it fires only in targets where `Fetch` is enabled (new
  tabs/popups need re-arming, and a navigation racing `Fetch.enable` slips through), requests
  outside a page target never surface, and it pauses every request.
  `nodriver 0.48.1` exposes it (`nodriver/cdp/fetch.py`: `continue_with_auth` at :305,
  `AuthRequired` at :481 — verified by downloading the wheel).

### 4.5 What actually triggers blocks vs what we assumed
| Assumed trigger | Verdict |
|---|---|
| Missing session / `setup.do` warm-up | **DISPROVEN** (step 1 cold-200) |
| Missing CSRF token | **DISPROVEN** (no token exists) |
| Missing `X-Requested-With` | **DISPROVEN** (A/B, no difference) |
| Launch-flag fingerprint delta | Not shown; one flag flagged theoretically (§4.2) |
| Relay allowlist starving the WAF challenge JS | Plausible mechanism, but **timeline-refuted** as the cause of run 30506470111 (see §8 C4) |
| **Request rate per client per window** | **CONFIRMED — this is the blocker** |
| **Missing `Accept-Encoding`** | **CONFIRMED — instant 403** |
| Datacenter vs residential exit IP | **UNMEASURED** — run 30506470111 was residential-proxied and still failed |
| Non-Canadian exit geography | **UNTESTED, prime suspect** (§2.8) |

**Precedent worth carrying forward:** commit `d138bb04` (2026-03-15) — *"WAF JavaScript Trap:
route interceptor blocked 'script' resources, preventing WAF JS challenges from executing.
**Browser sessions were permanently shadow-banned.**"* Any mechanism that starves the
challenge — CDP resource-type blocking **or** a host allowlist at the proxy — reproduces it,
and the failure is quiet (a per-resource 500), not loud.

---

## 5. Cloud / CI execution knowledge

- **Ubuntu 24 AppArmor userns.** `ubuntu-latest` (24.04) ships
  `kernel.apparmor_restrict_unprivileged_userns=1`, which kills Chrome's sandboxed launch
  instantly; nodriver reports only its generic error. Fixed by setting the sysctl to 0 in the
  workflow (commit `de3ff6dd`).
- **`actions/cache` poisons Chrome profiles.** Run `30485096998` crashed Chrome *after* it wrote
  `SingletonLock`, concluded false-green, and `actions/cache` saved the contaminated profile.
  The next run restored it and Chrome exited instantly ("profile in use on another computer"),
  surfaced by nodriver only as "Failed to connect to browser". **Worse:** once verdicts are
  honest, failed runs never save caches, so the one poisoned entry is restored **forever** via
  `restore-keys` prefix match. Fix: `clear_stale_profile_locks()` at bootstrap (locks are
  host-session-scoped; removal is always safe) **plus** deleting the poisoned entry
  (`buildo-scraper-profiles-chain-deep-scrapes-30485096998`, deleted via API). Generalises to
  *any* stateful dir round-tripped through `actions/cache`.
  **Cheaper alternative the comparison report identifies: delete the cache step (1 line)
  instead of adding 28 lines of Python.**
- **Cache-poisoning fence (security):** never add a `pull_request`-family trigger to
  `chain-deep-scrapes.yml` while it shares this cache namespace — that is the vector that lets
  an untrusted fork poison an entry a later trusted run restores, against a workflow that spawns
  a headed browser holding residential-proxy credentials.
- **Browser availability on the runner.** The workflow has **no browser install step**; it
  relies on preinstalled binaries and nodriver's `find_chrome_executable()`, which on POSIX
  prefers per-PATH-dir `google-chrome`, then `chromium`, then picks the **shortest path**.
  MEASURED (run `30493773408` `chrome_diagnostics`): resolves `/bin/chromium` →
  `/usr/local/share/chromium/chrome-linux/chrome`, **Chromium 150.0.7871.0 — unbranded, and
  therefore exempt from the 137/142 `--load-extension` removals.** Run `30498062060`'s
  `browser_targets` listed **both extension service workers**, so the MV3 extension *does* load
  in CI. INFERRED consequence: installing Chrome for Testing (~4 workflow lines,
  `npx @puppeteer/browsers install chrome@stable`) was a viable alternative to the entire relay.
- **xvfb / headless.** Headed mode was only ever forced by `--load-extension`. With
  `--proxy-server` + a relay, plain headless works and the whole X11 surface (xvfb-run,
  `$DISPLAY` inheritance through `run-chain.js` → `python3` → Chrome) leaves the failure space.
  The DISPLAY guard in the current code is now **unreachable dead code**.
- **DBUS.** Chrome's session-bus probes stall for seconds with no bus — pure cold-start latency
  inside the exact window that broke the handshake. Recommendation:
  `DBUS_SESSION_BUS_ADDRESS=/dev/null` or wrap in `dbus-run-session`. **Deferred, never applied,
  never measured** (`review_followups.md:2793`).
- **Empty-string env vars.** GitHub Actions passes unset workflow env vars as **empty strings**,
  which defeat Python `int(os.environ.get(X, default))` — every such read now uses
  `os.environ.get(X) or 'default'` (commit `86868387`).
- **Dependency pinning.** `nodriver>=0.48` resolved to **0.50.3** in CI while every local proof
  was on 0.48.1. **Pin browser-automation libraries exactly.** The version difference is
  invisible in the logs.
- **The validation-loop lesson.** ~13 CI validation cycles were burned on pure-logic seams
  (empty-string env parse, exit-0 verdict masking, profile-lock handling, the ceiling test) that
  a unit test catches in seconds. The pytest harness (`scripts/tests/`, `pytest.ini`,
  `requirements-dev.txt`, `pipeline-lint.yml`; commit `1271bf17`; `npm run test:py`) exists
  precisely for this. **Run it before pushing any `scripts/*.py` change — a 6-minute
  `workflow_dispatch` is not a validation loop.** Note the harness imports functions that only
  exist at HEAD, so a wholesale revert breaks four test files.
- **Verify against the DB the code will actually use.** A local `createPool()` with no explicit
  connection string points at the **local Docker `buildo`** DB while CI runs against cloud
  Supabase `postgres`. "I verified there are zero rows" against the wrong database burned
  **three** CI cycles.

---

## 6. Cost / economics model

| Quantity | Value | Grade |
|---|---|---|
| Data bytes per permit (4 JSON calls) | **~5.3 KB** | MEASURED (curl) |
| `setup.do` per session refresh | **75,885 B** | MEASURED (curl) |
| Playwright v2 measured cost | **~4 KB/permit**, ~250 MB per full pass | Reported, recovered Spec 38 §3.6/§3.7 |
| v1 full-HTML cost | ~1.5 MB/permit, ~93 GB/week | Reported, recovered Spec 38 §3.6 |
| Operator's proven plan | **Decodo 3 GB/week for ~11K permits ≈ 0.3 MB/permit budget** | Operator-stated (`.cursor/wf3_aic_cloud_capture.md:7,17`) |
| Pending queue size | **10,981 permits** | Reported (commit `de3ff6dd` message) |
| Requests per permit | 4 (3 if step 4 is dropped) | MEASURED |
| Observed ceiling | **~12 requests / ~10 min / client** | MEASURED (curl — LOWER bound) |
| Derived throughput | **~3 permits / 10 min / IP-lane = 18/hr = 432/day** | INFERRED arithmetic |

**Drain-time arithmetic (INFERRED; assumes the curl-measured ceiling transfers and that Akamai
scores strictly per-IP):**

| Target | Concurrent sticky IP-lanes needed |
|---|---|
| 25.4 days | 1 |
| 1 week | ~4 |
| 48 hours | ~13 |
| 24 hours | ~26 |

Lane count is a Decodo plan decision as much as an engineering one. The operator has since
confirmed **unlimited endpoints/IPs are available**, so lane count is not the binding constraint
(`.cursor/wf3_aic_cloud_capture.md:20`); the open question is the plan's concurrent-session limit.

### The 1.76 GB / $6.60 incident
- **What:** the first genuinely-proxied run billed **1.76 GB to `edgedl.me.gvt1.com`** (Chrome's
  component-update CDN — **62 requests averaging ~28 MB**) for **~$6.60**, plus
  translate/autofill/safebrowsing/accounts chatter, against **2.7 MB** of actual
  `secure.toronto.ca` scraping. **99.9% of spend was Chrome talking to Google.**
  (`tasks/lessons.md:91`; `docs/specs/00-architecture/115_scheduling.md:317`.)
- **Cause:** not the scraping. **116 cold Chrome launches** in run 30506470111 — 102 WAF traps
  each triggering a browser+IP rotation, and every cold start re-downloads components
  (`scripts/aic-scraper-nodriver.py:1025-1028`).
- **Why it appeared only then:** the traffic was always there; it was **free only while the proxy
  was silently broken**.
- **Implied unit price:** ≈$3.75/GB (INFERRED from 6.60 ÷ 1.76; the $6.60 also covers the other
  chatter, so treat as an upper bound on the rate).
- **Two independent guards now exist:** launch flags (`--disable-background-networking`,
  `--disable-component-update`, …) and a host **blocklist** at the relay
  (`scripts/proxy-relay.mjs:55-79`, 16 Google hosts including bare `google.com` — ~4.8 MB/run of
  omnibox/NTP preconnect that per-subdomain entries did **not** cover, because suffix matching
  is one-directional).
- **Realistic budget shape:** at 5.3 KB/permit the data for a full 11K-permit weekly pass is
  **~0.06 GB**. Everything else is overhead. A browser transport fits inside 3 GB/week *only if*
  the background chatter stays blocked and cold starts stay rare; a raw-HTTP transport makes the
  question moot.

---

## 7. Open questions and untested hypotheses

**Explicitly not established. Do not cite any of these as fact.**

1. **Does geo-targeting fix it?** `country-ca` (and possibly `city-toronto`) has never been set.
   Cheapest single experiment; highest prior. (§2.8)
2. **Does the ~12-req/10-min ceiling transfer to real Chrome, and to a TLS-impersonating client
   (`curl_cffi`)?** The number is a curl lower bound. The operator reports real Chrome gets
   substantially more headroom — unquantified.
3. **Is a datacenter IP scored worse than a residential one by this Akamai config?** Untested.
   Run 30506470111 was residential-proxied and still failed, which weakens but does not refute
   the hypothesis (geo was uncontrolled).
4. **Does Akamai cluster reputation more broadly than per-IP** (device/behaviour clustering)?
   If so, concurrency gains from more lanes are **sub-linear** and all of §6's arithmetic is
   optimistic.
5. **Do steps 3–4 work cookieless?** Test was contaminated. (§2.2)
6. **Is 4-digit `folderYear` rejected?** Never isolated. (§2.9)
7. **Is step 4 genuinely redundant** for `permit_inspections`' needs? (§2.7)
8. **Which WAF/CDN third-party hosts (if any) must be reachable** for the challenge to run?
   Nothing in the repo names them. The way to find out is to read the
   `proxy-relay: BLOCKED <host>` stderr lines from a real run.
9. **Would a self-hosted runner on a residential line work?** Spec 115 §2.4 rejected it for
   workday-disruption reasons *before* the WAF evidence existed. Worth revisiting.
10. **Does `DBUS_SESSION_BUS_ADDRESS=/dev/null` measurably shorten cold start?** Never tried.
11. **Is `--disable-background-timer-throttling` detectable by this WAF?** Theoretical only.

---

## 8. Corrections register — claims from that session that proved wrong

**C1 — the relay is a BLOCKlist, not an allowlist (documentation drift, still live).**
`docs/specs/00-architecture/115_scheduling.md:317` (§2.4 item 10) and
`docs/reports/review_followups.md:2804` (D1) both describe `scripts/proxy-relay.mjs` as a
**deny-by-default allowlist** admitting only `toronto.ca` / `api.ipify.org`, overridable via
`SCRAPER_PROXY_ALLOWLIST`. The file at **`scripts/proxy-relay.mjs:46-79`** states the opposite
in its own comment — *"BLOCK-list, deliberately NOT an allowlist"* — and implements a 16-host
Google **blocklist** overridable via `SCRAPER_PROXY_BLOCKLIST`. The inversion was made
deliberately (commits `25df503a`, `539468b5`) *because* the allowlist reproduced the `d138bb04`
shadow-ban trap. **The code is right; both docs are stale.** Fix the docs, not the code.

**C2 — "the scraper hits `/jaxrs/search/folders` cold and is missing the property search."**
Asserted in commit `68a2f55e`'s own message and repeated in a task brief. **WRONG.**
`scripts/aic-scraper-nodriver.py` starts at `POST /jaxrs/search/properties`, extracts
`propertyRsn`, then calls `/folders` — matching Spec 44 §3 and Playwright v2 byte-for-byte.
Evidence: direct read of the file, twice, by two independent agents (transcript `03:00:07`,
`03:13:55`).

**C3 — "the CI runner's Chromium build is unaffected [by the ≥137 removals]."**
Written into `review_followups.md:2794` **without evidence**, flagged by audit as an assumption,
then **subsequently confirmed true** by run `30493773408` (`chrome_diagnostics`: Chromium
150.0.7871.0, unbranded) and run `30498062060` (`browser_targets` lists both extension service
workers). The claim survived; the epistemics did not. Recorded because the pattern — asserting
an environment fact into a doc without a run to back it — recurred repeatedly that day.

**C4 — "the relay allowlist caused run 30506470111's empty responses."**
**Impossible: the allowlist was committed AFTER that run was cancelled.** Correction recorded at
`review_followups.md:2804`. The mechanism is real and would have reproduced the shadow-ban on the
*next* run; it was not the cause of the observed failure.

**C5 — "the ~12-request ceiling was measured through a real Chrome TLS stack, so it may not
transfer to a Python client."** **Inverted.** A reviewer (transcript `03:32`) argued this to
justify caution about a raw-HTTP rewrite. The reconnaissance agent had explicitly stated its
fingerprint was **curl's** and its thresholds were **lower bounds** (transcript `03:13:55`). The
correct framing is *"can we beat 12 requests?"*, not *"can we still reach it?"*. Adjudicated in
the operator-facing summary at transcript `03:39:53`. **Better-evidenced source: the
reconnaissance agent's own caveat**, which is first-hand.

**C6 — "CDP-based automation bypasses the WAF completely without even needing a proxy /
Proxy: Optional. Direct connection works."** (commit `bee15998`, recovered Spec 38 §3.8.)
Established on the **operator's own residential desktop**. It does **not** transfer: run
30506470111 was genuinely proxied through a residential exit IP and still logged 102 WAF traps
with zero rows (`review_followups.md:2816`).

**C7 — "this is a cloud regression of a working scraper."** The framing that governed the entire
day. **Two sources conflict, and both matter:**
- *Database + git evidence:* `permit_inspections` max `scraped_at` = **2026-03-15**, produced by
  the **Playwright** v2 scraper, deleted 2026-04-16; `pipeline_runs` records **zero** successful
  nodriver-scraper runs anywhere (agent audit, transcript `23:56`).
- *Operator's account (authoritative on intent and on what he personally observed):* the nodriver
  scraper **is** the delivered design and did work locally through his own Chrome, unproxied,
  **before the June DB transition** — which is exactly why the telemetry for that window no
  longer exists (`review_followups.md`, "BASELINE CORRECTION").
- **Reconciled:** *cloud* execution has never once succeeded, under any scraper. This is
  **build-and-prove, not restore-and-diff.** The nodriver scraper's local success is credible but
  **unverifiable from the DB**, and commit `2a532bc3`'s *"626 inspection stages inserted"* is
  likewise unverifiable (rows in neither database).

**C8 — `proxy_configured=true` in telemetry for four months.** The MV3 extension was silently
dropped by branded Chrome ≥137, so every local run scraped **direct from the operator's
residential IP** while telemetry recorded a configured proxy. `assert-network-health.js` gated
`proxy_errors` but read `proxy_configured` **nowhere**, so a fully-direct run reported
`proxy_errors=0` and **PASSED**. "Is the mechanism configured?" is not "is the mechanism
working?" — assert the **outcome** (a different egress IP).

**C9 — Spec 115 §2.4's "the Decodo residential proxy carries ALL AIC traffic, so the runner's
datacenter IP is never WAF-visible."** This is **design intent asserted as fact**; no
verification was ever cited, and the proxy had never been in the nodriver scraper's path
anywhere. The same section says the workflow matches *"whatever invocation the `inspections` step
already uses locally"* — also an assumption. (Audit claim 12, transcript `23:56`.)

**C10 — "`PROXY_SCHEME=https` VERIFIED WORKING (curl probe)"** (in-code comment at the time).
A curl probe validates that Decodo terminates TLS on that port; it says **nothing** about
Chrome's auth path. The 407 root cause (`user-` prefix) survived that "verification" untouched.

**C11 — `MAX_BROWSER_LAUNCHES=12` calibration. Both reviewers were right, at different code
states.** Reviewer A (transcript `03:18`) rated it **FAIL** — because per-batch teardown was
`PROXY_HOST`-gated (`if browser and (PROXY_HOST or batch_num % BROWSER_MAX_BATCHES == 0)`), so in
production the ceiling tripped after ~12 *healthy* batches (~60–180 permits) against a
10,981-permit queue. Reviewer B (transcript `03:32`) rated it **PASS** — after commit `15c7417b`
removed the `PROXY_HOST or` disjunct, leaving only WAF-trap rotations to consume the budget.
**Better-evidenced:** both, read in order. The ceiling is only correctly sized *given* the churn
removal.

**C12 — commit `b1bc91e9`'s "relay start moved inside the try" fix is unreachable dead code.**
The pre-`try` calls were never removed, and the preceding `if PROXY_HOST and worker_id:` /
`elif PROXY_HOST:` branches already cover every case — so a relay failure **still escapes
`main()` uncaught**: no `PIPELINE_SUMMARY`, `preflight_passed` left at its default `True`,
orchestrator undercounts the dead worker. A live bug that a commit message claims is fixed.

**C13 — "a cost-ceiling trip means CDP stealth is compromised."** `aic-orchestrator.py:429` logs
*"CDP stealth may be compromised"* for a `MAX_BROWSER_LAUNCHES` abort. Wrong diagnosis, and it
will misdirect debugging on the next dispatch.

**C14 — the 2026-03 strategy doc's portal model.** `aic_scraping_strategy.md` §1 states the
portal *"explicitly blocks direct requests to the data endpoints"* and requires clicking through
address/application-number accordions and a Status pop-up. **Refuted** by the 2026-07-30 recon
for steps 1–2 (cold cookieless 200 on the JSON endpoint). The document's Playwright/BullMQ
architecture is likewise historical, not current.

**C15 — "the proxy forces headed Chrome, therefore xvfb."** True only of the **MV3 extension**
mechanism. With `--proxy-server` + a local relay, headless works and xvfb is unnecessary. The
rationale is preserved verbatim in `chain-deep-scrapes.yml`'s header comment and Spec 115 §2.4,
where it is now obsolete.

---

## 9. Where the primary artifacts live

| Artifact | Location |
|---|---|
| Line-by-line `de3ff6dd`→HEAD diff classification | `docs/reports/2026-07-30-deep-scrapes-original-vs-head-comparison.md` |
| Excavation, baseline correction, portal recon (canonical prose) | `docs/reports/review_followups.md:2795-2831` |
| Durable lessons (scraper launch/proxy, debugging protocol) | `tasks/lessons.md` — "AIC scraper — browser launch + proxy (2026-07-30)" and "Debugging protocol" sections |
| Next-step plan (geo-target, then A/B transports) | `.cursor/wf3_aic_cloud_capture.md` (**untracked**) |
| Playwright v2 source | `git show 47d82cd5^:scripts/poc-aic-scraper-v2.js` |
| Playwright v1 source | `git show 3fa259c7^:scripts/poc-aic-scraper.js` |
| **Recovered Spec 38** (richest session-entry doc) | `git show e59cb8b0^:docs/specs/38_inspection_scraping.md` §3.1/§3.7/§3.8 |
| Original 2026-03 strategy doc | `git show bab33b4b^:docs/reports/archive/aic_scraping_strategy.md` |
| Session scratch artifacts (portal HTML, `as-interface.js`, nodriver source, CI logs) | `…/Temp/claude/C--Users-User-Buildo/1ace4c0b-…/scratchpad/` (**ephemeral — will be pruned**) |
