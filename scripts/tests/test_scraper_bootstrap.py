"""Bootstrap-path locks for aic-scraper-nodriver.py — WF2 restore, rung L0.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3, §5
SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
PLAN: .cursor/wf2_deep_scrapes_restore.md (K2, K7a, K7b, C9)

These cover the pure seams of the launch path: flag construction, headedness, the
DISPLAY guard, profile-lock clearing, and the step-1 body classifier. Everything
here is reachable WITHOUT a browser — a launch regression must be catchable by
`npm run test:py`, not only by dispatching a ~6-minute CI run, which is the loop
this restore exists to escape.

Attach-mode launch tests live in `_deferred/test_scraper_launch_attach.py.L1` and
return with rung L1, which introduces the code they exercise.
"""

import os
import sys

import pytest


class TestBuildBrowserArgs:
    """The launch surface. Pure function, no browser required."""

    def test_unproxied_default_runs_headless(self, scraper):
        _, use_headless = scraper.build_browser_args(scraper.FINGERPRINT_PROFILES[0])
        assert use_headless is True, (
            'the unproxied default path has no display requirement and must not '
            'invent one'
        )

    def test_automation_flag_suppression_is_always_present(self, scraper):
        args, _ = scraper.build_browser_args(scraper.FINGERPRINT_PROFILES[0])
        assert '--disable-blink-features=AutomationControlled' in args, (
            'suppressing the cdc_ variables is the baseline stealth measure; losing '
            'it is invisible locally and fatal against the WAF'
        )

    def test_window_size_matches_the_fingerprint_profile(self, scraper):
        profile = scraper.FINGERPRINT_PROFILES[0]
        args, _ = scraper.build_browser_args(profile)
        assert f"--window-size={profile['w']},{profile['h']}" in args, (
            'viewport must match the profile it was drawn from — an incoherent '
            'fingerprint is worse than a plain one'
        )

    def test_no_extension_flags_survive_the_retirement(self, scraper):
        """The MV3 extension is retired at L0; its flags must not reappear.

        Branded Chrome >=137 silently drops --load-extension, so these flags were
        both inert and misleading: they made runs look proxied that were not.
        """
        args, _ = scraper.build_browser_args(scraper.FINGERPRINT_PROFILES[0])
        joined = ' '.join(args)
        assert '--load-extension' not in joined
        assert 'DisableLoadExtensionCommandLineSwitch' not in joined

    def test_proxy_mode_forces_headed(self, scraper, monkeypatch):
        """C9 regression lock: headedness follows the proxy MODE, not the extension.

        Headedness used to derive solely from the extension dir, so retiring the
        extension would have silently made every path headless — and headless-vs-headed
        is a first-order bot signal.
        """
        monkeypatch.setattr(scraper, 'PROXY_MODE', 'relay')
        monkeypatch.setenv('DISPLAY', ':99')
        _, use_headless = scraper.build_browser_args(scraper.FINGERPRINT_PROFILES[0])
        assert use_headless is False

    @pytest.mark.skipif(sys.platform == 'win32', reason='DISPLAY is POSIX-only')
    def test_proxy_mode_without_display_fails_fast_on_posix(self, scraper, monkeypatch):
        """A named error beats Chrome's opaque 'cannot open display'."""
        monkeypatch.setattr(scraper, 'PROXY_MODE', 'relay')
        monkeypatch.delenv('DISPLAY', raising=False)
        with pytest.raises(RuntimeError, match='DISPLAY'):
            scraper.build_browser_args(scraper.FINGERPRINT_PROFILES[0])

    def test_headless_path_needs_no_display(self, scraper, monkeypatch):
        """The DISPLAY guard must not fire on the unproxied path."""
        monkeypatch.setattr(scraper, 'PROXY_MODE', 'none')
        monkeypatch.delenv('DISPLAY', raising=False)
        args, use_headless = scraper.build_browser_args(scraper.FINGERPRINT_PROFILES[0])
        assert use_headless is True and args


class TestProxyMode:
    """Proxying is a DECLARED state, never inferred from credential presence."""

    def test_default_is_unproxied(self, scraper):
        assert scraper.proxy_mode() == 'none'
        assert scraper.proxy_enabled() is False

    def test_credentials_alone_do_not_enable_proxying(self, scraper, monkeypatch):
        """Regression lock for the silent-unproxied class.

        Before 2026-07-30 `if PROXY_HOST:` selected the extension path, which branded
        Chrome dropped — so setting credentials produced a run that believed it was
        proxied and was not. Credentials must never imply a mode.
        """
        monkeypatch.setattr(scraper, 'PROXY_HOST', 'ca.decodo.com')
        monkeypatch.setattr(scraper, 'PROXY_MODE', 'none')
        assert scraper.proxy_enabled() is False

    def test_credentials_without_a_mode_fail_loudly(self, scraper, monkeypatch):
        """Silence is the bug: an operator with PROXY_HOST set must be told."""
        monkeypatch.setattr(scraper, 'PROXY_HOST', 'ca.decodo.com')
        monkeypatch.setattr(scraper, 'PROXY_MODE', 'none')
        with pytest.raises(RuntimeError, match='PROXY_HOST is set'):
            scraper.assert_proxy_config_coherent()

    def test_relay_is_a_supported_mode(self, scraper):
        """'relay' went live at rung L2 and replaces the retired MV3 extension."""
        assert 'relay' in scraper.SUPPORTED_PROXY_MODES
        assert 'extension' not in scraper.SUPPORTED_PROXY_MODES, (
            'the MV3 extension is retired: branded Chrome drops --load-extension '
            'and an idle service worker is evicted mid-run, both silently'
        )

    def test_unknown_mode_is_refused_not_silently_ignored(self, scraper, monkeypatch):
        """A typo must stop the run, never fall back to an unintended path."""
        monkeypatch.setattr(scraper, 'PROXY_MODE', 'relayy')
        with pytest.raises(RuntimeError, match='not supported'):
            scraper.assert_proxy_config_coherent()

    def test_clean_unproxied_config_passes(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'PROXY_HOST', '')
        monkeypatch.setattr(scraper, 'PROXY_MODE', 'none')
        scraper.assert_proxy_config_coherent()  # must not raise


class TestProfileLocks:
    """K2 — a cache-restored Singleton lock bricks Chrome permanently."""

    def test_removes_a_stale_lock_naming_another_host(self, scraper, tmp_path):
        lock = tmp_path / 'SingletonLock'
        try:
            os.symlink('some-other-host-12345', lock)
        except (OSError, NotImplementedError):
            pytest.skip('symlink creation not permitted on this host')
        removed = scraper.clear_stale_profile_locks(str(tmp_path))
        assert 'SingletonLock' in removed
        assert not os.path.lexists(lock), (
            'a lock naming another host can never be live here — this is the CI '
            'cache-poisoning case and it must always be cleared'
        )

    def test_absent_locks_are_a_no_op(self, scraper, tmp_path):
        assert scraper.clear_stale_profile_locks(str(tmp_path)) == []

    def test_is_idempotent(self, scraper, tmp_path):
        scraper.clear_stale_profile_locks(str(tmp_path))
        assert scraper.clear_stale_profile_locks(str(tmp_path)) == []

    def test_refuses_to_strip_a_lock_held_by_live_local_chrome(self, scraper, tmp_path):
        """Removing a LIVE lock lets a second Chrome corrupt the same profile.

        The guard is directional on purpose: another host is always stale; this host
        with a running PID is left alone.
        """
        import socket
        lock = tmp_path / 'SingletonLock'
        try:
            os.symlink(f'{socket.gethostname()}-{os.getpid()}', lock)
        except (OSError, NotImplementedError):
            pytest.skip('symlink creation not permitted on this host')
        removed = scraper.clear_stale_profile_locks(str(tmp_path))
        assert 'SingletonLock' not in removed
        assert os.path.lexists(lock)

    def test_unparseable_target_is_treated_as_stale(self, scraper, tmp_path):
        """Fail toward clearing: an unclearable profile is bricked forever."""
        lock = tmp_path / 'SingletonLock'
        try:
            os.symlink('garbage-with-no-pid', lock)
        except (OSError, NotImplementedError):
            pytest.skip('symlink creation not permitted on this host')
        assert 'SingletonLock' in scraper.clear_stale_profile_locks(str(tmp_path))


class TestStep1BodyClassifier:
    """K7a — the instrument that makes rung L0 attributable.

    An empty step-1 result is ambiguous: `[]` is a genuine not-found, while a
    ~430-byte HTML page is an Akamai block. Both used to feed the same counter, so a
    fully-blocked run and a run over legitimately-absent permits looked identical —
    which is how a day went into debugging the wrong thing.
    """

    def test_html_access_denied_is_recognised_as_unreachable(self, scraper):
        assert scraper._looks_unreachable("This site can't be reached")

    def test_empty_json_list_is_not_unreachable(self, scraper):
        assert not scraper._looks_unreachable('[]')

    def test_sampling_is_bounded(self, scraper, monkeypatch):
        """Diagnostics must never become the thing that floods a run's logs."""
        monkeypatch.setattr(scraper, 'STEP1_BODY_SAMPLES', 2)
        monkeypatch.setattr(scraper, '_step1_samples_logged', [0])
        for _ in range(5):
            scraper._log_step1_body('[]', 'empty_result', '24-123456')
        assert scraper._step1_samples_logged[0] == 2

    def test_logging_never_alters_control_flow(self, scraper, monkeypatch):
        """It returns None and raises nothing — a diagnostic must not gate."""
        monkeypatch.setattr(scraper, '_step1_samples_logged', [0])
        assert scraper._log_step1_body(None, 'parse_failed', None) is None


class TestAicOriginAssertion:
    """The fix for GH run 30560364087 — 8 permits, 0 rows, every one mislabelled WAF.

    Data calls run as `page.evaluate(fetch(...))`, so they inherit the PAGE's origin.
    When the navigation to setup.do silently failed, the document was not on
    secure.toronto.ca and every same-origin /jaxrs/ fetch threw `TypeError`, which
    `safe_json_parse` turned into `html_or_empty` and the scraper reported as
    `waf_blocked`. A broken transport wore a WAF block's clothes for an entire run.
    """

    class _Page:
        def __init__(self, href):
            self._href = href

        async def evaluate(self, _expr, await_promise=False):
            if isinstance(self._href, Exception):
                raise self._href
            return self._href

    def test_accepts_the_aic_origin(self, scraper):
        import asyncio
        page = self._Page('https://secure.toronto.ca/ApplicationStatus/setup.do?action=init')
        assert asyncio.run(scraper.assert_on_aic_origin(page))

    def test_rejects_a_chrome_error_page(self, scraper):
        """The exact production failure: navigation died, document is about:blank."""
        import asyncio
        page = self._Page('about:blank')
        with pytest.raises(RuntimeError, match='did not land'):
            asyncio.run(scraper.assert_on_aic_origin(page))

    def test_error_names_the_transport_not_the_scrape(self, scraper):
        """An operator must be pointed at the proxy, not at WAF tuning."""
        import asyncio
        page = self._Page('chrome-error://chromewebdata/')
        with pytest.raises(RuntimeError, match='bootstrap failure, not a scrape failure'):
            asyncio.run(scraper.assert_on_aic_origin(page))

    def test_unreadable_url_is_also_fatal(self, scraper):
        import asyncio
        page = self._Page(RuntimeError('detached'))
        with pytest.raises(RuntimeError, match='Could not read the page URL'):
            asyncio.run(scraper.assert_on_aic_origin(page))
