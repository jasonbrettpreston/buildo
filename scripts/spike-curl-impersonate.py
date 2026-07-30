#!/usr/bin/env python3
"""SPIKE — can a Chrome-TLS-impersonating HTTP client do the AIC data chain?

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md (measurement only)

NOT WIRED INTO ANY CHAIN. Writes nothing to the database. This is a bounded
experiment whose entire output is a verdict on a transport question.

THE QUESTION. The scraper drives a real Chrome purely so `page.evaluate(fetch)`
inherits the portal's origin; the permit data itself is four small JSON calls
(~5.3 KB/permit). Per-host accounting on run 30581163413 showed the browser's
page weight is ~97% of the metered bill. If a TLS-impersonating HTTP client can
call the same four endpoints, the browser (and its bytes) becomes optional.

WHY IT MIGHT WORK HERE SPECIFICALLY. Akamai Bot Manager's JS-sensor product
announces itself with `_abck`/`ak_bmsc` cookies, and the recorded recon says
this portal sets NO cookies and answers a cold client with 200s — which points
at rate/reputation control rather than a sensor challenge. The published
"solve the sensor in a browser, replay the cookie" problem does not apply if
there is no cookie. This spike tests that reading rather than assuming it.

WHY IT MIGHT FAIL, AND HOW TO SEE IT. Akamai's documented failure mode against
scrapers is SILENT DEGRADATION: a clean 200 with hollowed-out data. Status
codes therefore prove nothing here. Every response is validated for SHAPE, and
the run reports data-equivalence, not HTTP success.

Usage:
    python3 scripts/spike-curl-impersonate.py --permits "24 130063,21 217696" [--direct]

Exits non-zero only on its own operational failure, never on a negative
finding — a negative finding is a successful measurement.
"""

import argparse
import json
import os
import random
import sys
import time

AIC_BASE = 'https://secure.toronto.ca/ApplicationStatus'
PORTAL_PAGE = f'{AIC_BASE}/setup.do?action=init'
# Impersonation target. curl_cffi ships rolling Chrome aliases; the point is a
# real Chrome JA3/JA4 *and* the HTTP/2 fingerprint (which Akamai itself
# defined), not the UA string — a UA alone is the thing everyone gets wrong.
IMPERSONATE = os.environ.get('SPIKE_IMPERSONATE', 'chrome')
REQUEST_SPACING_S = float(os.environ.get('SPIKE_SPACING_S') or '5')


def log(level, msg, context=None):
    payload = {'level': level, 'tag': '[spike-curl]', 'msg': msg}
    if context:
        payload['context'] = context
    print(json.dumps(payload), flush=True)


def build_proxy_url():
    """Decodo upstream, same credential rules the scraper proved the hard way.

    `user-` prefix is mandatory and session ids must be ALPHANUMERIC — Decodo
    parses the username as a hyphen-delimited key/value list, so a hyphen
    inside a value silently truncates it and the proxy 407s invisibly.
    """
    host = os.environ.get('PROXY_HOST')
    if not host:
        return None
    from urllib.parse import quote
    user = os.environ.get('PROXY_USER', '')
    password = quote(os.environ.get('PROXY_PASS', ''), safe='')
    port = os.environ.get('PROXY_PORT', '20001')
    session_id = f'spike{int(time.time())}'
    username = quote(f'user-{user}-session-{session_id}', safe='')
    return f'https://{username}:{password}@{host}:{port}'


def portal_headers(referer=PORTAL_PAGE):
    """Headers a browser's same-origin XHR would carry.

    Sec-Fetch-* is not decoration: a missing or inconsistent set is described
    across the detection literature as a near-certain bot tell. These are the
    values Chrome sends for a same-origin `fetch()` issued from the portal
    page — which is exactly what the browser path produces today.

    Accept-Encoding is deliberately NOT set by hand: its ABSENCE was measured
    as an instant-403 tripwire on this portal, and curl sets a correct one.
    """
    return {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-CA,en;q=0.9',
        'Content-Type': 'application/json',
        'Origin': 'https://secure.toronto.ca',
        'Referer': referer,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'X-Requested-With': 'XMLHttpRequest',
    }


def search_body(year, sequence, property_rsn=''):
    body = {
        'ward': '', 'folderYear': year, 'folderSequence': sequence,
        'folderSection': '', 'folderRevision': '', 'folderType': '',
        'address': '', 'searchType': '0',
        'mapX': None, 'mapY': None,
        'propX_min': '0', 'propX_max': '0', 'propY_min': '0', 'propY_max': '0',
    }
    if property_rsn:
        # STRING, always. The browser path interpolates this into a JS string
        # literal, so the portal has only ever been sent a quoted value; a bare
        # JSON number is a shape it may not accept.
        body['propertyRsn'] = str(property_rsn)
    return body


def classify(resp):
    """Distinguish real data from the three ways this portal says no."""
    body = resp.text or ''
    if resp.status_code == 403 or 'Access Denied' in body:
        return 'waf_blocked', None
    if body.lstrip().startswith('<'):
        return 'html_not_json', None
    try:
        return 'ok', json.loads(body)
    except ValueError:
        return 'unparseable', None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--permits', required=True,
                        help='comma-separated "YY SEQUENCE" pairs')
    parser.add_argument('--direct', action='store_true',
                        help='bypass the proxy (local residential test)')
    parser.add_argument('--no-warmup', action='store_true',
                        help='skip the portal page GET — tests whether the '
                             '75,885 B navigation is needed at all (the recon '
                             'says a cold client gets 200s on step 1)')
    args = parser.parse_args()

    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        log('ERROR', 'curl_cffi is not installed — pip install curl_cffi')
        return 2

    proxy = None if args.direct else build_proxy_url()
    if not args.direct and not proxy:
        log('ERROR', 'PROXY_HOST unset and --direct not given; refusing to '
                     'scrape from this host unproxied')
        return 2
    proxies = {'http': proxy, 'https': proxy} if proxy else None

    permits = [p.strip() for p in args.permits.split(',') if p.strip()]
    stats = {
        'requests': 0, 'bytes_down': 0, 'permits_attempted': 0,
        'permits_with_stages': 0, 'stages_total': 0,
        'first_block_at_request': None, 'outcomes': {},
    }

    def record(kind):
        stats['outcomes'][kind] = stats['outcomes'].get(kind, 0) + 1

    session = cffi_requests.Session(impersonate=IMPERSONATE, proxies=proxies)
    log('INFO', 'Spike starting', {
        'impersonate': IMPERSONATE, 'proxied': bool(proxy),
        'permits': len(permits), 'spacing_s': REQUEST_SPACING_S,
    })

    def call(method, url, **kw):
        stats['requests'] += 1
        resp = session.request(method, url, timeout=30, **kw)
        stats['bytes_down'] += len(resp.content or b'')
        kind, data = classify(resp)
        record(kind)
        if kind == 'waf_blocked' and stats['first_block_at_request'] is None:
            stats['first_block_at_request'] = stats['requests']
        return kind, data, resp

    # One GET of the portal page — the only navigation-shaped request, kept so
    # the Referer we send corresponds to something we actually fetched. At
    # 75,885 B it is the single largest line item, so --no-warmup exists to
    # measure whether it buys anything.
    if args.no_warmup:
        log('INFO', 'Skipping the portal page GET (--no-warmup): testing whether '
                    'the data chain answers a genuinely cold client')
    else:
        kind, _, resp = call('GET', PORTAL_PAGE, headers={
            'Accept': 'text/html,application/xhtml+xml',
            'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Dest': 'document', 'Sec-Fetch-User': '?1',
        })
        cookies = dict(resp.cookies or {})
        log('INFO', 'Portal page fetched', {
            'status': resp.status_code, 'kind': kind, 'bytes': len(resp.content or b''),
            # THE decisive observation: an Akamai sensor deployment sets _abck /
            # ak_bmsc / bm_sz here. Their absence says this is rate/reputation
            # control, and that the whole cookie-replay problem does not apply.
            'cookies': sorted(cookies.keys()),
            'akamai_sensor_cookies': sorted(
                c for c in cookies if c.lower() in ('_abck', 'ak_bmsc', 'bm_sz', 'sbsd')),
            'server': resp.headers.get('server'),
            'akamai_headers': {k: v for k, v in resp.headers.items()
                               if 'akamai' in k.lower() or k.lower().startswith('x-cache')},
            'content_encoding': resp.headers.get('content-encoding'),
        })

    for year_seq in permits:
        if stats['first_block_at_request']:
            log('WARN', 'Stopping: portal started refusing this client')
            break
        try:
            year, sequence = year_seq.split(' ')
        except ValueError:
            log('WARN', f'Skipping malformed permit spec {year_seq!r}')
            continue
        stats['permits_attempted'] += 1
        time.sleep(REQUEST_SPACING_S + random.uniform(0, 1))

        kind, props, _ = call('POST', f'{AIC_BASE}/jaxrs/search/properties',
                              headers=portal_headers(),
                              data=json.dumps(search_body(year, sequence)))
        if kind != 'ok' or not props:
            log('INFO', f'{year_seq}: step1 {kind}', {'had_data': bool(props)})
            continue
        property_rsn = props[0].get('propertyRsn', '')

        time.sleep(REQUEST_SPACING_S + random.uniform(0, 1))
        kind, folders, resp2 = call('POST', f'{AIC_BASE}/jaxrs/search/folders',
                                    headers=portal_headers(),
                                    data=json.dumps(search_body(year, sequence, property_rsn)))
        if kind != 'ok' or not folders:
            # Show what the portal actually said — the whole point of this
            # spike is attribution, and "unparseable" without the body is the
            # same opaque failure the browser path spent five probes on.
            log('INFO', f'{year_seq}: step2 {kind}', {
                'status': resp2.status_code,
                'body_len': len(resp2.content or b''),
                'body_prefix': (resp2.text or '')[:200],
                'property_rsn': property_rsn,
                'content_type': resp2.headers.get('content-type'),
            })
            continue
        targets = [f for f in folders if f.get('folderSection') == 'BLD']
        log('INFO', f'{year_seq}: {len(folders)} folders, {len(targets)} BLD')

        for folder in targets:
            folder_rsn = folder.get('folderRsn')
            time.sleep(REQUEST_SPACING_S + random.uniform(0, 1))
            kind, detail, _ = call('GET', f'{AIC_BASE}/jaxrs/search/detail/{folder_rsn}',
                                   headers=portal_headers())
            if kind != 'ok' or not isinstance(detail, dict):
                log('INFO', f'{year_seq}: step3 {kind}')
                continue
            processes = detail.get('inspectionProcesses') or []
            if not processes or not detail.get('showStatus'):
                log('INFO', f'{year_seq}: no processes / no status link')
                continue
            for proc in processes:
                time.sleep(REQUEST_SPACING_S + random.uniform(0, 1))
                kind, status_data, _ = call(
                    'GET',
                    f'{AIC_BASE}/jaxrs/search/status/{folder_rsn}/{proc.get("processRsn")}',
                    headers=portal_headers())
                if kind != 'ok' or not isinstance(status_data, dict):
                    log('INFO', f'{year_seq}: step4 {kind}')
                    continue
                stages = status_data.get('stages') or []
                # SHAPE validation, not status-code validation. Akamai's
                # documented anti-scraper mode is a 200 with hollow data, so a
                # stage list is only counted when its fields are really there.
                real = [s for s in stages if s.get('desc') and s.get('status')]
                if real:
                    stats['permits_with_stages'] += 1
                    stats['stages_total'] += len(real)
                    log('INFO', f'{year_seq}: {len(real)} stages', {
                        'stages': [f"{s['desc']}: {s['status']}" for s in real]})
                else:
                    log('INFO', f'{year_seq}: no passed stages yet')

    bytes_per_permit = (stats['bytes_down'] / stats['permits_attempted']
                        if stats['permits_attempted'] else 0)
    log('INFO', 'SPIKE RESULT', {
        **stats,
        'bytes_per_permit': int(bytes_per_permit),
        # The comparison that decides the transport question. The browser path
        # measured 105,266 B/permit over 60 permits (run 30581163413).
        'browser_path_bytes_per_permit': 105266,
        'verdict': (
            'BLOCKED — portal refused this client' if stats['first_block_at_request']
            else 'WORKS — data returned with correct shape' if stats['stages_total']
            else 'INCONCLUSIVE — no stages found; try permits known to have them'),
    })
    return 0


if __name__ == '__main__':
    sys.exit(main())
