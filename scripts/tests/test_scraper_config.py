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


class TestProxyUsername:
    """Decodo parses the username as a hyphen-delimited key-value list.

    Verified live 2026-07-29 against the real endpoint: bare `<account>` -> 200,
    `<account>-session-<alnum>` -> 407 "Access denied", and
    `user-<account>-session-<alnum>` -> 200. Getting this wrong is invisible in
    the browser: Chrome renders "This site can't be reached" for every page,
    which is exactly what CI showed for runs 30498062060 / 30499270494.
    """

    def test_prefixes_the_literal_user_token(self, scraper):
        built = scraper.build_proxy_username('abc123', user='acct')

        assert built.startswith('user-acct-'), 'without user- Decodo 407s'

    def test_carries_session_and_duration(self, scraper):
        built = scraper.build_proxy_username('abc123', user='acct', duration_min=30)

        assert built == 'user-acct-session-abc123-sessionduration-30'

    def test_does_not_double_prefix(self, scraper):
        """An operator may already store the account WITH the prefix."""
        built = scraper.build_proxy_username('abc123', user='user-acct')

        assert built.startswith('user-acct-')
        assert not built.startswith('user-user-')

    def test_session_ids_are_alphanumeric_only(self, scraper):
        """A hyphen in the session value breaks Decodo's username parser."""
        session = scraper.build_proxy_session_id(1, timestamp=1753800000)

        assert session.isalnum(), f'{session!r} must contain no hyphens'

    def test_session_ids_are_unique_per_worker(self, scraper):
        a = scraper.build_proxy_session_id(1, timestamp=1753800000)
        b = scraper.build_proxy_session_id(2, timestamp=1753800000)

        assert a != b


class TestResolveProxyPort:
    """On ca.decodo.com the PORT selects the exit IP: 20000 rotating,
    20001-29999 sticky (one pinned IP each). Every worker on 20001 therefore
    shares one residential IP — a `-session-` suffix cannot override a
    port-level pin — silently defeating multi-worker rotation."""

    def test_each_worker_gets_its_own_port(self, scraper):
        assert scraper.resolve_proxy_port(1, base_port=20001) == 20001
        assert scraper.resolve_proxy_port(2, base_port=20001) == 20002
        assert scraper.resolve_proxy_port(5, base_port=20001) == 20005

    def test_standalone_keeps_the_base_port(self, scraper):
        assert scraper.resolve_proxy_port(None, base_port=20001) == 20001
        assert scraper.resolve_proxy_port('standalone', base_port=20001) == 20001

    def test_stays_within_the_sticky_band(self, scraper):
        """Must never wrap onto 20000 (rotating) or past 29999 (invalid)."""
        port = scraper.resolve_proxy_port(9999, base_port=20001)

        assert 20001 <= port <= 29999

    def test_numeric_string_worker_ids_work(self, scraper):
        """worker_id arrives as a string from argv."""
        assert scraper.resolve_proxy_port('3', base_port=20001) == 20003


class TestExtensionRetired:
    """The MV3 proxy extension is retired (WF2 restore, rung L0).

    It could not be relied on: branded Chrome >=137 silently drops
    `--load-extension`, and an idle MV3 service worker is evicted mid-run while
    `chrome.proxy` settings persist — so the browser keeps routing through the proxy
    while unable to authenticate. Both failure modes are silent. The relay replaces
    it at rung L2.
    """

    def test_extension_builders_are_gone(self, scraper):
        assert not hasattr(scraper, 'build_proxy_extension')
        assert not hasattr(scraper, 'cleanup_proxy_extension')


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


@pytest.mark.xfail(
    reason=(
        'EXPECTED TO FAIL AT RUNG L0, AND THAT IS THE POINT. This class is the '
        'measured Akamai reputation model in executable form; the WF2 restore '
        'deliberately returns the module DEFAULTS to the pre-drift values '
        '(3 / 2000 / 20), which are correct for the attested unproxied local path '
        'and known-wrong for a hostile edge. Deleting the class would delete the '
        'only enforcement of knowledge whose prose lives in a backlog file. The '
        'follow-on cloud WF owns setting the measured values in the workflow env '
        'and flipping this back to a hard assertion. See Spec 44 §3 and '
        '.cursor/wf2_deep_scrapes_restore.md (Yield CRITICAL-3).'
    ),
    strict=False,
)
class TestAkamaiTunedBackoff:
    """Pinned to the live-measured reputation model (recon 2026-07-30).

    Akamai allows ~12 requests per ~10 minutes per client, then 403s everything
    for ~5 minutes. Retrying inside that window deepens the block, and a high
    trap threshold spends requests against an edge already refusing everything.
    These values are the difference between rotating out of a block and
    hammering it — the CI signature was 654 requests, 0 rows, 102 traps.
    """

    def test_retry_backoff_outlasts_the_recovery_window(self, scraper):
        """First retry must land AFTER Akamai's ~5 min block would start clearing.

        Old value was 2000 ms — three retries all inside the window.
        """
        assert scraper.RETRY_BASE_MS >= 60_000, 'seconds-scale retries deepen the block'

    def test_total_retry_span_is_minutes_not_seconds(self, scraper):
        total_ms = sum(scraper.RETRY_BASE_MS * (2 ** i) for i in range(scraper.MAX_RETRIES))

        assert total_ms >= 240_000, 'the retry ladder must span the ~5 min recovery'

    def test_waf_trap_fires_before_the_budget_is_burned(self, scraper):
        """Rotate the exit IP after a few empties, not after 20.

        At ~4 calls/permit against a ~12-request budget, 20 consecutive empties
        is already several permits past the point the edge stopped answering.
        """
        assert scraper.WAF_TRAP_THRESHOLD <= 5

    def test_all_three_are_env_overridable(self, monkeypatch):
        mod = reload_scraper_with_env(
            monkeypatch, SCRAPER_MAX_RETRIES='7', SCRAPER_RETRY_BASE_MS='1234',
            SCRAPER_WAF_TRAP_THRESHOLD='9', SCRAPE_BATCH_SIZE='', SCRAPE_MAX_PERMITS='',
            SCRAPE_PERMIT_TYPE='')

        assert (mod.MAX_RETRIES, mod.RETRY_BASE_MS, mod.WAF_TRAP_THRESHOLD) == (7, 1234, 9)
