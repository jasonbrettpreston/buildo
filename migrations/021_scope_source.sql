-- Migration 021: Add scope_source column for BLD→companion propagation tracking
-- Values: 'classified' (own tags from classifyScope), 'propagated' (copied from BLD family member)

ALTER TABLE permits ADD COLUMN scope_source VARCHAR(20) DEFAULT 'classified';
