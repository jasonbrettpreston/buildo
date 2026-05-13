-- 130: universal_stream_trade_signals — join table decomposing the 152
-- per-trade × per-row signal columns from Spec 84 §2.5.h.2 into queryable
-- relational form (~1,400 rows total — 38 trades × 4 signals × the seqs
-- where each cell is marked ✓ in the v10 CSV).
--
-- The Phase F forecast engine queries this table for granular bimodal
-- routing per (current_seq, trade) — replacing the legacy PHASE_ORDINAL
-- comparison against trade_configurations.bid_phase_cutoff /
-- work_phase_target.
--
-- Seed data lands in migration 131 (Spec 42 §6.6.B seed migration contract).
-- Empty CSV cells produce no row (absence IS the signal — only ✓ cells emit).
--
-- FK: depends on migration 128 (universal_stream_catalog) for seq, and on
-- the existing trades table for trade_slug. trades(slug) must exist with
-- the 38 canonical slugs (verified during Spec 84 finalization).

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS universal_stream_trade_signals (
    seq          INTEGER     NOT NULL REFERENCES universal_stream_catalog(seq),
    trade_slug   VARCHAR(50) NOT NULL REFERENCES trades(slug),
    signal_type  VARCHAR(20) NOT NULL CHECK (signal_type IN ('bid', 'work', 'fallback', 'last_minute')),
    PRIMARY KEY (seq, trade_slug, signal_type)
);

CREATE INDEX IF NOT EXISTS idx_universal_stream_trade_signals_trade      ON universal_stream_trade_signals (trade_slug, signal_type);
CREATE INDEX IF NOT EXISTS idx_universal_stream_trade_signals_seq_signal ON universal_stream_trade_signals (seq, signal_type);

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration drops the trade-signal routing table. The
-- Phase F forecast engine (when wired) falls back to the legacy
-- PHASE_ORDINAL routing — pre-granular behavior.
--
-- To roll back manually:
--
--   DROP INDEX IF EXISTS idx_universal_stream_trade_signals_seq_signal;
--   DROP INDEX IF EXISTS idx_universal_stream_trade_signals_trade;
--   DROP TABLE IF EXISTS universal_stream_trade_signals;
--
-- Migration 131's seed data is dropped along with the table; no separate
-- DELETE pass needed.
