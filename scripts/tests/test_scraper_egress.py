"""Regression locks for the proxied-egress tripwire.

SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4, §3, §4
SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

This replaced a target-visibility check that produced a false negative on the
GH runner (run 30496893882): it judged "extension loaded?" by looking for a
chrome-extension://*/background.js target and saw only ['page:about:blank'],
but MV3 service workers are lazily started and not reliably enumerated by
Target.getTargets without a discovery filter. The egress check asserts the
invariant that actually matters instead of inferring it.

Fail-safe-loud (Spec 115 §3/§4): if we cannot PROVE the browser is proxied we
refuse to scrape, because the MV3 extension supplies both the proxy route and
its credentials — a silent non-load produces no error, just direct traffic.
"""

import json

import pytest


class FakePage:
    def __init__(self, echo_body):
        self._body = echo_body
        self.evaluated = 0
        self.slept = 0.0

    async def evaluate(self, _expr, await_promise=False):
        self.evaluated += 1
        if isinstance(self._body, Exception):
            raise self._body
        return self._body

    async def sleep(self, seconds=0):
        # The real check waits for the document to load before reading it — reading
        # immediately returned an empty body on the slower proxied path in CI, which
        # then read as "unreachable, therefore proxied" and let a broken transport
        # through (GH run 30560364087). The double records the wait instead of taking it.
        self.slept += seconds


class FakeBrowser:
    """The check NAVIGATES to the echo service (fetch() throws on about:blank's
    opaque origin — the run 30498062060 failure), so it takes a browser."""

    def __init__(self, echo_body):
        self.page = FakePage(echo_body)
        self.navigated_to = None

    async def get(self, url, **_kw):
        self.navigated_to = url
        return self.page


class TestExtractIp:
    def test_parses_json_shape(self, scraper):
        assert scraper._extract_ip('{"ip": "203.0.113.7"}') == '203.0.113.7'

    def test_parses_bare_text_shape(self, scraper):
        assert scraper._extract_ip('203.0.113.7\n') == '203.0.113.7'

    def test_parses_ipv6(self, scraper):
        assert scraper._extract_ip('2001:db8::1') == '2001:db8::1'

    def test_rejects_html_or_prose(self, scraper):
        """A captive portal / WAF page must not be mistaken for an IP."""
        assert scraper._extract_ip('<html>Access Denied</html>') is None

    def test_handles_empty_and_none(self, scraper):
        assert scraper._extract_ip('') is None
        assert scraper._extract_ip(None) is None

    def test_extracts_ip_embedded_in_a_text_body(self, scraper):
        """Chromium renders a JSON response inside <pre>; innerText may carry noise.

        This also guards the word-boundary regex itself: an escaping slip that
        turns \b into a literal control byte makes the fallback silently
        never match.
        """
        assert scraper._extract_ip('Some prose 198.51.100.44 trailing') == '198.51.100.44'

    def test_double_encoded_json_string_is_unwrapped(self, scraper):
        """nodriver can hand back a JSON-encoded STRING containing a JSON doc."""
        assert scraper._extract_ip('"{\\"ip\\": \\"203.0.113.9\\"}"') == '203.0.113.9'

    def test_cdp_exception_payload_is_rejected(self, scraper):
        """A thrown JS expression yields ExceptionDetails, not an IP (run 30498062060)."""
        assert scraper._extract_ip(
            "ExceptionDetails(exception_id=1, text='Uncaught', line_number=0)") is None

    def test_malformed_json_is_none(self, scraper):
        assert scraper._extract_ip('{"ip": ') is None


@pytest.mark.asyncio
class TestVerifyProxiedEgress:
    async def test_passes_when_browser_ip_differs_from_host(self, scraper, captured_logs):
        browser = FakeBrowser(json.dumps({'ip': '198.51.100.22'}))

        result = await scraper.verify_proxied_egress(browser, host_ip='203.0.113.7')

        assert result == '198.51.100.22'
        assert browser.page.evaluated == 1, 'must read the navigated page body'
        assert any(e.get('context', {}).get('event') == 'proxied_egress_verified'
                   for e in captured_logs)

    async def test_raises_when_ips_match(self, scraper):
        """The whole point: identical IPs mean traffic is going out DIRECT."""
        page = FakePage(json.dumps({'ip': '203.0.113.7'}))

        with pytest.raises(RuntimeError, match='UNPROXIED'):
            await scraper.verify_proxied_egress(FakeBrowser(page._body), host_ip='203.0.113.7')

    async def test_raises_when_browser_ip_unknown(self, scraper):
        """Fail-safe-loud: an unparseable echo must not be read as 'probably fine'."""
        page = FakePage('<html>blocked</html>')

        with pytest.raises(RuntimeError, match='browser'):
            await scraper.verify_proxied_egress(FakeBrowser(page._body), host_ip='203.0.113.7')

    async def test_message_names_the_branded_chrome_cause(self, scraper):
        """The error should tell the operator what to actually DO about it."""
        page = FakePage(json.dumps({'ip': '203.0.113.7'}))

        with pytest.raises(RuntimeError, match='Chrome for Testing'):
            await scraper.verify_proxied_egress(FakeBrowser(page._body), host_ip='203.0.113.7')

    async def test_unreachable_echo_is_evidence_of_proxying_not_a_refusal(
            self, scraper, captured_logs):
        """Validation 8 (run 30499270494): the browser rendered Chrome's network
        error page for the echo service while THIS HOST reached it fine.

        A browser whose extension failed to load has plain direct internet and
        would have reached it exactly as the host did, so failing here would
        refuse a scrape over evidence that actually points AT proxying — the
        same false-negative shape as the retired target-visibility gate.
        """
        browser = FakeBrowser(
            "This site can't be reached\n\nThe webpage at https://api.ipify.org/ "
            'might be temporarily down or moved permanently.')

        result = await scraper.verify_proxied_egress(browser, host_ip='203.0.113.7')

        assert result is None, 'unverified-but-indirect, not a hard pass'
        assert any(e.get('context', {}).get('event') == 'proxied_egress_indirect'
                   for e in captured_logs), 'must be surfaced loudly, never silent'

    async def test_err_interstitials_are_recognized(self, scraper, captured_logs):
        browser = FakeBrowser('ERR_TUNNEL_CONNECTION_FAILED')

        assert await scraper.verify_proxied_egress(browser, host_ip='203.0.113.7') is None

    async def test_unknown_garbage_still_refuses(self, scraper):
        """Only RECOGNIZED unreachability is benign; anything else stays fatal."""
        browser = FakeBrowser('<html>Some unexpected interstitial</html>')

        with pytest.raises(RuntimeError, match='refusing to scrape unverified'):
            await scraper.verify_proxied_egress(browser, host_ip='203.0.113.7')

    async def test_unknown_host_ip_is_checked_before_navigating(self, scraper):
        """If we cannot establish the baseline, do not even drive the browser."""
        browser = FakeBrowser(json.dumps({'ip': '198.51.100.22'}))

        with pytest.raises(RuntimeError, match='unanswerable'):
            await scraper.verify_proxied_egress(browser, host_ip=None)

        assert browser.navigated_to is None, 'must fail before navigating'

    async def test_navigates_rather_than_fetching(self, scraper):
        """fetch() on about:blank has an opaque origin and throws — nodriver then
        returns an ExceptionDetails object instead of raising (run 30498062060).
        Navigation is not subject to that, so the check must NAVIGATE."""
        browser = FakeBrowser(json.dumps({'ip': '198.51.100.9'}))

        await scraper.verify_proxied_egress(browser, host_ip='203.0.113.7')

        assert browser.navigated_to == scraper.EGRESS_ECHO_URL


@pytest.mark.asyncio
class TestLogBrowserTargets:
    async def test_is_diagnostic_only_and_never_raises(self, scraper, captured_logs):
        """Target enumeration must not gate anything — that was the false-negative bug."""
        class BrokenPage:
            async def send(self, _cmd):
                raise RuntimeError('CDP unavailable')

        result = await scraper.log_browser_targets(BrokenPage())

        assert result == []
        assert any(e.get('context', {}).get('event') == 'target_enumeration_failed'
                   for e in captured_logs)

    async def test_records_what_it_saw(self, scraper, captured_logs):
        class Page:
            async def send(self, _cmd):
                return [type('T', (), {'url': 'about:blank', 'type_': 'page'})()]

        result = await scraper.log_browser_targets(Page())

        assert result == ['page:about:blank']
        assert any(e.get('context', {}).get('event') == 'browser_targets'
                   for e in captured_logs)


class TestHostEgressIpCache:
    """The memo's TTL is a CORRECTNESS control, not just a rate-limit saver.

    verify_proxied_egress compares the browser's IP against this value, so a
    stale entry can make an UNPROXIED browser look proxied — the exact silent
    failure the tripwire exists to prevent (Regression Guardian finding (c):
    the old code asserted "a runner's IP does not change mid-run" in a comment
    while `refresh=True` was dead code).
    """

    def _clear(self, scraper):
        scraper._host_egress_ip_cache.clear()

    def test_probes_once_then_serves_from_cache(self, scraper, monkeypatch):
        self._clear(scraper)
        calls = []

        class FakeResp:
            def read(self):
                calls.append(1)
                return b'{"ip": "203.0.113.7"}'
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        monkeypatch.setattr(scraper.urllib.request, 'urlopen', lambda *a, **k: FakeResp())

        first = scraper.host_egress_ip(now=1000.0)
        second = scraper.host_egress_ip(now=1000.0 + 10)

        assert first == second == '203.0.113.7'
        assert len(calls) == 1, 'second call must be served from the memo'
        self._clear(scraper)

    def test_reprobes_after_the_ttl_expires(self, scraper, monkeypatch):
        """A stale baseline is a false-PASS risk, so it must expire."""
        self._clear(scraper)
        bodies = [b'{"ip": "203.0.113.7"}', b'{"ip": "198.51.100.99"}']

        class FakeResp:
            def read(self):
                return bodies.pop(0) if bodies else b'{"ip": "198.51.100.99"}'
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        monkeypatch.setattr(scraper.urllib.request, 'urlopen', lambda *a, **k: FakeResp())

        first = scraper.host_egress_ip(now=1000.0)
        later = scraper.host_egress_ip(now=1000.0 + scraper.HOST_EGRESS_IP_TTL_S + 1)

        assert first == '203.0.113.7'
        assert later == '198.51.100.99', 'must re-probe once the TTL lapses'
        self._clear(scraper)

    def test_refresh_forces_a_reprobe(self, scraper, monkeypatch):
        """`refresh=True` must be live code, not a decorative parameter."""
        self._clear(scraper)
        bodies = [b'{"ip": "203.0.113.7"}', b'{"ip": "198.51.100.99"}']

        class FakeResp:
            def read(self):
                return bodies.pop(0) if bodies else b'{"ip": "198.51.100.99"}'
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        monkeypatch.setattr(scraper.urllib.request, 'urlopen', lambda *a, **k: FakeResp())

        scraper.host_egress_ip(now=1000.0)
        forced = scraper.host_egress_ip(now=1000.0 + 1, refresh=True)

        assert forced == '198.51.100.99'
        self._clear(scraper)

    def test_failed_probe_does_not_poison_or_extend_the_cache(self, scraper, monkeypatch):
        """A transient outage must neither cache None nor renew a stale entry."""
        self._clear(scraper)

        class FakeResp:
            def read(self):
                return b'{"ip": "203.0.113.7"}'
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        monkeypatch.setattr(scraper.urllib.request, 'urlopen', lambda *a, **k: FakeResp())
        scraper.host_egress_ip(now=1000.0)

        monkeypatch.setattr(scraper.urllib.request, 'urlopen',
                            lambda *a, **k: (_ for _ in ()).throw(OSError('down')))
        stale_moment = 1000.0 + scraper.HOST_EGRESS_IP_TTL_S + 1

        assert scraper.host_egress_ip(now=stale_moment) is None, 'outage must report unknown'
        assert scraper._host_egress_ip_cache['ip'] == '203.0.113.7'
        assert scraper._host_egress_ip_cache['at'] == 1000.0, 'a failure must not renew the TTL'
        self._clear(scraper)
