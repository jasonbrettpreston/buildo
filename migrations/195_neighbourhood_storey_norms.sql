-- 195: neighbourhood_storey_norms — permit-derived storey norms per neighbourhood (Spec 65 §8 / WF3-C1).
--
-- A recomputed snapshot (truncate-replace by compute-storey-norms.js) of the typical (p50) and
-- aggressive (p90) storey counts ACTUALLY built per neighbourhood, extracted from new-build permit
-- descriptions (building-permit types only; deduped per dominant parcel). WF3-C2 consumes it to
-- replace the height÷3.0 "derived" max_build_stories guess.
--
-- MARKET-REALIZED, NOT LEGAL: permit data skews to maximizers (teardown-rebuilds max the envelope),
-- so these are the realized ceiling, not the by-law limit. data_provenance + the table COMMENT make
-- that explicit; C2 caps by the by-law height envelope + flags market>by-law as a CoA hotspot.
--
-- neighbourhood_id = neighbourhoods.id (the SERIAL the permits FK targets — NOT the open-data
-- neighbourhood_id). A single row with neighbourhood_id = NULL is the citywide fallback (FK allows
-- NULL; a PARTIAL UNIQUE INDEX enforces exactly one such row — a plain UNIQUE would not, since
-- Postgres treats NULLs as distinct).
-- Rollback is comments-only per Rule 6 (single-txn runner); see the trailer.

-- UP
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS neighbourhood_storey_norms (
    id                SERIAL PRIMARY KEY,
    neighbourhood_id  INTEGER UNIQUE REFERENCES neighbourhoods(id),  -- NULL row = citywide fallback
    storeys_p50       INTEGER,
    storeys_p90       INTEGER,
    sample_count      INTEGER NOT NULL,
    low_sample        BOOLEAN NOT NULL DEFAULT false,                -- sample_count < min → C2 uses citywide
    data_provenance   TEXT NOT NULL DEFAULT 'market_realized_new_builds',
    computed_at       TIMESTAMPTZ
);

-- Exactly ONE citywide row (neighbourhood_id IS NULL) — a plain UNIQUE does not enforce this for NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS neighbourhood_storey_norms_citywide_singleton
    ON neighbourhood_storey_norms ((neighbourhood_id IS NULL))
    WHERE neighbourhood_id IS NULL;

COMMENT ON TABLE neighbourhood_storey_norms IS 'Spec 65 §8 (WF3-C1): empirical new-build storey norms (p50/p90) per neighbourhood from permit descriptions. MARKET-REALIZED (maximizer bias) — NOT a legal ceiling. neighbourhood_id NULL row = citywide fallback.';
COMMENT ON COLUMN neighbourhood_storey_norms.storeys_p50 IS 'Typical realized storeys (median of deduped new-build permits in the pocket).';
COMMENT ON COLUMN neighbourhood_storey_norms.storeys_p90 IS 'Aggressive realized ceiling (90th percentile) — drives the C2 max_build_stories_aggressive + market>by-law hotspot.';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- DROP INDEX IF EXISTS neighbourhood_storey_norms_citywide_singleton;
-- DROP TABLE IF EXISTS neighbourhood_storey_norms;
