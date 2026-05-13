-- 128: universal_stream_catalog — reference table holding the 110-row
-- Universal Stream from Spec 84 §2.5.h.2 (locked v10 CSV).
--
-- The Phase E lifecycle classifier JOINs against this table to derive
-- granular columns (lifecycle_seq, lifecycle_group, lifecycle_block,
-- lifecycle_stage, bid_value) on permits and coa_applications. The
-- front-end JOINs through lifecycle_seq to render group/block/stage
-- labels + colors + icons.
--
-- Seed data lands in migration 129 (Spec 42 §6.6.B seed migration contract
-- splits table create from INSERT so a seed failure cannot roll back the
-- table). The 6 color/icon columns + bid_value + loop_marker + phase +
-- rows_count are nullable to match the v10 CSV's sparse-cell pattern;
-- empty cells map to SQL NULL per the contract.
--
-- Reference data is read-only after Phase B. Phase D/E classifiers do
-- not write to this table; they only JOIN against it.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS universal_stream_catalog (
    seq                 INTEGER         PRIMARY KEY,
    source_row_num      INTEGER         NOT NULL,
    lifecycle_group     VARCHAR(10)     NOT NULL,
    group_label         VARCHAR(60)     NOT NULL,
    lifecycle_block     VARCHAR(10)     NOT NULL,
    block_label         VARCHAR(60)     NOT NULL,
    lifecycle_stage     VARCHAR(5)      NOT NULL,
    stage_label         VARCHAR(120)    NOT NULL,
    source              VARCHAR(30)     NOT NULL CHECK (source IN ('coa.status', 'permits.status', 'insp.stage')),
    status              VARCHAR(60)     NOT NULL,
    phase               VARCHAR(40),
    bid_value           DECIMAL(3,2)    CHECK (bid_value IS NULL OR (bid_value >= 0 AND bid_value <= 1)),
    loop_marker         VARCHAR(60),
    group_color         VARCHAR(7),
    group_icon          VARCHAR(8),
    block_color         VARCHAR(7),
    block_icon          VARCHAR(8),
    stage_color         VARCHAR(7),
    stage_icon          VARCHAR(8),
    rows_count          INTEGER
);

CREATE INDEX IF NOT EXISTS idx_universal_stream_catalog_group ON universal_stream_catalog (lifecycle_group);
CREATE INDEX IF NOT EXISTS idx_universal_stream_catalog_block ON universal_stream_catalog (lifecycle_block);

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration drops the Universal Stream catalog. The Phase
-- E classifier (when wired) cannot derive granular lifecycle columns;
-- existing legacy P-code columns continue to function. Front-end JOINs
-- on lifecycle_seq would return no rows.
--
-- To roll back manually:
--
--   DROP INDEX IF EXISTS idx_universal_stream_catalog_block;
--   DROP INDEX IF EXISTS idx_universal_stream_catalog_group;
--   DROP TABLE IF EXISTS universal_stream_catalog;
--
-- Migration 129's seed data is dropped along with the table; no separate
-- DELETE pass needed.
