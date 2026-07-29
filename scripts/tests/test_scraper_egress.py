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

    async def evaluate(self, _expr, await_promise=False):
        self.evaluated += 1
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


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

    def test_malformed_json_is_none(self, scraper):
        assert scraper._extract_ip('{"ip": ') is None


@pytest.mark.asyncio
class TestVerifyProxiedEgress:
    async def test_passes_when_browser_ip_differs_from_host(self, scraper, captured_logs):
        page = FakePage(json.dumps({'ip': '198.51.100.22'}))

        result = await scraper.verify_proxied_egress(page, host_ip='203.0.113.7')

        assert result == '198.51.100.22'
        assert page.evaluated == 1
        assert any(e.get('context', {}).get('event') == 'proxied_egress_verified'
                   for e in captured_logs)

    async def test_raises_when_ips_match(self, scraper):
        """The whole point: identical IPs mean traffic is going out DIRECT."""
        page = FakePage(json.dumps({'ip': '203.0.113.7'}))

        with pytest.raises(RuntimeError, match='UNPROXIED'):
            await scraper.verify_proxied_egress(page, host_ip='203.0.113.7')

    async def test_raises_when_browser_ip_unknown(self, scraper):
        """Fail-safe-loud: an unparseable echo must not be read as 'probably fine'."""
        page = FakePage('<html>blocked</html>')

        with pytest.raises(RuntimeError, match='browser'):
            await scraper.verify_proxied_egress(page, host_ip='203.0.113.7')

    async def test_raises_when_host_ip_unknown(self, scraper):
        """Without the host's own IP the question is unanswerable — refuse."""
        page = FakePage(json.dumps({'ip': '198.51.100.22'}))

        with pytest.raises(RuntimeError, match='unanswerable'):
            await scraper.verify_proxied_egress(page, host_ip=None)

    async def test_message_names_the_branded_chrome_cause(self, scraper):
        """The error should tell the operator what to actually DO about it."""
        page = FakePage(json.dumps({'ip': '203.0.113.7'}))

        with pytest.raises(RuntimeError, match='Chrome for Testing'):
            await scraper.verify_proxied_egress(page, host_ip='203.0.113.7')

    async def test_uses_await_promise_for_the_fetch(self, scraper):
        """A fetch() evaluated without await_promise returns a pending Promise."""
        captured = {}

        class RecordingPage(FakePage):
            async def evaluate(self, expr, await_promise=False):
                captured['await_promise'] = await_promise
                captured['expr'] = expr
                return json.dumps({'ip': '198.51.100.9'})

        await scraper.verify_proxied_egress(RecordingPage(None), host_ip='203.0.113.7')

        assert captured['await_promise'] is True
        assert 'fetch(' in captured['expr']


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
