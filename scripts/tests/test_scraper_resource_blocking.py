"""Locks for C8/L4 — CDP resource blocking (the v2 filter, restored).

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

The allow-set is ported VERBATIM from the deleted Playwright v2 scraper
(poc-aic-scraper-v2.js:497-500), whose economics (~4 KB/permit vs ~1.5 MB
without) the whole bandwidth budget was built on. The one absolute fence:
`script` MUST be allowed — d138bb04 (2026-03-15) proved that starving the
WAF's JS challenge PERMANENTLY shadow-bans the session.
"""

import asyncio
from types import SimpleNamespace

import pytest


class TestAllowSet:
    def test_script_must_be_allowed_d138bb04(self, scraper):
        """THE FENCE: blocking `script` permanently shadow-banned sessions in
        d138bb04 — WAFs run JS challenges to verify the browser isn't headless.
        If this fails, someone has re-armed that incident."""
        assert 'Script' in scraper.ALLOWED_RESOURCE_TYPES

    def test_allow_set_is_verbatim_v2(self, scraper):
        assert scraper.ALLOWED_RESOURCE_TYPES == {'Document', 'XHR', 'Fetch', 'Script'}

    def test_data_chain_types_always_pass(self, scraper):
        # The four /jaxrs/ calls run via page.evaluate(fetch(...)) -> Fetch/XHR;
        # navigations are Document. None may ever be aborted by the filter.
        for rtype in ('Fetch', 'XHR', 'Document', 'Script'):
            assert scraper.should_allow_resource(rtype)

    def test_heavy_types_are_aborted(self, scraper):
        for rtype in ('Image', 'Stylesheet', 'Font', 'Media', 'WebSocket',
                      'Ping', 'Prefetch', 'Manifest', 'Other'):
            assert not scraper.should_allow_resource(rtype)


class TestGate:
    def test_default_off(self, scraper, monkeypatch):
        # The attested local path must stay byte-for-byte unchanged.
        monkeypatch.delenv('SCRAPER_RESOURCE_BLOCKING', raising=False)
        assert scraper.resource_blocking_enabled() is False

    def test_on_when_workflow_pins_it(self, scraper, monkeypatch):
        monkeypatch.setenv('SCRAPER_RESOURCE_BLOCKING', '1')
        assert scraper.resource_blocking_enabled() is True


class FakeTab:
    def __init__(self):
        self.handlers = []
        self.sent = []

    def add_handler(self, event_type, handler):
        self.handlers.append((event_type, handler))

    async def send(self, command):
        self.sent.append(command)
        # cdp commands are generators; drain so they don't warn
        try:
            next(command)
        except (StopIteration, TypeError):
            pass
        return None


def _paused_event(scraper, rtype, request_id='req-1'):
    cdp = pytest.importorskip('nodriver').cdp
    return SimpleNamespace(
        resource_type=getattr(cdp.network.ResourceType, rtype),
        request_id=cdp.fetch.RequestId(request_id),
        request=SimpleNamespace(url='https://secure.toronto.ca/x'))


class TestHandler:
    def test_allowed_request_is_continued(self, scraper):
        tab = FakeTab()
        handler = scraper._resource_filter_handler(tab)
        asyncio.run(handler(_paused_event(scraper, 'FETCH'), tab))
        assert len(tab.sent) == 1  # continue_request issued

    def test_blocked_request_is_failed_not_hung(self, scraper):
        tab = FakeTab()
        handler = scraper._resource_filter_handler(tab)
        asyncio.run(handler(_paused_event(scraper, 'IMAGE'), tab))
        assert len(tab.sent) == 1  # fail_request issued — never left hanging

    def test_handler_survives_a_vanished_request(self, scraper, captured_logs=None):
        class ExplodingTab(FakeTab):
            async def send(self, command):
                raise RuntimeError('Invalid InterceptionId')
        tab = ExplodingTab()
        handler = scraper._resource_filter_handler(tab)
        # Must log and swallow — the filter may never kill a scrape.
        asyncio.run(handler(_paused_event(scraper, 'IMAGE'), tab))


class TestInstall:
    def test_enable_installs_handler_and_enables_fetch_domain(self, scraper):
        tab = FakeTab()
        asyncio.run(scraper.enable_resource_blocking(tab))
        assert len(tab.handlers) == 1
        # fetch.enable() + network.setCacheDisabled(false). The second is not
        # decoration: request interception is a documented cache-killer
        # (Puppeteer pairs it with setCacheDisabled(true)), and a disabled cache
        # makes every navigation re-download the portal's whole script stack.
        assert len(tab.sent) == 2


class TestRelayByteAccounting:
    """Run 30576202397 reported relay_bytes=0 for a whole run: Chrome's
    keep-alive tunnels never close before relay teardown, and a rotation
    restarts the relay at zero, so byte totals must (a) come from periodic
    cumulative lines, (b) be folded per relay GENERATION on pipe EOF —
    latest-wins across generations drops every earlier batch's bytes."""

    def _pump_lines(self, scraper, worker_id, lines):
        proc = SimpleNamespace(stderr=list(lines))
        thread = scraper._drain_relay_stderr(proc, worker_id)
        thread.join(timeout=5)
        assert not thread.is_alive()

    def test_generations_accumulate_not_overwrite(self, scraper):
        worker = 'bytes-test-worker'
        # Generation 1 (batch 1): cumulative lines ending at 5000/90000.
        self._pump_lines(scraper, worker, [
            'proxy-relay: BYTES up=2000 down=40000\n',
            'proxy-relay: BYTES up=5000 down=90000\n',
        ])
        # Generation 2 (after rotation): restarts at zero, ends at 1000/20000.
        self._pump_lines(scraper, worker, [
            'proxy-relay: BYTES up=1000 down=20000\n',
        ])
        counts = scraper._relay_block_counts[worker]
        assert counts['bytes_up'] == 6000
        assert counts['bytes_down'] == 110000

    def test_bytes_lines_do_not_pollute_samples(self, scraper):
        worker = 'bytes-test-worker-2'
        self._pump_lines(scraper, worker, [
            'proxy-relay: BYTES up=1 down=2\n',
            'proxy-relay: BLOCKED accounts.google.com (cost blocklist)\n',
        ])
        counts = scraper._relay_block_counts[worker]
        assert counts['blocked'] == 1
        assert all('BYTES' not in s for s in counts['samples'])
