-- 199: neighbourhood_build_norms — permit-derived build/reno norms per neighbourhood (Spec 78 Phase 1).
--
-- A recomputed snapshot (truncate-replace by compute-build-norms.js) of what's ACTUALLY built/renovated
-- per neighbourhood over the 5-year permit window: realized FSI (p50/p90), build-ratios (NEW-build +
-- OLD-stock), reno-% (scope-classified kitchen/bath), storey norms, and CoA approval. The calibration
-- layer the optimal-config reads (max-build storeys, the current-GFA range, the CoA-upside, reno scope).
--
-- MARKET-REALIZED, NOT LEGAL: permit data skews to maximizers — these are realized, not by-law limits.
-- neighbourhood_id = neighbourhoods.id (the SERIAL; ON DELETE CASCADE). A single neighbourhood_id = NULL
-- row is the citywide fallback (a PARTIAL UNIQUE INDEX enforces exactly one — a plain UNIQUE would not,
-- since Postgres treats NULLs as distinct). Rollback comments-only per Rule 6 (single-txn runner).

-- UP
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS neighbourhood_build_norms (
    id                        SERIAL PRIMARY KEY,
    neighbourhood_id          INTEGER UNIQUE REFERENCES neighbourhoods(id) ON DELETE CASCADE,  -- NULL = citywide fallback
    window_start              DATE,
    window_end                DATE,
    new_builds_5yr            INTEGER NOT NULL DEFAULT 0,
    additions_5yr             INTEGER NOT NULL DEFAULT 0,
    renos_5yr                 INTEGER NOT NULL DEFAULT 0,
    suites_5yr                INTEGER NOT NULL DEFAULT 0,
    demos_5yr                 INTEGER NOT NULL DEFAULT 0,
    realized_fsi_p50          NUMERIC,   -- RESIDENTIAL ÷ lot among new builds
    realized_fsi_p90          NUMERIC,
    realized_coverage_p50     NUMERIC,   -- on-inquiry/derived (plans); usually NULL in bulk
    realized_coverage_p90     NUMERIC,
    build_ratio_p50           NUMERIC,   -- NEW-build GFA ÷ max-build (≈0.80)
    existing_build_ratio_p25  NUMERIC,   -- OLD-stock (1 − addition_Δ ÷ max-build); drives cur_gfa_low
    existing_build_ratio_p50  NUMERIC,   -- OLD-stock (≈0.62); drives cur_gfa_high — NOT the new-build ratio
    reno_kitchen_pct          NUMERIC,   -- scope-classified KIT permit area ÷ home GFA
    reno_bath_pct             NUMERIC,   -- scope-classified BTH
    storeys_p50               INTEGER,
    storeys_p90               INTEGER,
    coa_approved              INTEGER NOT NULL DEFAULT 0,
    coa_refused               INTEGER NOT NULL DEFAULT 0,
    coa_total                 INTEGER NOT NULL DEFAULT 0,
    coa_approval_rate         NUMERIC,
    reno_mix                  JSONB,     -- { new_build, addition, gut, kitchen, bath, suite } counts
    sample_n                  INTEGER NOT NULL DEFAULT 0,
    low_sample                BOOLEAN NOT NULL DEFAULT false,  -- sample_n < min → optimal-config uses citywide
    data_provenance           TEXT NOT NULL DEFAULT 'market_realized_5yr',
    computed_at               TIMESTAMPTZ
);

-- Exactly ONE citywide row (neighbourhood_id IS NULL) — a plain UNIQUE does not enforce this for NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS neighbourhood_build_norms_citywide_singleton
    ON neighbourhood_build_norms ((neighbourhood_id IS NULL))
    WHERE neighbourhood_id IS NULL;

COMMENT ON TABLE neighbourhood_build_norms IS 'Spec 78 Phase 1: realized build/reno norms (5-yr window) per neighbourhood from permits — FSI, build-ratios (new-build + old-stock), reno-%, storey norms, CoA approval. MARKET-REALIZED (maximizer bias), NOT a legal ceiling. neighbourhood_id NULL = citywide fallback. Recomputed snapshot.';
COMMENT ON COLUMN neighbourhood_build_norms.existing_build_ratio_p50 IS 'OLD-STOCK ratio = median(clamp(1 − addition_delta ÷ max_build_gfa, 0, 1)) — the pre-reno current-home fraction of max-build (≈0.62). Drives the cur_gfa range; distinct from build_ratio_p50 (new-build, ≈0.80).';
COMMENT ON COLUMN neighbourhood_build_norms.build_ratio_p50 IS 'NEW-build realized footprint/GFA ÷ max-build (≈0.80). NOT for the current-home estimate (use existing_build_ratio).';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- DROP INDEX IF EXISTS neighbourhood_build_norms_citywide_singleton;
-- DROP TABLE IF EXISTS neighbourhood_build_norms;
