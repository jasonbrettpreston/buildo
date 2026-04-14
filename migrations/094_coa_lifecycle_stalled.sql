-- Migration 094: CoA Applications lifecycle_stalled column
--
-- Adds `lifecycle_stalled BOOLEAN` to `coa_applications` so the lifecycle
-- classifier can flag CoA applications that have been inactive for longer
-- than `logic_variables.coa_stall_threshold` (seeded as 30 days).
--
-- Enables the CRM Assistant (spec 82) to trigger "Stall Alert" notifications
-- for users tracking pre-permit leads where the CoA is stuck in zoning.
--
-- SPEC LINK: docs/specs/product/future/82_crm_assistant_alerts.md §4
-- SPEC LINK: docs/specs/product/future/86_control_panel.md §1

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE coa_applications
  ADD COLUMN lifecycle_stalled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN coa_applications.lifecycle_stalled IS
  'True when the CoA has been inactive longer than coa_stall_threshold (days) from logic_variables. Set by classify-lifecycle-phase.js; consumed by CRM Assistant for stall alerts.';

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS lifecycle_stalled;
