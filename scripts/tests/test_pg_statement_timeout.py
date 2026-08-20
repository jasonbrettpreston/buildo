"""Python connection factories must lift the cloud session `statement_timeout`.

SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md  (§5.1 statement_timeout blockquote, :276-283)
SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md
SPEC LINK: docs/specs/01-pipeline/119_backend_verification_doctrine.md  (§2 verification ladder)

WHY THIS FILE EXISTS
--------------------
2026-08-19, GH run 32270233708: the deep_scrapes chain died at step [1/7]
`inspections`, 144.8s in, with

    psycopg2.errors.QueryCanceled: canceling statement due to statement timeout

`scripts/lib/pipeline.js` has given every NODE pool `SET statement_timeout TO 0`
since `fa9e984c` (2026-07-29), because the Supabase cloud session default is
2min and the Supavisor pooler DROPS startup params. The two PYTHON entry points
call `psycopg2.connect()` directly and never got that guarantee.

WHY THESE ARE LIVE-DB TESTS AND NOT MOCKS
-----------------------------------------
A mocked connection can only prove `execute()` was CALLED with some string. It
cannot prove the `SET` took EFFECT — and Spec 47 §5.1 exists precisely because
two mechanisms that LOOKED correct (startup `options`, the `statement_timeout`
startup param) were silently dropped by the pooler. Spec 119 §5.2 names the
mocked form as coverage theater. So the L-cases below impose a hostile session
default via PGOPTIONS and assert observable behaviour.

PGOPTIONS is used rather than `ALTER ROLE ... IN DATABASE` / `ALTER DATABASE`:
the role form leaks a login role on any mid-test crash (`DROP ROLE` fails on the
`GRANT CONNECT` dependency), and the database form would hit every concurrent
connection. PGOPTIONS mutates nothing server-side and cannot leak.
"""

import os

import pytest

pytestmark = pytest.mark.dbtest

HOSTILE = '-c statement_timeout=500'      # ms; stands in for the cloud's 2min
SLEEP_OVER_BUDGET = 'SELECT pg_sleep(2)'  # 2s > 500ms; pg_sleep IS cancellable (verified)
TIMEOUT_SETTING = "SELECT setting FROM pg_settings WHERE name='statement_timeout'"

# `SHOW`/`current_setting()` NORMALISE units — `SET 300000` reads back as '5min'.
# pg_settings.setting keeps the raw ms value. Always assert via pg_settings.

# Larger than PG's max for this GUC (2147483647), so the server REJECTS the SET
# with InvalidParameterValue/22023. This is the only NON-MOCK way to force a
# failing SET, which is why `_statement_timeout_ms()` deliberately carries no
# upper bound (the server is the authority on its own parameter's range).
OVER_MAX = '2147483648'


def _factory(request, modname):
    """The real get_db_connection() from either python entry point."""
    return request.getfixturevalue(modname).get_db_connection


def _timeout_ms(mod):
    """The helper the fix introduces. Fails LOUDLY (not AttributeError) pre-fix."""
    fn = getattr(mod, '_statement_timeout_ms', None)
    assert fn is not None, (
        f'{mod.__name__} has no _statement_timeout_ms() — the fix is not implemented. '
        'This is the designed red, not an incidental import error.'
    )
    return fn


BOTH = pytest.mark.parametrize('modname', ['orchestrator', 'scraper'])


# ---------------------------------------------------------------------------
# Tier A — live-DB behavioural
# ---------------------------------------------------------------------------
class TestLiveBehaviour:

    def test_L1_control_the_hostile_default_is_genuinely_in_effect(self, live_db, monkeypatch):
        """Harness control. Proves L1/L2's red is caused by the MISSING SET and
        not by a broken fixture — a red that matches nothing is not a lock
        (Spec 08 §11.3, the envelope-regex lesson)."""
        psycopg2 = pytest.importorskip('psycopg2')
        monkeypatch.setenv('PGOPTIONS', HOSTILE)
        conn = psycopg2.connect(**live_db)
        try:
            cur = conn.cursor()
            cur.execute(TIMEOUT_SETTING)
            assert cur.fetchone()[0] == '500', 'PGOPTIONS did not reach libpq'
            with pytest.raises(psycopg2.errors.QueryCanceled) as exc:
                cur.execute(SLEEP_OVER_BUDGET)
            assert exc.value.pgcode == '57014'
        finally:
            conn.close()

    @BOTH
    def test_L0_connection_is_handed_back_in_todays_transaction_state(
            self, request, modname, live_db):
        """The ONLY case that fails if FENCE A is 'simplified' to leave
        autocommit=True. Every other case still passes in that world, while the
        scraper's four conn.rollback() calls and claim_batch_from_queue()'s
        batch atomicity silently become no-ops."""
        conn = _factory(request, modname)()
        try:
            assert conn.autocommit is False, 'factory must return autocommit=False as today'
            assert conn.get_transaction_status() == 0, 'factory must return an IDLE connection'
        finally:
            conn.close()

    @BOTH
    def test_L1_L2_factory_lifts_the_hostile_cap(self, request, modname, live_db, monkeypatch):
        """RED today: no SET is issued, so the 500ms cap survives and pg_sleep(2)
        is cancelled with 57014. GREEN after the fix."""
        monkeypatch.setenv('PGOPTIONS', HOSTILE)
        monkeypatch.delenv('PIPELINE_STATEMENT_TIMEOUT_MS', raising=False)
        conn = _factory(request, modname)()
        try:
            cur = conn.cursor()
            cur.execute(TIMEOUT_SETTING)
            assert cur.fetchone()[0] == '0', 'factory did not clear the inherited cap'
            cur.execute(SLEEP_OVER_BUDGET)   # must NOT raise
        finally:
            conn.close()

    def test_L3_fence_a_outcomewriter_can_still_go_autocommit(self, scraper, live_db):
        """FENCE A. `OutcomeWriter._connect()` (aic-scraper-nodriver.py:2140)
        calls the factory then assigns autocommit=True. A bare SET leaves the
        connection INTRANS, and psycopg2 raises ProgrammingError on that
        assignment — i.e. the naive fix takes the scrape-outcome ledger DOWN.

        The assignment MUST be the first operation on a fresh connection: the
        factory restores autocommit=False, so any prior query opens a txn and
        the assignment would then raise for an unrelated reason. THIS case
        therefore uses its own fresh connection, and so does L4."""
        conn = scraper.get_db_connection()
        try:
            conn.autocommit = True          # first op — must not raise
            cur = conn.cursor()
            cur.execute('SELECT 1')
            assert cur.fetchone()[0] == 1
            assert conn.get_transaction_status() == 0, 'autocommit not genuinely active'
        finally:
            conn.close()

    @BOTH
    def test_L4_configured_value_reaches_the_session(self, request, modname, live_db, monkeypatch):
        """Own connection (see L3). Asserts via pg_settings, NOT SHOW."""
        monkeypatch.setenv('PIPELINE_STATEMENT_TIMEOUT_MS', '300000')
        conn = _factory(request, modname)()
        try:
            cur = conn.cursor()
            cur.execute(TIMEOUT_SETTING)
            assert cur.fetchone()[0] == '300000'
            cur.execute('SHOW statement_timeout')
            assert cur.fetchone()[0] == '5min', 'SHOW normalises — this is why L4 uses pg_settings'
        finally:
            conn.close()

    def test_L5_setting_survives_rollback(self, scraper, live_db, monkeypatch):
        """FENCE A, part 2. A plain SET inside an implicit transaction REVERTS on
        rollback. Scraper-scoped: aic-scraper-nodriver.py rolls back at :2137,
        :2791, :3089, :3136. (The orchestrator has zero rollback sites, so FENCE A
        is uniformity/defence-in-depth there, not this.)"""
        monkeypatch.setenv('PGOPTIONS', HOSTILE)
        conn = scraper.get_db_connection()
        try:
            cur = conn.cursor()
            with pytest.raises(Exception):
                cur.execute('SELECT 1/0')
            conn.rollback()
            cur = conn.cursor()
            cur.execute(TIMEOUT_SETTING)
            assert cur.fetchone()[0] == '0', 'the SET did not survive rollback (naive impl reverts to 500)'
        finally:
            conn.close()

    @BOTH
    def test_L6_failed_set_surfaces_its_own_error_and_leaks_nothing(
            self, request, modname, live_db, monkeypatch):
        """FENCE B + the FENCE A x FENCE B collision.

        A try/except: close(); raise / finally: autocommit = prev shape closes the
        connection and THEN assigns autocommit on it, raising InterfaceError and
        MASKING the real error. Correct shape: restore on success, close on
        failure, no finally.

        ⚠ COVERAGE CAVEAT (output-panel mutation testing, 2026-08-19): the
        pgcode assertion below DOES lock the fence COLLISION (deleting the
        `finally` fix reds this case). The backend-count assertion does NOT lock
        the explicit `conn.close()` line — deleting it is caught by NOTHING in
        this suite, because CPython refcounting deallocates `conn` when the
        frame unwinds and psycopg2's finalizer closes the socket before the
        count is read. The explicit close is still correct (it must not depend
        on refcounting semantics), but this suite cannot prove that line."""
        psycopg2 = pytest.importorskip('psycopg2')
        monkeypatch.setenv('PIPELINE_STATEMENT_TIMEOUT_MS', OVER_MAX)
        factory = _factory(request, modname)

        with pytest.raises(psycopg2.Error) as exc:
            factory()
        assert exc.value.pgcode == '22023', (
            f'expected InvalidParameterValue/22023, got {type(exc.value).__name__} '
            f'pgcode={exc.value.pgcode} — an InterfaceError here means the fences collide '
            'and the real error was masked'
        )

        # No backend leak. DELTA scoped to this database — absolute counts are
        # unstable (the Supabase stack runs internal pollers).
        probe = psycopg2.connect(**live_db)
        try:
            cur = probe.cursor()
            cur.execute('SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()')
            before = cur.fetchone()[0]
            for _ in range(5):
                with pytest.raises(psycopg2.Error):
                    factory()
            cur.execute('SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()')
            after = cur.fetchone()[0]
            assert after <= before, f'backends grew {before} -> {after}: failed SET leaks connections'
        finally:
            probe.close()

    @BOTH
    def test_L8_empty_string_env_is_unset_end_to_end(self, request, modname, live_db, monkeypatch):
        """The GH-Actions empty-string class, live. `${{ vars.X }}` interpolates an
        undefined variable to '', which defeats a .get() default and makes int('')
        raise — the 86868387 first-cron crash. U2 covers the pure function; this
        covers the whole path."""
        monkeypatch.setenv('PGOPTIONS', HOSTILE)
        monkeypatch.setenv('PIPELINE_STATEMENT_TIMEOUT_MS', '')
        conn = _factory(request, modname)()
        try:
            cur = conn.cursor()
            cur.execute(TIMEOUT_SETTING)
            assert cur.fetchone()[0] == '0'
            cur.execute(SLEEP_OVER_BUDGET)   # must NOT raise
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# Tier B — unit. Parametrized over BOTH modules: the two factory bodies are
# byte-identical today, and nothing but these cases keeps them that way.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize('modname', ['orchestrator', 'scraper'])
class TestStatementTimeoutHelper:

    def test_U1_rejects_non_integer_and_negative(self, request, modname, monkeypatch):
        fn = _timeout_ms(request.getfixturevalue(modname))
        for bad in ('not-a-number', '-5'):
            monkeypatch.setenv('PIPELINE_STATEMENT_TIMEOUT_MS', bad)
            with pytest.raises(ValueError, match='PIPELINE_STATEMENT_TIMEOUT_MS'):
                fn()

    def test_U1b_returns_an_int(self, request, modname, monkeypatch):
        """The int() cast is the ONLY guard against Spec 47's no-string-concatenation
        rule, since the value is f-string-interpolated into SQL."""
        fn = _timeout_ms(request.getfixturevalue(modname))
        monkeypatch.setenv('PIPELINE_STATEMENT_TIMEOUT_MS', '300000')
        assert fn() == 300000
        assert isinstance(fn(), int)

    def test_U2_empty_string_is_unset_not_an_error(self, request, modname, monkeypatch):
        """Behavioural, not source-shape: aic-python.parse.smoke.test.ts bans the
        two-arg .get() form but CANNOT catch an `or ''` no-op ('' is falsy)."""
        fn = _timeout_ms(request.getfixturevalue(modname))
        monkeypatch.setenv('PIPELINE_STATEMENT_TIMEOUT_MS', '')
        assert fn() == 0

    def test_U2b_unset_defaults_to_zero(self, request, modname, monkeypatch):
        fn = _timeout_ms(request.getfixturevalue(modname))
        monkeypatch.delenv('PIPELINE_STATEMENT_TIMEOUT_MS', raising=False)
        assert fn() == 0

    def test_D1_default_does_not_drift_from_the_node_contract(self, request, modname, monkeypatch):
        """Spec 119 §4.6 tier-2 drift guard: a contract that is only DOCUMENTED is
        unverified. Parses the default out of the JS so the two languages cannot
        silently diverge."""
        import re
        fn = _timeout_ms(request.getfixturevalue(modname))
        src = open(os.path.join(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))), 'lib', 'pipeline.js'), encoding='utf-8').read()
        found = re.findall(r'raw\s*===\s*undefined\s*\?\s*(\d+)', src)
        assert found, ('could not locate the JS default in scripts/lib/pipeline.js — '
                       'this guard must fail loud, never pass vacuously')
        monkeypatch.delenv('PIPELINE_STATEMENT_TIMEOUT_MS', raising=False)
        assert fn() == int(found[0])

    def test_D2_the_empty_string_divergence_from_node_still_exists(self, request, modname):
        """DELIBERATE divergence, asserted so it cannot be 'tidied away'.

        pipeline.js:64 is `raw === undefined ? 0 : parseInt(raw, 10)` — so '' becomes
        NaN and Node THROWS. Python returns 0 instead (the 86868387 lesson). The JS
        (fa9e984c, 11:06) predates that lesson (86868387, 15:30 the SAME DAY) by
        ~4h and was never revisited, so mirroring it faithfully would import a bug.

        This is a SOURCE-SHAPE guard on the JS, not a restatement of U2: it reds when
        the JS gains empty-string handling, at which point the divergence is retired
        and this test should be deleted."""
        src = open(os.path.join(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))), 'lib', 'pipeline.js'), encoding='utf-8').read()
        assert "raw === undefined ? 0" in src, (
            'scripts/lib/pipeline.js no longer matches the known shape — re-check '
            'whether Node still throws on an empty string'
        )
        assert "raw === '' " not in src and 'raw === ""' not in src, (
            'pipeline.js now handles the empty string: the python/Node divergence is '
            'RETIRED. Delete this test and the "deliberately stricter" note in '
            '_statement_timeout_ms().'
        )
