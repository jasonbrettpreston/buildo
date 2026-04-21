-- Migration 104: Make opportunity_score nullable
--
-- Spec 81 §3 "WF1 April 2026" defines NULL opportunity_score as "no cost data available".
-- Migration 091 created the column NOT NULL DEFAULT 0, predating that spec change.
-- With trade_forecasts now at 81K rows (many lacking cost_estimates), the script crashes
-- on every run when it tries to UPDATE those rows to NULL per spec intent.
--
-- SPEC LINK: docs/specs/product/future/81_opportunity_score_engine.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE trade_forecasts
  ALTER COLUMN opportunity_score DROP NOT NULL,
  ALTER COLUMN opportunity_score SET DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- Backfill NULLs before restoring NOT NULL — without this UPDATE the ALTER SET NOT NULL
-- will fail on any row that was set to NULL after the UP ran.
-- UPDATE trade_forecasts SET opportunity_score = 0 WHERE opportunity_score IS NULL;
-- ALTER TABLE trade_forecasts
--   ALTER COLUMN opportunity_score SET NOT NULL,
--   ALTER COLUMN opportunity_score SET DEFAULT 0;
