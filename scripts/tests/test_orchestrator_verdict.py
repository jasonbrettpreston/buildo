"""Regression locks for orchestrator telemetry aggregation — the false-PASS seam.

SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

The orchestrator exits 0 even when every worker fails to scrape, so the chain
verdict — not the exit code — is what makes a total wipeout visible (commit
de3ff6dd, after GH run 30485096998 reported a 0-permit run as green against a
10,981-pending queue). `preflight_failures` is the row that carries that fact
from a worker up to the verdict cascade; these tests pin it in python.

`src/tests/inspections.logic.test.ts` mirrors this logic in TypeScript for the
admin surface. That mirror is a dual code path (Engineering Standards §7): it
can agree with itself while drifting from this python source of truth, which is
exactly why the contract is now pinned on both sides.
"""


def worker(**overrides):
    """A worker telemetry dict with a successful-scrape baseline."""
    base = {
        'permits_attempted': 10, 'permits_found': 8, 'permits_scraped': 8,
        'not_found_count': 2, 'proxy_errors': 0, 'session_bootstraps': 1,
        'session_failures': 0, 'total_upserted': 8, 'status_changes': 1,
        'enriched_updates': 8, 'workers_completed': 1, 'consecutive_empty_max': 0,
        'preflight_passed': True, 'latencies': [100, 200],
    }
    base.update(overrides)
    return base


class TestPreflightFailureCounting:
    def test_healthy_workers_report_no_preflight_failures(self, orchestrator):
        agg = orchestrator.aggregate_telemetry([worker(), worker()])

        assert agg['preflight_failures'] == 0
        assert agg['workers_total'] == 2
        assert agg['permits_attempted'] == 20

    def test_bootstrap_failure_is_counted(self, orchestrator):
        """A worker that never got a browser must not read as a healthy zero."""
        agg = orchestrator.aggregate_telemetry([
            worker(),
            worker(preflight_passed=False, permits_attempted=0, permits_scraped=0),
        ])

        assert agg['preflight_failures'] == 1
        assert agg['workers_total'] == 2

    def test_total_wipeout_is_visible(self, orchestrator):
        """The run 30485096998 shape: every worker down, zero permits attempted.

        preflight_failures == workers_total is what the verdict cascade reddens
        on; if this ever reports 0 again, a total wipeout goes out green.
        """
        agg = orchestrator.aggregate_telemetry([
            worker(preflight_passed=False, permits_attempted=0, permits_found=0,
                   permits_scraped=0, enriched_updates=0, total_upserted=0),
        ])

        assert agg['preflight_failures'] == agg['workers_total'] == 1
        assert agg['permits_attempted'] == 0

    def test_absent_preflight_key_is_treated_as_passed(self, orchestrator):
        """Older worker payloads omit the key — absence must not count as failure."""
        payload = worker()
        del payload['preflight_passed']

        assert orchestrator.aggregate_telemetry([payload])['preflight_failures'] == 0

    def test_no_workers_yields_zeroed_aggregate(self, orchestrator):
        agg = orchestrator.aggregate_telemetry([])

        assert agg['workers_total'] == 0
        assert agg['preflight_failures'] == 0
        assert agg['permits_attempted'] == 0


class TestAggregationArithmetic:
    def test_counters_sum_across_workers(self, orchestrator):
        agg = orchestrator.aggregate_telemetry([
            worker(permits_scraped=3, not_found_count=1, proxy_errors=2, enriched_updates=3),
            worker(permits_scraped=5, not_found_count=4, proxy_errors=1, enriched_updates=5),
        ])

        assert agg['permits_scraped'] == 8
        assert agg['not_found_count'] == 5
        assert agg['proxy_errors'] == 3
        assert agg['enriched_updates'] == 8

    def test_consecutive_empty_is_a_max_not_a_sum(self, orchestrator):
        """A WAF-trap signal: one worker hitting the threshold must not be diluted."""
        agg = orchestrator.aggregate_telemetry([
            worker(consecutive_empty_max=20),
            worker(consecutive_empty_max=1),
        ])

        assert agg['consecutive_empty_max'] == 20

    def test_latencies_are_pooled_for_percentiles(self, orchestrator):
        agg = orchestrator.aggregate_telemetry([
            worker(latencies=[10, 20]),
            worker(latencies=[30]),
        ])

        assert sorted(agg['latencies']) == [10, 20, 30]

    def test_missing_counters_default_to_zero(self, orchestrator):
        """A partial payload (crashed mid-report) must aggregate, not KeyError."""
        agg = orchestrator.aggregate_telemetry([{'permits_attempted': 5}])

        assert agg['permits_attempted'] == 5
        assert agg['permits_scraped'] == 0
        assert agg['workers_completed'] == 0
