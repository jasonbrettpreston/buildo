/**
 * `collectDeclaredLogicVariableNames()` — every DISTINCT `config.logic_variables[].name`
 * declared across every `scripts/steps/_schema/converted.json` step's descriptor.
 *
 * RULING R-D (2026-08-28) — "cloud parity is a chain-start assertion". `assert_schema`'s
 * new `declared_logic_variables_present` check needs this list to probe the `logic_variables`
 * table BEFORE any converted step runs, so a missing row is a chain-halting FAIL at minute
 * zero rather than LM-D15's mid-chain throw discovered however many steps later the first
 * affected step happens to sit.
 *
 * A PURE fs read — no DB, no network — so it lives OUTSIDE `scripts/lib/compute/`, where
 * `scripts/ast-grep-rules/compute-shape.yml`'s `compute-forbidden-require` rule bans `fs`
 * outright (Spec 122 §5.5 (3)): a compute reaches this list by requiring THIS pure library,
 * never by reading the filesystem itself.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2a P4 addendum (R-D)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');

/**
 * @returns {string[]} every declared name, deduplicated and sorted — `[]` when no
 *   converted step declares any config var, which is never actually reached in the
 *   fleet today (pilots 1-3 all declare at least one) but is a legal empty answer.
 */
function collectDeclaredLogicVariableNames() {
  const raw = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8'));
  const converted = Array.isArray(raw.converted) ? raw.converted : [];
  const names = new Set();
  for (const stepFile of converted) {
    const descriptorPath = path.join(REPO_ROOT, stepFile.replace(/\.js$/, '.descriptor.json'));
    // A missing/malformed entry here is `step-conformance.infra.test.ts`'s list-validity
    // finding (`converted ⊆ manifest`, `every entry exists on disk`) — never this reader's
    // to enforce a second time; a step this loose about has bigger problems than one check.
    if (!fs.existsSync(descriptorPath)) continue;
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    const cfg = descriptor.config;
    if (!cfg || cfg === 'none') continue;
    for (const decl of cfg.logic_variables || []) names.add(decl.name);
  }
  return [...names].sort();
}

module.exports = { collectDeclaredLogicVariableNames, CONVERTED_PATH };
