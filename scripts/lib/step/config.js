/**
 * `ctx.config` — the ONE seam a compute reads a tunable through (Spec 122 §1.2a P4).
 *
 * P4 is a DIRECTIVE, not a preference: "every threshold, sample size, byte window,
 * timeout, retry count, limit, or rate a step consumes is a registered logic
 * variable, editable in admin — never a literal in compute". This module is the
 * runtime half of that. The static half is `scripts/ast-grep-rules/compute-shape.yml`
 * (a numeric-literal tunable in a compute is a build failure) and the declaration
 * half is the descriptor's `config` category.
 *
 * WHAT IT DOES, in order:
 *   1. `config: "none"` → returns an EMPTY frozen object and NO stamp. A step that
 *      consumes zero tunables costs zero bytes; a step that consumes one and
 *      declares "none" is caught by the conformance suite, not here.
 *   2. one `loadMarketplaceConfigs(pool, slug, { quiet: true })` — the same loader
 *      every other pipeline script uses, so the operator edits ONE table. Flat in
 *      N: one SELECT for the whole run, whatever the step's row count (§1.2a P3).
 *   3. PROJECTION. The returned object carries ONLY the declared names. This is what
 *      `validation: "strict"` MEANS operationally — a compute cannot reach a variable
 *      the descriptor did not declare, because the projection never contains it.
 *      Not a checker that could be skipped; an object that does not have the key.
 *   4. bounds + `on_invalid`, per declared variable:
 *        `fail`    → THROW, before compute, before any observation exists.
 *        `default` → the SEED default (scripts/seeds/logic_variables.json), warn loudly.
 *        `clamp`   → the violated bound, warn loudly. A non-finite value has no bound
 *                    to clamp toward, so it throws under `clamp` too.
 *   5. FREEZE. A compute that mutates its own threshold mid-run is a compute whose
 *      audit row means nothing.
 *
 * A DECLARED NAME THAT IS IN NO REGISTRY THROWS. Neither the DB nor the seed JSON
 * knows it, so there is nothing an operator could edit — it is a hidden literal
 * wearing a variable's name, which is the exact P1 failure this closes.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2a P4, §5.5
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1, §4.2
 */
'use strict';

const pipeline = require('../pipeline');
const { loadMarketplaceConfigs, FALLBACK_LOGIC_VARS } = require('../config-loader');

/** The category's null form, shared by every field that can opt out. */
const NONE = 'none';

/** `min`/`max` are `number | "none"`; "none" means unbounded on that side. */
function boundOf(v) {
  return v === NONE || v === undefined ? null : v;
}

/** Why a raw value is unusable — or null when it is fine. */
function invalidReason(raw, min, max) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 'non_finite';
  if (min !== null && raw < min) return 'below_min';
  if (max !== null && raw > max) return 'above_max';
  return null;
}

/**
 * Resolve `descriptor.config` against the live logic-variable registry.
 *
 * @param {import('pg').Pool} pool
 * @param {object} descriptor - already AJV-validated by `pipeline.step()`
 * @returns {Promise<{values: Readonly<Record<string, number>>, stamp: Record<string, number>|null}>}
 *   `values` is what becomes `ctx.config`; `stamp` is what becomes
 *   `records_meta.config` (null when the step declares `config: "none"`).
 */
async function resolveConfig(pool, descriptor) {
  const slug = descriptor.identity.name;
  const cfg = descriptor.config;
  if (!cfg || cfg === NONE) {
    return { values: Object.freeze(Object.create(null)), stamp: null };
  }

  const { logicVars } = await loadMarketplaceConfigs(pool, slug, { quiet: true });
  const values = Object.create(null);
  const stamp = {};

  for (const decl of cfg.logic_variables) {
    const name = decl.name;
    const known =
      Object.prototype.hasOwnProperty.call(logicVars, name) ||
      Object.prototype.hasOwnProperty.call(FALLBACK_LOGIC_VARS, name);
    if (!known) {
      throw new Error(
        `[${slug}] config: "${name}" is declared by the descriptor but exists in NO registry ` +
          '(neither logic_variables nor scripts/seeds/logic_variables.json). Seed it before consuming it — ' +
          'a name no operator can edit is a hidden literal (Spec 122 §1.2a P4).',
      );
    }

    const min = boundOf(decl.min);
    const max = boundOf(decl.max);
    const raw = logicVars[name];
    const reason = invalidReason(raw, min, max);

    if (reason === null) {
      values[name] = raw;
      stamp[name] = raw;
      continue;
    }

    const bounds = `[${min === null ? '-inf' : min}, ${max === null ? '+inf' : max}]`;
    const seeded = FALLBACK_LOGIC_VARS[name];

    if (decl.on_invalid === 'fail') {
      throw new Error(
        `[${slug}] config: "${name}" = ${JSON.stringify(raw)} is ${reason} for bounds ${bounds} ` +
          '— on_invalid "fail" refuses the step rather than computing on a value the operator did not mean.',
      );
    }

    if (decl.on_invalid === 'clamp') {
      if (reason === 'non_finite') {
        throw new Error(
          `[${slug}] config: "${name}" = ${JSON.stringify(raw)} is non-finite — ` +
            'on_invalid "clamp" has no bound to clamp a non-number toward.',
        );
      }
      const clamped = reason === 'below_min' ? min : max;
      pipeline.log.warn(
        `[${slug}]`,
        `config: "${name}" = ${JSON.stringify(raw)} is ${reason} for bounds ${bounds} — clamped to ${clamped}`,
      );
      values[name] = clamped;
      stamp[name] = clamped;
      continue;
    }

    // on_invalid: "default" — the SEED default, which the parity lock pins to the
    // pre-externalization literal, so a bad operator edit degrades to the old behaviour.
    if (invalidReason(seeded, min, max) !== null) {
      throw new Error(
        `[${slug}] config: "${name}" = ${JSON.stringify(raw)} is ${reason} for bounds ${bounds}, and its ` +
          `seed default ${JSON.stringify(seeded)} is not usable either — on_invalid "default" has nothing to fall back to.`,
      );
    }
    pipeline.log.warn(
      `[${slug}]`,
      `config: "${name}" = ${JSON.stringify(raw)} is ${reason} for bounds ${bounds} — using seed default ${seeded}`,
    );
    values[name] = seeded;
    stamp[name] = seeded;
  }

  return { values: Object.freeze(values), stamp };
}

module.exports = { resolveConfig };
