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
 * The full `ctx.overrides` object: every declared accept-anomaly flag plus BOTH
 * force flags. Frozen — a compute that could flip its own override is a compute
 * whose audit row means nothing.
 *
 * ⚠️ `force_full` WAS MISSING, AND ITS ABSENCE WAS INVISIBLE (peel 8b, found by
 * executing rather than by reading). `override.force_full` was read in exactly one
 * place — `selectMode`, which uses it to DECIDE the mode — and never surfaced on
 * `ctx.overrides`, so a step declaring a check like `override_force_full_present`
 * observed `ctx.overrides.force_full === undefined` and reported CLEAN on every run,
 * including runs that were forced. Measured: pilot 3's forced FULL relink of
 * 2026-08-27 ran with `full_mode_reason: "force_full_env"` and its
 * `override_force_full_present` row read PASS. That check exists precisely to catch a
 * `LINK_MASSING_FORCE_FULL` left standing in production — a 21.9-minute relink on
 * EVERY subsequent run, plus a `linked_at` bump that re-scopes `enrich_parcels` from
 * 1,395 parcels to 485,135 — so a version of it that cannot fire is the "green
 * because it never looked" class this contract exists to retire. The mode decision was
 * always correct; only the OBSERVATION was blind, which is exactly why the audit row
 * and the decision must read the same source.
 */
/**
 * LW-D15 (2026-08-28) — `dry_run` joins `force_run`/`force_full` on `ctx.overrides`,
 * same reasoning as the `force_full` fix above: `dryRunArgPresent` was ALREADY the
 * single reader (staleness.js), but nothing surfaced its result here, so a compute
 * declaring `override_dry_run_present`-shaped observability had no field to read.
 * `argv` threads through (mirrors `env`) so a test can drive it without mutating
 * `process.argv`; the runner passes nothing and both fall back to the real global.
 */
function resolveOverrides(descriptor, env, argv) {
  const out = Object.create(null);
  for (const a of acceptAnomalies(descriptor, env)) out[a.key] = a.standing;
  out.force_run = forceRunRequested(descriptor, env);
  out.force_full = forceFullRequested(descriptor, env);
  out.dry_run = dryRunArgPresent(descriptor, argv);
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
 * `override.dry_run` when it names an argv flag rather than an env var (G-5, MATCHER
 * pilot 2026-08-28) — the single reader, mirroring `fullArgPresent`. Absent a declared
 * flag, always false: a step whose dry-run is env-driven reads `process.env` through
 * `resolveOverrides`, never through this function.
 */
function dryRunArgPresent(descriptor, argv) {
  const o = descriptor.override;
  const flag = o && o !== NONE && typeof o.dry_run === 'string' && o.dry_run.startsWith('--') ? o.dry_run : null;
  if (!flag) return false;
  return (argv || process.argv).includes(flag);
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
  } else if (trigger.signal === 'config_version' && trigger.variable) {
    // LG-12 / A-3 (MATCHER pilot 2026-08-28) — generalizes link-wsib's own
    // readThresholdVersionSignal/hasThresholdChanged (and
    // compute-parcel-cost-estimates.js's readCostVersionSignals/hasRateOrIndexChanged,
    // the second hand-rolled copy of the identical shape). An operator-edited
    // logic_variables row has no pipeline_runs producer of its own, so the ONLY signal
    // that it moved is its own updated_at — read here, once, by the library, and
    // compared against what THIS step's own prior completed run stamped under the
    // same emit_key (a self-consumed producer/consumer contract, same class as
    // link_massing's code_version/building_footprints_count).
    const { rows } = await pool.query(
      'SELECT updated_at FROM logic_variables WHERE variable_key = $1', [trigger.variable],
    );
    const row = rows[0];
    current = row && row.updated_at ? new Date(row.updated_at).toISOString() : null;
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

/**
 * LG-15 (MATCHER pilot 2026-08-28, Fold A B1 / Fold B item 5) — a STALENESS-DRIVEN
 * GATED SKIP for a LINK/MATCHER (`isCascadeStep`/`isLinkStep`), generalizing
 * `source-version.js`'s `runLedgerGateDecision` — the run-ledger gate `link-wsib.js`,
 * `link-parcel-addresses.js` and `compute-parcel-cost-estimates.js` each hand-rolled a
 * copy of (Phase B B3, 2026-08-16). CONFIRMED genuinely new by the Fold B grounder:
 * `selectMode` above is strictly `full|incremental` — `skip` is not a mode it can
 * express, because a mode gate and a skip-or-not gate are different questions (§1.5),
 * exactly the same axis conflation `preAcquisitionDecision` exists to keep apart for
 * INGESTOR. This is the LINK/MATCHER-side sibling of that split, not a modification of
 * `selectMode` itself.
 *
 * ⚠️ DERIVED SLUGS, NEVER HAND-MAINTAINED (retires the pattern Spec 122 §6.3 names
 * link_wsib's own OWN_SLUGS/UPSTREAM_SLUGS as the tier-0 example of — one of four
 * spellings in `link-wsib.js:55` was already refuted in the same file). `ownSlugs` is
 * every `${chain}:${identity.name}` for each declared `execution.invocation` chain, plus
 * the bare and hyphenated forms (a standalone run, or a legacy writer, may use either).
 * `upstreamSlugs` is the same three-form expansion applied to every `inputs.reads.steps[]`
 * entry, across every declared chain — because EITHER upstream producer moving is a
 * reason to run, regardless of which chain triggered THIS run (W3, monotone invalidation:
 * an upstream reload only ever ADDS rows this step has not seen, never un-links one it has).
 *
 * @param {import('pg').Pool} pool
 * @param {object} descriptor
 * @returns {{own: string[], upstream: string[]}}
 */
function deriveLedgerSlugs(descriptor) {
  const slug = descriptor.identity.name;
  const inv = descriptor.execution && descriptor.execution.invocation;
  const chains = inv && inv !== NONE ? Object.keys(inv) : [];
  const forms = (name) => [
    ...chains.map((c) => `${c}:${name}`),
    name,
    name.replace(/_/g, '-'),
  ];
  const own = [...new Set(forms(slug))];
  const steps = (descriptor.inputs && descriptor.inputs.reads && descriptor.inputs.reads.steps) || [];
  const upstream = [...new Set(steps.flatMap((s) => forms(s.step)))];
  return { own, upstream };
}

/**
 * THE GATED-SKIP DECISION (LG-15). Folds THREE signals into one skip/run answer:
 *   1. the run-ledger gate itself (own-last vs upstream activity since then)
 *   2. any declared `config_version` trigger's own version signal (A-3/LG-12) — an
 *      upstream-silent gate must still RUN when an operator-edited tunable moved
 *   3. the caller's own bypass (`--dry-run` / `override.force_full`), which the
 *      caller resolves and passes as `bypassed` — mirrors link-wsib.js's own
 *      `bypassGate = dryRun || forceFull` (A2 fix), generalized rather than re-derived
 *
 * Returns `{skip: false, ...}` immediately when `bypassed` — a bypass ALWAYS executes,
 * never SKIP, matching G-5's guarantee.
 *
 * @param {import('pg').Pool} pool
 * @param {object} descriptor
 * @param {{chainId: string|null, now: Date, bypassed: boolean}} opts
 */
async function ledgerGatedSkip(pool, descriptor, { now = null, bypassed = false } = {}) {
  if (bypassed) return { skip: false, reason: 'bypassed', gate: null, configVersionChanged: false };
  const { own, upstream } = deriveLedgerSlugs(descriptor);
  const gate = await sourceVersion.runLedgerGateDecision(pool, { ownSlugs: own, upstreamSlugs: upstream, now });
  const configTriggers = triggersAt(descriptor, 'pre_compute').filter((t) => t.signal === 'config_version');
  let configVersionChanged = false;
  const configSignals = [];
  for (const t of configTriggers) {
    const measured = await measureTrigger(pool, descriptor, t);
    const baseline = gate.ownLastRecordsMeta && gate.ownLastRecordsMeta[measured.key] !== undefined
      ? String(gate.ownLastRecordsMeta[measured.key]) : null;
    // Fail-safe like hasThresholdChanged: no baseline at all (gate.ownLastRecordsMeta
    // is null, i.e. no prior completed own run) means CHANGED, never "unchanged".
    const changed = !gate.ownLastRecordsMeta || baseline !== measured.current;
    configSignals.push({ ...measured, prior: baseline, changed });
    if (changed) configVersionChanged = true;
  }
  return {
    skip: gate.skip && !configVersionChanged,
    reason: configVersionChanged ? 'config_version_changed' : gate.reason,
    gate,
    configVersionChanged,
    configSignals,
  };
}

/**
 * THE CLOSED `records_meta.gate` SHAPE (LPA-D4, 2026-08-29). `ledgerGatedSkip`'s decision
 * reasoned about WHY a run skipped or ran — own/upstream slugs compared, the upstream
 * ledger window's activity counts, own last-completed baseline — but that reasoning only
 * ever reached `log.info` (`runCascadePhase`/`runMaterializePhase`, scripts/lib/step/
 * index.js), never `records_meta`. A broken always-unchanged gate (a bug that makes
 * `no_upstream_changes` fire on EVERY run) was therefore indistinguishable from a healthy
 * quiet one from the persisted record alone — the descriptor-level `gate_decision`
 * `when:"pre"` check (Rule 1 rung (b)) is the PRIMARY fix; this is the belt-and-suspenders
 * library one (rung (d)), so the reason is ALSO queryable straight off `records_meta`
 * without parsing `audit_table` rows, for every archetype whose gate can genuinely skip.
 *
 * ONE shape, built here, merged onto `records_meta.gate` at every call site that reaches
 * `ledgerGatedSkip` (`runCascadePhase`, `runMaterializePhase`) plus INGESTOR's own,
 * structurally different, `preAcquisitionDecision` gate (thinner: no ledger slugs/
 * timestamps exist for that mechanism, so `gatedSkip` is omitted there and the shape
 * degrades to `{reason, gated_skip}` only). `runLinkPhase` (LINK archetype, e.g.
 * `link_massing`) is DELIBERATELY OUT OF SCOPE: it drives `selectMode`'s tri-state
 * full/incremental decision, never a skip — it has no `terminals[].kind === "skip_gated"`
 * entry in any converted descriptor, and stamping a `gated_skip` field for a mechanism
 * that cannot skip would misrepresent the axis.
 *
 * @param {object} descriptor
 * @param {{mode: string|null, reason: string, skipped: boolean}|null} gate - `stepCtx.gate`
 * @param {object|null} gatedSkip - the return of `ledgerGatedSkip`, when the caller has one
 */
function gateRecordsMeta(descriptor, gate, gatedSkip) {
  const base = {
    reason: gate ? gate.reason : null,
    gated_skip: Boolean(gate && gate.skipped),
  };
  if (!gatedSkip || !gatedSkip.gate) return base;
  const slugs = deriveLedgerSlugs(descriptor);
  return {
    ...base,
    own_slugs: slugs.own,
    upstream_slugs: slugs.upstream,
    own_last_completed_at: gatedSkip.gate.ownCompleted,
    upstream_non_completed: gatedSkip.gate.nonCompleted,
    upstream_completed_with_changes: gatedSkip.gate.completedWithChanges,
    upstream_stale_running: gatedSkip.gate.staleRunningUpstream,
  };
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
  deriveLedgerSlugs,
  ledgerGatedSkip,
  gateRecordsMeta,
  dryRunArgPresent,
};
