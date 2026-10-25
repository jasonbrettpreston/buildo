-- 291: classify_permit_phase (scripts/classify-permit-phase.js) — the converted step's logic variables (C6-2, commit ②).
--
-- McDonald's Airtight V3 (Spec 132 §core.8 (R-CV, R-DE): EXTERNALIZED, step-owned `<slug>_<name>` names; defect
-- CPP-D3). The converted step (scripts/classify-permit-phase.descriptor.json) reads three variables:
--   classify_permit_phase_issued_date_floor_year     1970  (the epoch-default cutoff, formerly the SQL literal
--                                                         issued_date < '1970-01-02', classify-permit-phase.js:46, :59;
--                                                         issued_date is a DATE, so issued_date <= make_date(1970,1,1)
--                                                         selects the same rows; a definitional constant, min = max)
--   classify_permit_phase_heartbeat_minutes             5  (the ENRICHER runner's heartbeat interval, ER-D1)
--   classify_permit_phase_lock_timeout_ms         1800000  (SET LOCAL lock_timeout for the shared transaction)
--
-- All three names are NEW (the legacy script reads no logic variable), so there is no copy-window row to carry:
-- commit ② lands at stage compute_ported (Spec 132 §x-stages.2 (R-EQ)) and the legacy shell keeps its literals until
-- the swap. The rows must exist before the swap: the runner's presence check throws above the lock on a missing row.
--
-- ORDERING (trap 7): the legacy script reads no logic variable, so a PRE captured on the legacy shell stays valid
-- whether or not this migration has been applied.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md (core.8)
-- SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (step 4)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('classify_permit_phase_issued_date_floor_year', 1970,
   'classify_permit_phase: a base-revision Inspection permit whose issued_date is on or before 1 January of this year counts as having no issued date (an epoch default from bad municipal ETL). Formerly the SQL literal 1970-01-02. Pinned min = max (Spec 132 core.8; CPP-D3). CONSUMED by classify_permit_phase via ctx.config.'),
  ('classify_permit_phase_heartbeat_minutes', 5,
   'classify_permit_phase: heartbeat interval (minutes) for the ENRICHER runner whole-step ticker (execution.heartbeat_minutes_from_config). Default 5 mirrors geocode_permits_heartbeat_minutes. CONSUMED by classify_permit_phase.'),
  ('classify_permit_phase_lock_timeout_ms', 1800000,
   'classify_permit_phase: SET LOCAL lock_timeout (ms) for the step shared transaction (execution.lock_timeout_ms_from_config). 0 = disabled. Default 1800000 mirrors geocode_permits_lock_timeout_ms. CONSUMED by classify_permit_phase.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key IN ('classify_permit_phase_issued_date_floor_year', 'classify_permit_phase_heartbeat_minutes', 'classify_permit_phase_lock_timeout_ms');
