-- Migration 050: Clean up chain-prefixed stale scope slugs from pipeline_runs
-- Migration 049 cleaned unprefixed slugs (classify_scope_class, classify_scope_tags)
-- but missed the chain-prefixed versions (permits:classify_scope_class, permits:classify_scope_tags).
-- These ~38 stale rows trigger false "slow pipeline" warnings on the dashboard.

-- UP
DELETE FROM pipeline_runs WHERE pipeline LIKE '%classify_scope_class%';
DELETE FROM pipeline_runs WHERE pipeline LIKE '%classify_scope_tags%';

-- DOWN
-- No-op: deleted rows are stale historical data from deprecated pipeline slugs.
-- They have no operational value and cannot be meaningfully restored.
