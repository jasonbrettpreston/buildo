-- Migration 021: Add scope_source column for BLD→companion propagation tracking
-- Values: 'classified' (own tags from classifyScope), 'propagated' (copied from BLD family member)

-- UP
ALTER TABLE permits ADD COLUMN IF NOT EXISTS scope_source VARCHAR(20) DEFAULT 'classified';

-- DOWN
-- ALTER TABLE permits DROP COLUMN IF EXISTS scope_source;
