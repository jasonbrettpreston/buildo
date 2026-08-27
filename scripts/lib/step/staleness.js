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

/**
 * THE ONE PLACE `--full` IS READ (LG-10, LINK pilot 2026-08-27).
 *
 * ⚠️ WHY THIS EXISTS AND WHY IT IS HERE. `--full` arrives from
 * `manifest.chain_args`, and before the conversion the only reader was
 * `pipeline.isFullMode()` — `process.argv.includes('--full')` ONE CALL FRAME ABOVE the
 * step. The frozen file shape (§5.1) permits no such call, and §5.5 (3) forbids a
 * compute from touching argv, so after conversion NOBODY reads it: the flag the
 * `sources` chain passes would become inert and every sources run would silently go
 * incremental. That is a gating change disguised as a refactor.
 *
 * ⚠️ AND NO LINTER CAN SEE THE OLD SHAPE (C-12). `compute-shape.yml` matches
 * `process.env`, not `process.argv`, and an argv read one frame up is invisible to any
 * regex over the compute. So the rule is structural instead: argv is read HERE, once,
 * by the runner, and the value reaches the compute only as `ctx.gate.explicit_full`.
 */
const FULL_ARG = '--full';

/**
 * The `staleness.mode_select` value this gate implements. Asserted rather than assumed:
 * a descriptor that declares `skip` and is driven through `selectMode` would get a
 * full-vs-incremental answer to a skip-or-not question, which is the axis conflation
 * §1.5 split the category apart to end.
 */
const MODE_SELECT_TRI_STATE = 'tri_state';

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

/** The env var name `override.force_full` declares, or null. */
function forceFullEnv(descriptor) {
  const o = descriptor.override;
  if (!o || o === NONE || !o.force_full || o.force_full === NONE) return null;
  return o.force_full;
}

/** Is the declared FULL override standing? Reads env ONCE, here (§5.5 (3)). */
function forceFullRequested(descriptor, env) {
  const name = forceFullEnv(descriptor);
  if (!name) return false;
  return (env || process.env)[name] === OVERRIDE_ON;
}

/** Did the invocation PERMIT a full run? The single `--full` argv read (LG-10). */
function fullArgPresent(argv) {
  return (argv || process.argv).includes(FULL_ARG);
}

/**
 * Measure one `pre_compute` trigger against the prior completed run's declared emit.
 *
 * Generic by construction: `signal` says WHAT KIND of comparison, `emit_key` says which
 * key of the prior `records_meta` holds the baseline, and `table` (for
 * `upstream_ledger`) says what to count. Nothing here names a step, a domain table or a
 * code-version constant — the step-specific parts are all descriptor data, which is
 * what keeps Gate 0 (#149, "zero new bespoke runner paths") satisfiable.
 *
 * Comparison is by STRING, deliberately: `records_meta` is jsonb and a count that was
 * written as `"427077"` must compare equal to a count read back as `427077`. This is the
 * same String() coercion the pre-conversion gate used, kept byte-for-byte.
 *
 * @returns {Promise<{signal: string, key: string, current: string|null, prior: string|null, changed: boolean}>}
 */
async function measureTrigger(pool, descriptor, trigger) {
  const key = trigger.emit_key || trigger.signal;
  let current = null;
  if (trigger.signal === 'code_version') {
    const v = descriptor.staleness.logic_version;
    current = v && v !== NONE ? String(v) : null;
  } else if (trigger.signal === 'upstream_ledger' && trigger.table) {
    const { rows } = await pool.query(`SELECT COUNT(*)::bigint AS n FROM ${trigger.table}`);
    current = String(rows[0].n);
  }
  return { signal: trigger.signal, key, current, prior: null, changed: false };
}

/**
 * THE MODE-SELECTING GATE (LG-7 / A-1(a), `mode_select: "tri_state"`).
 *
 * §1.5 named this step's gate as the mechanism that forced `staleness` into three axes:
 * "the output is a MODE, not a skip … `on_fingerprint_change` offered only `queue · run`
 * — never 'run in full mode'". `preAcquisitionDecision` answers "skip or not"; this
 * answers "full or incremental", from three inputs that are each declared:
 *
 *   · the INVOCATION (`--full` from `manifest.chain_args`, mirrored in
 *     `execution.invocation.<chain>.argv`) — PERMISSION to rebuild, not a decision
 *   · the OVERRIDE (`override.force_full`) — an operator forcing it unconditionally
 *   · the SIGNALS (`staleness.trigger[]` at `pre_compute`) — whether anything actually
 *     changed since the prior completed run: the code that computes the links, or the
 *     upstream corpus they are computed from
 *
 * ⚠️ THE TRUTH TABLE IS THE PRE-CONVERSION ONE, PORTED VERBATIM (fence 2f3d0e4e,
 * `decideMassingFull`): full ⇔ forced ∨ (permitted ∧ changed). A pure data gate would
 * have silently skipped a predicate FLIP (the b16c036 class), which is why the code
 * signal exists at all; a pure code gate would miss a quarterly corpus reload.
 *
 * ⚠️ FAIL-SAFE DIRECTION, inherited from source-version.js: NO PRIOR RUN ⇒ changed.
 * An unreadable baseline may never resolve to "nothing moved".
 *
 * @returns {Promise<{mode: 'full'|'incremental', reason: string, changed: boolean,
 *   explicit_full: boolean, forced: boolean, signals: object[]}>}
 */
async function selectMode({ descriptor, pool, prior, argv, env }) {
  const declared = descriptor.staleness && descriptor.staleness.mode_select;
  if (declared !== MODE_SELECT_TRI_STATE) {
    throw new Error(`[${descriptor.identity.name}] selectMode answers "full or incremental", and this descriptor `
      + `declares staleness.mode_select "${declared}". Declare "${MODE_SELECT_TRI_STATE}" or do not route this `
      + 'step through the mode gate — a skip-or-not gate and a mode gate are different questions (§1.5).');
  }
  const triggers = triggersAt(descriptor, 'pre_compute');
  const explicitFull = fullArgPresent(argv);
  const forced = forceFullRequested(descriptor, env);
  const signals = [];
  let changed = false;
  let reason = 'unchanged';

  if (!prior) {
    changed = true;
    reason = 'no_prior_run';
  }
  for (const t of triggers) {
    const measured = await measureTrigger(pool, descriptor, t);
    const baseline = prior && prior[measured.key] !== undefined ? String(prior[measured.key]) : null;
    measured.prior = baseline;
    // An ABSENT baseline is not a change: a pre-contract run recorded no such key, and
    // the last completed run WAS a full rebuild under the current logic, so treating the
    // gap as "changed" would force a 21.9-minute relink on every upgrade. A PRESENT
    // baseline that differs IS a change. (Pre-conversion: `prevCode !== undefined &&`.)
    measured.changed = baseline !== null && measured.current !== null && baseline !== measured.current;
    signals.push(measured);
    if (measured.changed && !changed) {
      changed = true;
      reason = `${measured.key}_changed(${baseline}->${measured.current})`;
    }
  }

  const mode = forced || (explicitFull && changed) ? 'full' : 'incremental';
  const modeReason = forced
    ? 'force_full_env'
    : (explicitFull && changed ? `gate:${reason}` : (explicitFull ? `incremental:gate_${reason}` : 'incremental:no_full_arg'));
  return { mode, reason: modeReason, changed, explicit_full: explicitFull, forced, signals };
}

module.exports = {
  OVERRIDE_ON,
  FULL_ARG,
  MODE_SELECT_TRI_STATE,
  POSTURE_FAIL,
  POSTURE_WARN_ROW,
  PRIOR_RUN_ERROR_METRIC,
  triggersAt,
  priorRunErrorPosture,
  readPriorEmitWithPosture,
  priorRunErrorRow,
  forceRunEnv,
  forceRunRequested,
  forceFullEnv,
  forceFullRequested,
  fullArgPresent,
  measureTrigger,
  selectMode,
  acceptAnomalies,
  overrideKey,
  resolveOverrides,
  readPriorEmit,
  preAcquisitionDecision,
  skipCheckDecision,
};
