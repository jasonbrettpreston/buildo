-- Migration 109: Enable pg_stat_statements extension
-- Provides per-query execution statistics (mean_exec_time, total_exec_time, calls, rows).
-- Used by observe-chain.js to surface top 10 slowest queries to the AI analyst.
-- Cloud SQL for PostgreSQL pre-loads this in shared_preload_libraries by default.
-- On self-hosted Postgres, add pg_stat_statements to shared_preload_libraries first.

-- UP
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- DOWN
-- DROP EXTENSION IF EXISTS pg_stat_statements;
-- NOTE: Dropping this extension removes all accumulated query statistics. Only run if
--       no other tooling or monitoring depends on pg_stat_statements data.
