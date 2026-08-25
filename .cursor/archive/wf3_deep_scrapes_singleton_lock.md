# Active Task: WF3 — deep-scrapes: stale Chrome Singleton lock in cache-restored stealth profile aborts all workers
**Status:** Implementation — authorized 2026-07-29 ("proceed"), with user-directed bundle of finding 2 (Chrome ≥137 --load-extension preempt)
**Domain Mode:** Backend/Pipeline
**Note:** written to a dedicated file — `.cursor/active_task.md` is occupied by the Supabase program plan (Status: Implementation).

## Context
* **Goal:** Fix the third deep-scrapes cloud blocker. Run 30487133930 proved the de3ff6dd verdict guard works (job went RED on `preflight_failures` + `zero_attempted_with_pending_queue` exactly as designed), and the AppArmor sysctl step applied cleanly — but Chrome still failed bootstrap 3× in ~3 s each. Root cause (log-verified, not inferred):
  1. Run **30485096998** (first-cron): stealth-profile cache MISS → fresh profile → Chrome started, wrote its `Singleton*` profile-lock files into `~/.buildo-scraper/profile-worker-1`, then AppArmor killed the sandbox → run concluded **false-PASS** (the pre-de3ff6dd masking bug) → `actions/cache` post-step SAVED the crash-contaminated profile ("Cache saved with key: buildo-scraper-profiles-chain-deep-scrapes-30485096998", 2,611 B).
  2. Run **30487133930**: restored that entry via `restore-keys` prefix match → Chrome saw a `SingletonLock` symlink naming another host/PID → exited immediately ("profile appears to be in use by another computer") → nodriver surfaced only its generic "Failed to connect to browser".
  3. Self-perpetuating: the honest verdict now reddens failed runs → their caches never save → every future run keeps prefix-matching the same poisoned entry forever.
  * The workflow's own F8 comment (`.github/workflows/chain-deep-scrapes.yml:81-91`) names "clear this cache" as the first debugging step for a corrupt profile — this WF3 makes that failure mode structurally impossible instead of a runbook step.
* **Target Spec:** `docs/specs/00-architecture/115_scheduling.md` §2.4 (stealth profiles / proxy-forced headed Chrome); workflow SPEC LINKs §2, §3, §4.
* **Key Files:** `scripts/aic-scraper-nodriver.py` (`bootstrap_session()`, ~L343–378).

## Technical Implementation
* **New/Modified Components:** `bootstrap_session()` in `scripts/aic-scraper-nodriver.py` only. No workflow YAML change.
* **Fix:** after `os.makedirs(profile_dir, exist_ok=True)` and BEFORE `uc.start(...)`, remove stale Chrome singleton artifacts from the profile root: `SingletonLock`, `SingletonSocket`, `SingletonCookie` (symlinks/sockets — `os.lstat` + `os.remove`, never follow). A cache-restored profile can never legitimately contain a live lock (locks are only meaningful within the writing host's session); each worker already has its own `profile-worker-{id}` dir, so same-host live collision isn't a concern.
* **Diagnostics (same finding — closes the generic-error blindness that cost two debug round-trips):** INFO log listing which singleton files were removed (`event: stale_profile_lock_removed`), so validation 4's logs prove/disprove the premise directly.
* **Database Impact:** NO.
* **Ops action (post-merge, before validation 4):** delete poisoned cache entry `buildo-scraper-profiles-chain-deep-scrapes-30485096998` (`DELETE /repos/{owner}/{repo}/actions/caches?key=...`). Belt-and-braces: the code fix alone neutralizes it, but a clean miss gives validation 4 a pure test of the AppArmor fix on a fresh profile.

## Standards Compliance
* **Try-Catch Boundary:** per-file try/except around each removal — WARN and continue (an undeletable lock should surface as its own message, then let Chrome produce the real error, not crash bootstrap earlier).
* **Unhappy Path Tests:** no python test harness exists for the scraper (vitest is JS/TS-only); validation is the live re-dispatch below. The per-file except path covers the unhappy branch.
* **logError Mandate:** N/A JS — new messages use the scraper's existing structured JSON log helper, same as adjacent bootstrap logging.
* **UI Layout:** N/A.

## Execution Plan
- [ ] Step 1: Edit `bootstrap_session()` — remove `Singleton{Lock,Socket,Cookie}` from `profile_dir` before `uc.start`, INFO log of removals, per-file WARN on failure.
- [ ] Step 2: `npm run typecheck && npm run lint && npm run test` (pre-commit gate; .py untouched by vitest — expect green, no related tests).
- [ ] Step 3: Lean WF3 output review (per-finding cadence): Regression Guardian on the diff (`git log -p` the profile-dir block — confirm no prior lock-handling fence being retired; block landed with the nodriver migration).
- [ ] Step 4: Commit `fix(115_scheduling): deep-scrapes stale Singleton profile-lock from cache-restored stealth profile aborts Chrome bootstrap` + push.
- [ ] Step 5: Ops — delete cache entry `buildo-scraper-profiles-chain-deep-scrapes-30485096998` via GitHub API.
- [ ] Step 6: Dispatch validation 4; watch bootstrap (expect Chrome launch OK, queue claims > 0, inspections verdict PASS) via run monitor + queue-movement probe.
- [x] Step 7 (PROMOTED to finding 2 by user, 2026-07-29): Chrome ≥137 removed `--load-extension` on branded stable. Severity re-assessed on code read: the MV3 extension does BOTH proxy routing (`chrome.proxy.settings.set`) AND auth — a silently-ignored flag means NO proxy at all (direct datacenter-IP scraping, WAF exposure), not an auth failure, and `preflight_stealth_check` explicitly treats absent extensions as normal. Fix shipped:
  - `--disable-features=IsolateOrigins,site-per-process,DisableLoadExtensionCommandLineSwitch` appended in proxy mode (documented Chrome 137+ opt-out; must repeat nodriver's own disable-features values because nodriver injects `IsolateOrigins,site-per-process` before custom args and Chrome keeps only the LAST occurrence of a repeated switch — Context7-verified against nodriver Config.__call__).
  - `verify_proxy_extension_loaded(browser)` fail-loud tripwire right after `uc.start` (proxy mode only): polls CDP `Target.getTargets` up to 3 s for a `chrome-extension://*/background.js` service-worker target; raises RuntimeError (same bootstrap-fatal path as the DISPLAY guard) rather than ever scraping unproxied. Covers the day Google removes the opt-out.

## Finding 3 (user question, 2026-07-29): python test harness for the scraper?
**Decision: YES, but as its own WF2 — not bundled here.** Rationale: the last three cloud bugs were all in pure-logic seams of this file (`int('')` env parse, exit-0 verdict masking, profile-lock handling) — exactly what a unit harness catches pre-push. But the repo has zero pytest infra (vitest-only): adding it = new dev dependency, CI wiring, conventions decision (pytest vs unittest, where tests live, SPEC LINK header convention for .py) — WF2 scope per feedback_wf3_granularity. This WF3 keeps its new logic harness-ready: `clear_stale_profile_locks` is a pure function; `verify_proxy_extension_loaded` isolates the CDP call. Routed to `docs/reports/review_followups.md`.
