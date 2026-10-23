-- 284: coa_notice_variances gains the VALUES-ONLY BATCH family (load_coa_notices, Spec 129 §2b; operator CHAT-71.2).
--
-- WHY THIS EXISTS
-- The 2026 Application Information Centre decision, hearing and zoning notices cannot be fetched (captcha; the
-- operator drops them, C-6). A lane extracts VALUES ONLY and commits them as sha256-pinned batch files that the
-- same step reads beside the 2017 PDFs, so one run sees both families (the MARK is table-wide, Spec 129 §9).
-- The table already carries `source_family` in its key (Spec 129 §4 "source_family is a column"), so no key,
-- no index and no consumer path changes. This migration only widens what the table may hold:
--   * source_family   + 'aic_values_batch'
--   * decision        + 'pending'   (a hearing notice, or an item not yet decided)
--   * decision_source + 'unknown'   (the AIC drop does not say committee or delegated; claiming one is unverified)
--   * source_page     becomes NULL-able, with a coherence CHECK: a PDF row has a page, a batch row has none
--   * doc_type        NEW, decision_notice | hearing_notice            (existing rows: decision_notice)
--   * source_batch    NEW, coa-YYYY-decisions (PDF year) | coa-YYYY-<letter> (a batch)  (existing rows: coa-2017-decisions)
-- doc_type and source_batch are the two columns the scorer key already uses (coa-key.mjs DOC_TYPES, batch ids);
-- with them the key regenerates from the table instead of from files.
--
-- IMPACT: ~10K existing rows get the two new columns by a constant default that is DROPPED right after, so the
-- step must write them (no silent default). No row is deleted or re-keyed. Idempotent re-run: constraints are
-- dropped IF EXISTS before being re-added; ADD COLUMN IF NOT EXISTS.
--
-- SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2b, §4
-- SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md ingestor.3

-- UP
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_source_family;
ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_source_family CHECK (
  source_family IN ('toronto_ca_decision_pdf', 'aic_values_batch')
);

ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_decision;
ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_decision CHECK (
  decision IN ('approved', 'approved_with_conditions', 'refused', 'unknown', 'pending')
);

ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_decision_source;
ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_decision_source CHECK (
  decision_source IN ('committee', 'delegated', 'unknown')
);

ALTER TABLE coa_notice_variances ALTER COLUMN source_page DROP NOT NULL;
ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_source_page;
ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_source_page CHECK (source_page IS NULL OR source_page > 0);
ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_source_page_family;
ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_source_page_family CHECK (
  (source_family = 'toronto_ca_decision_pdf') = (source_page IS NOT NULL)
);

ALTER TABLE coa_notice_variances ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'decision_notice';
ALTER TABLE coa_notice_variances ALTER COLUMN doc_type DROP DEFAULT;
ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_doc_type;
ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_doc_type CHECK (
  doc_type IN ('decision_notice', 'hearing_notice')
);

ALTER TABLE coa_notice_variances ADD COLUMN IF NOT EXISTS source_batch TEXT NOT NULL DEFAULT 'coa-2017-decisions';
ALTER TABLE coa_notice_variances ALTER COLUMN source_batch DROP DEFAULT;
ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_source_batch;
ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_source_batch CHECK (
  source_batch ~ '^coa-[0-9]{4}-(decisions|[a-z])$'
);

COMMENT ON COLUMN coa_notice_variances.doc_type IS
'decision_notice or hearing_notice (Spec 129 §2b). A PDF row is always a decision notice.';
COMMENT ON COLUMN coa_notice_variances.source_batch IS
'The intake batch the row came from: coa-YYYY-decisions for the pinned PDF year, coa-YYYY-<letter> for a values-only batch (Spec 129 §2b).';

-- DOWN — comments-only per project convention (migrate.js runs the whole file in one transaction and does NOT
-- honour -- UP / -- DOWN markers; see tasks/lessons.md). Manual rollback, only while no row is aic_values_batch,
-- pending, decision_source unknown or page-less:
--   ALTER TABLE coa_notice_variances DROP COLUMN IF EXISTS source_batch;
--   ALTER TABLE coa_notice_variances DROP COLUMN IF EXISTS doc_type;
--   ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_source_page_family;
--   ALTER TABLE coa_notice_variances ALTER COLUMN source_page SET NOT NULL;
--   (then restore chk_cnv_source_family / chk_cnv_decision / chk_cnv_decision_source from migration 252)
