-- 144: Phase C R5.3 — mirror permit_parcels writes to lead_parcels.
--
-- Same trigger-based dual-write pattern as migration 143.
--
-- Schema delta:
--   permit_parcels.match_type VARCHAR(30) → lead_parcels.match_type VARCHAR(20).
--   R5.3 R0.6.1 audit (2026-05-13): MAX(LENGTH(match_type)) = 15 in
--   production; all values fit VARCHAR(20). No truncation issue.
--
--   permit_parcels.linked_at → lead_parcels.matched_at (column rename).
--   The trigger maps NEW.linked_at → matched_at in the INSERT, and
--   NEW.linked_at → matched_at in the UPDATE.
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C R5.3

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mirror_permit_parcels_to_lead_parcels() RETURNS TRIGGER AS $$
DECLARE
    new_lead_id TEXT;
    old_lead_id TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        new_lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
        INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence, matched_at)
        VALUES (new_lead_id, NEW.parcel_id, NEW.match_type, NEW.confidence, NEW.linked_at)
        ON CONFLICT (lead_id, parcel_id) DO UPDATE SET
            match_type = EXCLUDED.match_type,
            confidence = EXCLUDED.confidence,
            matched_at = EXCLUDED.matched_at;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        new_lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
        old_lead_id := 'permit:' || OLD.permit_num || ':' || LPAD(OLD.revision_num, 2, '0');

        -- R5.3.f worktree fix: loud failure on key change
        IF old_lead_id IS DISTINCT FROM new_lead_id THEN
            RAISE EXCEPTION 'mirror_permit_parcels_to_lead_parcels: lead_id key change detected (% -> %) — permit_num/revision_num changed on permit_parcels row; handle explicitly', old_lead_id, new_lead_id;
        END IF;

        -- R5.3.f DeepSeek + worktree fix: upsert handles missing-row case
        INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence, matched_at)
        VALUES (new_lead_id, NEW.parcel_id, NEW.match_type, NEW.confidence, NEW.linked_at)
        ON CONFLICT (lead_id, parcel_id) DO UPDATE SET
            match_type = EXCLUDED.match_type,
            confidence = EXCLUDED.confidence,
            matched_at = EXCLUDED.matched_at;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        old_lead_id := 'permit:' || OLD.permit_num || ':' || LPAD(OLD.revision_num, 2, '0');
        DELETE FROM lead_parcels
        WHERE lead_id = old_lead_id AND parcel_id = OLD.parcel_id;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mirror_permit_parcels_to_lead_parcels ON permit_parcels;

CREATE TRIGGER trg_mirror_permit_parcels_to_lead_parcels
    AFTER INSERT OR UPDATE OR DELETE ON permit_parcels
    FOR EACH ROW EXECUTE FUNCTION mirror_permit_parcels_to_lead_parcels();

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting drops the mirror trigger.
--
-- To roll back manually:
--
--   DROP TRIGGER IF EXISTS trg_mirror_permit_parcels_to_lead_parcels ON permit_parcels;
--   DROP FUNCTION IF EXISTS mirror_permit_parcels_to_lead_parcels();
