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
