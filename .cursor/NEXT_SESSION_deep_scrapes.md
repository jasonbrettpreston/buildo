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

**Next: bounded probe** (`max_permits=2 max_retries=1 chain_timeout_minutes=8`) — the logs
should now name the ORIGINAL TypeError's message (the pre-`921536a9` fault, e.g. a blocked
fetch) or simply work. Remember the cancelled-run → `pipeline_runs` stuck-`running` gotcha below.

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
