-- Migration 216: attachment_basis provenance column on permit_trades + lead_trades (Spec 80 §5.C / P16-D4).
--
-- SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.C (P16 additive lean-inference layer)
--
-- P16 introduces an ADDITIVE lean-inference attachment tier (D1): served/active trades are the UNION of
-- an EVIDENCE layer (tag/rule/narrow/work-fallback direct hits) and a lean INFERENCE layer (scope-mapped
-- line→trade complements). Provenance must be a first-class column, NOT a tier value — `lead_trades` CHECK
-- `tier IN (1,2,3)` (mig 124) + the mig-143 mirror trigger make tier=4 a hard failure, and tier is not a
-- precision axis (CoA rows are blanket tier-3). So we add `attachment_basis TEXT CHECK (IN ('evidence',
-- 'inference'))` on BOTH permit_trades and lead_trades + carry it through the mirror trigger.
--
-- [FAB1v2] Backfill is AUTHORITATIVE and byte-accurate — after the P13-3 realization re-classified the
-- FULL corpus, `is_active` IS the path-keyed marker: every active row is a direct evidence hit; every
-- inactive row is a demoted bundle-prior emission. So: is_active=true → 'evidence', is_active=false →
-- 'inference'. NOT the tier/conf proxy (which mislabels the 127,704 coincidental-0.55 direct actives).
--
-- [GRD-6] NOT NULL is DEFERRED to a 16D-adjacent migration: the direct CoA writer
-- (classify-coa-trades.js:188-198) only emits the column in 16D, so a CoA re-classify in the 16A→16D
-- window would throw against a NOT NULL column. The column stays NULLABLE here; a later migration adds
-- NOT NULL once every writer emits. No consumer reads the column until 16E (gated OFF until 16F), so a
-- transient NULL from a window CoA insert carries zero query debt and is corrected by the 16F re-run.
--
-- Metadata-only ADD COLUMN; backfill is a bounded CASE UPDATE. Rollback comments-only (Rule 6 — single-txn runner).

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['permit_trades', 'lead_trades'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      -- Additive nullable column with the provenance CHECK.
      EXECUTE format($f$
        ALTER TABLE %I
          ADD COLUMN IF NOT EXISTS attachment_basis TEXT
            CONSTRAINT %I CHECK (attachment_basis IS NULL OR attachment_basis IN ('evidence', 'inference'))
      $f$, t, t || '_attachment_basis_check');
      -- [FAB1v2] authoritative is_active-keyed backfill.
      EXECUTE format($f$
        UPDATE %I
           SET attachment_basis = CASE WHEN is_active THEN 'evidence' ELSE 'inference' END
         WHERE attachment_basis IS NULL
      $f$, t);
    END IF;
  END LOOP;
END $mig$;

-- Carry attachment_basis through the mig-143 mirror trigger. CREATE OR REPLACE so a DB that already
-- applied 143 gets the updated function via `npm run migrate` (editing 143 in place would only DRIFT-warn,
-- never re-run — migrate.js:156). The function body mirrors migrations/143 with attachment_basis added to
-- the INSERT col-list + VALUES + ON CONFLICT SET of BOTH branches [Integration A1].
CREATE OR REPLACE FUNCTION mirror_permit_trades_to_lead_trades() RETURNS TRIGGER AS $$
DECLARE
    new_lead_id TEXT;
    old_lead_id TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        new_lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
        INSERT INTO lead_trades (lead_id, trade_id, tier, confidence, is_active, phase, lead_score, classified_at, attachment_basis)
        VALUES (new_lead_id, NEW.trade_id, NEW.tier, NEW.confidence, NEW.is_active, NEW.phase, NEW.lead_score, NEW.classified_at, NEW.attachment_basis)
        ON CONFLICT (lead_id, trade_id) DO UPDATE SET
            tier = EXCLUDED.tier,
            confidence = EXCLUDED.confidence,
            is_active = EXCLUDED.is_active,
            phase = EXCLUDED.phase,
            lead_score = EXCLUDED.lead_score,
            classified_at = EXCLUDED.classified_at,
            attachment_basis = EXCLUDED.attachment_basis;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        new_lead_id := 'permit:' || NEW.permit_num || ':' || LPAD(NEW.revision_num, 2, '0');
        old_lead_id := 'permit:' || OLD.permit_num || ':' || LPAD(OLD.revision_num, 2, '0');

        IF old_lead_id IS DISTINCT FROM new_lead_id THEN
            RAISE EXCEPTION 'mirror_permit_trades_to_lead_trades: lead_id key change detected (% -> %) — permit_num/revision_num changed on permit_trades row; handle explicitly', old_lead_id, new_lead_id;
        END IF;

        INSERT INTO lead_trades (lead_id, trade_id, tier, confidence, is_active, phase, lead_score, classified_at, attachment_basis)
        VALUES (new_lead_id, NEW.trade_id, NEW.tier, NEW.confidence, NEW.is_active, NEW.phase, NEW.lead_score, NEW.classified_at, NEW.attachment_basis)
        ON CONFLICT (lead_id, trade_id) DO UPDATE SET
            tier = EXCLUDED.tier,
            confidence = EXCLUDED.confidence,
            is_active = EXCLUDED.is_active,
            phase = EXCLUDED.phase,
            lead_score = EXCLUDED.lead_score,
            classified_at = EXCLUDED.classified_at,
            attachment_basis = EXCLUDED.attachment_basis;
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

-- DOWN (comments-only — Rule 6, single-txn runner):
-- ALTER TABLE permit_trades DROP COLUMN IF EXISTS attachment_basis;
-- ALTER TABLE lead_trades  DROP COLUMN IF EXISTS attachment_basis;
-- (the mirror function reverts to the migrations/143 body — CREATE OR REPLACE from that file.)
