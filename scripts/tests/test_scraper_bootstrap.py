"""Regression locks for AIC scraper bootstrap — the seams that only ever failed in the cloud.

SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

Every test here pins a behavior that cost a ~6-minute GitHub Actions round-trip
to discover (2026-07-29 runs 30485096998 / 30487133930 / 30490094619):
  · a cache-restored profile's stale Singleton lock bricking Chrome launch
  · the extension tripwire masking nodriver's real connection error
  · the Chrome>=137 --load-extension opt-out silently stripping site isolation
"""

import os

import pytest


# ---------------------------------------------------------------------------
# clear_stale_profile_locks — the cache-poisoning fix
# ---------------------------------------------------------------------------
class TestClearStaleProfileLocks:
    def test_removes_all_three_singleton_artifacts(self, scraper, tmp_path):
        for name in ('SingletonLock', 'SingletonSocket', 'SingletonCookie'):
            (tmp_path / name).write_text('stale')

        removed = scraper.clear_stale_profile_locks(str(tmp_path))

        assert sorted(removed) == ['SingletonCookie', 'SingletonLock', 'SingletonSocket']
        assert not any((tmp_path / n).exists() for n in removed)

    def test_clean_profile_reports_nothing_removed(self, scraper, tmp_path):
        assert scraper.clear_stale_profile_locks(str(tmp_path)) == []

    def test_preserves_real_profile_state(self, scraper, tmp_path):
        """The fingerprint fence: cookies/localStorage must survive lock removal."""
        (tmp_path / 'SingletonLock').write_text('stale')
        (tmp_path / 'Cookies').write_text('session-data')
        (tmp_path / 'Default').mkdir()
        (tmp_path / 'Default' / 'Preferences').write_text('{}')

        scraper.clear_stale_profile_locks(str(tmp_path))

        assert (tmp_path / 'Cookies').read_text() == 'session-data'
        assert (tmp_path / 'Default' / 'Preferences').exists()

    def test_dangling_symlink_is_removed_not_followed(self, scraper, tmp_path):
        """A real SingletonLock is a symlink to <host>-<pid> that never resolves.

        os.path.exists() is False for it — the reason the implementation uses
        os.lstat. If this regresses to exists(), the poisoned-cache bug returns.
        """
        link = tmp_path / 'SingletonLock'
        try:
            os.symlink('some-host-4242', str(link))
        except (OSError, NotImplementedError):
            pytest.skip('symlink creation not permitted on this platform')

        assert not os.path.exists(str(link))  # the trap the implementation avoids
        assert scraper.clear_stale_profile_locks(str(tmp_path)) == ['SingletonLock']
        assert not os.path.lexists(str(link))

    def test_undeletable_lock_warns_and_continues(self, scraper, tmp_path, captured_logs):
        """An unremovable lock must not abort bootstrap earlier than Chrome would."""
        (tmp_path / 'SingletonLock').mkdir()  # a dir makes os.remove raise
        (tmp_path / 'SingletonCookie').write_text('stale')

        removed = scraper.clear_stale_profile_locks(str(tmp_path))

        assert removed == ['SingletonCookie'], 'must keep going past the failure'
        assert any(e.get('level') == 'WARN' and 'SingletonLock' in e.get('msg', '')
                   for e in captured_logs), 'the failure must be surfaced, not swallowed'

    def test_missing_profile_dir_does_not_raise(self, scraper, tmp_path):
        assert scraper.clear_stale_profile_locks(str(tmp_path / 'nope')) == []


# ---------------------------------------------------------------------------
# build_browser_args — the Chrome>=137 opt-out + DISPLAY fence
# ---------------------------------------------------------------------------
PROFILE = {'w': 1280, 'h': 800, 'platform': 'Win32', 'ua_hint': 'x'}


class TestBuildBrowserArgs:
    def test_no_proxy_runs_headless_without_extension_flags(self, scraper):
        args, use_headless = scraper.build_browser_args(PROFILE, platform='linux')

        assert use_headless is True
        assert not any(a.startswith('--load-extension') for a in args)
        assert not any('DisableLoadExtensionCommandLineSwitch' in a for a in args)

    def test_proxy_mode_is_headed_and_loads_the_extension(self, scraper, monkeypatch):
        monkeypatch.setenv('DISPLAY', ':99')

        args, use_headless = scraper.build_browser_args(
            PROFILE, proxy_ext_dir='/tmp/ext', platform='linux')

        assert use_headless is False, 'MV3 extensions require headed Chrome'
        assert '--load-extension=/tmp/ext' in args

    def test_opt_out_repeats_nodriver_features_so_isolation_is_not_stripped(
            self, scraper, monkeypatch):
        """Chrome honors only the LAST --disable-features; nodriver injects its own first.

        Dropping nodriver's values from our value would silently disable site
        isolation for a browser driving an external portal.
        """
        monkeypatch.setenv('DISPLAY', ':99')

        args, _ = scraper.build_browser_args(
            PROFILE, proxy_ext_dir='/tmp/ext', platform='linux')

        features = [a for a in args if a.startswith('--disable-features=')]
        assert len(features) == 1, 'exactly one --disable-features must be ours'
        value = features[0].split('=', 1)[1]
        assert 'DisableLoadExtensionCommandLineSwitch' in value
        for nodriver_feature in scraper.NODRIVER_DISABLED_FEATURES.split(','):
            assert nodriver_feature in value, (
                f'{nodriver_feature} must be repeated — Chrome keeps only the last switch')

    def test_proxy_mode_without_display_fails_fast_on_posix(self, scraper, monkeypatch):
        monkeypatch.delenv('DISPLAY', raising=False)

        with pytest.raises(RuntimeError, match='DISPLAY'):
            scraper.build_browser_args(PROFILE, proxy_ext_dir='/tmp/ext', platform='linux')

    def test_windows_needs_no_display(self, scraper, monkeypatch):
        monkeypatch.delenv('DISPLAY', raising=False)

        _, use_headless = scraper.build_browser_args(
            PROFILE, proxy_ext_dir='C:/tmp/ext', platform='win32')

        assert use_headless is False

    def test_headless_path_needs_no_display(self, scraper, monkeypatch):
        """No proxy → headless → a missing DISPLAY must NOT raise."""
        monkeypatch.delenv('DISPLAY', raising=False)

        args, use_headless = scraper.build_browser_args(PROFILE, platform='linux')

        assert use_headless is True and args

    def test_chrome_log_flags_are_paired(self, scraper):
        args, _ = scraper.build_browser_args(PROFILE, chrome_log='/tmp/c.log', platform='linux')

        assert '--enable-logging' in args, '--log-file alone produces no log'
        assert '--log-file=/tmp/c.log' in args

    def test_window_size_matches_the_fingerprint_profile(self, scraper):
        """Fingerprint coherence fence: viewport must match the chosen profile."""
        args, _ = scraper.build_browser_args({'w': 1440, 'h': 900}, platform='linux')

        assert '--window-size=1440,900' in args

    def test_automation_flag_suppression_is_always_present(self, scraper):
        """Stealth fence (73fae6c9): cdc_ suppression is not proxy-conditional."""
        args, _ = scraper.build_browser_args(PROFILE, platform='linux')

        assert '--disable-blink-features=AutomationControlled' in args


# ---------------------------------------------------------------------------
# verify_proxy_extension_loaded — MOVED
# ---------------------------------------------------------------------------
# Its locks now live in test_scraper_launch_attach.py: the tripwire takes the
# PAGE (a Tab) rather than the browser, because `browser.connection` is a
# nodriver internal and `Tab.send` is the version-stable path. The retired
# "missing connection reports liveness" test asserted a premise I later
# RETRACTED — the source shows that NoneType error most likely originated
# inside browser.get(), not in the tripwire (see G4 in
# .cursor/wf3_deep_scrapes_cdp_handshake.md).


# ---------------------------------------------------------------------------
# Chrome launch-log diagnostics
# ---------------------------------------------------------------------------
class TestChromeLaunchLog:
    def test_path_is_per_worker(self, scraper):
        assert scraper.chrome_launch_log_path(1) != scraper.chrome_launch_log_path(2)
        assert 'worker-1' in scraper.chrome_launch_log_path(1)
        assert 'standalone' in scraper.chrome_launch_log_path(None)

    def test_dump_reports_missing_log_without_raising(self, scraper, monkeypatch,
                                                     captured_logs, tmp_path):
        monkeypatch.setattr(scraper, 'chrome_launch_log_path',
                            lambda _w: str(tmp_path / 'absent.log'))

        scraper.dump_chrome_launch_log(1)

        assert any(e.get('context', {}).get('event') == 'chrome_launch_log_missing'
                   for e in captured_logs)

    def test_dump_distinguishes_empty_log_from_missing(self, scraper, monkeypatch,
                                                      captured_logs, tmp_path):
        empty = tmp_path / 'chrome.log'
        empty.write_text('\n  \n')
        monkeypatch.setattr(scraper, 'chrome_launch_log_path', lambda _w: str(empty))

        scraper.dump_chrome_launch_log(1)

        assert any(e.get('context', {}).get('event') == 'chrome_launch_log_empty'
                   for e in captured_logs)

    def test_dump_emits_bounded_tail(self, scraper, monkeypatch, captured_logs, tmp_path):
        log_file = tmp_path / 'chrome.log'
        log_file.write_text('\n'.join(f'line {i}' for i in range(100)))
        monkeypatch.setattr(scraper, 'chrome_launch_log_path', lambda _w: str(log_file))

        scraper.dump_chrome_launch_log(1, max_lines=10)

        dumps = [e for e in captured_logs
                 if e.get('context', {}).get('event') == 'chrome_launch_log']
        assert len(dumps) == 1
        lines = dumps[0]['context']['lines']
        assert len(lines) == 10 and lines[-1] == 'line 99', 'must be the TAIL'
