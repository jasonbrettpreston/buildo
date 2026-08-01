-- 236_permit_scrape_outcomes.sql
-- SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3 (scrape-outcome persistence)
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B default deny)
-- SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §7.8 (Tier 3 ledger)
--
-- Per-permit, append-only scrape-outcome ledger (WF2 2026-07-31,
-- .cursor/wf2_scrape_outcome_persistence_v2.md). Operator goal: understand
-- why the inspections data failed for a permit AFTER the run ends, so
-- corrective action is possible - aggregate telemetry answers how the RUN
-- went, never why THIS permit yielded nothing.
--
-- Design notes (panel-folded):
--   * outcome vocabulary is the 8-value contract in
--     docs/specs/_contracts.json schema.scrape_outcomes; the named CHECK
--     below is grep-pinned by src/tests/contracts.infra.test.ts and
--     live-verified by src/tests/db/236_permit_scrape_outcomes.db.test.ts.
--   * permit_num is NULLABLE with a num_nonnulls guard: batch-grain outcomes
--     (waf_blocked / transport_error / retry_exhausted / address_not_found /
--     no_target_folders) are observed at year_seq grain and resolved to
--     permit_nums once per claimed batch; a year_seq that resolves to ZERO
--     permits still lands here with permit_num NULL and the raw year_seq -
--     the anomalous outcome this feature exists for must never vanish.
--   * revision-grain ambiguity is accepted knowingly: permit_num is not
--     unique in permits (revisions are rows); this ledger is deliberately
--     permit_num-grain and duplicate rows from retried attempts are
--     tolerated (append-only diagnostic ledger).
--   * transport NOT NULL: the http/browser split must survive into the data,
--     or a transport-specific block pattern is invisible after the run.
--   * run_id correlates rows to a GH Actions run (SCRAPER_RUN_ID =
--     GITHUB_RUN_ID or a generated uuid; standalone runs stamp their own).
--   * retention: 90-day raw horizon with prune-time rollup (operator ruling
--     D1); the prune job lands in migration 237. The rollup PK carries
--     transport so a transport regression survives the horizon.
-- FK-EXEMPT: permit_num deliberately has NO foreign key to permits (mig 218
-- precedent): the permits PK is composite (permit_num, revision_num), this
-- ledger is permit_num-grain, and a diagnostic row must survive its permit
-- being deleted from the feed (address_not_found is exactly that case).

-- UP
BEGIN;

CREATE TABLE permit_scrape_outcomes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permit_num VARCHAR(30),
  year_seq VARCHAR(30),
  outcome TEXT NOT NULL,
  detail VARCHAR(500),
  transport TEXT NOT NULL,
  run_id TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_permit_scrape_outcomes_outcome CHECK (
    outcome IN (
      'scraped', 'no_stages', 'no_inspection_link', 'no_target_folders',
      'address_not_found', 'waf_blocked', 'transport_error', 'retry_exhausted'
    )
  ),
  CONSTRAINT chk_permit_scrape_outcomes_transport CHECK (
    transport IN ('http', 'browser')
  ),
  CONSTRAINT chk_permit_scrape_outcomes_subject CHECK (
    num_nonnulls(permit_num, year_seq) >= 1
  )
);

-- Diagnosis path: the history of THIS permit, newest first.
CREATE INDEX idx_permit_scrape_outcomes_permit
ON permit_scrape_outcomes (permit_num, observed_at DESC);

-- Prune path: the 90-day horizon scan (migration 237).
CREATE INDEX idx_permit_scrape_outcomes_observed
ON permit_scrape_outcomes (observed_at);

-- Spec 114 §4 Class B posture: RLS enabled with ZERO policies = default deny
-- for anon/authenticated. All writes go through the scraper worker (table
-- owner via the server-side connection); raw scrape diagnostics must never
-- be selectable by any client-facing role.
ALTER TABLE permit_scrape_outcomes ENABLE ROW LEVEL SECURITY;

-- Rollup counterpart: what the 90-day prune folds raw rows into. The key is
-- COALESCE(permit_num, year_seq) at prune time so permit_num-NULL anomaly
-- rows keep their identity past the horizon.
CREATE TABLE permit_scrape_outcome_rollup (
  permit_num VARCHAR(30) NOT NULL,
  outcome TEXT NOT NULL,
  transport TEXT NOT NULL,
  occurrences BIGINT NOT NULL DEFAULT 0,
  first_at TIMESTAMPTZ NOT NULL,
  last_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (permit_num, outcome, transport)
);

ALTER TABLE permit_scrape_outcome_rollup ENABLE ROW LEVEL SECURITY;

COMMIT;

-- DOWN (documentation only - Rule 6: migrate.js executes every uncommented
-- line, DOWN blocks must not contain executable SQL. Manual reversal - note
-- this DELETES the only record of scrape diagnostics):
--   BEGIN;
--     DROP TABLE IF EXISTS permit_scrape_outcome_rollup;
--     DROP TABLE IF EXISTS permit_scrape_outcomes;
--   COMMIT;
