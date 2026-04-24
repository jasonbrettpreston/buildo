-- Migration 019: Permit Scope Classification
-- Adds project_type (what kind of project) and scope_tags (what specifically
-- is being built/changed) to permits for work-scope filtering and analytics.

-- UP
ALTER TABLE permits ADD COLUMN IF NOT EXISTS project_type VARCHAR(20);
ALTER TABLE permits ADD COLUMN IF NOT EXISTS scope_tags TEXT[];
ALTER TABLE permits ADD COLUMN IF NOT EXISTS scope_classified_at TIMESTAMPTZ;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_project_type ON permits (project_type) WHERE project_type IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_scope_tags ON permits USING GIN (scope_tags) WHERE scope_tags IS NOT NULL;

-- DOWN
-- DROP INDEX IF EXISTS idx_permits_scope_tags;
-- DROP INDEX IF EXISTS idx_permits_project_type;
-- ALTER TABLE permits DROP COLUMN IF EXISTS scope_classified_at;
-- ALTER TABLE permits DROP COLUMN IF EXISTS scope_tags;
-- ALTER TABLE permits DROP COLUMN IF EXISTS project_type;
