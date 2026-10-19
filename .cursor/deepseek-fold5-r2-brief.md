---
write_scope:
- .cursor/deepseek-fold5-r2.md
allow_commit: false
---
# Output panel round 2 (Spec 08): verify the item-5 fold landed and broke nothing

READ-ONLY except `.cursor/deepseek-fold5-r2.md`. Do not commit.

Read `.cursor/maxbld-fold5-compliance-2026-10-18.md` (the claims). For each "fixed" or "ruled" claim, open the cited file and confirm the text now says it. Act as three reviewers:
1. **Reality check** — does each claim hold in the files? Quote the line (file:line).
2. **Regression guardian** — search for leftovers that contradict the rulings, across `docs/specs/01-pipeline/78_optimal_lot_configuration.md`, `69a_mcbylaw_register.md`, `131_lot_configuration_policy.md`, `docs/reference/maxbld-field-lineage.json`, `docs/reference/envelope-answer-dispositions.json`. At minimum grep: `soft_landscaping` (must not be a `suite_binding` value or a cap on the suite), `one_storey_extension` / `M-206` (must not apply to new-build rows D/H/S/2), `nearby_coa_applications` (only as withdrawn), `drafted ruling`, `PROPOSED`, `operator to confirm`, `pending operator`, `lot_viability_margin\b` (renamed), `10.20.40.10(8)` (never as a GFA exclusion), INV-11 formula, `host unit`, `§6.5 rule 8`.
3. **Cross-read adversary** — for LC-49, LC-51, LC-52 and M-206/M-207/M-208 as amended: is any of them inconsistent with another row, with Spec 78 §6.4 (M-65) or §P3C.2, or does any add scope (a new field, scenario or data source)? Check the LC-52 lint rule in `scripts/analysis/bylaw/maxbld-trace-lib.mjs` (`lintDisclosureTemplates`) would catch an unglossed GFA/FSI/CoA/established grade.
Output: a findings list, each `BLOCKER / MAJOR / MINOR / OK` with file:line and quote. Write an early draft by iteration 20.
