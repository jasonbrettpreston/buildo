# Active Task: WF2 — HTTP transport for the AIC data chain (browser becomes the fallback)
**Status:** Implementation — operator-authorized 2026-07-30 ("I completely agree this is great approach let's do it - test it and then take it to the panel").
**Domain Mode:** Backend/Pipeline. Parent: `.cursor/wf2_deep_scrapes_restore.md`. Evidence: `.cursor/NEXT_SESSION_deep_scrapes.md` §bandwidth campaign.

## Context
* **Goal:** Make a Chrome-TLS-impersonating HTTP client (curl_cffi) the default transport for the four `/jaxrs/` calls, with the proven browser path retained as a **live, gated, tested fallback** — not an archived file.
* **Target Spec:** `docs/specs/01-pipeline/44_chain_deep_scrapes.md` §3 (transport), §5 (locks).
* **Key Files:** `scripts/aic-scraper-nodriver.py`, `scripts/requirements.txt`, `.github/workflows/chain-deep-scrapes.yml`, `scripts/tests/`.

## Evidence this rests on (measured, not assumed)
* Spike run 1 (local, residential, warm): full chain, correct stages for `21 217696`.
* Spike run 2 (through Decodo, `--no-warmup`, cold): **8/8 OK, 10 stages, 6,897 B/permit**; `23 183037` returned exactly the 4 stages the operator read off the portal by hand.
* Portal sets **no Akamai sensor cookies** (`_abck`/`ak_bmsc`/`bm_sz` absent; `akamai-grn` header present) ⇒ rate/reputation control, not the JS-sensor product ⇒ no cookie to solve or replay.
* Browser path for comparison: 105,266 B/permit (run 30581163413), 32,025 B/permit after the same-day cuts (run 30582877429).

## Ruling — a GATE, not an archived copy (operator raised the alternative)
The operator suggested saving a complete scraper file for the retained approach. **Rejected on this WF's own P1 precedent**: an inert copy rots, pollutes `grep`, and offers false security — it would drift out of schema/telemetry compatibility and fail exactly when needed. **Instead: one file, `SCRAPER_TRANSPORT=http|browser|auto`.** Both paths share the DB writes, queue handling, `enriched_status` derivation and telemetry, and both stay under `npm run test:py`. A fallback that is exercised is a fallback that works. Spec 44 records the decision and its reason.

## Technical Implementation
* **`HttpTransport`** — curl_cffi `Session(impersonate='chrome')`, proxied through the SAME relay the browser uses (so the cost blocklist and per-host byte accounting still apply) or direct upstream when no relay. Cold: no warm-up navigation (proven unnecessary).
* **`fetch_permit_chain_http()`** — mirrors `fetch_permit_chain()`'s return contract exactly (`{properties, folders, results}` / `{waf_blocked: True, ...}`) so **every downstream consumer is untouched**: `scrape_year_sequence`'s DB writes, the outcome taxonomy, `compute_enriched_status`, the queue, telemetry.
* **G1 fence honoured:** `fetch_permit_chain` (browser) is **NOT refactored**. The HTTP path is a parallel implementation issuing the same four requests; a lock asserts both transports target identical URLs/bodies.
* **Headers:** the same-origin XHR set (`Referer`, `Origin`, `Sec-Fetch-Site: same-origin/Mode: cors/Dest: empty`, `X-Requested-With`). **Never hand-roll `Accept-Encoding`** — its absence was measured as an instant-403 tripwire; curl sets a correct one.
* **Validation by SHAPE, never status code** — Akamai's documented anti-scraper mode is a 200 with hollow fields.
* **Egress proof still mandatory** when proxying: `HttpTransport` verifies exit IP ≠ host IP before the first portal call (the C5 invariant, unchanged in spirit).
* **Rotation:** no bootstrap cost means rotation is free ⇒ small batches, aggressive session rotation. Batch size stops being a byte knob and becomes purely a reputation knob.
* **Database Impact:** NO.

## Standards Compliance
* **Try-Catch Boundary:** transport failures classify (`waf_blocked` / `fetch_error`) and flow through the existing retry path; no new bootstrap-fatal raise on the default path.
* **Unhappy Path Tests:** transport gate defaults · both transports issue identical request contracts · shape validation rejects a hollow 200 · a 403/Access-Denied body classifies `waf_blocked`, never "no stages" · proxied HTTP refuses to run unverified · `no_stages` still stamps `last_scraped_at`.
* **logError Mandate:** N/A (Python) — structured `log()`.
* **UI Layout:** N/A.

## Execution Plan
- [ ] 1. `HttpTransport` + `fetch_permit_chain_http` + `SCRAPER_TRANSPORT` gate (default `browser`, so the attested local path is unchanged)
- [ ] 2. Dispatch in `scrape_year_sequence`; HTTP-mode loop in `main()` that skips all browser bootstrap
- [ ] 3. `curl_cffi` in `scripts/requirements.txt` (pinned)
- [ ] 4. pytest locks (above) + full `npm run test`
- [ ] 5. Local proof through the proxy vs known-stage permits; compare rows to the browser path
- [ ] 6. Workflow pins `SCRAPER_TRANSPORT=http`; cloud dispatch; measure bytes/permit + requests-to-block
- [ ] 7. Spec 44 truth-up (transport contract + the fallback decision)
- [ ] 8. **PANEL** (Spec 08 output roster) — then merge decision for the whole branch
