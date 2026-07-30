"""Locks for the HTTP transport and the browser fallback gate.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

PROVEN 2026-07-30: a Chrome-TLS-impersonating HTTP client returns the same
stage data as the browser at 6,897 B/permit vs 105,266. It works because this
portal runs rate/reputation control, not Akamai's JS-sensor product — it sets
no _abck/ak_bmsc/bm_sz, so no sensor cookie must be earned in a real browser.

The browser path is retained as a LIVE gated fallback rather than an archived
file (this WF's own P1 precedent: an inert copy rots and fails when needed).
These locks exist so the fallback keeps working and the transports keep
agreeing.
"""

import asyncio
import json
import os

import pytest


class FakeResponse:
    def __init__(self, body='', status=200):
        self.status_code = status
        self.text = body
        self.content = body.encode()
        self.headers = {}
        self.cookies = {}


class FakeSession:
    """Records requests so the transport's contract can be asserted."""

    def __init__(self, responses=None):
        self.calls = []
        self.responses = list(responses or [])
        self.closed = False

    def request(self, method, url, **kwargs):
        self.calls.append({'method': method, 'url': url, **kwargs})
        return self.responses.pop(0) if self.responses else FakeResponse('[]')

    def close(self):
        self.closed = True


def make_transport(scraper, responses=None, relay_url=None):
    transport = scraper.HttpTransport.__new__(scraper.HttpTransport)
    transport.impersonate = 'chrome'
    transport.relay_url = relay_url
    transport.session = FakeSession(responses)
    transport.bytes_down = 0
    transport.requests = 0
    return transport


class TestTransportGate:
    def test_default_is_browser(self, scraper, monkeypatch):
        """The attested local path must be unchanged by this module existing."""
        monkeypatch.delenv('SCRAPER_TRANSPORT', raising=False)
        assert scraper.transport_mode() == 'browser'

    def test_http_selected_explicitly(self, scraper, monkeypatch):
        monkeypatch.setenv('SCRAPER_TRANSPORT', 'http')
        assert scraper.transport_mode() == 'http'

    def test_unknown_transport_fails_loudly(self, scraper, monkeypatch):
        # Never silently pick one — a typo must not decide the architecture.
        monkeypatch.setenv('SCRAPER_TRANSPORT', 'htp')
        with pytest.raises(RuntimeError, match='not a transport'):
            scraper.transport_mode()


class TestHeaders:
    def test_same_origin_xhr_header_set(self, scraper):
        h = scraper.portal_xhr_headers()
        assert h['Sec-Fetch-Site'] == 'same-origin'
        assert h['Sec-Fetch-Mode'] == 'cors'
        assert h['Sec-Fetch-Dest'] == 'empty'
        assert h['Referer'].endswith('/setup.do?action=init')
        assert h['Origin'] == 'https://secure.toronto.ca'

    def test_accept_encoding_is_never_hand_rolled(self, scraper):
        """Its ABSENCE from the wire was measured as an instant-403 tripwire on
        this portal, and curl sets a correct one itself. Setting it by hand is
        how that trap gets re-armed."""
        assert 'Accept-Encoding' not in scraper.portal_xhr_headers()


class TestClassification:
    def test_403_is_waf_blocked(self, scraper):
        t = make_transport(scraper, [FakeResponse('Access Denied', status=403)])
        assert t.call('GET', 'https://x')[0] == 'waf_blocked'

    def test_html_body_is_waf_blocked_not_a_miss(self, scraper):
        """HTML where JSON belongs is the block signature. Classifying it as
        'no data' is how a shadow-ban masqueraded as an empty queue."""
        t = make_transport(scraper, [FakeResponse('<html>Access Denied</html>')])
        assert t.call('GET', 'https://x')[0] == 'waf_blocked'

    def test_valid_json_is_ok(self, scraper):
        t = make_transport(scraper, [FakeResponse('[{"propertyRsn": 7}]')])
        kind, data = t.call('GET', 'https://x')
        assert kind == 'ok' and data == [{'propertyRsn': 7}]

    def test_bytes_are_counted(self, scraper):
        t = make_transport(scraper, [FakeResponse('12345')])
        t.call('GET', 'https://x')
        assert t.bytes_down == 5 and t.requests == 1


class TestChainContract:
    """The HTTP chain must hit the same four endpoints, with the same bodies,
    as the browser chain — a different request set would be a different
    scraper wearing this one's tests."""

    def _run(self, scraper, responses):
        t = make_transport(scraper, responses)
        result = asyncio.run(scraper.fetch_permit_chain_http(t, '24', '100000'))
        return t, result

    def test_step1_url_and_body_shape(self, scraper):
        t, _ = self._run(scraper, [FakeResponse('[]')])
        call = t.session.calls[0]
        assert call['url'].endswith('/jaxrs/search/properties')
        body = json.loads(call['data'])
        assert body['folderYear'] == '24' and body['folderSequence'] == '100000'
        assert body['searchType'] == '0' and body['propX_min'] == '0'

    def test_property_rsn_is_sent_as_a_string(self, scraper):
        """The browser interpolates it into a JS string literal, so the portal
        has only ever been sent a quoted value; a bare number is a shape it
        may reject (observed in the spike)."""
        t, _ = self._run(scraper, [
            FakeResponse('[{"propertyRsn": 12345}]'),
            FakeResponse('[]'),
        ])
        body = json.loads(t.session.calls[1]['data'])
        assert body['propertyRsn'] == '12345'
        assert t.session.calls[1]['url'].endswith('/jaxrs/search/folders')

    def test_empty_properties_is_not_a_waf_block(self, scraper):
        _, result = self._run(scraper, [FakeResponse('[]')])
        assert result == {'properties': [], 'results': []}

    def test_blocked_step1_is_a_waf_block(self, scraper):
        _, result = self._run(scraper, [FakeResponse('<html>', status=403)])
        assert result['waf_blocked'] is True

    def test_hollow_stages_do_not_count_as_data(self, scraper):
        """Akamai's documented anti-scraper mode is a 200 with hollow fields;
        a stage without desc/status must classify no_stages, never be upserted."""
        responses = [
            FakeResponse('[{"propertyRsn": 1}]'),
            FakeResponse('[{"folderSection": "BLD", "folderYear": "24",'
                         ' "folderSequence": "100000", "folderRsn": 9}]'),
            FakeResponse('{"inspectionProcesses": [{"processRsn": 3}], "showStatus": true}'),
            FakeResponse('{"stages": [{"desc": null, "status": null}]}'),
        ]
        _, result = self._run(scraper, responses)
        assert result['results'] == [{'permit_num': '24 100000 BLD', 'error': 'no_stages'}]

    def test_full_chain_returns_the_browser_contract(self, scraper):
        responses = [
            FakeResponse('[{"propertyRsn": 1}]'),
            FakeResponse('[{"folderSection": "BLD", "folderYear": "24",'
                         ' "folderSequence": "100000", "folderRsn": 9}]'),
            FakeResponse('{"inspectionProcesses": [{"processRsn": 3}], "showStatus": true}'),
            FakeResponse('{"stages": [{"desc": "Footings/Foundations", "status": "Passed",'
                         ' "date": "Jun 11, 2025"}]}'),
        ]
        t, result = self._run(scraper, responses)
        assert [c['url'].rsplit('/ApplicationStatus', 1)[1] for c in t.session.calls] == [
            '/jaxrs/search/properties',
            '/jaxrs/search/folders',
            '/jaxrs/search/detail/9',
            '/jaxrs/search/status/9/3',
        ]
        # Same keys the browser chain returns — every downstream consumer
        # (DB writes, outcome taxonomy, enriched_status) is shared.
        assert set(result) == {'properties', 'folders', 'results'}
        assert result['results'][0]['stages'][0]['desc'] == 'Footings/Foundations'


class TestCounterFolding:
    def test_counters_accumulate_across_rotations(self, scraper):
        """Run 30589243948 reported 21 requests for a 60-permit, 10-rotation
        run: rotation builds a NEW transport, so reading the final object
        reports only the last generation. Same defect class already fixed once
        for the relay's byte lines."""
        tel = scraper.make_telemetry()
        for requests, byte_count in ((7, 1000), (5, 800), (9, 1500)):
            t = make_transport(scraper)
            t.requests, t.bytes_down = requests, byte_count
            scraper.fold_transport_counters(tel, t)
        assert tel['http_requests'] == 21
        assert tel['http_bytes_down'] == 3300

    def test_folding_none_is_safe(self, scraper):
        tel = scraper.make_telemetry()
        scraper.fold_transport_counters(tel, None)
        assert tel.get('http_requests', 0) == 0


class TestVerdictIsRowDerived:
    """The old verdict read ONE row (`'FAIL' if miss_status == 'FAIL'`), so a
    run that died before attempting anything left permits_attempted=0, made
    miss_rate 0.0, and reported PASS — a broken run looking green, the exact
    class this project keeps getting burned by."""

    def test_fatal_error_with_zero_permits_is_a_FAIL(self, scraper):
        tel = scraper.make_telemetry()
        tel['preflight_passed'] = False
        tel['last_error'] = 'Proxy relay exited before listening'
        summary = scraper.compute_summary(tel, 0)
        assert summary['records_meta']['audit_table']['verdict'] == 'FAIL'

    def test_healthy_run_still_passes(self, scraper):
        tel = scraper.make_telemetry()
        tel['permits_attempted'] = 10
        tel['permits_found'] = 8
        summary = scraper.compute_summary(tel, 0)
        assert summary['records_meta']['audit_table']['verdict'] == 'PASS'

    def test_verdict_matches_the_rows_it_claims_to_summarise(self, scraper):
        """Verdict must be READ OFF the rows — never computed beside them."""
        tel = scraper.make_telemetry()
        tel['permits_attempted'] = 10
        tel['not_found_breakdown'] = {'address_not_found': 9}
        table = scraper.compute_summary(tel, 0)['records_meta']['audit_table']
        statuses = [r['status'] for r in table['rows']]
        expected = 'FAIL' if 'FAIL' in statuses else 'WARN' if 'WARN' in statuses else 'PASS'
        assert table['verdict'] == expected == 'FAIL'


class TestResourceBlockingHonesty:
    def test_reports_not_applicable_on_the_http_transport(self, scraper, monkeypatch):
        """The workflow sets SCRAPER_RESOURCE_BLOCKING=1 and SCRAPER_TRANSPORT=http
        together. Emitting `true` beside 0/0 reads as 'on but broken' — the same
        declare-don't-verify defect as the historical proxy_configured lie."""
        monkeypatch.setenv('SCRAPER_RESOURCE_BLOCKING', '1')
        tel = scraper.make_telemetry()
        tel['transport'] = 'http'
        telemetry = scraper.compute_summary(tel, 0)['records_meta']['scraper_telemetry']
        assert telemetry['resource_blocking'] is None

    def test_reports_the_real_state_on_the_browser_transport(self, scraper, monkeypatch):
        monkeypatch.setenv('SCRAPER_RESOURCE_BLOCKING', '1')
        tel = scraper.make_telemetry()
        telemetry = scraper.compute_summary(tel, 0)['records_meta']['scraper_telemetry']
        assert telemetry['resource_blocking'] is True


class TestHollowStageGuardIsShared:
    def test_both_transports_reject_hollow_stages(self, scraper):
        """A 200 with hollow fields is a fact about the PORTAL, so the guard
        cannot live on one transport only — the browser path would otherwise
        write empty rows and NULL out a good enriched_status."""
        assert scraper.real_stages([{'desc': None, 'status': None}]) == []
        assert scraper.real_stages([{'desc': 'Footings/Foundations', 'status': 'Passed'}])
        assert scraper.real_stages(None) == []


class TestEgressProof:
    def test_refuses_when_transport_ip_equals_host_ip(self, scraper, monkeypatch):
        """The C5 invariant, unchanged: 'is a proxy configured?' is not 'is
        traffic leaving through it?' — four months of runs reported proxied
        while scraping direct."""
        t = make_transport(scraper, [FakeResponse('{"ip": "203.0.113.7"}')])
        with pytest.raises(RuntimeError, match='UNPROXIED'):
            scraper.verify_http_egress(t, host_ip='203.0.113.7')

    def test_passes_when_ips_differ(self, scraper):
        t = make_transport(scraper, [FakeResponse('{"ip": "198.51.100.22"}')])
        assert scraper.verify_http_egress(t, host_ip='203.0.113.7') == '198.51.100.22'
