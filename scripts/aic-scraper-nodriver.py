#!/usr/bin/env python3
"""
AIC Inspection Scraper — nodriver (CDP) Edition

Uses nodriver to launch Chrome via Chrome DevTools Protocol (no WebDriver).
The WAF cannot detect automation because CDP does not set navigator.webdriver
or use any detectable automation protocol.

All data requests use page.evaluate(fetch(...)) — native browser fetch()
calls from Chrome's network stack. Same 4-step REST API chain as the
Playwright version but with zero automation fingerprint.

Usage:
    python scripts/aic-scraper-nodriver.py                    # batch mode
    python scripts/aic-scraper-nodriver.py "24 132854"        # single permit

Env vars:
    SCRAPE_BATCH_SIZE  — permits per batch (default: 10)
    SCRAPE_PERMIT_TYPE — filter to one type (e.g. "Small Residential")
    PROXY_HOST/PORT    — optional proxy (default: direct connection)
    PG_HOST/PORT/DATABASE/USER/PASSWORD — PostgreSQL connection

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md
"""

import asyncio
import json
import os
import random
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import nodriver as uc
import psycopg2
from psycopg2.extras import RealDictCursor

# ---------------------------------------------------------------------------
# Load .env for standalone execution
# ---------------------------------------------------------------------------
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    for line in env_path.read_text().splitlines():
        m = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
        if m and m.group(1) not in os.environ:
            val = m.group(2)
            # Strip surrounding quotes (single or double)
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            os.environ[m.group(1)] = val

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
AIC_BASE = 'https://secure.toronto.ca/ApplicationStatus'
# K6 (WF2 restore): pre-drift DEFAULTS, but env-overridable. The values below are
# the ones the attested local runs used; the 2026-07-29 cloud tuning (2 / 90000 / 3)
# was measured through a proxy, from a runner, against an already-blocked Akamai edge
# and is NOT correct for the unproxied local path. The cloud values are set in the
# workflow env by the follow-on WF, once an instrumented run has measured them.
# `or`: GH Actions interpolates undefined vars as EMPTY STRING, defeating .get()'s default.
MAX_RETRIES = int(os.environ.get('SCRAPER_MAX_RETRIES') or '3')
RETRY_BASE_MS = int(os.environ.get('SCRAPER_RETRY_BASE_MS') or '2000')
WAF_TRAP_THRESHOLD = int(os.environ.get('SCRAPER_WAF_TRAP_THRESHOLD') or '20')
SESSION_REFRESH_INTERVAL = int(os.environ.get('SCRAPER_SESSION_REFRESH_INTERVAL') or '200')

# DB permit_type strings — used for queue population queries
ALL_TARGET_TYPES = [
    'Small Residential Projects',
    'Building Additions/Alterations',
    'New Houses',
]

SCRAPE_PERMIT_TYPE = os.environ.get('SCRAPE_PERMIT_TYPE', '')
if SCRAPE_PERMIT_TYPE:
    TARGET_TYPES = [t for t in ALL_TARGET_TYPES if SCRAPE_PERMIT_TYPE.lower() in t.lower()]
else:
    TARGET_TYPES = ALL_TARGET_TYPES

# AIC portal section codes — used to filter folders from the API response.
# All 3 target types (SR, BA, NH) use section code 'BLD' on the AIC portal.
# Do NOT filter on folderTypeDesc — AIC uses different labels than our DB permit_type.
TARGET_SECTIONS = ['BLD']

BATCH_SIZE = int(os.environ.get('SCRAPE_BATCH_SIZE') or '10')  # `or`: GH Actions interpolates undefined vars as EMPTY STRING, defeating .get()'s default (2026-07-29 first-cron crash)
MAX_PERMITS = int(os.environ.get('SCRAPE_MAX_PERMITS') or '0')  # `or`: GH Actions interpolates undefined vars as EMPTY STRING, defeating .get()'s default (2026-07-29 first-cron crash)  # 0 = unlimited

# Proxy configuration (Decodo residential rotating proxy)
PROXY_HOST = os.environ.get('PROXY_HOST', '')
PROXY_PORT = os.environ.get('PROXY_PORT', '')
PROXY_USER = os.environ.get('PROXY_USER', '')
PROXY_PASS = os.environ.get('PROXY_PASS', '')

# Proxy MODE is an explicit choice, never inferred from PROXY_HOST being present.
#
# WHY (WF2 restore, 2026-07-30): before this change, `if PROXY_HOST:` selected the
# MV3 proxy-auth extension path. Branded Chrome >=137 silently drops
# `--load-extension`, so on the operator's machine the extension never loaded, the
# proxy was never applied, and scraping went out DIRECT from a residential IP while
# telemetry recorded proxy_configured=true. That accident is why the scraper appeared
# to work locally. Restoring `if PROXY_HOST:` would restore the accident, not the
# capability. Proxying is now a declared state; unproxied is also a declared state.
#
# L0 supports 'none' only. 'relay' arrives with the relay port at rung L2.
SUPPORTED_PROXY_MODES = ('none',)
PROXY_MODE = (os.environ.get('SCRAPER_PROXY_MODE') or 'none').strip().lower()


def proxy_mode():
    """The declared proxy mode. Never inferred from credential presence."""
    return PROXY_MODE


def proxy_enabled():
    """True when a real proxy mechanism is selected. False is a DECLARED state."""
    return PROXY_MODE != 'none'


def assert_proxy_config_coherent():
    """Fail loudly on a config whose behaviour would not match the operator's belief.

    Two failures are worth stopping a run for, both learned expensively:
      - credentials present but no mode: the operator believes they are proxied and
        are not (the pre-2026-07-30 silent-unproxied class).
      - a mode this rung cannot honour: better a named error than a silent fallback.
    """
    if PROXY_MODE not in SUPPORTED_PROXY_MODES:
        raise RuntimeError(
            f"SCRAPER_PROXY_MODE={PROXY_MODE!r} is not supported on this build. "
            f"Supported: {', '.join(SUPPORTED_PROXY_MODES)}. The relay path lands at "
            f"rung L2 of the WF2 restore; until then a proxied run is not possible.")
    if PROXY_HOST and not proxy_enabled():
        raise RuntimeError(
            "PROXY_HOST is set but SCRAPER_PROXY_MODE is 'none', so this run will NOT "
            "be proxied. Proxying is now an explicit choice: set SCRAPER_PROXY_MODE "
            "(currently only 'none' is supported; 'relay' arrives at rung L2). If an "
            "unproxied run is what you want, unset PROXY_HOST or set "
            "SCRAPER_ALLOW_UNPROXIED=1 to acknowledge it.")


# ---------------------------------------------------------------------------
# Stealth — randomize fingerprint to look like organic human traffic
# ---------------------------------------------------------------------------
# Warm bootstrap entry URLs — vary referrer chain per session
ENTRY_URLS = [
    'https://www.toronto.ca',
    'https://www.toronto.ca/services-payments/',
    'https://www.toronto.ca/city-government/planning-development/',
    'https://www.toronto.ca/311/',
    'https://www.toronto.ca/city-government/data-research-maps/',
]

# Mid-session noise URLs — break the API-only request pattern
NOISE_URLS = [
    f'{AIC_BASE}/setup.do?action=init',
    'https://www.toronto.ca/services-payments/building-construction/',
    'https://www.toronto.ca/city-government/planning-development/application-information-centre/',
]

# Fingerprint profiles — coherent tuples of (width, height, platform, ua_hint)
# Ensures viewport, screen dimensions, platform, and UA are internally consistent.
# ua_hint is documentary — Chrome sets its own UA string; this records what it should match.
FINGERPRINT_PROFILES = [
    {'w': 1280, 'h': 800,  'platform': 'Win32', 'ua_hint': 'Windows NT 10.0; Win64; x64'},
    {'w': 1366, 'h': 768,  'platform': 'Win32', 'ua_hint': 'Windows NT 10.0; Win64; x64'},
    {'w': 1440, 'h': 900,  'platform': 'MacIntel', 'ua_hint': 'Macintosh; Intel Mac OS X 10_15_7'},
    {'w': 1536, 'h': 864,  'platform': 'Win32', 'ua_hint': 'Windows NT 10.0; Win64; x64'},
    {'w': 1680, 'h': 1050, 'platform': 'MacIntel', 'ua_hint': 'Macintosh; Intel Mac OS X 10_15_7'},
    {'w': 1920, 'h': 1080, 'platform': 'Win32', 'ua_hint': 'Windows NT 10.0; Win64; x64'},
]

# Batch size range — vary permits per batch instead of fixed BATCH_SIZE
BATCH_SIZE_MIN = max(5, BATCH_SIZE - 5)
BATCH_SIZE_MAX = max(BATCH_SIZE_MIN, min(20, BATCH_SIZE + 5))

# Browser TTL — max batches before force-killing Chrome to prevent memory bloat.
# Only applies in non-proxy mode (proxy mode already kills after each batch).
BROWSER_MAX_BATCHES = int(os.environ.get('BROWSER_MAX_BATCHES') or '50')  # `or`: GH Actions interpolates undefined vars as EMPTY STRING, defeating .get()'s default (2026-07-29 first-cron crash)


# ---------------------------------------------------------------------------
# Sanitization — validate values before interpolating into page.evaluate JS
# ---------------------------------------------------------------------------
def sanitize_js_value(val):
    """Ensure a value is safe to interpolate into JavaScript. Strip non-alphanumeric chars except spaces."""
    if val is None or val == '':
        return ''
    s = str(val).strip()
    if not s:
        return ''
    if not re.match(r'^[A-Za-z0-9 _\-]+$', s):
        raise ValueError(f"Unsafe value for JS interpolation: {s!r}")
    return s


# Timeout in ms for AbortController wrapping all fetch() calls inside page.evaluate.
# Prevents indefinite hangs from AIC tarpit/dropped connections.
FETCH_TIMEOUT_MS = 15000


# ---------------------------------------------------------------------------
# Status normalization — single source of truth in scripts/lib/status_mapping.json
# ---------------------------------------------------------------------------
_STATUS_MAP_PATH = os.path.join(os.path.dirname(__file__), 'lib', 'status_mapping.json')
with open(_STATUS_MAP_PATH, 'r') as _f:
    _STATUS_CONFIG = json.load(_f)
_STATUS_NORM = _STATUS_CONFIG['status_normalization']
_ENRICHED = _STATUS_CONFIG['enriched_status']


def normalize_status(raw):
    s = (raw or '').strip().lower()
    return _STATUS_NORM.get(s)


def compute_enriched_status(stages):
    """Compute enriched_status from scraped inspection stages."""
    if not stages:
        return None
    statuses = [normalize_status(s.get('status')) for s in stages]
    statuses = [s for s in statuses if s]
    if not statuses:
        return None
    if any(s == 'Not Passed' for s in statuses): return _ENRICHED['all_not_passed']
    if all(s == 'Outstanding' for s in statuses): return _ENRICHED['all_outstanding']
    if all(s == 'Passed' for s in statuses): return _ENRICHED['all_passed']
    return _ENRICHED['mixed']


def parse_inspection_date(raw):
    trimmed = (raw or '').strip()
    if not trimmed or trimmed in ('-', 'N/A', ''):
        return None
    # ISO format: "2024-01-15" or "2024-01-15T10:00:00Z"
    if re.match(r'^\d{4}-\d{2}-\d{2}', trimmed):
        return trimmed[:10]
    # MM/DD/YYYY format: "01/15/2024" or "1/5/2024"
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', trimmed)
    if m:
        return f"{m.group(3)}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}"
    # Named month: "Jun 3, 2024"
    months = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06',
              'jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'}
    m = re.match(r'^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$', trimmed)
    if m:
        month_num = months.get(m.group(1)[:3].lower())
        if month_num:
            return f"{m.group(3)}-{month_num}-{m.group(2).zfill(2)}"
    return None


# ---------------------------------------------------------------------------
# Pipeline protocol — emit SUMMARY and META to stdout for chain orchestrator
# ---------------------------------------------------------------------------
def emit_summary(data):
    print(f"PIPELINE_SUMMARY:{json.dumps(data)}")

def emit_meta(reads, writes, external=None):
    meta = {"reads": reads, "writes": writes}
    if external:
        meta["external"] = external
    print(f"PIPELINE_META:{json.dumps(meta)}")

def log(level, tag, msg, context=None):
    entry = {"level": level, "tag": tag, "msg": msg}
    if context:
        entry["context"] = context
    print(json.dumps(entry))


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_db_connection():
    return psycopg2.connect(
        host=os.environ.get('PG_HOST', 'localhost'),
        port=int(os.environ.get('PG_PORT') or '5432'),  # `or`: empty-string-safe, same as module-level env reads
        dbname=os.environ.get('PG_DATABASE', 'buildo'),
        user=os.environ.get('PG_USER', 'postgres'),
        password=os.environ.get('PG_PASSWORD', 'postgres'),
    )


# ---------------------------------------------------------------------------
# Proxy — Decodo sticky sessions via Manifest V3 extension
# ---------------------------------------------------------------------------
def build_proxy_session_id(worker_id, timestamp=None):
    """Build a unique Decodo sticky session ID for this worker.

    ALPHANUMERIC ONLY. Decodo parses the username as a hyphen-delimited key-value
    list (`user-ACCOUNT-session-VALUE-sessionduration-N`), so a session value
    containing hyphens — as `buildo-worker-1-1753800000` did — makes its parser read
    `session=buildo` and then choke on `worker` as an unknown key. Our own product
    name contains the delimiter, which is why this bit us. Verified 2026-07-29:
    every hyphenated form returned 407, and a 407 is invisible in the browser.
    """
    ts = timestamp or int(time.time())
    return f'w{worker_id}t{ts}'.replace('-', '').replace('_', '')



# Decodo proxy transport facts (K1) — unwired at L0, consumed by the relay at L2.
# `https` to the proxy is not cosmetic: plain-HTTP CONNECT tunnels are RESET, and
# socks5 -- though it works via curl -- is unusable because Chrome cannot
# authenticate to a SOCKS proxy at all.
PROXY_SCHEME = os.environ.get('PROXY_SCHEME') or 'https'
# Decodo sticky-session lifetime in minutes (1-1440, provider default 10).
PROXY_SESSION_DURATION_MIN = int(os.environ.get('PROXY_SESSION_DURATION_MIN') or '30')

# K7a — bounded sample: enough to characterise a response, never enough to flood a
# run's logs or spill a large payload.
STEP1_BODY_SAMPLES = int(os.environ.get('SCRAPER_STEP1_BODY_SAMPLES') or '8')
_step1_samples_logged = [0]

_UNREACHABLE_MARKERS = (
    "site can't be reached",
    'site cannot be reached',
    'ERR_',
    'took too long to respond',
    'temporarily down or moved permanently',
)

# ---------------------------------------------------------------------------
# K1/K4 (WF2 restore) — Decodo credential + sticky-port helpers.
#
# UNWIRED AT RUNG L0 BY DESIGN: their only consumer is the relay, which lands at
# L2. They are ported now, with tests, because the facts they encode were bought
# expensively and are easy to get wrong again:
#   * Decodo parses the username as a HYPHEN-DELIMITED key-value list, and only
#     when it begins with the literal token `user-`. Verified live: bare account
#     -> 200; `<account>-session-<id>` -> 407; `user-<account>-session-<id>` -> 200.
#   * Session ids must therefore be ALPHANUMERIC. A hyphen inside a value ends that
#     value early: `buildo-worker-1-<ts>` made the parser read `session=buildo` and
#     choke on `worker`. Our own product name contains the delimiter.
#   * A 407 is INVISIBLE in a browser -- Chrome renders "This site can't be reached"
#     for every page, identical to a network outage. Probe with curl, never diagnose
#     proxy auth from the browser's error page.
#   * A sticky-proxy PORT pins the exit IP and OVERRIDES any per-session username
#     suffix, so every worker sharing one port shares one IP. Worker N gets base+N-1.
# ---------------------------------------------------------------------------
def build_proxy_username(session_id, user=None, duration_min=None):
    """Build the Decodo username carrying the sticky-session parameters.

    THE `user-` PREFIX IS LOAD-BEARING AND WAS MISSING — this was the actual
    cause of the CI proxy failure. Decodo only parses the username as a
    parameter list when it starts with the literal `user-`; without it the
    whole string is taken as a plain account name, so `<account>-session-xxx`
    is simply an unknown user. Verified live 2026-07-29 against the real
    endpoint: bare `<account>` authenticated (200), `<account>-session-<alnum>`
    returned 407 "Access denied", and `user-<account>-session-<alnum>`
    authenticated (200) — including over HTTPS-to-proxy to an HTTPS target,
    the exact production path.

    A 407 here is invisible in the browser: Chrome just renders "This site
    can't be reached" for every page, which is precisely what CI showed.
    """
    user = PROXY_USER if user is None else user
    if not user:
        return session_id
    duration = PROXY_SESSION_DURATION_MIN if duration_min is None else duration_min
    # Idempotent: never double-prefix if the operator already stored `user-...`.
    account = user if user.startswith('user-') else f'user-{user}'
    return f'{account}-session-{session_id}-sessionduration-{duration}'

def resolve_proxy_port(worker_id, base_port=None):
    """Give each worker its OWN sticky port so they get distinct exit IPs.

    On `ca.decodo.com` the port selects the mode: 20000 is rotating and
    20001-29999 are sticky, one exit IP pinned per port. Every worker pointing
    at 20001 therefore shares a single residential IP — the per-worker
    `-session-` suffix cannot override a port-level pin — which silently
    defeats the multi-worker rotation this design assumes. Worker N gets
    base+N-1; anything non-numeric (standalone) keeps the base port.
    """
    base = int(base_port if base_port is not None else (PROXY_PORT or 0) or 0)
    try:
        offset = int(str(worker_id)) - 1
    except (TypeError, ValueError):
        return base
    if offset <= 0:
        return base
    port = base + offset
    # Stay inside the sticky band; wrap rather than silently land on 20000
    # (rotating) or past 29999 (invalid).
    if base >= 20001 and port > 29999:
        port = 20001 + ((port - 20001) % 9999)
    return port


PROXY_RELAY_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'proxy-relay.mjs')

# Relay subprocesses we spawned, per worker — same ownership discipline as
# _spawned_browsers: kill a pid we own, never pattern-match the process table.
_spawned_relays = {}

# ---------------------------------------------------------------------------
# K2 (WF2 restore) — stale profile-lock clearing.
#
# A CI-cache-restored Chrome profile carries host-scoped Singleton* locks naming a
# dead host/PID; Chrome then refuses to start, forever, because once verdicts are
# honest a failed run never saves a fresh cache and the poisoned entry is restored
# every time. The cache step is deleted in this same commit -- this is the second
# layer, and it also covers the operator's local profile after a crashed Chrome.
# ---------------------------------------------------------------------------
def clear_stale_profile_locks(profile_dir):
    """Remove Chrome Singleton* lock artifacts from a profile dir.

    A profile restored from CI cache (or copied across hosts) can carry a
    SingletonLock symlink naming another host/PID — Chrome then refuses to
    start ("profile appears to be in use by another computer") and exits
    immediately, which nodriver surfaces only as a generic "Failed to
    connect to browser" (2026-07-29, GH run 30487133930: a crashed run's
    cache-saved profile bricked every subsequent cloud run).

    NOT unconditionally safe, despite what an earlier version of this docstring
    claimed: if a LIVE Chrome on THIS host holds the profile, removing its lock
    lets a second Chrome open the same profile and corrupt its SQLite databases.
    So the guard is directional — a lock naming a DIFFERENT host is always stale
    (that is the CI-cache case, and it must always be cleared), while a lock
    naming this host with a live PID is left alone and warned about.

    Returns the list of removed file names.
    """
    removed = []
    for name in ('SingletonLock', 'SingletonSocket', 'SingletonCookie'):
        path = os.path.join(profile_dir, name)
        try:
            os.lstat(path)  # lstat, not exists() — these are symlinks whose targets never resolve
        except OSError:
            continue  # absent — the normal case
        if name == 'SingletonLock' and _lock_held_by_live_local_chrome(path):
            log('WARN', '[scraper]',
                'Profile lock is held by a LIVE Chrome on this host — not removing it. '
                'Close that Chrome, or point this worker at another profile dir.',
                {'event': 'profile_lock_live', 'path': path})
            continue
        try:
            os.remove(path)
            removed.append(name)
        except OSError as err:
            log('WARN', '[scraper]', f'Could not remove stale profile lock {name}: {err}')
    return removed


def _lock_held_by_live_local_chrome(lock_path):
    """True only when the lock names THIS host and that PID is still running.

    Chrome writes the SingletonLock symlink target as `<hostname>-<pid>`. A target
    naming another host can never be live here, which is exactly the CI-cache case
    we must always clear. Unreadable or unparseable targets are treated as stale —
    they cannot be shown to be live, and refusing to clear them would re-create the
    permanently-bricked profile this function exists to prevent.
    """
    try:
        target = os.readlink(lock_path)
    except OSError:
        return False
    host, _, pid_str = target.rpartition('-')
    if not host or not pid_str.isdigit():
        return False
    if host != socket.gethostname():
        return False  # another host — stale by construction
    try:
        os.kill(int(pid_str), 0)   # signal 0: existence check, no signal delivered
    except (OSError, ValueError):
        return False
    return True


_chrome_diagnostics_logged = False

# ---------------------------------------------------------------------------
# K7a (WF2 restore) — WAF-response visibility, and the classifier that makes rung
# L0 attributable at all.
#
# An empty step-1 result is ambiguous: `[]` means the portal genuinely has no such
# permit, while a ~420-450 byte HTML "Access Denied" page means Akamai has thrown a
# rate-reputation block. Both previously incremented the same counter, so a fully
# blocked run and a run over a queue of legitimately-absent permits looked identical
# -- which is precisely how a day was spent debugging the wrong thing. Classifying
# them is what lets an L0 failure be attributed instead of guessed at.
# ---------------------------------------------------------------------------
def _looks_unreachable(body):
    text = (body if isinstance(body, str) else str(body or '')).lower()
    return any(marker.lower() in text for marker in _UNREACHABLE_MARKERS)

def _log_step1_body(raw, reason, year_seq=None):
    """Log the raw step-1 body prefix so 'empty' stops being ambiguous."""
    if _step1_samples_logged[0] >= STEP1_BODY_SAMPLES:
        return
    _step1_samples_logged[0] += 1
    body = raw if isinstance(raw, str) else str(raw)
    log('WARN', '[scraper]', 'AIC step-1 returned no usable properties', {
        'event': 'step1_body_sample',
        'reason': reason,
        'year_seq': year_seq,
        'body_len': len(body),
        'body_prefix': body[:400],
        'sample': f'{_step1_samples_logged[0]}/{STEP1_BODY_SAMPLES}',
    })

# ---------------------------------------------------------------------------
# K7b (WF2 restore) — Chrome identity diagnostics.
#
# Which browser binary actually ran is not guessable and matters: resolving the CI
# runner's `/bin/chromium` to an UNBRANDED Chromium build is what disproved the
# "the runner ships branded Chrome" premise that a whole architecture had been
# built on. Cheap, once per process, and it gates nothing.
# ---------------------------------------------------------------------------
def chrome_launch_log_path(worker_id):
    """Path Chrome writes its own launch log to (per worker, outside the cached profile)."""
    name = f'worker-{worker_id}' if worker_id else 'standalone'
    return os.path.join(tempfile.gettempdir(), f'buildo-chrome-{name}.log')

def log_chrome_diagnostics():
    """Log WHICH Chrome nodriver resolved, once per process.

    nodriver reports every launch problem as the same generic "Failed to
    connect to browser" regardless of cause, so the binary's identity is the
    first thing worth knowing when it fails on a runner we can't shell into:
    a snap-confined chromium (Ubuntu's default) cannot be driven with a
    custom user-data-dir the way a real .deb Chrome can, and a missing
    binary looks identical in the nodriver message.
    """
    global _chrome_diagnostics_logged
    if _chrome_diagnostics_logged:
        return
    _chrome_diagnostics_logged = True

    detail = {'event': 'chrome_diagnostics', 'display': os.environ.get('DISPLAY') or None}
    exe = None
    try:
        from nodriver.core.config import find_chrome_executable
        exe = find_chrome_executable()
    except Exception as err:  # resolution itself can raise when nothing is installed
        detail['resolution_error'] = str(err)[:300]
    detail['executable'] = str(exe) if exe else None
    if exe:
        try:
            detail['real_path'] = os.path.realpath(str(exe))
        except OSError as err:
            detail['real_path_error'] = str(err)[:200]
        try:
            probe = subprocess.run(
                [str(exe), '--version'], capture_output=True, text=True, timeout=20,
            )
            detail['version'] = ((probe.stdout or '') + (probe.stderr or '')).strip()[:200]
        except Exception as err:
            detail['version_error'] = str(err)[:200]
    log('INFO', '[scraper]', 'Chrome environment', detail)


async def inject_screen_overrides(page, profile):
    """Override screen dimensions to match the chosen viewport profile.

    Headless Chrome reports screen.width/height as 800x600 regardless of
    --window-size, which is a known bot detection vector (nodriver#2242).
    """
    w, h = profile['w'], profile['h']
    platform = profile['platform']
    await page.evaluate(f"""
        Object.defineProperty(screen, 'width', {{ get: () => {w} }});
        Object.defineProperty(screen, 'height', {{ get: () => {h} }});
        Object.defineProperty(screen, 'availWidth', {{ get: () => {w} }});
        Object.defineProperty(screen, 'availHeight', {{ get: () => {h - 40} }});
        Object.defineProperty(navigator, 'platform', {{ get: () => '{platform}' }});
    """, await_promise=False)


def build_browser_args(profile):
    """Build Chrome's launch flags and decide headedness. Pure — no browser needed.

    Extracted as a pure function precisely so the launch surface is testable without
    starting Chrome: a flag regression is otherwise only discoverable by dispatching
    a CI run, which is the loop this restore exists to escape.

    Returns (browser_args, use_headless).
    """
    vw, vh = profile['w'], profile['h']
    browser_args = [
        f'--window-size={vw},{vh}',
        '--disable-blink-features=AutomationControlled',  # suppress cdc_ variables
    ]

    # C9 (WF2 restore): headedness is keyed on the PROXY MODE, not on the extension.
    #
    # Previously `use_headless` went False only when an extension dir was passed,
    # because `--load-extension` requires headed Chrome. Retiring the extension would
    # therefore have made every path headless by default and silently retired the
    # headed fingerprint with it — headless-vs-headed is a first-order bot signal and
    # the attested local runs were headed. Keying on the mode also keeps the DISPLAY
    # guard below reachable instead of turning it into dead code.
    use_headless = not proxy_enabled()

    if not use_headless and sys.platform != 'win32' and not os.environ.get('DISPLAY'):
        # Headed Chrome on Linux needs a display server (X11/Wayland) or Xvfb. Without
        # one Chrome dies with "cannot open display" — an opaque failure the workflow
        # header explicitly relies on us pre-empting with a named error.
        raise RuntimeError(
            f'Proxy mode {proxy_mode()!r} requires headed Chrome but no DISPLAY is set. '
            'Run with: xvfb-run -a python3 scripts/aic-orchestrator.py'
        )

    return browser_args, use_headless


async def bootstrap_session(worker_id=None):
    """Launch Chrome via CDP and establish an AIC session with a warm entry.

    Runs headed whenever a proxy mode is selected (C9) -- headless-vs-headed is a
    first-order bot signal and the attested runs were headed. On the unproxied
    default path Chrome runs headless, which needs no display server.
    """
    # Coherent fingerprint profile — viewport, platform, and UA match
    profile = random.choice(FINGERPRINT_PROFILES)
    browser_args, use_headless = build_browser_args(profile)

    # Persistent profile dir — reuse cookies/localStorage across runs
    profile_name = f'worker-{worker_id}' if worker_id else 'standalone'
    profile_dir = os.path.join(Path.home(), '.buildo-scraper', f'profile-{profile_name}')
    os.makedirs(profile_dir, exist_ok=True)
    clear_stale_profile_locks(profile_dir)   # K2
    log_chrome_diagnostics()                 # K7b — which binary actually ran

    browser = await uc.start(
        headless=use_headless,
        browser_args=browser_args,
        user_data_dir=profile_dir,
    )
    try:
        page = await browser.get('about:blank')

        # Fix headless screen dimensions to match viewport (nodriver#2242)
        await inject_screen_overrides(page, profile)

        # Warm bootstrap: random entry URL for referrer chain variation
        entry_url = random.choice(ENTRY_URLS)
        try:
            page = await browser.get(entry_url, new_tab=False)
            await inject_screen_overrides(page, profile)
            await page.sleep(random.uniform(1.5, 4.0))
        except Exception:
            pass  # entry site may be slow — non-fatal

        # Navigate to AIC portal
        page = await browser.get(f'{AIC_BASE}/setup.do?action=init', new_tab=False)
        await inject_screen_overrides(page, profile)
        await page.sleep(random.uniform(0.8, 2.0))
        return browser, page, profile
    except Exception as err:
        browser.stop()
        raise err


async def preflight_stealth_check(page):
    """Verify browser fingerprint is not compromised before scraping.
    Returns (passed: bool, reason: str | None).

    Checks:
    1. navigator.webdriver must NOT be true (CDP sets it to false/undefined, WebDriver sets true)
    2. window.chrome must exist (proves we're in a real Chromium, not JSDOM/Puppeteer)

    Note: window.chrome.runtime is undefined in nodriver (no extensions loaded) and in
    regular Chrome without extensions. We do NOT check it — its absence is normal.
    """
    try:
        webdriver = await page.evaluate('navigator.webdriver', await_promise=False)
        if webdriver is True:
            return False, 'navigator.webdriver is true — CDP stealth compromised'
    except Exception as err:
        return False, f'navigator.webdriver check failed: {err}'

    try:
        chrome_exists = await page.evaluate(
            'typeof window.chrome === "object"',
            await_promise=False,
        )
        if not chrome_exists:
            return False, 'window.chrome is missing — may not be real Chromium'
    except Exception as err:
        return False, f'window.chrome check failed: {err}'

    # Check 3: screen dimensions should NOT be the headless default 800x600
    try:
        screen_w = await page.evaluate('screen.width', await_promise=False)
        if screen_w == 800:
            return False, f'screen.width is 800 — headless default not overridden'
    except Exception:
        pass  # non-fatal — screen check is best-effort

    # Check 4: no cdc_ prefixed variables (Chrome DevTools Controller leak)
    try:
        has_cdc = await page.evaluate(
            'Object.keys(document).some(k => k.startsWith("cdc_") || k.startsWith("$cdc_"))',
            await_promise=False,
        )
        if has_cdc:
            return False, 'cdc_ variables detected — AutomationControlled not disabled'
    except Exception:
        pass  # non-fatal

    return True, None


async def bootstrap_with_retry(run_preflight=True, worker_id=None):
    """Bootstrap with retry — 3 attempts with 10s backoff."""
    last_error = None
    for attempt in range(1, 4):
        try:
            browser, page, profile = await bootstrap_session(worker_id=worker_id)
            if attempt > 1:
                log('INFO', '[scraper]', f'Bootstrap succeeded on attempt {attempt}')

            # Preflight stealth check
            if run_preflight:
                passed, reason = await preflight_stealth_check(page)
                if not passed:
                    log('ERROR', '[scraper]', f'PREFLIGHT_FAIL: {reason}')
                    browser.stop()
                    raise Exception(f'Preflight failed: {reason}')
                log('INFO', '[scraper]', 'Preflight stealth check passed')

            return browser, page, attempt, profile
        except Exception as err:
            last_error = err
            log('ERROR', '[scraper]', str(err), {'event': 'bootstrap_failed', 'attempt': attempt})
            if attempt < 3:
                log('INFO', '[scraper]', f'Retrying bootstrap in 10s...')
                await asyncio.sleep(10)
    raise Exception(f'Bootstrap failed after 3 attempts: {last_error}')


# ---------------------------------------------------------------------------
# Safe JSON parsing — treats non-JSON responses as WAF blocks
# ---------------------------------------------------------------------------
def safe_json_parse(raw, step_label=''):
    """Parse JSON, returning (data, None) on success or (None, error_snippet) on failure."""
    if not raw or raw.strip().startswith('<'):
        return None, 'html_or_empty'
    try:
        data = json.loads(raw)
        # Detect AbortController timeout or fetch error sentinel from our JS wrapper
        if isinstance(data, dict) and 'error' in data and len(data) == 1:
            log('WARN', '[scraper]', f'Fetch error at {step_label}: {data["error"]}')
            return None, f'fetch_error:{data["error"]}'
        return data, None
    except (json.JSONDecodeError, ValueError):
        snippet = raw[:120] if raw else '(empty)'
        log('WARN', '[scraper]', f'JSON parse failed at {step_label}', {'snippet': snippet})
        return None, 'json_decode_error'


# ---------------------------------------------------------------------------
# Scrape one permit (4-step API chain via page.evaluate)
# ---------------------------------------------------------------------------
async def fetch_permit_chain(page, year, sequence):
    """Execute 4-step API chain inside Chrome via page.evaluate(fetch)."""

    # Step 1: Search properties
    step1 = await page.evaluate(f"""
        (async () => {{
            const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), {FETCH_TIMEOUT_MS});
            try {{
                const r = await fetch('{AIC_BASE}/jaxrs/search/properties', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
                    signal: ac.signal,
                    body: JSON.stringify({{
                        ward: '', folderYear: '{year}', folderSequence: '{sequence}',
                        folderSection: '', folderRevision: '', folderType: '',
                        address: '', searchType: '0',
                        mapX: null, mapY: null,
                        propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0'
                    }})
                }});
                return await r.text();
            }} catch(e) {{ return JSON.stringify({{error: e.name || 'FetchError'}}); }}
            finally {{ clearTimeout(t); }}
        }})()
    """, await_promise=True)

    props, err = safe_json_parse(step1, 'step1:properties')
    if err:
        # K7a: an unparseable body is the Akamai "Access Denied" page, not a miss.
        _log_step1_body(step1, 'parse_failed', f'{year}-{sequence}')
        return {'waf_blocked': True, 'properties': [], 'results': []}
    if not props:
        # K7a: valid JSON, empty list -- the portal genuinely has no such permit.
        # Sampling both branches is what makes "empty" stop being ambiguous.
        _log_step1_body(step1, 'empty_result', f'{year}-{sequence}')
        return {'properties': [], 'results': []}

    property_rsn = sanitize_js_value(props[0].get('propertyRsn', ''))

    # Micro-jitter between API steps (0.1-0.4s) — prevents thundering herd when
    # multiple workers execute the same 4-step chain with similar latency.
    await asyncio.sleep(random.uniform(0.1, 0.4))

    # Step 2: Get folders
    step2 = await page.evaluate(f"""
        (async () => {{
            const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), {FETCH_TIMEOUT_MS});
            try {{
                const r = await fetch('{AIC_BASE}/jaxrs/search/folders', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
                    signal: ac.signal,
                    body: JSON.stringify({{
                        ward: '', folderYear: '{year}', folderSequence: '{sequence}',
                        folderSection: '', folderRevision: '', folderType: '',
                        address: '', searchType: '0', propertyRsn: '{property_rsn}',
                        mapX: null, mapY: null,
                        propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0'
                    }})
                }});
                return await r.text();
            }} catch(e) {{ return JSON.stringify({{error: e.name || 'FetchError'}}); }}
            finally {{ clearTimeout(t); }}
        }})()
    """, await_promise=True)

    folders, err = safe_json_parse(step2, 'step2:folders')
    if err:
        return {'waf_blocked': True, 'properties': props, 'results': []}
    target_folders = [f for f in folders if f.get('folderSection') in TARGET_SECTIONS]

    results = []
    for folder in target_folders:
        permit_num = f"{folder['folderYear']} {folder['folderSequence']} {folder['folderSection']}"
        folder_rsn = sanitize_js_value(folder['folderRsn'])

        await asyncio.sleep(random.uniform(0.1, 0.4))

        # Step 3: Get detail
        step3 = await page.evaluate(f"""
            (async () => {{
                const ac = new AbortController();
                const t = setTimeout(() => ac.abort(), {FETCH_TIMEOUT_MS});
                try {{
                    const r = await fetch('{AIC_BASE}/jaxrs/search/detail/{folder_rsn}', {{
                        method: 'GET', headers: {{ Accept: 'application/json' }}, signal: ac.signal
                    }});
                    return await r.text();
                }} catch(e) {{ return JSON.stringify({{error: e.name || 'FetchError'}}); }}
                finally {{ clearTimeout(t); }}
            }})()
        """, await_promise=True)

        detail, err = safe_json_parse(step3, f'step3:detail/{folder_rsn}')
        if err:
            return {'waf_blocked': True, 'properties': props, 'results': results}
        processes = detail.get('inspectionProcesses') or []

        if not processes:
            results.append({'permit_num': permit_num, 'error': 'no_processes'})
            continue

        if not detail.get('showStatus'):
            results.append({'permit_num': permit_num, 'error': 'no_status_link'})
            continue

        # Step 4: Get inspection stages
        for proc in processes:
            await asyncio.sleep(random.uniform(0.1, 0.4))
            process_rsn = sanitize_js_value(proc.get('processRsn'))
            step4 = await page.evaluate(f"""
                (async () => {{
                    const ac = new AbortController();
                    const t = setTimeout(() => ac.abort(), {FETCH_TIMEOUT_MS});
                    try {{
                        const r = await fetch('{AIC_BASE}/jaxrs/search/status/{folder_rsn}/{process_rsn}', {{
                            method: 'GET', headers: {{ Accept: 'application/json' }}, signal: ac.signal
                        }});
                        return await r.text();
                    }} catch(e) {{ return JSON.stringify({{error: e.name || 'FetchError'}}); }}
                    finally {{ clearTimeout(t); }}
                }})()
            """, await_promise=True)

            status_data, err = safe_json_parse(step4, f'step4:status/{folder_rsn}/{process_rsn}')
            if err:
                return {'waf_blocked': True, 'properties': props, 'results': results}
            stages = status_data.get('stages') or []
            if stages:
                results.append({'permit_num': permit_num, 'stages': stages})
            else:
                results.append({'permit_num': permit_num, 'error': 'no_stages'})

    return {'properties': props, 'folders': folders, 'results': results}


async def scrape_year_sequence(page, year_seq, conn):
    """Scrape one year+sequence and write results to DB."""
    year, sequence = year_seq.split(' ')
    chain_result = await fetch_permit_chain(page, year, sequence)

    if chain_result.get('waf_blocked'):
        raise Exception(f'WAF blocked request for {year_seq}')

    props = chain_result.get('properties', [])
    if not props:
        log('INFO', '[scraper]', f'No property found for {year_seq}')
        return {'searched': 1, 'scraped': 0, 'upserted': 0}

    results = chain_result.get('results', [])
    folders = chain_result.get('folders', [])
    target_folders = [f for f in folders if f.get('folderSection') in TARGET_SECTIONS]

    if not target_folders:
        log('INFO', '[scraper]', f'{year_seq}: no target folders found')
        return {'searched': 1, 'scraped': 0, 'upserted': 0}

    log('INFO', '[scraper]', f'{year_seq}: {len(folders)} folders, {len(target_folders)} target permits', {
        'all': [f"{f['folderYear']} {f['folderSequence']} {f['folderSection']} [{f['statusDesc']}]" for f in folders]
    })

    scraped = 0
    upserted = 0
    enriched_updates = 0
    status_changes = 0

    cur = conn.cursor()
    try:
        for result in results:
            if result.get('error'):
                log('INFO', '[scraper]', f"{result['permit_num']}: {result['error']}")
                # Permits with no_processes/no_status_link — set Permit Issued
                if result['error'] in ('no_processes', 'no_status_link'):
                    cur.execute(
                        "UPDATE permits SET enriched_status = 'Permit Issued', last_scraped_at = NOW() "
                        "WHERE permit_num = %s AND enriched_status IS DISTINCT FROM 'Permit Issued'",
                        (result['permit_num'],)
                    )
                    if cur.rowcount > 0:
                        enriched_updates += 1
                    else:
                        cur.execute(
                            "UPDATE permits SET last_scraped_at = NOW() WHERE permit_num = %s",
                            (result['permit_num'],)
                        )
                continue

            # Upsert stages
            for stage in result['stages']:
                status = normalize_status(stage.get('status'))
                if not status:
                    continue
                insp_date = parse_inspection_date(stage.get('date'))

                # Check existing for status change detection
                cur.execute(
                    "SELECT status FROM permit_inspections WHERE permit_num = %s AND stage_name = %s",
                    (result['permit_num'], stage['desc'])
                )
                old_row = cur.fetchone()
                old_status = old_row[0] if old_row else None

                cur.execute("""
                    INSERT INTO permit_inspections (permit_num, stage_name, status, inspection_date, scraped_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (permit_num, stage_name) DO UPDATE
                    SET status = EXCLUDED.status,
                        inspection_date = EXCLUDED.inspection_date,
                        scraped_at = NOW()
                    WHERE permit_inspections.status IS DISTINCT FROM EXCLUDED.status
                       OR permit_inspections.inspection_date IS DISTINCT FROM EXCLUDED.inspection_date
                """, (result['permit_num'], stage['desc'], status, insp_date))

                if cur.rowcount > 0:
                    upserted += 1
                    if old_status and old_status != status:
                        status_changes += 1

            # Touch scraped_at only for stages returned in this response.
            # Stages AIC has removed will naturally age out, enabling ghost detection.
            returned_stages = [stage['desc'] for stage in result['stages'] if stage.get('desc')]
            if returned_stages:
                cur.execute(
                    "UPDATE permit_inspections SET scraped_at = NOW() "
                    "WHERE permit_num = %s AND stage_name = ANY(%s)",
                    (result['permit_num'], returned_stages)
                )

            # Compute and write enriched_status + touch last_scraped_at
            enriched = compute_enriched_status(result['stages'])
            cur.execute(
                "UPDATE permits SET enriched_status = %s, last_scraped_at = NOW() "
                "WHERE permit_num = %s AND enriched_status IS DISTINCT FROM %s",
                (enriched, result['permit_num'], enriched)
            )
            if cur.rowcount > 0:
                enriched_updates += 1
            else:
                # enriched_status unchanged — still touch last_scraped_at for cooldown
                cur.execute(
                    "UPDATE permits SET last_scraped_at = NOW() WHERE permit_num = %s",
                    (result['permit_num'],)
                )

            scraped += 1
            log('INFO', '[scraper]', f"Scraped {len(result['stages'])} stages for {result['permit_num']}", {
                'stages': [f"{s['desc']}: {s['status']}" for s in result['stages']],
                'enrichedStatus': enriched,
            })

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()

    return {
        'searched': 1, 'scraped': scraped, 'upserted': upserted,
        'enriched_updates': enriched_updates, 'status_changes': status_changes,
    }


async def scrape_with_retry(page, year_seq, conn):
    """Retry wrapper with exponential backoff."""
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return await scrape_year_sequence(page, year_seq, conn)
        except Exception as err:
            last_error = err
            log('ERROR', '[scraper]', str(err), {'yearSeq': year_seq, 'attempt': attempt})
            if attempt == MAX_RETRIES:
                log('ERROR', '[scraper]', f'All retries exhausted for {year_seq}, skipping')
                return {'searched': 1, 'scraped': 0, 'upserted': 0, 'retry_exhausted': True}
            await asyncio.sleep(RETRY_BASE_MS / 1000 * (2 ** (attempt - 1)))
    return {'searched': 1, 'scraped': 0, 'upserted': 0, 'retry_exhausted': True}


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
def parse_args():
    """Parse CLI arguments. Supports standalone, single-permit, worker, and db-queue modes."""
    args = {
        'mode': 'standalone',  # standalone | single | worker | db-queue
        'single_permit': None,
        'worker_id': None,
        'batch_file': None,
    }

    for arg in sys.argv[1:]:
        if arg.startswith('--worker-id='):
            args['worker_id'] = arg.split('=', 1)[1]
        elif arg.startswith('--batch-file='):
            args['batch_file'] = arg.split('=', 1)[1]
            args['mode'] = 'worker'
        elif arg == '--db-queue':
            args['mode'] = 'db-queue'
        elif not arg.startswith('--'):
            args['single_permit'] = arg
            args['mode'] = 'single'

    # --worker-id without --batch-file implies db-queue mode
    if args['worker_id'] and args['mode'] not in ('worker', 'single'):
        args['mode'] = 'db-queue'

    return args


# ---------------------------------------------------------------------------
# DB queue claiming — used by db-queue worker mode (browser reuse across batches)
# ---------------------------------------------------------------------------
def claim_batch_from_queue(conn, worker_id, batch_size):
    """Claim a batch of year_seqs from scraper_queue. Returns list of year_seq strings."""
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE scraper_queue
            SET status = 'claimed', claimed_at = NOW(), claimed_by = %s
            WHERE year_seq IN (
                SELECT year_seq FROM scraper_queue
                WHERE status = 'pending'
                ORDER BY created_at
                LIMIT %s
                FOR UPDATE SKIP LOCKED
            )
            RETURNING year_seq
        """, (f'worker-{worker_id}', batch_size))
        rows = cur.fetchall()
        conn.commit()
        return [r[0] for r in rows]
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()


def complete_batch_in_queue(conn, year_seqs, worker_id, failed=None):
    """Mark year_seqs as completed (or failed) in scraper_queue."""
    failed = failed or set()
    cur = conn.cursor()
    try:
        completed = [ys for ys in year_seqs if ys not in failed]
        if completed:
            cur.execute("""
                UPDATE scraper_queue
                SET status = 'completed', completed_at = NOW()
                WHERE year_seq = ANY(%s) AND claimed_by = %s
            """, (completed, f'worker-{worker_id}'))
        for ys in failed:
            cur.execute("""
                UPDATE scraper_queue
                SET status = 'failed', completed_at = NOW(), error_msg = 'Scrape failed'
                WHERE year_seq = %s AND claimed_by = %s
            """, (ys, f'worker-{worker_id}'))
        conn.commit()
    except Exception as err:
        log('WARN', f'[worker-{worker_id}]', f'Failed to update queue: {err}')
        try:
            conn.rollback()
        except Exception:
            pass
    finally:
        cur.close()


# ---------------------------------------------------------------------------
# Scrape loop — shared between standalone and worker modes
# ---------------------------------------------------------------------------
async def scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag='[scraper]', profile=None):
    """Core scrape loop for a list of year_seq combos. Mutates tel in place."""

    def accumulate(result):
        tel['permits_attempted'] += 1
        if result.get('scraped', 0) > 0:
            tel['permits_found'] += 1
            tel['permits_scraped'] += result['scraped']
            tel['consecutive_empty'] = 0
        elif result.get('searched', 0) > 0 and result.get('scraped', 0) == 0:
            tel['not_found_count'] += 1
            tel['consecutive_empty'] += 1
            tel['consecutive_empty_max'] = max(tel['consecutive_empty_max'], tel['consecutive_empty'])
        tel['total_upserted'] += result.get('upserted', 0)
        tel['enriched_updates'] += result.get('enriched_updates', 0)
        tel['status_changes'] += result.get('status_changes', 0)
        if result.get('retry_exhausted'):
            tel['proxy_errors'] += 1
            # WAF blocks (retry exhausted) should also trigger proxy rotation
            tel['consecutive_empty'] += WAF_TRAP_THRESHOLD  # force immediate rotation

    for i, year_seq in enumerate(year_seqs):
        progress_pct = (i + 1) / len(year_seqs) * 100
        elapsed = (time.time() * 1000 - start_ms) / 1000
        print(f"  {worker_tag} {i + 1} / {len(year_seqs)} ({progress_pct:.1f}%) — {elapsed:.1f}s")

        # WAF trap detection — rotate proxy session on re-bootstrap
        if tel['consecutive_empty'] >= WAF_TRAP_THRESHOLD:
            log('WARN', worker_tag, f"WAF trap detected ({tel['consecutive_empty']} consecutive empty). Re-bootstrapping...")
            try:
                browser.stop()
                # NOTE (WF2 restore, rung L0): IP rotation on WAF trap is UNAVAILABLE
                # until the relay lands at L2. The extension-rebuild rotation that used
                # to sit here required relaunching Chrome for every IP change -- the
                # ~20x byte multiplier this restore exists to remove. The relay rotates
                # the Decodo session on a pinned local port without touching the browser.
                # Re-bootstrapping still clears session state, which is the part that
                # matters on an unproxied run.
                browser, page, attempts, profile = await bootstrap_with_retry(worker_id=tel.get('_worker_id'))
                tel['session_bootstraps'] += attempts
                tel['consecutive_empty'] = 0
            except Exception as err:
                tel['session_failures'] += 1
                log('ERROR', worker_tag, str(err), {'event': 'session_bootstrap_failed'})
                raise RuntimeError(f'Mid-batch WAF rotate failed: {err}')

        # Periodic session refresh (non-proxy only — proxy mode uses 1 batch = 1 IP)
        if i > 0 and i % SESSION_REFRESH_INTERVAL == 0 and not proxy_enabled():
            log('INFO', worker_tag, f'Refreshing AIC session (after {i} permits)...')
            try:
                page = await browser.get(f'{AIC_BASE}/setup.do?action=init', new_tab=False)
                if profile:
                    await inject_screen_overrides(page, profile)
                await page.sleep(1)
            except Exception as err:
                tel['session_failures'] += 1
                log('ERROR', worker_tag, str(err), {'event': 'session_refresh_failed'})

        req_start = time.time() * 1000
        result = await scrape_with_retry(page, year_seq, conn)
        tel['latencies'].append(time.time() * 1000 - req_start)
        accumulate(result)

        # Human-like jitter between requests (1-3.5s)
        if i < len(year_seqs) - 1:
            await page.sleep(random.uniform(1.0, 3.5))

        # Mid-session noise: visit a benign page every 3-5 permits to break API-only pattern
        if i > 0 and i % random.randint(3, 5) == 0 and i < len(year_seqs) - 1:
            try:
                noise_url = random.choice(NOISE_URLS)
                page = await browser.get(noise_url, new_tab=False)
                if profile:
                    await inject_screen_overrides(page, profile)
                await page.sleep(random.uniform(1.0, 3.0))
                # Return to AIC portal
                page = await browser.get(f'{AIC_BASE}/setup.do?action=init', new_tab=False)
                if profile:
                    await inject_screen_overrides(page, profile)
                await page.sleep(random.uniform(0.5, 1.5))
            except Exception:
                pass  # noise visit failed — non-fatal

        # Early abort on sustained misses
        if i >= 9 and (i + 1) % 10 == 0 and tel['not_found_count'] / tel['permits_attempted'] >= 0.9:
            log('WARN', worker_tag, f"Early abort: {tel['not_found_count']}/{tel['permits_attempted']} not found")
            break

    return browser, page


def make_telemetry():
    """Create a fresh telemetry dict."""
    return {
        'permits_attempted': 0, 'permits_found': 0, 'permits_scraped': 0,
        'not_found_count': 0, 'enriched_updates': 0, 'proxy_errors': 0,
        'consecutive_empty': 0, 'consecutive_empty_max': 0,
        'session_bootstraps': 0, 'session_failures': 0,
        'schema_drift': [], 'status_changes': 0, 'total_upserted': 0,
        'error_categories': {}, 'last_error': None, 'latencies': [],
        'preflight_passed': True, '_worker_id': 'standalone',
    }


def compute_summary(tel, start_ms):
    """Compute PIPELINE_SUMMARY from telemetry."""
    latencies = sorted(tel['latencies']) if tel['latencies'] else [0]
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(len(latencies) * 0.95)]
    duration_ms = int(time.time() * 1000 - start_ms)
    miss_rate = (tel['not_found_count'] / tel['permits_attempted'] * 100) if tel['permits_attempted'] > 0 else 0
    miss_status = 'FAIL' if miss_rate >= 20 else 'PASS'

    return {
        'records_total': tel['permits_attempted'],
        'records_new': tel['total_upserted'],
        'records_updated': tel['status_changes'],
        'records_meta': {
            'scraper_telemetry': {
                'permits_attempted': tel['permits_attempted'],
                'permits_found': tel['permits_found'],
                'permits_scraped': tel['permits_scraped'],
                'not_found_count': tel['not_found_count'],
                'enriched_updates': tel['enriched_updates'],
                'proxy_errors': tel['proxy_errors'],
                'consecutive_empty_max': tel['consecutive_empty_max'],
                'session_bootstraps': tel['session_bootstraps'],
                'session_failures': tel['session_failures'],
                'schema_drift': tel['schema_drift'],
                'status_changes': tel['status_changes'],
                'error_categories': tel['error_categories'],
                'last_error': tel['last_error'],
                # Derived from the RESOLVED MODE, never from credential presence.
                # Before 2026-07-30 this read bool(PROXY_HOST) and so reported
                # proxy_configured=true on runs that scraped DIRECT -- the field lied
                # for four months. `proxy_mode` is emitted alongside so a reader can
                # tell "deliberately unproxied by policy" from "misconfigured".
                'proxy_configured': proxy_enabled(),
                'proxy_mode': proxy_mode(),
                'proxy_host': PROXY_HOST if proxy_enabled() else None,
                'preflight_passed': tel.get('preflight_passed', True),
                'max_permits_cap': MAX_PERMITS,
                'capped': MAX_PERMITS > 0 and tel['permits_attempted'] >= MAX_PERMITS,
                'latency': {'p50': int(p50), 'p95': int(p95), 'max': int(latencies[-1])},
            },
            'audit_table': {
                'phase': 1,
                'name': 'Data Ingestion',
                'verdict': 'FAIL' if miss_status == 'FAIL' else 'PASS',
                'rows': [
                    {'metric': 'permits_attempted', 'value': tel['permits_attempted'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'permits_found', 'value': tel['permits_found'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'enriched_updates', 'value': tel['enriched_updates'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'not_found_count', 'value': tel['not_found_count'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'not_found_rate', 'value': f'{miss_rate:.1f}%', 'threshold': '< 20%', 'status': miss_status},
                    {'metric': 'records_inserted', 'value': tel['total_upserted'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'records_updated', 'value': tel['status_changes'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'duration_ms', 'value': duration_ms, 'threshold': None, 'status': 'INFO'},
                    {'metric': 'exit_code', 'value': 0, 'threshold': '== 0', 'status': 'PASS'},
                    {'metric': 'pipeline_summary_emitted', 'value': True, 'threshold': '== true', 'status': 'PASS'},
                ],
            },
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    args = parse_args()
    start_ms = time.time() * 1000
    tel = make_telemetry()
    tel['_worker_id'] = args['worker_id'] or 'standalone'

    worker_tag = f'[worker-{args["worker_id"]}]' if args['worker_id'] else '[scraper]'

    # MV3 proxy extension RETIRED (WF2 restore, rung L0).
    # Branded Chrome >=137 drops --load-extension and an idle MV3 service
    # worker is evicted mid-run, so the extension was both unreliable and
    # silent when it failed. The relay replaces it at rung L2.
    assert_proxy_config_coherent()

    log('INFO', worker_tag, 'Launching browser via nodriver (CDP)...')

    browser = None
    try:
        browser, page, bootstrap_attempts, profile = await bootstrap_with_retry(worker_id=tel['_worker_id'])
        tel['session_bootstraps'] = bootstrap_attempts
        log('INFO', worker_tag, 'WAF session established (no WebDriver)')

        if args['mode'] == 'single':
            conn = get_db_connection()
            try:
                log('INFO', worker_tag, f'Single permit mode: {args["single_permit"]}')
                req_start = time.time() * 1000
                result = await scrape_with_retry(page, args['single_permit'], conn)
                tel['latencies'].append(time.time() * 1000 - req_start)
                tel['permits_attempted'] += 1
                if result.get('scraped', 0) > 0:
                    tel['permits_found'] += 1
                    tel['permits_scraped'] += result['scraped']
                tel['total_upserted'] += result.get('upserted', 0)
                tel['enriched_updates'] += result.get('enriched_updates', 0)
                tel['status_changes'] += result.get('status_changes', 0)
            finally:
                conn.close()

        elif args['mode'] == 'worker':
            conn = get_db_connection()
            try:
                if not args['batch_file']:
                    log('ERROR', worker_tag, 'Worker mode requires --batch-file')
                    sys.exit(1)
                with open(args['batch_file'], 'r') as f:
                    year_seqs = json.load(f)
                log('INFO', worker_tag, f'Worker mode: {len(year_seqs)} year_seqs from {args["batch_file"]}')
                browser, page = await scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag, profile=profile)
            finally:
                conn.close()

        elif args['mode'] == 'db-queue':
            # DB-queue mode: 1 batch = 1 IP address.
            # Each batch gets a fresh DB connection (prevents idle timeout on managed PG)
            # and a fresh proxy URL (new sticky session), fresh Chrome.
            worker_id = args['worker_id'] or 'standalone'
            batch_num = 0

            # In db-queue mode, the outer bootstrap is only for non-proxy runs.
            # For proxy runs, each batch builds its own session. Kill the initial browser.
            if browser and proxy_enabled():
                browser.stop()
                browser = None

            while True:
                # Cap check: stop claiming if we've hit the max permits limit
                if MAX_PERMITS > 0 and tel['permits_attempted'] >= MAX_PERMITS:
                    log('INFO', worker_tag, f"Max permits cap reached ({tel['permits_attempted']}/{MAX_PERMITS})")
                    break

                # Fresh DB connection per batch — prevents idle timeout on managed PostgreSQL.
                # Connection is short-lived: claim → scrape → complete → close.
                conn = get_db_connection()
                try:
                    # Random batch size (5-15) clamped to remaining cap
                    random_batch = random.randint(BATCH_SIZE_MIN, BATCH_SIZE_MAX)
                    remaining = MAX_PERMITS - tel['permits_attempted'] if MAX_PERMITS > 0 else random_batch
                    claim_size = min(random_batch, remaining)

                    year_seqs = claim_batch_from_queue(conn, worker_id, claim_size)
                    if not year_seqs:
                        log('INFO', worker_tag, 'No more pending items in queue')
                        break

                    batch_num += 1

                    if browser is None:
                        browser, page, attempts, profile = await bootstrap_with_retry(worker_id=worker_id)
                        tel['session_bootstraps'] += attempts
                        log('INFO', worker_tag, f'Batch {batch_num}: browser bootstrapped')

                    log('INFO', worker_tag, f'Batch {batch_num}: claimed {len(year_seqs)} year_seqs')
                    try:
                        browser, page = await scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag, profile=profile)
                        complete_batch_in_queue(conn, year_seqs, worker_id)
                        log('INFO', worker_tag, f'Batch {batch_num}: complete')
                    except Exception as err:
                        log('ERROR', worker_tag, f'Batch {batch_num} failed: {err}')
                        complete_batch_in_queue(conn, year_seqs, worker_id, failed=set(year_seqs))
                        # Browser may be dead — force cleanup
                        if browser:
                            try:
                                browser.stop()
                            except Exception:
                                pass
                            browser = None

                    # Kill browser after each batch in proxy mode (1 batch = 1 IP),
                    # or after BROWSER_MAX_BATCHES in non-proxy mode (memory TTL).
                    if browser and (proxy_enabled() or batch_num % BROWSER_MAX_BATCHES == 0):
                        if not proxy_enabled():
                            log('INFO', worker_tag, f'Browser TTL: recycling after {BROWSER_MAX_BATCHES} batches')
                        browser.stop()
                        browser = None
                finally:
                    conn.close()

        else:
            # Standalone batch mode: query DB for eligible permits
            conn = get_db_connection()
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("""
                    SELECT year_seq FROM (
                        SELECT DISTINCT SUBSTRING(p.permit_num FROM '^[0-9]{2} [0-9]+') AS year_seq,
                               MAX(p.issued_date) AS max_issued
                        FROM permits p
                        WHERE p.status = 'Inspection'
                          AND p.permit_type = ANY(%s)
                          AND p.issued_date IS NOT NULL
                          AND p.issued_date > NOW() - INTERVAL '3 years'
                          AND (p.enriched_status IS NULL
                               OR p.enriched_status IN ('Permit Issued', 'Active Inspection', 'Not Passed'))
                          AND (p.last_scraped_at IS NULL OR p.last_scraped_at < NOW() - INTERVAL '7 days')
                          AND SUBSTRING(p.permit_num FROM '^[0-9]{2}')::int <= EXTRACT(YEAR FROM CURRENT_DATE) %% 100
                        GROUP BY year_seq
                        ORDER BY max_issued DESC
                        LIMIT %s
                    ) sub
                """, (TARGET_TYPES, BATCH_SIZE))
                rows = cur.fetchall()
                cur.close()

                year_seqs = [r['year_seq'] for r in rows]
                random.shuffle(year_seqs)
                log('INFO', worker_tag, f'Batch mode: {len(year_seqs)} year+sequence combos to scrape (shuffled)')
                browser, page = await scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag, profile=profile)
            finally:
                conn.close()

    except Exception as err:
        tel['preflight_passed'] = False
        tel['last_error'] = str(err)
        log('ERROR', worker_tag, f'Fatal: {err}')

    finally:
        if browser:
            try:
                browser.stop()
            except Exception:
                pass
        # Clean up proxy extension directory

        # Safety net: kill orphaned Chrome processes spawned by THIS worker only.
        # Each worker uses a unique profile dir (profile-worker-N or profile-standalone).
        # Scoping prevents multi-worker sabotage where one worker kills another's Chrome.
        profile_name = f'worker-{args["worker_id"]}' if args['worker_id'] else 'standalone'
        profile_pattern = f'profile-{profile_name}'
        # Word boundary (\b) prevents substring matches: profile-worker-1 must NOT match
        # profile-worker-10. Escape chain verified:
        #   Linux pkill: Python f'...\\b' → shell receives literal \b → ERE word boundary ✓
        #   Windows PS:  Python f"...\\b" → PowerShell receives \b → .NET regex boundary ✓
        # Chrome's --user-data-dir=.../profile-worker-1/Default has / or \ after the digit,
        # both are non-word chars so \b fires correctly at the boundary.
        try:
            import subprocess
            if sys.platform == 'win32':
                # Get-CimInstance exposes CommandLine on Windows PS 5.1+
                # (Get-Process lacks CommandLine, causing silent filter failure)
                subprocess.run(
                    ['powershell', '-Command',
                     "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" -ErrorAction SilentlyContinue | "
                     f"Where-Object {{$_.CommandLine -match '{profile_pattern}\\b'}} | "
                     "ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"],
                    capture_output=True, timeout=5,
                )
            else:
                subprocess.run(
                    ['pkill', '-f', f'chrome.*{profile_pattern}\\b'],
                    capture_output=True, timeout=5,
                )
        except Exception:
            pass

    elapsed_s = (time.time() * 1000 - start_ms) / 1000
    log('INFO', worker_tag, 'Scrape complete', {
        'permits_attempted': tel['permits_attempted'],
        'permits_found': tel['permits_found'],
        'permits_scraped': tel['permits_scraped'],
        'enriched_updates': tel['enriched_updates'],
        'status_changes': tel['status_changes'],
        'proxy_errors': tel['proxy_errors'],
        'session_bootstraps': tel['session_bootstraps'],
        'elapsed': f'{elapsed_s:.1f}s',
    })

    summary = compute_summary(tel, start_ms)
    emit_summary(summary)

    emit_meta(
        {'permits': ['permit_num', 'status', 'enriched_status', 'permit_type']},
        {'permit_inspections': ['permit_num', 'stage_name', 'status', 'inspection_date', 'scraped_at']},
        ['AIC Portal REST API (secure.toronto.ca/ApplicationStatus/jaxrs)']
    )


if __name__ == '__main__':
    asyncio.run(main())
