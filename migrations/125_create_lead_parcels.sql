-- 125: lead_parcels — unified spatial-linkage ledger keyed on lead_id.
--
-- Replaces permit_parcels (Phase H drop). Holds permit-side and CoA-side
-- parcel matches with the same match_type / confidence schema.
--
-- Spec 42 §6.6.A.1 Option C: lead_id format CHECK enforced.
--
-- parcel_id is INTEGER (matching parcels.id SERIAL, which is INTEGER under
-- the hood). BIGINT would cause FK creation to fail — R2.v1 DeepSeek caught
-- this type mismatch in an earlier draft of the canonical DDL.
--
-- Phase B is purely additive. permit_parcels stays live through Phase G.
-- Phase C migrates link-parcels.js + seed-parcels.js + create-pre-permits.js
-- writers to lead_parcels. Phase H drops permit_parcels.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_parcels (
    lead_id         TEXT            NOT NULL CHECK (lead_id ~ '^(permit|coa):.+$'),
    parcel_id       INTEGER         NOT NULL REFERENCES parcels(id),
    match_type      VARCHAR(20)     NOT NULL,
    confidence      DECIMAL(3,2)    NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    matched_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lead_id, parcel_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_parcels_parcel ON lead_parcels (parcel_id);
CREATE INDEX IF NOT EXISTS idx_lead_parcels_lead   ON lead_parcels (lead_id);

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration erases unified parcel-linkage storage. The
-- legacy permit_parcels table remains intact (untouched by this phase);
-- permit-side spatial linkage continues to function. CoA-side linkage is
-- not yet wired (Phase D); no data loss.
--
-- To roll back manually:
--
--   DROP INDEX IF EXISTS idx_lead_parcels_lead;
--   DROP INDEX IF EXISTS idx_lead_parcels_parcel;
--   DROP TABLE IF EXISTS lead_parcels;
--
-- Then revert any Phase C consumers (link-parcels.js, seed-parcels.js,
-- create-pre-permits.js) to their pre-Phase-C permit_parcels targets.
