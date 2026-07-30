"""Locks for the page.evaluate result path in fetch_permit_chain.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

Born from the 2026-07-30 cloud probes: nodriver's Tab.evaluate RETURNS a
cdp.runtime.ExceptionDetails object when the page-side JS throws (it does not
raise), and safe_json_parse called .strip() on it. The trigger was itself a
regression: 921536a9 embedded a literal newline inside a JS string literal —
a SyntaxError that stopped all four fetch snippets from ever parsing, so every
step reported an opaque failure instead of the real exception message.
"""

import asyncio
import json
import os

import pytest

SCRAPER_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'aic-scraper-nodriver.py')


class TestSentinelDetection:
    def test_three_key_sentinel_detected(self, scraper):
        raw = json.dumps({'error': 'TypeError', 'message': 'Failed to fetch',
                          'at': 'TypeError: Failed to fetch'})
        data, err = scraper.safe_json_parse(raw, 'step1:properties')
        assert data is None
        assert err == 'fetch_error:TypeError'

    def test_legacy_one_key_sentinel_still_detected(self, scraper):
        data, err = scraper.safe_json_parse(json.dumps({'error': 'AbortError'}), 'step1')
        assert data is None
        assert err == 'fetch_error:AbortError'

    def test_portal_dict_with_error_key_is_not_swallowed(self, scraper):
        # A domain payload that happens to carry an 'error' key alongside real
        # fields must flow through as data, never be eaten as our sentinel.
        body = {'error': 'x', 'inspectionProcesses': [], 'showStatus': True}
        data, err = scraper.safe_json_parse(json.dumps(body), 'step3:detail/1')
        assert err is None
        assert data == body

    def test_non_string_result_never_string_ops(self, scraper):
        # Regression lock: "'ExceptionDetails' object has no attribute 'strip'".
        class NotAString:
            pass
        data, err = scraper.safe_json_parse(NotAString(), 'step1:properties')
        assert data is None
        assert err == 'non_string_result:NotAString'


class TestEvaluateFetch:
    def test_exception_details_surfaces_the_real_message(self, scraper):
        cdp = pytest.importorskip('nodriver').cdp
        exc = cdp.runtime.ExceptionDetails(
            exception_id=1, text='Uncaught', line_number=0, column_number=17,
            exception=cdp.runtime.RemoteObject(
                type_='object',
                description='SyntaxError: Invalid or unexpected token\n    at <anonymous>'))

        class FakePage:
            async def evaluate(self, js, await_promise=False):
                return exc

        raw = asyncio.run(scraper.evaluate_fetch(FakePage(), '(async () => 1)()', 'step1:properties'))
        assert 'SyntaxError: Invalid or unexpected token' in raw
        data, err = scraper.safe_json_parse(raw, 'step1:properties')
        assert data is None
        assert err == 'fetch_error:EvaluateException'

    def test_string_results_pass_through_untouched(self, scraper):
        class FakePage:
            async def evaluate(self, js, await_promise=False):
                return '[{"propertyRsn": 1}]'

        assert asyncio.run(scraper.evaluate_fetch(FakePage(), 'x', 's')) == '[{"propertyRsn": 1}]'

    def test_other_non_string_results_become_sentinels(self, scraper):
        class FakePage:
            async def evaluate(self, js, await_promise=False):
                return {'unexpected': 'shape'}

        raw = asyncio.run(scraper.evaluate_fetch(FakePage(), 'x', 'step2:folders'))
        data, err = scraper.safe_json_parse(raw, 'step2:folders')
        assert err == 'fetch_error:EvaluateNonString'


class TestJsTemplatesParse:
    def test_catch_sites_escape_the_stack_split(self):
        """A literal newline inside a JS string literal is a SyntaxError that
        stops the whole snippet from parsing (921536a9) — JS must receive the
        two-character escape \\n, i.e. the Python source carries backslash-n."""
        with open(SCRAPER_PATH, encoding='utf-8') as fh:
            src = fh.read()
        assert ".split('\n" not in src, \
            'literal newline inside a JS string literal — the whole IIFE fails to parse'
        assert src.count(".split('\\\\n')[0]") == 4
