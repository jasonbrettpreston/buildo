"""Locks for per-permit scrape-outcome persistence + classification threading.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

WF2 2026-07-31 (.cursor/wf2_scrape_outcome_persistence_v2.md). Two defect
classes reproduced by the v1 panel are locked here, failing-first:

1. THE COLLAPSE (v3 structural fold): the transport_error/waf_blocked
   distinction existed only inside HttpTransport.call — every chain-level
   failure site returned a bare {'waf_blocked': True}, so a DNS timeout was
   persisted-as-fact as a portal block. The chain-result-layer lock below is
   the lock 5dc577f2 never got: a transport_error kind must NOT surface as
   waf_blocked.

2. THE v1 DATA-LOSS DEFECT: the outcome write shared the scrape's connection
   and transaction, so a failed bookkeeping INSERT silently rolled back real
   stage upserts while telemetry reported them committed. The writer here is
   a dedicated autocommit connection (D2 ruling) that can never raise into
   the scrape path; a write failure is swallowed-and-counted
   (tel['outcome_write_failures']) and the writer RECOVERS on the next
   insert.
"""

import asyncio
import json
import os

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class FakeResponse:
    def __init__(self, body='', status=200):
        self.status_code = status
        self.text = body
        self.content = body.encode()


class FlakySession:
    """Serves canned responses; raises (a transport error) when exhausted."""

    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append({'method': method, 'url': url, **kwargs})
        if not self.responses:
            raise OSError('connection reset by proxy')
        return self.responses.pop(0)

    def close(self):
        pass


def make_transport(scraper, responses=None):
    transport = scraper.HttpTransport.__new__(scraper.HttpTransport)
    transport.impersonate = 'chrome'
    transport.relay_url = None
    transport.session = FlakySession(responses)
    transport.bytes_down = 0
    transport.requests = 0
    return transport


class StampCursor:
    def __init__(self, conn):
        self._conn = conn
        self.rowcount = 1

    def execute(self, sql, params=None):
        self._conn.executed.append((' '.join(sql.split()), params))
        self._conn.timeline.append('stamp_execute')

    def fetchone(self):
        return None

    def close(self):
        pass


class StampConn:
    """The scrape path's own connection (stage upserts + stamping)."""

    def __init__(self, timeline=None):
        self.executed = []
        self.committed = 0
        self.rolled_back = 0
        self.timeline = timeline if timeline is not None else []

    def cursor(self):
        return StampCursor(self)

    def commit(self):
        self.committed += 1
        self.timeline.append('commit')

    def rollback(self):
        self.rolled_back += 1


class LedgerCursor:
    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=None):
        if self._conn.fail_next:
            self._conn.fail_next = False
            raise RuntimeError('outcome ledger connection is down')
        self._conn.executed.append((' '.join(sql.split()), params))
        self._conn.timeline.append('ledger_execute')

    def fetchall(self):
        return list(self._conn.rows)

    def close(self):
        pass


class LedgerConn:
    """The writer's DEDICATED connection (D2)."""

    def __init__(self, timeline=None):
        self.executed = []
        self.rows = []
        self.autocommit = False
        self.closed = False
        self.fail_next = False
        self.timeline = timeline if timeline is not None else []

    def cursor(self):
        return LedgerCursor(self)

    def close(self):
        self.closed = True


@pytest.fixture
def ledger(monkeypatch, scraper):
    """Route the writer's lazy connections to fresh LedgerConn fakes."""
    conns = []

    def fake_connect():
        conn = LedgerConn()
        conns.append(conn)
        return conn

    monkeypatch.setattr(scraper, 'get_db_connection', fake_connect)
    return conns


def ledger_rows(conns):
    """(permit_num, year_seq, outcome, detail) tuples across all connections."""
    rows = []
    for conn in conns:
        for sql, params in conn.executed:
            if 'INSERT INTO permit_scrape_outcomes' in sql:
                rows.append(params[:4])
    return rows


# ---------------------------------------------------------------------------
# Classification threading — the mapping itself
# ---------------------------------------------------------------------------
class TestClassifyChainFailure:
    def test_transport_error_stays_transport_error(self, scraper):
        assert scraper.classify_chain_failure('transport_error')[0] == 'transport_error'

    def test_browser_fetch_error_is_transport_error_with_detail(self, scraper):
        kind, detail = scraper.classify_chain_failure('fetch_error:AbortError')
        assert kind == 'transport_error'
        assert detail == 'fetch_error:AbortError'

    def test_waf_blocked_stays_waf_blocked(self, scraper):
        assert scraper.classify_chain_failure('waf_blocked') == ('waf_blocked', None)

    def test_unparseable_maps_to_waf_blocked(self, scraper):
        """The Akamai hollow/HTML signature is unparseable's known cause."""
        kind, detail = scraper.classify_chain_failure('unparseable')
        assert kind == 'waf_blocked'
        assert detail == 'unparseable'

    @pytest.mark.parametrize('token', ['html_or_empty', 'json_decode_error',
                                       'non_string_result:dict'])
    def test_browser_parse_errors_map_to_waf_blocked(self, scraper, token):
        kind, detail = scraper.classify_chain_failure(token)
        assert kind == 'waf_blocked'
        assert detail == token


# ---------------------------------------------------------------------------
# Classification threading — HTTP chain sites
# ---------------------------------------------------------------------------
class TestHttpChainThreading:
    def _run(self, scraper, responses):
        t = make_transport(scraper, responses)
        return asyncio.run(scraper.fetch_permit_chain_http(t, '24', '100000'))

    def test_step1_transport_error_is_not_a_waf_block(self, scraper):
        result = self._run(scraper, [])  # session raises immediately
        assert result['failure_kind'] == 'transport_error'
        assert not result.get('waf_blocked')

    def test_step1_403_still_reads_as_waf_blocked(self, scraper):
        result = self._run(scraper, [FakeResponse('Access Denied', status=403)])
        assert result['failure_kind'] == 'waf_blocked'
        assert result['waf_blocked'] is True

    def test_step2_transport_error_is_preserved(self, scraper):
        result = self._run(scraper, [FakeResponse('[{"propertyRsn": 1}]')])
        assert result['failure_kind'] == 'transport_error'

    def test_step3_transport_error_is_preserved(self, scraper):
        result = self._run(scraper, [
            FakeResponse('[{"propertyRsn": 1}]'),
            FakeResponse('[{"folderSection": "BLD", "folderYear": "24",'
                         ' "folderSequence": "100000", "folderRsn": 9}]'),
        ])
        assert result['failure_kind'] == 'transport_error'

    def test_step4_transport_error_is_preserved(self, scraper):
        result = self._run(scraper, [
            FakeResponse('[{"propertyRsn": 1}]'),
            FakeResponse('[{"folderSection": "BLD", "folderYear": "24",'
                         ' "folderSequence": "100000", "folderRsn": 9}]'),
            FakeResponse('{"inspectionProcesses": [{"processRsn": 3}], "showStatus": true}'),
        ])
        assert result['failure_kind'] == 'transport_error'

    def test_unparseable_body_maps_to_waf_blocked_with_detail(self, scraper):
        result = self._run(scraper, [FakeResponse('this is not json')])
        assert result['failure_kind'] == 'waf_blocked'
        assert result['detail'] == 'unparseable'


# ---------------------------------------------------------------------------
# Classification threading — browser chain sites
# ---------------------------------------------------------------------------
class TestBrowserChainThreading:
    def _run(self, scraper, monkeypatch, body):
        async def fake_eval(page, js, label=''):
            return body

        monkeypatch.setattr(scraper, 'evaluate_fetch', fake_eval)
        return asyncio.run(scraper.fetch_permit_chain(None, '24', '100000'))

    def test_fetch_error_sentinel_is_transport_error_with_detail(self, scraper, monkeypatch):
        body = json.dumps({'error': 'AbortError', 'message': 'timed out', 'at': ''})
        result = self._run(scraper, monkeypatch, body)
        assert result['failure_kind'] == 'transport_error'
        assert result['detail'] == 'fetch_error:AbortError'
        assert not result.get('waf_blocked')

    def test_html_body_is_waf_blocked(self, scraper, monkeypatch):
        result = self._run(scraper, monkeypatch, '<html>Access Denied</html>')
        assert result['failure_kind'] == 'waf_blocked'
        assert result['detail'] == 'html_or_empty'

    def test_non_string_result_is_waf_blocked(self, scraper, monkeypatch):
        result = self._run(scraper, monkeypatch, 12345)
        assert result['failure_kind'] == 'waf_blocked'
        assert result['detail'] == 'non_string_result:int'

    def test_garbage_json_is_waf_blocked(self, scraper, monkeypatch):
        result = self._run(scraper, monkeypatch, '{{{nope')
        assert result['failure_kind'] == 'waf_blocked'
        assert result['detail'] == 'json_decode_error'


# ---------------------------------------------------------------------------
# The chain-result-layer lock 5dc577f2 never got
# ---------------------------------------------------------------------------
class TestChainResultLayerClassification:
    def _raise_kind(self, scraper, monkeypatch, chain_result):
        async def fake_chain(page, year, sequence):
            return chain_result

        monkeypatch.setattr(scraper, 'fetch_permit_chain', fake_chain)
        with pytest.raises(scraper.ChainFailure) as excinfo:
            asyncio.run(scraper.scrape_year_sequence(None, '24 100000', StampConn()))
        return excinfo.value

    def test_transport_error_must_not_surface_as_waf_blocked(self, scraper, monkeypatch):
        err = self._raise_kind(scraper, monkeypatch, {
            'failure_kind': 'transport_error', 'detail': 'fetch_error:AbortError',
            'properties': [], 'results': [],
        })
        assert err.failure_kind == 'transport_error'
        assert err.failure_kind != 'waf_blocked'
        assert err.detail == 'fetch_error:AbortError'

    def test_waf_blocked_kind_survives(self, scraper, monkeypatch):
        err = self._raise_kind(scraper, monkeypatch, {
            'failure_kind': 'waf_blocked', 'waf_blocked': True,
            'properties': [], 'results': [],
        })
        assert err.failure_kind == 'waf_blocked'

    def test_legacy_bare_waf_blocked_dict_still_raises_waf_blocked(self, scraper, monkeypatch):
        """Back-compat guard: a chain result carrying only the legacy key must
        keep raising, classified as waf_blocked."""
        err = self._raise_kind(scraper, monkeypatch, {
            'waf_blocked': True, 'properties': [], 'results': [],
        })
        assert err.failure_kind == 'waf_blocked'


# ---------------------------------------------------------------------------
# scrape_with_retry — kind preserved, retry_exhausted explicit
# ---------------------------------------------------------------------------
class TestScrapeWithRetry:
    def _exhaust(self, scraper, monkeypatch, exc_factory, ledger_conns):
        async def failing(page, year_seq, conn, tel=None, outcomes=None):
            raise exc_factory()

        monkeypatch.setattr(scraper, 'scrape_year_sequence', failing)
        monkeypatch.setattr(scraper, 'RETRY_BASE_MS', 0)
        tel = scraper.make_telemetry()
        writer = scraper.OutcomeWriter(transport='http', run_id='run-1')
        result = asyncio.run(scraper.scrape_with_retry(
            None, '24 100000', StampConn(), tel=tel, outcomes=writer))
        return result, tel

    def test_returns_outcome_retry_exhausted_explicitly(self, scraper, monkeypatch, ledger):
        result, _ = self._exhaust(
            scraper, monkeypatch,
            lambda: scraper.ChainFailure('24 100000', 'waf_blocked'), ledger)
        assert result['retry_exhausted'] is True
        assert result['outcome'] == 'retry_exhausted'

    def test_transport_error_attempts_persist_as_themselves(self, scraper, monkeypatch, ledger):
        """The whole point of the threading: a proxy blip must never be
        recorded as a durable waf_blocked fact."""
        self._exhaust(
            scraper, monkeypatch,
            lambda: scraper.ChainFailure('24 100000', 'transport_error',
                                         'fetch_error:AbortError'), ledger)
        outcomes = [row[2] for row in ledger_rows(ledger)]
        assert 'transport_error' in outcomes
        assert 'retry_exhausted' in outcomes
        assert 'waf_blocked' not in outcomes

    def test_waf_attempts_persist_as_waf_blocked(self, scraper, monkeypatch, ledger):
        self._exhaust(
            scraper, monkeypatch,
            lambda: scraper.ChainFailure('24 100000', 'waf_blocked'), ledger)
        outcomes = [row[2] for row in ledger_rows(ledger)]
        assert outcomes.count('waf_blocked') == scraper.MAX_RETRIES
        assert outcomes.count('retry_exhausted') == 1

    def test_non_chain_exception_is_not_classified_as_a_portal_outcome(self, scraper, monkeypatch, ledger):
        """A DB error is neither a WAF block nor a transport error — the
        5dc577f2 laundering, from the other direction. Only the terminal
        retry_exhausted row is written, carrying the exception class."""
        self._exhaust(scraper, monkeypatch, lambda: RuntimeError('db exploded'), ledger)
        rows = ledger_rows(ledger)
        outcomes = [row[2] for row in rows]
        assert outcomes == ['retry_exhausted']
        assert rows[0][3] == 'RuntimeError'


class TestAccumulateRetryExhausted:
    def test_retry_exhausted_lands_in_breakdown_under_its_own_name(self, scraper):
        """F6c: the telemetry used to file this as address_not_found while the
        DB said otherwise — the same event must carry one name."""
        tel = scraper.make_telemetry()
        scraper.accumulate_result(tel, {
            'searched': 1, 'scraped': 0, 'upserted': 0,
            'retry_exhausted': True, 'outcome': 'retry_exhausted',
        })
        assert tel['not_found_breakdown'] == {'retry_exhausted': 1}
        assert tel['proxy_errors'] == 1

    def test_waf_trap_forcing_is_additive_to_the_elif_chain(self, scraper):
        """Mutation-style: the :2651-2654 forcing is a SEPARATE top-level if.
        Folding it into the elif chain yields THRESHOLD or 1 — not both."""
        tel = scraper.make_telemetry()
        scraper.accumulate_result(tel, {
            'searched': 1, 'scraped': 0, 'upserted': 0,
            'retry_exhausted': True, 'outcome': 'retry_exhausted',
        })
        assert tel['consecutive_empty'] == scraper.WAF_TRAP_THRESHOLD + 1


# ---------------------------------------------------------------------------
# The writer — dedicated connection, swallow-and-count, recovery
# ---------------------------------------------------------------------------
class TestOutcomeWriter:
    def test_insert_carries_the_full_row(self, scraper, ledger, monkeypatch):
        monkeypatch.delenv('SCRAPER_RUN_ID', raising=False)
        writer = scraper.OutcomeWriter(transport='http', run_id='gh-123')
        tel = scraper.make_telemetry()
        assert writer.record(tel, 'no_stages', permit_num='24 100000 BLD',
                             year_seq='24 100000') is True
        sql, params = ledger[0].executed[0]
        assert 'INSERT INTO permit_scrape_outcomes' in sql
        assert params == ('24 100000 BLD', '24 100000', 'no_stages', None, 'http', 'gh-123')

    def test_connection_is_autocommit_and_lazy(self, scraper, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        assert ledger == []  # lazy: nothing opened until first insert
        writer.record(scraper.make_telemetry(), 'scraped', permit_num='x')
        assert ledger[0].autocommit is True

    def test_run_id_defaults_to_scraper_run_id_env(self, scraper, monkeypatch):
        monkeypatch.setenv('SCRAPER_RUN_ID', 'exported-by-orchestrator')
        writer = scraper.OutcomeWriter(transport='http')
        assert writer.run_id == 'exported-by-orchestrator'

    def test_standalone_runs_stamp_their_own_run_id(self, scraper, monkeypatch):
        monkeypatch.delenv('SCRAPER_RUN_ID', raising=False)
        monkeypatch.delenv('GITHUB_RUN_ID', raising=False)
        writer = scraper.OutcomeWriter(transport='http')
        assert writer.run_id

    def test_write_failure_never_raises_and_is_counted(self, scraper, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        writer.record(tel, 'scraped', permit_num='a')  # opens conn 1
        ledger[0].fail_next = True
        assert writer.record(tel, 'scraped', permit_num='b') is False
        assert tel['outcome_write_failures'] == 1

    def test_failed_connection_is_closed_and_writer_recovers_on_next_insert(self, scraper, ledger):
        """D2 ruling: close + lazily reopen with bounded backoff — the writer
        must recover, not die for the worker's life."""
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        writer.record(tel, 'scraped', permit_num='a')
        ledger[0].fail_next = True
        writer.record(tel, 'scraped', permit_num='b')
        assert ledger[0].closed is True
        assert writer.record(tel, 'scraped', permit_num='c') is True
        assert len(ledger) == 2
        assert tel['outcome_write_failures'] == 1

    def test_close_at_teardown(self, scraper, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        writer.record(scraper.make_telemetry(), 'scraped', permit_num='a')
        writer.close()
        assert ledger[0].closed is True

    def test_rejects_a_row_with_no_subject(self, scraper, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        assert writer.record(tel, 'scraped') is False
        assert tel['outcome_write_failures'] == 1


# ---------------------------------------------------------------------------
# C9 — batch resolution (year_seq -> DISTINCT permit_nums)
# ---------------------------------------------------------------------------
class TestBatchResolution:
    def test_resolution_query_uses_distinct(self, scraper, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        conn = LedgerConn()
        conn.rows = [('24 100000', '24 100000 BLD')]
        writer.resolve_batch(conn, ['24 100000'])
        sql = conn.executed[0][0]
        assert 'DISTINCT' in sql
        assert 'permit_scrape_outcomes' not in sql

    def test_multi_permit_resolution_writes_one_row_each(self, scraper, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        conn = LedgerConn()
        conn.rows = [('24 100000', '24 100000 BLD'), ('24 100000', '24 100000 BLD 01')]
        writer.resolve_batch(conn, ['24 100000'])
        tel = scraper.make_telemetry()
        writer.record_for_year_seq(tel, 'waf_blocked', '24 100000')
        rows = ledger_rows(ledger)
        assert [(r[0], r[2]) for r in rows] == [
            ('24 100000 BLD', 'waf_blocked'),
            ('24 100000 BLD 01', 'waf_blocked'),
        ]

    def test_duplicate_revision_rows_are_deduped(self, scraper, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        conn = LedgerConn()
        conn.rows = [('24 100000', '24 100000 BLD'), ('24 100000', '24 100000 BLD')]
        writer.resolve_batch(conn, ['24 100000'])
        tel = scraper.make_telemetry()
        writer.record_for_year_seq(tel, 'waf_blocked', '24 100000')
        assert len(ledger_rows(ledger)) == 1

    def test_zero_resolution_still_writes_the_row_with_year_seq(self, scraper, ledger):
        """DeepSeek HIGH: the anomalous outcome the feature exists for must
        never vanish — permit_num NULL, year_seq raw, counter incremented."""
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        conn = LedgerConn()
        writer.resolve_batch(conn, ['24 999999'])
        tel = scraper.make_telemetry()
        writer.record_for_year_seq(tel, 'address_not_found', '24 999999')
        rows = ledger_rows(ledger)
        assert rows == [(None, '24 999999', 'address_not_found', None)]
        assert tel['outcome_resolution_failures'] == 1


# ---------------------------------------------------------------------------
# detail sanitizer — allowlist + hard cap
# ---------------------------------------------------------------------------
class TestDetailSanitizer:
    def test_allowlisted_classifier_strings_pass(self, scraper):
        for token in ('fetch_error:AbortError', 'unparseable', 'html_or_empty',
                      'json_decode_error', 'non_string_result:dict'):
            assert scraper.sanitize_outcome_detail(token) == token

    def test_hard_500_char_cap(self, scraper):
        long = 'fetch_error:' + 'A' * 600
        assert len(scraper.sanitize_outcome_detail(long)) == 500

    def test_exception_reduces_to_class_name(self, scraper):
        detail = scraper.sanitize_outcome_detail(
            RuntimeError('postgresql://user:hunter2@host/db exploded'))
        assert detail == 'RuntimeError'

    def test_unknown_free_text_never_leaks_credentials(self, scraper):
        detail = scraper.sanitize_outcome_detail(
            'tunnel to http://user:hunter2@proxy:8080 failed') or ''
        assert 'hunter2' not in detail

    def test_none_is_none(self, scraper):
        assert scraper.sanitize_outcome_detail(None) is None


# ---------------------------------------------------------------------------
# scrape_year_sequence — outcome rows + no-stamp rules + v1 reproduction
# ---------------------------------------------------------------------------
def run_year_seq(scraper, monkeypatch, chain_result, writer, tel, timeline=None):
    async def fake_chain(page, year, sequence):
        return chain_result

    monkeypatch.setattr(scraper, 'fetch_permit_chain', fake_chain)
    conn = StampConn(timeline=timeline)
    result = asyncio.run(scraper.scrape_year_sequence(
        None, '24 100000', conn, tel=tel, outcomes=writer))
    return result, conn


SCRAPED_CHAIN = {
    'properties': [{'propertyRsn': 1}],
    'folders': [{'folderSection': 'BLD', 'folderYear': '24',
                 'folderSequence': '100000', 'folderRsn': 1, 'statusDesc': 'Inspection'}],
    'results': [{'permit_num': '24 100000 BLD',
                 'stages': [{'desc': 'Footings/Foundations', 'status': 'Passed',
                             'date': 'Jun 11, 2025'}]}],
}


class TestScrapeYearSequencePersistence:
    def test_address_not_found_writes_a_row_and_does_not_stamp(self, scraper, monkeypatch, ledger):
        """Gemini fold: a permit deleted from source must stay visible to
        staleness monitoring — outcome row yes, last_scraped_at no."""
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        result, conn = run_year_seq(
            scraper, monkeypatch, {'properties': [], 'results': []}, writer, tel)
        assert result['outcome'] == 'address_not_found'
        assert [r[2] for r in ledger_rows(ledger)] == ['address_not_found']
        stamped = [sql for sql, _ in conn.executed if 'last_scraped_at' in sql]
        assert stamped == []

    def test_no_target_folders_writes_a_row(self, scraper, monkeypatch, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        chain = {'properties': [{'propertyRsn': 1}],
                 'folders': [{'folderSection': 'PLB'}], 'results': []}
        result, _ = run_year_seq(scraper, monkeypatch, chain, writer, tel)
        assert result['outcome'] == 'no_target_folders'
        assert [r[2] for r in ledger_rows(ledger)] == ['no_target_folders']

    def test_chain_failure_raises_before_any_stamp(self, scraper, monkeypatch, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        with pytest.raises(scraper.ChainFailure):
            run_year_seq(scraper, monkeypatch,
                         {'failure_kind': 'waf_blocked', 'waf_blocked': True,
                          'properties': [], 'results': []}, writer, tel)
        assert ledger_rows(ledger) == []  # attempt rows belong to the retry wrapper

    def test_scraped_writes_row_and_still_stamps(self, scraper, monkeypatch, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        result, conn = run_year_seq(scraper, monkeypatch, SCRAPED_CHAIN, writer, tel)
        assert result['outcome'] == 'scraped'
        rows = ledger_rows(ledger)
        assert rows == [('24 100000 BLD', '24 100000', 'scraped', None)]
        stamped = [sql for sql, _ in conn.executed
                   if 'last_scraped_at' in sql and 'permits' in sql]
        assert stamped, 'C3: the existing stamping behavior must be untouched'

    def test_outcome_rows_are_written_after_the_stage_commit(self, scraper, monkeypatch, ledger):
        """v1 CRITICAL reproduction inverted: the ledger write happens on its
        own connection AFTER the scrape transaction commits, so it can never
        report rows the commit later rolled back."""
        timeline = []

        def timeline_connect():
            conn = LedgerConn(timeline=timeline)
            ledger.append(conn)
            return conn

        monkeypatch.setattr(scraper, 'get_db_connection', timeline_connect)
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        result, conn = run_year_seq(scraper, monkeypatch, SCRAPED_CHAIN, writer, tel,
                                    timeline=timeline)
        assert 'commit' in timeline
        ledger_writes = [i for i, e in enumerate(timeline) if e == 'ledger_execute']
        assert ledger_writes, 'expected an outcome-ledger write'
        assert min(ledger_writes) > timeline.index('commit')

    def test_dead_ledger_cannot_fail_the_scrape(self, scraper, monkeypatch, ledger):
        """The v1 defect, locked from the survivor's side: stage writes commit
        and the result reports scraped even when every outcome write dies."""
        writer = scraper.OutcomeWriter(transport='http', run_id='r')

        def always_fail():
            raise RuntimeError('no route to ledger')

        monkeypatch.setattr(scraper, 'get_db_connection', always_fail)
        tel = scraper.make_telemetry()
        result, conn = run_year_seq(scraper, monkeypatch, SCRAPED_CHAIN, writer, tel)
        assert result['outcome'] == 'scraped'
        assert conn.committed == 1
        assert conn.rolled_back == 0
        assert tel['outcome_write_failures'] >= 1

    def test_no_inspection_link_and_no_stages_write_rows(self, scraper, monkeypatch, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        chain = {
            'properties': [{'propertyRsn': 1}],
            'folders': [{'folderSection': 'BLD', 'folderYear': '24',
                         'folderSequence': '100000', 'folderRsn': 1,
                         'statusDesc': 'Inspection'}],
            'results': [
                {'permit_num': '24 100000 BLD', 'error': 'no_status_link'},
                {'permit_num': '24 100001 BLD', 'error': 'no_stages'},
            ],
        }
        run_year_seq(scraper, monkeypatch, chain, writer, tel)
        rows = {(r[0], r[2]) for r in ledger_rows(ledger)}
        assert rows == {('24 100000 BLD', 'no_inspection_link'),
                        ('24 100001 BLD', 'no_stages')}

    def test_both_transports_produce_identical_rows_per_terminal_branch(self, scraper, monkeypatch, ledger):
        writer = scraper.OutcomeWriter(transport='http', run_id='r')
        tel = scraper.make_telemetry()
        _, _ = run_year_seq(scraper, monkeypatch, SCRAPED_CHAIN, writer, tel)
        browser_rows = ledger_rows(ledger)

        async def fake_http_chain(transport, year, sequence):
            return SCRAPED_CHAIN

        monkeypatch.setattr(scraper, 'fetch_permit_chain_http', fake_http_chain)
        http_ctx = make_transport(scraper)
        asyncio.run(scraper.scrape_year_sequence(
            http_ctx, '24 100000', StampConn(), tel=tel, outcomes=writer))
        all_rows = ledger_rows(ledger)
        assert all_rows[len(browser_rows):] == browser_rows


# ---------------------------------------------------------------------------
# Vocabulary — triple agreement (contracts.json <-> frozenset; CHECK is pinned
# by src/tests/contracts.infra.test.ts and the live-DB test)
# ---------------------------------------------------------------------------
class TestVocabulary:
    def test_frozenset_matches_the_contract(self, scraper):
        contracts_path = os.path.join(REPO_ROOT, 'docs', 'specs', '_contracts.json')
        with open(contracts_path, 'r') as fh:
            contracts = json.load(fh)
        contract_values = contracts['schema']['scrape_outcomes']
        assert len(contract_values) == 8
        assert set(contract_values) == set(scraper.OUTCOME_VOCABULARY)

    def test_every_writer_outcome_is_in_the_vocabulary(self, scraper):
        for outcome in ('scraped', 'no_stages', 'no_inspection_link',
                        'no_target_folders', 'address_not_found', 'waf_blocked',
                        'transport_error', 'retry_exhausted'):
            assert outcome in scraper.OUTCOME_VOCABULARY


# ---------------------------------------------------------------------------
# Orchestrator — counters aggregate, audit row guarded (C7)
# ---------------------------------------------------------------------------
class TestOrchestratorOutcomeCounters:
    def test_counters_sum_across_workers(self, orchestrator):
        agg = orchestrator.aggregate_telemetry([
            {'permits_attempted': 5, 'outcome_write_failures': 2,
             'outcome_resolution_failures': 1},
            {'permits_attempted': 5, 'outcome_write_failures': 3},
        ])
        assert agg['outcome_write_failures'] == 5
        assert agg['outcome_resolution_failures'] == 1

    def test_zero_failures_is_pass(self, orchestrator):
        row = orchestrator.outcome_write_audit_row(10, 0)
        assert row['status'] == 'PASS'

    def test_partial_failures_warn(self, orchestrator):
        assert orchestrator.outcome_write_audit_row(10, 1)['status'] == 'WARN'

    def test_total_outage_fails(self, orchestrator):
        """3-reviewer convergence: every expected outcome row missing means the
        feature is silently dead — that must redden the run."""
        assert orchestrator.outcome_write_audit_row(10, 10)['status'] == 'FAIL'
        assert orchestrator.outcome_write_audit_row(10, 12)['status'] == 'FAIL'

    def test_zero_attempted_is_its_own_non_fail_case(self, orchestrator):
        """Same-denominator rule with a zero guard: 0 attempted cannot FAIL
        this row (the zero_attempted_with_pending_queue gate owns that case)."""
        assert orchestrator.outcome_write_audit_row(0, 0)['status'] == 'PASS'
        assert orchestrator.outcome_write_audit_row(0, 3)['status'] == 'WARN'
