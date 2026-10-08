-- 252: coa_notice_variances -- one row per minor-variance item parsed from a pinned Toronto Committee of
-- Adjustment "Notice of Decision" PDF (load_coa_notices, Spec 129). McBylaw Phase 2 oracle C.
--
-- WHY THIS EXISTS
-- coa_applications (Spec 51) stores no variance list, no required/proposed values, no citation and no
-- decision text. The decision notices do. load_coa_notices reads a pinned, sha256-verified manifest of
-- notice PDFs, parses each "To permit X, whereas the By-law requires Y" item, and stores the extracted
-- VALUES ONLY: no PDF, no notice text, no owner/agent name (Spec 129 §D3). Adjudicators read the source
-- by url + source_sha256 + source_page.
--
-- DESIGN NOTES
-- * variance_key is the single key (`<source_family>|<application_number>|<item_ordinal>`) because the
--   library's soft-retire (retract "departed_mark") refuses a composite key; the triple is also UNIQUE.
-- * application_number is a SOFT reference to coa_applications (no FK): an ingest compute cannot read the
--   DB, and a 23503 would roll back the whole run. Orphans are counted by plausibility P1.
-- * retired_at is written only by the library MARK/UNMARK; loaded_at is a DB default. Consumers read
--   retired_at IS NULL. No row is ever deleted by the step.
-- * Every closed set below equals scripts/lib/coa-notices/vocab.json check_backed.* (both directions,
--   src/tests/steps/load_coa_notices/vocab-check-parity.infra.test.ts).
-- * RLS: ENABLE with zero policies (Spec 114 §4 Class B, default deny); the pipeline role bypasses RLS.
--
-- IMPACT: a NEW, EMPTY table. No ALTER/UPDATE of any existing table, no FK onto coa_applications, so the
-- plain CREATE INDEX statements lock nothing that exists. Expected size: ~9-12K rows for the 2017 manifest.
--
-- SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D4
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B)

-- ============================================================================
-- UP
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE TABLE coa_notice_variances (
  variance_key TEXT PRIMARY KEY,
  source_family TEXT NOT NULL,
  application_number VARCHAR(50) NOT NULL,
  item_ordinal SMALLINT NOT NULL,
  hearing_date DATE NOT NULL,
  decision_mailed_on DATE NULL,
  decision TEXT NOT NULL,
  decision_source TEXT NOT NULL,
  cited_bylaw TEXT NULL,
  citation_kind TEXT NOT NULL,
  regulation_id_as_cited TEXT NULL,
  exception_ref TEXT NULL,
  zoning_as_stated TEXT NULL,
  target TEXT NOT NULL,
  target_status TEXT NOT NULL,
  bound TEXT NULL,
  required_value NUMERIC NULL,
  required_unit TEXT NULL,
  proposed_value NUMERIC NULL,
  proposed_unit TEXT NULL,
  parse_status TEXT NOT NULL,
  parse_confidence TEXT NOT NULL,
  qualified BOOLEAN NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  source_page INTEGER NOT NULL,
  extractor_version TEXT NOT NULL,
  vocab_version TEXT NOT NULL,
  retired_at TIMESTAMPTZ NULL,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_coa_notice_variances_item UNIQUE (source_family, application_number, item_ordinal),
  CONSTRAINT chk_cnv_variance_key CHECK (
    variance_key = source_family || '|' || application_number || '|' || item_ordinal::TEXT
  ),
  CONSTRAINT chk_cnv_source_family CHECK (source_family IN ('toronto_ca_decision_pdf')),
  CONSTRAINT chk_cnv_item_ordinal CHECK (item_ordinal > 0),
  CONSTRAINT chk_cnv_decision CHECK (decision IN ('approved', 'approved_with_conditions', 'refused', 'unknown')),
  CONSTRAINT chk_cnv_decision_source CHECK (decision_source IN ('committee', 'delegated')),
  CONSTRAINT chk_cnv_cited_bylaw CHECK (cited_bylaw IS NULL OR cited_bylaw ~ '^[0-9][0-9-]*[A-Z]?$'),
  CONSTRAINT chk_cnv_citation_kind CHECK (
    citation_kind IN ('chapter_regulation', 'exception_clause', 'former_bylaw_section', 'none')
  ),
  CONSTRAINT chk_cnv_target_status CHECK (target_status IN ('mapped', 'ambiguous', 'unmapped')),
  CONSTRAINT chk_cnv_target_coherent CHECK ((target_status = 'mapped') = (target NOT IN ('unmapped', 'ambiguous'))),
  CONSTRAINT chk_cnv_target_sentinel CHECK (target_status = 'mapped' OR target = target_status),
  CONSTRAINT chk_cnv_bound CHECK (bound IS NULL OR bound IN ('min', 'max', 'exact')),
  CONSTRAINT chk_cnv_required_value CHECK (required_value IS NULL OR required_value >= 0),
  CONSTRAINT chk_cnv_proposed_value CHECK (proposed_value IS NULL OR proposed_value >= 0),
  CONSTRAINT chk_cnv_required_unit CHECK (
    required_unit IS NULL OR required_unit IN ('m', 'cm', 'm2', 'pct', 'ratio', 'storeys', 'spaces', 'units')
  ),
  CONSTRAINT chk_cnv_proposed_unit CHECK (
    proposed_unit IS NULL OR proposed_unit IN ('m', 'cm', 'm2', 'pct', 'ratio', 'storeys', 'spaces', 'units')
  ),
  CONSTRAINT chk_cnv_parse_status CHECK (
    parse_status IN (
      'pair',
      'no_required_value',
      'no_proposed_value',
      'unit_family_mismatch',
      'multi_value_ambiguous',
      'side_ambiguous',
      'no_split'
    )
  ),
  CONSTRAINT chk_cnv_pair_values CHECK (
    parse_status <> 'pair'
    OR (required_value IS NOT NULL AND proposed_value IS NOT NULL AND required_unit IS NOT NULL AND proposed_unit IS NOT NULL)
  ),
  CONSTRAINT chk_cnv_parse_confidence CHECK (parse_confidence IN ('high', 'medium', 'low')),
  CONSTRAINT chk_cnv_source_sha256 CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_cnv_source_page CHECK (source_page > 0)
);

COMMENT ON TABLE coa_notice_variances IS
'One row per minor-variance item parsed from a pinned CoA Notice of Decision PDF (load_coa_notices, Spec 129). Values only: no PDF, no notice text, no names. Soft reference to coa_applications.application_number. Readers filter retired_at IS NULL.';
COMMENT ON COLUMN coa_notice_variances.item_ordinal IS
'The notice''s PRINTED item number, taken before any filtering (unnumbered items: position within the printed section). Stable across parser changes (Spec 129 §D4).';
COMMENT ON COLUMN coa_notice_variances.hearing_date IS
'The Committee hearing date from the pinned manifest (the notice title), verified at run time by check mail_lag_out_of_bounds. The law-at-hearing-date comparison date (Spec 129 §D8); never CKAN decision_date.';
COMMENT ON COLUMN coa_notice_variances.retired_at IS
'Soft-retire stamp written only by the library departed_mark MARK/UNMARK. NULL = live.';

CREATE INDEX IF NOT EXISTS idx_coa_notice_variances_application ON coa_notice_variances (application_number);
CREATE INDEX IF NOT EXISTS idx_coa_notice_variances_target_live ON coa_notice_variances (
  target, target_status
) WHERE retired_at IS NULL;

ALTER TABLE coa_notice_variances ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one transaction and
-- does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- Confirm before running: the rows are re-derivable only while every pinned document is still fetchable with its
-- pinned sha256 (re-run load_coa_notices with COA_NOTICES_FORCE_RELOAD=1); no PDF bytes are retained anywhere.
-- ============================================================================
-- DROP TABLE IF EXISTS coa_notice_variances;  -- ALLOW-DESTRUCTIVE
