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


class TestTimeBudget:
    """P7 soft self-stop (2026-08-03) — a time-bounded drain slice must
    FINALIZE, not be killed. Stage-2 drain run 30854595411: healthy (zero
    blocks, batch 173) yet hard-killed by the GH step timeout mid-scrape ->
    orphaned pipeline_runs rows + stuck claimed queue rows + red verdict
    EVERY slice. With SCRAPER_TIME_BUDGET_MINUTES set, the claim loop stops
    claiming at the budget, in-flight work finishes, and the NORMAL
    finalization path runs (summary + ledger + queue release + exit 0)."""

    def test_disabled_budget_never_stops(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'TIME_BUDGET_MINUTES', 0)
        # An hour elapsed, budget disabled -> keep claiming.
        assert scraper.time_budget_exceeded(time.time() * 1000 - 60 * 60000) is False

    def test_budget_not_reached_keeps_claiming(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'TIME_BUDGET_MINUTES', 140)
        assert scraper.time_budget_exceeded(time.time() * 1000 - 5 * 60000) is False

    def test_budget_exceeded_stops_claiming(self, scraper, monkeypatch):
        monkeypatch.setattr(scraper, 'TIME_BUDGET_MINUTES', 2)
        assert scraper.time_budget_exceeded(time.time() * 1000 - 3 * 60000) is True

    def test_telemetry_records_the_stop_flag(self, scraper):
        assert scraper.make_telemetry()['time_budget_stop'] is False

    def test_both_claim_loops_check_the_budget_at_the_top(self, scraper):
        import pathlib
        src = pathlib.Path(scraper.__file__).read_text(encoding='utf-8')
        # HTTP db-queue/standalone loop + browser db-queue loop — both must
        # consult the budget before claiming another batch.
        assert src.count('if time_budget_exceeded(start_ms)') >= 2

    def test_time_budget_row_emits_every_run_and_its_value_flips(self, scraper, monkeypatch):
        # Spec 48 §3.6 zero-row preservation: the row must exist on EVERY run
        # (value 0) so "budget never fired" is distinguishable from "budget
        # plumbing silently unwired" — only-when-fired would erase that line.
        monkeypatch.setattr(scraper, 'TIME_BUDGET_MINUTES', 140)
        tel = scraper.make_telemetry()
        tel['permits_attempted'] = 5
        tel['time_budget_stop'] = True
        rows = scraper.compute_summary(tel, time.time() * 1000)['records_meta']['audit_table']['rows']
        row = next(r for r in rows if r['metric'] == 'time_budget_stop')
        assert row['status'] == 'INFO'
        assert row['value'] == 1
        assert 'min budget' in str(row['threshold'])  # elapsed vs budget, observable
        # Not fired -> row STILL present, value 0.
        tel2 = scraper.make_telemetry()
        tel2['permits_attempted'] = 5
        rows2 = scraper.compute_summary(tel2, time.time() * 1000)['records_meta']['audit_table']['rows']
        row2 = next(r for r in rows2 if r['metric'] == 'time_budget_stop')
        assert row2['status'] == 'INFO'
        assert row2['value'] == 0

    def test_budget_stop_is_not_a_failure(self, scraper, monkeypatch):
        # The run must land completed/completed_with_warnings, never FAIL,
        # purely because the budget stopped it.
        monkeypatch.setattr(scraper, 'TIME_BUDGET_MINUTES', 140)
        monkeypatch.setattr(scraper, 'MAX_PERMITS', 0)
        tel = scraper.make_telemetry()
        tel['permits_attempted'] = 100
        tel['permits_found'] = 95
        tel['time_budget_stop'] = True
        summary = scraper.compute_summary(tel, time.time() * 1000)
        assert summary['records_meta']['audit_table']['verdict'] == 'PASS'

    def test_orchestrator_parity_env_and_aggregation(self, orchestrator):
        # The orchestrator parses the same env (or-default form) and ORs the
        # stop flag across workers so the aggregate audit row can fire.
        assert hasattr(orchestrator, 'TIME_BUDGET_MINUTES')
        agg = orchestrator.aggregate_telemetry([
            {'permits_attempted': 10, 'time_budget_stop': False},
            {'permits_attempted': 12, 'time_budget_stop': True},
        ])
        assert agg['time_budget_stop'] is True
        agg_none = orchestrator.aggregate_telemetry([{'permits_attempted': 10}])
        assert agg_none['time_budget_stop'] is False


class _QueueCursor:
    """Fake cursor for populate_queue: scripted rowcounts + pending count."""

    def __init__(self, rowcounts, pending=0):
        self.executed = []
        self._rowcounts = list(rowcounts)
        self.rowcount = 0
        self._pending = pending

    def execute(self, sql, params=None):
        self.executed.append((' '.join(sql.split()), params))
        self.rowcount = self._rowcounts.pop(0) if self._rowcounts else 0

    def fetchone(self):
        return (self._pending,)

    def close(self):
        pass


class _QueueConn:
    def __init__(self, cur):
        self._cur = cur

    def cursor(self):
        return self._cur

    def commit(self):
        pass


class TestStaleClaimReclaim:
    """F2 (2026-08-04, Integration-corrected scope) — REGRESSION LOCK, not a
    new mechanism. The startup reclaim already exists (populate_queue: first
    statement, every orchestrator run) and was never missing: the 9 rows
    stranded after SIGKILLed run 30854595411 stayed stuck only because no
    subsequent run occurred before ops released them. These locks pin the
    behavior so it cannot silently regress; they are green-on-arrival by
    design (the red-first protocol applies to the F1 seams, not to a lock on
    verified pre-existing behavior)."""

    def test_startup_reclaims_stale_claims_with_the_ttl_predicate(self, orchestrator):
        cur = _QueueCursor(rowcounts=[9, 120], pending=120)
        # Spec 79 C4 (panel fold 2026-08-04): the reclaim count is RETURNED so
        # main() can emit the stale_claims_reclaimed audit row — a log line
        # alone is not observability.
        queued, pending, stale = orchestrator.populate_queue(_QueueConn(cur))
        assert queued == 120
        assert pending == 120
        assert stale == 9
        # The reclaim must be the FIRST statement of every startup.
        reclaim_sql, reclaim_params = cur.executed[0]
        assert "UPDATE scraper_queue" in reclaim_sql
        assert "SET status = 'pending'" in reclaim_sql
        # Stale claims only: status='claimed' AND older than the TTL — a
        # fresh claim (young claimed_at) never matches the predicate, which
        # is the whole "fresh claim untouched" guarantee.
        assert "status = 'claimed'" in reclaim_sql
        assert "claimed_at < NOW() - INTERVAL '1 minute' *" in reclaim_sql
        assert reclaim_params == (orchestrator.STALE_CLAIM_MINUTES,)

    def test_ttl_is_startup_scoped_and_safe_for_150_min_slices(self, orchestrator):
        # Safe vs a live slice's legitimate claims BY CONSTRUCTION, not by TTL
        # size: the reclaim runs only at startup, BEFORE any worker spawns, so
        # no reclaim can ever run concurrently with this run's claims — and
        # the concurrency group + check-chain-running guard prevent a second
        # orchestrator. A healthy worker may hold a claim as long as it likes;
        # nothing reclaims mid-run. 30 min therefore only ever matches claims
        # stranded by a PREVIOUS killed run (cron slots are 3h apart).
        assert orchestrator.STALE_CLAIM_MINUTES == 30

    def test_reclaim_count_reaches_the_audit_table(self, orchestrator):
        # Spec 79 C4: emitted EVERY run (0 when nothing was reclaimed) so a
        # self-heal is DB-visible and "never fired" is distinguishable from
        # "row plumbing silently unwired" (Spec 48 §3.6).
        import pathlib
        src = pathlib.Path(orchestrator.__file__).read_text(encoding='utf-8')
        assert "'metric': 'stale_claims_reclaimed'" in src


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
