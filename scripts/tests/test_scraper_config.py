"""Regression locks for scraper config parsing + proxy-extension generation.

SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4, §3
SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

The env-parsing tests pin the 2026-07-29 first-cron crash (commit 86868387):
GitHub Actions interpolates an undefined `vars.*` as an EMPTY STRING, not an
absent variable, so `int(os.environ.get('X', '10'))` receives '' — the default
never applies and the process dies with ValueError before any work happens.
"""

import importlib.util
import json
import os
import stat
import sys

import pytest

SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def reload_scraper_with_env(monkeypatch, **env):
    """Re-import the scraper so module-level env parsing runs under `env`.

    The batch-size/max-permits constants are read at import time, so the only
    honest way to test them is a fresh import with the environment in place.
    """
    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    # Neutralize the repo .env so a developer's local file cannot change results.
    monkeypatch.setattr('pathlib.Path.exists', lambda self: False)

    path = os.path.join(SCRIPTS_DIR, 'aic-scraper-nodriver.py')
    spec = importlib.util.spec_from_file_location('aic_scraper_reload', path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except ImportError as err:
        pytest.skip(f'scraper import needs an absent runtime dep: {err}')
    finally:
        sys.modules.pop('aic_scraper_reload', None)
    return module


class TestEmptyStringEnvTrap:
    """GH Actions passes '' for undefined vars — `.get(k, default)` cannot save you."""

    def test_empty_batch_size_falls_back_to_default(self, monkeypatch):
        mod = reload_scraper_with_env(monkeypatch, SCRAPE_BATCH_SIZE='',
                                     SCRAPE_MAX_PERMITS='', SCRAPE_PERMIT_TYPE='')

        assert mod.BATCH_SIZE == 10, 'empty string must not reach int() bare'

    def test_empty_max_permits_falls_back_to_unlimited(self, monkeypatch):
        mod = reload_scraper_with_env(monkeypatch, SCRAPE_BATCH_SIZE='',
                                     SCRAPE_MAX_PERMITS='', SCRAPE_PERMIT_TYPE='')

        assert mod.MAX_PERMITS == 0, '0 = unlimited'

    def test_absent_vars_fall_back_to_defaults(self, monkeypatch):
        mod = reload_scraper_with_env(monkeypatch, SCRAPE_BATCH_SIZE=None,
                                     SCRAPE_MAX_PERMITS=None, SCRAPE_PERMIT_TYPE=None)

        assert (mod.BATCH_SIZE, mod.MAX_PERMITS) == (10, 0)

    def test_real_values_are_honored(self, monkeypatch):
        mod = reload_scraper_with_env(monkeypatch, SCRAPE_BATCH_SIZE='25',
                                     SCRAPE_MAX_PERMITS='500', SCRAPE_PERMIT_TYPE='')

        assert (mod.BATCH_SIZE, mod.MAX_PERMITS) == (25, 500)


class TestPermitTypeFilter:
    def test_empty_filter_targets_all_types(self, monkeypatch):
        mod = reload_scraper_with_env(monkeypatch, SCRAPE_PERMIT_TYPE='',
                                     SCRAPE_BATCH_SIZE='', SCRAPE_MAX_PERMITS='')

        assert mod.TARGET_TYPES == mod.ALL_TARGET_TYPES

    def test_filter_is_a_case_insensitive_substring_match(self, monkeypatch):
        mod = reload_scraper_with_env(monkeypatch, SCRAPE_PERMIT_TYPE='small residential',
                                     SCRAPE_BATCH_SIZE='', SCRAPE_MAX_PERMITS='')

        assert mod.TARGET_TYPES == ['Small Residential Projects']

    def test_unmatched_filter_yields_no_targets(self, monkeypatch):
        """A typo must produce an empty target list, not silently scrape everything."""
        mod = reload_scraper_with_env(monkeypatch, SCRAPE_PERMIT_TYPE='not-a-type',
                                     SCRAPE_BATCH_SIZE='', SCRAPE_MAX_PERMITS='')

        assert mod.TARGET_TYPES == []


class TestProxyExtension:
    """The MV3 extension carries proxy credentials — shape and permissions matter."""

    def test_returns_none_without_a_proxy_host(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'PROXY_HOST', '')

        assert scraper.build_proxy_extension('sess-1') is None

    def test_manifest_declares_the_auth_provider_permission(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'PROXY_HOST', 'proxy.example.com')
        monkeypatch.setattr(scraper, 'PROXY_PORT', '7777')
        monkeypatch.setattr(scraper, 'PROXY_USER', 'user')
        monkeypatch.setattr(scraper, 'PROXY_PASS', 'secret')

        ext_dir = scraper.build_proxy_extension('sess-2')
        try:
            manifest = json.loads(open(os.path.join(ext_dir, 'manifest.json')).read())

            assert manifest['manifest_version'] == 3
            # Without webRequestAuthProvider, onAuthRequired never fires and every
            # proxied request 407s.
            assert 'webRequestAuthProvider' in manifest['permissions']
            assert 'proxy' in manifest['permissions']
            assert manifest['background']['service_worker'] == 'background.js'
        finally:
            scraper.cleanup_proxy_extension(ext_dir)

    def test_background_script_routes_and_authenticates(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'PROXY_HOST', 'proxy.example.com')
        monkeypatch.setattr(scraper, 'PROXY_PORT', '7777')
        monkeypatch.setattr(scraper, 'PROXY_USER', 'user')
        monkeypatch.setattr(scraper, 'PROXY_PASS', 'secret')

        ext_dir = scraper.build_proxy_extension('sess-3')
        try:
            body = open(os.path.join(ext_dir, 'background.js')).read()

            # Routing AND auth both live here: if the extension fails to load,
            # traffic silently goes DIRECT (verify_proxy_extension_loaded exists
            # for exactly that reason).
            assert 'chrome.proxy.settings.set' in body
            assert 'chrome.webRequest.onAuthRequired' in body
            assert 'proxy.example.com' in body
            assert 'user-session-sess-3' in body, 'session stickiness per worker'
        finally:
            scraper.cleanup_proxy_extension(ext_dir)

    @pytest.mark.skipif(sys.platform == 'win32', reason='POSIX mode bits only')
    def test_credential_directory_is_owner_only(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'PROXY_HOST', 'proxy.example.com')
        monkeypatch.setattr(scraper, 'PROXY_PORT', '7777')
        monkeypatch.setattr(scraper, 'PROXY_USER', 'user')
        monkeypatch.setattr(scraper, 'PROXY_PASS', 'secret')

        ext_dir = scraper.build_proxy_extension('sess-4')
        try:
            mode = stat.S_IMODE(os.stat(ext_dir).st_mode)

            assert mode == 0o700, 'background.js holds live proxy credentials'
        finally:
            scraper.cleanup_proxy_extension(ext_dir)

    def test_cleanup_removes_the_directory(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'PROXY_HOST', 'proxy.example.com')
        monkeypatch.setattr(scraper, 'PROXY_PORT', '7777')

        ext_dir = scraper.build_proxy_extension('sess-5')
        scraper.cleanup_proxy_extension(ext_dir)

        assert not os.path.exists(ext_dir)

    def test_cleanup_is_idempotent(self, scraper):
        scraper.cleanup_proxy_extension('/nonexistent/path/xyz')  # must not raise


class TestSafeJsonParse:
    """A WAF block returns HTML with a 200 — parsing must classify, not crash."""

    def test_html_response_is_reported_as_a_block(self, scraper):
        data, err = scraper.safe_json_parse('<html>Access Denied</html>', 'step')

        assert data is None and err == 'html_or_empty'

    def test_empty_response_is_a_block(self, scraper):
        assert scraper.safe_json_parse('', 'step') == (None, 'html_or_empty')

    def test_valid_json_parses(self, scraper):
        data, err = scraper.safe_json_parse('{"folders": []}', 'step')

        assert err is None and data == {'folders': []}

    def test_fetch_error_sentinel_is_classified(self, scraper, captured_logs):
        data, err = scraper.safe_json_parse('{"error": "AbortError"}', 'step')

        assert data is None and err == 'fetch_error:AbortError'

    def test_malformed_json_is_not_raised(self, scraper, captured_logs):
        data, err = scraper.safe_json_parse('{not json', 'step')

        assert data is None and err is not None
