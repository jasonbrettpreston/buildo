-- 334: tooling_precommit_budget_registry_s re-pinned from 27.5 to 33.2 seconds (claimed ids/mig-334; task-406, lane BL-V2LIST).
--
-- History, one sentence each: the operator first approved 32.1 s (2026-11-20, "yes to all", MORNING-DECISIONS.md:1504, entry "2026-11-20 · Operator RULES on five open items", item 2 put to him as "2. Commit hook budget re-pinned to 32.1 seconds: recommended yes."); the fresh measurement with the new pre-commit stage was 33.19 s; the operator then confirmed 33.2 s (MORNING-DECISIONS.md:1526, entry "2026-11-20 · Operator CONFIRMS the pre-commit hook budget at 33.2 seconds": put to him "is the hook budget 33.2 seconds (recommended), or 32.1 with the hook trimmed?"; verbatim "yesThe hook budget: 33.2 seconds (recommended)"). The registry_s budget is re-pinned and the rule-list page check is wired into pre-commit (Spec 124 R-DJ (1), 124a R-EC; R-EB (b) form: a change of a pinned variable is a reviewed seed + migration commit).
-- The fresh measurement by scripts/analysis/precommit-budget.mjs --measure on 2026-11-20 (empty index, Mac mini) is registry_s 33.19 s (docs_only 22.84 s, inside its 25.3 s pin): docs/reports/generated/precommit-budget.json. The pin is that measurement rounded up to 0.1 s.
-- The seed (scripts/seeds/logic_variables.json, min = max = 33.2) is what the file-only gates read; this UPDATE brings an existing database to the same value and description. Written, not applied; rehearsed on the test stack first (MCINC-7).
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-EB, R-CV)
-- SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md (R-EC, R-DJ (2))

-- UP
UPDATE logic_variables
   SET variable_value = 33.2,
       description = 'McDonald''s Airtight V3 EXT-1 part c (operator y 2026-10-18; Spec 124 R-EC, R-DJ (2)): the time budget (seconds) for the file-only stages of .husky/pre-commit on a registry-input commit (step-validate selects the whole registry), measured per stage on the Mac mini (25.0 s x 1.10 on 2026-10-18). Re-pinned from 27.5 to 33.2 on 2026-11-20 (migration 334): the operator first approved 32.1 s (MORNING-DECISIONS.md:1504, item 2); the fresh measurement with the new pre-commit stage was registry_s 33.19 s (docs/reports/generated/precommit-budget.json); the operator then confirmed 33.2 s (MORNING-DECISIONS.md:1526: "yesThe hook budget: 33.2 seconds (recommended)"). Fast invariant #52 compares that file against it. Pinned min = max = 33.2 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/precommit-budget.mjs.'
 WHERE variable_key = 'tooling_precommit_budget_registry_s';

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 159, 283, 294, 296 and 316).
-- UPDATE logic_variables SET variable_value = 27.5 WHERE variable_key = 'tooling_precommit_budget_registry_s';
