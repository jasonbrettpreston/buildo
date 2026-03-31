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

SPEC LINK: docs/specs/38_inspection_scraping.md
"""

import asyncio
import atexit
import json
import os
import random
import re
import shutil
import stat
import sys
import time
from datetime import datetime
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
MAX_RETRIES = 3
RETRY_BASE_MS = 2000
WAF_TRAP_THRESHOLD = 20
SESSION_REFRESH_INTERVAL = 200

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

BATCH_SIZE = int(os.environ.get('SCRAPE_BATCH_SIZE', '10'))
MAX_PERMITS = int(os.environ.get('SCRAPE_MAX_PERMITS', '0'))  # 0 = unlimited

# Proxy configuration (Decodo residential rotating proxy)
PROXY_HOST = os.environ.get('PROXY_HOST', '')
PROXY_PORT = os.environ.get('PROXY_PORT', '')
PROXY_USER = os.environ.get('PROXY_USER', '')
PROXY_PASS = os.environ.get('PROXY_PASS', '')

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


# ---------------------------------------------------------------------------
# Sanitization — validate values before interpolating into page.evaluate JS
# ---------------------------------------------------------------------------
def sanitize_js_value(val):
    """Ensure a value is safe to interpolate into JavaScript. Strip non-alphanumeric chars except spaces."""
    s = str(val)
    if not re.match(r'^[A-Za-z0-9 _\-]+$', s):
        raise ValueError(f"Unsafe value for JS interpolation: {s!r}")
    return s


# ---------------------------------------------------------------------------
# Status normalization (matches Spec 38 §3.4)
# ---------------------------------------------------------------------------
def normalize_status(raw):
    s = (raw or '').strip().lower()
    if s == 'outstanding': return 'Outstanding'
    if s in ('pass', 'passed'): return 'Passed'
    if s in ('fail', 'failed', 'not passed'): return 'Not Passed'
    if s in ('partial', 'partially completed'): return 'Partial'
    return None


def compute_enriched_status(stages):
    """Compute enriched_status from scraped inspection stages."""
    if not stages:
        return None
    statuses = [normalize_status(s.get('status')) for s in stages]
    statuses = [s for s in statuses if s]
    if not statuses:
        return None
    if any(s == 'Not Passed' for s in statuses): return 'Not Passed'
    if all(s == 'Outstanding' for s in statuses): return 'Permit Issued'
    if all(s == 'Passed' for s in statuses): return 'Inspections Complete'
    return 'Active Inspection'


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
        port=int(os.environ.get('PG_PORT', '5432')),
        dbname=os.environ.get('PG_DATABASE', 'buildo'),
        user=os.environ.get('PG_USER', 'postgres'),
        password=os.environ.get('PG_PASSWORD', 'postgres'),
    )


# ---------------------------------------------------------------------------
# Proxy — Decodo sticky sessions via Manifest V3 extension
# ---------------------------------------------------------------------------
def build_proxy_session_id(worker_id, timestamp=None):
    """Build a unique Decodo sticky session ID for this worker."""
    ts = timestamp or int(time.time())
    return f'buildo-worker-{worker_id}-{ts}'


def build_proxy_extension(session_id):
    """Create a temp Manifest V3 extension that handles proxy auth silently.

    Chromium ignores user:pass in --proxy-server URLs. The only way to
    authenticate with a proxy in headless Chrome is via the
    chrome.webRequest.onAuthRequired event in a background service worker.

    Returns the extension directory path, or None if proxy is not configured.
    """
    if not PROXY_HOST:
        return None

    user_with_session = f'{PROXY_USER}-session-{session_id}' if PROXY_USER else session_id
    ext_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        '..', '.proxy_ext', f'decodo_{session_id}',
    )
    ext_dir = os.path.abspath(ext_dir)
    os.makedirs(ext_dir, exist_ok=True)

    manifest = {
        "version": "1.0.0",
        "manifest_version": 3,
        "name": "Decodo Proxy Auth",
        "permissions": ["proxy", "webRequest", "webRequestAuthProvider"],
        "host_permissions": ["<all_urls>"],
        "background": {"service_worker": "background.js"},
    }

    background_js = f"""
var config = {{
    mode: "fixed_servers",
    rules: {{
        singleProxy: {{ scheme: "http", host: "{PROXY_HOST}", port: parseInt("{PROXY_PORT}") }},
        bypassList: ["localhost"]
    }}
}};
chrome.proxy.settings.set({{value: config, scope: "regular"}}, function() {{}});
chrome.webRequest.onAuthRequired.addListener(
    function(details, callback) {{
        callback({{ authCredentials: {{ username: "{user_with_session}", password: "{PROXY_PASS}" }} }});
    }},
    {{urls: ["<all_urls>"]}},
    ['asyncBlocking']
);
"""

    with open(os.path.join(ext_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f)
    with open(os.path.join(ext_dir, 'background.js'), 'w') as f:
        f.write(background_js)

    # Restrict permissions — credentials are in background.js
    if sys.platform != 'win32':
        os.chmod(ext_dir, stat.S_IRWXU)  # 700: owner only

    # Register atexit handler as secondary cleanup (catches crashes before finally)
    atexit.register(cleanup_proxy_extension, ext_dir)

    return ext_dir


def cleanup_proxy_extension(ext_dir):
    """Remove temporary proxy extension directory and prune empty parent."""
    if ext_dir and os.path.exists(ext_dir):
        try:
            shutil.rmtree(ext_dir)
        except OSError as err:
            log('WARN', '[scraper]', f'Failed to clean up proxy extension: {err}')
        # Prune parent .proxy_ext/ if empty
        parent = os.path.dirname(ext_dir)
        try:
            if parent and os.path.isdir(parent) and not os.listdir(parent):
                os.rmdir(parent)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Browser — nodriver CDP (no WebDriver)
# ---------------------------------------------------------------------------
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


async def bootstrap_session(proxy_ext_dir=None, worker_id=None):
    """Launch Chrome via CDP and establish AIC session with warm entry.

    When proxy is configured, runs headed (not headless) because
    --load-extension is required for MV3 proxy auth and Chrome's
    headless mode does not support extensions.
    """
    # Coherent fingerprint profile — viewport, platform, and UA match
    profile = random.choice(FINGERPRINT_PROFILES)
    vw, vh = profile['w'], profile['h']
    browser_args = [
        f'--window-size={vw},{vh}',
        '--disable-blink-features=AutomationControlled',  # suppress cdc_ variables
    ]
    use_headless = True
    if proxy_ext_dir:
        browser_args.append(f'--load-extension={proxy_ext_dir}')
        use_headless = False  # Extensions require headed mode

    # Persistent profile dir — reuse cookies/localStorage across runs
    profile_name = f'worker-{worker_id}' if worker_id else 'standalone'
    profile_dir = os.path.join(Path.home(), '.buildo-scraper', f'profile-{profile_name}')
    os.makedirs(profile_dir, exist_ok=True)

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


async def bootstrap_with_retry(run_preflight=True, proxy_ext_dir=None, worker_id=None):
    """Bootstrap with retry — 3 attempts with 10s backoff."""
    last_error = None
    for attempt in range(1, 4):
        try:
            browser, page, profile = await bootstrap_session(proxy_ext_dir=proxy_ext_dir, worker_id=worker_id)
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
        return json.loads(raw), None
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
        fetch('{AIC_BASE}/jaxrs/search/properties', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
            body: JSON.stringify({{
                ward: '', folderYear: '{year}', folderSequence: '{sequence}',
                folderSection: '', folderRevision: '', folderType: '',
                address: '', searchType: '0',
                mapX: null, mapY: null,
                propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0'
            }})
        }}).then(r => r.text())
    """, await_promise=True)

    props, err = safe_json_parse(step1, 'step1:properties')
    if err:
        return {'waf_blocked': True, 'properties': [], 'results': []}
    if not props:
        return {'properties': [], 'results': []}

    property_rsn = sanitize_js_value(props[0].get('propertyRsn', ''))

    # Step 2: Get folders
    step2 = await page.evaluate(f"""
        fetch('{AIC_BASE}/jaxrs/search/folders', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
            body: JSON.stringify({{
                ward: '', folderYear: '{year}', folderSequence: '{sequence}',
                folderSection: '', folderRevision: '', folderType: '',
                address: '', searchType: '0', propertyRsn: '{property_rsn}',
                mapX: null, mapY: null,
                propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0'
            }})
        }}).then(r => r.text())
    """, await_promise=True)

    folders, err = safe_json_parse(step2, 'step2:folders')
    if err:
        return {'waf_blocked': True, 'properties': props, 'results': []}
    target_folders = [f for f in folders if f.get('folderSection') in TARGET_SECTIONS]

    results = []
    for folder in target_folders:
        permit_num = f"{folder['folderYear']} {folder['folderSequence']} {folder['folderSection']}"
        folder_rsn = sanitize_js_value(folder['folderRsn'])

        # Step 3: Get detail
        step3 = await page.evaluate(f"""
            fetch('{AIC_BASE}/jaxrs/search/detail/{folder_rsn}', {{
                method: 'GET', headers: {{ Accept: 'application/json' }}
            }}).then(r => r.text())
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
            process_rsn = sanitize_js_value(proc.get('processRsn'))
            step4 = await page.evaluate(f"""
                fetch('{AIC_BASE}/jaxrs/search/status/{folder_rsn}/{process_rsn}', {{
                    method: 'GET', headers: {{ Accept: 'application/json' }}
                }}).then(r => r.text())
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
                        "UPDATE permits SET enriched_status = 'Permit Issued' "
                        "WHERE permit_num = %s AND enriched_status IS DISTINCT FROM 'Permit Issued'",
                        (result['permit_num'],)
                    )
                    if cur.rowcount > 0:
                        enriched_updates += 1
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

            # Touch scraped_at unconditionally for 7-day cooldown
            cur.execute(
                "UPDATE permit_inspections SET scraped_at = NOW() WHERE permit_num = %s",
                (result['permit_num'],)
            )

            # Compute and write enriched_status
            enriched = compute_enriched_status(result['stages'])
            cur.execute(
                "UPDATE permits SET enriched_status = %s "
                "WHERE permit_num = %s AND enriched_status IS DISTINCT FROM %s",
                (enriched, result['permit_num'], enriched)
            )
            if cur.rowcount > 0:
                enriched_updates += 1

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
async def scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag='[scraper]', proxy_ext_dir=None, profile=None):
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
                # Rotate proxy session to get a new IP
                if PROXY_HOST:
                    cleanup_proxy_extension(proxy_ext_dir)
                    new_session_id = build_proxy_session_id(
                        tel.get('_worker_id', 'standalone'), int(time.time()))
                    proxy_ext_dir = build_proxy_extension(new_session_id)
                    log('INFO', worker_tag, f'Proxy session rotated: {new_session_id}')
                browser, page, attempts, profile = await bootstrap_with_retry(proxy_ext_dir=proxy_ext_dir, worker_id=tel.get('_worker_id'))
                tel['session_bootstraps'] += attempts
                tel['consecutive_empty'] = 0
            except Exception as err:
                tel['session_failures'] += 1
                log('ERROR', worker_tag, str(err), {'event': 'session_bootstrap_failed'})
                break

        # Periodic session refresh (non-proxy only — proxy mode uses 1 batch = 1 IP)
        if i > 0 and i % SESSION_REFRESH_INTERVAL == 0 and not PROXY_HOST:
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
                'proxy_configured': bool(os.environ.get('PROXY_HOST')),
                'proxy_host': os.environ.get('PROXY_HOST'),
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

    # Build per-worker proxy extension if proxy is configured
    proxy_ext_dir = None
    if PROXY_HOST and args['worker_id']:
        session_id = build_proxy_session_id(args['worker_id'])
        proxy_ext_dir = build_proxy_extension(session_id)
        log('INFO', worker_tag, f'Proxy extension created: {PROXY_HOST}:{PROXY_PORT} session={session_id}')
    elif PROXY_HOST:
        session_id = build_proxy_session_id('standalone')
        proxy_ext_dir = build_proxy_extension(session_id)
        log('INFO', worker_tag, f'Proxy extension created: {PROXY_HOST}:{PROXY_PORT} session={session_id}')

    log('INFO', worker_tag, 'Launching browser via nodriver (CDP)...')

    browser = None
    try:
        browser, page, bootstrap_attempts, profile = await bootstrap_with_retry(proxy_ext_dir=proxy_ext_dir, worker_id=tel['_worker_id'])
        tel['session_bootstraps'] = bootstrap_attempts
        log('INFO', worker_tag, 'WAF session established (no WebDriver)')

        conn = get_db_connection()

        try:
            if args['mode'] == 'single':
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

            elif args['mode'] == 'worker':
                # Worker mode: read year_seqs from batch file (legacy — used by old orchestrator)
                if not args['batch_file']:
                    log('ERROR', worker_tag, 'Worker mode requires --batch-file')
                    sys.exit(1)
                with open(args['batch_file'], 'r') as f:
                    year_seqs = json.load(f)
                log('INFO', worker_tag, f'Worker mode: {len(year_seqs)} year_seqs from {args["batch_file"]}')
                browser, page = await scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag, proxy_ext_dir=proxy_ext_dir, profile=profile)

            elif args['mode'] == 'db-queue':
                # DB-queue mode: 1 batch = 1 IP address.
                # Each batch gets a fresh proxy URL (new sticky session), fresh Chrome.
                # After scraping, browser is killed. No IP sees more than BATCH_SIZE permits.
                worker_id = args['worker_id'] or 'standalone'
                batch_num = 0

                # In db-queue mode, the outer bootstrap is only for non-proxy runs.
                # For proxy runs, each batch builds its own session. Kill the initial browser.
                if browser and PROXY_HOST:
                    browser.stop()
                    browser = None

                while True:
                    # Cap check: stop claiming if we've hit the max permits limit
                    if MAX_PERMITS > 0 and tel['permits_attempted'] >= MAX_PERMITS:
                        log('INFO', worker_tag, f"Max permits cap reached ({tel['permits_attempted']}/{MAX_PERMITS})")
                        break

                    # Random batch size (5-15) clamped to remaining cap
                    random_batch = random.randint(BATCH_SIZE_MIN, BATCH_SIZE_MAX)
                    remaining = MAX_PERMITS - tel['permits_attempted'] if MAX_PERMITS > 0 else random_batch
                    claim_size = min(random_batch, remaining)

                    year_seqs = claim_batch_from_queue(conn, worker_id, claim_size)
                    if not year_seqs:
                        log('INFO', worker_tag, 'No more pending items in queue')
                        break
                    batch_num += 1

                    # Fresh proxy session per batch (new Decodo sticky session = new IP)
                    if PROXY_HOST:
                        cleanup_proxy_extension(proxy_ext_dir)
                        batch_session_id = build_proxy_session_id(worker_id, int(time.time()))
                        proxy_ext_dir = build_proxy_extension(batch_session_id)
                        log('INFO', worker_tag, f'Batch {batch_num}: new IP session={batch_session_id}')

                    if browser is None:
                        browser, page, attempts, profile = await bootstrap_with_retry(proxy_ext_dir=proxy_ext_dir, worker_id=worker_id)
                        tel['session_bootstraps'] += attempts
                        log('INFO', worker_tag, f'Batch {batch_num}: browser bootstrapped')

                    log('INFO', worker_tag, f'Batch {batch_num}: claimed {len(year_seqs)} year_seqs')
                    try:
                        browser, page = await scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag, proxy_ext_dir=proxy_ext_dir, profile=profile)
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

                    # Kill browser after each batch (1 batch = 1 IP)
                    if PROXY_HOST and browser:
                        browser.stop()
                        browser = None

            else:
                # Standalone batch mode: query DB for eligible permits
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("""
                    SELECT year_seq FROM (
                        SELECT DISTINCT SUBSTRING(p.permit_num FROM '^[0-9]{2} [0-9]+') AS year_seq,
                               MAX(p.issued_date) AS max_issued
                        FROM permits p
                        LEFT JOIN permit_inspections pi ON pi.permit_num = p.permit_num
                        WHERE p.status = 'Inspection'
                          AND p.permit_type = ANY(%s)
                          AND p.issued_date IS NOT NULL
                          AND p.issued_date > NOW() - INTERVAL '3 years'
                          AND (p.enriched_status IS NULL
                               OR p.enriched_status IN ('Permit Issued', 'Active Inspection', 'Not Passed'))
                          AND (pi.scraped_at IS NULL OR pi.scraped_at < NOW() - INTERVAL '7 days')
                          AND SUBSTRING(p.permit_num FROM '^[0-9]{2}')::int <= EXTRACT(YEAR FROM CURRENT_DATE) %% 100
                        GROUP BY year_seq
                        ORDER BY max_issued DESC
                        LIMIT %s
                    ) sub
                """, (TARGET_TYPES, BATCH_SIZE))
                rows = cur.fetchall()
                cur.close()

                year_seqs = [r['year_seq'] for r in rows]
                # Shuffle to break sequential access patterns (anti-bot signal)
                random.shuffle(year_seqs)
                log('INFO', worker_tag, f'Batch mode: {len(year_seqs)} year+sequence combos to scrape (shuffled)')
                browser, page = await scrape_loop(page, browser, year_seqs, conn, tel, start_ms, worker_tag, proxy_ext_dir=proxy_ext_dir, profile=profile)

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
        if proxy_ext_dir:
            cleanup_proxy_extension(proxy_ext_dir)
        # Safety net: kill any orphaned Chrome processes spawned by this worker.
        # nodriver temp profiles start with 'uc_' — only kill those, not user's Chrome.
        try:
            import subprocess
            if sys.platform == 'win32':
                subprocess.run(
                    ['powershell', '-Command',
                     "Get-Process chrome -ErrorAction SilentlyContinue | "
                     "Where-Object {$_.CommandLine -like '*uc_*'} | "
                     "Stop-Process -Force -ErrorAction SilentlyContinue"],
                    capture_output=True, timeout=5,
                )
            else:
                subprocess.run(
                    ['pkill', '-f', 'chrome.*uc_'],
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
