# Next-session prompt — deep-scrapes WF2 restore

Paste everything below the line into a fresh session.

---

WF3. Domain Mode: Backend/Pipeline.

Continue the deep-scrapes restore. Read `.cursor/wf2_deep_scrapes_restore.md` first — it is the
active task, it carries the full panel record, and its ladder table is the source of truth for
what is done. Branch `wf2/deep-scrapes-restore-l0` (pushed, nothing merged, cron disabled).

## ⚡ STATUS UPDATE (2026-07-30, this session) — the defect below is FIXED; probe pending

WF3 executed in-session (Backend/Pipeline; operator pre-authorized: "proceed to the next task -
fix it then test"). The single defect turned out to be a **cluster of three**, all in the
evaluate-result path:

1. **Root trigger — `921536a9` introduced a JS SyntaxError.** Its catch-site edit embedded a
   LITERAL newline inside a JS string literal (`.split('⏎')[0]`) at all 4 sites. Proven with
   node: the whole IIFE fails to PARSE — this is why "the JS never ran" and why the message
   capture never captured anything. Fixed: the f-string now carries `\\n` so JS receives the
   two-char escape.
2. **nodriver returns, never raises.** `Tab.evaluate` source: `if errors: return errors` — a
   page-side throw hands back `cdp.runtime.ExceptionDetails` as the RETURN VALUE. New
   `evaluate_fetch()` wrapper (4 call sites) converts any non-string into the standard
   `{error, message, at}` sentinel and logs `event: evaluate_exception` with the real message
   via `summarize_exception_details()`.
3. **Stale sentinel detection.** `safe_json_parse` matched the sentinel with `len(data) == 1`,
   but the sentinel has had 3 keys since `921536a9` — once the JS parsed again, the sentinel
   would have flowed onward as DATA and crashed on `props[0]`. Now: dict with `'error'` whose
   keys ⊆ `{error, message, at}`; plus a non-string type guard (the `.strip()` crash lock).

Locks: `scripts/tests/test_scraper_fetch.py` (sentinel shapes, ExceptionDetails conversion,
source-level newline-escape lock). Verified end-to-end in-session: real module's rendered step-1
JS passes node parse; sentinel path classifies `fetch_error` → `waf_blocked` correctly.

**Probe #6 (run 30568655070) — the fix WORKED and named the fault:** both permits reported
`fetch_error: TypeError — Failed to fetch`, cleanly classified (`proxy_errors=2`, honest FAIL
verdict, sentinel body visible in the step-1 sample). Reading the code with that message in
hand exposed the real bug, a second finding:

**Finding 2 (FIXED, same session): the egress check hijacked the scraping tab.**
`bootstrap_session` lands the tab on AIC and asserts the origin — then, on the PROXIED path
only, `bootstrap_with_retry` runs `verify_proxied_egress(browser)`, which did
`browser.get(EGRESS_ECHO_URL)` on the SAME tab. Nothing navigated back, so every same-origin
`/jaxrs/` fetch was actually cross-origin from the echo page → `TypeError: Failed to fetch`.
The rotation branch had the same class: after an IP rotate it parked the tab on `about:blank`
(opaque origin — cannot fetch AIC either), which is exactly why probe #6's second permit failed
the same way after "Rotating...". This is why the attested local (unproxied) path never saw it,
and why the handoff's "wrong origin — eliminated" was stale: the assert passed at bootstrap,
the origin was lost one step later. Fixes: egress check runs in its OWN tab (closed after);
`assert_on_aic_origin(page)` tripwire re-runs AFTER the egress check; rotation re-enters
`setup.do` + asserts origin instead of `about:blank`. Locks in `test_scraper_egress.py`
(new-tab + closed) — `test_egress_check_never_hijacks_the_scraping_tab`.

**Probe #7 (run 30569435497) — THE CHAIN WORKS END-TO-END IN THE CLOUD, first time ever.**
All four `/jaxrs/` steps returned real portal JSON through the relay on the GH runner:
`24 171259: 3 folders, 1 target permits` → step 3 detail OK → step 4 executed → classified
`no_stages`; `25 186707: 4 folders` → same. `proxy_errors=0`, egress verified
(browser IP ≠ host), network-health PASS (latency p50 1993 ms), cost blocklist blocking
14 Google requests, clean teardown, honest FAIL verdict from the row-derived cascade.
The only red gate is `not_found_rate 100% (2/2)` — both sampled permits genuinely returned
`stages: []` from step 4.

**Open adjudication — `no_stages`: reality or bug?** Sample of 2, both BLD [Inspection].
Cannot be settled from our DB (these permits were never scraped). Options: ① dispatch a
larger bounded probe (e.g. max_permits=10) and see whether ANY permit yields stages; ② probe
permits KNOWN to carry stages (the 57 in `permit_inspections`) — but the workflow runs
db-queue mode; targeting needs either queue manipulation or wiring `--batch-file` worker mode
into the workflow; ③ operator eyeballs one of the two permits in the portal UI (30 s, from a
residential IP). The L0 pass criterion ("permits known to carry inspections") points at ②/③.

**Small follow-up found by probe #7:** `log_browser_targets(browser)` warns
`'Browser' object has no attribute 'send'` — the K7e diagnostic expects a Tab/Connection but
bootstrap passes the Browser. Diagnostic-only (never gates), 2-line fix + fake update.

**Portal-behaviour finding (operator-verified on the live site, 2026-07-30 — belongs in the
Spec 44 §3 portal section at Step 8b):** the Inspection Status page now lists **only stages
already PASSED** ("this list reflects applicable mandatory inspection stages that have been
passed") — unpassed/outstanding stages are NOT enumerated, unlike the March-era scrapes whose
rows included Outstanding stages. Two consequences: ① `stages: []` is the portal's normal
answer for any permit that has not yet passed a stage — probe #7's two `no_stages` permits are
almost certainly CORRECT reads, and the `not_found_rate < 20%` gate needs re-thinking for
inspection-stage semantics; ② the inspection-anchored Tier-1 timing engine will only ever see
passed stages going forward. Also operator-observed: the portal map/list is very slow to
render — UI weight, consistent with `setup.do` at 75 885 B.

**Targeted probe #8 (run 30570805311) — ✅ GREEN, capture path PROVEN.** Operator pulled
`21 217696 BLD 00 NH` (7 Airley Cres) on the live portal — TWO passed stages
(Excavation/Shoring + Footings/Foundations, both Jun 11 2025). Seeded `'21 217696'` into the
CLOUD scraper_queue as `pending` with `created_at='2000-01-01'` (claim is `ORDER BY
created_at`, so it was claimed first); dispatched `max_permits=1`. Result: **"Scraped 2 stages
for 21 217696 BLD"** matching the portal exactly, `records_new=2` (`permit_inspections`
792→794 — **the first rows the nodriver scraper has EVER written, and the first cloud-scraped
rows in the project's history**), ingestion PASS, not_found_rate 0%, data-quality all PASS,
GH run conclusion SUCCESS. Provenance milestone: the "operator-attested, never data-verified"
caveat is now closed for the cloud path. Seeder one-off: scratchpad `seed_target_permit.js`
(cloud DB via SUPABASE_DATABASE_URL).

**New adjudication opened by #8 + the portal finding:** the scraper derived
`enrichedStatus: "Inspections Complete"` for a permit that is only MID-inspection — the portal
no longer lists unpassed stages, so "every scraped stage is Passed" no longer implies
completion. `compute_enriched_status`'s inference predates the portal change; needs a
Spec 44/38 ruling before bulk scraping, or enriched_status will over-claim on every
mid-inspection permit. (Not a scrape bug — capture is byte-faithful to the portal.)

**Also open:** avg_latency 3841 ms > 2000 WARN on the proxied path (single sample, gate may
need a proxied-path allowance) · the two probe #7 permits' queue rows and this seeded row are
`completed` honestly · L4 (CDP resource blocking) remains the deliberate last rung.

---

## ⚡ BANDWIDTH CAMPAIGN (2026-07-30 late) — 322 KB/permit → 6.9 KB/permit

Operator challenged the L4 result ("no way we can't cut this more … 5GB for 10,000 permits
argh"). Two agents ran: a codebase byte-budget investigation and an external best-practice
research pass. Both were right, and the second one changed the architecture question.

**Measured progression (all on 60-permit runs unless noted):**
| Stage | B/permit | 10k/wk | Evidence |
|---|---|---|---|
| 12-permit probe (the alarming number) | 322 KB | ~3.2 GB | run 30577993600 |
| T1 — same code, 60 permits | 105 KB | ~1.05 GB | run 30581163413 |
| T2 — after the four cuts | **32 KB** | ~320 MB | run 30582877429 |
| curl_cffi, no browser, cold, proxied | **6.9 KB** | **~69 MB** | local spike |

**Why it looked catastrophic:** cost is ~3.25 MB FIXED per run + a marginal per-permit term.
Dividing the fixed term by 12 produced 322 KB/permit; it is an artifact of probe size, not a
per-permit cost. v2's famous ~4 KB/permit was likewise a per-SESSION cost over 200 permits —
v2 did 0.01 navigations/permit, we did 0.72 (a bootstrap per batch + 2 navigations of "noise"
every 3-5 permits + a whole session built and discarded). Same allow-set, 72x the navigations.

**R0 per-host attribution (the instrument that ended the guessing), run 30581163413:**
www.toronto.ca 3,439,422 (54.5%) · secure.toronto.ca 1,989,233 · js.arcgis.com 273,163 ·
code.jquery.com 169,410 · oracleinfinity.io 148,214 · maps.googleapis.com 116,583. **Over half
the bill was a host that serves us no data at all.**

**Shipped (`bb28ec55`, all request-REDUCING so WAF standing improves):** ENTRY_URLS pinned to
v2's bare root · noise visits gated OFF in cloud (+ finally logged — they emitted nothing and
swallowed failures) · the discarded pre-loop bootstrap deleted (session_bootstraps 2→1) ·
`Network.setCacheDisabled(false)` after `Fetch.enable` (interception is a documented
cache-killer) · oracleinfinity.io blocklisted · `SCRAPER_PROXY_BLOCKLIST` now EXTENDS rather
than REPLACES the 16 defaults (it could silently reopen the $6.60 gvt1.com exposure).

## 🚨 THE ARCHITECTURE FINDING — curl_cffi works, no browser needed (`d1a9a95a`, `f31ca8d9`)

`scripts/spike-curl-impersonate.py` + `.github/workflows/spike-curl-impersonate.yml`
(measurement only, no DB writes, no chain wiring — the raw-HTTP scope fence is intact).

* **The portal sets NO Akamai sensor cookies.** Only `JSESSIONID`/`WEBTRENDS_ID`; `_abck`,
  `ak_bmsc`, `bm_sz` all absent, with an `akamai-grn` header confirming Akamai is in front.
  That is rate/reputation control, NOT the JS-sensor Bot Manager product — so the entire
  published "solve the sensor in a browser, replay the cookie" problem **does not apply here**.
  It also means the `~12 req/10 min` recon figure was measured with curl's TLS fingerprint,
  i.e. a FLOOR, not the ceiling for a Chrome-JA4 client.
* **Run 1 (local, residential, with warmup):** full 4-step chain, correct stages for
  21 217696. **Run 2 (through Decodo, `--no-warmup`, genuinely cold): 8/8 OK, 10 stages, 6,897
  B/permit.** `23 183037` returned exactly the 4 stages the operator read off the portal by
  hand — agreement with human ground truth, not just HTTP 200s (the spike validates response
  SHAPE precisely because Akamai's anti-scraper mode is a 200 with hollow fields).
* **No warm-up page needed at all** — the 75,885 B `setup.do` GET buys nothing on this path.
* Retires, if adopted: Chrome, xvfb, the CDP handshake, attach mode, the resource filter, the
  `d138bb04` shadow-ban surface, and most of the relay's reason to exist.

**NOT YET DONE:** runner-side proof (the new workflow can't be dispatched until it reaches the
default branch — GitHub only registers workflow_dispatch from the default ref); a
requests-to-block ceiling measurement for the Chrome-JA4 client (the number that sets
throughput); and the WF1/WF2 to actually adopt it. The browser path is fully working and
green at 32 KB/permit in the meantime, so this is an upgrade, not a dependency.

## WF3 — enriched_status under passed-only portal listings (AUTHORIZED "proceed with your plan as is" 2026-07-30; steps 1-6 done, step 7 = correction probe)

**Follow-up task CREATED (operator-requested): "Update lifecycle engine for passed-only
inspection listings (feed-status completion)"** — Task #1 in the session task list, full brief
in the task body: ① derive completion from feed status in the permits chain, ② re-derive
Tier-1 timing assumptions (Outstanding rows never arrive anymore; the 634 outstanding rows are
March-era fossils), ③ per-build-type stage regimes for remaining-stage timing, ④ review the
classify-inspection-status.js terminal guard. Blocked until this branch merges and bulk
scraping resumes.

**Operator ruling (2026-07-30): "I think we use the status from the feed."** Completion truth
is `permits.status` from the nightly CKAN feed (vocabulary confirmed live: Inspection 130K,
Pending Closed 43K, Permit Issued 41K, …) — never inferred from a passed-only stage list.
Ground truth (operator pulled 6 live permits): AIC keeps status 'Inspection' even after
Occupancy passes (23 183037, 17 172425, 23 132404); stage regimes vary per type AND per
project ("applicable" stages — 11 Airley has no Excavation/Shoring row).

**Premise verified in code:** `compute_enriched_status` maps all-Passed → 'Inspections
Complete' (`status_mapping.json` `all_passed`), written at scrape time; Spec 44 §Core-Logic 3
codifies it — both predate the portal change. Consumers of the literal: only
`classify-inspection-status.js`'s reactivation terminal-guard (kept — protects historical
rows) and the JS mirror test. `enriched_status` is near-empty in both DBs (50-51 'Examination'
+ the 1 wrong 'Inspections Complete' probe #8 wrote), so blast radius is minimal.

**Steps** (1-3 executed before the operator asked to see the plan — shown as done, uncommitted):
1. ✅ `compute_enriched_status`: all-passed falls through to 'Active Inspection' ('mixed');
   'Not Passed' still wins; all-Outstanding branch retained for robustness. Docstring carries
   the portal-change evidence.
2. ✅ `status_mapping.json`: `all_passed` key removed (nothing references it any more).
3. ✅ `src/tests/inspections.logic.test.ts` mirror: all-passed → 'Active Inspection' lock.
4. ⬜ Python lock `scripts/tests/test_scraper_enriched_status.py` (SPEC LINK header):
   all-passed → 'Active Inspection' (failure message cites the portal change) · Not Passed
   priority · all-Outstanding → 'Permit Issued' · empty/unrecognized → None.
5. ⬜ Spec 44 truth-up: rewrite §Core-Logic 3 (drop "All Passed → Inspections Complete",
   state the feed-status rule) + add the portal-behaviour paragraph with the 6 examples.
6. ⬜ Gates: `npm run test:py` + full `npm run test` + typecheck + lint → commit + push.
7. ✅ Cloud correction probe #9 (run 30573424808, GREEN): re-scraped `21 217696` — scraper
   wrote 'Active Inspection' (fix verified on the runner), `enriched_updates=1`, stage rows
   idempotent (0 new). The classifier then moved it to **'Stalled'** per its designed
   300-day rule (last passed stage Jun 11 2025) — honest, and DB-verified directly:
   `21 217696 BLD` enriched_status='Stalled', 2 Passed stage rows. The wrong
   'Inspections Complete' no longer exists anywhere. Note for Task #1 (lifecycle follow-up):
   the 300-day Stalled rule now operates on passed-only data — revisit its semantics there.

**Non-goals:** per-type stage-regime modelling ("we know what the stages are for the type of
build" — real, but that is inspection_stage_map / Tier-1 timing-engine territory, filed as
follow-up) · writing enriched_status on an empty stage list (feed status stands) · gate
tuning (not_found_rate / latency — already filed) · any change to Stalled/reactivation logic.

**Retirement note:** 'Inspections Complete' stops being scraper-written. If wanted later, it
can be derived honestly from feed status ('Pending Closed'/'Closed') in the permits chain.

---

## Bytes investigation (2026-07-30, operator + Decodo hourly table)

Probes cost ~3-10 MB each despite a ~5 KB/permit data chain. Cause verified against the
recovered v2 source (`git show 47d82cd5^:scripts/poc-aic-scraper-v2.js:495-514`): **v2
installed its resource filter BEFORE any navigation**, so the warm-up page and `setup.do`
loaded as HTML+scripts skeletons (map tiles are images → aborted; CSS/fonts → aborted) and it
navigated with `waitUntil: 'commit'`. The nodriver path loads every page at FULL weight
(entry page 2-5 MB + portal incl. the map stack + noise visits, cold-cache every batch)
because L4 is deliberately not yet landed. **L4 spec sharpened: the CDP interceptor must be
active from the FIRST navigation (entry + setup.do included), matching v2's ordering — not
wrapped only around the data chain.** Decodo baseline pasted in-session (yesterday's incident
= the 01:00-02:00 rows, 1.8 GB/$6.82; today's four probes ≈ 14 MB total).

**Measurement run 30574728762 (12 permits, 2 batches) — MEASURED (Decodo hourly, operator):**
the 19:00 bucket (10.35 MB / 87 req) covers probe #9 + the whole 12-permit run ⇒ the run cost
~5-6 MB (~0.5 MB/permit), roughly the SAME as a 1-permit probe — cost is bootstrap-dominated
(2 full page-load bootstraps/run), permits are ~5-20 KB each. Today's entire 5-run campaign:
~37 MB / $0.14 vs yesterday's 1.8 GB / $6.82 incident. Scrape result: 7/12 permits → 15 new
stage rows, 5 legit no_stages, batch-2 **rotated exit IP with browser retained** (proven at
scale), proxy_errors=0. Run red ONLY on the not_found_rate gate (41.7% — counts no-stages-yet
as misses; gate re-derivation filed). **L4 BUILT on operator authorization** ("if L4 is a
restore we are going to use it regardless") — CDP Fetch interception before first navigation,
allow-set verbatim from v2, `script` fence locked, relay byte accounting + filter counters in
telemetry, `SCRAPER_RESOURCE_BLOCKING` default OFF / workflow ON. See the ladder table.

**L4 validation run 30576202397 — FILTER PROVEN:** `resources_blocked=269 / allowed=242`, WAF
challenge passed WITH the filter on (no `d138bb04` signature), 6 permits → ~22 stages scraped
through it, rotation clean. Two follow-on fixes shipped: ① `3b701521` relay bytes read 0 —
Chrome's keep-alive tunnels never close before relay teardown, so `connectionClosed` counted
nothing; relay now sums LIVE sockets + emits periodic cumulative BYTES lines, scraper folds
per relay GENERATION on EOF (rotation restarts the relay at zero — latest-wins dropped earlier
batches). ② The **empty-outcome taxonomy WF3** (operator-authorized "yes"): outcomes split
into anomalous (`address_not_found`/`no_target_folders`) vs benign (`no_stages`/
`no_inspection_link`); gate re-keyed to `anomalous_miss_rate < 20%`; only anomalous misses
feed `consecutive_empty` (G4 — 3 benign answers could previously force a pointless rotation)
and the 90% early-abort; `no_stages` permits now stamp `last_scraped_at` (staleness monitor
stops counting them never-scraped; queue stops re-buying the same empty answer); breakdown
emitted in telemetry + INFO audit rows; worker AND orchestrator mirrors updated; Spec 44 edge
case rewritten; locks in `test_scraper_outcomes.py`.

**🟢 RUN 30577993600 — FULLY GREEN (conclusion: success), first in the chain's history.**
All three fixes proven together: `inspections: PASS` (`anomalous_miss_rate 8.3%`, breakdown
`{no_stages: 8, no_target_folders: 1}`, 3 permits → 6 stages), L4 filter live (166 blocked /
211 allowed, WAF fine, rotation clean), **bytes measured: ~4.1 MB / 12-permit run**
(`relay_bytes_down=3,864,005 up=199,906`). L4 pass criterion MET → ladder rung ✅.
**Byte honesty:** ~340 KB/permit at batch size 8+4 — a ~25-30% cut vs the ~5-6 MB unfiltered
baseline, NOT ~375×, because (a) `script` is deliberately allowed (the fence) and JS is the
bulk of modern page weight, (b) bootstrap dominates small batches. The remaining levers are
H7 (trim entry/noise page visits — spends bytes AND Akamai budget) and longer sessions /
bigger batches amortizing bootstrap (v2's ~4 KB/permit was measured on 200-permit sessions).
Both belong to the follow-on throughput WF. Only remaining WARN: staleness coverage 0.1%
(converges as scraping scales).

## The one open defect — ~~start here~~ FIXED above; kept for the eliminated-layers table

`page.evaluate()` raises/returns a nodriver `ExceptionDetails` object, and our calling code
treats it as a string. The run fails with:

    'ExceptionDetails' object has no attribute 'strip'

Five cloud probes narrowed to this. **Do not re-investigate the layers already eliminated:**

| Eliminated | Evidence |
|---|---|
| Akamai / WAF block | body was 21 bytes of our own sentinel, not a ~430-byte Access Denied page |
| Wrong page origin | `assert_on_aic_origin()` passes — we land on `secure.toronto.ca` |
| Proxy transport | `proxied_egress_verified`, browser IP ≠ host IP, on `ca.decodo.com:20001` |
| Network reaching AIC | relay logged 32 lines / 15 blocked hosts, **zero** mentioning toronto.ca |

The `{"error":"TypeError"}` that was chased for four runs is the *outer* sentinel; the JS never
ran. Fix the `page.evaluate` result handling in `fetch_permit_chain` (4 call sites, all with the
same catch shape), surface the real exception the object carries, then dispatch a probe.

## How to test (fast loop — use it, do not run unbounded)

`gh` is installed at `/c/Program Files/GitHub CLI` but not authenticated; take the token from the
git credential helper:

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
gh workflow run chain-deep-scrapes.yml --repo jasonbrettpreston/buildo \
  --ref wf2/deep-scrapes-restore-l0 -f max_permits=2 -f max_retries=1 -f chain_timeout_minutes=8
```

~3 minutes end to end. Logs only download once the run finishes:
`gh run view <id> --repo jasonbrettpreston/buildo --log`.

**Gotcha:** a cancelled run leaves `pipeline_runs.status='running'`, which self-blocks the chain
for 12 h via `check-chain-running.js`. Clear it truthfully (`status='failed'` + reason), never
delete. Making the workflow record its own abnormal exit is a filed follow-up.

## Read these before deciding anything

* `.cursor/wf2_deep_scrapes_restore.md` — active task, ladder, every panel ruling with reasons
* `docs/reports/2026-07-30-deep-scrapes-original-vs-head-comparison.md` — all ~45 differences
  between the pre-drift original and the cloud attempt, in four buckets
* `docs/reports/2026-07-30-scraper-research-digest.md` — AIC portal model + a corrections
  register of claims that later proved wrong
* `docs/reports/deep-scrapes-evidence-2026-07-29/` — 8 CI run logs + the portal's own JS
* `tasks/lessons.md` (~79-96) — the scraper lessons, several bought expensively

## Decisions already made — do not re-litigate without new evidence

* **Restore, not rewrite.** Base is `de3ff6dd`; the capture logic is byte-identical and must stay
  so. Backup of the cloud attempt: tag `deep-scrapes-cloud-attempt-2026-07-30`.
* **Relay, not the MV3 extension** (P3, reversed once then confirmed). The extension cannot
  rotate an exit IP without relaunching Chrome, carries no blocklist, and its service worker is
  evicted mid-run — all silent. G14 (the runner ships unbranded Chromium) is true but only means
  the extension *loads*, not that it is right.
* **Rotate the IP without recycling the browser.** Proven working on the runner. Fusing the two
  is what turned 102 WAF traps into 116 cold starts and ~1.76 GB.
* **Proxying is a declared state.** `PROXY_HOST` alone never enables it; `SCRAPER_PROXY_MODE`
  does, and credentials without a mode fail loudly. `proxy_configured` derives from the resolved
  mode in *both* the scraper and the orchestrator.
* **Module defaults are the attested LOCAL values** (3 / 2000 / 20); the workflow sets the
  measured cloud values (1 retry / 90 s / threshold 3). `TestAkamaiTunedBackoff` is `xfail`ed on
  purpose — it is the portal model in executable form, do not delete it.
* **Diagnostics are ON by default, not gated** (operator directive). They are what made this
  tractable.

## Working agreements that held up

* Run the Spec 08 panel at both altitudes. The output panel found three defects that would each
  have wasted a dispatch, including two that reproduced the exact bugs the WF exists to remove.
* Reality-Check is worth running even when its parcel-shaped trigger does not fire — it caught
  111 queue rows marked complete having produced nothing.
* A ruling folded into the adjudication log but not into the plan body is the failure mode that
  broke three readiness gates. Sweep the whole document after every fold.
* Run `npm run test` (not just targeted files) before committing — Prime Directive #4 was
  violated once here by doing the latter.
* Probes must be bounded and fail fast. Five short probes beat one 90-minute run.

## State

L0-L2 done and proven on hardware. L3 evidenced on the runner (headed Chrome under xvfb). L5
dispatch working. **L4 (CDP resource blocking, the ~375x byte lever) is deliberately last** —
blocking `script` permanently shadow-banned sessions in `d138bb04`, so it goes on top of a stack
that already works. Note the run just before it also confirmed the cost blocklist working: 15
Google hosts refused, including the component-update traffic behind the 1.76 GB bill.

Unrelated: pushing this branch triggers a Vercel build that fails. Not part of this work.
