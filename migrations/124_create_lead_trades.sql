-- 124: lead_trades — unified trade-classification ledger keyed on lead_id.
--
-- Replaces permit_trades (Phase H drop). Holds tier-1/2/3 trade tagging for
-- both permit-side leads ('permit:<num>:<rev>') and CoA-side leads ('coa:<application_number>').
--
-- Spec 42 §6.6.A.1 Option C: every lead-bearing row gets a canonical lead_id;
-- this table is one of the four new tables that key on it. The CHECK
-- constraint enforces the format at write time — there is no cross-table FK
-- (lead_id targets either permits OR coa_applications, which a single FK
-- cannot express). The orphan-audit view in migration 137 detects rows
-- pointing to nonexistent parents.
--
-- Spec 42 §6.6.B canonical DDL. tier IN (1,2,3) for permit-side, always
-- 3 for CoA-side (description-only matching). confidence is 0-1.
--
-- This phase is purely additive. permit_trades remains the live writer for
-- classify-permits.js / link-parcels.js / etc. through Phase G; Phase C
-- migrates those writers to lead_trades. Phase H drops permit_trades.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_trades (
    id              SERIAL          PRIMARY KEY,
    lead_id         TEXT            NOT NULL CHECK (lead_id ~ '^(permit|coa):.+$'),
    trade_id        INTEGER         NOT NULL REFERENCES trades(id),
    tier            INTEGER         CHECK (tier IS NULL OR tier IN (1, 2, 3)),
    confidence      DECIMAL(3,2)    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    is_active       BOOLEAN         NOT NULL DEFAULT true,
    phase           VARCHAR(20),
    lead_score      INTEGER         NOT NULL DEFAULT 0,
    classified_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (lead_id, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_trades_trade  ON lead_trades (trade_id);
CREATE INDEX IF NOT EXISTS idx_lead_trades_active ON lead_trades (is_active);
CREATE INDEX IF NOT EXISTS idx_lead_trades_lead   ON lead_trades (lead_id);

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration erases unified trade-classification storage.
-- The legacy permit_trades table remains intact (untouched by this phase),
-- so permit-side classification continues to function. CoA-side
-- classification is not yet wired (Phase D); no data loss.
--
-- To roll back manually:
--
--   DROP INDEX IF EXISTS idx_lead_trades_lead;
--   DROP INDEX IF EXISTS idx_lead_trades_active;
--   DROP INDEX IF EXISTS idx_lead_trades_trade;
--   DROP TABLE IF EXISTS lead_trades;
--
-- Then revert the Phase C consumers (classify-permits.js,
-- backfill-realtor-permit-trades.js, reclassify-all.js) to their
-- pre-Phase-C permit_trades targets.
