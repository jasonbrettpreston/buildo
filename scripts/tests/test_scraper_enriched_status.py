"""Locks for enriched_status derivation under passed-only portal listings.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md

PORTAL CHANGE (operator-verified on the live site, 2026-07-30): the AIC
Inspection Status page lists ONLY stages already passed. Ground truth included
permits with Occupancy passed whose AIC status was still 'Inspection'
(21 217696 / 23 183037 / 17 172425), so an all-passed stage list must NEVER
derive a completion claim — lifecycle completion truth is the feed's own
permits.status ('Pending Closed' etc.), operator-ruled 2026-07-30.
"""


class TestComputeEnrichedStatus:
    def test_all_passed_is_active_inspection_never_completion(self, scraper):
        """The old rule (all Passed -> 'Inspections Complete') marked every
        permit that ever passed ONE stage as complete once the portal stopped
        listing unpassed stages. Probe #8 wrote exactly that wrong value."""
        stages = [{'status': 'Passed'}, {'status': 'Passed'}]
        assert scraper.compute_enriched_status(stages) == 'Active Inspection'

    def test_inspections_complete_is_never_derivable_from_stages(self, scraper):
        for stages in (
            [{'status': 'Passed'}],
            [{'status': 'Passed'}] * 6,
            [{'status': 'pass'}, {'status': 'passed'}],
        ):
            assert scraper.compute_enriched_status(stages) != 'Inspections Complete'

    def test_not_passed_still_wins(self, scraper):
        stages = [{'status': 'Passed'}, {'status': 'Not Passed'}]
        assert scraper.compute_enriched_status(stages) == 'Not Passed'

    def test_all_outstanding_still_permit_issued(self, scraper):
        # Cannot occur under passed-only listings, but retained for robustness
        # should the portal revert to full stage lists.
        stages = [{'status': 'Outstanding'}, {'status': 'Outstanding'}]
        assert scraper.compute_enriched_status(stages) == 'Permit Issued'

    def test_mixed_is_active_inspection(self, scraper):
        stages = [{'status': 'Passed'}, {'status': 'Outstanding'}]
        assert scraper.compute_enriched_status(stages) == 'Active Inspection'

    def test_empty_and_unrecognized_return_none(self, scraper):
        assert scraper.compute_enriched_status([]) is None
        assert scraper.compute_enriched_status([{'status': 'Bogus Value'}]) is None
