-- FK-EXEMPT: tracked_projects references permits via permit_num+revision_num — composite FK added separately; application enforces referential integrity.
-- Migration 089: Valuation Engine + Claiming System Schema
--
-- Adds infrastructure for:
--   1. trade_contract_values JSONB on cost_estimates — per-trade dollar
--      value breakdowns (e.g., {"plumbing": 45000, "hvac": 38000})
--   2. tracked_projects table — the claiming system ("My Projects" tab)
--
-- SPEC LINK: docs/reports/lifecycle_phase_implementation.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add JSONB trade allocation column to cost_estimates.
-- DEFAULT '{}' is instant in Postgres 11+ (stored in pg_attribute,
-- not written to every existing row).
ALTER TABLE cost_estimates
  ADD COLUMN trade_contract_values JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Claiming system: tracked_projects
--
-- user_id is VARCHAR(128), NOT UUID. Firebase Auth UIDs are 28-char
-- base64 strings that fail UUID type validation. This matches the
-- project convention established in migrations 010/070/075/076 and
-- documented in docs/adr/006-firebase-uid-not-fk.md.
-- WF3 Bug 1 fix (both reviewers, 100% confidence).
CREATE TABLE tracked_projects (
  id            SERIAL PRIMARY KEY,
  user_id       VARCHAR(128) NOT NULL,
  permit_num    VARCHAR(30) NOT NULL,
  revision_num  VARCHAR(10) NOT NULL,
  trade_slug    VARCHAR(50) NOT NULL,
  status        VARCHAR(50) NOT NULL DEFAULT 'claimed_unverified'
    CONSTRAINT chk_tracked_status
    CHECK (status IN ('claimed_unverified', 'verified', 'expired')),
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- WF3 Bug 3: updated_at tracks status transitions (claimed →
  -- verified → expired). Enables expiry jobs, admin analytics,
  -- and debugging. Set on every UPDATE via application layer.
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent double-claiming: one user can claim one trade per permit
  -- revision. revision_num IS included because revisions can represent
  -- materially different scopes (new build vs addition). This matches
  -- the project's composite PK convention (permit_num, revision_num).
  -- Adversarial review correctly identified that dropping revision_num
  -- would collapse different projects into one claimable slot.
  CONSTRAINT uq_tracked_user_permit_trade
    UNIQUE (user_id, permit_num, revision_num, trade_slug)
);

-- "My Projects" query: all claims for a given user
CREATE INDEX idx_tracked_projects_user
  ON tracked_projects (user_id, claimed_at DESC);

-- Admin / analytics: all claims for a given permit
CREATE INDEX idx_tracked_projects_permit
  ON tracked_projects (permit_num, revision_num);

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS tracked_projects;
-- ALTER TABLE cost_estimates DROP COLUMN IF EXISTS trade_contract_values;
