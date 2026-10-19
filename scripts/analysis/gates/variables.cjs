// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EB (b) (gate and tooling variables);
//            R-CV (the pinned form); R-DF EXTERNALIZED; R-DJ (2) (pre-commit stays file-only)
//
// THE ONE READER (CommonJS core; scripts/analysis/gates/variables.mjs is the ESM entry, and CJS
// tooling such as scripts/analysis/capture-step-golden.js requires this file directly) of a gate or tooling variable. A number a gate or a tooling script decides
// with is a registered logic variable (scripts/seeds/logic_variables.json, seeded by migration),
// never a literal in the code. It is read FILE-ONLY from the seed so pre-commit needs no
// database, and only in the R-CV pinned form (min === max === default): a bound changes by a
// reviewed seed + migration commit, never by an admin edit the gate cannot see.
//
// `gateVariable(name)` throws unless:
//   - the name carries a closed prefix (`gate_` or `tooling_`; runner-owned `step_*` variables
//     are resolved by the runner from the DB, never here);
//   - the seed has the key, with a finite numeric default;
//   - the entry is pinned (min === max === default).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const SEED_REL_PATH = 'scripts/seeds/logic_variables.json';
/** The closed set of prefixes a gate or tooling variable may carry. */
const GATE_VARIABLE_PREFIXES = Object.freeze(['gate_', 'tooling_']);

let cachedSeed = null;
function loadSeed() {
  if (!cachedSeed) cachedSeed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, SEED_REL_PATH), 'utf8'));
  return cachedSeed;
}

/**
 * The verdict for one name over a seed object. PURE.
 * @param {string} name
 * @param {Record<string, any>} seed
 * @returns {{ok: true, value: number} | {ok: false, reason: string}}
 */
function gateVariableDecision(name, seed) {
  if (typeof name !== 'string' || !GATE_VARIABLE_PREFIXES.some((p) => name.startsWith(p))) {
    return { ok: false, reason: `"${name}" is not a gate or tooling variable (prefix must be one of ${GATE_VARIABLE_PREFIXES.join(', ')})` };
  }
  const entry = seed && Object.prototype.hasOwnProperty.call(seed, name) ? seed[name] : undefined;
  if (!entry) return { ok: false, reason: `"${name}" is not registered in ${SEED_REL_PATH}` };
  const v = entry.default;
  if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, reason: `"${name}" has no finite numeric default` };
  if (entry.min !== v || entry.max !== v) {
    return { ok: false, reason: `"${name}" is not pinned (min ${entry.min}, max ${entry.max}, default ${v}; the R-CV form is min = max = default)` };
  }
  return { ok: true, value: v };
}

/**
 * A pinned gate/tooling variable's value, read from the committed seed. Throws on any refusal.
 * @param {string} name
 * @returns {number}
 */
function gateVariable(name) {
  const d = gateVariableDecision(name, loadSeed());
  if (!d.ok) throw new Error(`gateVariable: ${d.reason}`);
  return d.value;
}

/** In-memory fixtures, both directions. Throws on the first failure. */
function selfTest() {
  const seed = {
    gate_ok: { default: 7, min: 7, max: 7 },
    gate_loose: { default: 7, min: 1, max: 9 },
    tooling_ok: { default: 3, min: 3, max: 3 },
    step_runner: { default: 7, min: 7, max: 7 },
  };
  const fail = (m) => { throw new Error(`variables.mjs self-test FAILED: ${m}`); };
  if (gateVariableDecision('gate_ok', seed).value !== 7) fail('pinned gate_ variable must resolve');
  if (gateVariableDecision('tooling_ok', seed).value !== 3) fail('pinned tooling_ variable must resolve');
  if (gateVariableDecision('gate_loose', seed).ok) fail('an unpinned variable must be refused');
  if (gateVariableDecision('step_runner', seed).ok) fail('an unprefixed (runner) name must be refused');
  if (gateVariableDecision('gate_missing', seed).ok) fail('an unregistered name must be refused');
}

module.exports = { SEED_REL_PATH, GATE_VARIABLE_PREFIXES, gateVariableDecision, gateVariable, selfTest };
