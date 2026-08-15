"""WF3 F6 (2026-08-15, Spec 118 §7.6) — early_abort connection-hygiene audit.

The SUSPICION (uncommitted transactions / lingering backends on the abort
path) was REFUTED by code reading: every write site commits/rolls back on its
own connection, `complete_batch_in_queue` and `claim_batch_from_queue` each
own a `finally: cur.close()`, and the outer claim loop's `conn.close()` sits
in its own `finally`. Two REAL, adjacent defects were found instead:

  (a) `run_http_mode`'s db-queue claim loop never checked `tel['early_abort']`
      after a batch — an early_abort inside `http_scrape_loop` broke that
      batch's inner loop cleanly (no exception) and the outer `while True:`
      just claimed ANOTHER batch under the same broken session.
  (b) `complete_batch_in_queue`'s unconditional 'completed' UPDATE marked
      EVERY claimed year_seq done on the success path — including whichever
      ones an early_abort break never reached at all (the C2-era filed
      defect, now line-confirmed).

FakeConn/FakeCursor mirror the precedent in test_scraper_outcomes.py.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md
SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §7.6
"""
import asyncio

import pytest


async def _instant_sleep(*_args, **_kwargs):
    """Replaces the module's `await asyncio.sleep(random.uniform(1.0, 3.5))`
    inter-request pacing so these tests run in milliseconds. Must NOT itself
    call the real asyncio.sleep — patching `scraper.asyncio.sleep` in place
    means a naive `lambda: asyncio.sleep(0)` recurses into itself forever."""
    return None


class FakeCursor:
    def __init__(self):
        self.executed = []
        self.rowcount = 1

    def execute(self, sql, params=None):
        self.executed.append((' '.join(sql.split()), params))

    def fetchone(self):
        return None

    def fetchall(self):
        return []

    def close(self):
        pass


class FakeConn:
    def __init__(self):
        self.cur = FakeCursor()
        self.closed = False

    def cursor(self):
        return self.cur

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        self.closed = True


# ---------------------------------------------------------------------------
# (b) complete_batch_in_queue — untouched year_seqs are released, not
#     marked completed.
# ---------------------------------------------------------------------------
class TestCompleteBatchInQueueUntouched:
    def test_untouched_year_seqs_are_released_to_pending_not_marked_completed(self, scraper):
        conn = FakeConn()
        year_seqs = ['24 1', '24 2', '24 3', '24 4', '24 5']
        # (b) THE red-first assertion pre-fix: complete_batch_in_queue had no
        # `untouched` parameter at all — this call would raise TypeError on
        # the unpatched signature.
        scraper.complete_batch_in_queue(conn, year_seqs, 'w1', untouched={'24 4', '24 5'})

        completed_calls = [c for c in conn.cur.executed if "status = 'completed'" in c[0]]
        pending_calls = [c for c in conn.cur.executed if "status = 'pending'" in c[0]]
        assert len(completed_calls) == 1
        assert len(pending_calls) == 1

        completed_params = completed_calls[0][1][0]
        pending_params = pending_calls[0][1][0]
        assert sorted(completed_params) == ['24 1', '24 2', '24 3']
        assert sorted(pending_params) == ['24 4', '24 5']
        # The untouched release clears the claim so a FUTURE batch can pick
        # it back up — not merely re-labels it while leaving claimed_by set.
        assert 'claimed_at = NULL' in pending_calls[0][0]
        assert 'claimed_by = NULL' in pending_calls[0][0]
        # And it is scoped to rows STILL 'claimed' by this worker — never a
        # blind UPDATE that could clobber a row another worker has since
        # claimed after a (theoretical) race.
        assert "status = 'claimed'" in pending_calls[0][0]

    def test_untouched_defaults_to_empty_set_full_batch_still_marks_completed(self, scraper):
        # Backward-compat: every pre-existing call site (no untouched= arg)
        # must behave byte-identically to before this fold.
        conn = FakeConn()
        year_seqs = ['24 1', '24 2']
        scraper.complete_batch_in_queue(conn, year_seqs, 'w1')

        completed_calls = [c for c in conn.cur.executed if "status = 'completed'" in c[0]]
        pending_calls = [c for c in conn.cur.executed if "status = 'pending'" in c[0]]
        assert len(completed_calls) == 1
        assert len(pending_calls) == 0
        assert sorted(completed_calls[0][1][0]) == ['24 1', '24 2']

    def test_failed_and_untouched_are_mutually_exclusive_from_completed(self, scraper):
        conn = FakeConn()
        year_seqs = ['24 1', '24 2', '24 3']
        scraper.complete_batch_in_queue(
            conn, year_seqs, 'w1', failed={'24 1'}, untouched={'24 3'})

        completed_calls = [c for c in conn.cur.executed if "status = 'completed'" in c[0]]
        failed_calls = [c for c in conn.cur.executed if "status = 'failed'" in c[0]]
        pending_calls = [c for c in conn.cur.executed if "status = 'pending'" in c[0]]
        assert sorted(completed_calls[0][1][0]) == ['24 2']
        assert len(failed_calls) == 1
        assert sorted(pending_calls[0][1][0]) == ['24 3']


# ---------------------------------------------------------------------------
# http_scrape_loop returns (transport, attempted) — attempted is the actually
# genuinely-processed prefix, strictly shorter than year_seqs on early_abort.
# ---------------------------------------------------------------------------
class TestHttpScrapeLoopAttemptedTracking:
    def _anomalous_result(self):
        return {
            'searched': 1, 'scraped': 0, 'upserted': 0, 'enriched_updates': 0,
            'no_inspection_row': 0, 'status_changes': 0, 'outcome': 'address_not_found',
        }

    def _found_result(self):
        return {
            'searched': 1, 'scraped': 1, 'upserted': 1, 'enriched_updates': 0,
            'no_inspection_row': 0, 'status_changes': 0, 'outcome': 'scraped',
        }

    def test_clean_full_pass_returns_all_year_seqs_attempted(self, scraper, monkeypatch):
        async def fake_scrape_with_retry(transport, year_seq, conn, tel=None, outcomes=None):
            return self._found_result()
        monkeypatch.setattr(scraper, 'scrape_with_retry', fake_scrape_with_retry)
        monkeypatch.setattr(scraper.asyncio, 'sleep', _instant_sleep)

        tel = scraper.make_telemetry()
        year_seqs = [f'24 {i}' for i in range(5)]
        conn = FakeConn()
        transport, attempted = asyncio.run(
            scraper.http_scrape_loop(object(), year_seqs, conn, tel, 0))

        assert attempted == year_seqs
        assert tel['early_abort'] is False

    def test_early_abort_returns_a_STRICT_PREFIX_not_the_full_batch(self, scraper, monkeypatch):
        # 10 anomalous misses in a row trips the >=90%-of->=10 early_abort gate
        # at i=9 (the 10th item) — 5 more year_seqs never get touched at all.
        async def fake_scrape_with_retry(transport, year_seq, conn, tel=None, outcomes=None):
            return self._anomalous_result()
        monkeypatch.setattr(scraper, 'scrape_with_retry', fake_scrape_with_retry)
        monkeypatch.setattr(scraper.asyncio, 'sleep', _instant_sleep)

        tel = scraper.make_telemetry()
        year_seqs = [f'24 {i}' for i in range(15)]
        conn = FakeConn()
        transport, attempted = asyncio.run(
            scraper.http_scrape_loop(object(), year_seqs, conn, tel, 0))

        # THE red-first assertion pre-fix: http_scrape_loop returned only
        # `transport` (a bare value, not a tuple) — unpacking into
        # `(transport, attempted)` would raise TypeError on the unpatched code.
        assert tel['early_abort'] is True
        assert len(attempted) == 10
        assert attempted == year_seqs[:10]
        assert attempted != year_seqs  # the strict-prefix claim, not just a length check
        never_touched = set(year_seqs) - set(attempted)
        assert never_touched == set(year_seqs[10:])


# ---------------------------------------------------------------------------
# (a) the outer db-queue claim loop stops claiming once early_abort fires.
# ---------------------------------------------------------------------------
class TestOuterClaimLoopStopsOnEarlyAbort:
    def test_early_abort_batch_is_the_LAST_claim_no_further_batches(self, scraper, monkeypatch):
        claim_calls = []
        complete_calls = []

        SAFETY_CAP = 5  # bails the fixture out rather than hanging pytest if a
        # regression makes the outer loop claim forever — the test still REDS
        # (len(claim_calls) will be SAFETY_CAP, not 1), it just does so in
        # milliseconds instead of never returning.

        def fake_claim_batch_from_queue(conn, worker_id, batch_size):
            claim_calls.append(batch_size)
            if len(claim_calls) >= SAFETY_CAP:
                return []
            # A batch is ALWAYS available (until the safety cap) — if the
            # outer loop does not stop itself on early_abort, this fixture
            # would happily hand out a second and third batch and the test
            # would see > 1 claim call.
            return [f'24 {len(claim_calls)}-{i}' for i in range(5)]

        async def fake_http_scrape_loop(transport, year_seqs, conn, tel, start_ms, worker_tag,
                                         outcomes=None):
            # Simulates http_scrape_loop's own early_abort break: only the
            # first 2 of 5 year_seqs were genuinely attempted.
            tel['early_abort'] = True
            return transport, year_seqs[:2]

        def fake_complete_batch_in_queue(conn, year_seqs, worker_id, failed=None, untouched=None):
            complete_calls.append({
                'year_seqs': list(year_seqs),
                'untouched': set(untouched or set()),
            })

        monkeypatch.setattr(scraper, 'claim_batch_from_queue', fake_claim_batch_from_queue)
        monkeypatch.setattr(scraper, 'http_scrape_loop', fake_http_scrape_loop)
        monkeypatch.setattr(scraper, 'complete_batch_in_queue', fake_complete_batch_in_queue)
        monkeypatch.setattr(scraper, 'get_db_connection', lambda: FakeConn())
        monkeypatch.setattr(scraper, 'time_budget_exceeded', lambda start_ms: False)
        monkeypatch.setattr(scraper, 'proxy_enabled', lambda: False)
        monkeypatch.setattr(scraper, 'MAX_PERMITS', 0)

        tel = scraper.make_telemetry()
        args = {'mode': 'db-queue', 'worker_id': None, 'batch_file': None, 'single_permit': None}
        asyncio.run(scraper.run_http_mode(args, object(), tel, 0, '[scraper]'))

        # THE red-first assertion pre-fix: the outer loop never checked
        # tel['early_abort'] after a batch, so the fixture's always-available
        # fake_claim_batch_from_queue would have been called a second time.
        assert len(claim_calls) == 1, (
            f'expected the claim loop to STOP after the early_abort batch, '
            f'but claim_batch_from_queue was called {len(claim_calls)} times'
        )
        # The one batch that DID run must still release its untouched tail.
        assert len(complete_calls) == 1
        assert complete_calls[0]['untouched'] == {'24 1-2', '24 1-3', '24 1-4'}
