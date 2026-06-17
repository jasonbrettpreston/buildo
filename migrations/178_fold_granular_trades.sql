-- 178: Fold the 5 forecast-only "granular" trades into their install-side survivors.
--   windows            -> glazing (windows is a PRODUCT installed by glazing)
--   paving, outdoor-patio -> landscaping
--   decks, back-yard-fences -> decking-fences
--
-- These were SERIAL-seeded by migration 131 (live ids: windows=35, paving=44, decks=46,
-- back-yard-fences=47, outdoor-patio=48) and are forecast-only vocabulary: verified 0 children
-- in permit_trades / lead_trades / trade_mapping_rules (the 3 by-id FKs), and 0 rows in
-- trade_configurations / trade_sqft_rates / trade_suppliers. Their ONLY FK children are
-- universal_stream_trade_signals rows (slug FK from migration 130, NO ON DELETE CASCADE — 180
-- rows, 36 per slug) which therefore MUST be deleted BEFORE the trades rows or the DELETE
-- FK-fails. Operate on slug (ids are SERIAL/non-canonical), never hard-coded ids.
--
-- Classifier tag routing (%windows%->glazing, %paving%/%patio%->landscaping, %deck%/%fence%->
-- decking-fences) lives in trade_mapping_rules and points at the SURVIVORS, not these granular
-- trades — so it is unaffected by this fold. Idempotent (no-op once folded).
-- SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B.6

-- UP
DO $mig$
DECLARE
  folded      text[] := ARRAY['windows','paving','decks','back-yard-fences','outdoor-patio'];
  child_count int;
  ust_deleted int;
  trades_deleted int;
BEGIN
  -- Guard: refuse to fold if any granular trade carries by-id install children (would orphan
  -- real classified data). Resolve slug -> id first; never assume the SERIAL ids.
  SELECT count(*) INTO child_count
  FROM (
    SELECT trade_id FROM permit_trades
    UNION ALL SELECT trade_id FROM lead_trades
    UNION ALL SELECT trade_id FROM trade_mapping_rules
  ) c
  WHERE c.trade_id IN (SELECT id FROM trades WHERE slug = ANY(folded));

  IF child_count > 0 THEN
    RAISE EXCEPTION 'migration 178: % by-id child row(s) reference a granular trade — repoint to the survivor before folding', child_count;
  END IF;

  -- 1) Slug-FK children first (universal_stream_trade_signals — no ON DELETE CASCADE).
  DELETE FROM universal_stream_trade_signals WHERE trade_slug = ANY(folded);
  GET DIAGNOSTICS ust_deleted = ROW_COUNT;

  -- 2) Then the granular trade rows themselves.
  DELETE FROM trades WHERE slug = ANY(folded);
  GET DIAGNOSTICS trades_deleted = ROW_COUNT;

  RAISE NOTICE 'migration 178: folded % granular trades, deleted % universal_stream_trade_signals rows',
    trades_deleted, ust_deleted;
END
$mig$;

-- DOWN
-- Manual rollback only (Rule 6 — migrate.js runs every line; no executable SQL after -- DOWN).
-- To revert: re-INSERT the 5 trades (windows/paving/decks/back-yard-fences/outdoor-patio) into
-- trades with ON CONFLICT (slug) DO NOTHING (they will take fresh SERIAL ids), then re-run the
-- universal_stream_trade_signals seed for those slugs from migration 131. No by-id children were
-- repointed (there were none), so nothing else to restore.
