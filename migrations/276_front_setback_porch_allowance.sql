-- 276: fya_porch_allowance_m — the porch allowance for front-yard averaging.
--
-- Operator ruling 2026-10-19 (Spec 69a M-205(1) dated note; Spec 131 LC-58; Spec 130 Q-B1): where
-- 10.5.40.70(1) averaging applies, the front setback is max(averaged neighbour estimate + this allowance, the
-- zone's x.40.70(1) default), always flagged "needs survey". The estimates are measured to building outlines
-- that take in porches and steps; against 219 CoA notices they sit at or below the examiner's figure 89 % of
-- the time. At 1.0 m the rule's mean error is 1.39 m (6.0 m alone: 2.53 m).
--
-- Numbered 276: 264/265 are held by the wave-1 lanes and 271/272/274/275 by the wave-4 lanes.
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (M-205(1)); docs/specs/01-pipeline/131_lot_configuration_policy.md (LC-58)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('fya_porch_allowance_m', 1.0,
   'Front-yard averaging porch allowance (operator ruling 2026-10-19; M-205(1); LC-58): where 10.5.40.70(1) averaging applies, front setback = max(averaged neighbour estimate + this allowance, the zone x.40.70(1) default), always needs survey. CONSUMED by scripts/analysis/bylaw/front-averaging.mjs and scripts/analysis/bylaw-validation/front-setback-oracle.cjs.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- DELETE FROM logic_variables WHERE variable_key = 'fya_porch_allowance_m';
