-- Migration 177: re-key the drain-plumbing trade from the mis-seeded SERIAL id 34 to its
-- canonical id 32 (Spec 80 §2: "Trade IDs 1-32 stable, never renumbered"; src/lib/classification/
-- trades.ts + scripts/classify-permits.js both declare drain-plumbing = id 32). Migration 131
-- created drain-plumbing via INSERT without an explicit id (SERIAL → 34, after realtor=33) while
-- the canonical id-32 slot was never seeded — so classify-permits.js (which INSERTs
-- permit_trades.trade_id = 32) FK-failed at classify_permits, blocking the permits chain.
-- SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md
--
-- Mechanics: the slug must NOT change (universal_stream_trade_signals.trade_slug → trades.slug,
-- ON UPDATE NO ACTION — renaming the slug throws). So we move the id only. The 3 by-id FK
-- children (permit_trades, lead_trades, trade_mapping_rules) are ON UPDATE NO ACTION, so we
-- disable the permit_trades→lead_trades mirror trigger (mig 143), capture + drop the FKs, move
-- trades.id, repoint children, recreate the FKs from the captured definitions, re-enable the
-- trigger. Idempotent (no-op if drain-plumbing is already id 32). Does NOT touch the 5
-- universal-stream-only trades (windows/paving/decks/back-yard-fences/outdoor-patio) — taxonomy
-- vocabulary unification is a separate WF1 epic.
--
-- Manual rollback (DOWN is commented per validate-migration Rule 6 — migrate.js runs the whole
-- file as one batch, so executable DOWN SQL would run on every UP). To revert: run an inverse
-- DO-block that re-keys drain-plumbing 32 → 34 (or any free id if 34 was reused) with the same
-- trigger-disable + FK capture/drop/recreate dance, repointing permit_trades / lead_trades /
-- trade_mapping_rules. DATA: 17,371 permit_trades + 17,371 lead_trades rows are repointed.

-- UP
SET LOCAL lock_timeout = '5s';  -- fail-fast rather than pile up behind a long-running txn

-- ALLOW-DESTRUCTIVE: drops + recreates the 3 by-id FK constraints below (re-key dance).
DO $mig$
DECLARE
  cur        int;
  fk_permit  text;
  fk_lead    text;
  fk_mapping text;
  fk_count   int;
BEGIN
  SELECT id INTO cur FROM trades WHERE slug = 'drain-plumbing';

  -- Idempotent: already canonical → no-op (safe re-run / --verify).
  IF cur = 32 THEN
    RAISE NOTICE 'migration 177: drain-plumbing already at canonical id 32 — no-op';
    RETURN;
  END IF;
  -- Prerequisite: drain-plumbing must exist (migration 131 seeds it; 131 < 177).
  IF cur IS NULL THEN
    RAISE EXCEPTION 'migration 177: drain-plumbing trade absent — migration 131 must precede 177';
  END IF;
  -- Refuse rather than corrupt if the canonical id 32 is occupied by some other trade.
  IF EXISTS (SELECT 1 FROM trades WHERE id = 32) THEN
    RAISE EXCEPTION 'migration 177: canonical id 32 occupied by slug=%', (SELECT slug FROM trades WHERE id = 32);
  END IF;
  -- sort_order 32 should be free (non-unique column, but guard against accidental collision).
  IF EXISTS (SELECT 1 FROM trades WHERE sort_order = 32 AND id <> cur) THEN
    RAISE EXCEPTION 'migration 177: sort_order 32 already used by slug=%',
      (SELECT slug FROM trades WHERE sort_order = 32 AND id <> cur LIMIT 1);
  END IF;

  -- The FK inventory referencing trades must be exactly the 4 we know about (3 by id + 1 by
  -- slug); abort if an unknown FK exists so the drop/recreate below can't leave one dangling.
  SELECT count(*) INTO fk_count FROM pg_constraint WHERE confrelid = 'trades'::regclass AND contype = 'f';
  IF fk_count <> 4 THEN
    RAISE EXCEPTION 'migration 177: unexpected FK count referencing trades (% — expected 4); aborting', fk_count;
  END IF;

  -- Capture the 3 by-id FK definitions verbatim so they recreate exactly (drift-proof).
  SELECT pg_get_constraintdef(oid) INTO fk_permit  FROM pg_constraint WHERE conname = 'permit_trades_trade_id_fkey';
  SELECT pg_get_constraintdef(oid) INTO fk_lead    FROM pg_constraint WHERE conname = 'lead_trades_trade_id_fkey';
  SELECT pg_get_constraintdef(oid) INTO fk_mapping FROM pg_constraint WHERE conname = 'trade_mapping_rules_trade_id_fkey';
  IF fk_permit IS NULL OR fk_lead IS NULL OR fk_mapping IS NULL THEN
    RAISE EXCEPTION 'migration 177: a by-id FK is missing (permit=%, lead=%, mapping=%)', fk_permit, fk_lead, fk_mapping;
  END IF;

  -- Acquire ACCESS EXCLUSIVE on all four touched tables UP FRONT, in one statement — so the lock
  -- set is taken atomically (deadlock-safe) and there is no window for a concurrent write between
  -- the parent re-key and the child repoint. The subsequent DDL would take these locks anyway; doing
  -- it explicitly + early closes the gap the adversarial review flagged. lock_timeout=5s → fail-fast
  -- (clean rollback, never corruption) if the pipeline is unexpectedly active.
  LOCK TABLE trades, permit_trades, lead_trades, trade_mapping_rules IN ACCESS EXCLUSIVE MODE;

  -- Disable the permit_trades→lead_trades mirror trigger so the child repoint is a clean straight
  -- UPDATE on both tables (otherwise it INSERTs lead_trades@32 → UNIQUE clash with the update).
  ALTER TABLE permit_trades DISABLE TRIGGER trg_mirror_permit_trades_to_lead_trades;

  -- Drop the by-id FKs (the slug-FK on universal_stream_trade_signals is untouched — slug stays).
  ALTER TABLE permit_trades       DROP CONSTRAINT permit_trades_trade_id_fkey;
  ALTER TABLE lead_trades         DROP CONSTRAINT lead_trades_trade_id_fkey;
  ALTER TABLE trade_mapping_rules DROP CONSTRAINT trade_mapping_rules_trade_id_fkey;

  -- Move the trade to its canonical id (slug/name/icon/color untouched → slug-FK valid throughout).
  -- sort_order is corrected to 32 too (mig 131 set it to 34; canonical is 32).
  UPDATE trades SET id = 32, sort_order = 32 WHERE id = cur;

  -- Repoint the by-id children (both pipeline mirrors: permits + the coa/lead mirror).
  UPDATE permit_trades       SET trade_id = 32 WHERE trade_id = cur;
  UPDATE lead_trades         SET trade_id = 32 WHERE trade_id = cur;
  UPDATE trade_mapping_rules SET trade_id = 32 WHERE trade_id = cur;

  -- Recreate the FKs from the captured definitions (validates: all children now point at 32).
  EXECUTE format('ALTER TABLE permit_trades ADD CONSTRAINT permit_trades_trade_id_fkey %s', fk_permit);
  EXECUTE format('ALTER TABLE lead_trades ADD CONSTRAINT lead_trades_trade_id_fkey %s', fk_lead);
  EXECUTE format('ALTER TABLE trade_mapping_rules ADD CONSTRAINT trade_mapping_rules_trade_id_fkey %s', fk_mapping);

  -- Re-enable the mirror trigger.
  ALTER TABLE permit_trades ENABLE TRIGGER trg_mirror_permit_trades_to_lead_trades;

  RAISE NOTICE 'migration 177: re-keyed drain-plumbing % -> 32 (% permit_trades, % lead_trades at id 32)',
    cur,
    (SELECT count(*) FROM permit_trades WHERE trade_id = 32),
    (SELECT count(*) FROM lead_trades   WHERE trade_id = 32);
END
$mig$;

-- DOWN
-- Manual rollback only (Rule 6 — no executable SQL in DOWN). Re-key drain-plumbing 32 -> 34
-- (or a free id if 34 was reused) via the inverse of the UP DO-block: disable the mirror trigger,
-- capture + drop the 3 by-id FKs, UPDATE trades SET id=34 WHERE id=32, repoint permit_trades /
-- lead_trades / trade_mapping_rules 32 -> 34, recreate the FKs, re-enable the trigger.
