"""The relay's stderr must never carry the proxy password into the database.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

Found by the Security reviewer 2026-07-31. The leak was live and durable:
proxy-chain interpolates the FULL credentialed upstream URL into its throw
messages (dist/server.js:407,410), proxy-relay.mjs wrote error.message to
stderr beneath a comment claiming it never echoes credentials, and the
scraper's sampler carried it verbatim into relay_stderr_samples ->
records_meta -> pipeline_runs -> the admin pipeline-history API.

Deterministically triggerable, not theoretical: PROXY_SCHEME is env-controlled
and unvalidated, so a wrong value makes new URL() throw on the FIRST request,
and PROXY_HOST is interpolated unquoted so whitespace in the secret does it too.
One typo in a GitHub secret wrote the Decodo password into a DB row.
"""

import re


REAL_SHAPE = (
    'Invalid "upstreamProxyUrl" provided: TypeError [ERR_INVALID_URL] '
    '(was "https://user-buildoacct-session-w1t123:sup3rs3cr3t@ca.decodo.com:20001"'
)


class TestRedactCredentials:
    def test_strips_the_password_from_a_real_proxy_chain_message(self, scraper):
        out = scraper.redact_credentials(REAL_SHAPE)
        assert 'sup3rs3cr3t' not in out
        assert 'user-buildoacct' not in out
        assert '//***@' in out
        # The diagnostic value must survive — this is an observability feature.
        assert 'ca.decodo.com:20001' in out
        assert 'ERR_INVALID_URL' in out

    def test_no_at_sign_survives_in_any_url(self, scraper):
        for raw in (
            'https://u:p@host:1/path',
            'proxy-relay: request failed for https://a:b@h:2: boom',
            'two https://x:y@h1/ and https://p:q@h2/',
        ):
            out = scraper.redact_credentials(raw)
            # Every surviving `//...@` must be exactly the redacted marker —
            # anything else is an unredacted userinfo section.
            for match in re.findall(r'//[^/@\s]*@', out):
                assert match == '//***@', f'unredacted userinfo {match!r} in {out!r}'
            assert ':p@' not in out and ':y@' not in out and ':q@' not in out

    def test_leaves_ordinary_text_alone(self, scraper):
        for benign in (
            'proxy-relay: BLOCKED accounts.google.com (cost blocklist)',
            'Host x is on the scraper proxy cost blocklist',
            'user@example.com mentioned in prose',
        ):
            assert scraper.redact_credentials(benign) == benign

    def test_handles_none_and_empty(self, scraper):
        assert scraper.redact_credentials(None) == ''
        assert scraper.redact_credentials('') == ''


class TestSamplerNeverPersistsCredentials:
    """The sampler is the LAST gate before a credential becomes durable."""

    def test_credentialed_stderr_line_is_redacted_before_it_is_stored(self, scraper):
        from types import SimpleNamespace
        worker = 'redaction-test-worker'
        scraper._relay_block_counts.pop(worker, None)
        proc = SimpleNamespace(stderr=[f'proxy-relay: {REAL_SHAPE}\n'])
        thread = scraper._drain_relay_stderr(proc, worker)
        thread.join(timeout=5)

        samples = scraper._relay_block_counts[worker]['samples']
        assert samples, 'the diagnostic must still be captured, just not the secret'
        assert all('sup3rs3cr3t' not in s for s in samples)
        assert all('//***@' in s or '@' not in s for s in samples)

    def test_summary_payload_carries_no_credentials(self, scraper):
        """relay_stderr_samples is what reaches pipeline_runs."""
        from types import SimpleNamespace
        worker = 'redaction-test-worker-2'
        scraper._relay_block_counts.pop(worker, None)
        proc = SimpleNamespace(stderr=[f'proxy-relay: {REAL_SHAPE}\n'])
        scraper._drain_relay_stderr(proc, worker).join(timeout=5)

        summary = scraper._relay_summary()
        assert all('sup3rs3cr3t' not in s for s in summary['samples'])
