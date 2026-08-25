# Active Task: WF3 — AIC cloud capture: geo-target Ontario, then A/B browser vs raw-HTTP transport
**Status:** Planning — PLAN LOCK REQUIRED before any `scripts/` change
**Domain Mode:** Backend/Pipeline
**Note:** dedicated file; `.cursor/active_task.md` holds the Supabase program plan.

## Context
* **Goal:** make `chain_deep_scrapes` actually write `permit_inspections` rows from GitHub Actions, at a throughput and cost the operator's proven local setup already achieved (**all ~11K permits turned over once per week on a single Decodo 3 GB plan** — i.e. **~0.3 MB/permit budget**, which is the number to design against).
* **Target Spec:** `docs/specs/00-architecture/115_scheduling.md` §2.4 (amended 2026-07-30) · `docs/specs/01-pipeline/44_chain_deep_scrapes.md` §3. Session-entry rules live in the **recovered Spec 38** (`git show e59cb8b0^:docs/specs/38_inspection_scraping.md`) and were never carried into 44 — restoring them is part of this task.
* **Baseline (operator-confirmed):** cloud execution has **never** worked; the current nodriver scraper is the delivered design and worked **locally, via the operator's Chrome, unproxied**, pre-DB-transition. This is **build-and-prove, not restore-and-diff**.
* **Standing constraint:** do NOT scrap the browser path. Both transports must be testable side by side.

## Ground truth (measured, not inferred)
**G1 — the request chain is CORRECT.** Live recon: `POST /jaxrs/search/properties` → `/folders` → `/detail/{folderRsn}` → `/status/{folderRsn}/{processRsn}`, **no cookies, no session, no CSRF** (step 1 returns 200 from a cold client; the portal's own `as-interface.js` has zero token handling). Do not rewrite it.
**G2 — the blocker is Akamai cumulative client reputation**, not fingerprint-at-launch and not bandwidth: ~12 requests / ~10 min, then everything 403s with a ~430 B HTML page (which `safe_json_parse` reads as `html_or_empty` → `waf_blocked`), clearing after ~5 min idle, sticky. **Measured with curl's TLS fingerprint, so it is a LOWER bound** — the reviewer's claim that it was Chrome-measured is wrong, and the operator reports real Chrome gets substantially more headroom.
**G3 — WE ARE NOT GEO-TARGETING. This is the prime suspect.** `build_proxy_username` emits `user-<account>-session-<id>-sessionduration-<n>` with **no `country-ca`**. Exit IPs drawn today include **186.225.225.102 (Brazil)**, 23.248.100.13, 66.222.176.87. A Toronto municipal portal being hit from Brazil is a strong bot signal and plausibly explains the gap between the operator's local experience and our measured ceiling.
**G4 — data volume is tiny:** ~5.3 KB/permit of pure JSON (147 + 1,070 + 3,796 + 281 B); `setup.do` alone is 75,885 B (14× the data chain) and appears unnecessary. Step 3 already embeds `folderProcessAttempts[]`, so **step 4 may be skippable** — a 25% cut in the scarce resource.
**G5 — proven economics:** 3 GB/week ÷ ~11K permits ≈ **0.3 MB/permit**. At G4's 5.3 KB the data itself is ~0.06 GB/week, so the plan comfortably covers a browser transport IF Chrome's background chatter stays blocked (today's guards) — the 1.76 GB incident was 116 cold browser starts, not scraping.

## Technical Implementation
* **F1 — Geo-target Ontario (do this FIRST; it may be the whole bug).** Add `country-ca` and evaluate `city-toronto` / state targeting to `build_proxy_username`, per Decodo's documented `user-USER-country-xx-city-xxxx-session-VALUE-sessionduration-N` format. Verify the returned exit IP actually geolocates to Ontario before any scrape; fail loud if it does not. Operator has confirmed **unlimited endpoints/IPs are available**, so lane count is not a constraint.
* **F2 — Switchable transport (`SCRAPER_TRANSPORT=browser|http`), nothing deleted.** Keep the browser path exactly as-is; add a raw-HTTP path issuing the same four calls with Chrome-like headers **including `Accept-Encoding` (its absence is an instant 403)**. Both share the queue claiming, upserts, status normalisation and telemetry. This is the A/B the operator asked for.
* **F3 — Per-IP budget governor, shared by both transports.** Rotate the sticky exit IP proactively after **N requests or M minutes**, whichever first (start N≈8, M≈8 — under the measured lower-bound ceiling), rather than reacting after the wall. Distinguish a **403/bot-block** (do not retry in-process; return the item to the queue and rotate) from a **transient network error** (short retry). Already partially landed: `MAX_RETRIES=2`, `RETRY_BASE_MS=90000`, `WAF_TRAP_THRESHOLD=3`, all env-overridable.
* **F4 — Measure the real ceiling per transport.** Instrumented probe recording requests-until-403 and time-to-recovery for: (a) browser + Ontario IP, (b) raw HTTP + Ontario IP, (c) raw HTTP with TLS impersonation (`curl_cffi`). That single number sizes everything below.
* **Database Impact:** NO.

## Standards Compliance
* **Try-Catch Boundary:** transport selection and the geo assertion fail loud (bootstrap-fatal), never silently fall back to an unverified path — a wrong-country exit IP must stop the run, not scrape from Brazil.
* **Unhappy Path Tests** (`npm run test:py`): username carries `country-ca`; geo assertion rejects a non-Ontario IP; budget governor rotates at N requests and at M minutes; a 403 does NOT trigger in-process retry; transport switch selects the right path and an unknown value fails loudly.
* **logError Mandate:** N/A JS — existing structured `log()`.
* **UI Layout:** N/A.

## Execution Plan
- [ ] Step 1: PLAN REVIEW — adversarial + grounder panel on THIS file before code (the day's evidence: unreviewed changes produced a shadow-ban landmine and a ceiling that sabotaged healthy runs).
- [ ] Step 2: F1 geo-targeting + the Ontario assertion, with locks. Re-probe the exit IP locally to confirm Ontario.
- [ ] Step 3: F4(a) — one capped run on the EXISTING browser path with Ontario IPs only. This alone may fix it; it is the cheapest possible test and changes one variable.
- [ ] Step 4: If still blocked, F2 raw-HTTP transport behind the flag + F4(b)/(c) probes.
- [ ] Step 5: F3 budget governor tuned to whichever ceiling F4 measured.
- [ ] Step 6: Review (output altitude) + Regression Guardian on the diff.
- [ ] Step 7: Restore Spec 38's session-entry rules into Spec 44; truth-up 115 §2.4 with the measured ceiling and the geo requirement.

## Open questions for the operator
1. Ontario-only, or Toronto-city-level targeting? City-level narrows the pool (fewer distinct IPs per lane) but looks more native to a municipal portal.
2. Confirm the Decodo plan's concurrent-session limit — F3's lane count is bounded by it, and drain time scales linearly with lanes.
