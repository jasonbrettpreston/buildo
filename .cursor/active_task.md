# Active Task: Stealth hardening — 6 anti-detection improvements for nodriver scraper
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `31c18da`

## Context
* **Goal:** Implement 6 stealth techniques identified by WF5 research to reduce WAF detection risk for the AIC inspection scraper.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:** `scripts/aic-scraper-nodriver.py`

## Technical Implementation

### Enhancement 1: Fix headless screen dimensions (HIGH impact)
Nodriver in headless mode reports `screen.width/height` as 800x600 regardless of `--window-size`. Inject `Object.defineProperty` overrides for `screen.width`, `screen.height`, `screen.availWidth`, `screen.availHeight` to match the chosen viewport after page load in `bootstrap_session()`.

### Enhancement 2: `--disable-blink-features=AutomationControlled` (MED impact)
Add browser flag to suppress `cdc_` prefixed variables Chrome injects under CDP control. Single line in `browser_args` inside `bootstrap_session()`.

### Enhancement 3: Persistent `user_data_dir` per worker (MED impact)
Pass `user_data_dir` to `uc.start()` so cookies/localStorage persist across runs. Use one profile dir per worker ID (`~/.buildo-scraper/profile-{worker_id}`). Reuse cookies between batches instead of fresh profile every launch.

### Enhancement 4: Coherent fingerprint profiles (MED impact)
Replace independent random viewport + UA selection with paired profile tuples. Each tuple maps: `(viewport_w, viewport_h, platform, user_agent_suffix)`. Ensures mobile UA never pairs with desktop viewport.

### Enhancement 5: Rotate proxy on WAF block instead of timer (MED impact)
Tie session rotation to `waf_trap_count` detection (already partially done — WAF_TRAP_THRESHOLD triggers re-bootstrap). Enhance: also rotate proxy session on the re-bootstrap, not just restart Chrome. Remove the fixed `SESSION_REFRESH_INTERVAL=200` timer rotation for proxy mode (it's already disabled, but make intent explicit).

### Enhancement 6: Shuffle permit batch order (LOW impact)
`random.shuffle(year_seqs)` before processing in standalone mode. Sequential patterns are bot-like.

## Standards Compliance
* **Try-Catch Boundary:** N/A — Python script, not API route
* **Unhappy Path Tests:** Test preflight check still passes with new browser args; test screen dimension override
* **logError Mandate:** N/A — Python uses `log()` helper
* **Mobile-First:** N/A — no UI changes

## Execution Plan
- [ ] **State Verification:** Current scraper works, stealth preflight passes
- [ ] **Contract Definition:** N/A — no API changes
- [ ] **Spec Update:** N/A — spec already covers stealth in §3.7
- [ ] **Schema Evolution:** N/A — no DB changes
- [ ] **Guardrail Test:** Add preflight check for screen dimensions + cdc_ absence to `preflight_stealth_check()`
- [ ] **Red Light:** Run preflight with current code → new checks should show screen mismatch in headless
- [ ] **Implementation:**
  - [ ] Enhancement 1: Screen dimension JS injection in `bootstrap_session()`
  - [ ] Enhancement 2: `--disable-blink-features=AutomationControlled` in browser_args
  - [ ] Enhancement 3: `user_data_dir` parameter with per-worker profile dirs
  - [ ] Enhancement 4: Fingerprint profile tuples replacing independent randoms
  - [ ] Enhancement 5: WAF-triggered proxy rotation (already partially done, clarify intent)
  - [ ] Enhancement 6: `random.shuffle(year_seqs)` in standalone mode
- [ ] **UI Regression Check:** N/A
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
