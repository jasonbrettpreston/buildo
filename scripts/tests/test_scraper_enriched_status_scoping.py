"""C2 / D2a — enriched_status is scoped by the row's OWN status, not by revision.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3

THE DEFECT (live, measured 2026-08-12): the portal answers per permit_num, but
`permits` is keyed (permit_num, revision_num). Every enriched_status UPDATE in the
scraper wrote on `permit_num` alone, smearing one scraped answer across every
revision row — overwriting each non-Inspection row's own CKAN status
("Revision Issued" -> P8) and putting it outside the allowed set.

THE RULE — `status = 'Inspection'`, NOT a "canonical row":
  enriched_status is a PER-ROW REFINEMENT of that row's own `status`. Every
  consumer is row-grained (lifecycle-phase.js derives phase per row; all three
  cross-checks in assert-lifecycle-phase-distribution.js count ROWS). A
  canonical-row rule cannot satisfy a row-grained invariant — it only moves WHICH
  row is wrong. Scoping to the row's own status makes the writer use the same
  predicate as the queue that selected it (aic-orchestrator.py:175).

  Measured on cloud, of 4,183 rows carrying enriched_status: 2,833 have
  status='Inspection' (kept), 1,350 do not (dropped) — and those 1,350 ARE the
  smear. Administrative fee stubs drop out for free: 0 of 21,827 Inspection rows
  in the write population are class='administrative'.

THE TWO GRAINS — the whole point of this file:
  * `enriched_status` -> ONLY rows whose own `status` is 'Inspection'.
  * `last_scraped_at` -> EVERY ROW, unscoped by anything. aic-orchestrator.py:181
    evaluates the 7-day cooldown PER ROW before `DISTINCT year_seq`; scoping it
    (by revision OR by status) would leave non-Inspection rows permanently
    "never scraped", so the queue would re-buy the same year_seqs forever. R4 is
    a NEGATIVE ruling and nothing pinned it before this file.

REJECTED ALTERNATIVE, pinned here so it cannot come back: `MIN(revision_num)`.
It picks a non-Inspection row 6,205 times, including 'DCs DeferredFees'
administrative stubs, and for the 53 permits whose base row is Closed/Pending
Cancellation it would resurrect a closed permit as "under active inspection".

STATED CEILING: a fake cursor sees the SQL TEXT. It proves which predicate is
present, not that the predicate selects the right rows in Postgres. The empirical
proof for that is C3's --confirm dry-run row count against live data.

Run: npm run test:py  (or: pytest scripts/tests/test_scraper_enriched_status_scoping.py)
"""

import asyncio

import pytest


class RecordingCursor:
    def __init__(self, conn):
        self._conn = conn
        self.rowcount = 1

    def execute(self, sql, params=None):
        self._conn.executed.append((' '.join(sql.split()), params))

    def fetchone(self):
        return None

    def fetchall(self):
        return []

    def close(self):
        pass


class RecordingConn:
    def __init__(self):
        self.executed = []
        self.committed = 0

    def cursor(self):
        return RecordingCursor(self)

    def commit(self):
        self.committed += 1

    def rollback(self):
        pass


def _chain(result):
    return {
        'properties': [{'propertyRsn': 1}],
        'folders': [{'folderSection': 'BLD', 'folderYear': '24',
                     'folderSequence': '100000', 'folderRsn': 1,
                     'statusDesc': 'Inspection'}],
        'results': [result],
    }


# Reaches the "stages scraped" write path.
SCRAPED_CHAIN = _chain({'permit_num': '24 100000 BLD',
                        'stages': [{'desc': 'Footings/Foundations',
                                    'status': 'Passed', 'date': 'Jun 11, 2025'}]})
# Reaches the no-inspection-link path (writes 'Permit Issued').
NO_LINK_CHAIN = _chain({'permit_num': '24 100000 BLD', 'error': 'no_status_link'})
# PANEL FINDING #4 (Code Reviewer): the no_stages path was exercised by NEITHER
# fixture. It writes last_scraped_at only; dropping or scoping that write would
# strand every permit whose portal answer is "no stage passed yet" — and the
# whole suite would still have passed. Now covered.
NO_STAGES_CHAIN = _chain({'permit_num': '24 100000 BLD', 'error': 'no_stages'})

ALL_PATHS = [
    (SCRAPED_CHAIN, 'stages-scraped path'),
    (NO_LINK_CHAIN, 'no-inspection-link path'),
    (NO_STAGES_CHAIN, 'no-stages path'),
]


def run_year_seq(scraper, monkeypatch, chain_result):
    async def fake_chain(page, year, sequence):
        return chain_result

    monkeypatch.setattr(scraper, 'fetch_permit_chain', fake_chain)
    conn = RecordingConn()
    tel = scraper.make_telemetry()
    asyncio.run(scraper.scrape_year_sequence(None, '24 100000', conn, tel=tel))
    return conn


def enriched_writes(conn):
    return [(sql, params) for sql, params in conn.executed
            if 'UPDATE permits' in sql and 'enriched_status =' in sql]


def touch_writes(conn):
    return [(sql, params) for sql, params in conn.executed
            if 'UPDATE permits' in sql and 'last_scraped_at = NOW()' in sql]


@pytest.mark.parametrize('chain,label', ALL_PATHS[:2])
class TestEnrichedStatusIsStatusScoped:
    def test_enriched_status_write_is_status_scoped(self, scraper, monkeypatch, chain, label):
        conn = run_year_seq(scraper, monkeypatch, chain)
        writes = enriched_writes(conn)
        assert writes, f'no enriched_status UPDATE captured on the {label}'
        for sql, params in writes:
            assert "status = 'Inspection'" in sql, (
                f'enriched_status UPDATE on the {label} is NOT scoped to the row\'s own '
                f'status — it smears the scraped answer across every revision row.\n'
                f'SQL: {sql}\nPARAMS: {params}'
            )

    def test_enriched_status_write_does_not_scope_by_revision(self, scraper, monkeypatch, chain, label):
        """Pins the REJECTED alternative so it cannot return.

        MIN(revision_num) picks a non-Inspection row 6,205 times and would
        resurrect Closed permits as "under active inspection". A literal '00' has
        its own hole. Neither belongs in an enriched_status predicate.
        """
        conn = run_year_seq(scraper, monkeypatch, chain)
        for sql, _ in enriched_writes(conn):
            assert 'revision_num' not in sql, (
                f'enriched_status UPDATE on the {label} scopes by revision. The rule is '
                f'the row\'s own status, not a canonical row.\nSQL: {sql}'
            )
            assert 'MIN(' not in sql.upper(), f'MIN(revision_num) is the rejected rule.\nSQL: {sql}'


@pytest.mark.parametrize('chain,label', ALL_PATHS)
class TestLastScrapedAtStaysRowWide:
    def test_at_least_one_last_scraped_at_touch_is_unscoped(self, scraper, monkeypatch, chain, label):
        """NEGATIVE LOCK — R4. Green before AND after.

        PANEL FINDING #1 (Gemini CRITICAL / DeepSeek HIGH / Code Reviewer, 3
        independent hits): the previous shape SKIPPED any write that also carried
        `enriched_status =`, which meant a future refactor re-merging the two
        writes into one scoped statement would pass while stamping last_scraped_at
        on only some rows — the exact R4 violation this lock exists to catch.
        Asserting "at least one touch is unscoped" cannot be defeated that way.
        """
        conn = run_year_seq(scraper, monkeypatch, chain)
        touches = touch_writes(conn)
        assert touches, f'no last_scraped_at UPDATE captured on the {label}'
        unscoped = [sql for sql, _ in touches
                    if 'revision_num' not in sql and "status = 'Inspection'" not in sql]
        assert unscoped, (
            f'EVERY last_scraped_at touch on the {label} is scoped. This strands '
            f'non-Inspection rows as never-scraped and makes the orchestrator queue '
            f're-buy the same year_seq forever (R4).\nTouches: {touches}'
        )

    def test_every_permit_grain_write_targets_permit_num(self, scraper, monkeypatch, chain, label):
        conn = run_year_seq(scraper, monkeypatch, chain)
        for sql, _ in enriched_writes(conn) + touch_writes(conn):
            assert 'permit_num = %s' in sql, f'unexpected write shape: {sql}'
