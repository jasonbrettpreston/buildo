-- UP
-- Enable trigram fuzzy string matching for WSIB Tier 3 entity resolution.
-- Replaces bi-directional LIKE (Cartesian bomb: 121K × 3.6K = 436M comparisons)
-- with similarity() + GIN indexes for O(1) candidate lookup.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes for trigram similarity queries
-- CONCURRENTLY avoids table locks on large tables (§3.1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entities_name_trgm
  ON entities USING GIN (name_normalized gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wsib_trade_trgm
  ON wsib_registry USING GIN (trade_name_normalized gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wsib_legal_trgm
  ON wsib_registry USING GIN (legal_name_normalized gin_trgm_ops);

-- DOWN
-- DROP INDEX IF EXISTS idx_entities_name_trgm;
-- DROP INDEX IF EXISTS idx_wsib_trade_trgm;
-- DROP INDEX IF EXISTS idx_wsib_legal_trgm;
-- DROP EXTENSION IF EXISTS pg_trgm;
