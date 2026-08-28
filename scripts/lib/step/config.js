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
 *                    This fires ONLY for a value already sitting in a `logic_variables`
 *                    ROW that fails its bounds (on_invalid: "default" is a per-row
 *                    fallback). The seed file itself is BOOTSTRAP ONLY — never a
 *                    runtime fallback for a converted step — see LM-D15 below.
 *        `clamp`   → the violated bound, warn loudly. A non-finite value has no bound
 *                    to clamp toward, so it throws under `clamp` too.
 *   5. FREEZE. A compute that mutates its own threshold mid-run is a compute whose
 *      audit row means nothing.
 *
 * A DECLARED NAME THAT IS IN NO REGISTRY THROWS. Neither the DB nor the seed JSON
 * knows it, so there is nothing an operator could edit — it is a hidden literal
 * wearing a variable's name, which is the exact P1 failure this closes.
 *
 * A DECLARED NAME WITH NO `logic_variables` ROW ALSO THROWS, even when the seed
 * JSON has a default for it (LM-D15, Spec 122 §1.2a P4). `loadMarketplaceConfigs`
 * clones the seed defaults and overlays whatever DB rows exist — so a step whose
 * row was never inserted resolves through the seed clone silently, and the seed
 * value gets stamped into `records_meta.config` indistinguishable from a value an
 * operator actually edited. A seed bootstraps a fresh DB; it is not a live
 * registry, and it is never a substitute for one once a step is converted. Insert
 * the row with `node -r dotenv/config scripts/seeds/apply-logic-variables.js`
 * before the step can run.
 *
 * RULING R-A (2026-08-28, ADVERSARY DELTA): a RETIRED tunable (`descriptor.config.retired[]`)
 * is a declaration, never a live registry row — an operator-editable knob with zero
 * effect is a FALSE AFFORDANCE. This module reuses the SAME declared-names presence
 * SELECT above rather than opening a second query path: `$1` is widened to declared ∪
 * retired names, and any RETIRED name the query finds still present in `logic_variables`
 * is returned as `retiredPresent` for the runner to stamp as a `retired_var_row_present`
 * audit row — WARN while the row still exists, INFO once an operator has deleted it.
 * `resolveConfig` never reads or projects a retired variable's VALUE (`values`/`stamp`
 * only ever carry `cfg.logic_variables[]`, never `cfg.retired[]`) — presence is observed,
 * never consumed.
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
 * @returns {Promise<{values: Readonly<Record<string, number>>, stamp: Record<string, number>|null, retiredStatus: Array<{name: string, since: string, why: object, ledger: string, present: boolean}>, probeStatus: Array<{name: string, present: boolean}>}>}
 *   `values` is what becomes `ctx.config`; `stamp` is what becomes
 *   `records_meta.config` (null when the step declares `config: "none"`).
 *   `retiredStatus` (R-A) is every `cfg.retired[]` entry annotated with whether its
 *   `logic_variables` row still exists — always `[]` for a `config: "none"` step or
 *   a step that declares no `retired` entries.
 *   `probeStatus` (R-D) is every `cfg.probe_presence[]` name annotated the same way —
 *   a FLEET-WIDE presence probe, never a value this step consumes; always `[]` for a
 *   `config: "none"` step or one that declares no `probe_presence` entries.
 */
async function resolveConfig(pool, descriptor) {
  const slug = descriptor.identity.name;
  const cfg = descriptor.config;
  if (!cfg || cfg === NONE) {
    return { values: Object.freeze(Object.create(null)), stamp: null, retiredStatus: [], probeStatus: [] };
  }

  const { logicVars } = await loadMarketplaceConfigs(pool, slug, { quiet: true });

  // LM-D15 (Spec 122 §1.2a P4): `logicVars` above is the seed clone overlaid with
  // whatever DB rows exist — a declared name with NO row still resolves through
  // the seed and is indistinguishable from an operator-edited value once stamped.
  // Presence in the LIVE TABLE, not presence in `logicVars`, is what makes a
  // variable operator-editable, so it takes its own query: one SELECT, scoped to
  // exactly the names this step declares.
  //
  // R-A (2026-08-28, ADVERSARY DELTA): the SAME query answers a second question —
  // does a RETIRED name still hold a live row an operator could (wrongly) believe
  // does something? `$1` is widened to declared ∪ retired rather than opening a
  // second SELECT, because the presence signal for either kind of name is the
  // identical predicate over the identical table.
  //
  // R-D (2026-08-28): a THIRD question, same widening — does a FLEET-WIDE name this
  // step merely PROBES (never consumes as a value) have a row? assert_schema's
  // declared_logic_variables_present check is the first consumer: `$1` becomes
  // declared ∪ retired ∪ probe, still one query, because claim #175 ("the compute
  // issues no SQL") means the presence read has to happen HERE, in the library, and
  // be handed to the compute as `ctx.probePresence` — never queried by the compute.
  const declaredNames = cfg.logic_variables.map((decl) => decl.name);
  const retired = Array.isArray(cfg.retired) ? cfg.retired : [];
  const retiredNames = retired.map((r) => r.name);
  const probeNames = Array.isArray(cfg.probe_presence) ? cfg.probe_presence : [];
  const allNames = [...new Set([...declaredNames, ...retiredNames, ...probeNames])];
  let presentInDb = new Set();
  if (allNames.length > 0) {
    const { rows: presenceRows } = await pool.query(
      'SELECT variable_key FROM logic_variables WHERE variable_key = ANY($1)',
      [allNames],
    );
    presentInDb = new Set(presenceRows.map((r) => r.variable_key));
  }
  // EVERY retired entry gets an audit signal, not only the present ones — an
  // absent row is the AFFIRMATIVE evidence the retirement is complete, not
  // silence. `retiredStatus` carries the presence bit for the runner to render
  // as WARN (row still exists) / INFO (row is gone) via `retiredVarRow` below.
  const retiredStatus = retired.map((r) => ({ ...r, present: presentInDb.has(r.name) }));
  const probeStatus = probeNames.map((name) => ({ name, present: presentInDb.has(name) }));

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

    if (!presentInDb.has(name)) {
      const hasSeed = Object.prototype.hasOwnProperty.call(FALLBACK_LOGIC_VARS, name);
      throw new Error(
        `[${slug}] config: "${name}" is declared by the descriptor but has no logic_variables row ` +
          (hasSeed
            ? '(a seed default exists in scripts/seeds/logic_variables.json, but a seed is BOOTSTRAP ONLY — ' +
              'never a runtime fallback for a converted step). '
            : '(no seed default exists in scripts/seeds/logic_variables.json either). ') +
          'Run "node -r dotenv/config scripts/seeds/apply-logic-variables.js" to insert it, then re-run this step. ' +
          'Spec 122 §1.2a P4 — a seed-only value is not operator-editable.',
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

  return { values: Object.freeze(values), stamp, retiredStatus, probeStatus };
}

/**
 * The `retired_var_row_present` audit row for one `config.retired[]` entry (R-A).
 * WARN while the `logic_variables` row still exists (an operator has not deleted
 * the false affordance yet); INFO once it is gone — absence is the affirmative
 * evidence the retirement is complete, not silence. One row per retired entry, so
 * multiple retirements on one step never collide in the audit table.
 */
function retiredVarRow(entry) {
  return {
    metric: `retired_var_row_present:${entry.name}`,
    value: entry.present
      ? `"${entry.name}" (retired ${entry.since}, ${entry.ledger}) still has a live logic_variables row — an operator-editable knob with zero effect`
      : `"${entry.name}" (retired ${entry.since}, ${entry.ledger}) has no logic_variables row`,
    threshold: 'no logic_variables row for a retired name',
    status: entry.present ? 'WARN' : 'INFO',
  };
}

module.exports = { resolveConfig, retiredVarRow };
