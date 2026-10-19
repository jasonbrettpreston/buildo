// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EB (b) (gate and tooling variables); R-CV
//
// ESM entry for the ONE gate/tooling variable reader. The implementation lives in variables.cjs so
// CommonJS tooling (scripts/analysis/capture-step-golden.js) reads through the same code.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('./variables.cjs');

export const { SEED_REL_PATH, GATE_VARIABLE_PREFIXES, gateVariableDecision, gateVariable, selfTest } = core;
