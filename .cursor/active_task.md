# Active Task: Replace MV3 proxy extension with nodriver built-in proxy for headless compatibility
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `4ff6c662` (4ff6c662fb760a859b703d0394db717a983ea6ec)

## Context
* **Goal:** Chrome's `--headless=new` doesn't support `--load-extension`. Our MV3 proxy auth extension silently fails in headless mode, breaking Decodo proxy auth. Replace with nodriver's built-in proxy support (`browser.create_context(proxy_server=...)`) which handles auth transparently via a local proxy forwarder — works in headless.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `scripts/aic-scraper-nodriver.py` — replace MV3 extension with `create_context` proxy

## Technical Implementation

### Replace MV3 extension with nodriver built-in proxy
- **Remove:** `build_proxy_extension()`, `cleanup_proxy_extension()`, `atexit` registration, `shutil`/`stat` imports, `proxy_ext_dir` parameter threading
- **Add:** Build proxy URL string `http://user-session-{id}:pass@host:port` and pass to `browser.create_context(proxy_server=url)` after `uc.start(headless=True)`
- **How it works:** nodriver detects `user:pass` in the proxy URL, spins up a local forwarder on `127.0.0.1:{random_port}`, Chrome connects to the local forwarder (no auth needed), forwarder handles upstream auth transparently
- **Per-batch rotation:** In db-queue mode, each batch still gets a fresh session ID in the proxy URL. The `create_context` call creates a new browser context with the new proxy.

### Changes to bootstrap_session
```python
async def bootstrap_session(proxy_url=None):
    browser = await uc.start(headless=True)
    if proxy_url:
        page = await browser.create_context(proxy_server=proxy_url)
    else:
        page = await browser.get('about:blank')
    # ... warm bootstrap ...
```

### What gets removed
- `build_proxy_extension()` — ~40 lines
- `cleanup_proxy_extension()` — ~12 lines
- `proxy_ext_dir` parameter on `bootstrap_session`, `bootstrap_with_retry`, `scrape_loop`
- `atexit.register` calls
- `shutil`, `stat` imports
- `.proxy_ext/` directory handling

* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** N/A — proxy is runtime behavior
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** `4ff6c662`
- [x] **State Verification:** Review agent confirmed `--headless=new` + `--load-extension` is incompatible. nodriver's `create_context(proxy_server=...)` works in headless via local forwarder.
- [x] **Spec Review:** §3.9 proxy section needs update to document new approach.
- [ ] **Fix:** Replace MV3 extension with `create_context` proxy. Remove all extension code.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
- [ ] **Live Test:** Single permit through Decodo in headless — no visible Chrome window, proxy auth works.
- [ ] **Spec Audit:** Update §3.9 to document `create_context` approach.
