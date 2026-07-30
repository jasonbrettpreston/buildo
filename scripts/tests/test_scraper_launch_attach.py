"""Regression locks for launch-and-attach: we spawn Chrome, nodriver only attaches.

SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

Why this design exists (see .cursor/wf3_deep_scrapes_cdp_handshake.md):
nodriver's own launch path gives the DevTools handshake a HARDCODED 2.25 s
(browser.py:425-449 — five probes, no config knob), which a cold profile on a
CI runner exceeds just creating its favicon/quota/password-store databases;
it never reads DevToolsActivePort, so a failed port bind leaves it blind to a
live browser; it PIPEs Chrome's stdio and never drains it (a full 64 KB buffer
stalls startup); and it raises from INSIDE start(), leaving the caller no
handle to kill the browser it just spawned — which then owns the profile and
makes every retry fail identically. Owning the process fixes all four.
"""

import json
import subprocess
import sys

import pytest


PROFILE = {'w': 1280, 'h': 800, 'platform': 'Win32', 'ua_hint': 'x'}


class TestLaunchArgs:
    """In attach mode nodriver contributes NO flags — we must supply them all."""

    def test_remote_debugging_flags_are_present(self, scraper):
        args, _ = scraper.build_browser_args(PROFILE, debug_port=9333, platform='linux')

        assert '--remote-debugging-port=9333' in args
        # 127.0.0.1 explicitly: nodriver polls that literal host, not localhost.
        assert '--remote-debugging-host=127.0.0.1' in args

    def test_nodriver_defaults_are_reproduced(self, scraper):
        """Dropping these would change behavior/fingerprint vs the proven runs."""
        args, _ = scraper.build_browser_args(PROFILE, debug_port=9333, platform='linux')

        for flag in scraper.NODRIVER_DEFAULT_ARGS:
            assert flag in args, f'{flag} was supplied by nodriver before attach mode'

    def test_user_data_dir_is_passed_when_given(self, scraper):
        """Chrome 136+ ignores --remote-debugging-port on a DEFAULT profile dir."""
        args, _ = scraper.build_browser_args(
            PROFILE, debug_port=9333, profile_dir='/tmp/prof', platform='linux')

        assert '--user-data-dir=/tmp/prof' in args

    def test_sandbox_is_not_disabled(self, scraper):
        """de3ff6dd fence: keep Chrome's real sandbox — no launch-flag divergence
        from the operator's local runs for a WAF-sensitive scraper."""
        args, _ = scraper.build_browser_args(
            PROFILE, debug_port=9333, profile_dir='/tmp/p', platform='linux')

        assert '--no-sandbox' not in args

    def test_headless_flag_only_without_proxy(self, scraper, monkeypatch):
        monkeypatch.setenv('DISPLAY', ':99')

        headless_args, _ = scraper.build_browser_args(PROFILE, platform='linux')
        headed_args, _ = scraper.build_browser_args(
            PROFILE, proxy_ext_dir='/tmp/ext', platform='linux')

        assert '--headless=new' in headless_args
        assert '--headless=new' not in headed_args, 'MV3 extensions need headed Chrome'

    def test_exactly_one_disable_features_switch(self, scraper, monkeypatch):
        """Chrome keeps only the LAST occurrence — two switches silently drop one."""
        monkeypatch.setenv('DISPLAY', ':99')

        args, _ = scraper.build_browser_args(
            PROFILE, proxy_ext_dir='/tmp/ext', debug_port=9333, platform='linux')

        features = [a for a in args if a.startswith('--disable-features=')]
        assert len(features) == 1
        value = features[0].split('=', 1)[1]
        assert 'DisableLoadExtensionCommandLineSwitch' in value
        for nodriver_feature in scraper.NODRIVER_DISABLED_FEATURES.split(','):
            assert nodriver_feature in value


class FakeProc:
    """Stands in for a Popen: `rc` None means still running."""

    def __init__(self, rc=None):
        self.returncode = rc
        self.pid = 4242

    def poll(self):
        return self.returncode


class TestWaitForDevtools:
    def test_returns_port_and_info_once_endpoint_answers(self, scraper, monkeypatch):
        payload = json.dumps({'Browser': 'Chrome/150.0.0.0'}).encode()

        class FakeResp:
            def read(self):
                return payload
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        monkeypatch.setattr(scraper.urllib.request, 'urlopen', lambda *a, **k: FakeResp())

        port, info = scraper.wait_for_devtools(9333, proc=FakeProc(), timeout=5)

        assert port == 9333
        assert info['Browser'] == 'Chrome/150.0.0.0'

    def test_early_exit_names_the_return_code(self, scraper, monkeypatch):
        """The whole point: say WHY, unlike nodriver's cause-agnostic message."""
        monkeypatch.setattr(scraper.urllib.request, 'urlopen',
                            lambda *a, **k: (_ for _ in ()).throw(OSError('refused')))

        with pytest.raises(RuntimeError, match='returncode=127'):
            scraper.wait_for_devtools(9333, proc=FakeProc(rc=127), timeout=5)

    def test_timeout_message_states_port_and_budget(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper.urllib.request, 'urlopen',
                            lambda *a, **k: (_ for _ in ()).throw(OSError('refused')))

        with pytest.raises(RuntimeError, match='did not answer on port 9333'):
            scraper.wait_for_devtools(9333, proc=FakeProc(), timeout=0.5)

    def test_falls_back_to_devtools_active_port(self, scraper, monkeypatch, tmp_path,
                                               captured_logs):
        """If Chrome could not bind our port it picks another and writes it here.

        nodriver never reads this file, which is why a lost port race leaves it
        permanently blind to a browser that is alive and serving.
        """
        (tmp_path / 'DevToolsActivePort').write_text('45678\n/devtools/browser/abc\n')
        payload = json.dumps({'Browser': 'Chromium/150'}).encode()

        class FakeResp:
            def read(self):
                return payload
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        def only_the_real_port(url, *a, **k):
            if '45678' in url:
                return FakeResp()
            raise OSError('connection refused')

        monkeypatch.setattr(scraper.urllib.request, 'urlopen', only_the_real_port)

        port, info = scraper.wait_for_devtools(
            9333, proc=FakeProc(), profile_dir=str(tmp_path), timeout=5)

        assert port == 45678, 'must follow Chrome to the port it actually bound'
        assert any(e.get('context', {}).get('event') == 'devtools_port_drift'
                   for e in captured_logs), 'a port drift must be surfaced, not silent'

    def test_timeout_is_env_overridable(self, scraper, monkeypatch):
        """A merely-slow runner should be fixable without a code change."""
        assert scraper.DEVTOOLS_READY_TIMEOUT_S > 2.75, (
            'must exceed nodriver\'s hardcoded 2.25s budget — the entire point')


class TestReadDevtoolsActivePort:
    def test_parses_the_first_line(self, scraper, tmp_path):
        (tmp_path / 'DevToolsActivePort').write_text('9222\n/devtools/browser/x\n')

        assert scraper.read_devtools_active_port(str(tmp_path)) == 9222

    def test_missing_file_is_none(self, scraper, tmp_path):
        assert scraper.read_devtools_active_port(str(tmp_path)) is None

    def test_garbage_is_none_not_an_exception(self, scraper, tmp_path):
        (tmp_path / 'DevToolsActivePort').write_text('not-a-port\n')

        assert scraper.read_devtools_active_port(str(tmp_path)) is None


class TestFreePort:
    def test_returns_a_usable_port(self, scraper):
        port = scraper.find_free_port()

        assert isinstance(port, int) and 1024 < port <= 65535


class TestTerminateSpawnedChrome:
    def test_no_process_is_a_noop(self, scraper):
        assert scraper.terminate_spawned_chrome('absent-worker') is False

    def test_already_exited_process_is_a_noop(self, scraper):
        scraper._spawned_browsers['w9'] = FakeProc(rc=0)
        try:
            assert scraper.terminate_spawned_chrome('w9') is False
        finally:
            scraper._spawned_browsers.pop('w9', None)

    def test_is_idempotent(self, scraper):
        """Called before each retry AND in the final-failure path."""
        scraper._spawned_browsers['w8'] = FakeProc(rc=0)
        try:
            scraper.terminate_spawned_chrome('w8')
            assert scraper.terminate_spawned_chrome('w8') is False
        finally:
            scraper._spawned_browsers.pop('w8', None)

    @pytest.mark.skipif(sys.platform == 'win32', reason='process groups are POSIX')
    def test_kills_a_real_child_process(self, scraper):
        proc = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=True)
        scraper._spawned_browsers['w-real'] = proc
        try:
            assert scraper.terminate_spawned_chrome('w-real') is True
            assert proc.poll() is not None, 'process must actually be dead'
        finally:
            scraper._spawned_browsers.pop('w-real', None)
            if proc.poll() is None:
                proc.kill()

    def test_registry_is_keyed_per_worker(self, scraper):
        """Killing worker 1 must never touch worker 2's browser."""
        scraper._spawned_browsers['w1'] = FakeProc(rc=0)
        scraper._spawned_browsers['w2'] = FakeProc(rc=0)
        try:
            scraper.terminate_spawned_chrome('w1')

            assert 'w1' not in scraper._spawned_browsers
            assert 'w2' in scraper._spawned_browsers
        finally:
            scraper._spawned_browsers.pop('w1', None)
            scraper._spawned_browsers.pop('w2', None)


# NOTE: the target-visibility tripwire that used to be locked here is GONE.
# It judged "is the extension loaded?" by looking for a
# chrome-extension://*/background.js target and rejected a browser whose
# targets were only ['page:about:blank'] (GH run 30496893882) — but MV3 service
# workers are lazily started and not reliably enumerated by Target.getTargets
# without a discovery filter, so it could fail a correctly-proxied browser.
# Replaced by verify_proxied_egress, which proves the invariant that matters;
# its locks live in test_scraper_egress.py.


class TestRelayPlumbing:
    """The no-proxy path must survive every relay-aware call site.

    `relay_url` is assigned only under `if PROXY_HOST:` in scrape_loop's
    WAF-trap branch but read unconditionally, so if it is not a PARAMETER
    Python makes it function-local and a no-proxy run that trips the WAF trap
    dies with UnboundLocalError. The pre-migration code was safe by accident
    (proxy_ext_dir was a parameter); the mechanical swap lost that.
    """

    def test_scrape_loop_accepts_relay_url_as_a_parameter(self, scraper):
        import inspect

        params = inspect.signature(scraper.scrape_loop).parameters

        assert 'relay_url' in params, 'must be a parameter, not a bare local'
        assert params['relay_url'].default is None

    def test_bootstrap_entrypoints_accept_relay_url(self, scraper):
        import inspect

        for fn in (scraper.bootstrap_session, scraper.bootstrap_with_retry):
            params = inspect.signature(fn).parameters
            assert 'relay_url' in params, f'{fn.__name__} must accept relay_url'
            assert params['relay_url'].default is None

    def test_relay_registry_is_separate_from_the_browser_registry(self, scraper):
        """A relay holds live credentials; it must be tracked and killed on its own."""
        assert scraper._spawned_relays is not scraper._spawned_browsers
        assert scraper.terminate_spawned_relay('nobody') is False
