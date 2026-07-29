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
