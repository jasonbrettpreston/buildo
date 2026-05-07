-- 118: Wire the realtor persona into the data layer (WF2 Cycle 7)
--
-- Per Spec 91 §3.5: realtors are tradespeople algorithmically; the only
-- persona-specific behavior is DB calibration (a row in `trades` + a
-- row in `trade_configurations`). Spec 91 §1.2 algorithmic invariant
-- explicitly forbids algorithm branching on persona.
--
-- Calibration (product call recorded in active_task.md Cycle 7):
--   bid_phase_cutoff: P1   — realtor sees the permit at intake (earliest
--                            possible visibility — before issuance)
--   work_phase_target: P19 — realtor's predicted_start aligns with project
--                            completion / occupancy (latest tracked phase
--                            short of terminal P20). Same lifecycle row
--                            ages from on_horizon → departing_soon →
--                            action_required as the build progresses.
--
-- This migration ONLY seeds metadata. The expensive backfill of
-- `permit_trades` (one realtor row per active permit) is handled by
-- `scripts/backfill-realtor-permit-trades.js` — pulled out of the
-- migration because the row count is large enough that an inline
-- transactional INSERT would lock `permit_trades` for too long.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- 1. Seed the canonical trade row (id 33, slug 'realtor').
INSERT INTO trades (id, slug, name, icon, color, sort_order) VALUES
  (33, 'realtor', 'Real Estate Agent', 'Key', '#EC407A', 33)
ON CONFLICT (id) DO NOTHING;

-- Bump the SERIAL sequence so future SERIAL inserts don't collide with id 33.
SELECT setval('trades_id_seq', (SELECT MAX(id) FROM trades));

-- 2. Seed the marketplace calibration row.
-- Mirrors src/lib/classification/lifecycle-phase.ts TRADE_TARGET_PHASE_FALLBACK
-- realtor entry. Spec 47 §4.1 mandates the DB row is the canonical source;
-- the JS constant is the last-resort fallback when the DB query fails.
--
-- ON CONFLICT DO NOTHING (not DO UPDATE) — preserves any operator hotfix
-- to imminent_window_days / allocation_pct made directly in the DB. A
-- re-run of this migration will NOT silently revert such hotfixes.
-- (Gemini Cycle 7 review MEDIUM: re-running migrations should be a
-- no-op for existing rows, not a stealth overwrite.)
INSERT INTO trade_configurations
  (trade_slug, bid_phase_cutoff, work_phase_target, imminent_window_days, allocation_pct)
VALUES
  ('realtor', 'P1', 'P19', 14, 0.0500)
ON CONFLICT (trade_slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — explicit failure with manual rollback procedure
-- ═══════════════════════════════════════════════════════════════════
-- A transactional DOWN is intentionally rejected. After deployment, the
-- backfill script writes ~millions of permit_trades rows pointing at
-- trade_id=33; a CASCADE DELETE on the trades row would lock the entire
-- permit_trades table for the duration of the cascade.
--
-- Standard `db:migrate:down` tooling will execute this DOWN block. We
-- raise an explicit exception so the failure is loud + the operator
-- gets the manual procedure verbatim. This prevents the "comment-only"
-- rollback failure mode that would silently break tooling.
-- (Gemini Cycle 7 review CRITICAL: rollback must fail loudly with
-- explicit instructions rather than silently break standard tooling.)

-- DOWN
DO $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '0A000',  -- feature_not_supported
    MESSAGE = 'MANUAL ROLLBACK REQUIRED for migration 118 (realtor trade).',
    DETAIL  = 'Transactional rollback is unsafe — backfilled permit_trades rows would CASCADE DELETE under a long table lock. Run the manual procedure documented below, then re-run this migration with the DOWN block guarded.',
    HINT    = 'Manual rollback (run OUTSIDE a single transaction, in this exact order):
    1. DELETE FROM permit_trades WHERE trade_id = 33;          -- batched if large; consider scripts/backfill-realtor-permit-trades.js inverse
    2. DELETE FROM trade_configurations WHERE trade_slug = ''realtor'';
    3. DELETE FROM trades WHERE id = 33;
    Then revert the TRADES array entry + TRADE_TARGET_PHASE_FALLBACK realtor row in code (one commit).';
END $$;
