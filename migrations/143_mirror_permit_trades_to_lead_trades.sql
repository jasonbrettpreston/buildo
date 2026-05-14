-- 143: Phase C R5.3 — mirror permit_trades writes to lead_trades.
--
-- DESIGN PIVOT 2026-05-13: the R2-locked plan called for app-layer
-- dual-write across 6 scripts. After R5.2, trigger-based mirroring
-- emerged as the simpler design: AFTER INSERT/UPDATE/DELETE on
-- permit_trades auto-mirrors to lead_trades with the canonical Phase B
-- lead_id derivation. Zero application changes; covers all current and
-- future writers (eliminates the R2 worktree "missed writer" concern).
--
-- Trigger function uses byte-for-byte the same LPAD logic as the
-- Phase B trigger on permits + the migrate-to-lead-id.js backfill:
--   'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')
--
-- Idempotency: ON CONFLICT (lead_id, trade_id) DO UPDATE — re-runs after
-- a Phase C deploy + before Phase H drops legacy tables are safe.
--
-- Spec 47 §R-protocol is not directly applicable (this is a DB trigger,
-- not a pipeline script), but the SPEC LINK header convention is honored.
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C R5.3

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mirror_permit_trades_to_lead_trades() RETURNS TRIGGER AS $$
DECLARE
    new_lead_id TEXT;
    old_lead_id TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        new_lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
        INSERT INTO lead_trades (lead_id, trade_id, tier, confidence, is_active, phase, lead_score, classified_at)
        VALUES (new_lead_id, NEW.trade_id, NEW.tier, NEW.confidence, NEW.is_active, NEW.phase, NEW.lead_score, NEW.classified_at)
        ON CONFLICT (lead_id, trade_id) DO UPDATE SET
            tier = EXCLUDED.tier,
            confidence = EXCLUDED.confidence,
            is_active = EXCLUDED.is_active,
            phase = EXCLUDED.phase,
            lead_score = EXCLUDED.lead_score,
            classified_at = EXCLUDED.classified_at;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        new_lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
        old_lead_id := 'permit:' || OLD.permit_num || ':' || LPAD(OLD.revision_num, 2, '0');

        -- R5.3.f worktree fix: detect permit_num/revision_num change
        -- (theoretical — the 6 writer scripts treat these as immutable),
        -- but a future correction path could change them. Fail loudly
        -- so the orphan case never lands silently.
        IF old_lead_id IS DISTINCT FROM new_lead_id THEN
            RAISE EXCEPTION 'mirror_permit_trades_to_lead_trades: lead_id key change detected (% -> %) — permit_num/revision_num changed on permit_trades row; handle explicitly', old_lead_id, new_lead_id;
        END IF;

        -- R5.3.f DeepSeek + worktree fix: use INSERT ON CONFLICT DO
        -- UPDATE instead of a blind UPDATE. If the lead_trades row was
        -- ever manually deleted or never created (e.g., a writer that
        -- inserted to permit_trades before this trigger was installed),
        -- the upsert restores parity instead of silently missing the
        -- WHERE-by-zero-rows case.
        INSERT INTO lead_trades (lead_id, trade_id, tier, confidence, is_active, phase, lead_score, classified_at)
        VALUES (new_lead_id, NEW.trade_id, NEW.tier, NEW.confidence, NEW.is_active, NEW.phase, NEW.lead_score, NEW.classified_at)
        ON CONFLICT (lead_id, trade_id) DO UPDATE SET
            tier = EXCLUDED.tier,
            confidence = EXCLUDED.confidence,
            is_active = EXCLUDED.is_active,
            phase = EXCLUDED.phase,
            lead_score = EXCLUDED.lead_score,
            classified_at = EXCLUDED.classified_at;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        old_lead_id := 'permit:' || OLD.permit_num || ':' || LPAD(OLD.revision_num, 2, '0');
        DELETE FROM lead_trades
        WHERE lead_id = old_lead_id AND trade_id = OLD.trade_id;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Idempotent install: drop existing trigger first so re-running this
-- migration replaces the trigger cleanly.
DROP TRIGGER IF EXISTS trg_mirror_permit_trades_to_lead_trades ON permit_trades;

CREATE TRIGGER trg_mirror_permit_trades_to_lead_trades
    AFTER INSERT OR UPDATE OR DELETE ON permit_trades
    FOR EACH ROW EXECUTE FUNCTION mirror_permit_trades_to_lead_trades();

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting drops the mirror trigger; existing rows in lead_trades stay
-- in place. New writes to permit_trades will no longer propagate to
-- lead_trades, so consumers that read lead_trades will see staleness
-- for new permits.
--
-- To roll back manually:
--
--   DROP TRIGGER IF EXISTS trg_mirror_permit_trades_to_lead_trades ON permit_trades;
--   DROP FUNCTION IF EXISTS mirror_permit_trades_to_lead_trades();
