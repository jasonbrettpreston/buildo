"""Locks for the empty-outcome taxonomy (WF3 2026-07-30, operator-authorized).

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

The portal lists only PASSED stages, so "permit yielded no stages" is a normal
honest answer (~half of in-flight permits), not a miss. Runs 30574728762 and
30576202397 FAILed their gate at 41.7%/50% by lumping it in, and 3 consecutive
benign empties could trip a pointless WAF rotation (G4). The taxonomy:
anomalous = address_not_found / no_target_folders (our own feed said the
permit exists); benign = no_stages / no_inspection_link.
"""

import asyncio
import time
from types import SimpleNamespace


def fresh_tel(scraper):
    return scraper.make_telemetry()


class TestAccumulateResult:
    def test_no_stages_counts_but_never_trips_the_waf_trap(self, scraper):
        tel = fresh_tel(scraper)
        for _ in range(10):
            scraper.accumulate_result(tel, {'searched': 1, 'scraped': 0, 'outcome': 'no_stages'})
        assert tel['not_found_count'] == 10
        assert tel['not_found_breakdown'] == {'no_stages': 10}
        assert tel['consecutive_empty'] == 0
        assert tel['consecutive_empty_max'] == 0

    def test_anomalous_misses_still_feed_the_trap(self, scraper):
        tel = fresh_tel(scraper)
        for outcome in ('address_not_found', 'no_target_folders', 'address_not_found'):
            scraper.accumulate_result(tel, {'searched': 1, 'scraped': 0, 'outcome': outcome})
        assert tel['consecutive_empty'] == 3
        assert scraper.anomalous_miss_count(tel) == 3

    def test_missing_outcome_defaults_to_anomalous(self, scraper):
        # Fail-safe: an untagged empty result must count as anomalous, never
        # be silently excused as benign.
        tel = fresh_tel(scraper)
        scraper.accumulate_result(tel, {'searched': 1, 'scraped': 0})
        assert tel['not_found_breakdown'] == {'address_not_found': 1}
        assert tel['consecutive_empty'] == 1

    def test_scrape_resets_consecutive_empty(self, scraper):
        tel = fresh_tel(scraper)
        scraper.accumulate_result(tel, {'searched': 1, 'scraped': 0, 'outcome': 'address_not_found'})
        scraper.accumulate_result(tel, {'searched': 1, 'scraped': 2, 'outcome': 'scraped'})
        assert tel['consecutive_empty'] == 0
        assert tel['permits_found'] == 1

    def test_retry_exhausted_still_forces_rotation(self, scraper):
        tel = fresh_tel(scraper)
        scraper.accumulate_result(tel, {'searched': 0, 'scraped': 0, 'retry_exhausted': True})
        assert tel['proxy_errors'] == 1
        assert tel['consecutive_empty'] >= scraper.WAF_TRAP_THRESHOLD


class TestMissRateGate:
    """P6 (Pipeline Rehab 2026-08-03) — small-n statistics for the <20% gate.

    n=3 probe dispatches vs `anomalous_miss_rate < 20%`: at the ASSUMED 10%
    anomalous baseline (pre-ledger assumption — re-measure from the outcome
    ledger after P7), the binomial false-FAIL probability is 27.1% at n=3 vs
    7.3% at n=30. FAIL is therefore only statistically meaningful at
    permits_attempted >= 30; below that the gate WARNs — EXCEPT the wipeout
    class (the false-PASS de3ff6dd closed; softening must NOT reopen it),
    which stays FAIL at any n: early-abort fired, uncapped production run,
    or a wipeout-shaped absolute anomalous count.
    """

    def test_small_n_capped_probe_miss_is_warn_not_fail(self, scraper):
        status, rate, _ = scraper.classify_miss_rate(1, 3, early_abort=False, capped=True)
        assert status == 'WARN'
        assert round(rate, 1) == 33.3

    def test_parity_orchestrator_carries_the_same_gate(self, orchestrator):
        status, _, _ = orchestrator.classify_miss_rate(1, 3, early_abort=False, capped=True)
        assert status == 'WARN'
        assert orchestrator.classify_miss_rate(7, 30, early_abort=False, capped=True)[0] == 'FAIL'

    def test_n30_over_threshold_fails(self, scraper):
        status, rate, _ = scraper.classify_miss_rate(7, 30, early_abort=False, capped=True)
        assert status == 'FAIL'
        assert round(rate, 1) == 23.3

    def test_under_threshold_passes_at_any_n(self, scraper):
        assert scraper.classify_miss_rate(0, 3, early_abort=False, capped=True)[0] == 'PASS'
        assert scraper.classify_miss_rate(2, 30, early_abort=False, capped=True)[0] == 'PASS'

    def test_early_abort_keeps_small_n_fail(self, scraper):
        # The 90%-anomalous early abort is a sustained wipeout — small n is
        # BECAUSE the run was aborted, never probe noise.
        assert scraper.classify_miss_rate(5, 5, early_abort=True, capped=True)[0] == 'FAIL'

    def test_uncapped_production_run_keeps_small_n_fail(self, scraper):
        # Production-shaped (no cap): a full run that only attempted a few
        # permits and missed them is a wipeout, not a probe.
        assert scraper.classify_miss_rate(2, 5, early_abort=False, capped=False)[0] == 'FAIL'

    def test_wipeout_shaped_absolute_count_keeps_fail_even_under_a_cap(self, scraper):
        assert scraper.classify_miss_rate(10, 25, early_abort=False, capped=True)[0] == 'FAIL'

    def test_threshold_string_self_documents_the_regime(self, scraper):
        _, _, threshold = scraper.classify_miss_rate(1, 3, early_abort=False, capped=True)
        assert '20%' in threshold
        assert 'n >= 30' in threshold
        assert 'WARN' in threshold

    def test_telemetry_records_early_abort_flag(self, scraper):
        tel = scraper.make_telemetry()
        assert tel['early_abort'] is False

    def test_compute_summary_wires_the_gate_warn_not_fail_on_small_probe(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'MAX_PERMITS', 3)
        tel = scraper.make_telemetry()
        scraper.accumulate_result(tel, {'searched': 1, 'scraped': 0, 'outcome': 'address_not_found'})
        scraper.accumulate_result(tel, {'searched': 1, 'scraped': 2, 'outcome': 'scraped'})
        scraper.accumulate_result(tel, {'searched': 1, 'scraped': 2, 'outcome': 'scraped'})
        summary = scraper.compute_summary(tel, time.time() * 1000)
        rows = summary['records_meta']['audit_table']['rows']
        row = next(r for r in rows if r['metric'] == 'anomalous_miss_rate')
        assert row['status'] == 'WARN'
        assert 'n >= 30' in row['threshold']
        # Row-derived cascade: the accepted small-n miss lands the run at
        # WARN, never FAIL — and never silently PASS.
        assert summary['records_meta']['audit_table']['verdict'] == 'WARN'


class FakeCursor:
    def __init__(self):
        self.executed = []
        self.rowcount = 1

    def execute(self, sql, params=None):
        self.executed.append((' '.join(sql.split()), params))

    def fetchone(self):
        return None

    def close(self):
        pass


class FakeConn:
    def __init__(self):
        self.cur = FakeCursor()

    def cursor(self):
        return self.cur

    def commit(self):
        pass

    def rollback(self):
        pass


class TestScrapeYearSequenceOutcomes:
    def _run(self, scraper, monkeypatch, chain_result):
        async def fake_chain(page, year, sequence):
            return chain_result
        monkeypatch.setattr(scraper, 'fetch_permit_chain', fake_chain)
        conn = FakeConn()
        result = asyncio.run(scraper.scrape_year_sequence(None, '24 100000', conn))
        return result, conn

    def test_address_not_found_outcome(self, scraper, monkeypatch):
        result, _ = self._run(scraper, monkeypatch, {'properties': [], 'results': []})
        assert result['outcome'] == 'address_not_found'

    def test_no_stages_outcome_stamps_last_scraped_at(self, scraper, monkeypatch):
        chain = {
            'properties': [{'propertyRsn': 1}],
            'folders': [{'folderSection': 'BLD', 'folderYear': '24',
                         'folderSequence': '100000', 'folderRsn': 1, 'statusDesc': 'Inspection'}],
            'results': [{'permit_num': '24 100000 BLD', 'error': 'no_stages'}],
        }
        result, conn = self._run(scraper, monkeypatch, chain)
        assert result['outcome'] == 'no_stages'
        stamps = [sql for sql, _ in conn.cur.executed
                  if 'last_scraped_at = NOW()' in sql and 'permits' in sql]
        assert stamps, 'no_stages must stamp last_scraped_at — the DB must remember the portal answered'

    def test_scraped_outcome_wins_over_sibling_errors(self, scraper, monkeypatch):
        chain = {
            'properties': [{'propertyRsn': 1}],
            'folders': [{'folderSection': 'BLD', 'folderYear': '24',
                         'folderSequence': '100000', 'folderRsn': 1, 'statusDesc': 'Inspection'}],
            'results': [
                {'permit_num': '24 100000 BLD', 'error': 'no_processes'},
                {'permit_num': '24 100000 BLD',
                 'stages': [{'desc': 'Footings/Foundations', 'status': 'Passed', 'date': 'Jun 11, 2025'}]},
            ],
        }
        result, _ = self._run(scraper, monkeypatch, chain)
        assert result['outcome'] == 'scraped'
        assert result['scraped'] == 1
