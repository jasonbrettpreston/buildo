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
import atexit
import json
import os
import random
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
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
# 'relay' is live from rung L2. The MV3 extension is retired and does not return:
# branded Chrome >=137 silently drops --load-extension, and an idle MV3 service
# worker is evicted mid-run while chrome.proxy settings persist — so the browser
# keeps routing through the proxy while unable to authenticate. Both silent.
SUPPORTED_PROXY_MODES = ('none', 'relay')
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
            f"SCRAPER_PROXY_MODE={PROXY_MODE!r} is not supported. "
            f"Supported: {', '.join(SUPPORTED_PROXY_MODES)}.")
    if proxy_enabled():
        # C6 fires for every proxied run — not an opt-in an operator can forget.
        assert_proxy_geo_is_canadian()
    if PROXY_HOST and not proxy_enabled():
        raise RuntimeError(
            "PROXY_HOST is set but SCRAPER_PROXY_MODE is 'none', so this run will NOT "
            "be proxied. Proxying is now an explicit choice: set SCRAPER_PROXY_MODE "
            "to 'relay'. If an unproxied run is what you want, unset PROXY_HOST or "
            "set SCRAPER_ALLOW_UNPROXIED=1 to acknowledge it.")


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
    """Compute enriched_status from scraped inspection stages.

    PORTAL CHANGE (operator-verified on the live site, 2026-07-30): the AIC
    Inspection Status page now lists ONLY stages already passed ("this list
    reflects applicable mandatory inspection stages that have been passed").
    "Every scraped stage is Passed" therefore no longer implies the regime is
    finished — ground truth included permits with Occupancy passed whose AIC
    status was still 'Inspection' (21 217696 / 23 183037 / 17 172425).
    Lifecycle completion truth is the FEED's own status (permits.status,
    e.g. 'Pending Closed'), never inferred from a passed-only stage list —
    so an all-passed list now means "inspection activity observed", the
    'mixed' bucket, and 'Inspections Complete' is no longer written here.
    """
    if not stages:
        return None
    statuses = [normalize_status(s.get('status')) for s in stages]
    statuses = [s for s in statuses if s]
    if not statuses:
        return None
    if any(s == 'Not Passed' for s in statuses): return _ENRICHED['all_not_passed']
    if all(s == 'Outstanding' for s in statuses): return _ENRICHED['all_outstanding']
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
# C8 / L4 (WF2 restore) — CDP resource blocking: the ~375x byte lever.
#
# Restores the deleted Playwright v2 filter (poc-aic-scraper-v2.js:497-500),
# the mechanism behind the ~4 KB/permit economics the 3 GB/month budget was
# built on. Ported VERBATIM — allow document/xhr/fetch/script, abort all else
# — nothing "improved". v2 installed it BEFORE any navigation, so the warm-up
# page and setup.do loaded as HTML+script skeletons (map tiles are images →
# aborted); this port preserves that ordering.
#
# ⚠ THE FENCE (d138bb04, 2026-03-15): blocking `script` PERMANENTLY
# shadow-banned sessions — WAFs run JS challenges to verify the browser isn't
# headless. `Script` MUST stay in the allow set. v2's own comment:
#   "Block images/css/fonts but allow scripts — WAFs run JS challenges to
#    verify the browser isn't headless. Blocking scripts causes permanent
#    shadow-ban."
# ---------------------------------------------------------------------------
ALLOWED_RESOURCE_TYPES = frozenset({'Document', 'XHR', 'Fetch', 'Script'})

# Observability: makes "the filter is on and doing work" a measured fact in
# the run summary rather than a claim.
_resource_filter_stats = {'allowed': 0, 'blocked': 0}


def resource_blocking_enabled():
    """Gated OFF by default: bytes are free on the operator's own line, and the
    attested local path must stay byte-for-byte unchanged. The workflow pins it
    ON — cloud bytes are metered."""
    return os.environ.get('SCRAPER_RESOURCE_BLOCKING', '') == '1'


def should_allow_resource(resource_type_name):
    """Pure type-based decision, URL-agnostic. The four /jaxrs/ data calls are
    resource type Fetch/XHR and navigations are Document — always allowed."""
    return resource_type_name in ALLOWED_RESOURCE_TYPES


def _resource_filter_handler(tab):
    """Build the Fetch.requestPaused responder bound to this tab."""
    async def _on_request_paused(event, connection=None):
        conn = connection or tab
        try:
            if should_allow_resource(event.resource_type.value):
                _resource_filter_stats['allowed'] += 1
                await conn.send(uc.cdp.fetch.continue_request(request_id=event.request_id))
            else:
                _resource_filter_stats['blocked'] += 1
                await conn.send(uc.cdp.fetch.fail_request(
                    request_id=event.request_id,
                    error_reason=uc.cdp.network.ErrorReason.ABORTED))
        except Exception as err:  # noqa: BLE001
            # A paused request can vanish before we answer (navigation tore it
            # down). Log, never raise — the filter must not kill a scrape.
            log('WARN', '[scraper]', f'Resource filter could not answer a paused request: {err}',
                {'event': 'resource_filter_error'})
    return _on_request_paused


async def dump_resource_inventory(page, label):
    """Log what the page actually loaded, by host and initiator type.

    Free (reads the page's own PerformanceResourceTiming buffer, issues no
    request) and it is the ONLY way to see which hosts serve the portal's
    script stack — the relay logs refusals, never admissions, so the candidate
    list for any blocklist addition is otherwise guesswork. transferSize is 0
    for cross-origin resources without Timing-Allow-Origin, so treat this as
    the INVENTORY; relay_bytes_by_host carries the authoritative bytes.
    """
    try:
        raw = await page.evaluate("""
            JSON.stringify(performance.getEntriesByType('resource').reduce((acc, r) => {
                let host = 'unknown';
                try { host = new URL(r.name).hostname; } catch (e) {}
                const key = host + '|' + (r.initiatorType || '?');
                acc[key] = acc[key] || {n: 0, transfer: 0};
                acc[key].n += 1;
                acc[key].transfer += (r.transferSize || 0);
                return acc;
            }, {}))
        """, await_promise=False)
        inventory = json.loads(raw) if isinstance(raw, str) else {}
    except Exception as err:  # noqa: BLE001
        log('WARN', '[scraper]', f'Could not read resource inventory ({label}): {err}',
            {'event': 'resource_inventory_failed'})
        return
    ranked = sorted(inventory.items(), key=lambda kv: -kv[1].get('transfer', 0))[:25]
    log('INFO', '[scraper]', f'Resource inventory after {label}',
        {'event': 'resource_inventory', 'stage': label,
         'entries': [{'host_type': k, 'n': v['n'], 'transfer': v['transfer']} for k, v in ranked]})


async def enable_resource_blocking(tab):
    """Install the v2 allow-set filter on the scraping tab via CDP Fetch.

    Fetch.enable with request-stage interception, not Network.setBlockedURLs —
    that is URL-pattern based and cannot express "allow all scripts". MUST be
    called before the first navigation (v2 ordering): the entry page and
    setup.do are the heaviest loads and must be skeletonised too.
    """
    tab.add_handler(uc.cdp.fetch.RequestPaused, _resource_filter_handler(tab))
    await tab.send(uc.cdp.fetch.enable())
    log('INFO', '[scraper]', 'CDP resource blocking ON (allow: document/xhr/fetch/script)',
        {'event': 'resource_blocking_enabled'})


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


def build_browser_args(profile, debug_port=None, profile_dir=None,
                       chrome_log=None, platform=None, relay_url=None):
    """Build Chrome's launch flags and decide headedness. Pure — no browser needed.

    Extracted as a pure function precisely so the launch surface is testable without
    starting Chrome: a flag regression is otherwise only discoverable by dispatching
    a CI run, which is the loop this restore exists to escape.

    `debug_port` selects the ATTACH-MODE arg set (rung L1). On that path nodriver
    contributes no flags at all, so everything Chrome needs must come from here —
    including nodriver's own defaults, reproduced verbatim so the browser's
    observable fingerprint does not drift from the runs this was proven on.

    Returns (browser_args, use_headless).
    """
    plat = sys.platform if platform is None else platform
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

    if not use_headless and plat != 'win32' and not os.environ.get('DISPLAY'):
        # Headed Chrome on Linux needs a display server (X11/Wayland) or Xvfb. Without
        # one Chrome dies with "cannot open display" — an opaque failure the workflow
        # header explicitly relies on us pre-empting with a named error.
        raise RuntimeError(
            f'Proxy mode {proxy_mode()!r} requires headed Chrome but no DISPLAY is set. '
            'Run with: xvfb-run -a python3 scripts/aic-orchestrator.py'
        )

    if relay_url:
        # C3: Chrome only ever sees a local, unauthenticated forwarder. Credentials
        # live in the relay's argv, never on Chrome's command line.
        browser_args.append(f'--proxy-server={relay_url}')
        # Chrome bypasses proxies for loopback by DEFAULT, which would send the
        # egress probe direct and make an unproxied run look proxied.
        browser_args.append('--proxy-bypass-list=<-loopback>')

    if BANDWIDTH_GUARD:
        # C7 layer one. Chrome's own background chatter is billable the moment a
        # proxy is in the path; --disable-component-update is the 1.76 GB one.
        browser_args += BANDWIDTH_GUARD_ARGS
        browser_args.append(f'--disable-features={BANDWIDTH_GUARD_FEATURES}')

    if debug_port is not None:
        # Attach mode (L1): nodriver supplies nothing, so we supply everything.
        browser_args += NODRIVER_DEFAULT_ARGS
        browser_args.append(f'--remote-debugging-port={debug_port}')
        # 127.0.0.1 explicitly — nodriver polls that literal host, not "localhost".
        browser_args.append('--remote-debugging-host=127.0.0.1')
        if profile_dir:
            # Chrome 136+ ignores --remote-debugging-port on a DEFAULT profile dir,
            # so this is load-bearing, not just tidiness.
            browser_args.append(f'--user-data-dir={profile_dir}')
        if chrome_log:
            # K7c. Safe only because we spawn with stdio to DEVNULL; on a piped,
            # undrained stdio path this flag fills the buffer and stalls startup.
            browser_args.append('--enable-logging')
            browser_args.append(f'--log-file={chrome_log}')
        if use_headless:
            browser_args.append('--headless=new')

    # Chrome keeps only the LAST --disable-features occurrence, so two switches
    # silently drop one. Collapse to a single switch, always.
    features = []
    kept = []
    for arg in browser_args:
        if arg.startswith('--disable-features='):
            features += [f for f in arg.split('=', 1)[1].split(',') if f]
        else:
            kept.append(arg)
    if features:
        deduped = list(dict.fromkeys(features))
        kept.append(f"--disable-features={','.join(deduped)}")
    browser_args = kept

    # Chrome's real sandbox stays ON (de3ff6dd fence): no launch-flag divergence
    # from the operator's local runs for a WAF-sensitive scraper.
    return browser_args, use_headless


# One local port pinned per worker, so a rotation reuses it and Chrome's
# --proxy-server never has to change.
_relay_ports = {}
# Blocked-host counts per worker, so the cost blocklist is observable rather than
# a claim (they previously died on an unread stderr pipe).
_relay_block_counts = {}
# Bounded — diagnostics must never become the thing that floods a run's logs.
RELAY_STDERR_SAMPLES = int(os.environ.get('SCRAPER_RELAY_STDERR_SAMPLES') or '25')
_host_egress_ip_cache = {'ip': None, 'at': 0.0}


EGRESS_ECHO_URL = os.environ.get('SCRAPER_EGRESS_ECHO_URL') or 'https://api.ipify.org?format=json'


HOST_EGRESS_IP_TTL_S = float(os.environ.get('SCRAPER_HOST_IP_TTL_S') or '900')


def build_upstream_proxy_url(session_id, worker_id=None):
    """The credentialed upstream URL handed to the relay (never to Chrome)."""
    from urllib.parse import quote
    user = quote(build_proxy_username(session_id), safe='')
    password = quote(PROXY_PASS, safe='')
    port = resolve_proxy_port(worker_id)
    return f'{PROXY_SCHEME}://{user}:{password}@{PROXY_HOST}:{port}'


def start_proxy_relay(session_id, worker_id=None, timeout=30):
    """Run a local unauthenticated relay that holds the upstream credentials.

    Returns its `http://127.0.0.1:PORT` URL, which Chrome can use with a plain
    --proxy-server and NO extension. Replaces the MV3 extension because
    branded Chrome removed --load-extension (137) and its opt-out (142), and an
    evicted MV3 service worker silently stops answering onAuthRequired while
    chrome.proxy settings persist — the browser keeps routing through the proxy
    while unable to authenticate.
    """
    if not PROXY_HOST:
        return None
    upstream = build_upstream_proxy_url(session_id, worker_id)
    # Reuse this worker's port across session rotations (see _relay_ports).
    want_port = _relay_ports.get(worker_id, 0)
    # stderr goes to DEVNULL, not PIPE: proxy-relay.mjs writes a line per blocked
    # host and per failed request, and nothing drains it. A full 64 KB pipe buffer
    # blocks the relay's write, the relay stops serving, and the scraper hangs until
    # the step timeout — the same undrained-pipe stall we refuse to allow for Chrome.
    proc = subprocess.Popen(
        ['node', PROXY_RELAY_JS, upstream, str(want_port)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        **({'start_new_session': True} if sys.platform != 'win32' else {}),
    )
    _spawned_relays[worker_id] = proc
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if line:
            try:
                url = json.loads(line).get('url')
            except ValueError:
                continue
            if url:
                try:
                    _relay_ports[worker_id] = int(url.rsplit(':', 1)[1])
                except (ValueError, IndexError):
                    pass
                log('INFO', '[scraper]', 'Proxy relay ready', {
                    'event': 'proxy_relay_ready',
                    'local_url': url,
                    'upstream_host': PROXY_HOST,
                    'upstream_port': resolve_proxy_port(worker_id),
                    'scheme': PROXY_SCHEME,
                })
                _drain_relay_stderr(proc, worker_id)
                return url
        if proc.poll() is not None:
            err = (proc.stderr.read() or '').strip()[:200]
            raise RuntimeError(f'Proxy relay exited (rc={proc.returncode}) before listening: {err}')
    terminate_spawned_relay(worker_id)
    raise RuntimeError(f'Proxy relay did not report a listening URL within {timeout}s')

def _relay_summary():
    """Aggregate every worker's relay stderr counters for the run summary."""
    total = {'blocked': 0, 'lines': 0, 'samples': [], 'bytes_up': 0, 'bytes_down': 0,
             'bytes_by_host': {}}
    for counts in _relay_block_counts.values():
        total['blocked'] += counts.get('blocked', 0)
        total['lines'] += counts.get('lines', 0)
        total['bytes_up'] += counts.get('bytes_up', 0)
        total['bytes_down'] += counts.get('bytes_down', 0)
        for host, n in (counts.get('bytes_by_host') or {}).items():
            total['bytes_by_host'][host] = total['bytes_by_host'].get(host, 0) + n
        for sample in counts.get('samples', []):
            if len(total['samples']) < RELAY_STDERR_SAMPLES:
                total['samples'].append(sample)
    return total


def _drain_relay_stderr(proc, worker_id=None):
    """Continuously drain the relay's stderr, counting the hosts it refuses.

    Two jobs, and both matter. Draining: `proxy-relay.mjs` writes a line per blocked
    host and per failed request, and an undrained 64 KB pipe buffer blocks its writes
    — the relay then stops serving and the scraper hangs until the step timeout, the
    same stall we refuse to allow for Chrome. Counting: those lines are the ONLY
    evidence of the cost blocklist doing its job, and until now they died on a pipe
    nobody read. A wrongly-blocked host is otherwise invisible.
    """
    counts = _relay_block_counts.setdefault(
        worker_id, {'blocked': 0, 'lines': 0, 'samples': [],
                    'bytes_up': 0, 'bytes_down': 0, 'bytes_by_host': {}})

    def _pump():
        # This relay GENERATION's cumulative totals. Rotation kills the relay
        # and starts a fresh one whose counters restart at zero, so writing
        # the latest line straight into `counts` would silently drop every
        # earlier batch's bytes — fold on EOF instead.
        last_up = 0
        last_down = 0
        gen_hosts = {}
        try:
            for line in proc.stderr:
                counts['lines'] += 1
                text = line.strip()
                # L4 byte accounting: cumulative per relay generation. Parsed
                # silently — periodic lines would flood the sample buffer.
                m = re.match(r'^proxy-relay: BYTES up=(\d+) down=(\d+)$', text)
                if m:
                    last_up = int(m.group(1))
                    last_down = int(m.group(2))
                    continue
                # R0 attribution: which hosts the metered bytes were spent on.
                # Cumulative per relay generation, same fold-on-EOF discipline.
                if text.startswith('proxy-relay: HOSTBYTES '):
                    gen_hosts.clear()
                    for pair in text[len('proxy-relay: HOSTBYTES '):].split():
                        host, _, n = pair.rpartition('=')
                        if host and n.isdigit():
                            gen_hosts[host] = int(n)
                    continue
                if 'BLOCKED' in text:
                    counts['blocked'] += 1
                # Keep a bounded sample of what the relay actually said. A
                # `TypeError` in the page tells you a request failed; only the
                # relay can tell you WHY it failed, and until now those lines died
                # on a pipe nobody read.
                if text and len(counts['samples']) < RELAY_STDERR_SAMPLES:
                    counts['samples'].append(text[:200])
                    log('WARN', '[scraper]', f'relay: {text[:200]}',
                        {'event': 'proxy_relay_stderr', 'worker_id': worker_id})
        except (ValueError, OSError):
            pass  # pipe closed on teardown — expected
        finally:
            counts['bytes_up'] += last_up
            counts['bytes_down'] += last_down
            for host, n in gen_hosts.items():
                counts['bytes_by_host'][host] = counts['bytes_by_host'].get(host, 0) + n

    thread = threading.Thread(target=_pump, name=f'relay-stderr-{worker_id}', daemon=True)
    thread.start()
    return thread


def terminate_spawned_relay(worker_id=None, timeout=8):
    """Kill the relay we spawned for this worker. Idempotent; never raises."""
    proc = _spawned_relays.pop(worker_id, None)
    if proc is None or proc.poll() is not None:
        return False
    try:
        if sys.platform != 'win32':
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        else:
            proc.terminate()
    except OSError as err:
        log('WARN', '[scraper]', f'Could not signal proxy relay: {err}',
            {'event': 'relay_terminate_failed'})
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except OSError:
            pass
    log('INFO', '[scraper]', 'Terminated proxy relay',
        {'event': 'proxy_relay_terminated', 'worker_id': worker_id})
    return True

def _extract_ip(raw):
    """Pull an IP string out of the echo service's response (JSON or bare text)."""
    if raw is None:
        return None
    text = raw if isinstance(raw, str) else str(raw)
    text = text.strip()
    if not text:
        return None
    # Unwrap up to two layers of JSON: the body may be a JSON document, or a
    # JSON-encoded STRING containing one (nodriver hands values back encoded).
    for _ in range(2):
        if not text.startswith(('{', '"')):
            break
        try:
            decoded = json.loads(text)
        except ValueError:
            break
        if isinstance(decoded, dict):
            return str(decoded.get('ip') or '').strip() or None
        text = str(decoded).strip()
    if re.match(r'^[0-9a-fA-F:.]+$', text):
        return text
    # Last resort: an IP embedded in a text body (a <pre>-rendered JSON page).
    found = re.search('(?:[0-9]{1,3}[.]){3}[0-9]{1,3}', text)
    return found.group(0) if found else None


def host_egress_ip(timeout=15, refresh=False, now=None):
    """This process's own public IP — i.e. what UNPROXIED traffic looks like.

    Memoized with a TTL: bootstrap runs per BATCH in proxy mode ("1 batch =
    1 IP") and again on every WAF rotation, so probing the echo service every
    time would mean thousands of calls to one free endpoint while draining the
    queue — an avoidable rate-limit risk on a dependency that can fail the
    chain. The TTL bounds how stale the comparison baseline can get.
    """
    now = time.time() if now is None else now
    cached = _host_egress_ip_cache
    if cached and not refresh and (now - cached['at']) < HOST_EGRESS_IP_TTL_S:
        return cached['ip']
    try:
        with urllib.request.urlopen(EGRESS_ECHO_URL, timeout=timeout) as resp:
            found = _extract_ip(resp.read().decode('utf-8', errors='replace'))
    except (urllib.error.URLError, OSError, ValueError):
        return None
    if found:
        # Only a SUCCESSFUL probe refreshes the cache: a transient echo outage
        # must not poison it, and must not extend a stale entry's life either.
        _host_egress_ip_cache.clear()
        _host_egress_ip_cache.update({'ip': found, 'at': now})
    return found


_HOST_IP_UNSET = object()  # distinct from None, which means "known to be unknown"

async def verify_proxied_egress(browser, host_ip=_HOST_IP_UNSET):
    """FAIL-LOUD tripwire: prove the BROWSER's traffic is not leaving via this host.

    Asserts the invariant that actually matters — am I proxied? — rather than
    inferring it from the proxy extension's presence. An earlier version looked
    for a `chrome-extension://*/background.js` target and rejected a browser
    whose targets were only ['page:about:blank']; MV3 service workers start
    lazily and are not reliably enumerated, so that produced a FALSE NEGATIVE
    on the GH runner (run 30496893882) against a browser whose extension had in
    fact loaded (run 30498062060 later listed both service workers).

    NAVIGATES to the echo service rather than fetch()ing it: a cross-origin
    fetch from an arbitrary document throws — nodriver then returns an
    ExceptionDetails object rather than raising, which is exactly what broke
    run 30498062060. Navigation has no such restriction. It navigates a NEW
    tab, never the scraping tab: by this point in bootstrap the main tab is ON
    the AIC origin, and every /jaxrs/ call inherits the PAGE's origin — probe
    30568655070 proved that hijacking the main tab here strands the scraper on
    the echo origin and every data fetch throws 'TypeError: Failed to fetch',
    which then reads as a WAF block.

    Why it must fail loud rather than warn: the MV3 extension supplies BOTH the
    proxy route and its credentials, so if it does not load there is no error at
    all — traffic silently goes direct from this host's IP, exposing a
    WAF-sensitive scraper. Spec 115 §3/§4's fail-safe-loud posture applies: if
    we cannot PROVE we are proxied, we do not scrape. bootstrap_with_retry
    retries, so a transient echo-service outage costs attempts, not silence.
    """
    # Sentinel, not None: None is a MEANINGFUL value here ("we could not
    # determine it"), which must fail loud rather than trigger a re-fetch.
    if host_ip is _HOST_IP_UNSET:
        host_ip = host_egress_ip()

    if not host_ip:
        raise RuntimeError(
            f"Could not determine this host's egress IP from {EGRESS_ECHO_URL}, so "
            "'am I proxied?' is unanswerable — refusing to scrape unverified"
        )

    # Read AFTER the document has had a chance to load. Reading immediately gave an
    # empty body on the slower proxied path in CI, which then fell through to the
    # "unreachable => treat as proxied" branch and let a completely broken transport
    # start scraping (GH run 30560364087).
    raw = ''
    tab = None
    try:
        for attempt in range(3):
            if tab is None:
                tab = await browser.get(EGRESS_ECHO_URL, new_tab=True)
            else:
                await tab.get(EGRESS_ECHO_URL)
            await tab.sleep(1.5 + attempt)
            raw = await tab.evaluate('document.body.innerText', await_promise=False)
            if _extract_ip(raw) or _looks_unreachable(raw):
                break
    finally:
        if tab is not None:
            try:
                await tab.close()
            except Exception as err:  # noqa: BLE001
                log('WARN', '[scraper]', f'Could not close the egress-check tab: {err}',
                    {'event': 'egress_tab_close_failed'})
    browser_ip = _extract_ip(raw)
    if not browser_ip:
        if not str(raw or '').strip():
            # Explicitly NOT the "unreachable => proxied" case. An empty document
            # proves nothing: it is equally consistent with a dead transport, and
            # treating it as proof of proxying is what allowed a run to proceed with
            # every navigation failing. Refuse.
            raise RuntimeError(
                f'The browser returned an EMPTY document from {EGRESS_ECHO_URL} after '
                f'3 attempts. That is not evidence of proxying — it is evidence the '
                f'browser cannot load anything. Check the relay/proxy transport.')
        if _looks_unreachable(raw):
            # The host reached this service moments ago (host_ip is set), so a
            # browser that could NOT reach it is provably not on the host's
            # direct path — an extension that failed to load would have left
            # the browser with plain direct internet. Treat as proxied-but-
            # destination-blocked: surfaced loudly, but not a reason to fail a
            # scrape that routes to a different host entirely. Refusing here
            # would repeat the false-negative that the target-visibility check
            # already cost us (run 30496893882).
            log('WARN', '[scraper]', 'Echo service unreachable from the browser but reachable from '
                'this host — traffic is not on the direct path (treating as proxied)', {
                    'event': 'proxied_egress_indirect',
                    'echo_url': EGRESS_ECHO_URL,
                })
            return None
        raise RuntimeError(
            f"Could not read the browser's egress IP by navigating to {EGRESS_ECHO_URL} "
            f"(page body was {str(raw)[:160]!r}) — refusing to scrape unverified"
        )
    if not host_ip:
        raise RuntimeError(
            f"Could not determine this host's egress IP from {EGRESS_ECHO_URL}, so "
            f"'am I proxied?' is unanswerable (browser reported {browser_ip}) — "
            "refusing to scrape unverified"
        )
    if browser_ip == host_ip:
        raise RuntimeError(
            f"Browser egress IP {browser_ip} equals this host's own IP — traffic is "
            'UNPROXIED. The MV3 proxy extension carries both the proxy route and its '
            'credentials, so a silent non-load means direct scraping from this host. '
            'Branded Chrome removed --load-extension in 137 and its opt-out in 142; '
            'use unbranded Chromium or Chrome for Testing.'
        )
    log('INFO', '[scraper]', 'Proxied egress confirmed', {
        'event': 'proxied_egress_verified',
        'browser_ip_suffix': browser_ip.rsplit('.', 1)[-1] if '.' in browser_ip else '?',
        'differs_from_host': True,
    })
    return browser_ip

async def log_browser_targets(page):
    """Log the target list — diagnostic only, never a gate.

    Target visibility is exactly what proved unreliable for judging whether the
    extension loaded, so this records what we saw without deciding anything.
    """
    try:
        targets = await page.send(uc.cdp.target.get_targets())
        seen = sorted(f'{getattr(t, "type_", "?")}:{getattr(t, "url", "?")[:80]}' for t in targets)
    except Exception as err:  # noqa: BLE001
        # Diagnostic only — it must never gate a scrape (a false negative here
        # already cost us run 30496893882). nodriver's Browser has no .send() on
        # this version, so this is expected to no-op rather than to work.
        log('WARN', '[scraper]', f'Could not enumerate targets: {err}',
            {'event': 'target_enumeration_failed'})
        return []
    log('INFO', '[scraper]', 'Browser targets', {'event': 'browser_targets', 'targets': seen})
    return seen

# ---------------------------------------------------------------------------
# C7 (rung L2) — the bandwidth guard, layer one: launch flags.
#
# A working proxy makes Chrome's OWN background traffic a billable line item. One
# run billed ~1.76 GB (~$6.60) to edgedl.me.gvt1.com against ~2.7 MB of actual
# scraping: 99.9% of the spend was Chrome talking to Google. These flags stop it at
# the source; the relay's blocklist is layer two, because a flag that silently
# stops working leaves no trace and a future edit can drop one.
#
# DEFAULT OFF locally (an unproxied run costs nothing); the workflow pins it ON.
# ---------------------------------------------------------------------------
BANDWIDTH_GUARD = (os.environ.get('SCRAPER_BANDWIDTH_GUARD') or '').strip() == '1'

BANDWIDTH_GUARD_ARGS = [
    '--disable-background-networking',      # umbrella: component update, SB, translate, autofill
    '--disable-component-update',           # the 1.76 GB one, explicitly
    '--disable-sync',
    '--disable-default-apps',
    '--disable-client-side-phishing-detection',
    '--disable-domain-reliability',
    '--safebrowsing-disable-auto-update',
    '--metrics-recording-only',
]

# Feature-level equivalents; merged into the SINGLE --disable-features switch
# (Chrome honors only the last occurrence, which build_browser_args enforces).
BANDWIDTH_GUARD_FEATURES = (
    'Translate,OptimizationHints,OptimizationGuideModelDownloading,'
    'MediaRouter,AutofillServerCommunication,InterestFeedContentSuggestions,'
    'CalculateNativeWinOcclusion'
)

NODRIVER_DEFAULT_ARGS = [
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-service-autorun',
    '--no-default-browser-check',
    '--homepage=about:blank',
    '--no-pings',
    '--password-store=basic',
    '--disable-infobars',
    '--disable-breakpad',
    '--disable-dev-shm-usage',
    '--disable-session-crashed-bubble',
    '--disable-search-engine-choice-screen',
]

# How long to wait for Chrome's DevTools endpoint. nodriver's own budget is a
# hardcoded 2.25s (browser.py:425-449) which a cold profile on a CI runner
# exceeds just creating its databases — the entire reason we launch and poll
# ourselves. Generous by default; an unresponsive browser still fails loudly.
DEVTOOLS_READY_TIMEOUT_S = float(os.environ.get('SCRAPER_DEVTOOLS_TIMEOUT_S') or '60')

# Chrome processes we spawned, per worker — so teardown kills a pid we OWN
# rather than pattern-matching the process table (never `pkill chrome`: this
# also runs on the operator's own desktop).
_spawned_browsers = {}


# ---------------------------------------------------------------------------
# C6 (rung L2) — geo enforcement.
#
# Decodo selects geography by HOSTNAME + PORT BAND, not by a username key. An
# earlier `;country=CA` username append was investigated and REMOVED as incorrect
# (aedd4cd1, 2026-03-15) — do not reintroduce it without a live curl proof, the way
# the `user-` prefix fact was proved.
#
# `gate.decodo.com:10001` draws from the global rotating pool and is geo-fenced by
# the AIC portal; `ca.decodo.com` sticky ports (20001-29999) are the Canadian lane.
# Scraping a Toronto municipal portal from a Brazilian exit IP is a first-order bot
# signal, and we were doing exactly that: observed exits included 186.225.225.102.
# ---------------------------------------------------------------------------
GEO_FENCED_PROXY_HOSTS = ('gate.decodo.com',)
CANADIAN_PROXY_HOST_HINT = 'ca.decodo.com'


def assert_proxy_geo_is_canadian(host=None, port=None):
    """Refuse to scrape through a geo-fenced or non-Canadian proxy lane.

    Fatal by design when proxying: a wrong-country exit IP must stop the run, not
    quietly produce a scrape the portal is already suspicious of.
    """
    host = (PROXY_HOST if host is None else host or '').strip().lower()
    if not host:
        return
    for fenced in GEO_FENCED_PROXY_HOSTS:
        if host == fenced or host.endswith('.' + fenced):
            raise RuntimeError(
                f'PROXY_HOST={host!r} is the global rotating gateway, which the AIC '
                f'portal geo-fences (aedd4cd1). Use {CANADIAN_PROXY_HOST_HINT} with a '
                f'sticky port in 20001-29999 so the exit IP is Canadian.')
    if CANADIAN_PROXY_HOST_HINT not in host:
        log('WARN', '[scraper]',
            f'PROXY_HOST={host!r} is not the known Canadian lane '
            f'({CANADIAN_PROXY_HOST_HINT}); the exit IP country is unverified.',
            {'event': 'proxy_geo_unverified', 'proxy_host': host})
        return
    resolved = int(port if port is not None else (PROXY_PORT or 0) or 0)
    if resolved and not (20001 <= resolved <= 29999):
        raise RuntimeError(
            f'PROXY_PORT={resolved} is outside the sticky band 20001-29999 on '
            f'{host}. Port 20000 is the ROTATING pool: the exit IP changes '
            f'mid-session and cannot be pinned to one Canadian address.')


# ---------------------------------------------------------------------------
# C1 (WF2 restore, rung L1) — ATTACH MODE, gated OFF by default.
#
# nodriver launches Chrome itself by default, and on a CI runner that fails four
# ways at once: its DevTools connect budget is a hardcoded ~2.25 s (browser.py) that
# a cold profile exceeds just creating its databases; it never reads
# DevToolsActivePort, so if Chrome picks a different port nodriver is permanently
# blind; it PIPEs Chrome's stdio and never drains it, so a full 64 KB buffer stalls
# startup; and it raises from INSIDE start(), leaving no handle to kill the browser
# it just spawned — that orphan then holds the profile and every retry fails
# identically.
#
# Launching Chrome ourselves fixes all four, because we own the pid. The cost is
# that we must supply nodriver's own default flags (it contributes none on the
# attach path) and do our own teardown — `browser.stop()` cannot kill a process
# nodriver did not spawn.
#
# DEFAULT OFF: the attested local path is nodriver's own launch, and this rung must
# not change it. The workflow turns it on for the runner.
# ---------------------------------------------------------------------------
ATTACH_MODE = (os.environ.get('SCRAPER_ATTACH_MODE') or '').strip() == '1'


def attach_mode_enabled():
    """True when we spawn Chrome and nodriver merely attaches."""
    return ATTACH_MODE


# A WAF-block loop rotates the session on every trap, and each rotation costs a
# full cold browser start over metered proxy bandwidth: one run spent ~1.76 GB
# (~$6.60) that way. Rotation is correct; UNBOUNDED rotation is a cost incident.
# Unlimited by default (the attested local path is unmetered); the workflow pins it.
MAX_BROWSER_LAUNCHES = int(os.environ.get('SCRAPER_MAX_BROWSER_LAUNCHES') or '0')
_browser_launch_count = [0]


def find_free_port():
    """Ask the OS for a free ephemeral port.

    Inherently TOCTOU (the port is unreserved between here and Chrome's bind —
    the same race as nodriver/core/util.py:139-143), which is why
    wait_for_devtools falls back to reading DevToolsActivePort: if Chrome could
    not bind this port it picks another, stays alive, and writes the real one
    there.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]
    finally:
        sock.close()

def read_devtools_active_port(profile_dir):
    """Read the port Chrome ACTUALLY bound, or None.

    Chrome writes `DevToolsActivePort` into the profile dir: line 1 is the
    port, line 2 the browser ws path. nodriver never reads this file (zero
    references package-wide), which is why a failed port bind leaves it
    permanently blind to a live browser.
    """
    path = os.path.join(profile_dir, 'DevToolsActivePort')
    try:
        with open(path, 'r', errors='replace') as fh:
            first = fh.readline().strip()
        return int(first) if first.isdigit() else None
    except (OSError, ValueError):
        return None

def wait_for_devtools(port, proc=None, profile_dir=None, timeout=None):
    """Poll until Chrome's DevTools HTTP endpoint answers. Returns (port, info).

    Replaces nodriver's hardcoded 2.25s budget (its five probes expire while a
    cold CI profile is still creating its favicon/quota/password-store
    databases). Raises a RuntimeError that NAMES the cause — elapsed time, the
    port, and the process return code — rather than nodriver's cause-agnostic
    "Failed to connect to browser".
    """
    timeout = DEVTOOLS_READY_TIMEOUT_S if timeout is None else timeout
    deadline = time.time() + timeout
    candidates = [port]
    while time.time() < deadline:
        for candidate in list(candidates):
            try:
                with urllib.request.urlopen(
                        f'http://127.0.0.1:{candidate}/json/version', timeout=5) as resp:
                    info = json.loads(resp.read().decode('utf-8', errors='replace'))
            except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError):
                continue  # not listening yet — that is the normal case here
            else:
                if candidate != port:
                    log('WARN', '[scraper]', 'Chrome bound a different debugging port than requested',
                        {'event': 'devtools_port_drift', 'requested': port, 'actual': candidate})
                return candidate, info
        if proc is not None and proc.poll() is not None:
            raise RuntimeError(
                f'Chrome exited during startup (returncode={proc.returncode}) before its '
                f'DevTools endpoint on port {port} answered — see the chrome_launch_log dump'
            )
        # Chrome may have bound a port other than the one we asked for (see
        # find_free_port); DevToolsActivePort is the only place it says so.
        if profile_dir:
            actual = read_devtools_active_port(profile_dir)
            if actual and actual not in candidates:
                candidates.append(actual)
        time.sleep(0.25)
    raise RuntimeError(
        f'Chrome DevTools endpoint did not answer on port {port} within {timeout:.0f}s '
        f'(process alive={proc is None or proc.poll() is None}) — raise '
        f'SCRAPER_DEVTOOLS_TIMEOUT_S if this runner is merely slow'
    )


# Hard ceiling on Chrome spawns per process. A WAF-block loop rotates the
# session on every trap, and each rotation is a fresh browser: run 30506470111
# logged 102 WAF traps -> 116 Chrome launches, and since every cold launch
# re-downloads Chrome's components through the metered proxy that loop alone
# accounted for ~1.76 GB (~$6.60). Rotation is correct behaviour; unbounded
# rotation is a cost incident. Fail loudly instead of spending.
def launch_chrome(browser_args, worker_id=None):
    """Spawn Chrome ourselves so we own its lifetime. Returns the Popen.

    We launch rather than let nodriver do it because nodriver: gives the
    handshake only 2.25s, never reads DevToolsActivePort, PIPEs stdio it never
    drains, and raises from inside start() — leaving no handle to kill the
    browser it just spawned (which then holds the profile and breaks every
    retry). Owning the process fixes all four.
    """
    _browser_launch_count[0] += 1
    # 0 = unlimited (the attested local path is unmetered). Without this guard a
    # default of 0 would refuse the very first launch.
    if MAX_BROWSER_LAUNCHES and _browser_launch_count[0] > MAX_BROWSER_LAUNCHES:
        raise RuntimeError(
            f'Refusing to launch Chrome #{_browser_launch_count[0]}: exceeded '
            f'SCRAPER_MAX_BROWSER_LAUNCHES={MAX_BROWSER_LAUNCHES}. This is a COST ceiling, not a stealth signal — do not read it as CDP compromise. A WAF-block loop '
            'rotates the session on every trap and each rotation costs a full cold '
            'browser start over metered proxy bandwidth — stop, do not spend.'
        )
    exe = str(_resolve_chrome_executable())
    kwargs = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL,
              'stdin': subprocess.DEVNULL}
    if sys.platform != 'win32':
        # Own process group: Chrome's renderer/GPU children must die with it.
        kwargs['start_new_session'] = True
    proc = subprocess.Popen([exe, *browser_args], **kwargs)
    _spawned_browsers[worker_id] = proc
    return proc

def _resolve_chrome_executable():
    from nodriver.core.config import find_chrome_executable
    return find_chrome_executable()

async def stop_and_terminate(browser, worker_id=None):
    """Close the CDP session AND kill the browser process we spawned.

    Both halves are required in attach mode: browser.stop() only disconnects
    the websocket. nodriver's connect_existing path never populates
    `_process`/`_process_pid` (core/browser.py:370-372 skips the spawn block),
    so stop()'s own terminate/kill calls hit None inside a swallowed
    `except (Exception,)`, and its last-resort branch tests
    `browser_process_pid` — a typo for `_process_pid` — so it never fires.
    Calling stop() alone therefore leaves a live Chrome holding our profile
    dir, which clear_stale_profile_locks would then unlock for a SECOND
    concurrent Chrome on the same profile (SQLite corruption, not just a leak).
    """
    if browser is not None:
        try:
            browser.stop()
        except Exception:  # noqa: BLE001
            log('WARN', '[scraper]', 'browser.stop() failed; killing the process anyway',
                {'event': 'browser_stop_failed'})
    return terminate_spawned_chrome(worker_id)

def terminate_spawned_chrome(worker_id=None, timeout=8):
    """Kill the Chrome WE spawned for this worker, process group and all.

    Idempotent and never raises: teardown must not be able to fail a run.
    Deliberately pid-based — never `pkill chrome`, which on the operator's own
    desktop would kill their browser, and on a shared runner someone else's.
    """
    proc = _spawned_browsers.pop(worker_id, None)
    if proc is None or proc.poll() is not None:
        return False
    try:
        if sys.platform != 'win32':
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        else:
            proc.terminate()
    except OSError as err:
        log('WARN', '[scraper]', f'Could not signal spawned Chrome: {err}',
            {'event': 'chrome_terminate_failed'})
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            if sys.platform != 'win32':
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            else:
                proc.kill()
        except OSError:
            pass
    log('INFO', '[scraper]', 'Terminated spawned Chrome',
        {'event': 'chrome_terminated', 'worker_id': worker_id})
    return True


atexit.register(lambda: [terminate_spawned_chrome(w) for w in list(_spawned_browsers)])
# NOTE: the relay's own atexit teardown lands with the relay at rung L2. It holds
# live proxy credentials in its argv and must never outlive us.

def dump_chrome_launch_log(worker_id, max_lines=40):
    """Surface the tail of Chrome's OWN log after a bootstrap failure.

    This is the only channel that states why Chrome exited — nodriver's
    "Failed to connect to browser" is cause-agnostic and the process's
    stderr is not ours to read (nodriver owns the subprocess).
    """
    path = chrome_launch_log_path(worker_id)
    try:
        with open(path, 'r', errors='replace') as fh:
            lines = [ln.rstrip() for ln in fh if ln.strip()]
    except OSError as err:
        log('WARN', '[scraper]', f'No Chrome launch log to read at {path}: {err}',
            {'event': 'chrome_launch_log_missing'})
        return
    if not lines:
        log('WARN', '[scraper]', f'Chrome launch log at {path} is empty — Chrome likely died before initializing logging',
            {'event': 'chrome_launch_log_empty'})
        return
    log('ERROR', '[scraper]', 'Chrome launch log tail',
        {'event': 'chrome_launch_log', 'path': path, 'lines': lines[-max_lines:]})


async def bootstrap_session(worker_id=None, relay_url=None):
    """Launch Chrome via CDP and establish an AIC session with a warm entry.

    Runs headed whenever a proxy mode is selected (C9) -- headless-vs-headed is a
    first-order bot signal and the attested runs were headed. On the unproxied
    default path Chrome runs headless, which needs no display server.

    `relay_url` points Chrome at the local forwarder (rung L2). A caller that
    already owns a relay passes it in so a rotation can reuse the same local port
    without restarting the browser.
    """
    # Coherent fingerprint profile — viewport, platform, and UA match
    profile = random.choice(FINGERPRINT_PROFILES)
    browser_args, use_headless = build_browser_args(profile, relay_url=relay_url)

    # Persistent profile dir — reuse cookies/localStorage across runs
    profile_name = f'worker-{worker_id}' if worker_id else 'standalone'
    profile_dir = os.path.join(Path.home(), '.buildo-scraper', f'profile-{profile_name}')
    os.makedirs(profile_dir, exist_ok=True)
    clear_stale_profile_locks(profile_dir)   # K2
    log_chrome_diagnostics()                 # K7b — which binary actually ran

    if attach_mode_enabled():
        # C1 (rung L1): we spawn Chrome, nodriver only ATTACHES.
        port = find_free_port()
        launch_args, _ = build_browser_args(
            profile, debug_port=port, profile_dir=profile_dir,
            chrome_log=chrome_launch_log_path(worker_id), relay_url=relay_url)
        proc = launch_chrome(launch_args, worker_id=worker_id)
        # Our own readiness budget, replacing nodriver's hardcoded 2.25 s.
        wait_for_devtools(port, proc=proc, profile_dir=profile_dir)
        browser = await uc.start(host='127.0.0.1', port=port)
    else:
        browser = await uc.start(
            headless=use_headless,
            browser_args=browser_args,
            user_data_dir=profile_dir,
        )
    try:
        page = await browser.get('about:blank')

        # C8: BEFORE the first navigation, matching v2's ordering — the entry
        # page and setup.do must load as skeletons, not full pages.
        if resource_blocking_enabled():
            await enable_resource_blocking(page)

        # Fix headless screen dimensions to match viewport (nodriver#2242)
        await inject_screen_overrides(page, profile)

        # Warm bootstrap: random entry URL for referrer chain variation
        entry_url = random.choice(ENTRY_URLS)
        try:
            page = await browser.get(entry_url, new_tab=False)
            await inject_screen_overrides(page, profile)
            await page.sleep(random.uniform(1.5, 4.0))
        except Exception as err:
            # Non-fatal — the entry site only shapes the referrer chain — but NOT
            # silent. A bare `except: pass` here hid a completely broken transport:
            # every navigation was failing and the first visible symptom was
            # `fetch()` throwing TypeError three layers later, which the scraper
            # then mislabelled as a WAF block.
            log('WARN', '[scraper]', f'Warm entry failed ({entry_url}): {err}',
                {'event': 'warm_entry_failed', 'url': entry_url})

        # Navigate to the AIC portal, and PROVE we landed on it.
        page = await browser.get(f'{AIC_BASE}/setup.do?action=init', new_tab=False)
        await inject_screen_overrides(page, profile)
        await page.sleep(random.uniform(0.8, 2.0))
        await assert_on_aic_origin(page)
        # R0: what the portal page actually pulled in, by host — the input to
        # any blocklist decision. Diagnostic only, never gates.
        await dump_resource_inventory(page, 'setup.do')
        return browser, page, profile
    except Exception as err:
        await stop_and_terminate(browser, worker_id)
        raise err


async def assert_on_aic_origin(page):
    """Fail loudly unless the page really is on the AIC portal's origin.

    WHY THIS EXISTS (2026-07-30, GH run 30560364087): every data call is issued as
    `page.evaluate(fetch(...))`, so it inherits the PAGE's origin. If the navigation
    to setup.do silently failed — a dead proxy, a tunnel refusal, a Chrome error
    page — the document is not on secure.toronto.ca and a same-origin `/jaxrs/`
    fetch throws `TypeError: Failed to fetch`. `safe_json_parse` sees a non-JSON
    body, returns `html_or_empty`, and the scraper reports `waf_blocked`.

    That is how a completely broken transport masqueraded as a WAF block for a
    whole run: 8 permits, 0 rows, every one logged as WAF. `browser.get()` does not
    raise on an error page, so nothing upstream of here noticed. Assert the origin
    instead of assuming it — a wrong origin is a bootstrap failure, not a scrape
    failure, and the two need completely different responses.
    """
    try:
        href = await page.evaluate('window.location.href', await_promise=False)
    except Exception as err:
        raise RuntimeError(f'Could not read the page URL after navigating to AIC: {err}')

    # NOTE: not sanitize_js_value() — that guards values being interpolated INTO a
    # JS snippet, and would reject a perfectly ordinary URL coming back OUT.
    href = href if isinstance(href, str) else str(href or '')
    if 'secure.toronto.ca' not in href:
        raise RuntimeError(
            f'Navigation to the AIC portal did not land on it — the document is at '
            f'{href[:120]!r}. Every /jaxrs/ call inherits this origin and would fail '
            f'with a TypeError that looks like a WAF block. Check the proxy transport '
            f'first: this is a bootstrap failure, not a scrape failure.')
    return href


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


async def bootstrap_with_retry(run_preflight=True, worker_id=None, relay_url=None):
    """Bootstrap with retry — 3 attempts with 10s backoff."""
    last_error = None
    for attempt in range(1, 4):
        try:
            browser, page, profile = await bootstrap_session(worker_id=worker_id, relay_url=relay_url)
            if attempt > 1:
                log('INFO', '[scraper]', f'Bootstrap succeeded on attempt {attempt}')

            # Preflight stealth check
            if run_preflight:
                passed, reason = await preflight_stealth_check(page)
                if not passed:
                    log('ERROR', '[scraper]', f'PREFLIGHT_FAIL: {reason}')
                    await stop_and_terminate(browser, worker_id)
                    raise Exception(f'Preflight failed: {reason}')
                log('INFO', '[scraper]', 'Preflight stealth check passed')

            if proxy_enabled():
                # C5 — auto-enabled by the mode, never a separate opt-in an
                # operator can forget. "Is the proxy configured?" is not "is it
                # working?": four months of runs recorded proxy_configured=true
                # while scraping direct. Assert the OUTCOME.
                await log_browser_targets(browser)
                await verify_proxied_egress(browser)
                # The egress check runs in its own tab, but PROVE the scraping
                # tab still holds the AIC origin before handing it to the scrape
                # loop — origin drift here surfaces three layers later as
                # 'TypeError: Failed to fetch' on every data call, which reads
                # as a WAF block (probe 30568655070).
                await assert_on_aic_origin(page)

            return browser, page, attempt, profile
        except Exception as err:
            last_error = err
            log('ERROR', '[scraper]', str(err), {'event': 'bootstrap_failed', 'attempt': attempt})
            # K7c: Chrome's own log is the only account of why a launch died —
            # nodriver's message is cause-agnostic. No-op unless we spawned it.
            dump_chrome_launch_log(worker_id)
            # Kill our Chrome before retrying AND after the final attempt. The raise
            # below exits the loop, so a before-next-attempt-only kill would leak the
            # last one — and a survivor holds the profile, making every subsequent
            # attempt fail identically for a reason that looks nothing like the cause.
            terminate_spawned_chrome(worker_id)
            if attempt < 3:
                log('INFO', '[scraper]', 'Retrying bootstrap in 10s...')
                await asyncio.sleep(10)
    raise Exception(f'Bootstrap failed after 3 attempts: {last_error}')


# ---------------------------------------------------------------------------
# Safe JSON parsing — treats non-JSON responses as WAF blocks
# ---------------------------------------------------------------------------
# The in-page catch in fetch_permit_chain returns exactly these keys; a dict
# whose keys fit inside this set is OUR sentinel, never portal data.
FETCH_SENTINEL_KEYS = {'error', 'message', 'at'}


def summarize_exception_details(exc):
    """One line naming the real page-side error an ExceptionDetails carries.

    nodriver's Tab.evaluate RETURNS cdp.runtime.ExceptionDetails instead of
    raising when the evaluated JS throws — or never parses at all. The
    exception's description holds the message JS would have printed
    ('TypeError: …'), the fact five cloud probes were missing.
    """
    parts = []
    remote = getattr(exc, 'exception', None)
    if remote is not None:
        desc = remote.description or remote.value or remote.class_name
        if desc:
            parts.append(str(desc).split('\n')[0])
    text = getattr(exc, 'text', None)
    if text and text not in ''.join(parts):
        parts.append(str(text))
    parts.append(f'at line {getattr(exc, "line_number", "?")}:{getattr(exc, "column_number", "?")}')
    return ' | '.join(parts)


async def evaluate_fetch(page, js, step_label):
    """Run one in-page fetch snippet and ALWAYS hand back a string.

    A page-side throw comes back as an ExceptionDetails OBJECT (nodriver does
    not raise); passing that onward is what crashed a run with
    "'ExceptionDetails' object has no attribute 'strip'". Convert every
    non-string into the same {error, message, at} sentinel the in-page catch
    produces, so all failures funnel through one classified path.
    """
    raw = await page.evaluate(js, await_promise=True)
    if isinstance(raw, str):
        return raw
    if isinstance(raw, uc.cdp.runtime.ExceptionDetails):
        detail = summarize_exception_details(raw)
        log('WARN', '[scraper]', f'page.evaluate threw at {step_label}: {detail}',
            {'event': 'evaluate_exception', 'step': step_label})
        return json.dumps({'error': 'EvaluateException', 'message': detail, 'at': step_label})
    log('WARN', '[scraper]', f'page.evaluate returned {type(raw).__name__} at {step_label}',
        {'event': 'evaluate_non_string', 'step': step_label})
    return json.dumps({'error': 'EvaluateNonString', 'message': repr(raw)[:200], 'at': step_label})


def safe_json_parse(raw, step_label=''):
    """Parse JSON, returning (data, None) on success or (None, error_snippet) on failure."""
    if not isinstance(raw, str):
        # Never string-op a non-string result — name its type instead.
        log('WARN', '[scraper]', f'Non-string result at {step_label}: {type(raw).__name__}')
        return None, f'non_string_result:{type(raw).__name__}'
    if not raw or raw.strip().startswith('<'):
        return None, 'html_or_empty'
    try:
        data = json.loads(raw)
        # Our own error sentinel: AbortController timeout, fetch error, or an
        # evaluate exception — legacy 1-key {error} and the 3-key shape both.
        if isinstance(data, dict) and 'error' in data and set(data) <= FETCH_SENTINEL_KEYS:
            message = data.get('message') or ''
            log('WARN', '[scraper]', f'Fetch error at {step_label}: {data["error"]}'
                + (f' — {message}' if message else ''), {'at': data.get('at', '')})
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
    step1 = await evaluate_fetch(page, f"""
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
            }} catch(e) {{ return JSON.stringify({{error: e.name || 'FetchError', message: String(e && e.message || e), at: String(e && e.stack || '').split('\\n')[0]}}); }}
            finally {{ clearTimeout(t); }}
        }})()
    """, 'step1:properties')

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
    step2 = await evaluate_fetch(page, f"""
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
            }} catch(e) {{ return JSON.stringify({{error: e.name || 'FetchError', message: String(e && e.message || e), at: String(e && e.stack || '').split('\\n')[0]}}); }}
            finally {{ clearTimeout(t); }}
        }})()
    """, 'step2:folders')

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
        step3 = await evaluate_fetch(page, f"""
            (async () => {{
                const ac = new AbortController();
                const t = setTimeout(() => ac.abort(), {FETCH_TIMEOUT_MS});
                try {{
                    const r = await fetch('{AIC_BASE}/jaxrs/search/detail/{folder_rsn}', {{
                        method: 'GET', headers: {{ Accept: 'application/json' }}, signal: ac.signal
                    }});
                    return await r.text();
                }} catch(e) {{ return JSON.stringify({{error: e.name || 'FetchError', message: String(e && e.message || e), at: String(e && e.stack || '').split('\\n')[0]}}); }}
                finally {{ clearTimeout(t); }}
            }})()
        """, f'step3:detail/{folder_rsn}')

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
            step4 = await evaluate_fetch(page, f"""
                (async () => {{
                    const ac = new AbortController();
                    const t = setTimeout(() => ac.abort(), {FETCH_TIMEOUT_MS});
                    try {{
                        const r = await fetch('{AIC_BASE}/jaxrs/search/status/{folder_rsn}/{process_rsn}', {{
                            method: 'GET', headers: {{ Accept: 'application/json' }}, signal: ac.signal
                        }});
                        return await r.text();
                    }} catch(e) {{ return JSON.stringify({{error: e.name || 'FetchError', message: String(e && e.message || e), at: String(e && e.stack || '').split('\\n')[0]}}); }}
                    finally {{ clearTimeout(t); }}
                }})()
            """, f'step4:status/{folder_rsn}/{process_rsn}')

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
        return {'searched': 1, 'scraped': 0, 'upserted': 0, 'outcome': 'address_not_found'}

    results = chain_result.get('results', [])
    folders = chain_result.get('folders', [])
    target_folders = [f for f in folders if f.get('folderSection') in TARGET_SECTIONS]

    if not target_folders:
        log('INFO', '[scraper]', f'{year_seq}: no target folders found')
        return {'searched': 1, 'scraped': 0, 'upserted': 0, 'outcome': 'no_target_folders'}

    log('INFO', '[scraper]', f'{year_seq}: {len(folders)} folders, {len(target_folders)} target permits', {
        'all': [f"{f['folderYear']} {f['folderSequence']} {f['folderSection']} [{f['statusDesc']}]" for f in folders]
    })

    scraped = 0
    upserted = 0
    enriched_updates = 0
    status_changes = 0
    saw_no_stages = False
    saw_no_link = False

    cur = conn.cursor()
    try:
        for result in results:
            if result.get('error'):
                log('INFO', '[scraper]', f"{result['permit_num']}: {result['error']}")
                # Permits with no_processes/no_status_link — set Permit Issued
                if result['error'] in ('no_processes', 'no_status_link'):
                    saw_no_link = True
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
                elif result['error'] == 'no_stages':
                    saw_no_stages = True
                    # The portal ANSWERED: the permit exists and no stage has
                    # been passed yet (the page lists only passed stages).
                    # Stamp last_scraped_at so the DB remembers we asked —
                    # without it the staleness monitor counts this permit
                    # never_scraped forever and the queue re-buys the same
                    # empty answer every cycle.
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

    if scraped > 0:
        outcome = 'scraped'
    elif saw_no_stages:
        outcome = 'no_stages'
    elif saw_no_link:
        outcome = 'no_inspection_link'
    else:
        outcome = 'no_target_folders'
    return {
        'searched': 1, 'scraped': scraped, 'upserted': upserted,
        'enriched_updates': enriched_updates, 'status_changes': status_changes,
        'outcome': outcome,
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
# Outcomes that are the portal's own confirmed answers — the permit exists
# and simply has no passed stage / no inspection link yet. NORMAL results
# (roughly half of in-flight permits post the passed-only portal change);
# they must trip neither the WAF-trap counter nor the miss-rate gate.
BENIGN_EMPTY_OUTCOMES = frozenset({'no_stages', 'no_inspection_link'})


def accumulate_result(tel, result):
    """Fold one permit's scrape result into the telemetry dict.

    The empty outcomes are NOT one thing (measurement run 30574728762 FAILed
    its gate at 41.7% by lumping them): `address_not_found`/`no_target_folders`
    are queue-anomalous (our own feed said this permit exists), while
    `no_stages`/`no_inspection_link` are the portal answering honestly. Only
    the anomalous class feeds `consecutive_empty` (the WAF-trap heuristic —
    G4: three legitimate answers must never force a pointless rotation).
    """
    tel['permits_attempted'] += 1
    if result.get('scraped', 0) > 0:
        tel['permits_found'] += 1
        tel['permits_scraped'] += result['scraped']
        tel['consecutive_empty'] = 0
    elif result.get('searched', 0) > 0 and result.get('scraped', 0) == 0:
        tel['not_found_count'] += 1
        outcome = result.get('outcome', 'address_not_found')
        breakdown = tel.setdefault('not_found_breakdown', {})
        breakdown[outcome] = breakdown.get(outcome, 0) + 1
        if outcome not in BENIGN_EMPTY_OUTCOMES:
            tel['consecutive_empty'] += 1
            tel['consecutive_empty_max'] = max(tel['consecutive_empty_max'], tel['consecutive_empty'])
    tel['total_upserted'] += result.get('upserted', 0)
    tel['enriched_updates'] += result.get('enriched_updates', 0)
    tel['status_changes'] += result.get('status_changes', 0)
    if result.get('retry_exhausted'):
        tel['proxy_errors'] += 1
        # WAF blocks (retry exhausted) should also trigger proxy rotation
        tel['consecutive_empty'] += WAF_TRAP_THRESHOLD  # force immediate rotation


def anomalous_miss_count(tel):
    """Misses that are genuinely anomalous — permit unknown to the portal."""
    breakdown = tel.get('not_found_breakdown', {})
    return sum(n for outcome, n in breakdown.items()
               if outcome not in BENIGN_EMPTY_OUTCOMES)


async def scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag='[scraper]', profile=None):
    """Core scrape loop for a list of year_seq combos. Mutates tel in place."""

    def accumulate(result):
        accumulate_result(tel, result)

    for i, year_seq in enumerate(year_seqs):
        progress_pct = (i + 1) / len(year_seqs) * 100
        elapsed = (time.time() * 1000 - start_ms) / 1000
        print(f"  {worker_tag} {i + 1} / {len(year_seqs)} ({progress_pct:.1f}%) — {elapsed:.1f}s")

        # WAF trap detection — rotate the EXIT IP, and on the proxied path do it
        # WITHOUT paying for a cold browser.
        if tel['consecutive_empty'] >= WAF_TRAP_THRESHOLD:
            log('WARN', worker_tag, f"WAF trap detected ({tel['consecutive_empty']} consecutive empty). Rotating...")
            try:
                worker = tel.get('_worker_id')
                if proxy_enabled():
                    # Restarting the relay on this worker's PINNED local port swaps
                    # the Decodo session — a new exit IP — while Chrome's
                    # --proxy-server keeps pointing at the same 127.0.0.1:PORT. The
                    # browser is NOT touched.
                    #
                    # This is the whole reason the relay beat the extension. The
                    # extension could only rotate by relaunching Chrome, and every
                    # cold start re-downloads Chrome's components through the metered
                    # proxy: 102 traps became 116 launches and ~1.76 GB (~$6.60).
                    # Rotation is correct; paying for a browser to get it is not.
                    terminate_spawned_relay(worker)
                    start_proxy_relay(
                        build_proxy_session_id(worker, int(time.time())), worker_id=worker)
                    # Re-enter the portal on the new exit IP. NOT about:blank: every
                    # /jaxrs/ call inherits the PAGE's origin, and an opaque origin
                    # makes each one throw 'TypeError: Failed to fetch' — probe
                    # 30568655070 failed its second permit exactly this way.
                    page = await browser.get(f'{AIC_BASE}/setup.do?action=init', new_tab=False)
                    if profile:
                        await inject_screen_overrides(page, profile)
                    await page.sleep(random.uniform(0.8, 2.0))
                    await assert_on_aic_origin(page)
                    log('INFO', worker_tag, 'Rotated exit IP without recycling the browser',
                        {'event': 'proxy_session_rotated', 'browser_recycled': False})
                else:
                    # Unproxied: there is no IP to rotate, so clearing session state
                    # means a new browser. Cold starts are free on an unmetered path.
                    await stop_and_terminate(browser, worker)
                    browser, page, attempts, profile = await bootstrap_with_retry(worker_id=worker)
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

        # Early abort on sustained ANOMALOUS misses (permit unknown to the
        # portal). Benign empties (no stage passed yet) are honest answers and
        # must not abort a healthy run — post the passed-only portal change
        # they are roughly half of all in-flight permits.
        if i >= 9 and (i + 1) % 10 == 0 and anomalous_miss_count(tel) / tel['permits_attempted'] >= 0.9:
            log('WARN', worker_tag, f"Early abort: {anomalous_miss_count(tel)}/{tel['permits_attempted']} anomalous misses")
            break

    return browser, page


def make_telemetry():
    """Create a fresh telemetry dict."""
    return {
        'permits_attempted': 0, 'permits_found': 0, 'permits_scraped': 0,
        'not_found_count': 0, 'not_found_breakdown': {}, 'enriched_updates': 0, 'proxy_errors': 0,
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
    # Gate on ANOMALOUS misses only (permit unknown to the portal). Benign
    # empties — no stage passed yet, no inspection link — are the portal's own
    # answers and gated them at 41.7%/50% "FAIL" on healthy runs.
    anomalous = anomalous_miss_count(tel)
    miss_rate = (anomalous / tel['permits_attempted'] * 100) if tel['permits_attempted'] > 0 else 0
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
                'not_found_breakdown': tel.get('not_found_breakdown', {}),
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
                # What the relay refused, and what it said. Without these a request
                # failure in the page is indistinguishable from a WAF block.
                'relay_blocked': _relay_summary()['blocked'],
                'relay_stderr_lines': _relay_summary()['lines'],
                'relay_stderr_samples': _relay_summary()['samples'],
                # L4: metered upstream bytes (what Decodo bills) + what the
                # resource filter did. bytes/permit is derivable from these.
                'relay_bytes_up': _relay_summary()['bytes_up'],
                'relay_bytes_down': _relay_summary()['bytes_down'],
                # WHERE the metered bytes went. Until this existed every
                # byte-budget claim was inference from a recon table.
                'relay_bytes_by_host': _relay_summary()['bytes_by_host'],
                'resource_blocking': resource_blocking_enabled(),
                'resources_allowed': _resource_filter_stats['allowed'],
                'resources_blocked': _resource_filter_stats['blocked'],
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
                    {'metric': 'no_stages_yet', 'value': tel.get('not_found_breakdown', {}).get('no_stages', 0), 'threshold': None, 'status': 'INFO'},
                    {'metric': 'no_inspection_link', 'value': tel.get('not_found_breakdown', {}).get('no_inspection_link', 0), 'threshold': None, 'status': 'INFO'},
                    {'metric': 'anomalous_miss_rate', 'value': f'{miss_rate:.1f}%', 'threshold': '< 20%', 'status': miss_status},
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
    relay_url = None
    try:
        if proxy_enabled():
            # C3 (rung L2): the relay holds the credentials so Chrome never sees
            # them. Started INSIDE the try so a relay failure is caught, reported
            # through PIPELINE_SUMMARY and leaves preflight_passed False — a
            # failure that escapes main() produces a silent, uncounted dead worker.
            relay_url = start_proxy_relay(
                build_proxy_session_id(tel['_worker_id']), worker_id=tel['_worker_id'])
        browser, page, bootstrap_attempts, profile = await bootstrap_with_retry(
            worker_id=tel['_worker_id'], relay_url=relay_url)
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
                await stop_and_terminate(browser, worker_id)
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

                    if proxy_enabled() and browser is not None:
                        # One batch = one exit IP, achieved WITHOUT a cold browser:
                        # restart the relay on this worker's pinned local port so
                        # Chrome's --proxy-server stays valid across the swap.
                        terminate_spawned_relay(worker_id)
                        relay_url = start_proxy_relay(
                            build_proxy_session_id(worker_id, int(time.time())),
                            worker_id=worker_id)
                        log('INFO', worker_tag,
                            f'Batch {batch_num}: rotated exit IP (browser retained)')

                    if browser is None:
                        # relay_url is REQUIRED here. Without it this bootstrap
                        # launches Chrome with no --proxy-server and the runner's
                        # datacenter IP reaches AIC directly during the warm entry,
                        # BEFORE the egress check can refuse it.
                        browser, page, attempts, profile = await bootstrap_with_retry(
                            worker_id=worker_id, relay_url=relay_url)
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
                                await stop_and_terminate(browser, worker_id)
                            except Exception:
                                pass
                            browser = None

                    # Browser TTL only — NOT "1 batch = 1 IP".
                    #
                    # The old condition recycled Chrome after every batch whenever a
                    # proxy was configured, which fused two independent things: the
                    # exit IP and the browser process. Rotating the IP is correct;
                    # buying a cold browser to do it is what turned 102 WAF traps into
                    # 116 launches and ~1.76 GB of metered traffic. The relay rotates
                    # the session on a pinned local port instead, so the browser now
                    # only recycles on its memory TTL.
                    if browser and batch_num % BROWSER_MAX_BATCHES == 0:
                        log('INFO', worker_tag, f'Browser TTL: recycling after {BROWSER_MAX_BATCHES} batches')
                        await stop_and_terminate(browser, worker_id)
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
        if proxy_enabled():
            # The relay's argv carries live credentials — it must never outlive us.
            terminate_spawned_relay(tel.get('_worker_id'))
        if browser:
            try:
                await stop_and_terminate(browser, tel.get('_worker_id'))
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
