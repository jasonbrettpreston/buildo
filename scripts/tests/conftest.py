"""Shared pytest fixtures for the pipeline python harness.

SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md
SPEC LINK: docs/specs/00-architecture/115_scheduling.md

The scraper and orchestrator filenames contain hyphens, so they cannot be
imported with a normal `import` statement — these fixtures load them by path.
Both modules guard execution behind `if __name__ == '__main__'`, so importing
them runs only module-level constant/env setup (no DB connection, no browser).
"""

import importlib.util
import os
import sys

import pytest

SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_module_by_path(module_name, filename):
    """Import a hyphenated script by path, skipping if its deps are absent."""
    path = os.path.join(SCRIPTS_DIR, filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except ImportError as err:
        # nodriver / psycopg2 are runtime deps of the chain, not of every dev
        # box. Skip loudly with the missing dep rather than failing opaquely.
        pytest.skip(f'{filename} import needs a runtime dep that is absent: {err}',
                    allow_module_level=True)
    return module


@pytest.fixture(scope='session')
def scraper():
    """The nodriver AIC scraper module."""
    return _load_module_by_path('aic_scraper_nodriver', 'aic-scraper-nodriver.py')


@pytest.fixture(scope='session')
def orchestrator():
    """The multi-worker orchestrator module."""
    return _load_module_by_path('aic_orchestrator', 'aic-orchestrator.py')


@pytest.fixture
def captured_logs(monkeypatch, scraper):
    """Capture the scraper's structured JSON log lines as dicts.

    The scraper logs by printing JSON to stdout (its transport to run-chain.js),
    so assertions about observability read the parsed entries here.
    """
    import json

    entries = []

    def fake_print(payload, *args, **kwargs):
        try:
            entries.append(json.loads(payload))
        except (TypeError, ValueError):
            entries.append({'raw': payload})

    monkeypatch.setattr('builtins.print', fake_print)
    return entries


@pytest.fixture
def reload_scraper(monkeypatch):
    """Re-import the scraper so module-level env parsing runs under a given env.

    Several constants (batch size, retry/WAF tuning, the launch ceiling) are read
    at import time, so the only honest way to test their env handling is a fresh
    import with the environment already in place.
    """
    def _reload(**env):
        for key, value in env.items():
            if value is None:
                monkeypatch.delenv(key, raising=False)
            else:
                monkeypatch.setenv(key, value)
        # Neutralize the repo .env so a developer's local file cannot change results.
        monkeypatch.setattr('pathlib.Path.exists', lambda self: False)

        path = os.path.join(SCRIPTS_DIR, 'aic-scraper-nodriver.py')
        spec = importlib.util.spec_from_file_location('aic_scraper_reload', path)
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except ImportError as err:
            pytest.skip(f'scraper import needs an absent runtime dep: {err}')
        finally:
            sys.modules.pop('aic_scraper_reload', None)
        return module

    return _reload


@pytest.fixture
def live_db(orchestrator):
    """Real-DB tier (Spec 119 §2 "Live-DB smoke"). Returns a psycopg2 DSN dict.

    FUNCTION-scoped deliberately: a session-scoped fixture cannot request
    `monkeypatch` (pytest raises ScopeMismatch), and every live case here
    monkeypatches PGOPTIONS / PIPELINE_STATEMENT_TIMEOUT_MS.

    Resolves its DSN EXACTLY as get_db_connection() does — by depending on the
    module fixture, whose import performs the `.env` load — rather than probing
    an instance of its own choosing. WF3 P0 fold-validation (2026-08-19) found
    `.env` carrying a DUPLICATE PG_* block: python's loader is first-wins and
    Node's dotenv is last-wins, so the two runtimes silently resolved to
    DIFFERENT databases. The duplicate is now removed, but this fixture stays
    bound to the module's own resolution so it can never drift again.

    Skips loudly (never fails) when no DB is reachable: pipeline-lint.yml runs
    this harness with no postgres service.
    """
    psycopg2 = pytest.importorskip('psycopg2')
    dsn = {
        'host': os.environ.get('PG_HOST', 'localhost'),
        'port': int(os.environ.get('PG_PORT') or '5432'),
        'dbname': os.environ.get('PG_DATABASE', 'buildo'),
        'user': os.environ.get('PG_USER', 'postgres'),
        'password': os.environ.get('PG_PASSWORD', 'postgres'),
    }
    try:
        probe = psycopg2.connect(connect_timeout=5, **dsn)
    except Exception as err:  # noqa: BLE001 - skip on ANY connect failure, by design
        pytest.skip(f"real-DB tier: no Postgres at {dsn['host']}:{dsn['port']} ({err})")
    try:
        cur = probe.cursor()
        # Assert the resolved target's schema, not just its reachability — a
        # reachable-but-stale instance is the trap Adversary 1 identified.
        cur.execute("SELECT to_regclass('public.pipeline_runs'),"
                    "       to_regclass('public.permit_scrape_outcomes')")
        runs, outcomes = cur.fetchone()
        if runs is None or outcomes is None:
            pytest.skip(f"real-DB tier: schema not current on {dsn['dbname']} "
                        f"(pipeline_runs={runs}, permit_scrape_outcomes={outcomes})")
    finally:
        probe.close()
    return dsn
