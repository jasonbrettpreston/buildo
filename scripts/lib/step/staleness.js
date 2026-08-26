/**
 * `staleness` — the PRE-ACQUISITION half of the gating axis (Spec 122 §1.5, LG-3).
 *
 * Spec 122 §1.5 reshaped the scalar `pending` into three axes, and `trigger` is a
 * SET ordered by lifecycle position. This module owns exactly one of those
 * positions: `pre_acquisition` — the HEAD/ETag comparison a loader makes BEFORE it
 * downloads anything. The `post_acquisition` content-hash gate deliberately does
 * NOT live here: it can only be evaluated once the bytes have been hashed, so it
 * belongs to the acquisition seam and has exactly ONE home, `./acquire.js`
 * (Fold B item 3 — two homes for one gate is how a fence gets silently unlocked).
 *
 * Until this file existed, `staleness` was declared by the schema and read by
 * nothing (`grep -rn "staleness" scripts/lib/step/` returned 0), while every
 * loader hand-rolled its own copy of the same decision.
 *
 * THE FORCE OVERRIDE (ruling A-3, LG-10). `override.force_run` names an env var
 * that bypasses BOTH triggers. It exists because a source can be frozen upstream
 * for years — the Ravine archive has not changed since 2022-03-14, so 8 of 8
 * recorded runs took the tier-1 skip and the write path was UNREACHABLE, which
 * makes a write-class differential unprovable. `force_run` is not a cadence knob:
 * it proves the write path and serves a deliberate operator reload, nothing else.
 * A forced run still reports every check and still writes the same rows.
 *
 * FAIL-SAFE DIRECTION, inherited from scripts/lib/source-version.js: every
 * ambiguous input (no prior run, no validators, a malformed prior block) resolves
 * to LOAD, never to skip. A gate that skips when it cannot tell is a gate that
 * hides an outage as a green run.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.5, §1.2a P1
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §9.5 (the two-tier gate)
 */
'use strict';

const sourceVersion = require('../source-version');

/** The env value that arms an override. `'1'`, exactly — never truthiness. */
const OVERRIDE_ON = '1';

/** The category's null form. */
const NONE = 'none';

/** `staleness.on_prior_run_error` — the two declared postures, and the absent default. */
const POSTURE_FAIL = 'fail_step';
const POSTURE_WARN_ROW = 'warn_row';
/** The audit-row metric name a `warn_row` posture emits. */
const PRIOR_RUN_ERROR_METRIC = 'prior_run_read_failed';

/**
 * The declared triggers at one lifecycle position, in declaration order.
 * `staleness.trigger: "none"` yields `[]` — an ungated step, stated rather than implied.
 *
 * @param {object} descriptor
 * @param {'pre_acquisition'|'acquisition'|'post_acquisition'|'pre_compute'} position
 * @returns {object[]}
 */
function triggersAt(descriptor, position) {
  const trigger = descriptor.staleness && descriptor.staleness.trigger;
  if (!Array.isArray(trigger)) return [];
  return trigger.filter((t) => t.position === position);
}

/** The env var name `override.force_run` declares, or null. */
function forceRunEnv(descriptor) {
  const o = descriptor.override;
  if (!o || o === NONE || !o.force_run || o.force_run === NONE) return null;
  return o.force_run;
}

/**
 * Is the declared force override standing? Reads the env ONCE, here, so no compute
 * and no acquisition helper ever touches `process.env` (§5.5 (3)).
 *
 * @param {object} descriptor
 * @param {Record<string,string|undefined>} [env]
 * @returns {boolean}
 */
function forceRunRequested(descriptor, env) {
  const name = forceRunEnv(descriptor);
  if (!name) return false;
  return (env || process.env)[name] === OVERRIDE_ON;
}

/**
 * The `override.accept_anomaly[]` flags (ruling A-5), projected to the ctx shape a
 * compute reads: `RAVINE_ACCEPT_MASS_DELETE` → `accept_mass_delete`. The projection
 * drops a leading vendor/step token when what follows already starts with `accept_`,
 * so the ctx key names the ANOMALY rather than the step that happens to own the var.
 *
 * @returns {{key: string, env: string, check_id: string, standing: boolean}[]}
 */
function acceptAnomalies(descriptor, env) {
  const o = descriptor.override;
  if (!o || o === NONE || !Array.isArray(o.accept_anomaly)) return [];
  const source = env || process.env;
  return o.accept_anomaly.map((a) => ({
    key: overrideKey(a.env),
    env: a.env,
    check_id: a.check_id,
    standing: source[a.env] === OVERRIDE_ON,
  }));
}

/** `XXX_ACCEPT_YYY` → `accept_yyy`; anything else → the lowercased env name. */
function overrideKey(envName) {
  const lower = String(envName).toLowerCase();
  const stripped = lower.replace(/^[a-z0-9]+_(?=accept_)/, '');
  return stripped;
}

/**
 * The full `ctx.overrides` object: every declared accept-anomaly flag plus
 * `force_run`. Frozen — a compute that could flip its own override is a compute
 * whose audit row means nothing.
 */
function resolveOverrides(descriptor, env) {
  const out = Object.create(null);
  for (const a of acceptAnomalies(descriptor, env)) out[a.key] = a.standing;
  out.force_run = forceRunRequested(descriptor, env);
  return Object.freeze(out);
}

/**
 * The prior run's declared emit block — the baseline every drift check and both
 * gate tiers compare against.
 *
 * ⚠️ NOT `.catch(() => null)`. The pre-conversion step swallowed a failed
 * prior-run read into a `log.warn` and a null baseline (LR-D2), which silently
 * downgraded every drift guard to "first run" and forced a full reload with no
 * audit row anywhere. Here the error PROPAGATES and the caller decides — the
 * library's `on_check_error`/ledger path turns it into a visible failure.
 *
 * @param {import('pg').Pool} pool
 * @param {string} pipelineName - the chain-scoped slug run-chain records
 * @param {string|null} emitKey - `emits[0].key`; null returns the whole records_meta
 */
async function readPriorEmit(pool, pipelineName, emitKey) {
  const meta = await sourceVersion.readPriorRunMeta(pool, pipelineName);
  if (!meta) return null;
  if (!emitKey) return meta;
  const block = meta[emitKey];
  return block && typeof block === 'object' ? block : null;
}

/**
 * The DECLARED posture for a failed prior-run read (`staleness.on_prior_run_error`).
 * Absent means `fail_step`: unstated is allowed, silent is not.
 */
function priorRunErrorPosture(descriptor) {
  const s = descriptor.staleness;
  return (s && s !== NONE && s.on_prior_run_error) || POSTURE_FAIL;
}

/**
 * `readPriorEmit` under the declared posture (LR-D2, peel 8a).
 *
 * The pre-conversion step wrote `.catch(warn => null)` here, which is the whole defect:
 * a transient read failure downgraded BOTH gate tiers and EVERY drift guard to "first
 * run" — a full unguarded reload whose ratios all read 0 by definition rather than by
 * measurement — behind one log line and no audit row. The two legal postures are the
 * two honest ones:
 *
 *   · `fail_step` — the baseline is load-bearing, so refuse. The error propagates and
 *     becomes the ledger row's `error_message`.
 *   · `warn_row`  — proceed with no baseline and SAY SO: the caller renders
 *     `priorRunErrorRow()` into the audit table.
 *
 * There is no third arm, and in particular no arm that returns null quietly.
 *
 * @returns {Promise<{prior: object|null, error: Error|null}>}
 */
async function readPriorEmitWithPosture(pool, pipelineName, emitKey, posture) {
  try {
    return { prior: await readPriorEmit(pool, pipelineName, emitKey), error: null };
  } catch (err) {
    if (posture !== POSTURE_WARN_ROW) throw err;
    return { prior: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * The audit row a `warn_row` posture owes. Rendered by the runner into `extraRows`, so
 * it exists ONLY on the failure path and never widens the happy-path audit table.
 */
function priorRunErrorRow(error) {
  return {
    metric: PRIOR_RUN_ERROR_METRIC,
    value: `prior-run read failed, running with NO baseline: ${error && error.message ? error.message : String(error)}`,
    threshold: 'the prior completed run is readable',
    status: 'WARN',
  };
}

/**
 * The tier-1 decision. Delegates the comparison itself to the shared
 * `source-version` lib so the four loaders that already adopted it keep ONE set of
 * semantics; what this adds is the DECLARED half — which position, and the force
 * bypass.
 *
 * @param {object} input
 * @param {object} input.descriptor
 * @param {{lastModified: string|null, etag: string|null}} input.validators
 * @param {object|null} input.prior - the prior run's emit block
 * @param {boolean} input.forced - `forceRunRequested()` (bypasses BOTH triggers)
 * @returns {{skip: boolean, reason: string, trigger: object|null}}
 */
function preAcquisitionDecision({ descriptor, validators, prior, forced }) {
  const triggers = triggersAt(descriptor, 'pre_acquisition');
  if (triggers.length === 0) return { skip: false, reason: 'no_pre_acquisition_trigger', trigger: null };
  if (forced) return { skip: false, reason: 'force_run', trigger: triggers[0] };
  const decision = skipCheckDecision({
    lastModified: validators.lastModified,
    etag: validators.etag,
    prior,
  });
  return { ...decision, trigger: triggers[0] };
}

/**
 * The validator-equality gate, re-homed VERBATIM from the loaders' private
 * wrappers (load-ravines.js:168-173 was the last copy). Same options, same four
 * reasons, byte-identical outputs: `no_prior_run` · `no_validators` ·
 * `unchanged_last_modified` · `unchanged_etag` · `changed`.
 *
 * `contentHashInNoValidatorsBail: false` is the loaders' style and is load-bearing:
 * at the PRE-acquisition position no hash exists yet, so a missing pair of HTTP
 * validators means "no way to tell" and must LOAD.
 *
 * @param {{lastModified: string|null, etag?: string|null, contentHash?: string|null, prior: object|null}} input
 * @returns {{skip: boolean, reason: string}}
 */
function skipCheckDecision({ lastModified, etag = null, contentHash = null, prior }) {
  return sourceVersion.skipCheckDecision(
    { lastModified, etag, contentHash, priorMeta: prior && typeof prior === 'object' ? prior : null },
    { style: sourceVersion.STYLE_VALIDATOR_EQUALITY, contentHashInNoValidatorsBail: false },
  );
}

module.exports = {
  OVERRIDE_ON,
  POSTURE_FAIL,
  POSTURE_WARN_ROW,
  PRIOR_RUN_ERROR_METRIC,
  triggersAt,
  priorRunErrorPosture,
  readPriorEmitWithPosture,
  priorRunErrorRow,
  forceRunEnv,
  forceRunRequested,
  acceptAnomalies,
  overrideKey,
  resolveOverrides,
  readPriorEmit,
  preAcquisitionDecision,
  skipCheckDecision,
};
