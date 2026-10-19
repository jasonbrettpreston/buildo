-- 276: front-setback reliability — the switch and the oracle tolerance for front-yard averaging.
--
-- Operator ruling 2026-10-19 (Spec 69a M-205(1) dated note; Spec 131 LC-57; Spec 130 Q-B1): the averaged
-- neighbour front setback (10.5.40.70(1)) is used only where the estimates pass a tight reliability
-- threshold; otherwise the zone default front setback (x.40.70(1)) is used, the lot is flagged "needs
-- survey", and the averaging by-law is disclosed. The CoA-notice oracle put 27 % of averaged estimates
-- within 0.5 m (n = 219), so the switch starts at 0.
--
-- Numbered 276: 264/265 are held by the wave-1 lanes and 271/272/274/275 by the wave-4 lanes.
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (M-205(1)); docs/specs/01-pipeline/131_lot_configuration_policy.md (LC-57)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('fya_estimates_accepted', 0,
   'Front-setback reliability switch (operator ruling 2026-10-19; M-205(1); LC-57). 1 = use the averaged neighbour front setback where one or two qualifying neighbours are all est_status estimated; 0 = zone default front setback, needs survey, front_yard_needs_survey disclosed. Set to 1 only after the CoA-notice oracle meets fya_oracle_min_within_tol_pct within fya_oracle_tol_m. CONSUMED by scripts/analysis/bylaw/front-averaging.mjs.'),
  ('fya_oracle_tol_m', 0.5,
   'Front-setback reliability (Spec 130 Q-B1; operator ruling 2026-10-19): the largest difference (m) between an averaged neighbour front-setback estimate and the CoA examiner''s stated setback for it to count as accurate. CONSUMED by scripts/analysis/bylaw-validation/front-setback-oracle.cjs.'),
  ('fya_oracle_min_within_tol_pct', 90,
   'Front-setback reliability (Spec 130 Q-B1; operator ruling 2026-10-19): the share (%) of averaged estimates that must fall within fya_oracle_tol_m before fya_estimates_accepted may be set to 1. CONSUMED by scripts/analysis/bylaw-validation/front-setback-oracle.cjs.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- DELETE FROM logic_variables WHERE variable_key IN ('fya_estimates_accepted', 'fya_oracle_tol_m', 'fya_oracle_min_within_tol_pct');
